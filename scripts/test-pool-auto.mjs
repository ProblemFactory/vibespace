// B-6217 auto-switch decision logic (pure; the server engine feeds it the
// passive usage cache). v3 EDF semantics (user-designed 2026-08-09): quota is
// perishable — drain the member whose WEEKLY deadline (7d reset == scoped
// Fable reset, same window) is soonest. 5h = usability gate only. Exhaustion
// (<5% min-across-buckets incl 5h) always switches; hot pools also switch
// proactively toward a strictly-sooner deadline (margin 1h).
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { bucketRemaining, accountRemaining, weeklyDeadline, decidePoolSwitch } = require(path.resolve('src/account-pool-auto.js'));

let pass = 0, fail = 0;
const ck = (n, c) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };
const NOW = 1800000000; // unix seconds
const H = 3600, D = 86400;
const fut = NOW + H, past = NOW - H;

// ── primitives (unchanged v2 semantics) ──────────────────────────────────────
ck('bucket: 90% used → 10 remaining', bucketRemaining({ utilization: 0.9, resetsAt: fut }, NOW) === 10);
ck('bucket: reset PASSED → full again (stale reading is meaningless)', bucketRemaining({ utilization: 0.98, resetsAt: past }, NOW) === 100);
ck('bucket: garbage → null', bucketRemaining({ utilization: 'x' }, NOW) === null);
ck('account: min across 5h/7d/scoped (gate incl. 5h)', accountRemaining({ fiveHour: { utilization: 0.5, resetsAt: fut }, sevenDay: { utilization: 0.2, resetsAt: fut }, scopedWeekly: [{ name: 'Fable', utilization: 0.97, resetsAt: fut }] }, NOW).remaining === 3);
ck('account: no data → unknown', accountRemaining({}, NOW).known === false);

// ── weeklyDeadline: 5h EXCLUDED, 7d==Fable (same window) collapse to one ─────
const acct = (u7, resetIn, { u5 = 0, r5 = NOW + 1800, uf = null } = {}) => ({
  fiveHour: { utilization: u5, resetsAt: r5 },
  sevenDay: { utilization: u7, resetsAt: NOW + resetIn },
  scopedWeekly: uf == null ? [] : [{ name: 'Fable', utilization: uf, resetsAt: NOW + resetIn }], // same reset (user fact, cache-verified)
});
ck('deadline = 7d reset, NOT the (sooner) 5h reset', weeklyDeadline(acct(0.3, 3 * D), NOW) === NOW + 3 * D);
ck('deadline: Fable shares the 7d reset (min = same value)', weeklyDeadline(acct(0.3, 3 * D, { uf: 0.5 }), NOW) === NOW + 3 * D);
ck('deadline: all resets passed → null (new window unknowable)', weeklyDeadline({ sevenDay: { utilization: 0.5, resetsAt: past } }, NOW) === null);
ck('deadline: no data → null', weeklyDeadline(null, NOW) === null);

// ── exhaustion-triggered switch picks by EDF, not by most-remaining ──────────
// (per-KIND thresholds since 2.268.2: weekly hard=3/hot=5, 5h hard=5/hot=10 —
// absolute headroom reasoning, user-designed)
const members = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];
const run = (caches, opts = {}) => decidePoolSwitch({ currentId: 'a', members, readCache: (id) => caches[id] ?? null, nowSec: NOW, ...opts });

ck('current healthy + not proactive → stay', run({ a: acct(0.5, 3 * D), b: acct(0, 12 * H) }) === null);
ck('current unknown → stay (never flap on ignorance)', run({ b: acct(0, 12 * H) }) === null);
// B resets in 12h with 40% left; C resets in 6d with 90% left → EDF picks B
// (its quota is about to expire; C's is storable) — the v2 most-remaining rule
// picked C and let B's 40% evaporate.
ck('exhausted → EDF picks the SOONEST weekly deadline, not the most-remaining',
  run({ a: acct(0.98, 12 * H), b: acct(0.6, 12 * H), c: acct(0.1, 6 * D) })?.to === 'b');
ck('…reason tagged exhausted', run({ a: acct(0.98, 12 * H), b: acct(0.6, 12 * H), c: acct(0.1, 6 * D) })?.reason === 'exhausted');
ck('same deadline (±60s) → more remaining wins (fewer switches; equal expiry)',
  run({ a: acct(0.98, 12 * H), b: acct(0.6, 12 * H), c: acct(0.2, 12 * H + 30) })?.to === 'c');
ck('gated member (5h below its hard floor) is skipped even with the soonest deadline',
  run({ a: acct(0.98, 6 * D), b: acct(0.5, 12 * H, { u5: 0.99 }), c: acct(0.5, 3 * D) })?.to === 'c');
ck('known-deadline member outranks unknown-data member',
  run({ a: acct(0.98, 12 * H), b: null, c: acct(0.5, 6 * D) })?.to === 'c');
ck('all candidates unknown → effective 50 still beats 2% scraps',
  run({ a: acct(0.98, 12 * H), b: null, c: null })?.to === 'b');
ck('fresh-after-reset member (no deadline info) ranks after a real deadline',
  run({ a: acct(0.98, 12 * H), b: { fiveHour: { utilization: 0.2, resetsAt: past }, sevenDay: { utilization: 0.9, resetsAt: past } }, c: acct(0.5, 6 * D) })?.to === 'c');
