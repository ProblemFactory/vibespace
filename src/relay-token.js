'use strict';
// THE RELAY TOKEN (lane relay-token-per-instance, design q-051 §1 — the owner's decision 2026-10-20: 「每实例独立 token、不进保险库」).
// Every instance proves itself to OUR frps relay with its OWN token, bound to its OWN public names, revocable — and the token
// is NOT a vault entry: a restart re-publishes the instance's public mirrors without the second password, and a stolen token
// reaches that instance's public names only (impersonate its public address / take its bandwidth), never the hub.
// PURE: imports nothing — the random source and the sha256 are HANDED IN (the hub's frp plugin and the suites call it; the
// relay-side plugin tools/frps-login-plugin/ keeps its own copy of the NAME rule, test-frps-plugin holds the two equal).
//   the record   data/relay-token.json (0600, atomic, the old bytes overwritten — src/secret-file.js replaceShredding):
//                { v, instanceId 'vi-<12 hex>', label, token 'vsrt_'+base64url(32 B) | null (revoked), mintedAt, rotatedAt,
//                  revokedAt, prefixes, subdomains }
//   the proof    frpc.toml `user = "<instanceId>"` + `metadatas.token = "{{ .Envs.VIBESPACE_RELAY_TOKEN }}"` — frps hands
//                `user` + `metas` to the plugin on Login AND on NewProxy (names are judged per proxy); the VALUE rides the frpc
//                child's env only (never argv, never a file but the record, never a log line / status JSON / For-you text)
//   the env      frpc's env is BUILT (relayEnv: a few kept names + the two relay variables), never the hub's inherited — the
//                hub's env holds whatever launched it (lane frp-spawn-env-allowlist)
//   the line     the registration the relay admin runs: `relay-admin add <id> <sha256(token)> "<label>"` — the hash only
//   the cluster  a fleet pod holds no record: the cluster injects VIBESPACE_RELAY_CLUSTER_TOKEN and the pod logs in as its
//                own name (VIBESPACE_INSTANCE_NAME) — ONE cluster row at the relay binds the names by pod name (owner Q2)
const V = 1;
const FILE = 'relay-token.json';
const TOKEN_ENV = 'VIBESPACE_RELAY_TOKEN';                  // the frpc child's env name — the hub's own env never holds it
const CLUSTER_TOKEN_ENV = 'VIBESPACE_RELAY_CLUSTER_TOKEN';  // a fleet pod's: the cluster's ONE token (the chart's secret)
const KNOCK_ENV = 'VIBESPACE_FRP_AUTH_TOKEN';               // the shared token's (the KNOCK — the grace only) frpc env name
/** the names frpc's env keeps from the hub's (lane frp-spawn-env-allowlist). Measured on frpc 0.70.0: it runs on an EMPTY env
 *  (HOME is never read — not kept); of the proxy names it reads lowercase `http_proxy` alone (its dial to frps goes through
 *  it; HTTP_PROXY / HTTPS_PROXY / ALL_PROXY / no_proxy are ignored) — kept, or a hub behind an egress proxy loses its relay */
const RELAY_ENV_KEEP = Object.freeze(['PATH', 'LANG', 'TMPDIR', 'http_proxy']);
const TOKEN_PREFIX = 'vsrt_';
const ID_RE = /^vi-[0-9a-f]{12}$/;
const TOKEN_RE = /^vsrt_[A-Za-z0-9_-]{43}$/;
const HASH_RE = /^[0-9a-f]{64}$/;
const LABEL_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,59}$/;      // pasted into a shell on the relay host: no space, no quote, no $
const SUB_RE = /^[a-z0-9][a-z0-9-]{1,62}$/;
const CLUSTER_USER_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
/** the names an instance's proxies carry (src/port-forward.js `pf-<host>-<key>`, src/server/instance-url.js
 *  `vibespace-instance`) — the plugin's DEFAULT_PREFIXES is the same list (test-frps-plugin's parity leg) */
