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
const { SyncStore } = require('./src/sync-store');
const { cwdToProjectDir, SessionMessages, findSessionJsonlPath } = require('./src/session-store');
const { CodexSessionMessages } = require('./src/codex-session-store');
const { normalizeCodexSource, CODEX_SESSIONS_DIR } = require('./src/adapters/codex');
const { createAdapterRegistry } = require('./src/adapters');
const fileRoutes = require('./src/routes/files');
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
        return { DISPLAY: d, XAUTHORITY: xa, probed: true };
      } catch {}
    }
  }
  return { DISPLAY: process.env.DISPLAY || '', XAUTHORITY: process.env.XAUTHORITY || '', probed: false }; // best effort
}
const X_ENV = detectXDisplay();
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

  const apiKey = process.env.ANTHROPIC_API_KEY || null;
  getOAuthToken((oauthToken) => {
    if (oauthToken) fetchModels(oauthToken, true);
    else if (apiKey) fetchModels(apiKey, false);
  });
  // Codex: read from ~/.codex/models_cache.json
  try {
    const codexCache = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.codex', 'models_cache.json'), 'utf-8'));
    if (codexCache.models?.length) {
      AVAILABLE_MODELS.codex = [{ id: '', label: 'Default' }, ...codexCache.models.map(m => {
        const ctx = m.context_window ? (m.context_window >= 1000000 ? Math.round(m.context_window / 1000000) + 'M' : Math.round(m.context_window / 1000) + 'k') : '';
        return { id: m.slug, label: (m.display_name || m.slug) + (ctx ? ` (${ctx})` : '') };
      }).filter(m => m.id)];
    }
  } catch {}
}
setTimeout(refreshAvailableModels, 3000);
setInterval(refreshAvailableModels, 3600000); // refresh hourly

const HOST = process.env.HOST || '0.0.0.0';

const app = express();
const server = http.createServer(app);

// ── Optional password auth (VIBESPACE_PASSWORD env / data/auth.json) ──
const { Auth } = require('./src/auth');
const auth = new Auth(path.join(__dirname, 'data'));
{
  const { generated } = auth.ensurePassword({ generateIfMissing: process.env.VIBESPACE_GENERATE_PASSWORD === '1' });
  if (generated) {
    console.log('\n  ╔════════════════════════════════════════════════╗');
    console.log(`  ║  Generated workspace password: ${generated.padEnd(15)} ║`);
    console.log('  ║  (persisted in data/auth.json — set             ║');
    console.log('  ║   VIBESPACE_PASSWORD to choose your own)        ║');
    console.log('  ╚════════════════════════════════════════════════╝\n');
  }
  if (auth.enabled) console.log('  Password auth: ENABLED');
  // getter — auth can be enabled/disabled at runtime via /api/auth/set-password
  Object.defineProperty(app.locals, 'authEnabled', { get: () => auth.enabled });
}

const wss = new WebSocketServer({
  server, path: '/ws',
  // Reject unauthenticated WebSocket upgrades (cookie carries the login token)
  verifyClient: (info) => auth.requestAuthed(info.req),
});

app.use(compression());
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
const PTY_WRAPPER = path.join(__dirname, 'data', 'bin', 'pty-wrapper.js');
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
            const nextThreadId = msg.type === 'session_meta'
              ? payload.id
              : msg.type === 'wrapper_meta'
                ? payload.threadId
                : null;
            const nextThreadName = payload.session_name
              || payload.sessionName
              || payload.threadName
              || payload.name
              || payload.thread?.name
              || null;
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
          const retry = setTimeout(() => { session.subagentWatchers.delete(toolUseId); startSubagentWatcher(toolUseId, agentId, attempt + 1); }, delay);
          session.subagentWatchers.set(toolUseId, { watcher: null, retry });
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
        const watcher = fs.watch(watchFile, () => readNewLines());
        session.subagentWatchers.set(toolUseId, { watcher });
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

            // Claude fork: adopt the new session id. --fork-session makes claude
            // mint a fresh id at startup — the very first system/hook_started
            // line already carries it (verified) — and write a separate JSONL.
            // Without adopting it the WebUI keeps tracking the PARENT id, so the
            // forked window shadows the original (same name/history/resume
            // target) and the fork's transcript is orphaned — indistinguishable
            // from a plain resume. One-shot _forkRequested guard (set only when
            // data.fork) so a normal resume, whose id the parser also sees on
            // every line, can never be hijacked.
            if (session._forkRequested && typeof msg.session_id === 'string' && msg.session_id
                && session.backendSessionId !== msg.session_id) {
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
                effort: session._effort || null,
                  createdAt: session.createdAt,
                  webuiSessionId: id,
                  mode: session.mode,
                });
              }
              broadcastActiveSessions();
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
            if (msg.type === 'system' && msg.subtype === 'task_notification' && msg.tool_use_id) {
              stopSubagentWatcher(msg.tool_use_id);
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
    broadcastActiveSessions();
  });
}

