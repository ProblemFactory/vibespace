// A WINDOW'S MINIMUM SIZE — PURE (imports nothing; 2.369.158, docs/design-desktop-apps.zh.md §7.6).
// The owner (2026-09-23, GNOME Calculator on the xpra rung): "if the inner window has a minimum height,
// the OUTER window's resize must be limited to that height". Every VibeSpace window already has ONE
// minimum — the `.window` CSS floor 320×180 (public/style.css), the rule the terminal lives by: a CSS
// min-width/min-height, so a grid cell, a snap zone or a restored layout SMALLER than it leaves the
// window at its minimum, overlapping the neighbouring cell honestly (never squeezed, never cropped).
// A window may now raise that floor for itself (`winInfo.minWidth/minHeight`, set through
// WindowManager.setMinSize — a desktop-app window from its app's size constraints): the SAME rule, per
// window — the inline min-width/min-height carries it through every path that sizes the element (snap,
// grid presets, layout restore, maximize), and the resize DRAG stops at it (the cursor may overshoot,
// the window does not move its fixed edge). On the ≤768 px phone layout the window IS the screen
// (style.css forces min 0 !important there) and the app's picture scales to fit instead.
// Gate: scripts/test-window-minsize.mjs.

/** The `.window` CSS floor (public/style.css `.window { min-width: 320px; min-height: 180px }`). */
export const WINDOW_FLOOR = Object.freeze({ w: 320, h: 180 });

/**
 * A window's effective minimum (layout px): its own, never below the floor — and, when `cap` (the
 * WORKSPACE box, layout px) is given, never above the workspace (2.369.158 r2, the verifier: a DPR-1
 * client taking over a 2× app, or `desktop.appScale` 2 on a small 1× screen, asked for a window TALLER
 * than the screen — the keypad off-screen again, unscaled, and a window nobody could make smaller). A
 * minimum capped here leaves the pane smaller than the app's minimum, which is the view's
 * scale-to-fit case (the badge names the size the app wanted). The floor still wins over a workspace
 * smaller than the floor (the CSS rule the terminal lives by).
 */
export function minOf(win, cap = null) {
  const w = Number(win && win.minWidth), h = Number(win && win.minHeight);
  let mw = Math.max(WINDOW_FLOOR.w, Number.isFinite(w) ? Math.ceil(w) : 0), mh = Math.max(WINDOW_FLOOR.h, Number.isFinite(h) ? Math.ceil(h) : 0);
  if (cap && Number(cap.w) > 0) mw = Math.max(WINDOW_FLOOR.w, Math.min(mw, Math.floor(Number(cap.w))));
  if (cap && Number(cap.h) > 0) mh = Math.max(WINDOW_FLOOR.h, Math.min(mh, Math.floor(Number(cap.h))));
  return { w: mw, h: mh };
}

/** A window rectangle moved (never resized) so it stays inside the workspace when it fits there — a window raised
 *  to its minimum near the bottom/right edge slides up/left instead of hanging past the screen. */
export function keepInside({ left, top, width, height }, ws) {
  let l = left, tp = top;
  if (ws && Number(ws.w) > 0 && l + width > ws.w) l = Math.max(0, ws.w - width);
  if (ws && Number(ws.h) > 0 && tp + height > ws.h) tp = Math.max(0, ws.h - height);
  return { left: l, top: tp, width, height, moved: l !== left || tp !== top };
}

/**
 * The resize drag's rectangle held at the minimum: the edge being dragged stops, the OPPOSITE edge
 * stays where it was (a west/north drag past the minimum used to keep moving the window's left/top
 * while CSS held its width — the window slid). `dir` is the handle ('n','se','w',…); `rect` the
 * candidate {left, top, width, height} after the pointer delta (and any grid snap).
 */
export function clampToMin(rect, dir, min) {
  let { left, top, width, height } = rect;
  const d = String(dir || '');
  if (width < min.w) { if (d.includes('w')) left = left + width - min.w; width = min.w; }
  if (height < min.h) { if (d.includes('n')) top = top + height - min.h; height = min.h; }
  return { left, top, width, height };
}

/** A size below the minimum raised to it (layout restore, a new minimum on an open window). */
export function raiseToMin({ width, height }, min) {
  const w = Math.max(width, min.w), h = Math.max(height, min.h);
  return { width: w, height: h, raised: w !== width || h !== height };
}

/**
 * The VibeSpace window's minimum from its CONTENT's minimum: `pane` = the smallest content box the
 * app needs (CSS px at net zoom 1 = viewport px), `chrome` = the window's own chrome around the pane
 * in VIEWPORT px (title bar, status strip, borders — outer rect minus pane rect), `uiScale` the body's
 * DPI zoom (window styles are LAYOUT px = viewport ÷ uiScale). null pane ⇒ null (no minimum of its own).
 */
export function windowMinForPane(pane, chrome, uiScale = 1) {
  if (!pane || !(pane.w > 0) || !(pane.h > 0)) return null;
  const s = Number(uiScale) > 0 ? Number(uiScale) : 1;
  const cw = Math.max(0, Number(chrome && chrome.w) || 0), ch = Math.max(0, Number(chrome && chrome.h) || 0);
  return { w: Math.ceil((pane.w + cw) / s), h: Math.ceil((pane.h + ch) / s) };
}
