'use strict';
/**
 * PURE (imports nothing; CJS so the server, the route and the browser bundle
 * share ONE spelling) — a reply to a For-you inbox item (docs/design-user-inbox-reply.md §2).
 *
 * The owner's quoting rule: "注意回复inbox item的时候 发给agent的消息得带有对应的引用信息"
 * — a reply reaches the agent as a user message that OPENS with the item it
 * answers, so the agent knows exactly which ask this is:
 *
 *   [For you reply #ut-3f9a1c2b7d]
 *   > filed 12 min ago (2026-09-23 06:02 UTC) · urgency high
 *   > Approve the migration plan before I continue
 *   > detail:
 *   > Options: A) run now  B) wait for tonight's backup. I recommend B.
 *   > … (detail cut at 1500 of 1987 chars — `vibespace-ask show ut-3f9a1c2b7d` prints the whole item)
 *   > options: run now | wait for backup
 *
 *   wait for backup — and tell me when it is done.
 *
 * The marker line and every quote word are a PROTOCOL value (agent-facing,
 * English, never i18n'd). The reply text is text, not HTML: hostile strings
 * pass verbatim (the renderer escapes at paint time like any user message).
 *
 * `replyVerdict` is the ONE availability ladder: the server feeds it the real
 * session record's projection, the client the `active-sessions` payload's —
 * the codes and the sentences agree (the sentences are t() keys client-side).
 */

const REPLY_MARKER_RE = /^\[For you reply #(ut-[0-9a-f]{10})\]$/;
const DETAIL_QUOTE_CAP = 1500;   // chars of the item's detail quoted into the reply
const REPLY_MAX = 4000;          // chars of the user's own reply
const OPTIONS_MAX = 6;           // option chips per item
const OPTION_MAX_CHARS = 40;     // chars per option label
// Keys owned by a server producer (the spend guard / login watch / jobs): the
// answer surface is Manage Agents or the job panel, never a conversation.
const SERVER_KEYS = ['accounts', 'jobs'];

const REPLY_WHY = Object.freeze({
  no_session: 'Not from an agent session — nothing to reply to',
  job_item: 'Background Work item — answer it in the job panel',
  no_live_session: 'Agent not running — open the session, then reply',
  not_chat: 'Terminal session — reply in its window',
  host_unreachable: 'Host unreachable — reconnect, then reply',
});
// The two codes that mean "this item has no reply surface at all" — the client
// does not render the button (vs. a DISABLED one, which says why).
const REPLY_HIDDEN_CODES = Object.freeze(['no_session', 'job_item']);

const pad = (n) => String(n).padStart(2, '0');
function utcStamp(ms) {
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return 'unknown time';
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}
function relAgo(ms, now) {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (!Number.isFinite(s)) return 'at an unknown time';
  if (s < 60) return 'under a minute ago';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}
const lf = (s) => String(s).replace(/\r\n?/g, '\n');
const quote = (s) => lf(s).split('\n').map((l) => '> ' + l);

/** The user's reply text → `{ok:true, text}` (CRLF → LF, trimmed) or
 *  `{ok:false, code:'empty'|'too_long', why}`. */
function checkReplyText(raw) {
  const text = typeof raw === 'string' ? lf(raw).trim() : '';
  if (!text) return { ok: false, code: 'empty', why: 'The reply is empty' };
  if (text.length > REPLY_MAX) return { ok: false, code: 'too_long', why: `The reply is ${text.length} characters — the limit is ${REPLY_MAX}` };
  return { ok: true, text };
}

/** An item's option chips: `null` (none) or an array of ≤6 trimmed, distinct,
 *  non-empty labels of ≤40 chars. Anything else THROWS by name — a producer's
 *  mistake is refused where it is made, never silently trimmed away. */
function normalizeOptions(x) {
  if (x == null) return null;
  if (!Array.isArray(x)) throw new Error('options must be an array of labels');
  if (!x.length) return null;
  if (x.length > OPTIONS_MAX) throw new Error(`options: at most ${OPTIONS_MAX} labels (got ${x.length})`);
  const out = [];
  x.forEach((v, i) => {
    if (typeof v !== 'string') throw new Error(`options[${i}] must be a string`);
    const t = v.trim();
    if (!t) throw new Error(`options[${i}] is empty`);
    if (t.length > OPTION_MAX_CHARS) throw new Error(`options[${i}] is ${t.length} chars — at most ${OPTION_MAX_CHARS}`);
    if (/[|\r\n]/.test(t)) throw new Error(`options[${i}] may not contain "|" or a line break`);
    if (out.includes(t)) throw new Error(`options[${i}] duplicates "${t}"`);
    out.push(t);
  });
  return out;
}

/** The message the agent receives. `item` = a store item; `replyText` = the
 *  user's words (checked by checkReplyText first — this composes, it does not
 *  refuse: a non-string/blank reply composes as an empty body). */
function composeReply(item, replyText, { now = Date.now() } = {}) {
  const it = item || {};
  const lines = [`[For you reply #${it.id}]`];
  const at = Number(it.createdAt);
  lines.push(`> filed ${relAgo(at, now)} (${utcStamp(at)}) · urgency ${it.urgency || 'normal'}`);
  lines.push(...quote(String(it.text || '')));
  if (typeof it.detail === 'string' && it.detail) {
    const d = lf(it.detail);
    lines.push('> detail:');
    lines.push(...quote(d.length > DETAIL_QUOTE_CAP ? d.slice(0, DETAIL_QUOTE_CAP) : d));
    if (d.length > DETAIL_QUOTE_CAP) lines.push(`> … (detail cut at ${DETAIL_QUOTE_CAP} of ${d.length} chars — \`vibespace-ask show ${it.id}\` prints the whole item)`);
  }
  if (Array.isArray(it.options) && it.options.length) lines.push('> options: ' + it.options.join(' | '));
  const body = typeof replyText === 'string' ? lf(replyText).trim() : '';
  return lines.join('\n') + '\n\n' + body;
}

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

/** Can this item be replied to RIGHT NOW? `session` = a projection
 *  `{live, mode, remoteState}` of the item's session (null/undefined = not in
 *  the live list). → `{ok:true}` | `{ok:false, code, why}`. Mid-turn is NOT a
 *  refusal: the frame is written and the session's own send mode queues it. */
function replyVerdict({ item, session } = {}) {
  const it = item || {};
  const no = (code) => ({ ok: false, code, why: REPLY_WHY[code] });
  if (it.jobId) return no('job_item');
  const key = typeof it.sessionKey === 'string' ? it.sessionKey : '';
  if (!key || SERVER_KEYS.includes(key) || !key.includes(':')) return no('no_session');
  if (!session || session.live === false) return no('no_live_session');
  if (session.mode !== 'chat') return no('not_chat');
  if (session.remoteState) return no('host_unreachable');
  return { ok: true };
}

module.exports = {
  REPLY_MARKER_RE, DETAIL_QUOTE_CAP, REPLY_MAX, OPTIONS_MAX, OPTION_MAX_CHARS, SERVER_KEYS,
  REPLY_WHY, REPLY_HIDDEN_CODES,
  checkReplyText, normalizeOptions, composeReply, parseReply, replyVerdict,
};
