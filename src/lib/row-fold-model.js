// THE PHONE ROW'S ACTIONS FOLD (lane phone-roster-fold — nightly380's roster red, B-7671). PURE: imports only the chrome-bar
// rule (src/lib/live-bar-layout.js barLayout) and touches no DOM — node-imported by scripts/test-roster-row-fold.mjs and
// re-run by the chrome leg (scripts/test-roster-reset-eta.mjs) on the page's own measurements.
//
// The owner's standing rules for a finger device under 1024 CSS px (never desktop chrome; labelled actions; folds as rows):
// a Manage Agents status row shows at most THREE action buttons inline; the rest FOLD into ONE «…» menu whose items are the
// buttons' own words. The fold is by COUNT and by WIDTH — beyond three the last ones fold, and three that still do not fit
// the row fold further (barLayout over what is left, the «…» charged its width + one gap).
// THE ORDER is barLayout's: a primary action (Install / Log in — the row's one way forward) never folds; the others fold
// right-to-left. MEASURED (b48937610, Claude Code + Codex on the hub's shell PATH, 375 px phone): the Codex row drew
// Re-check · Log in · Update · Rules & checks — 362 px in a 352 px section, sideways overflow.
// The desktop row (the desktop class: ≥ 1024 px, or a fine pointer ≥ 769 px) is never asked — every button, byte for byte.
import { barLayout } from './live-bar-layout.js';

/** At most this many action buttons stand in a phone row; the rest are the «…» menu's. */
export const ROW_INLINE_MAX = 3;
const OPENED = '\u0000opened';

/**
 * rowActionsFold({ items, widthPx, gapPx, moreW, max }) → { shown, folded, need, fits }
 *   items   — [{ key, px, primary? }] in DOM order; `px` = the button's natural width (an item with px ≤ 0 is absent).
 *   widthPx — the width the strip may take (the row's content box: on a phone the strip wraps onto its own line).
 *   gapPx   — the strip's column gap; moreW — the «…» button's width.
 * shown / folded are keys in DOM order; need = the width the verdict occupies («…» included when anything folds);
 * fits = need ≤ widthPx (false only when the primary actions alone exceed the row).
 */
export function rowActionsFold({ items = [], widthPx = 0, gapPx = 0, moreW = 0, max = ROW_INLINE_MAX } = {}) {
  const list = (Array.isArray(items) ? items : []).filter((it) => it && it.key != null && Number(it.px) > 0)
    .map((it, i) => ({ key: String(it.key), px: Number(it.px), priority: it.primary ? 0 : 1, i }));
  const cap = Math.max(1, Math.floor(Number(max) || ROW_INLINE_MAX));
  const width = Math.max(0, Number(widthPx) || 0);
  // THE COUNT: beyond `cap` the items fold in barLayout's own order (higher priority first, ties right-to-left)
  const order = list.slice().sort((a, b) => b.priority - a.priority || b.i - a.i);
  const byCount = new Set(order.slice(0, Math.max(0, list.length - cap)).map((it) => it.key));
  const kept = list.filter((it) => !byCount.has(it.key)).map(({ key, px, priority }) => ({ key, px, priority }));
  // THE WIDTH: barLayout over what is left. A «…» the count already opened is charged exactly as barLayout charges one —
  // the count-folded items stand in as ONE placeholder wider than the row that folds before anything else
  const v = barLayout({ widthPx: width, gapPx, overflowPx: moreW, items: byCount.size ? [...kept, { key: OPENED, px: width + 1, priority: Number.MAX_SAFE_INTEGER }] : kept });
  const folded = new Set([...byCount, ...v.overflow]);
  return { shown: list.filter((it) => !folded.has(it.key)).map((it) => it.key), folded: list.filter((it) => folded.has(it.key)).map((it) => it.key), need: v.need, fits: v.need <= width };
}
