'use strict';
/**
 * WHAT IS WAITING FOR AN AGENT'S NEXT TURN — the stash made visible (the owner,
 * 2026-09-27: "能看到，只是会堆积到我下次发消息给它，这个有点 confusing，因为我在界面里完全看不到'有消息在
 * queue'这件事情"). PURE (imports nothing; CJS so the server's live session fact and the bundle's strip share
 * ONE spelling).
 *
 * Two stores hold notices for a conversation until its next context injection: the delivery ladder's durable
 * stash (src/server/conversation-deliver.js — channel receipts and wakes, agent messages, the browser handback, a
 * window request, a notice) and the Background Work engine's own (src/jobs.js pendingNotifs — a job result
 * refused by the spend ceiling or with no live inbox). `summarize({msg, jobs})` = the fact the `active-sessions`
 * payload carries per session: `{count, oldestAt, items:[{kind, label, n}]}` (null when nothing waits) — kinds
 * in KIND_ORDER, a peer's messages grouped by its NAME (a label the peer chose: the strip draws it as text).
 * A kind is decided by the entry's SOURCE and PATH (`source`, `kind`), the sender name only for the names
 * VibeSpace itself speaks under (src/notification-senders.js: 'Background Work · ', 'VibeSpace browser',
 * 'Channels · ') — never a peer's word for itself.
 * `stashSummaryWords(summary, t, {billed})` = the strip's words: the head ("3 notices are waiting for this
 * agent's next turn"), one part per kind ("a channel receipt", "2 job results", "a message from Ada"), the
 * button and — when handing over would start a billed turn — its cost in words.
 *
 * Gate: scripts/test-stash-strip.mjs.
 */

// 'group' (lane group-report-card): a group message waiting for this member's next turn — it lives in the groups
// engine, not in a stash (src/server/stash-handover.js adds the engine's preview as entries with source 'group'), so a
// hand-over never carries it: it rides the next turn, whoever starts it (lane stash-any-turn: the owner's message, a
// notification's or a receipt's wake, auto-resume's continue — or an @mention's wake)
const { CLEARED_TEXT } = require('./record-clear.js');   // PURE: the stored sentence a clear leaves (worded by previewWords)
// 'retrying' (lane notify-retry, 2026-10-01): a notification the delivery ladder PARKED — the agent was alive and did
// not accept it at once (a transient miss on a live pid); it is posted again at the conversation's turn end and on a
// bounded backoff (src/server/conversation-deliver.js, the retry park). It is listed first: it is on its way, not
// waiting for a prompt. The fact carries `retrying: {n, nextAt}` beside the items.
const KIND_ORDER = Object.freeze(['retrying', 'channel-receipt', 'channel', 'channel-reaction', 'job', 'handback', 'window-request', 'design-comment', 'doc-comment', 'doc-edit', 'notice', 'group', 'peer']);
/** THE sender name of the reaction digest (lane channel-threads, spec §5.4 — `👍 ×3 on your reply in <conversation>`), spelled
 *  ONCE: the channels engine files under it, this module and the agent's injection read it. The naive-user pass
 *  (2026-09-28): a digest was a "channel message" in the strip — the owner could not tell a reaction from a message —
 *  and the agent's injection appended "a channel message is answered with vibespace-channels reply", inviting a reply
 *  to a 🎉. It is its own kind: `channel-reaction`. */
const REACTION_DIGEST_FROM = 'Channels · reactions';

/** One stash entry's kind. `job: true` = an entry of the jobs engine's own stash. */
function kindOf(e, { job = false } = {}) {
  if (job) return 'job';
  if (!e || typeof e !== 'object') return 'notice';
  const src = String(e.source || '');
  const from = typeof e.fromName === 'string' ? e.fromName.trim() : '';
  if (src === 'retry' || (e.held && e.held.kind === 'retrying')) return 'retrying';
  if (src === 'group') return 'group';
  if (src === 'channel-receipt') return 'channel-receipt';
  if (src === 'channel') return from === REACTION_DIGEST_FROM ? 'channel-reaction' : 'channel';
  if (src === 'window-request') return 'window-request';
  if (src === 'doc-comment' || src === 'doc-edit') return src;   // lane doc-window: the USER's comments on a markdown file / the note that they saved it — the next turn reads them
  if (src === 'design-comment') return 'design-comment';   // lane design-core: the USER's own comment on an artboard, waiting because no live chat process could take it
  if (e.kind === 'notification') {
    if (from === 'VibeSpace browser') return 'handback';
    if (from.startsWith('Background Work · ')) return 'job';
    if (from === REACTION_DIGEST_FROM) return 'channel-reaction';
    if (from.startsWith('Channels · ')) return 'channel';
    return 'notice';
  }
  return 'peer';
}

