'use strict';
// THE USAGE WINDOW'S FOLD, off the loop (B-9428 r2, verify #0/#8): this worker reads the walk's cold rows and
// the hot rows by (shard, offset) (usage-cold-walk.js), parses them and folds them into the SAME accumulator
// aggregate() uses (UsageHistory._aggRow / _aggEnd, same pricing, same order) — the main thread receives the
// finished answer and names what needs its live account / session tables (_fixLabels).
// B-748f: …and THE LEDGER REBUILD — op 'rebuild' runs the cache's ONE load pass (UsageHistory._loadSteps) on this
// thread's own instance and hands the loop the built cache as transferable parts (UsageHistory._packWhole).
const { parentPort, resourceLimits: RL = {} } = require('worker_threads');   // RL: this Worker's own limits (B-f35e)
const { answerMemory } = require('./worker-memory.js');
const { UsageHistory } = require('./usage-history.js');
const { coldRows, hotRows, mergedRows } = require('./usage-cold-walk.js');
const v8 = require('v8');
const CB = require('./cache-bounds.js');   // B-f35e: foldCapRule — how the soft cap is judged here

/** B-f35e: THE SOFT CAP, JUDGED BY WHERE THE WORKER'S LIMIT IS (CB.foldCapRule). 'reading': the cap is the old-space
 *  limit V8 kept — a reading over it refuses, as the release did. 'held': the limit is elsewhere (a parent
 *  --max-old-space-size replaces the Worker's resourceLimits; a cap under _spawnJob's 64 MB floor) and the reading counts
 *  what the collector has not taken yet: a reading over the cap is judged after ONE full collection of THIS worker's own
 *  heap (the main loop never waits on it), refused only if what is still held is over; after a collection that fits, the
 *  next is asked only once the reading has grown a quarter of the cap past what was held (no collection per check near
 *  the cap). The collector: the process's own `gc` when it runs with --expose-gc, else reached once through a new context
 *  under the flag, which is cleared again at once (it was off: a worker of a process with the flag has `gc`). */
let collect;
function fullCollection() {
  if (collect === undefined) {
    if (typeof globalThis.gc === 'function') collect = globalThis.gc;
    else { try { v8.setFlagsFromString('--expose-gc'); collect = require('vm').runInNewContext('gc'); } catch { collect = null; } finally { try { v8.setFlagsFromString('--no-expose-gc'); } catch { } } }
  }
  if (typeof collect === 'function') collect();
}
/** → null (it fits) | {bytes, held: whether after a collection} for one 2 000-row check under `rule`. */
function overCap(capBytes, rule, judge) {
  const r = v8.getHeapStatistics().used_heap_size;
  if (rule === 'reading') return r > capBytes ? { bytes: r, held: false } : null;
  if (r <= Math.max(capBytes, judge.nextAt)) return null;
  fullCollection();
  const h = v8.getHeapStatistics().used_heap_size;
  if (h > capBytes) return { bytes: h, held: true };
  judge.nextAt = Math.min(h + capBytes / 4, judge.limit * 0.85);   // never past the worker's own limit: a fold growing there is judged before V8 kills it
  return null;
}

parentPort.on('message', (msg) => {
  if (answerMemory(msg, parentPort)) return; // the memory census (src/worker-memory.js)
  if (msg && msg.op === 'rebuild') {
    try {
      const uh = Object.assign(Object.create(UsageHistory.prototype), { dir: msg.dir, ledgerWindowMs: msg.windowMs, ledgerHotMaxBytes: msg.hotMaxBytes, coldMaxBytes: msg.coldMaxBytes, _evCache: null, firstLoadInWorker: false });
      const { built, transfer } = uh._packWhole();
      parentPort.postMessage({ ev: 'done', id: msg.id, built }, transfer);
    } catch (e) {
      parentPort.postMessage({ ev: 'error', id: msg.id, error: String((e && e.message) || e), code: (e && e.code) || null });
    }
    return;
  }
  if (!msg || msg.op !== 'fold') return;
  try {
    const agg = Object.create(UsageHistory.prototype);
    agg._pricing = msg.pricing;
    agg._resolveAccount = () => null;
    agg._lastMetaMap = null;
    const st = agg._aggBegin(msg.query);
    let n = 0;
    const q = msg.query || {}, stats = { missing: 0, missingShards: new Set() };
    // the SOFT heap cap (r3, verify #1/#12): a parent --max-old-space-size is a process-wide V8 flag that
    // overrides the Worker's resourceLimits, so the fold checks its own heap every 2 000 rows and refuses —
    // by the reading where the cap is the worker's own limit, else by what is still HELD after a collection (B-f35e)
    const capBytes = (msg.capMb || 0) * 1048576;
    const rule = CB.foldCapRule({ capMb: msg.capMb, heapLimitMb: v8.getHeapStatistics().heap_size_limit / 1048576, maxOldMb: RL.maxOldGenerationSizeMb, maxYoungMb: RL.maxYoungGenerationSizeMb });
    const judge = { nextAt: 0, limit: v8.getHeapStatistics().heap_size_limit };
    let over = null;
    for (const ev of mergedRows(coldRows({ ...msg.walk, rowBudget: msg.rowBudget }, stats), hotRows({ dir: msg.walk.dir, shards: msg.walk.shards, hot: msg.hot, from: q.from, to: q.to }, stats))) {
      agg._aggRow(st, ev);
      if (capBytes && ++n % 2000 === 0 && (over = overCap(capBytes, rule, judge))) throw Object.assign(new Error(`this range needs more memory than the usage fold's ${msg.capMb} MB cap (${Math.round(over.bytes / 1048576)} MB${over.held ? ' still held after a collection,' : ''} at ${n} rows) — retrying will not help; narrow the range or raise the cap`), { code: 'FOLD_TOO_BIG' });
    }
    parentPort.postMessage({ ev: 'done', id: msg.id, answer: agg._aggEnd(st), rows: n, missing: stats.missing, missingShards: [...stats.missingShards] });
  } catch (e) {
    parentPort.postMessage({ ev: 'error', id: msg.id, error: String((e && e.message) || e), code: (e && e.code) || null });
  }
});
