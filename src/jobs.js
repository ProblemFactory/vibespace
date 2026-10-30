// JobManager — Background Work engine (ORCH tier; docs/design-background-work.md M1).
// Registry + supervisor for agent-registered services / long tasks / cron.
// Laws honored here: single-engine lock; adopt-first boot; identity =
// pid+starttime+bootId re-verified at every act; intent-before-spawn; kill by
// handle only; age-based GC that never touches live work; atomic store +
// broadcast on change; async sweeps only; §ban-safety guardrails live in the
// PURE model (vetSpec/schedule floors) and in the sanitized job env here.
'use strict';
const fs = require('fs');
const path = require('path');
const net = require('net');
const http = require('http');
const PI = require('./proc-identity.js'); // B-1cc6: a pid is never an identity
const crypto = require('crypto');
const { withoutNoticeHead } = require('./notification-senders.js'); // lane notify-retry: a parked frame carries the ladder's head; the floor's digest is of the raw text
const textDigest = (t) => crypto.createHash('sha256').update(String(t)).digest('hex'); // a flood floor's memory of a text (verify r9)
const { spawn, execFile } = require('child_process');
const M = require('./job-model.js');
const JN = require('./job-notice.js'); // PURE (lane job-notice-dedupe): a published service's notice is a STATE CHANGE — the verdict over its down record
const { credentialEnvNames } = require('./harness-env.js'); // PURE: B-6be2 — the job door's credential strip, derived from the descriptors
const { list: harnessList } = require('./harnesses');
const { timedSync } = require('./timed-sync.js'); // PURE: the store-write clock (design 011 lane 1, store-timing)
const { applyClear, CLEARED_TEXT } = require('./record-clear.js'); // PURE: "Clear content…" (2026-09-28) — this engine holds the door (clearJobs)

function writeJsonAtomic(file, obj) {
  const tmp = file + '.tmp-' + process.pid;
  // _-prefixed keys are runtime-only (raw tokens, cursors) — never persisted
  fs.writeFileSync(tmp, JSON.stringify(obj, (k, v) => (k.startsWith('_') ? undefined : v), 1));
  fs.renameSync(tmp, file);
}
/** The per-conversation notification cap (30): the oldest UNCLAIMED entries fall off; an entry stamped `ho` is being
 *  handed over and leaves by that hand-over's own drain (channel-jump verify r4 — the ladder's store has the same
 *  rule, conversation-deliver `capUnclaimed`). The store may exceed the cap by the claimed count while one is in flight. */
// THE FOR-YOU DEP, OFF THE OBJECT GRAPH (lane job-notify-user r6, accept-r5 unverified 2): the store's dep lives HERE — a
// module WeakMap keyed by the engine — never on the engine or on `this.d`: r5 kept it on `this._forYouDep` and made `this.d`
// an Object.create(deps), so `Object.getPrototypeOf(this.d).notifyUser` reached the raw dep with no journal line. The ONE
// set is the constructor's, the ONE get is _forYou's (test-architecture §93 THE DOOR CENSUS).
const FOR_YOU_DEPS = new WeakMap();
/** the engine's view of its deps: every dep read LIVE off `deps` (a wiring or a suite sets one after the engine is built),
 *  the For-you dep answered by the stray door — and NO road back to `deps` (no prototype link, no own copy of notifyUser:
 *  a Proxy's target and handler are unreachable). A write lands on the view (a suite's stub shadows a dep, as before). */
function depsView(deps, own) {
  const mine = Object.assign(Object.create(null), own);
  return new Proxy(mine, {
    get: (t, k) => (k in t ? t[k] : k === 'notifyUser' ? undefined : deps[k]),
    has: (t, k) => k in t || (k !== 'notifyUser' && k in deps),
  });
}
/** the frame that called `fn` (V8 call sites) — `src/jobs.js:1345 _finalizeRun` — for the stray door's log line */
function callerOf(fn) {
  const keep = Error.prepareStackTrace, lim = Error.stackTraceLimit;
  try {
    Error.stackTraceLimit = 1; Error.prepareStackTrace = (_, cs) => cs;
    const o = {}; Error.captureStackTrace(o, fn);
    const c = Array.isArray(o.stack) ? o.stack[0] : null; if (!c) return 'a caller with no frame of its own';
    const f = String(c.getFileName() || ''), abs = f.startsWith('file://') ? require('url').fileURLToPath(f) : f;
    return `${abs ? path.relative(path.join(__dirname, '..'), abs) : '(no file)'}:${c.getLineNumber()}${c.getFunctionName() ? ' ' + c.getFunctionName() : ''}`;
  } catch { return 'a caller the engine cannot name'; } finally { Error.prepareStackTrace = keep; Error.stackTraceLimit = lim; }
}
const NOTIF_STASH_CAP = 30;
const FLOOR_DROP_WINDOW_MS = 60 * 60 * 1000;   // verify r4: a floor witness from the future is dropped once; a second within this window is re-based (the clock keeps going back)
/** B-dfb4 (the product decision, notify-retry verify r4): an eviction is SAID to the owner — a For-you notice (origin
 *  jobs) at most once per conversation per this window; every eviction is still journaled. */
const DROP_NOTICE_EVERY_MS = 60 * 60 * 1000;
function capUnclaimedNotifs(q) {
  // the cap counts the UNCLAIMED entries (when every slot is claimed, a newcomer is the only unclaimed one — a
  // cap over the whole store would evict exactly the entry that just arrived); the oldest unclaimed fall off
  // A MAY-HAVE-LANDED COPY GIVES WAY FIRST (notify-retry verify r3, reproduced on the ladder's twin: a possible repeat
  // handed over from the retry park evicted a certain miss) — the dropped entries are returned so the log names them
  let over = q.filter((e) => !(e && e.ho)).length - NOTIF_STASH_CAP;
  const dropped = [];
  if (over <= 0) return dropped;
  for (const pass of [(e) => !!(e.held && e.held.maybeDelivered), () => true]) {
    for (let i = 0; i < q.length && over > 0;) {
      if (!q[i] || q[i].ho || !pass(q[i])) { i++; continue; }
      dropped.push(...q.splice(i, 1)); over--;
    }
  }
  return dropped;
}
function readStarttime(pid) { return PI.starttimeOf(pid) || 0; } // B-1cc6: the ONE reader is src/proc-identity.js
const LISTEN_READ_MS = 30_000; // lane artifacts-services: a running job's listening ports, re-read at most this often (the sweep's tick)
function bootId() { return PI.bootIdOf(); }
// jobs must never inherit ambient vendor credentials or server config
// (§ban-safety structural leg). B-6be2: the credential half is DERIVED — every
// harness descriptor's `creds.*EnvVar(s)` + the vendor CLIs' own login names
// (src/harness-env.js credentialEnvNames, the one list the agent door shares),
// never typed here; a job's own env/secrets (`extra`) are laid on after and win.
function jobEnv(extra = {}, base = process.env) {
  const env = { ...base };
  const credentials = new Set(credentialEnvNames(harnessList()));
  for (const k of Object.keys(env)) {
    if (/^(VIBESPACE_|npm_|CLAUDE_CODE_)/.test(k)) delete env[k];
    if (['PORT', 'HOST', 'NODE_ENV', 'NODE_OPTIONS'].includes(k) || credentials.has(k)) delete env[k];
  }
  return { ...env, ...extra };
}
// THE WRAPPER'S OWN ENV IS BUILT, NEVER INHERITED (lane job-spec-off-argv, 2026-10-20): the wrapper reads its spec file
// and hands spec.env to the job — nothing of the server's env is its to carry (measured: it runs on an EMPTY env; a bare
// argv[0] resolves through spec.env's PATH). An allowlist, not jobEnv's denylist. serviceEnv when it lands.
const WRAPPER_ENV_KEEP = Object.freeze(['PATH', 'HOME', 'LANG', 'TMPDIR']);
function wrapperEnv(jobId, base = process.env) {
  const env = {};
  for (const k of WRAPPER_ENV_KEEP) if (typeof base[k] === 'string' && base[k]) env[k] = base[k];
  env.VIBESPACE_JOB_ID = String(jobId);
  return env;
}
// THE WRAPPER'S PROTOCOL (lane job-wrapper-update-window, fb-7f7be1e24e): the server SAYS which one it speaks — an update
// writes the new data/bin/job-wrapper.js minutes before it restarts the server, and this process spawns whatever is on
// disk. Equal to the wrapper's own PROTO (test-jobs-engine §12 pins the pair): bump BOTH when the spec's road changes.
// A wrapper that does not speak it never starts the job and says so (exit.json reason update_window) — _finalizeRun.
const WRAPPER_PROTO = 2;
// how long after the wrapper changed on disk a mismatch is still the update's window (its restart is on the way: 45 s
// measured on the owner's hub; an install + build bounded at minutes) — past it, the install itself is broken: a fault
const UPDATE_WINDOW_MS = 15 * 60 * 1000;
const now = () => Date.now();
const rid = () => 'jb-' + crypto.randomBytes(4).toString('hex');
// triage archive (design §13): newest ARCHIVE_CAP records kept; the sweep
// runs at boot and every ARCHIVE_SWEEP_MS on the engine's existing 5 s tick
const ARCHIVE_CAP = 2000;
const ARCHIVE_SWEEP_MS = 5 * 60 * 1000;
// A STOP'S GRACE and THE REAP'S BOUND (lane jobs-memory-bound, acceptance round 5): a stop's SIGTERM, then STOP_GRACE_MS before
// the kill step — the owner's stop, a timeout, an until-marker and a stop the sweep honors alike (the tick never cuts it short);
// a read of a scope's cgroup.procs answers within REAP_READ_MS or the run is judged without it (a busy threadpool never holds
// a judgment — the reap is retried by a later tick). Round 6: A REAP THAT DID NOT FINISH IS ALWAYS RETRIED — whoever started it
// (the boot, the sweep, a start), by every tick whatever its job's state, REAP_TRIES times; then said once and dropped
const STOP_GRACE_MS = 10_000;
const REAP_READ_MS = 2000;
const REAP_TRIES = 12;
// THE LADDER's last rung (round 7): a wrapper still there WEDGE_MS after its scope was killed is killed with its group
const WEDGE_MS = 3000;
const pause = (ms) => new Promise((res) => setTimeout(res, ms));
/** the typed held record for a stash entry, from the ladder's own answer */
function heldOf(r, reason) {
  const kind = M.heldKind(r, reason);
  const out = { kind };
  if (r && r.phase) out.phase = String(r.phase);                       // lane notify-retry: the attempt's facts ride the held record
  if (r && (r.busy === true || r.busy === false)) out.busy = r.busy;
  if (kind === 'spend-cap' && r) {
    if (r.why) out.why = String(r.why);
    if (r.identity && (r.identity.name || r.identity.key)) out.identity = String(r.identity.name || r.identity.key);
    if (Number.isFinite(Number(r.cap))) out.cap = Number(r.cap);
    if (Number(r.retryAfter) > 0) out.retryAfter = Number(r.retryAfter);
  }
  return out;
}
// newest first: by the archive instant, then by the terminal instant — one
// sweep archives many records at ONE archivedAt, and the cap must still keep
// the newest of them deterministically
const archiveOrder = (a, b) => ((b.archivedAt || 0) - (a.archivedAt || 0)) || (M.terminalAt(b) - M.terminalAt(a)) || String(b.id).localeCompare(String(a.id));

class JobManager {
  /** deps: { dataDir, broadcast(type,payload), notifyUser({words,fact,urgency,jobId,jobName,ownerCid})→{ok,why?}, log,
   *          deliverToConversation?(cid,text)→Promise<{ok,peerName?,reason?}>,   // 2.344.0 peer-message lane
   *          groupNotifyFor?(job)→true|false|null, notifyGlobal?()→bool }        // toggle resolution */
  constructor(deps) {
    // THE ONE FOR-YOU DOOR, at run time too (lane job-notify-user r4, accept-r3 unverified 0): the For-you store's dep is held
    // HERE and reached through _forYou alone; `this.d.notifyUser` is the STRAY door — a filing that skipped _forYou (a merge
    // that kept an older direct call) still reaches the store with its own shape, and the store's verdict is JOURNALED on
    // the job it names (r3: the wiring dropped its `text`, the store refused «i18n.text needs a key» into a swallowed catch —
    // 0 items, no line, poll silent). test-architecture §93 names every line that reaches the dep (THE DOOR CENSUS) in every
    // file that can hold it (src/, server.js, data/bin) and every scope — r5: this ONE line is the constructor's whole share
    // (r4 exempted the whole constructor: a closure made here over deps.notifyUser was a second door the census never saw).
    // r6: the dep is held OFF the object graph (FOR_YOU_DEPS) and `this.d` has no road back to `deps` (depsView)
    FOR_YOU_DEPS.set(this, typeof deps.notifyUser === 'function' ? deps.notifyUser : null);
    const stray = (a) => this._forYouStray(a, callerOf(stray));
    this.d = depsView(deps, { notifyUser: stray });
    this._labelMemo = new Map();   // name → its belted label (the belt reads the vault; a list snapshot asks for every name)
    this.file = path.join(deps.dataDir, 'jobs.json');
    this.notifsFile = path.join(deps.dataDir, 'job-notifications.json');
    this.logsDir = path.join(deps.dataDir, 'job-logs');
    this.lockFile = path.join(deps.dataDir, 'jobs.lock');
    // TRIAGE ARCHIVE (design §13): terminal one-shots leave jobs.json for
    // this append-only array (newest first, capped at ARCHIVE_CAP). Loaded
    // LAZILY — the boot sweep and the first read-through both go through
    // _loadArchive(); nothing else touches the file.
    this.archiveFile = path.join(deps.dataDir, 'jobs-archive.json');
    this.archive = null;          // null = not loaded yet
    this._lastArchiveSweep = 0;   // the 5-min cadence rides the 5 s _sweep tick — no second timer
    this._sweepRun = null; this._sweepSkips = 0; // ONE JUDGE PER RUN END (round 5): a pass in flight is never entered twice
    this._reapLater = new Map();  // run → {job, tries}: a reap that did not finish (round 6: whoever started it) — retried by every tick
    this.jobs = new Map();
    this.readOnly = false;
    this.ready = false;
    this.events = [];            // ring of {ts, jobId, name, what, verb} for injection
    this.pendingNotifs = new Map(); // conversationId → [{jobId, jobName, text, ts, urgency}] — OFFLINE stash, drained at resume injection
    this.waiters = new Map();    // jobId → [{resolve, timer}] (poll --wait)
    this.ansWaiters = new Map(); // jobId → [{resolve, timer}]
    this._timers = [];
    this._dirty = false;
    // THE RETRY PARK'S EVENTS (lane notify-retry, 2026-10-01): a notification the ladder parked (a transient miss on a
    // live pid) is this engine's to book — parked / attempt / delivered / fell — by the job id the park's meta names
    if (typeof deps.onRetry === 'function') { try { deps.onRetry((ev, cid, entry, extra) => this._onRetryEvent(ev, cid, entry, extra)); } catch (e) { deps.log && deps.log('[jobs] retry events unavailable:', e.message); } }
    this._dropNoticeAt = new Map(); // conversationId → when its last "dropped at the cap" For-you notice was filed (B-dfb4: ≤ 1 per hour)
    this._notifyRate = new Map(); // conversationId → {ts, h} — engine-side floor under the CLI's own throttles; `h` = the text's DIGEST (lane-redact verify r9: the TEXT — a job's name + words — sat here per conversation, pruned only past 500, out of every clear's reach)
    this._floorDrops = new Map(); // conversationId → {at, saidAt}: when its floor witness was last DROPPED for a backward clock (verify r4: the second drop within the hour re-bases instead, said once an hour)
  }

  // ── lifecycle ───────────────────────────────────────────────────────────
  init() {
    try {
      fs.mkdirSync(this.logsDir, { recursive: true });
      if (!this._takeLock()) {
        this.readOnly = true;
        this.d.log('[jobs] another engine holds the lock — READ-ONLY registry (no adopt/replay/cron)');
        this._load(); this._loadNotifs(); this.ready = true; return;
      }
      this._load();
      this._loadNotifs();
      this._bootAt = now(); // this server generation's start: a run begun before it was an older generation's (update window)
      this._adoptAndReplay();
      // boot sweep (triage §13 rule 5): housekeeping happens as soon as the
      // store is trustworthy again, isolated like every other init step
      try { this.archiveSweep({ why: 'boot' }); } catch (e) { this.d.log('[jobs] archive sweep at boot failed:', e.message); }
      const t1 = setInterval(() => this._sweep().catch((e) => this.d.log('[jobs] sweep failed:', e.message)), 5000);
      const t2 = setInterval(() => this._cronTick().catch((e) => this.d.log('[jobs] cron tick failed:', e.message)), 30_000);
      const t3 = setInterval(() => this._gc().catch((e) => this.d.log('[jobs] gc failed:', e.message)), 3600_000);
      const t4 = setInterval(() => { if (this._dirty) this._save(); }, 2000);
      for (const t of [t1, t2, t3, t4]) { t.unref?.(); this._timers.push(t); }
      this._cronTick().catch(() => { });
      this.ready = true;
    } catch (e) {
      // engine failure must be LOUD but never block the server (§5 failure isolation)
      this.initError = e.message;
      this.d.log('[jobs] ENGINE INIT FAILED (subsystem down until next boot):', e.message);
      this._forYou(null, M.forYouCopy(null, 'engine-failed', { error: e.message }));
    }
  }
  shutdown() { try { if (this._dirty) this._save(); } catch { } try { if (!this.readOnly) fs.unlinkSync(this.lockFile); } catch { } }

  _takeLock() {
    try {
      const cur = JSON.parse(fs.readFileSync(this.lockFile, 'utf-8'));
      if (cur.pid && readStarttime(cur.pid) === cur.starttime && cur.starttime) return cur.pid === process.pid; // live foreign engine
    } catch { }
    writeJsonAtomic(this.lockFile, { pid: process.pid, starttime: readStarttime(process.pid), at: now() });
    return true;
  }
  _load() {
    try {
      const arr = timedSync('jobs.read', () => JSON.parse(fs.readFileSync(this.file, 'utf-8')));
      for (const j of arr) this.jobs.set(j.id, j);
    } catch (e) {
      if (fs.existsSync(this.file)) { // corrupt store: preserve bytes, reconcile skeletons from log dirs (§5)
        const bad = this.file + '.corrupt-' + now();
        try { fs.renameSync(this.file, bad); } catch { }
        this.d.log('[jobs] store corrupt → preserved at', bad, '— rebuilding skeletons; error:', e.message);
        try {
          for (const id of fs.readdirSync(this.logsDir)) {
            if (!id.startsWith('jb-')) continue;
            this.jobs.set(id, { id, kind: 'task', name: id, state: 'unverified', note: 'recovered from corrupt store — resolve before reuse', owner: {}, access: { view: 'all', control: 'session' }, runs: [] });
          }
        } catch { }
        this._forYou(null, M.forYouCopy(null, 'store-corrupt'));
      }
    }
  }
  _save() {
    // a READ-ONLY engine (second server against a live lock) must never flush
    // its stale in-memory copy over the live engine's store (2.344.1 review
    // catch: shutdown()'s dirty-flush had no guard, and drainNotifs marks
    // dirty even in read-only mode)
    if (this.readOnly) { this._dirty = false; return; }
    try {
      timedSync('jobs.write', () => writeJsonAtomic(this.file, [...this.jobs.values()]));
      timedSync('jobs-notifs.write', () => writeJsonAtomic(this.notifsFile, Object.fromEntries(this.pendingNotifs)));
      this._dirty = false;
    } catch (e) { this.d.log('[jobs] save failed:', e.message); }
  }
  _loadNotifs() {
    try {
      const obj = JSON.parse(fs.readFileSync(this.notifsFile, 'utf-8'));
      this.releasedAtBoot = [];
      for (const [cid, list] of Object.entries(obj)) {
        if (!Array.isArray(list) || !list.length) continue;
        // a hand-over the previous process did not settle (verify r2, the ladder's stash has the same rule): the
        // entries wait again, by name in the log — the shutdown waits for a hand-over in flight, so a stamp here is a
        // process killed mid-post
        const ids = new Set();
        for (const n of list) if (n && n.ho) { ids.add(n.ho); delete n.ho; }
        if (ids.size) { this.releasedAtBoot.push({ cid, ids: [...ids], n: list.length }); this.d.log(`[jobs] ${cid}: a hand-over (${[...ids].join(', ')}) was in flight when the previous server stopped — its job results wait again`); }
        this.pendingNotifs.set(cid, list);
      }
      if (this.releasedAtBoot.length && !this.readOnly) this._saveNotifs();
    } catch { }
  }

