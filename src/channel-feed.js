'use strict';
/**
 * THE CHANGE FEED'S ARITHMETIC — PURE (lane lark-search-poll, B-5aab, 2026-09-28;
 * docs/design-communication-panel.zh.md §27, the lane design
 * /var/tmp/vibespace-lanes/lark-search-poll/design.md).
 *
 * WHAT A CHANGE FEED IS. One account-wide "what changed since …" read — Lark's
 * `im/v1/messages/search` with an EMPTY query and a `time_range` — that names
 * every conversation (groups, single chats, thread replies) holding a new
 * message, one page per call. It is DECLARED by an adapter (`caps.changeFeed`,
 * src/channels/index.js validates the row) beside its `receive` lane, never
 * instead of it; nothing downstream names the vendor.
 *
 * THIS MODULE owns the numbers and the verdicts, nothing else: the window a
 * page asks for, the page's trust verdict (bound before trust — a vendor that
 * ignores its time window must never turn "since the cursor" into "the whole
 * history"), the fold of a page's hits into OWED marks / births / hints, when
 * an owed mark is satisfied, a born conversation's read line, the coverage
 * measurement and the mode it decides. The engine only drives it
 * (src/server/channels-engine.js `feedPage`); the scheduling is drain RULE 21
 * (src/channel-drain.js); the one lane answer is channel-caps `feedState`.
 *
 * INVARIANTS the gate (scripts/test-channel-feed.mjs) pins:
 *  · the window always overlaps the last complete one by ≥ OVERLAP_MIN_SEC —
 *    a message indexed late is still inside the next window (U4);
 *  · a window never reaches further back than `maxWindowSec`; the older part
 *    of a long gap becomes a SINGLE-CHAT catch-up (groups are covered by their
 *    own polls), never a page storm;
 *  · a page with ANY hit outside [from − RANGE_SLACK_MS, to + RANGE_SLACK_MS]
 *    (judged by max(create, update)), or a `total` no real window can hold,
 *    is `time-range-ignored` — the feed parks by name, no second page (U2);
 *  · a time is read in ONE declared unit and a value outside [2010, now + 1 d]
 *    is malformed — never rescaled by guessing from its magnitude (the
 *    inc-mu3giy8t-7k36 lesson: a unit guessed from the value read 1 % as 100 %);
 *  · a page whose hits this reader cannot read proves nothing (every guard
 *    above judges READABLE hits): a run of pages ≥ 90 % unreadable parks the
 *    feed BY NAME with the fields it could not read (`shapeVerdict` — lane
 *    lark-p2p: 241 260 unreadable hits paged the vendor's whole history for
 *    ten hours, silently); the run is ONE WINDOW's (the engine restarts it at
 *    every page 1 — verify r1: a run that outlived windows counted the same
 *    stray item on each of the ~3 overlapping ticks, and two odd items in a
 *    quiet minute parked the feed for a day);
 *  · a hit is a MARK, never a record: the snippet never leaves the adapter and
 *    nothing here produces text (test-channel-feed ⑤, the census);
 *  · an owed mark is cleared only by a COMPLETE walk that STARTED after the
 *    message existed (+ FEED_SKEW_MS for the two clocks).
 * Imports nothing, reads no clock (every `now` is an argument). CJS so the
 * engine, the gate and a suite share it.
 */

/** Messages the feed remembers having seen (dedup across the overlap), and for how long. */
const FEED_SEEN_MAX = 20000;
const FEED_SEEN_TTL_MS = 2 * 3600e3;
/** The two clocks (the vendor's `create_time`, our walk's start) may disagree by this much. */
const FEED_SKEW_MS = 5000;
/** Thread owed marks kept per conversation (the oldest dropped and counted). */
const THREAD_OWED_MAX = 50;
/** lane lark-threads (A4): the hits behind owed chat reads a page hands the engine (what the read must find) — bounded. */
const OWED_HITS_MAX = 60;
/** Conversations a pass may ask the vendor to NAME (a born single chat's title). */
const DESCRIBE_MAX = 5;
/** The slack a hit may lie outside its window before the window is judged IGNORED. */
const RANGE_SLACK_MS = 120e3;
/** `total` sanity: no real window holds more than this many messages a second. */
const TOTAL_PER_SEC_MAX = 50;
/** THE MEASUREMENT (the push lane's §6.4 rule, word for word): promote at ≤ 2 % over ≥ 200, demote at > 2 % over ≥ 20. */
const PROMOTE_MIN = 200;
const DEMOTE_MIN = 20;
const MISS_THRESHOLD = 0.02;
/** The overlap's floor and default (seconds) — `channels.feedOverlapSec` is clamped to the floor. */
const OVERLAP_MIN_SEC = 30;
const OVERLAP_DEFAULT_SEC = 60;
/** A page token lives this long (U8 — the adapter's own WALK_TTL_MS); older ⇒ the window restarts from page 1. */
const PAGE_TOKEN_TTL_MS = 5 * 60e3;
/** Page signatures the engine keeps per window in flight (verify r3 — the loop guard judges a continuation against every
 *  page since page 1; the count's ceiling ends any window long before this). */
const PAGE_SIGS_MAX = 256;
/** Records the measurement holds while their instant is not yet covered by a complete window. */
const PENDING_SAMPLES_MAX = 2000;
/** The closed set of feed readings (`caps.changeFeed.via`). */
const FEED_VIA = Object.freeze(['search', 'history']);
/** lane channel-feed-authority: a feed's AUTHORITY — `history` (the vendor's own change log, Gmail's history.list) is
 *  `authoritative` and replaces the per-row timers; a `search` is `measured` (its coverage proved, never promised). */
const FEED_AUTHORITY = Object.freeze(['authoritative', 'measured']);
/** The time FORMS a feed may declare — ONE per adapter, never guessed: an integer of milliseconds, an integer of
 *  seconds, or an ISO 8601 string (lane lark-p2p, 2026-09-30: Lark's message search answers `create_time` as
 *  `2026-03-21T16:15:30+08:00` — its own doc and its own answer; the .197 declaration `ms` read every hit malformed). */
