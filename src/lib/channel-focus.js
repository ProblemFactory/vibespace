// THE FIRST SCREEN LISTS WHAT MATTERS (design-communication-panel.zh.md §23 R3,
// the owner 2026-09-26 on the aggregated-IM release — "879 个群 · 0 条未读":
// "开头不要把所有消息都放进来，很多是没用的，建议只放重要消息/conversation（比如
// 推送给agent了的，或者某个agent刚刚读取了的），并展示一个小tag表示状态。").
//
// PURE — imports NOTHING, DOM-free and word-free (the words are
// channel-words.js' `statusTagParts`, in the device's language). The server
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
//   replied    the owner wrote in it in the last 24 h (a message the vendor
//              records as the owner's own, or the owner's send from here)
// and a non-archived AGENT GROUP always does (the owner's explicit act, D1).
//
// ONE TAG PER ROW, first match wins (§23.3):
//   awaiting › unknown › assigned (→ Agent X; amber when its wake is held)
//   › read (Agent X read N min ago) | new-since-read (new since Agent X read)
//   › held › replied
// `read` and `new-since-read` are the SAME fact split by whether anything
// arrived after the read (`lastAt > upTo`), so they never compete.
//
// The window is 24 h (FOCUS_WINDOW_MS) and its edge is EXCLUSIVE: a read
// exactly 24 h old has left the list. `held` uses the wake ledger's own
// 7 days (HELD_WINDOW_MS) — no new setting.

export const FOCUS_WINDOW_MS = 24 * 3600e3;
export const HELD_WINDOW_MS = 7 * 86400e3;
/** The tag codes, in priority order (the table the suite pins). */
export const TAG_ORDER = Object.freeze(['awaiting', 'unknown', 'assigned', 'read', 'new-since-read', 'held', 'replied']);

const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
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
export function heldPending(touch, now = Date.now(), watchers = []) {
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
export function heldOf(touch, now = Date.now(), watchers = []) {
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
export function statusTag(row, now = Date.now()) {
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
    return num(c.lastAt) > num(rd.upTo) ? { code: 'new-since-read', name, kind, at: num(rd.at) } : { code: 'read', name, kind, at: num(rd.at) };
  }
  if (held) return { code: 'held', n: heldPending(touch, now, c.watchers) };
  if (touch && within(touch.selfAt, now, FOCUS_WINDOW_MS)) return { code: 'replied', at: num(touch.selfAt) };
  return null;
}

/** THE ATTENTION LIST: every non-archived agent group + every conversation
 *  row that wears a tag. The order is the input's (`groupListRows` sorts by
 *  activity) — the IM order the owner reads, the same in both views. */
export function focusRows(rows, now = Date.now()) {
  return (rows || []).filter((r) => r && (r.kind === 'group' && r.group ? !r.archived : !!statusTag(r, now)));
}

/** The filter box: a case-insensitive substring over what the row SHOWS
 *  (title, source label, last line). Blank = everything. */
export function filterRows(rows, q) {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return (rows || []).slice();
  return (rows || []).filter((r) => [r.title, r.sourceLabel, r.lastText].some((x) => String(x || '').toLowerCase().includes(s)));
}

/**
 * THE HEADER's numbers + what the list draws, for one view and one query:
 * `{view, focus, all, shown, moreInAll}` — `focus` / `all` are the two
 * switch counts (the whole lists, never the filtered ones), `shown` the rows
 * to draw, `moreInAll` how many rows OUTSIDE the attention list match the
 * query (the focused view offers them: "{n} more in All").
 */
export function firstScreen(rows, { view = 'focus', q = '', now = Date.now() } = {}) {
  const all = rows || [];
  const focus = focusRows(all, now);
  const v = view === 'all' ? 'all' : 'focus';
  const shown = filterRows(v === 'all' ? all : focus, q);
  const moreInAll = v === 'focus' && String(q || '').trim() ? filterRows(all, q).length - shown.length : 0;
  return { view: v, focus: focus.length, all: all.length, shown, moreInAll };
}
