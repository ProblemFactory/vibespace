#!/usr/bin/env node
// B-c87d — THE KEYBOARD STAYS WHERE THE PERSON LAST PUT IT (the coordinator's law, 2026-11-20). A conversation window that finished
// opening took the keyboard from the window the person clicked in the meantime: what they typed went, unseen, into the other
// conversation's composer. Now ONE pure verdict (src/lib/keyboard-yield.js lateFocusTakes) decides, ONE door asks it
// (src/lib/late-focus.js lateFocus / mayTakeKeys), and the person's acts are the page's own stamps (src/lib/utils.js lastPersonAct —
// the two capture listeners, no listener of the door's own). A late focus that lost the race is DROPPED, never queued.
//   §1 the verdict's table — and the base's rule (every late focus taken) refused by it
//   §2 where an act lands: insideWindow over a stand-in frame (its own content, its chrome, its own taskbar item; another tab's
//      content in the same frame is elsewhere)
//   §3 THE DOOR, driven: the page's two capture listeners caught on a stand-in window, the REAL door over stand-in views: the common
//      road (the act that started the open — a pressed resume too, whatever ids it reuses), the race lost (a press, a key typed into a
//      box elsewhere), what is NO act (a modifier alone, a key on the page's body, a synthetic event), a press inside the opening window
//      or on its own taskbar item, an embedded page holding the keys, the open's fact (a boot, another device's record, a quiet open),
//      the predicate form
//   §4 THE CENSUS (r364 MUST 2): every focus after an await, a timer or a reply in the page's code (src/lib, read by acorn: after an
//      await in its function, in a callback handed to then / finally / catch / setTimeout / rAF / queueMicrotask / a ws request /
//      onGlobal, or inside a function CALLED from such a place or registered by name — followed within its file) is through the door,
//      or NAMED: file by file with its count, and in the window, chat and terminal code by its words with how many times; a new one, a
//      changed count or a row no call carries is red BY NAME; the door's sites stand by their words; RED CONTROLS plant each kind
// The heavy twin: scripts/test-late-focus-chrome.mjs (a real page: a window opened, another clicked while it opens, typed).
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { checker } from './lib/check.mjs';
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(repo, 'package.json'));
const acorn = require('acorn');
const { ok, report } = checker();
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf8');
const J = JSON.stringify;
const tick = () => new Promise((r) => setTimeout(r, 3));

// the page's two capture listeners, caught where utils.js registers them: a stand-in window BEFORE the first import of utils.js
const HANDLERS = {};
globalThis.window = { addEventListener: (type, fn) => { (HANDLERS[type] ||= []).push(fn); } };
const KY = await import('../src/lib/keyboard-yield.js');
const LF = await import('../src/lib/late-focus.js');
const UT = await import('../src/lib/utils.js');
const RP = await import('../src/lib/resume-pacer.js');
// …and a stand-in document only AFTER the imports (utils.js installs its tooltip at import when a document exists); the door reads
// it when it is called: no app dialog open, nothing focused
globalThis.document = { querySelectorAll: () => [], activeElement: null };

console.log('§1 the verdict (PURE keyboard-yield.js lateFocusTakes)');
const ROWS = [
  ['no act on the page yet: the window takes the keys', { since: 100, act: null }, 'take'],
  ['the act that STARTED the open lies before it: taken (the common road)', { since: 100, act: { at: 90, inside: false } }, 'take'],
  ['an act at the very instant the open began is not after it', { since: 100, act: { at: 100, inside: false } }, 'take'],
  ['a press into the opening window itself after it began: taken', { since: 100, act: { at: 120, inside: true } }, 'take'],
  ['a press or a key ELSEWHERE after the open began: dropped', { since: 100, act: { at: 120, inside: false } }, 'drop'],
  ['a boot restore (since = the page start) before the person acted: taken', { since: 0, act: null }, 'take'],
  ['a replay (since = the page start) after the person acted elsewhere on the page: dropped', { since: 0, act: { at: 5, inside: false } }, 'drop'],
  ['a missing start counts from the page start', { act: { at: 5, inside: false } }, 'drop'],
  ['an act without a time is no act', { since: 100, act: { at: Number.NaN, inside: false } }, 'take'],
];
const badRows = ROWS.filter(([, a, w]) => KY.lateFocusTakes(a) !== w).map(([n, a, w]) => `${n}: ${KY.lateFocusTakes(a)} (want ${w})`);
ok(badRows.length === 0, `the verdict's ${ROWS.length} rows: the keys stay where the person last put them (${ROWS.filter((r) => r[2] === 'drop').length} drops, ${ROWS.filter((r) => r[2] === 'take').length} takes)`, badRows);
const BASE_RULE = () => 'take';   // the base: a late focus took the keys whatever the person did since (only a dialog kept them)
const baseFails = ROWS.filter(([, a, w]) => BASE_RULE(a) !== w).map(([n]) => n);
ok(baseFails.length === 3, `CONTROL: the base's rule (every late focus taken) is refused by the table — ${baseFails.length} rows: ${baseFails.join(' · ')}`, baseFails);

console.log('§1b THE DEFAULT IS SAFE (r671 + r673): a start nobody handed never takes the keys out of a field the person is in');
const LAW = [
  ['an UNHANDED start, a field elsewhere holds the focus, no act since: dropped', { since: 100, act: { at: 90, inside: false }, handed: false, field: true }, 'drop'],
  ['a HANDED start (by the act or a road), the same focus, no act since: taken — the clock rule, exactly', { since: 100, act: { at: 90, inside: false }, handed: true, field: true }, 'take'],
  ['an unhanded start, the focus on the page body: taken', { since: 100, act: { at: 90, inside: false }, handed: false, field: false }, 'take'],
  ['a handed start, an act elsewhere after it: dropped — the clock rule kept', { since: 100, act: { at: 120, inside: false }, handed: true, field: false }, 'drop'],
  ['an unhanded start from the page\'s start, nothing pressed yet, a field elsewhere: dropped', { since: 0, act: null, handed: false, field: true }, 'drop'],
  ['the PURE default is safe: no `handed` said ⇒ unhanded', { since: 100, act: null, field: true }, 'drop'],
];
const badLaw = LAW.filter(([, a, w]) => KY.lateFocusTakes(a) !== w).map(([n, a, w]) => `${n}: ${KY.lateFocusTakes(a)} (want ${w})`);
ok(badLaw.length === 0, `the law's ${LAW.length} rows: an unhanded start never takes the keys from a field the person is in; a handed one keeps the clock rule`, badLaw);
const CLOCK_ALONE = (a) => KY.lateFocusTakes({ since: a.since, act: a.act, handed: true });   // the round before: the clock alone (the law taken out)
const lawFails = LAW.filter(([, a, w]) => CLOCK_ALONE(a) !== w).map(([n]) => n);
ok(lawFails.length === 3, `CONTROL: the clock alone (the law taken out) is refused by the law's rows — ${lawFails.length}: ${lawFails.join(' · ')}`, lawFails);

