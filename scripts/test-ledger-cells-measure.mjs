#!/usr/bin/env node
// test-ledger-cells-measure — A MEASUREMENT (row B-360d unit 1, lane lg-providers; the ruling w0r2kz4cb's MEASURES 1, 2 and 4, sent
// to the coordinator before any product change). An OWNER-SHAPED stand-in (scripts/usage-shape-fixture.mjs SHAPE's distinct
// counts × 3 ≈ 3 M rows; STATED models: a working conversation's next request 5–60 s later p .70, 1–10 min .25, 1–24 h .05; its
// whole prompt grows ~2 000 tokens a request from ~20 000 and compacts at 150–190 k — one in five conversations on a 1 M-context
// model grows to 600 k), on the test machine's DISK (/var/tmp), removed at every exit and signal.
//   1. THE CELL with the ruling's full key (15-min / 1-h UTC slot, sid, model, acct, be, atype, cwd, mode, host, pool, origin, aname,
//      long class vs {200 000, 272 000}): the count; its bytes held (packed columns, and a plain Map of objects); folding 30 days and
//      All with 8 pivots; the largest loop gap (the fold runs on the main thread here, so its time IS the gap).
//   2. cells whose smallest and largest prompt straddle 200 000 / 272 000; rows with an absent token count (codex rows, which report
//      no cache writes); rows that cannot become columns (stuck hot); request ids present in two or more month files (planted).
//   4. memory by structure after a forced collection: before and after the boot worker exited; the ledger's own census; the cost
//      memo after a relearn; after an ingest into three old months.
// Exits 1 BY DESIGN: the test kit returns a red suite's log only (the MEASURE lines are the result). ci.mjs EXCLUDED names it.
import fs from 'node:fs';
import path from 'node:path';
import v8 from 'node:v8';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import './scratch.mjs';
import { SHAPE } from './usage-shape-fixture.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const { TMP_ROOTS, FIXTURE_CWD_PREFIX } = require(path.join(REPO, 'src/fixture-guard.js'));
const { UsageHistory } = require(path.join(REPO, 'src/usage-history.js'));
const { costBetweenMulti, costMemoCensus } = require(path.join(REPO, 'src/usage-anchors.js'));
v8.setFlagsFromString('--expose_gc'); const gc = vm.runInNewContext('gc');
const ROOT = path.join(TMP_ROOTS[1], `${FIXTURE_CWD_PREFIX}ledger-cells-${process.pid}`);
const clean = () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } };
process.on('exit', clean);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { clean(); process.exit(130); });
const MB = 1048576, DAY = 864e5, NOW = Date.now(), SCALE = 3.0e6 / 1.01e6, Q = 9e5, H = 36e5;
const log = (s) => console.log('  ' + s);
const memNow = () => { gc(); gc(); const u = process.memoryUsage(); return { rssMB: Math.round(u.rss / MB), heapMB: Math.round(u.heapUsed / MB), extMB: Math.round(u.external / MB), abMB: Math.round(u.arrayBuffers / MB) }; };
let seed = 20261121; const r = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const zipf = (n) => Math.min(n - 1, Math.floor(n * Math.pow(r(), 2.2)));
const S = SHAPE, nSess = Math.round(S.sessions * SCALE), nOne = Math.round(S.oneRowSessions * SCALE), nMulti = nSess - nOne, perMulti = Math.round((3.0e6 - nOne) / nMulti), START = NOW - 420 * DAY;
const models = Array.from({ length: S.models }, (_, i) => 'model-' + i), projects = Array.from({ length: S.projects }, (_, i) => '/home/u/workspace/p' + i);
const accts = Array.from({ length: S.accounts }, (_, i) => (i === 0 ? null : (i % 5 === 4 ? 'cxs-' : 'sub-') + String(i).padStart(12, '0')));
const hosts = [null, 'host-a', 'host-b', 'host-c'], modes = [null, 'plan', 'acceptEdits'], pools = ['pool-aaaaaaaaaaaa', 'pool-bbbbbbbbbbbb'];
const dataDir = path.join(ROOT, 'data'), hist = path.join(dataDir, 'usage-history');
fs.mkdirSync(hist, { recursive: true });
const TH = [200000, 272000], classOf = (p) => (p > TH[1] ? 2 : p > TH[0] ? 1 : 0);
const shards = new Map(); const cells = new Map(); const cells60 = new Map();
let rows = 0, seq = 0, absent = 0, planted = 0;
function addCell(map, key, ts, rw, prompt) {
  let c = map.get(key);
  if (!c) map.set(key, (c = { n: 0, i: 0, o: 0, cw5: 0, cw1: 0, cr: 0, first: ts, last: ts, pmin: prompt, pmax: prompt }));
  c.n++; c.i += rw.i; c.o += rw.o; c.cw5 += rw.cw5 || 0; c.cw1 += rw.cw1 || 0; c.cr += rw.cr;
  if (ts < c.first) c.first = ts; if (ts > c.last) c.last = ts; if (prompt < c.pmin) c.pmin = prompt; if (prompt > c.pmax) c.pmax = prompt;
}
function emit(conv, ts, prompt, model) {
  const s = seq++, rid = 'req_cells_' + s.toString(36).padStart(9, '0');
  const be = conv.acct && conv.acct.startsWith('cxs-') ? 'codex' : 'claude';
  const cr = Math.max(0, prompt - 3000), i = 3 + (s % 40), cw5 = be === 'codex' ? undefined : Math.min(3000, prompt - cr - i);
  const rw = { rid, mid: 'msg_cells_' + s.toString(36).padStart(9, '0'), ts, sid: conv.sid, be, model, acct: conv.acct, ...(conv.pool ? { pool: conv.pool } : {}), atype: conv.acct ? (be === 'codex' ? 'codex-subscription' : 'subscription') : 'global', aname: conv.acct ? 'Account ' + conv.acct.slice(-2) : null, mode: conv.mode, host: conv.host, cwd: conv.cwd, origin: conv.origin, i, ...(cw5 === undefined ? {} : { cw5, cw1: 0 }), cr, o: s % 1500, tier: 'standard' };
  if (cw5 === undefined) absent++;
  const k = new Date(ts).toISOString().slice(0, 7);
  let a = shards.get(k); if (!a) shards.set(k, (a = [])); a.push(JSON.stringify(rw));
  // a re-send planted across a month boundary (the same rid in two month files): one in 5 000 rows of the last day of a month
  const nd = new Date(ts); if (s % 5000 === 0 && nd.getUTCDate() >= 28) { const nk = new Date(Date.UTC(nd.getUTCFullYear(), nd.getUTCMonth() + 1, 1)).toISOString().slice(0, 7); if (nk <= new Date(NOW).toISOString().slice(0, 7)) { let b = shards.get(nk); if (!b) shards.set(nk, (b = [])); b.push(JSON.stringify({ ...rw, ts: Date.parse(nk + '-01T00:00:01Z') })); planted++; } }
  const base = [conv.sid, model, conv.acct, be, rw.atype, conv.cwd, conv.mode, conv.host, conv.pool || '', conv.origin, rw.aname, classOf(prompt)].join('\x1f');
  addCell(cells, Math.floor(ts / Q) + '\x1f' + base, ts, rw, prompt);
  addCell(cells60, Math.floor(ts / H) + '\x1f' + base, ts, rw, prompt);
  rows++;
}
const convOf = (sid) => { const ox = r(); return { sid, acct: accts[zipf(accts.length)], cwd: projects[zipf(projects.length)], mode: r() < 0.9 ? null : modes[1 + Math.floor(r() * 2)], host: r() < 0.8 ? null : hosts[1 + Math.floor(r() * 3)], pool: r() < 0.3 ? pools[r() < 0.5 ? 0 : 1] : null, origin: ox < S.origins.main ? 'main' : ox < S.origins.main + S.origins.workflow ? 'workflow' : ox < 1 - S.origins.unknown ? 'subagent' : 'unknown' }; };
const t0 = performance.now();
for (let i = 0; i < nOne; i++) emit(convOf('one-' + i), Math.floor(START + r() * (NOW - START - 60e3)), 20000 + Math.floor(r() * 60000), models[zipf(models.length)]);
for (let i = 0; i < nMulti; i++) {
  const conv = convOf('multi-' + i), model = models[zipf(models.length)], big = r() < 0.2, cap = big ? 600000 : 150000 + Math.floor(r() * 40000);
  let ts = Math.floor(START + r() * (NOW - START - 30 * DAY)), prompt = 20000;
  const n = Math.max(2, Math.round(perMulti * (0.2 + 1.6 * r())));
  for (let k = 0; k < n && ts < NOW - 60e3; k++) {
    const x = r(); ts += x < 0.70 ? 5e3 + r() * 55e3 : x < 0.95 ? 6e4 + r() * 54e4 : 36e5 + r() * 23 * 36e5;
    prompt += 1000 + Math.floor(r() * 2000); if (prompt > cap) prompt = 30000 + Math.floor(r() * 20000);
    emit(conv, Math.floor(ts), prompt, r() < 0.9 ? model : models[zipf(models.length)]);
  }
}
let bytes = 0; for (const [k, lines] of shards) { const t = lines.join('\n') + '\n'; fs.writeFileSync(path.join(hist, `events-${k}.ndjson`), t); bytes += Buffer.byteLength(t); shards.set(k, null); }
log(`PLACED ${rows} rows + ${planted} planted re-sends in the next month's file, ${Math.round(bytes / MB)} MB, ${fs.readdirSync(hist).length} shards on ${TMP_ROOTS[1]} (disk), ${Math.round(performance.now() - t0)} ms`);
// ── MEASURE 1: the cell count, its bytes, the fold
log(`MEASURE 1 CELLS (full key): 15 min ${cells.size} · 1 h ${cells60.size} (rows/cell ${(rows / cells.size).toFixed(2)} · ${(rows / cells60.size).toFixed(2)})`);
const keyBytes = [...cells.keys()].slice(0, 20000).reduce((n, k) => n + k.length, 0) / Math.min(20000, cells.size);
log(`MEASURE 1 BYTES — packed (13 interned key ints × 4 B + 10 values × 8 B = 132 B a cell): ${Math.round(cells.size * 132 / MB)} MB at 15 min · ${Math.round(cells60.size * 132 / MB)} MB at 1 h; as a plain Map of string keys (avg ${Math.round(keyBytes)} chars) and objects: heap measured below`);
const NC = cells.size; cells60.clear();
const h0 = memNow(); const keep = cells; const h1 = memNow();
// the fold: 12 dims + 8 pivots over cells in a range (the dims read from the key; local hour / weekday from the slot)
const PIV = [['day', 'account'], ['day', 'model'], ['session', 'origin'], ['project', 'origin'], ['day', 'origin'], ['hour', 'account'], ['weekday', 'model'], ['day', 'pool']];
function foldCells(from) {
  const dims = {}, piv = PIV.map(() => new Map()), fromQ = Math.floor(from / Q);
  const DIM = ['day', 'session', 'model', 'account', 'billing', 'project', 'mode', 'host', 'pool', 'origin', 'hour', 'weekday'];
  for (const d of DIM) dims[d] = new Map();
  let n = 0;
  for (const [key, c] of keep) {
    const p = key.split('\x1f'), q = +p[0]; if (q < fromQ) continue; n++;
    const d = new Date(q * Q), kv = { day: d.toISOString().slice(0, 10), session: p[1], model: p[2], account: p[3], billing: p[5], project: p[6], mode: p[7], host: p[8], pool: p[9], origin: p[10], hour: String(d.getHours()), weekday: String(d.getDay()) };
    for (const dn of DIM) { const m = dims[dn], k = kv[dn]; const b = m.get(k); if (b) { b.n += c.n; b.t += c.i + c.o + c.cr; } else m.set(k, { n: c.n, t: c.i + c.o + c.cr }); }
    PIV.forEach(([a, b], i) => { const k = kv[a] + '\x1f' + kv[b], m = piv[i], e = m.get(k); if (e) e.n += c.n; else m.set(k, { n: c.n }); });
  }
  return n;
}
for (const [label, from] of [['30 days', NOW - 30 * DAY], ['All', 0]]) { const t1 = performance.now(); const n = foldCells(from); log(`MEASURE 1 FOLD ${label} with 8 pivots: ${n} cells in ${Math.round(performance.now() - t1)} ms — on the main thread here, so the largest loop gap is that whole time`); }
// ── MEASURE 2
let s200 = 0, s272 = 0; for (const c of keep.values()) { if (c.pmin <= TH[0] && c.pmax > TH[0]) s200++; if (c.pmin <= TH[1] && c.pmax > TH[1]) s272++; }
log(`MEASURE 2 STRADDLE: cells whose smallest and largest prompt lie on either side of 200 000: ${s200}; of 272 000: ${s272} (of ${keep.size}) — the cells a NEW threshold between them would split`);
log(`MEASURE 2 ABSENT: rows with an absent token count (codex rows: no cache writes reported): ${absent} of ${rows} (stand-in construction)`);
log(`MEASURE 1 HEAP of the cells as a plain Map: ${h1.heapMB - h0.heapMB >= 0 ? 'held since built — ' : ''}heap now ${h0.heapMB} MB with them; dropped below`);
keep.clear(); const h2 = memNow(); log(`MEASURE 1 HEAP after dropping the plain Map: ${h2.heapMB} MB (the Map held ≈ ${h0.heapMB - h2.heapMB} MB, ≈ ${Math.round((h0.heapMB - h2.heapMB) * MB / NC)} B a cell)`);
// ── MEASURE 4 (+ the rest of 2): the real ledger, first load in the worker
const before = memNow();
const uh = new UsageHistory({ dataDir, homeDir: ROOT, firstLoadInWorker: true });
let peak = 0; const smp = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss); }, 20);
uh._loadEvents(); { const p = uh.bootLoadSettled && uh.bootLoadSettled(); if (p && p.then) await p; for (let i = 0; i < 6000 && uh._booting(); i++) await new Promise((res) => setTimeout(res, 50)); }
const atSettle = process.memoryUsage();
await new Promise((res) => setTimeout(res, 3000)); clearInterval(smp);
const afterExit = memNow();
const c = uh._evCache, stuck = c.events.filter((e) => e.ts < c.cutoff).length;
log(`MEASURE 2 STUCK HOT (rows older than the cutoff kept as hot rows): ${stuck}; MEASURE 2 RE-SENDS: placed ${rows + planted} lines, the ledger holds ${c.events.length + c.cold.n} rows (${rows + planted - (c.events.length + c.cold.n)} dropped by the first-copy rule; planted ${planted})`);
log(`MEASURE 4 MEMORY — before the ledger ${JSON.stringify(before)}; RSS at the boot load's settle ${Math.round(atSettle.rss / MB)} MB, peak ${Math.round(peak / MB)} MB; 3 s later + a forced collection (the boot worker exited) ${JSON.stringify(afterExit)}`);
for (const row of uh.cacheCensus()) log(`MEASURE 4 CENSUS ${JSON.stringify(row)}`);
// the hot rows' real heap and the hot id sets: dropped and measured
{ const ev = c.events, rids = c.rids, mids = c.mids; const m0 = memNow(); c.events = []; const m1 = memNow(); c.rids = new Set(); c.mids = new Set(); const m2 = memNow(); log(`MEASURE 4 HOT ROWS' HEAP ≈ ${m0.heapMB - m1.heapMB} MB (${ev.length} rows); HOT ID SETS ≈ ${m1.heapMB - m2.heapMB} MB (${rids.size} + ${mids.size})`); c.events = ev; c.rids = rids; c.mids = mids; }
// LAW 4 (B-360d unit 1): THE WINDOW'S OPEN FROM THE CELLS — 30 days (from a quarter-hour) and All, first and second, 8 pivots:
// the wall, the largest loop gap (a 5 ms sampler) and the shard files opened (a counter on the ledger folder)
{
  const PIV = [['day', 'account'], ['day', 'model'], ['session', 'origin'], ['project', 'origin'], ['day', 'origin'], ['hour', 'account'], ['weekday', 'model'], ['day', 'pool']];
  const opened = []; const o0 = fs.promises.open, s0 = fs.openSync;
  fs.promises.open = (p, ...a) => { if (String(p).startsWith(hist)) opened.push(String(p)); return o0.call(fs.promises, p, ...a); };
  fs.openSync = (p, ...a) => { if (String(p).startsWith(hist)) opened.push(String(p)); return s0.call(fs, p, ...a); };
  const Q15 = 9e5, from30 = Math.floor((NOW - 30 * DAY) / Q15) * Q15;
  for (const [label, q] of [['30 days', { from: from30, pivots: PIV }], ['30 days again', { from: from30, pivots: PIV }], ['All', { pivots: PIV }], ['All again', { pivots: PIV }]]) {
    opened.length = 0;
    let last = performance.now(), gap = 0; const tm = setInterval(() => { const n = performance.now(); gap = Math.max(gap, n - last - 5); last = n; }, 5);
    const t1 = performance.now(); const ans = await uh.aggregateAsync(q); const ms = Math.round(performance.now() - t1); clearInterval(tm);
    log(`MEASURE LAW 4 OPEN ${label}: ${ms} ms wall · largest loop gap ${Math.round(gap)} ms · shard files opened ${opened.length} · ${ans && ans.fromCells ? `from the cells (${ans.fromCells.cells} cells, ${ans.fromCells.rowSlots} row slots)` : 'by the ROW road'} · requests ${ans && ans.totals && ans.totals.requests}`);
  }
  fs.promises.open = o0; fs.openSync = s0;
}
// the cost memo after a relearn (one identity, a reading every 5 h over the ledger's span)
{ const anchors = []; for (let t = START; t < NOW; t += 5 * H) anchors.push(t); for (let i = 1; i < anchors.length; i++) costBetweenMulti(uh, [accts[1]], anchors[i - 1], anchors[i]); log(`MEASURE 4 COST MEMO after a relearn of ${anchors.length - 1} pairs: ${JSON.stringify(costMemoCensus(uh))} · ${JSON.stringify(memNow())}`); }
// the remote id sets after an ingest into three old months
{ const m0 = memNow(); const mk = (k, ts) => JSON.stringify({ rid: 'rr_' + k, mid: 'rm_' + k, ts, sid: 'remote-s', be: 'claude', model: 'model-1', acct: null, i: 1, o: 1, cw5: 0, cw1: 0, cr: 0, cwd: '/r', origin: 'main' });
  const lines = []; for (const back of [90, 180, 270]) for (let k = 0; k < 200; k++) lines.push(mk(back * 1000 + k, NOW - back * DAY + k * 1000));
  try { uh.ingestRemoteEvents('host-old', 'Old', lines.join('\n') + '\n'); } catch (e) { log('ingest: ' + String(e.message).slice(0, 120)); }
  await new Promise((res) => setTimeout(res, 2000)); const m1 = memNow(); log(`MEASURE 4 REMOTE ID SETS after an ingest of 600 rows into three old months: heap +${m1.heapMB - m0.heapMB} MB, RSS ${m1.rssMB} MB · ${JSON.stringify(uh.cacheCensus().map((x) => [x.name || x.what || x.label, x.bytes]).slice(0, 12))}`); }
clean();
console.log('  ✗ MEASUREMENT-ONLY RUN — exits 1 on purpose so the kit returns its log (the MEASURE lines above are the result)');
process.exit(1);
