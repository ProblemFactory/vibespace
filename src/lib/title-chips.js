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

/**
 * THE PHONE BAR'S FOLD (lane phone-chat-composer; lane phone-bar-billing-nofold — mirror-262 red on the runner: its
 * wider DejaVu fonts left the billing chip less room than its full words and the fold hid it behind ⋯). The bar is ONE
 * row of `room` px (⋯ and its gap already taken); `chips` = { key, w } in bar order (w = the drawn width, 0 = a chip
 * this face never shows), the billing chip with `forms` = its { full, compact, icon } widths. The NEVER-FOLD chips are
 * laid first — search · model · a turn waiting on the person · a broken-setup alert · the billing chip, the phone's
 * stand-in for the title bar's badge (who pays) at the widest form that fits beside them (full → compact → icon; the
 * icon even when nothing fits) — then every other chip in bar order while it fits; past the first that does not, the
 * rest fold too; effort + style always fold (the model chip's sheet carries them).
 * → { folded: Set of keys, billing: 'full' | 'compact' | 'icon' | null (no billing chip) }
 */
export const PHONE_BAR_NEVER_FOLD = Object.freeze(['search', 'model', 'turnstate', 'health', 'billing']); // (lane needs-card-tail r10: the conversation's own For-you items are the window's attention dock above the message box, never a bar chip)
export function phoneBarFold({ chips = [], room = 0, gap = 0 } = {}) {
  const px = (v) => (Number.isFinite(fin(v)) ? v : 0);
  const used = (w) => (w > 0 ? w + px(gap) : 0);
  let left = px(room);
  for (const c of chips) if (c.key !== 'billing' && PHONE_BAR_NEVER_FOLD.includes(c.key)) left -= used(px(c.w));
  const bill = chips.find((c) => c.key === 'billing');
  let billing = null;
  if (bill) {
    const f = bill.forms || { full: px(bill.w) };
    billing = pillMode({ slotPx: Math.max(0, left), fullPx: f.full, compactPx: f.compact });
    left -= used(px(f[billing] ?? f.full));
  }
  const folded = new Set();
  let full = false;
  for (const c of chips) {
    if (PHONE_BAR_NEVER_FOLD.includes(c.key)) continue;
    if (c.key === 'effort' || c.key === 'style') { folded.add(c.key); continue; } // never part of the row: their width folds nothing else
    const w = px(c.w);
    if (full || w > left) { folded.add(c.key); full = true; continue; }
    left -= used(w);
  }
  return { folded, billing };
}

/** The inbox chip's number as drawn: the count, never wider than two digits and a plus. */
export function inboxCountText(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  return n > 99 ? '99+' : String(n);
}

/**
 * THE PHONE'S TOP BAR (lane phone-titlebar-title — the owner 2026-11-06, a phone at ~360 px: 「手机端的标题栏被挤压得根本看不到聊天
 * 标题了」 — ☰ · 📁 · a desktops chip · the usage ring · the For-you chip's five badges · ⚙ · ✕ · + left the conversation's title
 * one character and an ellipsis). On a finger device the TITLE OWNS THE BAR: the chips beside it yield in ONE FIXED ORDER, each
 * through its MEASURED forms (widest first; a form no narrower than the last is no step), until the WHOLE title fits — the
 * title ellipsizes only once every chip has taken its last form. NAV_FOLD_ORDER: the desktops door, the usage ring, the For-you
 * chip's badges (five → ONE: the honest count in the worst urgency's colour — the breakdown lives in the tray), the vault-lock
 * chip (⚙ unlocks too), ⚙. NAV_NEVER_FOLD — ☰ · For you · ✕ · + — are the person's doors: they never fold (the For-you chip
 * only takes its one-badge form). A folded chip lives in ONE «⋯» (charged `moreW` + one gap once anything folds); beyond
 * NAV_INLINE_MAX foldable chips standing the rest fold whatever the width (the owner's phone-row rule — the same three as
 * row-fold-model.js's ROW_INLINE_MAX, lane phone-roster-fold; this file imports nothing). A ⋯ NEVER HOLDS ONE CHIP the title
 * does not need, WHATEVER FOLDED IT (the width or the count, r2): a chip no wider than the ⋯ (the title gains nothing), or one the
 * whole title still fits beside, stands instead — so the count reads «at most NAV_INLINE_MAX foldable chips inline, or one more
 * when it alone would fill the ⋯».
 * THE SLACK IS THE TITLE'S (r2 — measured: Chrome draws the ellipsis on a title 0.05 px wider than its box, «NotescvHJ.…»): the
 * whole title fits when its width ≤ the room LESS NAV_SLACK_PX (one layout unit — a measured width's rounding is charged to the
 * chips, never to the title); it is readable when its minimum ≤ the same; the give-back compares the chip to the ⋯ exactly.
 *   items — [{ key, forms: [px, …] }] in bar order, a chip's forms widest first (px ≤ 0 / none = absent); `titlePx` = the
 *           title's natural width, `titleMinPx` = navTitleMinText's; `roomPx` = the bar's content box; `gapPx` = its gap.
 * → { forms: { key: form index }, folded: [keys in bar order], titleRoom, fits (the whole title), readable (≥ its minimum) }.
 * Unmeasured input (no room) changes nothing: every chip at its widest, nothing folded.
 */
