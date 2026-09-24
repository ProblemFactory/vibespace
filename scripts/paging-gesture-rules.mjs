// THE PER-GESTURE RULES of chat paging (inc-mubvu3a4-x8sb, 2026-09-21), shared by
// the gate suite (scripts/test-chat-paging.mjs §1c) and the by-hand driver
// (scripts/dbg-huge-paging.mjs repro), so the table both print is ONE table.
//
// A gesture row is { name, dir: 'up'|'down'|'btn', wheelPx (signed, the sum of
// the wheel deltas), before, after, ring } where before/after are SNAPs
// { st, sh, ch, ws, we, total, pin, topId, topOff, topH, blankPct, emptyBelow, ring }
// and `after.topDev` is the displacement of the card that was at the top of the
// viewport BEFORE the gesture, measured AFTER it (null when that card left the
// DOM). The rules, in the owner's words:
//   ① "每次都往回跳转很多" — no jump back: the card the reader was looking at may
//      move by AT MOST what the wheel asked plus one landing's slack; a card
//      that moved further than the gesture in the gesture's direction, or that
//      was trimmed out of the DOM, is a jump (JUMP_SLACK_VIEWPORTS).
//   ② "往下又直接跳到底部" — no teleport: a downward gesture may land at the
//      DOM's bottom only when the rendered window ends at the live tail, and a
//      partial window is never pinned — not at the settle, and not DURING the
//      gesture either: a `repin` the ring recorded with `we < total` is the
//      pin (2.369.155). The pinned auto-follow runs from that decision with no
//      input; a later scroll event may unpin before the settle sample (the
//      Actions runner's control rows: repinned every run, settled unpinned), and
//      a sample-only rule then called the pre-fix copy green by timing.
//   ③ "还有大量空白" — no blank: at most BLANK_MAX_PCT of the viewport's sample
//      points hit nothing / an unrendered card once the gesture settled.
//   ④ evidence: the trace ring is never empty after a gesture that paged.
//   ⑤ (verifier r1) a DEAD WHEEL is a violation too: a mid-list gesture — one
//      that neither reaches an edge nor pages — must move the reader's card by
//      at least DELIVERY_MIN_FRACTION of what the wheel asked. Before this the
//      judge only knew "moved FURTHER than asked", so a wheel absorbed inside a
//      gap slab (a 2,800 px fling moving the card < 110 px) was 'OK'.
// History above the window counts the GAP (`after.gapAbove`: the seek
// sentinel's cursor is still above line 0), not only `ws > 0`; a landing while
// a slab is still in flight (`after.loading`) is not judged on its scrollTop.
export const JUMP_SLACK_VIEWPORTS = 1.5;
export const BLANK_MAX_PCT = 25;
export const DELIVERY_MIN_FRACTION = 0.5;
/** The trim's keep zone in viewports on each side of the viewport — src/lib/chat-view.js
 *  TRIM_KEEP_VIEWPORTS (test-chat-trim-guard pins the two equal). */
export const KEEP_ZONE_VIEWPORTS = 1;
export const PAGE_UP_BAND_PX = 100;   // the scroll handler's own pageUp band: a landing inside it with history above is a landing on the slab's top

/** Is there history above the rendered window — in the window index space OR in the seek gap? */
export const historyAbove = (snap) => (snap.ws > 0) || !!snap.gapAbove;

