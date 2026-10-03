'use strict';
/**
 * A MESSAGE'S PLACE IN ITS CONVERSATION — PURE (lane channel-threads,
 * 2026-09-28; the owner: "我发现你似乎不支持 lark 的内嵌回复 (thread) 功能 …
 * 这俩功能对未来接入 slack/telegram 都很重要").
 *
 * Imports only src/channel-record.js (PURE → PURE). CJS so the bundle (the
 * window, the thread pane), the engine (the read shape, the agent's text) and
 * the suites share ONE spelling of every rule. No adapter id, no vendor
 * payload, no clock: a vendor's thread fields were normalized by its adapter
 * into the record's three PLACE fields — `replyTo` (the message this one
 * answers), `threadKey` (the thread it belongs to), `root` (the thread's root
 * message when the vendor names one) — and everything here is DERIVED from
 * those, never stored (design §5 invariant 7: a derived value never becomes a
 * stored fact).
 *
 * THE RULES (each pinned by scripts/test-channel-thread.mjs with a fixture and
 * a patched copy):
 *  T1 a record with a parent but no thread (Telegram; an older record) sits in
 *     the CHAIN keyed by its topmost known ancestor; a parent not loaded keys
 *     the chain by the parent id itself (count 1, root null — "not loaded").
 *  T2 the root is never a reply; a record whose vendorId IS the key is the
 *     root by identity; a vendor thread's root is the record the members name
 *     as `root`, else the EARLIEST record with no parent — ties by
 *     `(at, vendorId)`, the store's own order.
 *  T3 `count` counts DISTINCT vendorIds (a page and its replayed boundary).
 *  T4 a thread of one (a topic-group message nobody answered yet) is in the
 *     index with count 0 — no chip, but "Reply in thread" still targets it.
 *  T5 a VENDOR's count (a Slack parent's `reply_count`, carried by a side
 *     record) merges as the max — the root's own stored line is stale by
 *     construction on an append-only log and is never read for stats.
 *  T6 the index is O(n) and walks at most THREAD_HOPS_MAX parents per record;
 *     a cycle in peer-written ids terminates and keys by the smaller id.
 *  T7 `placeOf` = the row's two facts: the QUOTE of what it answers and its
 *     THREAD (root or member).
 *  T8 `paneMode(width)`: a thread opens as a SIDE pane on a desktop and a
 *     PUSHED (stacked) view on a phone — never an inline expansion (the
 *     list's paging machine assumes every row is a message at its place).
 */
const { inertFrameLine } = require('./channel-record.js');

/** Replies an index entry lists in `replies` — the NEWEST ones, in oldest-first order (the count is exact past it;
 *  the full list rides the entry as the non-enumerable `all`, never served). verify r2 (MONEY): the entry kept the
 *  OLDEST 500 — the thread walk's anchor (`replies[last]`) became the 500th-oldest reply of a big thread, so every
 *  walk paged from the newest back to it (a Lark walk: 4 calls at its 200-record bound instead of 1, every pane beat),
 *  and the pane's newest page ended at reply 500 (the newest replies were never shown, nor read by an agent). */
const THREAD_REPLIES_MAX = 500;
/** Parents walked per record before a chain is keyed where it stands. */
const THREAD_HOPS_MAX = 64;
/** Participants remembered per thread (by first appearance, the root's author first). */
const THREAD_PARTICIPANTS_MAX = 8;
/** The quote line's text (the parent's first line). */
const QUOTE_MAX = 120;
/** The agent's quote (its read shows structure as text). */
const AGENT_QUOTE_MAX = 80;
/** Below this width a thread is a pushed view (the inbox window's rule). */
const PANE_NARROW_PX = 620;
const THREAD_KINDS = Object.freeze(['vendor', 'chain', 'conversation']);

