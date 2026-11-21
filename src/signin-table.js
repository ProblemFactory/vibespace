'use strict';
// THE SIGN-IN TABLE'S LAW (the separation, M1 — lane B, piece B3b-1; 主开发 r1060 + r1517): what the table's TWO holders share,
// so its law is ONE — the plain form's hub (src/auth.js, the switch off: today's, byte for byte) and the piped form's interface
// (src/interface/signin.js: the interface is the table's one reader and writer, the piped hub opens no file). The login cookie's
// name and ages, a login's digest and its life, the held judgement of a read of the table (B-dc3f: which reads HOLD the instance,
// in its words), the held page's words, the local sign-in road and the upgrades a held file never shuts.
// SHARED: node's crypto and the login words; no store, no disk, no clock of its own (every `now` is the caller's).
const crypto = require('crypto');
const { loginWords } = require('./login-words.js'); // lane ui-language: the sign-in page's words, whole in en / zh / ja

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
/** auth.json keys a login by sha256(token) — never the token. A 48-hex key is a token an older build stored (hashed at load). */
const tokenDigest = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
const DIGEST_RE = /^[0-9a-f]{64}$/;


/** alive = inside the cap (180 days from the sign-in) AND the slide (30 days from the last use) */
function loginAlive(rec, now = Date.now()) {
  if (!rec) return false;
  const born = Number(rec.createdAt) || 0, used = Number(rec.usedAt || rec.createdAt) || 0;
  return now - born < TOKEN_TTL_MS && now - used < TOKEN_IDLE_MS;
}
/** The cookie's Max-Age for a login: the slide, never past the cap. */
function cookieMaxAge(rec, now = Date.now()) {
  const left = rec ? TOKEN_TTL_MS - (now - (Number(rec.createdAt) || now)) : TOKEN_IDLE_MS;
  return Math.max(0, Math.floor(Math.min(TOKEN_IDLE_MS, left) / 1000));
}
/** B-dc3f's judgement of ONE read of the sign-in file, for either holder (each reads in its own way: the hub sync at its start, the
 *  interface async): `error` the read's error (null when it read), `text` what it read, `linkGone` — on ENOENT, whether something
 *  still stands at the path (a link to nothing) → { missing: true } (nothing at the path: a new instance) | { held: why } |
 *  { state } (the parsed table) */
function judgeRead({ error = null, text = null, linkGone = false } = {}) {
  if (error) {
    if (error.code !== 'ENOENT') return { held: `it cannot be read (${error.code || 'an error'})` };
    return linkGone ? { held: 'it is a link to a file that is not there' } : { missing: true };   // ENOENT, yet something stands at the path
  }
  let parsed;
  try { parsed = JSON.parse(text); } catch { return { held: 'its text is not a sign-in table (it does not parse)' }; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { held: 'it holds no sign-in table' };
  if (parsed.passwordHash !== undefined && (typeof parsed.passwordHash !== 'string' || typeof parsed.salt !== 'string')) return { held: 'its password record is not text' };   // a hash that is not text: no login could ever verify (500), held by name
  if (parsed.tokens !== undefined && (!parsed.tokens || typeof parsed.tokens !== 'object' || Array.isArray(parsed.tokens))) return { held: 'its logins are not a table' };
  return { state: parsed };
}

module.exports = { TOKEN_COOKIE, TOKEN_TTL_MS, TOKEN_IDLE_MS, TOKEN_SLIDE_SAVE_MS, MAX_TOKENS, OWN_RULE_UPGRADES, LOCAL_ROAD, routeKey, heldWords, escHtml, tokenDigest, DIGEST_RE, loginAlive, cookieMaxAge, judgeRead };
