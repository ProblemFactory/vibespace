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
 *   mention             — ONLY a message that @mentions it (by id) reaches it: it
 *                         is woken at once and its report holds only those; the
 *                         rest is never queued for it (B-a354, the owner's
 *                         "at-style group" — `read` shows the log on purpose);
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
 * WHERE A RECORD STANDS (`deliveryOf`, lane group-pending 2026-10-01): one row
 * per recipient — waiting / handed / muted / left — read off the member's
 * marker, its notify mode and the log's departures; the window's line under
 * every message and the CLI's trailing clause are both this one rule.
 *
 * Every transition returns `{group, event}` (a NEW object; the input is never
 * mutated) or `{ok:false, code, error}` with `code` from the closed
 * `ERROR_CODES`.
 */
const { inertFrames } = require('./channel-record.js');
// lane peer-census (2026-09-29): every line and every inline piece of a REPORT takes THE belt (src/peer-text.js) —
// the line rule included: a message ending in a dangling `<system-reminder` used to be completed by the NEXT report
// line when that member's words began with `>` (a quote) — a live frame in the receiver's next turn.
const { toAgentText } = require('./peer-text.js');
const piece = (s, max = Infinity) => toAgentText(s, { kind: 'line', max });

const NOTIFY_MODES = Object.freeze(['next-turn', 'mention', 'always', 'mute']);
const DEFAULT_NOTIFY = 'next-turn';
/** WHERE A RECORD STANDS WITH A RECIPIENT (`deliveryOf`, lane group-pending): the closed set. */
const DELIVERY_STATES = Object.freeze(['waiting', 'handed', 'muted', 'left']);
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
  'unknown-mention',  // (send, B-ff04) an @ that names no member — refused BEFORE anything is written; the answer carries `candidates`
  'ambiguous-mention', // (send, B-ff04) an @ two members answer to — refused the same way, with both as `candidates`
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
// verify r1 F3 (lane peer-census): a group's or a member's NAME is an inline piece every answer writes more after
// (`posted to group "<name>" (id)` ⏎ `  woke 1: <member>`; `"<name>" — 2 unread` ⏎ `    members: > beta …`) — the
// complete-tag rule alone left a dangling opener for the next line to close. THE belt (line kind) here, the one
// place a group or member name is cleaned.
function cleanName(name, max = NAME_MAX) {
  // verify r3 F8: the fold BEFORE the collapse + trim — folded last, an invisible-only name (`U+200B U+FEFF U+2060`: the collapse
  // read U+FEFF as whitespace, the fold then left that space) or a control-only name (a NUL → a space) came out as `' '`, a
  // TRUTHY blank that skipped every `|| cid.slice(0, 8)` fallback and validated as a group name of length 1
  const s = piece(String(name == null ? '' : name)).replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  // verify r2 (lane peer-census): the CUT landed AFTER the belt — a name like `… <system-reminder x b < c >` is one the
  // frame rule leaves alone (a `<` inside the attribute run stops both patterns), and the 80-character cut dropped its
  // tail into a dangling opener `… <system-reminder x` that the send / create / invite echoes printed beside a member
  // named `> …` on ONE line (live, reproduced over the real engine). The rule again on what the cut left — bound, THEN
  // judge, as the belt does; idempotent, so a name the cut left clean is unchanged.
  // verify r3 F7: the cut never splits a surrogate pair (peer-text's cutText rule) — a lone high surrogate at the 80th
  // unit was a stored name no reader can address: the CLI's stdout re-encodes it as U+FFFD, so the name the agent SEES
  // (`…�`) is not the name the store HOLDS, and `send <name>` never resolves it.
  return piece(s.slice(0, cutAt(s, max)).trim());
}
/** the largest cut ≤ n that does not split a surrogate pair (src/peer-text.js cutText's rule, spelled here so this PURE module imports nothing new) */
const cutAt = (s, n) => (n > 0 && /[\uD800-\uDBFF]/.test(s.charAt(n - 1)) ? n - 1 : n);
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
    if (!(m.reportedAt === null || m.reportedAt === undefined || Number.isFinite(m.reportedAt))) return err('bad-request', `member ${m.member}: reportedAt`);
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
/** A LENGTH-KEEPING lower case (verify r1 F10): `toLowerCase` turns "İ" (U+0130) into two code units, and the scan
 *  reads PLACES in the original words — a character whose lower case has another length is kept as it is. */
