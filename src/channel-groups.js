'use strict';
/**
 * AGENT GROUPS — the model (docs/design-communication-panel.zh.md §22, the
 * owner's rulings D1/D2 of 2026-09-22 + §22.5 membership).
 *
 * PURE: imports only src/channel-record.js (itself PURE) for the one door a
 * peer-controlled string goes through (`inertFrames`). No I/O, no clock, no
 * randomness — the engine (src/server/groups-engine.js) hands every instant
 * and every id in, so every rule below is a table a suite can drive.
 *
 * WHAT A GROUP IS (D1): a group exists only because somebody CREATED it —
 * `vibespace-msg group create`, the panel's "New group", or `send <agent>`,
 * which finds-or-creates the two-member group of those two (`pair`, keyed by
 * `pairKey`, so the same pair is always the same group). There is NO group per
 * Task Group (the owner's spam ruling). Members are keyed by CONVERSATION id
 * (a resume keeps the identity); the owner is an IMPLICIT member, never stored
 * — `OWNER` is how the owner is spelled as an actor.
 *
 * WHO IS WOKEN (D2): every (group, member) row carries `notify`:
 *   next-turn (DEFAULT) — new messages are batched into ONE report delivered as
 *                         context on that member's next USER-initiated turn:
 *                         zero billed turns, zero echo chamber;
 *   mention             — an @mention wakes it at once;
 *   always              — every message wakes it at once;
 *   mute                — nothing: no wake, no report (it may `read` on purpose).
 * An @mention is an explicit act: it wakes every mode but `mute`. An invite is
 * an explicit act toward the invitee and wakes it the same way unless the
 * inviter said `--quiet`. A WAKE IS A BILLED TURN — the engine sends it down
 * the delivery ladder, whose spend authorizer decides (reason `peer-message`);
 * a refused wake loses nothing, because the message is in the log and in the
 * member's next report. `wakeVerdict` is the whole table. Before the
 * authorizer, two more rules of this module (r2): the PACE (`paceVerdict` —
 * one wake per sender→member per 30 s, at most 8 per sender per minute) and
 * the CONSENT (`consentVerdict` — the count an act would wake, said before it:
 * an agent's over 5 needs `--yes`, the owner's panel echoes its preview).
 *
 * WHAT A MEMBER IS HANDED (`reportFor`): the messages after its JOIN (and
 * after its last report), its own invite context FIRST, newest kept under a
 * byte budget, with a pointer to `read <group> --before <ts>` when older ones
 * were clipped, and one to `read <group> --before <ts> --limit <n>` when a
 * shown line was CUT short (r2). Never the whole history — the 10 KiB injection wrap is shared
 * with everything else a turn carries. Every group name, member name and
 * message text is agent-controlled, so every one leaves here frame-inert.
 *
 * Every transition returns `{group, event}` (a NEW object; the input is never
 * mutated) or `{ok:false, code, error}` with `code` from the closed
 * `ERROR_CODES`.
 */
const { inertFrames } = require('./channel-record.js');

const NOTIFY_MODES = Object.freeze(['next-turn', 'mention', 'always', 'mute']);
const DEFAULT_NOTIFY = 'next-turn';
/** The owner as an ACTOR (`by`, `createdBy`, a message author id). Never a member row. */
const OWNER = 'user';
/** The adapter id the group LOG is filed under in the channel store. */
const GROUP_ADAPTER_ID = 'groups';
const ERROR_CODES = Object.freeze([
  'bad-request',      // a malformed call (no text, an unknown op)
  'bad-name',         // empty / too long after cleaning
  'bad-member',       // not a conversation id
  'too-few-members',  // a group needs two agents
  'too-many-members',
  'not-member',       // the actor may not act on this group
  'not-allowed',      // a member, but not the one who may do this (kick = creator/owner)
  'archived',
  'bad-notify',
  'pair-group',       // a two-member (direct) group takes no third member
  'self',             // an agent inviting/kicking itself
  'not-found',
  'unreachable',      // (engine) outside the actor's msg-acl reach — uniform with not-found
  'ambiguous',        // (engine) a name that matches more than one session / group — the answer carries `candidates`
  'job-token',        // (routes) a Background Work job token may list, read and post — never create a group or change membership
  'confirm-wakes',    // (consent) the act would wake more than WAKE_CONFIRM_ABOVE agents and the caller did not confirm (`--yes`) — the answer carries `wakes`
  'wake-count-mismatch', // (consent) the owner's panel previewed a different number of wakes than the act would cause — the answer carries `wakes`
]);
const NAME_MAX = 80;
const CONTEXT_MAX = 4000;
const MEMBER_MAX = 32;
const REPORT_BUDGET = 2048;
const LINE_MAX = 400;
/** An agent's act that would wake MORE than this many members at once is
 *  refused `confirm-wakes` until it says `--yes` — the count said BEFORE the
 *  act, the agent-side twin of the panel's "will wake N" echo (r2). */
