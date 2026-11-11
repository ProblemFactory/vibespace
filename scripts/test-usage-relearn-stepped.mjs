#!/usr/bin/env node
// A RELEARN HOLDS THE LOOP A SLICE A TURN — after ONE whole walk of its identity's lines (lane usage-relearn-stepped, 2026-11-11 —
// on commit B usage-ledger-walk; THE BOUND, round 2 MUST 4, measured by 主开发's panel: the walk before the first slice + a cold
// file's whole read 6.7–8.5 ms at 11 286 lines, 37–62 ms at 200 000, 256–333 ms at 700 000; past the 128 MB live cap a handler
// asking every identity re-reads the evicted ones whole, 1.3 s at 27 × 20 000; commit B more in every cell:
// the owner's bench, a relearn tick of 0 ledger rows still held the loop 0.69 s; the largest identity, 11 286 anchor pairs,
// 106 ms in ONE ratesFor). src/usage-estimator.js: extractPairs is ONE generator (_extractPairsSteps) driven whole or
// RELEARN_STEP_LINES lines a turn; ratesFor serves the rates it has while ONE fold an identity runs (none yet ⇒ «still
// learning»: null), judged after every turn (the memo's epoch, the identity's lines — a move abandons it, the next ask folds
// again), the fit (_fitRates) at the end, the rates swapped in. Pins:
//   §1 THE SLICE — at most RELEARN_STEP_LINES pairs a turn, the first slice inside the ask, the fold lands later; RED: the
//      slice back at Infinity (commit B's one synchronous fold)
//   §2 EQUALITY — the stepped fold's rates EQUAL the synchronous learnRates bit for bit: 32 synthetic seeds (taints, scoped
//      buckets, class splits, absent counts) at three slice sizes, and real worlds through the estimator
//   §3 ONE EPOCH — a pricing edit / a rewritten ledger / new anchor lines mid-fold ⇒ abandoned, the next ask folds again, the
//      landed rates the synchronous fold's of the NEW epoch / lines
//   §4 ONE FOLD — asks while a fold runs join it (each pair costed once)
//   §5 THE CACHED RATES MEANWHILE — every estimate and every pool verdict inside a fold equals one on the cached rates; the
//      first learn of an identity with none ⇒ «still learning» (no estimate) until it lands
//   §6 THE ROADS — the boot migration's synchronous learnNow is ratesFor's only other learner; the fold map holds ≤ 1 an identity
//   ROUND 2 (主开发 23:07Z): §7 THE TAIL READ ONLY ON PROVEN BYTES (the six rewrite scenes + a read between + another file
//   taking the inode: the cached lines = a fresh read; a plain append reads its tail only) · §8 THE ESTIMATES GO WHEN NEWER
//   RATES LAND (a restart, a sweep behind a large identity: the first pass after the landing = commit B's) · §9 A FOLD IS
//   ABANDONED ONLY WHEN ITS OWN INPUTS MOVED (a device's push between every two turns: 0 abandoned, the rates land; a real
//   anchor append abandons once) · §10 THE REAL SCHEDULER (a loop pass between every two turns, counted) · §11 THE RATES
//   MEANWHILE = commit B's at the instant before the move, the landed = B's after it · §12 a fold that throws (said once, a
//   backoff), an estimator let go (folds and writes nothing; rates.json keeps the newest learning), the smallest first
//   ROUNDS 3–4 live in test-usage-relearn-cap (§13–§21). ROUND 3 (主开发 01:32Z): §13 A FOLD OWNS WHAT IT FOLDS — past the line cache's live cap (scaled: the same rule at a
//   lower cap) every identity lands, read whole once, no read after the landing, ONE fold's uncached lines at a time ·
//   §14 the dirty mark · §15 a late row mid-fold · §16 the fast path's signature · §17 a repaired file retries at once ·
//   §18 a filesystem with no birth time (the proof windows carry the tail decision)
//   ROUND 4 (主开发 05:21Z): §19 NO DECISION ON A MIXED BASIS (a cold boot reads every member raw until all can be estimated;
//   a restart seeds the last rates from rates.json) · §20 the pins that bite (an uncached identity's rates = a synchronous
//   fold's; the 4 MB stop; one fold holds uncached lines — driven by an eviction mid-fold) · §21 the basis bounded (round 4b:
//   a member whose fold throws, whose file keeps changing or whose meta is starved holds its pool raw ≤ 60 s, said by name)
// Run: node scripts/test-usage-relearn-stepped.mjs (~4 s, no network; RLS_SIZES=full adds §9's 200 000 / 700 000-line rows)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 600) : '')); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
import { rmWorld, DAY, NOW, world, near, same, tick, EST, STEP, stepper, counting } from './usage-relearn-world.mjs'; // the world and its helpers (shared with test-usage-relearn-cap)

console.log('§1 THE SLICE — at most ' + STEP + ' pairs a turn; the first slice inside the ask; the fold lands later');
{
  const w = world(REPO, { seed: 51, rows: 2000, pairs: [7000, 300, 120, 400], steps: [2, 30, 60, 20] });
  const S = stepper(w.est);
  w.est.ratesFor('email:a@x'); while (S.q.length) S.turn(); // the prime + the first learn (stepped too) landed
  const pairs = counting(w.est);
  w.est.invalidate('email:a@x');
  const cached = w.est._rateCache.get('email:a@x').rates;
  let calls = pairs(); const first = w.est.ratesFor('email:a@x'); const inAsk = pairs() - calls;
  const perTurn = []; while (S.q.length) { calls = pairs(); S.turn(); perTurn.push(pairs() - calls); }
  const landed = w.est._rateCache.get('email:a@x'), lines = w.est.lines('email:a@x');
  const sync = EST.learnRates(lines, { priors: w.est.priorsFor('email:a@x'), costFn: w.est._costFn(w.est.accountIdsFor('email:a@x')) });
  ok(first === cached && inAsk <= STEP && perTurn.length >= 3 && perTurn.every((n) => n <= STEP) && landed && !landed.stale && same(landed.rates, sync),
    `THE SLICE (a slice a turn, after ONE walk of the identity's lines before the first — the bound, measured by 主开发's panel: 6.7–8.5 ms at 11 286 lines, 37–62 ms at 200 000, 256–333 ms at 700 000): a relearn of ${lines.length} anchor lines — the ask folded ${inAsk} pairs and answered the CACHED rates; ${perTurn.length} more turns of ${perTurn.join(' / ')} pairs (each ≤ ${STEP}); the landed rates are the synchronous fold's, bit for bit`, { inAsk, perTurn });
  rmWorld(w);
}
{
  // RED: the slice back at Infinity — commit B's road: ONE synchronous fold of every pair inside the ask
  const M = mutantCopies('usage-relearn-stepped', REPO), src = read('src/usage-estimator.js');
  const from = 'const RELEARN_STEP_LINES = 2000;';
  ok(src.includes(from), 'the slice patch site exists');
  const EM = require(M.write('src/usage-estimator.js', src.replace(from, 'const RELEARN_STEP_LINES = Infinity;'), 'one-fold'));
  const w = world(REPO, { seed: 51, rows: 2000, pairs: [7000, 300, 120, 400], steps: [2, 30, 60, 20] });
  const est = new EM.UsageEstimator({ anchorsDir: w.adir, usageHistory: w.uh, resolveIdentity: w.est.resolveIdentity, lagS: 20 });
  est.ratesFor('email:a@x'); const pairs = counting(est); est.invalidate('email:a@x');
  const c0 = pairs(); est.ratesFor('email:a@x'); const inAsk = pairs() - c0;
  ok(inAsk > STEP * 3, `RED: the slice at Infinity (commit B) ⇒ ONE ask folds ${inAsk} pairs synchronously (the owner's largest: 11 286 pairs, 106 ms)`, inAsk);
  rmWorld(w);
}

