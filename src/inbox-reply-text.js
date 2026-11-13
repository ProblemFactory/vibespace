'use strict';
// THE FOR-YOU REPLY'S TEXT PROTOCOL (PURE: imports nothing; CJS) — the marker line `[For you reply #ut-…]` and its
// parser, moved verbatim out of src/inbox-reply.js (which re-exports both, so every caller keeps its import) by lane
// minimap-person-rows: the turn preview (src/assistant-note.js personRow — a tray answer is the PERSON's row, previewed
// as its answer) runs in the daemon-bundled turn-map builders, and src/inbox-reply.js would have carried the For-you
// action tables (src/foryou-actions.js, ~115 KB) into the agent's bundle for one regular expression.

const REPLY_MARKER_RE = /^\[For you reply #(ut-[0-9a-f]{10})\]$/;
const lf = (s) => String(s).replace(/\r\n?/g, '\n');
/** THE CUT MARK (lane artifacts-by-intent r6: a token cut at ANY cap is no link — one rule for every cap). A cut that may
 *  split a token is MARKED where it is made: the store keeps an ask's words to TEXT_MAX / DETAIL_MAX (src/user-todos.js)
 *  through `clip` — cap − 1 chars and CUT_MARK, the kept length still the cap — and the reply's cut line below opens with
 *  it; every reader of a cut text (presentAsk's words — src/artifacts.js askOps —, the reply's quote — artifacts-of)
 *  drops the token the cut went through (`uncut`), never a rule of its own per cap. */
const CUT_MARK = '…';
// r7: never half a surrogate pair — the last kept unit a lone high surrogate steps back one (src/user-todos.js's facts cut
// was a second rule with this guard; it is this one now)
const clip = (s, cap) => { if (s.length <= cap) return s; let n = cap - 1; if (/[\ud800-\udbff]/.test(s[n - 1])) n--; return s.slice(0, n) + CUT_MARK; };
/** THE SAME WORDS ACROSS THE UPGRADE (r7): a copy a tree before the mark kept as a plain `cap`-unit slice (or an r6 cut that
 *  kept half a pair) and the cut `clip` keeps now are the same words when the stored copy starts with the kept words, the
 *  mark aside — a re-ask of the same words is a re-ask, never an edit. */
const sameWords = (kept, stored, cap) => kept === stored || (typeof kept === 'string' && typeof stored === 'string' && stored.length === cap && kept.length >= cap - 1 && kept.endsWith(CUT_MARK) && stored.startsWith(kept.slice(0, -1)));
/** The quote line composeReply writes under a detail it CUT at the cap (src/inbox-reply.js DETAIL_QUOTE_CAP) — written
 *  and read here, one grammar (lane artifacts-by-intent r5: a token the cap cut through is no word — the reader drops
 *  it, so «…/p/pgabcdefghij» cut from a longer token is no link). */
const cutLine = (cap, len, id) => `${CUT_MARK} (detail cut at ${cap} of ${len} chars — \`vibespace-ask show ${id}\` prints the whole item)`;
const CUT_LINE_RE = /^… \(detail cut at \d+ of \d+ chars — `vibespace-ask show (ut-[0-9a-f]{10})` prints the whole item\)$/;
const WORD_CH = /[A-Za-z0-9_-]/; // a page id runs on through these (src/artifacts.js PAGE_LINK's boundary)
/** WHERE A TEXT WAS CUT, and the page token each cut went through, as [start, end) spans of `s`: `end` = every CUT_MARK
 *  that ends a line or the text (the store's cut) and `cutAt` (parseReply: the reply's cut line); `start` = the word run
 *  before it — the whole token THE PAGE GRAMMAR would have matched (a page id is word characters), which the Artifacts
 *  readers drop (uncut). A link the writer ran into a «…» of its own at a line's end reads as cut too (the conservative
 *  side). Linear: one backward scan per cut, never past the one before (r5: a /…+$/ regex re-scans a long run from every
 *  start). The ONE place a cut is found: the tray's links read the same ends and let THEIR grammar name the token (r8 —
 *  src/lib/foryou-links.js: a URL or a path runs on across '.', '/', '?', '=', ':', where a page id stops). */
function cutRuns(s, cutAt = -1) {
  const src = typeof s === 'string' ? s : '';
  const ends = [];
  for (let i = src.indexOf(CUT_MARK); i >= 0; i = src.indexOf(CUT_MARK, i + 1)) if (i + 1 === src.length || src[i + 1] === '\n') ends.push(i);
  if (cutAt >= 0 && cutAt <= src.length) ends.push(cutAt);
  ends.sort((a, b) => a - b);
  const runs = [];
  let from = 0;
  for (const e of ends) { let b = e; while (b > from && WORD_CH.test(src[b - 1])) b--; runs.push([b, e]); from = e; }
  return runs;
}
/** A cut text, read: `s` without the runs cutRuns names (presentAsk's words, the reply's quote). */
function uncut(s, cutAt = -1) {
  const src = typeof s === 'string' ? s : '';
  let out = '', from = 0;
  for (const [b, e] of cutRuns(src, cutAt)) { out += src.slice(from, b); from = e; }
  return out + src.slice(from);
}

/** The inverse: `{id, quote, reply, cutAt}` (quote = the quoted lines without
 *  their `> ` prefix, joined by \n) or null when the text is not an inbox reply.
 *  The quote block ends at the first line that is not a quote line; the blank
 *  line after it is the separator, everything after it is the reply verbatim.
 *  `cutAt` = where in `quote` the detail the cap cut ends (its cut line follows —
 *  the quote's last line, or the one before `options:`), else -1. */
function parseReply(text) {
  if (typeof text !== 'string') return null;
  const src = lf(text);
  const nl = src.indexOf('\n');
  const head = nl < 0 ? src : src.slice(0, nl);
  const m = REPLY_MARKER_RE.exec(head);
  if (!m) return null;
  const rest = nl < 0 ? [] : src.slice(nl + 1).split('\n');
  const q = [];
  let i = 0;
  for (; i < rest.length; i++) {
    if (rest[i].startsWith('> ')) q.push(rest[i].slice(2));
    else if (rest[i] === '>') q.push('');
    else break;
  }
  if (i < rest.length && rest[i] === '') i++;
  let k = q.length - 1;
  if (k >= 0 && q[k].startsWith('options: ')) k--;
  const cm = k > 0 ? CUT_LINE_RE.exec(q[k]) : null;
  return { id: m[1], quote: q.join('\n'), reply: rest.slice(i).join('\n'), cutAt: cm && cm[1] === m[1] ? q.slice(0, k).join('\n').length : -1 };
}

module.exports = { REPLY_MARKER_RE, lf, parseReply, cutLine, CUT_LINE_RE, CUT_MARK, clip, sameWords, cutRuns, uncut };