/** Judge one gesture row. Returns { ok, reasons: [string] }. */
export function judgeGesture(row) {
  const reasons = [];
  const { before, after, dir, wheelPx } = row;
  const ch = after.ch || before.ch || 1;
  // a gap slab load is a page too (the window indices do not move for it)
  const gapMoved = after.gapCursor != null && before.gapCursor != null && after.gapCursor !== before.gapCursor;
  const paged = (after.ws !== before.ws) || (after.we !== before.we) || gapMoved || (before.gapCursor == null && after.gapCursor != null);
  // ① jump back — the reader's card
  if (dir === 'up' || dir === 'down') {
    if (after.topDev == null) {
      // the reader's card left the DOM: a jump unless the gesture itself
      // carried it past the keep zone (a 4 s hold legitimately walks past it).
      // DOWNWARD the card leaves the zone once the wheel exceeds the zone above
      // the viewport plus the card's own bottom edge below the viewport top
      // (B-1192: the §4c plan's 720 px `mid` wheel against a 714 px viewport
      // trimmed a reader card whose bottom sat ≤ 6 px below the top — by the
      // rule, once per few heavy runs, judged as a jump because the old bound
      // was a flat 2 viewports). Upward the card must cross the viewport AND
      // the zone below it, so 2 viewports stays the bound; a snapshot without
      // the card's height (older rows) keeps it too.
      const edge = before.topH != null ? (before.topOff || 0) + before.topH : null;
      const past = dir === 'down' && edge != null ? KEEP_ZONE_VIEWPORTS * ch + edge : 2 * ch;
      if (Math.abs(wheelPx) < past) reasons.push(`the card at the top of the viewport before the gesture (${before.topId}) is gone from the DOM${dir === 'down' && edge != null ? ` (its bottom was ${Math.round(edge)} px below the viewport top: the ${Math.abs(wheelPx)} px wheel left it ${Math.round(past - Math.abs(wheelPx))} px inside the ${KEEP_ZONE_VIEWPORTS}-viewport keep zone)` : ''}`);
    } else {
      // expected: the card moves by what the wheel asked (down the screen for
      // an upward wheel); deviation beyond that IN THE GESTURE'S DIRECTION is a jump
      const expected = -wheelPx;               // wheel up (−) ⇒ the card moves down the screen (+)
      const dev = after.topDev - expected;     // + = moved further down than asked; − = further up
      const beyond = dir === 'up' ? dev : -dev;
      if (beyond > JUMP_SLACK_VIEWPORTS * ch) reasons.push(`the reader's card moved ${Math.round(beyond)} px further ${dir === 'up' ? 'down' : 'up'} than the ${Math.abs(wheelPx)} px wheel (slack ${Math.round(JUMP_SLACK_VIEWPORTS * ch)})`);
    }
    // the landing is never inside the pageUp band with history still above
    // (2.369.129's rule, widened by verifier r1 from `st <= 0` — a carry that
    // lost its remainder parked at st 43, one pixel from red) — unless a slab
    // is still in flight at the sample (the landing has not happened yet)
    if (dir === 'up' && after.st < PAGE_UP_BAND_PX && historyAbove(after) && !after.loading) reasons.push(`landed at scrollTop ${after.st} (inside the ${PAGE_UP_BAND_PX} px pageUp band) with ${after.ws} messages${after.gapAbove ? ' and the gap' : ''} still above (before: st ${before.st})`);
    // ⑤ a dead wheel: no edge reached, nothing paged, yet the card barely moved —
    // not judged when the driver could find no plain point to wheel over
    // (`wheelFallback`: every candidate's span crossed a card's own scroll box)
    if (!paged && after.topDev != null && !row.wheelFallback) {
      const room = dir === 'up' ? before.st : before.sh - before.st - before.ch;
      if (Math.abs(wheelPx) <= room) {
        const delivered = dir === 'up' ? after.topDev : -after.topDev;
        if (delivered < DELIVERY_MIN_FRACTION * Math.abs(wheelPx)) reasons.push(`a mid-list ${dir} wheel of ${Math.abs(wheelPx)} px moved the reader's card only ${Math.round(delivered)} px (min ${Math.round(DELIVERY_MIN_FRACTION * 100)} %; room ${Math.round(room)})`);
      }
    }
  }
  // ② teleport — the pin, the bottom landing, and the walk to the tail
  if (after.pin === 1 && after.we < after.total && !after.tp) reasons.push(`pinned with the window ending at ${after.we} of ${after.total} (the DOM edge, not the tail)`);
  // …and the pin taken DURING the gesture: the product's own decision record, independent of when the sample
  // landed (a teleported view never repins — `_atLiveTail` is false there on either build)
  else {
    const midPins = (row.ring || []).filter((e) => e && e.tag === 'repin' && e.we < e.total);
    if (midPins.length) reasons.push(`re-pinned mid-history during the gesture (repin at window end ${midPins[0].we} of ${midPins[0].total}${midPins.length > 1 ? `, ×${midPins.length}` : ''}) — the pinned auto-follow ran from it`);
  }
  const atBottom = after.sh - after.st - after.ch < 4;
  if (dir === 'down' && atBottom && after.we < after.total && !after.tp) reasons.push(`landed on the DOM's bottom with the window ending at ${after.we} of ${after.total}`);
  // the owner's "往下又直接跳到底部" as a single row: the reader's card is gone, the
  // window's end jumped to the total, and the wheel was shorter than the keep
  // zone (a chain of extends the pinned auto-follow ran, not the reader)
  if (dir === 'down' && after.topDev == null && Math.abs(wheelPx) < 2 * ch && before.we < before.total && after.we >= after.total && !after.tp) reasons.push(`teleported to the tail: the reader's card is gone and the window end jumped ${before.we}→${after.we} (the total) on a ${Math.abs(wheelPx)} px wheel`);
  // ③ blank
  if (after.blankPct > BLANK_MAX_PCT) reasons.push(`${after.blankPct}% of the viewport blank after settle (max ${BLANK_MAX_PCT})`);
  if (after.emptyBelow > ch * BLANK_MAX_PCT / 100) reasons.push(`${after.emptyBelow} px empty below the content (max ${Math.round(ch * BLANK_MAX_PCT / 100)})`);
  // ④ evidence
  if (paged && !(row.ring?.length > 0)) reasons.push('the window paged but the trace ring recorded nothing');
  return { ok: reasons.length === 0, reasons, paged };
}

