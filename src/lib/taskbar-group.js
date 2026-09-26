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

/** A key on the focused grouped button → 'activate' | 'chooser' | null (not ours). */
export function groupKeyVerdict({ key = '', inFront = false } = {}) {
  if (key === 'Enter' || key === ' ' || key === 'Spacebar') return groupClickVerdict({ inFront, pointerType: '' });
  if (key === 'ArrowUp') return 'chooser';
  return null;
}
