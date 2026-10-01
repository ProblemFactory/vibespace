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
export function barLayout({ widthPx = 0, items = [], gapPx = 0, overflowPx = 0, groups = null } = {}) {
  const width = Math.max(0, Number(widthPx) || 0);
  const gap = Math.max(0, Number(gapPx) || 0);
  const more = Math.max(0, Number(overflowPx) || 0);
  // GROUPS (lane toolbar-fold, 2026-09-30): the top toolbar's items live in ZONES (☰+title · the center · the right
  // cluster), each zone a flex box with its OWN gap, the zones separated by the bar's gap and ALWAYS present as boxes
  // (an empty zone still takes the bar's gap on each side); the ⋯ is a direct child of the bar AFTER the zones. Without
  // `groups` the bar is flat (every item a direct child) — exactly the lane I arithmetic.
  const G = Array.isArray(groups) && groups.length ? groups.map((g) => ({ key: String(g && g.key), gap: Math.max(0, Number(g && g.gapPx) || 0) })) : null;
  const known = G ? new Set(G.map((g) => g.key)) : null;
  const list = (Array.isArray(items) ? items : [])
    .filter((it) => it && it.key != null && Number(it.px) > 0)
    .map((it, i) => ({ key: String(it.key), px: Number(it.px), priority: Math.max(0, Number(it.priority) || 0), i, g: G && known.has(String(it.group)) ? String(it.group) : null }));
  const flat = (arr) => arr.reduce((s, it) => s + it.px, 0) + gap * Math.max(0, arr.length - 1);
  // grouped: every declared group is a box (bar gaps between them); inside a group its own gap; an item naming no
  // declared group is charged as a direct child of the bar (its px + one bar gap — never less than it occupies)
  const sum = !G ? flat : (arr) => {
    let s = gap * (G.length - 1);
    for (const g of G) { const m = arr.filter((it) => it.g === g.key); s += m.reduce((x, it) => x + it.px, 0) + g.gap * Math.max(0, m.length - 1); }
    for (const it of arr) if (it.g === null) s += it.px + gap;
    return s;
  };
  const moreCost = (arr) => more + (G || arr.length ? gap : 0);
  let shown = list.slice();
  const folded = new Set();
  const cost = () => sum(shown) + (folded.size ? moreCost(shown) : 0);
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
  const floor = sum(fixed) + (list.length > fixed.length ? moreCost(fixed) : 0);
  return { shown: shown.map((it) => it.key), overflow: list.filter((it) => folded.has(it.key)).map((it) => it.key), need, fits: need <= width, floor };
}

/**
 * THE ICON STEP BEFORE THE FOLD (lane toolbar-fold, 2026-09-30 — the owner: the top-right cluster of green buttons
 * "takes too much width on a low-resolution screen and overlaps other chrome"). An item that has a SHORTER form
 * (`compactPx`: the toolbar's create buttons without their words — the glyph alone, the words its tooltip and
 * accessible name) gives up its words BEFORE anything folds, one item at a time in the fold's own order (priority
 * desc, equal priorities right-to-left; never-fold items last, right-to-left); only when every such item is compact
 * and the bar still does not fit does barLayout fold — over the compact widths.
 *
 * barLadder({ widthPx, items:[{ key, px, compactPx?, priority, group? }], gapPx, overflowPx, groups? })
 *   → barLayout's { shown, overflow, need, fits } + { compact: keys drawn compact (shown ones, DOM order), floor }
 *   · nothing is compact while the whole bar fits at full width; compaction is MINIMAL (the last item made compact,
 *     back at full width, would make something fold) and MONOTONE (a wider bar never compacts or folds more);
 *   · nothing folds while a compactable item still shows its words;
 *   · floor = barLayout's floor over the all-compact widths — a bar at least that wide always fits;
 *   · with no `compactPx` anywhere it IS barLayout (same verdict, compact []).
 */
export function barLadder({ widthPx = 0, items = [], gapPx = 0, overflowPx = 0, groups = null } = {}) {
  const base = (Array.isArray(items) ? items : [])
    .filter((it) => it && it.key != null && Number(it.px) > 0)
    .map((it) => ({ key: String(it.key), px: Number(it.px), priority: Math.max(0, Number(it.priority) || 0), group: it.group, cpx: Number(it.compactPx) > 0 && Number(it.compactPx) < Number(it.px) ? Number(it.compactPx) : 0 }));
  const run = (arr) => barLayout({ widthPx, gapPx, overflowPx, groups, items: arr });
  const small = base.map((it) => ({ ...it, px: it.cpx || it.px }));
  const floor = run(small).floor;
  let v = run(base);
  const compact = new Set();
  if (v.overflow.length) {
    const order = base.map((it, i) => ({ it, i })).filter((o) => o.it.cpx).sort((a, b) => b.it.priority - a.it.priority || b.i - a.i);
    const cur = base.map((it) => ({ ...it }));
    for (const o of order) {
      compact.add(o.it.key);
      cur[o.i].px = o.it.cpx;
      v = run(cur);
      if (!v.overflow.length) break;
    }
  }
  const shown = new Set(v.shown);
  return { ...v, floor, compact: base.filter((it) => compact.has(it.key) && shown.has(it.key)).map((it) => it.key) };
}

/** The mode badge's SHORT words (the bar's never-fold item; the full sentence — "…— agent asked to pause" —
 *  is its tooltip): 'Agent is driving' | 'You are driving' | 'Another viewer is driving'. English keys: the
 *  views pass them through t(). */
export function shortModeBadge({ mode = 'watch', mine = false } = {}) {
  if (mode !== 'takeover') return 'Agent is driving';
  return mine ? 'You are driving' : 'Another viewer is driving';
}
