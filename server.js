require('./src/server/runtime-boot.js').boot({ rootDir: __dirname }); // lane runtime-floor: FIRST — a newer data/runtime/current node replaces this process (same pid; the unit / run.sh / a pod's entrypoint unchanged), then the [runtime] verdict line + the boot pull's check
// libuv threadpool headroom (default 4): a few fs ops stuck on a dying fuse
// mount used to starve EVERY async fs/dns op server-wide (real outage — see
// mounts.js hung-mount defense). Must be set before the pool first spins up, i.e. before any require that performs async I/O.
process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || '32'; require('./src/server/hub-port.js').claim(); // the B2b cure, law 2: the start word VIBESPACE_START_FD leaves the environment HERE, before the boot's first child (which dtach, the CLI probes) — test-hub-port ⑧ pins the order
const bootTrace = require('./src/server/boot-trace.js').start({ dataDir: require('path').join(__dirname, 'data') }); // THE BOOT HOLDS (B-1319): the boot's own loop clock from here — GET /api/boot-trace, data/boot-trace.json
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const pty = require('node-pty');
const path = require('path');
// STORE TIMING (design 011 lane 1): every named store's sync write / big read is timed from here on (src/timed-sync.js);
// VIBESPACE_STORE_TIMING=0 turns the clock off. On before any store is constructed, so the boot reads are counted.
const storeTiming = require('./src/timed-sync.js');
storeTiming.enable(process.env.VIBESPACE_STORE_TIMING !== '0');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process'); // no sync child here (lane hub-sync-holds: the census — scripts/loop-child-census.mjs)
const compression = require('compression');
const { MessageManager, driftLedgerRows } = require('./src/message-manager');
const { sameToken } = require('./src/pairing-token'); // B-8dda: a vsst_ compare in constant time
const { createMessageManager, feedLive, feedPeerCard } = require('./src/normalizers');
const { Telemetry } = require('./src/telemetry');
const { SyncStore } = require('./src/sync-store');
const { cwdToProjectDir, SessionMessages, findSessionJsonlPath, dedupWebuiSockets } = require('./src/session-store');
const { addressableId } = require('./src/claude-lock-capture'); // verify r5 (channel-withdraw): the roster's own-id rule — a pending fork is nobody's address
const { readChildPids } = require('./src/cli-identity');   // THE process reader — /proc first, ONE `ps` table where there is none, never a fork per item
const { CodexSessionMessages } = require('./src/codex-session-store');
const { normalizeCodexSource, CODEX_SESSIONS_DIR } = require('./src/adapters/codex');
const { createAdapterRegistry } = require('./src/adapters');
const { buildClaudeSubscriptionLoginCommand } = require('./src/claude-subscription-login');
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
if (process.env.CLAUDECODE || process.env.CLAUDE_CODE_CHILD_SESSION || Object.values(process.env).some((v) => String(v).split(path.sep).includes('provider-homes'))) {   // …or a provider conversation's shell of any harness: its plan's home is the fingerprint (lane lg-providers U2 cure)
  const stripped = [], plan = require('./src/server/provider-spawn.js').inheritedPlanNames(process.env), inside = !!(process.env.CLAUDECODE || process.env.CLAUDE_CODE_CHILD_SESSION);   // the plan: only what a home proves; the CLI's own names: only inside Claude Code
  for (const k of Object.keys(process.env)) {
    if ((inside && (k === 'CLAUDECODE' || k === 'CLAUDE_EFFORT' || k.startsWith('CLAUDE_CODE_') || k.startsWith('CLAUDE_WEBUI_'))) || plan.includes(k)) {
      stripped.push(k);
      delete process.env[k];
    }
  }
  if (stripped.length) console.warn(`[env] Server was started from inside an agent conversation — stripped inherited session env (${stripped.join(', ')}) so spawned CLIs run top-level. Without this, spawned sessions never write transcripts and their conversations are LOST on resume.`);
}

// Optional persistent ops log (env-gated no-op without VIBESPACE_OPSLOG_DIR) —
// installed EARLY so the console tee captures the whole boot narrative.
try { require('./src/opslog').setupOpslog(require('./package.json').version); } catch (e) { console.warn('[opslog] init failed:', e.message); }

// NO UPDATE RUNS INSIDE THE BOOT (lane hub-sync-holds, rank 12a; the owner 2026-11-11: «去掉吧»): a restart of ANY cause — the
// unit's respawn, a reboot, run.sh's loop — keeps the version it has. An update has ONE road: ⚙ → Update VibeSpace…
// (scripts/update.sh: pull, install, build, then the restart). The boot pull held the owner's hub 5.5 s before its first loop
// turn, right after update.sh had pulled; it is gone with its module. NO_AUTO_UPDATE (the images) still turns off the boot's
// runtime check (src/server/runtime-boot.js, a child 20 s after listen); «a newer version exists» is GET /api/version (the gear
// menu's vX → vY), which never applies anything.
// A THROWAWAY server — B-ba47 shape H's ONE test (src/server/throwaway-root.js, decided at the boot's first act): a linked worktree, or a temp root handed a temp home
const throwawayRoot = require('./src/server/throwaway-root.js').throwaway(__dirname);

const PORT = process.env.PORT || 3456;
const CLAUDE_CMD_RAW = process.env.CLAUDE_CMD || 'claude';
const CODEX_CMD_RAW = process.env.CODEX_CMD || 'codex';
// Resolve full paths at startup — node-pty's posix_spawnp may not find commands
// if Homebrew/nvm paths (/opt/homebrew/bin) aren't in Node's inherited PATH.
// The agent CLIs are re-resolved at SPAWN time when the boot answer went stale
// (B-a18e, the installer-window restart) ⇒ src/server/cli-cmd.js
const { resolveCmd } = require('./src/server/cli-cmd.js');
const DTACH_CMD = resolveCmd('dtach');
const NODE_CMD = process.execPath; // no ENV_CMD (lane antigravity-spawn-argv): a session's names ride its spawn's env, never an `env K=V` line (src/spawn/line.js)

// ── CLI environment (src/server/cli-env.js, decomposition #14) ──
// X display + adapter registry + CLI capability probes + model registry.
const { X_ENV, detectXDisplay, refreshXEnv, stabilizeXAuth, adapterRegistry,
  CLAUDE_CMD, CODEX_CMD, CODEX_LINUX_SANDBOX_CMD, CODEX_SANDBOX_SUPPORTED,
  CLAUDE_SUBSCRIPTION_LOGIN_HELPER, CLAUDE_SUPPORTS_NAME, PERMISSION_MODES,
  EFFORT_LEVELS, CLAUDE_MODEL_ALIASES, CLAUDE_KNOWN_MODELS, AVAILABLE_MODELS,
  noteModelSeen, refreshAvailableModels, harnessAvailability, noteHarnessModels, cliCmds,
} = require('./src/server/cli-env.js').create({
  rootDir: __dirname, CLAUDE_CMD_RAW, CODEX_CMD_RAW, resolveCmd, serverSetting: (k) => serverSetting(k),
  getOAuthToken: (...a) => getOAuthToken(...a),
  usagePollingEnabled: (...a) => usagePollingEnabled(...a),
  refreshHarnessModels: (...a) => refreshHarnessModels(...a), broadcast: (m) => bcastAll(m), getTelemetry: () => { try { return telemetry; } catch { return null; } }, getPlugins: () => { try { return plugins; } catch { return null; } }, // S9: opencode serve caps verdict → 'harness-caps-updated'; runaway telemetry + the 'opencode-serve' PLUGIN is the autostart switch (lazy — both defined below)
  getHeldPtyIds: () => { try { return [...activeSessions.values()].map((s) => s?._opencodePtyId).filter(Boolean); } catch { return []; } }, // S9 r4: the ONE reader of session._opencodePtyId — the serve-pty reaper's keep set (lazy like getPlugins: activeSessions is declared below)
});
// ── Harness model lists: every descriptor's models({dataDir}) — codex: its CLI's
// own model cache (src/harnesses/codex-models.js); claude's list is cli-env's
// refreshAvailableModels, ACP agents report theirs (noteHarnessModels).
function refreshHarnessModels() {
  for (const h of require('./src/harnesses').list()) {
    if (typeof h.models !== 'function') continue;
    try { const list = h.models({ dataDir: path.join(__dirname, 'data') }); if (list) AVAILABLE_MODELS[h.id] = list; } catch { }
  }
}
refreshHarnessModels();
setTimeout(refreshAvailableModels, 3000);
setInterval(refreshAvailableModels, 3600000); // refresh hourly

const HOST = process.env.HOST || '0.0.0.0';

const app = express();
const hubForm = require('./src/server/hub-port.js').decide(); hubForm.then((d) => require('./src/server/hub-port.js').endBadStart(d)); let hubPort = null; // B2b: the start decides the hub's port (the start word VIBESPACE_START_FD names a start pipe ⇒ piped; no word ⇒ plain, no descriptor looked at) — read before listen, off the loop
const server = http.createServer(app); const hub = require('./src/server/tls.js').create({ app, httpServer: server, dataDir: path.join(__dirname, 'data'), port: PORT, onCertificate: (pem) => require('./src/server/hub-port.js').certificate(pem), serverSetting: (k) => serverSetting(k), getUserTodos: () => userTodos, log: console, tailscaleBin: throwawayRoot && !process.env.VIBESPACE_TAILSCALE_BIN ? null : undefined, step: (name, fn) => bootTrace.step(name, fn) }); // lane https-tailscale: ONE port, two servers — hub.front peeks each connection's first byte (TLS → https, else http), every listener reaches both through hub.attachToServers (test-architecture §89); a throwaway root never asks the real tailscale ⇒ src/server/tls.js

// ── Optional password auth (VIBESPACE_PASSWORD env / data/auth.json) +
//    optional Clerk SSO (VIBESPACE_CLERK_PUBLISHABLE_KEY — src/clerk-auth.js) ──
const { Auth } = require('./src/auth');
const { ClerkAuth } = require('./src/clerk-auth');
const clerkAuth = new ClerkAuth();
const signinWitness = require('./src/server/hub-port.js').piped() ? null : { env: process.env, throwaway: throwawayRoot ? 'throwaway' : false };   // B-dc3f (1): the PLAIN form's witness (主开发 r2341) — the piped form's hub opens no file
const auth = new (require('./src/server/hub-port.js').piped() ? require('./src/server/piped-auth.js').PipedAuth : Auth)(path.join(__dirname, 'data'), { clerk: clerkAuth, witness: signinWitness, todos: () => userTodos });   // B3b-1: piped ⇒ the interface holds the sign-in table, this hub opens no file
{
  const { generated } = auth.ensurePassword({ generateIfMissing: process.env.VIBESPACE_GENERATE_PASSWORD === '1' });
  if (generated) {
    console.log('\n  ╔════════════════════════════════════════════════╗');
    console.log(`  ║  Generated workspace password: ${generated.padEnd(15)} ║`);
    console.log('  ║  (persisted in data/auth.json — set             ║');
    console.log('  ║   VIBESPACE_PASSWORD to choose your own)        ║');
    console.log('  ╚════════════════════════════════════════════════╝\n');
  }
  { const line = auth.bootLine(); if (line) console.log(line); }   // B-dc3f: «ENABLED», or HELD by name while the sign-in file cannot be read
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
app.use(auth.middleware()); // FIRST — the cookie gate + the same-origin rule stand before every route, the auth routes too (test-auth census)
auth.registerRoutes(app);
const cspReports = require('./src/server/csp-reports.js').create({ dataDir: path.join(__dirname, 'data'), file: process.env.VIBESPACE_CSP_REPORTS_FILE, getUserTodos: () => userTodos, log: console }); cspReports.register(app); // lane app-page-csp (q-043 D6): the app page's REPORT-ONLY policy (src/app-csp.js) + POST /api/csp-report — before the json parser (it reads its own ≤ 32 KB)
require('./src/server/frame-host.js').register(app); // lane design-frame-host (B-8679) + frame-host-preview (B-5b2c): GET /frame-host?kind=design|mail|preview|eml|docx — the ONE host document a frame the page makes navigates to, its kind's policy as a real header (a srcdoc frame would run under the app page's); the preview's folder /frame-host/f/<token>/ (a door — src/auth.js)
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
    const launchGround = require('./src/launch-ground.js'); // PURE (B-78db, r4463 fault 2) — required INSIDE the route: test-csp-report runs this route from its own text
    const launchImage = require('./src/launch-image.js'); // PURE (B-78db (B), r4481) — inside the route for the same reason
    const ground = launchGround.groundOf(req.headers.cookie); // the launch ground's OWN cookie (vs_ground: a colour or nothing) — never the session's; test-auth declares this one read
    html = launchImage.withLinks(html, ground); // the home-screen copy's launch image, in the colour the page itself paints first
    html = launchGround.withGround(html, ground); // the launch wears the stored theme's ground from the first paint
    res.set('Cache-Control', 'no-cache'); res.set(...cspReports.header()); // the app page: Content-Security-Policy-Report-Only (never the enforcing header — a later lane's switch)
    res.type('html').send(html);
  } catch { next(); }
});
// THE LAUNCH IMAGE (B-78db (B), 主开发 r4481): a home-screen copy's startup image — ONE solid colour of a listed size, made on request
// (src/launch-image.js; any other size is a 404, any other colour today's dark). A page behind the sign-in like every other
app.get('/launch-image/:size', (req, res) => {
  require('./src/launch-image.js').imageFor(req.params.size, req.query.g).then((png) => {
    if (!png) return res.status(404).end();
    res.set('Cache-Control', 'private, max-age=86400'); res.type('png').send(png);
  }, (e) => { console.warn('[launch-image] ' + (e && e.message)); res.status(500).end(); });
});
app.use(require('./src/server/static-public.js').create(path.join(__dirname, 'public'))); // lane vault-chip-zone-errors: public/ through express.static — every file but a source map (served to nobody; test-csp-report ⑨)
// WebDAV bridge — BEFORE the json body parser (PUT bodies stream to disk).
// Auth = scoped Bearer mount tokens; see src/webdav.js for the security model.
const { MountTokens, registerWebdav } = require('./src/webdav');
const mountTokens = new MountTokens({ dataDir: path.join(__dirname, 'data') });
registerWebdav(app, { tokens: mountTokens });
// Proxied requests must reach unblocker with their body UNREAD — express.json
// consuming a proxied JSON POST forwarded a body-less request that hung the
// target on Content-Length (inc-mt2bpw2f: page rendered, every button dead).
// Skip here rather than mount unblocker earlier: auth must keep covering /proxy/. lane webhook-l1-server: /hook/<slug> + the pairing read their OWN raw bytes after their refusals.
const jsonBody = express.json({ limit: '50mb' }), OWN_BODY_RE = /^\/(?:proxy\/|hook\/|api\/channels\/webhook\/[^/]+\/pair$|api\/feedback\/forward$)/; // lane feedback-forward: the hub's forward door reads ≤ 64 KB AFTER its token
app.use((req, res, next) => (OWN_BODY_RE.test(req.path) || (persistenceRouter.ownsBody && persistenceRouter.ownsBody(req.path)) ? next() : jsonBody(req, res, next)));   // lane sidebar-echo-order r13 (law C): the ops door reads its own body — skipped here by its parser's OWN match (the router's), never a second expression

app.get('/xterm.css', (req, res) => {
  res.sendFile(path.join(__dirname, 'node_modules/@xterm/xterm/css/xterm.css'));
});

// ── Active session tracking (dtach-backed for persistence across server restarts) ──
// dtach is a minimal PTY detach/attach tool — no rendering layer, no mouse interception.
// Claude processes get raw PTY I/O identical to a native terminal.
const activeSessions = new Map();
// B-3f8a: account ids that have a RUNNING session — the merge/creds-rewrite
// guard consults this so a subscription merge never rewrites/removes a creds
// dir under a live session (the CLI re-reads creds per request, mid-turn).
const liveAccountIdSet = () => {
  const s = new Set();
  for (const sess of activeSessions.values()) if (sess?._accountId) s.add(sess._accountId);
  return s;
};
const sessionCounterRef = { value: 0 };
const SOCKETS_DIR = path.join(__dirname, 'data', 'sockets');
{ const f = require('./src/sock-path.js').socketPathFits(path.join(SOCKETS_DIR, 'cw-' + 'x'.repeat(36)), process.platform); if (!f.fits) console.warn(`[boot] socket paths under data/sockets would exceed ${f.max} bytes (${f.bytes}) — dtach cannot bind them; move the checkout to a shorter path`); } // the socket-path census (src/sock-path.js, lane-pairing ④): the operator's depth, said once
const META_DIR = path.join(__dirname, 'data', 'session-meta');
const BUFFERS_DIR = path.join(__dirname, 'data', 'session-buffers');

// ── HOME-RENAME MIGRATION (B-b4a2, one-shot at boot): src/server/home-rename.js — B-8033: one marker per half (the projdirs
// move's with the HOME it changes, ~/.vibespace; the recorded-path rewrite's in this data/)
require('./src/server/home-rename.js').migrateHomeRename({ dataDir: path.join(__dirname, 'data'), metaDir: META_DIR });
const USAGE_CACHE_FILE = path.join(__dirname, 'data', 'usage-cache.json');
// Per-account PASSIVE usage capture (written by data/bin/vibespace-usage, the
// statusLine hook). Key '__global__' = the machine's own login; 'sub-…' = a
// named subscription. This is the ONLY usage source now — VibeSpace makes NO
// background /api/oauth/usage calls with subscription tokens (that off-CLI
// automated pattern is what gets Max/Pro accounts banned; see §ban-safety).
const USAGE_CACHE_DIR = path.join(__dirname, 'data', 'usage-cache');
const USAGE_SCANNER_PATH = path.join(__dirname, 'data', 'bin', 'vibespace-usage-scan');
const PTY_WRAPPER = path.join(__dirname, 'data', 'bin', 'pty-wrapper.js');

// ── CS refactor M1 (opt-in, default OFF): route LOCAL terminal sessions
// through the standing vibespace-agentd daemon. deviceMgr stays null unless
// the local device daemon is ALWAYS on since the 2.175.0 graduation —
// instantiates it, never spawns a daemon, and attachToDtach is byte-identical
// to today. daemonPtyShim presents the node-pty interface over a device
// session handle so setupSessionPty is unchanged.
let deviceMgr = null;
// ── M2 host-level agentd provisioning (always on since the 2.175.0 flag graduation) ──
// Per-host vsht_ token: the vault's entry `host:<id>` once it is set up (LOCKED ⇒ refused `vault_locked` by name; before
// the setup the 0600 file as before) — src/server/host-tokens.js (lane vault-e2e-password-fix-r2); no attach config holds it.
const AGENTD_DIR = path.join(__dirname, 'data', 'agentd');
function ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }
const hostTokens = require('./src/server/host-tokens.js').create({ dataDir: path.join(__dirname, 'data'), agentdDir: AGENTD_DIR, anyHubPin: () => (hosts.held() ? true : hosts.list().filter((h) => !!h.hubPinned).map((h) => h.name || h.id)), nameOf: (k) => { const h = String(k).startsWith('dial-') ? hosts.findByDeviceId(String(k).slice(5)) : hosts.get(k); return (h && h.name) || null; } });   // nameOf: a LOCKED refusal names the machine (lane vault-locked-refusal-notice)
function agentdHostToken(hostId) { return hostTokens.tokenFor(hostId); }
// Install/refresh the daemon on a host, throttled per boot+version: a marker
// records the last version shipped; matching = skip (one ssh round trip saved
// per spawn; a bundle change reinstalls because the version bumps with it).
// ── Dial pairing primitives (src/server/dial-pairing.js, decomposition #13) ──
const { CHAT_WRAPPER, agentdDialDevices, agentdDials,
  agentdMintDialPair, daemonPtyShim, deviceForDial, ensureAgentdOnHost,
  unpairDialDevice, gateDialUpgrade, admitDial, noteDialEvent, lockOutDialHolder, wsStream, adoptDialStream,
} = require('./src/server/dial-pairing.js').create({
  rootDir: __dirname, AGENTD_DIR, bcastAll: (...a) => bcastAll(...a),
  agentdHostToken: (...a) => agentdHostToken(...a), hostTokenLocked: (id) => hostTokens.lockedWhy(id), dropHostToken: (id) => hostTokens.drop(id), hubIdentity: () => hostTokens.identity(), // + lane lg-remote-hardening D3b: this hub's own key
  getHosts: () => { try { return hosts; } catch { return null; } },
  getMounts: () => { try { return mounts; } catch { return null; } },
  getMachineMounts: () => { try { return machineMounts; } catch { return null; } },
  getPortForwards: () => { try { return portForwards; } catch { return null; } },
  getExitProxy: () => { try { return exitProxy; } catch { return null; } }, getDialHealth: () => { try { return dialHealthWatch; } catch { return null; } },
});
// ── Cached webuiPids (PIDs managed by webui dtach sessions) ──
// childPid from the pty-wrapper meta file + that wrapper's children from /proc
// (readChildPids) — NEVER a fork per session: this runs IN-BAND on every kill
// and 3 s after every create, and the `pgrep -P` it replaces cost 9.16 s of
// blocked loop at 61 sessions / 1.5 GB RSS. Fork essay: src/cli-identity.js.
const webuiPids = new Set();

function refreshWebuiPids() {
  webuiPids.clear();
  for (const [id, s] of activeSessions) {
    try {
      const metaPath = path.join(BUFFERS_DIR, id + '.json');
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      if (meta.childPid) {
        webuiPids.add(meta.childPid);
        s._childPid = meta.childPid; s._childIdentity = meta.childStart ? require('./src/proc-identity').identityFromToken(meta.childPid, meta.childStart, meta.childBoot) : null; // its birth (B-5ee1); null = a legacy wrapper's meta
        for (const p of readChildPids(meta.childPid)) webuiPids.add(p);  // claude forks from the node-pty spawn
      }
      if (meta.pid) { webuiPids.add(meta.pid); }
    } catch {}
  }
}

// ── Broadcast helper (avoids duplicating per-session WebSocket iteration) ──
const WS_OPEN = 1;
// Top-level stream-json record types this server KNOWS (2.227.8 breadcrumb).
// Add a type here when you add its handling — until then it announces itself.
const CLAUDE_STREAM_TYPES = new Set([
  'assistant', 'user', 'system', 'result', 'attachment', 'control_request',
  'control_response', 'control_cancel_request', 'tool_progress', 'stream_event', 'summary', // control_cancel_request: the normalizer settles the card it withdraws (a helper stopped mid-ask, lane S1) — listed so the breadcrumb stops crying 'unhandled' (the naive-study log line)
  'rate_limit_event', // handled since 2.289.0 — the set lagged the handler, so the breadcrumb cried 'unhandled' for a handled type (misled the inc-msozeyw2 read)
  'command_lifecycle', 'queued_input', 'queue_changed', 'queue_op_result', 'queue_dropped', 'input_handover', 'queue_settle', 'frame_stamp', 'rewind_out', // command_lifecycle: handled since 2.369.112 — the turn-start carrier of a harness-delivered peer message (inc-mu6bfv1t-4drq); the four queue records are the WRAPPER's (2.369.354, data/bin/chat-wrapper.js holds a mid-turn frame) — the normalizer reads them, the put-back door reads queue_dropped at its gate; input_handover (2.369.361) = what became of a frame handed to the running turn
  'set_in_progress_tool_use_ids', 'compact_progress', 'tombstone', '_stdin_ack', '_stdin_nack', '_remote_state', '_remote_exit', '_fence', // B3 §2.5/§2.10/§2.11: the run set + compaction stage have readers in claude-stream-json.js, tombstone in the normalizer — listed here or the breadcrumb cries 'unhandled' for handled records (the 2.289.0 mistake). Round 4: the first two have never been observed on our stdout (host callbacks swallow them; the live compaction lane is system/status) and tombstone is unverified — the rows stay because the READER exists, which is what this set is about
]);
const _seenStreamTypes = new Set();

