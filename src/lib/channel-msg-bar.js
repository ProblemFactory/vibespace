// THE MESSAGE ACTION BAR (lane reaction-hover, 2026-10-01; the rules: PURE src/lib/msg-bar-model.js). ONE small bar per
// message — add a reaction · reply in thread · quote (an agent group's row: its ⋯ menu) — an OVERLAY at the message's
// right edge, centred on its head line, shown while the pointer rests on the message, while the keyboard is inside the
// bar, or while the bar's picker is open. It is never in the flow: the message's height and the next message's place
// are the same with the bar shown or hidden (the old `+` took a line under every message). Lark's own shape.
//
//   · The buttons are the icon library's SVG (`icon()` — never a text "+" / "⋯"), each named by `title` + aria-label.
//   · A WAI-ARIA toolbar: ONE tab stop per bar (the first button; the rest -1), ← → Home End move inside it — the same
//     one stop per message the old `+` was. Focus inside the bar shows it (CSS :focus-within).
//   · A press on a button never reaches the row (stopPropagation) — the body's links, the quote fold, the thread chip
//     keep their own clicks (the bar covers only its own box, and only while shown).
//   · The phone has no hover: the bar is not drawn there (CSS). A long press on the WORDS is the platform's selection
//     (press-select.js), so a … button (`renderMsgMore`, touch-first devices only) opens the SAME actions + Copy text as
//     a menu (`msgActionMenu`); a long press on the row's chrome (the avatar, the head) still opens it too.
//   · `syncMsgBar` patches a drawn bar IN PLACE when the conversation's offers change (keyed by `data-act`), never a
//     rebuilt row.
import { t } from './i18n.js';
import { icon } from './channel-chrome.js';
import { showContextMenu } from './utils.js';
import { barKeyStep, TOUCH_QUERY } from './msg-bar-model.js';

const GLYPH = Object.freeze({ react: 'emojiAdd', thread: 'thread', quote: 'quote', more: 'more' });

/** The bar of a row (its direct child), or null. */
export const barOf = (row) => (row ? row.querySelector(':scope > .chanmsg-bar') : null);

function buttonOf(a, i) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'chanmsg-bar-btn' + (a.cls ? ' ' + a.cls : '');
  b.dataset.act = a.id;
  b.tabIndex = i === 0 ? 0 : -1;
  b.appendChild(icon(GLYPH[a.id] || 'more', 14));
  spell(b, a);
  if (a.run) b.addEventListener('click', (ev) => { ev.stopPropagation(); ev.preventDefault(); a.run(b); });
  return b;
}
function spell(b, a) {
  const title = a.title || a.label;
  if (b.title !== title) b.title = title;
  if (b.getAttribute('aria-label') !== a.label) b.setAttribute('aria-label', a.label);
}

/**
 * THE BAR for one row: `acts` = [{id, label, title?, cls?, run?(button)}] in the bar's order → the toolbar element, or
 * null when the row offers nothing. A button without `run` leaves its click to a delegated handler (the group window's ⋯).
 */
export function renderMsgBar(acts) {
  if (!Array.isArray(acts) || !acts.length) return null;
  const bar = document.createElement('div');
  bar.className = 'chanmsg-bar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', t('Message actions'));
  bar.dataset.acts = acts.map((a) => a.id).join(' ');
  acts.forEach((a, i) => bar.appendChild(buttonOf(a, i)));
  bar.addEventListener('keydown', (ev) => {
    const btns = [...bar.querySelectorAll(':scope > .chanmsg-bar-btn')];
    const j = barKeyStep(ev.key, btns.indexOf(document.activeElement), btns.length);
    if (j === null) return;
    ev.preventDefault(); ev.stopPropagation();   // the list's own keys (PageUp / Home paging) never see the bar's arrows
    btns.forEach((b, k) => { b.tabIndex = k === j ? 0 : -1; });
    btns[j].focus();
  });
  return bar;
}

/** SYNC a drawn row's bar to `acts` IN PLACE: the same actions ⇒ only the words re-spelled; a different set ⇒ the bar's
 *  buttons replaced (the bar node kept); none ⇒ the bar removed; a row without one grows it (after its last child). */
export function syncMsgBar(row, acts) {
  if (!row) return null;
  let bar = barOf(row);
  const ids = (acts || []).map((a) => a.id).join(' ');
  if (!ids) { if (bar) bar.remove(); return null; }
  if (!bar) { bar = renderMsgBar(acts); row.appendChild(bar); return bar; }
  if (bar.dataset.acts === ids) {
    const btns = bar.querySelectorAll(':scope > .chanmsg-bar-btn');
    acts.forEach((a, i) => { if (btns[i]) spell(btns[i], a); });
    return bar;
  }
  const fresh = renderMsgBar(acts);
  bar.replaceChildren(...fresh.childNodes);
  bar.dataset.acts = ids;
  return bar;
}

/** Keep the bar shown while a popover it opened is up (the picker anchored to its button), and give the keyboard back
 *  to that button when the popover closes with the focus inside it (Esc — the `data-popover` protocol). */
export function holdBarOpen(button, pop) {
  const bar = button && button.closest('.chanmsg-bar');
  if (!bar || !pop) return;
  bar.classList.add('open');
  const done = () => {
    bar.classList.remove('open');
    mo.disconnect();
    const a = document.activeElement;
    if (button.isConnected && (!a || a === document.body)) button.focus({ preventScroll: true });
  };
  const mo = new MutationObserver(() => { if (!pop.isConnected) done(); });
  mo.observe(pop.parentNode || document.body, { childList: true });
}

/** A touch-first device NOW (the … button is created only there; CSS draws it only there). */
export const isTouchFirst = () => !!(typeof matchMedia === 'function' && matchMedia(TOUCH_QUERY).matches);

/** THE TOUCH DOOR (lane channel-touch-menu, 2.369.203 — the chat's … of lane mobile-select): a button in the bar's
 *  corner (CSS: the row keeps a 44 px right gutter, so it covers no words), the library's SVG, named. `onOpen(button)`
 *  opens the menu at it; none = a delegated click (the group window's `.chanmsg-more`). */
export function renderMsgMore(onOpen, cls = '') {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'chanmsg-tmore' + (cls ? ' ' + cls : '');
  b.title = t('Message actions');
  b.setAttribute('aria-label', t('Message actions'));
  b.appendChild(icon('more', 16));
  if (onOpen) b.addEventListener('click', (ev) => { ev.stopPropagation(); ev.preventDefault(); onOpen(b); });
  return b;
}

/** THE PHONE'S DOOR (and a right click on a desktop): the row's SAME actions as a menu at the press. `anchor` = what a
 *  picker opened from the menu anchors to (the message's head line). */
export function msgActionMenu(x, y, acts, anchor) {
  if (!Array.isArray(acts) || !acts.length) return null;
  return showContextMenu(x, y, acts.map((a) => ({ label: a.label, action: () => a.run && a.run(anchor) })));
}
