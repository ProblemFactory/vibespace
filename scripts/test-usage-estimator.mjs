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

// ── bounce-back taint (2.267.0, the Personal Max flap poison) ────────────────
// A stale sibling cache file briefly promoted to freshest anchors a week-old
// reading: the DECREASE pair into it is voided (anomaly), and the RECOVERY
// pair out of it (huge du, near-zero cost) must be excluded too — it taught a
// ~30%-hot fable rate in the field. The taint stops after one step.
{
  const b0 = mkAnchor(T0, { u7: 0.51, uf: 0.51 });
  const b1 = mkAnchor(T0 + HR, { u7: 0.19, uf: 0.19, prevFetchedAt: T0, costSince: cs(1.7) });          // stale reading — anomaly
  const b2 = mkAnchor(T0 + 2 * HR, { u7: 0.51, uf: 0.51, prevFetchedAt: T0 + HR, costSince: cs(1.7) }); // bounce-back
  const b3 = mkAnchor(T0 + 3 * HR, { u7: 0.53, uf: 0.53, prevFetchedAt: T0 + 2 * HR, costSince: cs(20) }); // clean again
  const tp = est.extractPairs([b0, b1, b2, b3]);
  ck('taint: decrease pair voided AND its bounce-back excluded — only the clean pair survives',
    tp.sevenDay?.length === 1 && approx(tp.sevenDay[0].du, 0.02) && tp.sevenDay[0].cost === 20);
  ck('taint: scoped bucket tainted independently, same outcome', tp['scoped:fable']?.length === 1 && approx(tp['scoped:fable'][0].du, 0.02));
  // without the taint the bounce pair would have added du 0.32 for $1.7
  const rt = est.learnRates([b0, b1, b2, b3], { priors: { sevenDay: 1730 } });
  ck('taint: learned 7d rate ignores the flap (implied full stays near prior)', rt.sevenDay.impliedFullUsd > 1000);
}

// ── predictCalib honesty guards (2.267.0) ────────────────────────────────────
{
  const rates = { fiveHour: { rate: 0.002 }, sevenDay: { rate: 0.00058 } };
  const prev = mkAnchor(T0, { u5: 0.98, u7: 0.5 });
  prev.buckets.fiveHour.u = 1.0; // banner-marked at cap
  const nb = mkAnchor(T0 + HR, { u5: 0, u7: 0.51 }).buckets;
  const c1 = est.predictCalib(prev, nb, rates, cs(5));
  ck('calib: at-cap base (banner mark) skipped — no p100/a0 rows', !c1?.fiveHour && !!c1?.sevenDay);
  const prev2 = mkAnchor(T0, { u5: 0.4, u7: 0.5 });
  const nb2 = mkAnchor(T0 + HR, { u5: 0.5, u7: 0.6 }).buckets;
  nb2.fiveHour.resetsAt = 0; // defensive resetsAt-less reading
  const c2 = est.predictCalib(prev2, nb2, rates, cs(5));
  ck('calib: missing resetsAt on either side skips the bucket', !c2?.fiveHour && !!c2?.sevenDay);
  const c3 = est.predictCalib(prev2, mkAnchor(T0 + 6 * HR, { u5: 0.5, u7: 0.6, r5: Math.floor(T0 / 1000) + 7200 }).buckets, rates, cs(5), 6 * 3600);
  ck('calib: span beyond the 5h window skips fiveHour, keeps sevenDay', !c3?.fiveHour && !!c3?.sevenDay);
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
  const e = est.estimateBuckets({ lagS: 0, anchor, rates, costFn, nowMs: T0 + HR });
  ck('est: 7d 0.40 + 173/1730 = 0.50', approx(e.sevenDay.utilization, 0.50, 0.001));
  ck('est: fable 0.60 + 87.5/875 = 0.70', approx(e.scopedWeekly[0].utilization, 0.70, 0.001));
  ck('est: 5h 0.40 + 173/500 clamped fine', approx(e.fiveHour.utilization, 0.40 + 173 / 500, 0.001));
  ck('est: marked estimated + anchor ts', e.estimated === true && e.anchorAt === T0);

  // WEEKLY ROLL: now past the reset → re-base at the reset boundary from 0
  const nowAfter = (RESET + 3600) * 1000;
  const calls = [];
  const costFn2 = (fromMs) => { calls.push(fromMs); return cs(17.3, 8.75); };
  const e2 = est.estimateBuckets({ lagS: 0, anchor, rates, costFn: costFn2, nowMs: nowAfter });
  ck('roll: 7d re-based from 0 at the old reset → 17.3/1730 = 0.01', approx(e2.sevenDay.utilization, 0.01, 0.001));
  ck('roll: new resetsAt advanced one week', e2.sevenDay.resetsAt === RESET + WK);
  ck('roll: cost window starts AT the reset, not the anchor', calls.every((f) => f === RESET * 1000));
  ck('roll: 5h abstains (window start unknowable)', e2.fiveHour === null);
  ck('roll: fable re-based too', approx(e2.scopedWeekly[0].utilization, 8.75 / 875, 0.001));

  ck('nothing estimable → null', est.estimateBuckets({ lagS: 0, anchor: mkAnchor(T0, {}), rates, costFn, nowMs: T0 + 1 }) === null);
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
  // DELTA-RELATIVE fields (owner-corrected, 2.368.13): absolute error shrinks
  // with refresh cadence alone — the model's real claim is the MOVEMENT, so
  // calib rows must carry predΔ/actΔ and their ratio.
  ck('calib: predDu/actDu recorded (0.01 vs 0.02) with rel = their ratio', approx(c.sevenDay.predDu, 0.01, 0.001) && approx(c.sevenDay.actDu, 0.02, 0.001) && approx(c.sevenDay.rel, 0.5, 0.01) && approx(c.sevenDay.u0, 0.40, 0.001));
  const tiny = est.predictCalib(prev, mkAnchor(T0 + HR, { u7: 0.41 }).buckets, rates, cs(17.3));
  ck('calib: a barely-moved window (|actΔ|<2pt) gets rel:null — a ratio there is noise division, not accuracy', tiny.sevenDay.rel === null && approx(tiny.sevenDay.actDu, 0.01, 0.001));
  const crossed = mkAnchor(T0 + HR, { u7: 0.01, rw: RESET + WK });
  ck('calib: reset-crossed bucket skipped', est.predictCalib(prev, crossed.buckets, rates, cs(17.3)) === null);
  // the engine metric must be the RELATIVE one, gated on rel
  const engSrc = fs.readFileSync(new URL('../src/server/usage-pool-engine.js', import.meta.url), 'utf8');
  const estSrc = fs.readFileSync(new URL('../src/usage-estimator.js', import.meta.url), 'utf8');
  ck('the calib metric is usage-est-rel-err-pct, gated on rel (no absolute-error headline metric anywhere)', /CALIB_METRIC = 'usage-est-rel-err-pct'/.test(estSrc) && /c\.rel == null/.test(estSrc) && !/usage-est-err-pct/.test(engSrc + estSrc));
}

