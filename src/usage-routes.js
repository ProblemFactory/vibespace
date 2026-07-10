/**
 * Usage / rate-limit cluster — extracted verbatim from server.js (2.92.0 split).
 * Everything about quota visibility lives here: the passive statusline-cache
 * ingest (§ban-safety: NO background polling by default), the read-only OAuth
 * token accessor, the opt-in active poll, the user-initiated on-demand quota
 * refresh, and the codex rollout-tail rate-limit summarizer.
 * See CLAUDE.md §9 + accounts.js §ban-safety before changing ANY cadence here.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

function setupUsage({ app, accounts, activeSessions, serverSetting, ensureDir, USAGE_CACHE_FILE, USAGE_CACHE_DIR, CODEX_SESSIONS_DIR, META_DIR, AVAILABLE_MODELS, BUFFERS_DIR }) {
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
let _oauthSignedOut = false; // credentials file present but emptied (user /login'd to console) — last-known data is real but frozen

function _readOAuthCreds() {
  try {
    // Linux: .credentials.json
    const credsPath = path.join(os.homedir(), '.claude', '.credentials.json');
    if (fs.existsSync(credsPath)) {
      const stat = fs.statSync(credsPath);
      if (_oauthCreds && stat.mtimeMs === _oauthMtime) return _oauthCreds;
      const raw = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
      const o = raw?.claudeAiOauth;
      if (o?.accessToken) { _oauthCreds = o; _oauthMtime = stat.mtimeMs; _oauthSignedOut = false; return _oauthCreds; }
      // File parses but holds no token → the user logged OUT of the subscription
      // (e.g. switched to a console login, which wipes it to {}). We keep serving
      // the last-known in-memory creds while their access token stays valid, but
      // flag it so the UI can say the pies are from a signed-out subscription.
      _oauthMtime = stat.mtimeMs;
      _oauthSignedOut = true;
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

function _parseUsage(u) {
  // Frontend expects utilization as a 0–1 fraction and resetsAt as unix
  // seconds; the endpoint gives a 0–100 percent and an ISO timestamp.
  const toWin = (w) => (w && typeof w === 'object') ? {
    utilization: (typeof w.utilization === 'number' ? w.utilization : 0) / 100,
    status: (typeof w.utilization === 'number' && w.utilization >= 100) ? 'limited' : 'allowed',
    resetsAt: w.resets_at ? Math.floor(Date.parse(w.resets_at) / 1000) || 0 : 0,
  } : { utilization: 0, status: 'unknown', resetsAt: 0 };
  const fiveHour = toWin(u.five_hour);
  const sevenDay = toWin(u.seven_day);
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
  return {
    fiveHour, sevenDay, scopedWeekly,
    overallStatus: (fiveHour.status === 'limited' || sevenDay.status === 'limited') ? 'limited' : 'allowed',
    fetchedAt: Date.now(),
  };
}

// cb(usageObj) on a 200; cb(null) on any failure (caller keeps last-known).
function _fetchOAuthUsage(token, cb) {
  cb = cb || ((u) => { if (u) { _rateLimitCache = u; writeUsageCache(); } });
  // OAuth-only endpoint; a real API key can't read subscription usage.
  if (typeof token === 'string' && token.startsWith('sk-ant-api')) { cb(null); return; }
  const req = https.request('https://api.anthropic.com/api/oauth/usage', {
    method: 'GET',
    // DORMANT: nothing schedules this anymore (usage is captured passively via
    // the statusLine hook). Kept ONLY as a user-initiated one-shot primitive.
    // Deliberately NOT spoofing the claude-code User-Agent — impersonating the
    // official harness is itself an enforced-against pattern; the honest fix was
    // to remove the background poll, not to disguise it.
    headers: { 'authorization': `Bearer ${token}`, 'anthropic-beta': 'oauth-2025-04-20', 'anthropic-version': '2023-06-01' },
  }, (res) => {
    let body = '';
    res.on('data', (d) => { body += d; });
    res.on('end', () => {
      if (res.statusCode === 429) {
        const ra = parseInt(res.headers['retry-after'] || '300', 10);
        _rateLimitBackoffUntil = Date.now() + (Number.isFinite(ra) ? ra : 300) * 1000;
        console.warn(`[rate-limit] /api/oauth/usage 429 — backing off ${ra}s (keeping last-known)`);
        cb(null); return;
      }
      if (res.statusCode !== 200) { console.warn(`[rate-limit] /api/oauth/usage HTTP ${res.statusCode}`); cb(null); return; }
      try { cb(_parseUsage(JSON.parse(body))); } catch { cb(null); }
    });
  });
  req.on('error', () => cb(null));
  req.end();
}

// Per-subscription-account usage. Key = account id; '__global__' = the
// machine's own login. Populated PASSIVELY from data/usage-cache/<key>.json,
// which the statusLine hook (data/bin/vibespace-usage) writes from the CLI's
// OWN rate_limits during a real session — NO background OAuth calls.
const _accountUsage = {}; // id → { ...usage, name }

// ── §ban-safety: background /api/oauth/usage polling is OPT-IN, default OFF ───
// By DEFAULT we do NOT poll the usage endpoint with subscription OAuth tokens.
// A fixed-cadence call using a subscription token — for accounts that may be
// idle, from a server — is the textbook "automated / non-human access outside
// the official client" pattern (Consumer Terms §3.7; 2026-02-20 OAuth
// clarification) that flags Max/Pro accounts as bots and gets them banned. So
// usage is normally a BYPRODUCT of real sessions (the statusLine hook caches
// the CLI's own rate_limits). The user can OPT IN to the old active poll via
// the setting below (with a stark automation-risk warning) — e.g. to see live
// usage for chat-only/idle accounts — accepting the ban risk.
function usagePollingEnabled() {
  try { return !!serverSetting('accounts.activeUsagePolling'); } catch { return false; }
}
// Which NAMED claude subscription IS the machine's own ~/.claude login (email
// match)? When linked, the '__global__' cache and that account's cache are two
// views of ONE quota: sessions on the global login write __global__.json,
// sessions with the account explicitly selected write <subId>.json — so we
// merge them newest-wins BOTH ways and tell the client (usage switcher shows
// ONE entry for the account instead of a confusing duplicate pair).
let _usageGlobalLink = { email: null, loggedIn: false, accountId: null };
let _codexUsageGlobalLink = { email: null, loggedIn: false, accountId: null };
function ingestPassiveUsage() {
  const allAccts = accounts.list().accounts || [];
  const roster = allAccts.filter((a) => (a.backend || 'claude') !== 'codex' && a.type === 'subscription');
  const subIds = new Set(roster.map((a) => a.id));
  for (const id of Object.keys(_accountUsage)) if (!subIds.has(id)) delete _accountUsage[id]; // drop removed accounts
  try {
    const st = accounts.subscriptionStatus();
    const em = st.loggedIn && st.email ? String(st.email).toLowerCase() : null;
    const m = em ? roster.find((a) => a.email && String(a.email).toLowerCase() === em) : null;
    _usageGlobalLink = { email: st.email || null, loggedIn: !!st.loggedIn, accountId: m ? m.id : null };
  } catch { _usageGlobalLink = { email: null, loggedIn: false, accountId: null }; }
  // Same-account link for CODEX: the machine's own ~/.codex login vs the named
  // ChatGPT accounts (cxs-*) — email from the id_token claims on both sides.
  try {
    const cst = accounts.codexGlobalStatus();
    const cem = cst.loggedIn && cst.email ? String(cst.email).toLowerCase() : null;
    const cm = cem ? allAccts.find((a) => a.backend === 'codex' && a.email && String(a.email).toLowerCase() === cem) : null;
    _codexUsageGlobalLink = { email: cst.email || null, loggedIn: !!cst.loggedIn, accountId: cm ? cm.id : null };
  } catch { _codexUsageGlobalLink = { email: null, loggedIn: false, accountId: null }; }
  let entries = [];
  try { entries = fs.readdirSync(USAGE_CACHE_DIR); } catch { entries = []; }
  for (const fn of entries) {
    if (!fn.endsWith('.json')) continue;
    const key = fn.slice(0, -5);
    if (key === '__models__') { ingestPassiveModels(fn); continue; }
    let u = null;
    try { u = JSON.parse(fs.readFileSync(path.join(USAGE_CACHE_DIR, fn), 'utf-8')); } catch { continue; }
    if (!u || typeof u.fetchedAt !== 'number') continue;
    if (key === '__global__') {
      // Newest wins vs whatever we have (a live global poll never runs now).
      if (!_rateLimitCache || (u.fetchedAt > (_rateLimitCache.fetchedAt || 0))) { _rateLimitCache = u; writeUsageCache(); }
    } else if (subIds.has(key)) {
      const meta = roster.find((x) => x.id === key) || {};
      _accountUsage[key] = { ...u, name: meta.name, email: meta.email };
    }
  }
  // Same-account merge (see _usageGlobalLink above): freshest view wins for both.
  const gid = _usageGlobalLink.accountId;
  if (gid) {
    const a = _accountUsage[gid] || null;
    const g = _rateLimitCache || null;
    const newest = (a && (!g || (a.fetchedAt || 0) > (g.fetchedAt || 0))) ? a : g;
    if (newest) {
      const meta = roster.find((x) => x.id === gid) || {};
      if (newest !== g) {
        const { name, email, ...usage } = newest;
        _rateLimitCache = usage; writeUsageCache();
      }
      _accountUsage[gid] = { ...newest, name: meta.name, email: meta.email };
    }
  }
}
// Merge PASSIVELY-discovered full model IDs (from the statusLine hook — models
// you actually ran) into the Claude dropdown, after the hardcoded aliases and
// deduped by id. Zero API calls; this is the passive counterpart to the
// (now opt-in) /v1/models fetch.
function ingestPassiveModels(fn) {
  let list = [];
  try { list = JSON.parse(fs.readFileSync(path.join(USAGE_CACHE_DIR, fn), 'utf-8')); } catch { return; }
  if (!Array.isArray(list) || !list.length) return;
  const have = new Set((AVAILABLE_MODELS.claude || []).map((m) => m.id));
  const add = list.filter((m) => m && typeof m.id === 'string' && !have.has(m.id))
                  .map((m) => ({ id: m.id, label: m.label || m.id }));
  if (add.length) AVAILABLE_MODELS.claude = [...(AVAILABLE_MODELS.claude || []), ...add];
}
ingestPassiveUsage();
setInterval(ingestPassiveUsage, 30000); // local disk read only — no network
// Normalizer-visible settings (chat.hideEmptyHooks) — lazy, store-safe getter.

// OPT-IN active poll (default OFF; see usagePollingEnabled + the stark warning
// on accounts.activeUsagePolling). When enabled it restores the pre-2.60.0
// behavior: global login every ~5 min + one named subscription per 90s tick
// (round-robin). No-op every tick while the setting is off, so toggling it takes
// effect live without a restart. This is the ONLY code path that contacts
// Anthropic for usage, and the user explicitly accepted the risk to enable it.
let _acctUsageRR = 0;
let _lastGlobalUsagePoll = 0;
function pollUsageActive() {
  if (!usagePollingEnabled()) return;               // OPT-IN gate
  if (Date.now() < _rateLimitBackoffUntil) return;  // honoring a prior 429
  // Global login (the machine's own) — at most every 5 min.
  if (Date.now() - _lastGlobalUsagePoll > 300000) {
    _lastGlobalUsagePoll = Date.now();
    const gtok = getOAuthToken();
    if (gtok) _fetchOAuthUsage(gtok, (u) => { if (u) { _rateLimitCache = u; writeUsageCache(); } });
  }
  // One named subscription per tick (round-robin); idle/expired-token accounts
  // are skipped and keep last-known.
  const subs = (accounts.list().accounts || []).filter((a) => a.type === 'subscription');
  const ids = new Set(subs.map((a) => a.id));
  for (const id of Object.keys(_accountUsage)) if (!ids.has(id)) delete _accountUsage[id];
  if (!subs.length) return;
  const a = subs[_acctUsageRR++ % subs.length];
  const token = accounts.usageToken(a.id);
  if (!token) return;
  _fetchOAuthUsage(token, (u) => { if (u) _accountUsage[a.id] = { ...u, name: a.name, email: a.email }; });
}
setInterval(pollUsageActive, 90000);

// ── On-demand quota refresh (USER-INITIATED, throttled) ──────────────────────
// The statusline payload carries ONLY five_hour/seven_day — model-scoped weekly
// buckets (e.g. the Fable cap) are never in it (verified against the 2.1.206
// payload builder: rate_limits spreads exactly those two windows), so passive
// capture cannot show them. This endpoint is the human-gated equivalent of
// running /usage in the CLI: fired from the usage popup (open / ⟳ click),
// NEVER on a timer, one account per call, ≥60s per account, honoring the
// global 429 backoff. §ban-safety: interactive user action, not background
// automation — do NOT wire this to any scheduler.
const _onDemandUsageAt = {};
app.post('/api/usage/refresh', (req, res) => {
  // User-facing kill switch (accounts.onDemandQuotaRefresh = 'off'): never
  // contact Anthropic, even if a stale client asks.
  let odMode = 'manual';
  try { odMode = serverSetting('accounts.onDemandQuotaRefresh') || 'manual'; } catch {}
  if (odMode === 'off') return res.status(403).json({ error: 'on-demand quota refresh is disabled in Settings' });
  const key = String(req.body?.account || '__global__');
  if (Date.now() < _rateLimitBackoffUntil) return res.json({ throttled: true, reason: 'backoff' });
  if (Date.now() - (_onDemandUsageAt[key] || 0) < 60000) return res.json({ throttled: true });
  const isGlobal = key === '__global__';
  let acctMeta = null;
  if (!isGlobal) {
    acctMeta = (accounts.list().accounts || []).find((x) => x.id === key && x.type === 'subscription');
    if (!acctMeta) return res.status(404).json({ error: 'unknown subscription account' });
  }
  const token = isGlobal ? getOAuthToken() : accounts.usageToken(key);
  if (!token) return res.json({ error: 'no currently-valid token for this account — run a session on it (the CLI refreshes its own login), then retry' });
  _onDemandUsageAt[key] = Date.now();
  _fetchOAuthUsage(token, (u) => {
    if (!u) return res.json({ error: 'refresh failed (rate-limited or offline) — kept last-known' });
    u.source = 'on-demand';
    u.scopedFetchedAt = Date.now(); // scoped buckets only ever come from here — track their own age
    // Persist to the same per-account cache file the statusline hook writes:
    // survives restarts, and the hook's preserve-merge keeps scopedWeekly alive
    // through subsequent passive (5h/7d-only) writes.
    try {
      fs.mkdirSync(USAGE_CACHE_DIR, { recursive: true });
      const f = path.join(USAGE_CACHE_DIR, key.replace(/[^\w.-]/g, '_') + '.json');
      fs.writeFileSync(f + '.tmp', JSON.stringify(u)); fs.renameSync(f + '.tmp', f);
    } catch {}
    if (isGlobal) { _rateLimitCache = u; writeUsageCache(); }
    else _accountUsage[key] = { ...u, name: acctMeta.name, email: acctMeta.email };
    try { ingestPassiveUsage(); } catch {} // re-run the global↔named same-account merge
    res.json({ success: true });
  });
});

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
  // Rollouts are organized sessions/YYYY/MM/DD/ and this walk runs every ~30s
  // forever (usage snapshot refresh) — unpruned it is O(all rollouts ever).
  // Skip date subtrees older than the cutoff; freshest-24 is all we keep anyway.
  const cutoff = new Date(Date.now() - 14 * 86400000);
  const cutoffYMD = [cutoff.getFullYear(), cutoff.getMonth() + 1, cutoff.getDate()];
  const tooOld = (rel) => {
    const segs = rel.split(path.sep).filter(Boolean).map(Number);
    for (let i = 0; i < Math.min(segs.length, 3); i++) {
      if (!Number.isFinite(segs[i])) return false; // not a date layout — keep descending
      if (segs[i] < cutoffYMD[i]) return true;
      if (segs[i] > cutoffYMD[i]) return false;
    }
    return false;
  };
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
        if (tooOld(path.relative(CODEX_SESSIONS_DIR, fp))) continue;
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

// threadId → accountId from session-meta (codex quota is PER ACCOUNT — each
// snapshot must land in the bucket of the account its session billed to).
let _codexAcctMapCache = null;
function codexThreadAccountMap() {
  // META_DIR lives on the (possibly NFS) workspace — same cost class as
  // usage-history's _metaMap, same fix: 60s TTL (attribution of a snapshot
  // to an account tolerates a minute of staleness).
  if (_codexAcctMapCache && Date.now() - _codexAcctMapCache.at < 60000) return _codexAcctMapCache.map;
  const map = {};
  let files = [];
  try { files = fs.readdirSync(META_DIR); } catch {}
  for (const fn of files) {
    if (!fn.endsWith('.json')) continue;
    try {
      const m = JSON.parse(fs.readFileSync(path.join(META_DIR, fn), 'utf-8'));
      if ((m.backend || 'claude') === 'codex' && m.backendSessionId) map[m.backendSessionId] = m.accountId || null;
    } catch {}
  }
  _codexAcctMapCache = { at: Date.now(), map };
  return map;
}

// Overall freshest snapshot (back-compat) + per-account buckets keyed by
// account id / '__global_codex__' (sessions with no VibeSpace account = the
// machine's own codex login). Sources: live wrapper meta (account = the
// session's own), then recent rollout tails (account via session-meta lookup
// on the thread id in the filename).
function summarizeCodexRateLimits() {
  const now = Date.now();
  if (now - _codexRateLimitCacheAt < 30000) return _codexRateLimitCache || { overall: null, byAccount: {} };

  const byAccount = {};
  const keep = (key, snapshot) => {
    if (!snapshot) return;
    if (!byAccount[key] || (snapshot.fetchedAt || 0) > (byAccount[key].fetchedAt || 0)) byAccount[key] = snapshot;
  };
  for (const [id, session] of activeSessions) {
    if (session.backend !== 'codex' || session.mode !== 'chat') continue;
    keep(session._accountId || '__global_codex__', readCodexWrapperRateLimit(id));
  }
  {
    const threadAcct = codexThreadAccountMap();
    const recentFiles = listRecentCodexJsonlFiles();
    let freshEnough = 0;
    for (const entry of recentFiles) {
      const tm = /rollout-.*-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i.exec(entry.path);
      const snapshot = readLatestCodexRateLimitFromJsonl(entry.path);
      if (!snapshot) continue;
      const acct = tm ? (threadAcct[tm[1].toLowerCase()] || null) : null;
      keep(acct || '__global_codex__', snapshot);
      if (snapshot.fetchedAt && (now - snapshot.fetchedAt) < 5 * 60 * 1000 && ++freshEnough >= 3) break;
    }
  }
  let overall = null;
  for (const s of Object.values(byAccount)) if (!overall || (s.fetchedAt || 0) > (overall.fetchedAt || 0)) overall = s;
  // Same-account merge (codex global ↔ linked named account): newest wins both.
  const gid = _codexUsageGlobalLink.accountId;
  if (gid) {
    const a = byAccount[gid], g = byAccount['__global_codex__'];
    const newest = (a && (!g || (a.fetchedAt || 0) > (g.fetchedAt || 0))) ? a : g;
    if (newest) { byAccount[gid] = newest; byAccount['__global_codex__'] = newest; }
  }
  _codexRateLimitCache = { overall, byAccount };
  _codexRateLimitCacheAt = now;
  return _codexRateLimitCache;
}
function summarizeCodexRateLimit() { return summarizeCodexRateLimits().overall; }

app.get('/api/usage', (req, res) => {
  ingestPassiveUsage(); // pick up whatever active sessions' statuslines just wrote
  const codexRl = summarizeCodexRateLimits();
  const codexAccounts = {};
  const acctList = Object.keys(codexRl.byAccount || {}).length ? (accounts.list().accounts || []) : [];
  for (const [key, snap] of Object.entries(codexRl.byAccount || {})) {
    const meta = key === '__global_codex__' ? null : acctList.find((a) => a.id === key);
    codexAccounts[key] = { ...snap, name: meta?.name || null, email: meta?.email || null };
  }
  res.json({
    rateLimit: _rateLimitCache, codexRateLimit: codexRl.overall,
    subscriptionSignedOut: _oauthSignedOut, accounts: _accountUsage,
    // Identity of each CLI's machine login (+ the named account it IS, when an
    // email matches) — the usage switchers render one entry, not two.
    globalLogin: _usageGlobalLink,
    codexGlobalLogin: _codexUsageGlobalLink,
    // Per-account codex quota snapshots (key = cxs id / '__global_codex__')
    codexAccounts,
  });
});


  return { getOAuthToken, usagePollingEnabled, refreshRateLimit, ingestPassiveUsage, summarizeCodexRateLimit, summarizeCodexRateLimits };
}

module.exports = { setupUsage };