{
  // ONE BUDGET A TURN: an anchor sweep's invalidation makes EVERY identity stale and the next GET asks them all in ONE handler —
  // together they fold at most one slice (RELEARN_STEP_LINES pairs) in that turn; the rest folds on the next turns
  const run = (EM) => {
    const w = world(REPO, { seed: 59, rows: 2000, pairs: [3000, 2500, 2000, 2500], steps: [2, 3, 4, 3] });
    const est = EM ? new EM.UsageEstimator({ anchorsDir: w.adir, usageHistory: w.uh, resolveIdentity: w.est.resolveIdentity, lagS: 20 }) : w.est;
    const S = stepper(est); for (const [key] of w.IDS) est.ratesFor(key); while (S.q.length) S.turn();
    const pairs = counting(est); for (const [key] of w.IDS) est.invalidate(key);
    const c0 = pairs(); for (const [key] of w.IDS) est.ratesFor(key); const inHandler = pairs() - c0; // the GET: every identity, one handler
    const perTurn = []; while (S.q.length) { const c = pairs(); S.turn(); perTurn.push(pairs() - c); }
    const landed = w.IDS.every(([key]) => { const c = est._rateCache.get(key); return c && !c.stale; });
    rmWorld(w);
    return { inHandler, perTurn, landed };
  };
  const fx = run(null);
  ok(fx.inHandler <= STEP && fx.perTurn.every((n) => n <= STEP) && fx.landed, `ONE BUDGET A TURN: every identity stale (an anchor sweep's invalidation), one handler asks all four (10 000 pairs) — it folds ${fx.inHandler} pairs (≤ ${STEP}) and answers the cached rates; the rest folds ${fx.perTurn.length} later turns of ≤ ${STEP} (${fx.perTurn.join(' / ')}), all four land`, fx);
  const M = mutantCopies('usage-relearn-stepped-turn', REPO), src = read('src/usage-estimator.js'), from = '    if (this._turnLeft === undefined) this._turnLeft = step;';
  const EM = src.includes(from) ? require(M.write('src/usage-estimator.js', src.replace(from, '    this._turnLeft = step;'), 'budget-an-ask')) : null;
  const rd = EM ? run(EM) : null;
  ok(!!rd && rd.inHandler > STEP * 2, `RED: a budget an ASK instead of a turn ⇒ the one handler folds ${rd && rd.inHandler} pairs (a slice an identity — the owner's 27 after a sweep: ≈ 0.3 s)`, rd);
}
console.log('§2 EQUALITY — the stepped fold IS the synchronous learnRates, bit for bit');
{
  // 32 synthetic seeds: anchors with absent counts, anomalous decreases (the taint and its bounce-back), uncorroborated jumps,
  // window rolls, scoped buckets, class-split costs — a deterministic costFn — at three slice sizes
  const synth = (seed) => {
    let s = seed * 7919 + 1; const r = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    const n = 1500 + Math.floor(r() * 3500), out = []; let prev = null, u5 = 0.1, u7 = 0.1, uf = 0.05, t = NOW - 30 * DAY;
    for (let k = 0; k < n; k++) {
      t += 60e3 + Math.floor(r() * 600e3);
      const roll5 = r() < 0.05, roll7 = r() < 0.01;
      if (roll5) u5 = 0; if (roll7) { u7 = 0; uf = 0; }
      u5 = Math.min(0.999, Math.max(0, u5 + (r() < 0.04 ? -0.05 : r() * 0.03) + (r() < 0.02 ? 0.12 : 0)));
      u7 = Math.min(0.999, u7 + r() * 0.004); uf = Math.min(0.999, uf + r() * 0.003);
      const buckets = { fiveHour: { u: u5, resetsAt: Math.floor(t / 1000) + 3600 * (roll5 ? 5 : 3) }, sevenDay: { u: u7, resetsAt: Math.floor(t / 1000) + 86400 * 3 },
        scopedWeekly: r() < 0.7 ? [{ name: 'Fable', u: uf, resetsAt: Math.floor(t / 1000) + 86400 * 3, asOf: r() < 0.2 && prev ? prev.fetchedAt : t }] : [] };
      const rec = { fetchedAt: t, source: r() < 0.97 ? 'statusline' : 'cli-panel', accountId: 'sub-a', buckets, prevFetchedAt: prev ? prev.fetchedAt : null,
        costSince: prev ? { total: Math.round(r() * 300) / 100, byFamily: { fable: 0.1, opus: 0.2, sonnet: 0, haiku: 0, other: 0 }, byClass: r() < 0.5 ? { cw: 0.1, cr: 0.05, other: 0.1 } : undefined } : null, ...(r() < 0.01 ? { dark: ['H1'] } : {}) };
      out.push(rec); prev = rec;
    }
    const costFn = (a, b) => { const x = Math.sin(a / 1e7) * 0.5 + 0.6, y = (b - a) / 3.6e6; return { total: Math.round(x * y * 1e6) / 1e6, byFamily: { fable: x * 0.1, opus: x * y * 0.7, sonnet: 0, haiku: 0, other: 0 }, byClass: { cw: x * y * 0.2, cr: x * y * 0.1, other: x * y * 0.4 } }; };
    return { lines: out, costFn };
  };
  const priors = { fiveHour: 1 / 139, sevenDay: 1 / 1500, 'scoped:fable': 1 / 900 };
  let seeds = 0, eq = 0, bad = null;
  for (let seed = 1; seed <= 32; seed++) {
    const { lines, costFn } = synth(seed), sync = EST.learnRates(lines, { priors, costFn });
    for (const step of [1, 700, STEP]) {
      const g = EST._extractPairsSteps(lines, { costFn }, step); let r; while (!(r = g.next()).done);
      const stepped = EST._fitRates(r.value, priors);
      seeds++; if (same(stepped, sync)) eq++; else bad = bad || { seed, step };
    }
  }
  ok(eq === seeds && seeds === 96, `EQUALITY: 32 synthetic seeds × three slices (1 line, 700, ${STEP}) — ${eq} of ${seeds} folds equal the synchronous learnRates bit for bit (taints, bounce-backs, jumps, rolls, scoped, class splits)`, bad);
}
{
  // through the estimator, on real worlds: the stepped relearn's landed rates = learnRates over the same lines and costs
  let n = 0, eq = 0;
  for (const seed of [52, 53, 54]) {
    const w = world(REPO, { seed, rows: 3000, pairs: [4500, 300, 120, 2600], steps: [3, 30, 60, 5] }), S = stepper(w.est);
    for (const [key] of w.IDS) { w.est.ratesFor(key); while (S.q.length) S.turn(); }
    for (const [key] of w.IDS) {
      w.est.invalidate(key); w.est.ratesFor(key); while (S.q.length) S.turn();
      const sync = EST.learnRates(w.est.lines(key), { priors: w.est.priorsFor(key), costFn: w.est._costFn(w.est.accountIdsFor(key)) });
      n++; if (same(w.est._rateCache.get(key).rates, sync)) eq++;
    }
    rmWorld(w);
  }
  ok(eq === n && n === 12, `EQUALITY through the estimator: 3 worlds × 4 identities (up to 4 500 lines: stepped) — ${eq} of ${n} landed rates equal the synchronous learnRates over the same lines and the same costs`);
}