const foldCase = (s) => { let o = ''; for (const ch of String(s)) { const l = ch.toLowerCase(); o += l.length === ch.length ? l : ch; } return o; };

/** The [start, end) spans of `inline code` and ``` fences: an @ inside one is CODE — never a mention and never
 *  refused (quoting it as code is how a literal "@word" is written). */
function codeSpans(t) {
  const out = [];
  const fence = /```[\s\S]*?(?:```|$)/g;
  let m;
  while ((m = fence.exec(t))) out.push([m.index, m.index + m[0].length]);
  const inline = /`[^`\n]{1,300}`/g;
  while ((m = inline.exec(t))) { const s = m.index; if (!out.some(([a, b]) => s >= a && s < b)) out.push([s, s + m[0].length]); }
  return out;
}
const WORD_START = /^[\p{L}\p{N}_]/u;
/** The word an unresolved @ reached for (to the next space, ≤ 40 characters) — what a refusal quotes. */
const tokenAt = (t, i) => Array.from(t.slice(i + 1).split(/\s/)[0]).slice(0, 40).join('');
/** Does a name END at `j` of `lower` (whitespace / punctuation / end of text, or a script boundary)? */
const endsAt = (lower, j, key) => {
  const next = lower[j];
  return next === undefined || /[\s.,;:!?)\]}'"]/.test(next) || UNSPACED.test(lastChar(key)) || UNSPACED.test(String.fromCodePoint(lower.codePointAt(j)));
};

/**
 * THE @ OF A MESSAGE, RESOLVED AT SEND TIME (B-ff04; the owner, 2026-10-03: "@ 要从头到尾结构化，背后传的是 id").
 * Every `@` that opens a word (never the tail of an address — x@api.com) outside `code` is read ONCE, here:
 * `@<conversation id>` exactly, or `@<member name>` case-insensitively — the longest name first, so "@api" never
 * steals "@api lane" — ending at whitespace / punctuation / end of text, or at a SCRIPT boundary (the next character
 * is from an unspaced script — CJK / kana / Hangul — or the name itself ends in one: "@测试请看" mentions 测试). A
 * Latin name followed by a Latin letter is nobody ("@ceex").
 * `explicit` = places the SENDER picked by id (`[{id, start, end}]` — the window's @-picker): each must sit on an `@`
 * of the text and name a member; they are claimed first and never read again by name.
 * @param members [{member, name}]
 * @returns {{mentions: [{id, name, pos: [[start, end]…]}], unknown: [{at, token}], ambiguous: [{at, token, ids}], bad: [{id, start}]}}
 *   `mentions` — each member once, `pos` = every place the words name it; `unknown` — an @ that reads as a name and
 *   names nobody; `ambiguous` — an @ two members answer to; `bad` — a picked place that is not on an `@`, overlaps
 *   another, or names no member. `atRefusal` turns the last three into the refusal.
 */
function scanAts(text, members, { explicit = [] } = {}) {
  const t = String(text || '');
  const out = { mentions: [], unknown: [], ambiguous: [], bad: [] };
  const byId = new Map();
  const add = (id, name, s, e) => {
    let m = byId.get(id);
    if (!m) { m = { id, name: name || id, pos: [] }; byId.set(id, m); out.mentions.push(m); }
    m.pos.push([s, e]);
  };
  const names = new Map();
  for (const m of members || []) if (m && m.member) names.set(m.member, m.name || null);
  const claimed = [];
  const inAny = (i, spans) => spans.some(([s, e]) => i >= s && i < e);
  for (const x of Array.isArray(explicit) ? explicit : []) {
    const s = Number(x && x.start), e = Number(x && x.end), id = x && x.id;
    if (!names.has(id) || !Number.isInteger(s) || !Number.isInteger(e) || s < 0 || e <= s + 1 || e > t.length || t[s] !== '@' || claimed.some(([a, b]) => s < b && e > a)) { out.bad.push({ id: String(id == null ? '' : id).slice(0, 80), start: s }); continue; }
    claimed.push([s, e]);
    add(id, names.get(id), s, e);
  }
  const cands = [];
  for (const [id, name] of names) {
    cands.push({ key: id, id, name });
    if (name) cands.push({ key: String(name), id, name });
  }
  cands.sort((a, b) => b.key.length - a.key.length);
  const lower = foldCase(t);
  const code = t.includes('`') ? codeSpans(t) : [];
  for (let i = t.indexOf('@'); i >= 0; i = t.indexOf('@', i + 1)) {
    if (inAny(i, claimed) || inAny(i, code)) continue;
    const prev = i > 0 ? lower[i - 1] : '';
    if (prev && /[a-z0-9_.+-]/.test(prev)) continue;   // x@api.com is an address, not a mention
    let hit = null;
    const ids = [];
    for (const c of cands) {
      if (hit && c.key.length < hit.key.length) break;
      const key = foldCase(c.key);
      if (!lower.startsWith('@' + key, i) || !endsAt(lower, i + 1 + key.length, c.key)) continue;
      if (!hit) hit = c;
      if (!ids.includes(c.id)) ids.push(c.id);
    }
    if (hit && ids.length > 1) { out.ambiguous.push({ at: i, token: t.slice(i + 1, i + 1 + hit.key.length), ids }); continue; }
    if (hit) { add(hit.id, hit.name, i, i + 1 + hit.key.length); i += hit.key.length; continue; }
    if (WORD_START.test(t.slice(i + 1, i + 3))) out.unknown.push({ at: i, token: tokenAt(t, i) });
  }
  for (const m of out.mentions) m.pos.sort((a, b) => a[0] - b[0]);
  return out;
}

