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
const { inertFrames, inertFrameLine } = require('./channel-record.js');

const OUTBOX_STATES = Object.freeze(['draft', 'proposed', 'awaiting-approval', 'sending', 'sent', 'failed', 'unknown', 'rejected', 'expired', 'withdrawn']);
/** Who may cause a transition. `policy` = decideOutbound's verdict; `adapter`
 *  = the send result; `ttl` = the sweep; `recheck` = the unconditional
 *  convCaps re-resolution at approval (§9.2 r4); `agent` = the DRAFTING
 *  agent taking its own proposal back (2026-09-27, the owner: "agent 似乎没有
 *  撤回之前制作的 draft 的能力，必须要我手动 reject 是吗？") — only while
 *  nobody has decided it yet: never from `sending` (the request may be
 *  leaving), never from `sent` / `failed`, and never from `unknown` (a lost
 *  outcome is the USER's to check, never the agent's to erase). */
const TRANSITIONS = Object.freeze({
  draft: Object.freeze({ proposed: ['agent', 'user'] }),
  proposed: Object.freeze({ sending: ['policy'], 'awaiting-approval': ['policy'], withdrawn: ['agent'] }),
  'awaiting-approval': Object.freeze({ sending: ['user'], rejected: ['user'], expired: ['ttl'], failed: ['recheck'], withdrawn: ['agent'] }),
  sending: Object.freeze({ sent: ['adapter'], failed: ['adapter'], unknown: ['adapter', 'boot'] }),
  unknown: Object.freeze({ sent: ['reconcile'], failed: ['reconcile'] }),
  sent: Object.freeze({}),
  failed: Object.freeze({}),
  rejected: Object.freeze({}),
  expired: Object.freeze({}),
  withdrawn: Object.freeze({}),
});
const TERMINAL_STATES = Object.freeze(['sent', 'failed', 'rejected', 'expired', 'withdrawn']);
/** The states the drafting agent may withdraw from (derived from the table —
 *  never a second hand-written list). */
const WITHDRAWABLE_STATES = Object.freeze(Object.keys(TRANSITIONS).filter((s) => TRANSITIONS[s].withdrawn && TRANSITIONS[s].withdrawn.includes('agent')));
const POLICY_MODES = Object.freeze(['direct', 'review']);
const DECISION_REASONS = Object.freeze(['channel-policy', 'links', 'attachments', 'off-hours', 'authority']);
const RECEIPT_STATUSES = Object.freeze(['sent', 'rejected', 'edited', 'expired', 'failed', 'withdrawn']);
/** The reason stored on a withdrawal the agent gave no words for — a CONTRACT
 *  string (the CLI prints it, the receipt carries it), never rendered as-is by
 *  the card (the card words `outcomeOf`). */
const WITHDRAWN_DEFAULT_REASON = 'withdrawn by the agent';
const WITHDRAW_WHY_MAX = 300;

/**
 * MAY THIS AGENT WITHDRAW THIS PROPOSAL (2026-09-27)? The ONE verdict the
 * engine and the route share — `{ok, code, why}`, code from a closed set:
 *  - `not-yours`         the proposal was drafted by somebody else (another
 *                        agent — a Task-Group sibling included — or the user):
 *                        only its own drafter takes it back; the user rejects;
 *  - `not-withdrawable`  its state is not one the table lets `agent` leave
 *                        (`sending` — the request may be leaving; `unknown` —
 *                        a lost outcome is the user's; any terminal state).
 * Identity is the conversation id the proposal recorded (`draftedBy.id`),
 * never a name.
 */
