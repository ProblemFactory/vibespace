#!/usr/bin/env node
// A CONVERSATION BROUGHT ONTO THE STAGE IS DRAWN — the fast gate (userW inc-munl8jkl-gaih + inc-munbksgs-k3yz,
// 2026-09-30: "dynamic desktop crashed" / "卡死" — a window brought onto the Stage from another desktop came up as an
// EMPTY BOX and every click on it landed on the bare div.window; the heavy half is test-stage-dragout-ui § 6).
// ROOT CAUSE (reproduced on 2.369.196 and .198): DesktopManager._hideWin WROTE content-visibility:hidden + aria-hidden on
// a chat window whose desktop went off screen, and only DesktopManager._showWin removed them; the Stage's borrow cleared
// the desktop FLAG and ran the Stage's OWN show (visibility + pointer-events only) ⇒ the hero kept content-visibility:
// hidden and the renderer skipped the whole window, title bar included. No stall (longTasks [], frame gaps none).
// FIX: the marks are DERIVED, never written — PURE view-visibility.js `windowMarks` over the reason set, applied by ONE
// derivation (WindowManager._deriveHiders), every hider only adding / removing its reason through ONE door
// (WindowManager.setWindowHidden); the Stage's hero has no reason ⇒ nothing is marked.
//   §1 PURE: the reason set → the marks, every one of the 32 reason combinations × 3 window types; the named rows
//   §2 THE SCENE on the real classes (WindowManager + its tab-group mixin, DesktopManager, StageManager, ChatView) over
//      fake elements: C0 a plain desktop switch (the control) · A on Fin, enter the Stage, go to a window living on Scra
//      · B leave the Stage and enter it again · D leave to the hero's home · G a GROUP hero (its guest's view resumes;
//      the hand-back hides the whole frame) · P a promoted host keeps its frame's hiding · S a Stage-parked chat is
//      suspended + unrendered and comes back drawn · T a torn-off guest takes its frame's reasons
//   §3 THE CENSUS: every writer of `_hiddenByDesktop` / `_hiddenByStage`, of content-visibility / aria-hidden on a
//      window element anywhere in src/lib, and of visibility / pointer-events in the two hider modules — only the door
//      and the derivation, named by file:line (the scanner's own positive control: it sees the derivation's writes)
//   §4 NEGATIVE CONTROLS (scripts/mutant-copy.mjs): the Stage's pre-fix show + borrow ⇒ §2 B RED; the desktop's pre-fix
//      _hideWin / _showWin and the tab-group's pre-fix _matchFrameVisibility ⇒ the census RED by name; a windowMarks
//      that forgets aria-hidden / the Stage reason ⇒ §1 RED
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const J = JSON.stringify;
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + String(extra).slice(0, 900) : '')); } return !!c; };
if (!fs.existsSync(path.join(REPO, 'src/lib/build-version.js'))) { console.error('src/lib/build-version.js is missing — run `npm run build` first'); process.exit(1); }
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);

// ── §1 THE PURE RULE ──
console.log('— §1 PURE windowMarks: the reason set → the marks (32 reason sets × chat / terminal / files)');
function pureLegs(vv, { quiet = false } = {}) {
  const failed = [];
  const leg = (c, n, extra) => { if (!quiet) ok(c, n, extra); if (!c) failed.push(n); return !!c; };
  const { HIDE_REASONS, hiddenReasons, windowMarks, isDisplayed } = vv;
  leg(J(HIDE_REASONS) === J(['desktop', 'stage', 'mobile', 'tab', 'minimized']), '§1 five reasons, named (the two visibility hiders joined the three display:none ones)', J(HIDE_REASONS));
  leg(J(hiddenReasons({ desktop: true, stage: true })) === J({ desktop: true, stage: true, mobile: false, tab: false, minimized: false }) && J(hiddenReasons({})) === J({ desktop: false, stage: false, mobile: false, tab: false, minimized: false }), '§1 hiddenReasons carries the desktop and Stage reasons through');
  const bad = [];
  for (let bits = 0; bits < 32; bits++) {
    const reasons = Object.fromEntries(HIDE_REASONS.map((r, i) => [r, !!(bits & (1 << i))]));
    for (const type of ['chat', 'terminal', 'files']) {
      const m = windowMarks(reasons, { type });
      const box = reasons.desktop || reasons.stage;
      const want = { visibility: box ? 'hidden' : '', pointerEvents: box ? 'none' : '', ariaHidden: box, contentVisibility: box && type === 'chat' ? 'hidden' : '', suspended: !isDisplayed(reasons) };
      if (J(m) !== J(want)) bad.push({ reasons, type, got: m, want });
    }
  }
  leg(bad.length === 0, '§1 all 96 rows: the box marks (visibility / pointer-events / aria-hidden) iff a desktop or the Stage holds it, content-visibility only a chat\'s, suspended iff ANY reason holds', J(bad.slice(0, 2)));
  const row = (o, type = 'chat') => windowMarks(hiddenReasons(o), { type });
  const CLEAR = J({ visibility: '', pointerEvents: '', ariaHidden: false, contentVisibility: '', suspended: false });
  leg(J(row({})) === CLEAR, '§1 THE STAGE\'S HERO (no reason at all) ⇒ nothing marked: drawn, clickable, its view running — by definition', J(row({})));
  leg(J(row({ desktop: true })) === J({ visibility: 'hidden', pointerEvents: 'none', ariaHidden: true, contentVisibility: 'hidden', suspended: true }), '§1 a chat on a desktop off screen ⇒ box hidden, out of the AX tree (2.369.144), unrendered from cache (inc-mtd54h45), suspended (inc-mtd1d0ft)', J(row({ desktop: true })));
  leg(J(row({ stage: true })) === J(row({ desktop: true })), '§1 a chat the Stage parks ⇒ the SAME marks (the Stage is a hider like a desktop: every hider suspends, hidden windows are aria-hidden)', J(row({ stage: true })));
  leg(row({ desktop: true }, 'terminal').contentVisibility === '' && row({ desktop: true }, 'terminal').visibility === 'hidden', '§1 a terminal keeps rendering its WebGL canvas (content-visibility is a chat window\'s only)');
  leg(J(row({ tabHidden: true })) === J({ ...JSON.parse(CLEAR), suspended: true }) && J(row({ minimized: true })) === J({ ...JSON.parse(CLEAR), suspended: true }) && J(row({ mobile: true, active: false })) === J({ ...JSON.parse(CLEAR), suspended: true }), '§1 a display:none reason (a hidden tab, minimized, the phone\'s inactive window) suspends the view but never marks the ELEMENT — a host whose tab shows a guest draws that guest with its own element');
  return failed;
}
const VV = require(path.join(REPO, 'src/lib/view-visibility.js'));
const pureFailed = pureLegs(VV);

