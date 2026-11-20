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
const { trackWorker } = require('./worker-memory');
// B-3b03 (lane hub-loop-stalls): NO in-main fallback — a path op never runs on the main thread (see `call`, NO_WORKER).
const DOOR = require('./mount-door');
// The payload keys that name a path (src/safe-fs-worker.js OPS).
const PATH_KEYS = ['path', 'oldPath', 'newPath', 'src', 'dest'];

/** B-3b03: the refusal of a call that found no live worker (the words a route answers when it has no code of its own). */
const NO_WORKER = Object.freeze({ code: 'no-worker', message: 'no worker of {pool} is running — one did not answer in time and is restarting, or none could start' });   // nothing ran on the main thread; ≤ 120 characters (the folder field cuts there)
// B-3b03 follow-up: the pool's own name in words (the hub's unnamed file pool is «the file pool») — made once, at construction
const poolWords = (name) => (!name || name === 'safe-fs' ? 'the file pool' : 'the ' + name + ' pool');
// B-3b03 follow-up (the round's should 2): a worker that cannot START (its module fails to load, it dies before it answers) is
// SAID once a streak, after this many starts in a row with no answer (500 ms + 1 s + 2 s in), naming the pool and the cause
const START_FAILS_SAID = 3;
const noWorkerRefusal = (pool = 'the file pool') => Object.assign(new Error(NO_WORKER.message.replace('{pool}', pool)), { status: 503, code: NO_WORKER.code });   // its read (S4): no `noWorker` flag — in `_wait` that flag means «no worker ever took a call»

// Per-op deadlines (ms). A deadline hit under a hung mount is exactly the case
// we defend — generous enough for a real large read/copy on healthy storage,
// tight enough that a wedge is reclaimed quickly. Override per call via
// { timeoutMs }.
const DEFAULT_TIMEOUTS = {
  default: 15000,
  stat: 15000, exists: 15000, access: 15000, listDir: 15000, readdirNames: 15000, fileInfo: 15000, folderCensus: 15000, dirSlice: 15000, dirIndex: 15000,
  readText: 20000, readChunk: 20000, csvRange: 30000,
  readFile: 30000, xlsxSheets: 60000, // lane file-preview-mount: a preview's ≤ 20 MB read; a workbook's read + parse (a deadline also ends a runaway parse)
  writeFile: 30000, mkdir: 15000, rename: 15000, remove: 20000, unlink: 20000,
  copy: 120000, move: 120000,
  __sleep: 30000,
};

// lane file-preview-mount r2: a document PARSE is CPU, the pool is IO. A workbook's parse held an IO worker for up to its
// 60 s, `_pick` balanced the explorer's stats onto it by in-flight count, and a sibling op's missed deadline TERMINATED
// the worker (read as a wedged mount) with the parse in it. A parse runs in its OWN lane — a SafeFs of one worker beside
// this pool (`lane(name)`, spawned at its first op), one op at a time: the next waits HERE, in main, bounded by its own
// deadline, and is refused by name (`busy`) if its turn never came — never queued into the worker, where its deadline
// would kill the parse ahead of it. A lane never falls back in-main: with its worker respawning (a deadline kill) the op
// waits for the new one. The IO pool never holds a parse; a parse never dies of a stat, nor runs on the main thread.
// r3: a waiting op has two clocks (the WAIT, then its own deadline from the SEND), is asked the blocked-mount door again
// when it is sent, and leaves the queue when its request is gone (opts.signal) — see _wait.
// lane resume-all-paced (L3): a conversation's history read in PAGES runs in the `history` lane — its pages answer from ONE parsed
// snapshot held INSIDE the worker that read page 0; `_pick` (least busy) sent a later page to the other worker whenever any other
// transcript op held the first (a claude warm, a discovery sweep, a minimap scan) — that page found no snapshot, the read began
// again and then fell back to the one-shot read (every record in one message: the main thread's ~100 ms deserialize, clone buffers
// the size of the records). One worker, one page at a time: every page reaches its snapshot.
const LANES = {
  parse: { poolSize: 1, busy: { message: 'another document is being parsed — try again in a moment', code: 'parse_busy' } },
  history: { poolSize: 1, busy: { message: "another conversation's history is being read — try again in a moment", code: 'history_busy' } },
};
const OP_LANE = { xlsxSheets: 'parse', boundedParsedPage: 'history', codexHistoryMergedPage: 'history' };   // the ops that always run in a lane (a caller may name one: call(op, p, { lane }))
const gone = () => Object.assign(new Error('the request was closed before its turn'), { status: 499, code: 'request_gone' });

