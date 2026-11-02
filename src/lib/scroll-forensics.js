// SCROLL FORENSICS (lane run-open-jump, B-a7a9 — inc-mvzai8oc-j70t). PURE: no DOM global is read here; the callers hand in
// the clock, the timer, the element describer and the style reader, so scripts/test-incident-recorder.mjs ⑦ runs every
// record shape in node.
// The capture that asked for it: four times a chat view moved 767 px in ONE scroll event, 0–1 ms after an input stamp,
// and nothing in the bundle could say what the input was. The action ring kept only ptr {el, x, y}, key and ime (no
// wheel, no pointer type), and the chat trace kept only moves ≥ 400 px (`from` = the last LOGGED position). So it could
// not tell a one-notch page scroll from a native layout move. Two records answer that next time:
//   • the action ring's WHEEL record — one per WHEEL_COALESCE_MS burst: the first event's time, target and deltaMode,
//     the summed deltaY, the event count, whether Ctrl was held, and the scrollTop of the scroller the wheel moves when
//     the burst began and when it closed. Positions and deltas only — never content (the recorder's privacy rule).
//   • the chat view's FINE scroll trace — EVERY scroll event for FINE_SCROLL_MS after a run toggle or the ↓ button:
//     st, sh, ch, the writer (the `_traceExpect` stamp written since the previous scroll event, else 'none'),
//     writeAgo, wheelAgo; an arm marker opens each window with the geometry at the press.

export const WHEEL_COALESCE_MS = 100;
export const FINE_SCROLL_MS = 2000;
export const FINE_SCROLL_CAP = 300; // per view: two full windows at 60 Hz plus their markers

const round2 = (n) => Math.round(n * 100) / 100;

/** The element a wheel scrolls: the target or its nearest ancestor that overflows vertically and lets it scroll
 *  (overflow-y auto / scroll / overlay); the document's scroller when none does. `styleOf` = getComputedStyle. */
export function wheelScroller(el, styleOf, root = null) {
  for (let n = el, i = 0; n && n.nodeType === 1 && i < 40; n = n.parentElement, i++) {
    if (n.scrollHeight > n.clientHeight + 1) {
      const oy = styleOf(n)?.overflowY;
      if (oy === 'auto' || oy === 'scroll' || oy === 'overlay') return n;
    }
  }
  return root;
}

/** The wheel listener's body: one record per WHEEL_COALESCE_MS window, pushed at the burst's FIRST event (so the ring
 *  stays in time order) and completed in place when the window closes (`stAfter`, the totals). `stBefore` is the
 *  scroller's position at its last scroll event before the burst (`lastSt`, kept by the recorder's capture-phase
 *  scroll listener): measured in headless Chrome 154, a compositor-threaded wheel scroll is ALREADY applied when the
 *  main thread dispatches the wheel event (1950 read as 1775 for a 175 px notch), while its scroll event comes after.
 *  A scroller with no scroll event yet reads its current position. */
export function createWheelRecorder({ now, later, describe, scrollerOf, push, lastSt = null }) {
  let cur = null;
  const close = () => {
    const c = cur; cur = null;
    if (!c) return;
    try { c.rec.stAfter = c.sc ? Math.round(c.sc.scrollTop) : null; } catch { c.rec.stAfter = null; }
  };
  return (e) => {
    if (!cur) {
      let sc = null;
      try { sc = scrollerOf(e.target); } catch { }
      const before = sc ? (lastSt?.has(sc) ? lastSt.get(sc) : sc.scrollTop) : null;
      const rec = { t: now(), k: 'wheel', el: describe(e.target), deltaY: 0, deltaMode: e.deltaMode | 0, ctrl: 0, n: 0, stBefore: before == null ? null : Math.round(before), stAfter: null };
      cur = { rec, sc };
      push(rec);
      later(close, WHEEL_COALESCE_MS);
    }
    const r = cur.rec;
    r.deltaY = round2(r.deltaY + (Number(e.deltaY) || 0));
    r.n++;
    if (e.ctrlKey) r.ctrl = 1;
  };
}

/** One fine-trace entry for a scroll event at `now`: `by` names the writer when a `_traceExpect` stamp was written since
 *  the previous scroll event (`writeSeq` moved past `seenSeq`), else 'none' — the browser's own move (a wheel, anchoring,
 *  a clamp). */
export function fineScrollEntry({ now, st, sh, ch, writeSeq, seenSeq, writeAt, writeBy, userAt }) {
  return {
    t: now, st: Math.round(st), sh, ch,
    by: (writeSeq || 0) !== (seenSeq || 0) ? (writeBy || '?') : 'none',
    writeAgo: writeAt ? now - writeAt : -1,
    wheelAgo: userAt ? now - userAt : -1,
  };
}

/** Push onto a capped fine ring (oldest dropped). */
export function pushFine(ring, entry, cap = FINE_SCROLL_CAP) {
  ring.push(entry);
  if (ring.length > cap) ring.splice(0, ring.length - cap);
  return ring;
}
