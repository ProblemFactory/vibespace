// THE IM-FIRST PANEL'S ARITHMETIC (design-communication-panel.zh.md §22, the
// owner's clarification of 2026-09-22 — "the first screen is the GROUP LIST, a
// simple IM"; chunk g3). DOM-free and word-free: every function returns
// STRUCTURE and the two client surfaces (channels-panel.js, channel-window.js)
// say the words with the device's own `t`. The only import is the PURE group
// model, so the group namespace, the notify modes and the owner's actor id are
// spelled ONCE (src/channel-groups.js) and never again here.
//
// What lives here, one rule each:
//   groupListRows   — the first screen: every agent group + EVERY conversation
//                     of a linked account (2026-09-26: an aggregated IM, no
//                     track step), sorted by last activity; archived groups
//                     apart; a conversation the vendor no longer lists stays
//                     in its account's section only.
//   composerMode    — what the window's composer IS for a conversation: a group
//                     = direct as You; an external source = direct as You when
//                     `sendAsUser` is offered, the proposal path when only the
//                     bot identity is (with the send-as-user reason), a named
//                     read-only reason otherwise — read off the capability row,
//                     never an adapter id.
//   mentionQuery / mentionCandidates / insertMention — the @-autocomplete.
//   memberRows      — the group detail's list, the owner first as the observer.
//   pickerSections  — New group / Invite…: live sessions grouped by Task Group,
//                     each session ONCE, no group ever selected whole (D1).
//   wakeCount       — the post/create/invite answer → the numbers the toast says.
//   wakePreview     — BEFORE the click: who THIS text, sent as You, would wake
//                     (the D2 table the engine applies, through the model's
//                     own `scanAts` — one spelling of what an @ is).
//   pickedSpans / atProblem — B-ff04: the @-picker's choices as places BY ID
//                     (the server claims them first, never re-reads them by
//                     name) and the refusal the server would give, said first.
//   groupBodyRuns / memberName / learnNames — B-ff04: a message body as text
//                     + mention chips drawn ONLY where the record's own
//                     server-resolved mentions put one, and the name a member
//                     (or a member who left) is shown by.
//   foldsFrom       — the panel's secondary sections' persisted folds.
//   focusRows / statusTag / firstScreen (R3, 2026-09-26, re-exported from the
//                     PURE src/lib/channel-focus.js) — the first screen is the
//                     ATTENTION list: what matters, one tag per row, the full
//                     list one switch away.
import { GROUP_ADAPTER_ID, NOTIFY_MODES, DEFAULT_NOTIFY, OWNER, scanAts, atRefusal, codeSpans, foldCase, deliveryOf, DELIVERY_STATES } from '../channel-groups.js';
import { nameOf } from '../channel-ref.js'; // B-c127's name ladder (lane channel-names) — memberName climbs it (the 2.369.202 integration)
// lane group-pending (2026-10-01): the window's line under every message judges by the model's ONE rule — re-exported, never copied
export { deliveryOf, DELIVERY_STATES };
// B-5fe1: each conversation row carries its ACCOUNT badge (PURE — the hue per account, the vendor glyph, `multi`)
import { accountBadges } from './channel-avatar.js';

export { GROUP_ADAPTER_ID, NOTIFY_MODES, DEFAULT_NOTIFY, OWNER };
export { focusRows, statusTag, filterRows, firstScreen, heldOf, heldPending, FOCUS_WINDOW_MS, HELD_WINDOW_MS, TAG_ORDER } from './channel-focus.js';

/** Is this (adapterId, convId) pair an agent GROUP rather than a channel
 *  conversation? The group log's namespace (the store files a group's log
 *  under `GROUP_ADAPTER_ID`) — the kind of OBJECT, never a registry adapter. */
export function isGroupConv(adapterId) { return adapterId === GROUP_ADAPTER_ID; }

const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
const byActivity = (a, b) => (num(b.lastAt) - num(a.lastAt)) || String(a.title).localeCompare(String(b.title));

