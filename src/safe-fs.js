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

const fs = require('fs');   // B-23e5: the mount table only (fs.promises, off the loop) — every path op runs in a worker
const path = require('path');
const { Worker } = require('worker_threads');
const { trackWorker } = require('./worker-memory');
// B-3b03 (lane hub-loop-stalls): NO in-main fallback — a path op never runs on the main thread (see `call`, NO_WORKER).
const DOOR = require('./mount-door');
// The payload keys that name a path (src/safe-fs-worker.js OPS).
const PATH_KEYS = ['path', 'oldPath', 'newPath', 'src', 'dest'];
// B-23e5's remainder: a call's paths — its keys (a pool's own, row B-422c: the transcript pool's `fp`), and the folder rule's own look (`paths`: two dead children looked at with no follow)
const pathsOf = (payload, keys = PATH_KEYS) => [...keys.map((k) => payload[k]), ...(Array.isArray(payload.paths) ? payload.paths : [])].filter((p) => typeof p === 'string' && p);
// r1442 (E): a press's join is named by its op and its paths (+ its small fields) — a write's `content` (up to 10 MB) never: it never joins
const pressKeyOf = (op, payload) => (!payload || payload.content != null ? null : op + '\u0000' + JSON.stringify(payload));
const CLIMB_LOOK_MS = 1500;   // (b): the no-follow look's own deadline — and the most it waits for an IDLE worker (never behind a live call)
// B-23e5 (lane hub-loop-stalls, the coordinator's ruling 2026-11-20): ONE DEAD THING, ONE CALL. A path whose call ended a worker AT
// ITS DEADLINE is remembered for HUNG_MS; a call naming that path or one under it is REFUSED BY NAME at the pool's door, without
// a worker — never sent to a fresh worker that the same hung syscall would end again (each end parks one thread a real hung mount
// never gives back: about 930 an hour across 4 slots on a path the mount door does not know). The bound releases it: the first
// call after it is asked again. The pool and its lanes keep ONE memory, at most HUNG_KEEP paths (the oldest leaves first).
const HUNG_MS = 30000, HUNG_KEEP = 256, HUNG_CAP_X = 16;   // r275: a path that ends a worker AGAIN is kept twice as long each time, at most 16 × (8 min)
// an op that reads a folder's CHILDREN (a listing, a walk, a recursive copy / move / remove) can hang on ONE dead child: a listing's path is
// remembered EXACTLY (the same call is not asked again) — never everything under it; an op on one target is remembered AT OR UNDER
const WIDE_OPS = new Set(['listDir', 'readdirNames', 'folderCensus', 'contextFiles', 'remove', 'unlink', 'copy', 'move']);
// never remembered AT OR UNDER, never named by two dead children: the root, the home and every folder above it — each spelling the
// process knows ($HOME, os.homedir(); a trailing slash cut — never the passwd home, test-architecture §68). One dead child there never
// refuses the person's whole tree. (A home reached by another spelling — a symlinked home's real path — is not known here: such a path
// is remembered at its own spelling only.)
const homesOf = () => {
  const os = require('os'), out = new Set();
  for (const h of [process.env.HOME, (() => { try { return os.homedir(); } catch { return ''; } })()]) {
    const x = String(h || '').startsWith('/') ? path.resolve(String(h)).replace(/\/+$/, '') : '';   // `/home//u`, `/home/u/.` read as /home/u
    if (x) out.add(x);
  }
  return out;
};
const guardedPath = (p) => {
  const x = String(p || '').replace(/\/+$/, '') || '/';
  if (x === '/') return true;
  for (const h of homesOf()) if (h === x || h.startsWith(x + '/')) return true;
  return false;
};
// TWO SIBLINGS ⇒ THEIR FOLDER only on ONE storage: the folder and both siblings on the same mount (/proc/self/mountinfo, read OFF the
// loop when a second sibling ends) — a dead mount POINT never names the healthy folder that holds it; no table, no climb
const MOUNTINFO = '/proc/self/mountinfo';
/** PURE: the mount point a path lives on (the longest mount-point prefix in /proc/self/mountinfo text), or null — the same reading as
 *  src/local-index.js mountOf (parity-pinned in test-safe-fs-path-memory; that module is not required here: the device bundle carries
 *  this pool, and its size budget, test-architecture §107). */
