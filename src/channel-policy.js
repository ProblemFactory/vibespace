'use strict';
/**
 * THE OUTBOX POLICY — PURE (imports only channel-record for the frame
 * neutering, like channel-filter; bundled into the Outbox window so the card
 * and the route judge a proposal with the same code).
 * docs/design-communication-panel.zh.md §9.1 / §9.3 / §9.5, decisions 8 + 9.
 *
 * THREE THINGS LIVE HERE AND NOWHERE ELSE:
 *
 *  1. THE TRANSITION TABLE of a proposal. Every allowed move names WHO may
 *     make it; every other move is refused with the reason. `unknown` is the
 *     one state only `reconcile` leaves — a send whose outcome was lost is
 *     NEVER retried by the machine (§9.4): a duplicate in somebody else's
 *     ops room is a worse failure than asking.
 *
 *  2. `decideOutbound` — direct or review. The channel's policy is the base;
 *     the GUARDS stack ON TOP and may only TIGHTEN it (links / attachments /
 *     off-hours force review; audit is always on and is not a guard). A guard
 *     that could relax a policy would make the policy a suggestion.
 *     FAIL CLOSED: an unknown policy value or an unparseable guard config is
 *     `review`. Off-hours needs a TIME ZONE; without one that guard is OFF,
 *     not guessed — a wrong zone silently sends everything to review (or
 *     nothing), which is worse than an honest "not configured" the panel
 *     shows as a setting.
 *
 *  3. THE RECEIPT an agent gets back (§9.3) — including the three identity
 *     fields (§9.5): the agent must know WHO the other side saw. That truth is
 *     owed to the one who drafted and the one who approved, never pushed into
 *     the recipient's message (decision 17, overruled by the owner).
 *
 *  P4 (§9.4 / §9.5, 2026-09-16) adds three more, still PURE:
 *
 *  4. `sending` → `unknown` may also be caused by `boot`: a process that
 *     stopped between the audit ATTEMPT line and the OUTCOME line left a
 *     proposal in `sending` that nobody will ever answer — on boot it becomes
 *     `unknown` (the state reconcile exists for), never `failed` (which would
 *     read as "not sent") and never re-sent.
 *  5. `canReconcile` / `reconcileVerdict`: an adapter declaring
 *     `idempotency:'none'` cannot be reconciled by the machine at all (the
 *     outcome is a person's look at the platform), and an adapter's
 *     `{landed:true}` / `{landed:false}` / `{unknown:true}` answer maps to
 *     sent / failed / stays — nothing else may move a proposal out of
 *     `unknown`.
 *  6. THE SENDER HONESTY LINE (decision 17 as overruled): OFF by default,
 *     a per-channel option. When ON, an AGENT-drafted proposal goes out
 *     with one trailing line naming the drafting agent; a user's own draft
 *     never gets one (there is nothing to disclose). The proposal's stored
 *     text is the text the user approved; the line is appended at send time
 *     and the card says so BEFORE the approval.
 */
const { inertFrames } = require('./channel-record.js');

const OUTBOX_STATES = Object.freeze(['draft', 'proposed', 'awaiting-approval', 'sending', 'sent', 'failed', 'unknown', 'rejected', 'expired']);
/** Who may cause a transition. `policy` = decideOutbound's verdict; `adapter`
 *  = the send result; `ttl` = the sweep; `recheck` = the unconditional
 *  convCaps re-resolution at approval (§9.2 r4). */