console.log('§1c THE ACT A PERSON IS DOING RIGHT NOW (r673): the page\'s current event, a closed list of a person\'s input kinds, trusted only');
const evOf = (type, o = {}) => ({ type, isTrusted: true, timeStamp: 50, ...o });
const KIND_ROWS = [
  ...['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'touchend', 'keydown', 'keyup', 'submit', 'change', 'paste', 'drop'].map((k) => [`a ${k} the browser dispatched: a person's input`, evOf(k), true]),
  ...['message', 'load', 'transitionend', 'animationend', 'focus', 'focusin', 'blur', 'visibilitychange', 'scroll', 'input', 'popstate', 'resize', 'error'].map((k) => [`a ${k} (a hub message, a load, a transition, a focus or visibility change…): no act`, evOf(k), false]),
  ['a click a SCRIPT dispatched (untrusted): no act', evOf('click', { isTrusted: false }), false],
  ['no current event (outside any dispatch — across an await or a timer — or a browser that does not expose it): no act', undefined, false],
];
const badKinds = KIND_ROWS.filter(([, e, w]) => !!KY.actOpenStart(e, 100) !== w).map(([n]) => n);
ok(badKinds.length === 0, `bound 1: ${KIND_ROWS.filter((r) => r[2]).length} kinds count as the person's act, ${KIND_ROWS.filter((r) => !r[2]).length} rows do not`, badKinds);
const widened = (e) => (e && e.isTrusted === true && [...KY.ACT_EVENT_KINDS, 'message'].includes(e.type) ? { at: 1, by: 'act' } : null);
const wideFails = KIND_ROWS.filter(([, e, w]) => !!widened(e) !== w).map(([n]) => n);
ok(wideFails.length === 1 && /^a message/.test(wideFails[0]), 'CONTROL: the list widened by ONE kind (a hub message counted as an act) is red by that row', wideFails);
ok(Object.isFrozen(KY.ACT_EVENT_KINDS) && KY.ACT_EVENT_KINDS.length === 15, `the list is CLOSED: frozen, ${KY.ACT_EVENT_KINDS.length} kinds (${KY.ACT_EVENT_KINDS.join(', ')})`);
const i1 = KY.actOpenStart(evOf('keydown', { timeStamp: 42 }), 100), i2 = KY.actOpenStart(evOf('keydown', { timeStamp: 1.7e12 }), 100);
ok(!!i1 && i1.at === 42 && i1.by === 'act' && !!i2 && i2.at === 100, 'bound 2: the start is the act\'s OWN instant on the page\'s clock (its timeStamp), not the moment the maker runs; a timeStamp off this clock (an epoch) falls to now', { i1, i2 });

console.log('§1d A FIELD THAT IS HIDDEN OR GONE IS NO FIELD (r871, PURE keyboard-yield.js fieldHoldsKeys)');
const FIELD_ROWS = [
  ['a typing field outside the opening window, in the page and drawn: it holds the keys', { typing: true, connected: true, drawn: true, inside: false }, true],
  ['…the same field HIDDEN (a dialog hid with the person\'s Enter in it): no field', { typing: true, connected: true, drawn: false, inside: false }, false],
  ['…the same field GONE from the page: no field', { typing: true, connected: false, drawn: true, inside: false }, false],
  ['…the same field on ANOTHER virtual desktop (its box kept, hidden by visibility): no field', { typing: true, connected: true, drawn: true, visible: false, inside: false }, false],
  ['a field inside the opening window: not elsewhere', { typing: true, connected: true, drawn: true, inside: true }, false],
  ['no typing field (a button, the body): no field', { typing: false, connected: true, drawn: true, inside: false }, false],
];
const badField = FIELD_ROWS.filter(([, a, w]) => KY.fieldHoldsKeys(a) !== w).map(([n]) => n);
ok(badField.length === 0, `the field fact's ${FIELD_ROWS.length} rows: only a field still in the page and drawn, outside the opening window, holds the person's keys`, badField);
const CURE_RULE = (a) => !!a.typing && !a.inside;   // r673's rule (a field counted whether or not it was drawn)
const fieldFails = FIELD_ROWS.filter(([, a, w]) => CURE_RULE(a) !== w).map(([n]) => n);
ok(fieldFails.length === 3 && fieldFails.every((n) => /HIDDEN|GONE|ANOTHER/.test(n)), `RED: r673's rule (a field drawn or not) is refused by the hidden, the gone and the other desktop's rows — ${fieldFails.join(' · ')}`, fieldFails);
const DRAWN_RULE = (a) => !!a.typing && a.connected !== false && a.drawn !== false && !a.inside;   // r871's rule (drawn, but not «visible»)
const drawnFails = FIELD_ROWS.filter(([, a, w]) => DRAWN_RULE(a) !== w).map(([n]) => n);
ok(drawnFails.length === 1 && /ANOTHER/.test(drawnFails[0]), `RED (r945): «drawn» without «visible» (r871's rule) is refused by the other desktop's row — ${drawnFails.join(' · ')}`, drawnFails);

console.log('§2 where an act lands (late-focus.js insideWindow)');
class N {
  constructor(cls = '', tag = 'DIV') { this.cls = cls; this.tagName = tag; this.kids = []; this.parent = null; this.dataset = {}; }
  add(...ks) { for (const k of ks) { k.parent = this; this.kids.push(k); } return this; }
  contains(x) { for (let n = x; n; n = n.parent) if (n === this) return true; return false; }
  matches(sel) { if (sel === '[data-win-id]') return this.dataset.winId != null; return sel.split(',').map((x) => x.trim().replace(/^\./, '')).includes(this.cls); }
  closest(sel) { for (let n = this; n; n = n.parent) if (n.matches(sel)) return n; return null; }
  querySelectorAll(sel) { const out = []; const walk = (n) => { for (const k of n.kids) { if (k.matches(sel)) out.push(k); walk(k); } }; walk(this); return out; }
}
const frame = new N('window'), title = new N('window-titlebar'), contA = new N('window-content'), contB = new N('window-content');
const inA = new N('chat-input', 'TEXTAREA'), inB = new N('chat-input', 'TEXTAREA'), outside = new N('sidebar');
frame.add(title, contA.add(inA), contB.add(inB));
const taskbar = new N('taskbar'), itemA = new N('taskbar-item'), itemOther = new N('taskbar-item');
itemA.dataset.winId = 'wA'; itemOther.dataset.winId = 'wZ'; taskbar.add(itemA, itemOther);
const WA = { id: 'wA', element: frame, content: contA }, WB = { id: 'wB', element: frame, content: contB };
const where = [
  ['a press in its own content', LF.insideWindow(WA, inA), true],
  ['a press on its frame\'s title bar', LF.insideWindow(WA, title), true],
  ['a press in ANOTHER tab\'s content of the same frame', LF.insideWindow(WA, inB), false],
  ['…which is inside that other tab', LF.insideWindow(WB, inB), true],
  ['a press on its OWN taskbar item (raising it while it opens)', LF.insideWindow(WA, itemA), true],
  ['a press on ANOTHER window\'s taskbar item', LF.insideWindow(WA, itemOther), false],
  ['a press outside the frame (the sidebar)', LF.insideWindow(WA, outside), false],
  ['a part of a window given as { content }', LF.insideWindow({ content: contA }, inA), true],
  ['no window: nothing is inside', LF.insideWindow(null, inA), false],
];
const badWhere = where.filter(([, g, w]) => g !== w).map(([n, g]) => `${n}: ${g}`);
ok(badWhere.length === 0, `insideWindow's ${where.length} rows: a window's own content, its chrome and its own taskbar item are inside; another tab's content in the same frame, another window's item, the sidebar are elsewhere`, badWhere);

console.log('§3 THE DOOR, driven (the page\'s capture listeners on a stand-in window, the real door)');
ok((HANDLERS.pointerdown || []).length === 1 && (HANDLERS.keydown || []).length === 1, `the person's acts ride the page's two capture listeners (pointerdown ${(HANDLERS.pointerdown || []).length}, keydown ${(HANDLERS.keydown || []).length}) — the door adds none`);
const pressAt = (target, extra = {}) => HANDLERS.pointerdown.forEach((h) => h({ target, ...extra }));
const keyAt = (target, key = 'x', extra = {}) => HANDLERS.keydown.forEach((h) => h({ target, key, ...extra }));
const view = () => ({ n: 0, focus() { this.n++; } });
const sidebar = new N('session-row'), frameC = new N('window'), contC = new N('window-content'), composerC = new N('chat-input', 'TEXTAREA');
frameC.add(contC.add(composerC));
const WC = { id: 'wC', element: frameC, content: contC };
const boot = view();
ok(LF.lateFocus(boot, { win: WC, since: LF.PAGE_START }) === true && boot.n === 1, 'a boot restore before the person acted on the page takes the keys (the start is the page\'s)');
pressAt(sidebar); await tick();
const t1 = LF.openClock(); const v1 = view(); await tick();
ok(LF.lateFocus(v1, { win: WC, since: t1 }) === true && v1.n === 1, 'THE COMMON ROAD: the press that started the open (a sidebar row), then nothing else — the new window gets the keys, as before');
// MUST 1 (r364): a PRESSED RESUME reuses its row's id — its start is still NOW (the fact, not the id): the press on the old window's
// Resume button (detached by the reopen) lies before it, so the resumed composer takes the keys
const oldWin = new N('window'), resumeBtn = new N('resume-bar'); oldWin.add(resumeBtn);
pressAt(resumeBtn); oldWin.kids.length = 0; resumeBtn.parent = null; await tick();
const resumeAt = LF.unattendedOpen({ layoutManager: { _booting: false, _applying: false } }, false) ? LF.PAGE_START : LF.openClock(); const vR = view(); await tick();
ok(resumeAt > 0 && LF.lateFocus(vR, { win: WC, since: resumeAt }) === true && vR.n === 1, 'MUST 1: a PRESSED RESUME (it reuses its row\'s id) starts NOW — the press on the old window\'s Resume button counts as inside it, the resumed composer takes the keys');
const facts = [
  ['a pressed open (no boot, no other device\'s record, not quiet)', LF.unattendedOpen({ layoutManager: {} }, false), false],
  ['the layout\'s boot restore while it runs (the splash over the page)', LF.unattendedOpen({ layoutManager: { _booting: true, _bootRestoring: true } }, false), true],
  // the boot's 5 s AUTOSAVE tail: the restore ended, the splash is gone — a person's press opens windows there, and it is theirs
  ['a pressed open in the boot\'s 5 s autosave tail (the restore ended)', LF.unattendedOpen({ layoutManager: { _booting: true, _bootRestoring: false } }, false), false],
  ['a record from another device being applied', LF.unattendedOpen({ layoutManager: { _applying: true } }, false), true],
  ['an open nobody pressed (quiet)', LF.unattendedOpen({ layoutManager: {} }, true), true],
];
const badFacts = facts.filter(([, g, w]) => g !== w).map(([n, g]) => `${n}: ${g}`);
ok(badFacts.length === 0, `«nobody on this page started it» is a FACT of the page (${facts.length} rows: the boot restore, its tail, another device's record, quiet) — never the id an open reuses`, badFacts);
// RED CONTROL: the round's first shape (the whole `_booting` span — the heavy page's ④ opened inside its tail and lost its keys)
// misjudges the person's own open in the tail
const firstShape = (app, quiet = false) => !!quiet || !!app?.layoutManager?._booting || !!app?.layoutManager?._applying;
const tailRow = facts.find(([n]) => /autosave tail/.test(n));
ok(firstShape({ layoutManager: { _booting: true, _bootRestoring: false } }, false) === true && !!tailRow && tailRow[1] === false,
  'RED CONTROL: the whole `_booting` span calls a person\'s own open in the boot\'s tail «nobody\'s» (its start the page\'s: the press that opened it counts as elsewhere) — the tail row refuses it');
// …and the page holds the fact where the restore runs: layout.js raises `_bootRestoring` with `_booting` before loadAutoSave's first
// await and lowers it when the restore ends (where the resume-all collector is disarmed), BEFORE the 5 s autosave timer
{
  const L = read('src/lib/layout.js'), a = L.indexOf('  async loadAutoSave() {'), b = L.indexOf('\n  }\n', a), body = a < 0 || b < 0 ? '' : L.slice(a, b);
  const up = body.indexOf('this._bootRestoring = true;'), firstAwait = body.indexOf('await '), down = body.indexOf('this._bootStoppedSessions = null; this._bootRestoring = false;'), tail = body.indexOf('setTimeout(() => { this._restoring = false; this._booting = false; }, 5000);');
  ok(!!body && up > 0 && firstAwait > up && down > firstAwait && tail > down && /this\._booting = false; this\._bootRestoring = false;/.test(L.slice(0, a)),
    'layout.js: the boot restore\'s own span — raised before loadAutoSave\'s first await, lowered when the restore ends and before the 5 s autosave tail; born false', { up, firstAwait, down, tail });
}
// r558 MUST — THE START IS THE PRESS. The Resume bar asks the account first (a refresh raced against 3 s); the resume and the create
// come after it. A press into another conversation's composer (and typing) during that wait is an act ELSEWHERE after the open began.
{
  pressAt(sidebar); const atPress = LF.openClock();   // chat-view _resumeAndClose's `at`: read at the press
  await tick();                                        // the account check's wait
  pressAt(inA); keyAt(inA, 'h'); await tick();         // the person clicks into another composer and types
  const atCreate = LF.openClock();                     // where the create read its start before this round
  const vP = view(), vQ = view();
  ok(LF.lateFocus(vP, { win: WC, since: atPress }) === false && vP.n === 0, 'r558 MUST: THE START IS THE PRESS — Resume pressed, then (during the account check\'s wait) a press into another composer and typing: the resumed composer\'s late focus is DROPPED, the keys stay there');
  ok(LF.lateFocus(vQ, { win: WC, since: atCreate }) === true && vQ.n === 1, 'RED CONTROL: the start read at the create (after the wait) — the resumed composer takes the keys from the box the person typed in');
}
// …and every pressed road HANDS ITS PRESS ON as the open's start (the Resume bar, the resume's roads, the makers, a desktop switch's
// replay, a preset, the four roads that wait for a kill or a live CLI, the For-you reply); r673: the makers open at ONE start fact
const pressRoads = ({ cv, sl, lj, ut, ap, ma, sf, ai, rp }) => {
  const body = (src, head) => { const a = src.indexOf(head); if (a < 0) return ''; const b = src.indexOf('\n  }', a + head.length); return b < 0 ? '' : src.slice(a, b); };
  const arrow = (src, head) => { const a = src.indexOf(head); if (a < 0) return ''; const b = src.indexOf('\n  };', a); return b < 0 ? '' : src.slice(a, b); };
  const beforeAwait = (b, decl) => { const d = b.indexOf(decl), w = b.indexOf('await '); return d > 0 && (w < 0 || d < w); };
  const rac = body(cv, '  _resumeAndClose({'), rs = body(sl, '  resumeSession(sessionId, cwd, sessionName, {'), rst = body(lj, '  async restoreState(state) {'), lp = body(lj, '  async loadPreset(name) {');
  const rcip = body(sl, '  restartConversationInPlace(sessLike = {}) {'), rwp = body(cv, '  _restartWithPermission(mode) {'), rsw = body(cv, '  _resendWaiting(');
  const pr = arrow(ut, '  const postReply = async ('), orp = arrow(ut, '  const openReopened = (');
  return [
    ['the Resume bar reads its start AT THE PRESS, before the account check', /^  _resumeAndClose\(\{ accountId, asked = false, at = this\.app\?\._openStartNow\?\.\(\) \} = \{\}\) \{/.test(rac) && rac.indexOf('resumeAccountCheck(') > 0],
    ['…hands it through the account check\'s answer', rac.includes('this._resumeAndClose({ asked: true, at })')],
    ['…and into the resume', /this\.app\.resumeSession\(backendSessionId, cwd, name, \{[\s\S]*\n      fromWin: this\.winInfo\?\.id,\n      backendSessionId, openAt: at,/.test(rac)],
    ['the resume hands it to the create, the live row\'s attach and a standing window (with its own fact and the page\'s)', /\n\s+openAt, \/\/ B-c87d r558/.test(rs) && rs.includes('hostId, openAt });') && rs.includes('{ replay: !!syncId, unattended: unattended || stay || unattendedOpen(this), at: openAt })')],
    ['the create and the attach open at THE ONE START FACT (the act now, a road\'s start, the replay\'s, else unhanded)', (sl.match(/const openAt = openStart\(this, \{ quiet, given: pressAt \}\);/g) || []).length === 2],
    ['a desktop switch\'s replay reads its start before its reads; its opens\' loop carries it (a synchronous span, cleared in its finally)', beforeAwait(rst, 'const replayAt = this.app._openStartNow?.()') && rst.indexOf("this.app._replayStart = replayAt && typeof replayAt === 'object' ? replayAt : null;") > 0 && rst.indexOf('this.app._replayStart = replayAt &&') < rst.indexOf('for (const ws of state.windows)') && /\} finally \{\n\s+this\.app\.wm\._restoring = false; this\.app\._replayStart = null;/.test(rst)],
    ['a preset the person loads, likewise (two attaches, one resume)', beforeAwait(lp, 'const presetAt = this.app._openStartNow?.()') && (lp.match(/openAt: presetAt/g) || []).length === 3],
    ['an attach meeting one in flight: a quiet one renews nothing, a road\'s start renews to it', sl.includes('    if ((unattended || pressAt != null) && this._focusPendingAttach(serverId, { replay: !!(syncId || machine), unattended, at: openAt })) return null;')],
    ['r671: the billing switch reads its start at its press, before the kill, and hands it to its finish', /\n      const at = this\._openStartNow\(\);[^\n]*\n      const finish = \(\) => this\.resumeSession\(backendSessionId, cwd, name, \{[^\n]*openAt: at \}\);/.test(sl)],
    ['r671: the in-place restart, likewise', /\n    const at = this\._openStartNow\(\);[^\n]*\n    const finish = \(\) => this\.resumeSession\(cid, [^\n]*openAt: at \}\);/.test(rcip)],
    ['r671: the restart with a permission change reads it before its kill and hands it through its timer', rwp.indexOf('const at = this.app?._openStartNow?.();') > 0 && rwp.indexOf('const at = this.app?._openStartNow?.();') < rwp.indexOf('this.app.killSession(') && rwp.includes('permission: mode, openAt: at,')],
    ['r671: the re-send reads it at its press and carries it through the live CLI\'s wait', /^  _resendWaiting\(at\) \{[^\n]*\n    if \(at === undefined\) at = this\.app\?\._openStartNow\?\.\(\);/.test(rsw) && rsw.includes('this._resendWaiting(at); }); return; }') && rsw.includes('openAt: at,')],
    ['r671: the For-you reply reads it before its network wait and hands it to the reopened conversation', beforeAwait(pr, 'const at = app._openStartNow?.();') && (pr.match(/openReopened\(r, at\)/g) || []).length === 2 && orp.includes('openAt: at };')],
    ['r671: the «already live» answer attaches with the create\'s start and its quiet', sl.includes('            openAt, ...(quiet ? { quiet: true } : {}),')],
    ['r871: New Session\'s Create reads its start at the press, before the path\'s commit, and hands it to the create', (() => { const b = ap.slice(ap.indexOf("document.querySelector('#dialog-new-session .btn-create').addEventListener('click', async (ev) => {")); const d = b.indexOf('const openAt = this._openStartNow?.();'), w = b.indexOf('await '); return d > 0 && d < w && b.includes('this._nsCreated?.(msg, { channels }); }, openAt });'); })()],
    ['r871: Fork reads it before the harness offer\'s wait (r945: and again after an offer the person pressed)', (() => { const b = body(sl, '  async _doForkSession('); const d = b.indexOf('let openAt = this._openStartNow();'), w = b.indexOf('await '), again = b.indexOf("{ const again = this._openStartNow(); if (again && again.by === 'act') openAt = again; }"); if (!(again > w)) return false; return d > 0 && d < w && /this\.createSession\(\{\n\s+cwd: sessionInfo\.cwd,\n\s+name: forkName,\n\s+resumeId,\n\s+mode,\n\s+openAt,/.test(b); })()],
    ['r871: the agents\' two probe terminals read it at their press', (ma.match(/const doTest = \(model = ''\) => \{[^\n]*\n        const openAt = this\._openStartNow\?\.\(\);/g) || []).length === 2 && (ma.match(/mode: 'terminal', cwd: '', openAt, accountId: id, ephemeral: true/g) || []).length === 2],
    ['r871: the setup flow reads it before the folder\'s commit', /const go = async \(mode\) => \{\n\s+const openAt = this\._openStartNow\?\.\(\);[\s\S]{0,700}this\.createSession\(\{ cwd, mode, backend: 'claude', openAt \}\);/.test(sf)],
    ['r871: the app install dialog reads it before the prompt\'s network wait', (() => { const b = ai.slice(ai.lastIndexOf('  form.onsubmit = async (e) => {', ai.indexOf('/api/apps/helper-prompt'))); const d = b.indexOf('const openAt = app._openStartNow?.();'), w = b.indexOf('await '); return d > 0 && d < w && b.includes("app.createSession({ cwd: '', openAt, name:"); })()],
    ['r871: the group\'s Resume all hands the press\'s start to its FIRST member only', rp.includes('return resumePaced(app, stopped, { extra: { openAt: app._openStartNow?.() }, later: { stay: true, bulk: true } });')],
  ];
};
{
  const S = { cv: read('src/lib/chat-view.js'), sl: read('src/lib/session-lifecycle.js'), lj: read('src/lib/layout.js'), ut: read('src/lib/user-todos-actions.js'),
    ap: read('src/lib/app.js'), ma: read('src/lib/manage-agents.js'), sf: read('src/lib/setup-flows.js'), ai: read('src/lib/app-install-dialog.js'), rp: read('src/lib/resume-pacer.js') };
  const R0 = pressRoads(S);
  ok(R0.every(([, g]) => g), `every pressed road hands its PRESS on as the open's start (${R0.length} rows)`, R0.filter(([, g]) => !g).map(([n]) => n));
  // CONTROLS: a road planted to hand NOTHING is red by its row, the rest green — the Resume bar, a switch's replay, the billing switch
  const plants = [
    ['the Resume bar', 0, { ...S, cv: S.cv.replace('  _resumeAndClose({ accountId, asked = false, at = this.app?._openStartNow?.() } = {}) {', '  _resumeAndClose({ accountId, asked = false } = {}) {') }],   // stale-pins: kept (the base's text, planted)
    ['a switch\'s replay', 5, { ...S, lj: S.lj.replace("this.app._replayStart = replayAt && typeof replayAt === 'object' ? replayAt : null; ", '') }],
    ['the billing switch', 8, { ...S, sl: S.sl.replace(', onCreateResult: persistOnSuccess, openAt: at });', ', onCreateResult: persistOnSuccess });') }],   // stale-pins: kept (the base's text, planted)
    ['New Session', 14, { ...S, ap: S.ap.replace('this._nsCreated?.(msg, { channels }); }, openAt });', 'this._nsCreated?.(msg, { channels }); } });') }],   // stale-pins: kept (the base's text, planted)
  ];
  const plantOut = plants.map(([n, i, P]) => { const R = pressRoads(P); return { n, red: !R[i][1], restGreen: R.every(([, g], j) => j === i || g), changed: P !== S && JSON.stringify(P) !== JSON.stringify(S) }; });
  ok(plantOut.every((x) => x.red && x.restGreen && x.changed), `CONTROL: a road planted to hand nothing is red by its own row, the rest green — ${plantOut.map((x) => `${x.n}: ${x.red ? 'red' : 'GREEN'}`).join(' · ')}`, plantOut);
}
// r871 — THE LANE'S TASK OF ITS OWN: a turn never runs inside its caller's microtasks (the press that settled the turn before it), and
// its hand-off is a message channel (no timer throttle in a hidden tab; a 'message' event is no person's act)
{
  let ran = false;
  const turn = RP.inTurn(() => { ran = true; });
  for (let i = 0; i < 6; i++) await Promise.resolve();
  const early = ran; await turn;
  const PS = read('src/lib/resume-pacer.js');
  ok(early === false && ran === true && /ch = typeof MessageChannel === 'function' \? new MessageChannel\(\) : null;/.test(PS) && /ch\.port1\.onmessage = \(\) => \{ try \{ ch\.port1\.close\(\); \} catch \{ \} r\(\); \};/.test(PS) && !KY.ACT_EVENT_KINDS.includes('message'),
    'r871: a turn of the bulk lane runs in a task of its own (not in its caller\'s microtasks), handed off through a message channel closed when its message lands — a \'message\' event is no act', { early, ran });
}
// r558 (ruled in): a press INTO the opening window's own «Connecting…» body — removed by its answer before the door is asked — lies
// inside that window: the stamp keeps the window part it landed in
{
  const pending = new N('window-pending'); contC.add(pending);
  const t7 = LF.openClock(); await tick(); pressAt(pending);
  contC.kids = contC.kids.filter((k) => k !== pending); pending.parent = null;   // pending.remove(), as the attach's answer does first
  const v7 = view();
  ok(LF.lateFocus(v7, { win: WC, since: t7 }) === true && v7.n === 1, 'r558: a press into the opening window\'s own «Connecting…» body, removed before the answer asks the door — inside: its composer takes the keys');
  ok(LF.insideWindow(WC, pending) === false, 'CONTROL: by where it landed alone (the round\'s stamp), the removed body lies outside every window — the keys were dropped there');
  const pendingA = new N('window-pending'); contA.add(pendingA);
  const t8 = LF.openClock(); await tick(); pressAt(pendingA); contA.kids = contA.kids.filter((k) => k !== pendingA); pendingA.parent = null;
  const v8 = view();
  ok(LF.lateFocus(v8, { win: WC, since: t8 }) === false && v8.n === 0, 'r558: a press into ANOTHER window\'s removed body is still an act elsewhere — dropped');
}
// r671 + r673 — THE DEFAULT IS SAFE, driven: the real door, the page's stamps, the page's current event (window.event), its focus
{
  const box = new N('search-box', 'INPUT'); box.type = 'text';
  const searchWin = new N('window'), searchCont = new N('window-content'); searchWin.add(searchCont.add(box));
  const app0 = { layoutManager: {} };
  // (a) THE CLASS: a road that hands NO start — the person typed into another composer, then an open began (its start read where the
  // open is made), the person still in that composer, the answer lands
  keyAt(inA, 'a'); await tick();
  const late = LF.openStart(app0); globalThis.document.activeElement = inA; await tick();
  const vS = view();
  ok(late.by === null && LF.lateFocus(vS, { win: WC, since: late }) === false && vS.n === 0, 'THE DEFAULT IS SAFE: an open nobody handed a start, the person still in another composer, no act since: DROPPED — the keys stay in the field');
  const vS2 = view();
  ok(LF.lateFocus(vS2, { win: WC, since: { at: late.at, by: 'road' } }) === true && vS2.n === 1, 'RED CONTROL: the same moment with the start vouched for (the clock alone, the law taken out): the opening window takes the keys from the field');
  const vS5 = view();
  ok(LF.lateFocus(vS5, { win: WC, since: late.at }) === false, '…and a BARE number is a start nobody vouches for: the safe default too');
  // (b) the focus on the page body, (c) a field inside the opening window: taken
  globalThis.document.activeElement = globalThis.document.body; const vS3 = view();
  ok(LF.lateFocus(vS3, { win: WC, since: LF.openStart(app0) }) === true, 'an unhanded start with the focus on the page body: taken (no field holds the keys)');
  globalThis.document.activeElement = composerC; const vS4 = view();
  ok(LF.lateFocus(vS4, { win: WC, since: LF.openStart(app0) }) === true, '…and with a field INSIDE the opening window focused: taken');
  // (d) bound 3 — THE ACT: Enter in the Search box opens a hit inside that key (its start the key's instant), and nothing more
  const enter = { type: 'keydown', key: 'Enter', isTrusted: true, timeStamp: LF.openClock(), target: box };
  HANDLERS.keydown.forEach((h) => h(enter));                       // the page's own stamp of that key
  globalThis.window.event = enter; const fromAct = LF.openStart(app0); globalThis.window.event = undefined;
  globalThis.document.activeElement = box; await tick(); const vA = view();
  ok(fromAct.by === 'act' && fromAct.at === enter.timeStamp && LF.lateFocus(vA, { win: WC, since: fromAct }) === true && vA.n === 1, 'bound 3: Enter in the Search box opens a hit (made inside that key: its start is the key\'s own instant) and nothing more — the opened conversation takes the keys from the box');
  // (e) …Enter, then more typing in the box: the keys stay in the box
  const enter2 = { ...enter, timeStamp: LF.openClock() }; HANDLERS.keydown.forEach((h) => h(enter2));
  globalThis.window.event = enter2; const fromAct2 = LF.openStart(app0); globalThis.window.event = undefined;
  await tick(); keyAt(box, 'm'); const vB = view();
  ok(LF.lateFocus(vB, { win: WC, since: fromAct2 }) === false && vB.n === 0, '…Enter and then more typing in the box: the keys stay in the box (a start handed by the act obeys the clock exactly)');
  // (f) bound 5 — no current event: the open is unhanded (the safe default)
  ok(LF.openStart(app0).by === null && LF.startNow().by === null, 'bound 5: where the page\'s current event is not to be had, the open\'s start is unhanded — the safe default');
  // (g) bound 4 — THE RESIDUE: a road waiting on a confirm continues inside the confirm's press: that press is its start
  const confirm = { type: 'click', isTrusted: true, timeStamp: LF.openClock(), target: new N('dialog-ok', 'BUTTON') };
  globalThis.window.event = confirm; const viaConfirm = LF.openStart(app0, { given: { at: 1, by: 'act' } }); globalThis.window.event = undefined;
  ok(viaConfirm.by === 'act' && viaConfirm.at === confirm.timeStamp, 'bound 4: a road\'s open made inside a person\'s LATER press (a confirm: «Resume anyway») takes that press as its start, not the road\'s older one');
  globalThis.window.event = { type: 'message', isTrusted: true, timeStamp: LF.openClock() }; const viaMsg = LF.openStart(app0, { given: { at: 7, by: 'act' } }); globalThis.window.event = undefined;
  ok(viaMsg.by === 'road' && viaMsg.at === 7, '…while an open made inside a hub message\'s dispatch keeps the start its road handed (by the road)');
  globalThis.window.event = { type: 'keydown', isTrusted: true, timeStamp: 5 }; const quietOpen = LF.openStart(app0, { quiet: true }); globalThis.window.event = undefined;
  ok(quietOpen.by === null && quietOpen.at === LF.PAGE_START, '…and an open nobody pressed (quiet) is the page\'s and unhanded, whatever event it is made in');
  // r871: the focused field HIDDEN (a browser that leaves the focus on a dialog's hidden input) or GONE is no field — an unhanded start takes
  const hidden = new N('ns-name', 'INPUT'); hidden.type = 'text'; hidden.getClientRects = () => []; const dlg = new N('dialog'); dlg.add(hidden);
  globalThis.document.activeElement = hidden; const vH = view();
  ok(LF.lateFocus(vH, { win: WC, since: LF.openStart(app0) }) === true && vH.n === 1, 'r871: the focus left on a HIDDEN input (its dialog hid): no field — the unhanded open takes the keys (the person never types into nothing)');
  const gone = new N('ns-name', 'INPUT'); gone.type = 'text'; gone.isConnected = false; globalThis.document.activeElement = gone; const vG = view();
  ok(LF.lateFocus(vG, { win: WC, since: LF.openStart(app0) }) === true && vG.n === 1, '…and on an input GONE from the page: no field — taken');
  const away = new N('composer', 'TEXTAREA'); away.getClientRects = () => [{ width: 10, height: 10 }]; away.checkVisibility = () => false; globalThis.document.activeElement = away; const vV = view();
  ok(LF.lateFocus(vV, { win: WC, since: LF.openStart(app0) }) === true && vV.n === 1, 'r945: the focus left in a composer on ANOTHER virtual desktop (its box kept, hidden by visibility): no field — the unhanded open takes the keys');
  hidden.getClientRects = () => [{ width: 10, height: 10 }]; globalThis.document.activeElement = hidden; const vH2 = view();
  ok(LF.lateFocus(vH2, { win: WC, since: LF.openStart(app0) }) === false && vH2.n === 0, 'CONTROL: the same input DRAWN is a field the person is in — the unhanded open drops');
  globalThis.document.activeElement = null;
}
const t2 = LF.openClock(); await tick(); pressAt(inA); const v2 = view();
ok(LF.lateFocus(v2, { win: WC, since: t2 }) === false && v2.n === 0, 'B-c87d: the open began, then the person PRESSED into another window\'s composer — the late focus is dropped, the keys stay there');
await tick();
ok(v2.n === 0, '…dropped, never queued: nothing focuses it later (the door keeps nothing)');
const t3 = LF.openClock(); await tick(); keyAt(inA); const v3 = view();
ok(LF.lateFocus(v3, { win: WC, since: t3 }) === false && v3.n === 0, 'the open began, then the person TYPED into another window\'s box — dropped');
// THE RULING (r364): a key that lands nowhere is no act elsewhere
const t4a = LF.openClock(); await tick(); keyAt(inA, 'Alt'); keyAt(inA, 'Meta'); keyAt(inA, 'Shift'); const v4a = view();
ok(LF.lateFocus(v4a, { win: WC, since: t4a }) === true && v4a.n === 1, 'THE RULING: a modifier alone (Alt / Meta / Shift — switching programs while a slow attach runs) is no act: taken');
globalThis.document.body = new N('body', 'BODY');
const t4b = LF.openClock(); await tick(); keyAt(globalThis.document.body, 'h'); const v4b = view();
ok(LF.lateFocus(v4b, { win: WC, since: t4b }) === true && v4b.n === 1, 'THE RULING: keys typed onto the page\'s body (typing straight after a row\'s press, before the window is there) are no act: taken');
const t4c = LF.openClock(); await tick(); keyAt(inA, 'x', { isTrusted: false }); pressAt(inA, { isTrusted: false }); const v4c = view();
ok(LF.lateFocus(v4c, { win: WC, since: t4c }) === true && v4c.n === 1, 'a SYNTHETIC key or press (isTrusted false) is no act of the person: taken');
const keyRows = [['a letter into a box', UT.keyIsAct({ key: 'x', target: inA }), true], ['a modifier alone', UT.keyIsAct({ key: 'Control', target: inA }), false], ['onto the body', UT.keyIsAct({ key: 'x', target: globalThis.document.body }), false], ['onto a window\'s content', UT.keyIsAct({ key: 'Enter', target: contA }), true], ['untrusted', UT.keyIsAct({ key: 'x', target: inA, isTrusted: false }), false]];
const badKeys = keyRows.filter(([, g, w]) => g !== w).map(([n, g]) => `${n}: ${g}`);
ok(badKeys.length === 0, `keyIsAct's ${keyRows.length} rows: a key is an act only when it puts the keyboard somewhere`, badKeys);
const t5 = LF.openClock(); await tick(); pressAt(composerC); const v5 = view();
ok(LF.lateFocus(v5, { win: WC, since: t5 }) === true && v5.n === 1, 'the open began, then the person pressed INTO the opening window itself — taken');
const itemC = new N('taskbar-item'); itemC.dataset.winId = 'wC'; taskbar.add(itemC);
const t6 = LF.openClock(); await tick(); pressAt(itemC); const v6 = view();
ok(LF.lateFocus(v6, { win: WC, since: t6 }) === true && v6.n === 1, 'the open began, then the person pressed its OWN taskbar item (raising it while it opens) — taken');
const frameEl = new N('browser-frame', 'IFRAME'); outside.add(frameEl);
globalThis.document.activeElement = frameEl; const t7 = LF.openClock(); await tick(); const v7 = view();
ok(LF.lateFocus(v7, { win: WC, since: t7 }) === false && v7.n === 0, 'an EMBEDDED PAGE outside the opening window holds the keys (a press into a frame the page\'s listeners never see) — dropped');
globalThis.document.activeElement = null;
pressAt(inA); await tick();   // the person's last act: a press ELSEWHERE (the rows above ended inside C: its own taskbar item)
const v8 = view();
ok(LF.lateFocus(v8, { win: WC, since: LF.PAGE_START }) === false && v8.n === 0, 'a boot restore or another device\'s record (since = the page start) after the person acted elsewhere on the page — dropped');
const t9 = LF.openClock(); await tick(); pressAt(inA);
ok(LF.mayTakeKeys({ win: WC, since: t9 }) === false && LF.mayTakeKeys({ win: { element: frame, content: contA }, since: t9 }) === true, 'the predicate form (a view asking before it focuses itself, xpra-view\'s mayFocus): the same verdict');
ok(LF.lateFocus(null, { win: WC, since: 0 }) === false, 'no view: nothing focused, nothing thrown');

console.log('§4 THE CENSUS: every focus after an await, a timer or a reply in the page\'s code — by file, by words, by count');
const LATE_CB = new Set(['then', 'finally', 'catch', 'setTimeout', 'requestAnimationFrame', 'queueMicrotask', 'request', 'onGlobal']);
const PARSED = new Map();   // file → { src, out }: a plant re-reads only the file it changes
const lateFocusesOf = (file, src) => { const hit = PARSED.get(file); if (hit && hit.src === src) return hit.out; const out = lateFocusesRead(src); PARSED.set(file, { src, out }); return out; };
// a focus is LATE when it runs after an await in its own function, inside a callback handed to a late registration, or inside a
// function that is CALLED from such a place or registered BY NAME (`ws.onGlobal(this._handler)`) — followed within its file to a
// fixpoint (the upload's insert after the upload's await; a reply's dispatch). A call inside the door's own arguments
// (`lateFocus({ focus: () => … })`) is through the door; the name `focus` itself is never followed (every focus call is one).
// r945: a bare start in ANY spelling — a read of the clock itself (openClock() / pageClock()), and a door's `since` or a maker's `openAt`
// (or the standing focus' `at`) given a plain number, Date.now() or performance.now(); counted on the tree the census already parsed
function bareStartsIn(ast) {
  const DOORS = new Set(['lateFocus', 'mayTakeKeys', 'goToWinId']), MAKERS = new Set(['createSession', 'attachSession', 'resumeSession', '_attachInRow', 'attachTmuxSession', '_focusExistingSession', '_focusPendingAttach']);
  const nowCall = (v) => !!v && v.type === 'CallExpression' && v.callee.type === 'MemberExpression' && !v.callee.computed && v.callee.property && v.callee.property.name === 'now' && v.callee.object && (v.callee.object.name === 'Date' || v.callee.object.name === 'performance');
  const plain = (v) => !!v && ((v.type === 'Literal' && typeof v.value === 'number') || nowCall(v));
  let n = 0;
  (function walk(node) {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'CallExpression') {
      const c = node.callee, name = c.type === 'Identifier' ? c.name : c.type === 'MemberExpression' && c.property ? c.property.name : null;
      if (name === 'openClock' || name === 'pageClock') n++;
      if (DOORS.has(name) || MAKERS.has(name)) for (const arg of node.arguments) if (arg && arg.type === 'ObjectExpression') for (const p of arg.properties) {
        const k = p.key && (p.key.name || p.key.value);
        if ((k === 'since' || k === 'openAt' || (k === 'at' && MAKERS.has(name))) && plain(p.value)) n++;
      }
    }
    for (const k of Object.keys(node)) { if (k === 'loc') continue; const v = node[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v); }
  })(ast);
  return n;
}
function lateFocusesRead(src) {
  let ast; try { ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true }); } catch (e) { return { parseError: e.message, calls: [] }; }
  const fns = [], byName = new Set();
  const nameOf = (node, parent) => {
    if (parent && (parent.type === 'MethodDefinition' || parent.type === 'Property') && parent.key) return parent.key.name || parent.key.value || null;
    if (parent && parent.type === 'VariableDeclarator' && parent.id && parent.id.type === 'Identifier') return parent.id.name;
    if (parent && parent.type === 'AssignmentExpression' && parent.left) { const l = parent.left; return l.type === 'MemberExpression' ? (l.property && l.property.name) : l.name; }
    return (node.id && node.id.name) || null;
  };
  const walk = (node, ctx, parent) => {
    if (!node || typeof node.type !== 'string') return;
    let c = ctx;
    if (/Function/.test(node.type)) { const f = { name: nameOf(node, parent), lateRoot: !!ctx.passLate, calls: [], focuses: [] }; fns.push(f); c = { fn: f, awaitAt: -1, lateCb: !!ctx.passLate, passLate: false, door: !!ctx.door }; }
    if (node.type === 'AwaitExpression' && c.fn && (c.awaitAt < 0 || node.start < c.awaitAt)) c.awaitAt = node.start;
    if (node.type === 'CallExpression') {
      const ce = node.callee, name = ce.type === 'MemberExpression' ? ce.property && ce.property.name : ce.name;
      const lexLate = c.lateCb || (c.awaitAt >= 0 && c.awaitAt < node.start);
      if (c.fn && name && name !== 'focus') c.fn.calls.push({ name, late: lexLate });
      if (name === 'focus' && ce.type === 'MemberExpression' && c.fn && !c.door) c.fn.focuses.push({ line: node.loc.start.line, text: src.slice(node.start, node.end).replace(/\s+/g, ' '), lexLate });
      if (LATE_CB.has(name)) for (const a of node.arguments) { if (a.type === 'MemberExpression' && a.property) byName.add(a.property.name); else if (a.type === 'Identifier') byName.add(a.name); }
      walk(ce, c, node);
      const door = c.door || name === 'lateFocus' || name === 'mayTakeKeys';
      for (const a of node.arguments) walk(a, { ...c, door, passLate: LATE_CB.has(name) && /Function/.test(a.type) }, node);
      return;
    }
    for (const k of Object.keys(node)) { if (k === 'loc') continue; const v = node[k]; if (Array.isArray(v)) v.forEach((x) => walk(x, c, node)); else if (v && typeof v.type === 'string') walk(v, c, node); }
  };
  walk(ast, { fn: null, awaitAt: -1, lateCb: false, passLate: false, door: false }, null);
  const late = new Set(); for (const f of fns) if (f.name && (f.lateRoot || byName.has(f.name))) late.add(f.name);
  for (let changed = true, i = 0; changed && i < 30; i++) { changed = false;
    for (const f of fns) { const fnLate = f.lateRoot || (f.name && late.has(f.name)); for (const k of f.calls) if ((k.late || fnLate) && !late.has(k.name) && fns.some((g) => g.name === k.name)) { late.add(k.name); changed = true; } } }
  const calls = [];
  for (const f of fns) { const fnLate = f.lateRoot || (f.name && late.has(f.name)); for (const x of f.focuses) if (x.lexLate || fnLate) calls.push({ line: x.line, text: x.text }); }
  return { calls, bare: bareStartsIn(ast) };
}
const CLASS_FILES = new Set(["src/lib/session-lifecycle.js", "src/lib/app.js", "src/lib/chat-view.js", "src/lib/chat-input.js", "src/lib/chat-renderers.js", "src/lib/chat-status-bar.js", "src/lib/chat-minimap.js", "src/lib/terminal.js", "src/lib/external-editor.js", "src/lib/desktop-app-window.js", "src/lib/xpra-view.js", "src/lib/vnc-view.js", "src/lib/internal-link-ui.js", "src/lib/taskbar.js", "src/lib/command-mode.js", "src/lib/window.js", "src/lib/tab-group.js", "src/lib/desktop-manager.js", "src/lib/layout.js", "src/lib/design-window.js", "src/lib/channel-thread-pane.js", "src/lib/doc-window-ui.js", "src/lib/browser-live-window.js", "src/lib/browser-replay-window.js", "src/lib/machine-desktop.js", "src/lib/search-window.js", "src/lib/inbox-window.js"]);
const NAMED = [   // [file, the call's words, how many times, why] — the window, chat and terminal code (measured: r364)
  ["src/lib/browser-live-window.js", "addrInput.focus({ preventScroll: true })", 1, "the live view's own address field, redrawn by its own mode change — the live view's keyboard model (keyboard-yield's ky.yielded) owns its keys"],
  ["src/lib/browser-live-window.js", "sk.focus({ preventScroll: true })", 1, "the live view's own key sink, taken back only by its own keyboard model (ky.yielded gives the keys back on the person's press elsewhere)"],
  ["src/lib/browser-live-window.js", "tgt.focus({ preventScroll: true })", 1, "the live view's own page dialog box (its own focusDialog), inside the live view's keyboard model"],
  ["src/lib/browser-replay-window.js", "root.focus({ preventScroll: true })", 1, "the replay's own root for its playback keys, after its own load — not a typing target"],
  ["src/lib/channel-thread-pane.js", "ta.focus()", 1, "the thread pane's composer redrawn by drawFoot: it focuses only when keepFocus is passed, by pick() — the person's own press, in the same task"],
  ["src/lib/chat-minimap.js", "filter.focus()", 1, "the minimap search's own filter, a frame after the person's open of it"],
  ["src/lib/chat-renderers.js", "input.focus()", 1, "the language picker's own search box, in the next task of the person's open"],
  ["src/lib/chat-status-bar.js", "ta.focus()", 1, "the design-list popover's own box, in the next task of the person's open"],
  ["src/lib/chat-status-bar.js", "input.focus()", 1, "the goal popover's own field, in the next task of the person's open"],
  ["src/lib/chat-view.js", "needsFocus.focus({ preventScroll: true })", 1, "the needs card's reply box giving the focus BACK to the box that held it when its record was re-drawn — where the person put it"],
  ["src/lib/design-window.js", "name.focus()", 1, "the design window's own name field (its form), in the next task of the person's act"],
  ["src/lib/design-window.js", "composer.ta.focus()", 1, "the comment box the person's pick just drew, in the next task of that pick"],
  ["src/lib/doc-window-ui.js", "ta.focus()", 2, "the document's own comment boxes the person's press opened (the next task of that press)"],
  ["src/lib/doc-window-ui.js", "S.ed.chain().focus()", 3, "the document editor taking back the keys its own dialogs and its own run borrowed (the link, the image, a command the person's answer runs)"],
  ["src/lib/doc-window-ui.js", "hrefIn.focus()", 1, "the link bar's own address field, in the next task of the person's open"],
  ["src/lib/doc-window-ui.js", "S.ed.commands.focus()", 1, "the document editor taking back the keys its own link dialog borrowed (the person's answer in that dialog)"],
  ["src/lib/doc-window-ui.js", "f.contentWindow.focus()", 1, "the hidden print frame, for the print dialog the person asked for — not a typing target"],
  ["src/lib/inbox-window.js", "pane.focus({ preventScroll: true })", 1, "the For-you window's own pane (its focusHome), a list or a pane — no typing target"],
  ["src/lib/inbox-window.js", "list.focus({ preventScroll: true })", 2, "the For-you window's own list after its load or its focusHome — a list takes no typing"],
  ["src/lib/machine-desktop.js", "(user || pass).focus()", 1, "the desktop's own sign-in form field, once the form queue shows it (visible; the person's own open)"],
  ["src/lib/search-window.js", "box.focus()", 2, "the search window's own query box after its own act — a field of the window the person is in"],
  ["src/lib/session-lifecycle.js", "ta.focus()", 1, "the fork dialog's first-message box, in the next task of the person's open"],
  ["src/lib/taskbar.js", "(rows.find((r) => r.classList.contains('active')) || rows[0])?.focus()", 1, "the group chooser's own rows (a popover), a frame after the person's open"],
];
const BY_FILE = {   // file → [how many late focuses, why] — everywhere else in src/lib (measured: r364)
  "src/lib/app-install-dialog.js": [4, "a dialog's, a form's or a panel's own field (not a composer, a terminal or a view that takes typing): the form's own field once the form queue shows the form (visible; the person's own open)"],
  "src/lib/browser-exit-dialog.js": [3, "a dialog's, a form's or a panel's own field (not a composer, a terminal or a view that takes typing): its own field after its own answer (a check or a read the person's act asked for), the dialog standing over the page; the form's own field once the form queue shows the form (visible; the person's own open)"],
  "src/lib/browser-new-profile.js": [4, "a dialog's, a form's or a panel's own field (not a composer, a terminal or a view that takes typing): its own field after its own answer (a check or a read the person's act asked for), the dialog standing over the page; its own field in a callback of its own open; the form's own field once the form queue shows the form (visible; the person's own open)"],
  "src/lib/browser-proxy-dialog.js": [2, "a dialog's, a form's or a panel's own field (not a composer, a terminal or a view that takes typing): its own field after its own answer (a check or a read the person's act asked for), the dialog standing over the page; the form's own field once the form queue shows the form (visible; the person's own open)"],
  "src/lib/browser-proxy-field.js": [1, "a dialog's, a form's or a panel's own field (not a composer, a terminal or a view that takes typing): its own field or row, a timer or a frame after the person's own open of it"],
  "src/lib/browser-who-dialog.js": [2, "a dialog's, a form's or a panel's own field (not a composer, a terminal or a view that takes typing): its own field in a callback of its own open; the form's own field once the form queue shows the form (visible; the person's own open)"],
  "src/lib/bulk-resume.js": [1, "a dialog's, a form's or a panel's own field (not a composer, a terminal or a view that takes typing): its own field or row, a timer or a frame after the person's own open of it"],
  "src/lib/channel-filter-editor.js": [1, "a dialog's, a form's or a panel's own field (not a composer, a terminal or a view that takes typing): a field or a row of the panel itself, in a method its own render or answer runs (the panel the person is in)"],
  "src/lib/channel-group-dialogs.js": [1, "a dialog's, a form's or a panel's own field (not a composer, a terminal or a view that takes typing): the form's own field once the form queue shows the form (visible; the person's own open)"],
  "src/lib/channel-outbox.js": [1, "a dialog's, a form's or a panel's own field (not a composer, a terminal or a view that takes typing): a field or a row of the panel itself, in a method its own render or answer runs (the panel the person is in)"],
  "src/lib/channel-webhook.js": [3, "a dialog's, a form's or a panel's own field (not a composer, a terminal or a view that takes typing): the form's own field once the form queue shows the form (visible; the person's own open); its own field or row, a timer or a frame after the person's own open of it"],
  "src/lib/channels-panel.js": [1, "a dialog's, a form's or a panel's own field (not a composer, a terminal or a view that takes typing): the form's own field once the form queue shows the form (visible; the person's own open)"],
  "src/lib/design-ask.js": [1, "a dialog's, a form's or a panel's own field (not a composer, a terminal or a view that takes typing): its own field or row, a timer or a frame after the person's own open of it"],
  "src/lib/design-home.js": [1, "a dialog's, a form's or a panel's own field (not a composer, a terminal or a view that takes typing): its own field or row, a timer or a frame after the person's own open of it"],
  "src/lib/desktop-app-launcher.js": [4, "a dialog's, a form's or a panel's own field (not a composer, a terminal or a view that takes typing): its own field after its own answer (a check or a read the person's act asked for), the dialog standing over the page; a field or a row of the panel itself, in a method its own render or answer runs (the panel the person is in); its own field or row, a timer or a frame after the person's own open of it"],
  "src/lib/desktop-picker.js": [2, "a dialog's, a form's or a panel's own field (not a composer, a terminal or a view that takes typing): a field or a row of the panel itself, in a method its own render or answer runs (the panel the person is in)"],
  "src/lib/form-window.js": [2, "a dialog's, a form's or a panel's own field (not a composer, a terminal or a view that takes typing): a field or a row of the panel itself, in a method its own render or answer runs (the panel the person is in)"],
  "src/lib/gear-menu.js": [2, "a dialog's, a form's or a panel's own field (not a composer, a terminal or a view that takes typing): a field or a row of the panel itself, in a method its own render or answer runs (the panel the person is in)"],
  "src/lib/learn-card.js": [1, "a dialog's, a form's or a panel's own field (not a composer, a terminal or a view that takes typing): its own field in a callback of its own open"],
  "src/lib/manage-agents.js": [1, "a dialog's, a form's or a panel's own field (not a composer, a terminal or a view that takes typing): a field or a row of the panel itself, in a method its own render or answer runs (the panel the person is in)"],
  "src/lib/mounts-dialog.js": [2, "a dialog's, a form's or a panel's own field (not a composer, a terminal or a view that takes typing): its own field after its own answer (a check or a read the person's act asked for), the dialog standing over the page — twice in the Save: the first pass's refused field, and the re-check's (B-5736's follow: a field whose box moved while a later field's press was judged, asked again once) — the same door, the same press"],
  "src/lib/open-with.js": [1, "a dialog's, a form's or a panel's own field (not a composer, a terminal or a view that takes typing): its own field or row, a timer or a frame after the person's own open of it"],
  "src/lib/path-field.js": [1, "a dialog's, a form's or a panel's own field (not a composer, a terminal or a view that takes typing): its own field after its own answer (a check or a read the person's act asked for), the dialog standing over the page"],
  "src/lib/picture-shell.js": [2, "a dialog's, a form's or a panel's own field (not a composer, a terminal or a view that takes typing): a field or a row of the panel itself, in a method its own render or answer runs (the panel the person is in)"],
  "src/lib/plugins-ui.js": [2, "a dialog's, a form's or a panel's own field (not a composer, a terminal or a view that takes typing): its own field or row, a timer or a frame after the person's own open of it"],
  "src/lib/principal-picker.js": [2, "a dialog's, a form's or a panel's own field (not a composer, a terminal or a view that takes typing): its own field or row, a timer or a frame after the person's own open of it"],
  "src/lib/provider-wizard.js": [1, "a dialog's, a form's or a panel's own field (not a composer, a terminal or a view that takes typing): a field or a row of the panel itself, in a method its own render or answer runs (the panel the person is in)"],
  "src/lib/reaction-picker.js": [1, "a dialog's, a form's or a panel's own field (not a composer, a terminal or a view that takes typing): its own field or row, a timer or a frame after the person's own open of it"],
  "src/lib/record-clear-ui.js": [1, "a dialog's, a form's or a panel's own field (not a composer, a terminal or a view that takes typing): its own field or row, a timer or a frame after the person's own open of it"],
  "src/lib/refresh-live.js": [1, "a dialog's, a form's or a panel's own field (not a composer, a terminal or a view that takes typing): its own field or row, a timer or a frame after the person's own open of it"],
  "src/lib/session-palette.js": [1, "a dialog's, a form's or a panel's own field (not a composer, a terminal or a view that takes typing): its own field or row, a timer or a frame after the person's own open of it"],
  "src/lib/settings-ui.js": [2, "a dialog's, a form's or a panel's own field (not a composer, a terminal or a view that takes typing): its own field in a callback of its own open; a field or a row of the panel itself, in a method its own render or answer runs (the panel the person is in)"],
  "src/lib/setup-flows.js": [1, "a dialog's, a form's or a panel's own field (not a composer, a terminal or a view that takes typing): its own field after its own answer (a check or a read the person's act asked for), the dialog standing over the page"],
  "src/lib/sidebar-mounts.js": [2, "a dialog's, a form's or a panel's own field (not a composer, a terminal or a view that takes typing): its own field in a callback of its own open; the form's own field once the form queue shows the form (visible; the person's own open)"],
  "src/lib/task-detail.js": [1, "a dialog's, a form's or a panel's own field (not a composer, a terminal or a view that takes typing): a field or a row of the panel itself, in a method its own render or answer runs (the panel the person is in)"],
  "src/lib/task-log.js": [3, "a dialog's, a form's or a panel's own field (not a composer, a terminal or a view that takes typing): a field or a row of the panel itself, in a method its own render or answer runs (the panel the person is in) — the search box back after its own re-draw; the Backlog tab giving the focus BACK, after its own re-draw, to the box of this panel that HELD it (the add box, an open editor: captured and put back in the same task, never another window's keys — B-0248 step 3); and the ✎ editor's own field on the person's press (the re-draw's put-back passes a draft and never focuses it)"],
  "src/lib/utils.js": [6, "a dialog's, a form's or a panel's own field (not a composer, a terminal or a view that takes typing): its own field in a callback of its own open; its own field or row, a timer or a frame after the person's own open of it"],
  "src/lib/vault-automation.js": [1, "a dialog's, a form's or a panel's own field (not a composer, a terminal or a view that takes typing): its own field or row, a timer or a frame after the person's own open of it"],
  "src/lib/vault-login-row.js": [2, "a dialog's, a form's or a panel's own field (not a composer, a terminal or a view that takes typing): its own field or row, a timer or a frame after the person's own open of it"],
  "src/lib/vault-paste-box.js": [4, "a dialog's, a form's or a panel's own field (not a composer, a terminal or a view that takes typing): a field or a row of the panel itself, in a method its own render or answer runs (the panel the person is in); the form's own field once the form queue shows the form (visible; the person's own open); its own field or row, a timer or a frame after the person's own open of it"],
  "src/lib/vault-reveal.js": [2, "a dialog's, a form's or a panel's own field (not a composer, a terminal or a view that takes typing): its own field after its own answer (a check or a read the person's act asked for), the dialog standing over the page; its own field or row, a timer or a frame after the person's own open of it"],
  "src/lib/vault-totp-row.js": [1, "a dialog's, a form's or a panel's own field (not a composer, a terminal or a view that takes typing): its own field or row, a timer or a frame after the person's own open of it"],
  "src/lib/vault-unlock.js": [4, "a dialog's, a form's or a panel's own field (not a composer, a terminal or a view that takes typing): its own field after its own answer (a check or a read the person's act asked for), the dialog standing over the page; its own field or row, a timer or a frame after the person's own open of it"],
  "src/lib/voice-teach-ui.js": [1, "a dialog's, a form's or a panel's own field (not a composer, a terminal or a view that takes typing): its own field or row, a timer or a frame after the person's own open of it"],
  "src/lib/window-share.js": [1, "a dialog's, a form's or a panel's own field (not a composer, a terminal or a view that takes typing): the form's own field once the form queue shows the form (visible; the person's own open)"],
};
const PAGE = new Map((function walk(d) { const out = []; for (const e of fs.readdirSync(path.join(repo, d), { withFileTypes: true })) { const r = `${d}/${e.name}`; if (e.isDirectory()) out.push(...walk(r)); else if (e.name.endsWith('.js') && !/^i18n-/.test(e.name)) out.push(r); } return out; })('src/lib').map((f) => [f, read(f)]));
const census = (files) => {
  const r = { files: 0, late: 0, unnamed: [], miscount: [], stale: [], parse: [] }, seenNamed = new Set(), seenFile = new Set();
  for (const [f, s] of files) {
    if (f === 'src/lib/late-focus.js') continue;   // THE door's own focus
    const { calls, parseError } = lateFocusesOf(f, s);
    if (parseError) { r.parse.push(`${f}: ${parseError}`); continue; }
    if (!calls.length) continue;
    r.files++; r.late += calls.length;
    if (CLASS_FILES.has(f)) {
      const by = new Map(); for (const c of calls) { if (!by.has(c.text)) by.set(c.text, []); by.get(c.text).push(c.line); }
      for (const [text, lines] of by) { const row = NAMED.find(([nf, w]) => nf === f && w === text);
        if (!row) for (const ln of lines) r.unnamed.push(`${f}:${ln} ${text.slice(0, 70)}`);
        else { seenNamed.add(row); if (row[2] !== lines.length) r.miscount.push(`${f} «${text.slice(0, 50)}» ×${lines.length} (named ×${row[2]}: lines ${lines.join(', ')})`); } }
    } else {
      const row = BY_FILE[f];
      if (!row) for (const c of calls) r.unnamed.push(`${f}:${c.line} ${c.text.slice(0, 70)}`);
      else { seenFile.add(f); if (row[0] !== calls.length) r.miscount.push(`${f} ×${calls.length} (named ×${row[0]}: lines ${calls.map((c) => c.line).join(', ')})`); }
    }
  }
  for (const row of NAMED) if (!seenNamed.has(row) && files.has(row[0])) r.stale.push(`${row[0]} «${row[1].slice(0, 50)}» (named, no late call carries it)`);
  for (const f of Object.keys(BY_FILE)) if (!seenFile.has(f) && files.has(f)) r.stale.push(`${f} (named, no late call in it)`);
  return r;
};
const C0 = census(PAGE);
const total = NAMED.reduce((n, x) => n + x[2], 0) + Object.values(BY_FILE).reduce((n, x) => n + x[0], 0);
ok(C0.parse.length === 0, `the census reads every file of src/lib (${PAGE.size} files)`, C0.parse);
ok(C0.unnamed.length === 0 && C0.miscount.length === 0 && C0.stale.length === 0 && C0.late === total,
  `every late focus in the page's code is through the door or NAMED: ${C0.late} in ${C0.files} files — ${NAMED.reduce((n, x) => n + x[2], 0)} in the window, chat and terminal code by their words (${NAMED.length} rows, each with its count), ${Object.values(BY_FILE).reduce((n, x) => n + x[0], 0)} in ${Object.keys(BY_FILE).length} other files by file and count${C0.unnamed.length ? ` — NOT NAMED: ${C0.unnamed.join(' · ')}` : ''}${C0.miscount.length ? ` — COUNT MOVED: ${C0.miscount.join(' · ')}` : ''}${C0.stale.length ? ` — STALE: ${C0.stale.join(' · ')}` : ''}`, { unnamed: C0.unnamed, miscount: C0.miscount, stale: C0.stale });
ok(!/(syncId|replay)(\s*\|\|\s*machine)?\)?\s*\?\s*PAGE_START/.test(read('src/lib/session-lifecycle.js') + read('src/lib/desktop-app-window.js')), 'MUST 1: no open reads «nobody started it» off an id — session-lifecycle and desktop-app-window ask unattendedOpen (the boot, another device\'s record, quiet)');
// THE DOOR'S SITES, each by its words (a site that loses its door call is red here even where the census cannot see it)
const SITES = [   // [file, the words, how many, the kind]
  ['src/lib/session-lifecycle.js', 'lateFocus(chatView, { win: winInfo, since: openAt })', 1, 'the create\'s answer — chat'],
  ['src/lib/session-lifecycle.js', 'lateFocus(chatView, { win: winInfo, since: winInfo._lateFocusSince ?? openAt })', 1, 'the attach\'s answer — chat (its start renewed by a re-press)'],
  ['src/lib/session-lifecycle.js', 'lateFocus(term, { win: winInfo, since: openAt })', 2, 'the create\'s answer and the tmux view\'s — terminal'],
  ['src/lib/session-lifecycle.js', 'lateFocus(term, { win: winInfo, since: winInfo._lateFocusSince ?? openAt })', 1, 'the attach\'s answer — terminal'],
  ['src/lib/session-lifecycle.js', 'lateFocus(term, { win: this.wm.windows.get(winId), since: unattended ? PAGE_START : openStart(this, { given: at }) })', 1, 'a standing window\'s focus (a person\'s open: the one start fact; nobody\'s: the page\'s start)'],
  ['src/lib/session-lifecycle.js', 'if (!unattended) w._lateFocusSince = openStart(this, { given: at });', 1, 'a re-press while it attaches renews the start (at that press)'],
  ['src/lib/session-lifecycle.js', 'const openAt = openStart(this, { quiet, given: pressAt });', 2, 'the create\'s and the attach\'s start: the ONE fact (r673) — never the id'],
  ['src/lib/chat-input.js', 'since: this._picAddAt });', 1, 'the composer after a picture\'s read'],
  ['src/lib/chat-input.js', "{ win: { content: ta.closest('.window-content, .window') || ta.parentElement }, since });", 1, 'the composer after an upload (r364 MUST 3)'],
  ['src/lib/chat-view.js', 'const focusBack = () => lateFocus(this._chatInput, { win: this.winInfo, since: Number.isFinite(bound.at) ? bound.at : PAGE_START });', 1, 'the rewind answer\'s restored words (r364)'],
  ['src/lib/chat-view.js', "if (put === 'restored') focusBack();", 3, 'the rewind answer\'s three roads'],
  ['src/lib/terminal.js', 'lateFocus({ focus: () => this.terminal.focus() }, { win: this.winInfo, since: at })', 3, 'the terminal after a paste\'s upload or clipboard read'],
  ['src/lib/terminal.js', 'const take = (el) => lateFocus({ focus: () => el.focus() }, { win: this.winInfo, since: since ?? openClock() });', 1, 'the paste pad after the clipboard refused'],
  ['src/lib/external-editor.js', 'lateFocus({ focus: () => termSession.terminal.focus() }, { win: targetWinInfo, since: at })', 2, 'the terminal after the editor\'s close'],
  ['src/lib/external-editor.js', 'lateFocus(editorView, { win: targetWinInfo, since: openAt })', 1, 'the editor pane after its open'],
  ['src/lib/desktop-app-window.js', 'lateFocus(view, { win: winInfo, since: at })', 2, 'the app\'s view after a take-over\'s lease'],
  ['src/lib/desktop-app-window.js', '(!first || mayTakeKeys({ win: winInfo, since: openAt }))', 1, 'the app\'s picture on its FIRST connect'],
  ['src/lib/desktop-app-window.js', 'lateFocus(handle, { win: winInfo, since: satAt })', 1, 'a satellite window bound late'],
  ['src/lib/app.js', 'if (session && since !== undefined) lateFocus(session, { win, since });', 1, 'a go-to that lands after an await'],
  ['src/lib/internal-link-ui.js', 'app.goToWinId(w, { since: at })', 1, 'the link door\'s other-desktop go-to'],
  ['src/lib/channel-thread-pane.js', '{ win: { content: pane }, since: openAt }', 1, 'the thread pane\'s composer after its render'],
];
const siteCount = (files, [f, words]) => (files.get(f) || '').split(words).length - 1;
const badSites = SITES.filter((s) => siteCount(PAGE, s) !== s[2]).map((s) => `${s[0]} «${s[1].slice(0, 60)}» ×${siteCount(PAGE, s)} (want ${s[2]})`);
ok(badSites.length === 0, `the door's sites, each by its words (${SITES.reduce((n, s) => n + s[2], 0)} pins in ${new Set(SITES.map((s) => s[0])).size} files: ${SITES.map((s) => s[3]).join(' · ')})`, badSites);
// RED CONTROLS: each site kind's door call planted back to the base's bare focus is red BY NAME; a new late focus in a file the table
// does not name, a second one with the same words in the class code, one more in a named file — each red by file (and line / count)
const plant = (f, from, to) => { const s = PAGE.get(f) || ''; if (s.split(from).length !== 2) return null; const m = new Map(PAGE); m.set(f, s.replace(from, to)); return { m, line: s.slice(0, s.indexOf(from)).split('\n').length }; };
const KINDS = [
  ['a session answer (the attach, chat)', 'src/lib/session-lifecycle.js', 'lateFocus(chatView, { win: winInfo, since: winInfo._lateFocusSince ?? openAt });', 'chatView.focus();'],   // stale-pins: kept (the base's text, planted)
  ['the terminal after a paste\'s upload', 'src/lib/terminal.js', "lateFocus({ focus: () => this.terminal.focus() }, { win: this.winInfo, since: at });\n            setTimeout(() => { _pasteInFlight = false; }, 1000);", "this.terminal.focus();\n            setTimeout(() => { _pasteInFlight = false; }, 1000);"],   // stale-pins: kept (the base's text, planted)
  ['the terminal after the editor\'s close', 'src/lib/external-editor.js', "if (termSession) setTimeout(() => { termSession.fit(); lateFocus({ focus: () => termSession.terminal.focus() }, { win: targetWinInfo, since: at }); }, 150);", "if (termSession) setTimeout(() => { termSession.fit(); termSession.terminal.focus(); }, 150);"],   // stale-pins: kept (the base's text, planted)
  ['the app\'s view after a take-over', 'src/lib/desktop-app-window.js', "applyLease(r.lease); lateFocus(view, { win: winInfo, since: at });", "applyLease(r.lease); view?.focus();"],   // stale-pins: kept (the base's text, planted)
  ['the thread pane\'s composer after its render', 'src/lib/channel-thread-pane.js', "if (ta) lateFocus({ focus: () => ta.focus({ preventScroll: true }) }, { win: { content: pane }, since: openAt });", "if (ta) ta.focus({ preventScroll: true });"],   // stale-pins: kept (the base's text, planted)
  ['the composer after an upload (the insert called after the upload\'s await)', 'src/lib/chat-input.js', "lateFocus({ focus: () => ta.focus() }, { win: { content: ta.closest('.window-content, .window') || ta.parentElement }, since });", 'ta.focus();'],   // stale-pins: kept (the base's text, planted)
  ['the rewind answer (a reply\'s dispatch)', 'src/lib/chat-view.js', "\n    if (put === 'restored') focusBack();", "\n    if (put === 'restored') this._chatInput?.focus?.();"],   // stale-pins: kept (the base's text, planted)
];
const kindOut = KINDS.map(([kind, f, from, to]) => { const p = plant(f, from, to); if (!p) return { kind, gone: true }; const c = census(p.m); return { kind, f, line: p.line, red: c.unnamed.some((u) => u.startsWith(`${f}:`)) }; });
ok(kindOut.every((k) => !k.gone && k.red), `CONTROL: each site kind's door call planted back to a bare focus is red BY NAME — ${kindOut.map((k) => k.gone ? `${k.kind}: ITS ANCHOR IS GONE` : `${k.kind} (${k.f}:${k.line} ${k.red ? 'red' : 'NOT red'})`).join(' · ')}`, kindOut);
const PIN_KINDS = [
  ['the composer after a picture\'s read', 'src/lib/chat-input.js', 'since: this._picAddAt });', 'this._textarea.focus(); },'],   // stale-pins: kept (the base's text, planted)
  ['the app\'s picture on its first connect', 'src/lib/desktop-app-window.js', '(!first || mayTakeKeys({ win: winInfo, since: openAt }))', 'true'],   // stale-pins: kept (the base's text, planted)
  ['a standing window\'s focus', 'src/lib/session-lifecycle.js', 'lateFocus(term, { win: this.wm.windows.get(winId), since: unattended ? PAGE_START : openStart(this, { given: at }) });', 'term.focus();'],   // stale-pins: kept (the base's text, planted)
  ['the link door\'s other-desktop go-to', 'src/lib/internal-link-ui.js', 'app.goToWinId(w, { since: at })', 'app.goToWinId(w)'],   // stale-pins: kept (the base's text, planted)
  ['the re-press renewal', 'src/lib/session-lifecycle.js', 'if (!unattended) w._lateFocusSince = openStart(this, { given: at });', ''],   // stale-pins: kept (the base's text, planted)
];
const pinOut = PIN_KINDS.map(([kind, f, from, to]) => { const p = plant(f, from, to); if (!p) return { kind, gone: true }; return { kind, red: SITES.some((s) => siteCount(p.m, s) !== s[2]) }; });
ok(pinOut.every((k) => !k.gone && k.red), `CONTROL: each kind whose call the census cannot see late, its door call planted away — its site pin is red: ${pinOut.map((k) => `${k.kind} ${k.gone ? 'ITS ANCHOR IS GONE' : k.red ? 'red' : 'NOT red'}`).join(' · ')}`, pinOut);
const NEW_FILE = 'src/lib/zz-late-focus-plant.js', m1 = new Map(PAGE); m1.set(NEW_FILE, 'export function open(box) { fetch(\'/x\').then(() => box.focus()); }\n');
const c1 = census(m1);
const p2 = plant('src/lib/session-lifecycle.js', '  _closeSidebarOnMobile() {\n', '  _closeSidebarOnMobile() {\n    setTimeout(() => ta.focus(), 0);\n');
const c2 = p2 ? census(p2.m) : null;
const m3 = new Map(PAGE); m3.set('src/lib/window-share.js', 'export function zzPlant(el) { Promise.resolve().then(() => el.focus()); }\n' + (PAGE.get('src/lib/window-share.js') || ''));
const c3 = census(m3);
ok(c1.unnamed.join() === `${NEW_FILE}:1 box.focus()` && !!c2 && c2.miscount.some((x) => x.startsWith('src/lib/session-lifecycle.js «ta.focus()» ×2')) && !!c3 && c3.miscount.some((x) => x.startsWith('src/lib/window-share.js ×2')),
  `CONTROL: a NEW late focus in a file the table does not name is red by file and line (${c1.unnamed.join(' · ')}); a second one with the SAME WORDS in the class code is red by its count (${c2 && c2.miscount.join(' · ')}); one more in a NAMED file is red by its count (${c3 && c3.miscount.join(' · ')})`, { c1: c1.unnamed, c2: c2 && c2.miscount, c3: c3 && c3.miscount });

// r871 — EVERY START STILL READ AS A BARE CLOCK NUMBER (by nobody: the safe default), named by its file with its count and why
const BARE = {
  'src/lib/chat-view.js': [2, 'the rewind answer\'s start, read at the press and kept across a reload in the tab\'s storage — tier one\'s press and the files tier\'s (B-437e U3: its conversation step binds the same way); the press is in the window\'s own message, so no field elsewhere holds the keys'],
  'src/lib/desktop-app-window.js': [4, 'the first connect\'s start (the window\'s own making — a restore or a press) and the satellite\'s (the app showed a window, nobody pressed): unhanded ON PURPOSE; «Resume here» and «Take over» are read at the press (the press is inside the window)'],
  'src/lib/external-editor.js': [4, 'the pane\'s open on the CLI\'s signal: unhanded ON PURPOSE (no person\'s press; the pane sits in the terminal\'s own window); its three closes (Save & Close, the load-failure door, B-23e5 r2221 law B\'s «Discard») are read at the person\'s press, inside that window'],
  'src/lib/terminal.js': [4, 'the terminal\'s paste roads, read at the paste or the tap (the terminal itself holds the keys: inside its window); the pad\'s fallback is unhanded'],
};   // r945: the link door reads its start through the act (it left this table)
{
  // a bare start in ANY spelling (r945): counted on the census's own parse of each file (bareStartsIn), cached with it — never by a word
  const bareOf = (src, f = 'src/lib/zz-probe.js') => { const r = lateFocusesOf(f, src); return r.parseError ? -1 : r.bare; };
  const tableOf = (pages) => [...pages.keys()].filter((f) => f !== 'src/lib/late-focus.js' && f !== 'src/lib/utils.js').map((f) => [f, bareOf(pages.get(f), f)]).filter(([, n]) => n !== 0);
  const offOf = (seen) => seen.filter(([f, n]) => !BARE[f] || BARE[f][0] !== n).map(([f, n]) => `${f} ×${n}${BARE[f] ? ` (named ×${BARE[f][0]})` : ' (NOT NAMED)'}`);
  const seen = tableOf(PAGE), off = offOf(seen), stale = Object.keys(BARE).filter((f) => !seen.some(([g]) => g === f));
  ok(off.length === 0 && stale.length === 0, `every bare start in the page's code, in any spelling, is named with its why (${seen.reduce((n, [, k]) => n + k, 0)} in ${seen.length} files; the link door reads through the act)`, { off, stale });
  const plants = [
    ['a new file reading the clock', 'export const at = openClock();\n'],
    ['a door given performance.now()', "export function f(v, win) { lateFocus(v, { win, since: performance.now() }); }\n"],
    ['a maker given a plain number', "export function g(app) { app.createSession({ cwd: '', openAt: 1234 }); }\n"],
    ['a door given Date.now()', "export function h(v) { mayTakeKeys({ since: Date.now() }); }\n"],
  ];
  const plantOut = plants.map(([n, code]) => { const m = new Map(PAGE); m.set('src/lib/zz-bare-plant.js', code); const o = offOf(tableOf(m)); return { n, red: o.length === 1 && o[0].startsWith('src/lib/zz-bare-plant.js ×1') }; });
  ok(plantOut.every((x) => x.red), `CONTROL: a bare start in a file the table does not name is red by its file, in each spelling — ${plantOut.map((x) => `${x.n}: ${x.red ? 'red' : 'GREEN'}`).join(' · ')}`, plantOut);
  ok(bareOf("const s = { openAt: 0, navAt: 0 };\n", 'src/lib/zz-state-probe.js') === 0, 'the census reads a door\'s or a maker\'s start only: a state field named openAt (the live view\'s) is no start');
}
report();
