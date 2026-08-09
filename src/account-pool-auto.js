// Pooled pseudo-account AUTO-SWITCH decisions (B-6217 v2; EDF ranking v3).
// Pure functions — the engine in server.js feeds them the passive usage cache
// and acts on the verdict. ZERO API calls anywhere in this path (§ban-safety:
// decisions read data/usage-cache/*.json only — the cache the statusline hook
// / on-demand ⟳ already wrote; auto-switching must never become a scheduled
// quota poll).
//
// Semantics v3 (user-designed, 2026-08-09): quota is a PERISHABLE asset — any
// remaining expires at its window's reset. Drain the member whose weekly
// window resets SOONEST first (earliest-deadline-first): its quota is
// use-it-or-lose-it, while far-reset quota is storable. KEY FACT (user-
// confirmed + cache-verified ±1s): the model-scoped weekly caps (Fable) are
// COMPONENTS of the same 7-day window — same resetsAt — so each account has
// ONE weekly deadline and plain per-account EDF is optimal. The 5h bucket is
// a burst RATE limiter (refills ~33×/week), not a budget: it participates in
// the usability GATE only — ranking on it would degenerate into noise (every
// account's soonest reset would always be its 5h).
//
// Trigger tiers: exhaustion (<5% min-across-buckets) always switches; HOT
// pools additionally switch PROACTIVELY when another member's weekly deadline
// is strictly sooner (hot re-points are free — no restart; cold pools stay
// exhaustion-only because each switch restarts conversations).

const SWITCH_THRESHOLD_PCT = 5;
// A member with NO usable usage data ranks as if half-full: better than a
// known-exhausted target, worse than a known-good one. Members without a
// known deadline (unknown data / reset just passed) rank AFTER every member
// with a real deadline — EDF needs a deadline to promise anything.
const UNKNOWN_REMAINING_PCT = 50;
// Proactive (hot) switches require the candidate's deadline to be sooner by a
// real margin — absorbs the ±1s scoped-vs-7d rounding and cache skew.
const PROACTIVE_MARGIN_SEC = 3600;
// Exhaustion-tier anti-flap: the target must beat the current member's
// remaining by this much (two members leapfrogging inside the exhaustion band
// otherwise ping-pong every evaluation tick).
const MIN_GAIN_PCT = 3;

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

// Remaining % for one account's cache entry = min across every known bucket
// (INCLUDING 5h — this is the usability gate: a 5h-exhausted account is
// rate-limited right now no matter how attractive its weekly economics).
function accountRemaining(cache, nowSec) {
  if (!cache || typeof cache !== 'object') return { remaining: null, known: false };
  const buckets = [bucketRemaining(cache.fiveHour, nowSec), bucketRemaining(cache.sevenDay, nowSec)];
  for (const b of Array.isArray(cache.scopedWeekly) ? cache.scopedWeekly : []) buckets.push(bucketRemaining(b, nowSec));
  const known = buckets.filter((v) => v != null);
  if (!known.length) return { remaining: null, known: false };
  return { remaining: Math.min(...known), known: true };
}

// The account's ONE weekly deadline: earliest FUTURE reset among the budget
// buckets (7d + scoped weeklies). In practice they are the SAME timestamp
// (scoped caps are components of the 7d window); min() is robustness against
// rounding. null = no timing information (unknown data or all resets passed —
// a just-rolled-over window's next reset is unknowable from a stale cache).
function weeklyDeadline(cache, nowSec) {
  if (!cache || typeof cache !== 'object') return null;
  const cands = [];
  const push = (b) => { const r = Number(b?.resetsAt) || 0; if (r > nowSec) cands.push(r); };
  push(cache.sevenDay);
  for (const b of Array.isArray(cache.scopedWeekly) ? cache.scopedWeekly : []) push(b);
  return cands.length ? Math.min(...cands) : null;
}

// Decide a switch for a pool. members = [{id, name}] (already login-filtered),
// readCache(id) → parsed cache entry or null. proactive = hot pools only: also
// switch toward a strictly-sooner deadline before exhaustion. Returns null
// (stay) or {to, toName, fromRemaining, toRemaining, reason: 'exhausted'|'edf'}.
function decidePoolSwitch({ currentId, members, readCache, nowSec, proactive = false, exhaustPct = SWITCH_THRESHOLD_PCT }) {
  const curCache = readCache(currentId);
  const cur = accountRemaining(curCache, nowSec);
  const curDeadline = weeklyDeadline(curCache, nowSec);
  // exhaustPct: hot pools pass 10 with ESTIMATED views (B-fcff v2) — switch
  // before the limit interrupts a long task; the candidate GATE stays at the
  // base threshold (a 7%-left member is a legal target for a 9%-left current).
  const exhausted = cur.known && cur.remaining < exhaustPct;
  // No data on the current target → we cannot judge exhaustion; staying put is
  // safer than flapping on ignorance (the ledger will teach us eventually).
  if (!cur.known && !proactive) return null;
  if (!exhausted && !proactive) return null;

  // Rank candidates by EDF: known weekly deadline ascending; same deadline
  // (±60s) → MORE remaining first (equal-deadline order can't change total
  // utilization — both expire together — so optimize for fewer switches);
  // no-deadline candidates (unknown / reset-passed-fresh) rank last, ordered
  // by effective remaining (unknown = 50, the v2 rule).
  const ranked = [];
  for (const m of members) {
    if (m.id === currentId) continue;
    const c = readCache(m.id);
    const r = accountRemaining(c, nowSec);
    const eff = r.known ? r.remaining : UNKNOWN_REMAINING_PCT;
    if (r.known && r.remaining < SWITCH_THRESHOLD_PCT) continue; // gated: can't serve right now
    ranked.push({ id: m.id, name: m.name, eff, known: r.known, remaining: r.known ? r.remaining : null, deadline: weeklyDeadline(c, nowSec) });
  }
  ranked.sort((a, b) => {
    if (a.deadline != null && b.deadline != null) {
      if (Math.abs(a.deadline - b.deadline) > 60) return a.deadline - b.deadline;
      return b.eff - a.eff;
    }
    if (a.deadline != null) return -1;
    if (b.deadline != null) return 1;
    return b.eff - a.eff;
  });
  const best = ranked[0];
  if (!best) return null;

  if (exhausted) {
    // Must move somewhere better than the scraps we're on — by a REAL margin:
    // when two members sit in the exhaustion band together, a zero-margin
    // "strictly better" rule ping-pongs between them every evaluation tick as
    // their remainders leapfrog (each hot re-point re-records attribution +
    // toasts — pure noise for a ~1% gain).
    if (best.eff <= cur.remaining + MIN_GAIN_PCT) return null;
    return { to: best.id, toName: best.name, fromRemaining: cur.remaining, toRemaining: best.remaining, reason: 'exhausted' };
  }
  // Proactive tier (hot pools): jump to a strictly-sooner KNOWN deadline —
  // drain the soonest-expiring quota while the current target's keeps. Never
  // jump onto unknown data proactively, and never without a real margin.
  if (proactive && best.deadline != null && curDeadline != null && best.known
      && curDeadline - best.deadline > PROACTIVE_MARGIN_SEC) {
    return { to: best.id, toName: best.name, fromRemaining: cur.known ? cur.remaining : null, toRemaining: best.remaining, reason: 'edf' };
  }
  return null;
}

module.exports = { SWITCH_THRESHOLD_PCT, UNKNOWN_REMAINING_PCT, PROACTIVE_MARGIN_SEC, MIN_GAIN_PCT, bucketRemaining, accountRemaining, weeklyDeadline, decidePoolSwitch };
