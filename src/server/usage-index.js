'use strict';
// THE USAGE INDEX OWNER (design 011 lane 3, L1 — the SHADOW). ORCH: starts
// the index worker lazily, keeps its one FIFO, names why the index is not
// available, and runs the COMPARER beside the Usage window's read. The index
// feeds NOTHING here: compare() asks it the same aggregate the window was
// just answered from memory and counts same / different — a difference is a
// telemetry event carrying the query, never shown, never decided on.
//
// Facts this file is built on (measured 2026-10-03 on this box, Node 24.12):
//  · process.exit() JOINS worker threads: with the worker blocked in a
//    syscall it never returns (a hung `systemctl restart`). So the exit hook
//    asks the worker to close and waits at most closeBoundMs on a shared
//    flag; past the bound it re-raises SIGTERM with the default action (the
//    index is crash-safe: WAL, every chunk committed with its mark).
//  · the worker's V8 heap is capped (heapMb): an uncapped first build of the
//    real 296 MB ledger left the server +262 MB RSS for good; the fold now
//    streams its rows, so the all-time 8-pivot read fits the cap (verify r1);
//    a worker past its cap dies ALONE, by name ('worker-exited').
//  · liveness is timed on the monotonic clock: on the wall clock a step back
//    after a deadline kept the index "unresponsive" for the size of the step.
//  · a deadline answers 503 "unresponsive" and does NOT kill the worker —
//    unlike SafeFs: a thread stuck in D state cannot be killed and would keep
//    its connection and lock; the next message from it clears the state.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { Worker } = require('worker_threads');
const { trackWorker } = require('../worker-memory.js');
const M = require('../usage-index-model.js');

// Why the index is not answering — each one a NAME the comparer counts under.
const REASON = Object.freeze({
  OFF: 'not-started', STARTING: 'starting', BUILDING: 'building', NO_SQLITE: 'no-node-sqlite', LOCKED: 'locked-by-another-server',
  WRITE_FAILED: 'write-failed', UNRESPONSIVE: 'unresponsive', EXITED: 'worker-exited', NO_LEDGER: 'no-ledger', CLOSED: 'closed',
});

/** The index's directory: LOCAL disk, one per data/ REAL path — a worktree or
 *  scratch server (its own data/, its own HOME) never touches production's.
 *  (Owner question 2, assumed yes: a "no" changes only this line.) */
function indexDirFor(dataDir, homeDir = os.homedir()) {
  let real; try { real = fs.realpathSync(dataDir); } catch { real = path.resolve(dataDir); }
  const hash = crypto.createHash('sha256').update(real).digest('hex').slice(0, 16);
  return { dir: path.join(homeDir, '.vibespace', 'db', hash), real };
}

