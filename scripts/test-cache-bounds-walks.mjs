#!/usr/bin/env node
// test-cache-bounds-walks — the HEAVY twin of test-cache-bounds (B-7e49, lane bl-tests-e, 主开发 r2522): its legs that RUN the usage
// ledger over a synthesized month, moved VERBATIM — §2 parity (a small window answers what the unbounded cache answers), §6–§11 r2
// (the cold walk off the loop), §13–§19 r3 (worker death, deadline, a missing shard, rewrites, the queue), §25–§31 r4 (the person
// told, stuck workers, one rebuild, chunked months, the stepped boot warm). They are every leg that draws from the seeded row
// generator, kept in their order, so each draws the same rows as before; and §L11, the census of the fields of the cache §2's
// legs load (it reads that cache after them, as it did in the one file). The fast file keeps §1, the census §3, §4, §4b, §5, §5b
// and pins (§T) that this file holds these legs. Selected, as a heavy row, by the files its legs load (src/usage-history.js, its
// fold worker, src/cache-bounds.js …), and run in every whole heavy tier. In-process + its fold workers.
// Run: node scripts/test-cache-bounds-walks.mjs
import './scratch.mjs';   // FIRST (B-ba47 B2): it loads scratch.mjs at run time too (a dynamic import) — the re-home comes before any of its code
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFile } from 'node:child_process';
import { Worker } from 'node:worker_threads';
import { mutantCopies } from './mutant-copy.mjs';
import { armWatchdog } from './suite-watchdog.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const CB = require('../src/cache-bounds.js');
const { UsageHistory } = require('../src/usage-history.js');
const { costBetweenMulti } = require('../src/usage-anchors.js');
const MC = require('../src/memory-census.js');
// the suite's own clock (scripts/suite-watchdog.mjs, the two-clock rule): an async hang ends before the gate's budget naming
// the last § header it printed and that header's last line (a main thread asleep in a syscall runs no timer — the gate's
// /proc read names that one: rel280's was `main S wait_for_partner`, the r4 §26 release below)
armWatchdog();
// r4: a walk's answer carries asOf (its instant) — the parity legs compare the rest; _asOf keeps it for §31
const rawAA = UsageHistory.prototype.aggregateAsync;
UsageHistory.prototype.aggregateAsync = function (...a) { return rawAA.apply(this, a).then((x) => { if (!x || !('asOf' in x)) return x; const { asOf, ...r } = x; Object.defineProperty(r, '_asOf', { value: asOf }); return r; }); };
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
// a cost to 12 significant digits (B-360d unit 1: the cells sum a price per cell, the row fold per row — equal to 1e-9 relative, the ruling's law 2)
const COST12 = (k, v) => (k === 'cost' && typeof v === 'number' ? Number(v.toPrecision(12)) : v);
const eq = (a, b, m) => { const x = JSON.stringify(a, COST12), y = JSON.stringify(b, COST12); let d = 0; while (d < x.length && x[d] === y[d]) d++; const at = Math.max(0, d - 160); ok(x === y, m + (x === y ? '' : `\n     first difference at character ${d}\n     got  …${x.slice(at, d + 140)}\n     want …${y.slice(at, d + 140)}`)); };   // the text around the FIRST difference (B-360d unit 1)
const DAY = 86400e3, NOW = Date.now();
/** Every read door counted (verify #5): fs.readSync / readFileSync / promises.readFile / FileHandle.read. */
function spyReads() {
  const o = { bytes: 0 }, rs = fs.readSync, rf = fs.readFileSync, prf = fs.promises.readFile, po = fs.promises.open;
  fs.readSync = function (...a) { const n = rs.apply(this, a); o.bytes += n; return n; };
  fs.readFileSync = function (...a) { const r = rf.apply(this, a); o.bytes += r.length; return r; };
  fs.promises.readFile = async (...a) => { const r = await prf(...a); o.bytes += r.length; return r; };
  fs.promises.open = async (...a) => { const fh = await po(...a); const rd = fh.read.bind(fh); fh.read = async (...b) => { const r = await rd(...b); o.bytes += r.bytesRead; return r; }; return fh; };
  o.restore = () => { fs.readSync = rs; fs.readFileSync = rf; fs.promises.readFile = prf; fs.promises.open = po; };
  return o;
}
/** OFF THE LOOP, BY ITS MECHANISM (int365 seam C, B-fa30): the cold walk runs in a worker — the main-thread instance's
 *  `_allRows` (the ledger fold) is called ZERO times and a worker walk ran (`_coldWalks` +≥ 1). It was a clock sample
 *  (the walk's longest stall ≤ its own hook work's + half a fold): the .347 branch run's fast job flipped the r2 control
 *  under load — «73 ms > 96 ms + 22 ms» — while the fold witness held. A count cannot drift with the box's load. */
const offLoop = (loopFolds, walks) => loopFolds === 0 && walks >= 1;
const boundLine = (tag, measured, control, rule) => console.log(`  ${tag} bound: measured ${Math.round(measured)} ms / control ${Math.round(control)} ms / rule ${rule}`);

console.log('§2 parity: a small window answers what the unbounded cache answers');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-cache-bounds-'));
let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const MODELS = ['claude-opus-4-1', 'claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-fable-5-1', 'gpt-6-astra'];
const ACCTS = [null, 'acc-a', 'acc-b', 'pool-1'];
const shardOf = (ts) => { const d = new Date(ts); return `events-${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}.ndjson`; };
let rn = 0;
function mkRow(ts) {
  const host = rnd() < 0.15 ? 'H1' : null;
  const n = ++rn;
  const ev = { ts, rid: host ? `h:H1:req_${n}` : (rnd() < 0.05 ? undefined : `req_${n}`), mid: rnd() < 0.8 ? `msg_${n}` : undefined, sid: 's' + (n % 23), cwd: '/w/p' + (n % 5),
    model: pick(MODELS), be: rnd() < 0.2 ? 'codex' : 'claude', acct: pick(ACCTS), atype: pick(['subscription', 'api', 'host', undefined]), mode: pick(['default', 'plan']),
    origin: pick(['main', 'subagent', undefined]), i: Math.floor(rnd() * 5000), o: Math.floor(rnd() * 3000), cw5: Math.floor(rnd() * 20000), cw1: rnd() < 0.3 ? null : Math.floor(rnd() * 900), cr: Math.floor(rnd() * 90000) };
  if (host) ev.host = host;
  if (ev.acct === 'pool-1') ev.pool = 'pool-1';
  if (rnd() < 0.02) delete ev.i; // an absent count: NaN cost on both sides
  return ev;
}
function writeRows(dir, evs) { for (const ev of evs) fs.appendFileSync(path.join(dir, shardOf(ev.ts)), JSON.stringify(ev) + '\n'); }
const mkUh = (sub, w, b) => { const uh = new UsageHistory({ dataDir: path.join(tmp, sub), homeDir: tmp }); if (w) { uh.ledgerWindowMs = w; uh.ledgerHotMaxBytes = b; } return uh; };
const ref = mkUh('d', 0, 0); ref.ledgerWindowMs = 1e15; ref.ledgerHotMaxBytes = 1e15; // everything hot = the old whole-ledger cache
const win = mkUh('d', 40 * DAY, 60 * 1024);
fs.mkdirSync(ref.dir, { recursive: true });
const all = [];
for (let k = 0; k < 4000; k++) all.push(mkRow(NOW - Math.floor(rnd() * 200 * DAY)));
for (let k = 0; k < 40; k++) { const d = all[Math.floor(rnd() * all.length)]; if (d.rid) all.push({ ...d, i: (d.i || 0) + 1 }); } // crash duplicates: the FIRST wins
all.push({ ...mkRow(NOW - 150 * DAY), i: '12' }); // a row the cold columns cannot hold: stays hot
writeRows(ref.dir, all);
const stray = mkRow(NOW - 95 * DAY); // verify #13: a row filed under ANOTHER month's shard (a manual repair, a remote harvest bug)
fs.appendFileSync(path.join(ref.dir, shardOf(NOW - 2 * DAY)), JSON.stringify(stray) + '\n'); all.push(stray);
async function compare(tag) {
  for (const uh of [ref, win]) { if (uh._evCache) uh._evCache.checkedAt = 0; uh._loadEvents(); }
  const c = win._evCache;
  const inWindow = c.events.reduce((t, e, k) => t + ((e.ts || 0) >= c.cutoff ? c.sizes[k] : 0), 0); // a row the columns cannot hold stays hot outside the ceiling
  ok(c.cold.n > 1000 && c.events.length < ref._evCache.events.length && inWindow <= 60 * 1024 && c.events.length - c.events.filter((e) => e.ts >= c.cutoff).length === 1, `${tag}: the window holds ${c.events.length} rows (${inWindow} B ≤ 60 KB + the one odd row), ${c.cold.n} cold`);
  const Q = [{}, { pivots: [['day', 'account'], ['session', 'origin'], ['pool', 'model']] }, { from: NOW - 30 * DAY }, { from: NOW - 100 * DAY, to: NOW - 60 * DAY },
    { backend: 'codex' }, { accounts: new Set(['acc-a', '__global__']) }, { hostFilter: 'H1', from: NOW - 120 * DAY }, { to: NOW - 41 * DAY }];
  for (const q of Q) {
    const want = ref.aggregate(q);
    eq(win.aggregate(q), want, `${tag}: aggregate ${JSON.stringify(q)}`);
    eq(await win.aggregateAsync(q), want, `${tag}: aggregateAsync ${JSON.stringify(q)}`);
  }
  let same = 0, n = 0;
  for (let k = 0; k < 300; k++) {
    const a = NOW - Math.floor(rnd() * 210 * DAY), b = a + Math.floor(rnd() * 20 * DAY);
    const ids = [pick(['__global__', 'acc-a', 'acc-b', 'pool-1', '__global_codex__']), pick(['acc-a', 'pool-1'])];
    const x = JSON.stringify(costBetweenMulti(win, ids, a, b)), y = JSON.stringify(costBetweenMulti(ref, ids, a, b));
    n++; if (x === y) same++; else if (n - same === 1) console.log('     first cost diff', x.slice(0, 200), y.slice(0, 200));
    if (win._evCountUpTo(b) !== ref._evCountUpTo(b)) { same--; console.log('     count diff at', b); }
  }
  eq(same, n, `${tag}: costBetweenMulti + _evCountUpTo identical on ${n} intervals`);
  let found = 0, agree = 0;
  for (const ev of all.filter((_, k) => k % 37 === 0)) {
    for (const [fn, id] of [['eventForRid', ev.rid], ['eventForRid', ev.rid && ev.rid.replace(/^h:H1:/, '')], ['eventForMid', ev.mid]]) {
      if (!id) continue;
      const x = await win[fn](id), y = await ref[fn](id);
      found += y ? 1 : 0; agree += JSON.stringify(x) === JSON.stringify(y) ? 1 : 0;
      if (JSON.stringify(x) !== JSON.stringify(y) && agree + 3 > found) console.log('     lookup diff', fn, id);
    }
  }
  ok(found > 100 && agree >= found, `${tag}: eventForRid / eventForMid agree (${agree} answers, ${found} found)`);
  eq(win.sourceWatermarks(), ref.sourceWatermarks(), `${tag}: sourceWatermarks`);
  let kn = 0, kd = 0;
  for (const ev of all.filter((_, k) => k % 11 === 0)) for (const id of [ev.rid, ev.mid, 'msg_none_' + kn]) {
    if (!id) continue; kn++;
    const want = ref._evCache.rids.has(id) || ref._evCache.mids.has(id);
    if (win.ledgerKnowsId(id) !== want) kd++;
  }
  eq(kd, 0, `${tag}: ledgerKnowsId = the unbounded id sets on ${kn} ids (no ts asked: verify #14)`);
  eq([...win.rows()].length, [...ref.rows()].length, `${tag}: rows() reads every row (the stray included)`);
  eq([await win.eventForRid(stray.rid), win.ledgerKnowsId(stray.mid)], [await ref.eventForRid(stray.rid), true], `${tag}: the row filed under another month is found (verify #13)`);
}
await compare('boot');
const more = [];
for (let k = 0; k < 600; k++) more.push(mkRow(NOW - Math.floor(rnd() * 3 * DAY)));
more.push(mkRow(NOW - 170 * DAY)); // a late old row (a backfill): straight to the cold columns
const coldDup = all.find((e) => e.rid && !e.rid.startsWith('h:') && e.ts < NOW - 60 * DAY);
more.push({ ...coldDup, o: 1 }); // a duplicate of a COLD row: dropped like the unbounded cache drops it
more.push({ ...all.find((e) => e.rid && e !== coldDup && e.ts < NOW - 60 * DAY), ts: NOW - 3600e3, o: 2 }); // verify #12: a cold rid re-appended at a NEW ts
writeRows(ref.dir, more); all.push(...more);
await compare('append');