/** Who a message @mentions — `scanAts`'s members without their places (each once, `{id, name}`). */
function mentionsIn(text, members) {
  return scanAts(text, members).mentions.map((m) => ({ id: m.id, name: m.name }));
}

/** The members an unresolved "@token" most likely meant: the longest shared start of the name first; every member
 *  (≤ 8) when none shares even its first character. `[{conversationId, name}]`. */
function nearMembers(token, members) {
  const q = String(token || '').toLowerCase();
  const list = (members || []).filter((m) => m && m.member).map((m) => ({ conversationId: m.member, name: m.name || m.member }));
  const lcp = (a) => { const n = String(a).toLowerCase(); let k = 0; while (k < n.length && k < q.length && n[k] === q[k]) k++; return k; };
  const near = list.map((c) => ({ c, k: Math.max(lcp(c.name), lcp(c.conversationId)) })).filter((x) => x.k > 0).sort((a, b) => b.k - a.k).map((x) => x.c);
  return (near.length ? near : list).slice(0, 8);
}

/**
 * THE REFUSAL A SCAN EARNS, or null (B-ff04 ①: an @ that names nobody, or two, is refused BY NAME before anything is
 * written, with the candidates). `{ok:false, code, error, token, candidates:[{conversationId, name}]}`.
 */
function atRefusal(scan, members) {
  if (!scan) return null;
  const list = (members || []).filter((m) => m && m.member).map((m) => ({ conversationId: m.member, name: m.name || m.member }));
  const say = (s) => piece(s, 80);
  if (scan.bad && scan.bad.length) return { ...err('bad-request', 'a picked @mention no longer sits on its @ in the text, or names no member — nothing was sent; pick it again'), token: '', candidates: [] };
  if (scan.ambiguous && scan.ambiguous.length) {
    const a = scan.ambiguous[0];
    const candidates = list.filter((c) => a.ids.includes(c.conversationId));
    return { ...err('ambiguous-mention', `"@${say(a.token)}" names ${candidates.length} members of this group — nothing was sent; @ the one you mean by its conversation id (or --at <id>): ${candidates.map((c) => c.conversationId).join(', ')}`), token: a.token, candidates };
  }
  if (scan.unknown && scan.unknown.length) {
    const u = scan.unknown[0];
    const candidates = nearMembers(u.token, members);
    return { ...err('unknown-mention', `"@${say(u.token)}" is not a member of this group — nothing was sent. Members: ${list.slice(0, 12).map((c) => say(c.name)).join(', ') || '(none)'}${list.length > 12 ? ` +${list.length - 12} more` : ''}. @ one of them by name or id (or --at <name|id>); a literal "@word" goes in backticks as code`), token: u.token, candidates };
  }
  return null;
}

/** Does this record @mention `member` — BY ID (B-ff04: the send resolved every @; the words are never re-read). */
const mentionsMember = (rec, member) => !!(rec && Array.isArray(rec.mentions) && rec.mentions.some((x) => x && x.id === member));
/**
 * Does this record REACH this member's report (B-a354)? A `mention` member is handed only what @mentions it — plus
 * its OWN invite (the context it was added with); every other mode is handed every record (mute: nothing, by the
 * callers). The ONE rule the report, the pending strip and the unread count read.
 */