function withdrawVerdict(p, by) {
  const q = p || {};
  const d = q.draftedBy || {};
  const who = by && typeof by === 'object' ? by : {};
  if (d.kind !== 'agent' || !d.id || who.kind !== 'agent' || !who.id || String(who.id) !== String(d.id)) {
    const drafter = d.kind === 'agent' ? (d.name || d.id || 'another agent') : 'the user';
    return { ok: false, code: 'not-yours', why: `proposal ${q.id || '?'} was drafted by ${drafter} — only the agent that proposed it can withdraw it (the user can reject it)` };
  }
  if (!WITHDRAWABLE_STATES.includes(q.state)) {
    const why = q.state === 'sending' ? 'it is being sent right now'
      : q.state === 'unknown' ? 'its outcome is unknown — a lost send is the user\'s to check on the platform, never withdrawn'
        : q.state === 'withdrawn' ? 'it is already withdrawn'
          : `it is ${q.state || 'in no known state'} — decided already`;
    return { ok: false, code: 'not-withdrawable', why: `proposal ${q.id || '?'} cannot be withdrawn: ${why}` };
  }
  return { ok: true, code: null, why: null };
}
/** The agent's own words for a withdrawal, one line, clipped (null = none). */
function withdrawWhy(why) {
  const w = String(why == null ? '' : why).replace(/[\r\n\t]+/g, ' ').trim();
  return w ? w.slice(0, WITHDRAW_WHY_MAX) : null;
}
/** The stored contract reason for a withdrawal (`p.reason`). */
function withdrawReason(why) {
  const w = withdrawWhy(why);
  return w ? `${WITHDRAWN_DEFAULT_REASON}: ${w}` : WITHDRAWN_DEFAULT_REASON;
}
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

/** A NEW message's recipients: at most this many (To + Cc together). */
const COMPOSE_MAX_RECIPIENTS = 20;
const COMPOSE_SUBJECT_MAX = 300;
/** One address, plainly — no display name, no header syntax (a comma, a
 *  semicolon, a bracket, a quote or a line break would let one field become
 *  two headers). */
const ADDRESS_RE = /^[^\s@<>,;"'()[\]\\]+@[^\s@<>,;"'()[\]\\]+\.[^\s@<>,;"'()[\]\\]+$/;
/**
 * A COMPOSED message (B-6acc — a NEW conversation, where a reply answers
 * inside one): the proposal's own checks (text, why, attachments) plus the
 * envelope — `to` (one or more plain addresses), `cc` (optional), `subject`
 * (one line). A refusal carries `why` (`to` / `address` / `recipients` /
 * `subject`) and names the bad value; nothing is created.
 */
function validateCompose(input = {}) {
  const base = validateProposal(input);
  if (!base.ok) return { ...base, why: 'text' };
  const p = input && typeof input === 'object' ? input : {};
  const list = (v) => (Array.isArray(v) ? v : String(v === undefined || v === null ? '' : v).split(',')).map((x) => String(x).trim()).filter(Boolean);
  // R4 verify r2: a field this verb does not carry is REFUSED BY NAME, never
  // silently dropped (an agent that asked for a Bcc would believe it was sent)
  if (p.bcc !== undefined && p.bcc !== null && String(Array.isArray(p.bcc) ? p.bcc.join(',') : p.bcc).trim()) return { ok: false, error: 'bcc is not supported — every recipient of a composed message is visible (To / Cc)', why: 'bcc' };
  if (p.replyTo !== undefined && p.replyTo !== null && String(p.replyTo).trim()) return { ok: false, error: 'a NEW message has nothing to reply to — use `reply` inside a conversation', why: 'replyTo' };
  const to = list(p.to), cc = list(p.cc);
  if (!to.length) return { ok: false, error: 'to is required (one or more addresses)', why: 'to' };
  if (to.length + cc.length > COMPOSE_MAX_RECIPIENTS) return { ok: false, error: `at most ${COMPOSE_MAX_RECIPIENTS} recipients (To + Cc)`, why: 'recipients' };
  for (const a of [...to, ...cc]) if (!ADDRESS_RE.test(a) || a.length > 254) return { ok: false, error: `not a plain address: ${JSON.stringify(a.slice(0, 80))}`, why: 'address' };
  const subject = String(p.subject === undefined || p.subject === null ? '' : p.subject).replace(/[\r\n\t]+/g, ' ').trim();
  if (!subject) return { ok: false, error: 'subject is required', why: 'subject' };
  return { ok: true, proposal: { ...base.proposal, replyTo: null, compose: { to: to.map((x) => x.toLowerCase()), cc: cc.map((x) => x.toLowerCase()), subject: subject.slice(0, COMPOSE_SUBJECT_MAX) } } };
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
  if (!Array.isArray(c.sendAs) || !c.sendAs.length) return { ok: false, code: 'read-only', why: 'this adapter is read-only — nothing was ever sent through it' };
  const mode = IDEMPOTENCY_MODES.includes(c.idempotency) ? c.idempotency : 'none';
  if (mode === 'none') return { ok: false, code: 'no-idempotency', why: 'this adapter declares no idempotency mechanism (idempotency: none) — the outcome can only be checked on the platform by a person' };
  return { ok: true, code: null, why: null, mode };
}
/** The reconcile refusal, in words (the client's `t`). */
function reconcileWhyText(code, { t = defaultT } = {}) {
  switch (String(code || '')) {
    case 'read-only': return t('this channel is read-only — nothing was ever sent through it');
    case 'no-idempotency': return t('this channel declares no way to look a message up — only a person can check the platform');
    case 'no-adapter': return t('the channel no longer exists');
    case '': return '';
    default: return String(code);
  }
}

