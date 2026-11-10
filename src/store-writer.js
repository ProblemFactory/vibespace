'use strict';
/**
 * THE STORE WRITER (lane hub-loop-stalls, commit 2 — «NO STORE WRITE HOLDS THE MAIN THREAD»). A store keeps its state in
 * memory (memory is authoritative) and asks for a write of its FILE — `dirty(file, {name, produce})`; this writer decides
 * WHEN, asks `produce()` for the bytes on the main thread at that moment (the latest state: a burst of changes is ONE
 * write), and hands them to its OWN THREAD (src/store-writer-worker.js), which does the syscalls — temp file,
 * write, rename. The main loop never waits on the storage.
 *
 * MEASURED (lane dir c2/slowstore, a scratch hub, strace delay injection on its own renames): every atomic store write
 * held the main thread for its whole rename — the channels index 54 times a minute at 500 ms a rename (~28 s of that
 * minute), session-meta, the usage cursors, … — and on the owner's hub 58 of 64 holds ≥ 1 s in six hours were the
 * channels index's rename (1.3 s median, 2.6 s max, 21.7 MB rewritten whole).
 *
 * THE LAWS (the coordinator's rulings; round 2's six each pinned by a leg red on the round-1 tree — test-store-write-census ⑥,
 * test-store-writer ⑦ ⑧, the slow-storage room):
 *  · ONE WRITE IN FLIGHT ACROSS ALL STORES, on its own thread — a slow storage takes that thread, never the fs threadpool
 *    (DNS, crypto and every other async fs call keep their four threads).
 *  · EVERY BYTE OR NOTHING (A): nothing is renamed over a store unless every byte of every part was written and the temp
 *    closed without error (writeAll — a short count loops, a 0 throws); an append is fsync'd, and truncated back on a
 *    failure. The main thread's own writes (the exit flush, a store's close) run the same writeJob.
 *  · THE ORDER (round 3, law 1): acts (`durable(file)`) and paced stores ALTERNATE when both are due — an act is on disk
 *    within 2K + 1 writes (K durable stores owed), a due paced store within 2P + 1 (src/store-pace.js states both); a
 *    paced store is due no sooner than max(its gap — ½ s per MB, 0.5 … 30 s —, its last write's MEASURED time); one write
 *    of a store at a time, each a later state.
 *  · THE CRASH STORY: a SIGKILL loses a paced store's changes not yet written (at most its due + 2P + 1 writes); an
 *    answered act is on disk; the file is always a WHOLE version (temp + rename).
 *  · THE EXIT (round 3, law 2; round 6, E1 — NO BOUND OF OURS CUTS AN EXIT THAT IS STILL WRITING): NO STORE BYTE IS
 *    WRITTEN ON THE MAIN THREAD AT THE EXIT, and after a stop the ONLY bound is the service manager's. `noteSignal` starts
 *    the stop's grace; `beginExit()` comes FIRST, then `exitFlush({only: 'rank0'})` — what cannot be re-derived, BEFORE the
 *    shutdown's unmoved stores (census debt) — and `exitFlush({debtMs})` last: every write handed to the THREAD and waited
 *    for (Atomics — `writeWaiting`) as long as it takes, the write in flight first, then the exit order (rank 0, the
 *    smallest, the oldest); ONE journal line names what it wrote, what came before the debt and its time, and a store
 *    whose write FAILED. A storage that never answers: the exit waits, as master's did, and the KEEPER (another thread,
 *    started at the server's boot — bootKeeper) says what is still owed shortly before the grace ends; the manager's kill
 *    follows. A crash with no stop asked: the keeper gives the exit one full grace from the crash, then ends it. Only a
 *    writer whose thread is gone writes on the main thread (law E i's fallback, said once).
 *  · ITS OWN FAILURES (E): a thread that dies is restarted (≤ RESTARTS_MAX an hour), then the main thread — said once,
 *    and such a write never says the loop did not wait; forget() never waits and never stops the queue; bad bytes are
 *    that store's failed write (never a throw out of the timer); a killed process's temps are swept; a failing store
 *    keeps its backoff even when acts wait on it.
 *  · A FAILED ACT IS SAID (F): durable() resolves false — the caller tells the person (the channels index rejects
 *    `not-durable`). A slow write is SAID (≥ SLOW_MS), once a minute a store; store-timing (src/timed-sync.js `record`)
 *    keeps its time under the store's name.
 */
const P = require('./store-pace.js');

