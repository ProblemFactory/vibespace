// THE PANEL'S ROWS, KEYED (design 008, B-3cf8 — userW's first Channels open stalled: the panel read ALL ≈ 50 000
// conversations, 77.5 MB, and re-sorted every one on each partial broadcast). The server sends the first screen only
// (GET /api/channels: the attention rows, each account's newest, the counts) and every other row by key from ONE
// paged route (GET /api/channels/rows); this store is what the panel draws from.
//
// PURE — DOM-free, fetch-free, word-free; imports only the shared PURE rule (src/channel-focus.js: statusTag, the
// page order, the filter's rule) so the store, the panel and the server cannot disagree. The panel fetches; the
// store decides.
//
//   store = { byKey: Map<key, row>, lists: Map<name, list>, focus: Set<key>, meta, cut, gen, rowGen }
//   list  = { name, view, adapter, q, keys: Set, next: cursor|null, total, loaded, stale, had }
//   lists: 'all' (All, newest first), 'search' (All under a query — `q`), 'account:<id>' (a card: its head + pages).
//   The ATTENTION list (`focus`, keys) is the SERVER'S: the first read's attention rows (≤ ATTENTION_MAX; `cut` = the
//   rest, counted by the server), plus a row a partial broadcast tags, less one it untags (`focusRowsOf`). A held row's
//   own copy never puts it there — it may be stale (verify r1: a row that lost its tag while this client was away, or
//   in a non-partial pass, stayed on the first screen with its old tag; a page row past the cut was counted twice).
//
//   applyFirst(store, d)          the first read (and a reconnect, and a NON-partial broadcast): rows by key, an
//                                 account list gets its head (a paged one KEEPS its range), every loaded list STALE —
//                                 answers the stale lists' names (the panel re-reads the one on screen, ≤ 200 rows)
//   applyPage(store, name, page)  appends keyed rows (or replaces, a re-read), moves the cursor
//   applyBroadcast(store, d, now) a PARTIAL broadcast's rule for a row the client never loaded: TAKEN when it now
//                                 wears a tag, or when it sorts INSIDE the loaded range of a list it belongs to (a new
//                                 message moves a chat to the top of All and of its account); otherwise dropped — it
//                                 arrives by paging, and the counts (kept facts on every broadcast) include it. A held
//                                 row that lost its tag and belongs to no list leaves; a row of an account that is gone
//                                 leaves (the old mergeDigest rule).
import { statusTag, pageOrder, pageCursor, afterCursor, textMatches, PAGE_ROWS, PAGE_MAX } from '../channel-focus.js';

/** All's "Show more" reads this many; an account's "Show more" reads PAGE_ACCOUNT (design 008 §2). */
export const PAGE_ALL = PAGE_ROWS;
export const PAGE_ACCOUNT = PAGE_MAX;
export const accountList = (id) => `account:${id}`;

export function createRowStore() {
  return { byKey: new Map(), lists: new Map(), focus: new Set(), meta: null, cut: 0, gen: 0, rowGen: new Map() };
}

const listSpec = (name) => (name.startsWith('account:') ? { view: 'all', adapter: name.slice(8) } : { view: 'all', adapter: null });
/** The list named `name`, made empty (not loaded) when absent; `q` only for 'search'. */
export function ensureList(store, name, { q = '' } = {}) {
  let l = store.lists.get(name);
  if (!l || (name === 'search' && l.q !== q)) {
    l = { name, ...listSpec(name), q: name === 'search' ? q : '', keys: new Set(), next: null, total: null, loaded: false, stale: false, had: 0 };
    store.lists.set(name, l);
  }
  return l;
}

const adaptersOf = (meta) => new Map(((meta && meta.adapters) || []).map((a) => [a.id, a]));
/** Does row `r` belong to list `l` (whatever was loaded)? */
function belongs(l, r, adapters) {
  const a = adapters.get(r.adapterId);
  if (!a || r.unlisted) return false;
  if (l.adapter) return r.adapterId === l.adapter;
  if (a.builtin) return false;
  return !l.q || textMatches([r.title || r.id, r.adapterLabel, r.lastText], String(l.q).trim().toLowerCase());
}
/** Does row `r` sit on the ATTENTION list (a listed row of an account the first screen lists, wearing a tag)? */
function attends(r, adapters, now) {
  const a = adapters.get(r.adapterId);
  return !!(a && !a.builtin && !r.unlisted && statusTag(r, now));
}
const metaOf = (d) => { const { conversations, heads, ...meta } = d || {}; return meta; };
const totalOf = (store, l) => {
  const c = store.meta && store.meta.counts;
  if (!c || l.q) return l.total;
  return l.adapter ? (c.byAdapter && c.byAdapter[l.adapter] != null ? c.byAdapter[l.adapter] : l.total) : c.all;
};
function prune(store, now) {
  const adapters = adaptersOf(store.meta);
  const kept = new Set();
  for (const l of store.lists.values()) for (const k of l.keys) kept.add(k);
  for (const [k, r] of store.byKey) if (!kept.has(k) && !(store.focus.has(k) && attends(r, adapters, now))) { store.byKey.delete(k); store.rowGen.delete(k); store.focus.delete(k); }
}

