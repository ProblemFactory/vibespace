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

// ── 5. RECONNECT SLOTS (perf lane ⑤b, inc-mtndq0vb's third layer): after a
//      socket drop every ChatView re-attached in the same tick (19 windows in
//      one second, most of them hidden). A displayed view attaches at once; a
//      SUSPENDED one (any reason of the set above — never a fourth flag) waits
//      for its slot in the App's queue; un-hiding it attaches it NOW. ──
console.log('— reconnectSlot (pure)');
{
  const vv = require(path.join(REPO, 'src/lib/view-visibility.js'));
  const { reconnectSlot } = vv;
  ok('reconnectSlot is exported by the PURE module', typeof reconnectSlot === 'function');
  if (typeof reconnectSlot === 'function') {
    ok('visible ⇒ 0 (attach at once, whatever the index)', reconnectSlot({ suspended: false, index: 7 }) === 0 && reconnectSlot({}) === 0);
    ok('hidden slot 0 ⇒ base (1500)', reconnectSlot({ suspended: true, index: 0 }) === 1500);
    ok('hidden slot k ⇒ base + k·step (k=1 → 1750, k=13 → 4750)', reconnectSlot({ suspended: true, index: 1 }) === 1750 && reconnectSlot({ suspended: true, index: 13 }) === 4750);
    ok('capped at 6000 (k=18 → 6000, k=500 → 6000)', reconnectSlot({ suspended: true, index: 18 }) === 6000 && reconnectSlot({ suspended: true, index: 500 }) === 6000);
    ok('a negative / NaN / missing index ⇒ base, never "at once"', [-3, NaN, undefined, Infinity, '2x'].every((index) => reconnectSlot({ suspended: true, index }) === 1500));
    ok('the knobs are parameters (base 100 / step 10 / cap 150: k=3 → 130, k=9 → 150)', reconnectSlot({ suspended: true, index: 3, baseMs: 100, stepMs: 10, capMs: 150 }) === 130 && reconnectSlot({ suspended: true, index: 9, baseMs: 100, stepMs: 10, capMs: 150 }) === 150);
  }
}

