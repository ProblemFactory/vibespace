// THE TOP TOOLBAR'S FOLD — the PURE table (lane toolbar-fold, 2026-09-30; the owner: "the top-right cluster of green
// buttons takes too much width on a low-resolution screen and overlaps other chrome"). Imports nothing, touches no DOM:
// node-imported by scripts/test-toolbar-fold.mjs and by the heavy census scripts/test-toolbar-fold-ui.mjs.
//
// MEASURED BEFORE THE FIX (master ab1cda46, 60 states × 2 font sets): `.toolbar-right { min-width: 160px;
// justify-content: flex-end }` let the zone shrink to 160 px and its buttons overflowed LEFTWARD — over the layout-preset
// icons, over the "VibeSpace" title and, with the sidebar open, UNDER the sidebar (⚙ / Presets / New Session hidden,
// ja + en at 1024×768 / UI 125 %); 21 of 60 states overlapped (1366×768 at UI 125 % in every language).
//
// THE RULE is lane I's (src/lib/live-bar-layout.js): nothing wraps, nothing overlaps; the title is the ONE flexible
// item; the buttons first give up their WORDS (glyph alone, the words its tooltip + accessible name) one at a time in
// the fold order, and only then FOLD into ONE ⋯ by priority (higher folds earlier, ties right-to-left). The toolbar's
// three zones are barLayout `groups` (each its own gap). The DOM half is src/lib/toolbar-fold.js (createBarFold).
//
// Customize mode moves any registered element into any zone: the fold reads the ARRANGED order every layout, a hidden
// element never counts, and an element this table does not know stays shown (priority 0) — a new chrome element must get
// a row here to fold (test-toolbar-fold's census holds every CHROME_ELEMENTS id to a row).

/** The compact form's class (a `.toolbar-action` without its words — style.css scopes it to #toolbar). */
export const TOOLBAR_COMPACT = 'tb-compact';

/**
 * One row per element the toolbar may hold, keyed by DOM id.
 *   priority — 0 never folds; a higher number folds earlier (barLayout)
 *   compact  — the element has a words-free form (TOOLBAR_COMPACT)
 *   live     — measured from its own rendered box (never folds, never compact: the taskbar widgets Customize can move up,
 *              whose `#toolbar #id` rules a clone cannot carry)
 *   flex     — THE flexible item (charged at FLEX_MIN_PX: it shrinks, with an ellipsis, before anything else gives way)
 *   command  — the contributions command the ⋯ row runs (the SAME command the button's own click runs)
 *   label    — the ⋯ row's words: the button's own label (English key, the same t() entry the button shows)
 *   submenu  — the ⋯ row is a head whose rows are the element's own buttons (the layout presets)
 */
export const TOOLBAR_ITEMS = Object.freeze({
  'sidebar-toggle':      Object.freeze({ priority: 0, live: true }),
  'toolbar-title':       Object.freeze({ priority: 0, flex: true }),
  'btn-global-settings': Object.freeze({ priority: 0, live: true }),
  'btn-new-session':     Object.freeze({ priority: 1, compact: true, command: 'session.new', label: 'New Session' }),
  'btn-terminal':        Object.freeze({ priority: 2, compact: true, command: 'toolbar.terminal', label: 'Terminal' }),
  'btn-file-explorer':   Object.freeze({ priority: 2, compact: true, command: 'explorer.open', label: 'Files' }),
  'btn-browser':         Object.freeze({ priority: 3, compact: true, command: 'browser.open', label: 'Web view' }),
  'btn-desktop-apps':    Object.freeze({ priority: 3, compact: true, command: 'desktopApps.open', label: 'Apps' }),
  'btn-desktop':         Object.freeze({ priority: 4, compact: true, command: 'desktop.open', label: 'Desktop' }),
  'layout-presets':      Object.freeze({ priority: 4, submenu: 'Layout presets' }),
  'btn-presets':         Object.freeze({ priority: 5, compact: true, command: 'layout.savedPresets', label: 'Presets' }),
  'desktop-previews':    Object.freeze({ priority: 0, live: true }),
  'taskbar-user-todos':  Object.freeze({ priority: 0, live: true }),
  'taskbar-usage':       Object.freeze({ priority: 0, live: true }),
  'taskbar-status':      Object.freeze({ priority: 0, live: true }),
});

/** A flexible item's charged minimum: 1 px — it may shrink to nothing, but it is still a flex item, so the gap beside it
 *  is still paid (0 would read "absent" and leave that gap uncharged). */
export const FLEX_MIN_PX = 1;

/** The title squeezed narrower than this (layout px) would show a sliver of a glyph — it hides instead (visibility, its
 *  box kept, so hiding it moves nothing). "Vi…" at 13 px is ~22 px. */
export const TITLE_MIN_PX = 24;

/**
 * The fold's spec for one element of the toolbar.
 *   toolbarSpec(id, { spring: 'flex' | 'fixed' | null }) → { priority, compact, live, flexMin, known }
 * A flexible Customize spring is a flexible item; a fixed one is rigid (its own box); an element this table does not know
 * is rigid and never folds (known:false — the census names it).
 */
export function toolbarSpec(id, { spring = null } = {}) {
  if (spring === 'flex') return { priority: 0, compact: false, live: false, flexMin: FLEX_MIN_PX, known: true };
  if (spring === 'fixed') return { priority: 0, compact: false, live: true, flexMin: null, known: true };
  const row = TOOLBAR_ITEMS[id];
  if (!row) return { priority: 0, compact: false, live: true, flexMin: null, known: false };
  return { priority: row.priority, compact: !!row.compact, live: !!row.live, flexMin: row.flex ? FLEX_MIN_PX : null, known: true };
}

/**
 * The ⋯ menu's rows for the folded keys, in the bar's (arranged) order: one row per folded element — its command and its
 * words — or, for the layout presets, a head over the element's own buttons ({ key, submenu }). A folded key the table
 * has no command for is skipped (it could not have folded: only rows with a priority > 0 fold, and each has one).
 */
export function overflowRows(folded = []) {
  const out = [];
  for (const key of Array.isArray(folded) ? folded : []) {
    const row = TOOLBAR_ITEMS[key];
    if (!row) continue;
    if (row.submenu) out.push({ key, submenu: row.submenu });
    else if (row.command) out.push({ key, command: row.command, label: row.label });
  }
  return out;
}

/** A compact button's TOOLTIP (its accessible name is its words alone): its words; a button that already carries a
 *  longer tooltip keeps it — as is when it names the words ("Saved presets" / 已存预设 for 预设), else after them
 *  ("Apps — Open a desktop application in a window"). */
export function compactTitle(label = '', title = '') {
  const l = String(label || '').trim(), ti = String(title || '').trim();
  if (!ti || ti === l) return l;
  if (!l || ti.toLowerCase().includes(l.toLowerCase())) return ti;
  return `${l} — ${ti}`;
}
