'use strict';
/**
 * SLACK'S PER-METHOD RATE LIMITS, INSIDE THE ADAPTER (design 012 D3 — the contract unchanged). PURE: no I/O, no timers,
 * the clock handed in.
 *
 * Slack meters every Web API method on its own: one bucket per METHOD × WORKSPACE × APP (research §3.1, §6). An
 * internal app (each person's own — design F1) keeps the published tiers: Tier 1 = 1+/min, Tier 2 = 20+/min, Tier 3 =
 * 50+/min, Tier 4 = 100+/min, the numbers being FLOORS ("+"). The engine's account budget (`caps.budget`, one number a
 * minute) cannot say "history 50, reactions.remove 20", so this module keeps a SLIDING MINUTE PER METHOD and answers,
 * before a request is built, `go` or `wait(seconds)`; the adapter turns a `wait` into the typed `rate-limited` with
 * `retryAfterSec` — the refusal the engine's ladder already honours (design §2 alternative D). A 429 the vendor still
 * answers (another client of the same app, a tier lower than published) is honoured by `hold(method, seconds)`:
 * that method alone waits the vendor's `Retry-After` (lane lark-send-hold: the hold is the ONE shared PURE shape,
 * src/channels/vendor-hold.js — Lark's per-account send hold is the same helper keyed `'send'`).
 *
 * `chat.postMessage` is Slack's "special" limit: about one message a second PER CONVERSATION — a per-conversation
 * one-second gap (`sendGap`) beside the method's own minute.
 */
const Holds = require('./vendor-hold.js');
const TIER_PER_MIN = Object.freeze({ 1: 1, 2: 20, 3: 50, 4: 100 });
/** THE METHOD → TIER TABLE (research §2 tables; every method this adapter calls has a row — a call outside it is
 *  refused by name, never unmetered). `files.download` is the attachment GET on files.slack.com (no tier is
 *  published for it; metered like files.info). */
const METHOD_TIERS = Object.freeze({
  'auth.test': 4,
  'users.conversations': 3,
  'conversations.info': 3,
  'conversations.members': 4,
  'conversations.history': 3,
  'conversations.replies': 3,
  'chat.postMessage': 4,
  'reactions.get': 3,
  'reactions.add': 3,
  'reactions.remove': 2,
  'users.info': 4,
  'users.list': 2,
  'bots.info': 3,
  'team.info': 3,
  'emoji.list': 2,
  'files.info': 4,
  'files.download': 4,
  // lane channel-send-files: an agent's file = these three, in order (Slack's documented upload since files.upload's retirement)
  'files.getUploadURLExternal': 4,
  'files.upload': 4,
  'files.completeUploadExternal': 4,
  // lane slack-search (owner 2026-10-12): the owner's full search — `search.messages` (a user token, search:read), its
  // own bucket at the published Tier 2 floor; the engine's search row asks ≤ 10 pages of it a sliding minute
  'search.messages': 2,
});
const METHODS = Object.freeze(Object.keys(METHOD_TIERS));
const WINDOW_MS = 60 * 1000;
const SEND_GAP_MS = 1000;
/** A Retry-After longer than this is read as this (a hostile or broken header cannot park a method for a day). */
const HOLD_MAX_SEC = Holds.HOLD_MAX_SEC;
const SEND_GAP_KEYS_MAX = 2000;

/** The per-minute floor of a method (its tier's), or null for a method the table does not name. */
function perMinOf(method) { const t = METHOD_TIERS[method]; return t ? TIER_PER_MIN[t] : null; }

/**
 * ONE ACCOUNT'S BUCKETS. `take(method, now, {convId})` → `{go:true}` (the request is COUNTED) or
 * `{go:false, retryAfterSec, why}` (nothing counted); `hold(method, seconds, now)` = the vendor's own 429;
 * `view(now)` = per method `{used, perMin, heldFor}` for a card or a suite. A clock that steps BACKWARDS (skew, a
 * suite's injected clock) never frees a slot early: an instant older than the newest one counted is read as that one.
 */
function createBuckets({ perMin = null } = {}) {
  const hits = new Map();       // method -> [instants], oldest first, ≤ the method's per-minute floor
  const holds = Holds.createHolds({ maxSec: HOLD_MAX_SEC });   // method -> until: the shared vendor hold (rebases itself on the same instants)
  const sendAt = new Map();     // convId -> the last send instant
  let last = 0;                 // the newest instant this bucket was asked at (skew guard)
  const cap = (m) => { const o = perMin && typeof perMin === 'object' ? Number(perMin[m]) : NaN; return Number.isFinite(o) && o > 0 ? Math.floor(o) : perMinOf(m); };
  // verify r1 (F1): a clock that steps BACK (NTP correcting a clock that ran ahead) REBASES every stored instant by the
  // step — the counted calls, the holds and the send gaps keep their AGE (a step back frees nothing) and nothing waits
  // for the wall clock to reach an instant it will not see again (pinning the newest instant froze every method for
  // as long as the clock had run ahead: 8 h ahead once = no Slack read or send for 8 h)
  const clock = (t) => {
    const n = Number(t); const v = Number.isFinite(n) ? n : last;
    if (v < last) {
      const d = last - v;
      for (const [m, xs] of hits) hits.set(m, xs.map((x) => x - d));
      for (const [k, x] of sendAt) sendAt.set(k, x - d);
    }
    last = v;
    return v;
  };
  function take(method, t, { convId = null } = {}) {
    const n = cap(method);
    if (!n) return { go: false, retryAfterSec: null, why: 'unknown-method' };
    const at = clock(t);
    const held = holds.heldFor(method, at);
    if (held) return { go: false, retryAfterSec: held, why: 'vendor-hold' };
    const list = (hits.get(method) || []).filter((x) => at - x < WINDOW_MS);
    if (list.length >= n) {
      hits.set(method, list);
      return { go: false, retryAfterSec: Math.max(1, Math.ceil((list[0] + WINDOW_MS - at) / 1000)), why: 'method-minute' };
    }
    if (method === 'chat.postMessage' && convId !== null && convId !== undefined) {
      const k = String(convId);
      const prev = Number(sendAt.get(k)) || 0;
      if (prev && at - prev < SEND_GAP_MS) return { go: false, retryAfterSec: 1, why: 'send-gap' };
      sendAt.delete(k); sendAt.set(k, at);
      while (sendAt.size > SEND_GAP_KEYS_MAX) sendAt.delete(sendAt.keys().next().value);
    }
    list.push(at);
    hits.set(method, list);
    return { go: true, retryAfterSec: null, why: null };
  }
  function hold(method, seconds, t) { return holds.hold(method, seconds, clock(t)); }
  function view(t) {
    const at = clock(t);
    const out = {};
    const held = holds.view(at);
    for (const m of METHODS) {
      const used = (hits.get(m) || []).filter((x) => at - x < WINDOW_MS).length;
      const h = Number(held[m]) || 0;
      if (used || h) out[m] = { used, perMin: cap(m), heldFor: h };
    }
    return out;
  }
  return { take, hold, view };
}


/** THE DECLARED EGRESS (test-channels-egress): a PURE module — it constructs no request of its own (slack.js does). */
const EGRESS = Object.freeze([]);
module.exports = { EGRESS, TIER_PER_MIN, METHOD_TIERS, METHODS, WINDOW_MS, SEND_GAP_MS, HOLD_MAX_SEC, perMinOf, createBuckets };