console.log('— ChatView reconnect: displayed now, suspended by slot (fake ws + fake timers)');
{
  let createReconnectQueue = null;
  try { ({ createReconnectQueue } = await import(path.join(REPO, 'src/lib/reconnect-queue.js'))); } catch { }
  ok('the App\'s queue module exists (src/lib/reconnect-queue.js)', typeof createReconnectQueue === 'function');
  ok('ChatView has the reconnect entry (_reconnectAttach) and the deferred attach (_runQueuedReattach)', typeof ChatView.prototype._reconnectAttach === 'function' && typeof ChatView.prototype._runQueuedReattach === 'function');
  // BEHAVIOURAL on every build: without the fix the state handler's reconnect act
  // was `this._reattach(true)` for every view (pinned in git history), so the legs
  // below run that and go RED on the suspended views instead of being skipped.
  const reconnectOf = (v) => (typeof v._reconnectAttach === 'function' ? v._reconnectAttach() : v._reattach(true));
  if (typeof createReconnectQueue !== 'function') createReconnectQueue = () => ({ enqueue() { }, take() { return false; }, cancel() { }, reset() { }, has() { return false; }, get size() { return 0; } });
  {
    // fake timers + a manual microtask flush — deterministic, no wall clock
    let now = 0; const timers = []; const deferred = [];
    const setTimer = (fn, ms) => { const h = { fn, due: now + ms, live: true }; timers.push(h); return h; };
    const clearTimer = (h) => { if (h) h.live = false; };
    const advance = (ms) => { const end = now + ms; for (;;) { const nx = timers.filter((h) => h.live && h.due <= end).sort((a, b) => a.due - b.due)[0]; if (!nx) break; now = nx.due; nx.live = false; nx.fn(); } now = end; };
    const drain = () => { while (deferred.length) deferred.shift()(); };
    const ranks = new Map();
    const q = createReconnectQueue({ setTimer, clearTimer, defer: (fn) => deferred.push(fn), rankOf: (v) => ranks.get(v) || [9, 9] });
    const sent = [];
    const fakeWs = { send(m) { sent.push({ ...m, at: now }); }, onGlobal() { }, offGlobal() { } };
    const mkLive = (name, rank) => {
      const v = mkView();
      Object.assign(v, { name, sessionId: 'sid-' + name, ws: fakeWs, app: { _reconnectQueue: q }, _readOnly: false, _disconnected: false, _normEpoch: 'e1',
        _chatInput: { disabled: null, setDisconnected(on) { this.disabled = on; } }, _hideTyping() { }, _renderers: { appendSystem() { } } });
      ranks.set(v, rank);
      return v;
    };
    const attachesOf = (v) => sent.filter((m) => m.type === 'attach' && m.sessionId === v.sessionId);
    const reconnect = (views) => { for (const v of views) reconnectOf(v); };

    // one displayed + one hidden by EACH of the four reasons, ranked in desktop/window order
    const vis = mkLive('vis', [0, 0]);
    const hid = { desktop: mkLive('desk', [2, 4]), mobile: mkLive('mob', [0, 1]), tab: mkLive('tab', [0, 2]), minimized: mkLive('min', [1, 3]) };
    for (const [reason, v] of Object.entries(hid)) v.setHidden(reason, true);
    reconnect([hid.desktop, vis, hid.mobile, hid.tab, hid.minimized]); // registration order ≠ rank order
    ok('the displayed view sends its attach SYNCHRONOUSLY in the reconnect pass', attachesOf(vis).length === 1 && attachesOf(vis)[0].at === 0);
    for (const [reason, v] of Object.entries(hid)) ok(`a view hidden by '${reason}' sends NOTHING in the reconnect pass`, attachesOf(v).length === 0);
    ok('…and a queued view\'s composer stays disabled (it is not re-registered yet)', Object.values(hid).every((v) => v._chatInput.disabled === true));
    drain();
    advance(1499);
    ok('no hidden attach before the base slot (1500 ms)', Object.values(hid).every((v) => attachesOf(v).length === 0));
    advance(1);
    ok('slot 0 = the best-ranked hidden view (active desktop, mobile-hidden) at 1500 ms', attachesOf(hid.mobile).length === 1 && attachesOf(hid.mobile)[0].at === 1500);
    advance(250);
    ok('slot 1 = the tab guest at 1750 ms', attachesOf(hid.tab).length === 1 && attachesOf(hid.tab)[0].at === 1750);
    advance(250);
    ok('slot 2 = the minimized window (desktop rank 1) at 2000 ms', attachesOf(hid.minimized).length === 1 && attachesOf(hid.minimized)[0].at === 2000);
    advance(250);
    ok('slot 3 = the window on the far desktop at 2250 ms', attachesOf(hid.desktop).length === 1 && attachesOf(hid.desktop)[0].at === 2250);
    advance(10000);
    ok('every view attached exactly once (no double send from the queue)', [vis, ...Object.values(hid)].every((v) => attachesOf(v).length === 1) && q.size === 0);
  }
  {
    // un-hide mid-queue ⇒ attach NOW, slot cancelled; dispose ⇒ dequeued; a second drop ⇒ superseded
    let now = 0; const timers = []; const deferred = [];
    const setTimer = (fn, ms) => { const h = { fn, due: now + ms, live: true }; timers.push(h); return h; };
    const clearTimer = (h) => { if (h) h.live = false; };
    const advance = (ms) => { const end = now + ms; for (;;) { const nx = timers.filter((h) => h.live && h.due <= end).sort((a, b) => a.due - b.due)[0]; if (!nx) break; now = nx.due; nx.live = false; nx.fn(); } now = end; };
    const drain = () => { while (deferred.length) deferred.shift()(); };
    const q = createReconnectQueue({ setTimer, clearTimer, defer: (fn) => deferred.push(fn), rankOf: () => [0, 0] });
    const sent = [];
    const fakeWs = { send(m) { sent.push({ ...m, at: now }); }, onGlobal() { }, offGlobal() { }, offStateChange() { } };
    const mkLive = (name) => { const v = mkView(); Object.assign(v, { name, sessionId: 'sid-' + name, ws: fakeWs, app: { _reconnectQueue: q }, _readOnly: false, _disconnected: false, _chatInput: { setDisconnected() { } }, _hideTyping() { }, _renderers: { appendSystem() { } } }); return v; };
    const attachesOf = (v) => sent.filter((m) => m.type === 'attach' && m.sessionId === v.sessionId);
    const a = mkLive('a'), b = mkLive('b'), c = mkLive('c');
    for (const v of [a, b, c]) v.setHidden('desktop', true);
    for (const v of [a, b, c]) reconnectOf(v);
    drain();
    advance(500);
    b.setHidden('desktop', false);   // the user switched to b's desktop 500 ms after the reconnect
    ok('un-hidden before its slot ⇒ the attach is sent AT the un-hide (no stale window waits for a timer)', attachesOf(b).length === 1 && attachesOf(b)[0].at === 500);
    ok('…and its slot is cancelled (the queue no longer holds it)', !q.has(b));
    advance(5000);
    ok('…no second attach when its old slot time passes', attachesOf(b).length === 1);
    ok('the other queued views still attached by slot', attachesOf(a).length === 1 && attachesOf(c).length === 1);
    // dispose dequeues
    const d = mkLive('d'), e = mkLive('e');
    for (const v of [d, e]) { v.setHidden('tab', true); reconnectOf(v); }
    drain();
    ok('two queued views', q.has(d) && q.has(e));
    try { ChatView.prototype.dispose.call(Object.assign(d, { _statusBar: null, _settingsListeners: [], ws: fakeWs, _clearPendingSteers() { }, _stopCollabTick() { } })); } catch (err) { /* the fake lacks DOM teardown bits; the dequeue is the first act */ }
    ok('dispose dequeues the view (it never takes its slot)', !q.has(d));
    advance(10000);
    ok('…and a disposed view sends no attach', attachesOf(d).length === 0 && attachesOf(e).length === 1);
    // a second drop while slots are pending supersedes them
    const f = mkLive('f');
    f.setHidden('minimized', true); reconnectOf(f); drain();
    q.reset(); // the App's disconnect handler
    advance(10000);
    ok('a drop while a slot is pending supersedes it (reset ⇒ no attach into the dead socket)', attachesOf(f).length === 0 && q.size === 0);
    reconnectOf(f); drain(); advance(1500);
    ok('…the next reconnect pass queues it afresh', attachesOf(f).length === 1);
    // a read-only view is never queued (it has nothing to re-attach)
    const r = mkLive('r'); r._readOnly = true; r.setHidden('desktop', true); reconnectOf(r); drain();
    ok('a read-only view never enters the queue', !q.has(r));
    // a view with no App queue (older wiring, subagent viewer) keeps the old behaviour: attach at once
    const n = mkLive('n'); n.app = {}; n.setHidden('desktop', true); reconnectOf(n);
    ok('no queue on the App ⇒ attach at once (the pre-⑤b behaviour, never a stuck window)', attachesOf(n).length === 1);
  }
}

