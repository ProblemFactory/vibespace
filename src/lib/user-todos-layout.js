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
 *   sortGroups(open)              — the open items → the sorted [[key, items]] (2026-09-27: moved
 *                                   out of the panel so the For-you window orders by the same rule)
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
 * and chunk 4 the FLOOD FOLD of one group (owner: "agent经常大量发inbox") — RETIRED by lane foryou-folds: the
 * tray folds BY BAND (bandLayout below; 11 conversations folding 5 each still drew 30 rows)
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
 *
 * lane inbox-decision-group / decision-inbox-rank drew the LLM plugin's three sections here (inboxSections, inboxChip,
 * inboxSectionOf) — RETIRED by lane foryou-folds: the judge only breaks a band-5 tie now (src/decision-model.js
 * inboxPlace / inboxRank read the attention list's band first).
 *
 * lane foryou-plugin-notices (owner 2026-10-19: 「这种插件的提醒最好 pin 在最头部，相当于 urgent 之下的优先级」) — THE PIN:
 *   pluginOf(item)                 — the plugin a reminder belongs to (its declared origin 'plugin' + `plugin`), else null
 *   trayBand(items)                — a group's band: 0 urgent (whoever filed it) · 1 a plugin's reminders · 2 the rest
 * (lane foryou-folds: in the tray the pin is the attention list's — a plugin's reminder heads band 2, right under band 1)
 * sortGroups orders by the band first (urgent groups · plugin groups by their newest item · the rest as before) — the
 * For-you WINDOW's session order.
 *
 * lane foryou-folds (design q-044 decisions 1 2 3 6 — the owner accepted them 2026-10-19): THE TRAY IS THE ATTENTION LIST.
 * The LLM plugin's three sections and the per-session flood fold are gone; the popup draws src/attention-model.js
 * `needsMe` — five bands + 搁置, the first CAP (6) rows on the first screen, the rest folded BY BAND behind
 * 「还有 N 条 — 展开」 (expanded in place), notices out of the list:
 *   rowsOf(open, now)              — the open ACTION items as attention rows (rowOf)
 *   badgeOf(open, now)             — {action: the items in bands 1–4 (the badges count these), notices, open: every action item}
 *   bandLayout(todos, {now, prev, expand, collapse}) — the bands' slots while the popup is open (the slot law: a row keeps its band and
 *                                    place, resolved in place; an arrival appends at its band's end and joins a fold that
 *                                    exists; `expand` shows a band's folded rows in place)
 *   bandEntries(layout, todos)     — [{band, code, name, entries, hidden, openIds, openCount}] — what the panel draws
 *
 * lane foryou-honest (the stress evaluation's P1-1 / P2-4 + the owner's B, 2026-10-25): THE HONEST COUNT — 21 agent questions
 * open and every badge said «Nothing waiting on you» (the badge counted bands 1–4; a plain vibespace-ask is band 5):
 *   openCount(items)               — every open ACTION item, whatever its band — THE number every For-you door says
 *   badgeWords(action, total, t)   — THE badge's sentence over its loud part + the honest count (never «Nothing…» with one open)
 *   sessionMark(open, keys)        — a session row's «needs you · N»: {n, newest}
 *   firstLine(text, max)           — the marker's words (the newest question's first line, cut)
 */
import { replyVerdict, REPLY_HIDDEN_CODES } from '../inbox-reply.js';
import { rowOf, needsMe, placeOf, badgeRows, bandInfo, policyOf } from '../attention-model.js'; // PURE: THE attention list (lane foryou-folds, design q-044) — the tray's bands, cap and folds; `policy` = the owner's (src/attention-model.js settingsPolicy, lane attention-predicate-shared)
import { INBOX_ORIGINS, ORIGIN_LABELS } from '../inbox-origin.js';

