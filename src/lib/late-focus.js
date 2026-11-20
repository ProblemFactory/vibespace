// THE LATE-FOCUS DOOR (B-c87d, the coordinator's law, 2026-11-20): THE KEYBOARD STAYS WHERE THE PERSON LAST PUT IT.
// A window that finishes opening — re-attaching, restoring, an upload or a lease answered — takes the keys only if the person has
// done nothing ELSEWHERE since that open began: no press, no key of theirs outside the opening window. A late focus that lost that
// race is DROPPED, never queued: the window is drawn, and the person's next press into it gives it the keys.
//
// ONE door for every focus that lands after an await (the session answers, the composer's picture add, the terminal's paste roads,
// the desktop app's take-over, the link door's other-desktop go-to, a replay's focus): each calls `lateFocus(view, { win, since })`
// with the window it opens and the moment its open began (`openClock()` read when the person's act started it — the act that STARTED
// an open lies before that moment, so a person who opens a window and does nothing else gets its keys, as before). A boot restore or
// a replay (nobody on this page started it) passes `since: PAGE_START`: it takes the keys only while the person has not acted on the
// page since it loaded. The decision is PURE (keyboard-yield.js lateFocusTakes); the person's acts are the page's own stamps (utils.js
// lastPersonAct — the two capture listeners, no listener of this door's own); an open app dialog keeps the keys first (lateFocusVerdict).
// Gate: scripts/test-late-focus.mjs (the verdict's table, the census of every focus after an await, a red control per site kind) and
// the heavy test-late-focus-chrome (a window opened, another window clicked while it opens, typed: where the text went).
import { lateFocusVerdict, lateFocusTakes } from './keyboard-yield.js';
import { DIALOG_ROOTS } from './form-yield.js';
import { lastPersonAct, pageClock } from './utils.js';

/** the start of everything this page did: a replay's or a boot restore's `since` */
export const PAGE_START = 0;
/** the moment an open begins, on the page's clock (read it where the person's act starts the open, BEFORE any await) */
export const openClock = () => pageClock();
/** B-c87d (r364 MUST 1): «NOBODY ON THIS PAGE STARTED IT» is a FACT of the page, never read off an id an open reuses (a pressed resume
 *  carries its row's id; a preset the person loads carries `machine`): the layout's boot restore while it runs (`_bootRestoring` — the
 *  splash covers the page; never `_booting`, whose 5 s autosave tail follows the splash, when the person's own presses open windows), a record from another
 *  device being applied (`_applying`), or an open nobody pressed (`quiet` — an unattended resume, a page following it, an agent's
 *  open). Such an open starts at PAGE_START; every other one starts NOW, so the person's act that started it counts as inside it. */
export const unattendedOpen = (app, quiet = false) => !!quiet || !!app?.layoutManager?._bootRestoring || !!app?.layoutManager?._applying;

/** is `target` inside the opening window `win` itself — its own content or its frame's chrome, never another tab's content in the
 *  same frame (a tab group's host element holds every member's content) */
export function insideWindow(win, target) {
  if (!win || !target || typeof target !== 'object') return false;
  // its OWN taskbar item is inside it (raising the window while it opens is no act elsewhere — r364); a group's item names its tabs
  const item = typeof target.closest === 'function' ? target.closest('[data-win-id]') : null;
  if (item && win.id != null && item.dataset && (item.dataset.winId === String(win.id) || String(item.dataset.groupTabs || '').split(',').includes(String(win.id)))) return true;
  const el = win.element || null, content = win.content || null;
  if (content && typeof content.contains === 'function' && content.contains(target)) return true;
  if (!el || typeof el.contains !== 'function' || !el.contains(target)) return false;
  const other = typeof el.querySelectorAll === 'function' ? [...el.querySelectorAll('.window-content')].some((c) => c !== content && c.contains(target)) : false;
  return !other;
}

/** the door's question alone — may a late focus of `win` (opened at `since`) take the keys now? — for a view that asks before it
 *  focuses itself (xpra-view's `mayFocus` on connect): the same verdict, the same stamps, the same dialog rule */
export function mayTakeKeys({ win = null, since = PAGE_START } = {}) {
  try { if (lateFocusVerdict(document.querySelectorAll(DIALOG_ROOTS), document.activeElement) !== 'take') return false; } catch { return false; }
  // a press INTO an embedded page (the browser window, a plugin's panel, a viewer) is never stamped by the page's listeners: the keys
  // stand in that frame — if it lies outside the opening window, the late focus drops (r364)
  const ae = document.activeElement;
  if (ae && String(ae.tagName || '').toUpperCase() === 'IFRAME' && !insideWindow(win, ae)) return false;
  const a = lastPersonAct();
  return lateFocusTakes({ since, act: a ? { at: a.at, inside: insideWindow(win, a.target) } : null }) === 'take';
}

/** THE DOOR. `view` = what takes the keys (a ChatView, a TerminalSession, a box — anything with focus()); `win` = the opening window
 *  (a winInfo, or { content: <element> } for a part of one); `since` = when its open began. → true when it took the keys. */
export function lateFocus(view, { win = null, since = PAGE_START } = {}) {
  if (!view || typeof view.focus !== 'function' || !mayTakeKeys({ win, since })) return false;
  view.focus();
  return true;
}
