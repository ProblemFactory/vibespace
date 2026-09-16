// WHEN DOES THIS BUCKET RESET, IN ONE SHORT TOKEN — PURE (imports nothing,
// DOM-free; the clock is an ARGUMENT so the table test never depends on the
// time of day).
//
// 2026-09-14, owner: "想办法把每个进度条的刷新时间都展示出来, 同时不能让画面太挤:
// 在每个 pie 下面加一个 15h(剩余 2h–72h)、3d(>72h, 四舍五入)、65m(<2h)". The
// roster used to print ONE countdown per row (the tightest bucket's, in the
// age cell) and put the others in tooltips; now every donut carries its own,
// so the label has to be as short as a donut is wide. Three bands, one rule:
//
//   remaining < 45 s ................ null   (the roster's existing guard: a
//                                             reset this close, or already
//                                             passed, is not a countdown)
//   45 s ≤ remaining < 2 h .......... `${m}m`  m = round(remaining / 1 min)
//   2 h  ≤ remaining < 72 h ......... `${h}h`  h = round(remaining / 1 h)
//   72 h ≤ remaining ................ `${d}d`  d = round(remaining / 24 h)
//
// so 119.5 min reads "120m", 71.99 h reads "72h", 72 h reads "3d", 84 h reads
// "4d". Rounding happens INSIDE the band the remaining time falls in, never
// across the boundary (a value just under 2 h is minutes, however it rounds).
//
// A WINDOW THAT HAS NOT STARTED HAS NO DEADLINE (B-8b12, src/quota-model.js
// `windowState`/`bucketCounts`): an empty window answers `resetsAt = now +
// duration` on every read, so its "reset" slides with the clock and printing
// it as a countdown is the lie the quota model exists to stop. `bucketEta`
// refuses such a bucket the way `bucketCounts` does — only a bucket whose
// `state` is absent (a legacy file) or 'running' may name a deadline. The
// taskbar and any later surface ask the SAME two functions.

export const ETA_MIN_MS = 45 * 1000;
const MIN_MS = 60 * 1000, HOUR_MS = 60 * MIN_MS, DAY_MS = 24 * HOUR_MS;

/** `resetAtMs` and `nowMs` are epoch milliseconds. Returns '65m' / '15h' / '3d',
 *  or null when the reset is missing, unparseable, passed, or under 45 s out. */
export function compactEta(resetAtMs, nowMs) {
  const at = Number(resetAtMs), now = Number(nowMs);
  if (!Number.isFinite(at) || !Number.isFinite(now)) return null;
  const rem = at - now;
  if (!(rem >= ETA_MIN_MS)) return null;
  if (rem < 2 * HOUR_MS) return `${Math.round(rem / MIN_MS)}m`;
  if (rem < 72 * HOUR_MS) return `${Math.round(rem / HOUR_MS)}h`;
  return `${Math.round(rem / DAY_MS)}d`;
}

/** The reset instant of a legacy bucket in MILLISECONDS, or null. The usage
 *  cache stores `resetsAt` in unix SECONDS; a millisecond value is tolerated
 *  (the roster has always accepted both), zero/negative means "none stated". */
export function bucketResetMs(bucket) {
  const r = bucket && typeof bucket === 'object' ? Number(bucket.resetsAt) : NaN;
  if (!Number.isFinite(r) || r <= 0) return null;
  return r > 1e12 ? r : r * 1000;
}

/** MAY THIS BUCKET NAME A DEADLINE? The legacy spelling of quota-model's
 *  `bucketCounts`: a bucket with no `state` (older files) or 'running' may; an
 *  'empty' window (its reset slides) or an 'unknown' one (nothing stated) may
 *  not. Kept here so a reader that only has the derived view asks the same
 *  question the model answers. */
export function bucketMayNameDeadline(bucket) {
  if (!bucket || typeof bucket !== 'object') return false;
  return bucket.state === undefined || bucket.state === null || bucket.state === 'running';
}

/** The compact countdown for a legacy bucket ({resetsAt, state?}), or null
 *  when the bucket may not name a deadline or states none. */
export function bucketEta(bucket, nowMs) {
  if (!bucketMayNameDeadline(bucket)) return null;
  return compactEta(bucketResetMs(bucket), nowMs);
}