const GRACE = P.stopGraceOf(process.env);   // what the service manager allows a stop (systemd 90 s, a pod 30 s, or stated) — round 6: the exit's only bound
const SLOW_MS = 1000;           // a single write slower than this is said
const SLOW_SAY_EVERY_MS = 60000;
const mono = () => { const t = process.hrtime(); return t[0] * 1e3 + t[1] / 1e6; };
const mbOf = (b) => (b >= P.MB ? `${(b / P.MB).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

const RESTARTS_MAX = 3, RESTART_WINDOW_MS = 3600000;
const EXIT_ROUNDS = 4;          // round 6's amend: the exit's last pass writes what its own writes' callbacks dirtied, at most 4 more rounds   // the writer's thread restarted at most 3 times an hour, then the main thread — said

/** the bytes `produce()` returned → {parts, transfer, size, append}: ONE exact ArrayBuffer (a copy — a Buffer the store keeps,
 *  a cached chunk, is never handed away), transferred. `{append: bytes}` = an APPEND job (the acts journal). Bytes that are
 *  not a string / Buffer / an array of them, or EMPTY (unless the store said `allowEmpty`), THROW — that store's failed
 *  write, said (round 2, law E iii: `[]` or `''` renamed an empty file over a store with durable() true). */
function partsOf(bytes, { allowEmpty = false } = {}) {
  let append = false;
  if (bytes && typeof bytes === 'object' && !Array.isArray(bytes) && typeof bytes.byteLength !== 'number' && 'append' in bytes) { append = true; bytes = bytes.append; }
  const list = Array.isArray(bytes) ? bytes : [bytes];
  let size = 0;
  for (const b of list) {
    if (typeof b === 'string') size += Buffer.byteLength(b);
    else if (b && typeof b === 'object' && typeof b.byteLength === 'number' && b.buffer) size += b.byteLength;
    else throw Object.assign(new Error(`its bytes are not a string or a Buffer (${b === null ? 'null' : Array.isArray(b) ? 'an array' : typeof b})`), { code: 'EBADBYTES' });
  }
  if (!size && !allowEmpty) throw Object.assign(new Error('its bytes are empty'), { code: 'EEMPTY' });
  const all = Buffer.concat(list.map((b) => (typeof b === 'string' ? Buffer.from(b) : Buffer.from(b.buffer, b.byteOffset, b.byteLength))), size);
  const ab = all.byteOffset === 0 && all.byteLength === all.buffer.byteLength ? all.buffer : all.buffer.slice(all.byteOffset, all.byteOffset + all.byteLength);
  return { parts: [ab], transfer: [ab], size, append };
}

function create({ log = console, now = mono, record = null, graceMs: graceIn = null, exitBudgetMs = null, slowMs = SLOW_MS, pace = {}, fs = require('fs'), path = require('path'), workerPath = null, restartsMax = RESTARTS_MAX, durableMs = 60000, keeper: keeperOn = false, keeperPath = null } = {}) {
  // the stop grace (round 6): stated, or rounds 3–5's `exitBudgetMs` (a third of it), or the process's own
  const graceMs = Number.isFinite(graceIn) && graceIn > 0 ? graceIn : Number.isFinite(exitBudgetMs) && exitBudgetMs > 0 ? exitBudgetMs * 3 : GRACE.graceMs;
  const syncBound = P.syncBoundMs(graceMs);
  const stores = new Map();
  let waitsTimedOut = 0;
  let worker = null, S = null, seq = 0, posted = 0, inflight = null, timer = null, timerAt = 0, exiting = false, exited = false, stopped = false;
  let mainOnly = false, lastCls = null;   // round 3 (law 1): the class of the write just started — the two classes alternate
  const restarts = [];
  const say = (line) => { try { log.warn?.(line); } catch { } };
  const W = () => require('./store-writer-worker.js');   // writeJob (the main thread's own road uses the SAME code)

  function startWorker() {
    if (worker || mainOnly || stopped) return worker;
    try {
      const { Worker } = require('worker_threads');
      const sab = new SharedArrayBuffer(48);   // [0..3] the cells, then a failed job's error code (≤ 32 bytes) — store-writer-worker.js
      S = new Int32Array(sab); posted = 0;
      const w = new Worker(workerPath || path.join(__dirname, 'store-writer-worker.js'), { workerData: { sab }, stdout: false, stderr: false });
      worker = w;
      try { require('./worker-memory.js').trackWorker('store-writer', w); } catch { }   // the memory census (src/worker-memory.js)
      w.on('message', onMessage);
      w.on('error', (e) => { if (worker === w) lost(`an error: ${(e && e.message) || e}`); });
      w.on('exit', (code) => { if (worker === w && !stopped) lost(`it exited (${code})`); });
      w.unref();
    } catch (e) { goMain(`no writer thread (${(e && e.message) || e})`); }
    return worker;
  }
  /** THE THREAD IS GONE (round 2, law E i): its write in flight is owed again; it is RESTARTED — at most restartsMax an
   *  hour, each said — and past that every store is written on the main thread, SAID ONCE (and a write there never claims
   *  the loop did not wait) */
  function lost(why) {
    worker = null;
    requeueInflight();
    const t = now();
    while (restarts.length && t - restarts[0] > RESTART_WINDOW_MS) restarts.shift();
    if (restarts.length < restartsMax) { restarts.push(t); say(`[store-write] the writer thread stopped (${why}) — restarted (${restarts.length} of ${restartsMax} this hour)`); schedule(); return; }
    goMain(`the writer thread stopped ${restarts.length + 1} times within an hour (${why})`);
  }
  function goMain(why) {
    if (!mainOnly) say(`[store-write] ${why} — from now on every store is written ON THE MAIN THREAD (each write holds the loop for its whole time) until a restart`);
    mainOnly = true; worker = null;
    schedule();
  }
  function requeueInflight() {
    if (!inflight) return;
    const f = inflight; inflight = null;
    const s = stores.get(f.name);
    if (s && !f.unlink && !s.forgotten && !s.dirty && s.produce) { s.dirty = true; s.dirtySince = f.since; }
    schedule();
  }
  function store(file) {   // keyed by the FILE (two stores of one name in one process — a suite's — never share a queue)
    let s = stores.get(file);
    if (!s) {
      s = { name: require('path').basename(file), file, produce: null, debounceMs: P.MIN_GAP_FLOOR_MS, mode: null, dirty: false, dirtySince: null, lastEndAt: null, bytes: 0, failures: 0, failedAt: null,
        writes: 0, bytesWritten: 0, lastMs: 0, maxMs: 0, slow: 0, slowSaidAt: -Infinity, onWritten: null, rank: 1, keepRank: 1, urgent: false, version: 0, writtenVersion: 0, writingVersion: 0, waiters: [],
        allowEmpty: false, forgotten: false, badSaid: '' };
      stores.set(file, s);
    }
    return s;
  }
  /** a store's change: its FILE, its name (store-timing's row: «channels-index.write»), its producer (called on the main
   *  thread when the write is due — a string, a Buffer, an array of them, `{append: bytes}`, or null for «nothing to
   *  write»), its debounce, its mode, its `onWritten(ok, err)`, its exit `rank` (0 = cannot be re-derived: written first
   *  at a stop), `allowEmpty` (an empty file is a valid state of it). */
  function dirty(file, { name, produce, debounceMs, mode, onWritten, rank, allowEmpty } = {}) {
    const s = store(file);
    if (s.forgotten) s.forgotten = false;   // a new owner of the file: the pending unlink after the write in flight is off
    if (name) s.name = name;
    if (rank === 0) s.rank = 0;   // a person's act / a binding is pending: it goes first at the exit (until written)
    if (allowEmpty !== undefined) s.allowEmpty = !!allowEmpty;
    s.version++;
    if (typeof produce === 'function') s.produce = produce;
    if (Number.isFinite(debounceMs)) s.debounceMs = debounceMs;
    if (mode !== undefined) s.mode = mode;
    if (typeof onWritten === 'function') s.onWritten = onWritten;
    if (!s.dirty) { s.dirty = true; s.dirtySince = now(); }
    schedule();
  }
  const backoffEnd = (s) => (s.failures > 0 && Number.isFinite(s.failedAt) ? s.failedAt + P.retryMs(s.failures) : -Infinity);
  const rowOf = (s) => ({ name: s.file, dirtySince: s.dirtySince, urgent: s.urgent, failedAt: s.failures > 0 ? s.failedAt : null,
    due: s.urgent ? Math.max(s.dirtySince, backoffEnd(s)) : P.dueAt({ dirtySince: s.dirtySince, lastEndAt: s.lastEndAt, bytes: s.bytes, debounceMs: s.debounceMs, failures: s.failures, failedAt: s.failedAt, lastMs: s.lastMs }, pace) });
  const dueRows = () => [...stores.values()].filter((s) => s.dirty && s.produce && s.file && !(inflight && inflight.name === s.file)).map(rowOf);
  function schedule() {
    if (stopped || exiting || inflight) return;
    const rows = dueRows();
    if (!rows.length) { if (timer) { clearTimeout(timer); timer = null; timerAt = 0; } return; }
    const t = Math.min(...rows.map((r) => r.due));
    if (timer && timerAt <= t) return;
    if (timer) clearTimeout(timer);
    timerAt = t;
    timer = setTimeout(tick, Math.max(0, t - now()));
    timer.unref?.();
  }
  /** the writer NEVER throws out of its own timer (round 2, law E iii): a store's bad bytes are its failed write, said */
  function tick() {
    timer = null; timerAt = 0;
    if (stopped || exiting || inflight) return;
    try { step(); } catch (e) { say(`[store-write] the writer's own step failed (${(e && e.message) || e}) — the stores stay owed`); }
    schedule();
  }
  function step() {
    const next = P.nextOf(dueRows(), now(), { last: lastCls });
    if (!next) return;
    lastCls = next.urgent ? 'urgent' : 'paced';
    const s = stores.get(next.name);
    const since = s.dirtySince;
    s.dirty = false; s.dirtySince = null; s.urgent = false;   // a change from here on dirties it again, with its own time
    s.writingVersion = s.version;
    let p;
    try {
      const bytes = s.produce();
      if (bytes === null) { settled(s, s.writingVersion); return; }   // equal to the disk: nothing to write — ONLY null says so (round 3, smaller 4: undefined is a failed write, said)
      p = partsOf(bytes, { allowEmpty: s.allowEmpty });
    } catch (e) { fail(s, since, e); return; }
    if (mainOnly || !startWorker()) { writeHere(s, p, since); return; }
    const id = ++seq;
    inflight = { id, name: s.file, since, startedAt: now(), size: p.size, append: p.append };
    posted++;
    try { worker.postMessage({ ev: 'write', id, file: s.file, tmp: `${s.file}.tmp-${process.pid}-w`, mode: s.mode, parts: p.parts, append: p.append }, p.transfer); }
    catch (e) { inflight = null; posted--; fail(s, since, e); }
  }
  function onMessage(m) {
    if (m && m.ev === 'memory') return;   // the census's answer (src/worker-memory.js)
    if (!m || !inflight || m.id !== inflight.id) return;
    if (m.ev === 'unlinked') { const f = inflight; inflight = null; const s0 = stores.get(f.name); if (s0 && s0.forgotten) stores.delete(f.name); schedule(); return; }
    if (m.ev !== 'written') return;
    const f = inflight; inflight = null;
    const s = stores.get(f.name);
    if (s) finish(s, m.err, m.ms, f.size, f.since, false, f.append);
    if (s && s.forgotten && !m.err && !f.append) { postUnlink(s); return; }   // forgotten while its write flew: the file it renamed goes again
    if (s && s.forgotten) stores.delete(f.name);
    schedule();
  }
  function postUnlink(s) {
    if (!worker) { try { fs.unlinkSync(s.file); } catch { } stores.delete(s.file); schedule(); return; }
    const id = ++seq;
    inflight = { id, name: s.file, since: null, startedAt: now(), size: 0, unlink: true };
    posted++;
    try { worker.postMessage({ ev: 'unlink', id, file: s.file }); } catch { inflight = null; posted--; stores.delete(s.file); schedule(); }
  }
  function finish(s, err, ms, size, since, onMain = false, append = false, waitedBy = null) {
    if (err) { fail(s, since, err); return; }
    s.failures = 0; s.failedAt = null; s.lastEndAt = now(); if (!append) s.bytes = size; s.writes++; s.bytesWritten += size; s.lastMs = ms; s.maxMs = Math.max(s.maxMs, ms);
    if (Number.isFinite(since)) s.ageMaxMs = Math.max(s.ageMaxMs || 0, s.lastEndAt - since);   // round 3: the MEASURED age of its oldest change when it reached the disk
    settled(s, s.writingVersion);
    if (exiting) { exitWritten.push(s.name); publishExit(); }   // round 6: the keeper's line names what IS on disk
    if (!s.dirty) s.rank = s.keepRank;
    if (record) { try { record(s.name, ms); } catch { } }
    if (ms >= slowMs && now() - s.slowSaidAt >= SLOW_SAY_EVERY_MS) {
      s.slow++; s.slowSaidAt = now();
      // a write on the main thread HELD it — said as such, never «the main loop did not wait» (round 2, law E i)
      // round 3 (law 2): a write the main thread WAITED for (the exit, a synchronous flush) never says the loop did not wait
      say(`[store-write] ${s.name} took ${(ms / 1000).toFixed(1)} s to reach the disk (${mbOf(size)}) — ${onMain ? 'ON THE MAIN THREAD: the main loop was held that long' : waitedBy ? `the storage is slow; ${waitedBy} waited for it (the main thread blocked${waitedBy === 'the exit' ? '' : ', within its bound'})` : 'the storage is slow; the main loop did not wait'}`);
    } else if (ms >= slowMs) s.slow++;
    if (s.onWritten) { try { s.onWritten(true, null); } catch { } }
  }
  /** the versions up to `v` are on disk: their waiters (durable()) resolve */
  function settled(s, v) {
    if (v > s.writtenVersion) s.writtenVersion = v;
    s.notDurable = null;   // landed: nothing owed to a waiter's caller
    if (!s.waiters.length) return;
    const keep = [];
    for (const w of s.waiters) { if (w.version <= s.writtenVersion) { try { w.resolve(true); } catch { } } else keep.push(w); }
    s.waiters = keep;
  }
  /** A PERSON'S ACT IS DURABLE BEFORE THE ANSWER — without holding the loop: the store's current state is the NEXT write
   *  after the one in flight (its pace set aside — never its failure backoff), and the promise resolves when it is on
   *  disk (false: the write failed and stays owed — the caller says so). */
  function durable(file, { timeoutMs = durableMs } = {}) {
    const s = stores.get(file);
    if (!s || (!s.dirty && !(inflight && inflight.name === file) && s.writtenVersion >= s.version)) return Promise.resolve(true);
    const want = s.version;
    if (s.dirty) { s.urgent = true; s.rank = 0; }
    return new Promise((resolve) => {
      // NOT unref'd: an answer awaiting the disk keeps the process up until the write lands, fails, or the timeout
      // round 4 (true words 4): at the timeout a write still QUEUED is said as waiting — never «its write failed»
      const t = setTimeout(() => { s.waiters = s.waiters.filter((x) => x.resolve !== done); s.notDurable = { why: 'queued', ahead: aheadOf(s), lastMs: s.lastMs || null }; resolve(false); }, timeoutMs);
      const done = (ok) => { clearTimeout(t); resolve(ok); };
      s.waiters.push({ version: want, resolve: done });
      schedule();
    });
  }
  /** the writes CERTAINLY ahead of this store's (round 6, smaller 2 — a lower bound, never more): the one in flight of
   *  another store + the urgent stores DUE NOW (not in their failure backoff) whose place in the urgent order comes first
   *  (store-pace placeOf: a failed store by the time it failed). The paced turns between them only add to it. */
  function aheadOf(s) {
    const t = now(), mine = P.placeOf(rowOf(s));
    let n = inflight && inflight.name !== s.file ? 1 : 0;
    for (const x of stores.values()) if (x !== s && x.dirty && x.urgent && x.produce && !(inflight && inflight.name === x.file) && backoffEnd(x) <= t && P.placeOf(rowOf(x)) < mine) n++;
    return n;
  }
  /** why a durable act of this store is not on disk yet — {why: 'queued' | 'failed', ahead?, lastMs?} — for its caller's line */
  function whyNotDurable(file) { const s = stores.get(file); return s && s.notDurable ? { ...s.notDurable } : null; }
  function fail(s, since, err) {
    s.failures++; s.failedAt = now(); s.notDurable = { why: 'failed', code: (err && (err.code || err.message)) || null };
    // the waiters hear it NOW (false — the change stays owed and the writer retries; the caller says so)
    if (s.waiters.length) { const ws = s.waiters; s.waiters = []; for (const w of ws) { try { w.resolve(false); } catch { } } }
    if (!s.dirty) { s.dirty = true; s.dirtySince = since != null ? since : now(); } else if (since != null && since < s.dirtySince) s.dirtySince = since;
    const code = (err && (err.code || err.message)) || String(err);
    const why = err && (err.code === 'EBADBYTES' || err.code === 'EEMPTY') ? `${err.message} — its store gave no bytes to write` : code;
    // round 6's amend: at the exit there is no «retrying in 1 s» — the rank-0 pass's failure gets the exit's last pass, the
    // last pass's failure is named in the exit's own line (never a promise the next line takes back)
    const next = !exiting ? `kept in memory, retrying in ${Math.round(P.retryMs(s.failures) / 1000)} s` : exited ? 'not retried at the exit — named in its exit line' : 'the exit\'s last pass tries it once more';
    if (exiting || s.failures === 1 || s.failures % 10 === 0) say(`[store-write] ${s.name} not written (${why}; attempt ${s.failures}) — ${next}`);
    if (s.onWritten) { try { s.onWritten(false, err); } catch { } }
  }
  /** the bytes written on THIS thread — the SAME writeJob as the thread's (every byte, the close's error, then the rename;
   *  an append fsynced) — the exit flush, a store's own close, a process without a writer thread */
  function writeHere(s, p, since) {
    const t0 = now(), tmp = `${s.file}.tmp-${process.pid}`;
    try {
      W().writeJob({ file: s.file, tmp, parts: p.parts, mode: s.mode, append: p.append }, fs);
      finish(s, null, now() - t0, p.size, since, true, p.append);
      return true;
    } catch (e) { if (!p.append) { try { fs.unlinkSync(tmp); } catch { } } fail(s, since, e); return false; }
  }
  /** the failed job's own error code, from the shared cells (round 6's amend: the exit road said «EWRITE» for an EIO) */
  function jobErrorCode() {
    try { const n = Atomics.load(S, 3); if (n > 0 && S.byteLength >= 48) return Buffer.from(new Uint8Array(S.buffer, 16, Math.min(32, n))).toString('latin1'); } catch { }
    return 'EWRITE';
  }
  /** wait (blocking — the loop cannot turn here) for the thread's job in flight, at most until `deadline`. The thread
   *  NOTIFIES the cell this waits on: a waited write ends when the write ends (round 6's amend — it ended at the 50 ms
   *  poll); `waitsTimedOut` counts a wait that ended by its poll with the job still in flight (the fast pin reads it) */
  function settleInflight(deadline, waitedBy = 'the exit') {
    if (!inflight) return true;
    if (!S) return false;
    while (Atomics.load(S, 1) < posted) {
      const rest = deadline - now();
      if (rest <= 0) return false;
      if (Atomics.wait(S, 1, Atomics.load(S, 1), Math.min(rest, 50)) === 'timed-out' && Atomics.load(S, 1) < posted) waitsTimedOut++;
    }
    const f = inflight; inflight = null;
    const s = stores.get(f.name);
    if (f.unlink) { if (s && s.forgotten) stores.delete(f.name); return true; }
    if (s) finish(s, Atomics.load(S, 2) === 2 ? { code: jobErrorCode() } : null, now() - f.startedAt, f.size, f.since, false, f.append, waitedBy);
    if (s && s.forgotten && !f.append && Atomics.load(S, 2) !== 2) postUnlink(s);   // forgotten while it flew: gone again — on the thread
    return true;
  }
  /** ROUND 3 (law 2): a write the main thread needs NOW is still the THREAD's — posted, then waited for (Atomics, bounded by
   *  `deadline`); the main thread never writes a moved store's bytes itself (only a writer whose thread is gone — law E i's
   *  fallback, said once — writes here). → 'ok' | 'failed' | 'held' (the thread still has it at the deadline) */
  function writeWaiting(s, p, since, deadline, waitedBy) {
    if (inflight && !settleInflight(deadline, waitedBy)) return 'held';
    if (mainOnly || !startWorker() || !S) return writeHere(s, p, since) ? 'ok' : 'failed';
    const id = ++seq, f0 = s.failures;
    inflight = { id, name: s.file, since, startedAt: now(), size: p.size, append: p.append };
    posted++;
    try { worker.postMessage({ ev: 'write', id, file: s.file, tmp: `${s.file}.tmp-${process.pid}-w`, mode: s.mode, parts: p.parts, append: p.append }, p.transfer); }
    catch (e) { inflight = null; posted--; fail(s, since, e); return 'failed'; }
    if (exiting) publishExit();   // round 6's amend: the keeper's line names this write as IN FLIGHT, not «still owed»
    if (!settleInflight(deadline, waitedBy)) return 'held';
    return s.failures > f0 ? 'failed' : 'ok';
  }
  /** THE SYNCHRONOUS FLUSH of the stores of these FILES (all when `names` is null): every OTHER dirty store first, in the
   *  exit ORDER (what cannot be re-derived first, then the smaller, then the oldest change), then the file whose write is
   *  in flight (that write lands first — settled through the shared cells — then its newer state), until `budgetMs`:
   *  ALWAYS BOUNDED (round 2, law D: a rename the storage never answered held close() for ever). During the exit (after
   *  beginExit) a store's own flush only keeps it dirty — exitFlush writes everything once. → {written, left, ms, budgetMs} */
  function flushSync(names = null, { budgetMs = syncBound, deadline: dl = null, only = null, waitedBy = 'a synchronous flush' } = {}) {
    const t0 = now(), deadline = dl != null ? dl : t0 + budgetMs, written = [], left = [];
    if (exiting && !exited && names) return { written, left, ms: 0, budgetMs, deferred: true };
    const want = (s) => s.dirty && s.produce && s.file && (!names || names.includes(s.file)) && (!only || only(s));
    let held = false;   // the thread holds a write past the deadline: nothing more can be written (one write in flight)
    const writeOne = (s) => {
      if (held || now() >= deadline) { left.push({ name: s.name, file: s.file, why: held ? 'the writer thread was still held by the storage' : 'the bound was spent' }); return; }
      const since = s.dirtySince;
      s.dirty = false; s.dirtySince = null; s.urgent = false; s.writingVersion = s.version;
      let p;
      try { const bytes = s.produce(); if (bytes === null) { settled(s, s.writingVersion); return; } p = partsOf(bytes, { allowEmpty: s.allowEmpty }); }
      catch (e) { fail(s, since, e); left.push({ name: s.name, file: s.file, why: `its bytes could not be made (${(e && e.message) || e})` }); return; }
      const r = writeWaiting(s, p, since, deadline, waitedBy);
      if (r === 'ok') written.push(s.name);
      else if (r === 'failed') left.push({ name: s.name, file: s.file, why: `the write failed (${(s.notDurable && s.notDurable.code) || 'an error'}; ${s.failures} attempt${s.failures === 1 ? '' : 's'})` });   // round 6's amend: its own code
      else { held = true; s.dirty = true; s.dirtySince = since; left.push({ name: s.name, file: s.file, why: `its write was still held by the storage at the bound (${((now() - (inflight ? inflight.startedAt : t0)) / 1000).toFixed(1)} s)` }); }
    };
    // the write in flight lands first (one write at a time — its state is older than any owed now)
    const busy = inflight && !inflight.unlink ? inflight : null;
    if (busy && !settleInflight(deadline, waitedBy)) { held = true; const s0 = stores.get(busy.name); left.push({ name: s0 ? s0.name : busy.name, file: busy.name, why: `its write was still held by the storage after ${((now() - busy.startedAt) / 1000).toFixed(1)} s` }); }
    const tried = new Set();
    for (const s of P.exitOrder([...stores.values()].filter(want))) { tried.add(s.file); writeOne(s); }   // what cannot be re-derived first
    // round 6's amend: THE EXIT'S LAST PASS RUNS UNTIL NOTHING IS DIRTY — a store a write's own callback dirtied meanwhile
    // (the channels index's onWritten → the acts compaction) is written too; a store whose write failed here is not
    // retried (named); one still changing after EXIT_ROUNDS more rounds is named as such
    if (exiting && exited && !names) {
      const failedNow = new Set(left.map((x) => x.file));
      for (let round = 0; round < EXIT_ROUNDS; round++) {
        const more = P.exitOrder([...stores.values()].filter((s) => want(s) && !failedNow.has(s.file)));
        if (!more.length) break;
        for (const s of more) { tried.add(s.file); writeOne(s); }
        for (const x of left) failedNow.add(x.file);
      }
      for (const s of [...stores.values()].filter((x) => want(x) && !failedNow.has(x.file))) left.push({ name: s.name, file: s.file, why: `it changed again during the exit's last pass ${EXIT_ROUNDS + 1} times — its last change is not written` });
    }
    if (!exiting) schedule();
    return { written, left, ms: now() - t0, budgetMs: deadline - t0 };
  }
  // ── THE EXIT (round 6, E1 — 主开发's law: NO BOUND OF OURS CUTS AN EXIT THAT IS STILL WRITING). After a stop the ONLY
  // bound is the service manager's: every store owed at the signal — moved or not — is written if its grace allows it,
  // rank 0 first (`exitFlush({only: 'rank0'})` before the shutdown's unmoved stores, `exitFlush({debtMs})` after them),
  // each handed to the THREAD and waited for as long as it takes (never written by the main thread itself); nothing is
  // dropped, skipped or cut short by a budget of ours, and the exit code is the caller's (master's). A crash takes the same
  // road. Shortly before the grace ends the KEEPER says what is still owed (it ends nothing after a stop).
  let exitFrom = null, stopAt = null, crashAt = null;
  const exitWritten = [];   // the writer's stores written since the exit began (the keeper's line names them)
  /** the shutdown starts (`at`: the signal's own time when the caller kept it): no more writes are started by the timer; a
   *  store's own flush only keeps it dirty (exitFlush writes everything once). `crash`: the crash road (uncaughtException) */
  function beginExit({ at = null, crash = false } = {}) {
    exiting = true; if (exitFrom == null) exitFrom = Number.isFinite(at) ? at : now(); if (timer) { clearTimeout(timer); timer = null; }
    if (crash && crashAt == null) crashAt = now();
    armKeeper(crash ? 'crash' : 'stop');
  }
  /** the SIGNAL came (the shutdown's hand-over settle may still run): the stop's grace runs from now — the writer keeps
   *  writing as before until beginExit */
  function noteSignal({ at = null } = {}) { const t = Number.isFinite(at) ? at : now(); if (stopAt == null) stopAt = t; if (exitFrom == null) exitFrom = t; armKeeper('stop'); }
  // THE EXIT KEEPER (round 6, E2 + E3): a thread that is NOT the main thread — src/store-exit-keeper.js — started at the
  // SERVER'S BOOT by name (bootKeeper() below; no other process has one), so nothing is read from the install or the data
  // directory when it is needed. ONE clock: a STOP asked ⇒ it SPEAKS at the grace less its slack and ends nothing (a crash
  // after it changes only the words); a CRASH with no stop asked ⇒ it is the manager: one full grace from the crash, then
  // the line and SIGKILL. This thread publishes its word on the stores into the shared text at each step of the exit.
  // I[0] armed · I[1] the text's bytes · I[2] the kind (1 stop · 2 crash) · I[3] a wake cell; F[0] the deadline · F[1] the
  // clock's start (the stop or the crash) · F[2] the grace · F[3] a crash's time after a stop (NaN: none); T the text
  let KS = null, KI = null, KF = null, keeperT = null;
  function startKeeper() {
    if (keeperT || stopped) return !!keeperT;
    try {
      if (!KS) { KS = new SharedArrayBuffer(64 + 4096); KI = new Int32Array(KS, 0, 4); KF = new Float64Array(KS, 16, 4); KF[3] = NaN; }
      const { Worker } = require('worker_threads'), FS = require('fs');   // the real fs (a suite's write spy is for the stores)
      // round 6's amend (item 5): the keeper's code and store-pace's are read HERE, now — the boot — and the thread starts from
      // their TEXT (eval): it reads nothing of the install, so a crash in its first moments finds it able to act when it runs
      const code = FS.readFileSync(keeperPath || path.join(__dirname, 'store-exit-keeper.js'), 'utf8'), paceSource = FS.readFileSync(path.join(__dirname, 'store-pace.js'), 'utf8');
      keeperT = new Worker(code, { eval: true, workerData: { sab: KS, paceSource, source: graceIn || exitBudgetMs ? 'stated to this writer' : GRACE.source } });
      keeperT.unref(); keeperT.on('error', () => { keeperT = null; });
    } catch { keeperT = null; }
    return !!keeperT;
  }
  const bump = () => { Atomics.store(KI, 3, Atomics.load(KI, 3) + 1); Atomics.notify(KI, 3); };   // this thread is the cell's one writer (never Atomics.add: the inbox census reads it as a filing)
  /** arm the keeper: 'stop' (it speaks at the grace less its slack) or 'crash' (it ends the exit one grace after the crash
   *  — only when no stop was asked; after a stop a crash changes the words alone) */
  function armKeeper(kind) {
    if (!KS || stopped) return;
    const armed = Atomics.load(KI, 0) === 1;
    if (kind === 'crash' && armed && KI[2] === 1) { if (!Number.isFinite(KF[3])) { KF[3] = crashAt; publishExit(); bump(); } return; }   // a crash after a stop: the words only
    if (armed) { publishExit(); return; }   // armed: a second signal, a stop after a crash — the deadline stands
    const crash = kind === 'crash', from = crash ? crashAt : (stopAt != null ? stopAt : exitFrom != null ? exitFrom : now());
    KF[1] = from; KF[2] = graceMs;
    KF[0] = from + (crash ? P.keeperCrashMs(graceMs) : P.keeperStopAtMs(graceMs));   // the writer's clock is the keeper's (process.hrtime)
    KI[2] = crash ? 2 : 1; publishExit(); Atomics.store(KI, 0, 1); bump();
  }
  /** the writer's word on its stores, for the keeper's line: written during the exit / still owed / in flight */
  function publishExit() {
    if (!KS) return;
    try {
      const owed = [...stores.values()].filter((s) => s.dirty && s.produce).map((s) => s.name);
      const text = P.exitSummary({ written: exitWritten, owed, inflight: inflight && !inflight.unlink ? (stores.get(inflight.name) || {}).name || 'a write' : null });
      KI[1] = new TextEncoder().encodeInto(text.length > 1500 ? text.slice(0, 1500) + '…' : text, new Uint8Array(KS, 64)).written;
    } catch { }
  }
  /** the time the exit started (for a caller that keeps its own parts' times) */
  const exitStartedAt = () => exitFrom;
  let exitR0 = null;
  /** the shutdown ends: every dirty store written — as long as it takes (E1) — and ONE line names what was written (and a
   *  store whose write FAILED or whose bytes could not be made: nothing else is ever left) */
  function exitFlush({ only = null, debtMs = null } = {}) {
    exiting = true; if (timer) { clearTimeout(timer); timer = null; }
    if (exitFrom == null) exitFrom = now();
    // `only: 'rank0'` — the stores that cannot be re-derived (a person's act, a binding), BEFORE the shutdown's unmoved
    // stores; then (no `only`) everything else, once
    const rank0 = only === 'rank0';
    if (!rank0) exited = true;
    const r = flushSync(null, { deadline: Infinity, only: rank0 ? (s) => s.rank === 0 : null, waitedBy: 'the exit' });
    const from = crashAt != null ? crashAt : exitFrom;   // the crash road says its time from the crash (a crash after a stop too)
    r.fromStartMs = now() - from; r.debtMs = debtMs; r.part = rank0 ? 'rank0' : 'rest';
    publishExit();
    if (rank0) { exitR0 = r; return r; }
    // ONE line for the whole exit: what cannot be re-derived first (before the unmoved stores), then the rest
    const leftNames = new Set(r.left.map((x) => x.file || x.name));   // a store left twice is named once (the later reason)
    const all = { written: [...(exitR0 ? exitR0.written : []), ...r.written], left: [...(exitR0 ? exitR0.left.filter((x) => !r.written.includes(x.name) && !leftNames.has(x.file || x.name)) : []), ...r.left], ms: r.fromStartMs, debtMs, rank0: exitR0 ? exitR0.written.length : 0, crash: crashAt != null };
    if (all.left.length || all.ms >= 250 || all.written.length) say(P.exitLine(all));
    r.all = all;
    return r;
  }
  /** a store's FILE is going away (its owner unlinks it next): its pending write is dropped — NEVER a wait on the loop and
   *  never a stopped queue (round 2, law E ii): a write of it in flight is let land, then the file it renamed is unlinked
   *  again on the writer's thread (an unlink is never undone by a rename landing after it) */
  function forget(file) {
    const s = stores.get(file);
    if (!s) return;
    s.dirty = false; s.dirtySince = null; s.produce = null; s.urgent = false;
    if (s.waiters.length) { const ws = s.waiters; s.waiters = []; for (const w of ws) { try { w.resolve(true); } catch { } } }   // the file is gone by its owner's word
    if (inflight && inflight.name === file) { s.forgotten = true; return; }
    stores.delete(file);
  }
  const pending = (file) => { const s = stores.get(file); return !!(s && (s.dirty || (inflight && inflight.name === file && !inflight.unlink))); };
  function stats() {
    const t = now();
    return [...stores.values()].map((s) => ({ name: s.name, writes: s.writes, bytes: s.bytes, bytesWritten: s.bytesWritten, lastMs: Math.round(s.lastMs), maxMs: Math.round(s.maxMs), slow: s.slow,
      failures: s.failures, dirty: s.dirty, inflight: !!(inflight && inflight.name === s.file), file: s.file, oldestAgeMs: s.dirty ? Math.round(t - s.dirtySince) : 0,
      // round 3: maxAgeMs is MEASURED (the oldest change's age when a write of it landed, or the one still owed now) —
      // never the designed bound; the bound the queue keeps is store-pace.js's, in writes
      gapMs: Math.max(P.minGapMs(s.bytes, pace), Math.round(s.lastMs)), maxAgeMs: Math.round(Math.max(s.ageMaxMs || 0, s.dirty ? t - s.dirtySince : 0)), urgent: !!s.urgent }));
  }
  const mode = () => (mainOnly ? 'main' : worker ? 'thread' : 'idle');
  function stop() { stopped = true; if (timer) clearTimeout(timer); timer = null; const w = worker; worker = null; try { w && w.terminate(); } catch { } const k = keeperT; keeperT = null; try { k && k.terminate(); } catch { } }
  if (keeperOn) startKeeper();   // a suite's own writer may ask for one; the server's is started by bootKeeper() at its boot
  const waits = () => ({ timedOut: waitsTimedOut });   // round 6's amend: waits that ended by their poll, not the write's end
  return { dirty, durable, whyNotDurable, flushSync, noteSignal, beginExit, exitFlush, exitStartedAt, startKeeper, forget, pending, stats, waits, mode, stop, graceMs, _now: now };
}

/** THE process's writer (one thread, one queue for every store) */
let shared = null;
function storeWriter() {
  if (!shared) {
    let record = null; try { const TS = require('./timed-sync.js'); record = (name, ms) => (TS.enabled() ? TS.record(name, ms) : false); } catch { }   // store-timing's own switch
    shared = create({ record });   // round 6 (E3 c): no keeper here — a script or a suite that writes the stores has none
  }
  return shared;
}
/** THE SERVER'S BOOT starts the exit keeper BY NAME (round 6, E3 a — server.js; the only caller): the process's writer is
 *  made now if no store has written yet, its keeper thread loaded from the install while the install answers, idle until
 *  the exit arms it. A stated grace that was not used is SAID here, once. → the writer */
function bootKeeper({ log = console } = {}) {
  const w = storeWriter();
  w.startKeeper();
  if (GRACE.refused) { try { log.warn?.(`[store-write] ${GRACE.refused}`); } catch { } }
  return w;
}
module.exports = { create, storeWriter, bootKeeper, partsOf, GRACE, SLOW_MS, RESTARTS_MAX };
