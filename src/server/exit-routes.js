'use strict';
// EXIT ROUTES + REMOTE-FS SINGLETONS (decomposition #10): the vibespace-exit
// agent routes (on-demand egress via a machine's SOCKS/run), the machine
// allow-exit toggle, plus the RemoteFs and ssh-key singletons that were
// declared alongside them. Extracted VERBATIM. ORCH tier.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function create({ app, rootDir, AGENT_BIN_DIR, activeSessions, auth, wss, WS_OPEN,
  bcastAll, integrationEnabled, unpairDialDevice, hosts,
  getExitProxy, getMounts, getPortForwards }) {
  const mk = (get) => new Proxy({}, { get: (_, k) => { const o = get(); if (!o) return undefined; const v = o[k]; return typeof v === 'function' ? v.bind(o) : v; } });
  const exitProxy = mk(getExitProxy);
  const mounts = mk(getMounts);
  const portForwards = mk(getPortForwards);
// ── AGENT-facing exit routes (vsst_ token; exempt from cookie auth in
// auth.middleware). The agent's `vibespace-exit` CLI hits these. ──
function exitAgentSession(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.body?.token;
  if (!token || !token.startsWith('vsst_')) return null;
  for (const [, s] of activeSessions) if (s.agentToken === token) return s;
  return null;
}
app.get('/api/agent/exit', (req, res) => {
  if (!exitAgentSession(req)) return res.status(401).json({ error: 'missing or unknown session token' });
  res.json({ exits: exitProxy.list() });
});
app.post('/api/agent/exit/use', async (req, res) => {
  if (!exitAgentSession(req)) return res.status(401).json({ error: 'missing or unknown session token' });
  try { res.json(await exitProxy.use((req.body || {}).machine)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
// RUN a command natively ON the exit machine (the universal fallback for
// ICMP/UDP/proxy-unaware tools + that machine's own DNS). Bounded.
app.post('/api/agent/exit/run', async (req, res) => {
  if (!exitAgentSession(req)) return res.status(401).json({ error: 'missing or unknown session token' });
  const { machine, cmd } = req.body || {};
  if (!cmd || typeof cmd !== 'string') return res.status(400).json({ error: 'cmd (a shell command string) is required' });
  try {
    const h = exitProxy.resolve(machine); // enforces allowExit + resolves the ref
    // Bounded connect (B-fa6f review catch): every sibling exit path uses
    // deviceBounded — an agent's `vibespace-exit run` must error in seconds
    // on a flapping link, not sit on the ~2.7-min connect ladder.
    const dm = await hosts.deviceBounded(h.id, 8000);
    const r = await dm.runCmd('sh', ['-lc', cmd], { timeoutMs: 120000 });
    res.json({ machine: h.name || h.id, code: r.code ?? 0, stdout: String(r.stdout || ''), stderr: String(r.stderr || '') });
  } catch (e) { res.status(400).json({ error: e.message }); }
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