export const NAV_FOLD_ORDER = Object.freeze(['desktops', 'usage', 'todos', 'vault', 'gear']);
export const NAV_NEVER_FOLD = Object.freeze(['menu', 'todos', 'close', 'new']);
export const NAV_INLINE_MAX = 3;
/** The title's readable minimum in half-width units: the first 6 CJK (wide) or 12 Latin characters. */
export const NAV_TITLE_MIN_UNITS = 12;
/** One layout unit (1/64 px): the room is judged this much SMALLER than measured — never larger. */
export const NAV_SLACK_PX = 1 / 64;
const WIDE = /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6\u{1F300}-\u{1FAFF}\u{20000}-\u{3FFFD}]/u;

/** What the bar's `titleMinPx` measures: the title's first NAV_TITLE_MIN_UNITS half-width units (a CJK character is two) +
 *  the ellipsis the title draws after them, or the whole title when it is that short. '游戏规则设计与平衡讨论' → '游戏规则设计…'. */
export function navTitleMinText(title, units = NAV_TITLE_MIN_UNITS) {
  const cps = Array.from(oneLine(title));
  const cap = Math.max(1, Math.floor(Number(units) || NAV_TITLE_MIN_UNITS));
  let u = 0, k = 0;
  for (; k < cps.length; k++) { const w = WIDE.test(cps[k]) ? 2 : 1; if (u + w > cap) break; u += w; }
  return k >= cps.length ? cps.join('') : cps.slice(0, Math.max(1, k)).join('').trimEnd() + '…';
}

export function navBarFold({ roomPx, gapPx = 0, moreW = 0, titlePx = 0, titleMinPx = 0, items = [], max = NAV_INLINE_MAX } = {}) {
  const px = (v) => { const n = fin(v); return Number.isNaN(n) || n <= 0 ? 0 : n; };
  const list = (Array.isArray(items) ? items : []).filter((it) => it && it.key != null)
    .map((it) => ({ key: String(it.key), forms: (Array.isArray(it.forms) ? it.forms : []).map(px) }))
    .filter((it) => it.forms.length && it.forms[0] > 0);
  const at = new Map(list.map((it) => [it.key, 0]));
  const folded = new Set();
  const room = px(roomPx), g = px(gapPx), more = px(moreW), tw = px(titlePx);
  const least = Math.min(tw, px(titleMinPx) || tw);
  const foldable = (k) => NAV_FOLD_ORDER.includes(k) && !NAV_NEVER_FOLD.includes(k); // a key the table does not name stands
  const used = () => {
    let s = 0, n = 1; // the title is one of the bar's boxes
    for (const it of list) if (!folded.has(it.key)) { s += it.forms[at.get(it.key)]; n++; }
    if (folded.size) { s += more; n++; }
    return s + g * (n - 1);
  };
  const verdict = () => {
    const titleRoom = Math.max(0, room - used());
    return { forms: Object.fromEntries(at), folded: list.filter((it) => folded.has(it.key)).map((it) => it.key), titleRoom, fits: titleRoom - NAV_SLACK_PX >= tw, readable: titleRoom - NAV_SLACK_PX >= least };
  };
  if (!room) return verdict();
  // THE COUNT: beyond `max` foldable chips standing, the first ones in the order fold
  const cap = Math.max(1, Math.floor(Number(max) || NAV_INLINE_MAX));
  for (const k of NAV_FOLD_ORDER) {
    if (list.filter((it) => foldable(it.key) && !folded.has(it.key)).length <= cap) break;
    if (foldable(k) && at.has(k)) folded.add(k);
  }
  // THE WIDTH: step by step in the order until the whole title fits
  const fits = () => room - used() - NAV_SLACK_PX >= tw;
  ladder: for (const k of NAV_FOLD_ORDER) {
    const it = list.find((x) => x.key === k);
    if (!it || folded.has(k)) continue;
    for (let i = 1; i <= it.forms.length; i++) {
      if (fits()) break ladder;
      if (i < it.forms.length) { if (it.forms[i] < it.forms[at.get(k)]) at.set(k, i); }
      else if (foldable(k)) folded.add(k);
    }
  }
  // ONE ⋯ for ONE chip, whatever folded it: the chip stands instead when the title keeps all it had — the chip no wider than the
  // ⋯, or the whole title still fitting beside it
  if (folded.size === 1) {
    const [k] = folded; const it = list.find((x) => x.key === k), whole = fits();
    folded.delete(k);
    if (it.forms[at.get(k)] > more && !(whole && fits())) folded.add(k);
  }
  return verdict();
}

