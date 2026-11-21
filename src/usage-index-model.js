'use strict';
// THE USAGE FOLD MODEL — PURE. Once the shadow usage index's model (design 011 L1); the index RETIRED in row B-360d unit 1
// (the design read w0r2kz4cb, law 1 — the Usage window answers from the ledger's own cells, src/usage-cells.js). What stays is
// the second spelling of aggregate()'s buckets, used as the EQUALITY LEG's independent fold: keysOf (aggregate's keyOf from one
// grouped row), foldAggregate / finalizeBucket / finalizeAggregate (the grouped rows → aggregate's answer), compareAggregates
// (two answers, every bucket and pivot cell), and priceSpec (a table's dated cuts and long-prompt thresholds — what the cells'
// price classes are judged against). No SQL, no database, no worker: imports one PURE module.

const { globalUsageKeyOf } = require('./backend-caps.js'); // PURE → PURE: the machine login's ledger key per harness
const { isThirdPartyAccount } = require('./provider-ids.js'); // PURE → PURE (B-d578 P1-b): aggregate's own test for a provider's record
// The Usage window's dimensions, in usage-history.js aggregate's order.
const DIMS = ['day', 'model', 'account', 'billing', 'project', 'mode', 'host', 'hour', 'weekday', 'session', 'pool', 'origin'];
const FIELDS = ['requests', 'sessions', 'input', 'cacheWrite5m', 'cacheWrite1h', 'cacheRead', 'output', 'cost', 'unpricedRequests', 'unpricedTokens'];
// B-d578 P1-b: the unknown-price part — a bucket carries it only when it has one (absent = 0 on both sides)
const OPTIONAL_FIELDS = new Set(['unpricedRequests', 'unpricedTokens']);

/** aggregate's own pivot filter, verbatim in meaning. */
function validPivots(pivots) {
  return (pivots || []).filter((p) => Array.isArray(p) && p.length === 2 && p[0] !== p[1] && DIMS.includes(p[0]) && DIMS.includes(p[1]));
}

/** The price classes of a pricing object (UsageHistory._pricing: `tiers` + `accounts[*].tiers`): every `earlier`
 *  entry's `until` instant and every `long.above` (a row's own and its earlier entries'), each sorted and once. */
function priceSpec(pricing) {
  const cuts = new Set(), longs = new Set();
  const rowOf = (r) => {
    if (!r || typeof r !== 'object') return;
    if (r.long && Number.isFinite(Number(r.long.above))) longs.add(Number(r.long.above));
    for (const e of Array.isArray(r.earlier) ? r.earlier : []) {
      const t = e && Date.parse(e.until); if (Number.isFinite(t)) cuts.add(t);
      if (e && e.long && Number.isFinite(Number(e.long.above))) longs.add(Number(e.long.above));
    }
  };
  const p = pricing || {};
  for (const r of Object.values(p.tiers || {})) rowOf(r);
  for (const a of Object.values(p.accounts || {})) for (const r of Object.values((a && a.tiers) || {})) rowOf(r);
  const up = (s) => [...s].sort((x, y) => x - y);
  return { priceCuts: up(cuts), priceLongs: up(longs) };
}

/** aggregate's keyOf, from one grouped row (the second spelling — see the header). */
function keysOf(r) {
  return {
    day: r.day,
    model: r.model || 'unknown',
    account: r.acct || globalUsageKeyOf(r.be),
    billing: isThirdPartyAccount(r.acct) ? 'provider' : r.atype === 'api' ? 'api-key' : r.atype === 'subscription' ? 'subscription' : r.atype === 'codex-subscription' ? 'chatgpt' : r.atype === 'host' ? 'remote-host' : (r.acct ? 'unknown-account' : (r.be === 'codex' ? 'codex-cli-login' : 'cli-global-login')),
    project: r.cwd || 'unknown',
    mode: r.mode || 'unknown',
    host: r.host || 'local',
    hour: String(r.hour),
    weekday: String(r.weekday),
    session: String(r.sid), // an object key, as aggregate's buckets are: null → 'null'
    pool: r.pool || null,
    origin: r.origin || 'unknown',
  };
}

