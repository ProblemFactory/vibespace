// THE UPWARD PAGE'S VERDICT of a channel conversation window (verify round 3, 2026-09-27).
//
// PURE (imports nothing, DOM-free): src/lib/channel-window.js asks HERE whether a
// scroll event at the top of its list may read the page above — and, past the
// local log's start, ask the vendor (`POST …/older`, a METERED request the engine
// charges to the account's minute budget; the server keeps no memory of
// "exhausted", so every one it lets through is a vendor call).
//
// A SCROLL EVENT SAYS THE OFFSET CHANGED, NOT THAT SOMEBODY MOVED IT. Round 2
// caught the rebuild's own clear (`listReady`); round 3 reproduced the rest of
// the class: a MAXIMIZE (or any resize — the sidebar opening, a phone's
// rotation, ANOTHER CLIENT's layout sync) whose pane outgrows the content makes
// the browser clamp scrollTop to 0 and dispatch the same `scroll` event, and the
// window answered it with `?before=` + `POST …/older` — a vendor call from a
// window maximize, on a room that had never been scrolled. A fold of a quote, a
// day pill's dedupe and a refused picture shrinking to a chip are the same
// clamp. The chat view's rule (2.307.0 — displacement is not intent) applies:
// an upward page needs POSITIVE EVIDENCE of the person's positioning input —
//   · a wheel up (`deltaY < 0`), which ALSO asks directly while already at the
//     top (a room that fits its pane can never dispatch a scroll event, and a
//     room whose page landed at 0 fires none for the next wheel);
//   · a touch move (a finger dragging DOWN at the top = the pull for older);
//   · a keyboard scroll (ArrowUp / PageUp / Home on the focused scroller);
//   · a press on the scrollbar GUTTER, held until the pointer is released (a
//     drag lasts seconds; a press on a row — the fold toggle — is NOT input:
//     that press's own fold is the clamp this rule exists for).
// Input is fresh for INTENT_MS. `prepending` (one page in flight), `listReady`
// (no rebuild in flight) and `historyExhausted` (the vendor said so since the
// last rebuild — a wheel held at the top is not a fetch per event) all refuse.
//
// THE INPUT ON RECORD IS TOWARD OLDER, AND A CLAMP SHRINKS THE ROOM (verify
// round 4, 2026-09-27). Round 3 recorded EVERY wheel, so a wheel DOWN at the
// bottom followed by a maximize inside INTENT_MS paged — and POSTed /older —
// on the clamp the maximize made (reproduced with trusted input: 200 ms apart
// a vendor call, 1.7 s apart none). Two rules close the class:
//   · only input that moves toward OLDER is on record — a wheel up, a finger
//     moving down, an up key (ArrowUp / PageUp / Home), a press on the gutter;
//   · a scroll event whose ROOM (scrollHeight − clientHeight) is SMALLER than
//     the room the input saw is a clamp, never a scroll: the browser clamps
//     scrollTop only when the room shrinks (a maximize that lets the content
//     fit, a fold, a day pill's dedupe, a picture becoming a chip), while a
//     scroll — and our own prepend, which GROWS the room — never shrinks it.
//     So a clamp inside the window of a real wheel up is refused too.
// An up key at the top asks directly, like a wheel up: a room already at 0
// dispatches no scroll event for the key.
//
// A SCROLL EVENT ON A ROOM THAT FITS ITS PANE IS A CLAMP (verify round 5,
// 2026-09-27). Round 4's rule compared rooms with "<": an input made on a room
// of 0 (the content fits — it paged DIRECTLY, the honest ask), our own prepend
// grew the room, and a maximize 300 ms later let the content fit again — the
// clamp back to 0 arrived on a room EQUAL to the input's, not smaller, and
// POSTed /older (reproduced 2/2 with trusted input; 1.7 s later nothing). On
// a room ≤ TOP_PX the person's own acts (a wheel, a pull, a key) ask directly
// and a scroll event can only be a clamp or a set — refused `no-room`.
//
// A KEY TYPED IN A TEXT FIELD IS TYPING, NEVER POSITIONING (verify round 5):
// the inline proposal card — its Reject reason box, its Edit textarea — lives
// INSIDE the list, and ArrowUp / Home there bubbled to the list's keydown: on
// a room that fits its pane (always "at the top") one caret key POSTed /older.
// `isTypingTarget` names the elements the browser scrolls nothing for.
//
// THE CENSUS CLOSED (verify round 6, 2026-09-27) — every way scrollTop reaches
// the top without a person paging was enumerated (the table in
// test-channel-blocks ⑮ names each with the facts it produces) and the two
// left open were reproduced with trusted input:
//   · A MODIFIER WHEEL IS NOT A SCROLL: Ctrl+wheel (the browser's zoom; a
//     trackpad pinch arrives exactly so) and Shift+wheel (a horizontal scroll
//     on every platform) move the list nowhere, yet both were recorded as a
//     wheel up and, at the top, POSTed /older — `wheelTowardOlder` takes only
//     a plain vertical wheel up.
//   · A NESTED SCROLLER'S OWN SCROLLING IS NOT THE LIST'S: a code block over
//     360 px (`.chanblk-pre`, overflow auto) and an edit box scroll INSIDE a
//     row; a wheel up, a finger pulled down and an up key there scroll the
//     block, not the list — on a fitting room (always "at the top") each of
//     the four POSTed /older (4/4). `nestedScrollTop` reads the scrollers
//     between the event's target and the list: one that can still scroll UP
//     owns the input (the browser gives it the wheel first); at its top the
//     input chains to the list and is the list's (the honest converse).
//   · A PAGE THAT LANDS NOTHING HOLDS: a vendor answer with no records and not
//     `exhausted`, or a refusal (the server's floor, the budget), leaves the
//     reader at the top with nothing prepended — every further scroll / wheel
//     event at the top asked AGAIN (2 POSTs for one Home key; one per event
//     for a held wheel). `holdUntilAfter` names how long the window stays
//     quiet (`held`), the refusal's own wait when it names one; the toast
//     shows once per hold. The server keeps its own belt (drain rule 19).
/** Input this fresh is the person's own positioning (the chat view's window). */
export const INTENT_MS = 1500;
/** After a page that landed nothing (or a refusal naming no wait) the window asks nothing for this long. */
export const HOLD_MS = 1500;
/** The longest a refusal's own wait holds the window (a vendor's "try again in 60 s"). */
export const HOLD_MAX_MS = 60_000;
/** "At the top" (the browser lands a clamp at 0; a touch overscroll settles within a pixel or two). */
export const TOP_PX = 4;
/** A finger has to move this far DOWN at the top before it is the pull for older. */
export const PULL_PX = 20;
/** Sticking to the newest: this close to the bottom is "at the tail" (the append's own rule). */
export const TAIL_PX = 40;