/**
 * WHERE THE TRAY IS (lane S3, naive-user study 2: the assistant said "I've
 * filed this on your inbox" and the user did not know where that was). The
 * toast a new item raises names the corner the For-you button sits in ON THIS
 * DEVICE — the button's measured rect, never an assumed layout (customize mode
 * moves it to any bar; on a phone it is in the top nav). → an i18n KEY
 * ('bottom right' | 'bottom left' | 'top right' | 'top left') or null when the
 * button is not on screen.
 * @param {{left:number, top:number, width:number, height:number}|null} rect
 */
export const TRAY_CORNERS = Object.freeze(['bottom right', 'bottom left', 'top right', 'top left']);
export function trayWhere(rect, vw, vh) {
  if (!rect || !(rect.width > 0 || rect.height > 0) || !(vw > 0) || !(vh > 0)) return null;
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
  return `${cy >= vh / 2 ? 'bottom' : 'top'} ${cx >= vw / 2 ? 'right' : 'left'}`;
}

/** The popup's GROUP ORDER on an open (moved verbatim out of the panel's
 *  renderPanel, 2026-09-27, so the For-you window lays its list out by the
 *  SAME rule — design-user-inbox-reply §9): the open items grouped by
 *  sessionKey (store order kept inside a group), Background Work ('jobs')
 *  always last, then the worst urgency first (a missing or `low` urgency ranks
 *  as normal — the panel's `|| 1`, kept), then the newest item first.
 *  → [[key, items]] — openLayout's input. */
const GROUP_URG_RANK = { low: 0, normal: 1, high: 2, urgent: 3 };
export function sortGroups(open) {
  const groups = new Map();
  for (const i of open || []) (groups.get(i.sessionKey) || groups.set(i.sessionKey, []).get(i.sessionKey)).push(i);
  return [...groups.entries()].sort((a, b) => {
    // Background Work is its OWN section, always after session groups
    // (owner report: it read as a weird phantom session mixed in)
    if ((a[0] === 'jobs') !== (b[0] === 'jobs')) return a[0] === 'jobs' ? 1 : -1;
    const newest = (items) => Math.max(...items.map((i) => i.createdAt));
    // THE PIN (lane foryou-plugin-notices): urgent groups first, then each plugin's reminders (the plugin with the newest
    // item first, normal or high — one filed LOW is no pin: lane voice-dictionary-nag), then the rest exactly as before
    const ba = trayBand(a[1]), bb = trayBand(b[1]);
    if (ba !== bb) return ba - bb;
    if (ba === 1) return newest(b[1]) - newest(a[1]);
    const w = (items) => Math.max(...items.map((i) => GROUP_URG_RANK[i.urgency || 'normal'] || 1));
    return (w(b[1]) - w(a[1])) || (newest(b[1]) - newest(a[1]));
  });
}

// ── THE PIN (lane foryou-plugin-notices) ─────────────────────────────────────
/** WHICH PLUGIN a reminder belongs to: the item's DECLARED origin 'plugin' + its `plugin` id (src/user-todos.js refuses a
 *  plugin item that names none, and a plugin that does not declare 'reminders'), else null — never read off a name, a
 *  key or the words. */
export function pluginOf(item) { return item && item.origin === 'plugin' && typeof item.plugin === 'string' && item.plugin ? item.plugin : null; }
/** A group's BAND in the For-you window's session order: 0 = it holds an URGENT item (urgent stays first, whoever filed it), 1 = a plugin's reminders
 *  (one group per plugin — a plugin files under its own id; a reminder filed `low` is none — lane voice-dictionary-nag, the
 *  dictionary suggestion), 2 = everything else. */
export function trayBand(items) {
  const list = (items || []).filter(Boolean);
  if (list.some((i) => (i.urgency || 'normal') === 'urgent')) return 0;
  return list.some((i) => pluginOf(i) && (i.urgency || 'normal') !== 'low') ? 1 : 2;
}
/** THE WHOLE DETAIL THIS CLIENT ALREADY SAW (2026-09-27, the For-you window's
 *  verify round). A snapshot carries a RESOLVED item's detail as a 300-char
 *  preview (`detailTruncated: true` — the store's previewOf), so the item the
 *  reader has OPEN in the window would shrink under them the moment another
 *  client resolves it. `restoreDetails(next, fullById)` puts back every whole
 *  detail this client holds: `fullById` (id → the whole detail) remembers each
 *  non-truncated detail the snapshots carried (and what ensureDetail fetched),
 *  pruned to the ids the snapshot still lists (a purged id must not keep its
 *  8 000 chars for ever); a truncated item whose remembered whole text STARTS
 *  WITH its preview gets it back and drops the flag. Returns {todos, fullById}
 *  — new objects, the inputs untouched; garbage in ⇒ empty lists. */
