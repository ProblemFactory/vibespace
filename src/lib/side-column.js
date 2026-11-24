// THE SYSTEM's SIDE COLUMN (B-78db, 主开发 r3933 — the owner's word «做吧»: the iPhone Duo's own side region in the HOME-SCREEN copy).
// The simulator's reading (int359/duo-probe/RESULT.md, Xcode 27.1): a home-screen web app with viewport-fit=cover draws under the
// system's column, which it reports as env(safe-area-inset-right) = 84 on BOTH displays (bottom 34, the home indicator); without
// cover (the product before) the page stood beside an empty 84 px column; a Safari tab reports nothing either way (Safari's own
// controls own that column). So:
//   - coverIfStandalone: viewport-fit=cover for the HOME-SCREEN copy only (navigator.standalone / display-mode standalone) — a
//     Safari tab keeps «contain», every inset 0, nothing in a tab changes. Set from the bundle: the page's policy allows no
//     inline script, and WebKit re-reads the viewport meta when its content changes.
//   - sideColumnOf (PURE): the Duo's column by its insets — a trailing inset of 80 or more with a leading inset of 0. A HEURISTIC,
//     named as one: CSS has four edge numbers and no «bar column» kind (no web form of UIView.LayoutRegion / verticalBarEdge),
//     and a notched iPhone held landscape reports the same inset on BOTH sides, so that shape gets the safe default.
//   - readSideColumn: the four insets read through a hidden probe (fold-ladder.js's pattern), html[data-sidecol] written; the
//     stylesheet then moves the regular class's trailing bar INTO the column (public/style.css, «THE SYSTEM's EDGES»).
export const SIDE_COLUMN_MIN = 80;

function standalone(win) {
  try { return win.navigator?.standalone === true || !!(win.matchMedia && win.matchMedia('(display-mode: standalone)').matches); } catch { return false; }
}

/** viewport-fit=cover for the home-screen copy only → true when it set (or found) it */
export function coverIfStandalone(doc = document, win = window) {
  if (!standalone(win)) return false;
  const m = doc.querySelector('meta[name="viewport"]');
  if (!m) return false;
  const c = m.getAttribute('content') || '';
  if (!/viewport-fit\s*=/.test(c)) m.setAttribute('content', `${c}, viewport-fit=cover`);
  doc.documentElement.dataset.standalone = '1';
  return true;
}

/** PURE: 'right' for the Duo's side column (a trailing inset ≥ 80 with no leading one), else null (the safe default) */
export function sideColumnOf({ left = 0, right = 0 } = {}) {
  return Number(right) >= SIDE_COLUMN_MIN && Number(left) === 0 ? 'right' : null;
}

/** the four safe-area insets through a hidden probe → { top, right, bottom, left, col }; html[data-sidecol] follows */
export function readSideColumn(doc = document, win = window) {
  const p = doc.createElement('div');
  p.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;left:0;top:0;width:0;height:0;'
    + 'padding:env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px)';
  doc.documentElement.appendChild(p);
  const cs = win.getComputedStyle(p), px = (v) => parseFloat(v) || 0;
  const insets = { top: px(cs.paddingTop), right: px(cs.paddingRight), bottom: px(cs.paddingBottom), left: px(cs.paddingLeft) };
  p.remove();
  const col = sideColumnOf(insets);
  if (col) doc.documentElement.dataset.sidecol = col; else delete doc.documentElement.dataset.sidecol;
  return { ...insets, col };
}

/** the boot's one call: cover first (before the app lays out), then the column read again at every resize / rotation */
export function installSideColumn(doc = document, win = window) {
  coverIfStandalone(doc, win);
  const read = () => { try { readSideColumn(doc, win); } catch { /* a probe that cannot be read leaves the safe default */ } };
  read();
  try { win.addEventListener('resize', read); win.addEventListener('orientationchange', () => win.setTimeout(read, 300)); } catch { }
}