const PREFIXES = Object.freeze(['pf-', 'vibespace-instance']);
const SUBS_MAX = 64;
/** the plugin's refusal words (tools/frps-login-plugin/plugin.js answers them as frps's reject_reason) → what the hub does */
const REASONS = Object.freeze({
  bad_token: 'the relay holds another token for this instance (a rotation not registered yet, or the record was changed)',
  revoked: 'the relay revoked this instance\'s token',
  unknown_instance: 'the relay has not registered this instance',
  legacy_token_retired: 'the relay no longer takes the shared token',
  name_not_yours: 'the relay refused a public name this instance does not hold',
  name_in_use: 'another instance holds this public name',
  table_unreadable: 'the relay\'s instance table is unreadable',
  knock_refused: 'the relay refused the shared token (it no longer asks for it, or it is wrong)',
  name_live: 'another login holds this proxy name (a restart\'s old login — it clears within ~90 s — or a copy of data/)',
});
const ALERTS = Object.freeze(['name_in_use', 'name_not_yours']);   // ONE For-you item each (per name) — a stolen token or a cloned data/

const isStr = (x) => typeof x === 'string';
const isTime = (x) => x === null || (Number.isFinite(x) && x > 0);
/** a label safe to paste into the relay host's shell — anything else becomes '-', empty ⇒ 'vibespace' */
function labelOf(raw) {
  const s = String(raw == null ? '' : raw).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[^A-Za-z0-9]+/, '').slice(0, 60).replace(/-+$/, '');
  return LABEL_RE.test(s) ? s : 'vibespace';
}
/** a pod name → its relay user (never an instance id's shape: the two namespaces never meet) */
function clusterUserOf(raw) {
  const s = String(raw == null ? '' : raw).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+/, '').slice(0, 40).replace(/-+$/, '');
  return CLUSTER_USER_RE.test(s) && !ID_RE.test(s) ? s : null;
}
const tokenOf = (randomBytes) => TOKEN_PREFIX + Buffer.from(randomBytes(32)).toString('base64url');
/** a NEW identity: a random id (a hostname is neither unique nor stable) + a random token */
function mint({ randomBytes, now, label }) {
  return { v: V, instanceId: 'vi-' + Buffer.from(randomBytes(6)).toString('hex'), label: labelOf(label), token: tokenOf(randomBytes),
    mintedAt: now, rotatedAt: null, revokedAt: null, prefixes: [...PREFIXES], subdomains: [] };
}
/** a new token, the SAME id (owner Q3: the names follow the id) — also how a revoked record comes back */
function rotate(rec, { randomBytes, now }) { return { ...rec, token: tokenOf(randomBytes), rotatedAt: now, revokedAt: null }; }
/** a stolen token: the hub forgets it at once (the record keeps its id and its names) */
function revoke(rec, { now }) { return { ...rec, token: null, revokedAt: now }; }
/** a name the relay accepted for this instance (kept for the card — the relay's own table is the authority) */
function withSub(rec, sub) {
  if (!SUB_RE.test(String(sub || '')) || rec.subdomains.includes(sub)) return rec;
  return { ...rec, subdomains: [...rec.subdomains, sub].slice(-SUBS_MAX) };
}
/** the record read back — every field named and shaped, else null (never half a record) */
function parse(raw) {
  let o = raw;
  if (isStr(raw)) { try { o = JSON.parse(raw); } catch { return null; } }
  if (!o || typeof o !== 'object' || Array.isArray(o) || o.v !== V) return null;
  if (!ID_RE.test(o.instanceId) || !LABEL_RE.test(o.label)) return null;
  if (!(o.token === null || TOKEN_RE.test(o.token))) return null;
  if (!isTime(o.mintedAt) || o.mintedAt === null || !isTime(o.rotatedAt) || !isTime(o.revokedAt)) return null;
  if ((o.token === null) !== (o.revokedAt !== null)) return null;   // revoked ⇔ no token
  if (!Array.isArray(o.prefixes) || !o.prefixes.length || o.prefixes.some((p) => !isStr(p) || !/^[a-z][a-z0-9-]{1,40}$/.test(p))) return null;
  if (!Array.isArray(o.subdomains) || o.subdomains.length > SUBS_MAX || o.subdomains.some((s) => !SUB_RE.test(s))) return null;
  return { v: V, instanceId: o.instanceId, label: o.label, token: o.token, mintedAt: o.mintedAt, rotatedAt: o.rotatedAt, revokedAt: o.revokedAt, prefixes: [...o.prefixes], subdomains: [...o.subdomains] };
}
const serialize = (rec) => JSON.stringify(rec, null, 2) + '\n';
/** which identity this instance logs in with: the cluster's (env) > the record's > none. `token` stays in memory only. */
function identityOf({ rec = null, env = {} } = {}) {
  const ct = isStr(env[CLUSTER_TOKEN_ENV]) ? env[CLUSTER_TOKEN_ENV].trim() : '';
  if (ct) {
    const user = clusterUserOf(env.VIBESPACE_INSTANCE_NAME);
    return user ? { kind: 'cluster', user, token: ct, prefixes: [...PREFIXES] } : { kind: 'cluster-unnamed', user: null, token: '', prefixes: [...PREFIXES] };
  }
  if (rec && rec.token) return { kind: 'instance', user: rec.instanceId, token: rec.token, prefixes: rec.prefixes };
  if (rec) return { kind: 'revoked', user: rec.instanceId, token: '', prefixes: rec.prefixes };
  return { kind: 'none', user: null, token: '', prefixes: [...PREFIXES] };
}
/** the relay admin's line — the token's sha256 only (sha256 handed in: (text) → 64 hex). op: add | rotate | revoke */
function registrationLine(rec, sha256, op = 'add') {
  if (!rec || !ID_RE.test(rec.instanceId)) return '';
  if (op === 'revoke') return `relay-admin revoke ${rec.instanceId}`;
  if (!rec.token) return '';
  const h = String(sha256(rec.token));
  if (!HASH_RE.test(h)) return '';
  return op === 'rotate' ? `relay-admin rotate ${rec.instanceId} ${h}` : `relay-admin add ${rec.instanceId} ${h} ${labelOf(rec.label)}`;
}
/** the frpc.toml lines that name the identity — the value is frp's env TEMPLATE, never the token */
function frpcLines(ident) {
  if (!ident || !ident.user || !ident.token) return [];
  return [`user = "${ident.user}"`, `metadatas.token = "{{ .Envs.${TOKEN_ENV} }}"`];
}
/** THE frpc CHILD'S ENV — built from scratch, never inherited: the kept names from `base` (the hub's process.env, which may
 *  carry an agent conversation's session tokens, the cluster's shared token, cloud keys) + this instance's token + the knock
 *  (during the grace only). An empty value is left out; a relay variable already in `base` is never taken from it. */