/** The reason stored on a rejection the user gave no words for — a CONTRACT
 *  string (agents read it off the receipt), never rendered as-is by the card. */
const REJECTED_DEFAULT_REASON = 'rejected by the user';

/** The `t()` this module falls back to when no translator is injected — the
 *  English key with its params substituted (src/lib/i18n.js's own rule). */
const defaultT = (s, params) => (params ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : String(s));

/**
 * WHAT HAPPENED TO THIS PROPOSAL, AS STRUCTURE (a3 i18n, 2026-09-18). The
 * engine composes `p.reason` as an ENGLISH CONTRACT STRING — the agent CLI
 * prints it, the receipt carries it, the outbox suite pins it — and the card
 * used to print that same string to a zh/ja reader. The card now reads THIS:
 * `{kind, code, detail, userReason}` where `kind` names the sentence and
 * `detail` is the only verbatim part (an adapter's or vendor's own words, or
 * the user's typed rejection), rendered AFTER the client's sentence, never
 * inside it. `null` when the state carries no outcome to speak of.
 */
function outcomeOf(p) {
  const q = p || {};
  const f = q.failure || {};
  const d = f.detail || {};
  switch (q.state) {
    case 'unknown':
      if (f.code === 'lost-at-boot') return { kind: 'boot', code: f.code, detail: null, userReason: null };
      if (d.threw) return { kind: 'threw', code: f.code || null, detail: d.message ? String(d.message) : null, userReason: null };
      return { kind: 'lost', code: f.code || null, detail: d.message ? String(d.message) : (f.code ? String(f.code) : null), userReason: null };
    case 'failed':
      if (f.code === 'send-not-available') return { kind: 'send-not-available', code: f.code, detail: f.why ? String(f.why) : null, userReason: null };
      if (q.reconcile && q.reconcile.resolvedAt && q.reconcile.lastAnswer === 'not-landed') return { kind: 'not-landed', code: f.code || null, detail: null, userReason: null };
      return { kind: 'refused', code: f.code || 'failed', detail: (d.reason || d.message) ? String(d.reason || d.message) : null, userReason: null };
    case 'expired': return { kind: 'expired', code: null, detail: null, userReason: null };
    case 'rejected': {
      const r = q.reason && q.reason !== REJECTED_DEFAULT_REASON ? String(q.reason) : '';
      return { kind: 'rejected', code: null, detail: null, userReason: r };
    }
    // 2026-09-27: the drafting agent took it back — WHO (its recorded name)
    // and its own words (verbatim, rendered AFTER the device's sentence)
    case 'withdrawn': {
      const w = q.withdrawal || {};
      const d = q.draftedBy || {};
      return { kind: 'withdrawn', code: null, detail: null, userReason: w.why ? String(w.why) : '', who: d.kind === 'agent' ? (d.name || d.id || null) : null };
    }
    default: return null;
  }
}
/** The outcome sentence. `errorCodeText` is channel-caps' composer, injected
 *  so this module keeps importing nothing but channel-record. */
