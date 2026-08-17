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
const { spawn, execFile } = require('child_process');
const M = require('./job-model.js');

function writeJsonAtomic(file, obj) {
  const tmp = file + '.tmp-' + process.pid;
  // _-prefixed keys are runtime-only (raw tokens, cursors) — never persisted
  fs.writeFileSync(tmp, JSON.stringify(obj, (k, v) => (k.startsWith('_') ? undefined : v), 1));
  fs.renameSync(tmp, file);
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

class JobManager {
  /** deps: { dataDir, broadcast(type,payload), notifyUser({text,urgency,jobId}), log } */
  constructor(deps) {
    this.d = deps;
    this.file = path.join(deps.dataDir, 'jobs.json');
    this.logsDir = path.join(deps.dataDir, 'job-logs');
    this.lockFile = path.join(deps.dataDir, 'jobs.lock');
    this.jobs = new Map();
    this.readOnly = false;
    this.ready = false;
    this.events = [];            // ring of {ts, jobId, name, what, verb} for injection
    this.waiters = new Map();    // jobId → [{resolve, timer}] (poll --wait)
    this.ansWaiters = new Map(); // jobId → [{resolve, timer}]
    this._timers = [];
    this._dirty = false;
  }

  // ── lifecycle ───────────────────────────────────────────────────────────
  init() {
    try {
      fs.mkdirSync(this.logsDir, { recursive: true });
      if (!this._takeLock()) {
        this.readOnly = true;
        this.d.log('[jobs] another engine holds the lock — READ-ONLY registry (no adopt/replay/cron)');
        this._load(); this.ready = true; return;
      }
      this._load();
      this._adoptAndReplay();
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
      const arr = JSON.parse(fs.readFileSync(this.file, 'utf-8'));
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
    try { writeJsonAtomic(this.file, [...this.jobs.values()]); this._dirty = false; } catch (e) { this.d.log('[jobs] save failed:', e.message); }
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
  _spawn(job, trigger) {
    const runTs = now();
    const ctl = this._ctlDir(job, runTs);
    fs.mkdirSync(ctl, { recursive: true });
    job.state = 'starting';
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
  async _ensurePublish(job) {
    try {
      const pf = this.d.getPorts && this.d.getPorts();
      if (!pf) return;
      const rec = await pf.forward('__local__', job.ports[0], { label: 'service: ' + job.name });
      job._pfId = rec && rec.id;
      try {
        const r = await pf.publish(job._pfId);
        job.publishedUrl = r && r.publicUrl || null;
      } catch (e) { this.d.log('[jobs] publish unavailable for', job.name, '—', e.message); job.publishedUrl = null; }
      this._touch(job);
    } catch (e) { this.d.log('[jobs] forward failed for', job.name, '—', e.message); }
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
          this.d.log(`[jobs] adopted ${job.id} (${job.name}) pid=${stamp.pid}`);
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
        try { this.d.notifyUser({ text: `Service ${job.name} crash-looped and was parked — vibespace-job start ${job.id} to retry`, urgency: 'normal', jobId: job.id }); } catch { }
      } else if (dec.restartInMs) {
        job.state = 'down'; this._touch(job);
        const t = setTimeout(() => { try { if (job.desiredUp && job.state === 'down') this._spawn(job, 'restart-policy'); } catch { } }, dec.restartInMs);
        t.unref?.();
      } else { job.state = 'down'; this._touch(job); }
    } else {
      job.state = run.cause === 'interrupted' ? 'interrupted' : run.cause.startsWith('ok') ? 'done' : 'failed';
      const routineCronOk = job.cronParent && job.state === 'done'; // quiet-success: a scheduled run ending fine is a ring entry, not an event
      this._touch(job, routineCronOk ? null : { what: `${job.state} exit=${run.exit ?? '—'} ${run.cause} (${Math.round((run.endedAt - run.startedAt) / 60000)}m)` });
      if (job.notifyUser) { try { this.d.notifyUser({ text: `Task ${job.name}: ${job.state} (${run.cause})`, urgency: job.state === 'failed' ? 'normal' : 'low', jobId: job.id }); } catch { } }
    }
  }

  // ── sweeps ──────────────────────────────────────────────────────────────
  async _sweep() {
    if (this.readOnly) return;
    for (const job of this.jobs.values()) {
      if (!['up', 'starting', 'awaiting-user'].includes(job.state)) continue;
      const run = job.runs && job.runs[job.runs.length - 1];
      const stamp = this._readStamp(job);
      if (stamp && job.state === 'starting') { job.state = 'up'; this._touch(job); }
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
          if (job.schedule.at) { job.state = 'missed'; this._touch(job, { what: 'missed its {at} time while the server was down' }); try { this.d.notifyUser({ text: `Scheduled job ${job.name} MISSED its time (server was down)`, urgency: 'high', jobId: job.id }); } catch { } continue; }
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
      try { this.d.notifyUser({ text: a.text || job.name, urgency: a.urgency || 'normal', jobId: job.id }); } catch { }
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
    if (job.kind === 'cron') { job.state = 'scheduled'; job.nextFireAt = M.nextFire(job.schedule, now()); this._touch(job); this._save(); return { ok: true }; }
    if (['up', 'starting'].includes(job.state)) return { error: `${job.name} is already running` };
    this._spawn(job, 'manual'); this._save();
    return { ok: true };
  }
  rm(job, { stop, orphan } = {}) {
    if (this.readOnly) return { error: 'registry is read-only in this process' };
    const alive = this._verifyAlive(this._readStamp(job));
    if (alive && !stop && !orphan) return { error: `${job.name} is still running — vibespace-job rm ${job.id} --stop (kill then remove), or --orphan to abandon the live process (tracked nowhere after that)` };
    if (alive && stop) this.stop(job, { force: false });
    if (alive && orphan) this.d.log(`[jobs] ${job.id} (${job.name}) ORPHANED by request — live pid abandoned`);
    this.jobs.delete(job.id); this._dirty = true; this._save();
    try { this.d.broadcast('jobs-updated', { id: job.id, removed: true }); } catch { }
    return { ok: true };
  }
  progress(job, text) { job.progress = String(text).slice(0, 300); this._touch(job); return { ok: true }; }
  ask(job, panel) {
    const v = M.validatePanel(panel);
    if (!v.ok) return { error: v.error };
    const version = ((job.interaction && job.interaction.pending && job.interaction.pending.version) || 0) + 1;
    job.interaction = job.interaction || { answers: [] };
    job.interaction.pending = { panel, version, postedAt: now(), timeoutS: panel.timeoutS || 1800 };
    if (job.kind === 'task' && ['up', 'starting'].includes(job.state)) job.state = 'awaiting-user';
    this._touch(job, { what: 'needs your input — open its panel', verb: 'answers' });
    try { this.d.notifyUser({ text: `${job.name} needs your input`, urgency: 'normal', jobId: job.id, kind: 'job-interact' }); } catch { }
    this._save();
    return { ok: true, version };
  }
  answerPanel(job, answers) { // user-side (routes verify user auth)
    const p = job.interaction && job.interaction.pending;
    if (!p) return { error: 'no pending panel' };
    if (answers.version && answers.version !== p.version) return { error: 'stale panel version — reopen the panel' };
    const v = M.validateAnswers(p.panel, answers);
    if (!v.ok) return { error: v.error };
    job.interaction.answers = job.interaction.answers || [];
    const rec = { ...answers, version: p.version, ts: now() };
    job.interaction.answers.push(rec);
    if (job.interaction.answers.length > 50) job.interaction.answers.splice(0, job.interaction.answers.length - 50);
    job.interaction.pending = null;
    if (job.state === 'awaiting-user') job.state = 'up';
    if (job.stdinOpen) { // mirror to the wrapper's answers tail file
      const run = job.runs && job.runs[job.runs.length - 1];
      if (run) { try { fs.appendFileSync(path.join(this._ctlDir(job, run.startedAt), 'answers.jsonl'), JSON.stringify(rec) + '\n'); } catch { } }
    }
    this._resolveAns(job);
    this._touch(job, { what: 'the user answered its panel', verb: 'answers' });
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
      run: run ? { startedAt: run.startedAt, endedAt: run.endedAt || null, exit: run.exit ?? null, cause: run.cause || null, trigger: run.trigger } : null,
      runsCount: (job.runs || []).length,
      pendingPanel: !!(job.interaction && job.interaction.pending),
      answers: (job.interaction && job.interaction.answers || []).slice(-5),
    };
    if (tail && run) {
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

module.exports = { JobManager };
