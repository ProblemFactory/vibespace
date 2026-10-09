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
/** lane channel-threads (spec §2.6 / §5.3): the ACCOUNT's row for an AGENT's reactions — `propose` (the default:
 *  a reaction speaks as the user, on someone else's message ⇒ the user approves it), `direct` (the channel's own
 *  verdict — never past it), `off` (the agent verb answers `react-not-available`, why `policy-off`). An unknown
 *  value reads `propose` (fail closed — spec §6.5). */
const REACTION_POLICIES = Object.freeze(['propose', 'direct', 'off']);
const reactionPolicyOf = (v) => (REACTION_POLICIES.includes(v) ? v : 'propose');
const DECISION_REASONS = Object.freeze(['channel-policy', 'links', 'attachments', 'off-hours', 'authority', 'reaction-policy']);
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
 *  reads `review`, and says so. design 012 (Slack S1): `caps` = the adapter's capability row — a mode its
 *  `caps.policyModes` does not allow (Slack forbids `direct`: every send as the person passes the Outbox card) reads
 *  `review` too, `clamped: true` (the stored choice is kept, never obeyed). */
function policyMode(policy, caps = null) {
  const m = policy && typeof policy === 'object' ? policy.mode : policy;
  if (m === undefined || m === null) return { mode: 'review', unknown: false, declared: null };
  if (POLICY_MODES.includes(m)) {
    if (!policyModesOf(caps).includes(m)) return { mode: 'review', unknown: false, declared: m, clamped: true };
    return { mode: m, unknown: false, declared: m };
  }
  return { mode: 'review', unknown: true, declared: String(m).slice(0, 40) };
}
/** The policy modes an adapter allows (its `caps.policyModes`, else every mode) — what the picker offers. A row that
 *  names none of the known modes reads `['review']` (fail closed). */
function policyModesOf(caps) {
  const pm = caps && Array.isArray(caps.policyModes) ? caps.policyModes.filter((x) => POLICY_MODES.includes(x)) : null;
  if (!pm) return POLICY_MODES.slice();
  return pm.length ? pm : ['review'];
}
/** THE POLICY ROW (lane account-policy-door, userW 2026-10-07 "想给整个 Lark 配置可见性与策略，但配不了" — the ACCOUNT's
 *  policy had a route and no door): ONE model for every door that shows or sets a sending policy — the account's
 *  Reach & policy…, the account Edit dialog's select, a conversation's Reach & policy…. `grain` = 'account' |
 *  'conversation'; `policy` = the view at THAT grain (`policyFor`: {mode, source, declared, modes, inherits});
 *  `guards` = the instance settings as the client holds them ({linksReview, attachmentsReview, offHoursTz, offHoursOn,
 *  offHoursStart, offHoursEnd} — never fetched here); `owner` = the owner's own view (only it gets switches); `t` / `modeText` injected. `value` = the grain's OWN stored mode (null = it inherits); the `null`
 *  choice is "Use the account's" / "The vendor's default" — what `inherits` says it reads. */
const fillT = (s, p) => (p ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in p ? String(p[k]) : m)) : String(s));
/** THE SENDING GUARDS AS ROWS (lane guards-door, owner 2026-10-09 "带文件是不是要直接允许也要加个开关，防止用户想要完全放权":
 *  the switches were instance settings and no surface he reads named them). One row per guard, from the SAME `guards`
 *  the summary line reads: `state` 'ask' | 'allow', `toggleTo` = the ONE instance setting's next value (null = no switch:
 *  an agent's view, or off-hours without a zone — then `setZone` offers the browser's zone as one click). */
const GUARD_KEYS = Object.freeze({ attachments: 'channels.guardAttachmentsReview', links: 'channels.guardLinksReview', offHours: 'channels.guardOffHours', offHoursTz: 'channels.offHoursTz' });
const GUARD_REASONS = Object.freeze(['links', 'attachments', 'off-hours']);
function guardRowsOf(g, { t = fillT, owner = false, localTz = '' } = {}) {
  const tz = typeof g.offHoursTz === 'string' ? g.offHoursTz.trim() : '';
  const sw = (on) => (on ? t('waits for your approval, whatever the policy') : t('follows the policy — under Direct it goes without asking'));
  const rows = [
    { id: 'attachments', key: GUARD_KEYS.attachments, label: t('A message with files'), state: g.attachmentsReview !== false ? 'ask' : 'allow' },
    { id: 'links', key: GUARD_KEYS.links, label: t('A message with a link'), state: g.linksReview !== false ? 'ask' : 'allow' },
  ].map((r) => ({ ...r, words: sw(r.state === 'ask'), toggleTo: owner ? r.state !== 'ask' : null, setZone: null }));
  const ohOn = g.offHoursOn !== false;
  const win = { start: g.offHoursStart || '09:00', end: g.offHoursEnd || '18:00', tz };
  const zone = typeof localTz === 'string' ? localTz.trim() : '';
  rows.push({ id: 'offHours', key: GUARD_KEYS.offHours, label: t('Outside working hours'),
    state: tz && ohOn ? 'ask' : 'allow',
    words: !tz ? t('off — no working-hours time zone is set, so any hour goes') : ohOn ? t('waits for your approval outside {start}–{end} Mon–Fri ({tz})', win) : t('off — any hour goes ({start}–{end} {tz} is not checked)', win),
    toggleTo: owner && tz ? !ohOn : null,
    setZone: owner && !tz && zone ? { key: GUARD_KEYS.offHoursTz, value: zone, label: t('Use my time zone ({tz})', { tz: zone }) } : null });
  return rows;
}
function policyRowModel({ grain = 'account', policy = null, guards = null, t = fillT, modeText = (m) => m, owner = false, localTz = '' } = {}) {
  const pol = policy && typeof policy === 'object' ? policy : { mode: 'review', source: 'default' };
  const order = ['review', 'direct'].filter((m) => POLICY_MODES.includes(m));   // the safer choice first
  const modes = Array.isArray(pol.modes) && pol.modes.length ? order.filter((m) => pol.modes.includes(m)) : order;
  const conv = grain === 'conversation';
  const own = pol.source === (conv ? 'conversation' : 'account') && POLICY_MODES.includes(pol.declared) ? pol.declared : null;
  const mode = pol.mode === 'direct' ? 'direct' : 'review';
  // the `null` choice reads: with an own value, what removing it reads (`inherits`); without one, what it reads now
  const inh = own ? (pol.inherits && typeof pol.inherits === 'object' ? pol.inherits : null) : { mode, source: pol.source };
  const inhMode = inh && inh.mode === 'direct' ? 'direct' : 'review';
  const g = guards && typeof guards === 'object' ? guards : {};
  const guardRows = guardRowsOf(g, { t, owner, localTz });
  const ans = Object.fromEntries(guardRows.map((r) => [r.id, r.id === 'offHours' ? (r.state === 'ask' ? t('on') : t('off')) : (r.state === 'ask' ? t('ask') : t('allow'))]));
  const WORDS = {
    direct: t('Direct — agents with send authority send without your approval; files: {attachments} · links: {links} · off-hours: {offHours}', ans),
    review: t('Review — every message waits for your approval'),
  };
  const choices = modes.map((m) => ({ value: m, label: WORDS[m] }));
  choices.push({ value: null, label: conv && inh && inh.source === 'account' ? t('Use the account\'s ({mode})', { mode: modeText(inhMode) }) : t('The vendor\'s default ({mode})', { mode: modeText(inhMode) }) });
  const sourceText = conv
    ? (own ? t('This conversation\'s own policy: {mode} — without it, it would read {other}', { mode: modeText(mode), other: modeText(inhMode) })
      : pol.source === 'account' ? t('Inherits the account: {mode} — pick one above to change it for this conversation only', { mode: modeText(mode) })
        : t('Inherits the vendor\'s default: {mode} — pick one above to change it for this conversation only', { mode: modeText(mode) }))
    : (own ? t('Set on this account: {mode} — every conversation without its own policy reads it', { mode: modeText(mode) })
      : t('Not set on this account — the vendor\'s default applies: {mode}', { mode: modeText(mode) }));
  // the summary line of the rows above (one reading of `guards`, never a second)
  const R = Object.fromEntries(guardRows.map((r) => [r.id, r]));
  const on = [];
  if (R.links.state === 'ask') on.push(t('a link'));
  if (R.attachments.state === 'ask') on.push(t('an attachment'));
  if (R.offHours.state === 'ask') on.push(t('off-hours ({tz})', { tz: String(g.offHoursTz).trim() }));
  const guardsText = on.length ? t('Guards on top (also in Settings → Channels): {list} always needs your approval, whatever the policy', { list: on.join(' · ') }) : t('No guard is on (also in Settings → Channels) — the policy alone decides');
  // FULL DELEGATION said in plain words — only when the policy reads direct AND no guard asks
  const asking = guardRows.filter((r) => r.state === 'ask').map((r) => r.label);
  const delegationText = mode !== 'direct' ? t('Not full delegation — the policy is Review: every message waits for your approval')
    : asking.length ? t('Not full delegation — still asks you: {list}', { list: asking.join(' · ') })
      : t('Full delegation: an agent with send authority sends anything — files, links, at any hour — without asking');
  return { grain, modes, offersDirect: modes.includes('direct'), value: own && modes.includes(own) ? own : null, own, mode, source: pol.source || 'default', inherits: inh ? { mode: inhMode, source: inh.source || 'default' } : null, choices, words: WORDS[mode], sourceText, guardsText, guardRows, delegationText, fullDelegation: mode === 'direct' && !asking.length };
}
/** WHERE A POLICY IS CHANGED (the invariant: a refusal that names a value names where to change it) — the account's
 *  ⋯ → Reach & policy… for an account-grain value, the conversation's row menu for its own. */
