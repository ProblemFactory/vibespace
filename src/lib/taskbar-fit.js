// THE TASKBAR AT A SMALL SCREEN — PURE (imports nothing; lane desktop-small — P2-2 of the small-viewport walk: past ~8 windows
// at 951 / 1024 / 1100 px (12 at 1280) the tiles ran on under the tray — 60 px each, a label of one or two characters, no
// scrollbar, no «+N», the wheel inert (deltaY 120 ⇒ scrollLeft 0) — and the owner's own words, «userW有一大堆桌面，屏幕尺寸
// 小了之后桌面就堆积在一起了»: eight desktops' previews took 432 px of a 691 px taskbar and left the tiles 144 px).
//   · stripHidden — which tiles the strip does not show whole (the «+N» chip lists them)
//   · wheelScroll — a vertical wheel over the strip scrolls it sideways
//   · switcherForm — the desktop switcher full (a preview per desktop) or compact (ONE «Desktop k/N ▾» button)
// The tile's floor is style.css's `.taskbar-item { min-width }` (TILE_MIN_PX, pinned by scripts/test-desktop-small.mjs).
// src/lib/taskbar.js (fitTaskbarStrip) and src/lib/desktop-manager.js (_renderSwitcher) ask it; the gates are
// scripts/test-desktop-small.mjs (the tables) and scripts/test-desktop-small-chrome.mjs ⑥ (the four viewports).

/** A tile's floor (layout px): its icon and a readable word. */
export const TILE_MIN_PX = 90;
/** The desktop switcher folds before the tile strip keeps fewer tiles than this… */
export const STRIP_MIN_TILES = 4;
/** …or before the previews take more than this share of the taskbar. */
export const SWITCHER_SHARE = 1 / 3;

/** `tiles` = [{ id, left, width }] — each tile's left edge relative to the strip's visible left edge (px, the same unit as
 *  `width`, the strip's visible width) → { hidden: [ids in order], before, after }. A tile an edge cuts counts as hidden: its
 *  words are cut and its centre may lie under the tray. */
export function stripHidden({ tiles = [], width = 0 } = {}) {
  const hidden = [];
  let before = 0, after = 0;
  for (const tl of Array.isArray(tiles) ? tiles : []) {
    const l = Number(tl.left) || 0, r = l + (Number(tl.width) || 0);
    if (l >= -0.5 && r <= width + 0.5) continue;
    hidden.push(tl.id);
    if (l < -0.5) before++; else after++;
  }
  return { hidden, before, after };
}

/** A wheel over the strip: a mostly vertical wheel scrolls it sideways (the strip has no height to scroll); a horizontal one
 *  the browser already scrolls (unused). deltaMode 1 = lines (×40 px), 2 = pages (× the strip's width). → { left, used } */
export function wheelScroll({ scrollLeft = 0, max = 0, deltaX = 0, deltaY = 0, deltaMode = 0, width = 0 } = {}) {
  if (!(max > 0) || Math.abs(deltaY) <= Math.abs(deltaX)) return { left: scrollLeft, used: false };
  const k = deltaMode === 1 ? 40 : deltaMode === 2 ? Math.max(1, width) : 1;
  const left = Math.max(0, Math.min(max, scrollLeft + deltaY * k));
  return { left, used: left !== scrollLeft };
}

/** The desktop switcher's form in the taskbar. `n` = the previews (desktops + the Stage), `each` = px per preview (its box +
 *  the gap), `add` = px of the «+», `bar` = the taskbar's content width, `others` = px of everything else on the bar but the
 *  tiles (the tray's other items, the «+N» chip, gaps). 'full' while the previews fit BOTH the share of the bar and the room
 *  the strip's floor leaves; else 'compact'. A bar not laid out, or one desktop: 'full'. */
export function switcherForm({ n = 1, each = 54, add = 23, bar = 0, others = 0, stripMin = STRIP_MIN_TILES * TILE_MIN_PX, share = SWITCHER_SHARE } = {}) {
  if (!(bar > 0) || n <= 1) return 'full';
  const need = n * each + add;
  return need <= bar * share && need <= bar - others - stripMin ? 'full' : 'compact';
}
