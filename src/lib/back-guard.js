// THE PHONE'S BACK GESTURE (lane mobile-back-guard, 2026-10-18 — the owner: 「在手机版上能不能 block 一下那个返回手势啊？
// 我有时候不小心返回返回着，就多返回了几下」). On a phone the edge swipe is the BROWSER's history back, so before this
// every swipe left VibeSpace. PURE (imports nothing, DOM-free): what one back press does, decided from a snapshot the
// wiring (src/lib/mobile-back.js) reads off the page. The history shape it keeps: ONE sentinel entry
// (`history.state.vs === 1`) above the page's own entry; a back press lands on the page's entry (a popstate) and the
// wiring decides, then steps FORWARD onto the same sentinel with history.go(1) — never a fresh pushState, which
// Chrome's back-button intervention punishes (measured on Chrome 154: a pushState made with no tap since the last one
// marks the entry below skippable, so the NEXT back skipped VibeSpace entirely; a traversal adds no entry and marks
// nothing — docs/kb-patterns.md "The history sentinel").
// A BACK NEVER COSTS A LOAD (lane phone-back-reload, 2026-10-25 — the owner on Android: 「我按返回按钮是重新加载的 … 它会
// 重新进入到一开始的 loading 界面」). Measured on Chrome 154 with the browser's own back (Alt+Left, the intervention's path):
// a tab DISCARDED and shown again comes back standing on {vs:1} with the page entry below it DEAD (document.wasDiscarded,
// navigation type back_forward; navigation.entries() even calls that entry sameDocument), so the first back was a full
// load — the splash, then home. A renderer killed and reloaded (Android's low-memory kill) loses history.state, and a
// second load of the app in the tab (a `?` link) stacks a new document above the old one: either way the 「再返回一次
// 退出」 exit back landed on an OLDER VibeSpace entry — a load again. So: bootStep 'rebuild', exitPlan, backCostLoad.
// THE EXIT GOES ON ACROSS DOCUMENTS (acceptance round 2, measured on Chrome 154): history.go() moves by JOINT-history
// steps, and one iframe link inside an older VibeSpace document (the embedded Browser window) adds a step that
// navigation.entries() never shows — the exit's go(-(current+1)) LANDED on that older document, a load. So the exit
// leaves an intent behind and a document that boots on it goes on back without booting the app (exitHop).
// NO KEY, NO HOP (acceptance round 3): only a load whose navigation.activation names the entry the exit left goes on —
// without that API (Chromium 102–122, Safari 26.0–26.1) a forward press inside the intent's 10 s hopped the person back
// out of the page they chose (reproduced on Chrome 154 with the API removed).

/** A second back inside this window after the 「再返回一次退出」 toast leaves; later it re-arms. */
export const BACK_WINDOW_MS = 2000;
/** The toast (an i18n key — the wiring translates it). */
export const BACK_TOAST = 'Press back again to exit';
/** A sheet that needs its own close (drafts to stash, state to drop) answers this event on its element and calls
 *  preventDefault(); an unanswered sheet is hidden with the `hidden` class. */
export const BACK_DISMISS_EVENT = 'vs-back-dismiss';

/** Is `state` (history.state) our sentinel? */
export const isSentinel = (state) => !!(state && typeof state === 'object' && state.vs === 1);

/** At boot: 'keep' — a reload landed ON our sentinel (Chrome keeps the entry below same-document across a reload,
 *  location.reload() or the browser's own: measured), so pushing again would stack a second one; 'rebuild' — standing
 *  on a sentinel whose page entry below is NOT this document's: a discarded tab shown again (`wasDiscarded`), a load by
 *  a history traversal (`navType` back_forward — the restored tab reports it too), or the Navigation API says the entry
 *  below is another document (`belowSame` false; null = unknown) — the wiring makes this entry the page's own
 *  (replaceState(null)) and pushes a sentinel above it, so the next back is same-document; 'push' — a phone with the
 *  setting on; 'none' — a desktop (its back is never touched) or the setting off. */
export function bootStep({ phone, enabled, state, navType = '', wasDiscarded = false, belowSame = null }) {
  if (!phone) return 'none';
  if (isSentinel(state)) return enabled !== false && (wasDiscarded || navType === 'back_forward' || belowSame === false) ? 'rebuild' : 'keep';
  return enabled === false ? 'none' : 'push';
}

/** How the exit leaves when VibeSpace's own OLDER entries stand below the page's entry (an earlier document of this
 *  tab: a renderer kill's reload, a discard, a second load of the app — a back onto one is a full load). `current` =
 *  the page entry's index in navigation.entries() (the contiguous same-origin block — how many of ITS entries stand
 *  below; an older document's iframe steps are not among them), `block` = that list's length, `length` = history.length.
 *  null — nothing of ours below: the browser's own back leaves (the arm's stay); { skip, load } — history.go(-skip)
 *  toward the page before VibeSpace (load false; the distance is the entries' count, never history.length's — when an
 *  unseen step makes it fall short, the older document it lands on goes on: exitHop); when the WHOLE tab is
 *  VibeSpace's (length === block: every joint step is one of the block's entries, so the count is exact) there is no
 *  such page — the first entry, ONE named load (load true: the diary says so, the auto capture stays out). */
