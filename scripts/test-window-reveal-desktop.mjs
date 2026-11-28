#!/usr/bin/env node
// A NAMED WINDOW ON ANOTHER DESKTOP IS REVEALED BY GOING THERE (userW inc-muv3qfo7-96tm, 2026-10-05, 2.369.214:
// "点击 Outbox 没有任何反应" — 12 presses in a minute; his ONE Outbox window lived on desk-…-d1j while he looked at
// desk-…-sco; openChannelOutbox found the singleton and wm.revealWindow switched its tab, restored, focused — on a
// desktop nobody was looking at). Gate row `test-window-reveal-desktop`, fast, in-process:
//   §1 PURE view-visibility.revealDesktop — every verdict (another desktop ⇒ switch; the active one ⇒ none; Locate ⇒
//      none; the Stage: its own reveal / a window on it / a desktop window = leave to it; a switch that did not land ⇒
//      say where, never a loop).
//   §2 THE DOOR ITSELF — the REAL revealWindow body (sliced out of src/lib/window.js) run over a stub manager + a stub
//      DesktopManager: the Outbox on desktop 1 while 2 is active ⇒ switchTo(1) THEN the focus lands on a SHOWN window;
//      minimized ⇒ switch + restore; raise:false ⇒ no switch; the Stage; a refused switch ⇒ one toast naming the desktop.
//   §3 CONTROL — the same body with the switch removed (the pre-fix door) focuses a window on a desktop nobody sees ⇒ red.
//   §4 B-2dbe (lane bl-windows, the backlog push 2026-11-17): the REAL revealWindow + focusWindow + _focusMostRecent, the REAL
//      desktop-manager _refocusShown and session-lifecycle _focusExistingSession — a replay's raise of a window on a hidden desktop
//      changes nothing; the person's reveal still goes there first, also while its switch is QUEUED; a switch hands the focus to the
//      shown desktop's front window, never to an agent's that arrived unasked; controls for each.
// The census (every singleton's re-open + every open-or-focus site goes through the door) is test-architecture §62/§62c.
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { revealDesktop } = require(path.join(repo, 'src/lib/view-visibility.js'));
const { stageWindowKind } = require(path.join(repo, 'src/lib/stage-rules.js'));
const { revealTab } = require(path.join(repo, 'src/lib/chain-layout.js'));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const J = (x) => JSON.stringify(x);

console.log('§1 PURE revealDesktop');
{
  const v = (f) => revealDesktop(f);
  ok(J(v({ desktopId: 'B', activeId: 'A' })) === J({ act: 'switch', to: 'B' }), 'a window on desktop B while A is active ⇒ switch to B');
  ok(v({ desktopId: 'A', activeId: 'A' }).act === 'none', 'on the active desktop ⇒ no switch (focus only)');
  ok(v({ desktopId: 'B', activeId: 'A', raise: false }).act === 'none', 'raise:false (Locate) ⇒ never moves the user');
  ok(v({ desktopId: null, activeId: 'A' }).act === 'none', 'no desktop (no DesktopManager record) ⇒ none');
  ok(v({ desktopId: 'B', activeId: 'A', switched: true }).act === 'tell', 'the switch ran and the window is still elsewhere ⇒ say where (never a loop, never silent)');
  ok(v({ desktopId: 'B', activeId: '__stage__', stageActive: true, intercept: true }).act === 'none', 'the Stage on screen + a session it materializes ⇒ the Stage\'s own reveal');
  ok(v({ desktopId: 'B', activeId: '__stage__', stageActive: true, stageKind: 'window' }).act === 'none', 'the Stage on screen + a window already on it ⇒ none');
  ok(J(v({ desktopId: 'B', activeId: '__stage__', stageActive: true })) === J({ act: 'switch', to: 'B' }), 'the Stage on screen + a desktop window ⇒ go to its desktop (switchTo leaves the Stage)');
  ok(J(v({ desktopId: '__stage__', activeId: 'A', stageEnabled: true })) === J({ act: 'switch', to: '__stage__' }), 'a window living on the Stage while a desktop is shown ⇒ go to the Stage');
  ok(v({ desktopId: '__stage__', activeId: 'A', stageEnabled: false }).act === 'tell', 'on the Stage while the Stage is off ⇒ say where');
}

