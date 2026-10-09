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
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { mutantCopies } from './mutant-copy.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const CB = require('../src/cache-bounds.js');
const { UsageHistory } = require('../src/usage-history.js');
const { costBetweenMulti } = require('../src/usage-anchors.js');
const MC = require('../src/memory-census.js');
// r4: a walk's answer carries asOf (its instant) — the parity legs compare the rest; _asOf keeps it for §31
const rawAA = UsageHistory.prototype.aggregateAsync;
UsageHistory.prototype.aggregateAsync = function (...a) { return rawAA.apply(this, a).then((x) => { if (!x || !('asOf' in x)) return x; const { asOf, ...r } = x; Object.defineProperty(r, '_asOf', { value: asOf }); return r; }); };
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } };
const eq = (a, b, m) => { const x = JSON.stringify(a), y = JSON.stringify(b); ok(x === y, m + (x === y ? '' : `\n     got  ${x.slice(0, 300)}\n     want ${y.slice(0, 300)}`)); };
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
/** The loop's longest stall, counting the gap still PENDING at stop() (verify #7: a same-task sync block). */
function lagProbe() {
  let last = performance.now(), max = 0;
  const iv = setInterval(() => { const n = performance.now(); max = Math.max(max, n - last - 5); last = n; }, 5);
  return { stop() { const n = performance.now(); max = Math.max(max, n - last - 5); clearInterval(iv); return max; } };
}

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

