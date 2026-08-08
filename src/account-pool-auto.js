// Pooled pseudo-account AUTO-SWITCH decisions (B-6217 v2). Pure functions —
// the engine in server.js feeds them the passive usage cache and acts on the
// verdict. ZERO API calls anywhere in this path (§ban-safety: decisions read
// data/usage-cache/*.json only — the cache the statusline hook / on-demand ⟳
// already wrote; auto-switching must never become a scheduled quota poll).
//
// Semantics (user spec, 2026-08-08): at turn end, if the pool's CURRENT target
// has under SWITCH_THRESHOLD_PCT remaining — taking the MINIMUM across every
// bucket we know (5h, 7d, and each model-scoped weekly like Fable) — switch to
// the member with the MOST remaining by the same min-across-buckets measure.

const SWITCH_THRESHOLD_PCT = 5;
// A member with NO usable usage data ranks as if half-full: better than a
// known-exhausted target (switching away from <5% is the whole point), worse
// than a known-good one. Wrong guesses self-correct at the next turn end.
const UNKNOWN_REMAINING_PCT = 50;

// Remaining % for one bucket ({utilization: 0..1, resetsAt: unix seconds}).
// A reset that already PASSED means the window rolled over since the reading
// was captured — the stale utilization is meaningless and the bucket is full
// again (the passive cache only updates while a terminal session is active,
// so week-old readings are normal, not an error).
function bucketRemaining(b, nowSec) {
  if (!b || typeof b !== 'object') return null;
  const reset = Number(b.resetsAt) || 0;
  if (reset && reset < nowSec) return 100;
  const u = Number(b.utilization);
  if (!Number.isFinite(u)) return null;
  return Math.max(0, Math.min(100, Math.round((1 - u) * 10000) / 100)); // 2-decimal: (1-0.9)*100 is 9.999999999999998
}

// Remaining % for one account's cache entry = min across every known bucket.
function accountRemaining(cache, nowSec) {
  if (!cache || typeof cache !== 'object') return { remaining: null, known: false };
  const buckets = [bucketRemaining(cache.fiveHour, nowSec), bucketRemaining(cache.sevenDay, nowSec)];
  for (const b of Array.isArray(cache.scopedWeekly) ? cache.scopedWeekly : []) buckets.push(bucketRemaining(b, nowSec));
  const known = buckets.filter((v) => v != null);
  if (!known.length) return { remaining: null, known: false };
  return { remaining: Math.min(...known), known: true };
}

// Decide a switch for a pool. members = [{id, name}] (already login-filtered),
// readCache(id) → parsed cache entry or null. Returns null (stay) or
// {to, toName, fromRemaining, toRemaining} — toRemaining null = unknown data.
function decidePoolSwitch({ currentId, members, readCache, nowSec }) {
  const cur = accountRemaining(readCache(currentId), nowSec);
  // No data on the current target → we cannot judge exhaustion; staying put is
  // safer than flapping on ignorance (the ledger will teach us eventually).
  if (!cur.known) return null;
  if (cur.remaining >= SWITCH_THRESHOLD_PCT) return null;
  let best = null;
  for (const m of members) {
    if (m.id === currentId) continue;
    const r = accountRemaining(readCache(m.id), nowSec);
    const eff = r.known ? r.remaining : UNKNOWN_REMAINING_PCT;
    if (!best || eff > best.eff) best = { id: m.id, name: m.name, eff, known: r.known, remaining: r.known ? r.remaining : null };
  }
  if (!best) return null;
  if (best.eff <= cur.remaining) return null; // nowhere better to go
  return { to: best.id, toName: best.name, fromRemaining: cur.remaining, toRemaining: best.remaining };
}

module.exports = { SWITCH_THRESHOLD_PCT, UNKNOWN_REMAINING_PCT, bucketRemaining, accountRemaining, decidePoolSwitch };