function create({ getLedger, homeDir = os.homedir(), workerFile = path.join(__dirname, '..', 'usage-index-worker.js'),
  deadlineMs = 15000, queryDeadlineMs = 30000, closeBoundMs = 2000, pushBacklogBytes = 64 * 1024 * 1024,
  maxPages = 0, heapMb = 128, exitHook = true, log = console, onDiff = null, onState = null } = {}) {
  let worker = null, ledger = null, dir = null;
  let st = 'off', reason = REASON.OFF, code = null;
  let seq = 1, lastHeardAt = 0, lastDeadlineAt = 0, needRecover = false, backlog = 0, inFlight = false;
  const calls = new Map(); // id → {resolve, reject, timer, at, bytes}
  const ctl = new Int32Array(new SharedArrayBuffer(8));
  const counts = { same: 0, diff: 0, skipped: {}, failed: {}, pushes: 0, dropped: 0 };
  let lastDiff = null, ready = null;
  const bump = (m, k) => { m[k] = (m[k] || 0) + 1; };

  const setState = (s, r = null, extra = {}) => {
    st = s; reason = r; code = extra.code || null;
    try { onState?.(s, r, extra); } catch { }
  };
  const unresponsive = () => {
    const now = performance.now();
    if (lastDeadlineAt > lastHeardAt) return true;
    for (const c of calls.values()) if (c.at < now - deadlineMs && lastHeardAt < now - deadlineMs) return true;
    return false;
  };
  const available = () => {
    if (st === 'ready' && !unresponsive()) return { ok: true };
    return { ok: false, reason: st === 'ready' ? REASON.UNRESPONSIVE : reason, ...(code ? { code } : {}) };
  };

  function onMessage(m) {
    if (m && m.ev === 'memory') return; // the memory census's answer (askMemory takes it) — not a heartbeat
    lastHeardAt = performance.now();
    if (m && m.ev === 'state') {
      if (m.state === 'building') setState('building', REASON.BUILDING);
      else if (m.state === 'ready') { ready = { ms: m.ms, rows: m.rows, bytes: m.bytes }; setState('ready'); log.log?.(`[usage-index] ready: ${m.rows} rows in ${m.ms} ms, ${m.bytes} bytes (${dir})`); }
      else if (m.state === 'disabled') { setState('disabled', m.reason, { code: m.code }); log.log?.(`[usage-index] off — ${m.reason}${m.code ? ' (' + m.code + ')' : ''}${m.detail ? ': ' + m.detail : ''}`); }
      return;
    }
    if (m && m.ev === 'progress') return; // a heartbeat
    const c = calls.get(m && m.id);
    if (!c) return; // answered after its deadline — already rejected
    calls.delete(m.id);
    clearTimeout(c.timer);
    backlog -= c.bytes || 0;
    if (m.ok) c.resolve(m.result);
    else c.reject(Object.assign(new Error(m.error?.message || 'usage index error'), { status: 503, reason: m.error?.reason || REASON.UNRESPONSIVE, code: m.error?.code }));
    if (needRecover && st === 'ready') { needRecover = false; call('recover', {}).catch(() => { }); }
  }

  function call(op, payload, { timeoutMs = 0, bytes = 0 } = {}) {
    return new Promise((resolve, reject) => {
      if (!worker) return reject(Object.assign(new Error('usage index not running'), { status: 503, reason }));
      const id = seq++;
      const c = { resolve, reject, at: performance.now(), bytes, timer: null };
      if (timeoutMs > 0) {
        c.timer = setTimeout(() => {
          if (!calls.delete(id)) return;
          backlog -= bytes;
          lastDeadlineAt = performance.now();
          reject(Object.assign(new Error('the usage index did not answer in time'), { status: 503, reason: REASON.UNRESPONSIVE }));
        }, timeoutMs);
        c.timer.unref?.();
      }
      calls.set(id, c);
      backlog += bytes;
      worker.postMessage({ id, op, payload });
    });
  }

  function onExit() {
    const r = closeSync();
    if (r !== 'timed-out') return;
    // the worker is wedged: process.exit() would wait for it forever
    try { log.error?.(`[usage-index] the index worker did not close within ${closeBoundMs} ms — exiting without it`); } catch { }
    process.removeAllListeners('SIGTERM');
    process.kill(process.pid, 'SIGTERM');
    process.kill(process.pid, 'SIGKILL'); // only if SIGTERM was ignored
  }

  /** Start the worker (once). Resolves the ledger now — the index belongs to
   *  the data/ that ledger lives in — and attaches itself as the ledger's push. */
  function start() {
    if (worker || st === 'closed') return api;
    ledger = typeof getLedger === 'function' ? getLedger() : null;
    if (!ledger || !ledger.dir) { setState('disabled', REASON.NO_LEDGER); return api; }
    const dataDir = path.dirname(ledger.dir);
    const where = indexDirFor(dataDir, homeDir);
    dir = where.dir;
    setState('starting', REASON.STARTING);
    try {
      worker = new Worker(workerFile, { workerData: { dbDir: dir, ledgerDir: ledger.dir, dataReal: where.real, ctl: ctl.buffer, maxPages },
        ...(heapMb > 0 ? { resourceLimits: { maxOldGenerationSizeMb: heapMb, maxYoungGenerationSizeMb: 16 } } : {}) });
    } catch (e) { worker = null; setState('disabled', REASON.EXITED, { code: e.code }); return api; }
    trackWorker('usage-index', worker); // the memory census (src/worker-memory.js)
    worker.unref(); // never holds the process open
    worker.on('message', onMessage);
    worker.on('error', (e) => { log.error?.('[usage-index] worker error:', e && e.message); });
    worker.on('exit', () => {
      worker = null;
      for (const [id, c] of calls) { clearTimeout(c.timer); calls.delete(id); c.reject(Object.assign(new Error('usage index worker exited'), { status: 503, reason: REASON.EXITED })); }
      backlog = 0;
      if (st !== 'closed') setState('disabled', st === 'disabled' ? reason : REASON.EXITED, { code });
    });
    if (exitHook) process.on('exit', onExit);
    if (typeof ledger.setIndex === 'function') ledger.setIndex(api);
    return api;
  }

  /** THE PUSH (called by UsageHistory's commit point, synchronously, right
   *  after an append): the appended text goes to the worker's FIFO. Never
   *  throws, never waits. A worker that stopped draining (backlog past the
   *  bound) gets no more pushes — it re-reads from its marks once it answers. */
  function ingest(shard, offset, ino, text) {
    try {
      if (!worker || st === 'disabled' || st === 'closed') return;
      const bytes = Buffer.byteLength(text);
      if (backlog + bytes > pushBacklogBytes) { counts.dropped++; needRecover = true; return; }
      counts.pushes++;
      call('ingest', { shard, offset, ino, text }, { bytes }).catch(() => { needRecover = true; });
    } catch { }
  }

  /** A shard was rewritten under the index (a repair, reloadEvents): re-check every mark. */
  function recover() {
    if (!worker || st === 'disabled' || st === 'closed') return;
    call('recover', {}).catch(() => { });
  }

  /** The index's own answer to aggregate(opts), folded (prices are applied by
   *  the caller). ONE READ DOOR — the comparer below is its only caller in
   *  src/ (test-architecture §73's shadow census). */
  function queryAggregate(opts = {}, { timeoutMs = queryDeadlineMs } = {}) {
    const a = available();
    if (!a.ok) return Promise.reject(Object.assign(new Error(`usage index unavailable: ${a.reason}`), { status: 503, reason: a.reason }));
    return call('aggregate', { ...opts, ...M.priceSpec(ledger && ledger._pricing) }, { timeoutMs });   // int204: the price classes (usage-pricing's dated + long rates)
  }

  /** Diagnostics for suites and the verifier (row count, marks, user_version,
   *  optionally PRAGMA quick_check). Not a reader of usage numbers. */
  function workerStats(opts = {}) { return call('stats', opts, { timeoutMs: queryDeadlineMs }); }

  /** THE COMPARER. Called in the SAME synchronous step that produced `mem`
   *  (the route's aggregate), so the query enters the FIFO behind exactly the
   *  pushes that answer saw. One comparison in flight at a time — the window
   *  is never made to wait and a burst never queues work. */
  function compare(mem, opts = {}) {
    try {
      const a = available();
      if (!a.ok) { bump(counts.skipped, a.reason); return null; }
      if (inFlight) { bump(counts.skipped, 'busy'); return null; }
      inFlight = true;
      const q = { from: opts.from || null, to: opts.to || null, backend: opts.backend || null, accounts: opts.accounts ? [...opts.accounts] : null, hostFilter: opts.hostFilter || null, pivots: opts.pivots || null };
      return queryAggregate(q).then((folded) => {
        const costOf = (c) => ledger._cost(c, c.prompt);
        const res = M.compareAggregates(mem, M.finalizeAggregate(folded, costOf));
        if (res.same) counts.same++;
        else {
          counts.diff++;
          lastDiff = { at: Date.now(), query: q, diffs: res.diffs };
          if (counts.diff <= 5) log.log?.(`[usage-index] shadow comparison DIFFERS (${res.diffs.length} shown): ${JSON.stringify(res.diffs[0])}`);
          try { onDiff?.(lastDiff); } catch { }
        }
        return res;
      }, (e) => { bump(counts.failed, e.reason || 'error'); return null; }).finally(() => { inFlight = false; });
    } catch { inFlight = false; return null; }
  }

  /** Bounded, synchronous close (the exit hook; a suite): ask, then wait at
   *  most `boundMs` for the worker to say its connection is closed.
   *  → 'closed' | 'timed-out' | 'none'. */
  function closeSync(boundMs = closeBoundMs) {
    if (st !== 'closed') setState('closed', REASON.CLOSED);
    if (!worker) return 'none';
    Atomics.store(ctl, 1, 1);
    try { worker.postMessage({ id: 0, op: 'close' }); } catch { return 'none'; }
    const r = Atomics.wait(ctl, 0, 0, boundMs);
    return r === 'timed-out' ? 'timed-out' : 'closed';
  }

  /** Close and let the thread go (a suite; a server that is not exiting). */
  async function close(boundMs = closeBoundMs) {
    if (exitHook) process.removeListener('exit', onExit);
    const w = worker;
    const r = closeSync(boundMs);
    if (w && r === 'closed') { try { await w.terminate(); } catch { } }
    return r;
  }

  function stats() {
    return { state: st, reason, code, available: available(), dir, ready, backlog, pending: calls.size, ...counts, lastDiff };
  }

  const api = { start, ingest, recover, queryAggregate, workerStats, compare, available, stats, closeSync, close, get dir() { return dir; } };
  return api;
}

module.exports = { create, indexDirFor, REASON };