function policyWhereText({ grain = 'account', source = 'account' } = {}, t = fillT) {
  return grain === 'conversation' && source === 'conversation'
    ? t('change it in this conversation\'s Reach & policy… (its row menu)')
    : t('change it in the account\'s Reach & policy… (the account\'s ⋯ menu)');
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
  // lane channel-threads (spec §5.3): a REACTION has no text — links / attachments / off-hours cannot apply to it;
  // only the channel's policy and the drafter's authority decide (the account's reaction row sits above, decideReaction)
  const reaction = proposal && proposal.kind === 'reaction';
  if (reaction) detail.reaction = true;
  else if (!g) { detail.guardsUnparseable = 'guards are not an object'; reasons.push('channel-policy'); }
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

/**
 * CHARACTERS THAT HIDE WHAT A LINE SAYS (r6 verify O1, 2026-09-28). The
 * direction controls change the ORDER text is displayed in ("Trojan Source":
 * the bidi embedding / override / isolate controls U+202A–E and U+2066–9, the
 * marks U+200E / U+200F / U+061C — the very set src/exit-reach.js
 * `hiddenOrderOf` refuses in a command; test-channel-outbox pins the two
 * equal over every BMP code point); the zero-width characters U+200B / U+2060
 * / U+FEFF hide inside a word. The joiners U+200C / U+200D are apart: an
 * emoji sequence and several scripts need them, so only an ADDRESS or an id
 * refuses them. An agent's to / cc / subject / replyTo refuse the set by
 * name; its TEXT keeps them (RTL writing uses the marks) and the card draws
 * each one as a visible mark (`revealSegments`) — the approver reads what is
 * sent, never a reordered line.
 */
// verify-r6 Z2: THE SET is src/hidden-chars.js (one answer for every approval surface; the outbox's own raw-character
// lists were a third spelling). An address / an id refuses the joiners too; a subject keeps them (emoji); a TEXT keeps
// line endings and joiners and the card MARKS the rest (`revealSegments`)
const HC = require('./hidden-chars.js');
/** The hidden characters `s` carries, as `U+XXXX` names (distinct, in order). `joiners: true` = an address / an id. */
function hiddenCharsOf(s, { joiners = false } = {}) {
  return HC.hiddenCharsOf(String(s == null ? '' : s), { allowJoiners: !joiners, allowCR: false });
}
/** `s` as display segments: `{text}` runs and `{hidden: 'U+202E'}` marks —
 *  the card renders a mark as a visible chip, never the character itself. */
function revealSegments(s) {
  return HC.revealParts(s, { allowJoiners: true, allowCR: true }).map((p) => (p.code ? { hidden: p.code } : { text: p.text }));
}

/** The reaction ops a proposal may carry (spec §5.3). */
const REACTION_OPS = Object.freeze(['add', 'remove']);
const REACTION_QUOTE_MAX = 120;
/**
 * A REACTION PROPOSAL (lane channel-threads, spec §5.3) — the shape beside the text proposal:
 * `{kind:'reaction', msg, key, op:'add'|'remove', glyph, label, why}`. `set` = the adapter's reaction vocabulary
 * (`{keys:[{key, glyph, label}]}` or an array of keys) — a key it does not list is `bad-emoji`, judged by the key's
 * own alphabet FIRST (bound before parse: a 64 KiB "key" is refused before any lookup). `text` absent by design.
 * `{ok, proposal}` | `{ok:false, code:'bad-emoji'|'bad-proposal', error, why}`.
 */
function validateReaction(input = {}, set = null) {
  const p = input && typeof input === 'object' ? input : {};
  const msg = typeof p.msg === 'string' || typeof p.msg === 'number' ? String(p.msg) : '';
  if (!msg || msg.length > 512) return { ok: false, code: 'bad-proposal', error: 'msg (the vendor id of the message to react to) is required', why: 'msg' };
  const op = p.op === undefined || p.op === null ? 'add' : p.op;
  if (!REACTION_OPS.includes(op)) return { ok: false, code: 'bad-proposal', error: 'op must be add or remove', why: 'op' };
  const key = typeof p.key === 'string' ? p.key : '';
  if (!/^[A-Za-z0-9_+\-:.]{1,64}$/.test(key)) return { ok: false, code: 'bad-emoji', error: 'that is not an emoji key this channel knows', why: 'key' };
  const keys = Array.isArray(set) ? set.map((k) => (k && typeof k === 'object' ? k : { key: k })) : set && Array.isArray(set.keys) ? set.keys : null;
  const hit = keys ? keys.find((k) => k && k.key === key) : null;
  // a REMOVE of a key the set no longer lists is still a removal of OUR reaction (the vendor judges it); an ADD must be listed
  if (op === 'add' && !hit) return { ok: false, code: 'bad-emoji', error: 'that emoji is not one this channel allows', why: 'key' };
  let why = null;
  if (typeof p.why === 'string' && p.why.trim()) why = { kind: 'text', id: null, label: p.why.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 300) };
  else if (p.why && typeof p.why === 'object') why = { kind: 'text', id: null, label: String(p.why.label || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 300) || null };
  const glyph = hit && typeof hit.glyph === 'string' && hit.glyph.length <= 16 ? hit.glyph : null;
  const label = String((hit && hit.label) || key).slice(0, 40);
  return { ok: true, proposal: { kind: 'reaction', msg, key, op, glyph, label, why } };
}
/** The quote a reaction card shows: the message's author + its text, one line, ≤ 120 (never re-parsed). */
function reactionQuote(record) {
  const r = record || {};
  const a = r.author || {};
  const text = inertFrameLine(inertFrames(String(r.text == null ? '' : r.text).replace(/[\r\n\t]+/g, ' ').trim()));
  return { author: String(a.name || a.id || '').replace(/[\r\n\t]+/g, ' ').slice(0, 200), text: text.length > REACTION_QUOTE_MAX ? text.slice(0, REACTION_QUOTE_MAX - 1) + '…' : text };
}
/**
 * THE ACCOUNT'S REACTION ROW OVER THE CHANNEL'S VERDICT (spec §5.3 / §2.6). `reactionPolicy`: `off` ⇒ refused
 * (`react-not-available`, why `policy-off` — no proposal row); `propose` (the default, and any unknown value) ⇒
 * REVIEW whatever the channel says (a reaction speaks as the user, on someone else's message); `direct` ⇒ the
 * channel's own verdict for a reaction (`decideOutbound` with kind reaction: channel policy + authority only) —
 * the row can only relax to the channel's verdict, never past it.
 * `{refused:true, code, why}` | `{mode, reasons, detail}`.
 */
function decideReaction({ reactionPolicy = null, channelPolicy = null, authority = 'draft', now = Date.now() } = {}) {
  const row = reactionPolicyOf(reactionPolicy);
  if (row === 'off') return { refused: true, code: 'react-not-available', why: 'policy-off' };
  const base = decideOutbound({ channelPolicy, guards: {}, proposal: { kind: 'reaction', authority }, now });
  if (row === 'direct') return { ...base, detail: { ...base.detail, reactionPolicy: row } };
  const reasons = [...new Set([...base.reasons, 'reaction-policy'])];
  return { mode: 'review', reasons, detail: { ...base.detail, reactionPolicy: row } };
}

/**
 * WHERE A REPLY LANDS — THE PLACEMENT (owner 2026-09-28, after lane channel-threads verify r2: "the boolean is
 * Lark-shaped"). A proposal used to carry `{replyTo, inThread: boolean}`; three vendors answer a message four ways:
 *   chat         a plain message in the conversation (it answers no message)       every vendor
 *   quote        answers a message, shown in the MAIN list                          Lark reply · Telegram reply_to · Slack: none
 *   thread       inside the answered message's thread                               Lark reply_in_thread / topic groups · Slack thread_ts
 *   thread+chat  inside the thread AND echoed to the conversation                   Slack reply_broadcast only
 * The ADAPTER declares which it offers in its `threads` cap row (`placements`, + `rootReply` = the vendor's own norm
 * for a reply to a message OUTSIDE any thread: Lark quote, Slack thread, Telegram quote); the registry validates the
 * declaration (src/channels/index.js `validateCaps`) and refuses an undeclared placement at `send`; THIS verdict
 * decides a proposal's placement BEFORE the proposal exists — an undeclared one is `placement-not-offered`, worded,
 * and nothing is created. The rules (each a row of scripts/test-channel-placement.mjs, with a patched copy):
 *  PL1 a placement outside the closed set is a malformed request (`bad-proposal`, why `placement`);
 *  PL2 `quote` / `thread` / `thread+chat` name the message they answer (no `replyTo` ⇒ `bad-proposal`, why `replyTo`
 *      — why `inThread` when the request spoke the old boolean); `chat` names none (`replyTo` with `chat` ⇒ why
 *      `placement`);
 *  PL3 the caller named only the message (no placement) ⇒ THE VENDOR'S NORM: a message already inside a VENDOR thread
 *      (its root or a reply — the parent's thread index kind `vendor`) ⇒ `thread` (it cannot be quoted from the main
 *      list: Lark itself files a reply to a topic message in the topic); a message outside one ⇒ the row's
 *      `rootReply`; neither declared ⇒ `placement-not-offered`, why `no-replies`;
 *  PL4 a placement the adapter does not declare ⇒ `placement-not-offered`, why `not-declared` (+ `offered`);
 *  PL5 `quote` of a message inside a vendor thread ⇒ `placement-not-offered`, why `parent-in-thread` — the vendor
 *      would file it in the thread and the card would have said "quoted";
 *  PL6 no message and no placement ⇒ `chat` (where declared).
 * A stored proposal keeps `inThread` as a READ ALIAS (`placementOf`): no `placement` + `inThread: true` = `thread`.
 */
