'use strict';
/**
 * THE SCHEDULER CARD'S CLOCK CENSUS — PURE (lane scheduler-census-index, B-7978, 2026-10-07).
 *
 * WHY THIS FILE EXISTS. The account card's "hot · warm · cold · due" line counted every row's cadence AT THE INSTANT:
 * a walk of every conversation of the index for every account on every census (≈ 270 ms a pass at 90 298 rows, 6
 * accounts — the last O(rows) term of the aggregated IM's pass, beside the ≈ 10 ms due path). A row's clock class is
 * piecewise constant in time: its tier holds until its message's age leaves the window (`caps.tierUntil`), a watch
 * holds until its heartbeat ends, `due` flips once at `lastPollAt + seconds`. So each row is judged ONCE with the
 * instant until which that judgement holds; the engine keeps the per-account counters and re-judges a row only when a
 * write touched it (`index.onTouch`, a poll stamp, a watch start) or the clock passed its instant — a census is
 * O(touched + crossed), never O(rows). The definition stays the walk (`schedulerExact`); the parity gate holds the
 * kept counters to it after every step of a seeded walk (scripts/test-channel-census.mjs).
 *
 * No clock, no I/O, imports nothing (CJS: the engine and the gate share it).
 */

/** The clock-moved counters of one account. */
const emptyCounts = () => ({ hot: 0, warm: 0, cold: 0, due: 0 });

/**
 * ONE row's clock facts at instant `t`, from the cadence the caller resolved AT `t` (caps.cadenceFor):
 *   in = { counted, paused, tier, seconds, lastPollAt, tierUntil, watchUntil }
 *     counted    false = an unlisted row (the census skips it)
 *     tierUntil  the last instant the unwatched tier holds (inclusive; Infinity = cold for good)
 *     watchUntil the watch's end (exclusive; 0 = not watched)
 * → { cls: 'hot'|'warm'|'cold'|null (paused / not counted), due: 0|1, at, eq } — the judgement holds while
 *   t' < at, or t' === at too unless `eq` (eq = the class changes AT `at`: a due instant, a watch's end).
 */
function rowClock(row, t) {
  if (!row || row.counted === false) return { cls: null, due: 0, at: Infinity, eq: 0 };
  if (row.paused) return { cls: null, due: 0, at: Infinity, eq: 0 };
  const cls = row.tier === 'hot' || row.tier === 'warm' ? row.tier : 'cold';
  // the tier: a watched row is hot until its heartbeat ends; else the age window (held through its last instant)
  let at = Infinity, eq = 0;
  const w = Number(row.watchUntil) || 0;
  if (w > t) { at = w; eq = 1; } else { const u = Number(row.tierUntil); if (u !== Infinity && Number.isFinite(u)) at = u; }
  // due by the timer: lastPollAt + seconds ≤ t (seconds 0 / null = never by the clock)
  let due = 0;
  const s = Number(row.seconds) || 0;
  if (s > 0) {
    const d = (Number(row.lastPollAt) || 0) + s * 1000;
    if (d <= t) due = 1;
    else if (d < at || (d === at && !eq)) { at = d; eq = 1; }
  }
  return { cls, due, at, eq };
}

/** Has the clock passed a judgement's instant at `t` (the row must be re-judged)? */
const expired = (j, t) => j.at < t || (j.at === t && !!j.eq);

/** The order the engine keeps judgements in (soonest first; at one instant the `eq` ones — expired AT it — first). */
const untilCmp = (a, b) => (a.at - b.at) || ((b.eq ? 1 : 0) - (a.eq ? 1 : 0)) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

/**
 * THE STEP: how ONE touched row moves its account's counters — the old judgement out, the new one in (either may be
 * null: a row born / gone). Mutates and returns `kept`.
 */
function censusStep(kept, was, now) {
  if (was) { if (was.cls) kept[was.cls]--; if (was.due) kept.due--; }
  if (now) { if (now.cls) kept[now.cls]++; if (now.due) kept.due++; }
  return kept;
}

module.exports = { emptyCounts, rowClock, expired, untilCmp, censusStep };