function mountTargetOf(p, text) { const m = mountFactsOf(p, text); return m ? m.target : null; }
/** PURE: {target, fstype} of the mount a path lives on (the same longest-prefix reading), or null. */
function mountFactsOf(p, text) {
  const file = String(p || '');
  if (!file.startsWith('/')) return null;
  let best = null;
  for (const t of mountRowsOf(text)) {
    if (!(t.target === '/' || file === t.target || file.startsWith(t.target + '/'))) continue;
    if (best == null || t.target.length >= best.target.length) best = t;
  }
  return best;
}
const mountRowsOf = (text) => {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    const dash = line.indexOf(' - ');
    if (dash < 0) continue;
    const target = (line.slice(0, dash).split(' ')[4] || '').replace(/\\040/g, ' ');
    if (target) out.push({ target, fstype: line.slice(dash + 3).split(' ')[0] || '' });
  }
  return out;
};
// an op whose deadline end can come from SIZE on a healthy storage (a long copy, a big tree removed, a deep walk) proves no dead path:
// never noted (it still asks the memory before it runs)
const SIZE_OPS = new Set(['copy', 'move', 'remove', 'unlink', 'contextFiles', 'folderCensus']);
// an exact entry refuses the same op again — a stat with entryCount (Properties) is its own op, never a plain stat
const opKeyOf = (op, payload) => (op === 'stat' && payload && payload.entryCount ? 'stat+entryCount' : String(op || ''));
/** an exact entry's ops → whether it refuses this call: the same op within its own bound; a listing within the largest listing's bound */
const selfRefuses = (self, wide, key, timeoutMs) => {
  if (!self) return false;
  if (self[key] != null && timeoutMs <= self[key]) return true;
  if (!wide) return false;
  for (const [k, b] of Object.entries(self)) if (WIDE_OPS.has(k) && timeoutMs <= b) return true;
  return false;
};
const monoNow = () => performance.now();   // a wall-clock step never keeps a path refused for hours, nor frees it early
const PATH_HUNG = Object.freeze({ code: 'path-hung', message: 'this folder or file did not answer in time and is not asked again for {s} s: {path}' });
// r275: the refusal's words fit the 120 characters the folder field shows — a long path is cut in its middle (`hungPath` keeps it whole)
const REFUSAL_MAX = 120;
const fitPath = (p, room) => { const x = String(p); if (x.length <= room) return x; const keep = Math.max(2, room - 1), head = Math.ceil(keep / 2), tail = keep - head; return x.slice(0, head) + '…' + x.slice(x.length - tail); };
const pathHungRefusal = (p, ms) => {
  const head = PATH_HUNG.message.replace('{s}', String(Math.max(1, Math.ceil(ms / 1000))));
  return Object.assign(new Error(head.replace('{path}', () => fitPath(p, REFUSAL_MAX - (head.length - '{path}'.length)))), { status: 503, code: PATH_HUNG.code, hungPath: p, retryMs: Math.max(0, ms) });
};