const WAKE_CONFIRM_ABOVE = 5;
/** THE WAKE PACE (r2 — one rule for the agent routes AND the owner's routes
 *  when auth is off): one wake per (sender, member) per WAKE_FLOOR_MS, and at
 *  most SENDER_WAKES wakes per sender per SENDER_WINDOW_MS — so ONE command
 *  can never spend a credential slot's whole hour of unattended turns. A
 *  paced wake is a refusal like the authorizer's: not billed, the message is
 *  in the log and rides that member's next report. */
const WAKE_FLOOR_MS = 30000;
const SENDER_WAKES = 8;
const SENDER_WINDOW_MS = 60000;
/** A pace stamp more than this far AHEAD of the clock is not evidence of a
 *  wake that happened (r3): a backward clock step, or a ledger a clock-ahead
 *  boot wrote, would otherwise floor a pair for the size of the step (a
 *  planted far-future stamp: for ever). Dropped by `prunePace`, ignored by
 *  `paceVerdict`; `paceFuture` counts them so the engine can say so. */
const PACE_SKEW_MS = 5000;
const GROUP_ID_RE = /^g-[0-9a-f]{8}$/;
const CID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function err(code, error) {
  if (!ERROR_CODES.includes(code)) throw new Error(`channel-groups: undeclared error code ${code}`);
  return { ok: false, code, error };
}
const isCid = (c) => typeof c === 'string' && CID_RE.test(c) && c !== OWNER;
const isGroupId = (v) => typeof v === 'string' && GROUP_ID_RE.test(v);

/** `g-<8 hex>` from 8 hex chars the caller drew (the module owns no randomness). */
function newGroupId(hex8) {
  const h = String(hex8 || '').toLowerCase();
  if (!/^[0-9a-f]{8}$/.test(h)) throw new Error('channel-groups: newGroupId wants exactly 8 hex chars');
  return 'g-' + h;
}

/** The canonical key of a two-member group — symmetric by construction. */
function pairKey(a, b) {
  const x = [String(a || ''), String(b || '')].sort();
  return x[0] + '|' + x[1];
}

/** One line, bounded, frame-inert. '' when nothing is left. */
function cleanName(name, max = NAME_MAX) {
  const s = inertFrames(String(name == null ? '' : name).replace(/\s+/g, ' ').trim());
  return s.length > max ? s.slice(0, max).trim() : s;
}
function cleanText(text, max = CONTEXT_MAX) {
  const s = inertFrames(String(text == null ? '' : text)).trim();
  return s.length > max ? s.slice(0, max) : s;
}

const memberOf = (group, cid) => (group && Array.isArray(group.members) ? group.members.find((m) => m.member === cid) || null : null);
const canAct = (group, by) => by === OWNER || !!memberOf(group, by);
const clone = (g) => JSON.parse(JSON.stringify(g));

/** The stored shape, checked. `{ok:true}` or a typed error naming the field. */
function validateGroup(g) {
  if (!g || typeof g !== 'object') return err('bad-request', 'a group is an object');
  if (!isGroupId(g.id)) return err('bad-request', `bad group id ${JSON.stringify(g.id)}`);
  if (typeof g.name !== 'string' || !g.name || g.name.length > NAME_MAX) return err('bad-name', 'a group name is 1–80 characters');
  if (typeof g.createdBy !== 'string' || !(g.createdBy === OWNER || isCid(g.createdBy))) return err('bad-request', 'createdBy is the owner or a conversation id');
  if (!Number.isFinite(g.createdAt) || g.createdAt <= 0) return err('bad-request', 'createdAt is an epoch ms');
  if (!Array.isArray(g.members) || g.members.length > MEMBER_MAX) return err('too-many-members', `a group holds at most ${MEMBER_MAX} members`);
  const seen = new Set();
  for (const m of g.members) {
    if (!m || !isCid(m.member)) return err('bad-member', `bad member ${JSON.stringify(m && m.member)}`);
    if (seen.has(m.member)) return err('bad-member', `member ${m.member} listed twice`);
    seen.add(m.member);
    if (!Number.isFinite(m.joinedAt) || m.joinedAt <= 0) return err('bad-request', `member ${m.member}: joinedAt is an epoch ms`);
    if (!(m.invitedBy === null || m.invitedBy === OWNER || isCid(m.invitedBy))) return err('bad-request', `member ${m.member}: invitedBy`);
    if (!NOTIFY_MODES.includes(m.notify)) return err('bad-notify', `member ${m.member}: notify must be one of ${NOTIFY_MODES.join('|')}`);
    if (!(m.reportedUpTo === null || m.reportedUpTo === undefined || Number.isFinite(m.reportedUpTo))) return err('bad-request', `member ${m.member}: reportedUpTo`);
  }
  if (g.pair !== null && g.pair !== undefined) {
    if (!Array.isArray(g.pair) || g.pair.length !== 2 || g.pair[0] >= g.pair[1]) return err('bad-request', 'pair is two sorted, distinct conversation ids');
    if (!g.archivedAt && !g.pair.every((c) => seen.has(c))) return err('bad-request', 'a live pair group holds exactly its two members');
  }
  if (!(g.archivedAt === null || g.archivedAt === undefined || Number.isFinite(g.archivedAt))) return err('bad-request', 'archivedAt is null or an epoch ms');
  return { ok: true };
}

