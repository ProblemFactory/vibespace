'use strict';
// THE AGENT BROWSER WINDOW'S STRIP — PURE arithmetic (imports nothing; CJS so
// the fast suite requires it and esbuild bundles it). docs/design-browser-
// multiview.zh.md §2 A1 + D4 (lane P, built on lane F's split tabs v2).
//
// RECONCILED (2.369.183): lane I's `barLayout` (src/lib/live-bar-layout.js)
// folds the live view's BAR by priority into `⋯`. The design says the strip
// uses the SAME rule ("正在看的永不折叠 priority 0, 正在跑命令的 1, 其余 2,
// 右到左折进 ▾+N"); this module is that rule for the STRIP (`stripFold`). The
// strip is its own row ABOVE the bar — the two never share a width — so the
// integration keeps two folds (the strip's `▾+N`, the bar's `⋯`) rather than
// one: both fold the highest priority value first, rightmost first, never
// priority 0.
//
// What is decided here:
//   · `stripOrder` — a window's strip keeps its FIRST-SEEN order: a row that
//     appears later (a helper's browser, a new attachment) lands at the TAIL
//     and nothing already shown moves (§2: "新浏览器出现 = 条上尾部多一枚标签").
//   · `stripPriority` / `stripFold` — which tabs fold into `▾+N` at a given
//     width: the tab you are looking at never folds; a tab whose browser runs
//     a command (1) outlasts a quiet one (2); ties fold right to left.
//   · `shortLabel` — ≤ 16 characters, an ellipsis past it (the full name in
//     the tab's title).
//   · `estimateTabWidth` — the design's measured widths (a CJK label ≈ 34 +
//     11 px/char, a Latin one ≈ 34 + 6 px/char), for a suite / a first paint
//     before the DOM is measured.
//   · `rowStateWords` — which sentence a tab's state says (a released own
//     browser beside an attachment is never promised "the next command").
//   · `capChip` — the `own/cap` chip: this conversation's live browsers
//     against ITS cap (D4), red at the cap; the machine's ceiling is a SEPARATE
//     fact ("machine ceiling reached"), never the chip's number.

const LABEL_MAX = 16;
const TAB_BASE_PX = 34;      // dot + padding + gap (the design's measurement)
const CJK_PX = 11;
const LATIN_PX = 6.2;
const DRIVER_PX = 44;        // "agent" / "you" / a helper chip
const MORE_PX = 44;          // the ▾+N button
const CHIP_PX = 46;          // the own/cap chip

const isCjk = (ch) => /[ᄀ-ᇿ⺀-鿿가-힯豈-﫿＀-￯]/.test(ch);

/** ≤ max characters (code points), an ellipsis past it. */
function shortLabel(label, max = LABEL_MAX) {
  const chars = Array.from(String(label == null ? '' : label).replace(/\s+/g, ' ').trim());
  return chars.length > max ? chars.slice(0, max - 1).join('') + '…' : chars.join('');
}

/** A tab's width in layout px, before the DOM measured it. */
function estimateTabWidth(label, { driver = true } = {}) {
  const chars = Array.from(shortLabel(label));
  const text = chars.reduce((w, ch) => w + (isCjk(ch) ? CJK_PX : LATIN_PX), 0);
  return Math.round(TAB_BASE_PX + text + (driver ? DRIVER_PX : 0));
}

/** The rows in the window's FIRST-SEEN order: the refs it has already shown
 *  keep their places (a ref that left is dropped), new refs are appended in
 *  the list's own order. Returns `{ rows, order }` (order = the refs to keep). */
function stripOrder(prevOrder, rows) {
  const list = Array.isArray(rows) ? rows.filter((r) => r && r.ref) : [];
  const byRef = new Map(list.map((r) => [r.ref, r]));
  const out = [];
  const seen = new Set();
  for (const ref of Array.isArray(prevOrder) ? prevOrder : []) if (byRef.has(ref) && !seen.has(ref)) { seen.add(ref); out.push(byRef.get(ref)); }
  for (const r of list) if (!seen.has(r.ref)) { seen.add(r.ref); out.push(r); }
  return { rows: out, order: out.map((r) => r.ref) };
}

/** 0 = the tab you are looking at (never folds), 1 = a browser running a command, 2 = the rest. */
function stripPriority(row, shownRef) {
  if (row && row.ref === shownRef) return 0;
  return row && row.state === 'running' ? 1 : 2;
}

