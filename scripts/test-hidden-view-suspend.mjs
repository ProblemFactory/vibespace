#!/usr/bin/env node
// EVERY HIDER SUSPENDS THE CHAT VIEW (inc-mu6bfv1t-4drq, 2026-09-18, owner:
// "每次手机上切对话都会滚到对话历史里而不是最新位置"). The 2.369.1 law — a
// hidden window's geometry is meaningless, decide nothing off it — was made
// physical for the DESKTOP hider only (visibility:hidden, desktop-manager →
// setSuspended). Three hiders use display:none, which additionally ZEROES the
// scroller's scrollTop: the mobile inactive window (`.window {display:none}` ≤768px),
// a grouped guest's `.tab-hidden` content, a minimized window. None suspended.
// Captured on the owner's phone, every switch: scroll →0 with no touch input,
// `unpin`, the top sentinel paging 50 older messages in, `trimBottom removed:50`,
// then `userNav via jumpToBottom` by hand — and at page load `autoFill rendered:50
// sh:0 ch:0` on every hidden window. FIX: the view keeps a REASON SET (mobile /
// tab / minimized / desktop compose; suspended while any holds, the settle +
// pinned re-tail runs when the last clears) and WindowManager.syncHiddenViews
// derives the three from the classes it owns at every site that changes them.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
if (!fs.existsSync(path.join(REPO, 'src/lib/build-version.js'))) { console.error('src/lib/build-version.js is missing — run `npm run build` first'); process.exit(1); }
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);

// ── 1. the PURE rule ──
console.log('— view-visibility (pure)');
{
  const { HIDE_REASONS, hiddenReasons, isDisplayed } = require(path.join(REPO, 'src/lib/view-visibility.js'));
  ok('three reasons, named', HIDE_REASONS.join(',') === 'mobile,tab,minimized');
  ok('narrow layout + inactive → mobile holds', hiddenReasons({ mobile: true, active: false }).mobile === true);
  ok('narrow layout + active → mobile does not hold', hiddenReasons({ mobile: true, active: true }).mobile === false);
  ok('wide layout + inactive → mobile does not hold (desktop shows every window)', hiddenReasons({ mobile: false, active: false }).mobile === false);
  ok('a hidden tab holds regardless of activity', hiddenReasons({ mobile: false, active: true, tabHidden: true }).tab === true);
  ok('minimized holds', hiddenReasons({ minimized: true }).minimized === true);
  ok('isDisplayed = no reason holds', isDisplayed(hiddenReasons({})) && !isDisplayed(hiddenReasons({ minimized: true })));
}

