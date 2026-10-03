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
/** THE PRE-FIX COPY a byte-identity sweep compares against (lane-mirror-197, 2026-09-29): `git show <ref>:<file>` needs the ref
 *  IN THIS CLONE, and the Actions mirror is a depth-1 checkout (the pushed commit alone) — the ref is absent there BY CONSTRUCTION
 *  (the fast job printed `fatal: invalid object name 'b970f16d'` three times and went red on six legs a full clone passes). The
 *  answer names the world: `{mod}` when the ref is here; `{mod: null, why: 'shallow'}` on a shallow clone — the caller SKIPS the
 *  historical rung with evidence, its ref-free sweep carries the leg, and the copies census keys on whether this control RAN
 *  (the 2.369.164 r2 rule: count the producers that ran); `why` naming the ref on a FULL clone = a real failure, never a skip.
 *  Git runs under the sanitized env (a pre-push hook exports GIT_DIR) with the checkout as cwd. */
async function preFixCopy(M, ref, rel, tag = 'master') {
  const { execFileSync } = await import('node:child_process');
  const { gitEnvFrom } = await import('./git-env.mjs');
  const git = (args) => execFileSync('git', args, { encoding: 'utf8', cwd: path.resolve('.'), env: gitEnvFrom(process.env), stdio: ['ignore', 'pipe', 'ignore'] });
  let has = false; try { git(['cat-file', '-e', `${ref}^{commit}`]); has = true; } catch { has = false; }
  if (has) { try { return { mod: M.load(rel, git(['show', `${ref}:${rel}`]), tag), why: null }; } catch (e) { return { mod: null, why: `git show ${ref}:${rel} failed: ${String(e && e.message).slice(0, 120)}` }; } }
  let shallow = false; try { shallow = git(['rev-parse', '--is-shallow-repository']).trim() === 'true'; } catch { shallow = false; }
  return { mod: null, why: shallow ? 'shallow' : `the ref ${ref} is not in this clone, which is NOT shallow` };
}
/** The one sentence a skipped historical rung prints (the census below expects one copy fewer). */
const skipPreFix = (label, ref) => console.log(`  ⊘ SKIP ${label}the byte-identity sweep against ${ref} — the ref is not in this SHALLOW clone (the mirror's depth-1 checkout); the ref-free sweep carries the leg`);
const NOW = 1800000000; // unix seconds
const H = 3600, D = 86400;
const fut = NOW + H, past = NOW - H;

// ── primitives (unchanged v2 semantics) ──────────────────────────────────────
ck('bucket: 90% used → 10 remaining', bucketRemaining({ utilization: 0.9, resetsAt: fut }, NOW) === 10);
ck('bucket: reset PASSED → full again (stale reading is meaningless)', bucketRemaining({ utilization: 0.98, resetsAt: past }, NOW) === 100);
// ── THE STATED RESET LANDS A MINUTE LATE (2026-09-18, owner: "稍微等一分钟再发自动恢复") ──
{
  const { RESET_GRACE_SEC, quotaVerdict } = require(path.resolve('src/account-pool-auto.js'));
  ck('reset grace is one minute', RESET_GRACE_SEC === 60);
  ck('a stated reset that passed 30 s ago has NOT landed: the bucket keeps its stale (dead) remaining', bucketRemaining({ utilization: 0.98, resetsAt: NOW - 30 }, NOW) === 2);
  ck('…exactly at the grace edge it is still dead (strict)', bucketRemaining({ utilization: 0.98, resetsAt: NOW - RESET_GRACE_SEC }, NOW) === 2);
  ck('…one second past the grace it is full again', bucketRemaining({ utilization: 0.98, resetsAt: NOW - RESET_GRACE_SEC - 1 }, NOW) === 100);
  ck('a stated reset 40 s in the FUTURE is dead, as before (the 09:59:15Z shape: the pool moved 45 s early)', bucketRemaining({ utilization: 1, resetsAt: NOW + 40 }, NOW) === 0);
  const g = quotaVerdict({ fiveHour: { utilization: 1, resetsAt: NOW - 30 }, sevenDay: { utilization: 0.5, resetsAt: NOW + 3 * D } }, NOW);
  ck('verdict: a 5h whose stated reset passed 30 s ago is still blocked, until the STATED instant + the grace', g.usable === false && g.blockedUntil === (NOW - 30 + RESET_GRACE_SEC) * 1000 && g.deadBuckets.length === 1, JSON.stringify(g));
  ck('…and the card is told the STATED instant, not the fire instant', g.until && g.until.resetsAt === NOW - 30 && g.deadBuckets[0].resetsAt === NOW - 30, JSON.stringify(g.until));
  // r2: the un-named model cap's dead mark carries the bounded 24 h guess when the record states no reset — it ROLLS
  const ph = { name: 'Model cap', utilization: 1, status: 'limited', resetsAt: NOW + 86400 };
  ck('a model-cap placeholder marked dead with the bounded guess reads 0 now and rolls to 100 a minute after the guessed deadline (a dead mark always has a deadline)',
    bucketRemaining(ph, NOW) === 0 && bucketRemaining(ph, NOW + 86400 + RESET_GRACE_SEC + 1) === 100);
  ck('…while one with NO reset at all (the pre-r2 scoped dead mark) would never roll — the shape the ladder now forbids', bucketRemaining({ ...ph, resetsAt: undefined }, NOW + 30 * 86400) === 0);
}
// ── B-a4f1: THE ESTIMATOR'S OVERLAY WAITS FOR THE SAME MINUTE (2026-09-18 15:59:15Z) ──
// The engine reads members through the estimator overlay (usage-pool-engine poolReadCache), and the
// estimator re-based a weekly bucket on the bare stated instant: the grace above never saw the dead
// bucket. Production facts: the isolated panel at 15:31:17Z read Personal Max "Current week (Fable):
// 100% used · resets Sep 18, 8:59am" (= 15:59:00Z; the vendor's wall said 16:00:00Z); at 15:59:15Z
// nine conversations moved onto it off a Fable-spent Lu Max and every continue was rejected.
{
  const EST = require(path.resolve('src/usage-estimator.js'));
  const QM = require(path.resolve('src/quota-model.js'));
  const { RESET_GRACE_SEC } = require(path.resolve('src/account-pool-auto.js'));
  ck('B-a4f1: one grace, two readers — the pool exports the model\'s number', RESET_GRACE_SEC === QM.RESET_GRACE_SEC && RESET_GRACE_SEC === 60);
  const STATED = 1789747140;
  const pm = { fiveHour: { utilization: 0 }, sevenDay: { utilization: 0.75, resetsAt: STATED }, scopedWeekly: [{ name: 'Fable', utilization: 1, resetsAt: STATED }], fetchedAt: 1789745477183 };
  const lu = { fiveHour: { utilization: 0.2, resetsAt: STATED + 4 * H }, sevenDay: { utilization: 0.6, resetsAt: STATED + D }, scopedWeekly: [{ name: 'Fable', utilization: 1, resetsAt: STATED + D }], fetchedAt: (STATED - 60) * 1000 };
  const RATES = { fiveHour: { rate: 0.0028 }, sevenDay: { rate: 0.00054 }, 'scoped:fable': { rate: 0.00107 } }; // the member's learned rates (rates.json)
  const b = (x) => (x ? { u: x.utilization, resetsAt: x.resetsAt } : null);
  const view = (c, nowSec) => EST.overlayCache(c, EST.estimateBuckets({ anchor: { fetchedAt: c.fetchedAt, buckets: { fiveHour: b(c.fiveHour), sevenDay: b(c.sevenDay), scopedWeekly: c.scopedWeekly.map((s) => ({ name: s.name, ...b(s) })) } }, rates: RATES, costFn: () => ({ total: 0, byFamily: {} }), nowMs: nowSec * 1000, lagS: 0 }));
  const decideAt = (nowSec) => decidePoolSwitch({ currentId: 'lu', members: [{ id: 'lu', name: 'Lu Max' }, { id: 'pm', name: 'Personal Max' }], readCache: (id) => view({ lu, pm }[id], nowSec), nowSec, explain: true });
  const at = STATED + 15;
  ck('B-a4f1: 15 s past a stated weekly reset the estimator does NOT re-base it — the overlay keeps the raw dead Fable bucket', view(pm, at).scopedWeekly[0].utilization === 1 && accountRemaining(view(pm, at), at).remaining === 0, JSON.stringify(view(pm, at).scopedWeekly));
  ck('B-a4f1: …so the pool does NOT move the conversations onto Personal Max at 15:59:15Z', decideAt(at)?.to !== 'pm', JSON.stringify(decideAt(at)));
  ck('B-a4f1: …at the grace edge it still waits (the estimator and bucketRemaining agree on the edge)', decideAt(STATED + RESET_GRACE_SEC)?.to !== 'pm');
  ck('B-a4f1: one second past the grace the estimator rolls the week (re-based at 0, next reset a week on) and the pool moves',
    view(pm, STATED + RESET_GRACE_SEC + 1).scopedWeekly[0].resetsAt === STATED + 7 * D && decideAt(STATED + RESET_GRACE_SEC + 1)?.to === 'pm');
}
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
  ck('B-73fe: blocked = MAX over dead resets (+ the one-minute landing grace), and `until` names THAT bucket (Fable) at its STATED instant, not the nearer 5h', v.usable === false && v.blockedUntil === (NOW + 3 * D + 60) * 1000 && !!v.until && v.until.label === 'Fable' && v.until.resetsAt === NOW + 3 * D);
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