/**
 * THE FIRST SCREEN. `groups` = `/api/channel-groups` (or the
 * `channel-groups-updated` broadcast's list), `conversations` + `adapters` =
 * the channels digest. Returns `{rows, archived}` — each row
 * `{kind:'group'|'conv', key, id, title, lastAt, lastText, unread, …}`.
 * EVERY conversation of a linked account joins the list (2026-09-26: an
 * account is an aggregated IM — there is no track step) unless the vendor no
 * longer lists it (`unlisted`: a Gmail scope change, a chat the user left);
 * the built-in Agents adapter's rows stay out (it lists live SESSIONS as
 * sources — the owner's "message watcher", a secondary section, §22.1).
 */
/** lane lark-search-poll: a conversation that has no title yet (born by the change feed, a push event before discovery)
 *  is WORDED by the caller (`untitled(kind)` — "Single chat"), never shown as its raw vendor id. */
export function groupListRows({ groups = [], conversations = [], adapters = [], untitled = null } = {}) {
  const rows = [], archived = [];
  for (const g of groups || []) {
    if (!g || !g.id) continue;
    const row = {
      kind: 'group', key: `${GROUP_ADAPTER_ID}/${g.id}`, adapterId: GROUP_ADAPTER_ID, id: g.id,
      title: g.name || g.id, lastAt: num(g.lastAt || g.createdAt), lastText: g.lastText || '',
      unread: num(g.unread), pair: !!(g.pair && g.pair.length), memberCount: Array.isArray(g.members) ? g.members.length : 0,
      archived: !!g.archivedAt, group: g,
    };
    (row.archived ? archived : rows).push(row);
  }
  const adapterById = new Map((adapters || []).map((a) => [a.id, a]));
  const badges = accountBadges(adapters);
  for (const c of conversations || []) {
    if (!c || c.unlisted) continue;
    const a = adapterById.get(c.adapterId);
    if (!a || a.builtin) continue;
    rows.push({
      kind: 'conv', key: `${c.adapterId}/${c.id}`, adapterId: c.adapterId, id: c.id,
      title: c.title || (typeof untitled === 'function' ? untitled(c.kind) : '') || c.id, lastAt: num(c.lastAt), lastText: c.lastText || '',
      unread: num(c.unread), sourceLabel: c.adapterLabel || a.label || a.id,
      mail: c.kind === 'thread' || c.kind === 'mailbox', conv: c, account: badges.get(c.adapterId) || null,
    });
  }
  rows.sort(byActivity);
  archived.sort(byActivity);
  return { rows, archived };
}

/**
 * WHAT THE COMPOSER IS (§22.2 ①: my own words go out directly; the outbox and
 * its approval are for AGENT drafts). Returns `{mode, why?}`:
 *   'group'      an agent group — direct, signed You, @name wakes
 *   'archived'   an archived group — no composer, the log stays readable
 *   'direct'     an external conversation that offers sendAsUser
 *   'propose'    only the bot identity is offered: a message would not be
 *                the owner speaking, so it goes through the proposal path;
 *                `why` = why sending as the user is not offered
 *   'readonly'   `why` = the capability row's reason (2026-09-26: there is
 *                no 'untracked' mode — every conversation is fetched)
 */
export function composerMode({ group = null, conv = null } = {}) {
  if (group) return group.archivedAt ? { mode: 'archived' } : { mode: 'group' };
  if (!conv) return { mode: 'readonly', why: 'unknown' };
  const o = conv.offers || {};
  const u = o.sendAsUser || {}, b = o.sendAsBot || {};
  if (u.offered) return { mode: 'direct' };
  if (b.offered) return { mode: 'propose', why: u.why || 'unknown' };
  return { mode: 'readonly', why: u.why || 'unknown' };
}

/** The @-query the caret is inside of: `{start, query}` (start = the index of
 *  the `@`) or null. An `@` opens a query at the start of the text or after
 *  whitespace / an opening bracket (x@y.com is an address, never a mention). */