const TIME_UNITS = Object.freeze(['ms', 's', 'iso']);
/** THE SHAPE VERDICT (lane lark-p2p): a RUN of pages whose items are ≥ this share unreadable, holding ≥ SHAPE_MIN_ITEMS
 *  items, is a vendor shape this reader does not read — the feed parks by name. At most SHAPE_FIELDS_MAX offending field
 *  lists are kept (each ≤ SHAPE_FIELD_NAMES_MAX names in the field alphabet). */
const SHAPE_BAD_SHARE = 0.9;
const SHAPE_MIN_ITEMS = 5;
const SHAPE_FIELDS_MAX = 3;
const SHAPE_FIELD_NAMES_MAX = 6;
const FIELD_NAME_RE = /^[A-Za-z0-9_.]{1,64}$/;
/** THE UNREADABLE-HITS RING (verify r2): the card's "N search hits could not be read" is about NOW — the pages of the last
 *  UNREADABLE_RECENT_MS that held an unreadable hit, `[at, n]` each, at most UNREADABLE_RING_MAX (the oldest dropped;
 *  the feed's own minute bounds it far below that). The cumulative counter stays for diagnostics; the words read the ring
 *  (two stray items in one minute used to be "4 search hits could not be read" on the card for ever — a day and 2 884
 *  clean pages later). */
const UNREADABLE_RECENT_MS = 3600e3;
const UNREADABLE_RING_MAX = 200;
/** The fields a hit may carry past the registry — everything else (a snippet, markup) is stripped. */
const HIT_FIELDS = Object.freeze(['convId', 'vendorId', 'at', 'updatedAt', 'threadKey', 'isP2p', 'fromId']);
/** The page's park codes (a feed-LOCAL refusal: the per-conversation polling carries on). */
const PARK_CODES = Object.freeze(['time-range-ignored', 'contract', 'forbidden', 'vendor-error', 'rate-limited', 'shape']);
/** The modes the measurement moves between. */
const MODES = Object.freeze(['measuring', 'carrying', 'demoted']);
/** 2010-01-01 — an instant before it is not a message of this century's chat vendors. */
const EPOCH_MIN_MS = Date.UTC(2010, 0, 1);
/** An id: bounded, the vendors' alphabet (bound before parse — 2026-09-27). */
const ID_MAX = 512;
const ID_RE = /^[A-Za-z0-9_.:@=+\-]{1,512}$/;

const num = (v) => (v === null || v === undefined || v === '' || typeof v === 'boolean' || !Number.isFinite(Number(v)) ? null : Number(v));
const floorSec = (ms) => Math.floor(Number(ms) / 1000) * 1000;
/** A bounded id, or null. */
function idOf(v) {
  if (v === null || v === undefined) return null;
  const s = String(v);
  return s.length <= ID_MAX && ID_RE.test(s) ? s : null;
}

/**
 * THE WINDOW a feed page asks for (§2.2), from the adapter record's `feed` half.
 *   feed        rec.feed — { cursorAt, window: {from, to, pages}|null, firstRunAt }
 *   now         the engine's clock (ms)
 *   decl        caps.changeFeed — { maxWindowSec }
 *   overlapSec  the setting (clamped to ≥ OVERLAP_MIN_SEC)
 *   tokenAt     when the in-memory page token of the window in flight was minted (null = none)
 * → { act: 'continue' (the window in flight, its token alive) | 'restart' (the same window from page 1 — no token,
 *     or one past PAGE_TOKEN_TTL_MS) | 'new' (a fresh window; `gap` = the older span a long stop left, a single-chat
 *     catch-up) | 'none' (the clock went backwards: no call), from, to, gap, first }
 * Every instant is whole seconds.
 */
function window(feed, now, decl = {}, { overlapSec = OVERLAP_DEFAULT_SEC, tokenAt = null } = {}) {
  const f = feed && typeof feed === 'object' ? feed : {};
  const t = floorSec(now);
  const w = f.window && typeof f.window === 'object' ? f.window : null;
  if (w && num(w.from) !== null && num(w.to) !== null && Number(w.to) > Number(w.from)) {
    const alive = num(tokenAt) !== null && Number(now) - Number(tokenAt) < PAGE_TOKEN_TTL_MS && Number(now) >= Number(tokenAt);
    return { act: alive ? 'continue' : 'restart', from: Number(w.from), to: Number(w.to), gap: null, first: false };
  }
  const ov = Math.max(OVERLAP_MIN_SEC, Math.round(num(overlapSec) === null ? OVERLAP_DEFAULT_SEC : Number(overlapSec))) * 1000;
  const maxWin = Math.max(ov + 1000, (num(decl && decl.maxWindowSec) || 3600) * 1000);
  const cursor = num(f.cursorAt);
  const first = cursor === null;
  let from = first ? t - ov : floorSec(cursor) - ov;
  let gap = null;
  if (t - from > maxWin) { gap = { from, to: t - maxWin }; from = t - maxWin; }
  if (!(t > from)) return { act: 'none', from, to: t, gap: null, first, why: 'clock-backwards' };
  return { act: 'new', from, to: t, gap, first };
}

/** ISO 8601, whole seconds, UTC (`2026-09-28T12:00:00Z`) — the vendor's `time_range` spelling. */
function isoSec(ms) { return new Date(floorSec(ms)).toISOString().replace(/\.\d{3}Z$/, 'Z'); }