const PLACEMENTS = Object.freeze(['chat', 'quote', 'thread', 'thread+chat']);
/** The placements that land INSIDE a thread (the old `inThread: true`). */
const THREAD_PLACEMENTS = Object.freeze(['thread', 'thread+chat']);
/** The placements a vendor may declare as its norm for a reply to a message outside any thread. */
const ROOT_REPLIES = Object.freeze(['quote', 'thread']);
const isThreadPlacement = (x) => THREAD_PLACEMENTS.includes(x);
const capsThreads = (caps) => (caps && typeof caps === 'object' && caps.threads && typeof caps.threads === 'object' ? caps.threads : null);
/**
 * The placements an adapter OFFERS, in the closed order — its `threads.placements` declaration, CLAMPED by the rest of
 * its row (a read-only adapter offers none; a thread placement needs `replyInto`; `thread+chat` needs `thread`) so a
 * declaration can never widen a control (validateCaps refuses the incoherent ones at registration anyway). A row that
 * predates the enum (a suite's scripted module) reads as the contract it carried: chat, a reply to a message
 * (`quote`), and `thread` where it can reply into one.
 */
function placementsOf(caps) {
  const c = caps && typeof caps === 'object' ? caps : {};
  if (!(Array.isArray(c.sendAs) && c.sendAs.length)) return [];
  const t = capsThreads(c);
  const replyInto = !!(t && t.replyInto === true);
  const declared = t && Array.isArray(t.placements) ? t.placements : ['chat', 'quote', ...(replyInto ? ['thread'] : [])];
  return PLACEMENTS.filter((x) => declared.includes(x) && (!isThreadPlacement(x) || replyInto) && (x !== 'thread+chat' || declared.includes('thread')));
}
/** The vendor's norm for a reply to a message OUTSIDE any thread (PL3), or null when the adapter answers no message. */
function rootReplyOf(caps) {
  const offered = placementsOf(caps);
  const t = capsThreads(caps);
  if (t && Array.isArray(t.placements)) return ROOT_REPLIES.includes(t.rootReply) && offered.includes(t.rootReply) ? t.rootReply : null;
  return offered.includes('quote') ? 'quote' : offered.includes('thread') ? 'thread' : null;   // the pre-enum contract: replyTo = a reply in the list
}
/** A stored proposal's placement — THE READ ALIAS (a proposal stored before the enum carries `inThread` / `replyTo`
 *  only). null for a composed message and a reaction (they are not replies). */
function placementOf(p) {
  const x = p && typeof p === 'object' ? p : {};
  if (x.compose || x.kind === 'reaction') return null;
  if (PLACEMENTS.includes(x.placement)) return x.placement;
  if (x.inThread === true) return 'thread';
  return x.replyTo ? 'quote' : 'chat';
}
/** The placement in the agent's words (the receipt block, the CLI's `placementText`). */
function placementWords(placement) {
  switch (placement) {
    case 'chat': return 'in the chat';
    case 'quote': return 'as a quoted reply, in the chat';
    case 'thread': return 'in a thread';
    case 'thread+chat': return 'in a thread, and also shown in the chat';
    default: return null;
  }
}
/** The placement's NAME in an agent-facing refusal / list (`offered here: chat, quote, thread`). */
const placementName = (x) => (x === 'thread+chat' ? 'thread+chat (in the thread and also in the chat)' : String(x));
/**
 * THE VERDICT (PL1–PL6), PURE: `{requested, replyTo, caps, parent, alias}` → `{ok:true, placement, defaulted, rule}` |
 * `{ok:false, code, why, placement?, offered?, error}`. `caps` = the adapter's STATIC caps (the declaration);
 * `parent` = `{inThread: boolean}` — the answered message sits in a VENDOR thread (null: not loaded here ⇒ outside);
 * `alias` = the request spoke the old `inThread` boolean (its refusals keep `why: 'inThread'`).
 */
function placementVerdict({ requested = null, replyTo = null, caps = null, parent = null, alias = false } = {}) {
  const offered = placementsOf(caps);
  const req = requested === undefined || requested === null || requested === '' ? null : requested;
  if (req !== null && !PLACEMENTS.includes(req)) return { ok: false, code: 'bad-proposal', why: 'placement', error: `placement must be one of ${PLACEMENTS.join(' | ')}` };
  const to = replyTo === undefined || replyTo === null || String(replyTo) === '' ? null : String(replyTo);
  const inThread = !!(parent && parent.inThread === true);
  const refuse = (placement, why, error) => ({ ok: false, code: 'placement-not-offered', why, placement, offered, error });
  if (!to) {
    if (req && req !== 'chat') return { ok: false, code: 'bad-proposal', why: alias ? 'inThread' : 'replyTo', error: `a reply ${placementWords(req)} names the message it answers (replyTo / --to <message id>)` };
    if (!offered.includes('chat')) return refuse('chat', 'not-declared', `a message in the chat is not offered on this channel — offered here: ${offered.map(placementName).join(', ') || 'none'}`);
    return { ok: true, placement: 'chat', defaulted: !req, rule: 'no-message' };
  }
  if (req === 'chat') return { ok: false, code: 'bad-proposal', why: 'placement', error: 'a message in the chat answers no message — leave out replyTo (--to), or place it as a quote or in the thread' };
  let placement = req, rule = 'asked';
  if (!placement) {
    if (inThread && offered.includes('thread')) { placement = 'thread'; rule = 'parent-in-thread'; }
    else { placement = rootReplyOf(caps); rule = 'root'; }
    if (!placement) return refuse(null, 'no-replies', `this channel cannot answer a specific message — send it without --to (offered here: ${offered.map(placementName).join(', ') || 'none'})`);
  }
  if (!offered.includes(placement)) return refuse(placement, 'not-declared', `${placement === 'quote' ? 'a quoted reply' : placement === 'thread' ? 'a reply in a thread' : placement === 'thread+chat' ? 'a reply in a thread that is also shown in the chat' : 'that placement'} is not offered on this channel — offered here: ${offered.map(placementName).join(', ') || 'none'}`);
  if (placement === 'quote' && inThread) return refuse('quote', 'parent-in-thread', `that message is inside a thread, so a reply to it lands in the thread — reply in the thread (--in-thread${offered.includes('thread+chat') ? ', or --also-in-chat' : ''}), or leave the placement out`);
  return { ok: true, placement, defaulted: !req, rule };
}
/**
 * THE PLACEMENT IN WORDS (the approval card, the Outbox — the device's language through the injected `t`):
 * `{placement, quote: {author, text}}` → one line, or null for `chat` (a plain message has no place to say).
 */
function placementText(placement, { t = defaultT, quote = null } = {}) {
  const q = quote && typeof quote === 'object' ? quote : {};
  const has = !!(q.author || q.text);
  const vars = { author: q.author || '?', quote: q.text || '' };
  switch (placement) {
    case 'quote': return has ? t('Quoted reply — to {author}: "{quote}"', vars) : t('Quoted reply, shown in the chat');
    case 'thread': return has ? t('Reply in thread — under {author}: "{quote}"', vars) : t('Reply in thread');
    case 'thread+chat': return has ? t('Reply in thread, also shown in the chat — under {author}: "{quote}"', vars) : t('Reply in thread, also shown in the chat');
    default: return null;
  }
}
/** A `placement-not-offered` refusal in the device's language (`routeErrorText` — the engine's sentence is the
 *  agent's contract). */
function placementRefusalText(r, { t = defaultT } = {}) {
  const x = r || {};
  if (x.why === 'parent-in-thread') return t('That message is inside a thread — a reply to it goes in the thread');
  if (x.why === 'no-replies') return t('This channel cannot answer a specific message — send it as a plain message');
  switch (x.placement) {
    case 'chat': return t('A plain message is not offered here');
    case 'quote': return t('A quoted reply is not offered here');
    case 'thread': return t('Replying in a thread is not offered here');
    case 'thread+chat': return t('A thread reply that is also shown in the chat is not offered here');
    default: return t('That kind of reply is not offered here');
  }
}


/**
 * AN AGENT'S ATTACHMENTS (design 005 §2.B, B-fd1f). The CLI the agent runs reads its files and sends their bytes IN the
 * proposal (`attachments: [{name, data: <base64>}]`) — the server never opens a path an agent names. Here, PURE: the
 * SHAPE and the BOUNDS (at most ATTACH_MAX_COUNT files, each at least 1 byte, at most ATTACH_MAX_TOTAL together), the
 * NAME rule (a name is only a name: no separator, no character of src/hidden-chars.js's set, no line break / tab, no edge space, at most
 * ATTACH_NAME_MAX), the TYPE sniffed from the bytes (`sniffType` — never the name's extension), and `attachVerdict` over
 * the adapter's `caps.sendAttachments` row (null ⇒ `attachments-not-offered`, in the channel's name, with its reason).
 * Every refusal names itself in `why` (one of ATTACH_CODES) and creates nothing.
 */
