'use strict';
// THE USAGE WINDOW'S FOLD, off the loop (B-9428 r2, verify #0/#8): this worker reads the walk's cold rows and
// the hot rows by (shard, offset) (usage-cold-walk.js), parses them and folds them into the SAME accumulator
// aggregate() uses (UsageHistory._aggRow / _aggEnd, same pricing, same order) — the main thread receives the
// finished answer and names what needs its live account / session tables (_fixLabels).
const { parentPort } = require('worker_threads');
const { answerMemory } = require('./worker-memory.js');
const { UsageHistory } = require('./usage-history.js');
const { coldRows, hotRows, mergedRows } = require('./usage-cold-walk.js');
const v8 = require('v8');

parentPort.on('message', (msg) => {
  if (answerMemory(msg, parentPort)) return; // the memory census (src/worker-memory.js)
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
    // overrides the Worker's resourceLimits, so the fold checks its own heap every 2 000 rows and refuses
    const capBytes = (msg.capMb || 0) * 1048576;
    for (const ev of mergedRows(coldRows({ ...msg.walk, rowBudget: msg.rowBudget }, stats), hotRows({ dir: msg.walk.dir, shards: msg.walk.shards, hot: msg.hot, from: q.from, to: q.to }, stats))) {
      agg._aggRow(st, ev);
      if (capBytes && ++n % 2000 === 0 && v8.getHeapStatistics().used_heap_size > capBytes) throw Object.assign(new Error(`this range needs more memory than the usage fold's ${msg.capMb} MB cap (${Math.round(v8.getHeapStatistics().used_heap_size / 1048576)} MB at ${n} rows) — retrying will not help; narrow the range or raise the cap`), { code: 'FOLD_TOO_BIG' });
    }
    parentPort.postMessage({ ev: 'done', id: msg.id, answer: agg._aggEnd(st), rows: n, missing: stats.missing, missingShards: [...stats.missingShards] });
  } catch (e) {
    parentPort.postMessage({ ev: 'error', id: msg.id, error: String((e && e.message) || e), code: (e && e.code) || null });
  }
});
