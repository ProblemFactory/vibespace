/**
 * user-todos-layout.js — PURE (imports nothing, DOM-free): the "For you"
 * popup's row ORDER while it is open.
 *
 * inc-mtw02kbq-kj96 (owner, 2026-09-10): "inbox里点击对勾后改变了这个对话的
 * 消息数量会导致位置变化，当我想连续点击时造成误点". Every ✓ triggers a
 * `user-todos-updated` broadcast, the popup re-rendered from scratch, the
 * resolved row LEFT its group, and the rows below slid up under the pointer —
 * four rapid clicks at one screen position resolved four different items.
 *
 * Rule: while the popup is open its layout is APPEND-ONLY. A row keeps its
 * slot until the popup closes: resolved in place (dimmed, with ↺), never
 * removed; a group whose rows are all resolved keeps its slot too; new rows
 * append at the END of their group and a new group at the END of the list.
 * The ordinary sorted layout is rebuilt on the next open.
 *
 *   openLayout(sortedGroups)      — from the panel's own sorted [[key, items]]
 *   nextLayout(layout, todos)     — after a broadcast: keep, append, purge
 *   entriesFor(layout, todos)     — [{key, entries:[{item, resolved}], openCount}]
 *
 * design-user-inbox-reply (2026-09-23, chunk 2) adds the two LIVE projections
 * the panel draws on its keyed rows (the only import: the PURE verdict the
 * reply route itself runs, so client and server word a refusal identically):
 *   liveDotState(fact)            — the group head's running dot
 *   replyButtonState(item, fact)  — the reply button: {show, enabled, why, code}
 * and chunk 3 the per-window MINI INBOX (the title-bar badge + its popover):
 *   inboxBadgeFor(open, keys)     — {count, urgency} of one session's open asks
 *   miniInboxEntries(layout, todos, keys) — that session's rows, append-only
 * and chunk 4 the FLOOD FOLD of one group (owner: "agent经常大量发inbox"):
 *   foldGroup(entries, {max, expanded, prev}) — {visible, hidden}
 * `fact` = the panel's projection of ONE active-sessions payload row
 * `{live, mode, remoteState, turn}` (null = the session is not in the list).
 *
 * B-328d (2026-09-24, owner: the spend notices were buried) — NOTICES BY
 * ORIGIN and the tab counts (the closed producer set is src/inbox-origin.js):
 *   originOf(item)                 — the item's declared origin, else THE legacy rung
 *   noticeGroups(notices, filter, {prev}) — one group per origin, fixed order, append-only while open
 *   noticeChips(notices, {prev})   — the filter strip: `all` (total open) + one chip per present origin
 *   noticeFilterFor(filter, notices) — the filter IN FORCE: `filter` while its origin has a notice, else `all`
 *                                    (the panel HOLDS this value — r2: never re-derives a stored choice)
 *   tabCounts(open, history, seenTs) — {inbox:{action, notice, urgency}, history:{unread}}
 */
import { replyVerdict, REPLY_HIDDEN_CODES } from '../inbox-reply.js';
import { INBOX_ORIGINS, ORIGIN_LABELS } from '../inbox-origin.js';

/** @param {Array<[string, Array<{id:string}>]>} sortedGroups */
export function openLayout(sortedGroups) {
  return { groups: sortedGroups.map(([key, items]) => ({ key, ids: items.map((i) => i.id) })) };
}

/**
 * Keep every id still known to the store (open OR resolved) in its slot;
 * append open ids the layout has not seen; drop ids the store no longer has.
 * @param {{groups:Array<{key:string, ids:string[]}>}} layout
 * @param {{open:Array<{id:string, sessionKey:string}>, resolved:Array<{id:string}>}} todos
 */
export function nextLayout(layout, todos) {
  const open = new Map((todos.open || []).map((i) => [i.id, i]));
  const known = new Set([...open.keys(), ...(todos.resolved || []).map((i) => i.id)]);
  const seen = new Set();
  const groups = layout.groups.map((g) => ({ key: g.key, ids: g.ids.filter((id) => { const keep = known.has(id); if (keep) seen.add(id); return keep; }) }));
  for (const i of todos.open || []) {
    if (seen.has(i.id)) continue;
    let g = groups.find((x) => x.key === i.sessionKey);
    if (!g) { g = { key: i.sessionKey, ids: [] }; groups.push(g); }
    g.ids.push(i.id); seen.add(i.id);
  }
  return { groups };
}