ck('every member equally hard-dead → stay (all gated, nowhere better)',
  run({ a: acct(0.98, 12 * H), b: acct(0.99, 12 * H), c: acct(0.995, 3 * D) }) === null);
ck('verdict carries fromRemaining', Math.round(run({ a: acct(0.98, 12 * H), b: acct(0, 12 * H) })?.fromRemaining) === 2);

// ── proactive tier (hot pools): drain the soonest-expiring quota FIRST ───────
ck('proactive: current healthy but B resets sooner → switch (reason edf)',
  run({ a: acct(0.3, 6 * D), b: acct(0.4, 12 * H) }, { proactive: true })?.reason === 'edf');
ck('proactive: margin — deadlines within 1h do NOT flap',
  run({ a: acct(0.3, 12 * H), b: acct(0.4, 12 * H - 1800) }, { proactive: true }) === null);
ck('proactive: never jump onto UNKNOWN data', run({ a: acct(0.3, 6 * D), b: null }, { proactive: true }) === null);
ck('proactive: current deadline unknown → conservative stay',
  run({ a: { sevenDay: { utilization: 0.3, resetsAt: past }, fiveHour: { utilization: 0, resetsAt: fut } }, b: acct(0.4, 12 * H) }, { proactive: true }) === null);
ck('proactive OFF (cold pool): same layout stays put', run({ a: acct(0.3, 6 * D), b: acct(0.4, 12 * H) }) === null);
ck('proactive + soft-exhausted current still switches (exhaustion tier wins)',
  run({ a: acct(0.97, 6 * D), b: acct(0.4, 12 * H) }, { proactive: true })?.reason === 'exhausted');

// ── per-KIND thresholds (2.268.2, user-designed) ─────────────────────────────
ck('hot: 5h at 8% left soft-exhausts (5h hot threshold 10%)',
  run({ a: acct(0.5, 6 * D, { u5: 0.92 }), b: acct(0.4, 12 * H) }, { hot: true })?.reason === 'exhausted');
ck('hot: weekly at 12% left is HEALTHY (weekly hot threshold 5% — the Personal case)',
  run({ a: acct(0.88, 12 * H), b: acct(0.5, 6 * D) }, { hot: true }) === null);
ck('hot: weekly at 4% left soft-exhausts',
  run({ a: acct(0.96, 6 * D), b: acct(0.4, 12 * H) }, { hot: true })?.reason === 'exhausted');
ck('cold: weekly at 8% left stays (hard floor 3%)', run({ a: acct(0.92, 6 * D), b: acct(0.4, 12 * H) }) === null);
ck('cold: weekly at 2% left switches (below hard floor)', run({ a: acct(0.98, 6 * D), b: acct(0.4, 12 * H) })?.reason === 'exhausted');
// THE user-requested EDF return: a weekly-88% member with the SOONER deadline
// is a legitimate proactive target now (12% weekly ≈ $200+ of headroom)
ck('proactive EDF returns onto a sooner-deadline member at weekly 88% (clears the per-kind bar)',
  decidePoolSwitch({ currentId: 'b', members, readCache: (id) => ({ b: acct(0.54, 6 * D), a: acct(0.88, 12 * H) })[id] ?? null, nowSec: NOW, proactive: true, hot: true })?.to === 'a');

// ── settle bar (per-kind since 2.268.2) + oscillation regression ─────────────
const runAB = (caches, opts = {}) => decidePoolSwitch({ currentId: 'a', members: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], readCache: (id) => caches[id] ?? null, nowSec: NOW, ...opts });
ck('soft-exhausted (hot): a 5h-11% member is NOT a settle target (5h bar 13)…',
  runAB({ a: acct(0.5, 12 * H, { u5: 0.92 }), b: acct(0.4, 12 * H - 30, { u5: 0.89 }) }, { hot: true }) === null);
ck('…but a settle-bar-clearing member IS, even ranked behind the near-bar one by EDF',
  run({ a: acct(0.5, 12 * H, { u5: 0.92 }), b: acct(0.4, 12 * H - 30, { u5: 0.89 }), c: acct(0.5, 6 * D) }, { hot: true })?.to === 'c');
ck('hard-dead (<5h floor) still takes scraps (an 11%-5h member beats nothing)',
  runAB({ a: acct(0.5, 12 * H, { u5: 0.98 }), b: acct(0.4, 12 * H - 30, { u5: 0.89 }) }, { hot: true })?.to === 'b');
ck('anti-flap margin: a 2.5%-better target inside the dead band does NOT flip',
  run({ a: acct(0.98, 12 * H), b: acct(0.955, 12 * H - 30) }) === null);
ck('oscillation: proactive never returns onto a below-settle-bar sooner-deadline member (weekly 6% < bar 8)',
  decidePoolSwitch({ currentId: 'b', members, readCache: (id) => ({ b: acct(0.4, 6 * D), a: acct(0.94, 12 * H) })[id] ?? null, nowSec: NOW, proactive: true, hot: true }) === null);
ck('oscillation control: a HEALTHY sooner-deadline member still gets the proactive jump',
  decidePoolSwitch({ currentId: 'b', members, readCache: (id) => ({ b: acct(0.4, 6 * D), a: acct(0.5, 12 * H) })[id] ?? null, nowSec: NOW, proactive: true, hot: true })?.to === 'a');

console.log(fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
