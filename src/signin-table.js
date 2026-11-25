'use strict';
// THE SIGN-IN TABLE'S LAW (the separation, M1 — lane B, piece B3b-1; 主开发 r1060 + r1517): what the table's TWO holders share,
// so its law is ONE — the plain form's hub (src/auth.js, the switch off: today's, byte for byte) and the piped form's interface
// (src/interface/signin.js: the interface is the table's one reader and writer, the piped hub opens no file). The login cookie's
// name and ages, a login's digest and its life, the held judgement of a read of the table (B-dc3f: which reads HOLD the instance,
// in its words), the held page's words, the local sign-in road and the upgrades a held file never shuts.
// SHARED: node's crypto and the login words; no store, no disk, no clock of its own (every `now` is the caller's).
const crypto = require('crypto');
const { loginWords } = require('./login-words.js'); // lane ui-language: the sign-in page's words, whole in en / zh / ja
/** B-dc3f (1): the opt-in declaration's env name (VIBESPACE_SIGNIN=required, set nowhere by default) — its ONE reader is
 *  src/signin-witness.js; the held words name it */
const DECLARE_ENV = 'VIBESPACE_SIGNIN';

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
/** the held words in the asked language: why and the way out; `sso` = single sign-on still guards (B-dc3f); `held` = the held
 *  state — its kind (B-dc3f (1): the folder / link / declared holds, said by both holders) picks its own words */
