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
const DAY = 86400e3, NOW = 1794300000000;

/** One seeded world over a source tree: a ledger (cold + hot), anchor histories, an estimator. */
function world(TREE, { seed = 3, rows = 12000, pairs = [1500, 300, 120, 400], steps = [15, 30, 60, 20], ages = [0, 0, 0, 0], dataDir = null } = {}) {
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
    if (host) ev.host = host; if (rnd() < 0.01) delete ev.i; return ev; };
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

console.log('§1 EQUALITY — every interval, rate and estimate is 05082bbd0\'s, to the bit');
{
  const w = world(REPO, { seed: 3 });
  const IV = []; for (let k = 0; k < 160; k++) { const a = NOW - Math.floor(w.rnd() * 42 * DAY), len = w.pick([0, 60e3, 15 * 60e3, 3600e3, DAY, 9 * DAY]); IV.push([w.pick([['sub-a'], ['sub-b', '__global__'], ['__global_codex__'], ['sub-c'], [null], ['sub-d', 'sub-a']]), a, a + len]); }
  const check = (tag) => { let bad = 0, first = null; for (const [ids, a, b] of [...IV, ...IV.slice(0, 40)]) { const x = w.UA.costBetweenMulti(w.uh, ids, a, b), y = masterWalk(w.uh, ids, a, b); if (!same(x, y)) { bad++; first = first || { ids, a, b, x, y }; } } return { bad, first }; };
  const growing = () => { let bad = 0; for (let k = 1; k <= 12; k++) { const x = w.UA.costBetweenMulti(w.uh, ['sub-a'], NOW - 3 * DAY, NOW - 3 * DAY + k * 3 * 3600e3), y = masterWalk(w.uh, ['sub-a'], NOW - 3 * DAY, NOW - 3 * DAY + k * 3 * 3600e3); if (!same(x, y)) bad++; } return bad; };
  const r1 = check('seeded');
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
      for (const [f, t] of [[a, a - 3600e3 * (1 + k % 5)], [a, a + DAY], [a, a + 2 * DAY], [a, a - 60e3], [a, a + 3 * DAY]]) { const x = w.UA.costBetweenMulti(w.uh, ids, f, t), y = masterWalk(w.uh, ids, f, t); if (!same(x, y)) { bad++; first = first || { f, t, x, y }; } } }
    ok(bad === 0, 'A1: asks whose START is after their END (a reading newer than the caller\'s now), FOLLOWED by asks from the same start — every answer master\'s; no slot is left by an empty ask', first); }
  ok(r4.bad === 0, 'a REWRITTEN ledger (a shard lost a row — a new generation) — nothing of the old one is served', r4.first);
  // learned rates and estimates through the estimator, against the same estimator over the frozen walk
  const oracle = new (w.est.constructor)({ anchorsDir: w.adir, usageHistory: w.uh, resolveIdentity: w.est.resolveIdentity, lagS: 20 });
  oracle._costFn = (ids) => (f, t) => masterWalk(w.uh, ids, f, t); oracle._primePairs = () => { };
  let rb = 0, eb = 0, firstBad = null;
  for (const [key] of w.IDS) { const a = w.est.ratesFor(key), b = oracle.ratesFor(key); if (!same(a, b)) { rb++; firstBad = firstBad || { key, a, b }; } }
  for (const nowMs of [NOW, NOW + 8000, NOW + 40000]) { w.est._estMemo.clear(); oracle._estMemo.clear(); for (const a of ['sub-a', 'sub-b', 'sub-c', 'sub-d', null]) { const x = w.est.estimateFor(a, null, nowMs), y = oracle.estimateFor(a, null, nowMs); if (!same(x, y)) { eb++; firstBad = firstBad || { a, nowMs, x, y }; } } }
  ok(rb === 0 && eb === 0, `every learned rate (${w.IDS.length} identities) and every estimate (5 accounts × 3 instants) equals the estimator over 05082bbd0's walk`, firstBad);
  { const real = w.uh.ledgerLoading; w.uh.ledgerLoading = () => ({ bytesLeft: 1, at: NOW }); w.est._estMemo.clear(); const e = w.est.estimateFor('sub-a', null, NOW), c = w.UA.costBetweenMulti(w.uh, ['sub-a'], NOW - DAY, NOW); w.uh.ledgerLoading = real;
    ok(e === null && c.partial === true, 'a ledger still LOADING ⇒ no estimate, a partial cost (never memoized)', { e, c }); }
  fs.rmSync(w.data, { recursive: true, force: true });
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
    ok(during === null && partial && !!rDuring && landed && same(after, want) && same(rAfter, rWant), `THE FIRST LEARN STEPPED: while the sweep runs (${w2.est._priming?.result?.intervals} intervals in 2-day slices) no estimate and rates from the frozen costSince (partial, not persisted); once it lands the estimate and the rates are the walk's`, { during, partial, landed, after, want });
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
    const held = { first, holds: gate.holds(), loading: w3.uh.ledgerLoading(), est: w3.est.estimateFor('sub-a', null, NOW), partial: w3.UA.costBetweenMulti(w3.uh, ['sub-a'], NOW - 2 * DAY, NOW).partial === true, ratesWritten: fs.existsSync(ratesFile) };
    for (let k = 0; k < 400 && !ran.length; k++) await new Promise((r) => setImmediate(r));
    const o3 = new (w3.est.constructor)({ anchorsDir: w3.adir, usageHistory: w3.uh, resolveIdentity: w3.est.resolveIdentity, lagS: 20 });
    o3._costFn = (ids) => (f, t) => masterWalk(w3.uh, ids, f, t); o3._primePairs = () => { };
    const after = ran[0], want = { rates: o3.ratesFor('email:a@x'), cost: masterWalk(w3.uh, ['sub-a'], NOW - 3 * DAY, NOW - DAY) };
    ok(held.first === 'waiting' && held.holds && held.loading && held.loading.priming && held.est === null && held.partial && !held.ratesWritten && !!after && same(after.rates, want.rates) && same(after.cost, want.cost) && !w3.uh.ledgerLoading(),
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
      const rates = same(w4.est.ratesFor('email:a@x'), o4.ratesFor('email:a@x'));
      w4.est._estMemo.clear(); o4._estMemo.clear();
      const est = same(w4.est.estimateFor('sub-a', null, NOW), o4.estimateFor('sub-a', null, NOW));
      const cost = same(w4.UA.costBetweenMulti(w4.uh, ['sub-a'], NOW - 3 * DAY, NOW - DAY), masterWalk(w4.uh, ['sub-a'], NOW - 3 * DAY, NOW - DAY));
      const r = { released: !w4.uh.ledgerLoading(), gateNow, queuedRan: ran.includes(1), rates, est, cost, uncaught: uncaught.length, said: said.length, failed: w4.est._priming?.result?.failed || null };
      fs.rmSync(w4.data, { recursive: true, force: true });
      ok(r.released && r.gateNow === 'ran' && r.queuedRan && r.rates && r.est && r.cost && r.uncaught === 0 && r.said === 1 && !!r.failed, `A5 ${name}: the hold released, nothing landed, 0 uncaught, said once («${r.failed}»), the gate runs, rates / estimate / cost are the walk's`, r);
    };
    await scene('a version read that THROWS mid-prime (pricingToken, its third call)', (w4) => { let n = 0; const real = w4.uh.pricingToken.bind(w4.uh); w4.uh.pricingToken = () => { if (++n === 3) { w4.uh.pricingToken = real; throw new Error('pricingToken threw'); } return real(); }; return {}; });
    await scene('a STORE that throws', () => ({ storeHook: () => { throw new Error('the store threw'); } }));
    await scene('steps that NEVER come back (a `next` that stops calling)', () => { let k = 0; return { holdMaxMs: 60, next: (fn) => { if (++k <= 2) setImmediate(fn); } }; });
  }
  // …and the RELEASED code itself, when this clone holds it
  const base = BASE;
  if (!base) { /* SKIP said at the top */ }
  else {
    const dd = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-ulw-arch-')), da = path.join(dd, 'a'), db = path.join(dd, 'b');
    const A = world(base, { seed: 9, dataDir: da }); const B = world(REPO, { seed: 9, dataDir: db });
    let bad = 0, n = 0, first = null;
    const both = (fn) => { const x = fn(A), y = fn(B); n++; if (!same(x, y)) { bad++; first = first || { x, y }; } };
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
  const r = { walks, rows: w.visits() }; fs.rmSync(w.data, { recursive: true, force: true }); return r;
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
  const r = w.visits(); fs.rmSync(w.data, { recursive: true, force: true }); return r;
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
  w.est._liveRing = ring; fs.rmSync(w.data, { recursive: true, force: true });
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
  fs.rmSync(w.data, { recursive: true, force: true });
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
  fs.rmSync(w.data, { recursive: true, force: true });
}