console.log('§3 ONE EPOCH — a fold is of one price table, one ledger, one set of lines');
{
  const scene = async (mover, EM = null) => {
    const w = world(REPO, { seed: 55, rows: 2000, pairs: [4500, 300, 120, 400], steps: [2, 30, 60, 20] });
    if (EM) { const e2 = new EM.UsageEstimator({ anchorsDir: w.adir, usageHistory: w.uh, resolveIdentity: w.est.resolveIdentity, lagS: 20 }); w.est = e2; }
    const S = stepper(w.est); w.est.ratesFor('email:a@x'); while (S.q.length) S.turn(); // the first learn landed
    w.est.invalidate('email:a@x'); w.est.ratesFor('email:a@x'); S.turn(); // the relearn's fold is in flight
    if (mover === 'pricing') w.uh.setPricing({ accounts: { 'sub-a': { discount: 0.25 } } });
    else if (mover === 'rebuild') w.uh._swapCache({ ...w.uh._evCache });
    else { const f = path.join(w.adir, 'anchors-' + w.UA.anchorSlug('email:a@x') + '.ndjson'); const ls = fs.readFileSync(f, 'utf8').trim().split('\n'); const last = JSON.parse(ls[ls.length - 1]); const rec = { ...last, fetchedAt: last.fetchedAt + 60e3, ts: last.ts + 60e3, prevFetchedAt: last.fetchedAt }; fs.appendFileSync(f, JSON.stringify(rec) + '\n'); if (mover !== 'lines-quiet') w.est.invalidate('email:a@x'); }
    const ab0 = w.est.foldsAbandoned || 0;
    while (S.q.length) S.turn();
    const abandoned = (w.est.foldsAbandoned || 0) - ab0, c = w.est._rateCache.get('email:a@x');
    for (let k = 0; k < 3 && w.uh.ledgerLoading(); k++) await tick();
    w.est.ratesFor('email:a@x'); while (S.q.length) S.turn(); // the next ask folds again, under the new epoch / lines
    for (let k = 0; k < 400 && w.uh.ledgerLoading(); k++) { await tick(); w.est.ratesFor('email:a@x'); while (S.q.length) S.turn(); }
    const landed = w.est._rateCache.get('email:a@x'), lines = w.est.lines('email:a@x');
    const sync = EST.learnRates(lines, { priors: w.est.priorsFor('email:a@x'), costFn: w.est._costFn(w.est.accountIdsFor('email:a@x')) });
    rmWorld(w);
    return { mover, abandoned, staleMeanwhile: !!(c && c.stale), equal: !!landed && !landed.stale && same(landed.rates, sync) };
  };
  const res = []; for (const m of ['pricing', 'rebuild', 'lines', 'lines-quiet']) res.push(await scene(m)); // lines-quiet: the anchor file grew, no invalidate — the judge sees it by the file itself (round 2, MUST 3)
  const M = mutantCopies('usage-relearn-stepped-epoch', REPO), src = read('src/usage-estimator.js'), from = '        if (f.chunks && f.moved()) {';
  const blind = src.includes(from) ? require(M.write('src/usage-estimator.js', src.replace(from, '        if (false) {'), 'fold-blind')) : null;
  const red = []; if (blind) for (const m of ['pricing', 'lines-quiet']) red.push(await scene(m, blind));
  ok(res.every((x) => x.abandoned === 1 && x.equal), `ONE EPOCH: a pricing edit / a rebuilt ledger / new anchor lines mid-fold ⇒ the fold ABANDONED at its next turn (${res.map((x) => x.abandoned).join(' / ')}), the next ask folded again, and the landed rates equal the synchronous fold of the NEW price table / ledger / lines`, res);
  ok(!!blind && red.every((x) => !x.equal), `RED: a fold blind to its epoch and lines (the turn's judge removed) ⇒ it lands a fold over two price tables / the old line set as fresh (an append with an invalidate heals at the next ask: the landing is stale): ${red.map((x) => `${x.mover} equal=${x.equal}`).join(', ')}`, red);
}

console.log('§4 ONE FOLD — asks while it runs join it');
{
  const w = world(REPO, { seed: 56, rows: 2000, pairs: [6000, 300, 120, 400], steps: [2, 30, 60, 20] });
  const S = stepper(w.est); w.est.ratesFor('email:a@x'); while (S.q.length) S.turn(); const pairs = counting(w.est);
  w.est.invalidate('email:a@x'); const f0 = w.est.foldsStarted || 0, c0 = pairs();
  for (let k = 0; k < 5; k++) { w.est.ratesFor('email:a@x'); S.turn(); }
  while (S.q.length) S.turn();
  const started = (w.est.foldsStarted || 0) - f0, costed = pairs() - c0, n = w.est.lines('email:a@x').filter((l) => l.prevFetchedAt).length;
  {
    const M = mutantCopies('usage-relearn-stepped-join', REPO), src = read('src/usage-estimator.js'), from = '    if (run && !run.done && run.loading === loading) {';
    const EM = src.includes(from) ? require(M.write('src/usage-estimator.js', src.replace(from, '    if (false) {'), 'no-join')) : null;
    const w2 = world(REPO, { seed: 56, rows: 2000, pairs: [6000, 300, 120, 400], steps: [2, 30, 60, 20] });
    const e2 = EM ? new EM.UsageEstimator({ anchorsDir: w2.adir, usageHistory: w2.uh, resolveIdentity: w2.est.resolveIdentity, lagS: 20 }) : null;
    let st2 = 0; if (e2) { const S2 = stepper(e2); e2.ratesFor('email:a@x'); while (S2.q.length) S2.turn(); e2.invalidate('email:a@x'); const g0 = e2.foldsStarted || 0; for (let k = 0; k < 5; k++) { e2.ratesFor('email:a@x'); S2.turn(); } while (S2.q.length) S2.turn(); st2 = (e2.foldsStarted || 0) - g0; }
    fs.rmSync(w2.data, { recursive: true, force: true });
    ok(!!EM && st2 >= 5, `RED: the join removed ⇒ five asks start ${st2} folds (each re-costing every pair)`, st2);
  }
  ok(started === 1 && costed <= n && w.est._folds.size === 0, `ONE FOLD: five asks while a relearn ran ⇒ ${started} fold, ${costed} pair costs for ${n} pairs (each once), the fold map empty after it landed`, { started, costed, n });
  rmWorld(w);
}

