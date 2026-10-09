#!/usr/bin/env node
// lane server-memory-census (B-9428 step (c)): THE SERVER MEMORY CENSUS — where the resident set goes without an
// inspector: the main heap, EVERY worker isolate's heap, external / ArrayBuffers, native. Fast, no server:
//   §1 PURE memoryCensus arithmetic (src/memory-census.js): native = anon − main − Σworkers − external clamped ≥ 0
//      (the clamp said as `over`), the sum identity, unknown workers counted as unknown (never 0), basis rss off Linux,
//      the smaps_rollup parser
//   §2 the telemetry rows: 3 metric rows (integer MB), ONE srv-mem-census event ≤ 1 KB whatever the worker count, and
//      the ndjson growth per 10 min measured with the production's 9 workers; the boot line
//   §3 askMemory over fake workers on FAKE timers: a silent worker is unknown at 2 s and never waited on; the sampler
//      joins a running sample, metrics every 5th / the event every 10th sample, the boot line once
//   §4 REAL threads: the three SafeFs pools (safe-fs, transcript, fs-canary) answer by name (`<pool>#k`), their own
//      calls still work; a patched safe-fs-worker copy WITHOUT the handler ⇒ unknown (the control)
//   §5 THE CENSUS over `new Worker(` sites: every creator in the server process tracks what it starts, every worker
//      script it starts answers first thing in its message loop, every creator's own handler skips the answer;
//      a planted site / a script without the handler ⇒ red by name
//   §6 the System window rows (censusRows) in en / zh / ja; the sampler's source: no sync fs, the /proc read async
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mutantCopies } from './mutant-copy.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const C = require('../src/memory-census.js');
const WM = require('../src/worker-memory.js');
const SAMPLER = require('../src/server/memory-sampler.js');
const { SafeFs } = require('../src/safe-fs.js');
const MB = 1048576;

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n); } };
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

// ── §1 THE ARITHMETIC ──
console.log('§1 memoryCensus arithmetic');
const SMAPS = ['55d0c0a00000-7ffd3b9fe000 ---p 00000000 00:00 0                          [rollup]', 'Rss:             1835008 kB', 'Pss:             1820000 kB',
  'Pss_Anon:        1700000 kB', 'Shared_Clean:      15000 kB', 'Private_Dirty:   1700000 kB', 'Anonymous:       1740800 kB', 'Swap:                  0 kB'].join('\n');
const sm = C.parseSmapsRollup(SMAPS);
ok(sm && sm.rss === 1835008 * 1024 && sm.anonymous === 1740800 * 1024 && sm.pss === 1820000 * 1024 && sm.sharedClean === 15000 * 1024,
  'parseSmapsRollup reads Rss / Pss / Anonymous / Shared_Clean in bytes (kB × 1024)');
ok(C.parseSmapsRollup('') === null && C.parseSmapsRollup(null) === null && C.parseSmapsRollup('garbage\nmore') === null, 'no smaps text (macOS, unreadable) ⇒ null, never a throw');
const main = { rss: 1835008 * 1024, heapTotal: 1000 * MB, heapUsed: 900 * MB, external: 40 * MB, arrayBuffers: 30 * MB, malloced: 2 * MB };
const workers = [
  { name: 'safe-fs#0', mem: { heapTotal: 10 * MB, heapUsed: 6 * MB, external: 1 * MB, arrayBuffers: 0 } },
  { name: 'safe-fs#1', mem: null },
  { name: 'search-index', mem: { heapTotal: 60 * MB, heapUsed: 40 * MB, external: 9 * MB, arrayBuffers: 4 * MB } },
];
const c = C.memoryCensus({ main, workers, smaps: sm, at: 5 });
ok(c.basis === 'anon' && c.base === 1740800 * 1024, 'the base is the anonymous resident memory when smaps is read');
ok(c.workerHeap === 70 * MB && c.workerHeapUsed === 46 * MB && c.external === 50 * MB && c.arrayBuffers === 34 * MB,
  `Σ answered workers' heapTotal / heapUsed, external = main + workers' (${c.workerHeap / MB} / ${c.workerHeapUsed / MB} / ${c.external / MB} MB)`);