/** THE FIRST READ (design 008: a reconnect and a NON-partial broadcast too). Answers the names of the lists left stale. */
export function applyFirst(store, d, now = Date.now()) {
  if (!d) return [];
  store.gen++;
  store.meta = metaOf(d);
  store.cut = (d.attention && Number(d.attention.cut)) || 0;
  const adapters = adaptersOf(store.meta);
  store.focus = new Set();   // verify r1 (G): replaced whole — the first read names every attention row up to the cut
  for (const r of d.conversations || []) { if (!r || !r.key) continue; store.byKey.set(r.key, r); store.rowGen.set(r.key, store.gen); if (attends(r, adapters, now)) store.focus.add(r.key); }
  const stale = [];
  const heads = d.heads || {};
  for (const [name, l] of [...store.lists]) {
    if (l.adapter && !adapters.has(l.adapter)) { store.lists.delete(name); continue; }
    if (!l.adapter && l.loaded) { l.stale = true; l.had = l.keys.size; stale.push(name); }
  }
  // every account has its list — an account with no row yet too (complete: the broadcast's first rows join it)
  for (const id of adapters.keys()) {
    const l = ensureList(store, accountList(id));
    const head = (heads[id] || []).filter((k) => store.byKey.has(k));
    const paged = l.loaded && l.keys.size > head.length;
    l.had = paged ? l.keys.size : 0;
    l.total = totalOf(store, l);
    if (paged) {
      // owner 2026-10-03 (seamless lists): the RANGE stays — the rows read past the head and the cursor — until the
      // re-read replaces it; a reconnect / a whole broadcast never jumps an account card back to its head
      l.keys = new Set([...head, ...l.keys]);
    } else {
      l.keys = new Set(head);
      const last = head.length ? store.byKey.get(head[head.length - 1]) : null;
      l.next = last && head.length < (Number(l.total) || 0) ? pageCursor(last) : null;
    }
    l.loaded = true;
    l.stale = paged;
    if (paged) stale.push(l.name);
  }
  for (const [k, r] of [...store.byKey]) if (!adapters.has(r.adapterId)) { store.byKey.delete(k); store.rowGen.delete(k); store.focus.delete(k); }
  prune(store, now);
  return stale;
}

/** A PAGE from GET /api/channels/rows: rows by key into the list (`replace` = a re-read of what it had). A row a
 *  broadcast wrote AFTER the page was asked for (`gen` = store.gen at the ask) keeps the broadcast's copy. */
export function applyPage(store, name, page, { replace = false, gen = Infinity, q = '' } = {}) {
  const l = ensureList(store, name, { q });
  if (!page || !Array.isArray(page.rows)) return l;
  if (replace) l.keys = new Set();
  for (const r of page.rows) {
    if (!r || !r.key) continue;
    if (!((store.rowGen.get(r.key) || 0) > gen)) store.byKey.set(r.key, r);
    l.keys.add(r.key);
  }
  l.next = page.next || null;
  l.total = page.total != null ? Number(page.total) : l.total;
  l.loaded = true; l.stale = false; l.had = 0;
  return l;
}

/** A `channels-updated` digest. Answers `{redraw, refetch: [list names]}`. */
export function applyBroadcast(store, d, now = Date.now()) {
  if (!d) return { redraw: false, refetch: [] };
  if (!d.partial) return { redraw: true, refetch: applyFirst(store, d, now) };
  store.gen++;
  store.meta = { ...(store.meta || {}), ...metaOf(d) };
  const adapters = adaptersOf(store.meta);
  for (const r of d.conversations || []) {
    if (!r || !r.key) continue;
    let take = attends(r, adapters, now);
    if (take) store.focus.add(r.key); else store.focus.delete(r.key);
    for (const l of store.lists.values()) {
      if (!belongs(l, r, adapters)) { l.keys.delete(r.key); continue; }
      if (l.keys.has(r.key)) { take = true; continue; }
      // THE NEVER-LOADED RULE: inside the loaded range (or the list is whole) ⇒ it joins; past the cursor ⇒ paging brings it
      if (l.loaded && (!l.next || !afterCursor(r, l.next))) { l.keys.add(r.key); take = true; }
    }
    if (take) { store.byKey.set(r.key, r); store.rowGen.set(r.key, store.gen); } else { store.byKey.delete(r.key); store.rowGen.delete(r.key); }
  }
  for (const [name, l] of [...store.lists]) {
    if (l.adapter && !adapters.has(l.adapter)) { store.lists.delete(name); continue; }
    l.total = totalOf(store, l);
  }
  for (const [k, r] of [...store.byKey]) if (!adapters.has(r.adapterId)) { store.byKey.delete(k); store.rowGen.delete(k); store.focus.delete(k); }
  return { redraw: true, refetch: [] };
}

/** A list's rows, newest first (pageOrder); [] for a list never read. */
export function listRows(store, name) {
  const l = store.lists.get(name);
  if (!l) return [];
  const out = [];
  for (const k of l.keys) { const r = store.byKey.get(k); if (r) out.push(r); }
  return out.sort(pageOrder);
}
/** Every row the store holds (the attention view draws the tagged ones). */
export function loadedRows(store) { return [...store.byKey.values()]; }
/** The attention rows the store holds, newest first. */
export function focusRowsOf(store, now = Date.now()) {
  const adapters = adaptersOf(store.meta);
  return loadedRows(store).filter((r) => store.focus.has(r.key) && attends(r, adapters, now)).sort(pageOrder);
}

/** The query of a list's NEXT page (`more`) or of a re-read of what it had loaded (≤ PAGE_MAX), for /api/channels/rows. */
export function pageQueryOf(store, name, { more = true } = {}) {
  const l = store.lists.get(name) || { ...listSpec(name), q: '', keys: new Set(), had: 0, next: null };
  const per = l.adapter ? PAGE_ACCOUNT : PAGE_ALL;
  const qs = { view: l.view };
  if (l.adapter) qs.adapter = l.adapter;
  if (l.q) qs.q = l.q;
  if (more && l.next) { qs.beforeAt = String(l.next.lastAt); qs.beforeKey = l.next.key; qs.limit = String(per); }
  else qs.limit = String(Math.min(PAGE_MAX, Math.max(per, l.had || 0, more ? 0 : l.keys.size)));
  return qs;
}
