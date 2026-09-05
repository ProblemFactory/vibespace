'use strict';
// PLUGIN LOADER (Plugin Ph2 minimal, 2.369.24 — docs/design-harness-plugins.md
// §3). Manifest-driven plugins under data/plugins/<id>/vibespace-plugin.json:
//   • client tier `iframe`: assets served at /plugins/<id>/<path> from the
//     plugin's ui/ folder under the SAME opaque-origin sandbox CSP the
//     published pages use (never allow-same-origin); the client registers each
//     contributed window through the window-type registry.
//   • `server: true`: server.js is FORKED as its own process (IPC-only API,
//     never require()d into the orchestrator); /api/plugins/<id>/x/* is
//     proxied to it over IPC; agentTools become generated shims in data/bin
//     (`vibespace-tool-<id>-<name>`) that POST /api/plugins/<id>/tool/<name>
//     with the session's vsst_ token — the plugin never sees a credential.
// State: data/plugin-registry.json { enabled: { <id>: bool } } (atomic).
// Every change broadcasts `plugins-manifests-updated` (multi-client law).
//
// IPC PROTOCOL (api version 1; the child is any Node script):
//   child → parent : { t:'hello', api:1 }
//   parent → child : { t:'route', id, method, path, query, headers:{}, body }   → child: { t:'route-reply', id, status, body }
//   parent → child : { t:'tool', id, name, args, session:{ sessionId } }        → child: { t:'tool-reply', id, ok, output }
//   parent → child : { t:'shutdown' }
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');
const { validateManifest } = require('../plugin-manifest');

const SANDBOX_CSP = "sandbox allow-scripts allow-popups allow-downloads allow-modals allow-forms";
const IPC_TIMEOUT_MS = 30000;
const MAX_CRASHES = 5;          // within CRASH_WINDOW_MS ⇒ parked (a crash loop must not hammer the box)
const CRASH_WINDOW_MS = 10 * 60 * 1000;
const MIME = { '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2', '.woff': 'font/woff', '.map': 'application/json' };

function writeJsonAtomic(file, obj) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}