function relayEnv(base, { token = '', knock = '' } = {}) {
  const env = {};
  for (const k of RELAY_ENV_KEEP) if (base && Object.prototype.hasOwnProperty.call(base, k) && isStr(base[k]) && base[k]) env[k] = base[k];
  if (isStr(token) && token) env[TOKEN_ENV] = token;
  if (isStr(knock) && knock) env[KNOCK_ENV] = knock;
  return env;
}
/** frps registers a proxy as `<user>.<name>` — the name without that prefix */
function strippedName(proxyName, user) {
  const n = String(proxyName || '');
  return user && n.startsWith(user + '.') ? n.slice(user.length + 1) : n;
}
/** THE NAME RULE (the hub asks it before a publish; the plugin answers the same per NewProxy): the proxy name (without its
 *  `<user>.` prefix) starts with one of the identity's prefixes; a subdomain has the relay's shape */
function nameVerdict({ prefixes = PREFIXES, user = null } = {}, { proxyName = '', subdomain = '' } = {}) {
  const name = strippedName(proxyName, user);
  if (!name || !prefixes.some((p) => name.startsWith(p))) return { ok: false, reason: 'name_not_yours', name };
  if (subdomain && !SUB_RE.test(subdomain)) return { ok: false, reason: 'name_not_yours', name };
  return { ok: true, name };
}
/** a relay refusal read out of frpc's words (a proxy's start error, a log line) → { code, owner? } | null */
function refusalOf(text) {
  const s = String(text || '');
  const m = s.match(/\bname_in_use\b(?::([A-Za-z0-9._-]{1,60})(?![^\s,;)\]]))?/);   // the owner's label only in its shell-safe shape
  if (m) return m[1] ? { code: 'name_in_use', owner: m[1] } : { code: 'name_in_use' };
  for (const code of ['name_not_yours', 'legacy_token_retired', 'unknown_instance', 'table_unreadable', 'bad_token', 'revoked']) if (new RegExp(`\\b${code}\\b`).test(s)) return { code };
  if (/token in login doesn't match token from configuration|authorization failed/i.test(s)) return { code: 'knock_refused' };
  if (/proxy \[[^\]]*\] already exists|proxy name \[[^\]]*\] is already in use|already exists/i.test(s)) return { code: 'name_live' };
  return null;
}
/** frpc.log's newest login event → { ok: true } | { ok: false, code, owner? } | null (no login seen) */
function loginOf(logText) {
  const lines = String(logText || '').split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    if (/login to (?:the )?server success/i.test(l)) return { ok: true };
    if (/login to (?:the )?server failed|connect to (?:the )?server error|\[E\]|\[W\]/.test(l)) {
      const r = refusalOf(l);
      if (r && r.code !== 'name_live') return { ok: false, ...r };
    }
  }
  return null;
}
/** THE RUN'S LOG (lane frp-token-proof, 2026-10-30 — the hub deleted its own relay token after misreading a login): frps
 *  0.70.0 encrypts the control connection after a login with auth.token as the key on BOTH sides, so a frpc WITHOUT the key
 *  frps holds is taken (the relay's plugin vouches the instance's own token) and dropped ~16 ms later — frpc logs `login to
 *  server success` again at its backoff and nothing else at info level. A login is never a proof; a proxy that STARTED is.
 *  frpc.log text (a run's, read forward; `prev` = the counts so far) → { logins, proxies, unanswered } — `unanswered` = the
 *  logins since the relay last answered (a proxy started, or a [W]/[E] line: a refusal, a lost connection) */
