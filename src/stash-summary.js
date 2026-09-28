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

const KIND_ORDER = Object.freeze(['channel-receipt', 'channel', 'job', 'handback', 'window-request', 'notice', 'peer']);

/** One stash entry's kind. `job: true` = an entry of the jobs engine's own stash. */
function kindOf(e, { job = false } = {}) {
  if (job) return 'job';
  if (!e || typeof e !== 'object') return 'notice';
  const src = String(e.source || '');
  const from = typeof e.fromName === 'string' ? e.fromName.trim() : '';
  if (src === 'channel-receipt') return 'channel-receipt';
  if (src === 'channel') return 'channel';
  if (src === 'window-request') return 'window-request';
  if (e.kind === 'notification') {
    if (from === 'VibeSpace browser') return 'handback';
    if (from.startsWith('Background Work · ')) return 'job';
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
  for (const e of Array.isArray(msg) ? msg : []) {
    const kind = kindOf(e);
    add(kind, kind === 'peer' ? String((e && e.fromName) || '').slice(0, 80) || null : null, e && e.ts);
  }
  for (const n of Array.isArray(jobs) ? jobs : []) add('job', null, n && n.ts);
  if (!count) return null;
  const items = [...groups.values()].sort((a, b) => (KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)) || String(a.label || '').localeCompare(String(b.label || '')));
  return { count, oldestAt: oldestAt || null, items };
}

/** A digest that changes with every printed field (the strip / the card patch only on a change). */
function summaryDigest(s) {
  if (!s || !s.count) return '';
  return s.count + '|' + s.items.map((i) => `${i.kind}:${i.label || ''}:${i.n}`).join(',');
}

/** One part of the sentence per group, in the device's words. */
function partWords(item, t) {
  const n = Number(item && item.n) || 0;
  const one = n === 1;
  switch (item && item.kind) {
    case 'channel-receipt': return one ? t('a channel receipt') : t('{n} channel receipts', { n });
    case 'channel': return one ? t('a channel message') : t('{n} channel messages', { n });
    case 'job': return one ? t('a job result') : t('{n} job results', { n });
    case 'handback': return one ? t('a browser handback') : t('{n} browser handbacks', { n });
    case 'window-request': return one ? t('a window request') : t('{n} window requests', { n });
    case 'notice': return one ? t('a VibeSpace notice') : t('{n} VibeSpace notices', { n });
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
 *  says so; measured through the real codex consumer). `cost` = that word alone; `held` rides beside the button. */
function stashSummaryWords(summary, t, { billed = true, inFlight = false, held = 0, reachable = true } = {}) {
  if (!summary || !summary.count) return null;
  const n = summary.count;
  const head = n === 1 ? t('1 notice is waiting for this agent’s next turn') : t('{n} notices are waiting for this agent’s next turn', { n });
  const parts = summary.items.map((i) => partWords(i, t));
  const h = Number(held) > 0 ? Number(held) : 0;
  const heldWords = h ? (h === 1 ? t('1 more is held for the next hand-over') : t('{n} more are held for the next hand-over', { n: h })) : null;
  const costWords = billed ? t('starts a turn') : t('joins the running turn');
  return {
    head,
    parts,
    line: `${head}: ${parts.join(', ')}`,
    button: inFlight ? t('Handing over…') : t('Hand over now'),
    cost: reachable ? costWords : null,
    held: heldWords,
    // no hand-over for this harness: the sentence stands where the button would
    noButton: reachable ? null : t('they ride your next message'),
    title: !reachable ? t('This agent has no live inbox — every waiting notice is delivered with your next message')
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

module.exports = { KIND_ORDER, kindOf, summarize, summaryDigest, partWords, stashSummaryWords, handedOverWords };