/** The live session fact: null when nothing waits. */
function summarize({ msg = [], jobs = [] } = {}) {
  const groups = new Map();
  let count = 0, oldestAt = 0;
  const add = (kind, label, ts) => {
    const k = kind + '\u0000' + (label || '');
    const g = groups.get(k) || { kind, label: label || null, n: 0 };
    g.n += 1;
    groups.set(k, g);
    count += 1;
    const at = Number(ts) || 0;
    if (at > 0 && (!oldestAt || at < oldestAt)) oldestAt = at;
  };
  let retrying = null;   // {n, nextAt}: the parked ones and the soonest next attempt
  for (const e of Array.isArray(msg) ? msg : []) {
    const kind = kindOf(e);
    add(kind, kind === 'peer' || kind === 'group' ? String((e && e.fromName) || '').slice(0, 80) || null : null, e && e.ts);
    if (kind === 'retrying') { const at = Number(e && e.held && e.held.nextAt) || 0; retrying = { n: (retrying ? retrying.n : 0) + 1, nextAt: retrying && retrying.nextAt && (!at || retrying.nextAt < at) ? retrying.nextAt : at || null }; }
  }
  for (const n of Array.isArray(jobs) ? jobs : []) add('job', null, n && n.ts);
  if (!count) return null;
  const items = [...groups.values()].sort((a, b) => (KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)) || String(a.label || '').localeCompare(String(b.label || '')));
  // THE DETAILS (the owner, 2026-09-28: "现在是完全看不了这个细节了嘛? 包括在聊天框里 queue 的时候也没法展开看细节"):
  // one preview per waiting entry, oldest first, at most PREVIEW_MAX — the entry's first non-empty line cut at
  // PREVIEW_CHARS. A head is PEER-WRITTEN text: the strip draws it as textContent, never markup, and the count
  // says how many are not previewed (`previewsHeld`) so the list never pretends to be whole.
  const all = [
    ...(Array.isArray(msg) ? msg : []).map((e) => ({ kind: kindOf(e), label: kindOf(e) === 'peer' || kindOf(e) === 'retrying' ? String((e && e.fromName) || '').slice(0, 80) || null : null, at: Number(e && e.ts) || 0, head: previewHead(e && e.text) })),
    ...(Array.isArray(jobs) ? jobs : []).map((n) => ({ kind: 'job', label: n && n.jobName ? String(n.jobName).slice(0, 80) : null, at: Number(n && n.ts) || 0, head: previewHead(n && n.text) })),
  ].sort((a, b) => a.at - b.at);
  const previews = all.slice(0, PREVIEW_MAX);
  return { count, oldestAt: oldestAt || null, items, previews, previewsHeld: Math.max(0, all.length - previews.length), ...(retrying ? { retrying } : {}) };
}

/** The first non-empty line of a waiting entry's text, cut at PREVIEW_CHARS (an ellipsis names the cut). A frame
 *  that carries the ladder's own head ("VibeSpace (this workspace, not another agent) reports:") shows what follows it. */
function previewHead(text) {
  const lines = String(text == null ? '' : text).replace(/\r\n?/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean);
  let i = 0;
  if (lines.length > 1 && /^VibeSpace \(this workspace, not another agent\) reports:$/.test(lines[0])) i = 1;
  const first = lines[i] || '';
  return first.length > PREVIEW_CHARS ? first.slice(0, PREVIEW_CHARS - 1) + '…' : first;
}
const PREVIEW_MAX = 12;
const PREVIEW_CHARS = 140;

/** A digest of the previews alone (the strip's list patches only when a preview changes; `summaryDigest` keeps
 *  its shape for the card hint, which prints no preview). */
function previewDigest(s) {
  if (!s || !s.count || !Array.isArray(s.previews)) return '';
  return s.previews.map((p) => `${p.kind}:${p.label || ''}:${p.at}:${p.head}`).join('\u0001') + '|' + (Number(s.previewsHeld) || 0);
}

