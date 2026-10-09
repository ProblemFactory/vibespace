'use strict';
/**
 * worker-memory.js — SHARED (node builtins only) — every worker_threads isolate of this process answers ONE
 * `memory` message with its own heap (lane server-memory-census, B-9428 step (c)).
 *
 * WORKER SIDE: each worker script's message loop starts with `if (answerMemory(msg, parentPort)) return;` — the
 * ask is answered between two of its ops, never queued behind them (scripts/test-memory-census.mjs finds every
 * `new Worker(` site and every script it starts, and reds one without the call).
 * MAIN SIDE: each creator registers what it started with trackWorker(name, worker) (a SafeFs pool's slot k is
 * `<pool>#k`); askMemory() asks every live one and waits AT MOST timeoutMs — a worker that does not answer
 * (wedged on a syscall, busy in a long op) is reported with mem null = unknown, never waited on.
 * The answer is `{ev: 'memory', id, mem}` — the creators' own handlers skip `ev: 'memory'`.
 */

const MEMORY_OP = 'vs-memory';

/** Worker side: true when msg was the memory ask (answered here); false = the caller's own message. */
function answerMemory(msg, port) {
  if (!msg || msg.op !== MEMORY_OP) return false;
  let mem = null;
  try {
    const mu = process.memoryUsage();
    const hs = require('v8').getHeapStatistics();
    mem = { heapUsed: mu.heapUsed, heapTotal: mu.heapTotal, physical: hs.total_physical_size, external: mu.external, arrayBuffers: mu.arrayBuffers, malloced: hs.malloced_memory };
  } catch { }
  try { port.postMessage({ ev: 'memory', id: msg.id, mem }); } catch { }
  return true;
}

const tracked = new Set(); // {name, worker}

/** Main side: register a started worker under its census name; it leaves the census when it exits. */
function trackWorker(name, worker) {
  if (!worker) return worker;
  trackedWorkers(); // a pool's kill path removes every listener, our exit one too — drop the dead here as well
  const entry = { name: String(name), worker };
  tracked.add(entry);
  try { worker.once('exit', () => tracked.delete(entry)); } catch { }
  return worker;
}

/** The live tracked workers ({name, worker}); an exited one (threadId −1, its exit listener removed by a pool's
 *  kill path) is dropped here. */
function trackedWorkers() {
  for (const e of tracked) if (e.worker.threadId === -1) tracked.delete(e);
  return [...tracked];
}

let seq = 0;
/** Ask each worker once; resolves [{name, mem|null}] within timeoutMs whatever the workers do. Never rejects. */
function askMemory(list = trackedWorkers(), { timeoutMs = 2000, timers = { setTimeout, clearTimeout } } = {}) {
  return Promise.all(list.map(({ name, worker }) => new Promise((resolve) => {
    const id = 'm' + (++seq);
    let settled = false, timer = null;
    const done = (mem) => {
      if (settled) return;
      settled = true;
      timers.clearTimeout(timer);
      try { worker.off('message', onMessage); } catch { }
      resolve({ name, mem });
    };
    const onMessage = (m) => { if (m && m.ev === 'memory' && m.id === id) done(m.mem || null); };
    timer = timers.setTimeout(() => done(null), timeoutMs);
    timer?.unref?.();
    try { worker.on('message', onMessage); worker.postMessage({ op: MEMORY_OP, id }); } catch { done(null); }
  })));
}

module.exports = { MEMORY_OP, answerMemory, trackWorker, trackedWorkers, askMemory };