// Read/write session metadata
function readSessionMeta(sockName) {
  try { return JSON.parse(fs.readFileSync(path.join(META_DIR, sockName + '.json'), 'utf-8')); } catch { return {}; }
}
function writeSessionMeta(sockName, meta) {
  ensureDir(META_DIR);
  fs.writeFileSync(path.join(META_DIR, sockName + '.json'), JSON.stringify(meta));
}
function deleteSessionMeta(sockName) {
  try { fs.unlinkSync(path.join(META_DIR, sockName + '.json')); } catch {}
}

// Attach a PTY to an existing dtach socket for I/O
function attachToDtach(id, socketPath, session) {
  const attachPty = pty.spawn(DTACH_CMD, ['-a', socketPath, '-E', '-r', 'winch'], {
    name: 'xterm-256color', cols: 120, rows: 30,
    env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
  });
  setupSessionPty(session, id, attachPty);
}

// On startup, reconnect to existing dtach sockets
function restoreSessions() {
  ensureDir(SOCKETS_DIR);
  ensureDir(BUFFERS_DIR);
  const sockets = fs.readdirSync(SOCKETS_DIR).filter(f => f.startsWith('cw-'));
  if (!sockets.length) return;

  console.log(`  Found ${sockets.length} existing session(s), reconnecting...`);
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
    try {
      const wrapperMeta = JSON.parse(fs.readFileSync(path.join(BUFFERS_DIR, id + '.json'), 'utf-8'));
      if (wrapperMeta.mode === 'chat') sessionMode = 'chat';
      if (wrapperMeta.streaming != null) wrapperStreaming = !!wrapperMeta.streaming;
      if (wrapperMeta.goal) { wrapperGoal = wrapperMeta.goal; wrapperGoalStatus = wrapperMeta.goalStatus || null; wrapperGoalElapsed = wrapperMeta.goalElapsed || 0; wrapperGoalTokens = wrapperMeta.goalTokensUsed || 0; }
    } catch {}

    let savedBuffer = '';
    try { savedBuffer = fs.readFileSync(path.join(BUFFERS_DIR, id + '.buf'), 'utf-8'); } catch {}

    const session = {
      mode: sessionMode,
      pty: null, clients: new Map(),
      cwd: meta.cwd || os.homedir(),
      host: meta.host || null,
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
      _taskId: meta.taskId || null, // context task (codex re-injects on next message after restart — idempotent)
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
const cmd = args[0];
const opt = (name) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : undefined; };
const STATES = ['working', 'needs-input', 'blocked', 'review'];
const USAGE = [
  'usage (reports THIS session\\'s own state — for the whole task use: vibespace-task status):',
  '  vibespace-status <working|needs-input|blocked|review> [--urgency low|normal|high|urgent] [--reason "why"]',
  '  vibespace-status clear      remove the indicator',
  '  vibespace-status show       print the current indicator',
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
  await post({ state: cmd, urgency: opt('urgency'), reason: opt('reason') });
  console.log('status set: ' + cmd + (opt('urgency') ? ' / ' + opt('urgency') : ''));
}
main().catch((e) => { console.error('vibespace-status:', e.message); process.exit(1); });
`;
  fs.writeFileSync(STATUS_CMD, script, { mode: 0o755 });
}
createStatusHelper();

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
      const taskId = process.env.VIBESPACE_TASK_ID;
      if (!taskId) return process.exit(0);
      path = '/api/agent/task-context?taskId=' + encodeURIComponent(taskId);
    } else if (event === 'UserPromptSubmit') {
      path = '/api/agent/prompt-context';
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
  const reg = `#!/usr/bin/env node