function create({ rootDir, app, broadcast = () => {}, agentEnv = () => ({ ...process.env }), agentAuth = () => null, log = console, hostVersion = null, binDir = null, autoStart = true } = {}) {
  const pluginsDir = path.join(rootDir, 'data', 'plugins');
  const stateDir = path.join(rootDir, 'data', 'plugins-state');
  const registryFile = path.join(rootDir, 'data', 'plugin-registry.json');
  const shimDir = binDir || path.join(rootDir, 'data', 'bin');
  const plugins = new Map(); // id → { id, dir, manifest, errors, warnings, enabled, child, state, crashes:[], pending:Map, nextId }
  let registry = { enabled: {} };
  try { registry = JSON.parse(fs.readFileSync(registryFile, 'utf-8')) || registry; } catch { }
  if (!registry.enabled || typeof registry.enabled !== 'object') registry.enabled = {};
  const saveRegistry = () => { try { fs.mkdirSync(path.dirname(registryFile), { recursive: true }); writeJsonAtomic(registryFile, registry); } catch (e) { log.warn?.('[plugins] registry write failed:', e.message); } };
  const notify = () => { try { broadcast({ type: 'plugins-manifests-updated', plugins: list() }); } catch { } };

  // ── discovery ──
  function discover() {
    let dirs = [];
    try { dirs = fs.readdirSync(pluginsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { }
    const seen = new Set();
    for (const name of dirs) {
      const dir = path.join(pluginsDir, name);
      let raw = null, errors = [], warnings = [], manifest = null;
      try { raw = JSON.parse(fs.readFileSync(path.join(dir, 'vibespace-plugin.json'), 'utf-8')); }
      catch (e) { errors = [`vibespace-plugin.json: ${e.code === 'ENOENT' ? 'missing' : e.message}`]; }
      if (raw) { const v = validateManifest(raw, { hostVersion, folderName: name }); errors = v.errors; warnings = v.warnings; manifest = v.manifest; }
      if (manifest?.server && !fs.existsSync(path.join(dir, 'server.js'))) { errors.push('server: true but server.js is missing'); manifest = null; }
      const id = manifest?.id || name;
      seen.add(id);
      const prev = plugins.get(id);
      const rec = prev || { id, crashes: [], pending: new Map(), nextId: 1, child: null, state: 'stopped' };
      Object.assign(rec, { dir, manifest, errors, warnings, enabled: !!registry.enabled[id] && !!manifest });
      plugins.set(id, rec);
      if (errors.length) log.warn?.(`[plugins] ${id}: invalid — ${errors.join('; ')}`);
    }
    for (const id of [...plugins.keys()]) if (!seen.has(id)) { stopChild(plugins.get(id)); plugins.delete(id); }
  }

  // ── server child lifecycle ──
  function startChild(rec) {
    if (!rec.manifest?.server || rec.child || !rec.enabled) return;
    const now = Date.now();
    rec.crashes = rec.crashes.filter((t) => now - t < CRASH_WINDOW_MS);
    if (rec.crashes.length >= MAX_CRASHES) { rec.state = 'parked'; log.warn?.(`[plugins] ${rec.id}: parked after ${MAX_CRASHES} crashes in 10min`); return; }
    const dataDir = path.join(stateDir, rec.id);
    try { fs.mkdirSync(dataDir, { recursive: true }); } catch { }
    const env = { ...agentEnv(), VIBESPACE_PLUGIN_ID: rec.id, VIBESPACE_PLUGIN_DIR: rec.dir, VIBESPACE_PLUGIN_DATA: dataDir, VIBESPACE_PLUGIN_API_VERSION: '1' };
    let child;
    try {
      child = fork(path.join(rec.dir, 'server.js'), [], { cwd: rec.dir, env, serialization: 'advanced', stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    } catch (e) { rec.state = 'error'; rec.lastError = e.message; log.warn?.(`[plugins] ${rec.id}: fork failed: ${e.message}`); return; }
    rec.child = child; rec.state = 'starting'; rec.startedAt = now; rec.lastError = null;
    child.stdout?.on('data', (d) => log.log?.(`[plugin ${rec.id}] ${String(d).trimEnd()}`));
    child.stderr?.on('data', (d) => log.warn?.(`[plugin ${rec.id}] ${String(d).trimEnd()}`));
    child.on('message', (m) => onChildMessage(rec, m));
    child.on('exit', (code, signal) => {
      if (rec.child !== child) return;
      rec.child = null;
      for (const [, p] of rec.pending) { clearTimeout(p.timer); p.reject(new Error('plugin process exited')); }
      rec.pending.clear();
      const wanted = rec.enabled && !rec._stopping;
      rec.state = wanted ? 'crashed' : 'stopped';
      rec._stopping = false;
      if (wanted) {
        rec.crashes.push(Date.now());
        const delay = Math.min(10000, 1000 * Math.pow(2, rec.crashes.length - 1));
        log.warn?.(`[plugins] ${rec.id}: exited (${signal || code}) — restart in ${delay}ms`);
        rec._restartTimer = setTimeout(() => { rec._restartTimer = null; startChild(rec); notify(); }, delay);
        rec._restartTimer.unref?.();
      }
      notify();
    });
  }
  function stopChild(rec) {
    if (rec._restartTimer) { clearTimeout(rec._restartTimer); rec._restartTimer = null; }
    const child = rec.child;
    if (!child) { rec.state = 'stopped'; return; }
    rec._stopping = true;
    try { child.send({ t: 'shutdown' }); } catch { }
    const killer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { } }, 3000);
    killer.unref?.();
    try { child.kill('SIGTERM'); } catch { }
    child.once('exit', () => clearTimeout(killer));
  }
  function onChildMessage(rec, m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'hello') { rec.state = 'running'; rec.api = m.api || 1; notify(); return; }
    if (m.t === 'route-reply' || m.t === 'tool-reply') {
      const p = rec.pending.get(m.id);
      if (!p) return;
      rec.pending.delete(m.id); clearTimeout(p.timer); p.resolve(m);
    }
  }
  function ask(rec, msg, timeoutMs = IPC_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      if (!rec.child || rec.state === 'parked') return reject(Object.assign(new Error(`plugin ${rec.id} is not running (${rec.state})`), { status: 503 }));
      const id = rec.nextId++;
      const timer = setTimeout(() => { rec.pending.delete(id); reject(Object.assign(new Error('plugin did not answer in time'), { status: 504 })); }, timeoutMs);
      rec.pending.set(id, { resolve, reject, timer });
      try { rec.child.send({ ...msg, id }); } catch (e) { rec.pending.delete(id); clearTimeout(timer); reject(Object.assign(e, { status: 503 })); }
    });
  }

  // ── agent tool shims ──
  function shimName(pluginId, tool) { return `vibespace-tool-${pluginId.replace(/[^a-z0-9.-]/g, '')}-${tool}`; }
  function syncShims() {
    try { fs.mkdirSync(shimDir, { recursive: true }); } catch { }
    const wanted = new Map();
    for (const rec of plugins.values()) {
      if (!rec.enabled || !rec.manifest?.server) continue;
      for (const t of rec.manifest.contributes.agentTools) wanted.set(shimName(rec.id, t.name), { rec, t });
    }
    let existing = [];
    try { existing = fs.readdirSync(shimDir).filter((f) => f.startsWith('vibespace-tool-')); } catch { }
    for (const f of existing) if (!wanted.has(f)) { try { fs.unlinkSync(path.join(shimDir, f)); } catch { } }
    for (const [name, { rec, t }] of wanted) {
      const body = `#!/usr/bin/env node
// GENERATED by VibeSpace (plugin ${rec.id} tool "${t.name}") — do not edit; regenerated on every plugin change.
// ${t.description.replace(/\n/g, ' ')}
// Usage: ${name} [--key value ...] | ${name} '<json args>'    (args schema: ${JSON.stringify(t.args).replace(/\n/g, ' ')})
const argv = process.argv.slice(2);
let args = {};
if (argv.length === 1 && /^\\s*\\{/.test(argv[0])) { try { args = JSON.parse(argv[0]); } catch { console.error('args must be JSON or --key value pairs'); process.exit(2); } }
else { for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a.startsWith('--')) { const k = a.slice(2); const v = (i + 1 < argv.length && !argv[i + 1].startsWith('--')) ? argv[++i] : true; args[k] = v; } } }
if (argv.includes('--help') || argv.includes('-h')) { console.log(${JSON.stringify(t.description)}); console.log('args: ' + ${JSON.stringify(JSON.stringify(t.args))}); process.exit(0); }
const api = process.env.VIBESPACE_API, token = process.env.VIBESPACE_SESSION_TOKEN;
if (!api || !token) { console.error('not inside a VibeSpace session (VIBESPACE_API / VIBESPACE_SESSION_TOKEN unset)'); process.exit(3); }
fetch(api + '/api/agent/plugin-tool/${rec.id}/${t.name}', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify({ args }) })
  .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok || j.ok === false) { console.error(j.error || ('HTTP ' + r.status)); process.exit(1); } process.stdout.write(typeof j.output === 'string' ? j.output + (j.output.endsWith('\\n') ? '' : '\\n') : JSON.stringify(j.output, null, 2) + '\\n'); })
  .catch((e) => { console.error('request failed: ' + e.message); process.exit(1); });
`;
      const fp = path.join(shimDir, name);
      try { if (fs.existsSync(fp) && fs.readFileSync(fp, 'utf-8') === body) continue; fs.writeFileSync(fp, body, { mode: 0o755 }); fs.chmodSync(fp, 0o755); } catch (e) { log.warn?.(`[plugins] shim ${name}: ${e.message}`); }
    }
  }

  // ── public ──
  function list() {
    return [...plugins.values()].map((r) => ({ id: r.id, version: r.manifest?.version || null, description: r.manifest?.description || '', icon: r.manifest?.icon || null, client: r.manifest?.client || 'none', server: !!r.manifest?.server, contributes: r.manifest?.contributes || { windows: [], agentTools: [], routes: false }, capabilities: r.manifest?.capabilities || {}, enabled: !!r.enabled, valid: !!r.manifest, errors: r.errors || [], warnings: r.warnings || [], state: r.manifest?.server ? r.state : (r.enabled ? 'running' : 'stopped'), lastError: r.lastError || null }));
  }
  function setEnabled(id, on) {
    const rec = plugins.get(id);
    if (!rec) throw Object.assign(new Error(`unknown plugin "${id}"`), { status: 404 });
    if (on && !rec.manifest) throw Object.assign(new Error(`plugin "${id}" is invalid: ${rec.errors.join('; ')}`), { status: 400 });
    registry.enabled[id] = !!on; saveRegistry();
    rec.enabled = !!on && !!rec.manifest;
    if (rec.enabled) { rec.crashes = []; if (rec.state === 'parked') rec.state = 'stopped'; startChild(rec); }
    else stopChild(rec);
    syncShims(); notify();
    return list().find((p) => p.id === id);
  }
  function reload() { discover(); for (const rec of plugins.values()) { if (rec.enabled) startChild(rec); else stopChild(rec); } syncShims(); notify(); return list(); }
  function shutdown() { for (const rec of plugins.values()) stopChild(rec); }
  function get(id) { return plugins.get(id) || null; }

  // ── routes ──
  if (app) {
    app.get('/api/plugins/manifests', (req, res) => res.json({ plugins: list(), hostVersion }));
    app.post('/api/plugins/manifests/reload', (req, res) => res.json({ plugins: reload() }));
    app.post('/api/plugins/manifests/:id/enabled', (req, res) => {
      try { res.json({ plugin: setEnabled(String(req.params.id), !!req.body?.enabled) }); }
      catch (e) { res.status(e.status || 500).json({ error: e.message }); }
    });
    // iframe-tier assets: sandboxed opaque origin, no cache, path-traversal-proof
    app.get('/plugins/:id/*', (req, res) => {
      const rec = plugins.get(String(req.params.id));
      if (!rec || !rec.enabled || !rec.manifest || rec.manifest.client === 'none') return res.status(404).type('text').send('plugin not found or disabled');
      const uiRoot = path.resolve(rec.dir, 'ui');
      const rel = String(req.params[0] || '');
      const fp = path.resolve(uiRoot, rel);
      if (fp !== uiRoot && !fp.startsWith(uiRoot + path.sep)) return res.status(400).type('text').send('bad path');
      let st; try { st = fs.statSync(fp); } catch { return res.status(404).type('text').send('not found'); }
      if (!st.isFile()) return res.status(404).type('text').send('not found');
      res.setHeader('Content-Security-Policy', SANDBOX_CSP);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'no-cache');
      res.type(MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
      fs.createReadStream(fp).pipe(res);
    });
    // proxied plugin routes (server tier) — after cookie auth like every /api/*
    app.all('/api/plugins/:id/x/*', async (req, res) => {
      const rec = plugins.get(String(req.params.id));
      if (!rec || !rec.enabled || !rec.manifest?.contributes?.routes) return res.status(404).json({ error: 'plugin route not found' });
      try {
        const r = await ask(rec, { t: 'route', method: req.method, path: '/' + String(req.params[0] || ''), query: req.query || {}, headers: { 'content-type': req.headers['content-type'] || '' }, body: req.body ?? null });
        const status = Number(r.status) || 200;
        if (r.body !== undefined && typeof r.body !== 'string') return res.status(status).json(r.body);
        return res.status(status).type(r.contentType || 'text/plain').send(r.body === undefined ? '' : String(r.body));
      } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
    });
    // agent tool calls: under /api/agent/ (cookie-exempt like every agent
    // endpoint) — the route REQUIRES the session's vsst_ bearer (agentAuth)
    app.post('/api/agent/plugin-tool/:id/:name', async (req, res) => {
      const rec = plugins.get(String(req.params.id));
      const tool = rec?.manifest?.contributes?.agentTools?.find((t) => t.name === String(req.params.name));
      if (!rec || !rec.enabled || !tool) return res.status(404).json({ ok: false, error: 'plugin tool not found' });
      let session = null;
      try { session = agentAuth(req) || null; } catch { session = null; }
      if (!session) return res.status(401).json({ ok: false, error: 'missing or unknown session token (vsst_)' });
      try {
        const r = await ask(rec, { t: 'tool', name: tool.name, args: (req.body && typeof req.body.args === 'object') ? req.body.args : {}, session: session ? { sessionId: session.sessionId || null } : null });
        res.status(r.ok === false ? 400 : 200).json({ ok: r.ok !== false, output: r.output ?? '', error: r.error || undefined });
      } catch (e) { res.status(e.status || 500).json({ ok: false, error: e.message }); }
    });
  }

  discover();
  if (autoStart) { for (const rec of plugins.values()) if (rec.enabled) startChild(rec); }
  syncShims();
  return { list, get, setEnabled, reload, shutdown, discover, syncShims, SANDBOX_CSP, pluginsDir, shimDir };
}

module.exports = { create, SANDBOX_CSP };