/** B-3b03: the refusal of a call that found no live worker (the words a route answers when it has no code of its own). */
const NO_WORKER = Object.freeze({ code: 'no-worker', message: 'no worker of {pool} is running — one did not answer in time and is restarting, or none could start' });   // nothing ran on the main thread; ≤ 120 characters (the folder field cuts there)
// B-3b03 follow-up: the pool's own name in words (the hub's unnamed file pool is «the file pool») — made once, at construction
const poolWords = (name) => (!name || name === 'safe-fs' ? 'the file pool' : 'the ' + name + ' pool');
// B-3b03 follow-up (the round's should 2): a worker that cannot START (its module fails to load, it dies before it answers) is
// SAID once a streak, after this many starts in a row with no answer (500 ms + 1 s + 2 s in), naming the pool and the cause
const START_FAILS_SAID = 3;
// B-d833's fourth shape (its H9, asked of lane hub-loop-stalls): a call asked `idleOnly` runs only on an IDLE live worker, else it is
// refused at once by name — never sent to wait inside a busy worker (a worker held by a hung listing holds every call queued in it)
const NO_IDLE = Object.freeze({ code: 'no-idle-worker', message: 'every worker of {pool} is busy — the call was not sent' });
const noIdleRefusal = (pool = 'the file pool') => Object.assign(new Error(NO_IDLE.message.replace('{pool}', pool)), { status: 503, code: NO_IDLE.code });
// B-23e5's remainder (r1378 (2)): ONE TRY MEANS ONE — a call at or under a path a person's press is still trying is told so (never a
// second worker parked on it); the same press again joins the first
const PATH_TRYING = Object.freeze({ code: 'path-trying', message: 'this folder or file is still being tried — the first press on it has not answered yet: {path}' });
const pathTryingRefusal = (p) => Object.assign(new Error(PATH_TRYING.message.replace('{path}', String(p || ''))), { status: 503, code: PATH_TRYING.code, tryingPath: p });
const noWorkerRefusal = (pool = 'the file pool') => Object.assign(new Error(NO_WORKER.message.replace('{pool}', pool)), { status: 503, code: NO_WORKER.code });   // its read (S4): no `noWorker` flag — in `_wait` that flag means «no worker ever took a call»