class SafeFs {
  constructor(opts = {}) {
    this.workerPath = opts.workerPath || path.join(__dirname, 'safe-fs-worker.js');
    this.name = opts.name || 'safe-fs'; // the memory census names slot k `<name>#k` (src/worker-memory.js)
    this._words = poolWords(opts.name);   // B-3b03: its refusal and its said line name it
    this._downSaid = false;               // B-3b03 follow-up: a streak of failed starts was said (cleared at the next answer)
    // B-3b03: `opts.inlineRun` (the release's in-main fallback, 2.235.0) is no longer read — the pool never runs an op inline
    this._blockedOf = opts.blocked || DOOR.blocked;   // B-afc4: (path) → blocked mount root | false
    this.poolSize = Math.max(1, opts.poolSize || 4);
    this.timeouts = { ...DEFAULT_TIMEOUTS, ...(opts.timeouts || {}) };
    this._opts = opts;
    this._lanes = new Map();            // lane name → its SafeFs (LANES)
    this._serial = opts.serial || null; // a lane's own row: one op at a time, the rest wait in _waiting
    this._waiting = [];
    this._seq = 1;
    this._restarts = 0;
    this._timeouts = 0;
    this._closed = false;
    this._workers = [];
    for (let i = 0; i < this.poolSize; i++) {
      const rec = { slot: i, worker: null, alive: false, inflight: new Map(), backoff: 0, fails: 0 };
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
        w = new Worker(this.workerPath, { env: process.env, ...(this._opts.resourceLimits ? { resourceLimits: this._opts.resourceLimits } : {}) });   // a pool may bound its workers' heaps (the transcript pool's history lane: lane resume-all-paced L3 — a HARD limit a parent --max-old-space-size replaces; the worker's own check is the bound that binds)
      } catch (e) {
        // Construction itself failed — retry with backoff; calls are REFUSED by name meanwhile (B-3b03: never an op in-main).
        this._scheduleBackoff(rec);
        this._failedStart(rec, e);
        return;
      }
      rec.worker = trackWorker(this.name + '#' + rec.slot, w);
      rec.alive = true;
      w.on('message', (msg) => this._onMessage(rec, msg));
      w.on('error', (e) => this._onWorkerDown(rec, e));
      w.on('exit', (code) => this._onWorkerDown(rec, new Error('worker exited (' + code + ')')));
      w.unref(); // never hold the process open
      if (this._serial) this._drain(); // a lane's respawned worker takes the op that waited
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
    if (msg && msg.ev === 'memory') return; // the memory census's answer (src/worker-memory.js askMemory takes it)
    rec.backoff = 0; // a worker that answers is healthy — reset the backoff
    rec.fails = 0;
    if (this._downSaid) { this._downSaid = false; console.log(`[safe-fs] ${this._words}: a worker answers again`); }
    const call = rec.inflight.get(msg.id);
    if (!call) return; // already timed out & rejected + worker being replaced
    rec.inflight.delete(msg.id);
    if (rec.inflight.size === 0) rec.worker?.unref?.();
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
    this._failedStart(rec, err);
  }