export function mentionQuery(text, caret) {
  const s = String(text || '').slice(0, Math.max(0, Math.min(String(text || '').length, Number(caret) || 0)));
  const m = /(^|[\s(\[{])@([^\s@]{0,40})$/.exec(s);
  if (!m) return null;
  return { start: s.length - m[2].length - 1, query: m[2] };
}

/** The members an @-query may name (never the owner — the owner is the one
 *  typing), prefix matches first, then substring, each at most once. */
export function mentionCandidates(members, query, { limit = 8 } = {}) {
  const q = String(query || '').toLowerCase();
  const list = (members || []).filter((m) => m && m.member && m.member !== OWNER).map((m) => ({ member: m.member, name: String(m.name || m.member) }));
  const pre = list.filter((m) => m.name.toLowerCase().startsWith(q));
  const sub = list.filter((m) => !pre.includes(m) && m.name.toLowerCase().includes(q));
  return pre.concat(sub).slice(0, limit);
}

/** Replace the @-query with `@<name> ` — returns the new text and the caret. */
export function insertMention(text, q, name) {
  const s = String(text || '');
  const end = q.start + 1 + q.query.length;
  const ins = '@' + String(name) + ' ';
  return { text: s.slice(0, q.start) + ins + s.slice(end), caret: q.start + ins.length };
}

/** The group detail's member list: the OWNER first as the observer (implicit,
 *  never stored, never removable, no notify mode), then every member in join
 *  order with its mode (an unknown stored value reads as the default). */
export function memberRows(group) {
  const out = [{ owner: true, member: OWNER }];
  if (!group) return out;
  for (const m of group.members || []) {
    out.push({
      owner: false, member: m.member, name: m.name || String(m.member).slice(0, 8),
      notify: NOTIFY_MODES.includes(m.notify) ? m.notify : DEFAULT_NOTIFY,
      live: !!m.live, creator: m.member === group.createdBy,
    });
  }
  return out;
}

/**
 * New group / Invite…: the live sessions grouped by Task Group — each session
 * listed ONCE (under its first group), sessions in no group last, NO section is
 * ever pre-selected or selectable as a whole (D1: no automatic group per Task
 * Group). `exclude` = conversation ids already in the group (drawn disabled).
 * `tasks` = `[{id, title}]` to title the sections.
 */
export function pickerSections(sessions, tasks = [], { exclude = [] } = {}) {
  const titles = new Map((tasks || []).filter((g) => g && g.id).map((g) => [g.id, g.title || g.name || g.id]));
  const ex = new Set(exclude || []);
  const bySec = new Map();
  const order = [];
  const seen = new Set();
  for (const s of sessions || []) {
    if (!s || !s.cid || seen.has(s.cid)) continue;
    seen.add(s.cid);
    const gid = (Array.isArray(s.groups) && s.groups.find((g) => titles.has(g))) || (Array.isArray(s.groups) && s.groups[0]) || null;
    if (!bySec.has(gid)) { bySec.set(gid, []); order.push(gid); }
    bySec.get(gid).push({ cid: s.cid, name: s.name || String(s.cid).slice(0, 8), disabled: ex.has(s.cid) });
  }
  const sections = order.filter((g) => g !== null).map((g) => ({ id: g, title: titles.get(g) || g, sessions: bySec.get(g) }));
  sections.sort((a, b) => String(a.title).localeCompare(String(b.title)));
  if (bySec.has(null)) sections.push({ id: null, title: null, sessions: bySec.get(null) });
  for (const sec of sections) sec.sessions.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return sections;
}

/** How many agents a verb's answer woke (each one a billed turn), how many
 *  wakes the authorizer refused (not billed), and how many members get the
 *  message in their next report instead. */
export function wakeCount(r) {
  const n = (x) => (Array.isArray(x) ? x.length : 0);
  return { woke: n(r && r.woke), refused: n(r && r.refused), later: n(r && r.later) };
}

/** The panel's secondary sections, persisted in user state
 *  (`channelsPanelFolds`, PATCH merge-only): `true` = folded. Only the known
 *  parts, only booleans — user state never grows from this map. */
export const PANEL_PARTS = Object.freeze(['accounts', 'watcher']);
export function foldsFrom(state) {
  const f = state && state.channelsPanelFolds && typeof state.channelsPanelFolds === 'object' ? state.channelsPanelFolds : {};
  const out = {};
  for (const p of PANEL_PARTS) out[p] = f[p] === true;
  return out;
}

/**
 * Who a message the OWNER is about to send would wake — the D2 table the
 * engine's `wakeVerdict` applies to a message record, asked of the draft:
 * mute → never; an @mention → yes; notify `always` → yes; next-turn / mention
 * without the @ → no (the next report). The mention rule is the model's own
 * `mentionsIn` over the members' display names, so the preview and the server
 * cannot disagree about what an @ is. Returns `[{member, name, why}]`.
 */
export function wakePreview(group, text, { picked = [] } = {}) {
  if (!group || group.archivedAt || !String(text || '').trim()) return [];
  const members = (group.members || []).map((m) => ({ member: m.member, name: m.name || null, notify: m.notify }));
  const named = new Set(scanAts(text, members, { explicit: picked }).mentions.map((x) => x.id));
  const out = [];
  for (const m of members) {
    if (m.member === OWNER || m.notify === 'mute') continue;
    if (named.has(m.member)) out.push({ member: m.member, name: m.name || m.member, why: 'mention' });
    else if (m.notify === 'always') out.push({ member: m.member, name: m.name || m.member, why: 'always' });
  }
  return out;
}

/**
 * THE @-PICKER'S CHOICES AS PLACES (B-ff04 ①: "人在群窗口里发消息时 @ 也走同一个结构（选人，不是打字拼名字）"). `picks`
 * = `[{id, name}]` in the order the person picked them (the composer inserted `@<name> ` for each); each claims the
 * first still-unclaimed `@<name>` of `text` that ends at a word end. A pick whose words were deleted claims nothing.
 * Returns `[{id, start, end}]` — what the post carries; the server checks each sits on an `@` and names a member.
 */
export function pickedSpans(text, picks) {
  const s = String(text || '');
  const claimed = [];
  const out = [];
  for (const p of picks || []) {
    if (!p || !p.id || !p.name) continue;
    const needle = '@' + String(p.name);
    let i = s.indexOf(needle);
    while (i >= 0 && (claimed.some(([a, b]) => i < b && i + needle.length > a) || /[A-Za-z0-9_]/.test(s[i + needle.length] || ''))) i = s.indexOf(needle, i + 1);
    if (i < 0) continue;
    claimed.push([i, i + needle.length]);
    out.push({ id: p.id, start: i, end: i + needle.length });
  }
  return out;
}

/** The refusal THIS draft would get for its @ (an @ that names no member, or two), said under the box BEFORE the
 *  click — the server's own `scanAts` + `atRefusal`, so the two cannot disagree. null when every @ resolves. */
export function atProblem(group, text, { picked = [] } = {}) {
  if (!group || !String(text || '').trim()) return null;
  const members = (group.members || []).map((m) => ({ member: m.member, name: m.name || null }));
  return atRefusal(scanAts(text, members, { explicit: picked }), members);
}

const LATIN_WORD = /[A-Za-z0-9_]/;
/** An older record's chips, best effort (B-ff04: "旧消息按名字尽力解析成标签，解析不出就按普通文字显示"): each of the
 *  record's OWN mentions — resolved by the server when it was sent, never the text read against the member list —
 *  at every `@<its name>` that opens a word, ends at one and lies outside code. */
function legacySpans(text, mentions) {
  const lower = foldCase(text);   // verify r1 F10: the places are read back in `text` — never a lower case of another length
  const code = text.includes('`') ? codeSpans(text) : [];
  const out = [];
  for (const m of mentions) {
    if (!m.name) continue;
    const needle = '@' + foldCase(m.name);
    for (let i = lower.indexOf(needle); i >= 0; i = lower.indexOf(needle, i + 1)) {
      const prev = i > 0 ? lower[i - 1] : '';
      const next = lower[i + needle.length];
      if ((prev && /[a-z0-9_.+-]/.test(prev)) || (next !== undefined && LATIN_WORD.test(next) && LATIN_WORD.test(needle[needle.length - 1]))) continue;
      if (code.some(([s, e]) => i >= s && i < e)) continue;
      out.push({ s: i, e: i + needle.length, id: m.id });
    }
  }
  return out;
}

/**
 * A GROUP MESSAGE'S BODY AS RUNS (B-ff04 ③): `[{k:'t', text} | {k:'at', id, text}]`. A chip ONLY where the record's
 * own mentions put one — the places the server stored at send (`mentions[].pos`, each checked to sit on an '@' of
 * the text), or, for a record sent before places existed (no mention carries any), its mentions' names, best
 * effort. NEVER the free text read against the member list: an `@name` an agent typed that the server did not
 * resolve, a Lark `<at …>` tag and an `@_user_N` stay TEXT — a chip cannot be forged for a non-member. The chip's
 * NAME is the caller's (by id: the member's current one); `text` = the words it covers (copied as they were sent).
 */
export function groupBodyRuns(rec) {
  const text = String((rec && rec.text) || '');
  const ms = (rec && Array.isArray(rec.mentions) ? rec.mentions : []).filter((m) => m && m.id);
  const placed = ms.some((m) => Array.isArray(m.pos) && m.pos.length);
  const spans = [];
  if (placed) {
    for (const m of ms) for (const p of Array.isArray(m.pos) ? m.pos : []) {
      if (Array.isArray(p) && Number.isInteger(p[0]) && Number.isInteger(p[1]) && p[0] >= 0 && p[1] > p[0] + 1 && p[1] <= text.length && text[p[0]] === '@') spans.push({ s: p[0], e: p[1], id: m.id });
    }
  } else spans.push(...legacySpans(text, ms));
  spans.sort((a, b) => (a.s - b.s) || (b.e - a.e));
  const runs = [];
  let last = 0;
  for (const sp of spans) {
    if (sp.s < last) continue;
    if (sp.s > last) runs.push({ k: 't', text: text.slice(last, sp.s) });
    runs.push({ k: 'at', id: sp.id, text: text.slice(sp.s, sp.e) });
    last = sp.e;
  }
  if (last < text.length || !runs.length) runs.push({ k: 't', text: text.slice(last) });
  return runs;
}

/**
 * THE NAME A MEMBER IS SHOWN BY (B-ff04 ③ — folded onto B-c127's ladder at the 2.369.202 integration: src/channel-ref.js
 * `nameOf`, the ONE spelling — a rung of blanks, controls or hidden characters only says nothing and the ladder goes on):
 * ① the group's member row (the server's live name) → ② the live session's name (`live`: conversation id → name) →
 * ③ `snapshot`, the name THIS record wrote down → ④ the last name the log knew (`known`, filled by `learnNames`) →
 * ⑤ the id, short — never a bare id while any name is known.
 */
export function memberName(id, { group = null, live = null, known = null, snapshot = null } = {}) {
  const key = String(id || '');
  const row = group && (group.members || []).find((x) => x && x.member === key);
  return nameOf([row && row.name, live && live.get(key), snapshot, known && known.get(key)], key.slice(0, 8));
}
/** Every name a record knows a member by — its author (never the owner), its mentions, a membership record's
 *  `raw.name` — into `known` (conversation id → the latest name seen). */
export function learnNames(known, rec) {
  if (!known || !rec) return known;
  const put = (id, name) => { if (id && id !== OWNER && typeof name === 'string' && name.trim()) known.set(String(id), name); };
  if (rec.author) put(rec.author.id, rec.author.name);
  for (const m of Array.isArray(rec.mentions) ? rec.mentions : []) if (m) put(m.id, m.name);
  if (rec.raw && rec.raw.member) put(rec.raw.member, rec.raw.name);
  return known;
}
