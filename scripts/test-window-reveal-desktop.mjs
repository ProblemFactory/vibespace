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
// The census (every singleton's re-open + every open-or-focus site goes through the door) is test-architecture §62/§62c.
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
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
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
const door = (src) => new Function('revealDesktop', 'stageWindowKind', 'STAGE_ID', 'revealTab', 'showToast', 't', 'return {' + src + '};')(
  revealDesktop, stageWindowKind, '__stage__', revealTab, (m) => toasts.push(m), (s, o) => s.replace(/\{(\w+)\}/g, (_, k) => (o && k in o ? o[k] : _))).revealWindow;
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
  ok(w.log.filter((x) => x.startsWith('switch')).length === 1 && toasts.length === 1 && /Outbox.*Desktop 1/.test(toasts[0]),
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
