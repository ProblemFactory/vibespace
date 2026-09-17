// B-6217 auto-switch decision logic (pure; the server engine feeds it the
// passive usage cache). v3 EDF semantics (user-designed 2026-08-09): quota is
// perishable — drain the member whose WEEKLY deadline (7d reset == scoped
// Fable reset, same window) is soonest. 5h = usability gate only. Exhaustion
// (<5% min-across-buckets incl 5h) always switches; hot pools also switch
// proactively toward a strictly-sooner deadline (margin 1h).
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { bucketRemaining, accountRemaining, weeklyDeadline, decidePoolSwitch, poolBlockedNotice, classifyAuthFailure, conversationDisplayName } = require(path.resolve('src/account-pool-auto.js'));

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


// ── OFFLINE-BIAS pessimism docking (2.297.0, design §Cross-device) ──
{
  // current target healthy at 12% remaining on its 5h — but its spend partly
  // flows through a DARK machine, so an 8-point dock puts it below the hot
  // threshold and a hot pool moves; without the dock it stays.
  const caches = {
    A: { fetchedAt: 1000, fiveHour: { utilization: 0.88, resetsAt: NOW + 3600 }, sevenDay: { utilization: 0.2, resetsAt: NOW + 86400 } },
    B: { fetchedAt: 1000, fiveHour: { utilization: 0.10, resetsAt: NOW + 3600 }, sevenDay: { utilization: 0.1, resetsAt: NOW + 86400 } },
  };
  const readCache = (id) => caches[id];
  const members = [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }];
  const stay = decidePoolSwitch({ currentId: 'A', members, readCache, nowSec: NOW, proactive: true, hot: true });
  ck('no dark taint: 12% remaining clears the hot threshold — stays', stay === null);
  const move = decidePoolSwitch({ currentId: 'A', members, readCache, nowSec: NOW, proactive: true, hot: true, pessimism: { A: 8 } });
  ck('dark-tainted current target is docked below the hot threshold — moves', move?.to === 'B');
  // a dark-tainted CANDIDATE is docked too — switching ONTO invisible burn is
  // as dangerous as staying on it (settle bar applies to the docked value)
  // A soft-exhausted (8 remaining < hot 10, above hard 5); B has 18 — clears
  // the settle bar (13) undocked, fails it docked. The dock must flip the
  // decision from move to stay.
  const cachesTight = {
    A: { fetchedAt: 1000, fiveHour: { utilization: 0.92, resetsAt: NOW + 3600 }, sevenDay: { utilization: 0.2, resetsAt: NOW + 86400 } },
    B: { fetchedAt: 1000, fiveHour: { utilization: 0.82, resetsAt: NOW + 3600 }, sevenDay: { utilization: 0.1, resetsAt: NOW + 86400 } },
  };
  const rc2 = (id) => cachesTight[id];
  ck('control: without the dock the soft-exhausted pool moves to B', decidePoolSwitch({ currentId: 'A', members, readCache: rc2, nowSec: NOW, proactive: true, hot: true })?.to === 'B');
  const noSettle = decidePoolSwitch({ currentId: 'A', members, readCache: rc2, nowSec: NOW, proactive: true, hot: true, pessimism: { B: 8 } });
  ck('dark-tainted candidate fails the settle bar after docking — pool stays', noSettle === null);
}