// ── §2 THE SCENE on the real classes ──
console.log('— §2 the scene: the real WindowManager / DesktopManager / StageManager / ChatView over fake elements');
const { WindowManager } = await import(path.join(REPO, 'src/lib/window.js'));
const { installTabGroupMixin } = await import(path.join(REPO, 'src/lib/tab-group.js'));
const { DesktopManager } = await import(path.join(REPO, 'src/lib/desktop-manager.js'));
const { ChatView } = await import(path.join(REPO, 'src/lib/chat-view.js'));
const cls = (...names) => { const s = new Set(names); return { contains: (n) => s.has(n), add: (...n) => n.forEach((x) => s.add(x)), remove: (...n) => n.forEach((x) => s.delete(x)), toggle: (n, on) => { if (on === undefined ? !s.has(n) : on) s.add(n); else s.delete(n); } }; };
const fakeEl = () => { const attrs = new Map(); return { style: { visibility: '', pointerEvents: '', contentVisibility: '', zIndex: '' }, classList: cls(), getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null), setAttribute: (k, v) => attrs.set(k, String(v)), removeAttribute: (k) => attrs.delete(k), attrs, remove() { }, querySelector: () => null }; };
const mkView = () => {
  const v = Object.create(ChatView.prototype);
  Object.assign(v, {
    _suspended: false, _disposed: false, _pinned: true, _pinnedAtSuspend: false, _resumeSettleUntil: 0, _resumeAt: 0, _lastNavAt: 0,
    _lastUserScrollAt: 0, _lastPositionAt: 0, _lastStructuralAt: 0, _resumeRetailTimers: [], _teleported: false, _windowStart: 200, _windowEnd: 250, _total: 250,
    _newMsgCount: 0, _scrollBtn: { classList: { add() { }, remove() { } } }, _messageList: { scrollHeight: 0, clientHeight: 0, querySelectorAll: () => ({ length: 50 }) },
    _updateRunBar() { }, _scheduleRunBar() { }, _tickCollab() { }, _scheduleAxSync() { }, _scrollToBottom() { }, jumpToBottom() { },
  });
  return v;
};
/** The scene on the given classes; returns the failed leg names (quiet for a control's run). */
async function sceneLegs({ StageMgr, DeskMgr = DesktopManager, WinMgr = WindowManager, quiet = false } = {}) {
  const failed = [];
  const leg = (c, n, extra) => { if (!quiet) ok(c, n, extra); if (!c) failed.push(n); return !!c; };
  const STAGE_ID = '__stage__';
  const wm = Object.create(WinMgr.prototype);
  Object.assign(wm, { windows: new Map(), zIndex: 100, activeWindowId: null, grid: null, _settings: { get: () => undefined }, _hideMq: { matches: false }, windowCounter: 0 });
  if (WinMgr === WindowManager) installTabGroupMixin(wm);
  for (const k of ['_notify', '_mobileYieldSidebar', 'setGrid', '_reflowWindows', '_scheduleOverlapUpdate', '_renderTabBar', '_clearSplitDom', '_notifyChainChange', '_placeInboxBadge', 'setAuthBadge', '_normalizeChain', '_markStrip', '_labelSplitBtn', '_resizePanes', '_fitChipsSoon']) wm[k] = () => { };
  wm._applyGridBounds = (w) => { if (w && w.gridBounds) w.element.box = { ...w.gridBounds }; }; // the pixels a window is PLACED at (verify r2: a box set on the record but never placed is judged too)
  // verify r3: a FAITHFUL _captureGridBounds (the host's element box becomes its fractions, a guest is skipped, the Stage's slot
  // hook fires for the hero / placeholder) and toggleMaximize (isMaximized flipped, prevBounds kept, the capture + chain sync
  // 50 ms later — window.js toggleMaximize) — a MAXIMIZED window's captured fractions are the whole workspace, as in the product
  wm._captureGridBounds = (w) => { if (!w) return; if (w._isStagePlaceholder || w._isStageHero) setTimeout(() => { try { app.stage?.onGeometryCaptured(w); } catch { } }, 0); if (w._tabChain && Array.isArray(w._tabChain.tabs) && w._tabChain.tabs[0] !== w.id) return; if (w.element.box) w.gridBounds = { ...w.element.box }; };
  wm.toggleMaximize = (id) => { let w = wm.windows.get(id); if (!w) return; if (w._tabChain && w._tabChain.tabs[0] !== w.id) w = wm.windows.get(w._tabChain.tabs[0]); if (!w) return; if (w.isMaximized) { if (w.prevBounds) w.element.box = { ...w.prevBounds }; w.isMaximized = false; } else { w.prevBounds = w.element.box ? { ...w.element.box } : null; w.element.box = { left: 0, top: 0, width: 1, height: 1 }; w.isMaximized = true; } setTimeout(() => { if (!wm.windows.has(w.id)) return; wm._captureGridBounds(w); if (w._tabChain) wm._syncChainBounds(w._tabChain); }, 0); };
  wm._applyChainLayout = () => wm.syncHiddenViews(); // the real one ends in syncHiddenViews (tab-group.js: every chain mutation re-derives) — verify r3
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const FULL = { left: 0, top: 0, width: 1, height: 1 };
  wm._followPartner = () => null; // (verify r1: a GUEST focused on the Stage runs switchTab's strip work)
  const sessions = new Map();
  const store = new Map();
  const app = {
    wm, sessions, isMobile: false,
    settings: { get: (k) => (k === 'desktop.dynamicEnabled' ? true : undefined), on() { } },
    layoutManager: { captureState: () => ({ windows: [] }), captureWindows: () => [], captureWin: () => null, captureChrome: () => ({}), restoreState() { }, scheduleAutoSave() { }, _pointerDown: false }, // captureWindows / captureWin / captureChrome / restoreState: lane desktop-move's record doors (the merged tree's enter() reads them — verify r3's and r4's trial merges threw here)
    updateTaskbar() { }, replayOpenSpec() { }, _checkWelcome() { },
  };
  wm._app = app;
  const dm = Object.create(DeskMgr.prototype);
  Object.assign(dm, { app, _desktops: [{ id: 'fin', name: 'Fin' }, { id: 'scra', name: 'Scra' }, { id: 'work', name: 'Work' }], _activeId: 'fin', _savedStates: new Map(), _restoring: false, _wireIds: new Map(), _dirtyDesks: new Set(), _buildAttempts: new Map(), _departed: new Map() }); // the last four: lane desktop-move's record state (its purgeClosedWindow / _noteDeparted read them — the merged tree threw on a fake without them, verify r4; the r3 e23658e5 class)
  for (const k of ['_renderSwitcher', 'refreshSwitcher', '_updateCachedDesktop', '_broadcastDesktopState']) dm[k] = () => { };
  app.desktopManager = dm;
  const sm = new StageMgr(app);
  sm._sync = () => ({ get: (s, k) => store.get(k), set: (s, k, v) => { if (v === '') store.delete(k); else store.set(k, v); } });
  app.stage = sm;
  const mkWin = (id, type, desk, { sid = null } = {}) => {
    const w = { id, type, element: fakeEl(), content: { classList: cls() }, titleBar: { querySelector: () => null }, titleSpan: { style: {} }, _desktopId: desk, gridBounds: { left: 0.1, top: 0.1, width: 0.4, height: 0.4 }, _openSpec: sid ? { action: 'viewSession', backend: 'claude', backendSessionId: sid } : null };
    wm.windows.set(id, w);
    if (type === 'chat') sessions.set(id, mkView());
    return w;
  };
  const ph = mkWin('ph', 'stage-placeholder', STAGE_ID); ph._isStagePlaceholder = true; sm._placeholderId = 'ph';
  const fin1 = mkWin('fin1', 'chat', 'fin', { sid: 'e2e00000-0000-4000-8000-00000000f101' });
  const scra1 = mkWin('scra1', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c101' });
  const maj = mkWin('maj', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c102' });
  const work1 = mkWin('work1', 'chat', 'work', { sid: 'e2e00000-0000-4000-8000-00000000a101' });
  // the boot shape: every window not on the active desktop hidden by the desktop, the placeholder parked by the Stage
  for (const w of [scra1, maj, work1]) dm._hideWin(w);
  sm._hideStage(ph);
  const marks = (w) => ({ vis: w.element.style.visibility || '', pe: w.element.style.pointerEvents || '', cv: w.element.style.contentVisibility || '', aria: w.element.getAttribute('aria-hidden'), desk: !!w._hiddenByDesktop, stage: !!w._hiddenByStage, suspended: sessions.get(w.id) ? sessions.get(w.id)._suspended : null, reasons: sessions.get(w.id) ? [...(sessions.get(w.id)._hiddenReasons || [])] : null });
  const drawn = (w) => { const m = marks(w); return m.vis === '' && m.pe === '' && m.cv === '' && m.aria === null && !m.desk && !m.stage && (m.suspended === null || m.suspended === false); };
  const hidden = (w) => { const m = marks(w); return m.vis === 'hidden' && m.pe === 'none' && m.aria === 'true' && (w.type !== 'chat' || m.cv === 'hidden') && (m.suspended === null || m.suspended === true); };
  const switchTo = async (id) => { await dm.switchTo(id); dm._restoring = false; };
  leg(drawn(fin1) && hidden(maj) && hidden(scra1) && hidden(ph), '§2 boot: Fin drawn; the Scra windows hidden by the desktop (content-visibility, aria-hidden, suspended); the placeholder parked', J({ fin1: marks(fin1), maj: marks(maj) }));

  // C0 — the control: a plain desktop switch draws everything (the forensics' control, and its way out)
  await switchTo('scra');
  leg(drawn(maj) && drawn(scra1) && hidden(fin1), '§2 C0 control — a plain desktop switch to Scra: its windows drawn (every mark gone, the views running), Fin\'s hidden', J({ maj: marks(maj), fin1: marks(fin1) }));
  await switchTo('fin');
  leg(hidden(maj) && drawn(fin1), '§2 C0 …and back to Fin', J(marks(maj)));

  // A — on Fin, click the Stage preview (enter), then go to Majordomo — a window living on Scra (the palette / go-to /
  //     the sidebar: every one funnels through focusWindow, the Stage's materialize)
  await switchTo(STAGE_ID);
  leg(sm.isActive && dm.activeDesktopId === STAGE_ID && hidden(fin1) && drawn(ph), '§2 A the Stage is entered from Fin: Fin\'s windows hidden, the placeholder shown', J({ fin1: marks(fin1), ph: marks(ph) }));
  wm.focusWindow('maj');
  await new Promise((r) => setTimeout(r, 0));
  leg(sm._heroWinId === 'maj' && maj._onStage, '§2 A Majordomo materialized as the hero');
  leg(drawn(maj), '§2 A THE HERO IS DRAWN — no content-visibility, no aria-hidden, visibility and pointer-events on, no reason, its ChatView running (2.369.196/.198: content-visibility:hidden stayed — a blank box, clicks on the bare div.window)', J(marks(maj)));
  leg(sessions.get('maj')._resumeSettleUntil > Date.now(), '§2 A …and its view RESUMED (the settle + pinned re-tail are armed — paging and pinning run again)', J({ settle: sessions.get('maj')._resumeSettleUntil }));
  leg(hidden(ph) && hidden(scra1) && hidden(fin1), '§2 A the placeholder parked, the rest of Scra and Fin stay hidden', J({ ph: marks(ph), scra1: marks(scra1) }));

  // B — leave the Stage to a desktop that is NOT the hero's home (a desktop preview), then click the Stage preview again
  await switchTo('work');
  leg(!sm.isActive && hidden(maj) && maj._hiddenByDesktop && !maj._hiddenByStage && drawn(work1), '§2 B left to Work: the hero is the DESKTOP\'s again (hidden, its home is not on screen), Work drawn', J({ maj: marks(maj), work1: marks(work1) }));
  await switchTo(STAGE_ID);
  leg(sm.isActive && sm._heroWinId === 'maj', '§2 B the Stage entered again: the hero is re-borrowed');
  leg(drawn(maj), '§2 B THE RE-BORROWED HERO IS DRAWN (2.369.196/.198: the leave\'s desktop hide left content-visibility:hidden; the enter\'s borrow cleared the flag only)', J(marks(maj)));
  leg(hidden(work1), '§2 B …and Work\'s windows are hidden again', J(marks(work1)));

  // D — leave to the hero's own home desktop: drawn there (the way out in the forensics, kept)
  await switchTo('scra');
  leg(!sm.isActive && drawn(maj) && drawn(scra1) && hidden(work1), '§2 D left to Scra (the hero\'s home): drawn on its desktop', J({ maj: marks(maj), scra1: marks(scra1) }));
  await switchTo(STAGE_ID);
  leg(drawn(maj) && hidden(scra1), '§2 D …and back onto the Stage: drawn, Scra\'s others hidden', J({ maj: marks(maj), scra1: marks(scra1) }));

  // S — a Stage-born chat that the next hero switch parks: suspended + unrendered, and drawn again when materialized
  const born = mkWin('born', 'chat', STAGE_ID, { sid: 'e2e00000-0000-4000-8000-00000000b001' });
  wm.focusWindow('born'); await new Promise((r) => setTimeout(r, 0));
  leg(sm._heroWinId === 'born' && drawn(born), '§2 S a Stage-born chat materializes drawn', J(marks(born)));
  leg(hidden(maj) && maj._hiddenByDesktop, '§2 S …the previous hero (home Scra) is the desktop\'s again, hidden', J(marks(maj)));
  wm.focusWindow('maj'); await new Promise((r) => setTimeout(r, 0));
  leg(hidden(born) && born._hiddenByStage && !born._hiddenByDesktop, '§2 S the Stage-born chat, parked by the next switch: parked by the STAGE — box hidden, aria-hidden, content-visibility, its view SUSPENDED (every hider suspends; 2.369.198 left it running and in the AX tree)', J(marks(born)));
  leg(drawn(maj), '§2 S …and Majordomo, borrowed back from its desktop, is drawn', J(marks(maj)));
  wm.focusWindow('born'); await new Promise((r) => setTimeout(r, 0));
  leg(drawn(born) && hidden(maj), '§2 S the parked chat materialized again: drawn', J(marks(born)));

  // G — a GROUP hero: its guest is drawn by the host; the borrow clears the whole frame, the hand-back hides it
  await switchTo('fin');
  const gHost = mkWin('gh', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c201' });
  const gGuest = mkWin('gg', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c202' });
  const chain = { tabs: ['gh', 'gg'], active: 1, layout: 'tabs' };
  gHost._tabChain = chain; gGuest._tabChain = chain; gHost.content.classList.add('tab-hidden'); gGuest.element.style.display = 'none';
  dm._hideWin(gHost); dm._hideWin(gGuest);
  leg(hidden(gHost) && sessions.get('gg')._suspended && sessions.get('gh')._suspended, '§2 G a group on Scra: its host hidden, both views suspended', J({ gh: marks(gHost), gg: marks(gGuest) }));
  await switchTo(STAGE_ID);
  wm.focusWindow('gh'); await new Promise((r) => setTimeout(r, 0));
  const gm = marks(gHost);
  leg(sm._heroWinId === 'gh' && gm.vis === '' && gm.cv === '' && gm.aria === null && !gHost._hiddenByDesktop && !gGuest._hiddenByDesktop && !gGuest._hiddenByStage, '§2 G the group borrowed: the host\'s element unmarked, no reason left on ANY member (2.369.198: the guest kept its desktop flag)', J({ gh: gm, gg: marks(gGuest) }));
  leg(sessions.get('gg')._suspended === false && [...sessions.get('gg')._hiddenReasons].length === 0, '§2 G …the SHOWN guest\'s view runs (its content is drawn by the host; 2.369.198 left it suspended on the Stage)', J(marks(gGuest)));
  leg(sessions.get('gh')._suspended === true && J([...sessions.get('gh')._hiddenReasons]) === J(['tab']), '§2 G …the host\'s own view, its tab not on show, is suspended by the TAB reason only — and the host ELEMENT stays unmarked (the tab reason never marks it: it draws the guest)', J(marks(gHost)));
  await switchTo('work');
  leg(hidden(gHost) && gHost._hiddenByDesktop && gGuest._hiddenByDesktop && sessions.get('gg')._suspended, '§2 G leave: the whole FRAME is the desktop\'s again (both members carry the reason, the guest\'s view suspended)', J({ gh: marks(gHost), gg: marks(gGuest) }));
  await switchTo('scra');
  const gm2 = marks(gHost);
  leg(gm2.vis === '' && gm2.cv === '' && gm2.aria === null && !gm2.desk && !gGuest._hiddenByDesktop && sessions.get('gg')._suspended === false && J(gm2.reasons) === J(['tab']), '§2 G …and its home desktop shows it whole (the host element unmarked, the shown guest running, the host\'s own view held by its tab only)', J({ gh: gm2, gg: marks(gGuest) }));
  // the DOOR derives the whole FRAME (verify r1 V6: every hider happens to iterate the members itself, so this belt had no
  // leg): a reason set on the HOST alone reaches the guest's view — a guest is drawn by its host, so its view must follow
  wm.setWindowHidden(gHost, { desktop: true });
  leg(hidden(gHost) && sessions.get('gg')._suspended === true && [...sessions.get('gg')._hiddenReasons].includes('desktop'), '§2 G the door derives the FRAME: the desktop reason set on the host ALONE suspends the shown guest\'s view (a derivation of the host only leaves it paging on hidden geometry)', J({ gg: marks(gGuest), gh: marks(gHost) }));
  wm.setWindowHidden(gHost, { desktop: false });
  leg(!hidden(gHost) && sessions.get('gg')._suspended === false && !sessions.get('gg')._hiddenReasons.has('desktop'), '§2 G …cleared on the host alone, the guest\'s view resumes', J(marks(gGuest)));

  // P — the host of a hidden group leaves it: the promoted guest draws the frame and carries its hiding
  await switchTo('fin');
  const pHost = mkWin('ph1', 'files', 'scra'), pGuest = mkWin('pg1', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c301' });
  const pch = { tabs: ['ph1', 'pg1'], active: 0, layout: 'tabs' };
  pHost._tabChain = pch; pGuest._tabChain = pch; pGuest.content.classList.add('tab-hidden');
  pHost.element.contains = () => true; pHost.element.removeChild = () => { }; pGuest.element.appendChild = () => { }; pGuest.element.contains = () => false; pHost.element.appendChild = () => { };
  dm._hideWin(pHost); dm._hideWin(pGuest);
  try { wm._detachFromChain(pch, 'ph1'); } catch (e) { leg(false, '§2 P the detach ran', e.stack); }
  leg(hidden(pGuest) && pGuest._hiddenByDesktop && pch.tabs[0] === 'pg1', '§2 P the promoted host of a desktop-hidden group stays hidden with its frame (its own element was display:none until now — it carries the frame\'s reason)', J({ pg1: marks(pGuest), tabs: pch.tabs }));

  // T — a torn-off guest takes its frame's reasons (inc-muly2izg-cks3, now through the door)
  const tHost = mkWin('th', 'chat', STAGE_ID), tGuest = mkWin('tg', 'browser-live', STAGE_ID);
  wm.setWindowHidden(tGuest, { stage: true });
  wm._matchFrameVisibility(tGuest, tHost);
  leg(drawn(tGuest), '§2 T a guest carrying the Stage\'s hide, leaving a SHOWN frame ⇒ every mark goes', J(marks(tGuest)));
  wm._matchFrameVisibility(tGuest, { _hiddenByDesktop: true });
  leg(hidden(tGuest) && tGuest._hiddenByDesktop && !tGuest._hiddenByStage, '§2 T …leaving a desktop-hidden frame ⇒ hidden by the desktop (exactly the frame\'s reasons)', J(marks(tGuest)));

  // the drag lends visibility: a derivation mid-drag never unhides a window lent to the preview ghost
  work1.element.classList.add('dragging'); work1.element.style.visibility = 'hidden';
  await switchTo('work');
  leg(work1.element.style.visibility === 'hidden' && work1.element.style.contentVisibility === '' && work1.element.getAttribute('aria-hidden') === null, '§2 a shown window under a live title-bar drag keeps the visibility the drag lent to its preview ghost (the rest is derived)', J(marks(work1)));
  work1.element.classList.remove('dragging'); wm.syncHiddenViews();
  leg(drawn(work1), '§2 …and the next derivation after the drop heals it', J(marks(work1)));
  // healStray (verify r1 V6: no leg had it): a placeholder that leaked onto a desktop is the Stage's again — PARKED while
  // the Stage is off (a healed placeholder shown with no reason = a stray "Stage" box on the desktop at boot)
  ph._desktopId = 'work'; wm.setWindowHidden(ph, { stage: false, desktop: false });
  sm.healStray();
  leg(ph._desktopId === STAGE_ID && hidden(ph) && ph._hiddenByStage && !ph._hiddenByDesktop, '§2 healStray with the Stage off: a leaked placeholder is re-tagged the Stage\'s and PARKED through the door (never a stray Stage box on the desktop)', J(marks(ph)));

  // ── verify r1 — A SESSION IS NEVER A FREE WINDOW ON THE STAGE: a split of the hero's group leaves one standing ──
  const mkChain = (h, g) => { const c = { tabs: [h.id, g.id], active: 0, layout: 'tabs' }; h._tabChain = c; g._tabChain = c; g.content.classList.add('tab-hidden'); g.element.style.display = 'none'; h.element.kids = new Set([g.content]); h.element.contains = (x) => h.element.kids.has(x); h.element.removeChild = (x) => h.element.kids.delete(x); h.element.appendChild = (x) => h.element.kids.add(x); g.element.appendChild = () => { }; g.element.contains = () => false; g.element.removeChild = () => { }; return c; };
  // X1 the hero (the host) tears its own tab off: the promoted guest — a session, not the hero — is hidden its way
  await switchTo('fin');
  const xh = mkWin('xh', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c401' }), xg = mkWin('xg', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c402' });
  const xc = mkChain(xh, xg); dm._hideWin(xh); dm._hideWin(xg);
  await switchTo(STAGE_ID);
  wm.focusWindow('xh'); await new Promise((r) => setTimeout(r, 0));
  leg(sm._heroWinId === 'xh' && marks(xh).vis === '' && !xg._hiddenByDesktop, '§2 X1 the group [xh host, xg guest] is the hero\'s frame on the Stage', J({ xh: marks(xh), xg: marks(xg) }));
  wm._detachFromChain(xc, 'xh');
  leg(!xh._tabChain && !xg._tabChain && sm._heroWinId === 'xh' && drawn(xh), '§2 X1 the hero tore its own tab off: it stays the hero, drawn, the group split', J({ xh: marks(xh), h: sm._heroWinId }));
  leg(hidden(xg) && xg._hiddenByDesktop && !xg._hiddenByStage && !sm._isStageVisible(xg), '§2 X1 the promoted xg — a session that is not the hero — is HIDDEN its way (its desktop\'s), not a free window the Stage does not own (c4f17e39: drawn, unowned)', J(marks(xg)));
  await switchTo('work');
  leg(hidden(xg) && xg._desktopId === 'scra', '§2 X1 leaving the Stage for Work: xg (home Scra) is not on Work (c4f17e39: it followed the user off the Stage)', J(marks(xg)));
  await switchTo('scra');
  leg(drawn(xg) && drawn(xh), '§2 X1 …on Scra both are drawn', J({ xh: marks(xh), xg: marks(xg) }));
  // X2 a GUEST is the hero and is torn off: the old host — a session, not the hero — is hidden; the dragged one stays the hero
  await switchTo('fin');
  const yh = mkWin('yh', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c403' }), yg = mkWin('yg', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c404' });
  const yc = mkChain(yh, yg); dm._hideWin(yh); dm._hideWin(yg);
  await switchTo(STAGE_ID);
  wm.focusWindow('yg'); await new Promise((r) => setTimeout(r, 0));
  leg(sm._heroWinId === 'yh' && marks(yh).vis === '' && yh._onStage && !yg._onStage && yc.active === 1, '§2 X2 THE FRAME IS THE HERO (verify r2): a guest yg named on the Stage materializes its HOST yh — the frame borrowed, yg\'s tab shown (57e900ab: yg was the hero, the slot on its display:none element, the frame at HOME)', J({ yh: marks(yh), h: sm._heroWinId, onStage: [yh._onStage, yg._onStage], active: yc.active }));
  wm._detachFromChain(yc, 'yg');
  wm.focusWindow('yg'); await new Promise((r) => setTimeout(r, 0)); // the tab drag's own next act (tab-group.js: focusWindow(winId))
  leg(sm._heroWinId === 'yg' && drawn(yg) && hidden(yh) && yh._hiddenByDesktop, '§2 X2 the torn-off guest is the hero (the drag\'s own focus), drawn; the old host yh is hidden its way', J({ yg: marks(yg), yh: marks(yh) }));
  await switchTo('work');
  leg(hidden(yh) && hidden(yg), '§2 X2 leaving for Work: neither is on Work', J({ yh: marks(yh), yg: marks(yg) }));
  // X3 the hero (the host) is CLOSED with another conversation as its tab: the close's own focus (removeFromTabChain →
  //    focusWindow(the next tab)) materializes the survivor as the hero — OWNED and drawn, never a free window (on
  //    2.369.198 it came up as the incident's blank box: its stale desktop mark survived the borrow)
  await switchTo('fin');
  const zh = mkWin('zh', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c405' }), zg = mkWin('zg', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c406' });
  mkChain(zh, zg); dm._hideWin(zh); dm._hideWin(zg);
  await switchTo(STAGE_ID);
  wm.focusWindow('zh'); await new Promise((r) => setTimeout(r, 0));
  leg(sm._heroWinId === 'zh', '§2 X3 zh is the hero');
  wm.closeWindow('zh'); sessions.delete('zh'); await new Promise((r) => setTimeout(r, 0));
  leg(!wm.windows.has('zh') && sm._heroWinId === 'zg' && zg._onStage && drawn(zg) && !zg._tabChain && sm._isStageVisible(zg), '§2 X3 the hero closed: the survivor zg is the HERO by the close\'s own focus — owned by the Stage, drawn (never a free window; 2.369.198: a blank box)', J({ zg: marks(zg), h: sm._heroWinId, ph: marks(ph) }));
  await switchTo('work');
  leg(hidden(zg) && zg._hiddenByDesktop, '§2 X3 leaving for Work: zg (home Scra) is handed back, not on Work', J(marks(zg)));
  await switchTo('scra');
  leg(drawn(zg), '§2 X3 …on Scra it is drawn', J(marks(zg)));
  // X4 a non-session promoted survivor stays with the hero's workspace: a bound aux is never handed back
  await switchTo('fin');
  const ah = mkWin('ah', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c407' }), ag = mkWin('ag', 'browser-live', 'scra');
  const ac = mkChain(ah, ag); dm._hideWin(ah); dm._hideWin(ag);
  await switchTo(STAGE_ID);
  wm.focusWindow('ah'); await new Promise((r) => setTimeout(r, 0));
  sm._boundAux.set('ag', sm._heroKey || '__pending__');
  wm._detachFromChain(ac, 'ah');
  leg(sm._heroWinId === 'ah' && drawn(ah) && marks(ag).vis === '' && !ag._hiddenByDesktop && !ag._hiddenByStage, '§2 X4 the hero tore off; the promoted live view is a BOUND aux — it stays drawn (the hero\'s workspace)', J({ ah: marks(ah), ag: marks(ag) }));
  sm._boundAux.delete('ag');
  await switchTo('fin');

  // ── verify r2 — THE BOX a half of a split BORROWED frame keeps, and THE FRAME IS THE HERO ──
  const SLOT = sm.slotBounds();
  const nearSlot = (b) => !!b && ['left', 'top', 'width', 'height'].every((k) => Math.abs((b[k] ?? 0) - SLOT[k]) < 0.005);
  const nearBox = (a, b) => !!a && !!b && ['left', 'top', 'width', 'height'].every((k) => Math.abs((a[k] ?? 0) - (b[k] ?? 0)) < 0.005);
  const { tornOffBox: torn } = require(path.join(REPO, 'src/lib/stage-rules.js'));
  const beside = (home) => torn(home); // where the half that LEFT the frame lands: one cascade step off the home
  const frameDrawn = (w) => { const m = marks(w); return m.vis === '' && m.pe === '' && m.cv === '' && m.aria === null && !m.desk && !m.stage; }; // the frame's element (its own view may be held by its tab)
  const detachAsTabGroupDoes = (chain, id) => { const host = wm.windows.get(chain.tabs[0]); const promoted = chain.tabs[0] === id ? wm.windows.get(chain.tabs[1]) : null; wm._detachFromChain(chain, id); return { host, promoted }; };
  // X5 the hero's OWN tab torn off: the promoted survivor (a session, hidden its way) keeps the group's HOME box —
  //    tab-group's detach copied the host's box onto it, and a borrowed host's box is the SLOT (57e900ab: the
  //    survivor was drawn AT THE SLOT on Scra after the leave; the desktop's next capture recorded it)
  const q1 = mkWin('q1', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c501' }), q2 = mkWin('q2', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c502' }), q3 = mkWin('q3', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c511' });
  const qHome = { left: 0.0411, top: 0.081, width: 0.4113, height: 0.5787 }; q1.gridBounds = { ...qHome }; q2.gridBounds = { ...qHome }; q3.gridBounds = { ...qHome };
  const qc = mkChain(q1, q2); qc.tabs.push('q3'); q3._tabChain = qc; q3.content.classList.add('tab-hidden'); q3.element.style.display = 'none'; q1.element.kids.add(q3.content); q3.element.appendChild = () => { }; q3.element.contains = () => false; q3.element.removeChild = () => { };
  dm._hideWin(q1); dm._hideWin(q2); dm._hideWin(q3);
  await switchTo(STAGE_ID);
  wm.focusWindow('q1'); await new Promise((r) => setTimeout(r, 0));
  leg(sm._heroWinId === 'q1' && nearSlot(q1.gridBounds) && nearBox(q1._stageHomeBounds, qHome), '§2 X5 the group [q1 host, q2] is the hero\'s frame: q1\'s box the slot, its home remembered', J({ gb: q1.gridBounds, home: q1._stageHomeBounds }));
  q2.gridBounds = { ...SLOT }; q3.gridBounds = { ...SLOT }; // what tab-group's promotion copies (newHost.gridBounds = hostWin.gridBounds) — and the borrow's chain sync gave every guest the slot
  detachAsTabGroupDoes(qc, 'q1');
  leg(sm._heroWinId === 'q1' && hidden(q2) && q2._hiddenByDesktop, '§2 X5 q1 tore its own tab off: it stays the hero, q2 hidden by its desktop (verify r1)', J(marks(q2)));
  leg(nearBox(q2.gridBounds, qHome) && !nearSlot(q2.gridBounds), '§2 X5 …and q2\'s box is the GROUP\'S HOME, not the slot it inherited from the borrowed host\'s element (57e900ab: the slot — drawn at slot size on Scra after the leave, the slot-leaks-into-desktop-records class)', J({ gb: q2.gridBounds, home: qHome, slot: SLOT }));
  leg(q3._tabChain === qc && qc.tabs[0] === 'q2' && nearBox(q3.gridBounds, qHome) && !nearSlot(q3.gridBounds), '§2 X5 …and the third tab q3, now q2\'s guest, mirrors q2\'s box — the home, not the slot (the r2 walk, seed 23 under load: the survivor was placed, its remaining guest kept the slot on the record — the record class r1\'s resume finding came from)', J({ gb: q3.gridBounds, tabs: qc.tabs }));
  leg(nearBox(q2.element.box, qHome), '§2 X5 …and q2 is PLACED there at once (its element still sat at the slot px it inherited — a stale capture would have read the slot back)', J({ box: q2.element.box, home: qHome }));
  leg(nearBox(q1._stageHomeBounds, beside(qHome)), '§2 X5 …the torn-off hero q1 will land BESIDE where the group stood (one cascade step; exactly on top, the survivor sat hidden behind it)', J({ home: q1._stageHomeBounds, beside: beside(qHome) }));
  await switchTo('scra');
  leg(drawn(q2) && nearBox(q2.gridBounds, qHome) && nearBox(q1.gridBounds, beside(qHome)), '§2 X5 on Scra the frame q2 stands where the group stood, q1 beside it', J({ q1: q1.gridBounds, q2: q2.gridBounds }));
  // X6 the GUEST torn off the hero's group (the reverse): the torn-off one keeps the group's home too — its slot box
  //    was refused by the belt and it got a CASCADE home instead (57e900ab)
  await switchTo('fin');
  const r1 = mkWin('r1', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c503' }), r2 = mkWin('r2', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c504' });
  r1.gridBounds = { ...qHome }; r2.gridBounds = { ...qHome };
  const rc = mkChain(r1, r2); dm._hideWin(r1); dm._hideWin(r2);
  await switchTo(STAGE_ID);
  wm.focusWindow('r1'); await new Promise((r) => setTimeout(r, 0));
  r2.gridBounds = { ...SLOT }; // the detach's copy of the host's box (tab-group.js: win.gridBounds = hostWin.gridBounds)
  detachAsTabGroupDoes(rc, 'r2');
  wm.focusWindow('r2'); await new Promise((r) => setTimeout(r, 0)); // the drag's own focus: r2 materializes
  leg(sm._heroWinId === 'r2' && drawn(r2) && nearBox(r2._stageHomeBounds, torn(qHome, undefined, 1)), '§2 X6 the torn-off guest r2 is the hero and REMEMBERS a home BESIDE the group\'s — two steps: the second half torn off this home this session, X5\'s q1 was the first (verify r3) (57e900ab: a cascade box far from it — the belt refused the slot it inherited)', J({ home: r2._stageHomeBounds, beside: beside(qHome) }));
  await switchTo('scra');
  leg(drawn(r2) && nearBox(r2.gridBounds, torn(qHome, undefined, 1)) && nearBox(r1.gridBounds, qHome), '§2 X6 on Scra the frame r1 stands where the group stood, the torn-off r2 beside it', J({ r1: r1.gridBounds, r2: r2.gridBounds }));
  // X7 a press into the SHOWN GUEST tab of the hero group (its chat content, the title bar, a tab's ✕ — every press
  //    reaching the host element's _focusFromPointer names the tab on show): the frame STAYS in the slot, the hero
  //    stays the frame (57e900ab: the guest materialized, its host handed back HOME — the whole group jumped off the
  //    slot on the first click into it, and a ✕ never closed: the strip re-drew under the pointer)
  await switchTo('fin');
  const s1 = mkWin('s1', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c505' }), s2 = mkWin('s2', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c506' });
  s1.gridBounds = { ...qHome }; s2.gridBounds = { ...qHome };
  const sc = mkChain(s1, s2); dm._hideWin(s1); dm._hideWin(s2);
  await switchTo(STAGE_ID);
  wm.focusWindow('s1'); await new Promise((r) => setTimeout(r, 0));
  wm.switchTab(sc, 1); // s2's tab on show
  let switches = 0; const oSwitch = sm._materializeInner.bind(sm); sm._materializeInner = async (w) => { switches++; return oSwitch(w); };
  wm.focusWindow('s2'); await new Promise((r) => setTimeout(r, 0)); // = _focusFromPointer's focusWindow(the tab on show)
  sm._materializeInner = oSwitch;
  leg(sm._heroWinId === 's1' && s1._onStage && nearSlot(s1.gridBounds) && !s2._onStage && switches === 0 && wm.activeWindowId === 's2' && frameDrawn(s1), '§2 X7 a press into the shown guest of the hero group: NO hero switch — the frame s1 stays the hero in the slot, s2 is the active tab (57e900ab: s2 became the hero, s1 handed back home, the group off the slot)', J({ hero: sm._heroWinId, gb: s1.gridBounds, switches, active: wm.activeWindowId }));
  // X8 a guest of a HIDDEN group named on the Stage (the palette / go-to of a tab whose group lives on Scra):
  //    the FRAME (its session host) materializes, the guest's tab shown — the frame in the slot
  await switchTo('fin');
  const t1 = mkWin('t1', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c507' }), t2 = mkWin('t2', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c508' });
  t1.gridBounds = { ...qHome }; t2.gridBounds = { ...qHome };
  const tc2 = mkChain(t1, t2); dm._hideWin(t1); dm._hideWin(t2);
  await switchTo(STAGE_ID);
  wm.focusWindow('t2'); await new Promise((r) => setTimeout(r, 0));
  leg(sm._heroWinId === 't1' && t1._onStage && nearSlot(t1.gridBounds) && frameDrawn(t1) && tc2.active === 1 && !t2._onStage && nearBox(t1._stageHomeBounds, qHome), '§2 X8 a guest of a hidden group named on the Stage: its FRAME t1 is the hero in the slot, t2\'s tab shown, the frame\'s home remembered', J({ hero: sm._heroWinId, gb: t1.gridBounds, active: tc2.active, home: t1._stageHomeBounds }));
  await switchTo('scra');
  leg(frameDrawn(t1) && nearBox(t1.gridBounds, qHome) && !t1._onStage, '§2 X8 on Scra the group is where it stood', J(t1.gridBounds));
  // X9 the remembered hero grouped OFF the Stage under another session's host: the re-enter borrows the FRAME
  await switchTo('fin');
  const u1 = mkWin('u1', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c509' }), u2 = mkWin('u2', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c50a' });
  u1.gridBounds = { ...qHome }; u2.gridBounds = { ...qHome }; dm._hideWin(u1); dm._hideWin(u2);
  await switchTo(STAGE_ID);
  wm.focusWindow('u2'); await new Promise((r) => setTimeout(r, 0));
  leg(sm._heroWinId === 'u2', '§2 X9 u2 is the hero');
  await switchTo('scra');
  const uc = mkChain(u1, u2); // grouped on Scra with u1 the host (a merge drop / a remote record), the hero u2 a guest
  await switchTo(STAGE_ID);
  leg(sm._heroWinId === 'u1' && u1._onStage && nearSlot(u1.gridBounds) && frameDrawn(u1) && !u2._onStage && uc.active === 1, '§2 X9 re-entered: the remembered hero comes back as its FRAME u1 (borrowed, in the slot), u2\'s tab shown (57e900ab: u2 re-borrowed as a guest — the slot on a display:none element, the frame at HOME)', J({ hero: sm._heroWinId, gb: u1.gridBounds, active: uc.active }));
  // X10 a chain JOINED while staged with the hero as a guest of a session host (a remote record applied in place — the
  //     pending-chain timer): the frame's host materializes
  await switchTo('scra');
  const v1 = mkWin('v1', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c50b' }), v2 = mkWin('v2', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c50c' });
  v1.gridBounds = { ...qHome }; v2.gridBounds = { ...qHome };
  await switchTo(STAGE_ID);
  wm.focusWindow('v2'); await new Promise((r) => setTimeout(r, 0));
  leg(sm._heroWinId === 'v2' && hidden(v1), '§2 X10 v2 is the hero, v1 hidden on Scra');
  const vc = mkChain(v1, v2); sm.onChainJoined(vc); await new Promise((r) => setTimeout(r, 0)); // = tab-group's hook after createTabChain / addToTabChain / restoreTabChain
  leg(sm._heroWinId === 'v1' && v1._onStage && frameDrawn(v1) && nearSlot(v1.gridBounds) && !v2._onStage && vc.active === 1, '§2 X10 the frame\'s host v1 is the hero, drawn in the slot, v2\'s tab shown (57e900ab: the hero a guest of a HIDDEN host — the frame hidden, the hero gone)', J({ hero: sm._heroWinId, v1: marks(v1), gb: v1.gridBounds, active: vc.active }));
  // X11 a guest's box MIRRORS its frame's: the hero's resize on the Stage synced its guests to the slot (window.js
  //     _captureGridBounds → _syncChainBounds); the hand-back re-syncs them to the home (57e900ab: a guest tab
  //     resumed / billing-switched off the Stage later carried the slot onto the desktop)
  await switchTo('scra');
  const w1 = mkWin('w1', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c50d' }), w2 = mkWin('w2', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c50e' });
  w1.gridBounds = { ...qHome }; w2.gridBounds = { ...qHome }; const wc = mkChain(w1, w2);
  await switchTo(STAGE_ID);
  wm.focusWindow('w1'); await new Promise((r) => setTimeout(r, 0));
  leg(nearSlot(w2.gridBounds), '§2 X11 the borrow syncs the guest\'s box to the frame\'s (the slot)', J(w2.gridBounds));
  wm._syncChainBounds(wc); // the capture of a hero resized on the Stage
  await switchTo('scra');
  leg(nearBox(w2.gridBounds, qHome) && nearBox(w1.gridBounds, qHome) && !nearSlot(w2.gridBounds), '§2 X11 the hand-back re-syncs the guest\'s box to the group\'s home (57e900ab: the guest kept the slot)', J({ w1: w1.gridBounds, w2: w2.gridBounds }));
  // X12 a 2-tab group closed to one (off the Stage) while ANOTHER window is active: the survivor's tab is on show and
  //     its view runs (57e900ab: the derivation ran before its tab-hidden went — suspended by a stale `tab` reason)
  const k1 = mkWin('k1', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c50f' }), k2 = mkWin('k2', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c510' });
  const kc = mkChain(k1, k2); wm.syncHiddenViews();
  leg(sessions.get('k2')._suspended === true && sessions.get('k2')._hiddenReasons.has('tab'), '§2 X12 the group [k1 host, k2] on Scra: k2\'s tab not on show, its view held by the tab reason');
  wm.activeWindowId = 'w1';
  wm.removeFromTabChain(kc, 'k1'); sessions.delete('k1'); await new Promise((r) => setTimeout(r, 0));
  leg(!k2._tabChain && !k2.content.classList.contains('tab-hidden') && sessions.get('k2')._suspended === false && !sessions.get('k2')._hiddenReasons.has('tab'), '§2 X12 k1 closed by its ✕ with another window active: the survivor k2 stands alone, its tab on show, its view RUNNING (57e900ab: suspended by a stale tab reason until the next focus)', J({ reasons: [...sessions.get('k2')._hiddenReasons], susp: sessions.get('k2')._suspended }));
  // ── verify r3 ──
  // X13 A MAXIMIZE ON THE STAGE IS A SLOT EDIT (decision ③): the hero maximized ON the Stage (the real toggleMaximize keeps the
  //     slot px as its prevBounds); leave; un-maximize on Scra ⇒ the window is at its HOME (f5635f9d, measured on the real
  //     toggleMaximize: handed back still maximized, the un-maximize on Scra landed it at the SLOT — the slot-leaks-into-
  //     desktop-records class the belt exists for)
  await switchTo('fin');
  const m1 = mkWin('m1', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c512' }); m1.gridBounds = { ...qHome }; wm._applyGridBounds(m1); dm._hideWin(m1);
  await switchTo(STAGE_ID);
  wm.focusWindow('m1'); await tick();
  wm.toggleMaximize('m1'); await tick(); await tick();
  leg(sm._heroWinId === 'm1' && m1.isMaximized && nearBox(m1.element.box, FULL) && nearBox(sm.slotBounds(), FULL), '§2 X13 the hero maximized on the Stage fills the workspace; the shared slot follows it (decision ③: a hero resize edits the slot)', J({ hero: sm._heroWinId, max: m1.isMaximized, box: m1.element.box, slot: sm.slotBounds() }));
  await switchTo('scra'); await tick(); await tick();
  const m1Back = { max: m1.isMaximized, gb: m1.gridBounds, box: m1.element.box, prev: m1.prevBounds };
  if (m1.isMaximized) { wm.toggleMaximize('m1'); await tick(); await tick(); }
  leg(!m1.isMaximized && nearBox(m1.gridBounds, qHome) && nearBox(m1.element.box, qHome) && !nearBox(m1.gridBounds, FULL), '§2 X13 on Scra, un-maximized, it is at its HOME — never the slot (f5635f9d: the slot, through prevBounds)', J({ back: m1Back, gb: m1.gridBounds, box: m1.element.box, home: qHome }));
  sm.saveSlot(SLOT); // the slot back for the legs after (the maximize rewrote it)
  // X20 THE FOLLOW'S BLACKOUT SWALLOWED THE USER'S NEXT CLICK (verify r3, the walk's slow-timer phase; 2.112.6): entering the
  //     Stage adopts the shared hero (h1) — the follow's own materialize must not echo it back; but the 800 ms `_applyingRemoteHero`
  //     was a time box over EVERY publish: the user's click on h2 within it went unpublished, the record stayed h1, and the next
  //     enter() yanked the Stage back to h1
  await switchTo('fin');
  const h1 = mkWin('h1', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c51e' }), h2 = mkWin('h2', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c51f' });
  h1.gridBounds = { ...qHome }; h2.gridBounds = { ...qHome }; dm._hideWin(h1); dm._hideWin(h2);
  store.set('hero', J({ key: 'claude:e2e00000-0000-4000-8000-00000000c51e', openSpec: h1._openSpec })); // another device's hero
  await switchTo(STAGE_ID); sm._followRemoteHero(); await tick(); await tick(); // = enter()'s 100 ms follow
  leg(sm._heroWinId === 'h1' && JSON.parse(store.get('hero')).key.endsWith('c51e'), '§2 X20 entering adopts the shared hero h1', J({ hero: sm._heroWinId, rec: store.get('hero') }));
  wm.focusWindow('h2'); await tick(); await tick(); // the user's own click, inside the follow's 800 ms
  leg(sm._heroWinId === 'h2' && JSON.parse(store.get('hero')).key.endsWith('c51f'), '§2 X20 the user\'s click on h2 within the blackout IS published (f5635f9d: the record stayed h1)', J({ hero: sm._heroWinId, rec: store.get('hero') }));
  await switchTo('fin'); await switchTo(STAGE_ID); sm._followRemoteHero(); await tick(); await tick();
  leg(sm._heroWinId === 'h2', '§2 X20 leaving and entering again keeps h2 — the follow finds its own record (f5635f9d: yanked back to h1)', J({ hero: sm._heroWinId, rec: store.get('hero') }));
  store.delete('hero'); sm._applyingRemoteHero = false;
  await switchTo('fin');
  // X19 A RESTORED CHAIN LIVES ON ONE DESKTOP (verify r3): a record names f1 (Scra) as the host of f2, which this page holds
  //     on Fin — restoreTabChain puts f2 on the host's desktop (createTabChain / addToTabChain always did); f5635f9d spanned
  //     two: f2 detached later took the FRAME's desktop reason and stayed hidden on the desktop on show
  await switchTo('fin');
  const f1 = mkWin('f1', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c51c' }), f2 = mkWin('f2', 'chat', 'fin', { sid: 'e2e00000-0000-4000-8000-00000000c51d' });
  f1.gridBounds = { ...qHome }; f2.gridBounds = { ...qHome }; dm._hideWin(f1); wm._applyGridBounds(f1); wm.syncHiddenViews();
  f1.element.kids = new Set(); f1.element.contains = (x) => f1.element.kids.has(x); f1.element.removeChild = (x) => f1.element.kids.delete(x); f1.element.appendChild = (x) => f1.element.kids.add(x); f2.element.appendChild = () => { }; f2.element.contains = () => false; f2.element.removeChild = () => { };
  wm.restoreTabChain(['f1', 'f2'], 1, { layout: 'tabs' }); await tick();
  leg(f2._tabChain === f1._tabChain && f2._desktopId === 'scra' && hidden(f2) && sessions.get('f2')._suspended === true, '§2 X19 the restored guest f2 is on its host\'s desktop (Scra), hidden with its frame (f5635f9d: on Fin, a chain across two desktops)', J({ desk: f2._desktopId, m: marks(f2) }));
  wm._detachFromChain(f1._tabChain, 'f2'); await tick();
  leg(!f2._tabChain && f2._desktopId === 'scra' && f2._hiddenByDesktop && hidden(f2), '§2 X19 detached, f2 keeps the frame\'s desktop reason ON THE FRAME\'S DESKTOP — no window hidden for good on the desktop on show', J({ desk: f2._desktopId, m: marks(f2) }));
  await switchTo('scra');
  leg(drawn(f2) && drawn(f1), '§2 X19 on Scra both are drawn', J({ f1: marks(f1), f2: marks(f2) }));
  await switchTo('fin');
  // X16 A LEGITIMATELY SLOT-SHAPED HOME (verify r3, r2's held #5): a Scra chat snapped to the very zone the slot is (the snap
  //     fractions sit inside _nearSlot's tolerance on a tall workspace); borrowed and handed back it is at ITS box (f5635f9d:
  //     the r1 belt refused it as residue and the Stage gave it a cascade box)
  await switchTo('scra');
  const g1 = mkWin('g1', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c51b' }); g1.gridBounds = { ...SLOT }; wm._applyGridBounds(g1);
  await switchTo('fin'); await switchTo(STAGE_ID);
  wm.focusWindow('g1'); await tick();
  leg(sm._heroWinId === 'g1' && nearBox(g1._stageHomeBounds, SLOT), '§2 X16 borrowed: the slot-shaped box is remembered as the home (f5635f9d: a cascade box)', J({ home: g1._stageHomeBounds, slot: SLOT }));
  await switchTo('scra');
  leg(nearBox(g1.gridBounds, SLOT) && nearBox(g1.element.box, SLOT) && !g1._onStage, '§2 X16 on Scra it is back at its own box', J({ gb: g1.gridBounds, box: g1.element.box }));
  await switchTo('fin');
  // X15 A REMOTE RECORD RE-FORMS THE HERO'S OWN FRAME (verify r3): [e1 host, e2] at home; layout.js _reconcileChain's steps —
  //     every member detached, the record [e2 host, e1] restored — then the leave: the group stands where it stood
  //     (f5635f9d: the detach handed e2 a box BESIDE the home and the borrow of the re-formed frame took it as the group's
  //     home — the group crept one cascade step per regroup; measured in Chrome)
  await switchTo('scra');
  const eHome = { left: 0.15, top: 0.25, width: 0.4, height: 0.5 };
  const e1 = mkWin('e1', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c519' }), e2 = mkWin('e2', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c51a' });
  e1.gridBounds = { ...eHome }; e2.gridBounds = { ...eHome }; wm._applyGridBounds(e1);
  mkChain(e1, e2);
  await switchTo('fin'); await switchTo(STAGE_ID);
  wm.focusWindow('e1'); await tick();
  for (const id of ['e2', 'e1']) { const w = wm.windows.get(id); if (w._tabChain) wm._detachFromChain(w._tabChain, id); }
  wm.restoreTabChain(['e2', 'e1'], 1, { layout: 'tabs' }); await tick(); await tick();
  leg(sm._heroWinId === 'e2' && e2._onStage && nearBox(e2.element.box, SLOT) && nearBox(e2._stageHomeBounds, eHome) && !e2._stageGivenHome, '§2 X15 the re-formed frame\'s host e2 is the hero in the slot and REMEMBERS the group\'s home (f5635f9d: the box beside it)', J({ hero: sm._heroWinId, box: e2.element.box, home: e2._stageHomeBounds, eHome }));
  await switchTo('scra');
  leg(nearBox(e2.gridBounds, eHome) && nearBox(e1.gridBounds, eHome) && nearBox(e2.element.box, eHome), '§2 X15 on Scra the group [e2 host, e1] stands where it stood — a remote regroup is not a tear', J({ e1: e1.gridBounds, e2: e2.gridBounds, box: e2.element.box }));
  await switchTo('fin');
  // X15b THE STAMP IS HONOURED ONLY WHERE THE HALF STILL STANDS (verify r4): the hero group [n1 host, n2] at nHome; n1 tears its
  //      own tab off (n2 the promoted survivor: at nHome, stamped with it and with the box it was placed at); leave; the user
  //      MOVES n2 by hand to nB on Scra; the Stage again (n1 the hero); a remote record re-forms [n2 host, n1] — the group's
  //      home is nB, where the user put n2 (97cbf0b2: the stale stamp won and the group jumped back to nHome)
  await switchTo('scra');
  const nHome = { left: 0.12, top: 0.22, width: 0.4, height: 0.5 }, nB = { left: 0.55, top: 0.45, width: 0.4, height: 0.5 };
  const n1 = mkWin('n1', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c51c' }), n2 = mkWin('n2', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c51d' });
  n1.gridBounds = { ...nHome }; n2.gridBounds = { ...nHome }; wm._applyGridBounds(n1);
  const nc = mkChain(n1, n2);
  await switchTo('fin'); await switchTo(STAGE_ID);
  wm.focusWindow('n1'); await tick();
  detachAsTabGroupDoes(nc, 'n1'); wm.focusWindow('n1'); await tick(); await tick();
  leg(sm._heroWinId === 'n1' && !n2._tabChain && nearBox(n2.gridBounds, nHome) && !!n2._stageGivenHome && nearBox(n2._stageGivenHome.gridBounds, nHome) && nearBox(n2._stageGivenHome.at, nHome), '§2 X15b the promoted n2 stands at the group\'s home, stamped with it AND with the box it was placed at', J({ gb: n2.gridBounds, stamp: n2._stageGivenHome }));
  await switchTo('scra');
  n2.gridBounds = { ...nB }; wm._applyGridBounds(n2); wm._captureGridBounds(n2); // the user's own move, off the Stage
  await switchTo('fin'); await switchTo(STAGE_ID); await tick();
  wm.restoreTabChain(['n2', 'n1'], 1, { layout: 'tabs' }); await tick(); await tick();
  leg(sm._heroWinId === 'n2' && nearBox(n2._stageHomeBounds, nB) && !n2._stageGivenHome, '§2 X15b the re-formed frame [n2 host, n1] remembers nB — where the user put n2 — never the stale stamp (97cbf0b2: nHome)', J({ hero: sm._heroWinId, home: n2._stageHomeBounds, nB, nHome }));
  await switchTo('scra');
  leg(nearBox(n2.gridBounds, nB) && nearBox(n1.gridBounds, nB) && nearBox(n2.element.box, nB), '§2 X15b on Scra the group stands at nB', J({ n1: n1.gridBounds, n2: n2.gridBounds }));
  await switchTo('fin');
  // X18 TWO TEARS FROM ONE FRAME (verify r3): the hero group [d1 host, d2, d3]; d2 torn off (the hero), back to d1, d3 torn off;
  //     on Scra d2 and d3 are NOT on each other (f5635f9d: both one step off the home — the first hidden behind the second)
  await switchTo('scra');
  const d1 = mkWin('d1', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c516' }), d2 = mkWin('d2', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c517' }), d3 = mkWin('d3', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c518' });
  const dHome = { left: 0.12, top: 0.2, width: 0.4, height: 0.5 };
  for (const w of [d1, d2, d3]) w.gridBounds = { ...dHome }; wm._applyGridBounds(d1);
  const dc = mkChain(d1, d2); dc.tabs.push('d3'); d3._tabChain = dc; d3.content.classList.add('tab-hidden'); d3.element.style.display = 'none'; d1.element.kids.add(d3.content); d3.element.appendChild = () => { }; d3.element.contains = () => false; d3.element.removeChild = () => { };
  await switchTo('fin'); await switchTo(STAGE_ID);
  wm.focusWindow('d1'); await tick();
  detachAsTabGroupDoes(dc, 'd2'); wm.focusWindow('d2'); await tick(); await tick();
  wm.focusWindow('d1'); await tick(); await tick();
  detachAsTabGroupDoes(dc, 'd3'); wm.focusWindow('d3'); await tick(); await tick();
  leg(sm._heroWinId === 'd3' && nearBox(d3._stageHomeBounds, torn(dHome, undefined, 1)) && nearBox(d2.gridBounds, torn(dHome)), '§2 X18 the second half torn off the same home steps once more than the first', J({ d2: d2.gridBounds, d3home: d3._stageHomeBounds }));
  await switchTo('scra');
  leg(nearBox(d1.gridBounds, dHome) && !nearBox(d2.gridBounds, d3.gridBounds) && !nearBox(d2.gridBounds, d1.gridBounds) && !nearBox(d3.gridBounds, d1.gridBounds), '§2 X18 on Scra the frame d1 stands at home, d2 and d3 each beside it and apart from each other', J({ d1: d1.gridBounds, d2: d2.gridBounds, d3: d3.gridBounds }));
  await switchTo('fin');
  // X18b THE STEP IS AN OCCUPANCY, NEVER A COUNT (verify r4): the hero group [p1 host, p2] at pHome; a plain window p0 already
  //      stands at the first step beside pHome (the shape a half torn off BEFORE A RELOAD leaves — r3's count was in memory
  //      and the reload lost it); p2 torn off lands at the SECOND step, apart from p0 (97cbf0b2: exactly on p0)
  await switchTo('scra');
  const pHome = { left: 0.14, top: 0.18, width: 0.4, height: 0.5 };
  const p0 = mkWin('p0', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c51e' }); p0.gridBounds = torn(pHome, undefined, 0); wm._applyGridBounds(p0);
  const p1 = mkWin('p1', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c51f' }), p2 = mkWin('p2', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c520' });
  p1.gridBounds = { ...pHome }; p2.gridBounds = { ...pHome }; wm._applyGridBounds(p1);
  const pc = mkChain(p1, p2);
  await switchTo('fin'); await switchTo(STAGE_ID);
  wm.focusWindow('p1'); await tick();
  detachAsTabGroupDoes(pc, 'p2'); wm.focusWindow('p2'); await tick(); await tick();
  leg(sm._heroWinId === 'p2' && nearBox(p2._stageHomeBounds, torn(pHome, undefined, 1)) && !nearBox(p2._stageHomeBounds, p0.gridBounds), '§2 X18b a half torn off a home whose first step a window already occupies takes the SECOND step — the step is what stands on the desktop, never a count (97cbf0b2: exactly on p0, the count reset by a reload)', J({ p2home: p2._stageHomeBounds, p0: p0.gridBounds }));
  await switchTo('scra');
  leg(nearBox(p1.gridBounds, pHome) && !nearBox(p2.gridBounds, p0.gridBounds) && !nearBox(p2.gridBounds, p1.gridBounds), '§2 X18b on Scra p1 stands at home, p2 apart from p0 and from p1', J({ p0: p0.gridBounds, p1: p1.gridBounds, p2: p2.gridBounds }));
  await switchTo('fin');
  // X18c A GUEST CLOSED FROM THE FRAME PLACES NOTHING (verify r4): the hero group [j1 host, j2, j3]; j2 closed by its ✕; j3 torn
  //      off lands at the FIRST step (97cbf0b2: the second — the close had consumed a count)
  await switchTo('scra');
  const jHome = { left: 0.16, top: 0.2, width: 0.4, height: 0.5 };
  const j1 = mkWin('j1', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c521' }), j2 = mkWin('j2', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c522' }), j3 = mkWin('j3', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c523' });
  for (const w of [j1, j2, j3]) w.gridBounds = { ...jHome }; wm._applyGridBounds(j1);
  const jc = mkChain(j1, j2); jc.tabs.push('j3'); j3._tabChain = jc; j3.content.classList.add('tab-hidden'); j3.element.style.display = 'none'; j1.element.kids.add(j3.content); j3.element.appendChild = () => { }; j3.element.contains = () => false; j3.element.removeChild = () => { };
  await switchTo('fin'); await switchTo(STAGE_ID);
  wm.focusWindow('j1'); await tick();
  wm.removeFromTabChain(jc, 'j2'); sessions.delete('j2'); await tick(); await tick();
  leg(sm._heroWinId === 'j1' && !wm.windows.has('j2') && jc.tabs.length === 2, '§2 X18c j2 closed by its ✕: j1 still the hero, the group [j1, j3]', J({ hero: sm._heroWinId, tabs: jc.tabs }));
  detachAsTabGroupDoes(jc, 'j3'); wm.focusWindow('j3'); await tick(); await tick();
  leg(sm._heroWinId === 'j3' && nearBox(j3._stageHomeBounds, torn(jHome, undefined, 0)), '§2 X18c the first half actually placed beside the home takes the FIRST step (97cbf0b2: the second — a close consumed a count)', J({ r3home: j3._stageHomeBounds, want: torn(jHome, undefined, 0) }));
  await switchTo('scra');
  leg(nearBox(j1.gridBounds, jHome) && nearBox(j3.gridBounds, torn(jHome, undefined, 0)), '§2 X18c on Scra j1 at home, j3 one step beside it', J({ j1: j1.gridBounds, j3: j3.gridBounds }));
  await switchTo('fin');
  // X18d THE FRAME'S OWN BOXES ARE NEVER OCCUPANCY (verify r4): the slot itself sits exactly at the first step beside lHome;
  //      the hero group [l1 host, l2] borrowed there (both members' boxes = the slot); l2 torn off still takes the FIRST
  //      step (the halves and their chains are left out of the occupancy — counted, it would skip a free step)
  const lSlot0 = sm.slotBounds();
  await switchTo('scra');
  const lHome = { left: 0.42, top: 0.05, width: 0.3, height: 0.3 };
  sm.saveSlot(torn(lHome, undefined, 0));
  leg(![...wm.windows.values()].some((w) => w._desktopId === 'scra' && nearBox(w.gridBounds, torn(lHome, undefined, 0))), '§2 X18d (precondition) nothing on Scra stands at the first step beside lHome', J([...wm.windows.values()].filter((w) => w._desktopId === 'scra').map((w) => [w.id, w.gridBounds])));
  const l1 = mkWin('l1', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c524' }), l2 = mkWin('l2', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c525' });
  l1.gridBounds = { ...lHome }; l2.gridBounds = { ...lHome }; wm._applyGridBounds(l1);
  const lc = mkChain(l1, l2);
  await switchTo('fin'); await switchTo(STAGE_ID);
  wm.focusWindow('l1'); await tick();
  leg(sm._heroWinId === 'l1' && nearBox(l1.element.box, torn(lHome, undefined, 0)) && nearBox(l2.gridBounds, torn(lHome, undefined, 0)), '§2 X18d the frame is borrowed onto a slot that IS the first step beside its home (both members\' boxes the slot)', J({ box: l1.element.box, l2: l2.gridBounds, slot: sm.slotBounds() }));
  detachAsTabGroupDoes(lc, 'l2'); wm.focusWindow('l2'); await tick(); await tick();
  leg(sm._heroWinId === 'l2' && nearBox(l2._stageHomeBounds, torn(lHome, undefined, 0)), '§2 X18d l2 torn off takes the FIRST step — the frame\'s own boxes (the slot) are never occupancy', J({ q2home: l2._stageHomeBounds, want: torn(lHome, undefined, 0) }));
  await switchTo('scra');
  leg(nearBox(l1.gridBounds, lHome) && nearBox(l2.gridBounds, torn(lHome, undefined, 0)), '§2 X18d on Scra l1 at home, l2 one step beside it', J({ l1: l1.gridBounds, l2: l2.gridBounds }));
  sm.saveSlot(lSlot0);
  await switchTo('fin');
  // X18e ANOTHER DESKTOP'S WINDOWS ARE NEVER OCCUPANCY (verify r4, the revert table's Q2d): a Fin window stands exactly at the
  //      first step beside oHome; the hero group [o1 host, o2] lives on Scra; o2 torn off takes the FIRST step on Scra
  await switchTo('fin');
  const oHome = { left: 0.46, top: 0.5, width: 0.3, height: 0.3 };
  const oFin = mkWin('oFin', 'chat', 'fin', { sid: 'e2e00000-0000-4000-8000-00000000c526' }); oFin.gridBounds = torn(oHome, undefined, 0); wm._applyGridBounds(oFin);
  await switchTo('scra');
  leg(![...wm.windows.values()].some((w) => w._desktopId === 'scra' && nearBox(w.gridBounds, torn(oHome, undefined, 0))), '§2 X18e (precondition) nothing on Scra stands at the first step beside oHome — only the Fin window does', J([...wm.windows.values()].filter((w) => w._desktopId === 'scra').map((w) => [w.id, w.gridBounds])));
  const o1 = mkWin('o1', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c527' }), o2 = mkWin('o2', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c528' });
  o1.gridBounds = { ...oHome }; o2.gridBounds = { ...oHome }; wm._applyGridBounds(o1);
  const oc = mkChain(o1, o2);
  await switchTo('fin'); await switchTo(STAGE_ID);
  wm.focusWindow('o1'); await tick();
  detachAsTabGroupDoes(oc, 'o2'); wm.focusWindow('o2'); await tick(); await tick();
  leg(sm._heroWinId === 'o2' && nearBox(o2._stageHomeBounds, torn(oHome, undefined, 0)), '§2 X18e o2 torn off takes the FIRST step — a window on another desktop is never occupancy', J({ o2home: o2._stageHomeBounds, want: torn(oHome, undefined, 0), fin: oFin.gridBounds }));
  await switchTo('scra');
  leg(nearBox(o1.gridBounds, oHome) && nearBox(o2.gridBounds, torn(oHome, undefined, 0)), '§2 X18e on Scra o1 at home, o2 one step beside it', J({ o1: o1.gridBounds, o2: o2.gridBounds }));
  await switchTo('fin');
  // X17 THE CORNER (verify r3): the hero group [c1 host, c2] whose home is the bottom-right quadrant; c2 torn off (the hero);
  //     on Scra c2 is NOT exactly on c1 (f5635f9d: tornOffBox clamped both axes back onto the home — c1 hidden behind c2)
  await switchTo('scra');
  const corner = { left: 0.5, top: 0.5, width: 0.5, height: 0.5 };
  const c1 = mkWin('c1', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c514' }), c2 = mkWin('c2', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c515' });
  c1.gridBounds = { ...corner }; c2.gridBounds = { ...corner }; wm._applyGridBounds(c1);
  const cc = mkChain(c1, c2);
  await switchTo('fin'); await switchTo(STAGE_ID);
  wm.focusWindow('c1'); await tick();
  detachAsTabGroupDoes(cc, 'c2'); wm.focusWindow('c2'); await tick(); await tick();
  leg(sm._heroWinId === 'c2' && nearBox(c2._stageHomeBounds, torn(corner)) && !nearBox(c2._stageHomeBounds, corner), '§2 X17 the torn-off c2 is the hero; its remembered home is BESIDE the corner home, not the corner itself', J({ hero: sm._heroWinId, home: c2._stageHomeBounds, corner }));
  await switchTo('scra');
  leg(nearBox(c1.gridBounds, corner) && nearBox(c1.element.box, corner) && !nearBox(c2.gridBounds, c1.gridBounds) && nearBox(c2.element.box, c2.gridBounds), '§2 X17 on Scra c1 stands at the corner and c2 beside it — never on it (f5635f9d: the same box; measured in Chrome: c1\'s title clicks landed in c2)', J({ c1: c1.gridBounds, c2: c2.gridBounds }));
  await switchTo('fin');
  // X14 A WINDOW MAXIMIZED AT HOME keeps its PRE-MAX box as its home: maximized on Scra (its captured fractions the full
  //     workspace), borrowed, handed back, un-maximized ⇒ at the pre-max box (f5635f9d: the home snapshotted from the full
  //     box — after the round trip the un-maximize gave a full-size window, the pre-max box lost)
  await switchTo('scra');
  const m2 = mkWin('m2', 'chat', 'scra', { sid: 'e2e00000-0000-4000-8000-00000000c513' }); m2.gridBounds = { ...qHome }; wm._applyGridBounds(m2);
  wm.toggleMaximize('m2'); await tick(); await tick();
  leg(m2.isMaximized && nearBox(m2.gridBounds, FULL) && nearBox(m2.prevBounds, qHome), '§2 X14 maximized at home: its captured fractions are the whole workspace, the pre-max box in prevBounds', J({ gb: m2.gridBounds, prev: m2.prevBounds }));
  await switchTo('fin'); await switchTo(STAGE_ID);
  wm.focusWindow('m2'); await tick(); await tick();
  leg(sm._heroWinId === 'm2' && !m2.isMaximized && m2._stageHomeMax && nearBox(m2._stageHomeBounds, qHome) && nearBox(m2.element.box, SLOT), '§2 X14 borrowed: un-maximized for the slot, the home remembered is the PRE-MAX box (f5635f9d: the full box)', J({ home: m2._stageHomeBounds, homeMax: m2._stageHomeMax, box: m2.element.box }));
  await switchTo('scra'); await tick(); await tick();
  leg(m2.isMaximized && nearBox(m2.prevBounds, qHome), '§2 X14 handed back it is maximized again, the pre-max box the one to come back to', J({ max: m2.isMaximized, prev: m2.prevBounds }));
  wm.toggleMaximize('m2'); await tick(); await tick();
  leg(!m2.isMaximized && nearBox(m2.gridBounds, qHome) && nearBox(m2.element.box, qHome), '§2 X14 un-maximized on Scra it is at its pre-max box', J({ gb: m2.gridBounds, box: m2.element.box }));
  await switchTo('fin');

  for (const v of sessions.values()) { try { v._clearResumeRetail(); } catch { } }
  return failed;
}
const { StageManager } = await import(path.join(REPO, 'src/lib/stage-manager.js'));
const sceneFailed = await sceneLegs({ StageMgr: StageManager });