/** THE ISO 8601 FORM a declared `iso` unit reads — the vendor doc's own pattern (`2026-03-21T16:15:30+08:00`, `Z`, an
 *  offset with or without its colon) plus optional fractional seconds. Bounded (≤ 64 characters) BEFORE the pattern;
 *  the calendar date is proved by a round trip (Feb 30 is refused, never rolled over into March); never `Date.parse`
 *  (its legacy fallbacks read forms nobody declared). → epoch ms | null */
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(?:Z|([+-])(\d{2}):?(\d{2}))$/;
function isoMs(v) {
  if (typeof v !== 'string' || v.length > 64) return null;
  const m = ISO_RE.exec(v);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]), h = Number(m[4]), mi = Number(m[5]), s = Number(m[6]);
  if (mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59 || s > 59) return null;
  const day = new Date(Date.UTC(y, mo - 1, d));
  if (day.getUTCFullYear() !== y || day.getUTCMonth() !== mo - 1 || day.getUTCDate() !== d) return null;
  let off = 0;
  if (m[8]) {
    const oh = Number(m[9]), om = Number(m[10]);
    if (oh > 23 || om > 59) return null;
    off = (oh * 60 + om) * 60e3 * (m[8] === '-' ? -1 : 1);
  }
  const frac = m[7] ? Math.floor(Number(`0.${m[7]}`) * 1000) : 0;
  return Date.UTC(y, mo - 1, d, h, mi, s, frac) - off;
}
/**
 * AN INSTANT in the adapter's DECLARED form (`ms` | `s` | `iso`), judged against [2010, now + 1 day] — never read in
 * another form, never rescaled by its magnitude (inc-mu3giy8t-7k36). → epoch ms | null
 */
function readTime(v, unit, now) {
  if (!TIME_UNITS.includes(unit)) return null;
  let at;
  if (unit === 'iso') at = isoMs(v);
  else {
    const raw = num(v);
    if (raw === null || !/^\d+$/.test(String(v).trim())) return null;
    at = raw * (unit === 's' ? 1000 : 1);
  }
  if (at === null || !Number.isFinite(at)) return null;
  return at >= EPOCH_MIN_MS && at <= Number(now) + 86400e3 ? at : null;
}

/**
 * ONE vendor item → ONE hit, or a malformed verdict (§2.6 d). `unit` is the adapter's DECLARATION ('ms' | 's' | 'iso')
 * — a value is read in it and judged against [2010, now + 1 day]; never rescaled by its magnitude, never read in a
 * form nobody declared.
 *   meta = { convId, vendorId, createTime, updateTime, threadKey, isP2p, fromId } (the adapter has read its own
 *   field names into these; everything else — a snippet — is never handed here)
 * → { ok: true, hit } | { ok: false, why }
 */
function normalizeHit(meta, { unit = 'ms', now = 0 } = {}) {
  const m = meta && typeof meta === 'object' ? meta : {};
  if (!TIME_UNITS.includes(unit)) return { ok: false, why: 'unit-undeclared' };
  const convId = idOf(m.convId);
  if (!convId) return { ok: false, why: 'no-conversation' };
  const vendorId = idOf(m.vendorId);
  if (!vendorId) return { ok: false, why: 'no-message-id' };
  let at;
  if (unit === 'iso') {
    at = isoMs(m.createTime);
    if (at === null) return { ok: false, why: 'no-time' };
  } else {
    const raw = num(m.createTime);
    if (raw === null || !/^\d+$/.test(String(m.createTime).trim())) return { ok: false, why: 'no-time' };
    const scale = unit === 's' ? 1000 : 1;
    at = raw * scale;
  }
  const hi = Number(now) + 86400e3;
  if (at < EPOCH_MIN_MS || at > hi) return { ok: false, why: 'time-out-of-range' };
  const updatedAt = m.updateTime === null || m.updateTime === undefined || m.updateTime === '' ? null : readTime(m.updateTime, unit, now);
  const threadKey = m.threadKey === null || m.threadKey === undefined || m.threadKey === '' ? null : idOf(m.threadKey);
  if ((m.threadKey !== null && m.threadKey !== undefined && m.threadKey !== '') && !threadKey) return { ok: false, why: 'bad-thread' };
  const fromId = m.fromId === null || m.fromId === undefined || m.fromId === '' ? null : idOf(m.fromId);
  return { ok: true, hit: { convId, vendorId, at, updatedAt, threadKey, isP2p: m.isP2p === true || m.isP2p === 'true', fromId } };
}

/** A hit exactly as the registry lets it through — the closed field list, every id bounded; null = malformed. */
function cleanHit(h, { now = 0 } = {}) {
  if (!h || typeof h !== 'object') return null;
  const convId = idOf(h.convId), vendorId = idOf(h.vendorId);
  const at = num(h.at);
  if (!convId || !vendorId || at === null || at < EPOCH_MIN_MS || at > Number(now) + 86400e3) return null;
  const up = num(h.updatedAt);
  const threadKey = h.threadKey === null || h.threadKey === undefined ? null : idOf(h.threadKey);
  if (h.threadKey !== null && h.threadKey !== undefined && !threadKey) return null;
  return { convId, vendorId, at, updatedAt: up !== null && up >= EPOCH_MIN_MS ? up : null, threadKey, isP2p: h.isP2p === true, fromId: h.fromId === null || h.fromId === undefined ? null : idOf(h.fromId) };
}

/**
 * THE PAGE'S TRUST VERDICT (§2.6) — run on EVERY page before a hit is used.
 *   page  { hits: [...], total, more, malformed }   (the registry's answer)
 *   win   { from, to }
 *   pages the pages of THIS window already read before this one (lane lark-p2p verify r1 — the count's own ceiling)
 * → { ok: true, hits, malformed } | { ok: false, park: 'contract' | 'time-range-ignored', why, outside }
 * (a) more hits than asked ⇒ contract; (b) ANY hit whose creation AND update BOTH lie outside the window ± the slack ⇒
 * the range was ignored (an edited OLD message is judged by its update — it is news again, inside the window; a message
 * created inside the window and edited AFTER its end is inside by its creation — verify r1: `max(at, updatedAt)` read
 * that ordinary edit as "outside" and parked the feed for 24 h, e.g. a multi-page window whose later page was read after
 * a typo fix, or a window re-read after a restart);
 * (c) a `total` no window of this length can hold ⇒ ignored; (d) a malformed hit is dropped and counted;
 * (f) THE COUNT'S CEILING (lane lark-p2p verify r1): the pages this window has read, the same rule as (c) applied to
 * what was PAGED rather than what the vendor CLAIMED — `has_more` for ever with a fresh token and fresh in-window ids
 * and no `total` (or `total: 0`, a finite number the claim rule trusts) paged one steady window at the feed's whole
 * minute for ever (measured: 300 pages in 30 minutes, the card "behind"; production's 8 043 pages proved the claim rule
 * alone never stops it). A window of S seconds may page at most S × TOTAL_PER_SEC_MAX hits; past that it is parked by
 * name like an ignored range, and the per-conversation polling carries on.
 */
