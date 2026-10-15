'use strict';
/**
 * THE VENDOR'S OWN "SLOW DOWN", ONE SHAPE FOR EVERY ADAPTER (lane lark-send-hold, B-efa0). PURE: no I/O, no timers,
 * the clock handed in.
 *
 * A 429 names its reset (Slack's `Retry-After`, Lark's `x-ogw-ratelimit-reset`). `hold(key, seconds, now)` keeps that
 * KEY shut until then: the LATER of two holds wins, a value is read as at least 1 s and at most `HOLD_MAX_SEC` (a
 * hostile or broken header cannot park a key for a day). `heldFor(key, now)` answers the seconds still to wait (0 = go;
 * an expired hold is forgotten at that read). `release(key, now)` = a SUCCESS: it forgets a hold whose reset has
 * passed and never one still running (a request that left before the 429 and lands after it frees nothing early).
 * Slack keys it per METHOD (slack-limits `createBuckets`); Lark per ACCOUNT (`'send'`: every send of the account waits).
 *
 * A clock that steps BACK (NTP correcting a clock that ran ahead, a suite's injected clock) REBASES every hold by the
 * step (slack-limits verify r1 F1): a hold keeps its AGE — a step back frees nothing early, and nothing waits for the
 * wall clock to reach an instant it will not see again.
 */
const HOLD_MAX_SEC = 15 * 60;
/** The most keys one holder keeps (Slack's method table is ~25; Lark holds one). The oldest-set key goes first. */
const HOLD_KEYS_MAX = 200;

function createHolds({ maxSec = HOLD_MAX_SEC } = {}) {
  const cap = Number.isFinite(Number(maxSec)) && Number(maxSec) >= 1 ? Math.floor(Number(maxSec)) : HOLD_MAX_SEC;
  const holds = new Map();   // key -> until (ms)
  let last = 0;              // the newest instant this holder was asked at (skew guard)
  const clock = (t) => {
    const n = Number(t); const v = Number.isFinite(n) ? n : last;
    if (v < last) { const d = last - v; for (const [k, u] of holds) holds.set(k, u - d); }
    last = v;
    return v;
  };
  /** The vendor's reset for `key`: held until `now + seconds` (bounded); answers the seconds it holds. */
  function hold(key, seconds, t) {
    const k = String(key);
    const s = Math.min(cap, Math.max(1, Math.ceil(Number(seconds) || 0)));
    const at = clock(t);
    const until = at + s * 1000;
    if (until > (Number(holds.get(k)) || 0)) { holds.delete(k); holds.set(k, until); }
    while (holds.size > HOLD_KEYS_MAX) holds.delete(holds.keys().next().value);
    return s;
  }
  /** Seconds `key` still waits (0 = go). */
  function heldFor(key, t) {
    const k = String(key);
    const at = clock(t);
    const u = Number(holds.get(k)) || 0;
    if (u > at) return Math.max(1, Math.ceil((u - at) / 1000));
    if (u) holds.delete(k);
    return 0;
  }
  /** The instant (ms, on the caller's clock) `key` is held until, or null. */
  function untilOf(key, t) {
    const at = clock(t);
    const u = Number(holds.get(String(key))) || 0;
    return u > at ? u : null;
  }
  /** A success on `key`: the hold is forgotten once its reset has passed (never earlier). */
  function release(key, t) { return heldFor(key, t) === 0; }
  /** `{key: seconds}` for every key still held. */
  function view(t) {
    const at = clock(t);
    const out = {};
    for (const [k, u] of holds) if (u > at) out[k] = Math.ceil((u - at) / 1000);
    return out;
  }
  return { hold, heldFor, untilOf, release, view };
}

/** THE DECLARED EGRESS (test-channels-egress): a PURE module — it constructs no request. */
const EGRESS = Object.freeze([]);
module.exports = { EGRESS, HOLD_MAX_SEC, HOLD_KEYS_MAX, createHolds };
