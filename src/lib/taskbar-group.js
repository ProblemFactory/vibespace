// A GROUPED TASKBAR BUTTON — THE DECISIONS (lane K, 2026-09-25; the owner, on a
// taskbar button reading "VibeSpace 主开发 · 2 windows grouped" whose every click
// popped a two-row chooser instead of doing anything: "这个体验比较差").
// PURE (imports nothing, DOM-free): the taskbar (src/lib/taskbar.js) reads the
// world and asks these; scripts/test-taskbar-group.mjs pins the tables with a
// patched-copy control (the old always-chooser click).
//
//   CLICK  = ACTIVATE the group (restore + focus + raise its host showing the tab
//            already active) — unless the group is ALREADY IN FRONT, then the
//            click is the CHOOSER (so keyboard and touch always reach the list).
//            Every pointer type gets the same rule; an open hover chooser does
//            not change it (a click on a group behind activates and closes it;
//            in front it keeps the chooser, pinned). A click that arrives while a
//            drag is in progress is the drag's release, never an act.
//   HOVER  = the same chooser after GROUP_HOVER_INTENT_MS of intent, on a fine
//            pointer only — never on touch, never during a drag, never while
//            another popover or menu is open. It is non-modal and closes
//            GROUP_HOVER_LEAVE_MS after the pointer leaves the button + chooser.
//            The intent is armed by MOVEMENT over the button, once per visit;
//            a press spends the visit until the pointer leaves (hoverStep).
//   KEYS   = Enter / Space on the focused button = the click rule; ArrowUp =
//            the chooser.
// A single (ungrouped) button asks none of this — its click is unchanged.

/** Hover intent before the chooser opens (the gear flyout's 120 ms is a menu
 *  already open; a taskbar button is crossed on the way to its neighbours). */
export const GROUP_HOVER_INTENT_MS = 300;
/** Grace after the pointer leaves the button + chooser (covers the gap between them). */
export const GROUP_HOVER_LEAVE_MS = 250;

/** Is the group in front: its host (or one of its tabs) is the focused window,
 *  not minimized, on the desktop being shown. */
export function inFrontOf({ focusedId, hostId, tabIds = [], minimized = false, sameDesktop = true } = {}) {
  if (minimized || !sameDesktop || !focusedId || !hostId) return false;
  return focusedId === hostId || (Array.isArray(tabIds) && tabIds.includes(focusedId));
}

/** A click (any pointer type, or the keyboard's '' ) on a grouped button →
 *  'activate' | 'chooser' | 'none' (a drag's release). */
export function groupClickVerdict({ inFront = false, pointerType = '', dragging = false, popoverOpen = false } = {}) {
  void pointerType; void popoverOpen; // the SAME rule for every pointer and with or without an open hover chooser (the table pins it)
  if (dragging) return 'none';
  return inFront ? 'chooser' : 'activate';
}

/** Hover on a grouped button → 'open' | 'wait' (intent not yet met) | 'never'.
 *  `popoverOpen` = ANOTHER popover or menu (not this group's own hover chooser). */
export function hoverVerdict({ pointerFine = false, touch = false, dragging = false, popoverOpen = false, intentMs = 0 } = {}) {
  if (!pointerFine || touch || dragging || popoverOpen) return 'never';
  return intentMs >= GROUP_HOVER_INTENT_MS ? 'open' : 'wait';
}

/** THE HOVER VISIT (2026-09-26, found by the load construction of the 2.369.183 pen-leg red): a hover intent is
 *  ARMED ONLY BY A POINTER MOVING over the button, at most ONCE per visit, and a press SPENDS the visit until the
 *  pointer leaves. A bare `pointerenter` is never an arrival: Chrome also dispatches one when it re-targets a RESTING
 *  pointer — the taskbar rebuilt the button under it (a tab title change re-keys the structure), or its hover
 *  recompute after a layout change moved the MOUSE pointer to where a pen rests — and no pointermove comes with it
 *  (measured: a click, then a title change, then 300 ms of rest grew the hover chooser 5 of 5, every time, the
 *  rebuilt button's fresh closure having forgotten the press). `spent` belongs to the GROUP (its host id), never to
 *  one button element, so a rebuilt button inherits it; a leave of the live button ends the visit — and so does
 *  'away', a pointer MOVING anywhere but this group's button (the pointer that left while the button was being
 *  rebuilt: the detached element gets no pointerleave and the new one no enter; measured in the heavy leg (o), a
 *  park right after a rebuild kept the visit spent and the next genuine arrival never armed).
 *  → { spent, act: 'arm' | 'cancel' | null } (event: 'move' | 'press' | 'leave' | 'away' | 'enter' | anything else). */
export function hoverStep({ spent = false } = {}, event = '') {
  if (event === 'move') return spent ? { spent: true, act: null } : { spent: true, act: 'arm' };
  if (event === 'press') return { spent: true, act: 'cancel' };
  if (event === 'leave') return { spent: false, act: 'cancel' };
  if (event === 'away') return { spent: false, act: null }; // the live button's own timer is ended by its own leave
  return { spent: !!spent, act: null }; // 'enter' (and anything else) arms nothing and ends nothing
}

/** A key on the focused grouped button → 'activate' | 'chooser' | null (not ours). */
export function groupKeyVerdict({ key = '', inFront = false } = {}) {
  if (key === 'Enter' || key === ' ' || key === 'Spacebar') return groupClickVerdict({ inFront, pointerType: '' });
  if (key === 'ArrowUp') return 'chooser';
  return null;
}