// (B-360d unit 1: the Usage window answers from the ledger's CELLS — §6 on prove the ROW road's walk, so each ask names it: `rows: true`,
// the road a booting / stale cache and the trim's and exit's asks still take)
console.log('§6–§11 r2: the cold walk off the loop, held, single-flight; the popup reads one line');
{
  const t = mkUh('w', 40 * DAY, 60 * 1024);
  fs.mkdirSync(t.dir, { recursive: true });
  writeRows(t.dir, all.filter((e) => typeof e.i !== 'string'));
  t.warm();
  const q = { pivots: [['day', 'account']] };
  const parse = JSON.parse; let parses = 0;
  JSON.parse = function (...a) { parses++; return parse.apply(this, a); };
  let viaWorker, sync;
  try { parses = 0; viaWorker = await t.aggregateAsync({ ...q, rows: true }); var pw = parses; parses = 0; sync = t.aggregate(q); var ps = parses; } finally { JSON.parse = parse; }
  eq(viaWorker, sync, '§6 the route\'s fold (worker) answers the sync fold exactly');
  ok(pw === 0 && t._coldWalks >= 1, `§6 no cold line parsed on the main thread during aggregateAsync (${pw} parses, ${t._coldWalks} worker walk)`);
  ok(ps > 1000, `control: the sync fold parses ${ps} cold lines ON the loop ⇒ the same check is RED for it`);
  // §7: a mid-walk append / a due slide / a shrink — the answer = the sync answer after
  const before1 = t.aggregate({});
  const appendHook = () => { t.walkHook = null; writeRows(t.dir, [mkRow(NOW - 3600e3), mkRow(NOW - 120 * DAY)]); t._evCache.checkedAt = 0; t._loadEvents(); };
  t.walkHook = appendHook; const a1 = await t.aggregateAsync({ rows: true }); eq(a1.totals, before1.totals, '§7 an append mid-walk (a fresh row + a late OLD row): the answer is AS-OF the walk start (the sync answer at that instant)');
  ok(t.aggregate({}).totals.requests === before1.totals.requests + 2, '§7 …and the next answer has both rows');
  const before2 = t.aggregate({ from: NOW - 300 * DAY });
  t.walkHook = () => { t.walkHook = null; t.ledgerWindowMs = 20 * DAY; t._evCache.checkedAt = 0; writeRows(t.dir, [mkRow(NOW - 60e3)]); t._loadEvents(); };
  const a2 = await t.aggregateAsync({ rows: true, from: NOW - 300 * DAY }); eq(a2.totals, before2.totals, '§7 a slide falling due mid-walk: the walk answers its own plan (as-of its start)');
  const shrink = () => { t.walkHook = null; const f = path.join(t.dir, fs.readdirSync(t.dir).filter((x) => x.startsWith('events-')).sort()[0]); const ls = fs.readFileSync(f, 'utf8').split('\n'); fs.writeFileSync(f, ls.slice(1).join('\n')); t._evCache.checkedAt = 0; t._loadEvents(); };
  t.walkHook = shrink; const a3 = await t.aggregateAsync({ rows: true, to: NOW }); eq(a3.totals, t.aggregate({ to: NOW }).totals, '§7 a shard shrink mid-walk: the worker reads STALE places, the cache rebuilds, the worker re-runs — the sync answer');
  { // control (no re-run): the fold of a walk planned BEFORE the shrink, answered as is
    t._loadEvents(); const cc = t._evCache, h0 = cc.events.length, tss = new Float64Array(h0), locs = new Float64Array(h0);
    for (let i = 0; i < h0; i++) { tss[i] = cc.events[i].ts || 0; locs[i] = cc.locs[i]; }
    const walk = t._coldWalk(null, NOW - 1);
    shrink();
    const rh = new Float64Array(h0); for (let i = 0; i < h0; i++) rh[i] = cc.hrh[i];
    const MW = mutantCopies('cachebounds-walk', REPO);
    const walkSrc = fs.readFileSync(path.join(REPO, 'src/usage-cold-walk.js'), 'utf8');
    const unverified = editAnchor(editAnchor(editAnchor(editAnchor(walkSrc, "if (idHash(line) !== rh) throw stale(where + ' holds another line');", '', "src/usage-cold-walk.js"), "if (!ev || (ev.ts || 0) !== ts) throw stale(where + ' holds another row');", '', "src/usage-cold-walk.js"), "let ev; try { ev = JSON.parse(line); } catch { throw stale(where + ' is not a row'); }", 'let ev; try { ev = JSON.parse(line); } catch { ev = {}; }', "src/usage-cold-walk.js"), "if (o > 0 && buf[o - base - 1] !== 10) throw stale(`${path.basename(fp)}@${o} does not start a line`);", '', "src/usage-cold-walk.js");
    const UW = MW.load('src/usage-cold-walk.js', unverified, 'noverify');
    // The shrink can leave a planned place BEYOND the shard's new end: the structural checks the mutant keeps (`does not
    // start a line` / `has no line end`, usage-cold-walk.js readLinesAt) throw STALE there — which places are planned is a
    // matter of which rows the clock put in the first shard (2026-10-15: red on every tree from 09:00Z, green at 07:42Z).
    // The control's claim is the COUNT: an unverified reader answers a wrong number, partial or fragmentary — so the walk
    // stops at the first structural STALE and the count must still differ from the truth.
    let n3 = 0; try { for (const ev of UW.coldRows(walk)) if (ev && ev.ts) n3++; } catch (e) { if (e.code !== 'STALE') throw e; }
    let staleSeen = false; try { for (const ev of require('../src/usage-cold-walk.js').coldRows(walk)) void ev; } catch (e) { staleSeen = e.code === 'STALE'; }
    ok(staleSeen, '§17 (verify #10) the real reader refuses the stale places (STALE), never folds a fragment');
    const c3 = { totals: { requests: n3 } }, want3 = { requests: [...t.rows(null, NOW - 1)].length };
    ok(c3.totals.requests !== want3.requests, `control (an unverified reader over the stale plan): ${c3.totals.requests} rows ≠ ${want3.requests} ⇒ RED`);
  }
  // §8: single-flight + one walk at a time
  let live = 0, peak = 0; const w0 = t._coldWalks;
  t.walkHook = async () => { live++; peak = Math.max(peak, live); await new Promise((r) => setTimeout(r, 20)); live--; };
  const four = await Promise.all([1, 2, 3, 4].map(() => t.aggregateAsync({ rows: true, to: NOW - DAY })));
  const two = await Promise.all([t.aggregateAsync({ rows: true, to: NOW - 2 * DAY }), t.aggregateAsync({ rows: true, to: NOW - 3 * DAY, backend: 'claude' })]);
  ok(t._coldWalks - w0 === 3 && peak === 1 && four.every((x) => JSON.stringify(x) === JSON.stringify(four[0])) && two[0].totals.requests > 0, `§8 four identical requests = ONE walk, two different = two walks never at once (walks ${t._coldWalks - w0}, peak ${peak})`);
  live = 0; peak = 0;
  await Promise.all([t._aggregateWalk({ to: NOW - 4 * DAY }, 3), t._aggregateWalk({ to: NOW - 5 * DAY }, 3)]);
  ok(peak === 2, `control (two raw walks, no queue): ${peak} walks at once ⇒ RED`);
  t.walkHook = null;
  // §11: the popup's cold lookup reads ONE line (≤ 64 KB), not its month
  const coldEv = all.find((e) => e.rid && e.ts < NOW - 100 * DAY && typeof e.i !== 'string');
  const doors = spyReads();
  let found; try { found = await t._coldFind(coldEv.rid, (ev) => ev.rid === coldEv.rid); } finally { doors.restore(); }
  const bytes = doors.bytes;
  const month = fs.statSync(path.join(t.dir, shardOf(coldEv.ts))).size;
  ok(found && found.rid === coldEv.rid && bytes <= 65536 && month > bytes, `§11 the cold rid lookup read ${bytes} B of a ${month} B month shard`);
  const d2 = spyReads(); try { await fs.promises.readFile(path.join(t.dir, shardOf(coldEv.ts))); } finally { d2.restore(); }
  ok(d2.bytes >= month, `control: a whole-month read through fs.promises.readFile is SEEN by the same instrument (${d2.bytes} B) ⇒ RED`);
}
console.log('§13–§19 r3: no loop fold, worker death / deadline / missing shard, rewrites, hash hits, the queue');
// lane fast-debt-clear: §30's month is BUILT and WARMED inside §15's 1 s control window (its own directory, an instance of its
// own — no worker, no queue), FOLDED beside §26's r3 control, judged in §30's block
let month30Prep = null, month30Run = null, readingOnly30 = null;
{
  const t = mkUh('r3', 40 * DAY, 60 * 1024);
  fs.mkdirSync(t.dir, { recursive: true });
  writeRows(t.dir, all.filter((e) => typeof e.i !== 'string'));
  t.warm();
  let allRowsCalls = 0; const realAll = t._allRows.bind(t); t._allRows = function* (...a) { allRowsCalls++; yield* realAll(...a); };
  // §13 (verify #0/#9): appends on EVERY try — one walk, as-of its start, never a loop fold. The claim is the MECHANISM
  // (seam C, B-fa30): the ledger is folded on the loop ×0 and the walk ran in a worker; the hook's work is a COUNTED step
  // (tries13), never timed — sync0 is the reference answer, taken before the walk
  const q = { pivots: [['day', 'account']] }, sync0 = t.aggregate(q); allRowsCalls = 0;
  const append = (u) => { writeRows(u.dir, [mkRow(NOW - 1000)]); u._evCache.checkedAt = 0; u._loadEvents(); };
  let tries13 = 0; t.walkHook = () => { tries13++; append(t); };
  const w13 = t._coldWalks || 0;
  const a = await t.aggregateAsync({ ...q, rows: true }); t.walkHook = null;
  const walks13 = (t._coldWalks || 0) - w13;
  eq(a, sync0, '§13 appends on every try: the answer = the sync answer at the walk start');
  ok(allRowsCalls === 0, `§13 no fold of the ledger on the loop (_allRows ×${allRowsCalls})`);
  ok(tries13 >= 1 && offLoop(allRowsCalls, walks13), `§13 OFF THE LOOP by its mechanism: the hook's work ran ×${tries13} (each try appended), the walk ran in a worker ×${walks13}, the ledger folded on the loop ×${allRowsCalls}`);
  // rewrites on every try ⇒ the worker re-runs (≤ 3), then an ERROR — still never the loop
  const swapTwo = () => { const f = path.join(t.dir, fs.readdirSync(t.dir).filter((x) => x.startsWith('events-')).sort()[0]); const ls = fs.readFileSync(f, 'utf8').split('\n'); [ls[0], ls[1]] = [ls[1], ls[0]]; fs.writeFileSync(f, ls.join('\n')); t._evCache.checkedAt = 0; t._loadEvents(); };
  t.walkHook = swapTwo; let err13 = null; allRowsCalls = 0;
  try { await t.aggregateAsync({ rows: true, to: NOW - 2 }); } catch (e) { err13 = e; } t.walkHook = null;
  ok(err13 && err13.code === 'STALE' && allRowsCalls === 0, `§13 a shard rewritten under EVERY try ⇒ ${err13 && err13.code}: "${err13 && err13.message.slice(0, 60)}…", the loop never folded`);
  const M = mutantCopies('cachebounds-uh', REPO);
  const uhSrc = fs.readFileSync(path.join(REPO, 'src/usage-history.js'), 'utf8');
  const r2rung = editAnchor(uhSrc, "throw Object.assign(new Error('the usage ledger was rewritten during the read twice (' + e.message + ') — retry'), { code: 'STALE' });", 'return this.aggregate(opts); // r2: the last rung folded on the loop', "src/usage-history.js");
  const UH2 = M.load('src/usage-history.js', r2rung, 'r2rung').UsageHistory;
  const t2 = new UH2({ dataDir: path.join(tmp, 'r3'), homeDir: tmp }); t2.ledgerWindowMs = 40 * DAY; t2.ledgerHotMaxBytes = 60 * 1024; t2.warm();
  let n2 = 0; const real2 = t2._allRows.bind(t2); t2._allRows = function* (...x) { n2++; yield* real2(...x); };
  const swap = (u) => { const f = path.join(u.dir, fs.readdirSync(u.dir).filter((x) => x.startsWith('events-')).sort()[0]); const ls = fs.readFileSync(f, 'utf8').split('\n'); [ls[0], ls[1]] = [ls[1], ls[0]]; fs.writeFileSync(f, ls.join('\n')); u._evCache.checkedAt = 0; u._loadEvents(); };
  let tries2 = 0; t2.walkHook = () => { tries2++; swap(t2); };
  const w2 = t2._coldWalks || 0;
  await t2.aggregateAsync({ rows: true, to: NOW - 3 }).catch(() => null); t2.walkHook = null;
  const walks2 = (t2._coldWalks || 0) - w2;
  ok(r2rung !== uhSrc && tries2 >= 1 && n2 > 0 && !offLoop(n2, walks2), `control (the r2 last rung): the ledger folded on the loop ×${n2} after ${tries2} tries (worker walks ×${walks2}) ⇒ §13's off-the-loop predicate is RED`);
  // the REPLAY (seam C): the .347 branch run's fast job recorded this control's clock sample as «longest stall 73 ms > its
  // hook work's 96 ms + half a fold (22 ms)» — the old rule `stall <= control + fold / 2` held there (73 ≤ 118), so the
  // control went RED on a box under load while the mutant folded on the loop as always; the counts judge the same run
  const oldRule = (stall, control, fold) => stall <= control + fold / 2;
  ok(oldRule(73, 96, 44) && !offLoop(1, 0) && !offLoop(3, 1) && offLoop(0, 1) && !offLoop(0, 0),
    'the clock-sample rule was satisfiable by a box under load (the .347 numbers: 73 ≤ 96 + 22 ⇒ the control RED) — the mechanism rule is not: a loop fold (×1, ×3) is RED at any load, a walk that never ran (×0 walks) is RED too, only «0 folds, ≥ 1 walk» is off the loop');
  // §14 (verify #1/#12): a worker that runs out of memory ⇒ an error, fast; the next request gets a new worker
  // (a fold worker that allocates 200 MB under a 32 MB cap — a cap below ~16 MB kills the WHOLE process while
  // V8 deserializes the isolate, measured: never set one that low)
  const oom = path.join(tmp, 'oom-worker.js');
  fs.writeFileSync(oom, `const { parentPort } = require('worker_threads'); parentPort.on('message', (m) => { if (!m || m.op !== 'fold') return; const a = []; for (let i = 0; i < 200; i++) a.push(new Array(131072).fill(i)); parentPort.postMessage({ ev: 'done', answer: { totals: { requests: a.length }, groups: {} }, missing: 0, missingShards: [] }); });`);
  t.coldWorkerFile = oom; t.coldWorkerHeapMb = 32; let err14 = null; const t0 = Date.now(); allRowsCalls = 0;
  try { await t.aggregateAsync({ rows: true, to: NOW - 4 }); } catch (e) { err14 = e; }
  const took14 = Date.now() - t0; t.coldWorkerHeapMb = 0; t.coldWorkerFile = null;
  // "fast" = the worker's own death answers, never the 10-min deadline (the witness: code ≠ DEADLINE); the time is printed
  // beside a same-run control (the next request's NEW worker spawn + fold), and the deaf-walk mutant below reds the witness
  ok(err14 && /memory|exited|failed/.test(err14.message) && err14.code !== 'DEADLINE' && allRowsCalls === 0 && t._evCache.walking === 0, `§14 a worker out of memory ⇒ "${err14 && err14.message}" (${err14 && err14.code}) in ${took14} ms — its own death, not the deadline; no loop fold, the walk released`);
  const t14n = Date.now(), next14 = await t.aggregateAsync({ rows: true, to: NOW - 5 }), took14n = Date.now() - t14n;
  ok(JSON.stringify(next14.totals) === JSON.stringify(t.aggregate({ to: NOW - 5 }).totals), '§14 the next request starts a NEW worker and answers');
  boundLine('§14', took14, took14n, 'witness: the error is the worker death (code ≠ DEADLINE)');
  const deaf = editAnchor(editAnchor(uhSrc, "w.on('error', (e) => end(reject,", "w.on('error', (e) => void (reject,", "src/usage-history.js"), "w.on('exit', (code) => end(reject,", "w.on('exit', (code) => void (reject,", "src/usage-history.js");
  const td = new (M.load('src/usage-history.js', deaf, 'deaf').UsageHistory)({ dataDir: path.join(tmp, 'r3'), homeDir: tmp }); td.ledgerWindowMs = 40 * DAY; td.ledgerHotMaxBytes = 60 * 1024; td.warm();
  td.coldWorkerFile = oom; td.coldWorkerHeapMb = 32; td.coldFoldDeadlineMs = 1500;
  // lane fast-debt-clear: THE INDEPENDENT DEADLINE LEGS AT ONCE — this control's 1.5 s deadline elapses while the fallback copy,
  // the two children and §15 run: it walks in its OWN patched module (own STUCK / LIVE sets, own queue) and its OOM stub reads
  // no shard (§15 / §16 touch r3's files, never what this walk holds); judged after §15
  const e14dRun = td.aggregateAsync({ rows: true, to: NOW - 7 }).then(() => null, (e) => e);
  // §15 (verify #2): a worker that never answers ⇒ the deadline frees the queue
  // the stub never answers; it leaves at its own 4 s, or as soon as the leg drops the RELEASE file (lane fast-debt-clear: the
  // no-deadline control waited the stub's 4 s out after its 1 s verdict — a wait for nothing the leg asserts)
  const hung = path.join(tmp, 'hung-worker.js'), hungRelease = path.join(tmp, 'hung-worker.release');
  fs.writeFileSync(hung, `const fs = require('fs'); const { parentPort } = require('worker_threads'); parentPort.on('message', () => {}); setTimeout(() => process.exit(0), 4000); setInterval(() => { if (fs.existsSync(${JSON.stringify(hungRelease)})) process.exit(0); }, 10);`);
  t.coldWorkerFile = hung; t.coldFoldDeadlineMs = 300;
  const p1 = t.aggregateAsync({ rows: true, to: NOW - 8 }).then(() => 'answered', (e) => e.code);
  const p2 = t.aggregateAsync({ rows: true, to: NOW - 9 }).then(() => 'answered', (e) => e.code);
  const p3 = t.aggregateAsync({ rows: true, from: NOW - 3600e3 }).then((x) => 'hot ' + x.totals.requests);
  const r15 = await Promise.all([p1, p2, p3]);
  t.coldWorkerFile = null;
  eq(r15.slice(0, 2), ['DEADLINE', 'DEADLINE'], '§15 a hung fold passes its deadline: terminated, every waiter told, the queue moves on');
  ok(/^hot \d+/.test(r15[2]), '§15 a hot-only query is never wedged behind it');
  t.coldFoldDeadlineMs = 1e9; t.coldWorkerFile = hung;
  const pc = t.aggregateAsync({ rows: true, to: NOW - 10 }).then(() => 'answered', (e) => e.code);
  const racer = Promise.race([pc, new Promise((r) => setTimeout(() => r('still waiting'), 1000))]);
  // §14's r2 fallback copy and its two children run INSIDE this control's 1 s (lane fast-debt-clear): they share nothing with
  // t's pending walk (the copy is its own patched module; the children their own processes, READING r3), and the verdict
  // below can only be 'still waiting' if the fold still waits when they are done — never less than 1 s of proof
  const fb = editAnchor(uhSrc, "      throw e;\n    } finally { if (c.walking > 0) c.walking--;", "      return this.aggregate(opts); // the r2 fallback\n    } finally { if (c.walking > 0) c.walking--;", "src/usage-history.js"); // usage-cpu U1: the walk's end runs the trim it owes after the decrement
  const UHf = M.load('src/usage-history.js', fb, 'fallback').UsageHistory;
  const tf = new UHf({ dataDir: path.join(tmp, 'r3'), homeDir: tmp }); tf.ledgerWindowMs = 40 * DAY; tf.ledgerHotMaxBytes = 60 * 1024; tf.warm(); tf.coldWorkerHeapMb = 32; tf.coldWorkerFile = oom;
  let nf = 0; const realf = tf._allRows.bind(tf); tf._allRows = function* (...x) { nf++; yield* realf(...x); };
  await tf.aggregateAsync({ rows: true, to: NOW - 6 }).catch(() => null);
  ok(fb !== uhSrc && nf > 0, `control (the r2 sync fallback on a worker death): folded on the loop ×${nf} ⇒ RED`);
  // the cap binds under a parent --max-old-space-size (execArgv []) — the two children run at once (each its own process
  // READING r3; spawnSync held the loop for both in turn — lane fast-debt-clear)
  const child = (src) => new Promise((resolve) => execFile(process.execPath, ['--max-old-space-size=4096', '--input-type=module', '-e', src], { encoding: 'utf8', timeout: 60000 }, (_e, stdout, stderr) => resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') })));
  const body = (file) => `import { createRequire } from 'node:module'; const require = createRequire(${JSON.stringify(path.join(REPO, 'scripts/x.js'))}); const { UsageHistory } = require(${JSON.stringify(file)}); const u = new UsageHistory({ dataDir: ${JSON.stringify(path.join(tmp, 'r3'))}, homeDir: ${JSON.stringify(tmp)} }); u.ledgerWindowMs = ${40 * DAY}; u.ledgerHotMaxBytes = ${60 * 1024}; u.warm(); u.coldWorkerHeapMb = 1; u.coldWorkerFile = WORKER_FILE; u.aggregateAsync({ rows: true, to: ${NOW - 7} }).then(() => console.log('ANSWERED'), (e) => console.log('REFUSED ' + e.message));`;
  const wSrc = fs.readFileSync(path.join(REPO, 'src/usage-cold-worker.js'), 'utf8');
  const noSoft = M.write('src/usage-cold-worker.js', editAnchor(wSrc, "if (capBytes && ++n % 2000 === 0 && (over = overCap(capBytes, rule, judge))) throw", "if (false) throw", "src/usage-cold-worker.js"), 'nosoftcap');
  // §30b's control (B-f35e): the READING judged wherever the limit is — what the collector has not taken yet counted as held
  readingOnly30 = M.write('src/usage-cold-worker.js', editAnchor(wSrc, "const rule = CB.foldCapRule(", "const rule = 'reading' || CB.foldCapRule(", "src/usage-cold-worker.js"), 'readingonly');
  ok(readingOnly30 !== noSoft && fs.readFileSync(readingOnly30, 'utf8').includes("const rule = 'reading' || CB.foldCapRule("), '§30b the reading-only copy is a copy (its needle found)');
  const [withCap, without] = await Promise.all([child(body(path.join(REPO, 'src/usage-history.js')).replace('WORKER_FILE', 'null')), child(body(path.join(REPO, 'src/usage-history.js')).replace('WORKER_FILE', JSON.stringify(noSoft)))]);
  ok(/REFUSED .*memory/.test(withCap.stdout), `§14 under a parent --max-old-space-size=4096 the fold's 1 MB cap still binds (the soft cap — under any worker's own baseline heap) (${(withCap.stdout || withCap.stderr).trim().slice(0, 80)})`);
  ok(/ANSWERED/.test(without.stdout), `control (resourceLimits alone, no soft cap): the parent's flag lifts the cap, the fold answers (${(without.stdout || without.stderr).trim().slice(0, 60)}) ⇒ RED`);
  month30Prep = prep30();
  const raced = await racer;
  ok(raced === 'still waiting', `control (no deadline): after 1 s the fold is ${raced} ⇒ RED`);
  fs.writeFileSync(hungRelease, ''); await pc; fs.rmSync(hungRelease, { force: true }); t.coldWorkerFile = null; t.coldFoldDeadlineMs = 0;
  const e14d = await e14dRun;   // §14's deaf control, started before the fallback copy (above)
  ok(deaf !== uhSrc && e14d && e14d.code === 'DEADLINE', `control (a walk deaf to its worker's death): "${e14d && e14d.message}" ⇒ RED`);
  // §16 (verify #13): a shard vanishes under the walk ⇒ answered, the rows counted + said; the next read rebuilds
  const shards = fs.readdirSync(t.dir).filter((x) => x.startsWith('events-')).sort();
  const victim = path.join(t.dir, shards[1]), keep = fs.readFileSync(victim);
  t.walkHook = () => { t.walkHook = null; fs.unlinkSync(victim); };
  const a16 = await t.aggregateAsync({ rows: true, to: NOW - 11 });
  ok(a16.partial && a16.partial.missingRows > 0 && a16.partial.shards[0] === shards[1], `§16 a vanished shard: answered without its ${a16.partial && a16.partial.missingRows} rows, said in the result`);
  eq((await t.aggregateAsync({ rows: true, to: NOW - 12 })).totals, t.aggregate({ to: NOW - 12 }).totals, '§16 the next read rebuilt from the directory (no ENOENT loop)');
  fs.writeFileSync(victim, keep); t._evCache = null; t.warm();
  const r2walk = fs.readFileSync(path.join(REPO, 'src/usage-cold-walk.js'), 'utf8').replace("try { fd = fs.openSync(fp, 'r'); } catch (e) { if (e && e.code === 'ENOENT') return false; throw e; }", "fd = fs.openSync(fp, 'r');");
  const W16 = mutantCopies('cachebounds-w16', REPO).load('src/usage-cold-walk.js', r2walk, 'enoent');
  const plan16 = t._coldWalk(null, NOW); fs.renameSync(victim, victim + '.away');
  let threw = false; try { for (const ev of W16.coldRows(plan16)) void ev; } catch (e) { threw = e.code === 'ENOENT'; }
  fs.renameSync(victim + '.away', victim); t._evCache = null; t.warm();
  ok(threw, 'control (the r2 reader): a vanished shard throws ENOENT — /api/usage-stats rejected for ever ⇒ RED');
  // §17 (verify #10/#11): same-size and grown rewrites rebuild; a torn tail never loads as a row
  const truth = () => [...new UsageHistory({ dataDir: path.join(tmp, 'r3'), homeDir: tmp }).rows()].length;
  const f17 = path.join(t.dir, shards[0]);
  const ls = fs.readFileSync(f17, 'utf8').split('\n'); [ls[2], ls[3]] = [ls[3], ls[2]]; fs.writeFileSync(f17, ls.join('\n')); // same size, mtime moves
  t._evCache.checkedAt = 0; t._loadEvents();
  eq([(await t.aggregateAsync({ rows: true, to: NOW - 13 })).totals, [...t.rows()].length], [t.aggregate({ to: NOW - 13 }).totals, truth()], '§17 a SAME-SIZE rewrite ⇒ rebuilt, the numbers = a fresh cache');
  fs.writeFileSync(f17, JSON.stringify(mkRow(NOW - 199 * DAY)) + '\n' + fs.readFileSync(f17, 'utf8')); // grown, but not by an append
  t._evCache.checkedAt = 0; t._loadEvents();
  eq((await t.aggregateAsync({ rows: true, to: NOW - 14 })).totals, t.aggregate({ to: NOW - 14 }).totals, '§17 a GROWN rewrite (a line put at the top) ⇒ the append-only proof fails, rebuilt');
  const n17 = [...t.rows()].length;
  fs.appendFileSync(path.join(t.dir, shards[shards.length - 1]), '{"ts":' + (NOW - 100) + ',"rid":"torn');
  t._evCache.checkedAt = 0; t._loadEvents();
  ok([...t.rows()].length === n17, '§17 a torn tail (no newline) is never a row');
  // §18 (verify #4/#15): a hash hit is a candidate — the string at the place decides
  const cc = t._evCache; cc.cold.settle();
  const someLoc = cc.cold.sh[0] * 4294967296 + cc.cold.off[0];
  cc.cold.idx.rid.put(CB.idHash('req_collides'), someLoc); cc.cold.idx.mid.put(CB.idHash('msg_collides'), someLoc); for (const k of ['rid', 'mid']) cc.cold.idx[k].settle();
  const before18 = t.aggregate({}).totals.requests;
  writeRows(t.dir, [{ ...mkRow(NOW - 50 * DAY), rid: 'req_collides', mid: 'msg_collides2' }]); cc.checkedAt = 0; t._loadEvents();
  ok(t.aggregate({}).totals.requests === before18 + 1 && !t.ledgerKnowsId('msg_collides'), '§18 a row whose rid HASH hits another row loads and counts; a hashed-only mid is not "known"');
  const r2hash = editAnchor(uhSrc, "for (const loc of c.cold.idx.rid.findSorted(CB.idHash(ev.rid))) if (this._rowAt(c, loc)?.rid === ev.rid) return 0;", 'if (c.cold.idx.rid.findSorted(CB.idHash(ev.rid)).length) return 0;', "src/usage-history.js");
  ok(r2hash !== uhSrc, 'control text: the r2 hash-is-identity drop');
  const UHh = M.load('src/usage-history.js', r2hash, 'hashid').UsageHistory;
  const th = new UHh({ dataDir: path.join(tmp, 'r3'), homeDir: tmp }); th.ledgerWindowMs = 40 * DAY; th.ledgerHotMaxBytes = 60 * 1024; th.warm();
  const hc = th._evCache; hc.cold.idx.rid.put(CB.idHash('req_collides3'), hc.cold.sh[0] * 4294967296 + hc.cold.off[0]); hc.cold.idx.rid.settle();
  const b3 = th.aggregate({}).totals.requests;
  writeRows(th.dir, [{ ...mkRow(NOW - 51 * DAY), rid: 'req_collides3' }]); hc.checkedAt = 0; th._loadEvents();
  ok(th.aggregate({}).totals.requests === b3, 'control (the r2 rule: a hash hit = a duplicate): the colliding row is LOST ⇒ RED');
  // §19 (verify #14): the queue holds 4 distinct folds; a 5th / 6th is refused; a request that left is dropped
  t._loadEvents(); const cut19 = t._evCache.cutoff;
  t.walkHook = async () => { await new Promise((r) => setTimeout(r, 30)); };
  const ac = new AbortController();
  const six = [1, 2, 3, 4, 5, 6].map((k) => t.aggregateAsync({ rows: true, to: NOW - 20 - k }, k === 3 ? { signal: ac.signal } : {}).then(() => 'ok', (e) => e.code));
  ac.abort();
  const r19 = await Promise.all(six); t.walkHook = null;
  eq(r19, ['ok', 'ok', 'ABORTED', 'ok', 'BUSY', 'BUSY'], '§19 6 distinct keys: 4 queued (one left before its turn), 2 refused at once');
  t.ledgerWindowMs = 60e3; t._evCache.checkedAt = 0; writeRows(t.dir, [mkRow(NOW - 500)]); t._loadEvents();
  ok(t._evCache.walking === 0 && t._evCache.cutoff > cut19, '§19 between walks the slide runs (the queue never blocks the trim)');
  // §21 (verify #6): a hot-only range: no worker, no disk
  const t21 = mkUh('r3', 40 * DAY, 60 * 1024); t21.warm();
  const dr = spyReads();
  let a21; try { a21 = await t21.aggregateAsync({ rows: true, from: NOW - 3600e3 }); } finally { dr.restore(); }
  ok(a21.totals.requests >= 1 && !t21._coldWalks && dr.bytes === 0, `§21 a today query: no worker (${t21._coldWalks || 0}), ${dr.bytes} B read from disk`);
  // §22: a hot row with no place is folded from memory
  const evF = mkRow(NOW - 2 * DAY); t._take(t._evCache, evF, 300, 5, 100, new Set());
  const a22 = await t.aggregateAsync({ rows: true, to: NOW }); eq(a22.totals.requests, t.aggregate({ to: NOW }).totals.requests, '§22 a fenced row (shard 300) stays hot, folded from memory by the worker');
}
console.log('§25–§31 r4: the person is told, stuck workers, the whole-line hash, one rebuild, chunked months');
{
  const t4 = mkUh('r4', 40 * DAY, 60 * 1024);
  fs.mkdirSync(t4.dir, { recursive: true });
  writeRows(t4.dir, all.filter((e) => typeof e.i !== 'string'));
  t4.warm();
  const N = await import('../src/lib/usage-ledger-note.js');
  const tt = (w, v) => w.replace(/\{(\w+)\}/g, (_, k) => v[k]);
  const fakeDoc = { createElement: (tag) => ({ tag, className: '', textContent: '', children: [], appendChild(c) { this.children.push(c); } }) };
  // §25 (verify #1): a vanished shard ⇒ the Usage window shows a line under the totals
  const sh4 = fs.readdirSync(t4.dir).filter((x) => x.startsWith('events-')).sort(), victim = path.join(t4.dir, sh4[1]), keep = fs.readFileSync(victim);
  t4.walkHook = () => { t4.walkHook = null; fs.unlinkSync(victim); };
  const a25 = await t4.aggregateAsync({ rows: true, to: NOW - 31 });
  fs.writeFileSync(victim, keep); t4._evCache = null; t4.warm();
  const el = N.ledgerNoteEl(fakeDoc, a25, tt);
  ok(el && el.className === 'usage-ledger-note' && el.children[0].className === 'usage-ledger-note-partial' && el.children[0].textContent.startsWith(a25.partial.missingRows + ' rows from a missing ledger file'), `§25 the window's element under the totals: "${el && el.children[0].textContent}"`);
  const uw = fs.readFileSync(path.join(REPO, 'src/lib/usage-window.js'), 'utf8');
  const wired = (src) => /body\.appendChild\(renderTiles\(d\)\);\s*const ledgerNote = ledgerNoteEl\(document, d, t\);\s*if \(ledgerNote\) body\.appendChild\(ledgerNote\);/.test(src);
  ok(wired(uw), '§25 the Usage window appends it right under the totals');
  ok(!wired(uw.replace(/\s*const ledgerNote = ledgerNoteEl\(document, d, t\);\s*if \(ledgerNote\) body\.appendChild\(ledgerNote\);/, '')) && N.ledgerNoteEl(fakeDoc, { totals: {} }, tt) === null, 'control (the r3 window): no line ⇒ RED');
  const zh = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf8'), ja = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf8');
  ok(Object.values(N.LEDGER_NOTE_WORDS).every((w) => zh.includes(JSON.stringify(w) + ':') && ja.includes(JSON.stringify(w) + ':')), '§25 both words have zh + ja');
  // §31 (verify #6): the as-of answer carries asOf and the window says it when it lags
  t4.walkHook = () => { t4.walkHook = null; writeRows(t4.dir, [mkRow(NOW - 500)]); t4._evCache.checkedAt = 0; t4._loadEvents(); };
  const a31 = await t4.aggregateAsync({ rows: true, to: NOW - 32 });
  ok(Number.isFinite(a31._asOf) && a31._asOf <= Date.now(), '§31 a walk answer carries asOf (its plan instant)');
  const lag = N.ledgerNote({ asOf: Date.now() - 5 * 60e3 }), fresh = N.ledgerNote({ asOf: Date.now() - 1000 });
  ok(lag.length === 1 && lag[0].kind === 'asof' && !fresh.length, '§31 the window says "As of hh:mm" past a minute behind, not for a fresh answer');
  ok(!N.ledgerNote({}).length, 'control (no asOf in the answer): nothing to show ⇒ RED');
  // §29 (verify #4): rewrites on every try ⇒ ONE rebuild, then the error
  const tries = [];
  t4.walkHook = (k) => { tries.push(k); const f = path.join(t4.dir, sh4[0]); const ls = fs.readFileSync(f, 'utf8').split('\n'); [ls[0], ls[1]] = [ls[1], ls[0]]; fs.writeFileSync(f, ls.join('\n')); t4._evCache.checkedAt = 0; t4._loadEvents(); };
  let e29 = null; try { await t4.aggregateAsync({ rows: true, to: NOW - 33 }); } catch (e) { e29 = e; } t4.walkHook = null;
  ok(e29 && e29.code === 'STALE' && JSON.stringify(tries) === '[0,1]', `§29 a rewrite on every try: tries ${JSON.stringify(tries)} (one rebuild), then "${e29 && e29.message.slice(0, 50)}…"`);
  const M4 = mutantCopies('cachebounds-r4', REPO), uhSrc4 = fs.readFileSync(path.join(REPO, 'src/usage-history.js'), 'utf8');
  const r3ladder = editAnchor(uhSrc4, 'if (tries < 1) return this._aggregateWalk(opts, tries + 1);', 'if (tries < 2) return this._aggregateWalk(opts, tries + 1);', "src/usage-history.js");
  const t3l = new (M4.load('src/usage-history.js', r3ladder, 'r3ladder').UsageHistory)({ dataDir: path.join(tmp, 'r4'), homeDir: tmp }); t3l.ledgerWindowMs = 40 * DAY; t3l.ledgerHotMaxBytes = 60 * 1024; t3l.warm();
  const tries3 = [];
  t3l.walkHook = (k) => { tries3.push(k); const f = path.join(t3l.dir, sh4[0]); const ls = fs.readFileSync(f, 'utf8').split('\n'); [ls[0], ls[1]] = [ls[1], ls[0]]; fs.writeFileSync(f, ls.join('\n')); t3l._evCache.checkedAt = 0; t3l._loadEvents(); };
  await t3l.aggregateAsync({ rows: true, to: NOW - 34 }).catch(() => null);
  ok(r3ladder !== uhSrc4 && tries3.length === 3, `control (the r3 ladder): ${tries3.length} whole-ledger rebuilds for one request ⇒ RED`);
  t4._evCache = null; t4.warm();
  // §27 (verify #0): an in-place same-length edit + an append ⇒ the next fold says STALE, rebuilds, the money readers answer the NEW value
  const c27 = t4._evCache; c27.cold.settle();
  let q27 = -1, f27, line27, at27;
  for (let q = 0; q < c27.cold.n && q27 < 0; q++) { const f = path.join(t4.dir, c27.shards[c27.cold.sh[q]]); const txt = fs.readFileSync(f, 'utf8'); const off = c27.cold.off[q]; const ln = txt.slice(off, txt.indexOf('\n', off)); const m = /"o":(\d*[0-8])([,}])/.exec(ln); if (m && f !== path.join(t4.dir, sh4[sh4.length - 1]) && txt.indexOf('\n', off) < txt.length - 200 && !/"host":/.test(ln) && /"i":\d/.test(ln)) { q27 = q; f27 = f; line27 = ln; at27 = off; } }
  const ev27 = JSON.parse(line27), ts27 = ev27.ts, acct27 = ev27.acct || require('../src/backend-caps.js').globalUsageKeyOf(ev27.be);
  const costAt = (u) => costBetweenMulti(u, [acct27], ts27 - 1, ts27 + 1).total;
  const oldCost = costAt(t4);
  const buf27 = fs.readFileSync(f27); const edited = line27.replace(/"o":(\d)(\d*)([,}])/, (_, d, r, z) => `"o":${d === '9' ? '1' : '9'}${r}${z}`); // same length, thousands of tokens apart
  Buffer.from(edited).copy(buf27, Buffer.byteLength(fs.readFileSync(f27, 'utf8').slice(0, at27)));
  fs.writeFileSync(f27, buf27); fs.appendFileSync(f27, JSON.stringify(mkRow(ts27 + 2)) + '\n');
  const before27 = t4._evCache; t4._evCache.checkedAt = 0; t4._loadEvents();
  const truth27 = costAt(new UsageHistory({ dataDir: path.join(tmp, 'r4'), homeDir: tmp }));
  ok(t4._evCache === before27 && costAt(t4) === oldCost && oldCost !== truth27, 'control (the append-only proof alone, r3): the edit passes unseen — the money readers still answer the OLD value ⇒ RED');
  await t4.aggregateAsync({ rows: true, to: NOW - 35 });
  ok(t4._evCache !== before27 && costAt(t4) === truth27, `§27 the next fold reads the edited line, its WHOLE-line hash says STALE, the cache rebuilds: the money readers answer the NEW value (${oldCost.toFixed(4)} → ${costAt(t4).toFixed(4)})`);
  // §26 (verify #2): a fold worker blocked in a read is STUCK — counted, said, no second worker, resume on release
  // r5 (lane cache-bounds-stuck-worker-race, B-a568 — the hosted runner: rel282 EPIPE in the r4 release(), rel280 a 300 s hang
  // whose last lines are the r3 control's "2 stuck"): three orders of the fifo stub a descheduled 2-cpu runner wins the other
  // way, FORCED here instead of hoped (measured at 2 cpus + the event-loop stall preload: the r4 fixture red 11 in 20 — EPIPE ×10, rel280's hang ×1):
  //   ① a TERMINATED worker never reads its fifo: its open() returns into a terminating isolate and the worker's cleanup closes
  //     the fd (strace: close, no read) — the r4 release() wrote after its open, racing that close ⇒ EPIPE thrown (rel282)
  //   ② ONE writer open wakes EVERY reader asleep in the fifo's open: `release(); release();` left the second BLOCKING open
  //     with no reader ever to come — the main thread asleep in it runs no timer (rel280: 300 s, load 4.8→0.2)
  //   ③ the fold deadline is armed at spawn and the stub blocks only once booted: a boot slower than the deadline ⇒
  //     terminated before its read, never stuck. The deadline is HELD until a thread sits in the fifo's open
  // Released = KNOCKED: a NONBLOCK writer open (ENXIO = no reader at this instant — nothing to wait for), one byte (EPIPE =
  // the woken worker went first — released all the same), again until the PRODUCT says it exited (its stuck row gone).
  console.log('  §26 a fold worker blocked in a read: stuck, refused, knocked loose');
  const fifo = path.join(tmp, 'ledger.fifo'); spawnSync('mkfifo', [fifo]);
  const blocked = path.join(tmp, 'blocked-worker.js'), mark = path.join(tmp, 'blocked-worker.at');
  fs.writeFileSync(blocked, `const fs = require('fs'); const { parentPort } = require('worker_threads'); parentPort.on('message', (m) => { if (m && m.op === 'fold') { fs.writeFileSync(${JSON.stringify(mark)}, ''); fs.readFileSync(${JSON.stringify(fifo)}); } });`);
  const until = async (fn, ms = 5000) => { const end = Date.now() + ms; while (!fn() && Date.now() < end) await new Promise((r) => setTimeout(r, 25)); return fn(); };
  const knock = () => { let fd = null; try { fd = fs.openSync(fifo, fs.constants.O_WRONLY | fs.constants.O_NONBLOCK); fs.writeSync(fd, 'x'); return 'wrote'; } catch (e) { if (['ENXIO', 'EPIPE', 'EAGAIN'].includes(e.code)) return e.code; throw e; } finally { if (fd !== null) fs.closeSync(fd); } };
  const stuckGone = (u) => () => !u.cacheCensus().some((x) => x.name === 'usage fold workers stuck');
  const releaseUntil = async (gone) => { const end = Date.now() + 5000; while (!gone() && Date.now() < end) { knock(); await new Promise((r) => setTimeout(r, 25)); } return gone(); };
  // a thread of this process asleep in a fifo's open (Linux /proc wchan; the stub's fifo is the only one here); WCHAN = this
  // box's /proc names a sleeping thread's wait at all (the V8 helpers sit in a futex)
  const FIFO_WAIT = /^(?:wait_for_partner|fifo_open)$/;
  const wchans = () => { try { return fs.readdirSync('/proc/self/task').map((t) => { try { return [t, fs.readFileSync(`/proc/self/task/${t}/wchan`, 'utf8').trim()]; } catch { return [t, '']; } }); } catch { return []; } };
  const WCHAN = wchans().some(([, w]) => w && w !== '0');
  const fifoTid = () => (wchans().find(([, w]) => FIFO_WAIT.test(w)) || [null])[0];
  /** ③ the product arms setTimeout(onDeadline, coldFoldDeadlineMs) as it spawns the worker: that one call is captured (by its
   *  delay, inside _spawnJob alone) and the leg fires it. */
  const holdDeadline = (u) => {
    const h = { fire: null }, st = globalThis.setTimeout, spawn = u._spawnJob;
    u._spawnJob = function (...a) { globalThis.setTimeout = (fn, ms, ...r) => (ms === u.coldFoldDeadlineMs && !h.fire ? ((h.fire = fn), st(() => { }, 0)) : st(fn, ms, ...r)); try { return spawn.apply(this, a); } finally { globalThis.setTimeout = st; } };
    h.restore = () => { delete u._spawnJob; };
    return h;
  };
  t4.coldWorkerFile = blocked; t4.coldFoldDeadlineMs = 300; t4.coldTerminateDeadlineMs = 300;
  const w26 = t4._coldWalks, hold26 = holdDeadline(t4);
  const tq1 = Date.now(), p1 = t4.aggregateAsync({ rows: true, to: NOW - 40 }).then(() => null, (e) => e);
  const sat26 = await until(() => hold26.fire && fs.existsSync(mark) && (!WCHAN || fifoTid()));
  hold26.restore(); if (hold26.fire) hold26.fire();
  const e1 = await p1, took1 = Date.now() - tq1;
  const tq = Date.now(); const e2 = await t4.aggregateAsync({ rows: true, to: NOW - 41 }).then(() => null, (e) => e); const took2 = Date.now() - tq;
  // "at once" = refused before a worker spawns (the witness: _coldWalks +1 — the r3stuck mutant below spawns ×2); the time is
  // printed beside the same-run control, the first request's deadline wait
  boundLine('§26', took2, took1, 'witness: refused before a worker spawns (_coldWalks +1)');
  const row26 = t4.cacheCensus().find((x) => x.name === 'usage fold workers stuck');
  ok(sat26 && e1 && e1.code === 'DEADLINE' && e2 && e2.code === 'STUCK' && /1 fold worker\(s\) stuck/.test(e2.message) && t4._coldWalks - w26 === 1 && row26 && row26.count === 1, `§26 a worker blocked in a read (the deadline held until it sat in the fifo's open${WCHAN ? '' : ' — by its mark: /proc names no wait on this box'}: ${!!sat26}): DEADLINE once, then "${e2 && e2.message.slice(0, 60)}…" at once (${took2} ms), 1 worker spawned, the census counts it`);
  t4.coldWorkerFile = null;
  const gone26 = await releaseUntil(stuckGone(t4));
  t4.coldFoldDeadlineMs = 0; t4.coldTerminateDeadlineMs = 0; // the real fold below runs on the product's own deadlines (300 ms is the stub's)
  const a26 = await t4.aggregateAsync({ rows: true, to: NOW - 42 }).then((x) => x, (e) => e);
  ok(gone26 && a26 && a26.totals && stuckGone(t4)(), '§26 released: the stuck worker exited, the count dropped, folds resume');
  const r3stuck = editAnchor(uhSrc4, "if (STUCK.size) return Promise.reject(", "if (false) return Promise.reject(", "src/usage-history.js");
  const ts3 = new (M4.load('src/usage-history.js', r3stuck, 'r3stuck').UsageHistory)({ dataDir: path.join(tmp, 'r4'), homeDir: tmp }); ts3.ledgerWindowMs = 40 * DAY; ts3.ledgerHotMaxBytes = 60 * 1024; ts3.warm();
  ts3.coldWorkerFile = blocked; ts3.coldFoldDeadlineMs = 300; ts3.coldTerminateDeadlineMs = 300;
  // lane fast-debt-clear: §30's month builds and folds while this control's two blocked workers wait out their deadlines — the
  // control walks its OWN patched module (own STUCK set), §30 the real one, whose STUCK set is empty from `gone26` on (nothing
  // after it in §26 touches the real module); r4big is §30's own directory
  const r3stuckRun = (async () => { await ts3.aggregateAsync({ rows: true, to: NOW - 43 }).catch(() => null); await ts3.aggregateAsync({ rows: true, to: NOW - 44 }).catch(() => null); })();
  month30Run = fold30(month30Prep);
  await r3stuckRun;
  ok(r3stuck !== uhSrc4 && ts3._coldWalks === 2, `control (no stuck refusal, r3): ${ts3._coldWalks} blocked workers alive at once ⇒ RED`);
  ok(await releaseUntil(stuckGone(ts3)), '§26 the r3 control\'s two blocked workers knocked loose: both exited (② one knock wakes every reader; the next finds none and waits for nothing)');
  // the r4 fixture's release, verbatim — the controls' subject
  const r4release = () => { const fd = fs.openSync(fifo, 'w'); fs.writeSync(fd, 'x'); fs.closeSync(fd); };
  if (!WCHAN) console.log('  §26 controls ①② need /proc wchan (a thread asleep in the fifo\'s open) — not on this box');
  else {
    /** a stub worker of our own asleep in the fifo's open, then terminated (what the product's end() does) */
    const stub = async () => { const w = new Worker(blocked), s = { exited: false }; w.on('exit', () => { s.exited = true; }); w.postMessage({ op: 'fold' }); s.tid = await until(fifoTid); w.terminate().catch(() => { }); return s; };
    /** fn() with its fs.writeSync HELD until thread `tid` is gone — the woken worker's cleanup closed its end first, the
     *  runner's order (a bounded spin: Atomics.wait 1 ms steps, 2 s) */
    const heldWrite = (fn, tid) => {
      const ws = fs.writeSync, sab = new Int32Array(new SharedArrayBuffer(4)), alive = () => fs.existsSync('/proc/self/task/' + tid);
      let fd = null, first = false, err = null, out;
      fs.writeSync = function (d, ...a) { fd = d; const end = Date.now() + 2000; while (alive() && Date.now() < end) Atomics.wait(sab, 0, 0, 1); first = !alive(); return ws.call(this, d, ...a); };
      try { out = fn(); } catch (e) { err = e; } finally { fs.writeSync = ws; }
      if (err && fd !== null) try { fs.closeSync(fd); } catch { }
      return { err, out, first };
    };
    const a1 = await stub(), ra = a1.tid ? heldWrite(r4release, a1.tid) : { err: null }; await until(() => a1.exited); // its blocking open only over a reader seen asleep
    ok(a1.tid && ra.first && ra.err && ra.err.code === 'EPIPE', `control ① (rel282's order — the r4 release, the woken worker gone before its write): ${ra.err ? ra.err.code + ' thrown' : 'wrote'} ⇒ RED`);
    const b1 = await stub(), rb = heldWrite(knock, b1.tid); await until(() => b1.exited);
    ok(b1.tid && rb.first && !rb.err && rb.out === 'EPIPE' && b1.exited, `§26 the knock in that order: ${rb.err ? 'threw ' + rb.err.code : rb.out} — nothing thrown, the worker released and exited`);
    // control ② (rel280's order): the r4 release with NO reader left sits in the fifo's open — run in a worker thread so this
    // suite survives it (the main thread there is the 300 s hang: no timer runs); a reader opened from here lets it go
    const c1 = new Worker(`const fs = require('fs'); const fifo = ${JSON.stringify(fifo)}; (${r4release})(); require('worker_threads').parentPort.postMessage('released');`, { eval: true });
    let c1Done = false; c1.on('message', () => { c1Done = true; }); c1.on('error', () => { });
    const sat2 = await until(fifoTid, 2000), rfd = fs.openSync(fifo, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
    await until(() => c1Done, 2000); fs.closeSync(rfd); c1.terminate().catch(() => { });
    ok(sat2 && c1Done, `control ② (rel280's order — the r4 release with no reader left): ${sat2 ? 'asleep in the fifo\'s open until a reader came' : 'never in the open'} ⇒ RED`);
    ok(knock() === 'ENXIO', '§26 the knock with no reader left: ENXIO at once — never asleep in the open');
  }
  // the belt: nothing of this leg may still sit in the fifo's open when the suite ends — process.exit() waits for such a
  // worker thread forever (measured, Node 22 + 24): a knock wakes a reader, a reader's open + close a writer
  await until(() => { if (!fifoTid()) return true; knock(); try { fs.closeSync(fs.openSync(fifo, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK)); } catch { } return false; });
}
/** §30 (verify #5): a month bigger than the fold's soft cap — built and warmed inside §15's control window, folded twice
 *  beside §26's r3 control.
 *  THE CAP (B-a77d) sits where neither verdict follows the collector. Measured with this leg's own month and fold (a copy of
 *  the worker that records the largest used_heap_size at a 2 000-row check; MB = 1 048 576 bytes, as the product's), 30
 *  folds each way:
 *  - the 5 000-row chunks HOLD <= 9.5 MB, but the reading at a check (what the collector has not taken yet included) is
 *    27.9-30.4 MB plain, 28.3-30.3 on one core, 29.0-32.7 on one core under --single-threaded-gc (32.9 the largest seen).
 *    It does not follow the worker's old-space limit: 28.0-30.8 under 96 MB instead of 64;
 *  - the whole group HOLDS 58 MB after a full collection (refused at «59-65 MB at 2000 rows»).
 *  30 MB sat on the chunks' reading, so the collector's timing decided (the tip alone: red 2 of 12; on one core under
 *  --single-threaded-gc: 8 of 10). 46 MB sits between: 13 MB over the chunks' largest reading, 12 MB under what the whole
 *  group holds, each more than a quarter of the cap; the month (50 MB) is still larger than the cap. */