/** 2.369.118 (owner: spend notices are DISTRACTING beside real asks): a row is a
 *  NOTICE when its item SAYS so (`kind: 'notice'`, a producer's declaration —
 *  spend-guard, `vibespace-ask --notice`; never inferred from the text). Notices
 *  leave their session group for the popup's own Notices section and never
 *  count in the red badge — a grey count says "n things you may want to know". */
export function isNotice(item) { return !!item && item.kind === 'notice'; }

/** Split rendered rows ([key, entries, openCount]) into the action groups (their
 *  openCount recomputed over action rows only) and a flat notice list that keeps
 *  each entry's group key (for the source name). Order is preserved on both sides. */
export function splitNotices(rows) {
  const action = [], notices = [];
  for (const [key, entries] of rows || []) {
    const act = (entries || []).filter((e) => !isNotice(e.item));
    const not = (entries || []).filter((e) => isNotice(e.item));
    if (act.length) action.push([key, act, act.filter((e) => !e.resolved).length]);
    for (const e of not) notices.push({ key, ...e });
  }
  return { action, notices };
}

/** The badge's numbers: `action` = the open items that need the user (the red/
 *  yellow/accent segments), `notices` = the grey count. */
export function badgeCounts(open) {
  const action = (open || []).filter((i) => !isNotice(i));
  return { action, notices: (open || []).length - action.length };
}

/** Rows to render, in layout order, each marked resolved when it left `open`. */
export function entriesFor(layout, todos) {
  const open = new Map((todos.open || []).map((i) => [i.id, i]));
  const resolved = new Map((todos.resolved || []).map((i) => [i.id, i]));
  return layout.groups.map((g) => {
    const entries = g.ids.map((id) => open.has(id) ? { item: open.get(id), resolved: false } : { item: resolved.get(id), resolved: true }).filter((e) => e.item);
    return { key: g.key, entries, openCount: entries.filter((e) => !e.resolved).length };
  });
}

/** The running dot's tooltip sentences (English = the t() keys the panel words). */
export const LIVE_DOT_WHY = Object.freeze({
  running: 'running (mid-turn)',
  idle: 'running, idle',
  waiting: 'waiting for you',
  unreachable: 'host unreachable',
  off: 'not running',
});

/** design-user-inbox-reply D1.7: the group head's dot. `off` = not in the live
 *  list; `unreachable` = the host is gone (it beats the turn — a remote turn
 *  we cannot see is not "running"); else the payload's `turn` column —
 *  `waiting` (the harness's own requires_action: paused on the user),
 *  `running` (mid-turn), anything else `idle` (an older server without the
 *  column never paints a false "running"). A terminal session keeps its dot. */
export function liveDotState(fact) {
  if (!fact || fact.live === false) return 'off';
  if (fact.remoteState) return 'unreachable';
  if (fact.turn === 'waiting') return 'waiting';
  if (fact.turn === 'running') return 'running';
  return 'idle';
}

/** design-user-inbox-reply D1.5: the reply button = THE verdict (src/inbox-reply.js
 *  replyVerdict, the same function the route gates on) fed this client's
 *  projection of the payload row. `show:false` = the item has no reply surface
 *  at all (a server producer's key / a job item: the button is not drawn);
 *  `enabled:false` = drawn disabled, `why` its tooltip (an English t() key). */
export function replyButtonState(item, fact) {
  const session = fact ? { live: fact.live !== false, mode: fact.mode || 'terminal', remoteState: fact.remoteState || null } : null;
  const v = replyVerdict({ item, session });
  if (v.ok) return { show: true, enabled: true, why: '', code: null };
  return { show: !REPLY_HIDDEN_CODES.includes(v.code), enabled: false, why: v.why, code: v.code };
}

const URGENCY_ORDER = ['low', 'normal', 'high', 'urgent'];

/** design-user-inbox-reply §3 (chunk 3): a chat window's TITLE-BAR badge —
 *  the open ACTION items (notices excluded, badgeCounts semantics) whose
 *  sessionKey is one of `keys` (a window answers for its `<backend>:<id>` key
 *  AND the `webui:<id>` key an early item was filed under), and the worst
 *  urgency among them. `{count: 0, urgency: ''}` = no badge. */
export function inboxBadgeFor(open, keys) {
  const ks = new Set(keys || []);
  let count = 0, worst = -1;
  for (const i of open || []) {
    if (!i || isNotice(i) || !ks.has(i.sessionKey)) continue;
    count++;
    worst = Math.max(worst, URGENCY_ORDER.indexOf(i.urgency || 'normal'));
  }
  return { count, urgency: count ? (URGENCY_ORDER[worst] || 'normal') : '' };
}

