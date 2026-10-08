'use strict';
/**
 * CHANNEL SEARCH — THE LOCAL COPY FIRST, THE VENDOR'S FULL HISTORY ON A PRESS (design 010, B-c9be, lane
 * channels-full-search, 2026-10-03; the owner: 「vibespace channel 提供搜索功能吗？…走的是实时 API 的搜索还是 pull 到本地的缓存数据？」).
 *
 * PURE (imports only channel-record, PURE → PURE): the pieces the store, the engine, the adapters, the dialog and the
 * agent CLI share —
 *   snippetOf(displayInfo)      THE ONE READER of a vendor's search snippet: cut to SNIPPET_READ_MAX BEFORE any regex,
 *                               markup stripped, entities decoded, then the NAME door (`peerName`: bidi overrides and
 *                               invisible characters removed, controls folded, complete AND dangling frames neutered,
 *                               whitespace collapsed, ≤ SNIPPET_MAX characters, nothing visible ⇒ null)
 *   snippetShape(displayInfo)   what a snippet IS, never what it says (form, key names, length, markup / entities seen)
 *   mergeVendorHits(hits, …)    a hit the local copy already holds is dropped (it is in section one), a repeat too
 *   coverageOf(r)               the local scan's coverage facts (conversations scanned / total, capped, oldest instant)
 *   fullSearchVerdict(facts)    may the vendor be asked NOW — the refusal table (not declared, scope, back-off, floor,
 *                               the agents' share, the endpoint's minute, the account's budget) with each wait
 *   coverageText / statusText / sectionHead   the dialog's words (the caller's `t`; zh / ja in src/lib/i18n-*.js)
 *   searchMemo(state, ev)       THE MEMO (lane vendor-search-memo, .230): a vendor search is asked ONCE per (account,
 *                               scope, normalized query) and remembered — memoText says its age. Lane search-card-open
 *                               (.233): no TTL (bounded by size / LRU only), an answer fanned per conversation (what one
 *                               searcher found for a conversation answers that conversation), memoToDisk / memoFromDisk
 *                               = the per-account file's PURE round trip
 */
const { peerName } = require('./channel-record.js');

/** The snippet as shown: ≤ 400 characters (the agent line's own bound). */
const SNIPPET_MAX = 400;
/** No regex ever sees more of a vendor's snippet than this (a 1 MB `display_info` is cut first). */
const SNIPPET_READ_MAX = 4000;
/** An OBJECT snippet's text field, in this order (VS2 is measured, not assumed: the shape is recorded on the first press). */
const SNIPPET_KEYS = Object.freeze(['text', 'content', 'snippet', 'body', 'summary', 'title']);
/** `caps.search.via` — how the vendor is asked (a query over the account). */
const SEARCH_VIA = Object.freeze(['query']);
/** `caps.search.context` — how a hit is read in context: the page around its instant, its thread, or not at all. */
const SEARCH_CONTEXT = Object.freeze(['around', 'thread']);
/** `caps.search.match` — how the vendor matches the words (VS3). Only `substring` lets the words say "found". */
const SEARCH_MATCH = Object.freeze(['substring', 'tokens', 'unknown']);
/** `caps.search.adds` — what a hit ADDS to the copy saved here: `older` = the history before the local log (Lark);
 *  `unsaved` = mail the copy never saved — outside the synced scope, or a reply newer than its stored thread (Gmail), so
 *  never "older" (verify r1 F2). The words read this row, never the adapter id. */
const SEARCH_ADDS = Object.freeze(['older', 'unsaved']);
/** The owner's press floor per account (a held Enter key is one ask). */
const OWNER_FLOOR_MS = 2000;
/** An agent's `--full`: one per account per agent conversation per this long (the refresh floor's rule). */
const AGENT_FLOOR_MS = 20000;
/** The "around this message" read: at most this many records (two pages, before and after). */
const AROUND_MAX = 50;
/** A query is bounded before it is sent anywhere. */
const QUERY_MAX = 200;

