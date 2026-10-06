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