import { readFileSync, writeFileSync, renameSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
const hookCmd = 'node ' + join(dirname(fileURLToPath(import.meta.url)), 'vibespace-hook.mjs');
const EVENTS = ['SessionStart', 'UserPromptSubmit'];
const files = [
  { f: join(homedir(), '.claude', 'settings.json'), create: false },
  { f: join(homedir(), '.codex', 'hooks.json'), create: true },
];
const findOur = (list) => { for (const g of (Array.isArray(list) ? list : [])) { const h = (g.hooks || []).find(h => typeof h.command === 'string' && h.command.includes('vibespace-hook.mjs')); if (h) return h; } return null; };
for (const { f, create } of files) {
  try {
    let root = null; try { root = JSON.parse(readFileSync(f, 'utf-8')); } catch { root = null; }
    if (!root) { if (existsSync(f)) continue; if (!create) continue; root = {}; }
    if (!root.hooks || typeof root.hooks !== 'object') root.hooks = {};
    let changed = false;
    for (const ev of EVENTS) {
      if (!Array.isArray(root.hooks[ev])) root.hooks[ev] = [];
      const ours = findOur(root.hooks[ev]);
      if (ours) { if (ours.command !== hookCmd) { ours.command = hookCmd; changed = true; } }
      else { root.hooks[ev].push({ hooks: [{ type: 'command', command: hookCmd, timeout: 10 }] }); changed = true; }
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
    try { found = HOOK_EVENTS.map(ev => root ? _findOurHookIn(root.hooks?.[ev]) : null); } catch { found = HOOK_EVENTS.map(() => null); }
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
        for (const ev of HOOK_EVENTS) {
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
        for (const ev of HOOK_EVENTS) {
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
// Remote fs (Files cross-host) — resolved lazily; `hosts` is created below.
app.locals.getRemoteFs = () => remoteFs;
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

// Editor: open request from editor-helper.sh (via HTTP, not terminal output)
app.post('/api/editor/open', (req, res) => {
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

syncStores.drafts = new SyncStore('drafts', path.join(__dirname, 'data', 'drafts.json'), wss);
syncStores.settings = new SyncStore('settings', path.join(__dirname, 'data', 'settings-sync.json'), wss);
syncStores.uploads = new SyncStore('uploads', path.join(__dirname, 'data', 'uploads-sync.json'), wss);

setupPersistence({ dataDir: path.join(__dirname, 'data'), wss, WS_OPEN, getSyncStore, activeSessions, auth,
  getHosts: () => hosts, getMounts: () => mounts, getTasks: () => tasks });
app.use(persistenceRouter);

// ── Tasks (task system P1 — docs/design-task-system.md) ──
// data/tasks.json is AUTHORITATIVE for everything the board renders; the
// one-time Groups migration (sessionGroups/groupFolders → kind:'group' tasks)
// runs in the constructor, guarded by tasks.json existence.
const { TaskManager } = require('./src/tasks');
const tasks = new TaskManager({
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
app.get('/api/session-status', (req, res) => res.json({ statuses: sessionStatus.snapshot() }));
// User set/override/clear from the UI (cookie-authed like every route)
app.post('/api/session-status', (req, res) => {
  const { sessionKey, state, urgency, reason, clear } = req.body || {};
  if (!sessionKey || typeof sessionKey !== 'string') return res.status(400).json({ error: 'sessionKey required' });
  try {
    const rec = clear ? sessionStatus.clear(sessionKey, 'user') : sessionStatus.setByUser(sessionKey, { state, urgency, reason });
    res.json({ success: true, status: rec });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
// Agent endpoint — authenticated ONLY by the per-session token spawned into
// the agent's env (VIBESPACE_SESSION_TOKEN); exempt from cookie auth in
// auth.middleware. The token scopes writes to the agent's own session.
app.post('/api/agent/session-status', (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.body?.token;
  if (!token || !token.startsWith('vsst_')) return res.status(401).json({ error: 'missing session token' });
  let found = null, foundId = null;
  for (const [id, s] of activeSessions) { if (s.agentToken === token) { found = s; foundId = id; break; } }
  if (!found) return res.status(401).json({ error: 'unknown session token' });
  const key = sessionStatusKey(found, foundId);
  // migrate an early webui:<id> record once the real backend id exists
  if (!key.startsWith('webui:')) sessionStatus.rekey(`webui:${foundId}`, key);
  const { state, urgency, reason, clear, show } = req.body || {};
  try {
    const rec = show ? sessionStatus.get(key)
      : clear ? sessionStatus.clear(key, 'agent')
      : sessionStatus.setByAgent(key, { state, urgency, reason });
    res.json({ success: true, sessionKey: key, status: rec });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
// Resolve the calling agent's session from its per-session bearer token.
// Returns [session, id] or replies 401/403 and returns null.
function agentSession(req, res, { needTask = false } = {}) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.body?.token;
  if (!token || !token.startsWith('vsst_')) { res.status(401).json({ error: 'missing session token' }); return null; }
  for (const [id, s] of activeSessions) {
    if (s.agentToken === token) {
      if (needTask && !s._taskId) { res.status(403).json({ error: 'this session has no context task' }); return null; }
      return [s, id];
    }
  }
  res.status(401).json({ error: 'unknown session token' });
  return null;
}
// SessionStart hook payload (context injection): rendered task state + context
// folder file index + the rules. Fires + injects for Claude (terminal + chat).
// SCOPED to the session's OWN context task — the ?taskId= query is ignored so a
// token can never read another task's context. Records the task version the
// session has now "seen" so UserPromptSubmit only RE-injects on later changes.
app.get('/api/agent/task-context', (req, res) => {
  const hit = agentSession(req, res);
  if (!hit) return;
  try {
    let context = '';
    if (hit[0]._taskId) {
      context = tasks.renderContext(hit[0]._taskId);
      // Only Claude injects the SessionStart output; codex runs the command but
      // ignores it, so don't mark it "seen" for codex (that would starve its
      // UserPromptSubmit delivery).
      if (context && hit[0].backend !== 'codex') {
        try { hit[0]._taskSeenAt = tasks.get(hit[0]._taskId).updatedAt; } catch {}
      }
    }
    res.json({ success: true, context });
  } catch (e) { res.status(404).json({ error: e.message }); }
});
// UserPromptSubmit hook payload — delivered through the harness's own prompt
// hook, NEVER by rewriting the user's message. Three things ride here:
//  1. Task context on the FIRST prompt when SessionStart didn't deliver it
//     (codex — it fires UserPromptSubmit but not SessionStart in app-server).
//  2. A REFRESH of the task context whenever the task changed since the session
//     last saw it — so any task update (objective/plan/progress/status, from
//     the UI or another session's vibespace-task) reaches the agent on its next
//     turn (user request). Gated on updatedAt > _taskSeenAt → no per-turn noise
//     when nothing changed.
//  3. Any pending status-override notice (consumed once).
app.get('/api/agent/prompt-context', (req, res) => {
  const hit = agentSession(req, res);
  if (!hit) return;
  try {
    const parts = [];
    const s = hit[0];
    if (s._taskId) {
      let t = null;
      try { t = tasks.get(s._taskId); } catch { /* deleted */ }
      if (t && t.updatedAt > (s._taskSeenAt || 0)) {
        const fresh = s._taskSeenAt !== undefined; // seen before → this is an UPDATE, not first delivery
        const ctx = tasks.renderContext(s._taskId);
        if (ctx) {
          parts.push(fresh
            ? `The task below was UPDATED since you last saw it — this is the current state (supersedes any earlier copy).\n\n${ctx}`
            : ctx);
          s._taskSeenAt = t.updatedAt;
        }
      }
    }
    const key = sessionStatusKey(s, hit[1]);
    for (const k of [key, `webui:${hit[1]}`]) { // record may still be under webui:<id>
      const notice = sessionStatus.consumeNotice(k);
      if (notice) { parts.push(SessionStatusManager.renderNotice(notice)); break; }
    }
    res.json({ success: true, context: parts.join('\n\n') });
  } catch (e) { res.json({ success: true, context: '' }); }
});
// ── vibespace-task agent endpoints (P3): validated task-level writes,
// SCOPED to the session's own context task (VIBESPACE_TASK_ID at spawn) —
// an agent cannot touch arbitrary tasks. All writes flow through TaskManager,
// so TASK.md regenerates and tasks-updated broadcasts automatically. ──
app.get('/api/agent/task', (req, res) => {
  const hit = agentSession(req, res, { needTask: true });
  if (!hit) return;
  try {
    const t = tasks.get(hit[0]._taskId);
    res.json({ success: true, task: { id: t.id, title: t.title, status: t.status, objective: t.objective, plan: t.plan, progress: (t.progress || []).slice(-10), contextDir: t.contextDir } });
  } catch (e) { res.status(404).json({ error: e.message }); }
});
app.post('/api/agent/task-progress', (req, res) => {
  const hit = agentSession(req, res, { needTask: true });
  if (!hit) return;
  try {
    const t = tasks.addProgress(hit[0]._taskId, { note: req.body?.note, session: sessionStatusKey(hit[0], hit[1]) });
    res.json({ success: true, progress: t.progress.slice(-3) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/agent/task-status', (req, res) => {
  const hit = agentSession(req, res, { needTask: true });
  if (!hit) return;
  try {
    const t = tasks.update(hit[0]._taskId, { status: req.body?.status });
    res.json({ success: true, status: t.status });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/agent/task-plan', (req, res) => {
  const hit = agentSession(req, res, { needTask: true });
  if (!hit) return;
  try {
    const t = tasks.get(hit[0]._taskId);
    const plan = (t.plan || []).map(p => ({ ...p }));
    const { check, uncheck, add } = req.body || {};
    if (typeof add === 'string' && add.trim()) {
      plan.push({ text: add.trim(), done: false });
    } else if (check !== undefined || uncheck !== undefined) {
      const ref = check !== undefined ? check : uncheck;
      const done = check !== undefined;
      // by 1-based index or unique substring
      let idx = -1;
      const n = Number(ref);
      if (Number.isInteger(n) && n >= 1 && n <= plan.length) idx = n - 1;
      else {
        const matches = plan.map((p, i) => [p, i]).filter(([p]) => p.text.includes(String(ref)));
        if (matches.length === 1) idx = matches[0][1];
        else return res.status(400).json({ error: matches.length ? 'ambiguous step — use its number' : 'no matching plan step' });
      }
      plan[idx].done = done;
    } else {
      return res.status(400).json({ error: 'need add, check, or uncheck' });
    }
    const updated = tasks.update(hit[0]._taskId, { plan });
    res.json({ success: true, plan: updated.plan });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
// ── Hook install management (Manage Agents dialog — auto-registers at boot,
// this surfaces status + one-click repair/remove for non-engineers) ──
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

// ── Hosts (ssh host registry for remote sessions — collaboration P2) ──
const { HostManager } = require('./src/hosts');
const hosts = new HostManager({ dataDir: path.join(__dirname, 'data') });
const { RemoteFs } = require('./src/remote-fs');
const remoteFs = new RemoteFs(hosts);
app.get('/api/hosts', (req, res) => {
  const k = hosts.keyInfo();
  res.json({ hosts: hosts.list(), key: { exists: k.exists, path: k.path, publicKey: k.publicKey } });
});
app.post('/api/hosts', (req, res) => {
  try { res.json({ success: true, id: hosts.add(req.body || {}) }); }
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
app.delete('/api/hosts/:id', (req, res) => {
  try { hosts.remove(req.params.id); res.json({ success: true }); }
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
app.get('/api/hosts/:id/recent-cwds', async (req, res) => {
  try {
    const sessions = await hosts.discoverSessions(req.params.id);
    const seen = [];
    for (const s of sessions) { if (s.cwd && !seen.includes(s.cwd)) seen.push(s.cwd); if (seen.length >= 8) break; }
    res.json({ cwds: seen });
  } catch { res.json({ cwds: [] }); }
});

// ── Mounts (rclone S3 mounts + share minting — collaboration P1) ──
const { MountManager } = require('./src/mounts');
const mounts = new MountManager({
  dataDir: path.join(__dirname, 'data'),
  broadcast: (msg) => {
    const json = JSON.stringify(msg);
    wss.clients.forEach(c => { if (c.readyState === WS_OPEN) { try { c.send(json); } catch {} } });
  },
});
setTimeout(() => mounts.restore().catch(e => console.error('[mounts] restore:', e.message)), 2000);

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
    res.json({ success: true, token: rec.id ? undefined : undefined, link: mountTokens.buildLink({ url, raw, rec }), id: rec.id, rec: { id: rec.id, name: rec.name, root: rec.root, mode: rec.mode } });
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

// Guided Google Drive OAuth (see mounts.js startDriveAuth for the model)
app.post('/api/mounts/gdrive-auth/start', async (req, res) => {
  try { res.json(await mounts.startDriveAuth(req.body || {})); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/mounts/gdrive-auth/status', (req, res) => res.json(mounts.driveAuthStatus()));
app.post('/api/mounts/gdrive-auth/callback', async (req, res) => {
  try { res.json(await mounts.forwardDriveCallback(req.body?.url)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/mounts/gdrive-auth/cancel', (req, res) => { mounts.cancelDriveAuth(); res.json({ success: true }); });

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
setupSessions({ activeSessions, webuiPids, refreshWebuiPids, createSessionMessages, BUFFERS_DIR, PERMISSION_MODES, execFileSync, hosts });
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
const https = require('https');
function readUsageCache() {
  try {
    const cached = JSON.parse(fs.readFileSync(USAGE_CACHE_FILE, 'utf-8'));
    return cached?.claude || null;
  } catch {
    return null;
  }
}

function writeUsageCache() {
  if (!_rateLimitCache) return;
  try {
    ensureDir(path.dirname(USAGE_CACHE_FILE));
    const tmpPath = `${USAGE_CACHE_FILE}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify({ claude: _rateLimitCache }, null, 2));
    fs.renameSync(tmpPath, USAGE_CACHE_FILE);
  } catch {}
}

let _rateLimitCache = readUsageCache();
let _codexRateLimitCache = null;
let _codexRateLimitCacheAt = 0;

let _oauthCreds = null; // { accessToken, refreshToken, expiresAt }
let _oauthMtime = 0;

function _readOAuthCreds() {
  try {
    // Linux: .credentials.json
    const credsPath = path.join(os.homedir(), '.claude', '.credentials.json');
    if (fs.existsSync(credsPath)) {
      const stat = fs.statSync(credsPath);
      if (_oauthCreds && stat.mtimeMs === _oauthMtime) return _oauthCreds;
      const raw = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
      const o = raw?.claudeAiOauth;
      if (o?.accessToken) { _oauthCreds = o; _oauthMtime = stat.mtimeMs; return _oauthCreds; }
    }
    // macOS: Keychain
    if (process.platform === 'darwin') {
      // Re-read from Keychain each time (Claude Code may have refreshed)
      try {
        const user = os.userInfo().username;
        const out = execFileSync('security', ['find-generic-password', '-s', 'Claude Code-credentials', '-a', user, '-w'], { encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
        if (out) {
          const o = JSON.parse(out)?.claudeAiOauth;
          if (o?.accessToken) { _oauthCreds = o; return _oauthCreds; }
        }
      } catch {}
    }
  } catch {}
  return _oauthCreds;
}

function getOAuthToken(callback) {
  // READ-ONLY: we NEVER refresh the OAuth token ourselves. Anthropic's refresh
  // tokens rotate (each refresh invalidates the previous one), so calling the
  // refresh endpoint would burn the token Claude Code still has stored — on
  // macOS that lives in the Keychain, which we can't safely rewrite, forcing a
  // daily re-login (issue #20). We only USE a currently-valid access token; if
  // it's expired we return null and skip, letting Claude Code refresh it through
  // its own session activity — the next poll picks up the fresh token. (60s
  // skew so we don't use a token about to expire mid-request.)
  const creds = _readOAuthCreds();
  const token = (creds?.accessToken && (!creds.expiresAt || Date.now() < creds.expiresAt - 60000))
    ? creds.accessToken
    : null;
  if (callback) { callback(token); return; }
  return token;
}

// Non-invasive usage/rate-limit polling via GET /api/oauth/usage.
//
// The old approach made a BILLABLE haiku `POST /v1/messages` every 5 min purely
// to read the unified rate-limit RESPONSE HEADERS — consuming quota to measure
// quota, and (because that call needs a fresh token) driving the token refresh
// that rotates and breaks the macOS Keychain (#20). /api/oauth/usage returns
// the same 5h/7d utilization directly in the body for FREE, with a read-only
// token. It rate-limits HARD on bursts (~5 rapid requests → 429 for 5 min;
// verified), so we poll once per ~5 min and on 429 back off for the advised
// window, keeping the last-known value rather than retry-storming.
let _rateLimitBackoffUntil = 0;

function refreshRateLimit() {
  if (Date.now() < _rateLimitBackoffUntil) return; // honoring a prior 429
  const token = getOAuthToken();                   // read-only; null if expired
  if (!token) return;                              // keep last-known; Claude refreshes the token
  _fetchOAuthUsage(token);
}

function _fetchOAuthUsage(token) {
  // OAuth-only endpoint; a real API key can't read subscription usage.
  if (typeof token === 'string' && token.startsWith('sk-ant-api')) return;
  const req = https.request('https://api.anthropic.com/api/oauth/usage', {
    method: 'GET',
    headers: { 'authorization': `Bearer ${token}`, 'anthropic-beta': 'oauth-2025-04-20', 'anthropic-version': '2023-06-01' },
  }, (res) => {
    let body = '';
    res.on('data', (d) => { body += d; });
    res.on('end', () => {
      if (res.statusCode === 429) {
        const ra = parseInt(res.headers['retry-after'] || '300', 10);
        _rateLimitBackoffUntil = Date.now() + (Number.isFinite(ra) ? ra : 300) * 1000;
        console.warn(`[rate-limit] /api/oauth/usage 429 — backing off ${ra}s (keeping last-known)`);
        return;
      }
      if (res.statusCode !== 200) { console.warn(`[rate-limit] /api/oauth/usage HTTP ${res.statusCode}`); return; }
      try {
        const u = JSON.parse(body);
        // Frontend expects utilization as a 0–1 fraction and resetsAt as unix
        // seconds; the endpoint gives a 0–100 percent and an ISO timestamp.
        const toWin = (w) => (w && typeof w === 'object') ? {
          utilization: (typeof w.utilization === 'number' ? w.utilization : 0) / 100,
          status: (typeof w.utilization === 'number' && w.utilization >= 100) ? 'limited' : 'allowed',
          resetsAt: w.resets_at ? Math.floor(Date.parse(w.resets_at) / 1000) || 0 : 0,
        } : { utilization: 0, status: 'unknown', resetsAt: 0 };
        const fiveHour = toWin(u.five_hour);
        const sevenDay = toWin(u.seven_day);
        // Model-scoped weekly limits (e.g. Anthropic's separate Fable cap) ride
        // in the limits[] array as kind:"weekly_scoped" with scope.model.
        const scopedWeekly = [];
        if (Array.isArray(u.limits)) {
          for (const lim of u.limits) {
            if (lim?.kind === 'weekly_scoped' && lim.scope?.model?.display_name) {
              scopedWeekly.push({
                name: lim.scope.model.display_name,
                utilization: (typeof lim.percent === 'number' ? lim.percent : 0) / 100,
                resetsAt: lim.resets_at ? Math.floor(Date.parse(lim.resets_at) / 1000) || 0 : 0,
                severity: lim.severity || 'normal',
              });
            }
          }
        }
        _rateLimitCache = {
          fiveHour, sevenDay, scopedWeekly,
          overallStatus: (fiveHour.status === 'limited' || sevenDay.status === 'limited') ? 'limited' : 'allowed',
          fetchedAt: Date.now(),
        };
        writeUsageCache();
      } catch {}
    });
  });
  req.on('error', () => {});
  req.end();
}
setTimeout(refreshRateLimit, 5000 + Math.floor(Math.random() * 20000)); // jittered first poll (de-sync from other pollers)
setInterval(refreshRateLimit, 300000); // every 5 min

function normalizeCodexRateLimit(raw, fetchedAt = Date.now()) {
  if (!raw || typeof raw !== 'object') return null;
  const toWindow = (entry, fallbackWindowMinutes) => {
    if (!entry || typeof entry !== 'object') return null;
    const usedPercent = Number(entry.used_percent ?? entry.usedPercent);
    const normalizedPercent = Number.isFinite(usedPercent)
      ? Math.max(0, Math.min(100, usedPercent))
      : 0;
    return {
      utilization: normalizedPercent / 100,
      usedPercent: normalizedPercent,
      windowMinutes: Number(entry.window_minutes ?? entry.windowMinutes) || fallbackWindowMinutes || 0,
      resetsAt: Number(entry.resets_at ?? entry.resetsAt) || 0,
    };
  };

  const fiveHour = toWindow(raw.primary, 300);
  const sevenDay = toWindow(raw.secondary, 10080);
  if (!fiveHour && !sevenDay) return null;

  return {
    limitId: raw.limit_id || raw.limitId || 'codex',
    limitName: raw.limit_name || raw.limitName || '',
    planType: raw.plan_type || raw.planType || '',
    fiveHour,
    sevenDay,
    fetchedAt: Number(fetchedAt) || Date.now(),
  };
}

function readCodexWrapperRateLimit(sessionId) {
  if (!sessionId) return null;
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(BUFFERS_DIR, sessionId + '.json'), 'utf-8'));
    return normalizeCodexRateLimit(meta?.rateLimits, meta?.rateLimitsFetchedAt || meta?.startedAt || Date.now());
  } catch {
    return null;
  }
}

function readLatestCodexRateLimitFromJsonl(filePath) {
  try {
    // Tail read only — we scan from the end anyway, and codex JSONLs can be
    // many MB; reading them whole blocked the event loop on every fallback
    const TAIL = 65536;
    const stat = fs.statSync(filePath);
    let content;
    if (stat.size > TAIL) {
      const fd = fs.openSync(filePath, 'r');
      try {
        const buf = Buffer.alloc(TAIL);
        const n = fs.readSync(fd, buf, 0, TAIL, stat.size - TAIL);
        content = buf.toString('utf-8', 0, n);
        content = content.slice(content.indexOf('\n') + 1); // drop the cut-off first line
      } finally { fs.closeSync(fd); }
    } else {
      content = fs.readFileSync(filePath, 'utf-8');
    }
    const lines = content.split('\n');
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i].trim();
      if (!line || !line.includes('"type":"event_msg"') || !line.includes('"type":"token_count"') || !line.includes('"rate_limits"')) continue;
      const record = JSON.parse(line);
      const timestamp = record?.timestamp ? Date.parse(record.timestamp) : 0;
      const rateLimits = record?.payload?.rate_limits || null;
      const normalized = normalizeCodexRateLimit(rateLimits, Number.isFinite(timestamp) ? timestamp : Date.now());
      if (normalized) return normalized;
    }
  } catch {}
  return null;
}

function listRecentCodexJsonlFiles(limit = 24) {
  const files = [];
  const stack = [CODEX_SESSIONS_DIR];
  while (stack.length) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fp = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fp);
        continue;
      }
      if (!entry.isFile() || !fp.endsWith('.jsonl')) continue;
      try {
        const stat = fs.statSync(fp);
        files.push({ path: fp, mtimeMs: stat.mtimeMs });
      } catch {}
    }
  }
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files.slice(0, limit);
}

function summarizeCodexRateLimit() {
  const now = Date.now();
  if (now - _codexRateLimitCacheAt < 30000) return _codexRateLimitCache;

  let freshest = null;
  for (const [id, session] of activeSessions) {
    if (session.backend !== 'codex' || session.mode !== 'chat') continue;
    const snapshot = readCodexWrapperRateLimit(id);
    if (!snapshot) continue;
    if (!freshest || (snapshot.fetchedAt || 0) > (freshest.fetchedAt || 0)) freshest = snapshot;
  }

  if (!freshest) {
    const recentFiles = listRecentCodexJsonlFiles();
    for (const entry of recentFiles) {
      const snapshot = readLatestCodexRateLimitFromJsonl(entry.path);
      if (!snapshot) continue;
      if (!freshest || (snapshot.fetchedAt || 0) > (freshest.fetchedAt || 0)) freshest = snapshot;
      if (snapshot && snapshot.fetchedAt && (Date.now() - snapshot.fetchedAt) < 5 * 60 * 1000) break;
    }
  }

  _codexRateLimitCache = freshest;
  _codexRateLimitCacheAt = now;
  return _codexRateLimitCache;
}

app.get('/api/usage', (req, res) => {
  res.json({ rateLimit: _rateLimitCache, codexRateLimit: summarizeCodexRateLimit() });
});

app.get('/api/available-models', (req, res) => {
  res.json(AVAILABLE_MODELS);
});
app.get('/api/session-options', (req, res) => {
  res.json({ effortLevels: EFFORT_LEVELS, permissionModes: PERMISSION_MODES });
});

// ── WebSocket Terminal Handler (extracted to src/ws-handler.js) ──
const { registerWsHandler } = require('./src/ws-handler');
registerWsHandler(wss, {
  activeSessions, WS_OPEN, broadcastActiveSessions, broadcastToSession, resizeSessionToMin,
  setupSessionPty, refreshWebuiPids, deleteSessionMeta, writeSessionMeta, readSessionMeta,
  readLayouts, writeLayouts, getSyncStore,
  sessionCounterRef, createSessionMessages, PERMISSION_MODES,
  SOCKETS_DIR, BUFFERS_DIR, META_DIR, PTY_WRAPPER, CHAT_WRAPPER,
  NODE_CMD, DTACH_CMD, ENV_CMD, CLAUDE_CMD, CODEX_CMD, EDITOR_CMD, PORT, X_ENV,
  adapterRegistry, pty, path, fs, os, execFileSync, ensureDir, hosts,
  sessionStatus, sessionStatusKey, getTasks: () => tasks,
});

function broadcastActiveSessions() {
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
      mode: s.mode || 'terminal',
    });
  }
  const msg = JSON.stringify({ type: 'active-sessions', sessions: activeList });
  wss.clients.forEach(client => {
    if (client.readyState === WS_OPEN) {
      try { client.send(msg); } catch {}
    }
  });
}

// ── Start Server ──
// Unblocker WebSocket proxy (for proxied sites' WebSockets, not our /ws)
server.on('upgrade', (req, socket, head) => {
  if (req.url.startsWith('/proxy/')) {
    if (!auth.requestAuthed(req)) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return; }
    unblocker.onUpgrade(req, socket, head);
  }
});

server.listen(PORT, HOST, () => {
  const ver = require('./package.json').version;
  console.log(`\n  VibeSpace v${ver} running at http://localhost:${PORT}`);
  console.log(`  dtach: ${DTACH_CMD}, node: ${NODE_CMD}, env: ${ENV_CMD}, claude: ${CLAUDE_CMD}, codex: ${CODEX_CMD}`);
  if (process.platform === 'linux') console.log(`  X display: ${X_ENV.DISPLAY || '(none)'}${X_ENV.XAUTHORITY ? ' (xauth: ' + X_ENV.XAUTHORITY + ')' : ''} — clipboard image paste ${X_ENV.probed ? 'ready' : 'UNAVAILABLE (no working X display found)'}`);

  // Restore existing dtach sessions from before restart
  restoreSessions();

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
  process.exit(0);
}
process.on('SIGINT', () => {
  console.log('\n  Shutting down (dtach sessions will keep running)...');
  shutdown();
});
process.on('SIGTERM', shutdown);
