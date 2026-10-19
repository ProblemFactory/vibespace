// THE PHONE'S BACK GESTURE (lane mobile-back-guard, 2026-10-18 — the owner: 「在手机版上能不能 block 一下那个返回手势啊？
// 我有时候不小心返回返回着，就多返回了几下」). On a phone the edge swipe is the BROWSER's history back, so before this
// every swipe left VibeSpace. PURE (imports nothing, DOM-free): what one back press does, decided from a snapshot the
// wiring (src/lib/mobile-back.js) reads off the page. The history shape it keeps: ONE sentinel entry
// (`history.state.vs === 1`) above the page's own entry; a back press lands on the page's entry (a popstate) and the
// wiring decides, then steps FORWARD onto the same sentinel with history.go(1) — never a fresh pushState, which
// Chrome's back-button intervention punishes (measured on Chrome 154: a pushState made with no tap since the last one
// marks the entry below skippable, so the NEXT back skipped VibeSpace entirely; a traversal adds no entry and marks
// nothing — docs/kb-patterns.md "The history sentinel").

/** A second back inside this window after the 「再返回一次退出」 toast leaves; later it re-arms. */
export const BACK_WINDOW_MS = 2000;
/** The toast (an i18n key — the wiring translates it). */
export const BACK_TOAST = 'Press back again to exit';
/** A sheet that needs its own close (drafts to stash, state to drop) answers this event on its element and calls
 *  preventDefault(); an unanswered sheet is hidden with the `hidden` class. */
export const BACK_DISMISS_EVENT = 'vs-back-dismiss';

/** Is `state` (history.state) our sentinel? */
export const isSentinel = (state) => !!(state && typeof state === 'object' && state.vs === 1);

/** At boot: 'keep' — a reload or a restored tab landed ON our sentinel (Chrome keeps the entry below same-document
 *  across a reload: measured), so pushing again would stack a second one; 'push' — a phone with the setting on;
 *  'none' — a desktop (its back is never touched) or the setting off. */
export function bootStep({ phone, enabled, state }) {
  if (!phone) return 'none';
  if (isSentinel(state)) return 'keep';
  return enabled === false ? 'none' : 'push';
}

/** What one back press closes, topmost first — Esc's order (every [data-popover] float, then a dialog), then the
 *  phone's own layers: the window switcher, a sheet (the For-you tray, the usage popup), the sidebar's drill-down (its
 *  ‹ back row), the window area (it yields to HOME). null = at home: nothing to close.
 *  HOME (lane phone-first-screen, design q-044 decision 5): the attention page when the attention list has a row on its
 *  first screen (`homeRows`), else the sidebar (the conversation list) — so with rows, an open sidebar is one layer
 *  above home ('sidebar': it closes, back to what it covered); `home` = the attention page is on show (at home). */
export function backTarget({ popover = false, dialog = false, switcher = false, sheet = false, sidebarOpen = false, drilldown = false, home = false, homeRows = false } = {}) {
  if (popover) return 'popover';
  if (dialog) return 'dialog';
  if (switcher) return 'switcher';
  if (sheet) return 'sheet';
  if (sidebarOpen) return drilldown ? 'drilldown' : homeRows ? 'sidebar' : null;
  if (home) return null;
  return 'window';
}

/** The verdict for one back press that landed on the page's entry.
 *  in:  phone, enabled (the Mobile setting), target (backTarget's answer: closable = a target, atHome = null),
 *       lastBackAt / now (ms — the last 'arm'), deepLinkFirst (the page was opened by a `?` link and this is the
 *       first back since boot: the window that link opened is what the person came for, so the press closes no window
 *       — it arms, then the same rule; a menu or dialog they opened since still closes first).
 *  out: { action, toast } — action is 'none' | 'close' | 'arm' | 'leave', toast is BACK_TOAST or null:
 *       none  — a desktop: not ours (no sentinel is ever pushed there)
 *       close — close / yield the target, step back onto the sentinel
 *       arm   — the toast; stay on the page's entry for BACK_WINDOW_MS so the next back is the browser's own (it
 *               leaves even when VibeSpace is the tab's first page, where a script's history.back() does nothing),
 *               then step back onto the sentinel
 *       leave — a back while armed that still reached us, or the setting turned off: keep going back */
export function backVerdict({ phone = true, enabled = true, target = null, lastBackAt = 0, now = 0, deepLinkFirst = false } = {}) {
  if (!phone) return verdict('none');
  if (enabled === false) return verdict('leave');
  if (target && !(deepLinkFirst && target === 'window')) return verdict('close');
  if (lastBackAt > 0 && now >= lastBackAt && now - lastBackAt < BACK_WINDOW_MS) return verdict('leave');
  return verdict('arm', BACK_TOAST);
}
const verdict = (action, toast = null) => ({ action, toast });
