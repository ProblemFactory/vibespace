/**
 * Password authentication — optional, single-password (team-shared) model.
 *
 * - No password configured → auth disabled entirely (local single-user compat).
 * - Password sources: VIBESPACE_PASSWORD env var, or data/auth.json (persisted
 *   scrypt hash — written by setPassword / the generate path).
 * - Sessions: random bearer tokens in an HttpOnly cookie, persisted server-side
 *   in data/auth.json so restarts don't log everyone out — as sha256(token)
 *   ONLY (lane vault-e2e-password-fix-r2: a copy of auth.json opens no login;
 *   a plaintext map an older build wrote is hashed at the first start, every
 *   login staying valid). A login lives 30 days from its LAST use (each use
 *   slides it) and never past 180 days from its sign-in (the cap — the owner's
 *   decision ④, design q-042 D9); a vault LOCK signs every login out (the hub's
 *   wiring calls revokeAllTokens and closes every page's socket).
 * - Login attempts are rate limited per IP (5 fails → 60s lock).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const appCsp = require('./app-csp.js'); // PURE: the sign-in page's report-only policy (lane app-page-csp)
const { crossSiteVerdict, ownOriginOf } = require('./write-origin.js');
const { replaceShredding } = require('./secret-file.js');

const TOKEN_COOKIE = 'vs_token';
const TOKEN_TTL_MS = 180 * 24 * 3600 * 1000; // THE CAP: 180 days from the sign-in, however often the login is used
const TOKEN_IDLE_MS = 30 * 24 * 3600 * 1000; // THE SLIDE: 30 days from the last use (each use extends it)
const TOKEN_SLIDE_SAVE_MS = 3600 * 1000;     // a use moves `usedAt` on disk (and the cookie's Max-Age) at most once an hour
const MAX_TOKENS = 200;
/** auth.json keys a login by sha256(token) — never the token. A 48-hex key is a token an older build stored (hashed at load). */
const tokenDigest = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
const DIGEST_RE = /^[0-9a-f]{64}$/;

class Auth {
  constructor(dataDir, { clerk = null } = {}) {
    this._file = path.join(dataDir, 'auth.json');
    this._state = null; // { passwordHash, salt, tokens: { token: {createdAt, ua} } }
    this._attempts = new Map(); // ip -> { fails, lockUntil }
    this._clerk = clerk; // optional ClerkAuth (src/clerk-auth.js)
    this._load();
  }

  _load() {
    try { this._state = JSON.parse(fs.readFileSync(this._file, 'utf-8')); } catch { this._state = null; }
    // THE MIGRATION (once, at the first start of this build): a plaintext token map becomes its digests — every login
    // stays valid ONCE (the cookie's token hashes to its key; an older build never stamped a use, so the migration counts as
    // one: 30 days from now, still inside its 180-day cap); the old file's bytes are overwritten (replaceShredding)
    const t = this._state && this._state.tokens;
    if (t && typeof t === 'object' && Object.keys(t).some((k) => !DIGEST_RE.test(k))) {
      const out = {}, now = Date.now();
      for (const [k, v] of Object.entries(t)) { const d = DIGEST_RE.test(k) ? k : tokenDigest(k); out[d] = { ...(v || {}), usedAt: Number(v && v.usedAt) || now }; }
      this._state.tokens = out;
      try { this._save(); } catch (e) { console.warn('[auth] the login tokens could not be re-written as digests:', e.message); }
    }
  }

  _save() {
    if (!this._state) return;
    if (this._state.tokens) this._state.tokensHashed = 1;   // a reader's note: the keys are sha256 digests
    replaceShredding(this._file, JSON.stringify(this._state));   // 0600, atomic; the replaced bytes overwritten
  }