const ENTITIES = Object.freeze({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" });
const TAG_RE = /<\/?[A-Za-z][^<>]{0,200}>/g;
const ENTITY_RE = /&(amp|lt|gt|quot|apos|nbsp|#39);/g;

function rawSnippet(v) {
  if (typeof v === 'string') return v;
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  for (const k of SNIPPET_KEYS) if (typeof v[k] === 'string') return v[k];
  return null;
}
/** THE ONE SNIPPET READER → the visible words (≤ SNIPPET_MAX) | null. */
function snippetOf(displayInfo) {
  const raw = rawSnippet(displayInfo);
  if (raw === null) return null;
  const cut = raw.slice(0, SNIPPET_READ_MAX);   // THE CUT FIRST — the markup pass is linear in this bound, never in the vendor's size
  return peerName(cut.replace(TAG_RE, '').replace(ENTITY_RE, (m, k) => ENTITIES[k]), SNIPPET_MAX);
}
/** WHAT a snippet is (VS2 — names, a length, two booleans; never a character of it). */
function snippetShape(displayInfo) {
  const v = displayInfo;
  const nameOk = (k) => /^[A-Za-z0-9_.]{1,64}$/.test(k);
  const judge = (s) => { const c = s.slice(0, SNIPPET_READ_MAX); return { markup: /<\/?[A-Za-z][^<>]{0,64}>/.test(c), entities: /&(?:[A-Za-z]{2,8}|#\d{1,7});/.test(c) }; };
  if (v === undefined || v === null) return { form: 'absent', keys: [], length: 0, markup: false, entities: false };
  if (typeof v === 'string') return { form: 'string', keys: [], length: v.length, ...judge(v) };
  if (typeof v === 'object' && !Array.isArray(v)) {
    const keys = Object.keys(v).slice(0, 40).filter(nameOk).slice(0, 12);
    const r = rawSnippet(v);
    return { form: 'object', keys, length: r === null ? 0 : r.length, ...(r === null ? { markup: false, entities: false } : judge(r)) };
  }
  return { form: Array.isArray(v) ? 'array' : typeof v, keys: [], length: 0, markup: false, entities: false };
}
/** Does a snippet hold the query as written (case-insensitive)? — the VS3 measurement's one question, a boolean. */
function holdsQuery(snippet, query) {
  const q = String(query || '').trim().toLowerCase();
  return !!(q && typeof snippet === 'string' && snippet.toLowerCase().includes(q));
}
/** Does a query carry CJK characters (VS3 is a CJK question)? */
function isCjk(query) { return /[぀-ヿ㐀-鿿가-힯豈-﫿]/.test(String(query || '')); }

/**
 * THE MERGE: vendor hits minus what section one already holds. `stored(convId, vendorId, at)` = the engine's answer
 * (the log holds it); `shown` = the keys this press already kept (a repeat across pages). Order kept — rows never move.
 * → { hits, stored: n, repeated: n }
 */
function mergeVendorHits(hits, { stored = () => false, shown = null } = {}) {
  const seen = shown instanceof Set ? shown : new Set();
  const out = [];
  let st = 0, rep = 0;
  for (const h of Array.isArray(hits) ? hits : []) {
    if (!h || !h.convId || !h.vendorId) continue;
    const k = `${h.convId}\u0000${h.vendorId}`;
    if (seen.has(k)) { rep++; continue; }
    seen.add(k);
    if (stored(h.convId, h.vendorId, h.at)) { st++; continue; }
    out.push(h);
  }
  return { hits: out, stored: st, repeated: rep };
}

/** The local scan's COVERAGE, normalized: `{scanned, total, capped, oldestAt}`. */
function coverageOf(r) {
  const c = r && r.coverage && typeof r.coverage === 'object' ? r.coverage : (r || {});
  const n = (x) => Math.max(0, Math.floor(Number(x) || 0));
  return { scanned: n(c.scanned), total: Math.max(n(c.total), n(c.scanned)), capped: c.capped === true, oldestAt: Number(c.oldestAt) > 0 ? Number(c.oldestAt) : null };
}

/**
 * MAY THE VENDOR BE ASKED NOW — the one table, in order (each refusal names its wait):
 *   not declared → not-supported · the scope not held → needs-scope · a remembered answer (`memo`) → memo · a look
 *   that is no press (`peek`) → unasked · the endpoint backing off → backoff ·
 *   a press inside the floor (or one in flight) → search-floor · an agent past its share → vendor-budget ·
 *   the endpoint's sliding minute spent → search-minute · the account's minute budget spent → vendor-budget
 * `pages` = what may be sent: min(asked, the minute's pages left, the budget's units left).
 * → { act: 'ask', pages } | { act: 'refuse', code, retryAfterMs }
 */
function fullSearchVerdict(f = {}) {
  const t = Number(f.now) || 0;
  const wait = (until) => Math.max(1000, Math.ceil(Number(until) - t));
  if (!f.declared) return { act: 'refuse', code: 'not-supported', retryAfterMs: 0 };
  if (f.scopeHeld === false) return { act: 'refuse', code: 'needs-scope', retryAfterMs: 0 };
  // lane vendor-search-memo (.230): a remembered answer costs nothing — before the back-off, the floor, the minute; a
  // look that is not a press (the dialog opening) never asks
  if (f.memo) return { act: 'memo' };
  if (f.peek) return { act: 'unasked' };
  if (Number(f.backoffUntil) > t) return { act: 'refuse', code: 'backoff', retryAfterMs: wait(f.backoffUntil) };
  const floor = Number(f.floorMs) || 0;
  if (f.inflight) return { act: 'refuse', code: 'search-floor', retryAfterMs: Math.max(1000, floor) };
  if (Number(f.lastAt) > 0 && t - Number(f.lastAt) < floor) return { act: 'refuse', code: 'search-floor', retryAfterMs: wait(Number(f.lastAt) + floor) };
  if (f.shareRefused) return { act: 'refuse', code: 'vendor-budget', retryAfterMs: Math.max(1000, (Number(f.shareRetrySec) || 1) * 1000) };
  const minuteLeft = Math.max(0, Math.floor(Number(f.minuteLeft) || 0));
  if (minuteLeft <= 0) return { act: 'refuse', code: 'search-minute', retryAfterMs: wait(f.minuteResetAt) };
  const budgetLeft = Math.max(0, Math.floor(Number(f.budgetLeft) || 0));
  if (budgetLeft <= 0) return { act: 'refuse', code: 'vendor-budget', retryAfterMs: wait(f.budgetResetAt) };
  return { act: 'ask', pages: Math.max(1, Math.min(Math.max(1, Math.floor(Number(f.pages) || 1)), minuteLeft, budgetLeft)) };
}

// ── THE MEMO (lane vendor-search-memo, .230; the owner 2026-10-07: 「调用 channel provider 自己的在线搜索的时候缓存结果，
// 避免重复点开搜索对话框结果就限速了」) ─────────────────────────────────────────────────────────────────────────────
// One per account. Key = (scope, normalized query); an entry = the pages asked so far, each `{token, hits, next}`
// (`hits` = the already-merged, snippet-bearing rows), the first press's instant (`askedAt` — a later page appends, it
// never renews it), who asked (`by`). LRU by Map order.
// Lane search-card-open (.233; the owner 2026-10-07: 「既然 agent 进行了搜索说明 vibespace 已经获取到了相关 data，为啥我点不开？」
// + 「缓存其实不用失效吧，反正搜索结果也只会出现新的而不会更改旧的？而新的都会被我们系统收到？」): NO TTL — a search over
// history only gains newer messages and every newer one lands in the saved copy, so an entry is bounded by size / LRU
// only (the engine persists it per account and drops it with the account's identity). A put FANS its page's hits by
// conversation: a derived entry per conversation (`conv:<id>`, at most SEARCH_MEMO_FAN of them) and — when the searched
// scope covered every conversation of the account (`covers`) — under 'all'; a derived entry has no page token (the
// token belongs to the ORIGINAL scope's next page only), never replaces an original entry, and leaves with its origin.
const SEARCH_MEMO_MAX = 64;
const SEARCH_MEMO_BYTES = 2 * 1024 * 1024;
const MEMO_ALL = 'all';
/** A put derives at most this many conversation entries (the most hits first) — one put never fills the LRU. */
const SEARCH_MEMO_FAN = 16;
/** A conversation's derived scope. */
const memoConv = (convId) => `conv:${String(convId)}`;
/** A scope key the client may hand back (the card's): 'all' or an agent's set hash — nothing else is read off a request. */
const isMemoScope = (s) => typeof s === 'string' && (s === MEMO_ALL || /^set:\d{1,7}:[0-9a-f]{1,8}$/.test(s));
/** The query as remembered: trimmed, case-folded, runs of spaces as one. */
function memoQuery(q) { return String(q || '').trim().toLowerCase().replace(/\s+/g, ' '); }
/** The scope: the owner's = the whole account ('all'); an agent's = the conversations it may be shown (a hash of the
 *  set — its hits were read for those only). */
function memoScope(convIds) {
  if (convIds === null || convIds === undefined || convIds === MEMO_ALL) return MEMO_ALL;
  const ids = [...new Set([...convIds].map(String))].sort();
  let h = 0x811c9dc5;
  for (const ch of ids.join('\u0000')) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return `set:${ids.length}:${h.toString(16)}`;
}
const memoKey = (scope, query) => `${scope || MEMO_ALL}\u0000${memoQuery(query)}`;
const hitsBytes = (hits) => (Array.isArray(hits) ? hits : []).reduce((n, h) => n + JSON.stringify(h || null).length * 2, 0);
/**
 * ONE STEP of an account's memo → { state, answer }. `state` = `{ entries: Map, bytes }` (undefined = empty); a new
 * state each step (the old one untouched).
 *   { op: 'get', scopes, query, page, now }  → answer `{ scope, askedAt, ageMs, hits, next, by, derived }` of the first
 *        scope holding an entry with that page (a hit moves it to the newest); none ⇒ null. No age drops an entry.
 *   { op: 'put', scope, query, page, now, hits, next, by, covers } → page null: the entry (re)born; a token: appended to
 *        the entry whose last page's `next` is that token (else nothing). Then THE FAN (above). An entry over the byte
 *        cap is not kept; the oldest leave first past SEARCH_MEMO_MAX entries or SEARCH_MEMO_BYTES (the one just put
 *        last). → answer = kept (boolean)
 *   { op: 'clear', scope | scopes, query } → those entries gone, with what they derived ("Search again") → answer = had one
 */
function searchMemo(state, ev = {}) {
  const entries = new Map(state && state.entries instanceof Map ? state.entries : []);
  let bytes = Math.max(0, Number(state && state.bytes) || 0);
  const drop = (k) => { const x = entries.get(k); if (x) { bytes -= x.bytes; entries.delete(k); } return !!x; };
  const dropWith = (k) => { let had = drop(k); for (const [dk, x] of [...entries]) if (x.from === k) had = drop(dk) || had; return had; };
  const done = (answer) => ({ state: { entries, bytes: Math.max(0, bytes) }, answer });
  const now = Number(ev.now) || 0;
  const page = ev.page === null || ev.page === undefined || ev.page === '' ? null : String(ev.page);
  const by = ev.by === 'agent' ? 'agent' : 'owner';
  if (ev.op === 'get') {
    for (const scope of Array.isArray(ev.scopes) && ev.scopes.length ? ev.scopes : [MEMO_ALL]) {
      const k = memoKey(scope, ev.query), x = entries.get(k);
      if (!x) continue;
      const p = x.pages.find((pg) => pg.token === page);
      if (!p) continue;
      entries.delete(k); entries.set(k, x);
      return done({ scope: scope || MEMO_ALL, askedAt: x.askedAt, ageMs: Math.max(0, now - x.askedAt), hits: p.hits, next: p.next, by: x.by || 'owner', derived: !!x.from });
    }
    return done(null);
  }
  if (ev.op === 'clear') {
    let had = false;
    for (const scope of Array.isArray(ev.scopes) && ev.scopes.length ? ev.scopes : [ev.scope]) had = dropWith(memoKey(scope, ev.query)) || had;
    return done(had);
  }
  if (ev.op !== 'put') return done(null);
  const scope0 = ev.scope || MEMO_ALL;
  const k = memoKey(scope0, ev.query);
  const pg = { token: page, hits: Array.isArray(ev.hits) ? ev.hits : [], next: ev.next || null };
  const pb = hitsBytes(pg.hits) + 64;
  let x;
  if (page === null) { dropWith(k); x = { askedAt: now, by, pages: [pg], bytes: pb }; }
  else {
    const o = entries.get(k);
    if (!o || o.from || o.pages[o.pages.length - 1].next !== page) return done(false);
    drop(k); x = { askedAt: o.askedAt, by: o.by || by, pages: [...o.pages, pg], bytes: o.bytes + pb };
  }
  if (x.bytes > SEARCH_MEMO_BYTES) return done(false);
  entries.set(k, x); bytes += x.bytes;
  // THE FAN: this page's hits per conversation (the most hits first, ≤ SEARCH_MEMO_FAN), + 'all' when the scope covered
  // every conversation of the account — a derived entry is one page, no token; an original one is never replaced
  const per = new Map();
  for (const h of pg.hits) { const c = h && h.convId !== undefined && h.convId !== null ? String(h.convId) : ''; if (c) { if (!per.has(c)) per.set(c, []); per.get(c).push(h); } }
  const fans = [...per].sort((a, b) => b[1].length - a[1].length).slice(0, SEARCH_MEMO_FAN).map(([c, hs]) => [memoKey(memoConv(c), ev.query), hs]);
  if (ev.covers && scope0 !== MEMO_ALL) fans.push([memoKey(MEMO_ALL, ev.query), pg.hits]);
  for (const [dk, hs] of fans) {
    if (dk === k) continue;
    const cur = entries.get(dk);
    if (cur && !cur.from) continue;   // an own answer (the owner's 'all') outranks anything derived
    let dh = hs;
    if (page !== null) {
      if (cur && cur.from !== k) continue;   // a later page joins only what its own first page derived
      if (cur) { const seen = new Set(cur.pages[0].hits.map((h) => `${h.convId}\u0000${h.vendorId}`)); dh = [...cur.pages[0].hits, ...hs.filter((h) => !seen.has(`${h.convId}\u0000${h.vendorId}`))]; }
    }
    drop(dk);
    const d = { askedAt: x.askedAt, by: x.by, from: k, pages: [{ token: null, hits: dh, next: null }], bytes: hitsBytes(dh) + 64 };
    if (d.bytes > SEARCH_MEMO_BYTES) continue;
    entries.set(dk, d); bytes += d.bytes;
  }
  for (const ok of [...entries.keys()]) { if (entries.size <= SEARCH_MEMO_MAX && bytes <= SEARCH_MEMO_BYTES) break; if (ok !== k) drop(ok); }
  if (entries.size > SEARCH_MEMO_MAX || bytes > SEARCH_MEMO_BYTES) drop(k);
  return done(entries.has(k));
}
/** THE FILE'S SHAPE (the engine writes it atomically beside the account's index rows): `{v: 1, identity, entries:
 *  [[key, entry]…]}` in LRU order — `identity` = whose account answered (a later identity drops the file). */
function memoToDisk(state, identity = null) {
  const out = [];
  for (const [k, x] of state && state.entries instanceof Map ? state.entries : []) out.push([k, { askedAt: x.askedAt, by: x.by || 'owner', ...(x.from ? { from: x.from } : {}), pages: x.pages }]);
  return { v: 1, identity: identity && typeof identity === 'object' ? identity : null, entries: out };
}
/** The file read back → a memo state, every row re-judged (a malformed one is skipped) and the bounds re-applied (the
 *  newest kept); null/garbage ⇒ empty. */
function memoFromDisk(obj) {
  let st = { entries: new Map(), bytes: 0 };
  if (!obj || obj.v !== 1 || !Array.isArray(obj.entries)) return st;
  const entries = new Map();
  let bytes = 0;
  const hitOk = (h) => h && typeof h === 'object' && (typeof h.convId === 'string' || typeof h.convId === 'number') && (typeof h.vendorId === 'string' || typeof h.vendorId === 'number');
  for (const row of obj.entries.slice(-SEARCH_MEMO_MAX * 2)) {
    if (!Array.isArray(row) || typeof row[0] !== 'string' || row[0].length > 4096 || !row[1] || typeof row[1] !== 'object') continue;
    const x = row[1];
    if (!Array.isArray(x.pages) || !x.pages.length || !(Number(x.askedAt) > 0)) continue;
    const pages = x.pages.filter((p) => p && typeof p === 'object' && Array.isArray(p.hits)).map((p) => ({ token: typeof p.token === 'string' ? p.token : null, hits: p.hits.filter(hitOk), next: typeof p.next === 'string' ? p.next : null }));
    if (pages.length !== x.pages.length || pages[0].token !== null) continue;
    const e = { askedAt: Number(x.askedAt), by: x.by === 'agent' ? 'agent' : 'owner', ...(typeof x.from === 'string' ? { from: x.from } : {}), pages: x.from ? [{ ...pages[0], next: null }] : pages, bytes: 0 };
    e.bytes = e.pages.reduce((n, p) => n + hitsBytes(p.hits) + 64, 0);
    if (e.bytes > SEARCH_MEMO_BYTES) continue;
    if (entries.has(row[0])) { bytes -= entries.get(row[0]).bytes; entries.delete(row[0]); }
    entries.set(row[0], e); bytes += e.bytes;
  }
  for (const k of [...entries.keys()]) { if (entries.size <= SEARCH_MEMO_MAX && bytes <= SEARCH_MEMO_BYTES) break; bytes -= entries.get(k).bytes; entries.delete(k); }
  st = { entries, bytes: Math.max(0, bytes) };
  return st;
}

// ── THE WORDS (the dialog's; zh / ja in src/lib/i18n-*.js) ─────────────────
const defaultT = (s, p) => String(s).replace(/\{(\w+)\}/g, (m, k) => (p && p[k] !== undefined ? String(p[k]) : m));
/** Section one's coverage line: how much of the local copy was searched. */
function coverageText(cov, { t = defaultT } = {}) {
  const c = coverageOf(cov);
  if (!c.total) return t('Nothing is saved here for this account yet');
  if (c.capped) return t('Searched the {n} most recently active of {total} conversations saved here', { n: c.scanned, total: c.total });
  return t('Searched the {n} conversations saved here', { n: c.scanned });
}
/**
 * Section two's status line for ONE account. `s` = `{state: 'asking'|'done'|'refused'|'failed', code, retryAfterSec,
 * found, match, adds, error}`; `vendor` = the channel's own name (Lark / Gmail). VS3: only `match: 'substring'` says
 * "found"; `adds` = the row's `caps.search.adds` ('unsaved' says "not saved here", 'older' — or none — "older").
 */
function statusText(s, { t = defaultT, vendor = '' } = {}) {
  const v = s && typeof s === 'object' ? s : {};
  const V = vendor || t('The vendor');
  if (v.state === 'asking') return t("Asking {vendor}'s own search…", { vendor: V });
  if (v.state === 'unasked') return t("Press Search to ask {vendor}'s own search", { vendor: V });
  if (v.state === 'done') {
    const n = Math.max(0, Number(v.found) || 0);
    if (v.adds === 'unsaved') {
      if (!n) return t("Asked {vendor}'s whole mailbox: nothing that is not saved here", { vendor: V });
      return v.match === 'substring' ? t("Asked {vendor}'s whole mailbox: found {n} not saved here", { vendor: V, n }) : t("Asked {vendor}'s whole mailbox: {n} not saved here — may be related", { vendor: V, n });
    }
    if (!n) return t("Asked {vendor}'s whole history: nothing older", { vendor: V });
    return v.match === 'substring' ? t("Asked {vendor}'s whole history: {n} older found", { vendor: V, n }) : t("Asked {vendor}'s whole history: {n} older messages may be related", { vendor: V, n });
  }
  if (v.state === 'refused') {
    const sec = Math.max(1, Number(v.retryAfterSec) || 1);
    if (v.code === 'not-supported') return t('This channel offers no search of its own');
    if (v.code === 'needs-scope') return t('This account has no search permission — available after Re-authorize');
    if (v.code === 'backoff') return t("{vendor} is limiting its search — asked again in {s} s; the saved results are shown", { vendor: V, s: sec });
    if (v.code === 'search-floor') return t("{vendor}'s search was asked a moment ago — asked again in {s} s", { vendor: V, s: sec });
    return t("{vendor}'s search waits {s} s (this minute's allowance is used) — the saved results are shown", { vendor: V, s: sec });
  }
  if (v.state === 'failed') return t("{vendor}'s search did not answer — the saved results are shown", { vendor: V });
  return '';
}
/** A remembered answer's age (lane vendor-search-memo): INFORMATION, never a reason to re-ask (lane search-card-open:
 *  the memo does not expire) — minutes for the first hour, then the day it was asked (`date`, the caller's own words for
 *  `askedAt`); `by: 'agent'` says the agent asked. "Search again" beside it asks anew. */
function memoWhen(ageMs, { t = defaultT, date = '' } = {}) {
  const n = Math.floor(Math.max(0, Number(ageMs) || 0) / 60e3);
  return n < 1 ? t('just now') : n < 60 || !date ? t('{n} min ago', { n }) : String(date);
}
function memoText(ageMs, { t = defaultT, vendor = '', by = 'owner', date = '' } = {}) {
  const V = vendor || t('The vendor');
  const n = Math.floor(Math.max(0, Number(ageMs) || 0) / 60e3);
  if (by === 'agent') return t("From {vendor}'s search ({when}, asked by the agent)", { vendor: V, when: memoWhen(ageMs, { t, date }) });
  if (n >= 60 && date) return t("From {vendor}'s search on {date}", { vendor: V, date: String(date) });
  return n < 1 ? t("From {vendor}'s search less than a minute ago", { vendor: V }) : t("From {vendor}'s search {n} min ago", { vendor: V, n });
}
/** The agent searched, nothing is remembered here (another instance, before .233, or the bound evicted it): said, with
 *  "Search again" beside it — a press, one vendor call. */
function forgottenText(ageMs, { t = defaultT, vendor = '', date = '' } = {}) {
  return t('The agent searched {vendor} {when} — its results are not remembered here', { vendor: vendor || t('The vendor'), when: memoWhen(ageMs, { t, date }) });
}
/** Section two's head from the asked rows' `adds`: "Older messages" only when every row says 'older' (none asked keeps
 *  it); one 'unsaved' row turns it to "Not saved here" — true of an older hit too. */
function sectionHead(adds, { t = defaultT, vendor = '' } = {}) {
  const V = vendor || t('The vendor');
  return (Array.isArray(adds) ? adds : [adds]).some((a) => a === 'unsaved') ? t("Not saved here — from {vendor}'s search", { vendor: V }) : t("Older messages — from {vendor}'s search", { vendor: V });
}

/** A hit's words with the MATCH marked (lane channel-search-view, .212): [{text, hit}] in order — every case-insensitive
 *  occurrence of each searched word (≥ 2 characters; the longer word wins a tie). The caller draws every piece through
 *  textContent (vendor text). A text whose lower case changes its length is returned whole, unmarked. */
function matchParts(text, q) {
  const s = String(text || '');
  const words = [...new Set(String(q || '').toLowerCase().split(/\s+/).filter((w) => w.length >= 2))];
  const low = s.toLowerCase();
  if (!s || !words.length || low.length !== s.length) return s ? [{ text: s, hit: false }] : [];
  const out = [];
  let i = 0;
  while (i < s.length) {
    let at = -1, len = 0;
    for (const w of words) { const k = low.indexOf(w, i); if (k >= 0 && (at < 0 || k < at || (k === at && w.length > len))) { at = k; len = w.length; } }
    if (at < 0) break;
    if (at > i) out.push({ text: s.slice(i, at), hit: false });
    out.push({ text: s.slice(at, at + len), hit: true });
    i = at + len;
  }
  if (i < s.length) out.push({ text: s.slice(i), hit: false });
  return out;
}

module.exports = {
  matchParts,
  SNIPPET_MAX, SNIPPET_READ_MAX, SNIPPET_KEYS, SEARCH_VIA, SEARCH_CONTEXT, SEARCH_MATCH, SEARCH_ADDS, OWNER_FLOOR_MS, AGENT_FLOOR_MS, AROUND_MAX, QUERY_MAX,
  snippetOf, snippetShape, holdsQuery, isCjk, mergeVendorHits, coverageOf, fullSearchVerdict, coverageText, statusText, sectionHead,
  SEARCH_MEMO_MAX, SEARCH_MEMO_BYTES, SEARCH_MEMO_FAN, MEMO_ALL, memoQuery, memoScope, memoConv, isMemoScope, searchMemo, memoToDisk, memoFromDisk,
  memoWhen, memoText, forgottenText,
};
