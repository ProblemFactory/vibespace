// B-fcff v2 dead-reckoning estimator: pair extraction guards, rate learning
// (prior blend → observation dominance), window-roll estimation semantics,
// overlay, calibration prediction, and the stateful class (memo/invalidate)
// against a temp anchor dir + a fake usageHistory ledger.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const est = require(path.resolve('src/usage-estimator.js'));
const { costBetween, costBetweenMulti } = require(path.resolve('src/usage-anchors.js'));

let pass = 0, fail = 0;
const ck = (n, c) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };
const approx = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

const T0 = 1786000000000; // ms
const WEEK_SEC_ = 7 * 86400;
const HR = 3600000, WK = 7 * 86400;
const RESET = Math.floor(T0 / 1000) + 5 * 86400; // weekly reset 5d after T0

const mkAnchor = (fetchedAt, { u5, u7, uf, r5 = Math.floor(fetchedAt / 1000) + 7200, rw = RESET, prevFetchedAt = null, costSince = null, accountId = 'sub-x' } = {}) => ({
  fetchedAt, prevFetchedAt, costSince, accountId,
  buckets: {
    fiveHour: u5 == null ? null : { u: u5, resetsAt: r5 },
    sevenDay: u7 == null ? null : { u: u7, resetsAt: rw },
    scopedWeekly: uf == null ? [] : [{ name: 'Fable', u: uf, resetsAt: rw }],
  },
});
const cs = (total, fable = total) => ({ total, byFamily: { fable, opus: total - fable, sonnet: 0, haiku: 0, other: 0 }, requests: 1 });

// ── extractPairs guards ──────────────────────────────────────────────────────
{
  const R5 = Math.floor(T0 / 1000) + 7200; // shared 5h reset — same window
  const a1 = mkAnchor(T0, { u5: 0.30, u7: 0.40, uf: 0.60, r5: R5 });
  const a2 = mkAnchor(T0 + HR, { u5: 0.34, u7: 0.41, uf: 0.62, r5: R5, prevFetchedAt: T0, costSince: cs(20, 15) });
  const pairs = est.extractPairs([a1, a2]);
  ck('pair: 5h Δu 0.04 over $20', approx(pairs.fiveHour[0].du, 0.04) && pairs.fiveHour[0].cost === 20);
  ck('pair: scoped uses the FABLE family cost, not total', pairs['scoped:fable'][0].cost === 15);
  ck('pair: 7d uses total', pairs.sevenDay[0].cost === 20);

  // reset crossing voids the bucket's pair
  const a3 = mkAnchor(T0 + 2 * HR, { u5: 0.05, u7: 0.42, uf: 0.63, r5: Math.floor(T0 / 1000) + 12 * 3600, prevFetchedAt: T0 + HR, costSince: cs(10) });
  const p2 = est.extractPairs([a2, a3]);
  ck('pair: 5h reset moved >120s → 5h pair skipped, 7d kept', !p2.fiveHour && p2.sevenDay?.length === 1);

  // decrease beyond jitter without a reset change = anomaly
  const a4 = mkAnchor(T0 + 3 * HR, { u7: 0.30, prevFetchedAt: T0 + 2 * HR, costSince: cs(5) });
  a4.buckets.sevenDay.resetsAt = RESET;
  ck('pair: 0.42→0.30 same reset → anomalous, skipped', !est.extractPairs([a3, a4]).sevenDay);

  // small negative clamps to 0, cost still counted
  const a5 = mkAnchor(T0 + HR, { u7: 0.399, prevFetchedAt: T0, costSince: cs(8) });
  const p3 = est.extractPairs([mkAnchor(T0, { u7: 0.40 }), a5]);
  ck('pair: −0.001 jitter clamps to du=0, cost kept', p3.sevenDay[0].du === 0 && p3.sevenDay[0].cost === 8);

  // base matched BY fetchedAt, not adjacency
  const stranger = mkAnchor(T0 + 30 * 60000, { u7: 0.99 });
  const p4 = est.extractPairs([a1, stranger, a2]);
  ck('pair: base matched by prevFetchedAt (interleaved stranger ignored)', approx(p4.sevenDay[0].du, 0.01));
}