// the REAL door, sliced out of window.js (a class method body → a plain object method)
const WJ = fs.readFileSync(path.join(repo, 'src/lib/window.js'), 'utf8');
const sliceDoor = (src) => { const i = src.indexOf('\n  revealWindow('); const j = src.indexOf('\n  }\n', i); return src.slice(i, j + 4); };
const { windowWords, windowTitle } = await import('../src/lib/window-types.js'); // lane ui-plain-words: the door names a window through them (closure 2: the «is on» toast says its whole title)
const door = (src) => new Function('revealDesktop', 'stageWindowKind', 'STAGE_ID', 'revealTab', 'showToast', 't', 'windowWords', 'windowTitle', 'return {' + src + '};')(
  revealDesktop, stageWindowKind, '__stage__', revealTab, (m) => toasts.push(m), (s, o) => s.replace(/\{(\w+)\}/g, (_, k) => (o && k in o ? o[k] : _)), windowWords, windowTitle).revealWindow;
let toasts = [];
function world(door, { active = 'D2', winDesk = 'D1', minimized = false, stage = null, land = true } = {}) {
  const log = [];
  const dm = { _a: active, get activeDesktopId() { return this._a; }, desktops: [{ id: 'D1', name: 'Desktop 1' }, { id: 'D2', name: 'Desktop 2' }],
    async switchTo(d) { log.push('switch:' + d); await null; if (land) this._a = d; } };
  const win = { id: 'w1', type: 'channel-outbox', title: 'Outbox', _desktopId: winDesk, isMinimized: minimized };
  const wm = { windows: new Map([['w1', win]]), activeWindowId: null, _app: { desktopManager: dm, stage: stage || { isActive: false, enabled: false, shouldIntercept: () => false, enter: async () => {} } },
    switchTab() {}, witnessGeometry() {}, syncHiddenViews() {}, _notify() {},
    focusWindow(id) { log.push('focus:' + id + (this.windows.get(id)._desktopId === dm.activeDesktopId ? ':shown' : ':HIDDEN')); this.activeWindowId = id; },
    restore(id) { log.push('restore:' + id + (this.windows.get(id)._desktopId === dm.activeDesktopId ? ':shown' : ':HIDDEN')); },
    revealWindow: door };
  return { wm, dm, log };
}
const settle = () => new Promise((r) => setTimeout(r, 0));
const real = door(sliceDoor(WJ));

console.log('§2 the door (the real revealWindow body)');
{
  let w = world(real); toasts = [];
  const r = w.wm.revealWindow('w1'); await settle();
  ok(r === true && J(w.log) === J(['switch:D1', 'focus:w1:shown']) && w.dm.activeDesktopId === 'D1' && w.wm.activeWindowId === 'w1' && !toasts.length,
    'THE INCIDENT: the Outbox on desktop 1 while 2 is active ⇒ switchTo(1) FIRST, then the focus lands on a SHOWN window', J(w.log));
  w = world(real, { active: 'D1' }); w.wm.revealWindow('w1'); await settle();
  ok(J(w.log) === J(['focus:w1:shown']), 'on the active desktop ⇒ focus only (no switch)', J(w.log));
  w = world(real, { minimized: true }); w.wm.revealWindow('w1'); await settle();
  ok(J(w.log) === J(['switch:D1', 'restore:w1:shown']), 'minimized on desktop 1 ⇒ switch + restore', J(w.log));
  w = world(real); w.wm.revealWindow('w1', { raise: false }); await settle();
  ok(!w.log.some((x) => x.startsWith('switch')) && w.dm.activeDesktopId === 'D2', 'raise:false (Locate) ⇒ no switch', J(w.log));
  w = world(real, { stage: { isActive: true, enabled: true, shouldIntercept: () => true, enter: async () => {} }, active: '__stage__' }); w.wm.revealWindow('w1'); await settle();
  ok(J(w.log) === J(['focus:w1:HIDDEN']), 'the Stage materializes a session itself (focusWindow is its interception point) ⇒ no desktop switch', J(w.log));
  w = world(real, { land: false }); toasts = []; w.wm.revealWindow('w1'); await settle(); await settle();
  ok(w.log.filter((x) => x.startsWith('switch')).length === 1 && toasts.length === 1 && verdictOf(/Outbox.*Desktop 1/.test(toasts[0])),
    'a switch that did not land ⇒ ONE toast naming where the window is (no retry loop)', J({ log: w.log, toasts }));
  w = world(real); w.wm.windows.get('w1')._desktopId = undefined; w.wm.revealWindow('w1'); await settle();
  ok(J(w.log) === J(['focus:w1:HIDDEN']), 'a window with no desktop record: no switch, focused as before (the verdict is none)', J(w.log));
}

