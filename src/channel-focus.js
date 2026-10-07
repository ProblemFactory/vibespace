'use strict';
// THE FIRST SCREEN LISTS WHAT MATTERS (design-communication-panel.zh.md §23 R3,
// the owner 2026-09-26 on the aggregated-IM release — "879 个群 · 0 条未读":
// "开头不要把所有消息都放进来，很多是没用的，建议只放重要消息/conversation（比如
// 推送给agent了的，或者某个agent刚刚读取了的），并展示一个小tag表示状态。").
//
// PURE — imports NOTHING, DOM-free and word-free (the words are
// channel-words.js' `statusTagParts`, in the device's language). CJS since
// design 008 (B-3cf8) so the ENGINE asks the same predicate the panel draws by
// (the channel-attachments pattern: the engine requires it, the bundle imports
// it, src/lib/channel-focus.js re-exports it). The server
// sends each row's FACTS (`assignment`, `outbox`, `touch` — rowView in
// src/server/channels-engine.js); everything that decides "does this row
// matter, and which ONE tag does it wear" is here, once, so the panel, the
// window-hosted panel and the suites cannot disagree.
//
// A CONVERSATION MATTERS when any of these holds (§23.2):
//   awaiting   an agent's proposal awaits the owner's approval (outbox.awaiting),
//              or a send's outcome is unknown and waits for the owner's check
//   assigned   it is handed to an agent / a Task Group ON ITS OWN (the
//              conversation grain). A pattern or account grain lists it ONLY
//              once that hand-over acted on it: a wake for it was DELIVERED to
//              the agent in the last 24 h (`touch.wake.ok === true`, a lane
//              other than 'none'), or its wake is held (amber) — D4, the
//              integrator's ruling 2026-09-27: handing a whole account (the
//              owner's 824-thread mailbox) to an agent must not put all of it
//              back on the first screen. Otherwise such a row falls through to
//              read / held / replied like any other.
//   read       an agent read it (the agent route's `readFor`) in the last 24 h
//   held       a wake for it is held (hits pending, or the last wake / the
//              last refusal was not delivered) — within the wake ledger's 7 days.
//              A DIGEST watcher's hits wait on the conversation BY DESIGN until
//              its window closes: those are the digest, never "held" (the R3 ×
//              R4 seam, 2.369.191 — `heldPending` reads the row's R4 `watchers`
//              beside the engine's per-principal `touch.pendingFor`)
//   direct     a SINGLE chat (`kind: 'dm'`) with unread messages whose newest is
//              inside the 24 h window (lane lark-search-poll, owner decision 1,
//              2026-09-28: "首屏'要紧'列表里, 别人私聊你、你还没看的消息, 挂'单聊 · N
//              条新消息'标签") — a person wrote to the owner; the feed's catch-up
//              births are READ (unread 0), so day one never floods the list
//   replied    the owner wrote in it in the last 24 h (a message the vendor
//              records as the owner's own, or the owner's send from here)
// and a non-archived AGENT GROUP always does (the owner's explicit act, D1).
//
// ONE TAG PER ROW, first match wins (§23.3):
//   awaiting › unknown › assigned (→ Agent X; amber when its wake is held)
//   › read (Agent X read N min ago) | new-since-read (new since Agent X read)
//   › held › direct › replied
// `read` and `new-since-read` are the SAME fact split by whether anything
// arrived after the read (`lastAt > upTo`), so they never compete.
//
// The window is 24 h (FOCUS_WINDOW_MS) and its edge is EXCLUSIVE: a read
// exactly 24 h old has left the list. `held` uses the wake ledger's own
// 7 days (HELD_WINDOW_MS) — no new setting.

const FOCUS_WINDOW_MS = 24 * 3600e3;
const HELD_WINDOW_MS = 7 * 86400e3;
/** The tag codes, in priority order (the table the suite pins). */
const TAG_ORDER = Object.freeze(['awaiting', 'unknown', 'assigned', 'read', 'new-since-read', 'held', 'direct', 'replied']);

const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);