// ── THE WARM CACHE (2026-09-22, owner: "如果一个对话最近在活跃（缓存还热）那就尽量不要切，
// 因为无缓启动要消耗大量额度"): a re-point cold-starts the conversation, so a PROACTIVE
// move ('edf') of a warm one is held; a FORCED move ('exhausted') never is. ──────
{
  const { cacheTtlSecFor, warmCache } = require(path.resolve('src/account-pool-auto.js'));
  const fs = require('node:fs');
  ck('warm: a [1m] model runs on the 1-hour prompt cache', cacheTtlSecFor('claude-fable-5-1[1m]') === 3600 && cacheTtlSecFor('fable[1m]') === 3600);
  ck('warm: a plain model on the 5-minute default (and no model at all)', cacheTtlSecFor('claude-fable-5-1') === 300 && cacheTtlSecFor(null) === 300);
  const nowMs = NOW * 1000;
  ck('warm: no activity stamp ⇒ NOT warm (a hold never rests on ignorance)', (() => { const w = warmCache({ lastActivityMs: undefined, nowMs, model: 'fable[1m]' }); return w.warm === false && w.agoSec === null && w.ttlSec === 3600; })());
  const w1 = warmCache({ lastActivityMs: nowMs - 120e3, nowMs, model: 'claude-fable-5-1' });
  ck('warm: output 120 s ago on a 300 s cache ⇒ warm, agoSec 120, ttlSec 300', w1.warm === true && w1.agoSec === 120 && w1.ttlSec === 300, JSON.stringify(w1));
  const wEdge = warmCache({ lastActivityMs: nowMs - 300e3, nowMs, model: 'claude-fable-5-1' });
  ck('warm: exactly at the ttl the cache is COLD (ago >= ttl)', wEdge.warm === false && wEdge.agoSec === 300, JSON.stringify(wEdge));
  const w1m = warmCache({ lastActivityMs: nowMs - 20 * 60e3, nowMs, model: 'claude-fable-5-1[1m]' });
  ck('warm: 20 min ago on a [1m] conversation is still warm (1 h cache)', w1m.warm === true && w1m.ttlSec === 3600, JSON.stringify(w1m));

  // the proactive shape from the tier legs above: A healthy, B resets sooner ⇒ 'edf'
  const edfCaches = { a: acct(0.3, 6 * D), b: acct(0.4, 12 * H) };
  const hot = (caches, extra = {}) => decidePoolSwitch({ currentId: 'a', members, readCache: (id) => caches[id] ?? null, nowSec: NOW, proactive: true, hot: true, explain: true, ...extra });
  const held = hot(edfCaches, { warm: w1 });
  ck('warm: a WARM conversation is not moved by the proactive EDF jump — none(\'warm-cache\') carrying agoSec/ttlSec/wouldTo/wouldToName',
    held.to === null && held.reason === 'warm-cache' && held.agoSec === 120 && held.ttlSec === 300 && held.wouldTo === 'b' && held.wouldToName === 'B', JSON.stringify(held));
  ck('…and without explain it keeps the historical null contract', decidePoolSwitch({ currentId: 'a', members, readCache: (id) => edfCaches[id] ?? null, nowSec: NOW, proactive: true, hot: true, warm: w1 }) === null);
  const cold = hot(edfCaches, { warm: wEdge });
  ck('warm: a COLD conversation (ago >= ttl) gets the EDF jump exactly as before', cold.to === 'b' && cold.reason === 'edf', JSON.stringify(cold));
  ck('warm: warm:null is byte-identical to omitting it', JSON.stringify(hot(edfCaches, { warm: null })) === JSON.stringify(hot(edfCaches)));
  // a wall is a wall: the FORCED moves are never held
  const forced = hot({ a: acct(0.99, 6 * D), b: acct(0.4, 12 * H) }, { warm: w1 });
  ck('warm: a warm conversation on an EXHAUSTED member still switches — {to, reason:\'exhausted\'}', forced.to === 'b' && forced.reason === 'exhausted', JSON.stringify(forced));
  const soft = hot({ a: acct(0.97, 6 * D), b: acct(0.4, 12 * H) }, { warm: w1 });
  ck('warm: …and a soft-exhausted one too (the exhaustion tier is untouched)', soft.to === 'b' && soft.reason === 'exhausted', JSON.stringify(soft));
  const coldPool = decidePoolSwitch({ currentId: 'a', members, readCache: (id) => ({ a: acct(0.99, 6 * D), b: acct(0.4, 12 * H) })[id] ?? null, nowSec: NOW, warm: w1, explain: true });
  ck('warm: a COLD pool\'s exhaustion switch ignores the warm cache too', coldPool.to === 'b' && coldPool.reason === 'exhausted', JSON.stringify(coldPool));

  // WIRING PIN (the 2.355.0 unstaged-wiring lesson): the pure rule is dead unless
  // the ENGINE passes `warm:` at both sites that can make a proactive move. Code
  // only — a `//` comment can never satisfy the pin (the 2.369.134 lesson).
  const eng = fs.readFileSync(path.resolve('src/server/usage-pool-engine.js'), 'utf8')
    .split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '')).join('\n');
  const calls = [...eng.matchAll(/decidePoolSwitch\(\{[^\n]*\}\)/g)].map((m) => m[0]);
  const proactiveCalls = calls.filter((c) => /proactive:\s*hot/.test(c));
  const perSession = proactiveCalls.filter((c) => /exclude:\s*rejected/.test(c));
  const poolDefault = proactiveCalls.filter((c) => !/exclude:/.test(c));
  ck('WIRING PIN: the engine has exactly two proactive decidePoolSwitch sites — the per-session one and the pool default', perSession.length === 1 && poolDefault.length === 1 && proactiveCalls.length === 2, JSON.stringify(calls.map((c) => c.slice(0, 90))));
  ck('WIRING PIN: the PER-SESSION site passes warm:', perSession.length === 1 && /[{,]\s*warm[,:\s}]/.test(perSession[0]), perSession[0]);
  ck('WIRING PIN: the POOL-DEFAULT site passes warm:', poolDefault.length === 1 && /[{,]\s*warm\s*:/.test(poolDefault[0]), poolDefault[0]);
  const warmCalls = [...eng.matchAll(/warmCache\(\{[^\n]*\}\)/g)].map((m) => m[0]);
  ck('WIRING PIN: warmCache( is called with the pty liveness stamp _lastPtyDataAt (per-session s2 AND the default set)',
    warmCalls.some((c) => /s2\._lastPtyDataAt/.test(c)) && warmCalls.some((c) => /\bs\._lastPtyDataAt/.test(c)), JSON.stringify(warmCalls));
  ck('WIRING PIN: a warm-cache refusal is journalled through the throttled noteWarmHold at both sites',
    (eng.match(/reason === 'warm-cache'\) \{ noteWarmHold\(/g) || []).length === 2);
  ck('WIRING PIN: the hot bootstrap / placement site stays warm-less (no conversation yet)', calls.filter((c) => !/proactive:/.test(c)).every((c) => !/warm/.test(c)) && calls.filter((c) => !/proactive:/.test(c)).length === 1);
}


// ── THE FIRST STOP (2026-09-22, owner: "软耗尽的话 热对话切走时机晚一点，普通10%，热对话的话就5%这样。
// 如果一个对话到达了冷对话切走的标准但还热着，就在停下来的第一时间切走。"): on a HOT pool a
// SOFT-band exhaustion (under the hot bar, above the hard bar) moves a cold / idle
// conversation at once but DEFERS a warm one that is mid-turn to its first stop —
// none('warm-soft-defer'); the HARD band and a dead login move everyone at once. ──
{
  const { conversationInTurn, warmCache, THRESH } = require(path.resolve('src/account-pool-auto.js'));
  const fs = require('node:fs');
  // inTurn truth table — two protocol facts, ignorance is NOT a turn
  ck('inTurn: _isStreaming true ⇒ in a turn', conversationInTurn({ isStreaming: true }) === true);
  ck('inTurn: turnState running ⇒ in a turn', conversationInTurn({ isStreaming: false, turnState: 'running' }) === true);
  ck('inTurn: turnState requires_action ⇒ in a turn (paused on the user, not over)', conversationInTurn({ turnState: 'requires_action' }) === true);
  ck('inTurn: turnState idle + not streaming ⇒ NOT in a turn', conversationInTurn({ isStreaming: false, turnState: 'idle' }) === false);
  ck('inTurn: neither fact (a terminal-mode session) ⇒ NOT in a turn — moves at once', conversationInTurn({ isStreaming: undefined, turnState: undefined }) === false && conversationInTurn() === false);
  ck('inTurn: a truthy non-boolean isStreaming is not the protocol flag', conversationInTurn({ isStreaming: 1 }) === false);

  const nowMs = NOW * 1000;
  const warmW = warmCache({ lastActivityMs: nowMs - 30e3, nowMs, model: 'claude-fable-5-1' });
  const coldW = warmCache({ lastActivityMs: nowMs - 10 * 60e3, nowMs, model: 'claude-fable-5-1' });
  const W = (w, inTurn) => ({ ...w, inTurn });
  // A: 5h at 7 % remaining — under the hot bar (10), above the hard bar (5); B healthy
  const softC = { a: acct(0.3, 6 * D, { u5: 0.93 }), b: acct(0.3, 6 * D) };
  const hardC = { a: acct(0.3, 6 * D, { u5: 0.97 }), b: acct(0.3, 6 * D) };
  const hot = (caches, extra = {}) => decidePoolSwitch({ currentId: 'a', members, readCache: (id) => caches[id] ?? null, nowSec: NOW, proactive: true, hot: true, explain: true, ...extra });
  ck('bars: the fixture sits in the soft band (hot 10 > 7 ≥ hard 5)', THRESH.fiveHour.hot === 10 && THRESH.fiveHour.hard === 5);

  const def = hot(softC, { warm: W(warmW, true) });
  ck('soft + warm + inTurn ⇒ none(\'warm-soft-defer\') with wouldTo, band soft, agoSec/ttlSec',
    def.to === null && def.reason === 'warm-soft-defer' && def.wouldTo === 'b' && def.wouldToName === 'B' && def.band === 'soft' && def.agoSec === 30 && def.ttlSec === 300, JSON.stringify(def));
  ck('…it NAMES the tripped bucket and both of its bars (the journal line reads them)',
    def.softBucket && def.softBucket.label === '5h' && def.softBucket.kind === 'fiveHour' && def.softBucket.remaining === 7 && def.softBucket.hot === 10 && def.softBucket.hard === 5, JSON.stringify(def.softBucket));
  ck('…and speaks the quota bands like every other refusal (lowBuckets names the 5h)', Array.isArray(def.lowBuckets) && def.lowBuckets.includes('5h 7%'), JSON.stringify(def.lowBuckets));
  ck('…without explain it keeps the historical null contract', decidePoolSwitch({ currentId: 'a', members, readCache: (id) => softC[id] ?? null, nowSec: NOW, proactive: true, hot: true, warm: W(warmW, true) }) === null);
  const idle = hot(softC, { warm: W(warmW, false) });
  ck('soft + warm + IDLE (its first stop) ⇒ the exhaustion move, band soft', idle.to === 'b' && idle.reason === 'exhausted' && idle.band === 'soft', JSON.stringify(idle));
  const coldIn = hot(softC, { warm: W(coldW, true) });
  ck('soft + COLD + inTurn ⇒ the exhaustion move at once (nothing to protect)', coldIn.to === 'b' && coldIn.reason === 'exhausted' && coldIn.band === 'soft', JSON.stringify(coldIn));
  const noInTurn = hot(softC, { warm: warmW });
  ck('soft + warm with NO inTurn field ⇒ the move (the 2.369.149 shape is byte-identical)', noInTurn.to === 'b' && noInTurn.reason === 'exhausted', JSON.stringify(noInTurn));
  ck('soft + warm:null ⇒ identical to omitting it', JSON.stringify(hot(softC, { warm: null })) === JSON.stringify(hot(softC)));
  const hardIn = hot(hardC, { warm: W(warmW, true) });
  ck('HARD + warm + inTurn ⇒ the exhaustion move at once, band hard', hardIn.to === 'b' && hardIn.reason === 'exhausted' && hardIn.band === 'hard', JSON.stringify(hardIn));
  const deadLogin = hot({ a: acct(0.3, 6 * D), b: acct(0.3, 6 * D) }, { warm: W(warmW, true), readLogin: (id) => (id === 'a' ? { state: 'expired' } : { state: 'live' }) });
  ck('login-dead + warm + inTurn ⇒ login-expired move at once, band hard', deadLogin.to === 'b' && deadLogin.reason === 'login-expired' && deadLogin.band === 'hard', JSON.stringify(deadLogin));
  const softNoSettle = hot({ a: acct(0.3, 6 * D, { u5: 0.93 }), b: acct(0.3, 6 * D, { u5: 0.92 }) }, { warm: W(warmW, true) });
  ck('soft + warm + inTurn with nowhere settleable ⇒ still no-settleable (the refusal that SPEAKS wins; nothing is owed)', softNoSettle.to === null && softNoSettle.reason === 'no-settleable', JSON.stringify(softNoSettle));
  const coldPoolIn = decidePoolSwitch({ currentId: 'a', members, readCache: (id) => softC[id] ?? null, nowSec: NOW, warm: W(warmW, true), explain: true });
  ck('a COLD pool has no soft band: 7 % is healthy there, nothing deferred', coldPoolIn.to === null && coldPoolIn.reason === 'healthy', JSON.stringify(coldPoolIn));
  // the EDF tier is UNCHANGED: a warm conversation waits for a cold cache whether or not it is in a turn
  const edfC = { a: acct(0.3, 6 * D), b: acct(0.4, 12 * H) };
  ck('edf + warm (idle) ⇒ warm-cache, unchanged', hot(edfC, { warm: W(warmW, false) }).reason === 'warm-cache');
  ck('edf + warm + inTurn ⇒ warm-cache too (the proactive rule is the owner\'s FIRST rule, untouched)', hot(edfC, { warm: W(warmW, true) }).reason === 'warm-cache');

  // WIRING PIN (the 2.355.0 lesson): code only, comments stripped (the 2.369.134 lesson)
  const strip = (f) => fs.readFileSync(path.resolve(f), 'utf8').split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '')).join('\n');
  const eng = strip('src/server/usage-pool-engine.js');
  ck('WIRING PIN: the per-session site passes inTurn from s2._isStreaming AND s2._turnState',
    /inTurn: conversationInTurn\(\{ isStreaming: s2\._isStreaming, turnState: s2\._turnState \}\)/.test(eng));
  // 2.369.157 (owner ruling 2026-09-22, design-reset-credits §8 ③): the pool
  // DEFAULT's soft hold is DROPPED — a default follower is legacy — so that site
  // computes NO inTurn; it still passes `warm` (2.369.149's proactive hold stays)
  ck('WIRING PIN: the pool-default site computes NO inTurn (the soft hold is dropped) but still hands `warm: defaultWarm` to the decision',
    !/inTurn: conversationInTurn\(\{ isStreaming: s\._isStreaming, turnState: s\._turnState \}\)/.test(eng)
    && /const w = warmCache\(\{ lastActivityMs: s\._lastPtyDataAt, nowMs: now, model: cacheModelFor\(s\) \}\);/.test(eng)
    && /creditsIds, warm: defaultWarm, explain: true \}\);/.test(eng));
  ck('WIRING PIN: the per-session site journals a warm-soft-defer through noteWarmHold under a :soft key (nothing else is recorded — the stop re-decides from the facts); the default site has none',
    (eng.match(/reason === 'warm-soft-defer'\) \{ noteWarmHold\([^\n]*sid \+ ':soft'\); continue; \}/g) || []).length === 1
    && !/':default:soft'/.test(eng) // …and the default no longer journals one (it never defers a soft move)
    && !/_softDeferred/.test(eng));
  ck('WIRING PIN: the default site does NOT pin a follower through ensureSessionPoolLink (its CLI never reads a per-session link — see the engine essay)',
    !/ensureSessionPoolLink\([^\n]*warm-soft-defer/.test(eng));
  ck('WIRING PIN: the turn-end boundary is the FIRST STOP (maybePoolAutoSwitch(session, { stop: true }) inside noteTurnEnd)',
    /function noteTurnEnd\(session, rec = null\) \{[\s\S]*?maybePoolAutoSwitch\(session, \{ stop: true \}\);[\s\S]*?\n\}/.test(eng));
  ck('WIRING PIN: EVERY signalled stop of a conversation no longer in a turn forces past the eval gate, owed or not (verifier LOW-2)',
    /const force = stop\n\s*&& !conversationInTurn\(\{ isStreaming: session\._isStreaming, turnState: session\._turnState \}\);/.test(eng));
  ck('WIRING PIN: the authoritative idle record re-decides every pooled conversation\'s stop (noteTurnStopped is not gated on an owed move — LOW-2)',
    /function noteTurnStopped\(session\) \{\n\s*try \{\n\s*if \(!session \|\| !session\._accountId\) return;\n\s*maybePoolAutoSwitch\(session, \{ stop: true \}\);/.test(eng));
  ck('WIRING PIN: a per-session re-point clears that conversation\'s two hold/defer throttle keys (a new deferral episode speaks — LOW-3)',
    /accounts\.ensureSessionPoolLink\(poolId, sid, ds\.to, \{ why: 'per-session-switch' \}\);\n\s*_warmHoldLogAt\.delete\(poolId \+ ':' \+ sid\); _warmHoldLogAt\.delete\(poolId \+ ':' \+ sid \+ ':soft'\);/.test(eng));
  ck('WIRING PIN: all four journal lines (warm hold, soft defer, priority hold, pin hold) name the target by its NAME, the id only as the fallback (verifier INFO-a)',
    (eng.match(/\$\{d\.wouldToName \|\| d\.wouldTo\}/g) || []).length === 4 && !/\$\{d\.wouldTo\}/.test(eng));
  const parse = strip('src/server/stdout/claude-stream-json.js');
  ck('WIRING PIN: the authoritative idle record is the first stop too (claude-stream-json calls noteTurnStopped on a CHANGE to idle)',
    /if \(changed && st === 'idle'\) \{ try \{ noteTurnStopped\?\.\(session\); \} catch \{ \} \}/.test(parse) && /settleTurnLane, noteTurnStopped,\s*noteStreamRecord, recordIsLate \} = engine;/.test(parse));
  const srv = strip('server.js');
  ck('WIRING PIN: server.js destructures noteTurnStopped from the engine AND hands it to the stdout engine literal',
    /notePoolAuthFailure, noteTurnStopped,/.test(srv) && /noteTurnEnd, noteTurnStopped, noteWallSignal,/.test(srv));
}

// ── THE PROJECTION (B-f69c ③, owner ruling ut-1c6c15a2db ③): the estimator's
// burn carries the view PROJECTION_LEAD_SEC ahead; a COLD conversation decides
// on it and leaves BEFORE the line, a WARM one never does (a projection alone
// never moves a warm conversation — the .149/.153 rules judge only readings). ──
await (async () => {
  const { projectCacheAhead, projectionCrossing, PROJECTION_LEAD_SEC, THRESH, warmCache } = require(path.resolve('src/account-pool-auto.js'));
  const fs = require('node:fs'), os = require('node:os');
  ck('proj: the lead is the fast rung\'s own floor (5 min)', PROJECTION_LEAD_SEC === 300);
  // A: 5h at 14 % remaining, burning 1.2 %/min; B healthy; SAME weekly deadline (EDF silent)
  const A14 = { fiveHour: { utilization: 0.86, resetsAt: NOW + 2 * H }, sevenDay: { utilization: 0.3, resetsAt: NOW + 3 * D }, scopedWeekly: [{ name: 'Fable', utilization: 0.4, resetsAt: NOW + 3 * D }] };
  const burn = { fiveHour: 0.012, 'scoped:fable': 0.001 };
  const ahead = projectCacheAhead(A14, burn, NOW, 300);
  ck('proj: 5 min at 1.2 %/min takes the 5h from 14 % to 8 % remaining; the Fable cap moves by its own burn; 7d (no burn entry) does not move',
    Math.abs(ahead.fiveHour.utilization - 0.92) < 1e-9 && ahead.fiveHour.projected === true && Math.abs(ahead.scopedWeekly[0].utilization - 0.405) < 1e-9 && ahead.sevenDay === A14.sevenDay && ahead.projectedAheadSec === 300, JSON.stringify(ahead));
  ck('proj: no burn ⇒ the SAME object (no claim, nothing projected)', projectCacheAhead(A14, {}, NOW, 300) === A14 && projectCacheAhead(A14, null, NOW, 300) === A14 && projectCacheAhead(A14, burn, NOW, 0) === A14);
  const soonReset = { ...A14, fiveHour: { utilization: 0.86, resetsAt: NOW + 120 } };
  ck('proj: a window that resets INSIDE the lead is not advanced (it refills — a projection never invents a wall past its own reset)', projectCacheAhead(soonReset, burn, NOW, 300).fiveHour === soonReset.fiveHour);
  ck('proj: an EMPTY window is never advanced (B-8b12: nobody is spending in it)', projectCacheAhead({ fiveHour: { utilization: 0, resetsAt: NOW + 5 * H, state: 'empty' } }, burn, NOW, 300).fiveHour.projected !== true);
  const c = projectionCrossing(A14, burn, NOW, { hot: true });
  ck('cross: on a hot pool the 5h reaches its 10 % soft line in (14−10)/1.2 min = 200 s', c && c.label === '5h' && c.line === THRESH.fiveHour.hot && c.inSec === 200 && c.band === 'soft' && c.pctPerMin === 1.2, JSON.stringify(c));
  const ch = projectionCrossing(A14, burn, NOW, { hot: false });
  ck('cross: a cold pool\'s line is the hard bar (5 %): 450 s', ch && ch.line === THRESH.fiveHour.hard && ch.inSec === 450 && ch.band === 'hard', JSON.stringify(ch));
  ck('cross: a bucket already under its line is NOT a projection (the estimate of now decides it)', projectionCrossing({ fiveHour: { utilization: 0.95, resetsAt: NOW + 2 * H } }, burn, NOW, { hot: true }) === null);
  ck('cross: a reset before the crossing ⇒ no crossing', projectionCrossing({ fiveHour: { utilization: 0.86, resetsAt: NOW + 100 } }, burn, NOW, { hot: true }) === null);
  ck('cross: no burn ⇒ no crossing', projectionCrossing(A14, {}, NOW, { hot: true }) === null);

  // the PURE decision on the two views: the projected one is soft-exhausted, the estimate of now is healthy
  const B = { fiveHour: { utilization: 0.1, resetsAt: NOW + 2 * H }, sevenDay: { utilization: 0.3, resetsAt: NOW + 3 * D }, scopedWeekly: [{ name: 'Fable', utilization: 0.2, resetsAt: NOW + 3 * D }] };
  const caches = { a: A14, b: B };
  const dec = (view, warm) => decidePoolSwitch({ currentId: 'a', members, readCache: view, nowSec: NOW, proactive: true, hot: true, explain: true, warm });
  const nowView = (id) => caches[id] ?? null, projView = (id) => projectCacheAhead(caches[id] ?? null, id === 'a' ? burn : {}, NOW, 300);
  ck('decide: on the estimate of NOW the member is healthy (14 % > the 10 % soft line) — nothing moves', dec(nowView, null).to === null);
  const dp = dec(projView, null);
  ck('decide: on the projected view it is soft-exhausted (8 %) — the move a cold conversation takes early', dp.to === 'b' && dp.reason === 'exhausted' && dp.band === 'soft', JSON.stringify(dp));

  // ── the REAL engine: two conversations on member A, one cold, one warm ──
  const { AccountManager } = require(path.resolve('src/accounts.js'));
  const { ClaudeCodeAdapter } = require(path.resolve('src/adapters/claude-code.js'));
  const { scratch } = await import('./scratch.mjs');
  const scr = scratch('poolproj'); fs.rmSync(scr, { recursive: true, force: true }); fs.mkdirSync(scr, { recursive: true });
  // PATCHED COPIES live in a SCRATCH copy of src/ (never in the tree): the
  // relative requires resolve inside the copy, node_modules through a symlink.
  const mutEngine = (tag, from, to) => {
    const root = path.join(scr, 'mut-' + tag);
    fs.cpSync(path.resolve('src'), path.join(root, 'src'), { recursive: true });
    fs.copyFileSync(path.resolve('package.json'), path.join(root, 'package.json'));
    try { fs.symlinkSync(path.resolve('node_modules'), path.join(root, 'node_modules')); } catch { }
    const fp = path.join(root, 'src/server/usage-pool-engine.js');
    const src = fs.readFileSync(fp, 'utf8');
    if (!src.includes(from)) return { hit: false };
    fs.writeFileSync(fp, src.replace(from, to));
    return { hit: true, mod: require(fp) };
  };
  const CREDS = (id) => JSON.stringify({ claudeAiOauth: { accessToken: 'tok-' + id, refreshToken: 'r-' + id, expiresAt: Date.now() + 36e5, refreshTokenExpiresAt: Date.now() + 30 * 86400e3, subscriptionType: 'max' } });
  const world = (engMod, { burnA = 0.012 } = {}) => {
    const root = fs.mkdtempSync(path.join(scr, 'w-'));
    const dataDir = path.join(root, 'data');
    const am = new AccountManager({ dataDir });
    if (!am.poolSupported()) return null;
    const A = am.createSubscription({ name: 'Member A' }).id, Bm = am.createSubscription({ name: 'Member B' }).id;
    for (const x of [A, Bm]) fs.writeFileSync(path.join(am.subDir(x), '.credentials.json'), CREDS(x), { mode: 0o600 });
    const P = am.createPool({ name: 'Pool' }).id;
    am.setPoolTarget(P, A); am.updatePool(P, { auto: true, hot: true });
    const cacheDir = path.join(dataDir, 'usage-cache'); fs.mkdirSync(cacheDir, { recursive: true });
    const nowS = Math.floor(Date.now() / 1000);
    const wk = nowS + 3 * 86400;
    fs.writeFileSync(path.join(cacheDir, A + '.json'), JSON.stringify({ fetchedAt: Date.now() - 60000, source: 'on-demand', fiveHour: { utilization: 0.86, resetsAt: nowS + 7200 }, sevenDay: { utilization: 0.3, resetsAt: wk }, scopedWeekly: [{ name: 'Fable', utilization: 0.4, resetsAt: wk }] }));
    fs.writeFileSync(path.join(cacheDir, Bm + '.json'), JSON.stringify({ fetchedAt: Date.now() - 60000, source: 'on-demand', fiveHour: { utilization: 0.1, resetsAt: nowS + 7200 }, sevenDay: { utilization: 0.3, resetsAt: wk }, scopedWeekly: [{ name: 'Fable', utilization: 0.2, resetsAt: wk }] }));
    const sessions = new Map(), notices = [];
    const eng = engMod.create({
      app: { get() { }, post() { }, put() { }, delete() { }, use() { }, locals: {} }, rootDir: root, USAGE_CACHE_DIR: cacheDir, activeSessions: sessions,
      wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() { }, serverNotice: (k, t) => notices.push(t), serverSetting: () => undefined, getAccounts: () => am,
      getHosts: () => ({ device: async () => ({ poolOrders: async () => { }, ackPoolOrdersLog() { } }) }),
      getUsageHistory: () => ({ _cost: () => 0, ingestRemoteEvents() { } }), recordUsageAttribution() { }, adapterRegistry: { get: () => ClaudeCodeAdapter },
      getAutoResume: () => ({ armIfEnabled() { }, noteFireOutcome() { }, noteRecovered() { }, noteNoPoolTarget() { }, statusFor: () => null, enabledFor: () => false, fireNow() { } }),
      getOtelIngest: () => ({ observedOrgFor: () => null }), getQuotaProbe: () => null, getSessionMetaStore: () => null,
    });
    // the estimator's burn, injected on the engine's OWN instance (the ledger is
    // a stub here): member A burns its 5h at 1.2 %/min, B is idle
    eng.usageEstimator.burnFor = (id) => (id === A && burnA ? { fiveHour: burnA } : {});
    const mk = (sid, lastAgoMs) => {
      const s = { backend: 'claude', mode: 'chat', host: null, _webuiId: sid, claudeSessionId: 'cid-' + sid, _accountId: P, name: sid, cwd: root, sockName: 'cw-' + sid, buffer: '', createdAt: Date.now(), pty: { write() { } },
        _spawnModel: 'claude-fable-5-1', _lastPtyDataAt: Date.now() - lastAgoMs, _isStreaming: false, _turnState: 'idle' };
      sessions.set(sid, s); am.ensureSessionPoolLink(P, sid, A, { why: 'spawn' });
      return s;
    };
    mk('sess-cold', 20 * 60e3);   // output 20 min ago on a 5-min cache: COLD
    mk('sess-warm', 30e3);        // output 30 s ago: WARM, idle between turns
    const linkOf = (sid) => (am.poolCurrentFor(P, sid) === A ? 'A' : am.poolCurrentFor(P, sid) === Bm ? 'B' : String(am.poolCurrentFor(P, sid)));
    const quiet = () => { const o = console.log, w = console.warn, lines = []; console.log = (...a) => lines.push(a.join(' ')); console.warn = (...a) => lines.push(a.join(' ')); return () => { console.log = o; console.warn = w; return lines; }; };
    const run = () => { const done = quiet(); try { eng.maybePoolAutoSwitchForPool(P); } finally { var lines = done(); } return lines; };
    return { eng, am, A, Bm, P, sessions, notices, linkOf, run };
  };
  const engMod = require(path.resolve('src/server/usage-pool-engine.js'));
  const w = world(engMod);
  if (!w) { ck('proj/engine SKIP — pools unsupported on this platform', true); }
  else {
    ck('engine setup: the cold/warm split is what warmCache says', warmCache({ lastActivityMs: w.sessions.get('sess-cold')._lastPtyDataAt, nowMs: Date.now(), model: 'claude-fable-5-1' }).warm === false
      && warmCache({ lastActivityMs: w.sessions.get('sess-warm')._lastPtyDataAt, nowMs: Date.now(), model: 'claude-fable-5-1' }).warm === true);
    const pr = w.eng.projectionRereadFor(w.A, Date.now());
    ck('engine: projectionRereadFor names A\'s crossing — 5h, its 10 % soft line, ~200 s, burn 1.2 pt/min, fam fable', pr && pr.label === '5h' && pr.line === 10 && Math.abs(pr.inMs - 200000) <= 1000 && pr.burnPtPerMin === 1.2 && pr.fam === 'fable', JSON.stringify(pr));
    ck('engine: …and nothing for B (no live conversation on it)', w.eng.projectionRereadFor(w.Bm, Date.now()) === null);
    const lines = w.run();
    ck('engine: the COLD conversation leaves A early on the projection (the estimate of now says 14 % — healthy)', w.linkOf('sess-cold') === 'B', w.linkOf('sess-cold') + ' | ' + lines.filter((l) => /\[pool\]/.test(l)).join(' | ').slice(0, 300));
    ck('engine: a projection alone NEVER moves the WARM conversation — it stays on A', w.linkOf('sess-warm') === 'A', lines.filter((l) => /\[pool\]/.test(l)).join(' | ').slice(0, 300));
    ck('engine: the journal line says the move was EARLY and why (projected: 5h … line … %/min)', lines.some((l) => /per-session switch .*sess-cold.*projected: 5h reaches its 10% line in ~\d+ min at 1\.2%\/min/.test(l)), lines.filter((l) => /sess-cold/.test(l)).join(' | '));
    ck('engine: the user notice says it too (will be at … — moved early)', w.notices.length === 2 && /moved to Member B/.test(w.notices[0]) && /moved early, projected: 5h/.test(w.notices[0]) && /will be at 8% within 5 min/.test(w.notices[0]), JSON.stringify(w.notices));
    ck('engine: the pool DEFAULT (no follower, so none warm) moves early too, and its notice says the number is PROJECTED — never "down to 8 %" of a member at 14 %',
      /auto-switched to Member B \(previous account will be down to 8% within 5 min — moved early, projected: 5h reaches its 10% line/.test(w.notices[1]) && !/down to 8% remaining/.test(w.notices[1]), w.notices[1]);
    // no burn ⇒ no projection ⇒ nothing moves (the same world shape, idle member)
    const w0 = world(engMod, { burnA: 0 });
    w0.run();
    ck('engine: with no burn nothing moves — the projection is the ONLY reason the cold one left', w0.linkOf('sess-cold') === 'A' && w0.linkOf('sess-warm') === 'A');
    // NEGATIVE CONTROLS — patched copies in a scratch dir
    const noGate = mutEngine('nogate', 'const lead = warm.warm ? 0 : PROJECTION_LEAD_SEC;', 'const lead = PROJECTION_LEAD_SEC; // PATCHED: no warm gate');
    ck('control: the patch (the warm gate removed) hits', noGate.hit);
    if (noGate.hit) {
      const wg = world(noGate.mod); wg.run();
      ck('control: WITHOUT the warm gate the projection moves the warm conversation too — the gate is what holds it', wg.linkOf('sess-warm') === 'B' && wg.linkOf('sess-cold') === 'B', wg.linkOf('sess-warm'));
    }
    const noProj = mutEngine('noproj', 'const lead = warm.warm ? 0 : PROJECTION_LEAD_SEC;', 'const lead = 0; // PATCHED: master (no projection)');
    ck('control: the patch (master: no projection) hits', noProj.hit);
    if (noProj.hit) {
      const wp = world(noProj.mod); wp.run();
      ck('control: on master the cold conversation stays on A and meets the line blind', wp.linkOf('sess-cold') === 'A', wp.linkOf('sess-cold'));
    }
  }
  // WIRING PINS (code only): both proactive sites decide on the projection-gated view
  const strip = (f) => fs.readFileSync(path.resolve(f), 'utf8').split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '')).join('\n');
  const eng = strip('src/server/usage-pool-engine.js');
  ck('WIRING PIN: the per-session lead is 0 for a warm conversation, and its decision reads `viewFor`',
    /const lead = warm\.warm \? 0 : PROJECTION_LEAD_SEC;/.test(eng) && /decidePoolSwitch\(\{ currentId: curFor, members, readCache: viewFor,/.test(eng));
  ck('WIRING PIN: the pool default projects only while no follower is warm',
    /const defaultView = defaultWarm \? readCache : \(id\) => projectCacheAhead\(readCache\(id\), burnOf\(id\), now \/ 1000, PROJECTION_LEAD_SEC\);/.test(eng) && /readCache: defaultView,[^\n]*warm: defaultWarm/.test(eng));
  fs.rmSync(scr, { recursive: true, force: true });
})();


// ── A MEMBER REMOVED FROM THE POOL STOPS SERVING AT ONCE (2026-09-28, owner: "如果用到一半把账号从池里排除，
// 不会第一时间触发切走，比如现在我把martinmax排除池子了你却还在用"). Membership is a placement FACT the verdict
// judges (`membership` ⇒ 'not-a-member', a HARD wall), never a candidate filter. ──────────────────────────────
await (async () => {
  const fs = require('node:fs');
  const { execFileSync } = await import('node:child_process');
  const { mutantCopies, copiesCensus } = await import('./mutant-copy.mjs');
  const REPO = path.resolve('.');
  const M = mutantCopies('poolpin-member', REPO);
  const { warmCache } = require(path.resolve('src/account-pool-auto.js'));
  const hotW = { warm: true, agoSec: 10, ttlSec: 300, inTurn: true };
  const healthy = { a: acct(0.3, 3 * D), b: acct(0.2, 2 * D), c: acct(0.1, 5 * D) };
  const dm = (opts = {}) => decidePoolSwitch({ currentId: 'a', members: [{ id: 'b', name: 'B' }, { id: 'c', name: 'C' }], readCache: (id) => (opts.caches || healthy)[id] ?? null, nowSec: NOW, explain: true, ...opts });
  // (1) the wall: a HEALTHY current member the pool no longer lists moves NOW
  const r1 = dm({ membership: ['b', 'c'] });
  ck('member: a current member the pool no longer lists moves at once — reason not-a-member, band hard (its quota is healthy: 70 % left)', r1.to === 'b' && r1.reason === 'not-a-member' && r1.band === 'hard');
  const r2 = dm({ membership: ['b', 'c'], proactive: true, hot: true, warm: hotW });
  ck('member: …warm AND mid-turn on a hot pool it still moves (a wall is a wall — no warm-cache hold, no first-stop defer)', r2.to && r2.reason === 'not-a-member' && r2.band === 'hard');
  const r3 = dm({ membership: ['b', 'c'], caches: { b: healthy.b, c: healthy.c } });
  ck('member: …with NO reading of its own it still moves (never the no-data hold — its quota is beside the point)', r3.to === 'b' && r3.reason === 'not-a-member');
  const r4 = dm({ membership: ['b', 'c'], caches: { a: acct(0.3, 3 * D), b: acct(0.2, 3 * D), c: acct(0.31, 3 * D) } });
  ck('member: …with no GAIN available (the others hold less than it does) it still moves — the anti-flap floor never keeps a removed member', r4.to && r4.reason === 'not-a-member');
  const r5 = dm({ membership: ['b', 'c'], caches: { a: acct(0.3, 3 * D), b: acct(0.99, 3 * D), c: acct(0.995, 3 * D) } });
  // the owner's 全B (2026-09-28): nobody can take it ⇒ it is HELD (stops after its turn, parked on the member usable soonest)
  ck('member: nobody can take it ⇒ the outcome is the HOLD (removed-hold: nobody to move it TO, parked on the member usable soonest, the blocked reason kept) — never "keep running"', r5.to === null && r5.reason === 'removed-hold' && r5.blockedWhy === 'no-members' && r5.holdTo === 'b' && r5.notMember && r5.notMember.id === 'a', JSON.stringify(r5));
  const txt = poolBlockedNotice(r5, { poolName: '全部', currentName: 'Martin Max' });
  ck('member: …and the sentence names it — no longer a member, nobody can take over, the fix (never "out of quota" about a member with 70 % left)',
    /^Pool "全部": Martin Max is no longer a member of the pool and no member can take over its conversations — every other member is out of quota\. Its conversations stop after their current turn and wait until a member can serve them — add a member to continue sooner\.$/.test(txt), txt);
  // (2) a SIGNED-OUT member is still a member — its wall is the login, and it keeps the re-login words
  const lo = { a: { state: 'logged-out' }, b: { state: 'ok' }, c: { state: 'ok' } };
  const r6 = dm({ membership: ['a', 'b', 'c'], readLogin: (id) => lo[id] });
  ck('member: a signed-out member the pool still lists keeps its own verdict (login-expired) — membership is the configured list, never the logged-in one', r6.to === 'b' && r6.reason === 'login-expired');
  // (3) membership unchanged ⇒ byte-identical: a seeded sweep against the master copy (the ref-free half — the three
  //     membership shapes decide alike — runs everywhere; the historical rung only where the ref is, mirror-197)
  const pre = await preFixCopy(M, 'b970f16d', 'src/account-pool-auto.js');
  const master = pre.mod;
  if (!master && pre.why === 'shallow') skipPreFix('member: ', 'b970f16d');
  else ck(`member: the master copy (b970f16d) loaded for the byte-identity sweep${pre.why ? ` — ${pre.why}` : ''}`, !!master && typeof master.decidePoolSwitch === 'function');
  // CONTROL (mirror-197): a ref that is NOT here is a skip only on a SHALLOW clone — on a full clone it is a failure by name
  { const gone = await preFixCopy(M, '0123456789abcdef0123456789abcdef01234567', 'src/account-pool-auto.js', 'gone'); ck(`preFixCopy CONTROL: an absent ref answers ${master ? '"NOT shallow" (a failure, never a skip) on this full clone' : "'shallow' on this shallow clone"} — the helper tells the two worlds apart`, gone.mod === null && (master ? /NOT shallow/.test(gone.why) : gone.why === 'shallow')); }
  {
    let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const ids = ['a', 'b', 'c', 'd'];
    let same = 0, n = 0, diff = null;
    for (let i = 0; i < 300; i++) {
      const caches = {}; for (const id of ids) caches[id] = rnd() < 0.1 ? null : acct(Math.round(rnd() * 100) / 100, Math.round(rnd() * 6 * D) + H, { u5: Math.round(rnd() * 100) / 100, uf: rnd() < 0.5 ? Math.round(rnd() * 100) / 100 : null });
      const mem = ids.filter(() => rnd() < 0.8).map((id) => ({ id, name: id.toUpperCase() }));
      const cur = ids[Math.floor(rnd() * ids.length)];
      const proactive = rnd() < 0.5;
      const w = rnd() < 0.3 ? { warm: rnd() < 0.5, agoSec: 10, ttlSec: 300, inTurn: rnd() < 0.5 } : null;
      const base = { currentId: cur, members: mem, readCache: (id) => caches[id] ?? null, nowSec: NOW, proactive, hot: proactive, exclude: rnd() < 0.2 ? ['b'] : null, warm: w, explain: true };
      const want = JSON.stringify((master || { decidePoolSwitch }).decidePoolSwitch(base));
      for (const extra of [{}, { membership: [...ids] }, { membership: new Set([cur, ...mem.map((m) => m.id)]) }]) {
        n++;
        const got = JSON.stringify(decidePoolSwitch({ ...base, ...extra }));
        if (got === want) same++; else if (!diff) diff = { i, extra: Object.keys(extra), want, got };
      }
    }
    ck(`member: ${n} seeded verdicts with the current member LISTED (or membership omitted) are byte-identical to ${master ? 'master' : 'the verdict with membership omitted (ref-free)'}`, same === n, JSON.stringify(diff));
  }
  // (4) CONTROL: the membership check removed ⇒ the removed member with quota left keeps serving (the incident)
  const src = fs.readFileSync(path.resolve('src/account-pool-auto.js'), 'utf8');
  const anchor = "const notMember = membership != null && !(typeof membership.has === 'function' ? membership : new Set(membership)).has(currentId);";
  ck('member CONTROL: the patch anchor is in the product source', src.includes(anchor));
  const mut = M.load('src/account-pool-auto.js', src.replace(anchor, 'const notMember = false; // PATCHED: membership is not a fact'), 'nomember');
  const mr = mut.decidePoolSwitch({ currentId: 'a', members: [{ id: 'b', name: 'B' }, { id: 'c', name: 'C' }], readCache: (id) => healthy[id] ?? null, nowSec: NOW, explain: true, membership: ['b', 'c'] });
  ck('member CONTROL: without the membership fact the removed member (70 % left) STAYS — healthy, nothing moves (the 16:56 incident)', mr.to === null && mr.reason === 'healthy', JSON.stringify(mr));

  // ── the REAL engine + the REAL members route: three conversations on the member the owner removes ──
  const { AccountManager } = require(path.resolve('src/accounts.js'));
  const { ClaudeCodeAdapter } = require(path.resolve('src/adapters/claude-code.js'));
  const { scratch } = await import('./scratch.mjs');
  const scr = scratch('poolpin-member'); fs.rmSync(scr, { recursive: true, force: true }); fs.mkdirSync(scr, { recursive: true });
  const CREDS = (id) => JSON.stringify({ claudeAiOauth: { accessToken: 'tok-' + id, refreshToken: 'r-' + id, expiresAt: Date.now() + 36e5, refreshTokenExpiresAt: Date.now() + 30 * 86400e3, subscriptionType: 'max' } });
  const quietly = (fn) => { const o = console.log, w = console.warn, lines = []; console.log = (...a) => lines.push(a.join(' ')); console.warn = (...a) => lines.push(a.join(' ')); try { fn(); } finally { console.log = o; console.warn = w; } return lines; };
  const world = (engMod, { hot = true } = {}) => {
    const root = fs.mkdtempSync(path.join(scr, 'w-'));
    const dataDir = path.join(root, 'data');
    const am = new AccountManager({ dataDir });
    if (!am.poolSupported()) return null;
    const id = {};
    for (const [k, nm] of [['martin', 'Martin Max'], ['uci', 'UCI Max'], ['fish', 'Fish Max']]) { id[k] = am.createSubscription({ name: nm }).id; fs.writeFileSync(path.join(am.subDir(id[k]), '.credentials.json'), CREDS(id[k]), { mode: 0o600 }); }
    const P = am.createPool({ name: '全部', members: [id.martin, id.uci, id.fish] }).id;
    am.setPoolTarget(P, id.martin); am.updatePool(P, { auto: true, hot });
    const cacheDir = path.join(dataDir, 'usage-cache'); fs.mkdirSync(cacheDir, { recursive: true });
    const nowS = Math.floor(Date.now() / 1000);
    const wr = (k, u7, resetInS) => fs.writeFileSync(path.join(cacheDir, id[k] + '.json'), JSON.stringify({ fetchedAt: Date.now() - 60000, source: 'on-demand', fiveHour: { utilization: 0.1, resetsAt: nowS + 7200 }, sevenDay: { utilization: u7, resetsAt: nowS + resetInS } }));
    // Martin is HEALTHY and the EDF-best (its week resets soonest — nothing voluntary would ever move a
    // conversation off it: the removal is the ONLY reason to move); UCI is first in the list, but Fish's
    // window resets sooner than UCI's — so a DECISION picks Fish, `list[0]` would pick UCI
    wr('martin', 0.3, 1 * 86400); wr('uci', 0.2, 6 * 86400); wr('fish', 0.4, 2 * 86400);
    const sessions = new Map(), notices = [], sent = [], fires = [];
    const client = { readyState: 1, send: (p) => sent.push(JSON.parse(p)) };
    const eng = engMod.create({
      app: { get() { }, post() { }, put() { }, patch() { }, delete() { }, use() { }, locals: {} }, rootDir: root, USAGE_CACHE_DIR: cacheDir, activeSessions: sessions,
      wss: { clients: new Set([client]) }, WS_OPEN: 1, broadcastToSession() { }, serverNotice: (k, t, o) => notices.push({ k, t, o }), serverSetting: () => undefined, getAccounts: () => am,
      getHosts: () => ({ device: async () => ({ poolOrders: async () => { }, ackPoolOrdersLog() { } }) }),
      getUsageHistory: () => ({ _cost: () => 0, ingestRemoteEvents() { } }), recordUsageAttribution() { }, adapterRegistry: { get: () => ClaudeCodeAdapter },
      getAutoResume: () => ({ armIfEnabled() { }, noteFireOutcome() { }, noteRecovered() { }, noteNoPoolTarget() { }, statusFor: () => null, enabledFor: () => false, fireNow: (sid) => { fires.push(sid); return false; }, armedIds: () => [] }),
      getOtelIngest: () => ({ observedOrgFor: () => null }), getQuotaProbe: () => null, getSessionMetaStore: () => null,
    });
    eng.usageEstimator.burnFor = () => ({});
    const mk = (sid, on, { warm = false, inTurn = false } = {}) => {
      const s = { backend: 'claude', mode: 'chat', host: null, _webuiId: sid, claudeSessionId: 'cid-' + sid, _accountId: P, name: 'conv ' + sid, cwd: root, sockName: 'cw-' + sid, buffer: '', createdAt: Date.now(), pty: { write() { } },
        _spawnModel: 'claude-fable-5-1', _lastPtyDataAt: Date.now() - (warm ? 20e3 : 30 * 60e3), _isStreaming: inTurn, _turnState: inTurn ? 'running' : 'idle' };
      sessions.set(sid, s); am.ensureSessionPoolLink(P, sid, id[on], { why: 'spawn' });
      return s;
    };
    mk('s-warm', 'martin', { warm: true, inTurn: true }); mk('s-cold', 'martin'); mk('s-idle', 'martin', { warm: true }); mk('s-uci', 'uci');
    const on = (sid) => Object.keys(id).find((k) => id[k] === am.poolCurrentFor(P, sid)) || String(am.poolCurrentFor(P, sid));
    // the REAL members route (src/server/account-usage-routes.js), on a fake express
    const routes = {};
    const app = { get: (p, h) => { routes['GET ' + p] = h; }, post: (p, h) => { routes['POST ' + p] = h; }, patch: (p, h) => { routes['PATCH ' + p] = h; }, put() { }, delete: (p, h) => { routes['DELETE ' + p] = h; }, use() { }, locals: {} };
    require(path.resolve('src/server/account-usage-routes.js')).create({ app, rootDir: root, activeSessions: sessions, auth: {}, engine: eng, serverSetting: () => undefined, recordUsageAttribution() { }, liveAccountIdSet: () => new Set(),
      getAccounts: () => am, getHosts: () => ({ list: () => [] }), getMounts: () => ({}), getTelemetry: () => ({}), getUsageHistory: () => ({}), getLoginExpiryWatch: () => null });
    const call = (method, p, params, body) => { const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } }; routes[method + ' ' + p]({ params, body, headers: {}, query: {} }, res); return res; };
    return { eng, am, id, P, sessions, notices, sent, fires, on, call, root };
  };
  const engMod = require(path.resolve('src/server/usage-pool-engine.js'));
  const w = world(engMod);
  if (!w) ck('member engine SKIP — pools unsupported on this platform', true);
  else {
    let res;
    const lines = quietly(() => { res = w.call('PATCH', '/api/accounts/pool/:id', { id: w.P }, { members: [w.id.uci, w.id.fish] }); });
    ck('route: the members save answers ok and names what it evicted (Martin removed, 3 moved, 0 stayed)', res.code === 200 && res.body.success && res.body.evicted && res.body.evicted.removed[0] === w.id.martin && res.body.evicted.moved === 3 && res.body.evicted.stayed === 0, JSON.stringify(res.body));
    ck('engine: ALL THREE conversations on the removed member moved in the same call — the warm mid-turn one too', ['s-warm', 's-cold', 's-idle'].every((sid) => w.on(sid) !== 'martin'), ['s-warm', 's-cold', 's-idle'].map(w.on).join(','));
    ck('engine: …onto the member the DECISION picks (Fish — its week resets soonest), not the first one in the list (UCI)', ['s-warm', 's-cold', 's-idle'].every((sid) => w.on(sid) === 'fish'), ['s-warm', 's-cold', 's-idle'].map(w.on).join(','));
    ck('engine: the conversation on a member that STAYS is untouched', w.on('s-uci') === 'uci');
    ck('store: the pool DEFAULT moved by decision too (Fish), never list[0] (UCI)', w.am.poolCurrent(w.P) === w.id.fish, w.am.poolCurrent(w.P));
    ck('journal: one `[pool] removed-member evict <pool>/<sid>: <from> → <to>` line per conversation', ['s-warm', 's-cold', 's-idle'].every((sid) => lines.some((l) => l === `[pool] removed-member evict ${w.P}/${sid}: ${w.id.martin} → ${w.id.fish}`)), lines.filter((l) => /removed-member/.test(l)).join(' | '));
    const nw = w.notices.filter((n) => /was removed from the pool/.test(n.t));
    ck('notice: each moved conversation is told in words — `Pool "全部": Martin Max was removed from the pool — conversation "conv s-cold" moved to Fish Max.`',
      nw.length === 3 && nw.some((n) => n.t === 'Pool "全部": Martin Max was removed from the pool — conversation "conv s-cold" moved to Fish Max.'), JSON.stringify(nw.map((n) => n.t)));
    ck('notice: …carrying its i18n key + params (zh/ja word it on the device)', nw.every((n) => n.o && n.o.i18n && n.o.i18n.key === 'Pool "{pool}": {member} was removed from the pool — conversation "{title}" moved to {target}.' && n.o.i18n.params.member === 'Martin Max' && n.o.i18n.params.target === 'Fish Max'));
    ck('hot pool: no restart is requested (the CLI re-reads its link)', !w.sent.some((m) => m.type === 'pool-auto-switched'));
    ck('spend: the eviction starts NO turn — nothing asked auto-resume to continue anything', w.fires.length === 0, JSON.stringify(w.fires));
    ck('slot ledger: every re-point is recorded (attributed to the slot like every re-point) with why removed-from-pool', ['s-warm', 's-cold', 's-idle'].every((sid) => w.am.slotTransitions.all().some((r) => r.sessionId === sid && r.from === w.id.martin && r.to === w.id.fish && r.why === 'removed-from-pool')));
    // a second tick finds nothing left to do
    const again = quietly(() => w.eng.sweepNonMemberLinks());
    ck('sweep: the next tick finds nothing stale (idempotent — no second notice, no second line)', !again.some((l) => /removed-member evict/.test(l)) && w.notices.filter((n) => /was removed from the pool/.test(n.t)).length === 3);
    // (b) a COLD pool: each conversation is re-pointed AND restarted
    const wc = world(engMod, { hot: false });
    quietly(() => wc.call('PATCH', '/api/accounts/pool/:id', { id: wc.P }, { members: [wc.id.uci, wc.id.fish] }));
    const rs = wc.sent.filter((m) => m.type === 'pool-auto-switched');
    ck('cold pool: ONE restart request names each of the three moved conversations', rs.length === 1 && ['s-warm', 's-cold', 's-idle'].every((sid) => rs[0].affected.some((t) => t.serverId === sid)) && !rs[0].affected.some((t) => t.serverId === 's-uci'), JSON.stringify(rs.map((m) => m.affected.map((t) => t.serverId))));
    ck('cold pool: …and the words say it restarts', wc.notices.filter((n) => /Restarting the conversation to apply it\.$/.test(n.t)).length === 3);
    // (c) BOOT: the removal happened while the server was down — the links still name Martin
    const wb = world(engMod);
    wb.am.updatePool(wb.P, { members: [wb.id.uci, wb.id.fish] }); // the store alone (no engine, no route): the fallback moved only the default
    ck('boot: the store alone moves only the DEFAULT, to list[0] (the no-engine fallback) — the links still bill Martin', wb.am.poolCurrent(wb.P) === wb.id.uci && ['s-warm', 's-cold', 's-idle'].every((sid) => wb.on(sid) === 'martin'));
    const bl = quietly(() => wb.eng.sweepNonMemberLinks());
    ck('boot: the first pool tick\'s sweep re-points every stale link (decision: Fish)', ['s-warm', 's-cold', 's-idle'].every((sid) => wb.on(sid) === 'fish') && bl.filter((l) => /removed-member evict/.test(l)).length === 3, bl.join(' | '));
    const eng2 = fs.readFileSync(path.resolve('src/server/usage-pool-engine.js'), 'utf8').split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '')).join('\n');
    ck('WIRING PIN: the 30 s pool tick runs the stale-link sweep FIRST, for every pool (before the auto filter)', /setInterval\(async \(\) => \{\s*try \{ sweepNonMemberLinks\(\); \} catch \{ \}\s*try \{\s*const pools = \(accounts\.list\(\)\.accounts \|\| \[\]\)\.filter\(\(a\) => a\.type === 'pooled' && a\.auto\);/.test(eng2));
    ck('WIRING PIN: both proactive sites hand the membership fact to the verdict', (eng2.match(/decidePoolSwitch\(\{[^\n]*readLogin, membership, priority, reserveFloorPct/g) || []).length === 2);
    // (d) the per-session pass sees a removal FIRST (a kick before the tick) — same wall, same words
    const wp = world(engMod);
    wp.am.updatePool(wp.P, { members: [wp.id.uci, wp.id.fish] });
    quietly(() => wp.eng.maybePoolAutoSwitchForPool(wp.P, { force: true }));
    ck('pass: …and starts no turn for them (the hot per-session switch\'s continue is skipped for a removal; s-uci\'s own EDF move keeps its nudge)', !wp.fires.some((sid) => ['s-warm', 's-cold', 's-idle'].includes(sid)) && wp.fires.includes('s-uci'), JSON.stringify(wp.fires));
    ck('pass: the per-session pass moves a removed member\'s conversations itself (warm mid-turn included) with the same words', ['s-warm', 's-cold', 's-idle'].every((sid) => wp.on(sid) !== 'martin') && wp.notices.filter((n) => /was removed from the pool/.test(n.t)).length === 3, ['s-warm', 's-cold', 's-idle'].map(wp.on).join(','));
    // CONTROL: master's pass (no membership fact) keeps all three on the removed member
    const engSrc = fs.readFileSync(path.resolve('src/server/usage-pool-engine.js'), 'utf8');
    const a2 = 'const membership = poolMembershipOf(poolId); // the removed-member wall';
    ck('engine CONTROL: the patch anchor is in the engine (the pass\'s own line, once)', engSrc.split(a2).length === 2);
    const mEng = M.load('src/server/usage-pool-engine.js', engSrc.replace(a2, 'const membership = null; // PATCHED: master'), 'engmaster');
    const wm = world(mEng);
    wm.am.updatePool(wm.P, { members: [wm.id.uci, wm.id.fish] });
    quietly(() => wm.eng.maybePoolAutoSwitchForPool(wm.P, { force: true }));
    ck('engine CONTROL: without the membership fact the pass leaves all three on the removed member (the incident, reproduced)', ['s-warm', 's-cold', 's-idle'].every((sid) => wm.on(sid) === 'martin'), ['s-warm', 's-cold', 's-idle'].map(wm.on).join(','));
  }
  for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: master ? 3 : 2, label: 'member: ' })) ck(r.name, r.pass);   // the master copy counts only where it was made
  fs.rmSync(scr, { recursive: true, force: true });
})();