function pageVerdict(page, win, { pageSize = 30, now = 0, sent = null, prevSig = null, pages = 0 } = {}) {
  const p = page && typeof page === 'object' ? page : {};
  const raw = Array.isArray(p.hits) ? p.hits : [];
  if (raw.length > Math.max(1, Number(pageSize) || 30)) return { ok: false, park: 'contract', why: `the page carried ${raw.length} hits for a page size of ${pageSize}` };
  const from = Number(win && win.from), to = Number(win && win.to);
  const before = Math.max(0, Math.floor(Number(pages) || 0));
  if (before > 0 && Number.isFinite(from) && Number.isFinite(to)) {
    const paged = before * Math.max(1, Number(pageSize) || 30) + raw.length;
    const most = Math.max(1, (to - from) / 1000) * TOTAL_PER_SEC_MAX;
    if (paged > most) return { ok: false, park: 'time-range-ignored', why: `the window has run to ${before + 1} pages (${paged} hits at the page size) for a ${Math.round((to - from) / 1000)} s window — no window of that length holds that many (the search never ends)`, outside: 0, paged };
  }
  let malformed = Math.max(0, Math.floor(Number(p.malformed) || 0));
  const hits = [];
  let outside = 0;
  for (const r of raw) {
    const h = cleanHit(r, { now });
    if (!h) { malformed++; continue; }
    const inside = (x) => x >= from - RANGE_SLACK_MS && x <= to + RANGE_SLACK_MS;
    if (!inside(h.at) && !(h.updatedAt && inside(h.updatedAt))) outside++;
    hits.push(h);
  }
  if (outside) return { ok: false, park: 'time-range-ignored', why: `${outside} hit(s) outside the asked window (± ${RANGE_SLACK_MS / 1000} s) — the vendor ignored its time range`, outside };
  const total = num(p.total);
  if (total !== null && Number.isFinite(from) && Number.isFinite(to) && total > Math.max(1, (to - from) / 1000) * TOTAL_PER_SEC_MAX) return { ok: false, park: 'time-range-ignored', why: `the vendor counted ${total} hits for a ${Math.round((to - from) / 1000)} s window — no window of that length holds that many`, outside: 0 };
  // (e) THE PAGE TOKEN IGNORED (verify r1 — U9, where the pagination rides is unverified): a CONTINUATION page (`sent` =
  // the token we sent) that answers the very token we sent, or the very hits of the previous page of this window
  // (`prevSig`), means the vendor did not read the token — its window never completes (the same page for ever, the
  // cursor never moves: measured 300 pages in 30 minutes, the card "searching for the first time"). Parked by name.
  const sig = pageSig(hits);
  // verify r3: `prevSig` = the previous page's signature, or (a list) the signatures of EVERY page of this window since its
  // page 1 — a vendor looping with a period of two (A → B → A → B …, fresh tokens) repeats nothing the previous page held:
  // measured 161 pages in 77 minutes before the count's ceiling parked it under the wrong name ("ignored its time window")
  const seenSigs = Array.isArray(prevSig) ? prevSig.filter((s) => typeof s === 'string' && s) : (typeof prevSig === 'string' && prevSig ? [prevSig] : []);
  if (sent !== null && sent !== undefined && sent !== '' && ((typeof p.pageToken === 'string' && p.pageToken === String(sent)) || (sig && seenSigs.includes(sig)))) {
    return { ok: false, park: 'contract', why: 'the vendor answered a continuation page with the page it had already sent — it ignores the page token (pagination)', paging: true };
  }
  return { ok: true, hits, malformed, sig };
}
/** A page's identity: its message ids, order-free (a continuation that repeats a page repeats this). */
function pageSig(hits) { return (Array.isArray(hits) ? hits : []).map((h) => String(h && h.vendorId)).sort().join('\n'); }

/** ONE offending field list, cleaned: names in the field alphabet only, unique, sorted, ≤ SHAPE_FIELD_NAMES_MAX. */
function fieldList(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.slice(0, 32).filter((x) => typeof x === 'string' && x.length <= 64 && FIELD_NAME_RE.test(x)))].sort().slice(0, SHAPE_FIELD_NAMES_MAX);
}
/** Offending field lists merged: the FIRST ≤ SHAPE_FIELDS_MAX distinct lists kept (a list already held is not added). */
function mergeFieldLists(prev, add) {
  const out = [];
  const seen = new Set();
  for (const l of [...(Array.isArray(prev) ? prev : []), ...(Array.isArray(add) ? add : [])]) {
    const c = fieldList(l);
    const k = c.join(',');
    if (!c.length || seen.has(k)) continue;
    seen.add(k);
    out.push(c);
    if (out.length >= SHAPE_FIELDS_MAX) break;
  }
  return out;
}
/**
 * THE SHAPE VERDICT (lane lark-p2p, 2026-09-30 — the owner's production: 241 260 search hits read as malformed, every one,
 * for ten hours; no single chat born, the feed "measuring", the card silent). Every other guard of the page (the time
 * window, the `total`, the page token) judges READABLE hits only — a page nobody can read proves nothing, and a feed
 * that pages it on pages the vendor's whole history. So a RUN of pages whose items are ≥ SHAPE_BAD_SHARE unreadable,
 * holding ≥ SHAPE_MIN_ITEMS items, PARKS the feed by name with the fields it could not read; a page mostly readable
 * ends the run (a stray odd hit is dropped and counted, never a park). The run belongs to ONE window: the caller hands
 * `null` at every page 1 (verify r1 — across windows the overlap re-reads a stray item ~3 times, so a run that outlived
 * windows parked a quiet account for a day on two odd items).
 *   run   the previous run {items, malformed, fields} | null
 *   page  {items (every item the vendor sent), malformed, fields: [[name…]…]}
 * → { run, park, fields }
 */
