// THE VIEWPORT CLASS (lane duo-build-1, 2026-10-25 — the iPhone Duo on the owner's simulator: a fold from the 951 px
// inner display to the 382 px cover or the 669 px inner portrait left the desktop's window geometry and its rail on the
// phone layout, «这显然不太可用»). ONE function answers which class of page this viewport is; the page asks it at boot AND
// again whenever the viewport crosses a line (a fold, an unfold, a rotation, a window resize) — a class is never frozen
// at boot (app.isMobile was, until this lane: the CSS followed the 768 px line and the JS did not).
//   · viewportClassOf({ width, coarse }) — 'compact' (the phone page) | 'regular' (SPEC-v3 §1.2, lane duo-build-1 slice 2:
//     a COARSE pointer 640–1023 px — the Duo's inner display 669 / 951, an iPad mini portrait 744, a large phone in
//     landscape 932: the phone's list and conversation side by side + the trailing bar) | 'desktop' (the window manager:
//     a fine pointer ≥ 769 px, a coarse one ≥ 1024 px).
//   · isPhoneClass(vc) — the classes whose JS paths are the phone's (one window on show, no rail / toolbar / taskbar):
//     compact AND regular; listIsColumn(vc) — regular only (the list is a static column, never an overlay).
//   · VC_PHONE_MEDIA — the SAME rule as one media-query list: every phone block of the stylesheets and every
//     matchMedia of the bundle use exactly this text (test-viewport-class counts them), so CSS and JS never disagree.
//   · VC_WATCH_QUERIES — the media queries whose `change` may move the class (the page re-reads on each).
//   · VC_SETTLE_MS — a crossing settles this long before the switch (a fold passes through transitional sizes).
// PURE: imports nothing.

/** A coarse pointer this wide or wider is the regular class (SPEC-v3 §1.2: 640 sits ≈ 46 / 29 px from the cover's 594 and
 *  the inner portrait's 669 — no UI scale, scrollbar or Safari bar can cross it). */
const VC_COARSE_REGULAR_MIN = 640;
/** A fine pointer this wide or wider is the desktop window manager — the stylesheets' `(max-width: 768px)` line. */
const VC_FINE_DESKTOP_MIN = 769;
/** A coarse pointer this wide or wider is the desktop window manager (SPEC-v3 §1.2: an iPad in landscape stays today's). */
const VC_COARSE_DESKTOP_MIN = 1024;
/** The settle time of a crossing (SPEC-v3 §1.2 / §7: the transitional sizes of a fold never switch anything). */
const VC_SETTLE_MS = 120;
/** THE PHONE PATHS as one media-query list (compact ∪ regular) — the stylesheets' phone blocks and the bundle's matchMedia. */
const VC_PHONE_MEDIA = `(max-width: ${VC_FINE_DESKTOP_MIN - 1}px), (pointer: coarse) and (max-width: ${VC_COARSE_DESKTOP_MIN - 1}px)`;
/** The queries whose change may move the class: each line and the pointer (+ the orientation: the regular class's two
 *  arrangements — the trailing bar in landscape, the bar over the conversation in portrait). */
const VC_WATCH_QUERIES = Object.freeze([`(max-width: ${VC_FINE_DESKTOP_MIN - 1}px)`, `(min-width: ${VC_COARSE_REGULAR_MIN}px)`, `(max-width: ${VC_COARSE_DESKTOP_MIN - 1}px)`, '(pointer: coarse)', '(orientation: portrait)']);

const VIEWPORT_CLASSES = Object.freeze(['compact', 'regular', 'desktop']);

/** The class of a viewport `width` CSS px wide; `coarse` = the primary pointer is a finger. A width of 0 (a hidden page
 *  measures nothing) keeps `prev` — never a switch on a measurement that is not one. */
function viewportClassOf({ width, coarse = false, prev = null } = {}) {
  const w = Number(width);
  if (!Number.isFinite(w) || w <= 0) return prev || 'desktop';
  if (coarse) return w < VC_COARSE_REGULAR_MIN ? 'compact' : w < VC_COARSE_DESKTOP_MIN ? 'regular' : 'desktop';
  return w < VC_FINE_DESKTOP_MIN ? 'compact' : 'desktop';
}

/** The classes whose JS paths are the phone's: one window on show, the nav bar, no rail / toolbar / taskbar. */
function isPhoneClass(vc) { return vc === 'compact' || vc === 'regular'; }
/** The class whose list is a static COLUMN beside the conversation (never an overlay a window's focus closes). */
function listIsColumn(vc) { return vc === 'regular'; }

/** What a switch from `prev` to `next` does: nothing when the class holds; `tier` when the phone ⇄ desktop paths change;
 *  `restyle` between the two phone classes (compact ⇄ regular: the same pieces, another arrangement). */
function switchVerdict(prev, next) {
  if (!next || prev === next) return { act: 'none' };
  return { act: isPhoneClass(prev) === isPhoneClass(next) ? 'restyle' : 'tier', phone: isPhoneClass(next) };
}

module.exports = { VC_COARSE_REGULAR_MIN, VC_FINE_DESKTOP_MIN, VC_COARSE_DESKTOP_MIN, VC_SETTLE_MS, VC_PHONE_MEDIA, VC_WATCH_QUERIES, VIEWPORT_CLASSES, viewportClassOf, isPhoneClass, listIsColumn, switchVerdict };
