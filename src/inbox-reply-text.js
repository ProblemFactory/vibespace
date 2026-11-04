'use strict';
// THE FOR-YOU REPLY'S TEXT PROTOCOL (PURE: imports nothing; CJS) — the marker line `[For you reply #ut-…]` and its
// parser, moved verbatim out of src/inbox-reply.js (which re-exports both, so every caller keeps its import) by lane
// minimap-person-rows: the turn preview (src/assistant-note.js personRow — a tray answer is the PERSON's row, previewed
// as its answer) runs in the daemon-bundled turn-map builders, and src/inbox-reply.js would have carried the For-you
// action tables (src/foryou-actions.js, ~115 KB) into the agent's bundle for one regular expression.

const REPLY_MARKER_RE = /^\[For you reply #(ut-[0-9a-f]{10})\]$/;
const lf = (s) => String(s).replace(/\r\n?/g, '\n');

/** The inverse: `{id, quote, reply}` (quote = the quoted lines without their
 *  `> ` prefix, joined by \n) or null when the text is not an inbox reply. The
 *  quote block ends at the first line that is not a quote line; the blank line
 *  after it is the separator, everything after it is the reply verbatim. */
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
  return { id: m[1], quote: q.join('\n'), reply: rest.slice(i).join('\n') };
}

module.exports = { REPLY_MARKER_RE, lf, parseReply };
