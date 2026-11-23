#!/usr/bin/env node
// THE CELLS STAND DOWN FOR ROOM (row B-360d, lane lg-providers — 主开发 r2935 / r2941: «the hub's thread never copies or
// rehashes the cells»; the smallest shape that keeps the law: the stand-down alone). Before, the hub's thread added every new
// row's cell and, when the arrays were full, DOUBLED them and rehashed every cell on the loop (0.4–1.1 s at the stand-in's size).
// Now a cache's cells are FIXED once its load pass is whole (or adopted from the worker); full, they stand down — the asks fold
// rows (every row is the ledger's, none is dropped) — and the fold worker rebuilds the cache off the loop with cells sized to the
// cells in use plus a headroom, handed over as transferred buffers. A real UsageHistory over a scratch ledger, made-up rows.
//   ① full ⇒ stood down: the arrays are NOT grown on this thread (the same buffers, the same cap), the cache is NOT marked stale,
//     the worker's rebuild is asked; the new row is counted (the row road answers it)
//   ② an ask during the stand-down is answered AT ONCE by rows — it never waits for the rebuild (a rebuild held open here)
//   ③ a row appended while the rebuild runs (after the worker read the ledger, before the swap) is counted EXACTLY ONCE after the
//     cells stand up; the new cells answer what a fresh row fold answers
//   ④ the worker sizes the arrays at the hand-over: the cells in use plus UsageCells.headroomOf (a quarter, at least 65 536)
//   ⑤ a failed rebuild is asked again by the next row after its wait (the cells never stay down for good)
//   RED COPIES: fixed cells that grow; an ask that waits for the rebuild; no ask again after a failure.
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratchDir, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { checker } from './lib/check.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { ok, report } = checker();
const MC = mutantCopies('usage-cells-standdown', REPO);
const { UsageHistory } = require(path.join(REPO, 'src/usage-history.js'));
const { UsageCells } = require(path.join(REPO, 'src/usage-cells.js'));
const MODEL = require(path.join(REPO, 'src/usage-index-model.js'));
const HSRC = fs.readFileSync(path.join(REPO, 'src/usage-history.js'), 'utf8');
const CSRC = fs.readFileSync(path.join(REPO, 'src/usage-cells.js'), 'utf8');
const T0 = Date.UTC(2026, 1, 2, 9, 0), Q = 9e5;
const quiet = async (f) => { const o = console.log, w = console.warn, said = []; console.log = (m) => said.push(String(m)); console.warn = (m) => said.push(String(m)); try { return { v: await f(), said }; } finally { console.log = o; console.warn = w; } };
let K = 0;
const row = (slot, sid) => JSON.stringify({ rid: 'req_sd_' + (K++), mid: 'msg_sd_' + K, ts: T0 + slot * Q + 1000, sid, model: 'claude-opus-5-5', acct: 'sub-a', atype: 'subscription', aname: 'Alice', be: 'claude', cwd: '/w', origin: 'main', i: 3, o: 5, cw5: 0, cw1: 0, cr: 100, tier: 'standard' });
const SHARD = 'events-2026-02.ndjson';
function place(tag, cells = 40) {
  const dir = scratchDir('usage-cells-standdown-' + tag), hist = path.join(dir, 'usage-history');
  fs.mkdirSync(hist, { recursive: true });
  const lines = []; for (let k = 0; k < cells; k++) lines.push(row(k, 's-' + (k % 4)));
  fs.writeFileSync(path.join(hist, SHARD), lines.join('\n') + '\n');
  return { dir, file: path.join(hist, SHARD), rows: cells };
}
const reread = (u) => { if (u._evCache) u._evCache.checkedAt = 0; return u._loadEvents(); };   // past the incremental read's 1 s throttle
const append = (p, n, from) => { const l = []; for (let k = 0; k < n; k++) l.push(row(from + k, 's-new')); fs.appendFileSync(p.file, l.join('\n') + '\n'); p.rows += n; };
const resolveAccount = (id) => (id === 'sub-a' ? { type: 'subscription', name: 'Alice' } : null);
/** a history whose loaded cells are FULL: cut to exactly the cells in use (a pass that left no room) */
function fullHistory(p, UH = UsageHistory) {
  const u = new UH({ dataDir: p.dir, homeDir: p.dir, resolveAccount });
  u._loadEvents();
  const c = u._evCache;
  c.cells.sizedTo(0); c.cells.fixed = true;
  return u;
}
const req = (a) => (a && a.totals ? a.totals.requests : null);