// Per-op deadlines (ms). A deadline hit under a hung mount is exactly the case
// we defend — generous enough for a real large read/copy on healthy storage,
// tight enough that a wedge is reclaimed quickly. Override per call via
// { timeoutMs }.
const DEFAULT_TIMEOUTS = {
  default: 15000,
  stat: 15000, exists: 15000, access: 15000, listDir: 15000, readdirNames: 15000, fileInfo: 15000, folderCensus: 15000, dirSlice: 15000, dirIndex: 15000, pathStat: 15000,
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
  // B-23e5: a parse's deadline end is a runaway CPU parse, never a dead path — the lane asks the memory, it never adds to it
  parse: { poolSize: 1, noteHung: false, busy: { message: 'another document is being parsed — try again in a moment', code: 'parse_busy' } },
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
    // row B-422c: the payload keys that NAME a path (the door's blocked check, B-23e5's memory, its forgiving) — PATH_KEYS, plus a
    // pool's own (the transcript pool names its file `fp`: a transcript read that ran out its deadline is remembered like any path)
    this._pathKeys = Array.isArray(opts.pathKeys) && opts.pathKeys.length ? [...new Set([...PATH_KEYS, ...opts.pathKeys])] : PATH_KEYS;   // a stand-in built without this constructor reads PATH_KEYS
    this._hungMs = opts.hungMs === 0 ? 0 : opts.hungMs > 0 ? opts.hungMs : HUNG_MS;   // B-23e5: how long a path that ended a worker at its deadline is not asked (0 = no memory: a pool that must keep asking)
    this._hung = new Map();                                  // B-23e5: path → { until, exact, op, bound } (one memory with the lanes)
    this._mountsText = typeof opts.mountsText === 'function' ? opts.mountsText : () => fs.promises.readFile(MOUNTINFO, 'utf8');   // B-23e5: the mount table, read off the loop
    this._clock = typeof opts.clock === 'function' ? opts.clock : monoNow;   // r275: the memory's clock (a suite advances its own)
    this._strikes = new Map();                               // r275: path → { n, at } — a repeat end of the same path doubles its time
    this._pressing = new Map();                              // r316: a person's presses in flight, by op and payload — two at once are one call
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
    if (rec.looking === msg.id) rec.looking = 0;   // its look answered: the worker takes calls again
    this._forgive(call.payload, call.op);   // r275 / r316: the path answered — what its entry's kind lets this reply clear leaves
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
    rec.looking = 0;
  }

  _pick() {
    let best = null;
    for (const rec of this._workers) {
      if (!rec.alive || !rec.worker) continue;
      if (rec.looking) continue;   // r1442 (E): a worker running the folder rule's look takes no other call (a look on a dead share ends it)
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
    for (const p of payload ? pathsOf(payload, this._pathKeys || PATH_KEYS) : []) {   // the folder rule's look (`paths`) too — never into a blocked mount
      const mp = this._blockedOf(p);
      if (mp) return mp;
    }
    return false;
  }

  /** B-23e5: the remembered path that refuses this call (and the ms until it may be asked again), or null. An entry refuses a call
   *  only if the call would wait NO LONGER than its `bound`: 1.5 × the deadline that path ran out, or — for an op ended EARLY by a
   *  call queued behind it — the time it had run, at least that call's deadline (a caller that waits longer is asked again: a slow but alive storage that
   *  missed a 5 s read is still listed in 15 s). AT OR UNDER (`under`: a one-target end, a named folder) refuses that path and what is
   *  under it; THE PATH ITSELF (`self`: a listing, a Properties stat, the root / the home) refuses the op that hung within its own
   *  bound and, a listing's, every listing of that exact path. The bound passed ⇒ it leaves. */
  _hungOf(payload, op = null, timeoutMs = Infinity) { return this._hungAll(payload, op, timeoutMs, true)[0] || null; }
  /** Every remembered entry that refuses this call — r1442 (A): a press tried despite the memory is held under EACH (a dead file and the
   *  folder its climb named after it both refuse a press on that file: a press on its sibling must hear «still trying»). */
  _hungAll(payload, op = null, timeoutMs = Infinity, firstOnly = false) {
    const out = [];
    if (!this._hung || !this._hung.size || !payload) return out;   // a pool built without its constructor (a suite's stand-in) has no memory
    const now = this._clock(), wide = WIDE_OPS.has(op), key = opKeyOf(op, payload);
    for (const k of (this._pathKeys || PATH_KEYS)) {
      const p = payload[k];
      if (typeof p !== 'string' || !p) continue;
      for (const [h, m] of this._hung) {
        if (now >= m.until) { this._hung.delete(h); continue; }
        // AT OR UNDER (a one-target end, a named folder): this path and what is under it, for a caller no more patient than `under`
        const under = m.under != null && timeoutMs <= m.under && (p === h || p.startsWith(h.endsWith('/') ? h : h + '/'));
        // THE PATH ITSELF (a listing, a Properties stat, the root / the home): the op that hung — and, a listing's, every listing
        const self = p === h && selfRefuses(m.self, wide, key, timeoutMs);
        if (under || self) { out.push({ path: h, ms: m.until - now }); if (firstOnly) return out; }
      }
    }
    return out;
  }
  /** B-23e5: remember the paths of the op that ended its worker at its deadline (`ms` = that deadline, or with `early` the time it
   *  had run when a call queued behind it ended the worker; the oldest leaves past HUNG_KEEP). TWO SIBLINGS DEAD ⇒ THEIR FOLDER: a
   *  second one-target end under the same folder within the bound — from ANOTHER call — remembers the folder, at or under (a dead
   *  share browsed file by file costs two ends, not one a file), only when the folder and both lie on ONE storage (the mount table,
   *  read off the loop: a dead mount POINT never names the healthy folder that holds it) and never the root, the home or above.
   *  Returns the climb's promise (callers ignore it; a suite waits on it). */
  _noteHung(payload, op, ms = Infinity, { early = false } = {}) {
    if (!payload || !this._hungMs || !this._hung || SIZE_OPS.has(op)) return Promise.resolve();
    const look = op === 'lstatKinds';   // (b), r1378 (4): the look's own hang is remembered like any op — and never climbs (it IS a climb's)
    const now0 = this._clock(), bound = Number.isFinite(ms) ? (early ? 1 : 1.5) * ms : Infinity, key = opKeyOf(op, payload);
    const mine = new Set(pathsOf(payload, this._pathKeys || PATH_KEYS));   // one call's two paths (a rename) are one sibling
    const climbs = [];
    for (const p of mine) {
      if (look && this._hung.has(p)) continue;   // the look's own hang names no strike on a path already remembered (its folder is named by it)
      const until = now0 + this._spanOf(p, now0);   // r275: the time doubles on a repeat end of this path (capped)
      const exact = WIDE_OPS.has(op) || key === 'stat+entryCount' || guardedPath(p);
      this._putHung(p, exact ? { until, under: null, self: { [key]: bound }, ...(early ? { early: true } : {}) } : { until, under: bound, self: {}, ...(early ? { early: true } : {}) });
      const dir = path.dirname(p), was = this._hung.get(dir), now = this._clock();
      if (!look && !exact && !early && dir && dir !== p && !guardedPath(dir) && (!was || was.under == null || was.until <= now)) {   // a folder whose LISTING hung may still be named; an EARLY end never names one
        // EVERY remembered dead sibling is looked at with it (at most 7): a link among them never stops two real dead children (its read)
        const qs = []; for (const [q, m] of this._hung) if (q !== p && !mine.has(q) && m.under != null && !m.early && m.until > now && path.dirname(q) === dir) qs.push(q);
        qs.splice(0, Math.max(0, qs.length - 7));   // the NEWEST seven (the map keeps the oldest first): old links never crowd out new dead children
        if (qs.length) climbs.push(this._climb(dir, p, qs, { until: now0 + this._hungMs, under: bound, self: {} }));
      }
    }
    return Promise.all(climbs);
  }
  /** r275 (THE TOTAL BOUNDED, not only the rate): a path that ends a worker again within twice its last span is kept twice as long —
   *  30 s, 60 s, 2 min … at most HUNG_CAP_X × hungMs; a reply from it (forgiven) starts it over. */
  _spanOf(p, now) {
    const st = this._strikes && this._strikes.get(p);
    const n = st && now - st.at <= 2 * st.span ? st.n + 1 : 1;
    const span = Math.min(this._hungMs * HUNG_CAP_X, this._hungMs * Math.pow(2, n - 1));
    if (this._strikes) { this._strikes.delete(p); this._strikes.set(p, { n, at: now, span }); while (this._strikes.size > HUNG_KEEP) this._strikes.delete(this._strikes.keys().next().value); }
    return span;
  }
  /** r275 / r316 (A PATH THAT REPLIES IS FORGIVEN — by the entry's own kind): any answer of a worker (a result, or the file system's
   *  own error) clears AT OR UNDER for a reply at or under its path (a folder named above it too); THE PATH ITSELF leaves only on a
   *  reply at exactly that path from an op it refuses (a listing forgives a listing — a folder's own stat never forgives its listing,
   *  which hangs on one dead child while the folder is alive). An entry with nothing left leaves, its repeat count with it. */
  _forgive(payload, op) {
    if (!payload || !this._hung || !this._hung.size) return;
    const wide = WIDE_OPS.has(op), key = opKeyOf(op, payload);
    for (const k of (this._pathKeys || PATH_KEYS)) {
      const p = payload[k];
      if (typeof p !== 'string' || !p) continue;
      for (const [h, m] of [...this._hung]) {
        let changed = false;
        if (m.under != null && (p === h || p.startsWith(h.endsWith('/') ? h : h + '/'))) { m.under = null; changed = true; }
        if (p === h && m.self) for (const sk of Object.keys(m.self)) if (sk === key || (wide && WIDE_OPS.has(sk))) { delete m.self[sk]; changed = true; }
        if (changed && m.under == null && !Object.keys(m.self || {}).length) { this._hung.delete(h); if (this._strikes) this._strikes.delete(h); }
      }
    }
  }
  /** B-23e5: one memory entry — a later observation of a live entry never shrinks what is known: AT OR UNDER takes the larger bound of
   *  the one-target ends (a listing's proof never reaches what is under the folder); THE PATH ITSELF keeps every op that hung, each
   *  with its own larger bound (a folder named by its children keeps its own listing's proof); early only if both were. */
  _putHung(key, m) {
    const was = this._hung.get(key), live = was && was.until > this._clock();
    this._hung.delete(key);
    let next = m;
    if (live) {
      const self = { ...(was.self || {}) };
      for (const [k, b] of Object.entries(m.self || {})) self[k] = self[k] != null ? Math.max(self[k], b) : b;
      const under = was.under != null && m.under != null ? Math.max(was.under, m.under) : was.under != null ? was.under : m.under;
      next = { until: Math.max(was.until, m.until), under, self, ...(was.early && m.early ? { early: true } : {}) };
    }
    this._hung.set(key, next);
    while (this._hung.size > HUNG_KEEP) this._hung.delete(this._hung.keys().next().value);
  }
  /** B-23e5: name the folder of two dead siblings only on ONE storage — the mount table read off the loop, by path text; an automounter's
   *  folder never; unreadable ⇒ no climb. What is under a named folder is refused with it, other mounts too: they are reached through it. */
  _climb(dir, p, qs, m) {
    // r1733 (5): a SERIAL lane never climbs — it runs one op at a time, so its look would queue behind the op it runs (the law: an idle worker only)
    if (this._serial) return Promise.resolve();
    return Promise.resolve().then(() => this._mountsText()).then((text) => {
      const a = mountFactsOf(dir, text), b = mountTargetOf(p, text), same = qs.filter((q) => { const c = mountTargetOf(q, text); return !!c && c === b; });
      if (!a || !b || a.target !== b || !same.length) return;   // a mount point of its own (or two storages): the folder stays asked
      if (a.fstype === 'autofs') return;   // an automounter's folder: a dead key has no line yet (its mount is what hangs) — never named
      // B-23e5's remainder (b): a child reached through a SYMLINK lies where its link points, not on this folder's storage — two links into
      // dead mounts never name their healthy folder. Each child looked at with NO follow (one pool call, short, past the memory): TWO
      // children that are no link (a file, nothing there) name it; no answer in time (a really dead share) names it; links keep it asked
      // one look a folder at a time (r1442 (E)): a sibling that ends while a look is out WAITS for it, then looks with what is known —
      // never a second worker at once, never a sibling dropped (its delta read: two ends together, the first look saw one of them)
      const prev = (this._lookingDirs = this._lookingDirs || new Map()).get(dir);
      if (prev) return prev.then(() => { const n = this._hung && this._hung.get(dir); if (n && n.under != null && n.until > this._clock()) return; return this._climb(dir, p, qs, m); });
      // only the children STILL remembered dead are looked at (one that answered meanwhile — a press tried and forgiven — never counts)
      const live = [p, ...same].filter((x) => { const e = this._hung && this._hung.get(x); return !!e && e.under != null && !e.early && e.until > this._clock(); });   // the sibling rule's own test
      if (live.length < 2) return;
      const look = this._lookIdle({ paths: live }).then((r) => {
        if (!r) return;   // no idle worker within the bound (or refused): the folder stays asked — named by a later sibling
        if (!r.timedOut && !(Array.isArray(r.links) && r.links.filter((x) => !x).length >= 2)) return;
        if (!this._hung || this._clock() >= m.until) return;
        this._putHung(dir, m);
      }).finally(() => { if (this._lookingDirs.get(dir) === look) this._lookingDirs.delete(dir); });
      this._lookingDirs.set(dir, look);
      return look;
    }, () => {});
  }

  /** (b) the folder rule's no-follow look on an IDLE worker only — never queued behind a live call (its short deadline would end that
   *  call's worker): no idle one ⇒ tried again every 100 ms up to CLIMB_LOOK_MS; its own deadline is a deadline (remembered, r1378 (4)).
   *  A timeout answers { timedOut } (the children are on dead storage: their folder is named); any other refusal null. */
  _lookIdle(payload) {
    const t0 = performance.now();
    const once = () => this.call('lstatKinds', payload, { timeoutMs: CLIMB_LOOK_MS, look: true, idleOnly: true }).then((r) => r || { links: [] }, (e) => {
      if (e && (e.code === 'no-idle-worker' || e.code === 'no-worker') && !this._closed && performance.now() - t0 < CLIMB_LOOK_MS) return new Promise((res) => setTimeout(res, 100)).then(once);
      return e && e.safeFsTimeout ? { links: [], timedOut: true } : null;
    });
    return once();
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
      l._hung = this._hung; l._strikes = this._strikes; l._clock = this._clock;   // B-23e5: one dead thing is one dead thing for the pool and its lanes
      if (L.noteHung === false) l._hungMs = 0;   // B-23e5: a parse lane's end is its own runaway parse — asked, never added to
      this._lanes.set(name, l);
    }
    return l;
  }

  call(op, payload = {}, opts = {}) {
    if (this._closed) return Promise.reject(Object.assign(new Error('safeFs closed'), { status: 503 }));
    // r316's should: two presses of the same thing at once JOIN one call in flight — never two workers for one person's hand; the
    // joined caller rides the FIRST caller's deadline and signal (harmless with this door: the same listing, the same route). A join is
    // named by the op and its paths (r1442 (E)) — never by content: a write (its `content`) never joins and is never stringified
    const k = opts.attended && !opts.joined && this._pressing ? pressKeyOf(op, payload) : null;
    if (k) {
      const j = this._pressing.get(k);
      if (j) return j;
      const p = this.call(op, payload, { ...opts, joined: true });
      const off = () => { if (this._pressing.get(k) === p) this._pressing.delete(k); };
      this._pressing.set(k, p); p.then(off, off);
      return p;
    }
    const lane = !this._serial && (opts.lane || OP_LANE[op]);
    if (lane) return this.lane(lane).call(op, payload, { timeoutMs: opts.timeoutMs, waitMs: opts.waitMs, signal: opts.signal, attended: opts.attended });
    // B-afc4 (lane mount-readers-blocked): a path under a BLOCKED mount is refused at the pool's door, in ms — never
    // queued into a worker that would hang inside a dead FUSE (a hung worker is not killable either).
    const mp = this._blocked(payload);
    if (mp) return Promise.reject(DOOR.refusal(mp));
    const timeoutMs = opts.timeoutMs || this.timeouts[op] || this.timeouts.default;
    // B-23e5: a path that ended a worker at its deadline is not asked again until its bound — r275 / r316: A PERSON'S OWN PRESS IS
    // TRIED (`attended`: the files router's mark of the Files window's Refresh, pressed — the one door): asked ONCE despite the memory
    const hp = opts.look ? null : this._hungOf(payload, op, timeoutMs);   // `look`: the folder rule's own no-follow look (its paths are remembered)
    if (hp && !opts.attended) return Promise.reject(pathHungRefusal(hp.path, hp.ms));
    // r1378 (2) / r1442 (A): ONE TRY A REMEMBERED PATH — a press the memory WOULD refuse is tried despite it, one at a time per remembered
    // path: another press that same path refuses while that try is out is told «still trying» (never a second parked thread). A press the
    // memory does not refuse is never held and never refused (a healthy listing, a save, Mod-s twice: as at the release)
    const held = hp ? [...new Map(this._hungAll(payload, op, timeoutMs).map((x) => [x.path, x])).values()] : [];   // each remembered path refusing this press, once
    const busy = this._trying ? held.find((x) => this._trying.has(x.path)) : null;
    if (busy) return Promise.reject(pathTryingRefusal(busy.path));
    const rec = this._pick();
    if (this._serial && opts.signal?.aborted) return Promise.reject(gone());
    if (this._serial && (!rec || rec.inflight.size || this._waiting.length)) return this._wait(op, payload, timeoutMs, opts);
    if (!rec) {
      // B-3b03 (lane hub-loop-stalls, the coordinator's law): THE POOL NEVER RUNS A PATH OP ON THE MAIN THREAD. With no live worker
      // (every one between a deadline kill and its respawn backoff, or none could start) the call is REFUSED BY NAME — 503,
      // `no-worker` — and its caller says so. The release ran it inline «as a last resort»: a hung path then held the whole hub
      // (scripts/test-safe-fs-no-inline.mjs measured it: the loop lost 1.5 s to a 1.5 s stall). B-55dc's `noInline` is now the rule.
      if ((this._workers || []).some((r) => r.alive && r.worker && r.looking)) return Promise.reject(noIdleRefusal(this._words));   // r1733 (6): every live worker is out on a folder rule's look — busy, never «restarting»
      return Promise.reject(noWorkerRefusal(this._words));   // the hub's file pool is the unnamed one: «the file pool»
    }
    // `idleOnly` (B-d833 H9): the least busy live worker has a call in flight ⇒ no worker is idle ⇒ refused at once, never queued
    // (a lane's op waits by its lane's own rule: serial lanes never take this option)
    if (opts.idleOnly && rec.inflight.size) return Promise.reject(noIdleRefusal(this._words));
    const sent = this._send(rec, op, payload, timeoutMs, !!opts.attended, !!opts.look);
    if (held.length) { const off = () => { for (const x of held) if (this._trying && this._trying.get(x.path) === sent) this._trying.delete(x.path); }; for (const x of held) (this._trying = this._trying || new Map()).set(x.path, sent); sent.then(off, off); }
    return sent;
  }

  // A lane's op while one runs (or while its worker respawns): it waits in main (never in the worker). r3: TWO clocks —
  // the WAIT (opts.waitMs, else its deadline): a turn that never came is refused by the lane's own words (status 503, its
  // code) — or, with nothing ahead of it (the worker never came back), as a storage that is not responding — never sent;
  // the RUN: its deadline, counted from the SEND (r2 sent the leftover of the wait: a parse that waited 950 ms of 1500 ran
  // 550 ms and was killed as a wedged storage, the worker respawned). A job whose request is gone (opts.signal aborted —
  // the route's response closed before its answer) leaves the queue, never sent; a RUNNING one finishes (one worker).
  _wait(op, payload, timeoutMs, opts = {}) {
    return new Promise((resolve, reject) => {
      const job = { op, payload, timeoutMs, resolve, reject, signal: opts.signal || null, attended: !!opts.attended, look: !!opts.look };
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
      const hp = job.attended || job.look ? null : this._hungOf(job.payload, job.op, job.timeoutMs);   // B-23e5: a path that ended a worker while the job waited is refused the same way (a person's press is tried)
      if (hp) { job.reject(pathHungRefusal(hp.path, hp.ms)); continue; }
      this._send(rec, job.op, job.payload, job.timeoutMs, job.attended).then(job.resolve, job.reject);
    }
  }

  _send(rec, op, payload, timeoutMs, attended = false, look = false) {
    const id = this._seq++;
    this._ran = true;   // a worker of this pool TOOK a call — sticky: a killed worker's respawn wait is never «no worker» (the sessions sweep's -cure, its read's M1)
    const p = new Promise((resolve, reject) => {
      const timer = setTimeout(() => this._onTimeout(rec, id), timeoutMs);
      timer.unref?.();
      rec.inflight.set(id, { resolve, reject, timer, op, payload, timeoutMs, sentAt: monoNow(), attended });   // B-23e5: its paths are remembered if it ends at its deadline
      if (look) rec.looking = id;   // r1442 (E): this worker takes no other call while its look is out
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
        if (rec.looking === id) rec.looking = 0;
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
    const running = rec.inflight.size ? rec.inflight.values().next().value : null;   // B-23e5: the op the worker is RUNNING — the oldest it took
    if (!call) return;
    rec.inflight.delete(id);
    if (rec.looking === id) rec.looking = 0;
    this._timeouts++;
    try { global.__vsMetric?.('srv-safefs-timeout', 1); } catch {}
    const e = new Error('Storage not responding (operation timed out).');
    e.status = 503;
    e.safeFsTimeout = true;
    e.deadline = true;   // the call RAN in a worker and overran its deadline (never a missing worker)
    // B-23e5: ONE DEAD THING, ONE CALL — the op the worker was RUNNING is the one that hung (a call queued behind it ran out its own,
    // shorter, deadline while it waited: its path is not the dead one); its paths are not asked again until their bound
    if (running) this._noteHung(running.payload, running.op, running !== call ? Math.max(call.timeoutMs || 0, monoNow() - (running.sentAt || monoNow())) : Math.min(running.timeoutMs || Infinity, monoNow() - (running.sentAt || monoNow())), { early: running !== call });   // the time since it was sent without an answer; ended EARLY by a queued call ⇒ only that long
    // r275: a person's press (attended) that ends its worker too hears the renewed memory's own words — tried, and not asked again for N s
    const told = call.attended && running === call ? this._hungOf(call.payload, call.op, 0) : null;
    call.reject(told ? Object.assign(pathHungRefusal(told.path, told.ms), { deadline: true, tried: true }) : e);

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

module.exports = { SafeFs, NO_WORKER, noWorkerRefusal, NO_IDLE, noIdleRefusal, PATH_HUNG, pathHungRefusal, PATH_TRYING, pathTryingRefusal, HUNG_MS, WIDE_OPS, SIZE_OPS, mountTargetOf, mountFactsOf };
