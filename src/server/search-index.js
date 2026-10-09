'use strict';
// THE SEARCH INDEX OWNER (lane global-search, .221) — ORCH. Starts the index
// worker lazily (src/search-index-worker.js: node:sqlite + every transcript
// parse on ITS thread), feeds it from three doors and answers the routes:
//   (1) THE BACKFILL — every conversation the sessions sweep (+ the remote
//       copies the hub already holds in data/remote-jsonl, never a fetch) knows,
//       one at a time, idle-paced (never in the first 60 s after boot, paused
//       while the loop lags), resumable by the worker's cursors;
//   (2) LIVE — session-stdout's feedLive (the ONE gate every stdout consumer —
//       stream-json, codex-events, acp-events — feeds the normalizer through)
//       calls noteLive(session); the session's new complete cards are appended,
//       fire-and-forget, through a bounded queue (dropped and SAID past 10 000);
//   (3) ARTIFACTS — the artifact registry's one writer (noteOp) and noteEdit
//       call noteArtifact(); the file is (re)read in the worker.
// Total-cost rules: a query never reads a transcript (the index answers whole);
// a backfill never blocks the loop (worker + yields); the index never lives on
// data/ or on a network mount (refused by name). HARNESS-NEUTRAL: no harness
// is named here — a conversation is {sid, backend, cwd, host} and the worker
// reads it through that backend's descriptor.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { Worker } = require('worker_threads');
const { trackWorker } = require('../worker-memory.js');
const M = require('../search-model.js');

const REASON = Object.freeze({ OFF: 'not-started', STARTING: 'starting', NO_SQLITE: 'no-node-sqlite', LOCKED: 'locked-by-another-server', WRITE_FAILED: 'write-failed',
  EXITED: 'worker-exited', CLOSED: 'closed', UNDER_DATA: 'index-under-data', NOT_LOCAL: 'not-local-disk' });
const NETWORK_FS = new Set([0x6969 /* nfs */, 0xff534d42 /* cifs */, 0xfe534d42 /* smb2 */, 0x65735546 /* fuse */, 0x517b /* smb */, 0x564c /* ncp */]);
const LIVE_QUEUE_MAX = 10000;

/** The index's directory: LOCAL disk, one per data/ REAL path (the usage index's rule). */
function indexDirFor(dataDir, homeDir = os.homedir()) {
  let real; try { real = fs.realpathSync(dataDir); } catch { real = path.resolve(dataDir); }
  const hash = crypto.createHash('sha256').update(real).digest('hex').slice(0, 16);
  return { dir: path.join(homeDir, '.vibespace', 'db', hash), real };
}

/** null = the directory may hold the index; else the refusal's NAME. */
function localDiskVerdict(dir, dataReal, { statfs = fs.statfsSync } = {}) {
  const parentOf = (d) => { let p = d; while (p && !fs.existsSync(p)) { const up = path.dirname(p); if (up === p) break; p = up; } try { return fs.realpathSync(p); } catch { return p; } };
  const real = parentOf(dir);
  const inside = (a, b) => a === b || a.startsWith(b.endsWith(path.sep) ? b : b + path.sep);
  if (dataReal && (inside(path.resolve(dir), dataReal) || inside(real, dataReal))) return REASON.UNDER_DATA;
  try { const st = statfs(real); if (NETWORK_FS.has(Number(st.type) >>> 0)) return REASON.NOT_LOCAL; } catch { }
  return null;
}

