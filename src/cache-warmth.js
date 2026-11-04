'use strict';
// THE PROMPT-CACHE WARMTH OF A CONVERSATION (lane cache-warmth-tiles, 2026-11-02 — a fleet user's ask: a session
// box shows how warm its conversation's prompt cache still is, so the one about to go cold is answered first; the
// owner's rulings: OPT-IN behind `desktop.cacheWarmth`, ONE green, the band's LENGTH carries the countdown and its
// colour the tier, nothing after the cache has expired).
//
// PURE (CommonJS, so the hub and the client bundle read ONE table — src/lib imports it as it imports
// spend-authorizer.js) — no DOM, no clock of its own. The hub states each live conversation's facts in the session list it already
// answers every poll ({lastRequestAt, cacheTtlSec, lost, inFlight, turnStartedAt} + its own `serverNow` — routes/sessions warmthDiff,
// over usage-pool-engine cacheFactsOf: the SAME facts the pool's warm-cache hold judges, so the colour a person sees
// and the hold the pool applies never disagree). This module places them on the HUB's clock and names the tier.

/** The tier table — a fleet user's defaults for the 1-hour cache, kept as SIXTIETHS of the TTL so every TTL gets the
 *  same proportions (5 minutes: fresh under 100 s, mid under 200 s, late under 250 s, critical under 300 s). */
const WARMTH_TIERS = Object.freeze([
  Object.freeze({ tier: 'fresh', below: 20 }),     // 0–20 min of the hour
  Object.freeze({ tier: 'mid', below: 40 }),       // 20–40
  Object.freeze({ tier: 'late', below: 50 }),      // 40–50
  Object.freeze({ tier: 'critical', below: 60 }),  // 50–60 («快熄火»)
]);
/** every value tierOf can answer, in order (the theme's tokens: --warmth-fresh … --warmth-expired; unknown draws nothing) */
const WARMTH_STATES = Object.freeze(['fresh', 'mid', 'late', 'critical', 'expired', 'unknown']);
// (no stamp is never «expired»: an idle conversation whose stream named no request yet is unknown and draws nothing)

/** {agoMs, ttlMs} → 'fresh' | 'mid' | 'late' | 'critical' | 'expired' | 'unknown'. A boundary belongs to the LATER
 *  tier (20:00 exactly is mid; the TTL exactly is expired — the pool's own inequality: warm while ago < ttl). Integer
 *  arithmetic (ago × 60 against sixtieths × ttl), so no boundary moves by a float's last bit. No TTL ⇒ unknown. */
function tierOf({ agoMs, ttlMs } = {}) {
  const ago = Number(agoMs), ttl = Number(ttlMs);
  if (!(ttl > 0) || !Number.isFinite(ago)) return 'unknown';
  const a = Math.max(0, ago);
  for (const r of WARMTH_TIERS) if (a * 60 < r.below * ttl) return r.tier;
  return 'expired';
}

/** One conversation's warmth BY THE HUB'S CLOCK. `fact` = its session-list entry; `serverNow` = the hub's clock in
 *  that answer; `receivedAt` = this device's clock when the answer arrived; `now` = this device's clock now. The hub's
 *  now = serverNow + (now − receivedAt) — the For-you deadline cards' rule (user-todos-row hubNow): this device's clock
 *  only ever measures the time SINCE the answer, never an instant (a step backwards counts as none). No serverNow, no
 *  stamp or no TTL ⇒ unknown. `lost` (the hub's: the conversation's link names another member than the one that served
 *  its last request) ⇒ expired at once, until the next request. A REQUEST IN FLIGHT (`inFlight` + `turnStartedAt`, the
 *  bounded turn law — the pool's hold reads the same facts) that went out after the last request ⇒ fresh with the
 *  whole TTL left while it is younger than one TTL (each request re-times the cache); a turn PAUSED on the owner is not
 *  in flight and reads its stamp like idle (the band ages).
 *  THE PROVENANCE (lane cache-warmth-compact, amendment 1): a fact whose TTL the last response WROTE (`ttlSource:
 *  'record'`) carries `source` = {ttlSec, observed, read, created} — the band is a projection from that record, and the
 *  hover says so; an unknown with a reason (`unknown: 'compacted' | 'no-request' | 'unseen'`) stays tier 'unknown' (nothing drawn)
 *  and carries the reason for the hover alone.
 *  → { tier, leftMs, frac (the time left, 1 → 0: the band's length), lastAt, lost?, inFlight?, source?, unknown? } */