// ── learnRates: prior blend → observation dominance ──────────────────────────
{
  const priors = { fiveHour: 500, sevenDay: 1730, 'scoped:fable': 875 };
  const r0 = est.learnRates([], { priors });
  ck('no data: rate = pure prior (implied full = prior)', approx(r0.sevenDay.impliedFullUsd, 1730, 0.51));
  // heavy observation at a DIFFERENT true rate (full=$400) must dominate
  const chain = [mkAnchor(T0, { u7: 0.05 })];
  let uu = 0.05;
  for (let i = 1; i <= 11; i++) {
    chain.push(mkAnchor(T0 + i * HR, { u7: uu + 0.05, prevFetchedAt: T0 + (i - 1) * HR, costSince: cs(20) }));
    uu += 0.05;
  }
  const r1 = est.learnRates(chain, { priors });
  ck('12 pairs at full=$400 pull implied full well below the $1730 prior', r1.sevenDay.impliedFullUsd < 700 && r1.sevenDay.impliedFullUsd > 380);
  const r2 = est.learnRates(chain, { priors: null });
  ck('no prior: pure observation → implied full ≈ $400', approx(r2.sevenDay.impliedFullUsd, 400, 1));
  ck('no prior + no signal → bucket absent', !est.learnRates([mkAnchor(T0, { u5: 0.1 })], { priors: null }).fiveHour);
}

// ── estimateBuckets: fresh window + roll semantics ───────────────────────────
{
  const rates = { fiveHour: { rate: 1 / 500 }, sevenDay: { rate: 1 / 1730 }, 'scoped:fable': { rate: 1 / 875 } };
  const anchor = mkAnchor(T0, { u5: 0.40, u7: 0.40, uf: 0.60 });
  const costFn = () => cs(173, 87.5); // $173 total, $87.5 fable since anchor
  const e = est.estimateBuckets({ anchor, rates, costFn, nowMs: T0 + HR });
  ck('est: 7d 0.40 + 173/1730 = 0.50', approx(e.sevenDay.utilization, 0.50, 0.001));
  ck('est: fable 0.60 + 87.5/875 = 0.70', approx(e.scopedWeekly[0].utilization, 0.70, 0.001));
  ck('est: 5h 0.40 + 173/500 clamped fine', approx(e.fiveHour.utilization, 0.40 + 173 / 500, 0.001));
  ck('est: marked estimated + anchor ts', e.estimated === true && e.anchorAt === T0);

  // WEEKLY ROLL: now past the reset → re-base at the reset boundary from 0
  const nowAfter = (RESET + 3600) * 1000;
  const calls = [];
  const costFn2 = (fromMs) => { calls.push(fromMs); return cs(17.3, 8.75); };
  const e2 = est.estimateBuckets({ anchor, rates, costFn: costFn2, nowMs: nowAfter });
  ck('roll: 7d re-based from 0 at the old reset → 17.3/1730 = 0.01', approx(e2.sevenDay.utilization, 0.01, 0.001));
  ck('roll: new resetsAt advanced one week', e2.sevenDay.resetsAt === RESET + WK);
  ck('roll: cost window starts AT the reset, not the anchor', calls.every((f) => f === RESET * 1000));
  ck('roll: 5h abstains (window start unknowable)', e2.fiveHour === null);
  ck('roll: fable re-based too', approx(e2.scopedWeekly[0].utilization, 8.75 / 875, 0.001));

  ck('nothing estimable → null', est.estimateBuckets({ anchor: mkAnchor(T0, {}), rates, costFn, nowMs: T0 + 1 }) === null);
}