  /** The login a cookie token names → its record, or null. Looked up by its DIGEST (the map key): the token itself never
   *  meets a comparison — the only compare is the map's, over sha256 digests of what the caller sent, which leaks no prefix
   *  of any stored login (no early exit over a secret: the constant-time property the plaintext keys never had). */
  _login(token) {
    if (!token || !this._state || !this._state.tokens) return null;
    const d = tokenDigest(token);
    return Object.prototype.hasOwnProperty.call(this._state.tokens, d) ? this._state.tokens[d] : null;
  }
  /** alive = inside the cap (180 days from the sign-in) AND the slide (30 days from the last use) */
  static loginAlive(rec, now = Date.now()) {
    if (!rec) return false;
    const born = Number(rec.createdAt) || 0, used = Number(rec.usedAt || rec.createdAt) || 0;
    return now - born < TOKEN_TTL_MS && now - used < TOKEN_IDLE_MS;
  }
  /** The cookie's Max-Age for a login: the slide, never past the cap. */
  static cookieMaxAge(rec, now = Date.now()) {
    const left = rec ? TOKEN_TTL_MS - (now - (Number(rec.createdAt) || now)) : TOKEN_IDLE_MS;
    return Math.max(0, Math.floor(Math.min(TOKEN_IDLE_MS, left) / 1000));
  }

  /** A configured password specifically (Clerk SSO alone also enables auth). */
  get passwordEnabled() { return !!(this._state && this._state.passwordHash); }

  get enabled() { return this.passwordEnabled || !!this._clerk?.enabled; }

  /** SSO (Clerk) specifically — login is handled by the IdP; a local password
   *  is redundant and is skipped in onboarding / ignored on config import. */
  get ssoEnabled() { return !!this._clerk?.enabled; }

  _hash(password, salt) {
    return crypto.scryptSync(String(password), Buffer.from(salt, 'hex'), 32).toString('hex');
  }

  /**
   * Set (or replace) the password. Existing login tokens stay valid (in-app
   * changes go through the /api/auth/set-password route, which revokes them).
   * userSet marks a password configured from INSIDE the app — boot-time env
   * resolution never overrides a user-set state (incl. user-removed).
   */
  setPassword(password, { userSet = false } = {}) {
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = this._hash(password, salt);
    this._state = { passwordHash, salt, userSet: userSet || this._state?.userSet || false, tokens: this._state?.tokens || {} };
    this._save();
  }

  /** Disable auth entirely (user choice — env won't re-enable on next boot). */
  removePassword() {
    this._state = { userSet: true, tokens: {} };
    this._save();
  }

  /** Revoke every login token except (optionally) one — in-app password change kicks all other devices; a vault LOCK
   *  revokes them all (lane vault-e2e-password-fix-r2 — the hub's wiring). → how many logins ended. */
  revokeAllTokens(exceptToken = null) {
    if (!this._state) return 0;
    const d = exceptToken ? tokenDigest(exceptToken) : null;
    const keep = d && this._state.tokens ? this._state.tokens[d] : null;
    const n = Object.keys(this._state.tokens || {}).length - (keep ? 1 : 0);
    this._state.tokens = keep ? { [d]: keep } : {};
    this._save();
    return n;
  }

  /** Export the password record for config transfer (hash + salt, never tokens). */
  exportPasswordRecord() {
    if (!this.passwordEnabled) return null;
    return { passwordHash: this._state.passwordHash, salt: this._state.salt };
  }

  /** Import a password record (config transfer). Revokes all tokens — caller should issue a fresh one. */
  importPasswordRecord(rec) {
    if (!rec?.passwordHash || !rec?.salt) throw new Error('invalid password record');
    this._state = { passwordHash: String(rec.passwordHash), salt: String(rec.salt), userSet: true, tokens: {} };
    this._save();
  }

  /**
   * Boot-time resolution:
   * - user-set state (configured in-app, incl. explicit removal) → ALWAYS kept;
   *   env vars never override it.
   * - VIBESPACE_PASSWORD env → (re)set if it doesn't match the stored hash.
   * - else stored auth.json → keep.
   * - else if generateIfMissing (container first boot) → random password,
   *   returned so the caller can print it prominently.
   * Returns { generated?: string } — the plaintext ONLY when freshly generated.
   */
  ensurePassword({ generateIfMissing = false } = {}) {
    if (this._state?.userSet) return {};
    const envPw = process.env.VIBESPACE_PASSWORD;
    if (envPw) {
      if (!this.passwordEnabled || this._hash(envPw, this._state.salt) !== this._state.passwordHash) {
        this.setPassword(envPw);
      }
      return {};
    }
    if (this.passwordEnabled) return {};
    if (generateIfMissing) {
      const pw = crypto.randomBytes(9).toString('base64url'); // 12 chars, url-safe
      this.setPassword(pw);
      return { generated: pw };
    }
    return {};
  }