/** Was this pointer press on the vertical scrollbar gutter (right of the client box; RTL not modelled)? */
export function isGutterPress({ clientX, left, clientWidth } = {}) {
  const x = Number(clientX), l = Number(left), w = Number(clientWidth);
  if (![x, l, w].every(Number.isFinite)) return false;
  return x >= l + w;
}

/** Fresh input = an act within INTENT_MS, or a gutter drag still held. */
export function inputFresh({ inputAt = 0, now = 0, gutterDrag = false } = {}) {
  if (gutterDrag) return true;
  const at = Number(inputAt) || 0;
  return at > 0 && (Number(now) - at) < INTENT_MS;
}

/** The keys that move the view toward OLDER (the only keys on record; `key` is a KeyboardEvent's `key`). */
export const UP_KEYS = Object.freeze(['ArrowUp', 'PageUp', 'Home']);
export const isUpKey = (key) => UP_KEYS.includes(String(key));

/** The input types a key press acts INSIDE (a caret, a value) — the browser scrolls no ancestor for them. */
const BUTTON_INPUT_TYPES = Object.freeze(['button', 'submit', 'reset', 'checkbox', 'radio', 'image', 'file']);
/** Is a key pressed on this element typing (a text field, a select, an editable region) rather than a
 *  positioning act on the list? `tagName` an element's, `type` an input's `type`, `editable` its
 *  `isContentEditable`. A button, a link or the list itself hands the key to the browser's scrolling. */
export function isTypingTarget({ tagName = '', type = '', editable = false } = {}) {
  const tag = String(tagName || '').toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') return !BUTTON_INPUT_TYPES.includes(String(type || 'text').toLowerCase());
  return !!editable;
}

/** Is this wheel event a plain vertical wheel UP (input toward older)? A Ctrl wheel is the browser's zoom (a
 *  trackpad pinch arrives as one), a Shift wheel a horizontal scroll: neither moves the list. `innerScrollTop`
 *  = `nestedScrollTop` of the scrollers between the target and the list — one that can still scroll up owns it. */
export function wheelTowardOlder({ deltaY = 0, ctrlKey = false, shiftKey = false, innerScrollTop = 0 } = {}) {
  if (!(Number(deltaY) < 0)) return false;
  if (ctrlKey || shiftKey) return false;
  return !(Number(innerScrollTop) > 0);
}

