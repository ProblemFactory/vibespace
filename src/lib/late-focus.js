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
//
// THE DEFAULT IS SAFE (r671 + r673): an open whose start nobody HANDED it never takes the keys out of a field the person is in (a
// typing field, an editable region, a terminal's input, an embedded frame — outside the opening window), whatever the clock says. A
// start is ONE fact, { at, by }: by 'act' — the open is made inside the act a person is doing right now (the page's current event, a
// person's input kind, trusted: its own instant is the start), by 'road' — a road read the start at the person's press and carried
// it across its wait, or by null — nobody handed one (read where the open is made, or a bare number: the safe default). A handed start
// keeps the clock rule exactly: a press or a key elsewhere after it drops the late focus. THE RESIDUE, in plain words: a road that
// waits on something a person's LATER press settles (a confirm) continues inside that press and takes it as its start — right for a
// confirm (so «Resume anyway» comes out right), wrong only for a road whose wait an unrelated press settles; none is known. Where
// the page's current event is not to be had (a browser that does not expose window.event), the open falls to the safe default.
// Gate: scripts/test-late-focus.mjs (the verdict's table, the census of every focus after an await, a red control per site kind) and
// the heavy test-late-focus-chrome (a window opened, another window clicked while it opens, typed: where the text went).
import { lateFocusVerdict, lateFocusTakes, actOpenStart, fieldHoldsKeys } from './keyboard-yield.js';
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

/** the page's current event — the one the browser dispatches right now (window.event: none across an await or a timer; none at all in
 *  a browser that does not expose it — such an open falls to the safe default) */
const currentEvent = () => { try { return typeof window !== 'undefined' ? window.event : undefined; } catch { return undefined; } };
/** a start as the ONE fact { at, by } (by 'act' | 'road' | null); a bare number is a start nobody vouches for (by null) */
export const asStart = (s) => (s && typeof s === 'object' && Number.isFinite(s.at) ? { at: s.at, by: s.by === 'act' || s.by === 'road' ? s.by : null } : Number.isFinite(s) ? { at: s, by: null } : null);
/** B-c87d r673: a start read NOW — the person's act being dispatched (its instant, by 'act'), else the clock with nobody's hand on it */
export function startNow() { return actOpenStart(currentEvent(), pageClock()) || { at: openClock(), by: null }; }
/** B-c87d r673 — THE START A MAKER (the create, the attach) OPENS AT: nobody on this page started it ⇒ the page's start, unhanded;
 *  made inside a person's act now ⇒ that act's instant (a confirm's press continues its road — the residue above); else the start a
 *  road handed (`given`, carried from the person's press: by 'road'), else a desktop switch's replay span's; else the clock, unhanded */
export function openStart(app, { quiet = false, given = null } = {}) {
  if (unattendedOpen(app, quiet)) return { at: PAGE_START, by: null };
  const act = actOpenStart(currentEvent(), pageClock());
  if (act) return act;
  const g = asStart(given) || asStart(app?._replayStart);
  if (g) return { at: g.at, by: g.by ? 'road' : null };
  return { at: openClock(), by: null };
}

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

/** did the act `a` ({ target, part } — lastPersonAct) land inside `win`? Where it landed, or — when the open REMOVED it before the door
 *  was asked (the window's own «Connecting…» body the person clicked, r558) — the window part it landed in: that window's content, or
 *  its frame */
export function actInside(win, a) {
  if (!win || !a) return false;
  if (insideWindow(win, a.target)) return true;
  return !!a.part && (a.part === win.content || (!!win.element && a.part === win.element));   // another tab's content is another part
}

/** the door's question alone — may a late focus of `win` (opened at `since`) take the keys now? — for a view that asks before it
 *  focuses itself (xpra-view's `mayFocus` on connect): the same verdict, the same stamps, the same dialog rule */
/** a field a person TYPES into (its keys are theirs): a text box, a text area, an editable region (a terminal's input is a text area),
 *  or an embedded frame */
export function isTypingField(el) {
  if (!el || typeof el !== 'object') return false;
  const tag = String(el.tagName || '').toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'IFRAME' || el.isContentEditable === true) return true;
  return tag === 'INPUT' && !/^(button|checkbox|radio|range|file|submit|reset|image|color|hidden)$/i.test(String(el.type || 'text'));
}

export function mayTakeKeys({ win = null, since = PAGE_START } = {}) {
  try { if (lateFocusVerdict(document.querySelectorAll(DIALOG_ROOTS), document.activeElement) !== 'take') return false; } catch { return false; }
  // a press INTO an embedded page (the browser window, a plugin's panel, a viewer) is never stamped by the page's listeners: the keys
  // stand in that frame — if it lies outside the opening window, the late focus drops (r364)
  const ae = document.activeElement;
  if (ae && String(ae.tagName || '').toUpperCase() === 'IFRAME' && !insideWindow(win, ae)) return false;
  const s = asStart(since) || { at: PAGE_START, by: null }, a = lastPersonAct();
  // the field the person is in, outside the opening window — only one still in the page and drawn (r871: a hidden or gone field is no field)
  const field = !!ae && fieldHoldsKeys({ typing: isTypingField(ae), connected: ae.isConnected !== false, drawn: typeof ae.getClientRects === 'function' ? ae.getClientRects().length > 0 : true, inside: insideWindow(win, ae) });
  return lateFocusTakes({ since: s.at, handed: !!s.by, field, act: a ? { at: a.at, inside: actInside(win, a) } : null }) === 'take';
}

/** THE DOOR. `view` = what takes the keys (a ChatView, a TerminalSession, a box — anything with focus()); `win` = the opening window
 *  (a winInfo, or { content: <element> } for a part of one); `since` = when its open began — the ONE fact { at, by } a maker passes
 *  (openStart / startNow), or a bare number nobody vouches for (the safe default). → true when it took the keys. */
export function lateFocus(view, { win = null, since = PAGE_START } = {}) {
  if (!view || typeof view.focus !== 'function' || !mayTakeKeys({ win, since })) return false;
  view.focus();
  return true;
}
