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
const LC = require('./server/loop-counts.js');   // loop-day-report M5: the hour's counts (a property add)
const { syncUnsupportedWords } = require('./fd-close.js');   // r5010: the hub door's one spelling of a sync the file system does not do (Node builtins only)

const GRACE = P.stopGraceOf(process.env);   // what the service manager allows a stop (systemd 90 s, a pod 30 s, or stated) — round 6: the exit's only bound
const SLOW_MS = 1000;           // a single write slower than this is said
// B-dfa4 cut 3: a producer's answer NOT READY (the channels index's layout built in slices): nothing is written and nothing
// is settled — every durable() waiter waits for the write its store asks for (dirty) when its bytes are ready; null stays
// «equal to the disk». A synchronous flush asks produce({sync: true}): the bytes in that turn. One symbol by name, so a
// store reads it without loading this module first.
const LATER = Symbol.for('vibespace.store-writer.later');
const SLOW_SAY_EVERY_MS = 60000;
const mono = () => { const t = process.hrtime(); return t[0] * 1e3 + t[1] / 1e6; };
const mbOf = (b) => (b >= P.MB ? `${(b / P.MB).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

const RESTARTS_MAX = 3, RESTART_WINDOW_MS = 3600000;
const EXIT_ROUNDS = 4;          // round 6's amend: the exit's last pass writes what its own writes' callbacks dirtied, at most 4 more rounds   // the writer's thread restarted at most 3 times an hour, then the main thread — said

const BYREF = Symbol.for('vibespace.store-writer.byRef');
const PIECE_BYTES = 4 * 1024 * 1024;   // measure 6 (r1323, the test machine): a 4 MB piece's turn 3.8–5.2 ms; the join of 186 MB 127–265 ms
/** A WHOLE WRITE HANDED BY REFERENCE (the produce contract, 主开发 r1328): `list` = the Buffers of ONE turn (a store's chunk cache
 *  — its buffers are REPLACED, never written into), with that turn's seq read in the same turn. The store PROMISES none of them
 *  is written into until that write's answer; the writer copies the list piece by piece, a turn each (law 1: no whole write
 *  holds a turn). A producer that cannot promise it returns a plain list: copied in its turn, as before. */
function byRef(list) { return Object.freeze({ [BYREF]: true, list: Array.isArray(list) ? list : [list] }); }
/** a handed buffer's bytes, summed (suites only — `verifyByRef`): a buffer written into after the hand-over fails its write */
const sumOf = (b) => require('crypto').createHash('sha1').update(b).digest('base64');
/** the bytes `produce()` returned → {parts, transfer, size, append}: ONE exact ArrayBuffer (a copy — a Buffer the store keeps,
 *  a cached chunk, is never handed away), transferred. `{append: bytes}` = an APPEND job (the acts journal). Bytes that are
 *  not a string / Buffer / an array of them, or EMPTY (unless the store said `allowEmpty`), THROW — that store's failed
 *  write, said (round 2, law E iii: `[]` or `''` renamed an empty file over a store with durable() true). */
function partsOf(bytes, { allowEmpty = false, verify = false } = {}) {
  // A REWRITE of an append store from its own bytes (row B-360d, the OTel stash's trim — 主开发 r725 a): `{rewrite: {ranges,
  // size}, then: bytes, as}` = the byte ranges [s, e) of the file's first `size` bytes (a Float64Array, ascending; a range
  // that ends at size + 1 ends with the newline the file lacks), then every byte the file holds past `size`, then `then`,
  // written to the temp on the writer's THREAD in bounded pieces and renamed over the file (store-writer-worker.js
  // rewriteJob) — in order with the store's appends; `as` = the store-timing row it is timed under. Never on the main thread.
  if (bytes && typeof bytes === 'object' && !Array.isArray(bytes) && typeof bytes.byteLength !== 'number' && bytes.rewrite) {
    const R = bytes.rewrite;
    if (!(R.ranges instanceof Float64Array) || R.ranges.length % 2 || !(Number.isFinite(R.size) && R.size >= 0)) throw Object.assign(new Error('its rewrite is not {ranges: Float64Array of pairs, size}'), { code: 'EBADBYTES' });
    // round wgxur2rci (2): a rewrite is never in pieces — its lines handed BY REFERENCE would come back as pieces with no parts and
    // land with none of them, answered true: refused BY NAME
    if (bytes.then && bytes.then[BYREF]) throw Object.assign(new Error('a rewrite\'s lines were handed by reference (byRef): hand them as plain bytes — a rewrite is never written in pieces'), { code: 'EBADBYTES' });
    const then = bytes.then == null || bytes.then === '' ? null : partsOf(bytes.then, { allowEmpty: true });
    const ranges = R.ranges.slice();   // a copy: what the store keeps is never handed away
    return { parts: then ? then.parts : [], transfer: [...(then ? then.transfer : []), ranges.buffer], size: then ? then.size : 0, append: false, rewrite: { ranges, size: R.size }, as: typeof bytes.as === 'string' ? bytes.as : null };
  }
  let append = false;
  if (bytes && bytes[BYREF]) {   // ONE TURN'S SNAPSHOT, BY REFERENCE (the writer unit, r1328): copied piece by piece, a turn each
    const list = bytes.list;
    let size = 0;
    for (const b of list) { if (!(b && typeof b === 'object' && typeof b.byteLength === 'number' && b.buffer)) throw Object.assign(new Error(`its bytes handed by reference are not Buffers (${b === null ? 'null' : typeof b})`), { code: 'EBADBYTES' }); size += b.byteLength; }
    if (!size && !allowEmpty) throw Object.assign(new Error('its bytes are empty'), { code: 'EEMPTY' });
    if (size > PIECE_BYTES) return { parts: null, transfer: [], size, append: false, pieces: list.slice(), sums: verify ? list.map(sumOf) : null };
    bytes = list;   // one piece or less: copied in this turn, as any list
  }
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

function create({ log = console, now = mono, record = null, graceMs: graceIn = null, exitBudgetMs = null, slowMs = SLOW_MS, pace = {}, fs = require('fs'), path = require('path'), workerPath = null, verifyByRef = false, restartsMax = RESTARTS_MAX, durableMs = 60000, keeper: keeperOn = false, keeperPath = null } = {}) {
  // the stop grace (round 6): stated, or rounds 3–5's `exitBudgetMs` (a third of it), or the process's own
  const graceMs = Number.isFinite(graceIn) && graceIn > 0 ? graceIn : Number.isFinite(exitBudgetMs) && exitBudgetMs > 0 ? exitBudgetMs * 3 : GRACE.graceMs;
  const syncBound = P.syncBoundMs(graceMs);
  const stores = new Map();
  let waitsTimedOut = 0;
  let seq = 0, timer = null, timerAt = 0, exiting = false, exited = false, exitAnswered = false, stopped = false, verify = !!verifyByRef;
  // THE TWO LANES (the writer unit, 主开发 r1328): W writes WHOLE files (and unlinks), A APPENDS — each its OWN thread (the same
  // script), its own cells, its own job in flight, restart count and main-only fallback, said by its own name. THE FENCE IS A
  // FILE: a file has at most ONE job across both (in flight, or made and waiting for its lane) — an append and a whole write or
  // fold of THAT file never interleave; an append never waits behind ANOTHER file's whole write (law 2). Each lane's lastCls:
  // round 3 (law 1) — the class of the lane's write just started, the two classes alternating on each lane.
  const lane = (name) => ({ name, worker: null, S: null, posted: 0, inflight: null, mainOnly: false, lastCls: null, restarts: [], parked: [], feed: null });
  const LW = lane('W'), LA = lane('A'), LANES = [LW, LA];
  const laneOf = (p) => (p && p.append ? LA : LW);
  const threadWord = (l) => (l === LW ? 'writer thread' : 'append thread');
  /** the lane that holds this FILE (its job in flight there, or made and waiting there) — the fence */
  const holder = (file) => LANES.find((l) => (l.inflight && l.inflight.name === file) || l.parked.some((j) => j.s.file === file)) || null;
  const inflightOf = (file) => { const l = LANES.find((x) => x.inflight && x.inflight.name === file); return l ? l.inflight : null; };
  const say = (line) => { try { log.warn?.(line); } catch { } };
  /** 主开发 r5002 / r5010: a store's write whose SYNC its file system does not do at all LANDED (the thread's answer, its cells, or the
   *  main thread's own road) — SAID ONCE for this writer's whole life (both lanes, a restarted thread, the main-thread road), in the hub
   *  door's one spelling (src/fd-close.js syncUnsupportedWords): the store's name and the code, no path */
  let noSyncSaid = false;
  const noSyncSeen = (s, code) => {
    if (!code || noSyncSaid) return;
    noSyncSaid = true;
    say(`[store-write] ${syncUnsupportedWords(s ? s.name : 'a store', code)} (said once: every later write of this writer whose sync is refused so lands the same way)`);
  };
  const W = () => require('./store-writer-worker.js');   // writeJob (the main thread's own road uses the SAME code)

  function startWorker(l) {
    if (l.worker || l.mainOnly || stopped) return l.worker;
    try {
      const { Worker } = require('worker_threads');
      const sab = new SharedArrayBuffer(64);   // [0..3] the cells, then a failed job's error code (≤ 32 bytes; r5010: or a landed job's no-sync code), then the own numbers (dev, ino) of the file an own-only job wrote — store-writer-worker.js
      l.S = new Int32Array(sab); l.posted = 0;
      const w = new Worker(workerPath || path.join(__dirname, 'store-writer-worker.js'), { workerData: { sab }, stdout: false, stderr: false });
      l.worker = w;
      try { require('./worker-memory.js').trackWorker(l === LW ? 'store-writer' : 'store-writer-append', w); } catch { }   // the memory census (src/worker-memory.js)
      w.on('message', (m) => onMessage(l, m));
      w.on('error', (e) => { if (l.worker === w) lost(l, `an error: ${(e && e.message) || e}`); });
      w.on('exit', (code) => { if (l.worker === w && !stopped) lost(l, `it exited (${code})`); });
      w.unref();
    } catch (e) { goMain(l, `no ${threadWord(l)} (${(e && e.message) || e})`); }
    return l.worker;
  }
  /** A LANE'S THREAD IS GONE (round 2, law E i — per lane since the writer unit): its job in flight is owed again; the thread
   *  is RESTARTED — at most restartsMax an hour, each said — and past that the lane's writes run on the main thread, SAID ONCE
   *  (and a write there never claims the loop did not wait) */
  function lost(l, why) {
    l.worker = null;
    requeueInflight(l);
    const t = now();
    while (l.restarts.length && t - l.restarts[0] > RESTART_WINDOW_MS) l.restarts.shift();
    if (l.restarts.length < restartsMax) { l.restarts.push(t); say(`[store-write] the ${threadWord(l)} stopped (${why}) — restarted (${l.restarts.length} of ${restartsMax} this hour)`); schedule(); return; }
    goMain(l, `the ${threadWord(l)} stopped ${l.restarts.length + 1} times within an hour (${why})`);
  }
  function goMain(l, why) {
    if (!l.mainOnly) say(l === LW ? `[store-write] ${why} — from now on every store is written ON THE MAIN THREAD (each write holds the loop for its whole time) until a restart`
      : `[store-write] ${why} — from now on every append is written ON THE MAIN THREAD (each write holds the loop for its whole time) until a restart`);
    l.mainOnly = true; l.worker = null;
    schedule();
  }
  /** the lane's job in flight is owed again. A WHOLE write: its store is dirty again (the next write makes its NEWER state; a
   *  temp the thread left is truncated by that write, or swept by the next process — never renamed, never read). AN APPEND
   *  whose thread died after its bytes left this thread (r1328 (3)/(4)): a FAILED write — its tail on disk is unknown, so the
   *  store's own rule runs (onWritten(false): its next journal job a whole one), its waiters hear false and the writer writes
   *  it again: never lost and answered true. Jobs made and waiting for the lane stay (its restarted thread takes them). */
  function requeueInflight(l) {
    const f = l.inflight; l.inflight = null; l.feed = null;
    if (f) {
      const s = stores.get(f.name);
      // round wgxur2rci (1): a REWRITE (line 42's trim) is not a lost append: its rename may have landed. It keeps the base's road —
      // the store dirty again, so its producer says honestly «the trim was not confirmed» — never «FAILED, the stash stays whole»
      if (s && f.append && !f.rewrite && !f.unlink && !s.forgotten) fail(s, f.since, Object.assign(new Error(`the ${threadWord(l)} stopped during the append`), { code: 'ETHREAD' }));
      else if (s && !f.unlink && !s.forgotten && !s.dirty && s.produce) { s.dirty = true; s.dirtySince = f.since; }
    }
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
   *  at a stop), `allowEmpty` (an empty file is a valid state of it), `makeDir` (channel-store-off-loop cure r1: the ONE
   *  store that may make its missing parent directory — a new account's people.json; any other store whose directory is
   *  gone fails its write ENOENT, said, as before). */
  function dirty(file, { name, produce, debounceMs, mode, onWritten, rank, allowEmpty, makeDir, rotateAt, urgent = false, exclusive, ownOnly } = {}) {
    const s = store(file);
    // B-f276 1b (主开发 r809, THE MISSING LAW): `exclusive: true` — its store read the file MISSING: its whole writes are EXCLUSIVE creates
    // until one lands; `false` — its store holds the file (it took in the one that appeared): writes rename again. A file that APPEARED
    // is never written over: its store's changes are not taken until it says `false` (durable() answers false, EEXIST)
    // B-f276 1c (主开发 r1143 (1)): `ownOnly: true` — its store read the file missing and has not read it since: every whole write renames
    // only over the file it made itself, every append opens only that file (the thread checks the file's own numbers); `false` — its
    // store read the file (took in the one that appeared): writes go as any store's again
    if (ownOnly !== undefined) s.ownOnly = !!ownOnly;
    if (exclusive === false) { s.exclusive = false; if (!s.ownOnly) s.appeared = null; } else if (exclusive) s.exclusive = true;
    if (s.appeared) { if (typeof onWritten === 'function') s.onWritten = onWritten; return; }
    if (s.forgotten) s.forgotten = false;   // a new owner of the file: the pending unlink after the write in flight is off
    if (name) s.name = name;
    if (rank === 0) s.rank = 0;   // a person's act / a binding is pending: it goes first at the exit (until written)
    if (allowEmpty !== undefined) s.allowEmpty = !!allowEmpty;
    s.version++;
    s.later = false;   // B-dfa4 cut 3: its store asks again — due once more
    if (s.urgentNext) { s.urgentNext = false; s.urgent = true; s.rank = 0; }   // B-dfa4 cut 3: a write answered LATER while a durable() waited stays urgent
    if (typeof produce === 'function') s.produce = produce;
    if (Number.isFinite(debounceMs)) s.debounceMs = debounceMs;
    if (mode !== undefined) s.mode = mode;
    if (makeDir) s.makeDir = true;
    if (Number.isFinite(rotateAt) && rotateAt > 0) s.rotateAt = rotateAt;   // B-48a4: an append store that is a RING — the thread moves the live file to `.1` past this size, before the append
    if (s.rotateAt) s.appends = true;   // a ring is an append store: the append lane's from its first write
    if (typeof onWritten === 'function') s.onWritten = onWritten;
    if (!s.dirty) { s.dirty = true; s.dirtySince = now(); }
    // `urgent`: an act nobody waits on here (its answer waits through durable() elsewhere, or none does) — the writer's next
    // writes, as durable() asks, without a waiter or its timer (lane lg-store-writes, the U4/U5 cure)
    if (urgent) { s.urgent = true; s.rank = 0; }
    schedule();
  }
  const backoffEnd = (s) => (s.failures > 0 && Number.isFinite(s.failedAt) ? s.failedAt + P.retryMs(s.failures) : -Infinity);
  const rowOf = (s) => ({ name: s.file, dirtySince: s.dirtySince, urgent: s.urgent, failedAt: s.failures > 0 ? s.failedAt : null,
    due: s.urgent ? Math.max(s.dirtySince, backoffEnd(s)) : P.dueAt({ dirtySince: s.dirtySince, lastEndAt: s.lastEndAt, bytes: s.bytes, debounceMs: s.debounceMs, failures: s.failures, failedAt: s.failedAt, lastMs: s.lastMs }, pace) });
  // a lane's due stores: none fenced (no job of its file in flight or waiting on either lane). W takes every store not known
  // as an append store; A every store that ever appended (the acts journal — its whole compaction then goes to W by its
  // bytes) AND every store not known yet (a first append never waits behind another file's whole write; a first WHOLE write
  // made there waits for W, made — one at a time: never a pile of whole writes made early behind a busy W)
  const dueRows = (l) => [...stores.values()].filter((s) => s.dirty && !s.later && s.produce && s.file && !holder(s.file) && (l === LA ? (!!s.appends || (!s.lane && !LW.parked.length)) : s.lane !== 'A')).map(rowOf);
  function schedule() {
    if (stopped || exiting) return;
    const free = LANES.filter((l) => !l.inflight);
    if (free.some((l) => l.parked.length)) { if (timer) clearTimeout(timer); timerAt = now(); timer = setTimeout(tick, 0); timer.unref?.(); return; }   // a job made and waiting for a lane now free
    const rows = free.flatMap((l) => dueRows(l));
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
    if (stopped || exiting) return;
    for (const l of LANES) { if (l.inflight) continue; try { step(l); } catch (e) { say(`[store-write] the writer's own step failed (${(e && e.message) || e}) — the stores stay owed`); } }
    schedule();
  }
  /** ONE job for a FREE lane: a job made earlier and waiting for it, first; else the lane's next due store, its bytes made now.
   *  The BYTES decide the lane (an append → A, any whole write → W): a job for the OTHER lane while that one is busy waits
   *  there, made (its file fenced meanwhile) — never a second job of one file */
  function step(l) {
    if (l.parked.length) { const j = l.parked.shift(); post(l, j.s, j.p, j.since); return; }
    const next = P.nextOf(dueRows(l), now(), { last: l.lastCls });
    if (!next) return;
    l.lastCls = next.urgent ? 'urgent' : 'paced';
    const s = stores.get(next.name);
    const since = s.dirtySince;
    s.dirty = false; s.dirtySince = null; s.urgent = false;   // a change from here on dirties it again, with its own time
    s.writingVersion = s.version;
    let p;
    try {
      const bytes = s.produce();
      if (bytes === LATER) { s.dirty = true; s.dirtySince = since; s.later = true; if (s.waiters.length) s.urgentNext = true; schedule(); return; }   // still OWED (an exit's flush writes it; stats say it) but not due until its store dirties it again   // B-dfa4 cut 3: NOT READY — nothing written, nothing settled: its waiters wait for the write its store asks for when ready
      if (bytes === null) { settled(s, s.writingVersion); return; }   // equal to the disk: nothing to write — ONLY null says so (round 3, smaller 4: undefined is a failed write, said)
      p = partsOf(bytes, { allowEmpty: s.allowEmpty, verify });
    } catch (e) { fail(s, since, e); return; }
    const to = laneOf(p);
    if (!p.rewrite) s.lane = to.name; if (p.append) s.appends = true;   // round wgxur2rci (4): a rewrite leaves its append store's lane guess
    if (to !== l && (to.inflight || to.parked.length)) { to.parked.push({ s, p, since }); return; }
    post(to, s, p, since);
  }
  /** a job's bytes for the main-only road: a list by reference is written whole or NOT AT ALL (a fed list has copied entries let
   *  go: never written short and renamed — the round wyjiekiey) */
  function mainParts(s, p, since) {
    if (!p.pieces) return p;
    if (p.pieces.some((x) => !x)) { fail(s, since, Object.assign(new Error('its list handed by reference was already partly sent'), { code: 'EPIECE' })); return null; }
    return { ...p, parts: p.pieces };
  }
  /** hand ONE job to a lane's thread — or, its thread gone for good (said), write it here */
  function post(l, s, p, since) {
    if (l.mainOnly || !startWorker(l)) { const wp = mainParts(s, p, since); if (wp) writeHere(s, wp, since); return; }
    const id = ++seq;
    l.inflight = { id, name: s.file, since, startedAt: now(), size: p.size, append: p.append || !!p.rewrite, rewrite: !!p.rewrite, as: p.as || null };   // line 42: a rewrite keeps the store an append store (its pace, never unlinked as a forgotten whole file)
    l.posted++;
    LC.inc('writes');   // loop-day-report M5: a write handed to the writer thread
    const msg = { ev: 'write', id, file: s.file, tmp: `${s.file}.tmp-${process.pid}-w`, mode: s.mode, makeDir: !!s.makeDir, rotateAt: s.rotateAt || 0, append: p.append, exclusive: !!s.exclusive, ownOnly: !!s.ownOnly, own: s.own || null, rewrite: p.rewrite || null };   // B-f276 1b's exclusive create, 1c's own-only fields and line 42's rewrite ride every job of a lane (a piece's too; a rewrite is never in pieces)
    if (p.pieces) { feedPieces(l, s, msg, p, since); return; }
    try { l.worker.postMessage({ ...msg, parts: p.parts }, p.transfer); }
    catch (e) { l.inflight = null; l.posted--; fail(s, since, e); }
  }
  // ── LAW 1, NO WHOLE WRITE HOLDS A TURN (主开发 r1328): one turn's snapshot handed BY REFERENCE (byRef), copied PIECE_BYTES at a
  // time, ONE PIECE A TURN. The file is in flight from its first piece to the thread's answer (the fence): a second whole write
  // of it waits and takes the NEWER snapshot — never two temps of one file. A synchronous flush or the exit mid-pieces sends the
  // rest IN ITS CALL, in order (drainPieces); a thread lost mid-pieces drops its temp (the write is owed again from a newer
  // snapshot — never a renamed temp that lacks pieces). The snapshot pins the buffers it names until each is copied: at most
  // the store's size, falling piece by piece. With `verifyByRef` (suites) a handed buffer WRITTEN INTO before its piece fails
  // the write by name (EBYREF), said.
  function feedPieces(l, s, msg, p, since) {
    const f = { l, s, msg, since, list: p.pieces, sums: p.sums, i: 0, off: 0, first: true, done: false };
    l.feed = f;
    sendPiece(f);
    if (!f.done) setImmediate(() => pumpPieces(f));
  }
  function pumpPieces(f) { if (f.done || f.l.feed !== f) return; sendPiece(f); if (!f.done) setImmediate(() => pumpPieces(f)); }
  function drainPieces(l) { const f = l.feed; while (f && !f.done && l.feed === f) sendPiece(f); }
  function sendPiece(f) {
    const l = f.l;
    if (f.done || l.feed !== f || !l.worker) return;
    let msg, transfer = [];
    // THE PIECE'S MAKING IS INSIDE THE TRY (the round wyjiekiey, r1388 (3)): a handed buffer detached or shrunk, a sum that
    // differs, a 4 MB allocation that fails — the store's write FAILS BY NAME (an abort piece: the thread drops its temp, the
    // store stays owed), never an exception out of an immediate (a dead hub)
    try {
      const take = [];
      let bytes = 0, bad = null;
      while (f.i < f.list.length && bytes < PIECE_BYTES) {
        const b = f.list[f.i];
        if (f.sums && f.off === 0 && sumOf(b) !== f.sums[f.i]) { bad = f.i; break; }
        const n = Math.min(b.byteLength - f.off, PIECE_BYTES - bytes);
        if (!(n > 0)) throw Object.assign(new Error(`a buffer it handed by reference (#${f.i}) is shorter than when it was handed`), { code: 'EBYREF' });
        take.push(Buffer.from(b.buffer, b.byteOffset + f.off, n)); bytes += n; f.off += n;
        if (f.off >= b.byteLength) {
          // a buffer that SPANNED pieces is summed again at its last slice: bytes written into its later part are seen (r1388 (7))
          if (f.sums && n < b.byteLength && sumOf(b) !== f.sums[f.i]) { bad = f.i; break; }
          f.list[f.i] = null; f.i++; f.off = 0;   // copied: the snapshot lets it go
        }
      }
      const last = bad !== null || f.i >= f.list.length;
      if (bad !== null) msg = { ...f.msg, ev: 'piece', parts: [], first: f.first, last: true, abort: true, code: 'EBYREF', why: `a buffer it handed by reference (#${bad}) was written into before its write ended` };
      else {
        const one = Buffer.concat(take, bytes), ab = one.byteOffset === 0 && one.byteLength === one.buffer.byteLength ? one.buffer : one.buffer.slice(one.byteOffset, one.byteOffset + one.byteLength);
        msg = { ...f.msg, ev: 'piece', parts: [ab], first: f.first, last }; transfer = [ab];
      }
    } catch (e) {
      msg = { ...f.msg, ev: 'piece', parts: [], first: f.first, last: true, abort: true, code: (e && e.code) || 'EBYREF', why: `its bytes handed by reference could not be read (${(e && e.message) || e})` }; transfer = [];
    }
    const last = !!msg.last;
    f.first = false;
    if (last) { f.done = true; l.feed = null; }
    try { l.worker.postMessage(msg, transfer); }
    catch (e) { f.done = true; if (l.feed === f) l.feed = null; if (l.inflight && l.inflight.id === f.msg.id) { l.inflight = null; l.posted--; } fail(f.s, f.since, e); schedule(); }   // the bytes could not go: a failed write, said (the thread's half temp is its next first piece's to drop)
  }
  function onMessage(l, m) {
    if (m && m.ev === 'memory') return;   // the census's answer (src/worker-memory.js)
    if (m && m.ev === 'written' && m.own && m.file) { const s0 = stores.get(m.file); if (s0) s0.own = m.own; }   // B-f276 1c: also a write the shared cells settled
    if (m && m.ev === 'written' && m.noSync && !m.err) noSyncSeen(m.file ? stores.get(m.file) : null, m.noSync);   // r5010: also a write the shared cells settled
    if (!m || !l.inflight || m.id !== l.inflight.id) return;
    if (m.ev === 'unlinked') { const f = l.inflight; l.inflight = null; const s0 = stores.get(f.name); if (s0 && s0.forgotten) stores.delete(f.name); schedule(); return; }
    if (m.ev !== 'written') return;
    const f = l.inflight; l.inflight = null;
    const s = stores.get(f.name);
    if (m.dropped) say(`[store-write] ${s ? s.name : path.basename(f.name)}: the temp of an earlier write that never finished could not be closed (${m.dropped}) — it was removed`);
    if (s) finish(s, m.err, m.ms, f.size, f.since, false, f.append, null, f.as);
    if (s && s.forgotten && !m.err && !f.append) { postUnlink(l, s); return; }   // forgotten while its write flew: the file it renamed goes again
    if (s && s.forgotten) stores.delete(f.name);
    schedule();
  }
  /** a forgotten store's file goes again — on the lane whose write of it just ended (that lane is free now) */
  function postUnlink(l, s) {
    if (!l.worker) { try { fs.unlinkSync(s.file); } catch { } stores.delete(s.file); schedule(); return; }
    const id = ++seq;
    l.inflight = { id, name: s.file, since: null, startedAt: now(), size: 0, unlink: true };
    l.posted++;
    try { l.worker.postMessage({ ev: 'unlink', id, file: s.file }); } catch { l.inflight = null; l.posted--; stores.delete(s.file); schedule(); }
  }
  function finish(s, err, ms, size, since, onMain = false, append = false, waitedBy = null, as = null) {
    if (err) { fail(s, since, err); return; }
    if (s.exclusive && !append) s.exclusive = false;   // B-f276 1b: its first whole write landed — the file is its store's own now
    s.failures = 0; s.failedAt = null; s.lastEndAt = now(); if (!append) s.bytes = size; s.writes++; s.bytesWritten += size; s.lastMs = ms; s.maxMs = Math.max(s.maxMs, ms);
    if (!onMain) LC.max('writeMaxMs', ms);   // loop-day-report M5: the hour's longest write on the writer thread
    if (Number.isFinite(since)) s.ageMaxMs = Math.max(s.ageMaxMs || 0, s.lastEndAt - since);   // round 3: the MEASURED age of its oldest change when it reached the disk
    settled(s, s.writingVersion);
    if (exiting) { exitWritten.push(s.name); publishExit(); }   // round 6: the keeper's line names what IS on disk
    if (!s.dirty) s.rank = s.keepRank;
    if (record) { try { record(as || s.name, ms); } catch { } }
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
    if (s.waiters.length) {
      const keep = [];
      for (const w of s.waiters) { if (w.version <= s.writtenVersion) { try { w.resolve(true); } catch { } } else keep.push(w); }
      s.waiters = keep;
    }
    runLanded(s);
  }
  /** the steps riding a version now on disk run (afterLanding) — taken off the store first, so a step that dirties the store
   *  again rides the NEXT landing, never this one */
  function runLanded(s, all = false) {
    if (!s.afterLanded || !s.afterLanded.length) return;
    const due = all ? s.afterLanded : s.afterLanded.filter((x) => x.version <= s.writtenVersion);
    if (!due.length) return;
    s.afterLanded = all ? [] : s.afterLanded.filter((x) => x.version > s.writtenVersion);
    for (const x of due) x.go();
  }
  /** A PERSON'S ACT IS DURABLE BEFORE THE ANSWER — without holding the loop: the store's current state is the NEXT write
   *  after the one in flight (its pace set aside — never its failure backoff), and the promise resolves when it is on
   *  disk (false: the write failed and stays owed — the caller says so).
   *  `answer(ok)` — THE SYNCHRONOUS ROAD (lane lg-store-writes, the U4/U5 cure: an act answered is an act answered at the
   *  stop): called ONCE, inside the writer's own settle — the write landing, its failure, the bound, the exit's flush —
   *  never a microtask later. The hub's exit runs exitFlush and process.exit in ONE synchronous run (server.js), so a
   *  route answering from a promise's .then never answered there and its caller repeated the act (a second job); a route
   *  answering from `answer` sends its answer inside the exit's flush. After the exit's last pass nothing more is written:
   *  a durable() asked then answers at once with what the disk holds. */
  function durable(file, { timeoutMs = durableMs, answer = null } = {}) {
    const s = stores.get(file);
    const now1 = (ok) => { if (answer) { try { answer(ok); } catch (e) { answerThrew(s ? s.name : path.basename(file), e); } } return Promise.resolve(ok); };
    if (s && s.appeared) { s.notDurable = { why: 'failed', code: 'EEXIST' }; return now1(false); }   // B-f276 1b: its file appeared — nothing of it is written
    if (!s || (!s.dirty && !holder(file) && s.writtenVersion >= s.version)) return now1(true);
    if (exitAnswered) return now1(false);   // the exit's last pass is over: owed now = not on disk, and nothing writes it
    const want = s.version;
    if (s.dirty) { s.urgent = true; s.rank = 0; }
    return new Promise((resolve) => {
      let said = false;
      // NOT unref'd: an answer awaiting the disk keeps the process up until the write lands, fails, or the timeout
      // round 4 (true words 4): at the timeout a write still QUEUED is said as waiting — never «its write failed»
      const t = setTimeout(() => { s.waiters = s.waiters.filter((x) => x.resolve !== done); s.notDurable = { why: 'queued', ahead: aheadOf(s), lastMs: s.lastMs || null }; done(false); }, timeoutMs);
      const done = (ok) => { if (said) return; said = true; clearTimeout(t); resolve(ok); if (answer) { try { answer(ok); } catch (e) { answerThrew(s.name, e); } } };
      s.waiters.push({ version: want, resolve: done });
      schedule();
    });
  }
  /** ONE answer for a store kept in several files (the jobs store and its notifications): `answer(ok)` once, when every
   *  file's state owed now is on disk — false when any of them failed, passed the bound or was left by the exit — on
   *  durable()'s synchronous road; the promise resolves with the same `ok` */
  function whenDurable(files, { timeoutMs = durableMs } = {}, answer = null) {
    const list = [...new Set(files || [])];
    return new Promise((resolve) => {
      let n = list.length, all = true;
      const end = () => { resolve(all); if (answer) { try { answer(all); } catch (e) { answerThrew(list.map((f) => path.basename(f)).join('+'), e); } } };
      if (!n) { end(); return; }
      const one = (ok) => { if (!ok) all = false; if (--n === 0) end(); };
      for (const f of list) { let asked = false; try { durable(f, { timeoutMs, answer: (ok) => { asked = true; one(ok); } }); } catch { if (!asked) one(false); } }   // a durable() that THREW counts as not on disk — the answer is never lost
    });
  }
  /** THE STEP THAT CANNOT BE UNDONE RIDES THE LANDING (lane lg-store-writes, the moved2 cure 2 — 主开发's ruling: ONE law, built
   *  once beside the writer and used at every such site; NO ROLL BACK ANYWHERE). An act changes memory and marks its store
   *  (dirty) as it always did; its IRREVERSIBLE part — a folder deleted, a job woken, an item resolved, a kept copy dropped, a
   *  machine asked to remove — is handed here as `step` and runs when, and ONLY when, the store's state owed at this call has
   *  LANDED (that version written, by whichever write lands it). A process that dies first leaves the old record on disk and
   *  the step never ran: the act simply did not happen. The step runs ONCE, on the main thread, inside the writer's own settle
   *  (never a microtask later — at a stop, inside the exit's flush); a step that throws is said, once a store.
   *  A HELD WRITE AT A BOUND IS NOT A FAILED ONE (its bytes may be in flight) — and under this law that case needs no road of
   *  its own: nothing is undone at a bound, the step waits for its version to land, whichever write lands it; a FAILED write
   *  keeps it waiting too (the store stays owed, the writer retries). Only the exit's last pass ends the wait: a store still
   *  owed then is not on disk, its step never runs (the old record is what the next start reads).
   *  `answer(landed, value)` — the reply's road, called ONCE: at the landing (after the step, with what it returned), at
   *  `timeoutMs` (false: «saved here, it finishes by itself when the storage answers» — the step stays registered), or at the
   *  exit's last pass (false). `timeoutMs: null` — no bound (nobody waits on the reply). A store with nothing owed runs the
   *  step NOW. → a promise of {landed, value, error?} (the same as the answer) */
  function afterLanding(file, step, { what = null, timeoutMs = durableMs, answer = null } = {}) {
    const s = stores.get(file), name = s ? s.name : path.basename(file);
    let replied = false, t = null, resolveP = null;
    const p = new Promise((r) => { resolveP = r; });
    const reply = (landed, value, error) => {
      if (replied) return; replied = true;
      if (t) { clearTimeout(t); t = null; }
      resolveP({ landed, value, ...(error ? { error } : {}) });
      if (answer) { try { answer(landed, value); } catch (e) { answerThrew(name, e); } }
    };
    let ran = false;
    const go = () => { if (ran) return; ran = true; let v, err = null; try { v = step(); } catch (e) { err = e; stepThrew(name, what, e); } reply(true, v, err); };
    if (!s || (!s.dirty && !holder(file) && s.writtenVersion >= s.version)) { go(); return p; }
    if (exitAnswered) { reply(false); return p; }   // the exit's last pass is over: owed now is not on disk and nothing writes it
    (s.afterLanded || (s.afterLanded = [])).push({ version: s.version, go, end: () => reply(false) });
    if (s.dirty) { s.urgent = true; s.rank = 0; }   // as durable(): the writer's next writes, its pace set aside
    if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
      // NOT unref'd (as durable()'s): a reply waiting on the disk keeps the process up until the landing or the bound
      t = setTimeout(() => { t = null; if (!replied) s.notDurable = { why: 'queued', ahead: aheadOf(s), lastMs: s.lastMs || null }; reply(false); }, timeoutMs);
    }
    schedule();
    return p;
  }
  const stepThrewSaid = new Set();
  function stepThrew(name, what, e) {
    if (stepThrewSaid.has(name)) return; stepThrewSaid.add(name);
    try { say(`[store-write] a step riding ${name}'s landing${what ? ` (${what})` : ''} threw (${(e && (e.code || e.message)) || e})`); } catch { }
  }
  /** an answer that THREW is SAID — once a store (a route's res.json that failed: its caller sees no answer, so the hub's
   *  log names it) */
  const answerThrewSaid = new Set();
  function answerThrew(name, e) {
    if (answerThrewSaid.has(name)) return; answerThrewSaid.add(name);
    try { say(`[store-write] an answer waiting on ${name} threw (${(e && (e.code || e.message)) || e}) — its caller got no answer`); } catch { }
  }
  /** the writes CERTAINLY ahead of this store's (round 6, smaller 2 — a lower bound, never more): the one in flight of
   *  another store + the urgent stores DUE NOW (not in their failure backoff) whose place in the urgent order comes first
   *  (store-pace placeOf: a failed store by the time it failed). The paced turns between them only add to it. */
  function aheadOf(s) {
    const laneOfStore = (x) => holder(x.file) || (x.lane === 'A' ? LA : LW);   // the lane its job is on, or goes to next (r1388 (8))
    const t = now(), mine = P.placeOf(rowOf(s)), l = laneOfStore(s), onL = (x) => laneOfStore(x) === l;   // its own lane's writes only
    let n = l.inflight && l.inflight.name !== s.file ? 1 : 0;
    for (const x of stores.values()) if (x !== s && x.dirty && x.urgent && x.produce && !holder(x.file) && onL(x) && backoffEnd(x) <= t && P.placeOf(rowOf(x)) < mine) n++;
    return n;
  }
  /** why a durable act of this store is not on disk yet — {why: 'queued' | 'failed', ahead?, lastMs?} — for its caller's line */
  function whyNotDurable(file) { const s = stores.get(file); return s && s.notDurable ? { ...s.notDurable } : null; }
  function fail(s, since, err) {
    if (err && err.code === 'EEXIST' && (s.exclusive || s.ownOnly || err.familyHeld)) { appearedHere(s, err); return; }   // B-f276 1c: or not its own file; its round wp3niroz5 (1): or a producer refusing for its family held «appeared» — FINAL, never retried
    s.failures++; s.failedAt = now(); s.notDurable = { why: 'failed', code: (err && (err.code || err.message)) || null };
    if (!s.dirty) { s.dirty = true; s.dirtySince = since != null ? since : now(); } else if (since != null && since < s.dirtySince) s.dirtySince = since;
    // the waiters hear it NOW (false — the change stays owed and the writer retries; the caller says so) — AFTER the store is
    // owed again (the U4/U5 cure's own read: an answer that asks durable() again finds it dirty, so urgent)
    if (s.waiters.length) { const ws = s.waiters; s.waiters = []; for (const w of ws) { try { w.resolve(false); } catch { } } }
    const code = (err && (err.code || err.message)) || String(err);
    const why = err && (err.code === 'EBADBYTES' || err.code === 'EEMPTY') ? `${err.message} — its store gave no bytes to write` : code;
    // round 6's amend: at the exit there is no «retrying in 1 s» — the rank-0 pass's failure gets the exit's last pass, the
    // last pass's failure is named in the exit's own line (never a promise the next line takes back)
    const next = !exiting ? `kept in memory, retrying in ${Math.round(P.retryMs(s.failures) / 1000)} s` : exited ? 'not retried at the exit — named in its exit line' : 'the exit\'s last pass tries it once more';
    if (exiting || s.failures === 1 || s.failures % 10 === 0) say(`[store-write] ${s.name} not written (${why}; attempt ${s.failures}) — ${next}`);
    if (s.onWritten) { try { s.onWritten(false, err); } catch { } }
  }
  /** B-f276 1b (THE MISSING LAW): an exclusive write met a file that APPEARED since its store read it missing — NEVER retried, never
   *  written over: the change is not written here (its store reads and keeps the file — onWritten(false, EEXIST)); its waiters hear
   *  false, said once */
  function appearedHere(s, err) {
    s.appeared = { at: now() }; s.dirty = false; s.dirtySince = null; s.urgent = false; s.later = false;
    s.notDurable = { why: 'failed', code: 'EEXIST' };
    if (s.waiters.length) { const ws = s.waiters; s.waiters = []; for (const w of ws) { try { w.resolve(false); } catch { } } }
    say(`[store-write] ${s.name} not written: its file appeared since its store read it missing — kept as it is, nothing written over it`);
    if (s.onWritten) { try { s.onWritten(false, err); } catch { } }
  }
  /** the bytes written on THIS thread — the SAME writeJob as the thread's (every byte, the close's error, then the rename;
   *  an append fsynced) — the exit flush, a store's own close, a process without a writer thread */
  function writeHere(s, p, since) {
    if (p.rewrite) { fail(s, since, Object.assign(new Error('a rewrite is never written on the main thread (it copies the file)'), { code: 'EREWRITEMAIN' })); return false; }   // its store keeps the file whole and goes on
    const t0 = now(), tmp = `${s.file}.tmp-${process.pid}`;
    try {
      const r = W().writeJob({ file: s.file, tmp, parts: p.parts, mode: s.mode, makeDir: !!s.makeDir, rotateAt: s.rotateAt || 0, append: p.append, exclusive: !!s.exclusive, ownOnly: !!s.ownOnly, own: s.own || null }, fs);
      if (r && r.own) s.own = r.own;   // B-f276 1c: the numbers of the file this own-only store made
      if (r && r.noSync) noSyncSeen(s, r.noSync);   // r5010: its sync the file system does not do — landed, said once
      finish(s, null, now() - t0, p.size, since, true, p.append);
      return true;
    } catch (e) { if (e && e.own) s.own = e.own; if (!p.append) { try { fs.unlinkSync(tmp); } catch { } } fail(s, since, e); return false; }   // r2593 (2): a FIRST own-only append that made the file and then failed hands its numbers to the store's cell here too
  }
  /** the failed job's own error code, from the shared cells (round 6's amend: the exit road said «EWRITE» for an EIO) — r5010: the same
   *  cells carry a LANDED job's no-sync code (its outcome 1) */
  function jobErrorCode(l) {
    const S = l.S;
    try { const n = Atomics.load(S, 3); if (n > 0 && S.byteLength >= 48) return Buffer.from(new Uint8Array(S.buffer, 16, Math.min(32, n))).toString('latin1'); } catch { }
    return 'EWRITE';
  }
  /** the own numbers {dev, ino} of the file the lane's last job wrote for an own-only store, from the shared cells (B-f276 1c × the
   *  lanes: one thread's map is not the other's — the store's own cell carries them across) — or null */
  function jobOwn(l) {
    const S = l.S;
    try { if (S.byteLength >= 64) { const B = new BigUint64Array(S.buffer, 48, 2); if (B[1] > 0n) return { dev: B[0], ino: B[1] }; } } catch { }
    return null;
  }
  /** wait (blocking — the loop cannot turn here) for the thread's job in flight, at most until `deadline`. The thread
   *  NOTIFIES the cell this waits on: a waited write ends when the write ends (round 6's amend — it ended at the 50 ms
   *  poll); `waitsTimedOut` counts a wait that ended by its poll with the job still in flight (the fast pin reads it) */
  function settleInflight(l, deadline, waitedBy = 'the exit') {
    if (!l.inflight) return true;
    const S = l.S;
    if (!S) return false;
    if (l.feed) drainPieces(l);   // a whole write mid-pieces: the rest goes out NOW, in this call, in order (r1328 (2))
    if (!l.inflight) return true;   // the drain's post threw: the job is over, its failure said (fail) — the flush and the EXIT go on (r1388 (2))
    while (Atomics.load(S, 1) < l.posted) {
      const rest = deadline - now();
      if (rest <= 0) return false;
      if (Atomics.wait(S, 1, Atomics.load(S, 1), Math.min(rest, 50)) === 'timed-out' && Atomics.load(S, 1) < l.posted) waitsTimedOut++;
    }
    const f = l.inflight; l.inflight = null;
    const s = stores.get(f.name);
    if (f.unlink) { if (s && s.forgotten) stores.delete(f.name); return true; }
    if (s) { const o = jobOwn(l); if (o) s.own = o; }   // the file its store made, known BEFORE the job's answer is read: the next write of it (the other lane, in this call) is not refused as not its own
    if (s && Atomics.load(S, 2) !== 2 && Atomics.load(S, 3) > 0) noSyncSeen(s, jobErrorCode(l));   // r5010: a LANDED job's no-sync code rides the same cells
    if (s) finish(s, Atomics.load(S, 2) === 2 ? { code: jobErrorCode(l) } : null, now() - f.startedAt, f.size, f.since, false, f.append, waitedBy, f.as);
    if (s && s.forgotten && !f.append && Atomics.load(S, 2) !== 2) postUnlink(l, s);   // forgotten while it flew: gone again — on the thread
    return true;
  }
  /** ROUND 3 (law 2): a write the main thread needs NOW is still the THREAD's — posted, then waited for (Atomics, bounded by
   *  `deadline`); the main thread never writes a moved store's bytes itself (only a writer whose thread is gone — law E i's
   *  fallback, said once — writes here). → 'ok' | 'failed' | 'held' (the thread still has it at the deadline) */
  function writeWaiting(s, p, since, deadline, waitedBy) {
    const l = laneOf(p);
    if (!p.rewrite) s.lane = l.name; if (p.append) s.appends = true;   // round wgxur2rci (4): a rewrite leaves its append store's lane guess
    if (l.inflight && !settleInflight(l, deadline, waitedBy)) return 'held';   // its OWN lane's job first (an append never waits on W)
    if (l.mainOnly || !startWorker(l) || !l.S) { const wp = mainParts(s, p, since); return wp && writeHere(s, wp, since) ? 'ok' : 'failed'; }
    const f0 = s.failures, a0 = s.appeared;
    post(l, s, p, since);
    if (!l.inflight) return s.failures > f0 ? 'failed' : 'ok';   // the bytes could not go: failed, said
    if (l.feed) drainPieces(l);   // a write in pieces: every piece in this call, in order
    if (exiting) publishExit();   // round 6's amend: the keeper's line names this write as IN FLIGHT, not «still owed»
    if (!settleInflight(l, deadline, waitedBy)) return 'held';
    return s.failures > f0 || (s.appeared && s.appeared !== a0) ? 'failed' : 'ok';   // its round wp3niroz5 (6): a write refused as «appeared» is no «ok»
  }
  /** THE SYNCHRONOUS FLUSH of the stores of these FILES (all when `names` is null): every OTHER dirty store first, in the
   *  exit ORDER (what cannot be re-derived first, then the smaller, then the oldest change), then the file whose write is
   *  in flight (that write lands first — settled through the shared cells — then its newer state), until `budgetMs`:
   *  ALWAYS BOUNDED (round 2, law D: a rename the storage never answered held close() for ever). During the exit (after
   *  beginExit) a store's own flush only keeps it dirty — exitFlush writes everything once. → {written, left, ms, budgetMs} */
  /** r5156 (a removal's read, S1): a deadline in THIS writer's own clock, `budgetMs` (a synchronous flush's bound) from now — two stores
   *  landed by ONE person's act share it, so a stalled storage holds the loop one bound, never one bound a store */
  function flushDeadline(budgetMs = syncBound) { return now() + budgetMs; }
  function flushSync(names = null, { budgetMs = syncBound, deadline: dl = null, only = null, waitedBy = 'a synchronous flush' } = {}) {
    const t0 = now(), deadline = dl != null ? dl : t0 + budgetMs, written = [], left = [];
    if (exiting && !exited && names) return { written, left, ms: 0, budgetMs, deferred: true };
    const want = (s) => s.dirty && s.produce && s.file && (!names || names.includes(s.file)) && (!only || only(s));
    const held = new Set();   // the LANES whose thread holds a write past the deadline: nothing more can be written on them
    const laneGuess = (s) => (s.lane === 'A' ? LA : LW);
    const land = (s, p, since) => {
      const l = laneOf(p);
      const r = writeWaiting(s, p, since, deadline, waitedBy);
      if (r === 'ok') written.push(s.name);
      else if (r === 'failed') left.push({ name: s.name, file: s.file, why: `the write failed (${(s.notDurable && s.notDurable.code) || 'an error'}; ${s.failures} attempt${s.failures === 1 ? '' : 's'})` });   // round 6's amend: its own code
      else { held.add(l); l.heldBy = l.inflight; s.dirty = true; s.dirtySince = since;   // F1 (row B-9a24 R9's follow, r4551): laneHeld() reads it
        left.push({ name: s.name, file: s.file, why: `its write was still held by the storage at the bound (${((now() - (l.inflight ? l.inflight.startedAt : t0)) / 1000).toFixed(1)} s)` }); }
    };
    const writeOne = (s) => {
      if (held.has(laneGuess(s)) || now() >= deadline) { left.push({ name: s.name, file: s.file, why: held.has(laneGuess(s)) ? `the ${threadWord(laneGuess(s))} was still held by the storage` : 'the bound was spent' }); return; }
      const since = s.dirtySince;
      s.dirty = false; s.dirtySince = null; s.urgent = false; s.writingVersion = s.version;
      let p;
      try {
        const bytes = s.produce({ sync: true });   // B-dfa4 cut 3: a synchronous flush (close, the exit, a suite) — a store makes its bytes in this turn
        if (bytes === LATER) { s.dirty = true; s.dirtySince = since; s.later = true; left.push({ name: s.name, file: s.file, why: 'its bytes were not ready' }); return; }
        if (bytes === null) { settled(s, s.writingVersion); return; }
        p = partsOf(bytes, { allowEmpty: s.allowEmpty, verify });
      }
      catch (e) { fail(s, since, e); left.push({ name: s.name, file: s.file, why: `its bytes could not be made (${(e && e.message) || e})` }); return; }
      land(s, p, since);
    };
    // the writes in flight of the files asked (every lane's, for a flush of all) land first — their state is older than any
    // owed now; a write mid-pieces sends its rest in this call
    for (const l of LANES) {
      const busy = l.inflight && !l.inflight.unlink ? l.inflight : null;
      if (!busy || (names && !names.includes(busy.name))) continue;
      if (!settleInflight(l, deadline, waitedBy)) { held.add(l); const s0 = stores.get(busy.name); left.push({ name: s0 ? s0.name : busy.name, file: busy.name, why: `its write was still held by the storage after ${((now() - busy.startedAt) / 1000).toFixed(1)} s` }); }
    }
    // the jobs MADE and waiting for a lane (their bytes are this turn's or older): written next, in the order they were made
    for (const l of LANES) for (const j of l.parked.filter((x) => (!names || names.includes(x.s.file)) && (!only || only(x.s)))) {   // the exit's rank-0 pass: its own list only (r1388 (5))
      l.parked.splice(l.parked.indexOf(j), 1);
      if (held.has(l) || now() >= deadline) { j.s.dirty = true; j.s.dirtySince = j.since; left.push({ name: j.s.name, file: j.s.file, why: held.has(l) ? `the ${threadWord(l)} was still held by the storage` : 'the bound was spent' }); continue; }
      land(j.s, j.p, j.since);
    }
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
      const fly = LANES.filter((l) => l.inflight && !l.inflight.unlink).map((l) => (stores.get(l.inflight.name) || {}).name || 'a write');
      const text = P.exitSummary({ written: exitWritten, owed, inflight: fly.length ? fly.join(' + ') : null });
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
    if (!rank0) {
      // THE ANSWERS GO OUT BEFORE THE PROCESS LEAVES (lane lg-store-writes, the U4/U5 cure): the caller ends the process in
      // this same synchronous run — every waiter still here is answered NOW on durable()'s synchronous road: true when its
      // version reached the disk, false when it did not (its write failed, or it changed again past the last pass)
      exitAnswered = true;
      for (const s of stores.values()) if (s.waiters.length) { const ws = s.waiters; s.waiters = []; for (const w of ws) { try { w.resolve(w.version <= s.writtenVersion); } catch { } } }
      // the steps riding a landing (afterLanding): a version on disk ran its step inside settle; one still owed NEVER runs — its
      // reply says not landed, the old record is what the next start reads
      for (const s of stores.values()) if (s.afterLanded && s.afterLanded.length) { const xs = s.afterLanded; s.afterLanded = []; for (const x of xs) { try { x.end(); } catch { } } }
    }
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
    runLanded(s, true);   // …and so are the steps riding it (afterLanding): the record they waited for is its owner's removal
    if (holder(file)) { s.forgotten = true; return; }
    stores.delete(file);
  }
  /** the bytes this writer still OWES `file` — its newest state, made now by its store's producer (lane lg-store-writes, the moved2
   *  cure 2: a load right after another owner's write that is still held reads THESE, never the older file); null when nothing
   *  is owed or the bytes are not a whole text (an append) */
  function owed(file) {
    const s = stores.get(file);
    if (!s || !s.produce || (!s.dirty && s.writtenVersion >= s.version)) return null;
    try {
      const b = s.produce();
      if (typeof b === 'string') return b;
      if (Buffer.isBuffer(b)) return b.toString('utf8');
      if (Array.isArray(b) && b.every((x) => typeof x === 'string' || Buffer.isBuffer(x))) return b.map((x) => (typeof x === 'string' ? x : x.toString('utf8'))).join('');
      return null;
    } catch { return null; }
  }
  const pending = (file) => { const s = stores.get(file), f = inflightOf(file); return !!(s && (s.dirty || (f && !f.unlink) || LANES.some((l) => l.parked.some((j) => j.s.file === file)))); };
  function stats() {
    const t = now();
    return [...stores.values()].map((s) => ({ name: s.name, writes: s.writes, bytes: s.bytes, bytesWritten: s.bytesWritten, lastMs: Math.round(s.lastMs), maxMs: Math.round(s.maxMs), slow: s.slow,
      failures: s.failures, dirty: s.dirty, inflight: !!holder(s.file), file: s.file, oldestAgeMs: s.dirty ? Math.round(t - s.dirtySince) : 0,
      version: s.version,   // the store's change count (dirty() bumps it): a caller tells «changed since» by it (the boot's migrations)
      // round 3: maxAgeMs is MEASURED (the oldest change's age when a write of it landed, or the one still owed now) —
      // never the designed bound; the bound the queue keeps is store-pace.js's, in writes
      gapMs: Math.max(P.minGapMs(s.bytes, pace), Math.round(s.lastMs)), maxAgeMs: Math.round(Math.max(s.ageMaxMs || 0, s.dirty ? t - s.dirtySince : 0)), urgent: !!s.urgent }));
  }
  const modeOf = (l) => (l.mainOnly ? 'main' : l.worker ? 'thread' : 'idle');
  const mode = () => modeOf(LW);   // the whole-write lane's (every store's but the appends)
  const modes = () => ({ whole: modeOf(LW), append: modeOf(LA) });
  function stop() { stopped = true; if (timer) clearTimeout(timer); timer = null; for (const l of LANES) { const w = l.worker; l.worker = null; l.feed = null; try { w && w.terminate(); } catch { } } const k = keeperT; keeperT = null; try { k && k.terminate(); } catch { } }
  /** suites: a handed buffer's bytes checked at its piece (byRef's promise) — a buffer written into fails its write (EBYREF) */
  const verifyByRefOn = (on = true) => { verify = !!on; };
  if (keeperOn) startKeeper();   // a suite's own writer may ask for one; the server's is started by bootKeeper() at its boot
  const waits = () => ({ timedOut: waitsTimedOut });
  /** (row B-9a24 R9's follow F1, 主开发 r4551) the lane that writes `file` still holds the very job a synchronous flush already gave up
   *  on at its bound: a caller that would wait on it again asks first and refuses at once (its next try after the job settles) */
  const laneHeld = (file) => { const s = stores.get(file); const l = s && s.lane === 'A' ? LA : LW; return !!(l && l.inflight && l.heldBy && l.heldBy === l.inflight); };   // round 6's amend: waits that ended by their poll, not the write's end
  return { LATER, dirty, durable, whenDurable, afterLanding, owed, whyNotDurable, flushSync, flushDeadline, laneHeld, noteSignal, beginExit, exitFlush, exitStartedAt, startKeeper, forget, pending, stats, waits, mode, modes, verifyByRef: verifyByRefOn, stop, graceMs, durableMs, _now: now };   // durableMs: the bound a durable() waits by default (B-0248: the desktops' doors and points read it)
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
/** AN HTTP ANSWER MADE WHILE THE HUB STOPS GOES OUT UNENCODED (the U4/U5 cure's own read): the hub's compression() middleware
 *  gzips a body of 1 KB or more through an ASYNCHRONOUS zlib stream — process.exit, in the exit flush's own run, comes first
 *  and the answer is lost; `Cache-Control: no-transform` makes compression() pass it through as written. A no-op before the
 *  stop's signal (and for a process without the shared writer). Every route answering on durable()'s road calls it. */
function identityAtExit(res) {
  try { if (shared && shared.exitStartedAt() != null && res && !res.headersSent && typeof res.setHeader === 'function') res.setHeader('Cache-Control', 'no-transform'); } catch { }
}

/** THE LAW for a module handed its writer by its caller (a suite's stand-in may be one): the writer's afterLanding; a writer
 *  without it (a stand-in that writes in place) or none runs the step now, answered as landed. → the same promise */
function ride(W, file, step, opts = {}) {
  if (W && typeof W.afterLanding === 'function') return W.afterLanding(file, step, opts);
  let v, error = null; try { v = step(); } catch (e) { error = e; }
  if (opts.answer) { try { opts.answer(true, v); } catch { } }
  return Promise.resolve({ landed: true, value: v, ...(error ? { error } : {}) });
}

module.exports = { create, storeWriter, bootKeeper, partsOf, byRef, identityAtExit, ride, GRACE, SLOW_MS, RESTARTS_MAX, LATER, PIECE_BYTES };