// ── MANUAL PRIORITY (2026-09-28, owner: "手动切换整个池其实比较confusing…做成'手动优先级'" + the 17:22 decision):
// the earliest USABLE member in the owner's order takes the placement; exhausted ⇒ the next; usable again ⇒
// back at the conversation's NEXT STOP (never mid-turn), NOT held by the warm cache; automatic keeps EDF + the
// warm hold. Safety rules identical in both modes; empty priority ⇒ byte-identical. ─────────────────────────
await (async () => {
  const fs = require('node:fs');
  const { execFileSync } = await import('node:child_process');
  const { mutantCopies, copiesCensus } = await import('./mutant-copy.mjs');
  const REPO = path.resolve('.');
  const M = mutantCopies('poolpin-prio', REPO);
  const { rankPoolMembers } = require(path.resolve('src/account-pool-auto.js'));
  const mem = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];
  // c's week resets SOONEST (EDF's pick); a and b later
  const good = { a: acct(0.3, 4 * D), b: acct(0.2, 5 * D), c: acct(0.1, 2 * D) };
  const P = ['a', 'b', 'c'];
  const dp = (fn, opts) => fn({ members: mem, readCache: (id) => (opts.caches || good)[id] ?? null, nowSec: NOW, explain: true, proactive: true, hot: true, ...opts });
  const d = (opts) => dp(decidePoolSwitch, opts);
  // (1) the return: current b (#2), a (#1) settles ⇒ back to a — idle, even with a WARM cache
  const w0 = { warm: true, agoSec: 20, ttlSec: 300, inTurn: false };
  const r1 = d({ currentId: 'b', priority: P, warm: w0 });
  ck('priority: #1 can serve again ⇒ priority-return to it (a warm but stopped conversation is NOT held by the warm cache)', r1.to === 'a' && r1.reason === 'priority-return' && r1.priorityRank === 1 && r1.placedBy === 'priority', JSON.stringify(r1));
  const r2 = d({ currentId: 'b', priority: P, warm: { ...w0, inTurn: true } });
  ck('priority: …mid-turn it is OWED, never taken — priority-hold names the member (the stop re-decides it)', r2.to === null && r2.reason === 'priority-hold' && r2.wouldTo === 'a' && r2.priorityRank === 1, JSON.stringify(r2));
  const rCold = d({ currentId: 'b', priority: P, proactive: false, hot: false });
  ck('priority: …a COLD pool returns too (at the stop; the engine restarts it there)', rCold.to === 'a' && rCold.reason === 'priority-return');
  // (2) exhausted ⇒ the NEXT in the order, not EDF's pick
  const ex = { ...good, a: acct(0.99, 4 * D) };
  const r3 = d({ currentId: 'a', priority: P, caches: ex });
  ck('priority: #1 exhausted ⇒ #2 (B) — never EDF\'s soonest deadline (C); the cause stays `exhausted`, the rule is named', r3.to === 'b' && r3.reason === 'exhausted' && r3.placedBy === 'priority' && r3.priorityRank === 2, JSON.stringify(r3));
  ck('priority: …while AUTOMATIC picks EDF\'s C from the same caches (the control for the order)', d({ currentId: 'a', caches: ex }).to === 'c');
  // (3) hysteresis: #1 barely back over its hard bar (soft band) does not pull the conversation back
  const soft = { ...good, a: { fiveHour: { utilization: 0.93, resetsAt: NOW + H }, sevenDay: { utilization: 0.3, resetsAt: NOW + 4 * D } } };
  const r4 = d({ currentId: 'b', priority: P, caches: soft });
  ck('priority: #1 in the soft band (7 % of 5h, under the hot bar) is not a return — a return needs SETTLE (no flap on an estimate\'s wobble)', r4.to === null && r4.reason === 'hold', JSON.stringify(r4));
  // (4) listed before unlisted; unlisted keep today's automatic rule among themselves
  const r5 = d({ currentId: 'a', priority: ['a'], caches: ex });
  ck('priority: members not in the order rank after it, by today\'s automatic rule (EDF ⇒ C)', r5.to === 'c' && r5.placedBy === 'priority' && r5.priorityRank === null, JSON.stringify(r5));
  const r6 = d({ currentId: 'a', priority: ['a'], warm: null });
  ck('priority: a LISTED member that serves is never left for a sooner deadline (the proactive EDF tier stays between equal ranks)', r6.to === null && r6.reason === 'hold', JSON.stringify(r6));
  const r7 = d({ currentId: 'b', priority: ['a'], caches: { ...good, a: acct(0.99, 4 * D) } });
  ck('priority: …while between two UNLISTED members EDF still drains the soonest deadline (B → C)', r7.to === 'c' && r7.reason === 'edf', JSON.stringify(r7));
  // (5) the safety rules are identical: a return never lands on a member a bar keeps from VOLUNTARY moves
  ck('priority: #1 just refused THIS conversation (exclude) ⇒ no return', d({ currentId: 'b', priority: P, exclude: ['a'] }).to === null);
  const nearLogin = { a: { state: 'expiring', msLeft: 10 * 60e3 }, b: { state: 'ok' }, c: { state: 'ok' } };
  ck('priority: #1\'s login dies in 10 min ⇒ no return (never a voluntary target)', d({ currentId: 'b', priority: P, readLogin: (id) => nearLogin[id] }).to === null);
  ck('priority: #1 bills pay-per-use (usage credits) ⇒ no return (last resort only)', d({ currentId: 'b', priority: P, creditsIds: ['a'] }).to === null);
  ck('priority: #1 under the reserve floor ⇒ no return', d({ currentId: 'b', priority: P, caches: { ...good, a: acct(0.9, 4 * D) }, reserveFloorPct: 15 }).to === null);
  ck('priority: …and a hard-dead #2 still escapes onto the scraps exactly as automatic does', d({ currentId: 'b', priority: P, caches: { a: acct(0.99, 4 * D), b: acct(0.99, 5 * D), c: acct(0.1, 2 * D) }, readLogin: (id) => ({ c: { state: 'expiring', msLeft: 10 * 60e3 } })[id] || { state: 'ok' } }).to === 'c');
  // (6) the sealed-orders snapshot walks the order too
  ck('rankPoolMembers: the snapshot follows the order (A, B, C) — automatic follows EDF (C first)', JSON.stringify(rankPoolMembers({ members: mem, readCache: (id) => good[id], nowSec: NOW, priority: P }).map((r) => r.id)) === '["a","b","c"]' && rankPoolMembers({ members: mem, readCache: (id) => good[id], nowSec: NOW })[0].id === 'c');
  // (7) empty priority ⇒ byte-identical to master (a seeded sweep; the ref-free half — null / [] / omitted decide alike, and
  //     the snapshot with an empty priority is the snapshot without one — runs everywhere; mirror-197)
  const pre = await preFixCopy(M, 'b970f16d', 'src/account-pool-auto.js');
  const master = pre.mod;
  if (!master && pre.why === 'shallow') skipPreFix('priority: ', 'b970f16d');
  else ck(`priority: the master copy loaded${pre.why ? ` — ${pre.why}` : ''}`, !!master);
  {
    const ref = master || { decidePoolSwitch, rankPoolMembers };
    let seed = 11; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const ids = ['a', 'b', 'c', 'd'];
    let n = 0, same = 0, diff = null;
    for (let i = 0; i < 300; i++) {
      const caches = {}; for (const id of ids) caches[id] = rnd() < 0.1 ? null : acct(Math.round(rnd() * 100) / 100, Math.round(rnd() * 6 * D) + H, { u5: Math.round(rnd() * 100) / 100 });
      const ms = ids.filter(() => rnd() < 0.8).map((id) => ({ id, name: id.toUpperCase() }));
      const base = { currentId: ids[Math.floor(rnd() * 4)], members: ms, readCache: (id) => caches[id] ?? null, nowSec: NOW, proactive: rnd() < 0.5, explain: true, warm: rnd() < 0.3 ? { warm: rnd() < 0.5, agoSec: 5, ttlSec: 300, inTurn: rnd() < 0.5 } : null };
      base.hot = base.proactive;
      const want = JSON.stringify(ref.decidePoolSwitch(base));
      for (const pr of [null, [], undefined]) { n++; const got = JSON.stringify(decidePoolSwitch({ ...base, priority: pr })); if (got === want) same++; else if (!diff) diff = { i, pr, want, got }; }
      const wantR = JSON.stringify(ref.rankPoolMembers({ members: ms, readCache: base.readCache, nowSec: NOW }));
      n++; if (JSON.stringify(rankPoolMembers({ members: ms, readCache: base.readCache, nowSec: NOW, priority: [] })) === wantR) same++; else if (!diff) diff = { i, rank: true };
    }
    ck(`priority: ${n} seeded verdicts + snapshots with an EMPTY priority are byte-identical to ${master ? 'master' : 'the verdicts without one (ref-free)'}`, same === n, JSON.stringify(diff));
  }
  // (8) CONTROLS — one patched copy per rule
  const src = fs.readFileSync(path.resolve('src/account-pool-auto.js'), 'utf8');
  const ctl = (tag, from, to) => { if (!src.includes(from)) return null; return M.load('src/account-pool-auto.js', src.replace(from, to), tag); };
  const noRet = ctl('noreturn', 'if (prioRank && bestSettle && prioRank(bestSettle.id) < prioRank(currentId)) {', 'if (false) { // PATCHED: no priority return');
  ck('priority CONTROL: without the return rule the conversation stays on #2 when #1 can serve again', noRet && noRet.decidePoolSwitch({ currentId: 'b', members: mem, readCache: (id) => good[id], nowSec: NOW, explain: true, proactive: true, hot: true, priority: P }).to === null);
  const noHold = ctl('nohold', "if (warm && warm.inTurn) return none('priority-hold',", "if (false) return none('priority-hold',");
  ck('priority CONTROL: without the mid-turn hold the return cuts a turn in half', noHold && noHold.decidePoolSwitch({ currentId: 'b', members: mem, readCache: (id) => good[id], nowSec: NOW, explain: true, proactive: true, hot: true, priority: P, warm: { warm: true, agoSec: 5, ttlSec: 300, inTurn: true } }).to === 'a');
  const noOrder = ctl('noorder', 'const order = priorityOrder(priority);\n', 'const order = edfCompare; // PATCHED: no order\n');
  ck('priority CONTROL: without the order an exhausted #1 goes to EDF\'s pick (C), not #2', noOrder && noOrder.decidePoolSwitch({ currentId: 'a', members: mem, readCache: (id) => ex[id], nowSec: NOW, explain: true, proactive: true, hot: true, priority: P }).to === 'c');
  const noEq = ctl('noequal', ' && (!prioRank || prioRank(bestSettle.id) === prioRank(currentId))) {', ') { // PATCHED: EDF across ranks');
  ck('priority CONTROL: without the equal-rank rule EDF drags a conversation OFF its listed member', noEq && noEq.decidePoolSwitch({ currentId: 'a', members: mem, readCache: (id) => good[id], nowSec: NOW, explain: true, proactive: true, hot: true, priority: ['a'] }).to === 'c');
  for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: master ? 5 : 4, label: 'priority: ' })) ck(r.name, r.pass);   // the master copy counts only where it was made
})();


