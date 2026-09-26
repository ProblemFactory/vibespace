// THE CHROME-BAR FOLD RULE (lane I, 2026-09-25 — the owner's live-view screenshots: "观看"/"接管"
// stacked one glyph per line over the bind button and the URL, "undefined" printed in the bar,
// "标签页 (1)" / "控制台 (0)" / "操作 (0)" squeezed to "签页(1)" / "制台(0)" / "操作(0)"; "你这些UI都检查过吗？").
// PURE — imports nothing, touches no DOM (node-imported by scripts/test-live-bar-layout.mjs and by
// the heavy census scripts/test-browser-live-ui.mjs, which re-runs it on the page's own inputs).
//
// A chrome bar NEVER wraps and nothing in it ever shrinks below its words: every item keeps its
// natural width on one line, exactly ONE item may flex (the live view's URL, the desktop strip's
// status) down to a stated minimum, and what does not fit FOLDS into ONE overflow (⋯) menu — by
// PRIORITY, never by position: priority 0 never folds; a higher number folds earlier; items of
// equal priority fold right-to-left (the far end of the bar goes first). The ⋯ button costs its own
// width + one gap, and only while something is folded.
//
// The DOM half (the ruler that measures each label once per text, the ResizeObserver, the rAF
// coalescing, the listener lifecycle) is src/lib/bar-fold.js; the views name their items and
// priorities (src/lib/browser-live-window.js, src/lib/desktop-app-window.js).

/**
 * barLayout({ widthPx, items, gapPx, overflowPx }) → { shown, overflow, need, fits, floor }
 *   widthPx    — the bar's CONTENT width (padding excluded), in the same px as the items.
 *   items      — [{ key, px, priority, flex? }] in DOM order. `px` = the item's natural width;
 *                for the ONE flexible item, its MINIMUM. An item with px ≤ 0 (absent: hidden by
 *                its view, or by a media rule) takes no part — neither shown nor folded.
 *   gapPx      — the bar's column gap.
 *   overflowPx — the ⋯ button's width, charged (with one gap) while anything is folded.
 * shown / overflow are keys in DOM order; need = the width the verdict occupies; fits = need ≤ widthPx
 * (false only when the never-fold items alone exceed the bar — then every foldable item is folded, the never-fold
 * items are shown in DOM order and the ⋯ is charged after them: a bar that narrow CLIPS, so a view must never be
 * given one — see `floor`).
 * floor = the bar's own minimum: the never-fold items + the ⋯ (charged when anything CAN fold) + their gaps — the
 *   width at which every foldable item is folded. Independent of widthPx (a view may raise its container's minimum
 *   to it without a feedback loop). THE SPLIT FLOOR (lane I verify r1, 2026-09-25): a bound live-view pane dragged
 *   to the divider's clamp was 134 px beside a never-fold set of 169–222 px — the toggle cut and the ⋯ (the only way
 *   to the folded items) clipped out of the bar; the view now keeps its pane at ≥ its bar's floor
 *   (WindowManager.setPaneMinWidth) and lets its badge fold (last) so the floor is the toggle + the ⋯.
 */
export function barLayout({ widthPx = 0, items = [], gapPx = 0, overflowPx = 0 } = {}) {
  const width = Math.max(0, Number(widthPx) || 0);
  const gap = Math.max(0, Number(gapPx) || 0);
  const more = Math.max(0, Number(overflowPx) || 0);
  const list = (Array.isArray(items) ? items : [])
    .filter((it) => it && it.key != null && Number(it.px) > 0)
    .map((it, i) => ({ key: String(it.key), px: Number(it.px), priority: Math.max(0, Number(it.priority) || 0), i }));
  const sum = (arr) => arr.reduce((s, it) => s + it.px, 0) + gap * Math.max(0, arr.length - 1);
  let shown = list.slice();
  const folded = new Set();
  const cost = () => sum(shown) + (folded.size ? more + (shown.length ? gap : 0) : 0);
  if (cost() > width) {
    const order = list.filter((it) => it.priority > 0).sort((a, b) => b.priority - a.priority || b.i - a.i);
    for (const it of order) {
      folded.add(it.key);
      shown = shown.filter((x) => x !== it);
      if (cost() <= width) break;
    }
  }
  const need = cost();
  const fixed = list.filter((it) => it.priority === 0);
  const floor = sum(fixed) + (list.length > fixed.length ? more + (fixed.length ? gap : 0) : 0);
  return { shown: shown.map((it) => it.key), overflow: list.filter((it) => folded.has(it.key)).map((it) => it.key), need, fits: need <= width, floor };
}

/** The mode badge's SHORT words (the bar's never-fold item; the full sentence — "…— agent asked to pause" —
 *  is its tooltip): 'Agent is driving' | 'You are driving' | 'Another viewer is driving'. English keys: the
 *  views pass them through t(). */
export function shortModeBadge({ mode = 'watch', mine = false } = {}) {
  if (mode !== 'takeover') return 'Agent is driving';
  return mine ? 'You are driving' : 'Another viewer is driving';
}