const LOGIN_OK_RE = /login to (?:the )?server success/i;
const PROXY_OK_RE = /\bstart proxy success\b/;
function runOf(logText, prev = null) {
  let logins = (prev && prev.logins) || 0, proxies = (prev && prev.proxies) || 0, unanswered = (prev && prev.unanswered) || 0;
  for (const l of String(logText || '').split('\n')) {
    if (LOGIN_OK_RE.test(l)) { logins++; unanswered++; }
    else if (PROXY_OK_RE.test(l)) { proxies++; unanswered = 0; }
    else if (/\[[WE]\]/.test(l)) unanswered = 0;
  }
  return { logins, proxies, unanswered };
}
/** THE DROPPED LOGIN (`relay_login_dropped`): a frpc started WITHOUT the shared token that keeps logging in — DROP_LOGINS
 *  logins in a row no answer followed — and started no proxy in its run. A frpc that sends the token is not judged here. */
const DROP_LOGINS = 3;
const droppedOf = (run, { knock = true } = {}) => !knock && !!run && run.proxies === 0 && run.unanswered >= DROP_LOGINS;
/** the owner's words for it (ONE For-you item; the publish error and the jobs' / forwards' status say the same) — why frpc
 *  runs without the token: `locked` (the vault was locked when it started) | `none` (this instance holds no shared token) |
 *  `off` (it holds one but does not send it: the relay was taken to no longer ask, or it refused the one held) */
