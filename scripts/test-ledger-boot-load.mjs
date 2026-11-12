#!/usr/bin/env node
// THE LEDGER'S FIRST LOAD OFF THE LOOP (lane ledger-boot-load — the owner's boot on 2.369.393: the pool engine's first
// anchor sweep at +20 s → the whole-ledger gate's prime() → the estimator's first count parsed and hashed all 717 MB of
// the ledger in ONE loop turn, 12.2 s). The hub's ledger (server.js: `firstLoadInWorker`) takes its FIRST load in the
// fold worker — the road a reload takes (B-748f: usage-cold-worker.js parses and hashes, _stageBuilt hands the cache over
// a chunk a turn, _swapCache swaps it in) — and until it lands every reader answers from an empty cache that SAYS it is
// loading (ledgerLoading ⇒ {booting}).
//   ① THE FIRST SECOND: every sync reader asked answers «loading» / nothing, and NO line is parsed or hashed on the loop
//      (a meter over _take + cache-bounds idHash, main thread). RED: the flag off — the base road parses every line in
//      the first ask (and 5c77612ef, run by the lane on a copy of that tree)
//   ② THE NUMBERS AFTER THE LOAD = a synchronous load's: the cache byte for byte (hot rows, places, sizes, the whole-line
//      staleness marks hrh + the cold rh, the dedup sets rids / mids, the cold columns), the route's totals, a cost sum
//   ③ ROWS THAT ARRIVE DURING THE LOAD — before the worker read the shard, after it (during the hand-over), a device's
//      batch, a re-emitted line — are in the cache ONCE after the swap; a reader between the append and the swap sees
//      none of them (the empty «loading» cache), never two. RED: a swap that keeps a re-check time (the rows lost)
//   ④ A WORKER THAT FAILS — dies mid-pack, runs out of memory, throws: said ONCE by name; no line read on the loop; the
//      readers still «loading»; an async reader told LOADING (the popup's «still loading», never «not in the ledger
//      yet»); no worker inside the backoff (5 s, then 10 s …); the next ask after it tries once; a waiter asks again by
//      itself when the backoff ends; the try that lands says so. RED: a failure that falls back to a load on the loop
//   ⑤ THE POOL HOLDS while it loads and decides again ONCE when it lands: a wall at +50 ms (holds() — the automatic
//      decision skipped), the load landing at ≥ +400 ms ⇒ onWhole once, after the swap, on the whole ledger; the queued
//      anchor sweep once. RED: a ledger that does not say it is loading (the wall decided on an empty ledger)
//   ⑥ THE WIRING: server.js's ledger is the one with the flag; the migration's own instance (ledger-slot-backfill) keeps
//      its named synchronous load and runs only inside the boot's synchronous step (runLocalMigrations at create, in the
//      listen callback, before the first request is served) — no other caller; the rid-info route + the popup words
//   ⑦ + ⑧ (the failing first load's road — round 2 and the follow-up) live in scripts/test-ledger-boot-fail.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mutantCopies } from './mutant-copy.mjs';
import { scratchDir } from './scratch.mjs';
import { writeBootShape } from './boot-shape.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const acorn = require('acorn');
const { UsageHistory } = require('../src/usage-history.js');
const CB = require('../src/cache-bounds.js');
const EST = require('../src/usage-estimator.js');
const UA = require('../src/usage-anchors.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; if (process.env.VERBOSE) console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const tmp = scratchDir('ledger-boot-load');
process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { } });
const UH_REL = 'src/usage-history.js', uhSrc = fs.readFileSync(path.join(REPO, UH_REL), 'utf8');
const M = mutantCopies('ledger-boot-load', REPO);
const quiet = async (fn) => { const l = console.log, w = console.warn, said = []; console.log = (...a) => said.push(a.join(' ')); console.warn = (...a) => said.push('WARN ' + a.join(' ')); try { return { v: await fn(), said }; } finally { console.log = l; console.warn = w; } };
const turn = () => new Promise((r) => setImmediate(r));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const end = Date.now() + ms; while (!fn()) { if (Date.now() > end) return false; await sleep(5); } return true; };
const NOW = Date.now();