// ── 2. the ChatView reason set (real prototype, fake geometry) ──
console.log('— ChatView.setHidden / setSuspended compose');
const { ChatView } = await import(path.join(REPO, 'src/lib/chat-view.js'));
const mkView = ({ pinned = true } = {}) => {
  const v = Object.create(ChatView.prototype);
  Object.assign(v, {
    _suspended: false, _disposed: false, _pinned: pinned, _pinnedAtSuspend: false, _resumeSettleUntil: 0, _resumeAt: 0, _lastNavAt: 0,
    _lastUserScrollAt: 0, _lastPositionAt: 0, _lastStructuralAt: 0, _resumeRetailTimers: [], _teleported: false, _windowStart: 200, _windowEnd: 250, _total: 250,
    _newMsgCount: 0, _scrollBtn: { classList: { add() { }, remove() { } } }, _messageList: { scrollHeight: 0, clientHeight: 0, querySelectorAll: () => ({ length: 50 }) },
    _updateRunBar() { }, _scheduleRunBar() { }, _tickCollab() { }, _scrollToBottom() { v._scrolledToBottom = (v._scrolledToBottom || 0) + 1; }, jumpToBottom() { v._jumped = (v._jumped || 0) + 1; },
  });
  return v;
};
{
  const v = mkView();
  v.setHidden('mobile', true);
  ok('mobile-hidden → suspended', v._suspended === true);
  ok('…the pin snapshot is taken at suspend (the last honest reading)', v._pinnedAtSuspend === true);
  ok('…paging is blocked with the suspended reason', v._autoPagingBlocked() === 'suspended');
  ok('…the attach short-view rescue decides nothing (sh:0 ch:0 is an artifact, the capture\'s autoFill)', v._shortViewNeedsFill(v._messageList) === false);
  v.setHidden('tab', true);
  v.setHidden('mobile', false);
  ok('two hiders: releasing one keeps the view suspended', v._suspended === true);
  v.setHidden('tab', false);
  ok('releasing the LAST hider resumes', v._suspended === false);
  ok('…and arms the resume settle (the un-hidden window is re-measuring)', v._resumeSettleUntil > Date.now() && v._autoPagingBlocked() === 'resume-settle');
  ok('…and the pinned re-tail series is armed (scrollTop was zeroed by display:none — the view returns to the live tail)', v._resumeRetailTimers.length >= 2);
  v._clearResumeRetail();
}
{
  const v = mkView();
  v.setSuspended(true);
  ok('legacy setSuspended(true) = the desktop reason', v._suspended === true && v._hiddenReasons.has('desktop'));
  v.setHidden('mobile', true);
  v.setSuspended(false);
  ok('desktop-manager resuming its reason does NOT resume a window a mobile tab still hides', v._suspended === true);
  v.setHidden('mobile', false);
  ok('…until the mobile reason clears too', v._suspended === false);
  v._clearResumeRetail();
}
{
  const v = mkView({ pinned: false });
  v.setHidden('minimized', true);
  ok('a window that was reading history snapshots pinned=false', v._pinnedAtSuspend === false);
  v.setHidden('minimized', false);
  ok('…and its resume arms NO re-tail (a reader is never yanked to the bottom)', v._resumeRetailTimers.length === 0);
  v.setHidden('minimized', false);
  ok('a redundant release is a no-op', v._suspended === false);
}

// ── 3. WindowManager.syncHiddenViews derives the three reasons from the classes it owns ──
console.log('— WindowManager.syncHiddenViews');
const { WindowManager } = await import(path.join(REPO, 'src/lib/window.js'));
const cls = (...names) => { const s = new Set(names); return { contains: (n) => s.has(n), add: (n) => s.add(n), remove: (n) => s.delete(n) }; };
const mkWin = (id, { active = false, tabHidden = false, minimized = false, chain = null } = {}) => ({ id, element: { classList: cls(...(active ? ['window-active'] : [])) }, content: { classList: cls(...(tabHidden ? ['tab-hidden'] : [])) }, isMinimized: minimized, _tabChain: chain });
const mkSess = () => { const s = { calls: {}, setHidden(r, on) { s.calls[r] = on; } }; return s; };
const drive = ({ mobile }) => {
  const wm = Object.create(WindowManager.prototype);
  const chain = { tabs: ['A', 'C'], active: 0 };
  const windows = new Map([
    ['A', mkWin('A', { active: true, chain })],           // active host of a tab chain
    ['B', mkWin('B')],                                     // plain, inactive
    ['C', mkWin('C', { tabHidden: true, chain })],         // guest of A, its tab not current
    ['D', mkWin('D', { minimized: true })],                // minimized
    ['T', { id: 'T', element: { classList: cls() }, content: { classList: cls() } }], // a terminal (no setHidden) — skipped
  ]);
  const sessions = new Map([['A', mkSess()], ['B', mkSess()], ['C', mkSess()], ['D', mkSess()], ['T', { write() { } }]]);
  Object.assign(wm, { windows, _app: { sessions }, _hideMq: { matches: mobile } });
  wm.syncHiddenViews();
  return { s: Object.fromEntries([...sessions].map(([k, v]) => [k, v.calls])) };
};
{
  const { s } = drive({ mobile: true });
  ok('phone: the active window is displayed (no reason holds)', s.A.mobile === false && s.A.tab === false && s.A.minimized === false, JSON.stringify(s.A));
  ok('phone: the inactive window is mobile-hidden', s.B.mobile === true && s.B.tab === false);
  ok('phone: a guest of the ACTIVE host is not mobile-hidden (displayed through its host) but its tab is', s.C.mobile === false && s.C.tab === true, JSON.stringify(s.C));
  ok('phone: the minimized window is minimized-hidden (and mobile-hidden — it is not active either)', s.D.minimized === true && s.D.mobile === true);
  ok('a terminal session without setHidden is skipped, never thrown on', true);
}
{
  const { s } = drive({ mobile: false });
  ok('desktop: nothing is mobile-hidden', [s.A, s.B, s.C, s.D].every((c) => c.mobile === false));
  ok('desktop: the hidden tab still holds', s.C.tab === true && s.B.tab === false);
  ok('desktop: minimized still holds', s.D.minimized === true && s.B.minimized === false);
}

