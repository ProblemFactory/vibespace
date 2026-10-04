'use strict';
// EXIT ROUTES + REMOTE-FS SINGLETONS (decomposition #10): the vibespace-exit
// agent routes (on-demand egress via a machine's SOCKS/run), the machine's
// "Who can use it" (lane-pairing ⑥: two lists, the ask answer, the audit),
// plus the RemoteFs and ssh-key singletons that were declared alongside them.
// ORCH tier.
const fs = require('fs');
const path = require('path');
const { sameToken } = require('../pairing-token.js'); // B-8dda
const { spawn } = require('child_process');

const { mk } = require('./lazy.js');

function create({ app, rootDir, AGENT_BIN_DIR, activeSessions, auth, wss, WS_OPEN,
  bcastAll, integrationEnabled, unpairDialDevice, hosts,
  getExitProxy, getMounts, getPortForwards, getTasks = null }) {
  const exitProxy = mk(getExitProxy);
  const mounts = mk(getMounts);
  const portForwards = mk(getPortForwards);
// ── EXIT ROUTES (lane-pairing ⑥): the agent's vibespace-exit (vsst_ — a live conversation only) and the user's
// "Who can use it" (cookie). Thin: every decision is PURE src/exit-reach.js through the ExitProxyManager. ──
const E = require('../exit-reach.js');
const bearerOf = (req) => String((req.headers && req.headers.authorization) || '').replace(/^Bearer\s+/i, '') || String((req.body && req.body.token) || '');
const isAnyBearer = (req) => /^Bearer\s+\S/i.test(String((req.headers && req.headers.authorization) || '')) || typeof (req.body && req.body.token) === 'string';
/** The live conversation behind a vsst_ token → [webuiId, session] | null. */
function exitAgentEntry(req) {
  const token = bearerOf(req);
  if (!token || !token.startsWith('vsst_')) return null;
  for (const [id, s] of activeSessions) if (sameToken(token, s.agentToken)) return [id, s];
  return null;
}
function exitAgentSession(req) { const e = exitAgentEntry(req); return e ? e[1] : null; }
/** vsst_ only: a Background Work job token (jbt_) is refused BY NAME — a job's owner lineage never inherits an exit. */
function agentOr401(req, res) {
  const token = bearerOf(req);
  if (token.startsWith('jbt_')) { res.status(401).json({ error: E.refusalText('session_token_required'), code: 'session_token_required' }); return null; }
  const e = exitAgentEntry(req);
  if (!e) { res.status(401).json({ error: 'missing or unknown session token', code: 'session_token_required' }); return null; }
  return e;
}
const STATUS = { not_granted: 403, ask_denied: 403, ask_changed: 409, ask_expired: 403, ask_unfiled: 409, groups_unreadable: 409, fork_pending: 409, ask_pending: 409, no_machine: 404, no_exits: 404, ambiguous: 400, offline: 503, run_failed: 502, spawn_failed: 502, bad_command: 400, unknown_shape: 409, conversation_gone: 410, remote_session: 409,
  // lane exit-transfer: pull / push refusals
  too_big: 413, not_a_file: 409, local_path_refused: 403, exists: 409, hash_mismatch: 502, transfer_failed: 502, bad_path: 400, target_busy: 409 };
// lane-exit-run-output E2: a spawn failure's answer carries the error, the interpreter, the platform and the shell's exit code (the CLI exits by it)
const agentFail = (res, e) => res.status(STATUS[e && e.code] || 400).json({ error: (e && e.message) || 'failed', code: (e && e.code) || 'failed', ...(e && e.grant ? { grant: e.grant } : {}), ...(e && e.has ? { has: e.has } : {}), ...(e && e.spawnError ? { spawnError: e.spawnError, interpreter: e.interpreter || null, platform: e.platform || null, exitCode: e.exitCode } : {}) });
app.get('/api/agent/exit', (req, res) => {
  const e = agentOr401(req, res); if (!e) return;
  res.json({ exits: exitProxy.listFor(e[1], e[0]) });
});
app.post('/api/agent/exit/use', async (req, res) => {
  const e = agentOr401(req, res); if (!e) return;
  try { res.json(await exitProxy.use(e[1], e[0], (req.body || {}).machine)); }
  catch (err) { agentFail(res, err); }
});
// RUN a command natively ON the exit machine (the universal fallback for ICMP/UDP/proxy-unaware tools + that
// machine's own DNS) — bounded by the daemon's 30 s cap (EXIT_RUN_TIMEOUT_MS), possibly waiting ≤ 60 s for the
// user's Allow first ("ask me each time").
// lane-exit-run-output E4: THIS conversation's own runs (never another's) — the agent's `vibespace-exit runs`
app.get('/api/agent/exit/runs', (req, res) => {
  const e = agentOr401(req, res); if (!e) return;
  try { res.json({ runs: exitProxy.runsFor(e[1], e[0], { machine: req.query.machine ? String(req.query.machine) : null, limit: Number(req.query.limit) || undefined }) }); }
  catch (err) { agentFail(res, err); }
});
app.post('/api/agent/exit/run', async (req, res) => {
  const e = agentOr401(req, res); if (!e) return;
  const { machine, cmd } = req.body || {};
  // verify-r2 ask-a: the CLI's call ending (its process gone, its own timeout, the conversation killed) settles a
  // waiting ask — the answer would reach nobody and the command must not run for nobody
  const ac = new AbortController();
  res.on('close', () => { if (!res.writableFinished) ac.abort(); });
  try { res.json(await exitProxy.run(e[1], e[0], machine, cmd, { signal: ac.signal })); }
  catch (err) { agentFail(res, err); }
});
// lane exit-transfer (design 013 B): ONE file between this machine and a paired one, under the `run` grant, through the
// device's own file ops — never a shell, no 30 s cap (a transfer is not a run). PULL: the answer comes once the file landed
// on this machine's disk (the project / tmp / ~/Downloads fence is the manager's). The CLI's call ending gives up the ask
// and stops the transfer between windows (nothing is kept).
app.post('/api/agent/exit/pull', async (req, res) => {
  const e = agentOr401(req, res); if (!e) return;
  const { machine, remote, local, overwrite } = req.body || {};
  const ac = new AbortController();
  res.on('close', () => { if (!res.writableFinished) ac.abort(); });
  try { res.json(await exitProxy.pull(e[1], e[0], machine, { remote, local, overwrite: overwrite === true, signal: ac.signal })); }
  catch (err) { agentFail(res, err); }
});
// PUSH: the request BODY is the file (application/octet-stream — the agent's own process reads it; the hub never opens a
// local path on an agent's behalf), the names ride the query. A refusal before the first byte is read answers at once and
// closes the connection (the CLI stops sending on the answer).
app.post('/api/agent/exit/push', async (req, res) => {
  const e = agentOr401(req, res); if (!e) return;
  const q = req.query || {};
  const ac = new AbortController();
  res.on('close', () => { if (!res.writableFinished) ac.abort(); });
  try {
    res.json(await exitProxy.push(e[1], e[0], q.machine ? String(q.machine) : undefined, { remote: String(q.remote || ''), local: String(q.local || ''), size: Number(q.size), overwrite: q.overwrite === '1', source: req, signal: ac.signal }));
  } catch (err) { agentFail(res, err); try { if (!req.readableEnded) req.resume(); } catch { } } // the unread rest is drained; the CLI stops on the answer
});
// ── the user's side (cookie) ──
const COOKIE_STATUS = { 'not-found': 404, list_changed: 409, bad_mode: 400, bad_grant: 400, bad_principal: 400, empty_list: 400, too_many: 400, 'session-gone': 410, human_only: 403, ask_unknown: 404, ask_settled: 409, ask_changed: 409, ask_expired: 410, conversation_gone: 410 };
const cookieFail = (res, e) => res.status(COOKIE_STATUS[e && e.code] || 400).json({ error: (e && e.message) || 'failed', code: (e && e.code) || 'failed', ...(e && e.added ? { added: e.added, removed: e.removed } : {}), ...(e && e.grant ? { grant: e.grant } : {}) });
app.get('/api/exits', (req, res) => res.json({ exits: exitProxy.list() }));
app.post('/api/hosts/:id/allow-exit', (req, res) => res.status(410).json({ error: 'use PATCH /api/hosts/:id/exit-access — exit access is two lists now', code: 'retired' }));
/** The live roster principalsNow reads names from (the sidebar's sessions + the Task Groups). */
const rosterNow = () => {
  const sessions = [];
  for (const [id, s] of activeSessions) sessions.push({ id, name: s.name || s.webuiName || '', backend: s.backend || 'claude', backendSessionId: s.backendSessionId || null, claudeSessionId: s.claudeSessionId || null });
  let groups = [];
  try { groups = (getTasks?.()?.list?.() || []).map((g) => ({ id: g.id, title: g.title, name: g.name, archived: !!g.archived })); } catch { groups = []; }
  return { sessions, groups };
};
app.get('/api/hosts/:id/exit-access', (req, res) => {
  if (isAnyBearer(req)) return res.status(403).json({ error: 'the user decides who can use a machine — an agent token may not read or change it', code: 'human_only' });
  try { res.json(exitProxy.view(req.params.id, { roster: rosterNow() })); }
  catch (e) { cookieFail(res, e); }
});
app.patch('/api/hosts/:id/exit-access', async (req, res) => {
  if (isAnyBearer(req)) return res.status(403).json({ error: 'the user decides who can use a machine — an agent token may not read or change it', code: 'human_only' });
  const b = req.body && typeof req.body === 'object' ? { ...req.body } : req.body;
  // a row picked LIVE names the session by its webui id ({kind:'session', session:'<id>'}): resolved HERE to its
  // durable key through addressableId (a pending fork ⇒ its `webui:<id>` key, said in `resolved`) — never trusted
  const resolved = [];
  try {
    for (const g of ['use', 'run']) {
      if (!b || !b[g] || !Array.isArray(b[g].who)) continue;
      b[g] = { ...b[g], who: b[g].who.map((row) => {
        if (!row || row.kind !== 'session' || typeof row.session !== 'string') return row;
        const s = activeSessions.get(row.session);
        if (!s) throw Object.assign(new Error(`"${String(row.name || row.session).slice(0, 60)}" is not running any more — pick it again when it is`), { code: 'session-gone' });
        const key = exitProxy.keyOf(s, row.session);
        resolved.push({ session: row.session, key, forkPending: key.startsWith('webui:') && !!(s.claudeSessionId || s.backendSessionId) });
        return { kind: 'session', id: key };
      }) };
    }
    const out = await exitProxy.setAccess(req.params.id, b, { by: 'user' });
    res.json({ ...out, resolved });
  } catch (e) { cookieFail(res, e); }
});
// lane-exit-run-output E4: THE OWNER's command history of one machine (the "Commands…" dialog) — cookie only, every
// conversation's runs there with their output heads; an agent token is refused by name (never another conversation's)
app.get('/api/hosts/:id/exit-runs', (req, res) => {
  if (isAnyBearer(req)) return res.status(403).json({ error: 'the machine\'s command history is the user\'s — an agent sees only its own (vibespace-exit runs)', code: 'human_only' });
  let h = null;
  try { h = hosts.get(req.params.id); } catch { }
  if (!h) return res.status(404).json({ error: 'no such machine', code: 'not-found' });
  const platform = h.dial && h.dial.lastAccept && typeof h.dial.lastAccept.platform === 'string' ? h.dial.lastAccept.platform : null;
  res.json({ machine: { id: h.id, name: h.name || h.id, platform, interpreter: platform ? E.interpreterOf(platform) : null }, runs: exitProxy.runsOf(h.id, { limit: Number(req.query.limit) || undefined }) });
});
app.get('/api/exits/audit', (req, res) => {
  if (isAnyBearer(req)) return res.status(403).json({ error: 'the exit audit is the user\'s', code: 'human_only' });
  res.json({ lines: exitProxy.auditTail({ hostId: req.query.host ? String(req.query.host) : null, limit: Number(req.query.limit) || 50 }) });
});
app.get('/api/exits/asks', (req, res) => {
  if (isAnyBearer(req)) return res.status(403).json({ error: 'only the user answers these', code: 'human_only' });
  res.json({ asks: exitProxy.listAsks() });
});
// "ask me each time" — a PERSON's answer. Cookie ONLY: any bearer (vsst_ / jbt_) is refused human_only — an agent
// never approves its own command.
app.post('/api/exits/asks/:askId', (req, res) => {
  if (isAnyBearer(req)) return res.status(403).json({ error: 'only the user answers this — an agent cannot approve its own command', code: 'human_only' });
  try { res.json(exitProxy.answerAsk(req.params.askId, { answer: (req.body || {}).answer, by: 'user' })); }
  catch (e) { cookieFail(res, e); }
});
setTimeout(() => { try { hosts.sweepJsonlCache(); } catch {} }, 60000); // orphaned/stale remote-transcript cache
const sshKey = require('../ssh-key'); // passphrase-protected private-key import
const { RemoteFs } = require('../remote-fs');
const remoteFs = new RemoteFs(hosts);
app.get('/api/hosts', (req, res) => {
  const k = hosts.keyInfo();
  res.json({ hosts: hosts.list(), key: { exists: k.exists, path: k.path, publicKey: k.publicKey } });
});
app.post('/api/hosts', async (req, res) => {
  // A pasted key may be passphrase-protected: unlock it HERE (ssh-keygen -p,
  // src/ssh-key.js) and hand hosts.add() plaintext — add() must stay sync.
  // The passphrase is used for that one exec and is never stored, logged, or
  // put in argv; it exists only in this request body and the child's env.
  const b = { ...(req.body || {}) };
  try {
    let key = null;
    if (b.privateKey && String(b.privateKey).trim()) {
      key = await sshKey.prepareImportedKey(b.privateKey, b.keyPassphrase);
      b.privateKey = key.body;
    }
    delete b.keyPassphrase; // consumed here and nowhere else
    const id = hosts.add(b);
    bcastAll({ type: 'hosts-updated' });
    res.json({ success: true, id, key: key && { type: key.type, fingerprint: key.fingerprint, wasEncrypted: key.wasEncrypted } });
  } catch (e) {
    // `code` drives the client's localized message (server prose is for logs
    // and non-browser callers)
    res.status(400).json({ error: e.message, code: e.code });
  }
});
app.post('/api/hosts/key', async (req, res) => {
  try { res.json({ success: true, key: await hosts.generateKey() }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/hosts/:id/test', async (req, res) => {
  try { res.json({ success: true, ...(await hosts.test(req.params.id)) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/hosts/:id/sessions', async (req, res) => {
  try { res.json({ sessions: await hosts.discoverSessions(req.params.id, req.query.fresh ? { ttlMs: 0 } : {}) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.delete('/api/hosts/:id', async (req, res) => {
  try {
    const h = hosts.get(req.params.id);
    // dial machine: removing the record IS the unpair (token hash lives on
    // it) — tear down mounts / token file / live stream first (B-f3e8).
    // ssh machines keep the OLD preserve-as-orphan semantics (review finding:
    // remove+re-add is the only way to edit a host's address/key, and the
    // confirm dialog promises nothing on the remote is touched — the orphan
    // rows remain manageable/unmountable).
    if (h.transport === 'dial') await unpairDialDevice(h.deviceId);
    // port-forwards are pure local plumbing (unlike mounts, which keep their
    // preserve-as-orphan semantics for ssh) — with the host record gone their
    // records become invisible, undeletable orphans (review finding)
    else { try { portForwards.onMachineUnpaired(h.id); } catch { } }
    try { exitProxy.onMachineUnpaired(h.id); } catch { }
    hosts.remove(req.params.id);
    bcastAll({ type: 'hosts-updated' });
    res.json({ success: true });
  }
  catch (e) { res.status(400).json({ error: e.message }); }
});
// Bootstrap: progress streams to ALL clients over WS (host-bootstrap events);
// the HTTP response returns when the run completes.
app.post('/api/hosts/:id/bootstrap', async (req, res) => {
  const bcast = (msg) => {
    const json = JSON.stringify(msg);
    wss.clients.forEach(c => { if (c.readyState === WS_OPEN) { try { c.send(json); } catch {} } });
  };
  try {
    // NOTE: spread ev FIRST — its own `type` ('step'/'log'/'done') must not
    // clobber the outer message type the client filters on. `kind` carries
    // the event type instead.
    const steps = await hosts.bootstrap(req.params.id, (ev) => bcast({ ...ev, kind: ev.type, type: 'host-bootstrap', hostId: req.params.id }));
    res.json({ success: Object.values(steps).every(s => s === 'ok'), steps });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/hosts/bootstrap-steps', (req, res) => res.json({ steps: hosts.bootstrapSteps() }));
// Remote directory autocomplete (New Session dialog when a host is chosen) —
// mirrors /api/dir-complete but runs ls over ssh on the target.
app.get('/api/hosts/:id/dir-complete', async (req, res) => {
  try { res.json({ suggestions: await hosts.dirComplete(req.params.id, req.query.path || '') }); }
  catch { res.json({ suggestions: [] }); }
});
// Recent working dirs seen on the host (from its Claude project dirs) — the
// "path list" the New Session dialog offers as chips for a remote host.
// Backend (CLI) status on a host — Manage Agents dialog when a host is chosen.
app.get('/api/hosts/:id/backend-status', async (req, res) => {
  try { res.json(await hosts.backendStatus(req.params.id)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
// VibeSpace integration on a host (2.129.0, backlog B-34bb): the ~/.vibespace
// footprint remote sessions leave there — per-tool presence compared against
// the LOCAL copies by sha256 (`current`), remote hook registration, node
// availability, keeper session files — plus explicit install/refresh + remove.
// (A future remote session spawn re-installs by design; the UI says so.)
app.get('/api/hosts/:id/agent-tools', async (req, res) => {
  try {
    const st = await hosts.agentToolsStatus(req.params.id);
    const toolDir = AGENT_BIN_DIR;
    const crypto = require('crypto');
    for (const [n, t] of Object.entries(st.tools)) {
      let local = null;
      try { local = crypto.createHash('sha256').update(fs.readFileSync(path.join(toolDir, n))).digest('hex'); } catch { }
      t.current = !!(t.present && local && t.sha256 === local);
      delete t.sha256;
    }
    res.json(st);
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/hosts/:id/agent-tools/install', async (req, res) => {
  // Same master-switch guard as the local /api/agent-hooks/install — the
  // remote twin must not silently contradict a pristine-CLI state either.
  if (!integrationEnabled()) return res.status(400).json({ error: 'VibeSpace integration is disabled (Settings → Integration → master switch). Enable it first.' });
  try { res.json({ success: true, ...(await hosts.installAgentTools(req.params.id, AGENT_BIN_DIR)) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/hosts/:id/agent-tools/uninstall', async (req, res) => {
  try { res.json({ success: true, ...(await hosts.uninstallAgentTools(req.params.id)) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/hosts/:id/recent-cwds', async (req, res) => {
  try {
    const sessions = await hosts.discoverSessions(req.params.id);
    const seen = [];
    for (const s of sessions) { if (s.cwd && !seen.includes(s.cwd)) seen.push(s.cwd); if (seen.length >= 8) break; }
    res.json({ cwds: seen });
  } catch { res.json({ cwds: [] }); }
});

  return { exitAgentSession, remoteFs, sshKey };
}
module.exports = { create };