function memberRow(cid, { at, invitedBy, notify = DEFAULT_NOTIFY, name = null }) {
  return { member: cid, name: name ? cleanName(name) || null : null, joinedAt: at, invitedBy: invitedBy || null, notify, reportedUpTo: null };
}

/**
 * Build a NEW group. An agent creator is a member automatically; the owner is
 * implicit. Every group starts with at least TWO agents (§22: "all groups have
 * at least two members" — two agents, the owner watching). `pair: true` marks
 * the direct two-member group `send <agent>` finds by `pairKey`.
 */
function makeGroup({ id, name, createdBy, at, members = [], names = {}, pair = false, notify = {} } = {}) {
  if (!isGroupId(id)) return err('bad-request', 'makeGroup needs a group id (newGroupId)');
  if (!(createdBy === OWNER || isCid(createdBy))) return err('bad-member', 'the creator is the owner or a conversation id');
  if (!Number.isFinite(at) || at <= 0) return err('bad-request', 'makeGroup needs an instant');
  const list = [];
  const add = (cid, invitedBy) => { if (!list.some((m) => m.member === cid)) list.push(memberRow(cid, { at, invitedBy, notify: NOTIFY_MODES.includes(notify[cid]) ? notify[cid] : DEFAULT_NOTIFY, name: names[cid] })); };
  if (createdBy !== OWNER) add(createdBy, null);
  for (const c of members) {
    if (!isCid(c)) return err('bad-member', `not a conversation id: ${JSON.stringify(c)}`);
    if (c === createdBy) continue;           // the creator is already in — naming yourself is not an error
    add(c, createdBy);
  }
  if (list.length < 2) return err('too-few-members', createdBy === OWNER ? 'a group needs at least two agents' : 'name at least one other agent');
  if (list.length > MEMBER_MAX) return err('too-many-members', `a group holds at most ${MEMBER_MAX} members`);
  if (pair && list.length !== 2) return err('bad-request', 'a pair group has exactly two members');
  const nm = cleanName(name) || (pair ? list.map((m) => m.name || m.member.slice(0, 8)).join(' · ') : '');
  if (!nm) return err('bad-name', 'a group needs a name');
  const group = {
    id, name: nm, createdBy, createdAt: at,
    pair: pair ? list.map((m) => m.member).sort() : null,
    members: list, archivedAt: null, lastAt: at, lastText: '',
  };
  const v = validateGroup(group);
  if (!v.ok) return v;
  return { group, event: { kind: 'create', by: createdBy, members: list.map((m) => m.member) } };
}

/** Invite one member. Only a member (or the owner) invites; a duplicate is a
 *  NO-OP that says so (`noop:'already-member'`), never an error. */
function addMember(group, { member, by, at, name = null } = {}) {
  if (!group) return err('not-found', 'no such group');
  if (group.archivedAt) return err('archived', `group "${group.name}" is archived`);
  if (!canAct(group, by)) return err('not-member', 'only a member of this group can invite');
  if (!isCid(member)) return err('bad-member', `not a conversation id: ${JSON.stringify(member)}`);
  if (memberOf(group, member)) return { group, event: null, noop: 'already-member' };
  if (group.pair) return err('pair-group', 'a two-member group is a direct conversation — create a group to add people');
  if (group.members.length >= MEMBER_MAX) return err('too-many-members', `a group holds at most ${MEMBER_MAX} members`);
  const g = clone(group);
  g.members.push(memberRow(member, { at, invitedBy: by, name }));
  return { group: g, event: { kind: 'join', member, by } };
}