console.log('§4 MUTANTS — each red by name');
{
  const M = mutantCopies('usage-ledger-walk', REPO), src = read('src/usage-anchors.js');
  const plant = (name, from, to) => { if (!src.includes(from)) return null; return require(M.write('src/usage-anchors.js', src.replace(from, to), name)); };
  const withAnchors = (UA2, fn) => { const k = require.resolve('../src/usage-anchors.js'), real = require.cache[k]; require.cache[k] = { ...real, exports: UA2 }; try { return fn(); } finally { require.cache[k] = real; } };
  const relearnWith = (UA2) => withAnchors(UA2, () => relearnRows(2400));
  const asClock = plant('version-by-clock', "const _rowsIn = (usageHistory, fromMs, toV) => usageHistory._evCountUpTo(toV) - usageHistory._evCountUpTo((fromMs || 0) - 1);", "const _rowsIn = (usageHistory, fromMs, toV) => usageHistory._evCountUpTo(toV);");
  const cap = plant('cap-20000', 'const COST_MEMO_MAX = 200000;', 'const COST_MEMO_MAX = 20000;');
  const noExt = plant('no-extension', "        if (!(toV > sl[0]) || _rowsIn(usageHistory, fromMs, sl[0]) !== sl[1]) continue;", "        continue;");
  const blind = plant('blind-version', "const _rowsIn = (usageHistory, fromMs, toV) => usageHistory._evCountUpTo(toV) - usageHistory._evCountUpTo((fromMs || 0) - 1);", "const _rowsIn = () => 0;");
  const noGen = plant('version-ignores-generation', "  if (m.tok !== tok || m.gen !== gen) { m.map.clear();", "  if (m.tok !== tok) { m.map.clear();");
  const landsAnyway = plant('prime-lands-after-a-price-change', "      if (!m || m.epoch !== plan.epoch) { end({ abandoned: true }); return; }", "      if (!m) { end({ abandoned: true }); return; }");
  ok(asClock && cap && noExt && blind && noGen && landsAnyway, 'the six patch sites exist');
  // the generation ignored: a same-count rewrite serves the old ledger's money
  { const w = world(REPO, { seed: 14 });
    const hd = path.join(w.data, 'usage-history'), f = fs.readdirSync(hd).filter((x) => /^events-/.test(x)).sort().pop(), fp = path.join(hd, f), ls = fs.readFileSync(fp, 'utf8').trim().split('\n');
    let k0 = -1, a = 0, b = 0; // a sub-a row whose hour holds no absent count (a NaN would hide the money)
    for (let k = ls.length - 1; k >= 0 && k0 < 0; k--) { const e = JSON.parse(ls[k]); if (e.acct !== 'sub-a' || e.host || !(e.i >= 0)) continue; const t = masterWalk(w.uh, ['sub-a'], e.ts - 1800e3, e.ts + 1800e3); if (Number.isFinite(t.total)) { k0 = k; a = e.ts - 1800e3; b = e.ts + 1800e3; } }
    noGen.costBetweenMulti(w.uh, ['sub-a'], a, b);
    const e0 = JSON.parse(ls[k0]); e0.i += 900000; ls[k0] = JSON.stringify(e0);
    fs.writeFileSync(fp, ls.join('\n') + '\n'); w.uh._rebuildOnLoop();
    const got = noGen.costBetweenMulti(w.uh, ['sub-a'], a, b), truth = masterWalk(w.uh, ['sub-a'], a, b), fixed = w.UA.costBetweenMulti(w.uh, ['sub-a'], a, b);
    ok(k0 >= 0 && !same(got, truth) && same(fixed, truth), `RED: the version ignoring the ledger's generation ⇒ a same-count rewrite (one row's tokens changed in place) serves $${got.total} for $${truth.total} — EQUALITY red (the fix: $${fixed.total})`, { got: got.total, truth: truth.total });
    fs.rmSync(w.data, { recursive: true, force: true }); }
  // a prime landing although the price table moved under it
  { const w = world(REPO, { seed: 15 }); const L = w.est.lines('email:a@x').filter((l) => l.prevFetchedAt), groups = [{ ids: ['sub-a'], intervals: L.map((l) => [l.prevFetchedAt, l.fetchedAt]) }];
    let steps = 0; const done = landsAnyway.primeCostsStepped(w.uh, groups, { syncMaxRows: 0, sliceMs: DAY, next: (fn) => setImmediate(() => { if (++steps === 2) w.uh.setPricing({ tiers: { 'claude-opus-5': { input: 70, output: 330, cacheWrite5m: 80, cacheWrite1h: 120, cacheRead: 7 } } }); fn(); }) });
    await done;
    let bad = 0, worst = null; for (const l of L) { const got = landsAnyway.costBetweenMulti(w.uh, ['sub-a'], l.prevFetchedAt, l.fetchedAt), truth = masterWalk(w.uh, ['sub-a'], l.prevFetchedAt, l.fetchedAt); if (!same(got, truth)) { bad++; worst = worst || { got: got.total, truth: truth.total }; } }
    ok(bad > 0, `RED: a prime that LANDS although the price table moved under it ⇒ ${bad} of ${L.length} pairs served at the old prices (e.g. $${worst && worst.got} for $${worst && worst.truth}) — EQUALITY red`, worst);
    fs.rmSync(w.data, { recursive: true, force: true }); }
  // the clock as the version: a late row anywhere before a pair re-walks it
  { const w = world(REPO, { seed: 8, pairs: [800, 30, 30, 30] }); const ids = ['sub-a'];
    const asks = (UA2) => { const L = w.est.lines('email:a@x').filter((l) => l.prevFetchedAt); for (const l of L) UA2.costBetweenMulti(w.uh, ids, l.prevFetchedAt, l.fetchedAt); w.append([w.mkRow(NOW - 39 * DAY, { acct: 'sub-b' })]); w.zero(); for (const l of L) UA2.costBetweenMulti(w.uh, ids, l.prevFetchedAt, l.fetchedAt); return w.visits(); };
    const fixed = asks(w.UA), mut = asks(asClock);
    ok(fixed === 0 && mut > 1000, `RED: the version back to countUpTo(to) ⇒ a late row of ANOTHER account 39 days back re-walks all 800 pairs (${mut} rows; the interval's own version: ${fixed})`, { fixed, mut });
    fs.rmSync(w.data, { recursive: true, force: true }); }
  // the cap back at 20 000: a working set past it misses
  { const w = world(REPO, { seed: 2, rows: 3000, pairs: [10, 10, 10, 10] }); const cyc = []; for (let k = 0; k < 26000; k++) { const a = NOW - 30 * DAY + k * 60000; cyc.push([a, a + 60000]); }
    const sweep = (UA2) => { for (const [a, b] of cyc) UA2.costBetweenMulti(w.uh, ['sub-c'], a, b); w.zero(); let walks = 0; const rr = w.uh._events; w.uh._events = function* (f, t) { walks++; yield* rr.call(this, f, t); }; for (const [a, b] of cyc) UA2.costBetweenMulti(w.uh, ['sub-c'], a, b); w.uh._events = rr; return walks; };
    const fixed = sweep(w.UA), mut = sweep(cap);
    ok(fixed === 0 && mut > 4000, `RED: the cap back at 20 000 ⇒ a 26 000-interval working set walks ${mut} intervals again on the second pass (200 000 keys: ${fixed})`, { fixed, mut });
    fs.rmSync(w.data, { recursive: true, force: true }); }
  // no forward extension: a `to = now` window walks from its start every time a row arrives
  { const w = world(REPO, { seed: 10 }); const run = (UA2) => { UA2.costBetweenMulti(w.uh, ['sub-a'], NOW - 5 * DAY, NOW); w.append([w.mkRow(NOW + 500, { acct: 'sub-a' })]); w.zero(); UA2.costBetweenMulti(w.uh, ['sub-a'], NOW - 5 * DAY, NOW + 1000); return w.visits(); };
    const fixed = run(w.UA), mut = run(noExt);
    ok(fixed <= 3 && mut > 500, `RED: no forward extension ⇒ one new row makes a 5-day window walk ${mut} rows again (the previous sum + the new rows: ${fixed})`, { fixed, mut });
    fs.rmSync(w.data, { recursive: true, force: true }); }
  // a version blind to the interval's rows: a late row INTO an interval is not walked ⇒ the money differs
  { const w = world(REPO, { seed: 11 }); const a = NOW - 10 * DAY, b = NOW - 9 * DAY;
    blind.costBetweenMulti(w.uh, ['sub-a'], a, b); w.append([w.mkRow(a + 3600e3, { acct: 'sub-a', i: 900000 })]);
    const got = blind.costBetweenMulti(w.uh, ['sub-a'], a, b), truth = masterWalk(w.uh, ['sub-a'], a, b);
    ok(!same(got, truth), `RED: a version blind to the interval's own rows ⇒ a late row INTO it is not walked: $${got.total} served for $${truth.total} — EQUALITY red`, { got: got.total, truth: truth.total });
    fs.rmSync(w.data, { recursive: true, force: true }); }
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
    ['src/usage-anchors.js', "for (const ev of usageHistory._events(a, b === Infinity ? undefined : b))", 'primeCosts / primeCostsStepped — a cold memo\'s first learn (a boot, a pricing edit, a rewritten ledger)', 'once per memo epoch: every anchor pair\'s span ONCE for all identities, in 2-hour slices off the request path (≤ 50 k rows at once)'],
    ['src/server/usage-pool-engine.js', 'for (const ev of usageHistory._events(since, Date.now()))', 'darkTaintedAccounts — every pool decision WHILE a source is dark', 'NAMED DEBT: 7 days of rows per call (measured in the lane report at 3 M rows), only while a host is dark'],
    ['src/usage-history.js', 'for (const ev of this._allRows(opts.from, opts.to)) this._aggRow(st, ev);', 'aggregate (sync) — migrations and suites; the server reads aggregateAsync', 'not on a request path'],
    ['src/usage-history.js', 'for (const ev of this._hotEvents(opts.from, opts.to, this._sortedEvents().slice()))', 'aggregateAsync\'s hot fold — GET /api/usage-stats (the Usage window a person opens)', 'the asked range, handing the loop back every 5 000 rows'],
    ['src/usage-history.js', 'const walk = this._coldWalk(opts.from, opts.to);', 'aggregateAsync\'s cold walk', 'off the loop (the fold worker)'],
    ['src/usage-history.js', 'const evs = this._loadEvents();\n    for (let i = evs.length - 1; i >= 0; i--) if (evs[i].rid === rid) return evs[i];', 'eventForRid — the popup\'s per-message billing lookup (GET /api/usage-event)', 'NAMED DEBT: every hot row on the main thread per lookup (then the cold index by hash)'],
    ['src/usage-history.js', 'const evs = this._loadEvents();\n    const suf = \':\' + mid;', 'eventForMid — the same lookup by message id', 'NAMED DEBT: every hot row on the main thread per lookup'],
    ['src/usage-history.js', 'const evs = this._loadEvents();\n    const c = this._evCache;\n    if (!c.sorted', '_sortedEvents — the hot rows in ts order, for every walk', 'the rows that arrived since the last sort are sorted and appended (merged)'],
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

if (BASE) fs.rmSync(BASE, { recursive: true, force: true });
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
