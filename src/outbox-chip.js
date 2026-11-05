'use strict';
/**
 * A CONVERSATION WEARS ITS OUTBOX (lane outbox-session-chip; the owner, 2026-11-05: «一个 agent 可能发多个 Outbox draft，有的要改有的
 * 不改，很难 keep track 每个 session 发了哪些、哪些被改过»). PURE (no DOM, no I/O; imports only outbox-census, PURE → PURE): a chat
 * window's «Outbox» chip, the session menu's «Outbox of this conversation» and the Outbox window's «drafted by <conversation>»
 * filter are ONE question over the SAME rows — what the client holds of both Outbox sections (the store's message proposals:
 * GET /api/channels/outbox, then every `channel-outbox-updated`; the raw-API calls: GET /api/channels/api, re-read on every
 * `channel-api-updated`) — so the chip never counts a row the filtered window does not show, nor misses one it does
 * (acceptance r1 N1: an API call waiting for the owner wore no chip).
 *
 *   conversationKeys({claudeId, backendSessionId, sessionId, webuiId}) — the ids a conversation DRAFTS under: the agent
 *     principal's id (agent-routes.js channelPrincipal: claude › backend › `webui:<id>`), every form it can have taken. A
 *     subagent of the conversation (a Task / Workflow agent) runs inside its parent's session, so its proposals carry the SAME
 *     id and count as the conversation's own with no rule here; a helper conversation is a session of its own and wears its
 *     own chip (the outbox records one drafter — two chips claiming one proposal would say it twice).
 *   draftedByAny(p, keys) — the proposal's drafter is one of `keys` (an agent; the owner's own drafts belong to no conversation).
 *   partlySent(p) — SENT with a part that did not land (lane lark-upload-preflight's «partly sent», never a plain «sent»).
 *   outboxRowsOf({proposals, apiCards}, filter) — THE ROWS a filter `{keys}` keeps, both sections: the message proposals its
 *     conversation drafted (outboxFilterOf) and the raw-API calls it filed (apiFilterOf); no filter ⇒ both lists as they are.
 *     The filtered Outbox window draws these rows and counts them; the chip counts the same rows.
 *   outboxChipOf({proposals, apiCards}, conversationKey, {apiFate}) — {total, waiting, edited, sent, partly, failed, replaced,
 *     calls} over the rows the conversation drafted (`conversationKey` = one id or the list conversationKeys gives). total and
 *     waiting ARE the Outbox window's head census (src/outbox-census.js outboxCensus over outboxRowsOf — the same call the window
 *     makes, so the chip and the filtered window never disagree): total = every message proposal and every API call, any
 *     state; waiting = what awaits the owner (a message awaiting-approval, an API call whose fate is `pending`; `apiFate` = the
 *     API card model's fateOf, handed in). edited = the owner edited its text (`edited`); sent = landed whole; partly =
 *     partlySent; failed = a message failed or an API call's fate `failed` (an UNKNOWN outcome is not a failure — §9.4);
 *     replaced = withdrawn for a newer one (`replacedBy`); calls = the API calls among total. A bare array is refused by name
 *     (r1's proposals-only chip read only messages and hid an API call that waits).
 *   outboxFilterOf(proposals, filter) — what a filter `{keys}` keeps: every proposal its conversation drafted, EVERY state (a
 *     replaced one too — its card names the newer one), in the list's order; no filter ⇒ the list as it is.
 *   apiFilterOf(cards, filter) — the raw-API proposals the same conversation filed: the record's `conv` (channel-api.js
 *     fileProposal writes `conv: ctx.id`, the agent principal's id — the id a message proposal's `draftedBy.id` carries), else
 *     its `principal.id`; never a display name.
 */

const { outboxCensus } = require('./outbox-census.js');   // PURE → PURE: the Outbox window's head census — the chip is the same call

const keysOf = (k) => [...new Set((Array.isArray(k) ? k : [k]).filter((x) => typeof x === 'string' && x).map(String))];

function conversationKeys({ claudeId = null, backendSessionId = null, sessionId = null, webuiId = null } = {}) {
  return keysOf([claudeId, backendSessionId, sessionId, webuiId ? `webui:${webuiId}` : null]);
}

function draftedByAny(p, keys) {
  const d = p && p.draftedBy;
  if (!d || d.kind !== 'agent' || d.id == null) return false;
  return keysOf(keys).includes(String(d.id));
}

const partlySent = (p) => !!(p && p.state === 'sent' && p.result && Array.isArray(p.result.parts) && p.result.parts.some((x) => x && !x.ok));

function outboxChipOf(rows, conversationKey, { apiFate = null } = {}) {
  if (Array.isArray(rows)) throw new TypeError('outboxChipOf reads {proposals, apiCards} — the rows the Outbox window shows, never the message proposals alone');
  const keys = keysOf(conversationKey);
  const v = { total: 0, waiting: 0, edited: 0, sent: 0, partly: 0, failed: 0, replaced: 0, calls: 0 };
  if (!keys.length) return v;
  const mine = outboxRowsOf(rows, { keys });
  const fate = typeof apiFate === 'function' ? apiFate : (r) => (r && r.status) || null;
  const c = outboxCensus({ proposals: mine.proposals, apiCards: mine.apiCards, apiFate: fate });
  v.total = c.total;
  v.waiting = c.waiting;
  for (const p of mine.proposals) {
    if (p.edited) v.edited++;
    if (partlySent(p)) v.partly++;
    else if (p.state === 'sent') v.sent++;
    if (p.state === 'failed') v.failed++;
    if (p.state === 'withdrawn' && p.replacedBy) v.replaced++;
  }
  v.calls = mine.apiCards.length;
  for (const r of mine.apiCards) if (fate(r) === 'failed') v.failed++;
  return v;
}

function outboxFilterOf(proposals, filter) {
  const list = Array.isArray(proposals) ? proposals.filter(Boolean) : [];
  const keys = filter ? keysOf(filter.keys) : [];
  return keys.length ? list.filter((p) => draftedByAny(p, keys)) : list;
}

function apiFilterOf(cards, filter) {
  const list = Array.isArray(cards) ? cards.filter(Boolean) : [];
  const keys = filter ? keysOf(filter.keys) : [];
  return keys.length ? list.filter((r) => keys.includes(String(r.conv != null ? r.conv : (r.principal && r.principal.id) || ''))) : list;
}

function outboxRowsOf({ proposals = [], apiCards = [] } = {}, filter = null) {
  return { proposals: outboxFilterOf(proposals, filter), apiCards: apiFilterOf(apiCards, filter) };
}

module.exports = { conversationKeys, draftedByAny, partlySent, outboxChipOf, outboxRowsOf, outboxFilterOf, apiFilterOf };
