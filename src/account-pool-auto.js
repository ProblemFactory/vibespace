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
// PER-BUCKET-KIND thresholds (2.268.2, user-designed: what matters is
// ABSOLUTE headroom, not relative — 1% of a 7d window ≈ $17 vs 1% of a 5h
// window ≈ $2-5, so 5% weekly ≈ $87 of buffer while 10% of 5h can be one
// long turn). hot = soft-exhaustion trigger for HOT pools (free re-points);
// hard = genuinely-unusable / candidate gate / cold pools' only trigger.
const THRESH = {
  fiveHour: { hot: 10, hard: 5 },
  weekly: { hot: 5, hard: 3 }, // 7d + scoped (Fable) — big windows, more slack
};
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

// Per-bucket remainings tagged by KIND (fiveHour vs weekly) — the threshold
// unit of the 2.268.2 layered scheme.
function bucketRems(cache, nowSec) {
  if (!cache || typeof cache !== 'object') return [];
  const out = [];
  const push = (kind, b) => { const r = bucketRemaining(b, nowSec); if (r != null) out.push({ kind, remaining: r }); };
  push('fiveHour', cache.fiveHour);
  push('weekly', cache.sevenDay);
  for (const b of Array.isArray(cache.scopedWeekly) ? cache.scopedWeekly : []) push('weekly', b);
  return out;
}

// Decide a switch for a pool. members = [{id, name}] (already login-filtered),
// readCache(id) → parsed cache entry or null. proactive/hot = hot pools:
// re-points are free, so they soft-exhaust at the RAISED per-kind thresholds
// and jump proactively toward sooner deadlines; cold pools only move at the
// hard thresholds (each switch restarts conversations). Returns null (stay)
// or {to, toName, fromRemaining, toRemaining, reason: 'exhausted'|'edf'}.
// pessimism = {accountId: pct} — OFFLINE-BIAS defense (2.297.0, design
// §Cross-device): an account whose spend partly flows through a machine that
// is ACTIVE but DARK (recent ledger events + link down) is systematically
// UNDER-estimated (its invisible burn keeps accruing), so its effective
// remaining is docked by pct on BOTH sides of a decision — the current
// target trips exhaustion earlier AND a dark-tainted candidate looks worse
// (switching ONTO invisible burn is as dangerous as staying on it).
function decidePoolSwitch({ currentId, members, readCache, nowSec, proactive = false, hot = proactive, pessimism = {} }) {
  const dock = (id, brs) => brs.map((b) => ({ ...b, remaining: Math.max(0, b.remaining - (pessimism[id] || 0)) }));
  const dockRem = (id, r) => (r.known ? { ...r, remaining: Math.max(0, r.remaining - (pessimism[id] || 0)) } : r);
  const curCache = readCache(currentId);
  const cur = dockRem(currentId, accountRemaining(curCache, nowSec)); // min% — display/scraps comparison
  const curDeadline = weeklyDeadline(curCache, nowSec);
  const curBr = dock(currentId, bucketRems(curCache, nowSec));
  const soft = (b) => b.remaining < (hot ? THRESH[b.kind].hot : THRESH[b.kind].hard);
  const dead = (b) => b.remaining < THRESH[b.kind].hard;
  // Per-KIND thresholds (user-designed): what matters is ABSOLUTE headroom —
  // a weekly bucket at 88% still holds ~$200, a 5h bucket at 90% one long
  // turn. exhausted = ANY bucket under its kind's (hot-raised) threshold.
  const exhausted = cur.known && curBr.some(soft);
  const hardDead = cur.known && curBr.some(dead);
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
    const r = dockRem(m.id, accountRemaining(c, nowSec));
    const br = dock(m.id, bucketRems(c, nowSec));
    const eff = r.known ? r.remaining : UNKNOWN_REMAINING_PCT;
    if (r.known && br.some(dead)) continue; // gated: some bucket below its hard floor — can't serve
    // settleOk: every bucket clears its kind's HOT threshold + margin — a
    // voluntary move must land somewhere that won't itself soft-exhaust
    // (the 2.266.1 oscillation guard, now per-kind)
    const settleOk = r.known && br.length > 0 && br.every((b) => b.remaining >= THRESH[b.kind].hot + MIN_GAIN_PCT);
    ranked.push({ id: m.id, name: m.name, eff, known: r.known, settleOk, remaining: r.known ? r.remaining : null, deadline: weeklyDeadline(c, nowSec) });
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
  if (!ranked.length) return null;

  const bestSettle = ranked.find((r) => r.settleOk) || null;
  if (exhausted) {
    if (hardDead) {
      // genuinely unusable — any meaningfully-better member beats staying,
      // even one below the settle bar (scraps > nothing)
      const best = ranked[0];
      if (best.eff <= cur.remaining + MIN_GAIN_PCT) return null;
      return { to: best.id, toName: best.name, fromRemaining: cur.remaining, toRemaining: best.remaining, reason: 'exhausted' };
    }
    // soft-exhausted (only a hot-raised threshold tripped): still usable,
    // so only move somewhere that can actually SETTLE
    if (!bestSettle) return null;
    return { to: bestSettle.id, toName: bestSettle.name, fromRemaining: cur.remaining, toRemaining: bestSettle.remaining, reason: 'exhausted' };
  }
  // Proactive tier (hot pools): jump to a strictly-sooner KNOWN deadline —
  // drain the soonest-expiring quota while the current target's keeps. Never
  // jump onto unknown data, never without a real deadline margin, and never
  // onto a member below the settle bar (the oscillation guard above).
  if (proactive && bestSettle && bestSettle.deadline != null && curDeadline != null && bestSettle.known
      && curDeadline - bestSettle.deadline > PROACTIVE_MARGIN_SEC) {
    return { to: bestSettle.id, toName: bestSettle.name, fromRemaining: cur.known ? cur.remaining : null, toRemaining: bestSettle.remaining, reason: 'edf' };
  }
  return null;
}

module.exports = { SWITCH_THRESHOLD_PCT, THRESH, UNKNOWN_REMAINING_PCT, PROACTIVE_MARGIN_SEC, MIN_GAIN_PCT, bucketRemaining, bucketRems, accountRemaining, weeklyDeadline, decidePoolSwitch };
