// A FLOATING THING IN A CORNER OF ITS FRAME (lane stream-stats-popup): the stream details' pinned panel (src/lib/stream-stats.js)
// and the full-screen pill (src/lib/stream-pill.js). It sits in one of the frame's four corners (CSS insets, so a resize keeps
// it there); a press on its handle drags it freely — once a frame (rAF-coalesced), the deltas in layout px (÷ uiScale), through
// the ONE drag feed (src/lib/drag-feed.js startPointerDrag: pointer capture, every end named once) — and the release drops it on
// the NEAREST corner (src/stream-series.js cornerOf), which the owner remembers. A press that never moved is no drag.
import { startPointerDrag } from './drag-feed.js';
import { uiScale } from './utils.js';
import { cornerOf, cornerFrom } from '../stream-series.js';

export const CORNER_GAP = 10; // px from the frame's edges

/** `el` (position: absolute in `frame`) into `corner` ('tl' | 'tr' | 'bl' | 'br'). */
export function placeInCorner(el, corner, gap = CORNER_GAP) {
  const c = cornerFrom(corner);
  el.style.left = el.style.right = el.style.top = el.style.bottom = '';
  el.style[c[0] === 't' ? 'top' : 'bottom'] = gap + 'px';
  el.style[c[1] === 'l' ? 'left' : 'right'] = gap + 'px';
  el.dataset.corner = c;
}

/** The press `e` on `handle` drags `el` inside `frame`; the release drops it on the nearest corner — `onDrop(corner)` (null =
 *  it never moved: a click). `onState(dragging)` = the drag began / ended. → the drag ({ stop }) or null (not a primary press). */
export function dragToCorner(el, frame, handle, e, { onDrop = null, onState = null, signal = null } = {}) {
  if (!e || (e.button != null && e.button !== 0)) return null;
  const Z = uiScale() || 1;
  const fr = frame.getBoundingClientRect(), er = el.getBoundingClientRect();
  const start = { x: e.clientX, y: e.clientY, left: (er.left - fr.left) / Z, top: (er.top - fr.top) / Z };
  let raf = 0, last = null, moved = false;
  const apply = () => {
    raf = 0;
    if (!last) return;
    const dx = (last.clientX - start.x) / Z, dy = (last.clientY - start.y) / Z;
    if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return; // a press that wobbles is still a click
    if (!moved) { moved = true; el.classList.add('is-dragging'); onState?.(true); }
    el.style.right = el.style.bottom = '';
    el.style.left = Math.max(0, Math.min(frame.clientWidth - el.offsetWidth, start.left + dx)) + 'px';
    el.style.top = Math.max(0, Math.min(frame.clientHeight - el.offsetHeight, start.top + dy)) + 'px';
  };
  return startPointerDrag(handle, e, {
    signal,
    onMove: (ev) => { last = ev; if (!raf) raf = requestAnimationFrame(apply); },
    onEnd: (ev) => {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (ev && ev.clientX != null) { last = ev; apply(); }
      if (!moved) { onDrop?.(null); return; }
      el.classList.remove('is-dragging'); onState?.(false);
      const r = el.getBoundingClientRect(), f = frame.getBoundingClientRect();
      onDrop?.(cornerOf({ x: r.left + r.width / 2 - f.left, y: r.top + r.height / 2 - f.top }, { w: f.width, h: f.height }));
    },
  });
}
