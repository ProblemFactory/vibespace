/**
 * Password authentication — optional, single-password (team-shared) model.
 *
 * - No password configured → auth disabled entirely (local single-user compat).
 * - Password sources: VIBESPACE_PASSWORD env var, or data/auth.json (persisted
 *   scrypt hash — written by setPassword / the generate path).
 * - Sessions: random bearer tokens in an HttpOnly cookie, persisted server-side
 *   in data/auth.json so restarts don't log everyone out.
 * - Login attempts are rate limited per IP (5 fails → 60s lock).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TOKEN_COOKIE = 'vs_token';
const TOKEN_TTL_MS = 180 * 24 * 3600 * 1000; // 180 days
const MAX_TOKENS = 200;

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
  }

  _save() {
    if (!this._state) return;
    const tmp = this._file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this._state));
    fs.renameSync(tmp, this._file);
  }

  /** A configured password specifically (Clerk SSO alone also enables auth). */
  get passwordEnabled() { return !!(this._state && this._state.passwordHash); }

  get enabled() { return this.passwordEnabled || !!this._clerk?.enabled; }

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

  /** Revoke every login token except (optionally) one — in-app password change kicks all other devices. */
  revokeAllTokens(exceptToken = null) {
    const keep = exceptToken && this._state?.tokens?.[exceptToken];
    this._state.tokens = keep ? { [exceptToken]: keep } : {};
    this._save();
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
    // Clerk-only instances may have no auth.json yet — tokens still persist
    this._state = this._state || { tokens: {} };
    this._state.tokens = this._state.tokens || {};
    this._state.tokens[token] = { createdAt: Date.now(), ua: String(ua).slice(0, 120) };
    // Evict expired + cap total (oldest first)
    const entries = Object.entries(this._state.tokens)
      .filter(([, v]) => Date.now() - v.createdAt < TOKEN_TTL_MS)
      .sort((a, b) => a[1].createdAt - b[1].createdAt);
    while (entries.length > MAX_TOKENS) entries.shift();
    this._state.tokens = Object.fromEntries(entries);
    this._save();
    return token;
  }

  checkToken(token) {
    if (!this.enabled) return true;
    const t = token && this._state.tokens?.[token];
    return !!(t && Date.now() - t.createdAt < TOKEN_TTL_MS);
  }

  revokeToken(token) {
    if (this._state?.tokens?.[token]) { delete this._state.tokens[token]; this._save(); }
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

  static cookieToken(req) {
    const h = req.headers.cookie || '';
    const m = h.match(new RegExp('(?:^|;\\s*)' + TOKEN_COOKIE + '=([a-f0-9]+)'));
    return m ? m[1] : null;
  }

  /** true when this request carries a valid token (or auth is disabled) */
  requestAuthed(req) {
    if (!this.enabled) return true;
    return this.checkToken(Auth.cookieToken(req));
  }

  /** Express middleware guarding everything except the login flow */
  middleware() {
    return (req, res, next) => {
      if (!this.enabled) return next();
      const p = req.path;
      if (p === '/login' || p === '/api/login' || p === '/api/clerk-login' || p === '/favicon.ico') return next();
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
      // Telemetry collector ingest: remote VibeSpace instances authenticate
      // with the shared Bearer token — the ROUTE enforces it (404 when the
      // collector is off, 403 on a bad token); no cookie exists on the sender.
      if (p === '/api/telemetry/ingest') return next();
      if (this.requestAuthed(req)) return next();
      // Browsers navigating to pages get the login form; API calls get 401
      const wantsHtml = req.method === 'GET' && (req.headers.accept || '').includes('text/html');
      if (wantsHtml) return res.redirect('/login');
      res.status(401).json({ error: 'unauthorized' });
    };
  }

  /** Issue a login token + set the cookie (shared by password + Clerk login). */
  _grantSession(req, res) {
    const token = this.issueToken(req.headers['user-agent']);
    const secure = req.secure || req.headers['x-forwarded-proto'] === 'https' ? ' Secure;' : '';
    res.setHeader('Set-Cookie', `${TOKEN_COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${Math.floor(TOKEN_TTL_MS / 1000)}; SameSite=Lax;${secure}`);
    return token;
  }

  /** Register /login + /api/login + /api/clerk-login + /api/logout on the app */
  registerRoutes(app) {
    app.get('/login', (req, res) => {
      if (!this.enabled || this.requestAuthed(req)) return res.redirect('/');
      res.type('html').send(loginHtml({ clerk: this._clerk, passwordEnabled: this.passwordEnabled }));
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

    // In-app password management. When auth is enabled the request already
    // passed the auth middleware AND must still present the current password
    // (defense against an unlocked screen). When disabled, setting a password
    // is open — that's how a local instance opts INTO auth.
    // Changing/setting revokes every other device's token (that's usually the
    // point); the caller gets a fresh token so they stay logged in.
    app.post('/api/auth/set-password', express_json_lite, (req, res) => {
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
      const secure = req.secure || req.headers['x-forwarded-proto'] === 'https' ? ' Secure;' : '';
      res.setHeader('Set-Cookie', `${TOKEN_COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${Math.floor(TOKEN_TTL_MS / 1000)}; SameSite=Lax;${secure}`);
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
function loginHtml({ clerk = null, passwordEnabled = true } = {}) {
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
<script>
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
    s.onerror = () => { ssoBtn.textContent = 'SSO unavailable'; };
    s.onload = async () => {
      try {
        const clerk = new window.Clerk(PK);
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

module.exports = { Auth, TOKEN_COOKIE };