console.log('§5 THE CACHED RATES MEANWHILE — every estimate and pool verdict inside a fold is the cached rates\'');
{
  const AP = require('../src/account-pool-auto.js'), { overlayCache } = EST;
  const w = world(REPO, { seed: 57, rows: 2000, pairs: [6500, 2400, 120, 2200], steps: [2, 3, 60, 4] }), S = stepper(w.est);
  for (const [key] of w.IDS) { w.est.ratesFor(key); while (S.q.length) S.turn(); }
  const frozen = new Map(w.IDS.map(([key]) => [key, w.est._rateCache.get(key).rates]));
  const twin = new (w.est.constructor)({ anchorsDir: w.adir, usageHistory: w.uh, resolveIdentity: w.est.resolveIdentity, lagS: 20 });
  twin.ratesFor = (key) => frozen.get(key) || null; twin._primePairs = () => { };
  const members = ['sub-a', 'sub-b', 'sub-c', 'sub-d'];
  const rawOf = (est, id) => { const key = est.resolveIdentity(id).identityKey, ls = est.lines(key), l = ls[ls.length - 1]; return { fetchedAt: l.fetchedAt, fiveHour: { utilization: l.buckets.fiveHour.u, resetsAt: l.buckets.fiveHour.resetsAt }, sevenDay: { utilization: l.buckets.sevenDay.u, resetsAt: l.buckets.sevenDay.resetsAt }, scopedWeekly: [] }; };
  for (const [key] of w.IDS) w.est.invalidate(key);
  let verdicts = 0, differ = 0, estimates = 0, estDiffer = 0, inside = 0;
  for (let k = 0; k < 4; k++) {
    for (const id of members) w.est.ratesFor(w.est.resolveIdentity(id).identityKey); // the folds start / continue
    inside += w.est._folds.size ? 1 : 0;
    const nowMs = NOW + k * 5000; w.est._estMemo.clear(); twin._estMemo.clear();
    for (const id of members) { estimates++; if (!same(w.est.estimateFor(id, null, nowMs), twin.estimateFor(id, null, nowMs))) estDiffer++; }
    for (const currentId of members) for (const proactive of [false, true]) {
      const args = { currentId, members, nowSec: Math.floor(nowMs / 1000), proactive, hot: proactive };
      const a = AP.decidePoolSwitch({ ...args, readCache: (id) => overlayCache(rawOf(w.est, id), w.est.estimateFor(id, null, nowMs)) });
      const b = AP.decidePoolSwitch({ ...args, readCache: (id) => overlayCache(rawOf(twin, id), twin.estimateFor(id, null, nowMs)) });
      verdicts++; if (!same(a, b)) differ++;
    }
    S.turn();
  }
  while (S.q.length) S.turn();
  ok(inside >= 3 && estDiffer === 0 && differ === 0, `THE CACHED RATES MEANWHILE: at ${inside} instants inside the folds, ${estimates} estimates and ${verdicts} pool verdicts (decidePoolSwitch, every member current, proactive and not) EQUAL those on the cached rates (0 / 0 differ)`, { inside, estDiffer, differ });
  rmWorld(w);
}
{
  // the FIRST learn of an identity with no rates and more than a slice of pairs: «still learning» — no rates, no estimate —
  // until its fold lands (never a synchronous fold)
  const w = world(REPO, { seed: 58, rows: 2000, pairs: [6000, 300, 120, 400], steps: [2, 30, 60, 20] });
  const S = stepper(w.est); w.est.primeOpts = { syncMaxRows: 1e9 }; w.est.primeIfCold(); // the memo primed (small ledger: at once)
  const pairs = counting(w.est); const c0 = pairs();
  const r0 = w.est.ratesFor('email:a@x'), inAsk = pairs() - c0, e0 = w.est.estimateFor('sub-a', null, NOW);
  while (S.q.length) S.turn();
  const r1 = w.est.ratesFor('email:a@x'), e1 = w.est.estimateFor('sub-a', null, NOW); // round 2: no memo cleared by hand — the landing's version does it
  ok(r0 === null && e0 === null && inAsk <= STEP && !!r1 && !!e1, `THE FIRST LEARN: an identity with no rates and ${w.est.lines('email:a@x').length} anchor lines ⇒ «still learning» (no rates, no estimate; the ask folded ${inAsk} pairs), and the rates and the estimate once its fold landed`, { inAsk, r1: !!r1, e1: !!e1 });
  rmWorld(w);
}