/** The MINI INBOX's rows (one session's popover off its title-bar badge): the
 *  store narrowed to `keys`, laid out by THE SAME append-only rules as the
 *  panel (openLayout on open, nextLayout on every broadcast — a row resolved
 *  while the popover is open keeps its slot). `layout` null = a fresh open.
 *  Returns the next layout and the flat entries, each marked `notice`. */
export function miniInboxEntries(layout, todos, keys) {
  const ks = new Set(keys || []);
  const sub = {
    open: ((todos && todos.open) || []).filter((i) => ks.has(i.sessionKey)),
    resolved: ((todos && todos.resolved) || []).filter((i) => ks.has(i.sessionKey)),
  };
  const next = layout ? nextLayout(layout, sub) : openLayout([['mini', sub.open]]);
  const entries = entriesFor(next, sub).flatMap((g) => g.entries).map((e) => ({ ...e, notice: isNotice(e.item) }));
  return { layout: next, entries };
}

/** design-user-inbox-reply §4 d (chunk 4): how many OPEN rows a group shows
 *  before the rest fold behind a "{n} more…" expander. */
export const FOLD_MAX = 5;

/** THE FLOOD FOLD of one group's entries (layout order — the store sorts newest
 *  first within an urgency tier, so the first open rows ARE the newest).
 *  More than `max` OPEN rows and not `expanded` ⇒ `visible` = every row up to
 *  and including the max-th open row (a row resolved in place among them keeps
 *  its slot), `hidden` = the rest; otherwise everything is visible. Folding only
 *  HIDES — `visible` keeps layout order, so nothing moves.
 *  `prev` = `{shown:Set<id>, hidden:Set<id>}` of the last paint while the popup
 *  is open (null on the first): the slot law (inc-mtw02kbq-kj96) applied to the
 *  fold — a row the user could see is never hidden again (a ↺ above it must not
 *  pull it from under the pointer), and a row resolved while hidden stays hidden
 *  (“Mark all seen” on a folded group must not flood 25 struck rows out below).
 *  An arrival appends at the group's end (nextLayout) and so joins the fold. */
export function foldGroup(entries, { max = FOLD_MAX, expanded = false, prev = null } = {}) {
  const list = entries || [];
  if (expanded) return { visible: list.slice(), hidden: [] };
  let cut = list.length; // rows [0, cut) are inside the base fold
  let open = 0;
  for (let k = 0; k < list.length; k++) {
    if (list[k].resolved) continue;
    if (++open === max) cut = k + 1;
  }
  if (open <= max) cut = list.length;
  const visible = [], hidden = [];
  list.forEach((e, k) => {
    const id = e.item && e.item.id;
    const show = (prev && prev.shown && prev.shown.has(id))
      || (k < cut && !(prev && prev.hidden && prev.hidden.has(id) && e.resolved));
    (show ? visible : hidden).push(e);
  });
  return { visible, hidden };
}

// ── NOTICES BY ORIGIN (B-328d) ──────────────────────────────────────────────
// The owner expected a third tab for the spend notices and found them buried.
// Decision: no Spending tab — the Notices area groups by the PRODUCER that
// filed each notice (a closed set, src/inbox-origin.js) behind filter chips,
// and the tab labels carry counts. Per-DEVICE state, like the language:
export const NOTICE_FILTER_KEY = 'vibespace.ut-notice-filter'; // localStorage: 'all' | an origin
export const HISTORY_SEEN_KEY = 'vibespace.ut-history-seen';   // localStorage: ms of the last look at the Notifications tab
export { INBOX_ORIGINS, ORIGIN_LABELS };

/** WHO FILED IT. A declared `origin` (a member of the closed set) is the
 *  answer. Otherwise THE LEGACY RUNG — items filed before B-328d carry no
 *  origin and are classified here, at READ time (no migration): sessionName
 *  'Spending' (the name spend-guard's one fileInbox froze on every item) ⇒
 *  spend; 'Channels' (channels-engine's) ⇒ channels; anything else ⇒ agent
 *  (every other legacy producer filed ACTIONS, which the Notices area never
 *  lists). Written once for the items already on disk and NEVER EXTENDED: a
 *  new producer declares its origin at its add() call (the store refuses one
 *  that does not). An origin outside the set (a newer server's) reads through
 *  the same rung. r2: a fourth row (`by: 'system'` ⇒ system) was dropped —
 *  nothing has ever filed with `by: 'system'`. */
export function originOf(item) {
  if (!item) return 'agent';
  if (typeof item.origin === 'string' && INBOX_ORIGINS.includes(item.origin)) return item.origin;
  if (item.sessionName === 'Spending') return 'spend';
  if (item.sessionName === 'Channels') return 'channels';
  return 'agent';
}

