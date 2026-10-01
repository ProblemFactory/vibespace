// THE CHROME-BAR FOLD — the DOM half of src/lib/live-bar-layout.js (lane I, 2026-09-25). A bar NEVER
// wraps: every item keeps its words on one line at its natural width (the CSS rule: `white-space:
// nowrap; flex: 0 0 auto` on every child, the ONE flexible item excepted), and what does not fit is
// FOLDED into the view's ⋯ menu by the PURE verdict (`barLadder` — barLayout with the icon step first).
//
//   · THE RULER — a hidden twin of the bar (the bar's own classes, so every `.x-bar > y` rule and the
//     inherited font apply; inside an offscreen, aria-hidden host that is NOT a direct child of the
//     bar's parent, so no `parent > .x-bar` rule reaches it) measures an item's natural width from a
//     clone — ONCE per (class, text): the widths are cached, a resize is pure arithmetic. The cache
//     empties when the page's fonts finish loading (a width measured in a fallback font is stale).
//     `rulerIn` (the top toolbar, lane toolbar-fold) hosts the ruler INSIDE another element — the bar
//     itself — so rules keyed on an ancestor (`#toolbar .x`) and the bar's own zoom reach the clones;
//     mutations inside the ruler are never news.
//   · A ResizeObserver on the bar and a MutationObserver on its subtree (a label's text, an item's
//     `style` / `class` — never our own fold / compact classes) schedule ONE layout per animation frame.
//   · The fold is a CLASS (`bar-folded`): the views keep writing `style.display` for what is present
//     at all (a Hand back only while taken over), the fold is an independent layer on top. THE ICON
//     STEP (lane toolbar-fold): an item may name a `compactClass` — its shorter form (a button without
//     its words); it is measured in both forms and the verdict's `compact` list wears the class.
//   · `live` items (never folded, never compact — the toolbar's usage pies / inbox / desktop previews,
//     whose id-keyed rules a clone cannot carry) are measured from their own rendered box.
//   · `groups()` hands the rule the bar's ZONES (flex boxes with their own gaps; each item names its
//     `group`) — see barLayout.
//   · `suspended()` true (the toolbar while Customize mode edits it): every item unfolded and full,
//     the ⋯ hidden, no verdict.
//   · Self-check: when the applied verdict still overflows the bar (a measurement the page no longer
//     agrees with) the cache is dropped and the layout re-run once — bounded, never a loop.
//   · Lifecycle: bound to the caller's AbortSignal (the window's `_listenerCtl`) — both observers
//     disconnect, the frame is cancelled and the ruler removed when the window closes.
import { barLadder } from './live-bar-layout.js';

export const FOLDED = 'bar-folded';
const CACHE_MAX = 400;

/**
 * createBarFold(bar, { items, more, moreAlways, signal, onLayout, groups, rulerIn, suspended }) → { schedule, layoutNow, folded, compact, last, measure, dispose }
 *   items()      — [{ key, el, priority, flexMin?, compactClass?, live?, group? }] in DOM order: every child the rule may
 *                  place. `flexMin` marks a flexible item (charged at that minimum). An item whose `style.display` is
 *                  'none' — or whose clone measures 0 (a media rule) — is absent: never shown, never folded.
 *   more         — the ⋯ button: shown iff something is folded or `moreAlways()`.
 *   onLayout(v)  — called after each applied verdict ({ shown, overflow, compact, need, fits, floor, widthPx, gapPx,
 *                  overflowPx, groups, items:[{key, px, compactPx, priority, group}] } — the census re-runs barLadder on
 *                  exactly these); a suspended layout reports { suspended: true }.
 */