function outcomeText(o, { t = defaultT, errorCodeText = (c) => String(c || '') } = {}) {
  if (!o || !o.kind) return '';
  const code = o.code ? errorCodeText(o.code, { t }) : '';
  switch (o.kind) {
    case 'boot': return t('Outcome unknown: the server stopped between the attempt and the answer.');
    case 'threw': return o.detail ? t('Outcome unknown: the channel threw while sending ({detail}).', { detail: o.detail }) : t('Outcome unknown: the channel threw while sending.');
    case 'lost': return o.detail ? t('Outcome unknown: the request left and the answer was lost ({detail}).', { detail: o.detail }) : t('Outcome unknown: the request left and the answer was lost.');
    case 'send-not-available': return t('Not sent: sending was not available at approval time ({detail}).', { detail: o.detail || '' });
    case 'not-landed': return t('Not sent: the platform holds no such message.');
    case 'refused': return o.detail ? t('Refused by the channel ({code}): {detail}', { code: code || o.code || '', detail: o.detail }) : t('Refused by the channel ({code}).', { code: code || o.code || '' });
    case 'expired': return t('Expired: not approved within 24 h.');
    case 'rejected': return o.userReason ? t('Rejected: {reason}', { reason: o.userReason }) : t('Rejected.');
    case 'withdrawn':
      if (o.who && o.userReason) return t('Withdrawn by {who} · {reason}', { who: o.who, reason: o.userReason });
      if (o.who) return t('Withdrawn by {who}', { who: o.who });
      return o.userReason ? t('Withdrawn by the agent: {reason}', { reason: o.userReason }) : t('Withdrawn.');
    default: return '';
  }
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

/** How long the receipt's diff may be (the agent's block; `status <id>`
 *  prints the whole final text). */
const RECEIPT_DIFF_MAX = 2000;
/** THE WHOLE BLOCK'S BYTE BUDGET (verify r3, 2026-09-27): the drain site
 *  (agent-routes renderMsgStash) renders a `channel-receipt` entry WHOLE only
 *  up to channel-filter's BLOCK_MAX_BYTES and clips it past that — a CJK diff
 *  of 1 800 characters is 5 200 bytes, so the owner's guidance sentence and
 *  the "status prints the whole text" pointer were the part cut off. The
 *  number is spelled here (this module imports only channel-record) and
 *  test-channel-outbox pins it equal to channel-filter's. */
const RECEIPT_BLOCK_MAX_BYTES = 4096;
/** UTF-8 length without Buffer (this module runs in the browser bundle too). */
function utf8Bytes(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1; else if (c < 0x800) n += 2; else if (c >= 0xd800 && c <= 0xdbff) { n += 4; i++; } else n += 3;
  }
  return n;
}
/** The one sentence a receipt carrying the owner's feedback ends with. */
const RECEIPT_GUIDANCE = 'Use this as guidance for the next draft.';
const splitLines = (s) => String(s == null ? '' : s).replace(/\r\n?/g, '\n').split('\n');
/**
 * WHAT THE USER CHANGED, as a compact LINE DIFF (2026-09-27, the owner: "如果
 * 我修改后批准，agent 似乎也收不到我的修改动作 … 并不知道我希望以什么方式回复").
 * `- ` = the agent proposed it, `+ ` = the user sent it, `  ` = one line of
 * unchanged context beside a change; a longer unchanged run is ONE line
 * ("… N unchanged lines"). '' when nothing changed. Every line is frame-inert
 * (a proposal's text is an agent's, the edit a user's — both reach an agent's
 * context), and the whole is at most `max` characters, clipped with a line
 * that says so. PURE; LCS over the lines between the common head and tail.
 */
