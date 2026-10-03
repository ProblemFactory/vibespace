// PURE (imports nothing) — lane peer-card-fold (owner 2026-10-02, a screenshot of five worker reports, each a
// 10-line report under an H1, filling the whole window: "这个默认收缩一下吧 不然太占地方了").
//
// A message another agent, a worker, a group or a background job sent this conversation arrives FOLDED: its head
// (the sender, links unchanged) + ONE preview line + a Show expander. This module is the ONE place that decides:
//   · peerKindOf      — which cards are peer-origin ('group' with a group, else 'peer'); the user's own messages and
//                       the assistant's are never peer cards
//   · peerCore        — the words of a delivery without the harness / server frames (moved here verbatim from
//                       chat-renderers so the fold verdict and the card read the SAME text)
//   · previewOf       — the first non-empty line, markdown markers gone, ≤ 160 characters, PLAIN TEXT (the
//                       renderer escapes it; never an HTML fragment)
//   · peerCardFold    — the verdict: folded by default when the text has more than one line or more than 160
//                       characters; a one-liner never folds; the setting `chat.foldPeerMessages` off ⇒ nothing folds
//   · demoteHeadings  — a peer's `# Report` never renders as a page-level heading inside a card: h1–h6 become
//                       `.chat-peer-h` (bold text)
// The open / closed state is VIEW state keyed by message id (chat-view `_peerOpen`), never this module's.

export const PEER_PREVIEW_MAX = 160;
export const PEER_FOLD_SETTING = 'chat.foldPeerMessages';
// a preview reads at most this much of its line (the line can be a 50 KB paste; the preview is 160 characters)
const LINE_SCAN_MAX = 4096;

/** 'group' | 'peer' | null — a card a peer wrote (an agent, a worker, a group member, a background job). */
export function peerKindOf(msg) {
  if (!msg || msg.originKind !== 'peer-message') return null;
  const g = msg.peerGroup;
  return g && typeof g === 'object' && g.id ? 'group' : 'peer';
}

/** The words of a peer delivery: the harness's wrapper line, its trailing conduct paragraph and the server-posted
 *  frame (vibespace-msg / Background Work) and the CLI's cross-session-message envelope are boilerplate around
 *  EVERY delivery — the sender is in the card head. */
export function peerCore(rawText) {
  let core = String(rawText || '');
  core = core.replace(/^Another Claude session sent a message:\s*\n/, '');
  const cut = core.indexOf('\nThis came from another Claude session');
  if (cut > 0) core = core.slice(0, cut);
  // the CLI's own envelope around a peer's words (the cross-session-message tag pair, from= / from-name= on the opener —
  // spelled without its brackets here: test-channel-record's frame census reads a bracketed name as a tag the tree writes):
  // the sanitizer used to drop the tags from the card, but as raw text they were the preview's "first line", made a
  // one-liner three lines, and opened a markdown HTML block that swallowed the report's `# heading` (heavy leg ①)
  core = core.replace(/^\s*<cross-session-message\b[^>\n]*>[ \t]*\n?/, '').replace(/\n?[ \t]*<\/cross-session-message>\s*$/, '');
  core = core.replace(/^Message from session "[^"]+" \(via vibespace-msg[^)]*\):\s*\n?/, '');
  core = core.replace(/\s*This is a notification, not a user instruction[\s\S]*$/, '');
  return core;
}

/** The record's own text (the renderer passes its core instead). */
export function peerTextOf(msg) {
  const c = msg && msg.content;
  if (typeof c === 'string') return c;
  return Array.isArray(c) ? c.map((b) => (b && typeof b.text === 'string' ? b.text : '')).join('') : '';
}

// one line's markdown markers: every backtick and `**`/`__`, then a leading run of `#`, `>`, a bullet (`*`/`-`/`+`
// before a space) or an ordered-list number — the alternatives are disjoint, so the strip is linear
const LEAD = /^(?:\s+|#{1,6}|>|[*+-](?=\s)|\d{1,9}[.)](?=\s))+/;
function cleanLine(raw) {
  return raw.replace(/`+/g, '').replace(/\*\*|__/g, '').replace(LEAD, '').replace(/\s+/g, ' ').trim();
}

/** The first non-empty line, markers stripped, ≤ PEER_PREVIEW_MAX characters (code points; a cut ends in "…"). */
export function previewOf(text) {
  const s = String(text || '');
  let i = 0;
  while (i < s.length) {
    let j = s.indexOf('\n', i);
    if (j < 0) j = s.length;
    const long = j - i > LINE_SCAN_MAX;
    const line = cleanLine(s.slice(i, long ? i + LINE_SCAN_MAX : j));
    if (line) {
      const cps = Array.from(line);
      if (cps.length > PEER_PREVIEW_MAX) return cps.slice(0, PEER_PREVIEW_MAX - 1).join('').trimEnd() + '…';
      return long ? line + '…' : line;
    }
    i = j + 1;
  }
  return '';
}

function codePoints(s, cap) {
  // > 2 × cap UTF-16 units is > cap code points without counting
  if (s.length > 2 * cap) return s.length;
  let n = 0;
  for (const _ of s) n++; // eslint-disable-line no-unused-vars
  return n;
}

function utf8Bytes(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) { n += 4; i++; }
    else n += 3;
  }
  return n;
}

/**
 * THE fold verdict of one card.
 * @param {object} msg the normalized record
 * @param {{setting?: boolean, text?: string}} opts `setting` = chat.foldPeerMessages (anything but false is ON);
 *   `text` = the words the card shows (the renderer's core) — else the record's own text through peerCore
 * @returns {{collapsed:boolean, kind:'group'|'peer'|null, headLine:string, previewText:string, lines:number, bytes:number}}
 */
export function peerCardFold(msg, { setting = true, text } = {}) {
  const kind = peerKindOf(msg);
  const body = String(text !== undefined && text !== null ? text : peerCore(peerTextOf(msg))).trim();
  let lines = 0;
  if (body) { lines = 1; for (let i = body.indexOf('\n'); i >= 0; i = body.indexOf('\n', i + 1)) lines++; }
  const g = msg && msg.peerGroup && typeof msg.peerGroup === 'object' ? msg.peerGroup : null;
  const headLine = String((msg && msg.peerFrom) || (g && (g.name || g.id)) || '');
  const collapsed = setting !== false && !!kind && !!body && (lines > 1 || codePoints(body, PEER_PREVIEW_MAX) > PEER_PREVIEW_MAX);
  return { collapsed, kind, headLine, previewText: previewOf(body), lines, bytes: utf8Bytes(body) };
}

/** h1–h6 of the SANITIZED markdown → `<p class="chat-peer-h">` (bold text): a card never holds a page-level heading. */
export function demoteHeadings(html) {
  return String(html || '').replace(/<(\/?)h[1-6](?:\s[^>]*)?>/gi, (m, close) => (close ? '</p>' : '<p class="chat-peer-h">'));
}