/** One preview row's words: the kind (as its singular part) and the head, "a job result · Build done" — a peer's row
 *  names the peer, a job's row the job. */
function previewWords(p, t) {
  if (!p) return '';
  // the .197 integration (lane-redact's owed note on lane stash-detail): a CLEARED entry holds the stored English key —
  // said in the device's words (a job's name and a line's head alike)
  const w = (s) => (s === CLEARED_TEXT ? t(CLEARED_TEXT) : s);
  const who = p.kind === 'job' && p.label ? t('Background Work · {name}', { name: w(p.label) })
    : p.kind === 'retrying' && p.label ? t('{name} · being retried', { name: w(p.label) })   // the parked notification names its sender (a job's "Background Work · <name>")
      : partWords({ kind: p.kind, n: 1, label: p.label ? w(p.label) : p.label }, t);
  return p.head ? `${who} · ${w(p.head)}` : who;
}

/** A digest that changes with every printed field (the strip / the card patch only on a change). */
function summaryDigest(s) {
  if (!s || !s.count) return '';
  return s.count + '|' + s.items.map((i) => `${i.kind}:${i.label || ''}:${i.n}`).join(',') + (s.retrying ? `|rt:${s.retrying.n}:${s.retrying.nextAt || 0}` : '');
}

/** One part of the sentence per group, in the device's words. */
function partWords(item, t) {
  const n = Number(item && item.n) || 0;
  const one = n === 1;
  switch (item && item.kind) {
    case 'retrying': return one ? t('a notice being retried') : t('{n} notices being retried', { n });
    case 'channel-receipt': return one ? t('a channel receipt') : t('{n} channel receipts', { n });
    case 'channel': return one ? t('a channel message') : t('{n} channel messages', { n });
    case 'channel-reaction': return one ? t('a reaction notice') : t('{n} reaction notices', { n });
    case 'job': return one ? t('a job result') : t('{n} job results', { n });
    case 'handback': return one ? t('a browser handback') : t('{n} browser handbacks', { n });
    case 'window-request': return one ? t('a window request') : t('{n} window requests', { n });
    case 'design-comment': return one ? t('a design comment') : t('{n} design comments', { n });
    case 'doc-comment': return one ? t('a document comment') : t('{n} document comments', { n });
    case 'doc-edit': return one ? t('a document edit') : t('{n} document edits', { n });
    case 'notice': return one ? t('a VibeSpace notice') : t('{n} VibeSpace notices', { n });
    case 'group': {   // lane group-report-card: a group message waiting for the next turn, by its sender
      const name = item.label;
      if (!name) return one ? t('a group message') : t('{n} group messages', { n });
      return one ? t('a group message from {name}', { name }) : t('{n} group messages from {name}', { n, name });
    }
    case 'peer': {
      const name = item.label || t('another agent');
      return one ? t('a message from {name}', { name }) : t('{n} messages from {name}', { n, name });
    }
    default: return one ? t('a notice') : t('{n} notices', { n });
  }
}

/** The strip's words. `billed` = handing over now would start a turn (the session is not mid-turn); `inFlight` = a
 *  hand-over is on its way (the button waits); `held` = the entries one hand-over would leave behind (its budget —
 *  named, never hidden in a count); `reachable` = a hand-over exists for this harness at all (a stash-only lane has
 *  no button: the notices ride the next message).
 *  THE MONEY WORD IS ALWAYS SAID, ON THE BUTTON (channel-jump verify r4 — a press that bills must say so where the
 *  user presses): "starts a turn" when a turn would be billed; "joins the running turn" on the one lane that folds a
 *  notification into the turn already running — the MECHANISM, not a price, because that fold is the wrapper's to
 *  refuse (a review / compact turn, a turn that ends first: the frame then runs as its own billed turn, and the ledger
 *  says so; measured through the real codex consumer). `cost` = that word alone; `held` rides beside the button.
 *  `midTurn` (B-c198, the owner 2026-10-02): the agent is running a turn. What waits for "the next turn" rides the
 *  next turn's injection (UserPromptSubmit — a turn of ANY origin since lane stash-any-turn, 2026-10-05) — a message
 *  typed into a running turn is folded into it with no such hook (and a long-running agent's turn can last hours):
 *  mid-turn the strip says the next turn AFTER this one ends. */