ok(c.native === c.base - 1000 * MB - 70 * MB - 50 * MB && c.over === 0, `native = anon − main − workers − external (${(c.native / MB).toFixed(1)} MB)`);
ok(c.main.heap + c.workerHeap + c.external + c.native === c.base, 'THE SUM IDENTITY: main + workers + external + native === the base');
const ph = C.memoryCensus({ main: { ...main, physical: 700 * MB }, workers: [{ name: 'w', mem: { heapTotal: 10 * MB, physical: 4 * MB, heapUsed: 3 * MB } }], smaps: sm });
ok(ph.main.heap === 700 * MB && ph.main.heapTotal === 1000 * MB && ph.workerHeap === 4 * MB && ph.workers[0].heapTotal === 10 * MB && ph.native === ph.base - 700 * MB - 4 * MB - 40 * MB,
  'the heap part is the RESIDENT heap (v8 total_physical_size) when read — committed-but-untouched heapTotal is kept beside it, not summed');
ok(c.workerCount === 3 && c.workersKnown === 2 && c.workersUnknown === 1 && c.workers[1].state === 'unknown' && c.workers[1].heapTotal === null,
  'an unanswered worker is UNKNOWN — counted (3 workers, 1 unknown), its heap null, never 0');
const cl = C.memoryCensus({ main: { ...main, heapTotal: 1800 * MB }, workers, smaps: sm });
ok(cl.native === 0 && cl.over === 1800 * MB + 70 * MB + 50 * MB - cl.base, `native clamped ≥ 0; the excess said as over (${(cl.over / MB).toFixed(1)} MB)`);
ok(cl.main.heap + cl.workerHeap + cl.external + cl.native - cl.over === cl.base, 'the identity still holds with the clamp: parts − over === base');
const mac = C.memoryCensus({ main, workers: [], smaps: null });
ok(mac.basis === 'rss' && mac.base === main.rss && mac.smaps === null && mac.native === main.rss - 1000 * MB - 40 * MB, 'no smaps ⇒ basis rss, the parts add up to the RSS');
const junk = C.memoryCensus({ main: { rss: NaN, heapTotal: -5 }, workers: [null, { name: 'x', mem: { heapTotal: 'big' } }], smaps: null });
ok(junk.native === 0 && junk.workersUnknown === 2 && junk.main.heapTotal === 0, 'garbage numbers count as 0 / unknown, never NaN');

// ── §2 TELEMETRY ROWS ──
console.log('§2 the telemetry rows, the event bound, the boot line');
const rows = C.censusMetrics(c);
ok(rows.map((r) => r.name).join() === 'srv-worker-heap-mb,srv-external-mb,srv-native-mb' && rows.every((r) => Number.isInteger(r.value)) && rows[0].detail === 'unknown=1',
  `3 metric rows, integer MB, the unknown count on the worker row (${JSON.stringify(rows)})`);
ok(!('detail' in C.censusMetrics(C.memoryCensus({ main, workers: workers.filter((w) => w.mem), smaps: sm }))[0]), 'no unknown worker ⇒ no detail (no bytes spent)');
const PROD = ['safe-fs#0', 'safe-fs#1', 'safe-fs#2', 'safe-fs#3', 'transcript#0', 'transcript#1', 'fs-canary#0', 'search-index', 'usage-index'];
const prod = C.memoryCensus({ main, smaps: sm, workers: PROD.map((name) => ({ name, mem: { heapTotal: 12 * MB, heapUsed: 7 * MB, external: MB } })) });
const ev = C.censusEvent(prod);
const line = (e) => JSON.stringify({ ts: 1791496427338, ...e, version: '2.369.241' }) + '\n';
ok(ev.kind === 'event' && ev.name === 'srv-mem-census' && ev.value === 1792 && /^anon 1700 · main 900\/1000\/1000 · ext 49 · native \d+ · safe-fs#0 7\/12\/12 /.test(ev.detail) && ev.detail.includes('usage-index 7/12/12'),
  `ONE event: value = RSS MB, detail = the parts + name used/resident/total per worker (${ev.detail})`);
