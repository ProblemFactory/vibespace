/**
 * safe-fs.js — SafeFs: a small pool of worker_threads that execute user-path
 * filesystem operations OFF the main thread, so a hung mount (unreachable SMB/
 * NFS/fuse backend) can never starve the main event loop or the shared libuv
 * thread pool. This is the STRUCTURAL fix behind the tactical guards (canary,
 * mount watchdog, path circuit breaker) — "把 IO 隔离，不用重写".
 *
 * HOW ISOLATION WORKS (see safe-fs-worker.js header for the full argument):
 *   The worker executes SYNCHRONOUS fs, which blocks only the worker's own
 *   dedicated thread — NOT main's event loop and NOT the process-global libuv
 *   pool. Every call carries a deadline; on deadline the worker is presumed
 *   wedged on a stuck syscall → it is terminate()'d and a replacement spawned,
 *   while the caller's Promise REJECTS with a 503-tagged "storage not
 *   responding" error. Dispatch is least-busy across the pool, so a healthy
 *   request never lands on a wedged worker — good ops stay sub-millisecond even
 *   while one path hangs. The main process never blocks on user-path fs again.
 *
 * SafeFs is defense-in-depth BEHIND MountManager.pathBlocked — a known-hung
 * mount root is still failed fast in the route middleware before we ever
 * dispatch. path.resolve / permission / traversal decisions stay in the MAIN
 * process; the worker only executes an already-resolved absolute path.
 */

'use strict';

const path = require('path');
const { Worker } = require('worker_threads');
// Shared op implementation — also used as an in-main last-resort fallback if the
// whole pool is unavailable (worker construction failing outright).
const { runOp: _runOpInline } = require('./safe-fs-worker');

// Per-op deadlines (ms). A deadline hit under a hung mount is exactly the case
// we defend — generous enough for a real large read/copy on healthy storage,
// tight enough that a wedge is reclaimed quickly. Override per call via
// { timeoutMs }.
const DEFAULT_TIMEOUTS = {
  default: 15000,
  stat: 15000, exists: 15000, access: 15000, listDir: 15000, readdirNames: 15000, fileInfo: 15000,
  readText: 20000, readChunk: 20000, csvRange: 30000,
  writeFile: 30000, mkdir: 15000, rename: 15000, remove: 20000, unlink: 20000,
  copy: 120000, move: 120000,
  __sleep: 30000,
};

class SafeFs {
  constructor(opts = {}) {
    this.workerPath = opts.workerPath || path.join(__dirname, 'safe-fs-worker.js');
    this.poolSize = Math.max(1, opts.poolSize || 4);
    this.timeouts = { ...DEFAULT_TIMEOUTS, ...(opts.timeouts || {}) };
    this._seq = 1;
    this._restarts = 0;
    this._timeouts = 0;
    this._closed = false;
    this._workers = [];
    for (let i = 0; i < this.poolSize; i++) {
      const rec = { slot: i, worker: null, alive: false, inflight: new Map(), backoff: 0 };
      this._workers.push(rec);
      this._spawnInto(rec, 0);
    }
    // Periodic gauge for the project's telemetry (names-only, cheap).
    this._gauge = setInterval(() => {
      try { const s = this.stats(); global.__vsMetric?.('srv-safefs-inflight', s.inflight); } catch {}
    }, 60000);
    this._gauge.unref?.();
  }

  _spawnInto(rec, backoff = 0) {
    if (this._closed) return;
    const start = () => {
      if (this._closed) return;
      let w;
      try {
        w = new Worker(this.workerPath, { env: process.env });
      } catch (e) {
        // Construction itself failed — retry with backoff; calls fall back to
        // the in-main runOp meanwhile (SafeFs.call handles no-alive-worker).
        this._scheduleBackoff(rec);
        return;
      }
      rec.worker = w;
      rec.alive = true;
      w.on('message', (msg) => this._onMessage(rec, msg));
      w.on('error', (e) => this._onWorkerDown(rec, e));
      w.on('exit', (code) => this._onWorkerDown(rec, new Error('worker exited (' + code + ')')));
      w.unref(); // never hold the process open
    };
    if (backoff > 0) { const t = setTimeout(start, backoff); t.unref?.(); }
    else start();
  }

  _scheduleBackoff(rec) {
    const backoff = Math.min(30000, 500 * Math.pow(2, rec.backoff || 0));
    rec.backoff = (rec.backoff || 0) + 1;
    this._spawnInto(rec, backoff);
  }

