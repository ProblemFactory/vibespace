#!/usr/bin/env node
// THE LEDGER IS WALKED BY WHAT IS NEW (hotfix usage-ledger-walk, 2026-11-11 — the owner's hub froze 5–6 s every half
// minute; a fleet hub the same). Named samples of the production main thread: about a third of its CPU was
// costBetweenMulti + the cold rows it builds, through THREE doors — the pool engine's evaluation, GET /api/usage's
// estimates, and the relearn every 60 s sweep's invalidation sends through ratesFor → learnRates (one walk per anchor
// pair: 82 k pairs against a 20 000-key memo). src/usage-anchors.js now versions an interval by the rows IN it, keeps raw
// sums so an interval that grows at its end costs only its new rows, holds the anchor working set, and primes a cold
// memo with ONE sweep (stepped off the request path); the estimator's live ring is searched by range; the hot rows are
// sorted by appending. Pins:
//   §1 EQUALITY — every interval cost, learned rate and estimate equals 05082bbd0's walk (a frozen copy of its memo-less
//      walk below, to the bit; and the released code itself from a git archive when this clone holds the commit), on a
//      seeded corpus: cold + hot rows, both CLIs, a remote host (resolved and unresolved rows), absent counts, late rows
//      into old intervals, a pricing edit, a rewritten ledger, a loading ledger ⇒ null
//   §2 COUNT, per door — rows visited (a counting iterator) and ring entries read: one relearn after an invalidation,
//      one GET-shaped pass, one pool evaluation (36 conversations × 4 members, rows arriving, the ring full, a
//      conversation streaming) — each bounded by what is NEW, at any history length
//   §3 RATCHET — the work of one relearn (interval-version reads, ledger rows) ≤ a stated multiple of its pairs — a count
//   §4 MUTANTS (planted copies, scripts/mutant-copy.mjs) — red by name
//   §5 THE CENSUS (law 4) — every main-thread caller of the ledger's iterators, with its cadence and its bound
// Run: node scripts/test-usage-ledger-walk.mjs (~3 s, no network)
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
// a world's dir removed: the store writer forgets its rates.json first (a pending write would say ENOENT and retry — hub-loop-stalls commit 2)
const rmWorld = (w) => { try { require('../src/store-writer.js').storeWriter().forget(path.join(w.adir || path.join(w.data, 'usage-anchors'), 'rates.json')); } catch { } fs.rmSync(w.data, { recursive: true, force: true }); };
const DAY = 86400e3, NOW = 1794300000000;
// this suite judges commit B's laws on WHOLE relearns (every estimator it builds, twins included); a relearn's own slices — one
// budget a loop turn — are test-usage-relearn-stepped's
require('../src/usage-estimator.js').UsageEstimator.prototype.relearnStepLines = Infinity;

/** One seeded world over a source tree: a ledger (cold + hot), anchor histories, an estimator. */
function world(TREE, { seed = 3, rows = 12000, pairs = [1500, 300, 120, 400], steps = [15, 30, 60, 20], ages = [0, 0, 0, 0], nanRate = 0.01, dataDir = null } = {}) {
  const rq = createRequire(path.join(TREE, 'scripts/x.js'));
  const { UsageHistory } = rq(path.join(TREE, 'src/usage-history.js'));
  const UA = rq(path.join(TREE, 'src/usage-anchors.js'));
  const { UsageEstimator, learnRates } = rq(path.join(TREE, 'src/usage-estimator.js'));
  let s = seed; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const data = dataDir || fs.mkdtempSync(path.join(os.tmpdir(), 'vs-ulw-')), hdir = path.join(data, 'usage-history'), adir = path.join(data, 'usage-anchors');
  const fresh = !dataDir || !fs.existsSync(path.join(data, '.seeded'));
  const shardOf = (ts) => { const d = new Date(ts); return path.join(hdir, `events-${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}.ndjson`); };
  let rn = 0;
  const mkRow = (ts, x = {}) => { const be = rnd() < 0.15 ? 'codex' : 'claude', host = rnd() < 0.12 ? 'H1' : null, acct = pick(['sub-a', 'sub-b', 'sub-c', 'sub-d', null]);
    const ev = { ts, rid: (host ? 'h:H1:r' : 'r') + seed + '-' + (++rn), sid: 's' + (rn % 31), model: be === 'codex' ? pick(['gpt-6-astra', 'gpt-6.1-sol']) : pick(['claude-opus-5-5', 'claude-fable-5-1', 'claude-sonnet-4-5', 'claude-haiku-4-5']),
      be, acct, atype: host ? (rnd() < 0.5 ? 'host' : 'subscription') : (acct ? 'subscription' : 'global'), i: Math.floor(rnd() * 400000), o: Math.floor(rnd() * 3000), cw5: Math.floor(rnd() * 20000), cw1: rnd() < 0.3 ? null : Math.floor(rnd() * 900), cr: Math.floor(rnd() * 90000), ...x };
    if (host) ev.host = host; if (rnd() < nanRate) delete ev.i; return ev; };
  const IDS = [['email:a@x', ['sub-a'], pairs[0], steps[0], ages[0]], ['email:b@x', ['sub-b'], pairs[1], steps[1], ages[1]], ['org:c', ['sub-c'], pairs[2], steps[2], ages[2]], ['org:merged', [null, 'sub-d'], pairs[3], steps[3], ages[3]]];
  if (fresh) {
    fs.mkdirSync(hdir, { recursive: true }); fs.mkdirSync(adir, { recursive: true });
    const buf = new Map();
    for (let k = 0; k < rows; k++) { const ev = mkRow(Math.floor(NOW - 40 * DAY + 40 * DAY * (k / rows)) - (rnd() < 0.02 ? Math.floor(rnd() * DAY) : 0)); const f = shardOf(ev.ts); if (!buf.has(f)) buf.set(f, []); buf.get(f).push(JSON.stringify(ev)); }
    for (const [f, ls] of buf) fs.appendFileSync(f, ls.join('\n') + '\n');
    for (const [key, accts, n, stepMin, ageD] of IDS) {
      const out = []; let prev = null, u7 = 0.1, u5 = 0.1;
      for (let j = 0; j < n; j++) {
        const fetchedAt = Math.floor(NOW - 60e3 - ageD * DAY - (n - 1 - j) * stepMin * 60e3), wk = Math.floor(fetchedAt / (7 * DAY)), h5 = Math.floor(fetchedAt / (5 * 3600e3));
        if (prev && Math.floor(prev.fetchedAt / (7 * DAY)) !== wk) u7 = 0; if (prev && Math.floor(prev.fetchedAt / (5 * 3600e3)) !== h5) u5 = 0;
        u7 = Math.min(0.99, u7 + rnd() * 0.004); u5 = Math.min(0.99, u5 + rnd() * 0.03);
        const rec = { ts: fetchedAt + 500, fetchedAt, source: 'statusline', accountId: accts[j % accts.length], identityKey: key, ...(accts.length > 1 ? { accountIds: accts.map((a) => a || '__global__') } : {}),
          buckets: { fiveHour: { u: Math.round(u5 * 1000) / 1000, resetsAt: Math.floor(((h5 + 1) * 5 * 3600e3) / 1000) }, sevenDay: { u: Math.round(u7 * 1000) / 1000, resetsAt: Math.floor(((wk + 1) * 7 * DAY) / 1000) },
            scopedWeekly: [{ name: 'Fable', u: Math.round(u7 * 500) / 1000, resetsAt: Math.floor(((wk + 1) * 7 * DAY) / 1000), asOf: fetchedAt }] },
          prevFetchedAt: prev ? prev.fetchedAt : null, costSince: prev ? { total: 1, byFamily: { fable: 0.2, opus: 0.8, sonnet: 0, haiku: 0, other: 0 }, requests: 3 } : null };
        out.push(rec); prev = rec;
      }
      fs.writeFileSync(path.join(adir, 'anchors-' + UA.anchorSlug(key) + '.ndjson'), out.map((r) => JSON.stringify(r)).join('\n') + '\n');
    }
    fs.writeFileSync(path.join(data, '.seeded'), '1');
  }
  const uh = new UsageHistory({ dataDir: data, homeDir: data }); uh.ledgerWindowMs = 12 * DAY; uh.ledgerHotMaxBytes = 2e6; uh.warm();
  const keyOf = { 'sub-a': 'email:a@x', 'sub-b': 'email:b@x', 'sub-c': 'org:c', 'sub-d': 'org:merged', __global__: 'org:merged' };
  const est = new UsageEstimator({ anchorsDir: adir, usageHistory: uh, resolveIdentity: (a) => ({ identityKey: keyOf[a || '__global__'] || 'acct:' + a }), lagS: 20 });
  let visited = 0; const real = uh._events.bind(uh);
  uh._events = function* (f, t) { for (const ev of real(f, t)) { visited++; yield ev; } };
  const append = (evs) => { const f = shardOf(NOW - 60e3); fs.appendFileSync(f, evs.map((e) => JSON.stringify(e)).join('\n') + '\n'); uh._evCache.checkedAt = 0; uh._loadEvents(); };
  return { UA, uh, est, learnRates, IDS, data, adir, mkRow, append, rnd, pick, visits: () => visited, zero: () => { visited = 0; } };
}