export function exitPlan({ current = 0, block = 0, length = 0 } = {}) {
  if (!(current > 0)) return null;
  return length > 0 && length === block ? { skip: current, load: true } : { skip: current + 1, load: false };
}

/** THE EXIT'S INTENT, read by a document at its boot (round 2) — or when the back/forward cache shows it again (round
 *  3: navType 'back_forward' then). Before its go() the exit writes { t, hop, key — the entry it left (navigation's own
 *  random key), to: 'below' } (src/lib/nav-log.js); the document that go() reaches reads it before the app boots:
 *    'none'  — no intent: boot
 *    'clear' — not this load's: a boot that is no history traversal (navType ≠ back_forward), an intent EXIT_INTENT_MS
 *              old, or a load that did not come from the entry the intent names (`fromKey` = navigation.activation's
 *              from key: null = a page of another site — the person pressed forward from it; undefined or '' = no such
 *              API: NO KEY, NO HOP — round 3, fail closed; round 2 let the clock alone decide) — dropped, boot
 *    'hop'   — count its own block, ONE more go(-(current+1)), hop + 1; the app never boots
 *    'stay'  — EXIT_HOPS hops made already: the page stays — the ONE named load — the intent dropped, boot */
export const EXIT_HOPS = 3;
export const EXIT_INTENT_MS = 10000;
export function exitHop({ intent = null, navType = '', fromKey, now = 0 } = {}) {
  if (!intent || typeof intent !== 'object') return 'none';
  if (navType !== 'back_forward') return 'clear';
  if (!(now >= intent.t && now - intent.t < EXIT_INTENT_MS)) return 'clear';
  if (!(typeof fromKey === 'string' && fromKey !== '' && fromKey === intent.key)) return 'clear';
  return intent.hop >= EXIT_HOPS ? 'stay' : 'hop';
}

/** Did THIS load come from a back press inside VibeSpace (the owner's symptom)? navType back_forward, the tab's diary
 *  (src/lib/nav-log.js) ends with the PREVIOUS document's rows from under `withinMs` ago — none of them the exit's own
 *  traversal ('leave' — a named load —, 'hop') — and the load is a BACK out of that document. `came` (the wiring reads
 *  navigation.activation): 'back' — from that document's own entry, a higher one (the discarded tab's first back
 *  never reaches its page — no 'pop' row — and is one); 'forward' / 'other' (a forward press, a page of another site)
 *  never file (round 2: a forward press within 5 s after the stay arm's exit filed one); '' (no such API — iOS Safari
 *  26.1, Chromium before 123): the way in cannot be told, so round 1's rule as shipped files (round 3 — round 2's «a
 *  pop row, never the stay arm» silenced the discard road, which has no pop row, and a stay-arm back that loads an
 *  older document; a forward press files too there, the accepted cost). `prev` = that document's last rows, oldest
 *  first. */
export const COST_WINDOW_MS = 5000;
export function backCostLoad({ navType = '', prev = [], now = 0, withinMs = COST_WINDOW_MS, came = '' } = {}) {
  if (navType !== 'back_forward' || !prev.length || came === 'forward' || came === 'other') return false;
  const last = prev[prev.length - 1];
  if (!(last && now >= last.t && now - last.t < withinMs)) return false;
  return !prev.some((r) => r && (r.k === 'leave' || r.k === 'hop'));
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
 *       — it arms, then the same rule; a menu or dialog they opened since still closes first), exit (exitPlan's answer).
 *  out: { action, toast, stay, skip, load } — action is 'none' | 'close' | 'arm' | 'leave', toast is BACK_TOAST or null:
 *       none  — a desktop: not ours (no sentinel is ever pushed there)
 *       close — close / yield the target, step back onto the sentinel
 *       arm   — the toast; stay true: stay on the page's entry for BACK_WINDOW_MS so the next back is the browser's own
 *               (it leaves even when VibeSpace is the tab's first page, where a script's history.back() does
 *               nothing), then step back onto the sentinel; stay false (an exit plan: older VibeSpace entries below,
 *               where the browser's own back would LOAD one): step back onto the sentinel at once — the next back
 *               inside the window reaches us and leaves past them
 *       leave — a back while armed that still reached us, or the setting turned off: keep going back — skip entries
 *               at once (history.go(-skip); 1 = history.back()), load true = the named load onto the tab's first entry */
export function backVerdict({ phone = true, enabled = true, target = null, lastBackAt = 0, now = 0, deepLinkFirst = false, exit = null } = {}) {
  if (!phone) return verdict('none');
  if (enabled === false) return leave(exit);
  if (target && !(deepLinkFirst && target === 'window')) return verdict('close');
  if (lastBackAt > 0 && now >= lastBackAt && now - lastBackAt < BACK_WINDOW_MS) return leave(exit);
  return { ...verdict('arm', BACK_TOAST), stay: !exit };
}
const verdict = (action, toast = null) => ({ action, toast });
const leave = (exit) => ({ ...verdict('leave'), skip: exit ? exit.skip : 1, load: !!(exit && exit.load) });