// ── LIVENESS: escaping a dead target beats EDF efficiency (2.312.0) ──────────
// Real incident 2026-08-11, reproduced from the reporter's own usage cache: the
// pool sat on a 0%-remaining account while a member with 100% on EVERY bucket
// was present, returning null for hot AND cold. Cause: that member's windows
// had ROLLED, so it has no known deadline and sorts LAST by design, and the
// hard-dead branch only ever looked at ranked[0].
{
  const rolled = { fiveHour: { utilization: 0.9, resetsAt: past }, sevenDay: { utilization: 0.9, resetsAt: past }, scopedWeekly: [{ name: 'Fable', utilization: 1, resetsAt: past }] };
  const dead = acct(0.55, 3 * D, { uf: 1 });      // scoped spent → 0% remaining
  const nearly = acct(0.56, 3 * D, { uf: 0.97 }); // 3% — a real deadline, so EDF-first
  const m3 = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];
  const dec = (opts = {}) => decidePoolSwitch({ currentId: 'a', members: m3, readCache: (id) => ({ a: dead, b: nearly, c: rolled })[id] ?? null, nowSec: NOW, ...opts });
  ck('liveness: a hard-dead pool escapes to the rolled-window member, not the EDF-first scraps', dec()?.to === 'c');
  ck('liveness: same for a hot pool', dec({ hot: true })?.to === 'c');
  // negative control: with the rolled member REMOVED the old behaviour stands —
  // 3% is not a meaningful gain over 0% + margin, so staying put is correct.
  ck('liveness control: no better member ⇒ still no switch',
    decidePoolSwitch({ currentId: 'a', members: [{ id: 'a' }, { id: 'b' }], readCache: (id) => ({ a: dead, b: nearly })[id] ?? null, nowSec: NOW }) === null);
  // ...and it must SAY so rather than fail silently (the notice the engine emits)
  const why = decidePoolSwitch({ currentId: 'a', members: [{ id: 'a' }, { id: 'b' }], readCache: (id) => ({ a: dead, b: nearly })[id] ?? null, nowSec: NOW, explain: true });
  ck('explain: a stuck pool reports reason "stuck" with both numbers', why?.to === null && why.reason === 'stuck' && why.fromRemaining === 0 && Math.round(why.bestRemaining) === 3);
  ck('explain: the historical null contract is unchanged without it',
    decidePoolSwitch({ currentId: 'a', members: [{ id: 'a' }, { id: 'b' }], readCache: (id) => ({ a: dead, b: nearly })[id] ?? null, nowSec: NOW }) === null);
  // UNKNOWN data must never win the headroom scan: its fabricated 50% would
  // beat every real reading and turn "escape" into "jump onto ignorance".
  ck('liveness: an unknown-data member does NOT beat a measured one',
    decidePoolSwitch({ currentId: 'a', members: m3, readCache: (id) => ({ a: dead, b: acct(0.2, 3 * D) })[id] ?? null, nowSec: NOW })?.to === 'b');
}

// ── SCOPED buckets are model-BLIND (pinned so any change is deliberate) ──────
// The decision flattens every model-scoped weekly into kind 'weekly' and takes
// min-across-all, so a spent cap for a model NOBODY IS USING declares the whole
// account unusable. That is today's contract; a model-aware version must
// deliberately update these asserts, not discover them.
{
  const opusDead = { fiveHour: { utilization: 0.1, resetsAt: NOW + 1800 }, sevenDay: { utilization: 0.4, resetsAt: NOW + 3 * D },
    scopedWeekly: [{ name: 'Fable', utilization: 0.2, resetsAt: NOW + 3 * D }, { name: 'Opus', utilization: 0.99, resetsAt: NOW + 3 * D }] };
  ck('scoped: ONE spent model cap drags accountRemaining to that bucket', accountRemaining(opusDead, NOW).remaining === 1);
  ck('scoped: …so the account is treated as exhausted even with 60% of its 7d left',
    decidePoolSwitch({ currentId: 'a', members: [{ id: 'a' }, { id: 'b' }], readCache: (id) => ({ a: opusDead, b: acct(0.3, 3 * D) })[id] ?? null, nowSec: NOW })?.to === 'b');
  ck('scoped: …and it is gated OUT as a candidate for the same reason',
    decidePoolSwitch({ currentId: 'b', members: [{ id: 'a' }, { id: 'b' }], readCache: (id) => ({ a: opusDead, b: acct(0.99, 3 * D) })[id] ?? null, nowSec: NOW }) === null);
}


