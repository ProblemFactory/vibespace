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

/**
 * THE PHONE'S PILLS (lane phone-chip, B-e5ff — the owner's phone read "⣿ 全部 → Beta Ma": a 90 px CSS cap cut
 * the member's name mid-word). A pill is WHOLE or it FOLDS, never cut: the chat status bar's billing chip and the
 * window-switcher row's chip carry the same three forms as the desktop badge, and the widest one that fits is
 * drawn. `pillMode` is `chipMode` with no title beside it (the status bar is a wrapping row: a pill's room is a
 * whole line of it — `slotPx`); the switcher row shares its room with the window's title and calls `chipMode`
 * itself, exactly as the desktop title bar does.
 */
export function pillMode({ slotPx, fullPx, compactPx } = {}) {
  return chipMode({ availablePx: slotPx, titlePx: 0, titleMinPx: 0, chipFullPx: fullPx, chipCompactPx: Number.isFinite(compactPx) ? compactPx : fullPx });
}

/** A name's FIRST WORD when it is short enough to stand alone (≤ MEMBER_SHORT_MAX code points), else null —
 *  the compact pill never cuts a word: 'Beta Max' → 'Beta', '测试团队' → '测试团队', 'Northwindcorp Max' → null. */
export function shortWord(name, max = MEMBER_SHORT_MAX) {
  const w = oneLine(name).split(' ')[0] || '';
  return w && Array.from(w).length <= max ? w : null;
}

/**
 * The phone billing pill's THREE FORMS from the identity's parts (`kind`: 'pooled' | 'api' | 'subscription' |
 * 'unknown'; `name` = the pool / account / login label; `target` = the pool member serving now; `glyph` = the
 * pool's text glyph): full = every word ("⣿ 全部 → Beta Max", "Personal Max"); compact = the glyph + the member's
 * (or the account's) first word, or null when that word is too long to stand alone ("⣿ → Beta", "Personal");
 * icon = the glyph alone (`iconKind` names which: 'pool' text / 'key' / 'crown' SVG / '?'). `tip` = the full words
 * — the tooltip and aria-label always say what a folded form leaves out.
 */
export function billingPillForms({ kind = 'subscription', name = '', target = '', glyph = '⣿' } = {}) {
  const n = oneLine(name), tg = oneLine(target);
  if (kind === 'unknown') return { full: '?', compact: null, icon: '?', iconKind: 'unknown', tip: '?' };
  if (kind === 'pooled') {
    const full = `${glyph} ${n}${tg ? ` → ${tg}` : ''}`;
    const w = shortWord(tg || n);
    return { full, compact: w ? (tg ? `${glyph} → ${w}` : `${glyph} ${w}`) : null, icon: glyph, iconKind: 'pool', tip: full };
  }
  const w = shortWord(n);
  return { full: n, compact: w && w !== n ? w : null, icon: '', iconKind: kind === 'api' ? 'key' : 'crown', tip: n };
}

/** The icon form's glyph for a pill that has no text glyph: the desktop badge's own key (API) and crown (subscription). */
export const PILL_ICON_SVG = Object.freeze({
  key: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="8" r="3"/><path d="M8 8h6.5M12 8v2.5M14.5 8v2"/></svg>',
  crown: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12.5h11M3 12.5L2 4.5l3.2 2.6L8 3l2.8 4.1L14 4.5l-1 8z"/></svg>',
});

/** THE ONE MARKUP of a phone billing pill: the three forms as three spans (CSS shows the one `data-mode` names —
 *  the full form until something was measured). `esc` = the caller's HTML escaper (every word is a label). */
export function billingPillHtml(forms, esc) {
  const f = forms || {};
  const icon = f.iconKind === 'key' || f.iconKind === 'crown' ? PILL_ICON_SVG[f.iconKind] : esc(f.icon || '');
  return `<span class="pill-full">${esc(f.full || '')}</span>` + (f.compact ? `<span class="pill-compact">${esc(f.compact)}</span>` : '') + `<span class="pill-icon">${icon}</span>`;
}

/** The inbox chip's number as drawn: the count, never wider than two digits and a plus. */
export function inboxCountText(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  return n > 99 ? '99+' : String(n);
}
