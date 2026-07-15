// libuv threadpool headroom (default 4): a few fs ops stuck on a dying fuse
// mount used to starve EVERY async fs/dns op server-wide (real outage — see
// mounts.js hung-mount defense). Must be set before the pool first spins up,
// i.e. before any require that performs async I/O.
process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || '32';
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const pty = require('node-pty');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync, spawn } = require('child_process');
const compression = require('compression');
const { MessageManager } = require('./src/message-manager');
const { createMessageManager } = require('./src/normalizers');
const { MessageManager: _MM } = require('./src/message-manager');
const { Telemetry } = require('./src/telemetry');
const { SyncStore } = require('./src/sync-store');
const { cwdToProjectDir, SessionMessages, findSessionJsonlPath } = require('./src/session-store');
const { CodexSessionMessages } = require('./src/codex-session-store');
const { normalizeCodexSource, CODEX_SESSIONS_DIR } = require('./src/adapters/codex');
const { createAdapterRegistry } = require('./src/adapters');
const fileRoutes = require('./src/routes/files');
const { SafeFs } = require('./src/safe-fs');
const { router: persistenceRouter, setup: setupPersistence } = require('./src/routes/persistence');

// ── Env sanitation: the server may have been (re)started from INSIDE a Claude
// Code session (e.g. an agent running in a WebUI terminal restarts it). The
// inherited session env then leaks into every CLI this server spawns —
// CLAUDE_CODE_CHILD_SESSION=1 alone puts a spawned claude into child-session
// mode: NO lock file, NO project transcript. Conversations look fine live but
// are silently unpersisted — terminate + resume loses everything (verified on
// CLI 2.1.199 by A/B env test). Strip the whole inherited set at startup so all
// spawn paths (dtach spawn line, wrappers, probes) run top-level.
if (process.env.CLAUDECODE || process.env.CLAUDE_CODE_CHILD_SESSION) {
  const stripped = [];
  for (const k of Object.keys(process.env)) {
    if (k === 'CLAUDECODE' || k === 'CLAUDE_EFFORT' || k.startsWith('CLAUDE_CODE_') || k.startsWith('CLAUDE_WEBUI_')) {
      stripped.push(k);
      delete process.env[k];
    }
  }
  console.warn(`[env] Server was started from inside a Claude Code session — stripped inherited session env (${stripped.join(', ')}) so spawned CLIs run top-level. Without this, spawned sessions never write transcripts and their conversations are LOST on resume.`);
}

// Optional persistent ops log (env-gated no-op without VIBESPACE_OPSLOG_DIR) —
// installed EARLY so the console tee captures the whole boot narrative.
try { require('./src/opslog').setupOpslog(require('./package.json').version); } catch (e) { console.warn('[opslog] init failed:', e.message); }

// Auto-update: pull latest + rebuild on startup (skip with NO_AUTO_UPDATE=1)
if (!process.env.NO_AUTO_UPDATE) {
  try {
    const repoDir = __dirname;
    // Ensure Homebrew/nvm paths are in PATH for child processes (macOS non-login shells)
    const nodeDir = path.dirname(process.execPath);
    const envPath = [nodeDir, process.env.PATH].filter(Boolean).join(path.delimiter);
    const spawnEnv = { ...process.env, PATH: envPath };
    const result = execFileSync('git', ['-C', repoDir, 'pull', '--ff-only'], { encoding: 'utf-8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    if (result && !result.includes('Already up to date')) {
      console.log('[auto-update] git pull:', result);
      execFileSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: repoDir, encoding: 'utf-8', timeout: 60000, stdio: 'inherit', env: spawnEnv });
      execFileSync('npm', ['run', 'build'], { cwd: repoDir, encoding: 'utf-8', timeout: 30000, stdio: 'inherit', env: spawnEnv });
      console.log('[auto-update] rebuilt successfully');
    }
  } catch (e) { console.log('[auto-update] skipped:', e.message?.split('\n')[0]); }
}

const PORT = process.env.PORT || 3456;
const CLAUDE_CMD_RAW = process.env.CLAUDE_CMD || 'claude';
const CODEX_CMD_RAW = process.env.CODEX_CMD || 'codex';
// Resolve full paths at startup — node-pty's posix_spawnp may not find commands
// if Homebrew/nvm paths (/opt/homebrew/bin) aren't in Node's inherited PATH
function resolveCmd(name) {
  // Try 'which' first
  try {
    const r = execFileSync('/usr/bin/which', [name], { encoding: 'utf-8', timeout: 2000 }).trim();
    if (r && r.startsWith('/')) return r;
  } catch {}
  // Search common paths directly
  const dirs = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin',
    ...(process.env.PATH || '').split(path.delimiter)];
  for (const dir of dirs) {
    const p = path.join(dir, name);
    try { fs.accessSync(p, fs.constants.X_OK); return p; } catch {}
  }
  return name;
}
const DTACH_CMD = resolveCmd('dtach');
const NODE_CMD = process.execPath;
const ENV_CMD = resolveCmd('env');

// ── X display detection (Linux clipboard / xclip) ──
// The inherited DISPLAY is unreliable: the server is often (re)started from
// shells with a stale value (e.g. :99 with no X server behind it), and under
// XWayland the display also needs the compositor's XAUTHORITY cookie — without
// it even the right display number fails. Probe candidates at startup and use
// the first {DISPLAY, XAUTHORITY} pair that actually answers; this env is used
// for the server's own xclip calls AND injected into spawned sessions (the CLI
// reads the clipboard itself on Ctrl+V).
function detectXDisplay() {
  if (process.platform !== 'linux') return { DISPLAY: process.env.DISPLAY || '', XAUTHORITY: process.env.XAUTHORITY || '' };
  const displays = [];
  if (process.env.DISPLAY) displays.push(process.env.DISPLAY);
  try {
    for (const f of fs.readdirSync('/tmp/.X11-unix')) {
      if (/^X\d+$/.test(f)) { const d = ':' + f.slice(1); if (!displays.includes(d)) displays.push(d); }
    }
  } catch {}
  const xauths = [];
  if (process.env.XAUTHORITY) xauths.push(process.env.XAUTHORITY);
  try {
    const rd = `/run/user/${process.getuid()}`;
    for (const f of fs.readdirSync(rd)) {
      // .mutter-Xwaylandauth.XXXXXX, Xauthority, xauth_XXXXXX (sddm), …
      // NOTE: "Xwaylandauth" does NOT contain the substring "xauth" — match "auth"
      if (/auth/i.test(f)) xauths.push(path.join(rd, f));
    }
  } catch {}
  xauths.push(path.join(os.homedir(), '.Xauthority'));
  const xauthCandidates = ['', ...xauths.filter((p, i, a) => p && a.indexOf(p) === i && fs.existsSync(p))];
  const xsetCmd = resolveCmd('xset');
  for (const d of displays) {
    for (const xa of xauthCandidates) {
      try {
        execFileSync(xsetCmd, ['q'], {
          env: { ...process.env, DISPLAY: d, ...(xa ? { XAUTHORITY: xa } : {}) },
          timeout: 1500, stdio: 'ignore',
        });
        return stabilizeXAuth({ DISPLAY: d, XAUTHORITY: xa, probed: true });
      } catch {}
    }
  }
  return { DISPLAY: process.env.DISPLAY || '', XAUTHORITY: process.env.XAUTHORITY || '', probed: false }; // best effort
}
// Compositor restarts mint a NEW per-instance cookie file
// (.mutter-Xwaylandauth.XXXXXX) while every already-running session keeps the
// OLD path in its env — the clipboard silently dies for all of them (real
// incident 2026-07-09: an Xwayland restart at 18:42 broke image paste in 11
// live sessions at once). Stabilize: merge the working cookie into
// ~/.Xauthority and hand THAT path to sessions — processes re-open the auth
// file on every X request, so after a future rotation one refreshXEnv() merge
// heals everything, old sessions included, without respawns.
function stabilizeXAuth(found) {
  if (!found.probed || !found.XAUTHORITY) return found;
  const home = path.join(os.homedir(), '.Xauthority');
  if (found.XAUTHORITY === home) return found;
  try {
    execFileSync(resolveCmd('xauth'), ['merge', found.XAUTHORITY], {
      env: { ...process.env, XAUTHORITY: home }, timeout: 3000, stdio: 'ignore',
    });
    // switch to the stable path only if it actually answers
    execFileSync(resolveCmd('xset'), ['q'], {
      env: { ...process.env, DISPLAY: found.DISPLAY, XAUTHORITY: home }, timeout: 1500, stdio: 'ignore',
    });
    return { ...found, XAUTHORITY: home };
  } catch { return found; }
}
// ONE mutable object — ws-handler and app.locals hold references to it, so a
// refresh propagates everywhere (new spawns + the paste route) without rewiring.
const X_ENV = detectXDisplay();
function refreshXEnv() { Object.assign(X_ENV, detectXDisplay()); return X_ENV; }
const CLAUDE_CMD = CLAUDE_CMD_RAW.startsWith('/') ? CLAUDE_CMD_RAW : resolveCmd(CLAUDE_CMD_RAW);
const CODEX_CMD = CODEX_CMD_RAW.startsWith('/') ? CODEX_CMD_RAW : resolveCmd(CODEX_CMD_RAW);
const CODEX_LINUX_SANDBOX_CMD = resolveCmd('codex-linux-sandbox');
const CODEX_SANDBOX_SUPPORTED = process.platform !== 'linux'
  || (!!CODEX_LINUX_SANDBOX_CMD && CODEX_LINUX_SANDBOX_CMD !== 'codex-linux-sandbox')
  || (typeof CODEX_LINUX_SANDBOX_CMD === 'string' && fs.existsSync(CODEX_LINUX_SANDBOX_CMD));
const adapterRegistry = createAdapterRegistry({
  claudeCmd: CLAUDE_CMD,
  codexCmd: CODEX_CMD,
  codexSandboxSupported: CODEX_SANDBOX_SUPPORTED,
  chatWrapper: path.join(__dirname, 'data', 'bin', 'chat-wrapper.js'),
  codexChatWrapper: path.join(__dirname, 'data', 'bin', 'codex-chat-wrapper.js'),
  ptyWrapper: path.join(__dirname, 'data', 'bin', 'pty-wrapper.js'),
  buffersDir: path.join(__dirname, 'data', 'session-buffers'),
});

if (!CODEX_SANDBOX_SUPPORTED) {
  console.log('[codex] codex-linux-sandbox not found; default/safe-yolo sessions will run unsandboxed.');
}

// Parse available permission modes, effort levels, and supported flags from claude --help
let PERMISSION_MODES = ['default', 'acceptEdits', 'auto', 'bypassPermissions', 'dontAsk', 'plan'];
// The effortLevel enum (parsed from `claude --help` below, which lists it on a
// wrapped line: "(low, medium, high, xhigh, max)"). This is the fallback if the
// parse ever fails — keep it matching. NOTE: "ultracode" is deliberately NOT
// here — it's not an effortLevel value but a separate session mode (xhigh +
// dynamic-workflow orchestration), appended as a pseudo-level client-side.
let EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'];
let CLAUDE_SUPPORTS_NAME = false;
try {
  const help = execFileSync(CLAUDE_CMD, ['--help'], { encoding: 'utf-8', timeout: 5000 });
  const permMatch = help.match(/--permission-mode.*choices:\s*(.+)\)/);
  if (permMatch) {
    PERMISSION_MODES = permMatch[1].match(/"([^"]+)"/g)?.map(s => s.replace(/"/g, '')) || PERMISSION_MODES;
  }
  // --effort <level>  Effort level ... (low, medium, high, max)
  const effortMatch = help.match(/--effort\s+\S+\s+[^(]*\(([^)]+)\)/);
  if (effortMatch) {
    EFFORT_LEVELS = effortMatch[1].split(',').map(s => s.trim()).filter(Boolean);
  }
  CLAUDE_SUPPORTS_NAME = /--name\b/.test(help);
} catch {}
// Propagate capability flags to the adapter
adapterRegistry.get('claude').config.supportsName = CLAUDE_SUPPORTS_NAME;
// Discover available models per backend (cached, refreshed periodically)
const CLAUDE_MODEL_ALIASES = [
  { id: '', label: 'Default' },
  { id: 'fable', label: 'fable (latest, 200k)' },
  { id: 'fable[1m]', label: 'fable[1m] (latest, 1M context)' },
  { id: 'opus', label: 'opus (latest, 200k)' },
  { id: 'opus[1m]', label: 'opus[1m] (latest, 1M context)' },
  { id: 'sonnet', label: 'sonnet (latest)' },
  { id: 'sonnet[1m]', label: 'sonnet[1m] (latest, 1M context)' },
  { id: 'haiku', label: 'haiku (latest)' },
];
const AVAILABLE_MODELS = {
  claude: [...CLAUDE_MODEL_ALIASES],
  codex: [{ id: '', label: 'Default' }],
};
function refreshAvailableModels() {
  // /v1/models accepts both auth schemes now (OAuth needs Bearer + the oauth
  // beta header — it used to 401, fixed server-side ~2026-06). The old
  // bootstrap endpoint's additional_model_options now returns null, so
  // /v1/models is the single source for full model IDs; CLI aliases
  // (fable/opus/sonnet/haiku) stay hardcoded since they're CLI-side names.
  function fetchModels(token, useOAuth) {
    const headers = { 'anthropic-version': '2023-06-01' };
    if (useOAuth) {
      headers['Authorization'] = 'Bearer ' + token;
      headers['anthropic-beta'] = 'oauth-2025-04-20';
    } else {
      headers['x-api-key'] = token;
    }
    const req = https.request('https://api.anthropic.com/v1/models?limit=100', {
      method: 'GET', headers,
    }, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (data.data?.length) {
            const models = data.data.map(m => {
              const ctx = m.max_input_tokens >= 1000000 ? '1M' : m.max_input_tokens >= 200000 ? '200k' : Math.round(m.max_input_tokens / 1000) + 'k';
              return { id: m.id, label: `${m.display_name || m.id} (${ctx})` };
            });
            AVAILABLE_MODELS.claude = [...CLAUDE_MODEL_ALIASES, ...models];
          } else if (res.statusCode !== 200) {
            console.warn(`[models] /v1/models failed: HTTP ${res.statusCode}`);
          }
        } catch {}
      });
    });
    req.on('error', () => {});
    req.end();
  }

  // §ban-safety: a /v1/models fetch with the OAuth (subscription) token is the
  // same off-CLI background-call pattern as the usage poll, so it's gated behind
  // the SAME opt-in. Default OFF → the dropdown falls back to the hardcoded CLI
  // aliases (fable/opus/sonnet/haiku[+1m]); only full model IDs are missed, and
  // "Custom…" still lets you type one. An API KEY (sanctioned) is always used.
  const apiKey = process.env.ANTHROPIC_API_KEY || null;
  if (apiKey) {
    fetchModels(apiKey, false);
  } else if (usagePollingEnabled()) {
    getOAuthToken((oauthToken) => { if (oauthToken) fetchModels(oauthToken, true); });
  }
  refreshCodexModels();
}

// ── Codex model list (from ~/.codex/models_cache.json) ──
// That cache is last-writer-wins AND version-gated server-side: a still-running
// OLD codex CLI re-fetches it and writes it back WITHOUT newer models (observed
// live TWICE: a 0.142.5 session erased the gpt-5.6 entries minutes after
// 0.144.0 fetched them — and once it happened right before a server restart,
// leaving the dropdown stale for the whole hourly re-read cycle). Two guards:
// (1) union every model ever seen, PERSISTED across restarts;
// (2) mtime-guarded re-read ON DEMAND from /api/available-models — the model/
//     effort dropdowns fetch per click, so they're always current, no timers.
const CODEX_MODELS_SEEN_FILE = path.join(__dirname, 'data', 'codex-models-seen.json');
const _codexModelsSeen = new Map();
try { for (const m of JSON.parse(fs.readFileSync(CODEX_MODELS_SEEN_FILE, 'utf-8'))) if (m && m.id) _codexModelsSeen.set(m.id, m); } catch {}
if (_codexModelsSeen.size) AVAILABLE_MODELS.codex = [{ id: '', label: 'Default' }, ..._codexModelsSeen.values()];
let _codexCacheMtime = 0;
function refreshCodexModels() {
  try {
    const fp = path.join(os.homedir(), '.codex', 'models_cache.json');
    const mt = fs.statSync(fp).mtimeMs;
    if (mt === _codexCacheMtime) return;
    _codexCacheMtime = mt;
    const codexCache = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    if (!codexCache.models?.length) return;
    const fresh = codexCache.models.map(m => {
      const ctx = m.context_window ? (m.context_window >= 1000000 ? Math.round(m.context_window / 1000000) + 'M' : Math.round(m.context_window / 1000) + 'k') : '';
      // Per-model reasoning levels ride along: GPT-5.6 made efforts
      // model-specific (sol/terra add max+ultra, luna tops out at max) —
      // clients derive dropdowns from this instead of a stale hardcoded list.
      return { id: m.slug, label: (m.display_name || m.slug) + (ctx ? ` (${ctx})` : ''), efforts: (m.supported_reasoning_levels || []).map(l => l && l.effort).filter(Boolean) };
    }).filter(m => m.id);
    let changed = false;
    for (const m of fresh) {
      const prev = _codexModelsSeen.get(m.id);
      if (!prev || JSON.stringify(prev) !== JSON.stringify(m)) { _codexModelsSeen.set(m.id, m); changed = true; }
    }
    AVAILABLE_MODELS.codex = [{ id: '', label: 'Default' }, ..._codexModelsSeen.values()];
    if (changed) {
      try {
        const tmp = CODEX_MODELS_SEEN_FILE + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify([..._codexModelsSeen.values()]));
        fs.renameSync(tmp, CODEX_MODELS_SEEN_FILE);
      } catch {}
    }
  } catch {}
}
refreshCodexModels();
setTimeout(refreshAvailableModels, 3000);
setInterval(refreshAvailableModels, 3600000); // refresh hourly

const HOST = process.env.HOST || '0.0.0.0';

const app = express();
const server = http.createServer(app);

// ── Optional password auth (VIBESPACE_PASSWORD env / data/auth.json) +
//    optional Clerk SSO (VIBESPACE_CLERK_PUBLISHABLE_KEY — src/clerk-auth.js) ──
const { Auth } = require('./src/auth');
const { ClerkAuth } = require('./src/clerk-auth');
const clerkAuth = new ClerkAuth();
const auth = new Auth(path.join(__dirname, 'data'), { clerk: clerkAuth });
{
  const { generated } = auth.ensurePassword({ generateIfMissing: process.env.VIBESPACE_GENERATE_PASSWORD === '1' });
  if (generated) {
    console.log('\n  ╔════════════════════════════════════════════════╗');
    console.log(`  ║  Generated workspace password: ${generated.padEnd(15)} ║`);
    console.log('  ║  (persisted in data/auth.json — set             ║');
    console.log('  ║   VIBESPACE_PASSWORD to choose your own)        ║');
    console.log('  ╚════════════════════════════════════════════════╝\n');
  }
  if (auth.passwordEnabled) console.log('  Password auth: ENABLED');
  if (clerkAuth.enabled) console.log(`  Clerk SSO: ENABLED (${clerkAuth.frontendApi})`);
  // getter — auth can be enabled/disabled at runtime via /api/auth/set-password
  Object.defineProperty(app.locals, 'authEnabled', { get: () => auth.enabled });
  Object.defineProperty(app.locals, 'ssoEnabled', { get: () => auth.ssoEnabled });
}

// noServer + ONE manual upgrade dispatcher (registered at the bottom of this
// file): ws's own {server, path} listener calls handleUpgrade UNCONDITIONALLY
// and abortHandshake(400)s every non-matching path — it was killing /proxy/
// WebSockets silently and the /api/vnc bridge on arrival. Auth happens in the
// dispatcher (cookie token, same as HTTP).
const wss = new WebSocketServer({ noServer: true });

app.use(compression());
// HTTP latency observation (names-and-numbers only): rolling 5-min window
// flushed by the metrics sampler; slow requests (>1.5s) recorded as events
// with the SANITIZED route (first 3 path segments — /api/file/serve/* etc.
// carry user paths that must never enter the ledger).
const _httpWin = { n: 0, sum: 0, max: 0, slow: [] };
app.use((req, res, next) => {
  const t0 = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    _httpWin.n++; _httpWin.sum += ms; if (ms > _httpWin.max) _httpWin.max = ms;
    if (ms > 1500 && _httpWin.slow.length < 20) {
      _httpWin.slow.push({ route: req.path.split('/').slice(0, 4).join('/') || '/', ms: Math.round(ms) });
    }
  });
  next();
});
auth.registerRoutes(app);
app.use(auth.middleware());
// Serve index.html with cache-busting query params on every local js/css asset
// (?v=<mtime>). Browsers serve unversioned <script>/<link> from memory cache on
// a soft reload without revalidating, so users were stuck on a stale bundle
// after an update until a hard refresh. Versioning the URL forces a fresh fetch
// whenever the file changes — no hard refresh ever needed.
app.get(['/', '/index.html'], (req, res, next) => {
  try {
    const pub = path.join(__dirname, 'public');
    let html = fs.readFileSync(path.join(pub, 'index.html'), 'utf-8');
    html = html.replace(/(href|src)="\/([^"?]+\.(?:js|css))"/g, (m, attr, file) => {
      try { return `${attr}="/${file}?v=${Math.floor(fs.statSync(path.join(pub, file)).mtimeMs)}"`; }
      catch { return m; }
    });
    res.set('Cache-Control', 'no-cache');
    res.type('html').send(html);
  } catch { next(); }
});
app.use(express.static(path.join(__dirname, 'public'), { etag: true, lastModified: true, maxAge: 0 }));
// WebDAV bridge — BEFORE the json body parser (PUT bodies stream to disk).
// Auth = scoped Bearer mount tokens; see src/webdav.js for the security model.
const { MountTokens, registerWebdav } = require('./src/webdav');
const mountTokens = new MountTokens({ dataDir: path.join(__dirname, 'data') });
registerWebdav(app, { tokens: mountTokens });
app.use(express.json({ limit: '50mb' }));

app.get('/xterm.css', (req, res) => {
  res.sendFile(path.join(__dirname, 'node_modules/@xterm/xterm/css/xterm.css'));
});