function create({ dataDir, homeDir = os.homedir(), workerFile = path.join(__dirname, '..', 'search-index-worker.js'), buffersDir = null,
  listConversations = async () => [], activeSessions = () => new Map(), log = console, heapMb = 1536, idleExitMs = 10 * 60 * 1000,
  bootDelayMs = 60 * 1000, backfillEveryMs = 30 * 60 * 1000, liveDebounceMs = 1500, closeBoundMs = 2000, exitHook = true, statfs, now = () => Date.now() } = {}) {
  let worker = null, dir = null, dataReal = null, st = 'off', reason = REASON.OFF, code = null, ready = null;
  let seq = 1, idleTimer = null, lastCallAt = 0, backfillTimer = null, walking = null;
  const calls = new Map();
  const ctl = new Int32Array(new SharedArrayBuffer(8));
  const counts = { appended: 0, dropped: 0, liveQueued: 0, artifacts: 0, walked: 0, failed: 0 };
  const progress = { done: 0, total: 0, running: false, startedAt: 0, finishedAt: 0, rows: 0, bytes: 0, ms: 0 };
  const names = new Map(); // `${host}|${sid}` → {name, backend, cwd} from the last listing
  let droppedSaidAt = 0;

  const setState = (s, r = null, extra = {}) => { st = s; reason = r; code = extra.code || null; };
  const onMessage = (m) => {
    if (m && m.ev === 'memory') return; // the memory census's answer (askMemory takes it)
    if (m && m.ev === 'state') {
      if (m.state === 'ready') { ready = m; setState('ready'); log.log?.(`[search-index] ready: ${m.rows} messages, ${m.artifacts} files, ${m.bytes} bytes (${dir})${m.rebuilt ? ' — rebuilt: ' + m.rebuilt : ''}`); }
      else if (m.state === 'disabled') { setState('disabled', m.reason, { code: m.code }); log.log?.(`[search-index] off — ${m.reason}${m.code ? ' (' + m.code + ')' : ''}${m.detail ? ': ' + m.detail : ''}`); }
      return;
    }
    const c = calls.get(m && m.id);
    if (!c) return;
    calls.delete(m.id);
    if (m.ok) c.resolve(m.result);
    else c.reject(Object.assign(new Error(m.error?.message || 'search index error'), { status: 503, reason: m.error?.reason || 'error', code: m.error?.code }));
  };
  function onExit() {
    if (closeSync() !== 'timed-out') return;
    try { log.error?.(`[search-index] the index worker did not close within ${closeBoundMs} ms — exiting without it`); } catch { }
    process.removeAllListeners('SIGTERM');
    process.kill(process.pid, 'SIGTERM');
  }
  function armIdle() {
    lastCallAt = now();
    if (idleTimer || !idleExitMs) return;
    const tick = () => {
      idleTimer = null;
      if (!worker) return;
      if (calls.size || walking || now() - lastCallAt < idleExitMs) { idleTimer = setTimeout(tick, Math.max(1000, idleExitMs - (now() - lastCallAt))); idleTimer.unref?.(); return; }
      log.log?.(`[search-index] idle ${Math.round(idleExitMs / 60000)} min — the worker exits (it starts again on the next need)`);
      close().catch(() => { });
    };
    idleTimer = setTimeout(tick, idleExitMs); idleTimer.unref?.();
  }

  /** Start the worker (once per need) — refuses data/ and network mounts by name. */
  function start() {
    if (worker || st === 'closed') return api;
    const where = indexDirFor(dataDir, homeDir);
    dir = where.dir; dataReal = where.real;
    const refuse = localDiskVerdict(dir, dataReal, statfs ? { statfs } : {});
    if (refuse) { if (reason !== refuse) log.log?.(`[search-index] off — ${refuse}: ${dir} (the index lives on local disk, never beside data/)`); setState('disabled', refuse); return api; }
    setState('starting', REASON.STARTING);
    try {
      worker = new Worker(workerFile, { workerData: { dbDir: dir, dataReal, buffersDir, ctl: ctl.buffer }, ...(heapMb > 0 ? { resourceLimits: { maxOldGenerationSizeMb: heapMb, maxYoungGenerationSizeMb: 32 } } : {}) });
    } catch (e) { worker = null; setState('disabled', REASON.EXITED, { code: e.code }); return api; }
    Atomics.store(ctl, 0, 0); Atomics.store(ctl, 1, 0);
    trackWorker('search-index', worker); // the memory census (src/worker-memory.js)
    worker.unref();
    worker.on('message', onMessage);
    worker.on('error', (e) => { log.error?.('[search-index] worker error:', e && e.message); });
    worker.on('exit', () => {
      worker = null;
      for (const [id, c] of calls) { calls.delete(id); c.reject(Object.assign(new Error('search index worker exited'), { status: 503, reason: REASON.EXITED })); }
      if (st !== 'closed' && st !== 'idle') setState(st === 'disabled' ? 'disabled' : 'off', st === 'disabled' ? reason : REASON.EXITED, { code });
    });
    if (exitHook) process.on('exit', onExit);
    armIdle();
    return api;
  }

  function call(op, payload, { timeoutMs = 0 } = {}) {
    if (!worker && st !== 'closed' && st !== 'disabled') start();
    return new Promise((resolve, reject) => {
      if (!worker) return reject(Object.assign(new Error(`search index unavailable: ${reason}`), { status: 503, reason }));
      const id = seq++;
      const c = { resolve, reject };
      if (timeoutMs > 0) { const t = setTimeout(() => { if (calls.delete(id)) reject(Object.assign(new Error('the search index did not answer in time'), { status: 503, reason: 'unresponsive' })); }, timeoutMs); t.unref?.(); }
      calls.set(id, c);
      armIdle();
      worker.postMessage({ id, op, payload });
    });
  }

  // ── (2) LIVE ──
  const liveTimers = new Map();
  let liveQueued = 0;
  const sidOf = (s) => (s && (s.backendSessionId || s.claudeSessionId)) || null;
  /** Called by session-stdout's feedLive gate for every live record: the
   *  session's NEW complete cards go to the index ~1.5 s later. Never throws. */
  function noteLive(session) {
    try {
      if (!session || !session._normalizer || liveTimers.has(session)) return;
      const t = setTimeout(() => { liveTimers.delete(session); flushLive(session); }, liveDebounceMs);
      t.unref?.();
      liveTimers.set(session, t);
    } catch { }
  }
  function flushLive(session) {
    try {
      const mm = session._normalizer, sid = sidOf(session);
      if (!mm || !sid || st === 'disabled' || st === 'closed') return;
      const epoch = session._normEpoch || 0;
      let cur = session._searchIx;
      if (!cur || cur.epoch !== epoch || cur.mm !== mm) cur = session._searchIx = { epoch, mm, from: 0, sent: new Set() };
      const msgs = mm.messages || [];
      const out = [];
      let firstOpen = -1;
      for (let i = cur.from; i < msgs.length; i++) {
        const m = msgs[i];
        if (m.status && m.status !== 'complete') { if (firstOpen < 0) firstOpen = i; continue; }
        if (cur.sent.has(m.id)) continue;
        const body = M.textOf(m);
        if (body) out.push({ mid: m.id, ts: m.ts, role: m.role, content: [{ type: 'text', text: body }] });
        cur.sent.add(m.id);
      }
      cur.from = firstOpen >= 0 ? firstOpen : msgs.length;
      if (!out.length) return;
      if (liveQueued + out.length > LIVE_QUEUE_MAX) {
        counts.dropped += out.length;
        for (const m of out) cur.sent.delete(m.mid);
        if (now() - droppedSaidAt > 60000) { droppedSaidAt = now(); log.warn?.(`[search-index] live queue full (${LIVE_QUEUE_MAX}) — ${counts.dropped} message(s) dropped so far; the next backfill reads them from the transcript`); }
        return;
      }
      liveQueued += out.length; counts.liveQueued = liveQueued;
      call('appendMessages', { sid, host: session.host || '', backend: session.backend || null, msgs: out })
        .then((r) => { counts.appended += (r && r.rows) || 0; }, () => { for (const m of out) cur.sent.delete(m.mid); })
        .finally(() => { liveQueued -= out.length; counts.liveQueued = liveQueued; });
    } catch { }
  }

  // ── (3) ARTIFACTS ──
  function noteArtifact({ sessionId = null, host = '', path: p } = {}) {
    try {
      if (typeof p !== 'string' || !p.startsWith('/') || st === 'disabled' || st === 'closed') return;
      counts.artifacts++;
      call('indexArtifact', { sessionId, host: host || '', path: p }).catch(() => { });
    } catch { }
  }

  // ── (1) THE BACKFILL ──
  const lagMs = () => new Promise((r) => { const t0 = performance.now(); setImmediate(() => r(performance.now() - t0)); });
  const sleep = (ms) => new Promise((r) => { const t = setTimeout(r, ms); t.unref?.(); });
  async function backfill({ reason: why = 'tick' } = {}) {
    if (walking) return walking;
    walking = (async () => {
      const t0 = now();
      Object.assign(progress, { running: true, startedAt: t0, done: 0, total: 0, rows: 0, bytes: 0 });
      let list = [];
      try { list = (await listConversations()) || []; } catch (e) { log.warn?.(`[search-index] backfill: the conversation list failed: ${e.message}`); }
      const live = new Set();
      try { for (const s of activeSessions().values()) { const sid = sidOf(s); if (sid) live.add((s.host || '') + '|' + sid); } } catch { }
      progress.total = list.length;
      for (const c of list) {
        if (st === 'closed' || st === 'disabled') break;
        const key = (c.host || '') + '|' + c.sid;
        names.set(key, { name: c.name || null, backend: c.backend, cwd: c.cwd || '' });
        try {
          const r = await call('indexConversation', { sid: c.sid, host: c.host || '', backend: c.backend, cwd: c.cwd || '', live: live.has(key) });
          if (r && r.parsed) { counts.walked++; progress.rows += r.rows || 0; progress.bytes += r.bytes || 0; }
        } catch (e) { counts.failed++; if (e.reason === REASON.EXITED) { await sleep(1000); } }
        progress.done++;
        // idle pacing: yield every conversation, back off while the loop lags
        for (let i = 0; i < 20 && (await lagMs()) > 50; i++) await sleep(250);
      }
      try { await call('sweepArtifacts', {}); await call('noteBuild', { at: now() }); } catch { }
      Object.assign(progress, { running: false, finishedAt: now(), ms: now() - t0 });
      log.log?.(`[search-index] backfill (${why}): ${progress.done} of ${progress.total} conversations, ${progress.rows} new messages, ${Math.round(progress.bytes / 1048576)} MB read in ${progress.ms} ms`);
    })().finally(() => { walking = null; });
    return walking;
  }
  function schedule() {
    if (backfillTimer) return api;
    const run = () => { backfillTimer = setTimeout(run, backfillEveryMs); backfillTimer.unref?.(); backfill().catch(() => { }); };
    backfillTimer = setTimeout(run, bootDelayMs); backfillTimer.unref?.();
    return api;
  }

  // ── READS ──
  async function search({ q, scope = 'all', limit = 20, offset = 0 } = {}) {
    const sc = ['all', 'chats', 'artifacts'].includes(scope) ? scope : 'all';
    const r = await call('search', { q: String(q || '').slice(0, 500), scope: sc, limit, offset }, { timeoutMs: 15000 });
    for (const h of r.hits) { const n = names.get((h.host || '') + '|' + (h.kind === 'artifact' ? h.sessionId : h.sid)); h.name = (n && n.name) || null; if (h.kind === 'message' && n) h.cwd = n.cwd; }
    return r;
  }
  async function status() {
    const base = { state: st, reason, code, dir, backfill: { ...progress }, live: { ...counts } };
    if (st !== 'ready' && st !== 'starting' && worker == null && st !== 'off') return base;
    try { return { ...base, index: await call('status', {}, { timeoutMs: 15000 }), state: st }; } catch { return base; }
  }
  async function rebuild() {
    await call('drop', {});
    names.clear();
    backfill({ reason: 'rebuild' }).catch(() => { });
    return { ok: true, rebuilding: true };
  }
  async function forget({ sid, host = '' } = {}) { return call('clearConversation', { sid, host }); }

  function closeSync(boundMs = closeBoundMs) {
    if (!worker) return 'none';
    Atomics.store(ctl, 1, 1);
    try { worker.postMessage({ id: 0, op: 'close' }); } catch { return 'none'; }
    return Atomics.wait(ctl, 0, 0, boundMs) === 'timed-out' ? 'timed-out' : 'closed';
  }
  /** Close the worker (idle exit, a suite): `final` = never start again. */
  async function close({ final = false } = {}) {
    if (exitHook) process.removeListener('exit', onExit);
    clearTimeout(idleTimer); idleTimer = null;
    if (final) { clearTimeout(backfillTimer); setState('closed', REASON.CLOSED); }
    const w = worker;
    const r = closeSync();
    if (w) { try { await w.terminate(); } catch { } }
    if (!final && st !== 'disabled') setState('off', REASON.OFF);
    return r;
  }

  const api = { start, schedule, backfill, noteLive, noteArtifact, search, status, rebuild, forget, close, call, stats: () => ({ state: st, reason, code, dir, ready, ...counts, backfill: { ...progress } }), get dir() { return dir; } };
  return api;
}