  verifyPassword(password) {
    if (!this.passwordEnabled) return false;
    const got = Buffer.from(this._hash(password, this._state.salt), 'hex');
    const want = Buffer.from(this._state.passwordHash, 'hex');
    return got.length === want.length && crypto.timingSafeEqual(got, want);
  }

  issueToken(ua = '') {
    const token = crypto.randomBytes(24).toString('hex');
    const now = Date.now();
    // Clerk-only instances may have no auth.json yet — tokens still persist
    this._state = this._state || { tokens: {} };
    this._state.tokens = this._state.tokens || {};
    this._state.tokens[tokenDigest(token)] = { createdAt: now, usedAt: now, ua: String(ua).slice(0, 120) };   // the DIGEST — never the token
    // Evict the dead + cap the total (the least recently used first)
    const entries = Object.entries(this._state.tokens)
      .filter(([, v]) => Auth.loginAlive(v, now))
      .sort((a, b) => (a[1].usedAt || a[1].createdAt) - (b[1].usedAt || b[1].createdAt));
    while (entries.length > MAX_TOKENS) entries.shift();
    this._state.tokens = Object.fromEntries(entries);
    this._save();
    return token;
  }

  /** A use of a login: alive ⇒ it SLIDES (in memory now; on disk at most once an hour) → true. */
  checkToken(token) {
    if (!this.enabled) return true;
    const rec = this._login(token);
    const now = Date.now();
    if (!Auth.loginAlive(rec, now)) return false;
    const was = Number(rec.usedAt || rec.createdAt) || 0;
    rec.usedAt = now;
    if (now - was >= TOKEN_SLIDE_SAVE_MS) { (this._slid || (this._slid = new Set())).add(tokenDigest(token)); try { this._save(); } catch { /* the in-memory slide holds; the next use saves */ } }
    return true;
  }

  /** The cookie follows the slide: a use that moved `usedAt` on disk re-sets the cookie's Max-Age (30 days, never past
   *  the cap) — a login used every day never expires in the browser before the cap. */
  _slideCookie(req, res, token) {
    const rec = this._login(token), d = token ? tokenDigest(token) : null;
    if (!rec || !this._slid || !this._slid.delete(d) || !res || typeof res.append !== 'function') return;
    const secure = req.headers['x-forwarded-proto'] === 'https' ? ' Secure;' : '';
    res.append('Set-Cookie', `${TOKEN_COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${Auth.cookieMaxAge(rec)}; SameSite=Lax;${secure}`);
  }

  revokeToken(token) {
    const d = token ? tokenDigest(token) : null;
    if (d && this._state?.tokens?.[d]) { delete this._state.tokens[d]; this._save(); }
  }

  // ── Rate limiting ──
  _rateCheck(ip) {
    const a = this._attempts.get(ip);
    if (a && a.lockUntil > Date.now()) return false;
    return true;
  }
  _rateFail(ip) {
    const a = this._attempts.get(ip) || { fails: 0, lockUntil: 0 };
    a.fails++;
    if (a.fails >= 5) { a.lockUntil = Date.now() + 60000; a.fails = 0; }
    this._attempts.set(ip, a);
  }
  _rateOk(ip) { this._attempts.delete(ip); }

  // ── HTTP integration ──

  /** lane device-act-audit: WHO a cookie request is, for an audit line — 12 hex of the sign-in cookie's sha256 (never the
   *  cookie itself; one sign-in = one handle), or null without one. The ONE cookie reader stays this file (test-auth). */
  static signInHandle(req) { const t = Auth.cookieToken(req); return t ? tokenDigest(t).slice(0, 12) : null; }   // int317: the ONE hash door — the first 12 hex of auth.json's key for this login (no secret)

  static cookieToken(req) {
    const h = req.headers.cookie || '';
    const m = h.match(new RegExp('(?:^|;\\s*)' + TOKEN_COOKIE + '=([a-f0-9]+)'));
    return m ? m[1] : null;
  }

  /** THE SAME-ORIGIN RULE for this request (src/write-origin.js): a write or a WebSocket handshake that rides the
   *  cookie must come from this instance's own page — its own origin as the reverse proxies forward it */
  originVerdict(req) {
    return crossSiteVerdict({ method: req.method, headers: req.headers || {} }, ownOriginOf(req.headers, { encrypted: !!(req.socket && req.socket.encrypted) }));
  }

