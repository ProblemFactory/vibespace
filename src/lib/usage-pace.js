// Usage pacing — is a weekly quota bucket AHEAD of or BEHIND a linear burn?
// Pure functions, ZERO I/O — ported from claude-swap's pace.py (B-87fe), which
// worked out the edge cases the hard way; this keeps their constants + guards
// so we don't re-discover them. NO network, NO polling — it only interprets a
// bucket we ALREADY have (passive statusline or a human-clicked ⟳ refresh).
//
// HARD RULES (do not relax — each is a real trap claude-swap hit):
//  · Only for WEEKLY buckets (sevenDay / scopedWeekly). NEVER the 5-hour window
//    (its short period makes any usage look "way ahead"). This is a caller
//    contract — computePace does not know the bucket kind.
//  · For 24h after a reset, return null — right after a reset ANY usage reads
//    as far ahead of a near-zero expectation.
//  · If the snapshot is older than a full period, return null — a stale file
//    (we have 3-week-old passive caches) yields a confident-but-meaningless
//    number. This is stricter than claude-swap; added for our on-demand cache.
//  · projectedExhaustion() is DIAGNOSTIC ONLY — the linear-burn assumption is
//    falsely precise against bursty real usage. Never surface it on a human UI.

const WEEKLY_PERIOD_S = 7 * 86400;
const SUPPRESS_AFTER_RESET_S = 24 * 3600;
const AHEAD_THRESHOLD_PCT = 15.0;

/**
 * @param {{pct:number, resetsAtSec:number}} window  pct is 0-100; resetsAtSec is unix seconds of the NEXT reset
 * @param {number} fetchedAtSec  when the snapshot was taken (unix seconds)
 * @returns {{expectedPct, actualPct, elapsedS, periodS, ahead}|null}
 */
function computePace(window, fetchedAtSec, {
  periodS = WEEKLY_PERIOD_S,
  suppressAfterResetS = SUPPRESS_AFTER_RESET_S,
  aheadThresholdPct = AHEAD_THRESHOLD_PCT,
} = {}) {
  if (!window || typeof fetchedAtSec !== 'number') return null;
  const pct = window.pct;
  const nextReset = window.resetsAtSec;
  if (typeof pct !== 'number' || !isFinite(pct)) return null;
  if (typeof nextReset !== 'number' || !isFinite(nextReset)) return null;

  // (nextReset - fetchedAt) mod period == time remaining until the next reset,
  // folded into [0, period). period minus that = elapsed since the window
  // started — correct no matter how many whole cycles nextReset is ahead/behind.
  const mod = (((nextReset - fetchedAtSec) % periodS) + periodS) % periodS; // JS % can be negative
  const elapsed = mod === 0 ? 0 : periodS - mod;

  if (elapsed < suppressAfterResetS) return null;
  // stale-snapshot guard (ours): a fetch older than a full period is meaningless
  if (fetchedAtSec < Date.now() / 1000 - periodS) return null;

  const expectedPct = Math.min(100, (elapsed / periodS) * 100);
  const ahead = (pct - expectedPct) >= aheadThresholdPct;
  return { expectedPct, actualPct: pct, elapsedS: elapsed, periodS, ahead };
}

/** Linear-burn ETA to 100% (unix seconds). DIAGNOSTIC ONLY — never on a human UI. */
function projectedExhaustionTs(pace, fetchedAtSec) {
  if (!pace || pace.elapsedS <= 0 || pace.actualPct <= 0) return null;
  const ratePctPerS = pace.actualPct / pace.elapsedS;
  if (ratePctPerS <= 0) return null;
  const remainingPct = 100 - pace.actualPct;
  if (remainingPct <= 0) return fetchedAtSec; // already exhausted
  return fetchedAtSec + remainingPct / ratePctPerS;
}

module.exports = { computePace, projectedExhaustionTs, WEEKLY_PERIOD_S, SUPPRESS_AFTER_RESET_S, AHEAD_THRESHOLD_PCT };
