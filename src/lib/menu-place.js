// THE ONE PLACEMENT OF A MENU — PURE (imports nothing; lane desktop-small, P2-3 of the small-viewport walk: at 951×585 and
// 1024×600 the title-bar menu of a window in the lower half opened UPWARD with its bottom edge on the pointer and nothing
// held its top — 243×430 at y −124..306, «Switch window ▸» / «✥ Move» / «– Minimize» above the viewport, unreachable: the
// very verbs a misplaced window needs. The desktop previews' menu had the same two lines.)
// A box w×h opened at the point (x, y) — below it (its top edge at y), or ABOVE it (its bottom edge at y) when `up` — stays
// INSIDE the viewport vw×vh less `pad`: an `up` box with no room above opens below when that fits, a box that fits on
// neither side is clamped to the edge (it may cover the point), and a box taller than the viewport is capped (`maxH`) so
// it scrolls. Horizontally it starts at x and slides left to stay inside. showContextMenu (src/lib/utils.js) places every
// `.context-menu` / `.taskbar-context-menu` through it. Gates: scripts/test-desktop-small.mjs (the PURE table + the
// wiring), scripts/test-desktop-small-chrome.mjs ③ (every menu at the four small viewports).
export const MENU_PAD = 4;

/** → { left, top, maxH (null = no cap), side: 'below' | 'above' | 'clamped' } — viewport px. */
export function menuPlace({ x = 0, y = 0, w = 0, h = 0, vw = 0, vh = 0, up = false, pad = MENU_PAD } = {}) {
  const room = Math.max(0, vh - 2 * pad);
  const maxH = h > room ? room : null;
  const hh = maxH == null ? h : room;
  const fitsBelow = y + hh <= vh - pad, fitsAbove = y - hh >= pad;
  const side = up && fitsAbove ? 'above' : fitsBelow ? 'below' : 'clamped';
  const top = side === 'above' ? y - hh : side === 'below' ? Math.max(pad, y) : Math.max(pad, vh - pad - hh);
  let left = x;
  if (left + w > vw - pad) left = Math.max(pad, vw - pad - w);
  if (left < pad) left = pad;
  return { left, top, maxH, side };
}