export function restoreDetails(next, fullById) {
  const src = next && typeof next === 'object' ? next : {};
  const prev = fullById instanceof Map ? fullById : new Map();
  const out = new Map();
  const open = Array.isArray(src.open) ? src.open : [], resolved = Array.isArray(src.resolved) ? src.resolved : [];
  for (const i of [...open, ...resolved]) if (i && typeof i.detail === 'string' && !i.detailTruncated) out.set(i.id, i.detail);
  const fix = (i) => {
    if (!i || !i.detailTruncated) return i;
    const whole = out.get(i.id) || prev.get(i.id);
    if (typeof whole !== 'string' || !whole.startsWith(String(i.detail || ''))) return i;
    out.set(i.id, whole);
    const { detailTruncated, ...rest } = i;
    return { ...rest, detail: whole };
  };
  const todos = { ...src, open: open.map(fix), resolved: resolved.map(fix) };
  const ids = new Set([...todos.open, ...todos.resolved].map((i) => i && i.id));
  for (const id of [...out.keys()]) if (!ids.has(id)) out.delete(id);
  return { todos, fullById: out };
}

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

// ── THE ATTENTION LIST IN THE TRAY (lane foryou-folds, design q-044) ─────────────────────────────────────────────────
/** The open ACTION items as attention rows (src/attention-model.js rowOf; notices stay out of the list). */
export function rowsOf(open, now = 0) { return (open || []).filter((i) => i && !isNotice(i)).map((i) => rowOf(i, now)).filter(Boolean); }
/** THE BADGE (design §2: the For-you badge = bands 1–4, colours unchanged, + the grey notice count): `action` = the open
 *  items in bands 1–4 (never 搁置, never band 5), `notices` = the grey count, `open` = every open action item. */
export function badgeOf(open, now = 0, policy = null) {
  const list = (open || []).filter(Boolean);
  const all = list.filter((i) => !isNotice(i));
  const ids = new Set(badgeRows(rowsOf(all, now), now, policy).map((r) => r.id));   // decision 4: a band switched off counts nowhere
  return { action: all.filter((i) => ids.has(i.id)), notices: list.length - all.length, open: all };
}
// ── THE HONEST COUNT (lane foryou-honest, the stress evaluation's P1-1) ──────────────────────────────────────────────
// THE LAW (kb-design-lessons): a surface that holds the person's open questions COUNTS THEM ALL — every open action item,
// whatever its band (5 «Other questions», 搁置, a band the owner switched off); notices stay their own grey count. The LOUD
// part (the coloured tiers, the blink, the arrival toasts) is still the attention list's bands 1–4; the rest is ONE quiet
// segment, so the number the person reads is the number the tray holds.
/** THE count every For-you door says (the phone's top-bar button, the taskbar button, the tray's Inbox tab and head, the
 *  For-you window's Actions tab, the Duo's bar, a title-bar badge, a session row's marker): the open action items. */
export function openCount(items) { return (items || []).filter((i) => i && !isNotice(i)).length; }
/** THE BADGE'S SENTENCE (the taskbar / nav button's title, the tray's Inbox tab, the window's Actions tab — user-todos-actions
 *  actionWords words it with the device's t): `action` = the loud part (bands 1–4, or every row where no band applies),
 *  `total` = THE honest count. «2 urgent · 1 normal — waiting on you», «… · 18 more, none pressing» when quiet rows wait
 *  too, «21 waiting on you — none pressing» with no loud row, «Nothing waiting on you» ONLY at zero. */
