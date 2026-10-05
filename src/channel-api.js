'use strict';
/**
 * CHANNELS RAW API — THE FENCE (PURE; imports src/channel-acl.js only, PURE → PURE).
 * docs/design-channel-raw-api.md (B-2198). The owner, 2026-10-02: "只需要提供快捷的鉴权透传能力" — VibeSpace keeps NO
 * vendor API mapping. An agent sends a raw call (method + PATH + query/body) through VibeSpace; the server adds the
 * credential's token (never in argv / env / the agent's view), and THIS module is every judgement in between, each a
 * table row with a control (scripts/test-channel-api.mjs):
 *  · THE DECLARED ROW — read through `vendorRowOf(cred)`, the row the credential's OWNER declared and the orchestrator
 *    hands in (an adapter's `api` beside its `apiBearer`, a storage mount's in src/mounts.js; the ONE schema is the
 *    channel registry's `validateApi`): the API hosts (the agent names a PATH, never a URL), the vendor's own API docs,
 *    the TWO tiny lists the design allows (read-by-POST, sensitive) — no path→meaning table beyond them (§4). This
 *    module names NO vendor (test-architecture): adding an integration never edits it.
 *  · the request — method, path, the header allowlist (`Authorization` / `Cookie` / `Host` from the agent refused BY
 *    NAME), the body bound (1 MiB).
 *  · the verdict — tier (channel-acl's `api` field, widen-only) × class (read / write / sensitive) ⇒ run | propose |
 *    refused, and the "always allow this call shape" pattern (never for a sensitive call).
 *  · the response bound (4 MiB, truncation SAID), the response header allowlist, the redirect rule (never off-host).
 *  · the budget (per grant per conversation: per-minute + per-day counts) and the audit line (never a body).
 */
const crypto = require('crypto');
const ACL = require('./channel-acl.js');