function prep30() {
  // B-f35e (the batch 69 cure, the suite back under the fast line): 20 MB — between what a 5 000-row chunk HOLDS (<= 9.6 MB)
  // and what it READS (28-33 MB) under the 64 MB floor: the held rule answers the chunks, the whole group (58 MB held) is
  // still refused; ONE fold proves both §30 and §30b (the reading-only control stops at its first crossing)
  const SOFT30 = 20;   // (a const in the function: prep30 runs inside §15's block, before this line of the module is reached)
  const t5 = mkUh('r4big', 40 * DAY, 60 * 1024);
  fs.mkdirSync(t5.dir, { recursive: true });
  const base5 = Date.UTC(new Date(NOW - 120 * DAY).getUTCFullYear(), new Date(NOW - 120 * DAY).getUTCMonth(), 2);
  const rows5 = []; for (let k = 0; k < 120000; k++) rows5.push(JSON.stringify({ ...mkRow(base5 + k * 10000), pad: 'p'.repeat(200) }));
  fs.writeFileSync(path.join(t5.dir, shardOf(base5)), rows5.join('\n') + '\n');
  t5.warm(); t5.coldWorkerHeapMb = SOFT30;
  return { t5, base5 };
}
async function fold30({ t5, base5 }) {
  t5.coldRowBudget = 5000; const ok5 = await t5.aggregateAsync({ rows: true, to: NOW - 100 * DAY }).then((x) => x.totals.requests, (e) => e.message);
  t5.coldRowBudget = 1e9; const bad5 = await t5.aggregateAsync({ rows: true, to: NOW - 101 * DAY }).then(() => 'answered', (e) => e);
  // §30b's control (B-f35e): the same chunks with the reading judged wherever the limit is — refused at its first crossing
  t5.coldRowBudget = 5000; t5.coldWorkerFile = readingOnly30;
  const read5 = await t5.aggregateAsync({ rows: true, to: NOW - 103 * DAY }).then(() => 'answered', (e) => e);
  t5.coldWorkerFile = null;
  return { ok5, bad5, read5, cap: t5.coldWorkerHeapMb, mb: Math.round(fs.statSync(path.join(t5.dir, shardOf(base5))).size / 1048576) };
}
{ // §30 (verify #5): a month bigger than the fold's soft cap folds in row-budget chunks (its fold ran beside §26's r3 control)
  const { ok5, bad5, read5, cap, mb } = await month30Run;
  ok(mb > cap && ok5 === 120000, `§30 a ${mb} MB month under a ${cap} MB soft cap, 5 000-row chunks: ${ok5}`);
  ok(bad5 && bad5.code === 'FOLD_TOO_BIG' && /retrying will not help/.test(bad5.message) && !/retry$/.test(bad5.message), `control (the whole-group read): "${bad5.message && bad5.message.slice(0, 70)}…" ⇒ RED, and it does not say retry`);
  ok(bad5 && /MB still held after a collection/.test(bad5.message), `§30b the refusal says what is HELD after a collection, not a reading ("${bad5.message && bad5.message.slice(55, 130)}…")`);
  ok(cap === 20 && ok5 === 120000, `§30b B-f35e those 5 000-row chunks fold under a ${cap} MB cap — each HOLDS <= 9.6 MB and READS 28-33 under the 64 MB floor, the held rule answers: ${ok5}`);
  ok(read5 && read5.code === 'FOLD_TOO_BIG', `control (the reading alone judged): "${read5 && read5.message ? read5.message.slice(55, 110) : read5}…" ⇒ RED`);
}
{ // §30c (B-f35e, PURE): which judge a fold worker takes — the READING where the cap is the old-space limit V8 kept (the
  // production hub: no parent flag; a fold too big for it is refused before the limit kills the worker, with «retrying
  // will not help»), what is HELD after a collection where the limit is elsewhere (a parent flag; the 64 MB floor)
  const R = (capMb, heapLimitMb, maxOldMb) => CB.foldCapRule({ capMb, heapLimitMb, maxOldMb, maxYoungMb: 32 });
  eq([R(1536, 1584, 1536), R(1536, 4144, 1536), R(20, 112, 64), R(46, 112, 64), R(64, 112, 64), R(0, 112, 64), R(1536, 0, 1536)],
    ['reading', 'held', 'held', 'held', 'reading', 'held', 'held'], '§30c the judge by where the limit is: the hub as shipped (1 536 = its limit) reads; a parent 4 096 flag, the 64 MB floor under a 20 / 46 MB cap hold; a cap AT the floor reads; no cap or no limit known holds');
}
// §31 THE STEPPED BOOT WARM (B-1319): server.js warms the ledger with warmStepped — a MiB per tick, its window slide a
// batch per tick, the cold columns settled a set per tick — instead of warm()'s one 3.5 s tick. It must END where warm()
// ends, field for field (the rows, their places + hashes, the id sets, the shard marks and their append-proofs, the cold
// columns + indexes, the sorted view), on a mixed ledger with a ceiling small enough that the slide moves rows; and a
// reader during it (_loadEvents) finishes the pass itself. Control: a stepped pass whose slice never widens past a line
// longer than itself (the shard would stop there) is caught by the same comparison.
{
  const realNow = Date.now, T31 = realNow(); Date.now = () => T31; // one clock: the cutoff = now − window
  try {
    const base31 = path.join(tmp, 'warm31', 'usage-history'); fs.mkdirSync(base31, { recursive: true });
    const rows31 = []; for (let k = 0; k < 3000; k++) rows31.push(mkRow(NOW - Math.floor(rnd() * 120 * DAY)));
    rows31[1500] = { ...rows31[1500], pad: 'x'.repeat(9000) }; // a line longer than a slice
    writeRows(base31, rows31); writeRows(base31, [rows31[7], rows31[2100]]); // duplicate rids: the FIRST copy wins
    fs.appendFileSync(path.join(base31, shardOf(NOW)), JSON.stringify(mkRow(NOW - 1000))); // an unterminated last line
    const mk31 = () => { const u = new UsageHistory({ dataDir: path.dirname(base31), homeDir: tmp }); u.ledgerWindowMs = 40 * DAY; u.ledgerHotMaxBytes = 60 * 1024; return u; };
    const snap31 = (uh) => { const c = uh._evCache; return JSON.stringify({ ev: c.events, sizes: c.sizes, locs: c.locs, hrh: c.hrh, hot: c.hotBytes, cut: c.cutoff, shards: c.shards, sorted: c.sorted && c.sorted.map((e) => e.rid), rids: [...c.rids].sort(), mids: [...c.mids].sort(), wm: [...c.srcWm], cons: [...c.consumed], marks: [...c.marks].map(([k, m]) => [k, m.ino, m.mtimeMs, m.probe.toString('hex')]), cold: c.cold },
      (k, v) => (ArrayBuffer.isView(v) ? Array.from(v.subarray(0, c.cold.cap)) : v instanceof Map ? [...v] : v instanceof Set ? [...v].sort() : v)); };
    const sync31 = mk31(); sync31.warm(); const want31 = snap31(sync31);
    const step31 = mk31(); let trims31 = 0; const ts31 = step31._trimSteps.bind(step31); step31._trimSteps = function* (b) { for (const _ of ts31(b)) { trims31++; yield; } };
    const r31 = await step31.warmStepped({ chunkBytes: 4096, trimBatch: 50 });
    ok(snap31(step31) === want31 && r31.slices > 50 && trims31 > 5 && sync31._evCache.cold.n > 100, `§31 warmStepped (4 KB slices, the slide 50 rows a step: ${r31.slices} steps, ${trims31} trim yields) ends where warm() ends, field for field (${want31.length} B of state, ${sync31._evCache.cold.n} rows cold)`);
    const mid31 = mk31(); let n31 = 0, rows31mid = -1;
    await mid31.warmStepped({ chunkBytes: 4096, trimBatch: 50, next: (fn) => { if (++n31 === 3) rows31mid = mid31._loadEvents().length; setImmediate(fn); } });
    ok(snap31(mid31) === want31 && rows31mid === sync31._evCache.events.length && !mid31._evCache.pending, `§31 a reader at the 3rd step finishes the pass itself (${rows31mid} hot rows = the whole load), the warm then ends`);
    const bad31 = mk31(); const cr31 = bad31._consumeRange.bind(bad31); bad31._consumeRange = (c, fn, fp, st, from, to, passFrom, pass) => (to - from > 4096 ? from : cr31(c, fn, fp, st, from, to, passFrom, pass));
    await bad31.warmStepped({ chunkBytes: 4096, trimBatch: 50 });
    ok(snap31(bad31) !== want31, 'control (a slice that never widens past a line longer than itself — the shard stops there): the same comparison is red');
  } finally { Date.now = realNow; }
}
// §L11 EVERY STRUCTURE THE LEDGER HOLDS IS A CENSUS ROW (row B-360d unit 1, the design read w0r2kz4cb law 11): each field of a
// loaded ledger cache — and the instance's remote per-month id sets — is either COUNTED by a row of cacheCensus() (named here),
// or DECLARED with why it is no holder (a scalar, a per-shard mark, a set the hot window bounds). A new field with neither is RED.
// Red at the release: the remote id sets (_ingestIx) had no row.
console.log('§L11 every structure the ledger holds is a census row with a ceiling');
{
  win._loadEvents();
  const c = win._evCache, rows = new Map(win.cacheCensus().map((r) => [r.name, r]));
  const COUNTED = { events: 'usage ledger window', hotBytes: 'usage ledger window', cold: 'usage ledger cold columns', cells: 'usage cells', arr: 'usage arrival log', hours: 'usage hour sums', hostAcct: 'usage dark-host index' };
  const DECLARED = {
    consumed: 'one offset per shard (≤ a few dozen numbers)', marks: 'one same-file proof per shard', sizes: 'one number per HOT row — bounded by the window row', locs: 'one number per HOT row', hrh: 'one hash per HOT row',
    rids: 'the HOT rows\' ids — bounded by the window row (the cold ids are in the columns\' row)', mids: 'the HOT rows\' message ids — as rids', srcWm: 'one watermark per source machine', checkedAt: 'a scalar', cutoff: 'a scalar',
    walking: 'a scalar', shards: 'the shard names (one per month)', shardIx: 'one index per shard name', whole: 'a flag', booting: 'a flag', pending: 'the stepped pass in flight (its own rows are the window\'s)', stale: 'a flag + the rewritten shard\'s name',
    sortedLen: 'a scalar', sortedOf: 'a reference to the window\'s own rows', hostAcctVer: 'a scalar', hostAcctFloor: 'a scalar', loading: 'the load\'s words', gen: 'a scalar', sorted: 'the window\'s rows in ts order (the same objects)', sortedSz: 'one number per hot row',
    trim: 'a flag (a stepped trim in flight)', trimAgain: 'a flag', trimOwed: 'a flag', trimP: 'the trim in flight (one promise)', lastTrim: 'the last trim\'s dozen counts', fullSorts: 'a count', stuck: 'two scalars (the cut a trim found nothing coldable below)',
    hostAcctNewest: 'a scalar', hostAcctRows: 'a count of the dark-host index\'s rows (the index is its own row)', hostAcctDown: 'when the dark-host index was dropped + its count', overWarned: 'a flag', skipped: 'a count of bytes', skipSaid: 'the shard names already said (one per shard)',
    absorbing: 'the absorb pass in flight (one promise)', absorbAgain: 'a flag', absorbed: 'the absorb pass\'s step counts (one entry a step, the pass\'s own)',
  };
  const keys = Object.keys(c), unknown = keys.filter((k) => !(k in COUNTED) && !(k in DECLARED));
  const missingRows = [...new Set(Object.values(COUNTED))].filter((n) => !rows.has(n));
  ok(unknown.length === 0, `§L11 every field of the ledger cache is counted or declared (${keys.length} fields)${unknown.length ? ' — RED, no row and no reason: ' + unknown.join(', ') : ''}`);
  ok(missingRows.length === 0 && rows.has('usage remote id sets') && rows.has('usage cells') && Object.values(COUNTED).every((n) => !rows.has(n) || Number.isFinite(rows.get(n).ceiling)), `§L11 each counted structure is a census row WITH a ceiling — the cells and the remote per-month id sets included (red at the release: no remote id sets row)`, missingRows);
  const planted = { ...c, newIndex: new Map() };
  ok(Object.keys(planted).filter((k) => !(k in COUNTED) && !(k in DECLARED)).length === 1, 'CONTROL: a field planted in the cache with no row and no reason is RED by name');
}
fs.rmSync(tmp, { recursive: true, force: true });

console.log(fail ? `✗ ${fail} failed, ${pass} passed` : `ALL PASS ${pass} passed`);
process.exit(fail ? 1 : 0);