// THE session broadcast choke point ⇒ src/server/session-broadcast.js (perf lane
// chunk D): stamps `seq` on the session's own `msg` frames from its op ring and
// cuts a capable client whose send queue stopped draining (ONE `lagged` frame).
const { broadcastToSession } = require('./src/server/session-broadcast.js').createSessionBroadcast();

// ── Usage + pool engine (src/server/usage-pool-engine.js, decomposition #5) ──
const {
  _vsuPending, usageAnchors, usageEstimator,
  armWorkflowUsageWatcher, darkSources, darkTaintedAccounts, kickPoolEval,
  markLimitBanner, maybePoolAutoSwitch, maybePoolAutoSwitchForPool, notePoolAuthFailure, noteTurnStopped, memberRemoved, decideDefaultTarget, fallbackDefaultTarget, removalTargetFor, setConversationPin, gatherPlan, pinAllPlan, pinAll, clearPinsTo, answerCrossProviderAsk, purgePoolMadeMoves, fallbackMoveBack, fallbackStatus, fallbackFactOf,
  maybeRepinLockedModel, maybeStopOnFallback, modelsMatch, onMemberReadingFresh, onMemberLoginSuccess, autoCliReady, memberServeLapsed, lastMemberReadAt, projectionRereadFor, projectionBillingIndex, // …+ the new-member wake (2026-09-08) + its LOGIN half, handed to the account routes (2026-09-29: read there since 2026-09-08, never passed — dead until now)
  apiDerivedWindow, establishedWindows, repairIdentityAnchors, oatAnswer, oatIdentityAttach, oatRebind, // B-855a: the two identity witnesses handed to setupUsage — the panel probe may only write the account it proves — + c2's STANDING identity repair (boot + POST /api/usage/repair-identity)
  poolChooserForModel, poolReadCache, probeUsageForAccountKey, readRawUsageCache, spendGuard, // the ONE raw usage-cache read (overage lives there — design §1.4) + THE SPEND CEILING (§4.4c): ONE authorizer in front of every turn nobody typed, per credential slot, persisted ⇒ src/server/spend-guard.js
  noteTurnRunning, noteTurnStart, noteTurnError, clearStoppedBy, sessionWallVerdict, noteSessionProduced, noteModelRequest, noteCompacted, noteTurnEnd: noteTurnEndEngine, noteWallSignal, noteStreamRecord, recordIsLate, beforeAutoResumeFire, fireIdentityFor, memberLoginState, probeUsageViaSession, recordCodexQuotaSignal, recordRateLimitEvent, resolveUsageKey, noteServedModel, noteModelFallback, servedDefinesModel, rerouteAnnouncedBy, settleTurnLane, // …+ the SERVED-MODEL pair + its FALLBACK PREDICATE (r3-r2: the parse's target-less lock latch asks it, so a classifier substitute never becomes the lock target that defines placement) + the REROUTE THIS RECORD ANNOUNCES (r4: placed BEFORE the served capture at both feeds — the incident's first announcement rides the very record the substitute answered) + the per-turn LANE settle (2026-09-13 r3): both stdout feeds destructure them from the `engine:` literals below, and neither was exported here — the whole round-1 fix was a TypeError in production
  quotaVerdictFor, sessionModelFor, sweepUsageAnchors, usageCacheKeyFor, resetCreditOffer, resetCreditPreview, consumeResetCreditFor, claimColdRestarts, refreshCodexForPerson, settleResetCreditByRead, catchUpResetCreditFromBuffer, // the stored reset credits the auto-resume arm card offers (design-reset-credits §5) + the manual use's preview/POST (p2) + verify r1: the session path's read before a press over an unsettled attempt
  usageIdentityAccountIds, usageIdentityGroups, usageIdentityGroupsCached, cacheFactsOf, flushRequestStamps, // cacheFactsOf + flushRequestStamps: each live conversation's prompt-cache facts for the session list (lane cache-warmth-tiles)
  writeUsageCacheForKey, clearSealedOrders, pushSealedOrders,
  estOverlayCache, predictCalib, heldWordsLifted,
} = require('./src/server/usage-pool-engine.js').create({
  app, rootDir: __dirname, USAGE_CACHE_DIR, activeSessions, wss, WS_OPEN,
  broadcastToSession, getAutoResume: () => { try { return autoResume; } catch { return null; } }, getQuotaProbe: () => { try { return usage.refreshViaCliPanel; } catch { return null; } }, // both lazy: created further down (TDZ otherwise); otelIngest = B-b3cd org verification
  serverNotice: (...a) => serverNotice(...a),
  serverSetting: (...a) => serverSetting(...a),
  harnessSetting: (...a) => harnessSetting(...a), harnessDeclares: (...a) => harnessDeclares(...a), // typed per-harness reads (limitResetCredit / disableModelFallback) — lazy: harnessConfig is built further down
  getAccounts: () => { try { return accounts; } catch { return null; } },
  getHosts: () => { try { return hosts; } catch { return null; } },
  getUsageHistory: () => { try { return usageHistory; } catch { return null; } }, onSessionListChange: () => { try { broadcastActiveSessions(); } catch { } }, // lane auto-resume-bulk: a stop fact appeared / cleared ⇒ the card's chip + the filter's count
  recordUsageAttribution: (...a) => recordUsageAttribution(...a),
  adapterRegistry, readUserState: () => { try { return persistenceRouter.readUserState(); } catch { return {}; } }, getUserTodos: () => { try { return userTodos; } catch { return null; } }, // lazy: the inbox a refused spend is reported in is created further down (TDZ otherwise)
  getSessionMetaStore: () => { try { return { readSessionMeta, writeSessionMeta, patchSessionMeta }; } catch { return null; } }, // lazy too (session-stdout is built below): the ONE use is persisting the classifier-reroute stamp so a RESTORED conversation still knows the CLI answers with a model we did not ask for (r3)
});
// noteTurnEnd ALSO wakes the delivery ladder's retry park (lane notify-retry, 2026-10-01): a parked notification is posted the
// moment the conversation's turn ends (claude `result` / codex `task_complete` / ACP) — the stdout consumers keep the ONE name
const noteTurnEnd = (s, m) => { noteTurnEndEngine(s, m); try { deliver.noteTurnEnd(s); } catch (e) { console.warn('[deliver] turn-end hook failed:', e && e.message); } try { consumeKeptOf(s, m).catch((x) => console.warn('[kept] turn-end consume failed:', x && x.message)); } catch (e) { console.warn('[kept] turn-end consume failed:', e && e.message); } }; // B-a5a4 (2): a resume that RAN consumes its kept copy
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

// ── Native goal status sync (src/server/goal-sync.js) ──
const { checkClaudeGoalStatus } = require('./src/server/goal-sync.js').create({
  hosts: { get fetchSessionJsonl() { return hosts.fetchSessionJsonl.bind(hosts); } }, // lazy — hosts is created later in boot order
  broadcastToSession,
  findSessionJsonlPath: (...a) => findSessionJsonlPath(...a),
});
// ── Session stdout engine (src/server/session-stdout.js, decomposition #6) ──
// setupSessionPty + attachToDtach + the session-meta store.
const { setupSessionPty, attachToDtach, readSessionMeta, writeSessionMeta, patchSessionMeta,
  deleteSessionMeta, sessionMetaOwnerConflict, _metaTombstones,
  applyTaskToolUpdate, emitTaskListTodos, updateSessionTodos, reattachLocalPty, ptyQuietSince, writeSessionInput,
} = require('./src/server/session-stdout.js').create({
  rootDir: __dirname, BUFFERS_DIR, META_DIR, DTACH_CMD, USAGE_SCANNER_PATH,
  CLAUDE_STREAM_TYPES, _seenStreamTypes, activeSessions,
  engine: { _vsuPending, armWorkflowUsageWatcher, kickPoolEval, markLimitBanner, // EVERY name the registered consumers destructure from `engine` must be here — test-fable-cap-pool-storm §10 derives that set from their own `const {…} = engine;` and fails THIS literal (r3: two were missing and every claude chat record became raw output)
    noteModelRequest, // the conversation's last model request — the claude parse's stamp writer (lane cache-warmth-tiles)
    noteCompacted, // a compaction's end resets the cache fact — the claude parse's call (lane cache-warmth-compact)
    maybePoolAutoSwitch, maybeRepinLockedModel, maybeStopOnFallback, notePoolAuthFailure, sessionModelFor, // sessionModelFor: the acp-events wall road's model (lane agy-wall-signal r2)
    modelsMatch, noteSessionProduced, noteTurnEnd, noteTurnStopped, noteWallSignal, noteTurnRunning, noteTurnStart, noteTurnError, recordCodexQuotaSignal, catchUpResetCreditFromBuffer, recordRateLimitEvent, resolveUsageKey, usageEstimator, noteStreamRecord, recordIsLate, noteServedModel, noteModelFallback, servedDefinesModel, rerouteAnnouncedBy, settleTurnLane },   // noteTurnEnd = the hooked wrapper above (the park); catchUpResetCreditFromBuffer = lane reset-path's buffer-file catch-up (codex-events — wired at the 2.369.202 integration)
  checkClaudeGoalStatus, serverNotice: (...a) => serverNotice(...a), // r3749: the owed change's one notice to the person
  broadcastToSession,
  broadcastActiveSessions: (...a) => broadcastActiveSessions(...a),
  noteModelSeen: (...a) => noteModelSeen(...a),
  noteHarnessModels: (...a) => noteHarnessModels(...a), // ACP harnesses learn their model list from the agent (S8)
  recordUsageAttribution: (...a) => recordUsageAttribution(...a),
  daemonPtyShim: (...a) => daemonPtyShim(...a), agentEnv: (...a) => require('./src/ws-handler').agentEnv(...a), onLocalReattach: (...a) => bridgeWatch.afterReattach(...a), // the ONE local re-attach spawns with the sanitized env; every re-attach tells the dead-bridge watch (lane-dead-bridge)
  sbSeenFirst: (...a) => sbSeenFirst(...a),
  getDeviceMgr: () => deviceMgr,
  getHosts: () => { try { return hosts; } catch { return null; } },
  getUsageHistory: () => { try { return usageHistory; } catch { return null; } },
  getTelemetry: () => { try { return telemetry; } catch { return null; } },
  getNoConvoRef: () => { try { return noConvoRef; } catch { return null; } }, getDeliver: () => { try { return deliver; } catch { return null; } }, getPages: () => { try { return publishedPages; } catch { return null; } }, getPermissionRules: () => { try { return permissionRules; } catch { return null; } }, // lazy getters; getPages = SendUserFile hands the user a private link (published-pages is created further down)
  getExitProxy: () => { try { return exitProxy; } catch { return null; } }, // verify-r2 A3-r2 / ask-a: the exit path ends a dead conversation's pairs + asks
  getBrain: () => { try { return sessionBrain; } catch { return null; } }, getSyncStore: (name) => { try { return getSyncStore(name); } catch { return null; } }, // design-unknown-records: the four record→side-effect consumers the parse shares with the device feed (session-brain is created further down); lane stop-refills-composer: Stop's put-back writes the drafts store (built further down — read at record time)
});
// ── Boot restore (src/server/boot-restore.js, decomposition #7) ──
// migrations + restoreSessions + R6 pipe re-open + keeper re-adoption.
const { migrateLegacyHomeProjects, restoreSessions, restoreAgentdPipeSessions,
  readoptOrphanKeeperSessions, probeSockets, probeFacts, stoppedSessions, keepEnded, endFactsBefore, keptRecordOf, consumeKeptOf, // stoppedSessions: the kept metas read back (lane dead-socket-keeps-chat-meta); keepEnded: an end on purpose (lane end-obeys-verdict); keptRecordOf: one ended conversation's record (the resume verb reads it); consumeKeptOf: at a turn end (B-a5a4 (2))
} = require('./src/server/boot-restore.js').create({
  rootDir: __dirname, PORT, BUFFERS_DIR, META_DIR, SOCKETS_DIR, DTACH_CMD,
  NODE_CMD, CHAT_WRAPPER, activeSessions, sessionCounterRef,
  attachToDtach, setupSessionPty, readSessionMeta, writeSessionMeta,
  deleteSessionMeta, broadcastToSession,
  broadcastActiveSessions: (...a) => broadcastActiveSessions(...a),
  refreshWebuiPids: (...a) => refreshWebuiPids(...a),
  getHosts: () => { try { return hosts; } catch { return null; } },
  getDialBridge: () => { try { return dialBridge; } catch { return null; } }, getExitProxy: () => { try { return exitProxy; } catch { return null; } }, note: (line) => bootTrace.note(line), step: (name, fn) => bootTrace.step(name, fn), // B-cd4b unit 3: the later registration batches named in the boot trace · B-92a4: the re-probe un-adopts through the exit proxy's onSessionEnd; its lines ride the boot trace (⚙ Diagnostics)
  agentEnv: (...a) => require('./src/ws-handler').agentEnv(...a), // lane spawn-env-debts: the remote chat re-adopt's transport env (as ws-create's r6Env)
}); bootTrace.span('restore-probes', probeSockets(), probeFacts); // B-1319: the restore's fuser questions and its pairs' side-file reads start now, the questions as children — the server listens once they answered (below); B-92a4: or at the cap, the span naming what did not answer
// ── Agent-tool generators + hook registration (src/server/agent-tool-generators.js) ──
const hooksLate = require('./src/server/hooks-late.js').create({ activeSessions, getSessionStatus: () => sessionStatus, getUserTodos: () => userTodos, sessionStatusKey: (...a) => sessionStatusKey(...a), harnesses: require('./src/harnesses'), log: (...a) => console.log(...a), warn: (...a) => console.warn(...a) }); // lane hooks-create: a hook file CREATED by the registration ('dir-exists') is told to the conversations that predate it (one free note each + ONE For-you line); held until ready() after the boot restore; owns POST /api/cli-config/apply
// lane browser-resource-care (B-afeb): memory pressure reaches the owner — ONE For-you item per episode naming who started each
// process group (fed by sysinfo.startWatch's onSample below); a conversation's own Chrome (debugging port, no keeper mark) is told
const memoryPressure = require('./src/server/memory-pressure-watch.js').create({ activeSessions, BUFFERS_DIR, getUserTodos: () => userTodos, getSessionStatus: () => sessionStatus, sessionStatusKey: (...a) => sessionStatusKey(...a), jobsWiringOf: () => { try { return jobsWiring; } catch { return null; } }, getKeeper: () => { try { return require('./src/server/browser-keeper.js').keeper(); } catch { return null; } }, log: console });
const {
  AGENT_BIN_DIR, EDITOR_DIR, EDITOR_CMD, STATUS_CMD, USAGE_STATUSLINE_CMD, HOOK_CMD,
  createEditorHelper, createStatusHelper, createHookHelper, userStatuslineCmd,
  ensureAgentHooks, stripAgentHookEntries, removeAgentHooks, hookRegistrationSafe, ownerWriteRefusal, refuseOwnerWrite, rootRecovery, rootFactsNow, onRootLanded, // B-1425: the root facts a caller that can wait awaits
  agentHooksStatus, optOutMarkNow, // B-f276 (s1126): the opt-out mark by the store-read law — 'opted-out' | 'not' | { unread } (was an existsSync)
} = require('./src/server/agent-tool-generators.js').create({ rootDir: __dirname, port: PORT, onHookFileCreated: (ev) => hooksLate.noteCreated(ev), applyThisMachine: (o) => harnessConfig.applyThisMachine(o), homeRead: (fn, ms, opts) => harnessConfig.homeRead(fn, ms, opts) }); // B-ddf3 u2 line 1: this machine's hooks through the shipped helper
// ── Harness settings (src/server/harness-config-sync.js; docs/design-harness-settings.zh.md) ──
// THE typed accessors over the descriptor-declared tables (harnessSetting /
// harnessDeclares / harnessSpawnSettings — threaded to ws-create and the pool
// engine via deps, never a literal harness id) + the CLI-config plan every
// machine applies (local: in-process below; remote: VIBESPACE_CLI_CONFIG on the
// install/prelude/dial sites in hosts.js and ws-create.js).
const harnessConfig = require('./src/server/harness-config-sync.js').create({
  serverSetting: (...a) => serverSetting(...a), harnesses: require('./src/harnesses'), adapterRegistry, activeSessions, hookRegistrationSafe, ownerWriteRefusal, refuseOwnerWrite, rootRecovery,
  log: (...a) => console.log(...a), warn: (...a) => console.warn(...a), helperPath: path.join(__dirname, 'data', 'bin', 'vibespace-hook-register.mjs'), hooksWanted: () => integrationEnabled() && optOutMarkNow() === 'not', // B-ddf3 u2 line 1: THIS machine served by the shipped helper through the starter (no in-process write)
}); require('./src/server/conversation-ops.js').provide({ keepEnded, endFactsBefore }); // lane end-obeys-verdict: TERMINATE SAYS WHO — the ended record, written around the kill body
const { harnessSetting, harnessDeclares, harnessSpawnSettings, cliConfigPlanB64 } = harnessConfig;
// Generic operator-visible notice channel (2.226.0, user directive "不要静默
// 失败"): server-side probes report through this instead of dying in the log —
// every connected client toasts it (+ it lands in toast/notification history)
// and a telemetry event carries the key to the fleet collector. Key-deduped
// per boot so a recurring probe can't spam. RETURNS how many clients got it (r5): a caller that latches "already said" latches on THIS — the boot probes fire into an EMPTY client set on a systemd restart.
const _sentNotices = new Map(); // key → clients it reached
function serverNotice(key, text, { level = 1, i18n = null } = {}) { // i18n = {key, params}: the client words it with t(key, params); `text` stays the English (journal, older clients)
  if (_sentNotices.has(key)) return _sentNotices.get(key);
  console.warn('[notice]', text);
  global.__vsEvent?.('server-notice', key);
  let delivered = 0;
  try {
    const payload = JSON.stringify({ type: 'server-notice', key, text, level, ...(i18n && i18n.key ? { i18n } : {}) });
    for (const c of wss.clients) { try { if (c.readyState === WS_OPEN) { c.send(payload); delivered++; } } catch {} }
  } catch {}
  // No client connected (e.g. the 60s post-boot probe right after a pod
  // restart) → don't burn the key; the next probe run re-notices when
  // someone is actually there to see it (review finding).
  if (delivered > 0) _sentNotices.set(key, delivered); return delivered;
}
// Agent-hook health probe (2.226.0; born from the 2-day silent MODULE_NOT_FOUND
// outage whose CAUSE 2.225.1 fixed): a registration that goes stale or points
// at a missing script MID-RUN now self-heals + notifies instead of silently
// dropping every Stop/SessionStart/UserPromptSubmit delivery. Boot(+60s) +
// every 6h. NOTE the heal only fixes the FILE — running CLI sessions snapshot
// hook config and pick it up after restart/compaction; the notice says so.
async function checkAgentHookHealth() {
  try {
    if (!hookRootWatch.probeMayRun() || !integrationEnabled() || optOutMarkNow() !== 'not') return; // verify r2 ①: an unjudgeable root arms the backoff re-judge, never a silent return
    const scriptMissing = !fs.existsSync(HOOK_CMD);
    if (scriptMissing) { try { createHookHelper(); } catch {} }
    const st = await agentHooksStatus();   // r2345: read off the loop, through the runner's guard — an unread file is no verdict (skipped below)
    for (const [key, info] of Object.entries(st)) {
      if (!info || typeof info !== 'object' || !('installed' in info)) continue; // hookPath/optedOut fields
      if (!info.fileExists || info.parseError) continue; // that CLI isn't set up here / unreadable
      if (info.stale || !info.installed || scriptMissing) {
        global.__vsEvent?.('agent-hook-broken', `${key}${info.stale ? '/stale' : ''}${!info.installed ? '/missing-entry' : ''}${scriptMissing ? '/script-missing' : ''}`);
        Promise.resolve(ensureAgentHooks({ auto: true })).then((healed) => { // self-heal the registration in place, through the shipped helper (B-ddf3 u2 line 1) (B-225b r552: while the settings are held it SKIPS — nothing repaired, nothing said)
        if (!(healed && healed.skipped) && !(healed && healed[key] && healed[key].ok === false) && !hookRootWatch.saidRecoveryInstead(info, scriptMissing)) serverNotice(`hook-health-${key}`, // verify r2 ①: a root never registered because it could not be read is a recovery, not "broken and repaired"
          `VibeSpace's ${key} agent-hook registration was broken (stale or missing path) and has been repaired — CLI sessions already running pick the fix up only after they restart or compact.`,
          { level: 2 }); }).catch((e) => console.warn(`[hooks] the self-heal of ${key} could not be said: ${(e && e.message) || e}`));
      }
    }
  } catch (e) { console.warn('[hook-health] probe failed:', e.message); }
}

// Credential expiry sweeps (B-211a): every descriptor's expirySweep({accounts, serverNotice}) — claude: the
// long-lived setup-token warning (src/harnesses/claude-oat-expiry.js). Notice-deduped per account.
function checkCredentialExpiry() {
  for (const h of require('./src/harnesses').list()) {
    if (typeof h.expirySweep !== 'function') continue;
    try { h.expirySweep({ accounts, serverNotice }); } catch { }
  }
}
setTimeout(checkCredentialExpiry, 20000);
setInterval(checkCredentialExpiry, 6 * 3600e3); // stable instances stay up for weeks — a one-shot sweep would sail past the threshold (serverNotice keys dedupe per boot, so re-fires are cheap)
// Boot-time hook registration is DEFERRED until settings are readable (after
// setupPersistence below) — the Integration master switch decides whether we
// register or actively strip. See "Agent-hook boot registration".

// ── File System API (extracted to src/routes/files.js) ──
app.locals.xEnv = X_ENV;
app.locals.refreshXEnv = refreshXEnv; // paste route retries through this after an X cookie rotation
app.locals.activeSessions = activeSessions; // paste-image resolves a session's host server-side (B-65ec)
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
  console.error('[safe-fs] pool init failed — the file routes refuse every file op by name until a restart (B-3b03: never run on the main thread):', e.message);
}
// B-dc3f (1) H1 (r3030, round wefspq2j3): the network home's sign-in witness — its OWN one-worker pool, BUILT ONLY for a hub whose home is a
// network mount (auth calls the factory then; every other hub starts no worker), its failure said by auth in its own words
if (signinWitness) auth.attachWitnessPool(() => new SafeFs({ workerPath: path.join(__dirname, 'src', 'signin-witness-worker.js'), name: 'signin-witness', poolSize: 1, hungMs: 0 }));
app.use(fileRoutes);

// Browser proxy — full-rewriting web proxy via node-unblocker
// Rewrites all URLs in HTML/CSS, injects JS to rewrite XHR/WebSocket, strips security headers
const Unblocker = require('unblocker');
const unblocker = new Unblocker({
  prefix: '/proxy/', ...require('./src/server/tailnet-door.js').agents(), // lane tailnet-names: a tailnet host by name — the plugin's table (kernel) or its HTTP proxy (userspace)
  responseMiddleware: [
    function stripFrameHeaders(data) {
      delete data.headers['x-frame-options'];
    }
  ],
});
app.use(require('./src/server/tailnet-door.js').embedded(unblocker)); // lane tailnet-names (LAW 2): a tailnet host's miss says why through Tailscale

// Ctrl+G editor: POST /api/editor/open (the `code` helper, vsst_ auth) + /api/editor/signal — src/routes/editor.js
require('./src/routes/editor.js').registerEditorRoutes(app, { activeSessions, wss, WS_OPEN, readSessionMeta, writeSessionMeta, getRemoteFs: () => remoteFs });

