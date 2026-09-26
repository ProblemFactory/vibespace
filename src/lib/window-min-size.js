// A WINDOW'S MINIMUM SIZE — PURE (imports nothing; 2.369.158, docs/design-desktop-apps.zh.md §7.6).
// The owner (2026-09-23, GNOME Calculator on the xpra rung): "if the inner window has a minimum height,
// the OUTER window's resize must be limited to that height". Every VibeSpace window already has ONE
// minimum — the `.window` CSS floor 320×180 (public/style.css), the rule the terminal lives by: a CSS
// min-width/min-height, so a grid cell, a snap zone or a restored layout SMALLER than it leaves the
// window at its minimum, overlapping the neighbouring cell honestly (never squeezed, never cropped) —
// and, at the workspace's right / bottom edge where there IS no neighbouring cell, slid back inside
// (`zoneBox`, inc-muhmqvzf-jodk: the overlap there was a crop by #workspace's overflow: clip).
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
 * A ZONE'S BOX for a window with a minimum (inc-muhmqvzf-jodk, 2026-09-26 — Chrome snapped into the right third of
 * a 1×3 grid on a 1450 px workspace: a 478 px cell, a 502 px window minimum; the window grew rightward from the
 * cell's left edge, hung 20 px past the workspace, and #workspace (overflow: clip) cut the app's ⋮ and our own ✕).
 * `zone` = where a snap / grid cell / stored bounds / a restored size puts the window (layout px), `min` = its
 * effective minimum (minOf, workspace-capped), `ws` = the workspace box, `gap` = the snap gutter kept at the edge.
 * The size is the zone raised to the minimum; the growth goes toward the INSIDE: a box that would end past the
 * workspace edge (less `gap`) slides left / up just enough, never past the workspace's own left / top edge. A zone
 * that already ended past that edge (a window the person dropped hanging off the screen) keeps ITS right / bottom
 * edge — the minimum never adds a crop, and a window without a raised minimum is never moved. `ws` null (the
 * workspace not laid out) ⇒ the raised size, no slide.
 */
export function zoneBox(zone, min, ws, gap = 0) {
  const axis = (pos, size, need, room) => {
    const s = Math.max(size, Number(need) || 0);
    if (!(Number(room) > 0)) return [pos, s];
    const bound = Math.max(pos + size, room - gap);
    return pos + s > bound ? [Math.max(Math.min(pos, 0), bound - s), s] : [pos, s];
  };
  const [left, width] = axis(zone.left, zone.width, min && min.w, ws && ws.w);
  const [top, height] = axis(zone.top, zone.height, min && min.h, ws && ws.h);
  return { left, top, width, height, moved: left !== zone.left || top !== zone.top, raised: width !== zone.width || height !== zone.height };
}

/**
 * A box with its EDGES on whole layout px (the sizes follow from the rounded edges, never rounded apart — two
 * neighbours keep their shared gutter; inc-muhmqvzf-jodk r2, the verifier's low: stored fractions × a 1450 px
 * workspace wrote 727.03 / 778.94 px and the pane on that fractional box left up to one device px of the picture
 * under its edge). `offsetLeft` / `offsetWidth` are integers, so a whole-px box round-trips through the grid-bounds
 * capture without drift.
 */
export function wholePx({ left, top, width, height }) {
  const l = Math.round(left), t = Math.round(top);
  return { left: l, top: t, width: Math.round(left + width) - l, height: Math.round(top + height) - t };
}

/**
 * A box the WINDOW MANAGER stored on one workspace (the restore box it keeps through a maximize), carried to the
 * workspace of now: the same fractions of it — exactly where the workspace reflow puts a visible window's grid bounds
 * — edges on whole px (inc-muhmqvzf-jodk r2: a right third of a 1876 px workspace kept at left 1252 through a
 * maximize while the sidebar opened, restored on a 1450 px one, hung 422 CSS px past it and was then captured as
 * the window's fractions — a cascade). `from` / `to` = {w, h} workspace boxes; the same, or either unknown ⇒ the
 * box as it was.
 */
export function rescaleBox(box, from, to) {
  const ok = (b) => b && Number(b.w) > 0 && Number(b.h) > 0;
  if (!ok(from) || !ok(to) || (from.w === to.w && from.h === to.h)) return box;
  const kx = to.w / from.w, ky = to.h / from.h;
  return wholePx({ left: box.left * kx, top: box.top * ky, width: box.width * kx, height: box.height * ky });
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