/** The origins present among `notices`, in display order: the closed set's
 *  order on a fresh open; while the popup is open (`prev` = the origins the
 *  last paint listed) a group KEEPS its slot and a new origin APPENDS at the
 *  end — the slot law (inc-mtw02kbq-kj96) applied to the groups, so a notice
 *  from a new producer never pushes the rows below it out from under the pointer. */
function originOrder(present, prev) {
  if (!Array.isArray(prev) || !prev.length) return INBOX_ORIGINS.filter((o) => present.has(o));
  const out = prev.filter((o, k) => present.has(o) && prev.indexOf(o) === k);
  for (const o of INBOX_ORIGINS) if (present.has(o) && !out.includes(o)) out.push(o);
  return out;
}

const bucket = (notices) => {
  const by = new Map();
  for (const e of notices || []) {
    if (!e || !e.item) continue;
    const o = originOf(e.item);
    if (!by.has(o)) by.set(o, []);
    by.get(o).push(e);
  }
  return by;
};

/** The filter IN FORCE: `filter` when its origin has a notice in the list,
 *  else `all` — a chip that is not drawn cannot hold the list empty.
 *  THE PANEL HOLDS THE ANSWER (r2): it feeds its held filter through this on
 *  every paint once the store has loaded and, when the answer differs, the
 *  answer BECOMES the filter (held + stored per device). So the filter in force
 *  is always a chip that is drawn, and a notice ARRIVING never changes what is
 *  shown: an "All" strip stays All when a notice of a formerly chosen origin
 *  lands (r1 left the stored value alone and a broadcast silently re-applied it
 *  — every other group vanished under an active All chip with no click, the
 *  inc-mtw02kbq-kj96 class at group granularity). Only a chip click chooses. */
export function noticeFilterFor(filter, notices) {
  if (!filter || filter === 'all') return 'all';
  return bucket(notices).has(filter) ? filter : 'all';
}

/** THE NOTICES AREA: `notices` = the panel's notice entries (`{item, resolved}`
 *  in layout order) → one group per origin present:
 *  `{origin, label, entries, open, total, shown}` — `label` the English t() key,
 *  `open` the unresolved count, `total` every row (a row resolved in place keeps
 *  its slot), `shown` = the filter admits it. EVERY present group is returned
 *  (the panel HIDES a filtered-out group — a reply box in it keeps its node);
 *  entries keep layout order, so grouping never moves a row within its group. */
export function noticeGroups(notices, filter = 'all', { prev = null } = {}) {
  const by = bucket(notices);
  const f = noticeFilterFor(filter, notices);
  return originOrder(new Set(by.keys()), prev).map((origin) => {
    const entries = by.get(origin);
    const open = entries.filter((e) => !e.resolved).length;
    return { origin, label: ORIGIN_LABELS[origin] || origin, entries, open, total: entries.length, shown: f === 'all' || f === origin };
  });
}

/** THE FILTER STRIP: `all` first (the total OPEN notices), then one chip per
 *  origin PRESENT in the notices (an origin whose notices were all resolved in
 *  place while the popup is open keeps its chip at 0 — its rows are still
 *  there), in the groups' order, each with its open count. */
export function noticeChips(notices, { prev = null } = {}) {
  const groups = noticeGroups(notices, 'all', { prev });
  return [{ origin: 'all', label: 'All', count: groups.reduce((a, g) => a + g.open, 0) },
    ...groups.map((g) => ({ origin: g.origin, label: g.label, count: g.open }))];
}

/** THE TAB COUNTS. `inbox.action` = the open ACTION items (badgeCounts — the
 *  same number the taskbar badge shows) with `urgency` their worst (the pill
 *  takes that tier's colour), `inbox.notice` = the open notices (the grey
 *  count); `history.unread` = the toast-history entries (`{ts}`) newer than
 *  `lastSeenTs` — the last time the Notifications tab was shown on this device
 *  (null/garbage = never: everything counts; the panel stamps the key at
 *  install so an upgrade does not open on a hundred). */
export function tabCounts(open, toastHistory, lastSeenTs) {
  const { action, notices } = badgeCounts(open);
  let worst = -1;
  for (const i of action) worst = Math.max(worst, URGENCY_ORDER.indexOf(i.urgency || 'normal'));
  const seen = Number(lastSeenTs);
  const since = Number.isFinite(seen) ? seen : 0;
  const unread = (Array.isArray(toastHistory) ? toastHistory : []).filter((e) => e && typeof e.ts === 'number' && e.ts > since).length;
  return { inbox: { action: action.length, notice: notices, urgency: action.length ? (URGENCY_ORDER[worst] || 'normal') : '' }, history: { unread } };
}