// ── Active session tracking (dtach-backed for persistence across server restarts) ──
// dtach is a minimal PTY detach/attach tool — no rendering layer, no mouse interception.
// Claude processes get raw PTY I/O identical to a native terminal.
const activeSessions = new Map();
const sessionCounterRef = { value: 0 };
const SOCKETS_DIR = path.join(__dirname, 'data', 'sockets');
const META_DIR = path.join(__dirname, 'data', 'session-meta');
const BUFFERS_DIR = path.join(__dirname, 'data', 'session-buffers');
const USAGE_CACHE_FILE = path.join(__dirname, 'data', 'usage-cache.json');
// Per-account PASSIVE usage capture (written by data/bin/vibespace-usage, the
// statusLine hook). Key '__global__' = the machine's own login; 'sub-…' = a
// named subscription. This is the ONLY usage source now — VibeSpace makes NO
// background /api/oauth/usage calls with subscription tokens (that off-CLI
// automated pattern is what gets Max/Pro accounts banned; see §ban-safety).
const USAGE_CACHE_DIR = path.join(__dirname, 'data', 'usage-cache');
const PTY_WRAPPER = path.join(__dirname, 'data', 'bin', 'pty-wrapper.js');

// ── CS refactor M1 (opt-in, default OFF): route LOCAL terminal sessions
// through the standing vibespace-agentd daemon. deviceMgr stays null unless
// serverSetting('agentd.sessions') is on — a default instance never
// instantiates it, never spawns a daemon, and attachToDtach is byte-identical
// to today. daemonPtyShim presents the node-pty interface over a device
// session handle so setupSessionPty is unchanged.
let deviceMgr = null;
// ── M2 host-level agentd provisioning (flag agentd.remoteSessions) ──
// Per-host vsht_ token: plaintext in a 0600 local file (the attach bridge
// reads it at spawn; never argv), sha256 recorded alongside for audit.
const AGENTD_DIR = path.join(__dirname, 'data', 'agentd');
function agentdHostToken(hostId) {
  ensureDir(AGENTD_DIR);
  const f = path.join(AGENTD_DIR, 'host-' + hostId + '.token');
  try { return fs.readFileSync(f, 'utf-8').trim(); } catch { }
  const tok = 'vsht_' + require('crypto').randomBytes(24).toString('hex');
  fs.writeFileSync(f, tok, { mode: 0o600 });
  return tok;
}
// Install/refresh the daemon on a host, throttled per boot+version: a marker
// records the last version shipped; matching = skip (one ssh round trip saved
// per spawn; a bundle change reinstalls because the version bumps with it).
const _agentdInstalled = new Map(); // hostId → version
// ── Transport B (dial-out) server side: devices behind NAT dial US. Pairing
// mints {deviceId, dialToken}; the daemon presents the dial token at the ws
// upgrade (gates the endpoint), then the normal hello/vsht_ auth runs INSIDE
// the mux like every transport. Incoming dials land in a registry the
// device's transport waits on. ──
const agentdDials = new Map();      // deviceId → ws stream adapter (live dial)
const agentdDialWaiters = new Map(); // deviceId → [resolve]
// B-f3e8: the pairing credential lives ON the dial host record (hosts.json
// dialTokenHash) — dial-tokens.json is migrated once at boot (below, after
// HostManager construction) and there is no separate device registry anymore.
function agentdMintDialPair(deviceId) {
  ensureDir(AGENTD_DIR);
  const tok = 'vsdt_' + require('crypto').randomBytes(18).toString('hex');
  hosts.setDialToken(deviceId, require('crypto').createHash('sha256').update(tok).digest('hex'));
  // the device token (vsht_) for in-mux auth ships in the install payload
  return { deviceId, dialToken: tok, hostToken: agentdHostToken('dial-' + deviceId) };
}
/** Full unpair of a dial machine (DELETE /api/hosts/:id on a dial record):
 *  mounts torn down, vsht_ token file gone, live stream destroyed. The token
 *  hash dies with the host record itself. */
async function unpairDialDevice(deviceId) {
  try { await machineMounts.onMachineUnpaired(hosts.findByDeviceId(deviceId)?.id); } catch { }
  try { portForwards.onMachineUnpaired(hosts.findByDeviceId(deviceId)?.id); } catch { }
  try { fs.unlinkSync(path.join(AGENTD_DIR, `host-dial-${deviceId}.token`)); } catch { }
  const live = agentdDials.get(deviceId);
  if (live) { try { live.destroy(); } catch { } agentdDials.delete(deviceId); }
  agentdDialDevices.delete(deviceId);
}
// A DeviceManager over a DIALED-IN device (Transport B consumption): the
// device's daemon holds the mux-server end; we drive it (fs/serve-folder/
// tcp-forward) as the client over the live ws stream in agentdDials. Reused
// per device; reconnects follow the device's --dial retries (getStream picks
// up the fresh stream). Enables 'device' mounts + remote fs for NAT'd devices.
const agentdDialDevices = new Map(); // deviceId → DeviceManager
async function deviceForDial(deviceId) {
  // FAIL FAST when the device isn't dialed in: the stream transport's connect
  // loop otherwise backs off and retries FOREVER, so every operation against
  // an offline device (session create, mount, test) HUNG instead of erroring
  // (real report: create卡住/terminal空白/mount打不开 — Mac daemon died after
  // a self-upgrade re-exec and nothing surfaced it).
  const curStream = agentdDials.get(deviceId);
  if (!curStream) throw new Error(`device "${deviceId}" is offline — its daemon is not dialed in (rerun the install command on it)`);
  let dm = agentdDialDevices.get(deviceId);
  // STALE-STREAM GUARD (real report: online=true but every fs op/session
  // blank): the device re-dialed after a self-upgrade re-exec, so agentdDials
  // holds a FRESH stream — but the cached DeviceManager's mux is still bound
  // to the DEAD old stream, and its status().connected can lag true. Rebuild
  // whenever the live stream differs from the one this dm connected over.
  if (dm && dm._dialStream && dm._dialStream !== curStream) {
    try { dm.stop?.(); } catch { }
    dm = null;
    agentdDialDevices.delete(deviceId);
  }
  if (dm && dm.status().connected) return dm;
  if (!dm) {
    const { DeviceManager } = require('./src/agentd/client.js');
    dm = new DeviceManager({
      dataDir: path.join(__dirname, 'data'),
      bundlePath: path.join(__dirname, 'data', 'bin', 'vibespace-agentd.js'),
      version: require('./package.json').version,
      transport: { kind: 'stream', hostToken: agentdHostToken('dial-' + deviceId), getStream: () => agentdDials.get(deviceId) || null },
      log: (...a) => console.log('[agentd-dial]', ...a),
    });
    agentdDialDevices.set(deviceId, dm);
  }
  dm._dialStream = curStream; // remember which stream we bind the mux to
  await dm.connect();
  return dm;
}
async function ensureAgentdOnHost(hostId) {
  const version = require('./package.json').version;
  if (_agentdInstalled.get(hostId) === version) return;
  const bundlePath = path.join(__dirname, 'data', 'bin', 'vibespace-agentd.js');
  await hosts.installAgentd(hostId, bundlePath, version, agentdHostToken(hostId));
  _agentdInstalled.set(hostId, version);
}
function daemonPtyShim(handle) {
  let dataCb = null, exitCb = null;
  handle.onData = (buf) => { if (dataCb) dataCb(buf.toString('utf-8')); };
  handle.onExit = (code) => { if (exitCb) exitCb({ exitCode: code }); };
  return {
    _daemon: true,
    get pid() { return handle.pid; },
    onData(cb) { dataCb = cb; return { dispose() { dataCb = null; } }; },
    onExit(cb) { exitCb = cb; return { dispose() { exitCb = null; } }; },
    write(s) { try { handle.write(s); } catch {} },
    resize(cols, rows) { try { handle.resize(cols, rows); } catch {} },
    kill() { try { handle.kill(); } catch {} },
  };
}
const CHAT_WRAPPER = path.join(__dirname, 'data', 'bin', 'chat-wrapper.js');
const CODEX_CHAT_WRAPPER = path.join(__dirname, 'data', 'bin', 'codex-chat-wrapper.js');

function ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }

// ── Cached webuiPids (PIDs managed by webui dtach sessions) ──
// Built from pty-wrapper metadata files (childPid), no pgrep/process-tree traversal needed.
const webuiPids = new Set();

function refreshWebuiPids() {
  webuiPids.clear();
  for (const [id, s] of activeSessions) {
    // Read childPid from pty-wrapper's metadata file
    try {
      const metaPath = path.join(BUFFERS_DIR, id + '.json');
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      if (meta.childPid) {
        webuiPids.add(meta.childPid);
        s._childPid = meta.childPid;
        // Also add direct children of childPid (claude forks from node-pty spawn)
        try {
          const ch = execFileSync('pgrep', ['-P', String(meta.childPid)], { encoding: 'utf-8', timeout: 2000 }).trim();
          for (const line of ch.split('\n')) { const p = parseInt(line.trim()); if (p) webuiPids.add(p); }
        } catch {}
      }
      if (meta.pid) { webuiPids.add(meta.pid); }
    } catch {}
  }
}

// ── Broadcast helper (avoids duplicating per-session WebSocket iteration) ──
const WS_OPEN = 1;
function broadcastToSession(session, id, msg) {
  const json = JSON.stringify(msg);
  for (const client of session.clients.keys()) {
    if (client.readyState === WS_OPEN) { try { client.send(json); } catch {} }
  }
}

// SyncStore imported from ./src/sync-store.js

// ── Effective-size computation (min cols/rows across clients + PTY resize + broadcast) ──
// Only clients that have sent a REAL `resize` (terminal fit) drive the PTY
// size. Two classes of entries must NOT shrink it:
//  - viewer:true  → subagent View Log windows attach to the PARENT session's
//    clients map purely to receive broadcasts; they have no terminal.
//  - placeholder (no `real` flag) → the 120×30 default set at attach time,
//    before the client's first fit(). A reconnecting/ghost client sitting at
//    this placeholder used to win the min and shrink everyone's terminal.
function resizeSessionToMin(session, sessionId) {
  if (!session.clients.size || !session.pty) return;
  let minCols = Infinity, minRows = Infinity, realCount = 0;
  for (const sz of session.clients.values()) {
    if (sz.viewer || !sz.real) continue;
    realCount++;
    if (sz.cols < minCols) minCols = sz.cols;
    if (sz.rows < minRows) minRows = sz.rows;
  }
  // No real terminal client yet (e.g. chat sessions never fit) — fall back to
  // non-viewer placeholders so chat PTYs still get a sane width, but never let
  // a viewer entry participate.
  if (!realCount) {
    for (const sz of session.clients.values()) {
      if (sz.viewer) continue;
      if (sz.cols < minCols) minCols = sz.cols;
      if (sz.rows < minRows) minRows = sz.rows;
    }
  }
  // Size override ("take over"): one client forces the PTY to ITS size instead
  // of the min — e.g. working from a big screen while a small window at home
  // stays attached. Smaller clients block their view behind a "Resume here"
  // overlay. Ownership follows the owner's live resizes and evaporates when the
  // owner disconnects (its clients-map entry disappears → back to min policy).
  let cols = minCols, rows = minRows, override = false;
  const ownerSz = session._sizeOwnerWs ? session.clients.get(session._sizeOwnerWs) : null;
  if (ownerSz && ownerSz.real && !ownerSz.viewer) {
    cols = ownerSz.cols; rows = ownerSz.rows; override = true;
  } else if (session._sizeOwnerWs) {
    session._sizeOwnerWs = null; // owner gone — min policy again
  }
  if (cols < Infinity && rows < Infinity) {
    try { session.pty.resize(cols, rows); } catch {}
    // clients: real terminal count — lets the UI say "limited by a smaller
    // client" (tmux-style boundary) only when someone else is actually attached
    broadcastToSession(session, sessionId, { type: 'effective-size', sessionId, cols, rows, clients: realCount, override });
  }
}

// ── Native goal status sync (Claude) ──
// /goal runs natively in the CLI (Stop hook drives continuation + met
// detection), but goal_status attachments are JSONL-only — they are NOT
// emitted on stream-json stdout (same gap class as subagent messages,
// anthropics/claude-code#8262). After each turn we tail the session JSONL for
// the newest goal_status and sync session state from it.
function checkClaudeGoalStatus(session, id) {
  if (!session.claudeSessionId) return;
  try {
    const fp = findSessionJsonlPath(session.claudeSessionId, session.cwd || '');
    if (!fp) return;
    const stat = fs.statSync(fp);
    const TAIL = 65536;
    let content;
    if (stat.size > TAIL) {
      const fd = fs.openSync(fp, 'r');
      try {
        const buf = Buffer.alloc(TAIL);
        const n = fs.readSync(fd, buf, 0, TAIL, stat.size - TAIL);
        content = buf.toString('utf-8', 0, n);
        content = content.slice(content.indexOf('\n') + 1);
      } finally { fs.closeSync(fd); }
    } else {
      content = fs.readFileSync(fp, 'utf-8');
    }
    // Newest goal_status record wins
    let latest = null;
    for (const line of content.split('\n')) {
      if (!line.includes('"goal_status"')) continue;
      try {
        const rec = JSON.parse(line);
        if (rec.type === 'attachment' && rec.attachment?.type === 'goal_status') latest = rec;
      } catch {}
    }
    if (!latest || latest.uuid === session._lastGoalStatusUuid) return;
    session._lastGoalStatusUuid = latest.uuid;
    const a = latest.attachment;
    const prevGoal = session._goal;
    if (a.durationMs) session._goalElapsed = a.durationMs;
    if (a.tokens) session._goalTokensUsed = a.tokens;
    if (a.met) {
      if (prevGoal) session._prevGoal = prevGoal;
      session._goal = null;
      session._goalStatus = 'complete';
      const reason = (a.reason || '').slice(0, 300);
      broadcastToSession(session, id, {
        type: 'goal-updated', sessionId: id, goal: null, goalStatus: 'complete',
        goalElapsed: session._goalElapsed || 0,
        statusMsg: `Goal met: ${a.condition}${reason ? `\n${reason}` : ''}`,
      });
      // Sync the wrapper meta too — the CLI already cleared its goal natively,
      // but the wrapper can't see that (attachments are JSONL-only). Without
      // this, a server restart would restore a stale "active" goal from meta.
      // (/goal clear on an already-cleared goal is a synthetic no-op.)
      if (session.pty) { try { session.pty.write(JSON.stringify({ type: 'set-goal', goal: null }) + '\n'); } catch {} }
    } else if (a.condition) {
      const changed = session._goal !== a.condition;
      session._goal = a.condition;
      session._goalStatus = 'active';
      if (changed || a.durationMs) {
        broadcastToSession(session, id, {
          type: 'goal-updated', sessionId: id, goal: a.condition, goalStatus: 'active',
          goalElapsed: session._goalElapsed || 0,
          statusMsg: a.sentinel && changed ? `Goal set: ${a.condition}` : null,
        });
      }
    }
  } catch {}
}

// ── PTY setup helper (onData + onExit wiring) ──
// Live TODO capture — the agent's own TodoWrite (claude) / plan tool (codex)
// IS the session's (活儿's) checklist; VibeSpace only OBSERVES it (never a
// parallel store the agent must be taught). Summary rides active-sessions for
// the board's progress pill; the full list is fetched on demand (expanded card
// → /api/session-todos, which reads taskState() from the transcript).
// New task-tool family (CLI ≥2.1.2xx: TaskCreate/TaskUpdate — CRUD by id, not
// full-list snapshots like TodoWrite). The created task's id only arrives in
// the paired TOOL RESULT text ("Task #N created…"), so creates are stashed by
// tool_use_id until the result lands. Replayed into a list for the same pill.
function applyTaskToolUpdate(session, input) {
  const list = (session._taskList ||= new Map());
  const key = String(input.taskId);
  if (input.status === 'deleted') list.delete(key);
  else {
    const cur = list.get(key) || { content: '', status: 'pending' };
    if (input.subject) cur.content = input.subject;
    if (input.activeForm) cur.activeForm = input.activeForm;
    if (input.status) cur.status = input.status;
    list.set(key, cur);
  }
  emitTaskListTodos(session);
}
function emitTaskListTodos(session) {
  if (!session._taskList?.size) return;
  const todos = [...session._taskList.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([, v]) => v);
  updateSessionTodos(session, todos);
}
let _todoBroadcastTimer = null;
function updateSessionTodos(session, todos) {
  try {
    if (!Array.isArray(todos) || !todos.length) return;
    const done = todos.filter((t) => t?.status === 'completed').length;
    const cur = todos.find((t) => t?.status === 'in_progress');
    session._todos = { done, total: todos.length, current: cur ? String(cur.content || cur.activeForm || cur.step || '').slice(0, 140) : null };
    if (!_todoBroadcastTimer) { // coalesce: TodoWrite can fire several times per turn
      _todoBroadcastTimer = setTimeout(() => { _todoBroadcastTimer = null; broadcastActiveSessions(); }, 500);
    }
  } catch { }
}