// ── THE MAIN-THREAD METER: a line parsed = a _take (any class: a planted copy's too), a line hashed = cache-bounds idHash
// (the worker is another isolate — its own modules, never counted) ──────────────────────────────────────────────────────
const meter = { take: 0, hash: 0, firstLoads: 0 };
const realHash = CB.idHash; CB.idHash = function (s) { meter.hash++; return realHash(s); };
const metered = new Set();
function meterClass(UH) {
  if (metered.has(UH)) return UH; metered.add(UH);
  const take = UH.prototype._take; UH.prototype._take = function (...a) { meter.take++; return take.apply(this, a); };
  const steps = UH.prototype._loadSteps; UH.prototype._loadSteps = function (...a) { if (!this._evCache) meter.firstLoads++; return steps.apply(this, a); };
  return UH;
}
meterClass(UsageHistory);
const snap = () => ({ ...meter });
const since = (m0) => ({ take: meter.take - m0.take, hash: meter.hash - m0.hash, firstLoads: meter.firstLoads - m0.firstLoads });

// ── fixtures: the real SHAPE (scripts/boot-shape.mjs — the production ledger's months, row size, recency) ────────────
const fx = (() => { const d = path.join(tmp, 'shape'); const r = writeBootShape({ dataDir: d, homeDir: tmp, scale: 0.012, now: NOW, only: 'ledger' }); return { dir: d, rows: r.rows.ledger, bytes: r.bytes }; })();
let copies = 0;
const copyOf = () => { const d = path.join(tmp, 'c' + (++copies)); fs.cpSync(fx.dir, d, { recursive: true }); return d; };
const ledgerDir = (d) => path.join(d, 'usage-history');
const shards = (d) => fs.readdirSync(ledgerDir(d)).filter((f) => /^events-\d{4}-\d{2}\.ndjson$/.test(f)).sort();
const lines = (d) => shards(d).flatMap((f) => fs.readFileSync(path.join(ledgerDir(d), f), 'utf8').split('\n').filter(Boolean));
const allLines = lines(fx.dir), aRow = JSON.parse(allLines[Math.floor(allLines.length / 2)]), oldRow = JSON.parse(allLines[3]);
const hub = (UH, d, extra = {}) => Object.assign(new (meterClass(UH))({ dataDir: d, homeDir: tmp, firstLoadInWorker: true }), extra);
const base = (UH, d) => new (meterClass(UH))({ dataDir: d, homeDir: tmp });
const rowsOf = (u) => [...u._events(null, null)];
/** A worker file for the rebuild seam (rebuildWorkerFile): `pre` runs first in the worker, then the real worker. */
let stubs = 0;
const stub = (pre) => { const f = path.join(tmp, `worker-${++stubs}.cjs`); fs.writeFileSync(f, `'use strict';\nconst { UsageHistory } = require(${JSON.stringify(path.join(REPO, 'src/usage-history.js'))});\n${pre}\nrequire(${JSON.stringify(path.join(REPO, 'src/usage-cold-worker.js'))});\n`); return f; };
const SLOW = (ms) => stub(`Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ${ms}); // the worker starts ${ms} ms late (a slow disk)`);
/** THE HOT WINDOW + THE COLD COLUMNS, hashed (test-ledger-rebuild's digest): every hot row (its JSON, place, size, line
 *  hash), the ids, the watermarks, the cutoff, the shards' places + append proofs, every cold column and id index. */
function digest(c) {
  const h = crypto.createHash('sha256'), put = (x) => h.update(typeof x === 'string' ? x : JSON.stringify(x));
  for (const e of c.events) put(JSON.stringify(e) + '\n');
  put([c.sizes, c.locs.map(String), c.hrh.map(String), [...c.rids], [...c.mids], [...c.srcWm], String(c.cutoff), c.shards, [...c.consumed], c.hotBytes]);
  put([...c.marks].map(([f, m]) => [f, m.ino, m.mtimeMs, Buffer.from(m.probe).toString('hex')]));
  const s = c.cold; s.settle(); put([s.n, s.names.map((t) => t.vals)]);
  for (const a of [s.ts, s.rh, s.sh, s.off, ...s.tok, ...s.nm]) h.update(Buffer.from(a.buffer, a.byteOffset, s.n * a.BYTES_PER_ELEMENT));
  for (const k of Object.keys(s.idx)) { const x = s.idx[k]; x.settle(); put(k); h.update(Buffer.from(x.keys.buffer, x.keys.byteOffset, x.keys.byteLength)); h.update(Buffer.from(x.vals.buffer, x.vals.byteOffset, x.vals.byteLength)); }
  return h.digest('hex').slice(0, 16);
}
/** The synchronous load of the same files at the worker-built cache's cutoff (Date.now pinned): the reference. */
function syncAt(d, cutoff, windowMs) { const u = base(UsageHistory, d); const real = Date.now; Date.now = () => cutoff + windowMs; try { u.warm(); } finally { Date.now = real; } return u; }
const markHash = (c) => { const s = c.cold; return crypto.createHash('sha256').update(c.hrh.map(String).join(',')).update(Buffer.from(s.rh.buffer, s.rh.byteOffset, s.n * s.rh.BYTES_PER_ELEMENT)).digest('hex').slice(0, 12); };
const idSet = (set) => crypto.createHash('sha256').update([...set].sort().join('\n')).digest('hex').slice(0, 12);