// ── THE ROUTES (cookie-only: an agent's session / job token is refused — reach
// across conversations is msg-acl's business, not an agent search) ──
const isAgentBearer = (req) => /^Bearer\s+(vsst_|jbt_)/i.test(String((req.headers && req.headers.authorization) || ''));
function mount(app, ix) {
  const deny = (req, res) => { if (!isAgentBearer(req)) return false; res.status(403).json({ error: 'search is the owner\'s — an agent token cannot search every conversation', code: 'agent_forbidden' }); return true; };
  app.get('/api/search', async (req, res) => {
    if (deny(req, res)) return;
    const t0 = Date.now();
    try {
      const q = String(req.query.q || '');
      const r = await ix.search({ q, scope: req.query.scope, limit: Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20)), offset: Math.max(0, parseInt(req.query.offset, 10) || 0) });
      const s = ix.stats();
      res.json({ hits: r.hits, groups: r.groups, total: r.total, took: Date.now() - t0, empty: r.empty || null, index: { state: s.state, backfill: s.backfill } });
    } catch (e) { res.status(e.status || 500).json({ error: e.message, reason: e.reason || null, hits: [], total: 0 }); }
  });
  app.get('/api/search/status', async (req, res) => {
    if (deny(req, res)) return;
    try { res.json(await ix.status()); } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/search/rebuild', async (req, res) => {
    if (deny(req, res)) return;
    try { res.json(await ix.rebuild()); } catch (e) { res.status(e.status || 500).json({ error: e.message, reason: e.reason || null }); }
  });
  return ix;
}

