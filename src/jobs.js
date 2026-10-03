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
const crypto = require('crypto');
const { withoutNoticeHead } = require('./notification-senders.js'); // lane notify-retry: a parked frame carries the ladder's head; the floor's digest is of the raw text
const textDigest = (t) => crypto.createHash('sha256').update(String(t)).digest('hex'); // a flood floor's memory of a text (verify r9)
const { spawn, execFile } = require('child_process');
const M = require('./job-model.js');
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
function readStarttime(pid) {
  try {
    const s = fs.readFileSync(`/proc/${pid}/stat`, 'utf-8');
    return Number(s.slice(s.lastIndexOf(')') + 2).split(' ')[19]);
  } catch { return 0; }
}
function bootId() { try { return fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf-8').trim(); } catch { return ''; } }
// mirror of ws-handler's agentEnv drops (jobs must never inherit ambient vendor
// credentials or server config — §ban-safety structural leg)
function jobEnv(extra = {}) {
  const env = { ...process.env };
  for (const k of Object.keys(env)) {
    if (/^(VIBESPACE_|npm_|CLAUDE_CODE_)/.test(k)) delete env[k];
    if (['PORT', 'HOST', 'NODE_ENV', 'NODE_OPTIONS', 'ANTHROPIC_API_KEY', 'CLAUDE_SECURESTORAGE_CONFIG_DIR'].includes(k)) delete env[k];
  }
  return { ...env, ...extra };
}
const now = () => Date.now();
const rid = () => 'jb-' + crypto.randomBytes(4).toString('hex');
// triage archive (design §13): newest ARCHIVE_CAP records kept; the sweep
// runs at boot and every ARCHIVE_SWEEP_MS on the engine's existing 5 s tick
const ARCHIVE_CAP = 2000;
const ARCHIVE_SWEEP_MS = 5 * 60 * 1000;
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
  /** deps: { dataDir, broadcast(type,payload), notifyUser({text,urgency,jobId}), log,
   *          deliverToConversation?(cid,text)→Promise<{ok,peerName?,reason?}>,   // 2.344.0 peer-message lane
   *          groupNotifyFor?(job)→true|false|null, notifyGlobal?()→bool }        // toggle resolution */
  constructor(deps) {
    this.d = deps;
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
      try { this.d.notifyUser({ text: `Background Work engine failed to start: ${e.message}`, urgency: 'high' }); } catch { }
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
        try { this.d.notifyUser({ text: 'Background Work store was corrupt — records recovered as unverified; resolve them in the Jobs panel', urgency: 'high' }); } catch { }
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
    const namesBefore = new Set([...liveHits, ...archHits].map((j) => j.name).filter(Boolean));
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
    const svcLabels = new Set([...gone].map((id) => nameBefore.get(id)).filter((n) => n && n !== CLEARED_TEXT).map((n) => 'service: ' + n));
    // …and never ANOTHER job's (lane-redact verify r9): names are not unique — a live service NOT cleared that bears the same
    // name and publishes that forward's port owns it (its Ports row read the sentence until its next publish); an orphan
    // forward with the cleared name (no live owner) still goes — fail closed
    const sameNameLive = (rec) => [...this.jobs.values()].some((o) => !gone.has(o.id) && o.kind === 'service' && o.publish && 'service: ' + o.name === rec.label && (o.ports || []).map(Number).includes(Number(rec.remotePort)));
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
      const notifText = M.renderOwnerNotify(job, ev);
      const seenSubs = new Set();
      for (const sub of [...(job.subscribers || []), ...((parent && parent.subscribers) || [])]) {
        if (!sub.conversationId || sub.conversationId === cid || seenSubs.has(sub.conversationId)) continue;
        seenSubs.add(sub.conversationId);
        if (!M.filterMatches(sub.filter, notifText)) continue;
        this._deliverTo(sub.conversationId, job, ev, { subscriber: true, text: notifText });
      }
      if (!cid) return; // user-created or lineage-less job — user lanes (inbox/panel) already cover it
      const eff = M.notifyEffective(this._notifyOverrideOf(job), this.d.groupNotifyFor ? this.d.groupNotifyFor(job) : null, this.d.notifyGlobal ? this.d.notifyGlobal() : true);
      if (!eff.on) { job.lastNotify = { ts: now(), lane: 'off', ok: false, source: eff.source }; this._notifyLogPush(job, { lane: 'off', ok: false, reason: 'auto-notify off (' + eff.source + ')' }); return; }
      this._deliverTo(cid, job, ev, {});
    } catch (e) { this.d.log('[jobs] owner notify failed:', e.message); }
  }
  /** one delivery attempt to ONE conversation (owner or subscriber): flood
   *  floor → socket post → stash fallback. Subscriber deliveries never stamp
   *  the job's lastNotify (that field narrates the OWNER lane). */
  _deliverTo(cid, job, ev, { subscriber, text: preText } = {}) {
    const text = preText || M.renderOwnerNotify(job, ev);
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
    const retry = { producer: 'jobs', meta: { jobId: job.id, jobName: job.name || job.id, ev: { what: (ev && ev.what) || job.state, at: (ev && ev.at) || now() }, subscriber: !!subscriber } };
    const deliver = this.d.deliverToConversation
      ? this.d.deliverToConversation(cid, text, { fromName: 'Background Work · ' + (job.name || job.id), kind: 'notification', spendReason: 'job-notification', retry })
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
    q.push({ jobId: job.id, jobName: stale ? CLEARED_TEXT : job.name, text: stale ? CLEARED_TEXT : ((ev && ev.what) || job.state), ts: now(), urgency: job.state === 'failed' ? 'normal' : 'low', held: held || heldOf(null, reason) });
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
      return { ok: true, already: !changed, updated: changed, filter: vf.filter, count: job.subscribers.length };
    }
    if (job.subscribers.length >= 10) return { error: 'subscriber cap (10) reached for this job' };
    job.subscribers.push({ conversationId: caller.conversationId, sessionId: caller.sessionId || null, ts: now(), filter: vf.filter });
    this._touch(job); this._save();
    return { ok: true, count: job.subscribers.length, filter: vf.filter };
  }
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
    this.events.push({ ts: now(), jobId: job.id, name: job.name, what, verb });
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
    const st = readStarttime(stamp.pid);
    return !!st && st === stamp.starttime && stamp.bootId === bootId();
  }
  _killGroup(job, sig) { // handle-kill with act-time re-verification (B-16d9 law)
    const stamp = this._readStamp(job);
    if (!this._verifyAlive(stamp)) return false;
    try { process.kill(-stamp.pid, sig); return true; } catch { try { process.kill(stamp.pid, sig); return true; } catch { return false; } }
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
    fs.mkdirSync(ctl, { recursive: true });
    job.state = 'starting';
    delete job.ack; // a NEW run is a new claim on the user's attention (triage §13)
    job.runs = job.runs || [];
    job.runs.push({ startedAt: runTs, trigger, log: path.join(ctl, 'current.log') });
    if (job.runs.length > 20) job.runs.splice(0, job.runs.length - 20);
    this._save(); // intent-before-spawn, flushed
    const spec = {
      argv: job.cmd.argv, cwd: job.cmd.cwd || process.cwd(),
      env: jobEnv({ ...(job.cmd.env || {}), ...this._secretsFor(job), VIBESPACE_API: this.d.apiBase || `http://127.0.0.1:${process.env.PORT || 3456}`, VIBESPACE_JOB_ID: job.id, VIBESPACE_JOB_TOKEN: this._jobToken(job), PATH: path.join(this.d.dataDir, 'bin') + ':' + (process.env.PATH || '') }),
      logCapBytes: 50 * 1024 * 1024, stdinOpen: !!job.stdinOpen,
    };
    const wrapper = path.join(this.d.dataDir, 'bin', 'job-wrapper.js');
    const child = spawn(process.execPath, [wrapper, ctl, Buffer.from(JSON.stringify(spec)).toString('base64')], { detached: true, stdio: 'ignore' });
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
  async _ensurePublish(job) {
    try {
      const pf = this.d.getPorts && this.d.getPorts();
      if (!pf) return;
      const rec = await pf.forward('__local__', job.ports[0], { label: 'service: ' + job.name });
      job._pfId = rec && rec.id;
      try {
        const r = await pf.publish(job._pfId);
        job.publishedUrl = r && r.publicUrl || null;
      } catch (e) { this.d.log('[jobs] publish unavailable for', job.id, '—', e.message); job.publishedUrl = null; }
      this._touch(job);
    } catch (e) { this.d.log('[jobs] forward failed for', job.id, '—', e.message); }
  }
  async _teardownPublish(job) {
    try {
      const pf = this.d.getPorts && this.d.getPorts();
      if (!pf || !job._pfId) return;
      try { await pf.unpublish(job._pfId); } catch { }
      try { await pf.unforward(job._pfId); } catch { }
      job._pfId = null; job.publishedUrl = null;
      this._touch(job);
    } catch { }
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
        if (exit) { this._finalizeRun(job, run, exit, 'boot'); continue; }
        if (stamp && !stamp.bootId) { job.state = 'unverified'; this._touch(job, { what: 'unverified after restart — resolve in the panel' }); continue; }
        // no live process, no exit record ⇒ died with the environment
        if (job.kind === 'service') { job.state = 'down'; this._touch(job); }
        else { if (run && !run.endedAt) { run.endedAt = now(); run.cause = 'env-restart'; run.exit = null; } job.state = 'interrupted'; this._touch(job, { what: 'interrupted (env-restart: the host/pod restarted)' }); }
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
        if (job.kind === 'service' && job.desiredUp && job.state === 'down' && !(job.supervise && job.supervise.parkedAt)) this._spawn(job, 'boot');
      } catch (e) { this.d.log(`[jobs] replay failed for ${job.id}:`, e.message); }
    }
  }
  _readExit(job, run) {
    if (!run) return null;
    try { return JSON.parse(fs.readFileSync(path.join(this._ctlDir(job, run.startedAt), 'exit.json'), 'utf-8')); } catch { return null; }
  }
  _finalizeRun(job, run, exit, why) {
    run.endedAt = exit.endedAt || now();
    // lane jobs-browser (B-dbc1): the run is over — what it held as its conversation (its browser lease + window) is released
    try { this.d.onRunEnded?.(job, run); } catch { }
    run.exit = exit.code;
    const untilHit = job._untilHit;
    run.cause = untilHit ? 'ok(until-output)' : exit.signal === 'SIGKILL' && why === 'oom' ? 'oom'
      : job._stopRequested ? 'interrupted' : exit.code === 0 ? 'ok' : job._timedOut ? 'timeout' : 'error';
    delete job._stopRequested; delete job._timedOut; delete job._untilHit;
    if (job.kind === 'service') {
      const dec = M.onServiceExit(job, { uptimeMs: run.endedAt - run.startedAt, now: now() });
      job.supervise = dec.supervise || job.supervise;
      if (dec.park) {
        job.state = 'failed';
        this._teardownPublish(job);
        this._touch(job, { what: `parked after ${M.SUPERVISE.failCap} crashes (exit ${run.exit})` });
        try { this.d.notifyUser({ text: `Service ${job.name} crash-looped and was parked — vibespace-job start ${job.id} to retry`, urgency: 'normal', jobId: job.id, jobName: job.name, ownerCid: job.owner?.conversation?.id || null }); } catch { }
        this._notifyOwner(job, { what: `parked after ${M.SUPERVISE.failCap} crashes (exit ${run.exit}) — start it again once fixed` });
      } else if (dec.restartInMs) {
        job.state = 'down'; this._touch(job);
        const t = setTimeout(() => { try { if (job.desiredUp && job.state === 'down') this._spawn(job, 'restart-policy'); } catch { } }, dec.restartInMs);
        t.unref?.();
      } else { job.state = 'down'; this._touch(job); }
    } else {
      job.state = run.cause === 'interrupted' ? 'interrupted' : run.cause.startsWith('ok') ? 'done' : 'failed';
      // the LAST NON-EMPTY log line, computed ONCE here (triage §13 rule 4):
      // the one actionable fact a failed row can show without a detail fetch —
      // unless the clear COVERED this run (it started before the clear; verify
      // r3): its log is withheld from every snapshot, and its last line is that
      // log's own output (under a forced stop / OOM the process's last words —
      // the wrapper's exit marker only when the wrapper outlived the group)
      run.lastLine = job.clearedAt && !((run.startedAt || 0) > job.clearedAt) ? null : this._lastLogLine(job, run);
      // quiet-success is the DEFAULT, not a law (2.346.0, owner decision): the
      // creating agent opts scheduled successes into events+notify with
      // --notify-ok (job.notifyOk, inherited by the cron child via the
      // embedded task spec)
      const routineCronOk = job.cronParent && job.state === 'done' && !job.notifyOk;
      const evText = `${job.state} exit=${run.exit ?? '—'} ${run.cause} (${Math.round((run.endedAt - run.startedAt) / 60000)}m)`;
      this._touch(job, routineCronOk ? null : { what: evText });
      if (job.notifyUser) { try { this.d.notifyUser({ text: `Task ${job.name}: ${job.state} (${run.cause})`, urgency: job.state === 'failed' ? 'normal' : 'low', jobId: job.id, jobName: job.name, ownerCid: job.owner?.conversation?.id || null }); } catch { } }
      // owner auto-notify honors the same quiet-success law: routine scheduled
      // success never messages anyone; agent-stopped ('interrupted') skips too
      // — the owner just did it and a message would echo their own action.
      if (!routineCronOk && job.state !== 'interrupted') this._notifyOwner(job, { what: evText });
    }
  }

  // ── sweeps ──────────────────────────────────────────────────────────────
  async _sweep() {
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
      // a stop that raced the wrapper's first act (no pid stamp yet ⇒ nothing
      // to kill) is honored HERE once the stamp exists — without this, a stop
      // in a job's first few hundred ms silently no-opped (2.350.0 gate catch)
      if (stamp && job._stopRequested && this._verifyAlive(stamp)) {
        this._killGroup(job, 'SIGKILL');
      }
      if (stamp && !this._verifyAlive(stamp)) {
        const exit = this._readExit(job, run) || { code: null, endedAt: now() };
        this._finalizeRun(job, run, exit, 'sweep');
        continue;
      }
      // timeout
      if (job.kind === 'task' && job.timeoutMs && run && !run.endedAt && now() - run.startedAt > job.timeoutMs) {
        job._timedOut = true; this._killGroup(job, 'SIGTERM');
        const t = setTimeout(() => this._killGroup(job, 'SIGKILL'), 10_000); t.unref?.();
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
        const t = setTimeout(() => { this._killGroup(job, 'SIGTERM'); const t2 = setTimeout(() => this._killGroup(job, 'SIGKILL'), 10_000); t2.unref?.(); }, grace);
        t.unref?.();
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
            try { this.d.notifyUser({ text: `Scheduled job ${job.name} MISSED its time (server was down)`, urgency: 'high', jobId: job.id, jobName: job.name, ownerCid: job.owner?.conversation?.id || null }); } catch { }
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
      if (job.notifyUser) {
        try {
          this.d.notifyUser({ text: a.text || job.name, urgency: a.urgency || 'normal', jobId: job.id, jobName: job.name, ownerCid: job.owner?.conversation?.id || null });
          this._notifyLogPush(job, { lane: 'user-inbox', ok: true });
        } catch { }
      }
      // THE 设备运维大师 gap (2.361.5): a notify action only reached the USER
      // inbox — the agent that scheduled its own reminder was never messaged
      // (an agent-created dated obligation woke nobody). Owner-conversation
      // delivery rides the same toggles/rate-floor/stash as every job event.
      this._notifyOwner(job, { what: a.text || job.name });
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
    const visNames = new Set(M.visibleJobs([...this.jobs.values()], caller).map((j) => j.name));
    const { name, renamed } = M.resolveName(spec.name, visNames);
    const job = {
      id: rid(), kind: spec.kind || 'task', name, note: spec.note || '',
      cmd: spec.cmd, envFrom: spec.envFrom || [], restart: spec.restart || 'on-failure',
      health: spec.health || null, ports: spec.ports || [], publish: !!spec.publish,
      singleInstance: spec.singleInstance !== false, timeoutMs: spec.timeoutMs || null,
      untilOutput: spec.untilOutput || null, stdinOpen: !!spec.stdinOpen, notifyUser: !!spec.notifyUser,
      notify: spec.notify === 'on' || spec.notify === 'off' ? spec.notify : undefined, // owner auto-notify override; undefined = inherit group/global
      notifyOk: !!spec.notifyOk, // scheduled successes opt INTO events+notify (quiet-success is only the default)
      schedule: spec.schedule || null, catchUp: spec.catchUp || 'once', action: spec.action || null,
      context: spec.context || null, interaction: { pending: null, answers: [] },
      owner: spec.owner, access: spec.access || { view: 'group', control: 'session' },
      stopWithOwner: !!spec.stopWithOwner, desiredUp: true,
      state: spec.kind === 'cron' ? 'scheduled' : 'starting', proc: null, supervise: { consecutiveFails: 0, parkedAt: null },
      runs: [], createdAt: now(),
    };
    this.jobs.set(job.id, job);
    if (job.kind !== 'cron') {
      try { this._spawn(job, 'manual'); } catch (e) { job.state = 'failed'; this._touch(job); return { error: `spawn failed: ${e.message}`, job: this.snapshot(job) }; }
    } else { job.nextFireAt = M.nextFire(job.schedule, now()); this._touch(job); }
    this._save();
    return { job: this.snapshot(job), renamed };
  }
  stop(job, { force } = {}) {
    if (this.readOnly) return { error: 'registry is read-only in this process' };
    if (job.kind === 'service' || job.kind === 'cron') { job.desiredUp = false; }
    job._stopRequested = true;
    if (job.kind === 'service') this._teardownPublish(job);
    const hadProc = this._killGroup(job, force ? 'SIGKILL' : 'SIGTERM');
    if (hadProc && !force) { const t = setTimeout(() => this._killGroup(job, 'SIGKILL'), 10_000); t.unref?.(); }
    if (!hadProc && job.kind === 'cron') { job.state = 'down'; }
    this._touch(job);
    this._save();
    return { ok: true, hadProc };
  }
  start(job) {
    if (this.readOnly) return { error: 'registry is read-only in this process' };
    job.desiredUp = true;
    job.supervise = { consecutiveFails: 0, parkedAt: null };
    if (job.kind === 'cron') {
      const vet = M.vetSpec(job); // B-f8c7: a cron spawns only at its next fire — reviving one the vet refuses answers NOW
      if (!vet.ok) { this._refuseRun(job, vet, 'manual'); return { error: vet.error }; }
      job.state = 'scheduled'; job.nextFireAt = M.nextFire(job.schedule, now()); this._touch(job); this._save(); return { ok: true }; }
    // a refusal names the job by ID (lane-redact verify r7): the panel toasts it and the device's toast history (the For-you
    // Notifications tab) keeps every toast — `<name> is already running` outlived the job's "Clear content…" there
    if (['up', 'starting'].includes(job.state)) return { error: `${job.id} is already running` }; // a live process is never re-judged into 'failed'
    try { this._spawn(job, 'manual'); } catch (e) { return { error: e.message }; } // B-f8c7: the run-time vet's refusal is an answer
    this._save();
    return { ok: true };
  }
  rm(job, { stop, orphan } = {}) {
    if (this.readOnly) return { error: 'registry is read-only in this process' };
    const alive = this._verifyAlive(this._readStamp(job));
    if (alive && !stop && !orphan) return { error: `${job.id} is still running — vibespace-job rm ${job.id} --stop (kill then remove), or --orphan to abandon the live process (tracked nowhere after that)` };
    if (alive && stop) this.stop(job, { force: false });
    if (alive && orphan) this.d.log(`[jobs] ${job.id} ORPHANED by request — live pid abandoned`);
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
    try { this.d.notifyUser({ text: `${job.name} needs your input`, urgency: 'normal', jobId: job.id, jobName: job.name, ownerCid: job.owner?.conversation?.id || null, kind: 'job-interact' }); } catch { }
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
  snapshot(job, { tail = 0 } = {}) {
    const run = job.runs && job.runs[job.runs.length - 1];
    const out = {
      id: job.id, kind: job.kind, name: job.name, note: job.note, state: job.state, publishedUrl: job.publishedUrl || null,
      desiredUp: job.desiredUp, progress: job.progress || null, ports: job.ports, publish: job.publish,
      schedule: job.schedule, nextFireAt: job.nextFireAt || null, context: job.context || null,
      owner: { createdBy: job.owner?.createdBy, groups: job.owner?.groupsSnapshot || [] },
      access: job.access, createdAt: job.createdAt, cronParent: job.cronParent || null,
      notify: job.notify || 'inherit', lastNotify: job.lastNotify || null, subscribersCount: (job.subscribers || []).length,
      notifyLog: (job.notifyLog || []).slice(-8),
      // full creation parameters (2.347.0, owner ask: agents must be able to
      // re-inspect what they registered) — env VALUES stay out (names only)
      cmd: job.cmd ? { argv: job.cmd.argv, cwd: job.cmd.cwd || null, envKeys: Object.keys(job.cmd.env || {}) } : null,
      envFrom: job.envFrom || [], restart: job.restart || null, timeoutMs: job.timeoutMs || null,
      // B-644d: a cron PARENT's fires run its embedded spawn-task, whose notifyOk the child inherits — the parent's own
      // field is never read (`vibespace-job run --at … --notify-ok` showed notifyOk=false for fires that notify)
      untilOutput: job.untilOutput || null, notifyUser: !!job.notifyUser, notifyOk: !!job.notifyOk || !!(job.action && job.action.type === 'spawn-task' && job.action.task && job.action.task.notifyOk),
      catchUp: job.catchUp || null, stopWithOwner: !!job.stopWithOwner, singleInstance: job.singleInstance !== false,
      run: run ? { startedAt: run.startedAt, endedAt: run.endedAt || null, exit: run.exit ?? null, cause: run.cause || null, trigger: run.trigger, lastLine: run.lastLine || '' } : null,
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
    const withAge = vis.map((j) => ({ ...j, ageHint: this._ageHint(j) }));
    return M.fitDigest(existingBytes, M.renderJobsDigest(withAge), { count: vis.length });
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

module.exports = { JobManager, ARCHIVE_CAP, ARCHIVE_SWEEP_MS };