// ── overlayCache + estDisplay roll rule (server side of the UI contract) ─────
{
  const raw = { fiveHour: { utilization: 0.4, resetsAt: 1 }, sevenDay: { utilization: 0.4, resetsAt: 2 }, scopedWeekly: [{ name: 'Fable', utilization: 0.6, resetsAt: 2 }], fetchedAt: T0 };
  const e = { estimated: true, fiveHour: null, sevenDay: { utilization: 0.5, resetsAt: 2, estimated: true }, scopedWeekly: [{ name: 'Fable', utilization: 0.7, resetsAt: 2, estimated: true }] };
  const o = est.overlayCache(raw, e);
  ck('overlay: estimated buckets replace, abstained keep raw', o.sevenDay.utilization === 0.5 && o.fiveHour.utilization === 0.4);
  ck('overlay: scoped matched by name', o.scopedWeekly[0].utilization === 0.7);
  ck('overlay: null est → raw unchanged', est.overlayCache(raw, null) === raw);
}

// ── predictCalib ─────────────────────────────────────────────────────────────
{
  const rates = { sevenDay: { rate: 1 / 1730 } };
  const prev = mkAnchor(T0, { u7: 0.40 });
  const c = est.predictCalib(prev, mkAnchor(T0 + HR, { u7: 0.42 }).buckets, rates, cs(17.3));
  ck('calib: pred 0.41 vs act 0.42 → err −0.01', approx(c.sevenDay.pred, 0.41, 0.001) && approx(c.sevenDay.err, -0.01, 0.001));
  const crossed = mkAnchor(T0 + HR, { u7: 0.01, rw: RESET + WK });
  ck('calib: reset-crossed bucket skipped', est.predictCalib(prev, crossed.buckets, rates, cs(17.3)) === null);
}

// ── costBetweenMulti sums across an identity's account ids ───────────────────
{
  const fakeHistory = {
    *_events() {
      yield { ts: T0 + 1, acct: 'sub-a', model: 'claude-fable-5', i: 0, o: 0, cw5: 0, cw1: 0, cr: 0 };
      yield { ts: T0 + 2, acct: '__global__', model: 'claude-fable-5', i: 0, o: 0, cw5: 0, cw1: 0, cr: 0 };
      yield { ts: T0 + 3, acct: 'sub-b', model: 'claude-opus-4-8', i: 0, o: 0, cw5: 0, cw1: 0, cr: 0 };
      yield { ts: T0 + 4, acct: 'sub-a', model: 'claude-fable-5', host: 'h1', i: 0, o: 0, cw5: 0, cw1: 0, cr: 0 };
    },
    _cost: () => 10,
  };
  const m = costBetweenMulti(fakeHistory, ['sub-a', '__global__'], T0, T0 + 10);
  ck('multi: sums the identity ids, skips others + host events', m.total === 20 && m.requests === 2);
  ck('single costBetween unchanged (delegates)', costBetween(fakeHistory, 'sub-a', T0, T0 + 10).total === 10);
}