  // ── TRIAGE ARCHIVE (2026-09-14, docs/design-background-work.md §13) ─────
  _loadArchive() {
    if (this.archive) return this.archive;
    try {
      const arr = JSON.parse(fs.readFileSync(this.archiveFile, 'utf-8'));
      this.archive = Array.isArray(arr) ? arr.filter((r) => r && typeof r === 'object' && r.id) : [];
    } catch (e) {
      if (fs.existsSync(this.archiveFile)) { // corrupt: preserve the bytes, never destroy
        const bad = this.archiveFile + '.corrupt-' + now();
        try { fs.renameSync(this.archiveFile, bad); } catch { }
        this.d.log('[jobs] archive corrupt → preserved at', bad, '—', e.message);
      }
      this.archive = [];
    }
    this.archive.sort(archiveOrder);
    return this.archive;
  }
  /** THE archive write. Answers {ok:true} (and `next` becomes the in-memory
   *  archive) or {ok:false, error}. A failure is LOUD (verbatim log +
   *  telemetry) and changes NOTHING in memory — every caller mutates the
   *  store only after this answers ok (verifier 2026-09-16: the sweep used to
   *  release records FIRST, so one swallowed ENOSPC/EACCES/EROFS deleted them
   *  for good under a log line that said "archived"). */
  _writeArchive(next) {
    if (this.readOnly) return { ok: false, error: 'read-only' };
    const arr = next || this._loadArchive();
    try { writeJsonAtomic(this.archiveFile, arr); this.archive = arr; return { ok: true }; }
    catch (e) {
      this.d.log('[jobs] archive write FAILED (nothing left the store; the next sweep retries):', e.message);
      try { this.d.getTelemetry?.()?.record?.({ kind: 'error', name: 'jobs-archive-write-failed', detail: e.message }); } catch { /* telemetry is optional */ }
      return { ok: false, error: e.message };
    }
  }
  /** the settings-fed policy (jobs.archiveDoneAfterHours / jobs.archiveFailedAfterDays;
   *  an explicit 0 = never; garbage falls back to the defaults 24 h / 7 d) */
  _archivePolicy() {
    let p = null;
    try { p = this.d.archivePolicy ? this.d.archivePolicy() : null; } catch { p = null; }
    const num = (v, dflt) => (v === 0 || v === '0' ? 0 : Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : dflt);
    const doneAfterHours = num(p && p.doneAfterHours, 24);
    const failedAfterDays = num(p && p.failedAfterDays, 7);
    return { doneAfterHours, failedAfterDays, doneAfterMs: doneAfterHours * 3600e3, failedAfterMs: failedAfterDays * 86400e3 };
  }
  /** THE SWEEP (rule 5): moves every terminal one-shot the PURE verdict
   *  releases out of jobs.json into the archive. SYNCHRONOUS on purpose — the
   *  boot call and the tick call can never interleave, so there is no
   *  read-modify-write to lose. ONE archive write, ONE store flush and ONE
   *  broadcast per sweep, never per record — IN THAT ORDER: the store is
   *  flushed only after the archive copy is durable. `now` is injectable. */
  archiveSweep({ now: at = now(), why = 'tick' } = {}) {
    if (this.readOnly) return { archived: [], skipped: 'read-only' };
    this._lastArchiveSweep = at;
    const pol = this._archivePolicy();
    const moved = [];
    for (const job of [...this.jobs.values()]) {
      let v = M.archiveVerdict(job, { now: at, doneAfterMs: pol.doneAfterMs, failedAfterMs: pol.failedAfterMs, alive: false, cronParentActive: this._cronParentActive(job) });
      if (!v.archive) continue;
      // the pid stamp is read only for a record the clock already released —
      // never a per-record /proc read for the whole store every tick
      if (this._verifyAlive(this._readStamp(job))) continue;
      const rec = JSON.parse(JSON.stringify(job, (k, val) => (k.startsWith('_') ? undefined : val))); // runtime-only keys never persist
      rec.archivedAt = at; rec.archivedWhy = v.why;
      moved.push(rec); // NOT released yet — the archive copy must be durable first
    }
    if (!moved.length) return { archived: [] };
    // THE ORDER IS THE INVARIANT (verifier 2026-09-16): the archive is written
    // BEFORE a single record leaves the store. The old order — delete, then
    // write behind a catch that only logged, then flush jobs.json — turned one
    // ENOSPC/EACCES/EROFS into 200 deleted records under "archived 200". A
    // store flush that fails AFTER a successful archive write brings the
    // record back at the next boot, so a re-archived id REPLACES its older
    // archive copy instead of duplicating it.
    const movedIds = new Set(moved.map((m) => m.id));
    const next = [...moved, ...this._loadArchive().filter((r) => !movedIds.has(r.id))];
    next.sort(archiveOrder);
    // the cap keeps the NEWEST; a record the cap drops is unreachable from
    // every surface once the archive that no longer names it is on disk, so
    // its log dir goes with it (it would leak for ever)
    const dropped = next.length > ARCHIVE_CAP ? next.splice(ARCHIVE_CAP) : [];
    const w = this._writeArchive(next);
    if (!w.ok) {
      this.d.log(`[jobs] archive sweep (${why}): ${moved.length} record(s) released but NOT archived — the store keeps them (${w.error})`);
      return { archived: [], failed: 'archive-write', kept: moved.length, error: w.error };
    }
    for (const m of moved) { this.jobs.delete(m.id); this.waiters.delete(m.id); this.ansWaiters.delete(m.id); }
    this._dirty = true; // a failed flush retries on the 2 s timer; a boot re-archive is idempotent (see above)
    this._save();
    for (const d of dropped) { try { fs.rmSync(path.join(this.logsDir, d.id), { recursive: true, force: true }); } catch { } }
    this.d.log(`[jobs] archived ${moved.length} one-shot(s) (${why}; ${moved.map((m) => m.archivedWhy).filter((x, i, a) => a.indexOf(x) === i).join(', ')})${dropped.length ? `, cap dropped ${dropped.length}` : ''}`);
    try { this.d.broadcast('jobs-updated', { archived: moved.map((m) => m.id) }); } catch { }
    return { archived: moved.map((m) => m.id), dropped: dropped.length };
  }
  /** a cron child whose parent still schedules fires is that cron's run ring */
  _cronParentActive(job) {
    if (!job.cronParent) return false;
    const p = this.jobs.get(job.cronParent);
    return !!p && p.desiredUp !== false && p.state !== 'missed';
  }
  /** the STRUCTURE every surface renders the held-notification count from
   *  (5b): per conversation, by typed reason — the client says the words */
  heldDigest() { return M.heldDigest(this.pendingNotifs); }
  archivedList() { return this._loadArchive(); }
  archivedCount() { return this._loadArchive().length; }
  archivedById(id) { return this._loadArchive().find((r) => r.id === id) || null; }
  /** the SAME snapshot shape as a live record + archivedAt/archivedWhy/archived:true —
   *  an agent holding an old id must never see a different shape. */
  snapshotArchived(rec, opts) {
    return { ...this.snapshot(rec, opts), archived: true, archivedAt: rec.archivedAt || null, archivedWhy: rec.archivedWhy || null };
  }
  /**
   * "CLEAR CONTENT…" — THE door for Background Work records (2026-09-28). A job
   * is a family: clearing a cron parent clears the runs it spawned too (each
   * child is named `<parent name> run` and ran the same command). Each record —
   * in the registry AND in the archive — is asked `allow(job)` (the caller's
   * PURE clearVerdict) and cleared IN PLACE through src/record-clear.js
   * applyClear: the name becomes the ONE sentence; note, context brief,
   * progress, the notify action's text, every run's last log line, every
   * delivery's reason and the user's panel answers go. id, kind, state, owner,
   * access, times, runs, schedule and the COMMAND stay (the program is not a
   * record's words; ✕ removes it). THE DERIVED COPIES go with it: the viewers'
   * event ring (`announced: …` lines + the name), a conversation's held
   * notification stash, and the drained-notification spill files under
   * data/job-notifications-read/ (a line per notification, rewritten); a
   * snapshot of a cleared job serves no log tail (the run's log file itself is
   * the process's output, like a transcript — kept until the 14-day GC).
   * ORDER (the archive law, 2026-09-16): the ARCHIVE is written first through
   * `_writeArchive`; a failed write changes nothing anywhere and answers
   * {error}. Then the registry records, one `_save()`, ONE broadcast.
   * Returns {cleared: [ids], already: [ids], unknown: [ids], refused: [{id, code, why, status}]} | {error}.
   */
  clearJobs(ids, { by = 'owner', at = now(), allow = null } = {}) {
    if (this.readOnly) return { error: 'registry is read-only in this process' };
    const out = { cleared: [], already: [], unknown: [], refused: [] };
    const want = new Set((Array.isArray(ids) ? ids : [ids]).map(String));
    const arch = this._loadArchive();
    const family = (j) => want.has(j.id) || (j.cronParent && want.has(j.cronParent));
    const seen = new Set();
    // 1) decide every record first (nothing written yet)
    const liveHits = [...this.jobs.values()].filter(family);
    const archHits = arch.filter(family);
    // the names every derived copy is FILED UNDER (the ladder's stash heads a job's message
    // 'Background Work · <name>') — read before the record loses them
    const namesBefore = new Set([...liveHits, ...archHits].flatMap((j) => (j.name ? [j.name, this.labelOf(j)] : [])));   // the ladder stash's label carries the BELTED name (lane job-notify-user r3) — an older entry the raw one
    const nameBefore = new Map([...liveHits, ...archHits].map((j) => [j.id, j.name]));
    for (const id of want) if (!this.jobs.has(id) && !arch.some((r) => r.id === id)) out.unknown.push(id);
    const verdictOf = (j) => { const v = allow ? allow(j) : { ok: true }; return v && v.ok ? null : (v || { code: 'not_yours' }); };
    const refusedIds = new Set();
    for (const j of [...liveHits, ...archHits]) {
      if (!want.has(j.id)) continue; // a child rides its parent's verdict
      const v = verdictOf(j);
      if (v) { refusedIds.add(j.id); out.refused.push({ id: j.id, code: v.code || 'not_yours', why: v.why || '', status: v.status || 403 }); }
    }
    const go = (j) => !refusedIds.has(j.id) && !(j.cronParent && refusedIds.has(j.cronParent) && !want.has(j.id));
    // 2) the archive — a COPY, written durably before anything else changes
    let archChanged = false;
    // A RECORD CLEARED AGAIN is stamped `reclearedAt` (lane-redact verify r4, reproduced): a job keeps running after its
    // first clear (a recurring digest announces more), so what it said BETWEEN two clears reads the sentence as its name
    // yet carries words the second clear takes everywhere it can reach — `clearedAt` keeps the FIRST stamp on an
    // `already` record, so the two judges of a late copy (judgeHeldEntry, _stashNotif's `stale`) read this stamp too
    const next = arch.map((r) => {
      if (!family(r) || !go(r)) return r;
      const c = JSON.parse(JSON.stringify(r));
      const again = !!r.clearedAt;
      const changed = applyClear(c, { kind: 'job', by, at }).changed;
      if (changed) seen.add(r.id);
      if (again) c.reclearedAt = at;
      if (changed || again) { archChanged = true; return c; }
      return r;
    });
    if (archChanged) {
      const w = this._writeArchive(next);
      if (!w.ok) return { error: 'archive write failed: ' + w.error };
    }
    // 3) the registry, in place (a live record keeps its runtime-only fields)
    let liveChanged = false;
    for (const j of liveHits) {
      if (!go(j)) continue;
      if (j.clearedAt) { j.reclearedAt = at; liveChanged = true; }   // cleared before this call (see step 2)
      if (applyClear(j, { kind: 'job', by, at }).changed) {
        liveChanged = true; seen.add(j.id);
        // the ASK went with the words (verify r3): a job parked on a question the owner cleared is
        // no longer waiting on it — back to `up`, and the question's For-you item is resolved (the
        // cascade in src/server/record-clear.js then clears that item's words like every other)
        if (j.state === 'awaiting-user' && !(j.interaction && j.interaction.pending)) { j.state = 'up'; this._resolveAns(j); try { this.d.resolveJobAsk && this.d.resolveJobAsk(j.id); } catch { } }
      }
    }
    for (const j of [...liveHits, ...archHits]) {
      if (!go(j) || out.cleared.includes(j.id) || out.already.includes(j.id)) continue;
      (seen.has(j.id) ? out.cleared : out.already).push(j.id);
    }
    if (!out.cleared.length && !out.already.length) return out;
    // 4) the derived copies: the event ring, the held stash, the spill files, the ladder's stash —
    // for an ALREADY-cleared job too (verify r3): an announce after the first clear puts new words in
    // the ring / the stash / a spill (never in the record), so a second clear of that job returns
    // `already` for the record and still takes those words
    const gone = new Set([...out.cleared, ...out.already]);
    for (const e of this.events) {
      if (!gone.has(e.jobId)) continue;
      e.name = CLEARED_TEXT;
      if (typeof e.what === 'string' && e.what.startsWith('announced:')) e.what = 'announced: ' + CLEARED_TEXT;
    }
    // a HELD notification of a cleared job loses ALL its words (verify r1): its `text` is
    // whatever `what` the delivery carried — an `announced:` output line, but also the
    // notify action's OWN text (`a.text || job.name`, one of the fields the clear
    // replaced) — and it is injected verbatim into the owner conversation's next turn
    // (renderNotifStash) and spilled to a file. Only the announced prefix was rewritten
    // before, so a `--notify` reminder's words survived the clear. Fail closed: the sentence.
    for (const q of this.pendingNotifs.values()) {
      for (const n of q) {
        if (!n || !gone.has(n.jobId)) continue;
        n.jobName = CLEARED_TEXT;
        n.text = CLEARED_TEXT;
      }
    }
    this._rewriteSpills(gone);
    // the delivery ladder's own stash (data/msg-stash.json): a codex owner conversation's wrapper hands a
    // notification it could not queue back to the ladder, which stashes it WHOLE under the job's name
    // (verify r3) — every such entry filed under a cleared job's name loses its words
    // …never ANOTHER job's (lane-redact verify r9): names are not unique — an entry naming (by id, `… (jb-…): …`) only jobs
    // this clear did not take is a same-name job's undelivered notification, kept; one naming a cleared job or no job goes
    const otherJobsOnly = (e) => { const ids = typeof e.text === 'string' ? e.text.match(/\bjb-[0-9a-f]{8}\b/g) : null; return !!ids && ids.every((id) => !gone.has(id)); };
    try { if (this.d.redactStash) this.d.redactStash((e) => (e && typeof e.fromName === 'string' && namesBefore.has(e.fromName.replace(/^Background Work · /, '')) && !otherJobsOnly(e) ? { text: CLEARED_TEXT, fromName: 'Background Work · ' + CLEARED_TEXT } : null), { jobIds: [...gone] }); } catch (e) { this.d.log('[jobs] ladder stash rewrite failed:', e.message); }
    // a PUBLISHED service's forward is labelled with the service's name (the Ports panel, data/port-forwards.json):
    // relabelled through the same door that labelled it (verify r3) — a running service cleared mid-flight keeps its forward.
    // Found BY ITS LABEL, never by the runtime-only `_pfId` (lane-redact verify r8, reproduced): the forward is persisted and
    // restored at boot while `_pfId` is set again only by the next publish (an adopted service's +8 s re-publish, a respawn,
    // the await inside _ensurePublish) — a clear in that window kept `service: <name>` on the Ports panel and on disk
    const svcLabels = new Set([...gone].map((id) => nameBefore.get(id)).filter((n) => n && n !== CLEARED_TEXT).flatMap((n) => ['service: ' + n, 'service: ' + this._agentWords(n)]));   // r4: a forward labelled since .361 carries the BELTED name — an older one the raw
    // …and never ANOTHER job's (lane-redact verify r9): names are not unique — a live service NOT cleared that bears the same
    // name and publishes that forward's port owns it (its Ports row read the sentence until its next publish); an orphan
    // forward with the cleared name (no live owner) still goes — fail closed
    const sameNameLive = (rec) => [...this.jobs.values()].some((o) => !gone.has(o.id) && o.kind === 'service' && o.publish && ('service: ' + o.name === rec.label || 'service: ' + this.labelOf(o) === rec.label) && (o.ports || []).map(Number).includes(Number(rec.remotePort)));
    if (svcLabels.size && this.d.getPorts) {
      try {
        const pf = this.d.getPorts();
        for (const rec of (pf && pf.list && pf.list()) || []) {
          if (!svcLabels.has(rec.label)) continue;
          if (sameNameLive(rec)) continue;
          Promise.resolve(pf.forward(rec.hostId, rec.remotePort, { label: 'service: ' + CLEARED_TEXT, targetHost: rec.targetHost || '' })).catch(() => { });
        }
      } catch { }
    }
    if (liveChanged) this._dirty = true;
    this._save();
    if (out.cleared.length) { try { this.d.broadcast('jobs-updated', { cleared: out.cleared }); } catch { } }
    return out;
  }
  /**
   * "CLEAR CONTENT…" — THE LADDER'S JUDGE (lane-redact verify r4, 2026-09-28, reproduced): the delivery ladder asks this of
   * EVERY entry it stashes (`registerStashJudge`, src/server/jobs-wiring.js). The clear's own rewrite (`redactStash`
   * above) takes what is queued at that instant — but a notification the codex wrapper hands BACK later (a queued
   * message dropped by Stop / removed from the queue: `peer_message_result ok:false`, an unbounded window, past a
   * restart too) re-enters the queue WHOLE with the pre-clear words. A frame names its job by id (renderOwnerNotify:
   * `task "name" (jb-…): … poll jb-…`); a job cleared at any time whose frame does not already read the sentence — a
   * notification rendered AFTER the clear names the job BY the sentence (its name now) and is new output of a job
   * cleared once — is held as the sentence, its Background Work label too. Store-backed (`clearedAt` in the registry
   * and the archive), never a memory of past clears. null = not a cleared job's words.
   */
  judgeHeldEntry(e) {
    const text = e && typeof e.text === 'string' ? e.text : '';
    if (!text) return null;
    const ids = text.match(/\bjb-[0-9a-f]{8}\b/g);
    if (!ids) return null;
    // a frame that already reads the sentence was rendered after the job's clear (its name IS the sentence) — new output,
    // kept — unless the job was cleared AGAIN (verify r4, reproduced): a frame rendered BETWEEN two clears reads the
    // sentence too and carries the words the second clear took; the frame has no time, so that case fails closed
    const reads = text.includes(CLEARED_TEXT);
    let cleared = false;
    for (const id of new Set(ids)) {
      const j = this.jobs.get(id) || (this._loadArchive() || []).find((r) => r && r.id === id) || null;
      if (j && j.clearedAt && (!reads || j.reclearedAt)) { cleared = true; break; }
    }
    if (!cleared) return null;
    const label = typeof e.fromName === 'string' && /^Background Work · /.test(e.fromName);
    return { text: CLEARED_TEXT, ...(label ? { fromName: 'Background Work · ' + CLEARED_TEXT } : {}) };
  }
  /** The drained-notification spill files (spillNotifs): every line naming a
   *  cleared job keeps its time and id, loses its words. */
  _rewriteSpills(gone) {
    const dir = path.join(this.d.dataDir, 'job-notifications-read');
    let names = [];
    try { names = fs.readdirSync(dir).filter((f) => f.endsWith('.md')); } catch { return; }
    const lineRe = /^- (\S+) (jb-[0-9a-f]+) .*$/;
    for (const f of names) {
      const file = path.join(dir, f);
      let text;
      try { text = fs.readFileSync(file, 'utf-8'); } catch { continue; }
      let changed = false, dropping = false;
      const out = text.split('\n').map((l) => {
        const m = lineRe.exec(l);
        // a spill written before verify r3 kept a multi-line text's CONTINUATION lines under its entry: after
        // a cleared entry, every line up to the next entry / section head goes with it (over-clearing a
        // neighbour's continuation is the safe side; keeping a cleared job's words is the leak)
        if (!m) { if (dropping && l.trim() && !l.startsWith('## ')) { changed = true; return null; } dropping = false; return l; }
        dropping = gone.has(m[2]);
        if (!dropping) return l;
        changed = true;
        return `- ${m[1]} ${m[2]} ${CLEARED_TEXT}`;
      }).filter((l) => l !== null).join('\n');
      if (!changed) continue;
      try { const tmp = file + '.tmp-' + process.pid; fs.writeFileSync(tmp, out); fs.renameSync(tmp, file); }
      catch (e) { this.d.log('[jobs] spill rewrite failed for', f, '—', e.message); }
    }
  }
  /** ✕ on an archived row: gone for good (record + its log dir). */
  rmArchived(id) {
    if (this.readOnly) return { error: 'registry is read-only in this process' };
    const arch = this._loadArchive();
    const i = arch.findIndex((r) => r.id === id);
    if (i < 0) return { error: 'no such archived job' };
    const w = this._writeArchive(arch.filter((r) => r.id !== id));
    if (!w.ok) return { error: 'archive write failed: ' + w.error }; // the row stays until its removal is durable
    try { fs.rmSync(path.join(this.logsDir, id), { recursive: true, force: true }); } catch { }
    try { this.d.broadcast('jobs-updated', { id, removed: true, archived: true }); } catch { }
    return { ok: true };
  }