function heldWords(lang, sso, held = null) {
  const w = loginWords(lang);
  const kind = held && held.kind && held.kind !== 'file' ? held.kind : null;
  if (!kind) return { title: w.title, why: w[sso ? 'signin-held-sso' : 'signin-held'], fix: w[sso ? 'signin-held-sso-fix' : 'signin-held-fix'] };
  // B-dc3f (1): the one act and its full paths named, filled in here (every language); a link hold with a witness names the
  // witness too (主开发 r2152: else its act leaves one hold for the other); an unreadable witness has its own words (r2152 (a));
  // two copies are named «A and B» in the reader's language (r2269 (2), the words' own `signin-held-and`)
  const files = Array.isArray(held.witnesses) && held.witnesses.length ? held.witnesses : (held.witness ? [held.witness] : []);
  const named = files.length < 2 ? files.join('') : `${files.slice(0, -1).join(', ')} ${w['signin-held-and']} ${files[files.length - 1]}`;
  const root = held.dir ? String(held.dir).replace(/\/+[^/]+\/*$/, '') || '/' : '';   // the install the data folder sits in
  const fill = (t) => String(t || '').replace(/\{dir\}/g, held.dir || '').replace(/\{root\}/g, root).replace(/\{home\}/g, held.home || '').replace(/\{witness\}/g, named).replace(/\{env\}/g, DECLARE_ENV).replace(/\{machine\}/g, held.machine || '').replace(/\{idfile\}/g, held.idFile || '');
  const whyKey = held.liftFailed ? 'signin-held-lift-failed' : kind === 'folder' && held.idUnread ? 'signin-held-id-unread' : kind === 'folder' && held.unread ? 'signin-held-unread' : kind === 'home' && held.machine ? 'signin-held-home-machine' : kind === 'home' && held.parked ? 'signin-held-home-parked' : `signin-held-${kind}`;   // r3219 (2): a parked look has its own words
  const fixKey = kind === 'link' && held.witness ? 'signin-held-link-witness-fix' : kind === 'folder' && held.unread && held.net ? 'signin-held-unread-net-fix' : `${whyKey}-fix`;
  return { title: w.title, why: fill(w[whyKey]) + (sso ? ' ' + w['signin-held-sso-still'] : ''), fix: fill(w[fixKey]) };
}
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

/** the journal's held line (B-dc3f), said ONCE at the holder's start — `file` the table's path, `sso` = single sign-on still guards;
 *  `held` = the held state: a folder / link / declared hold (B-dc3f (1)) says its own line, whose act IS the page's en words
 *  (主开发 r2152: the journal and the page can never name different acts) */
/** THE HELD OBJECT (B-dc3f (1)): a hold's why and kind, and for a folder kind the data folder and every witness file the verdict
 *  named (the act's own) — the PIPED form's builder. The plain form's src/auth.js `_hold` still builds its own: the same fields, plus
 *  `net` (a network copy unread — the piped form reads none) and, once the id file's own hold is in, its fields (ONE builder then: a named follow) */
function heldOf({ why, kind = 'file', verdict = null, dataDir = '' } = {}) {
  const files = verdict && Array.isArray(verdict.files) ? verdict.files : [];
  const h = { why, kind, ...(kind !== 'file' ? { dir: dataDir, ...(files.length ? { witness: files.join(', '), witnesses: files } : {}), ...(verdict && verdict.unread ? { unread: true } : {}) } : {}) };
  if (verdict && verdict.home) h.home = verdict.home;
  return h;
}
function heldJournal(file, why, sso, held = null) {
  if (held && held.kind && held.kind !== 'file') {
    const act = heldWords('en', false, held).fix.replace(/\.$/, '');
    return `SIGN-IN HELD: ${why} — ${sso ? 'single sign-on still guards this instance and the password sign-in is refused' : 'every page and API is refused (the sign-in page says so)'}; ${act}; no sign-in file is written`;
  }
  const fix = 'if it looks whole, restart VibeSpace first (a read can fail for a moment); otherwise restore it from a backup and restart, or remove it and restart';
  return sso
    ? `THE SIGN-IN FILE IS HELD: ${file} is there but ${why} — single sign-on still guards this instance (its logins kept in memory only, until the next restart) and the password sign-in is refused; ${fix}; nothing is written over it`
    : `THE SIGN-IN FILE IS HELD: ${file} is there but ${why} — every page and API is refused (the sign-in page says so); ${fix} to start with no sign-in; nothing is written over it`;
}
/** the held state's cause for the boot line (B-dc3f (1)): the data folder not the one / a link to nowhere / the declaration */
const heldCause = (held) => ({ folder: held && held.unread ? 'the sign-in witness outside the data folder cannot be read' : 'the data folder is not the one its sign-in was set in', link: 'the data folder is a link to a place that is not there', declared: `${DECLARE_ENV}=required is set and no password is set`, checking: 'the sign-in witness on the home folder (a network mount) is read before it opens', home: 'the home folder that keeps the sign-in witness has not answered', unchecked: 'the check of the home folder for the sign-in witness could not be started' }[held && held.kind] || 'the sign-in file cannot be read');
/** a held instance's refusal of an upgrade (every one but a paired machine's dial-in): 503 by name, nothing proxied */
const HELD_UPGRADE = 'HTTP/1.1 503 Service Unavailable\r\nRetry-After: 3600\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{"error":"signin-held"}';
/** THE PASSWORD'S HASH: scrypt, 32 bytes, over the stored salt (hex) — `hashSync` the plain form's hub, `hash` the interface's
 *  (async: never on its loop). The same parameters, so a table either holder wrote verifies in the other. */
const SCRYPT_KEYLEN = 32;
const hashSync = (password, salt) => crypto.scryptSync(String(password), Buffer.from(salt, 'hex'), SCRYPT_KEYLEN).toString('hex');
const hash = (password, salt) => new Promise((resolve, reject) => crypto.scrypt(String(password), Buffer.from(salt, 'hex'), SCRYPT_KEYLEN, (e, k) => (e ? reject(e) : resolve(k.toString('hex')))));
/** does `got` (a hash just made) equal the stored one — in constant time */
function hashMatches(got, want) {
  const a = Buffer.from(String(got), 'hex'), b = Buffer.from(String(want), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
/** THE MIGRATION (once, at the first start of a build that keys logins by digest): a plaintext token map becomes its digests —
 *  every login stays valid ONCE (an older build never stamped a use, so the migration counts as one: 30 days from `now`,
 *  still inside its 180-day cap) → the new map, or null when every key is a digest already (nothing to write) */
function migrateTokens(tokens, now) {
  if (!tokens || typeof tokens !== 'object' || !Object.keys(tokens).some((k) => !DIGEST_RE.test(k))) return null;
  const out = {};
  for (const [k, v] of Object.entries(tokens)) { const d = DIGEST_RE.test(k) ? k : tokenDigest(k); out[d] = { ...(v || {}), usedAt: Number(v && v.usedAt) || now }; }
  return out;
}
/** a new login in the map (its DIGEST — never the token), the dead evicted and the total capped (the least recently used
 *  first) → the new map */
function addLogin(tokens, digest, ua, now) {
  const all = { ...(tokens || {}), [digest]: { createdAt: now, usedAt: now, ua: String(ua).slice(0, 120) } };
  const entries = Object.entries(all)
    .filter(([, v]) => loginAlive(v, now))
    .sort((a, b) => (a[1].usedAt || a[1].createdAt) - (b[1].usedAt || b[1].createdAt));
  while (entries.length > MAX_TOKENS) entries.shift();
  return Object.fromEntries(entries);
}
/** the held state's page (B-dc3f) in the asked language: why, the way out, and what the file is */
// ui-words: `data/auth.json` on the page is the file's own name (a path to restore or remove, never words); its words are login-words'
const heldPage = (held, lang, w) => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escHtml(w.title)}</title></head><body style="font-family:system-ui,sans-serif;max-width:36em;margin:4em auto;padding:0 1em;line-height:1.5"><h1 style="font-size:1.3em">${escHtml(w.why)}</h1><p>${escHtml(w.fix)}</p><p style="color:#666;font-size:.9em"><code>data/auth.json</code>: ${escHtml(held.why)}</p></body></html>`;
/** the held state's answer to an API or a door (B-dc3f), as JSON */
const heldJson = (held, lang, w) => ({ error: 'signin-held', reason: held.kind || 'file', why: w.why, fix: w.fix, lang, detail: held.why });   // `reason` B-dc3f (1)
/** THE LOGIN COOKIE: HttpOnly, the whole site, SameSite=Lax — Secure only behind an https INGRESS (`x-forwarded-proto`): the
 *  hub's own https shares ONE port and host with http, and a Secure cookie set over it would lock the http origin out */
const loginCookie = (token, maxAgeS, headers = {}) => `${TOKEN_COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${maxAgeS}; SameSite=Lax;${headers['x-forwarded-proto'] === 'https' ? ' Secure;' : ''}`;
const CLEAR_COOKIE = `${TOKEN_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`;
/** the login token a Cookie header carries, or null */
function cookieTokenOf(cookieHeader) {
  const m = String(cookieHeader || '').match(new RegExp('(?:^|;\\s*)' + TOKEN_COOKIE + '=([a-f0-9]+)'));
  return m ? m[1] : null;
}
/** THE WRONG-PASSWORD COUNTERS (per address, in memory only — a restart resets them): RATE_FAILS fails lock the address for
 *  RATE_LOCK_MS. `map` is the holder's own Map. */
const RATE_FAILS = 5, RATE_LOCK_MS = 60000;
const rateCheck = (map, ip, now) => { const a = map.get(ip); return !(a && a.lockUntil > now); };
function rateFail(map, ip, now) {
  const a = map.get(ip) || { fails: 0, lockUntil: 0 };
  a.fails++;
  if (a.fails >= RATE_FAILS) { a.lockUntil = now + RATE_LOCK_MS; a.fails = 0; }
  map.set(ip, a);
}

module.exports = {
  heldOf,
  TOKEN_COOKIE, TOKEN_TTL_MS, TOKEN_IDLE_MS, TOKEN_SLIDE_SAVE_MS, MAX_TOKENS, OWN_RULE_UPGRADES, LOCAL_ROAD, routeKey, DECLARE_ENV, heldWords, heldCause, escHtml, tokenDigest, DIGEST_RE, loginAlive, cookieMaxAge, judgeRead,
  heldJournal, HELD_UPGRADE, SCRYPT_KEYLEN, hashSync, hash, hashMatches, migrateTokens, addLogin, heldPage, heldJson, loginCookie, CLEAR_COOKIE, cookieTokenOf, RATE_FAILS, RATE_LOCK_MS, rateCheck, rateFail,
};