/** One printable line per gesture (numbers only, never content). */
export function formatGesture(row, verdict) {
  const { before, after } = row;
  const dev = after.topDev == null ? 'gone' : String(Math.round(after.topDev - (-row.wheelPx)));
  const land = after.st <= 8 ? 'TOP' : (after.sh - after.st - after.ch < 4 ? 'BOTTOM' : 'mid');
  const gap = (before.gapCards || after.gapCards) ? ` gap ${before.gapCards || 0}→${after.gapCards || 0}` : '';
  return `${row.name.padEnd(14)} ${String(row.dir).padEnd(4)} wheel=${String(row.wheelPx).padStart(6)} st ${String(before.st).padStart(5)}→${String(after.st).padEnd(5)} sh ${String(before.sh).padStart(5)}→${String(after.sh).padEnd(5)} ws ${before.ws}→${after.ws} we ${before.we}→${after.we} pin ${before.pin}→${after.pin}${gap} dev=${dev} blank=${after.blankPct}% below=${after.emptyBelow}px ring=${row.ring?.length ?? 0} land=${land} ${verdict.ok ? 'OK' : 'VIOLATION: ' + verdict.reasons.join('; ')}`;
}

/** The JS the driver/suite evaluate in the page to take a SNAP. `topIdBefore`
 *  (optional) asks for `topDev`: where that card is now vs where it was. */
export const SNAP_SOURCE = `(function (topIdBefore, topOffBefore) {
  const v = window.__v, list = window.__list; const r = list.getBoundingClientRect();
  const st = list.scrollTop, sh = list.scrollHeight, ch = list.clientHeight;
  let top = null, topOff = 0, topH = null;
  for (const c of list.children) { if (c.offsetHeight > 0 && c.offsetTop + c.offsetHeight > st && c.dataset && c.dataset.msgId) { top = c; topOff = c.offsetTop - st; topH = c.offsetHeight; break; } }
  let topDev = null;
  if (topIdBefore != null) {
    const el = list.querySelector('[data-msg-id="' + String(topIdBefore).replace(/"/g, '') + '"]');
    if (el && el.isConnected) {
      // a folded card sits at its run header (the nearest visible thing above it)
      let a = el; while (a && a.offsetParent === null) a = a.previousElementSibling;
      const off = (a || el).offsetTop - st;
      topDev = off - (topOffBefore || 0);
    }
  }
  let empty = 0, unrendered = 0, samples = 0;
  const x = Math.round(r.x + r.width * 0.5);
  for (let y = r.y + 4; y < r.y + r.height - 4; y += 20) {
    samples++;
    const e = document.elementFromPoint(x, y);
    if (!e) { empty++; continue; }
    const card = e.closest('.chat-msg, .chat-run-header, .chat-run-footer, .chat-msg-system, .chat-system, .chat-history-status');
    if (!card) { empty++; continue; }
    if (card.classList.contains('chat-msg') && card.checkVisibility && !card.checkVisibility({ contentVisibilityAuto: true })) { unrendered++; continue; }
  }
  let last = null; for (let i = list.children.length - 1; i >= 0; i--) { const c = list.children[i]; if (c.offsetHeight > 0) { last = c; break; } }
  const contentBottom = last ? (last.offsetTop + last.offsetHeight - st) : 0;
  // the seek gap above the registered tail: the sentinel's cursor (null = not
  // yet discovered ⇒ the whole gap is above when tailStartLine > 0), 0 = done
  const s = v._seekSentinel && v._seekSentinel.isConnected ? v._seekSentinel : null;
  const gapCursor = s ? (s._gapCursor == null ? null : s._gapCursor) : 0;
  const gapAbove = s ? (s._gapCursor == null ? ((v._gapBounds && v._gapBounds.tailStartLine > 0) ? 1 : 0) : (s._gapCursor > 0 ? 1 : 0)) : 0;
  const gapEls = list.querySelectorAll(':scope > .chat-gap-msg');
  const firstTail = list.querySelector(':scope > .chat-msg:not(.chat-gap-msg)');
  // a gap card BELOW the first tail card = ancient history under newer history (verifier r1's ordering finding)
  let gapBelowTail = 0; if (gapEls.length && firstTail) { const lastGap = gapEls[gapEls.length - 1]; if (firstTail.compareDocumentPosition(lastGap) & Node.DOCUMENT_POSITION_FOLLOWING) gapBelowTail = 1; }
  return { st: Math.round(st), sh, ch, ws: v._windowStart, we: v._windowEnd, total: v._total, tp: v._teleported ? 1 : 0, pin: v._pinned ? 1 : 0,
    loading: (v._loading || (s && s._gapLoading)) ? 1 : 0, gapCursor, gapAbove, gapCards: gapEls.length, gapBelowTail,
    rendered: list.querySelectorAll(':scope > .chat-msg').length, kids: list.childElementCount,
    topId: top ? top.dataset.msgId : null, topOff: Math.round(topOff), topH, topDev: topDev == null ? null : Math.round(topDev),
    blankPct: samples ? Math.round(100 * (empty + unrendered) / samples) : 0, emptyPct: samples ? Math.round(100 * empty / samples) : 0, unrenderedPct: samples ? Math.round(100 * unrendered / samples) : 0,
    emptyBelow: Math.max(0, Math.round(ch - contentBottom)), ring: (v._traceRing || []).length, ringSeq: v._traceSeq || 0 };
})`;

