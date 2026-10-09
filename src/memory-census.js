'use strict';
/**
 * memory-census.js — PURE (imports nothing; CJS so the server's sampler, the client bundle and the suites share
 * ONE definition) — WHERE THE SERVER'S RESIDENT MEMORY GOES (lane server-memory-census, B-9428 step (c)).
 *
 * The owner read 1.79 GB RSS seconds after a boot while the main heap held ~1.0 GB (lane prod-heap-forensics):
 * the rest sits outside the main isolate — every worker_threads isolate has its own V8 heap, Buffers live outside
 * the heaps, and native code (malloc arenas, sqlite, libuv, thread stacks) is invisible to a heap snapshot. So the
 * product keeps this census itself, every 60 s (src/server/memory-sampler.js):
 *
 *   base     = /proc/self/smaps_rollup "Anonymous" (RssAnon) — the private anonymous memory every part below
 *              lives in; no smaps (macOS) ⇒ the RSS, said as basis 'rss'
 *   main     = the main isolate's RESIDENT heap (v8 total_physical_size; heapTotal when a reading lacks it) — not
 *              heapTotal: that counts committed pages never touched, and on a fresh scratch server it alone pushed
 *              the parts 44 MB past the anonymous memory (native clamped to 0)
 *   workers  = Σ resident heap of every worker that ANSWERED; a worker that did not is UNKNOWN — counted, never 0
 *              (its heap then sits inside native, and the table says how many are unknown)
 *   external = the main isolate's external + Σ answered workers' external (Buffers / ArrayBuffers included)
 *   native   = base − main − workers − external, clamped ≥ 0
 *
 * THE SUM IDENTITY: main + workers + external + native === base, unless native was clamped — then the parts
 * exceed the base by `over` bytes, reported, never hidden. A census, not a guard: nothing reads it to act.
 */

const MB = 1048576;
const mb = (b) => (Number.isFinite(b) ? Math.round(b / MB) : null);
const num = (v) => (Number.isFinite(v) && v > 0 ? v : 0);
const resident = (x) => (Number.isFinite(x.physical) && x.physical > 0 ? x.physical : num(x.heapTotal));
const SMAPS_FIELDS = { Rss: 'rss', Pss: 'pss', Anonymous: 'anonymous', Shared_Clean: 'sharedClean', Private_Dirty: 'privateDirty' };

/** /proc/self/smaps_rollup text → bytes ({rss, pss, anonymous, sharedClean, privateDirty}); no `Rss:` line ⇒ null. */
function parseSmapsRollup(text) {
  if (typeof text !== 'string' || !text) return null;
  const out = {};
  for (const line of text.split('\n')) {
    const m = /^(\w+):\s+(\d+) kB/.exec(line);
    if (m && SMAPS_FIELDS[m[1]]) out[SMAPS_FIELDS[m[1]]] = Number(m[2]) * 1024;
  }
  return Number.isFinite(out.rss) ? out : null;
}

/** The census. main = process.memoryUsage() + v8 heap statistics (bytes); workers = [{name, mem|null}] (mem null
 *  ⇒ unknown); smaps = parseSmapsRollup's answer or null. Every number out is bytes; `heap` = resident, heapTotal kept. */
function memoryCensus({ main = {}, workers = [], smaps = null, at = null, caches = [] } = {}) {
  const m = main || {};
  const rss = num(m.rss);
  const basis = smaps && Number.isFinite(smaps.anonymous) ? 'anon' : 'rss';
  const base = basis === 'anon' ? smaps.anonymous : rss;
  const rows = [];
  let heap = 0, used = 0, ext = 0, buffers = 0, known = 0;
  for (const w of Array.isArray(workers) ? workers : []) {
    const name = String((w && w.name) || 'worker');
    const x = w && w.mem;
    if (!x || !Number.isFinite(x.heapTotal)) { rows.push({ name, state: 'unknown', heap: null, heapUsed: null, heapTotal: null, external: null }); continue; }
    known++;
    heap += resident(x); used += num(x.heapUsed); ext += num(x.external); buffers += num(x.arrayBuffers);
    rows.push({ name, state: 'ok', heap: resident(x), heapUsed: num(x.heapUsed), heapTotal: num(x.heapTotal), external: num(x.external) });
  }
  const mainHeap = resident(m);
  const external = num(m.external) + ext;
  const rest = base - mainHeap - heap - external;
  return {
    at, basis, base, rss,
    smaps: smaps ? { anonymous: smaps.anonymous ?? null, pss: smaps.pss ?? null, sharedClean: smaps.sharedClean ?? null } : null,
    main: { heap: mainHeap, heapTotal: num(m.heapTotal), heapUsed: num(m.heapUsed), external: num(m.external), arrayBuffers: num(m.arrayBuffers), malloced: num(m.malloced), peakMalloced: num(m.peakMalloced) },
    workers: rows, workerCount: rows.length, workersKnown: known, workersUnknown: rows.length - known,
    workerHeap: heap, workerHeapUsed: used,
    external, arrayBuffers: num(m.arrayBuffers) + buffers,
    native: Math.max(0, rest), over: Math.max(0, -rest),
    // B-9428: the bounded caches inside the main heap, BY NAME (the owner's snapshot needed a heap dump to
    // find them): [{name, bytes, count, unit, ceiling}] from cache-bounds' cacheRow
    caches: (Array.isArray(caches) ? caches : []).filter((x) => x && x.name).map((x) => ({ name: String(x.name), bytes: num(x.bytes), count: num(x.count), unit: String(x.unit || ''), ceiling: Number.isFinite(x.ceiling) ? x.ceiling : null, kind: x.kind === 'arraybuffers' ? 'arraybuffers' : 'heap', basis: String(x.basis || 'bytes'), over: !!x.over })),
  };
}