  /** B-3b03 follow-up: a worker that went down (or could not be built) is one more failed start until a worker ANSWERS — after
   *  START_FAILS_SAID in a row the pool says so ONCE a streak (the release's in-main fallback required the worker's module, so a
   *  module that failed to load stopped the hub at boot, loudly; now every call is refused by name and this line names why). */
  _failedStart(rec, err) {
    rec.fails = (rec.fails || 0) + 1;
    if (rec.fails !== START_FAILS_SAID || this._downSaid) return;
    this._downSaid = true;
    const why = String((err && err.message) || err || 'no cause given').split('\n')[0].slice(0, 300);
    console.error(`[safe-fs] ${this._words}: a worker ended ${START_FAILS_SAID} times in a row before it answered (${why}) — every call is refused by name until one answers; it is tried again, the wait doubling up to 30 s`);
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
  _blocked(payload) {
    for (const k of PATH_KEYS) {
      const p = payload && payload[k];
      const mp = typeof p === 'string' && p ? this._blockedOf(p) : false;
      if (mp) return mp;
    }
    return false;
  }

  /** The lane `name` (LANES) — a SafeFs of its own beside this pool, the same worker script / door / deadlines. */
  lane(name) {
    let l = this._lanes.get(name);
    if (!l) {
      const L = LANES[name];
      if (!L) throw new Error('unknown safeFs lane: ' + name);
      // a lane takes its parent's options, then its OWN (opts.laneOpts[name] — the transcript pool bounds its `history` lane's heap,
      // and only that lane's: lane resume-all-paced L3 cure); never the parent's laneOpts again
      const { laneOpts, ...parent } = this._opts;
      l = new SafeFs({ ...parent, ...((laneOpts && laneOpts[name]) || {}), name: `${this.name}-${name}`, poolSize: L.poolSize, serial: L, timeouts: this.timeouts });
      this._lanes.set(name, l);
    }
    return l;
  }

  call(op, payload = {}, opts = {}) {
    if (this._closed) return Promise.reject(Object.assign(new Error('safeFs closed'), { status: 503 }));
    const lane = !this._serial && (opts.lane || OP_LANE[op]);
    if (lane) return this.lane(lane).call(op, payload, { timeoutMs: opts.timeoutMs, waitMs: opts.waitMs, signal: opts.signal });
    // B-afc4 (lane mount-readers-blocked): a path under a BLOCKED mount is refused at the pool's door, in ms — never
    // queued into a worker that would hang inside a dead FUSE (a hung worker is not killable either).
    const mp = this._blocked(payload);
    if (mp) return Promise.reject(DOOR.refusal(mp));
    const timeoutMs = opts.timeoutMs || this.timeouts[op] || this.timeouts.default;
    const rec = this._pick();
    if (this._serial && opts.signal?.aborted) return Promise.reject(gone());
    if (this._serial && (!rec || rec.inflight.size || this._waiting.length)) return this._wait(op, payload, timeoutMs, opts);
    if (!rec) {
      // B-3b03 (lane hub-loop-stalls, the coordinator's law): THE POOL NEVER RUNS A PATH OP ON THE MAIN THREAD. With no live worker
      // (every one between a deadline kill and its respawn backoff, or none could start) the call is REFUSED BY NAME — 503,
      // `no-worker` — and its caller says so. The release ran it inline «as a last resort»: a hung path then held the whole hub
      // (scripts/test-safe-fs-no-inline.mjs measured it: the loop lost 1.5 s to a 1.5 s stall). B-55dc's `noInline` is now the rule.
      return Promise.reject(noWorkerRefusal(this._words));   // the hub's file pool is the unnamed one: «the file pool»
    }
    return this._send(rec, op, payload, timeoutMs);
  }

  // A lane's op while one runs (or while its worker respawns): it waits in main (never in the worker). r3: TWO clocks —
  // the WAIT (opts.waitMs, else its deadline): a turn that never came is refused by the lane's own words (status 503, its
  // code) — or, with nothing ahead of it (the worker never came back), as a storage that is not responding — never sent;
  // the RUN: its deadline, counted from the SEND (r2 sent the leftover of the wait: a parse that waited 950 ms of 1500 ran
  // 550 ms and was killed as a wedged storage, the worker respawned). A job whose request is gone (opts.signal aborted —
  // the route's response closed before its answer) leaves the queue, never sent; a RUNNING one finishes (one worker).
  _wait(op, payload, timeoutMs, opts = {}) {
    return new Promise((resolve, reject) => {
      const job = { op, payload, timeoutMs, resolve, reject, signal: opts.signal || null };
      const leave = (e) => {
        const i = this._waiting.indexOf(job);
        if (i < 0) return;
        this._waiting.splice(i, 1);
        this._unwait(job);
        reject(e);
      };
      job.timer = setTimeout(() => leave(this._workers.some((r) => r.inflight.size)
        ? Object.assign(new Error(this._serial.busy.message), { status: 503, code: this._serial.busy.code })
        : Object.assign(new Error('Storage not responding (operation timed out).'), { status: 503, safeFsTimeout: true, noWorker: !this._ran && !this._workers.some((r) => r.alive) })), opts.waitMs || timeoutMs);   // (pool-wide facts — every SafeFs pool and lane's errors carry noWorker / deadline; the sessions route is their one reader today) noWorker: no worker of this pool EVER took a call and none is alive (the sessions sweep's -cure: only then does its route walk on the loop — a wait that ends in a killed worker's respawn back-off is not that: the storage that held it is never walked on the loop)
      job.timer.unref?.();
      if (job.signal) { job.onAbort = () => leave(gone()); job.signal.addEventListener('abort', job.onAbort, { once: true }); }
      this._waiting.push(job);
    });
  }

  _unwait(job) {
    clearTimeout(job.timer);
    if (job.onAbort) job.signal.removeEventListener('abort', job.onAbort);
  }

  _drain() {
    while (this._waiting.length) {
      const rec = this._workers.find((r) => r.alive && r.worker && r.inflight.size === 0);
      if (!rec) return; // busy, or respawning — the next settle / spawn drains
      const job = this._waiting.shift();
      this._unwait(job);
      if (job.signal?.aborted) { job.reject(gone()); continue; }
      // B-afc4 asked again at the SEND (r3): a mount marked blocked while the job waited is refused in ms, never sent into
      // a worker that would hang inside it
      const mp = this._blocked(job.payload);
      if (mp) { job.reject(DOOR.refusal(mp)); continue; }
      this._send(rec, job.op, job.payload, job.timeoutMs).then(job.resolve, job.reject);
    }
  }

  _send(rec, op, payload, timeoutMs) {
    const id = this._seq++;
    this._ran = true;   // a worker of this pool TOOK a call — sticky: a killed worker's respawn wait is never «no worker» (the sessions sweep's -cure, its read's M1)
    const p = new Promise((resolve, reject) => {
      const timer = setTimeout(() => this._onTimeout(rec, id), timeoutMs);
      timer.unref?.();
      rec.inflight.set(id, { resolve, reject, timer, op });
      try {
        rec.worker.postMessage({ id, op, payload });
        // Hold the event loop open while work is in flight — workers are
        // unref'd at spawn, and an idle main loop would otherwise let the
        // process exit before the reply lands (bit the test harness; a
        // draining server has the same shape).
        if (rec.inflight.size === 1) rec.worker.ref?.();
      } catch (e) {
        clearTimeout(timer);
        rec.inflight.delete(id);
        reject(Object.assign(new Error('storage dispatch failed: ' + e.message), { status: 503 }));
      }
    });
    if (this._serial) { const next = () => this._drain(); p.then(next, next); }
    return p;
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
    e.deadline = true;   // the call RAN in a worker and overran its deadline (never a missing worker)
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
    // but main is unaffected — it never used the shared pool); the replacement is
    // scheduled at once (the first step, below), never after terminate resolves.
    try { Promise.resolve(w?.terminate?.()).catch(() => {}); } catch {}
    // B-3b03 follow-up (the coordinator's law): a worker ended AT ITS DEADLINE started and took a call — it comes back at the
    // FIRST step (500 ms), never up the ladder: the ladder (1 s, 2 s … 30 s) is for a worker that cannot START. A dead path that
    // ends every fresh worker at its deadline thus leaves refusal windows of ~500 ms, never 30 s, for healthy paths too
    rec.backoff = 0; rec.fails = 0;
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
    for (const job of this._waiting.splice(0)) { this._unwait(job); job.reject(Object.assign(new Error('safeFs closed'), { status: 503 })); }
    for (const l of this._lanes.values()) l.close();
    for (const rec of this._workers) {
      this._rejectInflight(rec, 'safeFs closed');
      try { rec.worker?.removeAllListeners(); rec.worker?.terminate?.(); } catch {}
      rec.worker = null; rec.alive = false;
    }
  }
}

module.exports = { SafeFs, NO_WORKER, noWorkerRefusal };