function warmthOf(fact, { serverNow, receivedAt, now } = {}) {
  const ttlMs = Number(fact && fact.cacheTtlSec) * 1000;
  const last = Number(fact && fact.lastRequestAt) || 0;
  const sNow = Number(serverNow), rAt = Number(receivedAt), cNow = Number(now);
  const why = fact && (fact.unknown === 'compacted' || fact.unknown === 'no-request' || fact.unknown === 'unseen') ? fact.unknown : null;
  if (why) return { tier: 'unknown', leftMs: null, frac: null, lastAt: null, unknown: why };
  const none = { tier: 'unknown', leftMs: null, frac: null, lastAt: last || null };
  if (!(ttlMs > 0) || !(sNow > 0) || !Number.isFinite(rAt) || !Number.isFinite(cNow)) return none;
  const hubNow = sNow + Math.max(0, cNow - rAt);
  const sent = fact.inFlight === true ? Number(fact.turnStartedAt) || 0 : 0;
  if (sent > last && hubNow - sent < ttlMs) return { tier: 'fresh', leftMs: ttlMs, frac: 1, lastAt: last || null, inFlight: true };
  if (!(last > 0)) return none;
  if (fact.lost === true) return { tier: 'expired', leftMs: 0, frac: 0, lastAt: last, lost: true };
  const agoMs = Math.max(0, hubNow - last);
  const leftMs = Math.max(0, ttlMs - agoMs);
  const source = fact.ttlSource === 'record' && fact.cacheObserved
    ? { source: { ttlSec: ttlMs / 1000, observed: fact.cacheObserved, read: Number(fact.cacheReadTokens) || 0, created: Number(fact.cacheCreatedTokens) || 0 } } : {};
  return { tier: tierOf({ agoMs, ttlMs }), leftMs, frac: leftMs / ttlMs, lastAt: last, ...source };
}
/** a token count as the hover writes it: 950 · 42k · 1.2M */
const tokensText = (n) => { const v = Math.max(0, Number(n) || 0); return v >= 1e6 ? (Math.round(v / 1e5) / 10) + 'M' : v >= 1000 ? Math.round(v / 1000) + 'k' : String(v); };

/** The hover words for one warmth (en keys; `t` translates, `timeText(ms)` writes an instant as HH:MM):
 *  «Cache: about N min left · last request HH:MM» («about»: the stamp is the request's RESPONSE, at most one response
 *  late; N rounded UP — 30 s left reads 1 min, never 0), «Cache expired · last
 *  request HH:MM», the move's own sentence, «Cache: warm — a turn is running» (only while a request is in flight);
 *  unknown ⇒ '' (no words).
 *  THE PROVENANCE (lane cache-warmth-compact, amendment 1): a live warmth whose TTL the last response wrote says what it
 *  projects from — «Cache: about N min left — projected from the 1-hour cache of the last request (read 42k
 *  tokens at 18:16)» (wrote … for a first write; «the earlier cache was not reused · wrote …» for a cold one); an unknown with a
 *  reason says it — «Cache reset — the conversation was compacted», «Cache: unknown — no request yet» (only a conversation
 *  this hub started), «Cache: unknown — the time of its last request is not known» (restored / resumed — round 2). */
