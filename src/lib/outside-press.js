// PURE (imports nothing, DOM-free) — THE OUTSIDE-PRESS VERDICTS (lane M,
// inc-muhms5kt-0ejl, 2026-09-26). A floating menu / popover / flyout / popup
// closes when the user presses OUTSIDE it. Every closer used to listen for
// `mousedown` on document — and an app's picture (the xpra pane, noVNC's
// canvas) cancels its `pointerdown` so the app gets the press and the browser
// neither selects nor drags. Cancelling `pointerdown` SUPPRESSES the
// compatibility `mousedown` in every phase (measured in Chrome: a press into
// such a pane fires pointerdown 1× and click 1×, mousedown 0× — capture and
// bubble alike; noVNC also stops its canvas mousedown), so no closer ever saw a
// press into the picture: the menu stayed open over the app while every click
// went through to it. The ONE closer (utils.js `onOutsidePress`) listens for
// `pointerdown` in the CAPTURE phase on document — before any pane can cancel
// or stop it — and decides here.
//
// Two verdicts, both tables (scripts/test-outside-press.mjs):
//   pressCloses(facts) — does a press on this target close the surface?
//   pressPhase(pointerType) / tapVerdict(...) — WHEN does a press count? A mouse
//     press counts at pointerdown (as mousedown did); a touch / pen press only
//     when it ends as a TAP — the same pointer lifted within TAP_SLOP_PX of
//     where it went down, before LONG_PRESS_MS, never cancelled. A scroll (the
//     browser cancels the pointer), a drag, a long-press never closes — exactly
//     the presses that never produced a compatibility mousedown before.

/** A tap moved no further than this (CSS px) — utils.js installLongPressContextMenu's own slop. */
export const TAP_SLOP_PX = 10;
/** A press held this long is the long-press gesture (utils.js synthesizes a contextmenu at 500 ms), not a tap. */
export const LONG_PRESS_MS = 500;

/**
 * Does a press close the surface? `facts` are what the DOM half measured for the press target:
 *   connected       — the surface is still in the document (false ⇒ it was removed by other means: Escape's
 *                     [data-popover] sweep, an item's own click — the closer retires WITHOUT calling close)
 *   opening         — the press BEGAN before the closer was armed (its event timeStamp predates the arming): the
 *                     press that opened the surface, never an outside press of it. The closer arms SYNCHRONOUSLY
 *                     and judges by the timestamp — a setTimeout(0) deferral is starved on a busy page (Chrome runs
 *                     input ahead of timers: measured on the real rung, a click into the picture landed before the
 *                     deferred closer existed and the window menu stayed open)
 *   inRoot          — the target is inside the surface
 *   excluded        — the target is inside one of the surface's exempt elements (its anchor, its toggle buttons)
 *   ignored         — the surface's own rule said so (an exact-anchor match, a mode like width-pick)
 *   inNestedPopover — the target is inside some [data-popover] (a menu / flyout spawned FROM this one)
 *   nested          — the surface honours the chained-popover rule (a press in a nested popover keeps it open)
 * Order matters and is the table: gone > opening > inside > excluded > ignored > nested > outside.
 * @returns {{ close: boolean, retire: boolean, why: 'root-gone'|'opening'|'inside'|'excluded'|'ignored'|'nested'|'outside' }}
 */
export function pressCloses(facts = {}) {
  const f = facts || {};
  if (f.connected === false) return { close: false, retire: true, why: 'root-gone' };
  if (f.opening) return { close: false, retire: false, why: 'opening' };
  if (f.inRoot) return { close: false, retire: false, why: 'inside' };
  if (f.excluded) return { close: false, retire: false, why: 'excluded' };
  if (f.ignored) return { close: false, retire: false, why: 'ignored' };
  if (f.nested !== false && f.inNestedPopover) return { close: false, retire: false, why: 'nested' };
  return { close: true, retire: false, why: 'outside' };
}