const METHODS = Object.freeze(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']);
const READ_METHODS = Object.freeze(['GET', 'HEAD']);
const BODY_MAX = 1024 * 1024;              // the agent's request body
const RESPONSE_MAX = 4 * 1024 * 1024;      // the vendor's answer handed on (the rest dropped, the truncation said)
const SENSITIVE_BODY = 256 * 1024;         // a body this large always asks
const PATH_MAX = 2048;
const TIMEOUT_MS = 30e3;
const REDIRECTS_MAX = 3;                   // on-host only; an off-host Location is refused, never followed
const BUDGET_DEFAULT = Object.freeze({ perMin: 30, perDay: 1000 });
const SHOWN_BODY_MAX = 4 * 1024;           // the proposal card shows this much of a body; "N KB more" after
const PENDING_MAX = 10;                    // one conversation's proposals waiting on one credential (more = api_budget)

/** THE DECLARED ROW of a credential (`cred.api`): `hosts[0]` is the default, a call may name another of the row
 *  (`--host`), never one outside it; `readByPost` = the vendor's read-by-POST paths; `sensitive` = always a proposal.
 *  A pattern is a RegExp or a string anchored with `^`. A row not of the schema's shape is NO row — the credential has
 *  no raw API (fail closed: a sensitive list that cannot be read never lets a call run unasked). */
const ROWS = new WeakMap();
const asPattern = (p) => (p instanceof RegExp ? p : typeof p === 'string' && p.length > 1 && p.startsWith('^') ? new RegExp(p) : null);
function vendorRowOf(cred) {
  const a = cred && typeof cred === 'object' ? cred.api : null;
  if (!a || typeof a !== 'object') return null;
  if (ROWS.has(a)) return ROWS.get(a);
  const list = (x) => (Array.isArray(x) ? x : null);
  const hosts = list(a.hosts), docs = list(a.docs), rbp = list(a.readByPost), sen = list(a.sensitive);
  let row = null;
  if (hosts && hosts.length && hosts.every((h) => typeof h === 'string' && /^[a-z0-9.-]+$/.test(h)) && docs && rbp && sen) {
    const r = rbp.map(asPattern), x = sen.map(asPattern);
    if (!r.includes(null) && !x.includes(null)) row = Object.freeze({ label: String(a.label || ''), hosts: Object.freeze([...hosts]), docs: Object.freeze(docs.map(String)), readByPost: Object.freeze(r), sensitive: Object.freeze(x), refresh: typeof a.refresh === 'string' ? a.refresh : null });
  }
  ROWS.set(a, row);
  return row;
}

/** Request headers the agent may set; `Authorization` / `Cookie` / `Host` (and the proxy's) are refused BY NAME —
 *  VibeSpace sets the credential, the agent never does. Anything else unlisted is refused too (named). */
const HEADER_ALLOW = Object.freeze(['content-type', 'accept', 'accept-language', 'if-match', 'if-none-match', 'prefer', 'x-request-id']);
const HEADER_REFUSED = Object.freeze(['authorization', 'cookie', 'host', 'proxy-authorization']);
/** Response headers handed to the agent (never `set-cookie`, never an auth echo). */
const RESPONSE_HEADER_ALLOW = Object.freeze(['content-type', 'content-length', 'etag', 'last-modified', 'retry-after', 'x-request-id', 'link']);

const TIERS = ACL.API_TIERS;
const refuse = (code, error, extra = {}) => ({ ok: false, code, error, ...extra });

/** THE REQUEST. → {ok, req:{method, host, path, query, headers, body(Buffer|null)}} or a named refusal. */
function validateRequest(cred, input = {}) {
  const v = vendorRowOf(cred);
  if (!v) return refuse('api_cred_unsupported', `this credential's kind (${String(cred && cred.kind).slice(0, 40)}) has no raw API in VibeSpace`);
  const method = String(input.method || '').toUpperCase();
  if (!METHODS.includes(method)) return refuse('api_bad_request', `method must be one of ${METHODS.join(' ')}`);
  const host = input.host ? String(input.host).toLowerCase() : v.hosts[0];
  if (!v.hosts.includes(host)) return refuse('api_host_refused', `${host.slice(0, 120)} is not one of this credential's API hosts (${v.hosts.join(', ')}) — give a PATH on one of them`);
  let raw = String(input.path || '');
  if (raw.length > PATH_MAX) return refuse('api_bad_request', `the path is longer than ${PATH_MAX} characters`);
  if (!raw.startsWith('/') || raw.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(raw)) return refuse('api_host_refused', 'give a PATH that starts with one "/" (never a URL — the host is the credential\'s)');
  if (/[\u0000-\u001f\u007f\\@#\s]/.test(raw)) return refuse('api_bad_request', 'the path holds a control character, a space, "\\", "@" or "#"');
  const qi = raw.indexOf('?');
  const query = [];
  if (qi >= 0) { for (const [k, val] of new URLSearchParams(raw.slice(qi + 1))) query.push([k, val]); raw = raw.slice(0, qi); }
  // a dot segment in ANY spelling (`.%2e`, `%2E.`, `%2e` — the URL parser resolves them all): the class is judged on the
  // path as written, so a path the fetch would resolve differently never passes (verify r1 H1)
  if (raw.split('/').some((s) => ['.', '..'].includes(s.replace(/%2e/gi, '.')) || /%2f/i.test(s))) return refuse('api_bad_request', 'the path may not hold "." / ".." segments (encoded or not) or an encoded "/"');
  for (const [k, val] of Array.isArray(input.query) ? input.query : Object.entries(input.query || {})) query.push([String(k), String(val)]);
  const headers = {};
  for (const [k0, val] of Object.entries(input.headers || {})) {
    const k = String(k0).toLowerCase().trim();
    if (HEADER_REFUSED.includes(k)) return refuse('api_header_refused', `the ${k} header is VibeSpace's to set — leave it out (the credential's token is added server-side)`);
    if (!HEADER_ALLOW.includes(k)) return refuse('api_header_refused', `the ${k.slice(0, 60)} header is not passed through (allowed: ${HEADER_ALLOW.join(', ')})`);
    if (/[\r\n]/.test(String(val))) return refuse('api_bad_request', `the ${k} header holds a line break`);
    headers[k] = String(val).slice(0, 512);
  }
  let body = null;
  if (input.body !== undefined && input.body !== null) {
    body = Buffer.isBuffer(input.body) ? input.body : Buffer.from(typeof input.body === 'string' ? input.body : JSON.stringify(input.body), 'utf8');
    if (body.length > BODY_MAX) return refuse('api_body_too_large', `the body is ${body.length} bytes — at most ${BODY_MAX} (1 MiB) passes`);
    if (READ_METHODS.includes(method) && body.length) return refuse('api_bad_request', `${method} carries no body`);
    if (!headers['content-type']) headers['content-type'] = 'application/json';
  }
  return { ok: true, req: { method, host, path: raw, query, headers, body } };
}

/** read | write — GET/HEAD and the vendor's read-by-POST paths read; everything else writes. */
function classOf(cred, req) {
  const v = vendorRowOf(cred);
  if (READ_METHODS.includes(req.method)) return 'read';
  if (req.method === 'POST' && v && v.readByPost.some((re) => re.test(req.path))) return 'read';
  return 'write';
}
/** SENSITIVE (always a proposal, never auto, never "always allow"): DELETE, the vendor's path list, a big body, an upload. */
function sensitiveOf(cred, req) {
  const v = vendorRowOf(cred);
  if (req.method === 'DELETE') return 'delete';
  if (v && v.sensitive.some((re) => re.test(req.path))) return 'path';
  if (req.body && req.body.length > SENSITIVE_BODY) return 'large-body';
  if (/^multipart\//i.test(req.headers['content-type'] || '') || /\/upload/i.test(req.path)) return 'upload';
  return null;
}

/** A call SHAPE (for "always allow"): the method + the path with every id-like segment as `*`. An id holds a digit and
 *  no "."; a method name (`chat.postMessage`, `values_batch_update`) is never `*`, and a `:verb` suffix stays (`*:append`
 *  ≠ `*:clear`) — one approved call never stands for another endpoint (verify r1 H2). */
function shapeOf(req) {
  const segs = req.path.split('/').map((s) => { const i = s.indexOf(':'); const head = i >= 0 ? s.slice(0, i) : s; return head && /\d/.test(head) && !head.includes('.') ? `*${i >= 0 ? s.slice(i) : ''}` : s; });
  return `${req.method} ${req.host}${segs.join('/')}`;
}

/**
 * THE VERDICT: tier × class ⇒ `run` | `propose` | a refusal (by name, with the next step).
 * `shapes` = the always-allowed shapes of THIS (credential, conversation) — honoured for a non-sensitive write only.
 */
function verdict({ tier, cls, sensitive, shape = null, shapes = [] }) {
  const t = TIERS.includes(tier) ? tier : 'none';
  if (t === 'none') return refuse('api_not_granted', 'this conversation has no API access to that credential — ask the user to grant it in Channels → the account → API access…');
  if (sensitive) return { ok: true, action: 'propose', why: `sensitive:${sensitive}` };
  if (cls === 'read') return { ok: true, action: 'run', why: 'read' };
  if (t === 'read') return refuse('api_tier_read', 'your grant on this credential is read-only — a write needs the user to widen it to "Read + write" in API access…');
  if (t === 'write-auto') return { ok: true, action: 'run', why: 'write-auto' };
  if (shape && Array.isArray(shapes) && shapes.includes(shape)) return { ok: true, action: 'run', why: 'always-allowed' };
  return { ok: true, action: 'propose', why: 'write-ask' };
}
/** May a card offer "Run and always allow this call shape"? Never for a sensitive call, never for a read. */
const offersAlways = ({ cls, sensitive }) => cls === 'write' && !sensitive;

/** THE FROZEN REQUEST a proposal carries: what the user approves is what runs (the digest is re-checked at Approve). */
function freeze(req) {
  const f = { method: req.method, host: req.host, path: req.path, query: req.query.map(([k, v]) => [k, v]), headers: { ...req.headers }, body: req.body ? req.body.toString('base64') : null };
  return { ...f, digest: digestOf(f) };
}
function digestOf(f) {
  const canon = JSON.stringify([f.method, f.host, f.path, f.query, Object.keys(f.headers).sort().map((k) => [k, f.headers[k]]), f.body]);
  return crypto.createHash('sha256').update(canon).digest('hex');
}
function thaw(f) {
  if (!f || digestOf(f) !== f.digest) return null;   // a record edited after the card was drawn runs NOTHING
  return { method: f.method, host: f.host, path: f.path, query: f.query, headers: { ...f.headers }, body: f.body ? Buffer.from(f.body, 'base64') : null };
}
/** The URL the ONE fetch site builds — https, the vetted host, the path, the query. */
function urlOf(req) {
  const qs = new URLSearchParams(req.query).toString();
  return `https://${req.host}${req.path}${qs ? `?${qs}` : ''}`;
}

/** A redirect's Location: followed only ON the same host (≤ REDIRECTS_MAX); anything else stops the call. */
function redirectTarget(req, location) {
  let u;
  try { u = new URL(String(location || ''), urlOf(req)); } catch { return refuse('api_redirect_refused', 'the vendor redirected to an unreadable location — not followed'); }
  if (u.protocol !== 'https:' || u.host !== req.host) return refuse('api_redirect_refused', `the vendor redirected off ${req.host} — not followed (the credential is never sent to another host)`);
  return { ok: true, path: u.pathname, query: [...u.searchParams] };
}

/** The response bound: ≤ RESPONSE_MAX handed on, the truncation SAID. */
function boundResponse(buf, max = RESPONSE_MAX) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf || ''));
  return b.length > max ? { body: b.subarray(0, max), bytes: b.length, truncated: true } : { body: b, bytes: b.length, truncated: false };
}
function responseHeaders(h) {
  const out = {};
  for (const k of RESPONSE_HEADER_ALLOW) { const val = h && typeof h.get === 'function' ? h.get(k) : h && h[k]; if (val !== null && val !== undefined) out[k] = String(val).slice(0, 1024); }
  return out;
}

/** THE BUDGET of one grant in one conversation: `stamps` = its calls' instants (newest last). */
function budgetCheck(stamps, now, caps = BUDGET_DEFAULT) {
  const perMin = Number(caps && caps.perMin) > 0 ? Number(caps.perMin) : BUDGET_DEFAULT.perMin;
  const perDay = Number(caps && caps.perDay) > 0 ? Number(caps.perDay) : BUDGET_DEFAULT.perDay;
  const list = (Array.isArray(stamps) ? stamps : []).filter((t) => now - t < 86400e3);
  const min = list.filter((t) => now - t < 60e3);
  if (min.length >= perMin) return refuse('api_budget', `this conversation's API budget on the credential is ${perMin} calls a minute and is spent — try again in ${Math.max(1, Math.ceil((min[0] + 60e3 - now) / 1000))} s`, { retryAfterSec: Math.max(1, Math.ceil((min[0] + 60e3 - now) / 1000)) });
  if (list.length >= perDay) return refuse('api_budget', `this conversation's API budget on the credential is ${perDay} calls a day and is spent`, { retryAfterSec: Math.max(1, Math.ceil((list[0] + 86400e3 - now) / 1000)) });
  return { ok: true, left: { minute: perMin - min.length - 1, day: perDay - list.length - 1 }, stamps: list };
}

/** THE AUDIT LINE — who, what, how it went; the query's KEYS only and NEVER a body (a body's size + sha256 at most). */
function auditLine({ at, principal, conv, cred, req, status = null, bytes = 0, ms = 0, verdict: vd, code = null, proposal = null, by = null, bodySha = null }) {
  return {
    at, cred, principal: principal ? { kind: principal.kind, id: String(principal.id || '').slice(0, 256), name: principal.name ? String(principal.name).slice(0, 200) : null } : null,
    conv: conv ? String(conv).slice(0, 128) : null,
    method: req ? req.method : null, host: req ? req.host : null, path: req ? String(req.path).slice(0, PATH_MAX) : null,
    queryKeys: req ? [...new Set((req.query || []).map(([k]) => String(k).slice(0, 80)))] : [],
    status, bytes, ms, verdict: vd, code, proposal, by, bodySha,
  };
}

/** ALL AGENTS (principal {kind:'everyone', id:'*'}, the access row's one spelling): the tier under everyone is Read at
 *  most by default — a write tier for every agent needs its own click (`allWrite`, the dialog's "Let every agent write
 *  through this account" tick, said on the dialog next to the All row). */
const EVERYONE_TIER = 'read';
/** THE TIER ROW the API access dialog writes — channel-acl's grant shape with an `api` tier (widen-only, the owner's). */
function apiGrant({ principal, cred, tier, perDay = null, at = null, by = 'user', allWrite = false }) {
  if (/^agent:/.test(String(by))) throw new Error('channel-api.apiGrant: a tier is the user\'s to set — an agent cannot widen its own');
  if (!TIERS.includes(tier)) throw new Error(`channel-api.apiGrant: tier must be ${TIERS.join('|')}`);
  if (principal && principal.kind === 'everyone' && TIERS.indexOf(tier) > TIERS.indexOf(EVERYONE_TIER) && allWrite !== true) throw new Error('channel-api.apiGrant: All agents stay at Read unless you tick "Let every agent write through this account" — a write tier for everyone needs its own click');
  const v = ACL.validateGrant({ principal, scope: { kind: 'adapter', id: cred }, level: 'hidden', origin: 'api', at, by, api: tier });
  if (!v.ok) throw new Error(`channel-api.apiGrant: ${v.error}`);
  return { ...v.grant, ...(Number(perDay) > 0 ? { perDay: Math.min(100000, Math.floor(Number(perDay))) } : {}) };
}

module.exports = {
  METHODS, READ_METHODS, BODY_MAX, RESPONSE_MAX, SENSITIVE_BODY, PATH_MAX, TIMEOUT_MS, REDIRECTS_MAX, BUDGET_DEFAULT, SHOWN_BODY_MAX, PENDING_MAX,
  HEADER_ALLOW, HEADER_REFUSED, RESPONSE_HEADER_ALLOW, TIERS, EVERYONE_TIER,
  vendorRowOf, validateRequest, classOf, sensitiveOf, shapeOf, verdict, offersAlways, freeze, thaw, digestOf, urlOf,
  redirectTarget, boundResponse, responseHeaders, budgetCheck, auditLine, apiGrant,
};
