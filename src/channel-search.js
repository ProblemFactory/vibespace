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
 *   not declared → not-supported · the scope not held → needs-scope · the endpoint backing off → backoff ·
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
};
