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
  constructor(dataDir) {
    this._file = path.join(dataDir, 'auth.json');
    this._state = null; // { passwordHash, salt, tokens: { token: {createdAt, ua} } }
    this._attempts = new Map(); // ip -> { fails, lockUntil }
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

  get enabled() { return !!(this._state && this._state.passwordHash); }

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
    if (!this.enabled) return null;
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
      if (!this.enabled || this._hash(envPw, this._state.salt) !== this._state.passwordHash) {
        this.setPassword(envPw);
      }
      return {};
    }
    if (this.enabled) return {};
    if (generateIfMissing) {
      const pw = crypto.randomBytes(9).toString('base64url'); // 12 chars, url-safe
      this.setPassword(pw);
      return { generated: pw };
    }
    return {};
  }

  verifyPassword(password) {
    if (!this.enabled) return false;
    const got = Buffer.from(this._hash(password, this._state.salt), 'hex');
    const want = Buffer.from(this._state.passwordHash, 'hex');
    return got.length === want.length && crypto.timingSafeEqual(got, want);
  }

  issueToken(ua = '') {
    const token = crypto.randomBytes(24).toString('hex');
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
      if (p === '/login' || p === '/api/login' || p === '/favicon.ico') return next();
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
      if (this.requestAuthed(req)) return next();
      // Browsers navigating to pages get the login form; API calls get 401
      const wantsHtml = req.method === 'GET' && (req.headers.accept || '').includes('text/html');
      if (wantsHtml) return res.redirect('/login');
      res.status(401).json({ error: 'unauthorized' });
    };
  }

  /** Register /login + /api/login + /api/logout on the app */
  registerRoutes(app) {
    app.get('/login', (req, res) => {
      if (!this.enabled || this.requestAuthed(req)) return res.redirect('/');
      res.type('html').send(LOGIN_HTML);
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
      const token = this.issueToken(req.headers['user-agent']);
      const secure = req.secure || req.headers['x-forwarded-proto'] === 'https' ? ' Secure;' : '';
      res.setHeader('Set-Cookie', `${TOKEN_COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${Math.floor(TOKEN_TTL_MS / 1000)}; SameSite=Lax;${secure}`);
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
      if (this.enabled) {
        if (!this.verifyPassword(String(current ?? ''))) {
          this._rateFail(ip);
          return res.status(401).json({ error: 'Current password is wrong' });
        }
        this._rateOk(ip);
      }
      if (remove) {
        if (!this.enabled) return res.json({ success: true, enabled: false });
        this.removePassword();
        res.setHeader('Set-Cookie', `${TOKEN_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
        return res.json({ success: true, enabled: false });
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

const LOGIN_HTML = `<!DOCTYPE html>
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
  .err { color:#f87171; font-size:12px; min-height:16px; margin-top:10px; }
</style></head>
<body><form class="card" id="f">
  <h1>VibeSpace</h1>
  <p>Enter the workspace password</p>
  <input type="password" id="pw" placeholder="Password" autofocus autocomplete="current-password">
  <button type="submit">Sign in</button>
  <div class="err" id="err"></div>
</form>
<script>
  document.getElementById('f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = document.getElementById('err');
    err.textContent = '';
    try {
      const r = await fetch('/api/login', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ password: document.getElementById('pw').value }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok) location.href = '/';
      else err.textContent = d.error || 'Login failed';
    } catch { err.textContent = 'Network error'; }
  });
</script></body></html>`;

module.exports = { Auth, TOKEN_COOKIE };