// lane channel-self-unread (userW inc-muxekkry-clfb 2026-10-07 "发消息在 channel 里面也会被视为一个未读" + B-c91b):
// THE OWNER'S OWN MESSAGE IS READ BY CONSTRUCTION — a record whose author is the account itself (`author.isSelf`,
// stamped by the adapter from the RESOLVED identity, or the id `selfId` names) adds 0 to `unread`, moves the read
// line to its own instant (sending = having read everything up to it, as the vendor apps behave; records AFTER it
// count again), is never "new since read" and never a watch hit. A record whose self-ness is UNKNOWN (no identity
// resolved yet) is counted as before — never a guess. Every counter asks these two (the engine's append sites, the
// store's re-derivation, the watch, statusTag below).
/** Is `r` the account's own message? `author.isSelf === true`, else its author id equals the resolved `selfId`. */
function selfRead(r, selfId = null) {
  const a = r && r.author;
  if (!a || typeof a !== 'object') return false;
  if (a.isSelf === true) return true;
  return typeof selfId === 'string' && selfId !== '' && a.id != null && String(a.id) === selfId;
}
/** The read line after a batch `recs`: `{ readAt, unread, moved }` — `readAt` = the newest self record's instant when
 *  it is past `readAt`; `unread` = the batch's OTHER records past that line; `moved` = the line advanced (the caller
 *  re-derives the row's whole count past it — older unread records before it are read now). */
function readAdvance(readAt, recs, selfId = null) {
  const list = Array.isArray(recs) ? recs : [];
  let line = num(readAt);
  for (const r of list) if (selfRead(r, selfId) && num(r && r.at) > line) line = num(r.at);
  let unread = 0;
  for (const r of list) if (r && !selfRead(r, selfId) && num(r.at) > line) unread++;
  return { readAt: line, unread, moved: line > num(readAt) };
}
const within = (at, now, win) => { const a = num(at); return a > 0 && now - a < win; };

/** A principal's key as the engine spells it (channel-filter's `principalKey`: `kind:id`). */
const pkOf = (p) => (p && p.kind && String(p.id == null ? '' : p.id).trim() ? `${p.kind}:${String(p.id).trim()}` : '');

/**
 * HOW MANY OF THIS CONVERSATION'S PENDING HITS ARE HELD (the R3 × R4 seam,
 * 2.369.191). R4 lets SEVERAL principals watch one conversation, and a
 * `notify:'digest'` watcher's hits wait on the conversation (`pending`,
 * tagged `for` that watcher) until its window closes — that wait IS the
 * digest, not a wake that failed to reach anybody. The engine's `touchView`
 * sends `touch.pendingFor` = `[{p, n, oldest}]` (per principal key; `p: null`
 * = a legacy untagged hit); `watchers` = the row's R4 watcher rows
 * (`{principal, notify, digestMinutes}`). A principal's hits are held unless
 * its watcher is a digest whose window — `oldest` + `digestMinutes`, the edge
 * EXCLUSIVE — is still open. A hit with no watcher row (a legacy one, or a
 * watcher since removed) counts as held. A touch without `pendingFor` (a
 * server before the seam) falls back to the total.
 */
function heldPending(touch, now = Date.now(), watchers = []) {
  if (!touch) return 0;
  const per = Array.isArray(touch.pendingFor) ? touch.pendingFor : null;
  if (!per) return num(touch.pending);
  const byPk = new Map();
  for (const w of Array.isArray(watchers) ? watchers : []) { const k = w && pkOf(w.principal); if (k) byPk.set(k, w); }
  let n = 0;
  for (const e of per) {
    if (!e || num(e.n) <= 0) continue;
    const w = e.p ? byPk.get(String(e.p)) : null;
    const windowMs = w ? Math.max(1, num(w.digestMinutes)) * 60e3 : 0;
    const inWindow = !!(w && w.notify === 'digest' && within(e.oldest, now, windowMs));
    if (!inWindow) n += num(e.n);
  }
  return n;
}

/** Is a wake for this conversation HELD (its hits did not reach the agent)?
 *  `watchers` = the row's R4 watcher rows (a digest's open window is not held). */
function heldOf(touch, now = Date.now(), watchers = []) {
  if (!touch) return false;
  if (heldPending(touch, now, watchers) > 0) return true;
  const w = touch.wake;
  if (w && w.ok === false && w.lane === 'none' && within(w.at, now, HELD_WINDOW_MS)) return true;
  if (within(touch.refusalAt, now, HELD_WINDOW_MS) && (!w || num(touch.refusalAt) > num(w.at))) return true;
  return false;
}