const ATTACH_MAX_COUNT = 10;
const ATTACH_MAX_TOTAL = 25e6;
const ATTACH_NAME_MAX = 200;
const ATTACH_CODES = Object.freeze(['attachment-count', 'attachment-too-large', 'attachment-empty', 'attachment-name', 'attachment-data', 'attachments-not-offered', 'attachment-shape', 'attachment-changed', 'attachments-held']);
/** the four raster types a card may draw inline (the owner's read route serves the same set inline) */
const INLINE_RASTER = Object.freeze(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const B64_RE = /^[A-Za-z0-9+/]*={0,2}$/;
/** The decoded size of a base64 string, nothing decoded (null = not base64). */
function base64Bytes(v) {
  if (typeof v !== 'string' || v.length % 4 !== 0 || !B64_RE.test(v)) return null;
  return (v.length / 4) * 3 - (v.endsWith('==') ? 2 : v.endsWith('=') ? 1 : 0);
}
/** A file's NAME as the agent gave it — only a name: refused (never cleaned) when it is a path, hides a character, or is too long. */
function safeAttachmentName(name) {
  const no = (error) => ({ ok: false, why: 'attachment-name', error });
  if (typeof name !== 'string' || !name.trim()) return no('an attachment needs a name');
  if (name.length > ATTACH_NAME_MAX) return no(`an attachment's name is longer than ${ATTACH_NAME_MAX} characters`);
  const shown = JSON.stringify(name.slice(0, 80));
  if (/[/\\]/.test(name) || name === '.' || name === '..') return no(`${shown} is a path — an attachment is named by its file name only`);
  // verify-r6 Z2: THE hidden-character set is src/hidden-chars.js (joiners refused, as in an address); a line feed or a tab
  // is what it looks like in a text, never in a name
  const hid = hiddenCharsOf(name, { joiners: true });
  if (hid.length) return no(`an attachment's name carries a control or invisible character (${hid.join(', ')})`);
  if (name.includes('\n') || name.includes('\t')) return no('an attachment\'s name carries a line break or a tab');
  // verify r1 (C10): a LONE UTF-16 surrogate is no character at all — Gmail's RFC 2231 name and the card's download
  // header cannot encode it (encodeURIComponent throws: the send failed after the approval, the route answered 500)
  if (/\p{Cs}/u.test(name)) return no('an attachment\'s name carries a broken character (a lone UTF-16 surrogate)');
  if (name !== name.trim()) return no(`the name ${shown} starts or ends with a space`);
  return { ok: true, name };
}
/** The proposal's `attachments`, validated: `{ok, list: [{name, data, bytes}]}` or the refusal by name. */
function attachmentsOf(v) {
  const no = (why, error) => ({ ok: false, why, error: `${error} — nothing was created` });
  if (v === undefined || v === null) return { ok: true, list: [] };
  if (!Array.isArray(v)) return no('attachment-data', 'attachments must be a list of {name, data}');
  if (v.length > ATTACH_MAX_COUNT) return no('attachment-count', `at most ${ATTACH_MAX_COUNT} attachments in one message (got ${v.length})`);
  const list = [];
  let total = 0;
  for (const a of v) {
    const nm = safeAttachmentName(a && a.name);
    if (!nm.ok) return no(nm.why, nm.error);
    const bytes = base64Bytes(a && a.data);
    if (bytes === null) return no('attachment-data', `${JSON.stringify(nm.name.slice(0, 80))} carries no bytes (data must be base64 — vibespace-channels --attach reads the file)`);
    if (bytes < 1) return no('attachment-empty', `${JSON.stringify(nm.name.slice(0, 80))} has no bytes (it is 0 bytes long)`);
    total += bytes;
    if (total > ATTACH_MAX_TOTAL) return no('attachment-too-large', `the attachments are larger than ${ATTACH_MAX_TOTAL / 1e6} MB together`);
    list.push({ name: nm.name, data: a.data, bytes });
  }
  return { ok: true, list };
}
/** The first bytes as text, or null (a NUL, or not UTF-8 — a cut character at the end is allowed). */
function textHead(b) {
  const n = Math.min(b.length, 512);
  for (let i = 0; i < n; i++) if (b[i] === 0) return null;
  const u8 = b instanceof Uint8Array ? b : Uint8Array.from(b);
  for (let cut = 0; cut < 4 && cut < n; cut++) { try { return new TextDecoder('utf-8', { fatal: true }).decode(u8.subarray(0, n - cut)); } catch { /* try a shorter head */ } }
  return null;
}
/** The TYPE of a file from its BYTES: `{mime, kind}` — the four raster pictures are `image`, everything else a `file`
 *  (an SVG or an HTML page is a file, never a picture to draw). PURE over a Buffer / Uint8Array. */
function sniffType(buf) {
  const b = buf || [];
  const at = (i) => (i < b.length ? b[i] : -1);
  const starts = (sig, off = 0) => sig.every((x, i) => at(off + i) === x);
  const ascii = (str, off = 0) => starts([...str].map((c) => c.charCodeAt(0)), off);
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: 'image/png', kind: 'image' };
  if (starts([0xff, 0xd8, 0xff])) return { mime: 'image/jpeg', kind: 'image' };
  if (ascii('GIF87a') || ascii('GIF89a')) return { mime: 'image/gif', kind: 'image' };
  if (ascii('RIFF') && ascii('WEBP', 8)) return { mime: 'image/webp', kind: 'image' };
  if (ascii('%PDF-')) return { mime: 'application/pdf', kind: 'file' };
  if (starts([0x50, 0x4b, 0x03, 0x04]) || starts([0x50, 0x4b, 0x05, 0x06])) return { mime: 'application/zip', kind: 'file' };
  if (starts([0x1f, 0x8b])) return { mime: 'application/gzip', kind: 'file' };
  const head = textHead(b);
  if (head !== null) {
    const h = (head.charCodeAt(0) === 0xfeff ? head.slice(1) : head).trimStart().slice(0, 256).toLowerCase();
    if (/^<svg[\s>]/.test(h) || (/^<\?xml/.test(h) && h.includes('<svg'))) return { mime: 'image/svg+xml', kind: 'file' };
    if (/^(<!doctype html|<html[\s>]|<head[\s>]|<body[\s>]|<script[\s>])/.test(h)) return { mime: 'text/html', kind: 'file' };
    return { mime: 'text/plain', kind: 'file' };
  }
  return { mime: 'application/octet-stream', kind: 'file' };
}
const EXT_TYPES = Object.freeze({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', pdf: 'application/pdf', zip: 'application/zip', docx: 'application/zip', xlsx: 'application/zip', pptx: 'application/zip', odt: 'application/zip', gz: 'application/gzip', svg: 'image/svg+xml', html: 'text/html', htm: 'text/html', txt: 'text/plain' });
/** The card's chip: the name's extension says one type, the bytes another (`{ext, said}`), else null. */
function nameTypeMismatch(name, mime) {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(String(name || ''));
  const said = m ? EXT_TYPES[m[1].toLowerCase()] : null;
  return said && said !== mime ? { ext: m[1].toLowerCase(), said } : null;
}
/** May THIS channel carry these files (`[{kind, bytes}]`)? Over the adapter's row: absent / null ⇒ `attachments-not-offered`
 *  (with the row's reason); one row `{maxCount, maxTotalBytes, withText}`, or `{images, files}` each `{maxCount, maxBytes,
 *  withText}` — pictures and files never share a message there, and a group without text refuses text (`attachment-shape`). */
function attachVerdict(row, list, { hasText = true, channel = 'this channel', why = null } = {}) {
  const files = Array.isArray(list) ? list : [];
  if (!files.length) return { ok: true };
  const no = (code, error) => ({ ok: false, why: code, error: `${error} — nothing was created` });
  const ch = String(channel || 'this channel');
  const r = row && typeof row === 'object' ? row : null;
  if (!r) return no('attachments-not-offered', `${ch} does not take attachments from an agent${why ? ` (${why})` : ''}; send the text alone, or ask the user to send the file`);
  const mb = (n) => `${Math.round(Number(n) / 1e5) / 10} MB`;
  if (r.images !== undefined || r.files !== undefined) {
    const pics = files.filter((f) => f && f.kind === 'image');
    if (pics.length && pics.length < files.length) return no('attachment-shape', `on ${ch} pictures and other files cannot ride one message — send them as separate replies`);
    const g = pics.length ? r.images : r.files;
    if (!g) return no('attachments-not-offered', `${ch} does not take ${pics.length ? 'pictures' : 'files'} from an agent${why ? ` (${why})` : ''}`);
    if (hasText && g.withText === false) return no('attachment-shape', `on ${ch} a file is its own message — send the text as another reply`);
    if (files.length > g.maxCount) return no('attachment-count', `${ch} takes at most ${g.maxCount} ${pics.length ? 'pictures' : 'files'} in one message`);
    const big = files.find((f) => Number(f.bytes) > g.maxBytes);
    if (big) return no('attachment-too-large', `${ch} takes at most ${mb(g.maxBytes)} per ${pics.length ? 'picture' : 'file'} (${JSON.stringify(String(big.name || '').slice(0, 80))} is ${mb(big.bytes)})`);
    return { ok: true };
  }
  if (files.length > r.maxCount) return no('attachment-count', `${ch} takes at most ${r.maxCount} attachments in one message`);
  const total = files.reduce((n, f) => n + (Number(f && f.bytes) || 0), 0);
  if (total > r.maxTotalBytes) return no('attachment-too-large', `${ch} takes at most ${mb(r.maxTotalBytes)} of attachments in one message (these are ${mb(total)})`);
  if (hasText && r.withText === false) return no('attachment-shape', `on ${ch} attachments go without text — send the text as another reply`);
  return { ok: true };
}
/** lane owner-composer-attach: THE OWNER'S COMPOSER CHIPS — every file the person picks, drops or pastes is judged HERE,
 *  BEFORE the send, over the same facts the engine's `attachVerdict` + the account's `send-attachment` offer read: `row` =
 *  the adapter's `sendAttachments`, `offer` = the conversation's `{offered, why, requiredScopes}`, `files` = `[{name,
 *  bytes, kind}]` in the order picked (`kind` sniffed from the bytes; null when too large to read). Answers `{chips:
 *  [{n, state:'ok'|'refused'|'blocked', why, limit?}], send: [n…], blocked: {requiredScopes} | null, shape}` — a file
 *  this account cannot carry is `blocked` (never LOOKS attached), one past a limit `refused` by name; only `ok` ones ride
 *  the send. PURE. */
function composeFilesVerdict(row, offer, files, { hasText = false } = {}) {
  const list = Array.isArray(files) ? files : [];
  const o = offer && typeof offer === 'object' ? offer : { offered: false, why: 'unknown' };
  const blocked = !o.offered && o.why === 'attachments-not-sendable' ? { requiredScopes: (Array.isArray(o.requiredScopes) ? o.requiredScopes : []).slice(0, 8).map(String) } : null;
  const r = row && typeof row === 'object' ? row : null;
  const chips = [];
  const ok = [];
  let total = 0;
  for (let n = 0; n < list.length; n++) {
    const f = list[n] || {};
    const bytes = Math.max(0, Number(f.bytes) || 0);
    const refuse = (why, limit = null) => chips.push({ n, state: 'refused', why, ...(limit !== null ? { limit } : {}) });
    if (blocked) { chips.push({ n, state: 'blocked', why: 'attachments-not-sendable' }); continue; }
    if (!o.offered || !r) { refuse(o.why && o.why !== 'attachments-not-sendable' ? String(o.why) : 'attachments-not-offered'); continue; }
    const nm = safeAttachmentName(f.name);
    if (!nm.ok) { refuse('attachment-name'); continue; }
    if (bytes < 1) { refuse('attachment-empty'); continue; }
    const g = r.images !== undefined || r.files !== undefined ? (f.kind === 'image' ? r.images : r.files) : r;
    if (!g) { refuse('attachments-not-offered'); continue; }
    if (g !== r && ok.length && ok.some((m) => (m.kind === 'image') !== (f.kind === 'image'))) { refuse('attachment-shape'); continue; }
    const maxCount = Math.min(ATTACH_MAX_COUNT, Number(g.maxCount) || 0);
    if (ok.length + 1 > maxCount) { refuse('attachment-count', maxCount); continue; }
    if (g.maxBytes !== undefined && bytes > Number(g.maxBytes)) { refuse('attachment-too-large', Number(g.maxBytes)); continue; }
    const cap = Math.min(ATTACH_MAX_TOTAL, g.maxTotalBytes !== undefined ? Number(g.maxTotalBytes) : ATTACH_MAX_TOTAL);
    if (total + bytes > cap) { refuse('attachment-too-large', cap); continue; }
    if (f.kind === null || f.kind === undefined) { refuse('attachment-data'); continue; }
    total += bytes;
    ok.push({ n, kind: f.kind });
    chips.push({ n, state: 'ok', why: null });
  }
  const g0 = r && ok.length ? (r.images !== undefined || r.files !== undefined ? (ok[0].kind === 'image' ? r.images : r.files) : r) : null;
  return { chips, send: ok.map((m) => m.n), blocked, shape: !!(g0 && hasText && g0.withText === false) };
}
/** lane channel-send-files: a send's PARTS as the adapter answered them (Lark: the text + one message per file; Slack:
 *  one chain per file) — bounded, the fields the receipt reads; null when the send was one message. PURE. */
/** lane channel-reply-real (verify r3): EVERY vendor id a sent proposal landed — the first piece's plus each landed
 *  part's (Lark's text + one message per file): a 引用 of the attachment message is a reply to what the agent sent. PURE. */
function sentIdsOf(result) {
  const r = result && typeof result === 'object' ? result : {};
  const out = [];
  for (const v of [r.vendorMessageId, ...(Array.isArray(r.parts) ? r.parts.filter((x) => x && x.ok === true).map((x) => x.vendorMessageId) : [])]) if (v !== null && v !== undefined && String(v) !== '' && !out.includes(String(v))) out.push(String(v));
  return out;
}
/** lane slack-file-send-key (B-2840): the FILES each self-authored record shared — Map(file id → that record's vendor id),
 *  the earliest share first (records in `at` order). Slack keys a file send by the FILE id (its completeUploadExternal
 *  answers no message); the share message is what a thread reply names. PURE. */
function sharedFilesOf(records) {
  const out = new Map();
  const list = (Array.isArray(records) ? records : []).filter((r) => r && r.author && r.author.isSelf === true && r.vendorId && Array.isArray(r.attachments));
  for (const r of list.sort((a, b) => Number(a.at) - Number(b.at))) for (const a of r.attachments) if (a && a.id && !out.has(String(a.id))) out.set(String(a.id), String(r.vendorId));
  return out;
}
/** lane slack-file-send-key (B-2840): a sent result keyed by FILE ids, re-keyed by the messages that shared them
 *  (`byFile` from sharedFilesOf): the result's and each landed part's file-id key → the message id, the file ids kept in
 *  `fileIds` (a part keeps its own as `fileId`). null when nothing moves — a replay is a no-op. PURE. */
function rekeyByFiles(result, byFile) {
  const r = result && typeof result === 'object' ? result : null;
  if (!r || !byFile || !byFile.size) return null;
  const learned = [];
  const to = (v) => { const k = v === null || v === undefined ? '' : String(v); if (!k || !byFile.has(k)) return null; if (!learned.includes(k)) learned.push(k); return byFile.get(k); };
  const head = to(r.vendorMessageId);
  const parts = Array.isArray(r.parts) ? r.parts.map((x) => { const m = x && x.ok === true ? to(x.vendorMessageId) : null; return m ? { ...x, vendorMessageId: m, fileId: String(x.vendorMessageId) } : x; }) : null;
  if (!learned.length) return null;
  return { ...r, ...(head ? { vendorMessageId: head } : {}), ...(parts ? { parts } : {}), fileIds: [...new Set([...(Array.isArray(r.fileIds) ? r.fileIds.map(String) : []), ...learned])].slice(0, 12) };
}
function sendParts(v) {
  if (!Array.isArray(v) || !v.length) return null;
  return v.slice(0, 12).filter((x) => x && typeof x === 'object').map((x) => ({ part: x.part === 'text' ? 'text' : 'attachment', ...(x.name ? { name: String(x.name).slice(0, 200) } : {}), ok: x.ok === true, ...(x.vendorMessageId ? { vendorMessageId: String(x.vendorMessageId).slice(0, 200) } : {}), ...(x.ok === true ? {} : { code: String(x.code || 'vendor-error').slice(0, 40), ...(x.why ? { why: String(x.why).slice(0, 300) } : {}), ...(x.lost ? { lost: true } : {}), ...(Array.isArray(x.requiredScopes) && x.requiredScopes.length ? { requiredScopes: x.requiredScopes.slice(0, 8).map(String) } : {}) }) }));
}
/** verify r1 (F1): a send in parts whose answer was LOST before anything landed, settled `sent` by a reconcile — the lost
 *  part is what the reconcile found (it landed); every part after it was never sent (the chain stopped at the lost answer).
 *  Without this the receipt said SENT "with 2 attachments" while no file had left. PURE. */
function reconciledParts(v, vendorMessageId = null) {
  const ps = sendParts(v);
  if (!ps) return null;
  const at = ps.findIndex((x) => !x.ok && x.code !== 'not-sent');
  return ps.map((x, i) => (i === at ? { part: x.part, ...(x.name ? { name: x.name } : {}), ok: true, ...(vendorMessageId ? { vendorMessageId: String(vendorMessageId).slice(0, 200) } : {}) } : x));
}
/** The parts in the receipt's words: "landed: the text, a.png · NOT landed: b.pdf (forbidden: … needs files:write)". */
function partsWords(parts) {
  const ps = sendParts(parts) || [];
  const nm = (x) => (x.part === 'text' ? 'the text' : JSON.stringify(String(x.name || 'a file').slice(0, 80)));
  const ok = ps.filter((x) => x.ok), no = ps.filter((x) => !x.ok);
  const said = (x) => `${nm(x)} (${x.code === 'not-sent' ? 'not sent after the refusal before it' : `${x.code}${x.lost ? ', the answer was lost — check the platform' : ''}${x.why ? `: ${x.why}` : ''}${x.requiredScopes ? ` — needs ${x.requiredScopes.join(', ')}` : ''}`})`;
  return [ok.length ? `landed: ${ok.map(nm).join(', ')}` : null, no.length ? `NOT landed: ${no.map(said).join('; ')}` : null].filter(Boolean).join(' · ');
}
/** The attachments a proposal STORED (each with its sha256) — a record from before the bytes (names only) has none. */
function storedAttachments(p) {
  return (p && Array.isArray(p.attachments) ? p.attachments : []).filter((a) => a && typeof a === 'object' && typeof a.sha256 === 'string' && a.sha256);
}
/** A size in the card's and the receipt's words: 12 B · 340 KB · 1.2 MB. */
function attachmentSize(n) {
  const b = Math.max(0, Number(n) || 0);
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}
/** verify r1 (C4): the bytes ONE drafter's UNDECIDED proposals (any state but a terminal one) keep under outbox-files —
 *  at most ATTACH_HELD_MAX together, so a looping agent cannot fill the owner's disk for the 24 h a proposal waits
 *  (each new proposal is judged with what is held; `{ok}` or `attachments-held` by name). PURE. */
const ATTACH_HELD_MAX = 100e6;
function attachHeldVerdict(proposals, drafter, list) {
  const adding = (Array.isArray(list) ? list : []).reduce((n, f) => n + (Number(f && f.bytes) || 0), 0);
  if (!adding) return { ok: true };
  const who = (d) => `${(d && d.kind) || 'user'}:${(d && d.id) || ''}`;
  const me = who(drafter);
  let held = 0;
  for (const p of Object.values(proposals && typeof proposals === 'object' ? proposals : {})) {
    if (!p || TERMINAL_STATES.includes(p.state) || p.attachmentsGoneAt || who(p.draftedBy) !== me) continue;
    held += storedAttachments(p).reduce((n, a) => n + (Number(a.bytes) || 0), 0);
  }
  if (held + adding <= ATTACH_HELD_MAX) return { ok: true, held };
  return { ok: false, why: 'attachments-held', held, error: `your proposals still awaiting the user already hold ${Math.round(held / 1e6)} MB of attachments (at most ${ATTACH_HELD_MAX / 1e6} MB together) — wait for the user's decision, or withdraw one (vibespace-channels withdraw <proposalId>); nothing was created` };
}

/** A proposal's shape, validated. */
function validateProposal(input = {}) {
  const p = input && typeof input === 'object' ? input : {};
  const text = typeof p.text === 'string' ? p.text : '';
  if (!text.trim()) return { ok: false, error: 'text is required' };
  if (Buffer.byteLength(text, 'utf-8') > TEXT_MAX_BYTES) return { ok: false, error: `text is larger than ${TEXT_MAX_BYTES / 1024}KB` };
  const replyTo = p.replyTo === undefined || p.replyTo === null || !String(p.replyTo).trim() ? null : String(p.replyTo).trim().slice(0, 200);
  // O1: a message id never carries an invisible character — one that does is refused by name
  const hiddenReply = replyTo === null ? [] : hiddenCharsOf(replyTo, { joiners: true });
  if (hiddenReply.length) return { ok: false, error: `replyTo carries invisible characters (${hiddenReply.join(', ')}) — a message id never does`, why: 'replyTo' };
  let why = null;
  if (p.why && typeof p.why === 'object') {
    const kinds = ['record', 'alert', 'task', 'session', 'text'];
    const kind = kinds.includes(p.why.kind) ? p.why.kind : 'text';
    why = { kind, id: p.why.id === undefined || p.why.id === null ? null : String(p.why.id).slice(0, 200), label: String(p.why.label || '').slice(0, 300) || null };
  } else if (typeof p.why === 'string' && p.why.trim()) why = { kind: 'text', id: null, label: p.why.trim().slice(0, 300) };
  // design 005 §2.B (B-fd1f): an attachment carries its BYTES (`{name, data: <base64>}`, read by the agent's CLI) —
  // the bounds and the name rule refuse by name (`why`), before anything exists
  const att = attachmentsOf(p.attachments);
  if (!att.ok) return att;
  const attachments = att.list;
  // lane channel-threads (spec §5.2): a reply INTO a thread is a PROMISE the composer / the agent makes — it names
  // what it answers (a thread reply without a parent is refused by name, `why: 'inThread'`)
  if (p.inThread !== undefined && p.inThread !== null && p.inThread !== false && p.inThread !== true) return { ok: false, error: 'inThread must be true or false', why: 'inThread' };
  // THE PLACEMENT (2026-09-28): its SHAPE here (PL1, PL2 — no adapter needed); whether the adapter offers it is
  // `placementVerdict`, asked by the engine with the adapter's caps before the proposal exists. `inThread: true` is the
  // old spelling of `thread` (a READ ALIAS kept for stored proposals and older callers).
  const placement = p.placement === undefined || p.placement === null || p.placement === '' ? null : p.placement;
  if (placement !== null && !PLACEMENTS.includes(placement)) return { ok: false, error: `placement must be one of ${PLACEMENTS.join(' | ')}`, why: 'placement' };
  const alias = p.inThread === true && placement === null;
  if (p.inThread === true && placement !== null && !isThreadPlacement(placement)) return { ok: false, error: `inThread says a thread but placement says ${placement}`, why: 'placement' };
  const requested = alias ? 'thread' : placement;
  if (requested && requested !== 'chat' && !replyTo) return { ok: false, error: `a reply ${placementWords(requested)} names the message it answers (replyTo)`, why: alias ? 'inThread' : 'replyTo' };
  if (requested === 'chat' && replyTo) return { ok: false, error: 'a message in the chat answers no message — leave out replyTo, or place it as a quote or in the thread', why: 'placement' };
  const inThread = isThreadPlacement(requested);
  // B-a085 (mail): `replyAll` = everyone on the message it answers (resolved by the adapter at propose); `cc` = plain
  // addresses the drafter ADDS (the compose rule) — the engine refuses both by name where a reply's recipients do
  // not follow from the message it answers
  if (p.replyAll !== undefined && p.replyAll !== null && p.replyAll !== false && p.replyAll !== true) return { ok: false, error: 'replyAll must be true or false', why: 'replyAll' };
  const cc = addressesOf(p.cc);
  if (!cc.ok) return cc;
  if (cc.list.length > COMPOSE_MAX_RECIPIENTS) return { ok: false, error: `at most ${COMPOSE_MAX_RECIPIENTS} added Cc addresses`, why: 'recipients' };
  return { ok: true, proposal: { text, replyTo, why, attachments, ...(requested ? { placement: requested } : {}), ...(alias ? { placementAlias: true } : {}), ...(inThread ? { inThread: true } : {}), ...(p.replyAll === true ? { replyAll: true } : {}), ...(cc.list.length ? { cc: cc.list } : {}) } };
}
/** B-a085: a list of PLAIN addresses (an array, or one comma-separated string) — each refused by name when it hides
 *  a character or is no plain address (`why: 'address'`); lower-cased, duplicates dropped. */
function addressesOf(v) {
  const raw = (Array.isArray(v) ? v : String(v === undefined || v === null ? '' : v).split(',')).map((x) => String(x).trim()).filter(Boolean);
  for (const a of raw) {
    // O1: an address with a direction control / a zero-width character / a joiner reads as another one
    const h = hiddenCharsOf(a, { joiners: true });
    if (h.length) return { ok: false, error: `an address carries invisible characters (${h.join(', ')}) — it would read as another address`, why: 'address' };
    if (!ADDRESS_RE.test(a) || a.length > 254) return { ok: false, error: `not a plain address: ${JSON.stringify(a.slice(0, 80))}`, why: 'address' };
  }
  return { ok: true, list: [...new Set(raw.map((x) => x.toLowerCase()))] };
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
  const p = input && typeof input === 'object' ? input : {};
  // the reply's own `cc` / `replyAll` (B-a085) are not this verb's — its Cc is checked below, a reply-all refused
  const base = validateProposal({ ...p, cc: undefined, replyAll: undefined });
  if (!base.ok) return { ...base, why: 'text' };
  const list = (v) => (Array.isArray(v) ? v : String(v === undefined || v === null ? '' : v).split(',')).map((x) => String(x).trim()).filter(Boolean);
  // R4 verify r2: a field this verb does not carry is REFUSED BY NAME, never
  // silently dropped (an agent that asked for a Bcc would believe it was sent)
  if (p.bcc !== undefined && p.bcc !== null && String(Array.isArray(p.bcc) ? p.bcc.join(',') : p.bcc).trim()) return { ok: false, error: 'bcc is not supported — every recipient of a composed message is visible (To / Cc)', why: 'bcc' };
  if (p.replyTo !== undefined && p.replyTo !== null && String(p.replyTo).trim()) return { ok: false, error: 'a NEW message has nothing to reply to — use `reply` inside a conversation', why: 'replyTo' };
  if (p.replyAll === true) return { ok: false, error: 'a NEW message has nobody to reply to — use `reply --all` inside the conversation', why: 'replyAll' };
  const to = list(p.to), cc = list(p.cc);
  if (!to.length) return { ok: false, error: 'to is required (one or more addresses)', why: 'to' };
  if (to.length + cc.length > COMPOSE_MAX_RECIPIENTS) return { ok: false, error: `at most ${COMPOSE_MAX_RECIPIENTS} recipients (To + Cc)`, why: 'recipients' };
  // O1: an address with a direction control / a zero-width character / a joiner reads as another one (the ONE
  // address rule, `addressesOf` — a reply's added Cc is held to it too)
  const addr = addressesOf([...to, ...cc]);
  if (!addr.ok) return addr;
  const subject = String(p.subject === undefined || p.subject === null ? '' : p.subject).replace(/[\r\n\t]+/g, ' ').trim();
  if (!subject) return { ok: false, error: 'subject is required', why: 'subject' };
  const hiddenSubject = hiddenCharsOf(subject);
  if (hiddenSubject.length) return { ok: false, error: `the subject carries invisible characters that change how it reads (${hiddenSubject.join(', ')})`, why: 'subject' };
  return { ok: true, proposal: { ...base.proposal, replyTo: null, compose: { to: to.map((x) => x.toLowerCase()), cc: cc.map((x) => x.toLowerCase()), subject: subject.slice(0, COMPOSE_SUBJECT_MAX) } } };
}

/**
 * WHAT A REPLY ANSWERS (r6 verify F1, 2026-09-28). A Lark reply is POSTed to
 * `/messages/<replyTo>/reply` — a request that never names the chat — so a
 * proposal in conversation A carrying a message id of chat B posted into B
 * while the card showed A (and on a direct-policy A it went out with no card,
 * past B's own policy and reach). A reply may answer ONLY a message the
 * engine STORED for that very conversation: `record` is the engine's own
 * lookup in A's log (`store.findRecord(adapterId, convId, replyTo)`), and
 * this verdict is asked at propose AND again at approval / send. `code`
 * `reply-anchor` (the proposal is refused, nothing created).
 */
function replyAnchorVerdict({ replyTo = null, convId = null, record = null } = {}) {
  if (replyTo === null || replyTo === undefined || replyTo === '') return { ok: true, code: null, why: null };
  const id = JSON.stringify(String(replyTo).slice(0, 80));
  if (!record || typeof record !== 'object' || String(record.vendorId) !== String(replyTo)) return { ok: false, code: 'reply-anchor', why: `replyTo ${id} is not a message of this conversation — a reply may answer only a message of the conversation it is proposed in` };
  if (convId !== null && record.convId !== undefined && record.convId !== null && String(record.convId) !== String(convId)) return { ok: false, code: 'reply-anchor', why: `replyTo ${id} belongs to another conversation` };
  return { ok: true, code: null, why: null };
}
const ANCHOR_EXCERPT_MAX = 200;
/** The anchor as the CARD shows it ("In reply to <author>: <excerpt>") —
 *  what is stored on the proposal; the record itself stays in the log. */
function anchorView(record) {
  const r = record || {};
  const a = r.author || {};
  const text = String(r.text == null ? '' : r.text).replace(/\s+/g, ' ').trim();
  return {
    vendorId: String(r.vendorId || ''), at: Number(r.at) || null,
    author: { id: a.id == null ? null : String(a.id).slice(0, 200), name: a.name == null ? null : String(a.name).slice(0, 200), isSelf: !!a.isSelf },
    excerpt: text.length > ANCHOR_EXCERPT_MAX ? text.slice(0, ANCHOR_EXCERPT_MAX - 1) + '…' : text,
  };
}
/**
 * WHO A REPLY GOES TO, decided when it is PROPOSED (r6 verify F3). An adapter
 * whose reply's recipients follow from the message it answers (caps
 * `replyEnvelope`: Gmail — To = the anchor's Reply-To / From) used to decide
 * them at SEND time from the thread's newest message THEN — a message landing
 * after the owner looked re-targeted the approved reply. The adapter's answer
 * at propose is normalized here, stored on the proposal, SHOWN on the card
 * and handed back verbatim at send. Refused (never clipped — a clipped header
 * is another recipient list): no anchor id, a different anchor, no recipient,
 * a header past its bound, a CR/LF.
 */
const ENVELOPE_HEADER_MAX = 8000;
function envelopeVerdict(env, anchorId, { all = false } = {}) {
  const e = env && typeof env === 'object' ? env : null;
  if (!e) return { ok: false, why: 'the channel resolved no recipients for this reply' };
  const s = (v) => (v === undefined || v === null ? null : String(v));
  // B-a085: a reply-all says so (`all`, the adapter's echo) and the addresses the drafter ADDED (`added`) ride along
  const added = Array.isArray(e.added) ? e.added.slice(0, COMPOSE_MAX_RECIPIENTS).map((x) => String(x).slice(0, 254)) : [];
  const view = { anchorId: s(e.anchorId) || '', to: (s(e.to) || '').trim(), cc: s(e.cc) ? s(e.cc).trim() || null : null, subject: s(e.subject) || '', inReplyTo: s(e.inReplyTo), references: s(e.references), ...(e.all === true ? { all: true } : {}), ...(added.length ? { added } : {}) };
  if (!view.anchorId || String(view.anchorId) !== String(anchorId)) return { ok: false, why: 'the channel resolved the recipients of another message than the one this reply answers' };
  if (!view.to) return { ok: false, why: 'the message this reply answers names nobody to reply to' };
  if (all === true && view.all !== true) return { ok: false, why: 'the channel did not resolve everyone on the message this reply answers (reply-all)' };
  for (const k of ['to', 'cc', 'subject', 'inReplyTo', 'references']) {
    const v = view[k];
    if (v === null) continue;
    if (v.length > ENVELOPE_HEADER_MAX) return { ok: false, why: `the reply's ${k} is longer than ${ENVELOPE_HEADER_MAX} characters` };
    if (/[\r\n]/.test(v)) return { ok: false, why: `the reply's ${k} carries a line break` };
  }
  return { ok: true, why: null, envelope: view };
}

/** The addresses of a To / Cc header value, lower-cased (a quoted display name never counts — `"bob@x via G" <g@x>`
 *  is g@x alone). */
function envelopeAddresses(v) {
  const out = new Set();
  for (const part of String(v || '').replace(/"(?:[^"\\]|\\.)*"/g, '""').split(',')) {
    const m = /<([^<>]*)>/.exec(part);
    const a = (m ? m[1] : part).trim().toLowerCase();
    if (a.includes('@')) out.add(a);
  }
  return out;
}
/**
 * THE DRAFTER'S ADDED Cc (B-a085, `reply --cc`) merged into a reply's resolved envelope (PURE): an address already
 * among its To / Cc is not repeated; the ones really added are listed (`added`) so the card says who the DRAFTER put
 * on the mail beside the thread's own people. The reply stays a reply — same thread, same In-Reply-To / References.
 */
function withAddedCc(env, cc) {
  const list = Array.isArray(cc) ? cc.map((x) => String(x).trim().toLowerCase()).filter(Boolean) : [];
  if (!env || typeof env !== 'object' || !list.length) return env;
  const have = new Set([...envelopeAddresses(env.to), ...envelopeAddresses(env.cc)]);
  const added = [];
  for (const a of list) if (!have.has(a)) { have.add(a); added.push(a); }
  if (!added.length) return { ...env };
  return { ...env, cc: [env.cc, ...added].filter(Boolean).join(', '), added };
}

/**
 * WHAT THE CARD SHOWED (r6 verify F6). The Approve request carries `shown` =
 * this digest of the record the card was drawn from; the engine computes the
 * same digest of the proposal as it stands and refuses the approval
 * (`changed-since-shown`, nothing sent) when they differ — the owner approves
 * the text, the conversation, the answered message, the recipients, the
 * identity and the sender line he SAW, never a later one. The id is inside,
 * so a card never approves another proposal's words. PURE and bundled: the
 * card and the engine run THIS function over the same view shape
 * (`proposalView`). A change detector, not a MAC — content under one id is
 * immutable while it awaits; an agent's replacement is a NEW id (and the
 * arming delay below keeps it from sliding under the pointer).
 */
function shownFields(p) {
  const q = p || {};
  const s = (v) => (v === undefined || v === null ? null : String(v));
  const env = q.replyEnvelope && typeof q.replyEnvelope === 'object' ? q.replyEnvelope : null;
  const cp = q.compose && typeof q.compose === 'object' ? q.compose : null;
  const an = q.replyAnchor && typeof q.replyAnchor === 'object' ? q.replyAnchor : null;
  return [
    'v1', s(q.id), s(q.adapterId), s(q.convId), s(q.text),
    s(q.replyTo), an ? s(an.vendorId) : null,
    env ? [s(env.anchorId), s(env.to), s(env.cc), s(env.subject)] : null,
    cp ? [(Array.isArray(cp.to) ? cp.to : []).map(String), (Array.isArray(cp.cc) ? cp.cc : []).map(String), s(cp.subject)] : null,
    s(q.sendAs), s(q.honestyLine),
    // the .197 integration (pairing r6 × channel-threads): WHERE the reply lands (read through the alias) and a
    // REACTION's op / key / message decide what is sent too — the card shows both, so the digest covers both
    s(placementOf(q)), q.reaction && typeof q.reaction === 'object' ? [s(q.reaction.op), s(q.reaction.key), s(q.reaction.msg)] : null,
    // design 005 §2.B (B-fd1f): WHAT LEAVES WITH IT — each stored attachment's name, size and sha256, so a card approved
    // for other bytes is `changed-since-shown`; appended only when there are any (every other proposal keeps its digest)
    ...(storedAttachments(q).length ? [storedAttachments(q).map((a) => [s(a.name), Number(a.bytes) || 0, s(a.sha256)])] : []),
    // lane lark-upload-preflight: a card that WARNED "this account cannot send files" (its Approve = "Send without the file")
    // is not the card that showed them attached — the warning is part of what was shown (appended only when there is one)
    ...(q.filesBlocked && typeof q.filesBlocked === 'object' ? [['files-blocked', s(q.filesBlocked.why)]] : []),
  ];
}
/** FNV-1a 32 over the UTF-16 units, seeded (the plugin-manifest precedent). */
function fnv32(str, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
function shownDigest(p) {
  const canon = JSON.stringify(shownFields(p));
  return `v1:${fnv32(canon, 0x811c9dc5)}${fnv32(canon.split('').reverse().join(''), 0x9747b28c)}:${canon.length}`;
}

/**
 * THE ARMING DELAY (r6 verify F6): a card that just APPEARED or MOVED under
 * the pointer takes no decision for `ARM_MS` — a new or replacing proposal
 * inserted at the top used to land under the owner's pointer, armed, and his
 * next click approved a text he never saw. `armedAt` = the instant the card
 * may be decided; only a TRUSTED event (a person's pointer / key) is held — a
 * script's `.click()` is no pointer sliding onto a card.
 */
const ARM_MS = 700;
function armVerdict({ armedAt = 0, now = Date.now(), trusted = true } = {}) {
  const wait = Math.max(0, (Number(armedAt) || 0) - (Number(now) || 0));
  if (!trusted) return { armed: true, waitMs: 0 };
  return { armed: wait === 0, waitMs: wait };
}
/** Did a placement MOVE this card (or is it new here)? A card whose top
 *  shifted by more than a pixel is no longer where the pointer found it. */
function rearmVerdict({ isNew = false, prevTop = null, top = null } = {}) {
  if (isNew) return true;
  const known = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
  if (!known(prevTop) || !known(top)) return false;
  return Math.abs(Number(top) - Number(prevTop)) > 1;
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
function outcomeText(o, { t = defaultT, errorCodeText = (c) => String(c || ''), sendWhyText = (w) => String(w || '') } = {}) {
  if (!o || !o.kind) return '';
  const code = o.code ? errorCodeText(o.code, { t }) : '';
  switch (o.kind) {
    case 'boot': return t('Outcome unknown: the server stopped between the attempt and the answer.');
    case 'threw': return o.detail ? t('Outcome unknown: the channel threw while sending ({detail}).', { detail: o.detail }) : t('Outcome unknown: the channel threw while sending.');
    case 'lost': return o.detail ? t('Outcome unknown: the request left and the answer was lost ({detail}).', { detail: o.detail }) : t('Outcome unknown: the request left and the answer was lost.');
    case 'send-not-available': return t('Not sent: sending was not available at approval time ({detail}).', { detail: o.detail ? sendWhyText(o.detail, { t }) : '' });
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
  // lane channel-threads (spec §5.3): a reaction never earns a billed turn — its receipt rides the next one
  if (p.kind === 'reaction') return { deliver: 'next-turn', why: 'reaction' };
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
    // lane channel-threads: a REACTION's receipt names the emoji, the message and the op (its block is one line)
    ...(p.kind === 'reaction' && p.reaction ? { kind: 'reaction', reaction: { msg: p.reaction.msg, key: p.reaction.key, glyph: p.reaction.glyph || null, op: p.reaction.op } } : {}),
    // …and a REPLY names where it landed (2026-09-28: its PLACEMENT — a quote, a thread, a thread also shown in the
    // chat; `inThread` + the thread's key kept beside it as the alias older readers know)
    ...replyPlaceOf(p),
    // design 005 §2.B: the files it carried — name, size, sha256 (what the person approved)
    ...(storedAttachments(p).length ? { attachments: storedAttachments(p).map((a) => ({ name: a.name, bytes: Number(a.bytes) || 0, sha256: a.sha256 })) } : {}),
    // lane channel-send-files: per part, what landed and what did not (a send in parts; a refusal's parts too)
    ...(sendParts((p.result && p.result.parts) || (p.failure && p.failure.detail && p.failure.detail.parts)) ? { parts: sendParts((p.result && p.result.parts) || p.failure.detail.parts) } : {}),
  };
}

/** A reply's place on its receipt: `{placement}` for a quote / thread / thread+chat (+ `inThread` and the thread's key
 *  for the thread ones); nothing for a plain message, a composed one or a reaction. */
function replyPlaceOf(p) {
  const pl = placementOf(p);
  if (!pl || pl === 'chat') return {};
  return { placement: pl, ...(isThreadPlacement(pl) ? { inThread: true, threadKey: p.threadKey || null } : {}) };
}

/** THE WITHHELD RECEIPT (lane channel-threads verify r2, IDENTITY): one line — the proposal id (the drafter's own), its
 *  status in the receipt block's own words, `(a reaction)` for that kind, and why nothing more is said. The ONE speller
 *  for the ladder's block and the `status` view of a proposal whose conversation the drafter no longer sees. */
const WITHHELD_WORDS = Object.freeze({ sent: 'SENT', edited: 'SENT after the user edited it', rejected: 'REJECTED by the user', expired: 'EXPIRED unapproved (24 h)', failed: 'FAILED', withdrawn: 'WITHDRAWN by you (the drafting agent)' });
const ACCESS_REMOVED_NOTE = 'you no longer have access to that conversation, so nothing more from it is shown';
function withheldReceiptLine(r) {
  const x = r || {};
  const what = WITHHELD_WORDS[x.status] || String(x.status || 'decided').toUpperCase().slice(0, 40);
  return inertFrames(`Channel receipt — proposal ${safeInline(x.proposalId, 80)}: ${what}${x.kind === 'reaction' ? ' (a reaction)' : ''} — ${ACCESS_REMOVED_NOTE}`);
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
function renderReceiptBlock(receipt, { adapterLabel = null, title = null, text = null, proposed = null, maxBytes = RECEIPT_BLOCK_MAX_BYTES, withheld = false } = {}) {
  const r = receipt || {};
  // lane channel-threads verify r2 (IDENTITY): the drafter no longer has access to the conversation — its receipt says
  // the FATE of its own proposal and nothing the conversation produced (no title, no vendor message / thread id, no
  // reason's words, no text): `withheldReceiptLine`
  if (withheld) return withheldReceiptLine(r);
  // lane channel-threads (spec §5.3): a REACTION's receipt is ONE line — `reaction 👍 on om_x1: sent / rejected`
  if (r.kind === 'reaction' && r.reaction) {
    const x = r.reaction;
    const em = x.glyph ? safeInline(x.glyph, 16) : `:${safeInline(x.key, 64)}:`;
    const st = r.status === 'edited' ? 'sent' : String(r.status || '');
    const tail = r.reason && st !== 'sent' && r.reason !== REJECTED_DEFAULT_REASON ? ` (${safeInline(r.reason, 200)})` : '';
    return inertFrames(`Channel receipt — ${safeInline(adapterLabel || r.adapterId || 'channel', 60)} · ${safeInline(title || r.convId || '', 120)}\n${x.op === 'remove' ? 'removing reaction' : 'reaction'} ${em} on ${safeInline(x.msg, 200)}: ${st}${tail} (proposal ${safeInline(r.proposalId, 80)})`);
  }
  const lines = [];
  lines.push(`Channel receipt — ${safeInline(adapterLabel || r.adapterId || 'channel', 60)} · ${safeInline(title || r.convId || '', 120)}`.trim());
  const what = r.status === 'edited' ? 'SENT after the user edited it' : r.status === 'sent' ? 'SENT' : r.status === 'rejected' ? 'REJECTED by the user' : r.status === 'expired' ? 'EXPIRED unapproved (24 h)' : r.status === 'failed' ? 'FAILED' : r.status === 'withdrawn' ? `WITHDRAWN by you (the drafting agent)${r.replacedBy ? ` — replaced by proposal ${safeInline(r.replacedBy, 80)}` : ''}` : String(r.status || '').toUpperCase();
  lines.push(`proposal ${safeInline(r.proposalId, 80)}: ${what}${r.vendorMessageId ? ` (vendor id ${safeInline(r.vendorMessageId, 200)})` : ''}`);
  if (Array.isArray(r.attachments) && r.attachments.length) lines.push(`with ${r.attachments.length} attachment${r.attachments.length === 1 ? '' : 's'}: ${r.attachments.map((a) => `${safeInline(a.name, 120)} ${attachmentSize(a.bytes)} sha256 ${safeInline(String(a.sha256 || '').slice(0, 12), 12)}`).join(', ')}`);
  if (Array.isArray(r.parts) && r.parts.length) lines.push(`parts: ${inertFrames(partsWords(r.parts)).slice(0, 600)}`);
  // the PLACEMENT (a receipt from before the enum carries `inThread` only — read as `thread`)
  const pl = PLACEMENTS.includes(r.placement) ? r.placement : r.inThread ? 'thread' : null;
  if (pl && pl !== 'chat') lines.push(`placed ${placementWords(pl)}${isThreadPlacement(pl) && r.threadKey ? ` (thread ${safeInline(r.threadKey, 200)})` : ''}`);
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
  sentIdsOf,   // lane channel-reply-real
  sharedFilesOf, rekeyByFiles,   // lane slack-file-send-key
  OUTBOX_STATES, TRANSITIONS, TERMINAL_STATES, POLICY_MODES, DECISION_REASONS, RECEIPT_STATUSES, PROPOSAL_TTL_MS, TEXT_MAX_BYTES, HONESTY_LINE_DEFAULT, IDEMPOTENCY_MODES,
  WITHDRAWABLE_STATES, WITHDRAWN_DEFAULT_REASON, withdrawVerdict, withdrawWhy, withdrawReason,
  RECEIPT_DIFF_MAX, RECEIPT_BLOCK_MAX_BYTES, RECEIPT_GUIDANCE, receiptDiff, receiptFeedback, receiptFateOf, receiptFateText, RECEIPT_DELIVERIES, receiptDeliveryVerdict, utf8Bytes,
  canTransition, isTerminal, policyMode, policyModesOf, policyRowModel, policyWhereText, GUARD_KEYS, GUARD_REASONS, hasLinks, offHoursVerdict, decideOutbound, validateProposal, validateCompose, COMPOSE_MAX_RECIPIENTS, expiryVerdict, receiptFor, renderReceiptBlock,
  ACCESS_REMOVED_NOTE, withheldReceiptLine,
  REACTION_POLICIES, reactionPolicyOf, REACTION_OPS, validateReaction, reactionQuote, decideReaction,
  PLACEMENTS, THREAD_PLACEMENTS, ROOT_REPLIES, isThreadPlacement, placementsOf, rootReplyOf, placementOf, placementWords, placementVerdict, placementText, placementRefusalText,
  honestyLine, withHonestyLine, canReconcile, reconcileVerdict,
  REJECTED_DEFAULT_REASON, outcomeOf, outcomeText, reconcileWhyText,
  // r6 verify (2026-09-28): what you approve is what runs — the reply's anchor (F1), its recipients (F3),
  // the digest of the card (F6), the arming delay (F6), the characters that hide what a line says (O1)
  replyAnchorVerdict, anchorView, envelopeVerdict, ENVELOPE_HEADER_MAX, envelopeAddresses, withAddedCc, addressesOf, shownFields, shownDigest, ARM_MS, armVerdict, rearmVerdict,
  hiddenCharsOf, revealSegments,
  // design 005 §2.B (B-fd1f): an agent's attachments — bounds, the name rule, the sniffed type, the adapter's row
  ATTACH_MAX_COUNT, ATTACH_MAX_TOTAL, ATTACH_NAME_MAX, ATTACH_CODES, INLINE_RASTER, base64Bytes, safeAttachmentName, attachmentsOf, sniffType, nameTypeMismatch, composeFilesVerdict, sendParts, reconciledParts, partsWords, attachVerdict, storedAttachments, attachmentSize, ATTACH_HELD_MAX, attachHeldVerdict,
};
