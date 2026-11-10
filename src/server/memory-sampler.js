'use strict';
// memory-sampler.js — the server's own memory census every 60 s (lane server-memory-census, B-9428 step (c)): the main
// isolate (process.memoryUsage + v8 heap statistics), EVERY live worker isolate (src/worker-memory.js askMemory — an
// unanswered worker is unknown after 2 s, never waited on) and /proc/self/smaps_rollup (an async read; absent off Linux
// ⇒ null), folded by the PURE src/memory-census.js. Telemetry: srv-worker-heap-mb / srv-external-mb / srv-native-mb on
// every 5th sample (the srv-rss-mb cadence) + ONE srv-mem-census event on every 10th; the first sample (at listen)
// logs ONE `[memory] boot census:` journal line. GET /api/sysinfo carries latest() for the System window.
// A census, not a guard — nothing here acts on a number.
// Lane hub-loop-stalls (a hub's memory grew six times over a day, on no record): the SAME census line every `hourEvery`
// samples (an hour) with what the census itself held the loop (its synchronous part: the heap statistics, the caches'
// sizes, the fold — measured, said in the line), and ONE line an hour while heap used is past 80 % of the heap's limit.
const fsp = require('fs').promises;
const v8 = require('v8');
const { memoryCensus, parseSmapsRollup, censusMetrics, censusEvent, bootLine, hourLine, heapHighLine } = require('../memory-census.js');
const { askMemory } = require('../worker-memory.js');

function readMain() {
  const mu = process.memoryUsage();
  const hs = v8.getHeapStatistics();
  return { rss: mu.rss, heapTotal: mu.heapTotal, heapUsed: mu.heapUsed, external: mu.external, arrayBuffers: mu.arrayBuffers,
    physical: hs.total_physical_size, malloced: hs.malloced_memory, peakMalloced: hs.peak_malloced_memory, heapLimit: hs.heap_size_limit };
}
const readSmaps = () => (process.platform === 'linux' ? fsp.readFile('/proc/self/smaps_rollup', 'utf8') : Promise.resolve(null));

function create({ record = () => {}, log = console, intervalMs = 60000, metricEvery = 5, eventEvery = 10, askTimeoutMs = 2000,
  readMainMemory = readMain, readSmapsText = readSmaps, ask = (o) => askMemory(undefined, o), now = () => Date.now(),
  timers = { setInterval, clearInterval }, caches = () => [], hourEvery = 60, hr = () => Number(process.hrtime.bigint()) / 1e6, uptimeH = () => process.uptime() / 3600 } = {}) {
  let latest = null, n = 0, busy = null, timer = null, booted = false, highSaidAt = -Infinity;

  /** One census. A sample still running is joined, never doubled. Never rejects. */
  function sample() {
    if (busy) return busy;
    busy = (async () => {
      const t0 = now();
      let main = {}, loopMs = 0, h0 = hr();
      try { main = readMainMemory(); } catch { }
      loopMs += hr() - h0;
      const [text, workers] = await Promise.all([
        Promise.resolve().then(readSmapsText).catch(() => null),
        Promise.resolve().then(() => ask({ timeoutMs: askTimeoutMs })).catch(() => []),
      ]);
      h0 = hr();
      let rows = []; try { rows = caches() || []; } catch { } // the bounded caches by name (B-9428)
      const c = memoryCensus({ main, workers, smaps: parseSmapsRollup(text), at: now(), caches: rows });
      loopMs += hr() - h0;
      c.tookMs = now() - t0;
      c.loopMs = loopMs;   // what this census held the loop (its synchronous parts)
      latest = c;
      const k = n++;
      try {
        if (k % metricEvery === 0) for (const r of censusMetrics(c)) record({ kind: 'metric', ...r });
        if (k % eventEvery === 0) record(censusEvent(c));
      } catch { }
      try {
        if (k > 0 && k % hourEvery === 0) log.log?.(hourLine(c, Math.round(uptimeH() * 10) / 10, c.loopMs));
        const high = heapHighLine(main.heapUsed, main.heapLimit);
        if (high && now() - highSaidAt >= 3600000) { highSaidAt = now(); log.warn?.(high); }
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
