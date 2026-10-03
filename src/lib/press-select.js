// PURE (imports nothing, DOM-free) — A LONG PRESS ON SELECTABLE TEXT IS A
// SELECTION, NEVER A MENU (lane mobile-select, 2026-10-02; the owner, from a
// tester's phone: "手机模式下想要复制一段chatview里的内容会触发右键菜单导致选择了右键菜单
// 的内容，无法正确选择要复制的内容").
//
// On a phone, selecting text IS a long press: the browser starts its own
// selection on the word under the finger. The product maps every long press to
// `contextmenu` (utils.js installLongPressContextMenu — so every right-click
// menu works on touch), and the chat opened its message menu on any touch
// contextmenu anywhere on a message. MEASURED in Chrome's own touch gesture
// path (the browser-side touch emulator, 390×844 DPR 3, Android UA):
//   +0 ms    pointerdown / touchstart on the paragraph
//   +501 ms  OUR synthetic contextmenu (untrusted) → the chat prevents it and
//            opens the menu, its corner AT THE FINGER
//   +680 ms  the native long press: selectstart (the word is selected) →
//            a TRUSTED contextmenu (pointerType 'touch') → the chat prevents it
//            and opens the menu a second time → selectionchange: the selection
//            sits under the menu, and the next move of the finger lands on it.
// iOS Safari fires no contextmenu on a long press at all — our 500 ms timer is
// the only menu source there, racing iOS's own selection.
//
// THE RULE, decided here and applied at ONE door (installLongPressContextMenu):
// a touch long press on SELECTABLE TEXT (a glyph under the finger whose
// effective user-select is not none) never synthesizes a menu, and a trusted
// touch contextmenu there is stopped before any menu handler sees it — without
// preventDefault, so the platform's selection proceeds. Controls (buttons,
// summaries, menus), padding, gutters and pictures keep the menu. A mouse
// right-click is never judged here. The chat's menu is reachable on touch from
// each message's … button (chat-renderers addMsgMoreBtn).

/** Native long-press behaviour matters here (paste menu, the platform's own selection, the terminal) — the door never
 *  synthesizes a menu on them (the pre-lane exclusion list, now one constant). */
export const NATIVE_PRESS_SELECTOR = 'textarea, input, select, [contenteditable], .xterm';

/** CONTROLS: a long press on one is a menu press even when its words are selectable — a button, a <summary> toggle
 *  (a tool card's Input / Output, Thinking, a long message's preview), a role=button, an open menu or popover. */
export const PRESS_CHROME_SELECTOR = 'button, summary, [role="button"], [role="menuitem"], [data-popover], .context-menu';

/** A finger's centre within this many CSS px of a line of text is ON the text — the gap between two lines (a 13 px
 *  font at line-height 1.6 leaves ~6 px) counts as text, the gutter beside a line does not. */
export const TEXT_SLOP_PX = 6;

/** The effective user-select of an element from its computed values, element first then each ancestor: the first
 *  value that is not `auto` decides (Blink and WebKit report the inherited value, Gecko reports `auto` and resolves it
 *  through the parent — both read the same here). Nothing decided ⇒ 'auto' (selectable). */
export function effectiveUserSelect(values) {
  for (const v of values || []) {
    const s = String(v || '').trim().toLowerCase();
    if (s && s !== 'auto') return s;
  }
  return 'auto';
}

/** Is the point on a line of text? `rects` are the client rects of the text node under the point (one per line
 *  fragment), all in the same viewport px as x / y. */
export function pointOnText(rects, x, y, slop = TEXT_SLOP_PX) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  for (const r of rects || []) {
    if (!r || !(r.right > r.left) || !(r.bottom > r.top)) continue;
    if (x >= r.left - slop && x <= r.right + slop && y >= r.top - slop && y <= r.bottom + slop) return true;
  }
  return false;
}

/** The press target's CLASS from what the DOM half measured:
 *    native      — inside NATIVE_PRESS_SELECTOR
 *    chrome      — a control (PRESS_CHROME_SELECTOR), or no selectable glyph under the finger (padding, gutter, a
 *                  picture, a user-select:none label)
 *    text        — a glyph under the finger and its effective user-select is not none */
