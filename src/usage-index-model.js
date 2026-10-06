'use strict';
// THE USAGE INDEX MODEL (design 011 lane 3, L1 — the SHADOW). What one ledger
// row becomes in the index, whether a shard mark still holds, the ONE grouped
// pass that answers the Usage window's aggregate, the fold of that pass into
// buckets, and the comparison of two answers. PURE — imports nothing: the
// worker (src/usage-index-worker.js, the one file that names node:sqlite)
// runs the SQL and the fold, the owner (src/server/usage-index.js) prices and
// compares, and every rule here is provable without a database.
//
// THE INDEX FEEDS NOTHING in this lane. Its only reader is the comparer: each
// Usage-window aggregate is also asked of the index and the two answers are
// compared here. The memory path (src/usage-history.js aggregate) stays the
// answer; the bucket rules below are a deliberate second spelling of its
// keyOf, and a drift between the two is exactly what a comparison reports.

const { globalUsageKeyOf } = require('./backend-caps.js'); // PURE → PURE: the machine login's ledger key per harness
const SCHEMA_VERSION = 1; // PRAGMA user_version — a database at any other version is deleted and rebuilt
const HEAD_BYTES = 4096;  // a shard's fingerprint covers at most its first 4 KiB
const SHARD_RE = /^events-\d{4}-\d{2}\.ndjson$/; // the ledger's monthly shards (usage-history.js _loadEvents)

const COLS = ['rid', 'base_rid', 'mid', 'ts', 'sid', 'be', 'model', 'effort', 'tier', 'acct', 'acct_key', 'pool', 'atype',
  'aname', 'mode', 'host', 'cwd', 'wcwd', 'origin', 'wf', 'agent', 'slot_rekeyed_by', 'i', 'cw5', 'cw1', 'cr', 'o', 'shard'];

// Survey §2.2's schema. `rid` is the key and INSERT OR IGNORE keeps the FIRST
// row of a rid in ingest order — the order _loadEvents reads the shards in.
// A row without a rid is stored with rid NULL, which a rowid table's PRIMARY
// KEY admits any number of times — exactly as memory keeps every rid-less row.
// `u_shard` is what a shard rebuild deletes by. The survey's `attribution`
// table waits for its first reader (lane 4): a schema change is a version
// bump, and a version bump is a rebuild.
const SCHEMA = [
  'CREATE TABLE usage_event (rid TEXT PRIMARY KEY, base_rid TEXT, mid TEXT, ts INTEGER NOT NULL, sid TEXT, be TEXT, model TEXT, effort TEXT, tier TEXT, '
    + 'acct TEXT, acct_key TEXT NOT NULL, pool TEXT, atype TEXT, aname TEXT, mode TEXT, host TEXT, cwd TEXT, wcwd TEXT, origin TEXT, wf TEXT, agent TEXT, '
    + 'slot_rekeyed_by TEXT, i INTEGER, cw5 INTEGER, cw1 INTEGER, cr INTEGER, o INTEGER, shard TEXT NOT NULL)',
  'CREATE INDEX u_ts ON usage_event(ts)',
  'CREATE INDEX u_acct ON usage_event(acct_key, ts)',
  'CREATE INDEX u_mid ON usage_event(mid) WHERE mid IS NOT NULL',
  'CREATE INDEX u_base ON usage_event(base_rid)',
  'CREATE INDEX u_host ON usage_event(host, ts)',
  'CREATE INDEX u_shard ON usage_event(shard)',
  'CREATE TABLE shard_mark (shard TEXT PRIMARY KEY, size INTEGER, ino INTEGER, head_len INTEGER, head_hash TEXT, offset INTEGER)',
];

const str = (v) => (v == null || v === '' ? null : String(v));
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** One parsed ledger line → the column values in COLS order, or null for a
 *  line memory would not count as an event object. Normalizations keep every
 *  memory semantic: an empty acct is falsy there (no price override, the
 *  global bucket), so it is stored NULL; a missing ts sorts as 0 there. */