const TRANSITIONS = Object.freeze({
  draft: Object.freeze({ proposed: ['agent', 'user'] }),
  proposed: Object.freeze({ sending: ['policy'], 'awaiting-approval': ['policy'] }),
  'awaiting-approval': Object.freeze({ sending: ['user'], rejected: ['user'], expired: ['ttl'], failed: ['recheck'] }),
  sending: Object.freeze({ sent: ['adapter'], failed: ['adapter'], unknown: ['adapter', 'boot'] }),
  unknown: Object.freeze({ sent: ['reconcile'], failed: ['reconcile'] }),
  sent: Object.freeze({}),
  failed: Object.freeze({}),
  rejected: Object.freeze({}),
  expired: Object.freeze({}),
});
const TERMINAL_STATES = Object.freeze(['sent', 'failed', 'rejected', 'expired']);
const POLICY_MODES = Object.freeze(['direct', 'review']);
const DECISION_REASONS = Object.freeze(['channel-policy', 'links', 'attachments', 'off-hours', 'authority']);
const RECEIPT_STATUSES = Object.freeze(['sent', 'rejected', 'edited', 'expired', 'failed']);
/** Default TTL in `awaiting-approval` (§9.1): 24 h. */
const PROPOSAL_TTL_MS = 24 * 3600 * 1000;
const TEXT_MAX_BYTES = 16 * 1024;
/** The sender honesty line is OFF by default (decision 17, overruled). */
const HONESTY_LINE_DEFAULT = false;
const IDEMPOTENCY_MODES = Object.freeze(['key', 'two-phase', 'none']);

/** May `from` → `to` happen, and may `by` cause it? `{ok, why}`. */
function canTransition(from, to, by = null) {
  const row = TRANSITIONS[from];
  if (!row) return { ok: false, why: `unknown state '${from}'` };
  const actors = row[to];
  if (!actors) return { ok: false, why: TERMINAL_STATES.includes(from) ? `'${from}' is terminal` : from === 'unknown' ? `'unknown' leaves only through reconcile — a lost outcome is never retried by the machine` : `'${from}' → '${to}' is not a transition` };
  if (by !== null && !actors.includes(by)) return { ok: false, why: `'${from}' → '${to}' is not for '${by}' (only ${actors.join('/')})` };
  return { ok: true, why: null };
}
const isTerminal = (state) => TERMINAL_STATES.includes(state);

/** The channel's policy as a MODE, fail closed: anything but a known mode
 *  reads `review`, and says so. */
function policyMode(policy) {
  const m = policy && typeof policy === 'object' ? policy.mode : policy;
  if (m === undefined || m === null) return { mode: 'review', unknown: false, declared: null };
  if (POLICY_MODES.includes(m)) return { mode: m, unknown: false, declared: m };
  return { mode: 'review', unknown: true, declared: String(m).slice(0, 40) };
}

/** Does the text carry a link? Conservative: a scheme or a www. host. */
function hasLinks(text) {
  return /\bhttps?:\/\/\S+|\bwww\.[a-z0-9-]+\.[a-z]{2,}/i.test(String(text || ''));
}

/** Parse `HH:MM` → minutes, or null. */
function hhmm(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

/** The wall clock in `tz` at `now`: `{minutes, weekday}` or null when the
 *  zone is not one the runtime knows (fail closed upstream). */
function wallClock(now, tz) {
  try {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, hour: '2-digit', minute: '2-digit', weekday: 'short' });
    const parts = Object.fromEntries(f.formatToParts(new Date(now)).map((p) => [p.type, p.value]));
    const h = Number(parts.hour) % 24, mi = Number(parts.minute);
    const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
    if (!Number.isFinite(h) || !Number.isFinite(mi) || wd < 0) return null;
    return { minutes: h * 60 + mi, weekday: wd };
  } catch { return null; }
}

/**
 * The off-hours guard's own verdict: `{state:'off'|'inside'|'outside'|'unparseable', why}`.
 * `off` = no time zone configured (the guard does not run — never guessed).
 */
function offHoursVerdict(offHours, now, tz) {
  const g = offHours && typeof offHours === 'object' ? offHours : null;
  if (!g || g.enabled === false) return { state: 'off', why: 'off-hours guard is disabled' };
  const zone = (g.tz || tz || '').trim();
  if (!zone) return { state: 'off', why: 'off-hours guard has no time zone configured' };
  const start = hhmm(g.start === undefined ? '09:00' : g.start);
  const end = hhmm(g.end === undefined ? '18:00' : g.end);
  if (start === null || end === null) return { state: 'unparseable', why: `working hours are not HH:MM (${JSON.stringify(g.start)}–${JSON.stringify(g.end)})` };
  const days = Array.isArray(g.weekdays) ? g.weekdays.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : [1, 2, 3, 4, 5];
  const clock = wallClock(now, zone);
  if (!clock) return { state: 'unparseable', why: `time zone '${zone}' is not one this runtime knows` };
  const inWindow = start <= end ? (clock.minutes >= start && clock.minutes < end) : (clock.minutes >= start || clock.minutes < end);
  const inside = days.includes(clock.weekday) && inWindow;
  return { state: inside ? 'inside' : 'outside', why: inside ? null : 'outside working hours', tz: zone };
}