function receiptDiff(proposed, final, { max = RECEIPT_DIFF_MAX, maxBytes = Infinity } = {}) {
  const a = splitLines(proposed), b = splitLines(final);
  if (a.join('\n') === b.join('\n')) return '';
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  const am = a.slice(head, a.length - tail), bm = b.slice(head, b.length - tail);
  const mid = [];
  if (am.length * bm.length <= 250000) {
    // LCS table over the changed middle
    const n = am.length, m = bm.length;
    const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = am[i] === bm[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (am[i] === bm[j]) { mid.push([' ', am[i]]); i++; j++; }
      else if (L[i + 1][j] >= L[i][j + 1]) mid.push(['-', am[i++]]);
      else mid.push(['+', bm[j++]]);
    }
    while (i < n) mid.push(['-', am[i++]]);
    while (j < m) mid.push(['+', bm[j++]]);
  } else {
    for (const l of am) mid.push(['-', l]);
    for (const l of bm) mid.push(['+', l]);
  }
  const raw = [...a.slice(0, head).map((l) => [' ', l]), ...mid, ...a.slice(a.length - tail).map((l) => [' ', l])];
  // a changed run reads PAIRWISE — each removed line beside the line that
  // replaced it — so a clipped diff still shows what the user wrote
  const ops = [];
  for (let k = 0; k < raw.length;) {
    if (raw[k][0] === ' ') { ops.push(raw[k++]); continue; }
    const minus = [], plus = [];
    while (k < raw.length && raw[k][0] !== ' ') (raw[k][0] === '-' ? minus : plus).push(raw[k++]);
    for (let x = 0; x < Math.max(minus.length, plus.length); x++) { if (minus[x]) ops.push(minus[x]); if (plus[x]) ops.push(plus[x]); }
  }
  // keep ONE line of context beside a change; fold every longer unchanged run
  const near = (k) => (ops[k - 1] && ops[k - 1][0] !== ' ') || (ops[k + 1] && ops[k + 1][0] !== ' ');
  const out = [];
  let run = [];
  // one line is at most 600 characters, so a long paragraph's removed AND
  // added forms both fit the budget (the user's version is never cut away).
  // Frames: the complete tags first, then the clip, then the line rule (verify
  // r3) — a clip can leave a complete tag DANGLING, and a dangling opener is
  // completed by the `>` of a later line once the lines are joined
  const clip = (l) => { let v = inertFrames(l); if (v.length > 600) v = v.slice(0, 599) + '…'; return inertFrameLine(v); };
  const flush = () => {
    if (run.length > 1) out.push(`  … ${run.length} unchanged lines`);
    else if (run.length === 1) out.push(`  ${clip(run[0])}`);
    run = [];
  };
  ops.forEach(([t, l], k) => {
    if (t === ' ' && !near(k)) { run.push(l); return; }
    flush();
    out.push(`${t} ${clip(l)}`);
  });
  flush();
  const whole = out.join('\n');
  if (whole.length <= max && utf8Bytes(whole) <= maxBytes) return whole;
  const cut = '… (the diff is longer — `vibespace-channels status <proposal id>` prints the whole final text)';
  const room = Math.max(0, max - cut.length - 1);
  const roomBytes = Math.max(0, maxBytes - utf8Bytes(cut) - 1);
  const fits = (t) => t.length <= room && utf8Bytes(t) <= roomBytes;
  let text = '';
  for (const line of out) {
    const next = text ? `${text}\n${line}` : line;
    if (!fits(next)) {
      // a single line longer than the room is clipped itself, never dropped whole
      if (!text && room > 1) { let l = line.slice(0, room - 1); while (l.length > 1 && utf8Bytes(l) + 3 > roomBytes) l = l.slice(0, Math.max(1, Math.floor(l.length * 0.8))); text = inertFrameLine(l + '…'); }
      break;
    }
    text = next;
  }
  return (text ? `${text}\n` : '') + cut.slice(0, max - (text ? text.length + 1 : 0));
}
/** How the decider wants the drafting agent told (2026-09-27, owner ruling:
 *  the choice sits ON the Approve / Reject action, never in the account's
 *  notification config): `next-turn` = free, it rides the agent's next
 *  message (the default); `wake-now` = a billed turn now. */