/**
 * Leave (`by === member`) or kick (`kick: true` — the creator or the owner, and
 * never yourself). A PAIR that drops to one member is ARCHIVED (the direct
 * conversation is over; the log stays); a group with no agent left is too.
 */
function removeMember(group, { member, by, at, kick = false } = {}) {
  if (!group) return err('not-found', 'no such group');
  if (group.archivedAt) return err('archived', `group "${group.name}" is archived`);
  if (!memberOf(group, member)) return err('not-member', `${member} is not a member of "${group.name}"`);
  if (kick) {
    if (by === member) return err('self', 'to leave a group use leave, not kick');
    if (!(by === OWNER || by === group.createdBy)) return err('not-allowed', 'only the creator of a group (or the user) can remove a member');
  } else if (by !== member && by !== OWNER) {
    return err('not-allowed', 'a member can only remove itself (kick is the creator\'s)');
  }
  const g = clone(group);
  g.members = g.members.filter((m) => m.member !== member);
  const archived = !!(g.pair || g.members.length === 0);
  if (archived) g.archivedAt = at;
  return { group: g, event: { kind: kick ? 'kick' : 'leave', member, by, archived } };
}

/** A member sets its OWN mode; the owner may set anyone's. */
function setNotify(group, { member, notify, by } = {}) {
  if (!group) return err('not-found', 'no such group');
  if (!NOTIFY_MODES.includes(notify)) return err('bad-notify', `notify must be one of ${NOTIFY_MODES.join(' | ')}`);
  if (!memberOf(group, member)) return err('not-member', `${member} is not a member of "${group.name}"`);
  if (!(by === member || by === OWNER)) return err('not-allowed', 'a member sets only its own notify mode (the user can set anyone\'s)');
  const g = clone(group);
  const m = memberOf(g, member);
  if (m.notify === notify) return { group, event: null, noop: 'unchanged' };
  m.notify = notify;
  return { group: g, event: { kind: 'notify', member, notify, by } };
}

function rename(group, { name, by } = {}) {
  if (!group) return err('not-found', 'no such group');
  if (group.archivedAt) return err('archived', `group "${group.name}" is archived`);
  if (!canAct(group, by)) return err('not-member', 'only a member of this group can rename it');
  const nm = cleanName(name);
  if (!nm) return err('bad-name', 'a group needs a name (1–80 characters)');
  if (nm === group.name) return { group, event: null, noop: 'unchanged' };
  const g = clone(group);
  const from = g.name;
  g.name = nm;
  return { group: g, event: { kind: 'rename', from, to: nm, by } };
}

/** Archive keeps the log (archive-never-destroy). Creator or owner. */
function archive(group, { by, at } = {}) {
  if (!group) return err('not-found', 'no such group');
  if (!(by === OWNER || by === group.createdBy)) return err('not-allowed', 'only the creator of a group (or the user) can archive it');
  if (group.archivedAt) return { group, event: null, noop: 'already-archived' };
  const g = clone(group);
  g.archivedAt = at;
  return { group: g, event: { kind: 'archive', by } };
}

/** A letter of a script written WITHOUT spaces between words (Han, kana,
 *  Hangul, CJK punctuation / full-width forms): where one begins or ends, a
 *  word has — "@测试请看" mentions 测试, "@beta请看" mentions beta. */
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u3000-\u303F\uFF00-\uFFEF]/u;
const lastChar = (s) => { const a = Array.from(String(s)); return a.length ? a[a.length - 1] : ''; };

/**
 * Who a message @mentions: `@<conversation id>` exactly, or `@<member name>`
 * case-insensitively, ending at whitespace / punctuation / end of text — or
 * at a SCRIPT boundary: the next character is from an unspaced script (CJK /
 * kana / Hangul), or the name itself ends in one (then whatever follows is a
 * new word). A Latin name followed by a Latin letter is nobody ("@ceex").
 * The longest name is tried first so "@api" never steals "@api lane".
 * @param members [{member, name}]
 * @returns [{id, name}] — each member at most once
 */