console.log('§3 the readers\' census');
const READERS = {
  'src/usage-history.js': 'owner — the hot rows, the cold columns, the streamed cold rows',
  'src/usage-anchors.js': 'columns — costBetweenMulti reads ts/acct/be/host/atype/model/tokens through _events + the _evCountUpTo version',
  'src/server/usage-pool-engine.js': 'columns — the 7-day dark taint reads host/acct/atype through _events',
  'src/usage-estimator.js': 'ids — ledgerKnowsId; the _evCache sets only for a ledger stub without it',
};
const NEEDLE = /\._events\(|\._evCache\b|\._loadEvents\(|\._sortedEvents\(|\._evCountUpTo\(|\b_allRows\(|\b(?:usageHistory|uh)\.(?:aggregate|rows)\(/;
function census(files) {
  const reds = [];
  for (const [f, text] of Object.entries(files)) {
    const lines = text.split('\n');
    lines.forEach((l, i) => {
      if (!NEEDLE.test(l) || /^\s*(\/\/|\*)/.test(l)) return;
      if (!READERS[f]) reds.push(`${f}:${i + 1} reads the ledger cache and is not a census row`);
      if (/_evCache\??\.events\b/.test(l) && f !== 'src/usage-history.js') reds.push(`${f}:${i + 1} reads the resident array (rows past the window are not there)`);
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
  eq([est._lineCache.size, est.lineCacheCensus().bytes], [3, 3 * per], 'the estimator lines are counted by file bytes');
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
  try { parses = 0; viaWorker = await t.aggregateAsync(q); var pw = parses; parses = 0; sync = t.aggregate(q); var ps = parses; } finally { JSON.parse = parse; }
  eq(viaWorker, sync, '§6 the route\'s fold (worker) answers the sync fold exactly');
  ok(pw === 0 && t._coldWalks >= 1, `§6 no cold line parsed on the main thread during aggregateAsync (${pw} parses, ${t._coldWalks} worker walk)`);
  ok(ps > 1000, `control: the sync fold parses ${ps} cold lines ON the loop ⇒ the same check is RED for it`);
  // §7: a mid-walk append / a due slide / a shrink — the answer = the sync answer after
  const before1 = t.aggregate({});
  const appendHook = () => { t.walkHook = null; writeRows(t.dir, [mkRow(NOW - 3600e3), mkRow(NOW - 120 * DAY)]); t._evCache.checkedAt = 0; t._loadEvents(); };
  t.walkHook = appendHook; const a1 = await t.aggregateAsync({}); eq(a1.totals, before1.totals, '§7 an append mid-walk (a fresh row + a late OLD row): the answer is AS-OF the walk start (the sync answer at that instant)');
  ok(t.aggregate({}).totals.requests === before1.totals.requests + 2, '§7 …and the next answer has both rows');
  const before2 = t.aggregate({ from: NOW - 300 * DAY });
  t.walkHook = () => { t.walkHook = null; t.ledgerWindowMs = 20 * DAY; t._evCache.checkedAt = 0; writeRows(t.dir, [mkRow(NOW - 60e3)]); t._loadEvents(); };
  const a2 = await t.aggregateAsync({ from: NOW - 300 * DAY }); eq(a2.totals, before2.totals, '§7 a slide falling due mid-walk: the walk answers its own plan (as-of its start)');
  const shrink = () => { t.walkHook = null; const f = path.join(t.dir, fs.readdirSync(t.dir).filter((x) => x.startsWith('events-')).sort()[0]); const ls = fs.readFileSync(f, 'utf8').split('\n'); fs.writeFileSync(f, ls.slice(1).join('\n')); t._evCache.checkedAt = 0; t._loadEvents(); };
  t.walkHook = shrink; const a3 = await t.aggregateAsync({ to: NOW }); eq(a3.totals, t.aggregate({ to: NOW }).totals, '§7 a shard shrink mid-walk: the worker reads STALE places, the cache rebuilds, the worker re-runs — the sync answer');
  { // control (no re-run): the fold of a walk planned BEFORE the shrink, answered as is
    t._loadEvents(); const cc = t._evCache, h0 = cc.events.length, tss = new Float64Array(h0), locs = new Float64Array(h0);
    for (let i = 0; i < h0; i++) { tss[i] = cc.events[i].ts || 0; locs[i] = cc.locs[i]; }
    const walk = t._coldWalk(null, NOW - 1);
    shrink();
    const rh = new Float64Array(h0); for (let i = 0; i < h0; i++) rh[i] = cc.hrh[i];
    const MW = mutantCopies('cachebounds-walk', REPO);
    const walkSrc = fs.readFileSync(path.join(REPO, 'src/usage-cold-walk.js'), 'utf8');
    const unverified = walkSrc.replace("if (idHash(line) !== rh) throw stale(where + ' holds another line');", '').replace("if (!ev || (ev.ts || 0) !== ts) throw stale(where + ' holds another row');", '').replace("let ev; try { ev = JSON.parse(line); } catch { throw stale(where + ' is not a row'); }", 'let ev; try { ev = JSON.parse(line); } catch { ev = {}; }').replace("if (o > 0 && buf[o - base - 1] !== 10) throw stale(`${path.basename(fp)}@${o} does not start a line`);", '');
    const UW = MW.load('src/usage-cold-walk.js', unverified, 'noverify');
    let n3 = 0; for (const ev of UW.coldRows(walk)) if (ev && ev.ts) n3++;
    let staleSeen = false; try { for (const ev of require('../src/usage-cold-walk.js').coldRows(walk)) void ev; } catch (e) { staleSeen = e.code === 'STALE'; }
    ok(staleSeen, '§17 (verify #10) the real reader refuses the stale places (STALE), never folds a fragment');
    const c3 = { totals: { requests: n3 } }, want3 = { requests: [...t.rows(null, NOW - 1)].length };
    ok(c3.totals.requests !== want3.requests, `control (an unverified reader over the stale plan): ${c3.totals.requests} rows ≠ ${want3.requests} ⇒ RED`);
  }
  // §8: single-flight + one walk at a time
  let live = 0, peak = 0; const w0 = t._coldWalks;
  t.walkHook = async () => { live++; peak = Math.max(peak, live); await new Promise((r) => setTimeout(r, 20)); live--; };
  const four = await Promise.all([1, 2, 3, 4].map(() => t.aggregateAsync({ to: NOW - DAY })));
  const two = await Promise.all([t.aggregateAsync({ to: NOW - 2 * DAY }), t.aggregateAsync({ to: NOW - 3 * DAY, backend: 'claude' })]);
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
{
  const t = mkUh('r3', 40 * DAY, 60 * 1024);
  fs.mkdirSync(t.dir, { recursive: true });
  writeRows(t.dir, all.filter((e) => typeof e.i !== 'string'));
  t.warm();
  let allRowsCalls = 0; const realAll = t._allRows.bind(t); t._allRows = function* (...a) { allRowsCalls++; yield* realAll(...a); };
  const probe = lagProbe();
  // §13 (verify #0/#9): appends on EVERY try — one walk, as-of its start, never a loop fold
  const q = { pivots: [['day', 'account']] }, sync0 = t.aggregate(q); allRowsCalls = 0;
  t.walkHook = () => { writeRows(t.dir, [mkRow(NOW - 1000)]); t._evCache.checkedAt = 0; t._loadEvents(); };
  const a = await t.aggregateAsync(q); t.walkHook = null;
  const stall = probe.stop();
  eq(a, sync0, '§13 appends on every try: the answer = the sync answer at the walk start');
  ok(allRowsCalls === 0 && stall < 100, `§13 no fold of the ledger on the loop (_allRows ×${allRowsCalls}), longest stall ${Math.round(stall)} ms`);
  // rewrites on every try ⇒ the worker re-runs (≤ 3), then an ERROR — still never the loop
  const swapTwo = () => { const f = path.join(t.dir, fs.readdirSync(t.dir).filter((x) => x.startsWith('events-')).sort()[0]); const ls = fs.readFileSync(f, 'utf8').split('\n'); [ls[0], ls[1]] = [ls[1], ls[0]]; fs.writeFileSync(f, ls.join('\n')); t._evCache.checkedAt = 0; t._loadEvents(); };
  t.walkHook = swapTwo; let err13 = null; allRowsCalls = 0;
  try { await t.aggregateAsync({ to: NOW - 2 }); } catch (e) { err13 = e; } t.walkHook = null;
  ok(err13 && err13.code === 'STALE' && allRowsCalls === 0, `§13 a shard rewritten under EVERY try ⇒ ${err13 && err13.code}: "${err13 && err13.message.slice(0, 60)}…", the loop never folded`);
  const M = mutantCopies('cachebounds-uh', REPO);
  const uhSrc = fs.readFileSync(path.join(REPO, 'src/usage-history.js'), 'utf8');
  const r2rung = uhSrc.replace("throw Object.assign(new Error('the usage ledger was rewritten during the read twice (' + e.message + ') — retry'), { code: 'STALE' });", 'return this.aggregate(opts); // r2: the last rung folded on the loop');
  const UH2 = M.load('src/usage-history.js', r2rung, 'r2rung').UsageHistory;
  const t2 = new UH2({ dataDir: path.join(tmp, 'r3'), homeDir: tmp }); t2.ledgerWindowMs = 40 * DAY; t2.ledgerHotMaxBytes = 60 * 1024; t2.warm();
  let n2 = 0; const real2 = t2._allRows.bind(t2); t2._allRows = function* (...x) { n2++; yield* real2(...x); };
  t2.walkHook = () => { const f = path.join(t2.dir, fs.readdirSync(t2.dir).filter((x) => x.startsWith('events-')).sort()[0]); const ls = fs.readFileSync(f, 'utf8').split('\n'); [ls[0], ls[1]] = [ls[1], ls[0]]; fs.writeFileSync(f, ls.join('\n')); t2._evCache.checkedAt = 0; t2._loadEvents(); };
  await t2.aggregateAsync({ to: NOW - 3 }).catch(() => null); t2.walkHook = null;
  ok(r2rung !== uhSrc && n2 > 0, `control (the r2 last rung): the ledger folded on the loop ×${n2} ⇒ RED`);
  // §14 (verify #1/#12): a worker that runs out of memory ⇒ an error, fast; the next request gets a new worker
  // (a fold worker that allocates 200 MB under a 32 MB cap — a cap below ~16 MB kills the WHOLE process while
  // V8 deserializes the isolate, measured: never set one that low)
  const oom = path.join(tmp, 'oom-worker.js');
  fs.writeFileSync(oom, `const { parentPort } = require('worker_threads'); parentPort.on('message', (m) => { if (!m || m.op !== 'fold') return; const a = []; for (let i = 0; i < 200; i++) a.push(new Array(131072).fill(i)); parentPort.postMessage({ ev: 'done', answer: { totals: { requests: a.length }, groups: {} }, missing: 0, missingShards: [] }); });`);
  t.coldWorkerFile = oom; t.coldWorkerHeapMb = 32; let err14 = null; const t0 = Date.now(); allRowsCalls = 0;
  try { await t.aggregateAsync({ to: NOW - 4 }); } catch (e) { err14 = e; }
  const took14 = Date.now() - t0; t.coldWorkerHeapMb = 0; t.coldWorkerFile = null;
  ok(err14 && /memory|exited|failed/.test(err14.message) && allRowsCalls === 0 && took14 < 3000 && t._evCache.walking === 0, `§14 a worker out of memory ⇒ "${err14 && err14.message}" in ${took14} ms, no loop fold, the walk released`);
  ok(JSON.stringify((await t.aggregateAsync({ to: NOW - 5 })).totals) === JSON.stringify(t.aggregate({ to: NOW - 5 }).totals), '§14 the next request starts a NEW worker and answers');
  const fb = uhSrc.replace("      throw e;\n    } finally { if (c.walking > 0) c.walking--; }", "      return this.aggregate(opts); // the r2 fallback\n    } finally { if (c.walking > 0) c.walking--; }");
  const UHf = M.load('src/usage-history.js', fb, 'fallback').UsageHistory;
  const tf = new UHf({ dataDir: path.join(tmp, 'r3'), homeDir: tmp }); tf.ledgerWindowMs = 40 * DAY; tf.ledgerHotMaxBytes = 60 * 1024; tf.warm(); tf.coldWorkerHeapMb = 32; tf.coldWorkerFile = oom;
  let nf = 0; const realf = tf._allRows.bind(tf); tf._allRows = function* (...x) { nf++; yield* realf(...x); };
  await tf.aggregateAsync({ to: NOW - 6 }).catch(() => null);
  ok(fb !== uhSrc && nf > 0, `control (the r2 sync fallback on a worker death): folded on the loop ×${nf} ⇒ RED`);
  // the cap binds under a parent --max-old-space-size (execArgv [])
  const child = (src) => spawnSync(process.execPath, ['--max-old-space-size=4096', '--input-type=module', '-e', src], { encoding: 'utf8', timeout: 60000 });
  const body = (file) => `import { createRequire } from 'node:module'; const require = createRequire(${JSON.stringify(path.join(REPO, 'scripts/x.js'))}); const { UsageHistory } = require(${JSON.stringify(file)}); const u = new UsageHistory({ dataDir: ${JSON.stringify(path.join(tmp, 'r3'))}, homeDir: ${JSON.stringify(tmp)} }); u.ledgerWindowMs = ${40 * DAY}; u.ledgerHotMaxBytes = ${60 * 1024}; u.warm(); u.coldWorkerHeapMb = 4; u.coldWorkerFile = WORKER_FILE; u.aggregateAsync({ to: ${NOW - 7} }).then(() => console.log('ANSWERED'), (e) => console.log('REFUSED ' + e.message));`;
  const withCap = child(body(path.join(REPO, 'src/usage-history.js')).replace('WORKER_FILE', 'null'));
  ok(/REFUSED .*memory/.test(withCap.stdout), `§14 under a parent --max-old-space-size=4096 the fold's 4 MB cap still binds (the soft cap) (${(withCap.stdout || withCap.stderr).trim().slice(0, 80)})`);
  const wSrc = fs.readFileSync(path.join(REPO, 'src/usage-cold-worker.js'), 'utf8');
  const noSoft = M.write('src/usage-cold-worker.js', wSrc.replace("if (capBytes && ++n % 2000 === 0 && v8.getHeapStatistics().used_heap_size > capBytes) throw", "if (false) throw"), 'nosoftcap');
  const without = child(body(path.join(REPO, 'src/usage-history.js')).replace('WORKER_FILE', JSON.stringify(noSoft)));
  ok(/ANSWERED/.test(without.stdout), `control (resourceLimits alone, no soft cap): the parent's flag lifts the cap, the fold answers (${(without.stdout || without.stderr).trim().slice(0, 60)}) ⇒ RED`);
  // §15 (verify #2): a worker that never answers ⇒ the deadline frees the queue
  const hung = path.join(tmp, 'hung-worker.js');
  fs.writeFileSync(hung, `const { parentPort } = require('worker_threads'); parentPort.on('message', () => {}); setTimeout(() => process.exit(0), 4000);`);
  t.coldWorkerFile = hung; t.coldFoldDeadlineMs = 300;
  const p1 = t.aggregateAsync({ to: NOW - 8 }).then(() => 'answered', (e) => e.code);
  const p2 = t.aggregateAsync({ to: NOW - 9 }).then(() => 'answered', (e) => e.code);
  const p3 = t.aggregateAsync({ from: NOW - 3600e3 }).then((x) => 'hot ' + x.totals.requests);
  const r15 = await Promise.all([p1, p2, p3]);
  t.coldWorkerFile = null;
  eq(r15.slice(0, 2), ['DEADLINE', 'DEADLINE'], '§15 a hung fold passes its deadline: terminated, every waiter told, the queue moves on');
  ok(/^hot \d+/.test(r15[2]), '§15 a hot-only query is never wedged behind it');
  t.coldFoldDeadlineMs = 1e9; t.coldWorkerFile = hung;
  const pc = t.aggregateAsync({ to: NOW - 10 }).then(() => 'answered', (e) => e.code);
  const raced = await Promise.race([pc, new Promise((r) => setTimeout(() => r('still waiting'), 1000))]);
  ok(raced === 'still waiting', `control (no deadline): after 1 s the fold is ${raced} ⇒ RED`);
  await pc; t.coldWorkerFile = null; t.coldFoldDeadlineMs = 0;
  // §16 (verify #13): a shard vanishes under the walk ⇒ answered, the rows counted + said; the next read rebuilds
  const shards = fs.readdirSync(t.dir).filter((x) => x.startsWith('events-')).sort();
  const victim = path.join(t.dir, shards[1]), keep = fs.readFileSync(victim);
  t.walkHook = () => { t.walkHook = null; fs.unlinkSync(victim); };
  const a16 = await t.aggregateAsync({ to: NOW - 11 });
  ok(a16.partial && a16.partial.missingRows > 0 && a16.partial.shards[0] === shards[1], `§16 a vanished shard: answered without its ${a16.partial && a16.partial.missingRows} rows, said in the result`);
  eq((await t.aggregateAsync({ to: NOW - 12 })).totals, t.aggregate({ to: NOW - 12 }).totals, '§16 the next read rebuilt from the directory (no ENOENT loop)');
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
  eq([(await t.aggregateAsync({ to: NOW - 13 })).totals, [...t.rows()].length], [t.aggregate({ to: NOW - 13 }).totals, truth()], '§17 a SAME-SIZE rewrite ⇒ rebuilt, the numbers = a fresh cache');
  fs.writeFileSync(f17, JSON.stringify(mkRow(NOW - 199 * DAY)) + '\n' + fs.readFileSync(f17, 'utf8')); // grown, but not by an append
  t._evCache.checkedAt = 0; t._loadEvents();
  eq((await t.aggregateAsync({ to: NOW - 14 })).totals, t.aggregate({ to: NOW - 14 }).totals, '§17 a GROWN rewrite (a line put at the top) ⇒ the append-only proof fails, rebuilt');
  const n17 = [...t.rows()].length;
  fs.appendFileSync(path.join(t.dir, shards[shards.length - 1]), '{"ts":' + (NOW - 100) + ',"rid":"torn');
  t._evCache.checkedAt = 0; t._loadEvents();
  ok([...t.rows()].length === n17, '§17 a torn tail (no newline) is never a row');
  // the ONE invalidation: every in-process shard writer is a migration the server follows with reloadEvents()
  // r4 (verify #7): EVERY write door — sync, promises, callbacks, streams, an open with a write flag, the atomic helpers
  const WRITE_DOOR = /\b(writeFileSync|appendFileSync|renameSync|_writeAtomic|writeJsonAtomic|writeAtomic|createWriteStream|copyFileSync|truncateSync|ftruncateSync)\(|\b(?:fs\.promises|fsp|promises)\.(?:writeFile|rename|appendFile|copyFile|truncate)\(|\bfs\.(?:writeFile|rename|appendFile|truncate)\(|\bopen(?:Sync)?\([^)]*['"](?:w|a|r\+|wx|ax)\+?['"]/;
  const writes = (txt) => /events-[^'"`]*ndjson|_shardFor\(|shardNames|historyDir/.test(txt) && WRITE_DOOR.test(txt);
  const writerCensus = (fl) => {
    const bad = [];
    const mig = fl['src/server/migrations.js'] || '', srv = fl['server.js'] || '';
    const reloads = /usageHistory\.reloadEvents\?\.\(\)/.test(srv);
    for (const [f, txt] of Object.entries(fl)) {
      if (!(f.startsWith('src/') || (f.startsWith('scripts/') && !/^scripts\/test-/.test(f))) || f === 'src/usage-history.js' || !writes(txt)) continue; // scripts/test-* write their own fixture ledgers
      if (/usage-index|telemetry|otel|usage-routes|usage-index-model|usage-cold/.test(f)) continue; // read or own other files
      const base = path.basename(f, '.js');
      if (!(mig.includes(base) && reloads)) bad.push(`${f} rewrites ledger shards outside the ONE invalidation (a migration + server.js reloadEvents)`);
    }
    return bad;
  };
  const scriptFiles = Object.fromEntries(fs.readdirSync(path.join(REPO, 'scripts')).filter((f) => /\.(m?js|cjs)$/.test(f)).map((f) => ['scripts/' + f, fs.readFileSync(path.join(REPO, 'scripts', f), 'utf8')]));
  const allFiles = { ...files, ...scriptFiles };
  const writerRows = Object.keys(allFiles).filter((f) => (f.startsWith('src/') || (f.startsWith('scripts/') && !/^scripts\/test-/.test(f))) && writes(allFiles[f]));
  console.log('     shard writers (src/ + scripts/, every write door): ' + writerRows.join(', '));
  eq(writerCensus(allFiles), [], '§32 (verify #7) every shard writer over src/ AND scripts/, through EVERY write door, is a migration the server follows with reloadEvents()');
  ok(writerCensus({ ...allFiles, 'scripts/rogue-fix.mjs': "await fs.promises.writeFile(path.join(historyDir, 'events-2026-01.ndjson'), x)" }).length === 1, 'control: a scripts/ writer through fs.promises.writeFile ⇒ RED');
  eq(writerCensus(files), [], '§17 every in-process shard writer (the repairs, backfills, purges) runs as a migration the server follows with usageHistory.reloadEvents()');
  ok(writerCensus({ ...files, 'src/rogue-ledger-fix.js': "fs.writeFileSync(path.join(dir, 'events-2026-01.ndjson'), x)" }).length === 1, 'control: a rogue shard writer outside the migrations ⇒ RED');
  // §18 (verify #4/#15): a hash hit is a candidate — the string at the place decides
  const cc = t._evCache; cc.cold.settle();
  const someLoc = cc.cold.sh[0] * 4294967296 + cc.cold.off[0];
  cc.cold.idx.rid.put(CB.idHash('req_collides'), someLoc); cc.cold.idx.mid.put(CB.idHash('msg_collides'), someLoc); for (const k of ['rid', 'mid']) cc.cold.idx[k].settle();
  const before18 = t.aggregate({}).totals.requests;
  writeRows(t.dir, [{ ...mkRow(NOW - 50 * DAY), rid: 'req_collides', mid: 'msg_collides2' }]); cc.checkedAt = 0; t._loadEvents();
  ok(t.aggregate({}).totals.requests === before18 + 1 && !t.ledgerKnowsId('msg_collides'), '§18 a row whose rid HASH hits another row loads and counts; a hashed-only mid is not "known"');
  const r2hash = uhSrc.replace("for (const loc of c.cold.idx.rid.findSorted(CB.idHash(ev.rid))) if (this._rowAt(c, loc)?.rid === ev.rid) return 0;", 'if (c.cold.idx.rid.findSorted(CB.idHash(ev.rid)).length) return 0;');
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
  const six = [1, 2, 3, 4, 5, 6].map((k) => t.aggregateAsync({ to: NOW - 20 - k }, k === 3 ? { signal: ac.signal } : {}).then(() => 'ok', (e) => e.code));
  ac.abort();
  const r19 = await Promise.all(six); t.walkHook = null;
  eq(r19, ['ok', 'ok', 'ABORTED', 'ok', 'BUSY', 'BUSY'], '§19 6 distinct keys: 4 queued (one left before its turn), 2 refused at once');
  t.ledgerWindowMs = 60e3; t._evCache.checkedAt = 0; writeRows(t.dir, [mkRow(NOW - 500)]); t._loadEvents();
  ok(t._evCache.walking === 0 && t._evCache.cutoff > cut19, '§19 between walks the slide runs (the queue never blocks the trim)');
  // §21 (verify #6): a hot-only range: no worker, no disk
  const t21 = mkUh('r3', 40 * DAY, 60 * 1024); t21.warm();
  const dr = spyReads();
  let a21; try { a21 = await t21.aggregateAsync({ from: NOW - 3600e3 }); } finally { dr.restore(); }
  ok(a21.totals.requests >= 1 && !t21._coldWalks && dr.bytes === 0, `§21 a today query: no worker (${t21._coldWalks || 0}), ${dr.bytes} B read from disk`);
  // §22: a hot row with no place is folded from memory
  const evF = mkRow(NOW - 2 * DAY); t._take(t._evCache, evF, 300, 5, 100, new Set());
  const a22 = await t.aggregateAsync({ to: NOW }); eq(a22.totals.requests, t.aggregate({ to: NOW }).totals.requests, '§22 a fenced row (shard 300) stays hot, folded from memory by the worker');
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
  const a25 = await t4.aggregateAsync({ to: NOW - 31 });
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
  const a31 = await t4.aggregateAsync({ to: NOW - 32 });
  ok(Number.isFinite(a31._asOf) && a31._asOf <= Date.now(), '§31 a walk answer carries asOf (its plan instant)');
  const lag = N.ledgerNote({ asOf: Date.now() - 5 * 60e3 }), fresh = N.ledgerNote({ asOf: Date.now() - 1000 });
  ok(lag.length === 1 && lag[0].kind === 'asof' && !fresh.length, '§31 the window says "As of hh:mm" past a minute behind, not for a fresh answer');
  ok(!N.ledgerNote({}).length, 'control (no asOf in the answer): nothing to show ⇒ RED');
  // §29 (verify #4): rewrites on every try ⇒ ONE rebuild, then the error
  const tries = [];
  t4.walkHook = (k) => { tries.push(k); const f = path.join(t4.dir, sh4[0]); const ls = fs.readFileSync(f, 'utf8').split('\n'); [ls[0], ls[1]] = [ls[1], ls[0]]; fs.writeFileSync(f, ls.join('\n')); t4._evCache.checkedAt = 0; t4._loadEvents(); };
  let e29 = null; try { await t4.aggregateAsync({ to: NOW - 33 }); } catch (e) { e29 = e; } t4.walkHook = null;
  ok(e29 && e29.code === 'STALE' && JSON.stringify(tries) === '[0,1]', `§29 a rewrite on every try: tries ${JSON.stringify(tries)} (one rebuild), then "${e29 && e29.message.slice(0, 50)}…"`);
  const M4 = mutantCopies('cachebounds-r4', REPO), uhSrc4 = fs.readFileSync(path.join(REPO, 'src/usage-history.js'), 'utf8');
  const r3ladder = uhSrc4.replace('if (tries < 1) return this._aggregateWalk(opts, tries + 1);', 'if (tries < 2) return this._aggregateWalk(opts, tries + 1);');
  const t3l = new (M4.load('src/usage-history.js', r3ladder, 'r3ladder').UsageHistory)({ dataDir: path.join(tmp, 'r4'), homeDir: tmp }); t3l.ledgerWindowMs = 40 * DAY; t3l.ledgerHotMaxBytes = 60 * 1024; t3l.warm();
  const tries3 = [];
  t3l.walkHook = (k) => { tries3.push(k); const f = path.join(t3l.dir, sh4[0]); const ls = fs.readFileSync(f, 'utf8').split('\n'); [ls[0], ls[1]] = [ls[1], ls[0]]; fs.writeFileSync(f, ls.join('\n')); t3l._evCache.checkedAt = 0; t3l._loadEvents(); };
  await t3l.aggregateAsync({ to: NOW - 34 }).catch(() => null);
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
  await t4.aggregateAsync({ to: NOW - 35 });
  ok(t4._evCache !== before27 && costAt(t4) === truth27, `§27 the next fold reads the edited line, its WHOLE-line hash says STALE, the cache rebuilds: the money readers answer the NEW value (${oldCost.toFixed(4)} → ${costAt(t4).toFixed(4)})`);
  // §26 (verify #2): a fold worker blocked in a read is STUCK — counted, said, no second worker, resume on release
  const fifo = path.join(tmp, 'ledger.fifo'); spawnSync('mkfifo', [fifo]);
  const blocked = path.join(tmp, 'blocked-worker.js');
  fs.writeFileSync(blocked, `const fs = require('fs'); const { parentPort } = require('worker_threads'); parentPort.on('message', (m) => { if (m && m.op === 'fold') fs.readFileSync(${JSON.stringify(fifo)}); });`);
  const release = () => { const fd = fs.openSync(fifo, 'w'); fs.writeSync(fd, 'x'); fs.closeSync(fd); };
  const until = async (fn, ms = 5000) => { const end = Date.now() + ms; while (!fn() && Date.now() < end) await new Promise((r) => setTimeout(r, 25)); return fn(); };
  t4.coldWorkerFile = blocked; t4.coldFoldDeadlineMs = 300; t4.coldTerminateDeadlineMs = 300;
  const w26 = t4._coldWalks;
  const e1 = await t4.aggregateAsync({ to: NOW - 40 }).then(() => null, (e) => e);
  const tq = Date.now(); const e2 = await t4.aggregateAsync({ to: NOW - 41 }).then(() => null, (e) => e); const took2 = Date.now() - tq;
  const row26 = t4.cacheCensus().find((x) => x.name === 'usage fold workers stuck');
  ok(e1 && e1.code === 'DEADLINE' && e2 && e2.code === 'STUCK' && /1 fold worker\(s\) stuck/.test(e2.message) && took2 < 200 && t4._coldWalks - w26 === 1 && row26 && row26.count === 1, `§26 a worker blocked in a read: DEADLINE once, then "${e2 && e2.message.slice(0, 60)}…" at once (${took2} ms), 1 worker spawned, the census counts it`);
  t4.coldWorkerFile = null; release();
  await until(() => !t4.cacheCensus().some((x) => x.name === 'usage fold workers stuck'));
  const a26 = await t4.aggregateAsync({ to: NOW - 42 }).then((x) => x, (e) => e);
  ok(a26 && a26.totals && !t4.cacheCensus().some((x) => x.name === 'usage fold workers stuck'), '§26 released: the stuck worker exited, the count dropped, folds resume');
  const r3stuck = uhSrc4.replace("if (STUCK.size) return Promise.reject(", "if (false) return Promise.reject(");
  const ts3 = new (M4.load('src/usage-history.js', r3stuck, 'r3stuck').UsageHistory)({ dataDir: path.join(tmp, 'r4'), homeDir: tmp }); ts3.ledgerWindowMs = 40 * DAY; ts3.ledgerHotMaxBytes = 60 * 1024; ts3.warm();
  ts3.coldWorkerFile = blocked; ts3.coldFoldDeadlineMs = 300; ts3.coldTerminateDeadlineMs = 300;
  await ts3.aggregateAsync({ to: NOW - 43 }).catch(() => null); await ts3.aggregateAsync({ to: NOW - 44 }).catch(() => null);
  ok(r3stuck !== uhSrc4 && ts3._coldWalks === 2, `control (no stuck refusal, r3): ${ts3._coldWalks} blocked workers alive at once ⇒ RED`);
  release(); release(); await new Promise((r) => setTimeout(r, 300));
  t4.coldFoldDeadlineMs = 0; t4.coldTerminateDeadlineMs = 0;
}
{ // §30 (verify #5): a month bigger than the fold's soft cap folds in row-budget chunks
  const t5 = mkUh('r4big', 40 * DAY, 60 * 1024);
  fs.mkdirSync(t5.dir, { recursive: true });
  const base5 = Date.UTC(new Date(NOW - 120 * DAY).getUTCFullYear(), new Date(NOW - 120 * DAY).getUTCMonth(), 2);
  const rows5 = []; for (let k = 0; k < 120000; k++) rows5.push(JSON.stringify({ ...mkRow(base5 + k * 10000), pad: 'p'.repeat(200) }));
  fs.writeFileSync(path.join(t5.dir, shardOf(base5)), rows5.join('\n') + '\n');
  t5.warm(); t5.coldWorkerHeapMb = 30;
  t5.coldRowBudget = 5000; const ok5 = await t5.aggregateAsync({ to: NOW - 100 * DAY }).then((x) => x.totals.requests, (e) => e.message);
  ok(ok5 === 120000, `§30 a ${Math.round(fs.statSync(path.join(t5.dir, shardOf(base5))).size / 1048576)} MB month under a 30 MB soft cap, 5 000-row chunks: ${ok5}`);
  t5.coldRowBudget = 1e9; const bad5 = await t5.aggregateAsync({ to: NOW - 101 * DAY }).then(() => 'answered', (e) => e);
  ok(bad5 && bad5.code === 'FOLD_TOO_BIG' && /retrying will not help/.test(bad5.message) && !/retry$/.test(bad5.message), `control (the whole-group read): "${bad5.message && bad5.message.slice(0, 70)}…" ⇒ RED, and it does not say retry`);
}
fs.rmSync(tmp, { recursive: true, force: true });

console.log(fail ? `✗ ${fail} failed, ${pass} passed` : `ALL PASS ${pass} passed`);
process.exit(fail ? 1 : 0);
