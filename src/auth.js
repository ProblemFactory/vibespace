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
 * - THE SIGN-IN FILE IS HELD WHEN IT CANNOT BE READ (B-dc3f, HIGH): a data/auth.json that EXISTS and cannot be read or
 *   parsed (a torn write, a folder or a link to nothing in its place, a permission, a network mount's bad read) HOLDS
 *   the instance CLOSED. Before, it was taken as «no sign-in»: the instance ran OPEN to its network until its next start,
 *   and a later save wrote an empty table over the real file. Held (`_held`, set at load, read by every road from here):
 *   every request the gate sees — pages, APIs and doors — is refused by name with the way out; `enabled` and
 *   `passwordEnabled` answer «on»; no login is valid (`checkToken`, `requestAuthed`: every upgrade that asks); NOTHING is
 *   written over the file (`_save` and every road that would write refuse). The journal says it once, at the start. A
 *   file that is truly missing (nothing at the path) stays a new instance, as before.
 *   THE HOLD CLOSES WHAT THE FILE GUARDS (the round, 主开发 r1148): with single sign-on on, SSO still guards — its logins
 *   live in memory only (nothing is written), the local password road stays refused, the held words stay on the sign-in
 *   page and in the journal. Without it (`shut`) everything is refused, but THE SIGN-IN PAGE ANSWERS AS A PAGE (200, the
 *   held words): a health check's start, ready and alive probes ask it, and a refusal there restarted a held pod for ever.
 *   Every upgrade is shut too (`upgradeHeld`), a public /svc socket included, but a paired machine's dial-in, which
 *   carries its own dial token.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { LOGIN_WORDS, loginWords } = require('./login-words.js'); // lane ui-language: the sign-in page's words, whole in en / zh / ja
const { landingLang } = require('./consent-road.js'); // the browser's asked language (the landing pages' one rule)
const appCsp = require('./app-csp.js'); // PURE: the sign-in page's report-only policy (lane app-page-csp)
const { crossSiteVerdict, ownOriginOf } = require('./write-origin.js');
const { doorClassOf } = require('./door.js');   // THE DOOR CLASS: one pure function, the middleware judges every request through it
/** the classes the gate lets through WITHOUT a cookie — named, so the gate FAILS CLOSED: a class nobody named here (a sixth one
 *  added to the door class later, a typo) is refused by name, never let in by default (B3a's round wtyy237tl) */
const PASSES = Object.freeze(new Set(['door', 'open', 'login']));
const { replaceShredding } = require('./secret-file.js');

const TOKEN_COOKIE = 'vs_token';
const TOKEN_TTL_MS = 180 * 24 * 3600 * 1000; // THE CAP: 180 days from the sign-in, however often the login is used
const TOKEN_IDLE_MS = 30 * 24 * 3600 * 1000; // THE SLIDE: 30 days from the last use (each use extends it)
const TOKEN_SLIDE_SAVE_MS = 3600 * 1000;     // a use moves `usedAt` on disk (and the cookie's Max-Age) at most once an hour
const MAX_TOKENS = 200;
/** the upgrade roads a held file never shuts: a paired machine's dial-in carries its own dial token (server.js
 *  gateDialUpgrade); what it reaches goes back through the app, where the gate refuses it, or needs no person's allow */
const OWN_RULE_UPGRADES = new Set(['/api/device-dial', '/api/agentd-dial']);
/** the local sign-in road — refused while held, also where single sign-on still guards */
const LOCAL_ROAD = new Set(['/api/login', '/api/auth/set-password']);
/** a path as express 4's router matches a route (its defaults: case-insensitive, one optional trailing slash) — so a held
 *  refusal by name meets every spelling the route itself would answer (主开发 r1195 3) */
const routeKey = (p) => String(p || '').toLowerCase().replace(/(.)\/$/, '$1');
/** the held words in the asked language: why and the way out; `sso` = single sign-on still guards (B-dc3f) */
function heldWords(lang, sso) { const w = loginWords(lang); return { title: w.title, why: w[sso ? 'signin-held-sso' : 'signin-held'], fix: w[sso ? 'signin-held-sso-fix' : 'signin-held-fix'] }; }
const escHtml = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** the held state's answer (B-dc3f): a page navigation gets the words (in the asked language), an API or a door gets them as
 *  JSON — 503, the way out named. `page` = THE SIGN-IN PAGE itself: it answers AS A PAGE, 200 whatever the request accepts
 *  (a health check asks it — the tree's chart: start, ready and alive — and a refusal there restarted a held pod for ever) */
function refuseHeld(held, req, res, { sso = false, page = false } = {}) {
  const lang = landingLang(req.headers['accept-language']), w = heldWords(lang, sso);
  res.setHeader('Retry-After', '3600');
  if (page || (req.method === 'GET' && String(req.headers.accept || '').includes('text/html'))) {
    return res.status(page ? 200 : 503).type('html').send(`<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escHtml(w.title)}</title></head><body style="font-family:system-ui,sans-serif;max-width:36em;margin:4em auto;padding:0 1em;line-height:1.5"><h1 style="font-size:1.3em">${escHtml(w.why)}</h1><p>${escHtml(w.fix)}</p><p style="color:#666;font-size:.9em"><code>data/auth.json</code>: ${escHtml(held.why)}</p></body></html>`);
  }
  return res.status(503).json({ error: 'signin-held', why: w.why, fix: w.fix, lang, detail: held.why });
}
const heldError = (held) => Object.assign(new Error(`the sign-in file is held (${held.why}) — nothing is written over it`), { code: 'signin-held' });
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
    this._held = null;
    let text;
    try { text = fs.readFileSync(this._file, 'utf-8'); } catch (e) {
      if (!e || e.code !== 'ENOENT') return this._hold(`it cannot be read (${(e && e.code) || 'an error'})`);
      try { fs.lstatSync(this._file); } catch { this._state = null; return; }   // truly missing: nothing at the path — a new instance
      return this._hold('it is a link to a file that is not there');   // ENOENT, yet something stands at the path
    }
    let parsed;
    try { parsed = JSON.parse(text); } catch { return this._hold('its text is not a sign-in table (it does not parse)'); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return this._hold('it holds no sign-in table');
    if (parsed.passwordHash !== undefined && (typeof parsed.passwordHash !== 'string' || typeof parsed.salt !== 'string')) return this._hold('its password record is not text');   // a hash that is not text: no login could ever verify (500), held by name
    if (parsed.tokens !== undefined && (!parsed.tokens || typeof parsed.tokens !== 'object' || Array.isArray(parsed.tokens))) return this._hold('its logins are not a table');
    this._state = parsed;
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

  /** HOLD the instance closed on a sign-in file that cannot be read (B-dc3f): said once, here, at the start */
  _hold(why) {
    const sso = !!this._clerk?.enabled;
    this._state = sso ? { tokens: {} } : null;   // single sign-on still guards: its logins in MEMORY only (_save writes nothing while held)
    this._held = { why };
    const fix = 'if it looks whole, restart VibeSpace first (a read can fail for a moment); otherwise restore it from a backup and restart, or remove it and restart';
    try { console.error(sso
      ? `[auth] THE SIGN-IN FILE IS HELD: ${this._file} is there but ${why} — single sign-on still guards this instance (its logins kept in memory only, until the next restart) and the password sign-in is refused; ${fix}; nothing is written over it`
      : `[auth] THE SIGN-IN FILE IS HELD: ${this._file} is there but ${why} — every page and API is refused (the sign-in page says so); ${fix} to start with no sign-in; nothing is written over it`); } catch { }
  }

  /** the held state (B-dc3f), or null: { why } */
  get held() { return this._held; }
  /** held and nothing else guards (no single sign-on): every page, API, door and upgrade is refused — but the sign-in page */
  get shut() { return !!this._held && !this._clerk?.enabled; }
  /** does the held state refuse this upgrade path? every one but a paired machine's dial-in (its own dial token) */
  upgradeHeld(pathname) { return this.shut && !OWN_RULE_UPGRADES.has(pathname); }
  /** THE BOOT'S SIGN-IN LINE (server.js prints it): true in every state — while held it says HELD by name, never «a password is
   *  set» (主开发 r1195 4: `passwordEnabled` answers «on» while held, for the gate) → the line, or null with no password */
  bootLine() {
    if (this._held) return this._clerk?.enabled ? '  Password auth: HELD — the sign-in file cannot be read (said above): single sign-on still guards, the password sign-in is refused' : '  Password auth: HELD — the sign-in file cannot be read (said above): every page and API is refused but the sign-in page';
    return this.passwordEnabled ? '  Password auth: ENABLED' : null;
  }
  /** the upgrade dispatcher's refusal while shut: 503 by name, nothing proxied */
  refuseHeldUpgrade(socket) { try { socket.write('HTTP/1.1 503 Service Unavailable\r\nRetry-After: 3600\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{"error":"signin-held"}'); } catch { } try { socket.destroy(); } catch { } }

  _save() {
    if (!this._state || this._held) return;   // NOTHING is written over a held file
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
  get passwordEnabled() { return !!this._held || !!(this._state && this._state.passwordHash); }   // held: «on» — a held file never reads as «off»

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
    if (this._held) throw heldError(this._held);
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = this._hash(password, salt);
    this._state = { passwordHash, salt, userSet: userSet || this._state?.userSet || false, tokens: this._state?.tokens || {} };
    this._save();
  }

  /** Disable auth entirely (user choice — env won't re-enable on next boot). */
  removePassword() {
    if (this._held) throw heldError(this._held);
    this._state = { userSet: true, tokens: {} };
    this._save();
  }

  /** Revoke every login token except (optionally) one — in-app password change kicks all other devices; a vault LOCK
   *  revokes them all (lane vault-e2e-password-fix-r2 — the hub's wiring). → how many logins ended. */
  revokeAllTokens(exceptToken = null) {
    if (!this._state || this.shut) return 0;   // held under single sign-on: its in-memory logins are revoked (a vault lock still signs everyone out)
    const d = exceptToken ? tokenDigest(exceptToken) : null;
    const keep = d && this._state.tokens ? this._state.tokens[d] : null;
    const n = Object.keys(this._state.tokens || {}).length - (keep ? 1 : 0);
    this._state.tokens = keep ? { [d]: keep } : {};
    this._save();
    return n;
  }

  /** Export the password record for config transfer (hash + salt, never tokens). */
  exportPasswordRecord() {
    if (this._held || !this.passwordEnabled) return null;
    return { passwordHash: this._state.passwordHash, salt: this._state.salt };
  }

  /** Import a password record (config transfer). Revokes all tokens — caller should issue a fresh one. */
  importPasswordRecord(rec) {
    if (this._held) throw heldError(this._held);
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
    if (this._held) return {};   // held: neither the env nor a generated password is written over the file
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
    if (this._held || !this.passwordEnabled) return false;
    const got = Buffer.from(this._hash(password, this._state.salt), 'hex');
    const want = Buffer.from(this._state.passwordHash, 'hex');
    return got.length === want.length && crypto.timingSafeEqual(got, want);
  }

  issueToken(ua = '') {
    if (this.shut) throw heldError(this._held);   // held under single sign-on: the login lives in memory only (_save writes nothing)
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
    if (this.shut) return false;   // held, nothing else guarding: no login is valid (under single sign-on: its in-memory logins)
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
    if (this.shut) return;
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
    if (this.shut) return false;   // held, nothing else guarding: every upgrade and private page that asks is refused
    const v = this.originVerdict(req);
    if (!v.ok) { this._logCrossSite(req, v); return false; }
    if (!this.enabled) return true;
    return this.checkToken(Auth.cookieToken(req));
  }

  /** Express middleware guarding everything except the login flow — server.js mounts it BEFORE every router */
  middleware() {
    return (req, res, next) => {
      const p = req.path;
      if (this._held) {   // HELD (B-dc3f): before every door and route — each path judged as the router matches it (routeKey)
        // nothing else guards: nothing is open — but THE SIGN-IN PAGE answers as a page (200, the held words: a health check asks it)
        if (this.shut) return refuseHeld(this._held, req, res, { page: (req.method === 'GET' || req.method === 'HEAD') && routeKey(p) === '/login' });
        if (LOCAL_ROAD.has(routeKey(p))) return refuseHeld(this._held, req, res, { sso: true });   // single sign-on still guards: the local password road stays refused
      }
      // THE DOOR CLASS (src/door.js — the lines that stood here, lifted verbatim): a door, a cross-site refusal, the open
      // instance, the login flow — or a page, which the owner's cookie decides below
      const d = doorClassOf({ method: req.method, path: req.path, headers: req.headers, encrypted: !!(req.socket && req.socket.encrypted) }, { enabled: this.enabled });
      if (d.kind === 'refused') { this._logCrossSite(req, d.verdict); return res.status(403).json({ error: 'cross-site', origin: d.verdict.origin, own: d.verdict.own }); }
      if (PASSES.has(d.kind)) return next();   // a door, the open instance, the login flow
      if (d.kind !== 'page') { console.warn(`[auth] refused a request of a door class nobody named («${String(d.kind).slice(0, 40)}») — the gate fails closed`); return res.status(500).json({ error: 'unclassed', kind: String(d.kind).slice(0, 40) }); }
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
      res.type('html').send(loginHtml({ clerk: this._clerk, passwordEnabled: this._held ? false : this.passwordEnabled, held: this._held, nonce, lang: landingLang(req.headers['accept-language']) }));   // held under single sign-on: SSO only, the held words
    });

    // Clerk SSO exchange: the login page verified the user on Clerk's hosted
    // UI and posts the session JWT here. Verify signature/exp/iss vs Clerk's
    // JWKS, gate on the email allowlist, then issue OUR cookie token — from
    // here on the session is indistinguishable from a password login.
    app.post('/api/clerk-login', express_json_lite, async (req, res) => {
      if (!this._clerk?.enabled) return res.status(404).json({ error: 'SSO not configured' });
      const ip = req.socket.remoteAddress || '?';
      if (!this._rateCheck(ip)) return res.status(429).json({ error: 'Too many attempts — wait a minute', code: 'too-many' });
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
      if (!this._rateCheck(ip)) return res.status(429).json({ error: 'Too many attempts — wait a minute', code: 'too-many' });
      const pw = String(req.body?.password ?? '');
      if (!this.verifyPassword(pw)) {
        this._rateFail(ip);
        return res.status(401).json({ error: 'Wrong password', code: 'wrong-password' });
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
      if (!this._rateCheck(ip)) return res.status(429).json({ error: 'Too many attempts — wait a minute', code: 'too-many' });
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
function loginHtml({ clerk = null, passwordEnabled = true, held = null, nonce = '', lang = 'en' } = {}) {
  const clerkOn = !!clerk?.enabled;
  // lane ui-language (the walk's first-run-3): the page's words in the browser's language (src/login-words.js); its script
  // re-applies this device's own choice below — the app's per-device rule (localStorage `vibespace.lang`)
  const W = loginWords(lang);
  const e = (x) => String(x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sub = passwordEnabled ? W.subPassword : W.subSso;
  return `<!DOCTYPE html>
<html lang="${e(lang === 'zh' ? 'zh-CN' : lang === 'ja' ? 'ja' : 'en')}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(W.title)}</title>
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
  .held { color:#fbbf24; font-size:13px; }
</style></head>
<body><form class="card" id="f">
  <h1>VibeSpace</h1>
  <p data-w="${passwordEnabled ? 'subPassword' : 'subSso'}">${e(sub)}</p>
  ${held ? `<p class="held" data-w="signin-held-sso">${e(W['signin-held-sso'])}</p><p class="held" data-w="signin-held-sso-fix">${e(W['signin-held-sso-fix'])}</p>` : ''}
  ${passwordEnabled ? `
  <input type="password" id="pw" placeholder="${e(W.password)}" data-w-ph="password" autofocus autocomplete="current-password">
  <button type="submit" data-w="signIn">${e(W.signIn)}</button>` : ''}
  ${clerkOn ? `${passwordEnabled ? `<div class="or" data-w="or">${e(W.or)}</div>` : ''}
  <button type="button" class="sso" id="sso" disabled>${e(W.ssoLoading)}</button>` : ''}
  <div class="err" id="err"></div>
</form>
<script nonce="${nonce}">
  // the device's own language wins over the browser's ask (the app's rule); the words are the page's own table
  const ALL = ${JSON.stringify(LOGIN_WORDS).replace(/</g, '\\u003c')};
  const LANG = (() => { let p = null; try { p = localStorage.getItem('vibespace.lang'); } catch {} const n = (navigator.language || '').toLowerCase();
    return p && p !== 'auto' && ['en', 'zh', 'ja'].includes(p) ? p : n.startsWith('zh') ? 'zh' : n.startsWith('ja') ? 'ja' : 'en'; })();
  const w = (k) => (ALL[k] && (ALL[k][LANG] || ALL[k].en)) || k;
  if (LANG !== ${JSON.stringify(lang)}) {
    document.documentElement.lang = LANG === 'zh' ? 'zh-CN' : LANG; document.title = w('title');
    for (const el of document.querySelectorAll('[data-w]')) el.textContent = w(el.dataset.w);
    for (const el of document.querySelectorAll('[data-w-ph]')) el.placeholder = w(el.dataset.wPh);
    const sb = document.getElementById('sso'); if (sb) sb.textContent = w('ssoLoading');
  }
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
      else err.textContent = d.code && ALL[d.code] ? w(d.code) : (d.error || w('loginFailed'));
    } catch { err.textContent = w('network'); }
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
    s.onerror = () => { ssoBtn.textContent = w('ssoUnavailable'); };
    s.onload = async () => {
      try {
        // Instance (v5 CDN) or constructor (older builds) — accept both.
        const clerk = typeof window.Clerk === 'function' ? new window.Clerk(PK) : window.Clerk;
        await clerk.load({ standardBrowser: true });
        const exchange = async () => {
          ssoBtn.disabled = true;
          ssoBtn.textContent = w('signingIn');
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
          ssoBtn.textContent = w('ssoSignIn');
          err.innerHTML = '';
          err.appendChild(document.createTextNode(d.code && ALL[d.code] ? w(d.code) : (d.error || w('ssoFailed'))));
          const out = document.createElement('a');
          out.href = '#'; out.textContent = ' ' + w('switchAccount');
          out.onclick = (e) => { e.preventDefault(); clerk.signOut({ redirectUrl: location.href }); };
          err.appendChild(out);
        };
        if (clerk.user) { exchange(); }
        else {
          ssoBtn.disabled = false;
          ssoBtn.textContent = w('ssoSignIn');
          ssoBtn.onclick = () => clerk.redirectToSignIn({ redirectUrl: location.href });
        }
      } catch (e) { ssoBtn.textContent = w('ssoUnavailable'); err.textContent = String(e.message || e); }
    };
    document.head.appendChild(s);
  })();` : ''}
</script></body></html>`;
}

module.exports = { Auth, TOKEN_COOKIE, TOKEN_TTL_MS, TOKEN_IDLE_MS, TOKEN_SLIDE_SAVE_MS, tokenDigest };
