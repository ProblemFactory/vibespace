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
// One derivation, three reasons, so every hider and the desktop one compose:
// the view stays suspended while ANY reason holds and resumes (settle window +
// pinned re-tail) only when the LAST one clears. The window manager computes
// the inputs from the DOM classes it owns; this module only names the rule.
'use strict';

const HIDE_REASONS = Object.freeze(['mobile', 'tab', 'minimized']);

/** @returns {{mobile:boolean, tab:boolean, minimized:boolean}} reason → holding? */
function hiddenReasons({ mobile = false, active = true, tabHidden = false, minimized = false } = {}) {
  return {
    mobile: !!mobile && !active,   // narrow layout: only the active window is displayed
    tab: !!tabHidden,              // a grouped guest whose tab is not the current one
    minimized: !!minimized,        // the window (or its chain host) is minimized
  };
}

/** Is the content displayed at all, given every reason? */
function isDisplayed(reasons) {
  return !HIDE_REASONS.some((r) => !!reasons?.[r]);
}

module.exports = { HIDE_REASONS, hiddenReasons, isDisplayed };
