// THE IM-FIRST PANEL'S ARITHMETIC (design-communication-panel.zh.md §22, the
// owner's clarification of 2026-09-22 — "the first screen is the GROUP LIST, a
// simple IM"; chunk g3). DOM-free and word-free: every function returns
// STRUCTURE and the two client surfaces (channels-panel.js, channel-window.js)
// say the words with the device's own `t`. The only import is the PURE group
// model, so the group namespace, the notify modes and the owner's actor id are
// spelled ONCE (src/channel-groups.js) and never again here.
//
// What lives here, one rule each:
//   groupListRows   — the first screen: every agent group + every TRACKED
//                     conversation of a non-built-in source, sorted by last
//                     activity; archived groups apart. An untracked external
//                     conversation has no history to show, so it stays in the
//                     Accounts section (its Track verb lives there).
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
//                     own `mentionsIn` — one spelling of what an @ is).
//   foldsFrom       — the panel's secondary sections' persisted folds.
import { GROUP_ADAPTER_ID, NOTIFY_MODES, DEFAULT_NOTIFY, OWNER, mentionsIn } from '../channel-groups.js';

export { GROUP_ADAPTER_ID, NOTIFY_MODES, DEFAULT_NOTIFY, OWNER };

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
 * A conversation joins the list only when it is TRACKED and its adapter is not
 * the built-in one (the built-in Agents adapter lists live SESSIONS as sources
 * — the owner's "message watcher", a secondary section, §22.1).
 */
export function groupListRows({ groups = [], conversations = [], adapters = [] } = {}) {
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
  for (const c of conversations || []) {
    if (!c || !c.tracked) continue;
    const a = adapterById.get(c.adapterId);
    if (!a || a.builtin) continue;
    rows.push({
      kind: 'conv', key: `${c.adapterId}/${c.id}`, adapterId: c.adapterId, id: c.id,
      title: c.title || c.id, lastAt: num(c.lastAt), lastText: c.lastText || '',
      unread: num(c.unread), sourceLabel: c.adapterLabel || a.label || a.id,
      mail: c.kind === 'thread' || c.kind === 'mailbox', conv: c,
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
 *   'untracked'  nothing fetched, nothing known
 *   'readonly'   `why` = the capability row's reason
 */
export function composerMode({ group = null, conv = null } = {}) {
  if (group) return group.archivedAt ? { mode: 'archived' } : { mode: 'group' };
  if (!conv) return { mode: 'readonly', why: 'unknown' };
  const o = conv.offers || {};
  const u = o.sendAsUser || {}, b = o.sendAsBot || {};
  if (u.offered) return { mode: 'direct' };
  if (b.offered) return { mode: 'propose', why: u.why || 'unknown' };
  if (!conv.tracked) return { mode: 'untracked' };
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
export function wakePreview(group, text) {
  if (!group || group.archivedAt || !String(text || '').trim()) return [];
  const members = (group.members || []).map((m) => ({ member: m.member, name: m.name || null, notify: m.notify }));
  const named = new Set(mentionsIn(text, members).map((x) => x.id));
  const out = [];
  for (const m of members) {
    if (m.member === OWNER || m.notify === 'mute') continue;
    if (named.has(m.member)) out.push({ member: m.member, name: m.name || m.member, why: 'mention' });
    else if (m.notify === 'always') out.push({ member: m.member, name: m.name || m.member, why: 'always' });
  }
  return out;
}