// ── UsageEstimator class: anchors dir + memo + invalidate + rates.json ───────
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-est-'));
  const key = 'org:test';
  const lines = [
    mkAnchor(T0, { u7: 0.40 }),
    mkAnchor(T0 + HR, { u7: 0.45, prevFetchedAt: T0, costSince: cs(86.5) }), // full=$1730 exactly
  ];
  fs.writeFileSync(path.join(dir, 'anchors-org_test.ndjson'), lines.map((l) => JSON.stringify({ ...l, identityKey: key })).join('\n') + '\n');
  const fakeHistory = { *_events() {
    yield { ts: T0 + HR + 1, acct: 'sub-x', model: 'claude-fable-5', i: 0, o: 0, cw5: 0, cw1: 0, cr: 0 };
    yield { ts: T0 + 3 * HR + 500, acct: 'sub-x', model: 'claude-fable-5', i: 0, o: 0, cw5: 0, cw1: 0, cr: 0 };
  }, _cost: () => 17.3 };
  const ue = new est.UsageEstimator({
    anchorsDir: dir, usageHistory: fakeHistory,
    resolveIdentity: (id) => (id === 'sub-x' ? { identityKey: key } : null),
    priorsFor: () => null,
  });
  const r = ue.ratesFor(key);
  ck('class: rates learned from the file (no prior)', approx(r.sevenDay.impliedFullUsd, 1730, 1));
  ck('class: rates.json snapshot written', fs.existsSync(path.join(dir, 'rates.json')));
  const e1 = ue.estimateFor('sub-x', null, T0 + 2 * HR);
  ck('class: estimate = anchor 0.45 + 17.3/1730 = 0.46', approx(e1.sevenDay.utilization, 0.46, 0.001));
  ck('class: unknown account → null', ue.estimateFor('sub-zzz', null, T0 + 2 * HR) === null);
  ck('class: memo returns the same object within 30s', ue.estimateFor('sub-x', null, T0 + 2 * HR + 1000) === e1);
  // a NEWER raw cache than the anchor becomes the base (sweep-lag window)
  const raw = { fetchedAt: T0 + 3 * HR, sevenDay: { utilization: 0.5, resetsAt: RESET } };
  ue.invalidate(key);
  const e2 = ue.estimateFor('sub-x', raw, T0 + 3 * HR + 1000);
  ck('class: newer raw cache wins as base', approx(e2.sevenDay.utilization, 0.5 + 17.3 / 1730, 0.001) && e2.anchorAt === T0 + 3 * HR);
  ck('class: accountIdsFor unions file + extras', ue.accountIdsFor(key, ['sub-new']).includes('sub-x') && ue.accountIdsFor(key, ['sub-new']).includes('sub-new'));
  fs.rmSync(dir, { recursive: true, force: true });
}

