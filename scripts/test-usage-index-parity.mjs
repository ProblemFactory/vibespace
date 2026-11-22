#!/usr/bin/env node
// test-usage-index-parity — RE-POINTED (row B-360d unit 1, lane lg-providers; the design read w0r2kz4cb, laws 2 and 3): THE CELLS
// EQUAL A FRESH FOLD. The shadow usage index (sqlite) is retired; the Usage window answers from the ledger's own cells
// (src/usage-cells.js, usage-history aggregateCells). For every range, filter and pivot, the cells' answer equals the row fold
// (aggregate()) over the same events — counts and distinct conversations exactly, cost to 1e-9 relative (compareAggregates),
// range.from / range.to exactly, every label (an account's and a device's name, type, deleted). In the gate's zone, a
// 45-minute zone (Asia/Kathmandu) and a DST day (America/Los_Angeles, 2026-03-08). The fixture holds a deleted account, a remote
// device named only by its aname, an empty edge slot, a range edge inside a slot, a row with no model, a row with an absent
// count, a codex row, a pool row, a provider-shaped prompt across a long-prompt threshold (gpt-6-astra: 272 000).
// LAW 3: a changed rate reads NO shard byte before the next answer (a read counter on the ledger folder); a new threshold
// inside one cell's prompts reads only that slot's rows. CONTROLS: a cells fold that ignores the straddle prices the wrong side;
// the release's road (no cells) reads the shard bytes. LAW 1's start leg: the retired index's files go at every start, the
// search index's stay (controls: a folder remove, a run-once remove).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratchDir, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { UsageHistory } = require(path.join(REPO, 'src/usage-history.js'));
const M = require(path.join(REPO, 'src/usage-index-model.js'));
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (typeof m !== 'string') throw new TypeError('ok(cond, name)'); if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 600) : '')); } };
const DAY = 864e5, Q = 9e5, T = (y, mo, d, h = 0, mi = 0, s = 0) => Date.UTC(y, mo - 1, d, h, mi, s);
const LIVE = new Set(['sub-alice', 'api-beta']);   // sub-gone is a DELETED account (no resolver row)
function writeLedger(dir) {
  const hist = path.join(dir, 'usage-history'); fs.mkdirSync(hist, { recursive: true });
  const rows = []; let k = 0;
  const ev = (o) => rows.push({ rid: 'req_par_' + (k++), mid: 'msg_par_' + k, be: 'claude', mode: null, host: null, origin: 'main', cw1: 0, tier: 'standard', ...o });
  // three conversations over three months, a request every ~70 s in bursts
  for (let d = 0; d < 70; d += 3) for (let j = 0; j < 9; j++) {
    const ts = T(2026, 1, 5) + d * DAY + j * 70e3 + (d % 7) * 3600e3;
    ev({ ts, sid: 's-a', model: 'claude-opus-5-5', acct: 'sub-alice', atype: 'subscription', aname: 'Alice', cwd: '/w/a', i: 10 + j, o: 200 + j, cw5: 300, cr: 20000 + j * 1000 });
    ev({ ts: ts + 20e3, sid: 's-g', model: 'claude-sonnet-5', acct: 'sub-gone', atype: 'subscription', aname: 'Gone account', cwd: '/w/g', origin: j % 2 ? 'subagent' : 'main', i: 5, o: 50, cw5: 0, cr: 9000 });
    ev({ ts: ts + 40e3, sid: 's-x', model: 'gpt-6-astra', acct: 'api-beta', atype: 'api', aname: 'Beta key', be: 'codex', cwd: '/w/x', i: 100, o: 300, cr: 230000 + j * 9000 });   // codex: no cache-write counts (ABSENT) · prompts across 272 000
  }
  ev({ ts: T(2026, 2, 2, 12, 7), sid: 's-r', model: 'claude-opus-5-5', acct: null, atype: 'host', aname: 'Workstation', host: 'host-ws', cwd: '/r', i: 3, o: 4, cw5: 5, cr: 6 });   // a remote device named only by aname
  ev({ ts: T(2026, 2, 3, 9, 1), sid: 's-n', acct: 'sub-alice', atype: 'subscription', aname: 'Alice', cwd: '/w/n', i: 1, o: 2, cw5: 3, cr: 4 });   // a row with NO model
  ev({ ts: T(2026, 2, 4, 10, 2), sid: 's-p', model: 'claude-fable-5-1', acct: 'sub-alice', pool: 'pool-team', atype: 'subscription', aname: 'Alice', cwd: '/w/p', i: 7, o: 8, cw5: 9, cr: 10 });   // a pool row
  ev({ ts: T(2026, 2, 4, 10, 3), sid: 's-p', model: 'claude-fable-5-1', acct: 'sub-alice', pool: 'pool-team', atype: 'subscription', aname: 'Alice renamed', cwd: '/w/p', i: 7, o: 8, cr: 10 });   // a later aname (the label stays the earliest) + an absent cw5
  // ONE CELL ON BOTH SIDES OF A NEW THRESHOLD (round wk8hot1jc's must): one conversation, one slot, whole prompts 3 000 and 20 000
  ev({ ts: T(2026, 2, 6, 14, 1), sid: 's-t', model: 'claude-sonnet-5', acct: 'sub-alice', atype: 'subscription', aname: 'Alice', cwd: '/w/t', i: 100, o: 50, cw5: 0, cr: 2900 });
  ev({ ts: T(2026, 2, 6, 14, 9), sid: 's-t', model: 'claude-sonnet-5', acct: 'sub-alice', atype: 'subscription', aname: 'Alice', cwd: '/w/t', i: 200, o: 60, cw5: 0, cr: 19800 });
  // B-d578 P1-b in the cells: two third-party providers' models with NO price row — counted apart, never $0, labelled «provider»
  // (LAW 3 below gives the second its provider's OWN row: the cells' rate memo keys it by the model id)
  for (let k = 0; k < 6; k++) {
    ev({ ts: T(2026, 2, 10, 9, 1) + k * 400e3, sid: 's-v', model: 'acme-coder-1', acct: 'pv-fixture-acme', atype: 'api', aname: 'Acme', cwd: '/w/v', i: 40 + k, o: 90, cw5: 0, cr: 5000 });
    ev({ ts: T(2026, 2, 10, 9, 2) + k * 400e3, sid: 's-w', model: 'beta-chat-2', acct: 'pv-fixture-beta', atype: 'api', aname: 'Beta provider', cwd: '/w/w', i: 30, o: 70 + k, cw5: 0, cr: 4000 });
  }
  const shards = new Map();
  for (const r of rows) { const m = new Date(r.ts).toISOString().slice(0, 7); (shards.get(m) || shards.set(m, []).get(m)).push(JSON.stringify(r)); }
  for (const [m, lines] of shards) fs.writeFileSync(path.join(hist, `events-${m}.ndjson`), lines.join('\n') + '\n');
  return rows;
}
const labels = (ans) => {
  const out = {};
  for (const dim of ['account', 'host', 'model', 'pool', 'session']) for (const r of (ans.groups[dim] || [])) out[dim + ':' + r.key] = [r.name ?? null, r.type ?? null, r.deleted ?? null, r.be ?? null, r.project ?? null, r.unpricedBy ?? null];
  return out;
};
const sameLabels = (a, b) => { const A = labels(a), B = labels(b), d = []; for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) if (JSON.stringify(A[k]) !== JSON.stringify(B[k])) d.push([k, A[k], B[k]]); return d; };
const PIVOTS = [['day', 'account'], ['day', 'model'], ['session', 'origin'], ['project', 'origin'], ['hour', 'account'], ['weekday', 'model'], ['day', 'pool'], ['account', 'host']];
async function zoneLegs(zone) {
  if (zone) process.env.TZ = zone;
  const dir = scratchDir('uidx-cells-' + (zone || 'gate').toLowerCase().replace(/[^a-z0-9]+/g, '-'));
  const rows = writeLedger(dir);
  const uh = new UsageHistory({ dataDir: dir, homeDir: dir, resolveAccount: (id) => (LIVE.has(id) ? { type: id.startsWith('api') ? 'api' : 'subscription', name: id === 'sub-alice' ? 'Alice' : 'Beta key' } : null) });
  uh._loadEvents();
  const c = uh._evCache;
  ok(!!c.cells && c.cells.n > 0, `[${zone || 'gate zone'}] the load pass built the cells (${c.cells && c.cells.n} cells for ${rows.length} rows)`);
  const QUERIES = {
    'all, 8 pivots': { pivots: PIVOTS },
    'a quarter-hour range': { from: T(2026, 1, 20), to: T(2026, 2, 20) - 1, pivots: PIVOTS },
    'an edge INSIDE a slot (from and to)': { from: T(2026, 1, 20, 0, 7, 13), to: T(2026, 2, 4, 10, 2, 30), pivots: PIVOTS },
    'an EMPTY edge slot': { from: T(2026, 3, 30, 3, 5) },
    'backend codex': { backend: 'codex' },
    'the deleted account only': { accounts: new Set(['sub-gone']) },
    'the remote device': { hostFilter: 'host-ws' },
  };
  for (const [name, q] of Object.entries(QUERIES)) {
    const rowsAns = uh.aggregate(q);
    const cellsAns = await uh.aggregateCells(q);
    const cmp = M.compareAggregates(rowsAns, cellsAns);
    const ld = sameLabels(rowsAns, cellsAns);
    ok(cmp.same && ld.length === 0 && cellsAns.fromCells, `[${zone || 'gate zone'}] ${name}: the cells EQUAL the row fold — ${cmp.checked} numbers, the range, every label (rowSlots ${cellsAns.fromCells && cellsAns.fromCells.rowSlots})`, { diffs: cmp.diffs.slice(0, 3), labels: ld.slice(0, 3) });
  }
  return { uh, dir };
}
// the gate's own zone, a 45-minute zone, a DST day
const gate = await zoneLegs(null);
await zoneLegs('Asia/Kathmandu');
{ process.env.TZ = 'America/Los_Angeles'; const dst = await zoneLegs('America/Los_Angeles'); const q = { from: T(2026, 3, 8, 8), to: T(2026, 3, 9, 8) - 1, pivots: [['hour', 'account']] }; const a = dst.uh.aggregate(q), b = await dst.uh.aggregateCells(q); ok(M.compareAggregates(a, b).same, '[America/Los_Angeles] the DST day (2026-03-08): the local hours equal the row fold'); }
// ── LAW 3: a changed rate reads NO shard byte; a new threshold inside one cell reads only that slot
{
  const { uh, dir } = gate;
  const hist = path.join(dir, 'usage-history');
  const opened = [];
  const o0 = fs.promises.open, s0 = fs.openSync;
  fs.promises.open = (p, ...a) => { if (String(p).startsWith(hist)) opened.push(path.basename(String(p))); return o0.call(fs.promises, p, ...a); };
  fs.openSync = (p, ...a) => { if (String(p).startsWith(hist)) opened.push(path.basename(String(p))); return s0.call(fs, p, ...a); };
  try {
    uh.setPricing({ tiers: { 'claude-opus-5-5': { input: 7, output: 33, cacheWrite5m: 9, cacheWrite1h: 14, cacheRead: 0.7 } } });
    opened.length = 0;
    const a = await uh.aggregateCells({ pivots: PIVOTS });
    const shardReads = opened.filter((f) => /^events-/.test(f)).length;
    ok(shardReads === 0 && M.compareAggregates(uh.aggregate({ pivots: PIVOTS }), a).same, 'LAW 3: a changed rate (opus 5.5) — the next answer reads NO shard byte and equals a fresh fold under the new table', { shardReads, opened: opened.slice(0, 5) });
    // a NEW threshold between one cell's smallest and largest whole prompt: sonnet 5 at long.above 10 000 — the s-t cell holds
    // 3 000 and 20 000 (one slot): it STRADDLES, so its slot is folded from its rows (the s-g rows, 9 005, all stay below)
    const tier = { input: 1, output: 2, cacheWrite5m: 1.25, cacheWrite1h: 2, cacheRead: 0.1, long: { above: 10000, input: 2, output: 4, cacheWrite5m: 2.5, cacheRead: 0.2 } };
    uh.setPricing({ tiers: { 'claude-sonnet-5': tier } });
    const b = await uh.aggregateCells({ pivots: PIVOTS });
    ok(M.compareAggregates(uh.aggregate({ pivots: PIVOTS }), b).same && b.fromCells.rowSlots > 0, 'LAW 3: a new long-prompt threshold — the answer equals a fresh fold under the new table (a straddling cell priced from its rows, never the wrong side)', b.fromCells);
    { // RED CONTROL (round wk8hot1jc): the straddle return CUT — the straddling cell is priced as ONE class, and the cells differ
      const UHSRC = fs.readFileSync(path.join(REPO, 'src/usage-history.js'), 'utf8');
      const cut = anchored(UHSRC, "    if (pa !== per(last) || la !== cls(pmax)) return null;\n", '', 'the straddle return cut');
      const { UsageHistory: U2 } = mutantCopies('uidx-straddle', REPO).load('src/usage-history.js', cut, 'no-straddle');
      const u2 = new U2({ dataDir: dir, homeDir: dir, resolveAccount: (id) => (LIVE.has(id) ? { type: id.startsWith('api') ? 'api' : 'subscription', name: id === 'sub-alice' ? 'Alice' : 'Beta key' } : null) });
      u2._loadEvents(); u2.setPricing({ tiers: { 'claude-sonnet-5': tier } });
      const c2 = await u2.aggregateCells({ pivots: PIVOTS });
      ok(!M.compareAggregates(u2.aggregate({ pivots: PIVOTS }), c2).same && c2.fromCells.rowSlots === 0, 'CONTROL: with the straddle return cut no slot goes to its rows and the straddling cell is priced as one class — the cells differ from the fresh fold (red)', c2.fromCells);
    }
    // B-d578 P1-b in the cells: a provider's OWN row («Add a price» writes accounts[<pv id>].tiers[<key>]) prices that provider's
    // model; the other provider's model stays unknown — counted apart in both folds, named by its account
    const unk = (x) => (x.groups.model || []).find((r) => r.key === 'acme-coder-1'), own = (x) => (x.groups.model || []).find((r) => r.key === 'beta-chat-2');
    const pre = await uh.aggregateCells({ pivots: PIVOTS }), preRows = uh.aggregate({ pivots: PIVOTS });   // both under the SAME table (before the provider's row)
    uh.setPricing({ accounts: { 'pv-fixture-beta': { tiers: { 'beta-chat': { input: 2, output: 6, cacheWrite5m: 2.5, cacheWrite1h: 4, cacheRead: 0.2 } } } } });
    const pv = await uh.aggregateCells({ pivots: PIVOTS }), pvRows = uh.aggregate({ pivots: PIVOTS });
    ok(unk(pre) && unk(pre).unpricedRequests === 6 && own(pre) && own(pre).unpricedRequests === 6 && own(pre).cost === 0 && pre.totals.unpricedRequests === 12 && M.compareAggregates(preRows, pre).same && sameLabels(preRows, pre).length === 0,
      'P1-b in the cells: two providers\' models with no price row — every request counted APART (12), none priced as $0, each named by its account', { acme: unk(pre), beta: own(pre) && { r: own(pre).unpricedRequests, c: own(pre).cost } });
    ok(M.compareAggregates(pvRows, pv).same && sameLabels(pvRows, pv).length === 0 && !own(pv).unpricedRequests && own(pv).cost > 0 && unk(pv).unpricedRequests === 6 && JSON.stringify(unk(pv).unpricedBy) === '["pv-fixture-acme"]',
      'P1-b in the cells: the provider\'s OWN row prices its model (the rate memo keys the row the model id matched), the other stays unknown — the cells equal the row fold', { diffs: M.compareAggregates(pvRows, pv).diffs.slice(0, 3), beta: own(pv) && own(pv).cost });
  } finally { fs.promises.open = o0; fs.openSync = s0; }
  // THE CELLS ROAD KEEPS THE RELEASE's BOUNDS (round wk8hot1jc (3)): identical asks in flight are ONE fold, the same answer to each;
  // a fold whose every asker went away stops at its next slice (ABORTED); one asker gone of two — the other is answered whole.
  // RED CONTROLS: mutant copies with the flight's lookup cut (four folds) and with the askers' check cut (the gone fold answers).
  {
    console.log('the cells road keeps the release\'s bounds: one fold for identical asks; a fold nobody waits for stops');
    const q = { pivots: PIVOTS };
    const res = (id) => (LIVE.has(id) ? { type: id.startsWith('api') ? 'api' : 'subscription', name: id === 'sub-alice' ? 'Alice' : 'Beta key' } : null);
    const bounds = async (u) => {
      const n0 = u._cellFolds || 0;
      const four = await Promise.all([1, 2, 3, 4].map(() => u.aggregateAsync(q)));
      const n1 = u._cellFolds;
      await Promise.all([u.aggregateAsync({ pivots: PIVOTS, backend: 'claude' }), u.aggregateAsync({ pivots: PIVOTS, backend: 'codex' })]);
      const ac = new AbortController();
      u.cellsHook = async () => { await null; ac.abort(); u.cellsHook = null; };
      const gone = await u.aggregateAsync(q, { signal: ac.signal }).then(() => 'answered', (e) => (e && e.code) || String(e));
      const a1 = new AbortController(), a2 = new AbortController();
      u.cellsHook = async () => { await null; a1.abort(); u.cellsHook = null; };
      const p1 = u.aggregateAsync(q, { signal: a1.signal }), p2 = u.aggregateAsync(q, { signal: a2.signal });
      const [, r2] = await Promise.all([p1.catch((e) => e && e.code), p2.catch((e) => e && e.code)]);
      return { one: n1 - n0, same: four.every((a) => a === four[0]), two: u._cellFolds - n1 - 2 >= 0 ? 2 : u._cellFolds - n1, gone, r2, first: four[0] };
    };
    const got = await bounds(uh);
    ok(got.one === 1 && got.same && M.compareAggregates(uh.aggregate(q), got.first).same, `ONE FOLD: four identical asks in flight are ONE cells fold (${got.one}), the same answer to each, equal to a fresh fold`, { one: got.one, same: got.same });
    ok(got.gone === 'ABORTED' && got.r2 && got.r2.totals && M.compareAggregates(uh.aggregate(q), got.r2).same, `THE ASKER GONE: a fold whose every asker went away stops at its next slice (${got.gone}); one of two gone — the other answered whole`, { gone: got.gone });
    const UHSRC = fs.readFileSync(path.join(REPO, 'src/usage-history.js'), 'utf8'), MU = mutantCopies('uidx-bounds', REPO);
    const noFlight = anchored(UHSRC, "    if (f && f.c === c) { f.job.waiters++; this._onAbort(signal, f.job); }\n    else {", "    {", 'the flight lookup cut');
    const noCheck = anchored(UHSRC, "      if (job && job.waiters <= 0) throw Object.assign(new Error('every asker of this summary went away'), { code: 'ABORTED' });\n", '', 'the askers\' check cut');
    const mk = (src, tag) => { const { UsageHistory: U } = MU.load('src/usage-history.js', src, tag); const u = new U({ dataDir: dir, homeDir: dir, resolveAccount: res }); u._loadEvents(); return u; };
    const g1 = await bounds(mk(noFlight, 'no-flight')), g2 = await bounds(mk(noCheck, 'no-check'));
    ok(g1.one === 4 && g2.gone === 'answered', `CONTROLS: with the flight's lookup cut the four asks are ${g1.one} folds; with the askers' check cut the gone fold ${g2.gone} — each leg above is red for its road`, { one: g1.one, gone: g2.gone });
  }
}
// A PLACE GONE STALE UNDER AN EDGE SLOT (row B-360d unit 1): a shard edited in place inside the ledger's one-second check
// throttle (same length: one row's output count 203 → 903) — the edge slot's cold read VERIFIES its line (the walk's own check:
// the whole line's hash + its instant) and says STALE; the ask goes to the ROW road ONCE, whose walk rebuilds the cache and
// answers what a fresh ledger answers. Never the cells road again on the same place (an unbounded retry), never the edited
// line taken as the kept row. CONTROL: the same place read without the check yields the EDITED row — what the cells fold
// would have mixed into its kept counts silently.
{
  console.log('a place gone stale under an edge slot: verified, then the row road once');
  const { readLineAt, verified } = require(path.join(REPO, 'src/usage-cold-walk.js'));
  const dir = scratchDir('uidx-cells-stale'); writeLedger(dir);
  const uh = new UsageHistory({ dataDir: dir, homeDir: dir, resolveAccount: (id) => (LIVE.has(id) ? { type: 'subscription', name: id } : null) });
  uh._loadEvents();
  const hist = path.join(dir, 'usage-history'), shard = path.join(hist, 'events-2026-01.ndjson');
  const tsEdit = T(2026, 1, 5) + 3 * 70e3, q = { from: T(2026, 1, 5, 0, 3), to: T(2026, 1, 30) - 1 };   // from inside the slot 00:00–00:15 that holds the s-a row at 00:03:30
  const text = fs.readFileSync(shard, 'utf8'), lines = text.split('\n'), at = lines.findIndex((l) => l.includes(`"ts":${tsEdit},`) && l.includes('"sid":"s-a"'));
  const edited = at >= 0 && lines[at].includes('"o":203,') ? lines[at].replace('"o":203,', '"o":903,') : null;
  ok(!!edited && edited.length === lines[at].length, 'the fixture: the edge slot\'s s-a row (output 203) found in the January shard, its edit the same length');
  const plan = uh._coldWalk(q.from, T(2026, 1, 5, 0, 15) - 1), places = [];
  for (const g of plan.groups) for (let j = 0; j < g.off.length; j++) places.push({ fp: path.join(plan.dir, plan.shards[g.sh[j]]), off: g.off[j], ts: g.ts[j], rh: g.rh[j] });
  lines[at] = edited; fs.writeFileSync(shard, lines.join('\n'));
  uh._evCache.checkedAt = Date.now();   // inside the ledger's one-second check throttle: the cache has not seen the edit
  const place = places.find((p) => p.ts === tsEdit);
  const raw = place ? JSON.parse(await readLineAt(place.fp, place.off)) : null;
  let why = null; try { verified(await readLineAt(place.fp, place.off), place.ts, place.rh, 'the place'); } catch (e) { why = e.code; }
  ok(!!raw && raw.o === 903 && why === 'STALE', 'CONTROL: read WITHOUT the check, the place yields the EDITED row (output 903); the walk\'s check says STALE', { o: raw && raw.o, why });
  let cellsCalls = 0; const ac = uh.aggregateCells.bind(uh); uh.aggregateCells = (...a) => { cellsCalls++; return ac(...a); };
  const ans = await Promise.race([uh.aggregateAsync(q), new Promise((r) => setTimeout(() => r('TIMEOUT'), 20000))]);
  const fresh = new UsageHistory({ dataDir: dir, homeDir: dir, resolveAccount: (id) => (LIVE.has(id) ? { type: 'subscription', name: id } : null) });
  fresh._loadEvents();
  const want = fresh.aggregate(q);
  ok(ans !== 'TIMEOUT' && cellsCalls === 1 && M.compareAggregates(want, ans).same && ans.totals.output === want.totals.output,
    `the ask is answered ONCE by the cells road's hand-over to the row road (cells folds ${cellsCalls}), and equals a fresh ledger (the edited count counted, output ${ans && ans.totals && ans.totals.output})`, ans === 'TIMEOUT' ? 'TIMEOUT' : M.compareAggregates(want, ans).diffs.slice(0, 3));
}
// LAW 1 — ONE DERIVED STORE, ITS START LEG: the retired shadow's three files (usage.db, -wal, -shm) leave the hub's index folder
// at EVERY start — the one wired call (src/server/usage-index-retire.js; test-architecture §73 pins its one wiring) — and nothing
// else there is touched: search.db and owner.json stay byte for byte, the folder stays. A rollback's older release re-creates
// usage.db: the next start removes it again. CONTROLS: a copy that removes the FOLDER (search.db lost) and a copy that removes
// ONCE (a run-once migration: the re-created usage.db stays) are each red by the same judge.
{
  console.log('LAW 1 the retired index\'s files go at every start; search.db and owner.json stay');
  const R = require(path.join(REPO, 'src/server/usage-index-retire.js'));
  const { indexDirFor } = require(path.join(REPO, 'src/server/search-index.js'));
  const rootL1 = scratchDir('usage-index-retire'), quiet = { log() { }, warn() { } };
  let runL1 = 0;
  const judgeStarts = async (start) => {
    const base = path.join(rootL1, 'r' + (runL1++)), home = path.join(base, 'home'), data = path.join(base, 'data');
    fs.mkdirSync(data, { recursive: true });
    const dir = indexDirFor(data, home).dir; fs.mkdirSync(dir, { recursive: true });
    const KEEP = { 'search.db': 'the search index', 'owner.json': '{"pid":0}' };
    for (const [f, t] of Object.entries(KEEP)) fs.writeFileSync(path.join(dir, f), t);
    for (const f of R.FILES) fs.writeFileSync(path.join(dir, f), 'the retired index');
    const bad = [];
    const look = (when) => {
      for (const f of R.FILES) if (fs.existsSync(path.join(dir, f))) bad.push(`${when}: ${f} still there`);
      for (const [f, t] of Object.entries(KEEP)) { let got = null; try { got = fs.readFileSync(path.join(dir, f), 'utf8'); } catch { } if (got !== t) bad.push(`${when}: ${f} ${got === null ? 'gone' : 'changed'}`); }
    };
    await start({ dataDir: data, homeDir: home, log: quiet }); look('the first start');
    fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'usage.db'), 'an older release re-created it after a rollback');   // (its folder too)
    await start({ dataDir: data, homeDir: home, log: quiet }); look('the start after a rollback');
    return bad;
  };
  const answers = [];
  const real = await judgeStarts(async (o) => { answers.push(await R.removeRetiredUsageIndex(o)); });
  ok(real.length === 0 && answers.length === 2 && answers[0].removed.join() === R.FILES.join() && answers[1].removed.join() === 'usage.db',
    'LAW 1: the first start removes usage.db / -wal / -shm, a rollback\'s re-created usage.db goes at the next start; search.db and owner.json intact', { real, answers });
  const folder = await judgeStarts(async ({ dataDir, homeDir }) => { await fs.promises.rm(indexDirFor(dataDir, homeDir).dir, { recursive: true, force: true }); });
  let once = false;
  const runOnce = await judgeStarts(async (o) => { if (once) return; once = true; await R.removeRetiredUsageIndex(o); });
  ok(folder.some((b) => /search\.db gone/.test(b)) && runOnce.some((b) => /after a rollback: usage\.db still there/.test(b)),
    'LAW 1 CONTROLS: a copy removing the folder loses search.db; a copy removing once leaves the re-created usage.db — both red by the same judge', { folder, runOnce });
}
console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass} passed)`);
process.exit(fail ? 1 : 0);