export function badgeWords(action, total, t) {
  const list = action || [];
  const all = Math.max(Number(total) || 0, list.length);
  const quiet = all - list.length;
  if (!list.length) return all ? t('{n} waiting on you — none pressing', { n: all }) : t('Nothing waiting on you');
  const cu = list.filter((i) => i.urgency === 'urgent').length, ch = list.filter((i) => i.urgency === 'high').length, cn = list.length - cu - ch;
  return [cu ? t('{n} urgent', { n: cu }) : '', ch ? t('{n} high', { n: ch }) : '', cn ? t('{n} normal', { n: cn }) : '']
    .filter(Boolean).join(' · ') + ' — ' + t('waiting on you') + (quiet ? ' · ' + t('{n} more, none pressing', { n: quiet }) : '');
}
const askedAt = (i) => Math.max(Number(i && i.createdAt) || 0, Number(i && i.reaskedAt) || 0);
/** «needs you · N» ON A SESSION ROW (P2-4 — the Duo's list column, the phone's drawer, the desktop's sidebar; the owner's
 *  B: the row MARKS, the For-you pane answers): `n` = the honest count of the open action items whose sessionKey is one
 *  of `keys`, `newest` = the one asked last (its first line is the marker's words; its ⤢ road opens the pane on it). */
export function sessionMark(open, keys) {
  const ks = new Set(keys || []);
  const mine = (open || []).filter((i) => i && !isNotice(i) && ks.has(i.sessionKey));
  let newest = null;
  for (const i of mine) if (!newest || askedAt(i) > askedAt(newest)) newest = i;
  return { n: openCount(mine), newest };
}
/** The first non-empty line of `text`, cut at `max` with an ellipsis (a one-line marker; the pane holds the whole). */
export function firstLine(text, max = 120) {
  const s = (String(text || '').split('\n').find((l) => l.trim()) || '').trim();
  return s.length > max ? s.slice(0, Math.max(0, max - 1)).trimEnd() + '…' : s;
}
/** THE BANDS' SLOTS while the popup is open — the slot law (inc-mtw02kbq-kj96) on the attention list. `prev` null = a
 *  fresh open: needsMe's order, the first screen shown, everything after it folded by band (搁置 whole). Afterwards
 *  every id keeps its band and its place (a resolved row stays, dimmed with ↺, while the store still lists it); an
 *  arrival appends at the END of the band its facts place it in, shown when that band folds nothing (band 1 always),
 *  else it joins the fold; `expand` (a band number) shows that band's folded rows IN PLACE. → {bands: [{band, ids}],
 *  shown: Set<id>} — the panel holds it until the popup closes. */