console.log('— ① full ⇒ the cells stand down, nothing grown on this thread');
{
  const p = place('full');
  const u = fullHistory(p);
  const c = u._evCache, U = c.cells, k0 = U.k, cap0 = U.cap, n0 = U.n;
  let asked = 0; const real = u._requestRebuild.bind(u);
  u._requestRebuild = (why) => { asked++; return new Promise(() => { }); };   // held open: this leg reads the stand-down itself
  append(p, 1, 1000);
  const { said } = await quiet(() => reread(u));
  const rows = await u.aggregateAsync({});
  ok(c.cells === null && !!c.cellsFull && !c.stale && asked === 1 && U.k === k0 && U.cap === cap0 && U.n === n0 && req(rows) === p.rows && said.some((m) => /stand down/.test(m)),
    '① a new cell past the fixed cells\' room: they STAND DOWN — the arrays are the same buffers at the same cap (never grown on this thread), the cache is not stale, the worker\'s rebuild is asked once, and the new row is counted by the row road',
    { cells: c.cells === null, stale: c.stale, asked, grew: U.k !== k0, cap: [cap0, U.cap], requests: req(rows), rows: p.rows });
  u._requestRebuild = real;
}

console.log('— ② an ask during the stand-down is answered at once');
{
  const p = place('ask');
  const u = fullHistory(p);
  let release; const gate = new Promise((r) => { release = r; });
  const realStage = u._stageBuilt.bind(u);
  u._stageBuilt = async (b) => { await gate; return realStage(b); };   // the rebuild held open between the worker's read and the swap
  append(p, 3, 2000);
  await quiet(() => reread(u));
  const t0 = Date.now();
  const a = await Promise.race([u.aggregateAsync({}), new Promise((r) => setTimeout(() => r('waited'), 3000))]);
  const ms = Date.now() - t0;
  ok(a !== 'waited' && req(a) === p.rows && !!u._rb, '② an ask while the cells are down is answered by rows AT ONCE — the rebuild still running (held here), nothing waits for it', { ms, requests: req(a), rows: p.rows, rebuilding: !!u._rb });
  release(); await quiet(() => u.rebuildSettled());
}

console.log('— ③ a row placed between the worker\'s read and the swap: counted exactly once');
{
  const p = place('once');
  const u = fullHistory(p);
  let release, reachedRes; const gate = new Promise((r) => { release = r; }), reached = new Promise((r) => { reachedRes = r; });
  const realStage = u._stageBuilt.bind(u);
  u._stageBuilt = async (b) => { reachedRes(); await gate; return realStage(b); };
  append(p, 1, 3000);   // the row that stands the cells down
  await quiet(() => reread(u));
  await reached;          // the worker HAS read the ledger
  append(p, 2, 3100);   // two rows in the window: after the worker's read, before the swap
  await quiet(() => reread(u));   // the old cache takes them (its cells are down)
  release();
  await quiet(async () => { await u.rebuildSettled(); reread(u); });
  const c2 = u._evCache;
  const viaCells = await u.aggregateAsync({}), fresh = u.aggregate({});
  ok(!!c2 && !!c2.cells && c2.cells.fixed === true && req(viaCells) === p.rows && req(fresh) === p.rows && MODEL.compareAggregates(fresh, viaCells).same,
    '③ after the swap the cells stand up (fixed) and every row — the two placed in the window too — is counted EXACTLY ONCE: the cells answer what a fresh row fold answers', { cellsReq: req(viaCells), freshReq: req(fresh), rows: p.rows, diffs: MODEL.compareAggregates(fresh, viaCells).diffs.slice(0, 3) });
  const n = c2.cells.n;
  ok(c2.cells.cap - n >= 65536 - 2 && c2.cells.cap - n <= 65536,   // packed with the first appended row; the two window rows came after, into the room
    '④ the cells the worker handed over are sized to the cells in use plus the headroom (a quarter, at least 65 536)', { n, cap: c2.cells.cap, headroom: UsageCells.headroomOf(n) });
}

console.log('— ④ the worker\'s pack sizes the arrays');
{
  const p = place('pack', 300);
  const u = new UsageHistory({ dataDir: p.dir, homeDir: p.dir, resolveAccount });
  const packed = u._packWhole();
  const cap = Math.floor(packed.built.cells.k.byteLength / (4 * 13));
  ok(packed.built.cells.n === 300 && cap === 300 + UsageCells.headroomOf(300) && packed.transfer.includes(packed.built.cells.k) && packed.transfer.includes(packed.built.cells.v),
    '④ the worker\'s pack cuts the arrays to the cells in use plus the headroom, and hands them over in the TRANSFER list (moved, never copied on the hub)', { n: packed.built.cells.n, cap });
  const back = UsageCells.fromParts(packed.built.cells);
  ok(back.fixed === true && back.cap === cap, '④ …the cells adopted on the hub are FIXED (never grown there)', { fixed: back.fixed, cap: back.cap });
}

console.log('— ⑤ a failed rebuild is asked again');
{
  const p = place('again');
  const u = fullHistory(p);
  let tries = 0; const realIn = u._inWorker.bind(u);
  u._inWorker = (msg, tr) => { if (msg && msg.op === 'rebuild') { tries++; if (tries === 1) return Promise.reject(new Error('a placed worker failure')); } return realIn(msg, tr); };
  append(p, 1, 4000);
  await quiet(async () => { reread(u); await u.rebuildSettled(); });
  const failed = !!u._rbFail;
  if (u._rbFail) u._rbFail.retryAt = 0;   // its wait over
  append(p, 1, 4100);
  await quiet(async () => { reread(u); await u.rebuildSettled(); reread(u); });
  const a = await u.aggregateAsync({});
  ok(failed && tries === 2 && !!u._evCache.cells && req(a) === p.rows, '⑤ the rebuild FAILED once: after its wait the next row asks it again — the cells stand up, every row counted', { failed, tries, cells: !!u._evCache.cells, requests: req(a), rows: p.rows });
}

