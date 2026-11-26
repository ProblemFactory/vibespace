/**
 * Usage / rate-limit cluster — extracted verbatim from server.js (2.92.0 split).
 * Everything about quota visibility lives here: the passive statusline-cache
 * ingest (§ban-safety: NO background polling by default), the read-only OAuth
 * token accessor, the opt-in active poll, the user-initiated on-demand quota
 * refresh, and the codex rollout-tail rate-limit summarizer.
 * See CLAUDE.md §9 + accounts.js §ban-safety before changing ANY cadence here.
 */
const fs = require('fs');
const UP = require('./usage-predict.js');   // the lanes a screen may draw (usage-predict)
const doorReads = require('./door-reads.js');   // today's reads of an on-demand account, by caller (usage-predict pick 1)
const { accountLoginState } = require('./login-state.js'); // THE credential-state reader (shared with the pool engine + the repair migration)
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

// ── Quota READING parsers live in the harness registry (S4, docs/design-
// harness-plugins.md §2.4): each harness's QuotaSignalSource.normalize is
// the ONE normalizer for its reading shapes. The names below are the same
// functions this file used to define (moved verbatim) — re-exported at the
// bottom for current callers (tests, the engine) so nothing drifts.
const harnesses = require('./harnesses');
const { oauthUsageAccount } = require('./backend-caps.js'); // PURE: caps.oauthUsage — the OAuth usage-poll accounts
const { pressBearer } = require('./write-origin.js'); // a person's door: any Bearer is refused (the reset claim, lane account-reset-door)
// THE ONE WRITE PATH (src/usage-cache-write.js, design-account-hardening §4.2):
// every producer in this file reaches data/usage-cache/*.json through it. It
// merges each reading into the file's typed `limits` PER limitId and rewrites
// the legacy bucket fields as a projection of the merged set — which is what
// stops codex's three concurrent limits collapsing into whichever pushed last
// (B-9213) and what stamps `state:'empty'` on a window that has not started
// (B-8b12). A grep-derived census (scripts/test-quota-model.mjs §⑩) fails the
// build if any other module writes a file in that directory.
const usageWrite = require('./usage-cache-write.js');
const { familyOfScopedBucket } = require('./model-family.js');
const claudeQuota = harnesses.get('claude').quota;
const parseCliUsageText = claudeQuota.parseCliUsageText;      // `claude -p /usage` panel text
const codexQuota = harnesses.get('codex').quota;
const normalizeCodexRateLimit = codexQuota.normalize; // codex rate_limits (rollout / live push / rateLimits/read)
const quotaModel = require('./quota-model.js');
// MAY THIS READ RETIRE A LIMIT? One rule, asked by every enumerating producer
// (r6) — never a hand-spelled `scopedWeekly?.length` test, which is a fact about
// the array and not about the parse. See quota-model's `authoritativeScopesOf`.
const { authoritativeScopesOf } = quotaModel;

const probeLog = require('./server/usage-probe-log.js'); // the raw /usage probe ring (2.369.109)
const { usageBearerOk, usageBearerRefusal } = require('./login-expiry.js'); // PURE: THE USAGE BEARER LAW — the CLI's own login token (a refresh token beside it), never a long-lived one (acceptance r3/r4)
const { unplaceableText, wallDoor } = require('./account-pool-auto.js'); // PURE: the roster's words — ⟳ says the SAME sentence for the same fact (acceptance r3)
const { probeFailWhy, probeWhyText, probeEligibility, isUnprobeable, notProbedWords, panelAnswerClass, OAT_FOLDER_NO_PANEL, SIGNIN_UNKNOWN } = require('./auto-cli-model.js'); // PURE: may the probe PROVE this row, a failed probe's reason + THE ONE scrub (lane auto-cli-oat-unprobeable)
// THE PANEL PROBE'S ARGV (B-9b40): `/usage` and no MCP server at all. Measured on
// the claude 2.1.288 binary: print mode loads the account's claude.ai connectors
// unless the MCP config is strict (`headlessSyncsClaudeAiConnectors: !strictConfig
// && …`), so every probe listed the account's connectors and opened the mcp-proxy
// for each one — five mcp-logs-claude-ai-* dirs under each member's probe cwd,
// one file per probe. `--strict-mcp-config` with no `--mcp-config` = none loaded;
// the probe's one vendor call is the panel. One spelling: the spawn and the log.
const PANEL_PROBE_ARGS = Object.freeze(['-p', '/usage', '--strict-mcp-config']);
// THE FENCE OF «Off (never contact Anthropic)» (B-5279, 主开发 r4896): the Claude descriptor's row (quota.readsRow —
// accounts.onDemandQuotaRefresh) set to off refuses EVERY start of the panel program — a person's ⟳, the auto-cli rung, the
// pool's five roads (the wall ladder, the gate before an automatic continue, the reset-credit hold and its re-read, the check
// after a login) and the mint's identity proof — HERE, at the one door all of them pass, before the program starts. BY NAME:
// an Error with `code` PANEL_OFF and `refusedByRow`, never a spawn failure — the read records it as not probed and books
// nothing against the account. The row's MEANING is unchanged (a value that cannot be read is the default, manual, as the
// route has always read it); a door handed NO reader refuses (fail closed: a new caller cannot start the program unasked).
const PANEL_OFF = 'refresh-off';
const PANEL_NO_READER = 'refresh-no-reader';
// WHILE THE SETTINGS ARE HELD (主开发 r4932, M2): a settings.json the start could not read hands every reader a frozen view
// (src/routes/persistence.js — its marker Symbol.for('vibespace.settings-held')); the person's stored choice, which nobody can read
// then, may be Off — so the door refuses EVERY start, a person's press included: a contact made against a stored Off cannot be taken
// back, a refused press can be pressed again once the settings read. By its own code and words; no caller tells the door who it is
const PANEL_HELD = 'refresh-held';
const DOOR_CODES = Object.freeze([PANEL_OFF, PANEL_NO_READER, PANEL_HELD]);
const SETTINGS_HELD = Symbol.for('vibespace.settings-held');
const CLAUDE_READS_ROW = require('./harnesses/claude-quota.js').readsRow;
function panelDoorRefusal(setting) {
  if (typeof setting !== 'function') return Object.assign(new Error('the usage-refresh row could not be asked — nothing was started'), { code: PANEL_NO_READER, refusedByRow: true });
  let held = null; try { held = setting(SETTINGS_HELD) || null; } catch { held = null; }
  if (held) return Object.assign(new Error('the settings could not be read — nothing was started'), { code: PANEL_HELD, refusedByRow: true });
  let mode = 'manual'; try { mode = setting(CLAUDE_READS_ROW) || 'manual'; } catch { mode = 'manual'; }
  return mode === 'off' ? Object.assign(new Error('Claude usage refresh is off in Settings (never contact Anthropic) — nothing was started'), { code: PANEL_OFF, refusedByRow: true }) : null;
}
// THE ONE PANEL SPAWN: the auto-cli rung below and the long-lived token mint's
// second look (src/server/oat-mint.js, oat-verify F1) — one site, one argv, and
// ONE ISOLATION (B-855a c1). A caller passes the isolated config dir it proves
// (`root`) and the identity env (the secret store, or the minted token); the
// CLI's org context (CLAUDE_CONFIG_DIR = root) and its working directory (the
// empty dir inside root) are derived HERE and nowhere else. mirror-263 §19: when
// the mint made this spawn shared, each caller handed in its own env + cwd and
// the isolation left the site. No root = the machine login's own probe
// (__global__): no account dir to isolate into.
function spawnPanelProbe(bin, { root, env: identityEnv, setting }, done) {
  // THE FENCE (B-5279): asked first, before anything is made or started; the refusal answers on a later turn, like an answer
  const no = panelDoorRefusal(setting);
  if (no) { setImmediate(() => done(no, '', '')); return null; }
  const { execFile } = require('child_process');
  const probeConfigDir = root || null;
  const env = { ...identityEnv };
  if (probeConfigDir) env.CLAUDE_CONFIG_DIR = probeConfigDir;
  const probeCwd = probeCwdOf(probeConfigDir);
  // THE WORKING DIRECTORY IS ISOLATED TOO (owner 2026-09-17 "确保 config dir 和
  // working directory 都用新的路径"): the CLI keys per-project state by cwd
  // (`projects/<encoded cwd>` under the config dir, the trust record, any
  // CLAUDE.md / .claude/ it finds there). A shared os.tmpdir() made every
  // account's probe one "project" on a directory anyone can write into; an
  // empty dir INSIDE the probe's config keeps that state per account and out of
  // reach (the mint's PTY cwd is its scratch root, never this dir). Measured
  // 2026-09-17 21:41Z: the real CLI fetches and prints under it and creates
  // `projects/-…-cwd` in the isolated config dir.
  if (probeConfigDir) fs.mkdirSync(probeCwd, { recursive: true, mode: 0o700 });
  return execFile(bin, [...PANEL_PROBE_ARGS], { env, cwd: probeCwd, timeout: 60000, maxBuffer: 1024 * 1024 }, done);
}
/** The probe's working directory: an empty dir INSIDE the isolated config dir
 *  (no config dir = the machine login's own probe, in the shared tmpdir). */
function probeCwdOf(probeConfigDir) { return probeConfigDir ? path.join(probeConfigDir, 'cwd') : os.tmpdir(); }
// THE MACHINE LOGIN's KEPT READ (module scope since r2575: it reads nothing of setupUsage's; getOAuthToken is exported for its legs)
let _oauthCreds = null; // { accessToken, refreshToken, expiresAt }
// THE KEPT READ's KEY (主开发 r2575): the file's time AND size AND inode — two writes inside one tick of the file's time (1 ms measured on
// a local disk: run a84994d06-20261122212331-box) read as unchanged by the time alone; a refresh written by rename has a new inode. The
// residual (an in-place rewrite of the same size inside one tick) is closed by the read again past the kept sign-in's life (below)
let _oauthKey = null;
let _oauthExpiredReadAt = 0;   // the last read again of a kept sign-in past its own life — paced (never a loop on a file that stays old)
const OAUTH_EXPIRED_REREAD_MS = 300000;   // the machine login's own poll pace (pollUsageActive: the global login at most every 5 min)
const oauthKeyOf = (st) => `${st.mtimeMs}|${st.size}|${st.ino}`;
const oauthPastLife = (o) => !!(o && o.expiresAt && Date.now() >= o.expiresAt - 60000);   // getOAuthToken's own 60 s skew
let _oauthSignedOut = false; // credentials file present but emptied — see the cause split below
let _oauthSignedOutCause = 'expired'; // 'console' (replaced by a Console /login) | 'expired' (idle machine login aged out)