function stashSummaryWords(summary, t, { billed = true, inFlight = false, held = 0, reachable = true, now = Date.now(), armed = false, midTurn = false } = {}) {
  if (!summary || !summary.count) return null;
  const n = summary.count;
  // THE RETRYING ONES (lane notify-retry): on their way by themselves — the head says so when they are all there is,
  // and the next attempt is named either way ("when this turn ends" is the sooner door)
  const rt = summary.retrying && Number(summary.retrying.n) > 0 ? summary.retrying : null;
  const allRetrying = !!rt && rt.n >= n;
  const head = allRetrying ? (n === 1 ? t('1 notice is being retried for this agent') : t('{n} notices are being retried for this agent', { n }))
    : n === 1 ? t('1 notice is waiting for this agent’s next turn') : t('{n} notices are waiting for this agent’s next turn', { n });
  const retryWords = rt ? (allRetrying ? t('next attempt {when} or when this turn ends', { when: whenWords(rt.nextAt, now, t) })
    : (rt.n === 1 ? t('1 of them is being retried ({when})', { when: whenWords(rt.nextAt, now, t) }) : t('{n} of them are being retried ({when})', { n: rt.n, when: whenWords(rt.nextAt, now, t) }))) : null;
  const parts = summary.items.map((i) => partWords(i, t));
  const h = Number(held) > 0 ? Number(held) : 0;
  const heldWords = h ? (h === 1 ? t('1 more is held for the next hand-over') : t('{n} more are held for the next hand-over', { n: h })) : null;
  // GROUP MESSAGES RIDE THE NEXT MESSAGE (lane group-report-card): a hand-over carries the stash, never the groups
  // engine's reports — so they are counted apart. All of what waits is group messages ⇒ no button (the server says
  // `reachable: false`), the sentence where it would be; some ⇒ the button stays and the count they are is said.
  const rides = (summary.items || []).filter((i) => i && i.kind === 'group').reduce((a, i) => a + (Number(i.n) || 0), 0);
  const groupOnly = rides > 0 && rides >= n;
  const ridesWords = rides && !groupOnly ? (midTurn
    ? (rides === 1 ? t('1 group message rides the next turn, after this one ends') : t('{n} group messages ride the next turn, after this one ends', { n: rides }))
    : (rides === 1 ? t('1 group message rides the next turn') : t('{n} group messages ride the next turn', { n: rides }))) : null;
  const costWords = billed ? t('starts a turn') : t('joins the running turn');
  return {
    head,
    parts,
    line: `${head}: ${parts.join(', ')}`,
    button: inFlight ? t('Handing over…') : t('Hand over now'),
    cost: reachable ? costWords : null,
    held: [armed ? t('they will arrive as a message when this turn ends') : null, retryWords, heldWords, ridesWords].filter(Boolean).join(' · ') || null,   // `armed` (R3): the last prompt could not carry them inline
    // no hand-over for this harness: the sentence stands where the button would
    noButton: reachable ? null : midTurn ? t('this agent is mid-turn — they ride the next turn, after this one ends') : t('they ride the next turn'),
    title: allRetrying ? t('The agent did not accept this at once; VibeSpace posts it again when its turn ends and on a schedule — Hand over now delivers it this instant')
      : groupOnly ? (midTurn ? t('This agent is mid-turn — a message typed into a running turn carries no group message; they ride its next turn after this one ends, whoever starts it, or at once when a member @mentions it') : t('Group messages ride this agent’s next turn, whoever starts it — your message, a notification, a reply receipt — or at once when a member @mentions it'))
      : !reachable ? (midTurn ? t('This agent has no live inbox and is mid-turn — every waiting notice rides its next turn, after this one ends') : t('This agent has no live inbox — every waiting notice rides its next turn'))
      : inFlight ? t('A hand-over is on its way')
        : billed ? t('Delivers every waiting notice now, as one message — it starts a billed turn for this agent')
          : t('Delivers every waiting notice now, as one message — it joins the turn already running; if that turn cannot take it, it runs as its own billed turn right after'),
  };
}

/** After a hand-over: the toast — names what went AND what is still held (never a count that hides the rest). */
function handedOverWords(r, t) {
  const n = Number(r && r.delivered) || 0;
  const h = Number(r && r.held) || 0;
  if (!h) return t('Handed over {n} waiting notice(s)', { n });
  return t('Handed over {n} waiting notice(s); {h} more are still held — hand over again or send a message', { n, h });
}