/**
 * direct or review, and WHY (every reason from the closed set). The channel
 * policy is the base; guards only add. `detail` carries the fail-closed
 * facts the card prints (an unknown policy value, an unparseable guard, an
 * off-hours guard that is OFF because no zone is configured).
 *
 *  @param channelPolicy {mode:'direct'|'review'} | null   (null = review, decision 9)
 *  @param guards {linksReview?, attachmentsReview?, offHours:{enabled,tz,start,end,weekdays}}
 *  @param proposal {text, attachments[], authority:'draft'|'send'}
 */
function decideOutbound({ channelPolicy = null, guards = {}, proposal = {}, now = Date.now(), tz = null } = {}) {
  const reasons = [];
  const detail = { unknownPolicy: false, guardsUnparseable: null, offHours: null, policyDeclared: null };
  const pm = policyMode(channelPolicy);
  detail.policyDeclared = pm.declared;
  if (pm.unknown) { detail.unknownPolicy = true; reasons.push('channel-policy'); }
  else if (pm.mode === 'review') reasons.push('channel-policy');

  const g = guards && typeof guards === 'object' ? guards : null;
  if (!g) { detail.guardsUnparseable = 'guards are not an object'; reasons.push('channel-policy'); }
  else {
    // links / attachments: ON unless explicitly switched off (decision 9).
    if (g.linksReview !== false && hasLinks(proposal.text)) reasons.push('links');
    if (g.attachmentsReview !== false && Array.isArray(proposal.attachments) && proposal.attachments.length) reasons.push('attachments');
    const oh = offHoursVerdict(g.offHours, now, tz);
    detail.offHours = oh;
    if (oh.state === 'unparseable') { detail.guardsUnparseable = oh.why; reasons.push('channel-policy'); }
    else if (oh.state === 'outside') reasons.push('off-hours');
  }
  // authority: an assignment that grants only `draft` (or none at all) means
  // review, whatever the channel says — the agent was never given `send`.
  if (proposal.authority !== 'send') reasons.push('authority');

  const uniq = [...new Set(reasons)];
  return { mode: uniq.length ? 'review' : 'direct', reasons: uniq, detail };
}

/** A proposal's shape, validated. */
function validateProposal(input = {}) {
  const p = input && typeof input === 'object' ? input : {};
  const text = typeof p.text === 'string' ? p.text : '';
  if (!text.trim()) return { ok: false, error: 'text is required' };
  if (Buffer.byteLength(text, 'utf-8') > TEXT_MAX_BYTES) return { ok: false, error: `text is larger than ${TEXT_MAX_BYTES / 1024}KB` };
  const replyTo = p.replyTo === undefined || p.replyTo === null ? null : String(p.replyTo).slice(0, 200);
  let why = null;
  if (p.why && typeof p.why === 'object') {
    const kinds = ['record', 'alert', 'task', 'session', 'text'];
    const kind = kinds.includes(p.why.kind) ? p.why.kind : 'text';
    why = { kind, id: p.why.id === undefined || p.why.id === null ? null : String(p.why.id).slice(0, 200), label: String(p.why.label || '').slice(0, 300) || null };
  } else if (typeof p.why === 'string' && p.why.trim()) why = { kind: 'text', id: null, label: p.why.trim().slice(0, 300) };
  const attachments = Array.isArray(p.attachments) ? p.attachments.slice(0, 20).map((a) => ({ name: String((a && a.name) || '').slice(0, 200), bytes: Number(a && a.bytes) || 0 })) : [];
  return { ok: true, proposal: { text, replyTo, why, attachments } };
}