console.log(`fixture: a real-shape ledger, ${fx.rows} rows, ${(fx.bytes / 1e6).toFixed(1)} MB, ${shards(fx.dir).length} months`);

// ── ① THE FIRST SECOND ───────────────────────────────────────────────────────────────────────────────────────────────
console.log('① the first second: every sync reader answers «loading», no line parsed or hashed on the loop');
async function firstSecond(UH, flag) {
  const d = copyOf(), u = flag ? hub(UH, d) : base(UH, d), m0 = snap(), t0 = Date.now(), a = {};
  a.loading = u.ledgerLoading();
  a.rows = rowsOf(u).length;
  a.count = u._evCountUpTo(Infinity);
  const has = (m) => typeof u[m] === 'function'; // an older tree (the RED on 5c77612ef) lacks some readers: each one it has is asked
  a.knows = has('ledgerKnowsId') ? u.ledgerKnowsId(aRow.rid) : false;
  a.wm = has('sourceWatermarks') ? Object.keys(u.sourceWatermarks() || {}).length : 0;
  a.hosts = has('hostAccountsIn') ? [...u.hostAccountsIn([aRow.host || 'host-x'], NOW - 7 * 864e5, NOW).accts].length : 0;
  a.cost = UA.costBetweenMulti(u, [aRow.acct || null], NOW - 30 * 864e5, NOW);
  a.loadingAfter = u.ledgerLoading();
  a.ms = Date.now() - t0; a.meter = since(m0);
  const { said } = await quiet(() => (typeof u.bootLoadSettled === 'function' ? u.bootLoadSettled() : Promise.resolve()));
  a.after = { count: u._evCountUpTo(Infinity), loading: u.ledgerLoading(), said };
  return a;
}
{
  const a = await firstSecond(UsageHistory, true), bytes = shards(fx.dir).reduce((t, f) => t + fs.statSync(path.join(ledgerDir(fx.dir), f)).size, 0);
  ok(a.loading && a.loading.booting === true && a.loading.bytesLeft === bytes && a.loadingAfter && a.loadingAfter.booting, `① ledgerLoading() before any other ask: ${JSON.stringify(a.loading)} — the bytes left = the ledger's ${bytes}`);
  ok(a.rows === 0 && a.count === 0 && a.knows === false && a.wm === 0 && a.hosts === 0, `① the readers answer from the empty «loading» cache: rows ${a.rows}, count ${a.count}, knows ${a.knows}, watermarks ${a.wm}, host accounts ${a.hosts}`);
  ok(a.cost && a.cost.partial === true, `① a cost sum says partial (never a final 0): ${JSON.stringify(a.cost).slice(0, 160)}`);
  ok(a.meter.take === 0 && a.meter.hash === 0 && a.meter.firstLoads === 0, `① NO line parsed (${a.meter.take}) or hashed (${a.meter.hash}) on the loop, no load pass (${a.meter.firstLoads}), all asked in ${a.ms} ms`);
  ok(a.after.count === fx.rows && a.after.loading === null && a.after.said.some((l) => /the ledger's first load ran in the fold worker: \d+ rows read and hashed in [\d.]+ s off the loop, handed over in [\d.]+ s \(\d+ chunks, one a turn\)/.test(l)), `① then the worker's load lands: ${a.after.count} rows, loading ${JSON.stringify(a.after.loading)}; «${a.after.said.find((l) => /first load/.test(l)) || 'NO LINE'}»`);
  const R = await firstSecond(UsageHistory, false);
  ok(R.meter.take === fx.rows && R.meter.hash >= fx.rows && R.loading === null && R.count === fx.rows, `control (the flag off — the base road): the first ask parsed ${R.meter.take} lines and hashed ${R.meter.hash} on the loop, not loading ⇒ RED`);
}

// ── ② THE NUMBERS AFTER THE LOAD ─────────────────────────────────────────────────────────────────────────────────────
console.log('② the numbers after the load = a synchronous load\'s');
{
  const d = copyOf(), u = hub(UsageHistory, d);
  rowsOf(u);
  await quiet(() => u.bootLoadSettled());
  const c = u._evCache, ref = syncAt(d, c.cutoff, u._ledgerWindowMs()), r = ref._evCache;
  ok(c.whole && !c.booting && digest(c) === digest(r) && c.events.length + c.cold.n === fx.rows && c.cold.n > 1000 && c.events.length > 1000, `② byte for byte the synchronous load: ${digest(c)} = ${digest(r)} (hot ${c.events.length} + cold ${c.cold.n} = ${fx.rows})`);
  ok(markHash(c) === markHash(r) && c.hrh.every((x) => Number.isFinite(x)), `② the whole-line staleness marks equal (hot hrh + cold rh: ${markHash(c)} = ${markHash(r)})`);
  ok(c.rids.size === r.rids.size && idSet(c.rids) === idSet(r.rids) && idSet(c.mids) === idSet(r.mids) && c.rids.size > 0, `② the dedup sets equal: ${c.rids.size} rids (${idSet(c.rids)}), ${c.mids.size} mids (${idSet(c.mids)})`);
  const fresh = base(UsageHistory, d); fresh.ledgerWindowMs = u._ledgerWindowMs();
  const t1 = JSON.stringify((await u.aggregateAsync({ to: NOW })).totals), t2 = JSON.stringify(fresh.aggregate({ to: NOW }).totals);
  ok(t1 === t2 && JSON.parse(t1).requests === fx.rows, `② the route's totals = a fresh instance's synchronous fold (${JSON.parse(t1).requests} requests, $${JSON.parse(t1).cost?.toFixed?.(2)})`);
  const acct = aRow.acct || null, s1 = UA.costBetweenMulti(u, [acct], NOW - 30 * 864e5, NOW), s2 = UA.costBetweenMulti(fresh, [acct], NOW - 30 * 864e5, NOW);
  ok(JSON.stringify(s1) === JSON.stringify(s2) && !s1.partial, `② a cost sum equals (${acct}: ${JSON.stringify(s1).slice(0, 120)})`);
  ok(u.ledgerKnowsId(oldRow.rid) && u.ledgerKnowsId(aRow.rid), '② a cold row and a hot row are found by id (the moved indexes)');
}

// ── ③ ROWS THAT ARRIVE DURING THE LOAD ───────────────────────────────────────────────────────────────────────────────
console.log('③ rows that arrive during the load are in the cache once after the swap; a reader between sees none');
const newRow = (rid, extra = {}) => JSON.stringify({ rid, mid: 'msg_' + rid, ts: NOW - 60e3, sid: 'sid-during', be: 'claude', model: 'claude-fable-5-1', acct: null, atype: 'unknown', aname: null, mode: 'chat', cwd: '/srv/work/hub', origin: 'main', i: 11, o: 7, cw5: 0, cw1: 0, cr: 3, ...extra });
const deviceRow = (rid) => JSON.stringify({ rid, ts: NOW - 50e3, sid: 'sid-dev', model: 'claude-opus-5-5', cwd: '/srv/work/app', origin: 'main', i: 13, cw5: 1, cw1: 0, cr: 500, o: 9 });
async function during(UH, tag) {
  const d = copyOf(), u = hub(UH, d, { rebuildWorkerFile: SLOW(300) }), newest = path.join(ledgerDir(d), shards(d).at(-1));
  const between = [];
  const stage = u._stageBuilt.bind(u);
  u._stageBuilt = async (b) => { // the worker has read every shard: these come after its read, before the swap
    fs.appendFileSync(newest, newRow(`req_after_read_${tag}`) + '\n' + allLines[allLines.length - 2] + '\n'); // a new turn + a line re-written (a known rid)
    let r = await u.ingestRemoteEvents('host-d', 'D', deviceRow(`req_dev_${tag}`) + '\n'); // the device re-sends its batch (zero bytes the second time)
    between.push({ rows: rowsOf(u).length, knows: ['req_before_read_', 'req_after_read_', 'h:host-d:req_dev_'].map((p) => u.ledgerKnowsId(p + tag)), loading: !!u.ledgerLoading(), again: r });
    return stage(b);
  };
  const { said } = await quiet(async () => {
    rowsOf(u); // the first ask
    fs.appendFileSync(newest, newRow(`req_before_read_${tag}`) + '\n'); // a turn ends before the worker read the shard
    let r = await u.ingestRemoteEvents('host-d', 'D', deviceRow(`req_dev_${tag}`) + '\n'); // a device's stream lands
    if (r && r.deferred) { await u.ingestIndexSettled?.(); r = await u.ingestRemoteEvents('host-d', 'D', deviceRow(`req_dev_${tag}`) + '\n'); }
    between.unshift({ rows: rowsOf(u).length, knows: ['req_before_read_', 'req_after_read_', 'h:host-d:req_dev_'].map((p) => u.ledgerKnowsId(p + tag)), loading: !!u.ledgerLoading(), first: r });
    await u.bootLoadSettled();
  });
  const rows = rowsOf(u), n = (rid) => rows.filter((e) => e.rid === rid).length;
  return { u, between, said, total: rows.length, n: { before: n(`req_before_read_${tag}`), after: n(`req_after_read_${tag}`), dev: n(`h:host-d:req_dev_${tag}`), rewritten: n(JSON.parse(allLines[allLines.length - 2]).rid) } };
}
{
  const r = await during(UsageHistory, 'a');
  ok(r.between.length === 2 && r.between.every((b) => b.rows === 0 && b.loading && b.knows.every((k) => k === false)), `③ a reader between the append and the swap sees NONE of them (the «loading» cache): ${JSON.stringify(r.between.map((b) => [b.rows, b.knows]))}`);
  ok(r.between[0].first && r.between[0].first.appended === 1 && r.between[1].again && r.between[1].again.appended === 0 && r.between[1].again.duplicates === 1, `③ the device's batch appended once, its re-send costs zero bytes (${JSON.stringify(r.between[0].first)} · ${JSON.stringify(r.between[1].again)})`);
  ok(r.n.before === 1 && r.n.after === 1 && r.n.dev === 1 && r.n.rewritten === 1 && r.total === fx.rows + 3, `③ after the swap each is in the cache ONCE: before the worker's read ${r.n.before}, after it ${r.n.after}, the device's ${r.n.dev}, the re-written line's rid ${r.n.rewritten}; ${r.total} rows = ${fx.rows} + 3`);
  const kept = uhSrc.replace('_swapCache(next) { next.checkedAt = 0;', '_swapCache(next) { next.checkedAt = Date.now();');
  const R = await during(M.load(UH_REL, kept, 'kept').UsageHistory, 'b');
  ok(kept !== uhSrc && R.n.after === 0, `control (a swap that keeps a re-check time): the row appended during the hand-over is in the cache ${R.n.after}× ⇒ RED`);
}

// ── ④ A WORKER THAT FAILS ────────────────────────────────────────────────────────────────────────────────────────────
console.log('④ a worker that fails: said once, retried with a backoff at the next ask, never a load on the loop');
const DIES = {
  'dies mid-pack (exit 9)': { file: () => stub("UsageHistory.prototype._packWhole = function () { this._evCache = null; this._loadEvents(); process.exit(9); };") },
  'runs out of memory mid-pack': { file: () => stub("UsageHistory.prototype._packWhole = function () { this._evCache = null; this._loadEvents(); const hog = []; for (;;) hog.push(new Array(1e5).fill(Math.random())); };"), heapMb: 64 },
  'throws': { file: () => stub("UsageHistory.prototype._packWhole = function () { throw new Error('planted: the shard could not be read'); };") },
};
async function failing(UH, how, { short = false } = {}) {
  const d = copyOf(), D = DIES[how], u = hub(UH, d, { rebuildWorkerFile: D.file(), ...(D.heapMb ? { rebuildWorkerHeapMb: D.heapMb } : {}) });
  const m0 = snap(), w0 = u._rebuildWorkers || 0, events = [], ev0 = global.__vsEvent; global.__vsEvent = (k, v) => events.push([k, v]);
  const o = { how };
  u.scan = () => { }; u.scanSettled = () => Promise.resolve(); // the walker's own scan is not this pin's subject (eventForRid freshens with one; its cursor write queues on the store writer)
  try {
    const { said } = await quiet(async () => {
      rowsOf(u); // try 1
      await until(() => u._boot && !u._boot.job && u._boot.fails === 1, 15000);
      if (short) { await sleep(20); rowsOf(u); return; } // the control: what the failure left on the loop
      o.backoff1 = u._boot.retryAt - Date.now();
      rowsOf(u); u._evCountUpTo(Infinity); u.ledgerKnowsId(aRow.rid); // asks inside the backoff
      await sleep(30); // a worker a wrong ask had started would be spawned by now
      o.inBackoff = { loading: u.ledgerLoading(), rows: rowsOf(u).length, workers: (u._rebuildWorkers || 0) - w0 };
      o.agg = await u.aggregateAsync({ to: NOW }).then(() => null, (e) => e);
      o.rid = await u.eventForRid(aRow.rid).then(() => null, (e) => e);
      u._boot.retryAt = Date.now() - 1; rowsOf(u); // the backoff ended: the next ask tries once
      await until(() => (u._rebuildWorkers || 0) - w0 >= 2, 5000); await sleep(30);
      o.retried = (u._rebuildWorkers || 0) - w0;
      await until(() => u._boot && !u._boot.job && u._boot.fails === 2);
      o.backoff2 = u._boot.retryAt - Date.now();
      u.rebuildWorkerFile = null; u.rebuildWorkerHeapMb = undefined; u._boot.retryAt = Date.now() + 30; // the storage is back
      const waited = u.bootLoadSettled(); // a WAITER (the gate, the boot warm): it asks again when the backoff ends — no other ask
      o.landed = await Promise.race([waited.then(() => true), sleep(15000).then(() => false)]);
    });
    o.said = said; o.warns = said.filter((l) => l.startsWith('WARN')); o.events = events.filter(([k]) => /first-load/.test(k));
    o.meter = since(m0); o.workers = (u._rebuildWorkers || 0) - w0; o.count = u._evCountUpTo(Infinity);
  } finally { global.__vsEvent = ev0; }
  return o;
}
for (const how of Object.keys(DIES)) {
  const r = await failing(UsageHistory, how);
  ok(r.warns.length === 1 && /\[usage\] the ledger's first load in the fold worker failed \((the fold worker exited \(9\)|the fold worker ran out of memory|planted: the shard could not be read)\) — the usage figures say «loading»; it is tried again after 5 s, then doubling to ≤ 2 min — never parsed on the main loop/.test(r.warns[0]) && !/previous|60 s/.test(r.warns[0]) && r.events.length === 1, `④ ${how}: said ONCE by name (${r.warns.length} line, ${r.events.length} event): «${(r.warns[0] || '').slice(0, 200)}»`);
  ok(r.meter.take === 0 && r.meter.hash === 0 && r.meter.firstLoads === 0, `④ ${how}: no line read on the loop through three tries (${r.meter.take} parsed, ${r.meter.hash} hashed, ${r.meter.firstLoads} load passes)`);
  ok(r.inBackoff.loading && r.inBackoff.loading.booting && r.inBackoff.rows === 0 && r.inBackoff.workers === 1 && r.retried === 2, `④ ${how}: inside the backoff the readers say «loading» and start no worker (${r.inBackoff.workers}); the next ask after it tries once (${r.retried} workers)`);
  ok(r.backoff1 > 4500 && r.backoff1 <= 5000 && r.backoff2 > 9500 && r.backoff2 <= 10000, `④ ${how}: the backoff doubles — ${r.backoff1} ms, then ${r.backoff2} ms`);
  ok(r.agg && r.agg.code === 'LOADING' && /the usage ledger is still loading — its first load in the fold worker failed \(.+\); it is tried again at the next ask after \d+ s/.test(r.agg.message) && r.rid && r.rid.code === 'LOADING', `④ ${how}: an async reader is told LOADING (the route says it, the popup says «still loading»): «${r.agg && r.agg.message.slice(0, 160)}»`);
  ok(r.landed && r.workers === 3 && r.count === fx.rows && r.said.some((l) => /first load ran in the fold worker \(try 3; the failure said above\): \d+ rows/.test(l)), `④ ${how}: a waiter asked again by itself when the backoff ended — try 3 landed (${r.count} rows, ${r.workers} workers): «${(r.said.find((l) => /first load ran/.test(l)) || 'NO LINE').slice(0, 140)}»`);
}
{
  const fallback = uhSrc.replace('b.job = null; b.fails++;', 'b.job = null; b.fails++; this.firstLoadInWorker = false; this._rebuildOnLoop();');
  const R = await failing(M.load(UH_REL, fallback, 'fallback').UsageHistory, 'throws', { short: true });
  ok(fallback !== uhSrc && R.meter.take >= fx.rows, `control (a failure that falls back to a load on the loop): ${R.meter.take} lines parsed on the loop ⇒ RED`);
}

// ── ⑤ THE POOL HOLDS, THEN DECIDES ONCE ──────────────────────────────────────────────────────────────────────────────
console.log('⑤ the pool holds while it loads and decides again once when it lands');
async function pool(mutate) {
  const d = copyOf(), u = hub(UsageHistory, d, { rebuildWorkerFile: SLOW(400) });
  if (mutate) mutate(u);
  let swapAt = null; const sw = u._swapCache.bind(u); u._swapCache = (x) => { sw(x); swapAt = Date.now(); };
  const said = [], o = { wholes: 0, sweeps: 0 };
  const gate = EST.wholeLedgerGate({ ledger: u, log: (m) => said.push(m), onWhole: () => { o.wholes++; o.wholeAt = Date.now(); o.wholeRows = u._evCountUpTo(Infinity); o.wholeLoading = u.ledgerLoading(); } });
  const t0 = Date.now();
  o.run = gate.run(() => { o.sweeps++; o.sweptRows = u._evCountUpTo(Infinity); }); // the first anchor sweep (+20 s)
  await sleep(50);
  o.held = [gate.holds(), gate.holds()]; // a conversation hits a wall (+5 s), and another
  o.heldRows = u._evCountUpTo(Infinity);
  await quiet(() => u.bootLoadSettled()); for (let i = 0; i < 5; i++) await turn();
  o.at = { whole: o.wholeAt != null ? o.wholeAt - t0 : null, swap: swapAt != null ? swapAt - t0 : null }; o.said = said;
  return o;
}
{
  const r = await pool();
  ok(r.run === 'waiting' && r.held[0] === true && r.held[1] === true && r.heldRows === 0, `⑤ while it loads the sweep waits (${r.run}) and the automatic decision is held at the wall (${r.held})`);
  ok(r.wholes === 1 && r.at.whole >= 400 && r.at.whole >= r.at.swap && r.wholeRows === fx.rows && r.wholeLoading === null, `⑤ the load lands at +${r.at.swap} ms ⇒ the pools are decided again ONCE (onWhole ×${r.wholes} at +${r.at.whole} ms), on the whole ledger (${r.wholeRows} rows)`);
  ok(r.sweeps === 1 && r.sweptRows === fx.rows && r.said.length === 1 && /ledger still loading \(\d+ MiB left\)/.test(r.said[0]), `⑤ the queued sweep ran once on the whole ledger (${r.sweptRows} rows); said once: «${r.said[0]}»`);
  const R = await pool((u) => { u._warmLoading = () => null; });
  ok(R.held[0] === false && R.heldRows === 0, `control (a ledger that does not say it is loading): the wall is decided on an empty ledger (held ${R.held[0]}, ${R.heldRows} rows) ⇒ RED`);
}

// the hub's own source file — READ by ⑥, never spawned (named by a constant: test-fixture-isolation's census classes a suite whose
// text spawns server.js and writes a transcript — ⑦ / ⑧ write transcripts into their own homes, no server)
const SERVER_SOURCE = 'server.js';
// ── ⑥ THE WIRING ─────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('⑥ the wiring: the hub\'s ledger has the flag; the migration keeps its named synchronous load, before the hub serves');
{
  const server = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');
  const news = [...server.matchAll(/new UsageHistory\(\{([\s\S]*?)\n\}\);/g)];
  ok(news.length === 1 && /firstLoadInWorker: !bootTrace\.syncControl\b/.test(news[0][1]) && /syncControl: env\.VIBESPACE_BOOT_TRACE_SYNC === '1'/.test(fs.readFileSync(path.join(REPO, 'src/server/boot-trace.js'), 'utf8')), `⑥ server.js builds ONE ledger, with the first load in the worker (all but the boot-trace control boot, VIBESPACE_BOOT_TRACE_SYNC=1 — test-boot-loop-hold's RED: the one-tick warm) (${news.length})`);
  const backfill = fs.readFileSync(path.join(REPO, 'src/ledger-slot-backfill.js'), 'utf8');
  ok(/new UsageHistory\(\{ dataDir, homeDir: path\.join\(dataDir, '\.no-home'\) \}\)/.test(backfill) && !/firstLoadInWorker/.test(backfill), "⑥ the migration's own instance (ledger-slot-backfill) keeps the named synchronous load (no flag)");
  // the migrations run INSIDE the listen callback as one of its top-level statements — its synchronous step, before the loop
  // serves the first request — and nothing else in the product calls the registry or the backfill
  const ast = acorn.parse(server, { ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true, allowReturnOutsideFunction: true });
  let listenCb = null;
  (function walk(n) { if (!n || typeof n.type !== 'string' || listenCb) return; if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.property.name === 'listen' && n.callee.object.name === 'hub') { const f = n.arguments.at(-1); if (f && /Function/.test(f.type)) { listenCb = f; return; } } for (const k of Object.keys(n)) { const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') walk(v); } })(ast);
  const top = listenCb ? listenCb.body.body.map((s) => server.slice(s.start, s.end)) : [];
  const at = top.findIndex((s) => /require\('\.\/src\/server\/migrations\.js'\)\.create\(\{[\s\S]*\}\)\.runLocalMigrations\(\)/.test(s));
  ok(listenCb && !listenCb.async && at >= 0 && !top.slice(0, at).some((s) => /\bawait\b/.test(s)), `⑥ the migrations run in the listen callback's synchronous step (statement ${at} of ${top.length}: create(…).runLocalMigrations(), no await before it)`);
  const mig = fs.readFileSync(path.join(REPO, 'src/server/migrations.js'), 'utf8'), rl = mig.slice(mig.indexOf('  function runLocalMigrations('), mig.indexOf('  function runLocalMigrations(') + 2000);
  ok(/const results = runMigrations\(/.test(rl) && /\n {4}return results;\n {2}\}/.test(rl), '⑥ runLocalMigrations is synchronous: the registry\'s results are read and returned in the same call');
  // THE CALLERS, by call expression (acorn: a comment never counts) — the sync road's three names, in all of src/ + server.js
  const NAMES = new Set(['backfillLedgerBySlot', 'runLocalMigrations', 'learnNow']), WANT = { 'server.js runLocalMigrations': 1, 'src/server/migrations.js backfillLedgerBySlot': 1, 'src/ledger-slot-backfill.js learnNow': 1 };
  const files = fs.readdirSync(path.join(REPO, 'src'), { recursive: true }).filter((f) => /\.(c|m)?js$/.test(f)).map((f) => path.join('src', f)).concat([SERVER_SOURCE]);
  const got = {};
  for (const f of files) {
    const text = fs.readFileSync(path.join(REPO, f), 'utf8');
    if (![...NAMES].some((n) => text.includes(n + '('))) continue;
    let tree = null; for (const sourceType of ['script', 'module']) { try { tree = acorn.parse(text, { ecmaVersion: 'latest', sourceType, allowHashBang: true, allowReturnOutsideFunction: true }); break; } catch { } }
    if (!tree) { got[f + ' (unparsed)'] = 1; continue; }
    (function walk(n) { if (!n || typeof n.type !== 'string') return; if (n.type === 'CallExpression') { const c = n.callee, nm = c.type === 'Identifier' ? c.name : c.type === 'MemberExpression' && !c.computed ? c.property.name : null; if (NAMES.has(nm)) got[`${f} ${nm}`] = (got[`${f} ${nm}`] || 0) + 1; } for (const k of Object.keys(n)) { const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object' && k !== 'loc') walk(v); } })(tree);
  }
  ok(JSON.stringify(Object.entries(got).sort()) === JSON.stringify(Object.entries(WANT).sort()), `⑥ the synchronous road has its three calls and no other: ${JSON.stringify(got)}`);
  const routes = fs.readFileSync(path.join(REPO, 'src/server/account-usage-routes.js'), 'utf8'), chat = fs.readFileSync(path.join(REPO, 'src/lib/chat-view.js'), 'utf8');
  const zh = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf8'), ja = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf8');
  ok(/if \(e && e\.code === 'LOADING'\) return res\.json\(\{ found: false, loading: true \}\);/.test(routes) && /\} else if \(r\?\.loading\) \{[\s\S]{0,300}t\('the usage ledger is still loading'\)/.test(chat) && /"the usage ledger is still loading": "/.test(zh) && /"the usage ledger is still loading": "/.test(ja), '⑥ rid-info answers {found:false, loading:true} on LOADING; the popup says «the usage ledger is still loading» (zh, ja), never «not in the ledger yet»');
}

console.log(fail ? `\n✗ ${fail} failed, ${pass} passed` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