// 05082bbd0's walk, frozen (src/usage-anchors.js costBetweenMulti without its memo): THE oracle of every interval below
const { globalUsageKeyOf } = require('../src/backend-caps.js');
function masterWalk(uh, accountIds, fromMs, toMs) {
  const want = new Set((accountIds || []).map((a) => a || '__global__'));
  const out = { total: 0, byFamily: { fable: 0, opus: 0, sonnet: 0, haiku: 0, other: 0 }, byClass: { cw: 0, cr: 0, other: 0 }, requests: 0 };
  try {
    for (const ev of uh._events(fromMs, toMs)) {
      const acct = ev.acct || globalUsageKeyOf(ev.be);
      if (!want.has(acct)) continue;
      if (ev.host && ev.atype === 'host') continue;
      if (ev.ts < fromMs || ev.ts > toMs) continue;
      const c = uh._cost(ev);
      out.total += c; out.requests++;
      const m = String(ev.model || '').toLowerCase();
      const fam = m.includes('fable') ? 'fable' : m.includes('opus') ? 'opus' : m.includes('sonnet') ? 'sonnet' : m.includes('haiku') ? 'haiku' : 'other';
      out.byFamily[fam] += c;
      const whole = (ev.i || 0) + (ev.cr || 0) + (ev.cw5 || 0) + (ev.cw1 || 0);
      const cw = uh._cost({ ...ev, i: 0, o: 0, cr: 0 }, whole);
      const cr = uh._cost({ ...ev, i: 0, o: 0, cw5: 0, cw1: 0 }, whole);
      out.byClass.cw += cw; out.byClass.cr += cr; out.byClass.other += Math.max(0, c - cw - cr);
    }
  } catch { }
  out.total = Math.round(out.total * 10000) / 10000;
  for (const k of Object.keys(out.byFamily)) out.byFamily[k] = Math.round(out.byFamily[k] * 10000) / 10000;
  for (const k of Object.keys(out.byClass)) out.byClass[k] = Math.round(out.byClass[k] * 10000) / 10000;
  return out;
}
// THE RELEASED CODE, when this clone holds it (a depth-1 checkout does not: a named SKIP below)
let BASE = null;
try { execFileSync('git', ['-C', REPO, 'cat-file', '-e', '05082bbd0^{commit}'], { stdio: 'ignore' }); BASE = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-ulw-base-')); execFileSync('/bin/sh', ['-c', `git -C '${REPO}' archive 05082bbd0 src | tar -x -C '${BASE}'`]); fs.mkdirSync(path.join(BASE, 'scripts'), { recursive: true }); } catch { BASE = null; }
if (!BASE) console.log('SKIP: the released-code oracle and the RED-on-05082bbd0 counts — 05082bbd0 is not in this clone (a depth-1 checkout); the frozen walk stands as the oracle');
const same = (a, b) => JSON.stringify(a, (k, v) => (Number.isNaN(v) ? 'NaN' : v)) === JSON.stringify(b, (k, v) => (Number.isNaN(v) ? 'NaN' : v));
// COMMIT B's TOLERANCE (主开发's condition 1): an hour sum or a late row added out of ts order may differ from the walk in its
// last bits — the product's own rounding is the bar: dollars to $0.0001 (the walk's), utilization to 0.0001 (estimateBuckets')
const near = (a, b) => { const flat = (o, p = '', out = {}) => { for (const [k, v] of Object.entries(o || {})) { if (v && typeof v === 'object') flat(v, p + k + '.', out); else out[p + k] = v; } return out; };
  const x = flat(a), y = flat(b); return Object.keys({ ...x, ...y }).every((k) => (typeof x[k] === 'number' && typeof y[k] === 'number') ? (Number.isNaN(x[k]) ? Number.isNaN(y[k]) : Math.abs(x[k] - y[k]) <= 1.0001e-4) : x[k] === y[k]); };

console.log('§1 EQUALITY — every interval, rate and estimate is 05082bbd0\'s: to the bit below 6 hours, to the product\'s rounding above (commit B\'s hour sums)');
{
  const w = world(REPO, { seed: 3 });
  const IV = []; for (let k = 0; k < 160; k++) { const a = NOW - Math.floor(w.rnd() * 42 * DAY), len = w.pick([0, 60e3, 15 * 60e3, 3600e3, DAY, 9 * DAY]); IV.push([w.pick([['sub-a'], ['sub-b', '__global__'], ['__global_codex__'], ['sub-c'], [null], ['sub-d', 'sub-a']]), a, a + len]); }
  const check = (tag) => { let bad = 0, first = null; for (const [ids, a, b] of [...IV, ...IV.slice(0, 40)]) { const x = w.UA.costBetweenMulti(w.uh, ids, a, b), y = masterWalk(w.uh, ids, a, b); if (!near(x, y)) { bad++; first = first || { ids, a, b, x, y }; } } return { bad, first }; };
  const growing = () => { let bad = 0; for (let k = 1; k <= 12; k++) { const x = w.UA.costBetweenMulti(w.uh, ['sub-a'], NOW - 3 * DAY, NOW - 3 * DAY + k * 3 * 3600e3), y = masterWalk(w.uh, ['sub-a'], NOW - 3 * DAY, NOW - 3 * DAY + k * 3 * 3600e3); if (!near(x, y)) bad++; } return bad; };
  const r1 = check('seeded');
  { let bad = 0, n = 0; for (const [ids, a0, b0] of IV) { if (b0 - a0 >= 6 * 3600e3) continue; n++; if (!same(w.UA.costBetweenMulti(w.uh, ids, a0, b0), masterWalk(w.uh, ids, a0, b0))) bad++; }
    ok(bad === 0 && n > 40, `BELOW 6 HOURS (no hour sums, no late addition) every interval is the walk's TO THE BIT — ${n} intervals`, bad); }
  ok(r1.bad === 0 && growing() === 0, `200 intervals (and re-asks) on a seeded ledger + an interval GROWING at its end (the previous sum + its new rows, 12 steps) equal 05082bbd0's walk, to the bit`, r1.first);
  w.append([w.mkRow(NOW - 2 * DAY + 777, { acct: 'sub-a' }), w.mkRow(NOW - 20 * DAY + 999, { acct: 'sub-b' }), w.mkRow(NOW - 35 * DAY + 5, { acct: null, be: 'claude' })]);
  const r2 = check('late rows');
  ok(r2.bad === 0 && growing() === 0, 'LATE rows into old intervals (a remote harvest) — every interval that holds one is walked again; the others are not wrong either', r2.first);
  w.uh.setPricing({ tiers: { 'claude-opus-5': { input: 7, output: 33, cacheWrite5m: 8, cacheWrite1h: 12, cacheRead: 0.7 } }, accounts: { 'sub-b': { discount: 0.25 } } });
  const r3 = check('pricing');
  ok(r3.bad === 0, 'a PRICING edit (a tier + an account discount) — the memo of the old table is emptied', r3.first);
  { const f = fs.readdirSync(path.join(w.data, 'usage-history')).filter((x) => /^events-/.test(x)).sort()[0], fp = path.join(w.data, 'usage-history', f), ls = fs.readFileSync(fp, 'utf8').trim().split('\n'); ls.splice(7, 1); fs.writeFileSync(fp, ls.join('\n') + '\n'); w.uh._rebuildOnLoop(); }
  const r4 = check('rewritten');
  // A SAME-COUNT REWRITE (a row's tokens changed in place — the row count is the same): the generation, not the count, says so
  { const hd = path.join(w.data, 'usage-history'), f = fs.readdirSync(hd).filter((x) => /^events-/.test(x)).sort().pop(), fp = path.join(hd, f), ls = fs.readFileSync(fp, 'utf8').trim().split('\n');
    for (let k = 0; k < ls.length; k++) { const e = JSON.parse(ls[k]); if (e.acct === 'sub-a' && !e.host) { e.i = (e.i || 0) + 777777; ls[k] = JSON.stringify(e); break; } }
    fs.writeFileSync(fp, ls.join('\n') + '\n'); w.uh._rebuildOnLoop(); }
  const r4b = check('same-count rewrite');
  ok(r4b.bad === 0, 'a SAME-COUNT rewrite (a row\'s tokens changed in place) — a new generation empties the memo; no interval is served from the old ledger', r4b.first);
  // A1: AN ASK WHOSE START IS AFTER ITS END NEVER LEAVES A SLOT (estBucket's costFn(a reading newer than the caller's now, now))
  { let bad = 0, first = null;
    for (let k = 0; k < 30; k++) { const a = NOW - (k + 1) * 2 * DAY + k * 777, ids = [['sub-a'], ['sub-b'], [null], ['sub-c', 'sub-d']][k % 4];
      for (const [f, t] of [[a, a - 3600e3 * (1 + k % 5)], [a, a + DAY], [a, a + 2 * DAY], [a, a - 60e3], [a, a + 3 * DAY]]) { const x = w.UA.costBetweenMulti(w.uh, ids, f, t), y = masterWalk(w.uh, ids, f, t); if (!near(x, y)) { bad++; first = first || { f, t, x, y }; } } }
    ok(bad === 0, 'A1: asks whose START is after their END (a reading newer than the caller\'s now), FOLLOWED by asks from the same start — every answer master\'s; no slot is left by an empty ask', first); }
  ok(r4.bad === 0, 'a REWRITTEN ledger (a shard lost a row — a new generation) — nothing of the old one is served', r4.first);
  // learned rates and estimates through the estimator, against the same estimator over the frozen walk
  const oracle = new (w.est.constructor)({ anchorsDir: w.adir, usageHistory: w.uh, resolveIdentity: w.est.resolveIdentity, lagS: 20 });
  oracle._costFn = (ids) => (f, t) => masterWalk(w.uh, ids, f, t); oracle._primePairs = () => { };
  let rb = 0, eb = 0, firstBad = null;
  for (const [key] of w.IDS) { const a = w.est.ratesFor(key), b = oracle.ratesFor(key); if (!near(a, b)) { rb++; firstBad = firstBad || { key, a, b }; } }
  for (const nowMs of [NOW, NOW + 8000, NOW + 40000]) { w.est._estMemo.clear(); oracle._estMemo.clear(); for (const a of ['sub-a', 'sub-b', 'sub-c', 'sub-d', null]) { const x = w.est.estimateFor(a, null, nowMs), y = oracle.estimateFor(a, null, nowMs); if (!near(x, y)) { eb++; firstBad = firstBad || { a, nowMs, x, y }; } } }
  ok(rb === 0 && eb === 0, `every learned rate (${w.IDS.length} identities) and every estimate (5 accounts × 3 instants) equals the estimator over 05082bbd0's walk`, firstBad);
  { const real = w.uh.ledgerLoading; w.uh.ledgerLoading = () => ({ bytesLeft: 1, at: NOW }); w.est._estMemo.clear(); const e = w.est.estimateFor('sub-a', null, NOW), c = w.UA.costBetweenMulti(w.uh, ['sub-a'], NOW - DAY, NOW); w.uh.ledgerLoading = real;
    ok(e === null && c.partial === true, 'a ledger still LOADING ⇒ no estimate, a partial cost (never memoized)', { e, c }); }
  rmWorld(w);
  // THE FIRST LEARN, STEPPED (主开发's ruling): a span past the sync bound primes off the request path — meanwhile the
  // estimator answers as while the ledger loads (no estimate; rates from the frozen costSince, never persisted) — and once
  // it lands every number is the walk's
  {
    const w2 = world(REPO, { seed: 12 });
    w2.est.primeOpts = { syncMaxRows: 100, sliceMs: 2 * DAY };
    const during = w2.est.estimateFor('sub-a', null, NOW), rDuring = w2.est.ratesFor('email:a@x'), partial = w2.est._rateCache.get('email:a@x')?.partial === true;
    for (let k = 0; k < 200 && !(w2.est._priming && w2.est._priming.done); k++) await new Promise((r) => setImmediate(r));
    const landed = !!(w2.est._priming && w2.est._priming.done && w2.est._priming.result && w2.est._priming.result.intervals > 0);
    const o2 = new (w2.est.constructor)({ anchorsDir: w2.adir, usageHistory: w2.uh, resolveIdentity: w2.est.resolveIdentity, lagS: 20 });
    o2._costFn = (ids) => (f, t) => masterWalk(w2.uh, ids, f, t); o2._primePairs = () => { };
    w2.est._rateCache.clear(); w2.est._estMemo.clear(); w2.zero();
    const after = w2.est.estimateFor('sub-a', null, NOW), want = o2.estimateFor('sub-a', null, NOW), rAfter = w2.est.ratesFor('email:a@x'), rWant = o2.ratesFor('email:a@x');
    ok(during === null && partial && !!rDuring && landed && near(after, want) && near(rAfter, rWant), `THE FIRST LEARN STEPPED: while the sweep runs (${w2.est._priming?.result?.intervals} intervals in 2-day slices) no estimate and rates from the frozen costSince (partial, not persisted); once it lands the estimate and the rates are the walk's`, { during, partial, landed, after, want });
    fs.rmSync(w2.data, { recursive: true, force: true });
  }
  // A2: PRIMING IS LOADING — FOR EVERYONE: the pool engine's gate (wholeLedgerGate, with the estimator's prime) holds while
  // the first learn runs stepped; a sweep due meanwhile runs when it lands, on master's numbers; costBetweenMulti says partial
  {
    const w3 = world(REPO, { seed: 13 });
    w3.est.primeOpts = { syncMaxRows: 100, sliceMs: 2 * DAY };
    const { wholeLedgerGate } = require('../src/usage-estimator.js');
    const ran = [];
    const gate = wholeLedgerGate({ ledger: w3.uh, prime: () => w3.est.primeIfCold() });
    const ratesFile = path.join(w3.adir, 'rates.json');
    const first = gate.run(() => ran.push({ rates: w3.est.ratesFor('email:a@x'), cost: w3.UA.costBetweenMulti(w3.uh, ['sub-a'], NOW - 3 * DAY, NOW - DAY) }));
    const held = { first, holds: gate.holds(), loading: w3.uh.ledgerLoading(), est: w3.est.estimateFor('sub-a', null, NOW), partial: w3.UA.costBetweenMulti(w3.uh, ['sub-a'], NOW - 2 * DAY, NOW).partial === true, ratesWritten: (w3.est.flushRates(), fs.existsSync(ratesFile)) };   // item 7: read after the writer's flush — a paced write would land after a bare read
    for (let k = 0; k < 400 && !ran.length; k++) await new Promise((r) => setImmediate(r));
    const o3 = new (w3.est.constructor)({ anchorsDir: w3.adir, usageHistory: w3.uh, resolveIdentity: w3.est.resolveIdentity, lagS: 20 });
    o3._costFn = (ids) => (f, t) => masterWalk(w3.uh, ids, f, t); o3._primePairs = () => { };
    const after = ran[0], want = { rates: o3.ratesFor('email:a@x'), cost: masterWalk(w3.uh, ['sub-a'], NOW - 3 * DAY, NOW - DAY) };
    ok(held.first === 'waiting' && held.holds && held.loading && held.loading.priming && held.est === null && held.partial && !held.ratesWritten && !!after && near(after.rates, want.rates) && near(after.cost, want.cost) && !w3.uh.ledgerLoading(),
      'A2: PRIMING IS LOADING FOR EVERYONE — while the first learn runs stepped the pool engine\'s gate holds (the sweep queued, no decision), the ledger says loading, no estimate, costs partial, no rate persisted; the queued sweep runs when it lands, on master\'s numbers', { held, after: !!after });
    fs.rmSync(w3.data, { recursive: true, force: true });
  }
  // A5: THE HOLD ALWAYS ENDS, AND A PRIME THAT FAILS IS MASTER'S ROAD — a version read that throws mid-prime, a store that
  // throws, steps that never come back: the hold released (at the bound for the last), nothing landed, nothing uncaught,
  // said once, the gate runs, and the numbers are the walk's
  {
    const scene = async (name, setup) => {
      const w4 = world(REPO, { seed: 16 });
      const said = [], uncaught = []; const onUnc = (e) => uncaught.push(String(e && e.message || e)); process.on('uncaughtException', onUnc);
      w4.est.primeOpts = { syncMaxRows: 100, sliceMs: 2 * DAY, say: (m) => said.push(m), ...setup(w4) };
      const { wholeLedgerGate } = require('../src/usage-estimator.js');
      const gate = wholeLedgerGate({ ledger: w4.uh, prime: () => w4.est.primeIfCold() });
      const ran = []; gate.run(() => ran.push(1));
      for (let k = 0; k < 600 && w4.uh.ledgerLoading(); k++) await new Promise((r) => setTimeout(r, k < 400 ? 0 : 5));
      process.removeListener('uncaughtException', onUnc);
      const o4 = new (w4.est.constructor)({ anchorsDir: w4.adir, usageHistory: w4.uh, resolveIdentity: w4.est.resolveIdentity, lagS: 20 });
      o4._costFn = (ids) => (f, t) => masterWalk(w4.uh, ids, f, t); o4._primePairs = () => { };
      const gateNow = gate.run(() => ran.push(2));
      const rates = near(w4.est.ratesFor('email:a@x'), o4.ratesFor('email:a@x'));
      w4.est._estMemo.clear(); o4._estMemo.clear();
      const est = near(w4.est.estimateFor('sub-a', null, NOW), o4.estimateFor('sub-a', null, NOW));
      const cost = near(w4.UA.costBetweenMulti(w4.uh, ['sub-a'], NOW - 3 * DAY, NOW - DAY), masterWalk(w4.uh, ['sub-a'], NOW - 3 * DAY, NOW - DAY));
      const r = { released: !w4.uh.ledgerLoading(), gateNow, queuedRan: ran.includes(1), rates, est, cost, uncaught: uncaught.length, said: said.length, saidText: said.join(' | '), failed: w4.est._priming?.result?.failed || null };
      fs.rmSync(w4.data, { recursive: true, force: true });
      ok(r.released && r.gateNow === 'ran' && r.queuedRan && r.rates && r.est && r.cost && r.uncaught === 0 && r.said === 1 && !!r.failed, `A5 ${name}: the hold released, nothing landed, 0 uncaught, said once («${r.failed}»), the gate runs, rates / estimate / cost are the walk's`, r);
    };
    await scene('a version read that THROWS mid-prime (pricingToken, its third call)', (w4) => { let n = 0; const real = w4.uh.pricingToken.bind(w4.uh); w4.uh.pricingToken = () => { if (++n === 3) { w4.uh.pricingToken = real; throw new Error('pricingToken threw'); } return real(); }; return {}; });
    await scene('a STORE that throws EVERY time — master\'s road (主开发 16:57Z: on a fault master is the oracle, said once with the step that threw; the pool decides)', () => ({ storeHook: () => { throw new Error('the store threw'); } }));
  }
  {
    // steps that STOP coming back (the first prime's `next` stops calling): no step in a whole window ⇒ the prime is DROPPED (said
    // once), the hold released, its epoch UNLEARNED — the next ask starts a new STEPPED prime (the scheduler back): it lands, the
    // gate's queued sweep runs, and every number is the walk's (slowness is never master's pair-by-pair road)
    const w4 = world(REPO, { seed: 16 }); const said = [], uncaught = []; const onUnc = (e) => uncaught.push(String(e && e.message || e)); process.on('uncaughtException', onUnc);
    let k = 0, broken = true;
    w4.est.primeOpts = { syncMaxRows: 100, sliceMs: 2 * DAY, holdMaxMs: 60, say: (m) => { said.push(m); if (/made no step/.test(m)) broken = false; }, next: (fn) => { if (!broken || ++k <= 2) setImmediate(fn); } };
    const { wholeLedgerGate } = require('../src/usage-estimator.js');
    const gate = wholeLedgerGate({ ledger: w4.uh, prime: () => w4.est.primeIfCold() });
    const ran = []; gate.run(() => ran.push(1));
    for (let j = 0; j < 800 && (broken || w4.uh.ledgerLoading()); j++) await new Promise((r) => setTimeout(r, j < 400 ? 2 : 5));
    for (let j = 0; j < 50 && !ran.length; j++) await new Promise((r) => setTimeout(r, 2));
    process.removeListener('uncaughtException', onUnc);
    const o4 = new (w4.est.constructor)({ anchorsDir: w4.adir, usageHistory: w4.uh, resolveIdentity: w4.est.resolveIdentity, lagS: 20 });
    o4._costFn = (ids) => (f, t) => masterWalk(w4.uh, ids, f, t); o4._primePairs = () => { };
    const res = w4.est._priming && w4.est._priming.result;
    const rates = near(w4.est.ratesFor('email:a@x'), o4.ratesFor('email:a@x'));
    w4.est._estMemo.clear(); o4._estMemo.clear();
    const est = near(w4.est.estimateFor('sub-a', null, NOW), o4.estimateFor('sub-a', null, NOW));
    const stalls = said.filter((m) => /made no step/.test(m)).length;
    fs.rmSync(w4.data, { recursive: true, force: true });
    ok(!broken && stalls === 1 && !w4.uh.ledgerLoading() && res && !res.abandoned && res.intervals > 0 && ran.includes(1) && rates && est && uncaught.length === 0,
      `a prime whose steps STOP coming back: dropped after a window with no step (said once: «${(said.find((m) => /made no step/.test(m)) || '').slice(8, 70)}…»), its epoch left unlearned — the next ask's NEW stepped prime landed (${res && res.intervals} intervals), the gate's sweep ran, rates and estimate the walk's (never the pair-by-pair road for slowness)`, { said, res, ran, rates, est, uncaught });
  }
  // …and the RELEASED code itself, when this clone holds it
  const base = BASE;
  if (!base) { /* SKIP said at the top */ }
  else {
    const dd = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-ulw-arch-')), da = path.join(dd, 'a'), db = path.join(dd, 'b');
    const A = world(base, { seed: 9, dataDir: da }); const B = world(REPO, { seed: 9, dataDir: db });
    let bad = 0, n = 0, first = null;
    const both = (fn) => { const x = fn(A), y = fn(B); n++; if (!near(x, y)) { bad++; first = first || { x, y }; } };
    for (const [key] of A.IDS) both((w) => w.est.ratesFor(key));
    for (const a of ['sub-a', 'sub-b', 'sub-c', 'sub-d', null]) both((w) => { w.est._estMemo.clear(); return w.est.estimateFor(a, null, NOW + 5000); });
    for (let k = 0; k < 80; k++) { const t0 = NOW - (k % 40) * DAY - k * 997, len = [60e3, 3600e3, DAY, 8 * DAY][k % 4]; both((w) => w.UA.costBetweenMulti(w.uh, [['sub-a'], ['sub-b'], [null], ['sub-c', 'sub-d']][k % 4], t0, t0 + len)); }
    ok(bad === 0, `the RELEASED code (a git archive of 05082bbd0) on the same seeds: ${n} rates / estimates / intervals, ${bad} differ`, first);
    fs.rmSync(dd, { recursive: true, force: true });
  }
}

console.log('§2 COUNT — each door visits what is NEW, at any history length');
// (iii) ONE RELEARN after a sweep's invalidation, at a shape where 05082bbd0 walks: 21 000 one-minute pairs (past its
// 20 000-key memo) — the walks (_events calls) and the rows each tree spends
const relearnCount = (TREE) => {
  const w = world(TREE, { seed: 4, rows: 30000, pairs: [21000, 50, 30, 60], steps: [1, 30, 60, 20] });
  let walks = 0; const ev = w.uh._events; w.uh._events = function* (f, t) { walks++; yield* ev.call(this, f, t); };
  w.est.ratesFor('email:a@x'); // the first learn
  const f = path.join(w.adir, 'anchors-' + w.UA.anchorSlug('email:a@x') + '.ndjson'), ls = fs.readFileSync(f, 'utf8').trim().split('\n'), last = JSON.parse(ls[ls.length - 1]);
  fs.appendFileSync(f, JSON.stringify({ ...last, ts: NOW + 100, fetchedAt: NOW - 1000, prevFetchedAt: last.fetchedAt }) + '\n');
  w.est.invalidate('email:a@x'); w.zero(); walks = 0; w.est.ratesFor('email:a@x');
  const r = { walks, rows: w.visits() }; rmWorld(w); return r;
};
{
  const fix = relearnCount(REPO), base = BASE ? relearnCount(BASE) : null;
  ok(fix.walks <= 2 && (!base || base.walks > 300), `(iii) ONE RELEARN after a sweep's invalidation at 21 000 pairs (past 05082bbd0's 20 000-key memo): ${fix.walks} walk(s), ${fix.rows} rows${base ? ` — RED on 05082bbd0: ${base.walks} walks, ${base.rows} rows` : ''}`, { fix, base });
}
// (i) ONE GET /api/usage-shaped pass at a shape where 05082bbd0 walks: a STALE identity (read 20 days ago — its 7d and
// scoped windows roll to their last weekly boundary, up to 7 days of rows) and rows arriving after the last ask
const getCount = (TREE) => {
  const w = world(TREE, { seed: 5, rows: 30000, pairs: [300, 300, 120, 400], ages: [0, 20, 0, 0] });
  const ids = ['sub-a', 'sub-b', 'sub-c', 'sub-d'], pass1 = (nowMs) => { for (const a of [...ids, null]) w.est.estimateFor(a, null, nowMs); };
  w.est._estMemo.clear(); pass1(NOW); for (let k = 0; k < 400; k++) if (!w.uh.ledgerLoading()) break;
  w.est._estMemo.clear(); pass1(NOW + 4000); // warm (a prime lands at once at this size)
  w.append(Array.from({ length: 25 }, (_, j) => w.mkRow(NOW + 5000 + j * 10, { acct: w.pick(ids) })));
  w.est._estMemo.clear(); w.zero(); pass1(NOW + 8000);
  const r = w.visits(); rmWorld(w); return r;
};
{
  const fix = getCount(REPO), base = BASE ? getCount(BASE) : null;
  ok(fix <= 25 * 12 && (!base || base > 3000), `(i) ONE GET /api/usage-shaped pass (a stale identity's rolled 7-day windows, 25 rows arrived after the last ask, the memo cleared by a streamed record): ${fix} rows${base !== null ? ` — RED on 05082bbd0: ${base} rows (every window walked from its start)` : ''}`, { fix, base });
}
{
  const w = world(REPO, { seed: 5 });
  const ids = ['sub-a', 'sub-b', 'sub-c', 'sub-d'];
  const arrive = (k, at) => w.append(Array.from({ length: k }, (_, j) => w.mkRow(at + j * 10, { acct: w.pick(ids) })));
  // the pool evaluation: 36 conversations × 4 members ask the estimate and the burn with ONE now; rows arrive every 5 s; the ring is full and a conversation streams
  for (let k = 0; k < 3000; k++) w.est.noteLive({ rid: 'msg_' + k, accountId: w.pick(ids), model: 'claude-opus-5-5', usd: 0.01, ts: NOW - 3 * 3600e3 + k * 3000 });
  let ringReads = 0; const ring = w.est._liveRing; w.est._liveRing = new Proxy(ring, { get(t, k) { if (typeof k === 'string' && /^\d+$/.test(k)) ringReads++; return t[k]; } });
  const evaluate = (nowMs) => { for (let c = 0; c < 36; c++) for (const m of ids) { w.est.estimateFor(m, null, nowMs); w.est.burnFor(m, nowMs); } };
  evaluate(NOW + 9000); // warm
  arrive(6, NOW + 10000); w.est.noteLive({ rid: 'msg_live', accountId: 'sub-a', model: 'claude-opus-5-5', usd: 0.02, ts: NOW + 12000 });
  w.zero(); ringReads = 0; evaluate(NOW + 14000);
  const ev = w.visits(), rr = ringReads;
  ok(ev <= 400 && rr <= 4000, `(ii) ONE POOL EVALUATION (36 conversations × 4 members, 6 rows arrived, the ring full — 3 001 entries — and a conversation streaming) visits ${ev} ledger rows and reads ${rr} ring entries — one computation per (identity, window), what is new (05082bbd0: every conversation × member asked again, the whole ring per ask)`, { ev, rr });
  // the ring by range: an interval outside the ring's span reads O(1) entries; inside, the block in range
  ringReads = 0; w.est._liveDelta(['sub-a'], NOW - 40 * DAY, NOW - 39 * DAY);
  const outside = ringReads; ringReads = 0; w.est._liveDelta(['sub-a'], NOW - 3600e3, NOW);
  ok(outside <= 2 && ringReads <= 1300, `the live ring is searched by RANGE: an interval before its span reads ${outside} entries, the last hour ${ringReads} of 3 001`, { outside, inside: ringReads });
  w.est._liveRing = ring; rmWorld(w);
}
{
  // _sortHot: rows that arrive are sorted alone and appended — not every hot row again
  const w = world(REPO, { seed: 6, rows: 6000 });
  w.uh._sortedEvents(); let cmp = 0; const real = Array.prototype.sort;
  Array.prototype.sort = function (fn) { return real.call(this, fn ? (a, b) => { cmp++; return fn(a, b); } : undefined); };
  try { w.append([w.mkRow(NOW - 30e3), w.mkRow(NOW - 20e3), w.mkRow(NOW - 10e3)]); w.uh._sortedEvents(); } finally { Array.prototype.sort = real; }
  const hot = w.uh._evCache.events.length;
  ok(cmp <= 10, `3 rows arriving re-sort 3 rows, not the ${hot} hot ones (${cmp} comparisons) — and the order is the full stable sort's`, cmp);
  const full = w.uh._evCache.events.slice().sort((a, b) => (a.ts || 0) - (b.ts || 0));
  ok(full.every((e, i) => e === w.uh._evCache.sorted[i]), 'the appended view IS the stable full sort (same rows, same order, ties in load order)');
  rmWorld(w);
}

console.log('§3 RATCHET — the work of one relearn over every pair, against the pairs it holds (a count, never the clock)');
{
  const w = world(REPO, { seed: 7, pairs: [2400, 50, 30, 60] });
  w.est.ratesFor('email:a@x'); // primed
  const pairs = w.est.lines('email:a@x').filter((l) => l.prevFetchedAt).length;
  let counts = 0; const real = w.uh._evCountUpTo.bind(w.uh); w.uh._evCountUpTo = (t) => { counts++; return real(t); };
  w.est.invalidate('email:a@x'); w.zero(); w.est.ratesFor('email:a@x');
  const rows = w.visits(); w.uh._evCountUpTo = real;
  ok(rows === 0 && counts <= 2 * pairs + 8, `${pairs} pairs relearned: ${counts} interval-version reads (≤ 2 binary searches a pair + the prime's check), ${rows} ledger rows — 05082bbd0 walked an interval per pair once its memo was outgrown`, { pairs, counts, rows });
  rmWorld(w);
}

console.log('§4 MUTANTS — each red by name');
let storeBlind = null, twoLoads = null, countBlind = null, boundFatal = null; // rounds 2 and 3's rules and the boot's, planted here, judged in §9
{
  const M = mutantCopies('usage-ledger-walk', REPO), src = read('src/usage-anchors.js');
  const plant = (name, from, to) => { if (!src.includes(from)) return null; return require(M.write('src/usage-anchors.js', src.replace(from, to), name)); };
  const withAnchors = (UA2, fn) => { const k = require.resolve('../src/usage-anchors.js'), real = require.cache[k]; require.cache[k] = { ...real, exports: UA2 }; try { return fn(); } finally { require.cache[k] = real; } };
  const relearnWith = (UA2) => withAnchors(UA2, () => relearnRows(2400));
  const plantMany = (name, pairs) => { let t = src; for (const [a, b] of pairs) { if (!t.includes(a)) return null; t = t.replace(a, b); } return require(M.write('src/usage-anchors.js', t, name)); };
  const otherAcct = plant('log-adds-another-account', "late = usageHistory.arrivalsFor(mark, want, fromMs, sl[0]);", "late = usageHistory.arrivalsFor(mark, [...usageHistory._evCache.arr.ids.key.keys()], fromMs, sl[0]);");
  const pastEnd = plant('log-takes-past-the-end-too', "late = usageHistory.arrivalsFor(mark, want, fromMs, sl[0]);", "late = usageHistory.arrivalsFor(mark, want, fromMs, Infinity);");
  const cap = plant('cap-20000', 'const COST_MEMO_MAX = 200000;', 'const COST_MEMO_MAX = 20000;');
  const noExt = plant('no-extension', "          if (toV > after) {", "          if (false) {");
  const blind = plant('blind-version', "const _rowsIn = (usageHistory, fromMs, toV) => usageHistory._evCountUpTo(toV) - usageHistory._evCountUpTo((fromMs || 0) - 1);", "const _rowsIn = () => 0;");
  const noGen = plant('version-ignores-generation', "  if (m.tok !== tok || m.gen !== gen) { m.map.clear();", "  if (m.tok !== tok) { m.map.clear();");
  const landsAnyway = plant('prime-lands-after-a-price-change', "  return !!m && m === plan.memo && m.epoch === plan.epoch && (usageHistory.ledgerGen || 0) === plan.gen && usageHistory.pricingToken() === plan.tok && usageHistory._evCache === plan.cache;", "  return !!m;"); // the judge that asks the memo (it moves to the new epoch) and ignores the answer
  storeBlind = plant('store-blind-to-the-epoch', "  const live = () => _primeLive(usageHistory, plan);", "  const live = () => true;"); // round 2, MUST 1 (§9)
  countBlind = plantMany('count-phase-unjudged', [ // round 3 (§9): 09ec6e80d / 7ed96a26d's count phase — no step judged until the count ENDS, the epoch stamped THEN
    ["        if (!_primeLive(usageHistory, plan)) { end({ abandoned: true }); return; } // r3:", "        if (phase !== 'count' && !_primeLive(usageHistory, plan)) { end({ abandoned: true }); return; } // r3:"],
    ["          if (!_primePlanFinish(usageHistory, plan)) { end({ intervals: 0, rows: 0 }); return; }", "          { const m2 = _memoNow(usageHistory, { forPrime: true }); if (!m2) { end({ intervals: 0, rows: 0 }); return; } Object.assign(plan, { memo: m2, epoch: m2.epoch, gen: usageHistory.ledgerGen || 0, tok: usageHistory.pricingToken(), cache: usageHistory._evCache }); }\n          if (!_primePlanFinish(usageHistory, plan)) { end({ intervals: 0, rows: 0 }); return; }"]]);
  twoLoads = plant('an-ask-loads-again', "  try { unpin = usageHistory && typeof usageHistory._pinLoad === 'function' ? usageHistory._pinLoad() : null; }", "  try { unpin = null; }"); // round 2, MUST 2 (§9)
  boundFatal = plant('the-bound-is-fatal', "      if (steps === seen) {", "      if (true) { end(fail(new Error(`its steps did not finish within ${holdNamedMs} ms`))); return; }\n      if (steps === seen) {"); // adbd03b3c's: the bound ends the prime ⇒ master's pair-by-pair road
  ok(otherAcct && pastEnd && cap && noExt && blind && noGen && landsAnyway && storeBlind && twoLoads && countBlind && boundFatal, 'the eleven patch sites exist');
  // the generation ignored: a same-count rewrite serves the old ledger's money
  { const w = world(REPO, { seed: 14 });
    const hd = path.join(w.data, 'usage-history'), f = fs.readdirSync(hd).filter((x) => /^events-/.test(x)).sort().pop(), fp = path.join(hd, f), ls = fs.readFileSync(fp, 'utf8').trim().split('\n');
    let k0 = -1, a = 0, b = 0; // a sub-a row whose hour holds no absent count (a NaN would hide the money)
    for (let k = ls.length - 1; k >= 0 && k0 < 0; k--) { const e = JSON.parse(ls[k]); if (e.acct !== 'sub-a' || e.host || !(e.i >= 0)) continue; const t = masterWalk(w.uh, ['sub-a'], e.ts - 1800e3, e.ts + 1800e3); if (Number.isFinite(t.total)) { k0 = k; a = e.ts - 1800e3; b = e.ts + 1800e3; } }
    noGen.costBetweenMulti(w.uh, ['sub-a'], a, b);
    const e0 = JSON.parse(ls[k0]); e0.i += 900000; ls[k0] = JSON.stringify(e0);
    fs.writeFileSync(fp, ls.join('\n') + '\n'); w.uh._rebuildOnLoop();
    const got = noGen.costBetweenMulti(w.uh, ['sub-a'], a, b), truth = masterWalk(w.uh, ['sub-a'], a, b), fixed = w.UA.costBetweenMulti(w.uh, ['sub-a'], a, b);
    ok(k0 >= 0 && !near(got, truth) && near(fixed, truth), `RED: the version ignoring the ledger's generation ⇒ a same-count rewrite (one row's tokens changed in place) serves $${got.total} for $${truth.total} — EQUALITY red (the fix: $${fixed.total})`, { got: got.total, truth: truth.total });
    rmWorld(w); }
  // a prime landing although the price table moved under it
  { const w = world(REPO, { seed: 15 }); const L = w.est.lines('email:a@x').filter((l) => l.prevFetchedAt), groups = [{ ids: ['sub-a'], intervals: L.map((l) => [l.prevFetchedAt, l.fetchedAt]) }];
    let steps = 0; const done = landsAnyway.primeCostsStepped(w.uh, groups, { syncMaxRows: 0, sliceMs: 10 * DAY, next: (fn) => setImmediate(() => { if (++steps === 5) w.uh.setPricing({ tiers: { 'claude-opus-5': { input: 70, output: 330, cacheWrite5m: 80, cacheWrite1h: 120, cacheRead: 7 } } }); fn(); }) });
    await done;
    let bad = 0, worst = null; for (const l of L) { const got = landsAnyway.costBetweenMulti(w.uh, ['sub-a'], l.prevFetchedAt, l.fetchedAt), truth = masterWalk(w.uh, ['sub-a'], l.prevFetchedAt, l.fetchedAt); if (!near(got, truth)) { bad++; worst = worst || { got: got.total, truth: truth.total }; } }
    ok(bad > 0, `RED: a prime that LANDS although the price table moved under it ⇒ ${bad} of ${L.length} pairs served at the old prices (e.g. $${worst && worst.got} for $${worst && worst.truth}) — EQUALITY red`, worst);
    rmWorld(w); }
  // THE ARRIVAL LOG's two edges: another account's late row, and a row past the old end, must not be added by the log
  { const w = world(REPO, { seed: 8, rows: 9000 }); const a0 = NOW - 2 * DAY;
    const scene = (UA2) => { UA2.costBetweenMulti(w.uh, ['sub-a'], a0, NOW); const r1 = w.mkRow(NOW - DAY, { acct: 'sub-b', i: 900000 }), r2 = w.mkRow(NOW - 3600e3, { acct: 'sub-a', i: 700000 }), r3 = w.mkRow(NOW + 600e3, { acct: 'sub-a', i: 800000 });
      for (const r of [r1, r2, r3]) { delete r.host; r.atype = 'subscription'; } w.append([r1, r2, r3]); return UA2.costBetweenMulti(w.uh, ['sub-a'], a0, NOW + 1200e3); };
    const truth = () => masterWalk(w.uh, ['sub-a'], a0, NOW + 1200e3);
    const w2 = world(REPO, { seed: 8, rows: 9000 }), w3 = world(REPO, { seed: 8, rows: 9000 });
    const fixed = scene(w.UA), tF = truth();
    const sc2 = (W2, UA2) => { UA2.costBetweenMulti(W2.uh, ['sub-a'], a0, NOW); const r1 = W2.mkRow(NOW - DAY, { acct: 'sub-b', i: 900000 }), r2 = W2.mkRow(NOW - 3600e3, { acct: 'sub-a', i: 700000 }), r3 = W2.mkRow(NOW + 600e3, { acct: 'sub-a', i: 800000 });
      for (const r of [r1, r2, r3]) { delete r.host; r.atype = 'subscription'; } W2.append([r1, r2, r3]); return { got: UA2.costBetweenMulti(W2.uh, ['sub-a'], a0, NOW + 1200e3), truth: masterWalk(W2.uh, ['sub-a'], a0, NOW + 1200e3) }; };
    const m1 = sc2(w2, otherAcct), m2 = sc2(w3, pastEnd);
    ok(near(fixed, tF) && !near(m1.got, m1.truth) && !near(m2.got, m2.truth), `RED: the log adding ANOTHER account's late row ($${m1.got.total} for $${m1.truth.total}) / the log taking a row PAST the old end too — counted twice with the extension ($${m2.got.total} for $${m2.truth.total}) — EQUALITY red (the fix: $${fixed.total} = $${tF.total})`, { m1: [m1.got.total, m1.truth.total], m2: [m2.got.total, m2.truth.total] });
    for (const x of [w, w2, w3]) fs.rmSync(x.data, { recursive: true, force: true }); }
  // the cap back at 20 000: a working set past it misses
  { const w = world(REPO, { seed: 2, rows: 3000, pairs: [10, 10, 10, 10] }); const cyc = []; for (let k = 0; k < 26000; k++) { const a = NOW - 30 * DAY + k * 60000; cyc.push([a, a + 60000]); }
    const sweep = (UA2) => { for (const [a, b] of cyc) UA2.costBetweenMulti(w.uh, ['sub-c'], a, b); w.zero(); let walks = 0; const rr = w.uh._events; w.uh._events = function* (f, t) { walks++; yield* rr.call(this, f, t); }; for (const [a, b] of cyc) UA2.costBetweenMulti(w.uh, ['sub-c'], a, b); w.uh._events = rr; return walks; };
    const fixed = sweep(w.UA), mut = sweep(cap);
    ok(fixed === 0 && mut > 4000, `RED: the cap back at 20 000 ⇒ a 26 000-interval working set walks ${mut} intervals again on the second pass (200 000 keys: ${fixed})`, { fixed, mut });
    rmWorld(w); }
  // no forward extension: the rows after a slot's end are never added ⇒ the money differs
  { const w = world(REPO, { seed: 10 }); const run = (UA2) => { UA2.costBetweenMulti(w.uh, ['sub-a'], NOW - 2 * 3600e3, NOW); const r = w.mkRow(NOW + 500, { acct: 'sub-a', i: 900000 }); delete r.host; r.atype = 'subscription'; w.append([r]); return UA2.costBetweenMulti(w.uh, ['sub-a'], NOW - 2 * 3600e3, NOW + 1000); };
    const got = run(noExt), truth = masterWalk(w.uh, ['sub-a'], NOW - 2 * 3600e3, NOW + 1000);
    ok(!near(got, truth), `RED: no forward extension ⇒ a row after the slot's end is never added: $${got.total} served for $${truth.total} — EQUALITY red`, { got: got.total, truth: truth.total });
    rmWorld(w); }
  // a version blind to the interval's rows: a late row INTO an interval is not walked ⇒ the money differs
  { const w = world(REPO, { seed: 11 }); const a = NOW - 10 * DAY, b = NOW - 9 * DAY;
    blind.costBetweenMulti(w.uh, ['sub-a'], a, b); w.append([w.mkRow(a + 3600e3, { acct: 'sub-a', i: 900000 })]);
    const got = blind.costBetweenMulti(w.uh, ['sub-a'], a, b), truth = masterWalk(w.uh, ['sub-a'], a, b);
    ok(!near(got, truth), `RED: a version blind to the interval's own rows ⇒ a late row INTO it is not walked: $${got.total} served for $${truth.total} — EQUALITY red`, { got: got.total, truth: truth.total });
    rmWorld(w); }
  // the whole ring scanned per ask
  { const est = read('src/usage-estimator.js'), from = '    if (last && !(entry.ts >= last.ts)) this._liveOutOfOrder = true;';
    ok(est.includes(from), 'the ring patch site exists');
    const EM = require(M.write('src/usage-estimator.js', est.replace(from, '    this._liveOutOfOrder = true;'), 'ring-scan'));
    const e = new EM.UsageEstimator({ anchorsDir: os.tmpdir(), usageHistory: { ledgerKnowsId: () => false }, resolveIdentity: () => null });
    for (let k = 0; k < 3000; k++) e.noteLive({ rid: 'm' + k, accountId: 'sub-a', model: 'claude-opus-5-5', usd: 0.01, ts: NOW - 3 * 3600e3 + k * 3000 });
    let reads = 0; const ring = e._liveRing; e._liveRing = new Proxy(ring, { get(t, k) { if (typeof k === 'string' && /^\d+$/.test(k)) reads++; return t[k]; } });
    e._liveDelta(['sub-a'], NOW - 40 * DAY, NOW - 39 * DAY);
    ok(reads >= 2000, `RED: the whole ring scanned per ask ⇒ an interval before the ring reads ${reads} entries (by range: ≤ 2)`, reads); }
}

console.log('§5 THE CENSUS (law 4) — every main-thread reader of the ledger\'s iterators, its cadence, its bound');
{
  const ROWS = [
    ['src/usage-anchors.js', 'for (const ev of usageHistory._events(fromMs, toMs))', 'costBetweenMulti — the estimator\'s windows (GET /api/usage, the pool evaluation), its burn window, learnRates\' pairs, the 60 s sweep\'s new pair', 'an interval is walked ONCE per (ledger generation, price table) and again only when a row entered it (its own version)'],
    ['src/usage-anchors.js', 'for (const ev of usageHistory._events(after, toMs))', 'costBetweenMulti — the same interval grown at its end (`to = now`)', 'the rows that arrived after its end'],
    ['src/usage-anchors.js', "for (const ev of usageHistory._events(a === -Infinity ? undefined : a, b === Infinity ? undefined : b))", 'primeCosts / primeCostsStepped — a cold memo\'s first learn (a boot, a pricing edit, a rewritten ledger)', 'once per memo epoch: every anchor pair\'s span ONCE for all identities, in 2-hour slices off the request path (≤ 50 k rows at once)'],
    ['src/usage-history.js', 'for (const ev of this._allRows(opts.from, opts.to)) this._aggRow(st, ev);', 'aggregate (sync) — migrations and suites; the server reads aggregateAsync', 'not on a request path'],
    ['src/usage-history.js', 'for (const ev of this._hotEvents(opts.from, opts.to, this._sortedEvents().slice()))', 'aggregateAsync\'s hot fold — GET /api/usage-stats (the Usage window a person opens)', 'the asked range, handing the loop back every 5 000 rows'],
    ['src/usage-history.js', 'const walk = this._coldWalk(opts.from, opts.to);', 'aggregateAsync\'s cold walk', 'off the loop (the fold worker)'],
    ['src/usage-history.js', 'const evs = this._loadEvents();\n    for (let i = evs.length - 1; i >= 0; i--) if (evs[i].rid === rid) return evs[i];', 'eventForRid — the popup\'s per-message billing lookup (GET /api/usage-event)', 'NAMED DEBT (item 9 withdrawn: a map of the hot rows by id is 43.9 MB at the owner\'s shape): the hot rows scanned per click — 8.35 ms for an id no row has, 0.01 ms for a recent one (lane bench)'],
    ['src/usage-history.js', 'const evs = this._loadEvents();\n    const suf = \':\' + mid;', 'eventForMid — the same lookup by message id', 'NAMED DEBT (item 9 withdrawn): the hot rows scanned per click — 4.3 ms for an id no row has (lane bench)'],
    ['src/usage-anchors.js', 'const edge = (a, b) => { for (const ev of usageHistory._events(a, b))', 'the hour sums\' two edges — a long interval with no usable slot (B3)', 'its two edge hours (≤ 2 hours of every account\'s rows)'],
    ['src/usage-anchors.js', 'for (const ev of usageHistory._events(undefined, undefined)) return ev.ts || 0;', 'the whole-ledger sweep\'s first slice start', 'one row'],
    ['src/usage-history.js', 'const evs = this._loadEvents();\n    const c = this._evCache;\n    if (!c.sorted', '_sortedEvents — the hot rows in ts order, for every walk', 'the rows that arrived since the last sort are sorted and appended (merged)'],
    ['src/usage-history.js', 'for (const ev of this._events(since, to)) if (ev.host && hs.has(ev.host)', 'hostAccountsIn\'s fallback (B2 r2) — an ask reaching before the dark-host index\'s floor', 'never on the product\'s road (the pool engine asks 7 days; the floor stays 8 days behind its last ask) — when it runs, master\'s darkTaintedAccounts loop: the asked 7 days of rows'],
  ];
  const walk = (d) => fs.readdirSync(path.join(REPO, d), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? (e.name === 'node_modules' || e.name.startsWith('.') ? [] : walk(path.join(d, e.name))) : (/\.(c|m)?js$/.test(e.name) ? [path.join(d, e.name)] : []));
  const files = walk('src'); // THE TREE (A4), not named files
  const sites = [];
  for (const f of files) read(f).split('\n').forEach((l, i) => { const t = l.trim(); if (t.startsWith('//') || t.startsWith('*')) return; if (/\b_events\(|\b_allRows\(|\b_hotEvents\(|\._coldWalk\(|cold\.rows\(|const evs = this\._loadEvents\(\);/.test(l) && !/^\s*(\*\s*)?(_events|_allRows|_hotEvents|_coldWalk|_merged|rows)\s*\(|^\s*\*\s*_?\w+\(/.test(l) && !/yield\* this\.(_hotEvents|_merged)\(|const it = this\._hotEvents\(/.test(l)) sites.push([f, i + 1, t]); });
  const near = (f, line) => read(f).split('\n').slice(line - 1, line + 3).join('\n');
  const undeclared = sites.filter(([f, line, t]) => !ROWS.some(([rf, needle]) => rf === f && (t.includes(needle) || (needle.includes('\n') && near(f, line).includes(needle)))));
  const dead = ROWS.filter(([rf, needle]) => !read(rf).includes(needle));
  ok(undeclared.length === 0, `${sites.length} iterator sites, each a row with its cadence and bound (${ROWS.length} rows)`, undeclared);
  ok(dead.length === 0, 'every row names a live site', dead.map((r) => r[0] + ': ' + r[1]));
  ok(/\.estimateFor\(id, snap, now\)/.test(read('src/usage-routes.js')) && /byVersion/.test(read('src/cli-caps.js')), 'GET /api/usage\'s other heavy reader in the named sample — cli-caps byVersion under cli-unmeasured-notice byFact — is NAMED here, not changed (another lane\'s)');
}

console.log('§6 B2 — the dark-taint set from the (host, account) index: the walk\'s set, once per evaluation');
{
  const w = world(REPO, { seed: 17, rows: 9000 });
  const walkSet = (hosts, now) => { const d = new Set(hosts), out = new Set(); for (const ev of w.uh._events(now - 7 * DAY, now)) if (ev.host && d.has(ev.host) && ev.acct && ev.atype !== 'host') out.add(ev.acct); return out; };
  const eqSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
  // a second host, its newest row of one account older than 7 days; future-stamped rows; unresolved host rows; rows out of order
  w.append([w.mkRow(NOW - 9 * DAY, { host: 'H2', acct: 'sub-c', atype: 'subscription' }), w.mkRow(NOW - 2 * DAY, { host: 'H2', acct: 'sub-a', atype: 'host' }),
    w.mkRow(NOW + 3600e3, { host: 'H2', acct: 'sub-b', atype: 'subscription' }), w.mkRow(NOW - 6.9 * DAY, { host: 'H2', acct: 'sub-d', atype: 'subscription' }), w.mkRow(NOW - 3 * DAY, { host: 'H1', acct: 'sub-c', atype: 'subscription' })]);
  let bad = 0, n = 0, first = null;
  for (const hosts of [['H1'], ['H2'], ['H1', 'H2'], [], ['H3']]) for (const now of [NOW, NOW - 2 * DAY, NOW + 2 * 3600e3, NOW - 6.95 * DAY + 7 * DAY, NOW - 20 * DAY]) {
    const a = w.uh.hostAccountsIn(hosts, now - 7 * DAY, now).accts, b = walkSet(hosts, now); n++; if (!eqSet(a, b)) { bad++; first = first || { hosts, now, a: [...a], b: [...b] }; } }
  w.uh._rebuildOnLoop();
  for (const hosts of [['H1', 'H2']]) for (const now of [NOW, NOW - 3 * DAY]) { const a = w.uh.hostAccountsIn(hosts, now - 7 * DAY, now).accts, b = walkSet(hosts, now); n++; if (!eqSet(a, b)) { bad++; first = first || { rebuilt: true, hosts, now }; } }
  ok(bad === 0, `B2: the (host, account) index answers the dark-taint question as the 7-day walk does — ${n} (hosts, instant) cases: a host's newest row older than 7 days, future-stamped rows, unresolved host rows, rows out of order, a host going dark and coming back (the sets of hosts change), a rebuild — ${bad} differ`, first);
  let walks = 0; const ev0 = w.uh._events; w.uh._events = function* (f, t) { walks++; yield* ev0.call(this, f, t); };
  for (let k = 0; k < 37; k++) w.uh.hostAccountsIn(['H1', 'H2'], NOW - 7 * DAY, NOW);
  w.uh._events = ev0;
  const eng = read('src/server/usage-pool-engine.js');
  ok(walks === 0 && /function darkTaintedAccounts\(nowMs = Date\.now\(\)\) \{[\s\S]{0,700}if \(_darkTaintMemo\.key === key\) return _darkTaintMemo\.taint;/.test(eng) && (eng.match(/pessimism: darkTaintedAccounts\(now\)/g) || []).length === 10 && !/usageHistory\._events\(since, Date\.now\(\)\)/.test(eng),
    'B2: 37 asks of one evaluation walk 0 rows; the pool engine asks with the evaluation\'s own instant at all 10 decisions and memoizes on (instant, dark hosts, the index\'s version) — once per evaluation; no 7-day walk left', walks);
  rmWorld(w);
}
console.log('§7 B1 — THE ARRIVAL LOG: a late row costs its own addition to its own account\'s windows');
{
  // (4) THE NORMAL ARRIVAL: rows land BEFORE the last ask's end (the scan appends a record ~15 s after its ts)
  const lagged = (TREE) => {
    const w = world(TREE, { seed: 18, rows: 30000, pairs: [300, 300, 120, 400], ages: [0, 20, 0, 0] });
    const ids = ['sub-a', 'sub-b', 'sub-c', 'sub-d'], pass1 = (nowMs) => { for (const a of [...ids, null]) w.est.estimateFor(a, null, nowMs); };
    w.est._estMemo.clear(); pass1(NOW); w.est._estMemo.clear(); pass1(NOW + 4000);
    w.append(Array.from({ length: 25 }, (_, j) => w.mkRow(NOW + 4000 - 15000 + j * 100, { acct: w.pick(ids) }))); // stamped before the last ask's end
    let logReads = 0; const since = w.uh.arrivalsSince ? w.uh.arrivalsSince.bind(w.uh) : null; if (since) w.uh.arrivalsSince = (q) => { const r = since(q); if (r) logReads += r.length; return r; };
    w.est._estMemo.clear(); w.zero(); pass1(NOW + 8000);
    const r = { rows: w.visits(), logReads }; rmWorld(w); return r;
  };
  const fix = lagged(REPO), base = BASE ? lagged(BASE) : null;
  ok(fix.rows <= 400 && (!base || base.rows > 3000), `(4) ONE GET pass after 25 SCAN-LAGGED rows (stamped before the last ask's end): ${fix.rows} ledger rows + ${fix.logReads} log entries read${base ? ` — RED on 05082bbd0: ${base.rows} rows` : ''}`, { fix, base });
}
{
  const w = world(REPO, { seed: 19, rows: 9000 });
  const a0 = NOW - 2 * DAY, ask = (to, ids = ['sub-a']) => w.UA.costBetweenMulti(w.uh, ids, a0, to);
  ask(NOW); // a slot [a0, NOW]
  // (3) THE SPLIT BY ts AT ITS EDGE — a row at exactly the old end; one ahead of the clock; one before `from`; the same row twice
  const atEnd = w.mkRow(NOW, { acct: 'sub-a', host: undefined }), ahead = w.mkRow(NOW + 3600e3, { acct: 'sub-a' }), before = w.mkRow(a0 - 60e3, { acct: 'sub-a' });
  delete atEnd.host; delete ahead.host; delete before.host; atEnd.atype = ahead.atype = before.atype = 'subscription';
  w.append([atEnd, ahead, before, { ...atEnd }]);
  const steps = [NOW, NOW + 1800e3, NOW + 3600e3, NOW + 7200e3], got = steps.map((t) => ask(t)), want = steps.map((t) => masterWalk(w.uh, ['sub-a'], a0, t));
  ok(got.every((g, k) => near(g, want[k])) && got[0].requests === want[0].requests && got[3].requests === want[3].requests,
    '(3) THE SPLIT BY ts IS EXACT AT ITS EDGE: a row at exactly the old end added once; a row stamped an hour AHEAD of the clock not counted until the window\'s end passes it, then once; a row before `from` nothing; the same row offered twice dropped in _take — every step the walk\'s (to $0.0001, the requests exact)', { got: got.map((x) => [x.total, x.requests]), want: want.map((x) => [x.total, x.requests]) });
  // (1) THE LOG HOLDS WHAT AN ADDITION NEEDS, NOT THE ROW: a backfill of old rows arriving cold leaves no row object in the log
  const L = w.uh._evCache.arr, entries = L ? Math.min(L.seq, L.cap) : 0, objects = L ? Object.values(L).filter((v) => Array.isArray(v) && v.some((x) => x && typeof x === 'object' && 'ts' in x)).length : -1;
  const bytes = L ? [L.ts, ...L.tok, L.key, L.acct, L.be, L.model].reduce((n, a) => n + a.byteLength, 0) : 0;
  ok(!!L && objects === 0 && bytes === 100000 * 64, `(1) the log holds typed columns (ts, the five token counts, the interned account key / account / backend / model) — no row object; ${entries} entries now, ${bytes} bytes at its 100 000-entry cap (64 a row) — the memory census row`, { entries, objects, bytes });
  rmWorld(w);
}
{
  // (2) A POSITION IS A SEQUENCE NUMBER: 150 000 arrivals between two asks of one slot ⇒ the walk; a slot exactly at the oldest entry
  const w = world(REPO, { seed: 20, rows: 6000, nanRate: 0 }); // every count present: the money is readable (NaN rows: §1)
  const a0 = NOW - DAY, ask = () => w.UA.costBetweenMulti(w.uh, ['sub-a'], a0, NOW + 10 * DAY);
  // the slot holds 40 000+ rows of its own, so the scan guard (arrivals > 4 × its rows ⇒ walk) stays out of it: the LOG'S START decides
  w.append(Array.from({ length: 40000 }, (_, k) => { const r = w.mkRow(a0 + 1000 + k * 1000, { acct: 'sub-a' }); delete r.host; r.atype = 'subscription'; return r; }));
  const g0 = ask();
  const burst = (n, t0) => { const rows = []; for (let k = 0; k < n; k++) { const r = w.mkRow(t0 + (k % 1000) * 7, { acct: k % 5 ? 'sub-b' : 'sub-a' }); delete r.host; r.atype = 'subscription'; rows.push(r); } w.append(rows); };
  burst(150000, NOW - 12 * 3600e3);
  const g1 = ask(), t1 = masterWalk(w.uh, ['sub-a'], a0, NOW + 10 * DAY);
  ok(near(g1, t1) && g1.requests === t1.requests && Number.isFinite(g1.total) && g1.total > g0.total && g1.requests === g0.requests + 30000, `(2) 150 000 arrivals between two asks of one slot (its mark no longer in the 100 000-entry log; the slot's own 40 000+ rows keep the scan guard out — the log's start decides) ⇒ the walk's numbers ($${g1.total.toFixed(4)} / ${g1.requests} requests; before the burst $${g0.total.toFixed(4)} / ${g0.requests})`, { g0: g0.total, g1: g1.total, t1: t1.total, r0: g0.requests, r1: g1.requests });
  // a slot whose mark is EXACTLY the log's oldest entry: arrivals since it are all still held
  const L = w.uh._evCache.arr, oldest = L.seq - L.cap, held = w.uh.arrivalsSince(oldest), gone = w.uh.arrivalsSince(oldest - 1);
  ok(Array.isArray(held) && held.length === L.cap && gone === null, `(2) the log answers from its oldest held sequence (${held && held.length} entries) and refuses one before it (null ⇒ the walk)`);
  rmWorld(w);
}
console.log('§8 B3 + the rest — the hour sums, the stepped plan, the relearn spread, rates.json on the store writer, the pool\'s verdicts');
{
  // B3 THE HOUR SUMS: the sweep's costSince for a reading 60 days after the last — its edges walked, its hours summed
  const w = world(REPO, { seed: 21, rows: 30000, nanRate: 0 }); // no absent counts here: the money is readable (NaN rows: §1)
  w.est.ratesFor('email:a@x'); // the prime (at once at this size) builds the hour sums
  const a0 = NOW - 39 * DAY + 1234567, b0 = NOW - 2 * DAY + 7654321;
  w.zero(); const got = w.UA.costBetweenMulti(w.uh, ['sub-c', '__global__'], a0, b0); const rows = w.visits();
  const truth = masterWalk(w.uh, ['sub-c', '__global__'], a0, b0), whole = w.visits() - rows;
  ok(!!w.uh._evCache.hours && near(got, truth) && got.requests === truth.requests && rows <= whole / 100, `B3: a 37-day gap (the sweep's costSince for a long-unread reading) from the HOUR SUMS: ${rows} rows walked (its two edges) of the ${whole} the walk visits — the walk's money to $0.0001 ($${got.total} / $${truth.total}), the requests exact`, { rows, whole, got: got.total, truth: truth.total });
  // a row arriving after the install is kept by _take
  const r = w.mkRow(NOW - 20 * DAY + 999, { acct: 'sub-c', i: 500000 }); delete r.host; r.atype = 'subscription'; w.append([r]);
  const g2 = w.UA.costBetweenMulti(w.uh, ['sub-c'], a0 - 3 * DAY, b0 - 1), t2 = masterWalk(w.uh, ['sub-c'], a0 - 3 * DAY, b0 - 1);
  ok(near(g2, t2), `B3: a row arriving after the sums were built is kept by _take — the next long interval holds it ($${g2.total} / $${t2.total})`, { g2: g2.total, t2: t2.total });
  // the hour sums' bytes at this shape (the census figure is the lane report's at the owner's shape)
  const H = w.uh._evCache.hours.cells;
  ok(H.blocks > 0 && H.bytes === H.blocks * w.UA.HOUR_BLOCK_BYTES && w.UA.HOUR_BLOCK_BYTES === 24 * 10 * 8 + 240, `B3 r2: ${H.blocks} (account, UTC day) blocks here — ${H.bytes} bytes (${w.UA.HOUR_BLOCK_BYTES} a block: 24 hours × 10 numbers + 240 of array and Map entry, measured) — the census row's own figure`, { blocks: H.blocks, bytes: H.bytes });
  rmWorld(w);
}
{
  // B3 THE PLAN STEPPED: the first ask registers the hold and counts NO interval version at once
  const w = world(REPO, { seed: 22 });
  w.est.primeOpts = { syncMaxRows: 100, sliceMs: 5 * DAY };
  let counts = 0; const real = w.uh._evCountUpTo.bind(w.uh); w.uh._evCountUpTo = (t) => { counts++; return real(t); };
  const loading = w.uh.ledgerLoading(), first = (w.est.estimateFor('sub-a', null, NOW), counts);
  w.uh._evCountUpTo = real;
  for (let k = 0; k < 400 && w.uh.ledgerLoading(); k++) await new Promise((r) => setImmediate(r));
  ok(first <= 4 && !w.uh.ledgerLoading(), `B3: THE PLAN STEPPED — the first ask counted ${first} interval versions at once (the ledger's size only; ~2 300 intervals counted 4 000 a step after it) and the prime landed`, { first });
  rmWorld(w);
}
{
  // B3 THE RELEARN SPREAD + rates.json ON THE STORE WRITER
  const { rateTtlMs } = require('../src/usage-estimator.js');
  const ttls = Array.from({ length: 27 }, (_, k) => rateTtlMs('email:id' + k + '@x'));
  const lo = Math.min(...ttls), hi = Math.max(...ttls);
  ok(lo >= 450000 && hi <= 750000 && hi - lo >= 150000 && rateTtlMs('email:id3@x') === ttls[3], `B3: THE RELEARN SPREAD — 27 identities' rate TTLs span ${Math.round(lo / 1000)}–${Math.round(hi / 1000)} s (10 min ± 25 %, the same identity keeps its own): they never fall due in one pass`, { lo, hi });
  // B3 ON THE STORE WRITER (rebased onto hub-loop-stalls commit 2): a relearn of every identity in ONE handler costs the loop
  // no read, no write and no JSON build of rates.json per identity — the writer writes it once, on its own thread
  const wB3 = world(REPO, { seed: 23, rows: 2000, pairs: [300, 120, 60, 80] }); // one small world for the pin and its RED (a fresh estimator each): the pin counts rates.json's IO, not the fold
  const b3 = (EM, w = wB3) => {
    const est = new (EM ? EM.UsageEstimator : w.est.constructor)({ anchorsDir: w.adir, usageHistory: w.uh, resolveIdentity: w.est.resolveIdentity, lagS: 20 });
    for (const [key] of w.IDS) est.ratesFor(key); est.flushRates(); // learned once, on disk (the copy read)
    const fp = path.join(w.adir, 'rates.json'), n = { reads: 0, writes: 0, builds: 0, dirty: 0 };
    const rf = fs.readFileSync, wf = fs.writeFileSync, rn = fs.renameSync, js = JSON.stringify, SW = require('../src/store-writer.js').storeWriter(), dirty = SW.dirty;
    fs.readFileSync = function (f, ...a) { if (String(f).startsWith(fp)) n.reads++; return rf.call(this, f, ...a); };
    fs.writeFileSync = function (f, ...a) { if (String(f).startsWith(fp)) n.writes++; return wf.call(this, f, ...a); };
    fs.renameSync = function (f, ...a) { if (String(f).startsWith(fp)) n.writes++; return rn.call(this, f, ...a); };
    JSON.stringify = function (v, ...a) { if (v && typeof v === 'object' && w.IDS.some(([k]) => v[k] && v[k].buckets)) n.builds++; return js.call(this, v, ...a); };
    SW.dirty = function (f, ...a) { if (f === fp) n.dirty++; return dirty.call(this, f, ...a); };
    const t0 = process.hrtime.bigint();
    try { for (const [key] of w.IDS) { est.invalidate(key); est.ratesFor(key); } } finally { n.ms = Number(process.hrtime.bigint() - t0) / 1e6; fs.readFileSync = rf; fs.writeFileSync = wf; fs.renameSync = rn; JSON.stringify = js; SW.dirty = dirty; }
    est.flushRates(); const onDisk = w.IDS.every(([k]) => !!JSON.parse(fs.readFileSync(fp, 'utf8'))[k]);
    return { ...n, onDisk, ids: w.IDS.length };
  };
  const r3 = b3(null);
  ok(r3.reads === 0 && r3.writes === 0 && r3.builds === 0 && r3.dirty === r3.ids && r3.onDisk, `B3 ON THE STORE WRITER: a relearn of ${r3.ids} identities in one handler (${r3.ms.toFixed(1)} ms) — ${r3.reads} reads, ${r3.writes} writes, ${r3.builds} JSON builds of rates.json on the loop; ${r3.dirty} dirty marks; the writer's one write puts every identity on disk`, r3);
  {
    // RED: master's road (a read + a JSON build + a write + a rename of the whole file on the loop, per identity)
    const M = mutantCopies('usage-ledger-walk-b3w', REPO), src = read('src/usage-estimator.js');
    const from = "      require('./store-writer.js').storeWriter().dirty(fp, { name: 'usage-rates.write', produce: () => JSON.stringify(this._ratesAll, null, 1) });";
    const EM = src.includes(from) ? require(M.write('src/usage-estimator.js', src.replace(from, "      this._ratesAll = null; let all = {}; try { all = JSON.parse(fs.readFileSync(fp, 'utf-8')) || {}; } catch { } all[identityKey] = { computedAt: Date.now(), nAnchors, buckets: rates }; fs.writeFileSync(fp + '.tmp', JSON.stringify(all, null, 1)); fs.renameSync(fp + '.tmp', fp);"), 'b3-on-loop')) : null;
    if (EM) EM.UsageEstimator.prototype.relearnStepLines = Infinity; // usage-relearn-stepped: B's laws judged on whole relearns (the mutant class too)
    const R = EM ? b3(EM) : null;
    ok(!!R && R.writes >= 2 * R.ids && R.builds >= R.ids, `RED: rates.json written on the loop per identity (master's road) ⇒ ${R && R.reads} reads, ${R && R.writes} writes, ${R && R.builds} JSON builds in the handler`, R);
  }
  rmWorld(wB3);
}
{
  // CONDITION 4 — THE POOL'S VERDICTS: every decidePoolSwitch over the corpus (scan-lagged rows arriving) equals the verdict on master's walk
  const AP = require('../src/account-pool-auto.js'), { overlayCache } = require('../src/usage-estimator.js');
  const w = world(REPO, { seed: 25, rows: 20000, ages: [0, 3, 0, 0] });
  const o = new (w.est.constructor)({ anchorsDir: w.adir, usageHistory: w.uh, resolveIdentity: w.est.resolveIdentity, lagS: 20 });
  o._costFn = (ids) => (f, t) => masterWalk(w.uh, ids, f, t); o._primePairs = () => { };
  const members = ['sub-a', 'sub-b', 'sub-c', 'sub-d'];
  const rawOf = (id) => { const key = w.est.resolveIdentity(id).identityKey, ls = w.est.lines(key), l = ls[ls.length - 1]; return { fetchedAt: l.fetchedAt, fiveHour: { utilization: l.buckets.fiveHour.u, resetsAt: l.buckets.fiveHour.resetsAt }, sevenDay: { utilization: l.buckets.sevenDay.u, resetsAt: l.buckets.sevenDay.resetsAt }, scopedWeekly: (l.buckets.scopedWeekly || []).map((x) => ({ name: x.name, utilization: x.u, resetsAt: x.resetsAt })) }; };
  let verdicts = 0, flips = 0, pairs = 0, diffAfterRounding = 0, firstFlip = null;
  for (const [k, nowMs] of [[0, NOW], [1, NOW + 8000], [2, NOW + 16000]]) {
    if (k) w.append(Array.from({ length: 25 }, (_, j) => { const r = w.mkRow(nowMs - 15000 + j * 100, { acct: w.pick(members) }); delete r.host; r.atype = 'subscription'; return r; }));
    w.est._estMemo.clear(); o._estMemo.clear();
    const view = (E) => (id) => overlayCache(rawOf(id), E.estimateFor(id, null, nowMs));
    const vf = view(w.est), vo = view(o);
    for (const id of members) { const ef = w.est.estimateFor(id, null, nowMs), eo = o.estimateFor(id, null, nowMs);
      for (const b of ['fiveHour', 'sevenDay']) { if (ef && eo && ef[b] && eo[b]) { pairs++; if (ef[b].utilization !== eo[b].utilization) diffAfterRounding++; } } }
    for (const currentId of members) for (const proactive of [false, true]) {
      const args = { currentId, members, nowSec: Math.floor(nowMs / 1000), proactive, hot: proactive };
      const a = AP.decidePoolSwitch({ ...args, readCache: vf }), b = AP.decidePoolSwitch({ ...args, readCache: vo });
      verdicts++; if (JSON.stringify(a) !== JSON.stringify(b)) { flips++; firstFlip = firstFlip || { currentId, proactive, a, b }; }
    }
  }
  ok(flips === 0, `CONDITION 4: ${verdicts} pool verdicts (decidePoolSwitch, every member current, proactive and not, three instants with scan-lagged rows arriving) EQUAL the verdicts on master's walk; the search: ${pairs} bucket estimates compared, ${diffAfterRounding} differ after the product's rounding — so no estimate sits across a line from master's`, firstFlip);
  rmWorld(w);
}
{
  // CONDITION 3 — every index of the commit is a row of the memory census, bounded
  const w = world(REPO, { seed: 26 });
  w.est.ratesFor('email:a@x'); const r = w.mkRow(NOW - 60e3, { acct: 'sub-a', host: 'H1', atype: 'subscription' }); w.append([r]);
  const rows = w.uh.cacheCensus(), get = (n) => rows.find((x) => x.name === n);
  const names = ['usage arrival log', 'usage hour sums', 'usage dark-host index', 'usage cost memo'];
  ok(names.every((n) => !!get(n)) && get('usage arrival log').ceiling === 100000 * 64 + 4 * 4096 * 128 && get('usage cost memo').ceiling === 200000 * 509 && get('usage hour sums').count > 0 && get('usage hour sums').ceiling === w.UA.HOURS_MAX_BYTES && get('usage hour sums').bytes === get('usage hour sums').count * w.UA.HOUR_BLOCK_BYTES && /kept 8 days/.test(get('usage dark-host index').basis || ''),
    `CONDITION 3 (r2): the memory census names every index with its ceiling — ${names.map((n) => `${n} ${get(n) ? get(n).bytes : '?'} B of ${get(n) && get(n).ceiling ? get(n).ceiling + ' B' : get(n) ? '8 days' : '?'}`).join(' · ')} (the owner's shape: the lane report)`, rows.map((x) => [x.name, x.bytes, x.ceiling, x.basis]));
  rmWorld(w);
}

console.log('§9 ROUND 2 — a slot is of ONE ledger and ONE price table, read at ONE moment');
{
  // MUST 1 — THE STORE AT EVERY BOUNDARY: a pricing edit or a same-count swap lands in the turn before a store chunk (or the hour
  // sums), a reader asks costMemoEpoch in that turn (every GET does, through the estimator) — nothing of the old epoch is served
  const seedW = world(REPO, { seed: 31, rows: 2000, nanRate: 0 }), dA = seedW.data, hA = path.join(dA, 'usage-history');
  const dB = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-ulw-swap-')), hB = path.join(dB, 'usage-history'); fs.mkdirSync(hB, { recursive: true });
  const T0 = NOW - 20 * DAY; // the swapped ledger: every sub-a row before T0 re-attributed to sub-b — the same rows, the same count
  for (const f of fs.readdirSync(hA).filter((x) => /^events-/.test(x))) fs.writeFileSync(path.join(hB, f), fs.readFileSync(path.join(hA, f), 'utf8').split('\n').map((l) => { if (!l) return l; const r = JSON.parse(l); if (r.acct === 'sub-a' && r.ts < T0) r.acct = 'sub-b'; return JSON.stringify(r); }).join('\n'));
  const IV = []; for (let k = 0; k < 160; k++) { const f = Math.floor(NOW - 30 * DAY + k * 3 * 3600e3); IV.push([f, f + 2 * 3600e3]); }
  const run = async (UA2, mode, fireAt) => {
    fs.rmSync(path.join(hA, 'pricing.json'), { force: true });
    const w = world(REPO, { seed: 31, dataDir: dA }); // a new ledger object over the same files
    let n = 0, S = -1, fired = false;
    const fire = () => {
      fired = true;
      if (mode === 'pricing') w.uh.setPricing({ accounts: { 'sub-a': { discount: 0.2 } } });
      else { const u2 = new (w.uh.constructor)({ dataDir: dB, homeDir: dB }); u2.ledgerWindowMs = 12 * DAY; u2.ledgerHotMaxBytes = 2e6; u2.warm(); w.uh.dir = u2.dir; w.uh._swapCache(u2._evCache); }
      UA2.costMemoEpoch(w.uh); // the reader in the turn (the estimator's _ledgerLoading → _primePairs)
    };
    const r = await UA2.primeCostsStepped(w.uh, [{ ids: ['sub-a'], intervals: IV }], { syncMaxRows: 0, sliceMs: 5 * DAY, storeStep: 40, say: () => { }, storeHook: () => { S = n - 1; }, next: (fn) => setImmediate(() => { if (n++ === fireAt && !fired) fire(); fn(); }) });
    let wrong = 0, first = null;
    for (const [f, t] of IV) { const got = UA2.costBetweenMulti(w.uh, ['sub-a'], f, t), truth = masterWalk(w.uh, ['sub-a'], f, t); if (!near(got, truth) || got.requests !== truth.requests) { wrong++; first = first || { f, got: [got.total, got.requests], truth: [truth.total, truth.requests] }; } }
    return { r, S, turns: n, fired, wrong, first };
  };
  const dry = await run(seedW.UA, 'none', -1), bounds = [];
  for (let t = dry.S; t < dry.turns; t++) bounds.push(t);
  const res = [];
  for (const mode of ['pricing', 'swap']) for (const t of bounds) res.push({ mode, t, ...(await run(seedW.UA, mode, t)) });
  const wrongs = res.reduce((n, x) => n + x.wrong, 0), abandoned = res.filter((x) => x.r && x.r.abandoned).length;
  ok(dry.S > 0 && bounds.length >= 5 && res.every((x) => x.fired) && wrongs === 0 && abandoned === res.length,
    `MUST 1: the store at EVERY boundary (${bounds.length}: before each of its ${Math.ceil(IV.length / 40)} chunks of 40 and the hour sums) × a pricing edit / a same-count swap, a reader in the turn: ${res.length} primes, all abandoned, 0 of ${res.length * IV.length} intervals wrong against the walk`, res.filter((x) => x.wrong || !(x.r && x.r.abandoned)).slice(0, 3));
  const red = [];
  for (const mode of ['pricing', 'swap']) red.push({ mode, ...(await run(storeBlind, mode, dry.S + 1)) });
  ok(red.every((x) => x.wrong > 0), `RED: a store blind to the epoch (the chunk's check removed) ⇒ ${red.map((x) => `${x.mode}: ${x.wrong} of ${IV.length} wrong (e.g. $${x.first && x.first.got[0]} / ${x.first && x.first.got[1]} served for $${x.first && x.first.truth[0]} / ${x.first && x.first.truth[1]})`).join('; ')}`, red.map((x) => x.wrong));
  fs.rmSync(dA, { recursive: true, force: true }); fs.rmSync(dB, { recursive: true, force: true });
}
{
  // MUST 2 — ONE LOAD PER ASK: a re-check that fires at ANY later load call of an ask (rows another writer appended, nothing
  // zeroed — the throttle passed at that call) takes nothing in until the next ask's own load: every later ask equals the walk.
  // Each road: the plain walk (a miss), the extension (a held slot), the hour sums (a long interval with no slot).
  const scene = async (UA2, seed) => {
    const w = world(REPO, { seed, rows: 4000, nanRate: 0 }), hd = path.join(w.data, 'usage-history');
    const shard = (ts) => { const d = new Date(ts); return path.join(hd, `events-${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}.ndjson`); };
    const sub = (ts) => { const r = w.mkRow(ts, { acct: 'sub-a' }); delete r.host; r.atype = 'subscription'; return r; };
    const ext = (rows) => { for (const r of rows) fs.appendFileSync(shard(r.ts), JSON.stringify(r) + '\n'); }; // ANOTHER writer: checkedAt untouched
    let pending = [], calls = 0, armAt = -1;
    const realLoad = w.uh._loadEvents;
    w.uh._loadEvents = function () { if (++calls === armAt && pending.length) { ext(pending); pending = []; this._evCache.checkedAt = 0; } return realLoad.call(this); };
    const ask = (from, to, at = -1) => { calls = 0; armAt = at; const r = UA2.costBetweenMulti(w.uh, ['sub-a'], from, to); armAt = -1; return { r, calls }; };
    const later = (from, to0) => { let bad = 0; const out = []; for (let k = 1; k <= 3; k++) { const to = to0 + k * 8000, got = ask(from, to).r, truth = masterWalk(w.uh, ['sub-a'], from, to); out.push([got.total, got.requests, truth.total, truth.requests]); if (!near(got, truth) || got.requests !== truth.requests) bad++; } return { bad, out }; };
    UA2.primeCostsStepped(w.uh, [{ ids: ['sub-a'], intervals: [[NOW - 2 * DAY, NOW - DAY]] }], { syncMaxRows: 1e9 }); // the hour sums installed (at once at this size)
    const roads = { walk: [], extension: [], hours: [] }, J = {};
    let base = NOW;
    const setup = (road) => { // a fresh interval of this road, another writer's rows waiting on disk
      base += 3600e3; const to = base, from = road === 'hours' ? to - 30 * 3600e3 - 4567 : to - 2 * 3600e3 + 77;
      if (road === 'extension') { ask(from, to - 20000); w.append([{ ...sub(to - 40000), acct: 'sub-b' }]); pending = [sub(to - 3000), sub(to - 2000)]; } // a held slot; an ordinary arrival moves the log on; the rows after its end
      else pending = [sub(to - 15000), sub(to - 14000)];
      return { from, to };
    };
    for (const road of Object.keys(roads)) {
      let q = setup(road); const d = ask(q.from, q.to, 1); J[road] = d.calls; roads[road].push({ j: 1, ...later(q.from, q.to) }); // the dry ask: its loads counted (the rows go in at its own first load)
      for (let j = 2; j <= J[road]; j++) { q = setup(road); ask(q.from, q.to, j); roads[road].push({ j, ...later(q.from, q.to) }); }
    }
    rmWorld(w);
    return { roads, J };
  };
  const fix = await scene(require('../src/usage-anchors.js'), 32), mut = await scene(twoLoads, 32);
  const badOf = (x) => Object.fromEntries(Object.entries(x.roads).map(([k, v]) => [k, v.reduce((n, y) => n + y.bad, 0)]));
  const fb = badOf(fix), mb = badOf(mut);
  ok(Object.values(fix.J).every((n) => n >= 3) && Object.values(fb).every((n) => n === 0),
    `MUST 2: ONE LOAD PER ASK — another writer's rows taken in by a re-check forced at each later load call of an ask (the walk: ${fix.J.walk - 1}, the extension: ${fix.J.extension - 1}, the hour sums: ${fix.J.hours - 1} calls), three later asks each: every later ask equals the walk (0 / 0 / 0 wrong)`, { J: fix.J, fb });
  ok(mb.walk > 0 && mb.extension > 0 && mb.hours > 0, `RED: an ask that loads again (the pin removed) ⇒ later asks wrong — the walk ${mb.walk}, the extension ${mb.extension}, the hour sums ${mb.hours} (a row counted twice, for good: e.g. ${JSON.stringify((mut.roads.walk.find((x) => x.bad) || {}).out?.[0])} [served $, req, the walk's $, req])`, mb);
}

{
  // ROUND 3 — THE PRIME IS OF ONE EPOCH FROM ITS FIRST STEP: an epoch change before EVERY turn of the stepped prime — its count
  // steps included — a rebuild's swap that DROPS 2 rows of another account in X, a same-count swap, a pricing edit; then 2 late
  // rows of X's own account arrive after its slice. Every ask (X, X again, a 40-hour interval over X — the hour sums' road — and a
  // sample) equals the walk, and so after a re-prime.
  const base = world(REPO, { seed: 41, rows: 800, nanRate: 0 }), X = [NOW - 12 * DAY + 31, NOW - 12 * DAY + 12 * 3600e3 + 31];
  base.append([0, 1, 2].map((k) => { const r = base.mkRow(X[0] + 600e3 + k * 3600e3, { acct: 'sub-b' }); delete r.host; r.atype = 'subscription'; return r; }));
  const hA = path.join(base.data, 'usage-history'), name = (ts) => { const d = new Date(ts); return `events-${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}.ndjson`; };
  const copyOf = (src, fn = null) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-ulw-r3-')); for (const e of fs.readdirSync(src, { withFileTypes: true })) { if (e.isDirectory()) { fs.mkdirSync(path.join(d, e.name)); for (const f of fs.readdirSync(path.join(src, e.name))) { const t = fs.readFileSync(path.join(src, e.name, f), 'utf8'); fs.writeFileSync(path.join(d, e.name, f), fn && /^events-/.test(f) ? fn(t) : t); } } else fs.copyFileSync(path.join(src, e.name), path.join(d, e.name)); } return d; };
  const dropper = () => { let n = 0; return (t) => t.split('\n').filter((l) => { if (!l) return true; const r = JSON.parse(l); if (r.acct === 'sub-b' && r.ts >= X[0] && r.ts <= X[1] && n < 2) { n++; return false; } return true; }).join('\n'); }; // 2 rows of X in all, whichever shard holds them
  const reattr = (t) => t.split('\n').map((l) => { if (!l) return l; const r = JSON.parse(l); if (r.acct === 'sub-a' && r.ts < NOW - 20 * DAY) r.acct = 'sub-c'; return JSON.stringify(r); }).join('\n');
  const IV = [X]; for (let k = 0; k < 39; k++) { const f = Math.floor(NOW - 30 * DAY + k * 17 * 3600e3); IV.push([f, f + 2 * 3600e3]); }
  const LONG = [X[0] - 14 * 3600e3, X[0] + 26 * 3600e3], ASK = [X, X, LONG, IV[5], IV[17], IV[33]];
  const opts = { syncMaxRows: 0, sliceMs: 10 * DAY, countStep: 10, storeStep: 10, say: () => { } };
  const run = async (UA2, mode, fireAt) => {
    const d = copyOf(base.data), w = world(REPO, { seed: 41, dataDir: d }), uh = w.uh;
    let n = 0, S = -1, fired = false, late = false;
    const addLate = () => { if (late) return; late = true; fs.appendFileSync(path.join(uh.dir, name(X[0])), [0, 1].map((k) => { const r = w.mkRow(X[0] + 2000 + k, { acct: 'sub-a', rid: `r3-late-${fireAt}-${k}` }); delete r.host; r.atype = 'subscription'; return JSON.stringify(r); }).join('\n') + '\n'); uh._evCache.checkedAt = 0; uh._loadEvents(); };
    const fire = async () => {
      fired = true;
      if (mode === 'pricing') uh.setPricing({ accounts: { 'sub-a': { discount: 0.2 } } });
      else if (mode === 'rebuild') { const f = path.join(uh.dir, name(X[0])); fs.writeFileSync(f + '.tmp', dropper()(fs.readFileSync(f, 'utf8'))); fs.renameSync(f + '.tmp', f); uh.reloadEvents(); await uh.rebuildSettled(); } // THE REAL ROAD: a repair's rewrite, the fold worker, the swap
      else { const d2 = copyOf(d, mode === 'drop' ? dropper() : reattr), u2 = new (uh.constructor)({ dataDir: d2, homeDir: d2 }); u2.ledgerWindowMs = 12 * DAY; u2.ledgerHotMaxBytes = 2e6; u2.warm(); uh.dir = u2.dir; uh._swapCache(u2._evCache); }
      UA2.costMemoEpoch(uh); // a reader in the turn
    };
    const r = await UA2.primeCostsStepped(uh, [{ ids: ['sub-a'], intervals: IV }], { ...opts, storeHook: () => { S = n - 1; }, next: (fn) => setImmediate(async () => { const t = n++; if (t === fireAt && !fired) await fire(); if (fired && t > fireAt && t >= S && S >= 0) addLate(); fn(); }) });
    if (fireAt >= 0) addLate();
    const judge = () => { let bad = 0, first = null; for (const [f, t] of ASK) { const g = UA2.costBetweenMulti(uh, ['sub-a'], f, t), tr = masterWalk(uh, ['sub-a'], f, t); if (!near(g, tr) || g.requests !== tr.requests) { bad++; first = first || [g.total, g.requests, tr.total, tr.requests]; } } return { bad, first }; };
    const a1 = judge(); await UA2.primeCostsStepped(uh, [{ ids: ['sub-a'], intervals: IV }], { ...opts }); const a2 = judge();
    fs.rmSync(d, { recursive: true, force: true }); if (uh.dir !== path.join(d, 'usage-history')) fs.rmSync(path.dirname(uh.dir), { recursive: true, force: true });
    return { mode, fireAt, r, S, turns: n, fired, wrong: a1.bad, afterReprime: a2.bad, first: a1.first || a2.first };
  };
  const dry = await run(base.UA, 'none', -1), countTurns = []; for (let t = 0; t < dry.S; t++) countTurns.push(t);
  const res = [];
  for (let t = 0; t < dry.turns; t++) res.push(await run(base.UA, 'drop', t));
  for (const mode of ['swap', 'pricing']) for (const t of countTurns) res.push(await run(base.UA, mode, t));
  for (const t of [countTurns[1], countTurns[countTurns.length - 2]]) res.push(await run(base.UA, 'rebuild', t)); // the real road at two count turns (a fold-worker rebuild each — the other kinds cover every count turn)
  const wrongs = res.reduce((k, x) => k + x.wrong + x.afterReprime, 0), aband = res.filter((x) => x.r && x.r.abandoned).length;
  ok(dry.S >= 5 && res.every((x) => x.fired) && wrongs === 0 && aband === res.length,
    `ROUND 3: an epoch change before EVERY turn of the prime (${dry.turns}: ${dry.S} before the store — the count steps, the finish, the sweep — and the store's) × a swap that drops rows; the count turns also × a same-count swap, a pricing edit and THE REAL REBUILD ROAD (a rewrite, reloadEvents, the fold worker, the swap); 2 late rows of X after: ${res.length} primes, all abandoned, 0 wrong of ${res.length * ASK.length * 2} asks (X, again, a 40-hour interval over X, a sample — and after a re-prime)`, res.filter((x) => x.wrong || x.afterReprime || !(x.r && x.r.abandoned)).slice(0, 3));
  const red = []; for (const t of countTurns.slice(1, 4)) red.push(await run(countBlind, 'drop', t));
  ok(red.some((x) => x.wrong > 0 && x.afterReprime > 0), `RED: the count phase unjudged and the epoch stamped when it ENDS (09ec6e80d / 7ed96a26d) ⇒ a swap at a count turn: ${red.map((x) => `turn ${x.fireAt}: ${x.wrong} wrong, ${x.afterReprime} after a re-prime`).join('; ')} (e.g. $${red.find((x) => x.first)?.first?.[0]} / ${red.find((x) => x.first)?.first?.[1]} served for $${red.find((x) => x.first)?.first?.[2]} / ${red.find((x) => x.first)?.first?.[3]})`, red);
  fs.rmSync(base.data, { recursive: true, force: true });
}
{
  // ROUND 3, SMALLER — a stand-down is SAID once (the journal and an event: what, at what size, what the hub does instead) and
  // its census row says «stood down»; the stop path and the slot backfill flush the owed rates; a pinned ask whose load throws
  // while the ledger loads answers master's «partial»
  const said = [], events = [], realWarn = console.warn, realEv = global.__vsEvent;
  console.warn = (m) => said.push(String(m)); global.__vsEvent = (k, v) => events.push(k);
  let hoursBasis = '', darkBasis = '', restarts = null;
  try {
    const w = world(REPO, { seed: 36, rows: 6000, nanRate: 0 });
    w.UA.primeCostsStepped(w.uh, [{ ids: ['sub-a'], intervals: [[NOW - 2 * DAY, NOW - DAY]] }], { syncMaxRows: 1e9, hoursMaxBytes: 5 * w.UA.HOUR_BLOCK_BYTES });
    w.UA.primeCostsStepped(w.uh, [{ ids: ['sub-b'], intervals: [[NOW - 3 * DAY, NOW - 2 * DAY]] }], { syncMaxRows: 1e9, hoursMaxBytes: 5 * w.UA.HOUR_BLOCK_BYTES });
    hoursBasis = (w.uh.cacheCensus().find((x) => x.name === 'usage hour sums') || {}).basis || '';
    w.uh.hostIndexMaxRows = 10; const rows = []; for (let k = 0; k < 24; k++) { const r = w.mkRow(NOW - 3600e3 - k * 20 * 3600e3, { acct: 'sub-' + 'abcd'[k % 4] }); r.host = 'H1'; r.atype = 'subscription'; rows.push(r); } w.append(rows);
    darkBasis = (w.uh.cacheCensus().find((x) => x.name === 'usage dark-host index') || {}).basis || '';
    w.append(Array.from({ length: 4200 }, (_, k) => { const r = w.mkRow(NOW - 3600e3 + k, { acct: 'sub-a', model: 'claude-opus-5-5-n' + k }); delete r.host; r.atype = 'subscription'; return r; }));
    restarts = w.uh._evCache.arr.restarts;
    rmWorld(w);
  } finally { console.warn = realWarn; global.__vsEvent = realEv; }
  const once = (re) => said.filter((m) => re.test(m)).length;
  ok(once(/hour sums stood down/) === 1 && once(/dark-host index stood down/) === 1 && once(/arrival log restarted/) === 1 && restarts === 1
    && events.includes('usage-hours-stood-down') && events.includes('usage-dark-index-stood-down') && events.includes('usage-arrival-log-restarted')
    && /^STOOD DOWN at /.test(hoursBasis) && /^STOOD DOWN at /.test(darkBasis),
    `ROUND 3: every stand-down is SAID once — the hour sums («${(said.find((m) => /hour sums/.test(m)) || '').slice(8, 90)}…»), the dark-host index, the log's names restart — an event each, and the census rows read «${hoursBasis.slice(0, 40)}…» / «${darkBasis.slice(0, 40)}…»`, { said, events, hoursBasis, darkBasis });
  // the owed rates: the stop path flushes them, the slot backfill reads after a flush
  const server = read('server.js'), sd = server.slice(server.indexOf('function shutdown'), server.indexOf("process.on('SIGTERM', shutdown)")), bf = read('src/ledger-slot-backfill.js');
  const bi = bf.indexOf('_readJson(ratesFp)');
  const est = read('src/usage-estimator.js');
  ok(/storeWriter\(\)\.dirty\(fp, \{ name: 'usage-rates\.write'/.test(est) && /beginExit|exitFlush/.test(server) && !/flushRatesIn/.test(sd) && bi > 0 && /\n {6}est\.flushRates\(\);/.test(bf) && !/typeof est\.flushRates/.test(bf), 'ROUND 3 ON THE STORE WRITER: rates.json is a store of the writer — the stop path\'s exit flush writes what it owes (no flush of ours); the slot backfill\'s pass ends with its rates on disk (est.flushRates(), no typeof guard)');
  // a pinned ask whose load throws while the ledger is loading answers master's «partial»; a whole ledger's throw stays a throw
  const w = world(REPO, { seed: 42, rows: 2000 }), realLoad = w.uh._loadEvents, realLoading = w.uh.ledgerLoading;
  w.uh._loadEvents = () => { throw new Error('EIO injected'); };
  let loadingAns = null, wholeThrew = false;
  try { w.uh.ledgerLoading = () => ({ bytesLeft: 1 }); loadingAns = w.UA.costBetweenMulti(w.uh, ['sub-a'], NOW - DAY, NOW); } catch (e) { loadingAns = { threw: String(e.message) }; }
  try { w.uh.ledgerLoading = () => null; w.UA.costBetweenMulti(w.uh, ['sub-a'], NOW - DAY, NOW); } catch { wholeThrew = true; }
  w.uh._loadEvents = realLoad; w.uh.ledgerLoading = realLoading; rmWorld(w);
  ok(loadingAns && loadingAns.partial === true && !loadingAns.threw && wholeThrew, `ROUND 3: a pinned ask whose load throws WHILE the ledger loads answers as master — partial (${JSON.stringify(loadingAns && { total: loadingAns.total, partial: loadingAns.partial, threw: loadingAns.threw })}); with the ledger whole it throws, as master`, loadingAns);
}
{
  // SMALLER 1 ON THE STORE WRITER — A REPAIR SEES WHAT THIS PROCESS LEARNED: a relearn's rates are owed to the writer;
  // settleRates (server.js, BEFORE the boot's migrations) puts them on disk; the repair archives and drops the file;
  // reloadRates (AFTER) drops the copy — nothing writes the dropped rates back, the next persist re-reads what is left
  const wR1 = world(REPO, { seed: 33, rows: 2000, pairs: [300, 120, 60, 80] }); // one small world for the pin and its RED (a fresh estimator each; each run starts with no rates.json)
  const r1 = (EM, w = wR1) => {
    const est = new (EM ? EM.UsageEstimator : w.est.constructor)({ anchorsDir: w.adir, usageHistory: w.uh, resolveIdentity: w.est.resolveIdentity, lagS: 20 }), fp = path.join(w.adir, 'rates.json');
    est.ratesFor('email:a@x'); est.flushRates(); fs.rmSync(fp, { force: true }); est.reloadRates();
    est.invalidate('email:a@x'); est.ratesFor('email:a@x'); // a relearn: owed to the writer
    est.settleRates(); // server.js, before the migrations
    const there = fs.existsSync(fp) && !!JSON.parse(fs.readFileSync(fp, 'utf8'))['email:a@x'];
    fs.unlinkSync(fp); // the repair archives and drops it
    est.reloadRates(); // server.js, after the migrations
    est.ratesFor('email:b@x'); est.flushRates(); // another identity's persist
    const after = JSON.parse(fs.readFileSync(fp, 'utf8'));
    return { there, back: !!after['email:a@x'], other: !!after['email:b@x'] };
  };
  const rr = r1(null);
  // the census: every src site that reads rates.json to archive and drop it is a function the boot's migrations call, and
  // server.js settles the rates before them and reloads them after
  const sites = [];
  for (const f of execFileSync('git', ['-C', REPO, 'grep', '-l', "'rates.json'", '--', 'src'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean)) {
    const t = read(f);
    for (const pat of ['_readJson(rates)', '_readJson(ratesFp)']) { let i = -1; while ((i = t.indexOf(pat, i + 1)) >= 0) { const fn = (t.slice(0, i).match(/\nfunction (\w+)\(/g) || []).pop(); sites.push({ f, fn: fn ? fn.replace(/\nfunction |\(/g, '') : null }); } }
  }
  const mig = read('src/server/migrations.js'), srv = read('server.js');
  const roots = { repairAnchors: 'repairReadings', repairAnchorsByWindow: 'repairByWindow', purgeFixtureLedger: 'purgeFixtureLedger', backfillLedgerBySlot: 'backfillLedgerBySlot' };
  const NAMES = [...new Set(Object.keys(roots).concat(Object.values(roots)))]; // ONE git grep for every name (each its own call cost ~0.1 s a name)
  let hits = []; try { hits = execFileSync('git', ['-C', REPO, 'grep', '-n', '-E', `(^|[^A-Za-z0-9_.])(${NAMES.join('|')})\\(`, '--', 'src', 'server.js'], { encoding: 'utf8' }).trim().split('\n'); } catch { }
  const callersOf = (name) => hits.filter((l) => l && new RegExp(`(^|[^A-Za-z0-9_.])${name}\\(`).test(l.replace(/^[^:]+:\d+:/, '')) && !l.includes(`function ${name}(`) && !/^[^:]+:\d+:\s*(\/\/|\*)/.test(l));
  const called = sites.every((x) => roots[x.fn] && new RegExp(`\\b${roots[x.fn]}\\(`).test(mig)
    && callersOf(roots[x.fn]).every((l) => l.startsWith('src/server/migrations.js:')) // the root: the migrations registry its only caller
    && (roots[x.fn] === x.fn || callersOf(x.fn).every((l) => l.startsWith(x.f + ':')))); // the drop site's own function: called inside its file only
  const wrap = srv.indexOf('usageEstimator.settleRates?.()'), mg = srv.indexOf("require('./src/server/migrations.js').create("), rl = srv.indexOf('usageEstimator.reloadRates?.()');
  ok(rr.there && !rr.back && rr.other && sites.length >= 4 && called && wrap > 0 && wrap < mg && mg < rl, `SMALLER 1 ON THE STORE WRITER: the rates a relearn owed to the writer are on disk after settleRates (${rr.there}); the repair drops the file; after reloadRates another identity's persist writes ${rr.back ? 'the DROPPED rates back' : 'nothing dropped back'}; ${sites.length} drop sites (${sites.map((x) => x.fn).join(', ')}), each reached only from the boot's migrations, which server.js runs between settleRates and reloadRates`, { rr, sites });
  {
    // RED: a reload that keeps the copy read before the migration — the dropped rates come back at the next persist
    const M = mutantCopies('usage-ledger-walk-r2w', REPO), src = read('src/usage-estimator.js');
    const from = '  reloadRates() { this._seeded = false; this._ratesAll = null;';
    const EM = src.includes(from) ? require(M.write('src/usage-estimator.js', src.replace(from, '  reloadRates() { this._seeded = false;'), 'reload-keeps')) : null;
    const R = EM ? r1(EM) : null;
    ok(!!R && R.back, `RED: a reload that keeps the copy ⇒ the dropped identity is written back (${R && R.back})`, R);
  }
  rmWorld(wR1);
}
{
  // SMALLER 2 — THE LOG READ BY ITS COLUMNS: 50 fixed-end slots, ONE late row among 1 501 arrivals — a row is built only for an
  // arrival of the slot's own keys inside its span (was one object per arrival per slot)
  const w = world(REPO, { seed: 34, rows: 12000, nanRate: 0 }), end = NOW - 60e3, keys = ['sub-a', 'sub-b', 'sub-c', 'sub-d'], set = [];
  for (let k = 0; k < 50; k++) set.push([[keys[k % 4]], end - 15 * DAY - k * 1000]);
  for (const [ids, f] of set) w.UA.costBetweenMulti(w.uh, ids, f, end);
  const late = w.mkRow(end - 30e3, { acct: 'sub-a' }), after = [];
  for (let j = 0; j < 1500; j++) after.push(w.mkRow(end + 1000 + j, { acct: keys[j % 4] }));
  for (const r of [late, ...after]) { delete r.host; r.atype = 'subscription'; }
  w.append([late, ...after]);
  let built = 0, reads = 0; const real = w.uh.arrivalsFor.bind(w.uh); w.uh.arrivalsFor = (...a) => { reads++; const r = real(...a); if (r) built += r.length; return r; };
  let wrong = 0; for (const [ids, f] of set) { const g = w.UA.costBetweenMulti(w.uh, ids, f, end), t = masterWalk(w.uh, ids, f, end); if (!near(g, t) || g.requests !== t.requests) wrong++; }
  const own = set.filter(([ids]) => ids[0] === 'sub-a').length;
  ok(wrong === 0 && reads === set.length && built === own, `SMALLER 2: 50 slots read the log past 1 501 arrivals (one late row): ${built} rows built — one for each of the ${own} slots of the late row's account, none for an arrival of another key or outside the span (09ec6e80d: one object per arrival per slot, 75 050) — every answer the walk's`, { wrong, reads, built, own });
  rmWorld(w);
}
{
  // SMALLER 3 — EVERY INDEX HAS ITS CEILING, and what happens at it is the walk
  // the hour sums: past the ceiling they are not installed, a long interval walks, and this ledger builds none again
  const w = world(REPO, { seed: 36, rows: 6000, nanRate: 0 });
  w.UA.primeCostsStepped(w.uh, [{ ids: ['sub-a'], intervals: [[NOW - 2 * DAY, NOW - DAY]] }], { syncMaxRows: 1e9, hoursMaxBytes: 5 * w.UA.HOUR_BLOCK_BYTES });
  const c = w.uh._evCache, a0 = NOW - 30 * DAY + 777, b0 = NOW - 3 * DAY;
  w.zero(); const g = w.UA.costBetweenMulti(w.uh, ['sub-c'], a0, b0), walked = w.visits(), t = masterWalk(w.uh, ['sub-c'], a0, b0);
  w.UA.primeCostsStepped(w.uh, [{ ids: ['sub-b'], intervals: [[NOW - 3 * DAY, NOW - 2 * DAY]] }], { syncMaxRows: 1e9, hoursMaxBytes: 5 * w.UA.HOUR_BLOCK_BYTES });
  ok(!c.hours && !!c.hoursOver && c.hoursOver.blocks === 5 && near(g, t) && g.requests === t.requests && walked > 100, `SMALLER 3: the hour sums past their ceiling (here 5 blocks) are not installed — a 27-day gap walks (${walked} rows), the walk's money ($${g.total}) — and the ledger builds none again (the next prime: ${c.hours ? 'BUILT' : 'none'})`, { hours: !!c.hours, over: c.hoursOver, walked });
  // the dark-host index: kept 8 days behind the last ask; an ask before its floor walks; every answer the walk's
  const walkSet = (since, to) => { const s = new Set(); for (const ev of w.uh._events(since, to)) if (ev.host === 'H1' && ev.acct && ev.atype !== 'host') s.add(ev.acct); return [...s].sort().join(','); };
  const idx = (since, to) => { const r = w.uh.hostAccountsIn(['H1'], since, to); return { s: [...r.accts].sort().join(','), walked: !!r.walked }; };
  const t1 = NOW - 20 * DAY, q1 = idx(t1 - 7 * DAY, t1), floor = c.hostAcctFloor;
  let held = 0, below = 0; for (const byA of (c.hostAcct || new Map()).values()) for (const l of byA.values()) { held += l.ts.length; below += l.ts.filter((x) => x < floor).length; }
  const qs = [[t1 - 7 * DAY, t1, q1], [NOW - 7 * DAY, NOW, idx(NOW - 7 * DAY, NOW)], [t1 - 12 * DAY, t1 - 5 * DAY, idx(t1 - 12 * DAY, t1 - 5 * DAY)]];
  const late = w.mkRow(t1 - 9 * DAY, { acct: 'sub-c' }); late.host = 'H1'; late.atype = 'subscription'; const v0 = w.uh.hostAccountsVersion(); w.append([late]);
  ok(floor === t1 - 8 * DAY && below === 0 && held > 0 && qs.every(([a, b, q]) => q.s === walkSet(a, b)) && qs[2][2].walked && !qs[1][2].walked && w.uh.hostAccountsVersion() !== v0,
    `SMALLER 3: the dark-host index keeps 8 days behind its last ask (floor = that ask's since − 1 day; ${held} rows held, 0 below it); an ask from the index and an ask before its floor (walked) both equal the walk; a resolved row older than the floor is not held and still moves the version`, { floor, below, held, qs: qs.map(([a, b, q]) => [q.s, walkSet(a, b), q.walked]) });
  rmWorld(w);
}
{
  // the dark-host index's ROW CEILING (no host need go dark): past it the index keeps the 8 days behind its newest row; if those
  // alone pass it, it stands down — every ask then walks; every answer the walk's
  const scene = (max) => {
    const w = world(REPO, { seed: 39, rows: 4000 }), c = w.uh._evCache; w.uh.hostIndexMaxRows = max;
    const rows = []; for (let k = 0; k < 24; k++) { const r = w.mkRow(NOW - 3600e3 - k * 20 * 3600e3, { acct: 'sub-' + 'abcd'[k % 4] }); r.host = 'H1'; r.atype = 'subscription'; rows.push(r); }
    w.append(rows);
    let held = 0; for (const byA of c.hostAcct.values()) for (const l of byA.values()) held += l.ts.length;
    const walkSet = (since, to) => { const s = new Set(); for (const ev of w.uh._events(since, to)) if (ev.host === 'H1' && ev.acct && ev.atype !== 'host') s.add(ev.acct); return [...s].sort().join(','); };
    const eq = [[NOW - 7 * DAY, NOW], [NOW - 15 * DAY, NOW - 8 * DAY]].every(([a, b]) => [...w.uh.hostAccountsIn(['H1'], a, b).accts].sort().join(',') === walkSet(a, b));
    const out = { held, floor: c.hostAcctFloor, eq, newest: c.hostAcctNewest };
    rmWorld(w); return out;
  };
  const kept = scene(80), down = scene(10);
  ok(kept.held <= 80 && kept.floor === Math.min(kept.newest, Date.now()) - 8 * DAY && kept.eq && down.held === 0 && down.floor === Infinity && down.eq,
    `SMALLER 3: the dark-host index's ROW CEILING — past it (here 80) it keeps the 8 days behind its newest row (${kept.held} rows held); a ceiling the 8 days alone pass (here 10) stands it down (0 held, every ask walks) — every answer the walk's`, { kept, down });
}
{
  // the interned names: a table at its ceiling RESTARTS the log — a mark before the restart is no longer held (the slot walks)
  const w = world(REPO, { seed: 35, rows: 3000, nanRate: 0 }), a0 = NOW - DAY;
  w.append(Array.from({ length: 1100 }, (_, k) => { const r = w.mkRow(a0 + 60e3 + k * 60e3, { acct: 'sub-a' }); delete r.host; r.atype = 'subscription'; return r; })); // the slot's own rows keep the 4× guard out
  w.UA.costBetweenMulti(w.uh, ['sub-a'], a0, NOW);
  w.append(Array.from({ length: 4200 }, (_, k) => { const r = w.mkRow(NOW - 3600e3 + k, { acct: k % 2 ? 'sub-a' : 'sub-b', model: 'claude-opus-5-5-n' + k }); delete r.host; r.atype = 'subscription'; return r; }));
  const L = w.uh._evCache.arr, g = w.UA.costBetweenMulti(w.uh, ['sub-a'], a0, NOW + 1000), t = masterWalk(w.uh, ['sub-a'], a0, NOW + 1000);
  ok(L.restarts === 1 && L.names.model.length < 4096 && w.uh.arrivalsSince(L.start - 1) === null && Array.isArray(w.uh.arrivalsSince(L.start)) && near(g, t) && g.requests === t.requests,
    `SMALLER 3: 4 200 new model names ⇒ the log RESTARTED once at the 4 096-name ceiling (start = sequence ${L.start}); a mark before it is refused (the slot walks: $${g.total} / ${g.requests} = the walk's)`, { restarts: L.restarts, names: L.names.model.length });
  rmWorld(w);
}
{
  // ROUND 4 — A PRIME'S HOLD IS ITS OWN. Prime #1 runs, its epoch MOVES (a pricing edit / a rebuild's swap), the next look starts
  // prime #2 for the new epoch; #1 reaches its next step, sees it is stale and ends — releasing ITS hold and nothing else. At EVERY
  // turn until #2 lands the ledger says loading, the gate holds, its queued sweep and onWhole have not run, and an ask walks 0 rows.
  // Master (2.369.392) has the gap for #2's WHOLE sweep (one shared hold, released by the stale prime: the verifier measured
  // 100–164 unheld turns); e477efede narrowed it to #2's anchor-file phase — RED below with its hold road put back verbatim.
  const overlap = async (pre, mover, sharedHold) => {
    const w = world(REPO, { seed: 44, rows: 3000, pairs: [300, 100, 60, 100] });
    if (sharedHold) { // e477efede's usage-hold-road, verbatim: ONE object handed to every prime
      w.uh.ledgerLoading = function () { return this._warmLoading() || (this._primeHold ? { priming: true, at: this._primeHold.at, bytesLeft: 0 } : null); };
      w.uh._holdForPrime = function (at = Date.now()) { if (this._primeHold) return this._primeHold; let done; const p = new Promise((r) => { done = r; }); this._primeHold = { at, p, done }; return this._primeHold; };
      w.uh._releasePrime = function (h) { if (h && this._primeHold === h) { this._primeHold = null; try { h.done(); } catch { } } };
      w.uh.whenWarm = function () { return this._waitBigWarm() || (this._primeHold ? this._primeHold.p : null) || Promise.resolve(); };
    }
    const q = []; w.est.primeOpts = { syncMaxRows: 0, sliceMs: 4 * DAY, countStep: 50, holdMaxMs: 600000, say: () => { }, next: (fn) => q.push(fn) };
    const { wholeLedgerGate } = require('../src/usage-estimator.js');
    let onWhole = 0, swept = 0; const gate = wholeLedgerGate({ ledger: w.uh, prime: () => w.est.primeIfCold(), onWhole: () => { onWhole++; } });
    gate.holds(); gate.run(() => { swept++; });
    for (let i = 0; i < pre && q.length; i++) { q.shift()(); await Promise.resolve(); }
    if (mover === 'pricing') w.uh.setPricing({ accounts: { 'sub-a': { discount: 0.3 } } }); else w.uh._swapCache({ ...w.uh._evCache });
    gate.holds(); const p2 = w.est._priming;
    let turns = 0, unheld = 0, gateOpen = 0, early = 0, walked = 0;
    while (q.length && turns < 5000) {
      q.shift()(); turns++; for (let k = 0; k < 4; k++) await Promise.resolve();
      if (p2.done) break;
      if (!w.uh.ledgerLoading()) unheld++;
      if (swept || onWhole) early++;
      if (!gate.holds()) gateOpen++;
      const v0 = w.visits(); w.est.estimateFor('sub-a', null, NOW); walked = Math.max(walked, w.visits() - v0);
    }
    for (let k = 0; k < 30 && !(swept && onWhole); k++) await new Promise((r) => setImmediate(r));
    const res = p2.result, landed = !!(res && !res.abandoned);
    const o = new (w.est.constructor)({ anchorsDir: w.adir, usageHistory: w.uh, resolveIdentity: w.est.resolveIdentity, lagS: 20 }); o._costFn = (ids) => (f, t) => masterWalk(w.uh, ids, f, t); o._primePairs = () => { };
    w.est._estMemo.clear(); const eq = near(w.est.estimateFor('sub-a', null, NOW), o.estimateFor('sub-a', null, NOW));
    rmWorld(w);
    return { pre, mover, newPrime: !!p2, turns, unheld, gateOpen, early, walked, landed, swept, onWhole, eq };
  };
  const fx = [], rd = [];
  for (const pre of [2, 9, 21]) for (const mover of ['pricing', 'rebuild']) fx.push(await overlap(pre, mover, false));
  for (const mover of ['pricing', 'rebuild']) rd.push(await overlap(2, mover, true)); // the RED at the depth the gap lives (#2's anchor files)
  ok(fx.every((x) => x.newPrime && x.turns > 4 && x.unheld === 0 && x.gateOpen === 0 && x.early === 0 && x.walked === 0 && x.landed && x.swept === 1 && x.onWhole >= 1 && x.eq),
    `ROUND 4: A PRIME'S HOLD IS ITS OWN — prime #1 at three depths (its anchor files, its count, its sweep) × an epoch that moves (a pricing edit, a rebuild's swap): prime #2 runs ${fx.map((x) => x.turns).join(' / ')} turns, at EVERY one the ledger says loading, the gate holds, the sweep and onWhole wait (0 / 0 / 0) and an ask walks 0 rows; #2 lands, the sweep runs once, onWhole fires, the estimate is the walk's`, fx.filter((x) => x.unheld || x.gateOpen || x.early || x.walked || !x.landed || !x.eq));
  ok(rd.some((x) => x.unheld > 0 && x.walked > 0), `RED: e477efede's one shared hold (put back verbatim) ⇒ the stale prime's end releases #2's hold — ${rd.map((x) => `${x.mover}@${x.pre}: ${x.unheld} unheld turns, gate open ${x.gateOpen}, an ask walking ${x.walked} rows`).join('; ')}`, rd);
}
{
  // ROUND 4, SMALLER — SAID ONCE AN EPOCH: a loop that keeps stalling drops prime after prime: «slow» and «dropped» are said ONCE
  // per epoch, every drop EMITS usage-prime-dropped, and the next line that is said carries the count of what was not; a throw
  // in an anchor-file step names the step and emits usage-prime-failed. LAND FIRST, RELEASE AFTER: when a hold is released the
  // verdict has landed (no microtask in which neither stands).
  const w = world(REPO, { seed: 45, rows: 2000 }), said = [], events = [], realEv = global.__vsEvent, order = [];
  const realRel = w.uh._releasePrime.bind(w.uh); w.uh._releasePrime = (h) => { order.push(!!(w.est._priming && w.est._priming.done)); return realRel(h); };
  global.__vsEvent = (k, v) => events.push(`${k}:${v}`);
  let calls = 0, free = false; w.est.primeOpts = { syncMaxRows: 0, holdMaxMs: 15, say: (m) => said.push(m), next: (fn) => { if (free || ++calls === 1) setImmediate(fn); } }; // each prime: one step, then nothing (the last: a working scheduler)
  try {
    for (let k = 0; k < 3; k++) { calls = 0; w.est.primeIfCold(); for (let j = 0; j < 200 && w.uh.ledgerLoading(); j++) await new Promise((r) => setTimeout(r, 4)); }
    let n = 0; const realTok = w.uh.pricingToken.bind(w.uh); w.uh.pricingToken = () => { if (++n === 2) { w.uh.pricingToken = realTok; throw new Error('the token threw'); } return realTok(); };
    free = true; w.est.primeIfCold(); for (let j = 0; j < 200 && w.uh.ledgerLoading(); j++) await new Promise((r) => setTimeout(r, 4));
  } finally { global.__vsEvent = realEv; }
  rmWorld(w);
  const n = (re) => said.filter((m) => re.test(m)).length, stop = said.find((m) => /stopped/.test(m)) || '';
  ok(n(/made no step/) === 1 && n(/is slow/) === 1 && events.filter((e) => /^usage-prime-dropped/.test(e)).length === 3 && /the memo epoch's read threw: the token threw/.test(stop) && /not said again since: .*dropped ×2/.test(stop) && events.some((e) => /^usage-prime-failed:the memo epoch's read/.test(e)) && order.length >= 4 && order.every(Boolean),
    `ROUND 4: three primes dropped in one epoch ⇒ «dropped» and «slow» said ONCE, 3 usage-prime-dropped events, and the next line said carries the count («…${stop.slice(stop.indexOf('(not said'))}»); the throw names its step («${(stop.match(/\(([^)]*threw[^)]*)\)/) || [])[1] || '?'}») + usage-prime-failed; every hold released AFTER its verdict landed (${order.length} releases)`, { said, events, order });
}
{
  // THE FIRST LEARN NEVER RUNS ON THE SYNCHRONOUS ROAD (the owner's boot, 2.369.392 16:41Z: 36 conversations restoring, the loop
  // busy, the 30 s bound fired twice and the pair-by-pair walk froze the hub). A prime whose loop turns are STARVED — each turn
  // 10 ms late, the bound scaled to 30 ms — passes its bound, says «slow» once and GOES ON: no turn walks more than a step's
  // rows, the readers answer «still learning» meanwhile, it lands later, a relearn of every identity then reads the memo (0 rows)
  // and every number is the walk's. RED: adbd03b3c's fatal bound ⇒ master's pair-by-pair road.
  const starved = async (UA2) => {
    const w = world(REPO, { seed: 43, rows: 3000, pairs: [400, 100, 60, 100] }), said = [];
    const withUA = (fn) => { const key = require.resolve('../src/usage-anchors.js'), real = require.cache[key]; require.cache[key] = { ...real, exports: UA2 }; try { return fn(); } finally { require.cache[key] = real; } };
    let maxTurn = 0, turns = 0;
    w.est.primeOpts = { syncMaxRows: 0, sliceMs: 4 * DAY, holdMaxMs: 30, say: (m) => said.push(m), next: (fn) => setTimeout(() => { turns++; const v0 = w.visits(); fn(); maxTurn = Math.max(maxTurn, w.visits() - v0); }, 10) };
    withUA(() => w.est.primeIfCold());
    const during = withUA(() => w.est.estimateFor('sub-a', null, NOW));
    for (let k = 0; k < 3000 && w.uh.ledgerLoading(); k++) await new Promise((r) => setTimeout(r, 3));
    const res = w.est._priming && w.est._priming.result;
    let walks = 0; const ev0 = w.uh._events; w.uh._events = function* (f, t) { walks++; yield* ev0.call(this, f, t); };
    let relearnMax = 0, relearnWalks = 0; for (const [key] of w.IDS) { const v0 = w.visits(), k0 = walks; withUA(() => { w.est.invalidate(key); w.est.ratesFor(key); }); relearnMax = Math.max(relearnMax, w.visits() - v0); relearnWalks = Math.max(relearnWalks, walks - k0); }
    w.uh._events = ev0;
    const o = new (w.est.constructor)({ anchorsDir: w.adir, usageHistory: w.uh, resolveIdentity: w.est.resolveIdentity, lagS: 20 }); o._costFn = (ids) => (f, t) => masterWalk(w.uh, ids, f, t); o._primePairs = () => { };
    const ratesEq = w.IDS.every(([key]) => near(withUA(() => w.est.ratesFor(key)), o.ratesFor(key)));
    w.est._estMemo.clear(); const estEq = near(withUA(() => w.est.estimateFor('sub-a', null, NOW)), o.estimateFor('sub-a', null, NOW));
    rmWorld(w);
    return { slow: said.filter((m) => /is slow/.test(m)).length, stopped: said.filter((m) => /stopped|made no step/.test(m)).length, turns, maxTurn, during, res, relearnMax, relearnWalks, ratesEq, estEq };
  };
  const fx = await starved(require('../src/usage-anchors.js')), rd = await starved(boundFatal);
  ok(fx.slow >= 1 && fx.stopped === 0 && fx.during === null && fx.res && !fx.res.abandoned && fx.res.intervals > 0 && fx.turns > 6 && fx.maxTurn <= 600 && fx.relearnMax === 0 && fx.relearnWalks === 0 && fx.ratesEq && fx.estEq,
    `THE FIRST LEARN NEVER RUNS ON THE SYNCHRONOUS ROAD: a starved prime (each turn 10 ms late, the bound 30 ms) said «slow» and went on — ${fx.turns} turns, the longest walked ${fx.maxTurn} rows (a step's), the readers «still learning» meanwhile (no estimate), it landed (${fx.res && fx.res.intervals} intervals); a relearn of every identity then walks ${fx.relearnWalks} intervals / ${fx.relearnMax} rows; rates and estimate the walk's`, fx);
  ok(rd.res && rd.res.abandoned && rd.relearnWalks >= 300, `RED: adbd03b3c's fatal bound (planted) ⇒ the prime ended at 30 ms («stopped»), and ONE relearn walks ${rd.relearnWalks} intervals pair by pair (${rd.relearnMax} rows here; 82 k pairs at the owner's shape) — the road the hotfix exists to remove`, rd);
}
if (BASE) fs.rmSync(BASE, { recursive: true, force: true });
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