// ── 6. reconnect wiring pins ──
console.log('— reconnect wiring pins');
{
  const cv = read('src/lib/chat-view.js'), app = read('src/lib/app.js'), rq = fs.existsSync(path.join(REPO, 'src/lib/reconnect-queue.js')) ? read('src/lib/reconnect-queue.js') : '';
  ok('the ChatView state handler re-attaches through _reconnectAttach (not a bare _reattach(true))', /this\._renderers\.appendSystem\(t\('Reconnected'\)\);\s*\n\s*this\._reconnectAttach\(\);/.test(cv));
  ok('the queued view is decided by the DERIVED flag (_suspended), never a fourth flag', /if \(q && this\._suspended && !this\._readOnly && !this\._disposed\) \{/.test(cv));
  ok('_applySuspend(false) takes a queued view and attaches it now', /if \(!on && this\.app\?\._reconnectQueue\?\.take\(this\)\) this\._runQueuedReattach\('unhide'\);/.test(cv));
  ok('dispose cancels the view\'s slot', /this\.app\?\._reconnectQueue\?\.cancel\(this\)/.test(cv));
  ok('the App owns ONE queue, ranked by _reconnectRank, reset on every drop', /this\._reconnectQueue = createReconnectQueue\(\{ rankOf: \(view\) => this\._reconnectRank\(view\) \}\);/.test(app) && /if \(!connected\) \{ this\._reconnectQueue\.reset\(\); return; \}/.test(app));
  ok('the queue asks the PURE verdict (reconnectSlot), never re-spells the delays', /import \{ reconnectSlot \} from '\.\/view-visibility\.js';/.test(rq) && !/1500|250\b|6000/.test(rq.replace(/^\/\/.*$/gm, '')));
  ok('the terminal re-attach loop is untouched (still sends attach at once for TerminalSession)', /if \(session instanceof TerminalSession && session\.sessionId\) \{\s*\n\s*this\.ws\.send\(\{ type: 'attach', sessionId: session\.sessionId \}\);/.test(app));
  ok('the ladder still stamps reattachAt at the SEND inside _reattach (queue time is never server silence)', /const attachFrame = \{ type: 'attach', sessionId: this\.sessionId \};[\s\S]{0,1800}this\.ws\.send\(attachFrame\);[\s\S]{0,1600}const reattachAt = Date\.now\(\);/.test(cv)); // (perf D: the frame may carry sinceSeq — built once, re-sent by the ladder)
  ok('ci.mjs runs the reconnect-storm harness (heavy)', /name: 'test-reconnect-storm', tier: 'heavy'/.test(read('scripts/ci.mjs')));
}

// ── 7. THE SLAB AN ATTACH ASKS FOR (perf r1 — the verifier's 19-window probe:
//      the text window shipped to every window cost ×2.4 the bytes of a cold
//      open and the 14 hidden windows of a restart paid for it too). A
//      SUSPENDED view asks for the floor (tail(50)); a displayed one past the
//      FIRST of a burst too (any other attach in flight); the rest the text window. ──
console.log('— attachSlab (pure) + the frames views send');
{
  const vv = require(path.join(REPO, 'src/lib/view-visibility.js'));
  const { attachSlab, ATTACH_TEXT_BURST } = vv;
  ok('attachSlab is exported by the PURE module (burst 1: only the first attach of a burst gets the text window)', typeof attachSlab === 'function' && ATTACH_TEXT_BURST === 1);
  if (typeof attachSlab === 'function') {
    ok("suspended ⇒ 'floor' whatever the burst", attachSlab({ suspended: true }) === 'floor' && attachSlab({ suspended: true, inFlight: 0 }) === 'floor');
    ok("displayed, nothing else in flight ⇒ 'text' (one window opened — the common case)", attachSlab({ inFlight: 0 }) === 'text' && attachSlab() === 'text');
    ok("displayed, 1+ other attaches in flight ⇒ 'floor' (a burst gives the text window to its first attach only)", [1, 4, 18].every((inFlight) => attachSlab({ inFlight }) === 'floor'));
    ok('garbage inFlight ⇒ 0 (never a floor by accident); burst is a parameter', [NaN, -2, undefined, 'x'].every((inFlight) => attachSlab({ inFlight }) === 'text') && attachSlab({ inFlight: 3, burst: 4 }) === 'text' && attachSlab({ inFlight: 4, burst: 4 }) === 'floor');
  }
  // the ChatView's re-attach frame carries it (fake ws: an attachesInFlight count the test sets)
  const sent = []; let inFlight = 0;
  const fakeWs = { send(m) { sent.push(m); }, onGlobal() { }, offGlobal() { }, attachesInFlight: () => inFlight };
  const mk = () => { const v = mkView(); Object.assign(v, { sessionId: 'sid-slab', ws: fakeWs, app: {}, _readOnly: false, _disconnected: false, _chatInput: { setDisconnected() { } }, _hideTyping() { }, _renderers: { appendSystem() { } } }); return v; };
  const last = () => sent[sent.length - 1] || {};
  const a = mk(); a._reattach(true);
  ok("a displayed view's re-attach asks for the text window", last().type === 'attach' && last().slab === 'text', JSON.stringify(last()));
  const b = mk(); b.setHidden('desktop', true); b._reattach(true);
  ok("a SUSPENDED view's re-attach (its queued slot) asks for the floor", last().slab === 'floor', JSON.stringify(last()));
  inFlight = 1; const c = mk(); c._reattach(true);
  ok("a displayed view behind another attach in flight asks for the floor", last().slab === 'floor', JSON.stringify(last()));
  inFlight = 0;
  for (const v of [a, b, c]) v._reattachGen++; // retire the ladders' timers (they check the generation)
  // the ws layer counts them: sent ⇒ in flight until attached / error; a drop clears
  const wsSrc = read('src/lib/ws.js');
  ok('WsManager counts attaches in flight (sent → attached|error; cleared on a drop; 15 s staleness)', /this\._attachInFlight\.set\(d\.sessionId, Date\.now\(\)\)/.test(wsSrc) && /\(d\.type === 'attached' \|\| d\.type === 'error'\) && d\.sessionId\) this\._attachInFlight\.delete\(d\.sessionId\)/.test(wsSrc) && /this\._connected = false;\s*\n\s*this\._attachInFlight\.clear\(\);/.test(wsSrc) && /attachesInFlight\(now = Date\.now\(\)\)/.test(wsSrc));
  const sl = read('src/lib/session-lifecycle.js');
  ok("every chat attach site asks: the live open (burst), the view-only open (suspended + burst), the rescue + the re-attach (ChatView._attachSlabHint)",
    /type: 'attach', sessionId: serverId, slab: attachSlab\(\{ inFlight: this\.ws\.attachesInFlight\?\.\(\) \?\? 0 \}\)/.test(sl)
    && /slab: attachSlab\(\{ suspended: !!chatView\._suspended, inFlight: this\.ws\.attachesInFlight\?\.\(\) \?\? 0 \}\)/.test(sl)
    && /type: 'attach', sessionId: viewId, viewOnly: true, backend, slab: this\._attachSlabHint\(\),/.test(read('src/lib/chat-view.js'))
    && /attachFrame\.slab = this\._attachSlabHint\(\);/.test(read('src/lib/chat-view.js')));
}

// ── 8. THE WATERMARK MEANS APPLIED (perf r1 — the verifier's race probe: a
//      renderer exception on one op of a held replay left the view one card
//      short for the life of the epoch; `_lastSeq` had been stamped before the
//      op ran, the next held resume replayed [] ). ──
console.log('— a failed op poisons the resume watermark; the next attach heals from the slab');
{
  const sent = []; const handlers = [];
  const fakeWs = { send(m) { sent.push(m); }, onGlobal(h) { handlers.push(h); }, offGlobal(h) { const i = handlers.indexOf(h); if (i >= 0) handlers.splice(i, 1); }, attachesInFlight: () => 0 };
  const mk = () => {
    const v = mkView();
    const rendered = [];
    Object.assign(v, { sessionId: 'sid-poison', ws: fakeWs, app: {}, _readOnly: false, _disconnected: false, _normEpoch: 'e1', _seqEpoch: 'e1', _serverOpSeq: 60, _lastSeq: 60,
      _chatInput: { setDisconnected() { } }, _hideTyping() { }, _renderers: { appendSystem() { } }, _messages: [], _trace() { },
      _noteRecordKind() { }, _onServerStreamLabel() { }, applyStatus() { }, _applyLiveMeta() { },
      _onCreateMessage(m) { if (v.__throwOn === m.id) { v.__throwOn = null; throw new Error('renderer boom'); } rendered.push(m.id); } });
    v.rendered = rendered;
    return v;
  };
  const opOf = (seq, id) => ({ type: 'msg', sessionId: 'sid-poison', op: 'create', seq, message: { id } });
  const lastAttach = () => [...sent].reverse().find((m) => m.type === 'attach') || {};
  // (a) the LIVE path: op 61 throws (ws.js isolates the handler — the throw escapes _onOp), 62 applies
  {
    const v = mk(); v.__throwOn = 'm61';
    let threw = false; try { v._onOp(opOf(61, 'm61')); } catch { threw = true; }
    v._onOp(opOf(62, 'm62'));
    ok('(a) a throwing op still throws out of _onOp (the per-handler isolation reports it)', threw);
    v._reattach(true); v._reattachGen++;
    ok('(a) …and the next re-attach carries NO sinceSeq (a resume from 62 would skip 61 forever)', lastAttach().sinceSeq === undefined && lastAttach().sinceEpoch === undefined, JSON.stringify(lastAttach()));
  }
  // (b) the HELD replay: 23 ops, #3 throws ⇒ the watermark is not advanced to opSeq, the next attach asks no seq
  {
    const v = mk(); v.__throwOn = 'm63';
    const replay = Array.from({ length: 23 }, (_, i) => opOf(61 + i, 'm' + (61 + i)));
    v._applyHeldResume({ type: 'attached', sessionId: 'sid-poison', slab: 'held', replay, opSeq: 83, normEpoch: 'e1' });
    ok('(b) the rest of the replay still applies (22 of 23 rendered)', v.rendered.length === 22 && !v.rendered.includes('m63'));
    ok('(b) the watermark is NOT stamped to the replay\'s opSeq past the failed op', v._lastSeq !== 83, `lastSeq ${v._lastSeq}`);
    handlers.length = 0;
    v._reattach(true);
    ok('(b) the next re-attach carries NO sinceSeq (the verifier\'s second held resume replayed [] here)', lastAttach().sinceSeq === undefined, JSON.stringify(lastAttach()));
    // the full-rung reply: same epoch, a slab ⇒ the view is REBUILT from the slab (a catch-up from _windowEnd cannot reach the lost card)
    let reset = null, caught = 0;
    v._fullViewReset = function (msg) { reset = msg; this._seqPoisoned = false; };
    v._reattachCatchUp = () => { caught++; };
    const slab = { type: 'attached', sessionId: 'sid-poison', normEpoch: 'e1', opSeq: 84, totalCount: 149, messages: [{ id: 'm63' }, { id: 'm84' }] };
    for (const h of [...handlers]) h(slab);
    v._reattachGen++;
    ok('(b) the same-epoch full rung of a POISONED view rebuilds from the slab (_fullViewReset), not a catch-up', reset === slab && caught === 0, `reset ${!!reset} catchUps ${caught}`);
    ok('(b) …and the heal clears the flag: the next re-attach resumes by seq again', (() => { v._lastSeq = 84; v._reattach(true); v._reattachGen++; return lastAttach().sinceSeq === 84; })(), JSON.stringify(lastAttach()));
  }
  // (c) control: nothing throws ⇒ the watermark follows the ops and the resume asks from it
  {
    const v = mk();
    v._applyHeldResume({ type: 'attached', sessionId: 'sid-poison', slab: 'held', replay: [opOf(61, 'm61'), opOf(62, 'm62')], opSeq: 62, normEpoch: 'e1' });
    v._reattach(true); v._reattachGen++;
    ok('(c) control: a clean replay stamps the watermark and the next attach resumes from it (sinceSeq 62)', lastAttach().sinceSeq === 62 && !v._seqPoisoned, JSON.stringify(lastAttach()));
  }
  const cv = read('src/lib/chat-view.js');
  ok('wiring: _fullViewReset clears the flag only after loadHistory ran through', /this\.loadHistory\(msg\.messages \|\| \[\], msg\.totalCount \|\| 0, msg\.isStreaming, msg\);\s*\n(\s*\/\/.*\n)*\s*this\._seqPoisoned = false;/.test(cv));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