// ── 4. wiring pins (the unstaged-wiring class): every site that changes the classes re-derives ──
console.log('— wiring pins');
{
  const wj = read('src/lib/window.js'), tg = read('src/lib/tab-group.js'), sl = read('src/lib/session-lifecycle.js'), cv = read('src/lib/chat-view.js'), css = read('public/style.css');
  ok('focusWindow re-derives on BOTH branches (grouped guest and plain)', (wj.match(/this\.activeWindowId = id; this\.syncHiddenViews\(\); this\._notify\(\);/g) || []).length === 2);
  // minimize's body (2.369.125 r2: the ≤768px refocus sits between the mark and the derivation — the derivation must see the NEW active class)
  const minBody = wj.slice(wj.indexOf('  minimize(id) {'), wj.indexOf('  _focusMostRecent('));
  ok('minimize re-derives AFTER the mark and after the phone refocus (restore goes through focusWindow)',
    minBody.indexOf('win.isMinimized=true;') > 0 && minBody.indexOf('this._focusMostRecent(win.id)') > minBody.indexOf('win.isMinimized=true;') && minBody.indexOf('this.syncHiddenViews();') > minBody.indexOf('this._focusMostRecent(win.id)') && /win\.isMinimized=false; this\.focusWindow\(id\);/.test(wj),
    minBody.slice(-200));
  ok('switchTab re-derives after flipping the guest\'s content', /this\.activeWindowId = chain\.tabs\[index\];\s*\n\s*this\.syncHiddenViews\?\.\(\);/.test(tg));
  ok('every ChatView registration re-derives (a view born hidden starts suspended — the page-load autoFill)', (sl.match(/sessions\.set\(winInfo\.id, (chatView|view)\); (this|app)\.wm\.syncHiddenViews\?\.\(\);/g) || []).length === 4);
  ok('the breakpoint flip re-derives (matchMedia change → syncHiddenViews)', /matchMedia\('\(max-width: 768px\)'\)/.test(wj) && /addEventListener\?\.\('change', \(\) => this\.syncHiddenViews\(\)\)/.test(wj));
  ok('the rule is imported from the PURE module, not re-spelled', /import \{ HIDE_REASONS, hiddenReasons \} from '\.\/view-visibility\.js'/.test(wj));
  ok('setSuspended is the desktop reason of the same set (desktop-manager / stage-manager untouched)', /setSuspended\(on\) \{ this\.setHidden\('desktop', on\); \}/.test(cv) && /_applySuspend\(on\) \{/.test(cv));
  ok('every gate still reads the derived flag (suspended / resume-settle / shortViewNeedsFill / extendTop)', /if \(this\._suspended\) return 'suspended';/.test(cv) && /if \(this\._suspended \|\| this\._disposed\) return; \/\/ hidden window: sh<=ch is an artifact/.test(cv));
  // WHY the sync exists: the three display:none hiders (a CSS refactor that keeps geometry would still need the sync for scrollTop)
  ok('style.css: the phone layout displays only the active window (display:none for the rest)', /\.window \{[^}]*display: none !important;[^}]*\}\s*\n\s*\.window\.window-active \{ display: flex !important; \}/.test(css));
  ok('style.css: a grouped guest\'s hidden tab is display:none', /\.tab-hidden \{ display: none !important; \}/.test(css));
  ok('window.js: minimize is display:none', /win\.element\.style\.display='none'; win\.isMinimized=true;/.test(wj));
  ok('the incident is named at the rule (future readers find the bundle)', /inc-mu6bfv1t-4drq/.test(read('src/lib/view-visibility.js')) && /inc-mu6bfv1t-4drq/.test(wj));
  ok('ci.mjs runs this suite', /'test-hidden-view-suspend'/.test(read('scripts/ci.mjs')));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
