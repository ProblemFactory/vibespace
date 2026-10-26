// THE END OF A DRAG — PURE (imports nothing; lane-drag-release, userW's inc-muq7uk0f-e59s + inc-muq7wwfq-rruz,
// 2026-10-01: a PDF viewer dropped onto a cell holding the Desktop window stayed where it was with the highlight on;
// a resize released over that window kept resizing when the pointer came back; the viewer could grow but not shrink).
// THE CLASS (the lane M class, second strike): a title-bar drag and a resize ended on a document-level `mouseup`. A
// release hit-tested on another window's iframe never reaches this document (the embedded page gets it — the Web
// view, the PDF viewer's own frame); noVNC's canvas stops its mousemove / mouseup (stopPropagation + preventDefault).
// So the release was never heard: the drag stayed armed, and the moves over an iframe were lost too (a corner dragged
// INWARD over the viewer's own PDF frame moved nothing — "能放大，不能缩小"). Measured on the base tree in chrome
// (scripts/test-window-drag-ui.mjs): the Web view and the Desktop swallow a mouse release; the live-view picture and
// the xpra pane do not stop one.
// THE RULE: pointer capture at every drag's door — the element that took the press captures the pointer and the drag
// is fed from THAT element (capture delivers every pointer event there whatever is under the cursor, even outside the
// page); ONE end door per drag; this module names what ends one.
//
// `dragEndVerdict(ev, st)` — ev = { type, buttons?, pointerId?, hidden? } (the event as seen), st = { active,
// pointerId } (the drag in flight and the pointer it holds; a null pointerId = a feed without capture, any pointer).
// Ends: pointerup / pointercancel / lostpointercapture of the drag's pointer, the window's blur, the page going
// hidden, a pointermove of the drag's pointer with NO button held (a release the page never saw), and a mouseup (the
// feed of a page without pointer capture), and `owner-gone` (the feed's owner aborted: the window closed mid-drag —
// the door cancels, no drop). Never ends: another pointer's events (a second finger), a move with the
// button held, the page becoming visible, anything while no drag is active (so a second end event is a no-op — the
// drag ended ONCE).
/** The feed's event names (the control copy of window.js names the pre-fix mouse feed here). */
export const DRAG_FEED = Object.freeze({ move: 'pointermove', up: 'pointerup', cancel: 'pointercancel', lost: 'lostpointercapture' });
/** `body.<SHIELD_CLASS>` while a drag or a resize is in flight: every window's content is pointer-events:none
 *  (public/style.css) — no iframe / canvas / picture takes the pointer, the hit test is the workspace's. */
export const SHIELD_CLASS = 'wm-dragging';

export function dragEndVerdict(ev, st) {
  if (!st || !st.active) return { end: false, why: 'idle' };
  const t = ev && typeof ev.type === 'string' ? ev.type : '';
  const own = st.pointerId == null || ev == null || ev.pointerId == null || ev.pointerId === st.pointerId;
  if (t === 'pointerup') return own ? { end: true, why: 'release' } : { end: false, why: 'other-pointer' };
  if (t === 'pointercancel') return own ? { end: true, why: 'cancel' } : { end: false, why: 'other-pointer' };
  if (t === 'lostpointercapture') return own ? { end: true, why: 'capture-lost' } : { end: false, why: 'other-pointer' };
  if (t === 'owner-gone') return own ? { end: true, why: 'owner-gone' } : { end: false, why: 'other-pointer' }; // the feed's owner (the window) closed mid-drag — the door CANCELS, never drops (verify r2 #1)
  if (t === 'blur') return { end: true, why: 'blur' };
  if (t === 'visibilitychange') return ev.hidden === true ? { end: true, why: 'hidden' } : { end: false, why: 'visible' };
  if (t === 'pointermove') return own && ev.buttons === 0 ? { end: true, why: 'released-unseen' } : { end: false, why: own ? 'moving' : 'other-pointer' };
  if (t === 'mouseup') return { end: true, why: 'release' };
  return { end: false, why: 'ignored' };
}

/** Where a drag's feed listens: the element that captured the pointer, else the document (a browser or a fake DOM
 *  without pointer capture — the pre-capture feed, with every end rule above still applied). */
export function feedTarget(captured) { return captured ? 'element' : 'document'; }

