#!/usr/bin/env node
// lane server-memory-residency (B-9428): THE RESIDENT CACHES HAVE A CEILING AND A NAME. The owner's heap snapshot
// (2026-10-09) found the whole usage ledger parsed in the main heap (406 MB), a transcript-tail cache bounded by count
// (328 MB) and the estimator's anchor lines (46 MB). Fast, no server:
//   §1 PURE src/cache-bounds.js: evictLru by bytes + count (the newest stays), ledgerCutoff (window, byte ceiling, the
//      tie group at the edge goes whole, never backwards), coldable, ColdSlab (stable ts order, counts, rid hashes)
//   §2 PARITY on a synthesized ledger: a SMALL window (40 d, 60 KB) answers EXACTLY what the unbounded cache answers —
//      aggregate (sync + the route's aggregateAsync, pivots, filters, ranges), costBetweenMulti (===, every family and
//      class), _evCountUpTo, eventForRid / eventForMid, sourceWatermarks, ledgerKnowsId — before and after appends
//      (a late old row, a duplicate of a cold row, a host row)
//   §3 THE READERS' CENSUS: every reader of the ledger cache in src/ + server.js is a row (how it reads: window /
//      columns / ids); an unlisted reader, a server-side sync aggregate( = red; control ① a reader on the resident
//      array past the window ⇒ red
//   §4 the transcript-tail cache is bounded by BYTES (control ② a count-only bound ⇒ red); the estimator's lines LRU
//   §5 the boot census names the owners (control ③ the line without them ⇒ red); the sampler + server.js wiring
//   r2 (verify r1): §6 the cold fold runs OFF the loop (no cold line parsed on the main thread; control: the sync
//   fold parses them) · §7 exact under an append / a due slide / a shrink mid-walk (control: no re-run ⇒ short) ·
//   §8 single-flight + one walk at a time (control: two raw walks overlap) · §9 a row filed under another month is
//   streamed, found and priced (#13) · §10 dedup + ledgerKnowsId by hash whatever the ts (#12/#14) · §11 the
//   popup's cold lookup reads one line, not a month (#6) · §12 one unit per census row, ArrayBuffers apart (#4)
//   §T §2 (parity), §6–§11 (r2), §13–§19 (r3) and §25–§31 (r4) RUN the ledger over a synthesized month: moved VERBATIM to the heavy
//      twin scripts/test-cache-bounds-walks.mjs (B-7e49, r2522), with §L11 (the census of the fields of the cache §2 loads); this file keeps §1, §3, §4, §4b, §5, §5b
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

console.log('§1 PURE cache-bounds');
{
  const m = new Map([['a', 10], ['b', 10], ['c', 10]]);
  const r = CB.evictLru(m, { maxBytes: 25, sizeOf: (v) => v });
  eq([[...m.keys()], r], [['b', 'c'], { bytes: 20, evicted: 1 }], 'evictLru drops the oldest past the byte ceiling');
  CB.evictLru(m, { maxEntries: 1, sizeOf: (v) => v });
  eq([...m.keys()], ['c'], 'evictLru keeps the count ceiling');
  const big = new Map([['x', 5], ['huge', 999]]);
  CB.evictLru(big, { maxBytes: 100, sizeOf: (v) => v });
  eq([...big.keys()], ['huge'], 'one oversized newest entry stays cached');
  const tss = [NOW - 50 * DAY, NOW - 10 * DAY, NOW - DAY, NOW - DAY], sizes = [10, 10, 10, 10];
  eq(CB.ledgerCutoff({ nowMs: NOW, tss, sizes, windowMs: 45 * DAY, maxBytes: 1e9 }), NOW - 45 * DAY, 'cutoff = now − window under the ceiling');
  eq(CB.ledgerCutoff({ nowMs: NOW, tss, sizes, windowMs: 45 * DAY, maxBytes: 25 }), NOW - 10 * DAY + 1, 'the byte ceiling moves the cutoff past the row that does not fit');
  eq(CB.ledgerCutoff({ nowMs: NOW, tss, sizes, windowMs: 45 * DAY, maxBytes: 15 }), NOW - DAY + 1, 'a tie group at the edge goes whole (kept bytes never pass the ceiling)');
  eq(CB.ledgerCutoff({ nowMs: NOW, tss, sizes, windowMs: 45 * DAY, maxBytes: 1e9, prev: NOW }), NOW, 'the cutoff never slides backwards');
  ok(CB.coldable({ ts: 1, i: 1, o: null, model: 'x' }) && !CB.coldable({ ts: 1, i: '5' }) && !CB.coldable({ i: 1 }) && !CB.coldable({ ts: 1, acct: 7 }) && !CB.coldable({ ts: 1, i: 1.5 }) && !CB.coldable({ ts: 1 }, 255) && !CB.coldable({ ts: 1 }, 0, 2 ** 32), 'coldable: whole counts / null / absent, a shard index < 255, an offset < 4 GiB');
  {
    const m = new Map([['old1', { b: 60, u: 0 }], ['old2', { b: 60, u: 0 }], ['live1', { b: 60, u: 990 }], ['live2', { b: 60, u: 995 }]]);
    const r = CB.evictIdle(m, { floorBytes: 100, idleMs: 100, now: 1000, sizeOf: (v) => v.b, usedAt: (v) => v.u });
    eq([[...m.keys()], r.live, r.liveBytes], [['live1', 'live2'], 2, 120], 'evictIdle: idle entries go past the floor, the live set stays even above it');
  }
  const s = new CB.ColdSlab(2);
  const rows = [{ ts: 30, rid: 'r1', i: 1 }, { ts: 10, rid: 'r2', i: 2 }, { ts: 30, rid: 'r3', i: 3 }, { ts: 20, rid: 'h:H:r4', mid: 'm4', i: 4 }, { ts: 10, i: 5 }];
  for (const r of rows.slice(0, 3)) s.push(r);
  s.settle();
  for (const r of rows.slice(3)) s.push(r);
  eq([...s.rows()].map((r) => r.i), [2, 5, 4, 1, 3], 'ColdSlab: ts order, equal ts in load order across a merge');
  eq([s.countUpTo(10), s.countUpTo(29), s.countUpTo(30)], [2, 3, 5], 'ColdSlab.countUpTo');
  ok(s.locs('rid', 'r3').length === 1 && s.locs('mid', 'm4').length === 1 && s.locs('bare', 'r4').length === 1 && !s.locs('rid', 'nope').length && !s.locs('mid', 'r3').length, 'ColdSlab.locs(kind, id): sorted hash indexes carry the places, whatever the ts');
  eq([s.candidates('r4').length, s.candidates('m4').length, s.candidates('zz').length], [1, 1, 0], 'candidates: the host-stripped rid and the mid');
  ok(!/for \(let q = 0; q < this\.n; q\+\+\)/.test(CB.ColdSlab.prototype.candidates.toString()), '§23 (verify #18) candidates() reads the index (O(log n)), never a scan of the slab');
  ok(/for \(let q = 0; q < this\.n; q\+\+\)/.test('candidates(id) { for (let q = 0; q < this.n; q++) {} }'), 'control: the r2 linear scan text ⇒ RED');
  const hi = new CB.HashIndex();
  for (let k = 0; k < 1e6; k++) hi.put(CB.idHash('k' + k), k);
  ok(hi.merges < 60 && hi.find(CB.idHash('k777'))[0] === 777 && hi.find(CB.idHash('k999999'))[0] === 999999, `§24 (verify #16) 1 M inserts = ${hi.merges} merges (geometric), places carried`);
  ok(!(1e6 / 4096 < 60), `control: a merge per 4 096 inserts would be ${Math.round(1e6 / 4096)} ⇒ RED`);
  ok(!CB.locOk(255, 0) && !CB.locOk(0, 2 ** 32) && CB.locOk(254, 2 ** 32 - 1) && Number.isNaN(CB.locOf(300, 5)), '§22 (verify #17) the loc fence: shard index < 255, offset < 2³² — else NO place');
  ok(Uint8Array.of(300)[0] !== 300, 'control: an unfenced shard 300 decomposes into shard 44 ⇒ RED');
  const lone = [...s.rows(11, 25)][0];
  eq([lone.ts, lone.i, Number.isNaN(lone.o), lone.acct], [20, 4, true, undefined], 'a light row: absent tokens price as NaN, absent names stay undefined');
}