  // ── owner auto-notify (2.344.0, B-0bf4 — the CLI's own cross-session
  // messaging inbox is the delivery channel; docs/design-background-work
  // §Owner notify). VibeSpace never fabricates user input: a live owner
  // conversation gets a PEER MESSAGE on its inbox socket (the CLI queues it
  // mid-turn / opens a turn when idle, gated by its own inbound controls); an
  // absent owner gets a durable STASH entry injected passively at the next
  // SessionStart/prompt hook. Toggles: job override > group tri-state >
  // global agents.jobNotify (default ON).
  _notifyOwner(job, ev) {
    try {
      if (ev && typeof ev === 'object' && !ev.at) ev.at = now(); // when the event was BORN (a stash after a clear judges by it)
      const cid = job.owner && job.owner.conversation && job.owner.conversation.id;
      // SUBSCRIBERS (2.345.0, owner request): sessions that explicitly opted
      // in to a visible job's events get the same message. A subscription is
      // its own explicit switch — group/global defaults and the owner's
      // --notify override govern the OWNER lane only; a subscriber leaves by
      // unsubscribing. View access was checked at subscribe time.
      // a cron CHILD inherits its parent's subscribers too — subscribing to
      // the visible cron record is the natural action, and the per-fire
      // events live on the child. Per-subscriber regex FILTERS (2.347.0)
      // match against the final notification text — a news watcher's
      // subscriber can ask for only /SpaceX/ lines; non-matching events are
      // simply not that subscriber's (no stash either).
      const parent = job.cronParent ? this.jobs.get(job.cronParent) : null;
      // PER RECIPIENT, PER FIELD (lane job-notify-user r3): the job's NAME is belted on every copy; the agent's own --text
      // (`agentWhat`) returns to its AUTHOR whole — the owner conversation wrote it, and the belt protects a person and
      // other agents, never the author from itself (r2 belted it: «Renew the auth token: run the refresh script» arrived
      // as «Renew the auth token: «redacted»») — while a SUBSCRIBER (another conversation) gets it belted, and the
      // context the owner attached too. A subscriber's --filter matches the words it will receive (the belted copy).
      const name = this.labelOf(job);
      const notifText = M.renderOwnerNotify(job, ev, { name });
      const subEv = ev && ev.agentWhat ? { ...ev, what: this._agentWords(ev.what) } : ev;
      const ctx0 = !job.context ? '' : typeof job.context === 'string' ? job.context : (job.context.payload || '');
      const subText = M.renderOwnerNotify(job, subEv, { name, context: ctx0 ? this._agentWords(ctx0) : '' });
      const seenSubs = new Set();
      for (const sub of [...(job.subscribers || []), ...((parent && parent.subscribers) || [])]) {
        if (!sub.conversationId || sub.conversationId === cid || seenSubs.has(sub.conversationId)) continue;
        seenSubs.add(sub.conversationId);
        if (!M.filterMatches(sub.filter, subText)) continue;
        this._deliverTo(sub.conversationId, job, subEv, { subscriber: true, text: subText });
      }
      if (!cid) return; // user-created or lineage-less job — user lanes (inbox/panel) already cover it
      // THE OWNER'S OWN FILTER (lane job-notice-dedupe, fb-a001be4917): the owner conversation subscribed to its own job with a
      // --filter — that filter shapes its auto-notify too (the loop above skips the owner and this lane ignored it: the only
      // escape from a repeat was `notify off`, which silences a real failure as well). Journalled, never stashed.
      const own = [...(job.subscribers || []), ...((parent && parent.subscribers) || [])].find((s) => s.conversationId === cid && s.filter);
      if (own && !M.filterMatches(own.filter, notifText)) { this._notifyLogPush(job, { lane: 'filtered', ok: false, reason: 'your own subscription filter' }); return; }
      const eff = M.notifyEffective(this._notifyOverrideOf(job), this.d.groupNotifyFor ? this.d.groupNotifyFor(job) : null, this.d.notifyGlobal ? this.d.notifyGlobal() : true);
      if (!eff.on) { job.lastNotify = { ts: now(), lane: 'off', ok: false, source: eff.source }; this._notifyLogPush(job, { lane: 'off', ok: false, reason: 'auto-notify off (' + eff.source + ')' }); return; }
      this._deliverTo(cid, job, ev, { text: notifText });
    } catch (e) { this.d.log('[jobs] owner notify failed:', e.message); }
  }
  /** one delivery attempt to ONE conversation (owner or subscriber): flood
   *  floor → socket post → stash fallback. Subscriber deliveries never stamp
   *  the job's lastNotify (that field narrates the OWNER lane). */
  _deliverTo(cid, job, ev, { subscriber, text: preText } = {}) {
    const text = preText || M.renderOwnerNotify(job, ev, { name: this.labelOf(job) });
    // engine-side flood floor (the CLI also rate-limits + dedupes): ≥30s
    // between SOCKET posts per conversation, identical text 10min. A floored
    // DISTINCT event is STASHED, not dropped (2.344.1 review catch); only an
    // identical repeat is dropped outright.
    const rate = this._notifyRate.get(cid) || {};
    // a floor stamp ahead of now is the clock's, not the delivery's (notify-retry verify r3 — the park's own floor had
    // the same hole): a backward step would read every notification as "within the floor" (stashed) or "a duplicate
    // within 10 min" (dropped) for the length of the step; the witness is DROPPED (floor and duplicate window start
    // fresh — re-basing it to now would hold the very next notification 30 s for a post that never happened), said once
    // …ONCE AN HOUR (verify r4, reproduced on the park's twin: a clock that keeps stepping back — two time daemons fighting —
    // dropped the witness at every attempt and posted seven frames in the same millisecond, the floor gone entirely). A
    // second future witness within the hour of the last drop is RE-BASED to now (one floor held, said once per hour)
    if (rate.ts && rate.ts > now()) {
      const drop = this._floorDrops.get(cid) || null;
      if (drop && now() - drop.at < FLOOR_DROP_WINDOW_MS) {
        if (!(drop.saidAt && now() - drop.saidAt < FLOOR_DROP_WINDOW_MS)) { drop.saidAt = now(); this.d.log(`[jobs] ${cid}: the notify floor was stamped in the future again within the hour — the clock keeps going back; the witness is re-based to now (one floor held, not dropped) and this is said once an hour`); }
        rate.ts = now();   // the stored record itself (the `{}` fallback never reaches here: its ts is falsy) — `_stampNotifyFloor` stays the ONE writer of the map (record-clear census §I)
      } else {
        this.d.log(`[jobs] ${cid}: the notify floor was stamped ${Math.round((rate.ts - now()) / 60000)} min in the future — the clock went back; the witness is dropped (no floor, no duplicate window)`);
        this._floorDrops.set(cid, { at: now(), saidAt: 0 }); this._notifyRate.delete(cid); delete rate.ts; delete rate.h;
      }
    }
    if (rate.h === textDigest(text) && rate.ts && now() - rate.ts < 600_000) {
      if (!subscriber) { job.lastNotify = { ts: now(), lane: 'suppressed', ok: false, reason: 'duplicate within 10min' }; this._notifyLogPush(job, { lane: 'suppressed', ok: false, reason: 'duplicate within 10min' }); }
      return;
    }
    if (rate.ts && now() - rate.ts < 30_000) {
      this._stashNotif(cid, job, ev, 'rate floor — queued for injection instead', { stampLast: !subscriber, held: { kind: 'rate-floor' } });
      this._dirty = true;
      return;
    }
    this._stampNotifyFloor(cid, text);
    if (this._notifyRate.size > 500) { // prune: keep the map bounded
      const cut = now() - 600_000;
      for (const [k, v] of this._notifyRate) if (!v.ts || v.ts < cut) this._notifyRate.delete(k);
      if (this._notifyRate.size > 500) this._notifyRate.clear();
    }
    // kind:'notification' TYPES THE FRAME (2026-09-07, owner: 系统通知默认应该是
    // steering的): nobody is waiting for a reply here, so on a harness whose
    // notification lane is 'steer' (backend-caps notificationDelivery) this
    // joins the RUNNING turn instead of becoming its own billed turn after it.
    // The ENGINE does not decide the lane — the receiving wrapper does, because
    // only it knows whether a turn is running. The 30s floor + stash below stay
    // exactly as they were: a floored batch is drained as ONE injected block by
    // agent-routes (renderNotifStash), never re-delivered per entry.
    // THE RETRY PARK (lane notify-retry): a transient miss on a LIVE pid is parked by the ladder for this producer —
    // the meta is what this engine needs to book the outcome later (the job, the event, the raw text's digest for
    // the floor), with or without the job record still in the registry
    const retry = { producer: 'jobs', meta: { jobId: job.id, jobName: this.labelOf(job), ev: { what: (ev && ev.what) || job.state, at: (ev && ev.at) || now() }, subscriber: !!subscriber } };   // the NAME belted (lane job-notify-user r3)
    const deliver = this.d.deliverToConversation
      ? this.d.deliverToConversation(cid, text, { fromName: 'Background Work · ' + this.labelOf(job), kind: 'notification', spendReason: 'job-notification', retry })
      : Promise.resolve({ ok: false, reason: 'no delivery lane wired' });
    Promise.resolve(deliver).then((r) => {
      if (r && r.ok) {
        if (!subscriber) job.lastNotify = { ts: now(), lane: r.lane || 'message', ok: true, to: r.peerName || null };
        this._notifyLogPush(job, { lane: r.lane || 'message', ok: true, to: r.peerName || null, ...(subscriber ? { sub: true } : {}) });
      } else if (r && r.parked === true) {
        // parked, never stashed: the ladder retries it at the conversation's turn end and on its backoff; the
        // journal line is this engine's R2 measurement (phase / busy / late) and the panel's Delivery log reads it
        if (!subscriber) job.lastNotify = { ts: now(), lane: 'retry', ok: false, reason: r.reason || 'timeout', retryAt: r.retryAt || null };
        this._notifyLogPush(job, { lane: 'message', ok: false, parked: true, id: r.id || null, reason: r.reason || 'timeout', phase: r.phase || null, busy: r.busy === true || r.busy === false ? r.busy : null, ...(Number(r.late) > 0 ? { late: Number(r.late) } : {}), retryAt: r.retryAt || null, retries: 0, to: String(cid).slice(0, 8), ...(subscriber ? { sub: true } : {}) });
        this.d.log(`[jobs] notify → parked for retry for ${cid} (${r.reason || 'timeout'}; phase ${r.phase || '?'}; target mid-turn: ${r.busy === true ? 'yes' : r.busy === false ? 'no' : 'unknown'}${Number(r.late) > 0 ? `; our loop was ${Number(r.late)} ms late` : ''}; next attempt ${r.retryAt ? new Date(r.retryAt).toISOString() : '?'} or at the turn end)`);
      } else {
        this._stashNotif(cid, job, ev, (r && r.reason) || 'unreachable', { stampLast: !subscriber, held: heldOf(r, (r && r.reason) || 'unreachable') });
      }
      this._dirty = true;
      try { this.d.broadcast('jobs-updated', { id: job.id }); } catch { }
    }).catch((e) => {
      this._stashNotif(cid, job, ev, e.message, { stampLast: !subscriber, held: { kind: 'not-reachable' } }); // degrade path logs verbatim inside
      this._dirty = true;
    });
  }
  /** THE ONE WRITE of the per-conversation flood floor (record-clear census §I, verify r9 ⑥: a DIGEST of the last text,
   *  never the text) — the attempt stamps it, and a parked delivery that LANDS re-stamps it (lane notify-retry R5). */
  _stampNotifyFloor(cid, text) {
    this._notifyRate.set(cid, { ts: now(), h: textDigest(text) });
  }
  /** THE RETRY PARK'S OUTCOMES (lane notify-retry): `attempt` updates the parked Delivery-log line in place (retries,
   *  the last attempt's phase / busy, the next instant — never one line per attempt, the log holds 12); `delivered`
   *  books the one wake (lane + retries + deliveredAt + parkedFor, `via` message | hand-over | prompt) and RE-STAMPS
   *  the 30 s floor — the floor counts the SUCCESSFUL delivery (R5); `fell` stashes it in THIS store with the park's
   *  reason typed (`not-running` / `not-reachable` / `spend-cap` + the attempts' facts) and answers true = taken. A
   *  job record that is gone (archived, removed) is still booked by the meta the park kept. */
  _onRetryEvent(ev, cid, entry, extra = {}) {
    if (!entry || entry.producer !== 'jobs' || !entry.meta || !entry.meta.jobId) return false;
    const meta = entry.meta;
    const job = this.jobs.get(meta.jobId) || null;
    const subscriber = !!meta.subscriber;
    const retries = Math.max(0, (Number(extra.attempts) || entry.attempts.length || 1) - 1);
    if (ev === 'attempt') {
      if (!job) return false;
      const line = [...(job.notifyLog || [])].reverse().find((l) => l && l.parked && l.id === entry.id);
      const last = entry.attempts[entry.attempts.length - 1];
      if (line) { line.retries = retries; line.nextAt = extra.nextAt || null; if (last) { line.reason = last.reason; line.phase = last.phase || null; line.busy = last.busy === true || last.busy === false ? last.busy : null; if (last.late) line.late = last.late; } this._dirty = true; }
      return false;
    }
    if (ev === 'delivered') {
      const via = extra.via || 'message';
      const lane = extra.lane || (via === 'prompt' ? 'stash' : 'message');
      if (job) {
        if (!subscriber && via === 'message') job.lastNotify = { ts: now(), lane, ok: true, to: extra.peerName || null, retries };
        this._notifyLogPush(job, { lane, ok: true, to: extra.peerName || null, retries, deliveredAt: extra.deliveredAt || now(), parkedFor: Number(extra.parkedFor) || 0, via, ...(subscriber ? { sub: true } : {}) });
        if (via === 'prompt' && Number(entry.firstAt) >= M.terminalAt(job)) this.markAck(job, 'notified', now(), { quiet: true });   // rode the next prompt: read like a drained stash entry
      }
      if (via === 'message') this._stampNotifyFloor(cid, withoutNoticeHead(entry.text));   // R5: the floor counts the delivery that LANDED — the raw text's digest (the ladder's head stripped)
      this._dirty = true;
      try { this.d.broadcast('jobs-updated', { id: meta.jobId }); } catch { }
      return false;
    }
    if (ev === 'fell') {
      // verify r4 (T1 S4/S22, reproduced): `expired` was the one detail this listener dropped — the digest's tail
      // ("The hour of retries passed…", job-model NOTIF_TAIL_DETAIL) could never fire for a jobs notification, and the
      // parked Delivery-log line stayed one retry short of the attempts the stash line named (the last attempt's
      // failure IS the fall: no `attempt` event follows it) — the line is closed here with the attempts as counted
      const held = { kind: extra.kind || 'not-reachable', ...(extra.why ? { why: String(extra.why) } : {}), ...(extra.maybeDelivered === true ? { maybeDelivered: true } : {}), ...(extra.evicted === true ? { evicted: true } : {}), ...(extra.expired === true ? { expired: true } : {}), ...(extra.identity ? { identity: String(extra.identity) } : {}), ...(Number.isFinite(Number(extra.cap)) && extra.cap != null ? { cap: Number(extra.cap) } : {}), ...(Number(extra.retryAfter) > 0 ? { retryAfter: Number(extra.retryAfter) } : {}), attempts: Number(extra.attempts) || entry.attempts.length, ...(extra.phase ? { phase: String(extra.phase) } : {}), ...(extra.busy === true || extra.busy === false ? { busy: extra.busy } : {}) };
      if (job) { const line = [...(job.notifyLog || [])].reverse().find((l) => l && l.parked && l.id === entry.id); if (line) { line.retries = retries; line.nextAt = null; } }
      const target = job || { id: meta.jobId, name: meta.jobName || meta.jobId };   // the record is gone: the stash still names it
      this._stashNotif(cid, target, { what: (meta.ev && meta.ev.what) || meta.jobName, at: (meta.ev && meta.ev.at) || entry.firstAt }, extra.reason || held.kind, { stampLast: !subscriber && !!job, held });
      this._dirty = true;
      try { this.d.broadcast('jobs-updated', { id: meta.jobId }); } catch { }
      return true;
    }
    return false;
  }
  /** bounded per-job delivery journal (2.361.5, owner ask: "投递细节我好监控")
   *  — one entry per delivery ATTEMPT outcome, any lane. Rides the registry
   *  record; the panel renders it under the Auto-notify row. */
  _notifyLogPush(job, e) {
    job.notifyLog = [...(job.notifyLog || []), { ts: now(), ...e }].slice(-12);
    this._dirty = true;
  }
  /** STASH = held, and every held entry says WHY (5b ①): `held` is
   *  {kind: spend-cap|rate-floor|not-reachable|off, why?, identity?, cap?,
   *  retryAfter?} — the panel summary, the rail tooltip and the affected
   *  conversation's status-bar chip render it in the device's own words. */
  _stashNotif(cid, job, ev, reason, { stampLast = true, held = null } = {}) {
    const q = this.pendingNotifs.get(cid) || [];
    // a delivery that was IN FLIGHT when the owner cleared the job stashes here afterwards with the words it
    // captured before the clear (verify r3): an event born before the clear is held as the sentence
    const stale = job.clearedAt && !((ev && ev.at) > Math.max(job.clearedAt, job.reclearedAt || 0));   // …born before the LATEST clear (verify r4: a second clear of an `already` record keeps the first clearedAt)
    q.push({ jobId: job.id, jobName: stale ? CLEARED_TEXT : this.labelOf(job), text: stale ? CLEARED_TEXT : ((ev && ev.what) || job.state), ts: now(), urgency: job.state === 'failed' ? 'normal' : 'low', held: held || heldOf(null, reason) });
    const dropped = capUnclaimedNotifs(q); // per-conversation cap; a may-have-landed copy first, then the oldest UNCLAIMED (a claimed one is being handed over — verify r4)
    const n = dropped.length;
    if (n) this.d.log(`[jobs] ${cid}: ${n} oldest waiting notification(s) fell off the ${NOTIF_STASH_CAP}-entry cap (${dropped.map((e) => `${e.jobId} ${new Date(Number(e.ts) || 0).toISOString()}${e.held && e.held.maybeDelivered ? ' — a may-have-landed copy, gave way first' : ''}`).join('; ')}) — never delivered (channel-jump verify r6: an eviction is said)`);
    if (n) this._sayDropped(cid, n, dropped);
    this.pendingNotifs.set(cid, q);
    if (stampLast) job.lastNotify = { ts: now(), lane: 'stash', ok: true, reason: reason || null };
    this._notifyLogPush(job, { lane: 'stash', ok: false, reason: reason || 'not reachable', to: String(cid).slice(0, 8) });
    this.d.log(`[jobs] notify → stashed for ${cid} (${reason || 'not reachable'})`);
    try { this.d.onStash?.(cid); } catch { } // the conversation's `stash` session fact (the strip above its composer) follows
  }
  /** THE EVICTION IS SAID TO THE OWNER (B-dfb4, 2026-10-01 decision): the journal line above was the only trace — the
   *  panel shows the 30 still waiting, never the ones that fell off. One For-you notice (origin jobs, kind notice) per
   *  conversation per DROP_NOTICE_EVERY_MS through the wiring's `noticeDropped`; an eviction inside the window is
   *  journaled only (the notice already standing says it). verify r1: the window survives a RESTART — this map is in
   *  memory, so the wiring answers `{recent, at}` from the For-you store's own filing time (a restart inside the hour
   *  reopened the notice the user had dismissed); a filing the store REFUSES (its 20-open cap) consumes no window (it
   *  left the conversation unsaid for the rest of the hour) — the next eviction tries again. */
  _sayDropped(cid, n, dropped) {
    if (typeof this.d.noticeDropped !== 'function') return false;
    const at = now();
    if (at - (this._dropNoticeAt.get(cid) || 0) < DROP_NOTICE_EVERY_MS) return false;
    const jobs = [...new Set(dropped.map((e) => (e && e.jobName) || (e && e.jobId) || 'job'))].slice(0, 5);
    try {
      const r = this.d.noticeDropped({ cid, n, cap: NOTIF_STASH_CAP, jobs, every: DROP_NOTICE_EVERY_MS });
      this._dropNoticeAt.set(cid, (r && r.recent && Number(r.at)) || at);
      return !(r && r.recent);
    } catch (e) { this.d.log(`[jobs] ${cid}: the dropped-notification notice was not filed — ${e && e.message}`); return false; }
  }
  /** explicit per-conversation subscription to a VISIBLE job's notifications
   *  (2.345.0). View access is the route's responsibility; dedupe by
   *  conversation lineage; cap 10 per job. */
  subscribe(job, caller, { filter } = {}) {
    if (this.readOnly) return { error: 'registry is read-only in this process' };
    if (!caller.conversationId) return { error: 'this session has no conversation id yet — send one message first, then subscribe' };
    const vf = M.validateFilter(filter);
    if (!vf.ok) return { error: vf.error };
    job.subscribers = job.subscribers || [];
    const existing = job.subscribers.find((s) => s.conversationId === caller.conversationId);
    if (existing) { // re-subscribe = update the filter in place (agents tune their own filters)
      const changed = (existing.filter || null) !== vf.filter;
      existing.filter = vf.filter;
      this._touch(job); this._save();
      return { ok: true, already: !changed, updated: changed, filter: vf.filter, count: job.subscribers.length, ownerLane: this._ownsJob(job, caller) };
    }
    if (job.subscribers.length >= 10) return { error: 'subscriber cap (10) reached for this job' };
    job.subscribers.push({ conversationId: caller.conversationId, sessionId: caller.sessionId || null, ts: now(), filter: vf.filter });
    this._touch(job); this._save();
    return { ok: true, count: job.subscribers.length, filter: vf.filter, ownerLane: this._ownsJob(job, caller) };
  }
  /** the caller IS the owner conversation — its subscription's filter shapes the owner auto-notify too (lane job-notice-dedupe) */
  _ownsJob(job, caller) { return !!(caller && caller.conversationId && job.owner && job.owner.conversation && job.owner.conversation.id === caller.conversationId); }
  unsubscribe(job, caller) {
    if (this.readOnly) return { error: 'registry is read-only in this process' };
    const before = (job.subscribers || []).length;
    job.subscribers = (job.subscribers || []).filter((s) => s.conversationId !== caller.conversationId);
    this._touch(job); this._save();
    return { ok: true, removed: before - job.subscribers.length, count: job.subscribers.length };
  }
  /** the JOB PROCESS (or its owner) announces a noteworthy moment — the
   *  success/failure vocabulary decoupled from exit codes (2.346.0, owner
   *  point: a news-page watcher exits 0 every run; what matters is whether it
   *  FOUND something). Explicit call ⇒ event ring + owner/subscriber message,
   *  rate-floored like any other notification. */
  announce(job, text) {
    if (this.readOnly) return { error: 'registry is read-only in this process' };
    const t = String(text || '').trim().slice(0, 500);
    if (!t) return { error: 'text required: vibespace-job announce "what happened"' };
    this._touch(job, { what: `announced: ${t}`, verb: 'poll' });
    this._notifyOwner(job, { what: `announced: ${t}` });
    this._save();
    return { ok: true };
  }
  /** append the FULL drained notification history to a per-conversation file
   *  so a truncated injection can point the agent at the untruncated record.
   *  Append-only with a head-trim cap; GC'd by age in _gc. */
  spillNotifs(cid, items) {
    try {
      const dir = path.join(this.d.dataDir, 'job-notifications-read');
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, String(cid).replace(/[^\w-]/g, '_') + '.md');
      // ONE LINE per notification (verify r3): a multi-line text (an announce with newlines) is folded onto its
      // line, so a later clear — which rewrites the spill LINE BY LINE — takes all of it
      const oneLine = (t) => String(t == null ? '' : t).replace(/\s*\r?\n\s*/g, ' ⏎ ');
      const block = `\n## drained ${new Date().toISOString()}\n` + items.map((n) => `- ${new Date(n.ts).toISOString()} ${n.jobId} ${oneLine(n.jobName)}: ${oneLine(n.text)}`).join('\n') + '\n';
      let prev = '';
      try { prev = fs.readFileSync(file, 'utf-8'); } catch { }
      let out = prev + block;
      if (out.length > 262144) out = out.slice(out.length - 262144); // keep the newest 256KB
      fs.writeFileSync(file, out);
      return file;
    } catch (e) { this.d.log('[jobs] notif spill failed:', e.message); return null; }
  }
  /** honest notify preview for the CREATE response + UI: will the owner
   *  conversation hear back, over which lane, decided by which layer. */
  /** A cron CHILD runs its parent's schedule, so the parent's `--notify on|off` (or a later `vibespace-job notify <cron>`)
   *  is the child's switch unless the child has its own (B-644d verify r1: `run … --at … --notify-ok --notify off`
   *  answered "auto-notify: OFF" while every fire messaged the conversation — the child, built from the spawn-task,
   *  never carried the override and fell through to the group / global default). */
  _notifyOverrideOf(job) {
    if (job.notify === 'on' || job.notify === 'off' || !job.cronParent) return job;
    const p = this.jobs.get(job.cronParent);
    return p && (p.notify === 'on' || p.notify === 'off') ? { notify: p.notify } : job;
  }
  notifyPreview(job) {
    if (!job) return null;
    const cid = job.owner && job.owner.conversation && job.owner.conversation.id;
    if (!cid) return { enabled: false, mode: 'off', reason: 'no conversation lineage recorded for this job (user-created, or the session id was not known yet at creation)' };
    const eff = M.notifyEffective(this._notifyOverrideOf(job), this.d.groupNotifyFor ? this.d.groupNotifyFor(job) : null, this.d.notifyGlobal ? this.d.notifyGlobal() : true);
    if (!eff.on) return { enabled: false, mode: 'off', source: eff.source, reason: `auto-notify is OFF at the ${eff.source} level` };
    const reachable = this.d.peerReachable ? this.d.peerReachable(cid) : false;
    return {
      enabled: true, source: eff.source,
      mode: reachable ? 'live-message' : 'resume-inject',
      detail: reachable
        ? 'your conversation will receive a message on completion/failure/park/ask (delivery subject to its own inbound settings)'
        : 'your conversation has no live inbox right now — notifications will be stashed and injected when it next resumes',
    };
  }
  /** The notifications waiting for a conversation (the SAME objects — `drainNotifs(cid, new Set(these))` takes them). */
  peekNotifs(cid) { return cid ? (this.pendingNotifs.get(cid) || []).slice() : []; }
  /** A CLAIM on entries a hand-over is about to deliver (channel-jump verify, 2026-09-27; the ladder's stash has the
   *  same door — conversation-deliver `claimStash`): a full drain leaves a claimed entry in place; the returned
   *  release gives it back. verify r2: the claim is the entry's own `ho` stamp (the hand-over's id), written to the
   *  notifs file SYNCHRONOUSLY — a restart used to forget an in-memory claim while the entries stayed on disk. */
  claimNotifs(cid, entries, id = null) {
    const mine = (Array.isArray(entries) ? entries : []).filter((n) => n && typeof n === 'object');
    const tag = id ? String(id) : 'ho';
    for (const n of mine) n.ho = tag;
    if (mine.length) this._saveNotifs();
    let released = false;
    return () => { if (released) return; released = true; let k = 0; for (const n of mine) if (n.ho === tag) { delete n.ho; k++; } if (k) this._saveNotifs(); };
  }
  /** the notifs file alone, NOW (a claim, a drain — a delivery's bookkeeping never waits for the 2 s save tick). */
  _saveNotifs() {
    if (this.readOnly) return;
    try { timedSync('jobs-notifs.write', () => writeJsonAtomic(this.notifsFile, Object.fromEntries(this.pendingNotifs))); } catch (e) { this.d.log('[jobs] notifs save failed:', e.message); }
  }
  /** Put drained notifications BACK as themselves (a hand-over's frame came back undelivered — verify r2). */
  restoreNotifs(cid, items) {
    const mine = (Array.isArray(items) ? items : []).filter((n) => n && typeof n === 'object');
    if (!cid || !mine.length) return 0;
    const q = this.pendingNotifs.get(cid) || [];
    for (const n of mine) { delete n.ho; if (!q.includes(n)) q.push(n); }
    q.sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0));
    // no cap on a restore (verify r4): the restored are the oldest — trimming here would evict exactly what came back
    this.pendingNotifs.set(cid, q);
    this._saveNotifs();
    try { this.d.onStash?.(cid); } catch { }
    return mine.length;
  }
  /** drain + clear a conversation's stash (called by the injection routes at render time). `only` (a Set of entries
   *  `peekNotifs` returned) takes exactly those — the stash hand-over's delivered set — and keeps the rest. A full
   *  drain keeps every CLAIMED entry (`claimNotifs`: a hand-over in flight owns it). Every drain persists NOW
   *  (verify r2: a killed process re-delivered what its 2 s save tick had not yet written off). */
  drainNotifs(cid, only = null) {
    if (!cid) return [];
    let q = this.pendingNotifs.get(cid);
    if (!q || !q.length) return [];
    const byId = only instanceof Set;
    if (byId || q.some((n) => n && n.ho)) {
      const mine = byId ? (n) => only.has(n) : (n) => !(n && n.ho);
      const keep = q.filter((n) => !mine(n));
      q = q.filter(mine);
      if (!q.length) return [];
      if (keep.length) this.pendingNotifs.set(cid, keep); else this.pendingNotifs.delete(cid);
      for (const n of q) if (n && n.ho) delete n.ho;
    } else this.pendingNotifs.delete(cid);
    this._saveNotifs();
    this._dirty = true;
    // A stash DRAINED into a resume has been read (triage §13 rule 1a): the
    // conversation sees it on its next turn. A stash entry older than the
    // job's CURRENT terminal instant describes an earlier run and acks nothing.
    for (const n of q) {
      const job = n && this.jobs.get(n.jobId);
      if (job && Number(n.ts) >= M.terminalAt(job)) this.markAck(job, 'notified', now(), { quiet: true });
    }
    try { this.d.broadcast('jobs-updated', { drained: cid }); } catch { }
    try { this.d.onStash?.(cid); } catch { }
    return q;
  }
  /** ACKNOWLEDGE a terminal one-shot (triage §13): `by` ∈ notified |
   *  agent-read | user-opened. The FIRST acknowledgement wins (the instant the
   *  archive clock starts from); a record that is not a terminal one-shot is
   *  refused. Persists through the ordinary dirty/flush cycle and broadcasts
   *  like every other job change. Returns true when the record changed. */
  markAck(job, by, at = now(), { quiet = false } = {}) {
    if (!job || !M.isTerminalOneShot(job)) return false;
    if (!['notified', 'agent-read', 'user-opened'].includes(by)) return false;
    if (M.ackState(job, at).acked) return false;
    job.ack = { by, at };
    this._dirty = true;
    if (!quiet) { try { this.d.broadcast('jobs-updated', { id: job.id }); } catch { } }
    return true;
  }
  _touch(job, ev) {
    this._dirty = true;
    if (ev) this._event(job, ev.what, ev.verb);
    try { this.d.broadcast('jobs-updated', { id: job.id }); } catch { }
    const ws = this.waiters.get(job.id);
    if (ws && (M.isTerminal(job) || job.state === 'awaiting-user' || job.kind === 'service')) {
      this.waiters.delete(job.id);
      for (const w of ws) { clearTimeout(w.timer); try { w.resolve(); } catch { } }
    }
  }
  _event(job, what, verb) {
    // Viewers see events PASSIVELY at their next injection only (owner call
    // 2.348.0: acceptable because it never wakes anyone and the renderer
    // coalesces per-job announce floods — see renderJobsUpdate).
    this.events.push({ ts: now(), jobId: job.id, name: this.labelOf(job), what, verb });   // r4: the NAME belted (the update lines — another conversation reads it)
    if (this.events.length > 400) this.events.splice(0, this.events.length - 400);
  }

  // ── identity / process helpers ──────────────────────────────────────────
  _ctlDir(job, runTs) { return path.join(this.logsDir, job.id, String(runTs)); }
  _readStamp(job) {
    const run = job.runs && job.runs[job.runs.length - 1];
    if (!run) return null;
    try { return JSON.parse(fs.readFileSync(path.join(this._ctlDir(job, run.startedAt), 'pid.json'), 'utf-8')); } catch { return null; }
  }
  _verifyAlive(stamp) {
    if (!stamp || !stamp.pid) return false;
    return stamp.bootId === bootId() && PI.aliveIdentity(stamp) === true; // pid+starttime+bootId, and not a zombie
  }
  _killGroup(job, sig) { // handle-kill with act-time re-verification (B-16d9 law)
    const stamp = this._readStamp(job);
    if (!this._verifyAlive(stamp)) return false;
    return PI.signalIdentity(stamp, sig, { group: true, what: `job ${job.id}` }).ok; // the group, else its leader
  }
  // A STOP ENDS THE JOB (lane jobs-memory-bound, acceptance round 4): on the cgroup rung the job's group is its SCOPE — every
  // process it started, in its process group or not, and whether or not its wrapper still lives (the base killed nothing once
  // the wrapper was gone: a job its holder left behind kept its ports and met the next start). The scope is named by its run's
  // own bound.json (the run's start time is in the unit's name — never another run's), and killed by the KERNEL's own
  // cgroup.kill, kernel 5.14+: every process of the cgroup at once, no pid read then signalled, and no process started here — this
  // file starts exactly one, the vetted job (test-job-model's ONE DOOR).
  /** the scope a run's job lives in — {unit, dir} — or null (another rung, or no proof yet) */
  _runScope(job, run) {
    const b = run ? this._ctlJson(job, run, 'bound.json') : null;
    if (!b || b.by !== 'cgroup' || !/^[A-Za-z0-9_.@-]{1,200}\.scope$/.test(String(b.unit || ''))) return null;
    const cg = typeof b.cgroup === 'string' && /^\/[A-Za-z0-9_.@/-]+$/.test(b.cgroup) && !b.cgroup.includes('..') && b.cgroup.endsWith(`/${b.unit}`) ? b.cgroup : '';
    return { unit: b.unit, dir: cg ? path.join(this.d.cgroupRoot || '/sys/fs/cgroup', cg) : '' }; // cgroupRoot: a fast suite's fake tree only
  }
  /** SIGKILL to every process of a scope (its cgroup.kill, opened O_WRONLY — never created). Round 6: TWO OUTCOMES, TWO WORDS —
   *  'killed'; 'gone' (nothing there to kill: the scope is gone, or empty); 'nokill' (the scope still holds processes and has no
   *  cgroup.kill — a kernel before 5.14); 'refused' (another error); 'unread' (its read did not answer) — round 5 said «no
   *  cgroup.kill» for a scope that was merely gone */
  async _killScope(scope, out = {}) {
    if (!scope || !scope.dir) return 'gone';
    const err = await fs.promises.writeFile(path.join(scope.dir, 'cgroup.kill'), '1', { flag: fs.constants.O_WRONLY }).then(() => null, (e) => e || {});
    if (!err) return 'killed';
    out.code = err.code || 'an error'; // round 7: a refused kill says its errno
    const pids = await this._scopeProcs(scope);
    return pids === null ? 'unread' : !pids.length ? 'gone' : err.code === 'ENOENT' ? 'nokill' : 'refused';
  }
  /** THE STOP'S GRACE (round 5) — the wrapper's drain bound is the same number (a suite's seam shortens both: memorySample.stopMs) */
  _graceMs() { const s = Number(this.d.memorySample && this.d.memorySample.stopMs); return s > 0 ? Math.min(s, STOP_GRACE_MS) : STOP_GRACE_MS; }
  _graceWords() { return `it did not end on SIGTERM in ${this._graceMs() / 1000} s`; }
  /** when the engine's kill step comes: a second after the grace, a BACKSTOP on every rung — the wrapper kills its own scope
   *  (round 6: or its own process group, on a rung without a scope) at the grace and says so in the job's log (the card's last
   *  line); the engine's step is for a wrapper that cannot */
  _killStepMs() { return this._graceMs() + 1000; }
  /** a run still running — the job's LAST run, not ended */
  _runLive(job, run) { return !!run && !run.endedAt && !!job.runs && job.runs[job.runs.length - 1] === run; }
  /** A KILL TIMER BELONGS TO ITS RUN (round 6): the kill step of a stop / a timeout / an until-marker fires only while the run it
   *  was armed for still runs, and a new spawn disarms every timer of the previous run (_spawn) — the base's timer read the
   *  CURRENT run's stamp and killed a service started again inside the grace (cause error: a crash to its restart policy) */
  _armKillStep(job, run, scope) {
    const timers = job._killSteps || (job._killSteps = new Set());
    const t = setTimeout(() => { timers.delete(t); if (this._runLive(job, run)) this._escalate(job, scope, this._graceWords(), run); }, this._killStepMs(scope));
    t.unref?.(); timers.add(t);
    return t;
  }
  /** a promise's answer, or null once `ms` passed without it (the work itself goes on) */
  _within(p, ms) { let t; return Promise.race([p, new Promise((res) => { t = setTimeout(() => res(null), ms); })]).finally(() => clearTimeout(t)); }
  /** the pids in a scope (its cgroup.procs; [] once it is gone) — BOUNDED (round 5): null when the read did not answer within
   *  REAP_READ_MS (a busy threadpool) or the caller's budget `ms` (round 7: a reap's one deadline); one read in flight per
   *  scope — a retry waits on that read, never starts a second */
  _scopeProcs(scope, ms = this.d.reapReadMs ?? REAP_READ_MS) {
    const reads = this._procReads || (this._procReads = new Map());
    let p = reads.get(scope.dir);
    if (!p) {
      p = fs.promises.readFile(path.join(scope.dir, 'cgroup.procs'), 'utf8').then((t) => t.split('\n').filter((l) => /^\d+$/.test(l)).map(Number), () => []);
      reads.set(scope.dir, p);
      p.then(() => { if (reads.get(scope.dir) === p) reads.delete(scope.dir); });
    }
    return this._within(p, Math.max(0, ms));
  }
  /** THE KILL STEP of a stop / a timeout: the cgroup rung's scope — its wrapper, alive, writes the end once the scope is empty;
   *  a wrapper still there a step later (wedged) is killed with its group; any other rung: the group, as before. `why`
   *  (round 5) — the job did not end in its grace — rides the run's end as «stopped by force: <why> — its scope / its process
   *  group was killed» (a kill WE made, the engine's fact); a forced stop says none (the owner asked for it). `forRun` (round 6):
   *  the run the step was armed for — a step for a run that ended reaches nothing, and its words never land on the next.
   *  Round 7: called EVERY TICK while its run lives (the sweep's ladder) — the scope's kill is written ONCE (again only when a
   *  write did not land), and WEDGE_MS later its wrapper, still there, is killed with its group — said */
  _escalate(job, scope, why, forRun) {
    if (forRun && !this._runLive(job, forRun)) return false;
    const run = forRun || (job.runs && job.runs[job.runs.length - 1]);
    const said = (what) => { if (why && run && !run.endedAt) job._forced = { run: run.startedAt, words: `stopped by force: ${why} — ${what}` }; };
    if (!scope || !scope.dir) { const hit = this._killGroup(job, 'SIGKILL'); if (hit) said('its process group was killed'); return hit; }
    const k = job._scopeKilled && job._scopeKilled.unit === scope.unit ? job._scopeKilled : null;
    if (k && now() - k.at >= (this.d.wedgeMs ?? WEDGE_MS)) {
      const cur = this._runScope(job, run);
      const hit = cur && cur.unit === scope.unit ? this._killGroup(job, 'SIGKILL') : false; // never a later run's wrapper
      if (hit) said(`its scope was killed, then its wrapper (still there ${(this.d.wedgeMs ?? WEDGE_MS) / 1000} s later) with its process group`);
      return hit;
    }
    if (k && !['refused', 'unread', 'nokill'].includes(k.r)) return true; // its kill in flight or landed: the next rung waits its step
    const rec = job._scopeKilled = { unit: scope.unit, at: k ? k.at : now() };
    this._killScope(scope).then((r) => { rec.r = r; if (r === 'killed') said('its scope was killed'); });
    return true;
  }
  /** a run's SIGTERM — a stop's, a timeout's, an until-marker's — and (round 7) the STOP'S INTENT before it, beside the run's
   *  pid.json: the engine signals the wrapper's GROUP, so the wrapper may handle its child's end before its own signal handler
   *  runs — the intent tells it a stop is in flight all the same (a service's leftovers are stopped with it, not kept) */
  _termRun(job, run) {
    if (run && !run.endedAt) {
      // round 10: A STOP GOES ONCE — a wrapper already delivering a stop step itself (its stopping.json: its own stop, an agent's
      // signal to it; or the drain of what its ended job left) is signalled ALONE, the intent saying so — it delivers the rest
      // through its one table (round 9 signalled the whole group again: a process mid-cleanup heard SIGTERM twice, code 143)
      const ctl = this._ctlDir(job, run.startedAt), alone = !!this._ctlJson(job, run, 'stopping.json');
      try { writeJsonAtomic(path.join(ctl, 'stop.json'), { sig: 'SIGTERM', at: now(), ...(alone ? { alone: true } : {}) }); } catch { }
      if (alone) { const stamp = this._readStamp(job); return this._verifyAlive(stamp) && PI.signalIdentity(stamp, 'SIGTERM', { what: `job ${job.id}'s wrapper` }).ok; }
    }
    return this._killGroup(job, 'SIGTERM');
  }
  /** ITS WRAPPER IS PROVEN GONE (round 7) — a reap's precondition: the run's pid.json read and whole, and its process not there
   *  (another boot, its /proc row gone, its start time another, a zombie). An unreadable or malformed stamp or an unreadable
   *  /proc proves nothing: '' when proven, else why not ('alive', or the words of what could not be read) */
  _wrapperUnproven(stamp) {
    if (!stamp) return 'pid.json unreadable';
    if (!stamp.pid || !stamp.bootId || !Number.isFinite(Number(stamp.starttime))) return 'pid.json incomplete';
    // round 8: a start of 0 is none (the wrapper's own read of it failed) — proof only that NO process holds its pid now
    if (!(Number(stamp.starttime) > 0)) return stamp.bootId === bootId() && PI.stateOf(stamp.pid) ? 'pid.json incomplete' : '';
    if (stamp.bootId !== bootId()) return '';
    const a = PI.aliveIdentity(stamp);
    return a === false ? '' : a === true ? 'alive' : '/proc cannot read it';
  }
  /** a run whose wrapper is gone: what is still in its scope belongs to an ENDED run — killed, and said on the run. True once
   *  done (nothing there, or killed and read empty); false when it did not finish (round 5: the caller judges the run without
   *  it). Round 6 — ONE ROAD: a reap that did not finish ENQUEUES ITSELF (_reapLater) whoever started it — the boot (whose
   *  answer was dropped: a task's, a cron child's or a non-replayed service's old scope kept its processes for ever, unsaid), the
   *  sweep, a start (_clearBefore) — and every tick retries it, whatever its job's state. One reap per run in flight: a second
   *  caller awaits the first. */
  _reapScope(job, run) {
    const inflight = this._reaping || (this._reaping = new WeakMap());
    if (run && inflight.has(run)) return inflight.get(run);
    const p = this._reapOnce(job, run).then((done) => {
      if (run && done) { this._reapLater.delete(run); (this._reaped || (this._reaped = new WeakSet())).add(run); }
      else if (run && !this._reapLater.has(run)) this._reapLater.set(run, { job, tries: 0 });
      return done;
    });
    if (run) { inflight.set(run, p); p.then(() => inflight.delete(run), () => inflight.delete(run)); }
    return p;
  }
  async _reapOnce(job, run) {
    const scope = this._runScope(job, run);
    if (!scope || !scope.dir) return true;
    const st = run._reap || (run._reap = {}); // this run's reap across its attempts (runtime only): the count it read, its kill
    // round 7: ONLY A WRAPPER PROVEN GONE — an unreadable stamp is no death (a LIVE service's scope was killed blind at a boot
    // that could not read its pid.json): deferred, said once with what could not be read; a wrapper alive after all reaps nothing
    const unproven = this._wrapperUnproven(this._ctlJson(job, run, 'pid.json'));
    if (unproven === 'alive') { if (st.unprovenSaid) this._touch(job, { what: 'its wrapper is running after all (its pid.json read again) — nothing reaped' }); delete run._reap; return true; }
    if (unproven) {
      // round 8: its scope read EMPTY (or gone) — nothing of the run runs (the job IS its scope: a person's systemctl kill, or it
      // ended): nothing to reap, and no doubt left for its next start (_runDoubt)
      const pids = await this._scopeProcs(scope);
      if (pids && !pids.length) {
        run._scopeEmpty = true;
        if (st.unprovenSaid) this._touch(job, { what: `its scope is empty — nothing of its last run runs (its wrapper is still not proven gone: ${unproven})` });
        delete run._reap; return true;
      }
      st.last = { why: 'unproven' };
      if (!st.unprovenSaid) {
        st.unprovenSaid = true;
        const what = `cannot prove its wrapper is gone (${unproven}) — its scope is not reaped; if it is gone: systemctl --user kill --signal=KILL ${scope.unit}`;
        this.d.log(`[jobs] ${job.id} ${what}`); this._touch(job, { what });
      }
      return false;
    }
    // round 7: ONE DEADLINE from the attempt's start — the read, the kill and its confirmation share it (a retry pass waited
    // the read's bound, then the bound again on a kill still in flight: 4 s, not 2)
    const until = now() + (this.d.reapReadMs ?? REAP_READ_MS), left = () => until - now();
    const pids = await this._scopeProcs(scope, left());
    if (pids && pids.length) st.n = Math.max(st.n || 0, pids.length);
    if (pids && !pids.length) return st.killed ? this._reapSaid(job, run, scope, 'killed') : true; // our kill's effect, seen now
    // round 6: a read past its bound never leaves an ended run's processes running — the scope is the run's own (its unit names
    // the run's start) and what it holds is an ended run's: its cgroup.kill is written all the same (ONE write per run in flight
    // — a late answer still counts: what it killed is said by the attempt that sees the scope empty). Round 7: a write still in
    // flight from an earlier attempt is INSPECTED, never awaited again
    const fresh = !st.kill, k = st.kill || (st.kill = { out: {} });
    if (fresh) k.p = this._killScope(scope, k.out).then((r) => { k.r = r; if (r === 'killed') st.killed = true; else if (r !== 'nokill' && st.kill === k) delete st.kill; return r; });
    const r = k.r !== undefined ? k.r : fresh && left() > 0 ? await this._within(k.p, left()) : null;
    if (r === null || r === 'unread') { st.last = { why: 'unread' }; return false; }
    if (r === 'refused') { st.last = { why: 'refused', code: k.out.code || 'an error' }; return false; }
    if (r === 'gone') return true; // nothing there (it ended on its own meanwhile) — nothing killed, nothing said
    if (r === 'killed') {
      const e = await this._scopeEmpty(scope, Math.min(this.d.reapConfirmMs ?? 1000, Math.max(0, left())));
      if (typeof e === 'number') { st.last = { why: 'survived', n: e }; return false; } // still there: never «killed» unproven — retried
    }
    return this._reapSaid(job, run, scope, r);
  }
  /** a reap dropped after its tries (round 7: THREE CAUSES, THREE WORDS — the last attempt's): no read answered; its kill was
   *  refused (the errno); processes survived its kill (the count read) — or nothing more when it could not prove its wrapper
   *  gone (said at the first attempt) */
  _reapDropWords(run, scope, tries) {
    const last = (run._reap && run._reap.last) || { why: 'unread' }, n = (run._reap && run._reap.n) || 0, es = (k) => (k === 1 ? '' : 'es');
    const cmd = `not reaped: systemctl --user kill --signal=KILL ${scope ? scope.unit : '(its scope)'}`;
    if (last.why === 'unproven') return '';
    if (last.why === 'refused') return `its wrapper was gone and its scope ${n ? `still held ${n} process${es(n)}` : 'held processes'} — its kill was refused (${last.code}) in ${tries} tries — ${cmd}`;
    if (last.why === 'survived') return `its wrapper was gone and ${last.n} process${es(last.n)} survived its kill in ${tries} tries — ${cmd}`;
    return `its wrapper was gone and its scope did not answer a read in ${tries} tries — ${cmd}`;
  }
  /** the reap's words, once, on the run and its journal — what it read (or that no read answered), and what was done */
  _reapSaid(job, run, scope, r) {
    const n = run._reap && run._reap.n, bound = this.d.reapReadMs ?? REAP_READ_MS;
    const held = n ? `its wrapper was gone and its scope still held ${n} process${n === 1 ? '' : 'es'}` : `its wrapper was gone and its scope did not answer a read in ${bound / 1000} s`;
    const words = r === 'killed' ? `stopped by force: ${held} — its scope was killed` : `${held} — not killed: this kernel has no cgroup.kill — systemctl --user kill --signal=KILL ${scope.unit}`;
    delete run._reap;
    run.forced = run.forced || words;
    this.d.log(`[jobs] ${job.id} ${words}`);
    this._touch(job, { what: words });
    return true;
  }
  /** a killed scope read EMPTY within `ms` (true) — still holding processes at the end (round 7: how many — the last read's
   *  count), no read answered (null); every read inside `ms` */
  async _scopeEmpty(scope, ms) {
    const until = now() + ms;
    let seen = null;
    for (;;) {
      const p = await this._scopeProcs(scope, Math.max(1, until - now()));
      if (p) { if (!p.length) return true; seen = p.length; }
      if (now() >= until) return seen;
      await pause(Math.min(50, Math.max(1, until - now())));
    }
  }
  /** WHAT A SERVICE KEPT (round 5, the ruling of 2026-10-27: a service's processes are its own while it runs) — what its last
   *  run left running is stopped when the service stops, parks, is removed, or before its next run starts: SIGTERM, the grace,
   *  then by force; said. The scope's processes on the cgroup rung, else the ones its wrapper named by identity (pid, start,
   *  boot — a rung without a scope). Once per run; a second caller awaits the first. */
  _clearKept(job, run) {
    const l = run && run.left;
    if (!l || !l.kept || l.cleared || l.gone) return Promise.resolve();
    const inflight = this._clearing || (this._clearing = new WeakMap());
    if (inflight.has(run)) return inflight.get(run);
    const p = this._clearKeptOnce(job, run, l).finally(() => inflight.delete(run));
    inflight.set(run, p);
    return p;
  }
  async _clearKeptOnce(job, run, l) {
    const grace = this._graceMs(), scope = this._runScope(job, run), until = now() + grace;
    const recorded = (l.pids || []).map(([pid, starttime]) => ({ pid, starttime, bootId: l.boot || '' }));
    const sent = new Map(); // pid → identity: every process its SIGTERM reached (a pid is never an identity — B-1cc6: read and proven by the one module)
    const term = (ids) => { for (const id of ids) if (id && !sent.has(id.pid) && PI.aliveIdentity(id) === true) { sent.set(id.pid, id); PI.signalIdentity(id, 'SIGTERM'); } };
    let n = 0, force = false, blind = false, seen = null;
    if (scope && scope.dir) {
      // round 6: a read past its bound is no reason to skip the grace — SIGTERM BLIND to what the run recorded (the wrapper names
      // a kept scope's processes too), the read retried through the grace, what it then lists SIGTERMed as it appears
      let pids = await this._scopeProcs(scope);
      if (pids) term(pids.map((p) => PI.identityOf(p))); else { blind = true; term(recorded); }
      n = Math.max(pids ? pids.length : 0, sent.size);
      while ((pids === null || pids.length) && now() < until) {
        await pause(50);
        const p = await this._scopeProcs(scope);
        if (p) { term(p.map((x) => PI.identityOf(x))); pids = p; n = Math.max(n, sent.size); }
      }
      if (pids === null || pids.length) {
        force = true;
        await this._within(this._killScope(scope), this.d.reapReadMs ?? REAP_READ_MS);
        await this._scopeEmpty(scope, 1000);
      }
      if (!n) n = pids === null ? l.n : 0;
    } else {
      // round 6: the GROUP AT CLEAR TIME, never only the recorded list — what a kept process forked since the record, the rows
      // past the record's bound and what left the group carrying the job's mark (a fresh /proc scan of src/proc-identity.js);
      // the group only while a recorded process of it lives (its id is then still that group's — never a recycled leader's)
      const st = this._ctlJson(job, run, 'pid.json');
      const scan = () => {
        if (!st || st.bootId !== PI.bootIdOf()) return [];
        const anchored = recorded.some((id) => PI.aliveIdentity(id) === true);
        // round 8: the job's own candidates first (what the record names, and their children), the bound on the rest
        const found = PI.membersOf({ pgid: anchored ? st.pid : 0, since: Number(st.starttime) || 0, mark: `VIBESPACE_JOB_ID=${job.id}`, first: recorded.map((id) => id.pid) });
        if (found.scan) seen = { ...found.scan, cut: !!(found.scan.cut || (seen && seen.cut)) }; // round 7: what it could not read, said
        return found;
      };
      term(recorded); term(scan());
      // round 10: the first walk's answer is known NOW — a cut one stamped at once (the start that asked answers its refusal in
      // its own tick, never «ok»), a finished one lifts an older stamp; the clear's end keeps it (said with what it then knew)
      if (seen && seen.cut) l.cut = { at: now(), why: `could not check ${seen.total - seen.scanned} of ${seen.total} processes for what it left running${sent.size ? `; ${sent.size} found and stopped` : ''}` };
      else delete l.cut;
      let live = [...sent.values()];
      while (live.length && now() < until) { await pause(50); live = live.filter((id) => PI.aliveIdentity(id) === true); }
      // round 9: the second walk only after a grace something lived through — nothing signalled, nothing could fork since: the
      // first walk's answer stands (never two walks back to back on the event loop)
      const late = sent.size ? scan().filter((id) => !sent.has(id.pid)) : []; // forked during the grace: by force with the rest
      for (const id of late) sent.set(id.pid, id);
      live.push(...late.filter((id) => PI.aliveIdentity(id) === true));
      n = sent.size;
      if (live.length) { force = true; for (const id of live) PI.signalIdentity(id, 'SIGKILL'); }
    }
    // round 7: `cleared` only when something was stopped — what had already ended on its own is said so, never «stopped at».
    // Round 8: A CUT SCAN PROVES NOTHING — «none found» in part of /proc is no «none left»: neither `gone` nor `cleared`, the next
    // start held (_pending); what this walk stopped is counted on. What could not be read is said by its owner — «of other
    // users» only when there are any. Round 9: A CUT WALK IS AN ANSWER — «cannot prove», STAMPED on the record (`cut`: its time,
    // its reason) and asked no more inside that decision: the start that asked is refused at once by the doubt's door
    // (_runDoubt: said, ONE For-you notice) — round 8 walked /proc twice every 50 ms for the whole grace (38 walks at 10 s, the
    // hub's loop 91 % stalled). A later decision (a start, the person's stop, a boot) walks once more; a finished walk ends it
    run._clearSent = (run._clearSent || 0) + n; n = run._clearSent;
    if (seen && seen.cut) {
      if (!l.cut) l.cut = { at: now(), why: `could not check ${seen.total - seen.scanned} of ${seen.total} processes for what it left running${n ? `; ${n} found and stopped` : ''}` }; // the late walk's cut
      this._dirty = true;
      return;
    }
    delete l.cut;
    const others = (seen && seen.others) || 0, ours = seen ? Math.max(0, (seen.unreadable || 0) - others) : 0;
    const scanned = others || ours ? ` (its mark searched in ${seen.scanned} processes; unreadable: ${[others ? `${others} of other users` : '', ours ? `${ours} of ours, not dumpable` : ''].filter(Boolean).join(', ')})` : '';
    this._dirty = true;
    if (!n) {
      l.gone = now();
      const what = `what its last run left running had already ended — nothing stopped${scanned}`;
      this.d.log(`[jobs] ${job.id} ${what}`); this._touch(job, { what });
      return;
    }
    l.cleared = now();
    const how = !force ? '' : blind && !sent.size ? ` — by force: its scope did not answer a read in ${grace / 1000} s, so no SIGTERM could reach it` : blind ? ` — by force, ${grace / 1000} s after its SIGTERM (sent to what it recorded: its scope did not answer a read)` : ` — by force, ${grace / 1000} s after its SIGTERM`;
    const what = `stopped what its last run left running (${n} process${n === 1 ? '' : 'es'})${how}${scanned}`;
    this.d.log(`[jobs] ${job.id} ${what}`);
    this._touch(job, { what });
  }
  /** NEVER A RUN BESIDE ITS PREDECESSOR (round 5): a service's next run — the boot replay, the restart policy, the owner's start
   *  (round 6: EVERY start of a service) — starts once what its last run left is gone: what it KEPT (stopped) and a scope its
   *  wrapper did not see empty (reaped) — awaited, bounded by the grace (past it the run starts anyway, said). With nothing
   *  pending (_pending: nothing kept, its scope measured empty in exit.json or already reaped) it starts at once, in the
   *  caller's own tick; with something pending it starts after at least one bounded read (async — on the cgroup rung a dead
   *  wrapper's scope is always read first) */
  _startAfter(job, trigger, should) {
    if (job._starting) return job._starting;
    const run = job.runs && job.runs[job.runs.length - 1];
    const go = () => { if (should() && this.jobs.get(job.id) === job && !this._besideLive(job, trigger) && !this._doubtBlocks(job, run, trigger)) this._spawn(job, trigger); };
    if (!this._pending(job, run)) { go(); return Promise.resolve(); }
    const p = job._starting = this._clearBefore(job, run, trigger).then((clear) => { delete job._starting; if (!clear) return; try { go(); } catch (e) { this.d.log(`[jobs] ${trigger} start of ${job.id} refused:`, e.message); } });
    return p;
  }
  /** round 7: its last run's wrapper STILL RUNS (a boot that could not read its pid.json judged that run ended) — never a run
   *  beside it: said once, nothing started (`stop` reaches it by its stamp) */
  _besideLive(job, trigger) {
    const stamp = this._readStamp(job);
    if (!this._verifyAlive(stamp)) return false;
    const what = `its last run's wrapper still runs (pid ${stamp.pid}) — not started beside it (${trigger}); stop it, then start it again`;
    if (job._besideSaid !== stamp.pid) { job._besideSaid = stamp.pid; this.d.log(`[jobs] ${job.id} ${what}`); this._touch(job, { what }); }
    return true;
  }
  /** round 8: UNKNOWN — the run's wrapper proven neither gone nor alive (its pid.json unreadable or incomplete, /proc cannot read
   *  it): '' or why. A run that wrote its end (exit.json), whose scope was read empty (nothing of it runs — the job IS its
   *  scope), or whose doubt a person's stop ended (`doubtOver`) is no doubt; a wrapper proven ALIVE is _besideLive's */
  _runDoubt(job, run) {
    if (!run || !run.endedAt || run.doubtOver) return '';
    const cut = this._cutOf(run); // round 9: what it KEPT, searched in only part of /proc — the stamped answer of the last walk
    if (cut) return cut;
    if (run._scopeEmpty) return '';
    if (this._readExit(job, run)) return '';
    const why = this._wrapperUnproven(this._ctlJson(job, run, 'pid.json'));
    return why === 'alive' ? '' : why;
  }
  /** round 8: UNKNOWN BLOCKS A SPAWN — the boot's replay, the restart policy, a person's start: never a run beside a run that
   *  may still run (r7's _besideLive read the same unreadable stamp and answered «not live»: two wrappers, two scopes). Said
   *  once per run, and ONE For-you notice per run (kept on the run: a later boot files none). A doubt ends only by a look that
   *  CAN read the stamp (a boot, a start), the run's scope read empty (the person's systemctl kill), or the person's stop */
  /** round 10: the stamped cut of what a run kept ('' when none, or a person's stop ended it) — ONE reader for the door and start */
  _cutOf(run) {
    const l = run && run.left;
    return l && l.kept && l.cut && !l.cleared && !l.gone && !run.doubtOver ? String(l.cut.why || 'a search of /proc was cut short') : '';
  }
  /** round 10: the doubt's door in words — the journal line, the For-you notice and a refused start's answer say the same */
  _ifGone(job, run) {
    const scope = this._runScope(job, run);
    return scope ? `systemctl --user kill --signal=KILL ${scope.unit} (or vibespace-job stop ${job.id})` : `vibespace-job stop ${job.id}`;
  }
  _doorWords(job, run, why) { return `cannot prove the previous run is gone (${why}) — not restarted; if it is gone: ${this._ifGone(job, run)}, then start it again; if it runs: it keeps running`; }
  _doubtBlocks(job, run, trigger) {
    const why = this._runDoubt(job, run);
    if (!why) return false;
    const ifGone = this._ifGone(job, run), what = this._doorWords(job, run, why);
    if (run._doubtSaid !== why) { run._doubtSaid = why; this.d.log(`[jobs] ${job.id} ${what} (${trigger})`); this._touch(job, { what }); }
    if (!run.doubtNoticed) {
      run.doubtNoticed = now(); this._dirty = true;
      this._forYou(job, M.forYouCopy(job, 'doubt', { why, ifGone }));
    }
    return true;
  }
  /** round 8: A PERSON'S STOP ENDS A DOUBT — what of the previous run can be named is stopped: its scope (killed), the processes
   *  carrying the job's mark (its wrapper among them: it then drains its own group) — SIGTERM, the grace, then by force; the
   *  doubt is over only when the mark's scan finished (a cut one proves nothing), and said */
  async _stopDoubt(job, run) {
    const l = run.left;
    if (l && l.kept && l.cut && !l.cleared && !l.gone) { // round 9: what it kept — the stop's own clear walked /proc once just now
      run.doubtOver = { by: 'stop', at: now() }; this._dirty = true;
      const what = `stopped by its owner — what its last run left was not proven gone (${l.cut.why}); it may start again`;
      this.d.log(`[jobs] ${job.id} ${what}`); this._touch(job, { what });
      return;
    }
    const scope = this._runScope(job, run);
    const killed = scope && scope.dir ? await this._within(this._killScope(scope), this.d.reapReadMs ?? REAP_READ_MS) : null;
    const found = PI.membersOf({ mark: `VIBESPACE_JOB_ID=${job.id}` }), scan = found.scan || {};
    for (const id of found) PI.signalIdentity(id, 'SIGTERM');
    const until = now() + this._graceMs();
    let live = [...found];
    while (live.length && now() < until) { await pause(50); live = live.filter((id) => PI.aliveIdentity(id) === true); }
    for (const id of live) PI.signalIdentity(id, 'SIGKILL');
    const n = found.length, es = (k) => (k === 1 ? '' : 'es');
    const did = `${killed === 'killed' ? 'its scope killed, ' : ''}${n} process${es(n)} carrying its mark stopped${live.length ? ` (${live.length} by force)` : ''}`;
    // round 9 (the ruling of choice 5): the person's word ends it — a cut scan is said, never a doubt with no way out (the
    // notice tells them «stop it, then start it again»)
    run.doubtOver = { by: 'stop', at: now() }; this._dirty = true;
    const what = `stopped by its owner — the previous run was not proven gone: ${did}${scan.cut ? `; could not check ${scan.total - scan.scanned} of ${scan.total} processes` : ''}; it may start again`;
    this.d.log(`[jobs] ${job.id} ${what}`); this._touch(job, { what });
  }
  /** what a service's next start waits for (round 6): processes its last run KEPT and not yet stopped; a reap of its scope in
   *  flight or deferred; a scope its wrapper did not measure empty (no exit.json `scopeEmpty` — a wrapper that died); round 8:
   *  a run that may still run (_runDoubt) */
  _pending(job, run) {
    if (!run || !run.endedAt) return false;
    if (this._runDoubt(job, run)) return true;
    if (run.left && run.left.kept && !run.left.cleared && !run.left.gone) return true;
    if (!this._runScope(job, run)) return false; // no scope: nothing of it to reap (a pod's rung starts at once)
    if (this._reapLater.has(run) || (this._reaping && this._reaping.has(run))) return true;
    if (this._reaped && this._reaped.has(run)) return false;
    const exit = this._readExit(job, run);
    return !(exit && exit.scopeEmpty === true);
  }
  /** true: the start may go; false: it may not (round 8 — a run that may still run, what it kept not proven ended), said */
  async _clearBefore(job, run, trigger) {
    // round 9: ONE /proc WALK PER DECISION — what it kept is cleared ONCE, before the wait (round 8 cleared inside it: a cut walk
    // re-ran every 50 ms for the whole grace); the wait re-reads only kept facts — the reap, the doubt, the record's stamps. ONE
    // clock: the grace runs from the start asked, the clear's inside it
    const until = now() + this._graceMs();
    await this._clearKept(job, run).catch(() => { });
    for (;;) {
      const l = run.left, kept = !!(l && l.kept && !l.cleared && !l.gone && !(l.cut && run.doubtOver)); // a cut the person's stop ended: not held
      if (kept && l.cut) { this._doubtBlocks(job, run, trigger); return false; } // a cut walk's answer — refused at once, by the doubt's door
      const reaped = await this._reapScope(job, run); // round 6: a reap that does not finish here stays enqueued — a later tick reaps it
      if (!kept && reaped && !this._runDoubt(job, run)) return true;
      if (now() >= until) {
        if (this._doubtBlocks(job, run, trigger)) return false; // round 8: never «did not answer» for a scope that answered
        if (kept) return false;
        const last = (run._reap && run._reap.last) || { why: 'unread' }; // round 8: the cause the last attempt met, worded
        const why = last.why === 'refused' ? `its scope's kill was refused (${last.code})` : last.why === 'survived' ? `${last.n} process${last.n === 1 ? '' : 'es'} survived its scope's kill` : `its last run's scope did not answer a read`;
        const what = `${why} in ${this._graceMs() / 1000} s — its next run starts anyway (the reap is retried)`;
        this.d.log(`[jobs] ${job.id} ${what}`); this._touch(job, { what });
        return true;
      }
      await pause(Math.min(50, Math.max(1, until - now()))); // never past its grace
    }
  }

  // ── spawn ───────────────────────────────────────────────────────────────
  // B-f8c7 (lane job-vendor-ban): THE ONE VET judges every RUN, not only the create — this is the one place a job's command
  // starts (a keep-up restart, a boot replay, a `start`, a cron fire's child built from action.task, a record persisted
  // before the census widened). A refused run never starts; the record — and a cron child's parent, else the timer re-fires
  // every tick — parks (failed, desiredUp off) and says why.
  _refuseRun(job, vet, trigger) {
    const parent = job.cronParent ? this.jobs.get(job.cronParent) : null;
    for (const j of parent ? [job, parent] : [job]) {
      j.state = 'failed'; j.desiredUp = false;
      if (j.kind === 'cron') j.nextFireAt = null;
      if (j.kind === 'service') this._teardownPublish(j);
      this._touch(j, { what: `refused to run (${trigger}): ${vet.error}` });
    }
    this.d.log(`[jobs] ${job.id} refused to run (${trigger}) — vendor/credential pattern`);
    this._save();
  }
  _spawn(job, trigger) {
    const vet = M.vetSpec(job);
    if (!vet.ok) { this._refuseRun(job, vet, trigger); throw new Error(vet.error); }
    const runTs = now();
    const ctl = this._ctlDir(job, runTs);
    fs.mkdirSync(ctl, { recursive: true, mode: 0o700 });
    fs.chmodSync(ctl, 0o700); // the run's dir holds its spec file and its log — the owner's alone (mkdir's mode is umask-masked)
    job.state = 'starting';
    delete job.ack; // a NEW run is a new claim on the user's attention (triage §13)
    delete job._stopRequested; delete job._termAt; delete job._stopForce; delete job._forced; // round 5: a stop said to an ENDED run never stops the next
    for (const t of job._killSteps || []) clearTimeout(t); // round 6: …nor does its kill timer — a new run disarms every timer of the last
    delete job._killSteps;
    job.runs = job.runs || [];
    // THE MEMORY BOUND (lane jobs-memory-bound): THE LADDER's answer for THIS run (src/job-model.js memoryMbOf) rides the spec;
    // the wrapper measures the rung that enforces it and says so (bound.json while it runs, exit.json `memory` at its end)
    const mem = M.memoryMbOf(job, this._memoryCtx()); // the record's, until the wrapper says the bound it proved (_adoptBound)
    const hub = M.memoryMbOf(job, this._memoryCtx({ hub: true })); // the spec's: the rlimit / none rungs live inside the hub's own cgroup
    job.runs.push({ startedAt: runTs, trigger, log: path.join(ctl, 'current.log'), memoryMb: mem.mb, memoryAskedMb: mem.askedMb !== undefined ? mem.askedMb : mem.mb, ...(mem.cap ? { memoryCap: mem.cap } : {}) }); // round 3: both numbers (asked, effective), and the instance's cap when it lowered the bound
    if (job.runs.length > 20) job.runs.splice(0, job.runs.length - 20);
    this._save(); // intent-before-spawn, flushed
    // accept-fixes-jobs F6: the job's OWN directory (its cmd.cwd — never the server's cwd fallback) is exported as
    // VIBESPACE_JOB_CWD: vibespace-browser's write fence lets a job save a screenshot / download there
    const spec = {
      argv: job.cmd.argv, cwd: job.cmd.cwd || process.cwd(),
      env: jobEnv({ ...(job.cmd.env || {}), ...this._secretsFor(job), VIBESPACE_API: this.d.apiBase || `http://127.0.0.1:${process.env.PORT || 3456}`, VIBESPACE_JOB_ID: job.id, VIBESPACE_JOB_TOKEN: this._jobToken(job), ...(typeof job.cmd.cwd === 'string' && job.cmd.cwd[0] === '/' ? { VIBESPACE_JOB_CWD: job.cmd.cwd } : {}), PATH: path.join(this.d.dataDir, 'bin') + ':' + (process.env.PATH || '') }),
      logCapBytes: 50 * 1024 * 1024, stdinOpen: !!job.stdinOpen,
      kind: job.kind === 'service' ? 'service' : 'task', // round 5 (the ruling): a service keeps what its run leaves running, a task's are stopped
      // round 4: the ASKED bound rides too — the cgroup rung caps it by what contains ITS scope, read once the scope exists
      memory: { mb: hub.mb, askedMb: hub.askedMb !== undefined ? hub.askedMb : hub.mb, cap: hub.cap || null, capRule: { minMb: M.MEMORY.minMb, hubShareMinMb: M.MEMORY.hubShareMinMb, hubShareRatio: M.MEMORY.hubShareRatio }, unit: `${this.d.memoryUnitPrefix || 'vibespace-job'}-${job.id}-${runTs}`, rungs: this.d.memoryRungs || M.MEMORY_RUNGS, ...(this.d.memorySample ? this.d.memorySample : {}) },
    };
    // A SECRET NEVER RIDES ARGV (lane job-spec-off-argv, 2026-10-20): the spec carries the job's secrets and its jbt_
    // token, and /proc/<pid>/cmdline is readable by every local user for the wrapper's whole life — so the spec rides a
    // file: 0600, O_EXCL (never written through a name already there), a fresh name per start; the wrapper reads it
    // ONCE and unlinks it. Nothing re-reads it: a job back after a restart is adopted by its stamp or re-spawned HERE.
    const specPath = path.join(ctl, `spec.${runTs}.json`);
    const fd = fs.openSync(specPath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o600); // EEXIST ⇒ no start (that name is not ours to remove)
    const wrapper = path.join(this.d.dataDir, 'bin', 'job-wrapper.js');
    let child;
    try {
      try { fs.writeFileSync(fd, JSON.stringify(spec)); } finally { fs.closeSync(fd); }
      child = spawn(process.execPath, [wrapper, ctl, specPath, '--proto=' + WRAPPER_PROTO], { detached: true, stdio: 'ignore', env: wrapperEnv(job.id) });
    } catch (e) { try { fs.unlinkSync(specPath); } catch { } throw e; } // a failed write or spawn leaves no spec behind
    child.unref();
    job.state = 'up';
    job.proc = { pid: child.pid };
    this._touch(job);
    if (job.kind === 'service' && job.publish && (job.ports || []).length) this._ensurePublish(job);
  }
  /** service⇄ports sync (2.343.0): a published service gets a forward + (when
   *  the frp plugin is configured) a public URL; teardown on stop/park. All
   *  best-effort — publish failure never breaks the service itself. */
  // THE JOURNAL NAMES A JOB BY ITS ID (lane-redact verify r8, reproduced in chrome): every console line rides the server's
  // in-memory ring (src/server/incident-wiring.js) into each incident captured later — an automatic freeze capture too —
  // so `publish unavailable for <name>` put a job's name in data/incidents/<id>/bundle.json after the job was cleared
  // lane job-publish-stable (the 2026-10-04 incident): the protocol probe never races the service start — the publish
  // waits (bounded, backoff) until the port answers; a port still silent publishes with the forward's LAST protocol and is
  // re-checked; a URL that changes or breaks is SAID to the owner conversation (one notice, the job notification path)
  async _ensurePublish(job) {
    const gen = job._pubGen = (job._pubGen || 0) + 1; // a later publish or a teardown supersedes this one
    try {
      const pf = this.d.getPorts && this.d.getPorts();
      if (!pf) return;
      const rec = await pf.forward('__local__', job.ports[0], { label: 'service: ' + this.labelOf(job) });   // r4: the Ports label is a person's — the NAME belted
      job._pfId = rec && rec.id;
      job._publish = { state: 'publishing' }; this._touch(job);
      const waitMs = this.d.publishWaitMs ?? 60_000;
      const up = await this._portAnswers(job, job.ports[0], waitMs, gen);
      if (gen !== job._pubGen) return;
      if (!up) this.d.log(`[jobs] ${job.id} port ${job.ports[0]} silent after ${Math.round(waitMs / 1000)} s — publishing with the forward's last protocol, re-checking`);
      try {
        const r = await pf.publish(job._pfId);
        if (gen !== job._pubGen) return;
        job._publish = null;
        this._publishOutcome(job, { ok: true, url: r && r.publicUrl || null });
        if (!up || (r && (r.pending || r.proto === 'tcp'))) this._publishRecheck(job, gen, 30);
      } catch (e) {
        if (gen !== job._pubGen) return;
        job._publish = null;
        const o = this._publishOutcome(job, { ok: false, error: e });
        this.d.log(`[jobs] publish unavailable for ${job.id} — ${(e && e.message) || e} (${o.cause}, attempt ${o.attempts}${o.notice ? ', said to the owner' : ', not said again'})`);
      }
      this._touch(job);
    } catch (e) { this.d.log('[jobs] forward failed for', job.id, '—', e.message); }
  }
  /** THE ONE PLACE A PUBLISH OUTCOME LANDS (lane job-notice-dedupe): the job's own attempt and the relay's success the Ports
   *  manager adopted (relayPublished). The down record (`publishDown`, persisted — the repeat came at every restart) follows
   *  src/job-notice.js's verdict; the owner conversation hears a STATE CHANGE only (a cause once, its recovery once). */
  _publishOutcome(job, next) {
    const v = JN.noticeVerdict({ prev: job.publishDown || null, next, url: job.lastPublicUrl || null, at: now() });
    if (v.record) job.publishDown = v.record; else delete job.publishDown;
    if (next.ok) this._adoptJobUrl(job, next.url || null, { quiet: !!v.notice }); // a recovery to a NEW address says both in one notice
    else job.publishedUrl = null;
    if (v.notice) this._notifyOwner(job, { what: v.notice.what });
    return { cause: v.record ? v.record.cause : null, attempts: v.record ? v.record.attempts : 0, notice: v.notice };
  }
  _isJobForward(job, rec) {
    if (!rec) return false;
    if (job._pfId) return job._pfId === rec.id;
    return rec.hostId === '__local__' && !rec.targetHost && Number(rec.remotePort) === Number((job.ports || [])[0]);
  }
  /** THE RELAY'S FACT (lane job-notice-dedupe, fb-666f37fd38 — the URL answered 200 while `poll` still said «NOT published —
   *  the vault is locked»): the Ports manager adopted a public URL for a forward (its heal sweep, a restore, a machine link,
   *  the Ports panel, the job's own publish) — the service on it follows in the same tick, never a stale snapshot. */
  relayPublished(rec, url) {
    if (!url) return 0;
    let n = 0;
    for (const job of this.jobs.values()) {
      if (job.kind !== 'service' || !job.publish || !['up', 'starting'].includes(job.state) || !this._isJobForward(job, rec)) continue;
      if (!job.publishDown && job.publishedUrl === url) continue;
      job._publish = null;
      this._publishOutcome(job, { ok: true, url });
      this._touch(job); n++;
    }
    return n;
  }
  /** The relay can publish again (the vault unlocked): every published service still DOWN re-publishes NOW — not at the next
   *  restart, not after the Ports manager's 5-minute heal backoff. → how many. */
  relayChanged(why) {
    let n = 0;
    for (const job of this.jobs.values()) {
      if (job.kind !== 'service' || !job.publish || !job.publishDown || job.state !== 'up' || !(job.ports || []).length) continue;
      this._ensurePublish(job); n++;
    }
    if (n) this.d.log(`[jobs] ${why}: ${n} published service(s) still down re-publish now`);
    return n;
  }
  /** true once a loopback TCP connect to the job's port succeeds; false after budgetMs (or when superseded/stopped). */
  async _portAnswers(job, port, budgetMs, gen) {
    const net = require('net');
    const t0 = Date.now();
    for (let delay = 250; ; delay = Math.min(delay * 2, 4000)) {
      const ok = await new Promise((res) => {
        const s = net.connect({ host: '127.0.0.1', port: Number(port) });
        const fin = (v) => { try { s.destroy(); } catch { } res(v); };
        s.once('connect', () => fin(true)); s.once('error', () => fin(false)); s.setTimeout(1500, () => fin(false));
      });
      if (ok) return true;
      if (gen !== job._pubGen || job.state !== 'up' || Date.now() - t0 + delay > budgetMs) return false;
      await new Promise((r) => { const t = setTimeout(r, delay); t.unref?.(); });
    }
  }
  /** After a publish the probe could not settle (silent port) or settled as TCP: re-probe every 10 s (≤ tries) — once the
   *  port answers, a wrong mode is repaired under the SAME name (port-forward reprobe). */
  _publishRecheck(job, gen, tries) {
    const t = setTimeout(async () => {
      if (gen !== job._pubGen || job.state !== 'up' || !job._pfId) return;
      const pf = this.d.getPorts && this.d.getPorts();
      let r = null;
      try { r = pf && pf.reprobe ? await pf.reprobe(job._pfId) : null; } catch (e) { this.d.log('[jobs] re-probe failed for', job.id, '—', e.message); }
      if (gen !== job._pubGen) return;
      if (r && r.publicUrl && r.publicUrl !== job.publishedUrl) { this._adoptJobUrl(job, r.publicUrl); this._touch(job); }
      if (r && r.pending && tries > 1) this._publishRecheck(job, gen, tries - 1);
    }, this.d.publishRecheckMs ?? 10_000);
    t.unref?.();
  }
  /** The job's live URL + its last one (`lastPublicUrl` survives a stop); a URL different from the last one is said. */
  _adoptJobUrl(job, url, { quiet = false } = {}) {
    const before = job.lastPublicUrl || null;
    job.publishedUrl = url;
    if (!url) return;
    job.lastPublicUrl = url;
    if (before && before !== url && !quiet) {
      this.d.log(`[jobs] ${job.id} public URL changed`);
      this._notifyOwner(job, { what: `public URL CHANGED: ${before} → ${url} (the old link no longer works — share the new one)` });
    }
  }
  /** forget = the public name goes too (never on a stop / park: the next start publishes the same name). */
  async _teardownPublish(job, { forget = false } = {}) {
    try {
      const pf = this.d.getPorts && this.d.getPorts();
      job._pubGen = (job._pubGen || 0) + 1; job._publish = null;
      delete job.publishDown; // the down episode ends with a deliberate stop / park / refusal (never at a restart: that is when it repeated)
      if (!pf || !job._pfId) return;
      try { await pf.unpublish(job._pfId, { keepName: !forget }); } catch { }
      try { await pf.unforward(job._pfId, { keepName: !forget }); } catch { }
      job._pfId = null; job.publishedUrl = null;
      this._touch(job);
    } catch { }
  }
  /** ONE agent-written FIELD (a job's NAME, a notify cron's --text, the context) bound for a person or another agent through
   *  THE ONE BELT (src/agent-output-belt.js) — a field on its own, never a sentence it sits in (lane job-notify-user r3);
   *  required lazily; never throws */
  _agentWords(s) {
    try { return require('./agent-output-belt.js').maskForSink(String(s == null ? '' : s), { dataDir: this.d.dataDir }); } catch { return String(s == null ? '' : s); }
  }
  /** THE ONE ACCESSOR of a job's PERSON-FACING NAME (lane job-notify-user r5, accept-r4 confirmed 0 + refuted 0): the name
   *  belted on its own — every message-road copy (r3: the header, the chat card's label, the stash, the retry meta), and
   *  (r4) wherever a PERSON or ANOTHER conversation reads it: the snapshot a non-author reads (the Jobs panel's card title,
   *  the ask window's title and so the taskbar, another lineage's view), the events ring (the update lines), the injected digest's rows (digestFor, r6), the Ports
   *  label — and (r5) EVERY holder of a record outside this engine asks HERE (M.labelVia(jm): the Ports scan row, the
   *  Artifacts service row and its chat card, the browser's job label and its strip row, the vault's asker, feedback's
   *  session, the memory-pressure roots, the live view's tab); r4 belted the forward label and left its scan row one line
   *  away raw. The RECORD keeps the name resolveName BELTED (r7: the belt on the whole name as asked, then the slug and the
   *  cut — r6 cut first and a token the cut split was no shape; data/jobs.json, the archive, the author's echo); a record an
   *  older engine wrote keeps what it stored, whole to its author.
   *  test-architecture §93 THE NAME CENSUS names any reader of a record's name that skips this accessor.
   *  Memoised 30 s per name (the belt reads the vault; a list snapshot asks for every name). */
  labelOf(job) {
    const raw = String((job && (job.name || job.id)) || '');
    const memo = this._labelMemo || (this._labelMemo = new Map());   // (a manager built without the constructor — a suite's mutant — still names)
    const hit = memo.get(raw), t = now();
    if (hit && t - hit.at < 30e3) return hit.out;
    const out = this._agentWords(raw);
    if (memo.size >= 500) memo.clear();
    memo.set(raw, { out, at: t });
    return out;
  }
  /** THE ONE FOR-YOU COPY (lane job-notify-user r3): every copy this engine files for the user — a task's end, an ask, a
   *  park, a missed time, a notify fire — goes through here. The sentence is the product's template and the job's NAME
   *  and the agent's --text are its FIELDS (M.forYouCopy: the store belts each on its own, never the sentence); `fact` is
   *  which copy it is (the store resolves and re-files by it, never by the words). The store's verdict is journaled for
   *  EVERY copy — r2 journaled the notify fire only, and a refused end copy / ask / park / missed copy was dropped with no
   *  line and no poll line: `user-inbox ✗ — why`, never a ✓ for a copy that did not land; a dep that answers nothing is
   *  taken at its word. `copy` names which one (poll / show say it). */
  _forYou(job, c) {
    // r4: EVERY engine filing comes through here — a job's copies and the engine's own notices (`job` null: no journal, the
    // log says a refusal); a copy forYouCopy does not know is refused BY NAME (claim r3-2 minor 7: a TypeError into _finalizeRun)
    // r5: the ONE line that reaches the dep. r6: a copy is the engine's words + its fact, nothing else — a SHAPED copy (a
    // hand-built one handed through M.forYouCopy) is refused by name and said in the log with its caller, like a stray
    // r7 (accept-r6 unverified 2): a copy forYouCopy MINTED for THIS job (M.mintedFor) — a hand-built {words, fact}, however it
    // was handed in (`.call`, an alias), or a copy minted for another job is refused by name and said in the log with its caller
    if (!c || !c.words || !c.fact) {
      if (c && c.refused && (c.copy === 'stray' || c.copy === 'shaped')) this.d.log(`[jobs] a For-you filing outside the one door (src/jobs.js _forYou) — caller ${callerOf(JobManager.prototype._forYou)}${job ? ' — job ' + job.id : ''}: ${c.refused}`);
      return this._forYouVerdict(job, { ok: false, why: (c && c.refused) || 'no such For-you copy' }, (c && c.copy) || 'unknown');
    }
    if (M.mintedFor(c) !== (job || null)) {
      const why = M.mintedFor(c) === undefined ? 'a For-you copy is one forYouCopy minted — a hand-built copy is refused' : 'a For-you copy minted for another job is refused';
      this.d.log(`[jobs] a For-you filing outside the one door (src/jobs.js _forYou) — caller ${callerOf(JobManager.prototype._forYou)}${job ? ' — job ' + job.id : ''}: ${why}`);
      return this._forYouVerdict(job, { ok: false, why }, 'hand-built');
    }
    const words = { ...c.words, ...(c.words.params ? { params: { ...c.words.params } } : {}) };   // the store's own (the minted copy stays frozen)
    const forYouDep = FOR_YOU_DEPS.get(this) || null;
    let v;
    try { v = forYouDep ? forYouDep({ words, fact: c.fact, urgency: c.urgency, ...(job ? { jobId: job.id, jobName: job.name, ownerCid: job.owner?.conversation?.id || null } : {}) }) : { ok: false, why: 'no For-you store is wired' }; } catch (e) { v = { ok: false, why: e.message }; }
    return this._forYouVerdict(job, v, c.fact.split(':')[0]);
  }
  /** THE STRAY DOOR (r4): `this.d.notifyUser(...)` called from anywhere but _forYou — said in the server log WITH ITS CALLER
   *  and journaled on the job it names (copy `stray`). r5: it files THROUGH _forYou. r6 (accept-r5 confirmed 1): it files the
   *  stray copy — the engine's OWN words + the fact `stray` — never the stray's shape (r5 carried any shape through the one
   *  door, so `M.forYouCopy(job, 'stray', { shape })` laundered a hand-built copy as a real one). */
  _forYouStray(a, caller = 'a caller the engine cannot name') {
    const job = a && a.jobId ? this.jobs.get(a.jobId) || null : null;
    this.d.log(`[jobs] a For-you filing outside the one door (src/jobs.js _forYou) — caller ${caller}${job ? ' — job ' + job.id : ''}: filed as the stray copy, its own words are not filed`);
    return this._forYou(job, M.forYouCopy(job, 'stray'));
  }
  /** a For-you copy's VERDICT: journaled on its job (`user-inbox ✓|✗ — why`, `copy` names which; a dep that answers nothing
   *  is taken at its word), and kept on the record as the LAST verdict per copy (`forYouLast` — r4, claim r3-1 (c): the
   *  12-line journal and the snapshot's 8 dropped a refusal after later lines while the ask stayed unfiled); a scheduled
   *  run's verdict is its CRON's too (r4, unverified 2: poll / show of the id the agent holds said nothing). */
  _forYouVerdict(job, v, copy) {
    const refused = !!(v && typeof v === 'object' && v.ok === false);
    const why = refused ? String(v.why || 'the For you store refused it').slice(0, 200) : null;
    if (!job) { if (refused) this.d.log(`[jobs] the For-you ${copy} notice was NOT filed — ${why}`); return v; }
    if (refused) this._notifyLogPush(job, { lane: 'user-inbox', ok: false, reason: why, copy });
    else this._notifyLogPush(job, { lane: 'user-inbox', ok: true, copy });
    const last = { ok: !refused, ...(refused ? { reason: why } : {}), ts: now() };
    job.forYouLast = { ...(job.forYouLast || {}), [copy]: last };
    const cron = job.cronParent ? this.jobs.get(job.cronParent) : null;
    if (cron) cron.forYouLast = { ...(cron.forYouLast || {}), [copy]: { ...last, run: job.id } };
    return v;
  }
  _secretsFor(job) {
    if (!job.envFrom || !job.envFrom.length) return {};
    try {
      const store = JSON.parse(fs.readFileSync(path.join(this.d.dataDir, 'job-secrets.json'), 'utf-8'));
      const out = {};
      for (const k of job.envFrom) if (store[k] !== undefined) out[k] = String(store[k]);
      return out;
    } catch { return {}; }
  }
  _jobToken(job) {
    if (!job._tokenRaw) { job._tokenRaw = 'jbt_' + crypto.randomBytes(16).toString('hex'); job.tokenHash = crypto.createHash('sha256').update(job._tokenRaw).digest('hex'); }
    return job._tokenRaw;
  }
  jobByToken(raw) {
    if (!raw || !raw.startsWith('jbt_')) return null;
    const h = crypto.createHash('sha256').update(raw).digest('hex');
    for (const j of this.jobs.values()) if (j.tokenHash === h) return j;
    return null;
  }

  // ── boot: adopt-first, then replay ──────────────────────────────────────
  _adoptAndReplay() {
    for (const job of this.jobs.values()) {
      try {
        if (!['up', 'starting', 'awaiting-user'].includes(job.state)) continue;
        const stamp = this._readStamp(job);
        if (this._verifyAlive(stamp)) {
          this.d.log(`[jobs] adopted ${job.id} pid=${stamp.pid}`);
          if (job.kind === 'service' && job.publish && (job.ports || []).length) setTimeout(() => this._ensurePublish(job), 8000); // ports manager restores at +5.5s
          continue;
        }
        const run = job.runs && job.runs[job.runs.length - 1];
        const exit = this._readExit(job, run);
        // round 4: its wrapper is gone — what is left in its scope is an ended run's (a service's KEPT processes excepted —
        // round 5, the ruling: its replay stops them first); round 5: a service's replay AWAITS this reap (_startAfter); round
        // 6: a reap past its read's bound is never dropped — it enqueues itself and every tick retries it (_reapScope)
        if (!(exit && (exit.scopeEmpty === true || (exit.left && exit.left.kept)))) this._reapScope(job, run).catch(() => { });
        if (exit) { this._finalizeRun(job, run, exit, 'boot'); continue; }
        if (stamp && !stamp.bootId) { job.state = 'unverified'; this._touch(job, { what: 'unverified after restart — resolve in the panel' }); continue; }
        // no live process, no exit record ⇒ died with the environment
        // THE BOOT'S JUDGE (lane jobs-memory-bound): under memory.oom.group the wrapper dies with its job, so no exit record
        // says what happened — the wrapper's last pressure sample and the instance's own OOM count do (src/job-model.js
        // bootEndCause: `oom` only when the SAME cgroup's oom_kill rose and this job held most of its anon memory; page cache
        // is never pressure). Every verdict — `oom` or env-restart — ends the run through the ONE road of the park law
        const sample = run && !run.endedAt ? this._ctlJson(job, run, 'pressure.json') : null;
        this._bootNoExit(job, run, M.bootEndCause(sample, sample ? this._cgroupNow() : null));
      } catch (e) { this.d.log(`[jobs] adopt failed for ${job.id}:`, e.message); }
    }
    // one-shot collapse of pre-2.343.3 per-fire child records: keep the newest
    // child per cron, drop older TERMINAL ones (stamp-verified not alive)
    const byParent = new Map();
    for (const j of this.jobs.values()) if (j.cronParent) (byParent.get(j.cronParent) || byParent.set(j.cronParent, []).get(j.cronParent)).push(j);
    for (const [, kids] of byParent) {
      if (kids.length < 2) continue;
      kids.sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0));
      for (const old of kids.slice(1)) {
        if (!['done', 'interrupted', 'failed', 'missed'].includes(old.state)) continue;
        if (this._verifyAlive(this._readStamp(old))) continue;
        this.jobs.delete(old.id); this._dirty = true;
        (this._collapsed = this._collapsed || new Map()).set(old.id, kids[0].id); // poll of a stale id names the survivor
        try { fs.rmSync(path.join(this.logsDir, old.id), { recursive: true, force: true }); } catch { }
      }
    }
    for (const job of this.jobs.values()) {
      try {
        const replays = () => job.kind === 'service' && job.desiredUp && job.state === 'down' && !(job.supervise && job.supervise.parkedAt);
        if (replays()) this._startAfter(job, 'boot', replays); // round 5: never beside what its last run left (its reap awaited)
        // lane job-wrapper-update-window: a one-shot task an update's window interrupted NEVER RAN — the restarted server
        // runs it once; a cron child waits for its next fire (its schedule owns when it runs)
        else if (job.kind === 'task' && !job.cronParent && job.state === 'interrupted' && (job.runs || []).length && job.runs[job.runs.length - 1].cause === 'update_window') this._spawn(job, 'update-rerun');
      } catch (e) { this.d.log(`[jobs] replay failed for ${job.id}:`, e.message); }
    }
  }
  _readExit(job, run) { return this._ctlJson(job, run, 'exit.json'); }
  /** THE ONE ROAD of the park law (lane jobs-memory-bound, acceptance round 2): every end of a run — the sweep's and the boot's
   *  adopt of an exit record (_finalizeRun), the boot's judge of a run that died with the instance (_bootNoExit), `oom` or
   *  env-restart alike — is counted HERE and nowhere else: a memory end counts, any other resets (OOM / restart / OOM is not
   *  two in a row) */
  _countEnd(job, cause) {
    const mp = M.onMemoryEnd(job.supervise, cause, now());
    job.supervise = mp.supervise;
    return mp;
  }
  /** the instance's memory cgroup NOW, as the boot's judge reads it: its identity (boot + inode — a new container's cgroup is
   *  another) and its own OOM count (memory.events) — the wrapper's sample carries the same at the job's start */
  _cgroupNow() {
    const seam = this.d.memorySample && typeof this.d.memorySample.sampleDir === 'string' ? this.d.memorySample.sampleDir : '';
    try {
      const dir = seam || path.join('/sys/fs/cgroup', (fs.readFileSync('/proc/self/cgroup', 'utf8').split('\n').find((l) => l.startsWith('0::')) || '0::/').slice(3));
      const t = fs.readFileSync(path.join(dir, 'memory.events'), 'utf8');
      const n = (k) => Number((new RegExp(`^${k} (\\d+)$`, 'm').exec(t) || [])[1] || 0);
      return { cgId: `${bootId()}:${fs.statSync(dir).ino}`, oomKill: n('oom_kill'), oomGroupKill: n('oom_group_kill') };
    } catch { return null; }
  }
  /** a run that died WITH the instance (THE BOOT'S JUDGE above): `oom` is named, counted, parked at the law's count; an
   *  env-restart is the base's interruption — and resets the count (the same road). The verdict's reasoning rides the run. */
  _bootNoExit(job, run, v) {
    const ends = !!(run && !run.endedAt);
    if (ends) {
      run.endedAt = (v.cause === 'oom' && v.at) || now(); run.exit = null; run.cause = v.cause;
      if (v.why) run.memoryJudge = { why: v.why, jobAnonMb: v.jobAnonMb, anonMb: v.anonMb, fileMb: v.fileMb, usedMb: v.usedMb, limitMb: v.limitMb, ...(v.oomKills !== undefined ? { oomKills: v.oomKills } : {}) };
      if (!run.memoryBound) { const b = this._ctlJson(job, run, 'bound.json'); if (b) this._adoptBound(run, b); }
    }
    const mp = ends ? this._countEnd(job, v.cause) : null;
    if (v.cause === 'oom' && ends) {
      const said = `${M.memoryEndWhat(run)} — it held ${M.memoryWords(v.jobAnonMb)} of the instance's ${M.memoryWords(v.anonMb)} of anon memory (limit ${M.memoryWords(v.limitMb)})`;
      this.d.log(`[jobs] ${job.id} died with the instance out of memory — judged at boot, counted ${mp.count} of ${M.MEMORY.parkAfter}`);
      if (mp.park) { this._parkForMemory(job, run); return; }
      if (job.kind === 'service') { job.state = 'down'; this._touch(job, { what: `down: ${said}` }); return; }
      job.state = 'failed';
      this._touch(job, { what: `failed: ${said}` });
      this._notifyOwner(job, { what: `failed: ${said}` });
      return;
    }
    if (job.kind === 'service') { job.state = 'down'; this._touch(job); }
    else { job.state = 'interrupted'; this._touch(job, { what: 'interrupted (env-restart: the host/pod restarted)' }); }
  }
  /** a run's own record in its ctl dir — exit.json, and (lane jobs-memory-bound) bound.json / pressure.json the wrapper writes */
  _ctlJson(job, run, name) {
    if (!run) return null;
    try { return JSON.parse(fs.readFileSync(path.join(this._ctlDir(job, run.startedAt), name), 'utf-8')); } catch { return null; }
  }
  /** THE LADDER's inputs (lane jobs-memory-bound): the owner's setting `jobs.memoryMb` (undefined while never set) and the
   *  cluster's default (the chart's env) — read live, per run */
  _memoryCtx({ hub = false } = {}) {
    let ctx = {};
    try { ctx = (typeof this.d.memoryCtx === 'function' && this.d.memoryCtx()) || {}; } catch { }
    // THE LIMIT THAT CONTAINS THE JOB (round 4): the hub's own, where jobs live inside it (the rlimit / none rungs); where this
    // host's runs prove the cgroup rung, what contains a scope — the last proof's (_adoptBound)
    const lim = !hub && this._rungSeen && this._rungSeen.by === 'cgroup' ? this._rungSeen.contain : this._instanceLimit();
    return { ...ctx, instanceMb: lim.mb, instanceOf: lim.of };
  }
  /** THE INSTANCE'S OWN LIMIT (lane jobs-memory-bound, acceptance round 3 — the cap of THE LADDER): the tightest memory.max of
   *  the hub's cgroup and its ancestors, in MB (a pod: the container's; null = none — a host that caps nothing); the deps
   *  seam `memoryLimitDir` names one cgroup dir instead (a fake — the instance's own). Read at most once a minute: a pod's
   *  limit moves only with an in-place resize. Round 4: {mb, of} — which limit (M.limitHolder: the instance, the user slice,
   *  the hub's own unit …). */
  _instanceLimit() {
    if (this._limitRead && now() - this._limitRead.at < 60e3) return this._limitRead;
    let mb = null, of = null;
    try {
      const dirs = [];
      if (typeof this.d.memoryLimitDir === 'string') dirs.push(['/', this.d.memoryLimitDir]);
      else {
        const rel = (fs.readFileSync('/proc/self/cgroup', 'utf8').split('\n').find((l) => l.startsWith('0::')) || '0::/').slice(3) || '/';
        for (let p = rel; ; p = path.dirname(p)) { dirs.push([p, path.join('/sys/fs/cgroup', p)]); if (p === '/' || p === '.') break; }
      }
      for (const [cg, dir] of dirs) {
        let v = '';
        try { v = fs.readFileSync(path.join(dir, 'memory.max'), 'utf8').trim(); } catch { continue; }
        if (/^\d+$/.test(v)) { const m = Math.floor(Number(v) / 1048576); if (mb === null || m < mb) { mb = m; of = M.limitHolder(cg); } }
      }
    } catch { }
    this._limitRead = { at: now(), mb, of };
    return this._limitRead;
  }
  /** THE RUNG A RUN PROVED — bound.json while it runs, exit.json `memory` at its end: its record, and (round 4) the bound it
   *  ACTUALLY holds and the limit that capped it — the cgroup rung's cap is what contains its scope, known only once the scope
   *  exists; the proof also tells every next run's words what contains the jobs of this host */
  _adoptBound(run, b) {
    run.memoryBound = M.boundRecord(b);
    if (!b.confirmed) return;
    run.memoryMb = run.memoryBound.mb;
    if (run.memoryBound.cap) run.memoryCap = run.memoryBound.cap; else delete run.memoryCap;
    const c = b.by === 'cgroup' && b.contain && typeof b.contain === 'object' ? b.contain : null;
    const mb = c && Number.isFinite(c.limitMb) && c.limitMb > 0 ? Math.floor(c.limitMb) : null;
    this._rungSeen = b.by === 'cgroup' ? { by: 'cgroup', contain: { mb, of: mb ? M.limitHolder(c.cgroup) : null } } : { by: b.by };
  }
  /** THE PARK LAW's act (lane jobs-memory-bound): a job whose runs ended out of memory M.MEMORY.parkAfter times in a row is
   *  parked BY NAME and not run again until its owner acts (start — after raising its bound or fixing the job): a service
   *  is never restarted (neither its backoff nor the boot replay — supervise.parkedAt), a cron child parks its parent (its
   *  next fire would run it again). */
  _parkForMemory(job, run) {
    const parent = job.cronParent ? this.jobs.get(job.cronParent) : null;
    const what = `${M.memoryEndWhat(run)} — ${M.MEMORY_PARK_TEXT}`;
    for (const j of parent ? [job, parent] : [job]) {
      j.state = 'failed';
      if (j.kind === 'cron') { j.desiredUp = false; j.nextFireAt = null; }
      if (j !== job) j.supervise = { ...(j.supervise || {}), parkedAt: now(), parkedFor: 'memory' };
      if (j.kind === 'service') this._teardownPublish(j);
      this._touch(j, { what });
    }
    this.d.log(`[jobs] ${job.id} ${M.MEMORY_PARK_TEXT} (${run.cause}; bound ${M.memoryWords(run.memoryMb)}${run.memoryBound ? ' · ' + run.memoryBound.by : ''})`);
    this._forYou(job, M.forYouCopy(job, 'parked-memory'));
    this._notifyOwner(job, { what: `${what} (vibespace-job memory ${parent ? parent.id : job.id} <size>, then vibespace-job start ${parent ? parent.id : job.id})` });
  }
  /** Was a run's protocol mismatch the update's WINDOW (lane job-wrapper-update-window)? Yes when an older server generation
   *  started it (this one is the restart), or the wrapper changed on disk after this server booted and not long ago (the
   *  restart is on its way). Otherwise the mismatch is this install's own — a fault. */
  _inUpdateWindow(run) {
    if ((Number(run.startedAt) || 0) < (this._bootAt || 0)) return true;
    let at = 0;
    try { at = fs.statSync(path.join(this.d.dataDir, 'bin', 'job-wrapper.js')).mtimeMs; } catch { }
    return at > (this._bootAt || 0) && now() - at < UPDATE_WINDOW_MS;
  }
  _finalizeRun(job, run, exit, why) {
    if (run.endedAt) return; // ONE JUDGE PER RUN END (round 5): a run is judged once — a second caller (an overlapping pass) returns
    run.endedAt = exit.endedAt || now();
    // lane jobs-browser (B-dbc1): the run is over — what it held as its conversation (its browser lease + window) is released
    try { this.d.onRunEnded?.(job, run); } catch { }
    run.exit = exit.code;
    const untilHit = job._untilHit;
    // AN UPDATE'S WINDOW IS NOT A FAILURE (lane job-wrapper-update-window, fb-7f7be1e24e): the wrapper on disk spoke another
    // protocol than the server that started the run, so the job never started (exit.json reason update_window) — said as
    // an interruption, no failure notice; a mismatch outside a window is the install's own fault, said as one
    const proto = exit.reason === 'update_window' && !job._stopRequested ? (this._inUpdateWindow(run) ? 'update_window' : 'wrapper-mismatch') : null;
    if (proto === 'update_window') run.exit = null; // no process of the job ever exited
    // THE NAMED END (lane jobs-memory-bound): the wrapper measured what ended the job (exit.json `memory`) — its own bound
    // (`oom-bound`: the scope's oom-kill, or an allocation RLIMIT_DATA refused) or an OOM from outside (`oom`) — and the rung
    // that held it. A stop the owner asked for stays a stop.
    const mem = exit.memory && typeof exit.memory === 'object' ? exit.memory : null;
    if (mem && mem.by) this._adoptBound(run, mem);
    // round 4: an end that had to kill its scope. Round 5 — ONE FLAG, ONE MEANING: `forced` is a kill WE made (the wrapper's,
    // in exit.json; else the engine's own kill step, its grace said) — never inferred from how the job died; `left` is what
    // the job left running (a task's: stopped; a service's: kept — the ruling)
    const forced = typeof exit.forced === 'string' && exit.forced ? M.clip(exit.forced, 200) : job._forced && job._forced.run === run.startedAt ? job._forced.words : '';
    const left = M.leftRecord(exit.left);
    if (forced) run.forced = forced;
    if (left) run.left = left;
    const endWords = left ? M.leftWords(left) : forced;
    if (endWords) { this.d.log(`[jobs] ${job.id} ${endWords}`); if (job.kind === 'service') this._touch(job, { what: endWords }); } // a task says it in its end line below
    // round 6: THE EXIT RECORD'S OWN WORDS WIN — an out-of-memory end it names with no `stop` in it ended the run before the
    // owner's stop reached it (a stop pressed between exit.json and this judgment erased the OOM and its count)
    const memNamed = mem && M.MEMORY_CAUSES.includes(mem.cause) ? mem.cause : null;
    const stopped = !!job._stopRequested && !(memNamed && !exit.stop);
    const memCause = memNamed && !stopped ? memNamed : null;
    run.cause = proto || (untilHit ? 'ok(until-output)' : memCause
      || (stopped ? 'interrupted' : exit.code === 0 ? 'ok' : job._timedOut ? 'timeout' : 'error'));
    if (memCause) this.d.log(`[jobs] ${job.id} ${M.memoryEndWhat(run)} (${mem.how || mem.cause}; ${why})`);
    delete job._stopRequested; delete job._timedOut; delete job._untilHit; delete job._scopeKilled; delete job._termAt; delete job._stopForce; delete job._forced;
    const windowEnd = run.cause === 'update_window';
    // THE PARK LAW (lane jobs-memory-bound): EVERY judged end counts — the sweep's, and the boot's (a run that ended while the
    // server was down is judged here at its boot exactly like a run judged live; the base never counted a boot's) — _countEnd
    const memPark = windowEnd ? null : this._countEnd(job, run.cause);
    if (job.kind === 'service' && windowEnd) {
      job.state = 'down'; this._touch(job, { what: 'down (update_window: it started while VibeSpace was updating itself and never ran — the restarted server starts it again)' }); // never a crash of the supervisor's count: the boot replay starts a desiredUp service
    } else if (job.kind === 'service' && memPark && memPark.park) {
      this._parkForMemory(job, run);
    } else if (job.kind === 'service') {
      const dec = M.onServiceExit(job, { uptimeMs: run.endedAt - run.startedAt, now: now() });
      job.supervise = { ...(dec.supervise || job.supervise), ...(job.supervise && job.supervise.oomEnds ? { oomEnds: job.supervise.oomEnds } : {}) };
      if (memCause && !dec.park) this._touch(job, { what: `${M.memoryEndWhat(run)} — ${M.MEMORY.parkAfter - memPark.count} more out-of-memory end parks it` });
      if (dec.park) {
        job.state = 'failed';
        this._teardownPublish(job);
        this._touch(job, { what: `parked after ${M.SUPERVISE.failCap} crashes (exit ${run.exit})` });
        this._forYou(job, M.forYouCopy(job, 'parked'));
        this._notifyOwner(job, { what: `parked after ${M.SUPERVISE.failCap} crashes (exit ${run.exit}) — start it again once fixed` });
      } else if (dec.restartInMs) {
        job.state = 'down'; this._touch(job);
        const t = setTimeout(() => { try { this._startAfter(job, 'restart-policy', () => job.desiredUp && job.state === 'down'); } catch { } }, dec.restartInMs); // round 5: never beside what its last run left
        t.unref?.();
      } else { job.state = 'down'; this._touch(job); }
    } else {
      job.state = run.cause === 'interrupted' || windowEnd ? 'interrupted' : run.cause.startsWith('ok') ? 'done' : 'failed';
      // the LAST NON-EMPTY log line, computed ONCE here (triage §13 rule 4):
      // the one actionable fact a failed row can show without a detail fetch —
      // unless the clear COVERED this run (it started before the clear; verify
      // r3): its log is withheld from every snapshot, and its last line is that
      // log's own output (under a forced stop / OOM the process's last words —
      // the wrapper's exit marker only when the wrapper outlived the group)
      run.lastLine = job.clearedAt && !((run.startedAt || 0) > job.clearedAt) ? null : this._lastLogLine(job, run);
      if (memPark && memPark.park) { this._parkForMemory(job, run); return; } // lane jobs-memory-bound: the park says the end (once)
      // quiet-success is the DEFAULT, not a law (2.346.0, owner decision): the
      // creating agent opts scheduled successes into events+notify with
      // --notify-ok (job.notifyOk, inherited by the cron child via the
      // embedded task spec)
      const routineCronOk = job.cronParent && job.state === 'done' && !job.notifyOk;
      const evText = windowEnd ? `interrupted (update_window: it started while VibeSpace was updating itself and never ran — ${job.cronParent ? 'its next fire runs it' : 'the restarted server runs it again'})`
        : run.cause === 'wrapper-mismatch' ? `failed: it never started — data/bin/job-wrapper.js speaks another protocol than this server (restart VibeSpace to finish its update)`
          : memCause ? `${job.state}: ${M.memoryEndWhat(run)} (${Math.round((run.endedAt - run.startedAt) / 60000)}m)`
            : `${job.state} exit=${run.exit ?? '—'} ${run.cause} (${Math.round((run.endedAt - run.startedAt) / 60000)}m)${endWords ? ` — ${endWords}` : ''}`;
      this._touch(job, routineCronOk ? null : { what: evText });
      if (M.notifyUserOf(job) && !windowEnd) this._forYou(job, M.forYouCopy(job, 'end', { cause: run.cause }));
      // owner auto-notify honors the same quiet-success law: routine scheduled
      // success never messages anyone; agent-stopped ('interrupted') skips too
      // — the owner just did it and a message would echo their own action.
      if (!routineCronOk && job.state !== 'interrupted') this._notifyOwner(job, { what: evText });
    }
    // round 5 (the ruling): a service keeps what its run left only while it runs — stopped or parked, they are stopped too
    if (job.kind === 'service' && left && left.kept && (!job.desiredUp || job.state === 'failed')) this._clearKept(job, run).then(() => this._cutSaid(job, run)).catch(() => { });
  }
  /** round 10: A CUT WALK OF THE PARK'S OR THE STOP'S OWN CLEAR IS SAID AT ONCE — never only when someone presses start (round 9
   *  stamped it silently; the base said it): a parked service by the doubt's door (its journal line, ONE For-you notice — a later
   *  start says nothing twice), a stopped one by the person's word (_stopDoubt: said, the hold ended) */
  _cutSaid(job, run) {
    if (!this._cutOf(run)) return;
    if (job.state === 'failed') { this._doubtBlocks(job, run, 'parked'); return; }
    return this._stopDoubt(job, run);
  }

  // ── sweeps ──────────────────────────────────────────────────────────────
  // ONE JUDGE PER RUN END (lane jobs-memory-bound, acceptance round 5): a pass may await (the reaps it retries) and the 5 s tick
  // has no say over it — a tick that finds a pass in flight SKIPS it (said once, past three skips) and answers with that pass;
  // round 4's overlapping passes judged ONE ended run once per tick of a busy threadpool (oomEnds 2: a service parked «out of
  // memory twice» after a single OOM, two park notices). Round 6: a pass's wall time is ONE bounded read — a run is judged
  // first and its reap goes on beside it, the deferred reaps are retried AT ONCE (round 5 awaited each scope in series: K
  // hung scopes held a pass 2K s and every job behind them)
  _sweep() {
    if (this._sweepRun) {
      if (++this._sweepSkips === 4) this.d.log(`[jobs] the sweep has run ${Math.round((now() - this._sweepAt) / 1000)} s — its ticks skip until it ends`);
      return this._sweepRun;
    }
    this._sweepAt = now(); this._sweepSkips = 0;
    const pass = this._sweepRun = this._sweepPass().finally(() => { if (this._sweepRun === pass) this._sweepRun = null; });
    return pass;
  }
  async _sweepPass() {
    if (this.readOnly) return;
    // the archive cadence rides THIS tick (rule 5: no second timer)
    if (now() - this._lastArchiveSweep >= ARCHIVE_SWEEP_MS) {
      try { this.archiveSweep({ why: 'tick' }); } catch (e) { this.d.log('[jobs] archive sweep failed:', e.message); }
    }
    for (const job of this.jobs.values()) {
      if (!['up', 'starting', 'awaiting-user'].includes(job.state)) continue;
      const run = job.runs && job.runs[job.runs.length - 1];
      const stamp = this._readStamp(job);
      if (stamp && job.state === 'starting') { job.state = 'up'; this._touch(job); }
      if (stamp && run && !run.memoryBound) { const b = this._ctlJson(job, run, 'bound.json'); if (b) { this._adoptBound(run, b); this._touch(job); } } // lane jobs-memory-bound
      // a stop that raced the wrapper's first act (no pid stamp yet ⇒ nothing
      // to kill) is honored HERE once the stamp exists — without this, a stop
      // in a job's first few hundred ms silently no-opped (2.350.0 gate catch).
      // Round 5: honored AS the stop — its SIGTERM first, the kill step a grace later (a forced stop: at once); a stop whose
      // SIGTERM landed keeps its own clock — the tick killed a graceful job 0–5 s after the stop and the end said «in 10 s»
      if (stamp && job._stopRequested && this._verifyAlive(stamp)) {
        if (job._stopForce) this._escalate(job, this._runScope(job, run), undefined, run); // round 4: on the cgroup rung, the scope
        else if (!job._termAt) { if (this._termRun(job, run)) job._termAt = now(); } // its kill step: THE LADDER below
      }
      if (stamp && !this._verifyAlive(stamp)) {
        const exit = this._readExit(job, run) || { code: null, endedAt: now() };
        // round 4: a wrapper gone, its scope not — never an ended run still running (a service's KEPT processes excepted —
        // round 5, the ruling). Round 6: the run is judged from its exit record NOW and its reap goes on beside it (bounded; one
        // that does not finish enqueues itself — _reapScope); a restart waits for it (_startAfter)
        if (!(exit.scopeEmpty === true || (exit.left && exit.left.kept))) this._reapScope(job, run).catch(() => { }); // measured empty: nothing to reap
        this._finalizeRun(job, run, exit, 'sweep');
        continue;
      }
      if (stamp) this._listenRead(job, stamp); // lane artifacts-services: the port it serves (async, ≤ 1 read / job / 30 s)
      // timeout — its SIGTERM and its words once per run (round 6: the kill step bound to it)
      if (job.kind === 'task' && job.timeoutMs && run && !run.endedAt && !job._timedOut && now() - run.startedAt > job.timeoutMs) {
        job._timedOut = true; this._termRun(job, run); job._termAt = job._termAt || now();
        this._armKillStep(job, run, this._runScope(job, run));
      }
      // THE LADDER (round 7) — a run SIGTERMed by a stop, a timeout or an until-marker: EVERY TICK while THAT run lives, a kill
      // step after its SIGTERM, _escalate — its scope (once), then a wrapper still there WEDGE_MS later with its group. Round 6
      // armed the timeout's step ONCE: a wrapper wedged after its scope's kill was never killed and the task showed «up» for
      // ever past its own time limit (the stop survived only because its branch escalated every tick)
      if (stamp && job._termAt && !job._stopForce && this._runLive(job, run)) {
        const scope = this._runScope(job, run);
        if (now() - job._termAt >= this._killStepMs(scope)) this._escalate(job, scope, this._graceWords(), run);
      }
      // untilOutput: incremental literal scan, bounded per tick
      if (job.kind === 'task' && job.untilOutput && run && !job._untilHit) this._untilScan(job, run);
      // panel timeout
      const p = job.interaction && job.interaction.pending;
      if (p && p.timeoutS && now() - p.postedAt > p.timeoutS * 1000) {
        job.interaction.answers = job.interaction.answers || [];
        job.interaction.answers.push({ expired: true, version: p.version, ts: now() });
        job.interaction.pending = null;
        if (job.state === 'awaiting-user') job.state = 'up';
        this._resolveAns(job);
        try { this.d.resolveJobAsk && this.d.resolveJobAsk(job.id); } catch { } // expired ask is moot — clear its inbox entry too
        this._touch(job, { what: 'interaction panel expired unanswered', verb: 'answers' });
      }
    }
    // the reaps that did not finish (round 6: the boot's, the sweep's, a start's): their runs were judged; what their scopes still
    // hold never runs on — retried at once (a pass waits ONE bounded read), REAP_TRIES times, then said once and dropped
    await Promise.allSettled([...this._reapLater].map(async ([r, e]) => {
      if (await this._reapScope(e.job, r)) return;
      const tries = this.d.reapTries || REAP_TRIES; // a suite's seam
      if (++e.tries < tries || this._reapLater.get(r) !== e) return;
      this._reapLater.delete(r);
      const what = this._reapDropWords(r, this._runScope(e.job, r), tries); // round 7: why it did not finish — the last attempt's
      if (what) { this.d.log(`[jobs] ${e.job.id} ${what}`); this._touch(e.job, { what }); }
    }));
    this._serviceDoor();
  }
  // ── SERVICES (lane artifacts-services): a job that LISTENS is a deliverable of its owner conversation ──
  /** The job's pid tree → the TCP ports it listens on (src/proc-listen.js: async, bounded, no exec), on THIS tick, at
   *  most once per job per LISTEN_READ_MS. `job.listen` = {port, firstAt, at} — persisted, so a stopped job's row
   *  still names its last address; the lowest port is the row's (a moved port patches it). */
  _listenRead(job, stamp) {
    if (job._listenBusy || now() - (job._listenAt || 0) < (this.d.listenReadMs ?? LISTEN_READ_MS)) return; // the deps knob = a fast suite's seam only
    job._listenBusy = true; job._listenAt = now();
    const PL = require('./proc-listen.js');
    PL.pidTree(stamp.pid).then((pids) => PL.listenPortsOf(pids)).then((ports) => {
      const port = ports[0] || 0;
      if (!port || (job.listen && job.listen.port === port)) return;
      const t = now();
      job.listen = { port, firstAt: (job.listen && job.listen.firstAt) || t, at: t };
      this._dirty = true;
      this._serviceDoor(); // the row is born / patched the moment the read lands, not a tick later
    }).catch(() => { }).finally(() => { job._listenBusy = false; });
  }
  /** The registry's door (src/server/artifact-registry.js noteService): a service row's facts moved — born, port
   *  moved, stopped, started again. No I/O: a signature per job, compared on the tick. */
  _serviceDoor() {
    if (typeof this.d.onService !== 'function') return;
    for (const job of this.jobs.values()) {
      if (!job.listen) continue;
      const sig = `${['up', 'starting', 'awaiting-user'].includes(job.state) ? 'r' : 's'}:${job.listen.port}`;
      if (job._svcSig === sig) continue;
      job._svcSig = sig;
      try { this.d.onService(job); } catch (e) { this.d.log('[jobs] service door failed:', e.message); }
    }
  }
  _untilScan(job, run) {
    try {
      const logPath = path.join(this._ctlDir(job, run.startedAt), 'current.log');
      const st = fs.statSync(logPath);
      job._untilCursor = job._untilCursor || 0;
      if (st.size < job._untilCursor) job._untilCursor = 0; // rotated
      if (st.size === job._untilCursor) return;
      const len = Math.min(st.size - job._untilCursor, 65536); // per-tick byte budget
      const fd = fs.openSync(logPath, 'r');
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, job._untilCursor); fs.closeSync(fd);
      job._untilCursor += len;
      // literal substring on capped-length text (no agent regex on the main loop)
      if (buf.toString('utf-8').split('\n').some((l) => l.slice(0, 4096).includes(job.untilOutput))) {
        job._untilHit = true;
        this._event(job, 'until-marker hit — completing after grace');
        const grace = Number(process.env.VIBESPACE_JOBS_GRACE_MS) || 30_000; // env knob: tests shrink the until-grace
        const steps = job._killSteps || (job._killSteps = new Set()); // round 6: bound to ITS run — a new run disarms it (_spawn)
        const t = setTimeout(() => { steps.delete(t); if (!this._runLive(job, run)) return; this._termRun(job, run); job._termAt = job._termAt || now(); this._armKillStep(job, run, this._runScope(job, run)); }, grace);
        t.unref?.(); steps.add(t);
      }
    } catch { }
  }
  async _cronTick() {
    if (this.readOnly) return;
    for (const job of this.jobs.values()) {
      if (job.kind !== 'cron' || !job.desiredUp) continue;
      try {
        if (job.nextFireAt == null) { job.nextFireAt = M.nextFire(job.schedule, now()); this._dirty = true; continue; }
        if (now() < job.nextFireAt) continue;
        const missedByMs = now() - job.nextFireAt;
        const isCatchUp = missedByMs > 120_000;
        if (isCatchUp && (job.catchUp || 'once') === 'none') {
          if (job.schedule.at) {
            // terminal: park the record so the next tick doesn't re-enter this
            // branch forever (2.344.1 review catch — nextFireAt stayed in the
            // past, so the owner notify re-fired every dedupe window)
            job.state = 'missed'; job.desiredUp = false; job.nextFireAt = null;
            this._touch(job, { what: 'missed its {at} time while the server was down' });
            this._forYou(job, M.forYouCopy(job, 'missed'));
            this._notifyOwner(job, { what: 'MISSED its scheduled {at} time (server was down) — reschedule if it still matters' });
            continue;
          }
        }
        this._fireCron(job, isCatchUp ? 'boot' : 'cron');
        job.nextFireAt = job.schedule.at ? null : M.nextFire(job.schedule, now());
        if (job.schedule.at) { job.state = 'done'; }
        this._touch(job);
      } catch (e) { this.d.log(`[jobs] cron fire failed for ${job.id}:`, e.message); }
    }
  }
  _fireCron(job, trigger) {
    const a = job.action || {};
    if (a.type === 'notify') {
      const key = (a.text || '').slice(0, 200);
      job._lastNotify = job._lastNotify || {};
      if (job._lastNotify.key === key && now() - job._lastNotify.ts < 6 * 3600e3) { job._lastNotify.count = (job._lastNotify.count || 1) + 1; return; } // dedupe window
      job._lastNotify = { key, ts: now(), count: 1 };
      // USER-INBOX copy is OPT-IN (--notify-user; owner decision 2.363.1,
      // option A): a notify fire's text is usually the AGENT's own reminder
      // ("scan X, report if new") — unconditionally mirroring it to the
      // user's inbox spammed agent-facing instructions at the human
      // (inc-mt27t0bg follow-up report). The agent decides what the user
      // needs and relays via chat/vibespace-ask.
      // lane job-notify-user r3: the agent's --text is a FIELD — the For-you copy files it as the template's {text} (the store
      // belts it on its own), and the owner conversation that WROTE it gets it whole while a subscriber gets it belted
      // (_notifyOwner: `agentWhat`); `a.text` is read in place at each sink (test-record-clear-census follows the field)
      if (M.notifyUserOf(job)) this._forYou(job, M.forYouCopy(job, 'fire', { text: a.text, urgency: a.urgency }));
      // THE 设备运维大师 gap (2.361.5): a notify action only reached the USER
      // inbox — the agent that scheduled its own reminder was never messaged
      // (an agent-created dated obligation woke nobody). Owner-conversation
      // delivery rides the same toggles/rate-floor/stash as every job event.
      // the --text is the author's WORDS (whole to it, belted for a subscriber); with none the body is the job's LABEL — the same
      // belted name the header and the card carry (r4, claim r3-2 minor 6: the raw name rode the body beside a masked header)
      this._notifyOwner(job, a.text ? { what: a.text, agentWhat: true } : { what: this.labelOf(job) });
      this._event(job, 'cron fired: notify');
    } else if (a.type === 'spawn-task') {
      // ONE persistent child per cron (2.343.3, owner report: every fire used
      // to mint a fresh 14-day task record — a 10min cron flooded the panel
      // with ~100 cards/day and spammed the injection channel). Each fire is a
      // RUN in the same child's ring; routine success is SILENT (quiet-success
      // law) — only failures/awaiting-user surface as events.
      let child = [...this.jobs.values()].find((x) => x.cronParent === job.id);
      if (child && job.singleRun !== false && ['up', 'starting', 'awaiting-user'].includes(child.state) && this._verifyAlive(this._readStamp(child))) {
        return; // maxConcurrent:1 — previous run still alive; silent skip (visible in the cron's nextFireAt drift)
      }
      if (!child) {
        child = { ...a.task, id: rid(), kind: 'task', name: `${job.name} run`, owner: job.owner, access: job.access, state: 'starting', runs: [], createdAt: now(), cronParent: job.id };
        this.jobs.set(child.id, child);
      }
      // lane job-notify-user: the For-you copy is the PARENT's setting (`run --every/--cron/--at … --notify-user` sends it
      // top-level, like notify-cron) — handed to the child at every fire, so the run's end tells the user what `show` says
      child.notifyUser = M.notifyUserOf(job);
      delete child._untilCursor; delete child._untilHit; // fresh run, fresh scan
      this._spawn(child, trigger);
    }
  }
  async _gc() {
    if (this.readOnly) return;
    const cutoff = now() - 14 * 86400e3;
    try { // spill files: age-swept alongside the records they narrate
      const dir = path.join(this.d.dataDir, 'job-notifications-read');
      for (const f of fs.readdirSync(dir)) {
        try { if (fs.statSync(path.join(dir, f)).mtimeMs < cutoff) fs.unlinkSync(path.join(dir, f)); } catch { }
      }
    } catch { }
    for (const [id, job] of this.jobs) {
      const stamp = this._readStamp(job);
      if (this._verifyAlive(stamp)) continue; // NEVER gc live work, regardless of record state
      if (job.kind === 'task' && ['done', 'interrupted'].includes(job.state)) {
        const run = job.runs && job.runs[job.runs.length - 1];
        if (run && run.endedAt && run.endedAt < cutoff) {
          this.jobs.delete(id); this._dirty = true;
          try { fs.rmSync(path.join(this.logsDir, id), { recursive: true, force: true }); } catch { }
        }
      }
    }
    // ARCHIVED records keep their record (the cap bounds it) but their log
    // dirs follow the SAME 14-day retention as a live record's (triage §13)
    try {
      for (const rec of this._loadArchive()) {
        if (M.terminalAt(rec) < cutoff) { try { fs.rmSync(path.join(this.logsDir, rec.id), { recursive: true, force: true }); } catch { } }
      }
    } catch { }
  }

  // ── public API (callers pre-authorize via job-model predicates) ─────────
  create(spec, caller) {
    if (this.readOnly || !this.ready) return { error: this.initError ? `jobs engine down: ${this.initError}` : 'jobs engine not ready — retry shortly' };
    const vet = M.vetSpec(spec);
    if (!vet.ok) return { error: vet.error };
    if (spec.kind === 'cron') {
      const v = M.validateSchedule(spec.schedule, { agentCreated: !caller.isUser });
      if (!v.ok) return { error: v.error };
    }
    if (spec.context && Buffer.byteLength(spec.context.payload || '', 'utf-8') > M.CONTEXT_PAYLOAD_CAP) return { error: `context payload exceeds ${M.CONTEXT_PAYLOAD_CAP} bytes — store the brief in a file and reference its path` };
    // THE MEMORY BOUND (lane jobs-memory-bound): the creator's own value (a scheduled task's rides its action's task — the
    // fire builds the child from it); absent = THE LADDER at each run. 0 (unbounded) is the user's alone.
    const task = spec.kind === 'cron' && spec.action && spec.action.type === 'spawn-task' && spec.action.task ? spec.action.task : null;
    const memRaw = task ? task.memoryMb : spec.memoryMb;
    let memMb = null;
    if (memRaw !== undefined && memRaw !== null && memRaw !== '') {
      const mv = M.memoryValueVerdict(memRaw, { byUser: !!caller.isUser });
      if (!mv.ok) return { error: mv.error };
      memMb = mv.mb;
    }
    if (task) { if (memMb === null) delete task.memoryMb; else task.memoryMb = memMb; }
    const visNames = new Set(M.visibleJobs([...this.jobs.values()], caller).map((j) => j.name));
    const { name, renamed } = M.resolveName(spec.name, visNames, { mask: (t) => this._agentWords(t) });   // r7: the belt on the WHOLE name, then the cut
    const job = {
      id: rid(), kind: spec.kind || 'task', name, note: spec.note || '',
      cmd: spec.cmd, envFrom: spec.envFrom || [], restart: spec.restart || 'on-failure',
      health: spec.health || null, ports: spec.ports || [], publish: !!spec.publish,
      singleInstance: spec.singleInstance !== false, timeoutMs: spec.timeoutMs || null,
      untilOutput: spec.untilOutput || null, stdinOpen: !!spec.stdinOpen, notifyUser: M.notifyUserOf(spec), // lane job-notify-user: the one reader
      notify: spec.notify === 'on' || spec.notify === 'off' ? spec.notify : undefined, // owner auto-notify override; undefined = inherit group/global
      notifyOk: !!spec.notifyOk, // scheduled successes opt INTO events+notify (quiet-success is only the default)
      schedule: spec.schedule || null, catchUp: spec.catchUp || 'once', action: M.storedAction(spec.action),
      context: spec.context || null, interaction: { pending: null, answers: [] },
      owner: spec.owner, access: spec.access || { view: 'group', control: 'session' },
      stopWithOwner: !!spec.stopWithOwner, desiredUp: true,
      state: spec.kind === 'cron' ? 'scheduled' : 'starting', proc: null, supervise: { consecutiveFails: 0, parkedAt: null },
      runs: [], createdAt: now(),
      ...(memMb !== null && !task ? { memoryMb: memMb } : {}),
    };
    this.jobs.set(job.id, job);
    if (job.kind !== 'cron') {
      try { this._spawn(job, 'manual'); } catch (e) { job.state = 'failed'; this._touch(job); return { error: `spawn failed: ${e.message}`, job: this.snapshot(job, { author: true }) }; }
    } else { job.nextFireAt = M.nextFire(job.schedule, now()); this._touch(job); }
    this._save();
    return { job: this.snapshot(job, { author: true }), renamed };   // the creator IS the author (r4: the record's own name — r7: belted at create)
  }
  stop(job, { force } = {}) {
    if (this.readOnly) return { error: 'registry is read-only in this process' };
    if (job.kind === 'service' || job.kind === 'cron') { job.desiredUp = false; }
    job._stopRequested = true;
    if (job.kind === 'service') this._teardownPublish(job);
    const run = job.runs && job.runs[job.runs.length - 1];
    // round 10: A STOP STEP IS IDEMPOTENT — pressed again while its SIGTERM's grace runs, it delivers nothing and says so (round 9
    // and before signalled the whole group again on every press: a cleanup cut off by its second SIGTERM, code 143)
    if (!force && job._termAt && this._runLive(job, run)) {
      this._touch(job); this._save();
      return { ok: true, hadProc: true, already: `already stopping (${Math.max(0, Math.ceil((job._termAt + this._killStepMs() - now()) / 1000))} s left)` };
    }
    const scope = run && !run.endedAt ? this._runScope(job, run) : null; // round 4: the cgroup rung's group is its scope
    const hadProc = force && scope ? this._escalate(job, scope, undefined, run) : force ? this._killGroup(job, 'SIGKILL') : this._termRun(job, run); // round 7: its intent first
    if (force) job._stopForce = true; else if (hadProc) job._termAt = now(); // round 5: the stop's own clock (the sweep keeps it)
    // the kill step, a grace on — the scope's too when its wrapper is gone (the sweep reaps such a scope first); round 6: bound
    // to THIS run — it never reaches a run started again inside the grace
    if ((hadProc || scope) && !force && this._runLive(job, run)) this._armKillStep(job, run, scope);
    // round 5 (the ruling): a service whose last run ENDED keeping what it left — its stop stops them, said
    // round 8: the person's word ends a doubt — round 9: after its clear (ONE walk of /proc per decision: a doubt over what it
    // kept is ended by the walk just made, never a second)
    if (run && run.endedAt) this._clearKept(job, run).then(() => { if (this._runDoubt(job, run)) return this._stopDoubt(job, run); }).catch(() => { });
    if (!hadProc && job.kind === 'cron') { job.state = 'down'; }
    this._touch(job);
    this._save();
    return { ok: true, hadProc };
  }
  start(job) {
    if (this.readOnly) return { error: 'registry is read-only in this process' };
    job.desiredUp = true;
    job.supervise = { consecutiveFails: 0, parkedAt: null };
    // lane jobs-memory-bound: the owner acted — a cron parked for its child's out-of-memory ends counts its child afresh
    for (const k of job.kind === 'cron' ? this.jobs.values() : []) if (k.cronParent === job.id) k.supervise = { consecutiveFails: 0, parkedAt: null };
    if (job.kind === 'cron') {
      const vet = M.vetSpec(job); // B-f8c7: a cron spawns only at its next fire — reviving one the vet refuses answers NOW
      if (!vet.ok) { this._refuseRun(job, vet, 'manual'); return { error: vet.error }; }
      job.state = 'scheduled'; job.nextFireAt = M.nextFire(job.schedule, now()); this._touch(job); this._save(); return { ok: true }; }
    // a refusal names the job by ID (lane-redact verify r7): the panel toasts it and the device's toast history (the For-you
    // Notifications tab) keeps every toast — `<name> is already running` outlived the job's "Clear content…" there
    if (['up', 'starting'].includes(job.state)) return { error: `${job.id} is already running` }; // a live process is never re-judged into 'failed'
    // round 5: a service's run never starts beside what its last run left — round 6: EVERY start of a service goes through
    // _startAfter (it starts at once when nothing is pending; a deferred reap, a kept process, a scope never seen empty is awaited)
    if (job.kind === 'service') {
      const vet = M.vetSpec(job);
      if (!vet.ok) { this._refuseRun(job, vet, 'manual'); return { error: vet.error }; }
      if (this._besideLive(job, 'manual')) return { error: `${job.id}'s last run is still running — stop it first` }; // round 7
      const last = job.runs && job.runs[job.runs.length - 1]; // round 8: its doubt checked first, never beside it
      try { this._startAfter(job, 'manual', () => job.desiredUp && !['up', 'starting'].includes(job.state)); } catch (e) { return { error: e.message }; }
      this._save();
      if (['up', 'starting'].includes(job.state)) return { ok: true };
      // round 10: A START THAT WILL NOT HAPPEN IS ANSWERED BY ITS REFUSAL — the decision's one walk ran in this tick: a cut one is
      // the doubt's door, in the words its journal line and its For-you notice carry (round 9 answered «ok — it starts only once
      // it is», and nothing walked again: the service stayed down for good)
      const cut = this._cutOf(last), doubt = this._runDoubt(job, last);
      if (cut) return { error: this._doorWords(job, last, cut) };
      return { ok: true, after: doubt ? `its previous run cannot be proven gone (${doubt}) — it starts if that is proven within ${this._graceMs() / 1000} s, else it is not started (its events say)` : 'what its last run left running is stopped first' };
    }
    try { this._spawn(job, 'manual'); } catch (e) { return { error: e.message }; } // B-f8c7: the run-time vet's refusal is an answer
    this._save();
    return { ok: true };
  }
  /** THE BOUND, CHANGED (lane jobs-memory-bound) — from the job's properties (the owner) or `vibespace-job memory` (its owner
   *  conversation): a per-job value, or null / 'inherit' = back to THE LADDER. It applies from the NEXT run (the running
   *  process keeps the bound it started under); a cron's lands on its task (and its child) — the fire runs that. */
  setMemory(job, raw, { byUser = false } = {}) {
    if (this.readOnly) return { error: 'registry is read-only in this process' };
    let mb = null;
    if (raw !== null && raw !== undefined && raw !== '' && raw !== 'inherit') {
      const v = M.memoryValueVerdict(raw, { byUser });
      if (!v.ok) return { error: v.error };
      mb = v.mb;
    }
    const task = job.kind === 'cron' && job.action && job.action.type === 'spawn-task' && job.action.task ? job.action.task : null;
    const targets = task ? [task, ...[...this.jobs.values()].filter((k) => k.cronParent === job.id)] : [job];
    const cur = targets[0].memoryMb === undefined || targets[0].memoryMb === null ? null : targets[0].memoryMb;
    const said = (e) => ({ memoryMb: e.mb, memoryAskedMb: e.askedMb !== undefined ? e.askedMb : e.mb, memorySource: e.source, memoryCap: e.cap || null });
    if (cur === mb) return { ok: true, unchanged: true, ...said(M.memoryMbOf(targets[0], this._memoryCtx())) }; // nothing changes, nothing is written
    for (const t of targets) { if (mb === null) delete t.memoryMb; else t.memoryMb = mb; }
    const eff = M.memoryMbOf(targets[0], this._memoryCtx());
    const capped = eff.cap ? ` — capped by ${M.capWords(eff.cap)} (asked ${eff.askedMb ? M.memoryWords(eff.askedMb) : 'unbounded'})` : '';
    this._touch(job, { what: `memory bound ${mb === null ? 'back to the default' : 'set'}: ${eff.mb ? M.memoryWords(eff.mb) : 'unbounded'}${capped} (${eff.source}; from its next run)` });
    this._save();
    return { ok: true, ...said(eff) };
  }
  rm(job, { stop, orphan } = {}) {
    if (this.readOnly) return { error: 'registry is read-only in this process' };
    const alive = this._verifyAlive(this._readStamp(job));
    if (alive && !stop && !orphan) return { error: `${job.id} is still running — vibespace-job rm ${job.id} --stop (kill then remove), or --orphan to abandon the live process (tracked nowhere after that)` };
    if (alive && stop) this.stop(job, { force: false });
    if (alive && orphan) this.d.log(`[jobs] ${job.id} ORPHANED by request — live pid abandoned`);
    const last = job.runs && job.runs[job.runs.length - 1];
    if (last && last.endedAt) this._clearKept(job, last).catch(() => { }); // round 5: a removed service keeps nothing running
    this.jobs.delete(job.id); this._dirty = true; this._save();
    try { this.d.resolveJobAsk && this.d.resolveJobAsk(job.id, { onlyAsk: false }); } catch { } // removed job leaves no orphan inbox items
    try { this.d.broadcast('jobs-updated', { id: job.id, removed: true }); } catch { }
    return { ok: true };
  }
  progress(job, text) { job.progress = String(text).slice(0, 300); this._touch(job); return { ok: true }; }
  ask(job, panel) {
    const v = M.validatePanel(panel);
    if (!v.ok) return { error: v.error };
    // r6 D-F5: the panel's identity only grows (persisted `interaction.seq`) — never 1 again after an answer or an expiry
    job.interaction = job.interaction || { pending: null, answers: [] };
    const version = M.nextInteractionSeq(job.interaction);
    job.interaction.seq = version;
    job.interaction.pending = { panel, version, postedAt: now(), timeoutS: panel.timeoutS || 1800 };
    if (job.kind === 'task' && ['up', 'starting'].includes(job.state)) job.state = 'awaiting-user';
    this._touch(job, { what: 'needs your input — open its panel', verb: 'answers' });
    this._forYou(job, M.forYouCopy(job, 'ask'));
    this._notifyOwner(job, { what: 'posted an interaction panel and is awaiting an answer' });
    this._save();
    return { ok: true, version };
  }
  answerPanel(job, answers) { // user-side (routes verify user auth)
    const p = job.interaction && job.interaction.pending;
    // r6 D-F5: the answer names its panel — missing or another panel's ⇒ refused by name, nothing recorded
    const vv = M.answerVersionVerdict(p, answers);
    if (!vv.ok) return { error: vv.error, code: vv.code, ...(p ? { version: p.version } : {}) };
    const v = M.validateAnswers(p.panel, answers);
    if (!v.ok) return { error: v.error };
    job.interaction.answers = job.interaction.answers || [];
    const rec = { ...answers, version: p.version, ts: now() }; // `version` = the panel's own (never the request's spelling)
    job.interaction.answers.push(rec);
    if (job.interaction.answers.length > 50) job.interaction.answers.splice(0, job.interaction.answers.length - 50);
    job.interaction.pending = null;
    if (job.state === 'awaiting-user') job.state = 'up';
    if (job.stdinOpen) { // mirror to the wrapper's answers tail file
      const run = job.runs && job.runs[job.runs.length - 1];
      if (run) { try { fs.appendFileSync(path.join(this._ctlDir(job, run.startedAt), 'answers.jsonl'), JSON.stringify(rec) + '\n'); } catch { } }
    }
    this._resolveAns(job);
    try { this.d.resolveJobAsk && this.d.resolveJobAsk(job.id); } catch { } // clear the needs-your-input inbox entry (owner report: it lingered after submit)
    this._touch(job, { what: 'the user answered its panel', verb: 'answers' });
    this._notifyOwner(job, { what: 'the user answered its interaction panel — vibespace-job answers ' + job.id });
    this._save();
    return { ok: true };
  }
  _resolveAns(job) {
    const ws = this.ansWaiters.get(job.id);
    if (ws) { this.ansWaiters.delete(job.id); for (const w of ws) { clearTimeout(w.timer); try { w.resolve(); } catch { } } }
  }
  async waitFor(map, jobId, ms) {
    ms = Math.min(Math.max(ms || 0, 0), 600_000); // server clamp
    if (!ms) return;
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      timer.unref?.();
      const list = map.get(jobId) || [];
      if (list.length >= 8) { clearTimeout(timer); return resolve(); } // waiter cap per job
      list.push({ resolve, timer });
      map.set(jobId, list);
    });
  }
  snapshot(job, { tail = 0, author = false } = {}) {
    const run = job.runs && job.runs[job.runs.length - 1];
    const out = {
      // the NAME: whole for its AUTHOR (the agent route's owner lineage, the create echo), belted for every other reader — the
      // Jobs panel's card title, the ask window's title, another lineage (r4, claim r3-1 FINDING 3; the record keeps it raw)
      id: job.id, kind: job.kind, name: author || !job.name ? job.name : this.labelOf(job), note: job.note, state: job.state, publishedUrl: job.publishedUrl || null,
      // lane job-notice-dedupe: the down record is the state while the service runs (a re-publish in flight does not hide it);
      // a stopped service has none (teardown ends the episode)
      publishState: job.publishDown && job.publish && !job.publishedUrl ? 'failed' : job._publish ? job._publish.state : null, publishError: (job.publishDown && job.publishDown.error) || null, lastPublicUrl: job.lastPublicUrl || null,
      publishCause: (job.publishDown && job.publishDown.cause) || null, publishWhy: JN.whyOf(job.publishDown), publishSince: (job.publishDown && job.publishDown.sinceAt) || null, publishAttempts: (job.publishDown && job.publishDown.attempts) || 0,
      desiredUp: job.desiredUp, progress: job.progress || null, ports: job.ports, publish: job.publish,
      schedule: job.schedule, nextFireAt: job.nextFireAt || null, context: job.context || null,
      owner: { createdBy: job.owner?.createdBy, groups: job.owner?.groupsSnapshot || [] },
      access: job.access, createdAt: job.createdAt, cronParent: job.cronParent || null,
      notify: job.notify || 'inherit', lastNotify: job.lastNotify || null, subscribersCount: (job.subscribers || []).length,
      notifyLog: (job.notifyLog || []).slice(-8),
      forYouLast: job.forYouLast || null,   // r4: each For-you copy's LAST verdict (past the journal's window; a cron's carries its run's)
      // full creation parameters (2.347.0, owner ask: agents must be able to
      // re-inspect what they registered) — env VALUES stay out (names only)
      cmd: job.cmd ? { argv: job.cmd.argv, cwd: job.cmd.cwd || null, envKeys: Object.keys(job.cmd.env || {}) } : null,
      // a cron's action TYPE (an enum: 'notify' | 'spawn-task' | null) — the panel words what --notify-user does per kind
      // (lane job-notify-user r2: the snapshot carried no action, so a notify cron read «when each run ends»)
      actionType: (job.action && typeof job.action.type === 'string' && job.action.type) || null,
      // a notify cron's --text, bounded (lane job-notify-user r3: show / poll print the reminder — the snapshot kept none, so an
      // agent whose message was cut could not recover it): WHOLE for its AUTHOR (`author` — the agent route's owner lineage),
      // belted for everyone else (the panel's frames, another lineage's show — and a line piece there, M.agentJobView)
      actionText: job.action && job.action.type === 'notify' && typeof job.action.text === 'string' ? (author ? job.action.text : this._agentWords(job.action.text)).slice(0, 500) : null,
      // a cron PARENT's run carries its own timeout / until inside the embedded task (verdict r1 F5: show printed «—»)
      envFrom: job.envFrom || [], restart: job.restart || null, timeoutMs: job.timeoutMs || M.spawnTaskOf(job).timeoutMs || null,
      // B-644d: a cron PARENT's fires run its embedded spawn-task, whose notifyOk the child inherits — the parent's own
      // field is never read (`vibespace-job run --at … --notify-ok` showed notifyOk=false for fires that notify);
      // notifyUser is the one reader's answer (lane job-notify-user: `show` printed nothing about the For-you copy)
      untilOutput: job.untilOutput || M.spawnTaskOf(job).untilOutput || null, notifyUser: M.notifyUserOf(job), notifyOk: !!job.notifyOk || !!(job.action && job.action.type === 'spawn-task' && job.action.task && job.action.task.notifyOk),
      catchUp: job.catchUp || null, stopWithOwner: !!job.stopWithOwner, singleInstance: job.singleInstance !== false,
      // lane jobs-memory-bound: THE LADDER's answer now (a cron's: its task's), the rung its latest run measured, the park's
      // reason and the out-of-memory ends counted toward it
      ...(() => { const m = M.memoryMbOf(job.kind === 'cron' && job.action && job.action.task ? job.action.task : job, this._memoryCtx()); return { memoryMb: m.mb, memoryAskedMb: m.askedMb !== undefined ? m.askedMb : m.mb, memorySource: m.source, memoryCap: m.cap || null }; })(), // round 4: the NEXT run's (a live run's own rides its memoryBound.cap)
      memoryBound: run && run.memoryBound ? { ...run.memoryBound, words: M.boundWords(run.memoryBound) } : null, oomEnds: (job.supervise && job.supervise.oomEnds) || 0, // round 5: the record's words (an unbounded scope is never «0 MB»)
      parkedFor: (job.supervise && job.supervise.parkedAt && job.supervise.parkedFor) || null,
      run: run ? { startedAt: run.startedAt, endedAt: run.endedAt || null, exit: run.exit ?? null, cause: run.cause || null, trigger: run.trigger, lastLine: run.lastLine || '', ...(run.left ? { left: { n: run.left.n, kept: !!run.left.kept, force: !!run.left.force, cleared: run.left.cleared || 0, gone: run.left.gone || 0, escaped: run.left.escaped || 0, short: run.left.short || 0 } } : {}), ...(M.runEndWords(run) ? { endWords: M.runEndWords(run) } : {}) } : null, // round 5: what it left running / the kill we made
      runsCount: (job.runs || []).length,
      // triage (§13): the server computes the acknowledgement over the FULL
      // record (the journal above is truncated to 8) — clients read, never derive
      ack: M.ackState(job),
      pendingPanel: !!(job.interaction && job.interaction.pending),
      answers: (job.interaction && job.interaction.answers || []).slice(-5),
      // "Clear content…" (2026-09-28): the clear's stamp — every surface words the name from it
      clearedAt: job.clearedAt || null, clearedBy: job.clearedBy || null,
    };
    // a CLEARED job serves no log tail for a run the clear covered: that run's log file is the process's
    // own output (kept like a transcript until the 14-day GC), but no surface shows the words the owner
    // cleared — and it SAYS it withheld them (`logWithheld`: "(no log)" read as "there is none", verify r2).
    // A run that STARTED after the clear is new output and is served (a cron cleared once keeps its logs).
    if (tail && run && job.clearedAt && !((run.startedAt || 0) > job.clearedAt)) { out.logTail = ''; out.logWithheld = true; }
    else if (tail && run) {
      try {
        const logPath = path.join(this._ctlDir(job, run.startedAt), 'current.log');
        const st = fs.statSync(logPath);
        const len = Math.min(st.size, 16384);
        const fd = fs.openSync(logPath, 'r');
        const buf = Buffer.alloc(len);
        fs.readSync(fd, buf, 0, len, st.size - len); fs.closeSync(fd);
        out.logTail = this._redact(buf.toString('utf-8')).split('\n').slice(-tail).join('\n');
      } catch { out.logTail = ''; }
    }
    return out;
  }
  /** the last non-empty line of a run's log (≤200 cp, secret-redacted);
   *  '' when the log is missing or empty. Reads only the log's last 16 KiB. */
  _lastLogLine(job, run) {
    try {
      const logPath = path.join(this._ctlDir(job, run.startedAt), 'current.log');
      const st = fs.statSync(logPath);
      const len = Math.min(st.size, 16384);
      if (!len) return '';
      const fd = fs.openSync(logPath, 'r');
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, st.size - len); fs.closeSync(fd);
      return M.lastLineOf(this._redact(buf.toString('utf-8')), 200);
    } catch { return ''; }
  }
  _redact(text) { // literal-redact known secret values (§7)
    try {
      const store = JSON.parse(fs.readFileSync(path.join(this.d.dataDir, 'job-secrets.json'), 'utf-8'));
      for (const v of Object.values(store)) if (v && String(v).length >= 6) text = text.split(String(v)).join('[secret]');
    } catch { }
    return text;
  }
  // injection surfaces (agent-routes): caller-filtered, budgeted in the model
  digestFor(caller, existingBytes) {
    const vis = M.visibleJobs([...this.jobs.values()], caller).filter((j) => j.state !== 'done' || now() - ((j.runs || [])[j.runs?.length - 1]?.endedAt || 0) < 86400e3);
    // r6 (accept-r5 confirmed 0): a RECORD never crosses into the renderer — each ROW is built here, its name the ONE accessor's
    // (labelOf belts the WHOLE name; the renderer cuts the label — the cut never precedes the mask). r5 spread the record
    // (`{ ...j, ageHint }`) and jobLine cut `j.name` to 24: another conversation's SessionStart context read a token's head raw
    const rows = vis.map((j) => ({ id: j.id, kind: j.kind, state: j.state, ageHint: this._ageHint(j), label: this.labelOf(j) }));
    return M.fitDigest(existingBytes, M.renderJobsDigest(rows), { count: vis.length });
  }
  updatesFor(caller, sinceTs) {
    const visIds = new Set(M.visibleJobs([...this.jobs.values()], caller).map((j) => j.id));
    const evs = this.events.filter((e) => e.ts > sinceTs && visIds.has(e.jobId)).map((e) => ({ id: e.jobId, name: e.name, what: e.what, verb: e.verb }));
    return { text: M.renderJobsUpdate(evs), lastTs: this.events.length ? this.events[this.events.length - 1].ts : sinceTs };
  }
  _ageHint(j) {
    const run = j.runs && j.runs[j.runs.length - 1];
    if (j.kind === 'cron' && j.nextFireAt) return 'next~' + this._hum(j.nextFireAt - now());
    if (run && !run.endedAt) return this._hum(now() - run.startedAt);
    if (run && run.endedAt) return this._hum(now() - run.endedAt) + ' ago';
    return '';
  }
  _hum(ms) { const m = Math.round(Math.abs(ms) / 60000); return m < 60 ? m + 'm' : m < 1440 ? Math.round(m / 60) + 'h' : Math.round(m / 1440) + 'd'; }
}

module.exports = { JobManager, ARCHIVE_CAP, ARCHIVE_SWEEP_MS, jobEnv, wrapperEnv, WRAPPER_ENV_KEEP, WRAPPER_PROTO, UPDATE_WINDOW_MS };
