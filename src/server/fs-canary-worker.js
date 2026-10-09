'use strict';
// THE FS CANARY'S PROBE (design 011 lane 1, store-timing) — runs in its OWN SafeFs worker (src/server/fs-canary.js),
// so the stat is timed by a clock the main event loop cannot hold. Unlike src/safe-fs-worker.js (sync fs on purpose:
// isolation), this probe is ASYNC on purpose: the canary's question since 2.108.6 is "does a stat round-trip through
// the process-global libuv pool" — a wedged pool is exactly what it must see. The worker's thread never blocks on
// it; its own deadline answers `timedOut` while the stat is still queued. `startAt` / `doneAt` are wall-clock
// (Date.now is one clock for every thread), so the main side can tell how long the answer waited for it.
const fs = require('fs');
let isMainThread = true;
try { ({ isMainThread } = require('worker_threads')); } catch { }

function runOp(op, payload) {
  if (op !== 'probe') throw new Error('unknown canary op: ' + op);
  const { path: p, deadlineMs = 5000 } = payload || {};
  const where = isMainThread ? 'main' : 'worker'; // 'main' = SafeFs's in-main fallback (no live worker): not off-thread
  const startAt = Date.now();
  return new Promise((resolve) => {
    let done = false;
    const finish = (timedOut, ok) => {
      if (done) return;
      done = true; clearTimeout(timer);
      const doneAt = Date.now();
      resolve({ result: { startAt, doneAt, fsMs: doneAt - startAt, timedOut, ok, where } });
    };
    const timer = setTimeout(() => finish(true, false), deadlineMs);
    fs.promises.stat(p).then(() => finish(false, true), () => finish(false, false));
  });
}

let parentPort = null;
try { ({ parentPort } = require('worker_threads')); } catch { }
if (parentPort) {
  const { answerMemory } = require('../worker-memory.js');
  parentPort.on('message', (msg) => {
    if (answerMemory(msg, parentPort)) return; // the memory census (src/worker-memory.js)
    const { id, op, payload } = msg || {};
    Promise.resolve().then(() => runOp(op, payload)).then(
      ({ result }) => parentPort.postMessage({ id, ok: true, result }),
      (e) => parentPort.postMessage({ id, ok: false, error: { message: e.message, code: e.code } }));
  });
}

module.exports = { runOp };