const RECEIPT_DELIVERIES = Object.freeze(['next-turn', 'wake-now']);
/**
 * THE RECEIPT'S DELIVERY VERDICT — PURE. `choice` = what the decider picked
 * (anything else reads `next-turn`: the free one, fail closed), `proposal` =
 * the stored record (its `receiptWake` row = a wake already taken), `session`
 * = `{live}` of the drafting conversation (`false` = not live; `null` =
 * unknown). `{deliver: 'wake-now'|'next-turn'|'none', why}`:
 *  - `none`       the user drafted it (nobody to tell), or the agent withdrew
 *                 it itself;
 *  - `next-turn`  chosen; or `wake-now` asked for a session that is not live
 *                 (`gone` — the stash keeps the receipt for when it comes
 *                 back) or for a proposal whose ONE wake was already taken
 *                 (`already-woken` — a second receipt never wakes twice);
 *  - `wake-now`   chosen, live (or unknown), not yet woken.
 */
function receiptDeliveryVerdict(choice, proposal, session = {}) {
  const p = proposal || {};
  const d = p.draftedBy || {};
  if (d.kind !== 'agent' || !d.id) return { deliver: 'none', why: 'user-draft' };
  if (p.state === 'withdrawn') return { deliver: 'none', why: 'withdrawn' };
  if (choice !== 'wake-now') return { deliver: 'next-turn', why: choice === undefined || choice === null || choice === 'next-turn' ? 'chosen' : 'unknown-choice' };
  if (session && session.live === false) return { deliver: 'next-turn', why: 'gone' };
  if (p.receiptWake) return { deliver: 'next-turn', why: 'already-woken' };
  return { deliver: 'wake-now', why: 'chosen' };
}
/** Is this receipt the OWNER'S EXPLICIT FEEDBACK — an edit before the send,
 *  or a rejection with words of their own? (The receipt then carries what
 *  changed / why, and the guidance sentence.) PURE. */
function receiptFeedback(rc) {
  const r = rc || {};
  if (r.status === 'edited') return { feedback: true, why: 'edited' };
  if (r.status === 'rejected' && r.reason && r.reason !== REJECTED_DEFAULT_REASON) return { feedback: true, why: 'reason' };
  return { feedback: false, why: null };
}

/**
 * THE RECEIPT'S FATE, AS STRUCTURE (2026-09-27, the owner: "我在界面里完全看
 * 不到有消息在 queue"): does the drafting agent KNOW yet? `handed` (the ladder
 * handed it over at `at`, or the stash drained into the agent's next message
 * at `at`), `waiting` (stored for its next message), `gone` (its session was
 * not live when the receipt was made — kept for when it comes back),
 * `undelivered` (neither handed nor stored — the ladder's reason), `recorded`
 * (a receipt from before delivery was tracked), `evicted` (verify r2: the
 * ladder's cap dropped the stored receipt UNREAD — never "waiting", never
 * "handed"; the receipt itself stays on the proposal). `null` = no fate to
 * speak of (no receipt, the user drafted it, or the agent withdrew it itself).
 */
