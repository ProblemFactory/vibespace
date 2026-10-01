// PURE (imports nothing, DOM-free): WHICH HIDERS ARE HOLDING A WINDOW'S CONTENT
// OFF-SCREEN RIGHT NOW (inc-mu6bfv1t-4drq, 2026-09-18, owner: "每次手机上切对话
// 都会滚到对话历史里而不是最新位置").
//
// A ChatView must not decide anything off the geometry of a window that is not
// displayed — that law was made physical for desktop-hidden windows in 2.369.1
// (`setSuspended`, visibility:hidden model) and the resume machinery that
// re-tails a pinned view lives there. But THREE MORE hiders use display:none,
// which additionally ZEROES the scroller's scrollTop (visibility:hidden keeps
// it), and none of them suspended the view:
//   · mobile   — `.window { display:none !important }` for every window but the
//                `.window-active` one (style.css ≤768px)
//   · tab      — a grouped guest's `.content.tab-hidden`
//   · minimized— `element.style.display = 'none'`
// The capture: at page load every hidden window ran the attach short-view
// rescue against sh=0/ch=0 (`autoFill rendered:50 sh:0 ch:0` → extendTop n:50),
// and every switch showed scrollTop jumping to 0 with no touch input, the pin
// machine unpinning, the top sentinel paging 50 older messages in and
// trimBottom removing the newest 50 — the reader landed in history and tapped
// jump-to-bottom each time (3/3 windows, both reports).
//
// One derivation, every reason, so every hider composes: the view stays
// suspended while ANY reason holds and resumes (settle window + pinned
// re-tail) only when the LAST one clears. The window manager computes the
// inputs from the flags and DOM classes it owns; this module only names the rule.
//
// ── THE MARKS ARE DERIVED TOO (inc-munl8jkl-gaih + inc-munbksgs-k3yz, 2026-09-30,
// userW: a conversation brought onto the Stage from another desktop came up as
// an EMPTY BOX that ignored every click; "卡死") ──
// The two VISIBILITY hiders — a desktop that is not on screen, the Stage while
// it is not on screen — keep the window's box in the layout (visibility:hidden:
// scroll positions and the cached rendering survive a switch), so the box has
// to be marked with what display:none would have given for free: no pointer,
// no accessibility node (2.369.144, the Windows freeze was Chrome's AX tree),
// and for a chat window no rendering at all — content-visibility:hidden skips
// the subtree AND preserves its cached rendering state (its spec'd difference
// from 'auto'), so a switch repaints from cache instead of re-measuring
// 600-message windows (inc-mtd54h45 "切换桌面还是会卡顿"; chat windows only —
// terminals carry WebGL canvases). Those marks were WRITTEN by each hider: the
// desktop's _hideWin wrote all four, the desktop's _showWin removed them — and
// the Stage's own show (`_showWin`, the hero's borrow) removed only visibility
// and pointer-events. A window the desktop had hidden and the Stage then
// borrowed kept content-visibility:hidden: the renderer skipped the WHOLE
// window, title bar included — a blank rectangle whose clicks landed on the
// bare div.window (reproduced on 2.369.196 and .198: 0 of 9 in-view cards
// drawn, no long task, no stall). A state written by two owners is the bug
// (the .197 lesson), so the marks are no longer written by anyone: they are a
// PURE function of the reason set (`windowMarks`), applied by ONE derivation
// (WindowManager._deriveHiders), and a hider only adds or removes its reason
// through ONE door (WindowManager.setWindowHidden). The Stage's hero has no
// reason at all ⇒ nothing is marked ⇒ it is drawn, by definition.
'use strict';

const HIDE_REASONS = Object.freeze(['desktop', 'stage', 'mobile', 'tab', 'minimized']);
// the hiders that keep the BOX (visibility:hidden) — the derivation marks it; the other three are display:none, written
// by their owners (the ≤768px CSS, `.tab-hidden`, minimize's inline display), which drops rendering + the AX node for free
const BOX_HIDERS = Object.freeze(['desktop', 'stage']);

/** @returns {{desktop:boolean, stage:boolean, mobile:boolean, tab:boolean, minimized:boolean}} reason → holding? */
function hiddenReasons({ desktop = false, stage = false, mobile = false, active = true, tabHidden = false, minimized = false } = {}) {
  return {
    desktop: !!desktop,            // its frame lives on a desktop that is not on screen
    stage: !!stage,                // its frame is parked by the Stage (the Stage off screen, or not this hero's workspace)
    mobile: !!mobile && !active,   // narrow layout: only the active window is displayed
    tab: !!tabHidden,              // a grouped guest whose tab is not the current one
    minimized: !!minimized,        // the window (or its chain host) is minimized
  };
}