function shapeVerdict(run, page) {
  const p = page && typeof page === 'object' ? page : {};
  const r0 = run && typeof run === 'object' && Number(run.items) > 0 ? run : null;
  const items = Math.max(0, Math.floor(Number(p.items) || 0));
  const bad = Math.min(items, Math.max(0, Math.floor(Number(p.malformed) || 0)));
  if (!items) return { run: r0, park: false, fields: r0 ? mergeFieldLists(r0.fields, []) : [] };
  if (bad / items < SHAPE_BAD_SHARE) return { run: null, park: false, fields: [] };
  const fields = mergeFieldLists(r0 ? r0.fields : [], p.fields);
  const r = { items: (r0 ? Number(r0.items) : 0) + items, malformed: (r0 ? Number(r0.malformed) || 0 : 0) + bad, fields };
  return { run: r, park: r.items >= SHAPE_MIN_ITEMS, fields };
}

/** The ring after a page with `n` unreadable hits at `now`: appended, trimmed to the last UNREADABLE_RECENT_MS, bounded.
 *  Verify r3: ONE ENTRY PER MINUTE — `[the minute's newest instant, its sum]` — so an hour is at most 61 entries and the
 *  count is exact; a per-page entry at the feed's 10 pages a minute filled the 200-entry bound in 20 minutes and the
 *  "last hour" then said a third of the truth (5 200 for 15 600 dropped), as a count, not a floor. */
function recentUnreadable(ring, now, n) {
  const t = Number(now) || 0;
  const add = Math.max(0, Math.floor(Number(n) || 0));
  const kept = (Array.isArray(ring) ? ring : []).filter((e) => Array.isArray(e) && num(e[0]) !== null && Number(e[1]) > 0 && t - Number(e[0]) <= UNREADABLE_RECENT_MS && Number(e[0]) <= t).map((e) => [Number(e[0]), Math.floor(Number(e[1]))]);
  if (add > 0) {
    const last = kept[kept.length - 1];
    if (last && Math.floor(last[0] / 60e3) === Math.floor(t / 60e3)) kept[kept.length - 1] = [t, last[1] + add];
    else kept.push([t, add]);
  }
  return kept.length > UNREADABLE_RING_MAX ? kept.slice(kept.length - UNREADABLE_RING_MAX) : kept;
}
/** What the ring says at `now`: the unreadable hits of the last UNREADABLE_RECENT_MS and the instant of the newest. → { n, at } */
function recentUnreadableCount(ring, now) {
  const t = Number(now) || 0;
  let n = 0, at = null;
  for (const e of Array.isArray(ring) ? ring : []) {
    if (!Array.isArray(e) || num(e[0]) === null || !(Number(e[1]) > 0)) continue;
    const a = Number(e[0]);
    if (a > t || t - a > UNREADABLE_RECENT_MS) continue;
    n += Math.floor(Number(e[1]));
    if (at === null || a > at) at = a;
  }
  return { n, at };
}

/**
 * THE FOLD of a page's hits (§2.4, §3.1) — what the engine writes, in the order it must (owed marks first).
 *   seen          Map<vendorId, at> — messages the feed already saw (the overlap re-reads each 2–3 times)
 *   stateOf(cid)  'live' | 'paused' | 'unlisted' | null (the index does not hold it)
 *   hasRecord(cid, vendorId)  the store already holds this message (a push-delivered record, our own send)
 *   separateThreads  the adapter's thread replies are NOT in the conversation listing (`threads.listing:'separate'`)
 * → { owed: Map<convId, at>, threadOwed: Map<convId, Map<threadKey, at>>, births: Map<convId, {at, created, fromIds: []}>,
 *     groups: Map<convId, {at, threads: Map}>, seenAdd: [[vendorId, at]], repeats, stored, unlisted,
 *     threadHits (lane lark-threads A5: the new hits that carry a thread id — the measurement),
 *     owedHits: [{convId, vendorId, at}] (A4: the hits behind an owed chat read with no thread id, ≤ OWED_HITS_MAX) }
 * lane lark-threads (A3): a hit on a STORED message that names a thread still marks THE THREAD (never the chat).
 * U6: until a page pins a thread ROOT's `thread_position`, a hit with a thread marks BOTH the conversation (the
 * chat listing returns roots) and the thread (the thread walk returns replies).
 */
