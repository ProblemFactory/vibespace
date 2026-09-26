// THE TITLE WINS — PURE (imports nothing; lane G, 2026-09-25). The owner, on a tab strip whose
// titles read "V.." / a six-letter stub beside a billing chip "≋ 全部 → UCI Max" and an inbox chip "⌸ 1":
// "这个全部->UCI Max占据了绝大部分空间，都看不到窗口标题了，你有什么好的解决方案吗？"
//
// A window's BILLING chip (window.js setAuthBadge — on a standalone title bar after the title, on
// a grouped window's TAB after its label) has three forms, and the chip takes the widest one that
// leaves the TITLE readable:
//   full    — the glyph + every word ("≋ 全部 → UCI Max", "⚿ Team API", "Personal Max");
//   compact — the glyph + the member's SHORT name only ("≋ UCI Max"; a pool without a member names
//             the pool): the pool prefix goes, a long name is cut at MEMBER_SHORT_MAX characters;
//   icon    — the glyph alone (the chip's colour/class still says pool / API / subscription).
// Every word the chip drops lives in its tooltip (data-tip) and in the switcher its click opens.
//
// `chipMode` is decided from MEASURED widths (all in the same unit — layout px in the DOM):
//   availablePx — the room the title and the chip share (the label's width + the chip's width as
//                 rendered now, less any overflow — the same number whatever mode is showing);
//   titlePx     — the title's natural width; titleMinPx — the width that shows TITLE_MIN_CHARS of it
//                 (+ the ellipsis), or the whole title when it is shorter;
//   chipFullPx, chipCompactPx — the chip's natural width in those two forms (the icon form is the
//                 floor: nothing narrower exists, so it is the answer whatever room is left).
// full    ⇔ the WHOLE title fits beside the full chip;
// compact ⇔ else, at least TITLE_MIN_CHARS of the title (or all of it) fit beside the compact chip;
// icon    ⇔ otherwise (the best the chip can do — the title gets everything else).
// The decision reads no current mode, so a re-decision can never oscillate.
// Gate: scripts/test-title-chips.mjs (fast) + scripts/test-title-chips-ui.mjs (heavy, chrome).

/** The fewest title characters a chip may leave visible before it gives up its words. */
export const TITLE_MIN_CHARS = 6;
/** A member's short name: at most this many characters, the last one an ellipsis when cut. */
export const MEMBER_SHORT_MAX = 8;
/** The three forms, widest first. */
export const CHIP_MODES = Object.freeze(['full', 'compact', 'icon']);

const fin = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
// half a pixel of slack: widths come from rounded layout boxes
const EPS = 0.5;

/**
 * 'full' | 'compact' | 'icon' — the widest chip form that leaves the title readable (see the head
 * comment). Unmeasured input (a non-finite or negative width — a window not laid out) answers 'full',
 * the form the chip had before anything was measured; the DOM does not decide on such a pass.
 */
export function chipMode({ availablePx, titlePx, chipFullPx, chipCompactPx, titleMinPx } = {}) {
  const a = fin(availablePx), tw = fin(titlePx), full = fin(chipFullPx), comp = fin(chipCompactPx);
  if ([a, tw, full, comp].some((x) => Number.isNaN(x) || x < 0)) return 'full';
  const least = Math.min(tw, Number.isFinite(titleMinPx) && titleMinPx >= 0 ? titleMinPx : tw);
  if (a - full + EPS >= tw) return 'full';
  if (a - Math.min(comp, full) + EPS >= least) return 'compact';
  return 'icon';
}

/** A name as one line: whitespace runs collapsed, trimmed. */
const oneLine = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

/**
 * A pool member's (or any account's) SHORT name for the compact chip: at most `max` characters
 * (code points — a CJK or emoji name is never cut mid-character), the last one an ellipsis when
 * the name was longer. 'UCI Max' → 'UCI Max'; 'Northwind Max' → 'Northwi…'.
 */
export function memberShortName(name, max = MEMBER_SHORT_MAX) {
  const s = oneLine(name);
  const cps = Array.from(s);
  const n = Math.max(2, Math.floor(Number(max) || MEMBER_SHORT_MAX));
  if (cps.length <= n) return s;
  return cps.slice(0, n - 1).join('').trimEnd() + '…';
}

/** What `titleMinPx` measures: the title's first TITLE_MIN_CHARS characters + the ellipsis the
 *  label draws after them, or the whole title when it is that short. */
export function titleMinText(title, n = TITLE_MIN_CHARS) {
  const cps = Array.from(oneLine(title));
  const k = Math.max(1, Math.floor(Number(n) || TITLE_MIN_CHARS));
  return cps.length <= k ? cps.join('') : cps.slice(0, k).join('') + '…';
}

/**
 * The chip's WORDS in each form from its parts: `name` (the pool / account / login label) and, for
 * a pool, `target` (the member serving the session now).
 *   full  = 'name → target' (or 'name' alone), — the tooltip's head too, so the words the chip
 *           drops are always one hover away;
 *   short = the member's short name (a pool with no member: the pool's own short name).
 */
export function chipWords({ name, target } = {}) {
  const n = oneLine(name), tg = oneLine(target);
  return { full: tg ? (n ? `${n} → ${tg}` : tg) : n, short: memberShortName(tg || n) };
}

/** The inbox chip's number as drawn: the count, never wider than two digits and a plus. */
export function inboxCountText(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  return n > 99 ? '99+' : String(n);
}
