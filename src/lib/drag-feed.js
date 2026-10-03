// THE DRAG FEED — the DOM half of every drag's door (lane-drag-release verify r1, finding #1: the torn-off TAB drag and
// the ICON-merge drag (tab-group.js) still ended on the document's `mouseup` after the title-bar and resize doors moved
// to pointer capture — a release over a Web view / Desktop pane left the torn-off window armed with its highlight on,
// and the icon drag's source window INVISIBLE (visibility:hidden) with its ghost on screen; measured in chrome on
// b2fc3f89). ONE implementation for the four doors (title bar, resize handle, tab tear-off, icon drag):
//   captureOn(el, e)      — the element that took the press captures the pointer (null = no capture: a fake DOM, a
//                           hand-over without a pointerId, a browser refusing it — the feed then listens on the document);
//   attachDragFeed(...)   — the feed: DRAG_FEED's four pointer events on the capturing element (else the document), the
//                           window's blur and the page's visibility, on a per-drag controller joined to the owner's
//                           signal; `stop()` tears the listeners down and releases the capture; THE OWNER'S ABORT ENDS
//                           THE DRAG (verify r2 finding #1): a window closed mid-drag aborts its listener controller
//                           FIRST, which took the feed with it and left `body.wm-dragging` up for good (every window's
//                           content pointer-events:none until another drag ended — measured in chrome) — the feed now
//                           hands the door ONE `owner-gone` end, and the door cancels (no drop of a window that is leaving);
//   setDragShield(on, key) — `body.wm-dragging` while ANY drag is in flight: no window's content takes the pointer
//                           (public/style.css), every hit test is the workspace's. A SET of holders keyed per drag, never
//                           a boolean (verify r2 finding #2: a mouse drag and a touch drag at once — the first end lowered
//                           the shield for the second).
// PURE src/lib/drag-end.js names what ends a drag (dragEndVerdict); this module only wires the listeners. A drag door
// that registers its own document mouse listeners is the pre-fix feed (test-window-drag §5 is THE CENSUS: every document /
// window move-or-end listener in src/lib is the feed's or named with its reason; verify r2 put the twelve handle-style doors —
// the sidebar edge, the theme editor, the top-bar / taskbar handles, an explorer column, the minimap, a picture's pan, the
// pptx sidebar, the split divider, the queue reorder, customize-mode's move — on `startPointerDrag`).
import { DRAG_FEED, SHIELD_CLASS, dragEndVerdict } from './drag-end.js';

const HOLDERS = new Set(); // every drag in flight, by its door's key
/** `body.wm-dragging` on / off for THIS holder; the class stands while any holder remains. */
export function setDragShield(on, key = 'wm') {
  if (on) HOLDERS.add(key); else HOLDERS.delete(key);
  on = HOLDERS.size > 0; // the shield stands while ANY drag runs
  try { const cl = document.body && document.body.classList; if (!cl) return; if (on) cl.add(SHIELD_CLASS); else cl.remove(SHIELD_CLASS); } catch {}
}
/** How many drags hold the shield up (the suites read it). */
export function dragShieldHolders() { return HOLDERS.size; }

/** POINTER CAPTURE at a drag's door: `el` keeps receiving the pointer whatever is under the cursor (an iframe, a canvas,
 *  another window, outside the page). Returns the captured pointerId, else null. */
export function captureOn(el, e) {
  const id = e && e.pointerId;
  if (id == null || !el || typeof el.setPointerCapture !== 'function') return null;
  try { el.setPointerCapture(id); } catch { return null; }
  return id;
}

/** THE FEED. `el` + `pointerId` = the capturing element (null el or pointerId ⇒ the document feed, the same end rules);
 *  `onMove` / `onEnd` = the door's handlers; `signal` = the owner's (the window's listener controller: a window closed
 *  mid-drag takes its feed with it AND ends the drag — `onEnd({ type: 'owner-gone' })`, once). Returns { captured, stop }. */
export function attachDragFeed({ el = null, pointerId = null, onMove, onEnd, signal = null } = {}) {
  const ctl = new AbortController();
  const joined = signal && typeof AbortSignal.any === 'function' ? AbortSignal.any([ctl.signal, signal]) : ctl.signal;
  const fs = { signal: joined };
  const captured = pointerId != null && !!el;
  const tgt = captured ? el : document;
  tgt.addEventListener(DRAG_FEED.move, onMove, fs);
  tgt.addEventListener(DRAG_FEED.up, onEnd, fs);
  tgt.addEventListener(DRAG_FEED.cancel, onEnd, fs);
  if (captured) el.addEventListener(DRAG_FEED.lost, onEnd, fs);
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') window.addEventListener('blur', onEnd, fs);
  document.addEventListener('visibilitychange', onEnd, fs);
  let stopped = false;
  const stop = () => {
    if (stopped) return; stopped = true;
    ctl.abort();
    if (captured && typeof el.releasePointerCapture === 'function') { try { el.releasePointerCapture(pointerId); } catch {} }
  };
  // THE OWNER GONE: the owner's signal aborting while this feed runs (never after its own stop — `ctl.signal` removes the
  // listener first) ends the drag at the door, with the capture released
  if (signal && typeof signal.addEventListener === 'function') signal.addEventListener('abort', () => { if (stopped) return; stop(); onEnd({ type: 'owner-gone', pointerId }); }, { signal: ctl.signal });
  return { captured, stop };
}

/** A DRAG DOOR IN ONE CALL (verify r2 — the census): the press `e` on `el` captures the pointer, the feed is attached, and
 *  the door hears `onMove(ev)` for every move with the button held and `onEnd(ev, why)` ONCE for whatever ends it (the
 *  verdict's kinds: release / cancel / capture-lost / blur / hidden / released-unseen / owner-gone — `ev` carries no point on
 *  the last four). `shield` = a key to hold `body.wm-dragging` with for the drag's life (a door whose pointer crosses other
 *  windows); `signal` = the owner's. Returns { captured, stop } — `stop()` ends it by hand, without onEnd. Every handle-style
 *  door is this call; a door with a drop of its own (window.js, tab-group.js) attaches the feed itself. */
export function startPointerDrag(el, e, { onMove, onEnd, signal = null, shield = null } = {}) {
  const pid = captureOn(el, e);
  const st = { active: true, pointerId: pid };
  let feed = null;
  if (shield) setDragShield(true, shield);
  const finish = (ev, why) => { if (!st.active) return; st.active = false; if (feed) feed.stop(); if (shield) setDragShield(false, shield); if (why !== 'stopped') onEnd(ev, why); };
  const move = (ev) => { if (!st.active) return; if (dragEndVerdict({ type: 'pointermove', buttons: ev.buttons, pointerId: ev.pointerId }, st).end) { finish(ev, 'released-unseen'); return; } onMove(ev); };
  const end = (ev) => { const v = dragEndVerdict({ type: ev && ev.type, buttons: ev && ev.buttons, pointerId: ev && ev.pointerId, hidden: typeof document !== 'undefined' && document.hidden === true }, st); if (v.end) finish(ev, v.why); };
  feed = attachDragFeed({ el: pid != null ? el : null, pointerId: pid, onMove: move, onEnd: end, signal });
  return { captured: feed.captured, stop: () => finish(null, 'stopped') };
}