// A bucket before pricing: requests + token sums per (model, account, price
// class) cell — the price depends on all three — and the set of sessions it saw.
// A cell keeps ONE of its rows' instant and whole prompt (`ts`, `prompt`): every
// row of the cell resolves to the same rates through them (aggregateSql).
const newBucket = () => ({ cells: new Map(), sids: new Set() });
function addTo(b, r) {
  const ck = JSON.stringify([r.model, r.acct, r.ep || 0, r.lg || 0]);
  let c = b.cells.get(ck);
  if (!c) b.cells.set(ck, (c = { model: r.model, acct: r.acct, ts: r.lo, prompt: r.pmax || 0, n: 0, i: 0, cw5: 0, cw1: 0, cr: 0, o: 0 }));
  c.n += r.n; c.i += r.i || 0; c.cw5 += r.cw5 || 0; c.cw1 += r.cw1 || 0; c.cr += r.cr || 0; c.o += r.o || 0;
  b.sids.add(r.sid);
}
const packBucket = (b) => ({ cells: [...b.cells.values()], sessions: b.sids.size });

/** Fold the grouped pass into the buckets aggregate builds (the pool
 *  dimension skips rows billed through no pool, on a pivot axis too) — the
 *  worker runs it and posts only the packed result. */
function foldAggregate(rows, pivots = null) {
  const pairs = validPivots(pivots);
  const total = newBucket(), dims = Object.fromEntries(DIMS.map((d) => [d, new Map()])), piv = pairs.map(() => new Map());
  let lo = null, hi = null;
  for (const r of rows) {
    addTo(total, r);
    if (lo == null || r.lo < lo) lo = r.lo;
    if (hi == null || r.hi > hi) hi = r.hi;
    const k = keysOf(r);
    for (const d of DIMS) {
      if (d === 'pool' && !k.pool) continue;
      let b = dims[d].get(k[d]);
      if (!b) dims[d].set(k[d], (b = newBucket()));
      addTo(b, r);
    }
    pairs.forEach(([a, z], i) => {
      if ((a === 'pool' && !k.pool) || (z === 'pool' && !k.pool)) return;
      let row = piv[i].get(k[a]);
      if (!row) piv[i].set(k[a], (row = new Map()));
      let b = row.get(k[z]);
      if (!b) row.set(k[z], (b = newBucket()));
      addTo(b, r);
    });
  }
  const groups = {};
  for (const d of DIMS) groups[d] = Object.fromEntries([...dims[d]].map(([key, b]) => [key, packBucket(b)]));
  const pivotOut = {};
  pairs.forEach((p, i) => {
    pivotOut[p.join(':')] = Object.fromEntries([...piv[i]].map(([ka, row]) => [ka, Object.fromEntries([...row].map(([kb, b]) => [kb, packBucket(b)]))]));
  });
  return { range: { from: lo, to: hi }, total: packBucket(total), groups, pivots: pivotOut };
}

/** A packed bucket → aggregate's finalized numbers. costOf({acct, model, ts,
 *  prompt, i, cw5, cw1, cr, o}) is the ledger's own price applied per cell —
 *  `(c) => ledger._cost(c, c.prompt)`: the cell's instant and one request's
 *  whole prompt pick the rates (a cell's summed tokens would cross `long.above`
 *  by themselves); memory sums a price per row, so the costs agree to rounding.
 *  unknownOf(c) (B-d578 P1-b) = the ledger's priceUnknown for the cell's model
 *  and account — a cell is one model of one account, so it is wholly unknown or
 *  not: its requests and tokens are counted apart, as memory's _add counts them. */
