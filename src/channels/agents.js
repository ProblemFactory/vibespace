'use strict';
/**
 * THE BUILT-IN AGENTS ADAPTER (docs/design-communication-panel.zh.md §12.3;
 * P3). A facade over Channels v1 behind the same §4 contract every vendor
 * adapter obeys, so the outbox can send to it with the same verbs and the
 * P3 exit can run "propose → approve → send → receipt" against something
 * real without a vendor:
 *
 *   conversation = a LIVE agent session (the ids the ladder addresses)
 *   reach        = msg-acl (§12.3 — that question already has an answer
 *                  inside; a second one would be the twin). The engine asks
 *                  msg-acl for this adapter's rows through channel-acl's ONE
 *                  crosswalk, never this module.
 *   send         = deliverToConversation — THE delivery ladder, the one door
 *                  to an agent turn (fence 2); this module adds nothing
 *                  beside it. An approved outbox message to an agent is the
 *                  user's own message, so it rides the `peer-message` reason.
 *   policy       = direct by default (§12.3, decision 9: internal = direct).
 *   receive      = a NO-OP poll: its live traffic already arrives through the
 *                  chat windows, so `history()` is empty by construction.
 *
 * It is NOT removable from the adapter list and has no consent flow; the
 * engine seeds its record whenever the server hands it `liveSessions`.
 *
 * IDENTITY (§9.5): the receiving agent sees a peer-message card that names
 * the user AND says it came through VibeSpace — `marked` / `recipient-ui`,
 * in one verbatim sentence the approval card shows.
 */

const KIND = 'agents';

const caps = {
  receive: 'poll',
  pushTransport: null, pushAckBudgetMs: null,
  // A no-op pass: discovery only (the roster of live sessions). Slow on
  // purpose — nothing is fetched, and the roster changes on a session
  // create/kill, not on a timer.
  pollInterval: { hot: 120, cold: 300, floor: 60 },
  scanSources: null, scanLatency: null,
  history: 'page', historyBySource: null,
  listConversations: true,
  sendAs: ['user'],
  identityMarking: 'marked',
  identityMarkingWhere: 'recipient-ui',
  identityMarkingText: 'The receiving agent sees this as a message posted through VibeSpace on your behalf — a peer-message card naming you as the sender and VibeSpace as the carrier.',
  tosRisk: 'none',
  // The ladder has no idempotency key: a delivery whose result is lost is an
  // UNKNOWN outcome, and the outbox never retries one by itself (§9.4).
  idempotency: 'none',
  threading: 'none',
  editSent: false, readReceipts: false,
  attachments: 'none',
};

function create(record = {}, deps = {}) {
  const liveSessions = typeof deps.liveSessions === 'function' ? deps.liveSessions : () => [];
  const deliver = deps.deliver && typeof deps.deliver.deliverToConversation === 'function' ? deps.deliver : null;
  const clock = typeof deps.now === 'function' ? deps.now : () => Date.now();
  const roster = () => { try { return (liveSessions() || []).filter((s) => s && s.cid); } catch { return []; } };

  return {
    auth: {
      async state() { return { state: 'connected', expiresAt: null, scopes: ['local'], why: null, user: 'you' }; },
    },
    async listConversations() {
      const conversations = roster().map((s) => ({
        id: s.cid, vendorId: s.cid, title: s.name || s.cid, kind: 'dm', participants: s.name || s.cid, lastAt: null,
      }));
      return { conversations, cursor: null, complete: true };
    },
    /** `read:'no'` — the transcript lives in the chat window, not in this
     *  panel; sendable while the session is live, and only then. */
    async convCaps(convId) {
      const live = roster().some((s) => s.cid === convId);
      return live
        ? { read: 'no', sendAs: caps.sendAs.slice(), why: null, at: clock() }
        : { read: 'no', sendAs: [], why: 'not-a-member', at: clock() };
    },
    async history() { return { records: [], anchor: null, reachedAnchor: true, complete: true }; },
    /** The ONE send: the ladder. A refusal is a typed, retryable transport
     *  failure with the ladder's own reason; a throw inside the ladder
     *  surfaces as the registry's `vendor-error {threw}` and lands the
     *  proposal in `unknown`. */
    async send(convId, { text, idemKey, as } = {}) {
      if (!deliver) return { ok: false, code: 'transport', retryable: false, detail: { reason: 'no delivery ladder wired' } };
      const framed = `Message from the user (via VibeSpace Channels, approved in the Outbox):\n${String(text || '')}`;
      const r = await deliver.deliverToConversation(convId, framed, { kind: 'peer', spendReason: 'peer-message', fromName: 'You · via Channels', cardText: String(text || '') });
      if (r && r.ok) return { ok: true, vendorMessageId: `agents-${idemKey || clock()}`, at: clock(), sentAs: as || 'user', lane: r.lane || null };
      return { ok: false, code: 'transport', retryable: true, detail: { reason: (r && r.reason) || 'undelivered', refused: (r && r.refused) || null } };
    },
    async reconcile() { return { unknown: true }; },
  };
}

/** `policyDefault` (§12.3 / decision 9): internal = direct. The engine reads
 *  the MODULE's declaration, never the kind. */
/** THE DECLARED EGRESS (§3.1): this adapter constructs no request of its own — the ladder does the delivering. */
const EGRESS = Object.freeze([]);
module.exports = { kind: KIND, caps, create, builtin: true, label: 'Agents', policyDefault: 'direct', EGRESS };