console.log('§3 CONTROL: the pre-fix door (the switch removed)');
{
  const pre = sliceDoor(WJ).replace(/\n    if \(go\.act === 'switch'\) \{[\s\S]*?\n    \}\n/, '\n');
  ok(pre !== sliceDoor(WJ), 'the control copy differs from the shipped door');
  const w = world(door(pre)); w.wm.revealWindow('w1'); await settle();
  const red = J(w.log) === J(['switch:D1', 'focus:w1:shown']);
  ok(!red && J(w.log) === J(['focus:w1:HIDDEN']), 'without the switch the Outbox case focuses a window on a desktop nobody sees ⇒ the §2 incident leg is RED', J(w.log));
}

console.log('§4 B-2dbe (lane bl-windows) — a replay raises only what is on show; the focus stands on the desktop shown');
{
  // the REAL revealWindow + focusWindow + _focusMostRecent (window.js), the REAL _refocusShown (desktop-manager.js) and the REAL
  // _focusExistingSession (session-lifecycle.js), each sliced out of its file
  const DMJ = fs.readFileSync(path.join(repo, 'src/lib/desktop-manager.js'), 'utf8'), SLJ = fs.readFileSync(path.join(repo, 'src/lib/session-lifecycle.js'), 'utf8');
  const slice = (src, name) => { const i = src.indexOf('\n  ' + name + '('); const j = src.indexOf('\n  }\n', i); return i < 0 ? '' : src.slice(i, j + 4); };
  const mkWm = (doorSrc = sliceDoor(WJ), focusSrc = slice(WJ, 'focusWindow')) => new Function('revealDesktop', 'stageWindowKind', 'STAGE_ID', 'revealTab', 'showToast', 't', 'windowWords', 'windowTitle', 'return {' + doorSrc + ',' + focusSrc + ',' + slice(WJ, '_focusMostRecent') + '};')(
    revealDesktop, stageWindowKind, '__stage__', revealTab, (m) => toasts.push(m), (x) => x, windowWords, windowTitle);   // + lane ui-plain-words' door names a window through them (the restack for 2.369.412)
  const mkRefocus = (src = slice(DMJ, '_refocusShown')) => new Function('return {' + src + '};')()._refocusShown;
  const el = (z) => { const cls = new Set(); return { style: { zIndex: String(z) }, classList: { add: (...c) => c.forEach((x) => cls.add(x)), remove: (...c) => c.forEach((x) => cls.delete(x)), contains: (c) => cls.has(c) } }; };
  const scene = (methods, { stage = false, land = true, refocus = mkRefocus() } = {}) => {
    const wins = new Map([['a1', { id: 'a1', type: 'chat', title: 'Atlas', _desktopId: 'D1', element: el(10) }], ['b1', { id: 'b1', type: 'chat', title: 'Beacon', _desktopId: 'D2', element: el(11), _hiddenByDesktop: true }], ['b2', { id: 'b2', type: 'files', title: 'Bay', _desktopId: 'D2', element: el(12), _hiddenByDesktop: true }]]);
    const app = { isMobile: false };
    const dm = { _a: 'D1', get activeDesktopId() { return this._a; }, desktops: [{ id: 'D1', name: 'Desktop 1' }, { id: 'D2', name: 'Desktop 2' }], app,
      // the real switch's order: hide / show, then step 6's refocus; `land: false` = a switch QUEUED behind the 1 s gate (it resolves at once)
      async switchTo(d) { await null; if (!land) return; this.land(d); },
      land(d) { this._a = d; for (const w of wins.values()) w._hiddenByDesktop = w._desktopId !== d; refocus.call(this); } };
    const wm = Object.assign({ windows: wins, activeWindowId: 'a1', zIndex: 100, _settings: null, _app: { desktopManager: dm, stage: { isActive: stage, enabled: stage, shouldIntercept: () => false, enter: async () => {} } },
      _mobileYieldSidebar() {}, syncHiddenViews() {}, _notify() {}, _normalizeZIndices() {}, switchTab() {}, witnessGeometry() {}, restore() {}, _bringBack() {} }, methods);
    app.wm = wm;
    wins.get('a1').element.classList.add('window-active');
    return { wm, dm, wins, app };
  };
  const real = mkWm();
  let s = scene(real);
  s.wm.revealWindow('b1', { replay: true }); await settle();
  ok(s.wm.activeWindowId === 'a1' && !s.wins.get('b1').element.classList.contains('window-active'), 'a REPLAY\'s raise of a window on a desktop nobody sees changes nothing: the active window stays the one on show (the release: the hidden one — Ctrl+\\ x would close it)', s.wm.activeWindowId);
  s = scene(real); s.wm.revealWindow('b1'); await settle(); await settle();
  ok(s.dm.activeDesktopId === 'D2' && s.wm.activeWindowId === 'b1', 'the PERSON\'S reveal goes there first, then focuses it', { at: s.dm.activeDesktopId, active: s.wm.activeWindowId });
  // THE ADVERSARIAL READ'S MUST: the person's reveal while a switch is QUEUED (pressed within the 1 s gate) — its second pass raises the
  // window still hidden; when the queued switch lands, the refocus keeps it (it is shown and active), never the desktop's other front window
  s = scene(real, { land: false }); toasts = []; s.wm.revealWindow('b1'); await settle(); await settle(); s.dm.land('D2');
  ok(s.wm.activeWindowId === 'b1' && verdictOf(s.wins.get('b1').element.classList.contains('window-active')), 'a reveal during a QUEUED switch: when the switch lands the named window keeps the focus (b2 stands higher on that desktop)', s.wm.activeWindowId);
  s = scene(real); await s.dm.switchTo('D2');
  ok(s.wm.activeWindowId === 'b2', 'a SWITCH hands the focus to the shown desktop\'s front window (b2, the higher z) — the release left it on a1, now hidden', s.wm.activeWindowId);
  s = scene(real); s.wins.get('b2').element.classList.add('window-arrived'); await s.dm.switchTo('D2');
  ok(s.wm.activeWindowId === null && gateOf(s.wins.get('b2').element.classList.contains('window-arrived')) && !s.wins.get('a1').element.classList.contains('window-active'), '…its front window an AGENT\'s that arrived unasked ⇒ no window is active, the mark stays (only the person\'s act focuses it), and the window that WAS active is no longer drawn so (batch 60\'s reader)', { active: s.wm.activeWindowId, a1Active: s.wins.get('a1').element.classList.contains('window-active') });
  { const keep = mkRefocus(slice(DMJ, '_refocusShown').replace(/\n    for \(const \[, w\] of wm\.windows\) w\?\.element\?\.classList\?\.remove\?\.\('window-active'[^\n]*\n/, '\n'));
    const s0 = scene(real, { refocus: keep }); s0.wins.get('b2').element.classList.add('window-arrived'); await s0.dm.switchTo('D2');
    ok(verdictOf(s0.wins.get('a1').element.classList.contains('window-active')), 'CONTROL: the null branch without the clear leaves the hidden window drawn active (the leg above goes RED)'); }
  s = scene(real); s.app.isMobile = true; await s.dm.switchTo('D2');
  ok(s.wm.activeWindowId === 'a1', '…a phone keeps its own view state (mobile-nav picks the window it shows on that desktop)');
  s = scene(real); s.wins.get('a1')._hiddenByStage = true; mkRefocus().call(s.dm);
  ok(s.wm.activeWindowId === null, '…a window the Stage parked is no shown window either (D1 shows nothing else here ⇒ none active)', s.wm.activeWindowId);
  s = scene(real, { stage: true }); s.wm.revealWindow('b1', { replay: true });
  ok(s.wm.activeWindowId === 'b1', '…the Stage on screen keeps its own focus rules (no desktop guard there)');
  // _focusExistingSession's replay: no restore, no keyboard focus into a window its desktop hides
  // B-c87d: a replay's focus asks THE late-focus door (src/lib/late-focus.js) from the page's start — here the door as it stands on a page
  // where the person has not acted (it takes the keys); its verdict over the person's acts is test-late-focus's
  const DOOR_NO_ACT = (view) => { view.focus(); return true; };
  // (r364: the slice also reads the page's fact — unattendedOpen — and the open's start — openClock; here: a page with no boot, no remote record)
  const fes = (src) => new Function('lateFocus', 'PAGE_START', 'openClock', 'unattendedOpen', 'openStart', 'return {' + src + '};')(DOOR_NO_ACT, 0, () => 1, (app, quiet) => !!quiet || !!app?.layoutManager?._bootRestoring || !!app?.layoutManager?._applying, () => ({ at: 1, by: null }))._focusExistingSession;   // r673: the start as its one fact
  const sliceObj = (src, name) => { const i = src.indexOf('\n  ' + name + '('); const j = src.indexOf('\n  },\n', i); return i < 0 || j < 0 ? '' : src.slice(i, j + 4); }; // a method of an object literal (session-lifecycle's mixin)
  const fesScene = (src) => { const t = scene(real); const w = t.wins.get('b1'); w.isMinimized = true; let restored = 0, typed = 0;
    t.wm.restore = () => { restored++; }; const ctx = { sessions: new Map([['b1', { sessionId: 'S', focus() { typed++; } }]]), wm: t.wm, desktopManager: { keepInFront() {} } };
    fes(src).call(ctx, 'S', { replay: true }); return { restored, typed, active: t.wm.activeWindowId }; };
  const fr = fesScene(sliceObj(SLJ, '_focusExistingSession'));
  ok(fr.restored === 0 && fr.typed === 0 && fr.active === 'a1', '_focusExistingSession\'s REPLAY of a window its desktop hides: not raised, not restored, no keyboard focus into it', fr);
  const fesStage = (src) => { const t = scene(real, { stage: true }); const w = t.wins.get('b1'); w.isMinimized = true; let restored = 0, typed = 0;
    t.wm.restore = () => { restored++; }; const ctx = { sessions: new Map([['b1', { sessionId: 'S', focus() { typed++; } }]]), wm: t.wm, stage: { isActive: true }, desktopManager: { keepInFront() {} } };
    fes(src).call(ctx, 'S', { replay: true }); return { restored, typed }; };
  const fs1 = fesStage(sliceObj(SLJ, '_focusExistingSession'));
  ok(fs1.restored === 1 && fs1.typed === 1, '…under the STAGE the replay keeps its own rules (as revealWindow\'s replay): a minimized window is restored and typed into — batch 60\'s reader', fs1);
  const fs0 = fesStage(sliceObj(SLJ, '_focusExistingSession').replace(' && !this.stage?.isActive;', ';'));
  ok(fs0.restored === 0 && fs0.typed === 0, 'CONTROL: the guard without the Stage\'s exemption skips the Stage\'s restore (the leg above goes RED)', fs0);
  // the roads that may hide the active window call the refocus
  ok(gateOf(/\n      if \(targetState\?\.windows\) \{\n        if \(this\._replayMissing\(desktopId, targetState\)\) hasWindows = true;\n      \}\n\s*this\._refocusShown\(\);/.test(DMJ)) && gateOf(/this\._hideWin\(win\);\n\s*this\._refocusShown\(\);/.test(DMJ)) && gateOf(/this\._hideWin\(w\); this\._refocusShown\(\);/.test(DMJ)) && verdictOf(/dm\._refocusShown\?\.\(\);/.test(fs.readFileSync(path.join(repo, 'src/lib/stage-manager.js'), 'utf8'))),
    'the refocus is called by every road that may hide the active window: switchTo (step 6), a move to a desktop not on show, the late retag, the Stage leaving');
  // CONTROLS — each RED for its own leg
  const preDoor = sliceDoor(WJ).replace(/if \(replay\) \{ if \(!\(win\._hiddenByDesktop && !this\._app\?\.stage\?\.isActive\)\) this\.focusWindow\(id\); return true; \}/, 'if (replay) { this.focusWindow(id); return true; }');
  ok(preDoor !== sliceDoor(WJ), 'CONTROL setup: the replay line is found in revealWindow');
  s = scene(mkWm(preDoor)); s.wm.revealWindow('b1', { replay: true }); await settle();
  ok(s.wm.activeWindowId === 'b1', 'CONTROL: the release\'s replay raise makes the hidden window the active one (the first leg goes RED)', s.wm.activeWindowId);
  const guarded = slice(WJ, 'focusWindow').replace('    this._mobileYieldSidebar();', '    if (win._hiddenByDesktop && !_stageBypass && !this._app?.stage?.isActive) return;\n    this._mobileYieldSidebar();');
  s = scene(mkWm(sliceDoor(WJ), guarded), { land: false }); s.wm.revealWindow('b1'); await settle(); await settle(); s.dm.land('D2');
  ok(guarded !== slice(WJ, 'focusWindow') && s.wm.activeWindowId === 'b2', 'CONTROL: a guard INSIDE focusWindow (this lane\'s first cut) ⇒ the queued reveal ends on another window (the queued-switch leg goes RED)', s.wm.activeWindowId);
  const noArrived = slice(DMJ, '_refocusShown').replace("!top.element?.classList?.contains?.('window-arrived') && ", '');
  s = scene(real, { refocus: mkRefocus(noArrived) }); s.wins.get('b2').element.classList.add('window-arrived'); await s.dm.switchTo('D2');
  ok(noArrived !== slice(DMJ, '_refocusShown') && s.wm.activeWindowId === 'b2' && !s.wins.get('b2').element.classList.contains('window-arrived'), 'CONTROL: the refocus without the arrived check focuses the agent\'s window and wipes its mark (the arrived leg goes RED)', s.wm.activeWindowId);
  s = scene(real, { refocus: () => {} }); await s.dm.switchTo('D2');
  ok(s.wm.activeWindowId === 'a1', 'CONTROL: a switch with no refocus leaves the focus on the left desktop\'s window (the switch leg goes RED)', s.wm.activeWindowId);
  const fr0 = fesScene(sliceObj(SLJ, '_focusExistingSession').replace(/\n        const off = replay && !!this\.wm\.windows\.get\(winId\)\?\._hiddenByDesktop[^\n]*/, '').replace('if (replay && !off && ', 'if (replay && ').replace('if (!off) lateFocus(term, { win: this.wm.windows.get(winId), since: unattended ? PAGE_START : openStart(this, { given: at }) });', 'term.focus();'));   // stale-pins: kept (the release's text, planted)
  ok(fr0.restored === 1 && fr0.typed === 1, 'CONTROL: the release\'s _focusExistingSession restores the hidden window and types into it (the replay leg goes RED)', fr0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