function finalizeBucket(b, costOf, unknownOf = null) {
  let requests = 0, input = 0, cacheWrite5m = 0, cacheWrite1h = 0, cacheRead = 0, output = 0, cost = 0, unpricedRequests = 0, unpricedTokens = 0;
  for (const c of b.cells) {
    requests += c.n; input += c.i; cacheWrite5m += c.cw5; cacheWrite1h += c.cw1; cacheRead += c.cr; output += c.o;
    if (unknownOf && unknownOf(c)) { unpricedRequests += c.n; unpricedTokens += c.i + c.cw5 + c.cw1 + c.cr + c.o; }
    else cost += costOf(c);
  }
  const totalInput = input + cacheWrite5m + cacheWrite1h + cacheRead;
  return {
    requests, sessions: b.sessions, input, cacheWrite5m, cacheWrite1h, cacheWrite: cacheWrite5m + cacheWrite1h, cacheRead, output,
    totalInput, totalTokens: totalInput + output, cacheHitRatio: totalInput ? cacheRead / totalInput : 0, cost,
    ...(unpricedRequests ? { unpricedRequests, unpricedTokens } : {}),
  };
}

/** The folded answer → aggregate's shape (totals, range, groups as arrays,
 *  pivots as rows of cells) — the shape compareAggregates reads on both sides. */
function finalizeAggregate(folded, costOf, unknownOf = null) {
  const groups = {};
  for (const d of DIMS) groups[d] = Object.entries(folded.groups[d] || {}).map(([key, b]) => ({ key, ...finalizeBucket(b, costOf, unknownOf) }));
  const pivots = {};
  for (const [pk, rows] of Object.entries(folded.pivots || {})) {
    pivots[pk] = Object.entries(rows).map(([key, cells]) => ({ key, cells: Object.fromEntries(Object.entries(cells).map(([k2, b]) => [k2, finalizeBucket(b, costOf, unknownOf)])) }));
  }
  return { totals: finalizeBucket(folded.total, costOf, unknownOf), range: folded.range, groups, pivots };
}

const sameNum = (f, a, b) => (f === 'cost' ? Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)) : a === b);

/** Compare the memory answer with the index answer: totals, range, every
 *  dimension's key set and numbers, every pivot cell. Costs agree to 1e-9
 *  relative (a price per row summed vs a price per cell); everything else
 *  exactly. Returns {same, checked, diffs: the first `cap` differences}. */
function compareAggregates(mem, idx, { cap = 12 } = {}) {
  const diffs = [];
  let checked = 0;
  const note = (at, m, x) => { if (diffs.length < cap) diffs.push({ at, mem: m, idx: x }); };
  const bucket = (at, m, x) => {
    if (!m || !x) { note(at, m ? 'present' : 'absent', x ? 'present' : 'absent'); return; }
    for (const f of FIELDS) {
      checked++;
      const mv = OPTIONAL_FIELDS.has(f) ? (m[f] ?? 0) : m[f], xv = OPTIONAL_FIELDS.has(f) ? (x[f] ?? 0) : x[f];
      if (!sameNum(f, mv, xv)) note(`${at}.${f}`, mv, xv);
    }
  };
  bucket('totals', mem && mem.totals, idx && idx.totals);
  for (const f of ['from', 'to']) { checked++; if ((mem?.range?.[f] ?? null) !== (idx?.range?.[f] ?? null)) note(`range.${f}`, mem?.range?.[f] ?? null, idx?.range?.[f] ?? null); }
  const byKey = (arr) => new Map((arr || []).map((r) => [String(r.key), r]));
  for (const d of DIMS) {
    const m = byKey(mem?.groups?.[d]), x = byKey(idx?.groups?.[d]);
    for (const k of new Set([...m.keys(), ...x.keys()])) bucket(`groups.${d}[${k}]`, m.get(k), x.get(k));
  }
  for (const pk of new Set([...Object.keys(mem?.pivots || {}), ...Object.keys(idx?.pivots || {})])) {
    const m = byKey(mem?.pivots?.[pk]), x = byKey(idx?.pivots?.[pk]);
    for (const k of new Set([...m.keys(), ...x.keys()])) {
      const mc = m.get(k)?.cells || {}, xc = x.get(k)?.cells || {};
      for (const k2 of new Set([...Object.keys(mc), ...Object.keys(xc)])) bucket(`pivots.${pk}[${k}][${k2}]`, mc[k2], xc[k2]);
    }
  }
  return { same: diffs.length === 0, checked, diffs };
}

module.exports = {
  DIMS, FIELDS, validPivots, priceSpec, keysOf, foldAggregate, finalizeBucket, finalizeAggregate, compareAggregates,
};