function rowOf(ev, shard) {
  if (!ev || typeof ev !== 'object' || Array.isArray(ev)) return null;
  const rid = ev.rid ? String(ev.rid) : null;
  const acct = str(ev.acct);
  const hm = rid && /^h:[^:]*:(.*)$/.exec(rid);
  return [rid, hm ? hm[1] : rid, str(ev.mid), num(ev.ts) || 0, ev.sid == null ? null : String(ev.sid),
    ev.be == null ? null : String(ev.be), ev.model == null ? null : String(ev.model), str(ev.effort), str(ev.tier),
    acct, acct || globalUsageKeyOf(ev.be), str(ev.pool), ev.atype == null ? null : String(ev.atype),
    str(ev.aname), str(ev.mode), str(ev.host), str(ev.cwd), str(ev.wcwd), str(ev.origin), str(ev.wf), str(ev.agent),
    str(ev.slotRekeyedBy), num(ev.i), num(ev.cw5), num(ev.cw1), num(ev.cr), num(ev.o), String(shard)];
}

/** Does the index's mark for a shard still describe the file on disk?
 *  cur = {size, ino, headHash} where headHash covers the first mark.head_len
 *  bytes (the caller hashes what the mark says it hashed). 'append' = read from
 *  mark.offset; 'rebuild' = the shard was rewritten (a repair migration renames
 *  a new file in → a new inode; a shrink; a changed head) — delete its rows and
 *  re-read it whole; 'gone' = the file left; 'same' = nothing to do. */
function shardMarkVerdict(cur, mark) {
  if (!cur) return mark ? 'gone' : 'same';
  if (!mark) return 'rebuild';
  if (Number(cur.ino) !== Number(mark.ino)) return 'rebuild';
  if (cur.size < mark.offset) return 'rebuild';
  if (mark.head_len > 0 && cur.headHash !== mark.head_hash) return 'rebuild';
  return cur.size === mark.offset ? 'same' : 'append';
}

// The Usage window's dimensions, in usage-history.js aggregate's order.
const DIMS = ['day', 'model', 'account', 'billing', 'project', 'mode', 'host', 'hour', 'weekday', 'session', 'pool', 'origin'];
const FIELDS = ['requests', 'sessions', 'input', 'cacheWrite5m', 'cacheWrite1h', 'cacheRead', 'output', 'cost'];

/** aggregate's own pivot filter, verbatim in meaning. */
function validPivots(pivots) {
  return (pivots || []).filter((p) => Array.isArray(p) && p.length === 2 && p[0] !== p[1] && DIMS.includes(p[0]) && DIMS.includes(p[1]));
}

/** THE ONE GROUPED PASS (measured 2026-10-03 on 500 000 rows: ~1 s, against
 *  ~6 s for a GROUP BY per dimension): every matched row grouped by its
 *  session and the raw columns every dimension is derived from, so ONE scan
 *  answers all twelve dimensions, the distinct-session counts and any pivot.
 *  Filters mirror aggregate: `from` / `to` only when truthy (ts ≥ from,
 *  ts ≤ to), backend an exact match, accounts a set of bucket keys (an EMPTY
 *  set matches nothing), the device filter on host-or-'local'. Day is UTC;
 *  hour and weekday are LOCAL time through vs_lhour / vs_lwday, which the
 *  worker defines with the same JS Date calls aggregate makes. */