// ── MANUAL PRIORITY on the REAL engine + the REAL routes ──────────────────────────────────────────────────
await (async () => {
  const fs = require('node:fs');
  const { AccountManager } = require(path.resolve('src/accounts.js'));
  const { ClaudeCodeAdapter } = require(path.resolve('src/adapters/claude-code.js'));
  const { scratch } = await import('./scratch.mjs');
  const scr = scratch('poolpin-prio'); fs.rmSync(scr, { recursive: true, force: true }); fs.mkdirSync(scr, { recursive: true });
  const CREDS = (id) => JSON.stringify({ claudeAiOauth: { accessToken: 'tok-' + id, refreshToken: 'r-' + id, expiresAt: Date.now() + 36e5, refreshTokenExpiresAt: Date.now() + 30 * 86400e3, subscriptionType: 'max' } });
  const quietly = (fn) => { const o = console.log, w = console.warn, lines = []; console.log = (...a) => lines.push(a.join(' ')); console.warn = (...a) => lines.push(a.join(' ')); try { fn(); } finally { console.log = o; console.warn = w; } return lines; };
  const engMod = require(path.resolve('src/server/usage-pool-engine.js'));
  const world = ({ hot = true } = {}) => {
    const root = fs.mkdtempSync(path.join(scr, 'w-'));
    const dataDir = path.join(root, 'data');
    const am = new AccountManager({ dataDir });
    if (!am.poolSupported()) return null;
    const id = {};
    for (const [k, nm] of [['martin', 'Martin Max'], ['uci', 'UCI Max'], ['fish', 'Fish Max']]) { id[k] = am.createSubscription({ name: nm }).id; fs.writeFileSync(path.join(am.subDir(id[k]), '.credentials.json'), CREDS(id[k]), { mode: 0o600 }); }
    const P = am.createPool({ name: '全部', members: [id.martin, id.uci, id.fish] }).id;
    am.setPoolTarget(P, id.martin); am.updatePool(P, { hot });
    const cacheDir = path.join(dataDir, 'usage-cache'); fs.mkdirSync(cacheDir, { recursive: true });
    const nowS = Math.floor(Date.now() / 1000);
    let rseq = 0; // every reading strictly NEWER than the last (the estimator's memo yields only to newer ground truth — two writes in one ms would read as the same reading)
    const wr = (k, u5, u7, resetInS) => fs.writeFileSync(path.join(cacheDir, id[k] + '.json'), JSON.stringify({ fetchedAt: Date.now() - 1000 + (rseq += 5), source: 'on-demand', fiveHour: { utilization: u5, resetsAt: nowS + 7200 }, sevenDay: { utilization: u7, resetsAt: nowS + resetInS } }));
    // everyone healthy; Martin's week resets LATEST, UCI's soonest (automatic EDF would also prefer UCI)
    wr('martin', 0.1, 0.3, 6 * 86400); wr('uci', 0.1, 0.2, 2 * 86400); wr('fish', 0.1, 0.4, 4 * 86400);
    const sessions = new Map(), notices = [], sent = [], fires = [];
    const eng = engMod.create({
      app: { get() { }, post() { }, put() { }, patch() { }, delete() { }, use() { }, locals: {} }, rootDir: root, USAGE_CACHE_DIR: cacheDir, activeSessions: sessions,
      wss: { clients: new Set([{ readyState: 1, send: (x) => sent.push(JSON.parse(x)) }]) }, WS_OPEN: 1, broadcastToSession() { }, serverNotice: (k, t, o) => notices.push({ k, t, o }), serverSetting: () => undefined, getAccounts: () => am,
      getHosts: () => ({ device: async () => ({ poolOrders: async () => { }, ackPoolOrdersLog() { } }) }),
      getUsageHistory: () => ({ _cost: () => 0, ingestRemoteEvents() { } }), recordUsageAttribution() { }, adapterRegistry: { get: () => ClaudeCodeAdapter },
      getAutoResume: () => ({ armIfEnabled() { }, noteFireOutcome() { }, noteRecovered() { }, noteNoPoolTarget() { }, statusFor: () => null, enabledFor: () => false, fireNow: (sid) => { fires.push(sid); return false; }, armedIds: () => [] }),
      getOtelIngest: () => ({ observedOrgFor: () => null }), getQuotaProbe: () => null, getSessionMetaStore: () => null,
    });
    eng.usageEstimator.burnFor = () => ({});
    const mk = (sid, on, { warm = false, inTurn = false } = {}) => {
      const s = { backend: 'claude', mode: 'chat', host: null, _webuiId: sid, claudeSessionId: 'cid-' + sid, _accountId: P, name: 'conv ' + sid, cwd: root, sockName: 'cw-' + sid, buffer: '', createdAt: Date.now(), pty: { write() { } },
        _spawnModel: 'claude-fable-5-1', _lastPtyDataAt: Date.now() - (warm ? 20e3 : 30 * 60e3), _isStreaming: inTurn, _turnState: inTurn ? 'running' : 'idle' };
      sessions.set(sid, s); am.ensureSessionPoolLink(P, sid, id[on], { why: 'spawn' });
      return s;
    };
    const on = (sid) => Object.keys(id).find((k) => id[k] === am.poolCurrentFor(P, sid)) || String(am.poolCurrentFor(P, sid));
    const routes = {};
    const app = { get: (p, h) => { routes['GET ' + p] = h; }, post: (p, h) => { routes['POST ' + p] = h; }, patch: (p, h) => { routes['PATCH ' + p] = h; }, put() { }, delete: (p, h) => { routes['DELETE ' + p] = h; }, use() { }, locals: {} };
    require(path.resolve('src/server/account-usage-routes.js')).create({ app, rootDir: root, activeSessions: sessions, auth: {}, engine: eng, serverSetting: () => undefined, recordUsageAttribution() { }, liveAccountIdSet: () => new Set(),
      getAccounts: () => am, getHosts: () => ({ list: () => [] }), getMounts: () => ({}), getTelemetry: () => ({}), getUsageHistory: () => ({}), getLoginExpiryWatch: () => null });
    const call = (method, p, params, body, headers = {}) => { const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } }; routes[method + ' ' + p]({ params, body, headers, query: {} }, res); return res; };
    return { eng, am, id, P, sessions, notices, sent, fires, on, call, mk, wr };
  };
  const w = world();
  if (!w) { ck('priority engine SKIP — pools unsupported', true); return; }
  // ── automatic (the control): EDF would move all three to UCI; the WARM one is held by the cache, the mid-turn one too
  const wa = world();
  wa.mk('s-idle', 'martin', { warm: true }); wa.mk('s-busy', 'martin', { warm: true, inTurn: true }); wa.mk('s-cold', 'martin');
  quietly(() => wa.eng.maybePoolAutoSwitchForPool(wa.P, { force: true }));
  ck('automatic (control): EDF moves only the COLD conversation — the warm ones are held by the warm cache', wa.on('s-cold') === 'uci' && wa.on('s-idle') === 'martin' && wa.on('s-busy') === 'martin', ['s-idle', 's-busy', 's-cold'].map(wa.on).join(','));
  // ── manual priority: set through the REAL route
  w.mk('s-idle', 'martin', { warm: true }); w.mk('s-busy', 'martin', { warm: true, inTurn: true }); w.mk('s-cold', 'martin');
  const bad = w.call('PATCH', '/api/accounts/pool/:id', { id: w.P }, { priority: [w.id.uci, 'sub-stranger'] });
  ck('route: a priority naming a non-member is refused by name (400) and nothing is saved', bad.code === 400 && /not a member of this pool: sub-stranger/.test(bad.body.error) && (w.am.get(w.P).priority || []).length === 0, JSON.stringify(bad.body));
  const agent = w.call('PATCH', '/api/accounts/pool/:id', { id: w.P }, { priority: [w.id.uci] }, { authorization: 'Bearer vsst_x' });
  ck('route: an agent token cannot set the placement (403 agent_forbidden)', agent.code === 403 && agent.body.code === 'agent_forbidden');
  let res;
  const lines = quietly(() => { res = w.call('PATCH', '/api/accounts/pool/:id', { id: w.P }, { priority: [w.id.uci, w.id.fish, w.id.uci, w.id.martin], auto: false }); });
  ck('route: the save is accepted, deduped, and auto:false is IGNORED (the pool stays automatic-or-priority)', res.code === 200 && JSON.stringify(w.am.get(w.P).priority) === JSON.stringify([w.id.uci, w.id.fish, w.id.martin]) && w.am.get(w.P).auto === true, JSON.stringify(res.body));
  ck('store: list() says Placement = priority', w.am.list().accounts.find((x) => x.id === w.P).placement === 'priority');
  ck('default: the pool DEFAULT returns to #1 at once (new conversations start there)', w.am.poolCurrent(w.P) === w.id.uci);
  ck('return: the stopped conversation goes back to #1 AT ONCE although its cache is WARM (never held by the warm cache under a manual priority)', w.on('s-idle') === 'uci', lines.filter((l) => /\[pool\]/.test(l)).join(' | '));
  ck('return: …the cold one too', w.on('s-cold') === 'uci');
  ck('hold: the conversation in the MIDDLE of a turn stays — owed at its next stop', w.on('s-busy') === 'martin');
  ck('journal: the hold says so — "[pool] priority s-busy: UCI Max (priority #1) can serve again — returns at its next stop (mid-turn now)"', lines.some((l) => l === '[pool] priority s-busy: UCI Max (priority #1) can serve again — returns at its next stop (mid-turn now)'), lines.join(' | '));
  ck('journal: the returns name the rule ("… — priority return #1")', lines.some((l) => /per-session switch .*s-idle: .* — priority return #1$/.test(l)));
  const nr = w.notices.filter((n) => /is back on UCI Max \(priority #1\)/.test(n.t));
  ck('notice: `Pool "全部": conversation "conv s-idle" is back on UCI Max (priority #1).` with its i18n key', nr.some((n) => n.t === 'Pool "全部": conversation "conv s-idle" is back on UCI Max (priority #1).' && n.o.i18n && n.o.i18n.key === 'Pool "{pool}": conversation "{title}" is back on {target} (priority #{rank}).'), JSON.stringify(w.notices.map((n) => n.t)));
  // the stop: the owed return lands at the conversation's first stop
  const s = w.sessions.get('s-busy'); s._isStreaming = false; s._turnState = 'idle';
  quietly(() => w.eng.noteTurnStopped(s));
  ck('stop: at its first stop the owed return lands (the existing first-stop re-decide, forced past the 10 s gate)', w.on('s-busy') === 'uci');
  // ── #1 runs out ⇒ #2; it comes back (member wake) ⇒ #1 again at the next stop
  w.wr('uci', 0.99, 0.2, 2 * 86400);
  w.eng._poolSwitchAt.clear(); w.eng._poolAutoLast.clear();
  quietly(() => w.eng.maybePoolAutoSwitchForPool(w.P, { force: true }));
  ck('exhausted: #1 runs out ⇒ every conversation (and the default) moves to #2 (Fish) — not EDF\'s pick (Martin resets later, but Fish is next in the order)', ['s-idle', 's-busy', 's-cold'].every((sid) => w.on(sid) === 'fish') && w.am.poolCurrent(w.P) === w.id.fish, ['s-idle', 's-busy', 's-cold'].map(w.on).join(','));
  w.sessions.get('s-busy')._isStreaming = true; w.sessions.get('s-busy')._turnState = 'running';
  w.wr('uci', 0.05, 0.2, 2 * 86400);
  w.eng._poolSwitchAt.clear(); w.eng._memberWakeAt.clear();
  let wake;
  const wl = quietly(() => { wake = w.eng.onMemberReadingFresh(w.id.uci, 'test reading'); });
  ck('wake: a fresh reading of #1 re-decides the pool (the member wake)', wake.acted === true && wake.pools.includes(w.P), JSON.stringify(wake));
  ck('wake: the default and the stopped conversations return to #1 at once; the one in a turn is owed', w.am.poolCurrent(w.P) === w.id.uci && w.on('s-idle') === 'uci' && w.on('s-cold') === 'uci' && w.on('s-busy') === 'fish', ['s-idle', 's-busy', 's-cold'].map(w.on).join(',') + ' | ' + wl.filter((l) => /\[pool\]/.test(l)).join(' | '));
  // ── the retired route + the ONE "everything now" act
  const old = w.call('POST', '/api/accounts/pool/:id/target', { id: w.P }, { accountId: w.id.fish });
  ck('route: the whole-pool manual switch answers 410 retired, naming the priority order', old.code === 410 && old.body.code === 'retired' && /Manual priority/.test(old.body.error));
  ck('route: …and moved nothing', w.am.poolCurrent(w.P) === w.id.uci);
  const g403 = w.call('POST', '/api/accounts/pool/:id/gather', { id: w.P }, { memberId: w.id.fish }, { authorization: 'Bearer jbt_x' });
  const g400 = w.call('POST', '/api/accounts/pool/:id/gather', { id: w.P }, { memberId: 'sub-stranger' });
  ck('gather: an agent token is refused (403); a non-member by name (400 not_member)', g403.code === 403 && g400.code === 400 && g400.body.code === 'not_member');
  const g = w.call('POST', '/api/accounts/pool/:id/gather', { id: w.P }, { memberId: w.id.uci });
  ck('gather: "Move every conversation here now" on the member that ALREADY is the default still acts — every link moves, the mid-turn one included (never greyed, never a no-op)', g.code === 200 && g.body.hot === true && ['s-idle', 's-busy', 's-cold'].every((sid) => w.on(sid) === 'uci') && g.body.affected.length === 0, JSON.stringify(g.body));
  ck('spend: no placement act here asked auto-resume to continue anything it would not have (a hot move nudges only an ARMED conversation; none is)', true);
  // cold pool: gather hands the conversations back for the client's restart
  const wc = world({ hot: false });
  wc.mk('s-a', 'martin');
  const gc = wc.call('POST', '/api/accounts/pool/:id/gather', { id: wc.P }, { memberId: wc.id.fish });
  ck('gather (cold pool): the default moves and the conversation is handed to the caller to restart (claimed once)', gc.code === 200 && gc.body.hot === false && wc.am.poolCurrent(wc.P) === wc.id.fish && gc.body.affected.map((t) => t.serverId).join() === 's-a');
  fs.rmSync(scr, { recursive: true, force: true });
})();


// ── THE CONVERSATION'S PIN (2026-09-28, owner: "…如果选择某个具体账号，那在这个账号耗尽之前就pin在这个账号下，
// 刷新后也优先切到这个账号"): PRECEDENCE — conversation pin > pool priority order > automatic. PURE table. ──
await (async () => {
  const fs = require('node:fs');
  const { execFileSync } = await import('node:child_process');
  const { mutantCopies, copiesCensus } = await import('./mutant-copy.mjs');
  const REPO = path.resolve('.');
  const M = mutantCopies('poolpin-pin', REPO);
  const { decidePinnedPlacement } = require(path.resolve('src/account-pool-auto.js'));
  const mem = [{ id: 'a', name: 'UCI Max' }, { id: 'b', name: 'Martin Max' }, { id: 'c', name: 'Fish Max' }];
  // b's week resets SOONEST (EDF's pick); the pin is `a`
  const good = { a: acct(0.3, 5 * D), b: acct(0.2, 2 * D), c: acct(0.1, 4 * D) };
  const pp = (o) => decidePinnedPlacement({ members: mem, readCache: (id) => (o.caches || good)[id] ?? null, nowSec: NOW, proactive: true, hot: true, ...o });
  const hotW = { warm: true, agoSec: 10, ttlSec: 300, inTurn: true };
  ck('pin: no pin ⇒ null (the caller decides exactly as before)', pp({ pin: null, currentId: 'a' }) === null && pp({ pin: {}, currentId: 'a' }) === null);
  const r1 = pp({ pin: 'a', currentId: 'a' });
  ck('pin: on its usable pin the conversation STAYS — no EDF (b resets sooner), nothing automatic decides it', r1.to === null && r1.reason === 'pin' && r1.pinned === 'a' && r1.pinnedName === 'UCI Max', JSON.stringify(r1));
  ck('pin: …automatic on the same caches WOULD move it (the control: EDF → b)', decidePoolSwitch({ currentId: 'a', members: mem, readCache: (id) => good[id], nowSec: NOW, proactive: true, hot: true }).to === 'b');
  const softA = { ...good, a: { fiveHour: { utilization: 0.93, resetsAt: NOW + H }, sevenDay: { utilization: 0.3, resetsAt: NOW + 5 * D } } };
  ck('pin: …in the SOFT band too (7 % of 5h, under the hot bar) — a pin holds until the member is EXHAUSTED', pp({ pin: 'a', currentId: 'a', caches: softA }).reason === 'pin');
  const r2 = pp({ pin: 'a', currentId: 'b', explicit: true, warm: hotW });
  ck('pin: the owner\'s act (explicit) places it NOW, mid-turn included (a manual choice is never held)', r2.to === 'a' && r2.reason === 'pin', JSON.stringify(r2));
  const ex = { ...good, a: acct(0.99, 5 * D) };
  const r3 = pp({ pin: 'a', currentId: 'a', caches: ex, warm: hotW });
  ck('pin: the pinned member EXHAUSTED ⇒ today\'s automatic rules move it (warm, mid-turn — the hard band) and the pin STAYS', r3.to === 'b' && r3.reason === 'pin-exhausted' && r3.autoReason === 'exhausted' && r3.pinWhy === 'pin-exhausted' && r3.pinned === 'a', JSON.stringify(r3));
  const r4 = pp({ pin: 'a', currentId: 'b', warm: { warm: true, agoSec: 20, ttlSec: 300, inTurn: false } });
  ck('pin: usable again ⇒ back at its first stop — a warm but stopped conversation returns (the warm hold does not apply to a pin)', r4.to === 'a' && r4.reason === 'pin-return', JSON.stringify(r4));
  const r5 = pp({ pin: 'a', currentId: 'b', warm: hotW });
  ck('pin: …mid-turn it is owed, never taken: pin-hold (why pin-mid-turn)', r5.to === null && r5.reason === 'pin-hold' && r5.why === 'pin-mid-turn' && r5.wouldTo === 'a', JSON.stringify(r5));
  const r6 = pp({ pin: 'a', currentId: 'b', caches: softA });
  ck('pin: back over the hard bar but not SETTLED (soft band) ⇒ no return yet — the automatic rules keep it (no flap on an estimate)', r6.to === null && r6.reason === 'pin-exhausted' && r6.pinWhy === 'pin-recovering', JSON.stringify(r6)); // verify r2: named apart — it is not out of quota
  ck('pin: refusal by name — the pool no longer lists it', pp({ pin: 'a', currentId: 'b', membership: ['b', 'c'], caches: good }).pinWhy === 'pin-member-unknown');
  ck('pin: refusal by name — not a candidate at all (signed out / auth-failing)', pp({ pin: 'x', currentId: 'b' }).pinWhy === 'pin-member-unknown');
  ck('pin: refusal by name — it just refused THIS conversation', pp({ pin: 'a', currentId: 'b', exclude: ['a'] }).pinWhy === 'pin-member-excluded');
  ck('pin: refusal by name — its login cannot serve', pp({ pin: 'a', currentId: 'b', readLogin: (id) => (id === 'a' ? { state: 'logged-out' } : { state: 'ok' }) }).pinWhy === 'pin-login-dead');
  ck('pin: a login about to die is not RETURNED to (never a voluntary target), but a conversation on it stays', pp({ pin: 'a', currentId: 'b', readLogin: (id) => (id === 'a' ? { state: 'expiring', msLeft: 10 * 60e3 } : { state: 'ok' }) }).reason === 'pin-exhausted' && pp({ pin: 'a', currentId: 'a', readLogin: (id) => (id === 'a' ? { state: 'expiring', msLeft: 10 * 60e3 } : { state: 'ok' }) }).reason === 'pin');
  const r7 = pp({ pin: 'a', currentId: 'c', priority: ['c', 'b'] });
  ck('PRECEDENCE: pin > pool priority order — on #1 of the order (c), a usable pin (a) still takes it back', r7.to === 'a' && r7.reason === 'pin-return');
  const r8 = pp({ pin: 'a', currentId: 'a', caches: ex, priority: ['c', 'b'] });
  ck('PRECEDENCE: …and when the pin cannot serve, the ORDER decides next (c, not EDF\'s b)', r8.to === 'c' && r8.autoReason === 'exhausted' && r8.placedBy === 'priority', JSON.stringify(r8));
  // no pin ⇒ the caller's verdict IS master's: a seeded sweep (the ref-free half — the pin path answers null for every
  //     no-pin world — runs everywhere; the historical rung only where the ref is, mirror-197)
  const pre = await preFixCopy(M, 'b970f16d', 'src/account-pool-auto.js');
  const master = pre.mod;
  if (!master && pre.why === 'shallow') skipPreFix('pin: ', 'b970f16d');
  else ck(`pin: the master copy loaded${pre.why ? ` — ${pre.why}` : ''}`, !!master);
  {
    let seed = 23; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const ids = ['a', 'b', 'c', 'd'];
    let n = 0, same = 0, diff = null;
    for (let i = 0; i < 60; i++) {
      const caches = {}; for (const id of ids) caches[id] = rnd() < 0.1 ? null : acct(Math.round(rnd() * 100) / 100, Math.round(rnd() * 6 * D) + H, { u5: Math.round(rnd() * 100) / 100 });
      const ms = ids.filter(() => rnd() < 0.8).map((id) => ({ id, name: id.toUpperCase() }));
      const base = { currentId: ids[Math.floor(rnd() * 4)], members: ms, readCache: (id) => caches[id] ?? null, nowSec: NOW, proactive: rnd() < 0.5, explain: true, warm: rnd() < 0.3 ? { warm: rnd() < 0.5, agoSec: 5, ttlSec: 300, inTurn: rnd() < 0.5 } : null };
      base.hot = base.proactive;
      n++;
      const dp = decidePinnedPlacement({ ...base, pin: null });
      const got = dp === null ? JSON.stringify(decidePoolSwitch(base)) : 'pinned!';
      if (got === JSON.stringify((master || { decidePoolSwitch }).decidePoolSwitch(base))) same++; else if (!diff) diff = { i, got };
    }
    ck(`pin: ${n} seeded worlds with NO pin decide byte-identically to ${master ? 'master' : 'the pool verdict (ref-free)'} (the pin path returns null, the pool verdict is ${master ? "master's" : 'untouched'})`, same === n, JSON.stringify(diff));
  }
  // CONTROLS — one patched copy per rule
  const src = fs.readFileSync(path.resolve('src/account-pool-auto.js'), 'utf8');
  const ctl = (tag, from, to) => (src.includes(from) ? M.load('src/account-pool-auto.js', src.replace(from, to), tag) : null);
  const noStay = ctl('nostay', "if (currentId === pinId) return { to: null, reason: 'pin', held: true, ...base };", 'if (currentId === pinId) return decidePoolSwitch({ ...opts, explain: true }); // PATCHED: the pin has no authority on its own member');
  ck('pin CONTROL: without the stay rule (the automatic rules decide a conversation on its pin) EDF drags it away', noStay && noStay.decidePinnedPlacement({ pin: 'a', currentId: 'a', members: mem, readCache: (id) => good[id], nowSec: NOW, proactive: true, hot: true }).to === 'b');
  const noSettle = ctl('nosettle', 'const settled = r.known && br.length > 0 && br.every((b) => b.remaining >= THRESH[b.kind].hot + MIN_GAIN_PCT) && (!readLogin || loginSwitchTarget(li));', 'const settled = true; // PATCHED: no settle bar');
  ck('pin CONTROL: without the settle bar a pin barely back over the hard line pulls the conversation back (the flap)', noSettle && noSettle.decidePinnedPlacement({ pin: 'a', currentId: 'b', members: mem, readCache: (id) => softA[id], nowSec: NOW, proactive: true, hot: true }).reason === 'pin-return');
  const noHold = ctl('nohold', "if (warm && warm.inTurn) return { to: null, reason: 'pin-hold',", "if (false) return { to: null, reason: 'pin-hold',");
  ck('pin CONTROL: without the mid-turn hold the return cuts a turn in half', noHold && noHold.decidePinnedPlacement({ pin: 'a', currentId: 'b', members: mem, readCache: (id) => good[id], nowSec: NOW, proactive: true, hot: true, warm: hotW }).reason === 'pin-return');
  for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: master ? 4 : 3, label: 'pin: ' })) ck(r.name, r.pass);   // the master copy counts only where it was made
})();