function foldHits(hits, { seen = new Map(), stateOf = () => null, hasRecord = () => false, separateThreads = false } = {}) {
  const out = { owed: new Map(), threadOwed: new Map(), births: new Map(), groups: new Map(), seenAdd: [], repeats: 0, stored: 0, unlisted: 0, threadHits: 0, owedHits: [] };
  const inPage = new Set();
  const up = (m, k, at) => { if (!(m.get(k) >= at)) m.set(k, at); };
  for (const h of Array.isArray(hits) ? hits : []) {
    if (!h || !h.convId || !h.vendorId) continue;
    if (inPage.has(h.vendorId) || (seen && typeof seen.has === 'function' && seen.has(h.vendorId))) { out.repeats++; continue; }
    inPage.add(h.vendorId);
    const at = Math.max(Number(h.at) || 0, Number(h.updatedAt) || 0);
    out.seenAdd.push([h.vendorId, at]);
    if (h.threadKey) out.threadHits++;   // A5 (lane lark-threads): the measurement — does the search carry thread ids at all
    const st = stateOf(h.convId);
    if (st === 'unlisted') { out.unlisted++; continue; }
    if (st === null || st === undefined) {
      if (h.isP2p) {
        let b = out.births.get(h.convId);
        if (!b) { b = { at: 0, created: 0, fromIds: [], threads: new Map() }; out.births.set(h.convId, b); }
        if (at > b.at) b.at = at;
        // verify r2: the newest CREATION apart — an edit is not activity (a year-old message edited now must not make the
        // born row look active: its tier would poll it every 30 s for an hour and every 5 min for a day)
        if (Number(h.at) > b.created) b.created = Number(h.at);
        if (h.fromId && !b.fromIds.includes(h.fromId) && b.fromIds.length < 4) b.fromIds.push(h.fromId);
        if (h.threadKey && separateThreads) up(b.threads, h.threadKey, at);
      } else {
        let g = out.groups.get(h.convId);
        if (!g) { g = { at: 0, threads: new Map() }; out.groups.set(h.convId, g); }
        if (at > g.at) g.at = at;
        if (h.threadKey && separateThreads) up(g.threads, h.threadKey, at);
      }
      continue;
    }
    // lane lark-threads (A3 / H1, 2026-10-01): THE THREAD MARK FIRST — a hit on a message the store already holds still
    // names its thread: the search re-surfaced a root whose topic was born after it was stored (the chat listing will
    // never show that root again — it is older than the anchor), or a reply the push already delivered. It used to be
    // dropped here before its mark (`stored++; continue`), so a thread born on a stored root was invisible for ever. A
    // stored hit marks the THREAD only (a widened mark) — never an owed chat read (the chat holds nothing new for it)
    if (h.threadKey && separateThreads) {
      if (!out.threadOwed.has(h.convId)) out.threadOwed.set(h.convId, new Map());
      up(out.threadOwed.get(h.convId), h.threadKey, at);
    }
    if (hasRecord(h.convId, h.vendorId)) { out.stored++; continue; }
    up(out.owed, h.convId, at);
    // A4: a hit behind an owed CHAT read with no thread id — the read must find it; one it does not find is read by id
    if (!h.threadKey && out.owedHits.length < OWED_HITS_MAX) out.owedHits.push({ convId: h.convId, vendorId: h.vendorId, at });
  }
  return out;
}

/** Merge thread owed marks, bounded to THREAD_OWED_MAX per conversation (the OLDEST dropped). → { marks, dropped } */
function mergeThreadOwed(prev, add) {
  const m = { ...(prev && typeof prev === 'object' ? prev : {}) };
  for (const [k, at] of add instanceof Map ? add : Object.entries(add || {})) if (!(Number(m[k]) >= Number(at))) m[k] = Number(at);
  const ks = Object.keys(m).sort((a, b) => Number(m[b]) - Number(m[a]));
  const kept = Object.fromEntries(ks.slice(0, THREAD_OWED_MAX).map((k) => [k, m[k]]));
  return { marks: kept, dropped: Math.max(0, ks.length - THREAD_OWED_MAX) };
}

/**
 * WHERE THE FEED'S REACH BEGAN for each owed THREAD (verify r2): the start of the earliest window that named it since its
 * last walk. A feed-named first walk judges news from the feed's reach (the engine's `threadRefresh`): the owed instant −
 * the widest window, which assumes the naming page was read within a window's length of the window's start — a window
 * re-read long after it began (a restart after an hour down, a search outage that kept it in flight) names replies older
 * than that, and a NEW reply became backlog (nobody woken). The window's own start is the reach it really had.
 *   prevReach  en.threadReach ({threadKey: from}) · prevOwed  en.threadOwed BEFORE this write · keys  the threads this
 *   page named · from  the page's window start · marks  en.threadOwed AFTER the merge (bounded)
 * → {threadKey: from} for the keys of `marks` only. A key with no live owed mark before this write starts afresh (a stale
 * entry can never lower a new mark's line); a mark written before this field existed keeps none until a page names it again
 * (the old line holds).
 */
function mergeThreadReach(prevReach, prevOwed, keys, from, marks) {
  const pr = prevReach && typeof prevReach === 'object' ? prevReach : {};
  const po = prevOwed && typeof prevOwed === 'object' ? prevOwed : {};
  const mk = marks && typeof marks === 'object' ? marks : {};
  const out = {};
  for (const k of Object.keys(mk)) if (po[k] !== undefined && num(pr[k]) !== null) out[k] = Number(pr[k]);
  const f = num(from);
  if (f !== null) for (const k of keys || []) if (k in mk) out[k] = out[k] !== undefined ? Math.min(out[k], f) : f;
  return out;
}

/** Is an owed mark satisfied by a walk? Only a COMPLETE walk that STARTED at or after the message's instant + the skew. */
function owedSatisfied(owedAt, walkStart, { complete = true, skewMs = FEED_SKEW_MS } = {}) {
  const o = num(owedAt), w = num(walkStart);
  if (o === null) return true;
  if (!complete || w === null) return false;
  return w >= o + skewMs;
}

/**
 * A BORN conversation's read line (§3.4): a catch-up birth is BACKLOG (read, never news, never a wake); a steady
 * birth's messages INSIDE the window are unread and news, the older page its first walk reads is read and wakes nobody.
 * `windowFrom` = the steady window's start (verify r1): the line used to be the hit's instant − 1 with the hit = the
 * conversation's NEWEST on the page, so a person who wrote three messages inside one window was born with ONE unread and
 * the woken agent was handed only the last ("please confirm" — the address and the door code silently marked read).
 * Every message a steady window holds for a conversation nobody knew is new (an earlier window would have born it) —
 * the line is the window's start, never later than the hit itself.
 * → { readAt, newsSince }
 */