/** WHERE TO WHEEL (verifier r1's gap legs): a wheel dispatched over a card's own
 *  scrollable box (a tall tool output with overflow:auto) scrolls THAT box first —
 *  every browser does — and the list never moves (measured: `st 4221→4221` for six
 *  notches inside a gap slab of unfolded tool cards; a box sliding under the
 *  pointer after the first notch took the other five). The drivers ask for a point
 *  on the list's centre line such that NO nested scroller lies under it anywhere
 *  along the span the gesture will sweep (`dir`, `px`), scanning out from the
 *  centre in 20 px steps; `moved:1` says the centre itself was disqualified,
 *  `fallback:1` that every candidate was (a 12,000 px hold — not judged for
 *  delivery anyway). */
export const WHEEL_POINT_SOURCE = (dir, px) => `(() => {
  const list = window.__list; const r = list.getBoundingClientRect(); const st = list.scrollTop;
  // every nested SCROLL CONTAINER in the list (overflow-y auto/scroll — whether or not it overflows:
  // Chrome latches a wheel gesture on the scroll container under the pointer, and a tool output box
  // at its end, or with nothing to scroll, then takes every notch), as [left, right, top, bottom] with
  // the vertical extent in LIST (scroll) coordinates
  const boxes = [];
  for (const a of list.querySelectorAll('*')) {
    const cs = getComputedStyle(a); if (!/(auto|scroll)/.test(cs.overflowY)) continue;
    const b = a.getBoundingClientRect(); if (b.width <= 0 || b.height <= 0) continue;
    boxes.push([b.left, b.right, b.top - r.top + st, b.bottom - r.top + st]);
  }
  const span = Math.abs(${Number(px) || 0}), down = ${JSON.stringify(dir)} === 'down';
  const clear = (x, y) => { const ly = y - r.top + st; const lo = down ? ly : ly - span, hi = down ? ly + span : ly; return !boxes.some(([l, rt, t, b]) => l <= x && rt >= x && b >= lo && t <= hi); };
  // …and the point must be ON THE LIST: an overlay outside it (the floating run
  // bar, the scroll button's wrap, a status toast) under the pointer routes the
  // wheel to nothing at all
  const desc = (e) => e ? (e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.split(/\\s+/).slice(0, 3).join('.') : '')) : 'none';
  const onList = (x, y) => { const e = document.elementFromPoint(x, y); return e && (e === list || list.contains(e)) ? e : null; };
  const center = Math.round(r.y + r.height / 2), cx = Math.round(r.x + r.width * 0.5);
  // columns: the centre line first, then the cards' LEFT gutter (a tool box never reaches it), then a quarter in
  const xs = [cx, Math.round(r.x + 14), Math.round(r.x + 36), Math.round(r.x + r.width * 0.25)];
  const ys = [center]; for (let d = 20; d < r.height / 2 - 8; d += 20) ys.push(center - d, center + d);
  for (const x of xs) for (const y of ys) { const e = onList(x, y); if (e && clear(x, y)) return { x, y, moved: (y === center && x === cx) ? 0 : 1, boxes: boxes.length, under: desc(e) }; }
  return { x: cx, y: center, moved: 0, fallback: 1, boxes: boxes.length, under: desc(document.elementFromPoint(cx, center)) };
})()`;

/** The JS that reads the ring SINCE a `ringSeq` mark — by the entries' own
 *  monotonic `seq`, never by index (the ring splices 600→400 and an index mark
 *  taken before the splice returns nothing after it: the false "paged but the
 *  ring recorded nothing"). `t` is relative to the first entry returned. */
export const RING_SINCE_SOURCE = (mark) => `(() => { const all = (window.__v._traceRing || []).filter((e) => (e.seq || 0) > ${Number(mark) || 0}); const t0 = all.length ? all[0].t : 0; return all.map((e) => { const { t, ...r } = e; return { t: t - t0, ...r }; }); })()`;