// ── Persistence API (extracted to src/routes/persistence.js) ──
const syncStores = {};
function getSyncStore(name) { return syncStores[name]; }
// THE server-side settings reader (data/settings.json via persistence.js's
// cached accessor). getSyncStore('settings') is NOT it — that SyncStore is an
// empty migration target; reads through it silently return undefined.
function serverSetting(key) {
  try { return persistenceRouter.readSettings ? persistenceRouter.readSettings()[key] : undefined; } catch { return undefined; }
}
require('./src/server/owner-facts.js').configure({ setting: serverSetting, userState: () => persistenceRouter.readUserState() });   // lane agent-context-owner-facts (B-7960): THE owner's clock (instance.timezone) and tray words every agent-facing door says
// Integration master switch (agents.vibespaceIntegration, default ON): OFF =
// pristine CLI — no hook registration, no VIBESPACE_API/agent-tools env in new
// spawns, no context/nudge delivery even to already-running sessions. THE one
// definition — threaded into ws-handler and agent-routes via their deps.
function integrationEnabled() {
  try { return serverSetting('agents.vibespaceIntegration') !== false; } catch { return true; }
}
// ONE convergence rule for boot AND the live toggle: hook registration follows
// the master switch. ensureAgentHooks({auto:true}) still honors the manual
// data/.agent-hooks-optout marker (Manage-Agents Remove) — the switch never
// overrides that narrower explicit choice; Install there clears it.
const hookRootWatch = require('./src/server/hook-root-watch.js').create({ dataDir: path.join(__dirname, 'data'), ensureAgentHooks, rootRecovery, ownerWriteRefusal, factsNow: rootFactsNow, integrationEnabled: () => integrationEnabled(), serverNotice: (...a) => serverNotice(...a) });
function syncHookRegistration() {
  try {
    if (integrationEnabled()) return hookRootWatch.sync(); // the unknown ⇒ the notice once per cause + the backoff re-judge; ok ⇒ the recovery said once // verify r1 (hook-root-guard): an UNJUDGEABLE root (a read error on .git) is said to the OWNER, not only the journal; every writer re-reads, the probe heals + notifies
    else return stripAgentHookEntries();
  } catch (e) { console.warn('[integration] hook registration sync failed:', e.message); return null; }
}

syncStores.drafts = new SyncStore('drafts', path.join(__dirname, 'data', 'drafts.json'), wss);
syncStores.settings = new SyncStore('settings', path.join(__dirname, 'data', 'settings-sync.json'), wss);
syncStores.uploads = new SyncStore('uploads', path.join(__dirname, 'data', 'uploads-sync.json'), wss); const grants = require('./src/server/grants-store.js').install(require('./src/server/grants-store.js').create({ dataDir: path.join(__dirname, 'data'), wss, log: (...a) => console.warn(...a) })); syncStores.grants = grants.sync; // THE GRANTS STORE (lane grants-unify): every grant the owner gives agents in ONE file (data/grants.json), ONE writer, judged by the ONE model (src/grant-model.js admits) — created before every door, its server-owned mirror live to every client and flushed with the other stores; each door re-judges NOW on a change (grants.onChange below)
syncStores.stage = new SyncStore('stage', path.join(__dirname, 'data', 'stage-sync.json'), wss); // dynamic desktop (docs/design-dynamic-desktop.md)

setupPersistence({ dataDir: path.join(__dirname, 'data'), wss, WS_OPEN, getSyncStore, activeSessions, auth, getExitProxy: () => { try { return exitProxy; } catch { return null; } } /* lane grants-unify: a machine's exit lists ride the config bundle as grant rows */,
  getHosts: () => hosts, getMounts: () => mounts, getTasks: () => tasks,
  getAccounts: () => accounts, getUsageHistory: () => usageHistory, onUserStateWrite: (st) => { try { channelsWiring.groups.noteUserState(); } catch {} try { tasks.noteArchived(st && st.archivedSessions); } catch {} }, // lane pair-group-fate: the sidebar archive (THE user-state write) ends that conversation's group waits; lane task-group-fanout: …and leaves every group's members (sessions[])
  // React server-side to the Integration master switch: register/strip the
  // CLI-config hook entries the moment the setting flips (the only settings
  // key with a server-side side effect — everything else reads lazily).
  onSettingsWrite: (next, prev) => {
    const was = (prev || {})['agents.vibespaceIntegration'] !== false;
    const now = (next || {})['agents.vibespaceIntegration'] !== false;
    const toggled = was !== now ? rootFactsNow().then(syncHookRegistration).catch((e) => { console.warn('[integration] hook registration sync failed:', e && e.message); return null; }) : null;   // B-1425: the switch's sync waits for the root facts (off the loop); B-ddf3 u2 (b): the switch's own write rides back too
    // Harness settings (design-harness-settings §5): a cli-config row changed ⇒
    // re-apply the plan on this machine; a spawn row with a `live` verb changed
    // (claude disableModelFallback → formatSetFallbackPolicy: apply_flag_settings
    // merges switchModelsOnFlag into the CLI's inline flag-settings layer,
    // effective from the next turn, local and remote chat sessions alike) ⇒ the
    // verb goes to every running chat session whose ADAPTER has it. Sessions
    // spawned after the flip get it at spawn instead.
    try { if (autoCliLoop) autoCliLoop.noteSettingsWrite(next, prev); } catch { } // B-574d (主开发 r5213): the automatic usage reads switched on or off while their pacing state is unread — the held-lists notice told once
    try { settingHolds.noteSettingsWrite(next, prev); } catch { } // lane setting-doors pick 2 (law B): a hand write of a held row ends its hold HERE, the moment it lands (before the wiring exists there is no hold)
    const landing = harnessConfig.onSettingsWrite(next, prev); try { plugins.onSettingsWrite(next, prev); } catch { } return (landing || toggled) ? Promise.all([toggled, landing]) : null; // B-ddf3 u2 line 1 (b): the switch's registration and the rows' landing ride back to the settings write's answer (src/server/landing-answer.js notLanded reads both) // lane plugin-settings-p0: a plugin row that re-applies (frp relay fields, Tailscale mode) moved ⇒ that plugin re-applies (before the plugin wiring exists nothing can have changed)
  } });
app.use(persistenceRouter);
// B-5279 (主开发 r4942 (2)): a conversation's «the settings could not be read» word goes when the settings read again
if (typeof persistenceRouter.onSettingsLift === 'function') persistenceRouter.onSettingsLift(() => { try { heldWordsLifted(); } catch (e) { console.warn('[wall] the held words could not be cleared at the lift:', e && e.message); } });
// ── Agent-hook boot registration (deferred from the hook-machinery block so
// the Integration master switch is readable) — a toggle flipped just before a
// restart, or an imported config bundle carrying it, converges here.
rootFactsNow().then(syncHookRegistration).catch((e) => console.warn('[integration] hook registration at boot failed:', e && e.message));   // B-1425: the boot's registration waits for the root's first read (off the loop, bounded) — never an empty cache
// CLI-CONFIG PLAN AT BOOT (design-harness-settings §5): every cli-config row of every harness (claude transcriptRetentionDays → cleanupPeriodDays, codex historyPersistence → [history] persistence) is written on THIS machine through the CAS writers — guarded by hookRegistrationSafe() inside (a /tmp worktree server never writes the real HOME) and by the smoke belt here; remote machines get the same plan as VIBESPACE_CLI_CONFIG on install / spawn (hosts.js, ws-create.js)
if (!process.env.VIBESPACE_SKIP_AGENT_HOOKS) rootFactsNow().then(() => harnessConfig.syncCliConfig({ reason: 'boot' })).catch((e) => console.warn('[cli-config] the boot sync failed:', e && e.message));   // B-1425: after the first read
// Health probe: catches MID-RUN poisoning (the 2.225.1 incident class) that
// boot-time registration can't — self-heals + notifies. 60s in, then 6h.
setTimeout(() => rootFactsNow().then(checkAgentHookHealth).catch((e) => console.warn('[integration] hook health probe failed:', e && e.message)), 60000).unref();   // B-1425: the probe awaits the facts
setInterval(() => rootFactsNow().then(checkAgentHookHealth).catch((e) => console.warn('[integration] hook health probe failed:', e && e.message)), 6 * 3600 * 1000).unref();