function birthFacts(hit, { linkedAt = 0, backlogUntil = 0, catchUp = false, windowFrom = null } = {}) {
  const b = Number(backlogUntil) || 0;
  if (catchUp) return { readAt: b, newsSince: b };
  const at = Number(hit && hit.at) || 0;
  const wf = num(windowFrom);
  const line = Math.max(Number(linkedAt) || 0, b, (wf !== null ? Math.min(at, wf) : at) - 1);
  return { readAt: line, newsSince: line };
}

/**
 * THE COVERAGE MEASUREMENT (§2.8). A sample is a record a FETCH appended (never a pushed one) whose instant a
 * COMPLETE window has searched: `coveredTo` = the cursor − the overlap. A record not yet covered waits in `pending`
 * (bounded — judged once a window covers it); a record older than `memStart` (this process's first window) is never
 * judged (it was never this process's to find). Missed = its message id is not in `seen`.
 *   records   [{vendorId, at, msgType?}]  (what an ingest / a thread walk appended)
 * → { n, p, pending, missedTypes: {type: n} }
 */
function sample(records, { coveredTo = null, memStart = null, seen = new Map(), pending = [] } = {}) {
  const cov = num(coveredTo), ms = num(memStart);
  const out = { n: 0, p: 0, pending: [], missedTypes: {} };
  if (ms === null) return out;
  const judge = (r) => {
    out.n++;
    if (!(seen && typeof seen.has === 'function' && seen.has(r.vendorId))) { out.p++; const ty = String(r.msgType || 'message').slice(0, 32); out.missedTypes[ty] = (out.missedTypes[ty] || 0) + 1; }
  };
  const all = (Array.isArray(pending) ? pending : []).concat(Array.isArray(records) ? records : []);
  const dedup = new Set();
  for (const r of all) {
    if (!r || !r.vendorId || dedup.has(r.vendorId)) continue;
    dedup.add(r.vendorId);
    const at = Number(r.at) || 0;
    if (at < ms) continue;
    if (cov !== null && at <= cov) judge(r);
    else out.pending.push({ vendorId: String(r.vendorId), at, msgType: r.msgType || null });
  }
  if (out.pending.length > PENDING_SAMPLES_MAX) out.pending = out.pending.slice(out.pending.length - PENDING_SAMPLES_MAX);
  return out;
}

/** The feed's SLIDING minute of pages at `now` — no 60 s span ever holds more than the ceiling (the rxMinuteAt shape). */
function minuteAt(calls, now) {
  const t = Number(now) || 0;
  const list = (Array.isArray(calls) ? calls : []).map(Number).filter((x) => Number.isFinite(x) && x <= t && t - x < 60e3).sort((a, b) => a - b);
  return { calls: list, n: list.length, at: list.length ? list[0] : t };
}
/** Pages the feed may still send in the sliding minute. */
function pagesLeft(calls, now, perMin) { return Math.max(0, Math.floor(Number(perMin) || 0) - minuteAt(calls, now).n); }

/**
 * THE MODE the measurement decides (§2.8). `m` = the miss rate over the rolling window (channel-caps
 * `pushMissRate` over the feed's own samples — computed by the caller: this module imports nothing).
 *   measuring → carrying  at ≥ PROMOTE_MIN samples ≤ MISS_THRESHOLD missed
 *   carrying  → demoted   at > MISS_THRESHOLD over ≥ DEMOTE_MIN
 *   demoted   → carrying  at ≤ MISS_THRESHOLD over ≥ PROMOTE_MIN
 * AND a promotion only once the measurement has SPANNED `minSpanMs` (`spanMs` = now − this process's first window;
 * the caller's minimum = one full COLD cycle + the overlap + a tick). Verify r1: the samples are what a FETCH appended,
 * and the fetches the feed causes itself (its owed rows, first in every pass) only ever read conversations it FOUND —
 * a conversation whose messages it misses entirely keeps its old activity, sits in the cold tier and is read (the one
 * reading that can reveal the miss) only every 15 min; a search dropping 10 % of messages was promoted to CARRYING at
 * 216 samples with ZERO measured misses 6.7 min in (the misses surfaced at the first cold poll, demoted it 8 min
 * later). Within one cold cycle every conversation has had its own independent reading judged.
 * → { mode, flipped, from, why }
 */
function modeVerdict(mode, m, { spanMs = Infinity, minSpanMs = 0 } = {}) {
  const cur = MODES.includes(mode) ? mode : 'measuring';
  const rate = Number(m && m.rate) || 0, total = Number(m && m.total) || 0;
  const spanned = !(Number(spanMs) < Number(minSpanMs));
  if ((cur === 'measuring' || cur === 'demoted') && total >= PROMOTE_MIN && rate <= MISS_THRESHOLD && spanned) return { mode: 'carrying', flipped: true, from: cur, why: 'complete' };
  if (cur === 'carrying' && total >= DEMOTE_MIN && rate > MISS_THRESHOLD) return { mode: 'demoted', flipped: true, from: cur, why: 'missed' };
  return { mode: cur, flipped: false, from: cur, why: null };
}

/** Forget what the feed saw past its bound (count, age) — a Map mutated in place. */
function trimSeen(seen, now) {
  if (!seen || typeof seen.entries !== 'function') return 0;
  let n = 0;
  const t = Number(now) || 0;
  for (const [k, at] of seen) { if (t - Number(at) > FEED_SEEN_TTL_MS) { seen.delete(k); n++; } else break; }
  while (seen.size > FEED_SEEN_MAX) { seen.delete(seen.keys().next().value); n++; }
  return n;
}

/** A thread-owed due key (`<adapterId>/<convId>#<threadKey>`) and its reading. */
const THREAD_KEY_SEP = '#';
function threadDueKey(convKey, threadKey) { return `${convKey}${THREAD_KEY_SEP}${threadKey}`; }
/** → { convKey, threadKey } | null — split at the LAST separator, only when the conversation part is a known key. */
function splitThreadDueKey(key, isConvKey = () => true) {
  const s = String(key || '');
  const i = s.lastIndexOf(THREAD_KEY_SEP);
  if (i <= 0 || i === s.length - 1) return null;
  const convKey = s.slice(0, i);
  if (isConvKey(s)) return null;
  if (!isConvKey(convKey)) return null;
  return { convKey, threadKey: s.slice(i + 1) };
}