/** Is the content displayed at all, given every reason? */
function isDisplayed(reasons) {
  return !HIDE_REASONS.some((r) => !!reasons?.[r]);
}

/** THE MARKS a window's element carries for a reason set — the only answer; nobody writes them by hand.
 *  `type` = the element's own window type (content-visibility is a chat window's only). Never marks the element for a
 *  display:none reason: a HOST whose tab shows a guest has the `tab` reason on its own content while its element draws
 *  the guest — content-visibility / aria-hidden there would blank the tab on show.
 *  @returns {{visibility:''|'hidden', pointerEvents:''|'none', ariaHidden:boolean, contentVisibility:''|'hidden', suspended:boolean}} */
function windowMarks(reasons, { type = null } = {}) {
  const box = BOX_HIDERS.some((r) => !!reasons?.[r]);
  return {
    visibility: box ? 'hidden' : '',
    pointerEvents: box ? 'none' : '',
    ariaHidden: box,
    contentVisibility: box && type === 'chat' ? 'hidden' : '',
    suspended: !isDisplayed(reasons), // the ChatView's derived flag (setHidden per reason) — every hider suspends
  };
}

// ── RECONNECT SLOTS (perf lane ⑤b, inc-mtndq0vb's third layer) ──
// After a socket drop EVERY ChatView re-attached in the same tick — 19 windows
// in one second in the incident, most of them on hidden desktops / tab guests /
// minimized, nobody looking at them — and each attach costs the server a
// history slab (and, after a restart, a rebuild) while the windows the user IS
// looking at wait in the same FIFO. A SUSPENDED view (any hider in the reason
// set above — never a fourth flag) waits for its slot; a displayed one attaches
// at once. Slot k of the hidden ones fires at base + k·step, capped, so the
// server sees ≤ 1000/step hidden attaches per second after the visible burst.
const RECONNECT_BASE_MS = 1500;
const RECONNECT_STEP_MS = 250;
const RECONNECT_CAP_MS = 6000;

/** How long a view waits after a reconnect before it re-attaches.
 *  visible ⇒ 0; hidden slot k ⇒ min(base + k·step, cap); a negative / NaN /
 *  non-integer index is treated as slot 0 (⇒ base), never as "at once". */
function reconnectSlot({ suspended = false, index = 0, baseMs = RECONNECT_BASE_MS, stepMs = RECONNECT_STEP_MS, capMs = RECONNECT_CAP_MS } = {}) {
  if (!suspended) return 0;
  const k = Number.isFinite(index) && index > 0 ? Math.floor(index) : 0;
  return Math.min(baseMs + k * stepMs, Math.max(baseMs, capMs));
}

// ── THE SLAB AN ATTACH ASKS FOR (perf r1 — the verifier's 19-window probe) ──
// The text window (src/text-window.js) is worth its bytes only to a view that
// will PAINT it where somebody reads: shipped to every window it cost ×2.4 the
// bytes and ×2.7 the first paint of a 19-window open, and after a server
// restart the 14 hidden windows paid for it too (their render ran on the main
// thread while nobody looked). So an attach says which slab it wants:
//   · a SUSPENDED view (any hider of the reason set — the same derived flag,
//     never a fourth one) ⇒ 'floor' = tail(50), exactly the pre-lane slab;
//   · a displayed view while `burst` (1) or more OTHER attaches are already in
//     flight on this socket ⇒ 'floor' too — a burst (a cold open of N windows,
//     a page reload, the displayed windows of a reconnect) gives the text
//     window to its FIRST attach only (the reader looks at one window at a
//     time; measured: 4 per burst still cost the 19-window cold open +20 %
//     first paint, 1 costs nothing measurable);
//   · otherwise ⇒ 'text' — the common case, one window opened, gets it.
// A floor view that turns out short for its viewport takes the short-view
// rescue's one page (chat-view `_shortViewNeedsFill`) — the pre-lane path.
const ATTACH_TEXT_BURST = 1;

/** 'floor' | 'text' — see above. `inFlight` = attaches this socket sent that
 *  have not been answered yet (WsManager.attachesInFlight), NaN/negative ⇒ 0. */
function attachSlab({ suspended = false, inFlight = 0, burst = ATTACH_TEXT_BURST } = {}) {
  if (suspended) return 'floor';
  const k = Number.isFinite(inFlight) && inFlight > 0 ? Math.floor(inFlight) : 0;
  const b = Number.isFinite(burst) && burst >= 0 ? Math.floor(burst) : ATTACH_TEXT_BURST;
  return k >= b ? 'floor' : 'text';
}

module.exports = { HIDE_REASONS, BOX_HIDERS, hiddenReasons, isDisplayed, windowMarks, reconnectSlot, RECONNECT_BASE_MS, RECONNECT_STEP_MS, RECONNECT_CAP_MS, attachSlab, ATTACH_TEXT_BURST };