// lane attention-predicate-shared (the owner 2026-10-19 on the .318 tray: 「很容易误触」 — after 展开 the fold left the bar and
// 「全部标为已看」 slid into its spot, so the next tap at the same place marked the whole band seen): THE FOLD IS A TOGGLE that
// keeps its slot for the whole open — `foldable` = the bands that folded rows during this open (their toggle's slot stays
// even when nothing is held back any more), `revealed` = band → the ids its 展开 showed (`collapse` hides exactly those again;
// an arrival shown meanwhile stays shown).
export function bandLayout(todos, { now = 0, prev = null, expand = null, collapse = null, policy = null } = {}) {
  const open = ((todos && todos.open) || []).filter((i) => i && i.id && !isNotice(i));
  if (!prev || !Array.isArray(prev.bands)) {
    const r = needsMe(rowsOf(open, now), now, policy);
    return { bands: r.bands.map((b) => ({ band: b.band, ids: b.rows.map((x) => x.id) })), shown: new Set(r.bands.flatMap((b) => b.shown)), off: r.off, foldable: new Set(r.bands.filter((b) => b.hidden.length).map((b) => b.band)), revealed: new Map() };
  }
  const p = policyOf(policy);
  const known = new Set([...open.map((i) => i.id), ...((todos && todos.resolved) || []).map((i) => i && i.id)]);
  const bands = prev.bands.map((b) => ({ band: b.band, ids: b.ids.filter((id) => known.has(id)) }));
  const shown = new Set([...(prev.shown || [])].filter((id) => known.has(id)));
  const seen = new Set(bands.flatMap((b) => b.ids));
  for (const i of open) {
    if (seen.has(i.id)) continue;
    const band = placeOf(rowOf(i, now), now, policy) || 5;
    let b = bands.find((x) => x.band === band);
    if (!b) { b = { band, ids: [] }; const k = bands.findIndex((x) => x.band > band); if (k < 0) bands.push(b); else bands.splice(k, 0, b); }
    const folding = b.ids.some((id) => !shown.has(id));
    b.ids.push(i.id); seen.add(i.id);
    if (band === 1 || (!folding && !(band === 5 && p.off.has(5)))) shown.add(i.id); // band 1 never folds; an arrival joins a fold that exists, never opens one (band 5 switched off: always behind its fold)
  }
  const foldable = new Set(prev.foldable || []);
  const revealed = new Map(prev.revealed || []);
  for (const b of bands) if (b.ids.some((id) => !shown.has(id))) foldable.add(b.band);
  if (expand !== null && expand !== undefined) {
    const b = bands.find((x) => x.band === Number(expand));
    if (b) { const added = b.ids.filter((id) => !shown.has(id)); for (const id of added) shown.add(id); revealed.set(b.band, [...(revealed.get(b.band) || []), ...added]); }
  }
  if (collapse !== null && collapse !== undefined) { for (const id of revealed.get(Number(collapse)) || []) shown.delete(id); revealed.delete(Number(collapse)); }
  return { bands: bands.filter((b) => b.ids.length), shown, off: prev.off || [], foldable, revealed };
}
/** What the panel draws, band by band in order: `entries` = the shown rows ({item, resolved}, layout order), `hidden` =
 *  how many OPEN rows the band's fold holds back (the head's N), `openIds` = every open row of the band, folded ones
 *  included (「全部标为已看」 acts on the band), `openCount` = their number. */
export function bandEntries(layout, todos) {
  const open = new Map(((todos && todos.open) || []).map((i) => [i.id, i]));
  const resolved = new Map(((todos && todos.resolved) || []).map((i) => [i.id, i]));
  const shown = (layout && layout.shown) || new Set();
  return ((layout && layout.bands) || []).map((b) => {
    const info = bandInfo(b.band) || { code: 'ask', name: '' };
    const all = b.ids.map((id) => (open.has(id) ? { item: open.get(id), resolved: false } : resolved.has(id) ? { item: resolved.get(id), resolved: true } : null)).filter(Boolean);
    const openIds = all.filter((e) => !e.resolved).map((e) => e.item.id);
    // lane attention-predicate-shared: `foldable` (the toggle keeps its slot) and `expanded` (the toggle reads 「收起」)
    return { band: b.band, code: info.code, name: info.name, entries: all.filter((e) => shown.has(e.item.id)), hidden: all.filter((e) => !e.resolved && !shown.has(e.item.id)).length, openIds, openCount: openIds.length,
      foldable: !!(layout.foldable && layout.foldable.has(b.band)), expanded: !!(layout.revealed && layout.revealed.has(b.band)) };
  });
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
  live: 'running (a terminal — its turns are not tracked)',
  waiting: 'waiting for you',
  unreachable: 'host unreachable',
  off: 'not running',
});

/** design-user-inbox-reply D1.7: the group head's dot. `off` = not in the live
 *  list; `unreachable` = the host is gone (it beats the turn — a remote turn
 *  we cannot see is not "running"); else the payload's `turn` column —
 *  `waiting` (the harness's own requires_action: paused on the user),
 *  `running` (mid-turn), anything else `idle` (an older server without the
 *  column never paints a false "running"). A terminal session (no turn facts)
 *  is `live` — running, its turns not tracked (B-3f5d ④), never "idle". */
