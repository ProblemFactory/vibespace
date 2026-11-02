// SCROLL FORENSICS (lane run-open-jump, B-a7a9 — inc-mvzai8oc-j70t). PURE: no DOM global is read here; the callers hand in
// the clock, the timer, the element describer and the style reader, so scripts/test-incident-recorder.mjs ⑦ runs every
// record shape in node.
// The capture that asked for it: four times a chat view moved 767 px in ONE scroll event, 0–1 ms after an input stamp,
// and nothing in the bundle could say what the input was. The action ring kept only ptr {el, x, y}, key and ime (no
// wheel, no pointer type), and the chat trace kept only moves ≥ 400 px (`from` = the last LOGGED position). So it could
// not tell a one-notch page scroll from a native layout move. Two records answer that next time:
//   • the WHEEL ring (its own — r2: in the shared action ring 60 s of wheeling pushed every click and key out): one record
//     per WHEEL_COALESCE_MS burst of ONE deltaMode — the first event's time, target and deltaMode, the summed deltaY, the
//     event count, whether Ctrl was held, and the scrollTop of the scroller the wheel moves when the burst began and when
//     it closed. A ring that dropped records says so on its first one (`droppedBefore`, cumulative). Positions and deltas
//     only — never content (the recorder's privacy rule).
//   • the chat view's FINE scroll trace — EVERY scroll event for FINE_SCROLL_MS after a run toggle or the ↓ button:
//     st, sh, ch, the writer (the `_traceExpect` stamp written since the previous scroll event, else 'none'),
//     writeAgo, wheelAgo; an arm marker opens each window with the geometry the view last saw. A window keeps its HEAD
//     (the marker + the first FINE_HEAD events — where a cause lives) and its TAIL (the last FINE_TAIL), and counts what
//     it dropped between them in ONE marker (r2: at 240 Hz a 300-entry ring lost the arm and the first 181 events); the
//     ring holds two full windows and counts what its front trim drops (r3).

export const WHEEL_COALESCE_MS = 100;
export const WHEEL_RING_CAP = 200;   // bursts; 20 s of continuous wheeling at 10 bursts a second
export const FINE_SCROLL_MS = 2000;
export const FINE_HEAD = 200;        // events kept from a window's start (with its arm marker)
export const FINE_TAIL = 200;        // events kept from its end
export const FINE_SCROLL_CAP = 2 * (1 + FINE_HEAD + 1 + FINE_TAIL); // 804: TWO full windows fit whole (r3 — toggle → jump → ↓ arms twice inside 2 s)

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

/** Push onto a capped ring; the oldest go, and the new first record carries the cumulative count dropped before it. */
export function pushCapped(ring, cap, entry) {
  ring.push(entry);
  return pushCappedTrim(ring, cap);
}

/** The wheel listener's body: one record per WHEEL_COALESCE_MS window of ONE deltaMode (a change of unit closes the burst —
 *  lines and pixels never sum), pushed at the burst's FIRST event (so the ring stays in time order) and completed in place
 *  when the window closes (`stAfter`, the totals). `stBefore` is the scroller's position at its last scroll event before
 *  the burst (`lastSt`, kept by the recorder's capture-phase scroll listener): measured in headless Chrome 154, a
 *  compositor-threaded wheel scroll is ALREADY applied when the main thread dispatches the wheel event (1950 read as 1775
 *  for a 175 px notch), while its scroll event comes after. A scroller with no scroll event yet reads its current position.
 *  deltaY is read BEFORE deltaMode (r2): Firefox reports line units to every later listener once deltaMode was read first. */
export function createWheelRecorder({ now, later, describe, scrollerOf, push, lastSt = null }) {
  let cur = null;
  const close = (c) => {
    if (!c || c.closed) return;
    c.closed = true;
    if (cur === c) cur = null;
    try { c.rec.stAfter = c.sc ? Math.round(c.sc.scrollTop) : null; } catch { c.rec.stAfter = null; }
  };
  return (e) => {
    const dy = Number(e.deltaY) || 0;
    const mode = e.deltaMode | 0;
    if (cur && cur.rec.deltaMode !== mode) close(cur);
    if (!cur) {
      let sc = null;
      try { sc = scrollerOf(e.target); } catch { }
      const before = sc ? (lastSt?.has(sc) ? lastSt.get(sc) : sc.scrollTop) : null;
      const rec = { t: now(), k: 'wheel', el: describe(e.target), deltaY: 0, deltaMode: mode, ctrl: 0, n: 0, stBefore: before == null ? null : Math.round(before), stAfter: null };
      const c = cur = { rec, sc, closed: false };
      push(rec);
      later(() => close(c), WHEEL_COALESCE_MS);
    }
    const r = cur.rec;
    r.deltaY = round2(r.deltaY + dy);
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

/** Push onto a view's fine ring, window by window: an arm marker (`entry.arm`) opens a window; its first FINE_HEAD events
 *  stay; once the window outgrows FINE_HEAD + FINE_TAIL, ONE `{dropped}` marker takes the place of the events dropped from
 *  its middle (written only when something WAS dropped — r3), and the last FINE_TAIL follow it. The ring as a whole keeps
 *  FINE_SCROLL_CAP entries — two full windows; older ones go first, COUNTED like the wheel ring's (`droppedBefore` on the
 *  first entry left — r3: the front trim was silent). The per-window state lives on the array (`ring.win`, not
 *  serialized). */
export function pushFine(ring, entry) {
  if (entry.arm) {
    ring.win = { n: 0, drop: null, first: null, tail: 0 };
    ring.push(entry);
  } else {
    const w = ring.win || (ring.win = { n: 0, drop: null, first: null, tail: 0 });
    w.n++;
    if (w.n <= FINE_HEAD) ring.push(entry);
    else {
      if (!w.first) w.first = entry;
      ring.push(entry); w.tail++;
      if (w.tail > FINE_TAIL) {
        if (!w.drop) { // the FIRST drop: the marker takes the oldest tail entry's place
          const at = ring.indexOf(w.first);
          w.drop = { t: w.first.t, dropped: 1 };
          ring[at] = w.drop;
        } else {
          ring.splice(ring.indexOf(w.drop) + 1, 1);
          w.drop.dropped++;
        }
        w.tail--;
      }
    }
  }
  return pushCappedTrim(ring, FINE_SCROLL_CAP);
}

/** The front trim of a capped ring, counted on the first entry left (cumulative `droppedBefore`). */
function pushCappedTrim(ring, cap) {
  const over = ring.length - cap;
  if (over > 0) {
    const before = ring[0]?.droppedBefore || 0;
    ring.splice(0, over);
    ring[0].droppedBefore = before + over;
  }
  return ring;
}
