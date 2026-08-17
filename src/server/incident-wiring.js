'use strict';
// INCIDENT-CAPTURE WIRING (decomposition #4): server console ring + scene
// assembler + routes. Extracted verbatim; late-bound deps arrive as getters
// (hosts/noConvoRef are created after this point in boot order). ORCH tier.
const fs = require('fs');
const path = require('path');
const inc = require('../incident.js'); // the block references `inc.captureLocal` — keep the original binding name

function create({ app, rootDir, getActiveSessions, getHosts, getNoConvoRef, readLayouts, sysinfo , listLayoutHistory}) {
  const activeSessions = new Proxy({}, { get: (_, k) => { const m = getActiveSessions(); const v = m[k]; return typeof v === 'function' ? v.bind(m) : v; } });
  const hosts = new Proxy({}, { get: (_, k) => { const h = getHosts(); if (!h) return undefined; const v = h[k]; return typeof v === 'function' ? v.bind(h) : v; } });
  const noConvoRef = new Proxy({}, { get: (_, k) => { const r = getNoConvoRef(); if (!r) return undefined; const v = r[k]; return typeof v === 'function' ? v.bind(r) : v; } });
// ── Incident capture ("panic button", 2.238.0): the client posts its ring
// buffers + state snapshot; the server adds ITS OWN scene (sessions digest,
// sysinfo history slice, in-memory console ring, hosts digest) and writes
// data/incidents/<id>/bundle.json. The user relays only the short id; the
// admin reads the bundle later — the scene survives the timezone gap.
const _srvConsoleRing = [];
for (const _lvl of ['log', 'warn', 'error']) {
  const _orig = console[_lvl].bind(console);
  console[_lvl] = (...args) => {
    try {
      _srvConsoleRing.push({ t: Date.now(), l: _lvl, m: args.map((a) => (a instanceof Error ? (a.stack || a.message) : typeof a === 'string' ? a : JSON.stringify(a))).join(' ').slice(0, 500) });
      if (_srvConsoleRing.length > 600) _srvConsoleRing.splice(0, _srvConsoleRing.length - 600);
    } catch {}
    _orig(...args);
  };
}
const INCIDENTS_DIR = path.join(rootDir, 'data', 'incidents');
function _incidentServerState() {
  const out = { t: Date.now(), version: (() => { try { return require(require('path').join(rootDir, 'package.json')).version; } catch { return ''; } })(), uptimeS: Math.round(process.uptime()), rssMB: Math.round(process.memoryUsage().rss / 1048576) };
  try {
    out.sessions = [...activeSessions.entries()].map(([id, s]) => ({
      id, mode: s.mode, backend: s.backend, host: s.host || null,
      cid: s.claudeSessionId || s.backendSessionId || null, name: (s.name || '').slice(0, 40),
      streaming: !!s._isStreaming, historyLoaded: !!s._historyLoaded, clients: s.clients?.size ?? 0,
      remoteState: s._remoteState || null, agentd: !!s.agentdSession,
    }));
  } catch (e) { out.sessions = 'failed: ' + e.message; }
  try { out.sysinfoHistory = sysinfo.history(30 * 60 * 1000); } catch {}
  try { out.hosts = (hosts?.list?.() || []).map((h) => ({ id: h.id, name: h.name, transport: h.dialTokenHash ? 'dial' : 'ssh' })); } catch {}
  out.console = _srvConsoleRing.slice(-400);
  // The "conversation disappeared" class (2.238.1): what the RESUME BREAKER
  // currently blocks and what remote DISCOVERY last believed — both were
  // load-bearing in the userN incident and neither survives anywhere else.
  try { out.resumeBreakers = [...noConvoRef.map.entries()].map(([cid, at]) => ({ cid, agoS: Math.round((Date.now() - at) / 1000) })); } catch {}
  // LAYOUT state + rollback points (2.296.0): for a layout-destroying bug the
  // window→desktop mapping IS the evidence, and the history index tells a
  // responder whether an intact pre-damage state still exists (it makes the
  // difference between "restore in one click" and hand-editing layouts.json).
  try {
    const lay = (readLayouts ? readLayouts() : {}) || {};
    out.layout = {
      desktops: (lay.desktopMeta || []).map((m) => ({ id: m.id, name: m.name })),
      windowsPerDesktop: Object.fromEntries(Object.entries(lay.desktops || {}).map(([dk, v]) => [dk, ((v?.autoSave || {}).windows || []).length])),
      // window→desktop with its session id: the exact table needed to put a
      // flattened layout back, and small enough to always include
      windows: Object.entries(lay.desktops || {}).flatMap(([dk, v]) => (((v?.autoSave || {}).windows) || []).map((w) => ({
        desk: dk, id: w.id, type: w.type,
        sid: w.openSpec?.backendSessionId || w.openSpec?.serverId || null,
        title: String(w.title || '').slice(0, 40),
      }))).slice(0, 300),
    };
    out.layoutHistory = ((listLayoutHistory ? listLayoutHistory() : []) || []).slice(0, 40);
  } catch (e) { out.layout = 'failed: ' + e.message; }
  try {
    const dc = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'remote-sessions-cache.json'), 'utf8'));
    out.discoveryCache = Object.fromEntries(Object.entries(dc.hosts || dc || {}).map(([hid, v]) => {
      const list = Array.isArray(v?.sessions) ? v.sessions : Array.isArray(v) ? v : [];
      return [hid, { count: list.length, ids: list.slice(0, 40).map((x) => String(x.sessionId || x.id || '').slice(0, 8)) }];
    }));
  } catch {}
  return out;
}
// Which conversations + hosts does this incident touch? Everything the
// FREEZE needs to target: live sessions, the client's visible session list,
// and any id currently blocked by the resume breaker (the disappeared class).
function _incidentTargets(clientSnapshot) {
  const cids = new Set(), hostIds = new Set();
  try {
    for (const [, s] of activeSessions) {
      if (s.claudeSessionId) cids.add(s.claudeSessionId);
      if (s.backendSessionId) cids.add(s.backendSessionId);
      if (s.host) hostIds.add(s.host);
    }
  } catch {}
  try {
    for (const s of (clientSnapshot?.sessions || []).slice(0, 60)) {
      if (s?.id) cids.add(s.id);
      if (s?.host) hostIds.add(s.host);
    }
  } catch {}
  try { for (const cid of noConvoRef.map.keys()) cids.add(cid); } catch {}
  return { cids: [...cids].filter(Boolean), hostIds: [...hostIds].filter(Boolean) };
}
app.post('/api/incident', (req, res) => {
  try {
    const id = 'inc-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
    const dir = path.join(INCIDENTS_DIR, id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'bundle.json'), JSON.stringify({
      id, at: new Date().toISOString(), note: String(req.body?.note || '').slice(0, 2000),
      clientVersion: String(req.body?.version || ''), client: { rings: req.body?.rings, snapshot: req.body?.snapshot },
      server: _incidentServerState(),
    }, null, 1));
    // ── FREEZE THE SCENE (2.239.0) ──────────────────────────────────────
    // The user WILL now go troubleshoot — ssh in, resume, kill — and destroy
    // every volatile fact (process tree, locks, metas, transcript state).
    // Copy it all out first. Runs async so the id comes back instantly; a
    // `env.json.pending` marker tells a later reader the capture was cut off
    // (server killed mid-freeze) rather than empty by design.
    const targets = _incidentTargets(req.body?.snapshot);
    fs.writeFileSync(path.join(dir, 'env.json.pending'), JSON.stringify({ startedAt: new Date().toISOString(), targets }, null, 1));
    (async () => {
      try {
        const inc = require('../incident.js');
        const local = await inc.captureLocal(dir, { dataDir: path.join(rootDir, 'data'), cids: targets.cids });
        fs.writeFileSync(path.join(dir, 'env.json'), JSON.stringify({ targets, local }, null, 1));
        if (hosts && targets.hostIds.length) {
          const remote = await inc.captureRemote({ hosts, hostIds: targets.hostIds, cids: targets.cids });
          fs.writeFileSync(path.join(dir, 'remote.json'), JSON.stringify(remote, null, 1));
        }
        fs.rmSync(path.join(dir, 'env.json.pending'), { force: true });
        console.log(`[incident] ${id}: scene frozen (${targets.cids.length} conversations, ${targets.hostIds.length} hosts)`);
      } catch (e) {
        console.warn('[incident] async freeze failed:', e.message); // NEVER swallow — a silent catch hid a missing binding for one release
        try { fs.writeFileSync(path.join(dir, 'env-error.txt'), String(e.stack || e.message)); } catch {}
        console.error(`[incident] ${id}: freeze failed:`, e.message);
      }
    })();
    // prune: newest 30 kept
    try {
      const all = fs.readdirSync(INCIDENTS_DIR).filter((d) => d.startsWith('inc-')).sort();
      for (const d of all.slice(0, Math.max(0, all.length - 30))) fs.rmSync(path.join(INCIDENTS_DIR, d), { recursive: true, force: true });
    } catch {}
    console.log(`[incident] captured ${id}${req.body?.note ? ' — ' + String(req.body.note).slice(0, 80) : ''}`);
    res.json({ id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/incident/:id/append', (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!/^inc-[a-z0-9-]+$/.test(id)) return res.status(400).json({ error: 'bad id' });
    const dir = path.join(INCIDENTS_DIR, id);
    if (!fs.existsSync(dir)) return res.status(404).json({ error: 'unknown incident' });
    fs.writeFileSync(path.join(dir, 'followup.json'), JSON.stringify({
      at: new Date().toISOString(), client: { rings: req.body?.rings, snapshot: req.body?.snapshot }, server: _incidentServerState(),
    }, null, 1));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/incidents', (req, res) => {
  try {
    const out = [];
    for (const d of (fs.existsSync(INCIDENTS_DIR) ? fs.readdirSync(INCIDENTS_DIR) : []).sort().reverse().slice(0, 30)) {
      try { const b = JSON.parse(fs.readFileSync(path.join(INCIDENTS_DIR, d, 'bundle.json'), 'utf8')); out.push({ id: b.id, at: b.at, note: b.note }); } catch {}
    }
    res.json({ incidents: out });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
  return { _srvConsoleRing };
}
module.exports = { create };