/** THE ⋯ MENU'S ROWS (lane phone-titlebar-title): one per folded chip, in the bar's order, each with its LIVE value in the chip's
 *  OWN words (r3 — decided per row by what the chip tells a person): the desktops chip's badge is the active desktop's PLACE, not
 *  a count, and the chip's name says «Desktops — 工作 (2/3)» ⇒ its row «2/3 · 工作» (`desktops` = { k, n, name }; never a bare
 *  number — «2» read as «two desktops»); the ring's arc is a percent ⇒ «52 %»; the lock chip's words ARE its fact («Vault
 *  locked», no value); ⚙ a door, no number; the For-you chip never folds (no row). `loud` (r3): the ⚙ row while the vault is
 *  locked (`vaultLocked`) — it wears ⚙'s lock. The words are the bar's (mobile-nav.js says them through t()). A folded chip is
 *  never missing here. → [{ key, value, loud }] */
export function navMoreRows(folded = [], { desktops = null, usage = '', vaultLocked = false } = {}) {
  const f = new Set(Array.isArray(folded) ? folded : []);
  const d = desktops && typeof desktops === 'object' ? desktops : {};
  const k = Math.floor(fin(d.k)), n = Math.floor(fin(d.n)), name = oneLine(d.name);
  const place = k >= 1 && n >= k ? `${k}/${n}${name ? ` · ${name}` : ''}` : '';
  return NAV_FOLD_ORDER.filter((key) => f.has(key) && key !== 'todos').map((key) => ({ key, value: key === 'desktops' ? place : key === 'usage' && oneLine(usage) ? `${oneLine(usage)} %` : '', loud: key === 'gear' && !!vaultLocked }));
}

/** THE LOCK STAYS LOUD ON A FOLDED BAR (r3 — lane vault-locked-loud's law: «the vault is locked» is said wherever Settings is
 *  reached from; ⚙ wears a red lock while it is). The lock chip folds before ⚙, so once ⚙ folds nothing on the bar would say it:
 *  the ⋯ that stands in for ⚙ wears ⚙'s mark and colour while the vault is locked AND ⚙ is folded — never while ⚙ stands (it
 *  says it itself). → true when the ⋯ wears the lock */
export function navMoreLoud(folded = [], { vaultLocked = false } = {}) {
  return !!vaultLocked && Array.isArray(folded) && folded.includes('gear');
}

/** THE FOR-YOU CHIP'S ONE BADGE (lane phone-titlebar-title — the five collapse to it): the honest count (`total`, every open
 *  question) in the worst urgency's colour — urgent · high · a loud one (`loud` = bands 1–4) · else the quiet outline — or, with
 *  no question open, the notices' grey count; null when there is nothing to count. → { seg, count } */
export function navOneBadge({ urgent = 0, high = 0, loud = 0, total = 0, notices = 0 } = {}) {
  const n = (v) => Math.max(0, Math.floor(Number(v) || 0));
  if (n(total)) return { seg: n(urgent) ? 'urgent' : n(high) ? 'high' : n(loud) ? 'norm' : 'quiet', count: n(total) };
  return n(notices) ? { seg: 'notice', count: n(notices) } : null;
}