function aggregateSql({ from = null, to = null, backend = null, accounts = null, hostFilter = null, priceCuts = [], priceLongs = [] } = {}) {
  const where = [], params = [];
  // THE PRICE CLASS (int204: usage-pricing met this lane — memory prices EACH request through priceAt: the dated
  // `earlier` entry its instant falls in, then `long` when its WHOLE prompt is over `above`). `ep` = how many of the
  // pricing's `until` instants the row is at or past, `lg` = how many of its `long.above` thresholds the row's whole
  // prompt exceeds (priceSpec below, from the ledger's pricing at the question). Every row of one group shares both,
  // so any one row's instant (lo) and prompt (pmax) price the whole cell exactly as memory prices each of its rows.
  const cuts = (priceCuts || []).map(Number).filter(Number.isFinite), longs = (priceLongs || []).map(Number).filter(Number.isFinite);
  const PROMPT = '(COALESCE(i, 0) + COALESCE(cr, 0) + COALESCE(cw5, 0) + COALESCE(cw1, 0))';
  const ep = cuts.length ? `(${cuts.map(() => '(ts >= ?)').join(' + ')})` : '0';
  const lg = longs.length ? `(${longs.map(() => `(${PROMPT} > ?)`).join(' + ')})` : '0';
  const selParams = [...cuts, ...longs];
  if (from) { where.push('ts >= ?'); params.push(Number(from)); }
  if (to) { where.push('ts <= ?'); params.push(Number(to)); }
  if (backend) { where.push('be = ?'); params.push(String(backend)); }
  if (accounts) {
    const keys = Array.from(accounts, String);
    if (keys.length) { where.push(`acct_key IN (${keys.map(() => '?').join(',')})`); params.push(...keys); } else where.push('0');
  }
  if (hostFilter) { where.push("COALESCE(NULLIF(host, ''), 'local') = ?"); params.push(String(hostFilter)); }
  const sql = "SELECT sid, model, acct, be, atype, cwd, mode, host, pool, origin, date(ts / 1000, 'unixepoch') AS day, "
    + 'vs_lhour(ts) AS hour, vs_lwday(ts) AS weekday, COUNT(*) AS n, SUM(i) AS i, SUM(cw5) AS cw5, SUM(cw1) AS cw1, '
    + `SUM(cr) AS cr, SUM(o) AS o, MIN(ts) AS lo, MAX(ts) AS hi, ${ep} AS ep, ${lg} AS lg, MAX(${PROMPT}) AS pmax FROM usage_event`
    + (where.length ? ' WHERE ' + where.join(' AND ') : '')
    + ' GROUP BY sid, model, acct, be, atype, cwd, mode, host, pool, origin, day, hour, weekday, ep, lg';
  return { sql, params: [...selParams, ...params] };
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
    billing: r.atype === 'api' ? 'api-key' : r.atype === 'subscription' ? 'subscription' : r.atype === 'codex-subscription' ? 'chatgpt' : r.atype === 'host' ? 'remote-host' : (r.acct ? 'unknown-account' : (r.be === 'codex' ? 'codex-cli-login' : 'cli-global-login')),
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
 *  by themselves); memory sums a price per row, so the costs agree to rounding. */
function finalizeBucket(b, costOf) {
  let requests = 0, input = 0, cacheWrite5m = 0, cacheWrite1h = 0, cacheRead = 0, output = 0, cost = 0;
  for (const c of b.cells) {
    requests += c.n; input += c.i; cacheWrite5m += c.cw5; cacheWrite1h += c.cw1; cacheRead += c.cr; output += c.o;
    cost += costOf(c);
  }
  const totalInput = input + cacheWrite5m + cacheWrite1h + cacheRead;
  return {
    requests, sessions: b.sessions, input, cacheWrite5m, cacheWrite1h, cacheWrite: cacheWrite5m + cacheWrite1h, cacheRead, output,
    totalInput, totalTokens: totalInput + output, cacheHitRatio: totalInput ? cacheRead / totalInput : 0, cost,
  };
}

/** The folded answer → aggregate's shape (totals, range, groups as arrays,
 *  pivots as rows of cells) — the shape compareAggregates reads on both sides. */
function finalizeAggregate(folded, costOf) {
  const groups = {};
  for (const d of DIMS) groups[d] = Object.entries(folded.groups[d] || {}).map(([key, b]) => ({ key, ...finalizeBucket(b, costOf) }));
  const pivots = {};
  for (const [pk, rows] of Object.entries(folded.pivots || {})) {
    pivots[pk] = Object.entries(rows).map(([key, cells]) => ({ key, cells: Object.fromEntries(Object.entries(cells).map(([k2, b]) => [k2, finalizeBucket(b, costOf)])) }));
  }
  return { totals: finalizeBucket(folded.total, costOf), range: folded.range, groups, pivots };
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
    for (const f of FIELDS) { checked++; if (!sameNum(f, m[f], x[f])) note(`${at}.${f}`, m[f], x[f]); }
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
  SCHEMA_VERSION, HEAD_BYTES, SHARD_RE, COLS, SCHEMA, DIMS, FIELDS,
  rowOf, shardMarkVerdict, validPivots, aggregateSql, priceSpec, keysOf, foldAggregate, finalizeBucket, finalizeAggregate, compareAggregates,
};