  /** ONE log line per refusal — at most 5 a minute, the rest counted (a hostile page can repeat itself) */
  _logCrossSite(req, v) {
    const now = Date.now(), w = this._xsLog || (this._xsLog = { at: 0, n: 0, muted: 0 });
    if (now - w.at > 60e3) { if (w.muted) console.warn(`[auth] ${w.muted} more cross-site refusals in the last minute (not logged one by one)`); w.at = now; w.n = 0; w.muted = 0; }
    if (++w.n > 5) { w.muted++; return; }
    const route = String(req.path || req.url || '').split('?')[0].split('/').slice(0, 4).join('/') || '/'; // first 3 segments — paths can carry user data
    console.warn(`[auth] refused a cross-site ${req.headers && req.headers.upgrade ? 'WebSocket' : String(req.method)} ${route} — ${v.why}, origin ${JSON.stringify(String(v.origin || '-').slice(0, 120))} (own ${v.own || '-'})`);
  }

  /** true when this request carries a valid token (or auth is disabled) — and, a write or a WebSocket handshake, came
   *  from this instance's own page: every caller (the upgrade dispatcher's /ws and /proxy/, the desktop and browser
   *  streams, private /svc mounts, private /p pages) inherits the same-origin rule */
  requestAuthed(req) {
    const v = this.originVerdict(req);
    if (!v.ok) { this._logCrossSite(req, v); return false; }
    if (!this.enabled) return true;
    return this.checkToken(Auth.cookieToken(req));
  }