  _onMessage(rec, msg) {
    rec.backoff = 0; // a worker that answers is healthy — reset the backoff
    const call = rec.inflight.get(msg.id);
    if (!call) return; // already timed out & rejected + worker being replaced
    rec.inflight.delete(msg.id);
    clearTimeout(call.timer);
    if (msg.ok) return call.resolve(msg.result);
    const e = new Error(msg.error?.message || 'fs error');
    if (msg.error?.code) e.code = msg.error.code;
    if (msg.error?.size != null) e.size = msg.error.size;
    if (msg.error?.status) e.status = msg.error.status;
    call.reject(e);
  }

  // Unexpected worker death (crash/exit) — reject its in-flight calls, respawn.
  _onWorkerDown(rec, err) {
    if (!rec.alive) return; // exit fires after our own terminate; ignore
    rec.alive = false;
    this._rejectInflight(rec, 'storage worker restarted');
    try { rec.worker?.removeAllListeners(); } catch {}
    rec.worker = null;
    this._restarts++;
    try { global.__vsMetric?.('srv-safefs-restart', 1); } catch {}
    this._scheduleBackoff(rec);
  }

  _rejectInflight(rec, message) {
    for (const [, call] of rec.inflight) {
      clearTimeout(call.timer);
      const e = new Error(message);
      e.status = 503;
      call.reject(e);
    }
    rec.inflight.clear();
  }

  _pick() {
    let best = null;
    for (const rec of this._workers) {
      if (!rec.alive || !rec.worker) continue;
      if (!best || rec.inflight.size < best.inflight.size) best = rec;
    }
    return best;
  }

  /**
   * call(op, payload, { timeoutMs }) → Promise<result>.
   * Rejects with a 503-tagged Error (err.status===503, err.safeFsTimeout on
   * deadline) so routes can map to the "storage not responding" response.
   */
  call(op, payload = {}, opts = {}) {
    if (this._closed) return Promise.reject(Object.assign(new Error('safeFs closed'), { status: 503 }));
    const timeoutMs = opts.timeoutMs || this.timeouts[op] || this.timeouts.default;
    const rec = this._pick();
    if (!rec) {
      // No live worker at all — run inline in the main thread as a last resort
      // (no isolation, but keeps file browsing alive if the pool can't start).
      try { return Promise.resolve(_runOpInline(op, payload)).then(r => r.result); }
      catch (e) { return Promise.reject(e); }
    }
    const id = this._seq++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this._onTimeout(rec, id), timeoutMs);
      timer.unref?.();
      rec.inflight.set(id, { resolve, reject, timer, op });
      try {
        rec.worker.postMessage({ id, op, payload });
      } catch (e) {
        clearTimeout(timer);
        rec.inflight.delete(id);
        reject(Object.assign(new Error('storage dispatch failed: ' + e.message), { status: 503 }));
      }
    });
  }

  // Deadline hit — the worker is presumed wedged on a stuck syscall. Reject this
  // call (503), reject its siblings on the same worker, terminate + respawn.
  _onTimeout(rec, id) {
    const call = rec.inflight.get(id);
    if (!call) return;
    rec.inflight.delete(id);
    this._timeouts++;
    try { global.__vsMetric?.('srv-safefs-timeout', 1); } catch {}
    const e = new Error('Storage not responding (operation timed out).');
    e.status = 503;
    e.safeFsTimeout = true;
    call.reject(e);

    const w = rec.worker;
    rec.alive = false;
    rec.worker = null;
    // stop our own listeners so the imminent terminate()/exit doesn't double-respawn
    try { w?.removeAllListeners(); } catch {}
    // reject any remaining siblings queued behind the wedged op
    this._rejectInflight(rec, 'storage worker restarted');
    this._restarts++;
    try { global.__vsMetric?.('srv-safefs-restart', 1); } catch {}
    // terminate in the background (a truly D-state-stuck OS thread may linger,
    // but main is unaffected — it never used the shared pool); respawn NOW so a
    // replacement is ready immediately, not after terminate resolves.
    try { Promise.resolve(w?.terminate?.()).catch(() => {}); } catch {}
    this._scheduleBackoff(rec);
  }

  stats() {
    let inflight = 0, alive = 0;
    for (const r of this._workers) { inflight += r.inflight.size; if (r.alive) alive++; }
    return { poolSize: this.poolSize, alive, inflight, restarts: this._restarts, timeouts: this._timeouts };
  }

  close() {
    this._closed = true;
    clearInterval(this._gauge);
    for (const rec of this._workers) {
      this._rejectInflight(rec, 'safeFs closed');
      try { rec.worker?.removeAllListeners(); rec.worker?.terminate?.(); } catch {}
      rec.worker = null; rec.alive = false;
    }
  }
}

module.exports = { SafeFs };