// ── costBetweenMulti sums across an identity's account ids ───────────────────
{
  const fakeHistory = {
    *_events() {
      yield { ts: T0 + 1, acct: 'sub-a', model: 'claude-fable-5', i: 0, o: 0, cw5: 0, cw1: 0, cr: 0 };
      yield { ts: T0 + 2, acct: '__global__', model: 'claude-fable-5', i: 0, o: 0, cw5: 0, cw1: 0, cr: 0 };
      yield { ts: T0 + 3, acct: 'sub-b', model: 'claude-opus-4-8', i: 0, o: 0, cw5: 0, cw1: 0, cr: 0 };
      yield { ts: T0 + 4, acct: 'sub-a', model: 'claude-fable-5', host: 'h1', i: 0, o: 0, cw5: 0, cw1: 0, cr: 0 }; // RESOLVED remote — counts since 2.297.0
      yield { ts: T0 + 5, acct: 'host-h1', atype: 'host', model: 'x', host: 'h1', i: 0, o: 0, cw5: 0, cw1: 0, cr: 0 }; // unresolved host bucket — never counts
    },
    _cost: () => 10,
  };
  const m = costBetweenMulti(fakeHistory, ['sub-a', '__global__'], T0, T0 + 10);
  ck('multi: sums identity ids + RESOLVED remote spend, skips others + the host bucket', m.total === 30 && m.requests === 3);
  ck('single costBetween unchanged (delegates)', costBetween(fakeHistory, 'sub-a', T0, T0 + 10).total === 20); // sub-a local + sub-a resolved-remote
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
  const ue = new est.UsageEstimator({ lagS: 0,
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
  const e = est.estimateBuckets({ lagS: 0, anchor, rates, costFn: (f) => { calls.push(f); return cs(17.3); }, nowMs: (RESET + WEEK_SEC_ + 3600) * 1000 });
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
  const ez = est.estimateBuckets({ lagS: 0, anchor: mkAnchor(T0, { u7: 0.4, rw: 0 }), rates, costFn: () => cs(17.3), nowMs: T0 + HR });
  ck('resetsAt=0: estimate emits without a roll, resetsAt undefined', approx(ez.sevenDay.utilization, 0.41, 0.001) && ez.sevenDay.resetsAt === undefined);

  // scoped asOf: stale ⟳ reading — cost window starts at the READING time
  const sa = mkAnchor(T0 + 2 * HR, { u7: 0.4 });
  sa.buckets.scopedWeekly = [{ name: 'Fable', u: 0.6, resetsAt: RESET, asOf: T0 }];
  const scCalls = [];
  const se = est.estimateBuckets({ lagS: 0, anchor: sa, rates: { 'scoped:fable': { rate: 1 / 875 } }, costFn: (f) => { scCalls.push(f); return cs(87.5, 87.5); }, nowMs: T0 + 3 * HR });
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
  const ue = new est.UsageEstimator({ lagS: 0, anchorsDir: dir, usageHistory: fakeHistory, resolveIdentity: (id) => (id === 'sub-x' ? { identityKey: key } : null), priorsFor: () => null });
  const ids = ue.accountIdsFor(key, ['sub-x']);
  // 2.340.0 REVERSAL (measured under-count won over the reassignment worry):
  // a RECENT (<14d stream-time) __global__ anchor means this identity IS the
  // machine org — union it so global-login spend counts; the reassignment
  // case self-heals via the recency gate (≤14d overlap = conservative
  // over-count only). This fixture's global anchor is 1h old → unioned.
  ck('recent __global__ IS unioned (2.340.0, recency-gated)', ids.includes('__global__') && ids.includes('sub-old') && ids.includes('sub-x'));
  // and a STALE global lineage (>14d of stream time since the last global
  // anchor) stays excluded — the original reassignable concern, still pinned
  {
    const key3 = 'org:test3';
    const stale = [
      { ...mkAnchor(T0, { u7: 0.40 }), identityKey: key3, accountId: '__global__' },
      { ...mkAnchor(T0 + 15 * 86400e3, { u7: 0.45, prevFetchedAt: T0, costSince: cs(86.5) }), identityKey: key3, accountId: 'sub-new', accountIds: ['sub-new'] },
    ];
    fs.writeFileSync(path.join(dir, 'anchors-org_test3.ndjson'), stale.map((l) => JSON.stringify(l)).join('\n') + '\n');
    const ue3 = new est.UsageEstimator({ lagS: 0, anchorsDir: dir, usageHistory: fakeHistory, resolveIdentity: () => ({ identityKey: key3 }), priorsFor: () => null });
    const ids3 = ue3.accountIdsFor(key3, []);
    ck('stale __global__ lineage (>14d) stays excluded (reassignable concern)', !ids3.includes('__global__'));
  }
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
  const eS = est.estimateBuckets({ lagS: 0, anchor: stale, rates, costFn: () => cs(600), nowMs: T0 + 72 * HR });
  ck('resetsAt=0 + anchor older than the window → 5h abstains', eS === null || eS.fiveHour === null);
  const eF = est.estimateBuckets({ lagS: 0, anchor: mkAnchor(T0, { u5: 0.4, r5: 0 }), rates, costFn: () => cs(50), nowMs: T0 + HR });
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

// ── 5h token-class regression (B-536b; 3-class cw/cr/fresh) ──────────────────
{
  const R5 = Math.floor(T0 / 1000) + 4 * 3600; // one shared 5h window
  const csC = (cw, cr, fresh) => ({ total: cw + cr + fresh, byFamily: { fable: cw + cr + fresh, opus: 0, sonnet: 0, haiku: 0, other: 0 }, byClass: { cw, cr, other: fresh }, requests: 1 });
  // chain of anchors: cw burns at $800/full, cr at $3200, fresh at $250
  const mk5 = (at, u5, prev, costSince) => ({ ...mkAnchor(at, { u5, r5: R5 }), prevFetchedAt: prev, costSince });
  const chain = [
    mk5(T0, 0.10, null, null),
    mk5(T0 + 8 * 60000, 0.15, T0, csC(40, 0, 0)),                 // pure cw: du 0.05 = 40/800
    mk5(T0 + 16 * 60000, 0.23, T0 + 8 * 60000, csC(0, 0, 20)),    // pure fresh: du 0.08 = 20/250
    mk5(T0 + 24 * 60000, 0.24, T0 + 16 * 60000, csC(0, 32, 0)),   // pure cr: du 0.01 = 32/3200
    mk5(T0 + 32 * 60000, 0.29, T0 + 24 * 60000, csC(40, 0, 0)),
    mk5(T0 + 40 * 60000, 0.37, T0 + 32 * 60000, csC(0, 0, 20)),
    mk5(T0 + 48 * 60000, 0.38, T0 + 40 * 60000, csC(0, 32, 0)),
  ];
  const r = est.learnRates(chain, { priors: { fiveHour: 500 } });
  // two cw pairs vs the $500 prior pseudo-pair: honest Bayesian shrinkage —
  // the fit lands BETWEEN prior and the $800 data truth, nearer truth as
  // pairs accumulate
  ck('class regression: cw full between prior ($500) and data truth ($800), pulled toward data', r.fiveHour.impliedFullCwUsd > 540 && r.fiveHour.impliedFullCwUsd < 800);
  ck('class regression: recovers cr full ≈ $3200 (reads nearly free)', r.fiveHour.impliedFullCrUsd > 2600 && r.fiveHour.impliedFullCrUsd < 3800);
  ck('class regression: recovers fresh full ≈ $250', r.fiveHour.impliedFullFreshUsd > 215 && r.fiveHour.impliedFullFreshUsd < 290);
  ck('class regression: blended rate still present (display/fallback)', Number.isFinite(r.fiveHour.rate));
  // class-aware prediction: a cr-dominated window must NOT be priced blended
  const anchor = { fetchedAt: T0, buckets: { fiveHour: { u: 0.10, resetsAt: R5 }, sevenDay: null, scopedWeekly: [] } };
  const eC = est.estimateBuckets({ lagS: 0, anchor, rates: { fiveHour: r.fiveHour }, costFn: () => csC(1, 32, 1), nowMs: T0 + HR });
  const expC = 0.10 + 1 / r.fiveHour.impliedFullCwUsd + 32 / r.fiveHour.impliedFullCrUsd + 1 / r.fiveHour.impliedFullFreshUsd;
  ck('class-aware estimate: cr-dominated window priced per component', approx(eC.fiveHour.utilization, expC, 0.01));
  // no byClass in the cost source → blended fallback
  const eB = est.estimateBuckets({ lagS: 0, anchor, rates: { fiveHour: r.fiveHour }, costFn: () => cs(80, 80), nowMs: T0 + HR });
  ck('no class split in cost source → blended fallback', approx(eB.fiveHour.utilization, 0.10 + 80 * r.fiveHour.rate, 0.005));
  // absurd data (massive cw spend against ~zero du ⇒ implied cw full beyond
  // the $20k sanity bound) must NOT emit class rates — blended only
  const bad = [
    mk5(T0, 0.10, null, null),
    mk5(T0 + 10 * 60000, 0.101, T0, csC(900, 0, 0)),
    mk5(T0 + 20 * 60000, 0.102, T0 + 10 * 60000, csC(900, 0, 0)),
    mk5(T0 + 30 * 60000, 0.103, T0 + 20 * 60000, csC(900, 0, 0)),
  ];
  const rb = est.learnRates(bad, { priors: { fiveHour: 500 } });
  ck('absurd implied cw full (> sanity bound) → class rates withheld, blended kept',
    rb.fiveHour && rb.fiveHour.rateCw == null && Number.isFinite(rb.fiveHour.rate));
}

// ── live odometer (event-driven estimation, exhaustion-#2 round) ─────────────
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-est3-'));
  const key = 'org:live';
  const lines = [ { ...mkAnchor(T0, { u7: 0.40 }), identityKey: key, accountId: 'sub-x' } ];
  fs.writeFileSync(path.join(dir, 'anchors-org_live.ndjson'), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  const ledgerRids = new Set();
  const ledgerMids = new Set();
  const fakeHistory = { *_events() {}, _cost: () => 0, _evCache: { rids: ledgerRids, mids: ledgerMids } };
  const ue = new est.UsageEstimator({ lagS: 0,
    anchorsDir: dir, usageHistory: fakeHistory,
    resolveIdentity: (id) => (id === 'sub-x' ? { identityKey: key } : null),
    priorsFor: () => ({ sevenDay: 1730 }),
  });
  const e0 = ue.estimateFor('sub-x', null, T0 + HR);
  ck('live: no ring → estimate = anchor', approx(e0.sevenDay.utilization, 0.40, 0.001));
  // a streamed burst lands in the ring BEFORE any ledger scan sees it
  ue.noteLive({ rid: 'req_live1', accountId: 'sub-x', model: 'claude-fable-5', usd: 173, ts: T0 + 30 * 60000 });
  const e1 = ue.estimateFor('sub-x', null, T0 + HR);
  ck('live: streamed $173 visible immediately (memo busted by noteLive)', approx(e1.sevenDay.utilization, 0.40 + 173 / 1730, 0.001));
  // the ledger scan catches up → the rid dedups out of the live delta
  ledgerRids.add('req_live1');
  ue._estMemo.clear();
  const e2 = ue.estimateFor('sub-x', null, T0 + HR);
  ck('live: ledger-absorbed rid no longer double-counts', approx(e2.sevenDay.utilization, 0.40, 0.001));
  ck('live: wrong-account entries ignored', (() => {
    ue.noteLive({ rid: 'req_other', accountId: 'sub-zzz', model: 'claude-fable-5', usd: 500, ts: T0 + 30 * 60000 });
    const e3 = ue.estimateFor('sub-x', null, T0 + HR);
    return approx(e3.sevenDay.utilization, 0.40, 0.001);
  })());
  // THE est-2× regression (2.267.3, user saw est 27% vs ⟳ 9%): stdout records
  // have NO requestId — the ring keys on msg.id while ledger events key on
  // requestId, so rid-space exclusion never fired. The ledger's `mid` join
  // field must exclude a scanned stream entry.
  ck('live: msg.id-keyed entry excluded once the ledger bakes its mid', (() => {
    ue.noteLive({ rid: 'msg_stream1', accountId: 'sub-x', model: 'claude-fable-5', usd: 100, ts: T0 + 30 * 60000 });
    ue._estMemo.clear();
    const before = ue.estimateFor('sub-x', null, T0 + HR);
    ledgerMids.add('msg_stream1'); // the scan absorbed the JSONL twin (rid=req_…, mid=msg_stream1)
    ue._estMemo.clear();
    const after = ue.estimateFor('sub-x', null, T0 + HR);
    return approx(before.sevenDay.utilization, 0.40 + 100 / 1730, 0.001) && approx(after.sevenDay.utilization, 0.40, 0.001);
  })());
  // Streaming partials: the same msg.id is emitted up to 3× with GROWING
  // usage — a re-note updates the entry to the max (first-wins under-counted)
  ck('live: re-noted rid upgrades to the final (max) usage', (() => {
    ue.noteLive({ rid: 'msg_grow', accountId: 'sub-x', model: 'claude-fable-5', usd: 3, ts: T0 + 30 * 60000 });
    ue.noteLive({ rid: 'msg_grow', accountId: 'sub-x', model: 'claude-fable-5', usd: 17.3, ts: T0 + 31 * 60000 });
    ue.noteLive({ rid: 'msg_grow', accountId: 'sub-x', model: 'claude-fable-5', usd: 5, ts: T0 + 32 * 60000 }); // out-of-order smaller re-emission never downgrades
    ue._estMemo.clear();
    const e4 = ue.estimateFor('sub-x', null, T0 + HR);
    return approx(e4.sevenDay.utilization, 0.40 + 17.3 / 1730, 0.001);
  })());
  fs.rmSync(dir, { recursive: true, force: true });
}

// ── 2.340.0 calibration batch: pair hygiene + ledger tail ────────────────────
{
  // ① cross-source pair is excluded from rate learning
  const a0 = { ...mkAnchor(T0, { u7: 0.10 }), source: 'statusline' };
  const a1 = { ...mkAnchor(T0 + HR, { u7: 0.30, prevFetchedAt: T0, costSince: cs(10) }), source: 'cli-panel' };
  const rX = est.learnRates([a0, a1], { priors: null });
  ck('① cross-source pair excluded (no rate from a statusline→cli-panel step)', !rX.sevenDay);
  const a1s = { ...a1, source: 'statusline', costSince: cs(340) }; // plausible cost — must clear the corroboration floor too
  const rY = est.learnRates([a0, a1s], { priors: null });
  ck('① same-source pair still learns', !!rY.sevenDay);
  // ① uncorroborated jump: 20pt in a minute with $0.10 of ledger cost = poison
  const j0 = { ...mkAnchor(T0, { u7: 0.10 }), source: 'statusline' };
  const j1 = { ...mkAnchor(T0 + 60e3, { u7: 0.30, prevFetchedAt: T0, costSince: cs(0.1) }), source: 'statusline' };
  const rJ = est.learnRates([j0, j1], { priors: null });
  ck('① uncorroborated 20pt jump (cost ≪ prior-implied) does not teach a rate', !rJ.sevenDay);
  // corroborated: same jump with plausible cost (20% of prior-implied ≈ $69) learns
  const k1 = { ...mkAnchor(T0 + 60e3, { u7: 0.30, prevFetchedAt: T0, costSince: cs(340) }), source: 'statusline' };
  const rK = est.learnRates([j0, k1], { priors: null });
  ck('① corroborated jump still learns', !!rK.sevenDay);
}
{
  // ③ ledger-tail extrapolation: burn in the last 120s extends the estimate
  const rates = { sevenDay: { rate: 1 / 1730 } };
  const anchor = mkAnchor(T0, { u7: 0.40 });
  const costFn = (from, to) => (to - from <= 120000 ? cs(60) : cs(173)); // $60 of the $173 landed in the last 2min
  const eOn = est.estimateBuckets({ anchor, rates, costFn, nowMs: T0 + HR });
  const eOff = est.estimateBuckets({ lagS: 0, anchor, rates, costFn, nowMs: T0 + HR });
  ck('③ trailing burn extrapolates the un-scanned tail (+$10 = 60/120×20)', eOn.sevenDay.utilization > eOff.sevenDay.utilization
    && Math.abs((eOn.sevenDay.utilization - eOff.sevenDay.utilization) - (60 / 120 * 20) / 1730) < 0.0005);
  const idleFn = (from, to) => (to - from <= 120000 ? cs(0) : cs(173));
  const eIdle = est.estimateBuckets({ anchor, rates, costFn: idleFn, nowMs: T0 + HR });
  ck('③ idle trail = zero extrapolation', Math.abs(eIdle.sevenDay.utilization - eOff.sevenDay.utilization) < 1e-9);
}

// ── B-a5c0 telemetry hygiene: the calib metric reports only on NEW ground truth, attributed ──
const { UsageAnchors } = require(path.resolve('src/usage-anchors.js'));
const runTicks = (sweep, label) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-est-a5c0-'));
  try {
    const anchors = new UsageAnchors({ dataDir: dir });
    const rates = { sevenDay: { rate: 1 / 1730 }, fiveHour: { rate: 1 / 500 } };
    const estimator = { accountIdsFor: (k, ids) => ids || [], ratesFor: () => rates, invalidate: () => { estimator.inv++; }, inv: 0 };
    const out = [];
    let costCalls = 0;
    const deps = {
      identityKey: 'acct:sub-x', anchors, estimator,
      costBetween: () => { costCalls++; return cs(17.3); }, darkHosts: () => [],
      metric: (name, value, detail) => out.push({ name, value, detail }),
    };
    const R5 = Math.floor(T0 / 1000) + 4 * 3600;
    const reading = (fetchedAt, u7, u5) => ({ accountId: 'sub-x', accountIds: ['sub-x'], cache: { fetchedAt, source: 'statusline', sevenDay: { utilization: u7, resetsAt: RESET }, fiveHour: { utilization: u5, resetsAt: R5 } } });
    const t = [];
    t.push({ r: sweep({ ...deps, group: reading(T0, 0.40, 0.10) }), n: out.length, c: costCalls });           // 0: first reading, nothing to compare
    t.push({ r: sweep({ ...deps, group: reading(T0 + HR, 0.45, 0.11) }), n: out.length, c: costCalls });      // 1: NEW reading, 7d moved 5pt, 5h 1pt
    t.push({ r: sweep({ ...deps, group: reading(T0 + HR, 0.45, 0.11) }), n: out.length, c: costCalls });      // 2: the same snapshot re-seen
    t.push({ r: sweep({ ...deps, group: reading(T0 + HR / 2, 0.40, 0.10) }), n: out.length, c: costCalls });  // 3: an OLDER sibling cache
    return { t, out, inv: estimator.inv, label };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
};
{
  const { t, out, inv } = runTicks(est.sweepAnchorGroup);
  ck('B-a5c0: a first reading anchors but emits nothing (no prior truth to compare)', t[0].r.recorded && t[0].n === 0);
  ck('B-a5c0: a tick WITH a new reading emits exactly once — the moved bucket only (5h moved 1pt ⇒ none)', t[1].r.recorded && t[1].n === 1 && out[0].name === 'usage-est-rel-err-pct');
  ck('B-a5c0: the row carries its attribution {account, bucket}', out[0]?.detail === 'account=sub-x bucket=sevenDay');
  ck('B-a5c0: the value is |predΔ−actΔ|/|actΔ| (pred Δ 1pt vs act 5pt = 80%)', approx(out[0]?.value, 80, 0.01));
  ck('B-a5c0: a tick WITHOUT a new reading (same snapshot) emits nothing and walks no ledger', !t[2].r.fresh && t[2].n === 1 && t[2].c === t[1].c);
  ck('B-a5c0: an older sibling cache is not new truth — nothing emitted, nothing recorded', !t[3].r.fresh && !t[3].r.recorded && t[3].n === 1);
  ck('B-a5c0: the estimator is invalidated once per accepted anchor (2), never on a re-seen tick', inv === 2);
  ck('B-a5c0: calibMetricRows skips a barely-moved bucket and names the account default', est.calibMetricRows({ sevenDay: { rel: null, predDu: 0, actDu: 0.01 }, fiveHour: { rel: 0.5, predDu: 0.02, actDu: 0.04 } }, {}).map((r) => r.detail).join() === 'account=__global__ bucket=fiveHour');
  // NEGATIVE CONTROL — the pre-fix engine shape: calib computed and emitted on EVERY sweep, before
  // (and regardless of) whether the reading was new. The same ticks must go red on it.
  const srcFn = est.sweepAnchorGroup.toString();
  const patched = srcFn
    .replace(/if \(!fresh\) return \{[^}]*\};/, '')
    .replace(/if \(!recorded\) return \{[^}]*\};\n\s*estimator\.invalidate\(identityKey\);/, 'if (recorded) estimator.invalidate(identityKey);');
  const control = patched !== srcFn && new Function('predictCalib', 'calibMetricRows', `return (${patched});`)(est.predictCalib, est.calibMetricRows);
  const ctl = control ? runTicks(control, 'control') : null;
  ck('B-a5c0 control: the every-tick shape floods (the older sibling re-emits) — the legs above can see it', !!ctl && ctl.t[3].n > ctl.t[2].n);
}
{
  // the auto-cli drift read: a raw bucket whose window already reset is NO control
  const NOW = T0 + 10 * HR, nowS = Math.floor(NOW / 1000);
  const estRolled = { sevenDay: { utilization: 0.0 }, fiveHour: { utilization: 0.30 } };
  const rawStale7 = { sevenDay: { utilization: 1.0, resetsAt: nowS - 60 }, fiveHour: { utilization: 0.25, resetsAt: nowS + 3600 } };
  const d1 = est.cliRefreshDrift(estRolled, rawStale7, NOW);
  ck('B-a5c0 drift: a stale raw (resetsAt past) is skipped — drift = the controlled 5h only (5pt, not 100)', approx(d1.drift, 5, 1e-6) && d1.rolled === 1);
  ck('B-a5c0 drift: the scheduler inputs are unchanged (triggerDrift 100, moved) — the refresh a closed window earns still fires', approx(d1.triggerDrift, 100, 1e-6) && d1.moved);
  const d2 = est.cliRefreshDrift({ sevenDay: { utilization: 0.0 } }, { sevenDay: { utilization: 1.0, resetsAt: nowS - 1 } }, NOW);
  ck('B-a5c0 drift: every bucket stale ⇒ drift null (the log says "no control", never a number)', d2.drift === null && d2.rolled === 1);
  const d3 = est.cliRefreshDrift({ sevenDay: { utilization: 0.42 } }, { sevenDay: { utilization: 0.40, resetsAt: nowS + 86400 } }, NOW);
  ck('B-a5c0 drift: a live window still reports its drift (2pt)', approx(d3.drift, 2, 1e-6) && d3.rolled === 0);
  const d4 = est.cliRefreshDrift({ sevenDay: { utilization: 0.42 } }, { sevenDay: { utilization: 0.40 } }, NOW);
  ck('B-a5c0 drift: a resetsAt-less raw keeps its control (no evidence of a roll)', approx(d4.drift, 2, 1e-6));
}
{
  // WIRING PINS — the engine and the auto-cli loop go through the helpers (a pure fix without its call site is dead, 2.355.0)
  const eng = fs.readFileSync(new URL('../src/server/usage-pool-engine.js', import.meta.url), 'utf8');
  const sweepBody = eng.slice(eng.indexOf('function sweepUsageAnchors'), eng.indexOf('function sweepUsageAnchors') + 2500);
  ck('B-a5c0 wiring: sweepUsageAnchors delegates to sweepAnchorGroup and emits no metric of its own', /sweepAnchorGroup\(/.test(sweepBody) && !/__vsMetric\?\.\('usage-est/.test(eng) && !/predictCalib\(/.test(sweepBody));
  const srv = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  // the loop lives in src/server/auto-cli-loop.js since 2.369.163 (quota r2); server.js only starts it
  const loop = fs.readFileSync(new URL('../src/server/auto-cli-loop.js', import.meta.url), 'utf8');
  ck('B-a5c0 wiring: server.js starts THE auto-cli loop module (no inline twin)', /require\('\.\/src\/server\/auto-cli-loop\.js'\)\.createAutoCliLoop\(/.test(srv) && !/estDriftPct:/.test(srv));
  ck('B-a5c0 wiring: the auto-cli loop reads cliRefreshDrift and schedules on its triggerDrift', /cliRefreshDrift\(/.test(loop) && /estDriftPct: dr\.triggerDrift/.test(loop) && !/const cmp = \(e, r\)/.test(loop));
  ck('B-a5c0 wiring: the refresh log prints a drift only when a control existed', /drift == null/.test(loop));
  ck('B-a5c0 wiring: __vsMetric carries a detail', /global\.__vsMetric = \(name, value, detail\) => \{[^\n]*detail/.test(srv));
}
// ── THE BURN (B-f69c ③): the projection's input — utilization per MINUTE ─────
{
  ck('burn: the window is ten minutes', est.BURN_WINDOW_MS === 10 * 60000);
  const rates = { fiveHour: { rate: 1 / 500 }, sevenDay: { rate: 1 / 1730 }, 'scoped:fable': { rate: 1 / 875 } };
  let asked = null;
  const costFn = (from, to) => { asked = [from, to]; return { total: 10, byFamily: { fable: 8, opus: 2, sonnet: 0, haiku: 0, other: 0 } }; };
  const b = est.burnRates({ rates, costFn, nowMs: T0 });
  ck('burn: asks the ledger for the trailing window [now − 10 min, now]', asked && asked[0] === T0 - 600000 && asked[1] === T0);
  ck('burn: 5h = rate × window cost / minutes ($10 over 10 min at 1/500 ⇒ 0.002/min = 0.2 %/min)', approx(b.fiveHour, 0.002));
  ck('burn: 7d over the TOTAL, the Fable cap over the FABLE family cost only', approx(b.sevenDay, 10 / 1730 / 10) && approx(b['scoped:fable'], 8 / 875 / 10));
  const cls = est.burnRates({ rates: { fiveHour: { rate: 1 / 500, rateCw: 1 / 400, rateCr: 1 / 4000, rateFresh: 1 / 200 } }, costFn: () => ({ total: 10, byFamily: {}, byClass: { cw: 4, cr: 4, other: 2 } }), nowMs: T0 });
  ck('burn: the 5h bucket uses the CLASS coefficients when the regression produced them (the predict rule)', approx(cls.fiveHour, (4 / 400 + 4 / 4000 + 2 / 200) / 10));
  ck('burn: no spend in the window ⇒ NO claim (an empty object, never a zero burn)', Object.keys(est.burnRates({ rates, costFn: () => ({ total: 0, byFamily: {} }), nowMs: T0 })).length === 0);
  ck('burn: a bucket without a learned rate has no entry', !('scoped:opus' in b));
  ck('burn: a throwing ledger is no claim, never a throw', Object.keys(est.burnRates({ rates, costFn: () => { throw new Error('x'); }, nowMs: T0 })).length === 0);
  // the class: burnFor goes through the identity's own learned rates AND the live odometer
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-est-burn-'));
  const key = 'org:burn';
  fs.writeFileSync(path.join(dir, 'anchors-org_burn.ndjson'), JSON.stringify({ ...mkAnchor(T0, { u7: 0.40 }), identityKey: key, accountId: 'sub-x' }) + '\n');
  const fakeHistory = { *_events() {}, _cost: () => 0, _evCache: { rids: new Set(), mids: new Set() } };
  const ue = new est.UsageEstimator({ lagS: 0, anchorsDir: dir, usageHistory: fakeHistory, resolveIdentity: (id) => (id === 'sub-x' ? { identityKey: key } : null), priorsFor: () => ({ sevenDay: 1730 }) });
  ck('burnFor: an idle account has no burn', Object.keys(ue.burnFor('sub-x', T0 + HR)).length === 0);
  ue.noteLive({ rid: 'req_burn1', accountId: 'sub-x', model: 'claude-fable-5', usd: 17.3, ts: T0 + HR - 5 * 60000 });
  const bf = ue.burnFor('sub-x', T0 + HR);
  ck('burnFor: a streamed $17.30 five minutes ago on a $1730 week ⇒ 1 % of the week over the 10-min window = 0.1 %/min', approx(bf.sevenDay, 0.01 / 10, 1e-5));
  ck('burnFor: an unknown account is no claim', Object.keys(ue.burnFor('sub-nobody', T0 + HR)).length === 0);
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