console.log('§6 THE ROADS');
{
  // THE ANCHOR LINES BY THEIR TAIL: an anchor sweep appends a record and invalidates every identity — the grown file is read by
  // its new bytes only (no whole-file read), a new array equal to a whole read's (an out-of-order record sorted as a whole read
  // sorts it); a rewrite (tmp + rename: a new inode) is read whole
  const w = world(REPO, { seed: 60, rows: 2000, pairs: [3000, 300, 120, 400], steps: [2, 30, 60, 20] }), key = 'email:a@x';
  const f = path.join(w.adir, 'anchors-' + w.UA.anchorSlug(key) + '.ndjson');
  const before = w.est.lines(key); const whole = () => new (w.est.constructor)({ anchorsDir: w.adir, usageHistory: w.uh, resolveIdentity: w.est.resolveIdentity, lagS: 20 }).lines(key);
  let reads = 0; const realRead = fs.readFileSync; fs.readFileSync = function (fp, ...a) { if (String(fp) === f) reads++; return realRead.call(this, fp, ...a); };
  let r = {};
  try {
    const ls = realRead(f, 'utf8').trim().split('\n'), last = JSON.parse(ls[ls.length - 1]);
    fs.appendFileSync(f, JSON.stringify({ ...last, fetchedAt: last.fetchedAt + 60e3, ts: last.ts + 60e3, prevFetchedAt: last.fetchedAt }) + '\n');
    w.est.invalidate(key); const a1 = w.est.lines(key); r.tail = reads; r.eq1 = same(a1, whole()) && a1 !== before && a1.length === before.length + 1;
    fs.appendFileSync(f, JSON.stringify({ ...last, fetchedAt: last.fetchedAt - 30e3, ts: last.ts - 30e3 }) + '\n'); // a record that sorts BEFORE the last
    reads = 0; const a2 = w.est.lines(key); r.tail2 = reads; r.eq2 = same(a2, whole());
    const text = realRead(f, 'utf8'); fs.writeFileSync(f + '.tmp', text.split('\n').slice(0, -3).join('\n') + '\n'); fs.renameSync(f + '.tmp', f); // a repair's rewrite
    reads = 0; const a3 = w.est.lines(key); r.rewrite = reads; r.eq3 = same(a3, whole());
  } finally { fs.readFileSync = realRead; }
  ok(r.tail === 0 && r.eq1 && r.tail2 === 0 && r.eq2 && r.rewrite === 1 && r.eq3, `THE ANCHOR LINES BY THEIR TAIL: a grown anchor file read by its new bytes only (${r.tail} whole reads), the array equal to a whole read's (also with a record that sorts before the last: ${r.eq2}); a repair's rewrite (a new inode) read whole (${r.rewrite})`, r);
  rmWorld(w);
}
{
  const callers = execFileSync('git', ['-C', REPO, 'grep', '-n', '\\.learnNow(', '--', 'src', 'server.js'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  ok(callers.length === 1 && /ledger-slot-backfill\.js/.test(callers[0]), `the synchronous learn (learnNow) has ONE caller — the boot migration (${callers.map((c) => c.split(':')[0]).join(', ')}); every other learner goes through ratesFor's slices`, callers);
}
console.log('§7 THE TAIL READ ONLY ON PROVEN BYTES (round 2, MUST 1)');
{
  const KEY = 'email:big', T0 = 1.7e12;
  const mk = (i, x = {}) => ({ fetchedAt: T0 + i * 60e3, ts: T0 + i * 60e3, prevFetchedAt: i ? T0 + (i - 1) * 60e3 : undefined, costSince: { total: 1 + (i % 7) * 0.1 }, buckets: { fiveHour: { u: (i % 300) / 300 }, sevenDay: { u: (i % 900) / 900 } }, ...x });
  const txt = (rs) => rs.map((r) => JSON.stringify(r)).join('\n') + '\n';
  const atomic = (fp, t) => { fs.writeFileSync(fp + '.tmp', t); fs.renameSync(fp + '.tmp', fp); }; // reading-repair's shape
  const base = []; for (let i = 0; i < 3000; i++) base.push(mk(i));
  const drop = base.filter((r, i) => i % 40 !== 3), rekey = (rs, slot) => rs.map((r) => ({ ...r, slot }));
  const SCENES = {
    'two rewrites, no read between, the second grows': ({ fp }) => { atomic(fp, txt(drop)); atomic(fp, txt(rekey(drop, 'sub-a-rekeyed').concat([mk(5000), mk(5001), mk(5002)]))); },
    'two rewrites, the second shrinks': ({ fp }) => { atomic(fp, txt(drop)); atomic(fp, txt(drop.filter((r, i) => i % 30 !== 5))); },
    'two rewrites with a read between': ({ fp, e }) => { atomic(fp, txt(drop)); e.invalidate(KEY); e.lines(KEY); atomic(fp, txt(rekey(drop, 'sub-a-rekeyed').concat([mk(5000)]))); },
    'two rewrites, other identities\' files between': ({ fp, dir }) => { atomic(fp, txt(drop)); for (let k = 0; k < 5; k++) atomic(path.join(dir, 'anchors-org_o' + k + '.ndjson'), txt(base.slice(0, 50))); atomic(fp, txt(rekey(drop, 'x').concat([mk(5000)]))); },
    'one rewrite that grows': ({ fp }) => { atomic(fp, txt(rekey(base, 'x'))); },
    'an in-place rewrite that grows (no rename: the inode kept)': ({ fp }) => { fs.writeFileSync(fp, txt(rekey(drop, 'x'))); },
    'a delete + re-create that grows': ({ fp }) => { fs.unlinkSync(fp); fs.writeFileSync(fp, txt(rekey(base, 'y'))); },
    'another file takes the inode': ({ fp, dir }) => { fs.unlinkSync(fp); const o = path.join(dir, 'other.ndjson'); fs.writeFileSync(o, txt(rekey(base, 'z'))); fs.renameSync(o, fp); },
  };
  const run = (UE) => {
    const out = [];
    for (const [name, fn] of Object.entries(SCENES)) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-rls-tail-')), mkE = () => new UE({ anchorsDir: dir, usageHistory: null, resolveIdentity: () => null, lagS: 0 });
      const e = mkE(), fp = e._file(KEY); fs.writeFileSync(fp, txt(base)); e.lines(KEY);
      const ino0 = fs.statSync(fp).ino; fn({ fp, e, dir });
      const got = e.lines(KEY), fresh = mkE().lines(KEY);
      fs.appendFileSync(fp, txt([mk(99999)])); e.invalidate(KEY); // …and the next append, read by its tail
      const got2 = e.lines(KEY), fresh2 = mkE().lines(KEY);
      out.push({ name, sameIno: fs.statSync(fp).ino === ino0, equal: same(got, fresh), after: same(got2, fresh2), n: [got.length, fresh.length] });
      fs.rmSync(dir, { recursive: true, force: true });
    }
    return out;
  };
  const r = run(EST.UsageEstimator);
  ok(r.every((x) => x.equal && x.after), `THE TAIL READ ONLY ON PROVEN BYTES: ${r.length} rewrite scenes (${r.filter((x) => x.sameIno).length} kept or got back the inode) — the cached lines equal a fresh read in each, and after the next append too: ${r.map((x) => `${x.name} ${x.equal && x.after ? '=' : '≠ ' + x.n.join('/')}`).join(' · ')}`, r);
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-rls-tail-')), e = new EST.UsageEstimator({ anchorsDir: dir, usageHistory: null, resolveIdentity: () => null, lagS: 0 }), fp = e._file(KEY);
    fs.writeFileSync(fp, txt(base)); e.lines(KEY); const w0 = e.wholeReads || 0, t0 = e.tailReads || 0;
    for (let k = 0; k < 5; k++) { fs.appendFileSync(fp, txt([mk(3000 + k)])); e.invalidate(KEY); e.lines(KEY); }
    const fresh = new EST.UsageEstimator({ anchorsDir: dir, usageHistory: null, resolveIdentity: () => null, lagS: 0 }).lines(KEY);
    ok((e.wholeReads || 0) === w0 && (e.tailReads || 0) - t0 === 5 && same(e.lines(KEY), fresh), `…a plain append is still read by its tail: 5 appends ⇒ ${(e.tailReads || 0) - t0} tail reads, ${(e.wholeReads || 0) - w0} whole reads, the lines a fresh read's`);
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const M = mutantCopies('usage-relearn-stepped-splice', REPO), src = read('src/usage-estimator.js');
  const a = "    if (c && c.wins && c.ino === st.ino && (c.btime || 0) === (st.birthtimeMs || 0) && st.size > c.size && c.endsNl) {", b = '        for (const [off, want] of c.wins) {';
  const EM = src.includes(a) && src.includes(b) ? require(M.write('src/usage-estimator.js', src.replace(a, '    if (c && c.wins && c.ino === st.ino && st.size > c.size && c.endsNl) {').replace(b, '        for (const [off, want] of []) {'), 'splice')) : null;
  const R = EM ? run(EM.UsageEstimator) : null;
  ok(!!R && R.some((x) => !x.equal || !x.after), `RED: the round-1 rule (the same inode + a larger size = appended) splices: ${R && R.filter((x) => !x.equal || !x.after).map((x) => x.name + ' ' + x.n.join('/')).join(' · ')}`, R);
}

console.log('§8 THE ESTIMATES GO WHEN NEWER RATES LAND (round 2, MUST 2)');
{
  // commit B's road for the same world at the same instant: one synchronous fold an identity (the slice at Infinity)
  const bRoad = (w) => { const e = new (w.est.constructor)({ anchorsDir: w.adir, usageHistory: w.uh, resolveIdentity: w.est.resolveIdentity, lagS: 20 }); e.relearnStepLines = Infinity; e.relearnNext = (fn) => fn(); return e; };
  const members = ['sub-a', 'sub-b', 'sub-c', 'sub-d'];
  const restart = (UE) => {
    const w = world(REPO, { seed: 71, rows: 2000, pairs: [2100, 2100, 2100, 2100], steps: [3, 3, 3, 3] }); // each just over one slice: none lands in its own ask
    const est = UE ? new UE({ anchorsDir: w.adir, usageHistory: w.uh, resolveIdentity: w.est.resolveIdentity, lagS: 20 }) : w.est;
    const S = stepper(est); est.primeOpts = { syncMaxRows: 1e9 }; est.primeIfCold(); // a restart: the memo primed, no rates yet
    const p1 = members.map((id) => est.estimateFor(id, null, NOW)); // the first pass: «still learning»
    let turns = 0; while (S.q.length) { S.turn(); turns++; }
    const p2 = members.map((id) => est.estimateFor(id, null, NOW)); // the first pass after every identity landed (the same instant: an estimate depends on its now)
    const B = bRoad(w); B.primeOpts = { syncMaxRows: 1e9 }; B.primeIfCold(); const pb = members.map((id) => B.estimateFor(id, null, NOW));
    rmWorld(w);
    return { nullFirst: p1.filter((x) => x === null).length, equalB: p2.filter((x, i) => x && same(x, pb[i])).length, turns };
  };
  const behind = (UE) => {
    const w = world(REPO, { seed: 73, rows: 2000, pairs: [1750, 300, 120, 400], steps: [2, 30, 60, 20] });
    const est = UE ? new UE({ anchorsDir: w.adir, usageHistory: w.uh, resolveIdentity: w.est.resolveIdentity, lagS: 20 }) : w.est, S = stepper(est);
    est.primeOpts = { syncMaxRows: 1e9 }; est.primeIfCold(); // the first learn's prime at once (this scene is the relearn after a sweep)
    for (const [key] of w.IDS) { est.ratesFor(key); while (S.q.length) S.turn(); }
    // the ledger moves for sub-b (its rates will differ), then a sweep invalidates every identity; one handler asks the large one first
    const evs = []; for (let k = 0; k < 400; k++) evs.push(w.mkRow(NOW - 60e3 - 290 * 30 * 60e3 + k * 20 * 60e3, { acct: 'sub-b', i: 900000 }));
    for (let k = 0; k < 3; k++) evs.push(w.mkRow(NOW - 40e3 + k * 5e3, { acct: 'sub-b', i: 2000000 })); // …and spend since its last anchor: the estimate reads its rates
    w.append(evs);
    for (const [key] of w.IDS) est.invalidate(key);
    est.estimateFor('sub-a', null, NOW); const before = est.estimateFor('sub-b', null, NOW); // sub-b behind sub-a: built on its old rates
    while (S.q.length) S.turn();
    const after = est.estimateFor('sub-b', null, NOW);
    const B = bRoad(w); B.primeOpts = { syncMaxRows: 1e9 }; B.primeIfCold(); for (const [key] of w.IDS) B.ratesFor(key); const pb = B.estimateFor('sub-b', null, NOW);
    rmWorld(w);
    const u7 = (e) => e && e.sevenDay && e.sevenDay.utilization;
    return { moved: !same(before, pb), equalB: !!after && same(after, pb), seven: [u7(before), u7(after), u7(pb)] };
  };
  const a = restart(null), b = behind(null);
  ok(a.nullFirst === 4 && a.equalB === 4, `A RESTART: 4 identities of 2 100 lines — the first pass «still learning» (${a.nullFirst} of 4 null), the first pass after their landing (${a.turns} turns) = commit B's estimates (${a.equalB} of 4)`, a);
  ok(b.moved && b.equalB, `AFTER A SWEEP: a 300-line identity behind a 1 750-line one — built on its old rates inside the fold (7-day ${b.seven[0]}), the first pass after its landing = commit B's (${b.seven[1]} = ${b.seven[2]})`, b);
  const M = mutantCopies('usage-relearn-stepped-memo', REPO), src = read('src/usage-estimator.js'), from = " && (!m.ik || this._ratesVerOf(m.ik) === m.rv)) return ownEstimate(m.est, rawCache);";
  const EM = src.includes(from) ? require(M.write('src/usage-estimator.js', src.replace(from, ') return ownEstimate(m.est, rawCache);'), 'memo-kept')) : null;
  const ra = EM ? restart(EM.UsageEstimator) : null, rb = EM ? behind(EM.UsageEstimator) : null;
  ok(!!ra && ra.equalB < 4 && !rb.equalB, `RED: the memo blind to the landing ⇒ a restart's estimates stay as built (${ra && ra.equalB} of 4 = B's), the sweep's stale one stays (${rb && rb.seven[1]} vs B's ${rb && rb.seven[2]})`, { ra, rb });
}

console.log('§9 A FOLD IS ABANDONED ONLY WHEN ITS OWN INPUTS MOVED (round 2, MUST 3)');
{
  // server.js: every remote usage batch that added rows invalidates EVERY identity (no anchor line moves)
  const push = (w, est, n) => { const evs = []; for (let k = 0; k < 3; k++) evs.push(JSON.stringify({ rid: 'dev-' + (++n.k), ts: NOW - 30e3 + n.k, sid: 'sd', model: 'claude-opus-5-5', cwd: '/w', origin: 'main', i: 900, cw5: 0, cw1: 0, cr: 10, o: 40 })); const r = w.uh.ingestRemoteEvents('H9', 'H9', evs.join('\n') + '\n'); if (r && r.appended) n.added += r.appended; for (const [key] of w.IDS) est.invalidate(key); };
  const scene = (lines, UE = null, realAppend = false) => {
    const w = world(REPO, { seed: 77, rows: 2000, pairs: [lines, 300, 120, 400], steps: [1, 30, 60, 20] });
    const est = UE ? new UE({ anchorsDir: w.adir, usageHistory: w.uh, resolveIdentity: w.est.resolveIdentity, lagS: 20 }) : w.est, S = stepper(est), key = 'email:a@x';
    for (const [k] of w.IDS) { est.ratesFor(k); while (S.q.length) S.turn(); }
    const ab0 = est.foldsAbandoned || 0, n = { k: 0, added: 0 }; est.invalidate(key); est.ratesFor(key);
    let turns = 0, landedAt = null; const c0 = est._rateCache.get(key), max = Math.ceil(lines / STEP) * 3 + 30, t0 = Date.now();
    while (S.q.length && turns < max) {
      S.turn(); turns++;
      const cn = est._rateCache.get(key); if (cn && cn !== c0 && !cn.partial) { landedAt = turns; n.ms = Date.now() - t0; break; } // the rates LANDED (a new entry)
      if (turns === 2 && realAppend) { const f = path.join(w.adir, 'anchors-' + w.UA.anchorSlug(key) + '.ndjson'), ls = fs.readFileSync(f, 'utf8').trim().split('\n'), last = JSON.parse(ls[ls.length - 1]); fs.appendFileSync(f, JSON.stringify({ ...last, fetchedAt: last.fetchedAt + 60e3, ts: last.ts + 60e3, prevFetchedAt: last.fetchedAt }) + '\n'); est.invalidate(key); }
      push(w, est, n); est.ratesFor(key); // a device's batch between EVERY two turns, and the next ask (the 8 s poll's)
    }
    const c = est._rateCache.get(key), abandoned = (est.foldsAbandoned || 0) - ab0;
    rmWorld(w);
    return { lines, abandoned, landed: landedAt !== null && !!c, turns: landedAt, ms: n.ms, pushes: n.k / 3, added: n.added };
  };
  const sizes = process.env.RLS_SIZES === 'full' ? [20000, 200000, 700000] : [8000];
  const rs = sizes.map((n) => scene(n));
  ok(rs.every((x) => x.abandoned === 0 && x.landed && x.added > 0), `A DEVICE PUSHING between every two turns (each batch adds rows and invalidates every identity): ${rs.map((x) => `${x.lines} lines — ${x.pushes} pushes, ${x.abandoned} folds abandoned, the rates landed in ${x.turns} turns (${x.ms} ms of folding and pushing)`).join(' · ')}`, rs);
  const ra = scene(8000, null, true);
  ok(ra.abandoned === 1 && ra.landed, `…a real anchor append mid-fold still abandons it once (${ra.abandoned}), and the refold lands`, ra);
  const M = mutantCopies('usage-relearn-stepped-livelock', REPO), src = read('src/usage-estimator.js'), from = '    f.moved = () => this._folds.get(identityKey) !== f || (!loading && epochNow() !== f.ep) || this._sigNow(identityKey) !== f.file;';
  const EM = src.includes(from) ? require(M.write('src/usage-estimator.js', src.replace(from, '    f.moved = () => this._folds.get(identityKey) !== f || (!loading && epochNow() !== f.ep) || this._sigNow(identityKey) !== f.file || f.dirty;'), 'by-invalidate')) : null;
  const R = EM ? scene(8000, EM.UsageEstimator) : null;
  ok(!!R && (R.abandoned > 5 || !R.landed), `RED: a fold abandoned by every invalidation (round 1's rule) ⇒ ${R && R.abandoned} folds thrown away, landed: ${R && R.landed} (in ${R && R.turns} turns)`, R);
}

console.log('§10 THE REAL SCHEDULER — the event loop makes a pass between every two of the fold\'s turns, counted (rounds 2 + 5)');
{
  // round 5: COUNTED, not timed (the round-2 row asserted timers and file reads that fired within the fold's wall time — flaky
  // on a loaded box). The fold's turns are counted (its _foldRun calls: one fold, one call a turn), and a setImmediate probe
  // that re-arms itself counts the loop's passes: on the default scheduler (setImmediate) each check phase runs the probe and
  // the fold's turn once each, so EVERY gap between two turns holds ≥ 1 pass — the timers and I/O completions due run there
  const scene = async (UE) => {
    const w = world(REPO, { seed: 79, rows: 2000, pairs: [8000, 300, 120, 400], steps: [1, 30, 60, 20] });
    const est = UE ? new UE({ anchorsDir: w.adir, usageHistory: w.uh, resolveIdentity: w.est.resolveIdentity, lagS: 20 }) : w.est, key = 'email:a@x';
    est.primeOpts = { syncMaxRows: 1e9 }; est.primeIfCold();
    let passes = 0, on = true; const probe = () => { if (!on) return; passes++; setImmediate(probe); }; setImmediate(probe);
    const at = []; const fr = est._foldRun.bind(est); est._foldRun = (f) => { at.push(passes); return fr(f); };
    est.ratesFor(key); let spins = 0;
    while (est._folds && est._folds.size && spins++ < 100000) await new Promise((r) => setImmediate(r));
    on = false; const landed = !!est._rateCache.get(key) && !(est._folds && est._folds.size);
    const gaps = at.slice(1).map((v, i) => v - at[i]);
    rmWorld(w);
    return { landed, turns: at.length, minGap: gaps.length ? Math.min(...gaps) : -1, gaps: gaps.join(',') };
  };
  const r = await scene(null), want = Math.ceil(8000 / STEP);
  ok(r.landed && r.turns >= want && r.minGap >= 1, `ON COUNTED TURNS (the default setImmediate scheduler): an 8 000-line fold landed in ${r.turns} turns (≥ ${want} = 8 000 ÷ ${STEP}); between every two of them the loop made ≥ ${r.minGap} pass (gaps ${r.gaps}) — no clock in the row`, r);
  const M = mutantCopies('usage-relearn-stepped-nexttick', REPO), src = read('src/usage-estimator.js'), from = '    const next = this.relearnNext || ((fn) => setImmediate(fn));';
  const EM = src.includes(from) ? require(M.write('src/usage-estimator.js', src.replace(from, '    const next = this.relearnNext || ((fn) => process.nextTick(fn));'), 'nexttick')) : null;
  const R = EM ? await scene(EM.UsageEstimator) : null;
  ok(!!R && R.landed && R.minGap === 0, `RED: a process.nextTick scheduler ⇒ the fold's ${R && R.turns} turns run with no loop pass between them (gaps ${R && R.gaps})`, R);
}

console.log('§11 THE RATES MEANWHILE = commit B\'s at the instant before the move; the landed = B\'s after it (round 2, small 2)');
{
  const w = world(REPO, { seed: 81, rows: 2000, pairs: [6500, 300, 120, 400], steps: [2, 30, 60, 20] }), S = stepper(w.est), key = 'email:a@x';
  for (const [k] of w.IDS) { w.est.ratesFor(k); while (S.q.length) S.turn(); }
  const bNow = () => EST.learnRates(w.est.lines(key), { priors: w.est.priorsFor(key), costFn: w.est._costFn(w.est.accountIdsFor(key)) }); // commit B: a synchronous fold at the instant
  const bBefore = bNow();
  const evs = []; for (let k = 0; k < 300; k++) evs.push(w.mkRow(NOW - 60e3 - 6400 * 2 * 60e3 + k * 40 * 60e3, { acct: 'sub-a', i: 1200000 })); w.append(evs); // the ledger moves
  w.est.invalidate(key); const bAfter = bNow();
  const meanwhile = w.est.ratesFor(key); const inFold = w.est._folds.size > 0;
  while (S.q.length) S.turn();
  const landed = w.est.ratesFor(key);
  const gap = (x, y) => Math.abs(((x && x.sevenDay && x.sevenDay.impliedFullUsd) || 0) - ((y && y.sevenDay && y.sevenDay.impliedFullUsd) || 0));
  ok(inFold && same(meanwhile, bBefore) && !same(bBefore, bAfter) && same(landed, bAfter), `inside the fold the served rates are B's at the instant BEFORE the ledger moved (a true earlier state; B's own answer then differs by $${gap(bBefore, bAfter).toFixed(2)} on the 7-day implied full spend), and the landed rates are B's after it`, { inFold });
  rmWorld(w);
}

console.log('§12 A FOLD THAT THROWS · AN ESTIMATOR LET GO · THE SMALLEST FIRST (round 2, small 3–5)');
{
  // 3 — a malformed record: said once by name, the last rates served, a backoff, the next try after it
  const w = world(REPO, { seed: 83, rows: 2000, pairs: [3000, 300, 120, 400], steps: [2, 30, 60, 20] }), S = stepper(w.est), key = 'email:a@x';
  for (const [k] of w.IDS) { w.est.ratesFor(k); while (S.q.length) S.turn(); }
  const good = w.est._rateCache.get(key).rates, f = path.join(w.adir, 'anchors-' + w.UA.anchorSlug(key) + '.ndjson'), ls = fs.readFileSync(f, 'utf8').trim().split('\n'), last = JSON.parse(ls[ls.length - 1]);
  fs.appendFileSync(f, JSON.stringify({ ...last, fetchedAt: last.fetchedAt + 60e3, ts: last.ts + 60e3, prevFetchedAt: last.fetchedAt, buckets: { ...last.buckets, scopedWeekly: 5 } }) + '\n'); // a poison record
  const warns = [], cw = console.warn; console.warn = (...a) => warns.push(a.join(' '));
  let started, inBackoff, after;
  try {
    w.est.invalidate(key); w.est.ratesFor(key); while (S.q.length) S.turn();
    started = w.est.foldsStarted; const served = [];
    for (let k = 0; k < 6; k++) { served.push(w.est.ratesFor(key)); while (S.q.length) S.turn(); }
    inBackoff = { folds: w.est.foldsStarted - started, served: served.every((x) => x === good) };
    w.est._foldFail.get(key).retryAt = 0; w.est.ratesFor(key); while (S.q.length) S.turn(); after = w.est.foldsStarted - started;
  } finally { console.warn = cw; }
  const said = warns.filter((l) => /the relearn of email:a@x failed \(.+\) — its last rates are served; it is tried again after 5 s, then doubling to ≤ 5 min/.test(l));
  ok(said.length === 1 && warns.length === 1 && inBackoff.folds === 0 && inBackoff.served && after === 1 && w.est._foldFail.get(key).n === 2, `A FOLD THAT THROWS (a malformed record): said ONCE by name («${(said[0] || '').slice(0, 110)}»); 6 asks inside the backoff start ${inBackoff.folds} folds and serve the last rates; the next try after it: ${after} fold (the second failure counted, not said)`, { warns, inBackoff, after });
  rmWorld(w);
}
{
  // 4 — an estimator let go (close()): its fold in flight ends, it folds and persists nothing more — rates.json keeps its
  // successor's learning; the product's one other estimator (the slot backfill's) closes itself when its pass ends
  const w = world(REPO, { seed: 85, rows: 2000, pairs: [6000, 300, 120, 400], steps: [2, 30, 60, 20] }), S = stepper(w.est), key = 'email:a@x';
  for (const [k] of w.IDS) { w.est.ratesFor(k); while (S.q.length) S.turn(); }
  w.est.flushRates(); w.est.invalidate(key); w.est.ratesFor(key); // the old estimator's fold in flight
  const inFlight = w.est._folds.size;
  const evs = []; for (let k = 0; k < 200; k++) evs.push(w.mkRow(NOW - 60e3 - 5000 * 2 * 60e3 + k * 50 * 60e3, { acct: 'sub-a', i: 800000 })); w.append(evs);
  w.est.close(); // let go
  const est2 = new (w.est.constructor)({ anchorsDir: w.adir, usageHistory: w.uh, resolveIdentity: w.est.resolveIdentity, lagS: 20 }); est2.primeOpts = { syncMaxRows: 1e9 }; est2.primeIfCold();
  const r2 = est2.learnNow(key); est2.flushRates();
  while (S.q.length) S.turn(); w.est.flushRates(); // whatever the closed one had queued
  const disk = JSON.parse(fs.readFileSync(path.join(w.adir, 'rates.json'), 'utf8'))[key];
  const after = { folds: w.est._folds.size, asks: w.est.ratesFor(key) === w.est._rateCache.get(key).rates, started: w.est.foldsStarted };
  w.est.invalidate(key); w.est.ratesFor(key); const noNew = w.est._folds.size === 0 && w.est.foldsStarted === after.started;
  const bf = read('src/ledger-slot-backfill.js'), closes = /\n {6}est\.flushRates\(\);[^\n]*\n {6}est\.close\(\);/.test(bf);
  ok(inFlight === 1 && after.folds === 0 && after.asks && noNew && same(disk.buckets, r2) && closes, `AN ESTIMATOR LET GO: close() ends its fold in flight (${inFlight} → ${after.folds}), it serves what it has and folds nothing more (${noNew}); rates.json keeps its successor's learning (${same(disk.buckets, r2)}); the slot backfill closes its own after its flush (${closes})`, { inFlight, after, noNew, closes });
  rmWorld(w);
}
{
  // 5 — the smallest first: after a sweep the handler asks the largest first; the 120-line identity lands at the next turn
  const w = world(REPO, { seed: 87, rows: 2000, pairs: [6000, 3000, 120, 2000], steps: [2, 3, 60, 4] }), S = stepper(w.est);
  for (const [k] of w.IDS) { w.est.ratesFor(k); while (S.q.length) S.turn(); }
  for (const [k] of w.IDS) w.est.invalidate(k);
  for (const [k] of w.IDS) w.est.ratesFor(k); // the handler: 9 000, 4 000, 120, 2 500 lines
  let turn = 0, small = null; while (S.q.length) { S.turn(); turn++; if (small === null && !w.est._folds.has('org:c')) small = turn; }
  rmWorld(w);
  const fc = (() => { // RED: first-come — the queue's order kept
    const M = mutantCopies('usage-relearn-stepped-fifo', REPO), src = read('src/usage-estimator.js'), from = "      if (Q.length > 1) Q.sort(";
    const EM = src.includes(from) ? require(M.write('src/usage-estimator.js', src.replace(from, "      if (false) Q.sort("), 'fifo')) : null; if (!EM) return null;
    const w2 = world(REPO, { seed: 87, rows: 2000, pairs: [6000, 3000, 120, 2000], steps: [2, 3, 60, 4] }), e = new EM.UsageEstimator({ anchorsDir: w2.adir, usageHistory: w2.uh, resolveIdentity: w2.est.resolveIdentity, lagS: 20 }), S2 = stepper(e);
    for (const [k] of w2.IDS) { e.ratesFor(k); while (S2.q.length) S2.turn(); }
    for (const [k] of w2.IDS) e.invalidate(k); for (const [k] of w2.IDS) e.ratesFor(k);
    let t = 0, sm = null; while (S2.q.length) { S2.turn(); t++; if (sm === null && !e._folds.has('org:c')) sm = t; }
    rmWorld(w2); return sm;
  })();
  ok(small !== null && small <= 2 && fc !== null && fc > small + 2, `THE SMALLEST FIRST: asked after a 6 000- and a 3 000-line identity, the 120-line one lands at turn ${small} — the first turn with a budget (the handler's turn spent it); RED first-come: turn ${fc}`, { small, fc });
}
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