// ── §2b THE GEOMETRY A REPLACED WINDOW CARRIES (verify r1 V4): a borrowed hero's HOME, never the slot ──
console.log('— §2b the geometry a replaced window carries (PURE stage-rules carriedGeometry — the resume / billing switch / restart snapshot)');
function geometryLegs(rules, { quiet = false } = {}) {
  const failed = [];
  const leg = (c, n, extra) => { if (!quiet) ok(c, n, extra); if (!c) failed.push(n); return !!c; };
  const { carriedGeometry } = rules;
  const slot = { left: 0.3, top: 0.04, width: 0.62, height: 0.8 }, home = { left: 0.0983, top: 0.1953, width: 0.2754, height: 0.3906 };
  const hero = { gridBounds: { ...slot }, preSnapBounds: null, isMaximized: false, _desktopId: 'scra', _onStage: true, _stageHomeBounds: { ...home }, _stageHomeMax: true };
  const snap = (w) => carriedGeometry({ gridBounds: w.gridBounds, preSnapBounds: w.preSnapBounds, isMaximized: w.isMaximized, desktopId: w._desktopId, onStage: w._onStage, stageHomeBounds: w._stageHomeBounds, stageHomeMax: w._stageHomeMax });
  const h = snap(hero);
  leg(J(h.gridBounds) === J(home) && h.isMaximized === true && h.desktopId === 'scra', '§2b a BORROWED hero carries its HOME box + its home maximize state + its home desktop — never the slot its element sits at (c4f17e39: the slot; leaving landed it at slot size on Scra, and the other client\'s record took it)', J(h));
  const plain = snap({ gridBounds: { ...home }, preSnapBounds: { left: 0.1, top: 0.1, width: 0.3, height: 0.3 }, isMaximized: true, _desktopId: 'fin', _onStage: false });
  leg(J(plain.gridBounds) === J(home) && plain.isMaximized === true && plain.desktopId === 'fin' && plain.preSnapBounds.width === 0.3, '§2b a window not on the Stage carries its own box, maximize state, pre-snap box and desktop (unchanged)', J(plain));
  const noHome = snap({ gridBounds: { ...slot }, _desktopId: 'scra', _onStage: true, _stageHomeBounds: null });
  leg(noHome.gridBounds === null && noHome.desktopId === 'scra', '§2b a borrowed window with no remembered home carries NO box (the Stage\'s belt gives it one at the next borrow), its desktop kept', J(noHome));
  leg(J(carriedGeometry({})) === J({ gridBounds: null, preSnapBounds: null, isMaximized: false, desktopId: null }) && carriedGeometry().desktopId === null, '§2b nothing in ⇒ nothing carried');
  // verify r2: a guest of a BORROWED frame carries the FRAME's home (its own box mirrors the host's = the slot)
  const guestOfHero = carriedGeometry({ gridBounds: { ...slot }, desktopId: 'scra', onStage: hero._onStage, stageHomeBounds: hero._stageHomeBounds, stageHomeMax: hero._stageHomeMax });
  leg(J(guestOfHero.gridBounds) === J(home) && guestOfHero.desktopId === 'scra', '§2b a GUEST of a borrowed frame, snapshotted with the frame\'s facts, carries the frame\'s HOME (never the slot its box mirrors)', J(guestOfHero));
  const { tornOffBox, TORN_OFF_STEP } = rules;
  leg(J(tornOffBox({ left: 0.1, top: 0.1, width: 0.4, height: 0.5 })) === J({ left: 0.1 + TORN_OFF_STEP, top: 0.1 + TORN_OFF_STEP, width: 0.4, height: 0.5 }), '§2b tornOffBox: one cascade step off the home, the size kept');
  leg(J(tornOffBox({ left: 0.62, top: 0.55, width: 0.4, height: 0.5 })) === J({ left: 0.62 - TORN_OFF_STEP, top: 0.55 - TORN_OFF_STEP, width: 0.4, height: 0.5 }) && tornOffBox(null) === null && tornOffBox({ left: 0.1 }) === null, '§2b tornOffBox: an axis with no room for the step forward steps BACKWARD (f5635f9d clamped it to the edge); nothing in ⇒ null');
  leg(J(tornOffBox({ left: 0.5, top: 0.5, width: 0.5, height: 0.5 })) === J({ left: 0.5 - TORN_OFF_STEP, top: 0.5 - TORN_OFF_STEP, width: 0.5, height: 0.5 }), '§2b tornOffBox: THE CORNER (a snapped bottom-right quadrant) — the half lands up-left of the frame, never ON it (f5635f9d: both clamps gave the home back — the frame hidden behind the torn-off hero, its title clicks landing in the hero; verify r3, measured in Chrome)');
  leg(J(tornOffBox({ left: 0.1, top: 0.1, width: 0.4, height: 0.5 }, TORN_OFF_STEP, 1)) === J({ left: 0.1 + 2 * TORN_OFF_STEP, top: 0.1 + 2 * TORN_OFF_STEP, width: 0.4, height: 0.5 }) && J(tornOffBox({ left: 0.1, top: 0.1, width: 0.4, height: 0.5 }, TORN_OFF_STEP, 2)) === J({ left: 0.1 + 3 * TORN_OFF_STEP, top: 0.1 + 3 * TORN_OFF_STEP, width: 0.4, height: 0.5 }) && J(tornOffBox({ left: 0.1, top: 0.1, width: 0.4, height: 0.5 }, TORN_OFF_STEP, -3)) === J(tornOffBox({ left: 0.1, top: 0.1, width: 0.4, height: 0.5 })), '§2b tornOffBox: the k-th half torn off one home steps k + 1 times (verify r3: two tears from one frame sat exactly on each other); a nonsense k is 0');
  leg(J(tornOffBox({ left: 0, top: 0, width: 1, height: 1 })) === J({ left: 0, top: 0, width: 1, height: 1 }) && J(tornOffBox({ left: 0, top: 0.1, width: 1.2, height: 0.5 })) === J({ left: 0, top: 0.1 + TORN_OFF_STEP, width: 1.2, height: 0.5 }), '§2b tornOffBox: a home as large as the workspace has no beside on that axis (kept as it is; the other axis still steps)');
  const ref = { ...home }; const out = snap({ gridBounds: ref, _onStage: false }); out.gridBounds.left = 9;
  leg(ref.left === home.left, '§2b the carried box is a COPY (the window\'s own box is never edited through it)');
  return failed;
}
const geometryFailed = geometryLegs(require(path.join(REPO, 'src/lib/stage-rules.js')));