/** When a press is judged: 'down' (a mouse — at pointerdown, as mousedown was) or 'tap' (touch / pen — at pointerup, if it was a tap).
 *  Anything that is not touch or pen (mouse, an empty pointerType from a synthetic event) is judged at down. */
export function pressPhase(pointerType) {
  return pointerType === 'touch' || pointerType === 'pen' ? 'tap' : 'down';
}

/** Was a touch / pen press a tap? `dx`/`dy` = pointerup − pointerdown (CSS px), `heldMs` = the time between them,
 *  `cancelled` = the browser sent pointercancel (it took the gesture for a scroll / zoom). */
export function tapVerdict({ dx = 0, dy = 0, heldMs = 0, cancelled = false } = {}) {
  if (cancelled) return false;
  if (!(Number.isFinite(dx) && Number.isFinite(dy) && Number.isFinite(heldMs))) return false;
  if (Math.hypot(dx, dy) > TAP_SLOP_PX) return false;
  return heldMs < LONG_PRESS_MS;
}

// ── A PRESS INTO A FRAME (lane menu-close-residue, B-5bd5 ①, 2026-10-20) ──
// A press inside an <iframe> — a Web view window, a plugin window, the
// Channels mail frame, a Design artboard — is dispatched in the FRAME's own
// document: the parent's capture pointerdown never fires, so the closer above
// was blind to it and the menu stayed open over the frame. The ONE signal the
// parent gets is `window` blur. Measured in Chrome (the lane's probe, report
// §1) for a same-origin frame, a cross-origin frame and a sandboxed srcdoc
// artboard alike: at the blur event document.activeElement is ALREADY the frame
// element and document.hasFocus() is still true (the page keeps the focus — it
// went into one of its frames). A blur to ANOTHER top-level window (alt-tab,
// the devtools, a second tab) leaves activeElement where it was (the body, a
// menu row) and hasFocus() false; while a frame holds the focus such a blur
// never reaches the parent at all. focusout is no signal: it fires only when
// an element was focused, with relatedTarget null in both cases.

/** The tags whose focus means "the presses go to another document" — keyboard-yield.js's isFrame family. */
export const FRAME_TAGS = Object.freeze(['IFRAME', 'FRAME', 'OBJECT', 'EMBED']);

/**
 * Does a `window` blur close the surface? The facts the DOM half measured at the blur:
 *   active       — document.activeElement (null / the body = the focus left the page or was nowhere)
 *   el           — the surface (an element, or an array of roots); `contains` is asked
 *   excludes     — its exempt elements (its anchor, its toggle buttons)
 *   pageFocused  — document.hasFocus() at the blur (true: the focus went INTO a frame of this page)
 *   ignored      — the surface's own ignore(active) rule said so
 *   connected    — the surface is still in the document (false ⇒ retire, never close)
 * Order matters and is the table: gone > no-active > not-a-frame > page-unfocused > inside > excluded > ignored > frame.
 * @returns {{ close: boolean, retire: boolean, why: 'root-gone'|'no-active'|'not-a-frame'|'page-unfocused'|'inside'|'excluded'|'ignored'|'frame' }}
 */
export function shouldCloseOnBlur({ active = null, el = null, excludes = [], pageFocused = true, ignored = false, connected = true } = {}) {
  if (connected === false) return { close: false, retire: true, why: 'root-gone' };
  if (!active) return { close: false, retire: false, why: 'no-active' };
  if (!FRAME_TAGS.includes(String(active.tagName || '').toUpperCase())) return { close: false, retire: false, why: 'not-a-frame' };
  if (pageFocused === false) return { close: false, retire: false, why: 'page-unfocused' };
  const within = (x) => !!x && typeof x.contains === 'function' && x.contains(active);
  if ((Array.isArray(el) ? el : [el]).some(within)) return { close: false, retire: false, why: 'inside' };
  if ((Array.isArray(excludes) ? excludes : [excludes]).some(within)) return { close: false, retire: false, why: 'excluded' };
  if (ignored) return { close: false, retire: false, why: 'ignored' };
  return { close: true, retire: false, why: 'frame' };
}