const tenMin = 2 * C.censusMetrics(prod).reduce((n, r) => n + line({ kind: 'metric', ...r }).length, 0) + line(ev).length;
ok(tenMin <= 1024, `the ndjson grows ${tenMin} B per 10 min with 9 workers (2 × 3 metric rows + 1 event; ≤ 1 KB)`);
const many = C.memoryCensus({ main, smaps: sm, workers: Array.from({ length: 300 }, (_, i) => ({ name: 'pool-with-a-long-name#' + i, mem: i % 7 ? { heapTotal: MB, heapUsed: MB } : null })) });
const evMany = C.censusEvent(many);
ok(evMany.detail.length <= C.EVENT_DETAIL_MAX && /\+\d+ more$/.test(evMany.detail) && line(evMany).length <= 1024, `300 workers: the detail stops at ${evMany.detail.length} chars ending "${evMany.detail.slice(-9)}", the row ${line(evMany).length} B ≤ 1 KB`);
ok(/^\[memory\] boot census: main heap 1000 MB, 3 workers 70 MB \(1 unknown\), external 50 MB, native \d+ MB, RSS 1792 MB \(anonymous 1700 MB = the parts\)$/.test(C.bootLine(c)),
  `the boot line: ${C.bootLine(c)}`);

// ── §3 FAKE WORKERS, FAKE TIMERS ──
console.log('§3 askMemory + the sampler on fake timers');
function fakeTimers() {
  let t = 0; const q = [];
  return { now: () => t, setTimeout: (fn, ms) => { const h = { at: t + ms, fn, live: true }; q.push(h); return h; }, clearTimeout: (h) => { if (h) h.live = false; },
    setInterval: (fn, ms) => ({ every: ms, fn }), clearInterval: () => { }, pending: () => q.filter((h) => h.live).length,
    advance(ms) { t += ms; for (const h of q.filter((x) => x.live && x.at <= t)) { h.live = false; h.fn(); } } };
}
function fakeWorker(answer) {
  const ls = new Set();
  return { posted: [], threadId: 7, on(ev, f) { if (ev === 'message') ls.add(f); }, off(ev, f) { ls.delete(f); }, once() { }, listeners: () => ls.size,
    postMessage(m) { this.posted.push(m); if (answer === 'throw') throw new Error('closed'); if (answer) queueMicrotask(() => { for (const f of [...ls]) f({ ev: 'memory', id: m.id, mem: answer }); }); } };
}
{
  const T = fakeTimers();
  const good = fakeWorker({ heapTotal: 9 * MB, heapUsed: 5 * MB, external: 0 }), silent = fakeWorker(null), dead = fakeWorker('throw');
  let settled = null;
  WM.askMemory([{ name: 'good', worker: good }, { name: 'silent', worker: silent }, { name: 'dead', worker: dead }], { timeoutMs: 2000, timers: T }).then((r) => { settled = r; });
  await new Promise((r) => setImmediate(r));
  ok(settled === null && good.posted[0].op === WM.MEMORY_OP && T.pending() === 1, 'the ask is posted to each worker; only the silent one still holds a 2 s timer');
  T.advance(1999); await new Promise((r) => setImmediate(r));
  ok(settled === null, 'at 1.999 s the silent worker is still asked');
  T.advance(1); await new Promise((r) => setImmediate(r));
  ok(Array.isArray(settled) && settled[0].mem.heapTotal === 9 * MB && settled[1].mem === null && settled[2].mem === null,
    'at 2 s: the answered row, the silent worker UNKNOWN, a worker that cannot be posted to UNKNOWN at once — never waited on');
  ok(good.listeners() === 0 && silent.listeners() === 0, 'each ask removes its own listener (answered or timed out)');
}
{
  const T = fakeTimers();
  const recs = [], logs = [];
  let asks = 0, release = null;
  const silent = fakeWorker(null);
  const s = SAMPLER.create({ record: (e) => recs.push(e), log: { log: (l) => logs.push(l) }, now: T.now, timers: T,
    readMainMemory: () => ({ rss: 500 * MB, heapTotal: 100 * MB, heapUsed: 80 * MB, external: 5 * MB, arrayBuffers: 1 * MB }),
    readSmapsText: () => SMAPS.replace('1740800', String(400 * 1024)),
    ask: (o) => { asks++; return WM.askMemory([{ name: 'silent#0', worker: silent }], { ...o, timers: T }); } });
  s.start();
  const again = s.sample();
  await new Promise((r) => setImmediate(r));
  ok(asks === 1, 'a sample asked while one runs JOINS it (one ask, never two at once)');
  T.advance(2000);
  const first = await again;
  ok(first.workers[0].state === 'unknown' && first.workersUnknown === 1 && first.basis === 'anon', 'a worker that never answers ⇒ unknown within the 2 s bound (fake timers, no real wait)');
  await new Promise((r) => setImmediate(r));
  ok(logs.length === 1 && /^\[memory\] boot census: main heap 100 MB, 1 workers 0 MB \(1 unknown\)/.test(logs[0]), `ONE boot line at start (${logs[0]})`);
  ok(s.latest() === first, 'latest() is the newest census (GET /api/sysinfo serverMemory)');
  for (let i = 1; i < 10; i++) { const p = s.sample(); await new Promise((r) => setImmediate(r)); T.advance(2000); await p; }
  const metrics = recs.filter((r) => r.kind === 'metric'), events = recs.filter((r) => r.kind === 'event');
  ok(metrics.length === 6 && events.length === 1 && events[0].name === 'srv-mem-census', `10 samples (10 min): ${metrics.length} metric rows (samples 0 and 5) + ${events.length} event (sample 0)`);
  ok(logs.length === 1, 'the boot line is said once, never per sample');
}