// ── §3 THE CENSUS ──
console.log('— §3 the census: every hider-flag / hider-mark writer is the door or the derivation');
/** Offenders over a {relPath: text} map. The allowed writers: window.js setWindowHidden (the flags) and
 *  _applyHiderMarks (the marks). A receiver is a window element when it ends in `.element` or is a local alias of one. */
function census(files) {
  const out = { flag: [], cv: [], aria: [], box: [], seen: { cv: 0, aria: 0, flag: 0 } };
  const bodyOf = (lines, name) => { const i = lines.findIndex((l) => l.startsWith(`  ${name}(`)); if (i < 0) return null; const j = lines.findIndex((l, k) => k > i && l === '  }'); return [i, j]; };
  for (const [rel, text] of Object.entries(files)) {
    const lines = text.split('\n');
    const allowFlag = rel === 'src/lib/window.js' ? bodyOf(lines, 'setWindowHidden') : null;
    const allowMarks = rel === 'src/lib/window.js' ? bodyOf(lines, '_applyHiderMarks') : null;
    const within = (r, i) => !!r && i > r[0] && i < r[1];
    const aliases = new Set();
    for (const l of lines) { const m = l.match(/(?:const|let|var)\s+(\w+)\s*=\s*[\w.?]*\.element\s*[;,]/); if (m) aliases.add(m[1]); for (const mm of l.matchAll(/(?:const|let|var)\s+\{[^}]*\belement\s*:\s*(\w+)[^}]*\}\s*=/g)) aliases.add(mm[1]); }
    const isWinEl = (recv) => /\.element$/.test(recv) || aliases.has(recv);
    lines.forEach((l, i) => {
      const code = l.replace(/\/\/.*$/, '');
      if (/^\s*\*/.test(l) || /^\s*\/\//.test(l)) return; // a comment line
      const at = `${rel}:${i + 1}`;
      if (/\._hiddenBy(Desktop|Stage)\s*=(?!=)/.test(code)) { out.seen.flag++; if (!within(allowFlag, i)) out.flag.push(at); }
      for (const m of code.matchAll(/([\w.$?]+)\.style\.contentVisibility\s*=(?!=)|([\w.$?]+)\.style\.setProperty\(\s*['"]content-visibility['"]/g)) {
        const recv = (m[1] || m[2]).replace(/\?$/, '');
        if (!isWinEl(recv)) continue;
        out.seen.cv++; if (!within(allowMarks, i)) out.cv.push(at);
      }
      for (const m of code.matchAll(/([\w.$?]+)\.(?:setAttribute|removeAttribute|toggleAttribute)\(\s*['"]aria-hidden['"]/g)) {
        const recv = m[1].replace(/\?$/, '');
        if (!isWinEl(recv)) continue;
        out.seen.aria++; if (!within(allowMarks, i)) out.aria.push(at);
      }
      if (rel === 'src/lib/desktop-manager.js' || rel === 'src/lib/stage-manager.js') {
        for (const m of code.matchAll(/([\w.$?]+)\.style\.(?:visibility|pointerEvents)\s*=(?!=)/g)) { if (isWinEl(m[1].replace(/\?$/, ''))) out.box.push(at); }
      }
    });
  }
  return out;
}
const libFiles = () => Object.fromEntries(fs.readdirSync(path.join(REPO, 'src/lib')).filter((f) => f.endsWith('.js')).map((f) => [`src/lib/${f}`, read(`src/lib/${f}`)]));
{
  const c = census(libFiles());
  console.log(`    scanned ${Object.keys(libFiles()).length} src/lib modules: flag writes ${c.seen.flag}, window content-visibility writes ${c.seen.cv}, window aria-hidden writes ${c.seen.aria}`);
  ok(c.seen.flag >= 2 && c.seen.cv >= 1 && c.seen.aria >= 2, '§3 the scanner sees the door\'s and the derivation\'s own writes (its positive control: 2 flags, 1 content-visibility, 2 aria-hidden)', J(c.seen));
  ok(c.flag.length === 0, '§3 `_hiddenByDesktop` / `_hiddenByStage` are written ONLY by WindowManager.setWindowHidden (a hider adds / removes its reason through the one door)', J(c.flag));
  ok(c.cv.length === 0, '§3 content-visibility on a window element is written ONLY by the derivation (2.369.198: desktop-manager _hideWin / _showWin + tab-group — the Stage forgot it)', J(c.cv));
  ok(c.aria.length === 0, '§3 aria-hidden on a window element is written ONLY by the derivation (the 2.369.144 / .150 AX lean kept: hidden windows are aria-hidden)', J(c.aria));
  ok(c.box.length === 0, '§3 the two hider modules (desktop-manager.js, stage-manager.js) write no visibility / pointer-events on a window element', J(c.box));
}

// ── §4 NEGATIVE CONTROLS ──
console.log('— §4 negative controls (patched copies, scripts/mutant-copy.mjs)');
{
  const M = mutantCopies('stagevis', REPO);
  // (1) the Stage's pre-fix show + borrow (2.369.196 – .198 verbatim) ⇒ §2 B RED
  const SMSRC = read('src/lib/stage-manager.js');
  const showFind = '  _showWin(win) {\n    this.app.wm.setWindowHidden(win, { stage: false });\n  }\n';
  const showPre = "  _showWin(win) {\n    win.element.style.visibility = '';\n    win.element.style.pointerEvents = '';\n    win._hiddenByStage = false;\n  }\n";
  const borrowFind = '    for (const m of this._frameOf(win)) this.app.wm.setWindowHidden(m, { desktop: false, stage: false });\n';
  const borrowPre = "    try { this.app.sessions?.get(win.id)?.setSuspended?.(false); } catch { }\n    win._hiddenByDesktop = false;\n    this._showWin(win);\n    for (const id of (win._tabChain && Array.isArray(win._tabChain.tabs) ? win._tabChain.tabs : [])) {\n      const m = id !== win.id ? this.app.wm.windows.get(id) : null;\n      if (m && m._hiddenByStage) this._showWin(m);\n    }\n";
  ok(SMSRC.includes(showFind) && SMSRC.includes(borrowFind), 'control stage-own-show: the patched lines exist in stage-manager.js');
  if (SMSRC.includes(showFind) && SMSRC.includes(borrowFind)) {
    const mut = SMSRC.replace(showFind, showPre).replace(borrowFind, borrowPre).replace(/\nregisterWindowType\(\{\n  type: 'stage-placeholder'[\s\S]*?\n\}\);\n/, '\n');
    const f = M.write('src/lib/stage-manager.js', mut, 'stage-own-show');
    const failed = await sceneLegs({ StageMgr: (await import(f)).StageManager, quiet: true });
    ok(failed.some((n) => /THE RE-BORROWED HERO IS DRAWN/.test(n)), `control stage-own-show: the Stage's pre-fix show + borrow turns §2 B RED — the re-borrowed hero keeps content-visibility:hidden (${failed.length}: ${failed.slice(0, 3).join(' | ').slice(0, 220)})`);
    const cc = census({ 'src/lib/stage-manager.js': mut });
    ok(cc.flag.length >= 2 && cc.box.length >= 2, `control stage-own-show: …and the census names its hand-written flags and marks (${J({ flag: cc.flag, box: cc.box })})`);
  }
  // (2) the desktop's pre-fix _hideWin / _showWin ⇒ the census RED by name
  const DMSRC = read('src/lib/desktop-manager.js');
  const dmFind = '  _hideWin(win) {\n    this.app.wm.setWindowHidden(win, { desktop: true });\n  }\n';
  const dmPre = "  _hideWin(win) {\n    win._hiddenByDesktop = true;\n    win.element.style.visibility = 'hidden';\n    win.element.style.pointerEvents = 'none';\n    try { win.element.setAttribute('aria-hidden', 'true'); } catch { }\n    try { this.app.sessions?.get(win.id)?.setSuspended?.(true); } catch { }\n    try { if (win.type === 'chat') win.element.style.contentVisibility = 'hidden'; } catch { }\n  }\n";
  ok(DMSRC.includes(dmFind), 'control desktop-own-hide: the patched lines exist in desktop-manager.js');
  if (DMSRC.includes(dmFind)) {
    const mut = DMSRC.replace(dmFind, dmPre);
    M.write('src/lib/desktop-manager.js', mut, 'desktop-own-hide');
    const cc = census({ ...libFiles(), 'src/lib/desktop-manager.js': mut });
    ok(cc.cv.some((x) => x.startsWith('src/lib/desktop-manager.js:')) && cc.aria.some((x) => x.startsWith('src/lib/desktop-manager.js:')) && cc.flag.some((x) => x.startsWith('src/lib/desktop-manager.js:')) && cc.box.length >= 2, `control desktop-own-hide: the pre-fix _hideWin turns the census RED, named (${J({ cv: cc.cv, aria: cc.aria, flag: cc.flag })})`);
  }
  // (3) the tab-group's pre-fix _matchFrameVisibility (bcf72e3f) ⇒ the census RED by name
  const TGSRC = read('src/lib/tab-group.js');
  const tgFind = '    this.setWindowHidden(win, { desktop: !!frame._hiddenByDesktop, stage: !!frame._hiddenByStage });\n';
  const tgPre = "    if (frame._hiddenByDesktop) { if (!win._hiddenByDesktop) this._app?.desktopManager?._hideWin?.(win); return; }\n    if (frame._hiddenByStage) { if (!win._hiddenByStage) this._app?.stage?._hideStage?.(win); return; }\n    const el = win.element;\n    win._hiddenByStage = false; win._hiddenByDesktop = false;\n    el.style.visibility = ''; el.style.pointerEvents = '';\n    try { el.removeAttribute('aria-hidden'); } catch { }\n    if (win.type === 'chat') el.style.contentVisibility = '';\n";
  ok(TGSRC.includes(tgFind), 'control tab-own-marks: the patched line exists in tab-group.js');
  if (TGSRC.includes(tgFind)) {
    const mut = TGSRC.replace(tgFind, tgPre);
    M.write('src/lib/tab-group.js', mut, 'tab-own-marks');
    const cc = census({ ...libFiles(), 'src/lib/tab-group.js': mut });
    ok(cc.cv.some((x) => x.startsWith('src/lib/tab-group.js:')) && cc.aria.some((x) => x.startsWith('src/lib/tab-group.js:')) && cc.flag.some((x) => x.startsWith('src/lib/tab-group.js:')), `control tab-own-marks: a hand-written show in the tab-group (an alias of win.element) turns the census RED, named (${J({ cv: cc.cv, aria: cc.aria })})`);
  }
  // (4) the PURE rule forgetting a mark / a hider ⇒ §1 RED
  const VVSRC = read('src/lib/view-visibility.js');
  for (const m of [
    { tag: 'no-aria', find: '    ariaHidden: box,\n', repl: '    ariaHidden: false,\n', expect: /96 rows|chat on a desktop off screen/ },
    { tag: 'stage-not-a-box-hider', find: "const BOX_HIDERS = Object.freeze(['desktop', 'stage']);", repl: "const BOX_HIDERS = Object.freeze(['desktop']);", expect: /the SAME marks|96 rows/ },
  ]) {
    const found = VVSRC.includes(m.find);
    ok(found, `control ${m.tag}: the patched line exists in view-visibility.js`);
    if (!found) continue;
    const f = pureLegs(M.load('src/lib/view-visibility.js', VVSRC.replace(m.find, m.repl), m.tag), { quiet: true });
    ok(f.some((n) => m.expect.test(n)), `control ${m.tag}: the patched rule turns its §1 leg RED (${f.length}: ${f.slice(0, 2).join(' | ').slice(0, 160)})`);
  }
  // (5) verify r1: the split rule that hands nothing back ⇒ §2 X1 / X3 RED (the promoted session stays a free window)
  const splitFind = '  onChainSplit(left, frame) {\n    if (!this._active || !this.enabled) return;\n';
  ok(SMSRC.includes(splitFind), 'control split-hands-nothing-back: the patched lines exist in stage-manager.js');
  if (SMSRC.includes(splitFind)) {
    const mut = SMSRC.replace(splitFind, '  onChainSplit(left, frame) {\n    return;\n').replace(/\nregisterWindowType\(\{\n  type: \'stage-placeholder\'[\s\S]*?\n\}\);\n/, '\n');
    const f = M.write('src/lib/stage-manager.js', mut, 'split-hands-nothing-back');
    const failed = await sceneLegs({ StageMgr: (await import(f)).StageManager, quiet: true });
    ok(failed.some((n) => /X1 the promoted xg/.test(n)) && failed.some((n) => /X1 leaving the Stage for Work/.test(n)), `control split-hands-nothing-back: c4f17e39's split (nothing handed back) turns §2 X1 RED — the standing session drawn, unowned, and on Work after the leave (verify r2: X2's torn-off guest is now hidden by the frame's own deactivation, so X1 alone is the discriminator) (${failed.length}: ${failed.slice(0, 3).join(' | ').slice(0, 240)})`);
  }
  // (7) verify r2: a split that gives no home ⇒ §2 X5 / X6 RED (the survivor keeps the slot; the torn-off guest a cascade)
  const homeFind = '      if (home && borrowed !== w) this._giveHome(w, home, { beside: w === left, k });\n';
  ok(SMSRC.includes(homeFind), 'control split-keeps-slot: the patched line exists in stage-manager.js');
  if (SMSRC.includes(homeFind)) {
    const mut = SMSRC.replace(homeFind, '').replace(/\nregisterWindowType\(\{\n  type: 'stage-placeholder'[\s\S]*?\n\}\);\n/, '\n');
    const f = M.write('src/lib/stage-manager.js', mut, 'split-keeps-slot');
    const failed = await sceneLegs({ StageMgr: (await import(f)).StageManager, quiet: true });
    ok(failed.some((n) => /X5 …and q2's box is the GROUP'S HOME/.test(n)) && failed.some((n) => /X6 the torn-off guest r2 is the hero and REMEMBERS/.test(n)), `control split-keeps-slot: 57e900ab's split (no home given) turns §2 X5 + X6 RED (${failed.length}: ${failed.slice(0, 3).join(' | ').slice(0, 240)})`);
  }
  // (8) verify r2: a guest materialized as ITSELF (never resolved to its frame) ⇒ §2 X2 / X7 / X8 / X9 / X10 RED
  const hostFind = "    return host && (host.type === 'chat' || host.type === 'terminal') ? host.id : (win ? win.id : null);\n";
  ok(SMSRC.includes(hostFind), 'control guest-as-hero: the patched line exists in stage-manager.js');
  if (SMSRC.includes(hostFind)) {
    const mut = SMSRC.replace(hostFind, '    return win ? win.id : null;\n').replace(/\nregisterWindowType\(\{\n  type: 'stage-placeholder'[\s\S]*?\n\}\);\n/, '\n');
    const f = M.write('src/lib/stage-manager.js', mut, 'guest-as-hero');
    const failed = await sceneLegs({ StageMgr: (await import(f)).StageManager, quiet: true });
    ok(['X2 THE FRAME IS THE HERO', 'X7 a press into the shown guest', 'X8 a guest of a hidden group', 'X9 re-entered', 'X10 the frame'].every((k) => failed.some((n) => n.includes(k))), `control guest-as-hero: 57e900ab's guest-as-hero (no frame resolution) turns §2 X2 + X7 + X8 + X9 + X10 RED (${failed.length}: ${failed.slice(0, 3).join(' | ').slice(0, 240)})`);
  }
  // (9) verify r2: no chain re-sync at the hand-back ⇒ §2 X11 RED
  const syncFind = '    if (hero._tabChain) { try { this.app.wm._syncChainBounds(hero._tabChain); } catch {} }\n';
  ok(SMSRC.includes(syncFind), 'control guest-keeps-slot: the patched line exists in stage-manager.js');
  if (SMSRC.includes(syncFind)) {
    const mut = SMSRC.replace(syncFind, '').replace(/\nregisterWindowType\(\{\n  type: 'stage-placeholder'[\s\S]*?\n\}\);\n/, '\n');
    const f = M.write('src/lib/stage-manager.js', mut, 'guest-keeps-slot');
    const failed = await sceneLegs({ StageMgr: (await import(f)).StageManager, quiet: true });
    ok(failed.some((n) => /X11 the hand-back re-syncs/.test(n)), `control guest-keeps-slot: no re-sync at the hand-back turns §2 X11 RED (${failed.length}: ${failed.slice(0, 2).join(' | ').slice(0, 200)})`);
  }
  // (10) verify r2: the survivor's tab shown without a derivation ⇒ §2 X12 RED (tab-group)
  const ungroupFind = '    this.syncFrameHiders?.(lastWin);\n';
  ok(TGSRC.includes(ungroupFind), 'control stale-tab-reason: the patched line exists in tab-group.js');
  if (TGSRC.includes(ungroupFind)) {
    const f = M.write('src/lib/tab-group.js', TGSRC.replace(ungroupFind, ''), 'stale-tab-reason');
    const { installTabGroupMixin: mixin } = await import(f);
    const { WindowManager: WM2 } = await import(path.join(REPO, 'src/lib/window.js'));
    class WMx extends WM2 { } // the scene's WindowManager with the patched mixin installed over the real one's methods
    const wmProto = WMx.prototype; mixin(wmProto);
    const failed = await sceneLegs({ StageMgr: StageManager, quiet: true, WinMgr: WMx });
    ok(failed.some((n) => /X12 k1 closed by its/.test(n)), `control stale-tab-reason: _ungroupLast without the derivation turns §2 X12 RED (${failed.length}: ${failed.slice(0, 2).join(' | ').slice(0, 200)})`);
  }
  // (11) verify r2: _giveHome without its chain sync ⇒ §2 X5's third-tab leg RED
  const giveSyncFind = "    if (w._tabChain) { try { this.app.wm._syncChainBounds(w._tabChain); } catch {} } // its remaining guests mirror it (a 3-tab group: the third tab kept the slot — the r2 walk, seed 23)\n";
  ok(SMSRC.includes(giveSyncFind), 'control survivor-guest-keeps-slot: the patched line exists in stage-manager.js');
  if (SMSRC.includes(giveSyncFind)) {
    const mut = SMSRC.replace(giveSyncFind, '').replace(/\nregisterWindowType\(\{\n  type: 'stage-placeholder'[\s\S]*?\n\}\);\n/, '\n');
    const f = M.write('src/lib/stage-manager.js', mut, 'survivor-guest-keeps-slot');
    const failed = await sceneLegs({ StageMgr: (await import(f)).StageManager, quiet: true });
    ok(failed.some((n) => /X5 …and the third tab q3/.test(n)), `control survivor-guest-keeps-slot: _giveHome without its chain sync turns §2 X5's third-tab leg RED (${failed.length}: ${failed.slice(0, 2).join(' | ').slice(0, 200)})`);
  }
  // (12) verify r3: the hand-back leaving a Stage-maximized hero maximized (f5635f9d) ⇒ §2 X13 RED (the slot through prevBounds)
  const unmaxFind = '    if (hero.isMaximized) { try { this.app.wm.toggleMaximize(hero.id); } catch {} }\n    if (hero.gridBounds && !hero.isMaximized) this.app.wm._applyGridBounds(hero);\n';
  ok(SMSRC.includes(unmaxFind), 'control stage-max-leaks-slot: the patched lines exist in stage-manager.js');
  if (SMSRC.includes(unmaxFind)) {
    const mut = SMSRC.replace(unmaxFind, '    if (hero.gridBounds && !hero.isMaximized) this.app.wm._applyGridBounds(hero);\n').replace(/\nregisterWindowType\(\{\n  type: 'stage-placeholder'[\s\S]*?\n\}\);\n/, '\n');
    const f = M.write('src/lib/stage-manager.js', mut, 'stage-max-leaks-slot');
    const failed = await sceneLegs({ StageMgr: (await import(f)).StageManager, quiet: true });
    ok(failed.some((n) => /X13 on Scra, un-maximized/.test(n)), `control stage-max-leaks-slot: a hand-back that leaves the hero maximized turns §2 X13 RED (${failed.length}: ${failed.slice(0, 2).join(' | ').slice(0, 200)})`);
  }
  // (13) verify r3: the borrow snapshotting a maximized window's (full) box before un-maximizing it (f5635f9d) ⇒ §2 X14 RED
  const preMaxFind = "    if (win.isMaximized) { win._stageHomeMax = true; try { this.app.wm.toggleMaximize(win.id); } catch {} if (!win._stageHomeBounds) { try { this.app.wm._captureGridBounds(win); } catch {} } }\n    if (!win._stageHomeBounds) {\n";
  ok(SMSRC.includes(preMaxFind), 'control max-home-lost: the patched lines exist in stage-manager.js');
  if (SMSRC.includes(preMaxFind)) {
    const mut = SMSRC.replace(preMaxFind, "    if (!win._stageHomeBounds) {\n").replace("      else win._stageHomeBounds = this._cascadeHome();\n    }\n", "      else win._stageHomeBounds = this._cascadeHome();\n    }\n    if (win.isMaximized) { win._stageHomeMax = true; try { this.app.wm.toggleMaximize(win.id); } catch {} }\n").replace(/\nregisterWindowType\(\{\n  type: 'stage-placeholder'[\s\S]*?\n\}\);\n/, '\n');
    const f = M.write('src/lib/stage-manager.js', mut, 'max-home-lost');
    const failed = await sceneLegs({ StageMgr: (await import(f)).StageManager, quiet: true });
    ok(failed.some((n) => /X14 borrowed: un-maximized for the slot/.test(n)) && failed.some((n) => /X14 un-maximized on Scra/.test(n)), `control max-home-lost: a snapshot taken before the un-maximize turns §2 X14 RED (${failed.length}: ${failed.slice(0, 2).join(' | ').slice(0, 200)})`);
  }
  // (14) verify r3: tornOffBox clamping onto the edge (f5635f9d) ⇒ the §2b corner leg RED
  const RSRC0 = read('src/lib/stage-rules.js');
  const axisFind = "  const axis = (pos, size) => { const max = Math.max(0, 1 - size); if (pos + d <= max + 1e-9) return Math.min(pos + d, max); if (pos - d >= -1e-9) return Math.max(0, pos - d); return Math.max(0, Math.min(pos, max)); };\n";
  ok(RSRC0.includes(axisFind), 'control corner-stacks: the patched line exists in stage-rules.js');
  if (RSRC0.includes(axisFind)) {
    const f = geometryLegs(M.load('src/lib/stage-rules.js', RSRC0.replace(axisFind, "  const axis = (pos, size) => Math.max(0, Math.min(pos + d, 1 - size));\n"), 'corner-stacks'), { quiet: true });
    ok(f.some((n) => /THE CORNER/.test(n)) && f.some((n) => /steps BACKWARD/.test(n)), `control corner-stacks: the edge clamp of f5635f9d turns the §2b corner + edge legs RED (${f.length}: ${f.slice(0, 2).join(' | ').slice(0, 160)})`);
  }
  // (15) verify r3: every half beside the same home taking the same step (f5635f9d) ⇒ §2 X18 RED
  const stepFind = "    return tornOffStep(gb, occupied); // (verify r4: the occupancy; the r3 counter is gone)\n"; // (verify r4: the occupancy line; a mutant gives every half the first step)
  ok(SMSRC.includes(stepFind), 'control tears-stack: the patched lines exist in stage-manager.js');
  if (SMSRC.includes(stepFind)) {
    const mut = SMSRC.replace(stepFind, "    return 0;\n").replace(/\nregisterWindowType\(\{\n  type: 'stage-placeholder'[\s\S]*?\n\}\);\n/, '\n');
    const f = M.write('src/lib/stage-manager.js', mut, 'tears-stack');
    const failed = await sceneLegs({ StageMgr: (await import(f)).StageManager, quiet: true });
    ok(failed.some((n) => /X18 on Scra the frame d1/.test(n)), `control tears-stack: the same step for every half turns §2 X18 RED (${failed.length}: ${failed.slice(0, 2).join(' | ').slice(0, 200)})`);
  }
  // (16) verify r3: a re-formed frame's host keeping the BESIDE box as the group's home (f5635f9d) ⇒ §2 X15 RED
  const rejoinFind = "    const given = host && !host._stageHomeBounds ? givenHomeOf(host._stageGivenHome, { gridBounds: host.gridBounds, isMaximized: host.isMaximized }) : null;\n"; // (verify r4: the verdict line; a mutant hands nothing back)
  ok(SMSRC.includes(rejoinFind), 'control regroup-creeps: the patched line exists in stage-manager.js');
  if (SMSRC.includes(rejoinFind)) {
    const mut = SMSRC.replace(rejoinFind, '    const given = null;\n').replace(/\nregisterWindowType\(\{\n  type: 'stage-placeholder'[\s\S]*?\n\}\);\n/, '\n');
    const f = M.write('src/lib/stage-manager.js', mut, 'regroup-creeps');
    const failed = await sceneLegs({ StageMgr: (await import(f)).StageManager, quiet: true });
    ok(failed.some((n) => /X15 the re-formed frame/.test(n)) && failed.some((n) => /X15 on Scra the group/.test(n)), `control regroup-creeps: no home handed back to the re-formed frame turns §2 X15 RED (${failed.length}: ${failed.slice(0, 2).join(' | ').slice(0, 200)})`);
  }
  // (17) verify r3: the r1 belt back (a slot-shaped box refused as a home) ⇒ §2 X16 RED
  const beltFind = "      win._stageHomeBounds = win.gridBounds ? { ...win.gridBounds } : this._cascadeHome();\n";
  ok(SMSRC.includes(beltFind), 'control slot-belt: the patched line exists in stage-manager.js');
  if (SMSRC.includes(beltFind)) {
    const mut = SMSRC.replace(beltFind, "      if (win.gridBounds && !this._nearSlot(win.gridBounds)) win._stageHomeBounds = { ...win.gridBounds };\n      else win._stageHomeBounds = this._cascadeHome();\n").replace(/\nregisterWindowType\(\{\n  type: 'stage-placeholder'[\s\S]*?\n\}\);\n/, '\n');
    const f = M.write('src/lib/stage-manager.js', mut, 'slot-belt');
    const failed = await sceneLegs({ StageMgr: (await import(f)).StageManager, quiet: true });
    ok(failed.some((n) => /X16 borrowed: the slot-shaped box/.test(n)) && failed.some((n) => /X16 on Scra it is back/.test(n)), `control slot-belt: the r1 belt turns §2 X16 RED (${failed.length}: ${failed.slice(0, 2).join(' | ').slice(0, 200)})`);
  }
  // (18) verify r3: a restored chain spanning two desktops (f5635f9d) ⇒ §2 X19 RED (tab-group)
  const spanFind = "      if (hostWin._desktopId && guestWin._desktopId !== hostWin._desktopId) guestWin._desktopId = hostWin._desktopId;\n";
  ok(TGSRC.includes(spanFind), 'control chain-spans-desktops: the patched line exists in tab-group.js');
  if (TGSRC.includes(spanFind)) {
    const f = M.write('src/lib/tab-group.js', TGSRC.replace(spanFind, ''), 'chain-spans-desktops');
    const { installTabGroupMixin: mixin } = await import(f);
    const { WindowManager: WM2 } = await import(path.join(REPO, 'src/lib/window.js'));
    class WMy extends WM2 { } mixin(WMy.prototype);
    const failed = await sceneLegs({ StageMgr: StageManager, quiet: true, WinMgr: WMy });
    ok(failed.some((n) => /X19 the restored guest f2/.test(n)), `control chain-spans-desktops: a restore that leaves the guest on its own desktop turns §2 X19 RED (${failed.length}: ${failed.slice(0, 2).join(' | ').slice(0, 200)})`);
  }
  // (19) verify r3: the follow's blackout as a time box over every publish (2.112.6 – f5635f9d) ⇒ §2 X20 RED
  const blackoutFind = "    if (this._applyingRemoteHero === true || (this._applyingRemoteHero && this._applyingRemoteHero === win.id)) return;\n";
  ok(SMSRC.includes(blackoutFind), 'control follow-blackout: the patched line exists in stage-manager.js');
  if (SMSRC.includes(blackoutFind)) {
    const mut = SMSRC.replace(blackoutFind, "    if (this._applyingRemoteHero) return;\n").replace(/\nregisterWindowType\(\{\n  type: 'stage-placeholder'[\s\S]*?\n\}\);\n/, '\n');
    const f = M.write('src/lib/stage-manager.js', mut, 'follow-blackout');
    const failed = await sceneLegs({ StageMgr: (await import(f)).StageManager, quiet: true });
    ok(failed.some((n) => /X20 the user's click on h2/.test(n)) && failed.some((n) => /X20 leaving and entering again/.test(n)), `control follow-blackout: the time-boxed blackout turns §2 X20 RED (${failed.length}: ${failed.slice(0, 2).join(' | ').slice(0, 200)})`);
  }
  // (20) verify r4: the stamp honoured wherever the half stands (97cbf0b2 verbatim) ⇒ §2 X15b RED
  const stampFind = "    const given = host && !host._stageHomeBounds ? givenHomeOf(host._stageGivenHome, { gridBounds: host.gridBounds, isMaximized: host.isMaximized }) : null;\n";
  ok(SMSRC.includes(stampFind), 'control stale-stamp: the patched line exists in stage-manager.js');
  if (SMSRC.includes(stampFind)) {
    const mut = SMSRC.replace(stampFind, "    const given = host && !host._stageHomeBounds && host._stageGivenHome && host._stageGivenHome.gridBounds ? { gridBounds: { ...host._stageGivenHome.gridBounds }, isMaximized: !!host._stageGivenHome.isMaximized } : null;\n").replace(/\nregisterWindowType\(\{\n  type: 'stage-placeholder'[\s\S]*?\n\}\);\n/, '\n');
    const f = M.write('src/lib/stage-manager.js', mut, 'stale-stamp');
    const failed = await sceneLegs({ StageMgr: (await import(f)).StageManager, quiet: true });
    ok(failed.some((n) => /X15b the re-formed frame \[n2 host, n1\] remembers nB/.test(n)), `control stale-stamp: a stamp honoured after the user's own move turns §2 X15b RED (${failed.length}: ${failed.slice(0, 2).join(' | ').slice(0, 200)})`);
  }
  // (21) verify r4: the step as r3's in-memory count per home (97cbf0b2 verbatim) ⇒ §2 X18b RED (a reload's reset lands the half on the first)
  const occFind = "    return tornOffStep(gb, occupied); // (verify r4: the occupancy; the r3 counter is gone)\n";
  ok(SMSRC.includes(occFind), 'control step-count: the patched line exists in stage-manager.js');
  if (SMSRC.includes(occFind)) {
    const mut = SMSRC.replace(occFind, "    const key = ['left', 'top', 'width', 'height'].map((x) => Math.round((gb[x] || 0) * 1000)).join(','); const m = this._besideSeq || (this._besideSeq = new Map()); const k = m.get(key) || 0; m.set(key, (k + 1) % 6); return k;\n").replace(/\nregisterWindowType\(\{\n  type: 'stage-placeholder'[\s\S]*?\n\}\);\n/, '\n');
    const f = M.write('src/lib/stage-manager.js', mut, 'step-count');
    const failed = await sceneLegs({ StageMgr: (await import(f)).StageManager, quiet: true });
    ok(failed.some((n) => /X18b a half torn off a home whose first step/.test(n)) && failed.some((n) => /X18c the first half actually placed/.test(n)) && !failed.some((n) => /X18 the second half torn off the same home/.test(n)), `control step-count: the in-memory count turns §2 X18b + X18c RED while X18 (two tears in one page) stays green (${failed.length}: ${failed.slice(0, 2).join(' | ').slice(0, 200)})`);
  }
  // (6) verify r1: the snapshot reading the element's box ⇒ §2b RED (a borrowed hero carries the slot)
  const RSRC = read('src/lib/stage-rules.js');
  const geoFind = '  const borrowed = !!onStage;\n';
  ok(RSRC.includes(geoFind), 'control slot-as-home: the patched line exists in stage-rules.js');
  if (RSRC.includes(geoFind)) {
    const f = geometryLegs(M.load('src/lib/stage-rules.js', RSRC.replace(geoFind, '  const borrowed = false;\n'), 'slot-as-home'), { quiet: true });
    ok(f.some((n) => /a BORROWED hero carries its HOME box/.test(n)), `control slot-as-home: the element's box as the carried box (c4f17e39) turns the §2b hero leg RED (${f.length}: ${f.slice(0, 1).join(' | ').slice(0, 160)})`);
  }
  for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 12 })) ok(r.pass, r.name, r.detail);
}

// ── §5 wiring ──
console.log('— §5 wiring');
{
  const W = read('src/lib/window.js'), D = read('src/lib/desktop-manager.js'), SM = read('src/lib/stage-manager.js'), TG = read('src/lib/tab-group.js');
  ok(/import \{ HIDE_REASONS, hiddenReasons, windowMarks(?:, revealDesktop)? \} from '\.\/view-visibility\.js';/.test(W), '§5 window.js imports the PURE rule (never re-spelled)');
  ok(/_hideWin\(win\) \{\n\s+this\.app\.wm\.setWindowHidden\(win, \{ desktop: true \}\);\n\s+\}/.test(D) && /_showWin\(win\) \{\n\s+this\.app\.wm\.setWindowHidden\(win, \{ desktop: false \}\);\n\s+\}/.test(D), '§5 the desktop hides / shows through the door and nothing else');
  ok(/_hideStage\(win\) \{\n\s+this\.app\.wm\.setWindowHidden\(win, \{ stage: true \}\);\n\s+\}/.test(SM) && /_showWin\(win\) \{\n\s+this\.app\.wm\.setWindowHidden\(win, \{ stage: false \}\);\n\s+\}/.test(SM), '§5 the Stage parks / un-parks through the door and nothing else');
  ok(/for \(const m of this\._frameOf\(win\)\) this\.app\.wm\.setWindowHidden\(m, \{ desktop: false, stage: false \}\);/.test(SM) && (SM.match(/this\._returnFrame\(hero\);/g) || []).length === 2, '§5 the borrow clears the whole frame; leave and a hero switch return it through _returnFrame (symmetric)');
  ok(!/setSuspended/.test(SM.replace(/\/\/.*$/gm, '')) && !/setSuspended/.test(D.replace(/\/\/.*$/gm, '')) && !/setSuspended/.test(TG.replace(/\/\/.*$/gm, '')), '§5 no hider module suspends a view by hand (the derivation\'s per-reason setHidden does)');
  ok(/if \(promoted\) this\._matchFrameVisibility\(promoted, hostWin\);/.test(TG), '§5 a promoted host carries its frame\'s reasons');
  ok(/inc-munl8jkl-gaih/.test(read('src/lib/view-visibility.js')) && /inc-munl8jkl-gaih/.test(W) && /inc-munl8jkl-gaih/.test(SM), '§5 the incident is named at the rule, the door and the Stage');
  ok(/name: 'test-stage-visibility', tier: 'fast'/.test(read('scripts/ci.mjs')), '§5 ci.mjs runs this suite in the fast tier');
  // verify r1 wiring
  ok(/try \{ this\._app\?\.stage\?\.onChainSplit\?\.\(win, promoted \|\| \(hostWin && hostWin !== win \? hostWin : null\)\); \}/.test(TG) && /if \(promoted\) this\._matchFrameVisibility\(promoted, hostWin\);\n[\s\S]{0,600}onChainSplit/.test(TG), '§5 _detachFromChain hands every split to stage.onChainSplit AFTER the frame visibility is matched (the ONE hook: the drag, a close, a remote regroup)');
  ok(/onChainSplit\(left, frame\) \{[\s\S]{0,1400}this\._returnFrame\(w\);/.test(SM) && /if \(!w \|\| w\.id === this\._heroWinId \|\| this\._boundAux\.has\(w\.id\)\) continue;/.test(SM), '§5 onChainSplit hands a standing session back through _returnFrame; the hero and a bound aux are never touched');
  const SL = read('src/lib/session-lifecycle.js'), SR = read('src/lib/stage-rules.js');
  ok(/import \{ carriedGeometry \} from '\.\/stage-rules\.js';/.test(SL) && /_snapshotWinBounds\(win\) \{[\s\S]{0,1600}const frame = \(win\._tabChain && Array\.isArray\(win\._tabChain\.tabs\) && this\.wm\.windows\.get\(win\._tabChain\.tabs\[0\]\)\) \|\| win;\n\s+return carriedGeometry\(\{ gridBounds: frame\.gridBounds, preSnapBounds: frame\.preSnapBounds, isMaximized: frame\.isMaximized, desktopId: win\._desktopId, onStage: frame\._onStage, stageHomeBounds: frame\._stageHomeBounds, stageHomeMax: frame\._stageHomeMax \}\);/.test(SL), '§5 _snapshotWinBounds (the resume / billing switch / restart carrier) is the PURE carriedGeometry over the FRAME\'s facts (a guest\'s box mirrors its host\'s) and the window\'s own desktop, never a hand-copied gridBounds');
  // verify r2 wiring
  ok((TG.match(/this\._app\?\.stage\?\.onChainJoined\?\.\(chain\);/g) || []).length === 2 && /this\._app\?\.stage\?\.onChainJoined\?\.\(chain, \{ restored: true \}\);/.test(TG) && /createTabChain\(hostWin, guestWin(?:, \{ show = true \} = \{\})?\) \{[\s\S]{0,1600}onChainJoined[\s\S]{0,120}\n  \},\n/.test(TG) && /addToTabChain\(chain, guestWin[\s\S]{0,2600}onChainJoined/.test(TG) && /restoreTabChain\(tabIds[\s\S]{0,2400}onChainJoined\?\.\(chain, \{ restored: true \}\)/.test(TG), '§5 every chain formation (createTabChain / addToTabChain / restoreTabChain) tells the Stage (onChainJoined): the frame is the hero — the restore says it is a RESTORE (verify r3)');
  ok(/onChainSplit\(left, frame\) \{[\s\S]{0,1200}if \(home && borrowed !== w\) this\._giveHome\(w, home, \{ beside: w === left, k \}\);/.test(SM) && /const home = borrowed \? carriedGeometry\(\{ onStage: true, stageHomeBounds: borrowed\._stageHomeBounds, stageHomeMax: borrowed\._stageHomeMax \}\) : null;/.test(SM), '§5 a half of a split borrowed frame takes the frame\'s home through the PURE carriedGeometry');
  ok(/shouldIntercept\(win\) \{[\s\S]{0,1400}if \(this\._sessionHostOf\(win\) === this\._heroWinId\) return false;/.test(SM) && /materialize\(win\) \{\n\s+const hostId = this\._sessionHostOf\(win\);/.test(SM) && /if \(hero && this\._sessionHostOf\(hero\) !== hero\.id\) \{/.test(SM), '§5 the guest → frame resolution at the three doors: shouldIntercept, materialize, the re-enter');
  ok(/_ungroupLast\(chain\) \{[\s\S]{0,700}lastWin\.content\.classList\.remove\('tab-hidden'\);[\s\S]{0,500}this\.syncFrameHiders\?\.\(lastWin\);/.test(TG), '§5 _ungroupLast re-derives the survivor after its tab comes on show');
  ok(/carriedGeometry/.test(SR) && !/gridBounds: win\.gridBounds \? \{ \.\.\.win\.gridBounds \} : null,/.test(SL), '§5 no hand-copied gridBounds snapshot is left in session-lifecycle.js');
  ok(/if \(winBounds\.gridBounds\) winInfo\._stageHomeBounds = \{ \.\.\.winBounds\.gridBounds \};/.test(SL) && !/_nearSlot/.test(SL) && !/_nearSlot\(win\.gridBounds\)\) win\._stageHomeBounds/.test(SM), '§5 no slot-shaped belt on a HOME anywhere (verify r3): path C keeps the box it carries, the borrow keeps the box the window stands at');
  ok(/if \(winBounds && winInfo\._onStage\) \{\n[\s\S]{0,2200}if \(winBounds\.gridBounds\) winInfo\._stageHomeBounds/.test(SL) && /if \(home && home !== '__stage__' && \(this\.desktopManager\?\._desktops \|\| \[\]\)\.some\(\(d\) => d\.id === home\)\) winInfo\._desktopId = home;/.test(SL), '§5 path C (a resume ON the Stage): the carried box becomes the HOME, the window keeps its home desktop — the branch is wired (verify r2: the revert table\'s P15 had no fast catcher)');
  ok(/if \(home && borrowed !== w\) this\._giveHome\(w, home, \{ beside: w === left, k \}\);/.test(SM) && /tornOffBox\(home\.gridBounds, undefined, k\); if \(b\) left\._stageHomeBounds = b;/.test(SM) && /w\.gridBounds = \(beside && tornOffBox\(home\.gridBounds, undefined, k\)\) \|\| \{ \.\.\.home\.gridBounds \};/.test(SM), '§5 the half that LEFT a borrowed frame lands beside the home (PURE tornOffBox), the frame keeps it');
  ok(/_handBackHero\(hero\) \{[\s\S]{0,1800}if \(hero\.isMaximized\) \{ try \{ this\.app\.wm\.toggleMaximize\(hero\.id\); \} catch \{\} \}\n    if \(hero\.gridBounds && !hero\.isMaximized\) this\.app\.wm\._applyGridBounds\(hero\);/.test(SM), '§5 the hand-back un-maximizes a Stage-maximized hero BEFORE its home px are placed (verify r3: a maximize on the Stage is a slot edit)');
  ok(/_borrowHero\(win\) \{[\s\S]{0,2600}if \(win\.isMaximized\) \{ win\._stageHomeMax = true; try \{ this\.app\.wm\.toggleMaximize\(win\.id\); \} catch \{\} if \(!win\._stageHomeBounds\) \{ try \{ this\.app\.wm\._captureGridBounds\(win\); \} catch \{\} \} \}\n    if \(!win\._stageHomeBounds\) \{/.test(SM), '§5 the borrow un-maximizes a maximized window and re-reads its box BEFORE the home snapshot (verify r3: the pre-max box is the home)');
  ok(/onChainJoined\(chain, \{ restored = false \} = \{\}\) \{[\s\S]{0,1600}const host = restored \? this\.app\.wm\.windows\.get\(this\._sessionHostOf\(hero\)\) : null;/.test(SM) && /_stageGivenHome = \{ gridBounds: \{ \.\.\.home\.gridBounds \}, isMaximized: !!home\.isMaximized, at: \{ \.\.\.w\.gridBounds \} \};/.test(SM) && /givenHomeOf\(host\._stageGivenHome, \{ gridBounds: host\.gridBounds, isMaximized: host\.isMaximized \}\)/.test(SM) && /delete win\._stageGivenHome;/.test(SM), '§5 a RESTORED chain around the hero hands the frame\'s home to its new host (the stamp _giveHome writes, cleared at a borrow) — never a user\'s own merge (verify r3)');
  ok(/restoreTabChain\(tabIds, activeIndex[\s\S]{0,1800}if \(hostWin\._desktopId && guestWin\._desktopId !== hostWin\._desktopId\) guestWin\._desktopId = hostWin\._desktopId;/.test(TG) && /createTabChain\(hostWin, guestWin(?:, \{ show = true \} = \{\})?\) \{[\s\S]{0,1200}if \(hostWin\._desktopId\) guestWin\._desktopId = hostWin\._desktopId;/.test(TG), '§5 every chain formation keeps the chain on ONE desktop (restoreTabChain too — verify r3)');
  ok(/_publishHero\(win\) \{[\s\S]{0,700}if \(this\._applyingRemoteHero === true \|\| \(this\._applyingRemoteHero && this\._applyingRemoteHero === win\.id\)\) return;/.test(SM) && /this\._applyingRemoteHero = target \? target\.id : replayId;/.test(SM), '§5 the follow\'s echo guard is scoped to the window the follow materializes, never a time box over every publish (verify r3)');
  // the incident capture carries the derived marks (a diagnostic the forensics needed: `marks` beside the flags)
  ok(/hiddenByStage: !!w\._hiddenByStage, onStage: !!w\._onStage,/.test(read('src/lib/incident-recorder.js')) && /marks: w\.element \? \{ cv: w\.element\.style\.contentVisibility \|\| '', vis: w\.element\.style\.visibility \|\| '', aria: w\.element\.getAttribute\('aria-hidden'\) \} : null,/.test(read('src/lib/incident-recorder.js')), '§5 the incident capture lists every window\'s derived marks (cv / vis / aria) beside both hider flags (the next blank window names itself in the bundle)');
}

const anyFailed = fail || pureFailed.length || sceneFailed.length || geometryFailed.length;
console.log(`\n${anyFailed ? 'FAIL' : 'ALL PASS'} (${pass} passed, ${fail} failed)`);
process.exit(anyFailed ? 1 : 0);