console.log('— the cells themselves');
{
  const u = new UsageCells({ capacity: 16 });
  for (let k = 0; k < 16; k++) u.add({ ts: T0 + k * Q, sid: 's', model: 'm', i: 1 });
  u.fixed = true;
  const k0 = u.k; let code = null;
  try { u.add({ ts: T0 + 99 * Q, sid: 's', model: 'm', i: 1 }); } catch (e) { code = e.code; }
  const same = u.add({ ts: T0 + 3 * Q, sid: 's', model: 'm', i: 1 });
  ok(code === 'CELLS_FULL' && u.k === k0 && u.cap === 16 && u.n === 16 && same === 3 && u.v[3 * 10] === 2, 'fixed and full: a NEW cell throws CELLS_FULL with nothing written; a row of a cell it holds still adds to it', { code, cap: u.cap, n: u.n });
  const g = new UsageCells({ capacity: 16 });
  for (let k = 0; k < 17; k++) g.add({ ts: T0 + k * Q, sid: 's', model: 'm', i: 1 });
  ok(g.cap === 32 && g.n === 17, 'not fixed (the worker\'s own load pass): the cells still grow', { cap: g.cap });
}

console.log('— RED COPIES');
{
  const GROW = "        if (this.fixed) throw Object.assign(new Error(`the usage cells are full (${this.n} cells)`), { code: 'CELLS_FULL' });   // nothing written: the row is still the ledger's\n";
  const { UsageCells: U2 } = MC.load('src/usage-cells.js', anchored(CSRC, GROW, '', 'fixed cells grow'), 'grow');
  const u = new U2({ capacity: 16 });
  for (let k = 0; k < 16; k++) u.add({ ts: T0 + k * Q, sid: 's', model: 'm', i: 1 });
  u.fixed = true; const k0 = u.k;
  u.add({ ts: T0 + 99 * Q, sid: 's', model: 'm', i: 1 });
  ok(u.k !== k0 && u.cap === 32, 'CONTROL: a copy whose FIXED cells still grow copies and rehashes them on this thread ⇒ ① goes RED', { cap: u.cap });
  const ASK = "    if (c && c.cells && !c.booting && !c.pending && !c.stale && !opts.rows) return this._cellsAsk(opts, signal, c);\n";
  const { UsageHistory: H2 } = MC.load('src/usage-history.js', anchored(HSRC, ASK, "    if (c && !c.cells && c.cellsFull && this._rb) return this._rb.p.then(() => this.aggregateAsync(opts, { signal }));\n" + ASK, 'an ask waits for the rebuild'), 'ask-waits');
  const p = place('red-stale');
  const u2 = fullHistory(p, H2);
  let release; const gate = new Promise((r) => { release = r; });
  const realStage = u2._stageBuilt.bind(u2);
  u2._stageBuilt = async (b) => { await gate; return realStage(b); };
  append(p, 1, 5000);
  await quiet(() => reread(u2));
  const a = await Promise.race([u2.aggregateAsync({}), new Promise((r) => setTimeout(() => r('waited'), 800))]);
  ok(a === 'waited', 'CONTROL: a copy whose ask WAITS for the rebuild in flight while the cells are down ⇒ ② goes RED', a === 'waited' ? 'waited' : req(a));
  release(); await quiet(() => u2.rebuildSettled());
  const AGAIN = "    else if (c.cellsFull) this._cellsStandUp(c); // (B-360d cells small) stood down for room: the worker's rebuild is asked again (after a failed one's wait)\n";
  const { UsageHistory: H3 } = MC.load('src/usage-history.js', anchored(HSRC, AGAIN, '', 'no ask again'), 'no-again');
  const p3 = place('red-again');
  const u3 = fullHistory(p3, H3);
  let tries = 0; const realIn = u3._inWorker.bind(u3);
  u3._inWorker = (msg, tr) => { if (msg && msg.op === 'rebuild') { tries++; if (tries === 1) return Promise.reject(new Error('a placed worker failure')); } return realIn(msg, tr); };
  append(p3, 1, 6000);
  await quiet(async () => { reread(u3); await u3.rebuildSettled(); });
  if (u3._rbFail) u3._rbFail.retryAt = 0;
  append(p3, 1, 6100);
  await quiet(async () => { reread(u3); await u3.rebuildSettled(); });
  ok(tries === 1 && !u3._evCache.cells, 'CONTROL: a copy that never asks the rebuild again leaves the cells down for good after one failure ⇒ ⑤ goes RED', { tries });
}

report();