/** The scroll offset of the innermost NESTED scroller (a code block over its max-height, an edit box) that can
 *  still scroll UP, over the boxes between an event's target and the list (each `{scrollTop, scrollHeight,
 *  clientHeight}`, innermost first); 0 when none can — the input chains to the list and is the list's. */
export function nestedScrollTop(boxes = []) {
  let top = 0;
  for (const b of Array.isArray(boxes) ? boxes : []) {
    if (!b) continue;
    const sh = Number(b.scrollHeight) || 0, ch = Number(b.clientHeight) || 0, st = Number(b.scrollTop) || 0;
    if (sh - ch > 1 && st > 0) top = Math.max(top, st);
  }
  return top;
}

/** How long the window holds after a page's answer: a REFUSAL holds for the wait it names (at least HOLD_MS, at
 *  most HOLD_MAX_MS); a page that landed NOTHING and is not the end holds HOLD_MS (nothing was prepended, the reader
 *  is still at the top, and the next event would ask again); a page that landed rows or the end holds nothing (0). */
export function holdUntilAfter({ now = 0, refused = null, retryAfterMs = 0, retryAfterSec = 0, landed = 0, exhausted = false } = {}) {
  const t = Number(now) || 0;
  if (refused) {
    const named = Math.max(Number(retryAfterMs) || 0, (Number(retryAfterSec) || 0) * 1000);
    return t + Math.min(HOLD_MAX_MS, Math.max(HOLD_MS, named));
  }
  if (!(Number(landed) > 0) && !exhausted) return t + HOLD_MS;
  return 0;
}

/**
 * THE VERDICT. `cause` = 'scroll' (a scroll event at the top), 'wheel' (a wheel up
 * seen at the top), 'pull' (a touch drag down at the top), 'key' (an up key
 * pressed at the top). `room` = scrollHeight − clientHeight now; `roomAtInput` =
 * the same when the input on record was made (null = none recorded). Returns
 * `{page:true}` or `{page:false, why}` with a named reason — `top` (not at the
 * top), `no-input` (displacement, never intent), `shrunk` (the room shrank since
 * the input: a clamp), `no-room` (a scroll event on a room that fits its pane —
 * a clamp or a set, never the person's scroll), `busy` (a page in flight),
 * `not-ready` (a rebuild in flight), `exhausted` (nothing older here or at the
 * vendor since the last rebuild), `held` (the last page landed nothing or was
 * refused: quiet until `holdUntil`, whatever the cause), `cause` (an unknown cause).
 */
export function pageUpVerdict({ cause = 'scroll', scrollTop = 0, prepending = false, listReady = true, historyExhausted = false, inputAt = 0, now = 0, gutterDrag = false, room = 0, roomAtInput = null, holdUntil = 0 } = {}) {
  if (cause !== 'scroll' && cause !== 'wheel' && cause !== 'pull' && cause !== 'key') return { page: false, why: 'cause' };
  if (!(Number(scrollTop) <= TOP_PX)) return { page: false, why: 'top' };
  if (!listReady) return { page: false, why: 'not-ready' };
  if (prepending) return { page: false, why: 'busy' };
  if (historyExhausted) return { page: false, why: 'exhausted' };
  // round 6: a page that landed nothing / a refusal holds the window — the reader is still at the top and every
  // further event would ask again (2 POSTs for one Home key; one per event for a held wheel)
  if (Number(holdUntil) > 0 && Number(now) < Number(holdUntil)) return { page: false, why: 'held' };
  // a wheel up / a pull / an up key IS the input; a scroll event needs one on record
  if (cause === 'scroll' && !inputFresh({ inputAt, now, gutterDrag })) return { page: false, why: 'no-input' };
  // …and must be a scroll, not a clamp: the room the input saw did not shrink (round 4)
  if (cause === 'scroll' && roomAtInput !== null && roomAtInput !== undefined && Number.isFinite(Number(roomAtInput)) && Number(room) < Number(roomAtInput)) return { page: false, why: 'shrunk' };
  // …and a room that fits its pane dispatches no scroll of the person's at all (round 5): the input there asked
  // directly; what arrives as a scroll event is the clamp of a resize (a maximize after our own prepend) or a set
  if (cause === 'scroll' && Number(room) <= TOP_PX) return { page: false, why: 'no-room' };
  return { page: true };
}

/** At the tail = within TAIL_PX of the bottom (a list that fits its pane is at its tail). */
export function atTail({ scrollHeight = 0, scrollTop = 0, clientHeight = 0 } = {}) {
  return (Number(scrollHeight) - Number(scrollTop) - Number(clientHeight)) < TAIL_PX;
}
