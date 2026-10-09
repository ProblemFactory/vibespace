'use strict';
// memory-sampler.js — the server's own memory census every 60 s (lane server-memory-census, B-9428 step (c)): the main
// isolate (process.memoryUsage + v8 heap statistics), EVERY live worker isolate (src/worker-memory.js askMemory — an
// unanswered worker is unknown after 2 s, never waited on) and /proc/self/smaps_rollup (an async read; absent off Linux
// ⇒ null), folded by the PURE src/memory-census.js. Telemetry: srv-worker-heap-mb / srv-external-mb / srv-native-mb on
// every 5th sample (the srv-rss-mb cadence) + ONE srv-mem-census event on every 10th; the first sample (at listen)
// logs ONE `[memory] boot census:` journal line. GET /api/sysinfo carries latest() for the System window.
// A census, not a guard — nothing here acts on a number.
const fsp = require('fs').promises;
const v8 = require('v8');
const { memoryCensus, parseSmapsRollup, censusMetrics, censusEvent, bootLine } = require('../memory-census.js');
const { askMemory } = require('../worker-memory.js');

function readMain() {
  const mu = process.memoryUsage();
  const hs = v8.getHeapStatistics();
  return { rss: mu.rss, heapTotal: mu.heapTotal, heapUsed: mu.heapUsed, external: mu.external, arrayBuffers: mu.arrayBuffers,
    physical: hs.total_physical_size, malloced: hs.malloced_memory, peakMalloced: hs.peak_malloced_memory };
}
const readSmaps = () => (process.platform === 'linux' ? fsp.readFile('/proc/self/smaps_rollup', 'utf8') : Promise.resolve(null));

function create({ record = () => {}, log = console, intervalMs = 60000, metricEvery = 5, eventEvery = 10, askTimeoutMs = 2000,
  readMainMemory = readMain, readSmapsText = readSmaps, ask = (o) => askMemory(undefined, o), now = () => Date.now(),
  timers = { setInterval, clearInterval } } = {}) {
  let latest = null, n = 0, busy = null, timer = null, booted = false;

  /** One census. A sample still running is joined, never doubled. Never rejects. */
  function sample() {
    if (busy) return busy;
    busy = (async () => {
      const t0 = now();
      let main = {};
      try { main = readMainMemory(); } catch { }
      const [text, workers] = await Promise.all([
        Promise.resolve().then(readSmapsText).catch(() => null),
        Promise.resolve().then(() => ask({ timeoutMs: askTimeoutMs })).catch(() => []),
      ]);
      const c = memoryCensus({ main, workers, smaps: parseSmapsRollup(text), at: now() });
      c.tookMs = now() - t0;
      latest = c;
      const k = n++;
      try {
        if (k % metricEvery === 0) for (const r of censusMetrics(c)) record({ kind: 'metric', ...r });
        if (k % eventEvery === 0) record(censusEvent(c));
      } catch { }
      return c;
    })().finally(() => { busy = null; });
    return busy;
  }

  function start() {
    if (timer) return api;
    sample().then((c) => { if (!booted) { booted = true; log.log?.(bootLine(c)); } }, () => { });
    timer = timers.setInterval(() => { sample().catch(() => { }); }, intervalMs);
    timer?.unref?.();
    return api;
  }
  function stop() { if (timer) timers.clearInterval(timer); timer = null; }

  const api = { start, stop, sample, latest: () => latest };
  return api;
}

module.exports = { create };