function receiptFateOf(p) {
  const q = p || {};
  const d = q.draftedBy || {};
  if (!q.receipt || d.kind !== 'agent' || q.state === 'withdrawn') return null;
  const who = d.name || d.id || null;
  const del = q.receiptDelivery;
  if (!del) return { kind: 'recorded', who, at: null, woke: false };
  // the cap dropped it before any message picked it up (recorded when it happened, so it wins over a later guess)
  if (q.receiptEvictedAt) return { kind: 'evicted', who, at: Number(q.receiptEvictedAt) || null, woke: false, held: Number(q.receiptEvictedHeld) || null };
  // `reconciled` (verify): its stash entry was found gone at a boot — handed
  // by an earlier message, at a time nobody recorded (no `at`)
  if (q.receiptDrainedAt) return q.receiptDrainedHow === 'reconciled' ? { kind: 'handed', who, at: null, woke: false, lane: 'next-message', reconciled: true } : { kind: 'handed', who, at: Number(q.receiptDrainedAt) || null, woke: false, lane: 'next-message' };
  if (del.ok) return { kind: 'handed', who, at: Number(del.at) || null, woke: !!del.woke, lane: del.lane || null };
  // a wake the decider asked for and the ladder refused (the spend ceiling) is SAID beside the wait
  // …and a wake-now the ENGINE downgraded before the ladder (verify r4: the proposal's wake row could not be
  // written — `row-unwritten`) is said the same way; `already-woken` / `gone` are not refusals
  const rowLost = !del.woke && del.choice === 'wake-now' && del.verdict === 'row-unwritten';
  if (del.stashed) return { kind: del.gone ? 'gone' : 'waiting', who, at: Number(del.at) || null, woke: false, wakeRefused: del.woke ? (del.refused || 'refused') : (rowLost ? 'row-unwritten' : null), why: del.woke ? (del.why || null) : null };
  return { kind: 'undelivered', who, at: Number(del.at) || null, woke: false, refused: del.refused || null, why: del.why || null };
}
/** The fate line's words. `stamp(ms)` = the card's own clock format;
 *  `refusalText(code)` = channel-caps' wake-refusal words (injected, so this
 *  module keeps importing nothing but channel-record). */
function receiptFateText(f, { t = defaultT, stamp = (ms) => new Date(Number(ms)).toISOString().slice(11, 16), refusalText = () => '' } = {}) {
  if (!f || !f.kind) return '';
  const agent = f.who || t('the agent');
  switch (f.kind) {
    case 'handed':
      if (!f.at) return t('Handed to {agent} with an earlier message', { agent });
      return f.woke ? t('Handed to {agent} at {time} — it was woken for it', { agent, time: stamp(f.at) }) : t('Handed to {agent} at {time}', { agent, time: stamp(f.at) });
    case 'waiting': return f.wakeRefused ? t('Waiting for {agent}\'s next message — waking it was refused: {why}', { agent, why: refusalText(f.wakeRefused) || f.why || f.wakeRefused }) : t('Waiting for {agent}\'s next message', { agent });
    case 'gone': return t('{agent} is gone — receipt kept', { agent });
    case 'evicted': return t('Not delivered — {agent}\'s queue was full; the receipt is kept here', { agent });
    case 'undelivered': return t('Receipt not delivered: {why}', { why: (f.refused && refusalText(f.refused)) || f.why || '' });
    case 'recorded': return t('Receipt recorded');
    default: return '';
  }
}

/**
 * THE RECEIPT (§9.3). Null while the proposal is not in a state that owes
 * one — `unknown` owes the USER a look, not the agent a verdict (§9.4).
 */
