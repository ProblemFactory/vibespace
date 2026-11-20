// THE PHONE HEAD'S NAME (lane phone-six round 2, 2026-10-27 — the integrator's visual pass of userW's «每次切完桌面就会变成
// 空白»: at 669 px beside the list column the head drew «/tm…», three glyphs of a files window's whole path). A phone head
// names the window on show with the words a person reads, and never with a fragment of them:
//   · headName(title) — the name: the title's part before « — » (a conversation's «name — cwd»); a PATH-shaped name (a files
//     window's folder, an editor's file: «/…», «~/…», «…/…» after frontTruncate, «C:\…», each maybe after a «machine: »)
//     is its LAST segment — the folder's own name — never its leading characters; the full title rides the title attribute.
//   · NAME_FLOOR_EM / nameNeed — the width the name keeps: 8 em (≈ 112 px at the head's 14 px), or its whole width when it
//     is shorter; the bar's buttons yield before it (mobile-nav.js _paintHead: YIELD_LADDER, each step tried in a real layout).
//   · YIELD_LADDER — '' (every button) → 'win' (the window's own extras leave the bar: the viewer's ✕ — the switcher row's
//     ✕ closes it —, Artifacts — the chat's own status bar —, the live view — a row of ⋯, the window's menu) → 'badges' (the
//     For-you button's numbers collapse to ONE — lane phone-titlebar-title's .mnav-one, the honest count in the worst urgency's
//     colour; the recovery port onto .398: that lane keeps the regular class's five badges, so they yield only when the name
//     needs the room, as its own compact fold does — before ⚙, its NAV_FOLD_ORDER) → 'gear' (⚙
//     folds into ⋯, its row «Global settings»; only into a ⋯ that STANDS — see moreHolds —, never while it carries the
//     locked vault's mark — measured, the 669 px Duo portrait's 348 px column leaves the name 104 px after 'win', 150
//     after 'gear'; the Desktops door and ⋯ stay, the sheets the bar folds into) → 'icon' (the head shows the window's type icon + the window count; the name lives in the
//     switcher — never a fragment under four glyphs).
//   · ROW_YIELD_LADDER / rowParts — THE SWITCHER ROW (主开发 2026-11-17 00:33Z, the .407 move's meeting: a row's bill chip,
//     its Split door, the window's ⋯ and its ✕ left a long name 0 px at 320 and cut the ✕ at the edge): the owner's ruling B
//     on the same kind of row — the name keeps its readable minimum; what does not fit yields, in order: '' (everything, the
//     chip's long form) → 'compact' (the chip's compact form) → 'split' (the Split door into the ⋯ menu, with its why) →
//     'chip' (the chip into the ⋯ menu as the billing row, the same switch door). The ⋯ and the ✕ never yield: the name is
//     what a person must KNOW, ⋯ and ✕ what a person OPERATES, the chip and the Split door are details here.
//   · moreHolds(items) — THE BAR'S ⋯ STANDS ONLY WHEN IT HOLDS A ROW (主开发 2026-11-18 23:09Z, the 2.369.411 checkpoint's
//     find: in the regular class every window-manager verb is off, so a files window's menu had no row and its ⋯ opened
//     an empty menu): the window's menu items (taskbar.js windowMenuRows) hold a row other than a separator and the folded
//     ⚙'s own «Global settings» — that row only MOVES ⚙, so it never makes ⋯ stand, and ⚙ folds only into a ⋯ that
//     stands (style.css): where ⋯ holds nothing, ⚙ stays and the ladder's 'gear' step gives nothing.
// PURE: imports nothing (client: src/lib/mobile-nav.js, src/lib/window.js; gate: test-phone-split).
const NAME_FLOOR_EM = 8;
const YIELD_LADDER = ['', 'win', 'badges', 'gear', 'icon'];
const ROW_YIELD_LADDER = ['', 'compact', 'split', 'chip'];
const PATH_RE = /^(?:[/~…]|[A-Za-z]:[\\/])/;
const FOLDED_GEAR_ROW = 'window/bar-gear';   // trailing-bar.js's row for a folded ⚙

/** The name a phone head shows for window title `title`. */
function headName(title) {
  let s = String(title == null ? '' : title).split(' — ')[0].trim();
  const host = s.match(/^([^\s:/\\]{1,64}): (.+)$/); // «my-mac: /path» (a remote files / editor window)
  if (host && PATH_RE.test(host[2])) s = host[2];
  if (!PATH_RE.test(s) || !/[\\/]/.test(s)) return s;
  const parts = s.split(/[\\/]+/).filter((p) => p && p !== '…');
  return parts.length ? parts[parts.length - 1].replace(/^…/, '') || parts[parts.length - 1] : (s.startsWith('~') ? '~' : '/');
}

/** The px the name keeps: its whole width `full`, or the floor (`em` px per em) when it is wider. */
function nameNeed(full, em, floorEm = NAME_FLOOR_EM) {
  return Math.min(Math.max(0, Number(full) || 0), floorEm * (Number(em) || 0));
}

/** Does a name drawn `got` px wide keep what it needs? (half a px of rounding allowed) — `minPx` given (主开发's ruling
 *  09:33Z: the regular bar's ladder uses THE RELEASE'S readable minimum — lane phone-titlebar-title's navTitleMinText, six CJK
 *  or twelve Latin glyphs + «…», measured in the head's own font): the name keeps that, or its whole width when shorter. */
function nameFits(got, full, em, minPx = null) {
  const need = minPx == null ? nameNeed(full, em) : Math.min(Math.max(0, Number(full) || 0), Math.max(0, Number(minPx) || 0));
  return (Number(got) || 0) + 0.5 >= need;
}

/** What a switcher row draws at yield step `step` (ROW_YIELD_LADDER): the chip's form ('full' | 'compact' | null = it is in
 *  the ⋯ menu) and whether the Split door stands on the row (false = it is in the ⋯ menu). An unknown step draws everything. */
function rowParts(step) {
  const i = Math.max(0, ROW_YIELD_LADDER.indexOf(step));
  return { chip: i >= 3 ? null : i >= 1 ? 'compact' : 'full', split: i < 2 };
}

/** Does the bar's ⋯ hold a row? `items` = the window menu's items: a row other than a separator and the folded ⚙'s. */
function moreHolds(items) {
  return Array.isArray(items) && items.some((it) => !!it && !it.separator && it.id !== FOLDED_GEAR_ROW);
}

module.exports = { NAME_FLOOR_EM, YIELD_LADDER, ROW_YIELD_LADDER, FOLDED_GEAR_ROW, headName, nameNeed, nameFits, rowParts, moreHolds };