/**
 * THE ONE TAG a first-screen row wears, or `null` (the row does not matter).
 * `row` = a `groupListRows` row (`{kind:'conv', conv}`) or a digest row
 * itself. Returns structure: `{code, name?, kind?, grain?, held?, n?, at?}`.
 */
function statusTag(row, now = Date.now()) {
  if (!row) return null;
  // an AGENT GROUP row of the first screen (`groupListRows`' kind 'group' carries its `group`) wears no tag;
  // a digest row's own `kind` is the conversation's ('group' chat / dm / thread) and never means that
  if (row.kind === 'group' && row.group) return null;
  const c = row.conv || row;
  const touch = c.touch || null;
  const ob = c.outbox || {};
  if (num(ob.awaiting) > 0) return { code: 'awaiting', n: num(ob.awaiting) };
  if (num(ob.unknown) > 0) return { code: 'unknown', n: num(ob.unknown) };
  const held = heldOf(touch, now, c.watchers);
  const a = c.assignment;
  if (a && a.principal && (a.principal.id || a.principal.name)) {
    const grain = a.source || 'conversation';
    // D4 (2026-09-27): a pattern / account grain lists a conversation only once it ACTED on it — a wake
    // DELIVERED to the agent within the window, or a held one; never merely because the scope covers it
    const w = touch && touch.wake;
    const woken = !!(w && w.ok === true && w.lane !== 'none' && within(w.at, now, FOCUS_WINDOW_MS));
    // never a raw id in a tag (r-verify): a principal that arrives without a name is worded by its KIND
    if (grain === 'conversation' || held || woken) return { code: 'assigned', name: a.principal.name || '', kind: a.principal.kind || 'agent', grain, held };
  }
  const rd = touch && touch.read;
  if (rd && within(rd.at, now, FOCUS_WINDOW_MS)) {
    const name = rd.name || '';   // never the raw session id (r-verify): the words say "an agent" for a nameless reader
    const kind = rd.kind || 'agent';
    // lane channel-self-unread: the owner's OWN newest message (`touch.selfAt`) is never news — a row whose newest
    // message is his is read up to it (selfRead / readAdvance above)
    const newsAt = num(c.lastAt) > num(touch.selfAt) ? num(c.lastAt) : 0;
    return newsAt > num(rd.upTo) ? { code: 'new-since-read', name, kind, at: num(rd.at) } : { code: 'read', name, kind, at: num(rd.at) };
  }
  if (held) return { code: 'held', n: heldPending(touch, now, c.watchers) };
  // lane lark-search-poll (owner decision 1): a single chat somebody wrote in and the owner has not read
  // design 012 (Slack S1): an APP's DM (a bot, an integration) is never "somebody wrote to you"
  if (c.kind === 'dm' && !c.app && num(c.unread) > 0 && within(c.lastAt, now, FOCUS_WINDOW_MS)) return { code: 'direct', n: num(c.unread) };
  if (touch && within(touch.selfAt, now, FOCUS_WINDOW_MS)) return { code: 'replied', at: num(touch.selfAt) };
  return null;
}

/** THE ATTENTION LIST: every non-archived agent group + every conversation
 *  row that wears a tag. The order is the input's (`groupListRows` sorts by
 *  activity) — the IM order the owner reads, the same in both views. */
function focusRows(rows, now = Date.now()) {
  return (rows || []).filter((r) => r && (r.kind === 'group' && r.group ? !r.archived : !!statusTag(r, now)));
}

/** The filter box: a case-insensitive substring over what the row SHOWS
 *  (title, source label, last line). Blank = everything. */
function filterRows(rows, q) {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return (rows || []).slice();
  return (rows || []).filter((r) => textMatches([r.title, r.sourceLabel, r.lastText], s));
}

/**
 * THE HEADER's numbers + what the list draws, for one view and one query:
 * `{view, focus, all, shown, moreInAll}` — `focus` / `all` are the two
 * switch counts (the whole lists, never the filtered ones), `shown` the rows
 * to draw, `moreInAll` how many rows OUTSIDE the attention list match the
 * query (the focused view offers them: "{n} more in All").
 */
