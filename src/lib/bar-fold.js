// THE CHROME-BAR FOLD — the DOM half of src/lib/live-bar-layout.js (lane I, 2026-09-25). A bar NEVER
// wraps: every item keeps its words on one line at its natural width (the CSS rule: `white-space:
// nowrap; flex: 0 0 auto` on every child, the ONE flexible item excepted), and what does not fit is
// FOLDED into the view's ⋯ menu by the PURE `barLayout` verdict.
//
//   · THE RULER — a hidden twin of the bar (the bar's own classes, so every `.x-bar > y` rule and the
//     inherited font apply; inside an offscreen, aria-hidden host that is NOT a direct child of the
//     bar's parent, so no `parent > .x-bar` rule reaches it) measures an item's natural width from a
//     clone — ONCE per (class, text): the widths are cached, a resize is pure arithmetic. The cache
//     empties when the page's fonts finish loading (a width measured in a fallback font is stale).
//   · A ResizeObserver on the bar and a MutationObserver on its subtree (a label's text, an item's
//     `style` / `class` — never our own fold class) schedule ONE layout per animation frame.
//   · The fold is a CLASS (`bar-folded`): the views keep writing `style.display` for what is present
//     at all (a Hand back only while taken over), the fold is an independent layer on top.
//   · Self-check: when the applied verdict still overflows the bar (a measurement the page no longer
//     agrees with) the cache is dropped and the layout re-run once — bounded, never a loop.
//   · Lifecycle: bound to the caller's AbortSignal (the window's `_listenerCtl`) — both observers
//     disconnect, the frame is cancelled and the ruler removed when the window closes.
import { barLayout } from './live-bar-layout.js';

export const FOLDED = 'bar-folded';
const CACHE_MAX = 400;
const strip = (cls) => String(cls || '').split(/\s+/).filter((c) => c && c !== FOLDED).join(' ');

/**
 * createBarFold(bar, { items, more, moreAlways, signal, onLayout }) → { schedule, layoutNow, folded, last, measure }
 *   items()      — [{ key, el, priority, flexMin? }] in DOM order: every child the rule may place. `flexMin`
 *                  marks THE flexible item (charged at that minimum). An item whose `style.display` is
 *                  'none' — or whose clone measures 0 (a media rule) — is absent: never shown, never folded.
 *   more         — the ⋯ button (a child of `bar`): shown iff something is folded or `moreAlways()`.
 *   onLayout(v)  — called after each applied verdict ({ shown, overflow, need, fits, widthPx, gapPx,
 *                  overflowPx, items:[{key, px, priority}] } — the census re-runs barLayout on exactly these).
 */
export function createBarFold(bar, { items, more = null, moreAlways = () => false, signal = null, onLayout = null } = {}) {
  const doc = bar.ownerDocument || document;
  const host = doc.createElement('div');
  host.className = 'bar-ruler-host';
  host.setAttribute('aria-hidden', 'true');
  const ruler = doc.createElement('div');
  host.appendChild(ruler);
  (bar.parentElement || doc.body).appendChild(host);
  const cache = new Map();
  let raf = 0, last = null, dead = false;

  /** An item's natural width in the bar's layout px (0 = absent), cached per (class, text, children). */
  function measure(el) {
    if (!el) return 0;
    const key = strip(el.className) + '\u0001' + el.textContent + '\u0001' + el.childElementCount + '\u0001' + (el.getAttribute('style') || '').replace(/display:\s*[^;]+;?/g, '');
    if (cache.has(key)) return cache.get(key);
    ruler.className = strip(bar.className); // the bar's classes: `.x-bar > y` rules reach the clone
    const c = el.cloneNode(true);
    c.classList.remove(FOLDED);
    c.style.display = '';
    c.removeAttribute('id');
    ruler.appendChild(c);
    const gone = (doc.defaultView || window).getComputedStyle(c).display === 'none';
    const px = gone ? 0 : c.offsetWidth + 1; // offsetWidth rounds: +1 keeps the sum conservative
    c.remove();
    if (cache.size >= CACHE_MAX) cache.clear();
    cache.set(key, px);
    return px;
  }
  const setFolded = (el, on) => { if (el && el.classList.contains(FOLDED) !== on) el.classList.toggle(FOLDED, on); };

  function layoutNow(retry = true) {
    if (dead) return null;
    const cw = bar.clientWidth;
    if (!(cw > 0)) return null; // hidden (another desktop, a background tab, minimized): the observer runs it once laid out again
    const cs = (doc.defaultView || window).getComputedStyle(bar);
    const widthPx = cw - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    const gapPx = parseFloat(cs.columnGap) || 0;
    const list = (items() || []).filter((it) => it && it.el);
    const rows = list.map((it) => {
      const present = it.el.style.display !== 'none';
      const px = !present ? 0 : it.flexMin != null ? (measure(it.el) > 0 ? it.flexMin : 0) : measure(it.el);
      return { key: it.key, px, priority: it.priority || 0, el: it.el };
    });
    const morePx = more ? measure(more) : 0;
    // a ⋯ that is shown ANYWAY (the xpra strip's own Show window frame ▸ / Scale ▸) is an always-present item at its place
    // in the bar — charged whether or not anything folds; otherwise barLayout charges it only while something is folded
    const always = !!more && !!moreAlways();
    if (always) { const at = rows.findIndex((r) => r.el.compareDocumentPosition(more) & 2 /* PRECEDING */); rows.splice(at < 0 ? rows.length : at, 0, { key: '⋯', px: morePx, priority: 0, el: null }); }
    const overflowPx = always ? 0 : morePx;
    const v = barLayout({ widthPx, gapPx, overflowPx, items: rows });
    const out = new Set(v.overflow);
    for (const r of rows) if (r.el) setFolded(r.el, out.has(r.key));
    const wantMore = !!more && (out.size > 0 || always);
    if (more) setFolded(more, !wantMore);
    last = { ...v, widthPx, gapPx, overflowPx, items: rows.map(({ key, px, priority }) => ({ key, px, priority })) };
    if (retry && bar.scrollWidth > bar.clientWidth + 1) { cache.clear(); return layoutNow(false); }
    try { onLayout?.(last); } catch { /* observer */ }
    return last;
  }
  function schedule() {
    if (dead || raf) return;
    raf = requestAnimationFrame(() => { raf = 0; layoutNow(); });
  }

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
  ro?.observe(bar);
  const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver((recs) => {
    // our own fold toggles are not news: a class record whose value differs only by FOLDED is skipped
    if (recs.some((r) => !(r.type === 'attributes' && r.attributeName === 'class' && strip(r.oldValue) === strip(r.target.className)))) schedule();
  }) : null;
  mo?.observe(bar, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['style', 'class'], attributeOldValue: true });
  try { doc.fonts?.ready?.then(() => { cache.clear(); schedule(); }); } catch { /* no font API */ }
  const stop = () => { dead = true; ro?.disconnect(); mo?.disconnect(); if (raf) cancelAnimationFrame(raf); raf = 0; host.remove(); };
  if (signal) { if (signal.aborted) stop(); else signal.addEventListener('abort', stop, { once: true }); }
  schedule();
  return { schedule, layoutNow, measure, folded: () => (last ? last.overflow.slice() : []), last: () => last, dispose: stop };
}