function reachesReport(group, member, rec) {
  const m = memberOf(group, member);
  if (!m || !rec) return false;
  if (m.notify !== 'mention') return true;
  const raw = rec.raw || {};
  if (raw.kind === 'invite' && raw.member === member) return true;
  return mentionsMember(rec, member);
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

/** One log record's report-line PREFIX (the part before its words) — `lineFor` and the shown lines' card text
 *  (`reportFor` → `lines[].body`) read the same one. */
function linePrefix(r, member = null, group = null) {
  const who = piece((r.author && (r.author.name || r.author.id)) || 'unknown', 200);
  const k = (r.raw && r.raw.kind) || 'message';
  return k === 'message' ? `- [${stamp(r.at)}] ${who}${mentionField(r, member, group)}: ` : `- [${stamp(r.at)}] (${k}) `;
}
/** THE @ AS A FIELD (B-ff04 ②): who a message mentions, BY ID — the member reading it is told "you" by its OWN id,
 *  never left to match a name in the words. Others by the group's current name (a rename shows the new one), at most
 *  three, then the count. '' when the message mentions nobody. */
function mentionField(r, member, group) {
  const ms = (r && Array.isArray(r.mentions) ? r.mentions : []).filter((x) => x && x.id);
  if (!ms.length) return '';
  const nm = (x) => { const m = group && memberOf(group, x.id); return piece((m && m.name) || x.name || x.id, 80); };
  const mine = member ? ms.filter((x) => x.id === member) : [];
  const others = ms.filter((x) => x.id !== member);
  const parts = mine.map((x) => `you (${piece(x.id, 80)})`).concat(others.slice(0, 3).map((x) => `${nm(x)} (${piece(x.id, 80)})`));
  if (others.length > 3) parts.push(`+${others.length - 3} more`);
  return ` [mentions: ${parts.join(', ')}]`;
}
/** One log record as one report line (agent-facing English, frame-inert — the line rule too: no opener dangles). */
function lineFor(r, member = null, group = null) {
  return linePrefix(r, member, group) + piece(clipLine(r.text));
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
 * @returns {{text, upTo, count, shown, clipped, context:boolean, fits:boolean, lines}|null}
 *   `upTo` = the newest instant this report ACCOUNTS for (the clipped ones are
 *   accounted for by the `read --before` pointer), the value the engine stamps.
 *   `lines` = the shown records, oldest first: `{rec, cut, body}` — `body` is
 *   the record's whole text when its line was whole, the line's own (clipped,
 *   whitespace-folded) words when it was cut: what the member was SHOWN (the
 *   engine cards each shown message in that member's chat — lane
 *   group-report-card).
 */
function reportFor(group, log, member, { since = null, budget = REPORT_BUDGET, lead = null } = {}) {
  const m = memberOf(group, member);
  if (!m || m.notify === 'mute') return null;
  const floor = m.joinedAt - 1;
  const mark = since !== null && since !== undefined ? since : (Number.isFinite(m.reportedUpTo) ? m.reportedUpTo : floor);
  const after = Math.max(Number(mark) || 0, floor);
  const news = (Array.isArray(log) ? log : []).filter((r) => r && Number(r.at) > after && !(r.author && r.author.id === member));
  // B-a354: a `mention` member is handed only what @mentions it; what it is not handed is ACCOUNTED for (the marker
  // moves past it — never queued, never "waiting")
  const recs = news.filter((r) => reachesReport(group, member, r))
    .sort((a, b) => (a.at - b.at) || String(a.vendorId).localeCompare(String(b.vendorId)));
  if (!recs.length) return null;
  const newest = news.reduce((x, r) => Math.max(x, Number(r.at) || 0), 0);
  const invite = recs.find((r) => r.raw && r.raw.kind === 'invite' && r.raw.member === member) || null;
  const rest = recs.filter((r) => r !== invite);
  for (const form of REPORT_FORMS) {
    const r = buildReport(group, m, recs, invite, rest, Number(budget) || 0, lead, form, log, newest);
    if (r && (r.shown > 0 || !rest.length || form === REPORT_FORMS[REPORT_FORMS.length - 1])) return r;
  }
  return { text: '', upTo: null, count: recs.length, shown: 0, clipped: rest.length, context: !!invite, fits: false, lines: [] };
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
function buildReport(group, m, recs, invite, rest, budget, lead, form, log, newest = 0) {
  const id = group.id;
  const gname = form.name === Infinity ? piece(group.name) : piece(clipBytes(piece(group.name), form.name));
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
  const leadLine = lead ? piece(form.lead === Infinity ? String(lead) : clipBytes(String(lead), form.lead)) : null;   // the engine's lead is its own words today; a caller that names a sender in it is belted like every piece
  let used = bytes(head) + bytes(foot) + 2 + (leadLine ? bytes(leadLine) + 1 : 0);
  // the pointer is budgeted up front (widest form) whenever it COULD appear
  if (rest.length) used += bytes(pointer(rest.length, 9999999999999)) + 1;
  let ctxLine = null;
  if (invite) {
    const by = piece(clipBytes(piece((invite.author && (invite.author.name || invite.author.id)) || 'someone', 200), 60));
    const ctx = piece(String(invite.raw.context || '').trim());
    ctxLine = ctx ? `You were added by ${by} — context: ${ctx.replace(/\s+/g, ' ')}` : `You were added by ${by}.`;
    ctxLine = piece(clipBytes(ctxLine, form.ctx === null ? Math.max(160, Math.floor(budget / 3)) : form.ctx));   // the byte cut can leave an opener dangling — judged again after it
    used += bytes(ctxLine) + 1;
  }
  let cutReserved = false;
  if (rest.some(cutAtLine)) { used += CUT_RESERVE; cutReserved = true; }
  // newest first, the newest always shows (clipped to the room) when there is room for it
  const lines = [];
  const cut = [];
  // WHAT THE AGENT WAS SHOWN, record by record (lane group-report-card): the engine cards each shown message in
  // the conversation that received it — the whole text when its line was whole, the line's own words when it was
  // cut (the card says what the agent saw, never more)
  const shownLines = [];
  let shown = 0;
  for (let i = rest.length - 1; i >= 0; i--) {
    let l = lineFor(rest[i], m.member, group);
    let isCut = cutAtLine(rest[i]);
    let room = budget - used - 1;
    if (bytes(l) > room) {
      if (shown !== 0) break;
      if (!cutReserved) { used += CUT_RESERVE; cutReserved = true; room = budget - used - 1; }
      if (room <= 60) break;
      l = piece(clipBytes(l, room));   // a byte cut can leave an opener dangling — the line rule again after it
      isCut = true;
    }
    lines.unshift(l);
    const pre = linePrefix(rest[i], m.member, group);
    shownLines.unshift({ rec: rest[i], cut: isCut, body: isCut ? (l.startsWith(pre) ? l.slice(pre.length) : '') : String(rest[i].text == null ? '' : rest[i].text) });
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
  return { text, upTo: Math.max(recs[recs.length - 1].at, Number(newest) || 0), count: recs.length, shown, clipped, context: !!invite, fits: true, lines: shownLines };
}

/**
 * WHERE A RECORD STANDS WITH EACH RECIPIENT (lane group-pending, the owner
 * 2026-10-01: a message to a next-turn member was drawn exactly like a
 * delivered one — "你这个最新回复应该还没有实际发出去"). A VIEW of facts the engine
 * already keeps: the record's `at`, each member's marker `reportedUpTo`, its
 * notify mode, the log's leave / kick records. Nothing here is a new fact.
 *
 * One row per RECIPIENT = every member but the author that was a member AT
 * the record's instant (`joinedAt <= rec.at`: reportFor's floor is
 * `joinedAt - 1`, so a record at the join IS in that member's first report);
 * the owner (the observer) is never a row. `DELIVERY_STATES`:
 *   handed  — the marker >= rec.at: the report that carried this record was
 *             handed out at that member's turn start, or the wake that carried
 *             it went out (the engine stamps the marker in both cases and keeps
 *             no receipt — the two are not told apart). THE PIN: reportFor
 *             reads `r.at > marker`, so a marker EQUAL to the record's instant
 *             means the record was in that report ⇒ handed. `at` = the
 *             hand-over CLOCK (`reportedAt`, stamped beside the marker when it
 *             moves — the marker itself holds a RECORD instant); null on a
 *             row stamped before the clock existed.
 *   waiting — the marker < rec.at and the member is not muted: it rides that
 *             member's next report (or a wake, if one comes).
 *   muted   — notify `mute` and not handed: it will never read it in a report
 *             (a `read` on purpose is not tracked).
 *   left    — not a member now (or a member again only after the record), and
 *             the log holds its leave / kick AFTER the record with no invite of
 *             it in between: it was there when the record landed and is gone.
 *             `at` = the leave's instant. A departed member the log does not
 *             witness is no row (nothing proves it was a member then).
 * `log` = the group's records the caller holds (the window's pages, the CLI
 * read's page); every name leaves through the belt (`cleanName`).
 * @returns [{member, name, state, at}] — the members in the group's order, the departed after
 */
function deliveryOf(group, rec, { log = [] } = {}) {
  const at = rec && Number(rec.at);
  if (!group || !Array.isArray(group.members) || !Number.isFinite(at)) return [];
  const author = (rec.author && rec.author.id) || null;
  const recs = Array.isArray(log) ? log : [];
  const nameOf = (m, cid) => (m && m.name ? cleanName(m.name) : '') || nameFromLog(recs, cid) || String(cid).slice(0, 8);
  const out = [];
  const seen = new Set();
  for (const m of group.members) {
    if (!m || !m.member || m.member === author) continue;
    if (!(m.member !== OWNER && m.joinedAt <= at)) continue;
    seen.add(m.member);
    const handed = Number.isFinite(m.reportedUpTo) && m.reportedUpTo >= at;
    const state = handed ? 'handed' : m.notify === 'mute' ? 'muted' : 'waiting';
    // a handed row's `at` = the hand-over CLOCK (`reportedAt`, stamped beside the marker when it moves); a legacy row
    // stamped before the clock existed answers null — the words then say "Read by beta" without a time
    out.push({ member: m.member, name: nameOf(m, m.member), state, at: handed && Number.isFinite(m.reportedAt) ? m.reportedAt : null });
  }
  const departed = departuresAfter(recs, at, author);
  for (const d of departed) {
    if (seen.has(d.member) || d.member === OWNER) continue;
    seen.add(d.member);
    out.push({ member: d.member, name: nameFromLog(recs, d.member) || String(d.member).slice(0, 8), state: 'left', at: d.at });
  }
  return out;
}
/** The members the log shows LEAVING after `at` (their earliest leave / kick past it), each only when no invite of
 *  it lies between `at` and that leave — a member that joined after the record and then left was never a recipient. */
function departuresAfter(recs, at, author) {
  const byMember = new Map();
  for (const r of recs) {
    const k = r && r.raw && r.raw.kind;
    if ((k !== 'leave' && k !== 'kick') || !r.raw.member || r.raw.member === author || !(Number(r.at) > at)) continue;
    const prev = byMember.get(r.raw.member);
    if (!prev || Number(r.at) < prev) byMember.set(r.raw.member, Number(r.at));
  }
  const out = [];
  for (const [member, leftAt] of byMember) {
    const joinedBetween = recs.some((r) => r && r.raw && r.raw.kind === 'invite' && r.raw.member === member && Number(r.at) > at && Number(r.at) < leftAt);
    if (!joinedBetween) out.push({ member, at: leftAt });
  }
  return out.sort((a, b) => a.at - b.at);
}
/** A departed member's name: what it signed its own lines with (through the belt), else nothing. */
function nameFromLog(recs, cid) {
  for (const r of recs) if (r && r.author && r.author.id === cid && r.author.name) return cleanName(r.author.name);
  return '';
}

module.exports = {
  NOTIFY_MODES, DEFAULT_NOTIFY, DELIVERY_STATES, OWNER, GROUP_ADAPTER_ID, ERROR_CODES, NAME_MAX, CONTEXT_MAX, MEMBER_MAX, REPORT_BUDGET, LINE_MAX,
  WAKE_CONFIRM_ABOVE, WAKE_FLOOR_MS, SENDER_WAKES, SENDER_WINDOW_MS, PACE_SKEW_MS,
  newGroupId, pairKey, cleanName, cleanText, isCid, isGroupId, memberOf, validateGroup, makeGroup,
  addMember, removeMember, setNotify, rename, archive, mentionsIn, scanAts, atRefusal, codeSpans, foldCase, reachesReport, wakeVerdict, wakesPlanned, consentVerdict, reportFor, deliveryOf,
  emptyPace, prunePace, paceFuture, paceVerdict, paceGrant, paceRefund,
};
