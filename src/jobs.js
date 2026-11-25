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
const WRAPPER_HELD = new Set(['up', 'starting', 'awaiting-user']);   // B-c134 cure: a job state whose wrapper the engine holds (an «unverified» one is a previous boot's pid: never kept out)
const LOGS_SAY_AT_ONCE = 50;   // B-c330: a job-logs pass that removes this many run dirs or more is said at once (the steadier ones fold into a day's line)
const crypto = require('crypto');
const NAME_RULE_SAID = new Set(), NAME_BELT_SAID = { done: false };   // r366: the name rule's two journal lines, each said once (a name / the process)
const { withoutNoticeHead } = require('./notification-senders.js'); // lane notify-retry: a parked frame carries the ladder's head; the floor's digest is of the raw text
const textDigest = (t) => crypto.createHash('sha256').update(String(t)).digest('hex'); // a flood floor's memory of a text (verify r9)
const { spawn, execFile } = require('child_process');
const M = require('./job-model.js');
const { priorityArgv } = require('./spawn/line.js'); // PURE (B-460d): a job's wrapper starts with `nice -n 5` — the words of a start's priority
const DW = require('./delivery-wake.js');   // the manager design's piece 7: which deliveries owe an ENDED owner a wake (PURE)
const VJ = require('./vault-job.js'); // PURE (lane vault-job-road): a job's --vault values — the grammar, the verdict at every spawn, the fd plan, the frame
const JN = require('./job-notice.js'); // PURE (lane job-notice-dedupe): a published service's notice is a STATE CHANGE — the verdict over its down record
const { credentialEnvNames } = require('./harness-env.js'); // PURE: B-6be2 — the job door's credential strip, derived from the descriptors
const { withHandedMark } = require('./conversation-env.js'); // PURE: the computed mark a suite this job runs reads (B-ba47's follow-up)
const { list: harnessList } = require('./harnesses');
const { timedSync } = require('./timed-sync.js'); // PURE: the store-write clock (design 011 lane 1, store-timing)
const { applyClear, CLEARED_TEXT } = require('./record-clear.js'); // PURE: "Clear content…" (2026-09-28) — this engine holds the door (clearJobs)
const SR = require('./store-read.js'); // B-f276: THE STORE READ — a read that failed is no answer (never set aside, never «empty»)
const HOLD = require('./store-read-hold.js');   // B-f276 family unit 2 commit 3: the kept copies' question (copiesOf)
const NOTIFS_SHAPE = (v) => !!v && typeof v === 'object' && !Array.isArray(v);   // job-notifications.json: {conversationId: [notice, …]}
const asideOf = (file) => file + '.corrupt-' + now();   // the ONE set-aside name (the load's and the read again's — test-store-write-census ⑧ counts it once)
const READ_AGAIN_MS = 10_000;   // cure r1: a read again past this is said slow; the next try is armed before it is awaited
const STORE_SHAPE = (v) => Array.isArray(v) && v.every((j) => j != null);
const PARKED_NO_START = 'it ended out of memory and is parked — raise its bound (vibespace-job memory), then start it';   // B-cac2 r2: a park is never undone by an asked start   // jobs.json: a list of records (a null entry is torn)
// B-2204: a recovered skeleton is the person's alone — one the release wrote with view 'all' is read back owner-less, view 'session'
const skeletonAccess = (j) => { if (LS.isSkeleton(j)) { j.owner = {}; j.access = { view: 'session', control: 'session' }; } return j; };
const LS = require('./job-logs-sweep.js'); // lane job-logs-sweep: what a record no longer lists leaves data/job-logs after 14 days — every removal under job-logs off the main thread

// _-prefixed keys are runtime-only (raw tokens, cursors) — never persisted
const storeBytes = (obj) => JSON.stringify(obj, (k, v) => (k.startsWith('_') ? undefined : v), 1);
/** B-b14a: a promise bounded to `ms` — past it the answer is null (the read itself runs on; its answer is not used) */
const withinMs = (p, ms) => new Promise((resolve, reject) => { const t = setTimeout(() => resolve(null), ms); t.unref?.(); Promise.resolve(p).then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); }); });
function writeJsonAtomic(file, obj) {
  const tmp = file + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, storeBytes(obj));
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
/** THE RUN'S ENV (B-ba47's follow-up, 主开发 r979/r985): the owner's OWN words (`own`: the job's cmd.env, the heap it names) and
 *  the hub's additions (`handed`: its id, run, token, route, the vault plan's names, the bin PATH) over jobEnv's stripped base —
 *  marked VIBESPACE_HANDED with exactly what the hub added over the owner's words, so a suite the job runs drops those and keeps
 *  the owner's own. PURE over its inputs. */
function jobRunEnv({ own = {}, handed = {}, base = process.env } = {}) {
  return withHandedMark(jobEnv({ ...own, ...handed }, base), jobEnv(own, base), { familyToo: false });
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
// 3 (lane vault-job-road): a job's vault values ride the wrapper's fd 3 as ONE frame (src/vault-job.js) — the spec names them
const WRAPPER_PROTO = 3;
const JOB_CPU_WEIGHT = 33;   // B-f494: a lowered job's scope CPUWeight — nice +5's share of nice 0's (335 / 1024 × systemd's default 100)
// how long after the wrapper changed on disk a mismatch is still the update's window (its restart is on the way: 45 s
// measured on the owner's hub; an install + build bounded at minutes) — past it, the install itself is broken: a fault
const UPDATE_WINDOW_MS = 15 * 60 * 1000;
const WAKE_GRANT_LAND_MS = 20_000;   // lane lg-store-writes: the wake grant door's wait for its landing (off the loop), the writer's own bound
/** THE ORDER of the grant's door (主开发's must of 2026-11-20 08:50Z, round wpmw57sta): acts on ONE job's grant are ONE AT A TIME — a
 *  second act on a job whose act still waits for its landing is refused BY NAME before anything is applied (never applied on top of
 *  an unlanded value, never «already as asked» from one), and so is any act while the jobs file's last landing has not come within
 *  its bound (the storage behind: the common stalled case never enters the window) */
const WAKE_GRANT_BUSY = 'a change of this grant is still waiting for the storage — this one was not made; ask again once that one answers';
const WAKE_GRANT_BEHIND = 'the storage has not taken the last change of the jobs yet — nothing was changed; ask again once it answers';
const WAKE_GRANT_NOT_LANDED = 'the storage did not take it in time — nothing was changed (it was put back; if the storage takes it late, the panel shows what holds); ask again once it answers';
const now = () => Date.now();
const rid = () => 'jb-' + crypto.randomBytes(4).toString('hex');
// triage archive (design §13): newest ARCHIVE_CAP records kept; the sweep
// runs at boot and every ARCHIVE_SWEEP_MS on the engine's existing 5 s tick
const ARCHIVE_CAP = 2000;
const LOGS_REST_FACTOR = 10; // lane job-logs-sweep r2: a pass rests ≥ 10× its own time (the storage's duty ≤ ~9 %)
const LOGS_RETRY_MS = 300_000; // lane job-logs-sweep: a failed pass inside an open catch-up is retried after 5 min (a held remover, a storage that did not answer)
const LOGS_OWED_MAX = 5000; // lane job-logs-sweep: whole-dir removals owed after a held / failed batch, kept in memory at most
const ARCHIVE_SWEEP_MS = 5 * 60 * 1000;
// B-360d (the owner's hub on 2.369.413: two loop holds of 1.2 and 1.4 s at the stamp read, from the collection pass — a synchronous
// open blocked on the data folder's mount): every file ask of the collection pass runs OFF the loop, ONE at a time, the whole pass
// bounded by this; what does not answer in it is UNKNOWN, and nothing is collected on an unknown
const GC_FILES_MS = 10000;
const GC_SAY_AGAIN_MS = 86400e3;   // B-360d r821 (3): a pass that cannot read says so again once a day (a long outage stays in the journal)
// A STOP'S GRACE and THE REAP'S BOUND (lane jobs-memory-bound, acceptance round 5): a stop's SIGTERM, then STOP_GRACE_MS before
// the kill step — the owner's stop, a timeout, an until-marker and a stop the sweep honors alike (the tick never cuts it short);
// a read of a scope's cgroup.procs answers within REAP_READ_MS or the run is judged without it (a busy threadpool never holds
// a judgment — the reap is retried by a later tick). Round 6: A REAP THAT DID NOT FINISH IS ALWAYS RETRIED — whoever started it
// (the boot, the sweep, a start), by every tick whatever its job's state, REAP_TRIES times; then said once and dropped
const STOP_GRACE_MS = 10_000;
const URL_GRACE_MS = 2 * 60 * 1000, URL_CHECK_TRIES = 3, URL_CHECK_EVERY_MS = 30_000, URL_LOOK_MS = 5000, URL_RELOOK_MS = 15_000, URL_ROUNDS = 3; // B-74f5: a URL change is judged after a restart's grace (the hub's, the job's own, the vault unlock's re-publish) by looks at both addresses (≤ 3, 30 s apart, 5 s each); «the old one failed» needs two looks 15 s apart; a change not said is looked at again at the next publish read — ≤ 3 checks of one pair in a run (conclusive or not), then it leaves the record
const REAP_READ_MS = 2000;
const REAP_TRIES = 12;
// THE LADDER's last rung (round 7): a wrapper still there WEDGE_MS after its scope was killed is killed with its group
const WEDGE_MS = 3000;
// B-2c5c, round wwa7r2uc1 (THE MAIN DOOR): the words of a stop refused because the job's main process IS this hub
const HUB_MAIN_WORDS = 'this job is the running VibeSpace: it is not stopped here';
// B-2c5c (主开发 01:57Z): the errnos of a scope list that no longer EXISTS — read as an EMPTY scope (data/bin/job-wrapper.js holds the same set)
const GONE_LIST = new Set(['ENOENT', 'ENOTDIR', 'ENODEV']);
const pause = (ms) => new Promise((res) => setTimeout(res, ms));
// B-6721: the held kinds a stash entry is OWED A WAKE for (wakeOwed): the conversation was NOT RUNNING, or the 30 s floor held it —
// never 'not-reachable' (an agent alive that did not take it: the retry park's bound already spent; its may-have-landed copies too)
const WAKE_OWED_KINDS = ['not-running', 'rate-floor', 'machine-away'];   // B-2566's remainder: a paired machine that cannot be reached — handed over once it replies
/** the typed held record for a stash entry, from the ladder's own answer */
function heldOf(r, reason) {
  const kind = M.heldKind(r, reason);
  const out = { kind };
  if (r && r.phase) out.phase = String(r.phase);                       // lane notify-retry: the attempt's facts ride the held record
  if (r && (r.busy === true || r.busy === false)) out.busy = r.busy;
  if (kind === 'machine-away' && r) { if (r.hostId) out.hostId = String(r.hostId).slice(0, 80); if (Number(r.since) > 0) out.since = Number(r.since); }   // B-2566: whose machine, silent since when
  if (kind === 'spend-cap' && r) {
    if (r.why) out.why = String(r.why);
    if (r.identity && (r.identity.name || r.identity.key)) out.identity = String(r.identity.name || r.identity.key);
    if (Number.isFinite(Number(r.cap))) out.cap = Number(r.cap);
    if (Number(r.retryAfter) > 0) out.retryAfter = Number(r.retryAfter);
    if (r.capUnset === true) out.capUnset = true;   // B-0a33 (3): an empty cap, said as itself (never «ceiling (0)»)
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
    // B-7ca1 (its read r2, S1): a hub started INSIDE a job inherited that job's run mark — it never hands it on (a daemon the hub
    // double-forks, re-parented outside the job's group, would read as that run's escapee and end with the job's stop).
    // B-2c5c (5): nor ANY name that job's spawn handed it — its id (VIBESPACE_JOB_ID: a vibespace-job with no id speaks as that
    // job), its bearer (VIBESPACE_JOB_TOKEN), its directory: every child the hub starts on its OWN env (the spawn-env census's
    // raw rows: a probe, a module's default when its caller hands none) took them. The builders (agentEnv / daemonEnv / serviceEnv / jobEnv / wrapperEnv)
    // drop every VIBESPACE_* outside their keep sets, so no conversation took them. The hub reads none of them (its own knobs are
    // VIBESPACE_JOBS_*, plural); each job it starts is handed its own at its spawn
    // r2271: the drop itself now runs at the hub's BOOT, in the one act that drops what a parent handed (src/server/throwaway-root.js
    // dropHandedAtBoot, called by src/server/runtime-boot.js before this engine or any child exists)
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
    // lane job-logs-sweep: THE CATCH-UP's record ({catchUp, last}) — read by the first pass's worker (never on this thread),
    // written through the store writer (paced); null = not read yet. _logsRm = THE remover (src/job-logs-sweep.js), made on use
    this.logsSweepFile = path.join(deps.dataDir, 'jobs-logs-sweep.json');
    this._logsState = null; this._logsRm = null; this._logsPassP = null; this._logsGapT = null; this._logsStopped = false;
    this._logsGone = new Map();   // id → the ✕'s removal in flight (deleted when it settles) — logsGone() answers the person after the disk
    // round 2 law 1: a records read that FAILED without leaving a set-aside file (an I/O error, a rename that failed) — the pass
    // removes nothing those records could name in THIS process; the worker re-reads the file at every pass (a read that then
    // succeeds keeps its records in the keep set by itself). The durable fact is the set-aside file (worker: setAside).
    this._logsUnread = { store: null, archive: null };
    // round 4 §1: a failed read with NOTHING set aside — {error, at} until the store's note is ON DISK: THE PASS HOLDS meanwhile (before
    // the owed removals and before the walk), for the life of this process if the note never lands; the remover's child writes it
    this._logsNoteOwed = { store: null, archive: null }; this._logsNoteP = null; this._logsUnnotedSaid = new Set();
    // B-f276: a store whose read FAILED (or whose torn bytes could not be set aside) — {code, why, at} while unread; nothing writes it
    this._unread = { store: null, archive: null }; this._unreadT = { store: null, archive: null }; this._unreadTries = { store: 0, archive: 0 }; this._unreadSaid = { store: false, archive: false }; this._unreadStopped = false;
    // cure r1 (主开发 00:40Z): one read again in flight a store, bounded; the note THIS process wrote and the items its hold filed — lifted when a read answers
    this._unreadP = { store: null, archive: null }; this._unreadSlow = { store: 0, archive: 0 }; this._unreadNoteAt = { store: null, archive: null }; this._unreadLiftedOwed = { store: null, archive: null }; this._unreadItems = { store: [], archive: [] };   // cure 2: _unreadLiftedOwed — a failure's note still being written when a read again ended it
    this._unreadMissingAt = { store: 0, archive: 0 }; this._unreadGoneOwed = { store: null, archive: null };   // cure 3: «missing» read once more; a gone failure's note
    this._logsSaidNow = new Set();   // set-aside files whose item was filed in this process, merged into the record's `heldSaid`
    this._logsHeldSaid = '';         // the journal's last HELD line (said once per process per set of files)
    this._logsOwed = new Set();   // ids whose whole-dir removal the storage did not do (held / failed) — re-sent before every pass; ≤ LOGS_OWED_MAX, a restart forgets them (the law's pass takes them 14 days after their newest file)
    this.lockFile = path.join(deps.dataDir, 'jobs.lock');
    // TRIAGE ARCHIVE (design §13): terminal one-shots leave jobs.json for
    // this append-only array (newest first, capped at ARCHIVE_CAP). Loaded
    // LAZILY — the boot sweep and the first read-through both go through
    // _loadArchive(); nothing else touches the file.
    this.archiveFile = path.join(deps.dataDir, 'jobs-archive.json');
    this.archive = null;          // null = not loaded yet
    // B-0248 step 3 (lane bl-loop-b, 主开发 r1478/r1506): the archive goes to THE STORE WRITER — `_archivePending` is the one handed and
    // not landed yet (the BUILDERS' base: the next sweep, a clear, a removal); `archive` is what LANDED (every reader's)
    this._archivePending = null; this._archiveSeq = 0; this._archiveLandedSeq = 0; this._archiveHandedIds = new Set(); this._archiveTakingOut = new Set(); this._archiveDisarmed = false; this._archiveOwedSaid = false;
    this._lastArchiveSweep = 0;   // the 5-min cadence rides the 5 s _sweep tick — no second timer
    this._sweepRun = null; this._sweepSkips = 0; // ONE JUDGE PER RUN END (round 5): a pass in flight is never entered twice
    this._reapLater = new Map();  // run → {job, tries}: a reap that did not finish (round 6: whoever started it) — retried by every tick
    this.jobs = new Map();
    this._grantActs = new Map();   // job id → { act, on }: the ONE act waiting on that job's grant for its landing (the door's order — one at a time; the judge reads a SET in it as not yet made)
    this.readOnly = false;
    this.ready = false;
    this.events = [];            // ring of {ts, jobId, name, what, verb, alarm?} for injection — read ADDRESSED (updatesFor)
    this.pendingNotifs = new Map(); // conversationId → [{jobId, jobName, text, ts, urgency}] — OFFLINE stash, drained at resume injection
    // the B-f276 remainder, store (5) cure (主开发 02:33Z (2)): notices the file gave while the job records were HELD (none to judge a clear
    // by) — they wait for the records' first whole read (never delivered with a cleared job's old words); in memory, never in the file
    this._unjudged = new WeakSet();
    // B-54b7 (主开发 r519, shape B): a stash copy this store TOOK from the delivery ladder (a fall, the judge's held line) → { go: the step
    // that lets the ladder's copy leave msg-retry.json (null until the ladder hands it), held: taken while job-notifications.json was held }.
    // A copy taken while held is invisible to every delivery door until its OWN step ran — at the lift's landing, never at the lift's start
    // (one deliverable copy at any instant); its leaving the stash first (the cap, a drop) runs the step at once
    this._unlanded = new Map();
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
  /** 主开发 r3115 (2): A REMOVER NEVER REMOVES WHAT A KEPT COPY OF TORN BYTES STILL NAMES: does a kept copy of jobs.json's torn bytes still name job `id`? (from memory; unknown ⇒ yes) — the browser
   *  keeper's release (browser-job-principal jobRunningIn) and the vault-job row's prune (vault-job-door memberWith) ask it first. The
   *  copies are read at the FIRST ask (not at the start: the engine's start reads nothing more — until they are read, every id is named) */
  namedByCopy(id) { return this._copies().names(String(id)); }
  /** read the kept copies now (off the loop) — the vault-job door asks it when it files a card, so the person's press is judged by them */
  readCopies() { return this._copies().warm(); }   // (round wxzvih2as: read once if never read; round wjgchwl6a (4): a promise again, settled once the read in flight ends)
  _copies() { return this.__copies || (this.__copies = HOLD.copiesOf({ file: this.file, prefix: path.basename(asideOf(this.file)).replace(/\d+$/, ''), log: (m) => { try { this.d.log(m); } catch { } } })); }
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
      this.announceOwedWakes();   // B-6721: what a stopped hub left owed a wake — the stash view arms each one's chain
      // B-ef97: the recovered skeletons, on disk before anything else runs — not landed at the bound, _onDisk SAYS it once and the
      // jobs start as the release starts them (主开发 2026-11-19 09:18Z: a failing disk must not also stop a person's jobs)
      if (this._skeletonsOwed) { this._skeletonsOwed = false; this._save({ storeOnly: true }); this._onDisk(this.file, 'the recovered skeletons'); }   // B-ef97: the recovered skeletons, on disk before anything else runs — jobs.json ALONE (a notifications file that did not load is not written over here)
      this._bootAt = now(); // this server generation's start: a run begun before it was an older generation's (update window)
      this._adoptAndReplay();
      this._goneSaid = new Set(); this._keepOutOff = PI.keepOut('jobs', () => this._wrappersHeld());   // B-c134 cure (MUST A): no stop's walk enters another job's wrapper
      // boot sweep (triage §13 rule 5): housekeeping happens as soon as the
      // store is trustworthy again, isolated like every other init step
      try { this.archiveSweep({ why: 'boot' }); } catch (e) { this.d.log('[jobs] archive sweep at boot failed:', e.message); }
      const t1 = setInterval(() => this._sweep().catch((e) => this.d.log('[jobs] sweep failed:', e.message)), 5000);
      const t2 = setInterval(() => this._cronTick().catch((e) => this.d.log('[jobs] cron tick failed:', e.message)), 30_000);
      const t3 = setInterval(() => this._gc().catch((e) => this.d.log('[jobs] gc failed:', e.message)), 3600_000);
      const t4 = setInterval(() => { if (this._dirty) this._save({ paced: true }); }, 2000);   // lane lg-store-writes U4: the 2 s coalesce hands the bytes to the writer PACED
      // lane job-logs-sweep: ONE pass soon after the boot (a hub that restarts more often than hourly never reached its hourly gc)
      const t5 = setTimeout(() => this.sweepLogs({ why: 'boot' }).catch((e) => this.d.log('[jobs] job-logs pass failed:', e.message)), this._logsCfg().bootDelayMs);
      const t6 = setInterval(() => this._sampleUse().catch((e) => this.d.log('[jobs] memory sample failed:', e.message)), M.BUDGET.sampleMs);   // B-b14a: on an instance with a limit only
      for (const t of [t1, t2, t3, t4, t5, t6]) { t.unref?.(); this._timers.push(t); }
      this._cronTick().catch(() => { });
      this.ready = true;
    } catch (e) {
      // engine failure must be LOUD but never block the server (§5 failure isolation)
      this.initError = e.message;
      this.d.log('[jobs] ENGINE INIT FAILED (subsystem down until next boot):', e.message);
      this._forYou(null, M.forYouCopy(null, 'engine-failed', { error: e.message }));
    }
  }
  shutdown() { for (const t of this._urlTimers || []) clearTimeout(t); this._urlTimers = new Set(); /* B-74f5 r3: the URL checks end with the engine */ this._archiveDisarmed = true; /* B-0248 step 3: an ended engine's archive steps do nothing (the next one reads the files) */ if (this._notifsUnread && this.pendingNotifs.size) this.d.log(`[jobs] job-notifications.json is still held at the engine's end — ${[...this.pendingNotifs.values()].reduce((k, l) => k + l.length, 0)} notice(s) that arrived meanwhile are NOT written (the file is kept as it is)`);   // its read r1 (M2): said
    if (this._keepOutOff) { this._keepOutOff(); this._keepOutOff = null; } this._unreadStopped = true; for (const w of ['store', 'archive']) { if (this._unreadT[w]) clearTimeout(this._unreadT[w]); this._unreadT[w] = null; } if (this._notifsT) { clearTimeout(this._notifsT); this._notifsT = null; } this._logsNoteAtExit(); try { if (this._dirty) this._save({ paced: true }); } catch { } this._unlockAfterStore(); this._logsStop(); }
  /** THE LOCK GOES AFTER THE STORE LANDS (lane lg-store-writes U4): the exit's store bytes are the writer's (its exit flush, after
   *  this) — the lock file is removed once jobs.json holds them, never before (an engine taking the lock in between would read
   *  the older store). A store with nothing owed releases now. AT THE HUB'S EXIT a write that FAILS keeps the lock — the next
   *  engine sees its pid dead and takes it (_takeLock's liveness). OUTSIDE an exit (an engine shut down in a process that lives
   *  on: a suite's) the landings are asked and a failed one is said (_onDisk), then the lock goes: this process's own pid stays
   *  alive, so a kept lock would only make its next engine read-only. */
  _unlockAfterStore() {
    if (this.readOnly) return;
    let W = null, owed = false, exiting = false;
    try { W = this._writer(); owed = W.pending(this.file) || W.pending(this.notifsFile); exiting = typeof W.exitStartedAt === 'function' && W.exitStartedAt() != null; } catch { }
    if (exiting) { if (W.pending(this.file)) { this._unlockWhenLanded = true; return; } }   // the hub's exit: its flush (after this) writes jobs.json, then the lock goes (the notifications land in the same flush; the lock guards the store)
    else if (owed) { this._onDisk(this.file, 'the store at shutdown'); this._onDisk(this.notifsFile, 'the notifications at shutdown'); }   // a shutdown outside the hub's exit (a suite's engine): they land now
    this._unlockNow();
  }
  /** A REFUSED START COMES BACK BY ITSELF where the release's would have (lane lg-store-writes, the U4/U5 cure 2 — 主开发): a
   *  start refused only because its run could not be recorded on disk — a restart policy's, the boot's replay, a vault
   *  unlock's, an update's rerun — is made again once jobs.json lands (_storeWritten), judged as its own door judges it (a
   *  service still down and wanted, a wait still live, an interrupted task's rerun); refused again it is recorded again (at
   *  most 3 times in a row, then «start it again», said). Never during the exit. */
  _retryRefused() {
    let W = null; try { W = this._writer(); } catch { }
    if (this.readOnly || !this._refusedForDisk || !this._refusedForDisk.size || (W && typeof W.exitStartedAt === 'function' && W.exitStartedAt() != null)) return;
    const owed = [...this._refusedForDisk]; this._refusedForDisk.clear();
    for (const [id, trigger] of owed) {
      const job = this.jobs.get(id); if (!job) continue;
      try {
        if (job.state === 'waiting') { if (this._waitLive(job)) this._startAfter(job, trigger, () => this._waitLive(job)); }
        else if (job.kind === 'service' && job.state === 'down' && job.desiredUp) this._startAfter(job, trigger, () => job.desiredUp && job.state === 'down');
        else if (job.kind === 'task' && job.state === 'interrupted' && trigger === 'update-rerun') this._spawn(job, 'update-rerun');
      } catch (e) { if (e && e.code === 'memory-budget' && job.kind === 'service' && job.state === 'down' && job.desiredUp) this._budgetLadder(job, e); else this.d.log(`[jobs] ${trigger} start of ${job.id} made again (its store on disk) refused:`, e.message); }   // B-b14a round wh9e7xe8i: a budget refusal here is a failed start on the ladder too
    }
  }
  /** the engine lock's ONE removal (test-job-logs-sweep counts jobs.js's removal calls by name) */
  _unlockNow() { try { fs.unlinkSync(this.lockFile); } catch { } }
  /** the process's store writer (src/store-writer.js) — or a suite's (deps.writer) */
  _writer() { return this.d.writer || require('./store-writer.js').storeWriter(); }
  /** a write that must be ON DISK before what follows (the run's intent before its child exists; the boot's recovered
   *  skeletons; a notifications claim / drain): the main thread WAITS for that one file's write (a named wait —
   *  test-store-write-census WAITS — behind the writer's write in flight, if any, which lands first). → {ok, why}: a write
   *  that did not land inside the writer's bound, failed, or was DEFERRED to the exit's flush (a flush asked between the
   *  hub's beginExit and its exitFlush) is SAID — the caller decides: the run's intent refuses its child (_spawn) */
  _onDisk(file, what) {
    try {
      const r = this._writer().flushSync([file]);
      if (r && r.deferred) { const why = 'the hub is stopping — its exit flush writes it next'; this.d.log(`[jobs] ${what}: ${path.basename(file)} deferred to the exit's flush (${why})`); return { ok: false, why }; }
      const miss = r.left.find((x) => x.file === file);
      if (miss) { this.d.log(`[jobs] ${what}: ${path.basename(file)} not on disk yet (${miss.why}) — kept in memory, the store writer retries`); return { ok: false, why: miss.why }; }
      return { ok: true, why: null };
    } catch (e) { this.d.log(`[jobs] ${what}: ${e.message}`); return { ok: false, why: e.message }; }
  }
  /** THE STEP THAT CANNOT BE UNDONE RIDES THE LANDING (lane lg-store-writes, the moved2 cure 2 — src/store-writer.js afterLanding,
   *  the ONE helper): `step` runs once `file`'s state owed now is on disk, never before; a kill first leaves the old record and
   *  the step never ran. Nothing is rolled back; the route's reply waits its own bound (persisted). → the writer's promise */
  _ride(file, what, step, opts = {}) { return require('./store-writer.js').ride(this._writer(), file, step, { what, timeoutMs: null, ...opts }); }
  /** THE ANSWER OF A PERSON'S ACT WAITS FOR THE STORE (lane lg-store-writes U4): true once jobs.json and job-notifications.json
   *  hold every change made so far (false: a write failed, is still queued at the bound, or the exit left it — said by the
   *  writer); the loop never waits — only the route's answer. `answer(saved)` — the route's answer, on the writer's
   *  SYNCHRONOUS road (the U4/U5 cure): called inside the writer's own settle, so an answer still waiting when the hub stops
   *  goes out inside the exit's flush (server.js leaves in that same run — a promise's .then never ran there, the CLI saw a
   *  reset and repeated the act). The promise resolves with the same value (record-clear). */
  persisted(answer = null, { archiveSeq = 0 } = {}) {
    if (this.readOnly) { if (answer) { try { answer(true); } catch { } } return Promise.resolve(true); }
    // bounded 20 s: under the CLI's 30 s call budget (src/cli-call.js) — a stalled mount answers «notOnDisk» in time, never «no
    // answer» (an agent that retried a create would make a second job)
    // B-0248 step 3: the archive too — ONLY for the call that names its own clear's archive write (`archiveSeq`, record-clear's), never
    // a create's or a stop's answer, never every door after one clear (its second read's should)
    try { return this._writer().whenDurable([this.file, this.notifsFile, ...(archiveSeq > this._archiveLandedSeq ? [this.archiveFile] : [])], { timeoutMs: 20000 }, answer); }
    catch { if (answer) { try { answer(false); } catch { } } return Promise.resolve(false); }
  }
  /** a store write's outcome (the writer's onWritten): a failure said once until one lands; the exit's lock released once landed */
  _storeWritten(ok, e) {
    if (!ok) { if (!this._storeOwedSaid) { this._storeOwedSaid = true; this.d.log(`[jobs] save failed: ${(e && (e.code || e.message)) || 'an error'} — kept in memory, the store writer retries`); } return; }
    this._intentHeld = null;   // the U4/U5 cure: a start refused for a held store may wait for its write again
    // the U4/U5 cure 2: the starts refused only because their run was not on disk come back now — off this callback (the
    // writer's own settle), never during the exit
    if (this._refusedForDisk && this._refusedForDisk.size && !this._retryArmed) { this._retryArmed = true; setImmediate(() => { this._retryArmed = false; this._retryRefused(); }); }
    if (this._storeOwedSaid) { this._storeOwedSaid = false; this.d.log('[jobs] the store is on disk again'); }
    if (this._unlockWhenLanded) { this._unlockWhenLanded = false; this._unlockNow(); }   // armed only at the hub's exit (no other engine in this process)
  }

  _takeLock() {
    try {
      const cur = JSON.parse(fs.readFileSync(this.lockFile, 'utf-8'));
      if (cur.pid && readStarttime(cur.pid) === cur.starttime && cur.starttime) return cur.pid === process.pid; // live foreign engine
    } catch { }
    writeJsonAtomic(this.lockFile, { pid: process.pid, starttime: readStarttime(process.pid), at: now() });
    return true;
  }
  _load() {
    // B-f276: THE STORE READ (src/store-read.js) — data / missing / unreadable; only bytes that were READ and do not parse are corrupt.
    // The release set the LIVE jobs.json aside on ANY failed read (a storage hiccup: the records became skeletons, then gone)
    // lane lg-store-writes U4: A LOAD READS WHAT THIS PROCESS STILL OWES — an engine made again in the same process (a suite's
    // restart) lands the writes the last one handed the writer before it reads (a hub's boot owes nothing: no wait)
    // …and one that did NOT land (held past the bound, failed, deferred by the exit) is never read past: the store starts UNREAD
    // (B-f276's hold — never written over, read again off the loop), so the earlier engine's write cannot land later over a store
    // this one read older (the move's read, small 3)
    let owedStill = null;
    try { const W = this._writer(), owed = [this.file, this.notifsFile].filter((f) => W.pending(f)); if (owed.length) { const r = W.flushSync(owed); if (r.deferred) owedStill = 'the hub is exiting'; else { const m = (r.left || []).find((x) => x.file === this.file); if (m) owedStill = m.why || 'not landed'; } } } catch { }
    let read;
    if (owedStill) read = { error: Object.assign(new Error(`the last engine's write of jobs.json is still owed (${owedStill}) — read again once it lands`), { code: 'EOWED' }) };
    else { try { read = { text: timedSync('jobs.read', () => fs.readFileSync(this.file, 'utf-8')) }; } catch (error) { read = { error }; } }
    this._loadAnswer(SR.storeAnswer(read, { valid: STORE_SHAPE }));
  }
  /** the store's answer → memory (the boot's read and every read again of an unreadable store) */
  _loadAnswer(a, pre = null) {
    if (a.state === 'data') { for (const j of a.value) this.jobs.set(j.id, skeletonAccess(j)); return; }
    // lane job-logs-sweep r2 law 1 / r3 §1 / r4: ONLY «the file is not there» means «no records». Any other failure is a fact the
    // clean-up's child honours on every road and after every restart: the bytes set aside before this load returns (renamed, else
    // copied), else the store's NOTE — and until that note is on disk THIS PROCESS HOLDS the law's pass (`_logsHeldFile`)
    if (a.state === 'missing') return;
    if (a.state === 'unreadable') {   // B-f276: the read FAILED — the live file is kept as it is, written by nothing, read again
      this._unreadHold('store', a);
      this._logsHeldFile(this.file, a.error, 'store', false);   // the clean-up's hold: the store's note (round 4), never a set-aside
      return;
    }
    // corrupt: bytes that were read and do not parse — preserve them, reconcile skeletons from log dirs (§5)
    const e = a.error || Object.assign(new Error('the store is not a list of records'), { code: 'ENOTLIST' });   // lane job-logs-sweep r2: set aside like a torn file
    const bad = this._logsHeldFile(this.file, e, 'store', true, pre);
    this.d.log('[jobs] store corrupt → preserved at', bad || (this.readOnly ? '(nowhere — a read-only engine writes nothing)' : '(nowhere — its note holds the job-logs clean-up)'), '— rebuilding skeletons; error:', e.message);
    try {
      // B-ef97: an id the archive holds has its record there — a skeleton beside it would be a second, empty record of it
      const archived = new Set(pre && Array.isArray(pre.archivedIds) ? pre.archivedIds : this._loadArchive().map((r) => r.id));   // cure r1: set aside or not (a held store's skeleton beside its archived copy); cure 3: read off the loop by a read again
      for (const id of (pre && pre.logIds) || fs.readdirSync(this.logsDir)) {   // cure r2: the read again lists it off the loop
        if (!id.startsWith('jb-') || archived.has(id)) continue;
        // B-2204: owner-less and view 'session' — the person sees it (isUser), no conversation does (was view 'all': every one)
        this.jobs.set(id, { id, kind: 'task', name: id, state: 'unverified', note: LS.RECOVERED_NOTE, owner: {}, access: { view: 'session', control: 'session' }, runs: [] });
      }
    } catch { }
    // B-ef97: the skeletons are WRITTEN BACK (were: memory only — the next boot loaded an empty store), once the torn bytes are
    // safe beside it (renamed or copied aside); with nothing set aside the live file is their only copy and is never written over.
    // init writes them right after the notifications load (a write HERE would flush an empty notifications map over its file)
    if (bad && this.jobs.size) this._skeletonsOwed = true;
    // r2: ONE item for the cause, the hold in it; r3 §6: it names the file that HOLDS the bytes (a name, never a path), never the live store
    if (bad) this._logsSay(path.basename(bad), 'store-corrupt', { file: path.basename(bad) });
    else if (!this.readOnly) this._unreadHold('store', SR.afterSetAside(a, null));   // B-f276: the torn bytes' only copy — nothing writes it
  }
  /** B-f276: a store whose read FAILED, or whose torn bytes could not be set aside, is NO ANSWER: nothing writes that file
   *  (`_save` keeps jobs.json, `_writeArchive` refuses), no job is created while the records are unread (`create`), said ONCE;
   *  read again off this thread on a backoff (30 s doubling to 5 min; deps.unreadRetry) until a read answers — then loaded */
  _unreadHold(which, a) {
    const base = path.basename(which === 'store' ? this.file : this.archiveFile);
    this._unread[which] = { code: a.code, why: a.why, at: (this._unread[which] && this._unread[which].at) || now() };
    const ms = SR.retryDelay(this._unreadTries[which] + 1, this._unreadCfg());
    if (!this._unreadSaid[which] && (this._unreadSaid[which] = true)) this.d.log(`[jobs] ${base} could not be read (${a.code}: ${a.why}) — kept as it is, never set aside: ${this.readOnly ? 'a read-only engine writes nothing anyway' : `nothing writes ${base}${which === 'store' ? ' and no job is created' : ''} until a read answers`}; read again in ${Math.round(ms / 1000)} s`);
    this._unreadRetrySoon(which);
  }
  _unreadCfg() {
    const o = (this.d && this.d.unreadRetry) || {}, num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
    return { firstMs: num(o.firstMs, 30_000), maxMs: num(o.maxMs, 300_000) };
  }
  _unreadRetrySoon(which) {
    if (this._unreadT[which] || this._unreadStopped) return;
    const n = ++this._unreadTries[which];
    const t = setTimeout(() => { this._unreadT[which] = null; this._unreadRetry(which).catch((e) => { this.d.log(`[jobs] ${which} read again failed:`, e && e.message); this._unreadRetrySoon(which); }); }, SR.retryDelay(n, this._unreadCfg()));
    t.unref?.(); this._unreadT[which] = t;
  }
  /** cure r2: what the late load reads, read OFF the loop — each live record's control files (pid / exit / pressure / bound / stopping
   *  .json: what _adoptAndReplay asks), and for torn bytes their set-aside (renamed, else copied — the same rule as _logsHeldFile)
   *  and the job-logs listing. → {bad?, logIds?}; the control files land in this._ctlPre (cleared once the load ran) */
  async _unreadPrefetch(which, a, file) {
    const pre = {};
    if (a.state === 'corrupt') {
      if (!this.readOnly) {
        const bad = asideOf(file);
        try { await fs.promises.rename(file, bad); pre.bad = bad; } catch { try { await fs.promises.copyFile(file, bad, fs.constants.COPYFILE_EXCL); pre.bad = bad; } catch { pre.bad = null; } }
        if (pre.bad && file === this.file) { try { this._copies().invalidate(); } catch { } }   // round wxzvih2as (2): the copies' answer never older than the copy just made
        if (pre.bad) this.d.log(`[jobs] ${path.basename(file)}: torn bytes when read again — set aside as ${path.basename(pre.bad)}, before its load`);   // cure 2: said where it is done
      }
      if (which === 'store') { try { pre.logIds = await fs.promises.readdir(this.logsDir); } catch { pre.logIds = []; } }   // cure 2: a read-only engine lists off the loop too
      // cure 3: the archive's ids (the load drops a skeleton the archive holds) — read here, off the loop, when nothing loaded it yet (a
      // read-only engine never sweeps); a read that fails leaves the load its own road
      if (which === 'store' && this.archive == null) { try { const v = JSON.parse(await fs.promises.readFile(this.archiveFile, 'utf-8')); pre.archivedIds = Array.isArray(v) ? v.map((r) => r && r.id).filter(Boolean) : null; } catch (e) { pre.archivedIds = e && e.code === 'ENOENT' ? [] : null; } }
    }
    if (which === 'store' && a.state === 'data' && !this.readOnly) {
      // cure 2: ONE FILE AT A TIME — the read it serves holds one pool thread a store (r2 fanned out with no bound)
      const m = new Map(), want = [], recs = (a.value || []).filter(Boolean), last = (j) => j.runs[j.runs.length - 1];
      for (const j of recs) if (['up', 'starting', 'awaiting-user'].includes(j.state) && Array.isArray(j.runs) && j.runs.length) {
        const dir = this._ctlDir(j, last(j).startedAt);
        for (const n of ['pid.json', 'exit.json', 'pressure.json', 'bound.json', 'stopping.json']) want.push([path.join(dir, n), false]);
        want.push([path.join(dir, 'current.log'), true]);   // the run's last log line — what _finalizeRun keeps on the run (its last 16 KB)
      }
      // cure 2 (the reading's should): the legacy collapse's stamps — a cron's older TERMINAL children (pre-2.343.3 records, two or more
      // a cron), whose pid.json _adoptAndReplay asks
      const kids = new Map();
      for (const j of recs) if (j.cronParent) (kids.get(j.cronParent) || kids.set(j.cronParent, []).get(j.cronParent)).push(j);
      for (const [, ks] of kids) if (ks.length >= 2) for (const k of ks) if (['done', 'interrupted', 'failed', 'missed'].includes(k.state) && Array.isArray(k.runs) && k.runs.length) want.push([path.join(this._ctlDir(k, last(k).startedAt), 'pid.json'), false]);
      for (const [f, tail] of want) {
        if (this._unreadStopped) break;
        if (!tail) { try { m.set(f, await fs.promises.readFile(f, 'utf-8')); } catch { m.set(f, null); } continue; }
        let fh = null;
        try { fh = await fs.promises.open(f, 'r'); const st = await fh.stat(), len = Math.min(st.size, 16384), buf = Buffer.alloc(len); if (len) await fh.read(buf, 0, len, st.size - len); m.set(f + '#last', len ? M.lastLineOf(buf.toString('utf-8'), 200) : ''); }
        catch { m.set(f + '#last', ''); } finally { if (fh) await fh.close().catch(() => { }); }
      }
      this._ctlPre = m;
    }
    return pre;
  }
  /** cure r1: the words an agent and a person read while the records cannot be read — what is held, and the door (For you, the file) */
  unreadWords(what = 'the job records cannot be read right now', which = this._unread.store ? 'store' : 'archive') {
    const u = this._unread[which], base = path.basename(which === 'store' ? this.file : this.archiveFile);
    return `Background Work: ${what} — ${base} in VibeSpace's data folder could not be read (${u ? u.code : 'unknown'}); VibeSpace reads it again every few minutes, and For you says what to check. No record is lost: nothing is written over it.`;
  }
  /** one read again of an unreadable store, off this thread (fs.promises) — an answer is loaded as the boot loads it. Cure r1: the
   *  read is BOUNDED (READ_AGAIN_MS) and the NEXT try is armed BEFORE it is awaited — a mount that hangs rather than fails never
   *  stops the tries; one read is in flight a store (a hung one is waited on, never doubled), a slow one counted and said once */
  async _unreadRetry(which) {
    if (!this._unread[which] || this._unreadStopped) return;
    const file = which === 'store' ? this.file : this.archiveFile, base = path.basename(file);
    this._unreadRetrySoon(which);   // the next try first: whatever this one does
    // cure 2 (主开发 09:20Z): ONE IN FLIGHT A STORE covers the read AND the prefetch it serves (r2's prefetch ran outside the slot: a
    // second try could start over it) — a slow one is said once and WAITED ON, never doubled, never dropped (what it did — a set-aside
    // of torn bytes — is loaded, never lost to a newer try)
    if (this._unreadP[which]) return;
    if (which === 'archive') { try { const W = this._writer(); if (typeof W.pending === 'function' && W.pending(this.archiveFile)) return; } catch { /* no writer */ } }   // B-0248 step 3: a write still owed is never read past — the next try
    const job = this._unreadP[which] = (async () => {
      const read = await fs.promises.readFile(file, 'utf-8').then((text) => ({ text }), (error) => ({ error }));
      const a = SR.storeAnswer(read, { valid: which === 'store' ? STORE_SHAPE : Array.isArray });
      if (a.state === 'unreadable' || this._unreadStopped || !this._unread[which]) return { a, pre: null };
      return { a, pre: await this._unreadPrefetch(which, a, file) };   // cure r2: what the late load reads, off the loop
    })();
    const free = () => { if (this._unreadP[which] === job) this._unreadP[which] = null; };
    job.then(free, free);
    const ms = (this.d.unreadRetry && Number(this.d.unreadRetry.readMs) > 0) ? Number(this.d.unreadRetry.readMs) : READ_AGAIN_MS;
    let timer = null;
    const first = await Promise.race([job, new Promise((r) => { timer = setTimeout(() => r(null), ms); timer.unref?.(); })]);
    clearTimeout(timer);
    if (!first && !this._unreadSlow[which]++) this.d.log(`[jobs] ${base}: a read again did not answer in ${Math.round(ms / 1000)} s — the storage may hang; it is waited on (never doubled) and tried again on the same pace (said once)`);
    const got = first || await job.catch(() => null);
    if (!got || this._unreadStopped || !this._unread[which]) {
      this._ctlPre = null;
      // cure 3: torn bytes set aside, then the engine stopped before their load — said here; the next start's clean-up pass names the
      // held file to the person (records-held), and its prefix holds the clean-up
      if (got && got.pre && got.pre.bad) this.d.log(`[jobs] ${base}: its torn bytes were set aside as ${path.basename(got.pre.bad)} and the engine stopped before loading them — the next start names that file`);
      return;
    }
    const { a, pre } = got;
    if (a.state === 'unreadable') { this._unread[which].code = a.code; this._unreadMissingAt[which] = 0; return; }   // the next try is armed already
    // cure 3 (主开发 11:10Z, as if a must): a store that answers «missing» RIGHT AFTER an unreadable answer is READ ONCE MORE before
    // anything is written at its path — a storage that says «no such file» for a moment about a file that exists must not have it
    // written over by the next save: the hold stands until a SECOND read again says missing too
    if (a.state === 'missing' && !this._unreadMissingAt[which]) { this._unreadMissingAt[which] = now(); this.d.log(`[jobs] ${base}: a read again answered «no such file» — read once more before anything is written there (the hold stands)`); return; }
    const tries = this._unreadTries[which], was = this._unread[which];
    this._unread[which] = null;   // the answer is loaded as the boot loads it: torn bytes that still cannot be set aside hold again
    try {
      if (which === 'archive') { this.archive = null; this._archiveAnswer(a, pre); }
      else {
        for (const [id, j] of this.jobs) if (LS.isSkeleton(j)) this.jobs.delete(id);   // the skeletons of an earlier answer: the new answer rebuilds its own, or has the records
        this._loadAnswer(a, pre);
        this._skeletonsOwed = false;
        if (!this._unread.store && !this.readOnly) { this._adoptAndReplay(); this._dirty = true; }   // the boot's adoption, late: the records are this process's now
      }
    } finally { this._ctlPre = null; }
    if (!this._unread[which]) {
      if (this._unreadT[which]) { clearTimeout(this._unreadT[which]); this._unreadT[which] = null; }
      // cure 2 (主开发 09:20Z, THE LAW): the hold is LIFTED — the note marked done, «nothing was lost», the clean-up resumed — ONLY on a
      // WHOLE read. A file that is GONE, or torn bytes, end the hold with THEIR own true sentence, and the clean-up stays held
      if (a.state === 'data') { try { this._judgeNotifs(); } catch (e) { this.d.log('[jobs] the waiting notices could not be judged again:', e && e.message); } }   // its read r4 (S1): the records read again judge the waiting notices
      // 主开发 05:36Z — THE STASH'S OWN LAW: every change of what a conversation's strip shows is said to it, once. The records read again
      // (a whole read) or ended (gone, torn): a notice that waited for them shows — the judge gives a cleared job's the clear's words; a gone
      // or torn end lets them go as they are, FOR GOOD (their marks leave: a later hold never hides them again — its read's S2) — and a held
      // line's verdict (owner, subscriber) may be known now (its read's S1): each conversation holding a notice of a job is told
      if (a.state !== 'data' && !this._recordsHeld()) for (const l of this.pendingNotifs.values()) for (const n of l || []) this._unjudged.delete(n);
      const told = [...this.pendingNotifs].filter(([, l]) => (l || []).some((n) => n && n.jobId)).map(([cid]) => cid);
      for (const cid of told) { try { this.d.onStash?.(cid); } catch { } }
      if (a.state === 'data') this._unreadLift(which, was).catch((e) => this.d.log(`[jobs] ${base}: its note could not be lifted:`, e && e.message));
      else this._unreadEnded(which, was, a, pre).catch((e) => this.d.log(`[jobs] ${base}: its end could not be said:`, e && e.message));
      this._unreadTries[which] = 0; this._unreadSaid[which] = false; this._unreadSlow[which] = 0; this._unreadMissingAt[which] = 0;
      this.d.log(`[jobs] ${base} read again after ${tries} tr${tries === 1 ? 'y' : 'ies'}: ${a.state === 'data' ? `${a.value.length} record(s)` : a.state === 'missing' ? 'the file is GONE — the records it held are not here; a new list starts, the job-logs clean-up stays held' : `torn bytes, set aside${pre && pre.bad ? ` as ${path.basename(pre.bad)}` : ''} — rebuilt from the job logs; the job-logs clean-up stays held`} — ${this.readOnly ? 'a read-only engine writes nothing' : 'writes resume'}`);
      try { this.d.broadcast('jobs-updated', { reread: which }); } catch { }
    }
  }
  /** cure r1 — 主开发's ruling (00:40Z): a read again that ANSWERED and LOADED lifts what the failure filed. The records are in
   *  memory now and nothing wrote over the file (B-f276), so the clean-up's hold has no ground: the note THIS process wrote (its
   *  `at` is this failure's) is marked done — renamed `<store>.unread-done-<ms>`, a name no hold reads — and its For-you items are
   *  resolved; the clean-up resumes at its next pass. A note that STOOD before (another process's failure) is left: it is not ours */
  async _unreadLift(which, was = null) {
    const base = path.basename(which === 'store' ? this.file : this.archiveFile), name = base + LS.NOTE_SUFFIX, at = this._unreadNoteAt[which];
    if (which === 'archive') this._unreadSweepSaid = false;
    if (this._logsNoteOwed[which]) this._unreadLiftedOwed[which] = this._logsNoteOwed[which];   // cure 2: a note still being written — marked done when it lands
    this._logsUnread[which] = null; this._logsNoteOwed[which] = null; this._unreadNoteAt[which] = null;
    const lifted = await this._noteDone(which, at);
    const items = this._unreadItems[which].splice(0);
    for (const id of items) { try { this.d.resolveNotice && this.d.resolveNotice(id); } catch { } }
    // cure r2, the ruling: the person who was told hears ONE TRUE SENTENCE of what happened — never «may already have been written over»
    if (items.length && was) this._forYou(null, M.forYouCopy(null, 'records-read-again', { store: base, error: was.code, when: was.at, until: now() }));
    if (lifted || items.length) this.d.log(`[jobs] ${base} was read again: ${lifted ? `its note ${name} is marked done (renamed), ` : ''}${items.length ? `${items.length} For-you item(s) resolved, ` : ''}the job-logs clean-up resumes`);
    return lifted;
  }
  /** cure 2: THIS process's note of a failure (its `at`) renamed `<store>.unread-done-<ms>` — a name no hold reads → renamed? */
  async _noteDone(which, at) {
    if (at == null || this.readOnly) return false;
    const base = path.basename(which === 'store' ? this.file : this.archiveFile), f = path.join(this.d.dataDir, base + LS.NOTE_SUFFIX);
    try { const n = JSON.parse(await fs.promises.readFile(f, 'utf8')); if (n && Number(n.at) === Number(at)) { await fs.promises.rename(f, path.join(this.d.dataDir, `${base}.unread-done-${now()}`)); return true; } } catch { }
    return false;
  }
  /** cure 2 (主开发 09:20Z, THE LAW): a read again that answered but NOT WHOLE — the file GONE, or torn bytes — ends the hold (writes
   *  resume: a new list, or the list rebuilt from the job logs as at a start) with ITS OWN true sentence, and the job-logs clean-up
   *  STAYS held — never «nothing was lost», never a clean-up over jobs whose records are not here:
   *  - gone: the note STANDS (no log of the jobs it held is removed until a person moves it); the failure's items are resolved and
   *    ONE item says what is gone (`records-gone`);
   *  - torn: the bytes set aside hold the clean-up across a restart (their name's prefix) and `store-corrupt` names them (filed by the
   *    load, as at a boot); the failure's note is marked done, its items resolved. Set aside nowhere, the load held again (no end) */
  async _unreadEnded(which, was, a, pre) {
    const base = path.basename(which === 'store' ? this.file : this.archiveFile), name = base + LS.NOTE_SUFFIX, at = this._unreadNoteAt[which];
    if (which === 'archive') this._unreadSweepSaid = false;
    const items = this._unreadItems[which].splice(0);
    for (const id of items) { try { this.d.resolveNotice && this.d.resolveNotice(id); } catch { } }
    if (a.state === 'missing') {
      this._unreadNoteAt[which] = null;   // the note stands: it is a person's to move now, no read's to lift
      this._unreadGoneOwed[which] = this._logsNoteOwed[which] || null;   // cure 3: its note still being written lands with no second item
      if (!this._logsUnread[which]) this._logsUnread[which] = 'ENOENT';
      if (!this.readOnly) this._forYou(null, M.forYouCopy(null, 'records-gone', { store: base, note: name, error: was && was.code, when: was && was.at, until: now() }));
      this.d.log(`[jobs] ${base}: the file was GONE when read again — the records it held are not here; ${name} holds the job-logs clean-up until a person moves it`);
      return false;
    }
    if (this._logsNoteOwed[which]) this._unreadLiftedOwed[which] = this._logsNoteOwed[which];
    this._logsNoteOwed[which] = null; this._unreadNoteAt[which] = null;   // `_logsUnread` stays: the load set it (the set-aside's hold)
    const done = await this._noteDone(which, at);
    this.d.log(`[jobs] ${base}: read again, its bytes were torn — set aside as ${pre && pre.bad ? path.basename(pre.bad) : '(nowhere: a read-only engine)'}, which holds the job-logs clean-up${done ? `; the failure's note ${name} is marked done` : ''}`);
    return done;
  }
  /** lane job-logs-sweep r3 §1 / r4: a records read that failed (anything but ENOENT) is a FACT the clean-up holds:
   *  - bytes that can be read but do not parse: renamed aside (`<store>.corrupt-<ms>`), else COPIED aside — before this load returns,
   *    so before any write of that store → its name
   *  - bytes that cannot be read (an I/O error — never set aside since B-f276: `_loadAnswer` calls this with exists=false),
   *    or a rename + copy that both failed: THIS PROCESS HOLDS the law's pass at once (`_logsNoteOwed`, round 4 §1) and the remover's
   *    child writes the store's ONE note `<store>.corrupt-unread` = {store, error, at} (round 4 §2: O_EXCL, no listing — EEXIST = a
   *    note already stands, nothing new filed), asked at once and again before every pass until it is on disk → null
   *  Lifted ONLY by a person moving the file: after this hub's own write, a read that succeeds proves nothing. Main thread: the load's
   *  failure branch makes no call the release's did not (its read + its existsSync; a rename; a copy only for bytes that did not
   *  parse) — no listing, no note write here (round 4 §3). A READ-ONLY engine writes nothing (round 4 §3). */
  _logsHeldFile(file, e, what, exists, pre = null) {
    const parseErr = e instanceof SyntaxError || (e && e.code === 'ENOTLIST');
    const code = String((e && (e.code || (parseErr ? 'did not parse' : e.message))) || 'unreadable').slice(0, 60);
    // round 4 §3: a READ-ONLY engine (a second server against a live lock) writes NOTHING into the live engine's data dir — no
    // set-aside, no copy, no note, no item (a file it left would hold the live engine's clean-up); it says the failure here only
    if (this.readOnly) { this.d.log(`[jobs] ${what} could not be read (${code}) — a read-only engine: nothing is set aside, noted or filed from it (the live engine reads its own)`); return null; }
    // memory holds NONE of those records now: the child re-reads that file at every pass of this process (`_logsUnread`) — after a
    // person moved the held file, what the file still lists keeps its runs (B-f276: this hub writes nothing over an unread store)
    this._logsUnread[what] = (e && (e.code || (parseErr ? 'did not parse' : 'unreadable'))) || 'unreadable';
    if (exists && pre) { if (pre.bad) return pre.bad; }   // B-f276 cure r2: the set-aside was made off the loop (the read again) — its answer
    else if (exists) {
      const bad = asideOf(file);
      try { fs.renameSync(file, bad); return bad; } catch (re) { this.d.log(`[jobs] ${what} could not be set aside (${(re && re.code) || re})${parseErr ? ' — copying its bytes aside' : ''}`); }
      if (parseErr) { try { fs.copyFileSync(file, bad, fs.constants.COPYFILE_EXCL); return bad; } catch (ce) { this.d.log(`[jobs] ${what}'s bytes could not be copied aside either (${(ce && ce.code) || ce})`); } }
    }
    this._logsNoteOwed[what] = { error: code, at: now() };   // round 4 §1: THE HOLD, at once — before this load returns
    this._logsNoteSoon();
    return null;
  }
  /** round 4 §1: at the hub's EXIT a note still owed (its child had not written it, or could not) is written by the exit itself — ONE
   *  O_EXCL write per store, BEFORE the exit's own write of that store, on a loop that serves nothing any more (as the exit's flush
   *  writes the stores). What is left uncovered: a crash between the failed load and the child's note (the in-process hold's window) */
  _logsNoteAtExit() {
    if (this.readOnly) return;
    for (const w of ['store', 'archive']) {
      const o = this._logsNoteOwed[w]; if (!o) continue;
      const base = path.basename(w === 'store' ? this.file : this.archiveFile), name = base + LS.NOTE_SUFFIX;
      try { fs.writeFileSync(path.join(this.d.dataDir, name), JSON.stringify({ store: base, error: o.error, at: o.at }), { flag: 'wx' }); this._logsNoteOwed[w] = null; this.d.log(`[jobs] ${w} could not be read (${o.error}) — its note ${name} was written at the exit; it holds the job-logs clean-up until a person moves it`); }
      catch (e) { if (e && e.code === 'EEXIST') this._logsNoteOwed[w] = null; else this.d.log(`[jobs] ${w} could not be read (${o.error}) and its note could not be written at the exit either (${(e && e.code) || e}) — the next start cannot know those records were unread`); }
    }
  }
  /** round 4 §1: the store's NOTE, written by the remover's child (never this thread) — one attempt at a time, asked at the failed load
   *  and again before every pass (paused or not) while a note is owed. → Promise (never rejects) */
  _logsNoteSoon() {
    if (this.readOnly) return Promise.resolve();
    const p = (this._logsNoteP || Promise.resolve()).then(() => this._logsWriteNotes()).catch((e) => { try { this.d.log('[jobs] job-logs: the note could not be asked for:', e && e.message); } catch { } });
    this._logsNoteP = p; p.then(() => { if (this._logsNoteP === p) this._logsNoteP = null; });
    return p;
  }
  async _logsWriteNotes() {
    const owed = ['store', 'archive'].filter((w) => this._logsNoteOwed[w]);
    if (!owed.length || this._logsStopped) return;
    // each owed note: its side (store | archive), the failure it records, its store's file name and its own (names only)
    const todo = owed.map((side) => { const base = path.basename(side === 'store' ? this.file : this.archiveFile); return { side, o: this._logsNoteOwed[side], base, file: base + LS.NOTE_SUFFIX }; });
    const a = await this._logsRemover().note(this.d.dataDir, todo.map((t) => ({ name: t.file, body: { store: t.base, error: t.o.error, at: t.o.at } })));
    for (const t of todo) {
      const r = a && !a.error && a.notes ? a.notes[t.file] : null;
      if (this._logsNoteOwed[t.side] !== t.o) {   // a newer failure meanwhile: its own attempt answers for it
        // cure 2 (the reading's race): a read again ENDED this failure while its note was being written — the note that landed is that
        // failure's: marked done at once, never left on disk with nothing to lift it
        if (r === 'written' && this._unreadLiftedOwed[t.side] === t.o) { this._unreadLiftedOwed[t.side] = null; this._noteDone(t.side, t.o.at).then((d) => { if (d) this.d.log(`[jobs] ${t.side}: the note ${t.file} landed after its failure had ended — marked done`); }, () => { }); }
        continue;
      }
      if (r === 'written' || r === 'stood') {
        this._logsNoteOwed[t.side] = null;
        if (r === 'written' && this._unreadGoneOwed[t.side] === t.o) {   // cure 3: «gone» was said for this very failure — no «unread» item after it
          this._unreadGoneOwed[t.side] = null;
          this.d.log(`[jobs] ${t.side}: the note ${t.file} landed after «gone» was said for the same failure — it holds the job-logs clean-up; no second item`);
        } else if (r === 'written') {
          this.d.log(`[jobs] ${t.side} could not be read (${t.o.error}) — the note ${t.file} holds the job-logs clean-up until a person moves it`);
          // «said» keyed by the note AND its moment: a note a person moved and a later failure wrote again is told again
          const v = this._logsSay(`${t.file}@${t.o.at}`, 'records-unread', { store: t.base, note: t.file, error: t.o.error, when: t.o.at });
          if (this._unread[t.side]) { this._unreadNoteAt[t.side] = t.o.at; if (v && v.id) this._unreadItems[t.side].push(v.id); }   // cure r1: OURS — lifted when a read answers
        } else this.d.log(`[jobs] ${t.side} could not be read again (${t.o.error}) — the note ${t.file} still holds the job-logs clean-up (not a new failure: nothing filed)`);
        if (this._logsUnnotedSaid.has(t.side)) this.d.log(`[jobs] job-logs: the note ${t.file} is on disk now — it holds the clean-up, also across a restart`);
        continue;
      }
      if (a && a.error === 'stopped') continue;
      const why = String((a && a.error) || (r && r.error) || 'no answer').slice(0, 60);
      if (this._logsUnnotedSaid.has(t.side)) continue;   // said once per process; the note is asked for again before each pass
      this._logsUnnotedSaid.add(t.side);
      this.d.log(`[jobs] ${t.side} could not be read (${t.o.error}) and no note of it could be written (${why}) — the job-logs clean-up removes nothing in this process; the note is tried again before each pass`);
      const vu = this._forYou(null, M.forYouCopy(null, 'records-unread-unnoted', { store: t.base, error: t.o.error, when: t.o.at }));
      if (this._unread[t.side] && vu && vu.id) this._unreadItems[t.side].push(vu.id);
    }
  }

  /** an item for a held file, «said» only once the For-you store has WRITTEN it (round 3 §6: the order — a crash between costs a
   *  second telling at worst, never none) */
  _logsSay(name, kind, opts) {
    (this._logsTelling || (this._logsTelling = new Set())).add(name);   // filed in this process: the pass never files it again while «said» waits
    const v = this._forYou(null, M.forYouCopy(null, kind, opts));   // §93: the copy minted at the door's call, never handed in
    if (v && v.ok === false) return v;   // refused (said in the log): asked again by the next process
    const w = v && typeof v.written === 'function' ? v.written() : null;
    if (w && typeof w.then === 'function') w.then(() => this._logsMarkSaid(name), () => { }); else this._logsMarkSaid(name);
    return v;
  }
  /** THE STORE'S SAVE GOES THROUGH THE STORE WRITER (lane lg-store-writes, B-0248 U4): jobs.json and job-notifications.json were
   *  written whole (temp + rename) ON THE MAIN THREAD at every save — the 2 s dirty tick and each act — and on the production
   *  hub's data mount that was 41 s of main-loop holds in five hours (20 holds, 3.9 s the longest), the largest store write
   *  left. Now both files hand their bytes to the writer by name (made when the write is due — a burst is one write): a
   *  direct save (an act: create, stop, start, rm, an answer, a claim) is URGENT (rank 0 + durable() — the writer's next
   *  writes, and the act's route answers once persisted() resolves); the 2 s tick and the exit are PACED. What must be on disk
   *  before what follows waits for that one file (_onDisk: the run's intent before its child, the boot's skeletons). */
  _save({ storeOnly = false, paced = false } = {}) {
    // a READ-ONLY engine (second server against a live lock) must never flush
    // its stale in-memory copy over the live engine's store (2.344.1 review
    // catch: shutdown()'s dirty-flush had no guard, and drainNotifs marks
    // dirty even in read-only mode)
    if (this.readOnly) { this._dirty = false; return; }
    try {
      const W = this._writer();
      // B-f276: an UNREAD store is never written over (its records are on disk, not here) — the notifications are their own file
      if (!this._unread.store) {
        // an act is URGENT by the writer's own flag (the U4/U5 cure: no durable() asked here — its 60 s timer and promise
        // served no answer; the route that answers waits through persisted())
        W.dirty(this.file, { name: 'jobs.write', ...(paced ? {} : { rank: 0, urgent: true }), produce: () => this._recordsBytes(), onWritten: (ok, e) => this._storeWritten(ok, e) });
      }
      if (storeOnly) return;
      if (!this._notifsUnread) {   // the B-f276 remainder: a held notifications file is never written over
        W.dirty(this.notifsFile, { name: 'jobs-notifs.write', ...(paced ? {} : { rank: 0, urgent: true }), produce: () => this._notifsBytes() });
      }
      this._dirty = false;
    } catch (e) { this.d.log('[jobs] save failed:', e.message); }
  }
  /** remainder of B-f276 (bl-jobs, 2.369.411 — THE STORE-READ LAW over job-notifications.json, every job notice still waiting for
   *  its conversation): data → loaded · missing → none · torn bytes → copied aside, then none · a read that FAILED (EIO, EACCES, a
   *  timeout on network storage) → HELD: nothing is written over the file (the release's `catch { }` started an empty map the next
   *  save wrote over every waiting notice), what is filed meanwhile waits here and is delivered as ever, and the file is read again
   *  off the main loop; read, its notices join what waits here */
  _loadNotifs() {
    let read; try { read = { text: fs.readFileSync(this.notifsFile, 'utf-8') }; } catch (error) { read = { error }; }
    this._notifsAnswer(SR.storeAnswer(read, { valid: NOTIFS_SHAPE }));
  }
  _notifsAnswer(a) {
    // torn bytes at boot are HELD, not copied here: the copy aside is a store write, and the boot's main thread takes no new one
    // (test-store-write-census: the debt only shrinks) — the read again, off the loop, copies them aside and lifts (a read-only
    // engine writes nothing: torn bytes are no notices there)
    if (a.state === 'corrupt') a = this.readOnly ? { state: 'missing' } : { ...SR.afterSetAside(a, null), code: a.code };   // its read r3 (N4) / r4 (N3): said by its cause (`did not parse` — its zh / ja words)
    if (a.state === 'unreadable' && this.readOnly) a = { state: 'missing' };   // its read r1 (N4): a read-only engine writes nothing — no hold, no timers
    if (a.state === 'unreadable') return this._notifsHold(a);
    this.releasedAtBoot = [];
    if (a.state === 'data') this._notifsFrom(a.value);
  }
  _notifsFrom(obj, { merge = false } = {}) {
      for (const [cid, list0] of Object.entries(obj)) {
        const list = Array.isArray(list0) ? list0.filter((n) => n && typeof n === 'object' && !Array.isArray(n)) : [];   // its read r1 (N2): a torn entry never breaks the merge
        if (!list.length) continue;
        // its read r2 (N1): a crafted field never throws here (a throw at boot ended the whole engine): a stamp is a string, a time a number
        for (const n of list) { if (n.rt != null && typeof n.rt !== 'string') delete n.rt; else if (n.rt) (this._parkOnDisk || (this._parkOnDisk = new Set())).add(n.rt); if (n.ho != null && typeof n.ho !== 'string') delete n.ho; if (n.ts != null && typeof n.ts !== 'number') n.ts = typeof n.ts === 'string' ? (Number(n.ts) || 0) : 0; }
        // its read r1 (M1): at a read again, an entry of a job CLEARED after it was filed takes the clear's words (as clearJobs and
        // _stashNotif hold them) — the clear ran while the file was held and could not rewrite it
        // its read r2 (M1): at EVERY read — the boot's too: a clear made while the file was held, then a restart, kept the old words (the
        // record's clearedAt is in jobs.json; an archived record is read from the archive at the boot, the one load the sweep does next)
        this._judgeNotifsIn(list, { boot: !merge });   // its read r2 (M1) / r4 (S1): ONE judge — the boot, the merge, a record's read again
        // a hand-over the previous process did not settle (verify r2, the ladder's stash has the same rule): the
        // entries wait again, by name in the log — the shutdown waits for a hand-over in flight, so a stamp here is a
        // process killed mid-post
        // a notice DRAINED while the file was held (its copy put back at the boot, already in the file) leaves the merge: never twice — FIRST, so the journal
        // never says «waits again» for a copy the merge then removes (the read's should)
        if (merge && this._drainedWhileHeld && this._drainedWhileHeld.size) { for (let i = list.length - 1; i >= 0; i--) if (this._drainedWhileHeld.has(`${cid}\u0000${list[i].jobId}\u0000${list[i].ts}`)) list.splice(i, 1); }
        const ids = new Set();
        for (const n of list) if (n && n.ho) { ids.add(n.ho); delete n.ho; }
        if (ids.size) { this.releasedAtBoot.push({ cid, ids: [...ids], n: list.length }); const ho = [...ids].filter((x) => x !== 'carry'), both = ids.has('carry') && ho.length > 0; this.d.log(`[jobs] ${cid}: ${[ids.has('carry') ? 'an unconfirmed answer\'s claim (carry)' : '', ho.length ? `a hand-over (${ho.join(', ')})` : ''].filter(Boolean).join(' and ')} ${both ? 'were' : 'was'} in flight when the previous server stopped — ${both ? 'their' : 'its'} job results wait again`); }   // lane report-mark-on-ack: a carry claim is an unconfirmed answer's, named apart from a hand-over
        const mine = merge ? (this.pendingNotifs.get(cid) || []).filter((n) => !list.includes(n)) : [];
        if (merge) { const onDisk = new Set(list.map((n) => n && n.rt).filter(Boolean)); for (let i = mine.length - 1; i >= 0; i--) if (mine[i] && mine[i].rt && onDisk.has(mine[i].rt)) mine.splice(i, 1); }   // B-54b7 (iv): memory's copy of a park entry the file already holds leaves the merge (its park step still runs at the lift)
        if (!list.length && !mine.length) continue;
        this.pendingNotifs.set(cid, mine.length ? [...list, ...mine].sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0)) : list);   // a read again: what waited here joins the file's (no cap — the file's are the oldest, as a restore's)
      }
      if (merge && this._drainedWhileHeld) this._drainedWhileHeld = null;   // the lift's merge took them out; the set ends with the hold
      if (this.releasedAtBoot.length && !this.readOnly) this._saveNotifs();
  }
  /** its read r2 (M2): a CLEARED job's notices may still wait in the HELD file — the clear reaches them at the read, by the record's
   *  clearedAt; a record removed meanwhile leaves nothing to judge them by (they came back with the old words): its removal waits */
  _notifsClearedWords(id) { return `${id}'s content was cleared, and notices of it may still wait in job-notifications.json, which cannot be read right now — remove it once that file reads (VibeSpace reads it again every few minutes)`; }
  /** its read r4 (S1): THE ONE JUDGE of waiting notices by their jobs' clears (clearedAt / reclearedAt against the notice's ts) — at
   *  the boot, at the merge, and when jobs.json or the archive reads again (a clear made while the notices were held, then a restart
   *  whose boot found the records held, kept the old words: nothing judged them again). `boot`: the archive may be read here (the
   *  boot's thread); mid-life only the archive in memory is asked. A rewrite marks the store dirty (written by the next tick). */
  _judgeNotifsIn(list, { boot = false } = {}) {
    // store (5) cure (2): while the job records or the archive are HELD a clear cannot be judged — the notices wait (marked), judged
    // at the records' read again (`_judgeNotifs`); a hold that ENDS without a whole read lets them go as they are (nothing to judge by)
    // 主开发 04:33Z (1): at the boot the ARCHIVE is loaded ONCE before the held check (a list naming a job jobs.json has not) — loaded
    // lazily by the first such notice, an archive whose hold began INSIDE this judge let that first list out with a cleared job's old words
    if (boot && !this.archive && !this.readOnly && list.some((n) => n && n.jobId && !this.jobs.has(n.jobId))) this._archiveAtBoot();
    if (this._recordsHeld()) { for (const n of list) if (n && n.jobId) this._unjudged.add(n); return; }
    for (const n of list) {
      if (!n || !n.jobId) continue;
      this._unjudged.delete(n);
      const j = this.jobs.get(n.jobId) || (this.archive || []).find((r) => r && r.id === n.jobId);   // the boot's ONE archive load is above (主开发 04:33Z (1))
      if (j && j.clearedAt && !(Number(n.ts) > Math.max(j.clearedAt, j.reclearedAt || 0)) && (n.text !== CLEARED_TEXT || n.jobName !== CLEARED_TEXT)) { n.jobName = CLEARED_TEXT; n.text = CLEARED_TEXT; this._dirty = true; }
    }
  }
  _judgeNotifs() { for (const list of this.pendingNotifs.values()) this._judgeNotifsIn(list || []); }
  /** store (5) cure: the job records (jobs.json) or the archive are held — a missing record is UNKNOWN, a clear unjudgeable */
  _recordsHeld() { return !!(this._unread && (this._unread.store || this._unread.archive)); }
  /** a notice that waits for the records' first whole read (cure (2)) */
  _waitsForRecords(n) { return !!n && this._recordsHeld() && this._unjudged.has(n); }
  /** the boot's archive for the notices' judge (its read r3, N1): a throw is said, never the boot's end */
  _archiveAtBoot() { try { return this._loadArchive() || []; } catch (e) { this.d.log('[jobs] the archive could not be read for the notices\' judge:', e && e.message); return []; } }
  _notifsHold(a) {
    this._notifsUnread = { code: a.code, why: a.why, at: (this._notifsUnread && this._notifsUnread.at) || now() };
    // its read r3 (S1): the archive is in memory before any read again — a clear of an archived job made while held is judged at the
    // read (mid-life the read again never reads the archive on the loop); its own hold is its own (a throw here never ends the boot)
    if (!this.readOnly && !this.archive) { try { this._loadArchive(); } catch (e) { this.d.log('[jobs] the archive could not be read at the notices\' hold:', e && e.message); } }
    this.releasedAtBoot = this.releasedAtBoot || [];
    if (!this._notifsUnreadSaid) {
      this._notifsUnreadSaid = true; this.d.log(`[jobs] job-notifications.json could not be read (${a.code}: ${a.why}) — held: the notices waiting in it are kept, nothing is written over it, new ones wait here, and it is read again off the main loop`);
      // its read r1 (M2): said where the person looks — ONE For-you item, resolved once the file reads
      if (!this._notifsItem) { const v = this._forYou(null, M.forYouCopy(null, 'notifs-unread', { error: a.code, when: this._notifsUnread.at })); if (v && v.id) this._notifsItem = v.id; }
    }
    this._notifsRetrySoon();
  }
  _notifsRetrySoon() {
    if (this._notifsT || this._unreadStopped) return;
    const n = this._notifsTries = (this._notifsTries || 0) + 1;
    const t = this._notifsT = setTimeout(() => { this._notifsT = null; this._notifsRetry().catch((e) => { this.d.log('[jobs] job-notifications.json read again failed:', e && e.message); this._notifsRetrySoon(); }); }, SR.retryDelay(n, this._unreadCfg()));
    t.unref?.();
  }
  /** one read again, OFF this thread; ONE in flight; the next try armed FIRST; a «missing» right after an unreadable answer is
   *  read once more; torn bytes then copied aside off the loop (no place for them: the hold stands) */
  async _notifsRetry() {
    if (!this._notifsUnread) return;
    this._notifsRetrySoon();
    // its read r2 (N3) / r4 (N4): a For-you filing the store refused (full) is asked again at each try — a hanging read too
    if (!this._notifsItem) { const v = this._forYou(null, M.forYouCopy(null, 'notifs-unread', { error: this._notifsUnread.code })); if (v && v.id) this._notifsItem = v.id; }
    if (this._notifsP) return;
    const p = this._notifsP = fs.promises.readFile(this.notifsFile, 'utf-8').then((text) => ({ text }), (error) => ({ error }));
    // its read r2 (N5) / r3 (M1): a read that does not answer within the store's bound is SAID (once) and WAITED FOR — the one slot
    // stays held until it settles (a let-go read keeps its thread of the pool: a new read per try ran it dry), the tries stay armed
    const ms = (this.d.unreadRetry && Number(this.d.unreadRetry.readMs) > 0) ? Number(this.d.unreadRetry.readMs) : READ_AGAIN_MS;   // the store's bound
    const tm = setTimeout(() => { if (this._notifsP === p && !this._notifsSlowSaid) { this._notifsSlowSaid = true; this.d.log(`[jobs] job-notifications.json: a read again has not answered in ${ms / 1000} s — it is waited for (one read at a time); the tries stay armed`); } }, ms);
    tm.unref?.();
    const read = await p; clearTimeout(tm);
    if (!this._notifsUnread || this._unreadStopped) { if (this._notifsP === p) this._notifsP = null; return; }
    let a = SR.storeAnswer(read, { valid: NOTIFS_SHAPE });
    // its read r2 (N2): the one-in-flight slot is held over the copy aside too — a later try never copies the same torn bytes again
    const done = () => { if (this._notifsP === p) this._notifsP = null; };
    if (a.state === 'unreadable') { done(); this._notifsUnread.code = a.code; this._notifsMissingAt = 0; return; }
    if (a.state === 'missing' && !this._notifsMissingAt) { done(); this._notifsMissingAt = now(); return; }
    // its read r3 (S1) / r4 (N1, after the read's own answer): the notices are judged by their jobs' records (a clear made while held) — while jobs.json or the archive is
    // held itself, the read waits (the tries stay armed): never merged unjudged
    if (this._unread.store || this._unread.archive) { done(); if (!this._notifsJudgeSaid) { this._notifsJudgeSaid = true; this.d.log('[jobs] job-notifications.json reads again, but the job records that judge its notices are held — it waits for them'); } return; }
    if (a.state === 'corrupt') {
      const bad = asideOf(this.notifsFile); let to = null;
      if (!this.readOnly) { try { await fs.promises.copyFile(this.notifsFile, bad, fs.constants.COPYFILE_EXCL); to = path.basename(bad); } catch { } }
      done();
      if (this._unreadStopped || !this._notifsUnread) return;   // its read r1 (N3): the engine ended (or a newer try read) during the copy
      a = SR.afterSetAside(a, to);
      if (a.state === 'unreadable') { this._notifsUnread.code = a.code; return; }
    }
    done();
    const was = this._notifsUnread, waiting = [...this.pendingNotifs.values()].reduce((k, l) => k + l.length, 0);
    this._notifsUnread = null; this._notifsMissingAt = 0; this._notifsTries = 0; this._notifsUnreadSaid = false; this._notifsSaveSaid = false;
    if (this._notifsT) { clearTimeout(this._notifsT); this._notifsT = null; }
    if (a.state === 'data') this._notifsFrom(a.value, { merge: true });
    this._drainedWhileHeld = null;   // the set ends with the hold, whatever the read answered (a merge, a file GONE, torn bytes set aside)
    const now2 = [...this.pendingNotifs.values()].reduce((k, l) => k + l.length, 0);
    this.d.log(`[jobs] job-notifications.json read again (held since ${new Date(was.at).toISOString()}, ${was.code}): ${a.state === 'data' ? `${now2 - waiting} notice(s) read` : a.setAside ? `torn bytes, kept aside as ${a.setAside}` : 'the file is GONE'} — ${waiting} that waited here kept`);
    const L = this._saveNotifs(); this._dirty = true;
    // the census cure ((b), a word to a person follows): the held file's For-you item is resolved once the merged notices are ON DISK —
    // landed now, or at their landing (never «resolved» over a store the disk does not hold yet)
    const resolveHeld = () => { if (this._notifsItem) { const id = this._notifsItem; this._notifsItem = null; try { this.d.resolveNotice && this.d.resolveNotice(id); } catch { } } };   // its read r1 (M2): the item resolved
    if (L && L.ok) resolveHeld(); else this._ride(this.notifsFile, 'the held notices read again', resolveHeld);
    // must 2: the steps that waited for the lift (a hand-over's put-back while held) ride THIS save's landing — never before it
    { const waits = this._notifsLiftWaits || []; this._notifsLiftWaits = []; for (const w of waits) { if (w.done) continue; this._ride(this.notifsFile, w.what, w.step).then((r) => { if (w.done) return; w.done = true; if (w.t) clearTimeout(w.t); w.resolve(r); }, (e) => { if (w.done) return; w.done = true; if (w.t) clearTimeout(w.t); w.resolve({ landed: false, why: (e && e.message) || String(e) }); }); } }
    // its read r2 (S2): a read again that found the file GONE or TORN lost what waited in it — said where the person looks, never only in the journal
    if (a.state !== 'data') this._forYou(null, M.forYouCopy(null, 'notifs-lost', { file: a.setAside || path.basename(this.notifsFile) }));
    for (const cid of this.pendingNotifs.keys()) { try { this.d.onStash?.(cid); } catch { } }   // its read r1 (S1): each conversation's strip and its held count follow
    try { this.d.broadcast('jobs-updated', { notifs: true }); } catch { }
  }

  // ── TRIAGE ARCHIVE (2026-09-14, docs/design-background-work.md §13) ─────
  _loadArchive() {
    if (this.archive) return this.archive;
    // B-f276: THE STORE READ (src/store-read.js), as the store's — a failed read is kept and written by nothing (the release set
    // the live archive aside when its stat answered, else started it empty under a write of the next sweep's records over it)
    // B-0248 step 3: an archive write this PROCESS still owes (an engine's own, or the last engine's in this process) is never read
    // past — the archive is held UNREAD (_archiveOwedHold: none of a failed read's notes), read again off the loop at that write's landing
    let owedStill = null;
    // …never flushed here (r1908 (5): no synchronous write on the loop): the read again (_unreadRetry) waits for the landing itself
    try { const W = this._writer(); if (typeof W.pending === 'function' && W.pending(this.archiveFile)) owedStill = 'its write has not landed yet'; } catch { /* no writer: nothing owed */ }
    if (owedStill) return this._archiveOwedHold(owedStill);
    if (this._unread.archive && this._unread.archive.owed) return [];   // held until ITS read again lifts it (never a read on the loop past the hold)
    let read;
    try { read = { text: fs.readFileSync(this.archiveFile, 'utf-8') }; } catch (error) { read = { error }; }
    this._archiveAnswer(SR.storeAnswer(read, { valid: Array.isArray }));
    return this.archive;
  }
  /** B-0248 step 3 (r1908 (5), its fresh read's should): an archive write this PROCESS still owes (a second engine in one process) holds
   *  the archive UNREAD — refused to every writer, «not reached» to a clear, none of its records in memory (the clean-up reads the file
   *  itself) — with NONE of a failed read's notes or items (nothing failed), and it is read again OFF the loop at THAT write's landing
   *  (never a flush on the loop, never the unread backoff). → [] while held */
  _archiveOwedHold(why) {
    if (this._unread.archive && this._unread.archive.owed) return [];
    const base = path.basename(this.archiveFile);
    const hold = this._unread.archive = { code: 'EOWED', why: `the last write of ${base} is still owed (${why})`, at: now(), owed: true };
    this.d.log(`[jobs] ${base}: a write this process still owes has not landed — held unread until it lands, then read again off the loop`);
    // r2255 (2): the read again looks at the writer once more BEFORE it loads — a write this process handed meanwhile (another engine's)
    // is waited for again at ITS landing, never loaded past
    const owedNow = () => { try { const W = this._writer(); return typeof W.pending === 'function' && W.pending(this.archiveFile); } catch { return false; } };
    const again = () => {
      if (this._unread.archive !== hold || this._archiveDisarmed) return;
      if (owedNow()) { this._ride(this.archiveFile, 'the owed archive read again', again); return; }
      fs.promises.readFile(this.archiveFile, 'utf-8').then((text) => ({ text }), (error) => ({ error })).then((read) => {
        if (this._unread.archive !== hold || this._archiveDisarmed) return;
        if (owedNow()) { this._ride(this.archiveFile, 'the owed archive read again', again); return; }   // handed while it read: read at THAT landing
        this._unread.archive = null; this.archive = null; this._unreadSweepSaid = false;   // (a later real hold says its sweep line again)
        const late = SR.storeAnswer(read, { valid: Array.isArray }); this._archiveAnswer(late);   // a read that FAILS now is a failed read: its own road
        try { this.d.broadcast('jobs-updated', { archived: [] }); } catch { }
      });
    };
    this._ride(this.archiveFile, 'the owed archive read again', again);
    return [];
  }
  _archiveAnswer(a, pre = null) {
    if (a.state === 'data') {
      this.archive = a.value.filter((r) => r && typeof r === 'object' && r.id).map(skeletonAccess);
      // B-ef97: a skeleton built while the archive could not answer may stand for an id the archive holds — that id has its record
      // here, the skeleton goes (else a person's acknowledgement would one day archive it OVER the real record, replace-by-id)
      let dropped = 0;
      if (this.jobs.size) { const held = new Set(this.archive.map((r) => r.id)); for (const [id, j] of this.jobs) if (LS.isSkeleton(j) && held.has(id)) { this.jobs.delete(id); dropped++; } }
      if (dropped) { this._dirty = true; this.d.log(`[jobs] ${dropped} recovered skeleton(s) dropped: the archive holds their records`); }
    }
    else {
      // lane job-logs-sweep r3 §1 / r4: as the store's — the bytes set aside before this load returns (renamed, else copied), else the
      // archive's note, THIS PROCESS HOLDING until it is on disk; ENOENT alone is «no records». Round 4 §3: the failed load's
      // main-thread calls are its read (B-f276: no existsSync, no rename of bytes it could not read) and a set-aside of torn bytes
      if (a.state === 'unreadable') { this._unreadHold('archive', a); this._logsHeldFile(this.archiveFile, a.error, 'archive', false); }
      else if (a.state === 'corrupt') {
        const e = a.error || Object.assign(new Error('the archive is not a list of records'), { code: 'ENOTLIST' });   // lane job-logs-sweep r2: a non-list was read as [] with no bytes kept
        const bad = this._logsHeldFile(this.archiveFile, e, 'archive', true, pre);
        if (bad) {
          this.d.log('[jobs] archive corrupt → preserved at', bad, '—', e.message);
          // lane job-logs-sweep r2: the FIRST time the owner hears of it (the release said it in the console only) — the records first, the clean-up second
          this._logsSay(path.basename(bad), 'records-held', { file: path.basename(bad) });
        } else if (!this.readOnly) this._unreadHold('archive', SR.afterSetAside(a, null));   // B-f276: the torn bytes' only copy
      }
      this.archive = [];
    }
    this.archive.sort(archiveOrder);
  }
  /** THE archive write — THROUGH THE STORE WRITER (B-0248 step 3, lane bl-loop-b, 主开发 r1478/r1506): an act (jobs-archive.write,
   *  rank 0), its bytes made NOW, at the hand-off (frozen: never the live array). → at once {ok:false, error} for a refusal BY NAME
   *  (read-only, an UNREAD archive — nothing handed, `answer` never called), else {ok:true, handed:true}; `answer({ok, error?})` at
   *  the LANDING, on the writer's answer road (an answer still waiting at the hub's stop goes out inside its exit flush — the exit
   *  lands a handed archive whole: rank 0). Not landed (failed, or past the writer's bound) is LOUD (log + telemetry) and changes
   *  NOTHING in memory — every caller mutates the store only after ok (verifier 2026-09-16: the sweep used to release records
   *  FIRST, so one swallowed ENOSPC/EACCES/EROFS deleted them for good under a log line that said "archived"); the writer keeps it
   *  and writes it again, and what lands later is what every reader sees (`_archiveWritten`) */
  _writeArchive(next, { onLanded = null, answer = null, replyMs = null, ended = null } = {}) {
    if (this.readOnly) return { ok: false, error: 'read-only' };
    // B-f276: an UNREAD archive is never written over — its records are on disk, not in memory (every caller keeps its records)
    if (this._unread.archive) return { ok: false, error: `${path.basename(this.archiveFile)} could not be read (${this._unread.archive.code}) — it is not written over until a read answers` };
    const arr = next || this._archiveNext();
    let bytes, W;
    try { bytes = storeBytes(arr); W = this._writer(); } catch (e) { return { ok: false, error: e.message }; }
    const seq = ++this._archiveSeq;
    this._archivePending = arr;
    W.dirty(this.archiveFile, { name: 'jobs-archive.write', rank: 0, urgent: true, produce: () => { this._archiveProduced = { arr, seq }; return bytes; }, onWritten: (ok, e) => this._archiveWritten(ok, e) });
    // THE STEP RIDES THE REAL LANDING (the writer's afterLanding — its read's MUST: a write the storage refuses is the writer's to
    // write again, one held past a bound is not a failed one): the records' release, a removal's end, run only once the archive that
    // holds it is on disk, however late; never at a bound. Only the REPLY (a door's) has a bound of its own
    const step = () => { if (this._archiveDisarmed) { if (ended) { try { ended(); } catch { } } return null; } this._archiveWritten(true); return onLanded ? onLanded() : null; };   // r1908: what an ENDED engine leaves undone is said (`ended`)
    const reply = (landed) => { if (!answer) return; try { answer(landed ? { ok: true } : { ok: false, notDurable: true, error: 'its write is not on disk yet (queued or refused by the storage) — it lands by itself' }); } catch (e) { this.d.log('[jobs] an archive answer failed:', (e && e.message) || e); } };
    this._ride(this.archiveFile, 'the archive', step, { timeoutMs: replyMs, answer: reply });
    return { ok: true, handed: true, seq };
  }
  /** what LANDED is the archive every reader sees (monotonic: an older answer never puts an older archive back) */
  _archiveLanded(arr, seq) {
    if (seq <= this._archiveLandedSeq) return;
    this._archiveLandedSeq = seq; this.archive = arr;
    if (this._archivePending === arr) this._archivePending = null;
  }
  /** the writer's own landing: the bytes that LANDED (the newest a coalesced write carried) are what every reader sees; a refusal is
   *  said ONCE until one lands (the writer writes it again: nothing left the store) */
  _archiveWritten(ok, err) {
    if (ok) { this._archiveOwedSaid = false; if (this._archiveProduced) this._archiveLanded(this._archiveProduced.arr, this._archiveProduced.seq); return; }
    if (this._archiveOwedSaid) return; this._archiveOwedSaid = true;
    {
      const e = { message: String((err && (err.code || err.message)) || 'an error') };
      this.d.log('[jobs] archive write FAILED (nothing left the store; the store writer writes it again):', e.message);
      try { this.d.getTelemetry?.()?.record?.({ kind: 'error', name: 'jobs-archive-write-failed', detail: e.message }); } catch { /* telemetry is optional */ }
    }
  }
  /** the archive a BUILDER reads: the one handed and not landed yet, else what landed */
  _archiveNext() { return this._archivePending || this._loadArchive(); }
  /** the hub's stop has begun (the writer's exit): a reply that waits on a later promise would never go out (the ✕ answers at once) */
  exiting() { try { const W = this._writer(); return typeof W.exitStartedAt === 'function' && W.exitStartedAt() != null; } catch { return false; } }
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
  archiveSweep({ now: at = now(), why = 'tick', answer = null } = {}) {
    // r1908 (4): `answer` hears EVERY end — at the landing when records were handed, at once on each early return (nothing moved, all
    // handed already, a refusal)
    const early = (x) => { if (answer) { try { answer(x); } catch (e) { this.d.log('[jobs] a sweep answer failed:', (e && e.message) || e); } } return x; };
    if (this.readOnly) return early({ archived: [], skipped: 'read-only' });
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
    if (!moved.length) return early({ archived: [] });
    // THE ORDER IS THE INVARIANT (verifier 2026-09-16): the archive is written
    // BEFORE a single record leaves the store. The old order — delete, then
    // write behind a catch that only logged, then flush jobs.json — turned one
    // ENOSPC/EACCES/EROFS into 200 deleted records under "archived 200". A
    // store flush that fails AFTER a successful archive write brings the
    // record back at the next boot, so a re-archived id REPLACES its older
    // archive copy instead of duplicating it.
    const arch = this._archiveNext();   // B-0248 step 3: the BUILDERS' base — the archive handed and not landed yet, else what landed
    // B-ef97: a recovered skeleton never moves OVER the archived record of its id (replace-by-id below) — it leaves the store instead
    // (the archive's load drops such skeletons too; this holds for one loaded later — a store the release wrote, read again)
    const archIds = new Set(arch.map((r) => r.id));
    for (let i = moved.length - 1; i >= 0; i--) {
      const id = moved[i].id;
      if (LS.isSkeleton(moved[i]) && archIds.has(id)) { this.jobs.delete(id); this._dirty = true; moved.splice(i, 1); }
      else if (!this.jobs.has(id)) moved.splice(i, 1);
      else if (this._archiveHandedIds.has(id)) moved.splice(i, 1);   // B-0248 step 3: handed by a sweep whose archive has not landed — released at ITS landing, whatever the landed archive holds (never handed twice)
    }
    if (!moved.length) return early({ archived: [] });
    const movedIds = new Set(moved.map((m) => m.id));
    const next = [...moved, ...arch.filter((r) => !movedIds.has(r.id))];
    next.sort(archiveOrder);
    // the cap keeps the NEWEST; a record the cap drops is unreachable from
    // every surface once the archive that no longer names it is on disk, so
    // its log dir goes with it (it would leak for ever)
    const dropped = next.length > ARCHIVE_CAP ? next.splice(ARCHIVE_CAP) : [];
    // B-0248 step 3: THE RECORDS ARE RELEASED AT THE ARCHIVE's LANDING (r1478/r1506): until then a reader sees the archive that
    // LANDED and the store as it was — a record moving out is listed ONCE, as a live job; never twice, never in neither
    const handedSigs = new Map(moved.map((m) => [m.id, storeBytes(this.jobs.get(m.id))]));   // what each live record WAS at the hand-off (the store's own serializer)
    const w = this._writeArchive(next, { onLanded: () => this._sweepLanded({ moved, dropped, why, answer, handedSigs }), ended: () => early({ archived: [], ended: true }), answer: (r) => { if (!r.ok) early({ archived: [], notLanded: true, error: r.error }); } });   // its fresh read's should: the stop answers too
    if (!w.ok && this._unread.archive) {   // cure r2: an UNREAD archive refuses every sweep — said once a hold, never every tick
      if (!this._unreadSweepSaid) { this._unreadSweepSaid = true; this.d.log(`[jobs] archive sweep (${why}): ${moved.length} record(s) released but NOT archived — the store keeps them while ${path.basename(this.archiveFile)} cannot be read (said once until it reads)`); }
      return early({ archived: [], failed: 'archive-unread', kept: moved.length, error: w.error });
    }
    if (!w.ok) {
      this.d.log(`[jobs] archive sweep (${why}): ${moved.length} record(s) released but NOT archived — the store keeps them (${w.error})`);
      return early({ archived: [], failed: 'archive-write', kept: moved.length, error: w.error });
    }
    for (const m of moved) this._archiveHandedIds.add(m.id);
    return { archived: [], handed: moved.map((m) => m.id) };
  }
  /** the sweep's archive LANDED: only now do its records leave the store — each one still AS HANDED (its read's MUST: a record a person
   *  removed, ran again or changed in the window stays the store's — and its handed copy is taken out of the archive again by a
   *  follow-up write, so nothing they did is undone and no record is listed twice); then jobs.json's save, and the cap's dropped
   *  records' log folders only once THAT save landed too (r1506: a crash between leaves a folder, never a record without its logs) */
  _sweepLanded({ moved, dropped, why, answer, handedSigs }) {
    const tell = (x) => { if (answer) { try { answer(x); } catch (e) { this.d.log('[jobs] a sweep answer failed:', (e && e.message) || e); } } };
    for (const m of moved) this._archiveHandedIds.delete(m.id);
    const out = [], back = [];
    for (const m of moved) { const j = this.jobs.get(m.id); if (j && storeBytes(j) === handedSigs.get(m.id)) out.push(m); else back.push(m.id); }
    for (const m of out) { this.jobs.delete(m.id); this.waiters.delete(m.id); this.ansWaiters.delete(m.id); }
    this._vaultGone(out); // lane vault-job-approval: an archived one-shot runs no more — its approval leaves the row (it would hold one of the member's 64 places for ever); B-0248 step 3: at the archive's landing, for the records it released
    if (out.length) { this._dirty = true; this._save(); }   // a failed flush retries on the 2 s timer; a boot re-archive is idempotent (see above)
    if (dropped.length) { const ids = dropped.map((d) => d.id); this._ride(this.file, 'the archive cap\'s dropped records', () => this._logsWhole(ids)); }   // lane job-logs-sweep: off the main thread, after jobs.json landed
    if (back.length) {   // the copies of records that moved on, out again — hidden from every reader until that write lands, the pages told then
      const gone = new Set(back); for (const id of back) this._archiveTakingOut.add(id);
      this._writeArchive(this._archiveNext().filter((r) => !gone.has(r.id)), { onLanded: () => { for (const id of back) this._archiveTakingOut.delete(id); try { this.d.broadcast('jobs-updated', { archived: [] }); } catch { } } });
    }
    this.d.log(`[jobs] archived ${out.length} one-shot(s) (${why}; ${out.map((m) => m.archivedWhy).filter((x, i, a) => a.indexOf(x) === i).join(', ')})${dropped.length ? `, cap dropped ${dropped.length}` : ''}${back.length ? `, ${back.length} kept (changed since its hand-off)` : ''}`);
    try { this.d.broadcast('jobs-updated', { archived: out.map((m) => m.id) }); } catch { }
    return tell({ archived: out.map((m) => m.id), dropped: dropped.length });
  }
  /** a cron child whose parent still schedules fires is that cron's run ring */
  _cronParentActive(job) {
    if (!job.cronParent) return false;
    const p = this.jobs.get(job.cronParent);
    // B-c17d: a fired `--at` cron (state 'done', no fire to come) schedules nothing more — its child ages like any one-shot
    return !!p && p.desiredUp !== false && p.state !== 'missed' && p.state !== 'done';
  }
  /** the STRUCTURE every surface renders the held-notification count from
   *  (5b): per conversation, by typed reason — the client says the words */
  heldDigest() { return M.heldDigest(this.pendingNotifs); }
  // B-0248 step 3: a record still LIVE is listed once — as live (a copy that landed before its release, or one a follow-up takes out)
  archivedList() { const a = this._loadArchive(), out = (r) => this.jobs.has(r.id) || this._archiveTakingOut.has(r.id); return a.some(out) ? a.filter((r) => !out(r)) : a; }   // (and a copy a follow-up is taking out)
  archivedCount() { return this.archivedList().length; }
  archivedById(id) { if (this.jobs.has(id) || this._archiveTakingOut.has(id)) return null; return this._loadArchive().find((r) => r.id === id) || null; }
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
    if (this._unread.archive) out.archiveUnread = this._unread.archive.owed ? `Background Work: archived records could not be reached, so their words were not cleared — a write of ${path.basename(this.archiveFile)} this process made has not landed yet; it is read again by itself the moment it lands, then clear them again` : this.unreadWords('archived records could not be reached, so their words were not cleared — clear them again once it reads', 'archive');   // cure r2; r2255 (2): an OWED write's hold says its own words (no For-you item, no read every few minutes)
    const want = new Set((Array.isArray(ids) ? ids : [ids]).map(String));
    const arch = this._archiveNext();   // B-0248 step 3: the builders' base (an archive handed, not landed yet, else what landed); its door answers through persisted()
    const family = (j) => want.has(j.id) || (j.cronParent && want.has(j.cronParent));
    const seen = new Set();
    // 1) decide every record first (nothing written yet)
    const liveHits = [...this.jobs.values()].filter(family);
    let clearLanded = false, clearMade = false;   // r1908 (1): the archive's landing and the end of this call, whichever comes last, tells
    const tellCleared = () => { if (out.cleared.length) { try { this.d.broadcast('jobs-updated', { cleared: out.cleared }); } catch { } } };
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
      // r1908 (1): EVERY CLIENT SEES THE LANDING — an archived record's clear is told when the archive holding it lands (a page that
      // refetched at the hand-off read the landed archive, the old words, and heard nothing again); a live one's at once (memory is its)
      // ONE broadcast naming every cleared record (the clear's own law) — at the archive's landing when the clear touched an archived one
      const w = this._writeArchive(next, { onLanded: () => { clearLanded = true; if (clearMade) tellCleared(); } });
      if (!w.ok) return { error: 'archive write failed: ' + w.error };
      out.archiveSeq = w.seq;   // B-0248 step 3: its door (record-clear) waits for THIS archive write too — persisted({ archiveSeq })
    }
    // 3) the registry, in place (a live record keeps its runtime-only fields)
    let liveChanged = false;
    const askGone = [];   // lane lg-store-writes (the moved2 cure 2): an ask closed by the clear — its wait woken and its For-you item resolved RIDE jobs.json's landing
    for (const j of liveHits) {
      if (!go(j)) continue;
      if (j.clearedAt) { j.reclearedAt = at; liveChanged = true; }   // cleared before this call (see step 2)
      if (applyClear(j, { kind: 'job', by, at }).changed) {
        liveChanged = true; seen.add(j.id);
        // the ASK went with the words (verify r3): a job parked on a question the owner cleared is
        // no longer waiting on it — back to `up`, and the question's For-you item is resolved (the
        // cascade in src/server/record-clear.js then clears that item's words like every other)
        if (j.state === 'awaiting-user' && !(j.interaction && j.interaction.pending)) { j.state = 'up'; askGone.push(j); }   // its wait and For-you item ride the record's landing (below)
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
    const svcLabels = new Set([...gone].map((id) => nameBefore.get(id)).filter((n) => n && n !== CLEARED_TEXT).flatMap((n) => ['service: ' + n, 'service: ' + this._agentWords(n), 'service: ' + this._nameWords(n)]));   // r4: a forward labelled since .361 carries the BELTED name — an older one the raw
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
    // THE STEP RIDES THE LANDING (no roll back): the cleared asks' waits and For-you items close once jobs.json holds the clear — by
    // themselves when the storage answers late (the route's reply says «not on disk yet»: record-clear's persisted); a kill first
    // leaves the old record, the question still asked
    if (askGone.length) this._ride(this.file, 'the cleared asks', () => { for (const j of askGone) { this._resolveAns(j); try { this.d.resolveJobAsk && this.d.resolveJobAsk(j.id); } catch { } } });
    // lane vault-job-approval: a cleared job's approval goes with its words — its next start asks again (ONE write), riding the
    // landing like the cleared asks (a kill first: the record comes back whole, its approval kept)
    const vaultCleared = [...liveHits, ...archHits].filter((j) => gone.has(j.id) && VJ.refsOf(j).length);
    if (vaultCleared.length) this._ride(this.file, 'the cleared approvals', () => this._vaultGone(vaultCleared));
    clearMade = true; if (!archChanged || clearLanded) tellCleared();   // r1908 (1): an archived record's clear is told at its archive's landing
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
      const j = this.jobs.get(id) || (this._archiveNext() || []).find((r) => r && r.id === id) || null;   // B-0248 step 3: a clear handed and not landed yet is a clear
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
  /** ✕ on an archived row: gone for good (record + its log dir). B-0248 step 3: the row stays until its removal LANDS — `answer(r)`
   *  (the routes') at the landing: {ok} then its log dir goes and the pages are told; {error, notDurable} past the writer's bound
   *  or refused (the row still there). → at once {error} for a refusal by name, else {ok, pending} (the answer comes) */
  rmArchived(id, answer = null) {
    if (this.readOnly) return { error: 'registry is read-only in this process' };
    if (this.jobs.has(id)) return { error: 'that job is live — not an archived row', code: 'live' };   // a stale archived copy of a live record is never the ✕'s
    const arch = this._archiveNext();
    const i = arch.findIndex((r) => r.id === id);
    if (i < 0) return (this._loadArchive() || []).some((r) => r.id === id) ? { error: 'its removal is not on disk yet — it finishes by itself', code: 'being-removed' } : { error: 'no such archived job' };
    if (this._notifsUnread && arch[i].clearedAt) return { error: this._notifsClearedWords(id), code: 'notifs-unread' };   // the B-f276 remainder (5), its read r2 (M2)
    const tell = (r) => { if (answer) { try { answer(r); } catch (e) { this.d.log('[jobs] a removal answer failed:', (e && e.message) || e); } } };
    // the removal's end rides the REAL landing (its dir, the pages told); the reply is bounded at 15 s, under the CLI's write budget
    // r1917: logsGone() asked between the hand-off and the landing WAITS for the landing — never «gone» for a folder the remover was not
    // handed yet (the landing's step hands it, and its promise is what this one becomes)
    let atLanding = null; const handed = new Promise((r) => { atLanding = r; });
    this._logsGone.set(id, handed); handed.then(() => { if (this._logsGone.get(id) === handed) this._logsGone.delete(id); });
    const replyMs = Number(this.d.rmReplyMs) > 0 ? Number(this.d.rmReplyMs) : 15000;   // the deps knob = a fast suite's seam only
    const ended = () => { this.d.log(`[jobs] ${id}: its removal landed after the jobs engine ended — its log folder is left to the log clean-up's own pass (a folder no record names goes once it ages past the retention)`); atLanding({ pending: true }); this._logsGone.set(id, Promise.resolve({ pending: true })); };   // r1908 (the round's lens 1): said, and logsGone answers «still being deleted» whenever it is asked (r2001: never the map's default once settled)
    const w = this._writeArchive(arch.filter((r) => r.id !== id), { onLanded: () => atLanding(this._rmLanded(id)), replyMs, ended, answer: (r) => { if (!r.ok && this._logsGone.get(id) === handed) this._logsGone.set(id, Promise.resolve({ pending: true })); tell(r.ok ? { ok: true } : { error: 'archive write not on disk yet: ' + r.error, notDurable: true }); } });   // r1963: past the ✕'s bound a later logsGone() says «pending» at once (never a wait with a write that may never land); the landing replaces it
    if (!w.ok) { atLanding({ pending: true }); return { error: 'archive write failed: ' + w.error }; } // the row stays until its removal is durable
    return { ok: true, pending: true };
  }
  /** the removal LANDED: its dir goes, the pages told */
  _rmLanded(id) {
    // lane job-logs-sweep: its dir goes off the main thread; the routes answer the person once it is gone (logsGone, bounded)
    const gone = this._logsWhole([id]).then((a) => (!a || a.error ? { pending: true } : (a.gone || []).includes(id) ? { gone: true } : { kept: (a.keptWhy || {})[id] || 'pending' }));   // round 2: the promise names what stays and why
    this._logsGone.set(id, gone); gone.then(() => { if (this._logsGone.get(id) === gone) this._logsGone.delete(id); });
    try { this.d.broadcast('jobs-updated', { id, removed: true, archived: true }); } catch { }
    return gone;   // r1917: what a logsGone() asked before the landing becomes
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
      // context the owner attached too. A subscriber's --filter matches the belted words it receives — UNMARKED (lane
      // jobs-addressed-push L4: the copy it is handed says it is a subscription — «another conversation's job; you subscribed»,
      // «Context its owner attached», «Its words are addressed to its owner» — and a /conversation|owner/ filter must not start
      // taking every event because of those words: the filter reads the copy without them, the subscriber gets the copy with them).
      const name = this.labelOf(job);
      const notifText = M.renderOwnerNotify(job, ev, { name });
      const subEv = ev && ev.agentWhat ? { ...ev, what: this._agentWords(ev.what) } : ev;
      const ctx0 = !job.context ? '' : typeof job.context === 'string' ? job.context : (job.context.payload || '');
      const subCtx = ctx0 ? this._agentWords(ctx0) : '';
      const subPlain = M.renderOwnerNotify(job, subEv, { name, context: subCtx });
      const subText = M.renderOwnerNotify(job, subEv, { name, context: subCtx, subscriber: true });
      // r2/r3 (the acceptance's laws B + C — final): a subscriber is told IF AND ONLY IF, at the moment of the push, THE predicate
      // the pull uses (canView inside addressedTo) says it may view the job — judged by what the server knows of that conversation
      // NOW (`viewerOf`: a live record's groups; with no live record, the group store's membership of its key). Never the job's own
      // groups, never a proof kept from subscribe time. 'owner' ⇒ the OWNER's copy (the base's bytes); 'subscriber' ⇒ the marked
      // copy; '' with a live record ⇒ not told (no message, no wake, no stash — its poll answers 404 too); '' with NO live record
      // ⇒ the server cannot know (a folder's auto-join needs a cwd only a live record has): no wake is spent — the line waits in
      // the stash and the DRAIN judges view at the turn that would print it (peekNotifs). An engine wired with no view source
      // (`viewerOf` absent — a test's) delivers as before this lane; the product's wiring always has one (test-jobs-addressed §6).
      const seenSubs = new Set();
      for (const sub of [...(job.subscribers || []), ...((parent && parent.subscribers) || [])]) {
        if (!sub.conversationId || sub.conversationId === cid || seenSubs.has(sub.conversationId)) continue;
        seenSubs.add(sub.conversationId);
        // r6: THE PUSH READS THE ONE VERDICT (viewVerdict — the drain and the ladder's retry read the same function)
        const as = { conversationId: sub.conversationId, sessionId: sub.sessionId || null, sessionCreatedAt: sub.sessionCreatedAt, groups: new Set() };
        const verdict = this.viewVerdict(sub.conversationId, job, { fallback: as, parent });   // r7: the job IN HAND (a record that left the store is still judged — never a lookup's «owner»)
        if (!M.filterMatches(sub.filter, subPlain)) continue;
        if (verdict === 'refused' || verdict === 'gone') { this.d.log(`[jobs] ${job.id}: subscriber ${sub.conversationId} can no longer view it — not told (no message, no wake, no stash)`); continue; }
        if (verdict === 'groups-unread') {   // THE STORE HELD UNREAD (lane bl-windows): its own kind and words — the store, never «not running»
          this._stashNotif(sub.conversationId, job, subEv, 'held: the Task Groups store cannot be read — judged when it reads', { stampLast: false, held: { kind: 'groups-unread' }, mark: !M.ownerLineage(job, as) });
          this.d.log(`[jobs] ${job.id}: subscriber ${sub.conversationId} — the Task Groups store cannot be read, its view is unknown: held for the drain (no wake), judged when the store reads`);
          continue;
        }
        if (verdict === 'unknown') {
          this._stashNotif(sub.conversationId, job, subEv, 'held: no live record proves its view — judged at the turn that would print it', { stampLast: false, held: { kind: 'not-running' }, mark: !M.ownerLineage(job, as) });
          this.d.log(`[jobs] ${job.id}: subscriber ${sub.conversationId} has no live record and the group store does not show it a member — held for the drain (no wake)`);
          continue;
        }
        this._deliverTo(sub.conversationId, job, subEv, { subscriber: true, mark: verdict === 'subscriber', text: verdict === 'subscriber' ? subText : subPlain });
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
  _deliverTo(cid, job, ev, { subscriber, mark = false, text: preText } = {}) {
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
      if (!subscriber && this._awayOpen(cid, job)) this._awayFailure(cid, job, ev);   // B-2566: the same failure again while its owner is away — COUNTED (the episode's item renews)
      return;
    }
    if (rate.ts && now() - rate.ts < 30_000) {
      this._stashNotif(cid, job, ev, 'rate floor — queued for injection instead', { stampLast: !subscriber, held: { kind: 'rate-floor' }, mark });
      // place-8 (主开发 2026-11-20 03:44Z): the floor paces SOCKET posts — an ENDED conversation takes none (the stamp may be an attempt
      // that reached nothing), so a floored delivery to it still owes its wake; the words are stashed first, parkEndedWake refuses a live one
      // B-95fc (round w00h341sv): it asks the park's own «live» (liveForWake — a remote conversation its machine said ended is not live), else the reach
      const liveOf = (c) => this._ownerLive(c);   // B-2566 (主开发 r537): the ONE «is the owner live» of this file — the away failure asks it too
      if (!(liveOf && liveOf(cid))) this._oweWake(cid, job, ev, { subscriber });
      if (!subscriber) this._awayFailure(cid, job, ev, this._lastStashed(cid, job));   // B-2566: …and a FAILURE reaches a person by name (the ONE verdict inside)
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
    const retry = { producer: 'jobs', meta: { jobId: job.id, jobName: this.labelOf(job), ev: { what: (ev && ev.what) || job.state, at: (ev && ev.at) || now(), ...(!subscriber && ev && ev.wake === 'result' && ev.personTold !== true && job.state === 'failed' ? { away: M.awayFactsOf(job) } : {}) }, subscriber: !!subscriber, ...(mark ? { sub: true } : {}) } };   // the NAME belted (lane job-notify-user r3)
    const deliver = this.d.deliverToConversation
      ? this.d.deliverToConversation(cid, text, { fromName: 'Background Work · ' + this.labelOf(job), kind: 'notification', spendReason: 'job-notification', retry })
      : Promise.resolve({ ok: false, reason: 'no delivery lane wired' });
    Promise.resolve(deliver).then((r) => {
      if (r && r.ok) {
        if (r.hostId) this._machineAwaySettle();   // B-2566's remainder: a delivery landed on a paired machine — it replies
        if (!subscriber) job.lastNotify = { ts: now(), lane: r.lane || 'message', ok: true, to: r.peerName || null };
        this._notifyLogPush(job, { lane: r.lane || 'message', ok: true, to: r.peerName || null, ...(subscriber ? { sub: true } : {}) });
      } else if (r && r.parked === true) {
        // parked, never stashed: the ladder retries it at the conversation's turn end and on its backoff; the
        // journal line is this engine's R2 measurement (phase / busy / late) and the panel's Delivery log reads it
        if (!subscriber) job.lastNotify = { ts: now(), lane: 'retry', ok: false, reason: r.reason || 'timeout', retryAt: r.retryAt || null };
        this._notifyLogPush(job, { lane: 'message', ok: false, parked: true, id: r.id || null, reason: r.reason || 'timeout', phase: r.phase || null, busy: r.busy === true || r.busy === false ? r.busy : null, ...(Number(r.late) > 0 ? { late: Number(r.late) } : {}), retryAt: r.retryAt || null, retries: 0, to: String(cid).slice(0, 8), ...(subscriber ? { sub: true } : {}) });
        this.d.log(`[jobs] notify → parked for retry for ${cid} (${r.reason || 'timeout'}; phase ${r.phase || '?'}; target mid-turn: ${r.busy === true ? 'yes' : r.busy === false ? 'no' : 'unknown'}${Number(r.late) > 0 ? `; our loop was ${Number(r.late)} ms late` : ''}; next attempt ${r.retryAt ? new Date(r.retryAt).toISOString() : '?'} or at the turn end)`);
      } else {
        this._stashNotif(cid, job, ev, (r && r.reason) || 'unreachable', { stampLast: !subscriber, held: heldOf(r, (r && r.reason) || 'unreachable'), mark });
        if (r && r.notRunning === true) this._oweWake(cid, job, ev, { subscriber });   // the manager design's piece 7: the words are stashed (durable) FIRST
        if (r && r.notRunning === true && r.unreachable !== true && !subscriber) this._awayFailure(cid, job, ev, this._lastStashed(cid, job));   // B-2566: …and a FAILURE reaches a person by name
        if (r && r.unreachable === true) this._machineAway(r.hostId);   // B-2566's remainder: ONE item a machine an outage, never one a job (主开发 r1149)
        this._save();   // the moved2 census (its jobs pass): a copy STASHED after its delivery failed is that notice's only copy — urgent, never the paced tick
      }
      this._dirty = true;
      try { this.d.broadcast('jobs-updated', { id: job.id }); } catch { }
    }).catch((e) => {
      this._stashNotif(cid, job, ev, e.message, { stampLast: !subscriber, held: { kind: 'not-reachable' }, mark }); // degrade path logs verbatim inside
      this._save();   // the moved2 census: the stashed copy is the notice's only one — urgent
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
  /** an owed wake's ANSWER, on ONE job's journal: the `wake` lane, carrying the conversation (a limit: until when) */
  _wakeAnswered(cid, jobId, extra = {}) {
    const wj = this.jobs.get(jobId) || null;
    if (!wj) return;
    const delivered = extra.outcome === 'delivered';
    const i18n = DW.journalWords(delivered ? 'resuming' : 'refused', { why: extra.why || extra.outcome || '' });
    this._notifyLogPush(wj, { lane: 'wake', ok: delivered, to: cid, outcome: extra.outcome || null, reason: delivered ? 'resumed its ended owner to deliver this' : `its owner is ended and was not resumed: ${extra.why || extra.outcome || 'unknown'}`, i18n: { key: i18n.key, params: i18n.params }, ...(extra.until ? { until: extra.until } : {}), ...(extra.sessionId ? { sessionId: extra.sessionId } : {}) });
    if (delivered) wj.lastNotify = { ts: now(), lane: 'wake', ok: true, to: cid };
    this._dirty = true;
    try { this.d.broadcast('jobs-updated', { id: wj.id }); } catch { }
  }
  _onRetryEvent(ev, cid, entry, extra = {}) {
    if (ev === 'wake' && extra && extra.code === 'unpaired') this._machineUnpaired(cid);   // B-2566's remainder (r1277 (6))
    else if (ev === 'wake' && extra && extra.outcome === 'running' && (extra.code === 'agent_older' || extra.code === 'no_link')) this._machineWordless(cid, extra.code);   // r1397 (1)
    else if (ev === 'wake' && extra && (extra.outcome === 'refused' || extra.outcome === 'failed')) this._machineReplied(cid);   // r1397 (3)
    // the manager design's piece 7: an owed wake's ANSWER reaches EVERY job it carries, whichever producer asked first (a
    // peer's wake and a job's result ride ONE wake; each delivery's own facts are in `metas`)
    if (ev === 'wake' && entry && Array.isArray(entry.metas)) { for (const id of new Set(entry.metas.filter((m) => m && m.jobId).map((m) => m.jobId))) this._wakeAnswered(cid, id, extra); return false; }
    if (!entry || entry.producer !== 'jobs' || !entry.meta || !entry.meta.jobId) return false;
    if (ev === 'wake-owed') return false;   // _oweWake already journaled the owed wake
    if (ev === 'wake') { this._wakeAnswered(cid, entry.meta.jobId, extra); return false; }   // an entry written before `metas`
    // B-54b7 (its re-read's should 3, 主开发 r739): an entry THIS engine saw parked can have no twin in a file the previous process left —
    // known by its own event, never by a clock; kept while it is parked, at most a bound of the newest (one pruned is only taken, never lost)
    if (ev === 'parked') { const P = this._parkedHere || (this._parkedHere = new Set()); P.add(entry.id); if (P.size > 2000) P.delete(P.values().next().value); }
    else if ((ev === 'delivered' || ev === 'fell' || ev === 'dropped') && this._parkedHere) this._parkedHere.delete(entry.id);
    if ((ev === 'delivered' || ev === 'fell') && this._retryVerdicts) this._retryVerdicts.delete(entry.id);   // r6: the memo ends with its entry
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
    if (ev === 'dropped') {   // r4/r5: the ladder dropped a subscriber's parked copy — the parked line closes, saying what happened
      const verdict = this._retryVerdicts && this._retryVerdicts.get(entry.id);
      if (this._retryVerdicts) this._retryVerdicts.delete(entry.id);
      if (verdict === 'held-copy') return true;   // B-54b7 (iv): the copy is already on disk here — nothing to close, nothing stashed again
      if (verdict === 'held-file') {   // B-54b7 (主开发 r739): the previous process's entry while the file is held — TAKEN, never posted; its line waits with no next attempt
        if (job) { const line = [...(job.notifyLog || [])].reverse().find((l) => l && l.parked && l.id === entry.id); if (line) { line.retries = retries; line.nextAt = null; } this._dirty = true; }
        this._save(); return this._taken(this._parkCopyIn(cid, entry.id));
      }
      const why = extra.threw ? 'the delivery check failed — not delivered (withheld)'
        : verdict === 'groups-unread' ? 'the Task Groups store cannot be read — held until it reads, judged then'
        : verdict === 'unknown' ? 'no live record proves its view — held for its next turn, judged there'
          : verdict === 'gone' ? 'nothing of the job remains — not delivered'
            : 'the subscriber can no longer view the job — not delivered';
      if (job) { const line = [...(job.notifyLog || [])].reverse().find((l) => l && l.parked && l.id === entry.id); if (line) { line.retries = retries; line.nextAt = null; line.dropped = true; line.reason = why; } this._dirty = true; }
      // the judge's HELD line (verdict unknown — retryOwed stashed it): the park's copy leaves its file only once the line it became
      // is on disk here (the moved2 cure 2's hunt (3) — the ladder rides this landing)
      // B-54b7 (ALSO CURED): a HELD VIEW's line (groups-unread) is a held line too — it answered a plain «taken» and the park's copy left
      // before the line was on disk; both ride the copy's own landing now
      if (verdict === 'unknown' || verdict === 'groups-unread') { this._save(); return this._taken(this._parkCopyIn(cid, entry.id)); }
      return true;
    }
    if (ev === 'fell') {
      // verify r4 (T1 S4/S22, reproduced): `expired` was the one detail this listener dropped — the digest's tail
      // ("The hour of retries passed…", job-model NOTIF_TAIL_DETAIL) could never fire for a jobs notification, and the
      // parked Delivery-log line stayed one retry short of the attempts the stash line named (the last attempt's
      // failure IS the fall: no `attempt` event follows it) — the line is closed here with the attempts as counted
      const held = { kind: extra.kind || 'not-reachable', ...(extra.why ? { why: String(extra.why) } : {}), ...(extra.maybeDelivered === true ? { maybeDelivered: true } : {}), ...(extra.evicted === true ? { evicted: true } : {}), ...(extra.expired === true ? { expired: true } : {}), ...(extra.identity ? { identity: String(extra.identity) } : {}), ...(Number.isFinite(Number(extra.cap)) && extra.cap != null ? { cap: Number(extra.cap) } : {}), ...(Number(extra.retryAfter) > 0 ? { retryAfter: Number(extra.retryAfter) } : {}), attempts: Number(extra.attempts) || entry.attempts.length, ...(extra.phase ? { phase: String(extra.phase) } : {}), ...(extra.busy === true || extra.busy === false ? { busy: extra.busy } : {}) };
      if (job) { const line = [...(job.notifyLog || [])].reverse().find((l) => l && l.parked && l.id === entry.id); if (line) { line.retries = retries; line.nextAt = null; } }
      if (this._parkOnDisk && this._parkOnDisk.has(entry.id)) return true;   // B-54b7 (iv): its copy is already on disk here — never stashed twice
      const target = job || { id: meta.jobId, name: meta.jobName || meta.jobId };   // the record is gone: the stash still names it
      this._stashNotif(cid, target, { what: (meta.ev && meta.ev.what) || meta.jobName, at: (meta.ev && meta.ev.at) || entry.firstAt }, extra.reason || held.kind, { stampLast: !subscriber && !!job, held, mark: !!meta.sub, park: entry.id });
      if (job && !subscriber && meta.ev && meta.ev.away && held.kind === 'not-running') this._awayFailure(cid, job, { wake: 'result', away: meta.ev.away }, this._lastStashed(cid, job));   // B-2566: a failure parked for a live owner that ENDED before it landed — its OWN run's facts
      this._save();   // the fallen entry's ONE copy is now this store's: an act, urgent (the 2 s tick was the only save — the hunt (2))
      try { this.d.broadcast('jobs-updated', { id: meta.jobId }); } catch { }
      return this._taken(this._parkCopyIn(cid, entry.id));
    }
    return false;
  }
  /** A PARKED ENTRY THIS STORE TOOK (a fall, the judge's held line): the ladder (src/server/conversation-deliver.js) removes its
   *  park copy from msg-retry.json only once the notifications holding it are on disk — `ride(step)` (the moved2 cure 2).
   *  B-54b7 (主开发 r519, shape B — THE WAIT AT THE TAKE): while job-notifications.json is HELD the writer owes nothing for it, and a plain
   *  ride ran the step AT ONCE — the park's one durable copy left for a stash line in memory only, and a crash lost that notice. The step
   *  now rides the copy's OWN landing: the writer's, or — while held — the lift's save (ONE wait for every taken copy, never one each).
   *  While held the copy (`item`) is invisible to every delivery door until then (_waitsForLanding); its leaving the stash first lets the
   *  park's copy go. A file that reads needs no wait: each door (drain, claim) lands its own write first, and that landing lets the park's go. */
  _taken(item = null) { return { taken: true, ride: (step) => this._rideTaken(item, step) }; }
  _rideTaken(item, step) {
    const U = this._unlanded, rec = item && U ? U.get(item) : null;
    let ran = false;
    const go = () => { if (ran) return; ran = true; if (item && U && U.get(item) === rec) U.delete(item); step(); };
    if (item && !rec) { go(); return; }   // its copy already left the stash (the cap, a drop): the park's copy leaves now
    if (rec) rec.go = go;
    if (rec && rec.held) { this._takenLift(); return; }
    this._ride(this.notifsFile, 'a parked notification the jobs store took', go);
  }
  /** while held: ONE step on the lift's own save runs the steps of the copies taken WHILE HELD — they are all in that save (the merge keeps
   *  memory's); a take after the lift rides its own landing, never this one (its read's should 1); each step alone (one that throws stops
   *  none of the others); a held copy whose ladder handed no step is simply visible from here */
  _takenLift() {
    if (this._takenLiftArmed) return;
    this._takenLiftArmed = true;
    this._afterNotifsLift('the parked notifications the jobs store took', () => {
      this._takenLiftArmed = false;
      const told = new Set();
      for (const [item, rec] of [...(this._unlanded || [])]) {
        if (!rec.held) continue;
        told.add(rec.cid);
        if (!rec.go) { this._unlanded.delete(item); continue; }
        try { rec.go(); } catch (e) { this.d.log('[jobs] a parked notification\'s step at the read again failed:', e && e.message); }
      }
      // its re-read's should 1: the copies are offered from HERE (their landing) — each conversation's strip and its wake chain are told now
      // (the lift's own word went out before this landing, while they were still hidden)
      for (const c of told) { try { this.d.onStash?.(c); } catch { } }
      if (told.size) { try { this.d.broadcast('jobs-updated', { notifs: true }); } catch { } }
    });
  }
  /** the stash copy taken for park entry `id` (the newest — `_stashNotif` just pushed it) */
  _parkCopyIn(cid, id) { const U = this._unlanded, q = (U && this.pendingNotifs.get(cid)) || []; for (let i = q.length - 1; i >= 0; i--) if (q[i] && q[i].rt === id && U.has(q[i])) return q[i]; return null; }
  /** a taken copy left the stash before its landing (the cap, a drop): the park's copy leaves now — what it held is said by that road */
  _letParkGo(n) { const rec = n && this._unlanded ? this._unlanded.get(n) : null; if (!rec) return; this._unlanded.delete(n); if (rec.go) rec.go(); }
  /** B-54b7: a copy taken from the ladder WHILE job-notifications.json was held waits for its own step — no door delivers it before (its
   *  park copy is still on disk: delivered from memory, then a crash, the park's copy came back — twice); the hold's end is not its landing
   *  (its read's should 2: the lift's save may not land at once) */
  _waitsForLanding(n) { const rec = n && this._unlanded ? this._unlanded.get(n) : null; return !!rec && rec.held; }
  /** bounded per-job delivery journal (2.361.5, owner ask: "投递细节我好监控")
   *  — one entry per delivery ATTEMPT outcome, any lane. Rides the registry
   *  record; the panel renders it under the Auto-notify row. */
  _notifyLogPush(job, e) {
    job.notifyLog = [...(job.notifyLog || []), { ts: now(), ...e }].slice(-12);
    this._dirty = true;
  }
  /** THE MANAGER DESIGN'S PIECE 7 — an ENDED owner is owed ONE wake for its job's result / a schedule's reminder / a missed one-time
   *  run / a task a restart interrupted (src/delivery-wake.js owesWake: never a subscriber's copy). The
   *  words are already in this engine's stash; the park's rung puts the conversation on the hub's resume line, whose answer comes
   *  back as the park's `wake` event (_onRetryEvent → the journal's `wake` line). */
  _oweWake(cid, job, ev, { subscriber = false } = {}) {
    if (typeof this.d.parkEndedWake !== 'function') return null;
    const v = DW.owesWake({ producer: 'jobs', kind: subscriber ? 'subscriber' : (ev && ev.wake) || null });
    if (!v.owe) return null;
    let r = null;
    const label = this.labelOf(job);   // the ONE accessor (test-architecture §93), named once
    try { r = this.d.parkEndedWake(cid, { producer: 'jobs', spendReason: v.reason, kind: 'notification', fromName: `Background Work · ${label}`, reason: (ev && ev.what) || job.state, meta: { jobId: job.id, jobName: label, wake: ev.wake } }); }
    catch (e) { this.d.log(`[jobs] ${cid}: the owed wake could not be parked — ${e.message} (the words wait in the stash)`); return null; }
    if (r && r.parked) this._notifyLogPush(job, { lane: 'wake', ok: null, owed: true, to: cid, reason: r.merged ? 'its owner is ended — this rides the wake it is already owed' : 'its owner is ended — owed a wake: it goes to the resume line' });
    return r;
  }
  /** B-2566 (主开发 r327/r339 — a failed job whose owner conversation is ended or archived reached nobody but a groupmate's id-less count:
   *  its words waited in the owner's stash, drained only at a resume): A FAILURE OF A JOB WHOSE OWNER IS NOT RUNNING REACHES A PERSON BY
   *  NAME — the job, what failed (the engine's own words: exit + cause, never a line of the run's output) and the door to its log (the
   *  item names its job: For you's click lands on its row in Background Work). ONE item a job — a cron's identity is its SCHEDULE (each
   *  fire is a new child) — for the owner's WAITING EPISODE: the first failure files it, a later one RENEWS its count only while it is
   *  open (a person's close stands for the episode — never once a failure for a cron that fails every minute), and the owner receiving
   *  its notices ends the episode (_awaySettled). A failure the person was ALREADY told by name (a park's copy, a --notify-user end) is
   *  not said twice (`ev.personTold`). The person is For you's: the instance's owner; the item sits under the job's own owner
   *  conversation (its record) — a groupmate's agent still sees only the count (job-model othersFailedLine). → the door's verdict | null */
  _awayFailure(cid, job, ev, entry = null) {
    if (!cid || !job || !ev || ev.wake !== 'result' || ev.personTold === true) return null;
    const carried = ev.away && typeof ev.away === 'object' ? ev.away : null;   // a park's fall: the facts of ITS run (the schedule may have fired again)
    if (!carried && job.state !== 'failed') return null;
    if (typeof this.d.resolveAwayFailed !== 'function') return null;   // r537: filed only where its close is wired (the product's wiring) — never an item nobody closes
    if (typeof this.d.ownerUnreachable === 'function' && this.d.ownerUnreachable(cid)) return null;   // B-2566's remainder (r1149 bound 1): a machine that cannot be reached files no item a job — its machine's one item says what waits
    if (this._ownerLive(cid)) return null;   // round wem0s6k1d MUST 1 + 主开发 r537: THE ONE VERDICT, the park's own «live» (_ownerLive), at every road that files or renews
    const rec = (job.cronParent && this.jobs.get(job.cronParent)) || job;
    const run = (job.runs && job.runs[job.runs.length - 1]) || {}, f = carried || M.awayFactsOf(job);
    const ep = rec.awayFail && rec.awayFail.cid === cid ? rec.awayFail : null, at = now();
    rec.awayFail = ep ? { ...ep, count: (Number(ep.count) || 0) + 1, lastAt: at } : { cid, since: at, count: 1, lastAt: at };
    this._dirty = true;
    // a renewal only after a filing that LANDED (round 13: a first filing the store refused — full — leaves the next failure a FIRST one)
    const v = this._forYou(rec, M.forYouCopy(rec, 'away-failed', { exit: f.exit, cause: carried ? f.cause : (f.cause || run.cause || null), count: rec.awayFail.count, since: rec.awayFail.since, renew: !!ep && ep.filed !== false }));
    const filed = !(v && typeof v === 'object' && v.ok === false) || v.held === true;   // filed, renewed, or filed at the read
    rec.awayFail.filed = filed || (v && v.kept === true);
    // round MUST 2: the notice whose failure is said BY NAME is not also counted for the conversation's «notices are waiting»
    // (follow-up 1) …and a renewal a person's close KEPT closed: its failure was said by name and dismissed — never said again as «notices wait»
    if ((filed || (v && v.kept === true)) && entry) (this._namedAway || (this._namedAway = new WeakSet())).add(entry);
    return v;
  }
  /** B-2566 follow-up (3): a For-you filing that waited for the read LANDED (or not) — journalled on its job like any filing → the verdict */
  forYouAtRead(jobId, v, copy) { const job = jobId ? this.jobs.get(jobId) : null; return job ? this._forYouVerdict(job, v, String(copy || 'away-failed')) : null; }
  /** B-2566 + B-95fc (主开发 r537): THE ONE «is the owner live» of this file — the park's own, as the train has it (the wiring's
   *  liveForWake: a session here, or a machine that may carry it unless that machine said it ended there), else the reach (an engine
   *  wired without it). The floor's owed wake and the away failure ask it; a remote owner its machine said ended is not live for either */
  _ownerLive(cid) { const liveOf = this.d.liveForWake || this.d.peerReachable; return !!(liveOf && liveOf(cid)); }
  /** B-2566's remainder (主开发 r1147 / r1149): WHAT WAITS FOR A PAIRED MACHINE THAT CANNOT BE REACHED — ONE For-you item a machine
   *  an outage, never one a conversation, a job or a retry. Filed only once the machine has been silent M.MACHINE_AWAY_GRACE_MS
   *  and something owed failed to go out after that (a laptop shut for lunch says nothing); its count grows in place while it is
   *  open (a person's close stands for the outage — the wiring); it goes by itself when nothing waits for that machine any more */
  _machineAway(hid) {
    if (!hid || typeof this.d.noticeMachineAway !== 'function') return null;
    // THIS outage's start, the ladder's (r1277 (3)): the dial facts' disconnect — never an earlier outage's entry still waiting
    const a = typeof this.d.machineAwayOf === 'function' ? this.d.machineAwayOf(hid) : null;
    const w = this._machineAwayOwed(hid);
    if (!a || !w.n || now() - a.since < M.MACHINE_AWAY_GRACE_MS) return null;
    return this._fileMachineAway(hid, w, a.since, (this._machineWordlessOf && this._machineWordlessOf.get(hid)) || null);   // a machine that could not give its word keeps saying why (r1645's should)
  }
  /** the one filing of the machine's item: a PERSON's close stands for the outage (an item a person closed after this outage began is
   *  kept closed — the engine's own judgement, over the store's answer; the wiring files what it is handed) */
  _fileMachineAway(hid, w, since, wordless = null) {
    const closed = typeof this.d.machineAwayClosedAt === 'function' ? this.d.machineAwayClosedAt(hid) : 0;
    if (closed && Number(since) > 0 && Number(closed) >= Number(since)) return null;   // a person closed it this outage: kept closed — an UNKNOWN start (0, after a restart) never closes it (r1730 (4))
    // an UNKNOWN start (after a restart): this filing's own instant — a person's close of what it filed stands (r1861 (a): the refile is once a machine)
    (this._machineAwaySince || (this._machineAwaySince = new Map())).set(hid, Number(since) > 0 ? Number(since) : now());
    (this._machineAwaySaid || (this._machineAwaySaid = new Set())).add(hid);
    try { return this.d.noticeMachineAway({ hid, n: w.n, convs: w.convs, since, ...(wordless ? { wordless } : {}) }) || null; }
    catch (e) { this.d.log(`[jobs] ${hid}: the «results wait for a machine» For-you item was not filed — ${e && e.message}`); return null; }
  }
  /** B-2566's remainder (r1277 (6)): the conversation's machine is NO LONGER PAIRED (the park refused its held wake by name) — its
   *  notices waiting for the machine's reply say the truth now (kind machine-unpaired: never owed a wake; open the conversation to
   *  read them), and the machine's item goes */
  _machineUnpaired(cid) {
    let n = 0;
    for (const e of this.pendingNotifs.get(cid) || []) if (e && e.held && e.held.kind === 'machine-away') { e.held = { ...e.held, kind: 'machine-unpaired' }; n++; }
    if (!n) return 0;
    this._dirty = true;
    this._machineAwaySettle();
    try { this.d.broadcast('jobs-updated', { held: cid }); } catch { }
    return n;
  }
  /** r1397 (3): the machine GAVE its word (the conversation ended there) and the resume line then REFUSED (the guard at release,
   *  archived, the store unread): its notices no longer wait for the machine — they wait for the conversation (not-running: «the
   *  conversation was not running; delivered when it next resumes»; its row says why it was not resumed), «notices wait» counts them
   *  again, and the machine's item is settled NOW (never at the next drain) */
  _machineReplied(cid) {
    let n = 0;
    for (const e of this.pendingNotifs.get(cid) || []) if (e && e.held && e.held.kind === 'machine-away') { e.held = { ...e.held, kind: 'not-running' }; n++; }
    if (!n) return 0;
    this._dirty = true;
    (this._stoppedThisRun || (this._stoppedThisRun = new Set())).add(cid);
    this._machineAwaySettle();
    try { this.sayWakeWaiting(cid); } catch { }
    try { this.d.broadcast('jobs-updated', { held: cid }); } catch { }
    return n;
  }
  /** r1397 (1): the machine could NOT give its word (an older agent; no device link) and the release's road ended the hold: the
   *  machine's item says WHY in words, in place, and goes once its results went out (never on the link's return alone) */
  _machineWordless(cid, code) {
    const q = (this.pendingNotifs.get(cid) || []).filter((e) => e && e.held && e.held.kind === 'machine-away' && e.held.hostId);
    const hids = new Set(q.map((e) => e.held.hostId));
    const filed = this._machineAwayFiled();   // r1861: an item an EARLIER run of the hub filed counts as filed — looked at BEFORE the road decides
    // r2022: the decision is written ON the notices it is about (the stash file: durable) — a restart after the release, or a held
    // tray through a second restart, reads it back at the look (_machineAwayFiled)
    let stamped = 0;
    for (const e of q) if (e.held.wordless !== code) { e.held = { ...e.held, wordless: code }; stamped++; }
    if (stamped) this._dirty = true;
    for (const hid of hids) {
      if (!filed.has(hid)) continue;   // r1730 (3): the mark belongs to a FILED item — an unfiled one would give a LATER ordinary outage the wordless words
      this._machineWordlessAt(hid, code);
    }
    return hids.size;
  }
  /** the wordless MARK of machine `hid` (its item goes only once its results went out) and its words, filed in place */
  _machineWordlessAt(hid, code) {
    (this._machineWordlessOf || (this._machineWordlessOf = new Map())).set(hid, code);
    const w = this._machineAwayOwed(hid);
    const since = Number(this._machineAwaySince && this._machineAwaySince.get(hid)) || Number(typeof this.d.machineAwayOf === 'function' && (this.d.machineAwayOf(hid) || {}).since) || 0;   // after a restart: the ladder's own start
    if (w.n) this._fileMachineAway(hid, w, since, code);
  }
  /** r2022: the decision a release WROTE on machine `hid`'s waiting notices (agent_older / no_link), else null */
  _machineWordlessWritten(hid) {
    let code = null;
    for (const q of this.pendingNotifs.values()) for (const e of q || []) {
      if (e && e.held && e.held.kind === 'machine-away' && e.held.hostId === hid && !e.held.maybeDelivered && (e.held.wordless === 'agent_older' || e.held.wordless === 'no_link')) code = e.held.wordless;
    }
    return code;
  }
  /** THE MACHINES WHOSE ITEM IS FILED (r1861): this run's filings and, once a run, the open items an EARLIER run of the hub filed (the
   *  store's own list, read once it could be READ: a held tray is looked at again) — the ONE look the settle and the wordless road take.
   *  r2022: at the look, an open item whose machine's waiting notices carry a release's decision gets its mark and its words back */
  _machineAwayFiled() {
    const said = this._machineAwaySaid || (this._machineAwaySaid = new Set());
    if (this._machineAwayLooked) return said;
    let open = null;
    try { open = typeof this.d.machineAwayOpen === 'function' ? this.d.machineAwayOpen() : []; } catch { open = null; }
    if (!Array.isArray(open)) return said;   // a held tray: looked at again next time
    this._machineAwayLooked = true;
    for (const hid of open) said.add(hid);
    for (const hid of open) {
      if (this._machineWordlessOf && this._machineWordlessOf.has(hid)) continue;
      try {
        const code = this._machineWordlessWritten(hid);
        // only while the ladder names no outage of it: a machine away NOW says «silent since», and its outage holds the item by itself
        if (code && !(typeof this.d.machineAwayOf === 'function' && this.d.machineAwayOf(hid))) this._machineWordlessAt(hid, code);
      } catch (e) { this.d.log(`[jobs] ${hid}: the «results wait for a machine» item's mark was not read back — ${e && e.message}`); }
    }
    return said;
  }
  /** the notices owed to the conversations of machine `hid` while it cannot be reached → {n, convs} */
  _machineAwayOwed(hid) {
    let n = 0; const convs = new Set();
    for (const [cid, q] of this.pendingNotifs) for (const e of q || []) {
      if (!e || !e.held || e.held.kind !== 'machine-away' || e.held.hostId !== hid || e.held.maybeDelivered) continue;
      n++; convs.add(cid);
    }
    return { n, convs: convs.size };
  }
  /** a machine's item is over when nothing owed waits for it (handed over, drained), or when the machine has given its word for every
   *  conversation held for it (the ladder: no mark, no wake still held for it — r1277: never the link's word alone). Asked of every
   *  machine this run filed for, and of the items an earlier run left open — the store's list, once it could be READ (r1277 (4)) */
  _machineAwaySettle() {
    if (typeof this.d.resolveMachineAway !== 'function') return;
    const said = this._machineAwayFiled();
    for (const hid of [...said]) {
      // a machine that could not give its word (r1397 (1)): its item goes only once its results went out — never on the link's return
      const wordless = this._machineWordlessOf && this._machineWordlessOf.has(hid);
      const back = !wordless && typeof this.d.machineAwayOf === 'function' && !this.d.machineAwayOf(hid);
      if (!back && this._machineAwayOwed(hid).n) continue;
      said.delete(hid);
      if (this._machineWordlessOf) this._machineWordlessOf.delete(hid);
      try { this.d.resolveMachineAway(hid); } catch (e) { this.d.log(`[jobs] ${hid}: the «results wait for a machine» For-you item was not closed — ${e && e.message}`); }
    }
  }
  /** B-2566: the stash entry this engine just pushed for (cid, job) — the newest, or null */
  _lastStashed(cid, job) { const q = this.pendingNotifs.get(cid) || []; const e = q[q.length - 1]; return e && job && e.jobId === job.id ? e : null; }
  /** B-2566: is an away episode open for this job (a cron's: its schedule's) and this owner conversation? */
  _awayOpen(cid, job) {
    const rec = job && ((job.cronParent && this.jobs.get(job.cronParent)) || job);
    return !!(rec && rec.awayFail && rec.awayFail.cid === cid);
  }
  /** B-2566: the owner conversation RECEIVED its notices (the drain: a hand-over, a resume's turn, the person's prompt) — the away episode of
   *  every job they carried ends: its item is resolved (by the agent: delivered) and the next failure while it is away again files anew */
  _awaySettled(cid, drained) {
    const handed = new Set();
    for (const n of drained || []) { const job = n && this.jobs.get(n.jobId), rec = job && ((job.cronParent && this.jobs.get(job.cronParent)) || job); if (rec) handed.add(rec.id); }
    let n = 0;
    for (const rec of this.jobs.values()) {
      if (!rec.awayFail || rec.awayFail.cid !== cid) continue;
      delete rec.awayFail; this._dirty = true; n++;   // the owner runs again: the episode ends (round 6), whatever the drained queue holds
      if (!handed.has(rec.id)) continue;   // its notice fell off the stash (never handed to the agent): the item stays for the person
      try { this.d.resolveAwayFailed?.(rec.id, cid); } catch (e) { this.d.log(`[jobs] ${rec.id}: the away-failure For-you item was not closed — ${e && e.message}`); }
    }
    return n;
  }
  /** STASH = held, and every held entry says WHY (5b ①): `held` is
   *  {kind: spend-cap|rate-floor|not-reachable|off, why?, identity?, cap?,
   *  retryAfter?} — the panel summary, the rail tooltip and the affected
   *  conversation's status-bar chip render it in the device's own words. */
  /** THE STASH MARKS ITS STORE URGENT AT THE STASH (the census cure's hunt, findings 1 and 2 — 主开发 19:44Z: ONE rule at ONE place, no
   *  caller remembers to): a notice stashed anywhere — a run's end riding its record's landing, a missed one-shot, the rate floor, a
   *  subscriber of unknown verdict — makes job-notifications.json the writer's NEXT write (rank 0, urgent), never a paced tick's: the
   *  stash is the notice's only copy, and the boot does not say it again. A held notifications file (bl-jobs' unread hold) is never
   *  written over. */
  _notifsUrgent() {
    if (this.readOnly || this._notifsUnread) return;
    try { this._writer().dirty(this.notifsFile, { name: 'jobs-notifs.write', rank: 0, urgent: true, produce: () => this._notifsBytes() }); } catch (e) { this.d.log('[jobs] notifs save failed:', e.message); }
  }
  _stashNotif(cid, job, ev, reason, { stampLast = true, held = null, mark = false, park = null } = {}) {
    const q = this.pendingNotifs.get(cid) || [];
    // a delivery that was IN FLIGHT when the owner cleared the job stashes here afterwards with the words it
    // captured before the clear (verify r3): an event born before the clear is held as the sentence
    const stale = job.clearedAt && !((ev && ev.at) > Math.max(job.clearedAt, job.reclearedAt || 0));   // …born before the LATEST clear (verify r4: a second clear of an `already` record keeps the first clearedAt)
    q.push({ jobId: job.id, jobName: stale ? CLEARED_TEXT : this.labelOf(job), text: stale ? CLEARED_TEXT : ((ev && ev.what) || job.state), ts: now(), urgency: job.state === 'failed' ? 'normal' : 'low', held: held || heldOf(null, reason), ...(mark ? { sub: true } : {}), ...(park ? { rt: String(park) } : {}) });   // `sub`: a subscriber's held copy — its stash line says so (lane jobs-addressed-push L4; an older item reads unmarked)
    const item = q[q.length - 1];
    if (park) (this._unlanded || (this._unlanded = new Map())).set(item, { go: null, held: !!this._notifsUnread && !this.readOnly, cid });   // B-54b7: taken from the ladder — its park copy leaves at its landing (_rideTaken)
    const dropped = capUnclaimedNotifs(q); // per-conversation cap; a may-have-landed copy first, then the oldest UNCLAIMED (a claimed one is being handed over — verify r4)
    for (const d of dropped) this._letParkGo(d);   // B-54b7 (r519 (2)): an evicted copy's park entry leaves at the eviction (said by name below) — the park holds at most the cap a conversation, through a hold of any length
    const n = dropped.length;
    if (n) this.d.log(`[jobs] ${cid}: ${n} oldest waiting notification(s) fell off the ${NOTIF_STASH_CAP}-entry cap (${dropped.map((e) => `${e.jobId} ${new Date(Number(e.ts) || 0).toISOString()}${e.held && e.held.maybeDelivered ? ' — a may-have-landed copy, gave way first' : ''}`).join('; ')}) — never delivered (channel-jump verify r6: an eviction is said)`);
    if (n) this._sayDropped(cid, n, dropped);
    this.pendingNotifs.set(cid, q);
    if ((held || heldOf(null, reason) || {}).kind === 'not-running') (this._stoppedThisRun || (this._stoppedThisRun = new Set())).add(cid);   // B-6721: the EVENT For you is told of (the notice just stashed — never the queue's tail after the cap)
    this._notifsUrgent();   // THE STASH MARKS ITS STORE URGENT, here — at the stash, for every caller (the census cure's hunt, findings 1 and 2)
    this._stashes = (this._stashes || 0) + 1;   // a count the acts read (announce: was its copy only stashed?)
    if (stampLast) job.lastNotify = { ts: now(), lane: 'stash', ok: true, reason: reason || null };
    this._notifyLogPush(job, { lane: 'stash', ok: false, reason: reason || 'not reachable', to: String(cid).slice(0, 8) });
    this.d.log(`[jobs] notify → stashed for ${cid} (${reason || 'not reachable'})`);
    this._notifsChanged(cid);   // the conversation's `stash` session fact (the strip above its composer) follows — and the page's frame (r972)
    return item;
  }
  /** B-360d unit 3 follow (主开发 r972, the tree's law for a count the page keeps): THE ONE ENTRY POINT OF A CHANGE OF A
   *  CONVERSATION'S HELD NOTICES — every writer of pendingNotifs ends here (a census in test-jobs-held-seed holds it). The
   *  conversation's `stash` fact follows (onStash), and the page's kept digest gets its FRAME (every jobs-updated carries the
   *  digest: src/server/jobs-wiring.js; the page keeps the newest, src/lib/jobs-held.js). A drain says so in its own frame at once
   *  (`payload`); a stash or a put-back — often inside a step whose own frame already went (the notify step's, a hand-over's
   *  undelivered return) — is framed ONCE a turn, AFTER the step: a fan-out to many subscribers sends one frame, not one each. */
  _notifsChanged(cid, payload = null) {
    try { this.d.onStash?.(cid); } catch { }
    if (payload) { try { this.d.broadcast('jobs-updated', payload); } catch { } return; }
    (this._notifsFramed || (this._notifsFramed = new Set())).add(cid);
    if (this._notifsFrameT) return;
    this._notifsFrameT = setImmediate(() => {
      this._notifsFrameT = null;
      const cids = [...this._notifsFramed];
      this._notifsFramed.clear();
      try { this.d.broadcast('jobs-updated', { notifsOf: cids }); } catch { }
    });
    if (this._notifsFrameT.unref) this._notifsFrameT.unref();
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
    job.subscribers.push({ conversationId: caller.conversationId, sessionId: caller.sessionId || null, ...(caller.sessionCreatedAt ? { sessionCreatedAt: caller.sessionCreatedAt } : {}), ts: now(), filter: vf.filter });   // r3: ownerLineage compares the session's creation time, as isOwner does
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
    const n0 = this._stashes || 0;
    this._notifyOwner(job, { what: `announced: ${t}` });
    // lane lg-store-writes U4: a job's own frequent verb (a watch job announces in a loop) — paced, never urgent… UNLESS the owner's
    // copy was only STASHED (the rate floor): then the stash is the announce's one copy, an act — urgent, and the job's reply waits
    // for it (`landing`: the route answers through persisted(), not at once — the moved2 cure 2's hunt (1))
    const stashed = (this._stashes || 0) !== n0;
    this._save(stashed ? {} : { paced: true });
    return { ok: true, ...(stashed ? { landing: true } : {}) };
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
      const block = `\n## drained ${new Date().toISOString()}\n` + items.map((n) => `- ${new Date(n.ts).toISOString()} ${n.jobId} ${oneLine(n.jobName)}${n.sub ? M.SUB_MARK : ''}: ${oneLine(n.text)}`).join('\n') + '\n';
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
  /** the conversations a job notice waits for (piece 7: the ended row's count reads these few) */
  notifCids() { return [...this.pendingNotifs.keys()].filter((cid) => (this.pendingNotifs.get(cid) || []).length > 0); }
  /** how many notices wait for a conversation — a COUNT, never judged (no view re-judge, no write: the row's fact reads it on a GET) */
  notifCount(cid) { return cid ? (this.pendingNotifs.get(cid) || []).length : 0; }
  peekNotifs(cid) {
    if (!cid) return [];
    this._judgeHeldView(cid);
    // BOTH LAWS (the restack onto 875a42411, 主开发 08:55Z): a notice the held job records cannot judge waits (store (5) cure (2)) — and
    // while the Task Groups store is held an undecided line stays queued (the release's cure) — and (B-54b7) while job-notifications.json is
    // held a copy taken from the ladder waits for its own landing
    const q = (this.pendingNotifs.get(cid) || []).filter((n) => !this._waitsForRecords(n) && !this._waitsForLanding(n));
    const v = typeof this.d.viewerOf === 'function' ? this.d.viewerOf(cid) : undefined;
    return v && v.held ? q.filter((n) => n && (n.ho || this.printableNow(cid, n.jobId, v, { sub: n.sub === true }))) : q;   // THE STORE HELD UNREAD: an undecided line stays queued
  }
  /** r3 (law C at the DRAIN): a held line is judged at the turn that would print it — every drain (the prompt's, the session
   *  start's, the user's hand-over) reads through peekNotifs. With a LIVE record of the conversation (the drain runs for one),
   *  an item of a job it can no longer view (THE predicate) is dropped, never printed; a claimed item (a hand-over in flight) and
   *  a removed job's item keep their road. */
  _judgeHeldView(cid) {
    const q = this.pendingNotifs.get(cid);
    if (!q || !q.length) return;
    const v = typeof this.d.viewerOf === 'function' ? this.d.viewerOf(cid) : null;
    const viewer = v && v.live ? v : null;   // r4/r5: a live record judges view; with none the verdict is 'unknown' (kept) — but a SUBSCRIBER's line of a job of which nothing remains is 'gone' (dropped)
    const gone = q.filter((n) => n && !n.ho && !this.addressedNow(cid, n.jobId, viewer, { sub: n.sub === true }));
    if (!gone.length) return;
    const keep = q.filter((n) => !gone.includes(n));
    if (keep.length) this.pendingNotifs.set(cid, keep); else this.pendingNotifs.delete(cid);
    for (const n of gone) this._letParkGo(n);   // B-54b7: a taken copy dropped here is not owed — its park copy is not either
    this._saveNotifs(); this._dirty = true;
    this.d.log(`[jobs] ${cid}: ${gone.length} held notification(s) of job(s) it can no longer view — dropped at the drain, never printed (${[...new Set(gone.map((n) => n.jobId))].join(', ')})`);
    this._notifsChanged(cid, { drained: cid });   // the ONE entry point: the drop's frame + (r972) the stash fact it never sent
    this.wakeSettled(cid);   // B-6721 (the round's should): the drop may leave nothing owed — For you's «notices wait» goes with it
  }
  /** r5 — THE VIEW VERDICT: the ONE answer the push, the drain and the ladder's retry share to «may this conversation be told of
   *  this job NOW», judged by what the server knows of it now (the wiring's `viewerOf`):
   *   'owner' / 'subscriber'   OWED, with the copy it is owed: view PROVEN — a live record that may view, membership by key with
   *             no live record, the owner lineage — or no view source wired at all (a test's engine: the one road that does not
   *             ask; `fallback` = the caller as the subscription knows it decides the role there)
   *   'refused' a LIVE record that may not view the job
   *   'unknown' no live record and nothing proves view — the line is HELD; the drain judges it at the turn that would print it
   *   'groups-unread' (lane bl-windows) the Task Groups store cannot be read and no role proves view without a group — HELD and
   *             never printed until a verdict after the lift decides it (the wiring's viewerOf answers a view marked `held`)
   *   'gone'    a SUBSCRIBER's marked copy of a job of which nothing remains (no live record, no archive record — the archive
   *             record proves view as the pull reads it); an unmarked copy (the owner's, a lineage creator's) of such a job is owed
   *  `viewer` given (the drain's): that caller, or null for «no live record». The PUSH (`_notifyOwner`), the DRAIN
   *  (`addressedNow` → `_judgeHeldView`, the parked drain) and the LADDER's retry (`retryOwed`) all read THIS function — none
   *  decides by anything else (test-jobs-addressed §7 r6 pins it). r7: `job` is the RECORD the caller holds (the push passes its
   *  object and its cron `parent` — no lookup can miss a job that left the store while its event was on the way) or an id (the
   *  drain and the retry hold only the stash / park entry's id: the store, else the archive). A job of which nothing remains is
   *  'gone' for a subscriber's copy and never 'owner' for one (`sub`); only an unmarked copy (the owner's) of it is owed. */
  viewVerdict(cid, job, { viewer = undefined, sub = false, fallback = null, parent = undefined } = {}) {
    const rec = job && typeof job === 'object' ? job : this.jobs.get(job) || this.archivedById(job);
    // store (5) cure (1), 主开发 02:33Z: while the job records or the archive are HELD a missing record is UNKNOWN — a subscriber's notice
    // waits (the drain dropped it as «gone» and saved: lost for good), as the gc keeps a cleared record while held
    // THE MOVE ONTO CHECKPOINT 61 meets lane bl-windows' own verdict ('groups-unread', d7eb727a0): a held VIEW (the Task Groups store
    // unreadable) is said as itself here too — a subscriber's undecided line under BOTH holds stays queued (printableNow keeps it), never
    // printed as a plain «unknown»
    const viewOf = () => (viewer !== undefined ? viewer : typeof this.d.viewerOf === 'function' ? this.d.viewerOf(cid) : undefined);   // asked only where it decides
    if (!rec) return sub ? (this._recordsHeld() ? (viewOf()?.held ? 'groups-unread' : 'unknown') : 'gone') : 'owner';
    const v = viewOf();
    if (v === undefined) return fallback && M.ownerLineage(rec, fallback) ? 'owner' : 'subscriber';
    if (!v) return 'unknown';
    const role = M.addressedTo(rec, v, parent !== undefined ? parent : this._cronParentOf(rec));
    if (role) return role;
    return v.live ? 'refused' : v.held ? 'groups-unread' : 'unknown';   // lane bl-windows: a held view (the Task Groups store unreadable) no role proves — its OWN verdict
  }
  /** THE STORE HELD UNREAD (lane bl-windows): may the drain PRINT this line now — owed, or undecided with no record of the
   *  conversation (as before); while the Task Groups store is held (`viewer.held`, the wiring's viewerOf) an undecided line is
   *  KEPT, never printed: only a group could prove it, and the groups are unknown until the lift judges it */
  printableNow(cid, jobId, viewer = undefined, { sub = false } = {}) {
    const r = this.viewVerdict(cid, jobId, { viewer, sub });
    return r !== 'refused' && r !== 'gone' && r !== 'groups-unread';
  }
  /** an owed verdict (either role) */
  static owed(verdict) { return verdict === 'owner' || verdict === 'subscriber'; }
  /** r3–r5: owed now or still undecided (not refused, not gone) — the drain's per-item judge and the hook routes' parked drain */
  addressedNow(cid, jobId, viewer = undefined, { sub = false } = {}) {
    const r = this.viewVerdict(cid, jobId, { viewer, sub });
    return r !== 'refused' && r !== 'gone';
  }
  /** r4/r5 (THE LADDER'S OWN RETRY ASKS — THE SAME QUESTION AS THE PUSH, THE SAME ANSWER): the delivery ladder asks this before
   *  ANY road delivers a parked jobs copy — the turn end, the backoff timer, the prompt drain's view, the stash hand-over
   *  (src/server/conversation-deliver.js registerRetryJudge, wired in jobs-wiring). A subscriber's copy (`meta.subscriber`):
   *  owed ('owner' / 'subscriber') ⇒ delivered; 'refused' / 'gone' ⇒ the ladder drops it (no post, no wake, no stash); 'unknown' ⇒ no post and no
   *  wake: the copy becomes a HELD line here, and the drain judges it at the turn that would print it — exactly the push's road
   *  for that viewer. The marked copy is judged as a subscriber's, an owner-role copy (a lineage creator's) as the owner's — the
   *  same rule as its held line. The owner lane's copy is owed as before. */
  retryOwed(cid, entry) {
    const meta = (entry && entry.meta) || {};
    // B-54b7 (iv): a park entry whose copy job-notifications.json ALREADY holds (read at the boot or the merge: a kill between that landing
    // and the park's own rewrite left both on disk) is never delivered or stashed a second time — the park's copy leaves
    if (entry && this._parkOnDisk && this._parkOnDisk.has(entry.id)) { (this._retryVerdicts || (this._retryVerdicts = new Map())).set(entry.id, 'held-copy'); return false; }
    // B-54b7 (主开发 r739 — two crashes and a hold): while job-notifications.json is HELD, a plain park entry this engine did not park itself
    // (the previous process left it) may have its twin in that very file — a kill between the twin's landing and the park's own rewrite. It
    // is never POSTED while held: the store TAKES it (a hidden copy carrying its park id; the ladder's copy kept until the lift's landing) and
    // the read again keeps ONE (the twin by its id, else this copy). The owner's own copy too: it waits until the file reads (said in the kb).
    // An owed or ended wake (`held` on the entry: its words are the stash's) and a may-have-landed copy (the fall road takes it) are not this
    if (this._notifsUnread && !this.readOnly && entry && entry.id && !entry.held && !entry.maybeDelivered && !(this._parkedHere && this._parkedHere.has(entry.id))) {
      const target = this.jobs.get(meta.jobId) || this.archivedById(meta.jobId) || { id: meta.jobId, name: meta.jobName || meta.jobId };
      const kind = meta.subscriber ? 'not-running' : 'not-reachable';
      this._stashNotif(cid, target, { what: (meta.ev && meta.ev.what) || meta.jobName, at: (meta.ev && meta.ev.at) || entry.firstAt }, kind, { stampLast: false, held: { kind }, mark: !!meta.sub, park: entry.id });
      (this._retryVerdicts || (this._retryVerdicts = new Map())).set(entry.id, 'held-file');
      return false;
    }
    if (!meta.subscriber) return true;
    const verdict = this.viewVerdict(cid, meta.jobId, { sub: !!meta.sub });
    if (JobManager.owed(verdict)) return true;   // r6: an owed copy leaves no memo (the ladder delivers or fells it — the memo is for a drop's journal line)
    const heldView = verdict === 'groups-unread';   // THE STORE HELD UNREAD (lane bl-windows): the verdict names it
    (this._retryVerdicts || (this._retryVerdicts = new Map())).set(entry && entry.id, verdict);
    if (verdict === 'unknown' || heldView) {
      const target = this.jobs.get(meta.jobId) || this.archivedById(meta.jobId) || { id: meta.jobId, name: meta.jobName || meta.jobId };
      this._stashNotif(cid, target, { what: (meta.ev && meta.ev.what) || meta.jobName, at: (meta.ev && meta.ev.at) || (entry && entry.firstAt) }, heldView ? 'held: the Task Groups store cannot be read — judged when it reads' : 'held: no live record proves its view — judged at the turn that would print it', { stampLast: false, held: { kind: heldView ? 'groups-unread' : 'not-running' }, mark: !!meta.sub, park: entry && entry.id });
      // 主开发 04:33Z (2c): the ladder drops its parked copy on this answer and writes its file NOW — the stash is written at once too (a
      // crash before the next tick lost it for good); while job-notifications.json is HELD that write is refused: the stash waits in memory
      // and joins the file at the read (the merge)
      this._saveNotifs();
    }
    return false;
  }
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
  /** THE BYTES ARE MADE AT THE WRITE, AND REFUSED WHILE HELD (must 1's class, 主开发 2026-11-19 22:38Z — the hosts.js law): a write
   *  queued before a hold came back never lands over the held file; the writer keeps it owed, and once the file reads again it
   *  writes the state READ. jobs.json's and job-notifications.json's every producer goes through these two. */
  _recordsBytes() { if (this._unread && this._unread.store) throw Object.assign(new Error('jobs.json is held (its read failed) — nothing is written over it until it reads'), { code: 'EHELD' }); return storeBytes([...this.jobs.values()]); }
  _notifsBytes() { if (this._notifsUnread) throw Object.assign(new Error('job-notifications.json is held (its read failed) — nothing is written over it until it reads'), { code: 'EHELD' }); return storeBytes(Object.fromEntries(this.pendingNotifs)); }
  /** the notifs file alone, NOW (a claim, a drain — a delivery's bookkeeping never waits for the 2 s save tick). */
  /** → the notifications' landing {ok, why} (the census cure's hunt, finding 11 — 主开发 19:44Z: the notices save ANSWERS its landing;
   *  its callers read it: a hand-over holds its record of delivery and its reply behind it) */
  _saveNotifs() {
    if (this.readOnly) return { ok: true, why: null };
    if (this._notifsUnread) { if (!this._notifsSaveSaid) { this._notifsSaveSaid = true; this.d.log('[jobs] a job-notifications.json write was refused: the file could not be read, and nothing is written over it until it reads'); } return { ok: false, why: 'job-notifications.json is held unread' }; }   // the B-f276 remainder
    // lane lg-store-writes U4: the notifications' bytes go through the store writer — and a claim, a drain, a restore is ON DISK
    // before what follows (verify r2's exactly-once law: the hand-over's stamp is on disk in both stores before the post
    // leaves; a drained entry is never delivered twice after a kill) — _onDisk waits for this one file's write
    try { const W = this._writer(); W.dirty(this.notifsFile, { name: 'jobs-notifs.write', rank: 0, produce: () => this._notifsBytes() }); return this._onDisk(this.notifsFile, 'the notifications (a claim, a drain)'); } catch (e) { this.d.log('[jobs] notifs save failed:', e.message); return { ok: false, why: e.message }; }
  }
  /** `step` once the notifications as they are NOW are on disk (lane lg-store-writes, the moved2 cure 2: a stash hand-over drops
   *  its kept copy of the originals only on their put-back's landing — _ride) */
  afterNotifsLanded(step) { if (this._notifsUnread && !this.readOnly) return this._afterNotifsLift('the notifications put back', step); return this._ride(this.notifsFile, 'the notifications put back', step); }
  /** the notifications as they are NOW on disk, waited for (bounded) → Promise<{landed}> (the census cure, finding 11: the hand-over) */
  whenNotifsLanded({ timeoutMs = 20000, what = 'a hand-over\'s drain' } = {}) { if (this._notifsUnread && !this.readOnly) return this._afterNotifsLift(what, () => true, { timeoutMs }); return this._ride(this.notifsFile, what, () => true, { timeoutMs }); }
  /** THE MOVED LINE'S MUST 2 (主开发 2026-11-19 22:38Z): while job-notifications.json is HELD its save writes nothing — the writer owes
   *  nothing for the file, and a ride would answer «landed» at once (a hand-over then dropped its kept copy of notices put back in
   *  memory only; a restart before the lift lost them for good). While held the step WAITS FOR THE LIFT: kept here, ridden on the
   *  lift's own save (_notifsRetry); a hold that never lifts keeps the copy; a bound (whenNotifsLanded) answers not landed.
   *  → a promise of the writer's answer ({landed, value}) */
  _afterNotifsLift(what, step, { timeoutMs = null } = {}) {
    return new Promise((resolve) => {
      const w = { what, step, resolve, done: false, t: null };
      (this._notifsLiftWaits || (this._notifsLiftWaits = [])).push(w);
      if (timeoutMs != null) { w.t = setTimeout(() => { if (w.done) return; w.done = true; resolve({ landed: false, why: 'job-notifications.json is held unread — it lands once the file reads again' }); }, timeoutMs); w.t.unref?.(); }
    });
  }
  /** Put drained notifications BACK as themselves (a hand-over's frame came back undelivered — verify r2). An entry already
   *  here — the same object, or the same job at the same instant (a boot putting back a kept copy whose first put-back landed:
   *  the moved2 cure 2) — is never added twice. */
  restoreNotifs(cid, items) {
    const mine = (Array.isArray(items) ? items : []).filter((n) => n && typeof n === 'object');
    if (!cid || !mine.length) return 0;
    const q = this.pendingNotifs.get(cid) || [];
    const had = new Set(q.map((n) => n && `${n.jobId}\u0000${n.ts}`));
    const putBack = this._putBack || (this._putBack = new WeakSet());   // (a copy PUT BACK — the only kind a held file can hold: the boot mark, exact — no clock)
    for (const n of mine) { delete n.ho; putBack.add(n); if (!q.includes(n) && !had.has(`${n.jobId}\u0000${n.ts}`)) q.push(n); }
    q.sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0));
    // no cap on a restore (verify r4): the restored are the oldest — trimming here would evict exactly what came back
    this.pendingNotifs.set(cid, q);
    this._saveNotifs();
    this._notifsChanged(cid);   // r972: a hand-over that came back undelivered — the page's count follows (it sent no frame before)
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
    if (byId || q.some((n) => n && (n.ho || this._waitsForRecords(n) || this._waitsForLanding(n)))) {   // store (5) cure (2): a notice that waits for the records stays
      const mine = byId ? (n) => only.has(n) && !this._waitsForRecords(n) && !this._waitsForLanding(n) : (n) => !(n && n.ho) && !this._waitsForRecords(n) && !this._waitsForLanding(n);   // B-54b7: a taken copy waits for its landing
      const keep = q.filter((n) => !mine(n));
      q = q.filter(mine);
      if (!q.length) return [];
      if (keep.length) this.pendingNotifs.set(cid, keep); else this.pendingNotifs.delete(cid);
      for (const n of q) if (n && n.ho) delete n.ho;
    } else this.pendingNotifs.delete(cid);
    // NOTHING IS PUT BACK (the moved2 cure 2, its must 4): two of the drain's callers drain AFTER the text has gone out — the removal
    // stays, a write that does not land is the writer's to retry (_onDisk says it). The census cure (finding 11): the drained list
    // CARRIES the drain's landing (`landed`, not enumerable — never in a record) — a hand-over holds what follows behind it
    const drained = this._saveNotifs();
    // must 2's reader, said as it is (主开发's cure read wis993v2b, its should 2): while the file is HELD the drain writes nothing, and
    // the hand-over records its delivery at once (a wait for the lift would stall its reply). What waits in memory is MOSTLY not in
    // the held file — but a hand-over copy put back at the boot may ALREADY be in it (the last process died after that landing and
    // before the stash dropped its copy): drained now, it would come back at the lift's merge and be handed over twice. So a drain
    // while held REMEMBERS what it took — by the notice's own identity: ITS CONVERSATION, its job and its instant (one job event is
    // stashed for its owner and for each subscriber in one pass, with one instant: without the conversation, a drain of the owner's
    // copy took a subscriber's copy out of the file's merge too — a silent loss) — and the lift's merge leaves those out
    Object.defineProperty(q, 'landed', { value: !!(drained && drained.ok) || !!this._notifsUnread, enumerable: false });
    if (this._notifsUnread) { const took = this._drainedWhileHeld || (this._drainedWhileHeld = new Set()), putBack = this._putBack; for (const n of q) if (n && putBack && putBack.has(n)) took.add(`${cid}\u0000${n.jobId}\u0000${n.ts}`); }   // BOUNDED BY CONSTRUCTION (the reads' shoulds): only a copy PUT BACK (restoreNotifs) can be in the held file — a notice stashed in this process meanwhile is never remembered; the mark is the put-back itself, never a clock (a clock stepped back cannot move it)   // the conversation IN the identity (主开发's read wf_3c7fc92a-819, its must): one job event is stashed for its owner and each subscriber with ONE instant
    this._dirty = true;
    // A stash DRAINED into a resume has been read (triage §13 rule 1a): the
    // conversation sees it on its next turn. A stash entry older than the
    // job's CURRENT terminal instant describes an earlier run and acks nothing.
    for (const n of q) {
      const job = n && this.jobs.get(n.jobId);
      if (job && Number(n.ts) >= M.terminalAt(job)) this.markAck(job, 'notified', now(), { quiet: true });
    }
    this._notifsChanged(cid, { drained: cid });   // the ONE entry point: the drain's own frame + the stash fact
    this._awaySettled(cid, q);   // B-2566: the owner received them — an away failure's item is over
    this.wakeSettled(cid);   // B-6721: what was owed a wake left the stash (a hand-over, the person's prompt) — For you's line about it goes
    this._machineAwaySettle();   // B-2566's remainder: nothing waits for a machine any more — its item goes by itself
    return q;
  }
  /** B-6721 (fb-708fa798a0: a one-shot fired while its conversation was not running — stashed at 08:30, the conversation was
   *  resumed at 09:18 and heard nothing until a prompt hours later): THE NOTICES OWED A WAKE — stashed because the
   *  conversation was NOT RUNNING, or held by the 30 s floor (B-2fa2, merged: a floored distinct event fires at its bound) —
   *  never one the spend ceiling, the owner's switch or a next-turn hold keeps, never an alive agent's refusal (the retry
   *  park's bound is spent: `not-reachable`) and never a copy that may have landed. The stash view (src/server/stash-handover.js)
   *  hands them over once the conversation is running and idle; while it is away For you says they wait. */
  wakeOwed(cid) {
    if (!cid || !this.pendingNotifs.get(cid)) return [];
    // the queue read as it is (never peekNotifs: its held-view judge can stash, and this is asked from the stash hooks)
    return (this.pendingNotifs.get(cid) || []).filter((n) => n && !n.ho && n.held && WAKE_OWED_KINDS.includes(n.held.kind) && !n.held.maybeDelivered && !this._waitsForRecords(n) && !this._waitsForLanding(n));
  }
  /** B-6721: For you was told for this conversation (now, or at For you's read — the wiring's deferred filing): its close asks the store */
  noteWakeSaid(cid) { if (cid) (this._wakeSaid || (this._wakeSaid = new Set())).add(cid); }
  /** B-6721: the conversation is away and a notice that could not reach it waits — said in For you ONCE A WAITING EPISODE (the
   *  wiring files one item per conversation and never reopens one filed since the oldest waiting notice came — a person's
   *  dismissal stands); a floored one is no such case (it goes in seconds). → the item id | null */
  sayWakeWaiting(cid) {
    // A FOR-YOU ITEM MARKS AN EVENT, NOT A STATE FOUND AT BOOT (主开发's ruling, round wdtmcza5y — measured on the owner's hub: 3
    // conversations held a not-running notice, two of them a month old): only a conversation a notice was stashed for WHILE THIS
    // HUB RAN (stopped then) is said — the item then counts every notice waiting there; what a boot finds waits where it waits
    // today (the Background Work panel) and is still handed over when the conversation runs again
    if (!this._stoppedThisRun || !this._stoppedThisRun.has(cid)) return null;
    const owed = this.wakeOwed(cid).filter((n) => n.held.kind !== 'rate-floor' && n.held.kind !== 'machine-away' && !(this._namedAway && this._namedAway.has(n)));   // B-2566 MUST 2: a failure said by name is ONE item; r1277 (2): its machine's item counts machine-away
    if (!owed.length || typeof this.d.noticeWakeWaiting !== 'function') return null;
    try {
      const id = this.d.noticeWakeWaiting({ cid, since: Math.min(...owed.map((n) => Number(n.ts) || now())) }) || null;
      if (id) this.noteWakeSaid(cid);
      return id;
    } catch (e) { this.d.log(`[jobs] ${cid}: the «notices wait» For-you item was not filed — ${e && e.message}`); return null; }
  }
  /** B-6721: nothing owed a wake is left — For you's «notices wait» for this conversation is over (done, by the agent). Asked of
   *  the store only for a conversation this run said it for, or once per conversation per run (an item an earlier run filed) */
  wakeSettled(cid) {
    if (!cid || this.wakeOwed(cid).length) return;
    // A CLAIM IS NOT A SETTLE (the move check's should 7): an owed notice a resume (or a hand-over) has CLAIMED is still waiting —
    // its claim may come back; For you's «notices wait» stays until nothing is owed AND nothing owed is claimed
    if ((this.pendingNotifs.get(cid) || []).some((n) => n && n.ho && n.held && WAKE_OWED_KINDS.includes(n.held.kind) && !n.held.maybeDelivered)) return;
    if (this._stoppedThisRun && !(this.pendingNotifs.get(cid) || []).length) this._stoppedThisRun.delete(cid);   // the queue EMPTY (a claimed entry may come back): the event is over (the set stays bounded)
    if (typeof this.d.resolveWakeWaiting !== 'function') return;
    const said = this._wakeSaid || (this._wakeSaid = new Set()), looked = this._wakeLooked || (this._wakeLooked = new Set());
    if (!said.has(cid) && looked.has(cid)) return;
    said.delete(cid); looked.add(cid);
    try { this.d.resolveWakeWaiting(cid); } catch (e) { this.d.log(`[jobs] ${cid}: the «notices wait» For-you item was not closed — ${e && e.message}`); }
  }
  /** B-6721 (the read's must: the view is built at module load, the notices are read here, after listen — its own boot walk
   *  saw an empty store): each conversation OWED A WAKE is announced through the stash hook once the notices are read */
  announceOwedWakes() { let n = 0; for (const cid of [...this.pendingNotifs.keys()]) if (this.wakeOwed(cid).length) { n++; try { this.d.onStash?.(cid); } catch { } } return n; }
  /** B-6721 (its read: the engine's floor counts a delivery that LANDED — the park's R5): a hand-over that carried this engine's
   *  notices to the conversation stamps the 30 s floor and the duplicate window, as a post of its own would */
  noteHandedOver(cid, text) { if (cid && text) this._stampNotifyFloor(cid, String(text)); }
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
    if (ev) this._event(job, ev.what, ev.verb, ev.alarm);
    try { this.d.broadcast('jobs-updated', { id: job.id }); } catch { }
    const ws = this.waiters.get(job.id);
    if (ws && (M.isTerminal(job) || job.state === 'awaiting-user' || job.kind === 'service')) {
      this.waiters.delete(job.id);
      for (const w of ws) { clearTimeout(w.timer); try { w.resolve(); } catch { } }
    }
  }
  _event(job, what, verb, alarm = false) {
    // The ring is read ADDRESSED (lane jobs-addressed-push, 2026-11-10 — the owner replaced his 2.348.0 call «viewers may see
    // announces passively»): updatesFor gives a conversation the lines of its OWN jobs and of jobs it subscribed to; another
    // conversation's job reaches it only as a count of `alarm` entries — stamped HERE by the producers that end a job in failure
    // (a failed end, a park, a refused run, a missed time, a boot out-of-memory end), never inferred from the job's state at event
    // time (a «memory bound set» on a parked job is no new failure; «cron fired: notify» rides a running cron).
    this.events.push({ ts: now(), jobId: job.id, name: this.labelOf(job), what, verb, ...(alarm ? { alarm: true } : {}) });   // r4: the NAME belted
    if (this.events.length > 400) this.events.splice(0, this.events.length - 400);
  }

  // ── identity / process helpers ──────────────────────────────────────────
  _ctlDir(job, runTs) { return path.join(this.logsDir, job.id, String(runTs)); }
  _readStamp(job) {
    const run = job.runs && job.runs[job.runs.length - 1];
    if (!run) return null;
    const f = path.join(this._ctlDir(job, run.startedAt), 'pid.json');
    if (this._ctlPre && this._ctlPre.has(f)) { try { return JSON.parse(this._ctlPre.get(f)); } catch { return null; } }   // B-f276 cure r2: read off the loop
    try { return JSON.parse(fs.readFileSync(f, 'utf-8')); } catch { return null; }
  }
  _verifyAlive(stamp) {
    if (!stamp || !stamp.pid) return false;
    return stamp.bootId === bootId() && PI.aliveIdentity(stamp) === true; // pid+starttime+bootId, and not a zombie
  }
  _killGroup(job, sig) { // handle-kill with act-time re-verification (B-16d9 law)
    const run0 = job.runs && job.runs[job.runs.length - 1];
    if (this._hubIsMain(job, run0)) { this._hubMainRefusal(job, run0, sig === 'SIGKILL' ? 'its kill' : 'the stop'); return false; }   // B-2c5c: THE MAIN DOOR
    const stamp = this._readStamp(job);
    if (!this._verifyAlive(stamp)) return false;
    // B-2c5c: a hub started by hand inside the job may sit in the job's PROCESS GROUP — the group signal would reach this hub: the
    // wrapper alone hears it (its stop ends its group's rows — never the hub's) and, for a SIGKILL, the job's whole tree by identity
    const inGroup = PI.pgidOf(process.pid) === Number(stamp.pid);
    if (inGroup && !this._hubGroupSaid) { this._hubGroupSaid = true; this.d.log(`[jobs] ${job.id}: this VibeSpace hub runs in the job's process group (started inside it) — the job is stopped process by process, never by its group`); }
    if (sig === 'SIGKILL') this._killTree(job, stamp, { group: inGroup });   // B-c134: a SIGKILL ends the wrapper before it can end its tree — the engine does, first
    return PI.signalIdentity(stamp, sig, { group: !inGroup, what: `job ${job.id}` }).ok; // the group, else its leader
  }
  /** B-c134 A STOP ENDS THE WHOLE TREE IT STARTED — where the wrapper cannot: a FORCE stop and the ladder's kill step SIGKILL it (its
   *  own stop step, which ends its tree through its one table, never runs). The tree under the wrapper read FIRST (PI.treeOf — the
   *  tree's own cost, procfs, bounded), each member SIGKILLed by identity (pid + start at the act), said in the log; then the caller's
   *  SIGKILL of the group / the scope, in the same tick. A SIGTERM is never sent here (the wrapper's stop step delivers a stop's). */
  _killTree(job, stamp, { group = false } = {}) {
    const t = PI.treeOf([Number(stamp.pid)], { since: Number(stamp.starttime) || 0 }), tree = group ? t : t.filter((m) => m.pgid !== Number(stamp.pid));   // the group dies with the group's SIGKILL — B-2c5c: unless the hub is in it (then the group's members too, the hub's pruned)
    const killed = [], refused = [];
    let unjudged = 0;
    for (const m of tree) { const r = PI.signalIdentity(m, 'SIGKILL', { what: `job ${job.id}'s tree` }); if (r.ok) killed.push(m.comm); else if (r.why === 'not-ours') refused.push(m.comm); else if (r.why !== 'gone' && r.why !== 'stale' && r.why !== 'pid-recycled') unjudged++; }   // a recycled pid: that member had ended
    // B-7ca1 (the group rung — no scope: a container, a pod): what carries THIS RUN's mark outside its group and outside the tree read
    // now — a child that made its own group (setsid, the timeout program) and was re-parented before the stop — ends too, by identity (a
    // bounded scan, its cut said). Its read: the RUN's mark (an earlier run's leftover, and what it forks, carries the job's only); never
    // on a scope's rung (its scope ends its own; what left the scope is not this row's); never the wrapper (the caller's signal), a hub
    // started inside the job (B-2c5c) or what another stop keeps out (holders, other jobs' wrappers)
    const inTree = new Set(t.map((m) => `${m.pid}:${m.starttime}`)), run0 = job.runs && job.runs[job.runs.length - 1], sc = run0 ? this._runScope(job, run0) : null;
    const marks = !!(run0 && run0.startedAt) && !(sc && sc.dir), hubs = marks ? this._hubTest(this._runWrapper(job, run0)) : null, ko = marks ? new Set((PI.keptOut([]) || []).map((x) => Number(Array.isArray(x) ? x[0] : x))) : null;
    // B-d8f4 (9), 主开发 r1745: the walk for what carries the run's mark runs OFF the hub's main thread (a child through the starter —
    // _walkMarked); what it finds ends when it answers. The press, the grace's timer and the tick that asked never wait on it: the
    // tree above is ended NOW, and nothing but this stop waits for the walk
    const n = killed.length;
    const finish = (marked) => {   // the mark's kill and the stop's line: when the walk answers (none asked: at once, as before)
    const mscan = marked.scan || {}, ww = PI.walkWords(mscan);   // r4324: the walk's words from the ONE builder
    let escaped = 0;
    for (const id of marked) {
      if (id.pid === Number(stamp.pid) || inTree.has(`${id.pid}:${id.starttime}`) || (!group && PI.pgidOf(id.pid) === Number(stamp.pid)) || hubs(id.pid) || ko.has(id.pid)) continue;   // the group's own die with the group's SIGKILL — unless the hub is in it (never signalled: each one here)
      const r = PI.signalIdentity(id, 'SIGKILL', { what: `job ${job.id}'s mark` }); if (r.ok) escaped++; else if (r.why === 'not-ours') refused.push(`pid ${id.pid}`); else if (r.why !== 'gone' && r.why !== 'stale' && r.why !== 'pid-recycled') unjudged++;
    }
    // B-c134 cure (MUST B): said where the person reads — the job's OWN log (a force stop's wrapper is dead: nobody else writes it),
    // a refused signal named, a cut walk said; and in the hub's log as before
    const es = (k) => (k === 1 ? '' : 'es'), what = [...(n ? [`${n} process${es(n)} it started outside its group (${[...new Set(killed)].join(', ') || '—'})`] : []), ...(escaped ? [`${escaped} process${es(escaped)} carrying its run's mark outside its group (re-parented)`] : [])], line = `its forced end${what.length ? ` killed ${what.join(' and ')}` : ''}`   // B-d8f4 (主开发 r902): nothing killed never opens with «killed 0»
      + (refused.length ? `; could not end ${refused.length} (${[...new Set(refused)].join(', ')}: not ours to signal)` : '') + (unjudged ? `; ${unjudged} could not be judged (its identity unreadable): not signalled` : '') + (t.cut ? ' — its tree was read only in part: what it started may be left' : '') + (mscan.cut ? ` — its mark's scan read ${mscan.scanned} of ${mscan.total} processes: what left its group may be left` : '') + (mscan.unread ? ` — its mark's scan could not list the processes (${mscan.unread}): what left its group may be left` : '')   // B-d8f4 (10, its read's S1: the errno, never a guess at the machine)
      + (ww.unread ? ` — its mark could not be read in ${ww.unread}: what carries its mark there may be left` : '')   // B-d8f4 (主开发 r2215): a still-unread member SAID here too, in the clear's words
      + (ww.stillEnding ? ` — ${ww.stillEnding}` : '')   // r4302: an ENDING process by its true word — never «could not be read», never silently
      + (marked.ended ? ` — ${require('./server/marked-walk.js').endedWords(marked.ended)}: what left its group may be left` : '');   // B-d8f4 (9): an ended walk SAID, the stop going on with what it found
    if (n || escaped || refused.length || unjudged || t.cut || mscan.cut || mscan.unread || ww.ours > 0 || ww.ending > 0 || marked.ended) { this.d.log(`[jobs] ${job.id}: ${line}`); this._runLogLine(this._runLogFile(job), `[jobs] stop: ${line}`); }
    return n + escaped;
    };
    const done = marks ? this._walkMarked({ mark: `VIBESPACE_JOB_RUN=${job.id}:${run0.startedAt}`, since: Number(stamp.starttime) || 0 }).then(finish) : Promise.resolve(finish([]));
    (this._markWalks || (this._markWalks = new Set())).add(done); done.finally(() => this._markWalks.delete(done)).catch((e) => { try { this.d.log(`[jobs] ${job.id}: its forced end's walk answered but could not be acted on (${(e && e.message) || e}) — what carries its run's mark may be left`); } catch { } });   // a suite's wait (markWalksSettled)
    return n;   // the tree's kills now; the mark's when its walk answers (no caller reads this count)
  }
  /** B-d8f4 (9), 主开发 r1745: what carries a job's mark — walked OFF the hub's main thread and off the shared file threadpool
   *  (src/server/marked-walk.js: ONE child through the starter running proc-identity's membersOf itself — the same laws: the cut said,
   *  newest first, a D-state process never read; ended at a deadline). Its rows (pids and start times only) are identities again here,
   *  this machine's boot id added; `.scan` and `.ended` ride the array as membersOf's `.scan` did. `this.d.markWalk` is a suite's seam */
  _walkMarked(opts) {
    const seam = (this.d && this.d.markWalk) || {}, boot = PI.bootIdOf();
    return require('./server/marked-walk.js').walkMarked({ ...opts, ...seam }).then((w) => { const rows = w.rows.map((r) => ({ pid: r.pid, starttime: r.starttime, bootId: boot })); rows.scan = w.scan; rows.ended = w.ended; return rows; });
  }
  /** a suite's wait: every forced end's mark walk answered and acted on */
  markWalksSettled() { return Promise.all([...(this._markWalks || [])]).then(() => { }); }
  /** B-c134 cure: the latest run's own log file (the path alone) */
  _runLogFile(job) {
    const run = job.runs && job.runs[job.runs.length - 1];
    return run ? run.log || path.join(this._ctlDir(job, run.startedAt), 'current.log') : null;
  }
  /** B-c134 cure: one line into a run's own log (off the loop, appended — the wrapper's lines and ours, in order); the words are the
   *  stop's own (counts, kernel process names), never a record's */
  _runLogLine(file, text) {
    if (!file) return;
    // r3888 (law 3 of r3735, for the engine's own lines): ONE ordered road a run's log — each append starts after the one before it has
    // landed (two separate appends could land out of order: a force stop's two sentences were read in the reverse order)
    const road = this._runLogRoad || (this._runLogRoad = new Map());
    const next = (road.get(file) || Promise.resolve()).then(() => fs.promises.appendFile(file, `\n${text}\n`)).catch(() => { });
    road.set(file, next);
    next.then(() => { if (road.get(file) === next) road.delete(file); });   // (a run's road ends with its last line: nothing kept)
  }
  /** B-c134 cure (MUST A): the wrappers this engine holds — each live job's, by the pid it spawned or adopted — kept out of every
   *  stop's walk but their own job's (a recycled pid only makes a stop end less) */
  _wrappersHeld() {
    const out = [];
    for (const j of this.jobs.values()) if (j && j.proc && Number(j.proc.pid) > 1 && WRAPPER_HELD.has(j.state)) out.push([Number(j.proc.pid), 0]);
    return out;
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
    return { unit: b.unit, dir: cg ? path.join(this.d.cgroupRoot || '/sys/fs/cgroup', cg) : '', cg }; // cgroupRoot: a fast suite's fake tree only
  }
  /** SIGKILL to every process of a scope (its cgroup.kill, opened O_WRONLY — never created). Round 6: TWO OUTCOMES, TWO WORDS —
   *  'killed'; 'gone' (nothing there to kill: the scope is gone, or empty); 'nokill' (the scope still holds processes and has no
   *  cgroup.kill — a kernel before 5.14); 'refused' (another error); 'unread' (its read did not answer) — round 5 said «no
   *  cgroup.kill» for a scope that was merely gone */
  async _killScope(scope, out = {}, wrapper = 0) {
    if (!scope || !scope.dir) return 'gone';
    // B-2c5c: a scope that holds THIS hub (started by hand inside the job) is never killed WHOLE — its cgroup.kill would end the hub
    // and everything it runs: the job's own processes are killed one by one instead ('hub'), the hub's left alone
    if (await this._hubInScope(scope)) return this._killAroundHub(scope, out, wrapper);
    const err = await fs.promises.writeFile(path.join(scope.dir, 'cgroup.kill'), '1', { flag: fs.constants.O_WRONLY }).then(() => null, (e) => e || {});
    if (!err) return 'killed';
    out.code = err.code || 'an error'; // round 7: a refused kill says its errno
    const pids = await this._scopeProcs(scope);
    return pids === null ? 'unread' : !pids.length ? 'gone' : err.code === 'ENOENT' ? 'nokill' : 'refused';
  }
  /** B-2c5c: a process of THIS hub — the hub itself or under it by the parent chain (a hub started by hand inside a job: the job's scope,
   *  group and mark hold the hub and what it runs) — never a stop's to end */
  _hubsOwn(pid, wrapper = 0) {
    const p = Number(pid);
    if (p === process.pid) return true;
    // its read r1 (M1): the walk ends at THE JOB'S OWN wrapper — the hub spawned it, so past it every job process reads as the hub's.
    // Its read r2 (R1): only that one — once the hub runs INSIDE a job, every wrapper it spawns later sits in that job's scope; another
    // job's wrapper is the hub's (its chain reaches the hub first), never this job's. No wrapper known: every held one (r1's form)
    const stop = Number(wrapper) > 1 ? new Set([Number(wrapper)]) : new Set(this._wrappersHeld().map(([w]) => w));
    return PI.keptByChain(p, this._hubKeep || (this._hubKeep = new Map([[process.pid, 0]])), { stop });
  }
  /** B-2c5c r2: the wrapper pid a run's pid.json names (0 when none) — the stop of its hub test */
  _runWrapper(job, run) { const s = run ? this._ctlJson(job, run, 'pid.json') : null; return Number(s && s.pid) || 0; }
  /** B-2c5c, round wwa7r2uc1 (THE MAIN DOOR): this hub IS the run's main process — VibeSpace started AS the job (a restart run as a
   *  Background Work job: its command became this hub, its wrapper our parent). No stop of that job is the engine's to make: it would end
   *  the VibeSpace everyone uses. Proven, never guessed: our parent is the run's wrapper by its stamp (pid, start, boot — alive) */
  _hubIsMain(job, run) {
    if (!run || run.endedAt) return false;
    const latch = this._hubMainRuns || (this._hubMainRuns = new WeakSet());
    if (latch.has(run)) return true;   // its read (SHOULD 3): proven once, true for this process's life — a wrapper killed later moves our parent, not the fact
    if (run.hubMain && run.hubMainAt === this._bootAt) return true;   // B-2c5c unit 2: proven by THIS process (its boot) — the persisted fact, this generation's
    const st = this._readStamp(job);
    if (!st || !(Number(st.pid) > 1) || st.bootId !== bootId()) return false;
    // its read (SHOULD 2): the hub IS the main, or runs UNDER it (a launcher: `./run.sh`, `npm start` — a stop of the launcher ends or
    // orphans this hub): this process's own parent chain reaches the run's wrapper by its identity (pid + start). A fast suite's stand-in
    // parent (`d.hubParentPid`) is the one hop it names, proven alive by the stamp
    const seam = Number(this.d.hubParentPid);
    const yes = seam ? seam === Number(st.pid) && this._verifyAlive(st) : PI.hubChain(process.pid, { stop: Number(st.pid), stopStart: Number(st.starttime) || -1 }).reached;   // r1263 (b): THE ONE RECOGNISER (the wrapper's too)
    if (yes) { latch.add(run); if (!run.hubMain || run.hubMainAt !== this._bootAt) { run.hubMain = true; run.hubMainAt = this._bootAt; this._dirty = true; } }   // B-2c5c unit 2: kept on the run (jobs.json) — a later hub reads it after this one is gone
    return yes;
  }
  /** r1263 (a): ONE FACT, ONE ACCESSOR — «this run's main is the hub, or leads to it» (a launcher on the hub's own parent chain), from
   *  whichever record exists: the wrapper's end record (exit.json `hubMain`, its latch) or the run's KEPT fact (`run.hubMain`, proven by
   *  a hub's boot — the one record left when the wrapper was killed). EVERY road that ends, reaps, judges or replays a run reads it here
   *  (test-job-hub-main's census: a reader of the exit record's fact alone is red by name) */
  _hubMainOf(run, exit) { return !!((exit && exit.hubMain === true) || (run && run.hubMain === true)); }
  /** r1263 MUST 1: a SERVICE whose run's main was the hub is never restarted by itself — not by its policy, not by a boot's replay: a
   *  restart would start a second hub beside the one that runs. Not wanted up any more; said on its journal AND its card
   *  (`hubMainDown`, cleared by the person's Start) */
  _hubMainDown(job, memWhat = null) {
    job.state = 'down'; job.desiredUp = false; job.hubMainDown = now(); this._teardownPublish(job);
    // r1610 should: a hub-main service that ended on MEMORY keeps the memory words (its two roads name the end the same way)
    this._touch(job, { what: `${memWhat ? memWhat + ' — ' : ''}its main process was the VibeSpace hub — not restarted by itself: a restart would start a second hub beside the one that runs (start it again by hand if you mean to)` });
  }
  /** r1610 should 1: a TASK whose main was the hub, met at the next hub's boot (its wrapper killed, no exit record), ended WITH that
   *  hub — never «the machine restarted»: its own sentence names the hub, and the owner is never invited to start it again (a start
   *  would run a second hub beside the one that runs) */
  _hubMainTaskEnd(job) {
    job.state = 'interrupted';
    const what = 'interrupted: it ended with the VibeSpace hub that was its main process — not to be started again: a start would run a second VibeSpace beside the one that runs';
    this._touch(job, { what }); this._notifyOwner(job, { what, wake: 'interrupted' });
  }
  /** B-2c5c (THE MAIN DOOR): the refusal by name — said once a run and a road in the run's own log and the hub's; the job is not said
   *  stopped or ended (no stop asked, no grace, no kill step) */
  _hubMainRefusal(job, run, what = 'the stop') {
    const said = this._hubMainSaid || (this._hubMainSaid = new WeakMap()), roads = said.get(run) || new Set();
    if (run && !roads.has(what)) { roads.add(what); said.set(run, roads); this.d.log(`[jobs] ${job.id}: ${what} refused — ${HUB_MAIN_WORDS}`); this._runLogLine(this._runLogFile(job), `[jobs] ${what}: refused — ${HUB_MAIN_WORDS}`); this._touch(job, { what: `${what} refused — ${HUB_MAIN_WORDS}` }); }   // its readers' should: said on the row too (a limit refused left the row silent)
    return { error: HUB_MAIN_WORDS, code: 'hub-is-main' };
  }
  /** B-2c5c (主开发's small 4): the hub test for ONE pass — memoised per pid, as the wrapper's keptTest is (a pass asks it of every
   *  process of a scope or of the job's mark: each walk read the same chain again) */
  _hubTest(wrapper = 0) { const memo = new Map(); let anc = null; return (pid) => { const p = Number(pid); if (!memo.has(p)) memo.set(p, this._hubsOwn(p, wrapper) || (anc || (anc = this._hubAncestors())).has(p)); return memo.get(p); }; }
  /** B-2c5c, its readers' should (round wwa7r2uc1): a process UP this hub's own parent chain — its launcher (`./run.sh`, `npm start`)
   *  and what started it — is the hub's too: a reap after a killed wrapper SIGKILLed the launcher one by one (the hub left with no
   *  supervisor). Read up from our parent ONCE a pass (a live ancestor's pid is that process now) */
  _hubAncestors() { const out = PI.hubChain(process.pid).pids; out.delete(process.pid); return out; }   // r1263 (b): the hub's own chain, THE ONE RECOGNISER (the wrapper's walks read the same)   // 主开发 02:46Z: read ONCE a pass (it is the main loop), checked by membership
  /** B-2c5c: does this hub live in `scope`? Its OWN cgroup (/proc/self/cgroup, read once a life — a process never changes its cgroup
   *  by itself; `d.hubCgroup` = a fast suite's) is the scope's or under it */
  async _hubInScope(scope) {
    if (!scope || !scope.cg) return false;
    if (this._hubCg === undefined) {
      if (typeof this.d.hubCgroup === 'string') this._hubCg = this.d.hubCgroup;
      else this._hubCg = await fs.promises.readFile('/proc/self/cgroup', 'utf8').then((t) => { const l = t.split('\n').find((x) => x.startsWith('0::')); return l ? l.slice(3).trim() : ''; }, () => '');
    }
    return !!this._hubCg && (this._hubCg === scope.cg || this._hubCg.startsWith(scope.cg + '/'));
  }
  /** B-2c5c: the job's processes of a scope that holds this hub, by force, one by one (identity re-read at the act) — never the hub's
   *  own subtree → 'hub'; `out.hub` = { killed, kept } */
  async _killAroundHub(scope, out = {}, wrapper = 0) {
    // its read r1 (S3): never «done» unproven — a list unread is 'unread'; the scope is read again after the kill (a forking job), at
    // most three passes; what survives them is 'refused' (the reap retries it), never 'hub'
    let killed = 0, kept = 0, left = 0;
    for (let pass = 0; pass < 3; pass++) {
      const pids = await this._scopeProcs(scope);
      if (pids === null) { out.hub = { killed, kept, unread: true }; out.code = `its list ${this._listWords(scope)}`; return pass ? 'refused' : 'unread'; }
      const hubs = this._hubTest(wrapper), own = pids.filter((p) => !hubs(p));   // small 4: one memo a pass
      kept = pids.length - own.length; left = own.length;
      if (!own.length || pass === 2) break;
      for (const p of own) { const id = PI.identityOf(p); if (id && PI.signalIdentity(id, 'SIGKILL', { what: `a process of job scope ${scope.unit}` }).ok) killed++; }
      await pause(50);
    }
    out.hub = { killed, kept, left };
    if (left) { out.code = `${left} of its process${left === 1 ? '' : 'es'} survived the kill around the hub`; return 'refused'; }
    return 'hub';
  }
  /** B-2c5c: the words of a scope killed around the hub */
  _hubScopeWords(out) {
    const h = (out && out.hub) || {}, k = h.killed || 0;
    return `its scope holds this VibeSpace hub (started inside the job) — never killed whole: ${k} of its process${k === 1 ? '' : 'es'} killed one by one, the hub and what it runs left alone`;
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
      // B-2c5c (主开发 01:57Z): the errno decides, by name — a list that no longer EXISTS (ENOENT, ENOTDIR, ENODEV: the emptied scope
      // systemd removed) is EMPTY; one that exists and cannot be read is null (unread: retried, said) — every error read as «empty» before
      p = fs.promises.readFile(path.join(scope.dir, 'cgroup.procs'), 'utf8').then((t) => { if (this._listErr) this._listErr.delete(scope.dir); return t.split('\n').filter((l) => /^\d+$/.test(l)).map(Number); }, (e) => { if (e && GONE_LIST.has(e.code)) { if (this._listErr) this._listErr.delete(scope.dir); return []; } (this._listErr || (this._listErr = new Map())).set(scope.dir, (e && e.code) || ''); return null; });
      reads.set(scope.dir, p);
      p.then(() => { if (reads.get(scope.dir) === p) reads.delete(scope.dir); });
    }
    let settled = false; p.then(() => { settled = true; });
    return this._within(p, Math.max(0, ms)).then((r) => { if (r === null && !settled && this._listErr) this._listErr.delete(scope.dir); return r; });   // 主开发 02:46Z: a time-out says a time-out, never an older read's errno
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
    if (this._hubIsMain(job, run)) { this._hubMainRefusal(job, run, 'its kill'); return false; }   // B-2c5c: THE MAIN DOOR — never its scope, never its wrapper
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
    if (!k) { const st = this._readStamp(job); if (this._verifyAlive(st)) this._killTree(job, st); }   // B-c134: what moved out of the scope dies with it (read first)
    const ko = {};
    this._killScope(scope, ko, this._runWrapper(job, run)).then((r) => { rec.r = r; if (r === 'killed') said('its scope was killed'); else if (r === 'hub') said(this._hubScopeWords(ko)); });   // B-2c5c
    return true;
  }
  /** a run's SIGTERM — a stop's, a timeout's, an until-marker's — and (round 7) the STOP'S INTENT before it, beside the run's
   *  pid.json: the engine signals the wrapper's GROUP, so the wrapper may handle its child's end before its own signal handler
   *  runs — the intent tells it a stop is in flight all the same (a service's leftovers are stopped with it, not kept) */
  _termRun(job, run) {
    // B-2c5c, round wwa7r2uc1 (THE MAIN DOOR): the job's main IS this hub — no intent, no signal: refused by name (a stop asked before
    // its stamp existed is no longer asked: the job is not said stopping)
    if (this._hubIsMain(job, run)) { this._hubMainRefusal(job, run, job._timedOut ? 'its time limit' : job._untilHit ? 'its until-marker' : 'the stop'); delete job._stopRequested; return false; }
    if (run && !run.endedAt) {
      // round 10: A STOP GOES ONCE — a wrapper already delivering a stop step itself (its stopping.json: its own stop, an agent's
      // signal to it; or the drain of what its ended job left) is signalled ALONE, the intent saying so — it delivers the rest
      // through its one table (round 9 signalled the whole group again: a process mid-cleanup heard SIGTERM twice, code 143)
      // B-c134 A STOP ENDS THE WHOLE TREE IT STARTED: the tree under the wrapper is read FIRST (a child of its main is re-parented the
      // moment the main dies — and the group's signal reaches the main and the wrapper at once) and rides the intent; the wrapper's stop
      // step delivers it through its ONE table (one SIGTERM a process — the engine sends the tree none). Synchronous, as the release's
      // member walk: procfs, the tree's own cost, bounded — the stop's signal stays in this same tick
      // B-2c5c r1 (M3): a hub in the job's PROCESS GROUP — the engine signals the wrapper alone (_killGroup), so the intent says so
      // (`alone`, `hub`): the wrapper then signals the job's processes itself, once (else it took the group as having heard the stop)
      const st = this._readStamp(job), live = !!(st && this._verifyAlive(st)), hubInGroup = live && PI.pgidOf(process.pid) === Number(st.pid);
      const ctl = this._ctlDir(job, run.startedAt), alone = !!this._ctlJson(job, run, 'stopping.json') || hubInGroup;
      const tree = live ? PI.treeOf([Number(st.pid)], { since: Number(st.starttime) || 0 }) : Object.assign([], { cut: false, keptOut: [] });
      const all = tree.filter((m) => m.pgid !== Number(st && st.pid)), rows = all.slice(0, 256).map((m) => [m.pid, m.starttime, m.pgid, m.comm]);
      const treeCut = tree.cut || all.length > rows.length;   // cure: the intent's row cap is a cut too — said by the wrapper
      // cure (MUST A): the intent names what the wrapper's walk must not enter (the hub, the conversations' holders, the other jobs' wrappers)
      try { writeJsonAtomic(path.join(ctl, 'stop.json'), { sig: 'SIGTERM', at: now(), ...(alone ? { alone: true } : {}), ...(hubInGroup ? { hub: true } : {}), ...(rows.length ? { tree: rows } : {}), ...(treeCut ? { treeCut: true } : {}), ...(tree.keptOut && tree.keptOut.length ? { keepOut: tree.keptOut.slice(0, 512) } : {}) }); } catch { }
      // cure r2 (its own read F6): said only of a wrapper PROVEN gone — a stamp of this boot whose process is not there, no end record — once a run
      if (st && !live && st.bootId === bootId() && PI.aliveIdentity(st) === false && !this._ctlJson(job, run, 'exit.json') && !(this._goneSaid || (this._goneSaid = new Set())).has(ctl)) { this._goneSaid.add(ctl); this._runLogLine(this._runLogFile(job), '[jobs] stop: its wrapper had already ended — what the job started could not be read, and may still be running'); }
      if (tree.pruned) this._runLogLine(this._runLogFile(job), `[jobs] stop: its tree walk left alone ${tree.pruned} process${tree.pruned === 1 ? '' : 'es'} it does not own (the hub's, another conversation's or another job's)`);
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
    // B-2c5c unit 1: its MAIN WAS THE HUB (the wrapper's record) — what its scope holds is the hub's (its conversations, its helpers): never
    // reaped, whatever road asked (said once)
    { const ex = this._readExit(job, run); if (this._hubMainOf(run, ex)) { if (!run._hubMainSaid) { run._hubMainSaid = true; this.d.log(`[jobs] ${job.id}: its main process was the VibeSpace hub — what is left in its scope is the hub's: not reaped`); } return true; } }
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
    if (fresh) k.p = this._killScope(scope, k.out, this._runWrapper(job, run)).then((r) => { k.r = r; if (r === 'killed') st.killed = true; else if (r !== 'nokill' && st.kill === k) delete st.kill; return r; });
    const r = k.r !== undefined ? k.r : fresh && left() > 0 ? await this._within(k.p, left()) : null;
    if (k.out && k.out.hub) st.hub = true;   // B-2c5c r2 (R5): the scope holds this hub — its drop words never say to kill the scope whole
    if (r === null || r === 'unread') { st.last = { why: 'unread' }; return false; }
    if (r === 'refused') { st.last = { why: 'refused', code: k.out.code || 'an error' }; return false; }
    if (r === 'gone') return true; // nothing there (it ended on its own meanwhile) — nothing killed, nothing said
    if (r === 'hub') { run._scopeEmpty = true; return this._reapSaid(job, run, scope, r, k.out); }   // B-2c5c: the job's processes killed; the hub stays — never «survived», never retried
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
    const cmd = run._reap && run._reap.hub ? 'not reaped: its scope holds this VibeSpace hub — stop what is left of the job one by one (never systemctl kill its scope: that ends the hub)' : `not reaped: systemctl --user kill --signal=KILL ${scope ? scope.unit : '(its scope)'}`;
    if (last.why === 'unproven') return '';
    if (last.why === 'refused') return `its wrapper was gone and its scope ${n ? `still held ${n} process${es(n)}` : 'held processes'} — its kill was refused (${last.code}) in ${tries} tries — ${cmd}`;
    if (last.why === 'survived') return `its wrapper was gone and ${last.n} process${es(last.n)} survived its kill in ${tries} tries — ${cmd}`;
    return `its wrapper was gone and its scope ${this._listWords(scope, `${tries} tries`)} — ${cmd}`;
  }
  /** the reap's words, once, on the run and its journal — what it read (or that no read answered), and what was done */
  /** its fresh read (SHOULD 1): what a scope's list read answered when it gave no list — its errno when it was refused (EACCES, EIO …),
   *  else the bound it did not answer in */
  _listWords(scope, bound) { const has = !!(scope && this._listErr && this._listErr.has(scope.dir)), e = has ? this._listErr.get(scope.dir) : ''; return has ? `could not be read${e ? ` (${e})` : ''}` : `did not answer a read${bound ? ` in ${bound}` : ''}`; }
  _reapSaid(job, run, scope, r, out = null) {
    const n = run._reap && run._reap.n, bound = this.d.reapReadMs ?? REAP_READ_MS;
    const held = n ? `its wrapper was gone and its scope still held ${n} process${n === 1 ? '' : 'es'}` : `its wrapper was gone and its scope ${this._listWords(scope, `${bound / 1000} s`)}`;
    const words = r === 'killed' ? `stopped by force: ${held} — its scope was killed` : r === 'hub' ? `stopped by force: ${held} — ${this._hubScopeWords(out)}` : `${held} — not killed: this kernel has no cgroup.kill — systemctl --user kill --signal=KILL ${scope.unit}`;
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
    const grace = this._graceMs(), scope = this._runScope(job, run), until = now() + grace, ownW = this._runWrapper(job, run);   // B-2c5c r2: the run's own wrapper ends the hub test's walk
    const recorded = (l.pids || []).map(([pid, starttime]) => ({ pid, starttime, bootId: l.boot || '' }));
    const sent = new Map(); // pid → identity: every process its SIGTERM reached (a pid is never an identity — B-1cc6: read and proven by the one module)
    const term = (ids) => { const hubs = this._hubTest(ownW); for (const id of ids) if (id && !sent.has(id.pid) && !hubs(id.pid) && PI.aliveIdentity(id) === true) { sent.set(id.pid, id); PI.signalIdentity(id, 'SIGTERM'); } };   // B-2c5c: never the hub's
    let n = 0, force = false, blind = false, seen = null;
    if (scope && scope.dir) {
      // round 6: a read past its bound is no reason to skip the grace — SIGTERM BLIND to what the run recorded (the wrapper names
      // a kept scope's processes too), the read retried through the grace, what it then lists SIGTERMed as it appears
      const ownOf = (ps) => { const hubs = this._hubTest(ownW); return ps && ps.filter((x) => !hubs(x)); };   // B-2c5c: what the hub runs inside the scope is not the run's (small 4: one memo a pass)
      let pids = ownOf(await this._scopeProcs(scope));
      if (pids) term(pids.map((p) => PI.identityOf(p))); else { blind = true; term(recorded); }
      n = Math.max(pids ? pids.length : 0, sent.size);
      while ((pids === null || pids.length) && now() < until) {
        await pause(50);
        const p = ownOf(await this._scopeProcs(scope));
        if (p) { term(p.map((x) => PI.identityOf(x))); pids = p; n = Math.max(n, sent.size); }
      }
      if (pids === null || pids.length) {
        force = true;
        await this._within(this._killScope(scope, {}, ownW), this.d.reapReadMs ?? REAP_READ_MS);
        await this._scopeEmpty(scope, 1000);
      }
      if (!n) n = pids === null ? l.n : 0;
    } else {
      // round 6: the GROUP AT CLEAR TIME, never only the recorded list — what a kept process forked since the record, the rows
      // past the record's bound and what left the group carrying the job's mark (a fresh /proc scan of src/proc-identity.js);
      // the group only while a recorded process of it lives (its id is then still that group's — never a recycled leader's)
      const st = this._ctlJson(job, run, 'pid.json');
      const scan = async () => {   // B-d8f4 (9): the walk OFF the loop (_walkMarked) — this clear awaits it, nothing else does
        if (!st || st.bootId !== PI.bootIdOf()) return [];
        const anchored = recorded.some((id) => PI.aliveIdentity(id) === true);
        // round 8: the job's own candidates first (what the record names, and their children), the bound on the rest
        const found = await this._walkMarked({ pgid: anchored ? st.pid : 0, since: Number(st.starttime) || 0, mark: `VIBESPACE_JOB_ID=${job.id}`, first: recorded.map((id) => id.pid) });
        if (found.scan) seen = { ...found.scan, cut: !!(found.scan.cut || (seen && seen.cut)) }; // round 7: what it could not read, said
        if (found.ended) seen = { scanned: 0, total: 0, ...(seen || {}), cut: true, ended: found.ended };   // B-d8f4 (9): an ended walk proves nothing — said as a cut
        return found;
      };
      term(recorded); term(await scan());
      // round 10: the first walk's answer is known NOW — a cut one stamped at once (the start that asked answers its refusal in
      // its own tick, never «ok»), a finished one lifts an older stamp; the clear's end keeps it (said with what it then knew)
      if (seen && seen.cut && seen.ended) l.cut = { at: now(), why: `${require('./server/marked-walk.js').endedWords(seen.ended)}${sent.size ? `; ${sent.size} found and stopped` : ''}` };   // B-d8f4 (9)
      else if (seen && seen.cut) l.cut = { at: now(), why: `could not check ${seen.total - seen.scanned} of ${seen.total} processes for what it left running${sent.size ? `; ${sent.size} found and stopped` : ''}` };
      else delete l.cut;
      let live = [...sent.values()];
      while (live.length && now() < until) { await pause(50); live = live.filter((id) => PI.aliveIdentity(id) === true); }
      // round 9: the second walk only after a grace something lived through — nothing signalled, nothing could fork since: the
      // first walk's answer stands (never two walks back to back on the event loop)
      const hubsL = this._hubTest(ownW), late = sent.size ? (await scan()).filter((id) => !sent.has(id.pid) && !hubsL(id.pid)) : []; // forked during the grace: by force with the rest — B-2c5c r1 (S2): never the hub's
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
      if (!l.cut) l.cut = { at: now(), why: `${seen.ended ? require('./server/marked-walk.js').endedWords(seen.ended) : `could not check ${seen.total - seen.scanned} of ${seen.total} processes for what it left running`}${n ? `; ${n} found and stopped` : ''}` }; // the late walk's cut — an ENDED late walk in its own words (主开发 r2228 (1): never «could not check 0 of N»)
      this._dirty = true;
      return;
    }
    delete l.cut;
    const ww = PI.walkWords(seen);   // r4324 (the round's MUST): the walk's words from the ONE builder — an ENDING process is said here too, never dropped silently
    const scanned = ww.othersUnread || ww.unread || ww.stillEnding ? ` (its mark searched in ${seen.scanned} processes${ww.othersUnread || ww.unread ? `; unreadable: ${[ww.othersUnread, ww.unread].filter(Boolean).join(', ')}` : ''}${ww.stillEnding ? `; ${ww.stillEnding}` : ''})` : '';
    this._dirty = true;
    if (!n) {
      l.gone = now();
      const what = `what its last run left running had already ended — nothing stopped${scanned}`;
      this.d.log(`[jobs] ${job.id} ${what}`); this._touch(job, { what });
      return;
    }
    l.cleared = now();
    const how = !force ? '' : blind && !sent.size ? ` — by force: its scope ${this._listWords(scope, `${grace / 1000} s`)}, so no SIGTERM could reach it` : blind ? ` — by force, ${grace / 1000} s after its SIGTERM (sent to what it recorded: its scope did not answer a read)` : ` — by force, ${grace / 1000} s after its SIGTERM`;
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
  _startAfter(job, trigger, should, opts = {}) {
    if (job._starting) return job._starting;
    const run = job.runs && job.runs[job.runs.length - 1];
    const go = () => { if (should() && this.jobs.get(job.id) === job && !this._besideLive(job, trigger) && !this._doubtBlocks(job, run, trigger)) this._spawn(job, trigger, opts); };
    if (!this._pending(job, run)) { go(); return Promise.resolve(); }
    // B-b14a: a DEFERRED start the budget refused (it waited for its last run's reap) is a service's failed start too — on its
    // ladder, exactly like the start that went at once (the restart policy's catch); a person's press is said on its events
    // round wh9e7xe8i + r931: the presses waiting on this start (one record: the state before the FIRST press since the last Stop,
    // and every presser) are UNDONE when the budget refuses it and each presser is told once; then an automatic start's refusal
    // counts on the service's ladder (over the restored supervision)
    const p = job._starting = this._clearBefore(job, run, trigger).then((clear) => {
      delete job._starting;
      if (!clear) { const pr = job._press; delete job._press; if (pr && pr.owed) this._tellNotStarted(job, run, pr.owed); return; }   // B-d8f4 (9): each presser answered «checked first» hears the refusal
      try { go(); delete job._press; } catch (e) {
        if (e && e.code === 'memory-budget') {
          const pr = this._undoRefusedPress(job);
          if (pr) this._tellRefused(job, e, pr.by);
          if (job.kind === 'service' && trigger !== 'manual') this._budgetLadder(job, e);
          else if (!pr) this.d.log(`[jobs] ${trigger} start of ${job.id} refused:`, e.message);
        } else { delete job._press; this.d.log(`[jobs] ${trigger} start of ${job.id} refused:`, e.message); }
      }
    });
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
    const ownW = this._runWrapper(job, run);   // B-2c5c r2: the run's own wrapper ends the hub test's walk
    const killed = scope && scope.dir ? await this._within(this._killScope(scope, {}, ownW), this.d.reapReadMs ?? REAP_READ_MS) : null;
    const marked = await this._walkMarked({ mark: `VIBESPACE_JOB_ID=${job.id}` }), scan = marked.scan || {}, ww = PI.walkWords(scan), hubs = this._hubTest(ownW), found = marked.filter((id) => !hubs(id.pid));   // B-2c5c: a hub started inside the job carries its mark
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
    const what = `stopped by its owner — the previous run was not proven gone: ${did}${scan.cut ? `; could not check ${scan.total - scan.scanned} of ${scan.total} processes` : ''}${ww.unread ? `; its mark could not be read in ${ww.unread}` : ''}${ww.stillEnding ? `; ${ww.stillEnding}` : ''}${marked.ended ? `; ${require('./server/marked-walk.js').endedWords(marked.ended)}` : ''}; it may start again`;   // B-d8f4 (9): an ended walk said
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
    return !((exit && exit.scopeEmpty === true) || this._hubMainOf(run, exit));   // B-2c5c unit 1 + r1263: what a hub-main run left is the hub's — nothing to wait for
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
      this._touch(j, { what: `refused to run (${trigger}): ${vet.error}`, alarm: true });
    }
    this.d.log(`[jobs] ${job.id} refused to run (${trigger}) — ${vet.code || 'vendor/credential pattern'}`);   // lane job-secrets-retire: a refusal with a name (envfrom_retired) journals it
    this._save();
    this._vaultAskOver(parent || job); // lane vault-job-approval: a job refused at its vet leaves no open approval card
  }
  // ── THE VAULT VALUES (lane vault-job-road, design-vault-service-secret L1a) ─────────────────────────────────────────────
  /** the door (src/server/vault-job-door.js), wired once the vault exists (the mounts wiring) — never before: a job that needs
   *  its values meanwhile WAITS for the vault, exactly as when it is locked */
  setVaultJob(door) {
    this._vaultJob = door || null;
    if (door && typeof door.bindJobs === 'function') door.bindJobs(this); // lane vault-job-approval: a Deny on its card refuses the job (vaultRefused)
    if (door && typeof door.onChange === 'function') door.onChange((why) => this.vaultChanged(why));
    this.vaultChanged('wired');
  }
  /** an unlock, an approval (a `vault-job` row changed), the door wired: every WAITING job is judged again — a start through
   *  _startAfter (never beside what its last run left); a job still unable to start waits on, said once */
  vaultChanged(why) {
    if (this.readOnly || !this.ready) return;
    const trigger = why === 'vault-approved' ? 'vault-approved' : 'vault-unlocked';
    for (const job of this.jobs.values()) {
      if (job.state !== 'waiting') continue;
      if (!this._waitLive(job)) { this._settleWait(job, 'its schedule was stopped or removed while it waited'); continue; }
      try { this._startAfter(job, trigger, () => this._waitLive(job)); } catch (e) { this.d.log(`[jobs] ${trigger} start of ${job.id} refused:`, e.message); }
    }
  }
  /** a waiting job may still start: the engine's, still waiting — and a scheduled run's cron still on (the review: a cron stopped
   *  or removed while its run waited never starts that run, whatever an unlock or an approval says later) */
  _waitLive(job) {
    if (job.state !== 'waiting' || this.jobs.get(job.id) !== job) return false;
    if (!job.cronParent) return true;
    const p = this.jobs.get(job.cronParent);
    return !!p && p.desiredUp !== false && p.state !== 'failed';
  }
  /** a wait that will never start: it ends, said once (a task's never ran — interrupted; a service's — down) */
  _settleWait(job, why) {
    if (job.state !== 'waiting') return;
    this._vaultAskOver(job); // lane vault-job-approval: a wait that ends without a start closes its cards
    job.state = job.kind === 'task' ? 'interrupted' : 'down'; delete job.waitFor;
    this._touch(job, { what: `not started: ${why}` });
    this._save();
  }
  /** THE GATE of one spawn → the verdict with its frame (go) | false (it waits — said) | throws (refused — said, parked) */
  _vaultGate(job, trigger) {
    const door = this._vaultJob || this.d.vaultJob || null;
    let v = door ? door.gate(job) : { wait: 'vault' };
    if (v.go) { const p = door.payload(v); if (p.ok) { p.frame.fill(0); this._vaultAskOver(job); return { ...v, door }; } v = p; } // every value opened and checked — the frame itself is built where it is handed (_spawn); lane vault-job-approval: a job that STARTS (by any road) leaves no open card
    if (v.wait) {
      // lane vault-job-approval (L1b): a wait for the person's approval files its CARD (ONE per job, naming its entries — the door's); a card
      // that cannot be filed (the caps, a Deny's ten minutes, the tray refused it) is a refusal by name — never a silent wait
      const a = v.wait === 'approval' && door && typeof door.ask === 'function' ? door.ask(job, v) : null;
      if (!(a && a.ok === false)) { this._waitFor(job, v.wait, door); return false; }
      v = a;
    }
    throw new Error(this._vaultRefuse(job, v, trigger));
  }
  /** a job (and a scheduled run's cron) refused its vault values — failed, said once with the door's words; its approval cards
   *  close (lane vault-job-approval) → the words */
  _vaultRefuse(job, v, trigger) {
    const words = `${v.words || v.code}${v.key ? ` (--vault ${v.key})` : ''}`;
    const parent = job.cronParent ? this.jobs.get(job.cronParent) : null;
    for (const j of parent ? [job, parent] : [job]) {
      j.state = 'failed'; j.desiredUp = false; delete j.waitFor;
      if (j.kind === 'cron') j.nextFireAt = null;
      if (j.kind === 'service') this._teardownPublish(j);
      this._touch(j, { what: `refused to run (${trigger}): ${words}`, alarm: true });
    }
    this.d.log(`[jobs] ${job.id} refused to run (${trigger}) — its vault values (${v.code})`);
    this._save();
    this._vaultAskOver(parent || job);
    return words;
  }
  /** lane vault-job-approval (L1b): the person DENIED a job's use of an entry on its card (or the card closed unanswered) — the
   *  waiting job is refused by name (a scheduled run's: its cron too — the approval is the cron's); a later start asks again.
   *  `v` = the door's refusal ({code, words, key}). → whether a waiting job was refused */
  vaultRefused(jobId, v, trigger = 'vault-denied') {   // `trigger`: 'vault-card-unfiled' when the card could not be filed as its file facts landed (the door)
    if (this.readOnly) return false;
    const job = this.jobs.get(String(jobId || ''));
    if (!job) return false;
    // whatever its wait reads NOW (the adversarial read: a locked boot re-judges an approval wait into a VAULT wait — the person's
    // Deny still refuses it); a schedule is refused whole — its waiting run, or the cron itself between two fires
    const v0 = v || { code: 'vault_denied' };
    if (job.kind === 'cron') {
      const run = [...this.jobs.values()].find((k) => k.cronParent === job.id && k.state === 'waiting') || null;
      if (run) { this._vaultRefuse(run, v0, trigger); return true; }
      if (job.state === 'failed' || job.desiredUp === false) return false;
      this._vaultRefuse(job, v0, trigger);
      return true;
    }
    if (job.state !== 'waiting') return false;
    this._vaultRefuse(job, v0, trigger);
    return true;
  }
  /** lane vault-job-approval (decision ④ — REVOKE = STOP): the person took back a job's use of an entry (its ✕) — a job that is
   *  running, starting, scheduled, waiting or meant to be up is STOPPED at once (desiredUp false: no restart, no next fire) and
   *  its owner conversation is told ONCE (`words`, the door's). A lock never comes here (decision ③). → whether it stopped one */
  vaultRevoked(jobId, words) {
    if (this.readOnly) return false;
    const job = this.jobs.get(String(jobId || ''));
    if (!job || !this._vaultLive(job)) return false;
    // a SCHEDULE's approval is the cron's (D4): its run that is up holds the value too — stopped with it (the second adversarial
    // read: stop() of a cron settles only its WAITING runs)
    if (job.kind === 'cron') for (const k of [...this.jobs.values()]) if (k.cronParent === job.id && ['up', 'starting', 'awaiting-user'].includes(k.state)) this.stop(k);
    const s = this.stop(job);
    if (s && s.code === 'hub-is-main') return false;   // B-2c5c: the hub running as this job is never stopped from inside — never said «stopped» (its approval is taken back all the same)
    this._touch(job, { what: String(words || 'stopped: its vault value was taken back'), alarm: true });
    this._notifyOwner(job, { what: String(words || 'stopped: its vault value was taken back') });
    this._save();
    return true;
  }
  /** …the entry it names was DELETED: a waiting job is refused by name (entry_unknown — its card over); a live one is stopped
   *  and its owner told once */
  vaultEntryGone(jobId, words) {
    if (this.readOnly) return false;
    const job = this.jobs.get(String(jobId || ''));
    if (!job) return false;
    if (job.state === 'waiting') { this._vaultRefuse(job, { code: 'entry_unknown', words: VJ.WORDS.entry_unknown }, 'vault-entry-deleted'); return true; }
    return this.vaultRevoked(job.id, words);
  }
  /** lane vault-job-approval (L2): a job's vault values as its PERSON's card names them — [{name, ref, label}] (the door's) | [] */
  vaultUsesOf(job) {
    const door = this._vaultJob || this.d.vaultJob || null;
    if (!VJ.refsOf(job).length || !door || typeof door.usesOf !== 'function') return [];
    try { return door.usesOf(job); } catch { return []; }
  }
  /** is anything of this job running or meant to run (what a revoke stops) */
  _vaultLive(job) {
    if (['up', 'starting', 'waiting', 'scheduled', 'awaiting-user'].includes(job.state)) return true;
    return (job.kind === 'service' || job.kind === 'cron') && job.desiredUp !== false && job.state !== 'failed';
  }
  /** lane vault-job-approval: jobs removed, cleared or archived — their ids leave every `vault-job` row in ONE write (the door's
   *  jobGone); a job with no `--vault` costs nothing (`jobs` = records) */
  _vaultGone(jobs) {
    const door = this._vaultJob || this.d.vaultJob || null;
    if (!door || typeof door.jobGone !== 'function') return;
    const ids = (Array.isArray(jobs) ? jobs : [jobs]).filter((j) => j && VJ.refsOf(j).length).map((j) => String(j.id));
    if (!ids.length) return;
    try { door.jobGone(ids); } catch (e) { this.d.log(`[jobs] ${ids.join(', ')}: their vault approvals could not be removed:`, e.message); }
  }
  /** its approval cards are over (removed, stopped, refused): the door closes each `ask-over` — a later start asks again */
  _vaultAskOver(job) {
    const door = this._vaultJob || this.d.vaultJob || null;
    if (!door || typeof door.askOver !== 'function' || !VJ.refsOf(job).length) return;
    try { door.askOver(VJ.askJobIdOf(job)); } catch (e) { this.d.log(`[jobs] ${job.id}: its approval cards could not be closed:`, e.message); }
  }
  /** A WAIT, NEVER A COUNTED FAILURE (kb §18: «a lock is a wait»): no run, the supervisor's count untouched; a locked vault's
   *  ONE helper names the job (the lock's one For-you item — never a new one); the state line says it once */
  _waitFor(job, why, door) {
    const again = job.state === 'waiting' && job.waitFor === why;
    job.state = 'waiting'; job.waitFor = why; job.proc = null;
    if (why === 'vault' && door) { door.blocked(`Background job ${this.labelOf(job)}`); if (!again && typeof door.waited === 'function') door.waited(job, why); }   // stage L3's F3: the wait's ONE audit line — at its start, never a sweep
    this._touch(job, again ? undefined : { what: VJ.waitWords(why) });
    this._save();
  }
  /** the frame to the wrapper's fd 3 — written, ended, zeroed (on its write, an error or the close). ONE use line per value,
   *  written when the hand-over ENDED (round 2 — the acceptance: a line written as the frame was queued counted a use for a run
   *  the wrapper refused before it read, «used N×» with no program given the value): the wrapper's ACK (VJ.ACK, one byte back
   *  once it read the frame whole) ⇒ `ok`; the channel closed with none ⇒ `refused:<why>` from the run's exit record (the
   *  wrapper writes it before it exits — its exit is what closes the channel) */
  _handValues(child, job, vj, frame, run) {
    const s = child.stdio && child.stdio[3];
    const zero = () => frame.fill(0);
    let said = false;
    const note = (outcome) => { if (said) return; said = true; try { vj.door.noteUses(job, vj, `Background job ${this.labelOf(job)}`, outcome); } catch { } };
    if (!s) { zero(); note(VJ.refusedOutcome(null)); return; }
    s.on('data', (b) => { if (Buffer.isBuffer(b) && b.includes(VJ.ACK)) note('ok'); });
    s.on('error', zero); // a wrapper gone before it read: its exit.json says the run never started
    s.on('close', () => { zero(); note(VJ.refusedOutcome(this._readExit(job, run))); });
    s.end(frame, zero);
  }
  /** round 2 — A WAIT IS ANSWERED AS ONE: a start that ended `waiting` says what it waits for (the hub's words: the door that
   *  exists NOW), never «started» nor another start's reason */
  _waitAnswer(job) { return { ok: true, state: 'waiting', waitFor: job.waitFor || null, after: VJ.waitWords(job.waitFor) }; }
  /** round 2: would this job's values WAIT if it started now (its vault locked, an approval this version cannot give)? ⇒
   *  { waitFor, words } | null — the gate's verdict read only (state, names, rows: nothing opened, nothing said) */
  _vaultWaitOf(job) {
    if (!VJ.refsOf(job).length) return null;
    const door = this._vaultJob || this.d.vaultJob || null;
    let v;
    try { v = door ? door.gate(job) : { wait: 'vault' }; } catch { return null; }
    return v && v.wait ? { waitFor: v.wait, words: VJ.waitWords(v.wait) } : null;
  }
  /** a SCHEDULED job's fires judged at its create / start — each would wait ⇒ said beside «scheduled» (a fire's wait is
   *  otherwise heard only when it fires) */
  _cronVaultWait(job) { return job.kind === 'cron' ? this._vaultWaitOf(job) : null; }
  _spawn(job, trigger, { caller = null } = {}) {
    const vet = M.vetSpec(job);
    if (!vet.ok) { this._refuseRun(job, vet, trigger); throw new Error(vet.error); }
    // B-b14a: THE BUDGET — a start whose bound does not fit beside what the running jobs MEASURABLY use is refused by name (no
    // measure ⇒ not judged: a boot replay, whose jobs were never measured, is never refused here)
    { const bv = this._budgetVerdict(job, M.memoryMbOf(job, this._memoryCtx({ hub: true })), caller); if (bv.refused) throw this._budgetRefusal(job, bv, trigger, caller); }
    // THE VAULT VALUES (lane vault-job-road): a job that declared --vault starts WITH its values or not at all — locked or
    // unapproved ⇒ it WAITS (no run, no counted failure; an unlock or an approval starts it — vaultChanged); an entry gone ⇒ refused
    const vj = VJ.refsOf(job).length ? this._vaultGate(job, trigger) : null;
    if (vj === false) return;
    const runTs = now();
    const ctl = this._ctlDir(job, runTs);
    fs.mkdirSync(ctl, { recursive: true, mode: 0o700 });
    fs.chmodSync(ctl, 0o700); // the run's dir holds its spec file and its log — the owner's alone (mkdir's mode is umask-masked)
    const stateBefore = job.state;   // the U4/U5 cure: what a refused start (its run not on disk) gives back
    job.state = 'starting';
    delete job._startAfterStop;   // B-cac2 (its read r2): a start asked during a stop is the next run's — any new run ends the ask (never a later run's end)   [lane lg-store-writes, the moved2 cure 3: back where the checkpoint had it — BEFORE the not-on-disk check: a start ATTEMPT ends the ask, refused or not]
    job.runs = job.runs || [];
    // THE MEMORY BOUND (lane jobs-memory-bound): THE LADDER's answer for THIS run (src/job-model.js memoryMbOf) rides the spec;
    // the wrapper measures the rung that enforces it and says so (bound.json while it runs, exit.json `memory` at its end)
    const mem = M.memoryMbOf(job, this._memoryCtx()); // the record's, until the wrapper says the bound it proved (_adoptBound)
    const hub = M.memoryMbOf(job, this._memoryCtx({ hub: true })); // the spec's: the rlimit / none rungs live inside the hub's own cgroup
    this._jobToken(job);   // lane lg-store-writes U4 (the move's hunt, F): the call credential minted BEFORE the intent's save, so its hash rides the write the spawn waits for
    job.runs.push({ startedAt: runTs, trigger, log: path.join(ctl, 'current.log'), memoryMb: mem.mb, memoryAskedMb: mem.askedMb !== undefined ? mem.askedMb : mem.mb, ...(mem.cap ? { memoryCap: mem.cap } : {}) }); // round 3: both numbers (asked, effective), and the instance's cap when it lowered the bound
    this._save();
    // A CHILD THE DISK DOES NOT HOLD IS NEVER STARTED (lane lg-store-writes, the U4/U5 cure — 主开发's as-if-must): the run's
    // intent waits for jobs.json ALONE (the notifications follow on the writer); a write that did not land inside the
    // writer's bound (a stalled mount), failed, or was deferred to the exit's flush ⇒ NO child — a kill before the store
    // landed would leave a child no record knows (and a schedule could fire it twice). The run is REFUSED BY NAME: its entry
    // taken back, the record failed with the reason (said to its owner), the start answers the error; a schedule fires
    // again at its next time
    // While a refused intent's store is STILL owed (the storage holds its write), the next start is refused AT ONCE — never a
    // second wait of the writer's bound on the main thread for the same held write (the cure's own adversarial read); a
    // landed store clears it (_storeWritten)
    // the U4/U5 cure 2 (its verdict's should): refused AT ONCE only while the SAME write is still held — the store the writer
    // had in flight at the last refusal, still in flight with no write of it landed since (a new wait would wait on it again);
    // any other case waits its own bound
    let W0 = null; try { W0 = this._writer(); } catch { }
    const flying = () => { try { const x = (W0 && typeof W0.stats === 'function' ? W0.stats() : []).find((r) => r.inflight); return x ? { file: x.file, writes: x.writes } : null; } catch { return null; } };   // the store by its FILE (test-record-clear-census follows a `.name` into a sentence)
    const held = this._intentHeld ? (() => { const f = flying(); return f && f.file === this._intentHeld.file && f.writes === this._intentHeld.writes ? f : null; })() : null;
    const intent = held
      ? { ok: false, why: `the storage still holds ${path.basename(held.file)}'s write (${Math.round((now() - this._intentHeld.at) / 1000)} s since a start was refused behind it)` }
      : this._onDisk(this.file, 'the run\'s intent');
    if (!intent.ok) {
      if (!held && !/deferred|stopping/.test(intent.why || '')) { const f = flying(); this._intentHeld = f ? { ...f, at: now() } : null; }
      job.runs.pop();
      // a person's start, or a record that had no state before this start, is FAILED; a restart, a replay, a rerun or a
      // schedule's existing child keeps what it was (a service stays 'down', an interrupted task 'interrupted', a vault wait
      // 'waiting') — said, with an alarm, either way. A START THAT COMES BACK BY ITSELF (the U4/U5 cure 2 — 主开发): one the
      // release would have made again (a restart policy's, the boot's replay, a vault unlock's, an update's rerun) is started
      // again once the store lands (_retryRefused — at most 3 times in a row); a person's start answered its error; a schedule's
      // child fires at its next time
      job.state = trigger === 'manual' || !stateBefore || stateBefore === 'starting' ? 'failed' : stateBefore;
      const comesBack = trigger !== 'manual' && !job.cronParent && job.state !== 'failed' && (job._diskRetries || 0) < 3;
      if (comesBack) { job._diskRetries = (job._diskRetries || 0) + 1; (this._refusedForDisk || (this._refusedForDisk = new Map())).set(job.id, trigger); }
      const parent = job.cronParent ? this.jobs.get(job.cronParent) : null;
      const door = comesBack ? 'it starts again by itself once the store is on disk'
        : parent ? (parent.schedule && parent.schedule.at ? 'a one-time schedule does not come back by itself: schedule it again (vibespace-job run … --at "+5m", or a new time) if it still matters' : 'its schedule runs it again at its next time')
          : 'start it again once the storage answers';
      const what = `not started (${trigger}): its run could not be recorded on disk first (${intent.why}) — no process was started; ${door}`;
      this._touch(job, { what, alarm: true });
      this._save();
      throw Object.assign(new Error(what), { code: 'EVSNOTONDISK' });
    }
    delete job._diskRetries;
    if (job.runs.length > 20) job.runs.splice(0, job.runs.length - 20);   // after the check: a refused start never costs the oldest run its entry
    // the run-arming clears come AFTER the check (the U4/U5 cure 2): a refused start leaves the record as it was
    delete job.ack; // a NEW run is a new claim on the user's attention (triage §13)
    delete job._stopRequested; delete job._termAt; delete job._stopForce; delete job._forced; // round 5: a stop said to an ENDED run never stops the next
    for (const t of job._killSteps || []) clearTimeout(t); // round 6: …nor does its kill timer — a new run disarms every timer of the last
    delete job._killSteps;
    // accept-fixes-jobs F6: the job's OWN directory (its cmd.cwd — never the server's cwd fallback) is exported as
    // VIBESPACE_JOB_CWD: vibespace-browser's write fence lets a job save a screenshot / download there
    const spec = {
      argv: job.cmd.argv, cwd: job.cmd.cwd || process.cwd(),
      // B-d73c: a job that NAMES its memory hands its Node a heap that follows it (75 %), beside its own NODE_OPTIONS — never over a
      // heap its own options name; a job that names none hands on no flag (today's behaviour exactly)
      // B-ba47's follow-up (主开发 r979/r985): the run's env carries VIBESPACE_HANDED — the names the hub added over the owner's
      // OWN words (its id, run, token, route, and the vault plan's names: they open something); a suite this job runs drops them
      env: jobRunEnv({ own: M.withNodeHeap(job.cmd.env, M.nodeHeapOf({ boundMb: hub.mb, source: hub.source, nodeOptions: (job.cmd.env || {}).NODE_OPTIONS })),
        handed: { ...(vj ? VJ.envOf(vj.plan) : {}), VIBESPACE_API: this.d.apiBase || `http://127.0.0.1:${process.env.PORT || 3456}`, VIBESPACE_JOB_ID: job.id, VIBESPACE_JOB_RUN: `${job.id}:${runTs}`, VIBESPACE_JOB_TOKEN: this._jobToken(job), ...(typeof job.cmd.cwd === 'string' && job.cmd.cwd[0] === '/' ? { VIBESPACE_JOB_CWD: job.cmd.cwd } : {}), PATH: path.join(this.d.dataDir, 'bin') + ':' + (process.env.PATH || '') } }),
      logCapBytes: 50 * 1024 * 1024, stdinOpen: !!job.stdinOpen,
      kind: job.kind === 'service' ? 'service' : 'task', // round 5 (the ruling): a service keeps what its run leaves running, a task's are stopped
      // round 4: the ASKED bound rides too — the cgroup rung caps it by what contains ITS scope, read once the scope exists
      memory: { mb: hub.mb, askedMb: hub.askedMb !== undefined ? hub.askedMb : hub.mb, cap: hub.cap || null, capRule: { minMb: M.MEMORY.minMb, hubShareMinMb: M.MEMORY.hubShareMinMb, hubShareRatio: M.MEMORY.hubShareRatio }, unit: `${this.d.memoryUnitPrefix || 'vibespace-job'}-${job.id}-${runTs}`, rungs: this.d.memoryRungs || M.MEMORY_RUNGS, ...(this.d.memorySample ? this.d.memorySample : {}) },
      ...(vj ? { vault: VJ.specOf(vj.plan) } : {}), // lane vault-job-road: the NAMES and their fds — the values ride the wrapper's fd 3, never this file
    };
    // A SECRET NEVER RIDES ARGV (lane job-spec-off-argv, 2026-10-20): the spec carries the job's secrets and its jbt_
    // token, and /proc/<pid>/cmdline is readable by every local user for the wrapper's whole life — so the spec rides a
    // file: 0600, O_EXCL (never written through a name already there), a fresh name per start; the wrapper reads it
    // ONCE and unlinks it. Nothing re-reads it: a job back after a restart is adopted by its stamp or re-spawned HERE.
    const specPath = path.join(ctl, `spec.${runTs}.json`);
    // B-460d: WHAT A JOB STARTS NEVER OUTRANKS THE HUB — the start's priority, read ONCE here, BEFORE the spec's file is opened (the
    // wiring's spawnPriority: the setting read at THIS start; a verdict that throws = not lowered, never a start lost or an fd left open)
    let pri = null; try { pri = typeof this.d.spawnPriority === 'function' ? this.d.spawnPriority() : null; } catch { pri = null; }
    const fd = fs.openSync(specPath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o600); // EEXIST ⇒ no start (that name is not ours to remove)
    const wrapper = path.join(this.d.dataDir, 'bin', 'job-wrapper.js');
    let child, frame = null;
    try {
      // B-f494: a job started LOWERED also carries that step's share for its cgroup — the wrapper's systemd-run --scope is a cgroup
      // BESIDE the hub's service, where only cpu weights compete (nice +5 weighs 335 of nice 0's 1024 ⇒ 33 of 100)
      if (pri && pri.priority) spec.cpuWeight = JOB_CPU_WEIGHT;
      try { fs.writeFileSync(fd, JSON.stringify(spec)); } finally { fs.closeSync(fd); }
      // lane vault-job-road: the values' frame is built LAST — nothing that can throw stands between it and its hand-off but the spawn
      if (vj) { const p = vj.door.payload(vj); if (!p.ok) throw new Error(p.words || 'the vault values could not be read'); frame = p.frame; }
      // B-460d: its wrapper is born at `nice -n 5` (the priority read above); the wrapper's systemd-run --scope runs in its own process,
      // so the job keeps the VALUE — and its scope takes spec.cpuWeight (B-f494). The wrapper's own words stay ONE array (suites cut
      // it as a whole: test-vault-job, test-jobs-engine).
      const argv = [...priorityArgv(pri && pri.priority), process.execPath, ...[wrapper, ctl, specPath, '--proto=' + WRAPPER_PROTO]];
      child = spawn(argv[0], argv.slice(1), { detached: true, stdio: vj ? ['ignore', 'ignore', 'ignore', 'pipe'] : 'ignore', env: wrapperEnv(job.id) });
      // an exec that fails late (the nice program gone since the one look) is an 'error' event: never the hub's crash —
      // the run's wrapper never appears, and the engine's supervision judges a start that wrote no pid
      child.once('error', (e) => { try { this.d.log && this.d.log(`[jobs] ${job.id}: its wrapper did not start (${argv[0]}): ${e && e.message}`); } catch { } });
    } catch (e) { try { fs.unlinkSync(specPath); } catch { } if (frame) frame.fill(0); throw e; } // a failed write or spawn leaves no spec behind (nor a frame)
    child.unref();
    if (vj) this._handValues(child, job, vj, frame, job.runs[job.runs.length - 1]);
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
    const kept = next && next.ok && JN.keepsWebUrl(job.lastPublicUrl, next.url); // B-74f5: a web address read as tcp:// is not said as the address it has now
    const v = JN.noticeVerdict({ prev: job.publishDown || null, next: kept ? { ...next, url: job.lastPublicUrl } : next, url: job.lastPublicUrl || null, at: now() });
    if (v.record) job.publishDown = v.record; else delete job.publishDown;
    // B-74f5 r3 (主开发 04:23Z, L1–L3): a «DOWN» is answered by its «back UP» AT ONCE, always; where the address moved the recovery
    // names both (`named`) and the change's later check only confirms it in the journal; a misread (`kept`) never moves the words
    const named = !!(v.notice && v.notice.kind === 'recovered' && !kept && next.ok && next.url && job.lastPublicUrl && next.url !== job.lastPublicUrl);
    if (next.ok) this._adoptJobUrl(job, next.url || null, { named });
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
    let n = 0; this._relayAt = now(); // B-74f5: the relay's own restart opens a grace for URL-change checks too
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
  /** The job's live URL + its last one (`lastPublicUrl` survives a stop). B-74f5: a URL different from the last one is SAID only once
   *  proven (`_checkUrlChange`); a web address read as tcp:// (the http probe misfired while the service or the relay came back)
   *  stays the web one until then. The pending pair is PERSISTED (`urlPending`) — a hub restart inside the grace checks the change it
   *  stored again; `named` = a recovery already named both addresses: the check then only confirms (r3: nothing is ever held). */
  _adoptJobUrl(job, url, { named = false } = {}) {
    const before = job.lastPublicUrl || null;
    if (!url) { job.publishedUrl = url; return; }
    const keep = JN.keepsWebUrl(before, url);
    job.publishedUrl = keep ? before : url;
    if (!keep) job.lastPublicUrl = url;
    const pend = job.urlPending || null;
    if (!before || before === url) {
      if (pend && pend.to === url && pend.from !== url) { if (!job._urlCheck && !this._urlGaveUp(job, pend.from, url)) this._checkUrlChange(job, pend.from, url, { named: !!pend.named, rounds: Number(pend.rounds) || 0 }); } // a hub restart inside the grace, a respawn, or a change not said looked at again
      else if (pend || job._urlCheck) { this._endUrlCheck(job); delete job.urlPending; } // the web address came back: its tcp read is forgotten
      return;
    }
    if (job._urlCheck && job._urlCheck.from === before && job._urlCheck.to === url) { if (named && !job._urlCheck.named) { job._urlCheck.named = true; if (job.urlPending) job.urlPending.named = true; } return; } // one check per change
    if (this._urlGaveUp(job, before, url)) return; // looked at URL_ROUNDS times in this run: dropped, the journal said why
    const same = pend && pend.from === before && pend.to === url;
    this._checkUrlChange(job, before, url, { named: named || !!(same && pend.named), rounds: same ? Number(pend.rounds) || 0 : 0 });
  }
  /** B-74f5 follow-up: a pair given up in THIS run (the mark ends with the teardown and with a new run — a later real move to that
   *  address is checked again). */
  _urlGaveUp(job, from, to) { const g = job._urlGaveUp; return !!(g && g.key === `${from} ${to}` && g.run === this._runStartOf(job)); }
  /** B-74f5 follow-up: a check superseded (a later pair, the web address back, a teardown) — its timer goes with it. */
  _endUrlCheck(job) { const c = job._urlCheck; job._urlCheck = null; if (c && c.t) { clearTimeout(c.t); if (this._urlTimers) this._urlTimers.delete(c.t); } }
  /** The start of the job's current run (ms) — a service's own restart opens the same grace a hub restart does (B-74f5 r2). */
  _runStartOf(job) { const r = (job.runs || [])[(job.runs || []).length - 1]; return (r && Number(r.startedAt)) || 0; }
  /** B-74f5: the looks at both addresses after the restart's grace — the hub's start, the job's own run start, or the vault unlock's
   *  re-publish (`relayChanged`), + URL_GRACE_MS; JN.urlChangeVerdict says whether the change is proven, JN.urlChangeWords whether
   *  it is said (a proven change the recovery already named is a journal line). A proven look is CONFIRMED by a second look at the
   *  old address URL_RELOOK_MS later. A later change, a teardown, the old address coming back, the job's end or the engine's stop
   *  ends the check, in silence. */
  _checkUrlChange(job, from, to, { named = false, rounds = 0, tries = URL_CHECK_TRIES, confirm = false } = {}) {
    if (job._urlCheck && job._urlCheck.t) this._endUrlCheck(job); // a later pair replaces the check — and its timer
    const tok = job._urlCheck = { from, to, named };
    job.urlPending = { from, to, rounds, ...(named ? { named: true } : {}) };
    const start = Math.max(this._bootAt || 0, this._relayAt || 0, this._runStartOf(job));
    const wait = confirm ? (this.d.urlRelookMs ?? URL_RELOOK_MS)
      : Math.max(0, start + (this.d.urlGraceMs ?? URL_GRACE_MS) - now()) + (tries < URL_CHECK_TRIES ? (this.d.urlCheckEveryMs ?? URL_CHECK_EVERY_MS) : 0);
    const timers = this._urlTimers || (this._urlTimers = new Set());
    const t = setTimeout(async () => {
      timers.delete(t);
      if (job._urlCheck !== tok || this.jobs.get(job.id) !== job) return;
      if (!['up', 'starting'].includes(job.state)) { // follow-up: a keep-up service between a crash and its respawn keeps its pending change (the respawn's publish read looks again); a job no longer wanted up says nothing
        job._urlCheck = null;
        if (job.desiredUp) { this.d.log(`[jobs] ${job.id}: a public URL check waits for the service to run again (its pending change is kept)`); return; }
        delete job.urlPending; this._touch(job); this.d.log(`[jobs] ${job.id}: a public URL check ended with the job`); return;
      }
      let toOk = false, fromOk = true;
      try { [toOk, fromOk] = await Promise.all([this._urlAnswers(to), this._urlAnswers(from)]); } catch { toOk = false; fromOk = true; } // a look that threw proves nothing
      if (job._urlCheck !== tok) return;
      const v = JN.urlChangeVerdict({ from, to, toAnswers: toOk, fromAnswers: fromOk });
      const next = { named: tok.named, rounds, tries };
      if (v.say && !confirm) { this._checkUrlChange(job, from, to, { ...next, confirm: true }); return; } // «the old one failed» is seen twice
      if (v.again && tries > 1) { this._checkUrlChange(job, from, to, { ...next, tries: tries - 1 }); return; }
      job._urlCheck = null;
      if (!v.say) { // follow-up: EVERY check that says nothing counts a round (the misread's later tcp reads started fresh looks for ever)
        if (rounds + 1 < URL_ROUNDS) { job.urlPending = { from, to, rounds: rounds + 1, ...(tok.named ? { named: true } : {}) }; this._touch(job); this.d.log(`[jobs] ${job.id}: a new public URL was not said — ${v.why} (looked at again at the next publish read)`); return; }
        delete job.urlPending; job._urlGaveUp = { key: `${from} ${to}`, run: this._runStartOf(job) }; this._touch(job); this.d.log(`[jobs] ${job.id}: a new public URL was not said — ${v.why} after ${URL_ROUNDS} rounds (dropped)`); return; // an exhausted pair leaves the record
      }
      delete job.urlPending;
      if (v.say && job.lastPublicUrl !== to) { job.lastPublicUrl = to; job.publishedUrl = to; } // a web address read as tcp://, now proven
      this._touch(job);
      const words = JN.urlChangeWords({ from, to, verdict: v, named: tok.named });
      if (!words) { this.d.log(`[jobs] ${job.id}: a new public URL was not said — confirmed: the recovery already named both addresses`); return; }
      this.d.log(`[jobs] ${job.id} public URL changed`);
      this._notifyOwner(job, { what: words });
    }, wait);
    tok.t = t; timers.add(t);
    t.unref?.();
  }
  /** B-74f5: does a public address answer? tcp:// = a TCP connect; http(s):// = one GET / answered below 500 and not the relay's own
   *  «not found» page (a 404 naming frp), its certificate not judged. URL_LOOK_MS each; any other error is a no. `d.urlAnswers`
   *  stands in for it (the suites). */
  async _urlAnswers(url) {
    if (typeof this.d.urlAnswers === 'function') return !!(await this.d.urlAnswers(url));
    let u = null; try { u = new URL(String(url)); } catch { return false; }
    const ms = this.d.urlLookMs ?? URL_LOOK_MS;
    if (u.protocol === 'tcp:') {
      return new Promise((res) => {
        const s = require('net').connect({ host: u.hostname, port: Number(u.port) });
        const fin = (ok) => { try { s.destroy(); } catch { } res(ok); };
        s.once('connect', () => fin(true)); s.once('error', () => fin(false)); s.setTimeout(ms, () => fin(false));
      });
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    return new Promise((res) => {
      let done = false, q = null;
      const fin = (ok) => { if (done) return; done = true; clearTimeout(guard); try { q && q.destroy(); } catch { } res(ok); };
      const guard = setTimeout(() => fin(false), ms + 1000); guard.unref?.();
      try {
        q = require(u.protocol === 'https:' ? 'https' : 'http').get(u, { timeout: ms, rejectUnauthorized: false, headers: { 'user-agent': 'vibespace-url-check' } }, (r) => { // r2: a self-signed backend's certificate is an address that ANSWERED
          const st = Number(r.statusCode) || 0;
          if (st !== 404) { fin(st > 0 && st < 500); return; }
          let body = ''; r.on('data', (d) => { body += d.toString('latin1'); if (body.length > 4096) fin(!/\bfrp\b/i.test(body)); });
          r.on('end', () => fin(!/\bfrp\b/i.test(body))); r.on('error', () => fin(false));
        });
        q.on('timeout', () => fin(false)); q.on('error', () => fin(false));
      } catch { fin(false); }
    });
  }
  /** forget = the public name goes too (never on a stop / park: the next start publishes the same name). */
  async _teardownPublish(job, { forget = false } = {}) {
    try {
      const pf = this.d.getPorts && this.d.getPorts();
      job._pubGen = (job._pubGen || 0) + 1; job._publish = null; this._endUrlCheck(job); delete job.urlPending; delete job._urlGaveUp; // B-74f5: a pending URL check (its timer, its give-up mark) ends with the publish
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
  /** A job's NAME through THE NAME RULE (lane job-notify-user r8 → r9, the rule fixed by the acceptance owner): the vault's live
   *  values, every shape wherever it sits, a word row's ONE token only when it is a value — a name keeps its words («password
   *  reset», «auth: fix login flow»). `typed`: the name AS TYPED (resolveName's mask — the run row runs, ONCE, before the slug);
   *  without it a STORED name, a slug (labelOf, a scheduled run's `<name> run`) — the run row never runs on a slug (r8 erased
   *  «GitHub CI on macOS 15 …» whole there, and labelOf every older record of that shape) */
  _nameWords(s, { typed = false } = {}) {
    // r253 (round wlc6blvqo): a name the rule could not judge is RECORDED (one journal line, by name); a belt that cannot even be
    // loaded answers the MARK, never the raw name (the law: when in doubt the rule hides)
    // r366: the failed rule is said ONCE A NAME (a bounded set of names in memory — the line never carries the name), the belt that
    // cannot load ONCE A PROCESS — never at every read
    const raw = String(s == null ? '' : s);
    const failed = () => { if (NAME_RULE_SAID.has(raw)) return; if (NAME_RULE_SAID.size >= 256) NAME_RULE_SAID.clear(); NAME_RULE_SAID.add(raw); try { this.d.log(`[jobs] the name rule could not judge a job's name — it was judged by the output belt and the run row instead`); } catch { } };
    try { return require('./agent-output-belt.js').maskForSink(raw, { dataDir: this.d.dataDir, byValue: true, typed, onFailed: failed }); } catch (e) {
      if (!NAME_BELT_SAID.done) { NAME_BELT_SAID.done = true; try { this.d.log(`[jobs] the name belt could not be loaded (${(e && e.message) || e}) — every job name is shown as «redacted» until VibeSpace restarts`); } catch { } }
      return '«redacted»';
    }
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
   *  older engine wrote keeps what it stored, whole to its author. r8: the name judged BY ITS VALUE (_nameWords) here and at the
   *  record — r7's output belt erased «reset» from «password reset»; a record r7 wrote keeps what it stored (nothing restores a word).
   *  r9: a STORED name (a slug) — THE NAME RULE without its run row (r8 ran it here and every older record of short words read `«redacted»`).
   *  test-architecture §93 THE NAME CENSUS names any reader of a record's name that skips this accessor.
   *  Memoised 30 s per name (the belt reads the vault; a list snapshot asks for every name). */
  labelOf(job) {
    const raw = String((job && (job.name || job.id)) || '');
    const memo = this._labelMemo || (this._labelMemo = new Map());   // (a manager built without the constructor — a suite's mutant — still names)
    const hit = memo.get(raw), t = now();
    if (hit && t - hit.at < 30e3) return hit.out;
    const out = this._nameWords(raw);
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
    // was handed in (`.call`, an alias), or a copy minted for another job is refused by name and said in the log with its caller.
    // r8 (accept-r7 confirmed 1): THIS job is its ID — the same record read twice is the same job; another id is refused.
    // r9 (accept-r8 unverified 2 + 6): the ID is a non-empty string (M.jobIdOf) — a job with no id gets no copy, refused by name
    // (r8 compared `undefined === undefined` and filed a hand-built copy handed with an id-less job)
    if (!c || !c.words || !c.fact) {
      if (c && c.refused && (c.copy === 'stray' || c.copy === 'shaped')) this.d.log(`[jobs] a For-you filing outside the one door (src/jobs.js _forYou) — caller ${callerOf(JobManager.prototype._forYou)}${job ? ' — job ' + job.id : ''}: ${c.refused}`);
      return this._forYouVerdict(job, { ok: false, why: (c && c.refused) || 'no such For-you copy' }, (c && c.copy) || 'unknown');
    }
    const minted = M.mintedFor(c), jobId = job ? M.jobIdOf(job) : null;
    if ((job && !jobId) || minted === undefined || minted !== jobId) {
      const why = job && !jobId ? 'a job with no id gets no For-you copy — refused' : minted === undefined ? 'a For-you copy is one forYouCopy minted — a hand-built copy is refused' : 'a For-you copy minted for another job is refused';
      this.d.log(`[jobs] a For-you filing outside the one door (src/jobs.js _forYou) — caller ${callerOf(JobManager.prototype._forYou)}${job ? ' — job ' + job.id : ''}: ${why}`);
      return this._forYouVerdict(job, { ok: false, why }, 'hand-built');
    }
    const words = { ...c.words, ...(c.words.params ? { params: { ...c.words.params } } : {}) };   // the store's own (the minted copy stays frozen)
    const forYouDep = FOR_YOU_DEPS.get(this) || null;
    let v;
    try { v = forYouDep ? forYouDep({ words, fact: c.fact, urgency: c.urgency, ...(job ? { jobId: job.id, jobName: job.name, ownerCid: job.owner?.conversation?.id || null } : {}), ...(c.renewOnly ? { renewOnly: true } : {}) }) : { ok: false, why: 'no For-you store is wired' }; } catch (e) { v = { ok: false, why: e.message }; }
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
    if (v && typeof v === 'object' && v.kept === true) return v;   // B-2566: a renewal of an item a PERSON closed — kept closed by design (no line a failure)
    // B-2566 follow-up (3): a filing that WAITS for For you's read is no refusal — its line says it waits; the landing at the read is
    // journalled by the wiring's waiter (forYouAtRead)
    if (v && typeof v === 'object' && v.held === true && job) {
      this._notifyLogPush(job, { lane: 'user-inbox', ok: null, held: true, reason: String(v.why || 'For you could not be read just now — filed when it reads').slice(0, 200), copy });
      job.forYouLast = { ...(job.forYouLast || {}), [copy]: { ok: null, held: true, ts: now() } };
      return v;
    }
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
  _jobToken(job) {
    if (!job._tokenRaw) { job._tokenRaw = 'jbt_' + crypto.randomBytes(16).toString('hex'); job.tokenHash = crypto.createHash('sha256').update(job._tokenRaw).digest('hex'); }
    return job._tokenRaw;
  }
  /** B-f276 family unit 2, the reader table (r3230): a job's token cannot be checked while jobs.json is HELD (its hashes live in the unread
   *  records) — every door that looks a jbt_ token up asks this when the lookup finds nothing: the hold's words by name (503), never
   *  «unknown job token» to a job that may be running. → { status, code, error } | null */
  tokenHeldAnswer(raw) {
    if (!(this._unread && this._unread.store) || !raw || !String(raw).startsWith('jbt_')) return null;
    return { status: 503, code: 'records-unread', error: this.unreadWords('a job\'s token cannot be checked while the job records cannot be read') };
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
          // B-2c5c unit 2: IS THIS HUB THAT RUN'S MAIN? asked once here, while our parent chain still reaches its wrapper (a run started
          // after this boot can never be its main) — the answer is kept on the run (a wrapper killed later moves our parent, not the fact)
          { const run0 = job.runs && job.runs[job.runs.length - 1]; if (this._hubIsMain(job, run0)) this.d.log(`[jobs] ${job.id}: its main process is this VibeSpace hub (started as this job)`); }
          if (job.kind === 'service' && job.publish && (job.ports || []).length) setTimeout(() => this._ensurePublish(job), 8000); // ports manager restores at +5.5s
          continue;
        }
        const run = job.runs && job.runs[job.runs.length - 1];
        const exit = this._readExit(job, run);
        // round 4: its wrapper is gone — what is left in its scope is an ended run's (a service's KEPT processes excepted —
        // round 5, the ruling: its replay stops them first); round 5: a service's replay AWAITS this reap (_startAfter); round
        // 6: a reap past its read's bound is never dropped — it enqueues itself and every tick retries it (_reapScope)
        // B-2c5c unit 1: a run whose MAIN WAS THE HUB (exit.json `hubMain`) left the hub's own conversations and helpers in its scope —
        // never reaped (never this job's)
        if (!((exit && (exit.scopeEmpty === true || (exit.left && exit.left.kept))) || this._hubMainOf(run, exit))) this._reapScope(job, run).catch(() => { });   // r1263: the kept fact too (a killed wrapper wrote no exit record)
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
    const byParent = new Map(), collapsed = [];
    for (const j of this.jobs.values()) if (j.cronParent) (byParent.get(j.cronParent) || byParent.set(j.cronParent, []).get(j.cronParent)).push(j);
    for (const [, kids] of byParent) {
      if (kids.length < 2) continue;
      kids.sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0));
      for (const old of kids.slice(1)) {
        if (!['done', 'interrupted', 'failed', 'missed'].includes(old.state)) continue;
        if (this._verifyAlive(this._readStamp(old))) continue;
        this.jobs.delete(old.id); this._dirty = true;
        (this._collapsed = this._collapsed || new Map()).set(old.id, kids[0].id); // poll of a stale id names the survivor
        collapsed.push(old.id);
      }
    }
    if (collapsed.length) this._logsWhole(collapsed); // lane job-logs-sweep: off the main thread (the remover's worker)
    for (const job of this.jobs.values()) {
      try {
        const replays = () => job.kind === 'service' && job.desiredUp && job.state === 'down' && !(job.supervise && job.supervise.parkedAt);
        if (replays()) this._startAfter(job, 'boot', replays); // round 5: never beside what its last run left (its reap awaited)
        else if (job.state === 'waiting') { if (this._waitLive(job)) this._startAfter(job, 'boot', () => this._waitLive(job)); else this._settleWait(job, 'its schedule was stopped or removed while it waited'); } // lane vault-job-road: judged again (locked at every boot ⇒ it waits on)
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
    // r1263 MUST 1: THE NEXT HUB'S BOOT reads the KEPT fact — a run whose main was the hub (its wrapper killed: no exit record) ended
    // with that hub; a SERVICE is not replayed (a second hub beside this one), nothing is counted toward a park
    if (this._hubMainOf(run, null)) { if (job.kind === 'service') this._hubMainDown(job, v.cause === 'oom' && ends ? M.memoryEndWhat(run) : null); else this._hubMainTaskEnd(job); return; }   // r1610: a TASK too, by its own words
    const mp = ends ? this._countEnd(job, v.cause) : null;
    if (v.cause === 'oom' && ends) {
      const said = `${M.memoryEndWhat(run)} — it held ${M.memoryWords(v.jobAnonMb)} of the instance's ${M.memoryWords(v.anonMb)} of anon memory (limit ${M.memoryWords(v.limitMb)})`;
      this.d.log(`[jobs] ${job.id} died with the instance out of memory — judged at boot, counted ${mp.count} of ${M.MEMORY.parkAfter}`);
      if (mp.park) { this._parkForMemory(job, run); return; }
      if (job.kind === 'service') { job.state = 'down'; this._touch(job, { what: `down: ${said}`, alarm: true }); return; }
      job.state = 'failed';
      this._touch(job, { what: `failed: ${said}`, alarm: true });
      this._notifyOwner(job, { what: `failed: ${said}`, wake: 'result' });
      return;
    }
    if (job.kind === 'service') { job.state = 'down'; this._touch(job); }
    else { job.state = 'interrupted'; this._touch(job, { what: 'interrupted (env-restart: the host/pod restarted)' }); this._notifyOwner(job, { what: 'interrupted (the machine restarted while it ran) — start it again if it still matters', wake: 'interrupted' }); }   // the manager design's piece 7: a task a restart interrupted is a RESULT to its owner (until now nobody was told)
  }
  /** a run's own record in its ctl dir — exit.json, and (lane jobs-memory-bound) bound.json / pressure.json the wrapper writes */
  _ctlJson(job, run, name) {
    if (!run) return null;
    const f = path.join(this._ctlDir(job, run.startedAt), name);
    if (this._ctlPre && this._ctlPre.has(f)) { try { return JSON.parse(this._ctlPre.get(f)); } catch { return null; } }   // B-f276 cure r2: read off the loop
    try { return JSON.parse(fs.readFileSync(f, 'utf-8')); } catch { return null; }
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
    // B-b14a: read ONCE on the loop (the first use: the cap and the budget need a figure at once); every refresh after that is
    // OFF the loop (_refreshLimit, bounded) — the cached figure answers in the meantime
    if (this._limitRead) { if (now() - this._limitRead.at >= 60e3) this._refreshLimit(); return this._limitRead; }
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
  /** B-b14a: THE ONE LIMIT READER, OFF THE LOOP — the same dirs and the same rule as _instanceLimit, through fs.promises,
   *  bounded (M.BUDGET.readBoundMs); one read in flight; a read past its bound (or failing) keeps the last figure */
  _refreshLimit() {
    if (this._limitReading) return this._limitReading;
    const read = async () => {
      let mb = null, of = null;
      const dirs = [];
      if (typeof this.d.memoryLimitDir === 'string') dirs.push(['/', this.d.memoryLimitDir]);
      else {
        const rel = ((await fs.promises.readFile('/proc/self/cgroup', 'utf8')).split('\n').find((l) => l.startsWith('0::')) || '0::/').slice(3) || '/';
        for (let p = rel; ; p = path.dirname(p)) { dirs.push([p, path.join('/sys/fs/cgroup', p)]); if (p === '/' || p === '.') break; }
      }
      for (const [cg, dir] of dirs) {
        let v = '';
        try { v = (await fs.promises.readFile(path.join(dir, 'memory.max'), 'utf8')).trim(); } catch { continue; }
        if (/^\d+$/.test(v)) { const m = Math.floor(Number(v) / 1048576); if (mb === null || m < mb) { mb = m; of = M.limitHolder(cg); } }
      }
      return { at: now(), mb, of };
    };
    this._limitReading = withinMs(read(), M.BUDGET.readBoundMs).then((r) => { if (r) this._limitRead = r; }, () => { }).finally(() => { this._limitReading = null; });
    return this._limitReading;
  }
  /** B-b14a: a job HOLDS budget while it runs (its live run) */
  _holdsBudget(j) { const run = j && j.runs && j.runs[j.runs.length - 1]; return !!run && !run.endedAt && ['up', 'starting', 'awaiting-user'].includes(j.state); }
  /** B-b14a: THE MEASURE — the job's OWN processes (the wrapper's descendants; the wrapper is not the job), RssAnon summed, ALL off
   *  the loop — its pid.json too (round wh9e7xe8i: the stamp was read synchronously under data/): never the instance's whole
   *  counter. At most M.BUDGET.perJobPids processes. WHAT IT MISSES (the kb says it): a child forked by another thread of a process
   *  (only the main thread's children file is read), a process re-parented away (setsid + its parent gone, a double fork), and on
   *  a kernel without the children file every job reads 0 — each makes the budget more generous, never a wrong refusal */
  async _treeAnonMb(job) {
    const run = job.runs && job.runs[job.runs.length - 1];
    if (!run) return null;
    const rd = (f) => fs.promises.readFile(f, 'utf8').catch(() => '');
    let st = null;
    try { st = JSON.parse(await rd(path.join(this._ctlDir(job, run.startedAt), 'pid.json'))); } catch { st = null; }
    if (!st || !Number.isInteger(Number(st.pid)) || Number(st.pid) <= 0) return null;
    let sum = 0, n = 0;
    const walk = async (pid, self) => {
      if (n++ > M.BUDGET.perJobPids) return;
      if (!self) { const m = /^RssAnon:\s+(\d+) kB/m.exec(await rd(`/proc/${pid}/status`)); if (m) sum += Number(m[1]) * 1024; }
      for (const k of (await rd(`/proc/${pid}/task/${pid}/children`)).trim().split(/\s+/).filter(Boolean)) await walk(k, false);
    };
    await walk(Number(st.pid), true);
    return Math.round(sum / 1048576);
  }
  /** B-b14a: THE SAMPLER — on an instance WITH a limit, every M.BUDGET.sampleMs while a job runs: each running job's own measure
   *  (`d.measureJobUse(job)` — the seam a suite places — else _treeAnonMb), its ANSWER bounded per job; ONE tick in flight, and a
   *  job whose last walk still runs is not walked again (round wh9e7xe8i: the bound stops the answer, not the walk); nothing on a
   *  machine with no limit */
  async _sampleUse() {
    if (this._useTick || this.readOnly) return;
    const lim = this._instanceLimit();
    if (!lim || !lim.mb) return;
    const running = [...this.jobs.values()].filter((j) => this._holdsBudget(j) && !j._walking);
    if (!running.length) return;
    this._useTick = true;
    try {
      await Promise.all(running.map(async (j) => {
        let mb = null;
        const raw = (async () => (typeof this.d.measureJobUse === 'function' ? this.d.measureJobUse(j) : this._treeAnonMb(j)))();
        j._walking = true; raw.then(() => { j._walking = false; }, () => { j._walking = false; });
        try { mb = await withinMs(raw, M.BUDGET.readBoundMs); } catch { mb = null; }
        if (Number.isFinite(mb)) j._use = { mb: Math.round(mb), at: now() };
      }));
    } finally { this._useTick = false; }
  }
  /** B-b14a: THE VERDICT for a start of `job` asking `askedMb` — the OTHER running jobs' measures. Round wh9e7xe8i (MUST 1, THE
   *  PRIVACY LAW): a holder is `own` (named) only when the CALLER may VIEW it — never judged against the job's owner; no caller (a
   *  restart policy, a schedule, a boot, a replay) ⇒ nobody is named */
  _budgetVerdict(job, mem, caller = null) {
    const lim = this._instanceLimit();
    const ask = M.budgetAskOf(mem, M.budgetMbOf(lim && lim.mb));   // r924: a job that named no memory is judged at most at HALF the budget
    const running = [...this.jobs.values()].filter((j) => j !== job && j.id !== job.id && this._holdsBudget(j)).map((j) => ({ id: j.id, name: this.labelOf(j), use: j._use || null, own: caller ? M.canView(j, caller) : false }));
    const v = M.budgetVerdict({ limitMb: lim && lim.mb, running, askedMb: ask.mb, nowMs: now() });
    if (v.judged) Object.assign(v, { halved: ask.halved, boundMb: ask.boundMb, ...(ask.unbounded ? { unbounded: true } : {}) });   // the words say what it was judged with
    if (v.holders) { const own = new Map(running.map((r) => [r.id, r.own])); v.holders = v.holders.map((h) => ({ ...h, own: !!own.get(h.id) })); }
    return v;
  }
  /** B-b14a: a start the budget refused — said on the job (its event line), never a state the job did not have: a run that never
   *  started leaves the record as it was (a schedule's fresh run record: «missed»). Round wh9e7xe8i (MUST 1): the EVENT LINE names
   *  no holder (every subscriber of the job reads it) — the count and the sum; the CALLER's answer (the error) names what that
   *  caller may view; with no caller the error is the line's own words */
  _budgetRefusal(job, v, trigger, caller = null) {
    const id = job.cronParent || job.id;
    const line = M.budgetRefusalWords(v, { id, named: false });
    if (job.state === 'starting' && !(job.runs || []).length) job.state = 'missed';
    this._touch(job, { what: `${line} (${trigger})` });   // an event: the job did not END — its failures (a park, a skipped fire) raise the alarm
    this.d.log(`[jobs] ${job.id} not started (${trigger}): the instance's memory budget (${v.usedMb} + ${v.askedMb} > ${v.budgetMb} MB)`);
    this._save();
    return Object.assign(new Error(caller ? M.budgetRefusalWords(v, { id }) : line), { code: 'memory-budget', budget: v });
  }
  /** B-b14a: a SERVICE whose automatic restart the budget refused counts it as a failed start: the ladder's backoff tries again,
   *  its count parks it — the park's notice names the budget. Never throws (round wh9e7xe8i: it runs inside timers' catches) */
  _budgetLadder(job, e) {
    try {
      const dec = M.onServiceExit(job, { uptimeMs: 0, now: now() });
      job.supervise = { ...(dec.supervise || job.supervise) };
      if (dec.park) {
        job.state = 'failed'; this._teardownPublish(job);
        const what = `parked: not restarted ${M.SUPERVISE.failCap} times in a row — ${e.message}`;
        this._touch(job, { what, alarm: true });
        this._forYou(job, M.forYouCopy(job, 'parked-budget', { count: M.SUPERVISE.failCap, ...this._budgetCopyParams(e) }));   // the person's copy names the budget, never «crash-looped»
        this._notifyOwner(job, { what, wake: 'result', personTold: true });
      } else if (dec.restartInMs) {
        job.state = 'down'; this._touch(job, { what: `not restarted — tried again in ${Math.round(dec.restartInMs / 1000)} s` });
        const t = setTimeout(() => { try { this._startAfter(job, 'restart-policy', () => job.desiredUp && job.state === 'down'); } catch (e2) { if (e2 && e2.code === 'memory-budget') this._budgetLadder(job, e2); } }, dec.restartInMs);
        t.unref?.();
      }
      this._save();
    } catch (err) { try { this.d.log(`[jobs] ${job && job.id}: the budget's ladder failed:`, err && err.message); } catch { } }
  }
  /** B-b14a (r924): what a start of THIS job is judged with, for the doors — only when it is not its bound (a job that names no
   *  memory, its bound past half the budget): {askMb, askHalf} */
  _askFacts(job, b) {
    if (!job || job.kind === 'cron' || !b || !b.budgetMb) return {};
    const a = M.budgetAskOf(M.memoryMbOf(job, this._memoryCtx({ hub: true })), b.budgetMb);
    return a.halved ? { askMb: a.mb, askHalf: true } : {};
  }
  /** B-b14a: the PERSON's copy's fields (the For-you tray is the person's, who may view every job): the budget and its holders by
   *  name, each clipped */
  _budgetCopyParams(e) {
    const v = (e && e.budget) || {}, hs = v.holders || [];
    const holders = hs.slice(0, M.BUDGET.namedHolders).map((h) => `${String(h.name || h.id).slice(0, 40)} ${M.memoryWords(h.mb)}`).join(', ') + (hs.length > M.BUDGET.namedHolders ? ', …' : '');
    return { budget: M.memoryWords(v.budgetMb), holders };
  }
  /** B-b14a: THE PRESS RECORD UNDONE — the state before the first press since the last Stop (wanted-up, the supervision), saved;
   *  → the record ({was, by}) or null. ONE line restores (a red copy removes it) */
  _undoRefusedPress(job) {
    const p = job._press;
    if (!p) return null;
    delete job._press;
    job.desiredUp = p.was.desiredUp; job.supervise = p.was.supervise;
    if (p.was.hubMainDown) job.hubMainDown = p.was.hubMainDown;   // B-2c5c r1263: the card's «not restarted by itself» comes back with the refused press
    this._touch(job); this._save();
    return p;
  }
  /** B-d8f4 (9), 主开发 r1993: presses answered «checked and stopped first» (what its last run kept, walked off the hub's thread) whose
   *  walk then REFUSED the start (the doubt's door: a cut walk) — each AGENT presser told ONCE, by the job's name, on the road that tells
   *  a job's owner (as _tellRefused): the refusal the answer could not carry, one beat later. A PERSON is told by the doubt's door's own
   *  For-you notice (filed once a run) — no new producer of For-you items. Answers how many conversations were told */
  _tellNotStarted(job, run, owed) {
    const why = this._runDoubt(job, run), told = new Set();
    const what = `not started: ${why ? this._doorWords(job, run, why) : `what its last run left running was not proven stopped in ${this._graceMs() / 1000} s — start it again`}`;
    for (const c of owed || []) {
      try {
        if (!c || c.isUser) continue;   // the person: the doubt's door's For-you notice
        const cid = c.conversationId;
        if (!cid || told.has(cid) || !M.canView(job, c)) continue;   // the presser must still VIEW the job
        told.add(cid);
        const owner = M.isOwner(job, c), ev = { what, wake: 'result', at: now() };
        this._deliverTo(cid, job, ev, { subscriber: !owner, text: M.renderOwnerNotify(job, ev, { name: this.labelOf(job), ...(owner ? {} : { context: '' }) }) });
      } catch (err) { this.d.log(`[jobs] ${job.id}: the refusal's word to its starter failed:`, err && err.message); }
    }
    return told.size;
  }
  /** B-b14a round wh9e7xe8i + r931: presses answered «it starts once its last run is stopped», refused by the budget LATER — each
   *  presser told ONCE where it looks: a PERSON in the For-you tray (the person views every job: the holders by name); an AGENT
   *  in its own conversation by the road that tells a job's owner (_deliverTo), naming NO holder (the count and the sum) — the
   *  answer it was given went untrue */
  _tellRefused(job, e, by) {
    const told = new Set();
    for (const c of by || []) {
      try {
        if (c && c.isUser) { if (!told.has('person')) { told.add('person'); this._forYou(job, M.forYouCopy(job, 'refused-budget', this._budgetCopyParams(e))); } continue; }
        const cid = c && c.conversationId;
        if (!cid || told.has(cid) || !M.canView(job, c)) continue;   // the presser must still VIEW the job (a control grant alone names nothing to it)
        told.add(cid);
        const owner = M.isOwner(job, c), ev = { what: M.budgetLaterWords(e && e.budget, { id: job.id }), wake: 'result', at: now() };
        this._deliverTo(cid, job, ev, { subscriber: !owner, text: M.renderOwnerNotify(job, ev, { name: this.labelOf(job), ...(owner ? {} : { context: '' }) }) });
      } catch (err) { this.d.log(`[jobs] ${job.id}: the refusal's notice failed:`, err && err.message); }
    }
  }
  /** B-b14a: THE BUDGET'S FACT for the doors (numbers only — a viewer may see none of the holders): worked out ONCE per second */
  _budgetFacts() {
    if (this._budgetMemo && now() - this._budgetMemo.at < 1000) return this._budgetMemo.v;
    const lim = this._instanceLimit(), budgetMb = M.budgetMbOf(lim && lim.mb);
    let v = null;
    if (budgetMb) {
      const running = [...this.jobs.values()].filter((j) => this._holdsBudget(j));
      const stale = running.filter((j) => !(j._use && j._use.at > now() - M.BUDGET.ageMs));
      v = stale.length ? { budgetMb, running: running.length, unmeasured: stale.length } : { budgetMb, running: running.length, usedMb: running.reduce((a, j) => a + j._use.mb, 0) };
    }
    this._budgetMemo = { at: now(), v };
    return v;
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
      this._touch(j, { what, alarm: true });
    }
    this.d.log(`[jobs] ${job.id} ${M.MEMORY_PARK_TEXT} (${run.cause}; bound ${M.memoryWords(run.memoryMb)}${run.memoryBound ? ' · ' + run.memoryBound.by : ''})`);
    this._forYou(job, M.forYouCopy(job, 'parked-memory'));
    this._notifyOwner(job, { what: `${what} (vibespace-job memory ${parent ? parent.id : job.id} <size>, then vibespace-job start ${parent ? parent.id : job.id})`, wake: 'result', personTold: true });   // B-2566: the park's copy said it by name
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
    // B-cac2: a start asked while this run's stop ran (or a restart) is taken HERE — after the release above (a browser the run held is
    // let go first; test-jobs-browser pins that order), before every road out below
    const startAsked = !!job._startAfterStop; delete job._startAfterStop;
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
    const left = M.leftRecord(exit.left), fault = M.leftRecordFault(exit.left);
    if (fault) this.d.log(`[jobs] ${job.id} ${fault}`); // round 10c: short ≤ n — a record past it is a bug, said
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
    delete job._untilCarry;   // THE CARRY IS ITS RUN'S (round w3aprsv38's MUST, r3108): cleared at the run's judged end — every road that starts a run after (a cron's fire, a start by hand, the update window's re-run) reads its own lines only
    const windowEnd = run.cause === 'update_window';
    // THE PARK LAW (lane jobs-memory-bound): EVERY judged end counts — the sweep's, and the boot's (a run that ended while the
    // server was down is judged here at its boot exactly like a run judged live; the base never counted a boot's) — _countEnd
    const memPark = windowEnd ? null : this._countEnd(job, run.cause);
    // B-2c5c unit 2: A SERVICE WHOSE RUN'S MAIN WAS THE HUB is never restarted by itself — not by its policy, not by a boot's replay: a
    // restart would start a second hub beside the one that runs (it cannot bind its port and parks). Not wanted up any more, said; a
    // person's Start is theirs
    const hubMainEnd = job.kind === 'service' && this._hubMainOf(run, exit);
    if (hubMainEnd) {
      this._hubMainDown(job, memCause ? M.memoryEndWhat(run) : null);
    } else if (job.kind === 'service' && windowEnd) {
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
        this._touch(job, { what: `parked after ${M.SUPERVISE.failCap} crashes (exit ${run.exit})`, alarm: true });
        this._forYou(job, M.forYouCopy(job, 'parked'));
        this._notifyOwner(job, { what: `parked after ${M.SUPERVISE.failCap} crashes (exit ${run.exit}) — start it again once fixed`, wake: 'result', personTold: true });   // B-2566: the park's copy said it
      } else if (dec.restartInMs) {
        job.state = 'down'; this._touch(job);
        const t = setTimeout(() => { try { this._startAfter(job, 'restart-policy', () => job.desiredUp && job.state === 'down'); } catch (e) { if (e && e.code === 'memory-budget') this._budgetLadder(job, e); } }, dec.restartInMs); // round 5: never beside what its last run left · B-b14a: a budget refusal counts on the ladder
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
      if (memPark && memPark.park) { this._parkForMemory(job, run); this._startAskedAtStop(job, startAsked, PARKED_NO_START); return; } // lane jobs-memory-bound: the park says the end (once); B-cac2 r2: never undone by an asked start
      // quiet-success is the DEFAULT, not a law (2.346.0, owner decision): the
      // creating agent opts scheduled successes into events+notify with
      // --notify-ok (job.notifyOk, inherited by the cron child via the
      // embedded task spec)
      const routineCronOk = job.cronParent && job.state === 'done' && !job.notifyOk;
      const evText = windowEnd ? `interrupted (update_window: it started while VibeSpace was updating itself and never ran — ${job.cronParent ? 'its next fire runs it' : 'the restarted server runs it again'})`
        : run.cause === 'wrapper-mismatch' ? `failed: it never started — data/bin/job-wrapper.js speaks another protocol than this server (restart VibeSpace to finish its update)`
          : memCause ? `${job.state}: ${M.memoryEndWhat(run)} (${Math.round((run.endedAt - run.startedAt) / 60000)}m)`
            : `${job.state} exit=${run.exit ?? '—'} ${run.cause} (${Math.round((run.endedAt - run.startedAt) / 60000)}m)${endWords ? ` — ${endWords}` : ''}`;
      this._touch(job, routineCronOk ? null : { what: evText, alarm: job.state === 'failed' });
      // the moved2 census (its jobs pass — a gap the save sites did not show): the run's END is recorded, then its For-you item and the
      // owner's message RIDE that record's landing — a kill first re-judges the end at boot from exit.json and says it once, never twice
      this._save();
      const forYouEnd = M.notifyUserOf(job) && !windowEnd, tellOwner = !routineCronOk && job.state !== 'interrupted';
      this._ride(this.file, 'a run\'s end', () => {
        if (forYouEnd) this._forYou(job, M.forYouCopy(job, 'end', { cause: run.cause }));
        // owner auto-notify honors the same quiet-success law: routine scheduled
        // success never messages anyone; agent-stopped ('interrupted') skips too
        // — the owner just did it and a message would echo their own action.
        if (tellOwner) this._notifyOwner(job, { what: evText, wake: 'result', ...(forYouEnd ? { personTold: true } : {}) });   // B-2566: a --notify-user end was said by name
      });
    }
    // round 5 (the ruling): a service keeps what its run left only while it runs — stopped or parked, they are stopped too
    if (job.kind === 'service' && left && left.kept && (!job.desiredUp || job.state === 'failed')) this._clearKept(job, run).then(() => this._cutSaid(job, run)).catch(() => { });
    this._startAskedAtStop(job, startAsked, memPark && memPark.park ? PARKED_NO_START : null);   // B-cac2: done now that the run has ended — once (a memory park: said, not done)
  }
  /** B-cac2: THE START ASKED DURING A STOP, done when the run ended (runtime only — a hub restarted inside the stop's grace
   *  forgets it, and any new run or later stop ends it). Not done for a job removed meanwhile or after the engine's end; not
   *  done over a memory park (`refusal`); a start that cannot be done is SAID where the person and the owner look */
  _startAskedAtStop(job, asked, refusal = null) {
    if (!asked) return;
    const say = (why) => { const what = `the start asked during its stop was not done: ${why}`; this._touch(job, { what, alarm: true }); this._notifyOwner(job, { what }); this._save(); };
    if (refusal) { say(refusal); return; }
    setImmediate(() => {
      if (this._unreadStopped || this.jobs.get(job.id) !== job) return;   // the engine ended, or the job was removed meanwhile
      let r; try { r = this.start(job); } catch (e) { r = { error: (e && e.message) || String(e) }; }
      this.d.log(`[jobs] ${job.id}: the start asked during its stop — ${r && r.error ? `refused: ${r.error}` : 'started'}`);
      if (r && r.error) say(r.error);
    });
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
      // B-2c5c unit 2: a run whose MAIN IS THIS HUB (proven at this boot) whose wrapper was killed has NOT ended — its main is this
      // process, which runs: never judged ended, never restarted beside itself (said once)
      if (stamp && !this._verifyAlive(stamp) && !this._readExit(job, run) && this._hubIsMain(job, run)) {
        if (!run._wrapperGoneSaid) { run._wrapperGoneSaid = true; const what = 'its wrapper is gone, but its main process is this VibeSpace hub, which runs — the run is not ended (nothing restarted beside it)'; this.d.log(`[jobs] ${job.id} ${what}`); this._touch(job, { what }); }
        continue;
      }
      if (stamp && !this._verifyAlive(stamp)) {
        const exit = this._readExit(job, run) || { code: null, endedAt: now() };
        // round 4: a wrapper gone, its scope not — never an ended run still running (a service's KEPT processes excepted —
        // round 5, the ruling). Round 6: the run is judged from its exit record NOW and its reap goes on beside it (bounded; one
        // that does not finish enqueues itself — _reapScope); a restart waits for it (_startAfter)
        if (!(exit.scopeEmpty === true || (exit.left && exit.left.kept) || this._hubMainOf(run, exit))) this._reapScope(job, run).catch(() => { }); // measured empty: nothing to reap · B-2c5c unit 1: the hub's, never reaped
        this._finalizeRun(job, run, exit, 'sweep');
        continue;
      }
      if (stamp) this._listenRead(job, stamp); // lane artifacts-services: the port it serves (async, ≤ 1 read / job / 30 s)
      // timeout — its SIGTERM and its words once per run (round 6: the kill step bound to it)
      if (job.kind === 'task' && job.timeoutMs && run && !run.endedAt && !job._timedOut && !run._limitRefused && now() - run.startedAt > job.timeoutMs) {
        // B-2c5c: THE MAIN DOOR — no grace, no kill step; its readers' should: a REFUSED limit marks the RUN (asked once), never the
        // job's «timed out» (its end would read «timeout» for a limit that never acted)
        if (this._hubIsMain(job, run)) { run._limitRefused = true; this._hubMainRefusal(job, run, 'its time limit'); }
        else { job._timedOut = true; this._termRun(job, run); job._termAt = job._termAt || now(); this._armKillStep(job, run, this._runScope(job, run)); }
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
      if (job.kind === 'task' && job.untilOutput && run && !job._untilHit && !run._untilRefused) this._untilScan(job, run);   // B-2c5c: a refused marker stops the scan (its fresh read: 64 KB of the hub's own log a tick)
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
      if (st.size < job._untilCursor) { job._untilCursor = 0; job._untilCarry = ''; } // rotated
      if (st.size === job._untilCursor) return;
      const len = Math.min(st.size - job._untilCursor, 65536); // per-tick byte budget
      const fd = fs.openSync(logPath, 'r');
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, job._untilCursor); fs.closeSync(fd);
      job._untilCursor += len;
      // literal substring on capped-length text (no agent regex on the main loop). THE UNTERMINATED LAST LINE IS CARRIED into the next
      // read (stage L3's settle round, 主开发 r2600 / round wtlm3ig4w): a marker a read boundary — a tick's byte budget, or the log
      // masker's settle holding a line's last characters back — cut in two fires when its line completes
      const lines = ((job._untilCarry || '') + buf.toString('utf-8')).split('\n');
      job._untilCarry = lines[lines.length - 1].slice(-4096);
      if (lines.some((l) => l.slice(0, 4096).includes(job.untilOutput))) {
        if (this._hubIsMain(job, run)) { run._untilRefused = true; this._hubMainRefusal(job, run, 'its until-marker'); return; }   // B-2c5c: THE MAIN DOOR — never said «completing», never marked hit (its end would read «until-output»); the run marked: no scan again
        job._untilHit = true;
        this._event(job, 'until-marker hit — completing after grace');
        const grace = Number(process.env.VIBESPACE_JOBS_GRACE_MS) || 30_000; // env knob: tests shrink the until-grace
        const steps = job._killSteps || (job._killSteps = new Set()); // round 6: bound to ITS run — a new run disarms it (_spawn)
        const t = setTimeout(() => { steps.delete(t); if (!this._runLive(job, run)) return; if (this._hubIsMain(job, run)) { this._hubMainRefusal(job, run, 'its until-marker'); return; } this._termRun(job, run); job._termAt = job._termAt || now(); this._armKillStep(job, run, this._runScope(job, run)); }, grace);
        t.unref?.(); steps.add(t);
      }
    } catch { }
  }
  async _cronTick() {
    if (this.readOnly) return;
    // the census cure ((b)): a fired slot not on disk HOLDS the next fires (a slot fired twice is money): this tick lands it first,
    // and fires nothing while the disk does not hold it (a kill would re-fire every slot fired over a store that never landed)
    if (this._cronHeld) { const L0 = this._onDisk(this.file, 'a held schedule\'s slot'); if (!L0.ok) return; this._cronHeld = null; }
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
            this._touch(job, { what: 'missed its {at} time while the server was down', alarm: true });
            // the moved2 census (its jobs pass): the notices RIDE the parked record's landing — a kill first re-judges it, never says it twice
            this._save();
            this._ride(this.file, 'a missed one-shot parked', () => {
              this._forYou(job, M.forYouCopy(job, 'missed'));
              this._notifyOwner(job, { what: 'MISSED its scheduled {at} time (server was down) — reschedule if it still matters', wake: 'missed' });
            });
            continue;
          }
        }
        try { this._fireCron(job, isCatchUp ? 'boot' : 'cron'); }
        catch (e) {
          if (!e || e.code !== 'EVSNOTONDISK') throw e;
          // A REFUSED FIRE (the U4/U5 cure: its run could not be recorded on disk first — the child said why, with an alarm): a
          // recurring schedule moves to its NEXT slot (never a re-fire at every 30 s tick); a one-shot is parked, said
          if (job.schedule.at) { job.state = 'failed'; job.desiredUp = false; job.nextFireAt = null; this._touch(job, { what: `its scheduled run was refused — ${e.message}`, alarm: true }); continue; }   // the child's words name the door (schedule it again)
          job.nextFireAt = M.nextFire(job.schedule, now(), undefined, job.nextFireAt);
          this._touch(job);
          continue;
        }
        job.nextFireAt = job.schedule.at ? null : M.nextFire(job.schedule, now(), undefined, job.nextFireAt); // lane int361: the slot it fired for — a fall-back's repeated time never fires twice
        if (job.schedule.at) { job.state = 'done'; }
        this._touch(job);
        // the moved2 census (its jobs pass): the slot it fired for is ON DISK before the next tick — a synchronous landing (bounded):
        // the fire cannot ride (a spawn waits on its own intent), so the release's window after a fire stays this short, never paced
        this._save(); const L = this._onDisk(this.file, 'a schedule\'s next time');
        if (!L.ok) { this._cronHeld = L.why || 'not on disk'; return; }   // the census cure ((b)): the next fires wait for this slot
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
      this._notifyOwner(job, a.text ? { what: a.text, agentWhat: true, wake: 'reminder' } : { what: this.labelOf(job), wake: 'reminder' });
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
        child = { ...a.task, id: rid(), kind: 'task', name: this._nameWords(`${job.name} run`), owner: job.owner, access: job.access, state: 'starting', runs: [], createdAt: now(), cronParent: job.id };   // r8: a NEW record is belted (a cron an older engine wrote keeps its raw name — its run's record does not); r9: the cron's name is a stored slug — no run row
        this.jobs.set(child.id, child);
      }
      // lane job-notify-user: the For-you copy is the PARENT's setting (`run --every/--cron/--at … --notify-user` sends it
      // top-level, like notify-cron) — handed to the child at every fire, so the run's end tells the user what `show` says
      child.notifyUser = M.notifyUserOf(job);
      // B-3992: the run's token reads what its CRON was given at create (the parent's grant, handed at every fire like notifyUser)
      if (M.mayReadOf(job)) child.mayRead = M.mayReadOf(job); else delete child.mayRead;
      delete child._untilCursor; delete child._untilHit; // fresh run, fresh scan
      try { this._spawn(child, trigger); delete job._budgetSkips; }
      catch (e) {
        if (!(e && e.code === 'memory-budget')) throw e;
        // B-b14a: the next fire as scheduled (a one-time schedule has none: said). Round wh9e7xe8i: ONE alarm a STRETCH of skips —
        // the first; the rest are events with their count (a fire that starts ends the stretch)
        const once = job.schedule && job.schedule.at ? ' — a one-time schedule does not come back by itself: schedule it again if it still matters' : '';
        if (!job._budgetSkips) { job._budgetSkips = 1; this._touch(job, { what: `fire skipped — ${e.message}${once}`, alarm: true }); }
        else { job._budgetSkips += 1; this._touch(job, { what: `fire skipped again (${job._budgetSkips} in a row) — ${e.message}${once}` }); }
        this._save();
      }
    }
  }
  /** B-360d — ONE FILE ASK OF THE COLLECTION PASS, off the loop (`make` → an fs.promises call), waited on until `until` (an instant).
   *  A read that has not come back is NEVER started again beside itself (the file-thread outage class: one pool thread at most):
   *  while one is out — this pass's or an earlier pass's — the pass asks nothing more. → {v} (its answer) | {e} (its error: the
   *  pass reads ENOENT alone as an answer — «not there» — every other error is UNKNOWN, r821) | null — UNKNOWN: it did not answer
   *  in time, or one is still out */
  async _gcAsk(make, until) {
    if (this._gcOut) return null;
    const left = until - Date.now();
    if (!(left > 0)) return null;
    const p = Promise.resolve().then(make).then((v) => ({ v }), (e) => ({ e }));
    this._gcOut = p;
    let timer = null;
    const got = await Promise.race([p, new Promise((r) => { timer = setTimeout(() => r(null), left); timer.unref?.(); })]);
    clearTimeout(timer);
    if (got) { if (this._gcOut === p) this._gcOut = null; return got; }
    p.then(() => { if (this._gcOut === p) this._gcOut = null; });   // the slot frees when the read answers — never before
    return null;
  }
  async _gc({ now: at = now() } = {}) {
    if (this.readOnly) return;
    const cutoff = at - 14 * 86400e3, whole = [], gone = [];
    // B-360d: NO SYNCHRONOUS FILE CALL OF THIS PASS ON THE LOOP — each ask is off it (_gcAsk: one at a time), the pass bounded by
    // GC_FILES_MS; an ask that does not answer in time is UNKNOWN, and nothing is collected on an unknown (never a guess)
    const until = Date.now() + (Number(this.d.gcFilesMs) > 0 ? Number(this.d.gcFilesMs) : GC_FILES_MS);
    let unknown = 0;
    // r821 (1): ONLY «NOT THERE» IS A REPLY — any other error of an ask (a stale handle, an input error, no access, a timeout) is UNKNOWN
    const answered = (got) => !!got && !(got.e && got.e.code !== 'ENOENT');
    // r821 (4): A PASS IN FLIGHT AT THE ENGINE'S STOP ENDS THERE — after each await a stopped engine returns (nothing removed, nothing
    // saved after the flush and the unlock)
    const stopped = () => this._logsStopped;
    // r821 (2): THE RECORDS FIRST, THEN THE SPILL FOLDER — and each walk STARTS AFTER THE LAST ONE IT REACHED (a head that eats the
    // budget, or a read still out, every hour starves nothing behind it: the next pass begins with the first one not asked)
    const reached = () => !this._gcOut && until > Date.now();
    const rotate = (list, keyOf, from) => { const i = from == null ? -1 : list.findIndex((x) => keyOf(x) === from); return i > 0 ? list.slice(i).concat(list.slice(0, i)) : list; };
    // THE STAMP DECIDES ONLY FOR A RECORD THIS PASS WOULD COLLECT (B-360d): those are found first, and only their stamps are read
    const collectable = (job) => {
      if (job.kind !== 'task' || !['done', 'interrupted'].includes(job.state)) return false;
      // B-c17d: a cron's child is its RUN RING while the parent still schedules fires (the archive sweep's own question) — a
      // cron that fires less often than every 14 days (monthly) lost its child, its run list and its journal between two fires
      if (this._cronParentActive(job)) return false;
      const run = job.runs && job.runs[job.runs.length - 1];
      if (!(run && run.endedAt && run.endedAt < cutoff)) return false;
      return !(this._notifsUnread && job.clearedAt);   // the B-f276 remainder (5), its read r3 (S2): its record judges the held notices
    };
    const cands = rotate([...this.jobs].filter(([, job]) => collectable(job)), ([id]) => id, this._gcFrom);
    this._gcFrom = null;
    for (let i = 0; i < cands.length; i++) {
      const [id, job] = cands[i];
      if (!reached()) { unknown += cands.length - i; this._gcFrom = id; break; }   // not asked: the next pass starts here
      if (this.jobs.get(id) !== job || !collectable(job)) continue;   // moved during an earlier ask of this pass
      const run = job.runs[job.runs.length - 1];
      const got = await this._gcAsk(() => fs.promises.readFile(path.join(this._ctlDir(job, run.startedAt), 'pid.json'), 'utf-8'), until);
      if (stopped()) return;
      if (!answered(got)) { unknown++; continue; }   // UNKNOWN: its stamp did not answer, or failed — nothing of it is collected this pass
      let stamp = null;
      if (typeof got.v === 'string') { try { stamp = JSON.parse(got.v); } catch { stamp = null; } }
      if (this._verifyAlive(stamp)) continue; // NEVER gc live work, regardless of record state
      if (this.jobs.get(id) !== job || !collectable(job)) continue;   // the record moved while its stamp was read (a restart, a removal)
      this.jobs.delete(id); this._dirty = true;
      (this._removalOwed || (this._removalOwed = new Map())).set(id, job);   // the moved2 census: its logs kept until the removal lands
      whole.push(id); gone.push(id);
    }
    { // spill files: age-swept alongside the records they narrate (after them: the records' stamps are asked first)
      const dir = path.join(this.d.dataDir, 'job-notifications-read');
      const ls = reached() ? await this._gcAsk(() => fs.promises.readdir(dir), until) : null;
      if (stopped()) return;
      if (!answered(ls)) unknown++;
      else if (Array.isArray(ls.v)) {
        const names = rotate([...ls.v].sort(), (f) => f, this._gcSpillFrom);
        this._gcSpillFrom = null;
        for (let i = 0; i < names.length; i++) {
          const f = names[i];
          if (!reached()) { unknown++; this._gcSpillFrom = f; break; }   // not asked: the next pass starts here
          const fp = path.join(dir, f), st = await this._gcAsk(() => fs.promises.stat(fp), until);
          if (stopped()) return;
          if (!answered(st)) { unknown++; continue; }
          if (!(st.v && st.v.mtimeMs < cutoff)) continue;
          const rm = await this._gcAsk(() => fs.promises.unlink(fp), until);
          if (stopped()) return;
          if (!answered(rm)) unknown++;
        }
      }
    }
    if (unknown) {   // r821 (3): said, and said again once a day while it lasts (a dead mount stops the collection until its read comes back)
      const t = Date.now();
      if (!(t - (this._gcUnknownSaidAt || 0) < GC_SAY_AGAIN_MS)) { this._gcUnknownSaidAt = t; this.d.log(`[jobs] the collection pass: ${unknown} file read(s) did not answer in time or failed (the data folder's storage may hang) — nothing of theirs is collected; while a read is out no record is collected, until it comes back or the hub restarts (said again once a day)`); }
    } else this._gcUnknownSaidAt = 0;
    // ARCHIVED records keep their record (the cap bounds it) but their log
    // dirs follow the SAME 14-day retention as a live record's (triage §13)
    try {
      // B-f276 family unit 2, the reader table (r3230) — THE CLOCK's verdict only (r3408): while jobs.json is HELD its memory is empty because
      // UNREAD, so «never a stale copy of a live record» cannot be judged — the hourly leg takes no archived record's folder then. A person's
      // ✕ (and its owed re-send) still removes while held: the logs law's hold is the pass's (test-job-logs-sweep-heavy round 4)
      if (!(this._unread && this._unread.store)) for (const rec of this.archivedList()) {   // B-0248 step 3: never a stale copy of a LIVE record (its live logs are its own)
        if ((rec.runs == null || Array.isArray(rec.runs)) && M.terminalAt(rec) < cutoff) whole.push(rec.id);   // round 3 §3: a record whose runs cannot be read has no end to age by — kept
      }
    } catch { }
    // lane lg-store-writes (the moved2 cure 2 — THE STEP RIDES THE LANDING): the log folders of records removed above go only once
    // jobs.json holds the removal (a kill first brings the record back WITH its logs); the archive's own ages go now
    // lane job-logs-sweep: the two legs' verdicts stay theirs; their removals and THE LAW's pass run in the remover's worker
    const goneSet = new Set(gone), sweepLogs = (ids) => { if (ids.length) this._logsWhole(ids); };   // ONE site of the remover's whole-dir verdicts (test-job-logs-sweep counts them)
    sweepLogs(whole.filter((id) => !goneSet.has(id)));
    if (gone.length) { this._save(); this._ride(this.file, 'the gc\'s removals', () => { for (const id of gone) { if (this._removalOwed) this._removalOwed.delete(id); } sweepLogs(gone); }); }
    // an open catch-up keeps its own pace (its timer armed); a stalled one is picked up here. Round 3 §3: a pass that throws never
    // fails the gc (its other work is done above)
    if (!this._logsGapT) { try { await this.sweepLogs({ now: at, why: 'gc' }); } catch (e) { this.d.log('[jobs] job-logs pass (gc) threw:', e && e.message); } }
  }

  // ── data/job-logs: THE REMOVER (lane job-logs-sweep, 2026-11-12; src/job-logs-sweep.js states the law) ───────────────
  /** the pace — deps.logsSweep overrides each number (a suite's); the product's are the module's */
  _logsCfg() {
    const o = (this.d && this.d.logsSweep) || {};
    const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
    return { max: num(o.max, LS.PASS_MAX), gapMs: num(o.gapMs, LS.GAP_MS), bootDelayMs: num(o.bootDelayMs, LS.BOOT_DELAY_MS), timeoutMs: num(o.timeoutMs, LS.BATCH_TIMEOUT_MS), retentionMs: num(o.retentionMs, LS.RETENTION_MS), restFactor: num(o.restFactor, LOGS_REST_FACTOR) };
  }
  _logsRemover() {
    const o = (this.d && this.d.logsSweep) || {};   // workerPath: a suite's slow-storage stand-in around the real worker
    // filterWhole: THE VERDICT IS TAKEN WHEN THE REMOVAL RUNS (round 2) — an id a live record names again by then keeps its dir
    if (!this._logsRm) this._logsRm = LS.createRemover({ logsDir: this.logsDir, log: (...a) => { try { this.d.log(...a); } catch { } }, timeoutMs: this._logsCfg().timeoutMs, workerPath: typeof o.workerPath === 'string' ? o.workerPath : undefined, filterWhole: (ids) => ids.filter((id) => !this.jobs.has(id)), procRoot: typeof o.procRoot === 'string' ? o.procRoot : null });
    return this._logsRm;
  }
  /** a WHOLE job dir — its caller's verdict (the gc's two legs, the archive cap, the ✕, the boot collapse) — removed in the
   *  remover's worker; a run whose wrapper lives stays (the sweep takes it once it ends). → Promise<{gone: [ids], …}> */
  _logsWhole(ids) {
    if (this.readOnly || this._logsStopped) return Promise.resolve({ error: this.readOnly ? 'read-only' : 'stopped', gone: [] });
    const list = [...new Set(ids)];
    return this._logsRemover().whole(list).then((a) => {
      const before = this._logsOwed.size;
      if (a && a.error && a.error !== 'stopped') {
        for (const id of list) { if (this._logsOwed.size < LOGS_OWED_MAX) this._logsOwed.add(id); else if (!this._logsOwedFullSaid) { this._logsOwedFullSaid = true; this.d.log(`[jobs] job-logs: more than ${LOGS_OWED_MAX} whole-dir removals are owed — the rest are not kept; the clean-up takes those dirs 14 days after their newest file`); } }
      }
      else if (a) for (const id of list) this._logsOwed.delete(id);   // gone, or a live run kept (the law's pass takes it once it ends and ages)
      if (this._logsOwed.size !== before || (a && !a.error && list.some((id) => (this._logsState && (this._logsState.owed || []).includes(id))))) this._logsKeepOwed();   // owed survives a restart: in the record, durably
      return a;
    });
  }
  /** THE LAW's pass (hourly from _gc, once after the boot, every gap while a catch-up is open): a run dir no record lists,
   *  past the retention by its newest entry, its wrapper proven gone ⇒ removed; at most `max` a pass. ONE pass at a time — a
   *  second ask shares the one in flight. `now` is injectable (like archiveSweep). */
  sweepLogs({ now: at = now(), why = 'tick' } = {}) {
    if (this.readOnly || this._logsStopped) return Promise.resolve({ skipped: this.readOnly ? 'read-only' : 'stopped' });
    // round 4 acceptance: an engine whose init FAILED (or has not finished) holds no trustworthy record set — its store may never
    // have been read, so «no record lists it» means nothing: the pass refuses (the product arms its timers only after a good init;
    // this makes a direct call refuse too). Before the pause: the paused road's owed re-send is the pass's as well
    if (!this.ready) return Promise.resolve({ skipped: this.initError ? 'init-failed' : 'not-ready' });
    // THE PAUSE (round 2 law 3): the setting jobs.logsSweep — off gates this pass (the boot's, the hourly one, the catch-up's);
    // never _logsWhole (the five removals a record or a person asks for). Said once per pause; the catch-up record waits as it is
    if (!this._logsOn()) { if (!this._logsPausedSaid) { this._logsPausedSaid = true; this.d.log('[jobs] job-logs clean-up paused by the setting jobs.logsSweep — nothing is removed by it (removing a job still removes its logs); it resumes where it stopped within the hour of being turned on'); } return this._logsOwedWhilePaused(); }
    this._logsPausedSaid = false;
    if (this._logsPassP) return this._logsPassP;
    const p = this._logsPass(at, why).finally(() => { if (this._logsPassP === p) this._logsPassP = null; });
    this._logsPassP = p;
    return p;
  }
  async _logsPass(at, why) {
    const cfg = this._logsCfg();
    // round 2: the record FIRST (read in the child, its shape validated) — what was owed before a restart is re-sent below, and a
    // catch-up of an odd shape steers nothing
    if (this._logsState === null) { this._logsEnsureMerged(); if (this._logsStateP) await this._logsStateP; }
    if (this._logsState === null) return this._logsRecordUnread();   // a MISSING record reads as none (adopted empty); a failed read waits
    // round 4 §1: «THIS PROCESS HOLDS» HOLDS — a failed records read whose note is not on disk: the note is asked for again, and while
    // it is still not written the pass answers HELD here, before the owed removals and before the walk (the ✕ and a record's own
    // verdicts go on: `_logsWhole` is theirs)
    if (this._logsNoteOwed.store || this._logsNoteOwed.archive) await this._logsNoteSoon();
    if (this._logsNoteOwed.store || this._logsNoteOwed.archive) return this._logsHeldUnnoted(cfg);
    if (this._logsOwed.size) await this._logsWhole([...this._logsOwed]);   // what the storage did not take last time, first
    // the runs the hub still holds work for: a scope reap that has not finished re-reads its run's pid.json every tick
    const held = [...this._reapLater].map(([run, v]) => (run && v && v.job ? `${v.job.id}/${run.startedAt}` : null)).filter(Boolean);
    // the archive from memory when it is loaded; otherwise the worker reads its file (never _loadArchive's synchronous read here)
    // the moved2 census (its jobs pass): a record whose REMOVAL is still owed to jobs.json (rm, the gc — their steps ride the landing)
    // keeps its run folders until that landing: a kill first brings the record back, and its logs with it
    const keep = LS.keepSetOf({ jobs: [...this.jobs.values(), ...(this._removalOwed ? this._removalOwed.values() : [])], archive: this.archive || [], held });
    for (const id of keep.unreadable) if (!(this._logsUnreadSaid || (this._logsUnreadSaid = new Set())).has(id)) { this._logsUnreadSaid.add(id); this.d.log(`[jobs] job-logs: the record ${id} lists its runs in a shape that cannot be read — every dir of it is kept`); }   // round 3 §3: said once, by id
    const loaded = this._logsState !== null, counting = loaded ? !this._logsState.catchUp : true;
    // B-323e: the COUNT FILES this engine has counted (their names in the record beside their counts) — forgotten first by this pass's
    // child, once the record naming them is ON DISK (a restart between never counts one twice: the boot's read skips a name it holds)
    const counted = [...((this._logsState && this._logsState.orphansCounted) || [])];
    const onDisk = counted.length ? await require('./store-writer.js').storeWriter().durable(this.logsSweepFile).catch(() => false) : true;   // the fresh read's find 5: a record NOT on disk forgets nothing
    const ans = await this._logsRemover().sweep({ keep, cutoff: at - cfg.retentionMs, max: cfg.max, count: loaded ? counting : 'auto', stateFile: loaded ? null : this.logsSweepFile, forget: onDisk === false ? [] : counted,   // `counting` walks on past B by NAME only (no stat, no /proc)
      archiveFile: this.archive && !this._logsUnread.archive ? null : this.archiveFile, storeFile: this._logsUnread.store ? this.file : null,
      setAside: { dir: this.d.dataDir, prefixes: [path.basename(this.file) + '.corrupt-', path.basename(this.archiveFile) + '.corrupt-'] }, orphanDir: this.d.dataDir },
      { timeoutMs: cfg.timeoutMs });   // round 2: the counting pass has the same timeout — past B it only reads directories
    if (ans && Array.isArray(ans.forgot) && this._logsState) this._logsState.orphansCounted = (this._logsState.orphansCounted || []).filter((n) => !ans.forgot.includes(n));
    if (ans && !ans.error && ans.heldBy) { this._logsHeld(ans, cfg); return ans; }   // a set-aside record store: nothing removed, said once
    if (!ans || ans.error) {
      const part = ans && ans.partial && Number.isFinite(ans.partial.removed) ? ans.partial : null;   // what a cut pass removed before it was ended
      if (ans && ans.error !== 'stopped' && !ans.held && (ans.error !== this._logsLastErr || part)) this.d.log(`[jobs] job-logs pass (${why}) failed: ${ans.error} — ${part ? `${part.removed} run dir(s) were removed before it was ended; ` : ans.partialUnknown ? `how many run dirs it removed before it was ended is not known (${ans.partialUnknown}); ` : 'nothing removed; '}the next pass asks again after its rest`);   // HELD is said once by the remover; the same failure once
      if (ans) this._logsLastErr = ans.error;
      const cuF = this._logsState && this._logsState.catchUp;   // a STOP's count went into the record at the stop (round 4 §3: `_logsStop`)
      if (cuF && part && ans.error !== 'stopped') { cuF.removed += part.removed; cuF.entries += part.entries || 0; cuF.jobDirs = (cuF.jobDirs || 0) + (part.jobDirs || 0); }
      // B-323e: a count file the hub READ — a cut's (its count above) or an answer's (an error before the walk: zero) — is counted HERE,
      // its name beside its count; one it could not read (a child held or unknown) is named as CUT for the next start's words (r1283 (5))
      const stF = this._logsState; let dirty = !!(cuF && part && ans.error !== 'stopped');
      if (stF && ans.countFile && !ans.partialUnknown) { const oc = stF.orphansCounted || (stF.orphansCounted = []); if (!oc.includes(ans.countFile)) { oc.push(ans.countFile); dirty = true; } }
      if (stF && ans.countLeft) { const cl = stF.cutLeft || (stF.cutLeft = []); if (!cl.includes(ans.countLeft)) { cl.push(ans.countLeft); if (cl.length > 50) cl.shift(); dirty = true; } }
      if (dirty) this._logsSave();
      if (cuF) this._logsNext(Math.max(cfg.gapMs, LOGS_RETRY_MS, cfg.restFactor * cfg.timeoutMs));   // a failed or cut pass RESTS (≥ 5 min, ≥ 10× its timeout); an open catch-up never stalls
      return ans;
    }
    this._logsLastErr = null;
    if (this._logsState === null) { this._logsAdopt(ans.state); this._logsMergeSaid(); }
    if (this._logsHeldSaid || (this._logsState.heldNow || []).length) {   // a hold lifted — in this process or before a restart: said where the journal is read
      this.d.log(`[jobs] job-logs clean-up resumes: no set-aside job record file is left in the data dir${(this._logsState.heldNow || []).length ? ` (held by ${this._logsState.heldNow.join(', ')})` : ''}`);
      this._logsHeldSaid = ''; this._logsState.heldNow = []; this._logsSave();
    }
    const st = this._logsState;
    if (ans.countFile && !st.orphansCounted.includes(ans.countFile)) st.orphansCounted.push(ans.countFile);   // B-323e (r1283 (2)): its count file counted HERE — its name in the SAME save as its count (the catch-up's opening one too)
    let opened = false;
    if (!st.catchUp && ans.more) { // more than one pass owes: THE CATCH-UP opens — said once, with its count
      // round 4 §3: it opens WITH its first pass in it — the record made durable before the start line already counts what that pass
      // removed (a kill right after the start line lost the first pass from the done line)
      st.catchUp = { startedAt: at, counted: ans.nameOld, removed: ans.removed, entries: ans.entries, jobDirs: ans.jobDirs || 0, passes: 1 }; opened = true;
      this._logsSave(); await require('./store-writer.js').storeWriter().durable(this.logsSweepFile).catch(() => { });   // round 2: on disk at the open — a restart resumes it, never a second start line
      this.d.log(LS.words.start({ counted: st.catchUp.counted, max: cfg.max, gapMs: cfg.gapMs }));   // round 3 §8: said AFTER the record is on disk (a kill between never says it twice)
    }
    // B-c330 (主开发's ruling B): a steady pass FOLDS into one line a day (the counts summed, kept in the record — a restart loses none);
    // a pass that removes LOGS_SAY_AT_ONCE or more speaks at once (the journal's stamp is its hour); a HOLD speaks at once (_logsHeld)
    const today = new Date(at).toISOString().slice(0, 10), sayNow = [];
    if (st.day && st.day.day !== today) { this.d.log(LS.words.day(st.day)); st.day = null; }
    const cu = st.catchUp;
    if (cu) { if (!opened) { cu.removed += ans.removed; cu.entries += ans.entries; cu.jobDirs = (cu.jobDirs || 0) + (ans.jobDirs || 0); cu.passes++; } }   // the opening pass is in the record already
    else if (ans.removed >= LOGS_SAY_AT_ONCE) sayNow.push(LS.words.pass(ans));   // B-323e (the fresh read's find 7): said once the record holding it is ON DISK — a kill between never says it twice
    else if (ans.removed) { const d = st.day || (st.day = { day: today, removed: 0, entries: 0, passes: 0 }); d.removed += ans.removed; d.entries += ans.entries || 0; d.passes++; }
    st.last = { at, why, removed: ans.removed, entries: ans.entries, more: !!ans.more, ms: ans.ms };
    if (cu && !ans.more) { sayNow.push(LS.words.done({ ...cu, kept: ans.keptOld || 0 })); st.catchUp = null; } // …and once when it is done, with its total (the last, complete pass's «kept»)
    this._logsSave();
    if (cu || sayNow.length) await require('./store-writer.js').storeWriter().durable(this.logsSweepFile).catch(() => { });   // round 2: a catch-up pass's count is on disk before the next — a hub killed between passes loses none (the batch in flight is its count file's)
    for (const l of sayNow) this.d.log(l);
    if (st.catchUp) this._logsNext(Math.max(cfg.gapMs, cfg.restFactor * (ans.ms || 0)));   // round 2: a slow pass earns a longer rest
    return ans;
  }
  /** round 3 §7: A PERSON'S REMOVAL IS NOT PAUSED — what a ✕ or a record's verdict owes is re-sent while the clean-up is paused (the
   *  record first, so what an earlier process owed is known); the pause is for the clean-up nobody asked for */
  async _logsOwedWhilePaused() {
    if (this._logsState === null) { this._logsEnsureMerged(); if (this._logsStateP) await this._logsStateP; }
    // round 4 §1: the note is asked for paused or not (the fact must reach the disk before a restart); while it is not, the owed
    // re-send waits too — as the pass's does
    if (this._logsNoteOwed.store || this._logsNoteOwed.archive) await this._logsNoteSoon();
    if (this._logsNoteOwed.store || this._logsNoteOwed.archive) return { skipped: 'paused', heldBy: 'unread-unnoted' };
    if (this._logsOwed.size) await this._logsWhole([...this._logsOwed]);
    return { skipped: 'paused' };
  }
  /** round 4 §1: HELD in this process — a records read failed and its note is not on disk (yet): said once per process and set of
   *  stores, an open catch-up rests and asks again; nothing is removed by the pass (no owed re-send, no walk) */
  _logsHeldUnnoted(cfg) {
    const names = ['store', 'archive'].filter((w) => this._logsNoteOwed[w]).map((w) => path.basename(w === 'store' ? this.file : this.archiveFile)), line = 'unnoted: ' + names.join(', ');
    if (this._logsHeldSaid !== line) { this._logsHeldSaid = line; this.d.log(`[jobs] job-logs clean-up HELD: ${names.join(', ')} could not be read and no note of it is on disk — nothing is removed in this process until the note is written (it is tried again before each pass)`); }
    if (this._logsState && this._logsState.catchUp) this._logsNext(Math.max(cfg.gapMs, LOGS_RETRY_MS));
    return { heldBy: 'unread-unnoted', removed: 0, heldFiles: [], unnoted: names };
  }
  /** round 4 §3: the catch-up's OWN record cannot be read — the pass waits (a fresh record would overwrite its open catch-up and what it
   *  owes): the journal names the cause and the file, once per cause; ONE For-you item says what waits and what to move */
  _logsRecordUnread() {
    const file = path.basename(this.logsSweepFile), code = this._logsStateErr ? this._logsStateErr.code : null;
    const e = `${(this._logsStateErr && this._logsStateErr.error) || 'the catch-up record could not be read'} — nothing removed; the clean-up waits until ${file} can be read or is moved away (a fresh record would overwrite what it owes)`;
    if (this._logsLastErr !== e) { this._logsLastErr = e; this.d.log(`[jobs] job-logs: ${e}`); }
    if (code && !this._logsRecordSaid) { this._logsRecordSaid = true; this._forYou(null, M.forYouCopy(null, 'sweep-record-unread', { file, error: code })); }
    return { error: e };
  }
  _logsOn() { try { return !(this.d && typeof this.d.logsSweepOn === 'function' && this.d.logsSweepOn() === false); } catch { return true; } }   // the setting jobs.logsSweep (jobs-wiring)
  _logsNext(ms) {
    if (this._logsGapT) clearTimeout(this._logsGapT);
    this._logsRestMs = ms;   // the rest armed (a suite reads it)
    if (this._logsStopped) return;
    this._logsGapT = setTimeout(() => { this._logsGapT = null; this.sweepLogs({ why: 'catch-up' }).catch((e) => this.d.log('[jobs] job-logs pass failed:', e.message)); }, ms);
    this._logsGapT.unref?.();
  }
  /** HELD by a set-aside record store (round 2 law 1): said ONCE in the journal per process and set of files, ONE For-you item
   *  per file the owner was never told of (its name kept in the record's `heldSaid`, written durably) — the torn store's own
   *  item and the torn archive's (filed at the set-aside) already say it; an open catch-up rests and asks again */
  _logsHeld(ans, cfg) {
    const files = ans.heldFiles || [], line = files.join(', ');
    if (this._logsHeldSaid !== line) { this._logsHeldSaid = line; this.d.log(`[jobs] job-logs clean-up HELD: ${line} in the data dir hold job records VibeSpace could not read — nothing is removed until they are moved or deleted`); }
    if (this._logsState === null) this._logsAdopt(ans.state);   // the record as read by this pass — what was said before the restart
    if ((this._logsState.heldNow || []).join() !== files.join()) { this._logsState.heldNow = files.slice(0, 20); this._logsSave(); }   // the hold in the record: «resumes» is said even after a restart
    const said = new Set([...this._logsState.heldSaid, ...this._logsSaidNow]);
    // round 3 §8: a name this hub gives a set-aside (`<store>.corrupt-<ms>`) is «records that could not be read»; any other name was a
    // person's — its item says only what is true of it. Names only, never the data folder's path (round 3 §6). Round 4 §2/§3: the NOTE
    // is its EXACT name `<store>.corrupt-unread` (a person's `…corrupt-unread-mine.txt` is a person's), «said» keyed by its moment
    const notes = ans.notes || {};
    for (const f of files) {
      const m = /^(jobs(?:-archive)?\.json)\.corrupt-unread$/.exec(f), nb = m ? notes[f] || {} : null;
      const key = m && Number.isFinite(nb.at) ? `${f}@${nb.at}` : f;
      if (said.has(key) || (this._logsTelling || (this._logsTelling = new Set())).has(key)) continue;
      this._logsTelling.add(key);   // filed in this process: never twice while its «said» waits for the For-you store's write
      this._logsSay(key, m ? 'records-unread' : /^jobs(?:-archive)?\.json\.corrupt-\d+$/.test(f) ? 'records-held' : 'set-aside-other', m ? { store: m[1], note: f, error: nb.error || 'see the note', when: Number.isFinite(nb.at) ? nb.at : null } : { file: f });
    }
    this._logsMergeSaid();
    if (this._logsState && this._logsState.catchUp) this._logsNext(Math.max(cfg.gapMs, LOGS_RETRY_MS));
  }
  /** the record as read (a missing, torn or odd shape adopts nothing it cannot use: a catch-up only with finite numbers) */
  _logsAdopt(r) {
    const fin = (v) => typeof v === 'number' && Number.isFinite(v);
    const cu = r && r.catchUp;
    this._logsState = { catchUp: cu && typeof cu === 'object' && ['startedAt', 'counted', 'removed', 'entries', 'passes'].every((k) => fin(cu[k])) ? { jobDirs: 0, ...cu } : null,
      last: r && r.last && typeof r.last === 'object' ? r.last : null, heldSaid: Array.isArray(r && r.heldSaid) ? r.heldSaid.filter((x) => typeof x === 'string').slice(-100) : [],
      owed: Array.isArray(r && r.owed) ? r.owed.filter((x) => typeof x === 'string' && LS.JOB_NAME.test(x)).slice(-LOGS_OWED_MAX) : [], heldNow: Array.isArray(r && r.heldNow) ? r.heldNow.filter((x) => typeof x === 'string').slice(0, 20) : [],
      orphansCounted: Array.isArray(r && r.orphansCounted) ? r.orphansCounted.filter((x) => typeof x === 'string').slice(-50) : [],
      cutLeft: Array.isArray(r && r.cutLeft) ? r.cutLeft.filter((x) => typeof x === 'string').slice(-50) : [],   // B-323e (r1283 (5)): count files a cut left unread
      day: r && r.day && typeof r.day === 'object' && /^\d{4}-\d{2}-\d{2}$/.test(String(r.day.day)) && ['removed', 'entries', 'passes'].every((k) => fin(r.day[k])) ? { ...r.day } : null };   // B-c330: the day's folded counts
    for (const id of this._logsState.owed) this._logsOwed.add(id);   // what an earlier process owed survives its restart
  }
  /** a set-aside's item was filed: its file is «said» — on disk at once (durably), so a restart never files it twice */
  _logsMarkSaid(name) { this._logsSaidNow.add(name); this._logsEnsureMerged(); }
  _logsKeepOwed() { this._logsEnsureMerged(); }
  /** the record read (in the child) if it is not yet, then what this process holds is merged into it and written durably */
  _logsEnsureMerged() {
    if (this.readOnly) return;
    if (this._logsState) { this._logsMergeSaid(); return; }
    if (!this._logsStateP) this._logsStateP = this._logsRemover().state(this.logsSweepFile, this.d.dataDir).then((a) => {
      this._logsStateErr = a && a.error ? { error: a.error, code: a.code || 'unreadable' } : null;   // round 4 §3: the cause, said by the pass
      if (a && a.recordSetAside) this.d.log(`[jobs] job-logs: the catch-up record did not parse — set aside as ${a.recordSetAside}; a fresh one is started`);
      for (const n of (a && a.cutCounts) || []) this.d.log(`[jobs] job-logs: an orphaned remover's count file was cut while it was written (${n}) — its count is lost; forgotten`);
      for (const n of (a && a.cutBeside) || []) this.d.log(`[jobs] job-logs: the last write of a remover's count file was cut (${n}) — its count (${n.replace(/\.tmp$/, '')}) stands and may be short by one; the cut write forgotten`);   // r1283 (5)
      for (const n of (a && a.badCounts) || []) this.d.log(`[jobs] job-logs: ${n} does not hold a remover's count (not counted) — forgotten`);
      if (this._logsState === null && a && !a.error) { this._logsAdopt(a.state); return this._logsOrphans(a.orphans || []); }
      this._logsMergeSaid();
    }).catch(() => { }).finally(() => { this._logsStateP = null; });
  }
  /** what an orphaned remover removed before it stopped (its hub died mid-batch): counted ONCE into the open catch-up — its name
   *  kept in the record (durably) before its file is forgotten, so a restart between the two never counts it twice */
  async _logsOrphans(orphans) {
    const st = this._logsState; if (!st) return;
    st.orphansCounted = (st.orphansCounted || []).filter((n) => orphans.some((o) => o.name === n));   // a name whose file is gone is done
    let grew = false; const cutLeft = new Set(st.cutLeft || []);
    for (const o of orphans) {
      if (st.orphansCounted.includes(o.name)) continue;
      if (st.catchUp) { st.catchUp.removed += o.removed; st.catchUp.entries += o.entries; st.catchUp.jobDirs = (st.catchUp.jobDirs || 0) + o.jobDirs; }
      // r1283 (5): its OWN words — a pass that finished before its record was written (its file says done), a batch cut past its bound
      // whose child had not ended (named as cut in the record), else its hub ended; a count of zero is said by nobody
      const who = o.done ? 'a clean-up pass that finished before its record was written' : cutLeft.has(o.name) ? 'a clean-up batch cut past its bound (its child had not ended)' : 'a remover whose hub ended';
      if (o.removed > 0) this.d.log(`[jobs] job-logs: ${who} removed ${o.removed} run dir(s)${o.done ? '' : ' before it stopped'} — ${st.catchUp ? 'counted in the catch-up' : 'said here'}`);
      st.orphansCounted.push(o.name); grew = true;
    }
    if ((st.cutLeft || []).length) { st.cutLeft = []; grew = true; }   // every file left by a cut is counted above (or is gone)
    this._logsMergeSaid();
    if (grew) { this._logsSave(); await require('./store-writer.js').storeWriter().durable(this.logsSweepFile).catch(() => { }); }
    const done = orphans.map((o) => o.name).filter((n) => st.orphansCounted.includes(n));
    if (done.length) await this._logsRemover().forget(this.d.dataDir, done);
  }
  _logsMergeSaid() {
    const st = this._logsState; if (!st) return;
    let grew = false;
    for (const n of this._logsSaidNow) if (!st.heldSaid.includes(n)) { st.heldSaid.push(n); grew = true; }
    if (st.heldSaid.length > 100) st.heldSaid.splice(0, st.heldSaid.length - 100);
    const owed = [...this._logsOwed].slice(-LOGS_OWED_MAX);
    if (owed.join() !== (st.owed || []).join()) { st.owed = owed; grew = true; }
    if (grew) { this._logsSave(); require('./store-writer.js').storeWriter().durable(this.logsSweepFile).catch(() => { }); }   // «said» is an act: on disk now
  }
  /** the catch-up's record through THE STORE WRITER (its own thread, paced): a SIGKILL before its write costs at most one
   *  repeated start line (the next boot counts again what is left) */
  _logsSave() {
    if (this.readOnly || this._logsState === null) return;
    require('./store-writer.js').storeWriter().dirty(this.logsSweepFile, { name: 'jobs-logs-sweep.write', produce: () => JSON.stringify(this._logsState) });
  }
  _logsStop() {
    this._logsStopped = true;
    if (this._logsGapT) { clearTimeout(this._logsGapT); this._logsGapT = null; }
    // round 4 §3 (B-323e): a stop keeps the in-flight batch's count — in ITS COUNT FILE (rewritten after every removal; the starter holds
    // that child and ends it at the hub's exit): its name is not in this record, so the next engine counts it ONCE
    if (this._logsRm) this._logsRm.stop();
  }
  /** once no pass and no removal is queued or in flight (a suite's wait; the catch-up's NEXT pass is a timer, not waited) */
  async logsSettled() {
    for (let i = 0; i < 1000; i++) {
      if (this._logsPassP) { await this._logsPassP.catch(() => { }); continue; }
      if (this._logsRm && this._logsRm.busy()) { await this._logsRm.settled(); continue; }
      return;
    }
  }
  /** the ✕'s answer after the disk → {gone: true} · {kept: 'running' | 'unjudgeable' | 'named'} (a run of it still runs / could not
   *  be judged — the law's pass takes it later; a live record names the id again) · {pending: true} (past `ms`, or the storage held
   *  it: OWED in the record, durably — re-sent before every pass) */
  logsGone(id, ms = 10_000) {
    const p = this._logsGone.get(id);
    if (!p) return Promise.resolve(this._logsOwed && this._logsOwed.has(id) ? { pending: true } : { gone: true });   // r2001: a removal the storage held is OWED — «still being deleted» whenever it is asked, never the map's default
    return new Promise((resolve) => { const t = setTimeout(() => resolve({ pending: true }), ms); t.unref?.(); p.then((v) => { clearTimeout(t); resolve(v && typeof v === 'object' ? v : { pending: true }); }); });
  }

  // ── public API (callers pre-authorize via job-model predicates) ─────────
  create(spec, caller) {
    if (this.readOnly || !this.ready) return { error: this.initError ? `jobs engine down: ${this.initError}` : 'jobs engine not ready — retry shortly' };
    const vet = M.vetSpec(spec);
    if (!vet.ok) return { error: vet.error };
    // B-f276: while the records cannot be read nothing new is created (a record made now could not be written: it would end with this process)
    if (this._unread.store) return { error: this.unreadWords('no job is created until they are read'), code: 'records-unread' };
    if (spec && spec[DW.GRANT_FIELD] !== undefined) return { error: DW.GRANT_REFUSAL, code: 'wake_grant_person_only' };   // piece 7: never through a create (the person's own included: one door each)
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
    // THE VAULT VALUES (lane vault-job-road): `--vault NAME=vault://…` — the grammar and the entry's FAMILY judged here (PURE
    // src/vault-job.js); the record keeps the REFERENCES only; whether the value may be handed is judged again at EVERY spawn
    const vsrc = task ? (task.vault !== undefined ? task.vault : spec.vault) : spec.vault;
    if (spec.kind === 'cron' && !task && vsrc !== undefined && vsrc !== null && (!Array.isArray(vsrc) || vsrc.length)) return { error: 'a --vault value is for a job that runs a command — a notify cron runs none' };
    const vp = VJ.parseVault(vsrc, { env: ((task ? task.cmd : spec.cmd) || {}).env || null });
    if (!vp.ok) return { error: `refused: ${vp.words}${vp.at ? ` (the --vault value #${vp.at})` : ''}`, code: vp.code };
    for (const r of vp.refs) { const f = VJ.familyOf(r.ref, VJ.ownerOf({ owner: spec.owner })); if (!f.ok) return { error: `refused: ${f.words} (--vault ${r.name})`, code: f.code }; }
    if (task) { if (vp.refs.length) task.vault = vp.refs; else delete task.vault; }
    // B-3992: `--may-read <job>,<job>` / `--may-read siblings` — THE GRANT, written on the record now: resolved against the jobs the
    // new job's OWNER record owns (the same predicate every read judges by, M.jobMayRead), never another conversation's; a notify
    // cron runs no command and is refused. A scheduled job keeps it on the cron; each fire hands it to the run (below)
    const mr = M.mayReadVerdict(spec.mayRead, [...this.jobs.values()].filter((j) => M.isOwner(j, M.ownerAsCaller({ owner: spec.owner }))), { runsCommand: !(spec.kind === 'cron' && !task), owner: spec.owner || null });   // round item 6: no owner conversation ⇒ refused
    if (!mr.ok) return { error: mr.error, code: 'may-read' };
    const visNames = new Set(M.visibleJobs([...this.jobs.values()], caller).map((j) => j.name));
    const { name, renamed } = M.resolveName(spec.name, visNames, { mask: (t) => this._nameWords(t, { typed: true }) });   // r7: the belt on the WHOLE name, then the cut — r9: THE NAME RULE once, as typed
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
      desiredUp: true,
      state: spec.kind === 'cron' ? 'scheduled' : 'starting', proc: null, supervise: { consecutiveFails: 0, parkedAt: null },
      runs: [], createdAt: now(),
      ...(memMb !== null && !task ? { memoryMb: memMb } : {}),
      ...(vp.refs.length && !task ? { vault: vp.refs } : {}),
      ...(mr.grant ? { mayRead: mr.grant } : {}),   // B-3992: what this job's token may READ beside itself (read only)
    };
    if (job.kind !== 'cron') {   // B-b14a: past the budget ⇒ refused by name, NOTHING created (a schedule is judged at each fire)
      const bv = this._budgetVerdict(job, M.memoryMbOf(job, this._memoryCtx({ hub: true })), caller);   // named: what the CALLER may view
      if (bv.refused) { this.d.log(`[jobs] create of «${this.labelOf(job)}» refused: the instance's memory budget (${bv.usedMb} + ${bv.askedMb} > ${bv.budgetMb} MB)`); return { error: M.budgetRefusalWords(bv, { create: true }), code: 'memory-budget', budget: bv }; }
    }
    this.jobs.set(job.id, job);
    if (job.kind !== 'cron') {
      try { this._spawn(job, 'manual'); } catch (e) { job.state = 'failed'; this._touch(job); return { error: `spawn failed: ${e.message}`, job: this.snapshot(job, { author: true }) }; }
    } else { job.nextFireAt = M.nextFire(job.schedule, now(), undefined, null); this._touch(job); } // a fresh schedule: no fire to remember (lane int361)
    this._save();
    const vaultWait = this._cronVaultWait(job); // lane vault-job-road r2: its fires would wait — said at once, beside «scheduled»
    if (vaultWait) return { job: this.snapshot(job, { author: true }), renamed, vaultWait };
    return { job: this.snapshot(job, { author: true }), renamed };   // the creator IS the author (r4: the record's own name — r7: belted at create)
  }
  /** B-cac2: STOP, WAIT, START — ONE answer. A live run is stopped and the start is remembered (_finalizeRun does it when the stop
   *  ends); nothing running, or nothing the stop could reach, starts now */
  restart(job, { caller = null } = {}) {
    if (this.readOnly) return { error: 'registry is read-only in this process' };
    const run = job.runs && job.runs[job.runs.length - 1];
    if (!this._runLive(job, run)) return this.start(job, { caller });
    const s = this.stop(job);
    if (s && s.error) return s;
    // a live run whose stop reached no process yet (no pid stamp; its wrapper gone, not judged yet) still ends: the sweep honours
    // the stop once the stamp exists, or judges the run — the start waits for that end too (never «already running»)
    job._startAfterStop = true;
    return { ok: true, pending: true, words: 'stopping — it starts again when the stop ends (a VibeSpace restart before then forgets it: start it again)' };   // 主开发 21:46Z (b): the runtime-only ask SAID where the person is told
  }
  stop(job, { force } = {}) {
    if (this.readOnly) return { error: 'registry is read-only in this process' };
    // B-2c5c, round wwa7r2uc1 (THE MAIN DOOR): the job's main process IS this hub — refused by name before anything changes (the job is
    // not said stopping, its service not marked down); the press and the agent's stop are answered with the words
    { const run0 = job.runs && job.runs[job.runs.length - 1]; if (this._runLive(job, run0) && this._hubIsMain(job, run0)) return this._hubMainRefusal(job, run0, force ? 'a forced stop' : 'the stop'); }
    delete job._startAfterStop;   // B-cac2: a stop pressed after a remembered start (or a restart) means stopped — it starts no more
    delete job._press;   // B-b14a r931: a Stop ends the presses waiting on a start — the next press retakes the snapshot (its undo never restores over this Stop)
    if (job.kind === 'cron') delete job._budgetSkips;   // …and a schedule's stretch of skipped fires
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
    if (job.state === 'waiting') { job.state = job.kind === 'task' ? 'interrupted' : 'down'; delete job.waitFor; } // lane vault-job-road: it never ran — it waits no more
    if (job.kind === 'cron') for (const k of this.jobs.values()) if (k.cronParent === job.id) this._settleWait(k, 'its schedule was stopped'); // …nor does its scheduled run
    this._vaultAskOver(job); // lane vault-job-approval: a stopped job's approval card is over — its next start asks again
    this._touch(job);
    this._save();
    return { ok: true, hadProc };
  }
  start(job, { caller = null } = {}) {
    if (this.readOnly) return { error: 'registry is read-only in this process' };
    // B-cac2 (fb-f4a0c70a84): a START while a STOP's grace runs is no «already running» (the service then ended down and a second
    // start was needed) — it is REMEMBERED and done when the stop ends (_finalizeRun), said with the grace left
    const run0 = job.runs && job.runs[job.runs.length - 1];
    if ((job._termAt || job._stopForce) && this._runLive(job, run0)) {
      job._startAfterStop = true;
      this.d.log(`[jobs] ${job.id}: a start asked while its stop runs — it starts when the stop ends`);
      const left = job._termAt ? Math.max(0, Math.ceil((job._termAt + this._killStepMs() - now()) / 1000)) : null;   // a forced / not-yet-reached stop has no grace clock
      return { ok: true, pending: true, words: (left != null ? `still stopping (${left} s left) — it starts when the stop ends` : 'still stopping — it starts when the stop ends') + ' (a VibeSpace restart before then forgets it: start it again)' };   // 主开发 21:46Z (b): said where the person is told
    }
    // B-b14a round wh9e7xe8i (MUST 2): A REFUSED START LEAVES THE RECORD EXACTLY AS IT WAS — the budget refuses after these writes,
    // so a refusal UNDOES them (a service left wanted-up would start unjudged at the next boot's replay, beside the set it did not fit).
    // r931: ONE press record a pending start — the state before the FIRST press since the last Stop (a press that JOINS a start in
    // flight never retakes it: its own snapshot would hold an earlier press's write) and every presser, each told once
    // r1033 (THE MUST): the record is made or joined only where the start GOES AHEAD — never before a return that answers
    // «already running», a vet's refusal or «stop it first» (a stale record would be undone, and its presser woken, by a later
    // automatic start's refusal); the snapshot is this press's state BEFORE its writes
    const before = { desiredUp: job.desiredUp, supervise: job.supervise, ...(job.hubMainDown ? { hubMainDown: job.hubMainDown } : {}) };   // B-2c5c r1263: the card's fact too
    const joinPress = () => { const pr = job._press || (job._press = { was: before, by: [] }); if (caller && !pr.by.some((c) => c === caller || (c.isUser && caller.isUser) || (c.conversationId && c.conversationId === caller.conversationId))) pr.by.push(caller); };
    delete job.hubMainDown;   // B-2c5c r1263: the person's Start — the card's «not restarted by itself» is over (a refused start puts it back: _undoRefusedPress)
    job.desiredUp = true;
    job.supervise = { consecutiveFails: 0, parkedAt: null };
    // lane jobs-memory-bound: the owner acted — a cron parked for its child's out-of-memory ends counts its child afresh
    for (const k of job.kind === 'cron' ? this.jobs.values() : []) if (k.cronParent === job.id) k.supervise = { consecutiveFails: 0, parkedAt: null };
    if (job.kind === 'cron') {
      const vet = M.vetSpec(job); // B-f8c7: a cron spawns only at its next fire — reviving one the vet refuses answers NOW
      if (!vet.ok) { this._refuseRun(job, vet, 'manual'); return { error: vet.error }; }
      delete job._budgetSkips;   // B-b14a: a schedule the owner started again begins a new stretch of skipped fires (its first raises the alarm)
      job.state = 'scheduled'; job.nextFireAt = M.nextFire(job.schedule, now(), undefined, null); this._touch(job); this._save(); // lane int361: from now, no fire to remember
      const vaultWait = this._cronVaultWait(job); // round 2: its fires would wait — said, never a bare «ok»
      return { ok: true, ...(vaultWait ? { vaultWait } : {}) }; }
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
      // 主开发 r2228 (2): a press while a CUT STAMP STANDS is refused in its own reply and NOT KEPT — the walk it asks runs once more
      // (r1993: a later decision walks once more; a finished walk lifts the stamp, so the NEXT press goes at once) but nothing
      // starts from this press: its reply «not restarted … then start it again» stays true (the walk is off the hub's thread now)
      const cut0 = this._cutOf(last);
      if (cut0) {
        job.desiredUp = before.desiredUp; job.supervise = before.supervise;
        this._clearKept(job, last).then(() => { if (this._cutOf(last)) this._doubtBlocks(job, last, 'manual'); }).catch(() => { });
        this._save();
        return { error: this._doorWords(job, last, cut0) };
      }
      // a press DEFERRED behind its last run's reap and refused later: undone, and every presser told (_startAfter's settle)
      joinPress();
      try { this._startAfter(job, 'manual', () => job.desiredUp && !['up', 'starting'].includes(job.state), { caller }); } catch (e) { if (e && e.code === 'memory-budget') this._undoRefusedPress(job); else delete job._press; return { error: e.message, ...(e && e.code ? { code: e.code } : {}), ...(e && e.budget ? { budget: e.budget } : {}) }; }   // B-b14a
      if (!job._starting) delete job._press;   // nothing pending: the press is settled (started, or refused above)
      this._save();
      if (['up', 'starting'].includes(job.state)) return { ok: true };
      if (job.state === 'waiting') return this._waitAnswer(job); // lane vault-job-road r2: it waits for its values — nothing is «stopped first»
      // round 10: A START THAT WILL NOT HAPPEN IS ANSWERED BY ITS REFUSAL — the decision's one walk ran in this tick: a cut one is
      // the doubt's door, in the words its journal line and its For-you notice carry (round 9 answered «ok — it starts only once
      // it is», and nothing walked again: the service stayed down for good)
      const cut = this._cutOf(last), doubt = this._runDoubt(job, last);
      if (cut) return { error: this._doorWords(job, last, cut) };
      // B-d8f4 (9), 主开发 r1993: what its last run KEPT is walked OFF the hub's thread — this answer cannot hold the walk's verdict, so
      // it promises no start: checked first, started once proven, else not started — and THIS presser is told the refusal by name
      // when the walk answers (_tellNotStarted): a start that will not happen is still answered by its refusal, one beat later
      const lk = last && last.left, keptWalk = !doubt && !!(lk && lk.kept && !lk.cleared && !lk.gone);
      if (keptWalk && caller && job._press) { const ow = job._press.owed || (job._press.owed = []); if (!ow.some((c) => c === caller || (c.isUser && caller.isUser) || (c.conversationId && c.conversationId === caller.conversationId))) ow.push(caller); }
      const after = doubt ? `its previous run cannot be proven gone (${doubt}) — it starts if that is proven within ${this._graceMs() / 1000} s, else it is not started (its events say)` : keptWalk ? 'what its last run left running is checked and stopped first — it starts once that is proven, else it is not started and you are told why' : 'what its last run left running is stopped first';
      // lane vault-job-road r2 (the review): a start DEFERRED behind its last run whose values would wait now is a wait, said as
      // one — never «started» for a run the gate will park
      const vw = this._vaultWaitOf(job);
      if (vw) return { ok: true, state: 'waiting', waitFor: vw.waitFor, after: `${after} — and its vault values would wait now: ${vw.words}` };
      return { ok: true, after };
    }
    joinPress();
    try { this._spawn(job, 'manual', { caller }); } catch (e) { if (e && e.code === 'memory-budget') this._undoRefusedPress(job); else delete job._press; return { error: e.message, ...(e && e.code ? { code: e.code } : {}), ...(e && e.budget ? { budget: e.budget } : {}) }; } // B-f8c7: the run-time vet's refusal is an answer · B-b14a: the budget's too
    delete job._press;
    this._save();
    return job.state === 'waiting' ? this._waitAnswer(job) : { ok: true }; // lane vault-job-road r2: a wait is said as one
  }
  /** THE BOUND, CHANGED (lane jobs-memory-bound) — from the job's properties (the owner) or `vibespace-job memory` (its owner
   *  conversation): a per-job value, or null / 'inherit' = back to THE LADDER. It applies from the NEXT run (the running
   *  process keeps the bound it started under); a cron's lands on its task (and its child) — the fire runs that. */
  /** THE GRANT (the manager design's piece 7, 主开发 2026-11-17 05:02Z / 05:13Z): «may wake its conversation when that
   *  conversation was ended on purpose» — one field on the job or schedule row (DW.GRANT_FIELD), default no, said ONCE per job
   *  and it holds, with `wakeGrantBy {by, at, kind, name}` beside it (who set it — the window's wake line names it). THREE
   *  writers and no fourth: the PERSON (on the page — no bearer + the page verdict; in process the jobs wiring's setWakeGrant,
   *  which the proposal card's press will call once lane login-request-card's unit binds it), a MANAGER KEY holding the verb
   *  jobs.wakeGrant (the person's delegation), and nobody else: a plain agent token is refused BY NAME (GRANT_REFUSAL names the
   *  doors that exist today). A cron's RUN carries none — its schedule's is read.
   *  `by` = { kind: 'person' | 'key', by: the actor, name? } */
  /** THE ONE DOOR FOR A CHANGE OF A WAKE GRANT (lane lg-store-writes — 主开发's shape of 2026-11-20 08:17Z, after three rounds whose
   *  musts came from the cure itself): set or withdrawn, EVERY caller goes through it — the person's act route, the key's verb
   *  jobs.wakeGrant, the proposals' card, the END card's ticks (test-end-proposal's census finds any other caller of the apply red).
   *  `changes` = [{ job | id, grant }] is ONE ACT: the changes applied, the writer asked ONCE for the whole act, its landing awaited
   *  OFF THE LOOP on the writer's own bound (durable — never a synchronous wait on a queued write).
   *   LANDED ⇒ every row done.
   *   NOT LANDED ⇒ ONE TRUTH: exactly what this act changed is restored (each field only if it still holds this act's value), so
   *     memory, the wake's judge and the disk agree; every changed row answers `not_now` BY NAME — nothing was changed.
   *   INSIDE THE WAITING WINDOW the judge (wakeGrantOf) reads a SET as not yet made and a WITHDRAW as made: no wake is ever allowed
   *     on a grant that is then restored, and a grant being withdrawn wakes nothing (its words wait, as for any refused wake).
   *  → { ok, code?, why?, rows: [{ id, ok, changed, code?, error?, [GRANT_FIELD], wakeGrantBy }] } */
  async changeWakeGrants(changes, { by = null, timeoutMs = WAKE_GRANT_LAND_MS } = {}) {
    if (this.readOnly || !this.ready) { const error = this.initError ? `jobs engine down: ${this.initError}` : 'jobs engine not ready — retry shortly'; return { ok: false, code: 'not_ready', error, rows: [] }; }   // as its sibling writers
    if (!by || (by.kind !== 'person' && by.kind !== 'key')) return { ok: false, code: 'wake_grant_person_only', error: DW.GRANT_REFUSAL, rows: [] };
    const G = DW.GRANT_FIELD, rows = [], acted = [], act = {};   // `act`: this act's own token — the marks it sets are its own
    // THE STORAGE BEHIND (the round's should): the jobs file's last landing did not come within its bound (or its write failed) —
    // refused BEFORE anything is applied, so the common stalled case never enters the waiting window
    let behind = null;
    try { behind = (this._writer().whyNotDurable && this._writer().whyNotDurable(this.file)) || null; } catch { behind = null; }
    const refuse = (job, code, error, extra = null) => rows.push({ id: job.id, ok: false, changed: false, code, error, ...(extra || {}), [G]: job[G] === true, wakeGrantBy: job.wakeGrantBy || null });
    const refusedCode = () => { const r = rows.find((x) => !x.ok); return r ? { code: r.code, why: r.error, ...(r.behind ? { behind: true } : {}) } : {}; };
    const release = () => { for (const a of acted) { const m = this._grantActs.get(a.job.id); if (m && m.act === act) this._grantActs.delete(a.job.id); } };
    // ONE TRUTH: exactly what this act applied goes back (ordered acts: nothing else moved it meanwhile)
    const putBack = (what) => {
      for (const a of acted) {
        const j = a.job;
        if ((j[G] === true) !== a.after.on || (j.wakeGrantBy || null) !== a.after.by) continue;
        if (a.before.on) { j[G] = true; j.wakeGrantBy = a.before.by; } else { delete j[G]; delete j.wakeGrantBy; }
        this._touch(j, { what: `${what} — ${a.before.on ? 'it may wake' : 'it does not wake'} its conversation after that conversation is ended on purpose, unless the storage takes the change late (the next read shows what holds)` });
        try { this.d.broadcast('jobs-updated', { id: j.id }); } catch { }
      }
    };
    let landed = false;
    // the try opens BEFORE the loop that applies and marks (主开发 10:05Z): a throw on a later row of the act puts back what the act
    // applied and lets its marks go — never a mark left set until a restart
    try {
      for (const c of Array.isArray(changes) ? changes : []) {
        const job = c && (c.job || this.jobs.get(String(c.id || '')));
        if (!job) { rows.push({ id: c && (c.id || null), ok: false, changed: false, code: 'not_found', error: 'no such job' }); continue; }
        if (job.cronParent) { rows.push({ id: job.id, ok: false, changed: false, code: 'bad_args', error: `refused: ${job.id} is a run of the schedule ${job.cronParent} — the grant is the schedule's` }); continue; }
        // ONE AT A TIME (主开发's must, 08:50Z): an act still waiting on this job (another caller's, or this act's own earlier row) —
        // refused by name, nothing applied: never on top of its unlanded value, never «already as asked» from it
        if (this._grantActs.has(job.id)) { refuse(job, 'busy', WAKE_GRANT_BUSY); continue; }
        // THE STORAGE BEHIND — above the no-op (主开发 10:05Z): while the writer reports the file behind, the value in memory may be a
        // put-back that has not landed, so not even «already as asked» is said from it
        if (behind) { refuse(job, 'not_now', WAKE_GRANT_BEHIND, { behind: true }); continue; }
        const on = c.grant === true;
        if ((job[G] === true) === on) { rows.push({ id: job.id, ok: true, changed: false, [G]: on, wakeGrantBy: job.wakeGrantBy || null }); continue; }   // (no act waits on it and the writer is not behind: the value is the last verdict's)
        const before = { on: job[G] === true, by: job.wakeGrantBy || null };
        this._applyWakeGrant(job, on, by);
        const after = { on, by: job.wakeGrantBy || null };
        this._grantActs.set(job.id, { act, on });   // THE MARK IS THIS ACT'S: the judge reads a SET in it as not yet made; only this act lets it go
        acted.push({ job, before, after });
        rows.push({ id: job.id, ok: true, changed: true, [G]: on, wakeGrantBy: after.by });
      }
      if (!acted.length) return { ok: rows.every((r) => r.ok), ...refusedCode(), rows };
      this._save();
      try { landed = !!(await this._writer().durable(this.file, { timeoutMs })); } catch { landed = false; }
      if (landed) { release(); for (const a of acted) { try { this.d.broadcast('jobs-updated', { id: a.job.id }); } catch { } } return { ok: rows.every((r) => r.ok), ...refusedCode(), rows }; }
      putBack('the wake grant change was not saved in time and was put back');
      this._save();
    } catch (e) {
      try { putBack(`the wake grant change failed (${(e && e.message) || e}) and was put back`); this._save(); } catch { /* the throw below says it */ }
      throw e;
    } finally { release(); }
    this.d.log(`[jobs] a wake grant change of ${acted.length} job(s) did not land in ${Math.round(timeoutMs / 1000)} s — put back; said not now`);
    const beforeOf = new Map(acted.map((a) => [a.job.id, a.before]));
    return { ok: false, code: 'not_now', why: WAKE_GRANT_NOT_LANDED, rows: rows.map((r) => (beforeOf.has(r.id) ? { ...r, ok: false, changed: false, code: 'not_now', error: WAKE_GRANT_NOT_LANDED, [G]: beforeOf.get(r.id).on, wakeGrantBy: beforeOf.get(r.id).by } : r)) };
  }
  /** the change in memory only — THE ONE DOOR above is its only caller (its write, its landing and its restore are the door's) */
  _applyWakeGrant(job, on, by) {
    if (on) { job[DW.GRANT_FIELD] = true; job.wakeGrantBy = { by: String(by.by || by.kind), at: now(), kind: by.kind, ...(by.name ? { name: String(by.name).slice(0, 80) } : {}) }; }
    else { delete job[DW.GRANT_FIELD]; delete job.wakeGrantBy; }
    const who = by.kind === 'person' ? 'the person' : `the key ${by.name ? '«' + String(by.name).slice(0, 80) + '»' : by.by}`;
    this._touch(job, { what: on ? `may now wake its conversation after that conversation is ended on purpose (set by ${who})` : `no longer wakes its conversation after that conversation is ended on purpose (cleared by ${who})` });
  }
  /** the doors' rows for these jobs (piece 7): the facts each row needs, the NAME through the ONE accessor (labelOf); a CLEARED
   *  job answers its id (the clear honoured at the read) */
  wakeRowsOf(jobs) { return DW.wakeChoiceRows((jobs || []).filter(Boolean).map((j) => ({ id: j.id, label: j.clearedAt ? j.id : this.labelOf(j), schedule: j.kind === 'cron' ? (j.schedule || true) : null, nextFireAt: j.nextFireAt || null, grant: j[DW.GRANT_FIELD] === true, grantBy: j.wakeGrantBy || null }))); }
  /** the grant a delivery's job carries — read AT THE LINE → {granted, by}. A cron's RUN carries none of its own: its grant is
   *  its SCHEDULE's, read there only (主开发 12:46Z MUST 4 — a run's own field was a fourth writer no door could clear) */
  wakeGrantOf(jobId) {
    const j = this.jobs.get(jobId) || null;
    const g = j && (j.cronParent ? this.jobs.get(j.cronParent) : j);
    const waiting = g && this._grantActs.get(g.id);
    return g && g[DW.GRANT_FIELD] === true && !(waiting && waiting.on) ? { granted: true, by: g.wakeGrantBy || null } : { granted: false, by: null };   // (a SET still waiting for its landing is not yet made — the door's window)
  }
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
    if (this._notifsUnread && job && job.clearedAt) return { error: this._notifsClearedWords(job.id), code: 'notifs-unread' };   // the B-f276 remainder (5), its read r2 (M2)
    const alive = this._verifyAlive(this._readStamp(job));
    if (alive && !stop && !orphan) return { error: `${job.id} is still running — vibespace-job rm ${job.id} --stop (kill then remove), or --orphan to abandon the live process (tracked nowhere after that)` };
    if (alive && stop) { const s = this.stop(job, { force: false }); if (s && s.code === 'hub-is-main') return s; }   // B-2c5c: never removed while it runs as this hub
    if (alive && orphan) this.d.log(`[jobs] ${job.id} ORPHANED by request — live pid abandoned`);
    const last = job.runs && job.runs[job.runs.length - 1];
    if (job.kind === 'cron') for (const k of this.jobs.values()) if (k.cronParent === job.id) this._settleWait(k, 'its schedule was removed'); // lane vault-job-road: a removed cron's waiting run never starts
    this.jobs.delete(job.id); this._dirty = true; this._save();
    try { this.d.onRunEnded?.(job, null); } catch { }   // round wxzvih2as's MUST (1): A PERSON's REMOVAL BEATS THE COPIES: the person's removal releases the job's browser handle BY ID (a kept copy never keeps it)
    // B-0248 step 3: a stale archived copy of this live record (a crash between an archive's landing and jobs.json's) goes with it
    // …HIDDEN while it is taken out (r1908 (2): it showed as an archived row until that write landed — the job just removed)
    if (!this._archiveHandedIds.has(job.id) && !this._unread.archive && (this._archiveNext() || []).some((r) => r && r.id === job.id)) {
      this._archiveTakingOut.add(job.id);
      const w = this._writeArchive(this._archiveNext().filter((r) => r.id !== job.id), { onLanded: () => this._archiveTakingOut.delete(job.id) });
      if (!w.ok) this._archiveTakingOut.delete(job.id);
    } else if (!this._archiveHandedIds.has(job.id) && this._archivePending && (this.archive || []).some((r) => r && r.id === job.id)) {   // (a handed id is its sweep's: _sweepLanded hides it)   // its fresh read: the write in flight already lacks it, the landed archive still lists it
      this._archiveTakingOut.add(job.id);
      this._ride(this.archiveFile, 'the stale copy hidden', () => this._archiveTakingOut.delete(job.id));
    }
    (this._removalOwed || (this._removalOwed = new Map())).set(job.id, job);   // its logs stay in the sweep's keep set until the landing
    // lane lg-store-writes (the moved2 cure 2 — THE STEP RIDES THE LANDING, no roll back): what cannot be undone — its kept processes
    // ended, its For-you items resolved — runs once jobs.json holds the removal; a kill first brings the job back whole. The
    // route's reply waits its bound (persisted): not landed yet ⇒ said, and the rest follows by itself at the landing
    this._ride(this.file, 'the removal', () => {
      if (this._removalOwed && this._removalOwed.get(job.id) === job) this._removalOwed.delete(job.id);
      if (last && last.endedAt) this._clearKept(job, last).catch(() => { }); // round 5: a removed service keeps nothing running
      try { this.d.resolveJobAsk && this.d.resolveJobAsk(job.id, { onlyAsk: false }); } catch { } // removed job leaves no orphan inbox items
      // lane vault-job-approval: a removed job leaves no open approval card, and no approval — its id leaves every vault-job row (a
      // new job asks again), AFTER it left the registry so nothing re-judges it; both ride the landing (a kill first: the job back
      // whole, its card and its approval kept)
      this._vaultAskOver(job);
      this._vaultGone([job]);
    });
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
    this._save();
    // the moved2 census (its jobs pass): THE STEP RIDES THE LANDING — the For-you item filed and the owner told only once jobs.json holds
    // the panel (a kill first leaves no item open for a panel the disk never held); a panel answered or withdrawn meanwhile files nothing
    this._ride(this.file, 'the panel asked', () => {
      const pend = job.interaction && job.interaction.pending;
      if (!pend || pend.version !== version) return;
      this._forYou(job, M.forYouCopy(job, 'ask'));
      this._notifyOwner(job, { what: 'posted an interaction panel and is awaiting an answer' });
      this._save();
    });
    return { ok: true, version };
  }
  /** B-8bd5: the job that FILED a panel may WITHDRAW it once its cause is gone (a monitor's alarm that cleared) — the panel closed,
   *  its For-you item resolved, a waiting `answers --wait` woken, said in its events; no panel open: answered, nothing changed */
  withdrawAsk(job, { self = false } = {}) {   // `self`: the job withdrew its own question (its jbt_) — it knows; nothing echoes on its stdin
    if (this.readOnly) return { error: 'registry is read-only in this process' };
    const p = job.interaction && job.interaction.pending;
    if (!p) return { ok: true, already: 'no panel of this job is open' };
    // its adversarial read r1: the withdraw is a RECORD in the answers (as an expiry is) — a loop waiting on `answers --wait` learns
    // the panel is gone, whoever closed it
    job.interaction.answers = job.interaction.answers || [];
    const wrec = { withdrawn: true, version: p.version, ts: now() };
    job.interaction.answers.push(wrec);
    if (job.interaction.answers.length > 50) job.interaction.answers.splice(0, job.interaction.answers.length - 50);   // its read r2: the same cap as an answer's
    // THE RELEASE'S ORDER (the census cure's hunt, finding 8 — 主开发 19:44Z: a file ANOTHER PROCESS reads is written first and at once,
    // the record after): the stdin-open job's answers file (its wrapper tails it) gets the withdraw at the act's own time, OFF the loop
    // as the release started it — never inside a step that an exit's flush runs and then exits; the record follows. Its wait woken and
    // the For-you item resolved still ride jobs.json's landing (the moved2 census)
    const run = job.stdinOpen && !self && job.runs && job.runs[job.runs.length - 1];   // 主开发 21:46Z: a stdin-open job reads a withdraw BY ITS OWNER on its stdin — never an echo of its own
    const ctl = run ? this._ctlDir(job, run.startedAt) : null;
    if (ctl) { try { fs.promises.appendFile(path.join(ctl, 'answers.jsonl'), JSON.stringify(wrec) + '\n').catch(() => { }); } catch { } }   // OFF the loop (test-store-write-census: no new synchronous store write)
    job.interaction.pending = null;
    if (job.state === 'awaiting-user') job.state = 'up';
    this._touch(job, { what: `withdrew its panel #${p.version} (its cause is gone)`, verb: 'answers' });
    this._save();
    this._ride(this.file, 'the panel\'s withdraw', () => {
      this._resolveAns(job);
      try { this.d.resolveJobAsk && this.d.resolveJobAsk(job.id); } catch { }
    });
    return { ok: true, version: p.version };
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
    // THE RELEASE'S ORDER (the census cure's hunt, finding 7 — 主开发 19:44Z: a file ANOTHER PROCESS reads is written first and at once,
    // the record after): the wrapper's answers file gets the answer NOW, before the record is handed to the writer — a kill between them
    // leaves the answer with the child and the panel open on disk (a harmless re-ask), never a closed panel whose child waits for ever
    const run = job.stdinOpen && job.runs && job.runs[job.runs.length - 1];
    const ctl = run ? this._ctlDir(job, run.startedAt) : null;
    if (ctl) { try { fs.appendFileSync(path.join(ctl, 'answers.jsonl'), JSON.stringify(rec) + '\n'); } catch { } } // mirror to the wrapper's answers tail file
    job.interaction.pending = null;
    if (job.state === 'awaiting-user') job.state = 'up';
    this._touch(job, { what: 'the user answered its panel', verb: 'answers' });
    this._save();
    // lane lg-store-writes (the moved2 cure 2 — THE STEP RIDES THE LANDING, no roll back): the record in MEMORY holds the answer at
    // once (the act is taken: `vibespace-job answers` read through the hub shows it); the job's wait woken, the For-you item closed,
    // its owner told ride jobs.json's landing. The route's reply waits its bound (persisted): not landed yet ⇒ said, and they follow
    // by themselves at the landing (the moved2 cure 3: the words made true)
    this._ride(this.file, 'the panel\'s answer', () => {
      this._resolveAns(job);
      try { this.d.resolveJobAsk && this.d.resolveJobAsk(job.id); } catch { } // clear the needs-your-input inbox entry (owner report: it lingered after submit)
      this._notifyOwner(job, { what: 'the user answered its interaction panel — vibespace-job answers ' + job.id });
      this._save();
    });
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
      schedule: job.schedule, nextFireAt: job.nextFireAt || null, context: this._contextFor(job, author),
      owner: { createdBy: job.owner?.createdBy, groups: job.owner?.groupsSnapshot || [] },
      access: job.access, createdAt: job.createdAt, cronParent: job.cronParent || null,
      notify: job.notify || 'inherit', lastNotify: job.lastNotify || null, subscribersCount: (job.subscribers || []).length, [DW.GRANT_FIELD]: job[DW.GRANT_FIELD] === true, wakeGrantBy: job.wakeGrantBy || null,   // piece 7: the grant + who set it
      notifyLog: (job.notifyLog || []).slice(-8),
      forYouLast: job.forYouLast || null,   // r4: each For-you copy's LAST verdict (past the journal's window; a cron's carries its run's)
      // full creation parameters (2.347.0, owner ask: agents must be able to
      // re-inspect what they registered) — env VALUES stay out (names only)
      cmd: job.cmd ? { argv: job.cmd.argv, cwd: job.cmd.cwd || null, envKeys: Object.keys(job.cmd.env || {}) } : null,
      ...((b) => (b ? { memoryBudget: { ...b, ...this._askFacts(job, b) } } : {}))(this._budgetFacts()),   // B-b14a: the instance's budget for running jobs — numbers only ({budgetMb, running, usedMb} or {…, unmeasured}); NO field without a limit
      mayRead: M.mayReadOf(job),   // B-3992: the jobs this job's token may READ beside itself (null: only itself)
      vault: VJ.refsOf(job).map((r) => ({ name: r.name, ref: r.ref })), waitFor: job.state === 'waiting' ? job.waitFor || null : null, waitWords: job.state === 'waiting' ? VJ.waitWords(job.waitFor) : null, // lane vault-job-road: REFERENCES only, never a value
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
      catchUp: job.catchUp || null, singleInstance: job.singleInstance !== false,
      // lane jobs-memory-bound: THE LADDER's answer now (a cron's: its task's), the rung its latest run measured, the park's
      // reason and the out-of-memory ends counted toward it
      ...(() => { const m = M.memoryMbOf(job.kind === 'cron' && job.action && job.action.task ? job.action.task : job, this._memoryCtx()); const own = job.kind === 'cron' && job.action && job.action.task ? job.action.task : job; return { memoryMb: m.mb, memoryAskedMb: m.askedMb !== undefined ? m.askedMb : m.mb, memorySource: m.source, memoryCap: m.cap || null, nodeHeap: (() => { const mh = M.memoryMbOf(own, this._memoryCtx({ hub: true })); return M.nodeHeapOf({ boundMb: mh.mb, source: mh.source, nodeOptions: ((own.cmd || {}).env || {}).NODE_OPTIONS }); })() }; })(), // B-d73c: the heap its Node gets — worked out from the SAME context as the spawn's flag (round wrpdo2eev 4: one number) · round 4: the NEXT run's (a live run's own rides its memoryBound.cap)
      memoryBound: run && run.memoryBound ? { ...run.memoryBound, words: M.boundWords(run.memoryBound) } : null, oomEnds: (job.supervise && job.supervise.oomEnds) || 0, // round 5: the record's words (an unbounded scope is never «0 MB»)
      parkedFor: (job.supervise && job.supervise.parkedAt && job.supervise.parkedFor) || null,
      // r1263: what the card says of a hub-main job — a service not restarted by itself, and (4c) a hub that runs under this job's bound
      hubMainDown: !!job.hubMainDown, runsHub: !!(run && !run.endedAt && this._hubMainOf(run, null)),
      run: run ? { startedAt: run.startedAt, endedAt: run.endedAt || null, exit: run.exit ?? null, cause: run.cause || null, trigger: run.trigger, lastLine: run.lastLine || '', ...(run.left ? { left: { n: run.left.n, kept: !!run.left.kept, force: !!run.left.force, cleared: run.left.cleared || 0, gone: run.left.gone || 0, escaped: run.left.escaped || 0, outside: run.left.outside || 0, short: run.left.short || 0 } } : {}), ...(M.runEndWords(run) ? { endWords: M.runEndWords(run) } : {}) } : null, // round 5: what it left running / the kill we made
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
        out.logTail = buf.toString('utf-8').split('\n').slice(-tail).join('\n');
      } catch { out.logTail = ''; }
    }
    return out;
  }
  /** the last non-empty line of a run's log (≤200 cp);
   *  '' when the log is missing or empty. Reads only the log's last 16 KiB. */
  _lastLogLine(job, run) {
    try {
      const logPath = path.join(this._ctlDir(job, run.startedAt), 'current.log');
      if (this._ctlPre && this._ctlPre.has(logPath + '#last')) return this._ctlPre.get(logPath + '#last');   // B-f276 cure r2: read off the loop
      const st = fs.statSync(logPath);
      const len = Math.min(st.size, 16384);
      if (!len) return '';
      const fd = fs.openSync(logPath, 'r');
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, st.size - len); fs.closeSync(fd);
      return M.lastLineOf(buf.toString('utf-8'), 200);
    } catch { return ''; }
  }
  // injection surfaces (agent-routes): ADDRESSED, budgeted in the model. lane jobs-addressed-push (2026-11-10): the hook routes'
  // two calls into this engine — a job's digest row and its event lines reach a conversation only when M.addressedTo names it
  // (its owner lineage or a subscriber, inside what it may view); every other visible job is a COUNT with no id. View stays a
  // PULL right (the agent routes' list / show / poll). scripts/test-jobs-addressed.mjs reads these bodies.
  _cronParentOf(j) { return j && j.cronParent ? this.jobs.get(j.cronParent) || null : null; }
  digestFor(caller, existingBytes) {
    const vis = M.visibleJobs([...this.jobs.values()], caller).filter((j) => j.state !== 'done' || now() - ((j.runs || [])[j.runs?.length - 1]?.endedAt || 0) < 86400e3);
    const role = new Map(vis.map((j) => [j, M.addressedTo(j, caller, this._cronParentOf(j))]));
    const mine = vis.filter((j) => role.get(j)), others = vis.filter((j) => !role.get(j) && M.ownerConversationOf(j));   // r3: a lineage-less job is no «other conversation's»
    // r6 (accept-r5 confirmed 0): a RECORD never crosses into the renderer — each ROW is built here, its name the ONE accessor's
    // (labelOf belts the WHOLE name; the renderer cuts the label — the cut never precedes the mask). r5 spread the record
    // (`{ ...j, ageHint }`) and jobLine cut `j.name` to 24: another conversation's SessionStart context read a token's head raw
    const rows = mine.map((j) => ({ id: j.id, kind: j.kind, state: j.state, ageHint: this._ageHint(j), label: this.labelOf(j), ...(role.get(j) === 'subscriber' ? { sub: true } : {}) }));
    const plain = M.renderJobsDigest(rows), told = others.length ? M.renderJobsDigest(rows, { others: others.length, othersFailed: others.filter((j) => j.state === 'failed' || j.state === 'missed').length }) : plain;
    // r2 (law A): the others' line rides only WHOLE inside the room left — never an own row (else the base's own digest, folded as before)
    return told !== plain && M.fitDigest(existingBytes, told, { count: rows.length }) === told ? told : M.fitDigest(existingBytes, plain, { count: rows.length });
  }
  updatesFor(caller, sinceTs) {
    const role = new Map(), others = new Map();
    for (const j of M.visibleJobs([...this.jobs.values()], caller)) { const r = M.addressedTo(j, caller, this._cronParentOf(j)); if (r) role.set(j.id, r); else if (M.ownerConversationOf(j)) others.set(j.id, j); }   // r3: a job no conversation owns by id is no «other conversation's» (its creator may be the reader)
    const evs = this.events.filter((e) => e.ts > sinceTs && role.has(e.jobId)).map((e) => ({ id: e.jobId, name: e.name, what: e.what, verb: e.verb, ...(role.get(e.jobId) === 'subscriber' ? { sub: true } : {}) }));
    // the count: other conversations' jobs that FAILED since this turn's marker AND since this session began (a new session's
    // marker is 0 — the ring's 400 entries are not its news); a cron family counts once (a refused child parks its parent too)
    const floor = Math.max(Number(sinceTs) || 0, Number(caller && caller.sessionCreatedAt) || 0);
    const failed = new Set(this.events.filter((e) => e.alarm && e.ts > floor && others.has(e.jobId)).map((e) => others.get(e.jobId).cronParent || e.jobId));
    // r3 (law A on the route): `plain` = the own lines alone — the hook route falls back to it when the block with the count does
    // not fit the room left (the own lines never wait for the count)
    const text = M.renderJobsUpdate(evs, { othersFailed: failed.size });
    return { text, plain: failed.size ? M.renderJobsUpdate(evs) : text, lastTs: this.events.length ? this.events[this.events.length - 1].ts : sinceTs };
  }
  /** r2 (the acceptance's law D2): the job's --context as a reader gets it — whole for its AUTHOR (the owner lineage), and for
   *  every other reader through THE SAME mask as its --text (`_agentWords`: the vault's values + the secret shapes); the record
   *  keeps it raw. The base handed another conversation the brief with a token in it raw (the text beside it was masked). */
  _contextFor(job, author) {
    const c = job.context;
    if (!c) return null;
    if (author) return c;
    if (typeof c === 'string') return this._agentWords(c);
    return typeof c.payload === 'string' ? { ...c, payload: this._agentWords(c.payload) } : c;
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

module.exports = { JobManager, ARCHIVE_CAP, ARCHIVE_SWEEP_MS, GC_FILES_MS, GC_SAY_AGAIN_MS, jobEnv, jobRunEnv, wrapperEnv, WRAPPER_ENV_KEEP, WRAPPER_PROTO, UPDATE_WINDOW_MS };