function setupSessionPty(session, id, ptyProcess, { cleanupOnExit = true } = {}) {
  session.pty = ptyProcess;

  if (session.mode === 'chat') {
    let lineBuf = '';
    if (session.backend === 'codex') {
      const stripAnsi = (value) => String(value || '').replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '');
      ptyProcess.onData((output) => {
        if (session._reattachAttempts) session._reattachAttempts = 0;
        // Append, trim only past 1.5x cap — slicing a fresh 800KB string per
        // delta chunk was hundreds of MB/s of string churn while streaming
        session.buffer += output;
        if (session.buffer.length > 1200000) session.buffer = session.buffer.slice(-800000);
        lineBuf += output;
        let nlIdx;
        while ((nlIdx = lineBuf.indexOf('\n')) !== -1) {
          const line = lineBuf.substring(0, nlIdx).replace(/\r/g, '').trim();
          lineBuf = lineBuf.substring(nlIdx + 1);
          if (!line) continue;
          try {
            const msg = JSON.parse(stripAnsi(line).trim());
            if (msg.type === '_stdin_ack') { session._stdinAckReceived = true; continue; }
            const payload = msg.payload || {};
            // remote transport state (2.139.0 codex remote chat, B-0588) —
            // rides as an event_msg record from the wrapper; mirror the
            // claude branch's broadcast so the status-bar chip works
            if (msg.type === 'event_msg' && payload.type === '_remote_state') {
              session._remoteState = payload.state === 'connected' ? null : { state: payload.state, attempts: payload.attempts || 0, at: Date.now() };
              broadcastToSession(session, id, { type: 'remote-state', sessionId: id, state: payload.state, attempts: payload.attempts || 0 });
              continue;
            }
            const nextThreadId = msg.type === 'session_meta'
              ? payload.id
              : msg.type === 'wrapper_meta'
                ? payload.threadId
                : null;
            // Name ONLY from meta records: every codex function_call carries
            // payload.name = the TOOL name ('shell'…) — ungated, each tool call
            // renamed the session + 2 sync meta writes + 2 broadcasts, forever
            // (audit round-2, high). Real thread names arrive via
            // session_meta/wrapper_meta only.
            const nextThreadName = (msg.type === 'session_meta' || msg.type === 'wrapper_meta')
              ? (payload.session_name || payload.sessionName || payload.threadName || payload.name || payload.thread?.name || null)
              : null;
            const sourceMeta = payload.source ? normalizeCodexSource(payload.source) : null;
            let changed = false;
            if (nextThreadId && session.backendSessionId !== nextThreadId) {
              if (session.backendSessionId) {
                const prev = session.forkedFrom || [];
                if (!prev.includes(session.backendSessionId)) prev.push(session.backendSessionId);
                session.forkedFrom = prev;
              }
              session.backendSessionId = nextThreadId;
              session.claudeSessionId = null;
              changed = true;
            }
            if (nextThreadName && session.name !== nextThreadName) {
              session.name = nextThreadName;
              changed = true;
            }
            if (payload.cwd && session.cwd !== payload.cwd) {
              session.cwd = payload.cwd;
              changed = true;
            }
            if (sourceMeta) {
              const nextFields = {
                sourceKind: sourceMeta.sourceKind || null,
                agentKind: sourceMeta.agentKind || 'primary',
                agentRole: sourceMeta.agentRole || '',
                agentNickname: sourceMeta.agentNickname || '',
                parentThreadId: sourceMeta.parentThreadId || null,
              };
              for (const [key, value] of Object.entries(nextFields)) {
                if ((session[key] || null) !== (value || null)) {
                  session[key] = value;
                  changed = true;
                }
              }
            }
            if (changed && session.sockName) {
              writeSessionMeta(session.sockName, {
                ...(readSessionMeta(session.sockName) || {}), // preserve keys not re-listed (agentToken/taskId/accountId)
                name: session.name,
                cwd: session.cwd,
                backend: session.backend,
                backendSessionId: session.backendSessionId,
                claudeSessionId: null,
                sourceKind: session.sourceKind || null,
                agentKind: session.agentKind || 'primary',
                agentRole: session.agentRole || '',
                agentNickname: session.agentNickname || '',
                parentThreadId: session.parentThreadId || null,
                forkedFrom: session.forkedFrom || null,
                permissionMode: session._permissionMode || null,
                effort: session._effort || null,
                createdAt: session.createdAt,
                webuiSessionId: id,
                mode: session.mode,
              });
              broadcastActiveSessions();
            }
            // Track turn lifecycle: streaming state + activity label
            {
              let newLabel = null;
              if (msg.type === 'event_msg') {
                const evType = payload.type;
                if (evType === 'task_started' && payload.turn_id) { session._isStreaming = true; newLabel = 'thinking...'; }
                else if (evType === 'task_complete' || evType === 'turn_aborted' || evType === 'task_failed') { session._isStreaming = false; newLabel = ''; }
                else if (evType === 'goal_updated' && payload.goal) {
                  session._goal = payload.goal.objective || null;
                  session._goalElapsed = (payload.goal.timeUsedSeconds || payload.goal.time_used_seconds || 0) * 1000;
                  session._goalStatus = payload.goal.status || null;
                  broadcastToSession(session, id, { type: 'goal-updated', sessionId: id, goal: session._goal, goalElapsed: session._goalElapsed, goalStatus: session._goalStatus });
                } else if (evType === 'goal_cleared') {
                  if (session._goal) session._prevGoal = session._goal;
                  session._goal = null; session._goalElapsed = 0; session._goalStatus = null;
                  broadcastToSession(session, id, { type: 'goal-updated', sessionId: id, goal: null, statusMsg: 'Goal cleared' });
                }
              } else if (msg.type === 'response_item') {
                const itemType = payload.type;
                if (itemType === 'message' && payload.role === 'assistant') newLabel = 'responding';
                else if (itemType === 'function_call') newLabel = `running ${payload.name || 'tool'}`;
                else if (itemType === 'reasoning') newLabel = 'thinking...';
              }
              if (newLabel !== null && session._streamingLabel !== newLabel) {
                session._streamingLabel = newLabel;
                broadcastToSession(session, id, { type: 'streaming-label', sessionId: id, label: newLabel });
              }
            }
            // Codex plan tool → the session's live TODO summary (board pill)
            if (msg.type === 'event_msg' && msg.payload?.type === 'plan_updated' && Array.isArray(msg.payload.plan)) {
              updateSessionTodos(session, msg.payload.plan.map((p) => ({
                content: p.step || '',
                status: (p.status === 'inProgress' || p.status === 'in_progress') ? 'in_progress' : (p.status === 'completed' ? 'completed' : 'pending'),
              })));
            }
            if (session._normalizer) session._normalizer.processLive(msg);
          } catch {
            broadcastToSession(session, id, { type: 'output', sessionId: id, data: line + '\n' });
          }
        }
      });
    } else {
      if (!session.subagentBuffers) session.subagentBuffers = new Map();
      if (!session.subagentEmittedUuids) session.subagentEmittedUuids = new Map(); // toolUseId → Set<uuid>
      if (!session.subagentWatchers) session.subagentWatchers = new Map(); // toolUseId → {watcher, offset}

      // Watch a subagent JSONL file for new messages (fills gap: text/thinking not in stream-json)
      const startSubagentWatcher = (toolUseId, agentId, attempt = 0) => {
        if (session.subagentWatchers.has(toolUseId)) return;
        // Find JSONL path
        const projectsDir = path.join(os.homedir(), '.claude', 'projects');
        const projDir = cwdToProjectDir(session.cwd || '');
        const candidates = [];
        if (session.claudeSessionId) {
          candidates.push(path.join(projectsDir, projDir, session.claudeSessionId, 'subagents', `agent-${agentId}.jsonl`));
          try { for (const dir of fs.readdirSync(projectsDir)) { const fp = path.join(projectsDir, dir, session.claudeSessionId, 'subagents', `agent-${agentId}.jsonl`); if (!candidates.includes(fp)) candidates.push(fp); } } catch {}
        }
        const watchFile = candidates.find(f => { try { return fs.existsSync(f); } catch { return false; } });
        if (!watchFile) {
          // File doesn't exist yet — retry with backoff, capped: an agent that
          // failed before writing its JSONL never gets a task_notification, so
          // an uncapped 1s retry (each with a full projects-dir scan) would
          // spin for the session's lifetime
          if (attempt >= 30) { session.subagentWatchers.delete(toolUseId); return; }
          const delay = Math.min(10000, 1000 * Math.pow(1.3, attempt));
          // Belt-and-braces liveness: a killed session must not keep re-scanning
          // the projects dir through this retry chain (audit round-2)
          const retry = setTimeout(() => { session.subagentWatchers.delete(toolUseId); if (!activeSessions.has(id)) return; startSubagentWatcher(toolUseId, agentId, attempt + 1); }, delay);
          session.subagentWatchers.set(toolUseId, { watcher: null, retry, lastActivity: Date.now() });
          return;
        }
        if (!session.subagentEmittedUuids.has(toolUseId)) session.subagentEmittedUuids.set(toolUseId, new Set());
        const emitted = session.subagentEmittedUuids.get(toolUseId);
        let offset = 0;
        // Read existing content first
        const readNewLines = () => {
          try {
            const stat = fs.statSync(watchFile);
            if (stat.size <= offset) return;
            const buf = Buffer.alloc(stat.size - offset);
            const fd = fs.openSync(watchFile, 'r');
            fs.readSync(fd, buf, 0, buf.length, offset);
            fs.closeSync(fd);
            offset = stat.size;
            for (const line of buf.toString('utf-8').split('\n')) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              try {
                const msg = JSON.parse(trimmed);
                if (msg.uuid && emitted.has(msg.uuid)) continue; // already sent via stream-json
                if (msg.uuid) emitted.add(msg.uuid);
                if (msg.type !== 'user' && msg.type !== 'assistant' && msg.type !== 'result') continue;
                // Buffer + broadcast
                if (!session.subagentBuffers.has(toolUseId)) session.subagentBuffers.set(toolUseId, []);
                session.subagentBuffers.get(toolUseId).push(msg);
                broadcastToSession(session, id, { type: 'subagent-message', sessionId: id, parentToolUseId: toolUseId, message: msg });
                // Normalize for subagent viewers
                if (!session._subNormalizers) session._subNormalizers = new Map();
                if (!session._subNormalizers.has(toolUseId)) {
                  const subMM = new MessageManager(`sub-${toolUseId}`);
                  subMM.onOp((op) => broadcastToSession(session, id, { type: 'msg', sessionId: `sub-${toolUseId}`, ...op }));
                  session._subNormalizers.set(toolUseId, subMM);
                }
                session._subNormalizers.get(toolUseId).processLive(msg);
              } catch {}
            }
          } catch {}
        };
        readNewLines(); // read any existing content
        const watcher = fs.watch(watchFile, () => { const e = session.subagentWatchers.get(toolUseId); if (e) e.lastActivity = Date.now(); readNewLines(); });
        session.subagentWatchers.set(toolUseId, { watcher, lastActivity: Date.now() });
      };

      const stopSubagentWatcher = (toolUseId) => {
        const entry = session.subagentWatchers.get(toolUseId);
        if (entry) {
          if (entry.watcher) entry.watcher.close();
          if (entry.retry) clearTimeout(entry.retry);
          session.subagentWatchers.delete(toolUseId);
        }
      };

      ptyProcess.onData((output) => {
        if (session._reattachAttempts) session._reattachAttempts = 0;
        session.buffer += output;
        if (session.buffer.length > 750000) session.buffer = session.buffer.slice(-500000);
        lineBuf += output;
        let nlIdx;
        while ((nlIdx = lineBuf.indexOf('\n')) !== -1) {
          const line = lineBuf.substring(0, nlIdx).replace(/\r/g, '').trim();
          lineBuf = lineBuf.substring(nlIdx + 1);
          if (!line) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.type === '_stdin_ack') { session._stdinAckReceived = true; continue; }
            // Remote transport state from the chat-wrapper (2.125.0): the ssh
            // pipe died and the wrapper is reconnecting to the host-side keeper
            // (the REMOTE session is fine). Surfaced as a status-bar chip; the
            // attach payload carries the current value for refreshes.
            if (msg.type === '_remote_state') {
              session._remoteState = { state: msg.state, attempts: msg.attempts || 0, at: Date.now() };
              broadcastToSession(session, id, { type: 'remote-state', sessionId: id, ...session._remoteState });
              continue;
            }

            // Claude fork: adopt the new session id. --fork-session makes claude
            // mint a fresh id at startup — the very first system/hook_started
            // line already carries it (verified) — and write a separate JSONL.
            // Without adopting it the WebUI keeps tracking the PARENT id, so the
            // forked window shadows the original (same name/history/resume
            // target) and the fork's transcript is orphaned — indistinguishable
            // from a plain resume. One-shot _forkRequested guard (set only when
            // data.fork) so a normal resume, whose id the parser also sees on
            // every line, can never be hijacked.
            // FIRST-capture is UNCONDITIONAL (2.156.1, lengyue real incident):
            // a session created with claudeSessionId=null could NEVER adopt its
            // id here — the fork guard vetoed the only parser-side capture.
            // Local sessions were silently rescued by lock-first discovery
            // (local locks visible); REMOTE keeper sessions had no rescuer, so
            // meta kept null forever and attach's transcript prefetch died on
            // it. Hijack-safety is preserved: with NO tracked id there is
            // nothing to hijack, and a CHANGED id still requires _forkRequested.
            if (typeof msg.session_id === 'string' && msg.session_id
                && (!session.backendSessionId || (session._forkRequested && session.backendSessionId !== msg.session_id))) {
              if (session.backendSessionId) {
                const prev = session.forkedFrom || [];
                if (!prev.includes(session.backendSessionId)) prev.push(session.backendSessionId);
                session.forkedFrom = prev;
              }
              session.backendSessionId = msg.session_id;
              session.claudeSessionId = msg.session_id;
              session._forkRequested = false; // adopt once, then stop watching
              if (session.sockName) {
                writeSessionMeta(session.sockName, {
                  ...(readSessionMeta(session.sockName) || {}), // preserve keys not re-listed (agentToken/taskId/accountId)
                  name: session.name,
                  cwd: session.cwd,
                  backend: session.backend,
                  backendSessionId: session.backendSessionId,
                  claudeSessionId: session.claudeSessionId,
                  sourceKind: session.sourceKind || null,
                  agentKind: session.agentKind || 'primary',
                  agentRole: session.agentRole || '',
                  agentNickname: session.agentNickname || '',
                  parentThreadId: session.parentThreadId || null,
                  forkedFrom: session.forkedFrom || null,
                  permissionMode: session._permissionMode || null,
                  effort: session._effort || null,
                  createdAt: session.createdAt,
                  webuiSessionId: id,
                  mode: session.mode,
                });
              }
              broadcastActiveSessions();
            }

            // Billing identity TRUTH: the init record's apiKeySource is the
            // CLI's own statement of what auth it resolved — 'none'=subscription
            // OAuth, '/login managed key'=console login (API billing),
            // 'ANTHROPIC_API_KEY'=env key. Overrides the spawn-time guess.
            if (msg.type === 'system' && msg.subtype === 'init' && typeof msg.apiKeySource === 'string') {
              if (session._apiKeySource !== msg.apiKeySource) {
                session._apiKeySource = msg.apiKeySource;
                if (session.sockName) writeSessionMeta(session.sockName, { ...(readSessionMeta(session.sockName) || {}), apiKeySource: msg.apiKeySource });
                broadcastActiveSessions();
              }
            }

            // TodoWrite / TaskCreate / TaskUpdate → the session's live TODO
            // summary (board pill). TaskCreate's id arrives in the RESULT.
            if (msg.type === 'assistant' && Array.isArray(msg.message?.content)) {
              for (const b of msg.message.content) {
                if (b?.type !== 'tool_use') continue;
                if (b.name === 'TodoWrite' && Array.isArray(b.input?.todos)) updateSessionTodos(session, b.input.todos);
                else if (b.name === 'TaskCreate') (session._pendingTaskCreates ||= new Map()).set(b.id, b.input || {});
                else if (b.name === 'TaskUpdate' && b.input?.taskId) applyTaskToolUpdate(session, b.input);
              }
            }
            if (msg.type === 'user' && Array.isArray(msg.message?.content) && session._pendingTaskCreates?.size) {
              for (const b of msg.message.content) {
                if (b?.type !== 'tool_result' || !session._pendingTaskCreates.has(b.tool_use_id)) continue;
                const inp = session._pendingTaskCreates.get(b.tool_use_id);
                session._pendingTaskCreates.delete(b.tool_use_id);
                const txt = typeof b.content === 'string' ? b.content : (Array.isArray(b.content) ? b.content.map((c) => c?.text || '').join(' ') : '');
                const m = /Task #(\d+) created/.exec(txt);
                if (m) {
                  (session._taskList ||= new Map()).set(m[1], { content: inp.subject || '', activeForm: inp.activeForm, status: 'pending' });
                  emitTaskListTodos(session);
                }
              }
            }

            // Track turn lifecycle: streaming state + activity label (broadcast to clients)
            {
              let newLabel = null;
              if (msg.type === 'result' || (msg.type === 'system' && msg.subtype === 'compact_boundary')) {
                session._isStreaming = false;
                newLabel = '';
              } else if (msg.type === 'user' && !msg.parent_tool_use_id && !msg.isSidechain) {
                // Local-command echoes (e.g. "<local-command-stdout>Set model
                // to ...") are user records with NO turn behind them — treating
                // them as a turn start left the chat stuck on "thinking..."
                // forever after a model switch.
                const uText = typeof msg.message?.content === 'string'
                  ? msg.message.content
                  : (Array.isArray(msg.message?.content) ? msg.message.content.map(b => b.text || '').join('') : '');
                if (!/^<local-command-/.test(uText.trim())) {
                  session._isStreaming = true;
                  newLabel = 'thinking...';
                }
              } else if (msg.type === 'assistant' && !msg.parent_tool_use_id && !msg.isSidechain) {
                const blocks = msg.message?.content;
                if (Array.isArray(blocks)) {
                  const last = blocks[blocks.length - 1];
                  if (last?.type === 'thinking') newLabel = 'thinking...';
                  else if (last?.type === 'text') newLabel = 'responding';
                  else if (last?.type === 'tool_use') newLabel = `running ${last.name || 'tool'}`;
                }
              }
              if (newLabel !== null && session._streamingLabel !== newLabel) {
                session._streamingLabel = newLabel;
                broadcastToSession(session, id, { type: 'streaming-label', sessionId: id, label: newLabel });
              }
            }

            // Track goal state from CLI /goal command (goal_status attachment).
            // Attachments are JSONL-only in current CLI versions — keep the
            // stdout handler in case that changes, but the authoritative sync
            // happens via checkClaudeGoalStatus after each result.
            if (msg.type === 'attachment' && msg.attachment?.type === 'goal_status') {
              const a = msg.attachment;
              const prevGoal = session._goal;
              if (a.durationMs) session._goalElapsed = a.durationMs;
              if (a.tokens) session._goalTokensUsed = a.tokens;
              if (a.met) {
                if (prevGoal) session._prevGoal = prevGoal;
                session._goal = null;
                session._goalStatus = 'complete';
              } else if (a.condition) {
                session._goal = a.condition;
                session._goalStatus = 'active';
              }
              if (session._goal !== prevGoal) {
                broadcastToSession(session, id, { type: 'goal-updated', sessionId: id, goal: session._goal || null, goalStatus: session._goalStatus, goalElapsed: session._goalElapsed || 0,
                  statusMsg: a.met ? `Goal met: ${a.condition}` : (a.sentinel ? `Goal set: ${a.condition}` : null) });
              }
            }

            // After each turn, tail the JSONL for goal_status (native goal sync).
            // Immediate check + one delayed re-check (the Stop hook may write
            // the attachment slightly after the result reaches stdout).
            if (msg.type === 'result' && session._goal) {
              checkClaudeGoalStatus(session, id);
              setTimeout(() => { if (activeSessions.has(id)) checkClaudeGoalStatus(session, id); }, 2000);
            }

            // Track subagent lifecycle: start/stop JSONL watchers
            if (msg.type === 'system' && msg.subtype === 'task_started' && msg.task_type === 'local_agent' && msg.task_id && msg.tool_use_id) {
              startSubagentWatcher(msg.tool_use_id, msg.task_id);
            }
            // Completed agents are served from DISK on attach (sub-agent-*),
            // so the live buffers are dead weight once done — a long session
            // driving dozens of agents retained every subagent message twice
            // (raw buffer + normalizer), unbounded (audit round-2). Grace
            // period lets an already-open live viewer finish rendering.
            const gcSubagent = (tuid) => setTimeout(() => {
              if (!activeSessions.has(id)) return;
              session.subagentBuffers?.delete?.(tuid);
              session.subagentEmittedUuids?.delete?.(tuid);
              session._subNormalizers?.delete?.(tuid);
            }, 60000);
            if (msg.type === 'system' && msg.subtype === 'task_notification' && msg.tool_use_id) {
              stopSubagentWatcher(msg.tool_use_id);
              gcSubagent(msg.tool_use_id);
            }
            // Inactivity sweep (audit round-3): an agent whose turn was
            // interrupted / whose CLI died NEVER emits task_notification — its
            // fs.watch handle + double-buffered transcript lived for the
            // session's whole (weeks-long) life. At each turn end, tear down
            // watchers idle >10min; genuinely running background agents keep
            // writing JSONL so their lastActivity stays fresh.
            if (msg.type === 'result' && session.subagentWatchers?.size) {
              const now = Date.now();
              for (const [tuid, entry] of [...session.subagentWatchers]) {
                if (now - (entry.lastActivity || 0) > 10 * 60 * 1000) {
                  stopSubagentWatcher(tuid);
                  gcSubagent(tuid);
                }
              }
            }

            if (msg.parent_tool_use_id || msg.isSidechain) {
              const ptuid = msg.parent_tool_use_id;
              if (ptuid) {
                // Mark uuid as emitted (for dedup with JSONL watcher)
                if (msg.uuid) {
                  if (!session.subagentEmittedUuids.has(ptuid)) session.subagentEmittedUuids.set(ptuid, new Set());
                  session.subagentEmittedUuids.get(ptuid).add(msg.uuid);
                }
                // Buffer
                if (!session.subagentBuffers.has(ptuid)) session.subagentBuffers.set(ptuid, []);
                session.subagentBuffers.get(ptuid).push(msg);
              }
              // Broadcast to parent (for tool card status) + normalize for subagent viewers
              broadcastToSession(session, id, { type: 'subagent-message', sessionId: id, parentToolUseId: ptuid, message: msg });
              if (ptuid) {
                if (!session._subNormalizers) session._subNormalizers = new Map();
                if (!session._subNormalizers.has(ptuid)) {
                  const subMM = new MessageManager(`sub-${ptuid}`);
                  subMM.onOp((op) => broadcastToSession(session, id, { type: 'msg', sessionId: `sub-${ptuid}`, ...op }));
                  session._subNormalizers.set(ptuid, subMM);
                }
                session._subNormalizers.get(ptuid).processLive(msg);
              }
              continue;
            }
            // Feed into MessageManager (emits normalized msg ops to all clients)
            if (session._normalizer) session._normalizer.processLive(msg);
          } catch {
            // Non-JSON line (e.g. dtach noise) — send as raw output
            broadcastToSession(session, id, { type: 'output', sessionId: id, data: line + '\n' });
          }
        }
      });
    }
  } else {
    // Terminal mode: raw PTY output
    ptyProcess.onData((output) => {
      if (session._reattachAttempts) session._reattachAttempts = 0;
      session.buffer += output;
      if (session.buffer.length > 75000) session.buffer = session.buffer.slice(-50000);
      broadcastToSession(session, id, { type: 'output', sessionId: id, data: output });
    });
  }

  ptyProcess.onExit(() => {
    // Session already torn down (e.g. this is a stale PTY exiting after kill) — nothing to do
    if (!activeSessions.has(id)) return;
    const isCurrent = session.pty === ptyProcess;

    // Detach path: dtach socket still alive → the session survives, only this
    // attach PTY died. Do NOT tear down watchers/normalizer listeners here —
    // the session keeps running and clients stay attached.
    if (cleanupOnExit && session.socketPath && fs.existsSync(session.socketPath)) {
      // Stale PTY (a replacement was already attached, e.g. broken-stdin
      // recovery): must not null the fresh pty or schedule re-attach.
      if (!isCurrent) return;
      session.pty = null;
      // Auto re-attach so the session doesn't become a zombie (LIVE in the
      // sidebar but input-dead). Bounded retries; counter resets on data.
      session._reattachAttempts = (session._reattachAttempts || 0) + 1;
      if (session._reattachAttempts <= 5) {
        setTimeout(() => {
          if (session.pty || !activeSessions.has(id)) return;
          if (!session.socketPath || !fs.existsSync(session.socketPath)) return;
          try { attachToDtach(id, session.socketPath, session); } catch {}
        }, 1000 * session._reattachAttempts);
      }
      return;
    }

    // A stale PTY must never tear down a session that has a live replacement
    if (!isCurrent && session.pty) return;

    // Real teardown: clean up subagent file watchers and normalizers
    if (session.subagentWatchers) {
      for (const [, entry] of session.subagentWatchers) {
        if (entry.watcher) entry.watcher.close();
        if (entry.retry) clearTimeout(entry.retry);
      }
      session.subagentWatchers.clear();
    }
    if (session._subNormalizers) { session._subNormalizers.clear(); }
    if (session._normalizer) { session._normalizer.listeners.length = 0; }
    if (session._interruptTimer) { clearTimeout(session._interruptTimer); session._interruptTimer = null; }
    session._isStreaming = false;
    // Detect auth failure from buffer content (claude exits immediately with "Not logged in")
    const exitReason = /Not logged in|Please run \/login|OAuth token revoked/.test(session.buffer || '') ? 'not_logged_in' : undefined;
    broadcastToSession(session, id, { type: 'exited', sessionId: id, reason: exitReason });
    activeSessions.delete(id);
    if (cleanupOnExit && session.sockName) deleteSessionMeta(session.sockName);
    // Buffer + wrapper-meta files are only meaningful while the dtach session
    // lives (restore reads them) — on real teardown they're dead weight that
    // used to accumulate forever (129 files / 28MB observed for 8 live
    // sessions; known-backlog item, fixed 2.81.0).
    if (cleanupOnExit) {
      try { fs.unlinkSync(path.join(BUFFERS_DIR, id + '.buf')); } catch {}
      try { fs.unlinkSync(path.join(BUFFERS_DIR, id + '.json')); } catch {}
    }
    broadcastActiveSessions();
  });
}

// Read/write session metadata
function readSessionMeta(sockName) {
  try { return JSON.parse(fs.readFileSync(path.join(META_DIR, sockName + '.json'), 'utf-8')); } catch { return {}; }
}
// Tombstones (2.89.1): teardown deletes the meta, but debounced/straggler
// writers (status flush, todo coalesce, attribution) can fire AFTER the delete
// and resurrect the file from a PARTIAL object — observed as metas with
// sessionId/sockName null, which then confuse the next restore (a real
// restart-data-loss chain). sockNames are unique per spawn, so a deleted one
// is never legitimately written again.
const _metaTombstones = new Map(); // sockName → deletedAt
function writeSessionMeta(sockName, meta) {
  if (_metaTombstones.has(sockName)) return;
  ensureDir(META_DIR);
  fs.writeFileSync(path.join(META_DIR, sockName + '.json'), JSON.stringify(meta));
  try { recordUsageAttribution(meta); } catch {} // usage-ledger account-by-time
}
function deleteSessionMeta(sockName) {
  _metaTombstones.set(sockName, Date.now());
  if (_metaTombstones.size > 4096) _metaTombstones.delete(_metaTombstones.keys().next().value);
  try { fs.unlinkSync(path.join(META_DIR, sockName + '.json')); } catch {}
}

// Attach a PTY to an existing dtach socket for I/O
function attachToDtach(id, socketPath, session) {
  const localAttach = () => {
    const attachPty = pty.spawn(DTACH_CMD, ['-a', socketPath, '-E', '-r', 'winch'], {
      name: 'xterm-256color', cols: 120, rows: 30,
      env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
    });
    setupSessionPty(session, id, attachPty);
  };
  // M1: daemon owns the pty when enabled — the dtach attach runs INSIDE agentd
  // and relays over the mux. On ANY failure fall back to the local pty so a
  // daemon hiccup never loses a session.
  if (deviceMgr && !session.host) {
    deviceMgr.openSession({ cmd: DTACH_CMD, args: ['-a', socketPath, '-E', '-r', 'winch'], cols: 120, rows: 30 })
      .then((h) => { setupSessionPty(session, id, daemonPtyShim(h)); })
      .catch((e) => { console.warn('[agentd] session attach failed — local pty fallback:', e.message); localAttach(); });
    return;
  }
  localAttach();
}