function firstScreen(rows, { view = 'focus', q = '', now = Date.now() } = {}) {
  const all = rows || [];
  const focus = focusRows(all, now);
  const v = view === 'all' ? 'all' : 'focus';
  const shown = filterRows(v === 'all' ? all : focus, q);
  const moreInAll = v === 'focus' && String(q || '').trim() ? filterRows(all, q).length - shown.length : 0;
  return { view: v, focus: focus.length, all: all.length, shown, moreInAll };
}

// ── THE FIRST READ AND ITS PAGES (design 008, B-3cf8 — userW's first Channels open stalled: GET /api/channels sent
// all ~50 000 rows, 77.5 MB, 1.49 s to first byte). The server now sends what the first screen draws — the attention
// rows, each account's newest rows, the counts — and every other row by key from ONE paged route
// (`GET /api/channels/rows`); the client keeps a keyed row store (src/lib/channel-rows.js). The rules both sides
// page by live here, beside the predicate that decides the attention list on both sides.

/** The first read's and a page's bounds (design 008 §2 "Bounds"). */
const ATTENTION_MAX = 300;   // attention rows in one first read (`attention.cut` = how many more the server counted)
const HEAD_ROWS = 30;        // each account's newest listed rows in the first read (the panel's ACCOUNT_ROWS)
const PAGE_ROWS = 60;        // a page by default (All's "Show more")
const PAGE_MAX = 200;        // a page at most (an account's "Show more"; `keys` per read)
const QUERY_MAX = 100;       // characters of a server-side filter

/**
 * COULD THIS INDEX ENTRY WEAR A TAG? The first read builds a `rowView` only for the rows this answers yes for (and
 * each account's newest), then `statusTag` decides — so it may OVER-include, NEVER miss: a quiet conversation handed
 * to an agent, buried at position 49 000 by `lastAt`, must still be on the first screen (test-channel-rows' property:
 * candidateOf ⊇ statusTag(rowView) ≠ null, row for row, at every window edge). It reads the RAW facts rowView /
 * touchView derive the tag's inputs from — `en` the live index entry, `ob` the viewCtx's outbox count for its key
 * (`{awaiting, unknown, ownSentAt}`) — one clause per tag:
 */
function candidateOf(en, ob, now = Date.now()) {
  if (!en) return false;
  // awaiting / unknown — the outbox's count for the key
  if (ob && (num(ob.awaiting) > 0 || num(ob.unknown) > 0)) return true;
  // assigned, the CONVERSATION grain — the conversation's own rows (convGrainOf reads exactly these three)
  if ((Array.isArray(en.access) && en.access.length) || (Array.isArray(en.watchers) && en.watchers.length) || (en.assignment && en.assignment.principal)) return true;
  // the LAST wake (touchView's `wake`): delivered inside the window (a pattern / account grain that acted) or held
  const wakes = en.stats && Array.isArray(en.stats.wakes) ? en.stats.wakes : null;
  const lw = wakes && wakes.length ? wakes[wakes.length - 1] : null;
  if (lw) {
    const delivered = lw.ok !== false, lane = lw.lane || null;
    if (delivered && lane !== 'none' && within(lw.at, now, FOCUS_WINDOW_MS)) return true;
    if (!delivered && lane === 'none' && within(lw.at, now, HELD_WINDOW_MS)) return true;
  }
  // held — hits pending (a digest watcher's open window over-includes; heldPending decides)
  if (Array.isArray(en.pending) && en.pending.length) return true;
  if (num(en.pendingElided) > 0) return true;
  if (en.pendingElidedBy && typeof en.pendingElidedBy === 'object' && Object.values(en.pendingElidedBy).some((v) => num(v) > 0)) return true;
  // held — the last refusal, newer than the last wake
  const refusalAt = en.stats && en.stats.lastRefusal ? num(en.stats.lastRefusal.at) : 0;
  if (within(refusalAt, now, HELD_WINDOW_MS) && (!lw || refusalAt > num(lw.at))) return true;
  // read / new-since-read — ANY agent read inside the window (touchView keeps the newest)
  for (const r of Array.isArray(en.agentReads) ? en.agentReads : []) if (r && within(r.at, now, FOCUS_WINDOW_MS)) return true;
  // direct — a single chat with unread messages, the newest inside the window
  if (en.kind === 'dm' && !en.app && num(en.unread) > 0 && within(en.lastAt, now, FOCUS_WINDOW_MS)) return true;
  // replied — the owner's own message (a record of theirs, or a send from here)
  return within(en.selfAt, now, FOCUS_WINDOW_MS) || !!(ob && within(ob.ownSentAt, now, FOCUS_WINDOW_MS));
}