export function pressTargetClass({ native = false, chrome = false, overText = false, userSelect = 'auto' } = {}) {
  if (native) return 'native';
  if (chrome) return 'chrome';
  if (overText && String(userSelect || 'auto').toLowerCase() !== 'none') return 'text';
  return 'chrome';
}

/** What a long press / right-click does. device: 'touch' | 'mouse'.
 *    'menu'      — the surface's own contextmenu handlers run (a mouse right-click: ALWAYS — unchanged)
 *    'selection' — touch on selectable text: no menu; the platform selects
 *    'native'    — touch on a text field / the terminal: the platform's own long press (paste menu, …) */
export function longPressVerdict({ device = 'touch', target = 'chrome' } = {}) {
  if (device !== 'touch') return 'menu';
  if (target === 'native') return 'native';
  if (target === 'text') return 'selection';
  return 'menu';
}

/** The other half of a MENU press: the platform's own long press still selects the nearest word when the finger is in
 *  a selectable block (MEASURED: a long press on a chat message's 3 px role strip — our menu at 500 ms, then Chrome's
 *  long press at ~680 ms selected "Answer", and that selection, starting outside the menu, closed it). A menu press is
 *  ONE outcome: while a touch whose verdict is 'menu' is down and an app handler TOOK our contextmenu (`handled` — a menu
 *  is open), `selectstart` is cancelled. Nobody took it (a selectable surface with no menu: the file viewer) ⇒ the
 *  platform selects as before. The door fires our contextmenu AT the platform's selectstart when the platform's long
 *  press comes first (Android's own timeout can be shorter than our 500 ms), so `handled` is known when this is asked.
 *  A text press, a field, a mouse, a second finger: never touched. */
export function selectStartAllowed({ touching = false, verdict = null, handled = false } = {}) {
  return !(touching && verdict === 'menu' && handled);
}

/** A TRUSTED contextmenu (Android's own long press; a mouse right-click) at the door → 'pass' | 'stop' | 'swallow':
 *    pass     — the handlers run as before (a mouse; a menu press our timer has not fired for; a field / the terminal)
 *    stop     — a touch on SELECTABLE TEXT: stopImmediatePropagation, never preventDefault — no handler opens a menu and
 *               the platform's selection handles + Copy bar stay
 *    swallow  — our synthetic one already fired for this press AND a handler took it (a menu is open): preventDefault +
 *               stopImmediatePropagation, so the menu is not built twice (measured: twice, ~180 ms apart); nobody took
 *               ours ⇒ pass (the platform's own long-press menu — save image — keeps working)
 *  facts: touch (a touch is down or pointerType touch), fired, handled, verdict (for THIS event's target and point). */
export function trustedContextMenu({ touch = false, fired = false, handled = false, verdict = 'menu' } = {}) {
  if (!touch) return 'pass';
  if (fired) return handled ? 'swallow' : 'pass';
  if (verdict === 'selection') return 'stop';
  return 'pass';
}

/** M2 — does a SELECTION close an open menu / popover? A selection that starts OUTSIDE a surface wins over it (a stray
 *  selection never runs under a menu the finger then lands on). Facts:
 *    connected    — the surface is still in the document (false ⇒ retire the listener, never close)
 *    touch        — a touch device (a mouse selection already closes it through its own press; desktop unchanged)
 *    collapsed    — the selection is a caret (no text selected)
 *    textAnchor   — the selection's anchor is a TEXT node (a form control's selection anchors on an element; so does
 *                   copyText's off-screen textarea fallback — never a reason to close)
 *    anchorInRoot — the selection starts inside the surface itself
 *    sameAsOpen   — the selection is the one that existed when the surface opened (a word the press itself selected)
 *  → { close, retire } */
export function selectionCloses({ connected = true, touch = false, collapsed = true, textAnchor = false, anchorInRoot = false, sameAsOpen = false } = {}) {
  if (!connected) return { close: false, retire: true };
  if (!touch || collapsed || !textAnchor || anchorInRoot || sameAsOpen) return { close: false, retire: false };
  return { close: true, retire: false };
}
