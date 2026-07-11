/**
 * Clerk SSO — optional, env-gated OIDC layer on top of the cookie auth.
 *
 * Enabled when VIBESPACE_CLERK_PUBLISHABLE_KEY is set. The login page then
 * loads ClerkJS (from the Clerk frontend-API host derived from the publishable
 * key), signs the user in on Clerk's hosted UI, and POSTs the session JWT to
 * /api/clerk-login — which verifies it against Clerk's JWKS (RS256, pure
 * node:crypto, no new deps), checks the email against the allowlist, and
 * issues the SAME cookie token as password login. Everything downstream
 * (middleware, WS upgrade, agent vsst_ tokens) is unchanged. Password auth
 * coexists: either method logs you in; with no password set, Clerk alone
 * still enables auth.
 *
 * Env:
 * - VIBESPACE_CLERK_PUBLISHABLE_KEY  pk_live_… / pk_test_… (the on-switch)
 * - VIBESPACE_CLERK_ALLOWED_EMAILS   comma list; an entry starting with "@"
 *   allows the whole domain ("@example.com"). EMPTY = reject everyone —
 *   authenticating at Clerk is not authorization; a per-user instance must
 *   say WHO owns it.
 *
 * The verified token must carry an `email` claim. Stock Clerk session tokens
 * don't include one — in the Clerk dashboard either add
 *   {"email": "{{user.primary_email_address}}"}
 * to the session token's custom claims, or create a JWT template named
 * "vibespace" with that claim (the login page tries the template first, then
 * falls back to the plain session token).
 */

const crypto = require('crypto');

class ClerkAuth {
  constructor({ publishableKey, allowedEmails, jwksUrl, issuer } = {}) {
    this.publishableKey = (publishableKey ?? process.env.VIBESPACE_CLERK_PUBLISHABLE_KEY ?? '').trim();
    const allowRaw = allowedEmails ?? process.env.VIBESPACE_CLERK_ALLOWED_EMAILS ?? '';
    this._allow = String(allowRaw).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    // pk_test_<b64>/pk_live_<b64> encodes the frontend-API host ("<host>$")
    this.frontendApi = '';
    const m = /^pk_(?:test|live)_([A-Za-z0-9+/=_-]+)$/.exec(this.publishableKey);
    if (m) {
      try { this.frontendApi = Buffer.from(m[1], 'base64').toString('utf-8').replace(/\$$/, ''); } catch {}
    }
    this.issuer = issuer || (this.frontendApi ? `https://${this.frontendApi}` : '');
    this._jwksUrl = jwksUrl || (this.frontendApi ? `https://${this.frontendApi}/.well-known/jwks.json` : '');
    this._jwks = null;          // { keys: [...] }
    this._jwksFetchedAt = 0;
  }

  get enabled() { return !!(this.publishableKey && this.frontendApi); }

  emailAllowed(email) {
    const e = String(email || '').trim().toLowerCase();
    if (!e || !this._allow.length) return false;
    return this._allow.some((a) => (a.startsWith('@') ? e.endsWith(a) : e === a));
  }

  async _getKey(kid, { forceRefresh = false } = {}) {
    const fresh = this._jwks && Date.now() - this._jwksFetchedAt < 3600000;
    if (!fresh || forceRefresh) {
      const res = await fetch(this._jwksUrl, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`JWKS fetch failed (${res.status})`);
      this._jwks = await res.json();
      this._jwksFetchedAt = Date.now();
    }
    const jwk = (this._jwks?.keys || []).find((k) => k.kid === kid);
    // Unknown kid on a cached set → refetch once (key rotation)
    if (!jwk && !forceRefresh) return this._getKey(kid, { forceRefresh: true });
    if (!jwk) throw new Error('signing key not found');
    return crypto.createPublicKey({ key: jwk, format: 'jwk' });
  }

  /**
   * Verify a Clerk session JWT (RS256 vs JWKS, exp/nbf with 60s skew, iss).
   * Returns { email, sub, claims } — email may be '' when the token carries
   * no email claim (caller surfaces the dashboard-config hint).
   */
  async verifyToken(token) {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) throw new Error('malformed token');
    const [h, p, sig] = parts;
    let header, payload;
    try {
      header = JSON.parse(Buffer.from(h, 'base64url').toString('utf-8'));
      payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf-8'));
    } catch { throw new Error('malformed token'); }
    if (header.alg !== 'RS256') throw new Error('unexpected alg');
    const key = await this._getKey(header.kid);
    const ok = crypto.verify('RSA-SHA256', Buffer.from(`${h}.${p}`), key, Buffer.from(sig, 'base64url'));
    if (!ok) throw new Error('bad signature');
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === 'number' && now > payload.exp + 60) throw new Error('token expired');
    if (typeof payload.nbf === 'number' && now < payload.nbf - 60) throw new Error('token not yet valid');
    if (this.issuer && payload.iss !== this.issuer) throw new Error('wrong issuer');
    return { email: String(payload.email || ''), sub: String(payload.sub || ''), claims: payload };
  }
}

module.exports = { ClerkAuth };