// ── every blocked outcome must be REPORTABLE, with the right buckets named ──
// 2.313.0: only 'stuck' was surfaced; when the candidate gate drops EVERY
// member the code returns through 'no-members' instead and said nothing —
// the same incident class down a different branch.
{
  const spentCap = (u7) => ({ fiveHour: { utilization: 0, resetsAt: NOW + 1800 }, sevenDay: { utilization: u7, resetsAt: NOW + 3 * D },
    scopedWeekly: [{ name: 'Fable', utilization: 1, resetsAt: NOW + 3 * D }] });
  const m = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const rc = (id) => ({ a: spentCap(0.6), b: spentCap(0.5), c: spentCap(0.55) })[id] ?? null;
  const v = decidePoolSwitch({ currentId: 'a', members: m, readCache: rc, nowSec: NOW, explain: true });
  ck('blocked: every member gated out returns no-members (was silent)', v?.to === null && v.reason === 'no-members');
  ck('blocked: names the SPENT bucket, not "out of quota"', v.deadBuckets.join() === 'Fable 0%');
  ck('blocked: …and names what is still available (the nested-model truth)',
    v.liveBuckets.includes('7d 40%') && v.liveBuckets.some((x) => x.startsWith('5h ')));
  ck('blocked: without explain the contract is still a bare null',
    decidePoolSwitch({ currentId: 'a', members: m, readCache: rc, nowSec: NOW }) === null);
  // a 5h-only block must report 5h, not the weekly caps
  const burst = { fiveHour: { utilization: 0.99, resetsAt: NOW + 1800 }, sevenDay: { utilization: 0.2, resetsAt: NOW + 3 * D }, scopedWeekly: [] };
  const v5 = decidePoolSwitch({ currentId: 'a', members: [{ id: 'a' }, { id: 'b' }], readCache: (id) => ({ a: burst, b: burst })[id] ?? null, nowSec: NOW, explain: true });
  ck('blocked: a 5h burst block names 5h and shows the healthy 7d', v5.deadBuckets.join() === '5h 1%' && v5.liveBuckets.join() === '7d 80%');
}