/** THE ORDER every page and every list keeps: newest first (`lastAt` desc), then `key` — total, so a cursor is exact. */
function pageOrder(a, b) {
  const d = num(b && b.lastAt) - num(a && a.lastAt);
  if (d) return d;
  const x = String(a && a.key), y = String(b && b.key);
  return x < y ? -1 : x > y ? 1 : 0;
}
/** The cursor AFTER a row (`{lastAt, key}`) — what `before` reads next time. */
function pageCursor(row) { return row ? { lastAt: num(row.lastAt), key: String(row.key) } : null; }
/** Does `row` come after the cursor in pageOrder (a null cursor = the start)? */
function afterCursor(row, before) {
  if (!before) return true;
  const a = num(row && row.lastAt), b = num(before.lastAt);
  return a < b || (a === b && String(row && row.key) > String(before.key));
}

/**
 * ONE PASS selecting the next `limit` items after `before` in pageOrder — never a full sort (a bounded heap; the
 * design measured 6 ms for 60 of 50 000). `at(x)` / `keyOf(x)` read an item's `lastAt` / `key` (the server pages raw
 * index entries), `keep(x)` filters. Answers `{items, next, total}`: `total` = how many pass `keep` (the list's
 * count), `next` = the cursor after the last item when more follow it, else null. Rows that moved ABOVE the cursor
 * between two reads are not read again (the broadcast carried them), so a row is never paged twice.
 */
function selectPage(items, { before = null, limit = PAGE_ROWS, keep = null, at = (x) => x.lastAt, keyOf = (x) => x.key } = {}) {
  const n = Math.max(1, Math.floor(num(limit)) || PAGE_ROWS);
  const bA = before ? num(before.lastAt) : 0, bK = before ? String(before.key) : '';
  const heap = [];   // the kept `n`, a max-heap by pageOrder: heap[0] is the WORST kept
  const cmp = (p, q) => (q.a - p.a) || (p.k < q.k ? -1 : p.k > q.k ? 1 : 0);
  const up = (i) => { while (i > 0) { const j = (i - 1) >> 1; if (cmp(heap[i], heap[j]) <= 0) break; [heap[i], heap[j]] = [heap[j], heap[i]]; i = j; } };
  const down = (i) => { for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && cmp(heap[l], heap[m]) > 0) m = l; if (r < heap.length && cmp(heap[r], heap[m]) > 0) m = r; if (m === i) return; [heap[i], heap[m]] = [heap[m], heap[i]]; i = m; } };
  let total = 0, after = 0;
  for (const x of items) {
    if (!x || (keep && !keep(x))) continue;
    total++;
    const a = num(at(x)), k = String(keyOf(x));
    if (before && !(a < bA || (a === bA && k > bK))) continue;
    after++;
    if (heap.length < n) { heap.push({ x, a, k }); up(heap.length - 1); continue; }
    const w = heap[0];
    if (a > w.a || (a === w.a && k < w.k)) { heap[0] = { x, a, k }; down(0); }
  }
  heap.sort(cmp);
  const last = heap[heap.length - 1];
  return { items: heap.map((e) => e.x), next: after > heap.length && last ? { lastAt: last.a, key: last.k } : null, total };
}

/** A filter's words as the server reads them: trimmed, lower-case; '' = no filter; null = refused (over QUERY_MAX). */
function queryOf(q) {
  const s = String(q == null ? '' : q).trim();
  return s.length > QUERY_MAX ? null : s.toLowerCase();
}
/** THE FILTER'S RULE (filterRows above and the server's `q`): a case-insensitive substring of any shown string. */
function textMatches(fields, s) {
  if (!s) return true;
  for (const f of fields) if (f && String(f).toLowerCase().includes(s)) return true;
  return false;
}

