// THE ONE PLACEMENT OF A MENU — PURE (imports nothing; lane desktop-small, P2-3 of the small-viewport walk: at 951×585 and
// 1024×600 the title-bar menu of a window in the lower half opened UPWARD with its bottom edge on the pointer and nothing
// held its top — 243×430 at y −124..306, «Switch window ▸» / «✥ Move» / «– Minimize» above the viewport, unreachable: the
// very verbs a misplaced window needs. The desktop previews' menu had the same two lines.)
// A box w×h opened at the point (x, y) — below it (its top edge at y), or ABOVE it (its bottom edge at y) when `up` — stays
// INSIDE the viewport vw×vh less `pad`: an `up` box with no room above opens below when that fits, a box that fits on
// neither side is clamped to the edge (it may cover the point), and a box taller than the viewport is capped (`maxH`) so
// it scrolls. Horizontally it starts at x and slides left to stay inside; a box wider than the viewport is capped (`maxW`)
// at the left pad. showContextMenu (src/lib/utils.js) places every `.context-menu` / `.taskbar-context-menu` through it.
// An OPEN box (`keep`, lane desktop-doors-table r4 — the compact desktop list patched in place by another screen's change:
// its hand-written correction lifted it by its overflow with no floor and no cap, 17 desktops + 3 added at 951×585 stood at
// y −61, its first rows unreachable, nothing to scroll; a name wider than the screen ran it 2 574 px wide) KEEPS its top
// while it stands inside: what it gained goes below, past the viewport's foot it is capped there and scrolls — its rows
// never move under the pointer or a held drag; one that no longer stands inside (a viewport that shrank) is placed afresh,
// downward. A SCROLLED open box (`scrolled`, r5 — the capped list wheeled by 100 px, the room grown, then a remote change
// re-placed it: its cap lifted whole, the offset fell to 0 and every row came down 100 px under the pointer) KEEPS ITS
// OFFSET: its cap lifts only as far as what it shows past that offset (`scroll` = the offset it shows); at the top it lifts
// whole. Gates: scripts/test-desktop-small.mjs (the PURE table + the wiring), scripts/test-desktop-small-chrome.mjs ③
// (every menu at the four small viewports), ⑲ r4 (the patched list) and ⑲ r5 (the scrolled one).
export const MENU_PAD = 4;

/** → { left, top, maxH (null = no cap), maxW (null = no cap), scroll (null = leave it), side: 'below' | 'above' | 'clamped' |
 *  'kept' } — viewport px. `keep` = the box is already open with its top at y, `keep` px tall as it stands (0 = a box being
 *  opened); `scrolled` = how far its content is scrolled — a kept box keeps that offset (`scroll`). */
export function menuPlace({ x = 0, y = 0, w = 0, h = 0, vw = 0, vh = 0, up = false, keep = 0, scrolled = 0, pad = MENU_PAD } = {}) {
  const room = Math.max(0, vh - 2 * pad), across = Math.max(0, vw - 2 * pad);
  const maxW = w > across ? across : null, ww = maxW == null ? w : across;
  let left = x;
  if (left + ww > vw - pad) left = Math.max(pad, vw - pad - ww);
  if (left < pad) left = pad;
  if (keep > 0 && y >= pad - 1 && y + keep <= vh - pad + 1) { // it stands inside (a pixel of rounding either way): its top stays
    const top = Math.max(pad, y), below = vh - pad - top, scroll = Math.min(Math.max(0, scrolled), h);
    const tall = Math.min(below, h - scroll); // never taller than what it shows past its offset (r5: a cap lifted whole dropped the offset)
    return { left, top, maxH: tall < h ? tall : null, maxW, scroll, side: 'kept' };
  }
  const maxH = h > room ? room : null;
  const hh = maxH == null ? h : room;
  const fitsBelow = y + hh <= vh - pad, fitsAbove = y - hh >= pad;
  const side = up && fitsAbove ? 'above' : fitsBelow ? 'below' : 'clamped';
  const top = side === 'above' ? y - hh : side === 'below' ? Math.max(pad, y) : Math.max(pad, vh - pad - hh);
  return { left, top, maxH, maxW, scroll: null, side };
}