/** lane gmail-feed-gap (B-5134): the declared gaps the coverage net keeps per account (the oldest dropped). */
const GAPS_MAX = 20;
/**
 * lane gmail-feed-gap (B-5134, 2026-10-07 — "fetch updates, never ask each row"): THE GAP VERDICT of a CURSOR feed.
 * A silence (a laptop asleep, a server restart, a vendor outage, a rate-limit park) is a GAP: the cursor survives it
 * and the vendor answers "everything since <cursor>" in pages. It is never evidence the feed misses messages — it is
 * evidence nobody asked.
 *   rewalk    the cursor is expired (the vendor's 404) or there is none — the listing re-walk, as built
 *   catch-up  a cursor and a gap of ANY length (its last page older than the fresh bound, or none at all — a boot) —
 *             ONE paged walk from the cursor, bounded by pages, never by time; the per-row tiers stay parked
 *   fresh     no gap
 * `overCold` = the gap outlived the cold tier: the silence that used to fall to the tiers (ONE whole-index pass —
 * 10 000 due rows / 10 101 vendor calls measured on the owner's mailboxes).
 * → { verdict, gapMs (null = no page known), from, overCold }
 */
function gapVerdict({ cursor = null, lastPageAt = null, now = 0, coldTierSec = 900, expired = false, freshBoundMs = 180e3 } = {}) {
  const t = Number(now) || 0, last = num(lastPageAt);
  const gapMs = last === null || !(last > 0) ? null : Math.max(0, t - last);
  const overCold = gapMs === null || gapMs > (Number(coldTierSec) || 900) * 1000;
  if (expired || !cursor) return { verdict: 'rewalk', gapMs, from: gapMs === null ? null : last, overCold };
  if (gapMs === null || gapMs > (Number(freshBoundMs) || 180e3)) return { verdict: 'catch-up', gapMs, from: gapMs === null ? null : last, overCold };
  return { verdict: 'fresh', gapMs, from: last, overCold: false };
}
/** A gap declared to the coverage net: `{from, to}` merged into the account's list (overlaps joined, ≤ GAPS_MAX kept,
 *  newest last). → the new list (a new array). */
function addGap(gaps, g) {
  const a = num(g && g.from), b = num(g && g.to);
  const list = (Array.isArray(gaps) ? gaps : []).map((x) => ({ from: num(x && x.from), to: num(x && x.to) })).filter((x) => x.from !== null && x.to !== null && x.to > x.from);
  if (a !== null && b !== null && b > a) list.push({ from: a, to: b });
  list.sort((x, y) => x.from - y.from);
  const out = [];
  for (const x of list) { const l = out[out.length - 1]; if (l && x.from <= l.to) l.to = Math.max(l.to, x.to); else out.push({ ...x }); }
  return out.slice(-GAPS_MAX);
}
/**
 * lane gmail-feed-gap: THE COVERAGE NET with its GAPS declared — `sample` over the records whose instant lies in NO
 * declared gap (`(from, to]` each — a span the feed's own window never searched: a long stop's older part). A record
 * inside a gap is excluded (counted), never judged a miss: silence is not evidence the feed misses messages. The
 * demotion stays for a feed that PROVABLY misses — a record its own window covered and did not see.
 * → sample's answer + { excluded }
 */
function coverageOf(records, { gaps = [], ...o } = {}) {
  const iv = addGap(gaps, null);
  const inGap = (r) => { const at = Number(r && r.at) || 0; return iv.some((g) => at > g.from && at <= g.to); };
  const keep = [], pend = [];
  let excluded = 0;
  for (const r of Array.isArray(records) ? records : []) { if (inGap(r)) excluded++; else keep.push(r); }
  for (const r of Array.isArray(o.pending) ? o.pending : []) { if (inGap(r)) excluded++; else pend.push(r); }
  return { ...sample(keep, { ...o, pending: pend }), excluded };
}

/** The feed's fresh bound (§2.8): the feed carries only while its last good page is younger than this. */
function freshMs(everySec, overlapSec) { return Math.max(180e3, (3 * (Number(everySec) || 30) + (Number(overlapSec) || OVERLAP_DEFAULT_SEC)) * 1000); }

module.exports = {
  FEED_SEEN_MAX, FEED_SEEN_TTL_MS, FEED_SKEW_MS, THREAD_OWED_MAX, OWED_HITS_MAX, DESCRIBE_MAX, RANGE_SLACK_MS, TOTAL_PER_SEC_MAX,
  PROMOTE_MIN, DEMOTE_MIN, MISS_THRESHOLD, OVERLAP_MIN_SEC, OVERLAP_DEFAULT_SEC, PAGE_TOKEN_TTL_MS, PAGE_SIGS_MAX, PENDING_SAMPLES_MAX,
  FEED_VIA, FEED_AUTHORITY, TIME_UNITS, HIT_FIELDS, PARK_CODES, MODES, EPOCH_MIN_MS, ID_MAX, THREAD_KEY_SEP,
  SHAPE_BAD_SHARE, SHAPE_MIN_ITEMS, SHAPE_FIELDS_MAX, SHAPE_FIELD_NAMES_MAX, UNREADABLE_RECENT_MS, UNREADABLE_RING_MAX,
  window, isoSec, isoMs, readTime, normalizeHit, cleanHit, pageVerdict, pageSig, foldHits, mergeThreadOwed, mergeThreadReach, owedSatisfied, birthFacts,
  sample, minuteAt, pagesLeft, modeVerdict, trimSeen, threadDueKey, splitThreadDueKey, freshMs, idOf,
  fieldList, mergeFieldLists, shapeVerdict, recentUnreadable, recentUnreadableCount,
  GAPS_MAX, gapVerdict, addGap, coverageOf,
};