/**
 * Which tabs stay visible at `avail` px and which fold into `▾+N`.
 *   rows    in display order (stripOrder's)
 *   widths  ref → px (measured, or estimateTabWidth)
 *   avail   the strip's inner width
 *   reserve px always taken by the chip (+ the ▾+N button once anything folds)
 * Folds the HIGHEST priority value first (2, then 1), the RIGHTMOST first;
 * priority 0 never folds (even when it alone overflows — a scrollbar is
 * better than hiding what you look at). Returns { visible: [refs], folded: [refs] }
 * with both lists in display order.
 */
function stripFold({ rows = [], widths = {}, avail = Infinity, shownRef = null, chipPx = CHIP_PX, morePx = MORE_PX } = {}) {
  const list = (rows || []).filter((r) => r && r.ref);
  const w = (r) => { const v = widths instanceof Map ? widths.get(r.ref) : widths[r.ref]; return Number.isFinite(Number(v)) ? Number(v) : estimateTabWidth(r.label || r.ref); };
  const folded = new Set();
  const total = () => list.filter((r) => !folded.has(r.ref)).reduce((a, r) => a + w(r), 0) + chipPx + (folded.size ? morePx : 0);
  for (const pr of [2, 1]) {
    for (let i = list.length - 1; i >= 0 && total() > avail; i--) {
      const r = list[i];
      if (folded.has(r.ref) || stripPriority(r, shownRef) !== pr) continue;
      folded.add(r.ref);
    }
  }
  return { visible: list.filter((r) => !folded.has(r.ref)).map((r) => r.ref), folded: list.filter((r) => folded.has(r.ref)).map((r) => r.ref) };
}

/**
 * The `own/cap` chip (D4). `rows` = the strip's list (browser-stream
 * browserListFor); `cap` = the conversation's effective cap; `machine` =
 * `{used, cap}` of the whole machine (browsers + desktop apps).
 *   { own, cap, text:'2/3', full, over, machineFull }
 * `full` = own ≥ cap (the chip is red: the agent's next browser is refused
 * with THIS conversation's cap); `machineFull` = the machine's ceiling is
 * reached (a separate line: "machine ceiling reached" — never who holds it).
 */
function capChip({ rows = [], cap = 3, machine = null } = {}) {
  const own = (rows || []).filter((r) => r && (r.state === 'running' || r.state === 'idle')).length;
  const c = Math.max(1, Math.min(6, Math.round(Number(cap) || 3)));
  const mu = machine && Number.isFinite(Number(machine.used)) ? Number(machine.used) : 0;
  const mc = machine && Number.isFinite(Number(machine.cap)) ? Number(machine.cap) : 6;
  return { own, cap: c, text: `${own}/${c}`, full: own >= c, over: own > c, machineFull: !!machine && mu >= mc, machine: { used: mu, cap: mc } };
}

/** The chip's list: THIS conversation's own browsers that can be stopped —
 *  running (live) and not driven by the user right now; a shared attachment
 *  says it is shared instead (another conversation holds it too). */
function stoppableRows(rows) {
  return (rows || []).filter((r) => r && (r.state === 'running' || r.state === 'idle') && r.driver !== 'you')
    .map((r) => ({ ref: r.ref, kind: r.kind, label: r.label, helper: r.helper || null, shared: r.kind === 'attachment' && (Number(r.owners) || 0) > 0, owners: Number(r.owners) || 0 }));
}

/**
 * lane P verify (finding 6, 2026-09-26): the WORDS a tab's state dot / title says, as a code the window maps
 * to one sentence each — 'running' | 'idle' | 'ended' | 'released' | 'released-attached'. A released
 * conversation's OWN browser beside an attachment is 'released-attached': a bare command lands on the
 * attachment (one) or is refused profile_required (two), so the own browser is used again only when no
 * profile is attached — never "the next command starts it again". A released attachment / helper keeps
 * 'released' (its next command does start it).
 */
function rowStateWords(row, rows) {
  if (!row) return 'released';
  if (row.state === 'running' || row.state === 'idle' || row.state === 'ended') return row.state;
  if (row.kind === 'ephemeral' && (rows || []).some((r) => r && r.kind === 'attachment')) return 'released-attached';
  return 'released';
}

module.exports = { rowStateWords, LABEL_MAX, TAB_BASE_PX, CJK_PX, LATIN_PX, DRIVER_PX, MORE_PX, CHIP_PX, shortLabel, estimateTabWidth, stripOrder, stripPriority, stripFold, capChip, stoppableRows };