function warmthTitle(w, { t = (s, p) => s.replace(/\{(\w+)\}/g, (m, k) => (p && p[k] != null ? String(p[k]) : m)), timeText = (ms) => new Date(ms).toTimeString().slice(0, 5) } = {}) {
  if (w && w.inFlight) return t('Cache: warm — a turn is running');
  if (w && w.tier === 'unknown' && w.unknown === 'compacted') return t('Cache reset — the conversation was compacted');
  if (w && w.tier === 'unknown' && w.unknown === 'no-request') return t('Cache: unknown — no request yet');
  if (w && w.tier === 'unknown' && w.unknown === 'unseen') return t('Cache: unknown — the time of its last request is not known');
  if (!w || w.tier === 'unknown' || !w.lastAt) return '';
  if (w.lost) return t('Cache expired — the conversation moved to another account · last request {time}', { time: timeText(w.lastAt) });
  if (w.tier === 'expired') return t('Cache expired · last request {time}', { time: timeText(w.lastAt) });
  const n = Math.max(1, Math.ceil(w.leftMs / 60000)), time = timeText(w.lastAt), src = w.source;
  if (src && (src.ttlSec === 3600 || src.ttlSec === 300)) {
    const cache = src.ttlSec === 3600 ? t('1-hour cache') : t('5-minute cache');
    if (src.observed === 'read') return t('Cache: about {n} min left — projected from the {cache} of the last request (read {k} tokens at {time})', { n, cache, k: tokensText(src.read), time });
    if (src.observed === 'cold') return t('Cache: about {n} min left — projected from the {cache} of the last request (the earlier cache was not reused · wrote {k} tokens at {time})', { n, cache, k: tokensText(src.created), time });
    if (src.observed === 'created') return t('Cache: about {n} min left — projected from the {cache} of the last request (wrote {k} tokens at {time})', { n, cache, k: tokensText(src.created), time });
  }
  return t('Cache: about {n} min left · last request {time}', { n, time });
}

/** Rank of a LIVE tier (higher = worse); expired / unknown are not live (lane cache-warmth-band, q-059 r1b). */
const LIVE_RANK = Object.freeze({ fresh: 0, mid: 1, late: 2, critical: 3 });
const liveRank = (w) => (w && Object.prototype.hasOwnProperty.call(LIVE_RANK, w.tier) ? LIVE_RANK[w.tier] : -1);

/** The worst LIVE warmth among `ws` (warmthOf results; null entries skipped): the highest live tier, ties → the smaller
 *  frac. No live one but an expired one ⇒ that expired one. Nothing known ⇒ null. A group tile, a desktop's ring, the
 *  folded button, the «+N» dot and a window-list host row all ask it (the owner's rule: the worst LIVE tier — an expired
 *  cache is nothing left to save, so it never outranks one that is about to go). */
function worstOf(ws) {
  let worst = null, expired = null;
  for (const w of ws || []) {
    const r = liveRank(w);
    if (r < 0) { if (!expired && w && w.tier === 'expired') expired = w; continue; }
    const b = liveRank(worst);
    if (r > b || (r === b && w.frac < worst.frac)) worst = w;
  }
  return worst || expired;
}

/** The summary's counts over known warmths: { critical, late, expired, known } (unknown never counted). */
function warmthCounts(ws) {
  const c = { critical: 0, late: 0, expired: 0, known: 0 };
  for (const w of ws || []) {
    if (!w || (liveRank(w) < 0 && w.tier !== 'expired')) continue;
    c.known++;
    if (w.tier === 'critical' || w.tier === 'late' || w.tier === 'expired') c[w.tier]++;
  }
  return c;
}

/** Comparator, time left ascending: live by leftMs, then expired, then unknown/null; equal ⇒ 0 (Array#sort is stable, so
 *  the caller's order breaks ties). */
function byTimeLeft(a, b) {
  const cls = (w) => (liveRank(w) >= 0 ? 0 : w && w.tier === 'expired' ? 1 : 2);
  const ca = cls(a), cb = cls(b);
  if (ca !== cb) return ca - cb;
  return ca === 0 ? (Number(a.leftMs) || 0) - (Number(b.leftMs) || 0) : 0;
}

module.exports = { WARMTH_TIERS, WARMTH_STATES, tierOf, warmthOf, warmthTitle, worstOf, warmthCounts, byTimeLeft, tokensText };