function mentionsIn(text, members) {
  const t = String(text || '');
  if (!t.includes('@')) return [];
  const out = [];
  const found = new Set();
  const cands = [];
  for (const m of members || []) {
    if (!m || !m.member) continue;
    cands.push({ key: m.member, id: m.member, name: m.name || null });
    if (m.name) cands.push({ key: String(m.name), id: m.member, name: m.name });
  }
  cands.sort((a, b) => b.key.length - a.key.length);
  const lower = t.toLowerCase();
  const taken = [];   // [start, end) spans a longer name already claimed — "@api lane" is never ALSO "@api"
  const inTaken = (i) => taken.some(([s, e]) => i >= s && i < e);
  for (const c of cands) {
    if (found.has(c.id)) continue;
    const needle = '@' + c.key.toLowerCase();
    const nameUnspaced = UNSPACED.test(lastChar(c.key));
    let i = lower.indexOf(needle);
    while (i >= 0) {
      const prev = i > 0 ? lower[i - 1] : '';
      const next = lower[i + needle.length];
      const startsOk = !prev || !/[a-z0-9_.+-]/.test(prev);   // x@api.com is an address, not a mention
      const endsOk = next === undefined || /[\s.,;:!?)\]}'"]/.test(next) || nameUnspaced || UNSPACED.test(String.fromCodePoint(lower.codePointAt(i + needle.length)));
      if (startsOk && endsOk && !inTaken(i)) { found.add(c.id); out.push({ id: c.id, name: c.name || c.id }); taken.push([i, i + needle.length]); break; }
      i = lower.indexOf(needle, i + 1);
    }
  }
  return out;
}

/**
 * Does this message wake this member NOW? The whole D2 table:
 *   the author itself / not a member / mute  → no
 *   the member's OWN invite record           → yes, unless the invite was quiet
 *   any other system record                  → no (it rides the next report)
 *   an @mention of the member                → yes (every mode but mute)
 *   notify always                            → yes
 *   notify next-turn / mention (unnamed)     → no
 * `why` names the rule, for the wake's lead line and the journal.
 */
function wakeVerdict(group, member, msg) {
  const m = memberOf(group, member);
  if (!m) return { wake: false, why: 'not-member' };
  if (!msg) return { wake: false, why: 'no-message' };
  if (msg.author && msg.author.id === member) return { wake: false, why: 'own-message' };
  if (m.notify === 'mute') return { wake: false, why: 'mute' };
  const raw = msg.raw || {};
  const sys = raw.kind && raw.kind !== 'message';
  if (sys) {
    if (raw.kind === 'invite' && raw.member === member) return raw.wake === false ? { wake: false, why: 'quiet-invite' } : { wake: true, why: 'invite' };
    return { wake: false, why: 'system' };
  }
  if ((msg.mentions || []).some((x) => x && x.id === member)) return { wake: true, why: 'mention' };
  if (m.notify === 'always') return { wake: true, why: 'always' };
  return { wake: false, why: m.notify };
}

/** How many of `candidates` this record would wake NOW (wakeVerdict per
 *  member) — the number the consent is asked about BEFORE the act. */
function wakesPlanned(group, rec, candidates) {
  let n = 0;
  for (const m of candidates || []) if (wakeVerdict(group, m, rec).wake) n++;
  return n;
}

/**
 * CONSENT to the wakes an act would cause, asked BEFORE anything is written.
 *   `expect` (the owner's panel) — the count it previewed; any other number is
 *            `wake-count-mismatch` (the group changed under the preview, or
 *            the caller never saw one). A missing echo is an echo of 0.
 *   `yes`    (an agent) — more than `above` wakes need `--yes`: `confirm-wakes`.
 * Both refusals carry `wakes`, the number the act WOULD have caused.
 */
function consentVerdict(n, { expect, yes = false, above = WAKE_CONFIRM_ABOVE } = {}) {
  const wakes = Number(n) || 0;
  if (expect !== undefined) {
    const e = Number.isInteger(expect) ? expect : 0;
    if (wakes === e) return { ok: true };
    return { ...err('wake-count-mismatch', `this would wake ${wakes} agent(s) = ${wakes} billed turn(s), but the request confirmed ${e} — the group changed since the preview; review and send again`), wakes };
  }
  if (wakes > above && !yes) return { ...err('confirm-wakes', `this would wake ${wakes} agents now = ${wakes} billed turns — repeat with --yes to confirm, or leave out --wake / add --quiet (without a wake they read it on their next turn, free)`), wakes };
  return { ok: true };
}

/** The pace ledger's empty shape: `pairs` {"sender|member": at of the last
 *  granted wake}, `senders` {sender: [at…] inside the window}. */
const emptyPace = () => ({ v: 1, pairs: {}, senders: {} });
function paceState(state) {
  const s = state && typeof state === 'object' ? state : {};
  return { v: 1, pairs: s.pairs && typeof s.pairs === 'object' ? s.pairs : {}, senders: s.senders && typeof s.senders === 'object' ? s.senders : {} };
}
/** A stamp a rule may read at `at`: finite, inside `win`, and not in the
 *  future beyond PACE_SKEW_MS (r3 — a future stamp is not a wake). */
const liveStamp = (v, at, win) => Number.isFinite(v) && v <= at + PACE_SKEW_MS && at - v < win;
/** A NEW state without the stamps no rule can still read at `at` — the
 *  expired ones AND the future ones (r3). */