/** THE HANDED-OVER CARD'S FACTS (2026-09-28): the hand-over's card text opens with its own head line
 *  ("2 waiting notice(s) handed over") and carries the delivered notices below it — the card's title is that head in
 *  the device's words and the notices sit behind an expander that says how many it holds (the owner: the count
 *  alone was all the card showed). Returns null for any other text (noticeCardView's other rules apply). */
/** "in 25 s" / "in 4 min" / "now" — a next attempt relative to `now` (a clock the caller injects). */
function whenWords(at, now, t) {
  const d = Math.max(0, (Number(at) || 0) - (Number(now) || 0));
  if (!Number(at) || d < 1000) return t('now');
  if (d < 90 * 1000) return t('in {n} s', { n: Math.round(d / 1000) });
  return t('in {n} min', { n: Math.round(d / 60000) });
}
/** WHY THE NOTICES WAITED (lane notify-retry, R4 — the hand-over card said "completed while this conversation was
 *  closed" for a conversation that never closed): the English sentence for a set of held kinds, ONE closed table,
 *  read back by `handoverFacts` as a key the client translates. Null when nothing states a reason (a peer's message). */
const HELD_WHY = Object.freeze({
  'not-running': 'they arrived while this conversation was not running',
  'not-reachable': 'the agent did not accept them at once (busy or unreachable) — delivered now',
  'retrying': 'their delivery was being retried — delivered now',
  'maybe-delivered': 'the server stopped while they were being sent — some may have reached the agent already, delivered again now',   // verify r2: a may-have-landed entry (its own key — `heldKeyOf`)
  'rate-floor': 'they were paced by the 30 s per-conversation floor',
  'spend-cap': 'the spending ceiling held them',
  'wrapper-no-steer': 'this agent’s process predates mid-turn notifications',
  'off': 'auto-notify was off for this conversation',
});
/** the why-key of a held record: its kind, except a may-have-landed one (verify r2) — the hand-over card must say a repeat is possible */
function heldKeyOf(held) { return held && typeof held === 'object' ? (held.maybeDelivered === true ? 'maybe-delivered' : held.kind || null) : null; }
function heldWhyOf(kinds) {
  const ks = [...new Set((Array.isArray(kinds) ? kinds : []).filter((k) => HELD_WHY[k]))];
  if (!ks.length) return null;
  if (ks.length === 1) return HELD_WHY[ks[0]];
  return 'they were held until now';
}
const HANDOVER_HEAD_RE = /^(\d+) waiting notice\(s\) handed over(?: — (.+))?$/;
function handoverFacts(body) {
  const lines = String(body == null ? '' : body).replace(/\r\n?/g, '\n').split('\n');
  const m = HANDOVER_HEAD_RE.exec((lines[0] || '').trim());
  if (!m) return null;
  const n = Number(m[1]) || 0;
  const rest = lines.slice(1).join('\n').trim();
  // the why is ONE of the table's sentences (anything else is not ours): a param that is itself a key — the client's
  // card translates it (chat-renderers)
  const why = m[2] && (Object.values(HELD_WHY).includes(m[2]) || m[2] === 'they were held until now') ? m[2] : null;
  return { title: why ? { key: '{n} waiting notice(s) handed over — {why}', params: { n, why: { key: why } } } : { key: '{n} waiting notice(s) handed over', params: { n } }, body: rest, foldLabel: { key: 'Show the {n} notice(s)', params: { n } }, ...(why ? { why } : {}) };
}
/** The hand-over card's text: the head line, then the delivered notices (what the agent was given, minus the
 *  hand-over sentence and its id). */
function handoverCardText(n, text, { why = null } = {}) { return `${Number(n) || 0} waiting notice(s) handed over${why ? ` — ${why}` : ''}\n\n${String(text || '').trim()}`; }

module.exports = { KIND_ORDER, REACTION_DIGEST_FROM, kindOf, summarize, summaryDigest, previewDigest, previewWords, previewHead, PREVIEW_MAX, PREVIEW_CHARS, partWords, stashSummaryWords, handedOverWords, handoverFacts, handoverCardText, HANDOVER_HEAD_RE, HELD_WHY, heldWhyOf, heldKeyOf, whenWords };
