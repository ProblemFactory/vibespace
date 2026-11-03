'use strict';
// THE PROMPT-CACHE WARMTH OF A CONVERSATION (lane cache-warmth-tiles, 2026-11-02 — a fleet user's ask: a session
// box shows how warm its conversation's prompt cache still is, so the one about to go cold is answered first; the
// owner's rulings: OPT-IN behind `desktop.cacheWarmth`, ONE green, the band's LENGTH carries the countdown and its
// colour the tier, nothing after the cache has expired).
//
// PURE (CommonJS, so the hub and the client bundle read ONE table — src/lib imports it as it imports
// spend-authorizer.js) — no DOM, no clock of its own. The hub states each live conversation's facts in the session list it already
// answers every poll ({lastRequestAt, cacheTtlSec, cacheLostAt, inTurn} + its own `serverNow` — routes/sessions warmthDiff,
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
 *  stamp or no TTL ⇒ unknown. An account move at or after the last request ⇒ expired at once (the cache stays with the
 *  account that wrote it), until the next request. IN A TURN (`inTurn`, the turn law — the pool's hold reads the same
 *  fact) ⇒ fresh with the whole TTL left: the request in flight is writing the cache, stamp or none.
 *  → { tier, leftMs, frac (the time left, 1 → 0: the band's length), lastAt, lostAt, inTurn? } */
function warmthOf(fact, { serverNow, receivedAt, now } = {}) {
  const ttlMs = Number(fact && fact.cacheTtlSec) * 1000;
  const last = Number(fact && fact.lastRequestAt) || 0;
  const sNow = Number(serverNow), rAt = Number(receivedAt), cNow = Number(now);
  const none = { tier: 'unknown', leftMs: null, frac: null, lastAt: last || null, lostAt: null };
  if (ttlMs > 0 && fact.inTurn === true) return { tier: 'fresh', leftMs: ttlMs, frac: 1, lastAt: last || null, lostAt: null, inTurn: true };
  if (!(ttlMs > 0) || !(last > 0) || !(sNow > 0) || !Number.isFinite(rAt) || !Number.isFinite(cNow)) return none;
  const lost = Number(fact.cacheLostAt) || 0;
  if (lost >= last) return { tier: 'expired', leftMs: 0, frac: 0, lastAt: last, lostAt: lost };
  const hubNow = sNow + Math.max(0, cNow - rAt);
  const agoMs = Math.max(0, hubNow - last);
  const leftMs = Math.max(0, ttlMs - agoMs);
  return { tier: tierOf({ agoMs, ttlMs }), leftMs, frac: leftMs / ttlMs, lastAt: last, lostAt: null };
}

/** The hover words for one warmth (en keys; `t` translates, `timeText(ms)` writes an instant as HH:MM):
 *  «Cache: about N min left · last request HH:MM» («about»: the stamp is the request's RESPONSE, at most one response
 *  late; N rounded UP — 30 s left reads 1 min, never 0), «Cache expired · last
 *  request HH:MM», the move's own sentence, «Cache: warm — a turn is running»; unknown ⇒ '' (no words). */
function warmthTitle(w, { t = (s, p) => s.replace(/\{(\w+)\}/g, (m, k) => (p && p[k] != null ? String(p[k]) : m)), timeText = (ms) => new Date(ms).toTimeString().slice(0, 5) } = {}) {
  if (w && w.inTurn) return t('Cache: warm — a turn is running');
  if (!w || w.tier === 'unknown' || !w.lastAt) return '';
  if (w.lostAt) return t('Cache expired — the conversation moved to another account at {time}', { time: timeText(w.lostAt) });
  if (w.tier === 'expired') return t('Cache expired · last request {time}', { time: timeText(w.lastAt) });
  return t('Cache: about {n} min left · last request {time}', { n: Math.max(1, Math.ceil(w.leftMs / 60000)), time: timeText(w.lastAt) });
}

module.exports = { WARMTH_TIERS, WARMTH_STATES, tierOf, warmthOf, warmthTitle };