// ── VIBESPACE'S OWN TALK FOLDS (lane channels-badges — the owner, 2026-10-03: "提供一个选项可以把vibespace内部沟通收缩起来，
// 这样避免agent互相沟通内容太多挤占实际沟通空间"). INTERNAL = an agent group (a pair: an agent private chat) or a row
// stamped `internal` (the built-in agents source). The panel draws a list's internal rows as ONE block under a head
// ("VibeSpace internal (N)") at the place of its newest row — every other row keeps the input order. FOLDED (the
// default since lane channels-fold — the owner, 2026-10-03; an unfold is user state `channelsPanelFolds.internal:
// false`, synced to every client) the head alone stands for the block, with the block's unread and @-you counts.
// NOTHING THAT NEEDS THE OWNER FOLDS AWAY: a row that @-mentions the owner (`atYou`) or awaits the owner (the awaiting /
// unknown tags) keeps its OWN row, on top of the list.

/** Is this row VibeSpace's own talk? */
function isInternal(r) { return !!(r && (r.internal === true || (r.kind === 'group' && r.group))); }
/** Does this row need the OWNER (it never folds)? An @ of the owner, or a draft / a send awaiting the owner. */
function needsOwner(r, now = Date.now()) {
  if (!r) return false;
  if (num(r.atYou) > 0) return true;
  const st = statusTag(r, now);
  return !!(st && (st.code === 'awaiting' || st.code === 'unknown'));
}
/**
 * THE INTERNAL BLOCK of a list about to be drawn: `{rows, block}`. `rows` = the list as drawn — ONE
 * `{kind:'internal-head', key, block}` marker where the block stands; unfolded, the block's rows right under it;
 * folded, the rows that need the owner FIRST (in the input order) and the rest of the block gone. `block` =
 * `{n, unread, atYou, pinned, folded}` over EVERY internal row of the list (null: the list holds none).
 */
function internalBlock(rows, { folded = false, now = Date.now() } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const inner = list.filter(isInternal);
  if (!inner.length) return { rows: list.slice(), block: null };
  const pinned = folded ? inner.filter((r) => needsOwner(r, now)) : [];
  const block = {
    n: inner.length, unread: inner.reduce((s, r) => s + num(r.unread), 0), atYou: inner.reduce((s, r) => s + num(r.atYou), 0),
    pinned: pinned.length, folded: !!folded,
  };
  const head = { kind: 'internal-head', key: 'internal-head', block };
  const out = pinned.slice();
  let placed = false;
  for (const r of list) {
    if (!isInternal(r)) { out.push(r); continue; }
    if (placed || pinned.includes(r)) continue;
    placed = true;
    out.push(head);
    if (!folded) out.push(...inner);
  }
  if (!placed) out.splice(pinned.length, 0, head);
  return { rows: out, block };
}

/**
 * lane channels-list-polish (the owner: "整体做的更接近一个聊天工具的列表"): THE PER-ACCOUNT LIST ROW — the attention
 * list's shape: the avatar, the name, the LAST MESSAGE's first line ("author: text" — peer bytes, the client puts them
 * through textContent; bounded), the time, the unread count. The "Access: … · Notify: …" line is shown ONLY when the
 * conversation's own grain DIFFERS from the account's (`assignment.source === 'conversation'`) — worded as that
 * difference; an inherited row says nothing.
 */
const LIST_LAST_MAX = 160;
function listRowModel(conv) {
  const c = conv && typeof conv === 'object' ? conv : {};
  const first = String(c.lastText || '').split(/\r?\n/)[0].replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, LIST_LAST_MAX);
  const w = c.lastWho && typeof c.lastWho === 'object' ? c.lastWho : null;
  const who = !first || !w ? null : w.self ? { self: true } : (typeof w.name === 'string' && w.name.trim() ? { name: w.name.trim().slice(0, 80) } : null);
  const own = !!(c.assignment && c.assignment.source === 'conversation');
  return { last: first, who, at: Number(c.lastAt) || 0, unread: Math.max(0, Number(c.unread) || 0), grainLine: own };
}

module.exports = {
  LIST_LAST_MAX, listRowModel,
  FOCUS_WINDOW_MS, HELD_WINDOW_MS, TAG_ORDER, heldPending, heldOf, statusTag, focusRows, filterRows, firstScreen,
  ATTENTION_MAX, HEAD_ROWS, PAGE_ROWS, PAGE_MAX, QUERY_MAX, candidateOf, pageOrder, pageCursor, afterCursor, selectPage, queryOf, textMatches,
  isInternal, needsOwner, internalBlock,
  selfRead, readAdvance,
};