// (B-7e49, r2522) §2's world (the synthesized ledger §5 and §5b warm from): its lines kept here as they were; §2's legs run in
// the heavy twin scripts/test-cache-bounds-walks.mjs, which builds the same world first (the generator is seeded)
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

console.log('§3 the readers\' census');
const READERS = {
  'src/usage-history.js': 'owner — the hot rows, the cold columns, the streamed cold rows',
  'src/usage-hold-road.js': 'owner — UsageHistory\'s hold road (lane ledger-dedup-law r11: its methods, moved out of usage-history.js): the drain appends a held month into the hot rows',
  'src/usage-anchors.js': 'columns — costBetweenMulti reads ts/acct/be/host/atype/model/tokens through _events + the _evCountUpTo version',
  // src/server/usage-pool-engine.js left the census (hotfix usage-ledger-walk B2): the dark taint asks usageHistory.hostAccountsIn — the (host, account) index — and walks no row
  'src/usage-estimator.js': 'ids — ledgerKnowsId; the _evCache sets only for a ledger stub without it',
  // lane auto-resume-bulk (.349): the bulk resume's cost, said before the click — a conversation's last main request and
  // each member's records in its current 5 h window, through _events over a bounded 3-day lookback (never the resident array)
  'src/server/bulk-resume-routes.js': 'columns — the bulk resume\'s cost reads sid/origin/ts/acct/be/host/atype/model/tokens through _events (3-day lookback)',
};
const NEEDLE = /\._events\(|\._evCache\b|\._loadEvents\(|\._sortedEvents\(|\._evCountUpTo\(|\b_allRows\(|\b(?:usageHistory|uh)\.(?:aggregate|rows)\(/;
function census(files) {
  const reds = [];
  for (const [f, text] of Object.entries(files)) {
    const lines = text.split('\n');
    lines.forEach((l, i) => {
      if (!NEEDLE.test(l) || /^\s*(\/\/|\*)/.test(l)) return;
      if (!READERS[f]) reds.push(`${f}:${i + 1} reads the ledger cache and is not a census row`);
      if (/_evCache\??\.events\b/.test(l) && f !== 'src/usage-history.js' && f !== 'src/usage-hold-road.js') reds.push(`${f}:${i + 1} reads the resident array (rows past the window are not there)`);
      if ((f === 'server.js' || f.startsWith('src/server/')) && /\.(?:aggregate|rows)\(|_allRows\(/.test(l)) reds.push(`${f}:${i + 1} a sync cold read on the server loop (use aggregateAsync)`);
    });
  }
  return reds;
}
const walk = (d) => fs.readdirSync(path.join(REPO, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'node_modules' ? [] : walk(path.join(d, e.name))) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []));
const files = Object.fromEntries([...walk('src'), 'server.js'].map((f) => [f, fs.readFileSync(path.join(REPO, f), 'utf8')]));
const reds = census(files);
eq(reds, [], 'every reader of the ledger cache is a census row, none on the resident array, no sync cold read on the server');
for (const f of Object.keys(READERS)) ok(NEEDLE.test(files[f]) || f === 'src/usage-history.js', `census row ${f} still reads (a dead row would hide a move)`);
ok(/await usageHistory\.aggregateAsync\(/.test(files['src/server/account-usage-routes.js']), 'the Usage window route streams through aggregateAsync');
const m1 = { ...files, 'src/usage-anchors.js': files['src/usage-anchors.js'].replace('for (const ev of usageHistory._events(fromMs, toMs)) {', 'for (const ev of usageHistory._evCache.events) {') };
ok(m1['src/usage-anchors.js'] !== files['src/usage-anchors.js'] && census(m1).some((r) => /resident array/.test(r)), 'control ①: a reader on the resident array past the window ⇒ RED');

console.log('§4 the transcript tails and the estimator lines');
const ss = files['src/session-store.js'];
const bytesBound = (t) => /function _jsonlCachePut[\s\S]{0,300}evictIdle\(_jsonlCache, \{ floorBytes: JSONL_CACHE_MAX_BYTES, maxEntries: JSONL_CACHE_MAX, idleMs: JSONL_CACHE_IDLE_MS/.test(t) && !/while \(_jsonlCache\.size > JSONL_CACHE_MAX\)/.test(t);
ok(bytesBound(ss), 'the jsonl cache: the working set stays, idle tails go past a BYTE floor, the count is the second ceiling');
const m2 = ss.replace(/  const r = evictIdle\(_jsonlCache, \{[^\n]*\n/, '  while (_jsonlCache.size > JSONL_CACHE_MAX) _jsonlCache.delete(_jsonlCache.keys().next().value); const r = { bytes: 0, live: 0 };\n');
ok(m2 !== ss && !bytesBound(m2), 'control ②: a count-only jsonl bound ⇒ RED');
{
  const m = new Map();
  for (let k = 0; k < 30; k++) { m.set('s' + k, { spanStart: 0, spanEnd: 32 * CB.MB, u: k }); CB.evictIdle(m, { floorBytes: CB.JSONL_CACHE_MAX_BYTES, maxEntries: CB.JSONL_CACHE_MAX_ENTRIES, idleMs: CB.JSONL_CACHE_IDLE_MS, now: 1e9, sizeOf: (e) => e.spanEnd - e.spanStart, usedAt: (e) => e.u }); }
  eq([m.size, [...m.keys()][0]], [4, 's26'], '30 IDLE tails of 32 MiB: the 128 MB floor keeps the newest 4 (was 30 = 960 MiB)');
  // verify #7: the owner's 17 live conversations × 11 MB (the snapshot's mean) all stay; idle ones go to the 128 MB floor
  const live = new Map(), T = 10 * 60e3, now = 1e9;
  for (let k = 0; k < 25; k++) live.set('c' + k, { b: 11 * CB.MB, u: k < 8 ? now - 2 * T : now - 1000 });
  const r = CB.evictIdle(live, { floorBytes: CB.JSONL_CACHE_MAX_BYTES, maxEntries: CB.JSONL_CACHE_MAX_ENTRIES, idleMs: CB.JSONL_CACHE_IDLE_MS, now, sizeOf: (v) => v.b, usedAt: (v) => v.u });
  eq([live.size, r.live], [17, 17], 'jsonl: 17 live × 11 MB = 187 MB all stay (the 8 idle ones go — the floor is not a cap on the live set)');
  // §28 (verify #3): a CYCLIC working set of 50 live × 11 MB over the 512 MB live ceiling — admission keeps a stable set
  const sweep = (put) => { const m = new Map(); const hits = []; let said = 0; for (let sw = 0; sw < 3; sw++) { let h = 0; for (let k = 0; k < 50; k++) { const key = 'c' + k; if (m.has(key)) { h++; const v = m.get(key); m.delete(key); m.set(key, v); } else said += put(m, key); } hits.push(h); } return { hits, said, size: m.size }; };
  const adm = sweep((m, key) => { m.set(key, { b: 11 * CB.MB, u: now }); return CB.evictIdle(m, { floorBytes: CB.JSONL_CACHE_MAX_BYTES, maxEntries: CB.JSONL_CACHE_MAX_ENTRIES, idleMs: CB.JSONL_CACHE_IDLE_MS, liveMaxBytes: CB.JSONL_LIVE_MAX_BYTES, now, sizeOf: (v) => v.b, usedAt: (v) => v.u }).notAdmitted; });
  ok(adm.hits[1] >= 44 && adm.hits[2] >= 44 && adm.size === 46 && adm.said > 0, `§28 admission: ${adm.size} kept, hits per sweep ${JSON.stringify(adm.hits)}, ${adm.said} served but not kept (said)`);
  const lruS = sweep((m, key) => { m.set(key, 11 * CB.MB); CB.evictLru(m, { maxBytes: CB.JSONL_LIVE_MAX_BYTES, sizeOf: (v) => v }); return 0; });
  ok(lruS.hits[1] === 0, `control (the r3 rule: evict the oldest-touched live): hits per sweep ${JSON.stringify(lruS.hits)} ⇒ RED`);
  const small = new Map(); for (let k = 0; k < 50; k++) small.set('c' + k, { b: CB.MB, u: now - 1000 });
  CB.evictIdle(small, { floorBytes: CB.JSONL_CACHE_MAX_BYTES, maxEntries: 30, idleMs: CB.JSONL_CACHE_IDLE_MS, liveMaxBytes: CB.JSONL_LIVE_MAX_BYTES, now, sizeOf: (v) => v.b, usedAt: (v) => v.u });
  const r2rule = new Map([...Array(50)].map((_, k) => ['c' + k, 1])); CB.evictLru(r2rule, { maxEntries: 30, sizeOf: (v) => v });
  ok(small.size === 50 && r2rule.size === 30, `§20 50 live small tails all kept (${small.size}); control: a count that evicts live tails keeps ${r2rule.size} ⇒ RED`);
  const r1m = new Map([...Array(17)].map((_, k) => ['c' + k, 11 * CB.MB]));
  CB.evictLru(r1m, { maxBytes: 48 * CB.MB, maxEntries: 30, sizeOf: (v) => v });
  ok(!(r1m.size >= 17), `control (the r1 rule, a 48 MB byte LRU): ${r1m.size} of 17 live conversations kept ⇒ RED`);
  const { UsageEstimator } = require('../src/usage-estimator.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-cache-bounds-est-'));
  const est = new UsageEstimator({ anchorsDir: dir, usageHistory: null });
  const line = JSON.stringify({ fetchedAt: 1, accountId: 'a', utilization: { fiveHour: 0.1 } }) + '\n';
  for (const k of ['i1', 'i2', 'i3']) fs.writeFileSync(est._file(k), line.repeat(1000));
  const per = fs.statSync(est._file('i1')).size;
  const save = CB.ESTIMATOR_LINES_MAX_BYTES;
  for (const k of ['i1', 'i2', 'i3']) est.lines(k);
  eq([est._lineCache.size, est.lineCacheCensus().reduce((a, r) => a + r.bytes, 0)], [3, 3 * per], 'the estimator lines are counted by file bytes (its idle and live rows together)');
  ok(save === 32 * CB.MB && /evictIdle\(this\._lineCache, \{ floorBytes: ESTIMATOR_LINES_MAX_BYTES, maxEntries: 256, idleMs: ESTIMATOR_LINES_IDLE_MS, liveMaxBytes: ESTIMATOR_LIVE_MAX_BYTES/.test(files['src/usage-estimator.js']), 'the estimator lines: the live identities stay, the floor applies to idle ones');
  // verify #3/#11: 5 identities × 7 MB = 35 MB (> the 32 MB floor) read every sweep — counted reads per cycle
  const big = JSON.stringify({ fetchedAt: 1, accountId: 'a', utilization: { fiveHour: 0.1 }, pad: 'x'.repeat(500) }) + '\n';
  for (const k of ['j1', 'j2', 'j3', 'j4', 'j5']) fs.writeFileSync(est._file(k), big.repeat(Math.ceil(7 * CB.MB / big.length)));
  const rd = fs.readFileSync; let reads = 0;
  fs.readFileSync = function (...a) { reads++; return rd.apply(this, a); };
  const cyc = [];
  try { for (let c = 0; c < 3; c++) { reads = 0; for (const k of ['j1', 'j2', 'j3', 'j4', 'j5']) est.lines(k); cyc.push(reads); } } finally { fs.readFileSync = rd; }
  eq(cyc, [5, 0, 0], 'estimator: 35 MB of live identities read once, then never again (the working set stays)');
  const lru = new Map(); let lreads = 0; const lcyc = [];
  for (let c = 0; c < 3; c++) { lreads = 0; for (const k of ['j1', 'j2', 'j3', 'j4', 'j5']) { if (!lru.has(k)) { lreads++; lru.set(k, 7 * CB.MB); } else { const v = lru.get(k); lru.delete(k); lru.set(k, v); } CB.evictLru(lru, { maxBytes: 32 * CB.MB, sizeOf: (v) => v }); } lcyc.push(lreads); }
  ok(lcyc[2] > 0, `control (the r1 rule, a 32 MB byte LRU over the same cycle): re-reads ${JSON.stringify(lcyc)} ⇒ RED (thrash)`);
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('§4b B-360d (A) (主开发 r1358): a stated ceiling is enforced where it is stated — the idle floors at the census tick; a held conversation keeps its tail');
{
  const SS = require('../src/session-store.js');
  const ME = require('../src/server/memory-enforce.js');
  const MB = CB.MB, FLOOR = CB.JSONL_CACHE_MAX_BYTES;
  const fill = () => { SS.jsonlCacheClear(); SS.setJsonlHeld(() => null); for (let k = 0; k < 30; k++) SS.jsonlCacheTestPut('t' + k, k < 6 ? 32 * MB : 3 * MB); };   // the probe's shape: 6 × 32 MiB + 24 smaller ≈ 264 MB
  fill();
  const t0 = Date.now(), later = t0 + 11 * 60e3;
  const [idle0, live0] = SS.jsonlCacheCensus(t0);
  const [idle1] = SS.jsonlCacheCensus(later);
  console.log(`      30 tails just read: idle ${(idle0.bytes / MB).toFixed(0)} MB · live ${(live0.bytes / MB).toFixed(0)} MB (ceiling ${live0.ceiling / MB}) · 11 min later with no put: idle ${(idle1.bytes / MB).toFixed(0)} MB (floor ${idle1.ceiling / MB})`);
  ok(idle0.name === 'transcript tails (idle)' && live0.name === 'transcript tails (live)' && live0.bytes > 250 * MB && !live0.over && live0.ceiling === CB.JSONL_LIVE_MAX_BYTES && idle0.bytes === 0, '(b) TWO ROWS: a live set of ~264 MB is NOT over — its own ceiling is 512 MB (the one row said «ceiling 128 · OVER»)');
  ok(idle1.bytes > 250 * MB && idle1.over, 'RED (the release\'s road: the floor enforced only at the next put): eleven idle minutes and no put — the idle row holds ~264 MB over its 128 MB floor');
  const tk = ME.tick({ now: later });
  const [idle2, live2] = SS.jsonlCacheCensus(later);
  console.log(`      the census tick: evicted ${tk.tails.evicted}, freed ${(tk.tails.freedBytes / MB).toFixed(0)} MB in ${tk.tails.ms.toFixed(3)} ms → idle ${(idle2.bytes / MB).toFixed(0)} MB, ${tk.tails.entries} entries`);
  ok(idle2.bytes <= FLOOR && !idle2.over && tk.tails.evicted > 0 && tk.tails.freedBytes > 100 * MB && live2.bytes === 0, '(a) THE TICK enforces the idle floor (a cache drop, no put): the idle set is at ≤ 128 MB within a minute of going idle');
  // HELD: a window open on the live session (a client attached), a turn running, a history window an open socket opened —
  // each keeps its 32 MiB tail through the tick; RED: the same tick with nothing held drops them (the oldest go first)
  const sessions = new Map([['s-open', { claudeSessionId: 't0', clients: new Map([[{}, {}]]) }], ['s-turn', { claudeSessionId: 't1', _isStreaming: true, clients: new Map() }], ['s-shut', { claudeSessionId: 't3', clients: new Map() }]]);
  const sock = {};
  fill(); SS.noteJsonlView(sock, 't2', 'view-t2');
  const kept = ME.tick({ activeSessions: sessions, now: later });
  const heldAfter = ['t0', 't1', 't2', 't3'].map((k) => SS.jsonlHas(k));
  ok(JSON.stringify(heldAfter) === '[true,true,true,false]' && kept.tails.evicted > 0, `HELD through the tick: a window open (t0), a turn running (t1), a history window of an open socket (t2) keep their tails; a session with nothing open (t3) does not — ${JSON.stringify(heldAfter)}`);
  fill(); SS.dropJsonlViews(sock); ME.tick({ activeSessions: new Map(), now: later });
  const unheld = ['t0', 't1', 't2'].map((k) => SS.jsonlHas(k));
  ok(JSON.stringify(unheld) === '[false,false,false]', `RED (nothing held — the release's rule): the same tick drops all three — ${JSON.stringify(unheld)}`);
  // (a)'s place: the sampler calls the trims at EVERY tick, before it reads the rows
  const MS = require('../src/server/memory-sampler.js');
  const order = [];
  const smp = MS.create({ readMainMemory: () => ({}), readSmapsText: () => '', ask: async () => [], caches: () => { order.push('rows'); return []; }, enforce: () => { order.push('enforce'); return { tails: { evicted: 0 } }; }, timers: { setInterval: () => 0, clearInterval: () => { } }, record: () => { } });
  const c = await smp.sample();
  ok(JSON.stringify(order) === '["enforce","rows"]' && c.enforced && typeof c.loopMs === 'number', `the memory census's tick runs the trims first, then reads its rows (timed in its own loopMs) — ${JSON.stringify(order)}`);
  ok(/enforce: \(\) => require\('\.\/src\/server\/memory-enforce\.js'\)\.tick\(\{ activeSessions, usageEstimator \}\)/.test(files['server.js']), 'server.js hands the sampler the tick (beside its owners)');
  // r1374 (2): THE ESTIMATOR'S TRIM AT THE TICK — five identities read, then idle past 30 min with no read: the tick brings the
  // idle set to its 32 MB floor; RED: with no tick (the release's road) they stay over it
  {
    const { UsageEstimator } = require('../src/usage-estimator.js');
    const edir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-cache-bounds-est-tick-'));
    const est = new UsageEstimator({ anchorsDir: edir, usageHistory: null });
    const big = JSON.stringify({ fetchedAt: 1, accountId: 'a', utilization: { fiveHour: 0.1 }, pad: 'x'.repeat(500) }) + '\n';
    for (const k of ['e1', 'e2', 'e3', 'e4', 'e5']) { fs.writeFileSync(est._file(k), big.repeat(Math.ceil(9 * MB / big.length))); est.lines(k); }
    const late = Date.now() + 31 * 60e3;
    const [i0] = est.lineCacheCensus(late);
    const r = ME.tick({ usageEstimator: est, now: late });
    const [i1] = est.lineCacheCensus(late);
    console.log(`      the estimator: 5 identities × 9 MB read, 31 min idle: idle ${(i0.bytes / MB).toFixed(0)} MB (floor ${i0.ceiling / MB}) → the tick evicted ${r.lines && r.lines.evicted} → ${(i1.bytes / MB).toFixed(0)} MB`);
    ok(i0.over && i0.bytes > 40 * MB, 'RED (the release\'s road: the floor enforced only at the next read): five idle identities hold ~45 MB over the 32 MB floor');
    ok(!!r.lines && r.lines.evicted > 0 && i1.bytes <= CB.ESTIMATOR_LINES_MAX_BYTES && !i1.over, 'THE TICK trims the estimator\'s idle identities to their floor too (lineCacheTrim, a cache drop)');
    fs.rmSync(edir, { recursive: true, force: true });
  }
  // r1374 (2): the socket handler's two wirings, pinned with a RED (each gone ⇒ a history window's tail is not held)
  {
    const wsSrc = files['src/ws-handler.js'];
    const noteRe = /\} else if \(data\.viewOnly && \(data\.backendSessionId \|\| data\.claudeSessionId\)\) \{[\s\S]{0,400}noteJsonlView\(ws, backendSessionId, data\.sessionId \|\| backendSessionId\)/;
    const closeRe = /case 'view-close': \{ try \{ require\('\.\/session-store'\)\.dropJsonlView\(ws, data\.sessionId\); \} catch \{ \} break; \}/;
    const sockRe = /ws\.on\('close', \(\) => \{[\s\S]{0,400}dropJsonlViews\(ws\)/;
    ok(noteRe.test(wsSrc) && closeRe.test(wsSrc) && sockRe.test(wsSrc), 'the socket handler: the view-only attach notes the hold (the cache\'s key, by window); `view-close` drops that window\'s; the socket\'s close drops the rest');
    const cut = wsSrc.replace(/try \{ require\('\.\/session-store'\)\.noteJsonlView\([^\n]*\n/, '\n');
    ok(cut !== wsSrc && !noteRe.test(cut), 'RED: the handler without its noteJsonlView line — a history window\'s tail is never held');
    const cvSrc = files['src/lib/chat-view.js'];
    // the dispose body by ITS OWN BOUNDS (主开发 r4571): the method taken whole by its structure — from «  dispose() {» to the first
    // line that closes at the method's own indent — and the view hold's send asserted INSIDE it; never a distance in characters
    const methodBody = (src, head) => { const a = src.indexOf('\n' + head); if (a < 0 || src.indexOf('\n' + head, a + 1) >= 0) return null; const ind = head.match(/^ */)[0], b = src.indexOf('\n' + ind + '}\n', a + 1); return b < 0 ? null : src.slice(a + 1, b + ind.length + 2); };
    const SEND = /\n    try \{ const vid = this\._viewHoldId \|\| \(String\(this\.sessionId \|\| ''\)\.startsWith\('view-'\) \? this\.sessionId : null\); if \(vid\) this\.ws\?\.send\?\.\(\{ type: 'view-close', sessionId: vid \}\)/;
    const sendsAtClose = (src) => { const body = methodBody(src, '  dispose() {'); return !!body && SEND.test(body); };
    ok(sendsAtClose(cvSrc) && /const viewId = viewIdFor\(backend, bsid\);\n    this\._viewHoldId = viewId;/.test(cvSrc), 'the page: a history window (opened as one, or rescued into one) says `view-close` when it goes (chat-view dispose)');
    const noSend = cvSrc.replace(SEND, '\n');
    ok(noSend !== cvSrc && !sendsAtClose(noSend), 'RED: a dispose without the view hold\'s send — a closed history window\'s tail stays held');
    // the window's hold ends with the WINDOW: two windows of one socket, one closed
    SS.jsonlCacheClear(); SS.setJsonlHeld(() => null);
    for (let k = 0; k < 30; k++) SS.jsonlCacheTestPut('t' + k, k < 6 ? 32 * MB : 3 * MB);
    const sock2 = {}; SS.noteJsonlView(sock2, 't0', 'view-a'); SS.noteJsonlView(sock2, 't1', 'view-b'); SS.dropJsonlView(sock2, 'view-a');
    ME.tick({ activeSessions: new Map([['x', { claudeSessionId: 'zz', clients: new Map() }]]), now: Date.now() + 11 * 60e3 });
    ok(!SS.jsonlHas('t0') && SS.jsonlHas('t1'), `a CLOSED history window's hold is gone, its socket's other window still holds (t0 ${SS.jsonlHas('t0')}, t1 ${SS.jsonlHas('t1')})`);
    SS.dropJsonlViews(sock2); SS.jsonlCacheClear(); SS.setJsonlHeld(() => null);
    // r1470 (2): two history windows of ONE conversation on one page share ONE id — the holders are COUNTED: one closed, the tail
    // is still HELD; both closed, it is not. Read from the census's live row eleven idle minutes on (only a held tail is live
    // then; the trim's floor counts every byte, held ones too, so a trim is no witness of a hold). RED: a copy that does not
    // count ends the hold at the FIRST close
    const fill3 = (M) => { M.jsonlCacheClear(); M.setJsonlHeld(() => null); for (let k = 0; k < 4; k++) M.jsonlCacheTestPut('t' + k, 3 * MB); };
    const heldN = (M) => M.jsonlCacheCensus(Date.now() + 11 * 60e3)[1].count;
    fill3(SS);
    const sock3 = {}; SS.noteJsonlView(sock3, 't0', 'view-t0'); SS.noteJsonlView(sock3, 't0', 'view-t0');
    const twoOpen = heldN(SS); SS.dropJsonlView(sock3, 'view-t0');
    const oneOpen = heldN(SS); SS.dropJsonlView(sock3, 'view-t0');
    const noneOpen = heldN(SS);
    const ssSrc = files['src/session-store.js'], COUNT = 'if (h && h.key === k) h.n++; else m.set(w, { key: k, n: 1 });';
    const SSu = mutantCopies('cachebounds-views', REPO).load('src/session-store.js', ssSrc.replace(COUNT, () => 'm.set(w, { key: k, n: 1 });'), 'uncounted');
    fill3(SSu);
    const sock4 = {}; SSu.noteJsonlView(sock4, 't0', 'view-t0'); SSu.noteJsonlView(sock4, 't0', 'view-t0');
    const redTwo = heldN(SSu); SSu.dropJsonlView(sock4, 'view-t0');
    const redOne = heldN(SSu);
    SSu.jsonlCacheClear(); SS.jsonlCacheClear(); SS.setJsonlHeld(() => null);
    ok(twoOpen === 1 && oneOpen === 1 && noneOpen === 0, `two history windows of one conversation share one id: held with both open (${twoOpen}), with one closed (${oneOpen}), not with both closed (${noneOpen})`);
    ok(ssSrc.split(COUNT).length === 2 && redTwo === 1 && redOne === 0, `RED (the holders not counted): the FIRST close ends the hold while the other window still shows the history (held ${redTwo} → ${redOne})`);
  }
  // r1374 (2): the rows FLATTENED in server.js — without it the four idle / live rows are nested arrays the census drops
  {
    ok(/caches: \(\) => \[\.\.\.usageHistory\.cacheCensus\(\), require\('\.\/src\/session-store'\)\.jsonlCacheCensus\(\), usageEstimator\.lineCacheCensus\(\)\]\.flat\(\)/.test(files['server.js']), 'server.js flattens the owners\' rows (two of them hand back two rows each)');
    const owners = [[CB.cacheRow('a', { bytes: 1 })], [CB.cacheRow('t (idle)', { bytes: 1, ceiling: 2 }), CB.cacheRow('t (live)', { bytes: 1, ceiling: 2 })], [CB.cacheRow('e (idle)', { bytes: 1, ceiling: 2 }), CB.cacheRow('e (live)', { bytes: 1, ceiling: 2 })]];
    const flat = MC.memoryCensus({ main: {}, caches: [...owners[0], owners[1], owners[2]].flat() }).caches.length, nested = MC.memoryCensus({ main: {}, caches: [...owners[0], owners[1], owners[2]] }).caches.length;
    ok(flat === 5 && nested === 1, `RED (no .flat()): the four idle / live rows vanish from the census with nothing said — ${flat} rows flattened, ${nested} nested`);
  }
  // THE TICK'S OWN COST at the owner's order: 40 tails (30 the cache's count, 10 held past it) and 150 live sessions — a walk, no parse
  SS.jsonlCacheClear(); const many = new Map(); for (let k = 0; k < 150; k++) many.set('s' + k, { claudeSessionId: 'u' + k, clients: new Map(k < 40 ? [[{}, {}]] : []) });
  for (let k = 0; k < 40; k++) SS.jsonlCacheTestPut('u' + k, 4 * MB);
  const runs = []; for (let i = 0; i < 20; i++) runs.push(ME.tick({ activeSessions: many, now: later }).tails.ms);
  runs.sort((a, b) => a - b);
  console.log(`      the tick's cost: 40 tails + 150 live sessions — median ${runs[10].toFixed(3)} ms, worst ${runs[19].toFixed(3)} ms of 20 (a walk of two maps; nothing read)`);
  ok(runs[10] < 50, `the tick is a walk, never a parse (median ${runs[10].toFixed(3)} ms at the owner's order)`);
  SS.jsonlCacheClear(); SS.setJsonlHeld(() => null);
}

console.log('§5 the boot census names the owners');
const caches = [CB.cacheRow('usage ledger window', { bytes: 61 * CB.MB, count: 120345, unit: 'rows', ceiling: CB.LEDGER_HOT_MAX_BYTES }), CB.cacheRow('usage ledger cold columns', { bytes: 80 * CB.MB, count: 910000, unit: 'rows', ceiling: CB.COLD_COLUMNS_MAX_BYTES, kind: 'arraybuffers' }),
  CB.cacheRow('transcript tails', { bytes: 40 * CB.MB, count: 9, ceiling: CB.JSONL_CACHE_MAX_BYTES }), CB.cacheRow('estimator anchor lines', { bytes: 20 * CB.MB, count: 11, unit: 'identities', ceiling: CB.ESTIMATOR_LINES_MAX_BYTES })];
const main = { rss: 900 * CB.MB, heapTotal: 400 * CB.MB, heapUsed: 300 * CB.MB, external: 10 * CB.MB, arrayBuffers: 1 };
const named = (line) => ['usage ledger window', 'usage ledger cold columns', 'transcript tails', 'estimator anchor lines'].every((n) => line.includes(n));
const line = MC.bootLine(MC.memoryCensus({ main, caches }));
ok(named(line) && line.includes('usage ledger window 61/96 MB (120345 rows)'), 'the boot line names each cache: ' + line.slice(line.indexOf('; in')));
ok(!named(MC.bootLine(MC.memoryCensus({ main }))), 'control ③: the boot line without the owners ⇒ RED');
eq(MC.censusRows(MC.memoryCensus({ main, caches })).caches.map((x) => x.name), caches.map((x) => x.name), 'the System window rows carry the caches (/api/sysinfo serverMemory)');
ok(/caches: \(\) => \[\.\.\.usageHistory\.cacheCensus\(\), require\('\.\/src\/session-store'\)\.jsonlCacheCensus\(\), usageEstimator\.lineCacheCensus\(\)\]/.test(files['server.js']), 'server.js hands the sampler the three owners');
ok(/caches = \(\) => \[\][\s\S]*memoryCensus\(\{[^}]*caches: rows/.test(files['src/server/memory-sampler.js']), 'the sampler asks the owners on every sample');

{ // §12 (verify #4): one unit per row; ArrayBuffers never summed into the main heap
  const line = MC.bootLine(MC.memoryCensus({ main, caches }));
  const heapPart = line.slice(line.indexOf('; in the main heap:'), line.indexOf('; in ArrayBuffers'));
  ok(!heapPart.includes('cold columns') && /; in ArrayBuffers \(part of external\): usage ledger cold columns 80\/256 MB/.test(line), '§12 the cold columns print under ArrayBuffers, not the main heap');
  const r1 = MC.bootLine(MC.memoryCensus({ main, caches: caches.map((x) => ({ ...x, kind: 'heap' })) }));
  ok(r1.slice(r1.indexOf('; in the main heap:')).includes('cold columns'), 'control (the r1 row: no kind): the cold columns land in the main heap ⇒ RED');
  ok(CB.cacheRow('x', { bytes: 300, ceiling: 256 }).over && /OVER/.test(MC.bootLine(MC.memoryCensus({ main, caches: [CB.cacheRow('x', { bytes: 300 * CB.MB, ceiling: 256 * CB.MB, kind: 'arraybuffers' })] }))), '§12 a cache past its ceiling says OVER');
  const t = mkUh('u', 40 * DAY, 60 * 1024);
  fs.mkdirSync(t.dir, { recursive: true });
  writeRows(t.dir, all.slice(0, 1500));
  t.warm();
  const cc = t.cacheCensus();
  ok(cc[0].bytes === t._evCache.hotBytes && cc[0].bytes <= cc[0].ceiling && cc[0].basis === 'raw line bytes' && cc[1].kind === 'arraybuffers' && cc[1].ceiling === CB.COLD_COLUMNS_MAX_BYTES, '§12 the window row is raw line bytes against its raw ceiling; the cold row is ArrayBuffers with a DECLARED ceiling (verify #2)');
}

console.log('§5b B-360d (A): THE SWEEP — every ceiling the census states is paired with the code that enforces it, or says «not enforced»');
{
  const SS = require('../src/session-store.js');
  const { UsageEstimator } = require('../src/usage-estimator.js');
  const t = mkUh('sweep', 40 * DAY, 60 * 1024); fs.mkdirSync(t.dir, { recursive: true }); writeRows(t.dir, all.slice(0, 300)); t.warm();
  const edir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-cache-bounds-sweep-'));
  const est = new UsageEstimator({ anchorsDir: edir, usageHistory: null });
  const rows = [...t.cacheCensus(), ...SS.jsonlCacheCensus(), ...est.lineCacheCensus()];
  // r1374 (3): each enforcer is named WITH its file («src/x.js#name») and judged in THAT file only — a generic name defined
  // somewhere else proves nothing
  const defined = (q) => { const m = /^(src\/[\w./-]+\.js)#([\w$]+)$/.exec(String(q)); if (!m || !files[m[1]]) return false; const n = m[2]; return new RegExp(`(?:function\\s+${n}\\b|^\\s*(?:async\\s+)?${n}\\s*\\(.*\\)\\s*\\{|\\b${n}\\s*=\\s*(?:function|\\())`, 'm').test(files[m[1]]); };
  const judge = (r) => { if (r.ceiling == null) return null; const e = r.enforced; if (!e || typeof e !== 'object') return `${r.name}: a ceiling and no statement of what enforces it`; if (typeof e.not === 'string') return /^not enforced: .{8,}/.test(e.not) ? null : `${r.name}: «not enforced» says no why`; if (!Array.isArray(e.by) || !e.by.length || typeof e.when !== 'string' || !e.when) return `${r.name}: an enforcement with no function or no «when»`; const gone = e.by.filter((n) => !defined(n)); return gone.length ? `${r.name}: names ${gone.join(', ')}, which the tree does not define` : null; };
  for (const r of rows) console.log(`      ${r.name}: ${r.ceiling == null ? 'no ceiling' : r.enforced && r.enforced.not ? r.enforced.not : r.enforced ? `enforced by ${r.enforced.by.join(' + ')} — ${r.enforced.when}` : 'UNSTATED'}`);
  const bad = rows.map(judge).filter(Boolean);
  ok(rows.length >= 10 && !bad.length, `every census row with a ceiling states what enforces it, by functions the tree defines, or «not enforced: …» with its why (${rows.length} rows) — ${bad.join('; ')}`);
  ok(rows.some((r) => r.name === 'usage ledger cold columns' && r.enforced && /^not enforced: .*lg-providers/.test(r.enforced.not || '')), 'the cold columns say «not enforced», and whose it is (lane lg-providers\' unit 3)');
  // CONTROLS: a ceiling with no statement, and a statement naming a function no file defines, are each red by name
  const plantA = judge(CB.cacheRow('planted', { bytes: 1, ceiling: 2 })), plantB = judge(CB.cacheRow('planted2', { bytes: 1, ceiling: 2, enforced: { by: ['src/session-store.js#noSuchTrimAnywhere'], when: 'never' } }));
  const plantC = judge(CB.cacheRow('planted3', { bytes: 1, ceiling: 2, enforced: { by: ['src/session-store.js#_take'], when: 'a name that exists in ANOTHER file' } })), plantD = judge(CB.cacheRow('planted4', { bytes: 1, ceiling: 2, enforced: { by: ['lines'], when: 'a bare name' } }));
  ok(!!plantA && /no statement/.test(plantA) && !!plantB && /noSuchTrimAnywhere/.test(plantB) && !!plantC && /_take/.test(plantC) && !!plantD && /lines/.test(plantD), `CONTROL: an unstated ceiling, a made-up enforcer, a real function of ANOTHER file and a bare name are each red by name — «${plantA}» · «${plantB}» · «${plantC}» · «${plantD}»`);
  const mc = MC.memoryCensus({ main: {}, caches: rows });
  ok(mc.caches.every((x, i) => JSON.stringify(x.enforced) === JSON.stringify(rows[i].enforced || null)), 'the census (the System window, /api/sysinfo) carries each row\'s statement');
  fs.rmSync(edir, { recursive: true, force: true });
}

// (B-7e49, r2522) THE SHARD-WRITER CENSUS (§32 / §17's writers, verify #7): a census over the tree's text, so it stays here; its
// lines stood inside r3's block before the move and are kept as they were (they read only the tree's texts above)
{
  // the ONE invalidation: every in-process shard writer is a migration the server follows with reloadEvents()
  // r4 (verify #7): EVERY write door — sync, promises, callbacks, streams, an open with a write flag, the atomic helpers
  const WRITE_DOOR = /\b(writeFileSync|appendFileSync|renameSync|_writeAtomic|writeJsonAtomic|writeAtomic|createWriteStream|copyFileSync|truncateSync|ftruncateSync)\(|\b(?:fs\.promises|fsp|promises)\.(?:writeFile|rename|appendFile|copyFile|truncate)\(|\bfs\.(?:writeFile|rename|appendFile|truncate)\(|\bopen(?:Sync)?\([^)]*['"](?:w|a|r\+|wx|ax)\+?['"]/;
  const writes = (txt) => /events-[^'"`]*ndjson|_shardFor\(|shardNames|historyDir/.test(txt) && WRITE_DOOR.test(txt);
  const FIXTURE_WRITERS = ['scripts/boot-shape.mjs', 'scripts/usage-shape-fixture.mjs']; // fixture ledgers into a scratch tree, never the server's
  const writerCensus = (fl) => {
    const bad = [];
    const mig = fl['src/server/migrations.js'] || '', srv = fl['server.js'] || '';
    const reloads = /usageHistory\.reloadEvents\?\.\(\)/.test(srv);
    for (const [f, txt] of Object.entries(fl)) {
      if (!(f.startsWith('src/') || (f.startsWith('scripts/') && !/^scripts\/test-/.test(f))) || f === 'src/usage-history.js' || f === 'src/usage-hold-road.js' /* r11: its hold road, the same owner */ || FIXTURE_WRITERS.includes(f) || !writes(txt)) continue; // scripts/test-* write their own fixture ledgers (and boot-shape.mjs the boot gate's, into a scratch tree — B-1319; usage-shape-fixture.mjs the Usage suites', into the caller's scratch dataDir — B-f95d ②)
      if (/usage-index|telemetry|otel|usage-routes|usage-index-model|usage-cold/.test(f)) continue; // read or own other files
      const base = path.basename(f, '.js');
      if (!(mig.includes(base) && reloads)) bad.push(`${f} rewrites ledger shards outside the ONE invalidation (a migration + server.js reloadEvents)`);
    }
    return bad;
  };
  const scriptFiles = Object.fromEntries(fs.readdirSync(path.join(REPO, 'scripts')).filter((f) => /\.(m?js|cjs)$/.test(f)).map((f) => ['scripts/' + f, fs.readFileSync(path.join(REPO, 'scripts', f), 'utf8')]));
  const allFiles = { ...files, ...scriptFiles };
  const writerRows = Object.keys(allFiles).filter((f) => (f.startsWith('src/') || (f.startsWith('scripts/') && !/^scripts\/test-/.test(f))) && !FIXTURE_WRITERS.includes(f) && writes(allFiles[f]));
  console.log('     shard writers (src/ + scripts/, every write door): ' + writerRows.join(', '));
  eq(writerCensus(allFiles), [], '§32 (verify #7) every shard writer over src/ AND scripts/, through EVERY write door, is a migration the server follows with reloadEvents()');
  ok(writerCensus({ ...allFiles, 'scripts/rogue-fix.mjs': "await fs.promises.writeFile(path.join(historyDir, 'events-2026-01.ndjson'), x)" }).length === 1, 'control: a scripts/ writer through fs.promises.writeFile ⇒ RED');
  eq(writerCensus(files), [], '§17 every in-process shard writer (the repairs, backfills, purges) runs as a migration the server follows with usageHistory.reloadEvents()');
  ok(writerCensus({ ...files, 'src/rogue-ledger-fix.js': "fs.writeFileSync(path.join(dir, 'events-2026-01.ndjson'), x)" }).length === 1, 'control: a rogue shard writer outside the migrations ⇒ RED');
}

// §L11f (B-7e49, lane bl-tests-e, 主开发 r3965): THE TWIN's §L11 OVER A FRESHLY LOADED CACHE, IN THE FAST TIER. §L11 (every field of the
// ledger cache is COUNTED by a row of cacheCensus() or DECLARED with why it is no holder) reads, in the heavy twin, the cache §2's legs
// loaded and read. This reduced copy reads this file's own window right after its FIRST load: a field the LOAD makes with no row and no
// reason is red at every push (a field only a read, a trim or an absorb pass makes is §L11's, in the twin). Its two tables are the
// twin's, line for line (pinned below): a row added to one is added to both.
console.log('§L11f the fields of a freshly loaded ledger cache: each counted by a census row or declared');
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
  ok(keys.length > 0 && unknown.length === 0, `§L11f every field of a freshly loaded ledger cache is counted or declared (${keys.length} fields)${unknown.length ? ' — RED, no row and no reason: ' + unknown.join(', ') : ''}`);
  ok(missingRows.length === 0 && rows.has('usage remote id sets') && rows.has('usage cells') && Object.values(COUNTED).every((n) => !rows.has(n) || Number.isFinite(rows.get(n).ceiling)), '§L11f each counted structure is a census row WITH a ceiling — the cells and the remote per-month id sets included');
  const planted = { ...c, newIndex: new Map() };
  ok(Object.keys(planted).filter((k) => !(k in COUNTED) && !(k in DECLARED)).length === 1, 'CONTROL: a field planted in the freshly loaded cache with no row and no reason is RED by name');
  const tablesOf = (text) => { const opens = text.indexOf('  const COUNTED = {'); if (opens === -1) return null; const closes = text.indexOf('\n  };\n', opens); return closes === -1 ? null : text.slice(opens, closes + 6); };   // (names no span: the wall-clock census reads spans by name)
  const twinText = fs.readFileSync(path.join(REPO, 'scripts/test-cache-bounds-walks.mjs'), 'utf-8'), hereText = fs.readFileSync(new URL(import.meta.url), 'utf-8');
  ok(tablesOf(hereText) !== null && tablesOf(hereText) === tablesOf(twinText), '§L11f its COUNTED and DECLARED tables are the heavy twin §L11\'s, line for line');
  ok(tablesOf(editAnchor(twinText, "checkedAt: 'a scalar',", "checkedAt: 'a scalar', plantedField: 'a scalar',", 'scripts/test-cache-bounds-walks.mjs')) !== tablesOf(hereText), 'RED CONTROL: a twin table with one more row is not this file\'s — the pin goes red');
}

// ── §T THE TWIN HOLDS THE MOVED LEGS (B-7e49, lane bl-tests-e, 主开发 r2522: a leg cannot fall between the two files) ─────────────
// §2, §6–§11, §13–§19, §25–§31 and §L11 moved VERBATIM to the heavy twin scripts/test-cache-bounds-walks.mjs: they run the ledger over a synthesized month
// (fold workers, deadlines, paced waits) — about 14 s of this file's 16 (r3's shard-writer census stays here). This file runs none of them. RED: a twin with r3's heading
// gone is no longer the moved legs.
console.log('§T the heavy twin holds the moved legs');
{
  const twinRel = 'scripts/test-cache-bounds-walks.mjs';
  const twin = fs.existsSync(path.join(REPO, twinRel)) ? fs.readFileSync(path.join(REPO, twinRel), 'utf-8') : '';
  const here = fs.readFileSync(new URL(import.meta.url), 'utf-8');
  const MOVED = ['§2 parity: a small window answers', '§6–§11 r2: the cold walk off the loop', '§13–§19 r3: no loop fold', '§25–§31 r4: the person is told', 'async function compare(tag)', 'function prep30()', '§31 THE STEPPED BOOT WARM', '§L11 every structure the ledger holds is a census row'];
  const holds = (t) => MOVED.every((h) => t.includes(h));
  ok(holds(twin) && MOVED.every((h) => here.split(h).length === 2), '§T the heavy twin holds §2, §6–§11, §13–§19, §25–§31 and §L11 — their headings, the parity compare, the month of §30, the stepped warm — and this file runs none of them');
  ok(/\{ name: 'test-cache-bounds-walks', tier: 'heavy',/.test(fs.readFileSync(path.join(REPO, 'scripts/ci.mjs'), 'utf-8')), '§T the twin is a HEAVY row of the tier');
  ok(!holds(twin.replace(MOVED[2], '§13 (gone)')), 'RED CONTROL — a twin whose r3 heading is gone is no longer the moved legs: §T goes red');
}
fs.rmSync(tmp, { recursive: true, force: true });

console.log(fail ? `✗ ${fail} failed, ${pass} passed` : `ALL PASS ${pass} passed`);
process.exit(fail ? 1 : 0);