function _readOAuthCreds() {
  let pastLifePass = false;   // r2575 law 2: the read again past a kept sign-in's life is a FILE read and nothing else (never the Keychain's child)
  try {
    // Linux: .credentials.json
    const credsPath = path.join(os.homedir(), '.claude', '.credentials.json');
    if (fs.existsSync(credsPath)) {
      const stat = fs.statSync(credsPath);
      const key = oauthKeyOf(stat), kept = key === _oauthKey;
      // r2575: the kept read stands while its key is the file's — unless the kept sign-in is past its own life: then the FILE is read
      // again (a file read and NOTHING else: the hub never refreshes this sign-in, no vendor call, no timer), once at the expiry and
      // then at the poll's own pace; a signed-out file unchanged since its read is not read again
      if (kept && _oauthCreds && (!oauthPastLife(_oauthCreds) || Date.now() - _oauthExpiredReadAt < OAUTH_EXPIRED_REREAD_MS)) return _oauthCreds;
      if (kept && _oauthCreds) { _oauthExpiredReadAt = Date.now(); pastLifePass = true; }
      if (!(kept && _oauthSignedOut)) {   // a signed-out file unchanged since its read is not read again (macOS goes on to its Keychain)
        // r2700: a read that FAILS after the file's key changed (a torn write, EACCES) drops the kept sign-in — never the previous
        // token served for that ask; the key is not advanced, so the next ask reads again
        let raw; try { raw = JSON.parse(fs.readFileSync(credsPath, 'utf-8')); } catch (e) { if (!kept) _oauthCreds = null; throw e; }
        const o = raw?.claudeAiOauth;
        if (o?.accessToken) { _oauthCreds = o; _oauthKey = key; _oauthSignedOut = false; _oauthExpiredReadAt = oauthPastLife(o) ? Date.now() : 0; return _oauthCreds; }
        // File parses but holds no token. TWO distinct causes (2.266.2 — the
        // blanket "a Console login replaced it" wording was wrong for the real
        // 2026-08-09 case): (a) a Console /login wiped it (primaryApiKey lands in
        // ~/.claude.json); (b) the machine login sat IDLE until its refresh token
        // expired — with named/pooled accounts handling every session nothing
        // refreshes ~/.claude — and the CLI's failed refresh cleared the stored
        // tokens (empty access+refresh, metadata kept). Cause derived once per
        // creds-file change (never per poll — ~/.claude.json can be large).
        try {   // (inside this branch the file is new or changed: the cause is derived once a change, never a poll)
          const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude.json'), 'utf-8'));
          _oauthSignedOutCause = cfg?.primaryApiKey ? 'console' : 'expired';
        } catch { _oauthSignedOutCause = 'expired'; }
        _oauthKey = key;
        _oauthSignedOut = true;
        _oauthCreds = null;   // r2575 (ALSO CURED): a kept sign-in never outlives the file's sign-out — the previous token is not used
      }
    } else if (process.platform !== 'darwin') { _oauthCreds = null; _oauthKey = null; }   // r2575: a file GONE keeps no sign-in (its kept token is not used after it); r2700: its signed-out word stands as it was (the usage meter's warning reads it)
    // macOS: Keychain
    if (process.platform === 'darwin' && !pastLifePass) {
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
  const token = (usageBearerOk(creds) && (!creds.expiresAt || Date.now() < creds.expiresAt - 60000))
    ? creds.accessToken
    : null;
  if (callback) { callback(token); return; }
  return token;
}

function setupUsage({ app, accounts, hosts, spendGuard = null, usageHistory, activeSessions, serverSetting, ensureDir, USAGE_CACHE_FILE, USAGE_CACHE_DIR, CODEX_SESSIONS_DIR, META_DIR, AVAILABLE_MODELS, BUFFERS_DIR, apiDerivedWindow, establishedWindows, repairIdentityAnchors, probeUsageForAccountKey, onMemberReadingFresh, CLAUDE_CMD, cliCmds = null }) {
const https = require('https');
function readUsageCache() {
  try {
    const cached = JSON.parse(fs.readFileSync(USAGE_CACHE_FILE, 'utf-8'));
    return cached?.claude || null;
  } catch {
    return null;
  }
}

// B-360d part 3 U2 (主开发 r1459): data/usage-cache.json is a DERIVED copy — the boot's seed of _rateLimitCache; the reading
// itself lives in usage-cache/__global__.json — so it is written by the STORE WRITER (memory is authoritative; a burst is one
// write, off the loop; the folder made on its own thread), the latest state at its write; no state ⇒ nothing written, as
// before. Its other writer, the identity repair (src/reading-repair.js repairGlobalFile), flushes this file before it judges it.
function writeUsageCache({ evenNone = false } = {}) {
  // r2430: a repair's verdict of NONE for the machine login's reading — the copy says none too (`{ claude: null }`: readUsageCache
  // reads it as none, repairGlobalFile as «absent»), so once it lands a restart does not seed back the reading the repair took away
  if (evenNone) { try { require('./store-writer.js').storeWriter().dirty(USAGE_CACHE_FILE, { name: 'usage-cache.write', makeDir: true, produce: () => JSON.stringify({ claude: _rateLimitCache || null }, null, 2) }); } catch { } return; }
  if (!_rateLimitCache) return;
  try {
    require('./store-writer.js').storeWriter().dirty(USAGE_CACHE_FILE, { name: 'usage-cache.write', makeDir: true, produce: () => (_rateLimitCache ? JSON.stringify({ claude: _rateLimitCache }, null, 2) : null) });
  } catch {}
}

let _rateLimitCache = readUsageCache();
let _codexRateLimitCache = null;
let _codexRateLimitCacheAt = 0;


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

// GET /api/oauth/usage reply → usage-cache shape: the claude harness's
// parseOAuthUsage (moved there verbatim in S4; bound under the old name).
const _parseUsage = claudeQuota.parseOAuthUsage;

// Consume RAW vendor reply bodies the DEVICE op returned (quota-refresh runs
// the human-gated fetch ON the machine holding the login — design §Quota
// refresh origin; the parse stays here, one implementation for both origins).
function _consumeDeviceQuota(r) {
  if (!r || !r.usage) return null;
  if (r.usage.status === 429) { _rateLimitBackoffUntil = Date.now() + 300000; return null; }
  if (r.usage.status !== 200) return null;
  let u = null; try { u = _parseUsage(JSON.parse(r.usage.body)); } catch { return null; }
  if (r.roles && r.roles.status === 200) {
    try {
      const j = JSON.parse(r.roles.body);
      if (j.organization_uuid) {
        const m = /^(\S+@\S+)'s Organization$/.exec(j.organization_name || '');
        Object.assign(u, { orgUuid: j.organization_uuid, orgName: j.organization_name || '', ...(m ? { orgEmail: m[1] } : {}) });
      }
    } catch { }
  }
  return u;
}

// B-5e0d: THE DEVICE'S OWN REASON answers the ⟳ — a refusal the agent (or the law's first look) made BY NAME is the answer:
// 'long-lived' goes on to the route's error words; 'no-valid-login' is the token peek's «no login» (null); a first look of the
// hub's own that THREW (`firstLook`: the law asked before an older agent — an unreachable host) is never made twice; only a
// device leg that failed otherwise (an older agent's error, a link down, no usable reading) takes the look through the shell.
const _firstLook = (p) => p.catch((e) => { if (e && typeof e === 'object') e.firstLook = true; throw e; });
function _deviceSaid(e, peek) {
  if (e && (e.code === 'long-lived' || e.firstLook)) return Promise.reject(e);
  if (e && e.code === 'no-valid-login') return Promise.resolve(null);
  return peek();
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

// Token → TRUE account identity (org uuid/name). Rides ONLY on the human-gated
// on-demand refresh (never scheduled) — one extra read-only call per ⟳ click.
// Exists because ~/.claude.json's oauthAccount goes STALE after a /login
// account switch (real incident: config said one email, the token actually
// belonged to another account — the usage popup looked like two subscriptions
// had swapped quotas). The org uuid is the only trustworthy join key.
function _fetchOAuthRoles(token, cb) {
  if (typeof token === 'string' && token.startsWith('sk-ant-api')) { cb(null); return; }
  const req = https.request('https://api.anthropic.com/api/oauth/claude_cli/roles', {
    method: 'GET',
    headers: { 'authorization': `Bearer ${token}`, 'anthropic-beta': 'oauth-2025-04-20', 'anthropic-version': '2023-06-01' },
    timeout: 8000,
  }, (res) => {
    let body = '';
    res.on('data', (d) => { body += d; });
    res.on('end', () => {
      if (res.statusCode !== 200) { cb(null); return; }
      try {
        const j = JSON.parse(body);
        if (!j.organization_uuid) { cb(null); return; }
        // Personal orgs are named "<email>'s Organization" — extract the email
        // for display; team orgs just carry their org name.
        const m = /^(\S+@\S+)'s Organization$/.exec(j.organization_name || '');
        cb({ orgUuid: j.organization_uuid, orgName: j.organization_name || '', ...(m ? { orgEmail: m[1] } : {}) });
      } catch { cb(null); }
    });
  });
  req.on('error', () => cb(null));
  req.on('timeout', () => { req.destroy(); cb(null); });
  req.end();
}

// Per-subscription-account usage. Key = account id; '__global__' = the
// machine's own login. Populated PASSIVELY from data/usage-cache/<key>.json,
// which the statusLine hook (data/bin/vibespace-usage) writes from the CLI's
// OWN rate_limits during a real session — NO background OAuth calls.
const _accountUsage = {}; // id → { ...usage, name }
// A PERSON'S RESET CLAIM + A RESET SEEN IN A READING (lane account-reset-door): the ONE claim store (src/usage-reset-claim.js —
// the pool engine reads the same one); a reading that shows a vendor-side reset is said once and ends a claim on its lane
// a claim of an account that is gone — or that takes no claim (src/backend-caps.js oauthUsage: Claude's typed lanes) — is dropped
// r3044 (5) / r3019: while the list is UNREAD the answer is «unknown» (null — safeKnown keeps it): prune and viewOf drop NOTHING
const claimable = (key) => { if (key === '__global__') return true; if ((() => { try { return typeof accounts.held === 'function' ? (accounts.held() || null) : null; } catch { return { code: 'held-unknown' }; } })()) return null; try { const a = accounts.get(key); return !!a && oauthUsageAccount(a); } catch { return true; } };
const keyName = (key) => (key === '__global__' ? 'the machine login' : (accounts.get(key)?.name || key));
// (the store hears the write path's statements of ITS data dir itself — usage-reset-claim at(): the lanes a write stated
// settle a claim, a reset a write showed is said once, named here)
const resetClaims = require('./usage-reset-claim.js').at(path.dirname(USAGE_CACHE_DIR), { known: claimable, nameOf: keyName });
// B-360d part 3 U3 (主开发 r1459): THE FOLDER'S ONE READER OFF THE LOOP (src/usage-cache-folder.js) — the ingestion, the host
// files' boot read and the codex seed read its kept reply (no file call of their own); the ingestion runs when a refresh brings
// its reply (ONE CLOCK: the reader's 30-s refresh, a request's, the anchor sweep's); a held folder keeps the last reply, its age said
const usageFolder = require('./usage-cache-folder.js').forDir(USAGE_CACHE_DIR, { log: (m) => console.log(m) });
resetClaims.onChange(() => { try { accounts._notify?.(); } catch { } });   // every device redraws at once (the accounts frame re-reads usage)

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
let _codexLinkUndecided = false;   // B-360d (round wldn7whag): this pass could not decide the codex link — its merge does not run
/** Re-read the persisted machine-login snapshot and re-run the passive merge.
 *  The one-shot migrations run INSIDE server.listen's callback, i.e. AFTER this
 *  module already loaded data/usage-cache.json into `_rateLimitCache` at boot
 *  (2026-09-08 repair r6 verifier: unlinking a poisoned sibling changed nothing
 *  for the life of that process — both panel rows kept the stranger's window).
 *  Cheap and idempotent: server.js calls it right after runLocalMigrations(). A write of the copy still OWED (r2335) means
 *  memory is NEWER than the file (the store writer's produce reads memory when it writes): the reload keeps memory then, or the
 *  owed write would land the older file's reading (the active poll's reading lives in memory and this copy alone; the repair
 *  that judges this copy, reading-repair.js repairGlobalFile, flushes it first, so a repaired copy is read). */
/** r2430 — A REPAIR'S VERDICT OUTRANKS MEMORY. When the identity repair (repairIdentityAnchors → src/reading-repair.js
 *  repairSidecarsByApiPhase, its ② «THE CACHE SNAPSHOT») REPLACED, EMPTIED or STRIPPED the machine login's reading in the folder
 *  (its report's row for __global__), memory takes the folder's OWN state for it — the repaired reading, or none (an emptied
 *  file states no reading) — whatever the times say: the ingestion takes a folder reading only when it is NEWER, and a repaired
 *  one is older or undated, so the reading the repair judged another account's stood in the machine login's row (and, through
 *  the same-account merge, on the linked account's row) until a newer one came. The copy (the boot's seed) follows. Nothing else
 *  in the ingestion moves. */
const REPAIR_VERDICTS = new Set(['replaced', 'emptied', 'stripped']);
const repairedGlobal = (rep) => { const row = rep && Array.isArray(rep.identities) ? rep.identities.find((r) => r && r.key === '__global__') : null; return !!(row && REPAIR_VERDICTS.has(row.cache)); };
/** r2933 / r3016 — AFTER A VERDICT NO READER OF THAT MEMORY HOLDS THE JUDGED READING: an account the repair's report gives a
 *  verdict, every row the same-account merge put a reading on since that row's own dated file last spoke (the row the link names —
 *  also one holding an OLDER judged reading under another time, left there by a pass that could not decide the link, r3016), and
 *  any named account's row that holds the judged reading itself leave memory; the ingestion then takes each from its OWN dated
 *  folder file, or none, and the merge can no longer bring the judged reading back to either row or the copy. */
const _mergedRows = new Set();   // r3016: the rows the same-account merge wrote since their own file last spoke (ingestPassiveUsage)
function dropJudged(rep, judged) {
  for (const r of (rep && Array.isArray(rep.identities) ? rep.identities : [])) if (r && r.key && r.key !== '__global__' && REPAIR_VERDICTS.has(r.cache)) delete _accountUsage[r.key];
  if (_usageGlobalLink && _usageGlobalLink.accountId) delete _accountUsage[_usageGlobalLink.accountId];
  for (const id of _mergedRows) delete _accountUsage[id];
  _mergedRows.clear();
  const t = judged ? Number(judged.fetchedAt) : 0;
  if (t) for (const [id, row] of Object.entries(_accountUsage)) if (row && Number(row.fetchedAt) === t) delete _accountUsage[id];
}
/** memory takes the folder's OWN state for the machine login — the repaired reading, or none — read through its kept reply; the
 *  judged reading's readers leave memory (above); the copy follows through the store writer as every write of it does (r3016:
 *  nothing synchronous on the loop — a start judges the copy, judgedAway below) */
function takeFolderState(rep, judged) {
  let u = null; try { u = usageWrite.readCacheJson(path.join(USAGE_CACHE_DIR, '__global__.json'), { via: usageFolder.via }); } catch { u = null; }
  _rateLimitCache = u && typeof u.fetchedAt === 'number' ? u : null;
  dropJudged(rep, judged);
  writeUsageCache({ evenNone: true });
}
/** r3016 — AT A START THE COPY IS JUDGED AGAINST THE FOLDER'S OWN STATE. The identity repair stamps its instant on the file it
 *  repaired (`repairedAt`, src/reading-repair.js); a copy reading fetched at or before it that does not carry that stamp is one
 *  the repair's verdict took away (a kill before the copy's write landed leaves it on disk): it is not taken — memory takes the
 *  folder's state. A copy reading fetched after it came later and is taken as before. No reply yet: nothing to judge by — the
 *  first reply judges it (onReply below). */
let _copyUnjudged = false;
function judgedAway(reading) {
  if (!reading || !usageFolder.reply()) return false;
  let g = null; try { g = usageWrite.readCacheJson(path.join(USAGE_CACHE_DIR, '__global__.json'), { via: usageFolder.via }); } catch { return false; }
  const at = g ? Number(g.repairedAt) : 0;
  return at > 0 && Number(reading.fetchedAt) <= at && Number(reading.repairedAt) !== at;
}
function seedFromCopy(copy) {
  _rateLimitCache = copy;
  if (copy && !usageFolder.reply()) { _copyUnjudged = true; return; }
  if (judgedAway(copy)) takeFolderState(null, copy);
}
/** r3016 — A VERDICT IS NEVER LOST. It reads the folder's own state through the KEPT reply, held or not (a failed or hung refresh
 *  keeps the reply, and the repair's own write is already in it — the write path's notice, replace); only with NO reply at all
 *  (the boot's first fill failed) it is KEPT, and applied ONCE at the first reply (onReply below) — never a false «none». */
let _pendingVerdict = null;
function reloadRateLimitCache(rep = null) {
  if (repairedGlobal(rep)) {
    const all = _pendingVerdict ? { identities: [...(_pendingVerdict.identities || []), ...rep.identities] } : rep;
    if (!usageFolder.reply()) { _pendingVerdict = all; return; }
    _pendingVerdict = null;
    takeFolderState(all, _rateLimitCache);
    ingestPassiveUsage();
    return;
  }
  let owed = false; try { owed = require('./store-writer.js').storeWriter().pending(USAGE_CACHE_FILE); } catch { } if (!owed) seedFromCopy(readUsageCache()); ingestPassiveUsage();
}
function ingestPassiveUsage() {
  const allAccts = accounts.list().accounts || [];
  const roster = allAccts.filter((a) => oauthUsageAccount(a));
  // THE MACHINE LOGIN'S LINK DECIDES (B-360d, 主开发 r1221 — the timer row): it moves readings between the machine login and a
  // named account, so its emails are the DECISION road's (rows confirmed within the bound; the 30 s timer awaits the
  // confirmation). With no match while a row of that harness is not confirmed, NOTHING is decided this pass: the link keeps its
  // last decision and no merge runs. `roster` (the list) only names and shows.
  const dec = accounts.decisionList().accounts || [];
  const unsureOf = (rows) => rows.some((a) => a.facts && a.facts.state !== 'read');
  let linkUndecided = false;
  const subIds = new Set(roster.map((a) => a.id));
  for (const id of Object.keys(_accountUsage)) if (!subIds.has(id)) delete _accountUsage[id]; // drop removed accounts
  // Same-account link for CODEX: the machine's own ~/.codex login vs the named
  // ChatGPT accounts (cxs-*) — email from the id_token claims on both sides.
  try {
    const cst = accounts.codexGlobalStatus();
    const cem = cst.loggedIn && cst.email ? String(cst.email).toLowerCase() : null;
    const cx = dec.filter((a) => a.backend === 'codex' && a.type === 'subscription');
    const cm = cem ? cx.find((a) => a.email && String(a.email).toLowerCase() === cem) : null;
    _codexLinkUndecided = !!(cem && !cm && unsureOf(cx));
    // a KEPT link counts only while its address is the machine login's present one (a person signed the machine's codex in as
    // another identity: the old link names nobody now) — and an undecided pass merges nothing (summarizeCodexRateLimits)
    if (!_codexLinkUndecided) _codexUsageGlobalLink = { email: cst.email || null, loggedIn: !!cst.loggedIn, accountId: cm ? cm.id : null };
    else if (String(_codexUsageGlobalLink.email || '').toLowerCase() !== cem) _codexUsageGlobalLink = { email: cst.email || null, loggedIn: !!cst.loggedIn, accountId: null };
  } catch { _codexUsageGlobalLink = { email: null, loggedIn: false, accountId: null }; _codexLinkUndecided = false; }
  let entries = [];
  try { entries = usageWrite.listCacheDir(USAGE_CACHE_DIR, { via: usageFolder.via }); } catch { entries = []; }
  for (const fn of entries) {
    if (!fn.endsWith('.json')) continue;
    const key = fn.slice(0, -5);
    if (key === '__models__') { ingestPassiveModels(fn); continue; }
    let u = null;
    try { u = usageWrite.readCacheJson(path.join(USAGE_CACHE_DIR, fn), { via: usageFolder.via }); } catch { continue; }
    if (!u || typeof u.fetchedAt !== 'number') continue;
    // A RESET THE SHIPPED STATUSLINE'S OWN WRITE SHOWS (lane account-reset-door r2): it writes the file itself, so its reading is
    // compared HERE against the last one ingested — once a write (a file the write path wrote is compared there, never twice)
    try { const was = key === '__global__' ? _rateLimitCache : _accountUsage[key]; if (was && u.fetchedAt > (was.fetchedAt || 0)) usageWrite.noteDirectWrite(key, was, u, { cacheDir: USAGE_CACHE_DIR }); } catch { }
    // A CHANGE THE SHIPPED STATUSLINE SAW AND LEFT UNSAID (lane no-5h-window): its 5h window gone (or back) — the
    // write path says it once and clears the marker (a settle write: it measures nothing, moves no `fetchedAt`).
    if (u.windowChangeUnsaid) {
      try { const w = usageWrite.writeCacheObject({ cacheDir: USAGE_CACHE_DIR, key, obj: u, familyOf: familyOfScopedBucket, backend: 'claude' }); if (w.ok && w.object) u = w.object; } catch { }
    }
    if (key === '__global__') {
      // Newest wins vs whatever we have (a live global poll never runs now).
      if (!_rateLimitCache || (u.fetchedAt > (_rateLimitCache.fetchedAt || 0))) { _rateLimitCache = u; writeUsageCache(); }
    } else if (subIds.has(key)) {
      const meta = roster.find((x) => x.id === key) || {};
      _accountUsage[key] = { ...u, name: meta.name, email: meta.email }; _mergedRows.delete(key);   // its own file spoke (r3016)
    }
  }
  // Which NAMED claude subscription IS the machine's own ~/.claude login?
  // Computed AFTER the cache pass so org-uuid evidence (captured by on-demand
  // refreshes) is available. Evidence order:
  //   1. org uuid equality (token-derived truth — immune to the stale-config
  //      problem above); a PROVEN-different org also BREAKS an email match.
  //   2. email match (~/.claude.json oauthAccount vs account emails) — the
  //      original heuristic, still the only signal before any ⟳ was clicked.
  try {
    const st = accounts.subscriptionStatus();
    const em = st.loggedIn && st.email ? String(st.email).toLowerCase() : null;
    const droster = dec.filter((a) => oauthUsageAccount(a));
    const emailMatch = em ? droster.find((a) => a.email && String(a.email).toLowerCase() === em) : null;
    const gOrg = _rateLimitCache?.orgUuid || null;
    let m = emailMatch;
    if (gOrg) {
      const orgMatch = roster.find((a) => _accountUsage[a.id]?.orgUuid === gOrg) || null;
      if (orgMatch) m = orgMatch;
      else if (emailMatch && _accountUsage[emailMatch.id]?.orgUuid) m = null; // both identities known, different orgs
    }
    const actualEmail = _rateLimitCache?.orgEmail || null;
    linkUndecided = !m && !!em && !emailMatch && unsureOf(droster) && !(gOrg && roster.some((a) => _accountUsage[a.id]?.orgUuid === gOrg));
    // the same gate as codex: a KEPT link counts only while its address is the machine login's present one
    if (linkUndecided && String(_usageGlobalLink.email || '').toLowerCase() !== em) _usageGlobalLink = { email: st.email || null, loggedIn: !!st.loggedIn, accountId: null, actualEmail: null, identityMismatch: false };   // a fresh object: the old login's mismatch was judged against the old address
    if (!linkUndecided) _usageGlobalLink = {
      email: st.email || null, loggedIn: !!st.loggedIn, accountId: m ? m.id : null,
      // Stale-identity surfacing: what the token ACTUALLY belongs to, when the
      // on-demand refresh captured it and it contradicts the config file.
      actualEmail,
      identityMismatch: !!(actualEmail && st.email && actualEmail.toLowerCase() !== String(st.email).toLowerCase()),
    };
  } catch { _usageGlobalLink = { email: null, loggedIn: false, accountId: null, actualEmail: null, identityMismatch: false }; }
  // Same-account merge (see _usageGlobalLink above): freshest view wins for both — never on a link this pass could not decide
  const gid = linkUndecided ? null : _usageGlobalLink.accountId;
  if (gid) {
    const a = _accountUsage[gid] || null;
    const g = _rateLimitCache || null;
    const newest = (a && (!g || (a.fetchedAt || 0) > (g.fetchedAt || 0))) ? a : g;
    if (newest) {
      const meta = roster.find((x) => x.id === gid) || {};
      // a fresher sibling's 5h window never outranks a file's own «no 5h limit» (lane no-5h-window r4): the
      // tombstone is the file's, and only a reading written ON that file brings the window back
      if (newest !== g) {
        const { name, email, ...usage } = newest;
        _rateLimitCache = quotaModel.withOwnAbsence(usage, g); writeUsageCache();
      }
      _accountUsage[gid] = { ...quotaModel.withOwnAbsence(newest, a), name: meta.name, email: meta.email }; _mergedRows.add(gid);
    }
  }
}
// Merge PASSIVELY-discovered full model IDs (from the statusLine hook — models
// you actually ran) into the Claude dropdown, after the hardcoded aliases and
// deduped by id. Zero API calls; this is the passive counterpart to the
// (now opt-in) /v1/models fetch.
function ingestPassiveModels(fn) {
  let list = [];
  try { list = usageWrite.readCacheJson(path.join(USAGE_CACHE_DIR, fn), { via: usageFolder.via }); } catch { return; }
  if (!Array.isArray(list) || !list.length) return;
  const have = new Set((AVAILABLE_MODELS.claude || []).map((m) => m.id));
  const add = list.filter((m) => m && typeof m.id === 'string' && !have.has(m.id))
                  .map((m) => ({ id: m.id, label: m.label || m.id }));
  if (add.length) AVAILABLE_MODELS.claude = [...(AVAILABLE_MODELS.claude || []), ...add];
}
seedFromCopy(_rateLimitCache);   // r3016: the copy read at the module's start, judged against the folder's own state
ingestPassiveUsage();   // the boot's ingestion, over the folder's first fill (the boot's one synchronous pass)
// r3016: the first reply after none — a verdict kept for it is applied ONCE, a copy taken unjudged is judged; registered BEFORE
// the ingestion's listener (the reader calls its listeners in the order they were added), so that reply's ingestion follows it
usageFolder.onReply(() => {
  if (_pendingVerdict) { const rep = _pendingVerdict; _pendingVerdict = null; _copyUnjudged = false; takeFolderState(rep, _rateLimitCache); }
  else if (_copyUnjudged) { _copyUnjudged = false; if (judgedAway(_rateLimitCache)) takeFolderState(null, _rateLimitCache); }
});
usageFolder.onReply(() => ingestPassiveUsage());   // ONE CLOCK (B-360d U3): every reply a refresh brings runs the ingestion
// B-360d: the timer pass decides the machine login's link on sign-in facts confirmed OFF the loop first (awaited, bounded) —
// then the folder's refresh (fs.promises, at most one in flight; a read not replying past its period is said held), whose reply
// runs the ingestion: the ONE 30-s clock of the usage folder (src/usage-cache-folder.js)
// r1976 (c): while the folder is HELD (its read failed or has not replied) no reply comes — the pass runs the ingestion over the KEPT
// reply itself, so its memory-only work goes on (removed accounts dropped, the machine login's link decided again on confirmed facts)
const ingestConfirmed = () => accounts.signinFactsSettled().catch(() => null).then(() => { try { usageFolder.tick(); if (usageFolder.state().held) ingestPassiveUsage(); } catch { } });
ingestConfirmed();
setInterval(ingestConfirmed, 30000); // the folder read off the loop — no network
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
// Remote-host quota snapshots (2.127.0): keyed by host id, persisted to
// usage-cache/host-<id>.json by the on-demand ⟳ (read-only remote token —
// never refreshed, §ban-safety; no scheduler anywhere near this).
const _hostUsage = {};
// Host-HELD account quota snapshots (2.245.0): '<hostId>:<acctId>' → snapshot,
// persisted as usage-cache/host-<hostId>-<acctId>.json. Account ids are
// strictly sub-[\w-]+ (validated at write), so the host-account pattern is
// checked FIRST — the plain host pattern would otherwise swallow these files
// and pollute _hostUsage with bogus host keys.
const _hostAcctUsage = {};
// B-ff9d: a host-held file written before 2.369.412 stamped its read 'on-demand' (this hub's own panel). Every 'on-demand' in such a
// file — at the top or on a limit a later merge kept — was one of the two held legs' reads, so it is read as 'on-demand-held'. A
// NORMALISER AT LOAD, not a migration: nothing is written; the file keeps its bytes until its next write
const heldSource = (snap) => { if (snap && typeof snap === 'object') { if (snap.source === 'on-demand') snap.source = 'on-demand-held'; if (Array.isArray(snap.limits)) for (const l of snap.limits) if (l && l.source === 'on-demand') l.source = 'on-demand-held'; } return snap; };
try {
  for (const f of usageWrite.listCacheDir(USAGE_CACHE_DIR, { via: usageFolder.via })) {
    const ma = /^host-([\w-]+)-(sub-[\w-]+)\.json$/.exec(f);
    if (ma) { try { _hostAcctUsage[ma[1] + ':' + ma[2]] = heldSource(usageWrite.readCacheJson(path.join(USAGE_CACHE_DIR, f), { via: usageFolder.via })); } catch {} continue; }
    const m = /^host-([\w-]+)\.json$/.exec(f);
    if (m) { try { _hostUsage[m[1]] = usageWrite.readCacheJson(path.join(USAGE_CACHE_DIR, f), { via: usageFolder.via }); } catch {} }
  }
} catch {}
// Ledger harvest from remote hosts (ssh, incremental via remote-side cursors).
// One at a time per server; throttling lives in hosts.harvestUsage (15min).
// TIMESTAMPED LEASE, not a boolean (2.271.0 T1-5): a hung device stream used
// to leave _harvestBusy true forever, so every later harvest answered
// {busy:true} until a server restart — remote usage collection silently died
// fleet-wide after ONE link flap. The lease expires; the underlying op is
// bounded too (runStream now settles on link death).
let _harvestLease = 0;
const HARVEST_LEASE_MS = 5 * 60 * 1000;
app.post('/api/usage-stats/harvest-hosts', async (req, res) => {
  if (!hosts || !usageHistory) return res.json({ hosts: {} });
  if (Date.now() - _harvestLease < HARVEST_LEASE_MS) return res.json({ busy: true });
  _harvestLease = Date.now();
  const out = {};
  try {
    const scannerPath = path.join(path.dirname(USAGE_CACHE_DIR), 'bin', 'vibespace-usage-scan');
    const want = req.body?.host ? [req.body.host] : hosts.list().map((h) => h.id);
    for (const id of want) {
      try {
        out[id] = await hosts.harvestUsage(id, { force: !!req.body?.force, scannerPath, ledger: usageHistory }); // lane ledger-dedup-law F2: {added, appended, duplicates, since} | {added: 0, throttled}
      } catch (e) { out[id] = { error: String(e.message || e).slice(0, 160) }; }
    }
  } finally { _harvestLease = 0; }
  res.json({ hosts: out });
});

// The CLI-panel refresher, callable from the route AND the auto-cli loop
// (2.329.0). One spawn = one first-party `/usage` fetch by the official
// binary; writes the same per-account cache the statusline hook uses. Returns
// true when a parseable panel landed.
//
// ATTRIBUTION (2026-09-07, the readings-by-slot rule for a SESSION-LESS
// reading): this reading has no session, so there is no credential slot to
// resolve — its identity IS the config dir the spawn was given. `key` and
// `CLAUDE_SECURESTORAGE_CONFIG_DIR` are therefore ONE decision, made once into
// `credsDir` below and used for both the spawn and the write-back, rather than
// derived twice and compared (a check that cannot fail is not protection —
// making it structurally impossible is). Every other producer now follows the
// same rule the hard way (readingSlotFor); this one gets it for free.
// ── THE PROBE MAY ONLY WRITE THE ACCOUNT IT PROVES (B-855a, 2026-09-17) ──────
// MEASURED on the installed CLI (2.1.274 binary, the config-path helpers read
// out of it): the credential store is `${CLAUDE_SECURESTORAGE_CONFIG_DIR ??
// CLAUDE_CONFIG_DIR ?? ~/.claude}/.credentials.json`, but the ORG CONTEXT —
// `oauthAccount`, which keys the CLI's usage fetch and rides every API call as
// `x-organization-uuid` — is read from `${CLAUDE_CONFIG_DIR || $HOME}/.claude.json`.
// So a spawn that relocated ONLY the secret store took its identity from the
// MACHINE-WIDE ~/.claude.json, which every session's CLI rewrites: the panel
// for account X answered with whichever org's CLI wrote that file last
// (quantified 2026-09-17: 15 of 50 panel reads on the busiest member foreign).
// The CLI's own --debug log then showed the exact path (owner-debugged, 14:35
// PDT): `-p /usage` fetches with the handed token and, when that fetch fails
// IN-BAND (200 + a fieldless body — it tracks probe pressure), SEEDS the panel
// from the config dir's persisted `cachedUsageUtilization` — the last account
// any live session fetched — with no marker. An isolated config dir makes that
// fallback the account's OWN previous fetch; a failed first fetch prints nothing.
// Two halves, both needed:
//   (a) ISOLATION — the probe runs under its own CLAUDE_CONFIG_DIR, a scratch
//       dir UNDER the account's creds dir, re-seeded before every spawn with
//       ONLY that account's own oauthAccount (+ the onboarding flags the login
//       seed writes). ~/.claude.json is never read and never written by it.
//   (b) VERIFICATION BEFORE ANY WRITE — the panel is compared against TWO
//       witnesses it did not produce: the org the CLI reports (the seeded
//       value is OUR statement and counts for nothing; only a CHANGE the CLI
//       made to it, or an org the panel prints, is evidence) and the weekly
//       PHASE of the account's API-DERIVED window (`apiDerivedWindow`: the
//       newest slot-verified rate_limit_event, ±120 s like weeklyNear). A
//       'differ' on either ⇒ nothing is written, the sidecar is not stamped,
//       the reading is archived naming both identities, and the caller backs
//       off. No evidence ⇒ written as asked (a guard with no evidence must not
//       delete data) but NOT marked verified — 'unknown' is never spelled yes.
const READING_ARCHIVE = path.join(path.dirname(USAGE_CACHE_DIR), 'archive', 'readings-window-mismatch.ndjson');
const _panelVerdict = {};            // key → the last probe's {at, outcome, identityVerified, why, rung} for the route's answer
// A FAILED PROBE NAMES ITS REASON WHERE THE OWNER LOOKS (lane auto-cli-oat-unprobeable): every verdict of this door goes
// through here, and the account RECORD keeps the last failed one — `probe: {at, ok: false, why}` (accounts.noteProbe, the
// one atomic writer) — until its next written answer drops it; the row's age chip says it. The why is scrubbed once here
// (probeWhyText: bounded, secret-shapes-redacted). An oat-only refusal is not a failed probe (the loop never sends one;
// the row says why already), a removed account has no record, and `__global__` is no account.
function panelSays(key, v) {
  _panelVerdict[key] = v;
  if (key === '__global__' || !v || v.code === 'login' || v.code === 'unprobeable' || v.code === 'sign-in-unknown' || DOOR_CODES.includes(v.code)) return v;   // B-5279 (r4932 M1): + the door's refusals — nothing was asked // the door's refusal is no failed probe either (acceptance r2; B-360d: a sign-in not read asked nothing)
  try {
    if (v.outcome === 'written') accounts.noteProbe?.(key, null);
    else accounts.noteProbe?.(key, { at: v.at, ok: false, why: probeWhyText(v.why) || v.outcome });
  } catch { } // an account removed meanwhile — nothing to keep
  return v;
}
const _panelVerdictSaid = new Map(); // key → the verdict class last journaled (one line per transition)
const acctNameOf = (id) => { try { return (accounts.list().accounts || []).find((x) => x.id === id)?.name || id; } catch { return id; } };
// B-6a92 r7: the held accounts by LABEL in a sentence a person reads — the machine's own login by what it is, a name holding «@»
// (an address) or no name: «another account»
// B-6a92 follow (主开发 r1034): a ROW's own label in a sentence a person reads — never an address: a name holding «@», or none, reads «this account»
const rowLabel = (key) => { const n = acctNameOf(key); return typeof n === 'string' && n && n !== key && !n.includes('@') ? n : 'this account'; };
const heldWho = (ids) => ids.map((id) => { if (id === '__global__') return "this machine's own login (CLI login)"; const n = acctNameOf(id); return typeof n === 'string' && n && n !== id && !n.includes('@') ? n : 'another account'; }).join(', ');
// B-6a92 r8 (主开发 r873 item 4): EVERY REFUSAL OF THE HELD ROW'S DOOR, by the verdict's code — the sentence and its remedy, which
// is the remedy column of reading-lag HELD_REFUSALS (all four: sign the row in again with its own account → its next read is its
// own proven read). Rows by LABEL; no identity value ever.
const heldRefusalWords = (code, key, names) => {
  const me = rowLabel(key), them = heldWho(names);
  const remedy = `sign ${me} in again with its own account — its next own read then proves its window`;
  if (code === 'signed-in-as') return `${me}'s sign-in folder is signed in as ${them}: this read answered as ${them}, which proves nothing about ${me}'s own window — ${remedy}`;
  if (code === 'other-answered') return `${me}'s sign-in folder is signed in as an account that is not ${me}'s own (by its record): this read proves nothing about ${me}'s window (its readings name ${them}'s) — ${remedy}`;
  if (code === 'answer-unnamed') return `this read answered in ${them}'s weekly window, but ${me}'s sign-in folder names no login, so whose read it was cannot be told — ${remedy} (the sign-in records its login)`;
  if (code === 'cannot-tell') return `this read answered in ${them}'s weekly window, but the login that answered does not carry what ${me} is known by on file (its organisation or its address), so whose read it was cannot be told — ${remedy} (the sign-in records both)`;
  return `this read answered in ${them}'s weekly window, but nothing on file names which account ${me} is, so it cannot prove ${me}'s window — ${remedy} (the sign-in records which account it is)`;
};
/** Re-seed the account's isolated probe config dir: the onboarding flags the
 *  login seed writes + the account's OWN oauthAccount, nothing else. */
function seedProbeConfigDir(credsDir, probeConfigDir) {
  const seed = { hasCompletedOnboarding: true, hasTrustDialogAccepted: true, theme: 'dark' };
  try {
    const own = JSON.parse(fs.readFileSync(path.join(credsDir, '.claude.json'), 'utf-8'));
    if (own && own.oauthAccount && typeof own.oauthAccount === 'object') seed.oauthAccount = own.oauthAccount;
    if (own && own.theme) seed.theme = own.theme;
  } catch { }
  fs.mkdirSync(probeConfigDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(probeConfigDir, '.claude.json'), JSON.stringify(seed), { mode: 0o600 });
  // the empty working dir inside it is spawnPanelProbe's (the one isolation site)
}
/** The identity verdict on one parsed panel. `expected` = the account's own
 *  login identity, `before`/`after` = the isolated config dir's oauthAccount
 *  around the spawn, `apiWin` = the account's API-derived window. */
function panelIdentityVerdict({ key, cliPanel, expected, before, after, apiWin, windows, ring = [], ringK = 3, sameIdentity = null, held = null }) {
  const { windowOf, compareWindows, windowFingerprint, weeklyNear } = require('./reading-lag.js');
  const panelWindow = windowOf(cliPanel);
  const low = (v) => (v == null ? null : String(v).toLowerCase());
  // the org the CLI REPORTED: printed in the panel, or rewritten by the CLI in
  // the isolated dir (a value that merely survived our seed is not evidence)
  const changed = after && before && (low(after.orgUuid) !== low(before.orgUuid) || low(after.email) !== low(before.email)) ? after : (after && !before ? after : null);
  const panelIdent = { orgUuid: cliPanel.orgUuid || (changed && changed.orgUuid) || null, email: cliPanel.orgEmail || cliPanel.email || (changed && changed.email) || null };
  let org = 'unknown';
  if (expected && expected.orgUuid && panelIdent.orgUuid) org = low(expected.orgUuid) === low(panelIdent.orgUuid) ? 'agree' : 'differ';
  else if (expected && expected.email && panelIdent.email) org = low(expected.email) === low(panelIdent.email) ? 'agree' : 'differ';
  const phase = apiWin ? compareWindows(panelWindow, apiWin) : 'unknown';
  // WHO ELSE the panel's window could belong to: every OTHER account (an
  // org-merged login's own group excluded) whose established window agrees
  // with it — names both identities on a refusal, and on an agreement says
  // the phase is SHARED and therefore not identifying
  const matched = [];
  const mine = new Set([key, ...((typeof sameIdentity === 'function' && sameIdentity(key)) || [])]);
  try { for (const [id, w] of Object.entries(windows || {})) if (!mine.has(id) && compareWindows(panelWindow, w) === 'agree') matched.push(id); } catch { }
  const refused = org === 'differ' || phase === 'differ';
  // A SHARED PHASE VERIFIES NOTHING (final verifier): four members on this
  // instance share one weekly phase, and the production panel prints no org,
  // so a same-phase foreign panel would have been written AND reported as
  // verified. The org is identifying; the phase only when nobody else has it.
  const shared = phase === 'agree' && matched.length > 0;
  const verified = !refused && (org === 'agree' || (phase === 'agree' && !shared));
  // THE WINDOW MAY HAVE MOVED (final verifier): a phase refusal where the
  // account's OWN recent API candidates already share the panel's window is
  // most likely a genuine move (a plan change) still short of the K-run that
  // re-anchors it — said so, with the count, instead of a bare "not yours".
  const ringAgree = phase === 'differ' ? (ring || []).filter((e) => e && weeklyNear(e.resetsAt, panelWindow.sevenDay || Object.values(panelWindow.scoped || {})[0]) === true).length : 0;
  const movedLikely = ringAgree > 0;
  // B-6a92 r9 (主开发 r975, ALSO CURED — older than the unit, the tree's own rule): the words name rows by their LABEL only — never
  // an organisation id or an address (a label holding «@» reads «this account» / «another account»)
  const me = rowLabel(key);
  const foreign = matched.length ? heldWho(matched) : (panelIdent.orgUuid || panelIdent.email ? 'another login' : `an account with weekly window ${windowFingerprint(panelWindow)}`);
  let why;
  if (org === 'differ') why = `the /usage panel for ${me} answered for ${foreign} — the login it reported names another organisation or address than ${me}'s own login`;
  else if (phase === 'differ') why = `the /usage panel for ${me} answered with ${foreign}'s weekly window (${windowFingerprint(panelWindow)}), not ${me}'s own API-derived window (${windowFingerprint(apiWin)} — rate-limit events on a verified slot)`
    // B-6a92 r5: WHILE A HOLD STANDS no run of readings re-anchors the row (they name another known account's window) — the
    // sentence says the one road that does: the row's own read answering in a window
    + (held && Array.isArray(held.names) && held.names.length
      ? ` — ${me}'s own weekly window is unknown: its readings name ${heldWho(held.names)}'s window, and no run of them re-anchors it; ${me}'s own /usage read proves its window when the login that answers is ${me}'s own account (by its record)`
      : movedLikely ? ` — but ${ringAgree} of ${me}'s own last ${ring.length} API readings share the panel's window: ${me}'s weekly window may have MOVED; ${ringK} consecutive agreeing readings re-anchor it automatically (or run the identity repair)` : '');
  else if (verified) why = org === 'agree' ? `panel org matches ${me}'s own login` : `panel weekly window matches ${me}'s API-derived window (${windowFingerprint(apiWin)})`;
  else if (shared) why = `panel weekly window matches ${me}'s API-derived window (${windowFingerprint(apiWin)}) but that phase is shared with ${heldWho(matched)} — not identifying; the panel names no org`;
  else why = `no identity evidence to compare for ${me} (no API-derived window yet; the panel names no org)`;
  return { refused, verified, shared, movedLikely, org, phase, why, expected: expected || null, panel: panelIdent, matched, panelWindow, apiWindow: apiWin || null };
}
async function refreshViaCliPanel(key) {
  // THE FENCE, ASKED FIRST (B-5279): the door's own verdict — under Off no account folder is read, no probe dir is seeded, and
  // the read is recorded as NOT PROBED with the door's code: no failed probe, no serve failure, no backoff, no «re-login» word
  { const no = panelDoorRefusal(serverSetting); if (no) { panelSays(key, { at: Date.now(), outcome: 'not-probed', code: no.code, identityVerified: false, why: no.message, rung: 'panel' }); return false; } }
  const isGlobal = key === '__global__';
  let acctMeta = null;
  if (!isGlobal) {
    // A PERSON'S ⟳ OR THE TICK'S PICK DECIDES A SPAWN (B-360d, 主开发 r1221): the account's sign-in read NOW, off the loop (awaited,
    // bounded by the file door's deadline), and the decision road's row decides; a sign-in that could not be read is refused by
    // name — no spawn, no failed probe booked, never «re-login»
    const { since } = await accounts.signinFactsNow([key]);   // THIS account's folder only, bounded (a person's act)
    acctMeta = accounts.decisionRowOf(key, { since });
    if (!acctMeta || acctMeta.type !== 'subscription') return false;
    if (probeEligibility(acctMeta) === SIGNIN_UNKNOWN) {
      const fr = (acctMeta.facts && acctMeta.facts.reason) || null;
      panelSays(key, { at: Date.now(), outcome: 'not-probed', code: 'sign-in-unknown', el: SIGNIN_UNKNOWN, identityVerified: false, why: `the account's sign-in could not be read${fr ? ` (${fr})` : ''}; nothing was asked`, rung: 'panel' });
      return false;
    }
    // OAT-ONLY (2026-10-13): the OAuth login ended and the row lives on its long-lived token. The ONE door for ⟳ and
    // auto-cli alike asks the verdict the loop and the row read (src/auto-cli-model.js probeEligibility, lane
    // auto-cli-oat-unprobeable + its addendum): a token with user:profile, on a CLI measured with it in the folder, and
    // written there, IS probed — the same spawn below reads the folder's token (CLAUDE_SECURESTORAGE_CONFIG_DIR; the env
    // token is stripped as ever); any other oat-only row is refused by name with no spawn (re-login is the fix).
    // THE LOOP'S ELIGIBILITY, WHOLE (lane pool-silent-members R3, inc-mvsjhna7 12:58:18 PT): 90c995a3 refused only an
    // oat-only row, so a row the loop already called `unprobeable:no-login` (its folder empty) was spawned anyway — the CLI
    // printed its non-subscriber cost summary and the row booked it as a parse failure. ONE predicate for ⟳ and the loop.
    // …AND A REFUSAL HERE SKIPS ONLY THE PANEL'S SPAWN (acceptance r2): the route still tries its token ladder's
    // same-account (2.181.0) and identity-group (2.266.1) fallbacks — a folder-token row or an empty folder whose
    // account the machine's own login (or a live sibling) serves was refreshed there on 90c995a3 — and refuses by name
    // only what the ladder cannot serve either (code 'unprobeable', the remedy the row's own state names)
    const el = probeEligibility(acctMeta);
    if (isUnprobeable(el)) {
      const oat = acctMeta.loginState && acctMeta.loginState.state === 'oat-only';
      // ONE FACT, ONE SENTENCE (acceptance r3, F2): a token the LOCKED vault keeps is told as the roster and the gather
      // tell it — the vault is the wall, never the login (9d53db09 and b552c972 said «re-login» here)
      // A WALL IS NAMED BY WHAT IS TRUE NOW (lane account-reset-door): the POOL's own verdict (accounts.placeWallOf — a CLI not measured is asked before the vault; a fact recorded while locked ends at the unlock), sent as `wall`
      let wall = null; try { wall = typeof accounts.placeWallOf === 'function' ? accounts.placeWallOf(key) : null; } catch { wall = null; } const rowVault = !!(acctMeta.oatFile && acctMeta.oatFile.code === 'vault_locked'), rowDoor = el === OAT_FOLDER_NO_PANEL ? null : rowVault ? 'unlock' : 'relogin', poolDoor = wall ? wallDoor(wall) : rowDoor; // the pool's cause first; none ⇒ the row's (both from the sweep's facts, which the unlock clears)
      const vaultLocked = wall ? wall.code === 'vault-locked' : rowVault, folderToken = poolDoor !== 'relogin', poolWords = !!wall && poolDoor !== rowDoor; // THE POOL'S CAUSE DECIDES THE WHOLE ANSWER (r2): its code, `loginNeeded` only where its door is a login, and its sentence wherever its door is not the row's
      panelSays(key, { at: Date.now(), outcome: folderToken ? 'not-probed' : 'login-needed', code: 'unprobeable', el, ...(vaultLocked ? { wall: 'vault-locked' } : {}), ...(wall ? { wallWhy: wall } : {}), identityVerified: false, why: poolWords ? unplaceableText(wall) : vaultLocked ? unplaceableText({ code: 'vault-locked' }) : folderToken ? `not probed (${el}: ${notProbedWords(el, acctMeta)})` : oat ? `the OAuth login ended and the long-lived token cannot be probed (${el}: ${notProbedWords(el, acctMeta)}); re-login to refresh usage` : `not probed (${el}: ${notProbedWords(el, acctMeta)}) — re-login to refresh usage`, rung: 'panel' });
      return false;
    }
  }
  // THE RAW LOG (2.369.109, owner): what was sent, what came back verbatim,
  // what the parser made of it and what the write did — one line per probe in
  // data/usage-probe-log.ndjson (src/server/usage-probe-log.js), so a foreign
  // panel can be diffed against its parse and its store without re-probing.
  // credsDir = the identity this reading WILL be keyed by (see above) — derived
  // ONCE (test-readings-attribution §7: a second derivation is how the key
  // and the spawn could ever disagree), used by the spawn and the log alike.
  const credsDir = isGlobal ? null : accounts.subDir(key);
  // (a) the isolated org context: a scratch dir UNDER the creds dir (one
  // derivation — from credsDir, never a second subDir lookup), re-seeded now
  const probeConfigDir = credsDir ? path.join(credsDir, '.probe-config') : null;
  const probeCwd = probeCwdOf(probeConfigDir); // where spawnPanelProbe runs it (recorded, never passed): __global__ has no account dir to isolate into
  const expected = probeLog.loginOfAccount(isGlobal ? '__global__' : key, { dir: credsDir });   // THE login of this name (B-6a92 r7: the one reader)
  const probeRec = { rung: 'panel', key, name: isGlobal ? '__global__' : (acctMeta.name || key), credsDir, configDir: probeConfigDir, cwd: probeCwd, argv: null, machineOrgBefore: probeLog.machineOauthAccount(), machineOrgAfter: null, configOrgBefore: null, configOrgAfter: null, exitCode: null, ms: null, rawStdout: null, rawStderr: null, parsed: null, identity: null, identityVerified: null, outcome: null, why: null };
  const logProbe = (outcome, extra) => { try { probeLog.appendProbeLog(path.dirname(USAGE_CACHE_DIR), { ...probeRec, outcome, ...(extra || {}) }); } catch { } };
  if (probeConfigDir) {
    try { seedProbeConfigDir(credsDir, probeConfigDir); probeRec.configOrgBefore = probeLog.machineOauthAccount(probeConfigDir); }
    catch (e) {
      // a probe that cannot be isolated is not run: it would answer for whichever org wrote ~/.claude.json last
      probeRec.why = 'could not seed the isolated config dir: ' + (e && e.message);
      logProbe('spawn-failed');
      panelSays(key, { at: Date.now(), outcome: 'spawn-failed', code: 'spawn', identityVerified: false, why: probeRec.why, rung: 'panel' });
      return false;
    }
  }
  const cliPanel = await new Promise((resolve) => {
    try {
      const env = require('./agent-env.js').agentEnv(process.env);   // r2271: a built env, never the hub's whole one (no VIBESPACE_* knob or credential of the hub's)
      delete env.ANTHROPIC_API_KEY; delete env.CLAUDE_CODE_OAUTH_TOKEN; delete env.CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR;
      // the secret store relocates (session-spawn parity); the org context and
      // the cwd are isolated by spawnPanelProbe from the root (B-855a): the
      // token is the identity, and the CLI must read THIS account's
      // oauthAccount for it — never the machine-wide file
      if (credsDir) env.CLAUDE_SECURESTORAGE_CONFIG_DIR = credsDir;
      const bin = (cliCmds && typeof cliCmds.current === 'function' && cliCmds.current('claude')) || CLAUDE_CMD || 'claude'; // THE accessor (lane cli-shell-truth r2)
      probeRec.argv = [bin, ...PANEL_PROBE_ARGS];
      const t0 = Date.now();
      spawnPanelProbe(bin, { root: probeConfigDir, env, setting: serverSetting }, (err, stdout, stderr) => {
        if (err && err.refusedByRow) { probeRec.refused = err.code; probeRec.refusedWhy = err.message; return resolve(null); }   // the row turned off (or the settings became held) after the read's own ask (B-5279)
        probeRec.ms = Date.now() - t0;
        probeRec.exitCode = err ? (typeof err.code === 'number' ? err.code : (err.killed ? 'killed' : String(err.code || err.signal || 'error'))) : 0;
        probeRec.rawStdout = stdout == null ? '' : String(stdout);
        probeRec.rawStderr = stderr == null ? '' : String(stderr);
        probeRec.machineOrgAfter = probeLog.machineOauthAccount();
        if (probeConfigDir) probeRec.configOrgAfter = probeLog.machineOauthAccount(probeConfigDir);
        if (err) return resolve(null);
        let parsed = null; try { parsed = parseCliUsageText(stdout); } catch (e) { probeRec.why = 'parse threw: ' + (e && e.message); }
        probeRec.parsed = parsed;
        resolve(parsed);
      });
    } catch (e) { probeRec.why = 'spawn threw: ' + (e && e.message); resolve(null); }
  });
  if (probeRec.refused) { panelSays(key, { at: Date.now(), outcome: 'not-probed', code: probeRec.refused, identityVerified: false, why: probeRec.refusedWhy || 'nothing was started', rung: 'panel' }); return false; }   // B-5279: nothing booked
  if (!(cliPanel && (cliPanel.fiveHour || cliPanel.sevenDay))) {
    // A LAPSED SUBSCRIPTION answers this probe with the CLI's lapse sentence (2026-10-08): handed to the engine, whose
    // harness census decides — a lapse opens the episode or only moves `lastFail`; any other answer changes nothing
    if (!isGlobal) { try { app.locals.noteMemberServeFailure?.(key, { message: `${probeRec.rawStdout || ''}\n${probeRec.rawStderr || ''}` }); } catch { } }
    // …and the failure SAYS WHY (lane auto-cli-oat-unprobeable): the class (`exit` — the CLI failed / `parse` — it answered
    // without a quota line) + the CLI's first line, scrubbed (probeFailWhy → probeWhyText). The ⟳ route's ladder is unchanged:
    // it stops only on `login` / `identity` / `write`, so these two codes fall through to the token rungs exactly as before.
    // …and an answer with no quota line is CLASSED by what the CLI said (R3): the non-subscriber cost summary = no login in
    // the folder (code `login`: nothing to fall through to); the bare subscription header = a folder-token login the panel
    // prints nothing for (code `folder-token`) — never «parse» (no parser drifted: 85/85 live logins parsed that day)
    const folderToken = !!(acctMeta && acctMeta.loginState && acctMeta.loginState.oatFile === true);
    const cls = probeRec.exitCode === 0 ? panelAnswerClass({ ...probeRec, folderToken }) : null;
    const hubCli = (() => { try { return accounts.oatFileCaps().cli; } catch { return null; } })();
    const failWhy = probeFailWhy({ ...probeRec, cli: hubCli, folderToken });
    if (cls) probeRec.why = failWhy; // the raw log names the class too
    panelSays(key, { at: Date.now(), outcome: cls === 'no-login' ? 'login-needed' : probeRec.exitCode === 0 ? 'no-buckets-parsed' : 'spawn-failed', code: cls === 'no-login' ? 'login' : cls === 'folder-token' ? 'folder-token' : probeRec.exitCode === 0 ? 'parse' : 'exit', identityVerified: false, why: failWhy, rung: 'panel' });
    logProbe(probeRec.exitCode === 0 ? 'no-buckets-parsed' : 'spawn-failed'); return false;
  }
  // THE ROSTER IS ASKED AGAIN AT THE WRITE, NOT ONLY AT THE SPAWN (r3, the
  // auto-merge finding's belt). This function's only roster check happens
  // before a 60-second `execFile`, and a record CAN stop existing inside that
  // window — the subscription auto-merge deletes the throwaway milliseconds
  // after the login edge, and a removed account is a normal user action too.
  // Nothing in accounts.js or the routes deletes usage-cache entries when an
  // account goes away, and `establishedWindows()` reads every `.json` in that
  // directory with no roster filter, so a write here would leave a cache file
  // AND a window sidecar keyed to an id that no longer names anything. FALSE,
  // not true: no reading was recorded, and the caller's backoff is the right
  // response to a panel whose subject vanished.
  if (!isGlobal && !(accounts.list().accounts || []).some((x) => x.id === key)) {
    if (typeof accounts.held === 'function' && accounts.held()) console.log(`[usage] the /usage panel for ${key} answered while the accounts list could not be read — the reading is not filed`);   // r3044 (5)
    else console.log(`[usage] the /usage panel for ${key} answered after the account was removed — discarding the reading`);
    logProbe('account-removed');
    return false;
  }
  _onDemandUsageAt[key] = Date.now();
  // (b) IDENTITY VERIFICATION BEFORE ANY WRITE (B-855a). The vendor made the
  // fetch; whether the answer is THIS account's is decided here, against
  // witnesses the panel did not write, and a refusal writes nothing at all.
  let idv = null;
  try {
    const wit = (typeof apiDerivedWindow === 'function') ? apiDerivedWindow(key, { witness: true }) : null; // {window, ring, k} — or a bare window from an older dep
    const apiWin = wit && typeof wit === 'object' && ('window' in wit) ? wit.window : wit;
    idv = panelIdentityVerdict({ key, cliPanel, expected, before: probeRec.configOrgBefore, after: probeRec.configOrgAfter,
      apiWin, ring: (wit && Array.isArray(wit.ring)) ? wit.ring : [], ringK: (wit && wit.k) || 3,
      sameIdentity: (typeof app.locals.usageIdentityAccountIds === 'function') ? app.locals.usageIdentityAccountIds : null,
      windows: (typeof establishedWindows === 'function') ? establishedWindows() : {}, held: (wit && wit.foreign) || null });
  } catch (e) { console.warn('[usage] panel identity check failed (writing as asked, unverified):', e.message); idv = { refused: false, verified: false, why: 'identity check failed: ' + e.message, panel: null, expected: expected || null, matched: [] }; }
  // A RENEWED SUBSCRIPTION (verify r1 ③): a lapsed member's panel refused on its PRE-LAPSE window alone (no other account
  // holds the panel's window, the org does not differ) re-anchors the window on this answer and is written as verified
  if (idv && idv.refused && !isGlobal && typeof app.locals.reanchorLapsedMember === 'function' && app.locals.reanchorLapsedMember(key, idv)) {
    idv = { ...idv, refused: false, verified: true, why: `${rowLabel(key)} was lapsed and answered with a new weekly window no other account holds — re-anchored (a renewal)` };
  }
  // B-6a92 r5 (主开发 r677, ruled in 1): A HELD ROW'S OWN READ IS ITS DOOR — this panel is the row's OWN credential (isolated);
  // answering in the window its readings were held on (an honest shared window) it is the row's proven read: the hold ends,
  // the window is stamped there and the numbers below are written as verified; verified on its own window, the hold ends too
  if (idv && !isGlobal && typeof app.locals.liftHeldWindow === 'function') {
    // r8 (主开发 r873): the engine executes ONE PURE VERDICT (reading-lag heldLiftVerdict) — here only its act becomes the answer
    const lift = app.locals.liftHeldWindow(key, idv);
    if (lift && lift.act === 'lift') idv = { ...idv, refused: false, verified: true, verifiedBy: 'own-panel', why: `${rowLabel(key)}'s own /usage read answered in the weekly window its readings were held on — its own read proves it: stamped there, the hold ended` };
    else if (lift && lift.act === 'refuse') idv = { ...idv, refused: true, verified: false, why: heldRefusalWords(lift.code, key, lift.names || []) };
  }
  probeRec.identity = { org: idv.org || null, phase: idv.phase || null, matched: idv.matched, shared: !!idv.shared, movedLikely: !!idv.movedLikely, apiWindow: idv.apiWindow || null };   // r9: the verdict, never the two identities it compared
  probeRec.identityVerified = idv.verified;
  if (idv.refused) {
    const cls = `refused:${idv.org}/${idv.phase}`;
    if (_panelVerdictSaid.get(key) !== cls) { _panelVerdictSaid.set(key, cls); console.log(`[usage] panel-identity: refusing to write ${acctNameOf(key)} — ${idv.why} — archived`); }
    global.__vsEvent?.('usage-probe-identity-refused', `${key}:${idv.org}/${idv.phase}`);
    try {
      fs.mkdirSync(path.dirname(READING_ARCHIVE), { recursive: true });
      fs.appendFileSync(READING_ARCHIVE, JSON.stringify({ at: Date.now(), store: 'usage-cache', key, sid: null, what: 'panel-identity', reason: idv.why, matched: idv.matched, ownWindow: idv.apiWindow || null, identity: { org: idv.org, phase: idv.phase }, entry: cliPanel }) + '\n');
    } catch { }
    logProbe('write-refused', { why: idv.why, window: idv.panelWindow });
    panelSays(key, { at: Date.now(), outcome: 'write-refused', code: 'identity', identityVerified: false, why: idv.why, rung: 'panel' });
    return false;
  }
  if (_panelVerdictSaid.get(key) !== 'ok') { _panelVerdictSaid.set(key, 'ok'); if (_panelVerdictSaid.size > 256) _panelVerdictSaid.delete(_panelVerdictSaid.keys().next().value); }
  const u = { ...cliPanel, source: 'on-demand', scopedFetchedAt: Date.now() };
  // THE ANSWER IS THE WRITE (quota r3): `true` only when the typed cache write
  // landed. A refused write (or a throw before it) used to answer `true`, so
  // the auto-cli loop counted a success, reset its backoff, and — the cache's
  // fetchedAt never advancing — re-spawned `claude -p /usage` every floor.
  let wroteOk = false;
  try {
    fs.mkdirSync(USAGE_CACHE_DIR, { recursive: true });
    const f = path.join(USAGE_CACHE_DIR, key.replace(/[^\w.-]/g, '_') + '.json');
    // preserve org identity + any fields the panel doesn't carry
    let prev = {}; try { prev = usageWrite.readCacheJson(f); } catch { }
    const merged = { ...prev, ...u, scopedWeekly: u.scopedWeekly?.length ? u.scopedWeekly : (prev.scopedWeekly || []) };
    // A preserve-merge inherits IDENTITY, never PROVENANCE (2026-09-07 r2):
    // `corroborated` is a verdict about the write that carried it. This panel
    // has no session, so there is nothing to corroborate with — inheriting the
    // last session-write's verdict rendered "via own /usage panel · not
    // corroborated" about a reading the account made about itself. Same rule
    // as captureRateLimitEvent (which deletes it when undefined).
    if (u.corroborated === undefined) delete merged.corroborated;
    // WEEKLY RESET PROJECTION (2.369.33, owner ask): the panel omits '· resets'
    // for a bucket at 0%, but weekly windows repeat on a fixed 7-day anchor —
    // carry the last observed weekly reset forward (projectReset) and mark it
    // estimated. The 5-hour bucket is NOT projected (its window starts with
    // the first request; a stale one would be a lie).
    try {
      const { projectReset, WEEK_SEC } = require('./harnesses/claude-quota.js');
      const nowSec = Math.floor(Date.now() / 1000);
      if (merged.sevenDay && !merged.sevenDay.resetsAt && prev.sevenDay?.resetsAt) { const p = projectReset(prev.sevenDay.resetsAt, WEEK_SEC, nowSec); if (p) merged.sevenDay = { ...merged.sevenDay, resetsAt: p, resetsAtEstimated: true }; }
      else if (merged.sevenDay?.resetsAt && !u.sevenDay?.resetsAt && prev.sevenDay?.resetsAtEstimated) merged.sevenDay = { ...merged.sevenDay, resetsAtEstimated: true };
      if (Array.isArray(merged.scopedWeekly) && Array.isArray(prev.scopedWeekly)) {
        merged.scopedWeekly = merged.scopedWeekly.map((sw) => {
          if (!sw || sw.resetsAt) return sw;
          const before = prev.scopedWeekly.find((x) => x && x.name === sw.name && x.resetsAt);
          const p = before ? projectReset(before.resetsAt, WEEK_SEC, nowSec) : null;
          return p ? { ...sw, resetsAt: p, resetsAtEstimated: true } : sw;
        });
      }
    } catch { }
    // ESTABLISH THE ACCOUNT'S OWN WINDOW (inc-mts8a8mr-ulmm). This producer is
    // the only one whose KEY and whose CREDENTIAL DIR are the same decision
    // (see the header above), so it is the only one entitled to say "this is
    // the window `key`'s buckets are counted in". Every session-attributed
    // producer is then checked AGAINST it (src/reading-lag.js ②) instead of
    // being allowed to redefine the account by writing a foreign window into
    // `sevenDay.resetsAt` — which is exactly what a mis-filed reading does, and
    // why the established window may never be read back out of that field.
    // It is written to a SIDECAR beside the cache, never into `merged` (r2,
    // reproduced): this object is rebuilt wholesale by the statusline hook
    // every 8 s, by the bare-token ⟳ and by the codex snapshot writer, and a
    // field there survives only while every one of them remembers to carry it.
    // One legitimate statusline render deleted every established window on the
    // instance and replayed the incident. See windowSidecarName.
    //
    // …AND ONLY BY A PANEL THAT PROVED WHOSE IT IS (B-855a c2, 2026-09-17).
    // The panel is the very producer B-855a showed can answer for another
    // account, and the sidecar is the identity anchor every other producer is
    // judged against — so an UNVERIFIED panel (no org evidence, no API-derived
    // window yet) may write its numbers (a guard with no evidence must not
    // delete data) but may not (re)define WHO the account is. A verified one
    // stamps `verifiedAt` + `verifiedBy` beside `source:'on-demand'`; the
    // API-derived stamp (`source:'api'`) comes from the engine and the standing
    // repair, and when the two disagree the panel was refused above already.
    try {
      const { windowOf } = require('./reading-lag.js');
      const windowStamp = require('./window-stamp.js'); // the `.window-` sidecar's ONE writer + reader (lane oat-identity-fix-r3)
      const w = windowOf(merged);
      // WHO ANSWERED (lane oat-identity-fix-r2, verify r2 F-A): the folder's login, or our long-lived token file in it —
      // the stamp names it, so a token's answer never becomes the identity its next generation is judged by (null = the
      // folder could not be read: nobody can tell — the ONE writer then carries the row's identity, fix r3)
      const producer = (() => { try { const i = accounts.readSubCreds(key); return i && i.oatFile ? 'oat:' + (Number(i.oatFileGen) > 0 ? Number(i.oatFileGen) : '?') : 'login'; } catch { return null; } })();
      if (idv && idv.verified && (w.sevenDay || w.fiveHour || Object.keys(w.scoped).length)) {
        // B-6a92 (主开发 r2688 (1)): the held door's lift in THIS call (idv.verifiedBy own-panel) and an own-panel stamp already on
        // this phase keep their proof mark — a later ordinary read never demotes the row's own proven read
        const prevSt = windowStamp.readWindowStamp(USAGE_CACHE_DIR, key);
        const keepOwn = idv.verifiedBy === 'own-panel' || (!!prevSt && prevSt.verifiedBy === 'own-panel' && Number(w.sevenDay) > 0 && require('./reading-lag.js').weeklyNear(prevSt.sevenDay, w.sevenDay) === true);
        windowStamp.writeWindowStamp(USAGE_CACHE_DIR, key, { ...w, at: Date.now(), source: 'on-demand', verifiedAt: Date.now(), verifiedBy: keepOwn ? 'own-panel' : idv.org === 'agree' ? 'cli-org' : (idv.verifiedBy || 'api-phase') }, producer);
        probeRec.sidecar = 'stamped';
      } else if (w.sevenDay || Object.keys(w.scoped).length) {
        // …UNLESS THE ONLY ANCHOR IS A LEGACY STAMP (inc-mu6djxxt-8166): with no
        // API-derived witness at all, a stamp the pre-c1 panel left (no
        // `verifiedBy`) is the weakest evidence on the instance — the isolated
        // panel (the creds dir IS the account under CLAUDE_CONFIG_DIR isolation)
        // establishes, re-anchors or upgrades it; a verified anchor and an API
        // witness are never touched here (PURE: reading-lag isolatedPanelAnchorVerdict).
        const anchor = windowStamp.readWindowStamp(USAGE_CACHE_DIR, key);
        const { isolatedPanelAnchorVerdict, windowFingerprint } = require('./reading-lag.js');
        const v = (idv && !idv.refused) ? isolatedPanelAnchorVerdict({ anchor, panelWindow: w, apiWindow: idv.apiWindow || null }) : { action: 'keep', reason: 'refused' };
        if (v.action === 'stamp' || v.action === 'reanchor' || v.action === 'upgrade') {
          const stamp = { ...w, at: Date.now(), source: 'on-demand', verifiedAt: Date.now(), verifiedBy: 'isolated-panel', provisional: true };
          if (v.action === 'reanchor') {
            console.log(`[usage] window re-anchored: ${acctNameOf(key)}'s weekly window is ${windowFingerprint(w)} per its isolated /usage panel — the legacy anchor ${windowFingerprint(anchor)} (stamped ${anchor && anchor.at ? new Date(anchor.at).toISOString() : '?'} by the pre-isolation panel, never verified) is archived; readings of the true window were being refused as foreign`);
            global.__vsEvent?.('usage-window-reanchored', `${key}:legacy→isolated-panel`);
            try {
              const f = path.join(path.dirname(USAGE_CACHE_DIR), 'archive', 'readings-foreign-usage-cache.ndjson');
              fs.mkdirSync(path.dirname(f), { recursive: true });
              fs.appendFileSync(f, JSON.stringify({ migration: 'legacy-anchor-reanchored', at: Date.now(), store: 'window-sidecar', key, action: 'reanchored', reason: v.reason, was: anchor, now: { ...stamp, producer } }) + '\n');
            } catch { }
          }
          windowStamp.writeWindowStamp(USAGE_CACHE_DIR, key, stamp, producer);
          probeRec.sidecar = `${v.action} (${v.reason})`;
        } else {
          probeRec.sidecar = `not-stamped (identity unverified; ${v.reason})`;
        }
      }
    } catch { }
    delete merged.limits; // the canonical half is the write path's to compute, never inherited from `prev`
    // AUTHORITATIVE OVER THE MODEL-SCOPED SET, but only when this panel's OWN
    // parse both ENUMERATED and listed one (r5 + r6). `mergeLimitSets` keeps
    // every previous limitId unconditionally — right for a producer that knows
    // about one bucket, wrong for the one that enumerates: a cap the vendor
    // stops reporting is resurrected for ever with its last number and
    // `accountRemaining` reads 0 % for an account whose live reading says
    // otherwise.
    //
    // ASKED OF `cliPanel`, NOT OF `u` (r6): the enumeration mark is a
    // NON-ENUMERABLE, symbol-keyed property of the parse result, so the
    // `const u = { ...cliPanel, … }` above does not carry it — deliberately,
    // because that is the same property which stops a stored object from ever
    // forging the claim. The PARSE is the thing that knows whether it dropped a
    // cap; `u` is a copy of its fields. (`u.scopedWeekly` IS
    // `cliPanel.scopedWeekly`, so the list this gate reads is unchanged, and
    // test-quota-model §⑱f drives this call site with a real CLI panel because
    // spelling it `u` here fails SILENTLY: authority simply never happens.)
    const wrote = usageWrite.writeCacheObject({ cacheDir: USAGE_CACHE_DIR, key, obj: merged, source: 'on-demand', familyOf: familyOfScopedBucket, backend: 'claude', stated: cliPanel,   // stated: THE LANES IT READ (lane account-reset-door r3) — every one the panel states, at whatever number, never the file's spread
      // «NO 5h LIMIT» (lane no-5h-window): a panel with the week and no «Current session» row enumerated the plan and
      // found no 5-hour window — said only by a panel that PROVED whose it is (B-855a c1): an unverified one writes
      // its numbers and keeps every window the file holds, exactly as it keeps the account's established window.
      absentWindows: idv && idv.verified ? quotaModel.absentWindowsOf(cliPanel) : null,
      authoritativeScopes: authoritativeScopesOf(cliPanel) });
    wroteOk = !!wrote.ok;
    if (wrote.ok) Object.assign(merged, wrote.object);
    try {
      const { windowOf } = require('./reading-lag.js');
      logProbe(wrote.ok ? 'written' : 'write-refused', { why: wrote.ok ? null : (wrote.error || wrote.why || (Array.isArray(wrote.errors) ? wrote.errors.join('; ') : null) || 'refused'), window: windowOf(merged) });
    } catch { logProbe(wrote.ok ? 'written' : 'write-refused'); }
    panelSays(key, { at: Date.now(), outcome: wrote.ok ? 'written' : 'write-refused', code: wrote.ok ? null : 'write', identityVerified: !!(wrote.ok && idv && idv.verified), why: wrote.ok ? (idv ? idv.why : null) : (wrote.why || wrote.error || 'refused'), rung: 'panel' });
    if (isGlobal) { _rateLimitCache = merged; writeUsageCache(); }
    else _accountUsage[key] = { ...merged, name: acctMeta.name, email: acctMeta.email };
    // a VERIFIED panel answer for a lapsed member IS the evidence that re-admits it (verify r1 ②)
    if (wrote.ok && idv && idv.verified && !isGlobal) { try { app.locals.memberServeLapsed?.(key, { verified: true }); } catch { } }
    try { ingestPassiveUsage(); } catch { }
  } catch (e) {
    if (!wroteOk) { panelSays(key, { at: Date.now(), outcome: 'write-refused', code: 'write', identityVerified: false, why: 'cache write failed: ' + (e && e.message), rung: 'panel' }); try { logProbe('write-refused', { why: 'cache write failed: ' + (e && e.message) }); } catch { } }
  }
  return wroteOk;
}
/** The last panel probe's verdict for a key — what the ⟳ route answers with. */
function panelVerdictFor(key) { return _panelVerdict[key] || null; }

// A HUMAN ⟳ THAT REVEALS A USABLE MEMBER MUST RE-DRIVE THE POOL (2026-09-08,
// the new-member incident). This route used to write the reading and answer
// {success:true}: it re-ran no pool decision and it did not touch the
// conversations ARMED on exhaustion, so the owner clicked refresh, watched the
// number change, and eight conversations kept waiting for a reset eight hours
// out. Every LOCAL rung below therefore takes the ONE edge — session,
// cli-panel and the bare-token ladder — because a third rung would otherwise
// be the one that forgets.
//
// LOCAL ONLY, DELIBERATELY. The `host` branch above returns long before this:
// a remote machine's pool is decided by the instance that owns it, and the
// conversations armed there are not ours to continue. (Its readings still land
// in the host-<id> caches for the panels, exactly as before.)
//
// The edge is idempotent, rate-floored per member, and refuses a reading that
// is missing, stale, or whose weekly window says it is another member's — see
// onMemberReadingFresh. Failure is swallowed: a refresh must not fail because
// a follow-up pool evaluation did.
//
// '__global__' is skipped as a COST saving, not a rule: the machine login is
// not a `sub-` record, so it can never be a pool member (poolMembers filters
// subscriptions) and a session billed to it carries no `_accountId` to match —
// the edge would do a cache read and a roster walk to reach the same answer.
const wakePool = (key, why) => {
  try { if (key && key !== '__global__' && onMemberReadingFresh) onMemberReadingFresh(key, why); }
  catch (e) { console.warn('[usage] pool wake after refresh failed:', e.message); }
};

app.post('/api/usage/refresh', async (req, res) => {
  // THE ⟳ DOOR IS HUMAN-GATED (lane pool-silent-members acceptance r3, F1 — §ban-safety, measured: on an instance nobody
  // signs in to, an agent's bearer got HTTP 200 and the ladder's vendor requests): a vendor read made for a person's
  // click, so an agent's session / job token is refused before anything is read — the refusal its two sibling doors
  // (repair-identity, gather) give; the bearer itself is never echoed
  if (/^Bearer\s+(vsst_|jbt_)/i.test(String((req.headers && req.headers.authorization) || ''))) return res.status(403).json({ error: 'human-triggered only — ⟳ reads an account\'s quota from the vendor for a person\'s click; an agent token is refused', code: 'human_only' });
  // User-facing kill switch (accounts.onDemandQuotaRefresh = 'off'): never
  // contact Anthropic, even if a stale client asks.
  let odMode = 'manual';
  try { odMode = serverSetting('accounts.onDemandQuotaRefresh') || 'manual'; } catch {}
  if (odMode === 'off') return res.status(403).json({ error: 'on-demand quota refresh is disabled in Settings' });
  // B-5279 (r4932 M2): while the settings are held, the press is refused by the DOOR's own verdict and words — before the token ladder
  // and the remote roads below, which call the vendor themselves: no contact against a stored Off nobody can read
  { const no = panelDoorRefusal(serverSetting); if (no) return res.status(503).json({ error: no.message, code: no.code }); }
  // Remote host (2.127.0): read the host's own login token over ssh
  // (READ-ONLY — never refreshed) and do the same single human-gated call.
  if (req.body?.host && hosts) {
    const hid = String(req.body.host);
    if (Date.now() < _rateLimitBackoffUntil) return res.json({ throttled: true, reason: 'backoff' });
    // Host-HELD account variant (2.245.0): {host, account} together — read the
    // account's OWN creds dir on the host (~/.vibespace/subs/<id>; READ-ONLY,
    // never refreshed — same §ban-safety class as the machine-login peek
    // below) and make the same single human-gated call with that token.
    if (req.body.account) {
      const aid = String(req.body.account);
      if (!/^sub-[\w-]{1,40}$/.test(aid)) return res.status(400).json({ error: 'bad account id' });
      const tkey = 'host:' + hid + ':' + aid;
      if (Date.now() - (_onDemandUsageAt[tkey] || 0) < 60000) return res.json({ throttled: true });
      let hMeta2; try { hMeta2 = hosts.get(hid); } catch (e) { return e && e.code === 'hosts-unread' ? res.status(503).json({ error: e.message, code: e.code }) : res.status(404).json({ error: 'unknown host' }); }   // the B-f276 remainder (H20)
      const acctMeta2 = (accounts.list().accounts || []).find((x) => x.id === aid);
      if (!acctMeta2) return res.status(404).json({ error: 'unknown account' });
      // Throttle is stamped only AFTER a probe actually reached the host
      // (2.271.0 T2-12) — stamping first meant an immediate retry after an
      // unreachable-host failure answered {throttled:true} for 60s.
      // DEVICE-EXECUTED refresh first (2.298.0, §Quota refresh origin): the
      // token is used FROM THE MACHINE that holds it — the server never sees
      // it and the token-from-a-foreign-IP signal is gone. Old daemons /
      // failures fall through to the legacy token-peek path unchanged.
      const deviceLeg = async () => {
        const dm = await hosts.device(hid);
        // B-5e0d: an agent older than THE USAGE BEARER LAW would send a long-lived token itself — `lawFirst` (the hub's own peek
        // of the same login file: refused by name, its token unused) runs before such an agent is asked (src/agentd/client.js)
        const r = await dm.quotaRefresh({ subDir: aid, humanGated: true, lawFirst: () => _firstLook(hosts.readRemoteSubOAuth(hid, aid)) });
        if (r && r.refused === 'long-lived') throw usageBearerRefusal('the account\'s folder on the host');   // the agent's own reason
        const u = _consumeDeviceQuota(r);
        if (!u) throw new Error('device refresh returned no usable reading');
        return u;
      };
      deviceLeg().then((u) => {
        _onDemandUsageAt[tkey] = Date.now();
        u.source = 'on-demand-held'; // B-ff9d: a reading another machine made, for an account it HOLDS — never this hub's own /usage panel
        u.scopedFetchedAt = Date.now();
        _hostAcctUsage[hid + ':' + aid] = { ...u, name: acctMeta2.name, email: acctMeta2.email };
        usageWrite.writeCacheObject({
          cacheDir: USAGE_CACHE_DIR, key: 'host-' + hid.replace(/[^\w-]/g, '_') + '-' + aid,
          obj: _hostAcctUsage[hid + ':' + aid], source: 'on-demand-held', familyOf: familyOfScopedBucket, backend: 'claude',
          // enumerating producer (r5) — see refreshViaCliPanel
          authoritativeScopes: authoritativeScopesOf(u), absentWindows: quotaModel.absentWindowsOf(u),
        });
        res.json({ success: true, origin: 'device' });
      }).catch((e) => _deviceSaid(e, () => hosts.readRemoteSubOAuth(hid, aid)).then((token) => {
        _onDemandUsageAt[tkey] = Date.now();
        if (!token) return res.json({ error: 'no currently-valid login for this account on the host — run a session on it there first' });
        _fetchOAuthUsage(token, (u) => {
          if (!u) return res.json({ error: 'refresh failed (rate-limited or offline) — kept last-known' });
          u.source = 'on-demand-held'; // B-ff9d: a reading another machine made, for an account it HOLDS — never this hub's own /usage panel
          u.scopedFetchedAt = Date.now();
          _fetchOAuthRoles(token, (org) => {
            if (org) Object.assign(u, org);
            _hostAcctUsage[hid + ':' + aid] = { ...u, name: acctMeta2.name, email: acctMeta2.email };
        usageWrite.writeCacheObject({
          cacheDir: USAGE_CACHE_DIR, key: 'host-' + hid.replace(/[^\w-]/g, '_') + '-' + aid,
          obj: _hostAcctUsage[hid + ':' + aid], source: 'on-demand-held', familyOf: familyOfScopedBucket, backend: 'claude',
          // enumerating producer (r5) — see refreshViaCliPanel
          authoritativeScopes: authoritativeScopesOf(u), absentWindows: quotaModel.absentWindowsOf(u),
        });
            res.json({ success: true });
          });
        });
      }).catch((e) => res.json({ error: e?.code === 'host-unreachable'
        ? `${hMeta2?.name || hid} isn’t responding — couldn’t check its login. Retry when it’s back.`
        : String(e.message || e).slice(0, 160) })));
      return;
    }
    if (Date.now() - (_onDemandUsageAt['host:' + hid] || 0) < 60000) return res.json({ throttled: true });
    let hMeta; try { hMeta = hosts.get(hid); } catch (e) { return e && e.code === 'hosts-unread' ? res.status(503).json({ error: e.message, code: e.code }) : res.status(404).json({ error: 'unknown host' }); }   // the B-f276 remainder (H20): unknown, never «unknown host»
    const deviceLegG = async () => {
      const dm = await hosts.device(hid);
      // B-5e0d: as the held account's leg above. An agent older than the law, refused by the hub's own first look, is never
      // asked — its PASSIVE cache is read through the shell instead (file reads only): the person keeps the reading that cost
      // nothing, and the refusal still answers by name
      let lawSaid = null;
      const r = await dm.quotaRefresh({ humanGated: true, lawFirst: () => _firstLook(hosts.readRemoteOAuth(hid)).catch((e) => { if (e && e.code === 'long-lived') lawSaid = e; throw e; }) })
        .catch(async (e) => { if (!lawSaid || e !== lawSaid) throw e; return { passive: await hosts.readRemotePassiveUsage(hid).catch(() => null), refused: 'long-lived' }; });
      // B-0f13 read path: the reply carries the host's PASSIVE statusline
      // cache (files the remote vibespace-usage hook wrote — zero vendor
      // calls). Merge fetchedAt-GUARDED into the server-side per-host cache:
      // only a strictly-newer reading may overwrite (the anti-poison rule —
      // a stale file must never displace a fresher one). Remote '__global__'
      // = the host's own login → the host-<id> bucket; sub-* keys → the
      // host-held account files the boot loader already recognizes.
      if (r?.passive) {
        try {
          fs.mkdirSync(USAGE_CACHE_DIR, { recursive: true });
          for (const [k, j] of Object.entries(r.passive)) {
            if (!j?.fetchedAt) continue;
            const fname = k === '__global__'
              ? 'host-' + hid.replace(/[^\w-]/g, '_') + '.json'
              : /^sub-[\w-]{1,40}$/.test(k) ? `host-${hid.replace(/[^\w-]/g, '_')}-${k}.json` : null;
            if (!fname) continue;
            const hkey = fname.slice(0, -5);
            const prev = usageWrite.readCacheObject(USAGE_CACHE_DIR, hkey);
            if (prev?.fetchedAt && prev.fetchedAt >= j.fetchedAt) continue;
            const merged = { ...(prev || {}), ...j, source: 'remote-statusline' };
            delete merged.limits; // rebuilt from the merged view by the write path — never inherited from `prev` wholesale
            if (j.corroborated === undefined) delete merged.corroborated; // provenance belongs to the write that made it — the host's own label, if it sent one, describes THIS reading
            const wrote = usageWrite.writeCacheObject({ cacheDir: USAGE_CACHE_DIR, key: hkey, obj: merged, measuredAt: j.fetchedAt, source: 'remote-statusline', familyOf: familyOfScopedBucket, backend: 'claude' });
            // B-5e0d: the merged reading is the popup's at once — the in-memory host entries are read from disk only at setup
            const kept = wrote && wrote.ok && wrote.object ? wrote.object : null;
            if (kept) { if (k === '__global__') _hostUsage[hid] = kept; else _hostAcctUsage[hid + ':' + k] = heldSource(kept); }
          }
        } catch { }
      }
      if (r && r.refused === 'long-lived') throw lawSaid || usageBearerRefusal('the host\'s login');   // the agent's own reason (or the law's first look)
      const u = _consumeDeviceQuota(r);
      if (!u) throw new Error('device refresh returned no usable reading');
      return u;
    };
    deviceLegG().then((u) => {
      _onDemandUsageAt['host:' + hid] = Date.now();
      u.source = 'on-demand-remote';
      u.scopedFetchedAt = Date.now();
      _hostUsage[hid] = { ...u, name: hMeta.name };
      usageWrite.writeCacheObject({
        cacheDir: USAGE_CACHE_DIR, key: 'host-' + hid.replace(/[^\w-]/g, '_'),
        obj: _hostUsage[hid], source: 'on-demand-remote', familyOf: familyOfScopedBucket, backend: 'claude',
        // enumerating producer (r5) — see refreshViaCliPanel
        authoritativeScopes: authoritativeScopesOf(u), absentWindows: quotaModel.absentWindowsOf(u),
      });
      res.json({ success: true, origin: 'device' });
    }).catch((e) => _deviceSaid(e, () => hosts.readRemoteOAuth(hid)).then((token) => {
      _onDemandUsageAt['host:' + hid] = Date.now(); // stamp only after the probe reached the host
      if (!token) return res.json({ error: 'no currently-valid login token on the host — log in / run claude there first' });
      _fetchOAuthUsage(token, (u) => {
        if (!u) return res.json({ error: 'refresh failed (rate-limited or offline) — kept last-known' });
        u.source = 'on-demand-remote';
        u.scopedFetchedAt = Date.now();
        _fetchOAuthRoles(token, (org) => {
          if (org) Object.assign(u, org);
          _hostUsage[hid] = { ...u, name: hMeta.name };
      usageWrite.writeCacheObject({
        cacheDir: USAGE_CACHE_DIR, key: 'host-' + hid.replace(/[^\w-]/g, '_'),
        obj: _hostUsage[hid], source: 'on-demand-remote', familyOf: familyOfScopedBucket, backend: 'claude',
        // enumerating producer (r5) — see refreshViaCliPanel
        authoritativeScopes: authoritativeScopesOf(u), absentWindows: quotaModel.absentWindowsOf(u),
      });
          res.json({ success: true });
        });
      });
    }).catch((e) => res.json({ error: e?.code === 'host-unreachable'
      ? `${hMeta?.name || hid} isn’t responding — couldn’t check its login. Retry when it’s back.`
      : String(e.message || e).slice(0, 160) })));
    return;
  }
  const key = String(req.body?.account || '__global__');
  if (Date.now() < _rateLimitBackoffUntil) return res.json({ throttled: true, reason: 'backoff' });
  if (Date.now() - (_onDemandUsageAt[key] || 0) < 60000) return res.json({ throttled: true });
  // CONTROL-CHANNEL preference (B-7edc, 2.260.0): if a live LOCAL claude chat
  // session is billed to this account, ask ITS CLI via get_usage instead of
  // touching the API ourselves — the fetch is then made by the first-party
  // client (same as the user typing /usage there). Still human-gated (this
  // route IS the ⟳ click) + the same 60s throttle above. Falls through to the
  // bare read-only call when no session answers.
  // The answer says WHICH RUNG answered and whether the identity was verified
  // (B-855a ③): `{rung, identityVerified, why, skipped}` — a session the
  // engine would not vouch for (OTel-divergent / inside a re-point's lag
  // shadow) is skipped and listed, and the ⟳ falls to the isolated panel.
  let skipped = [];
  if (probeUsageForAccountKey) {
    try {
      const viaSession = await probeUsageForAccountKey(key, { detailed: true });
      const parsedVia = viaSession && typeof viaSession === 'object' && ('parsed' in viaSession) ? viaSession.parsed : viaSession;
      if (viaSession && Array.isArray(viaSession.skipped)) skipped = viaSession.skipped;
      // AN ANSWER THE GUARD ARCHIVED IS NOT A REFRESH (inc-mu6djxxt-8166, owner:
      // "5h限额刷新不出来了"): the session answered, the window guard refused to
      // write it (target null), and this route used to say `success` and stop —
      // nothing on screen changed. A refused rung is a SKIPPED rung: listed with
      // its reason, and the ⟳ falls to the isolated panel exactly as it does for
      // a session the engine would not ask.
      const viaWritten = parsedVia && !(viaSession && typeof viaSession === 'object' && 'target' in viaSession && !viaSession.target);
      if (viaWritten) {
        _onDemandUsageAt[key] = Date.now();
        wakePool(key, 'manual refresh (session)');
        return res.json({ success: true, via: 'session', rung: 'control', identityVerified: !!viaSession.identityVerified, why: viaSession.why || null, sessionId: viaSession.sessionId || null, skipped });
      }
      if (parsedVia) skipped.push({ sessionId: (viaSession && viaSession.sessionId) || null, why: `answered, but the window guard archived the reading (${(viaSession && viaSession.why) || 'window mismatch'}) — falling to the isolated panel` });
    } catch { /* fall through to the bare call */ }
  }
  const isGlobal = key === '__global__';
  let acctMeta = null;
  if (!isGlobal) {
    acctMeta = (accounts.list().accounts || []).find((x) => x.id === key && x.type === 'subscription');
    if (!isGlobal) { const lh = (() => { try { return typeof accounts.held === 'function' ? (accounts.held() || null) : null; } catch { return { code: 'held-unknown' }; } })(); if (lh) return res.status(503).json({ error: 'the accounts list could not be read — try again once it reads', code: 'accounts_unread' }); }   // r3044 (5): the list UNREAD is not «unknown account»
    if (!acctMeta) return res.status(404).json({ error: 'unknown subscription account' });
  }
  // CLI-PANEL rung (2.327.0, user-verified: `claude -p /usage` prints ALL
  // THREE buckets incl. model-scoped weeklies): spawn the CLI pointed at the
  // account's own creds dir and let IT make the first-party fetch — no token
  // ever touches this server, and accounts with NO live session (the old
  // 'no valid token' dead end) become refreshable. Human-gated (this route IS
  // the ⟳ click) + the same 60s throttle; any failure falls through to the
  // token ladder below. Ambient key/oat env is stripped so the CLI reads the
  // subscription login, not an inherited API key.
  const t0 = Date.now();
  const cliOk = await refreshViaCliPanel(key);
  const pv = panelVerdictFor(key);
  // a panel that answered «no login in the folder» (code 'login') or a door that refused the spawn (code 'unprobeable') ENDS
  // NOTHING here (acceptance r2): the token ladder below — the same-account and identity-group fallbacks 90c995a3 reached
  // for both — is tried first, and the refusal is said by name only when it has no token either (below the ladder)
  const refusedByName = !cliOk && pv && pv.at >= t0 && (pv.code === 'login' || pv.code === 'unprobeable' || pv.code === 'sign-in-unknown') ? pv : null;
  // the refusal BY NAME: what was refused and its remedy — the row's own state (a folder token, a locked vault: no re-login)
  // …and the answer carries the cause as a CODE (`wall`: the pool's verdict) — the client says it in the person's language,
  // ONE sentence with its count and its door; the English `error` stays for the journal and an older bundle
  const refusalAnswer = (r) => (r.code === 'sign-in-unknown' ? { error: 'not refreshed — ' + r.why, signinUnknown: true, rung: 'panel', identityVerified: false, why: r.why, skipped }   // B-360d: never «re-login» on a sign-in not read
    : (r.wallWhy ? wallDoor(r.wallWhy) !== 'relogin' : (r.el === OAT_FOLDER_NO_PANEL || r.wall === 'vault-locked'))
    ? { error: 'not refreshed — ' + r.why, rung: 'panel', identityVerified: false, why: r.why, skipped, ...(r.wallWhy ? { wall: r.wallWhy } : {}) }
    : { error: 'needs re-login to refresh usage — ' + r.why, loginNeeded: true, rung: 'panel', identityVerified: false, why: r.why, skipped, ...(r.wallWhy ? { wall: r.wallWhy } : {}) });
  // A LAPSED SUBSCRIPTION (2026-10-08) is re-admitted only by the panel's own answer: when the panel did not answer,
  // the token ladder below is NOT tried for it — a reading that is not the CLI serving must never count as the renewal
  // …and the answer SAYS which (verify r1 ③): the CLI answered but its reading was refused as another account's window, or it did not answer
  // …and only when a panel RAN (acceptance r3, reproduced: repro/accept-r2/skeptic-lapsed-refresh.mjs): a door that
  // refused the spawn asked nothing — the refusal by name comes first, with its remedy (b552c972 said «the subscription
  // still does not answer» with no loginNeeded, 0 panels and 0 fetches)
  if (!cliOk && !isGlobal && typeof app.locals.memberServeLapsed === 'function' && app.locals.memberServeLapsed(key)) {
    if (refusedByName) return res.json(refusalAnswer(refusedByName));
    const refused = !!(pv && pv.outcome === 'write-refused' && pv.code === 'identity' && pv.at >= t0);
    return res.json({ error: refused ? `answered, but refused as another window — ${pv.why}` : 'not recorded — the subscription still does not answer (the pool keeps skipping it)', rung: 'panel', lapsed: true, refused, identityVerified: false, why: (pv && pv.why) || null, skipped });
  }
  if (cliOk) { wakePool(key, 'manual refresh (cli-panel)'); return res.json({ success: true, via: 'cli-panel', rung: 'panel', identityVerified: !!(pv && pv.identityVerified), why: (pv && pv.why) || null, skipped }); }
  // AN IDENTITY REFUSAL ENDS THE LADDER (B-855a): the vendor already answered
  // once, for somebody else — a second vendor request on the token ladder
  // would be the pattern §ban-safety exists to stop, and it could not verify
  // its own identity either. The user is told, with both identities named.
  if (pv && pv.at >= t0 && pv.code === 'identity') {
    return res.json({ error: `not recorded — ${pv.why}`, rung: 'panel', identityVerified: false, why: pv.why, skipped });
  }
  // …and so does a panel that ANSWERED but whose write was refused (quota r3:
  // refreshViaCliPanel now says false for it) — the vendor already answered
  // once; the user is told why it was not recorded, never a second request.
  if (pv && pv.at >= t0 && pv.code === 'write') {
    return res.json({ error: `not recorded — ${pv.why}`, rung: 'panel', identityVerified: false, why: pv.why, skipped });
  }
  // A record REMOVED while its panel was being read (the r3 belt refuses to
  // write for it) must not fall through to the token ladder: that costs one
  // real vendor request on a SIBLING's token and can re-create the phantom
  // cache entry the belt exists to prevent (member-wake r3 verifier, LOW).
  if (!isGlobal) { const lh = (() => { try { return typeof accounts.held === 'function' ? (accounts.held() || null) : null; } catch { return { code: 'held-unknown' }; } })(); if (lh) return res.status(503).json({ error: 'the accounts list could not be read — try again once it reads', code: 'accounts_unread' }); }   // r3044 (5): the list UNREAD is not «unknown account»
  if (!isGlobal && !(accounts.list().accounts || []).some((x) => x.id === key)) return res.status(404).json({ error: 'that account was removed while its usage was being read' });
  // THE USAGE BEARER LAW (acceptance r3, login-expiry usageBearerOk — kb-design-lessons §9): every rung of this ladder hands
  // only the CLI's own login token, never a long-lived one (ours or planted without our mark) — a usage read is never made with one
  let token = isGlobal ? getOAuthToken() : accounts.usageToken(key);
  // Same-account fallback (2.181.0, real report): a named subscription's dir
  // token is only refreshed while a session RUNS on that dir — but when the
  // machine's global CLI login IS the same Anthropic account (email link),
  // its token is just as authoritative for the shared quota (and vice versa).
  // Still read-only + user-initiated — same §ban-safety class.
  if (!token) {
    try {
      const gl = accounts.subscriptionStatus();
      // WHICH LOGIN'S TOKEN READS THE PANEL is a DECISION on a person's ⟳ (B-360d, 主开发 r1221): the emails read NOW off the loop
      // (awaited); a row whose sign-in could not be read carries no email — no token chosen by it
      // …the folders it COMPARES only, bounded: this account's for a named one; every claude subscription's for the machine login
      const compared = isGlobal ? (accounts.list().accounts || []).filter((x) => oauthUsageAccount(x)).map((x) => x.id) : [key];
      const { since } = await accounts.signinFactsNow(compared);
      const rowsNow = accounts.decisionList({ since }).accounts || [];
      if (!isGlobal) {
        const email = String((rowsNow.find((x) => x.id === key) || {}).email || '').toLowerCase();
        if (email && gl?.loggedIn && String(gl.email || '').toLowerCase() === email) token = getOAuthToken();
      } else if (gl?.email) {
        const linked = rowsNow.find((x) => x.type === 'subscription' && String(x.email || '').toLowerCase() === String(gl.email).toLowerCase());
        if (linked) token = accounts.usageToken(linked.id);
      }
    } catch { }
  }
  // IDENTITY-GROUP fallback (2.266.1, real report): the email-link above needs
  // the account RECORD's email, which login flows can leave empty — but the
  // identity groups (orgUuid > email from the usage caches) already know which
  // keys are the same real account. Any currently-valid token in the group is
  // authoritative for the shared quota; the pool keeps the DIR token fresh
  // while '__global__' idles, so this is the rung that actually fires there.
  if (!token) {
    try {
      for (const id of app.locals.usageIdentityAccountIds?.(key) || []) {
        if (id === key) continue;
        token = id === '__global__' ? getOAuthToken() : accounts.usageToken(id);
        if (token) break;
      }
    } catch { }
  }
  // the door refused the panel (acceptance r2) and no fallback serves this account either: refused BY NAME, the row's own remedy
  if (!token && refusedByName) return res.json(refusalAnswer(refusedByName));
  // the folder holds a long-lived token and nothing else serves: refused BY NAME (the usage bearer law, acceptance r3 F4)
  if (!token && !isGlobal && typeof accounts.usageTokenRefusal === 'function' && accounts.usageTokenRefusal(key) === 'long-lived') return res.json({ error: 'not refreshed — the account\'s folder holds a long-lived token, and a long-lived token is never sent as a usage bearer (it is an inference credential; the CLI itself never reads usage with it) — its usage refreshes when a session uses it, or re-login', rung: 'token', identityVerified: false, skipped });
  if (!token) return res.json({ error: 'no currently-valid token for this account (nor its linked machine login) — run a session on it (the CLI refreshes its own login), then retry' });
  _onDemandUsageAt[key] = Date.now();
  _fetchOAuthUsage(token, (u) => {
    if (!u) return res.json({ error: 'refresh failed (rate-limited or offline) — kept last-known' });
    u.source = 'on-demand';
    u.scopedFetchedAt = Date.now(); // scoped buckets only ever come from here — track their own age
    // Same-click identity capture: the token's TRUE org (see _fetchOAuthRoles).
    // Best-effort — a failure just leaves the fields absent (email heuristics
    // keep working). This is what un-confuses a stale ~/.claude.json identity.
    _fetchOAuthRoles(token, (org) => {
      if (org) Object.assign(u, org);
      // Persist to the same per-account cache file the statusline hook writes:
      // survives restarts, and the hook's preserve-merge keeps scopedWeekly and
      // the org identity alive through subsequent passive (5h/7d-only) writes.
      {
        // enumerating producer (r5) — see refreshViaCliPanel. `u` IS this read's
        // own answer (no preserve-merge here at all), so its list is complete.
        const w = usageWrite.writeCacheObject({ cacheDir: USAGE_CACHE_DIR, key, obj: u, source: 'on-demand', familyOf: familyOfScopedBucket, backend: 'claude',
          authoritativeScopes: authoritativeScopesOf(u), absentWindows: quotaModel.absentWindowsOf(u), stated: u });   // its own answer: every lane it states
        if (w.ok) Object.assign(u, w.object);
      }
      if (isGlobal) { _rateLimitCache = u; writeUsageCache(); }
      else _accountUsage[key] = { ...u, name: acctMeta.name, email: acctMeta.email };
      try { ingestPassiveUsage(); } catch {} // re-run the global↔named same-account merge
      wakePool(key, 'manual refresh (token)');
      res.json({ success: true });
    });
  });
});

function readCodexWrapperRateLimit(sessionId) {
  if (!sessionId) return null;
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(BUFFERS_DIR, sessionId + '.json'), 'utf-8'));
    const snap = normalizeCodexRateLimit(meta?.rateLimits, meta?.rateLimitsFetchedAt || meta?.startedAt || Date.now());
    // The RUNNING wrapper's own sidecar: the same `rate_limits_updated` push
    // the engine consumes live, read back off disk — one producer, one name
    // (2026-09-07 r3).
    if (snap) snap.source = 'codex-rate-limits';
    // stored reset-credit count (wrapper reads it once at startup + on ⟳)
    if (snap && meta?.rateLimitResetCredits) {
      const rc = meta.rateLimitResetCredits;
      snap.resetCredits = { availableCount: Number(rc.availableCount ?? rc.available_count ?? rc?.summary?.availableCount) || 0 };
    }
    return snap;
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
      // Mined from a rollout TRANSCRIPT, not from a live stream — a different
      // producer with a different freshness story, so it says so (2026-09-07
      // r3: the codex panel used to label every reading "via unknown").
      if (normalized) { normalized.source = 'codex-rollout'; return normalized; }
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
  // PER-LIMIT ACCUMULATION, NOT FRESHEST-WINS (B-9213). The app-server pushes a
  // SEPARATE snapshot per limit and every rung below feeds them in here:
  // measured on this instance, one conversation produced 208 pushes across
  // `codex` (the plan), `codex_bengalfox`/"GPT-5.3-Codex-Spark" and `premium`.
  // The old `keep` took the freshest WHOLE snapshot, so the plan limit was
  // erased by the next Spark push and the panel read 0 % on an account at 5 %.
  // Now each snapshot merges into the key's typed set under its OWN limitId,
  // and `byAccount[key]` is the projection of the merged set — which is what
  // every existing reader of this map already expects to receive.
  const setOf = {};
  const keep = (key, snapshot, source) => {
    if (!snapshot) return;
    const next = codexQuota.limitSetFromSnapshot(snapshot, { identity: key, source: source || snapshot.source || null });
    if (!next) return;
    setOf[key] = quotaModel.mergeLimitSets(setOf[key] || quotaModel.makeLimitSet({ identity: key }), next);
    const view = quotaModel.toLegacyView(setOf[key]);
    // Non-bucket fields (planType, resetCredits, the limit ids) come from the
    // NEWEST snapshot; the buckets come from the merged set.
    const prev = byAccount[key];
    const base = (!prev || (snapshot.fetchedAt || 0) >= (prev.fetchedAt || 0)) ? snapshot : prev;
    const out = { ...base, ...view, limits: setOf[key].limits, fetchedAt: setOf[key].fetchedAt || base.fetchedAt };
    // THE STORED RESET-CREDIT COUNT IS CARRIED, like the cache writer carries it
    // (reset credits r3): only the on-demand read states it, a DISK-seeded set
    // has no `extra` to project it from, and a live wrapper whose startup read
    // failed pushes newer readings without one — its snapshot must not erase
    // the count the file (the previous projection) still holds.
    if (out.resetCredits === undefined && prev && prev.resetCredits && typeof prev.resetCredits === 'object') out.resetCredits = prev.resetCredits;
    byAccount[key] = out;
  };
  // SEED FROM DISK first (P1, design-backend-parity.md §1): snapshots used to
  // be re-derived from rollout tails only (24 files / 14 days) — an idle
  // account's quota silently VANISHED. Persisted files also make codex
  // identities visible to the anchors sweep / estimator like claude's.
  try {
    for (const fn of usageWrite.listCacheDir(USAGE_CACHE_DIR, { via: usageFolder.via })) {
      const m = /^(cxs-[\w-]+|__global_codex__)\.json$/.exec(fn);
      if (!m) continue;
      try {
        const stored = usageWrite.readCacheJson(path.join(USAGE_CACHE_DIR, fn), { via: usageFolder.via });
        // A stored file may ALREADY carry the typed limits (everything written
        // since this model shipped); seed from those rather than from its
        // projected buckets, so a limit the projection cannot show is not lost
        // on the way back in.
        if (Array.isArray(stored?.limits) && stored.limits.length) {
          setOf[m[1]] = quotaModel.makeLimitSet({ identity: m[1], fetchedAt: stored.fetchedAt, source: stored.source, limits: stored.limits });
          byAccount[m[1]] = stored;
        } else keep(m[1], stored, stored?.source);
      } catch {}
    }
  } catch {}
  // B-87fd (the census's raw key, 主开发 2026-11-19 05:27Z): a codex reading is filed under the ACCOUNT that produced it. A pool is
  // no account: a pooled conversation's reading is its MEMBER's — the one its process holds (the shared rule
  // accounts.poolMemberOfSession: held, else its link) while it lives; a pooled thread no live conversation holds is filed
  // nowhere (its member is not known then — never under the pool's id, which named the pool after a member's reading). The
  // rule's 'unknown' answer (no spawn stamp, no ledger row that names the start) names nobody either: filed nowhere — in THIS
  // summary's reads (the wrapper's sidecar, the rollouts); the engine's live push files a reading by its own resolver
  const codexKeyOf = (acctId, session = null) => {
    const own = acctId || '__global_codex__';
    let a = null; try { a = accounts.get(own); } catch { a = null; }
    if (!a || a.type !== 'pooled') return own;
    if (!session) return null;
    try { const m = accounts.poolMemberOfSession(a.id, session, session._webuiId || null); return (m && m.origin !== 'unknown' && m.id) || null; } catch { return null; }
  };
  const liveByThread = {};
  for (const [id, session] of activeSessions) {
    if (session.backend !== 'codex') continue;
    if (session.backendSessionId) liveByThread[String(session.backendSessionId).toLowerCase()] = session;
    if (session.mode !== 'chat') continue;   // the wrapper's sidecar is a chat process's
    const key = codexKeyOf(session._accountId, session);
    if (key) keep(key, readCodexWrapperRateLimit(id), 'codex-rate-limits');
  }
  {
    const threadAcct = codexThreadAccountMap();
    const recentFiles = listRecentCodexJsonlFiles();
    let freshEnough = 0;
    for (const entry of recentFiles) {
      const tm = /rollout-.*-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i.exec(entry.path);
      const snapshot = readLatestCodexRateLimitFromJsonl(entry.path);
      if (!snapshot) continue;
      // B-87fd: a rollout line is the LIVE process's only when that process made it — at or after its start (`createdAt`, the
      // spawn instant). Then it is filed by the live conversation's own account (a pooled one: the member its process holds).
      // A line from before the start is the thread's EARLIER process, on an account the live one may not hold (a pool's other
      // member, an account the conversation left) — and the thread's recorded account cannot name it then (a killed process's
      // meta is deleted: the record names the live one): filed nowhere. The earlier process filed its own readings while it
      // lived; the disk seed above keeps them. A thread no live conversation holds goes by its recorded account, never a pool
      // (codexKeyOf, no session ⇒ nowhere)
      const thread = tm ? tm[1].toLowerCase() : null;
      const live = thread ? liveByThread[thread] || null : null;
      const t0 = live ? Number(live.createdAt) || 0 : 0;
      const ownLine = !!live && t0 > 0 && (Number(snapshot.fetchedAt) || 0) >= t0;
      const key = live ? (ownLine ? codexKeyOf(live._accountId || null, live) : null) : codexKeyOf(thread ? (threadAcct[thread] || null) : null, null);
      if (key) keep(key, snapshot, 'codex-rollout');
      if (snapshot.fetchedAt && (now - snapshot.fetchedAt) < 5 * 60 * 1000 && ++freshEnough >= 3) break;
    }
  }
  let overall = null;
  for (const s of Object.values(byAccount)) if (!overall || (s.fetchedAt || 0) > (overall.fetchedAt || 0)) overall = s;
  // Same-account merge (codex global ↔ linked named account): newest wins both.
  const gid = _codexLinkUndecided ? null : _codexUsageGlobalLink.accountId;   // B-360d: never a merge on a link this pass could not decide (the claude road's own gate)
  if (gid) {
    const a = byAccount[gid], g = byAccount['__global_codex__'];
    const newest = (a && (!g || (a.fetchedAt || 0) > (g.fetchedAt || 0))) ? a : g;
    if (newest) {
      // The typed SET travels with the winner too (quota-model-v2 composition
      // verifier): `writeCacheObject` below persists `setOf[key]`, so leaving
      // the loser's set under its key wrote the LOSER's stale limits beneath
      // the WINNER's fetchedAt — and the freshness guard then refused every
      // later correction, for good. One identity, one set.
      const winKey = newest === a ? gid : '__global_codex__';
      byAccount[gid] = newest; byAccount['__global_codex__'] = newest;
      setOf[gid] = setOf['__global_codex__'] = setOf[winKey];
    }
  }
  // The freshness guard below still decides whether this write PROMOTES the
  // file; it no longer decides the BUCKETS — those go through the one write
  // path, which merges per limitId (B-9213), so a rung that knows about one
  // limit updates one limit either way.
  // WRITE-THROUGH (P1): freshest-wins persistence, same anti-poison rule as
  // the claude device read-back — never let an older snapshot overwrite a
  // newer file (fetchedAt-guarded by `keep` above, which already merged disk).
  for (const [key, snap] of Object.entries(byAccount)) {
    if (!/^(cxs-[\w-]+|__global_codex__)$/.test(key)) continue;
    const cur = usageWrite.readCacheObject(USAGE_CACHE_DIR, key);
    if (cur && (Number(cur.fetchedAt) || 0) >= (Number(snap.fetchedAt) || 0)) continue;
    usageWrite.writeCacheObject({
      cacheDir: USAGE_CACHE_DIR, key, obj: snap, set: setOf[key] || null,
      source: snap.source || 'codex-rate-limits', backend: 'codex',
    });
  }
  _codexRateLimitCache = { overall, byAccount };
  _codexRateLimitCacheAt = now;
  return _codexRateLimitCache;
}
function summarizeCodexRateLimit() { return summarizeCodexRateLimits().overall; }

// THE RAW PROBE LOG READER (2.369.109, owner): the last N /usage probes with
// their verbatim reply, parse, write verdict and the machine-wide org context
// (`?key=<accountId>&rung=panel|control&limit=200`). Read-only; the file is
// data/usage-probe-log.ndjson (+ .1 after rotation).
app.get('/api/usage/probe-log', (req, res) => {
  const limit = Math.max(1, Math.min(2000, parseInt(req.query.limit, 10) || 200));
  const key = req.query.key ? String(req.query.key) : null;
  const rung = req.query.rung ? String(req.query.rung) : null;
  res.json({ records: probeLog.readProbeLog(path.dirname(USAGE_CACHE_DIR), { limit, key, rung }), file: path.join(path.dirname(USAGE_CACHE_DIR), probeLog.FILE) });
});
// THE STANDING IDENTITY REPAIR, BY HAND (B-855a c2). Human-triggered like ⟳
// (a cookie-authenticated POST; an agent's vsst_/jbt_ Bearer is refused — an
// agent must never re-anchor the identities its own bill is read from). Runs
// the same repair boot runs, then reloads the in-memory panel from disk and
// answers the report so the caller can see every sidecar/cache verdict.
// THE RESET CLAIM (lane account-reset-door, the owner 2026-11-11): a PERSON says «I reset this on the vendor's site» — one lane
// (`lanes: ['cap:fable']`, the lane where it is drawn) or the whole account (`lanes: 'all'`). A claim, never a reading: it
// bills nothing and calls no vendor (the client then presses the SAME ⟳ for that account — the road a person's press already
// has); an agent's token is refused. The answer names a wall that is NOT a quota (`wall`: the pool's verdict — the CLI not
// measured, the vault, the login): the claim stands for the quota, and that cause still keeps the account unplaceable.
// the store writer's own sentence for an act kept in memory, not on disk yet (src/agent-routes/status.js — one sentence, one key)
const NOT_DURABLE_WORDS = 'Saved, but not on disk yet — the storage has not written it (it is slow or failing). It stays in memory and is written when the storage can; a restart before then loses it.';
app.post('/api/accounts/:id/reset-claim', (req, res) => {
  if (pressBearer(req.headers)) return res.status(403).json({ error: 'human-triggered only — a reset claim is a person\'s word about the vendor\'s site', code: 'agent_forbidden' });
  const key = String(req.params.id || '');
  const isGlobal = key === '__global__';
  const acct = isGlobal ? null : (() => { try { return accounts.get(key) || null; } catch { return null; } })();
  if (!isGlobal) { const lh = (() => { try { return typeof accounts.held === 'function' ? (accounts.held() || null) : null; } catch { return { code: 'held-unknown' }; } })(); if (lh) return res.status(503).json({ error: 'the accounts list could not be read — try again once it reads', code: 'accounts_unread' }); }   // r3044 (5): the list UNREAD is not «unknown account»
  if (!isGlobal && !(acct && acct.type === 'subscription')) return res.status(404).json({ error: 'unknown subscription account', code: 'unknown_account' });
  // GATED ON THE HARNESS ROW (r2, MUST 6): a claim is for the lanes that go through the pool's ONE reading door — Claude's
  // typed limits (src/backend-caps.js oauthUsage). Another harness's readings (Codex, Antigravity) are refused BY NAME.
  if (!isGlobal && !oauthUsageAccount(acct)) return res.status(409).json({ error: `a reset claim is for Claude accounts' limits — ${acct.backend || 'this'} account readings do not take one`, code: 'no_claim_door', backend: acct.backend || null });
  const raw = isGlobal ? _rateLimitCache : (_accountUsage[key] || usageWrite.readCacheObject(USAGE_CACHE_DIR, key));
  const lanes = req.body && req.body.lanes === 'all' ? 'all' : (Array.isArray(req.body && req.body.lanes) ? req.body.lanes.slice(0, 16).map(String) : []);
  const r = resetClaims.claim(key, lanes, raw);
  if (!r.ok && r.code === 'reset_claims_unread') return res.status(503).json({ error: r.error, code: r.code });   // r3003 (b): the claims could not be read — refused by name
  if (!r.ok) return res.status(r.code === 'no-reading' ? 409 : 400).json({ error: r.code === 'no-reading' ? 'this account has no reading yet — nothing to mark as reset' : r.code === 'too-low' ? 'that limit reads under 5 % used — its next reading could show no reset' : r.code === 'bad-key' ? 'bad account' : 'unknown lane', code: r.code, ...(r.lanes ? { lanes: r.lanes } : {}) });
  let wall = null;
  try { wall = !isGlobal && typeof accounts.placeWallOf === 'function' ? accounts.placeWallOf(key) : null; } catch { wall = null; }
  let odMode = 'manual';
  try { odMode = serverSetting('accounts.onDemandQuotaRefresh') || 'manual'; } catch { }
  // A PERSON'S ACT IS ON DISK BEFORE ITS ANSWER (K2): the claims store's next write through the store writer. Not on disk
  // (law F — store-writer.js: a failed act is SAID): 503 `not-durable` with the store writer's own sentence, the claim beside
  // it (applied: in memory, the pool reads it) — the page says both (account-wall-words claimAnsweredWords)
  // B-5279 (主开发 r4942 (3)): `refresh` promises the page a read — false while the door refuses (Off, or the settings held)
  const body = { ok: true, lanes: r.lanes, at: r.at, wall, refresh: odMode !== 'off' && !panelDoorRefusal(serverSetting) };
  const notDurable = () => res.status(503).json({ ...body, code: 'not-durable', error: NOT_DURABLE_WORDS });
  resetClaims.persisted().then((durable) => {
  console.log(`[reset-claim] ${keyName(key)}: a person says ${r.lanes.join(', ')} ${r.lanes.length === 1 ? 'was' : 'were'} reset on the vendor's site — reset, unconfirmed until ${r.lanes.length === 1 ? 'its' : 'their'} next reading${wall ? ` (and it stays unplaceable: ${unplaceableText(wall)})` : ''}`);
  if (durable === false) return notDurable();
  res.json(body);
  }, notDurable);   // the wait itself failed: nothing says it is on disk
});
app.post('/api/accounts/:id/reset-claim/dismiss', (req, res) => {
  if (pressBearer(req.headers)) return res.status(403).json({ error: 'human-triggered only', code: 'agent_forbidden' });
  const lane = req.body && typeof req.body.lane === 'string' ? req.body.lane.slice(0, 80) : null;
  { const w = typeof resetClaims.unreadWords === 'function' ? resetClaims.unreadWords() : null; if (w) return res.status(503).json({ ok: false, code: 'reset_claims_unread', error: w }); }   // r3003 (b): held — refused by name
  const ok = resetClaims.dismiss(String(req.params.id || ''), lane);
  const notDurable = () => res.status(503).json({ ok, code: 'not-durable', error: NOT_DURABLE_WORDS });   // the dismissal applied, not on disk yet (law F)
  (ok ? resetClaims.persisted() : Promise.resolve(true)).then((durable) => (durable === false ? notDurable() : res.json({ ok })), notDurable);
});

app.post('/api/usage/repair-identity', async (req, res) => {
  const auth = String(req.headers.authorization || '');
  if (/^Bearer\s+(vsst_|jbt_)/i.test(auth)) return res.status(403).json({ error: 'human-triggered only', code: 'agent-forbidden' });
  if (typeof repairIdentityAnchors !== 'function') return res.status(503).json({ error: 'identity repair unavailable', code: 'no-engine' });
  // a PERSON's press (B-360d follow, 主开发 r1574): the sign-in facts read now within the person's bound, its reads at the head of
  // the keeper's queue — never the timer's unbounded settle
  let settled = null; try { settled = await accounts.signinFactsNow(null); } catch { }
  const rep = repairIdentityAnchors('manual', { since: settled && settled.since });
  if (rep && rep.error) { if (rep.changed) { try { reloadRateLimitCache(rep); } catch { } } return res.status(500).json({ error: 'identity repair failed: ' + rep.error, code: 'repair-failed' }); }   // B-574d (F6): what landed is applied first
  try { reloadRateLimitCache(rep); } catch { }   // r2430: the repair's verdict for the machine login's reading outranks memory
  try { for (const k of Object.keys(_onDemandUsageAt)) delete _onDemandUsageAt[k]; } catch { }
  // the folders this press could NOT compare (not read inside the person's bound, or unreadable) are NAMED in its reply (round
  // wge361035's small, 主开发 r2297): a row not read carries no email and is never grouped by one — the hourly run repairs it
  const notCompared = [];
  try { for (const [id, f] of (settled && settled.facts) || []) if (!f || f.state !== 'read') { const a = accounts.get(id); notCompared.push({ id, name: (a && a.name) || id, why: (f && f.why) || 'not-read-yet' }); } } catch { }
  res.json({ success: true, counts: rep.counts, ms: rep.ms, notCompared, identities: (rep.identities || []).map((r) => ({ key: r.key, name: r.name, apiPhase: r.apiPhase, n: r.n, of: r.of, sidecar: r.sidecar, sidecarWas: r.sidecarWas, cache: r.cache, readmitted: r.readmitted })) });
});

// THE ON-DEMAND READINGS (lane antigravity-card-fixes): a named account whose harness declares `quota.onDemand`
// (antigravity's `agy -p /usage`) has the typed limits the last PERSON'S Re-check wrote (src/server/cli-usage-door.js,
// through the one write path) — what the last press left, nothing estimated, nothing polled. Keyed by account id;
// agy's own window names ride along so the card says them as agy does.
function onDemandReadings() {
  const out = {};
  try {
    for (const a of (accounts.list().accounts || [])) {
      if (!a || !a.id || !harnesses.get(a.backend || 'claude')?.quota?.onDemand) continue;
      const c = usageWrite.readCacheObject(USAGE_CACHE_DIR, a.id);
      const reads = doorReads.todayOf(doorReads.readDoorReads(USAGE_CACHE_DIR, a.id), Date.now());   // how often its CLI was asked today, by whom
      const row = doorReads.homeAccountEntry(c, reads);   // law A3: an account read today with no reading yet is still served — its count is shown
      if (row) out[a.id] = row;
    }
  } catch { }
  return out;
}

app.get('/api/usage', async (req, res) => {
  // pick up whatever active sessions' statuslines just wrote: a refresh asked NOW, off the loop — its reply runs the ingestion
  // (one clock); a folder that does not reply within its bound answers the kept reply, and `usageFolder` says how old
  try { await usageFolder.fresh(); } catch { }
  // B-360d U3 (r1976 (a)): the answer after the await answers an error BY NAME — a throw there (the codex summary, the account list)
  // would otherwise be an unhandled rejection and the request never answered (the popup waits for its own timeout)
  try { usageAnswer(req, res); } catch (e) { try { res.status(500).json({ error: `the usage answer failed: ${(e && e.message) || e}` }); } catch { } }
});
function usageAnswer(req, res) {
  const codexRl = summarizeCodexRateLimits();
  const codexAccounts = {};
  const acctList = Object.keys(codexRl.byAccount || {}).length ? (accounts.list().accounts || []) : [];
  for (const [key, snap] of Object.entries(codexRl.byAccount || {})) {
    const meta = key === '__global_codex__' ? null : acctList.find((a) => a.id === key);
    codexAccounts[key] = { ...snap, name: meta?.name || null, email: meta?.email || null };
  }
  // A RESET CLAIM IS A VIEW (lane account-reset-door): the readings as every surface draws them — a claimed lane older than
  // its claim is viewed as reset (reset — unconfirmed); `resetClaims` names the lanes still claimed and the outcomes kept
  const viewedAccounts = {};
  const viewSafe = (id, snap) => { try { return resetClaims.viewOf(id, snap); } catch { return snap; } };   // a claim never fails the usage surface
  for (const [id, snap] of Object.entries(_accountUsage)) viewedAccounts[id] = viewSafe(id, snap);
  const viewedGlobal = _rateLimitCache ? viewSafe('__global__', _rateLimitCache) : _rateLimitCache;
  let claimsForClients = {}; try { claimsForClients = resetClaims.forClients(); } catch { claimsForClients = {}; }
  // WHEN EACH LANE WAS LAST STATED (the age badge, r3) — and K3: it rides INSIDE each account's reading (and the machine
  // login's), so every client assignment of `accounts` / `rateLimit` carries it (the roster's own loaders took the readings
  // raw and drew «read 14h ago» on a lane a ⟳ had just read); the top-level map stays for the popup's merge
  const lanesAt = (() => { const o = {}; try { for (const id of [...Object.keys(viewedAccounts), '__global__']) { const m = usageWrite.lanesReadAt(id); if (Object.keys(m).length) o[id] = m; } } catch { } return o; })();
  const accountsOut = {};
  for (const [id, a] of Object.entries(viewedAccounts)) accountsOut[id] = lanesAt[id] && a && typeof a === 'object' ? { ...a, lanesReadAt: lanesAt[id] } : a;
  // B-6a92 (主开发 r560): an account whose OWN weekly window is unknown because its readings name ANOTHER known account's window
  // (the engine held the move: its held window, read from the ENGINE'S MEMORY — r5, 主开发 r677: no file is read on a poll) — the
  // row says so by the other account's NAME as the person gave it, never an address; its numbers are never the other account's
  const nameOfOther = (k) => { try { const n = accounts.get(k)?.name; return typeof n === 'string' && n && !n.includes('@') ? n.slice(0, 80) : null; } catch { return null; } };
  const unknownOf = (id) => { try { const f = typeof apiDerivedWindow === 'function' ? (apiDerivedWindow(id, { held: true }) || {}).foreign : null; return f && Array.isArray(f.names) && f.names.length ? { others: f.names.slice(0, 4), otherNames: f.names.slice(0, 4).map(nameOfOther), phase: f.phase, at: f.at || null, ...(f.by === 'same-instant' ? { by: 'same-instant' } : {}) } : null; } catch { return null; } };
  let subIds = []; try { subIds = (accounts.list().accounts || []).filter((x) => x && x.type === 'subscription').map((x) => x.id); } catch { subIds = []; }   // a row with no witness sidecar answers nothing
  for (const id of new Set([...Object.keys(viewedAccounts), ...subIds])) { const u = unknownOf(id); if (u) accountsOut[id] = { ...(accountsOut[id] && typeof accountsOut[id] === 'object' ? accountsOut[id] : {}), windowUnknown: u }; }
  const globalOut = lanesAt.__global__ && viewedGlobal && typeof viewedGlobal === 'object' ? { ...viewedGlobal, lanesReadAt: lanesAt.__global__ } : viewedGlobal;
  res.json({
    usageFolder: usageFolder.state(),   // B-360d U3: { asOf, ageMs, held, since, error } — a held folder's readings are its last reply's
    rateLimit: globalOut, codexRateLimit: codexRl.overall, resetClaims: claimsForClients, lanesReadAt: lanesAt,
    subscriptionSignedOut: _oauthSignedOut, subscriptionSignedOutCause: _oauthSignedOutCause, accounts: accountsOut,
    // r3060 Q4: THE ACCOUNTS LIST UNREAD — the reply says so ({ code, at }, from the list's ONE fact), so `accounts` is never read as
    // «zero accounts, zero usage» (absent while the list reads); the panel's sentence that reads it is the list's lane's
    ...((() => { try { const h = typeof accounts.held === 'function' ? accounts.held() : null; return h ? { accountsHeld: { code: h.code || 'unread', at: Number(h.at) || null } } : {}; } catch { return { accountsHeld: { code: 'held-unknown', at: null } }; } })()),
    // Dead-reckoned CURRENT utilization per account key (B-fcff v2): anchor +
    // learned-rate × ledger-cost-since. Purely local computation (30s memo);
    // keys match `accounts` + '__global__'. The popup renders these as a dim
    // "est now" line so stale readings stop masquerading as current.
    estimates: (() => {
      try {
        const e = app.locals.usageEstimator;
        if (!e) return {};
        const out = {}; const now = Date.now();
        // usage-predict P2/P3: a lane is DRAWN only where this instance's verdict for its source is on (or, in the popup alone, provisional)
        // (src/usage-predict.js); every lane says its state, and how much was used here since the reading (the plain line)
        const screen = (id, est) => {
          if (!est) return null;
          const st = typeof e.predictStatesFor === 'function' ? e.predictStatesFor(id, est, now) : {};
          // law B4 (the look of 2026-11-15): the estimate carries ON lanes only — every surface draws those; a PROVISIONAL lane
          // rides `provisional`, read by the popup alone, which marks it
          const drawn = UP.gateEstimate(est, (k) => (st[k] || {}).state, (x) => x === 'on');
          const prov = UP.gateEstimate(est, (k) => (st[k] || {}).state, (x) => x === 'provisional');
          return { ...(drawn || { estimated: true, anchorAt: est.anchorAt, asOf: est.asOf, fiveHour: null, sevenDay: null, scopedWeekly: [] }),
            provisional: prov ? { fiveHour: prov.fiveHour || null, sevenDay: prov.sevenDay || null, scopedWeekly: prov.scopedWeekly || [] } : null,
            sinceCostUsd: est.sinceCostUsd, sinceRequests: est.sinceRequests ?? null, predict: st };
        };
        for (const [id, snap] of Object.entries(viewedAccounts)) {
          const est = screen(id, e.estimateFor(id, snap, now));
          if (est) out[id] = est;
        }
        const g = screen(null, e.estimateFor(null, viewedGlobal, now));
        if (g) out.__global__ = g;
        // codex identities estimate too (P1): same estimator, codex-prefixed
        // identities learned prior-less; keys match `codexAccounts`
        for (const [key, snap] of Object.entries(codexRl.byAccount || {})) {
          try { const est = screen(key, e.estimateFor(key, snap, now)); if (est) out[key] = est; } catch {}
        }
        return out;
      } catch { return {}; }
    })(),
    // CREDENTIAL STATE per named claude account (2026-09-07, panel honesty):
    // live / expired / wiped / missing / oat, with `since` = the instant the
    // account stopped being able to produce a reading (src/login-state.js —
    // the SAME module the pool's slot validation and the repair migration
    // read). The panel shows a signed-out member's LAST REAL reading with
    // "stale since", instead of presenting five-day-old foreign numbers as
    // current.
    // ACCOUNT-level, not file-level (r2): a wiped dir + a valid long-lived
    // token is a working account (`oatOnly` spawns, its readings are its own),
    // so the panel must not tell the user it is signed out and must not flag
    // its own fresh readings as somebody else's. `accountLoginState` answers
    // for both channels; `oatMintedAt` rides list() already.
    logins: (() => {
      try {
        const out = {};
        for (const a of (accounts.list().accounts || [])) {
          if (!oauthUsageAccount(a)) continue;
          // B-360d (ALSO CURED, 主开发 r1231): over the KEPT facts' reader — this read every named account's credential file ON THE
          // LOOP at every GET /api/usage; a folder not read yet (or unreadable) has no entry: no claim
          const rd = accounts.displayReaderOf(a.id);
          if (!rd) continue;
          const st = accountLoginState(accounts.subCredsPath(a.id), { backend: 'claude', oatMintedAt: a.oat ? (a.oatMintedAt || null) : null, rd });
          out[a.id] = { state: st.state, usable: st.usable, since: st.since || null };
        }
        return out;
      } catch { return {}; }
    })(),
    // Identity of each CLI's machine login (+ the named account it IS, when an
    // email matches) — the usage switchers render one entry, not two.
    globalLogin: _usageGlobalLink,
    codexGlobalLogin: _codexUsageGlobalLink,
    // B-ef83 r1648 (d): the spend ledger's LOCK, said where the owner looks at usage — 'unlocked' (counted without it since boot) |
    // 'refused' (turns nobody typed held: it cannot be written) | null; the meter draws its note (usage-meter `_renderUsage`)
    spendLedger: (() => { try { return spendGuard && typeof spendGuard.ledgerNotice === 'function' ? spendGuard.ledgerNotice() : null; } catch { return null; } })(),
    // Per-account codex quota snapshots (key = cxs id / '__global_codex__')
    codexAccounts,
    // Remote hosts' own-login quota snapshots (on-demand ⟳ only), keyed by
    // host id — every CONFIGURED host is listed (no-data hosts included, so
    // the popup offers the first ⟳)
    hosts: (() => {
      try {
        const out = {};
        for (const h of hosts?.list() || []) out[h.id] = { ...(_hostUsage[h.id] || {}), name: h.name };
        return out;
      } catch { return _hostUsage; }
    })(),
    // Host-HELD account quota snapshots (2.245.0, on-demand ⟳ only), keyed
    // '<hostId>:<accountId>' — the Agents machine sections' per-row usage
    hostAccounts: _hostAcctUsage,
    // Named accounts read on a person's Re-check (quota.onDemand — antigravity), keyed by account id
    homeAccounts: onDemandReadings(),
  });
}


  // B-5279: the read's callers (the pool engine's probe) learn the door's refusal from the READ'S OWN VERDICT — the one this read
  // recorded at or after `since` (r4932: one fact, never a second read of the row)
  refreshViaCliPanel.refusal = (key, since = 0) => { const v = _panelVerdict[key]; return v && v.outcome === 'not-probed' && DOOR_CODES.includes(v.code) && (Number(v.at) || 0) >= since ? { code: v.code, message: String(v.why || '') } : null; };
  return { refreshViaCliPanel, panelVerdictFor, getOAuthToken, usagePollingEnabled, refreshRateLimit, reloadRateLimitCache, ingestPassiveUsage, summarizeCodexRateLimit, summarizeCodexRateLimits };
}

module.exports = { setupUsage, parseCliUsageText, normalizeCodexRateLimit, PANEL_PROBE_ARGS, spawnPanelProbe, getOAuthToken };   // getOAuthToken: the machine login's kept read (r2575's legs, scripts/test-cli-usage-parse)
Object.assign(module.exports, { panelDoorRefusal, PANEL_OFF, PANEL_NO_READER, PANEL_HELD });   // B-5279: the fence's verdict and its two codes (the mint's wiring, the suites)