function receiptFor(p) {
  if (!p || !p.state) return null;
  let status = null;
  if (p.state === 'sent') status = p.edited ? 'edited' : 'sent';
  else if (p.state === 'rejected' || p.state === 'expired' || p.state === 'failed' || p.state === 'withdrawn') status = p.state;
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
    // 2026-09-27: a withdrawal names the proposal that replaced it (if any)
    replacedBy: p.state === 'withdrawn' ? (p.replacedBy || null) : null,
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
function renderReceiptBlock(receipt, { adapterLabel = null, title = null, text = null, proposed = null, maxBytes = RECEIPT_BLOCK_MAX_BYTES } = {}) {
  const r = receipt || {};
  const lines = [];
  lines.push(`Channel receipt — ${safeInline(adapterLabel || r.adapterId || 'channel', 60)} · ${safeInline(title || r.convId || '', 120)}`.trim());
  const what = r.status === 'edited' ? 'SENT after the user edited it' : r.status === 'sent' ? 'SENT' : r.status === 'rejected' ? 'REJECTED by the user' : r.status === 'expired' ? 'EXPIRED unapproved (24 h)' : r.status === 'failed' ? 'FAILED' : r.status === 'withdrawn' ? `WITHDRAWN by you (the drafting agent)${r.replacedBy ? ` — replaced by proposal ${safeInline(r.replacedBy, 80)}` : ''}` : String(r.status || '').toUpperCase();
  lines.push(`proposal ${safeInline(r.proposalId, 80)}: ${what}${r.vendorMessageId ? ` (vendor id ${safeInline(r.vendorMessageId, 200)})` : ''}`);
  if (r.status === 'sent' || r.status === 'edited') {
    lines.push(`sent as: ${safeInline(r.sentAs || 'unknown', 40)}`);
    if (r.identityMarking === 'none') lines.push('the recipient sees this as the user, with no application marker');
    else lines.push(`the recipient sees: ${r.identityMarkingText || (r.identityMarking === 'unknown' ? 'NOT VERIFIED — this channel\'s attribution has not been measured' : 'marked as sent by an application')}`);
  }
  if (r.honestyLine) lines.push('a sender honesty line naming you as the drafting agent was appended (the channel\'s option is on)');
  if (r.reconciled) lines.push('this outcome was established by a reconcile check after the send\'s result was lost');
  if (r.reason) lines.push(`reason: ${inertFrames(String(r.reason)).slice(0, 400)}`);
  // 2026-09-27: WHAT THE USER CHANGED, not only the final text — a line diff
  // of the agent's proposal against what was sent (the final text itself only
  // when the proposal's own words are not at hand: a pre-diff caller).
  // verify r3: the diff takes the BYTES the rest of the block leaves under
  // `maxBytes` (the guidance line counted first — it is the part that was
  // being cut off), so the drain renders the block whole
  const guidance = receiptFeedback(r).feedback ? RECEIPT_GUIDANCE : null;
  const DIFF_HEAD = 'what the user changed (- you proposed / + the user sent):';
  const FINAL_HEAD = 'final text:';
  const used = utf8Bytes(lines.join('\n')) + (guidance ? utf8Bytes(guidance) + 1 : 0);
  const diff = r.status === 'edited' && typeof proposed === 'string' && typeof text === 'string' ? receiptDiff(proposed, text, { maxBytes: Math.max(200, maxBytes - used - utf8Bytes(DIFF_HEAD) - 2) }) : '';
  if (diff) lines.push(`${DIFF_HEAD}\n${diff}`);
  else if (r.status === 'edited' && text) {
    let fin = inertFrames(String(text)).slice(0, 2000);
    const roomF = Math.max(200, maxBytes - used - utf8Bytes(FINAL_HEAD) - 2);
    while (fin.length > 1 && utf8Bytes(fin) > roomF) fin = fin.slice(0, Math.floor(fin.length * 0.9));
    lines.push(`${FINAL_HEAD}\n${fin}`);
  }
  if (guidance) lines.push(guidance);
  // the belt (verify r3): whatever the fields above assembled, the BLOCK carries no live frame —
  // a dangling opener at the end of one field and a `>` in the next would have joined into one
  return inertFrames(lines.join('\n'));
}

module.exports = {
  OUTBOX_STATES, TRANSITIONS, TERMINAL_STATES, POLICY_MODES, DECISION_REASONS, RECEIPT_STATUSES, PROPOSAL_TTL_MS, TEXT_MAX_BYTES, HONESTY_LINE_DEFAULT, IDEMPOTENCY_MODES,
  WITHDRAWABLE_STATES, WITHDRAWN_DEFAULT_REASON, withdrawVerdict, withdrawWhy, withdrawReason,
  RECEIPT_DIFF_MAX, RECEIPT_BLOCK_MAX_BYTES, RECEIPT_GUIDANCE, receiptDiff, receiptFeedback, receiptFateOf, receiptFateText, RECEIPT_DELIVERIES, receiptDeliveryVerdict, utf8Bytes,
  canTransition, isTerminal, policyMode, hasLinks, offHoursVerdict, decideOutbound, validateProposal, validateCompose, COMPOSE_MAX_RECIPIENTS, expiryVerdict, receiptFor, renderReceiptBlock,
  honestyLine, withHonestyLine, canReconcile, reconcileVerdict,
  REJECTED_DEFAULT_REASON, outcomeOf, outcomeText, reconcileWhyText,
};