// ── §4 REAL THREADS ──
console.log('§4 real worker threads answer by name');
{
  const keep = setInterval(() => { }, 1000);
  const pools = [new SafeFs({ poolSize: 2 }),
    new SafeFs({ workerPath: path.join(REPO, 'src/transcript-worker.js'), poolSize: 1, name: 'transcript', inlineRun: require('../src/transcript-worker.js').runOp }),
    new SafeFs({ workerPath: path.join(REPO, 'src/server/fs-canary-worker.js'), poolSize: 1, name: 'fs-canary', inlineRun: require('../src/server/fs-canary-worker.js').runOp })];
  await pools[0].call('stat', { path: REPO });
  const got = await WM.askMemory(undefined, { timeoutMs: 5000 });
  const names = got.map((g) => g.name).sort().join();
  ok(names === 'fs-canary#0,safe-fs#0,safe-fs#1,transcript#0', `every live worker is tracked by name (${names})`);
  ok(got.every((g) => g.mem && g.mem.heapTotal > MB && g.mem.physical > MB && g.mem.heapUsed > 0 && g.mem.heapUsed <= g.mem.heapTotal), `each answers its OWN isolate's heap (${got.map((g) => g.name + ' ' + (g.mem.heapTotal / MB).toFixed(1)).join(', ')} MB)`);
  const st = await pools[0].call('stat', { path: REPO });
  ok(st && pools[0].stats().restarts === 0 && pools[0].stats().inflight === 0, 'the pool\'s own calls are untouched by the answers (no restart, nothing in flight)');
  const M = mutantCopies('memcensus', REPO);
  const src = read('src/safe-fs-worker.js');
  const cut = src.replace(/\n\s*if \(answerMemory\(msg, parentPort\)\) return;[^\n]*/, '');
  const copy = M.write('src/safe-fs-worker.js', cut, 'nohandler');
  const bad = new SafeFs({ workerPath: copy, poolSize: 1, name: 'control' });
  await bad.call('stat', { path: REPO }).catch(() => null);
  const ctl = (await WM.askMemory(WM.trackedWorkers().filter((e) => e.name === 'control#0'), { timeoutMs: 400 }))[0];
  ok(cut !== src && ctl && ctl.mem === null, 'CONTROL: a safe-fs-worker copy without the handler never answers ⇒ unknown (the handler is what answers)');
  for (const p of [...pools, bad]) p.close();
  clearInterval(keep);
}

