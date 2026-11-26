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
import { anchored } from './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';
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
  // inc-munl8jkl-gaih: the two visibility hiders (a desktop, the Stage) are reasons of the SAME set — the marks they
  // imply are derived (view-visibility windowMarks; the table + the census live in test-stage-visibility)
  ok('five reasons, named (desktop / stage joined the three display:none ones)', HIDE_REASONS.join(',') === 'desktop,stage,mobile,tab,minimized');
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
  ok('the breakpoint flip re-derives (matchMedia change → syncHiddenViews)', /matchMedia\(VC_PHONE_MEDIA\)/.test(wj) && /addEventListener\?\.\('change', \(\) => this\.syncHiddenViews\(\)\)/.test(wj));
  ok('the rule is imported from the PURE module, not re-spelled', /import \{ HIDE_REASONS, hiddenReasons, windowMarks(?:, revealDesktop)? \} from '\.\/view-visibility\.js'/.test(wj));
  ok('setSuspended is the desktop reason of the same set (the derivation drives every reason through setHidden)', /setSuspended\(on\) \{ this\.setHidden\('desktop', on\); \}/.test(cv) && /_applySuspend\(on\) \{/.test(cv));
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
  if (typeof createReconnectQueue !== 'function') createReconnectQueue = () => ({ enqueue() { }, landed() { }, take() { return false; }, cancel() { }, reset() { }, has() { return false; }, get size() { return 0; } });
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
    // B-a26e (主开发 r4686; the lane's own read of 4c2a64f15, MUST 1): A HELD WINDOW's RETRY AFTER A RECONNECT RIDES THE RECONNECT
    // PASS — enqueued with the hidden windows of the same reconnect, so that pass never cancels it (the tip's slot of its own, `join`,
    // was cancelled by the very pass of its reconnect when a hidden window came after it: the window held on a live socket, asking
    // nothing). Its slot runs ONE new cycle (`_runQueuedReattach('slot')` → `_reattach`: a new attach id on the new socket, never a
    // re-send of the old frame); two reconnects in a row ask once. Jitter off here (`random` = 0) so the slots are the exact ones;
    // the storm legs below judge the jitter and the cap
    let now = 0; const timers = []; const deferred = [];
    const setTimer = (fn, ms) => { const h = { fn, due: now + ms, live: true }; timers.push(h); return h; };
    const clearTimer = (h) => { if (h) h.live = false; };
    const advance = (ms) => { const end = now + ms; for (;;) { const nx = timers.filter((h) => h.live && h.due <= end).sort((a, b) => a.due - b.due)[0]; if (!nx) break; now = nx.due; nx.live = false; nx.fn(); } now = end; };
    const drain = () => { while (deferred.length) deferred.shift()(); };
    const q = createReconnectQueue({ setTimer, clearTimer, defer: (fn) => deferred.push(fn), rankOf: () => [0, 0], random: () => 0, now: () => now });
    ok('B-a26e: the queue has no join (a held retry rides the pass) and counts the held retries it released (landed, inFlight)', typeof q.join !== 'function' && typeof q.landed === 'function' && typeof q.inFlight === 'number');
    const sent = [];
    const fakeWs = { connected: true, send(m) { sent.push({ ...m, at: now }); }, onGlobal() { }, offGlobal() { } };
    const mk = (name) => { const v = mkView(); Object.assign(v, { name, sessionId: 'sid-' + name, ws: fakeWs, app: { _reconnectQueue: q }, _readOnly: false, _disconnected: false, _normEpoch: 'e1',
      _chatInput: { disabled: null, why: undefined, setDisconnected(on, why) { this.disabled = on; this.why = why; } }, _hideTyping() { }, _renderers: { appendSystem() { } } }); return v; };
    const attachesOf = (v) => sent.filter((m) => m.type === 'attach' && m.sessionId === v.sessionId);
    const a = mk('a'), b = mk('b'), held = mk('held'), held2 = mk('held2');
    for (const v of [held, held2]) { v._attachHold = { frame: { type: 'attach', sessionId: v.sessionId, slab: 'floor' }, line: null, timer: 0 }; v._reattach = function () { this.ws.send({ type: 'attach', sessionId: this.sessionId, cycle: true }); }; }   // the new cycle's send, counted (its ladder is chat-view's)
    a.setHidden('tab', true); b.setHidden('tab', true);
    reconnectOf(held); reconnectOf(a); reconnectOf(held2); reconnectOf(b);   // ONE reconnect, in the windows' order, hidden windows in it (the tip's red: their pass cancelled the held windows' own slots)
    ok('B-a26e: a held window on a reconnect sends nothing at once and keeps the hold\'s reason on its composer', attachesOf(held).length === 0 && held._chatInput.disabled === true && held._chatInput.why === 'attaching', held._chatInput);
    drain();
    ok('B-a26e: one reconnect = ONE pass of four slots, the held windows\' among them (none cancelled by the pass)', q.size === 4 && q.has(held) && q.has(held2), q.snapshot && q.snapshot());
    advance(10000);
    ok('B-a26e: every window of the pass attaches ONCE, in its slot, in the windows\' order (held 1500, a 1750, held2 2000, b 2250)', [held, a, held2, b].every((v) => attachesOf(v).length === 1) && attachesOf(held)[0].at === 1500 && attachesOf(a)[0].at === 1750 && attachesOf(held2)[0].at === 2000 && attachesOf(b)[0].at === 2250, sent);
    ok('B-a26e: each held window runs ONE new cycle — never a re-send of the held frame (r4686)', attachesOf(held)[0]?.cycle === true && attachesOf(held2)[0]?.cycle === true && held._reattachGen === undefined, sent);
    ok('B-a26e: the queue counts the two held retries it released until they land', q.inFlight === 2, q.inFlight);
    q.landed?.(held);   // (optional: a red-first run on a tree without it reads red here, never a throw)
    ok('B-a26e: …a landed one no longer counts', q.inFlight === 1, q.inFlight);
    reconnectOf(held); drain(); advance(200); reconnectOf(held); reconnectOf(a); drain();   // two reconnects in a row: the second pass supersedes the first
    advance(10000);
    ok('B-a26e: two reconnects in a row ask ONCE for a held window (the newer pass\'s slot)', attachesOf(held).length === 2 && attachesOf(a).length === 2, sent);
    held._disconnected = true;
    reconnectOf(held); drain(); advance(10000);
    ok('B-a26e: a held window\'s slot whose socket is down meanwhile asks nothing (the belt in _runQueuedReattach)', attachesOf(held).length === 2, sent);
    // r4708's belt, its own leg (主开发 r4857's round): the socket CLOSING (its onclose not run yet) — the slot asks nothing and is not
    // counted (the reconnect's pass asks on the next socket); CONTROL: the same held window on an OPEN socket asks once
    const closing = mk('closing'); closing._attachHold = { frame: null, line: null, timer: 0 }; closing.ws = { ...fakeWs, ws: { readyState: 2 } };
    const inF0 = q.inFlight;
    reconnectOf(closing); drain(); advance(10000);
    ok('B-a26e (r4708): a held retry whose socket is CLOSING asks nothing and is not counted', attachesOf(closing).length === 0 && q.inFlight === inF0, { sent: attachesOf(closing), inF0, now: q.inFlight });
    closing.ws = { ...fakeWs, ws: { readyState: 1 } };
    reconnectOf(closing); drain(); advance(10000);
    ok('B-a26e CONTROL: the same held window on an OPEN socket asks once — the leg above can go red', attachesOf(closing).length === 1, attachesOf(closing));
  }
  {
    // B-a26e (主开发 r4686): THE STORM — a hundred held windows in ONE reconnect's pass. Their retries are JITTERED (never one tick) and
    // the page never has more than the cap of them in flight: the queue counts each held retry it released until it lands (here its
    // answer 3 s later, `landed`); the page's own count (`pageInFlight`, the socket's attaches in flight) holds them too; a retry the
    // hub never answers stops counting after HELD_FLIGHT_MS (the queue never starves). CONTROL: no cap and no jitter (the slots
    // alone, the release's pass) piles them up.
    const storm = ({ n = 100, cap, jitterMs, answerMs = 3000, page = () => 0, until = 600000 } = {}) => {
      let now = 0; const timers = []; const deferred = [];
      const setTimer = (fn, ms) => { const h = { fn, due: now + ms }; timers.push(h); return h; };
      const clearTimer = (h) => { const i = timers.indexOf(h); if (i >= 0) timers.splice(i, 1); };
      const advance = (ms) => { const end = now + ms; for (;;) { let nx = null; for (const h of timers) if (h.due <= end && (!nx || h.due < nx.due)) nx = h; if (!nx) break; clearTimer(nx); now = nx.due; nx.fn(); } now = end; };
      let seed = 42; const random = () => { seed = (seed + 0x6D2B79F5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };   // seeded (mulberry32): the same run every time
      let live = 0, maxLive = 0; const fires = [];
      const q = createReconnectQueue({ setTimer, clearTimer, defer: (fn) => deferred.push(fn), rankOf: () => [0, 0], random, now: () => now, pageInFlight: () => page(now), ...(cap != null ? { cap } : {}), ...(jitterMs != null ? { jitterMs } : {}) });
      const views = Array.from({ length: n }, (_, i) => { const v = { name: 'held' + i, _attachHold: {}, _runQueuedReattach() { live++; maxLive = Math.max(maxLive, live); fires.push(now); if (answerMs != null) setTimer(() => { live--; q.landed?.(v); }, answerMs); } }; return v; });
      for (const v of views) q.enqueue(v);
      while (deferred.length) deferred.shift()();
      advance(until);
      const sorted = [...fires].sort((x, y) => x - y), perTick = new Map(); for (const f of fires) perTick.set(f, (perTick.get(f) || 0) + 1);
      return { fires: fires.length, maxLive, maxPerTick: fires.length ? Math.max(...perTick.values()) : 0, ticks: perTick.size, first: sorted[0] ?? null, fifth: sorted[4] ?? null, last: sorted[sorted.length - 1] ?? null };
    };
    let RQ = {}; try { RQ = await import(path.join(REPO, 'src/lib/reconnect-queue.js')); } catch { }
    const CAP = RQ.HELD_CAP, FLIGHT = RQ.HELD_FLIGHT_MS;
    const s = storm({});
    ok(`B-a26e (r4686): a hundred held windows in one reconnect's pass all retry (${s.fires}), never more than the cap in flight (${s.maxLive} ≤ ${CAP}), at most ${s.maxPerTick} in one tick; the last within ${Math.round((s.last || 0) / 1000)} s`, typeof CAP === 'number' && s.fires === 100 && s.maxLive <= CAP && s.maxPerTick <= CAP, s);
    const j = storm({ cap: Infinity });
    ok(`B-a26e (r4686): THE JITTER alone (no cap): the hundred retries fire at ${j.ticks} distinct moments, at most ${j.maxPerTick} in one tick (the slots alone put 82 of them at 6 s)`, j.fires === 100 && j.ticks >= 90 && j.maxPerTick <= (CAP || 4), j);
    const g = storm({ n: 8, page: (at) => (at < 20000 ? 9 : 0) });
    ok(`B-a26e (r4686): the page's own attaches in flight hold the held retries too (9 in flight until 20 s: the first retry at ${Math.round((g.first || 0) / 1000)} s; all ${g.fires} go after)`, g.fires === 8 && g.first >= 20000, g);
    const f = storm({ n: 6, answerMs: null, until: 400000 });
    ok(`B-a26e (r4686): a retry the hub never answers stops counting after HELD_FLIGHT_MS (${FLIGHT} ms): four go, the fifth at ${Math.round((f.fifth || 0) / 1000)} s, all ${f.fires} by 400 s — the queue never starves`, typeof FLIGHT === 'number' && f.fires === 6 && f.fifth >= FLIGHT, f);
    const x = storm({ cap: Infinity, jitterMs: 0 });
    ok(`B-a26e CONTROL (r4686): with no cap and no jitter (the slots alone) the same storm piles up — ${x.maxLive} in flight, ${x.maxPerTick} in one tick — the legs above can go red`, x.maxLive > (CAP || 4) && x.maxPerTick > (CAP || 4), x);
  }
  {
    // B-a26e (r4708's delta read: three cures no leg could red) — the REAL _holdAttach / _reattach / its cycle handler on a fake
    // clock (setTimeout and Date.now swapped for this synchronous block, put back after): (a) the 15-minute words run from the
    // hold's START — a new cycle 10 minutes in (its ladder's end calls _holdAttach again) does not restart them (RED in the
    // re-arm form: at 25 minutes); a new hold after its end says the first words; (b) a held retry is counted until ITS OWN answer
    // lands through the real cycle handler (`landed`); (c) a cycle whose view another road attached unhooks its handler at its check
    // (d) THE HOLD NEVER OUTLIVES ITS WINDOW (主开发 r4857, the full round's MUST): its RED CONTROL is the tip's dispose with its
    // hold-clear line cut — a copy of chat-view (its imports the real modules), loaded before the clock is swapped
    const DISPOSE_CLEAR = '    try { this._clearAttachHold(); } catch { }   // B-a26e: a closed view\'s attach hold ends (its timer, its queue slot, its line)\n';
    let CVx = null, mutantErr = null;
    try { ({ ChatView: CVx } = await import(mutantCopies('hold-dispose', REPO).write('src/lib/chat-view.js', anchored(read('src/lib/chat-view.js'), DISPOSE_CLEAR, '', 'dispose-no-hold-clear'), 'dispose-no-hold-clear', { esm: true }))); } catch (e) { mutantErr = String((e && e.message) || e).slice(0, 300); }
    const clock = { now: 1.8e12, timers: [] };
    const real = { st: globalThis.setTimeout, ct: globalThis.clearTimeout, now: Date.now, doc: globalThis.document };
    const tick = (ms) => { const end = clock.now + ms; for (;;) { let nx = null; for (const h of clock.timers) if (h.live && h.due <= end && (!nx || h.due < nx.due)) nx = h; if (!nx) break; nx.live = false; clock.now = nx.due; try { nx.fn(); } catch { } } clock.now = end; };
    const R = {};
    globalThis.setTimeout = (fn, ms) => { const m = Number(ms) || 0; const h = { fn, due: clock.now + (clock.short && m > 600000 && m <= 900000 ? m / 100 : m), live: true }; clock.timers.push(h); return h; };   // clock.short: the chrome suite's own short clock (a long delay at 1/100, the wall clock real)
    globalThis.clearTimeout = (h) => { if (h && typeof h === 'object') h.live = false; };
    Date.now = () => clock.now;
    globalThis.document = { createElement: () => ({ className: '', textContent: '', parentNode: null, append() { }, remove() { } }) };
    try {
      const stubs = (v, sid, extra = {}) => Object.assign(v, { sessionId: sid, _readOnly: false, _disconnected: false, _normEpoch: 'e1', _container: null, _statusBar: null, _chatInput: { setDisconnected() { } }, _hideTyping() { }, _renderers: { appendSystem() { } }, _trace() { } }, extra);
      const v = stubs(mkView(), 'sid-long');
      v._holdAttach({ type: 'attach', sessionId: 'sid-long' }, 1, null);
      R.first = v._attachHold?.note?.textContent;
      tick(10 * 60000);
      v._holdAttach({ type: 'attach', sessionId: 'sid-long' }, 2, null);   // a reconnect's new cycle reached its ladder's end: the same hold
      tick(5 * 60000 + 1);
      R.at15 = v._attachHold?.note?.textContent;
      v._clearAttachHold();
      v._holdAttach({ type: 'attach', sessionId: 'sid-long' }, 3, null);
      R.again = v._attachHold?.note?.textContent;
      v._clearAttachHold();
      // (a2) r4857: the words run from the ASK that began the hold — one asked 10 minutes before its ladder ended says Reload 5 minutes on
      const v3 = stubs(mkView(), 'sid-asked');
      v3._holdAttach({ type: 'attach', sessionId: 'sid-asked' }, 1, null, Date.now() - 10 * 60000);
      tick(5 * 60000 - 1000); R.asked1 = v3._attachHold?.note?.textContent;
      tick(2000); R.asked2 = v3._attachHold?.note?.textContent;
      v3._clearAttachHold();
      // (a3) r4875: a hub that keeps ACKNOWLEDGING (it re-acks every 10 s while it works) — the ask began 15 minutes ago, the ladder
      // waited on its acks: the bar says it is STILL WORKING, never the Reload words; when its acks stop, «waiting», and the Reload
      // words 15 minutes after the last one (RED in the follow-6 form: the Reload words at the hold's start)
      const v4 = stubs(mkView(), 'sid-working');
      v4._lastAttachAckAt = Date.now();
      v4._holdAttach({ type: 'attach', sessionId: 'sid-working' }, 1, null, Date.now() - 15 * 60000);
      R.w0 = v4._attachHold?.note?.textContent;
      for (let k = 0; k < 60; k++) { tick(10000); v4._lastAttachAckAt = Date.now(); v4._attachHoldWords?.(); }   // ten more minutes of acks
      R.w1 = v4._attachHold?.note?.textContent;
      tick(31000); R.w2 = v4._attachHold?.note?.textContent;   // its acks stopped 31 s ago
      tick(15 * 60000 - 32000); R.w3 = v4._attachHold?.note?.textContent;   // 1 s before 15 minutes after the last ack
      tick(2000); R.w4 = v4._attachHold?.note?.textContent;
      v4._clearAttachHold();
      // (a4) an acknowledgement from BEFORE the hold's ask is an earlier attach's (the window's last answered one, seconds before the
      // drop): no sign of life for this hold — «waiting», and the Reload words 15 minutes after the ask (its own heavy read at
      // f9f5f9687 found ③'s words pushed past the bound by such an ack; RED in that form: «still working» at the hold)
      const v5 = stubs(mkView(), 'sid-old-ack');
      v5._lastAttachAckAt = Date.now() - 5000;
      v5._holdAttach({ type: 'attach', sessionId: 'sid-old-ack' }, 1, null, Date.now() - 2000);
      R.o0 = v5._attachHold?.note?.textContent;
      tick(15 * 60000 - 3000); R.o1 = v5._attachHold?.note?.textContent;   // 1 s before 15 minutes after the ask
      tick(2000); R.o2 = v5._attachHold?.note?.textContent;
      v5._clearAttachHold();
      // (a5) THE SHORT CLOCK (the chrome suite's ③, its own heavy read at 28800d6f7): the long bound's timer fires at 1/100 while the
      // wall clock runs real — its firing is the fact (no acknowledgement came since it was armed), never re-read against the clock
      // (RED in that form: a re-check found 15 minutes not passed and re-armed for ever)
      clock.short = true;
      const v6 = stubs(mkView(), 'sid-short');
      v6._holdAttach({ type: 'attach', sessionId: 'sid-short' }, 1, null, Date.now() - 1500);
      tick(9500); R.s1 = v6._attachHold?.note?.textContent;
      v6._lastAttachAckAt = Date.now(); v6._attachHoldWords?.(); R.s2 = v6._attachHold?.note?.textContent;   // an acknowledgement after the Reload words: alive again
      v6._clearAttachHold(); clock.short = false;
      const handlers = [], sent = [], deferred = [];
      const fws = { send(m) { sent.push(m); }, onGlobal(h) { handlers.push(h); }, offGlobal(h) { const i = handlers.indexOf(h); if (i >= 0) handlers.splice(i, 1); } };
      const q = createReconnectQueue({ setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: (h) => clearTimeout(h), defer: (fn) => deferred.push(fn), rankOf: () => [0, 0], random: () => 0, now: () => Date.now() });
      const w = stubs(mkView(), 'sid-land', { ws: fws, app: { _reconnectQueue: q } });
      w._holdAttach({ type: 'attach', sessionId: 'sid-land' }, 0, null);   // held: an earlier cycle's ladder ended
      w._reconnectAttach(); while (deferred.length) deferred.shift()();
      tick(4000);   // its slot (1500 ms, no jitter) fires: a REAL new cycle
      const frame = sent.find((m) => m.type === 'attach' && m.sessionId === 'sid-land');
      R.inFlightSent = q.inFlight; R.handlersSent = handlers.length;
      for (const h of [...handlers]) { try { h({ type: 'attached', sessionId: 'sid-land', attachId: frame && frame.attachId, normEpoch: 'e1' }); } catch { } }
      R.inFlightLanded = q.inFlight; R.heldAfter = !!w._attachHold; R.frame = !!frame;
      const w2 = stubs(mkView(), 'sid-other', { ws: fws, app: { _reconnectQueue: q } });
      R.n0 = handlers.length;
      w2._reattach(true);
      R.n1 = handlers.length;
      w2._lastAttachedAt = Date.now() + 1;   // another road's answer landed first (the permanent handler stamped it)
      tick(20001);   // the cycle's first check
      R.n2 = handlers.length;
      // (d) a view HELD by a real cycle (never answered), its reconnect retry gone out (counted), then CLOSED
      const holdThenDispose = (CV) => {
        clock.timers.length = 0;   // a clean clock: only this view's timers from here
        const hs = [], out = [], deferredD = [];
        const fwsD = { send(m) { out.push(m); }, onGlobal(h) { hs.push(h); }, offGlobal(h) { const i = hs.indexOf(h); if (i >= 0) hs.splice(i, 1); } };
        const qD = createReconnectQueue({ setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: (h) => clearTimeout(h), defer: (fn) => deferredD.push(fn), rankOf: () => [0, 0], random: () => 0, now: () => Date.now() });
        const v = stubs(mkView(), 'sid-close', { ws: fwsD, app: { _reconnectQueue: qD }, _settingsListeners: [], _clearPendingSteers() { }, _stopCollabTick() { } });
        Object.setPrototypeOf(v, CV.prototype);
        v._reattach(true);
        tick(20000 + 5 * 25000 + 1);   // its ladder ends un-acked: the HOLD (the handler it owns, its 15-minute timer)
        const H = v._attachHold, held = !!H;
        v._reconnectAttach(); while (deferredD.length) deferredD.shift()();
        tick(4000);   // the reconnect pass's slot fires: a new cycle, counted in flight
        const before = { handlers: hs.length, inFlight: qD.inFlight, sent: out.length };
        try { CV.prototype.dispose.call(v); } catch { }   // the person closes the window (the fake lacks DOM teardown bits past the hold's clear)
        const atClose = { handlers: hs.length, has: qD.has(v), inFlight: qD.inFlight, hold: v._attachHold ?? null, holdTimerLive: !!(H && H.timer && H.timer.live) };
        const sent0 = out.length;
        tick(20 * 60000);   // twenty minutes on
        return { held, before, atClose, after: { handlers: hs.length, sent: out.length - sent0, liveTimers: clock.timers.filter((h) => h.live).length } };
      };
      R.d = holdThenDispose(ChatView);
      if (CVx) R.dx = holdThenDispose(CVx);
    } catch (e) { R.threw = String((e && e.stack) || e).slice(0, 400); } finally { globalThis.setTimeout = real.st; globalThis.clearTimeout = real.ct; Date.now = real.now; if (real.doc === undefined) delete globalThis.document; else globalThis.document = real.doc; }
    ok(`B-a26e (r4708): the 15-minute words run from the hold's START — a new cycle 10 minutes in does not restart them (at 15 minutes: «${R.at15}»)`, /^Still attaching — waiting for the hub to answer/.test(R.first || '') && /has not answered for 15 minutes/.test(R.at15 || ''), R);
    ok('B-a26e: a NEW hold after the last one ended says the first words again', /^Still attaching — waiting for the hub to answer/.test(R.again || ''), R.again);
    ok(`B-a26e (r4708): a held retry counts as in flight until ITS OWN answer lands through the real cycle handler (${R.inFlightSent} → ${R.inFlightLanded}); the hold ends`, R.frame === true && R.inFlightSent === 1 && R.handlersSent === 1 && R.inFlightLanded === 0 && R.heldAfter === false, R);
    ok(`B-a26e (r4708): a cycle whose view another road attached unhooks its handler at its check (${R.n1} → ${R.n2})`, R.n0 === 0 && R.n1 === 1 && R.n2 === 0, R);
    ok(`B-a26e (r4875): while the hub keeps ACKNOWLEDGING the bar says it is still working (at the hold «${R.w0}», ten minutes of acks on «${R.w1}»); its acks stopped: «waiting» (${R.w2 === undefined ? '?' : 'after 31 s'}), the Reload words 15 minutes after the last ack and not before`, /^Still attaching — the hub is still working/.test(R.w0 || '') && /^Still attaching — the hub is still working/.test(R.w1 || '') && /^Still attaching — waiting for the hub to answer/.test(R.w2 || '') && /^Still attaching — waiting for the hub to answer/.test(R.w3 || '') && /has not answered for 15 minutes/.test(R.w4 || ''), { w0: R.w0, w1: R.w1, w2: R.w2, w3: R.w3, w4: R.w4 });
    ok(`B-a26e (its own heavy read at 28800d6f7): under a short clock the long bound's timer is the fact — the Reload words when it fires (${R.s1 && R.s1.slice(0, 48)}…), «still working» again at a later acknowledgement`, /has not answered for 15 minutes/.test(R.s1 || '') && /^Still attaching — the hub is still working/.test(R.s2 || ''), { s1: R.s1, s2: R.s2 });
    ok(`B-a26e: an acknowledgement from BEFORE the hold's ask (an earlier, answered attach) is no sign of life for it — «waiting» at the hold (${R.o0 && R.o0.slice(0, 40)}…), the Reload words 15 minutes after the ask and not before`, /^Still attaching — waiting for the hub to answer/.test(R.o0 || '') && /^Still attaching — waiting for the hub to answer/.test(R.o1 || '') && /has not answered for 15 minutes/.test(R.o2 || ''), { o0: R.o0, o1: R.o1, o2: R.o2 });
    ok('B-a26e (r4857): the 15-minute words run from the ASK that began the hold (asked 10 minutes before: Reload 5 minutes on, not 15)', /^Still attaching — waiting for the hub to answer/.test(R.asked1 || '') && /has not answered for 15 minutes/.test(R.asked2 || ''), { asked1: R.asked1, asked2: R.asked2 });
    const dOk = (d) => !!d && d.held === true && d.before.handlers === 2 && d.before.inFlight === 1 && d.atClose.handlers === 0 && d.atClose.has === false && d.atClose.inFlight === 0 && d.atClose.hold === null && d.atClose.holdTimerLive === false && d.after.handlers === 0 && d.after.sent === 0 && d.after.liveTimers === 0;   // r4875's round: and no live timer of the closed view at all
    ok(`B-a26e (r4857, THE MUST): THE HOLD NEVER OUTLIVES ITS WINDOW — a view held by a real cycle, its retry counted (${R.d?.before?.handlers} handlers, ${R.d?.before?.inFlight} in flight), closed: at once no handler on the link (${R.d?.atClose?.handlers}), no slot or count, no hold, no live 15-minute timer; nothing sent in the twenty minutes after`, dOk(R.d), R.d || R.threw);
    ok(`B-a26e RED CONTROL (r4857): the tip's dispose with its hold-clear line cut leaves the hold behind (${R.dx?.atClose?.handlers} handler(s), hold ${R.dx?.atClose?.hold ? 'up' : 'gone'}, its timer ${R.dx?.atClose?.holdTimerLive ? 'live' : 'cleared'}, ${R.dx?.atClose?.inFlight} counted) — the leg can go red`, mutantErr === null && !!R.dx && R.dx.held === true && !dOk(R.dx) && R.dx.atClose.handlers === 1 && R.dx.atClose.hold !== null && R.dx.atClose.holdTimerLive === true, mutantErr || R.dx);
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
  ok('the ChatView state handler re-attaches through _reconnectAttach (not a bare _reattach(true))', /this\._connNotice\.up\(\);\s*\n\s*this\._reconnectAttach\(\);/.test(cv));
  ok('B-a26e (r4875): an acknowledgement of the live attach while held decides the bar\'s words again at once', /this\._lastAttachAckAt = Date\.now\(\); if \(this\._attachHold\) this\._attachHoldWords\(\); \}/.test(cv));
  ok('the queued view is decided by the DERIVED flag (_suspended), never a fourth flag', /if \(q && this\._suspended && !this\._readOnly && !this\._disposed\) \{/.test(cv));
  ok('B-a26e (r4686): a HELD window\'s retry is enqueued in its reconnect\'s pass (never a slot of its own)', /if \(q && this\._attachHold && !this\._readOnly && !this\._disposed\) \{\n[^\n]*setDisconnected\(true, 'attaching'\);[^\n]*\n\s*q\.enqueue\(this\);\n\s*return;/.test(cv));
  ok('_applySuspend(false) takes a queued view and attaches it now', /if \(!on && this\.app\?\._reconnectQueue\?\.take\(this\)\) this\._runQueuedReattach\('unhide'\);/.test(cv));
  ok('dispose cancels the view\'s slot', /this\.app\?\._reconnectQueue\?\.cancel\(this\)/.test(cv));
  ok('the App owns ONE queue, ranked by _reconnectRank, its held retries capped by the page\'s attaches in flight too (r4686: the socket\'s own count), reset on every drop', /this\._reconnectQueue = createReconnectQueue\(\{ rankOf: \(view\) => this\._reconnectRank\(view\), pageInFlight: \(\) => this\.ws\?\.attachesInFlight\?\.\(\) \?\? 0 \}\);/.test(app) && /if \(!connected\) \{ this\._reconnectQueue\.reset\(\); return; \}/.test(app));
  ok('the queue asks the PURE verdict (reconnectSlot), never re-spells the delays', /import \{ reconnectSlot \} from '\.\/view-visibility\.js';/.test(rq) && !/1500|250\b|6000/.test(rq.replace(/^\/\/.*$/gm, '')));
  ok('the terminal re-attach loop is untouched (still sends attach at once for TerminalSession)', /if \(session instanceof TerminalSession && session\.sessionId\) \{\s*\n\s*this\.ws\.send\(\{ type: 'attach', sessionId: session\.sessionId \}\);/.test(app));
  ok('the ladder still stamps reattachAt at the SEND inside _reattach (queue time is never server silence)', /const attachFrame = \{ type: 'attach', sessionId: this\.sessionId, attachId \};[\s\S]{0,1800}this\.ws\.send\(attachFrame\);[\s\S]{0,1600}const reattachAt = Date\.now\(\);/.test(cv)); // (perf D: the frame may carry sinceSeq — built once, sent once: r4686, the ladder no longer re-sends it)
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
