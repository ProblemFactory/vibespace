// A VIEWPORT CLASS SWITCH AT RUNTIME (lane duo-build-1, 2026-10-25 — the iPhone Duo on the owner's simulator: folded from
// the 951 px inner display to the 382 px cover or the 669 px inner portrait, the page kept the desktop's chat-window
// geometry (the transcript ran off the left edge, B-1d40) and the desktop rail stayed drawn over the phone layout
// (B-f5ec) — app.isMobile was read ONCE at boot while the stylesheets followed the 768 px line live).
// The class is PURE src/viewport-class.js; this module watches it and, when a crossing settles, makes the page what a
// FRESH LOAD at the new size builds:
//   · the phone: the sidebar is the closed overlay with its two-level list and three tabs (the rail removed), the nav
//     bar wired (MobileNav, the back gesture — built on the first crossing if the boot was a desktop), one window on
//     show (the active one, else the most recently used) filling the workspace, the attention page only where the
//     boot would open it (never over a window the person was looking at — the fold carries what was on show);
//   · the desktop: the rail per sidebar.activityRail over a closed sidebar, the attention page put away, every window
//     back on its gridBounds (a phone-born window: the default placement) inside this workspace, the chrome
//     arrangement re-applied, the session palette installed.
// Then every window's view re-measures. Nothing here writes the layout record or sessionStorage (SPEC-v3 §7: a fold's
// transitional sizes persist nothing); the next class's own writers take over from there.
import { viewportClassOf, isPhoneClass, switchVerdict, VC_WATCH_QUERIES, VC_SETTLE_MS } from '../viewport-class.js';
import { MobileNav } from './mobile-nav.js';
import { installMobileBack } from './mobile-back.js';
import { installSessionPalette } from './session-palette.js';

/** The class of this viewport now (a hidden page measures 0 — the last class holds). */
export function readViewportClass(prev = null) {
  let coarse = false;
  try { coarse = window.matchMedia('(pointer: coarse)').matches; } catch { }
  return viewportClassOf({ width: window.innerWidth, coarse, prev });
}

/** Every float anchored to the old chrome closes (its anchor moves or disappears with the switch) — Esc's own rule. */
function closeFloats() {
  document.querySelectorAll('[data-popover], .context-menu, .mobile-win-switcher').forEach((el) => el.remove());
}

/** No chrome container is left scrolled sideways. The page's frame (html, body, the wrapper, the workspace, each window)
 *  never scrolls on its own — `overflow: hidden` — but a focused composer can scroll one programmatically while the
 *  viewport changes under it (WebKit keeps the caret in view), and the frame then shows its content cut at the left edge
 *  (B-1d40 on the Duo's 669 px inner portrait). A switch puts every such offset back to 0. */
function unscrollFrame() {
  if (window.scrollX) window.scrollTo(0, window.scrollY);
  const els = [document.scrollingElement, document.body, document.getElementById('main-wrapper'), document.getElementById('workspace'),
    ...document.querySelectorAll('.window, .window-content')];
  let n = 0;
  for (const el of els) {
    if (!el || !el.scrollLeft) continue;
    const ox = getComputedStyle(el).overflowX;
    if (ox === 'hidden' || ox === 'clip' || el === document.scrollingElement || el === document.body) { el.scrollLeft = 0; n++; }
  }
  return n;
}

function enterPhone(app) {
  app.formsToSheets?.(); // lane dialog-yield: FIRST — an open form window becomes its sheet before any phone rule sees a window (a focused one would fold the sidebar for good)
  if (app._customize?.active) { try { app._customize.exit(); } catch { } }
  app.sidebar?.setPhoneMode?.(true);
  if (!app._mobileNav) {
    app._mobileNav = new MobileNav(app);
    app._mobileNav._shownBooted = true; // the boot's restore is long over: the window on show is noted from here on
  }
  if (!app._mobileBack) app._mobileBack = installMobileBack(app);
  app.wm?.refitForViewport?.(true);
  app._updateMobileNavTitle?.();
}

function enterDesktop(app) {
  app.phoneHome?.hide?.();
  app.sidebar?.setPhoneMode?.(false);
  if (!app._paletteInstalled) { installSessionPalette(app); app._paletteInstalled = true; }
  app._applyChromeArrangement?.();
  app.wm?.refitForViewport?.(false);
  app.updateTaskbar?.();
}

/** Switch the page to `next` now (the watcher's settled crossing; a suite may call it). */
export function applyViewportClass(app, next) {
  const prev = app._vc;
  const v = switchVerdict(prev, next);
  if (v.act === 'none') return v;
  app._vc = next;
  document.documentElement.dataset.vc = next;
  app.isMobile = isPhoneClass(next);
  if (v.act === 'tier') {
    closeFloats();
    try { (v.phone ? enterPhone : enterDesktop)(app); } catch (e) { console.warn('[viewport] switch to', next, 'failed:', e); }
  }
  unscrollFrame();
  requestAnimationFrame(() => unscrollFrame()); // …and once more after the views re-measured
  try { app.sidebar?.setRegularMode?.(next === 'regular'); } catch (e) { console.warn('[viewport] the list column:', e); }
  if (next === 'regular') app.phoneHome?.hide?.();
  app._updateMobileNavTitle?.();
  try { window.__vsOp?.('viewport-class', { from: prev, to: next }); } catch { }
  window.dispatchEvent(new CustomEvent('vs-viewport-class', { detail: { from: prev, to: next } }));
  return v;
}

/** Watch the class: every media query that may move it, and resize (a crossing settles VC_SETTLE_MS before it acts). */
export function installViewportSwitch(app) {
  let timer = null;
  let portrait = null;
  const settle = () => {
    timer = null;
    applyViewportClass(app, readViewportClass(app._vc));
    // a rotation starts the list as that orientation does: portrait shows it (a hidden list there is a view of one
    // orientation, SPEC-v3 §4 / §7), landscape takes this tab's own choice back (lane desktop-switch-phone)
    let p = null; try { p = window.matchMedia('(orientation: portrait)').matches; } catch { }
    if (portrait !== null && p !== portrait) app.sidebar?.restoreListHidden?.();
    portrait = p;
  };
  const kick = () => { clearTimeout(timer); timer = setTimeout(settle, VC_SETTLE_MS); };
  for (const q of VC_WATCH_QUERIES) { try { window.matchMedia(q).addEventListener('change', kick); } catch { } }
  window.addEventListener('resize', kick);
  // a page BORN in the regular class: its list column's head now (the switch below only acts on a crossing)
  if (app._vc === 'regular') { try { app.sidebar?.setRegularMode?.(true); } catch (e) { console.warn('[viewport] the list column:', e); } }
  return { settleNow: () => { clearTimeout(timer); settle(); } };
}