export function liveDotState(fact) {
  if (!fact || fact.live === false) return 'off';
  if (fact.remoteState) return 'unreachable';
  // B-3f5d ④: a TERMINAL session never publishes a turn (src/server/turn-facts.js turnKnown) — it read "running, idle"
  // whatever it was doing; its dot says it runs and that its turns are not tracked
  if (fact.mode && fact.mode !== 'chat') return 'live';
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
export function inboxBadgeFor(open, keys, now = null, policy = null) {
  const ks = new Set(keys || []);
  const mine = (open || []).filter((i) => i && !isNotice(i) && ks.has(i.sessionKey));
  // lane foryou-folds: given `now`, the COLOUR is that session's rows in bands 1–4 (the attention list's loud rule); lane
  // foryou-honest: the NUMBER is every open action item of it (openCount — a band-5 ask waits too; the row's «needs you · N»
  // says the same number) — a count with no loud row is `quiet` (outlined, never a colour)
  const loud = now === null ? null : new Set(badgeOf(mine, now, policy).action.map((i) => i.id));
  let worst = -1;
  for (const i of mine) if (!loud || loud.has(i.id)) worst = Math.max(worst, URGENCY_ORDER.indexOf(i.urgency || 'normal'));
  const count = openCount(mine);
  return { count, urgency: count ? (worst >= 0 ? URGENCY_ORDER[worst] || 'normal' : 'quiet') : '' };
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

/** «MARK ALL READ» (lane inbox-fyi-mark-all, the owner 2026-10-22: 「既然是仅供知晓还让我一个一个确认很弱智」): the ids
 *  ONE press covers — every OPEN notice the surface lists under `filter` ('all', or the origin section in force; a
 *  filtered-out group is hidden, so none of its rows), in list order, each once. A row resolved in place, an item whose
 *  status already left 'open' (a broadcast ahead of the slot) and a non-notice are never in it. `[]` = the button is
 *  disabled. The For-you window hands its scoped + text-filtered list with 'all'; the popup and the phone page their
 *  notices with the chip in force while the notices are open (closed, the head counts them ALL — the press covers that). */
export function noticeReadAll(notices, filter = 'all') {
  const ids = new Set();
  for (const g of noticeGroups(notices, filter)) {
    if (!g.shown) continue;
    for (const e of g.entries) if (e && !e.resolved && isNotice(e.item) && (e.item.status || 'open') === 'open' && e.item.id) ids.add(e.item.id);
  }
  return [...ids];
}

/** THE TAB COUNTS. `inbox.action` = the open ACTION items (badgeCounts — the
 *  same number the taskbar badge shows) with `urgency` their worst (the pill
 *  takes that tier's colour), `inbox.notice` = the open notices (the grey
 *  count); `history.unread` = the toast-history entries (`{ts}`) newer than
 *  `lastSeenTs` that were not `seen` at show time (B-3f5d ①: the user's own feedback) — the last time the Notifications tab was shown on this device
 *  (null/garbage = never: everything counts; the panel stamps the key at
 *  install so an upgrade does not open on a hundred). */
export function tabCounts(open, toastHistory, lastSeenTs, now = null, policy = null) {
  // lane foryou-folds: given `now` (the popup), the COLOUR is the badge's loud rows (bands 1–4); the For-you window (no `now`)
  // colours by every open action item in its scope. lane foryou-honest: the NUMBER is THE honest count (openCount) on both —
  // the popup's Inbox tab says the badge's own number, a count with no loud row is `quiet`
  const { action, notices } = now === null ? badgeCounts(open) : badgeOf(open, now, policy);
  const total = openCount(open);
  let worst = -1;
  for (const i of action) worst = Math.max(worst, URGENCY_ORDER.indexOf(i.urgency || 'normal'));
  const seen = Number(lastSeenTs);
  const since = Number.isFinite(seen) ? seen : 0;
  // B-3f5d ①: an entry recorded `seen` (shown while the user acted — their own "Copied", "Reply sent") is not unread
  const unread = (Array.isArray(toastHistory) ? toastHistory : []).filter((e) => e && typeof e.ts === 'number' && e.ts > since && !e.seen).length;
  return { inbox: { action: total, notice: notices, urgency: total ? (worst >= 0 ? URGENCY_ORDER[worst] || 'normal' : 'quiet') : '' }, history: { unread } };
}