function prunePace(state, at) {
  const s = paceState(state);
  const out = emptyPace();
  for (const [k, v] of Object.entries(s.pairs)) if (liveStamp(v, at, WAKE_FLOOR_MS)) out.pairs[k] = v;
  for (const [k, list] of Object.entries(s.senders)) {
    const keep = (Array.isArray(list) ? list : []).filter((v) => liveStamp(v, at, SENDER_WINDOW_MS));
    if (keep.length) out.senders[k] = keep;
  }
  return out;
}
/** How many stamps in `state` lie in the future beyond PACE_SKEW_MS at `at`
 *  (r3): the engine logs the count once, as `prunePace` drops them — a
 *  clock step is visible, never a silent floor. */
function paceFuture(state, at) {
  const s = paceState(state);
  let n = 0;
  for (const v of Object.values(s.pairs)) if (Number.isFinite(v) && v > at + PACE_SKEW_MS) n++;
  for (const list of Object.values(s.senders)) for (const v of Array.isArray(list) ? list : []) if (Number.isFinite(v) && v > at + PACE_SKEW_MS) n++;
  return n;
}
/** May `sender` wake `member` at `at`? → {ok:true} | {ok:false, why, reason}. */
function paceVerdict(state, { sender, member, at }) {
  const s = paceState(state);
  const last = Number(s.pairs[sender + '|' + member]);
  if (liveStamp(last, at, WAKE_FLOOR_MS)) return { ok: false, why: 'pair', reason: 'rate floor: one wake per target per 30s (a wake is a billed turn) — it reaches them on their next turn instead' };
  const recent = (Array.isArray(s.senders[sender]) ? s.senders[sender] : []).filter((v) => liveStamp(v, at, SENDER_WINDOW_MS));
  if (recent.length >= SENDER_WAKES) return { ok: false, why: 'sender', reason: `rate floor: at most ${SENDER_WAKES} wakes per sender per minute (each is a billed turn) — it reaches them on their next turn instead` };
  return { ok: true };
}
/** Grant: a NEW state with the stamp, and the token that refunds it. */
function paceGrant(state, { sender, member, at }) {
  const s = paceState(state);
  const k = sender + '|' + member;
  const next = { v: 1, pairs: { ...s.pairs, [k]: at }, senders: { ...s.senders, [sender]: [...(Array.isArray(s.senders[sender]) ? s.senders[sender] : []), at] } };
  return { state: next, token: { k, sender, prev: Object.prototype.hasOwnProperty.call(s.pairs, k) ? s.pairs[k] : null, at } };
}
/** Refund a grant whose wake did not go out (refused by the authorizer, the
 *  lane failed): the PAIR stamp goes back to what it was, so a refusal never
 *  floors the next legitimate wake of that target. The sender's per-minute
 *  count KEEPS the attempt when `keepSender` (r3 — the engine's pacer always
 *  passes it): a refused attempt was still an attempt, so a sender at the
 *  spend ceiling reaches the authorizer at most SENDER_WAKES times a minute
 *  instead of in an unbounded loop. A NEW state. */
function paceRefund(state, token, { keepSender = false } = {}) {
  const s = paceState(state);
  if (!token) return s;
  const pairs = { ...s.pairs };
  if (pairs[token.k] === token.at) { if (token.prev === null || token.prev === undefined) delete pairs[token.k]; else pairs[token.k] = token.prev; }
  const senders = { ...s.senders };
  if (keepSender) return { v: 1, pairs, senders };
  const list = Array.isArray(senders[token.sender]) ? senders[token.sender].slice() : [];
  const i = list.lastIndexOf(token.at);
  if (i >= 0) list.splice(i, 1);
  if (list.length) senders[token.sender] = list; else delete senders[token.sender];
  return { v: 1, pairs, senders };
}

const stamp = (at) => new Date(Number(at) || 0).toISOString().slice(5, 16) + 'Z';
const clipLine = (s, max = LINE_MAX) => { const v = String(s || '').replace(/\s+/g, ' ').trim(); return v.length > max ? v.slice(0, max - 1) + '…' : v; };
// TextEncoder, never Buffer: this module is PURE and may ride the browser bundle.
const ENC = new TextEncoder();
const bytes = (s) => ENC.encode(String(s)).length;
function clipBytes(s, max) {
  const v = String(s);
  if (bytes(v) <= max) return v;
  let lo = 0, hi = v.length;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (bytes(v.slice(0, mid)) + 3 <= max) lo = mid; else hi = mid - 1; }
  let cut = v.slice(0, lo);
  if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1);   // never split a surrogate pair
  return cut + '…';
}