// ── server.js's ONE line: the conversations to walk = the sessions sweep (every
// registered harness's store.discover) + the remote copies the hub holds ──
let wired = null;
function wire({ app, rootDir, activeSessions, buffersDir, log = console }) {
  const dataDir = path.join(rootDir, 'data');
  const listConversations = async () => {
    const out = [], seen = new Set();
    const add = (c) => { const k = (c.host || '') + '|' + c.sid; if (c.sid && c.backend && !seen.has(k)) { seen.add(k); out.push(c); } };
    try {
      const r = await require('../routes/sessions').warmSessions();
      for (const e of (r && r.sessions) || []) add({ sid: e.backendSessionId || e.sessionId, backend: e.backend, cwd: e.cwd || e.projectPath || '', host: e.host || '', name: e.name || e.title || e.summary || null });
    } catch { }
    try {
      const ci = JSON.parse(fs.readFileSync(path.join(dataDir, 'conversation-index.json'), 'utf-8'));
      for (const [sid, c] of Object.entries((ci && ci.conv) || {})) for (const [host, h] of Object.entries(c.hosts || {})) {
        if (h && h.backend && fs.existsSync(path.join(dataDir, 'remote-jsonl', host, sid + '.jsonl'))) add({ sid, backend: h.backend, cwd: h.cwd || '', host, name: null });
      }
    } catch { }
    return out;
  };
  wired = create({ dataDir, buffersDir, activeSessions: () => activeSessions, listConversations, log });
  mount(app, wired);
  wired.schedule();
  return wired;
}
const get = () => wired;
const use = (ix) => { wired = ix; return ix; }; // a suite points the live / artifact doors at its own index
// the live gate + the artifact registry call these; both are no-ops before wire()
const noteLive = (session) => { if (wired) wired.noteLive(session); };
const noteArtifact = (a) => { if (wired) wired.noteArtifact(a); };

module.exports = { create, mount, wire, get, use, noteLive, noteArtifact, indexDirFor, localDiskVerdict, REASON, LIVE_QUEUE_MAX };