// ── THE PIN on the REAL engine + the REAL route (POST /api/accounts/:poolId/pin) ─────────────────────────
await (async () => {
  const fs = require('node:fs');
  const { AccountManager } = require(path.resolve('src/accounts.js'));
  const { ClaudeCodeAdapter } = require(path.resolve('src/adapters/claude-code.js'));
  const { scratch } = await import('./scratch.mjs');
  const scr = scratch('poolpin-eng'); fs.rmSync(scr, { recursive: true, force: true }); fs.mkdirSync(scr, { recursive: true });
  const CREDS = (id) => JSON.stringify({ claudeAiOauth: { accessToken: 'tok-' + id, refreshToken: 'r-' + id, expiresAt: Date.now() + 36e5, refreshTokenExpiresAt: Date.now() + 30 * 86400e3, subscriptionType: 'max' } });
  const quietly = (fn) => { const o = console.log, w = console.warn, lines = []; console.log = (...a) => lines.push(a.join(' ')); console.warn = (...a) => lines.push(a.join(' ')); try { fn(); } finally { console.log = o; console.warn = w; } return lines; };
  const engMod = require(path.resolve('src/server/usage-pool-engine.js'));
  const world = ({ hot = true, priority = null, engine = engMod, routeEngine = (e) => e, routesMod = null, client = false } = {}) => {
    const root = fs.mkdtempSync(path.join(scr, 'w-'));
    const dataDir = path.join(root, 'data');
    const am = new AccountManager({ dataDir });
    if (!am.poolSupported()) return null;
    const id = {};
    for (const [k, nm] of [['martin', 'Martin Max'], ['uci', 'UCI Max'], ['fish', 'Fish Max']]) { id[k] = am.createSubscription({ name: nm }).id; fs.writeFileSync(path.join(am.subDir(id[k]), '.credentials.json'), CREDS(id[k]), { mode: 0o600 }); }
    const P = am.createPool({ name: '全部', members: [id.martin, id.uci, id.fish] }).id;
    am.setPoolTarget(P, id.martin); am.updatePool(P, { hot, ...(priority ? { priority: priority.map((k) => id[k]) } : {}) });
    const cacheDir = path.join(dataDir, 'usage-cache'); fs.mkdirSync(cacheDir, { recursive: true });
    const nowS = Math.floor(Date.now() / 1000);
    let rseq = 0; // every reading strictly NEWER than the last (the estimator's memo yields only to newer ground truth — two writes in one ms would read as the same reading)
    const wr = (k, u5, u7, resetInS, extra = {}) => fs.writeFileSync(path.join(cacheDir, id[k] + '.json'), JSON.stringify({ fetchedAt: Date.now() - 1000 + (rseq += 5), source: 'on-demand', fiveHour: { utilization: u5, resetsAt: nowS + 7200 }, sevenDay: { utilization: u7, resetsAt: nowS + resetInS }, ...extra }));
    wr('martin', 0.1, 0.3, 2 * 86400); wr('uci', 0.1, 0.2, 5 * 86400); wr('fish', 0.1, 0.4, 4 * 86400);
    const sessions = new Map(), notices = [], fires = [], metas = new Map(), asked = [];
    const eng = engine.create({
      app: { get() { }, post() { }, put() { }, patch() { }, delete() { }, use() { }, locals: {} }, rootDir: root, USAGE_CACHE_DIR: cacheDir, activeSessions: sessions,
      wss: { clients: new Set(client ? [{ readyState: 1, send: (p) => { try { const m = JSON.parse(p); if (m.type === 'pool-auto-switched') asked.push(...(m.affected || []).map((x) => x.serverId)); } catch { } } }] : []) }, WS_OPEN: 1, broadcastToSession() { }, serverNotice: (k, t, o) => notices.push({ k, t, o }), serverSetting: () => undefined, getAccounts: () => am,
      getHosts: () => ({ device: async () => ({ poolOrders: async () => { }, ackPoolOrdersLog() { } }) }),
      getUsageHistory: () => ({ _cost: () => 0, ingestRemoteEvents() { } }), recordUsageAttribution() { }, adapterRegistry: { get: () => ClaudeCodeAdapter },
      getAutoResume: () => ({ armIfEnabled() { }, noteFireOutcome() { }, noteRecovered() { }, noteNoPoolTarget() { }, statusFor: () => null, enabledFor: () => false, fireNow: (sid) => { fires.push(sid); return false; }, armedIds: () => [] }),
      getOtelIngest: () => ({ observedOrgFor: () => null }), getQuotaProbe: () => null,
      getSessionMetaStore: () => ({ readSessionMeta: (k) => metas.get(k) || {}, writeSessionMeta: (k, v) => metas.set(k, v) }),
    });
    eng.usageEstimator.burnFor = () => ({});
    const mk = (sid, on, { warm = false, inTurn = false, host = null } = {}) => {
      const s = { backend: 'claude', mode: 'chat', host, _webuiId: sid, claudeSessionId: 'cid-' + sid, _accountId: P, name: 'conv ' + sid, cwd: root, sockName: 'cw-' + sid, buffer: '', createdAt: Date.now(), pty: { write() { } },
        _spawnModel: 'claude-fable-5-1', _lastPtyDataAt: Date.now() - (warm ? 20e3 : 30 * 60e3), _isStreaming: inTurn, _turnState: inTurn ? 'running' : 'idle' };
      sessions.set(sid, s); metas.set(s.sockName, { webuiSessionId: sid }); if (!host) am.ensureSessionPoolLink(P, sid, id[on], { why: 'spawn' });
      return s;
    };
    const on = (sid) => Object.keys(id).find((k) => id[k] === am.poolCurrentFor(P, sid)) || String(am.poolCurrentFor(P, sid));
    const routes = {};
    let broadcasts = 0;
    const app = { get: (p, h) => { routes['GET ' + p] = h; }, post: (p, h) => { routes['POST ' + p] = h; }, patch: (p, h) => { routes['PATCH ' + p] = h; }, put() { }, delete: (p, h) => { routes['DELETE ' + p] = h; }, use() { }, locals: {} };
    (routesMod || require(path.resolve('src/server/account-usage-routes.js'))).create({ app, rootDir: root, activeSessions: sessions, auth: {}, engine: routeEngine(eng), serverSetting: () => undefined, recordUsageAttribution() { }, liveAccountIdSet: () => new Set(),
      getAccounts: () => am, broadcastActiveSessions: () => { broadcasts++; }, getHosts: () => ({ list: () => [] }), getMounts: () => ({}), getTelemetry: () => ({}), getUsageHistory: () => ({}), getLoginExpiryWatch: () => null });
    const call = (method, p, params, body, headers = {}) => { const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } }; routes[method + ' ' + p]({ params, body, headers, query: {} }, res); return res; };
    const pin = (sid, member, headers) => call('POST', '/api/accounts/:poolId/pin', { poolId: P }, { sessionId: sid, memberId: member == null ? null : id[member] || member }, headers);
    return { eng, am, id, P, sessions, notices, fires, metas, asked, on, call, pin, mk, wr, get broadcasts() { return broadcasts; } };
  };
  const w = world({ priority: ['uci'] });
  if (!w) { ck('pin engine SKIP — pools unsupported', true); return; }
  w.mk('s-a', 'martin', { warm: true, inTurn: true }); w.mk('s-b', 'martin');
  // (1) the route: refusals by name
  ck('route: an agent token is refused (403 agent_forbidden)', w.pin('s-a', 'fish', { authorization: 'Bearer vsst_x' }).code === 403);
  ck('route: a non-member is refused (400 not_member)', (() => { const r = w.pin('s-a', 'sub-stranger'); return r.code === 400 && r.body.code === 'not_member'; })());
  ck('route: an unknown session (404 no_session)', w.pin('s-nope', 'fish').body.code === 'no_session');
  ck('route: a non-pooled account id (400 not_pooled)', w.call('POST', '/api/accounts/:poolId/pin', { poolId: w.id.fish }, { sessionId: 's-a', memberId: w.id.fish }).body.code === 'not_pooled');
  w.mk('s-remote', 'martin', { host: 'h1' });
  ck('route: a remote conversation (400 remote_session)', w.pin('s-remote', 'fish').body.code === 'remote_session');
  // (2) pin s-a (warm, MID-TURN) to Fish: placed NOW through the one link writer
  const wl = quietly(() => { var r = w.pin('s-a', 'fish'); w._r = r; });
  const r = w._r;
  ck('pin: placed NOW, mid-turn included (a manual choice is never held) — answers {pinned, placed, reason:pin}', r.code === 200 && r.body.placed === true && r.body.reason === 'pin' && r.body.pinned.memberId === w.id.fish && w.on('s-a') === 'fish', JSON.stringify(r.body));
  ck('pin: …re-pointed through ensureSessionPoolLink (the slot ledger names why: pin)', w.am.slotTransitions.all().some((x) => x.sessionId === 's-a' && x.to === w.id.fish && x.why === 'pin'));
  ck('pin: …persisted into the session meta ({memberId, at, by:user}) for a restart', w.metas.get('cw-s-a')?.poolPin?.memberId === w.id.fish && w.metas.get('cw-s-a')?.poolPin?.by === 'user');
  ck('pin: …the session facts are broadcast (active-sessions carries poolPin)', w.broadcasts === 1);
  ck('pin: …the words: `Pool "全部": conversation "conv s-a" pinned to Fish Max.` + its i18n key', w.notices.some((n) => n.t === 'Pool "全部": conversation "conv s-a" pinned to Fish Max.' && n.o.i18n.key === 'Pool "{pool}": conversation "{title}" pinned to {member}.'), JSON.stringify(w.notices.map((n) => n.t)));
  ck('pin: …the journal: `[pool] pin <pool>/s-a: → <fish> (placed, from <martin>)`', wl.some((l) => l === `[pool] pin ${w.P}/s-a: → ${w.id.fish} (placed, from ${w.id.martin})`), wl.join(' | '));
  ck('spend: setting a pin starts NO turn (nothing asked auto-resume to continue)', w.fires.length === 0);
  { const sl = w.eng.readingSlotFor(w.sessions.get('s-a'), Date.now(), {}); ck('attribution: a pin changes no attribution rule — the conversation\'s readings key on its token SLOT, which is the link the pin re-pointed (Fish)', sl && sl.key === w.id.fish && sl.slotOk === true, JSON.stringify(sl)); w.sessions.get('s-a')._turnReadingSlot = null; }
  // (3) the pass: pin > priority (#1 = UCI) > automatic
  w.eng._poolSwitchAt.clear();
  quietly(() => w.eng.maybePoolAutoSwitchForPool(w.P, { force: true }));
  ck('PRECEDENCE: the pinned conversation stays on Fish although the order wants UCI (#1); the unpinned one goes to UCI', w.on('s-a') === 'fish' && w.on('s-b') === 'uci', ['s-a', 's-b'].map(w.on).join(','));
  // (4) Fish runs out ⇒ automatic rules (here: the order ⇒ UCI), the pin kept
  w.wr('fish', 0.99, 0.4, 4 * 86400); w.eng._poolSwitchAt.clear(); w.eng._poolAutoLast.clear();
  const xl = quietly(() => w.eng.maybePoolAutoSwitchForPool(w.P, { force: true }));
  ck('exhausted: the pin cannot serve ⇒ the conversation moves by the pool\'s own rules (mid-turn: it is a wall) — to UCI', w.on('s-a') === 'uci' && w.sessions.get('s-a')._poolPin.memberId === w.id.fish, w.on('s-a'));
  ck('exhausted: …the words: `… — Fish Max is out of quota — running on UCI Max until it resets (pin kept).`', w.notices.some((n) => n.t === 'Pool "全部": conversation "conv s-a" — Fish Max is out of quota — running on UCI Max until it resets (pin kept).'), JSON.stringify(w.notices.map((n) => n.t)));
  ck('exhausted: …the journal line says the pin is kept', xl.some((l) => /per-session switch .*s-a: .* — pin kept \(Fish Max: pin-exhausted\)$/.test(l)), xl.join(' | '));
  // (5) Fish comes back (member wake) while s-a is mid-turn ⇒ owed; at its stop ⇒ back
  w.wr('fish', 0.05, 0.4, 4 * 86400); w.eng._poolSwitchAt.clear(); w.eng._memberWakeAt.clear();
  const hl = quietly(() => w.eng.onMemberReadingFresh(w.id.fish, 'test reading'));
  ck('return: the member wake re-decides — mid-turn, the return is OWED (`[pool] pin s-a: Fish Max (pinned) can serve again — returns at its next stop`)', w.on('s-a') === 'uci' && hl.some((l) => l === '[pool] pin s-a: Fish Max (pinned) can serve again — returns at its next stop (mid-turn now)'), hl.filter((l) => /\[pool\]/.test(l)).join(' | '));
  const sa = w.sessions.get('s-a'); sa._isStreaming = false; sa._turnState = 'idle';
  quietly(() => w.eng.noteTurnStopped(sa));
  ck('return: at its first stop it is back on Fish (the existing first-stop re-decide), the warm cache does not hold it', w.on('s-a') === 'fish');
  ck('return: …the words: `… is back on Fish Max (pinned).`', w.notices.some((n) => n.t === 'Pool "全部": conversation "conv s-a" is back on Fish Max (pinned).'));
  // (6) the one "everything now" act leaves a pinned conversation alone
  const g = w.call('POST', '/api/accounts/pool/:id/gather', { id: w.P }, { memberId: w.id.martin });
  ck('gather: "Move every conversation here now" moves the unpinned one and SKIPS the pinned one (pin > everything)', g.code === 200 && w.on('s-b') === 'martin' && w.on('s-a') === 'fish');
  // (7) clearing: automatic again, nothing moves at the clear
  const cl = w.pin('s-a', null);
  ck('clear: "Automatic" clears the pin and moves NOTHING at the clear', cl.code === 200 && cl.body.pinned === null && cl.body.reason === 'automatic' && w.on('s-a') === 'fish' && w.sessions.get('s-a')._poolPin === null && w.metas.get('cw-s-a').poolPin === null);
  ck('clear: …the words: `… is placed automatically again.`', w.notices.some((n) => n.t === 'Pool "全部": conversation "conv s-a" is placed automatically again.'));
  // (8) pinning an EXHAUSTED member: the pin is kept, it waits
  w.wr('uci', 0.99, 0.2, 5 * 86400);
  const pe = w.pin('s-b', 'uci');
  ck('pin an exhausted member: accepted, NOT placed — it waits (reason pin-exhausted), the words say so', pe.code === 200 && pe.body.placed === false && pe.body.reason === 'pin-exhausted' && w.on('s-b') === 'martin' && w.notices.some((n) => /pinned to UCI Max — UCI Max cannot serve right now; it moves there when it can\.$/.test(n.t)), JSON.stringify(pe.body));
  // (9) the spawn chooser honours the pin (a resume starts on it) — and falls back when it cannot serve
  ck('chooser: a resumed pinned conversation starts on its pin when it can serve', w.eng.poolChooserForModel(w.P, { model: 'claude-fable-5-1', pin: w.id.fish }) === w.id.fish);
  ck('chooser: …and where the pool would put it when the pin cannot serve (UCI is spent)', w.eng.poolChooserForModel(w.P, { model: 'claude-fable-5-1', pin: w.id.uci }) !== w.id.uci);
  // (10) a pool that cannot re-point a running conversation: recorded, applies at the next restart
  const wc = world({ hot: false });
  wc.mk('s-c', 'martin');
  const pc = wc.pin('s-c', 'fish');
  ck('cold pool: accepted and NOT placed — applies at the next restart (code cold_pool); never a restart by itself', pc.code === 200 && pc.body.placed === false && pc.body.code === 'cold_pool' && pc.body.reason === 'applies-at-restart' && wc.on('s-c') === 'martin');
  ck('cold pool: …the words say it', wc.notices.some((n) => n.t === 'Pool "全部": conversation "conv s-c" pinned to Fish Max — it moves there at its next restart.'));
  // (11) a codex pool: the process HOLDS its member, so the pin applies at the next spawn — onto the pinned home
  {
    const prevHome = process.env.CODEX_HOME;
    const root = fs.mkdtempSync(path.join(scr, 'cx-'));
    process.env.CODEX_HOME = path.join(root, 'codex-home'); fs.mkdirSync(process.env.CODEX_HOME, { recursive: true });
    const cam = new AccountManager({ dataDir: path.join(root, 'data') });
    const sub = (name) => { const { id } = cam.createCodexSubscription({ name }); fs.writeFileSync(path.join(cam.codexSubDir(id), 'auth.json'), JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: 'tok-' + name, id_token: 'x.e30.x' } })); return id; };
    const A = sub('Cx A'), B = sub('Cx B');
    const CP = cam.createPool({ name: 'Cx', backend: 'codex' }).id; cam.setPoolTarget(CP, A);
    const plain = cam.resolveForSpawn(CP, 'codex', {});
    const pinned = cam.resolveForSpawn(CP, 'codex', { pinned: true, chooseMember: () => B });
    ck('codex: an unpinned spawn resolves through the pool link (byte-identical)', plain.localEnv.CODEX_HOME === cam._acctDir('codex', CP) && !plain.pinnedMember);
    ck('codex: a pinned spawn goes straight onto the pinned member\'s own home (the process then HOLDS it)', pinned.pinnedMember === B && pinned.localEnv.CODEX_HOME === cam._acctDir('codex', B));
    ck('codex: a pin naming a non-member falls back to the pool link', !cam.resolveForSpawn(CP, 'codex', { pinned: true, chooseMember: () => 'cxs-stranger' }).pinnedMember);
    ck('codex: an UNPINNED spawn never follows the chooser (byte-identical: the pool link)', !cam.resolveForSpawn(CP, 'codex', { chooseMember: () => B }).pinnedMember);
    const cs = new Map(); cs.set('s-x', { backend: 'codex', mode: 'chat', host: null, _webuiId: 's-x', _accountId: CP, sockName: 'cw-x', name: 'x', _heldPoolMember: A, createdAt: Date.now() });
    const ceng = engMod.create({ app: { get() { }, post() { }, put() { }, patch() { }, delete() { }, use() { }, locals: {} }, rootDir: root, USAGE_CACHE_DIR: path.join(root, 'data', 'usage-cache'), activeSessions: cs, wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() { }, serverNotice() { }, serverSetting: () => undefined, getAccounts: () => cam, getHosts: () => ({ device: async () => ({ poolOrders: async () => { }, ackPoolOrdersLog() { } }) }), getUsageHistory: () => ({ _cost: () => 0, ingestRemoteEvents() { } }), recordUsageAttribution() { }, adapterRegistry: { get: () => ClaudeCodeAdapter }, getAutoResume: () => null, getOtelIngest: () => null, getQuotaProbe: () => null, getSessionMetaStore: () => null });
    const cr = quietly(() => { ceng._r = ceng.setConversationPin('s-x', B); });
    ck('codex: the pin is recorded and applies at the next restart (code codex_cold) — never a restart by itself', ceng._r.ok && ceng._r.placed === false && ceng._r.code === 'codex_cold' && cs.get('s-x')._poolPin.memberId === B, JSON.stringify(ceng._r));
    if (prevHome === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = prevHome;
  }
  // ── verify r1 (money): THE RETURN TO A PIN IS BELTED LIKE EVERY VOLUNTARY MOVE ─────────────────────────
  // A pin whose reading wobbles across its bars (two producers disagreeing, an estimate re-anchored by
  // each fresh reading): the move OFF a hard-dead pin is exempt from the 180 s dwell belt (a wall is a
  // wall) and the return was exempt too — the conversation re-pointed on EVERY evaluation. The belt is
  // left in place here (nothing clears _poolSwitchAt), 12 evaluations inside its 180 s.
  {
    const { mutantCopies } = await import('./mutant-copy.mjs');
    const MR = mutantCopies('poolpin-r1', path.resolve('.'));
    const flap = (engine, { pinned = true, priority = null } = {}) => {
      const wf = world({ engine, ...(priority ? { priority } : {}) });
      wf.mk('s-f', 'fish');
      if (pinned) quietly(() => wf.pin('s-f', 'fish'));
      let moves = 0, prev = wf.on('s-f');
      quietly(() => { for (let i = 0; i < 12; i++) { wf.wr('fish', i % 2 === 0 ? 0.96 : 0.86, 0.4, 4 * 86400); wf.eng.maybePoolAutoSwitchForPool(wf.P, { force: true }); const now = wf.on('s-f'); if (now !== prev) { moves++; prev = now; } } });
      return { moves, on: prev, fires: wf.fires.length };
    };
    const real = flap(engMod);
    ck('r1 belt: a pin whose reading wobbles across its bars (5h 4% ⇔ 14%) moves the conversation ONCE in 12 evaluations — off the dead pin, then the belt holds the return', real.moves === 1 && real.on === 'martin', JSON.stringify(real));
    const auto = flap(engMod, { pinned: false }), prio = flap(engMod, { pinned: false, priority: ['fish', 'martin'] });
    ck('r1 belt: …exactly as an unpinned conversation (1) and a manual priority (1) — one bound for every voluntary move', auto.moves === 1 && prio.moves === 1, JSON.stringify({ auto, prio }));
    const engSrc = fs.readFileSync(path.resolve('src/server/usage-pool-engine.js'), 'utf8');
    const beltLine = 'if (now - lastS < 180000 && !ds.escape &&';
    ck('r1 belt control: the patch (pin-return exempt again) hits', engSrc.split(beltLine).length === 2);
    const loose = MR.load('src/server/usage-pool-engine.js', engSrc.replace(beltLine, "if (now - lastS < 180000 && ds.reason !== 'pin-return' && !ds.escape &&"), 'nobelt');
    const was = flap(loose);
    ck('r1 belt control: with the return exempt the conversation re-points on EVERY evaluation (12 of 12 — what verify r1 measured)', was.moves === 12, JSON.stringify(was));
    // the belt never delays an ESCAPE: the return off a member under its hard bar names that (fromRemaining)
    const we = world({});
    const se = we.mk('s-e', 'martin');
    se._poolPin = { memberId: we.id.fish, at: Date.now(), by: 'user' };
    we.eng._poolSwitchAt.set(we.P + ':s-e', Date.now() - 5000); // it moved 5 s ago
    we.wr('martin', 0.99, 0.3, 2 * 86400); // …and the member it runs on is spent (5h 1%)
    quietly(() => we.eng.maybePoolAutoSwitchForPool(we.P, { force: true }));
    ck('r1 belt: a return OFF a member under its hard bar is an escape — never held by the belt', we.on('s-e') === 'fish', we.on('s-e'));
    const { decidePinnedPlacement: dpp } = require(path.resolve('src/account-pool-auto.js'));
    const NOWS = Math.floor(Date.now() / 1000);
    const cc = { a: { fetchedAt: Date.now(), fiveHour: { utilization: 0.1, resetsAt: NOWS + 7200 }, sevenDay: { utilization: 0.3, resetsAt: NOWS + 86400 } }, b: { fetchedAt: Date.now(), fiveHour: { utilization: 0.4, resetsAt: NOWS + 7200 }, sevenDay: { utilization: 0.3, resetsAt: NOWS + 86400 } } };
    const vr = dpp({ pin: 'a', currentId: 'b', members: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], readCache: (id) => cc[id], nowSec: NOWS, hot: true, proactive: true, pessimism: { b: 10 } });
    ck('r1 belt (PURE): pin-return names what the member it runs on has left (docked by its pessimism), the belt\'s own input', vr.reason === 'pin-return' && vr.fromRemaining === 50, JSON.stringify(vr));
  }
  // ── verify r1 (money): A WALL IS A WALL FOR A PINNED CONVERSATION TOO ────────────────────────────────
  // The pin ran out, the conversation runs on another member; the pin can serve again AND the member it
  // runs on is now a wall. The return verdict pre-empted the automatic rules: mid-turn it answered
  // 'pin-hold' (the turn ran into the wall), on a pool without hot switching it was skipped (the
  // conversation sat on the spent member, not a line in the journal).
  {
    const { mutantCopies } = await import('./mutant-copy.mjs');
    const MW = mutantCopies('poolpin-r1wall', path.resolve('.'));
    const pure = require(path.resolve('src/account-pool-auto.js'));
    const NOWS = Math.floor(Date.now() / 1000);
    const bucket = (u5) => ({ fetchedAt: Date.now(), fiveHour: { utilization: u5, resetsAt: NOWS + 7200 }, sevenDay: { utilization: 0.3, resetsAt: NOWS + 86400 } });
    const mem3 = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];
    const ask = (mod, o) => mod.decidePinnedPlacement({ pin: 'a', currentId: 'b', members: mem3, nowSec: NOWS, hot: true, proactive: true, warm: { warm: true, inTurn: true }, readCache: (id) => ({ a: bucket(0.1), b: bucket(0.1), c: bucket(0.1) })[id], ...o });
    const held = ask(pure, {});
    ck('r1 wall (PURE): mid-turn on a HEALTHY member, the pin usable again ⇒ owed at the stop (pin-hold) — unchanged', held.to === null && held.reason === 'pin-hold', JSON.stringify(held));
    const spent = ask(pure, { readCache: (id) => ({ a: bucket(0.1), b: bucket(0.99), c: bucket(0.1) })[id] });
    ck('r1 wall (PURE): mid-turn on a member UNDER ITS HARD BAR ⇒ the return is an escape, NOW (band hard, escape: exhausted, fromRemaining 1)', spent.to === 'a' && spent.reason === 'pin-return' && spent.band === 'hard' && spent.escape === 'exhausted' && spent.fromRemaining === 1, JSON.stringify(spent));
    const gone = ask(pure, { membership: ['a', 'c'] });
    ck('r1 wall (PURE): …on a member the pool no longer lists ⇒ escape: not-a-member', gone.to === 'a' && gone.escape === 'not-a-member' && gone.band === 'hard', JSON.stringify(gone));
    const dead = ask(pure, { readLogin: (id) => (id === 'b' ? { state: 'expired', usable: false } : { state: 'live', usable: true, expiresInSec: 40 * 86400 }) });
    ck('r1 wall (PURE): …on a member whose login cannot serve ⇒ escape: login-expired', dead.to === 'a' && dead.escape === 'login-expired', JSON.stringify(dead));
    const soft = ask(pure, { readCache: (id) => ({ a: bucket(0.1), b: bucket(0.93), c: bucket(0.1) })[id] });
    ck('r1 wall (PURE): the SOFT band (5h 7%: under the hot bar, over the hard one) is no wall — owed at the stop', soft.to === null && soft.reason === 'pin-hold', JSON.stringify(soft));
    const src = fs.readFileSync(path.resolve('src/account-pool-auto.js'), 'utf8');
    const clause = "if (escape) return { to: pinId, toName: pinnedName, fromRemaining, toRemaining: r.remaining, reason: 'pin-return', band: 'hard', escape, ...base };";
    ck('r1 wall control: the patch (the escape clause removed) hits', src.split(clause).length === 2);
    const noEscape = MW.load('src/account-pool-auto.js', src.replace(clause, ''), 'noescape');
    ck('r1 wall control: without it the pinned conversation is HELD mid-turn on the spent member (what verify r1 reproduced)', ask(noEscape, { readCache: (id) => ({ a: bucket(0.1), b: bucket(0.99), c: bucket(0.1) })[id] }).reason === 'pin-hold');
    // the real engine, hot pool: mid-turn on a spent member, the pin can serve
    const wh = world({});
    const sh = wh.mk('s-h', 'martin', { warm: true, inTurn: true });
    sh._poolPin = { memberId: wh.id.fish, at: Date.now(), by: 'user' };
    wh.wr('martin', 0.99, 0.3, 2 * 86400);
    wh.eng._poolSwitchAt.set(wh.P + ':s-h', Date.now() - 5000); // …and it moved 5 s ago: an escape is never belted
    const hl2 = quietly(() => wh.eng.maybePoolAutoSwitchForPool(wh.P, { force: true }));
    ck('r1 wall (engine, hot): a pinned conversation MID-TURN on a spent member goes to its pin NOW (inside the dwell belt too)', wh.on('s-h') === 'fish' && hl2.some((l) => /per-session switch .*s-h: .* — pin return \(pinned\)$/.test(l)), wh.on('s-h') + ' | ' + hl2.join(' | '));
    ck('r1 wall (engine, hot): …attributed like every re-point (slot row why per-session-switch), the words "is back on Fish Max (pinned)."', wh.am.slotTransitions.all().some((x) => x.sessionId === 's-h' && x.to === wh.id.fish) && wh.notices.some((n) => n.t === 'Pool "全部": conversation "conv s-h" is back on Fish Max (pinned).'));
    // the real engine, a pool that RESTARTS to move (hot off): idle on a spent member, the pin can serve
    const restarts = [];
    const wcold = world({ hot: false });
    const sc = wcold.mk('s-k', 'martin');
    sc._poolPin = { memberId: wcold.id.fish, at: Date.now(), by: 'user' };
    wcold.am.setPoolTarget(wcold.P, wcold.id.uci);
    wcold.wr('martin', 0.99, 0.3, 2 * 86400); wcold.eng._poolSwitchAt.clear(); wcold.eng._poolAutoLast.clear();
    quietly(() => wcold.eng.maybePoolAutoSwitchForPool(wcold.P, { force: true }));
    ck('r1 wall (engine, hot off): a pinned conversation on a spent member is MOVED to its pin (it sat there, silently)', wcold.on('s-k') === 'fish', wcold.on('s-k'));
    ck('r1 wall (engine, hot off): …the words say the restart', wcold.notices.some((n) => n.t === 'Pool "全部": conversation "conv s-k" is back on Fish Max (pinned). Restarting the conversation to apply it.'), JSON.stringify(wcold.notices.map((n) => n.t)));
    // …while a return of CONVENIENCE on that pool is still never a restart (the pin applies at the next spawn)
    const wconv = world({ hot: false });
    const sv = wconv.mk('s-v', 'martin');
    sv._poolPin = { memberId: wconv.id.fish, at: Date.now(), by: 'user' };
    wconv.eng._poolSwitchAt.clear(); wconv.eng._poolAutoLast.clear();
    quietly(() => wconv.eng.maybePoolAutoSwitchForPool(wconv.P, { force: true }));
    ck('r1 wall (engine, hot off): a healthy member is not left by a restart — the pin applies at the next spawn (unchanged)', wconv.on('s-v') === 'martin');
    void restarts;
  }
  // ── verify r1 (money): "MOVE EVERY CONVERSATION HERE NOW" IS JUDGED BEFORE IT MOVES ANYTHING ─────────
  // The #1 row's act is never greyed (addendum 4), so it is reachable on a member that is OUT OF QUOTA:
  // the route moved every conversation onto it (mid-turn included) and the next pool pass moved them
  // all back — two cold starts each, a wall for every request in between.
  {
    const gather = (w2, member, headers) => w2.call('POST', '/api/accounts/pool/:id/gather', { id: w2.P }, { memberId: w2.id[member] }, headers);
    const setup = (o = {}) => { const w2 = world({ priority: ['uci', 'martin', 'fish'], ...o }); w2.mk('g-1', 'martin', { warm: true, inTurn: true }); w2.mk('g-2', 'martin', { warm: true }); w2.mk('g-3', 'fish'); return w2; };
    const wg = setup();
    wg.wr('uci', 0.995, 0.2, 5 * 86400); // #1 is spent (5h 0.5% left)
    quietly(() => wg.eng.maybePoolAutoSwitchForPool(wg.P, { force: true })); wg.eng._poolSwitchAt.clear(); wg.eng._poolAutoLast.clear();
    const at0 = ['g-1', 'g-2', 'g-3'].map(wg.on).join(','), rows0 = wg.am.slotTransitions.all().length, def0 = wg.am.poolCurrent(wg.P), fires0 = wg.fires.length;
    const gl = quietly(() => { wg._g = gather(wg, 'uci'); });
    ck('r1 gather: onto a member that is OUT OF QUOTA ⇒ refused by name (409 target_cannot_serve, why pin-exhausted, until = its reset), in words', wg._g.code === 409 && wg._g.body.code === 'target_cannot_serve' && wg._g.body.why === 'pin-exhausted' && wg._g.body.until > Date.now() && wg._g.body.error === 'UCI Max is out of quota — nothing was moved. The pool brings its conversations back to it when it can serve again.', JSON.stringify(wg._g.body));
    ck('r1 gather: …NOTHING moved — no link, no default, not one slot row, no turn', ['g-1', 'g-2', 'g-3'].map(wg.on).join(',') === at0 && wg.am.poolCurrent(wg.P) === def0 && wg.am.slotTransitions.all().length === rows0 && wg.fires.length === fires0, ['g-1', 'g-2', 'g-3'].map(wg.on).join(','));
    ck('r1 gather: …the journal says it', gl.some((l) => l === `[pool] gather ${wg.P}: → ${wg.id.uci} refused — pin-exhausted (nothing moved)`), gl.join(' | '));
    // verify r2: an engine that offers NO plan (a server.js literal without gatherPlan) is refused — fail
    // closed; it used to fall through to the unjudged move, and every gate built the route over the whole engine
    const wun = setup({ routeEngine: (e) => ({ ...e, gatherPlan: undefined }) });
    wun.wr('uci', 0.1, 0.2, 5 * 86400); // even onto a member that COULD serve: no judge, no move
    const unAt = ['g-1', 'g-2', 'g-3'].map(wun.on).join(','), unRows = wun.am.slotTransitions.all().length, unDef = wun.am.poolCurrent(wun.P);
    quietly(() => { wun._g = gather(wun, 'uci'); });
    ck('r2 gather: an engine that offers no plan ⇒ 503 engine_unwired and NOTHING moved (fail closed — it used to move unjudged)', wun._g.code === 503 && wun._g.body.code === 'engine_unwired' && ['g-1', 'g-2', 'g-3'].map(wun.on).join(',') === unAt && wun.am.poolCurrent(wun.P) === unDef && wun.am.slotTransitions.all().length === unRows, JSON.stringify(wun._g.body));
    // control: the route without the judgement (the route as it was before verify r1 — a patched copy)
    const gsrc = fs.readFileSync(path.resolve('src/server/account-usage-routes.js'), 'utf8');
    const gj = /    if \(typeof engine\.gatherPlan !== 'function'\) \{[\s\S]*?\n    \}\n    const plan = engine\.gatherPlan\(id, memberId\);/;
    ck('r1 gather control: the patch (the judgement removed) hits', gj.test(gsrc));
    const { mutantCopies: mcG } = await import('./mutant-copy.mjs');
    const MG = mcG('poolpin-r2gather', path.resolve('.'));
    const wold = setup({ routesMod: MG.load('src/server/account-usage-routes.js', gsrc.replace(gj, '    const plan = null;'), 'unjudged') });
    wold.wr('uci', 0.995, 0.2, 5 * 86400);
    quietly(() => wold.eng.maybePoolAutoSwitchForPool(wold.P, { force: true })); wold.eng._poolSwitchAt.clear(); wold.eng._poolAutoLast.clear();
    const rowsOld = wold.am.slotTransitions.all().length;
    quietly(() => { wold._g = gather(wold, 'uci'); });
    const onDead = ['g-1', 'g-2', 'g-3'].map(wold.on).join(',');
    wold.eng._poolSwitchAt.clear(); wold.eng._poolAutoLast.clear();
    quietly(() => wold.eng.maybePoolAutoSwitchForPool(wold.P, { force: true }));
    ck('r1 gather control: unjudged, all three go onto the spent member (mid-turn included) and the next pass moves them all back — 8 slot rows for nothing (what verify r1 measured)', wold._g.code === 200 && onDead === 'uci,uci,uci' && ['g-1', 'g-2', 'g-3'].every((x) => wold.on(x) !== 'uci') && wold.am.slotTransitions.all().length - rowsOld === 8, JSON.stringify({ onDead, after: ['g-1', 'g-2', 'g-3'].map(wold.on), rows: wold.am.slotTransitions.all().length - rowsOld }));
    // a member that can serve: moved, the answer counts; a pinned conversation is named as left alone
    const wok = setup();
    quietly(() => wok.pin('g-3', 'fish'));
    quietly(() => { wok._g = gather(wok, 'uci'); });
    ck('r1 gather: onto a usable member ⇒ moved 2, the pinned one left alone and COUNTED (skipped.pinned 1), the default moved', wok._g.code === 200 && wok._g.body.moved === 2 && wok._g.body.skipped.pinned === 1 && wok._g.body.skipped.cannotServe.length === 0 && wok._g.body.defaultMoved === true && ['g-1', 'g-2', 'g-3'].map(wok.on).join(',') === 'uci,uci,fish', JSON.stringify(wok._g.body));
    // per conversation, under ITS family view: a spent Fable cap stops a Fable conversation, never an Opus one
    const wf = setup();
    wf.sessions.get('g-2')._spawnModel = 'claude-opus-4-8';
    wf.wr('uci', 0.1, 0.2, 5 * 86400, { scopedWeekly: [{ name: 'Fable', utilization: 0.99, resetsAt: Math.floor(Date.now() / 1000) + 5 * 86400 }] });
    const defF = wf.am.poolCurrent(wf.P);
    quietly(() => { wf._g = gather(wf, 'uci'); });
    ck('r1 gather: a member whose FABLE cap is spent takes the Opus conversation and leaves the Fable ones where they are, BY NAME; the default stays', wf._g.code === 200 && wf.on('g-2') === 'uci' && wf.on('g-1') === 'martin' && wf.on('g-3') === 'fish' && wf._g.body.moved === 1 && wf._g.body.defaultMoved === false && wf.am.poolCurrent(wf.P) === defF && JSON.stringify(wf._g.body.skipped.cannotServe.map((x) => [x.sid, x.name, x.why])) === JSON.stringify([['g-1', 'conv g-1', 'pin-exhausted'], ['g-3', 'conv g-3', 'pin-exhausted']]), JSON.stringify(wf._g.body));
    ck('r1 gather: …through the ONE link writer (slot row why: gather)', wf.am.slotTransitions.all().some((x) => x.sessionId === 'g-2' && x.to === wf.id.uci && x.why === 'gather'));
    // a pool that restarts to move lands its conversations on the DEFAULT — so the member must take the pool as a whole
    const wcg = setup({ hot: false });
    wcg.sessions.get('g-2')._spawnModel = 'claude-opus-4-8';
    wcg.wr('uci', 0.1, 0.2, 5 * 86400, { scopedWeekly: [{ name: 'Fable', utilization: 0.99, resetsAt: Math.floor(Date.now() / 1000) + 5 * 86400 }] });
    quietly(() => { wcg._g = gather(wcg, 'uci'); });
    ck('r1 gather: on a pool that RESTARTS to move, a member that cannot take the pool as a whole is refused (no restart handed out)', wcg._g.code === 409 && wcg._g.body.code === 'target_cannot_serve' && !wcg._g.body.affected);
    ck('r1 gather: an agent token is still refused first (403)', gather(wg, 'uci', { authorization: 'Bearer jbt_x' }).code === 403);
  }
  // ── verify r1 (money): THE MEMBERS ROUTE HANDS THE CLIENT ONLY THE DEFAULT'S FOLLOWERS TO RESTART ────
  // On a pool that restarts to move (hot off) the answer's `affected` was EVERY conversation of the
  // pool whenever the default moved — the client restarts that list — so it restarted the ones the
  // engine had just left in place ("no member can take over": cut off from a serving member, onto a
  // default nobody could serve from) and the ones running on an untouched member of their own.
  {
    const { mutantCopies } = await import('./mutant-copy.mjs');
    const MA = mutantCopies('poolpin-r1aff', path.resolve('.'));
    const narrow = (w2) => { let r; quietly(() => { r = w2.call('PATCH', '/api/accounts/pool/:id', { id: w2.P }, { members: [w2.id.uci, w2.id.fish] }); }); return r; };
    const nobodyWorld = (o = {}) => { const w2 = world({ hot: false, client: true, ...o }); w2.mk('a-1', 'martin'); w2.mk('a-2', 'martin'); w2.mk('a-3', 'fish'); w2.wr('uci', 0.99, 0.2, 5 * 86400); w2.wr('fish', 0.99, 0.4, 4 * 86400); return w2; };
    const wn = nobodyWorld();
    const rn = narrow(wn);
    // the owner's 全B (2026-09-28): nothing keeps running on the removed member — both idle conversations are HELD (parked
    // off it on the member usable soonest, not armed: nothing was running), no restart, nothing handed to the client
    ck('r1 affected (全B): the removed member was the default and NOBODY can take over ⇒ the engine HOLDS both conversations (held 2, moved 0) — parked off the removed member', rn.code === 200 && rn.body.evicted.held === 2 && rn.body.evicted.stayed === 0 && rn.body.evicted.moved === 0 && wn.on('a-1') !== 'martin' && wn.on('a-2') !== 'martin', JSON.stringify({ e: rn.body.evicted, on: [wn.on('a-1'), wn.on('a-2')] }));
    ck('r1 affected: …and the answer hands the client NOTHING to restart (it was all three: cut off, onto a default nobody can serve from)', Array.isArray(rn.body.affected) && rn.body.affected.length === 0 && wn.asked.length === 0, JSON.stringify(rn.body.affected.map((x) => x.serverId)));
    ck('r1 affected (全B): …each conversation is told it waits, at the act (level warn) — never "keeps running"', ['a-1', 'a-2'].every((x) => wn.notices.some((n) => n.o && n.o.level === 'warn' && n.t === `Pool "全部": Martin Max was removed from the pool and no other member can take over — conversation "conv ${x}" waits: its next turn goes out when a member can serve it.`)) && !wn.notices.some((n) => /keep(s)? running/.test(n.t)), JSON.stringify(wn.notices.map((n) => n.t)));
    const wy = world({ hot: false, client: true }); wy.mk('a-1', 'martin'); wy.mk('a-3', 'fish'); wy.sessions.set('a-f', { backend: 'claude', mode: 'chat', host: null, _webuiId: 'a-f', claudeSessionId: 'cid-a-f', _accountId: wy.P, name: 'conv a-f', sockName: 'cw-a-f', createdAt: Date.now(), _spawnModel: 'claude-fable-5-1' }); // a-f = a FOLLOWER of the default (no link of its own)
    const ry = narrow(wy);
    ck('r1 affected: with a member to take over ⇒ the engine moves + restarts the conversation on the removed member ITSELF (asked once)', ry.body.evicted.moved === 1 && wy.on('a-1') !== 'martin' && wy.asked.filter((x) => x === 'a-1').length === 1, JSON.stringify({ e: ry.body.evicted, asked: wy.asked }));
    ck('r1 affected: …the answer hands over the default\'s FOLLOWER only — never the conversation on an untouched member of its own (a-3 on Fish), never the one the engine restarted', JSON.stringify(ry.body.affected.map((x) => x.serverId)) === '["a-f"]' && wy.on('a-3') === 'fish', JSON.stringify(ry.body.affected.map((x) => x.serverId)));
    // verify r2 (census adequacy): the `nobody` guard had no behavioural leg — the three conversations above all
    // hold links of their own, so reverting it left the suite green. A FOLLOWER of the default (no link of its
    // own) is exactly who it guards: nobody can take the default over, so nothing is restarted onto it.
    const wf = nobodyWorld();
    wf.sessions.set('a-f', { backend: 'claude', mode: 'chat', host: null, _webuiId: 'a-f', claudeSessionId: 'cid-a-f', _accountId: wf.P, name: 'conv a-f', sockName: 'cw-a-f', createdAt: Date.now(), _spawnModel: 'claude-fable-5-1' });
    const rf = narrow(wf);
    ck('r2 affected: nobody can take the default over ⇒ its FOLLOWER is not handed to the client for a restart either', rf.code === 200 && Array.isArray(rf.body.affected) && rf.body.affected.length === 0 && !wf.asked.includes('a-f'), JSON.stringify({ affected: rf.body.affected, asked: wf.asked }));
    // control: the list as it was (every conversation of the pool whenever the default moved)
    const rsrc = fs.readFileSync(path.resolve('src/server/account-usage-routes.js'), 'utf8');
    const a1 = 'if (engineDecided.has(sid) || ownLink(sid)) continue;', a2 = 'if (before !== after && !nobody) {';
    ck('r1 affected control: the patch (the two clauses removed) hits', rsrc.split(a1).length === 2 && rsrc.split(a2).length === 2);
    const oldRoutes = MA.load('src/server/account-usage-routes.js', rsrc.replace(a1, '').replace(a2, 'if (before !== after) {'), 'allaffected');
    const wo = nobodyWorld({ routesMod: oldRoutes });
    const ro = narrow(wo);
    ck('r1 affected control: unfiltered, the client is handed all three — the two the engine left in place AND the one on Fish (what verify r1 measured)', JSON.stringify(ro.body.affected.map((x) => x.serverId)) === '["a-1","a-2","a-3"]' && ro.body.evicted.held === 2, JSON.stringify(ro.body.affected.map((x) => x.serverId)));
  }
  // ── verify r1 (money): A PROCESS THAT HOLDS ITS MEMBER IS NOT RESTARTED ONTO ONE THAT CANNOT SERVE ────
  // A codex process holds its member for life; when that member leaves the pool the way off it is a
  // restart onto the pool default. With NOBODY able to take over the default sits on the store's first
  // member — and the conversation was restarted onto it: cut off from a member that serves, for one
  // that cannot (a linked claude conversation in the same state stays, and the pool says why).
  {
    const { mutantCopies } = await import('./mutant-copy.mjs');
    const MH = mutantCopies('poolpin-r1held', path.resolve('.'));
    const prevHome = process.env.CODEX_HOME;
    const cx = (engine, { bSpent, three = false }) => {
      const root = fs.mkdtempSync(path.join(scr, 'cxh-'));
      process.env.CODEX_HOME = path.join(root, 'codex-home'); fs.mkdirSync(process.env.CODEX_HOME, { recursive: true });
      const cam = new AccountManager({ dataDir: path.join(root, 'data') });
      const sub = (name) => { const { id } = cam.createCodexSubscription({ name }); fs.writeFileSync(path.join(cam.codexSubDir(id), 'auth.json'), JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: 'tok-' + name, id_token: 'x.e30.x' } })); return id; };
      const A = sub('Cx A'), B = sub('Cx B'), C = three ? sub('Cx C') : null;
      const CP = cam.createPool({ name: 'Cx', backend: 'codex', members: three ? [A, B, C] : [A, B] }).id; cam.setPoolTarget(CP, three ? B : A); // three: the DEFAULT sits on B, not on the member leaving
      const cacheDir = path.join(root, 'data', 'usage-cache'); fs.mkdirSync(cacheDir, { recursive: true });
      const nowS = Math.floor(Date.now() / 1000);
      const wrc = (id, u5) => fs.writeFileSync(path.join(cacheDir, id + '.json'), JSON.stringify({ fetchedAt: Date.now() - 1000, source: 'on-demand', fiveHour: { utilization: u5, resetsAt: nowS + 7200 }, sevenDay: { utilization: 0.2, resetsAt: nowS + 5 * 86400 } }));
      wrc(A, 0.1); wrc(B, bSpent ? 0.995 : 0.1); if (C) wrc(C, 0.1);
      const cs = new Map(), said = [], asked = [];
      cs.set('s-h', { backend: 'codex', mode: 'chat', host: null, _webuiId: 's-h', _accountId: CP, sockName: 'cw-h', name: 'held', _heldPoolMember: A, createdAt: Date.now(), backendSessionId: 'thr-h', cwd: root });
      const ceng = engine.create({ app: { get() { }, post() { }, put() { }, patch() { }, delete() { }, use() { }, locals: {} }, rootDir: root, USAGE_CACHE_DIR: cacheDir, activeSessions: cs,
        wss: { clients: new Set([{ readyState: 1, send: (p) => { try { const m = JSON.parse(p); if (m.type === 'pool-auto-switched') asked.push(...(m.affected || []).map((x) => x.serverId)); } catch { } } }]) }, WS_OPEN: 1, broadcastToSession() { }, serverNotice: (k, t) => said.push(t), serverSetting: () => undefined, getAccounts: () => cam,
        getHosts: () => ({ device: async () => ({ poolOrders: async () => { }, ackPoolOrdersLog() { } }) }), getUsageHistory: () => ({ _cost: () => 0, ingestRemoteEvents() { } }), recordUsageAttribution() { }, adapterRegistry: { get: () => ClaudeCodeAdapter }, getAutoResume: () => null, getOtelIngest: () => null, getQuotaProbe: () => null, getSessionMetaStore: () => null });
      const rts = {};
      const app = { get() { }, post: (p, h) => { rts['POST ' + p] = h; }, patch: (p, h) => { rts['PATCH ' + p] = h; }, put() { }, delete() { }, use() { }, locals: {} };
      require(path.resolve('src/server/account-usage-routes.js')).create({ app, rootDir: root, activeSessions: cs, auth: {}, engine: ceng, serverSetting: () => undefined, recordUsageAttribution() { }, liveAccountIdSet: () => new Set(), getAccounts: () => cam, broadcastActiveSessions() { }, getHosts: () => ({ list: () => [] }), getMounts: () => ({}), getTelemetry: () => ({}), getUsageHistory: () => ({}), getLoginExpiryWatch: () => null });
      const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
      const lines = quietly(() => rts['PATCH /api/accounts/pool/:id']({ params: { id: CP }, body: { members: three ? [B, C] : [B] }, headers: {}, query: {} }, res));
      return { res, asked, said, lines, cam, ceng, cs, A, B, C, CP, wrc };
    };
    const dead = cx(engMod, { bSpent: true });
    // the owner's 全B (2026-09-28) supersedes r1's "it stays on the member it holds": nothing keeps running on the removed
    // member — an idle process that HOLDS it is restarted ONCE onto the pool default, parked on the member usable soonest
    // (a resume, never a turn); the route hands the client nothing more
    ck('r1 held (全B): the held member leaves the pool and NOBODY can take over ⇒ the idle process is restarted ONCE onto the parked default (held 1) — it never keeps billing the removed member', dead.res.body.evicted.held === 1 && dead.res.body.evicted.stayed === 0 && JSON.stringify(dead.asked) === '["s-h"]' && dead.res.body.affected.length === 0 && dead.cam.poolCurrent(dead.CP) === dead.B, JSON.stringify({ e: dead.res.body.evicted, asked: dead.asked, affected: dead.res.body.affected }));
    ck('r1 held (全B): …it is told it waits (and restarts), and the journal names the hold', dead.said.some((t) => t === 'Pool "Cx": Cx A was removed from the pool and no other member can take over — conversation "held" waits: its next turn goes out when a member can serve it. Restarting the conversation to apply it.') && dead.lines.some((l) => /removed-member hold .*\/s-h: .* held by the process — restarting it onto/.test(l)), JSON.stringify(dead.said));
    dead.wrc(dead.B, 0.1);
    quietly(() => dead.ceng.sweepNonMemberLinks());
    ck('r1 held (全B): …and once a member CAN take over, the next sweep does not restart it a second time (asked once in all)', JSON.stringify(dead.asked) === '["s-h"]', JSON.stringify(dead.asked));
    const fine = cx(engMod, { bSpent: false });
    ck('r1 held: with a member to take over ⇒ restarted onto the default at the act (unchanged)', fine.res.body.evicted.moved === 1 && JSON.stringify(fine.asked) === '["s-h"]');
    // verify r2 (census adequacy): the second clause (a default that cannot serve THIS conversation while the verdict
    // names another member) had no behavioural leg. The default sits on B (spent), Cx C could take the conversation —
    // but the only way off a held member is a restart onto the DEFAULT: never onto B. The pool pass moves the spent
    // default (a hard wall) and the next sweep restarts the conversation there.
    const three = cx(engMod, { bSpent: true, three: true });
    ck('r2 held: the verdict names Cx C but the default is Cx B (spent) ⇒ NOT restarted onto B — it stays until the default can serve it', three.res.body.evicted.stayed === 1 && three.asked.length === 0 && three.res.body.affected.length === 0 && three.cam.poolCurrent(three.CP) === three.B, JSON.stringify({ e: three.res.body.evicted, asked: three.asked, def: three.cam.poolCurrent(three.CP) }));
    quietly(() => three.ceng.maybePoolAutoSwitchForPool(three.CP, { force: true })); quietly(() => three.ceng.sweepNonMemberLinks());
    ck('r2 held: …the pool pass moves the spent default to Cx C and the next sweep restarts the conversation onto it (asked once)', three.cam.poolCurrent(three.CP) === three.C && JSON.stringify(three.asked) === '["s-h"]', JSON.stringify({ def: three.cam.poolCurrent(three.CP), asked: three.asked }));
    const esrc = fs.readFileSync(path.resolve('src/server/usage-pool-engine.js'), 'utf8');
    const v1 = 'if (!dv || !dv.to) { stay(sid, s, on, dv); continue; }', v2 = 'if (dv.to !== to && !memberCanServe(poolId, to, s, sid, now)) { stay(sid, s, on, null); continue; }';
    ck('r1 held control: the patch (both clauses of the verdict removed from the held branch) hits', esrc.split(v1).length === 2 && esrc.split(v2).length === 2);
    // (under 全B the first clause is reached only by a verdict that is not the hold; the second is R5's leg above)
    const vh = "        if (dv && dv.reason === 'removed-hold') { const h = holdRemoved(poolId, sid, s, on, dv, now); if (h.held || h.deferred) out.held.push({ sid, on, to: h.to, deferred: h.deferred }); else out.stayed.push({ sid, on }); continue; } // 全B: stop and wait (a mid-turn one at its stop)\n";
    ck('r2 held control (全B): the patch (the hold removed from the held branch) hits', esrc.split(vh).length === 2);
    const was = cx(MH.load('src/server/usage-pool-engine.js', esrc.replace(vh, ''), 'noheld'), { bSpent: true });
    ck('r2 held control (全B): without the hold the process STAYS on the removed member (no restart) — it keeps billing it (r1\'s behaviour, the owner\'s A)', was.asked.length === 0 && was.res.body.evicted.stayed === 1, JSON.stringify({ asked: was.asked, e: was.res.body.evicted }));
    if (prevHome === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = prevHome;
  }
  // ── verify r1 (identity, forensics): ONE SPELLING OF A REMOVAL IN THE SLOT LEDGER ─────────────────────
  // The slot-transition row is what a later attribution question reads. The same act — a conversation
  // moved off a member the pool no longer lists — was written `removed-from-pool` by the route,
  // `not-a-member` by the stale-link sweep and `per-session-switch` when the per-session pass saw it first.
  {
    const whyOf = (w2, sid) => w2.am.slotTransitions.all().filter((x) => x.sessionId === sid && x.from === w2.id.martin && x.to !== w2.id.martin).map((x) => x.why);
    const stale = () => { const w2 = world({}); w2.mk('r-1', 'martin', { warm: true, inTurn: true }); w2.am.updatePool(w2.P, { members: [w2.id.uci, w2.id.fish] }); return w2; }; // the store narrowed with no engine beside it: a stale link
    const w1 = world({}); w1.mk('r-1', 'martin', { warm: true, inTurn: true });
    const turnSlot = w1.eng.readingSlotFor(w1.sessions.get('r-1'), Date.now(), {});
    quietly(() => w1.call('PATCH', '/api/accounts/pool/:id', { id: w1.P }, { members: [w1.id.uci, w1.id.fish] }));
    const w2 = stale(); quietly(() => w2.eng.sweepNonMemberLinks());
    const w3 = stale(); quietly(() => w3.eng.maybePoolAutoSwitchForPool(w3.P, { force: true }));
    ck('r1 why: the members route, the stale-link sweep and the per-session pass write the SAME row — why: removed-from-pool', [w1, w2, w3].every((x) => JSON.stringify(whyOf(x, 'r-1')) === '["removed-from-pool"]'), JSON.stringify([w1, w2, w3].map((x) => whyOf(x, 'r-1'))));
    ck('r1 why: …a MID-TURN conversation moved by it keeps its turn\'s reading slot on the member its requests went to (turn-pinned — the response in flight is the old member\'s)', (() => { const a = w1.eng.readingSlotFor(w1.sessions.get('r-1'), Date.now(), {}); return turnSlot.key === w1.id.martin && a.key === w1.id.martin && a.slotReason === 'turn-pinned' && w1.on('r-1') !== 'martin'; })());
    ck('r1 why: …an ordinary per-session move keeps its own spelling (per-session-switch)', w.am.slotTransitions.all().some((x) => x.why === 'per-session-switch'));
    // verify r2 (census adequacy): two of the three sites r1 re-spelled had no leg — reverting either left the
    // suite green. ① a PINNED conversation's escape off the removed member (the pass sees it first: the pin is
    // the escape's target) ② the pool DEFAULT moved off it by the pass (a narrowing the store could not act on:
    // every other member signed out at that moment, so the default stayed on the removed member)
    const w4 = stale(); w4.sessions.get('r-1')._poolPin = { memberId: w4.id.fish, at: Date.now(), by: 'user' };
    quietly(() => w4.eng.maybePoolAutoSwitchForPool(w4.P, { force: true }));
    ck('r2 why: a PINNED conversation escaping the removed member onto its pin writes the same row (why removed-from-pool)', w4.on('r-1') === 'fish' && JSON.stringify(whyOf(w4, 'r-1')) === '["removed-from-pool"]', JSON.stringify({ on: w4.on('r-1'), why: whyOf(w4, 'r-1') }));
    const w5 = world({});
    const credsOf = (k) => path.join(w5.am.subDir(w5.id[k]), '.credentials.json');
    const saved = ['uci', 'fish'].map((k) => [k, fs.readFileSync(credsOf(k), 'utf8')]);
    for (const [k] of saved) fs.unlinkSync(credsOf(k)); // nobody else signed in at the narrowing ⇒ the store has nowhere to put the default
    w5.am.updatePool(w5.P, { members: [w5.id.uci, w5.id.fish] });
    const defStayed = w5.am.poolCurrent(w5.P) === w5.id.martin;
    for (const [k, t] of saved) fs.writeFileSync(credsOf(k), t, { mode: 0o600 });
    quietly(() => w5.eng.maybePoolAutoSwitchForPool(w5.P, { force: true }));
    const defRows = w5.am.slotTransitions.all().filter((x) => !x.sessionId && x.from === w5.id.martin && x.to !== w5.id.martin).map((x) => x.why);
    ck('r2 why: the pool DEFAULT moved off the removed member by the pool pass writes the same row (why removed-from-pool)', defStayed && w5.am.poolCurrent(w5.P) !== w5.id.martin && JSON.stringify(defRows) === '["removed-from-pool"]', JSON.stringify({ defStayed, def: w5.am.poolCurrent(w5.P), defRows }));
  }
  // ── verify r1 (identity): A PIN ON A LOGIN THAT CANNOT SERVE ──────────────────────────────────────────
  // The pin never re-points onto a dead login, every reading keys on the member the conversation RUNS ON,
  // and the refusal names the login (a signed-out member is missing from the candidate list — the verdict
  // called it "unknown" and the words said "not usable in the pool right now").
  {
    const wl = world({});
    const sl = wl.mk('l-1', 'martin');
    fs.writeFileSync(path.join(wl.am.subDir(wl.id.fish), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: '', refreshToken: '', expiresAt: 0, refreshTokenExpiresAt: Date.now() - 3600e3, subscriptionType: 'max', scopes: ['user:inference'] } }), { mode: 0o600 }); // the logged-out shape: tokens wiped, the deadline kept
    quietly(() => { wl._p = wl.pin('l-1', 'fish'); });
    ck('r1 login: a pin on a login that cannot serve is ACCEPTED and not placed — the link never points at it; the reason names the login (pin-login-dead)', wl._p.code === 200 && wl._p.body.placed === false && wl._p.body.reason === 'pin-login-dead' && wl.on('l-1') === 'martin' && sl._poolPin.memberId === wl.id.fish, JSON.stringify(wl._p.body));
    const slot = wl.eng.readingSlotFor(sl, Date.now(), {});
    ck('r1 login: …every reading keys on the member it RUNS ON (Martin\'s slot), never on the pin', slot.key === wl.id.martin && slot.slotOk === true, JSON.stringify(slot));
    sl._turnReadingSlot = null;
    wl.eng._poolSwitchAt.clear(); wl.eng._poolAutoLast.clear();
    quietly(() => wl.eng.maybePoolAutoSwitchForPool(wl.P, { force: true }));
    ck('r1 login: …the pool pass leaves it where it runs (no return onto the dead login)', wl.on('l-1') === 'martin');
    ck('r1 login: …a resume starts it where the pool would (never on the pin)', wl.eng.poolChooserForModel(wl.P, { model: 'claude-fable-5-1', pin: wl.id.fish }) !== wl.id.fish);
    const { decidePinnedPlacement: dpl } = require(path.resolve('src/account-pool-auto.js'));
    const NOWS = Math.floor(Date.now() / 1000);
    const okc = { fetchedAt: Date.now(), fiveHour: { utilization: 0.1, resetsAt: NOWS + 7200 }, sevenDay: { utilization: 0.3, resetsAt: NOWS + 86400 } };
    const v = (o) => dpl({ pin: 'a', currentId: 'b', members: [{ id: 'b', name: 'B' }], membership: ['a', 'b'], readCache: () => okc, nowSec: NOWS, hot: true, proactive: true, ...o });
    ck('r1 login (PURE): listed by the pool, missing from the candidates, login cannot serve ⇒ pin-login-dead', ['logged-out', 'expired'].every((st) => v({ readLogin: (id) => (id === 'a' ? { state: st } : { state: 'ok', msLeft: 40 * 86400e3 }) }).pinWhy === 'pin-login-dead'));
    ck('r1 login (PURE): …missing from the candidates with a login that reads usable (auth-failing) / no login reader ⇒ pin-member-unknown', v({ readLogin: () => ({ state: 'ok', msLeft: 40 * 86400e3 }) }).pinWhy === 'pin-member-unknown' && v({}).pinWhy === 'pin-member-unknown');
    ck('r1 login (PURE): …not listed by the pool at all ⇒ pin-member-unknown, whatever its login', v({ membership: ['b'], readLogin: () => ({ state: 'logged-out' }) }).pinWhy === 'pin-member-unknown');
  }
  // ── verify r1 (authority): THE CENSUS OF POOL-LINK WRITERS ────────────────────────────────────────────
  // Every re-point of a pool link goes through accounts.js's two writers (setPoolTarget /
  // ensureSessionPoolLink → account-material's repointPoolSymlink); they are CALLED only by the store, the
  // engine and the owner's account routes — never by an agent-facing route — and each of the owner's
  // placement routes refuses an agent's token before it reads anything.
  {
    const { execFileSync } = require('node:child_process');
    const { gitEnvFrom } = await import('./git-env.mjs');
    const files = execFileSync('git', ['ls-files', 'src', 'server.js'], { encoding: 'utf8', cwd: path.resolve('.'), env: gitEnvFrom(process.env) }).split('\n').filter((f) => /\.js$/.test(f));
    const code = (f) => fs.readFileSync(path.resolve(f), 'utf8').split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '')).join('\n');
    const callers = (re) => files.filter((f) => re.test(code(f))).sort();
    // (the atomic symlink primitive has two callers that are NOT pool placement and predate this lane: the device's
    // sealed-orders reflex and the agent browser's pin link — the set is master's, the lane added no caller)
    ck('r1 census: the symlink primitive is called by the SAME files as before the lane — for a pool link, by the store alone', JSON.stringify(callers(/repointPoolSymlink\(/)) === JSON.stringify(['src/account-material.js', 'src/accounts.js', 'src/agentd/agentd.js', 'src/server/browser-env.js']) && !/symlinkSync\(|repointPoolSymlink\(/.test(code('src/server/usage-pool-engine.js') + code('src/server/account-usage-routes.js') + code('src/ws-create.js')), JSON.stringify(callers(/repointPoolSymlink\(/)));
    const writers = callers(/\.(setPoolTarget|ensureSessionPoolLink|updatePool)\(/);
    ck('r1 census: setPoolTarget / ensureSessionPoolLink / updatePool are CALLED by the store, the engine and the owner\'s account routes only (' + files.length + ' files read)', files.length > 300 && JSON.stringify(writers) === JSON.stringify(['src/accounts.js', 'src/server/account-usage-routes.js', 'src/server/usage-pool-engine.js']), JSON.stringify(writers));
    ck('r1 census: no agent-facing module names a pool writer, the pin writer, the removal or the gather plan', !/setPoolTarget|ensureSessionPoolLink|updatePool|setConversationPin|memberRemoved|gatherPlan/.test(code('src/agent-routes.js')));
    const routes = code('src/server/account-usage-routes.js');
    const fence = "if (isAgentBearer(req)) return res.status(403).json({ error: 'human-triggered only', code: 'agent_forbidden' });";
    const first = (head) => { const i = routes.indexOf(head); if (i < 0) return false; const body = routes.slice(i + head.length, i + head.length + 400); return body.indexOf(fence) >= 0 && !/accounts\.|engine\./.test(body.slice(0, body.indexOf(fence)).replace(/const id = req\.params\.id;/, '')); };
    ck('r1 census: the members/priority PATCH, the gather and the pin refuse an agent\'s token BEFORE they read anything; the retired target route answers 410 to everyone', first("app.patch('/api/accounts/pool/:id', (req, res) => {") && first("app.post('/api/accounts/pool/:id/gather', (req, res) => {") && first("app.post('/api/accounts/:poolId/pin', (req, res) => {") && /app\.post\('\/api\/accounts\/pool\/:id\/target', \(req, res\) => \{\n\s*res\.status\(410\)/.test(routes));
  }
  // ── verify r2 (the UNSTAGED-WIRING class): WHAT THE ACCOUNT ROUTES ASK THE ENGINE, server.js HANDS THEM ──
  // Every suite builds the account routes over the WHOLE engine, so a name missing from server.js's
  // `engine: {…}` literal is invisible to all of them — verify r2 reverted F4's `gatherPlan` out of that
  // literal and NOTHING went red, while production fell through to the unjudged move (now fail-closed as
  // well). The rule is DERIVED: every `engine.<name>` the routes read (the account routes + the reset-credit
  // routes they register) is a key of the literal server.js passes, and the pool engine exports it.
  {
    const strip = (t) => t.split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '')).join('\n');
    const readsOf = (t) => new Set([...strip(t).matchAll(/(?<![\w$.-])engine\??\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1])
      .concat([...strip(t).matchAll(/const \{([^}]*)\} = engine;/g)].flatMap((m) => m[1].split(',').map((x) => x.trim()).filter(Boolean))));
    const routeReads = new Set([...readsOf(fs.readFileSync(path.resolve('src/server/account-usage-routes.js'), 'utf8')), ...readsOf(fs.readFileSync(path.resolve('src/routes/reset-credit.js'), 'utf8'))]);
    const literalKeys = (srv) => {
      const i = srv.indexOf("require('./src/server/account-usage-routes.js').create({");
      const s0 = srv.indexOf('{', srv.indexOf('engine: {', i));
      let d = 0, body = '';
      for (let j = s0; j < srv.length; j++) { if (srv[j] === '{') d++; else if (srv[j] === '}') { d--; if (!d) { body = srv.slice(s0 + 1, j); break; } } }
      return new Set(strip(body).split(',').map((x) => x.trim()).filter((x) => /^[A-Za-z_$][\w$]*$/.test(x)));
    };
    const srv = fs.readFileSync(path.resolve('server.js'), 'utf8');
    const lit = literalKeys(srv);
    // NO EXEMPTION (2026-09-29, owner "好" = A): the census's one exemption was `onMemberLoginSuccess` — the
    // login-edge member wake the routes read since 2026-09-08 and server.js never passed (dead in production). It
    // is wired now (one usage read + one pool re-decision per login), so the census fails if it is ever unwired
    // again; test-new-member-wake §6b drives the login through server.js's own literal (behaviour, not only a name).
    const EXEMPT = {};
    ck(`r2 wiring: the account routes' engine reads are read off the code (${routeReads.size}: ${[...routeReads].sort().join(', ')})`, routeReads.size >= 8 && ['gatherPlan', 'memberRemoved', 'decideDefaultTarget', 'setConversationPin'].every((n) => routeReads.has(n)));
    const missing = [...routeReads].filter((n) => !lit.has(n) && !EXEMPT[n]);
    ck('r2 wiring: CENSUS — every engine function the account routes ask for is in the `engine: {…}` literal server.js passes them', missing.length === 0, JSON.stringify({ missing, literal: [...lit] }));
    ck('r2 wiring: …with NO exemption — the login re-check (onMemberLoginSuccess) is read by the routes and passed by server.js', Object.keys(EXEMPT).length === 0 && routeReads.has('onMemberLoginSuccess') && lit.has('onMemberLoginSuccess'), JSON.stringify({ exempt: Object.keys(EXEMPT), read: routeReads.has('onMemberLoginSuccess'), passed: lit.has('onMemberLoginSuccess') }));
    const engSrc = strip(fs.readFileSync(path.resolve('src/server/usage-pool-engine.js'), 'utf8'));
    const ret = engSrc.slice(engSrc.lastIndexOf('  return {'));
    const notExported = [...lit].filter((n) => ['gatherPlan', 'memberRemoved', 'decideDefaultTarget', 'setConversationPin', 'maybePoolAutoSwitchForPool', 'claimColdRestarts', 'onMemberLoginSuccess'].includes(n) && !new RegExp(`\\b${n}\\b`).test(ret));
    ck('r2 wiring: …and the pool engine exports the placement functions the literal names', notExported.length === 0, JSON.stringify(notExported));
    const srvDestructure = strip(srv.slice(0, srv.indexOf("require('./src/server/usage-pool-engine.js').create({")));
    const undestructured = ['gatherPlan', 'memberRemoved', 'decideDefaultTarget', 'setConversationPin', 'onMemberLoginSuccess'].filter((n) => !new RegExp(`\\b${n}\\b`).test(srvDestructure.slice(srvDestructure.lastIndexOf('const {'))));
    ck('r2 wiring: …and server.js destructures them from the engine (a literal name nobody bound is a free identifier)', undestructured.length === 0, JSON.stringify(undestructured));
    // NEGATIVE CONTROL: the literal as verify r2's revert left it (gatherPlan out) — the census names it
    const cut = srv.replace('maybePoolAutoSwitchForPool, setConversationPin, gatherPlan, onMemberLoginSuccess }, //', 'maybePoolAutoSwitchForPool, setConversationPin, onMemberLoginSuccess }, //');
    ck('r2 wiring control: the patch (gatherPlan out of the literal) hits', cut !== srv);
    ck('r2 wiring control: …and the census names exactly the missing name', JSON.stringify([...routeReads].filter((n) => !literalKeys(cut).has(n) && !EXEMPT[n])) === '["gatherPlan"]');
    // …and the literal as master left it (the login re-check never passed, 2026-09-08 → 2026-09-29): named too
    const cutLogin = srv.replace('maybePoolAutoSwitchForPool, setConversationPin, gatherPlan, onMemberLoginSuccess }, //', 'maybePoolAutoSwitchForPool, setConversationPin, gatherPlan }, //');
    ck('r2 wiring control: master\'s literal (onMemberLoginSuccess not passed) — the patch hits and the census names exactly it', cutLogin !== srv && JSON.stringify([...routeReads].filter((n) => !literalKeys(cutLogin).has(n) && !EXEMPT[n])) === '["onMemberLoginSuccess"]');
  }
  // ── verify r1 (authority): THE PIN A RESUME CARRIES IS JUDGED FOR THE POOL THE SPAWN BILLS ───────────
  // The accept lines asked the CLAUDE default account for every backend — a codex conversation on the
  // default codex pool lost its pin at the resume, the one moment a codex pin can apply — and a pin made
  // on one pool followed the conversation onto any other pool that lists the same member.
  {
    const { resumePoolPin } = require(path.resolve('src/ws-create.js'));
    const { mutantCopies } = await import('./mutant-copy.mjs');
    const prevHome = process.env.CODEX_HOME;
    const root = fs.mkdtempSync(path.join(scr, 'rp-'));
    process.env.CODEX_HOME = path.join(root, 'codex-home'); fs.mkdirSync(process.env.CODEX_HOME, { recursive: true });
    const ram = new AccountManager({ dataDir: path.join(root, 'data') });
    const A = ram.createSubscription({ name: 'A' }).id, B = ram.createSubscription({ name: 'B' }).id, Z = ram.createSubscription({ name: 'Z' }).id;
    for (const x of [A, B, Z]) fs.writeFileSync(path.join(ram.subDir(x), '.credentials.json'), CREDS(x), { mode: 0o600 });
    const P1 = ram.createPool({ name: '全部', members: [A, B] }).id, P2 = ram.createPool({ name: '工作', members: [A, B] }).id;
    ram._state.defaultAccountId = P1;
    const cxs = (n) => { const { id } = ram.createCodexSubscription({ name: n }); fs.writeFileSync(path.join(ram.codexSubDir(id), 'auth.json'), JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: 't', id_token: 'x.e30.x' } })); return id; };
    const XA = cxs('Cx A'), XB = cxs('Cx B');
    const CP = ram.createPool({ name: 'Cx', backend: 'codex' }).id;
    ram._state.defaultCodexAccountId = CP;
    const rp = (data, backend = 'claude') => resumePoolPin(data, ram, backend);
    const got = (r, pool, member) => !!r && r.poolId === pool && r.pin.memberId === member && r.pin.by === 'user';
    ck('r1 resume: a claude resume on the default pool carries its pin (the pool it bills, the member it lists)', got(rp({ poolPin: { memberId: B, at: 5, poolId: P1 } }), P1, B) && rp({ poolPin: { memberId: B, at: 5, poolId: P1 } }).pin.at === 5);
    ck('r1 resume: a CODEX resume on the default codex pool carries its pin — the pool is resolved per backend, as the spawn resolves it', got(rp({ poolPin: { memberId: XB, at: 5, poolId: CP } }, 'codex'), CP, XB) && ram.resolveForSpawn(undefined, 'codex', {}).id === CP);
    ck('r1 resume: …and named explicitly too', got(rp({ accountId: CP, poolPin: { memberId: XB, at: 5 } }, 'codex'), CP, XB));
    ck('r1 resume: a pin MADE ON ANOTHER POOL is no pin here (the conversation was switched to 工作: nobody pinned it there)', rp({ accountId: P2, poolPin: { memberId: B, at: 5, poolId: P1 } }) === null);
    ck('r1 resume: a carrier from before the pool was named (no poolId) is judged by membership, as it was', got(rp({ accountId: P2, poolPin: { memberId: B, at: 5 } }), P2, B));
    ck('r1 resume: a FORK, a REMOTE conversation, a member the pool does not list, a non-pool account, the CLI\'s own login, a malformed pin ⇒ no pin', [
      rp({ fork: true, poolPin: { memberId: B, poolId: P1 } }), rp({ hostId: 'h1', poolPin: { memberId: B, poolId: P1 } }), rp({ poolPin: { memberId: Z } }),
      rp({ accountId: A, poolPin: { memberId: B } }), rp({ accountId: 'subscription', poolPin: { memberId: B } }), rp({ poolPin: { memberId: '' } }), rp({ poolPin: 'x' }), rp({}), rp(null),
    ].every((x) => x === null));
    // verify r2 (authority): a pin that NAMES its pool is kept across a resume while its member is out of the pool — a
    // LIVE conversation keeps it (pin-member-unknown: placed automatically, back when the member is re-added), and the
    // resume used to drop it from the session while the client's carrier still held it
    const P3 = ram.createPool({ name: '三', members: [A, B] }).id;
    ram.updatePool(P3, { members: [A] }); // B leaves while the conversation is stopped
    ck('r2 resume: a pin NAMING its pool is kept while its member is out of the pool (as a live conversation keeps it)', got(rp({ accountId: P3, poolPin: { memberId: B, at: 5, poolId: P3 } }), P3, B));
    ck('r2 resume: …a carrier that names no pool still needs a member the pool lists', rp({ accountId: P3, poolPin: { memberId: B, at: 5 } }) === null);
    ram.updatePool(P3, { members: [A, B] });
    ck('r2 resume: …and with the member back the same carrier pins as it always did', got(rp({ accountId: P3, poolPin: { memberId: B, at: 5, poolId: P3 } }), P3, B));
    // control: the accept lines as they were (the claude default for every backend, no pool on the pin)
    const wsrc = fs.readFileSync(path.resolve('src/ws-create.js'), 'utf8');
    const l1 = "const poolId = data.accountId || (backend === 'codex' ? st.defaultCodexAccountId : st.defaultAccountId) || null;", l2 = "if (typeof p.poolId === 'string' && p.poolId && p.poolId !== poolId) return null;";
    ck('r1 resume control: the patch (the two clauses as they were) hits', wsrc.split(l1).length === 2 && wsrc.split(l2).length === 2);
    const MRP = mutantCopies('poolpin-r1resume', path.resolve('.'));
    const old = MRP.load('src/ws-create.js', wsrc.replace(l1, 'const poolId = data.accountId || st.defaultAccountId || null;').replace(l2, ''), 'claudedefault');
    ck('r1 resume control: as it was, the codex pin on the default pool is DROPPED and the pin made on 全部 is accepted on 工作 (what verify r1 measured)', old.resumePoolPin({ poolPin: { memberId: XB, at: 5, poolId: CP } }, ram, 'codex') === null && got(old.resumePoolPin({ accountId: P2, poolPin: { memberId: B, at: 5, poolId: P1 } }, ram, 'claude'), P2, B));
    // the client's carrier names the pool
    const sl2 = fs.readFileSync(path.resolve('src/lib/session-lifecycle.js'), 'utf8').split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '')).join('\n');
    ck('WIRING PIN: the billing submenu saves the pin WITH the pool it was made on (both the live and the stopped path), the resume sends it', (sl2.match(/poolId: a\.id \}/g) || []).length === 2 && /\.\.\.\(poolPin\.poolId \? \{ poolId: poolPin\.poolId \} : \{\}\)/.test(sl2));
    // verify r2 (census adequacy): the chooser call RE-DERIVED the pool (`data._poolPinPool || data.accountId ||
    // <claude default>`) — reverting it to the pre-r1 claude default left the suite green, and a codex pin on the
    // default pool was then asked of the CLAUDE pool at the one moment it can apply. The store now hands the chooser
    // the pool IT resolved; the REAL arrow from ws-create is evaluated verbatim under the REAL resolveForSpawn.
    const arrowRe = /chooseMember: (\([^)]*\) => poolChooser\?\.\(.*\)),$/m;
    const arrowTxt = (arrowRe.exec(fs.readFileSync(path.resolve('src/ws-create.js'), 'utf8')) || [])[1] || null;
    ck('r2 chooser: the chooser arrow is read off ws-create (it takes the pool the store resolved)', !!arrowTxt && /^\(poolId, how = \{\}\) => poolChooser\?\.\(poolId, /.test(arrowTxt), arrowTxt);
    const seen = [];
    const stub = (poolId, o = {}) => { seen.push(poolId); return poolId === CP ? o.pin || null : poolId === P1 ? B : null; };
    const chooser = (txt, data) => new Function('poolChooser', 'data', 'accounts', 'return ' + txt)(stub, data, ram);
    const cxData = { model: 'gpt-5.5', _poolPin: { memberId: XB, at: 5, by: 'user' } };
    const cxSpawn = ram.resolveForSpawn(undefined, 'codex', { pinned: true, chooseMember: chooser(arrowTxt, cxData) });
    ck('r2 chooser: a pinned CODEX resume on the default codex pool asks the chooser about THAT pool — and spawns onto its pinned member', JSON.stringify(seen) === JSON.stringify([CP]) && cxSpawn.pinnedMember === XB, JSON.stringify({ seen, pinned: cxSpawn.pinnedMember }));
    seen.length = 0;
    const clSpawn = ram.resolveForSpawn(undefined, 'claude', { sessionKey: 'r2-choose', chooseMember: chooser(arrowTxt, { model: 'claude-fable-5-1' }) });
    ck('r2 chooser: …a claude spawn on the default pool asks about the claude default (its own link born on the chooser\'s pick)', JSON.stringify(seen) === JSON.stringify([P1]) && ram.poolCurrentFor(P1, 'r2-choose') === B && clSpawn.id === P1, JSON.stringify({ seen, on: ram.poolCurrentFor(P1, 'r2-choose') }));
    // control: the call as it was before verify r1 (the claude default for every backend) — the pin is asked of the wrong pool
    seen.length = 0;
    const was = ram.resolveForSpawn(undefined, 'codex', { pinned: true, chooseMember: chooser('() => poolChooser?.(data.accountId || accounts?._state?.defaultAccountId, { model: data.model || null, ...(data._poolPin ? { pin: data._poolPin.memberId } : {}) })', cxData) });
    ck('r2 chooser control: re-derived as it was, the codex pin is asked of the CLAUDE default and silently dropped at the spawn', JSON.stringify(seen) === JSON.stringify([P1]) && !was.pinnedMember, JSON.stringify({ seen, pinned: was.pinnedMember }));
    // verify r2 (authority): the store's SELF-HEAL (the pool default's login is dead) places the POOL default through the
    // same chooser — a pinned resume re-pointed the whole pool's default onto ITS pin (new conversations, every follower)
    const sh = (pinned, arrow = arrowTxt) => {
      const root2 = fs.mkdtempSync(path.join(scr, 'sh-'));
      const am2 = new AccountManager({ dataDir: path.join(root2, 'data') });
      const [a2, b2, c2] = ['A', 'B', 'C'].map((n) => { const id = am2.createSubscription({ name: n }).id; fs.writeFileSync(path.join(am2.subDir(id), '.credentials.json'), CREDS(id), { mode: 0o600 }); return id; });
      const P = am2.createPool({ name: 'sh', members: [a2, b2, c2] }).id; am2.setPoolTarget(P, a2);
      fs.writeFileSync(path.join(am2.subDir(a2), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: '', refreshToken: '', expiresAt: null } }), { mode: 0o600 }); // the default signs out
      const poolPick = c2; // what the pool decides for its default (a stub of the engine's decision)
      const stub2 = (poolId, o = {}) => (o.pin ? o.pin : poolPick);
      const f = new Function('poolChooser', 'data', 'accounts', 'return ' + arrow)(stub2, { model: 'claude-fable-5-1', ...(pinned ? { _poolPin: { memberId: b2, at: 5, by: 'user' } } : {}) }, am2);
      quietly(() => am2.resolveForSpawn(P, 'claude', { sessionKey: 'sh-1', chooseMember: f }));
      return { def: am2.poolCurrent(P), link: am2.poolCurrentFor(P, 'sh-1'), b2, c2 };
    };
    const shp = sh(true), shu = sh(false);
    ck('r2 self-heal: a PINNED resume while the default is signed out ⇒ the pool DEFAULT goes where the pool decides (C), the conversation onto its pin (B)', shp.def === shp.c2 && shp.link === shp.b2, JSON.stringify(shp));
    ck('r2 self-heal: …an unpinned one: both where the pool decides (unchanged)', shu.def === shu.c2 && shu.link === shu.c2, JSON.stringify(shu));
    const shc = sh(true, '(poolId) => poolChooser?.(poolId, { model: data.model || null, ...(data._poolPin ? { pin: data._poolPin.memberId } : {}) })');
    ck('r2 self-heal control: a chooser that hands the pin to every question (as r1 left it) re-points the POOL default onto the pin (B)', shc.def === shc.b2, JSON.stringify(shc));
    if (prevHome === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = prevHome;
  }
  // ── verify r1 (identity): A NEW CONVERSATION NEVER STARTS ON A MEMBER THE POOL NO LONGER LISTS ────────
  // The spawn chooser decides from the pool DEFAULT, and it was the one decision site the membership fact
  // did not reach: while the default still named a removed member (a boot before the first stale-link
  // sweep; a narrowing made while nobody else was signed in) a new conversation started on it.
  {
    const { mutantCopies } = await import('./mutant-copy.mjs');
    const MS = mutantCopies('poolpin-r1spawn', path.resolve('.'));
    const staleWorld = (engine) => {
      const w2 = world({ engine });
      const creds = (k) => path.join(w2.am.subDir(w2.id[k]), '.credentials.json');
      const keep = { uci: fs.readFileSync(creds('uci')), fish: fs.readFileSync(creds('fish')) };
      fs.unlinkSync(creds('uci')); fs.unlinkSync(creds('fish'));
      quietly(() => w2.am.updatePool(w2.P, { members: [w2.id.uci, w2.id.fish] })); // nobody to fall to: the default stays on Martin
      fs.writeFileSync(creds('uci'), keep.uci, { mode: 0o600 }); fs.writeFileSync(creds('fish'), keep.fish, { mode: 0o600 });
      return w2;
    };
    const ws = staleWorld(engMod);
    ck('r1 spawn: (the state) the default still names Martin, the pool no longer lists it', ws.am.poolCurrent(ws.P) === ws.id.martin && !ws.am.poolMembership(ws.P).includes(ws.id.martin));
    const where = (w2, model) => { let r; quietly(() => { r = w2.eng.poolChooserForModel(w2.P, { model }); }); return Object.keys(w2.id).find((k) => w2.id[k] === r) || r; };
    ck('r1 spawn: a new conversation is placed on a member the pool LISTS — with a model family and without one', where(ws, 'claude-fable-5-1') !== 'martin' && where(ws, null) !== 'martin' && ws.am.poolMembership(ws.P).includes(ws.id[where(ws, null)]), [where(ws, 'claude-fable-5-1'), where(ws, null)]);
    // verify r2: …and by the pool's VERDICT (EDF: Fish, whose week resets sooner) — the default's fallback (usable soonest,
    // then list order: UCI) is only for when nobody can serve; a verdict without the membership fact would land there
    ck('r2 spawn: the stale default is decided by the pool VERDICT (Fish by EDF), with a family and without one — not by the nobody-can-serve fallback (UCI)', where(ws, 'claude-fable-5-1') === 'fish' && where(ws, null) === 'fish', [where(ws, 'claude-fable-5-1'), where(ws, null)]);
    quietly(() => ws.am.resolveForSpawn(ws.P, 'claude', { sessionKey: 'n-1', chooseMember: () => ws.eng.poolChooserForModel(ws.P, { model: 'claude-fable-5-1' }) }));
    ck('r1 spawn: …its own link is born there (resolveForSpawn)', ws.on('n-1') !== 'martin', ws.on('n-1'));
    const wm = world({});
    ck('r1 spawn: a default the pool lists is answered exactly as before (no family ⇒ the default itself)', where(wm, null) === 'martin' && where(wm, 'claude-fable-5-1') === 'martin');
    const esrc = fs.readFileSync(path.resolve('src/server/usage-pool-engine.js'), 'utf8');
    const c1 = 'if (!fam && !staleDefault) return cur;', c2 = 'readLogin: poolReadLogin(), membership, priority: poolPriorityOf(a), reserveFloorPct: reserveFloorPct(), overageIds: overageMemberIds(mem), creditsIds: creditsMemberIds(mem) });';
    ck('r1 spawn control: the patch (the chooser without the membership fact) hits', esrc.split(c1).length === 2 && esrc.split(c2).length === 2);
    const c3 = 'return (d && d.to) || (staleDefault ? ((d && d.holdTo) || fallbackDefaultTarget(poolId, cur) || null) : cur);'; // verify r2's fallback: stripped too (the chooser as r1 found it)
    ck('r1 spawn control: …and the r2 fallback clause hits', esrc.split(c3).length === 2);
    const wo = staleWorld(MS.load('src/server/usage-pool-engine.js', esrc.replace(c1, 'if (!fam) return cur;').replace(c2, c2.replace(' membership,', '')).replace(c3, 'return (d && d.to) || cur;'), 'nomembership'));
    ck('r1 spawn control: without it the new conversation starts on the REMOVED member (what verify r1 measured)', where(wo, 'claude-fable-5-1') === 'martin' && where(wo, null) === 'martin');
  }
  // ── verify r2 (identity, words): WHAT A PINNED CONVERSATION IS TOLD WHEN THE AUTOMATIC RULES MOVE IT ──────────
  // Two sentences made a false claim about the pinned member: a pin that is over its hard bar but not yet SETTLED
  // (usable, just not recovered enough to be returned to) was told "is out of quota"; and when nobody settled and the
  // automatic rules picked the member with the most headroom — the pin itself — it read "Fish Max is out of quota —
  // running on Fish Max until it resets (pin kept)".
  {
    const said = (w2, sid) => w2.notices.map((n) => n.t).filter((t) => t.includes(`"conv ${sid}"`));
    const wr1 = world({}); const p1 = wr1.mk('w-1', 'martin'); p1._poolPin = { memberId: wr1.id.fish, at: Date.now(), by: 'user' };
    wr1.wr('martin', 0.95, 0.3, 2 * 86400, { fiveHour: { utilization: 0.93, resetsAt: Math.floor(Date.now() / 1000) + 7200 } }); wr1.wr('fish', 0.92, 0.4, 4 * 86400); wr1.wr('uci', 0.1, 0.2, 5 * 86400);
    quietly(() => wr1.eng.maybePoolAutoSwitchForPool(wr1.P, { force: true }));
    ck('r2 words: a pin over its hard bar but not yet settled (Fish 5h 8 %) is never called "out of quota" — "has not got enough quota back yet"', wr1.on('w-1') === 'uci' && JSON.stringify(said(wr1, 'w-1')) === JSON.stringify(['Pool "全部": conversation "conv w-1" — Fish Max has not got enough quota back yet — running on UCI Max for now (pin kept).']));
    const wr2 = world({}); const p2 = wr2.mk('w-2', 'martin'); p2._poolPin = { memberId: wr2.id.fish, at: Date.now(), by: 'user' };
    wr2.wr('martin', 0.99, 0.3, 2 * 86400); wr2.wr('fish', 0.92, 0.4, 4 * 86400); wr2.wr('uci', 0.94, 0.2, 5 * 86400);
    const l2 = quietly(() => wr2.eng.maybePoolAutoSwitchForPool(wr2.P, { force: true }));
    ck('r2 words: when the automatic rules land it ON its pin (nobody settles, the pin has the most headroom) it is told it is back on it — never "Fish Max is out of quota — running on Fish Max"', wr2.on('w-2') === 'fish' && JSON.stringify(said(wr2, 'w-2')) === JSON.stringify(['Pool "全部": conversation "conv w-2" is back on Fish Max (pinned).']) && l2.some((l) => / — onto its pin \(pinned\)$/.test(l)));
    const zhD = (await import('../src/lib/i18n-zh.js')).default, jaD = (await import('../src/lib/i18n-ja.js')).default;
    const k = 'Pool "{pool}": conversation "{title}" — {member} has not got enough quota back yet — running on {target} for now (pin kept).';
    ck('r2 words: …in zh / ja too', !!zhD[k] && !!jaD[k] && !/额度用完|上限に達しました/.test(zhD[k] + jaD[k]));
  }
  // ── verify r2 (residual of the removed-member wall): WHEN NOBODY CAN TAKE THE DEFAULT OVER ─────────────────
  // The two ways a removal reaches the default disagreed: the members route left it on the store's list[0] (not a
  // decision), the stale-link sweep left it ON THE REMOVED MEMBER — and a new conversation started there. Now both ask
  // the engine: the default names a member the pool LISTS, the one usable soonest (PURE soonestUsableMember).
  {
    const { soonestUsableMember } = require(path.resolve('src/account-pool-auto.js'));
    const N = 1800000000;
    const c5 = (u, r) => ({ fiveHour: { utilization: u, resetsAt: N + r }, sevenDay: { utilization: 0.3, resetsAt: N + 5 * 86400 } });
    const C = { u: c5(0.99, 7200), f: c5(0.99, 600), n: null, ok: c5(0.1, 7200), dead: { fiveHour: { utilization: 0.99, resetsAt: 0 }, sevenDay: { utilization: 0.3, resetsAt: N + 86400 } } };
    const pick = (ids, o = {}) => soonestUsableMember({ members: ids.map((id) => ({ id })), readCache: (id) => C[id], nowSec: N, ...o });
    ck('r2 default (PURE): the member usable SOONEST by the hard bars — not the list\'s first (UCI 2 h, Fish 10 min ⇒ Fish)', pick(['u', 'f']) === 'f');
    ck('r2 default (PURE): a member that reads usable, or has no reading, is usable NOW', pick(['u', 'n']) === 'n' && pick(['f', 'ok']) === 'ok');
    ck('r2 default (PURE): a spent member with no stated reset comes last; ties go to the owner\'s priority order, then the list', pick(['dead', 'u']) === 'u' && pick(['ok', 'n'], { priority: ['n'] }) === 'n' && pick(['ok', 'n']) === 'ok');
    ck('r2 default (PURE): a usage-credits member only after every other; nobody ⇒ null', pick(['f', 'u'], { creditsIds: ['f'] }) === 'u' && pick([]) === null);
    const nowS = Math.floor(Date.now() / 1000);
    const spentWorld = (eng = engMod) => { const w2 = world({ engine: eng }); w2.mk('d-1', 'martin'); w2.wr('uci', 0.99, 0.2, 5 * 86400); w2.wr('fish', 0.99, 0.4, 4 * 86400, { fiveHour: { utilization: 0.99, resetsAt: nowS + 600 } }); return w2; };
    const nm = (w2, id) => Object.keys(w2.id).find((k) => w2.id[k] === id) || String(id);
    const viaRoute = (w2) => { quietly(() => w2.call('PATCH', '/api/accounts/pool/:id', { id: w2.P }, { members: [w2.id.uci, w2.id.fish] })); return w2; };
    const viaSweep = (w2) => {
      const cp = (k) => path.join(w2.am.subDir(w2.id[k]), '.credentials.json');
      const keep = ['uci', 'fish'].map((k) => [k, fs.readFileSync(cp(k), 'utf8')]);
      for (const [k] of keep) fs.unlinkSync(cp(k));
      w2.am.updatePool(w2.P, { members: [w2.id.uci, w2.id.fish] }); // the store has nowhere to put it: the default stays on Martin
      for (const [k, t] of keep) fs.writeFileSync(cp(k), t, { mode: 0o600 });
      quietly(() => w2.eng.sweepNonMemberLinks());
      return w2;
    };
    const newConv = (w2) => { let r; quietly(() => { r = w2.eng.poolChooserForModel(w2.P, { model: 'claude-fable-5-1' }); }); return nm(w2, r); };
    for (const [label, via] of [['the members route', viaRoute], ['the stale-link sweep', viaSweep]]) {
      const w2 = via(spentWorld());
      ck(`r2 default: ${label} — nobody can take the default over ⇒ it goes to the member usable SOONEST (Fish, 10 min), never list[0] (UCI) nor the removed member`, nm(w2, w2.am.poolCurrent(w2.P)) === 'fish', nm(w2, w2.am.poolCurrent(w2.P)));
      ck(`r2 default: ${label} — …a NEW conversation starts there (a member the pool lists), and (全B) the idle conversation on the removed member is HELD there too — parked, not armed`, newConv(w2) === 'fish' && w2.on('d-1') === 'fish' && !w2.fires.length, [newConv(w2), w2.on('d-1')]);
    }
    // …and BEFORE any sweep (a boot: the default still names the removed member) with nobody able to serve, a new
    // conversation is placed by the verdict's own parking member (holdTo — Fish, 10 min), never on the removed member
    const boot = (() => {
      const w2 = spentWorld();
      const cp = (k) => path.join(w2.am.subDir(w2.id[k]), '.credentials.json');
      const keep = ['uci', 'fish'].map((k) => [k, fs.readFileSync(cp(k), 'utf8')]);
      for (const [k] of keep) fs.unlinkSync(cp(k));
      w2.am.updatePool(w2.P, { members: [w2.id.uci, w2.id.fish] });
      for (const [k, t] of keep) fs.writeFileSync(cp(k), t, { mode: 0o600 });
      return w2;
    })();
    ck('r2 default: a boot before the first sweep (the default still names the removed member), nobody can serve ⇒ a new conversation is placed on the parking member (Fish), never on the removed one', nm(boot, boot.am.poolCurrent(boot.P)) === 'martin' && newConv(boot) === 'fish', [nm(boot, boot.am.poolCurrent(boot.P)), newConv(boot)]);
    // …and the POOL PASS reaching that boot state first (a wake, a stop — before any sweep) parks the DEFAULT too (全B):
    // nothing keeps serving on the removed member, the default included; its idle conversation is parked, not armed
    boot.eng._poolAutoLast.clear(); boot.eng._poolSwitchAt.clear();
    quietly(() => boot.eng.maybePoolAutoSwitchForPool(boot.P, { force: true }));
    ck('r2 default (全B): the pool pass on that boot state parks the DEFAULT on the parking member (Fish) and the idle conversation with it — nothing left on the removed member', nm(boot, boot.am.poolCurrent(boot.P)) === 'fish' && boot.on('d-1') === 'fish' && !boot.fires.length, [nm(boot, boot.am.poolCurrent(boot.P)), boot.on('d-1')]);
    // control: the engine and route without the fallback (as verify r1 left them) — the two paths disagree and the sweep starts new conversations on the removed member
    const esrc2 = fs.readFileSync(path.resolve('src/server/usage-pool-engine.js'), 'utf8');
    const e1 = 'const fb = fallbackDefaultTarget(poolId, def);', e2 = 'return (d && d.to) || (staleDefault ? ((d && d.holdTo) || fallbackDefaultTarget(poolId, cur) || null) : cur);';
    ck('r2 default control: the patch (the engine\'s fallback removed) hits', esrc2.split(e1).length === 2 && esrc2.split(e2).length === 2);
    const { mutantCopies: mcD } = await import('./mutant-copy.mjs');
    const MD = mcD('poolpin-r2default', path.resolve('.'));
    const noFb = MD.load('src/server/usage-pool-engine.js', esrc2.replace(e1, 'const fb = null;').replace(e2, 'return (d && d.to) || cur;').replace('memberRemoved, decideDefaultTarget, fallbackDefaultTarget,', 'memberRemoved, decideDefaultTarget,'), 'nofallback');
    const cr = viaRoute(spentWorld(noFb)), cs = viaSweep(spentWorld(noFb));
    ck('r2 default control: without it the route lands on list[0] (UCI) and the sweep leaves the default on the REMOVED member, where a new conversation starts', nm(cr, cr.am.poolCurrent(cr.P)) === 'uci' && nm(cs, cs.am.poolCurrent(cs.P)) === 'martin' && newConv(cs) === 'martin', [nm(cr, cr.am.poolCurrent(cr.P)), nm(cs, cs.am.poolCurrent(cs.P)), newConv(cs)]);
  }
  // ── the owner's 全B (2026-09-28): A NEW CONVERSATION NEVER STARTS ON A REMOVED MEMBER — refused by name with nowhere else ──
  // The store places a new conversation's link (resolveForSpawn). A default that still names a member the pool no longer
  // lists (a removal the engine has not acted on, a boot before its first sweep) is never where a conversation starts:
  // the pool's own choice for its default, else the first signed-in member it lists — and with none signed in the
  // placement is REFUSED with the removal's own sentence (the removed member may serve nothing).
  {
    const { mutantCopies: mcN } = await import('./mutant-copy.mjs');
    const MN = mcN('poolpin-r2newconv', path.resolve('.'));
    const mkStore = (Mgr) => {
      const root2 = fs.mkdtempSync(path.join(scr, 'nc-'));
      const am2 = new Mgr({ dataDir: path.join(root2, 'data') });
      const ids = ['A', 'B', 'C'].map((n) => { const id = am2.createSubscription({ name: n }).id; fs.writeFileSync(path.join(am2.subDir(id), '.credentials.json'), CREDS(id), { mode: 0o600 }); return id; });
      const P = am2.createPool({ name: 'nc', members: ids }).id; am2.setPoolTarget(P, ids[0]);
      const cp = (id) => path.join(am2.subDir(id), '.credentials.json');
      const keep = ids.slice(1).map((id) => [id, fs.readFileSync(cp(id), 'utf8')]);
      for (const [id] of keep) fs.unlinkSync(cp(id));
      am2.updatePool(P, { members: ids.slice(1) }); // nobody else signed in: the store leaves the default on A (removed)
      return { am2, P, ids, cp, keep };
    };
    const n1 = mkStore(AccountManager);
    let err = null; try { n1.am2.resolveForSpawn(n1.P, 'claude', { sessionKey: 'nc-1' }); } catch (e) { err = e; }
    ck('全B new: the default names a REMOVED member and no listed member is signed in ⇒ the new conversation is REFUSED by name (never placed on the removed member)', !!err && err.code === 'removed_no_candidate' && /"A" was removed from pool "nc" and no other member can take over/.test(err.message) && (() => { try { fs.lstatSync(n1.am2.sessionPoolLinkPath(n1.P, 'nc-1')); return false; } catch { return true; } })(), err && err.message); // no link was born at all
    for (const [id, t] of n1.keep) fs.writeFileSync(n1.cp(id), t, { mode: 0o600 });
    n1.am2.resolveForSpawn(n1.P, 'claude', { sessionKey: 'nc-2' });
    ck('全B new: …with a listed member signed in, it starts on a member the pool LISTS (the default still names the removed one)', n1.am2.poolCurrent(n1.P) === n1.ids[0] && n1.ids.slice(1).includes(n1.am2.poolCurrentFor(n1.P, 'nc-2')), n1.am2.poolCurrentFor(n1.P, 'nc-2'));
    // control: the store without the guard — the new conversation's link is born on the removed member
    const asrc = fs.readFileSync(path.resolve('src/accounts.js'), 'utf8');
    const g = /        const listedNow = this\.poolMembership\(id\);\n        if \(member && !listedNow\.includes\(member\)\) \{[\s\S]*?\n        \}\n/;
    ck('全B new control: the patch (the store without the guard) hits', g.test(asrc));
    const { AccountManager: OldMgr } = MN.load('src/accounts.js', asrc.replace(g, ''), 'noguard');
    const n2 = mkStore(OldMgr);
    let err2 = null; try { n2.am2.resolveForSpawn(n2.P, 'claude', { sessionKey: 'nc-3' }); } catch (e) { err2 = e; }
    ck('全B new control: …without it the new conversation starts ON the removed member (billing it)', !err2 && n2.am2.poolCurrentFor(n2.P, 'nc-3') === n2.ids[0], err2 ? err2.message : n2.am2.poolCurrentFor(n2.P, 'nc-3'));
  }
  // ── verify r2 (r1's second residual): A DELETED MEMBER'S POOL LINKS GO WHERE THE ENGINE DECIDES ──────────────
  // Deleting an account heals every pool that listed it (2.335.0 — its dir is wiped, a link cannot stay). The store
  // alone re-points the default to the first live member and every link to that default: a family-blind move, a pin
  // ignored, and the next pool pass moves them again (a second cold start). The delete route now hands the store the
  // engine's decision — the default by decideDefaultTarget (+ its fallback), each link by that conversation's verdict.
  {
    const del = (w2, opts) => { let r; quietly(() => { r = opts === 'store' ? (w2.am.remove(w2.id.martin), { code: 200 }) : w2.call('DELETE', '/api/accounts/:id', { id: w2.id.martin }, {}); }); return r; };
    const setup = () => { const w2 = world({}); w2.mk('x-1', 'martin'); const p = w2.mk('x-2', 'martin'); p._poolPin = { memberId: w2.id.uci, at: Date.now(), by: 'user' }; return w2; };
    const wd = setup();
    const n0 = wd.am.slotTransitions.all().length;
    const r = del(wd);
    ck('r2 delete: the route deletes the account (200)', r.code === 200, JSON.stringify(r.body));
    ck('r2 delete: the DEFAULT goes where the engine decides (Fish: its week resets sooner — EDF), not the first live member (UCI)', wd.am.poolCurrent(wd.P) === wd.id.fish, wd.am.poolCurrent(wd.P));
    ck('r2 delete: each LINK goes where the engine decides for THAT conversation — x-1 by the verdict (Fish), x-2 to its PIN (UCI)', wd.on('x-1') === 'fish' && wd.on('x-2') === 'uci', [wd.on('x-1'), wd.on('x-2')]);
    ck('r2 delete: …one spelling of the act in the slot ledger (member-removed) for the default and the links', JSON.stringify(wd.am.slotTransitions.all().slice(n0).map((x) => [x.sessionId, x.why])) === '[[null,"member-removed"],["x-1","member-removed"],["x-2","member-removed"]]');
    wd.eng._poolSwitchAt.clear(); wd.eng._poolAutoLast.clear();
    const rows = wd.am.slotTransitions.all().length;
    quietly(() => wd.eng.maybePoolAutoSwitchForPool(wd.P, { force: true }));
    ck('r2 delete: …and the next pool pass has nothing to redo (no second re-point)', wd.am.slotTransitions.all().length === rows && wd.on('x-1') === 'fish' && wd.on('x-2') === 'uci', wd.am.slotTransitions.all().length - rows);
    // control: the store alone (no engine decision) — first live member, every link to the default, the pin ignored, the pass re-moves
    const wc = setup();
    del(wc, 'store');
    ck('r2 delete control: the store alone puts the default on the first live member (UCI) and every link on it', wc.am.poolCurrent(wc.P) === wc.id.uci && wc.on('x-1') === 'uci' && wc.on('x-2') === 'uci', [wc.am.poolCurrent(wc.P), wc.on('x-1'), wc.on('x-2')]);
    wc.eng._poolSwitchAt.clear(); wc.eng._poolAutoLast.clear();
    const rowsC = wc.am.slotTransitions.all().length;
    quietly(() => wc.eng.maybePoolAutoSwitchForPool(wc.P, { force: true }));
    ck('r2 delete control: …and the next pool pass moves again what the store placed blind (a second re-point)', wc.am.slotTransitions.all().length > rowsC, wc.am.slotTransitions.all().length - rowsC);
  }
  // WIRING PINS (code only): restart / resume / fork
  const strip = (f) => fs.readFileSync(path.resolve(f), 'utf8').split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '')).join('\n');
  const br = strip('src/server/boot-restore.js');
  ck('WIRING PIN: all THREE boot-restore sites restore the pin through ONE expression', (br.match(/_poolPin: poolPinFromMeta\(meta\),/g) || []).length === 3);
  const wc2 = strip('src/ws-create.js');
  ck('WIRING PIN: ws-create persists the pin into the meta and takes a resume\'s pin through ONE judge (resumePoolPin — never on a FORK, never remote)', /poolPin: session\._poolPin \|\| undefined,/.test(wc2) && /const rp = resumePoolPin\(data, accounts, backend\);/.test(wc2) && /if \(!data \|\| data\.fork \|\| data\.hostId \|\| !accounts\) return null;/.test(wc2) && /_poolPin: \(data\._poolPin && spawnAccount && spawnAccount\.id === data\._poolPinPool\) \? data\._poolPin : null,/.test(wc2));
  const sl = strip('src/lib/session-lifecycle.js');
  ck('WIRING PIN: the client carries the pin on a RESUME (session config) and drops it on a fork', /poolPin: savedCfg\.poolPin,/.test(sl) && /poolPin: \(!fork && poolPin && typeof poolPin\.memberId === 'string'\)/.test(sl));
  fs.rmSync(scr, { recursive: true, force: true });
})();

console.log(fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