/** One log record as one report line (agent-facing English, frame-inert). */
function lineFor(r) {
  const who = inertFrames((r.author && (r.author.name || r.author.id)) || 'unknown');
  const raw = r.raw || {};
  const k = raw.kind || 'message';
  const body = inertFrames(clipLine(r.text));
  if (k === 'message') return `- [${stamp(r.at)}] ${who}: ${body}`;
  return `- [${stamp(r.at)}] (${k}) ${body}`;
}

/**
 * The next-turn REPORT for one member: the records after `since` (default: its
 * `reportedUpTo`, never before its join), minus its own, its invite context
 * FIRST, newest kept under `budget` bytes. `null` when there is nothing new, or
 * the member is muted / not a member.
 *
 * THE BUDGET IS THE WHOLE TEXT — head, lead, context, the `read --before`
 * pointer and the reply foot included (2026-09-23 verifier: an 80-CJK-char
 * group name made a 320 B report 534 B). Three forms are tried, fullest
 * first — full · compact (short foot, the name clipped) · tight (the name
 * clipped hard, short pointer) — and the first that fits AND shows a message
 * wins (tight fits with no message shown: the pointer still accounts for
 * them). When not even the tight form fits, the answer is `fits:false` with
 * an EMPTY text and `upTo: null` — distinct from `null` ("nothing new"), so a
 * caller leaves the member's marker where it is and the group waits.
 * @returns {{text, upTo, count, shown, clipped, context:boolean, fits:boolean}|null}
 *   `upTo` = the newest instant this report ACCOUNTS for (the clipped ones are
 *   accounted for by the `read --before` pointer), the value the engine stamps.
 */
function reportFor(group, log, member, { since = null, budget = REPORT_BUDGET, lead = null } = {}) {
  const m = memberOf(group, member);
  if (!m || m.notify === 'mute') return null;
  const floor = m.joinedAt - 1;
  const mark = since !== null && since !== undefined ? since : (Number.isFinite(m.reportedUpTo) ? m.reportedUpTo : floor);
  const after = Math.max(Number(mark) || 0, floor);
  const recs = (Array.isArray(log) ? log : []).filter((r) => r && Number(r.at) > after && !(r.author && r.author.id === member))
    .sort((a, b) => (a.at - b.at) || String(a.vendorId).localeCompare(String(b.vendorId)));
  if (!recs.length) return null;
  const invite = recs.find((r) => r.raw && r.raw.kind === 'invite' && r.raw.member === member) || null;
  const rest = recs.filter((r) => r !== invite);
  for (const form of REPORT_FORMS) {
    const r = buildReport(group, m, recs, invite, rest, Number(budget) || 0, lead, form, log);
    if (r && (r.shown > 0 || !rest.length || form === REPORT_FORMS[REPORT_FORMS.length - 1])) return r;
  }
  return { text: '', upTo: null, count: recs.length, shown: 0, clipped: rest.length, context: !!invite, fits: false };
}
/** The three report forms, fullest first (see reportFor). Byte caps are on
 *  the agent-controlled parts: the group name, the inviter + context line,
 *  the lead line. */