// On startup, reconnect to existing dtach sockets
function restoreSessions() {
  ensureDir(SOCKETS_DIR);
  ensureDir(BUFFERS_DIR);
  const sockets = fs.readdirSync(SOCKETS_DIR).filter(f => f.startsWith('cw-'));
  if (!sockets.length) return;

  console.log(`  Found ${sockets.length} existing session(s), reconnecting...`);
  // Dial-session bridges live in THIS process — recreate them on the SAME
  // recorded port so the surviving wrapper's attach reconnect lands (the
  // host-mounts tunnel re-own pattern). Must happen before wrappers retry.
  for (const sockFile of sockets) {
    try {
      const m = readSessionMeta(sockFile.replace(/^cw-/, '').replace(/\.sock$/, '')) || {};
      if (m.dialDeviceId && m.bridgePort) {
        dialBridge.ensure({ sid: sockFile.replace(/^cw-/, ''), deviceId: m.dialDeviceId, port: m.bridgePort })
          .catch((e) => console.warn('[dial-bridge] restore failed:', e.message));
      }
    } catch { }
  }
  for (const sockFile of sockets) {
    const socketPath = path.join(SOCKETS_DIR, sockFile);
    try { fs.statSync(socketPath); } catch { continue; }

    // Verify socket is live — check if any process owns it
    let socketAlive = false;
    try {
      const out = execFileSync('fuser', [socketPath], { encoding: 'utf-8', timeout: 2000, stdio: ['pipe', 'pipe', 'pipe'] });
      socketAlive = out.trim().length > 0;
    } catch {
      // fuser returns non-zero if no process found, also try pgrep
      try {
        execFileSync('pgrep', ['-f', socketPath], { encoding: 'utf-8', timeout: 2000 });
        socketAlive = true;
      } catch { socketAlive = false; }
    }

    if (!socketAlive) {
      console.log(`  ✗ Dead socket: ${sockFile} — cleaning up`);
      try { fs.unlinkSync(socketPath); } catch {}
      deleteSessionMeta(sockFile);
      continue;
    }

    const meta = readSessionMeta(sockFile);
    const id = meta.webuiSessionId || ('sess-' + (++sessionCounterRef.value) + '-' + Date.now());

    // Detect mode and streaming state from wrapper metadata
    let sessionMode = meta.mode || 'terminal';
    let wrapperStreaming = false;
    let wrapperGoal = null, wrapperGoalStatus = null, wrapperGoalElapsed = 0, wrapperGoalTokens = 0;
    let bareRemote = false;
    try {
      const wrapperMeta = JSON.parse(fs.readFileSync(path.join(BUFFERS_DIR, id + '.json'), 'utf-8'));
      if (wrapperMeta.mode === 'chat') sessionMode = 'chat';
      if (wrapperMeta.streaming != null) wrapperStreaming = !!wrapperMeta.streaming;
      if (wrapperMeta.goal) { wrapperGoal = wrapperMeta.goal; wrapperGoalStatus = wrapperMeta.goalStatus || null; wrapperGoalElapsed = wrapperMeta.goalElapsed || 0; wrapperGoalTokens = wrapperMeta.goalTokensUsed || 0; }
      // B-0845: a REMOTE chat session restored WITHOUT the wrapper's remote
      // field predates the keeper (2.124.0) — claude hangs bare off the ssh
      // pipe and one network wobble kills the conversation. Surface it.
      if (meta.host && sessionMode === 'chat' && !wrapperMeta.remote) bareRemote = true;
    } catch {}

    let savedBuffer = '';
    try { savedBuffer = fs.readFileSync(path.join(BUFFERS_DIR, id + '.buf'), 'utf-8'); } catch {}

    const session = {
      mode: sessionMode,
      pty: null, clients: new Map(),
      cwd: meta.cwd || os.homedir(),
      host: meta.host || null,
      _bareRemote: bareRemote,
      keeperSid: meta.keeperSid || null,
      hostName: meta.hostName || null,
      name: meta.name || sockFile,
      createdAt: meta.createdAt || Date.now(),
      backend: meta.backend || 'claude',
      backendSessionId: meta.backendSessionId || meta.claudeSessionId || null,
      claudeSessionId: meta.claudeSessionId || null,
      sourceKind: meta.sourceKind || null,
      agentKind: meta.agentKind || 'primary',
      agentRole: meta.agentRole || '',
      agentNickname: meta.agentNickname || '',
      parentThreadId: meta.parentThreadId || null,
      forkedFrom: meta.forkedFrom || null,
      // Permission mode isn't recoverable from the JSONL (init records are
      // stdout-only) — restore what the session was launched with
      _permissionMode: meta.permissionMode || null,
      _effort: meta.effort || null,
      agentToken: meta.agentToken || null, // vibespace-status auth survives restarts
      _initialGroupId: meta.taskId || null, // group spawned into; belonging is live-derived, this only covers the pre-bind window
      _accountId: meta.accountId || null, // billing identity the session was spawned with (badge only — env lives in the surviving dtach process)
      _authAtSpawn: meta.authAtSpawn || null,
      _apiKeySource: meta.apiKeySource || null, // CLI-confirmed auth (init record); backfilled from the buffer below when absent
      sockName: sockFile,
      socketPath,
      buffer: savedBuffer,
      _isStreaming: wrapperStreaming,
      _goal: wrapperGoal,
      _goalStatus: wrapperGoalStatus,
      _goalElapsed: wrapperGoalElapsed,
      _goalTokensUsed: wrapperGoalTokens,
    };
    // Create normalizer for chat sessions (populated on first attach from JSONL + buffer)
    if (sessionMode === 'chat') {
      session._normalizer = createMessageManager(session.backend || 'claude', id);
      session._normEpoch = Date.now();
      session._normalizer.onOp((op) => {
        broadcastToSession(session, id, { type: 'msg', sessionId: id, ...op });
      });
    }
    activeSessions.set(id, session);
    attachToDtach(id, socketPath, session);

    console.log(`  ✓ Reconnected: ${session.name} (${session.cwd})`);
  }

  // Populate webuiPids cache after all sessions are restored
  refreshWebuiPids();

  // Backfill billing identity for sessions restored WITHOUT a recorded
  // apiKeySource (spawned before tracking): chat sessions carry the init
  // record in their buffer (grep the last occurrence — bounded child
  // process, off the boot critical path); terminal sessions get a /proc env
  // probe (env key = definite API). One broadcast when done.
  setTimeout(() => {
    const { execFile } = require('child_process');
    let pending = 0, changed = false;
    const finish = () => { if (--pending === 0 && changed) broadcastActiveSessions(); };
    for (const [id, s] of activeSessions) {
      if (s.backend !== 'claude' || s._apiKeySource) continue;
      const buf = path.join(BUFFERS_DIR, `${id}.buf`);
      pending++;
      execFile('sh', ['-c', `grep -o 'apiKeySource":"[^"]*"' ${JSON.stringify(buf)} 2>/dev/null | tail -1`], { timeout: 20000 }, (err, out) => {
        const m = /apiKeySource":"([^"]*)"/.exec(String(out || ''));
        if (m) {
          s._apiKeySource = m[1];
          if (s.sockName) { try { writeSessionMeta(s.sockName, { ...(readSessionMeta(s.sockName) || {}), apiKeySource: m[1] }); } catch { } }
          changed = true;
        } else if (!s._authAtSpawn && s._childPid) {
          // terminal session: env probe (only the env-key case is provable)
          try {
            const env = fs.readFileSync(`/proc/${s._childPid}/environ`, 'utf-8');
            if (env.includes('ANTHROPIC_API_KEY=')) { s._apiKeySource = 'ANTHROPIC_API_KEY'; changed = true; }
          } catch { }
        }
        finish();
      });
    }
    if (!pending) { /* nothing to backfill */ }
  }, 3000);

  // Warn about surviving sessions whose CLI is still running in child-session
  // mode (spawned while the server env carried CLAUDE_CODE_CHILD_SESSION —
  // e.g. a pre-fix server restarted from inside a Claude session). Those CLIs
  // keep their poisoned env until recreated: their conversations are NOT being
  // written to any transcript and will be lost on terminate+resume.
  if (process.platform === 'linux') {
    setTimeout(() => {
      const affected = [];
      for (const [id, s] of activeSessions) {
        const pid = s._childPid;
        if (!pid) continue;
        try {
          const env = fs.readFileSync(`/proc/${pid}/environ`, 'utf-8');
          if (env.includes('CLAUDE_CODE_CHILD_SESSION=1')) affected.push(`${s.name} (${s.cwd})`);
        } catch {}
      }
      if (affected.length) {
        console.warn(`[env] ${affected.length} running session(s) were spawned with CLAUDE_CODE_CHILD_SESSION=1 and are NOT persisting transcripts — finish + recreate them to restore persistence:\n  - ${affected.join('\n  - ')}`);
      }
    }, 3000); // after refreshWebuiPids has populated _childPid
  }
}

// ── Create editor helper script ──
// Communicates via HTTP (not terminal output) so Claude Code treats it as a GUI editor
// and does NOT clear the screen. The server broadcasts via WebSocket to the client.
// Claude Code checks if EDITOR is in a hardcoded set of GUI editor names:
// ["code","cursor","windsurf","codium"] — if it is, it does NOT clear the screen.
// So we create a fake "code" wrapper script and set EDITOR to its path.
// This tricks Claude Code into treating our editor as a GUI editor.
const EDITOR_DIR = path.join(__dirname, 'data', 'bin');
const EDITOR_CMD = path.join(EDITOR_DIR, 'code'); // named "code" to match GUI editor check

function createEditorHelper() {
  ensureDir(EDITOR_DIR);
  // The script: "code -w <file>" is how Claude Code invokes it.
  // -w (--wait) flag is passed by Claude Code for known GUI editors.
  // We accept all flags, extract the filename, notify server via HTTP, and wait.
  const script = `#!/bin/bash
# WebUI editor disguised as "code" so Claude Code treats it as GUI (no screen clear).
# Parse args: skip flags, last arg is the file
FILE="\${@: -1}"
SIGNAL="/tmp/claude-webui-edit-signal-\$\$"
PORT="\${CLAUDE_WEBUI_PORT:-${PORT}}"
SESS="\${CLAUDE_WEBUI_SESSION_ID}"
curl -sf -X POST "http://localhost:\${PORT}/api/editor/open" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer \${VIBESPACE_SESSION_TOKEN}" \\
  -d "{\\"file\\":\\"\$FILE\\",\\"signal\\":\\"\$SIGNAL\\",\\"sessionId\\":\\"\$SESS\\"}" >/dev/null 2>&1 &
while [ ! -f "\$SIGNAL" ]; do sleep 0.2; done
rm -f "\$SIGNAL"
`;
  fs.writeFileSync(EDITOR_CMD, script, { mode: 0o755 });
}
createEditorHelper();

// vibespace-status — the agent-facing status tool (session-status feature).
// Spawned sessions get data/bin on PATH + VIBESPACE_API/VIBESPACE_SESSION_TOKEN
// in env, so an agent can run e.g. `vibespace-status blocked --urgency high
// --reason "waiting for DB credentials"` from its ordinary shell tool.
const STATUS_CMD = path.join(EDITOR_DIR, 'vibespace-status');
function createStatusHelper() {
  ensureDir(EDITOR_DIR);
  const script = `#!/usr/bin/env node
// vibespace-status — report THIS session's own state to the VibeSpace board.
// (For the whole task's status, use vibespace-task status instead.) Run with
// NO arguments to print usage AND the current state. The user sees this on your
// session card and may adjust it; if they do, you'll be told on their next turn.
const api = process.env.VIBESPACE_API;
const token = process.env.VIBESPACE_SESSION_TOKEN;
if (!api || !token) { console.error('vibespace-status: not running inside a VibeSpace session (missing env)'); process.exit(2); }
const args = process.argv.slice(2);
if (args[0] === 'set') args.shift(); // tolerated alias: "vibespace-status set working" — agents guess it
const cmd = args[0];
const opt = (name) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : undefined; };
const STATES = ['working', 'needs-input', 'blocked', 'review', 'done'];
const USAGE = [
  'usage — report THIS Task\\'s (this session\\'s) own state; done = this work is finished:',
  '  vibespace-status <working|needs-input|blocked|review|done> ["why"] [--urgency low|normal|high|urgent] [--reason "one-line why"] [--detail "full context"]',
  '  vibespace-status clear      remove the indicator',
  '  vibespace-status show       print the current indicator',
  '',
  'The user reads this on the board — keep it honest and current. blocked/needs-input/review REQUIRE',
  '--reason (one line) + --detail (full context). Set them the MOMENT you are stuck or waiting;',
  'done when finished.',
  'If you are waiting on the user, ALSO ask in chat + file it with vibespace-ask (both).',
].join('\\n');
async function post(body) {
  const res = await fetch(api + '/api/agent/session-status', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { console.error('vibespace-status:', data.error || res.status); process.exit(1); }
  return data;
}
function printStatus(data) {
  const s = data.status;
  console.log(s ? \`state=\${s.state || 'unset'} urgency=\${s.urgency || 'unset'}\${s.reason ? ' reason=' + JSON.stringify(s.reason) : ''} (set by \${s.setBy})\` : 'no status set');
  if (s && s.detail) console.log('  detail: ' + s.detail);
}
async function main() {
  if (cmd === '--help' || cmd === '-h') { console.log(USAGE); return; }
  if (!cmd) { console.log(USAGE); console.log(''); try { printStatus(await post({ show: true })); } catch {} return; }
  if (cmd === 'show') { printStatus(await post({ show: true })); return; }
  if (cmd === 'clear') { await post({ clear: true }); console.log('status cleared'); return; }
  if (!STATES.includes(cmd)) {
    console.error('vibespace-status: unknown state "' + cmd + '"\\n  valid states: ' + STATES.join('/') + '\\n' + USAGE);
    process.exit(1);
  }
  // A bare quoted string after the state is a reason too — agents pass it
  // positionally at least as often as via --reason; dropping it silently
  // meant boards showed states with no explanation.
  const posReason = args[1] && !args[1].startsWith('--') ? args[1] : undefined;
  const reasonVal = opt('reason') ?? posReason;
  const detailVal = opt('detail');
  if (['blocked', 'needs-input', 'review'].includes(cmd) && (!(reasonVal || '').trim() || !(detailVal || '').trim())) {
    // A same-state record that already carries BOTH may be tweaked
    // (e.g. bumping --urgency) without re-sending them — check before failing.
    let existing = null;
    try { existing = (await post({ show: true })).status; } catch {}
    if (!(existing && existing.state === cmd && (existing.reason || '').trim() && (existing.detail || '').trim())) {
      console.error('vibespace-status: "' + cmd + '" needs BOTH --reason (one line) AND --detail (full context).');
      console.error('  e.g. vibespace-status ' + cmd + ' --reason "waiting for the S3 credentials" --detail "Deploy needs the bucket keys; checked .env and the mounts config, not there. Recommend pasting them in chat." --urgency high');
      console.error('  (then say it in your chat reply and mirror it with: vibespace-ask "...")');
      process.exit(1);
    }
  }
  await post({ state: cmd, urgency: opt('urgency'), reason: reasonVal, detail: detailVal });
  console.log('status set: ' + cmd + (opt('urgency') ? ' / ' + opt('urgency') : ''));
  if (cmd === 'blocked' || cmd === 'needs-input' || cmd === 'review') {
    console.log('REMINDER: you are waiting on the user — write what you need (with your recommendation) in your CHAT REPLY now, and mirror it with: vibespace-ask "..."');
  }
}
main().catch((e) => { console.error('vibespace-status:', e.message); process.exit(1); });
`;
  fs.writeFileSync(STATUS_CMD, script, { mode: 0o755 });
}
createStatusHelper();

// vibespace-usage — PASSIVE subscription-usage capture (statusLine hook). It's a
// STATIC tracked file (data/bin/vibespace-usage), not generated — just make sure
// it's present + executable and the cache dir exists. See §ban-safety: this
// replaces all background /api/oauth/usage polling with a zero-API-call source.
const USAGE_STATUSLINE_CMD = path.join(EDITOR_DIR, 'vibespace-usage');
try { ensureDir(USAGE_CACHE_DIR); } catch {}
try { if (fs.existsSync(USAGE_STATUSLINE_CMD)) fs.chmodSync(USAGE_STATUSLINE_CMD, 0o755); } catch {}
// The user's OWN statusLine command (from ~/.claude/settings.json), so injected
// VibeSpace terminal sessions render it transparently (pass-through) instead of
// replacing it. Read fresh each spawn — cheap, and the user may change it.
function userStatuslineCmd() {
  try {
    const s = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude', 'settings.json'), 'utf-8'));
    const sl = s && s.statusLine;
    if (sl && sl.type === 'command' && typeof sl.command === 'string' && sl.command.trim()) return sl.command;
  } catch {}
  return '';
}

// vibespace-hook — dual-harness SessionStart hook (task context injection, P2).
// Registered in ~/.claude/settings.json AND ~/.codex/hooks.json (same schema,
// proven by the org's claude-task-tracker plugin). GATED on env: sessions not
// spawned by VibeSpace with a task have no VIBESPACE_TASK_ID → instant no-op,
// so global registration never affects other sessions. Output contract copied
// from the live-verified plugin: top-level {additionalContext} JSON on stdout.
const HOOK_CMD = path.join(EDITOR_DIR, 'vibespace-hook.mjs');
function createHookHelper() {
  ensureDir(EDITOR_DIR);
  const script = `#!/usr/bin/env node
// vibespace-hook — delivers VibeSpace task context through the harness's OWN
// native hooks (never by rewriting the user's message):
//   SessionStart     → the task's context (goal, plan, files, rules)
//   UserPromptSubmit → any pending status-override notice for this session
// No-op unless the session was spawned by VibeSpace (VIBESPACE_* env present).
let buf = '';
let ran = false;
async function run(input) {
  if (ran) return;
  ran = true;
  try {
    const event = input.hook_event_name;
    const api = process.env.VIBESPACE_API;
    const token = process.env.VIBESPACE_SESSION_TOKEN;
    if (!api || !token) return process.exit(0);
    let path;
    if (event === 'SessionStart') {
      // Which Task Group(s) this session belongs to is resolved SERVER-SIDE from
      // the token (live-derived — explicit tag / auto-include folder / spawned-
      // into group), so the hook passes no id. With groups it returns their
      // shared context; with none, the baseline VibeSpace tools intro (so every
      // session still learns to report its status).
      path = '/api/agent/task-context';
    } else if (event === 'UserPromptSubmit') {
      path = '/api/agent/prompt-context';
    } else if (event === 'Stop') {
      // Bookkeeping nudge with teeth: the SERVER decides (status freshness +
      // 30min cooldown) whether the agent must update its board before this
      // stop sticks. stop_hook_active = we already nudged — never loop.
      if (input.stop_hook_active) return process.exit(0);
      const c2 = new AbortController();
      const t2 = setTimeout(() => c2.abort(), 2500);
      const r = await fetch(api + '/api/agent/stop-check', { headers: { Authorization: 'Bearer ' + token }, signal: c2.signal });
      clearTimeout(t2);
      if (r.ok) {
        const d = await r.json();
        if (d && d.block && d.reason) process.stdout.write(JSON.stringify({ decision: 'block', reason: d.reason }));
      }
      return process.exit(0);
    } else {
      return process.exit(0);
    }
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 3000);
    const res = await fetch(api + path, { headers: { Authorization: 'Bearer ' + token }, signal: ctl.signal });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      if (data && data.context) {
        // BOTH harnesses read the NESTED hookSpecificOutput.additionalContext
        // (verified against the Claude 2.1.201 binary — it suggests "Did you
        // mean hookSpecificOutput" — and the Codex *HookSpecificOutputWire
        // JSON schema). Emit ONLY that: Codex's output schema is strict
        // (additionalProperties:false), so an extra top-level additionalContext
        // key makes Codex reject the whole object and inject nothing.
        process.stdout.write(JSON.stringify({
          hookSpecificOutput: { hookEventName: event, additionalContext: data.context },
        }));
      }
    }
  } catch { }
  process.exit(0);
}
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (c) => { buf += c; try { run(JSON.parse(buf)); } catch { } });
process.stdin.on('end', () => { try { run(JSON.parse(buf)); } catch { } if (!ran) process.exit(0); });
setTimeout(() => process.exit(0), 8000); // never hang a session start
`;
  fs.writeFileSync(HOOK_CMD, script, { mode: 0o755 });

  // Remote-side registration script (P3): distributed to remote hosts alongside
  // the hook so a REMOTE session's own Claude/Codex fires the hook natively
  // (our LOCAL registration can't reach the remote box). Self-locating: it
  // registers `node <its own dir>/vibespace-hook.mjs`. Same non-destructive
  // logic as ensureAgentHooks; best-effort (a failure just means no injection).
  // `--uninstall` (2.129.0, Manage Agents remote Remove) strips ONLY our entry
  // from the remote configs — mirror of the local removeAgentHooks.
  const reg = `#!/usr/bin/env node
import { readFileSync, writeFileSync, renameSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
const UNINSTALL = process.argv.includes('--uninstall');
const hookCmd = 'node ' + join(dirname(fileURLToPath(import.meta.url)), 'vibespace-hook.mjs');
const files = [
  { f: join(homedir(), '.claude', 'settings.json'), create: false, EVENTS: ['SessionStart', 'UserPromptSubmit', 'Stop'] },
  { f: join(homedir(), '.codex', 'hooks.json'), create: true, EVENTS: ['SessionStart', 'UserPromptSubmit'] },
];
const findOur = (list) => { for (const g of (Array.isArray(list) ? list : [])) { const h = (g.hooks || []).find(h => typeof h.command === 'string' && h.command.includes('vibespace-hook.mjs')); if (h) return h; } return null; };
for (const { f, create, EVENTS } of files) {
  try {
    let root = null; try { root = JSON.parse(readFileSync(f, 'utf-8')); } catch { root = null; }
    if (!root) { if (existsSync(f)) continue; if (UNINSTALL || !create) continue; root = {}; }
    if (!root.hooks || typeof root.hooks !== 'object') { if (UNINSTALL) continue; root.hooks = {}; }
    let changed = false;
    if (UNINSTALL) {
      for (const ev of Object.keys(root.hooks)) {
        if (!Array.isArray(root.hooks[ev])) continue;
        for (const g of root.hooks[ev]) {
          if (!g || !Array.isArray(g.hooks)) continue;
          const before = g.hooks.length;
          g.hooks = g.hooks.filter(h => !(h && typeof h.command === 'string' && h.command.includes('vibespace-hook.mjs')));
          if (g.hooks.length !== before) changed = true;
        }
        root.hooks[ev] = root.hooks[ev].filter(g => g && Array.isArray(g.hooks) && g.hooks.length);
      }
    } else {
      for (const ev of EVENTS) {
        if (!Array.isArray(root.hooks[ev])) root.hooks[ev] = [];
        const ours = findOur(root.hooks[ev]);
        if (ours) { if (ours.command !== hookCmd) { ours.command = hookCmd; changed = true; } }
        else { root.hooks[ev].push({ hooks: [{ type: 'command', command: hookCmd, timeout: 10 }] }); changed = true; }
      }
    }
    if (changed) { const tmp = f + '.tmp'; writeFileSync(tmp, JSON.stringify(root, null, 2) + '\\n'); renameSync(tmp, f); }
  } catch { }
}
`;
  fs.writeFileSync(path.join(EDITOR_DIR, 'vibespace-hook-register.mjs'), reg, { mode: 0o755 });
}
createHookHelper();

// Idempotent, NON-DESTRUCTIVE hook registration for both harnesses: only our
// own entry (matched by 'vibespace-hook.mjs') is ever added or updated; every
// other key/entry (e.g. the task-tracker plugin's hooks) is left untouched.
// Runs at every startup AND on demand from the Manage Agents dialog, which
// shows per-harness status so non-engineers can see + repair the integration.
const HOOK_FILES = {
  claude: { file: () => path.join(os.homedir(), '.claude', 'settings.json'), createIfMissing: false },
  codex: { file: () => path.join(os.homedir(), '.codex', 'hooks.json'), createIfMissing: true },
};
// Both events are natively supported by Claude Code and Codex; SessionStart
// delivers task context, UserPromptSubmit delivers pending status notices.
const HOOK_EVENTS = ['SessionStart', 'UserPromptSubmit'];
// Stop is CLAUDE-ONLY: codex's app-server (JSON-RPC mode) has no blockable
// Stop hook — its stop-time nudge rides the codex wrapper's turn/completed.
const HOOK_EVENTS_FOR = (harness) => harness === 'claude' ? [...HOOK_EVENTS, 'Stop'] : HOOK_EVENTS;
// Persisted opt-out: when the user clicks Remove in Manage Agents, we drop this
// marker so startup does NOT silently re-register the hooks they removed.
const HOOK_OPTOUT_FILE = path.join(__dirname, 'data', '.agent-hooks-optout');
// DEFENSIVE: a user can hand-edit settings.json into any shape (a null group, a
// string `hooks`, …). Never throw walking it — skip non-conforming entries so
// agentHooksStatus/ensure/remove degrade gracefully instead of 500ing the UI.
function _findOurHookIn(list) {
  for (const group of Array.isArray(list) ? list : []) {
    if (!group || !Array.isArray(group.hooks)) continue;
    const h = group.hooks.find(h => h && typeof h.command === 'string' && h.command.includes('vibespace-hook.mjs'));
    if (h) return h;
  }
  return null;
}
// Read → mutate → write with a compare-and-swap re-read right before the atomic
// rename: shrinks the lost-update window (a concurrent CLI write to the same
// settings file between our read and write) to the two-syscall rename gap. The
// mutate is idempotent, so re-applying it to fresher on-disk content is safe.
function _patchHookFile(file, createIfMissing, mutate) {
  const parse = () => { try { return { text: fs.readFileSync(file, 'utf-8') }; } catch { return { text: null }; } };
  for (let attempt = 0; attempt < 4; attempt++) {
    const { text } = parse();
    let root = null;
    if (text != null) { try { root = JSON.parse(text); } catch { throw new Error(`${file} exists but is not valid JSON — not touching it`); } }
    if (!root) {
      if (text != null) throw new Error(`${file} exists but is not valid JSON — not touching it`);
      if (!createIfMissing) throw new Error(`${file} not found (start the CLI once to create it)`);
      root = {};
    }
    if (!root.hooks || typeof root.hooks !== 'object') root.hooks = {};
    const changed = mutate(root);
    if (!changed) return false;
    const out = JSON.stringify(root, null, 2) + '\n';
    // CAS: only commit if the file hasn't changed under us since we read it.
    const cur = parse();
    if (cur.text !== text) continue; // someone wrote it — re-read + re-apply
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, out);
    fs.renameSync(tmp, file);
    return true;
  }
  throw new Error(`${file} kept changing under concurrent writes — gave up`);
}
function agentHooksStatus() {
  const hookCmd = `node ${HOOK_CMD}`;
  const out = { hookPath: HOOK_CMD, optedOut: fs.existsSync(HOOK_OPTOUT_FILE) };
  for (const [key, def] of Object.entries(HOOK_FILES)) {
    const file = def.file();
    let root = null, parseError = false;
    try { root = JSON.parse(fs.readFileSync(file, 'utf-8')); }
    catch { parseError = fs.existsSync(file); }
    let found = [];
    const evs = HOOK_EVENTS_FOR(key);
    try { found = evs.map(ev => root ? _findOurHookIn(root.hooks?.[ev]) : null); } catch { found = evs.map(() => null); }
    out[key] = {
      file,
      fileExists: fs.existsSync(file),
      parseError,
      installed: found.every(h => h && h.command === hookCmd),
      stale: found.some(h => h && h.command !== hookCmd) || (found.some(Boolean) && !found.every(Boolean)),
    };
  }
  return out;
}
// auto=true (startup): respect the opt-out marker. auto=false (explicit Install
// from the UI): always register + clear the marker.
function ensureAgentHooks({ auto = false } = {}) {
  const hookCmd = `node ${HOOK_CMD}`;
  if (auto && fs.existsSync(HOOK_OPTOUT_FILE)) return { optedOut: true };
  if (!auto) { try { fs.rmSync(HOOK_OPTOUT_FILE, { force: true }); } catch {} }
  const results = {};
  for (const [key, def] of Object.entries(HOOK_FILES)) {
    try {
      _patchHookFile(def.file(), def.createIfMissing, (root) => {
        let changed = false;
        for (const ev of HOOK_EVENTS_FOR(key)) {
          if (!Array.isArray(root.hooks[ev])) root.hooks[ev] = [];
          const ours = _findOurHookIn(root.hooks[ev]);
          if (ours) { if (ours.command !== hookCmd) { ours.command = hookCmd; changed = true; } }
          else { root.hooks[ev].push({ hooks: [{ type: 'command', command: hookCmd, timeout: 10 }] }); changed = true; }
        }
        return changed;
      }) && console.log(`Registered VibeSpace hooks in ${def.file()}`);
      results[key] = { ok: true };
    } catch (e) {
      console.log(`Hook registration (${key}) skipped:`, e.message);
      results[key] = { ok: false, error: e.message };
    }
  }
  return results;
}
function removeAgentHooks() {
  // Durable: record the opt-out so startup won't re-register (finding #3).
  try { fs.writeFileSync(HOOK_OPTOUT_FILE, new Date().toISOString() + '\n'); } catch {}
  for (const def of Object.values(HOOK_FILES)) {
    try {
      _patchHookFile(def.file(), false, (root) => {
        let changed = false;
        for (const ev of [...HOOK_EVENTS, 'Stop']) {
          if (!Array.isArray(root.hooks[ev])) continue;
          for (const group of root.hooks[ev]) {
            if (!group || !Array.isArray(group.hooks)) continue;
            const before = group.hooks.length;
            group.hooks = group.hooks.filter(h => !(h && typeof h.command === 'string' && h.command.includes('vibespace-hook.mjs')));
            if (group.hooks.length !== before) changed = true;
          }
          root.hooks[ev] = root.hooks[ev].filter(g => g && Array.isArray(g.hooks) && g.hooks.length);
        }
        return changed;
      }) && console.log(`Removed VibeSpace hooks from ${def.file()}`);
    } catch { }
  }
}
ensureAgentHooks({ auto: true });

// ── File System API (extracted to src/routes/files.js) ──
app.locals.xEnv = X_ENV;
app.locals.refreshXEnv = refreshXEnv; // paste route retries through this after an X cookie rotation
// Remote fs (Files cross-host) — resolved lazily; `hosts` is created below.
app.locals.getRemoteFs = () => remoteFs;
// ── SafeFs: dedicated worker_threads pool for LOCAL user-path fs ops ──
// STRUCTURAL isolation for the hung-mount class (complements the tactical
// canary/watchdog/circuit-breaker + UV_THREADPOOL_SIZE=32 above): every local
// file-route fs call runs on a worker's own thread with a per-op deadline and
// kill-and-respawn, so a wedged mount can never again saturate the shared libuv
// pool and freeze /login. path.resolve/permission decisions stay in-main; the
// worker only executes the already-resolved absolute path. mounts.pathBlocked
// still fails known-hung roots fast in the route middleware BEFORE dispatch.
try {
  app.locals.safeFs = new SafeFs({
    poolSize: parseInt(process.env.VIBESPACE_SAFEFS_POOL || '', 10) || 4,
  });
  console.log(`[safe-fs] worker pool up (${app.locals.safeFs.poolSize} workers)`);
} catch (e) {
  console.error('[safe-fs] pool init failed, file ops fall back to in-main fs:', e.message);
}
app.use(fileRoutes);

// Browser proxy — full-rewriting web proxy via node-unblocker
// Rewrites all URLs in HTML/CSS, injects JS to rewrite XHR/WebSocket, strips security headers
const Unblocker = require('unblocker');
const unblocker = new Unblocker({
  prefix: '/proxy/',
  responseMiddleware: [
    function stripFrameHeaders(data) {
      delete data.headers['x-frame-options'];
    }
  ],
});
app.use(unblocker);

// Editor: open request from the `code` helper script (via HTTP, not terminal
// output). The caller lives INSIDE the session shell — no cookie exists there,
// so auth.middleware exempts this path and WE validate the per-session vsst_
// token instead (same trust model as /api/agent/*). Without this, enabling
// password auth silently broke Ctrl+G: the script's POST got 401 and claude
// sat on "Save and close editor to continue…" forever.
app.post('/api/editor/open', (req, res) => {
  // Optional product analytics (self-hosted PostHog or compatible) — active
  // ONLY when a host+key are configured (settings posthog.host/posthog.key,
  // env fallback VIBESPACE_POSTHOG_HOST/_KEY) and telemetry.enabled is on.
  // The client initializes session recording FULLY MASKED (names-only
  // philosophy: interaction shapes, never content).
  app.locals.posthogCfg = () => {
    try {
      if (serverSetting('telemetry.enabled') === false) return null;
      const host = String(serverSetting('posthog.host') || process.env.VIBESPACE_POSTHOG_HOST || '').trim().replace(/\/$/, '');
      const key = String(serverSetting('posthog.key') || process.env.VIBESPACE_POSTHOG_KEY || '').trim();
      if (!/^https?:\/\//.test(host) || !key) return null;
      return { host, key, name: String(process.env.VIBESPACE_INSTANCE_NAME || os.hostname() || '').slice(0, 60) };
    } catch { return null; }
  };
  if (app.locals.authEnabled) {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    let ok = false;
    if (token && token.startsWith('vsst_')) {
      for (const [, s] of activeSessions) { if (s.agentToken === token) { ok = true; break; } }
    }
    if (!ok) return res.status(401).json({ error: 'unauthorized (session token required)' });
  }
  const { file, signal, sessionId } = req.body;
  // Broadcast to all WebSocket clients — include sessionId so each client opens editor on the right window
  const msg = JSON.stringify({ type: 'editor-open', filePath: file, signalPath: signal, sessionId: sessionId || null });
  wss.clients.forEach(client => {
    if (client.readyState === WS_OPEN) {
      try { client.send(msg); } catch {}
    }
  });
  res.json({ success: true });
});

// Editor: signal completion (called by client when user saves/closes editor)
app.post('/api/editor/signal', (req, res) => {
  const { signalPath, filePath, content } = req.body;
  try {
    if (content !== undefined) fs.writeFileSync(filePath, content);
    fs.writeFileSync(signalPath, 'done');
    // Broadcast editor-close to all clients so they remove the split pane
    const msg = JSON.stringify({ type: 'editor-close', filePath, signalPath });
    wss.clients.forEach(client => {
      if (client.readyState === WS_OPEN) { try { client.send(msg); } catch {} }
    });
    res.json({ success: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// ── Persistence API (extracted to src/routes/persistence.js) ──
const syncStores = {};
function getSyncStore(name) { return syncStores[name]; }
// THE server-side settings reader (data/settings.json via persistence.js's
// cached accessor). getSyncStore('settings') is NOT it — that SyncStore is an
// empty migration target; reads through it silently return undefined.
function serverSetting(key) {
  try { return persistenceRouter.readSettings ? persistenceRouter.readSettings()[key] : undefined; } catch { return undefined; }
}

syncStores.drafts = new SyncStore('drafts', path.join(__dirname, 'data', 'drafts.json'), wss);
syncStores.settings = new SyncStore('settings', path.join(__dirname, 'data', 'settings-sync.json'), wss);
syncStores.uploads = new SyncStore('uploads', path.join(__dirname, 'data', 'uploads-sync.json'), wss);
syncStores.stage = new SyncStore('stage', path.join(__dirname, 'data', 'stage-sync.json'), wss); // dynamic desktop (docs/design-dynamic-desktop.md)

setupPersistence({ dataDir: path.join(__dirname, 'data'), wss, WS_OPEN, getSyncStore, activeSessions, auth,
  getHosts: () => hosts, getMounts: () => mounts, getTasks: () => tasks,
  getAccounts: () => accounts, getUsageHistory: () => usageHistory });
app.use(persistenceRouter);

// ── Task Groups (岗位; task system — docs/design-task-system.md + refactor) ──
// data/task-groups.json is AUTHORITATIVE for everything the board renders (the
// store migrates the legacy data/tasks.json forward once). The one-time legacy
// Groups migration (sessionGroups/groupFolders) runs in the constructor.
const { TaskGroupManager } = require('./src/task-groups');
const tasks = new TaskGroupManager({
  dataDir: path.join(__dirname, 'data'),
  readUserState: () => persistenceRouter.readUserState(),
  onChange: (list) => {
    const json = JSON.stringify({ type: 'tasks-updated', tasks: list });
    wss.clients.forEach(c => { if (c.readyState === WS_OPEN) { try { c.send(json); } catch {} } });
  },
});
app.get('/api/tasks', (req, res) => res.json({ tasks: tasks.list() }));
app.post('/api/tasks', (req, res) => {
  try { res.json({ success: true, task: tasks.create(req.body || {}) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.patch('/api/tasks/:id', (req, res) => {
  try { res.json({ success: true, task: tasks.update(req.params.id, req.body || {}) }); }
  catch (e) { res.status(e.message === 'task not found' ? 404 : 400).json({ error: e.message }); }
});
app.delete('/api/tasks/:id', (req, res) => {
  try { tasks.remove(req.params.id); res.json({ success: true }); }
  catch (e) { res.status(404).json({ error: e.message }); }
});
// Granular tag ops (atomic server-side — concurrent clients can't clobber
// each other's read-modify-write of the sessions array)
app.post('/api/tasks/:id/bind', (req, res) => {
  try { res.json({ success: true, task: tasks.bind(req.params.id, req.body?.sessionKey) }); }
  catch (e) { res.status(e.message === 'task not found' ? 404 : 400).json({ error: e.message }); }
});
app.post('/api/tasks/:id/unbind', (req, res) => {
  try { res.json({ success: true, task: tasks.unbind(req.params.id, req.body?.sessionKey) }); }
  catch (e) { res.status(e.message === 'task not found' ? 404 : 400).json({ error: e.message }); }
});
app.post('/api/tasks/:id/progress', (req, res) => {
  try { res.json({ success: true, task: tasks.addProgress(req.params.id, req.body || {}) }); }
  catch (e) { res.status(e.message === 'task not found' ? 404 : 400).json({ error: e.message }); }
});
// P4 repo task files: export a task to a committable markdown file / import one.
app.post('/api/tasks/:id/export', (req, res) => {
  try { res.json({ success: true, path: tasks.exportToFile(req.params.id, req.body?.path) }); }
  catch (e) { res.status(e.message === 'task not found' ? 404 : 400).json({ error: e.message }); }
});
app.post('/api/tasks/import', (req, res) => {
  try { res.json({ success: true, task: tasks.importFromFile(req.body?.path) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// ── Remote context-folder auto-sync ("mount"): a REMOTE session's belonged
// groups with a contextDir get a live-synced copy at
// <remoteHome>/.vibespace/ctx/<groupId> (bidirectional rsync, newer-wins, no
// deletes, .vibespace excluded), and the injected file index is path-translated
// to the remote copy (remoteCtxBase). Triggers: session spawn + a 60s timer
// while any live remote session belongs to the group. Remote writes sync back
// → the local signature changes → every member re-injects next turn. ──
const _ctxSyncBusy = new Set(); // `${hostId}:${groupId}` in-flight guard
async function syncRemoteGroupCtx(h, g) {
  const key = `${h.id}:${g.id}`;
  if (_ctxSyncBusy.has(key)) return;
  _ctxSyncBusy.add(key);
  try {
    const home = await hosts.homeDir(h);
    if (!home) return;
    const rdir = `${home}/.vibespace/ctx/${g.id}`;
    await hosts._ssh(h, `mkdir -p "${rdir}"`);
    const e = hosts.sshCmd(h);
    const local = g.contextDir.replace(/\/+$/, '') + '/';
    const remote = `${hosts.dest(h)}:${rdir}/`;
    const opts = ['-az', '--update', '--exclude', '.vibespace', '--timeout', '25', '-e', e];
    const rsync = (args) => new Promise((resolve, reject) => {
      const { execFile } = require('child_process');
      execFile('rsync', args, { timeout: 60000 }, (err, so, se) => err ? reject(new Error(String(se || err.message).slice(0, 200))) : resolve());
    });
    await rsync([...opts, local, remote]); // push newer local files
    await rsync([...opts, remote, local]); // pull newer remote artifacts back
  } catch (e) { console.warn('[ctx-sync]', h.name, g.id, e.message); }
  finally { _ctxSyncBusy.delete(key); }
}
// Groups a session belongs to that have a syncable context folder.
function ctxGroupsOf(session, id) {
  if (!session.host) return [];
  return tasks.groupsForSession({ sessionKey: sessionStatusKey(session, id), cwd: session.cwd, initialGroupId: session._initialGroupId })
    .filter((g) => g.contextDir && g.injectContext !== false);
}
function scheduleCtxSync(session, id) {
  try {
    if (!session.host || !hosts) return;
    let h; try { h = hosts.get(session.host); } catch { return; }
    for (const g of ctxGroupsOf(session, id)) syncRemoteGroupCtx(h, g);
  } catch { }
}
setInterval(() => {
  try {
    const seen = new Set();
    for (const [id, s] of activeSessions) {
      if (!s.host) continue;
      let h; try { h = hosts.get(s.host); } catch { continue; }
      for (const g of ctxGroupsOf(s, id)) {
        const k = s.host + ':' + g.id;
        if (seen.has(k)) continue;
        seen.add(k);
        syncRemoteGroupCtx(h, g);
      }
    }
  } catch { }
}, 60000);
// Absolute remote path the injection should show for a group's context folder
// (null → local session, keep local paths). Uses the cached remote home; if
// the home isn't known yet (first contact) fall back to local paths this turn.
function remoteCtxBaseFor(session) {
  if (!session.host || !hosts) return null;
  const home = hosts._homes?.get(session.host);
  if (!home) { try { hosts.homeDir(hosts.get(session.host)); } catch { } return null; } // warm the cache async
  return (gid) => `${home}/.vibespace/ctx/${gid}`;
}

// ── Anthropic accounts (subscription ↔ API/console per-session switching) ──
// Keys AES-GCM encrypted in data/accounts.json; injected as ANTHROPIC_API_KEY
// into the session's spawn env (process-env channel — never argv/proc-visible).
// The CLI's own /login is mutually exclusive; this store is what lets both
// identities coexist. Design: docs/design in CLAUDE.md "Accounts".
const { AccountManager } = require('./src/accounts');
const accounts = new AccountManager({
  dataDir: path.join(__dirname, 'data'),
  onChange: (list) => {
    const json = JSON.stringify({ type: 'accounts-updated', ...list });
    for (const client of wss.clients) if (client.readyState === WS_OPEN) client.send(json);
    broadcastActiveSessions(); // account names on live session cards may change
  },
});
// ── Usage history: a PERMANENT per-request token ledger mined from Claude's
// JSONL transcripts (terminal + chat), for the Usage window. resolveAccount
// bakes WHICH account + its billing TYPE into each event so subscription and
// API-key usage are never conflated. ──
const { UsageHistory } = require('./src/usage-history');
// Forward URL/token: user setting wins; the VIBESPACE_TELEMETRY_FORWARD_* env
// vars are the DEPLOYMENT defaults (helm/compose set them fleet-wide so no
// per-user settings edit is needed on managed instances).
const telemetry = new Telemetry({
  dataDir: path.join(__dirname, 'data'),
  version: require('./package.json').version,
  getForwardUrl: () => {
    try { return serverSetting('telemetry.forwardUrl') || process.env.VIBESPACE_TELEMETRY_FORWARD_URL || ''; }
    catch { return process.env.VIBESPACE_TELEMETRY_FORWARD_URL || ''; }
  },
  getForwardToken: () => {
    try { return serverSetting('telemetry.forwardToken') || process.env.VIBESPACE_TELEMETRY_FORWARD_TOKEN || ''; }
    catch { return process.env.VIBESPACE_TELEMETRY_FORWARD_TOKEN || ''; }
  },
});
// Server-side fatals land in the same ledger (journald has them too, but the
// diagnostics report should show one unified picture).
process.on('uncaughtException', (e) => { try { telemetry.record({ kind: 'server-error', name: e.message || 'uncaughtException', stack: e.stack }); telemetry.flush(); } catch {} console.error(e); process.exit(1); });
process.on('unhandledRejection', (e) => { try { telemetry.record({ kind: 'server-error', name: (e && e.message) || 'unhandledRejection', stack: e && e.stack }); } catch {} console.error('unhandledRejection:', e); });

// Server performance metrics — RSS/heap, event-loop lag, live session count.
// Every 5 min; names-and-numbers only, same ndjson ledger as everything else.
{
  let lagProbeAt = Date.now();
  let maxLagMs = 0;
  setInterval(() => { // 1s cadence lag probe (cheap): drift beyond the interval = loop blocked
    const now = Date.now();
    const lag = now - lagProbeAt - 1000;
    if (lag > maxLagMs) maxLagMs = lag;
    lagProbeAt = now;
  }, 1000);
  setInterval(() => {
    try {
      const mu = process.memoryUsage();
      telemetry.record({ kind: 'metric', name: 'srv-rss-mb', value: Math.round(mu.rss / 1048576) });
      telemetry.record({ kind: 'metric', name: 'srv-heap-mb', value: Math.round(mu.heapUsed / 1048576) });
      telemetry.record({ kind: 'metric', name: 'srv-evloop-max-lag-ms', value: Math.max(0, maxLagMs) });
      telemetry.record({ kind: 'metric', name: 'srv-live-sessions', value: activeSessions.size });
      telemetry.record({ kind: 'metric', name: 'srv-ws-clients', value: wss.clients.size });
      // Leak canaries — the exact classes the 2.81-2.91 audits kept finding:
      // subagent watchers that outlive their agent, normalizer message piles.
      let watchers = 0, normMsgs = 0;
      for (const [, sess] of activeSessions) {
        watchers += sess.subagentWatchers?.size || 0;
        normMsgs += sess._normalizer?.total || 0;
      }
      telemetry.record({ kind: 'metric', name: 'srv-subagent-watchers', value: watchers });
      telemetry.record({ kind: 'metric', name: 'srv-normalizer-msgs', value: normMsgs });
      try { telemetry.record({ kind: 'metric', name: 'srv-buffer-files', value: fs.readdirSync(BUFFERS_DIR).length }); } catch {}
      if (_httpWin.n) {
        telemetry.record({ kind: 'metric', name: 'srv-http-reqs-5min', value: _httpWin.n });
        telemetry.record({ kind: 'metric', name: 'srv-http-avg-ms', value: Math.round(_httpWin.sum / _httpWin.n) });
        telemetry.record({ kind: 'metric', name: 'srv-http-max-ms', value: Math.round(_httpWin.max) });
        for (const sl of _httpWin.slow) telemetry.record({ kind: 'event', name: `slow-request ${sl.route}`, value: sl.ms });
        _httpWin.n = 0; _httpWin.sum = 0; _httpWin.max = 0; _httpWin.slow.length = 0;
      }
      maxLagMs = 0;
    } catch {}
  }, 300000);
}

// Zero-coupling metric hook for deep modules (session-store slow-parse etc.)
global.__vsMetric = (name, value) => { try { telemetry.record({ kind: 'metric', name, value }); } catch {} };

// ── Threadpool canary (2.108.6) ──
// The wedge class that took the instance down twice today (hung fuse IO) fills
// the libuv threadpool while the EVENT LOOP stays healthy — evloop-lag metrics
// see nothing. Canary: a stat() of our own package.json (always-fast local
// disk) must round-trip through the pool; when it exceeds the deadline three
// times in a row, the pool is wedged by SOMETHING — log loudly, record
// telemetry, and kick the mount health sweep (the known culprit class) without
// waiting for its 60s timer. Self-healing for known causes, loud for unknown.
{
  const CANARY_FILE = path.join(__dirname, 'package.json');
  let canaryStrikes = 0;
  let canaryBusy = false;
  setInterval(() => {
    if (canaryBusy) return; // previous canary still in flight = already wedged; strikes accrue on its resolution
    canaryBusy = true;
    const t0 = Date.now();
    const deadline = setTimeout(() => {
      canaryBusy = false;
      canaryStrikes++;
      console.error(`[canary] threadpool stat() exceeded 5s (strike ${canaryStrikes}) — pool likely wedged`);
      telemetry.record({ kind: 'metric', name: 'srv-fs-canary-ms', value: 5000 });
      if (canaryStrikes >= 3) {
        canaryStrikes = 0;
        telemetry.record({ kind: 'event', name: 'srv-threadpool-wedged' });
        try { mounts._healthSweep().catch(() => {}); } catch {}
      }
    }, 5000);
    fs.promises.stat(CANARY_FILE).then(() => {
      clearTimeout(deadline);
      if (!canaryBusy) return; // deadline already fired for this run
      canaryBusy = false;
      canaryStrikes = 0;
      const ms = Date.now() - t0;
      // record anomalies only — a healthy sub-ms canary every 10s is noise
      if (ms > 1000) telemetry.record({ kind: 'metric', name: 'srv-fs-canary-ms', value: ms });
    }).catch(() => { clearTimeout(deadline); canaryBusy = false; });
  }, 10000).unref();
}

const usageHistory = new UsageHistory({
  dataDir: path.join(__dirname, 'data'),
  resolveAccount: (id) => {
    const a = (accounts.list().accounts || []).find((x) => x.id === id);
    if (!a) return null;
    return { type: a.backend === 'codex' ? 'codex-subscription' : a.type, name: a.name, tail: a.tail };
  },
});
// Attribution log: dedup'd per (sid,acct) so a resume under a DIFFERENT account
// is captured with its timestamp (per-request-by-time attribution). Called from
// writeSessionMeta whenever a session has both a claudeSessionId and account.
const _lastAttrib = new Map();
function recordUsageAttribution(meta) {
  const sid = meta && (meta.claudeSessionId || meta.backendSessionId);
  if (!sid) return;
  const acct = meta.accountId || null;
  if (_lastAttrib.get(sid) === (acct || '')) return;
  _lastAttrib.set(sid, acct || '');
  // Cap only — never delete-on-kill: kill→resume of the same sid (terminate/
  // resume, billing switch) would re-append a duplicate attribution line.
  if (_lastAttrib.size > 4096) _lastAttrib.delete(_lastAttrib.keys().next().value);
  usageHistory.recordAttribution({ sid, acct, ts: Date.now() });
}
// Rescan the ledger periodically (incremental — only new JSONL bytes). Also
// rescanned on demand when the Usage window opens.
setTimeout(() => { try { usageHistory.scan(); usageHistory.warm(); } catch {} }, 8000);
setInterval(() => { try {
  const t0 = Date.now();
  const r = usageHistory.scan();
  if (!r?.skipped) telemetry.record({ kind: 'metric', name: 'srv-usage-scan-ms', value: Date.now() - t0 });
} catch {} }, 180000);
// Telemetry ingest (client errors + feature events) + diagnostics summary.
// telemetry.enabled=false drops ingest silently (client still posts — cheap).
app.post('/api/telemetry', (req, res) => {
  try {
    let enabled = true;
    try { enabled = serverSetting('telemetry.enabled') !== false; } catch {}
    if (enabled) {
      const events = Array.isArray(req.body?.events) ? req.body.events.slice(0, 20) : [];
      for (const ev of events) telemetry.record(ev);
    }
    res.json({ success: true });
  } catch { res.json({ success: true }); }
});
app.get('/api/telemetry/summary', (req, res) => {
  try {
    telemetry.flush();
    res.json(telemetry.summary({ days: Math.min(parseInt(req.query.days) || 14, 90) }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// ── Central collector (team deployments): other instances POST their batches
// here (telemetry.forwardUrl → https://<collector>/api/telemetry/ingest).
// Enabled ONLY when VIBESPACE_TELEMETRY_INGEST_TOKEN is set — the shared
// Bearer token is both the on-switch and the whole gate (cookie-auth exempt
// in auth.js: remote instances have no cookie). Same privacy model as local
// events: names/stacks/metrics only, never content. ──
const TELEMETRY_INGEST_TOKEN = (process.env.VIBESPACE_TELEMETRY_INGEST_TOKEN || '').trim();
app.post('/api/telemetry/ingest', (req, res) => {
  if (!TELEMETRY_INGEST_TOKEN) return res.status(404).json({ error: 'collector disabled' });
  const crypto = require('crypto');
  const got = Buffer.from(String(req.headers.authorization || ''));
  const want = Buffer.from(`Bearer ${TELEMETRY_INGEST_TOKEN}`);
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) {
    return res.status(403).json({ error: 'bad token' });
  }
  try {
    const n = telemetry.ingestRemote(req.body?.instance, req.body?.events);
    res.json({ success: true, n });
  } catch { res.json({ success: true, n: 0 }); }
});
app.get('/api/telemetry/central-summary', (req, res) => {
  try {
    res.json({ collector: !!TELEMETRY_INGEST_TOKEN, ...telemetry.centralSummary({ days: Math.min(parseInt(req.query.days) || 14, 90) }) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/usage-stats', (req, res) => {
  try {
    usageHistory.scan(); // pick up anything new before answering
    const from = req.query.from ? parseInt(req.query.from, 10) : null;
    const to = req.query.to ? parseInt(req.query.to, 10) : null;
    const backend = req.query.backend || null;
    // account = comma list of ledger bucket keys (account ids / '__global__')
    const accounts = req.query.account ? new Set(String(req.query.account).split(',').filter(Boolean)) : null;
    // pivot = comma list of 'dimA:dimB' 2-D crosses (dashboard split-series
    // panels, e.g. pivot=day:account) — validated + capped in aggregate/here
    const pivots = req.query.pivot
      ? String(req.query.pivot).split(',').map((s) => s.split(':')).filter((p) => p.length === 2).slice(0, 6)
      : null;
    // host = the DEVICE filter ('local' | a host id) — top-level over the view
    const hostFilter = req.query.host ? String(req.query.host) : null;
    res.json(usageHistory.aggregate({ from, to, backend, accounts, hostFilter, pivots }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/usage-stats/pricing', (req, res) => res.json({ pricing: usageHistory.pricingTable() }));
app.post('/api/usage-stats/pricing', (req, res) => {
  try { usageHistory.setPricing(req.body || {}); res.json({ success: true, pricing: usageHistory.pricingTable() }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/accounts', (req, res) => {
  res.json({
    ...accounts.list(),
    subscription: accounts.subscriptionStatus(),
    cliKey: accounts.cliPrimaryKey(),
  });
});
app.post('/api/accounts', (req, res) => {
  try { res.json({ success: true, account: accounts.add(req.body || {}) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/accounts/import-cli', (req, res) => {
  try { res.json({ success: true, account: accounts.importFromCli() }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
// Anthropic login state ON a remote host (subscription OAuth? console key?) —
// powers the Manage Agents accounts section when a host is selected.
app.get('/api/hosts/:id/accounts-status', async (req, res) => {
  try { res.json(await hosts.accountsStatus(req.params.id)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
// Import the console-login key minted on a REMOTE host into the central store
// (the store is host-agnostic — keys are pushed per-session wherever needed).
app.post('/api/accounts/import-cli-host', async (req, res) => {
  try {
    const { key, org } = await hosts.cliPrimaryKey(req.body?.hostId);
    if (!key) return res.status(400).json({ error: 'no primaryApiKey on that host — log in to a Console account there first' });
    const hostName = (() => { try { return hosts.get(req.body?.hostId)?.name; } catch { return null; } })();
    res.json({ success: true, account: accounts.add({ name: (org || 'Console') + ' (API' + (hostName ? ', ' + hostName : '') + ')', key, source: 'cli-import' }) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/accounts/default', (req, res) => {
  // backend needed only when CLEARING (id null) — otherwise it's derived from
  // the account. Each backend (claude/codex) keeps its own default.
  try { accounts.setDefault(req.body?.id || null, req.body?.backend || 'claude'); res.json({ success: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.patch('/api/accounts/:id', (req, res) => {
  try {
    let account = null;
    if (req.body?.name !== undefined) account = accounts.rename(req.params.id, req.body.name);
    if (req.body?.email !== undefined) account = accounts.setEmail(req.params.id, req.body.email);
    res.json({ success: true, account });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.delete('/api/accounts/:id', (req, res) => {
  try {
    accounts.remove(req.params.id); // throws for unknown ids → only real (shape-safe) ids continue
    // Best-effort: clear whatever this account left on each host — a 0600 key
    // file (API), a securestorage creds dir (Claude sub), or a CODEX_HOME copy
    // (Codex sub). Fire-and-forget; unreachable hosts are fine (the leftovers
    // are useless without the account, but tidy up when we can).
    const rid = req.params.id;
    if (/^(acct|sub|cxs)-[a-f0-9]+$/.test(rid) && hosts) {
      const { execFile } = require('child_process');
      const rm = `rm -f "$HOME/.vibespace/${rid}.key"; rm -rf "$HOME/.vibespace/subs/${rid}" "$HOME/.vibespace/codex-subs/${rid}"`;
      for (const h of hosts.list() || []) {
        try { execFile('ssh', [...hosts.sshArgs(h), '--', rm], { timeout: 15000 }, () => {}); } catch { }
      }
    }
    res.json({ success: true });
  }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// ── Multi-subscription: hold several Claude Max/Pro logins at once, each in
// its own securestorage creds dir (CLAUDE_SECURESTORAGE_CONFIG_DIR). Create
// allocates the dir + returns the login command the client runs in a terminal;
// finalize reads back the identity once the OAuth login has written creds. ──
app.post('/api/accounts/subscription', (req, res) => {
  try {
    const { id, dir } = accounts.createSubscription(req.body || {});
    // The client opens a shell terminal with this exact command. Set ONLY
    // CLAUDE_SECURESTORAGE_CONFIG_DIR → the login's CREDS go to the isolated dir
    // (that's what bills), while the CONFIG dir stays ~/.claude — so claude does
    // NOT show its first-run onboarding (an empty CLAUDE_CONFIG_DIR would, which
    // broke the login flow). `/login` matches the proven console-wizard command.
    // (Identity in ~/.claude.json is cosmetically overwritten — the global's
    // TOKENS in ~/.claude/.credentials.json are untouched since they read from
    // the securestorage dir.)
    // `claude auth login` (subcommand — NOT the TUI `/login`, which errors from
    // a shell) prints an OAuth URL to a HOSTED callback + a "Paste code" prompt,
    // so it works headlessly. --claudeai = the subscription flow. Set BOTH env
    // vars → dir: creds AND identity (.claude.json oauthAccount) isolate into the
    // dir, so the GLOBAL ~/.claude.json is NOT clobbered. The dir is pre-seeded
    // with onboarding-complete flags so no first-run screen appears.
    const q = JSON.stringify(dir);
    const loginCmd = `CLAUDE_CONFIG_DIR=${q} CLAUDE_SECURESTORAGE_CONFIG_DIR=${q} claude auth login --claudeai`;
    res.json({ success: true, id, dir, loginCmd });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/accounts/subscription/:id/finalize', (req, res) => {
  try { res.json({ success: true, ...accounts.finalizeSubscription(req.params.id) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
// Add a Console account safely: the /login runs in an isolated dir so it can't
// wipe the global subscription; we capture the minted key from that dir.
app.post('/api/accounts/console-login', (req, res) => {
  try {
    const { id, dir } = accounts.beginConsoleLogin();
    // BOTH env vars → dir (pre-seeded, no onboarding): the console login's
    // .credentials.json wipe AND the minted primaryApiKey land in the isolated
    // dir; ~/.claude and ~/.claude.json are untouched. capture reads the dir.
    const q = JSON.stringify(dir);
    const loginCmd = `CLAUDE_CONFIG_DIR=${q} CLAUDE_SECURESTORAGE_CONFIG_DIR=${q} claude auth login --console`;
    res.json({ success: true, id, loginCmd });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/accounts/console-login/:id/capture', (req, res) => {
  try { res.json({ success: true, ...accounts.captureConsoleLogin(req.params.id, req.body || {}) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// ── Codex multi-subscription: same idea via CODEX_HOME. Codex has no auth-only
// relocation env, so each account is an isolated CODEX_HOME whose sessions/ +
// config.toml SYMLINK the shared ~/.codex — auth.json is real per-account,
// threads land in the shared sessions dir (unified discovery). `codex login`
// prints an OAuth URL to a hosted callback (headless-friendly). ──
app.post('/api/accounts/codex-subscription', (req, res) => {
  try {
    const { id, dir } = accounts.createCodexSubscription(req.body || {});
    // --device-auth: prints a URL + one-time code (no localhost:1455 callback
    // server), so it works when the browser is on a DIFFERENT machine than this
    // server (team/remote deploys) — same headless philosophy as claude's
    // paste-code login. CODEX_HOME points at the isolated per-account dir.
    const loginCmd = `CODEX_HOME=${JSON.stringify(dir)} codex login --device-auth`;
    res.json({ success: true, id, dir, loginCmd });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/accounts/codex-subscription/:id/finalize', (req, res) => {
  try { res.json({ success: true, ...accounts.finalizeCodexSubscription(req.params.id) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// ── Session status (agent-set via vibespace-status CLI, user-overridable) ──
// The user's override of an agent-set status is injected as a system-reminder
// into the NEXT chat message (see ws-handler chat-input) so the agent learns
// the user disagreed with its self-assessment.
const { SessionStatusManager } = require('./src/session-status');
const sessionStatus = new SessionStatusManager({
  dataDir: path.join(__dirname, 'data'),
  onChange: (statuses) => {
    const json = JSON.stringify({ type: 'session-status-updated', statuses });
    wss.clients.forEach(c => { if (c.readyState === WS_OPEN) { try { c.send(json); } catch {} } });
  },
});
function sessionStatusKey(session, id) {
  const bsid = session?.backendSessionId || session?.claudeSessionId;
  return bsid ? `${session.backend || 'claude'}:${bsid}` : `webui:${id}`;
}
// ── Global user-facing TODO list (vibespace-ask) — items an agent filed that
// need the USER (decision/input/review). Merged inbox in the taskbar; each
// item belongs to one session and jumps back to it.
const { UserTodoManager } = require('./src/user-todos');
const userTodos = new UserTodoManager({
  dataDir: path.join(__dirname, 'data'),
  onChange: (todos) => {
    const json = JSON.stringify({ type: 'user-todos-updated', todos });
    wss.clients.forEach(c => { if (c.readyState === WS_OPEN) { try { c.send(json); } catch {} } });
  },
});
app.get('/api/user-todos', (req, res) => res.json({ todos: userTodos.snapshot() }));
// User actions from the panel: done / dismissed / open (reopen)
app.post('/api/user-todos/:id', (req, res) => {
  try { res.json({ success: true, item: userTodos.setStatus(req.params.id, req.body?.status, 'user') }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
// Agent endpoint (vibespace-ask) — per-session vsst_ token, same auth model as
// /api/agent/session-status; writes scoped to the calling agent's own session.
// ── Agent-facing routes ── (extracted to src/agent-routes.js in the 2.92.0 split)
const { setupAgentRoutes } = require('./src/agent-routes');
setupAgentRoutes({ app, activeSessions, tasks, sessionStatus, SessionStatusManager, userTodos, sessionStatusKey, serverSetting, scheduleCtxSync, remoteCtxBaseFor, readUserState: () => persistenceRouter.readUserState() });
app.get('/api/agent-hooks', (req, res) => res.json(agentHooksStatus()));
app.post('/api/agent-hooks/install', (req, res) => {
  createHookHelper(); // regenerate the script too (repair path)
  const results = ensureAgentHooks({ auto: false }); // explicit → clears any opt-out
  res.json({ success: true, results, status: agentHooksStatus() });
});
app.post('/api/agent-hooks/uninstall', (req, res) => {
  removeAgentHooks();
  res.json({ success: true, status: agentHooksStatus() });
});

// ── Hosts (the MACHINE registry — ssh hosts AND dial-out devices, B-f3e8) ──
const { HostManager } = require('./src/hosts');
const hosts = new HostManager({ dataDir: path.join(__dirname, 'data') });
const bcastAll = (msg) => { const j = JSON.stringify(msg); wss.clients.forEach(c => { if (c.readyState === WS_OPEN) { try { c.send(j); } catch {} } }); };
// B-f3e8 one-time migration: dial-tokens.json (deviceId → sha256) folds into
// the dial host records (dialTokenHash) — see hosts.migrateDialTokenFile.
try { hosts.migrateDialTokenFile(path.join(AGENTD_DIR, 'dial-tokens.json')); }
catch (e) { console.warn('[hosts] dial-token migration failed:', e.message); }
hosts.dialOnline = (deviceId) => agentdDials.has(deviceId);
const { MachineMounts } = require('./src/machine-mounts');
const machineMounts = new MachineMounts({
  dataDir: path.join(__dirname, 'data'), hosts, mountTokens,
  publicUrl: () => { try { return serverSetting('agentd.publicUrl') || null; } catch { return null; } },
  localPort: () => PORT, // the agentd tunnel's target: our own /dav
  rcloneBin: () => mounts.rcloneBin(),
  broadcast: bcastAll,
  log: (m) => console.log('[machine-mounts]', m),
});
setTimeout(() => { machineMounts.restore().catch(() => {}); }, 5000); // heal pull mounts + re-own push tunnel ports
app.get('/api/machine-mounts', (req, res) => res.json({ mounts: machineMounts.list() }));
app.post('/api/machine-mounts/:hostId', async (req, res) => {
  try {
    const b = req.body || {};
    if (b.dir === 'pull') {
      res.json(await machineMounts.mountPull(req.params.hostId, { remotePath: b.remotePath, mountpoint: b.mountpoint }));
    } else {
      // PRIMARY transport = the agentd tunnel (inside mountPush — no public
      // address needed). The request-derived URL is only the last-resort
      // fallback for hosts without the device agent.
      let pub = b.publicUrl ? String(b.publicUrl) : null;
      if (!pub) { const proto = req.headers['x-forwarded-proto'] || 'http'; const host = req.headers['x-forwarded-host'] || req.headers.host; if (host) pub = `${proto}://${host}`; }
      res.json(await machineMounts.mountPush(req.params.hostId, { folder: b.folder, mode: b.mode, mountpoint: b.mountpoint, publicUrlFallback: pub }));
    }
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.delete('/api/machine-mounts/:id', async (req, res) => {
  try { res.json(await machineMounts.unmount(String(req.params.id))); } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/machine-mounts/:id/remount', async (req, res) => {
  try { res.json(await machineMounts.remount(String(req.params.id))); } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── Port forwarding (B-0b60, tunnel path): expose a machine's loopback
// service at http://127.0.0.1:<localPort> on this instance, over the agentd
// data plane (no frps / public exposure). ──
const { PortForwardManager } = require('./src/port-forward');
const portForwards = new PortForwardManager({
  dataDir: path.join(__dirname, 'data'), hosts, broadcast: bcastAll,
  log: (m) => console.log('[port-forward]', m),
});
setTimeout(() => { portForwards.restore().catch(() => {}); }, 5500);
app.get('/api/port-forwards', (req, res) => res.json({ forwards: portForwards.list() }));
app.get('/api/hosts/:id/ports', async (req, res) => {
  try { res.json({ ports: await portForwards.detect(req.params.id) }); } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/hosts/:id/port-forward', async (req, res) => {
  try { res.json(await portForwards.forward(req.params.id, (req.body || {}).port, { label: (req.body || {}).label || '' })); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.delete('/api/port-forward/:id', async (req, res) => {
  try { await portForwards.unforward(String(req.params.id)); res.json({ ok: true }); } catch (e) { res.status(400).json({ error: e.message }); }
});
// public exposure (frp relay) — publish/unpublish a forward
app.post('/api/port-forward/:id/publish', async (req, res) => {
  try { res.json(await portForwards.publish(String(req.params.id))); } catch (e) { res.status(400).json({ error: e.message }); }
});
app.delete('/api/port-forward/:id/publish', async (req, res) => {
  try { await portForwards.unpublish(String(req.params.id)); res.json({ ok: true }); } catch (e) { res.status(400).json({ error: e.message }); }
});
setTimeout(() => { try { hosts.sweepJsonlCache(); } catch {} }, 60000); // orphaned/stale remote-transcript cache
const { RemoteFs } = require('./src/remote-fs');
const remoteFs = new RemoteFs(hosts);
app.get('/api/hosts', (req, res) => {
  const k = hosts.keyInfo();
  res.json({ hosts: hosts.list(), key: { exists: k.exists, path: k.path, publicKey: k.publicKey } });
});
app.post('/api/hosts', (req, res) => {
  try { const id = hosts.add(req.body || {}); bcastAll({ type: 'hosts-updated' }); res.json({ success: true, id }); }
  catch (e) { res.status(400).json({ error: e.message }); }
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
    const toolDir = path.dirname(EDITOR_CMD);
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
  try { res.json({ success: true, ...(await hosts.installAgentTools(req.params.id, path.dirname(EDITOR_CMD))) }); }
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

// ── Mounts (rclone S3 mounts + share minting — collaboration P1) ──
// ── Plugins (2.140.0, B-2d44): host-level capabilities with persistent state ──
const { PluginManager } = require('./src/plugins');
const plugins = new PluginManager({
  dataDir: path.join(__dirname, 'data'),
  broadcast: (msg) => {
    const json = JSON.stringify(msg);
    wss.clients.forEach(c => { if (c.readyState === WS_OPEN) { try { c.send(json); } catch {} } });
  },
});
// port-forward can publish a forward publicly via the frp plugin (B-0b60)
portForwards.plugins = plugins;
setTimeout(() => { try { plugins.bootReplay(); } catch (e) { console.warn('[plugins] boot replay:', e.message); } }, 5000);
// CS data-plane deps for hosts.device(id) (2.146.0) — wired SYNCHRONOUSLY.
// (Was a setTimeout(1000); a device dialing in during that window ran mount
// heal / hosts.device() before deps existed → "agentd deps not wired" and a
// failed heal — real xingweil log. The referenced functions are hoisted
// declarations and `hosts` already exists here, so no defer is needed.)
try {
  hosts.agentdDeps = {
    ensureAgentdOnHost, agentdHostToken, deviceForDial,
    bundlePath: path.join(__dirname, 'data', 'bin', 'vibespace-agentd.js'),
    version: require('./package.json').version,
  };
  hosts.dataPlaneOn = () => { try { return !!serverSetting('agentd.dataPlane'); } catch { return false; } };
} catch (e) { console.warn('[agentd] data-plane deps wiring failed:', e.message); }
// Transport B pairing: mint a device id + dial token + the one-liner the user
// runs on the NAT'd device (no ssh needed). Cookie-authed (user action).
// The pairing IS the machine registration — the dial host record carries the
// token hash (B-f3e8); re-pairing an existing name rotates its token in place.
app.post('/api/agentd/dial-pair', (req, res) => {
  try {
    const deviceId = String(req.body?.deviceId || ('dev-' + require('crypto').randomBytes(4).toString('hex'))).replace(/[^\w-]/g, '').slice(0, 32);
    const pair = agentdMintDialPair(deviceId);
    bcastAll({ type: 'hosts-updated' });
    const base = String(req.body?.serverUrl || '').replace(/\/$/, '') || null;
    res.json({
      ...pair,
      command: base
        ? `node vibespace-device.js --dial ${base.replace(/^http/, 'ws')}/api/agentd-dial?device=${deviceId} --dial-token ${pair.dialToken}`
        : null,
      note: 'install the agentd bundle on the device, write the hostToken to <root>/state/token (0600), then run with --dial',
    });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
// (the /api/agentd/devices roster/test/unpair routes retired in B-f3e8 —
// machines are listed by /api/hosts, tested by /api/hosts/:id/test, unpaired
// by DELETE /api/hosts/:id)
const { DialSessionBridge } = require('./src/dial-session-bridge');
const dialBridge = new DialSessionBridge({
  deviceForDial,
  hostTokenFor: (deviceId) => agentdHostToken('dial-' + deviceId),
  log: (m) => console.log('[dial-bridge]', m),
});
// Standalone device install: serve the agentd bundle + installer (public — the
// bundle is not secret; auth is the per-device dial/host token at connect).
// Canonical names since the vibespace-device rename (2.154.x): /agentd.js and
// /agentd-install.* stay as PERMANENT aliases — commands in old docs/pairings
// must keep working.
app.get(['/vibespace-device.js', '/agentd.js'], (req, res) => {
  try { res.type('application/javascript').send(fs.readFileSync(path.join(__dirname, 'data', 'bin', 'vibespace-agentd.js'))); }
  catch { res.status(404).end(); }
});
app.get(['/vibespace-device-install.ps1', '/agentd-install.ps1'], (req, res) => {
  try { res.type('text/plain').send(fs.readFileSync(path.join(__dirname, 'scripts', 'vibespace-agentd-install.ps1'), 'utf-8')); }
  catch { res.status(404).end(); }
});
app.get(['/vibespace-device-install.sh', '/agentd-install.sh'], (req, res) => {
  try { res.type('text/x-shellscript').send(fs.readFileSync(path.join(__dirname, 'scripts', 'vibespace-agentd-install.sh'), 'utf-8')); }
  catch { res.status(404).end(); }
});

app.get('/api/plugins', (req, res) => {
  try { res.json({ plugins: plugins.list() }); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/plugins/:id/status', (req, res) => {
  try { res.json(plugins.status(req.params.id)); } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/plugins/:id/install', async (req, res) => {
  try { res.json(await plugins.install(req.params.id)); } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/plugins/:id/start', (req, res) => {
  try { res.json(plugins.start(req.params.id)); } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/plugins/:id/stop', (req, res) => {
  try { res.json(plugins.stop(req.params.id)); } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/plugins/:id/login', async (req, res) => {
  try { res.json(await plugins.loginStart(req.params.id)); } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/plugins/:id/enabled', (req, res) => {
  try { plugins.setEnabled(req.params.id, !!req.body?.enabled); res.json({ ok: true }); } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/plugins/:id/mode', (req, res) => {
  try { res.json(plugins.setMode(req.params.id, String(req.body?.mode || 'auto'))); } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/plugins/:id/config', (req, res) => {
  try { res.json(plugins.setConfig(req.params.id, req.body || {})); } catch (e) { res.status(400).json({ error: e.message }); }
});

const { MountManager } = require('./src/mounts');
const mounts = new MountManager({
  dataDir: path.join(__dirname, 'data'),
  getSetting: serverSetting,
  broadcast: (msg) => {
    const json = JSON.stringify(msg);
    wss.clients.forEach(c => { if (c.readyState === WS_OPEN) { try { c.send(json); } catch {} } });
  },
});
// Rename guard: bridge-share chroots are filesystem paths under the mount.
// MUST be OUTSIDE the broadcast callback — it was mis-nested inside, so every
// broadcast re-ran it, and a broadcast DURING construction (env-import add →
// _notify → broadcast) referenced `mounts` while it was still in its TDZ,
// throwing "Cannot access 'mounts' before initialization" out of add() before
// it returned the id — which is why an env-provisioned My storage (S3 or
// CephFS) came up `desired: unmounted` on its very first boot.
mounts.pathGuard = (p) => mountTokens.list().some((t) => String(t.root || '').startsWith(p));
setTimeout(() => mounts.restore().catch(e => console.error('[mounts] restore:', e.message)), 2000);
// Hung-mount watchdog: one unreachable backend must never wedge the server
// (libuv threadpool saturation — see mounts.js _healthSweep).
mounts.startHealthWatchdog();
app.locals.mounts = mounts; // files.js circuit breaker asks it about blocked mount roots
// Self-mount guard: a bridge token WE minted = the share points back at this
// instance; fuse→HTTP→self deadlocks the threadpool (real incident).
mounts.selfTokenCheck = (raw) => mountTokens.has(raw);

app.get('/api/mounts', async (req, res) => {
  const cfg = mounts.getMyStorageConfig(); // redacted (no secret)
  res.json({
    mounts: mounts.list(),
    shares: mounts.listShares(),
    env: cfg ? { endpoint: cfg.endpoint, bucket: cfg.bucket, prefix: cfg.prefix, accessKey: cfg.accessKey, configured: cfg.configured, importedFromEnv: cfg.importedFromEnv } : null,
    mountBase: mounts.mountBase,
    mcAvailable: await mounts.mcAvailable(),
    rcloneAvailable: mounts.rcloneAvailable(),
  });
});
app.post('/api/mounts', (req, res) => {
  try { res.json({ success: true, id: mounts.add(req.body || {}) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/mounts/import', (req, res) => {
  try {
    const link = req.body?.link;
    // vibespace-mount:v1 = another instance's WebDAV bridge (scoped bearer token)
    const dav = MountTokens.parseLink ? MountTokens.parseLink(link) : null;
    if (dav) {
      const id = mounts.add({
        type: 'vibespace', origin: 'imported',
        name: req.body?.name || dav.name || 'vibespace-mount',
        mode: dav.mode === 'rw' ? 'rw' : 'ro',
        url: dav.url, bearerToken: dav.token,
        customPath: req.body?.customPath || null,
      });
      return res.json({ success: true, id });
    }
    // vibespace-cephmount:v1 = a direct CephFS subtree share (path-scoped cephx
    // key minted cluster-side) → a normal kernel cephfs mount, no proxy.
    const cm = MountManager.parseCephMountLink(link);
    if (cm) {
      const id = mounts.add({
        type: 'cephfs', origin: 'imported',
        name: req.body?.name || cm.name || 'ceph-share',
        mode: cm.mode === 'rw' ? 'rw' : 'ro',
        cephMonHosts: cm.mons, cephFsName: cm.fsName || 'cephfs',
        cephPath: cm.path, cephUser: cm.user, cephSecret: cm.secret,
        customPath: req.body?.customPath || null,
      });
      return res.json({ success: true, id });
    }
    const p = MountManager.parseShareLink(link);
    const id = mounts.add({
      ...p, origin: 'imported',
      name: req.body?.name || p.name || 'imported-share',
      mode: p.mode === 'rw' ? 'rw' : 'ro',
      customPath: req.body?.customPath || null,
    });
    res.json({ success: true, id });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
// Direct CephFS subtree share — mint a path-scoped key (ceph-mint service).
app.post('/api/mounts/:id/ceph-share', async (req, res) => {
  try { res.json(await mounts.mintCephShare(req.params.id, req.body || {})); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
// My storage config — in-app, canonical (env imported once at first boot)
app.get('/api/mounts/my-storage-config', (req, res) => {
  res.json({ config: mounts.getMyStorageConfig() });
});
app.put('/api/mounts/my-storage-config', (req, res) => {
  try { mounts.setMyStorageConfig(req.body || {}); res.json({ success: true, config: mounts.getMyStorageConfig() }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.delete('/api/mounts/my-storage-config', (req, res) => {
  try { mounts.clearMyStorageConfig(); res.json({ success: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// Mount tokens (WebDAV bridge): mint returns the link ONCE; stored hashed
app.get('/api/mount-tokens', (req, res) => res.json({ tokens: mountTokens.list() }));
app.post('/api/mount-tokens', (req, res) => {
  try {
    const { name, root, mode } = req.body || {};
    const { raw, rec } = mountTokens.mint({ name, root, mode });
    const url = `${req.protocol}://${req.get('host')}`;
    res.json({ success: true, token: raw, davUrl: `${url}/dav`, link: mountTokens.buildLink({ url, raw, rec }), id: rec.id, rec: { id: rec.id, name: rec.name, root: rec.root, mode: rec.mode } });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.delete('/api/mount-tokens/:id', (req, res) => {
  try { mountTokens.revoke(req.params.id); res.json({ success: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// Import an rclone.conf: parse to a preview list, then import selected remotes
app.post('/api/mounts/rclone-conf/parse', (req, res) => {
  try {
    const remotes = MountManager.parseRcloneConf(req.body?.text || '');
    // never echo secret values back — just names/types/param-keys + wraps flag
    res.json({ remotes: remotes.map(r => ({ name: r.name, type: r.type, paramKeys: Object.keys(r.params), wraps: r.wraps })) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/mounts/rclone-conf/import', async (req, res) => {
  try {
    const all = MountManager.parseRcloneConf(req.body?.text || '');
    const want = new Set(req.body?.names || []);
    const mode = req.body?.mode === 'ro' ? 'ro' : 'rw';
    const doMount = req.body?.mount !== false;
    const added = [];
    for (const r of all) {
      if (want.size && !want.has(r.name)) continue;
      if (r.wraps) continue; // can't resolve nested remotes
      try {
        const id = mounts.addFromRcloneRemote(r, { mode });
        added.push({ name: r.name, id });
        if (doMount) { try { await mounts.mount(id); } catch {} }
      } catch (e) { /* skip dupes/invalid, continue */ }
    }
    res.json({ success: true, added });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// rclone availability + one-click install (data/bin, pinned verified version)
app.get('/api/mounts/rclone', (req, res) => res.json({ available: mounts.rcloneAvailable(), bin: mounts.rcloneBin() }));
app.post('/api/mounts/rclone/install', async (req, res) => {
  try { res.json({ success: true, ...(await mounts.installRclone()) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// Guided Google Drive OAuth (see mounts.js startDriveAuth for the model).
// With mountId: re-authorize an EXISTING Drive mount/credential using its own
// OAuth client creds (invalid_grant recovery).
app.post('/api/mounts/gdrive-auth/start', async (req, res) => {
  try {
    const { mountId, ...opts } = req.body || {};
    res.json(mountId ? await mounts.startDriveAuthForMount(mountId) : await mounts.startDriveAuth(opts));
  } catch (e) { res.status(400).json({ error: e.message }); }
});
// Write a minted token back into an existing Drive record + bounce its mounts
app.post('/api/mounts/:id/drive-token', async (req, res) => {
  try { await mounts.applyDriveToken(req.params.id, req.body?.token); res.json({ success: true, mounts: mounts.list() }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/mounts/gdrive-auth/status', (req, res) => res.json(mounts.driveAuthStatus()));
app.post('/api/mounts/gdrive-auth/callback', async (req, res) => {
  try { res.json(await mounts.forwardDriveCallback(req.body?.url)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/mounts/gdrive-auth/cancel', (req, res) => { mounts.cancelDriveAuth(); res.json({ success: true }); });
// Shared Drive picker (2.131.0): list the Shared Drives a drive credential can
// see — by existing record id, or transiently by pasted token (add dialog).
app.post('/api/mounts/shared-drives', async (req, res) => {
  try { res.json({ drives: await mounts.listSharedDrives(req.body || {}) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
// Gmail guided OAuth (2.134.0) — mirrors the gdrive-auth UX: start returns the
// consent URL; same-machine completes hands-free via the local listener;
// remote users paste the 127.0.0.1 redirect back to /callback.
app.post('/api/mounts/gmail-auth/start', async (req, res) => {
  try { res.json(await mounts.gmail.startAuth(req.body || {})); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/mounts/gmail-auth/status', (req, res) => res.json(mounts.gmail.authStatus()));
app.post('/api/mounts/gmail-auth/callback', async (req, res) => {
  try { res.json(await mounts.gmail.forwardCallback(req.body?.url)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/mounts/gmail-auth/cancel', (req, res) => { mounts.gmail.cancelAuth(); res.json({ success: true }); });
// Labels picker (2.135.0): the account's real labels for the sync filter.
app.post('/api/mounts/gmail-labels', async (req, res) => {
  try { res.json({ labels: await mounts.listGmailLabels(req.body || {}) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
// Instance-preset Google clients for the UI picker: keys+labels ONLY, never secrets.
app.get('/api/mounts/drive-defaults', (req, res) => {
  const presets = require('./src/mounts').MountManager.drivePresets().map((c) => ({ key: c.key, label: c.label }));
  res.json({ presets, hasDefaultClient: presets.length > 0 });
});

app.post('/api/mounts/my-storage', (req, res) => {
  try { res.json({ success: true, id: mounts.addMyStorage() }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/mounts/:id/share', async (req, res) => {
  try {
    const { folder, mode, name, expiryDays } = req.body || {};
    const out = await mounts.mintShareFromMount(req.params.id, { folder, mode, name, expiryDays });
    res.json({ success: true, ...out });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/mounts/share', async (req, res) => {
  try {
    const env = mounts.envStorage();
    if (!env) return res.status(400).json({ error: 'My storage (VIBESPACE_S3_*) is not configured — shares are minted with your own key' });
    const { folder, mode, name, expiryDays } = req.body || {};
    const prefix = [env.prefix, folder].filter(Boolean).join('/').replace(/\/+/g, '/');
    const out = await mounts.mintShare({
      name, endpoint: env.endpoint, bucket: env.bucket, prefix,
      mode: mode === 'rw' ? 'rw' : 'ro',
      ownerAccessKey: env.accessKey, ownerSecretKey: env.secretKey, expiryDays,
    });
    res.json({ success: true, ...out });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.delete('/api/mounts/shares/:id', async (req, res) => {
  try { await mounts.revokeShare(req.params.id); res.json({ success: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/mounts/:id/mount', async (req, res) => {
  try {
    const ok = await mounts.mount(req.params.id);
    res.json({ success: ok, mounts: mounts.list() });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/mounts/:id/unmount', async (req, res) => {
  try { res.json({ success: await mounts.unmount(req.params.id) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
// Decrypted connection config for the edit dialog (prefill REAL values —
// user directive; cookie-authed, single-user instance model)
app.get('/api/mounts/:id/config', (req, res) => {
  try { res.json(mounts.config(req.params.id)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.patch('/api/mounts/:id', async (req, res) => {
  try { await mounts.update(req.params.id, req.body || {}); res.json({ success: true, mounts: mounts.list() }); }
  catch (e) { res.status(400).json({ error: e.message, mounts: mounts.list() }); }
});
app.post('/api/mounts/:id/duplicate', async (req, res) => {
  try { const id = await mounts.duplicate(req.params.id, req.body || {}); res.json({ success: true, id, mounts: mounts.list() }); }
  catch (e) { res.status(400).json({ error: e.message, mounts: mounts.list() }); }
});
// Credentials (2.108.0): mount points under a credential + manual convert
app.post('/api/mounts/:id/children', (req, res) => {
  try { const id = mounts.addChild(req.params.id, req.body || {}); res.json({ success: true, id, mounts: mounts.list() }); }
  catch (e) { res.status(400).json({ error: e.message, mounts: mounts.list() }); }
});
app.post('/api/mounts/:id/convert', async (req, res) => {
  try { await mounts.convert(req.params.id, req.body?.to === 'credential' ? 'credential' : 'mount'); res.json({ success: true, mounts: mounts.list() }); }
  catch (e) { res.status(400).json({ error: e.message, mounts: mounts.list() }); }
});
app.delete('/api/mounts/:id', async (req, res) => {
  try { await mounts.remove(req.params.id); res.json({ success: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
const { readLayouts, writeLayouts, flushLayouts } = persistenceRouter;

// Session discovery functions imported from ./src/session-store.js
// Helper to create SessionMessages with correct context
function createSessionMessages(session, sessionId) {
  return session?.backend === 'codex'
    ? new CodexSessionMessages(session, sessionId, { buffersDir: BUFFERS_DIR })
    : new SessionMessages(session, sessionId, { buffersDir: BUFFERS_DIR, permissionModes: PERMISSION_MODES });
}

// ── Session API (extracted to src/routes/sessions.js) ──
const { router: sessionsRouter, setup: setupSessions } = require('./src/routes/sessions');
setupSessions({ activeSessions, webuiPids, refreshWebuiPids, createSessionMessages, BUFFERS_DIR, PERMISSION_MODES, execFileSync, hosts, accounts, sessionAuth });
// Backend readiness for onboarding: is each CLI installed + logged in?
// Login detection is best-effort file existence — never spawns the CLIs.
app.get('/api/backend-status', (req, res) => {
  const out = {};
  const probe = (cmd) => {
    try {
      const v = execFileSync(cmd, ['--version'], { encoding: 'utf-8', timeout: 5000 }).trim();
      return { installed: true, version: v.split('\n')[0] };
    } catch { return { installed: false, version: null }; }
  };
  out.claude = probe(CLAUDE_CMD);
  out.claude.loggedIn = false;
  try {
    if (process.platform === 'darwin') {
      execFileSync('security', ['find-generic-password', '-s', 'Claude Code-credentials'], { timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] });
      out.claude.loggedIn = true;
    } else {
      const creds = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude', '.credentials.json'), 'utf-8'));
      out.claude.loggedIn = !!(creds?.claudeAiOauth?.accessToken || creds?.accessToken);
    }
  } catch {}
  if (!out.claude.loggedIn && process.env.ANTHROPIC_API_KEY) out.claude.loggedIn = true;
  out.codex = probe(CODEX_CMD);
  out.codex.loggedIn = false;
  try { out.codex.loggedIn = fs.existsSync(path.join(os.homedir(), '.codex', 'auth.json')); } catch {}
  res.json(out);
});

app.use(sessionsRouter);

// ── Usage / Rate Limit ──
// Usage / rate limits read NON-INVASIVELY from the OAuth token store. Cached,
// refreshed every ~5 min. See _fetchOAuthUsage below for the why.
// ── Usage / Rate Limit ── (extracted to src/usage-routes.js in the 2.92.0 split)
const { setupUsage } = require('./src/usage-routes');
const usage = setupUsage({ app, accounts, hosts, usageHistory, activeSessions, serverSetting, ensureDir, USAGE_CACHE_FILE, USAGE_CACHE_DIR, CODEX_SESSIONS_DIR, META_DIR, AVAILABLE_MODELS, BUFFERS_DIR });
// Normalizer-level settings reads (chat.hideEmptyHooks) go through the REAL store
_MM.getSetting = (k) => { try { return serverSetting(k); } catch { return undefined; } };
const { getOAuthToken, usagePollingEnabled, summarizeCodexRateLimit, summarizeCodexRateLimits } = usage;
app.get('/api/available-models', (req, res) => {
  refreshCodexModels(); // mtime-guarded local read — stays current despite old-CLI cache rewrites
  res.json(AVAILABLE_MODELS);
});
app.get('/api/session-options', (req, res) => {
  res.json({ effortLevels: EFFORT_LEVELS, permissionModes: PERMISSION_MODES });
});

// ── WebSocket Terminal Handler (extracted to src/ws-handler.js) ──
const { registerWsHandler } = require('./src/ws-handler');
registerWsHandler(wss, {
  agentdRemote: { ensureAgentdOnHost, agentdHostToken, agentdDir: AGENTD_DIR, attachBundle: path.join(__dirname, 'data', 'bin', 'vibespace-agentd-attach.js') },
  dialBridge,
  activeSessions, WS_OPEN, broadcastActiveSessions, broadcastToSession, resizeSessionToMin,
  setupSessionPty, refreshWebuiPids, deleteSessionMeta, writeSessionMeta, readSessionMeta,
  readLayouts, writeLayouts, getSyncStore, serverSetting,
  sessionCounterRef, createSessionMessages, PERMISSION_MODES,
  SOCKETS_DIR, BUFFERS_DIR, META_DIR, PTY_WRAPPER, CHAT_WRAPPER,
  NODE_CMD, DTACH_CMD, ENV_CMD, CLAUDE_CMD, CODEX_CMD, EDITOR_CMD, PORT, X_ENV,
  adapterRegistry, pty, path, fs, os, execFileSync, ensureDir, hosts,
  sessionStatus, sessionStatusKey, getTasks: () => tasks, accounts, scheduleCtxSync, activeSessionsPayload,
  USAGE_STATUSLINE_CMD, userStatuslineCmd,
});

// Billing identity for the card badge. Precedence: env-key spawn (definite) →
// the CLI's OWN init statement (apiKeySource: 'none'=subscription OAuth,
// '/login managed key'=console login=API billing, 'ANTHROPIC_API_KEY'=env) →
// spawn-time global-login guess (marked guessed) → unknown. This is what tells
// the user WHICH sessions still burn API money after they re-login to the
// subscription: env-key/console sessions keep their auth for their lifetime.
function sessionAuth(s) {
  const be = s.backend || 'claude';
  if (be === 'codex') {
    // Codex billing identity: named ChatGPT account (isolated CODEX_HOME) or
    // the machine's own ~/.codex login. Feeds the title-bar billing badge.
    if (s._accountId) {
      const a = accounts.get(s._accountId);
      return { source: 'codex-subscription', name: a?.name || 'ChatGPT' };
    }
    return { source: 'codex-cli' };
  }
  if (be !== 'claude') return null; // shell terminals — nothing billed
  if (s._accountId) {
    const a = accounts.get(s._accountId);
    // A named SUBSCRIPTION account bills the subscription (not API) — show its
    // name, no amber key warning.
    if (a && (a.type || 'api') === 'subscription') return { source: 'subscription', name: a.name };
    return { source: 'api-key', name: a?.name || 'API key', tail: a?.tail || null };
  }
  const src = s._apiKeySource;
  if (src === 'none') return { source: 'subscription' };
  if (src === '/login managed key') return { source: 'api-console' };
  if (src === 'ANTHROPIC_API_KEY') return { source: 'api-key', name: 'env key' };
  if (typeof src === 'string' && src) return { source: 'api-other', detail: src };
  const at = s._authAtSpawn;
  if (at === 'subscription') return { source: 'subscription', guessed: true };
  if (at === 'console') return { source: 'api-console', guessed: true };
  if (at === 'env-key') return { source: 'api-key', guessed: true };
  return { source: 'unknown' };
}

// THE single active-sessions payload builder — used by every broadcast AND the
// per-connection initial snapshot (ws-handler). A second hardcoded field list
// anywhere means new fields silently vanish for freshly-(re)connected clients
// until the next organic broadcast (bit us twice: host badges, then auth/todo).
function activeSessionsPayload() {
  const getSessionKey = (session = {}) => {
    const backend = session.backend || 'claude';
    const backendSessionId = session.backendSessionId || session.sessionId || session.claudeSessionId || null;
    return backendSessionId ? `${backend}:${backendSessionId}` : '';
  };
  const activeList = [];
  for (const [id, s] of activeSessions) {
    // Exclude tmux view sessions — they shouldn't appear as separate "live" entries
    if (s.isTmuxView) continue;
    activeList.push({
      id,
      name: s.name,
      cwd: s.cwd,
      host: s.host || null,
      hostName: s.hostName || null,
      createdAt: s.createdAt,
      backend: s.backend || 'claude',
      backendSessionId: s.backendSessionId || s.claudeSessionId || null,
      sessionKey: getSessionKey(s),
      claudeSessionId: s.claudeSessionId || null,
      sourceKind: s.sourceKind || null,
      agentKind: s.agentKind || 'primary',
      agentRole: s.agentRole || '',
      agentNickname: s.agentNickname || '',
      parentThreadId: s.parentThreadId || null,
      // Billing identity badge: which account this session's env was spawned
      // with (null = the CLI's global login / subscription).
      accountId: s._accountId || null,
      accountName: s._accountId ? (accounts.get(s._accountId)?.name || 'API key') : null,
      accountTail: s._accountId ? (accounts.get(s._accountId)?.tail || null) : null,
      todo: s._todos || null, // {done, total, current} — the agent's own TodoWrite/plan
      auth: sessionAuth(s), // billing identity (subscription / api-console / api-key / unknown)
      mode: s.mode || 'terminal',
    });
  }
  return activeList;
}

function broadcastActiveSessions() {
  const msg = JSON.stringify({ type: 'active-sessions', sessions: activeSessionsPayload() });
  wss.clients.forEach(client => {
    if (client.readyState === WS_OPEN) {
      try { client.send(msg); } catch {}
    }
  });
}

// ── In-container desktop (noVNC through our own cookie auth — src/vnc.js) ──
const { VncManager } = require('./src/vnc');
const vnc = new VncManager({ dataDir: path.join(__dirname, 'data') });
app.get('/api/vnc/status', async (req, res) => {
  try { res.json(await vnc.status()); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/vnc/start', async (req, res) => {
  try { res.json(await vnc.ensureRunning()); } catch (e) { res.status(500).json({ error: e.message }); }
});
// RFB over WebSocket (websockify semantics: binary frames ↔ raw TCP). The
// bridge is the ONLY route to the localhost-bound VNC server, and it sits
// behind the same cookie auth as everything else — single login by design.
const vncWss = new WebSocketServer({ noServer: true });
const agentdDialWss = new WebSocketServer({ noServer: true }); // Transport B dial-in (2.144.0)
function bridgeVncSocket(ws) {
  const net = require('net');
  const sock = net.connect(vnc.port, '127.0.0.1');
  sock.on('data', (d) => {
    if (ws.readyState !== 1) return;
    ws.send(d);
    // Backpressure: a fast framebuffer + slow client would balloon the WS
    // buffer — pause the TCP side until the browser drains.
    if (ws.bufferedAmount > 8 * 1024 * 1024) {
      sock.pause();
      const t = setInterval(() => {
        if (ws.readyState !== 1) { clearInterval(t); return; }
        if (ws.bufferedAmount < 1024 * 1024) { clearInterval(t); sock.resume(); }
      }, 50);
    }
  });
  ws.on('message', (m) => { try { sock.write(m); } catch {} });
  ws.on('close', () => sock.destroy());
  ws.on('error', () => sock.destroy());
  sock.on('close', () => { try { ws.close(); } catch {} });
  sock.on('error', () => { try { ws.close(); } catch {} });
}

// ── Start Server ──
// THE single WebSocket upgrade dispatcher: /ws (main app), /proxy/ (unblocker
// site WebSockets), /api/vnc (desktop bridge). Everything else is destroyed.
server.on('upgrade', (req, socket, head) => {
  const pathname = (req.url || '').split('?')[0];
  const deny = () => { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); };
  if (pathname === '/ws') {
    if (!auth.requestAuthed(req)) return deny();
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  } else if (pathname.startsWith('/proxy/')) {
    if (!auth.requestAuthed(req)) return deny();
    unblocker.onUpgrade(req, socket, head);
  } else if (pathname === '/api/vnc') {
    if (!auth.requestAuthed(req)) return deny();
    vncWss.handleUpgrade(req, socket, head, (ws) => bridgeVncSocket(ws));
  } else if (pathname === '/api/agentd-dial') {
    // Transport B: a remote device's daemon dialing IN. Gated by the per-device
    // dial token (never cookie auth — daemons have no cookies); real protocol
    // auth (vsht_ hello) happens inside the mux on this stream.
    const q = new URL(req.url, 'http://x').searchParams;
    const deviceId = String(q.get('device') || '').slice(0, 64);
    const tok = String(req.headers['x-vibespace-dial-token'] || '');
    const want = hosts.dialTokenHash(deviceId); // pairing credential lives on the host record (B-f3e8)
    const got = tok ? require('crypto').createHash('sha256').update(tok).digest('hex') : null;
    if (!deviceId || !want || got !== want) {
      // observability: a silently deny()'d redial is indistinguishable from
      // "no attempts" in the logs (bit us diagnosing the dead-Mac incident)
      console.log(`[agentd] dial REJECTED for '${deviceId || '?'}' — ${!deviceId ? 'no device id' : !want ? 'no pairing on record' : 'token mismatch'}`);
      return deny();
    }
    agentdDialWss.handleUpgrade(req, socket, head, (ws) => {
      // adapt the ws to the duplex shape Mux consumes
      const listeners = { data: [], close: [], error: [] };
      ws.on('message', (d) => listeners.data.forEach((f) => f(Buffer.isBuffer(d) ? d : Buffer.from(d))));
      ws.on('close', () => listeners.close.forEach((f) => f()));
      ws.on('error', () => listeners.error.forEach((f) => f()));
      const stream = {
        write: (d) => { try { ws.send(d); return true; } catch { return false; } },
        on: (ev, fn) => { listeners[ev]?.push(fn); },
        destroy: () => { try { ws.close(); } catch { } },
      };
      agentdDials.set(deviceId, stream);
      // the device re-dialed with a FRESH stream — drop any cached
      // DeviceManager bound to the previous (dead) stream so the next op
      // rebuilds over this one (stale-stream blank-session fix)
      try { const old = agentdDialDevices.get(deviceId); if (old && old._dialStream !== stream) { old.stop?.(); agentdDialDevices.delete(deviceId); } } catch { }
      try { hosts.invalidateDevice?.('host-dial-' + String(deviceId).replace(/[^\w-]/g, '')); } catch { }
      console.log(`[agentd] device '${deviceId}' dialed in`);
      const waiters = agentdDialWaiters.get(deviceId) || [];
      agentdDialWaiters.delete(deviceId);
      waiters.forEach((r) => r(stream));
      // heal recorded pull mounts + re-own push tunnel ports + flip the UI dot
      try { machineMounts.onMachineLinked(hosts.findByDeviceId(deviceId)?.id); } catch { }
      try { portForwards.onMachineLinked(hosts.findByDeviceId(deviceId)?.id); } catch { }
      try { bcastAll({ type: 'hosts-updated' }); } catch { }
      ws.on('close', () => {
        if (agentdDials.get(deviceId) === stream) agentdDials.delete(deviceId);
        try { bcastAll({ type: 'hosts-updated' }); } catch { }
      });
    });
  } else {
    socket.destroy();
  }
});

// ── Version / update visibility (⚙ menu shows current + latest at the Update entry) ──
// Latest = the canonical repo's master package.json — fetched LAZILY on
// request only (never a background timer), cached 6h, best-effort: offline
// instances just show the local version.
const versionInfo = { fetchedAt: 0, latest: null, commit: null };
// ── UI-driven self-update (2.111.21): the update runs as a DETACHED op with
// its output in data/update.log; the client shows a progress dialog, keeps
// polling across the restart (KillMode=process / the container supervisor
// leave the detached script alive), and reloads when /api/version changes.
// Replaced the "suddenly opens a terminal that just sits there" flow.
let _selfUpdate = null; // { pid, startedAt }
const _updateLogPath = path.join(__dirname, 'data', 'update.log');
app.post('/api/self-update', (req, res) => {
  try {
    if (!fs.existsSync(path.join(__dirname, 'scripts', 'update.sh'))) return res.status(400).json({ error: 'update script not found' });
    if (_selfUpdate) { try { process.kill(_selfUpdate.pid, 0); return res.json({ success: true, already: true }); } catch { _selfUpdate = null; } }
    try { fs.unlinkSync(_updateLogPath); } catch {}
    const fd = fs.openSync(_updateLogPath, 'a');
    const child = spawn('bash', ['-c', 'bash scripts/update.sh; echo "__UPDATE_EXIT:$?"'], {
      cwd: __dirname, detached: true, stdio: ['ignore', fd, fd],
      env: { ...process.env, VIBESPACE_SUPERVISED: process.env.VIBESPACE_SUPERVISED || '1' },
    });
    fs.closeSync(fd);
    child.unref();
    _selfUpdate = { pid: child.pid, startedAt: Date.now() };
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/self-update/status', (req, res) => {
  let log = '';
  try {
    const st = fs.statSync(_updateLogPath);
    const fd = fs.openSync(_updateLogPath, 'r');
    const len = Math.min(st.size, 6000);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, st.size - len);
    fs.closeSync(fd);
    log = buf.toString('utf8');
  } catch {}
  let running = false;
  if (_selfUpdate) { try { process.kill(_selfUpdate.pid, 0); running = true; } catch {} }
  res.json({ running, log });
});

app.get('/api/version', async (req, res) => {
  if (versionInfo.commit === null) {
    try { versionInfo.commit = execFileSync('git', ['-C', __dirname, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf-8', timeout: 3000 }).trim(); }
    catch { versionInfo.commit = ''; }
  }
  // 15min TTL (was 6h — during active release evenings the gear menu showed
  // "no update" for hours; real report). ?fresh=1 (the update dialog / menu
  // open) bypasses the cache with a 60s floor so clicks can't hammer GitHub.
  const _verTtl = req.query.fresh ? 60 * 1000 : 15 * 60 * 1000;
  if (Date.now() - versionInfo.fetchedAt > _verTtl) {
    versionInfo.fetchedAt = Date.now(); // stamped even on failure — no hammering while offline
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 5000);
      const r = await fetch('https://raw.githubusercontent.com/ProblemFactory/vibespace/master/package.json', { signal: ctl.signal });
      clearTimeout(t);
      if (r.ok) versionInfo.latest = (await r.json()).version || null;
    } catch {}
  }
  res.json({ version: require('./package.json').version, commit: versionInfo.commit || null, latest: versionInfo.latest });
});

// Changelog diff for the update-confirm dialog (user directive: clicking
// Update shows every change between the running and latest versions first).
// Canonical repo's CHANGELOG.md, lazily fetched + cached like /api/version.
function versionNewerThan(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true;
    if ((pa[i] || 0) < (pb[i] || 0)) return false;
  }
  return false;
}
app.get('/api/changelog-diff', async (req, res) => {
  const cur = require('./package.json').version;
  if (Date.now() - (versionInfo.clFetchedAt || 0) > (req.query.fresh ? 60 * 1000 : 15 * 60 * 1000)) {
    versionInfo.clFetchedAt = Date.now(); // stamped even on failure — offline-safe
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch('https://raw.githubusercontent.com/ProblemFactory/vibespace/master/CHANGELOG.md', { signal: ctl.signal });
      clearTimeout(t);
      if (r.ok) versionInfo.changelog = await r.text();
    } catch {}
  }
  const all = [];
  for (const block of String(versionInfo.changelog || '').split(/\n## /).slice(1)) {
    const nl = block.indexOf('\n');
    const head = (nl < 0 ? block : block.slice(0, nl)).trim();
    const ver = (head.match(/^(\d+\.\d+\.\d+)/) || [])[1];
    if (!ver) continue;
    all.push({ version: ver, head, body: nl < 0 ? '' : block.slice(nl + 1).trim() });
  }
  const entries = all.filter((e) => versionNewerThan(e.version, cur));
  // Already on the latest? Show the CURRENT version's own changelog entry
  // (matched, else the newest) instead of an empty dialog (user request).
  const atLatest = entries.length === 0;
  if (atLatest && all.length) entries.push(all.find((e) => e.version === cur) || all[0]);
  res.json({ current: cur, latest: versionInfo.latest || null, entries, atLatest });
});


// ── Prometheus /metrics exporter (opt-in, generic): a SEPARATE listener on
// VIBESPACE_METRICS_PORT, meant for in-cluster scrapes via pod annotations —
// it is never routed through the app ingress/auth, so keep the port un-exposed
// in any public deployment. Hand-rolled text exposition, no dependencies.
const METRICS_PORT = Number(process.env.VIBESPACE_METRICS_PORT || 0);
if (METRICS_PORT > 0) {
  const metricsStarted = Date.now();
  const pkgVersion = (() => { try { return require('./package.json').version; } catch { return ''; } })();
  http.createServer((mreq, mres) => {
    if (!String(mreq.url).startsWith('/metrics')) { mres.writeHead(404); return mres.end(); }
    let watchers = 0, normMsgs = 0;
    try { for (const [, sess] of activeSessions) { watchers += sess.subagentWatchers?.size || 0; normMsgs += sess._normalizer?.total || 0; } } catch {}
    const mu = process.memoryUsage();
    const L = [];
    const g = (name, val, help) => { L.push(`# HELP ${name} ${help}`, `# TYPE ${name} gauge`, `${name} ${val}`); };
    g('vibespace_process_resident_memory_bytes', mu.rss, 'Server process RSS');
    g('vibespace_nodejs_heap_used_bytes', mu.heapUsed, 'V8 heap used');
    g('vibespace_nodejs_heap_total_bytes', mu.heapTotal, 'V8 heap total');
    g('vibespace_live_sessions', activeSessions.size, 'Active (webui-managed) sessions');
    g('vibespace_ws_clients', (typeof wss !== 'undefined' && wss.clients) ? wss.clients.size : 0, 'Connected WebSocket clients');
    g('vibespace_subagent_watchers', watchers, 'Live subagent fs watchers (leak canary)');
    g('vibespace_normalizer_messages', normMsgs, 'Normalized messages held in memory (leak canary)');
    g('vibespace_uptime_seconds', Math.round((Date.now() - metricsStarted) / 1000), 'Server uptime');
    L.push('# HELP vibespace_info Build info', '# TYPE vibespace_info gauge', `vibespace_info{version="${pkgVersion}"} 1`);
    mres.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
    mres.end(L.join('\n') + '\n');
  }).listen(METRICS_PORT, () => console.log(`  metrics exporter on :${METRICS_PORT}`));
}


server.listen(PORT, HOST, () => {
  const ver = require('./package.json').version;
  console.log(`\n  VibeSpace v${ver} running at http://localhost:${PORT}`);
  // PID file for the supervised-restart path (scripts/update.sh in a container:
  // no systemd — the entrypoint respawn loop restarts us when update.sh kills
  // this pid; dtach sessions live in the same PID namespace and survive).
  try { fs.writeFileSync(path.join(__dirname, 'data', 'server.pid'), String(process.pid)); } catch {}
  console.log(`  dtach: ${DTACH_CMD}, node: ${NODE_CMD}, env: ${ENV_CMD}, claude: ${CLAUDE_CMD}, codex: ${CODEX_CMD}`);
  if (process.platform === 'linux') console.log(`  X display: ${X_ENV.DISPLAY || '(none)'}${X_ENV.XAUTHORITY ? ' (xauth: ' + X_ENV.XAUTHORITY + ')' : ''} — clipboard image paste ${X_ENV.probed ? 'ready' : 'UNAVAILABLE (no working X display found)'}`);

  // M1 (opt-in): bring up the device agent BEFORE restore so re-adopted
  // sessions attach through it too. Gated hard — off by default, so a normal
  // instance never spawns a daemon (see attachToDtach).
  if (serverSetting('agentd.sessions')) {
    try {
      const { DeviceManager } = require('./src/agentd/client.js');
      deviceMgr = new DeviceManager({
        dataDir: path.join(__dirname, 'data'),
        bundlePath: path.join(__dirname, 'data', 'bin', 'vibespace-agentd.js'),
        version: require('./package.json').version,
        nodeModules: path.join(__dirname, 'node_modules'),
        log: console.log,
      });
      deviceMgr.connect().then(() => console.log('  agentd: device session routing ENABLED')).catch((e) => {
        console.warn('  agentd: could not reach the daemon — local pty fallback:', e.message);
        deviceMgr = null; // fall back cleanly
      });
    } catch (e) { console.warn('  agentd: init failed — local pty fallback:', e.message); deviceMgr = null; }
  }

  // Restore existing dtach sessions from before restart
  restoreSessions();

  // Orphan sweep — AGE-BASED (2.89.1). The activeSessions-keyed sweep was a
  // real data-loss race: a live dtach session the restore didn't re-adopt
  // within 30s (or re-adopted under a different id after meta corruption) had
  // its buffer UNLINKED while the wrapper kept writing the deleted inode —
  // live streaming looked fine, but every restart rebuilt history without the
  // buffer ("重启之后消息就都没了", real incident). Dead buffers stop being
  // WRITTEN, so age is race-free by construction: only files untouched for
  // 7 days are ever deleted, and never for a currently-active session.
  setTimeout(() => {
    let swept = 0;
    const cutoff = Date.now() - 7 * 86400000;
    try {
      for (const fn of fs.readdirSync(BUFFERS_DIR)) {
        const m = fn.match(/^(.+)\.(buf|json)$/);
        if (!m || activeSessions.has(m[1])) continue;
        try {
          const st = fs.statSync(path.join(BUFFERS_DIR, fn));
          if (st.mtimeMs > cutoff) continue; // recently written → possibly a live-but-unadopted session
          fs.unlinkSync(path.join(BUFFERS_DIR, fn)); swept++;
        } catch {}
      }
    } catch {}
    if (swept) console.log(`  Swept ${swept} orphaned session-buffer files (>7d untouched)`);
  }, 30000);

  console.log(`  Ready.\n`);
});

// On server shutdown: only kill the attach PTYs, NOT the dtach sessions
// Claude processes in dtach survive the server restart
function shutdown() {
  for (const [, s] of activeSessions) { try { if (s.pty) s.pty.kill(); } catch {} }
  // SyncStores + layouts persist on a debounce — flush so changes made within
  // the last couple seconds aren't lost across a restart
  for (const store of Object.values(syncStores)) { try { store.flush(); } catch {} }
  try { flushLayouts(); } catch {}
  try { sessionStatus.flush(); } catch {} // debounced session-status writes
  try { userTodos.flush(); } catch {} // debounced user-todo writes
  process.exit(0);
}
process.on('SIGINT', () => {
  console.log('\n  Shutting down (dtach sessions will keep running)...');
  shutdown();
});
process.on('SIGTERM', shutdown);