/**
 * THE SENDER HONESTY LINE (§9.5, decision 17 as overruled): null unless the
 * switch is ON *and* the drafter is an agent — a user's own words carry no
 * disclosure. The sentence is the one thing of ours that may ride out with
 * the message, and only when the user turned it on for that channel.
 */
function honestyLine({ draftedBy = null, enabled = HONESTY_LINE_DEFAULT } = {}) {
  if (enabled !== true) return null;
  if (!draftedBy || draftedBy.kind !== 'agent') return null;
  const who = String(draftedBy.name || draftedBy.id || 'an agent').replace(/\s+/g, ' ').trim().slice(0, 80);
  return `— drafted by ${who}, an AI agent, via VibeSpace`;
}
/** The wire text: the approved text, then the line after a blank line. */
function withHonestyLine(text, line) {
  const t = String(text == null ? '' : text);
  if (!line) return t;
  return `${t.replace(/\s+$/, '')}\n\n${line}`;
}

/**
 * MAY THE MACHINE ASK WHETHER A LOST SEND LANDED (§9.4)? Only an adapter
 * that declared an idempotency mechanism can answer; `none` means the
 * outcome is a person's look at the platform and the card says so.
 */
function canReconcile(caps) {
  const c = caps || {};
  if (!Array.isArray(c.sendAs) || !c.sendAs.length) return { ok: false, why: 'this adapter is read-only — nothing was ever sent through it' };
  const mode = IDEMPOTENCY_MODES.includes(c.idempotency) ? c.idempotency : 'none';
  if (mode === 'none') return { ok: false, why: 'this adapter declares no idempotency mechanism (idempotency: none) — the outcome can only be checked on the platform by a person' };
  return { ok: true, why: null, mode };
}
/**
 * AN ADAPTER'S RECONCILE ANSWER → THE ONE MOVE IT LICENSES.
 * `{landed:true, vendorMessageId}` ⇒ sent; `{landed:false}` ⇒ failed;
 * anything else (`{unknown:true}`, a malformed answer) ⇒ no move — the
 * proposal stays `unknown` and the count of asks goes up.
 */
function reconcileVerdict(answer) {
  const a = answer && typeof answer === 'object' ? answer : null;
  if (a && a.landed === true) return { to: 'sent', answer: 'landed', vendorMessageId: a.vendorMessageId ? String(a.vendorMessageId) : null, at: Number(a.at) || null, detail: a.detail || null };
  if (a && a.landed === false) return { to: 'failed', answer: 'not-landed', vendorMessageId: null, at: null, detail: a.detail || null, reason: a.reason ? String(a.reason).slice(0, 300) : 'reconcile: the platform holds no such message — it was never sent' };
  return { to: null, answer: 'unknown', vendorMessageId: null, at: null, detail: a && a.detail ? a.detail : null, reason: a && a.reason ? String(a.reason).slice(0, 300) : null };
}

/** Past its TTL? `{expired, ttlAt}` — `ttlAt` is the instant, so the card can say when. */
function expiryVerdict(proposal, now = Date.now(), ttlMs = PROPOSAL_TTL_MS) {
  const at = Number(proposal && proposal.awaitingSince) || Number(proposal && proposal.at) || 0;
  const ttlAt = at + (Number(proposal && proposal.ttlMs) || ttlMs);
  return { expired: proposal && proposal.state === 'awaiting-approval' && now >= ttlAt, ttlAt };
}

/**
 * THE RECEIPT (§9.3). Null while the proposal is not in a state that owes
 * one — `unknown` owes the USER a look, not the agent a verdict (§9.4).
 */