const at = (r) => Number(r && r.at) || 0;
const vid = (r) => String((r && r.vendorId) || '');
/** The store's total order `(at, vendorId)` — never a timestamp alone. */
function cmpRecord(a, b) {
  const d = at(a) - at(b);
  if (d) return d;
  const x = vid(a), y = vid(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

/**
 * The chain key of a record that names a parent but no thread (T1, T6): walk
 * `replyTo` while the parent is loaded — a parent that DECLARES a thread hands
 * its thread over — at most THREAD_HOPS_MAX hops; the topmost loaded ancestor
 * keys the chain; an immediate parent that is not loaded keys it by its own
 * id. A cycle keys by the smallest id on it. `memo` makes the whole index O(n).
 */
function chainKeyOf(rec, byId, memo = new Map()) {
  const start = vid(rec);
  if (memo.has(start)) return memo.get(start);
  const path = [];
  const onPath = new Set();
  let cur = rec;
  let key = null;
  for (let hop = 0; hop <= THREAD_HOPS_MAX; hop++) {
    const id = vid(cur);
    if (memo.has(id)) { key = memo.get(id); break; }
    if (onPath.has(id)) {   // a cycle in peer-written ids: key by the smallest id ON the cycle
      const cyc = path.slice(path.indexOf(id));
      key = cyc.slice().sort()[0];
      break;
    }
    onPath.add(id);
    path.push(id);
    if (cur !== rec && cur.threadKey) { key = String(cur.threadKey); break; }   // an ancestor that declares a thread hands it over
    const parentId = cur.replyTo ? String(cur.replyTo) : null;
    if (!parentId) { key = id; break; }               // the topmost loaded ancestor
    const parent = byId.get(parentId);
    if (!parent) { key = parentId; break; }           // T1: a parent not loaded keys the chain by its own id
    if (hop === THREAD_HOPS_MAX) { key = id; break; } // T6: the hop bound — keyed where it stands
    cur = parent;
  }
  for (const id of path) if (!memo.has(id)) memo.set(id, key);
  return key;
}

/** The thread key of ONE record: its declared thread, else its chain (T1), else none. */
function keyOfRecord(rec, byId, memo) {
  if (!rec) return null;
  if (rec.threadKey) return String(rec.threadKey);
  if (rec.replyTo) return chainKeyOf(rec, byId, memo);
  return null;
}

/**
 * THE THREAD INDEX over ONE conversation's records (any order, duplicates
 * allowed): `Map<threadKey, {key, kind, root, rootAt, replies, count, lastAt,
 * participants}>` + `byRecord` (vendorId → the key it sits under). `convId`
 * names the conversation (a thread keyed by it IS the conversation — a mail
 * thread — and is kind `conversation`, which the window draws nothing for).
 */
function threadIndex(records, { convId = null } = {}) {
  const list = (Array.isArray(records) ? records : []).filter((r) => r && vid(r));
  const byId = new Map();
  for (const r of list) if (!byId.has(vid(r))) byId.set(vid(r), r);
  const memo = new Map();
  const members = new Map();   // key -> Map<vendorId, record>
  const byRecord = new Map();
  for (const r of byId.values()) {
    const k = keyOfRecord(r, byId, memo);
    if (!k) continue;
    byRecord.set(vid(r), k);
    if (!members.has(k)) members.set(k, new Map());
    members.get(k).set(vid(r), r);
  }
  // a record whose vendorId IS a key is that thread's root by identity (T2) — it joins its own thread
  for (const k of members.keys()) {
    const self = byId.get(k);
    if (self && !members.get(k).has(k)) { members.get(k).set(k, self); if (!byRecord.has(k)) byRecord.set(k, k); }
  }
  const out = new Map();
  for (const [k, m] of members) {
    const recs = [...m.values()].sort(cmpRecord);
    const kind = kindOf(k, recs, byId, convId);
    const root = rootOf(k, recs, byId, kind);
    const replies = recs.filter((r) => vid(r) !== root);
    const rootRec = root ? byId.get(root) : null;
    const parts = [];
    const seenP = new Set();
    const addP = (a) => {
      if (!a || parts.length >= THREAD_PARTICIPANTS_MAX) return;
      const id = String(a.id || a.name || '');
      if (!id || seenP.has(id)) return;
      seenP.add(id);
      parts.push({ id: String(a.id || ''), name: String(a.display || a.name || '') });
    };
    if (rootRec) addP(rootRec.author);
    for (const r of replies) { if (parts.length >= THREAD_PARTICIPANTS_MAX) break; addP(r.author); }
    const all = replies.map(vid);
    const entry = {
      key: k, kind, root: root || null, rootAt: rootRec ? at(rootRec) : null,
      replies: all.length > THREAD_REPLIES_MAX ? all.slice(all.length - THREAD_REPLIES_MAX) : all,
      count: replies.length,
      lastAt: replies.length ? at(replies[replies.length - 1]) : null,
      participants: parts,
    };
    // every reply id, oldest first — the pane's paging and the place rules read it; never enumerated (never served)
    Object.defineProperty(entry, 'all', { value: all, enumerable: false });
    out.set(k, entry);
    if (root && !byRecord.has(root)) byRecord.set(root, k);
  }
  // A TOPIC WINS ITS ROOT (quote-vs-topic, 2026-09-28): a message a topic's members name as their root sits under that
  // topic even when it also sits in a reply chain — a quote later answered with `reply_in_thread` heads a topic now
  // (the vendor mints the thread ON it; its own stored line, written before, carries no thread id). Chain counts are
  // unchanged (the chain's members are its members); only where the root's OWN place is read from moves.
  for (const e of out.values()) {
    if (e.kind !== 'vendor' || !e.root) continue;
    const prev = byRecord.get(e.root);
    const pe = prev ? out.get(prev) : null;
    if (!pe || pe.kind === 'chain') byRecord.set(e.root, e.key);
  }
  return { threads: out, byRecord, byId };
}

/** vendor | chain | conversation (never stored — derived per read). */
function kindOf(key, recs, byId, convId) {
  if (convId && key === String(convId)) return 'conversation';
  const self = byId.get(key);
  if (self) return self.threadKey && String(self.threadKey) === key ? 'vendor' : 'chain';   // a Slack parent declares its own ts; a Lark root_id chain's root declares nothing
  if (recs.some((r) => (r.root && String(r.root) === key) || (r.replyTo && String(r.replyTo) === key))) return 'chain';   // the key names a message (not loaded)
  return 'vendor';
}

/** T2 — the root of one thread, or null ("root not loaded"). */
function rootOf(key, recs, byId, kind) {
  if (kind === 'conversation') return null;
  if (byId.has(key)) return key;                          // by identity
  if (kind === 'chain') return null;                      // a chain's root IS its key — not loaded
  for (const r of recs) if (r.root && byId.has(String(r.root))) return String(r.root);   // the vendor named it
  const first = recs.find((r) => !r.replyTo);             // the earliest with no parent (recs are in store order)
  return first ? vid(first) : null;
}

/** T5 — a vendor's stats merged into the local ones (max; a stale vendor stat changes nothing). */
function mergeThreadStats(local, vendor) {
  const l = local || { count: 0, lastAt: null, participants: [] };
  const v = vendor && typeof vendor === 'object' ? vendor : null;
  if (!v) return { ...l };
  const vLast = Number(v.lastAt) || 0;
  const lLast = Number(l.lastAt) || 0;
  if (lLast && vLast && vLast < lLast) return { ...l };
  const parts = (l.participants || []).slice(0, THREAD_PARTICIPANTS_MAX);
  const ids = new Set(parts.map((p) => p.id));
  for (const u of Array.isArray(v.replyUsers) ? v.replyUsers : []) {
    if (parts.length >= THREAD_PARTICIPANTS_MAX) break;
    const id = String(u || '');
    if (id && !ids.has(id)) { ids.add(id); parts.push({ id, name: '' }); }
  }
  return { ...l, count: Math.max(Number(l.count) || 0, Number(v.count) || 0), lastAt: Math.max(lLast, vLast) || null, participants: parts };
}

/**
 * WHAT ONE MESSAGE IS — THE ONE CLASSIFIER (owner ruling 2026-09-28, "都是": "a Lark QUOTE reply is a quote, not a
 * thread"). The naive-user pass saw an approved "quoted reply (stays in the chat)" drawn "in thread" once it was sent:
 * the placement rules judged "inside a thread" by the index's `vendor` kind while the render drew a thread fact for
 * EVERY index entry, the reply CHAIN included — two rules for one question. Now there is one:
 *   plain        answers nothing and heads no topic
 *   quote        answers a message WITHOUT a thread id — a Lark `reply` without `reply_in_thread` (`parent_id` +
 *                `root_id` only), a Telegram `reply_to_message`, a reply to a message in another chat: it stays in the
 *                main list with the quoted original above it; no topic tag, no pane
 *   topic-root   heads a real TOPIC — a vendor thread (a Lark `thread_id`: a topic group's message, a message answered
 *                with `reply_in_thread`; a Slack parent) — its chip opens the pane
 *   topic-reply  inside a topic, answering its root (or nothing)
 *   topic-quote  inside a topic, answering ANOTHER message of it (a quote INSIDE a topic — the pane draws the quote)
 * A TOPIC is an index entry of kind `vendor` (the vendor's own thread object); a `chain` (reply links, folded locally)
 * is never one; a `conversation` (a mail thread) is the conversation itself. `recOrId` is a record, or a vendor id —
 * the engine's placement verdict asks about the message a reply answers, loaded or not (not loaded ⇒ judged by the
 * index alone: outside a topic unless a topic's members name it). Read by `placeOf` (the window's strip / chip / tag,
 * the agent's words), the engine's placement verdict (PL3 / PL5: "is the parent inside a thread") and the engine's
 * thread read + walk (a quote has no thread to read or load) — so the card's promise and the list's tag cannot
 * disagree again. → {kind, topic: the topic's key | null, quotes: the vendor id it answers | null, external}.
 */
const PLACE_KINDS = Object.freeze(['plain', 'quote', 'topic-root', 'topic-reply', 'topic-quote']);
const EMPTY_IX = Object.freeze({ threads: new Map(), byRecord: new Map(), byId: new Map() });
/** The TOPIC (a vendor thread's index entry) a vendor id sits in — as its root or a member — else null. */
function topicOf(ix, id) {
  const idx = ix || EMPTY_IX;
  const k = idx.byRecord.get(String(id || ''));
  const e = k ? idx.threads.get(k) : null;
  return e && e.kind === 'vendor' ? e : null;
}
function placeKindOf(recOrId, ix) {
  const idx = ix || EMPTY_IX;
  const rec = recOrId && typeof recOrId === 'object' ? recOrId : (idx.byId.get(String(recOrId || '')) || { vendorId: String(recOrId || '') });
  const id = vid(rec);
  const external = !rec.replyTo && !!(rec.raw && rec.raw.externalReply && typeof rec.raw.externalReply === 'object');
  const quotes = rec.replyTo ? String(rec.replyTo) : null;
  const topic = id ? topicOf(idx, id) : null;
  if (topic) {
    if (topic.root === id) return { kind: 'topic-root', topic: topic.key, quotes, external };
    // the topic's root: the index's, else the one the record names (a root older than the log)
    const rootId = topic.root || (rec.root ? String(rec.root) : null);
    return { kind: quotes && quotes !== rootId ? 'topic-quote' : 'topic-reply', topic: topic.key, quotes, external };
  }
  if (quotes || external) return { kind: 'quote', topic: null, quotes, external };
  return { kind: 'plain', topic: null, quotes: null, external: false };
}

/** The first line of a text, cut at `max` characters (the quote's words). */
function firstLine(text, max) {
  const s = String(text == null ? '' : text);
  const nl = s.indexOf('\n');
  const line = (nl >= 0 ? s.slice(0, nl) : s).trim();
  return line.length > max ? line.slice(0, max - 1) + '…' : line;
}

/**
 * T7 — the row's facts, computed once per render FROM THE ONE CLASSIFIER (`placeKindOf`): its `kind`, what it
 * ANSWERS (the quote — every reply draws its quoted original) and the TOPIC it is in (as its root or a member) —
 * a thread fact ONLY for a topic: a quote (a reply chain) carries none, so it gets no chip, no tag and opens no
 * pane; a mail thread (kind `conversation`) draws nothing new. A reply whose parent is in another chat
 * (`raw.externalReply`) quotes "a message in another chat".
 */
function placeOf(rec, ix) {
  if (!rec) return { kind: 'plain', quote: null, thread: null };
  const idx = ix || EMPTY_IX;
  const c = placeKindOf(rec, idx);
  let quote = null;
  if (c.quotes) {
    const p = idx.byId.get(c.quotes);
    quote = p
      ? { of: c.quotes, author: String((p.author && (p.author.display || p.author.name || p.author.id)) || ''), text: firstLine(p.text, QUOTE_MAX), loaded: true }   // lane lark-threads: the head as the owner reads it
      : { of: c.quotes, author: '', text: '', loaded: false };
  } else if (c.external) {
    quote = { of: null, author: '', text: '', loaded: false, external: true };
  }
  let thread = null;
  const e = c.topic ? idx.threads.get(c.topic) : null;
  if (e) thread = { key: e.key, count: e.count, lastAt: e.lastAt, isRoot: c.kind === 'topic-root', kind: e.kind, root: e.root };
  return { kind: c.kind, quote, thread };
}

/**
 * ONE THREAD'S VIEW (the pane's list): the root (when loaded) + its replies
 * oldest-first, the replies paged strictly BEFORE `before` ({at, vendorId})
 * by the store's order; `exhausted` = nothing older in this set.
 */
function threadView(records, key, { limit = 50, before = null, convId = null } = {}) {
  const ix = threadIndex(records, { convId });
  const e = ix.threads.get(String(key)) || null;
  if (!e) return { thread: null, records: [], exhausted: true };
  const n = Math.max(1, Math.min(500, Number(limit) || 50));
  // the WHOLE reply list (verify r2): the first page is the newest replies, and paging back reaches the first one
  let replies = (e.all || e.replies).map((id) => ix.byId.get(id)).filter(Boolean);
  if (before && Number(before.at) >= 0) replies = replies.filter((r) => cmpRecord(r, { at: Number(before.at), vendorId: before.vendorId || '' }) < 0);
  const page = replies.slice(-n);
  const root = e.root ? ix.byId.get(e.root) : null;
  return { thread: e, records: [...(root && !before ? [root] : []), ...page], exhausted: page.length === replies.length };
}

/** T8 — a side pane beside the list, or a pushed view over it. */
function paneMode(width) { return Number(width) < PANE_NARROW_PX ? 'stacked' : 'side'; }

/** "5 min ago" for the agent's text (the window words ages with the client's own t). */
function agoText(ms, now) {
  const d = Math.max(0, Math.round(((Number(now) || 0) - (Number(ms) || 0)) / 1000));
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.round(d / 60)} min ago`;
  if (d < 86400) return `${Math.round(d / 3600)} h ago`;
  return `${Math.round(d / 86400)} d ago`;
}

/**
 * WHAT AN AGENT READS about a record's place (§1.8 — structure as text), by the classifier's kind: a topic root's tag
 * `[thread <key> · N replies · last …]`; a QUOTE's line `↳ quotes <author>: "<quote>" (id …)` (`↳ quotes a message not
 * loaded (id …)`, `↳ quotes a message in another chat`) — never "in thread" (owner 2026-09-28: a quote is a quote);
 * a topic reply's `↳ replying to <author>: "<quote>" (id …) · in thread <key>`, a quote inside a topic
 * `↳ quotes … · in thread <key>`. Every line frame-inert (a quote is a stranger's words; a key is a vendor's id).
 */
function agentPlaceLine(place, { now = 0 } = {}) {
  const p = place || {};
  const out = { tag: null, line: null };
  const t = p.thread;
  if (t && t.isRoot && t.count > 0) out.tag = inertFrameLine(`[thread ${t.key} · ${t.count} ${t.count === 1 ? 'reply' : 'replies'}${t.lastAt ? ` · last ${agoText(t.lastAt, now)}` : ''}]`);
  const q = p.quote;
  if (q) {
    const where = t && !t.isRoot ? ` · in thread ${t.key}` : '';
    // a topic reply ANSWERS inside its topic; everything else that names a parent QUOTES it
    const verb = p.kind === 'topic-reply' ? 'replying to' : 'quotes';
    if (q.external) out.line = inertFrameLine(`↳ ${verb} a message in another chat${where}`);
    else if (q.loaded) {
      const words = firstLine(q.text, AGENT_QUOTE_MAX).replace(/"/g, '”');
      out.line = inertFrameLine(`↳ ${verb} ${q.author || 'someone'}: "${words}" (id ${q.of})${where}`);
    } else out.line = inertFrameLine(`↳ ${verb} a message not loaded (id ${q.of})${where}`);
  } else if (t && !t.isRoot) out.line = inertFrameLine(`↳ in thread ${t.key}`);
  return out;
}


// ── lane lark-threads (A1, 2026-10-01): THE PLACE PATCH — widen-only ──────────────────────────────────────────
// The owner's post: a Lark message stored BEFORE anyone answered it in a thread carries no thread id (the vendor names a
// topic on its root only once the topic exists — "不返回说明该消息不是话题形式的消息"), and the append-only log keeps that
// first copy for ever (dedup by vendorId). A LATER vendor copy that names the thread (the chat listing re-read, the thread
// walk's repeated root, a by-id read) WIDENS the stored record's place through the store's ONE door — a side line
// (`{k:'pl', msg, threadKey, root}`) folded at read and into the log at its trim. These are the rules, PURE:
//   P1 widen only: `threadKey` null → the vendor's key; `root` null → the vendor's root — never a key replaced, never
//      a field emptied, never any other field;
//   P2 makeRecord's own place rules hold: a root equal to the message itself is no root (R1), and a root with neither a
//      thread nor a parent is a contradiction — dropped (R2);
//   P3 several patches of one message fold in FILE order, each field's FIRST value winning (a replayed or racing second
//      patch is a no-op, never a flip);
//   P4 an id is bounded like the record's (≤ 512, no control character) — a hostile key is no key.
const PLACE_ID_MAX = 512;
/** A place id the patch may write (P4): a non-empty string ≤ 512 with no control character. */
const placeIdOk = (v) => typeof v === 'string' && v.length > 0 && v.length <= PLACE_ID_MAX && !/[\u0000-\u001f\u007f]/.test(v);
/**
 * THE VERDICT (P1, P2, P4): `cur` = the stored place `{threadKey, root, replyTo}`, `offer` = the vendor's `{threadKey,
 * root}`, `vendorId` = the message. → `{threadKey|null, root|null}` (only the fields it WIDENS) | null (nothing to widen).
 */
function widenPlace(cur, offer, vendorId) {
  const c = cur && typeof cur === 'object' ? cur : {};
  const o = offer && typeof offer === 'object' ? offer : {};
  const id = String(vendorId || '');
  const tk = !c.threadKey && placeIdOk(o.threadKey) ? o.threadKey : null;
  const hasPlace = !!(c.threadKey || tk || c.replyTo);   // R2: a root needs a thread or a parent
  const rt = !c.root && placeIdOk(o.root) && o.root !== id && hasPlace ? o.root : null;
  return tk || rt ? { threadKey: tk, root: rt } : null;
}
/** P3: a conversation's place lines (`{k:'pl', msg, threadKey, root}`, file order) → Map<vendorId, {threadKey, root}>. */
function foldPlaces(lines) {
  const out = new Map();
  for (const x of Array.isArray(lines) ? lines : []) {
    if (!x || x.k !== 'pl' || !placeIdOk(x.msg)) continue;
    const cur = out.get(x.msg) || { threadKey: null, root: null };
    // each field's FIRST value wins; R2 (a root needs a thread or a parent) is judged against the record at apply
    out.set(x.msg, {
      threadKey: cur.threadKey || (placeIdOk(x.threadKey) ? x.threadKey : null),
      root: cur.root || (placeIdOk(x.root) && x.root !== x.msg ? x.root : null),
    });
  }
  return out;
}
/** A stored record as its patches make it (P1, P2): a NEW object only when something widened — never mutated. */
function applyPlace(rec, p) {
  if (!rec || !p || typeof rec !== 'object') return rec;
  const w = widenPlace({ threadKey: rec.threadKey || null, root: rec.root || null, replyTo: rec.replyTo || null }, p, rec.vendorId);
  if (!w) return rec;
  const out = { ...rec };
  if (w.threadKey) out.threadKey = w.threadKey;
  if (w.root && (out.threadKey || out.replyTo)) out.root = w.root;
  return out;
}
/** The compaction's rule for place lines: one line per message (the folded place, its first instant), the newest `max`. */
function compactPlaces(lines, max = 3000) {
  const first = new Map();
  for (const x of Array.isArray(lines) ? lines : []) if (x && x.k === 'pl' && placeIdOk(x.msg) && !first.has(x.msg)) first.set(x.msg, x);
  const folded = foldPlaces(lines);
  const out = [];
  for (const [msg, pl] of folded) { if (!pl.threadKey && !pl.root) continue; const f = first.get(msg); out.push({ k: 'pl', msg, at: Number(f && f.at) || 1, src: (f && f.src) || 'history', threadKey: pl.threadKey, root: pl.root }); }
  out.sort((a, b) => a.at - b.at);
  return out.length > max ? out.slice(out.length - max) : out;
}

module.exports = {
  THREAD_REPLIES_MAX, THREAD_HOPS_MAX, THREAD_PARTICIPANTS_MAX, QUOTE_MAX, AGENT_QUOTE_MAX, PANE_NARROW_PX, THREAD_KINDS, PLACE_KINDS,
  cmpRecord, chainKeyOf, keyOfRecord, threadIndex, mergeThreadStats, topicOf, placeKindOf, placeOf, threadView, paneMode, firstLine, agentPlaceLine, agoText,
  // lane lark-threads (A1): the place patch — widen-only
  PLACE_ID_MAX, placeIdOk, widenPlace, foldPlaces, applyPlace, compactPlaces,
};
