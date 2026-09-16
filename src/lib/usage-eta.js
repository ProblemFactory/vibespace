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

// ── THE FULL-PRECISION FORM + THE ACCOUNT-LEVEL PICK (2026-09-15, owner:
// "usage界面还是可以展示下每个账号最近刷新时间的, 写成 2d21h38m 的形式就行, 跟之前差不多,
// 这样一眼扫过去就能知道哪个账号马上要可用了, 顺便可以把即将刷新的两个账号 highlight
// 一下"). The compact token above is as wide as a donut; the ROW gets one more
// label — the account's next reset in full — so a glance down the roster
// says which account is about to be usable. Two rules, both PURE:
//
//   fullEta(resetAtMs, nowMs) → `2d21h38m` / `21h38m` / `38m` / null
//     whole MINUTES (never seconds; 45 s reads "1m" exactly like compactEta,
//     the same ETA_MIN_MS guard refuses anything closer or passed), leading
//     zero units dropped, INNER zero units kept ("2d0h5m") so the column
//     stays tabular — the same spelling the taskbar popup's "· in 1d10h50m"
//     suffix has used since 2.268.6 ("跟之前差不多").
//
//   accountResetEta(entries, nowMs) → { ms, text, blocked, label, pct } | null
//     ONE instant per account: when a bucket is SPENT (its effective used
//     percentage ≥ its `spentPct` bar — the roster passes the pool's own hard
//     bars; the default 100 means "reads fully used") the account is BLOCKED
//     and the answer is the LATEST reset among its spent buckets, because
//     that is when it becomes usable again; otherwise it is the EARLIEST
//     upcoming reset among its buckets. Only a bucket that may name a
//     deadline counts (`bucketMayNameDeadline` — an empty window's reset
//     slides with the clock, B-8b12) and only a reset `fullEta` can print
//     (a spent bucket whose reset has PASSED rolled over and blocks nothing).
//     No candidate ⇒ null: "no countdown" is a fact, never "0m".

/** `resetAtMs` and `nowMs` are epoch milliseconds. Returns the full-precision
 *  countdown ('2d21h38m' / '21h38m' / '38m'), or null when the reset is
 *  missing, unparseable, passed, or under 45 s out. */
export function fullEta(resetAtMs, nowMs) {
  const at = Number(resetAtMs), now = Number(nowMs);
  if (!Number.isFinite(at) || !Number.isFinite(now)) return null;
  const rem = at - now;
  if (!(rem >= ETA_MIN_MS)) return null;
  const tm = Math.max(1, Math.round(rem / MIN_MS)); // whole minutes; 45 s rounds to 1m
  const d = Math.floor(tm / 1440), h = Math.floor((tm % 1440) / 60), m = tm % 60;
  return d ? `${d}d${h}h${m}m` : h ? `${h}h${m}m` : `${m}m`;
}

/** The account-level pick. `entries` = [{ bucket, pct, label?, spentPct? }]:
 *  `bucket` is the legacy bucket object ({resetsAt, state?}), `pct` the
 *  EFFECTIVE used percentage the row renders (estimate-aware; when absent the
 *  bucket's own usedPercent / utilization is read), `label` rides into the
 *  answer for the tooltip, `spentPct` is the bar at/above which the bucket
 *  counts as spent (default 100). Returns null when no bucket can name a
 *  countdown. */
export function accountResetEta(entries, nowMs) {
  const now = Number(nowMs);
  const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null);
  const cands = [];
  for (const e of Array.isArray(entries) ? entries : []) {
    if (!e || typeof e !== 'object') continue;
    const b = e.bucket;
    if (!bucketMayNameDeadline(b)) continue;
    const ms = bucketResetMs(b);
    const text = fullEta(ms, now);
    if (!text) continue;
    const pct = num(e.pct) ?? num(b.usedPercent) ?? (num(b.utilization) != null ? Number(b.utilization) * 100 : null);
    const bar = num(e.spentPct) ?? 100;
    cands.push({ ms, text, label: e.label ?? null, pct, spent: pct != null && pct >= bar });
  }
  if (!cands.length) return null;
  const spent = cands.filter((c) => c.spent);
  const pick = spent.length
    ? spent.reduce((a, c) => (c.ms > a.ms ? c : a))   // blocked: usable when the LAST spent bucket resets
    : cands.reduce((a, c) => (c.ms < a.ms ? c : a));  // free: the next reset of any bucket
  return { ms: pick.ms, text: pick.text, blocked: spent.length > 0, label: pick.label, pct: pick.pct };
}