const { tasks, taskFanout } = require('./src/server/task-groups-wiring.js').createStore({ app, wss, WS_OPEN, activeSessions, grants, persistenceRouter, serverSetting, sessionStatusKey, dataDir: path.join(__dirname, 'data'), exitProxy: () => exitProxy, channelsWiring: () => channelsWiring, sessionStatus: () => sessionStatus, mounts: () => mounts, userTodos: () => userTodos, hosts: () => hosts }); // ── Task Groups (岗位; docs/design-task-system.md): the store, its fan-out, its routes and the remote context sync live in src/server/task-groups-wiring.js, called at their three old places ──
// System info + memory-pressure watch (2.216.0, userL's 32Gi OOM kill —
// the pod-level kill takes every dtach session; warn BEFORE the kernel acts)
// ── Sysinfo wiring (src/server/sysinfo-wiring.js): remote snapshot ladder ──
const { sysinfo, remoteSysinfo, remoteProcs, signalProc } = require('./src/server/sysinfo-wiring.js').create({ getHosts: () => hosts });
// ── Incident capture (src/server/incident-wiring.js) ──
const { _srvConsoleRing } = require('./src/server/incident-wiring.js').create({
  app, rootDir: __dirname,
  getActiveSessions: () => activeSessions,
  getHosts: () => { try { return hosts; } catch { return null; } },
  getNoConvoRef: () => { try { return noConvoRef; } catch { return null; } },
  readLayouts: (...a) => readLayouts(...a),
  sysinfo,
  listLayoutHistory: () => { try { return persistenceRouter.listLayoutHistory(); } catch { return []; } },
  getDesktop: () => ({ vnc, keeper: desktopKeeper, stream: desktopStream, access: desktopAccess }), // 2.369.118: the desktop scene (late-bound — created further down)
});
app.get('/api/sysinfo', async (req, res) => {
  try {
    const hostId = String(req.query.host || '');
    if (hostId) return res.json(await remoteSysinfo(hostId));
    res.json({ ...(await sysinfo.read(path.join(__dirname, 'data'))), storeWrites: storeTiming.enabled() ? storeTiming.slowest() : undefined, serverMemory: memSampler.latest() || undefined }); // the System window's "slowest store writes (last hour)" (design 011 lane 1)
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// Process manager (2.354.0, btop-like): full table + user-initiated signal.
app.get('/api/sysinfo/procs', async (req, res) => {
  try {
    const hostId = String(req.query.host || '');
    if (hostId) return res.json(await remoteProcs(hostId));
    res.json({ serverPid: process.pid, ...(await sysinfo.listProcs()) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/sysinfo/signal', async (req, res) => {
  try { res.json(await signalProc(String(req.body?.host || ''), req.body?.pid, req.body?.sig, { by: require('./src/device-audit.js').byOfReq(req) })); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
// Resource HISTORY for the System rail charts (2.223.0): self-sampled CPU/
// memory rings — 24h at the 45s watch cadence, 7d at 15min. range=1h|24h|7d.
app.get('/api/sysinfo/history', (req, res) => {
  const ranges = { '1h': 3600e3, '24h': 24 * 3600e3, '7d': 7 * 24 * 3600e3 };
  const ms = ranges[String(req.query.range || '24h')] || ranges['24h'];
  res.json({ points: sysinfo.history(ms), rangeMs: ms, cpus: require('os').cpus().length, held: sysinfo.historyHeld() });   // r4991: the panel says a held history in the chart's place
});
sysinfo.startWatch({
  dataDir: path.join(__dirname, 'data'), hold: require('./src/store-read-hold.js'), /* B-f276 (r4991): the history's read held, handed in as the writer */ writer: require('./src/store-writer.js').storeWriter(), onSample: (mem) => memoryPressure.onSample(mem), // lane browser-resource-care (B-afeb): the memory-pressure episode (src/server/memory-pressure-watch.js); B-0248 unit 5 (lane bl-loop-b): the history's writer is the hub's, handed here (src/sysinfo.js is in the device agent's bundle and requires none)
  broadcast: (msg) => { const json = JSON.stringify(msg); wss.clients.forEach(c => { if (c.readyState === WS_OPEN) { try { c.send(json); } catch {} } }); },
});

const { convOps } = require('./src/server/task-groups-wiring.js').mountRoutes({ app, tasks, taskFanout, activeSessions, sameToken, serverSetting, sessionStatusKey, spendGuard }); // the Task Groups' routes (/api/tasks …, the Context table's), mounted where they stood; convOps stays a server.js name (broadcastActiveSessions)

const machineProbes = require('./src/machine-probes'); machineProbes.useStarter(require('./src/server/child-starter').execFileVia(require('./src/server/child-starter').childStarter()));   // B-323e: the hub's --version asks ride its starter
const { parseRateLimitEvent, captureRateLimitEvent } = require('./src/rate-limit-capture.js');
const { scheduleCtxSync, remoteCtxBaseFor } = require('./src/server/task-groups-wiring.js').ctxSync({ tasks, hosts: () => hosts, activeSessions, integrationEnabled, serverNotice, sessionStatusKey }); // the remote context-folder auto-sync and its 60 s timer, started where they started

// ── Anthropic accounts (subscription ↔ API/console per-session switching) ──
// Keys AES-GCM encrypted in data/accounts.json; injected as ANTHROPIC_API_KEY
// into the session's spawn env (process-env channel — never argv/proc-visible).
// The CLI's own /login is mutually exclusive; this store is what lets both
// identities coexist. Design: docs/design in CLAUDE.md "Accounts".
const { AccountManager } = require('./src/accounts');
const accounts = new AccountManager({
  dataDir: path.join(__dirname, 'data'), safeFs: () => app.locals.safeFs,   // B-360d: the list's sign-in facts read OFF the loop through the file door
  onChange: (list) => {
    const json = JSON.stringify({ type: 'accounts-updated', ...list });
    for (const client of wss.clients) if (client.readyState === WS_OPEN) client.send(json);
    broadcastActiveSessions(); // account names on live session cards may change
  },
  onSessionLinks: () => broadcastActiveSessions(), // lane badge-stale: a per-session pool link moved ⇒ auth.poolTarget in the payload (one frame per burst — accounts.js _notifyLinks)
});
// ── Usage history: a PERMANENT per-request token ledger mined from Claude's
// JSONL transcripts (terminal + chat), for the Usage window. resolveAccount
// bakes WHICH account + its billing TYPE into each event so subscription and
// API-key usage are never conflated. ──
const { UsageHistory, ackOf: usageAckOf } = require('./src/usage-history');
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
try { require('./src/store-writer.js').bootKeeper(); } catch {} // lane hub-loop-stalls commit 2 r6 (E3): THE BOOT starts the store writer's exit keeper BY NAME (loaded while the install answers, asleep until armed) · below: server-side fatals land in the same ledger (journald has them too, but the diagnostics report should show one unified picture)
process.on('uncaughtException', (e) => { if (e && e.code === 'EVSMOUNTSYNC') { console.error(`[mount-guard] a refused ${e.syscall} on ${e.path} unwound a callback — the hub keeps serving (the call never reached the mount)`); return; } // lane hub-fuse-sync-guard: the guard's refusal throws BEFORE any syscall — exiting would trade a refused call for a whole-hub restart
  try { if (e && (e.code === 'EMFILE' || e.code === 'ENFILE')) console.error('[fd] ' + fdGauge.blame(e, e.path).words); } catch {} // lane-dead-bridge: NAME an EMFILE before dying — this process, the mount's FUSE daemon (12:03) or the machine
  try { bridgeWatch.endAttachPtys(); } catch {} // …and end the attach clients like the clean shutdown does: a crash that left them alive left ORPHANS whose stuck socket kept the next server's attach dead for 3 h (lane-dead-bridge)
  let w0 = null; try { w0 = require('./src/store-writer.js').storeWriter(); w0.beginExit({ crash: true }); w0.exitFlush({ only: 'rank0' }); } catch {} const tDebt = Date.now(); // hub-loop-stalls r3 (law 2) + r6: what cannot be re-derived FIRST — no bound of ours (the keeper gives a crash with no stop asked one full grace, then ends it)
  try { telemetry.record({ kind: 'server-error', name: e.message || 'uncaughtException', stack: e.stack }); telemetry.flush(); } catch {}
  // Same flush belt as the clean shutdown (2.219.0 audit) — a crash used to
  // drop up to 2s of debounced writes (layouts, session-status, user-todos).
  try { for (const store of Object.values(syncStores)) { try { store.flush(); } catch {} } } catch {}
  try { flushLayouts({ stop: true }); } catch {}   // B-225b's second half: a last flush that fails is the journal's line, by name
  try { sessionStatus.flush(); } catch {}
  try { userTodos.flush(); } catch {}
  try { require('./src/server/writes-lost.js').installed()?.stop(); } catch {} // a lost write's warning still held after a failed write (lane cli-2-1-319-records r4)
  console.error(e); try { w0.exitFlush({ debtMs: Date.now() - tDebt }); } catch {} process.exit(1); // lane hub-loop-stalls commit 2: every store the writer holds, ONCE — one line names what it wrote
});
process.on('unhandledRejection', (e) => { try { telemetry.record({ kind: 'server-error', name: (e && e.message) || 'unhandledRejection', stack: e && e.stack }); } catch {} console.error('unhandledRejection:', e); });

const memSampler = require('./src/server/memory-sampler.js').create({ record: (ev) => telemetry.record(ev), log: console, caches: () => [...usageHistory.cacheCensus(), require('./src/session-store').jsonlCacheCensus(), usageEstimator.lineCacheCensus()].flat(), enforce: () => require('./src/server/memory-enforce.js').tick({ activeSessions, usageEstimator }) }); // lane server-memory-census: main heap + every worker isolate + external + native every 60 s (started at listen: ONE boot census line); GET /api/sysinfo serverMemory; B-9428: + each bounded cache by name
// Server performance metrics — RSS/heap, event-loop lag, live session count. Every 5 min; names-and-numbers only, same ndjson ledger as everything else.
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
      // store-timing (design 011 lane 1): each named store's slowest sync write / read of these 5 min + its bucket counts
      for (const [name, w] of Object.entries(storeTiming.takeWindow())) telemetry.record({ kind: 'metric', name: 'srv-store-ms:' + name, value: w.max, detail: 'n=' + w.n + ' b=' + w.buckets.join(',') });
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
global.__vsMetric = (name, value, detail) => { try { telemetry.record({ kind: 'metric', name, value, detail }); } catch {} }; // detail = short attribution (account=… bucket=…), never content (B-a5c0)
// Server-side EVENT hook (2.207.0): the debugging-pain batch — session
// lifecycle anomalies, CLI error classes, probe failures — flows into the
// same Diagnostics report/fleet forwarding as client events. NAMES + short
// enum-ish details only, never content (telemetry charter).
global.__vsEvent = (name, detail) => { try { telemetry.record({ kind: 'event', name, detail }); } catch {} };

// ── Threadpool canary (2.108.6; off the main thread since design 011 lane 1) ── src/server/fs-canary.js says why: the
// stat is timed in its own SafeFs worker and the main loop's delay is a second fact, so a blocked loop never reads as
const mountHealth = require('./src/server/mount-health-watch.js').create({ file: path.join(__dirname, 'package.json'), getUserTodos: () => userTodos, ownerIds: (procs) => memoryPressure.ownerIds(procs), log: console }); // a slow mount. Three stats past 5 s in a row still kick the mount health sweep; lane fuse-canary-notice (B-b327): every answered probe drives the mount-health EPISODE — ONE For-you item naming the mount + who presses it, the server's own scans paused on it (src/server/mount-health-watch.js)
const dataFolder = require('./src/server/data-folder-notice.js').create({ dataDir: path.join(__dirname, 'data'), rootDir: __dirname, getUserTodos: () => userTodos, app }); // B-8797 (lane hub-loop-stalls, 主开发 r5195; at MODULE scope — the witness's block below is its own): the data folder on a network or user-space drive is SAID once (For you) and readable in Settings (GET /api/data-folder) — its look is armed by the listen (below), never in the start's path
{ const syncFs = require('./src/server/sync-fs-witness.js').create().wire({ record: (ev) => telemetry.record(ev), guardOn: () => serverSetting('mounts.mainThreadSyncGuard') !== false, registry: () => mounts.storageRoots(), samplingOn: () => serverSetting(require('./src/server/sync-fs-witness.js').SAMPLING_SETTING) !== false }); try { syncFs.holds()?.register(app); } catch {} // lane hub-loop-stalls: the watchdog names what held the loop — the setting read at every beat; GET /api/loop-holds (src/server/loop-holds.js) // lane hub-fuse-sync-guard: the witness boot-trace started gets telemetry, the setting and the storage rows (mounts exists later: a ReferenceError until then = no rows)
  try { require('./src/server/loop-day-report.js').wire({ witness: syncFs, sessions: () => activeSessions.entries(), socketsDir: SOCKETS_DIR, buffersDir: BUFFERS_DIR, sizes: () => ({ conversations: activeSessions.size, pageSockets: wss.clients.size, deviceLinks: (deviceMgr && deviceMgr._conn ? 1 : 0) + agentdDialWss.clients.size }) }); } catch (e) { console.warn('[loop-hour] the hourly report did not start:', (e && e.message) || e); } // lane hub-loop-stalls «loop-day-report»: ONE [loop-hour] journal line per UTC hour + ONE [loop-exit] (src/server/loop-day-report.js); ⚙ Diagnostics reads its hours
  const fsCanary = require('./src/server/fs-canary.js').createFsCanary({
    file: path.join(__dirname, 'package.json'),
    record: (ev) => telemetry.record(ev), witness: syncFs, onHeld: (e) => mountHealth.onHeld(e), // a held loop is named by the witness's call; ≥ 5 s on a mount ⇒ the For-you item names it
    onWedged: () => { try { mounts._healthSweep().catch(() => {}); } catch {} }, onProbe: (p) => mountHealth.onProbe(p),
  });
  setInterval(() => { fsCanary.tick().catch(() => {}); }, 10000).unref();
}

const usageHistory = new UsageHistory({
  dataDir: path.join(__dirname, 'data'), firstLoadInWorker: !bootTrace.syncControl /* ledger-boot-load: the first load in the fold worker; the boot-trace control keeps the one-tick warm */, paused: (roots) => mountHealth.paused('usage-walk', roots), // lane fuse-canary-notice: a wedged mount under the walk pauses it
  // THE RECORD, not list() (prod-stall-202): list() reads every account's login files and the
  // walker asks this once per ledger line — seconds of synchronous NFS reads per walk step on
  // production. The same three fields list()'s row carries: its type/backend defaults, and a
  // NO key tail (B-ba7d: a usage row reaches every reader of /api/usage-stats; the page lays the person's read on).
  resolveAccount: (id) => { if (typeof accounts.held === 'function' && accounts.held()) return { held: true, type: 'unknown', name: null };   // r3060 Q1: a list that could not be read names nobody — the walk waits, never bakes «unknown»
    const a = accounts.get(id);
    if (!a) { let p = null; try { p = accounts.providerRecordOf(id); } catch { } return p ? { type: 'provider', name: p.label || id } : null; }   // B-d578 P1-b: a third-party provider's RECORD (no account) — its name, never «unknown» / deleted
    const type = a.type || 'api', backend = a.backend || 'claude';
    let ledgerType = null; try { ledgerType = require('./src/harnesses').get(backend).creds?.ledgerType || null; } catch { } // codex: every account is 'codex-subscription'
    return { type: ledgerType || type, name: accounts.nameShownOf(id) };
  },
});
// OTel receiver (2.361.0, B-345b; DEMOTED TO CORROBORATION 2026-09-07 — the
// observed org is the identity the CLI cached at SPAWN, not the token that
// authorized the request, so it attributes nothing now). Routes are
// cookie-exempt (auth.js); the loopback+token gate is the only door.
const otelIngest = require('./src/server/otel-ingest.js').create({
  dataDir: path.join(__dirname, 'data'), PORT, serverSetting,
  getUsageHistory: () => usageHistory, identityGroups: () => usageIdentityGroupsCached(),
  listAccounts: () => accounts.decisionList().accounts || [],   // B-360d: OTel's org→account email fallback DECIDES (per record, no wait: rows confirmed within 10 s, else no email)
});
otelIngest.registerRoutes(app); bootTrace.span('otel-replay', otelIngest.replayed); bootTrace.register(app); // B-1319: the stash replay runs off the loop; GET /api/boot-trace
const bridgeWatch = require('./src/server/bridge-watch.js').create({ activeSessions, BUFFERS_DIR, SOCKETS_DIR, reattachLocalPty, serverSetting, getOtelIngest: () => otelIngest, feedPeerCard, log: console }); // THE DEAD-BRIDGE WATCH (lane-dead-bridge): the attach-pty teardown shared by shutdown + crash, the orphan sweep, silence judged against the CLI's own witnesses (buffer file / OTel), the catch-up card
// `usageHistory.setTruthLookup(otelIngest.…)` is DELIBERATELY UNWIRED since
// 2026-09-07 — reasoning at the seam (usage-history.js) + otel-ingest's header.
const { recordUsageAttribution } = require('./src/server/usage-attribution.js').create({ activeSessions, accounts, usageHistory }); // the by-time billing attribution log (moved, lane dc-seams-server)
// Rescan the ledger periodically (incremental — only new JSONL bytes). Also
// rescanned on demand when the Usage window opens.
// The walk YIELDS every MiB (perf ⑥): warm() reads the ledger only once the
// boot walk has settled, and the metric is the walk's WALL time (settle − start).
setTimeout(() => { try { usageHistory.scan(); usageHistory.scanSettled().then(() => { try { if (bootTrace.syncControl) bootTrace.step('usage-ledger-warm', () => usageHistory.warm()); else bootTrace.span('usage-ledger-warm', usageHistory.warmStepped(), (r) => r); } catch {} }); } catch {} }, 8000); // B-1319: the warm takes a MiB per tick (warmStepped)
setInterval(() => { try {
  const t0 = Date.now();
  const r = usageHistory.scan();
  if (!r?.skipped) Promise.resolve(r).then(() => telemetry.record({ kind: 'metric', name: 'srv-usage-scan-ms', value: Date.now() - t0 })).catch(() => {});
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
app.get('/api/telemetry/summary', async (req, res) => {   // B-360d unit 2: the read and the summing in the telemetry-summary worker
  try {
    telemetry.flush();
    res.json({ ...(await telemetry.summary({ days: Math.min(parseInt(req.query.days) || 14, 90) })), ...(req.query.drift === '1' ? { driftLedger: driftLedgerRows(), attended: (() => { try { return spendGuard.snapshot().attended; } catch { return null; } })() } : {}) }); // ?drift=1 = ⚙ Diagnostics: the drift ledger (lane record-oracle-2-1-296)
  } catch (e) { res.status(e && e.status === 503 ? 503 : 500).json({ error: e && e.status === 503 ? `the Diagnostics report's files did not answer in time (${e.message})` : e.message }); }
});
// ── Account + usage routes (src/server/account-usage-routes.js, decomposition #9) ──
require('./src/server/account-usage-routes.js').create({
  app, rootDir: __dirname, HOST, CLAUDE_CMD, cliCmds, NODE_CMD,
  CLAUDE_SUBSCRIPTION_LOGIN_HELPER, activeSessions, auth,
  engine: { oatAnswer, oatIdentityAttach, oatRebind, clearSealedOrders, pinAllPlan, pinAll, clearPinsTo, answerCrossProviderAsk, purgePoolMadeMoves, fallbackMoveBack, fallbackStatus, fallbackFactOf, establishedWindows, resetCreditPreview, consumeResetCreditFor, claimColdRestarts, refreshCodexForPerson, settleResetCreditByRead, memberRemoved, decideDefaultTarget, fallbackDefaultTarget, removalTargetFor, maybePoolAutoSwitchForPool, setConversationPin, gatherPlan, onMemberLoginSuccess }, // + B-2083 unit B's member-row press (its plan, the press, the clear) + the login re-check (2026-09-29: a member that signs in ⇒ ONE usage read + ONE pool re-decision) + the removed-member wall (2026-09-28: the members route evicts through the engine's ONE entry point, the default re-point by decision) // + claimColdRestarts (r4: the manual routes never double a restart in flight) + the manual reset-credit use (design-reset-credits p2, src/routes/reset-credit.js)
  serverSetting: (...a) => serverSetting(...a),
  recordUsageAttribution: (...a) => recordUsageAttribution(...a),
  liveAccountIdSet: (...a) => liveAccountIdSet(...a),
  buildClaudeSubscriptionLoginCommand: (...a) => buildClaudeSubscriptionLoginCommand(...a),
  getAccounts: () => { try { return accounts; } catch { return null; } }, broadcastActiveSessions: () => broadcastActiveSessions(), // + the pin route's session-facts broadcast (2026-09-28)
  getHosts: () => { try { return hosts; } catch { return null; } },
  getMounts: () => { try { return mounts; } catch { return null; } }, getModels: () => AVAILABLE_MODELS, refreshModels: () => refreshHarnessModels(), getIntegrations: () => { try { return integrationsWiring.store; } catch { return null; } }, // + the harness catalogs a built-in model provider lists (lane provider-record); + their mtime-guarded re-read and the Integrations store a provider's key is read from (lane models-at-session)
  getTelemetry: () => { try { return telemetry; } catch { return null; } },
  getUsageHistory: () => { try { return usageHistory; } catch { return null; } }, broadcastAll: (m) => bcastAll(m), getLoginExpiryWatch: () => { try { return loginExpiryWatch; } catch { return null; } }, getCliCmds: () => cliCmds, // + the CLI registry the on-demand usage reading checks (lane antigravity-card-fixes) ← constructed BELOW this stanza; lazy, like every other late singleton (拆分 P1). Sharing a line because server.js is AT the size ratchet — the wiring stanza may not grow.
  harnessSetting: (...a) => harnessSetting(...a), // + the vendor's own row the on-demand usage door asks for an automatic read (lane usage-predict, one row per vendor)
});
// ── Session status (agent-set via vibespace-status CLI, user-overridable) ──
// The user's override of an agent-set status is injected as a system-reminder
// into the NEXT chat message (see ws-handler chat-input) so the agent learns
// the user disagreed with its self-assessment.
const fdGauge = require('./src/server/fd-gauge.js').create({ serverNotice: (...a) => serverNotice(...a), log: console }); // THE FD GAUGE (lane-dead-bridge): the limit node REALLY runs at, the /proc/self/fd gauge (≥ 80 % ⇒ one notice an hour, by kind) and the NAME of an EMFILE (12:03: the workspace's FUSE daemon ran out) ⇒ src/server/fd-gauge.js
const { SessionStatusManager } = require('./src/session-status');
const sessionStatus = new SessionStatusManager({
  dataDir: path.join(__dirname, 'data'),
  onWriteError: (e, file, o) => fdGauge.reportWriteError(e, file, o), // a failed debounced write retries + is named, never a crash (12:03:17)
  onChange: (statuses, extra) => { // `extra.cleared` = a history clear's ids (a statuses map equal to every client's copy must still reach it)
    const json = JSON.stringify({ type: 'session-status-updated', statuses, ...(extra && extra.sync), ...(extra && Array.isArray(extra.cleared) ? { cleared: extra.cleared } : {}) }); // lane task-group-fanout: `statuses` = the keys a write touched, `sync` = {removed, epoch, base, seq}
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
  onWriteError: (e, file, o) => fdGauge.reportWriteError(e, file, o), // session-status's twin (lane-dead-bridge)
  onChange: (todos) => {
    const json = JSON.stringify({ type: 'user-todos-updated', todos: { ...todos, now: Date.now() } }); // lane wake-approve-card r8: the snapshot says the HUB's time (a card's countdown counts by it — src/lib/user-todos-row.js noteHubClock)
    wss.clients.forEach(c => { if (c.readyState === WS_OPEN) { try { c.send(json); } catch {} } });
  },
});
require('./src/server/helper-asks').install({ userTodos, sessionKeyFor: (s, id) => sessionStatusKey(s, id), activeSessions, persistAskedAt: (s, map) => { if (s && s.sockName) writeSessionMeta(s.sockName, { ...(readSessionMeta(s.sockName) || {}), helperAskedAt: map }); } }); require('./src/server/main-asks').install({ userTodos, sessionKeyFor: (s, id) => sessionStatusKey(s, id), activeSessions, readAskedAt: (s) => (s && s.sockName ? (readSessionMeta(s.sockName) || {}).mainAskedAt : null), persistAskedAt: (s, map) => { if (s && s.sockName) writeSessionMeta(s.sockName, { ...(readSessionMeta(s.sockName) || {}), mainAskedAt: map }); } }); // lane S1: a helper's ask unanswered for 60 s ⇒ ONE For-you item, resolved when it is answered; lane parked-ask-inbox: a conversation's OWN ask the same (main-asks)
require('./src/server/unexpected-exit').install({ userTodos, sessionKeyFor: (s, id) => sessionStatusKey(s, id), activeSessions, clients: () => wss.clients, buffersDir: BUFFERS_DIR, accounts }); // B-f698: an unexpected exit while working is resumed ONCE by itself (one client asked) + one For-you item
const loginExpiryWatch = require('./src/server/login-expiry-watch.js').create({ accounts, userTodos, dataDir: path.join(__dirname, 'data'), log: (...a) => console.log(...a) }); loginExpiryWatch.start(); // PASSIVE (file reads only, §ban-safety): warns the inbox at 24h/1h/expired before a subscription's LOGIN SESSION dies AND retracts those warnings once the member is re-logged in — see src/login-expiry.js. The handle is kept so the accounts login routes can sweep it IMMEDIATELY on a successful login (up to 5 min of staring at the item you just fixed is the reported defect)
try { accounts.setUserTodos(userTodos); } catch (e) { console.warn('[accounts] the For-you tray could not be wired:', e.message); }   // the B-f276 family (bl-windows, r3046): an unread accounts list is told ONCE in For you
require('./src/server/ledger-shape-notice.js').wire({ usageHistory, userTodos }); // lane ledger-dedup-law F4: a shard out of shape pauses its machine's ingest — ONE named For-you notice per machine, resolved when it is back in shape
app.get('/api/user-todos', (req, res) => res.json({ todos: { ...userTodos.snapshot(), now: Date.now() } })); // r8: + the hub's clock
require('./src/routes/user-todos-reply.js').registerResolveManyRoute(app, { userTodos }); // "Mark all seen" (POST /api/user-todos/resolve-many, owner-only) — registered BEFORE the :id route below, which would otherwise read `resolve-many` as an item id
require('./src/routes/user-todos-reply.js').registerItemReadRoute(app, { userTodos }); // GET /api/user-todos/:id — ONE item whole (the snapshot previews a resolved item's detail at 300 chars; the For-you window fetches the rest here)
app.post('/api/user-todos/:id', (req, res) => { // User actions from the panel: done / dismissed / open (reopen)
  // lane owner-press-attended r2 (the 15th door): the ✓ on a takeover request's item hands the browser back — an ATTENDED
  // turn — so this door refuses EVERY bearer first, and the person's press rides the status to its listeners
  if (require('./src/write-origin.js').pressBearer(req.headers)) return res.status(403).json({ error: 'the For-you item\'s ✓ is the user\'s — a bearer token (an agent, a job, an automation key) cannot press it', code: 'agent_forbidden' });
  const press = require('./src/write-origin.js').pressOf(req);
  try { const item = userTodos.setStatus(req.params.id, req.body?.status, 'user', { pressed: press }); require('./src/user-todos.js').replyOnDisk(userTodos, res, () => res.json({ success: true, item }), () => res.status(503).json({ error: require('./src/user-todos.js').NOT_ON_DISK, code: 'todos-not-on-disk', item })); }   // B-0248: the person's act is on disk before its answer
  catch (e) { const decision = e && (e.code === 'decision_row' || e.code === 'decision_final'), held = e && e.code === 'todos-unread'; res.status(held ? 503 : decision ? 409 : 400).json({ error: e.message, ...(decision || held ? { code: e.code } : {}) }); } // lane wake-approve-card r2: a decision row's two verbs only — refused by name
});
// ── Agent-facing routes ── (extracted to src/agent-routes.js in the 2.92.0 split)
const { setupAgentRoutes } = require('./src/agent-routes');
// ── Background Work (2.342.0): jobs engine — constructed here, INITIALIZED
// only after listen (failure isolated; §5 of docs/design-background-work.md).
// Shared conversation delivery ladder (2.362.0): jobs notifications AND
// agent-to-agent messages ride one implementation — local CLI inbox, then the
// owning machine's daemon (conversation-index names it), then the durable
// stash drained at that conversation's next context injection.
const deliver = require('./src/server/conversation-deliver.js').create({
  dataDir: path.join(__dirname, 'data'),
  peerMsg: require('./src/peer-messaging.js'),
  getHosts: () => hosts,
  getConvIndex: () => hosts && hosts.convIndex,
  serverSetting, activeSessions, onStashChange: () => { try { stashView.changed(); } catch { } }, authorizeSpend: (req) => spendGuard.authorize(req), noteSpend: (rec) => spendGuard.note(rec), releaseSpend: (rec) => spendGuard.release(rec), reservationState: (rid) => spendGuard.reservationState(rid), waitingReservations: () => spendGuard.waitingReservations(), // THE SPEND CEILING (design §4.4c): every rung can open a BILLED turn on an idle session; a refusal is not a dropped message (the caller stashes and it rides the next injection)
  // 2.363.0: render the peer card at delivery time — server-posted injections
  // are body-less at the CLI, only the delivery site can show them live.
  emitPeerCard: (cid, card) => {
    for (const [, s] of activeSessions) {
      if (addressableId(s) !== cid || !s._normalizer) continue; // verify r6 (channel-withdraw): the card is drawn in the window that OWNS the conversation, never a pending fork's (it carries the parent's id)
      try { feedPeerCard(s, card); } catch { }
      return true;
    }
    return false;
  },
  log: (...a) => console.log(...a), renderBatch: require('./src/agent-routes.js').renderMsgStash,   // renderBatch (notify-retry verify r1): several parked notices go out as ONE frame in the hand-over's shape
});
const jobsWiring = require('./src/server/jobs-wiring.js').create({
  app, dataDir: path.join(__dirname, 'data'), deliver,
  broadcastAll: (msg) => { const payload = JSON.stringify(msg); for (const c of wss.clients) { try { if (c.readyState === WS_OPEN) c.send(payload); } catch {} } },
  userTodos, log: (...a) => console.log(...a), getTelemetry: () => { try { return telemetry; } catch { return null; } }, // jobs-archive-write-failed rides telemetry
  serverSetting, taskGroups: tasks, activeSessions, // owner auto-notify (2.344.0): toggles + channel-lane session lookup
  sessionStatusKey: (...a) => sessionStatusKey(...a), // lane jobs-addressed-push r2: a subscriber's groups NOW (viewerOf — push ⊆ view)
  onStash: () => { try { stashView.changed(); } catch { } }, // 2026-09-27: a job notification stashed / drained ⇒ the session's `stash` fact is re-published
  onRunEnded: (job) => { try { browserKeeper?.releaseJob?.(job.id, 'the job run ended'); } catch { } }, // lane jobs-browser: a run's end releases its browser lease + window
});
// WHAT WAITS FOR AN AGENT (2026-09-27, the owner: "我在界面里完全看不到'有消息在 queue'这件事情"): both stashes summarized as the `stash` session fact + the user's POST /api/sessions/:id/stash/hand-over (ONE ladder turn, spend reason stash-handover) — src/server/stash-handover.js
const stashView = require('./src/server/stash-handover.js').create({ activeSessions, getSendUserInput: () => sendUserInput /* B-02a3: the group hand-over types through THE typing path (created further down — TDZ-safe) */, getSpendGuard: () => spendGuard /* B-02a3 cure: THE spend ceiling (the usage engine's, above) — the press asks it first */, getDeliver: () => deliver, getJobs: jobsWiring.getJobs, getGroups: () => { try { return channelsWiring.groups; } catch { return null; } } /* lane group-report-card: the group messages waiting for a member's next turn (created further down — TDZ-safe) */, getChannels: () => { try { return channelsWiring.channels; } catch { return null; } } /* lane owner-press-attended: a delivered held channel wake clears its row's tag */, broadcastSessions: () => broadcastActiveSessions(), renderMsgStash: require('./src/agent-routes.js').renderMsgStash, renderNotifStash: require('./src/job-model.js').renderNotifStash, dataDir: path.join(__dirname, 'data') }); stashView.register(app);   // verify r4: dataDir = the delivered-hand-over memory on disk (a restart between a delivery and its echo)
deliver.registerFrameRestorer((cid, text, meta) => stashView.restoreHandedOver(cid, text, meta)); deliver.registerRedactor((match, scope) => stashView.redactDelivered(match, scope)); /* "Clear content…": the hand-over memory is a copy of held words */ // verify r2: a hand-over's frame that comes back from a wrapper is restored as its ORIGINAL entries (each store, each kind), never one blob; r4: `meta.kind` — a peer's frame never
function stashFactOf(s) { try { return stashView.summaryFor(s); } catch { return null; } } // boot-order safe: a payload built before the view exists states nothing
function poolPinFactOf(s) { return s._poolPin && s._poolPin.memberId ? { memberId: s._poolPin.memberId, name: accounts.get(s._poolPin.memberId)?.name || s._poolPin.memberId, at: s._poolPin.at || null } : null; } // THE CONVERSATION'S PIN (2026-09-28): one payload key per line (the active-sessions census reads the line's keys)
// Channels v1 (2.362.0): per-session external reach override for agent
// messaging — user-set (Session Properties), widening only; ACL reads the
// live field, meta persists it across restarts.
app.post('/api/sessions/:id/msg-reachability', (req, res) => {
  const s = activeSessions.get(String(req.params.id));
  if (!s) return res.status(404).json({ error: 'no such active session' });
  const lv = String((req.body || {}).level || 'inherit');
  if (!['inherit', 'visible', 'messageable'].includes(lv)) return res.status(400).json({ error: 'level must be inherit|visible|messageable' });
  s._msgReachability = lv === 'inherit' ? null : lv;
  Promise.resolve((() => { try { return writeSessionMeta(s.sockName, { ...readSessionMeta(s.sockName), msgReachability: s._msgReachability }, { durable: true }); } catch { return true; } })()).then((ok) => (ok === false ? res.status(503).json({ error: 'Saved, but not on disk yet — the storage has not written it (it is slow or failing). It stays in memory and is written when the storage can; a restart before then loses it.', code: 'not-durable', level: lv }) : res.json({ ok: true, level: lv })), () => res.json({ ok: true, level: lv }));   // round 2 (law B): the person's reach level — the answer after the disk
});
require('./src/server/wait-watch.js').install({ activeSessions, getDeliver: () => deliver, getGroups: () => { try { return channelsWiring.groups; } catch { return null; } }, getUserTodos: () => userTodos, sessionKeyOf: (s, id) => sessionStatusKey(s, id), log: console }); const recordClear = require('./src/server/record-clear.js').create({ tasks, userTodos, sessionStatus, getJobs: jobsWiring.getJobs, getGroups: () => channelsWiring.groups, getChannels: () => channelsWiring.channels }); require('./src/routes/records-clear.js').registerRecordClearRoutes(app, { recordClear }); // "Clear content…" (2026-09-28): ONE entry point (PURE verdict, each store's door, the journal line); the owner's POST /api/records/clear[-many] here, an agent's own verbs through setupAgentRoutes
setupAgentRoutes({ app, activeSessions, tasks, sessionStatus, SessionStatusManager, userTodos, sessionStatusKey, serverSetting, spendGuard, scheduleCtxSync, remoteCtxBaseFor, readUserState: () => persistenceRouter.readUserState(), readUserStatePending: () => persistenceRouter.readUserStatePending(), getJobs: jobsWiring.getJobs, deliver, getPublishedPages: () => publishedPages, getChannels: () => channelsWiring.channels, getGroups: () => channelsWiring.groups, getTouches: () => channelsWiring.touches, getRecordClear: () => recordClear, getSendUserInput: () => sendUserInput, getSessionMetaStore: () => ({ readSessionMeta, writeSessionMeta }), carryDir: path.join(__dirname, 'data') }); // lane report-mark-on-ack r3: carryDir = the outstanding deliveries by conversation (a restart is said from it). B-86d3: the seen marks ride the session meta; lazy getters: all three are created further down (TDZ at boot otherwise); getChannels = the vibespace-channels routes' engine (P3); getSendUserInput = THE typing path for a dispatch's `/compact` (lane worker-dispatch — sendUserInput is declared further down)
app.get('/api/agent-hooks', async (req, res) => { try { await rootFactsNow(); res.json({ ...(await agentHooksStatus()), integrationOff: !integrationEnabled(), cliConfig: await harnessConfig.cliConfigStatus() }); } catch (e) { res.status(500).json({ error: String((e && e.message) || e) }); } }); // cliConfig = fresh per-key receipts for the managed CLI-config rows (Settings window chips + the Machines card; D2: never persisted)
app.post('/api/agent-hooks/install', async (req, res) => { try {   // B-1425: an async route answers a throw (500), never hangs
  // The master switch outranks the button: boot/toggle would strip the entries
  // right back — refuse with guidance instead of silently contradicting.
  { const sh = typeof persistenceRouter.settingsHeld === 'function' ? persistenceRouter.settingsHeld() : null; if (sh) return res.status(503).json({ error: `the settings could not be read (${sh.kind}${sh.code ? ', ' + sh.code : ''}) — the hooks were not installed; nothing was written`, code: 'store_unread', held: sh }); } if (!integrationEnabled()) return res.status(400).json({ error: 'VibeSpace integration is disabled (Settings → Integration → master switch). Enable it first.' });   // B-225b r552: the HOLD answered by name first (its strict side reads the switch OFF)
  await rootFactsNow(); createHookHelper(); // B-1425: the verdict on the root's true facts; regenerate the script too (repair path)
  const results = await ensureAgentHooks({ auto: false }); // explicit → clears any opt-out (B-ddf3 u2 line 1: through the shipped helper, answered at its landing)
  // A worktree / temp server refuses BY NAME (src/server-root.js) — never "installed"
  if (results.refused) return res.status(409).json({ error: results.refused.line, refused: results.refused, status: await agentHooksStatus() }); if (results.skipped && results.settingsHeld) return res.status(503).json({ error: 'the settings could not be read — the hooks were not installed; nothing was written', code: 'store_unread', held: { file: 'settings.json', kind: results.settingsHeld.kind, code: results.settingsHeld.code || null, since: null, rung: 'said' } });
  res.json({ ...hooksLate.installAnswer(results), results, status: await agentHooksStatus() });   // r3064 (7): one verdict — a missing CLI folder is no failure (r1518); a refused row of the same run named
} catch (e) { if (!res.headersSent) res.status(500).json({ error: String((e && e.message) || e) }); } });
hooksLate.registerApplyRoute(app, { ensureAgentHooks, agentHooksStatus, integrationEnabled, harnessConfig, hookRegistrationSafe, rootFactsNow }); // POST /api/cli-config/apply — the missing-file chip's "Apply" (human-triggered): the boot registration + CLI-config plan on demand (lane hooks-create)
app.post('/api/agent-hooks/uninstall', async (req, res) => { try {
  await rootFactsNow(); const landing = await removeAgentHooks(); // B-ddf3 u2: the removal through the shipped helper, answered at its landing, a failure by name
  res.json({ success: !(landing && landing.ok === false), ...(landing && landing.ok === false ? { error: `the removal did not land: ${landing.why}` } : {}), status: await agentHooksStatus() });
} catch (e) { res.status(500).json({ error: String((e && e.message) || e) }); } });

// ── Hosts (the MACHINE registry — ssh hosts AND dial-out devices, B-f3e8) ──
const { HostManager } = require('./src/hosts');
const hosts = new HostManager({ dataDir: path.join(__dirname, 'data') });
hosts.ownerWriteRefusal = refuseOwnerWrite; hosts.rootFactsNow = rootFactsNow; // the root verdict (src/server-root.js): a worktree / temp server runs no register helper on another machine either
hosts.cliConfigPlanB64 = cliConfigPlanB64; // the CLI-config plan rides every remote install + the gated --status probe as VIBESPACE_CLI_CONFIG (design-harness-settings §6)
const bcastAll = (msg) => { const j = JSON.stringify(msg); wss.clients.forEach(c => { if (c.readyState === WS_OPEN) { try { c.send(j); } catch {} } }); };
// B-f3e8 one-time migration: dial-tokens.json (deviceId → sha256) folds into
// the dial host records (dialTokenHash) — see hosts.migrateDialTokenFile.
try { hosts.migrateDialTokenFile(path.join(AGENTD_DIR, 'dial-tokens.json')); }
catch (e) { console.warn('[hosts] dial-token migration failed:', e.message); }
hosts.dialOnline = (deviceId) => agentdDials.has(deviceId);
// ── R4 push-triggered remote ledger (docs/design-three-tier.md): a connected
// daemon fs.watches its transcript dirs (.claude/sessions+projects and
// .codex/sessions) and pushes one debounced dirty per change burst; we
// harvest promptly instead of waiting for a turn-end result or the idle
// 15-min cadence. harvestUsage's own 60s/host floor bounds frequency, and
// the op harvest (2.286.0) is incremental + cheap — so ANY remote activity
// (mid-turn tool storms, codex, external terminals) reaches the ledger and
// the billing popup within ~a minute. One dirty signal, two consumers: this
// kick + discovery cache invalidation (armed in hosts._armDirtyPush). ──
// usage-events PUSH consumer (R4 finale, 2.299.0): batches arrive
// seconds-fresh over the device link; ingest through the SAME pipeline the
// pull harvest uses (attribution + rid namespacing + host-bucket honesty),
// then invalidate the estimator so the next pool decision sees the spend.
// Returning normally (not false) tells hosts to ACK — which is what commits
// the device-side cursor (two-phase). A throw leaves the batch unacked → the
// daemon re-emits → rid dedup absorbs the replay.
// ── Session-brain core (src/server/session-brain.js, decomposition #8) ──
const sessionBrain = require('./src/server/session-brain.js').create({
  engine: { kickPoolEval, markLimitBanner, maybeStopOnFallback,
    recordRateLimitEvent, resolveUsageKey, usageEstimator, noteServedModel, noteModelFallback, rerouteAnnouncedBy, notePoolAuthFailure, noteStreamRecord, recordIsLate, noteModelRequest, noteCompacted, noteTurnStart }, // the device feed shares the parse's ONE served-model/fallback pair + the r4 rule that places the reroute BEFORE the served capture (2026-09-13); notePoolAuthFailure = the api_error 401/403 twin (design-unknown-records; forward-compat — the record is observed only in transcripts, which are NOT fed)
  applyTaskToolUpdate, updateSessionTodos,
  getUsageHistory: () => { try { return usageHistory; } catch { return null; } },
  // design-unknown-records (2026-09-21): the chrome-signal consumers' deps (notification toast,
  // vcs fact + timeline, published-change meta) — one implementation for both feeds
  getServerNotice: () => serverNotice, broadcastActiveSessions: (...a) => broadcastActiveSessions(...a),
  broadcastAll: (msg) => { const json = JSON.stringify(msg); for (const c of wss.clients) { try { if (c.readyState === WS_OPEN) c.send(json); } catch {} } }, // session-vcs must reach an explorer-only client, not just the session's attached ones
  getSessionMetaStore: () => ({ readSessionMeta, writeSessionMeta }), getSessionStatus: () => { try { return sessionStatus; } catch { return null; } }, sessionStatusKey,
});
const { sbSeenFirst, claudeSideEffects, noteTurnFeed } = sessionBrain;
hosts.onSessionEvents = (hostId, m) => {
  try {
    if (!m?.sid) return;
    // STEP 3: raw records → the shared side-effect consumers, device-first.
    // Session lookup by the DAEMON's sid (keeperSid); miss = not ours (an
    // externally-adopted pipe session) — parity ring still records below.
    if (Array.isArray(m.raw) && m.raw.length) {
      let sess = null;
      for (const [, s3] of activeSessions) { if (s3.host === hostId && s3.keeperSid === m.sid && s3.backend !== 'codex') { sess = s3; break; } }
      if (sess) {
        for (const line of m.raw) {
          let rec = null; try { rec = JSON.parse(line); } catch { continue; }
          noteTurnFeed(sess, rec, 'device'); if (sbSeenFirst(sess, rec)) claudeSideEffects(sess, sess._webuiId || null, rec);   // B-d868 cure 3: the feed's position is noted where it DELIVERS, before the gate that may drop the record
        }
      }
    }
    // (its normalized `batch` fed the step-2 parity soak — removed in 2.369.407: the raw records above are the feed)
  } catch { }
};
hosts.onUsageEvents = (hostId, text) => {
  if (!text) return true;
  const h = hosts.get(hostId);
  const done = (r) => {
    if (r.added > 0) { try { for (const [ik] of usageIdentityGroups()) usageEstimator.invalidate(ik); } catch { } try { kickPoolEval(); } catch { } }
    return usageAckOf(r); // lane ledger-dedup-law r5: THE ACK is durability — every row appended or held (a pause alone never withholds it); deferred or a month's hold unwritten ⇒ unacked, the device keeps the batch
  };
  const r = usageHistory.ingestRemoteEvents(hostId, h?.name || hostId, text);
  return r && typeof r.then === 'function' ? r.then(done, () => false) : done(r); // r8: a held month lands on the hold's async road — the ack waits for it
};
{
  const dirtyTimers = new Map();
  // Remote discovery went stale (create / terminate / external kill / device
  // push) — every connected client's cached host list must re-fetch. Trailing-
  // debounced per host so a burst of invalidations is one broadcast.
  // …and the ORCHESTRATOR computes it ONCE and pushes the RESULT (2.310.0).
  // The first cut broadcast a bare "dirty" and let every client re-fetch with
  // ?fresh=1 — which puts the trigger for a heavy scan on the orchestration
  // side and multiplies it by the number of connected clients. The three-tier
  // rule is the opposite: the machine that OWNS the facts computes them (the
  // capability-gated `discovery-claims` op runs the whole claim algorithm on
  // the device, next to the bytes), the orchestrator forwards, the client is a
  // view. One dirty signal ⇒ one computation ⇒ one broadcast, whatever the
  // client count. Skipped entirely when nobody is connected.
  // AUTO-GRADUATE ssh → ws (2.311.0). The graduation mechanism has existed
  // since 2.248.0 but was button-only, so in practice every machine stayed on
  // ssh forever — per-op child spawns, banner hangs on lossy paths, and a
  // ControlMaster whose ESTABLISHED flow survives network changes that every
  // NEW connection fails (the 2.228.1 lie). Once we have proven we can reach
  // the machine, moving to our own ws link is strictly better.
  // DELIBERATELY CONSERVATIVE: only with an operator-declared base URL — never
  // auto-publish this instance to the public relay, which is a side effect the
  // operator has to choose. The machine is still asked whether it can reach
  // that URL BEFORE anything is installed, and any failure leaves it on ssh.
  const gradTried = new Map();
  hosts.onSshConnected = (hostId) => {
    try {
      if (!hostId || serverSetting('agentd.autoGraduate') === false) return;
      const h = hosts.get(hostId);
      if (!h || h.transport === 'dial' || h.deviceId || h.autoGraduate === false) return; // already graduated / opted out
      if (!instanceUrl.operatorUrl()) return; // nothing OPERATOR-DECLARED to dial back to: neither the hub's own https address nor an automatic relay publish (frp-auto) is (B-f55a, instance-url.js operatorUrl) (was agentdDeps.publicUrl — a ghost binding since the split; auto-graduation silently never fired)
      const last = gradTried.get(hostId) || 0;
      if (Date.now() - last < 6 * 60 * 60 * 1000) return;               // one attempt per machine per 6h
      gradTried.set(hostId, Date.now());
      setTimeout(async () => {
        try {
          const base = instanceUrl.operatorUrl(); if (!base) return; const out = await graduateHostToDial(hosts.get(hostId), { by: 'system:graduate', serverUrl: base }); // the address judged as it dials (never url()'s fallback)
          serverNotice('grad-' + hostId, `"${h.name}" now talks to VibeSpace over its own ws link${out.dialedIn ? '' : ' (dialing in shortly)'} — ssh stays as the rescue channel.`);
        } catch (e) {
          // Never silent: the operator asked for ws and did not get it.
          console.warn('[graduate] auto attempt failed for', hostId, e.message);
          serverNotice('grad-fail-' + hostId, `Could not move "${h.name}" to a ws link — staying on ssh. ${String(e.message).slice(0, 180)}`, { level: 'warn' });
        }
      }, 3000); // let the connect that triggered us finish its own work first
    } catch { }
  };

  const discDirtyTimers = new Map();
  hosts.onDiscoveryDirty = (hostId) => {
    if (!hostId || discDirtyTimers.has(hostId)) return;
    discDirtyTimers.set(hostId, setTimeout(async () => {
      discDirtyTimers.delete(hostId);
      try {
        if (!wss.clients.size) return; // nobody to tell — do not spend the scan
        const d = await hosts.discoverSessions(hostId, { ttlMs: 0 });
        bcastAll({ type: 'remote-sessions', hostId, sessions: Array.isArray(d) ? d : (d?.sessions || []), at: Date.now() });   // B-5278 (r951): discoverSessions answers the ROWS (an array) — `d.sessions` pushed [] every time
      } catch (e) {
        // An unreachable machine must not silently freeze the list at a state
        // we know is wrong — say so, and let the client keep its labelled
        // last-known copy (the same degrade the pull path already does).
        try { bcastAll({ type: 'remote-sessions', hostId, error: String(e?.message || e), ...(typeof e?.code === 'string' && /^discovery-/.test(e.code) ? { code: e.code } : {}), at: Date.now() }); } catch { }
      }
    }, 400));
  };
  hosts.onDeviceDirty = (hostId) => {
    if (dirtyTimers.has(hostId)) return; // trailing-debounce per host
    dirtyTimers.set(hostId, setTimeout(() => {
      dirtyTimers.delete(hostId);
      try {
        hosts.harvestUsage(hostId, { minIntervalMs: 60 * 1000, scannerPath: USAGE_SCANNER_PATH, ledger: usageHistory }) // lane ledger-dedup-law F2: it ingests, then commits the hub's cursor
          .catch(() => { });
      } catch { }
    }, 3000));
  };
}
const { MachineMounts } = require('./src/machine-mounts');
const machineMounts = new MachineMounts({
  dataDir: path.join(__dirname, 'data'), hosts, mountTokens,
  publicUrl: () => instanceUrl.url(), localPort: () => PORT, // the agentd tunnel's target: our own /dav
  rcloneBin: () => mounts.rcloneBin(),
  broadcast: bcastAll,
  log: (m) => console.log('[machine-mounts]', m),
});
setTimeout(() => { machineMounts.restore().catch(() => {}); }, 5000); // heal pull mounts + re-own push tunnel ports
app.get('/api/machine-mounts', (req, res) => res.json({ mounts: machineMounts.list(), ...(machineMounts.unreadWords() ? { unread: machineMounts.unreadWords() } : {}), ...(machineMounts.tornCopy?.() ? { torn: machineMounts.tornCopy() } : {}) }));   // B-f276 remainder: why the list is empty while held (B-f276 family unit 2: and a torn lift's copy, r3081)
app.post('/api/machine-mounts/:hostId', async (req, res) => {
  try {
    const b = req.body || {};
    if (b.dir === 'pull') {
      res.json(await machineMounts.mountPull(req.params.hostId, { remotePath: b.remotePath, mountpoint: b.mountpoint, now: true }));
    } else {
      // PRIMARY transport = the agentd tunnel (inside mountPush — no public
      // address needed). The request-derived URL is only the last-resort
      // fallback for hosts without the device agent.
      let pub = b.publicUrl ? String(b.publicUrl) : null;
      if (!pub) pub = require('./src/write-origin.js').ownOriginOf(req.headers, { encrypted: !!(req.socket && req.socket.encrypted) }) || null; // the request's own origin: THE one rule
      res.json(await machineMounts.mountPush(req.params.hostId, { folder: b.folder, mode: b.mode, mountpoint: b.mountpoint, publicUrlFallback: pub, now: true }));
    }
  } catch (e) { res.status(e && e.status === 503 ? 503 : 400).json({ ...require('./src/mount-error-words.js').errorBody(e), ...(e && e.status === 503 && e.code ? { code: e.code } : {}) }); }
});
app.delete('/api/machine-mounts/:id', async (req, res) => {
  try { res.json(await machineMounts.unmount(String(req.params.id), { now: true })); } catch (e) { res.status(e && e.status === 503 ? 503 : 400).json({ ...require('./src/mount-error-words.js').errorBody(e), ...(e && e.status === 503 && e.code ? { code: e.code } : {}) }); }
});
app.post('/api/machine-mounts/:id/remount', async (req, res) => {
  try { res.json(await machineMounts.remount(String(req.params.id), { now: true })); } catch (e) { res.status(e && e.status === 503 ? 503 : 400).json({ ...require('./src/mount-error-words.js').errorBody(e), ...(e && e.status === 503 && e.code ? { code: e.code } : {}) }); }
});

// ── Port forwarding (B-0b60, tunnel path): expose a machine's loopback
// service at http://127.0.0.1:<localPort> on this instance, over the agentd
// data plane (no frps / public exposure). ──
const { PortForwardManager } = require('./src/port-forward');
const portForwards = new PortForwardManager({
  dataDir: path.join(__dirname, 'data'), hosts, broadcast: (m) => { bcastAll(m); require('./src/server/artifact-registry.js').noteForwards(m); }, // lane artifacts-services-url: a service card's link follows its forward
  serverSetting, getJobs: jobsWiring.getJobs, // Background Work ⇄ ports sync (2.343.0)
  log: (m) => console.log('[port-forward]', m),
});
jobsWiring.jm.d.getPorts = () => portForwards; // late singleton — lazy getter, never a Proxy
setTimeout(() => { portForwards.restore().catch(() => {}); }, 5500);
const instanceUrl = require('./src/server/instance-url.js').create({ dataDir: path.join(__dirname, 'data'), port: PORT, serverSetting, httpsUrl: () => hub.url(), log: (...a) => console.log(...a), authEnabled: () => auth.enabled, broadcast: (m) => bcastAll(m), plugins: { relayStatus: () => plugins.relayStatus(), frpPublish: (...a) => plugins.frpPublish(...a), frpUnpublish: (...a) => plugins.frpUnpublish(...a), setSelfDialSub: (...a) => plugins.setSelfDialSub?.(...a) } }); // ONE resolver for "this instance's URL" (frp mapping layered OVER agentd.publicUrl, never written into it) + the ONLY publisher of the 'vibespace-instance' proxy; plugins arrives later so its accessors are lazy ⇒ src/server/instance-url.js
let _arRestoreSettled = false;   // B-9a24 (r3434 (8)): the boot's restore and the remote re-adoption have settled — until then an armed conversation not live yet is not «gone»
const autoResume = require('./src/server/auto-resume.js').create({ dataDir: path.join(__dirname, 'data'), activeSessions, serverSetting, restoreSettled: () => _arRestoreSettled, beforeFire: (id, s) => { try { return beforeAutoResumeFire(id, s); } catch (e) { console.warn('[auto-resume] pre-fire gate threw — refusing the continue (fail closed):', e && e.message); return false; } }, fireIdentity: (id, s) => { try { return fireIdentityFor(s); } catch { return null; } }, authorizeSpend: (id, s, identity, o) => spendGuard.authorize({ reason: 'auto-resume', session: s, sessionId: id, sessionName: s && s.name, identity, hold: !!(o && o.hold) }), noteSpend: (id, s, identity, hold) => spendGuard.note({ reason: 'auto-resume', session: s, identity, hold }), releaseSpend: (id, s, hold) => spendGuard.release({ hold }), noteBatchSpend: (id, s, identity, hold, reason, press) => spendGuard.note({ reason, session: s, identity, hold, press }), notePress: (batchId, n, reason) => spendGuard.notePress({ reason, press: batchId, n }), notePressEnd: (batchId, delivered) => spendGuard.notePressEnd({ press: batchId, delivered }), renewSpend: (holds) => spendGuard.renewHolds(holds), modelOf: (id, s) => sessionModelFor(s), workflowRunAtWall: (id, s, o) => require('./src/server/auto-resume-workflow.js').runAtWallFor(s, o), previewSpendBatch: (items) => spendGuard.previewBatch({ reason: 'bulk-resume', items: items.map((it) => ({ session: it.session, sessionId: it.id, identity: it.identity })) }), authorizeSpendBatch: (items, reason) => spendGuard.authorizeBatch({ reason, items: items.map((it) => ({ session: it.session, sessionId: it.id, sessionName: it.session && it.session.name, identity: it.identity })) }), wallVerdict: (id, s) => sessionWallVerdict(s), clearStopped: (id, s, why) => { try { clearStoppedBy(s, why); } catch { } }, persistFlag: (id, s) => { if (s && s.sockName) { try { patchSessionMeta(s.sockName, { autoResume: s._autoResume === undefined ? undefined : !!s._autoResume }, { owner: id }).then((ok) => { if (!ok) console.warn(`[auto-resume] ${id}: the auto-continue choice is kept in memory only — its meta could not be patched (a restart would forget it)`); }); } catch { } } }, onListChange: () => { try { broadcastActiveSessions(); } catch { } }, log: (...a) => console.log(...a), broadcast: (id, m) => { const s = activeSessions.get(id); if (s) broadcastToSession(s, id, m); }, notify: (id, s, text, extra) => { try { feedPeerCard(s, { fromName: 'VibeSpace', kind: 'notification', text, ...(extra && extra.resetCredit ? { resetCredit: extra.resetCredit } : {}) }); } catch { } }, resetCreditOffer: (id, s) => { try { return resetCreditOffer(s); } catch { return null; } }, sendToSession: (id, s, text, carried) => { try { const ad = adapterRegistry.get(s.backend); if (!ad || !s.pty || s.mode !== 'chat') return false; const { stdinPayload, userMsg } = ad.formatChatInput(text, Date.now() + '-auto', { origin: 'auto-resume' }); /* a frame the wrapper holds mid-turn stays VibeSpace's: never edited, never put back (2.369.354) */ s._isStreaming = true; s._machineInputAt = Date.now(); s._lastSendLocal = false; /* B-ba09 r1505: a send that is no person's local command clears the stamp */ delete s._turnOpenSaidAt; require('./src/turn-state.js').noteRequestSent(s, Date.now()); /* the request goes out now: the in-flight cache fact (lane cache-warmth-tiles r4) */ /* a turn nobody typed — prompt-context withholds next-turn group reports from it (§22) */ s.pty.write(stdinPayload + '\n'); if (userMsg) { userMsg.originKind = 'auto-resume'; if (userMsg.payload) userMsg.payload.webui_origin = 'auto-resume'; const note = carried && typeof carried.note === 'string' && carried.note ? carried.note.slice(0, 200) : null; if (note) { userMsg.originNote = note; if (userMsg.payload) userMsg.payload.webui_origin_note = note; } s.buffer = require('./src/chat-ring.js').trimRing(s.buffer + JSON.stringify(userMsg) + '\n', s, id); feedLive(s, userMsg); } return true; } catch (e) { console.warn('[auto-resume] send failed:', e.message); return false; } } }); // continue a limited session when its quota resets ⇒ src/server/auto-resume.js
autoResume.start(); const bulkResume = require('./src/server/bulk-resume-routes.js').create({ activeSessions, pressesToday: () => spendGuard.pressesToday(), getAutoResume: () => autoResume, getUsageHistory: () => { try { return usageHistory; } catch { return null; } }, readCacheFor: (k) => readRawUsageCache(k), sessionModelFor: (s) => sessionModelFor(s), log: (...a) => console.log(...a) }); bulkResume.register(app); // «对所有会话开启自动续接» + «恢复所有因用量/过载停止的会话» (cookie only) + the batch's cost, said first + the card's stop fact ⇒ src/server/bulk-resume-routes.js
const permissionRules = require('./src/server/permission-rules.js').create({ activeSessions, adapterRegistry, accounts, agentEnv: (...a) => require('./src/ws-handler').agentEnv(...a), buffersDir: BUFFERS_DIR, codexCmdRef: () => cliCmds.current('codex') || CODEX_CMD, telemetry: { record: (e) => { try { telemetry.record(e); } catch { } } } }); permissionRules.registerRoutes(app); instanceUrl.registerRoutes(app); hub.registerRoutes(app); instanceUrl.restore(); Object.defineProperty(app.locals, 'instancePublicUrl', { get: () => { try { return instanceUrl.url(); } catch { return null; } } }); app.get('/api/port-forwards', (req, res) => res.json({ forwards: portForwards.list(), held: portForwards.heldWords(), torn: portForwards.tornCopy() })); // permissionRules = the READ-ONLY "where does this rule come from" view (owner ruling 10) + the human-triggered zero-network local oracles (ruling 6) ⇒ src/server/permission-rules.js
app.get('/api/hosts/:id/ports', async (req, res) => {
  // the UI path probes protocols (http/https/tcp chip); the watch sweep doesn't
  try { res.json({ ports: await portForwards.detect(req.params.id, { probe: true }) }); } catch (e) { res.status(e.status || 400).json({ error: e.message, ...(e.code ? { code: e.code } : {}) }); }
});
app.post('/api/hosts/:id/port-forward', async (req, res) => {
  try {
    const b = req.body || {};
    res.json(await portForwards.forward(req.params.id, b.port, { label: b.label || '', targetHost: b.targetHost || '', now: true }));
  } catch (e) { res.status(e.status || 400).json({ error: e.message, ...(e.code ? { code: e.code } : {}) }); }
});
app.delete('/api/port-forward/:id', async (req, res) => {
  try { await portForwards.unforward(String(req.params.id), { now: true }); res.json({ ok: true }); } catch (e) { res.status(e.status || 400).json({ error: e.message, ...(e.code ? { code: e.code } : {}) }); }
});
// public exposure (frp relay) — publish/unpublish a forward; body.sub = a
// user-chosen FIXED subdomain (2.358.0; blank keeps prior/random)
app.post('/api/port-forward/:id/publish', async (req, res) => {
  try { res.json(await portForwards.publish(String(req.params.id), { sub: (req.body || {}).sub, now: true })); } catch (e) { res.status(e.status || 400).json({ error: e.message, ...(e && e.code ? { code: e.code } : {}) }); }   // B-1217: the relay's code (the page words it); r3174: the store's own status (503 while the list is held)
});
app.delete('/api/port-forward/:id/publish', async (req, res) => {
  try { await portForwards.unpublish(String(req.params.id), { now: true }); res.json({ ok: true }); } catch (e) { res.status(e.status || 400).json({ error: e.message, ...(e && e.code ? { code: e.code } : {}) }); }   // B-1217: the relay's code; r3174: the store's own status (503 while the list is held)
});
// main-domain PATH mount (2.358.0): /svc/<name>/ → the forward. body.public
// (2.359.0) = shareable WITHOUT login; default private, auth enforced
// per-mount inside path-mounts (the /svc prefix is middleware-exempt).
app.post('/api/port-forward/:id/path', (req, res) => {
  try { res.json(portForwards.setPathMount(String(req.params.id), (req.body || {}).name ?? null, { public: (req.body || {}).public, now: true })); } catch (e) { res.status(e.status || 400).json({ error: e.message, ...(e.code ? { code: e.code } : {}) }); }
});
app.delete('/api/port-forward/:id/path', (req, res) => {
  try { res.json(portForwards.setPathMount(String(req.params.id), null, { now: true })); } catch (e) { res.status(e.status || 400).json({ error: e.message, ...(e.code ? { code: e.code } : {}) }); }
});
const pathMounts = require('./src/server/path-mounts.js').create({ getPortForwards: () => portForwards, requestAuthed: (req) => auth.requestAuthed(req) });
app.use('/svc', pathMounts.handler);
const publishedPages = require('./src/server/published-pages.js').create({ // 2.364.0 接管artifact: /p/<id> auth-exempt, gated PER PAGE in the module (CSP sandbox = the XSS guard); onPublished = the ONE notify point (dialog + agent publishes)
  dataDir: path.join(__dirname, 'data'), requestAuthed: (req) => auth.requestAuthed(req), log: (...a) => console.log(...a), publicUrl: () => instanceUrl.url(),
  onPublished: (page, extra) => { const s2 = page.sessionId && activeSessions.get(page.sessionId); if (s2) broadcastToSession(s2, page.sessionId, { type: 'page-published', sessionId: page.sessionId, page }); require('./src/server/artifact-registry.js').notePage(page, extra); }, // lane artifacts-registries: + its conversation's `page` row
});
publishedPages.registerRoutes(app); // 2.364.0 published pages (/p/<id> + /api/pages); the Design window publishes through the same store (lane design-docs: the Claude CLI kit that was wired here is gone — the Design window is VibeSpace's own, src/server/design-engine.js)
// protocol override: {proto: 'http'|'https'|'tcp'|null} (null = back to auto);
// a published forward is transparently re-published in the new mode
app.post('/api/port-forward/:id/proto', async (req, res) => {
  try { res.json(await portForwards.setProtoOverride(String(req.params.id), (req.body || {}).proto ?? null, { now: true })); }
  catch (e) { res.status(e.status || 400).json({ error: e.message, ...(e.code ? { code: e.code } : {}) }); }
});
// Kill a LOCAL orphaned listener (B-16d9): killOrphan re-verifies the
// deleted-cwd condition at kill time, so this can't target a healthy process.
app.post('/api/ports/kill-orphan', (req, res) => {
  try { res.json(portForwards.killOrphan((req.body || {}).pid)); } catch (e) { res.status(e.status || 400).json({ error: e.message, ...(e.code ? { code: e.code } : {}) }); }
});
// On-demand EXIT (task #164): let an agent borrow a machine's network / run a command on it for ONE command.
// Who may, per machine: two lists (lane-pairing ⑥, PURE src/exit-reach.js) — the routes are src/server/exit-routes.js.
const { ExitProxyManager } = require('./src/exit-proxy');
// lane device-upgrade-stuck: an agent upgrade the hub gave up on reaches the user — ONE For-you item per (machine, version) + the row's line, gone at that version (every transport's door); lane host-stale-dialer (B-6136): a second agent with an old token — its row's line, ONE For-you item per episode, a 10-min journal line (src/server/dial-health-watch.js)
const deviceAlerts = require('./src/server/device-alerts.js').create({ userTodos, dataDir: path.join(__dirname, 'data'), log: (...a) => console.log(...a) }); hosts.onDeviceAlert = (kind, facts) => deviceAlerts.file(kind, facts); /* lane device-act-audit: a pairing minted, a first dial from a new address, a pushed update = URGENT For you */ const deviceUpgradeWatch = require('./src/server/device-upgrade-watch.js').create({ userTodos, held: () => !!(hosts.held && hosts.held()), dataDir: path.join(__dirname, 'data'), log: (...a) => console.log(...a), bcast: () => { try { bcastAll({ type: 'hosts-updated' }); } catch { } }, alerts: deviceAlerts });
hosts.onAgentUpgrade = (event, facts) => deviceUpgradeWatch.onAgentUpgrade(event, facts); hosts.agentUpgradeOf = (id) => deviceUpgradeWatch.rowOf(id); const dialHealthWatch = require('./src/server/dial-health-watch.js').create({ userTodos, hosts, dataDir: path.join(__dirname, 'data'), log: (...a) => console.log(...a), bcast: () => { try { bcastAll({ type: 'hosts-updated' }); } catch { } } }); require('./src/server/host-key-watch.js').create({ userTodos, hosts, dataDir: path.join(__dirname, 'data'), log: (...a) => console.log(...a), bcast: () => { try { bcastAll({ type: 'hosts-updated' }); } catch { } } }); // lane lg-remote-hardening: a changed ssh host key ⇒ For you
const exitProxy = new ExitProxyManager({ hosts, grants, log: (m) => console.log('[exit]', m), dataDir: path.join(__dirname, 'data'), userTodos, settingOf: (k) => serverSetting(k), sessionsMap: () => activeSessions, bcastAll: (...a) => bcastAll(...a),
  emitCard: (s, card) => feedPeerCard(s, { ...card, belongsTo: require('./src/exit-call.js').cardMatcher(card) }), groupsOf: (s, id) => { const a = { sessionKey: sessionStatusKey(s, id), cwd: s.cwd, hostId: s.host || null, initialGroupId: s._initialGroupId, initialGroupIds: s._initialGroupIds }; return tasks.isHeldUnread() ? tasks.groupIdsForGrant(a, 'exit') : tasks.memberIds(a); }, lineageOf: (ids) => tasks.grantGroupsOf(ids).inherited, groupNameOf: (id) => tasks.lineageNameOf(id) });
hosts.onReachChange = (why) => exitProxy.rejudgeAll(`hosts-${why}`); require('./src/server/hub-act-ask.js').wire({ hosts, userTodos, exitProxy, settingOf: (k) => serverSetting(k), activeSessions }); // verify-r3 A-r3a: an import / a removal / a reshape of hosts.json re-judges every lent machine (the PATCH was the only writer that did); lane hub-act-ask (q-042 D4): on a cluster instance a hub act nobody clicked asks the owner first
setTimeout(() => { try { const n = exitProxy.reconcileAsks(); if (n) console.log(`[exit] ${n} "ask me" item(s) from before the restart resolved expired`); } catch { } }, 3000).unref?.(); grants.onChange(({ door }) => { if (door === 'exit') { try { exitProxy.rejudgeAll('grants'); } catch { } try { bcastAll({ type: 'hosts-updated' }); } catch { } } if (door === 'group-visibility') { try { tasks._notify(); } catch { } } }); /* lane grants-unify: a machine's exit rows / a group's visibility changed ⇒ re-judged NOW */
// ── Exit routes + RemoteFs singletons (src/server/exit-routes.js, decomposition #10) ──
const { exitAgentSession, remoteFs, sshKey,
} = require('./src/server/exit-routes.js').create({
  app, rootDir: __dirname, AGENT_BIN_DIR, activeSessions, auth, wss, WS_OPEN,
  bcastAll: (...a) => bcastAll(...a),
  integrationEnabled: (...a) => integrationEnabled(...a),
  unpairDialDevice: (...a) => unpairDialDevice(...a),
  hosts,
  getExitProxy: () => { try { return exitProxy; } catch { return null; } },
  getMounts: () => { try { return mounts; } catch { return null; } },
  getPortForwards: () => { try { return portForwards; } catch { return null; } },
  getTasks: () => tasks,
});
const { readLayouts, writeLayouts, flushLayouts } = persistenceRouter;
// ── Integrations & keys (src/server/integrations-wiring.js; design §14) — the ONE resolver of the cluster integration env ──
const integrationsWiring = require('./src/server/integrations-wiring.js').create({
  app, dataDir: path.join(__dirname, 'data'), bcastAll: (...a) => bcastAll(...a), drivePresets: () => require('./src/mounts').MountManager.drivePresets(),
}); // created BEFORE the mounts-plugins wiring: the agent browser's key consumer (P4 §7.5) registers its Test runners with this store and the keeper resolves through it
// ── Mounts + plugins + dial-session wiring (src/server/mounts-plugins-wiring.js, decomposition #12) ──
let autoCliLoop = null;   // B-574d (主开发 r5143): the auto-cli loop, made below — its held row reaches the family's one notice through the wiring (lazily)
const { resumeRoad, settingHolds, decisionEngine, mounts, plugins, dialBridge, graduateHostToDial, createSessionMessages, browserKeeper, bootBrowserKeeper, browserStream, browserHandback, browserTrace, browserKeys, browserDialogs, bootEngineDistribution, pluginLoader,
} = require('./src/server/mounts-plugins-wiring.js').create({
  app, server: hub, rootDir: __dirname, HOST, PORT, BUFFERS_DIR, PERMISSION_MODES, integrations: integrationsWiring.store, getJobs: () => jobsWiring.getJobs(), jobsWiring,
  listSources: () => ({ autoResume, stashView, sysinfo, stoppedSessions }), // lane conversation-facts: conversations.list's in-memory sources // + lane jobs-browser: a job browses as its owner conversation // + agent browser P4 second half (§7.5): the key consumer's store
  auth, wss, WS_OPEN, syncStores, agentdDialDevices, deliveryWakeDeps: () => ({ spendGuard, identityOf: fireIdentityFor, quotaVerdictFor, usageCacheKeyFor, getStashHandover: () => stashView, jobGrantOf: (id) => { try { return jobsWiring.jm.wakeGrantOf(id); } catch { return { granted: false }; } }, jobs: () => jobsWiring.jm }), getAccounts: () => accounts, getChannels: () => channelsWiring.channels, // + lane vault-contents-window: the Vault window lists these two stores
  bcastAll: (...a) => bcastAll(...a), serverNotice: (...a) => serverNotice(...a), // + agent browser P1: the keeper's runaway/ceiling notices
  serverSetting: (...a) => serverSetting(...a),
  otelTokenRow: otelIngest.tokenRow,   // B-f276 family unit 2: the OTel sign-in value's hold on the held list
  autoCliRow: () => (autoCliLoop ? autoCliLoop.heldRow : null),   // B-574d (主开发 r5143): the /usage pacing state's unknown wait on the held list (the loop is made below)
  mountTokens, persistenceRouter, hosts,
  agentdDials, agentdHostToken,
  agentdMintDialPair: (...a) => agentdMintDialPair(...a),
  deviceForDial: (...a) => deviceForDial(...a),
  lockOutDialHolder: (...a) => lockOutDialHolder(...a), // verify-r2 B8-r2: a rotation's in-place push that did not land ends the holder's link
  ensureAgentdOnHost: (...a) => ensureAgentdOnHost(...a),
  readSessionMetaOf: (session) => (session?.sockName ? readSessionMeta(session.sockName) : null), integrationEnabled: () => integrationEnabled(), // B-f7ab: the late browser key extends the session's own record, under THE integration switch
  // + agent browser P3 (§4.3.1): the handback announcer forwards to THE ladder under 'browser-handback'; an idle handback files one inbox item // + agent browser P2 (§3.8 ③): a stamped last-used profile re-publishes the live facts // + agent browser P1 second half: the Task-Group default rung, the zero-billed notice queue, the pin's meta persistence — the notes used to sit MID-LINE and swallowed the two keys appended after them (2.369.134: getTelemetry never reached the wiring; the r-fix moved activeSessions after them and every browser route answered "no such live session")
  // lane H (2026-09-25): rebindSessionMeta = the SAME meta record written back, so the meta choke point's browser-binding rule re-runs (a real record only, never a partial one) // lane J r2: adapterRegistry = the permission-answer path (src/server/permission-answer.js) for the stale-approval sweep
  mayUseDoors: () => ({ channels: channelsWiring.channels, exitProxy, windows: windowEngine }), /* unit what-it-may-use: built below, asked at each read */ getPortForwards: () => { try { return portForwards; } catch { return null; } }, instanceUrl, onMountsUpdated: () => tasks.syncAllContextMd(), getTasks: () => tasks, sessionStatusKey, getSessionStatus: () => sessionStatus, persistSessionMeta: (session, patch) => { if (session?.sockName) writeSessionMeta(session.sockName, { ...(readSessionMeta(session.sockName) || {}), ...patch }); }, rebindSessionMeta: (session) => { const m = session?.sockName ? readSessionMeta(session.sockName) : null; if (m && m.browserKey && m.webuiSessionId) writeSessionMeta(session.sockName, { ...m }); }, broadcastActiveSessions: () => broadcastActiveSessions(), deliver, userTodos, getTelemetry: () => { try { return telemetry; } catch { return null; } }, activeSessions, adapterRegistry,
});
// ── Session API (extracted to src/routes/sessions.js) ──
const { router: sessionsRouter, setup: setupSessions } = require('./src/routes/sessions');
setupSessions({ activeSessions, webuiPids, refreshWebuiPids, createSessionMessages, BUFFERS_DIR, PERMISSION_MODES, hosts, accounts, sessionAuth, serverSetting, cacheFactsOf, paused: (kind) => mountHealth.paused(kind), stoppedSessions, waitingAll: () => (stashView ? stashView.waitingAll() : {}) });
// ── Channels / communication panel (src/server/channels-wiring.js) ──
const channelsWiring = require('./src/server/channels-wiring.js').create({
  app, dataDir: path.join(__dirname, 'data'), bcastAll: (...a) => bcastAll(...a), integrations: integrationsWiring.store, getMounts: () => mounts, decisionEngine, // lanes decision-attention + decision-rule: the judged rows and the decision rule's pre-judge ask THE decisions caller // 2.369.195: a storage mount's own OAuth client, borrowed by an account (server-side copy)
  userTodos, lineageOf: (ids) => tasks.grantGroupsOf(ids).inherited, readUserState: () => persistenceRouter.readUserState(), convIndex: () => hosts && hosts.convIndex, // lane pair-group-fate: the archived list the groups' liveness reads (+ r2: which machine owns a conversation — another's is never gone) · P1: a failing adapter files ONE "For you" item after 3 consecutive failed passes and the same engine retracts it on recovery (fence 8)
  onGroupsPending: () => { try { stashView.changed(); } catch { } }, // lane group-report-card: a post / a marker / a membership change moves what waits for a member — the strip above its composer re-publishes (debounced)
  deliver, serverSetting, authEnabled: () => auth.enabled, publicUrl: () => instanceUrl.url(), sessions: () => activeSessions, sessionMeta: () => ({ readSessionMeta, writeSessionMeta }), // §26 (B-099e): the channel witness's ring lives on the live session + its meta · P2: THE delivery ladder (fence 2 — the one door to an unattended turn, spendReason 'channel-message', the authorizer inside it) + the coalescing window setting (fence 12) · r2: `authEnabled` — with auth OFF the owner's group routes are paced like an agent's (anyone local can reach them)
  ...(() => { const R = require('./src/server/roster-pass.js').sessionRoster({ sessions: () => activeSessions, tasks: () => tasks, addressableId, statusKey: sessionStatusKey }); return { liveSessions: R.build, rosterFingerprint: R.fingerprint, rosterRead: R.readUnread }; })(), /* lane roster-per-pass: the live roster (moved, unchanged) + the fingerprint of what it reads — channels-wiring builds it ONCE per pass (src/server/roster-pass.js) */ groupSetting: (gid) => { try { return grants.rowsFor('group-visibility', String(gid)); } catch { return []; } }, /* lane grants-unify: the group's visibility ROWS (msg-acl judges them — a member left out is not exposed) */ // P2: the agent sessions an assignment can address (group = task group, round-robin over its live members); §22 agent groups: + each session's msg-acl override and the Task Groups' externalVisibility = the reach msg-acl answers
});
// Backend readiness for onboarding (src/server/backend-status-route.js)
require('./src/server/backend-status-route.js').create({ app, machineProbes, accounts, claudeCmd: CLAUDE_CMD, codexCmd: CODEX_CMD, cliCmds }); const oatFileSync = require('./src/server/oat-file-sync.js').start({ accounts, machineProbes, claudeCmd: () => cliCmds.current('claude') || CLAUDE_CMD, onCliVersion: require('./src/server/cli-registration.js').mount(app, { dataDir: path.join(__dirname, 'data'), rootDir: __dirname, claudeCmd: () => cliCmds.current('claude') || CLAUDE_CMD }).noteHub }); cliCmds.onAdopt(() => oatFileSync.tick()); // lane pool-oat-materialize: the spawned claude's --version gates a member's long-lived token in its folder (cli-caps oatInFile) + the sweep for logins that die after a mint; the same tick tells src/server/cli-registration.js the build (lane cli-2-1-308-records: an unregistered one is said ONCE + its record draft)

app.use(sessionsRouter);

// ── Usage / Rate Limit ──
// Usage / rate limits read NON-INVASIVELY from the OAuth token store. Cached,
// refreshed every ~5 min. See _fetchOAuthUsage below for the why.
// ── Usage / Rate Limit ── (extracted to src/usage-routes.js in the 2.92.0 split)
const { setupUsage } = require('./src/usage-routes');
const usage = setupUsage({ app, accounts, hosts, spendGuard, usageHistory, activeSessions, serverSetting, ensureDir, USAGE_CACHE_FILE, USAGE_CACHE_DIR, CODEX_SESSIONS_DIR, META_DIR, AVAILABLE_MODELS, BUFFERS_DIR, apiDerivedWindow, establishedWindows, repairIdentityAnchors, probeUsageForAccountKey, onMemberReadingFresh, CLAUDE_CMD, cliCmds });

// ── auto-cli quota refresh loop (2.329.0; src/server/auto-cli-loop.js since
// quota r2 — its pacing state persists in data/auto-cli-state.json). One
// `claude -p /usage` spawn per 60 s tick at most, burn-aware, never a cadence.
autoCliLoop = require('./src/server/auto-cli-loop.js').createAutoCliLoop({ serverSetting, accounts, autoCliReady, memberServeLapsed, USAGE_CACHE_DIR, usageIdentityGroupsCached, usageEstimator, projectionRereadFor, projectionBillingIndex, lastMemberReadAt, usage, onMemberReadingFresh, dataDir: path.join(__dirname, 'data') }); autoCliLoop.start();
// Normalizer-level settings reads (chat.hideEmptyHooks) go through the REAL store
MessageManager.getSetting = (k) => { try { return serverSetting(k); } catch { return undefined; } };
const { getOAuthToken, usagePollingEnabled, summarizeCodexRateLimit, summarizeCodexRateLimits } = usage;
app.locals.harnessAvailability = harnessAvailability; app.get('/api/available-models', (req, res) => { // S8: /api/home reads harnessAvailability (installed ACP harnesses for the picker)
  refreshHarnessModels(); // mtime-guarded local reads — stay current despite old-CLI cache rewrites
  res.json(AVAILABLE_MODELS);
});
app.get('/api/session-options', (req, res) => { // ?backend=<id>[&model=]: each harness's OWN effort levels + extras (src/harness-efforts.js) — never claude's ultracode for another backend (lane effort-menu-per-harness)
  res.json(require('./src/harness-efforts.js').sessionOptionsAnswer(req.query, { harnessOf: (id) => require('./src/harnesses').get(id), cliLevels: EFFORT_LEVELS, permissionModes: PERMISSION_MODES, catalog: AVAILABLE_MODELS }));
});

// ── WebSocket Terminal Handler (extracted to src/ws-handler.js) ──
const sendUserInput = require('./src/server/user-input.js').createUserInputSender({ activeSessions, adapterRegistry, BUFFERS_DIR, broadcastToSession, feedLive, autoResume, reattachLocalPty, ptyQuietSince, writeSessionInput, log: (...a) => console.log(...a) }).send; require('./src/routes/user-todos-reply.js').registerUserTodoReplyRoutes(app, { userTodos, activeSessions, sendUserInput, sessionStatusKey, reopen: (item, o) => inboxReopen.reopen(item, o) }); // THE typing path, ONE implementation: the ws chat-input case AND the For-you reply route (POST /api/user-todos/:id/reply, owner-only — design-user-inbox-reply D1)
const designEngine = require('./src/server/design-engine.js').create({ dataDir: path.join(__dirname, 'data'), rootDir: __dirname, activeSessions, getRemoteFs: () => remoteFs, getPublishedPages: () => publishedPages, getDeliver: () => deliver, sendUserInput, broadcastAll: (m) => bcastAll(m), broadcastToSession, log: (...a) => console.log(...a), serverSetting, onDesign: (d, extra) => require('./src/server/artifact-registry.js').noteDesign(d, extra) }); require('./src/routes/design.js').registerDesignRoutes(app, { design: designEngine, activeSessions, getJobs: jobsWiring.getJobs }); // THE DESIGN WINDOW (lane design-core, docs/design-design-window.md §3.3): the registry, one-op reads, the 2 s watch while a window looks, a comment → THE typing sender (else the stash), publish → published pages
const docEngine = require('./src/server/doc-engine.js').create({ activeSessions, getDeliver: () => deliver, sendUserInput, artifacts: require('./src/server/artifact-registry.js'), dataDir: path.join(__dirname, 'data'), log: (...a) => console.log(...a) }); require('./src/routes/doc.js').registerDocRoutes(app, { doc: docEngine }); // THE DOC WINDOW (lane doc-window): comments → THE typing sender (else the stash), a save → the registry's row (by: user) + the owner's next-turn note (src/server/artifact-registry.js — configured below)
{ const { turnDigest } = require('./src/server/turn-facts.js'); let lastTurns = ''; setInterval(() => { const d = turnDigest(activeSessions); if (d !== lastTurns) { lastTurns = d; broadcastActiveSessions(); } }, 1000).unref(); } // the payload's `turn` column ('running'|'idle'|'waiting' — the inbox's running dot; carried, never gating) is DERIVED: one 1 s digest over _isStreaming/_turnState, a list broadcast only when it moved — never a hook at the nine flip sites (design-user-inbox-reply D1.7)
const { registerWsHandler, noConvoRef, pickCodexThreadCandidate } = require('./src/ws-handler');
const wsApi = registerWsHandler(wss, {
  getDeliver: () => { try { return deliver; } catch { return null; } },   // lane queued-is-not-woke round 3: a kill hands the ladder's held frames back at the act
  poolChooser: poolChooserForModel,
  otelEnv: otelIngest.envFor,
  agentdRemote: { ensureAgentdOnHost, agentdHostToken, lockedWhy: (id) => hostTokens.lockedWhy(id), agentdDir: AGENTD_DIR, attachBundle: path.join(__dirname, 'data', 'bin', 'vibespace-agentd-attach.js') },
  dialBridge,
  activeSessions, WS_OPEN, broadcastActiveSessions, broadcastToSession, resizeSessionToMin,
  setupSessionPty, reattachLocalPty, ptyQuietSince, refreshWebuiPids, deleteSessionMeta, writeSessionMeta, readSessionMeta, autoResume,
  readLayouts, writeLayouts, getSyncStore, serverSetting, integrationEnabled,
  harnessSetting, harnessDeclares, harnessSpawnSettings, cliConfigPlanB64, cliConfigGate: () => harnessConfig.startGate(), ownerWriteRefusal: refuseOwnerWrite, rootFactsNow, // (B-ddf3 u2 line 1: the spawn gate) harness settings (design-harness-settings §5/§6)
  sessionCounterRef, createSessionMessages,
  SOCKETS_DIR, BUFFERS_DIR, PTY_WRAPPER, CHAT_WRAPPER,
  NODE_CMD, DTACH_CMD, CLAUDE_CMD, EDITOR_CMD, AGENT_BIN_DIR, PORT, X_ENV, cliCmds,
  adapterRegistry, pty, path, fs, os, ensureDir, hosts,
  accounts, scheduleCtxSync, activeSessionsPayload, serverNotice,
  getExitProxy: () => { try { return exitProxy; } catch { return null; } }, // verify-r2 A3-r2 / ask-a: the kill path ends a dead conversation's pairs + asks
  USAGE_STATUSLINE_CMD, userStatuslineCmd, telemetry, sendUserInput, getDesign: () => designEngine, setCustomName: (k, n) => persistenceRouter.setCustomName(k, n), /* lane peer-card-sender: rename-session → customNames */ // getDesign = the Design window's watch (design-watch / design-unwatch); telemetry: the ws switch's `default:` counts unknown message types (Plugin Ph1); sendUserInput = THE typing path (src/server/user-input.js), shared with the For-you reply route
});
const inboxReopen = require('./src/server/inbox-reopen.js').create({ getOpenConversation: () => wsApi && wsApi.convOps && wsApi.convOps.openConversation, activeSessions, readUserState: () => persistenceRouter.readUserStatePending(), discover: async (key) => require('./src/routes/sessions').sessionRow(key) /* B-891e: one row, asked of the sweep's worker */, locate: async (b, id, cwd) => { const h = require('./src/harnesses').get(b); if (h && h.store && typeof h.store.locateAsync === 'function') return h.store.locateAsync(id, cwd); return h && h.store && typeof h.store.locate === 'function' ? h.store.locate(id, cwd) : null; }, defaultsFor: (b) => ({ permission: harnessDeclares(b, 'defaultPermissionMode') ? String(harnessSetting(b, 'defaultPermissionMode') ?? '') : '', extraArgs: harnessDeclares(b, 'defaultExtraArgs') ? String(harnessSetting(b, 'defaultExtraArgs') ?? '') : '' }), taskFor: (key) => (tasks.list().find((g) => (g.sessions || []).includes(key)) || {}).id || null }); if (resumeRoad) Object.assign(resumeRoad, { reopen: (item, o) => inboxReopen.reopen(item, o), kept: keptRecordOf }); // a For-you reply to an ENDED conversation reopens it by the resume road (the ws create case, a headless creator) — lane inbox-reply-dead-session; the manager design's piece 4: the resume verb's road (conversations.resume, through the one line) is the same create, and keptRecordOf the record it judges an ended conversation by

// Billing identity for the card badge. Precedence: env-key spawn (definite) →
// the CLI's OWN init statement (apiKeySource: 'none'=subscription OAuth,
// '/login managed key'=console login=API billing, 'ANTHROPIC_API_KEY'=env) →
// spawn-time global-login guess (marked guessed) → unknown. This is what tells
// the user WHICH sessions still burn API money after they re-login to the
// subscription: env-key/console sessions keep their auth for their lifetime.
function sessionAuth(s) {
  const be = s.backend || 'claude';
  // A remote session's billing identity lives ON ITS MACHINE — qualify every
  // auth object with the host name so a "CLI login" badge names WHICH
  // machine's login it is (2.188.0: a remote host-login session rendered
  // byte-identical to a local one, and the tooltip pointed at the wrong box).
  const hostName = s.host ? (() => { try { return hosts.get(s.host)?.name || s.host; } catch { return s.host; } })() : null;
  const withHost = (o) => (o && hostName ? { ...o, hostName } : o);
  // POOLED pseudo-account (B-6217; codex pools 2.368.20): ONE shape for both backends — the pool + the real account it currently
  // bills, so no chip mislabels it (real reports: claude pools rendered as 'API key', codex pools as a plain 'ChatGPT account', no target).
  const poolAuth = (a) => { let cur = null, curId = null; try { curId = accounts.poolMemberOfSession(a.id, s, s._webuiId || null).id || null; cur = curId ? (accounts.get(curId)?.name || null) : null; } catch {} const prio = Array.isArray(a.priority) ? a.priority : []; const rank = curId ? prio.indexOf(curId) : -1; const pinId = s._poolPin && s._poolPin.memberId && s._accountId === a.id ? s._poolPin.memberId : null; return withHost({ source: 'pooled', name: a.name, poolTarget: cur, poolTargetId: curId, placement: pinId ? 'pinned' : prio.length ? 'priority' : 'automatic', priorityRank: rank >= 0 ? rank + 1 : null, pinned: pinId ? (accounts.get(pinId)?.name || pinId) : null, pinnedId: pinId, poolDefault: (() => { try { const d = accounts.poolCurrent(a.id); return d ? (accounts.get(d)?.name || d) : null; } catch { return null; } })() }); }; // 2026-09-28: WHICH rule placed it (the chip's tooltip — "(priority #1)" / "(automatic)") // plan C: THIS session's link target (claude), else the pool default — a non-hot pool process: the member it HOLDS (reset credits r3)
  // THE HARNESS answers (descriptor billingIdentity — claude.js / codex.js own their
  // rungs); a harness that declares none bills nothing (shell terminals, ACP agents).
  let h = null; try { h = require('./src/harnesses').get(be); } catch { }
  return h && typeof h.billingIdentity === 'function' ? h.billingIdentity(s, { accounts, withHost, poolAuth }) : null;
}

// THE single active-sessions payload builder — used by every broadcast AND the
// per-connection initial snapshot (ws-handler). A second hardcoded field list
// anywhere means new fields silently vanish for freshly-(re)connected clients
// until the next organic broadcast (bit us twice: host badges, then auth/todo).
function activeSessionsPayload() {
  try { require('./src/server/unexpected-exit').healResumed(); } catch (e) { console.warn('[unexpected-exit] heal pass failed:', e.message); } // lane exit-item-heal: a live session new to the list answers its conversation's "resume it" items (one pass per session; every create / resume / restore and a fresh client's first list pass through here)
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
      name: s.name, nameExplicit: !!s._nameExplicit, purpose: s._purpose || undefined, // nameExplicit (lane peer-card-sender): a name given at creation / by a rename — it outranks the first message on the card; purpose (lane door-day-one-landing): 'sign-in' — a sign-in terminal, no sidebar row
      cwd: s.cwd,
      host: s.host || null, hostRealCwd: hosts.hostRealFieldsOf(s).hostRealCwd,   // B-16d7: another machine's conversation carries its machine's real folder
      hostName: s.hostName || null,
      // transport truth for the card (2.219.1): a remote session whose local
      // wrapper is alive but whose HOST is unreachable used to show a plain
      // LIVE card — user read it as "conversable" while every input queued
      remoteState: s._vaultWait ? 'vault-locked' : (s._remoteState && s._remoteState.state !== 'connected') ? s._remoteState.state : null,   // r2: waiting for the vault (a state)
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
      accountName: s._accountId ? (accounts.nameShownOf(s._accountId) || accounts.providerRecordOf?.(s._accountId)?.label || 'API key') : null,   // a provider conversation: its record's name (lane lg-providers U2 cure — as its badge and the REST list)
      accountTail: null,   // B-ba7d: NO key tail in the live payload (it reaches every client) — the page lays the person's read on by accountId
      todo: s._todos || null, autoAllowed: s._autoAllowed || 0, cpuNice: s._cpuNice || null, stoppedBy: s._stoppedBy ? (() => { try { return require('./src/stopped-by.js').liveFactOf(s._stoppedBy, autoResume.statusFor(id)); } catch { return require('./src/stopped-by.js').liveFactOf(s._stoppedBy, null); } })() : null, // (a list built before the routes exist in boot order says nothing — TDZ) · {done, total, current} — the agent's own TodoWrite/plan · lane auto-resume-bulk: WHY it stopped (a usage wall / an overloaded model) + its auto-resume state — the card's chip and the filter's count
      poolPin: poolPinFactOf(s), poolFallback: (() => { try { return fallbackFactOf(id); } catch { return null; } })(), // THE CONVERSATION'S PIN (2026-09-28): the billing submenu's ✓ "pinned" row + Session Properties · (B-d578 r3918) its fallback fact for its OWN strip's one press — this payload rides the page's /ws only
      stash: stashFactOf(s), resumedBy: s._resumedBy || null, // piece 7 rule 3: {key, params, at} — a DELIVERY resumed it (the window's line, the System row); 2026-09-27: what waits for this agent's next turn (both stashes, src/stash-summary.js) — the strip above its composer + the card's hint
      auth: sessionAuth(s), // billing identity (subscription / api-console / api-key / unknown)
      // outputStyle = the EFFECTIVE style (2.369.58; null = the agent's own config decides); worktree/worktreePath = the per-session git worktree (owner ruling 9) — the card badge + the path the CLI ITSELF announced in its init frame
      cliTitle: s._cliTitle || null, vcs: s._vcs || null, prLinks: Array.isArray(s._prLinks) && s._prLinks.length ? s._prLinks : null, // lane session-title-record: cliTitle = the CLI's own title (the name ladder's middle rung) · design-unknown-records: the last VCS fact (git chip) + the published changes (PR chips)
      turn: require('./src/server/turn-facts.js').turnOf(s), mode: s.mode || 'terminal', outputStyle: s._outputStyle || null, worktree: !!s._worktree, worktreePath: s._worktreePath || null, spawnModel: s._spawnModel || null, effort: s._effort || null, modelOrigin: s._modelOrigin || null, effortOrigin: s._effortOrigin || null, browserKey: s._browserKey || null, browserVariant: s._browserVariant || null, browserProfileId: s._browserProfileId || null, browserPinOrigin: s._browserPinOrigin || null, browserProfileActive: s._browserProfileActive === undefined ? null : s._browserProfileActive, browserCap: Number.isInteger(s._browserCap) ? s._browserCap : null /* MULTIVIEW D4: the conversation's EXPLICIT browser cap (null = the default) — Session Properties' row; the comment sits BEFORE the comma so the next key follows a `,` (test-worktree-userchan-ui's payload census) */, browserInput: (() => { try { const v = browserKeeper?.inputSummaryFor?.(s._browserKey); return v ? v.input : null; } catch { return null; } })(), browserLive: (() => { try { return browserKeeper?.liveHoldingFor?.(s._browserKey, s._browserProfileActive === undefined ? null : s._browserProfileActive) || ''; } catch { return ''; } })(), browserFact: (() => { try { return s._browserKey && browserKeeper?.factFor ? browserKeeper.factFor(require('./src/browser-fact.js').sessionFactsOf(s)) : (browserKeys?.keylessFactOf?.(s) || null); } catch { return null; } })(), /* B-f7ab: no key yet ⇒ "no browser yet" where its first browser command gets one */ /* lane S2: THE browser fact — which browser this conversation uses NOW, its pin and why they differ (src/browser-fact.js); every surface prints its words */ // lane H: the LIVE browser the agent holds ('' / 'ephemeral' / a profile id) — the card + status chip // + agent browser P3 (§4.3): 'user' while somebody drives one of this conversation's browsers, 'agent' when it has one, null when none — the card badge / status-bar chip // + agent browser P2 (§3.8 ③): the profile the agent LAST USED (null = never, '' = the ephemeral one) beside the PINNED one — the status-bar Browser chip's pair, each with its own LIVE_SESSION_FACTS digest // + agent browser P1 (§3.2.5): the conversation's browser key/rung, the PINNED profile and which rung chose it (Session Properties' Browser section, the card picker) // EFFECTIVE response style (2.369.58) + the model/effort this session was SPAWNED with and WHICH FACT each came from (B-6b6d: 'chosen'|'conversation'|'instance'|'harness'). null = the agent's own config decides / a session that predates the field. Session Properties names value AND origin, which neither the saved PICK nor the value itself can give it — a conversation's own value and the instance default are frequently the same string, and only the server ever read the conversation's records
    });
  }
  return activeList;
}

function broadcastActiveSessions() { try { channelsWiring.rosterChanged(); } catch {} try { channelsWiring.groups.noteRoster(); } catch {} try { convOps.settleBirthGroups(); } catch { } // r3: the session list's ONE notify point — a renamed/ended member re-announces its groups (their views' names are live-roster derived; nothing moved ⇒ nothing sent); lane open-task-binds: a conversation opened INTO a Task Group joins its sessions[] once its own id is adopted (every adoption broadcasts; before convOps exists a caught TDZ)
  try { exitProxy.rejudgeAll('sessions'); } catch { } try { require('./src/server/local-index.js').note('sessions'); } catch { } // lane human-cli: the person's session index (src/server/local-index.js, the ONE writer) rides this ONE notify point · verify-r3 census: a session's own reach facts moved (a fork adopting its id, a codex / ACP thread change, its cwd under the folder rule) — every such writer broadcasts, so the exit re-judge rides this ONE notify point (a boot-time call before exitProxy exists is a caught TDZ)
  const msg = JSON.stringify({ type: 'active-sessions', sessions: activeSessionsPayload() });
  wss.clients.forEach(client => {
    if (client.readyState === WS_OPEN) {
      try { client.send(msg); } catch {}
    }
  });
}

// ── Desktop apps + the in-container desktop: ONE keeper, ONE ws bridge, one route family
// (docs/design-desktop-apps.zh.md §2 — src/server/desktop-app-keeper.js · desktop-stream.js ·
// src/routes/desktop-apps.js; the singleton desktop src/vnc.js is stream id DESKTOP_SINGLETON_ID
// on the same bridge, so /api/vnc and /api/desktop/<id>/stream are one relay, not twins) ──
const { VncManager } = require('./src/vnc');
const { DESKTOP_SINGLETON_ID } = require('./src/desktop-apps');
const vnc = new VncManager({ dataDir: path.join(__dirname, 'data'), stopOnShutdown: throwawayRoot }); // a throwaway server stops the Xvnc IT started at shutdown; an installed one's desktop outlives a restart (src/vnc.js)
const desktopKeeper = require('./src/server/desktop-app-keeper.js').create({
  dataDir: path.join(__dirname, 'data'), env: () => require('./src/ws-handler').agentEnv(), broadcast: (m) => bcastAll(m),
  serverSetting: (k) => serverSetting(k), getTelemetry: () => { try { return telemetry; } catch { return null; } }, singleton: () => vnc.singletonFacts(),
  serverNotice: (...a) => serverNotice(...a), getUserTodos: () => { try { return userTodos; } catch { return null; } }, // 2026-09-25: the ONE report per resource crossing (the keeper never stops an app for a resource)
  access: () => desktopAccess, hostLabel: (h) => { try { return hosts.get(h).name || h; } catch { return h; } }, // lane C2: a paired machine's apps (late-bound — the access layer needs this keeper's machine half)
  remoteHosts: () => { try { return hosts.list().filter((h) => (h.transport === 'dial' ? h.online : h.dialLive)).map((h) => h.id); } catch { return []; } }, // boot: every dialed-in machine is asked what it runs
});
const desktopAccess = require('./src/server/desktop-access.js').create({ hosts, local: () => desktopKeeper.machine, env: () => require('./src/ws-handler').agentEnv(), log: console, audit: (line) => { try { return exitProxy.audit(line); } catch { return null; } }, installedStore: () => desktopKeeper, integrations: integrationsWiring.store, dataDir: path.join(__dirname, 'data'), broadcast: (m) => bcastAll(m) }); // lane remoteapp-r1b: a RemoteApp's sealed sign-in; lane desktop-picker-instant: the machine rows' last known state + its broadcast row // lane C1 (design-desktop-apps-seamless §3.5): the ONE transport to an app's machine — device #0 in-process against the keeper's OWN machine half, a paired device / an ssh host (its daemon installed over ssh) through the `desktop-serve` agentd op, a handle that cannot run the op refused host_needs_daemon
const appsWiring = require('./src/server/apps-wiring.js').install({ app, access: desktopAccess, userTodos, deliver, activeSessions: () => activeSessions, sessionStatusKey, broadcast: (m) => bcastAll(m), dataDir: path.join(__dirname, 'data'), log: console, throwawayRoot }); // Layer 0 apps (docs/design-app-persistence.zh.md §3.1): the user's door + an agent's proposals over the machine's ONE package slot; the rebuilt machine's replay runs after listen
require('./src/server/artifact-registry.js').configure({ activeSessions: () => activeSessions, deliver, sessionMeta: () => ({ readSessionMeta, writeSessionMeta }), pages: () => publishedPages, designs: () => designEngine, jobs: jobsWiring.getJobs, ports: () => portForwards, instanceUrl, toSession: (s, sid, m) => broadcastToSession(s, sid, m), hosts: () => hosts, asks: (s, id) => require('./src/agent-routes/status.js').asksOf(userTodos, s, id, sessionStatusKey), log: console }).mount(app); require('./src/server/search-index.js').wire({ app, rootDir: __dirname, activeSessions, buffersDir: BUFFERS_DIR }); // lane global-search: the search index (its routes + the backfill, 60 s after boot); lane artifacts-model: the deliverable rows' registry (ownerOf / noteEdit — the doc-window contract)
// P9 window targets (design-agent-browser-v2 §4.9 / §6.6): ONE wiring — the RFB bridge's input policy IS the engine's lease verdict, the routes (user + agent) and the shared handback announcer ride the same engine (src/server/window-live-wiring.js)
const { desktopStream, windowEngine, boot: bootWindowLeases, shutdown: shutdownWindowLeases } = require('./src/server/window-live-wiring.js').install({
  app, auth, vnc, keeper: desktopKeeper, DESKTOP_SINGLETON_ID, dataDir: path.join(__dirname, 'data'), env: () => require('./src/ws-handler').agentEnv(), activeSessions: () => activeSessions, serverSetting: (k) => serverSetting(k), broadcast: (m) => bcastAll(m), browserHandback,
  netemEnabled: process.env.VIBESPACE_DESKTOP_NETEM === '1', access: desktopAccess, deliver, browserStream, groupsOf: (s, id) => { const a = { sessionKey: sessionStatusKey(s, id), cwd: s.cwd, hostId: s.host || null, initialGroupId: s._initialGroupId, initialGroupIds: s._initialGroupIds }; return tasks.isHeldUnread() ? tasks.groupIdsForGrant(a, 'window') : tasks.memberIds(a); }, lineageOf: (ids) => tasks.grantGroupsOf(ids).inherited, groupNameOf: (id) => tasks.lineageNameOf(id) }); // P8-2 D21 (c) validation slice: a dev-only latency/bit-rate injector on the xpra relay, never on by default; lane E: the gated ladder (the window request's wake) + Task Group membership asked at verb time (reach)
desktopKeeper.adoptAll().then(() => desktopKeeper.start()).catch((e) => console.warn('[desktop] boot adoption failed:', e.message)); browserKeeper?.setOtherHolders?.(() => desktopKeeper.liveRecords().filter((r) => !require('./src/desktop-apps').isDisplayForBrowser(r)).map((r) => ({ id: r.id, label: r.label || r.appId || r.id, kind: 'desktop-app' }))); browserKeeper?.setDisplaySessions?.(desktopKeeper); // takeover C3 (D2): the ONE ceiling (CONCURRENT_CAP) counts the live desktop apps beside every browser (lane one-browser-b1: never a browser's own display session — that browser is counted); the attach road's display sessions are the desktop keeper's
const agentdDialWss = new WebSocketServer({ noServer: true }); // Transport B dial-in (2.144.0)

// ── Start Server ──
// THE single WebSocket upgrade dispatcher: /ws (main app), /proxy/ (unblocker
// site WebSockets), /api/vnc + /api/desktop/<id>/stream (the desktop bridge). Everything else is destroyed.
hub.attachToServers('upgrade', (req, socket, head) => { // BOTH servers (http + the https one, src/server/tls.js) — never server.on (§89)
  const pathname = (req.url || '').split('?')[0];
  const deny = () => { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); };
  if (auth.upgradeHeld(pathname)) return auth.refuseHeldUpgrade(socket);   // B-dc3f: a HELD sign-in file shuts every upgrade, a public /svc socket too — but a paired machine's dial-in (its own dial token)
  if (pathname === '/ws') {
    if (!auth.requestAuthed(req)) return deny();
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  } else if (pathname.startsWith('/proxy/')) {
    if (!auth.requestAuthed(req)) return deny();
    unblocker.onUpgrade(req, socket, head);
  } else if (desktopStream.upgradeId(pathname)) {
    // /api/vnc (the singleton desktop) + /api/desktop/<id>/stream: ONE bridge, cookie auth checked inside
    desktopStream.handleUpgrade(req, socket, head, desktopStream.upgradeId(pathname));
  } else if (pathname === '/api/browser/stream' && browserStream) { browserStream.handleUpgrade(req, socket, head); // agent browser P2 (§4.2): cookie auth INSIDE (401) — the live view's bridge to a session's loopback stream server
  } else if (pathname.startsWith('/svc/')) {
    // path-mounted service WebSockets — auth is PER MOUNT inside path-mounts
    // (2.359.0 public mounts; private ones 401 there)
    pathMounts.handleUpgrade(req, socket, head);
  } else if (pathname === '/api/device-dial' || pathname === '/api/agentd-dial') {
    // /api/device-dial is the name new pairing commands render;
    // /api/agentd-dial stays FOREVER — in-field daemons hold it in dial.json
    // Transport B: a remote device's daemon dialing IN. Gated by the per-device
    // dial token (never cookie auth — daemons have no cookies); real protocol
    // auth (vsht_ hello) happens inside the mux on this stream.
    // lane-pairing ③⑤ (src/server/dial-pairing.js gateDialUpgrade): a refusal is a NAMED frame (401 + the code +
    // its sentence), a --dial-check probe gets its 200 and registers nothing, every attempt's facts are recorded
    const gate = gateDialUpgrade(req, socket);
    if (!gate) return;
    const { deviceId } = gate;
    // verify-r1 B9: a SECOND daemon holding a copy of this pairing is refused by name while the first answers
    // (two daemons replaced each other once a second forever); the socket waits ≤ DUP_PROBE_MS for that verdict
    admitDial(deviceId, gate.facts, socket).then((admit) => { if (!admit) return;
    agentdDialWss.handleUpgrade(req, socket, head, (ws) => {
      const stream = wsStream(ws); // the ws as the duplex shape a Mux consumes (src/server/dial-pairing.js: a kept Mux can leave it)
      adoptDialStream(deviceId, stream); // the stream it replaces is closed only now, once this one is up (src/server/dial-pairing.js)
      noteDialEvent(deviceId, 'accepted', gate.facts); // the streak + previous failure the daemon reported, kept on the record
      deviceForDial(deviceId).catch(() => { }); // the mux hello NOW: a device holding another command's host key shows `auth-fail` at once, not at the first op
      // the device re-dialed with a FRESH stream — drop any cached
      // DeviceManager bound to the previous (dead) stream so the next op
      // rebuilds over this one (stale-stream blank-session fix)
      try { const old = agentdDialDevices.get(deviceId); if (old && old._dialStream !== stream) { old.stop?.(); agentdDialDevices.delete(deviceId); } } catch { }
      try { hosts.invalidateDevice?.('host-dial-' + String(deviceId).replace(/[^\w-]/g, '')); } catch { }
      try { hosts.onDialIn?.(deviceId); } catch { } // graduated ssh host: prefer this fresh dial link (B-6640)
      console.log(`[device] device '${deviceId}' dialed in`);
      // heal recorded pull mounts + re-own push tunnel ports + flip the UI dot
      try { machineMounts.onMachineLinked(hosts.findByDeviceId(deviceId)?.id); } catch { }
      try { portForwards.onMachineLinked(hosts.findByDeviceId(deviceId)?.id); } catch { }
      // Re-own each live dial session's VIBESPACE_API back-tunnel (audit #49):
      // the per-session reverse listener existed only in the DEAD link's
      // DeviceManager — mounts/port-forwards heal from persisted records on
      // dial-in, sessions had none, so vibespace-status/task/ask + remote
      // Ctrl+G went connection-refused forever after any re-dial or server
      // restart while the session kept chatting fine (nothing surfaced it).
      // The daemon's reverseListen `existing` branch re-owns a still-bound
      // port; a reaped one (>10min offline) rebinds at the same number.
      (async () => {
        const netR = require('net');
        for (const [, s] of activeSessions) {
          if (s._dialDeviceId !== deviceId || !s._dialReversePort) continue;
          try {
            const dm = await deviceForDial(deviceId);
            await dm.reverseForward({ port: s._dialReversePort, connectLocal: () => netR.connect(require('./src/server/agent-listener.js').tunnelPort(PORT), '127.0.0.1') }); // lane lg-remote-hardening (D8b): the re-owned back-tunnel ends at the agent door too
          } catch (e) { console.warn(`[device] session back-tunnel re-own failed (${s._dialReversePort}):`, e.message); }
        }
      })().catch(() => { });
      try { bcastAll({ type: 'hosts-updated' }); } catch { }
      ws.on('close', () => {
        if (agentdDials.get(deviceId) === stream) { agentdDials.delete(deviceId); noteDialEvent(deviceId, 'disconnected', {}); }
        try { bcastAll({ type: 'hosts-updated' }); } catch { }
      });
    });
    }).catch((e) => { console.warn('[device] dial admission failed:', e && e.message); try { socket.destroy(); } catch { } });
  } else {
    socket.destroy();
  }
});

// ── Ops routes (src/server/ops-routes.js, decomposition #11): version/update/maintenance ──
const bootPhase = require('./src/server/boot-phase.js').create({ sessionsCount: () => activeSessions.size, record: (ev) => telemetry.record(ev), testHoldMs: Number(process.env.VIBESPACE_TEST_BOOT_HOLD_MS) || 0 }), bootRestored = bootPhase.step('restore'), bootSessionsIndexed = bootPhase.step('sessions-index'); // B-0ece (src/server/boot-phase.js): `booting` → `ready` once the steps the first page needs are done
const { versionInfo, maintState,
} = require('./src/server/ops-routes.js').create({ app, rootDir: __dirname, wss, WS_OPEN, bootPhase });
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

require('./src/adapters/codex.js').warmCodexRolloutIndex();   // B-a60e remainder: the rollout index's one walk starts NOW (off the loop), ready before the restore's first codex read
probeSockets().finally(() => hubForm.then((d) => { hubPort = require('./src/server/hub-port.js').wire(d, { hub, server }); }).then(() => hub.listen(PORT, HOST, () => { bootTrace.listening(); // B2b (the separation, M1 lane B): THE START DECIDES — piped (a start pipe named by VIBESPACE_START_FD) joins the interface's link and never listens; plain listens as before (src/server/hub-port.js). The same boot callback in both · B-1319: after the restore's probes (boot-restore probeSockets) — the one-port demux (src/server/tls.js) — listen errors / EADDRINUSE as before
  const ver = require('./package.json').version;
  console.log(`\n  VibeSpace v${ver} running at http://localhost:${PORT}${hub.bootSuffix()}`); hub.start(); // lane human-cli: the person's CLI index on the machine's own disk is configured in the listen step's LAST turn (below, B-cd4b: its boot write lists the restored survivors, as when the step was one turn) · + " and https://<domain>:PORT" while a certificate is live; start = the boot pass + hourly
  // PID file for the supervised-restart path (scripts/update.sh in a container:
  // no systemd — the entrypoint respawn loop restarts us when update.sh kills
  // this pid; dtach sessions live in the same PID namespace and survive).
  try { fs.writeFileSync(path.join(__dirname, 'data', 'server.pid'), String(process.pid)); } catch {}
  dataFolder.arm(); // B-8797: the data folder's look, 30 s on (an unref'd timer: the mount table only — never the start's path)
  memSampler.start(); // the jobs (1.5 s), the apps (2.5 s) and the engine distribution (4 s) are armed in the listen step's LAST turn (below, B-cd4b: they never run before the step has ended, however many conversations) · lane engine-distribution: the fleet's engine plugin (fleet.json browserEngine) — ONE async job, never on the boot path // Background Work engine: adopt-first, never blocks boot; Layer 0 apps: a rebuilt machine's apps put back (the replay marker hit = nothing)
  console.log(`  dtach: ${DTACH_CMD}, node: ${NODE_CMD}, claude: ${CLAUDE_CMD}, codex: ${CODEX_CMD}`);
  if (process.platform === 'linux') console.log(`  X display: ${X_ENV.DISPLAY || '(none)'}${X_ENV.XAUTHORITY ? ' (xauth: ' + X_ENV.XAUTHORITY + ')' : ''} — clipboard image paste ${X_ENV.probed ? 'ready' : 'UNAVAILABLE (no working X display found)'}`);

  // Local sessions run through the device daemon (machine #0) — GRADUATED,
  // no flag. Started here, but the boot restore below does NOT wait for it:
  // attachToDtach takes the daemon only on an ALREADY-live link (2.369.82), so
  // restored sessions attach LOCALLY while connect() is in flight; the onExit
  // re-attach ladder takes the daemon later. Any daemon failure = local pty.
  {
    try {
      const { DeviceManager } = require('./src/agentd/client.js');
      deviceMgr = new DeviceManager({
        dataDir: path.join(__dirname, 'data'),
        bundlePath: path.join(__dirname, 'data', 'bin', 'vibespace-agentd.js'),
        version: require('./package.json').version,
        nodeModules: path.join(__dirname, 'node_modules'),
        log: console.log, // lane lg-remote-hardening (主开发's verdict of 2026-11-18, must A): NO hub key on the LOCAL road — a same-user socket, where a pin proves nothing a reader of the same files could not forge; this box's agent never waits for the vault
        onUpgradeStuck: (from, to, info) => hosts.onAgentUpgrade?.('stuck', { ...(info || {}), hostKey: 'local', machine: os.hostname(), from, to }), onVersionMatch: (v) => hosts.onAgentUpgrade?.('matched', { hostKey: 'local', version: v }), onUpgradeRefused: (from, to, info) => hosts.onAgentUpgrade?.('refused', { ...(info || {}), hostKey: 'local', machine: os.hostname(), from, to }), onAct: (line) => hosts.noteAct('local', line), // lane device-upgrade-stuck (+ lane device-bundle-signing: `refused`): this machine's own daemon, the same door (no row); lane device-act-audit: its acts audited as `local`
      });
      // device #0 becomes reachable through hosts.device(null) — that is what
      // lets a consumer be written ONCE and run on ANY machine including this
      // one (CS separation, 2.276.0). Wired BEFORE connect so a consumer that
      // races startup gets the handle and awaits its connect like any other.
      try { hosts.setLocalDevice(deviceMgr); } catch { }
      deviceMgr.connect().then(() => console.log('  device-daemon: device session routing ENABLED')).catch((e) => {
        console.warn('  device-daemon: could not reach the daemon — local pty fallback:', e.message);
        deviceMgr = null; // fall back cleanly
        try { hosts.setLocalDevice(null); } catch { } // consumers fall back to their legacy local path
      });
    } catch (e) { console.warn('  device-daemon: init failed — local pty fallback:', e.message); deviceMgr = null; }
  }

  // Restore existing dtach sessions from before restart
  // One-shot data migrations (src/server/migrations.js, plan B step 1): the
  // ledger-driven registry runs BEFORE any session restore touches the data
  // it may reshape. Failures notice + retry next boot, never block startup.
  try { usageEstimator.settleRates?.(); bootTrace.step('migrations', () => require('./src/server/migrations.js').create({ rootDir: __dirname, serverNotice, hosts /* lane-pairing ⑥: exit-access-lists reshapes THROUGH the live HostManager (it holds hosts.json and saves it whole) */, desktopKeeper, browserKeeper: () => browserKeeper /* 2026-09-25: the runaway-parks-void reshape goes THROUGH the live keepers */, channels: channelsWiring.channels /* 2026-09-22: adapters.json's ONE writer stamps the legacy credential keys */, userTodos /* 2.369.152: the LIVE inbox store — the spend-notices migration reshapes through it, never beside it */, accounts: () => accounts /* 2026-09-28: the pool manual-priority reshape goes THROUGH the live account store */, plugins /* lane plugin-settings-p0: plugins.json config → settings.json goes THROUGH the live PluginManager */, integrations: integrationsWiring.store /* lane llm-plugin-rename: the decision-api → llm row move goes THROUGH the live integration store */, grants /* lane grants-unify: 2026-10-grants-unify seeds THE grants store */, note: (l) => bootTrace.note(l) /* verify F2: a deleted store re-armed / grants_store_missing — ⚙ Diagnostics */, tasks /* lane task-group-context: the Context-table rows go THROUGH the live TaskGroupManager */, usageHistory /* lane ledger-dedup-law: the ledger dedup goes THROUGH the live ledger (its dedupShard: one job per shard, the cache rebuilt after) */, settings: { read: () => persistenceRouter.readSettings(), patch: (p) => persistenceRouter.patchSettings(p) } /* lane usage-predict: 2026-11-agy-reads-follow-claude-off goes THROUGH the one settings writer */ }).runLocalMigrations()); persistenceRouter.reloadSettings?.() /* settings-prune verify r1: settings-rows-retired rewrote settings.json after boot cached it */; usage.reloadRateLimitCache?.(); usageHistory.reloadCursors?.(); usageEstimator.reloadRates?.() /* hub-loop-stalls r2: the rates copy read before a migration dropped rates.json never writes it back */; usageHistory.reloadEvents?.(); /* a repair may have unlinked data/usage-cache.json AFTER setupUsage loaded it (r6), or REWRITTEN the ledger shards in place (origin backfill) — the event cache reads only appended tails */ }
  catch (e) { console.warn('[migrate] local registry failed to run:', e.message); }
  // B-855a c2: the STANDING identity repair — every boot, AFTER the one-shot registry (it may have reshaped the stores this reads), idempotent; then the panel memory re-reads the repaired disk
  bootTrace.span('identity-repair', require('./src/reading-repair.js').prefetchAnchorRows(path.join(__dirname, 'data', 'usage-anchors')).then(() => accounts.signinFactsSettled().catch(() => ({}))).then((settled) => { try { const rep = repairIdentityAnchors('boot', { since: settled && settled.since }); usage.reloadRateLimitCache?.(rep); } catch (e) { console.warn('[usage] boot identity repair failed:', e.message); } })); // B-1319: its anchors read off the loop first
  // …and STANDING (final verifier): a weekly window that moved between boots must not wait for the next boot — hourly, idempotent, quiet unless it changed something, the panel memory re-read only then
  setInterval(() => { require('./src/reading-repair.js').prefetchAnchorRows(path.join(__dirname, 'data', 'usage-anchors')).then(() => accounts.signinFactsSettled().catch(() => ({}))).then((settled) => { try { const rep = repairIdentityAnchors('hourly', { since: settled && settled.since }); if (rep && rep.changed) usage.reloadRateLimitCache?.(rep); } catch (e) { console.warn('[usage] hourly identity repair failed:', e.message); } }); }, 3600e3).unref(); // …the hourly run too
  migrateLegacyHomeProjects(); hub.turn(() => { // B-cd4b (the round's follow): THE LISTEN STEP IN TURNS — the restore's registration (the next line) runs in a loop turn of its own ('restore'), the rest of the step in the turn after it ('listen-rest'), each after a timers phase; the front hands no new connection to the servers before the step's last turn has run, so nothing on the hub's port asks for a survivor before it is in the live set (src/server/tls.js turn · src/server/loop-turns.js)
  restoreSessions(); hub.turn(() => { bootBrowserKeeper(); bootWindowLeases(); try { channelsWiring.groups.noteUserState(); } catch {} hooksLate.ready(); // hooksLate.ready() (lane hooks-create): the live-session set is final — a hook file the boot registration created is told to the sessions just restored. agent browser P1 (§3.5) + P9b window leases (the same rule: after the live-session set is final): leases reconciled + browsers adopted only AFTER the live-key set is final (async, logged, never blocks the boot — mounts-plugins-wiring)
  rootFactsNow().then(() => { try { require('./src/server/local-index.js').configure({ rootDir: __dirname, port: PORT, host: HOST, version: ver, owner: (() => { try { return ownerWriteRefusal(); } catch { return { kind: 'unknown' }; } })(), ownerNow: ownerWriteRefusal, onOwnerChange: onRootLanded, adapters: adapterRegistry, sessions: () => activeSessions, buffersDir: BUFFERS_DIR, dataDir: path.join(__dirname, 'data'), turnOf: (s) => require('./src/server/turn-facts.js').turnOf(s), log: console }); } catch (e) { console.warn('[local-index] not started: ' + e.message); } }).catch((e) => console.warn('[local-index] not started: ' + (e && e.message))); setTimeout(() => jobsWiring.initAfterListen(), 1500); setTimeout(() => appsWiring.afterListen(), 2500); setTimeout(() => bootEngineDistribution(), 4000); bootRestored(); require('./src/routes/sessions').warmSessions().catch((e) => console.warn('[boot] first sessions sweep failed:', e.message)).finally(bootSessionsIndexed); bootPhase.arm(); // B-0ece: pages reload onto `ready`, not onto `listening` · B-1425 (r827): the index's configure WAITS for the root's facts (off the loop, ≤ 2 s; landed already ⇒ this very turn) — «not judged yet» is never its role for the run, a real unknown (a read error, the named late fact) is
  try { fdGauge.bootLine({ sessions: [...activeSessions.values()].filter((x) => x.socketPath).length }); fdGauge.start(); } catch (e) { console.warn('[fd] gauge failed to start:', e.message); } // lane-dead-bridge: the limit node REALLY runs at + the estimate; refuses nothing
  setTimeout(() => { try { bridgeWatch.bootSweep(); bridgeWatch.start(); } catch (e) { console.warn('[bridge] boot sweep failed:', e.message); } }, 1500); // AFTER the restore's attaches connected: end a dead server's orphaned attach clients, then watch (lane-dead-bridge)
  // Plan C boot reconciliation: a per-session pool link whose session did not
  // survive the restart is a billing pointer nobody can see or move — unlink.
  try { const n = accounts.sweepSessionPoolLinks(new Set(activeSessions.keys())); if (n) console.log(`[pool] swept ${n} orphaned per-session link(s)`); } catch { }
  // B-1525 second half: consume the .orphan metas the dead-socket cleanup
  // preserved — remote keeper sessions whose claude is STILL ALIVE on its
  // host come back LIVE by themselves (no manual surgery). Runs even on a
  // zero-socket boot (the pod-recreation case restoreSessions early-returns
  // on); delayed off the boot critical path; probes are read-only ssh.
  setTimeout(() => { const go = () => Promise.resolve().then(() => readoptOrphanKeeperSessions()).catch((e) => console.warn('[readopt] failed:', e.message)).finally(() => { _arRestoreSettled = true; if (resumeRoad) resumeRoad.adoptedRemote(); }); const keep = () => hosts.whenRead(go, 'the re-adoption of remote sessions left running', 'boot:readopt', { onLetGo: () => { console.warn('[readopt] the re-adoption keeps its place in the waits for hosts.json (it runs at the read; remote resumes are refused until it settles)'); keep(); } }); const held = !!(hosts.held && hosts.held() && hosts.whenRead); (held ? (keep(), Promise.resolve()) : go()).finally(() => { if (resumeRoad) resumeRoad.adopted(); }); }, 8000); // the manager design's piece 4 (R3, its cure round's must 5): the one resume line opens once the keepers' sessions too are ADOPTED — resolved or thrown alike — the stores chain × piece 4 (主开发 02:31Z): TWO roads, each opened once — the LOCAL line opens at once while hosts.json is held, the REMOTE road only when the re-adoption has SETTLED (never held, or held then read); the re-adoption's wait keeps its place (keyed; let go past the store's bound it queues itself again, said — never dropped in silence)

  // Orphan sweep — AGE-BASED (2.89.1). The activeSessions-keyed sweep was a
  // real data-loss race: a live dtach session the restore didn't re-adopt
  // within 30s (or re-adopted under a different id after meta corruption) had
  // its buffer UNLINKED while the wrapper kept writing the deleted inode —
  // live streaming looked fine, but every restart rebuilt history without the
  // buffer ("重启之后消息就都没了", real incident). Dead buffers stop being
  // WRITTEN, so age is race-free by construction: only files untouched for
  // 7 days are ever deleted, and never for a currently-active session.
  setTimeout(() => {
    const cutoff = Date.now() - 7 * 86400000;
    // <id>.buf / <id>.json / <id>.json.<pid>.tmp (a wrapper killed between its sidecar temp and the rename, ci358-reds round 2) — src/server/wrapper-files.js
    let swept = require('./src/server/wrapper-files.js').sweepAgedWrapperFiles(BUFFERS_DIR, { cutoff, isActive: (id) => activeSessions.has(id) || require('./src/server/session-meta-verdict.js').keeps(id) });
    // data/agentd/session-*.json attach configs (0600, vsht_ host token +
    // full spawn command) — the kill-path unlink needs the live session, so
    // pod recreation leaked one per dial/agentd session forever (audit
    // #16/#53). Same age rule: written once at create, so 7d + not-active is
    // race-free (active sessions are protected by the id check alone).
    try {
      for (const fn of fs.readdirSync(AGENTD_DIR)) {
        const m = fn.match(/^session-(.+)\.json$/);
        if (!m || activeSessions.has(m[1]) || require('./src/server/session-meta-verdict.js').keeps(m[1])) continue;
        try {
          const st = fs.statSync(path.join(AGENTD_DIR, fn));
          if (st.mtimeMs > cutoff) continue;
          fs.unlinkSync(path.join(AGENTD_DIR, fn)); swept++;
        } catch {}
      }
    } catch {}
    // data/chat-frames: the NEW wrapper unlinks after forwarding; a frame sent
    // to a pre-2.360.0 wrapper is orphaned forever (2.361.1 skew incident) —
    // age-based like everything else here, 48h is far past any redelivery use.
    try {
      const fdir = path.join(__dirname, 'data', 'chat-frames');
      const fcut = Date.now() - 48 * 3600 * 1000;
      for (const fn of fs.readdirSync(fdir)) {
        try { if (fs.statSync(path.join(fdir, fn)).mtimeMs < fcut) { fs.unlinkSync(path.join(fdir, fn)); swept++; } } catch {}
      }
    } catch {}
    if (swept) console.log(`  Swept ${swept} orphaned session-buffer/attach-cfg/chat-frame files (age-based)`);
    // B-5a4d root: the handed records (<buffers>/handed/) go by the same cutoff only when no transcript and no record names them — off the loop
    require('./src/server/handed-sweep.js').sweep({ buffersDir: BUFFERS_DIR, metaDir: META_DIR, cutoff, activeSessions }).catch((e) => console.warn('[handed] the age sweep failed:', (e && e.code) || 'an error with no code'));   // a code, never a message (it can carry a path)
  }, 30000);

  console.log(`  Ready.\n`);
}, 'listen-rest'); }, 'restore'); })));   // the B2b cure: the release's .finally — a probe that rejects still reaches unhandledRejection (recorded), after the listen

// On server shutdown: only kill the attach PTYs, NOT the dtach sessions
// Claude processes in dtach survive the server restart
let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true; try { require('./src/store-writer.js').storeWriter().noteSignal(); } catch {} // hub-loop-stalls r6: the stop's grace runs from the signal (the keeper's moment)
  // verify r2: a hand-over in flight settles FIRST (its frame may be in the CLI's inbox while its drain is not on disk — exiting here re-delivered it at the next boot); ≤ 5 s
  // verify r3: the door shuts BEFORE the wait — a press during it started a hand-over nobody waited for
  let n = 0, m = 0; try { stashView.close(); n = stashView.inFlightCount(); } catch { } try { deliver.closeRetries(); m = deliver.retryInFlightCount(); } catch { }   // notify-retry verify r1: the park's retry posts in flight settle too
  if (n > 0 || m > 0) { require('./src/server/exit-settle.js').settleInFlight({ stashView, deliver, n, m }).finally(shutdownNow); return; }
  shutdownNow();
}
function shutdownNow() {
  try { const SW0 = require('./src/store-writer.js').storeWriter(); SW0.beginExit(); SW0.exitFlush({ only: 'rank0' }); } catch {} const tDebt = Date.now(); try { spendGuard.flush(); } catch {} try { require('./src/server/local-index.js').stop(); } catch {} // lane human-cli: the index says the hub STOPPED (a reader tells a clean stop from a crash) · the unattended-spend ledger FIRST (a debounced-only write would hand the next boot a fresh hour — the whole point of persisting it) · lane hub-loop-stalls commit 2: the store writer's exit BEGINS here (a store's own flush only marks it dirty; exitFlush writes all, rank 0 first, with no bound of ours — r6: the manager's grace is the only one)
  bridgeWatch.endAttachPtys(); // THE teardown of every attach pty — shared with the crash path (lane-dead-bridge)
  // SyncStores + layouts persist on a debounce — flush so changes made within
  // the last couple seconds aren't lost across a restart
  for (const store of Object.values(syncStores)) { try { store.flush(); } catch {} }
  try { flushLayouts({ stop: true }); } catch {}   // B-225b's second half: a last flush that fails is the journal's line, by name
  try { sessionStatus.flush(); } catch {} // debounced session-status writes
  try { flushRequestStamps(); } catch {} // each conversation's last model request (lane cache-warmth-tiles r1a′) — read back by boot-restore
  try { userTodos.flush(); } catch {} // debounced user-todo writes
  try { require('./src/server/writes-lost.js').installed()?.stop(); } catch {} // a lost write's warning still held after a failed write (lane cli-2-1-319-records r3)
  try { hosts.flushThrottled(); } catch {} // lane-pairing: the throttled dial facts + exit last-run stamps
  try { telemetry.flush(); } catch {} // buffered telemetry records (2.219.0)
  try { sysinfo.persistHistory(); } catch {} // resource-history ring (2.223.0)
  try { channelsWiring.shutdown(); } catch {} // channel index + audit flush (atomic persistence law)
  try { jobsWiring.shutdown(); try { deliver.flush(); } catch { }; } catch {} // jobs store flush + engine lock release
  try { vnc.shutdown(); } catch {} try { desktopKeeper.shutdown(); desktopAccess.shutdown(); shutdownWindowLeases(); } catch {} // vnc: a THROWAWAY server stops the Xvnc it started (never an adopted one; src/vnc.js) — keeper: timers only — desktop apps SURVIVE a restart by design (adopted at boot); window leases persist, their input side is a handback by construction
  try { browserTrace?.shutdown(); } catch {} try { browserDialogs?.shutdown(); } catch {} try { browserStream?.shutdown(); } catch {} try { browserHandback?.shutdown(); } catch {} try { browserKeeper?.shutdown(); } catch {} // agent browser P5 trace + screencast writers, P2 live-view bridge, P3 handback timers, P1 keeper timers only — the profile browsers survive and are adopted next boot
  try { require('./src/store-writer.js').storeWriter().exitFlush({ debtMs: Date.now() - tDebt }); } catch {} process.exit(require('./src/server/hub-port.js').exitStatus()); /* the B2b cure 2: a bad start exits 2, a stop 0 */ // lane hub-loop-stalls commit 2: every store the writer holds, ONCE, what cannot be re-derived first — no bound of ours (r6: the manager's grace is the only one) — one journal line names what it wrote
}
process.on('SIGINT', () => {
  console.log('\n  Shutting down (dtach sessions will keep running)...');
  shutdown();
});
process.on('SIGTERM', shutdown); bootTrace.mainEnd(); // B-1319: the main-module evaluation ends here (the boot clock's mainMs)