/** The 60-s sampler's metric rows (every 5th sample, the srv-rss-mb cadence): integer MB. */
function censusMetrics(c) {
  const unknown = c.workersUnknown ? { detail: 'unknown=' + c.workersUnknown } : {};
  return [
    { name: 'srv-worker-heap-mb', value: mb(c.workerHeap), ...unknown },
    { name: 'srv-external-mb', value: mb(c.external) },
    { name: 'srv-native-mb', value: mb(c.native) },
  ];
}

const EVENT_DETAIL_MAX = 900;
/** ONE srv-mem-census event (every 10th sample): value = RSS MB; detail = the parts + one `name used/resident/total`
 *  per worker (MB; `?` = unknown). The detail stays ≤ EVENT_DETAIL_MAX chars — a longer worker list ends `+N more`. */
function censusEvent(c) {
  const head = `${c.basis} ${mb(c.base)} · main ${mb(c.main.heapUsed)}/${mb(c.main.heap)}/${mb(c.main.heapTotal)} · ext ${mb(c.external)} · native ${mb(c.native)}${c.over ? ' · over ' + mb(c.over) : ''} ·`;
  let detail = head;
  for (let i = 0; i < c.workers.length; i++) {
    const w = c.workers[i];
    const cell = ' ' + w.name.slice(0, 40) + ' ' + (w.state === 'ok' ? mb(w.heapUsed) + '/' + mb(w.heap) + '/' + mb(w.heapTotal) : '?');
    const tail = ` +${c.workers.length - i} more`;
    if (detail.length + cell.length + (i < c.workers.length - 1 ? tail.length : 0) > EVENT_DETAIL_MAX) { detail += tail; break; }
    detail += cell;
  }
  return { kind: 'event', name: 'srv-mem-census', value: mb(c.rss), detail };
}

/** The boot journal line — the parts of the number the owner reads right after a start. */
function bootLine(c) {
  const unknown = c.workersUnknown ? ` (${c.workersUnknown} unknown)` : '';
  const base = c.basis === 'anon' ? ` (anonymous ${mb(c.base)} MB = the parts)` : ' (no smaps: the parts add up to RSS)';
  return `[memory] boot census: main heap ${mb(c.main.heap)} MB, ${c.workerCount} workers ${mb(c.workerHeap)} MB${unknown}, external ${mb(c.external)} MB, native ${mb(c.native)} MB, RSS ${mb(c.rss)} MB${base}${cachesText(c)}`;
}
/** `; in the main heap: usage ledger window 61/96 MB (120345 rows), …; in ArrayBuffers (part of external):
 *  usage ledger cold columns 95/256 MB (…)` — each bounded cache by name, against its ceiling in ITS unit; a
 *  cache past its ceiling says OVER. ArrayBuffer stores are never summed into the main heap (verify #4). */
function cachesText(c) {
  if (!c.caches || !c.caches.length) return '';
  const one = (x) => `${x.name} ${mb(x.bytes)}${x.ceiling ? '/' + mb(x.ceiling) : ''} MB (${x.count} ${x.unit}${x.over ? ', OVER' : ''})`;
  const heap = c.caches.filter((x) => x.kind !== 'arraybuffers'), ab = c.caches.filter((x) => x.kind === 'arraybuffers');
  return (heap.length ? '; in the main heap: ' + heap.map(one).join(', ') : '') + (ab.length ? '; in ArrayBuffers (part of external): ' + ab.map(one).join(', ') : '');
}

/** THE System window's rows — English KEYS (the client words them with its own t(); zh/ja live in the client
 *  dictionaries, test-memory-census pins each). The per-worker rows go under the Workers fold. */
const WORDS = {
  title: 'Server memory',
  main: 'Main heap',
  workers: 'Workers ({n})',
  external: 'External / ArrayBuffers',
  native: 'Native / other',
  rss: 'RSS',
  used: '{used} used',
  unknown: 'no answer',
  unknownCount: '{n} did not answer',
  basisAnon: 'The parts add up to the anonymous memory ({anon}); RSS also counts the program and mapped files.',
  basisRss: 'No smaps here: the parts add up to the RSS.',
  caches: 'Caches in the main heap',
};
function censusRows(c) {
  if (!c || !c.main) return null;
  return {
    rows: [
      { key: 'main', words: WORDS.main, bytes: c.main.heap, used: c.main.heapUsed },
      { key: 'workers', words: WORDS.workers, n: c.workerCount, bytes: c.workerHeap, used: c.workerHeapUsed, unknown: c.workersUnknown },
      { key: 'external', words: WORDS.external, bytes: c.external },
      { key: 'native', words: WORDS.native, bytes: c.native },
      { key: 'rss', words: WORDS.rss, bytes: c.rss },
    ],
    workers: c.workers.map((w) => ({ name: w.name, bytes: w.heap, used: w.heapUsed, unknown: w.state !== 'ok' })),
    caches: (c.caches || []).map((x) => ({ name: x.name, bytes: x.bytes, count: x.count, unit: x.unit, ceiling: x.ceiling, kind: x.kind, basis: x.basis, over: x.over })),
    note: c.basis === 'anon' ? { words: WORDS.basisAnon, anon: c.base } : { words: WORDS.basisRss },
  };
}

module.exports = { MB, mb, parseSmapsRollup, memoryCensus, censusMetrics, censusEvent, EVENT_DETAIL_MAX, bootLine, cachesText, WORDS, censusRows };