  /** Express middleware guarding everything except the login flow — server.js mounts it BEFORE every router */
  middleware() {
    return (req, res, next) => {
      const p = req.path;
      // ── THE DOORS: callers that are not the owner's browser, each judged by its OWN credential — never the cookie,
      // so never the same-origin rule below (a door's refusals are its own) ──
      // WebDAV bridge authenticates with scoped Bearer mount tokens (webdav.js)
      if (p === '/dav' || p.startsWith('/dav/')) return next();
      // Agent endpoints authenticate with per-session tokens spawned into the
      // agent's env (vsst_ — see /api/agent/session-status); no cookie exists
      // inside an agent's shell, so these must bypass cookie auth.
      if (p.startsWith('/api/agent/')) return next();
      // Ctrl+G editor bridge: the fake `code` script runs inside the session
      // shell (no cookie) and sends the same vsst_ token — the ROUTE validates
      // it. Cookie-gating this silently broke Ctrl+G whenever auth was on.
      if (p === '/api/editor/open') return next();
      // Standalone device install: the agentd bundle + installer are public
      // (the bundle is not secret; the /api/agentd-dial upgrade is gated by the
      // per-device dial token). A NAT device fetches these before any cookie.
      // BOTH name generations must be exempt — the 2.154.x vibespace-device
      // rename added the canonical routes but not these exemptions, so every
      // auth-enabled instance 401'd the NEW pairing command (real Mac report).
      if (p === '/agentd.js' || p === '/agentd-install.sh' || p === '/agentd-install.ps1'
        || p === '/vibespace-device.js' || p === '/vibespace-device-install.sh' || p === '/vibespace-device-install.ps1') return next();
      if (p === '/api/agentd-dial') return next();
      // Node runtime mirror for the installer (2.246.0): the device fetches it
      // BEFORE it has any node — let alone a cookie. Read-only, allowlisted.
      if (p.startsWith('/vibespace-node/')) return next();
      // Telemetry collector ingest: remote VibeSpace instances authenticate
      // with the shared Bearer token — the ROUTE enforces it (404 when the
      // collector is off, 403 on a bad token); no cookie exists on the sender.
      if (p === '/api/telemetry/ingest') return next();
      // The maintainer hub's feedback doors (lane feedback-forward): another instance forwards an agent's report and pulls
      // the maintainer's marks back with the SAME shared Bearer token + its own origin key — the ROUTE judges both
      // (src/routes/feedback.js: the collector's verdict, 404 off / 403 bad token); no cookie exists on the sender. The
      // method is exact: PATCH /api/feedback/:id (the owner's) stays the cookie's. Pinned by test-auth's DOORS row.
      if ((req.method === 'POST' && p === '/api/feedback/forward') || (req.method === 'GET' && p === '/api/feedback/forward/marks')) return next();
      // CSP reports (lane app-page-csp, design q-043 D6): a browser posts what the app page's report-only policy would
      // block with NO cookie, and a sandboxed frame's report with `Origin: null` — so neither the cookie nor the same-origin
      // rule can judge it. The ROUTE judges its own (src/server/csp-reports.js): a report content type only (a page on
      // another site cannot send one without a preflight), 32 KB, a per-address pace. POST exactly. Pinned by test-auth's
      // DOORS row and scripts/test-csp-report.mjs.
      if (req.method === 'POST' && p === '/api/csp-report') return next();
      // THE PREVIEW'S FOLDER (lane frame-host-preview, B-5b2c): the code editor's HTML preview is an opaque frame (no
      // allow-same-origin) and its requests carry NO cookie (measured: SameSite=Lax, Sec-Fetch-Site cross-site) — its
      // page's own files come from /frame-host/f/<token>/…, the token minted on the SIGNED-IN navigation for ONE folder.
      // The ROUTE judges it (src/server/frame-host.js: a live token, a web file under that folder, no dot name, no symlink
      // out). GET exactly. Pinned by scripts/test-csp-report.mjs ⑧.
      if (req.method === 'GET' && /^\/frame-host\/f\/[A-Za-z0-9_-]{24}\//.test(p)) return next();
      // Path-mounted services (2.359.0): auth is PER MOUNT — the handler in
      // src/server/path-mounts.js enforces requestAuthed for private mounts
      // and lets `pathPublic` ones through (the shareable-link case). A
      // blanket cookie gate here would make public mounts impossible; the
      // per-mount check is pinned by scripts/test-path-mounts.mjs.
      if (p === '/svc' || p.startsWith('/svc/')) return next();
      // OTel truth ingest (2.361.0): the local claude CLI's OTLP exporter has
      // no cookie — src/server/otel-ingest.js enforces loopback remoteAddress
      // + the persisted x-vibespace-otel token as the ONLY gate (pinned by
      // scripts/test-otel-truth.mjs).
      if (p.startsWith('/otel/')) return next();
      // Published pages (2.364.0): auth is PER PAGE, same doctrine as /svc —
      // src/server/published-pages.js gates private pages via requestAuthed
      // and lets `public` ones through (the shareable-link case). Pinned by
      // scripts/test-published-pages.mjs.
      if (p.startsWith('/p/')) return next();
      // Slack consent landing (2.369.214, design 018): Slack / the relay page
      // sends the browser that pressed Allow here — often ANOTHER browser
      // profile with no cookie (a fleet user's Slack identity lives apart from
      // their SSO login), and the redirect to /login lost the code. The signed
      // STATE is the credential: src/routes/channels.js rate-limits per IP,
      // judges this boot's HMAC + age, finds a running public flow by the whole
      // state and exchanges once; the RECORD is still made by the owner's
      // cookied tab (connect {flowId}). GET + exactly /api/channels/oauth/cb/<kind>
      // — pinned by scripts/test-slack-landing-nologin.mjs.
      if (req.method === 'GET' && /^\/api\/channels\/oauth\/cb\/[^/]+$/.test(p)) return next();
      // THE WEBHOOK DOOR (lane webhook-l1-server, docs/design-webhook.zh.md §4): a caller is an external system holding its
      // own token — src/routes/webhook.js judges it (every refusal before a byte of the body). The WHOLE /hook prefix (any
      // method: a non-POST is its 405; /hook/<slug>/, /hook/<SLUG>, /hook/x/y are its misses — verify r1 #6, ONE shape), a
      // caller's GET of its own replies, and the pairing completion. Pinned by scripts/test-webhook-routes.mjs.
      if (/^\/hook(?:\/|$)/.test(p) || (req.method === 'GET' && /^\/api\/channels\/webhook\/[a-z0-9][a-z0-9-]{0,62}\/replies$/.test(p)) || (req.method === 'POST' && /^\/api\/channels\/webhook\/[a-z0-9][a-z0-9-]{0,62}\/pair$/.test(p))) return next();
      // ── THE SAME-ORIGIN RULE (lane owner-write-origin, B-6b2b): every other write rides the owner's cookie — or, on an
      // instance nobody signs in to, its open door — and must come from VibeSpace's own page; a page on another site
      // (a same-site sibling too: the fleet's pods share one domain) is refused by name, before any router ──
      const v = this.originVerdict(req);
      if (!v.ok) { this._logCrossSite(req, v); return res.status(403).json({ error: 'cross-site', origin: v.origin, own: v.own }); }
      if (!this.enabled) return next();
      // the login flow (logout revokes only the token it presents)
      if (p === '/login' || p === '/api/login' || p === '/api/clerk-login' || p === '/api/logout' || p === '/favicon.ico') return next();
      { const tok = Auth.cookieToken(req); if (this.checkToken(tok)) { this._slideCookie(req, res, tok); return next(); } }
      // Browsers navigating to pages get the login form; API calls get 401
      const wantsHtml = req.method === 'GET' && (req.headers.accept || '').includes('text/html');
      if (wantsHtml) return res.redirect('/login');
      res.status(401).json({ error: 'unauthorized' });
    };
  }

  /** Issue a login token + set the cookie (shared by password + Clerk login). */
  _grantSession(req, res) {
    const token = this.issueToken(req.headers['user-agent']);
    // Secure only behind an https INGRESS (no http door to that host): the hub's own https (src/server/tls.js) shares ONE
    // port + host with http, and a Secure cookie set over it would lock the http origin out (Chrome: an insecure origin
    // never reads or overwrites a Secure cookie) — lane https-tailscale, cookies as before (req.secure was never true)
    const secure = req.headers['x-forwarded-proto'] === 'https' ? ' Secure;' : '';
    res.setHeader('Set-Cookie', `${TOKEN_COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${Math.floor(TOKEN_IDLE_MS / 1000)}; SameSite=Lax;${secure}`);   // the slide's 30 days (each use re-sets it)
    return token;
  }

  /** Register /login + /api/login + /api/clerk-login + /api/logout on the app */
  registerRoutes(app) {
    app.get('/login', (req, res) => {
      if (!this.enabled || this.requestAuthed(req)) return res.redirect('/');
      // lane app-page-csp: the sign-in page reports too — its one inline script carries this response's nonce
      const nonce = crypto.randomBytes(16).toString('base64');
      res.set(appCsp.HEADER, appCsp.loginPolicy({ nonce, clerkHost: this._clerk?.enabled ? this._clerk.frontendApi : '' }));
      res.type('html').send(loginHtml({ clerk: this._clerk, passwordEnabled: this.passwordEnabled, nonce }));
    });

    // Clerk SSO exchange: the login page verified the user on Clerk's hosted
    // UI and posts the session JWT here. Verify signature/exp/iss vs Clerk's
    // JWKS, gate on the email allowlist, then issue OUR cookie token — from
    // here on the session is indistinguishable from a password login.
    app.post('/api/clerk-login', express_json_lite, async (req, res) => {
      if (!this._clerk?.enabled) return res.status(404).json({ error: 'SSO not configured' });
      const ip = req.socket.remoteAddress || '?';
      if (!this._rateCheck(ip)) return res.status(429).json({ error: 'Too many attempts — wait a minute' });
      try {
        const { email } = await this._clerk.verifyToken(String(req.body?.token || ''));
        if (!email) {
          return res.status(403).json({ error: 'Token has no email claim — add {"email": "{{user.primary_email_address}}"} to the Clerk session token custom claims (or a "vibespace" JWT template)' });
        }
        if (!this._clerk.emailAllowed(email)) {
          this._rateFail(ip);
          return res.status(403).json({ error: `${email} is not allowed on this instance` });
        }
        this._rateOk(ip);
        this._grantSession(req, res);
        res.json({ success: true, email });
      } catch (e) {
        this._rateFail(ip);
        res.status(401).json({ error: `SSO verification failed: ${e.message}` });
      }
    });

    app.post('/api/login', express_json_lite, (req, res) => {
      if (!this.enabled) return res.json({ success: true });
      const ip = req.socket.remoteAddress || '?';
      if (!this._rateCheck(ip)) return res.status(429).json({ error: 'Too many attempts — wait a minute' });
      const pw = String(req.body?.password ?? '');
      if (!this.verifyPassword(pw)) {
        this._rateFail(ip);
        return res.status(401).json({ error: 'Wrong password' });
      }
      this._rateOk(ip);
      this._grantSession(req, res);
      res.json({ success: true });
    });

    app.post('/api/logout', (req, res) => {
      const token = Auth.cookieToken(req);
      if (token) this.revokeToken(token);
      res.setHeader('Set-Cookie', `${TOKEN_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
      res.json({ success: true });
    });

    // In-app password management. A configured password must be presented
    // again (defense against an unlocked screen); an SSO-only instance needs a
    // signed-in request (the route's own check — see below). When auth is
    // disabled, setting a password is open — that's how a local instance opts
    // INTO auth.
    // Changing/setting revokes every other device's token (that's usually the
    // point); the caller gets a fresh token so they stay logged in.
    app.post('/api/auth/set-password', express_json_lite, (req, res) => {
      // WHO MAY SET A PASSWORD is judged HERE too, by the instance's state — server.js registered these routes BEFORE
      // the cookie gate until .274 (lane owner-write-origin: on a Clerk-only instance an anonymous POST set a password,
      // revoked every token and handed the caller a session); the route never leans on a mount order again:
      //   a password configured ⇒ the current password (below) · SSO and no password ⇒ a signed-in request only ·
      //   neither ⇒ open — that is how a local instance opts INTO auth (first-run onboarding)
      if (this.enabled && !this.passwordEnabled && !this.requestAuthed(req)) return res.status(401).json({ error: 'unauthorized' });
      const ip = req.socket.remoteAddress || '?';
      if (!this._rateCheck(ip)) return res.status(429).json({ error: 'Too many attempts — wait a minute' });
      const { current, newPassword, remove } = req.body || {};
      // Gate on the PASSWORD being set (not this.enabled): a Clerk-only
      // instance has no current password — its cookie-authed user may set one.
      if (this.passwordEnabled) {
        if (!this.verifyPassword(String(current ?? ''))) {
          this._rateFail(ip);
          return res.status(401).json({ error: 'Current password is wrong' });
        }
        this._rateOk(ip);
      }
      if (remove) {
        if (!this.passwordEnabled) return res.json({ success: true, enabled: this.enabled });
        this.removePassword();
        res.setHeader('Set-Cookie', `${TOKEN_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
        return res.json({ success: true, enabled: this.enabled }); // Clerk may keep auth on
      }
      const pw = String(newPassword ?? '');
      if (pw.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
      this.setPassword(pw, { userSet: true });
      this.revokeAllTokens();
      const token = this.issueToken(req.headers['user-agent']);
      const secure = req.headers['x-forwarded-proto'] === 'https' ? ' Secure;' : ''; // ingress only — the hub's own https shares the host with http (above)
      res.setHeader('Set-Cookie', `${TOKEN_COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${Math.floor(TOKEN_IDLE_MS / 1000)}; SameSite=Lax;${secure}`);
      res.json({ success: true, enabled: true });
    });
  }
}

// Minimal body parser for the login route only (registered before express.json)
function express_json_lite(req, res, next) {
  if (req.body !== undefined) return next();
  let data = '';
  req.on('data', (c) => { data += c; if (data.length > 4096) req.destroy(); });
  req.on('end', () => {
    try { req.body = JSON.parse(data || '{}'); } catch { req.body = {}; }
    next();
  });
}

/**
 * The login page. Password form when a password is set; Clerk SSO section
 * when Clerk is configured (either alone or alongside the password). The
 * ClerkJS bundle is served from the instance's own Clerk frontend-API host.
 * SSO flow: button → Clerk hosted sign-in (redirect back here) → on load with
 * a live Clerk session, auto-exchange the session JWT at /api/clerk-login →
 * our cookie. A 403 (email not allowed / missing claim) offers an SSO
 * sign-out link so the user can retry with a different account.
 */
function loginHtml({ clerk = null, passwordEnabled = true, nonce = '' } = {}) {
  const clerkOn = !!clerk?.enabled;
  const sub = passwordEnabled
    ? 'Enter the workspace password'
    : 'Sign in with your organization account';
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>VibeSpace — Login</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; height:100vh; display:flex; align-items:center; justify-content:center;
         background:#0f1115; color:#e2e5ea; font-family:-apple-system,'Segoe UI',Roboto,sans-serif; }
  .card { background:#161a21; border:1px solid #262c37; border-radius:12px; padding:36px 40px;
          width:320px; box-shadow:0 12px 40px rgba(0,0,0,.5); }
  h1 { margin:0 0 4px; font-size:20px; letter-spacing:.3px; }
  p  { margin:0 0 22px; font-size:12px; color:#8a93a3; }
  input { width:100%; box-sizing:border-box; padding:10px 12px; font-size:14px; border-radius:8px;
          border:1px solid #2b3341; background:#0d1015; color:#e2e5ea; outline:none; }
  input:focus { border-color:#2dd4bf; }
  button { width:100%; margin-top:14px; padding:10px; font-size:14px; font-weight:600; border:none;
           border-radius:8px; background:#2dd4bf; color:#042f2a; cursor:pointer; }
  button:hover { background:#575af0; }
  button.sso { background:#3b4252; color:#e2e5ea; }
  button.sso:hover { background:#4c566a; }
  .or { display:flex; align-items:center; gap:10px; margin:16px 0 2px; color:#5b6270; font-size:11px; }
  .or::before, .or::after { content:''; flex:1; height:1px; background:#262c37; }
  .err { color:#f87171; font-size:12px; min-height:16px; margin-top:10px; }
  .err a { color:#8a93a3; }
</style></head>
<body><form class="card" id="f">
  <h1>VibeSpace</h1>
  <p>${sub}</p>
  ${passwordEnabled ? `
  <input type="password" id="pw" placeholder="Password" autofocus autocomplete="current-password">
  <button type="submit">Sign in</button>` : ''}
  ${clerkOn ? `${passwordEnabled ? `<div class="or">or</div>` : ''}
  <button type="button" class="sso" id="sso" disabled>Loading SSO…</button>` : ''}
  <div class="err" id="err"></div>
</form>
<script nonce="${nonce}">
  const err = document.getElementById('err');
  document.getElementById('f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pwEl = document.getElementById('pw');
    if (!pwEl) return;
    err.textContent = '';
    try {
      const r = await fetch('/api/login', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ password: pwEl.value }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok) location.href = '/';
      else err.textContent = d.error || 'Login failed';
    } catch { err.textContent = 'Network error'; }
  });
  ${clerkOn ? `
  (() => {
    const PK = ${JSON.stringify(clerk.publishableKey)};
    const ssoBtn = document.getElementById('sso');
    const s = document.createElement('script');
    s.src = ${JSON.stringify(`https://${clerk.frontendApi}/npm/@clerk/clerk-js@5/dist/clerk.browser.js`)};
    s.async = true;
    s.crossOrigin = 'anonymous';
    // clerk-js v5 from the CDN self-bootstraps window.Clerk as an INSTANCE
    // using this attribute ("window.Clerk is not a constructor" without it).
    s.setAttribute('data-clerk-publishable-key', PK);
    s.onerror = () => { ssoBtn.textContent = 'SSO unavailable'; };
    s.onload = async () => {
      try {
        // Instance (v5 CDN) or constructor (older builds) — accept both.
        const clerk = typeof window.Clerk === 'function' ? new window.Clerk(PK) : window.Clerk;
        await clerk.load({ standardBrowser: true });
        const exchange = async () => {
          ssoBtn.disabled = true;
          ssoBtn.textContent = 'Signing in…';
          let token = null;
          // Prefer a "vibespace" JWT template (guaranteed email claim); fall
          // back to the plain session token (works when the dashboard adds
          // email to the session token's custom claims).
          try { token = await clerk.session.getToken({ template: 'vibespace' }); } catch {}
          if (!token) token = await clerk.session.getToken();
          const r = await fetch('/api/clerk-login', { method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ token }) });
          const d = await r.json().catch(() => ({}));
          if (r.ok) { location.href = '/'; return; }
          ssoBtn.disabled = false;
          ssoBtn.textContent = 'Sign in with SSO';
          err.innerHTML = '';
          err.appendChild(document.createTextNode(d.error || 'SSO failed'));
          const out = document.createElement('a');
          out.href = '#'; out.textContent = ' Switch account';
          out.onclick = (e) => { e.preventDefault(); clerk.signOut({ redirectUrl: location.href }); };
          err.appendChild(out);
        };
        if (clerk.user) { exchange(); }
        else {
          ssoBtn.disabled = false;
          ssoBtn.textContent = 'Sign in with SSO';
          ssoBtn.onclick = () => clerk.redirectToSignIn({ redirectUrl: location.href });
        }
      } catch (e) { ssoBtn.textContent = 'SSO unavailable'; err.textContent = String(e.message || e); }
    };
    document.head.appendChild(s);
  })();` : ''}
</script></body></html>`;
}

module.exports = { Auth, TOKEN_COOKIE, TOKEN_TTL_MS, TOKEN_IDLE_MS, TOKEN_SLIDE_SAVE_MS, tokenDigest };