// THE RELEASE NEVER BURIES A WINDOW (lane desktop-small — P2-1 of the small-viewport walk, 1024×600 / 1100×700, the Quad
// preset: a title bar dragged onto the taskbar and released there left the window at y 553 of a 556 px workspace, 2 px of
// its title bar above the taskbar; its tile — click, click again — the window list, the sidebar and a browser resize all
// kept it there, and Move in its tile's menu was the only way back). The grid's drop snapped only to a cell UNDER the
// pointer and the taskbar is under none, so the free drag's place stood. THE RULE, on every release (grid or free, the
// pointer anywhere): a grid drop outside every cell takes the cell nearest the pointer (releasePoint), and the window keeps
// at least RELEASE_KEEP of its title bar inside #workspace (releaseBox); a window whose title bar is NOT reachable (an old
// layout, another client's screen) is brought wholly inside by the doors that name it — its taskbar tile, its window-list
// row (wm.revealWindow → insideBox). Gates: scripts/test-window-drag.mjs §1 / §2 (f), scripts/test-desktop-small-chrome.mjs ①②.
/** The part of a title bar every release keeps inside the workspace (layout px): wide enough to grab, the bar's own height. */
export const RELEASE_KEEP = Object.freeze({ w: 80, h: 32 });

const laidOut = (ws) => !!ws && Number(ws.w) > 0 && Number(ws.h) > 0;

/** `box` = { left, top, width, height } (layout px, the workspace's own space), `ws` = { w, h } → the box MOVED (never
 *  resized) so its title bar keeps `keep.w` × `keep.h` inside: top in [0, ws.h − keep.h], left in [keep.w − width,
 *  ws.w − keep.w]; `moved` = whether it moved. A workspace not laid out ⇒ the box as it is. */
export function releaseBox(box, ws, keep = RELEASE_KEEP) {
  if (!box || !laidOut(ws)) return { ...(box || {}), moved: false };
  const kw = Math.min(keep.w, box.width, ws.w), kh = Math.min(keep.h, ws.h);
  const left = Math.min(Math.max(box.left, kw - box.width), ws.w - kw);
  const top = Math.min(Math.max(box.top, 0), ws.h - kh);
  return { left, top, width: box.width, height: box.height, moved: left !== box.left || top !== box.top };
}

/** THE RESIZE'S RELEASE (lane desktop-small r2 ③ — clampToMin bounds the size only, so a north edge dragged past the top
 *  lifted the title bar out of the workspace): the edge the person dragged STOPS — a north edge past the top is cut back to
 *  0, the bottom edge staying put (the height shrinks by the overshoot, never under `min.h`) — then releaseBox's keep for
 *  the rest. `moved` = whether the box changed. */
export function resizeRelease(box, ws, dir = '', keep = RELEASE_KEEP, min = null) {
  if (!box || !laidOut(ws)) return { ...(box || {}), moved: false };
  let { top, height } = box;
  if (String(dir).includes('n') && top < 0) { const cut = Math.min(-top, Math.max(0, height - (Number(min && min.h) || 0))); top += cut; height -= cut; }
  const k = releaseBox({ left: box.left, top, width: box.width, height }, ws, keep);
  return { left: k.left, top: k.top, width: k.width, height: k.height, moved: k.left !== box.left || k.top !== box.top || k.height !== box.height };
}

/** Is a window reachable — does its title bar keep `keep` inside the workspace (the release's own rule)? */
export function reachable(box, ws, keep = RELEASE_KEEP) { return !releaseBox(box, ws, keep).moved; }

/** THE RECOVERY: a window a door names is brought wholly inside the workspace when it fits there, else to its top-left edge
 *  (the most of it shows) — moved, never resized; `moved` = whether it moved. */
export function insideBox(box, ws) {
  if (!box || !laidOut(ws)) return { ...(box || {}), moved: false };
  const left = Math.max(0, Math.min(box.left, ws.w - box.width)), top = Math.max(0, Math.min(box.top, ws.h - box.height));
  return { left, top, width: box.width, height: box.height, moved: left !== box.left || top !== box.top };
}

/** A grid release OUTSIDE every cell (over the taskbar, past an edge): the point its cell is chosen at — the pointer
 *  clamped just inside `rect` (viewport px: the workspace's bounding box); `outside` = it was clamped. */
export function releasePoint({ x, y }, rect) {
  const right = rect.right ?? rect.left + rect.width, bottom = rect.bottom ?? rect.top + rect.height;
  const cx = Math.min(Math.max(x, rect.left + 1), right - 1), cy = Math.min(Math.max(y, rect.top + 1), bottom - 1);
  return { x: cx, y: cy, outside: cx !== x || cy !== y };
}
