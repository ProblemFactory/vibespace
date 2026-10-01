'use strict';
/**
 * THE ONE BELT ON PEER TEXT TOWARD AN AGENT (lane peer-census, B-00ef, 2026-09-29) — PURE (imports only the two
 * PURE modules whose rules it composes: src/channel-record.js for the frame rule, src/hidden-chars.js for the hidden
 * set; CJS so the server, the daemon bundle and the client bundle share ONE spelling).
 *
 * WHY ONE MODULE. Text a peer wrote — a mail, a Lark message, a page's dialog words, a group message, a job's output
 * line, a For-you item quoted into a reply, another session's `vibespace-msg` — reaches an agent's context through
 * MANY doors, and three lanes learned the same three rules one door at a time (channel-render: bounded before parse,
 * linear time; lark-search-poll r2/r3: the frame check looks THROUGH invisible characters, the line rule per line
 * and per inline piece; browser-stuck: invisibles folded, frames inert, the page's words delimited; pairing r6:
 * src/hidden-chars.js is the ONE hidden set). Every door spelled its own composition, and the held LOW nobody owned
 * was a door that quoted lines with none of it. This module IS the composition, in the one order that is safe:
 *
 *   1. BOUND — `cutText`: the text is cut to `max` UTF-16 units BEFORE anything walks it (a regex over a 1 MiB body
 *      is the event-loop stall of the channel-render round; the cut never splits a surrogate pair and ends in `…`,
 *      counted inside `max`);
 *   2. FOLD — `foldHidden`: every character hidden-chars.js calls hidden is taken out of what the agent reads — a
 *      control or a line / paragraph separator becomes a space, a format character (zero-width space, word joiner,
 *      BOM, soft hyphen, the bidi embeddings / overrides / isolates, the TAG block — an ASCII copy that draws as
 *      nothing) is removed; ZWJ / ZWNJ stay (emoji sequences, Indic and Persian words); CRLF is a line ending;
 *      what the agent reads is what the user sees, and no invisible run can split a frame tag any more;
 *   3. FRAME — channel-record's rule 3 over the whole text (a tag whose attribute run crosses a line), then
 *      `inertFrameLine` PER LINE and per inline piece: a frame opener left dangling at a line's end loses its `<`, so
 *      the `>` of the NEXT line — a quote mark, a list bullet, a JSON quote, the next site's own prefix — completes
 *      nothing. (`<system-reminder>` → `[system-reminder]`, `hi <system-reminder` → `hi [system-reminder`.)
 *
 * `toAgentText(raw, {max, kind})`: `kind:'block'` (default) keeps the text's own lines (each judged on its own);
 * `kind:'line'` is ONE inline piece — every line break / tab run becomes one space (an author name, a title, a job's
 * announce line, an option chip). `toAgentLines` = the block's lines, for a site that prefixes each (`> `).
 * The output is never longer than `max`, and running it again changes nothing (idempotent).
 *
 * WHO CALLS IT: every row of scripts/test-peer-text-census.mjs that claims `frame-inert` / `folded` / `bounded` —
 * the census is grep-derived over the tracked tree and a site that claims the rule without the call is red. The
 * page-dialog module (src/browser-stuck.js) ships ALONE to every host, so it carries the frame rule as a copy the
 * census pins byte-equal to channel-record's; everything else calls here.
 */
const R = require('./channel-record.js');
const HC = require('./hidden-chars.js');

/** The record's own bound (64 KiB) — a belt, not a cut, on every site whose text is bounded upstream. */
const TEXT_MAX = R.MAX_TEXT;
const ELLIPSIS = '…';
const JOINERS = new Set(['\u200C', '\u200D']);
/** The controls and separators that become a SPACE (the rest of the hidden set is removed). Tab and line feed are
 *  not hidden (hidden-chars.js); CR is — a lone CR (the terminal's overwrite trick) is a space, CRLF a line ending. */
const SPACE_RE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
const HIDDEN_G = new RegExp(HC.HIDDEN_RE.source, 'gu');

const str = (v) => (v === null || v === undefined ? '' : (typeof v === 'string' ? v : String(v)));

/** BOUND FIRST: at most `max` UTF-16 units — a cut ends in `…` (counted), never inside a surrogate pair.
 *  `max` ≤ 0 ⇒ ''; a non-finite `max` ⇒ the whole text. */
function cutText(raw, max = TEXT_MAX) {
  const t = str(raw);
  const m = Number(max);
  if (Number.isNaN(m)) return t;
  if (m <= 0) return '';
  if (!Number.isFinite(m) || t.length <= m) return t;
  let n = Math.max(0, Math.floor(m) - ELLIPSIS.length);
  if (n > 0 && /[\uD800-\uDBFF]/.test(t.charAt(n - 1))) n -= 1;
  return t.slice(0, n) + ELLIPSIS;
}

/** FOLD: CRLF → LF; every hidden character (hidden-chars.js's ONE set) out — controls / separators to a space,
 *  format characters removed, the joiners kept. `line: true` folds every line break / tab run to ONE space too. */
function foldHidden(raw, { line = false } = {}) {
  let t = str(raw).replace(/\r\n/g, '\n');
  t = t.replace(HIDDEN_G, (c) => (JOINERS.has(c) ? c : (SPACE_RE.test(c) ? ' ' : '')));
  if (line) t = t.replace(/[\n\t]+/g, ' ');
  return t;
}

/** THE BELT: bound → fold → frame rule per line (and per inline piece). Never longer than `max`; idempotent. */
function toAgentText(raw, { max = TEXT_MAX, kind = 'block' } = {}) {
  const line = kind === 'line';
  let t = cutText(raw, max);
  t = foldHidden(t, { line });
  if (line) return R.inertFrameLine(t);
  // PER LINE, never the whole text first: a whole-text pass matched `<system-reminder⏎> …` across the line break and
  // swallowed the next line with its quote mark; judged line by line, the opener loses its `<` and every line keeps
  // its own words and its own prefix (a tag split over two lines cannot exist once no line ends in an opener)
  return t.split('\n').map((l) => R.inertFrameLine(l)).join('\n');
}

/** The block's lines, each judged on its own (a site prefixes every one — `> `, `- `). */
function toAgentLines(raw, opts = {}) {
  return toAgentText(raw, { ...opts, kind: 'block' }).split('\n');
}

module.exports = {
  TEXT_MAX, ELLIPSIS,
  cutText, foldHidden, toAgentText, toAgentLines,
  // the frame rule's own predicate, re-exported so a site's suite asks the rule that produced the text
  carriesFrame: R.carriesFrame, FRAME_TAGS: R.FRAME_TAGS,
};