// ── A HEALTHY CURRENT MEMBER IS NEVER "NO MEMBER CAN SERVE IT" ─────────────
// (2026-09-13, the Fable-cap pool storm.) On a HOT pool the candidate ranking
// runs PROACTIVELY, i.e. BEFORE anyone asks whether the current member is
// exhausted — so an empty candidate list says nothing at all about whether the
// pool can serve a turn. The three actionable refusals ('no-members',
// 'all-rejected', 'all-logins-expired') all flowed out of that branch, and the
// engine renders them as an hourly notice AND feeds them to auto-resume's "no
// usable member left" clause. The owner read the notice exactly as written:
// "有账号有 Fable 额度但总是提示没有了".
{
  const spentFable = (u7) => ({ fiveHour: { utilization: 0, resetsAt: NOW + 1800 }, sevenDay: { utilization: u7, resetsAt: NOW + 3 * D },
    scopedWeekly: [{ name: 'Fable', utilization: 1, resetsAt: NOW + 3 * D }] });
  const healthy = { fiveHour: { utilization: 0, resetsAt: NOW + 1800 }, sevenDay: { utilization: 0.31, resetsAt: NOW + 3 * D },
    scopedWeekly: [{ name: 'Fable', utilization: 0.55, resetsAt: NOW + 3 * D }] };
  const m = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const rc = (id) => ({ a: healthy, b: spentFable(0.5), c: spentFable(0.55) })[id] ?? null;
  const hot = decidePoolSwitch({ currentId: 'a', members: m, readCache: rc, nowSec: NOW, proactive: true, hot: true, explain: true });
  ck('healthy current + every other member quota-dead ⇒ no-better, never a wall', hot?.to === null && hot.reason === 'no-better' && hot.noBetter === true);
  ck('no-better still reports the current member\'s own buckets (for the log, not for a notice)', hot.liveBuckets.some((x) => x.startsWith('Fable ')) && hot.deadBuckets.length === 0);
  // …and the three refusals are UNCHANGED the moment the current member really
  // is exhausted — this narrows WHEN they may be claimed, never WHAT they say.
  const dead = decidePoolSwitch({ currentId: 'b', members: m, readCache: rc, nowSec: NOW, proactive: true, hot: true, explain: true });
  ck('current member hard-dead on its Fable cap ⇒ it may still escape to the healthy member', dead?.to === 'a');
  const allDead = (id) => ({ a: spentFable(0.6), b: spentFable(0.5), c: spentFable(0.55) })[id] ?? null;
  const stuck = decidePoolSwitch({ currentId: 'a', members: m, readCache: allDead, nowSec: NOW, proactive: true, hot: true, explain: true });
  ck('current member exhausted AND every candidate gated ⇒ \'no-members\', exactly as before', stuck?.to === null && stuck.reason === 'no-members');
  ck('…and it still names the spent bucket', stuck.deadBuckets.join() === 'Fable 0%');
  // 'all-rejected' is gated by the same clause: members that rejected THIS
  // conversation only matter when the one it sits on cannot serve it either.
  const rej = decidePoolSwitch({ currentId: 'a', members: m, readCache: (id) => ({ a: healthy, b: healthy, c: healthy })[id] ?? null, nowSec: NOW, proactive: true, hot: true, exclude: ['b', 'c'], explain: true });
  ck('every OTHER member rejected this conversation, but it is on a healthy one ⇒ no-better, not all-rejected', rej?.to === null && rej.reason === 'no-better');
  const rej2 = decidePoolSwitch({ currentId: 'a', members: m, readCache: (id) => ({ a: spentFable(0.6), b: healthy, c: healthy })[id] ?? null, nowSec: NOW, proactive: true, hot: true, exclude: ['b', 'c'], explain: true });
  ck('…and once the current member IS exhausted, \'all-rejected\' comes back unchanged', rej2?.to === null && rej2.reason === 'all-rejected');
  // THE SENTENCE. "out of quota (still available: …)" is a contradiction about
  // ONE member and it is verbatim what the storm printed; the live list only
  // means something beside a dead one.
  const spent = decidePoolSwitch({ currentId: 'a', members: m, readCache: allDead, nowSec: NOW, proactive: true, hot: true, explain: true });
  ck('notice: a spent bucket still prints its live siblings (the nested model\'s whole point)',
    / \(still available: /.test(poolBlockedNotice(spent, { poolName: 'P', currentName: 'A' })));
  const noDead = { ...spent, deadBuckets: [], liveBuckets: ['5h 100%', '7d 69%', 'Fable 45%'] };
  ck('notice: with NOTHING spent the live list is dropped — never "out of quota (still available: …)"',
    !/still available/.test(poolBlockedNotice(noDead, { poolName: 'P', currentName: 'A' })) && /out of quota/.test(poolBlockedNotice(noDead, { poolName: 'P', currentName: 'A' })));
}

// ── classifyAuthFailure (2.335.0: auth-class failures must evict, quota can't see them) ──
ck('auth: 403 qualifies immediately (refused identity, never a refresh race)', classifyAuthFailure({ status: 403 }) === true);
ck('auth: a LONE first-attempt 401 does not qualify (mid-refresh race shape)', classifyAuthFailure({ status: 401, attempt: 1 }) === false);
ck('auth: 401 on attempt ≥2 qualifies (the refresh had its chance)', classifyAuthFailure({ status: 401, attempt: 2 }) === true);
ck('auth: credit-balance message qualifies', classifyAuthFailure({ message: 'Your credit balance is too low to access the Anthropic API' }) === true);
ck('auth: org-disabled (ban) in an API error result qualifies', classifyAuthFailure({ message: 'API Error: 403 {"error":{"message":"This organization has been disabled."}}' }) === true);
ck('auth: expired-oauth message qualifies', classifyAuthFailure({ message: 'OAuth token has expired' }) === true);
ck('auth: NEGATIVE — agent tool output about some OTHER system never qualifies', classifyAuthFailure({ message: 'test failed: authentication_error thrown by myapp login handler' }) === false);
ck('auth: the same text WITH a status code still qualifies (api_retry channel)', classifyAuthFailure({ status: 403, message: 'authentication_error' }) === true);
ck('auth: 5xx never qualifies no matter how many retries', classifyAuthFailure({ status: 500, message: 'Internal server error', attempt: 9 }) === false);
ck('auth: overload is not an identity problem', classifyAuthFailure({ status: 529, message: 'Overloaded' }) === false);
ck('auth: hostile/empty input is quiet', classifyAuthFailure({}) === false && classifyAuthFailure() === false);

// ── conversationDisplayName: the pool switch bubble shows the SIDEBAR name ──
// (owner 2026-09-08: "切换账户的那个气泡提示里没有用session的自定义名，而是用了第一句话")
{
  // customNames is keyed by the client's getSessionKey = `<backend>:<backendSessionId>`
  const CN = { 'claude:9f4cd444-uuid': 'B2B助手', 'bare-id-2': 'Legacy Name' };
  const live = { backend: 'claude', claudeSessionId: '9f4cd444-uuid', name: '你是主要负责管理我在HanabiAI的B2B任务的Agent，我下面给你一些资源' };
  ck('name: the custom rename WINS over the first-message name (the bug)', conversationDisplayName(live, CN, 'sess-1-123') === 'B2B助手');
  ck('name: NEGATIVE — with no custom name it falls back to the session name, not the id', conversationDisplayName({ backend: 'claude', claudeSessionId: 'no-rename', name: '第一句话' }, CN, 'sess-2-123') === '第一句话');
  ck('name: with neither, the webui id is the last resort (never empty)', conversationDisplayName({ backend: 'claude', claudeSessionId: 'x' }, {}, 'sess-3-123') === 'sess-3-123');
  ck('name: a legacy bare-backend-id key still resolves', conversationDisplayName({ backend: 'claude', claudeSessionId: 'bare-id-2', name: 'first msg' }, CN, 'sess-4') === 'Legacy Name');
  ck('name: backendSessionId is accepted when claudeSessionId is absent (codex/other)', conversationDisplayName({ backend: 'codex', backendSessionId: 'th_9', name: 'msg' }, { 'codex:th_9': 'My Codex Job' }, 'sess-5') === 'My Codex Job');
  ck('name: null customNames / hostile input never throws and never returns undefined', conversationDisplayName({ name: 'ok' }, null, 'sid') === 'ok' && conversationDisplayName(null, null, 'sid') === 'sid' && conversationDisplayName(null, null) === '');
  ck('name: an empty/whitespace custom rename does NOT win (falls through to the session name)', conversationDisplayName({ backend: 'claude', claudeSessionId: 'w', name: 'real' }, { 'claude:w': '   ' }, 'sid') === 'real');
}

// ── B-73fe (2026-09-17): the verdict NAMES the bucket that sets its wait ─────
// An identity unblocks when the LAST of its dead buckets resets, so the arm
// card must be able to say "5h resets at 7am but Fable (2 % < 5 %) keeps it
// dead until 9/20" — `until` + `deadBuckets` are that structure, reporting
// only (no threshold reads them).
{
  const { quotaVerdict } = require(path.resolve('src/account-pool-auto.js'));
  const v = quotaVerdict({ fiveHour: { utilization: 1, resetsAt: NOW + H }, sevenDay: { utilization: 0.5, resetsAt: NOW + 3 * D }, scopedWeekly: [{ name: 'Fable', utilization: 0.98, resetsAt: NOW + 3 * D }] }, NOW);
  ck('B-73fe: blocked = MAX over dead resets, and `until` names THAT bucket (Fable), not the nearer 5h', v.usable === false && v.blockedUntil === (NOW + 3 * D) * 1000 && !!v.until && v.until.label === 'Fable' && v.until.resetsAt === NOW + 3 * D);
  ck('…deadBuckets carry label/kind/remaining/line/resetsAt for every dead bucket, 5h first', v.deadBuckets.length === 2 && v.deadBuckets[0].label === '5h' && v.deadBuckets[0].kind === 'fiveHour' && v.deadBuckets[0].line === 10 && v.deadBuckets[0].remaining === 0 && v.deadBuckets[0].resetsAt === NOW + H && v.deadBuckets[1].label === 'Fable' && v.deadBuckets[1].kind === 'weekly' && v.deadBuckets[1].remaining === 2 && v.deadBuckets[1].line === 5);
  const u = quotaVerdict({ fiveHour: { utilization: 0.1, resetsAt: NOW + H }, sevenDay: { utilization: 0.5, resetsAt: NOW + 3 * D } }, NOW);
  ck('…a usable verdict carries the EMPTY shape (readers never branch on presence)', u.usable === true && Array.isArray(u.deadBuckets) && u.deadBuckets.length === 0 && u.until === null);
  const n = quotaVerdict({}, NOW);
  ck('…and so does no-data', n.usable === null && Array.isArray(n.deadBuckets) && n.until === null);
  const p = quotaVerdict({ fiveHour: { utilization: 1, resetsAt: past }, sevenDay: { utilization: 0.99, resetsAt: NOW + D } }, NOW);
  ck('…a dead bucket whose reset already passed reads full again, so `until` is the 7d and the 5h is not listed', p.dead.length === 1 && p.until.label === '7d' && p.deadBuckets.length === 1);
  const q = quotaVerdict({ fiveHour: { utilization: 1 }, sevenDay: { utilization: 0.5, resetsAt: NOW + D } }, NOW);
  ck('…a dead bucket with NO reset ⇒ blockedUntil 0 (probe, never guess) and `until` null', q.usable === false && q.blockedUntil === 0 && q.until === null && q.deadBuckets.length === 1);
}

// ── B-ad05 (2026-09-17): USAGE CREDITS ARE VISIBLE BEFORE THEY ARE SPENT ────
// A member whose org has extra usage ENABLED keeps serving past 100 % on
// pay-per-use billing and nothing in the stream says so until the bill. The
// pool ranks it BELOW every member with quota left, uses it only as the LAST
// resort (after the scraps), answers `on-credits` when it is parked on one
// (never "no member can serve it"), and every notice names it.
{
  const { rankPoolMembers, poolCreditsNotice } = require(path.resolve('src/account-pool-auto.js'));
  const M = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'k', name: 'Kredits' }];
  const dec = (caches, opts = {}) => decidePoolSwitch({ currentId: 'a', members: M, readCache: (id) => caches[id] ?? null, nowSec: NOW, explain: true, ...opts });
  const deadA = acct(0.99, 2 * D, { u5: 0.99 });
  const freeK = acct(0.1, 6 * D);
  const deadK = acct(1, 6 * D, { u5: 1 });
  // 1. never a voluntary target — even when EDF would have picked it
  const c1 = { a: deadA, b: acct(0.5, 5 * D), k: acct(0.1, 3 * D) };
  const d1 = dec(c1, { creditsIds: ['k'] });
  ck('credits: not a voluntary target while a quota-bearing member exists (EDF alone would have picked K: sooner deadline, more headroom)', d1.to === 'b' && !d1.toCredits);
  ck('…control: the SAME decision without creditsIds picks K — the input is what changed it', dec(c1).to === 'k');
  // 2. a HOT pool never jumps proactively onto one
  const c2 = { a: acct(0.3, 5 * D), b: null, k: acct(0.1, 2 * D) };
  const d2 = dec(c2, { proactive: true, hot: true, creditsIds: ['k'] });
  ck('credits: a HOT pool never jumps proactively onto a credits member (hold, not edf)', d2.to === null && d2.reason === 'hold');
  ck('…control: without creditsIds the proactive tier does jump to K', dec(c2, { proactive: true, hot: true }).reason === 'edf' && dec(c2, { proactive: true, hot: true }).to === 'k');
  // 3. the LAST resort: current hard-dead, every other member spent
  const c3 = { a: deadA, b: acct(0.99, 5 * D), k: freeK };
  const d3 = dec(c3, { creditsIds: ['k'] });
  ck('credits: the last resort — current hard-dead and every other member spent ⇒ the credits member, flagged toCredits', d3.to === 'k' && d3.reason === 'exhausted' && d3.toCredits?.id === 'k' && d3.toCredits?.name === 'Kredits' && d3.toCredits?.dead === false);
  ck('…control: without creditsIds K is picked as an ORDINARY member (no toCredits flag) — the flag is what the input adds', dec(c3).to === 'k' && !dec(c3).toCredits);
  // 3b. a spent credits member is still the last resort (it serves past its quota) and the gain floor does not apply
  const d3b = dec({ a: deadA, b: acct(0.99, 5 * D), k: deadK }, { creditsIds: ['k'] });
  ck('credits: even a SPENT credits member is the last resort (its capacity is not its quota; the anti-flap gain floor does not apply)', d3b.to === 'k' && d3b.toCredits?.dead === true);
  // 4. the scraps still beat it — quota the owner already paid for
  const d4 = dec({ a: deadA, b: acct(0.9, 5 * D), k: freeK }, { creditsIds: ['k'], reserveFloorPct: 15 });
  ck('credits: a reserve-floor scrap (quota already paid for) beats the credits member', d4.to === 'b' && !!d4.toReserve && !d4.toCredits);
  // 5. parked on credits: the current member IS the credits member and nowhere else to go
  const parked = (caches, extra = {}) => decidePoolSwitch({ currentId: 'k', members: M, readCache: (id) => caches[id] ?? null, nowSec: NOW, explain: true, creditsIds: ['k'], ...extra });
  const c5 = { a: deadA, b: acct(0.99, 5 * D), k: deadK };
  const d5 = parked(c5);
  ck('credits: a pool PARKED on a spent credits member answers on-credits (it serves, billed) — never no-members', d5.to === null && d5.reason === 'on-credits' && d5.onCredits?.id === 'k' && d5.billing === true);
  ck('…with the credits member\'s OWN buckets named (spent: 5h 0%, 7d 0%)', d5.deadBuckets.join(', ') === '5h 0%, 7d 0%');
  ck('…control: without creditsIds the same state is no-members', decidePoolSwitch({ currentId: 'k', members: M, readCache: (id) => c5[id] ?? null, nowSec: NOW, explain: true }).reason === 'no-members');
  // 6. it leaves the credits member the moment a quota-bearing member can serve
  const d6 = parked({ a: deadA, b: acct(0.5, 5 * D), k: deadK });
  ck('credits: the pool leaves the credits member the moment a quota-bearing member can serve', d6.to === 'b' && d6.reason === 'exhausted');
  // 7. two spent credits members: no hop (a re-point for nothing on every tick)
  const M2 = [...M, { id: 'k2', name: 'Kredits 2' }];
  const d7 = decidePoolSwitch({ currentId: 'k', members: M2, readCache: (id) => ({ a: deadA, b: acct(0.99, 5 * D), k: deadK, k2: deadK })[id] ?? null, nowSec: NOW, explain: true, creditsIds: ['k', 'k2'] });
  ck('credits: two spent credits members never hop between each other — on-credits, stay', d7.to === null && d7.reason === 'on-credits');
  // 8. …but a credits member that still has quota is a better place to be parked (it is not billing yet)
  const d8 = decidePoolSwitch({ currentId: 'k', members: M2, readCache: (id) => ({ a: deadA, b: acct(0.99, 5 * D), k: deadK, k2: freeK })[id] ?? null, nowSec: NOW, explain: true, creditsIds: ['k', 'k2'] });
  ck('credits: from a spent credits member onto one that still has quota (not billing yet) — quota-holding rows first', d8.to === 'k2' && d8.toCredits?.id === 'k2');
  // 9. the blocked sentence names it (hot pool, soft-exhausted current, nothing settleable, K held back)
  const d9 = dec({ a: acct(0.5, 5 * D, { u5: 0.92 }), b: acct(0.99, 5 * D), k: freeK }, { hot: true, creditsIds: ['k'] });
  const n9 = poolBlockedNotice(d9, { poolName: 'P', currentName: 'A' });
  ck('…and a blocked decision NAMES the held-back credits member', Array.isArray(d9.creditsHeld) && d9.creditsHeld[0].id === 'k' && d9.creditsHeld[0].name === 'Kredits');
  ck('credits: a soft-exhausted current member does NOT fall onto credits (last resort = hard-dead only) and the blocked sentence names the held-back member', d9.to === null && d9.reason === 'no-members' && /Held back because they bill pay-per-use past their quota \(usage credits\): Kredits — the pool falls back to them only once A is fully spent\./.test(n9), n9);
  // 10. the parking sentence, both shapes
  const n10 = poolCreditsNotice(d5, { poolName: 'P', memberName: 'Kredits' });
  ck('credits: the parking notice names the member, what it bills for, its spent buckets and the three ways out',
    n10 === 'Pool "P" is running on Kredits\'s usage credits — requests past its quota are billed pay-per-use (Kredits: spent: 5h 0%, 7d 0%); every other member is out of quota. Move conversations off the pool, add a member, or exclude Kredits from the pool in Manage Agents if you would rather it stopped.', n10);
  const n10b = poolCreditsNotice({ toCredits: { id: 'k', name: 'Kredits' }, toRemaining: 90 }, { poolName: 'P', memberName: 'Kredits' });
  ck('…and the last-resort switch shape says it was the only member left, with what is known about the target', /\(Kredits: 90% remaining\); it was the only member left\./.test(n10b), n10b);
  // 11. the ranked snapshot (sealed orders / auth-fail evict) walks credits members LAST
  const rk = rankPoolMembers({ members: M, readCache: (id) => ({ a: acct(0.5, 5 * D), b: acct(0.5, 4 * D), k: acct(0.1, 2 * D) })[id], nowSec: NOW, creditsIds: ['k'] });
  ck('credits: rankPoolMembers puts a credits member LAST even with the soonest deadline, marked credits:true', rk.map((r) => r.id).join(',') === 'b,a,k' && rk[2].credits === true);
  ck('…control: without creditsIds EDF ranks K first', rankPoolMembers({ members: M, readCache: (id) => ({ a: acct(0.5, 5 * D), b: acct(0.5, 4 * D), k: acct(0.1, 2 * D) })[id], nowSec: NOW }).map((r) => r.id).join(',') === 'k,b,a');
  ck('…and a SPENT credits member is still listed (last) — the hard floor does not gate what serves past its quota', rankPoolMembers({ members: M, readCache: (id) => ({ a: acct(0.5, 5 * D), b: acct(0.5, 4 * D), k: deadK })[id], nowSec: NOW, creditsIds: ['k'] }).map((r) => r.id).join(',') === 'b,a,k');
}

console.log(fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