const DROPPED_TEXT = 'The relay accepts this instance\'s login but closes the connection right after ({n} logins since {since}, no proxy started)';
const DROPPED_DETAIL = {
  locked: 'The relay still requires the shared relay token, and this frpc runs without it because the vault was locked when it started. Unlock the vault with the second password, or set the relay token again in Plugins › Public URLs.',
  none: 'The relay still requires the shared relay token, and this instance holds none. Set the relay token again in Plugins › Public URLs.',
  off: 'The relay still requires the shared relay token, and this frpc runs without it (the relay was taken to no longer ask for it). Set the relay token again in Plugins › Public URLs.',
};
/** → { text, detail, i18n, message } — `since` an ISO time (the run's start), never a token */
function droppedAlertOf({ logins = 0, since = 0, why = 'locked' } = {}) {
  const n = Math.max(0, Math.floor(Number(logins) || 0));
  const at = Number(since) > 0 ? new Date(Number(since)).toISOString().slice(0, 16).replace('T', ' ') + 'Z' : '?';
  const detail = DROPPED_DETAIL[why] || DROPPED_DETAIL.locked;
  const text = DROPPED_TEXT.replace('{n}', String(n)).replace('{since}', at);
  return { text, detail, i18n: { text: { key: DROPPED_TEXT, params: { n, since: at } }, detail: [{ key: detail }] }, message: `${text[0].toLowerCase()}${text.slice(1)} — ${detail[0].toLowerCase()}${detail.slice(1)}` };
}
/** A DROP IS SAID (lane frp-token-proof): the shared token's vault entry left this instance — the For-you line names the entry
 *  and why (a proxy ran on a frpc started without it, run `<pid>@<start>`) */
const RETIRED_TEXT = 'The shared relay token ({entry}) left this instance';
const RETIRED_DETAIL = 'A public URL ran on a frpc started without it ({at}), so the relay no longer asks for it. If public URLs fail later, set the relay token again in Plugins › Public URLs.';
function retiredAlertOf({ entry = 'frp:token', at = 0 } = {}) {
  const e = String(entry || '').replace(/[^A-Za-z0-9:._-]+/g, '-').slice(0, 60) || 'frp:token';
  const when = Number(at) > 0 ? new Date(Number(at)).toISOString().slice(0, 16).replace('T', ' ') + 'Z' : '?';
  return { text: RETIRED_TEXT.replace('{entry}', e), detail: RETIRED_DETAIL.replace('{at}', when), i18n: { text: { key: RETIRED_TEXT, params: { entry: e } }, detail: [{ key: RETIRED_DETAIL, params: { at: when } }] } };
}
/** the ONE For-you item a name refusal files (never the token; the dedupe key is the text: one item per name) */
const ALERT_DETAIL = {
  name_in_use: 'The relay refused it for this instance. Either this instance\'s relay token leaked and another login took the name, or a copy of data/ runs elsewhere. If neither is expected: Rotate the relay token in Plugins › Public URLs and send the new registration line to the relay admin.',
  name_not_yours: 'The relay holds a different name list for this instance — its record here or at the relay was changed. Rotate the relay token in Plugins › Public URLs and send the new registration line to the relay admin.',
};
function alertOf(ref, { name = '' } = {}) {
  if (!ref || !ALERTS.includes(ref.code)) return null;
  const n = String(name || '').replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 80) || 'a public name';
  const detail = ALERT_DETAIL[ref.code];
  if (ref.code === 'name_in_use') {
    const owner = ref.owner && LABEL_RE.test(ref.owner) ? ref.owner : 'another instance';
    const key = 'The public name {name} is held by “{owner}” on the relay';
    return { text: key.replace('{name}', n).replace('{owner}', owner), detail, i18n: { text: { key, params: { name: n, owner } }, detail: [{ key: detail }] } };
  }
  const key = 'The relay refused the public name {name} for this instance';
  return { text: key.replace('{name}', n), detail, i18n: { text: { key, params: { name: n } }, detail: [{ key: detail }] } };
}

module.exports = {
  V, FILE, TOKEN_ENV, CLUSTER_TOKEN_ENV, KNOCK_ENV, RELAY_ENV_KEEP, TOKEN_PREFIX, ID_RE, TOKEN_RE, HASH_RE, LABEL_RE, SUB_RE, CLUSTER_USER_RE, PREFIXES, SUBS_MAX, REASONS, ALERTS,
  labelOf, clusterUserOf, mint, rotate, revoke, withSub, parse, serialize, identityOf, registrationLine, frpcLines, relayEnv, strippedName, nameVerdict, refusalOf, loginOf, alertOf,
  DROP_LOGINS, DROPPED_TEXT, DROPPED_DETAIL, RETIRED_TEXT, RETIRED_DETAIL, runOf, droppedOf, droppedAlertOf, retiredAlertOf,   // lane frp-token-proof
};