export function createBarFold(bar, { items, more = null, moreAlways = () => false, signal = null, onLayout = null, groups = null, rulerIn = null, suspended = null } = {}) {
  const doc = bar.ownerDocument || document;
  const host = doc.createElement('div');
  host.className = 'bar-ruler-host';
  host.setAttribute('aria-hidden', 'true');
  const ruler = doc.createElement('div');
  host.appendChild(ruler);
  (rulerIn || bar.parentElement || doc.body).appendChild(host);
  const cache = new Map();
  const ownClasses = new Set([FOLDED]); // the fold's own classes — the compact ones join as items name them
  const strip = (cls) => String(cls || '').split(/\s+/).filter((c) => c && !ownClasses.has(c)).join(' ');
  let raf = 0, last = null, dead = false;

  /** An item's natural width in the bar's layout px (0 = absent), cached per (class, text, children) — `compactClass`
   *  = the width of its compact form. */
  function measure(el, compactClass = null) {
    if (!el) return 0;
    const key = strip(el.className) + '\u0001' + el.textContent + '\u0001' + el.childElementCount + '\u0001' + el.getElementsByTagName('*').length + '\u0001' + (el.getAttribute('style') || '').replace(/display:\s*[^;]+;?/g, '') + '\u0001' + (compactClass || '');
    if (cache.has(key)) return cache.get(key);
    ruler.className = strip(bar.className); // the bar's classes: `.x-bar > y` rules reach the clone
    const c = el.cloneNode(true);
    for (const k of ownClasses) c.classList.remove(k);
    if (compactClass) c.classList.add(compactClass);
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
  const setCls = (el, cls, on) => { if (el && el.classList.contains(cls) !== on) el.classList.toggle(cls, on); };
  const setFolded = (el, on) => setCls(el, FOLDED, on);

  function layoutNow(retry = true) {
    if (dead) return null;
    const list = (items() || []).filter((it) => it && it.el);
    for (const it of list) if (it.compactClass) ownClasses.add(it.compactClass);
    if (suspended && suspended()) {
      for (const it of list) { setFolded(it.el, false); if (it.compactClass) setCls(it.el, it.compactClass, false); }
      if (more) setFolded(more, true);
      last = { suspended: true, shown: list.map((it) => String(it.key)), overflow: [], compact: [] };
      try { onLayout?.(last); } catch { /* observer */ }
      return last;
    }
    const cw = bar.clientWidth;
    if (!(cw > 0)) return null; // hidden (another desktop, a background tab, minimized): the observer runs it once laid out again
    const cs = (doc.defaultView || window).getComputedStyle(bar);
    const widthPx = cw - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    const gapPx = parseFloat(cs.columnGap) || 0;
    const rows = list.map((it) => {
      const present = it.el.style.display !== 'none';
      let px = 0, compactPx = 0;
      if (present && it.live) px = it.el.offsetWidth > 0 ? it.el.offsetWidth + 1 : 0; // its own box (never folded, never compact)
      else if (present) px = it.flexMin != null ? (measure(it.el) > 0 ? it.flexMin : 0) : measure(it.el);
      if (px > 0 && !it.live && it.compactClass && it.flexMin == null) compactPx = measure(it.el, it.compactClass);
      return { key: String(it.key), px, compactPx, priority: it.live ? 0 : it.priority || 0, group: it.group, el: it.el, compactClass: it.live ? null : it.compactClass || null };
    });
    const morePx = more ? measure(more) : 0;
    // a ⋯ that is shown ANYWAY (the xpra strip's own Show window frame ▸ / Scale ▸) is an always-present item at its place
    // in the bar — charged whether or not anything folds; otherwise barLadder charges it only while something is folded
    const always = !!more && !!moreAlways();
    if (always) { const at = rows.findIndex((r) => r.el.compareDocumentPosition(more) & 2 /* PRECEDING */); rows.splice(at < 0 ? rows.length : at, 0, { key: '⋯', px: morePx, compactPx: 0, priority: 0, el: null }); }
    const overflowPx = always ? 0 : morePx;
    const zones = groups ? groups() : null;
    const v = barLadder({ widthPx, gapPx, overflowPx, groups: zones, items: rows });
    const out = new Set(v.overflow), small = new Set(v.compact);
    for (const r of rows) {
      if (!r.el) continue;
      setFolded(r.el, out.has(r.key));
      if (r.compactClass) setCls(r.el, r.compactClass, small.has(r.key));
    }
    const wantMore = !!more && (out.size > 0 || always);
    if (more) setFolded(more, !wantMore);
    last = { ...v, widthPx, gapPx, overflowPx, groups: zones, items: rows.map(({ key, px, compactPx, priority, group }) => ({ key, px, compactPx, priority, group })) };
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
    // our own fold / compact toggles are not news: a class record whose value differs only by those classes is skipped;
    // neither is anything the ruler does (a ruler hosted inside the bar clones into its own subtree)
    if (recs.some((r) => !host.contains(r.target) && !(r.type === 'attributes' && r.attributeName === 'class' && strip(r.oldValue) === strip(r.target.className)))) schedule();
  }) : null;
  mo?.observe(bar, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['style', 'class'], attributeOldValue: true });
  try { doc.fonts?.ready?.then(() => { cache.clear(); schedule(); }); } catch { /* no font API */ }
  const stop = () => { dead = true; ro?.disconnect(); mo?.disconnect(); if (raf) cancelAnimationFrame(raf); raf = 0; host.remove(); };
  if (signal) { if (signal.aborted) stop(); else signal.addEventListener('abort', stop, { once: true }); }
  schedule();
  return { schedule, layoutNow, measure, folded: () => (last ? last.overflow.slice() : []), compact: () => (last ? (last.compact || []).slice() : []), last: () => last, dispose: stop };
}