const REPORT_FORMS = Object.freeze([
  Object.freeze({ name: Infinity, ctx: null, lead: Infinity, foot: 'full', pointer: 'full', head: 'full' }),
  Object.freeze({ name: 90, ctx: 90, lead: 80, foot: 'short', pointer: 'full', head: 'full' }),
  Object.freeze({ name: 36, ctx: 56, lead: 48, foot: 'min', pointer: 'short', head: 'short' }),
]);
/** Would lineFor cut this record's text at LINE_MAX? */
const cutAtLine = (r) => String((r && r.text) || '').replace(/\s+/g, ' ').trim().length > LINE_MAX;
function buildReport(group, m, recs, invite, rest, budget, lead, form, log) {
  const id = group.id;
  const gname = form.name === Infinity ? inertFrames(group.name) : clipBytes(inertFrames(group.name), form.name);
  const head = form.head === 'full' ? `#### Group "${gname}" (${id}) — ${recs.length} new since your last report` : `#### Group "${gname}" (${id}) — ${recs.length} new`;
  const foot = form.foot === 'full'
    ? `Reply: vibespace-msg send ${id} "..." — your notify mode here is ${m.notify} (vibespace-msg group notify ${id} <next-turn|mention|always|mute>)`
    : form.foot === 'short' ? `Reply: vibespace-msg send ${id} "..." (your notify: ${m.notify})` : `Reply: vibespace-msg send ${id} "..."`;
  const pointer = (n, ts) => (form.pointer === 'full' ? `(${n} earlier message(s) not shown — vibespace-msg read ${id} --before ${ts})` : `(${n} earlier — vibespace-msg read ${id} --before ${ts})`);
  // A LINE CUT SHORT (its LINE_MAX, or the room left for the newest) is
  // POINTED to (r2): the span of cut records, `--before <newest cut + 1>
  // --limit <log records in the span>` — the member's own included, since
  // `read` returns the log as it is. Budgeted up front at its widest.
  const cutPointer = (n, hiAt, cnt) => (form.pointer === 'full'
    ? `(${n} message(s) above cut short — the whole text: vibespace-msg read ${id} --before ${hiAt + 1} --limit ${cnt})`
    : `(${n} cut — vibespace-msg read ${id} --before ${hiAt + 1} --limit ${cnt})`);
  const CUT_RESERVE = bytes(cutPointer(9999, 9999999999999, 9999)) + 1;
  const leadLine = lead ? (form.lead === Infinity ? String(lead) : clipBytes(String(lead), form.lead)) : null;
  let used = bytes(head) + bytes(foot) + 2 + (leadLine ? bytes(leadLine) + 1 : 0);
  // the pointer is budgeted up front (widest form) whenever it COULD appear
  if (rest.length) used += bytes(pointer(rest.length, 9999999999999)) + 1;
  let ctxLine = null;
  if (invite) {
    const by = clipBytes(inertFrames((invite.author && (invite.author.name || invite.author.id)) || 'someone'), 60);
    const ctx = inertFrames(String(invite.raw.context || '').trim());
    ctxLine = ctx ? `You were added by ${by} — context: ${ctx.replace(/\s+/g, ' ')}` : `You were added by ${by}.`;
    ctxLine = clipBytes(ctxLine, form.ctx === null ? Math.max(160, Math.floor(budget / 3)) : form.ctx);
    used += bytes(ctxLine) + 1;
  }
  let cutReserved = false;
  if (rest.some(cutAtLine)) { used += CUT_RESERVE; cutReserved = true; }
  // newest first, the newest always shows (clipped to the room) when there is room for it
  const lines = [];
  const cut = [];
  let shown = 0;
  for (let i = rest.length - 1; i >= 0; i--) {
    let l = lineFor(rest[i]);
    let isCut = cutAtLine(rest[i]);
    let room = budget - used - 1;
    if (bytes(l) > room) {
      if (shown !== 0) break;
      if (!cutReserved) { used += CUT_RESERVE; cutReserved = true; room = budget - used - 1; }
      if (room <= 60) break;
      l = clipBytes(l, room);
      isCut = true;
    }
    lines.unshift(l);
    if (isCut) cut.push(rest[i]);
    used += bytes(l) + 1;
    shown++;
  }
  let cutLine = null;
  if (cut.length) {
    const lo = Math.min(...cut.map((r) => Number(r.at))), hi = Math.max(...cut.map((r) => Number(r.at)));
    const span = (Array.isArray(log) ? log : []).filter((r) => r && Number(r.at) >= lo && Number(r.at) <= hi).length || cut.length;
    cutLine = cutPointer(cut.length, hi, span);
  }
  const clipped = rest.length - shown;
  const oldestShown = shown ? rest[rest.length - shown].at : (invite ? invite.at : recs[recs.length - 1].at);
  const out = [];
  if (leadLine) out.push(leadLine);
  out.push(head);
  if (ctxLine) out.push(ctxLine);
  if (clipped > 0) out.push(pointer(clipped, oldestShown));
  out.push(...lines);
  if (cutLine) out.push(cutLine);
  out.push(foot);
  const text = out.join('\n');
  if (bytes(text) > budget) return null;
  return { text, upTo: recs[recs.length - 1].at, count: recs.length, shown, clipped, context: !!invite, fits: true };
}

module.exports = {
  NOTIFY_MODES, DEFAULT_NOTIFY, OWNER, GROUP_ADAPTER_ID, ERROR_CODES, NAME_MAX, CONTEXT_MAX, MEMBER_MAX, REPORT_BUDGET, LINE_MAX,
  WAKE_CONFIRM_ABOVE, WAKE_FLOOR_MS, SENDER_WAKES, SENDER_WINDOW_MS, PACE_SKEW_MS,
  newGroupId, pairKey, cleanName, cleanText, isCid, isGroupId, memberOf, validateGroup, makeGroup,
  addMember, removeMember, setNotify, rename, archive, mentionsIn, wakeVerdict, wakesPlanned, consentVerdict, reportFor,
  emptyPace, prunePace, paceFuture, paceVerdict, paceGrant, paceRefund,
};