// ── 2.263.0 hardening round (adversarial review + limit incident) ────────────
{
  // multi-week roll: fromMs = the LAST passed boundary, resetsAt two weeks out
  const rates = { sevenDay: { rate: 1 / 1730 } };
  const anchor = mkAnchor(T0, { u7: 0.40 });
  const calls = [];
  const e = est.estimateBuckets({ anchor, rates, costFn: (f) => { calls.push(f); return cs(17.3); }, nowMs: (RESET + WEEK_SEC_ + 3600) * 1000 });
  ck('multi-week roll: cost window starts at the LAST passed boundary', calls.every((f) => f === (RESET + WEEK_SEC_) * 1000));
  ck('multi-week roll: resetsAt advanced two weeks', e.sevenDay.resetsAt === RESET + 2 * WEEK_SEC_);

  // normU input classes: integer-percent readings + garbage
  const ai = mkAnchor(T0, { u7: 40 });  // integer % (statusline raw shape)
  const bi = mkAnchor(T0 + HR, { u7: 45, prevFetchedAt: T0, costSince: cs(20) });
  ck('normU: integer-% pair yields du 0.05', approx(est.extractPairs([ai, bi]).sevenDay[0].du, 0.05));
  const gg = mkAnchor(T0 + HR, { u7: 'garbage', prevFetchedAt: T0, costSince: cs(20) });
  ck('normU: garbage u → bucket pair skipped', !est.extractPairs([mkAnchor(T0, { u7: 0.4 }), gg]).sevenDay);

  // resetsAt=0: crossing guard disarmed but the max-span guard bounds pairs
  const z0 = mkAnchor(T0, { u5: 0.30, r5: 0 });
  const z1 = mkAnchor(T0 + 6 * HR, { u5: 0.10, r5: 0, prevFetchedAt: T0, costSince: cs(20) });
  ck('resetsAt=0: a 5h pair spanning 6h is skipped (window definitionally rolled)', !est.extractPairs([z0, z1]).fiveHour);
  const z2 = mkAnchor(T0 + HR, { u5: 0.35, r5: 0, prevFetchedAt: T0, costSince: cs(20) });
  ck('resetsAt=0: an in-window 5h pair still forms', approx(est.extractPairs([z0, z2]).fiveHour[0].du, 0.05));
  const ez = est.estimateBuckets({ anchor: mkAnchor(T0, { u7: 0.4, rw: 0 }), rates, costFn: () => cs(17.3), nowMs: T0 + HR });
  ck('resetsAt=0: estimate emits without a roll, resetsAt undefined', approx(ez.sevenDay.utilization, 0.41, 0.001) && ez.sevenDay.resetsAt === undefined);

  // scoped asOf: stale ⟳ reading — cost window starts at the READING time
  const sa = mkAnchor(T0 + 2 * HR, { u7: 0.4 });
  sa.buckets.scopedWeekly = [{ name: 'Fable', u: 0.6, resetsAt: RESET, asOf: T0 }];
  const scCalls = [];
  const se = est.estimateBuckets({ anchor: sa, rates: { 'scoped:fable': { rate: 1 / 875 } }, costFn: (f) => { scCalls.push(f); return cs(87.5, 87.5); }, nowMs: T0 + 3 * HR });
  ck('scoped asOf: cost accrues from the reading time, not the anchor write', scCalls.includes(T0) && approx(se.scopedWeekly[0].utilization, 0.70, 0.001));
  // two anchors carrying the SAME stale scoped reading = zero information
  const p0 = mkAnchor(T0, {}); p0.buckets.scopedWeekly = [{ name: 'Fable', u: 0.6, resetsAt: RESET, asOf: T0 - HR }];
  const p1 = mkAnchor(T0 + HR, { prevFetchedAt: T0, costSince: cs(30, 30) }); p1.buckets.scopedWeekly = [{ name: 'Fable', u: 0.6, resetsAt: RESET, asOf: T0 - HR }];
  ck('scoped asOf: identical-reading pair skipped (du=0+cost would bias rate low)', !est.extractPairs([p0, p1])['scoped:fable']);
}
{
  // __global__ never unions in from HISTORY (reassignable id — a /login switch
  // hands it to another identity); memo goes stale on fresher rawCache.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-est2-'));
  const key = 'org:test2';
  const lines = [
    { ...mkAnchor(T0, { u7: 0.40 }), identityKey: key, accountId: '__global__' },
    // grouped-sweep signature (accountIds) — without it a mixed-id file's
    // pairs are treated as legacy under-counted records and skipped
    { ...mkAnchor(T0 + HR, { u7: 0.45, prevFetchedAt: T0, costSince: cs(86.5) }), identityKey: key, accountId: 'sub-old', accountIds: ['sub-old', '__global__'] },
  ];
  fs.writeFileSync(path.join(dir, 'anchors-org_test2.ndjson'), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  const evs = [];
  const fakeHistory = { *_events() { yield* evs; }, _cost: () => 17.3 };
  const ue = new est.UsageEstimator({ anchorsDir: dir, usageHistory: fakeHistory, resolveIdentity: (id) => (id === 'sub-x' ? { identityKey: key } : null), priorsFor: () => null });
  const ids = ue.accountIdsFor(key, ['sub-x']);
  ck('__global__ from history is NOT unioned (reassignable)', !ids.includes('__global__') && ids.includes('sub-old') && ids.includes('sub-x'));
  // multi-id union THROUGH estimateFor: events under the current AND old id both count
  evs.push({ ts: T0 + HR + 1, acct: 'sub-x', model: 'claude-fable-5', i: 0, o: 0, cw5: 0, cw1: 0, cr: 0 });
  evs.push({ ts: T0 + HR + 2, acct: 'sub-old', model: 'claude-fable-5', i: 0, o: 0, cw5: 0, cw1: 0, cr: 0 });
  const e1 = ue.estimateFor('sub-x', null, T0 + 2 * HR);
  ck('estimateFor sums cost across the identity id union', approx(e1.sevenDay.utilization, 0.45 + 34.6 / 1730, 0.001));
  // memo staleness: a fresher rawCache (e.g. a limit-banner mark) must bust it
  const banner = { fetchedAt: T0 + 2 * HR + 5000, sevenDay: { utilization: 1, resetsAt: RESET } };
  const e2 = ue.estimateFor('sub-x', banner, T0 + 2 * HR + 6000);
  ck('memo busts on fresher rawCache: banner utilization 1 shows immediately', e2.sevenDay.utilization >= 1);
  fs.rmSync(dir, { recursive: true, force: true });
}

// ── final review round: resetsAt=0 stale abstain + legacy mixed-id filter ────
{
  const rates = { fiveHour: { rate: 1 / 500 }, sevenDay: { rate: 1 / 1730 } };
  // 5h bucket with resetsAt 0 and a 3-day-old anchor: MUST abstain (verifier
  // repro: it dead-reckoned days of cost into a 120% five-hour arc)
  const stale = mkAnchor(T0, { u5: 0.4, r5: 0 });
  const eS = est.estimateBuckets({ anchor: stale, rates, costFn: () => cs(600), nowMs: T0 + 72 * HR });
  ck('resetsAt=0 + anchor older than the window → 5h abstains', eS === null || eS.fiveHour === null);
  const eF = est.estimateBuckets({ anchor: mkAnchor(T0, { u5: 0.4, r5: 0 }), rates, costFn: () => cs(50), nowMs: T0 + HR });
  ck('resetsAt=0 within the window still estimates', approx(eF.fiveHour.utilization, 0.5, 0.001));

  // legacy v1 interleaved records: mixed-id file, unmarked pair → skipped
  const mixed = [
    { ...mkAnchor(T0, { u7: 0.40 }), accountId: '__global__' },
    { ...mkAnchor(T0 + HR, { u7: 0.45, prevFetchedAt: T0, costSince: cs(10) }), accountId: 'sub-a' }, // v1: no accountIds
    { ...mkAnchor(T0 + 2 * HR, { u7: 0.50, prevFetchedAt: T0 + HR, costSince: cs(90) }), accountId: 'sub-a', accountIds: ['sub-a', '__global__'] },
  ];
  const mp = est.extractPairs(mixed);
  ck('legacy mixed-id pair (no accountIds) skipped, grouped pair kept', mp.sevenDay.length === 1 && mp.sevenDay[0].cost === 90);
  // single-id files keep their unmarked history (nothing was under-counted)
  const single = [mkAnchor(T0, { u7: 0.4 }), mkAnchor(T0 + HR, { u7: 0.45, prevFetchedAt: T0, costSince: cs(86.5) })];
  ck('single-id file: unmarked pairs still learn', est.extractPairs(single).sevenDay.length === 1);
}

// ── calibration-incident round: cap-censoring + learn-time live cost ─────────
{
  // AT-CAP pair (the 01:46 limit-banner poison: 9%→100% over an under-counted
  // $50 taught full≈$139 vs true $500) — censored, never learns
  const capped = [
    mkAnchor(T0, { u5: 0.09 }),
    mkAnchor(T0 + HR, { u5: 1.0, prevFetchedAt: T0, costSince: cs(50) }),
  ];
  capped[0].buckets.fiveHour.resetsAt = capped[1].buckets.fiveHour.resetsAt = Math.floor(T0 / 1000) + 7200;
  ck('at-cap reading (u=1, banner mark) censors the pair', !est.extractPairs(capped).fiveHour);

  // learn-time LIVE cost recomputation overrides a stale frozen costSince
  const stale = [
    mkAnchor(T0, { u7: 0.40 }),
    mkAnchor(T0 + HR, { u7: 0.45, prevFetchedAt: T0, costSince: cs(20) }), // sweep saw $20; ledger later backfilled to $86.5
  ];
  const live = est.extractPairs(stale, { costFn: () => cs(86.5) });
  ck('live ledger cost overrides the frozen snapshot', live.sevenDay[0].cost === 86.5);
  const zero = est.extractPairs(stale, { costFn: () => cs(0) });
  ck('zero live total (retention gap) falls back to the frozen snapshot', zero.sevenDay[0].cost === 20);
}

console.log(fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