// ── §5 THE CENSUS OVER new Worker( SITES ──
console.log('§5 the census: every worker started in the server process answers');
function walk(dir, out = []) {
  for (const e of fs.readdirSync(path.join(REPO, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'lib') walk(rel, out); }
    else if (/\.js$/.test(e.name)) out.push(rel);
  }
  return out;
}
const OTHER_PROCESS = { 'src/agentd/agentd.js': 'the device daemon (its own process, its own census)', 'src/agentd/worker-pool.js': 'the device daemon\'s pool (its own process)' };
function workerCensus(texts) {
  const bad = [], sites = [], scripts = new Set();
  const files = Object.keys(texts);
  const base = (f) => path.basename(f);
  for (const f of files) {
    const t = texts[f];
    if (/\bnew Worker\(/.test(t.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, ''))) {
      if (OTHER_PROCESS[f]) continue;
      sites.push(f);
      if (!/\btrackWorker\(/.test(t)) bad.push(`${f} starts a worker it never tracks`);
      if (!/\.ev === 'memory'\) return;/.test(t)) bad.push(`${f}'s own message handler does not skip the memory answer`);
      for (const m of t.matchAll(/'([\w.-]+-worker\.js)'/g)) scripts.add(m[1]);
    }
    for (const m of t.matchAll(/new SafeFs\(\{[^}]*?workerPath:\s*path\.join\([^)]*?'([\w.-]+-worker\.js)'\)/g)) scripts.add(m[1]);
  }
  const found = [];
  for (const s of scripts) {
    const f = files.find((x) => base(x) === s);
    if (!f) { bad.push(`${s} is started but not found`); continue; }
    found.push(f);
    const t = texts[f];
    const at = t.indexOf("parentPort.on('message', (msg) => {");
    const head = at < 0 ? '' : t.slice(at, at + 200);
    if (!/^parentPort\.on\('message', \(msg\) => \{\s*if \(answerMemory\(msg, parentPort\)\) return;/.test(head)) bad.push(`${f} does not answer the memory ask first thing in its message loop`);
  }
  return { bad, sites: sites.sort(), scripts: found.sort() };
}
const TEXTS = Object.fromEntries([...walk('src'), 'server.js'].map((f) => [f, read(f)]));
const wc = workerCensus(TEXTS);
ok(wc.sites.join() === 'src/safe-fs.js,src/server/search-index.js,src/server/usage-index.js,src/usage-history.js' /* + B-9428 r2: the ledger's cold fold */, `the server process's new Worker( sites (${wc.sites.join(', ')}); the device daemon's are its own process`);
ok(wc.scripts.join() === 'src/safe-fs-worker.js,src/search-index-worker.js,src/server/fs-canary-worker.js,src/transcript-worker.js,src/usage-cold-worker.js,src/usage-index-worker.js',
  `every script those sites start (6): ${wc.scripts.join(', ')}`);
ok(!wc.bad.length, `each site tracks + skips the answer, each script answers first (${wc.bad.join('; ') || 'clean'})`);
{
  const noHandler = { ...TEXTS, 'src/usage-index-worker.js': TEXTS['src/usage-index-worker.js'].replace(/\n\s*if \(answerMemory\(msg, parentPort\)\) return;[^\n]*/, '') };
  const r1 = workerCensus(noHandler);
  ok(r1.bad.length === 1 && /usage-index-worker\.js does not answer/.test(r1.bad[0]), `CONTROL: a worker script without the handler ⇒ red by name (${r1.bad[0]})`);
  const planted = { ...TEXTS, 'src/server/new-pool.js': "const { Worker } = require('worker_threads');\nconst w = new Worker(require('path').join(__dirname, 'new-pool-worker.js'));\nw.on('message', (m) => m);\n",
    'src/server/new-pool-worker.js': "require('worker_threads').parentPort.on('message', (msg) => { void msg; });\n" };
  const r2 = workerCensus(planted);
  ok(r2.bad.some((b) => /new-pool\.js starts a worker it never tracks/.test(b)) && r2.bad.some((b) => /new-pool-worker\.js does not answer/.test(b)) && r2.bad.some((b) => /new-pool\.js's own message handler/.test(b)),
    `CONTROL: a planted pool ⇒ red three ways (${r2.bad.length})`);
  const untracked = { ...TEXTS, 'src/safe-fs.js': TEXTS['src/safe-fs.js'].replace("trackWorker(this.name + '#' + rec.slot, w)", 'w') };
  ok(untracked['src/safe-fs.js'] !== TEXTS['src/safe-fs.js'] && workerCensus(untracked).bad.some((b) => /safe-fs\.js starts a worker it never tracks/.test(b)), 'CONTROL: SafeFs spawning without trackWorker ⇒ red');
}

// ── §6 THE SYSTEM WINDOW ROWS + SOURCE PINS ──
console.log('§6 the System window rows (en / zh / ja) + the sampler source');
const v = C.censusRows(c);
ok(v.rows.map((r) => r.key).join() === 'main,workers,external,native,rss' && v.rows[1].n === 3 && v.rows[1].unknown === 1 && v.workers.length === 3 && v.workers[1].unknown === true && v.workers[1].bytes === null,
  'rows: Main heap · Workers (N) · External / ArrayBuffers · Native / other · RSS; the per-worker rows (unknown kept) for the fold');
ok(v.note.words === C.WORDS.basisAnon && C.censusRows(mac).note.words === C.WORDS.basisRss && C.censusRows(null) === null, 'the basis note follows the census; no census ⇒ no block');
const dict = (f) => { const t = read(f); const m = new Map(); for (const x of t.matchAll(/^ {2}("(?:[^"\\]|\\.)*"): ("(?:[^"\\]|\\.)*"),$/gm)) m.set(JSON.parse(x[1].replace(/\\'/g, "'")), JSON.parse(x[2].replace(/\\'/g, "'"))); return m; };
const ZH = dict('src/lib/i18n-zh.js'), JA = dict('src/lib/i18n-ja.js');
const words = Object.values(C.WORDS);
const miss = words.filter((w) => !ZH.has(w) || !JA.has(w));
ok(!miss.length, `every row word has zh + ja (${words.length} words${miss.length ? ' — MISSING: ' + miss.join(' | ') : ''})`);
ok(words.every((w) => (w.match(/\{\w+\}/g) || []).sort().join() === (ZH.get(w).match(/\{\w+\}/g) || []).sort().join() && (w.match(/\{\w+\}/g) || []).sort().join() === (JA.get(w).match(/\{\w+\}/g) || []).sort().join()),
  'each translation keeps the same {placeholders}');
ok(ZH.get(C.WORDS.main) === '主堆' && JA.get(C.WORDS.workers) === 'ワーカー（{n}）', `zh "${ZH.get(C.WORDS.title)} · ${ZH.get(C.WORDS.main)}", ja "${JA.get(C.WORDS.title)} · ${JA.get(C.WORDS.native)}"`);
const rail = read('src/lib/sidebar-rail.js');
ok(/import \{ censusRows, WORDS as MEMORY_WORDS \} from '\.\.\/memory-census\.js'/.test(rail) && /if \(!hostId && d\.serverMemory\) parts\.push\(this\._serverMemoryHtml\(d\.serverMemory, fmt\)\)/.test(rail),
  'the System window draws the census for THIS instance only (a remote machine has no server census)');
const smp = read('src/server/memory-sampler.js');
ok(!/\b(readFileSync|readdirSync|statSync|existsSync|execSync|spawnSync)\b/.test(smp) && /fsp\.readFile\('\/proc\/self\/smaps_rollup'/.test(smp), 'the sampler does no sync fs: the one /proc read is async (fs.promises)');
ok(!/require\(/.test(read('src/memory-census.js')), 'src/memory-census.js imports nothing (PURE)');
const srv = read('server.js');
ok(/serverMemory: memSampler\.latest\(\) \|\| undefined/.test(srv) && /memSampler\.start\(\);/.test(srv), 'server.js: GET /api/sysinfo carries serverMemory; the sampler starts at listen');

console.log(`\n${fail ? 'FAILED' : 'ALL PASS'} (${pass}${fail ? `, ${fail} failed` : ''})`);
process.exit(fail ? 1 : 0);