function receiptFor(p) {
  if (!p || !p.state) return null;
  let status = null;
  if (p.state === 'sent') status = p.edited ? 'edited' : 'sent';
  else if (p.state === 'rejected' || p.state === 'expired' || p.state === 'failed') status = p.state;
  if (!status) return null;
  const marking = p.identity && p.identity.marking ? p.identity.marking : 'unknown';
  return {
    proposalId: p.id, status,
    convId: p.convId, adapterId: p.adapterId,
    vendorMessageId: (p.result && p.result.vendorMessageId) || null,
    at: (p.result && p.result.at) || p.updatedAt || null,
    edited: !!p.edited, editedBy: p.edited ? 'user' : null,
    reason: p.reason || null,
    sentAs: p.state === 'sent' ? ((p.result && p.result.sentAs) || p.sendAs || null) : null,
    identityMarking: marking,
    identityMarkingText: marking === 'none' ? null : ((p.identity && p.identity.text) || null),
    // P4: the outcome was established by reconcile after a lost result, and
    // whether a sender honesty line rode out with the message (§9.5).
    reconciled: !!(p.reconcile && p.reconcile.resolvedAt),
    honestyLine: !!(p.result && p.result.honestyLine),
  };
}

/** ONE vendor-controlled value, safe to embed in the receipt: frames neutered,
 *  single-line, clipped — the SAME rule as channel-filter's safeInline, so the
 *  receipt path is as inert as the wake path (fence 5 / §7.5; the P4 verifier
 *  forged a frame through a conversation TITLE here while the wake block
 *  neutered the same string). */
function safeInline(text, max) {
  // neuter FIRST, then clip: a clip through a tag leaves a half tag (inert,
  // but ugly); a clip after neutering leaves `[name]` whole
  const v = inertFrames(String(text == null ? '' : text).replace(/[\r\n\t]+/g, ' '));
  return v.length > max ? v.slice(0, max - 1) + '…' : v;
}

/** The text an agent is handed with its receipt — a §7.5-shaped block, frame-inert
 *  in EVERY vendor-controlled field (label, title, vendor id, sentAs, reason). */
function renderReceiptBlock(receipt, { adapterLabel = null, title = null, text = null } = {}) {
  const r = receipt || {};
  const lines = [];
  lines.push(`Channel receipt — ${safeInline(adapterLabel || r.adapterId || 'channel', 60)} · ${safeInline(title || r.convId || '', 120)}`.trim());
  const what = r.status === 'edited' ? 'SENT after the user edited it' : r.status === 'sent' ? 'SENT' : r.status === 'rejected' ? 'REJECTED by the user' : r.status === 'expired' ? 'EXPIRED unapproved (24 h)' : r.status === 'failed' ? 'FAILED' : String(r.status || '').toUpperCase();
  lines.push(`proposal ${safeInline(r.proposalId, 80)}: ${what}${r.vendorMessageId ? ` (vendor id ${safeInline(r.vendorMessageId, 200)})` : ''}`);
  if (r.status === 'sent' || r.status === 'edited') {
    lines.push(`sent as: ${safeInline(r.sentAs || 'unknown', 40)}`);
    if (r.identityMarking === 'none') lines.push('the recipient sees this as the user, with no application marker');
    else lines.push(`the recipient sees: ${r.identityMarkingText || (r.identityMarking === 'unknown' ? 'NOT VERIFIED — this channel\'s attribution has not been measured' : 'marked as sent by an application')}`);
  }
  if (r.honestyLine) lines.push('a sender honesty line naming you as the drafting agent was appended (the channel\'s option is on)');
  if (r.reconciled) lines.push('this outcome was established by a reconcile check after the send\'s result was lost');
  if (r.reason) lines.push(`reason: ${inertFrames(String(r.reason)).slice(0, 400)}`);
  if (r.status === 'edited' && text) lines.push(`final text:\n${inertFrames(String(text)).slice(0, 2000)}`);
  return lines.join('\n');
}

module.exports = {
  OUTBOX_STATES, TRANSITIONS, TERMINAL_STATES, POLICY_MODES, DECISION_REASONS, RECEIPT_STATUSES, PROPOSAL_TTL_MS, TEXT_MAX_BYTES, HONESTY_LINE_DEFAULT, IDEMPOTENCY_MODES,
  canTransition, isTerminal, policyMode, hasLinks, offHoursVerdict, decideOutbound, validateProposal, expiryVerdict, receiptFor, renderReceiptBlock,
  honestyLine, withHonestyLine, canReconcile, reconcileVerdict,
};
