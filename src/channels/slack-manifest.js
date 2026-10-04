'use strict';
/**
 * THE PERSON'S OWN SLACK APP, FROM ONE LINK (design 012 F1 / F2, D1, D2). PURE: no I/O.
 *
 * The only connection that works (F1): each person creates an INTERNAL app in their own workspace — a distributed
 * app off the Marketplace reads history at 1 request a minute × 15 messages, and the Marketplace refuses this
 * category. Slack's OAuth needs an https redirect our loopback cannot give (F2), so the person installs the app on
 * its settings page and PASTES the User OAuth Token (`xoxp-…`) back — oauth-loopback's `paste` mode.
 *
 *   manifestFor({ownerName}) → the app manifest (user scopes only — every one Slack accepts, USER_SCOPES; no bot
 *                              user, no events — the push lane is S2)
 *   createLink(manifest)     → `https://api.slack.com/apps?new_app=1&manifest_json=<…>` — Slack's documented
 *                              share-a-manifest link (app-manifests/configuring-apps-with-app-manifests); the page
 *                              the person's BROWSER opens, never a request this server makes (the egress census
 *                              counts the host because the literal is here, exactly like Lark's consent host)
 *   tokenShapeOf(s)          → 'config' | 'refresh' | 'user' | 'bot' | 'app' | 'other' | 'empty' — judged by its
 *                              prefix only (the `xoxe.` / `xoxe-` / `xox[abprs]-` family src/secret-shapes.js
 *                              redacts), never logged, never echoed
 *
 * TWO PASTES, NOTHING TO CHOOSE IN SLACK (design 017): step 1 takes a one-time APP CONFIGURATION TOKEN (`xoxe.xoxp-…`,
 * "Generate Token" under "Your App Configuration Tokens" on api.slack.com/apps — per person × workspace, 12 hours)
 * and VibeSpace makes the app itself with ONE `apps.manifest.create`; step 2 is the app's own install page; step 3
 * takes the User OAuth Token as before. The configuration token is held for that one call and dropped (slack.js).
 *   createRequest(manifest)  → `{method: 'apps.manifest.create', body: {manifest: '<JSON>'}}` (a JSON POST)
 *   installLink(appId)       → `https://api.slack.com/apps/<id>/oauth` — null for an id that is not `A…`
 *   pasteAction(box, shape)  → THE CLOSED STEP TABLE: `{act:'create'}` (step 1's box, a setup token), `{act:'connect'}`
 *                              (step 3's box or an older dialog's, a user token) or `{act:'refuse', why}` — a token
 *                              pasted into the wrong box is told apart by its shape, never sent anywhere
 *
 * ONE APP PER WORKSPACE (design 018): a workspace app — a cluster preset ("stored") or the client id / secret a person
 * types for their own workspace's app ("custom") — signs each member in with Slack's own consent page: the member
 * presses Allow and Slack redirects to an https URL with `code` + `state`. The redirect lands on the instance's own
 * https origin, or on THE RELAY PAGE (docs/slack-relay/, a static page on any https host) which only sends the browser
 * back to a private-network instance named in the state's CLEAR part, else shows the code to paste back.
 *   authorizeUrl({clientId, redirectUri, state}) → Slack's consent URL (user scopes = USER_SCOPES; no redirect_uri when
 *                              none is known — Slack then uses the app's first registered URL)
 *   redirectFor({relayUrl, origin}) → `{uri, via}`: the relay (https) › the instance's own https origin + CALLBACK_PATH ›
 *                              none (the code is pasted back) — a relay that is not an https URL is `bad-relay`
 *   stateOf({origin, flowId, issuedAt}, sign) → `v1.<b64url {u, f, t}>.<sign(v1.<clear>)>` — `sign` is the instance's
 *                              per-boot HMAC (the engine's); this module holds no key and does no crypto
 *   stateParts(s) / stateVerdict(s, {sign, flowId, now, ttlMs}) → ok | the closed refusals STATE_REFUSALS
 *   relayTargetVerdict(origin, {allow}) → 'redirect' | 'show-code' — THE RELAY RULE (docs/slack-relay/relay.js carries
 *                              the same function; scripts/test-slack-relay.mjs holds the two to one table)
 *
 * The owner's name rides the app's display name: control and bidi characters dropped, at most OWNER_NAME_MAX
 * characters, the whole name ≤ 35 (Slack's limit for an app name); JSON + URL encoding escape the rest. The link
 * stays under LINK_MAX bytes whatever the name (a verifier control).
 */
const EGRESS = Object.freeze(['api.slack.com', 'slack.com']);   // design 018: slack.com = the consent page the member's browser opens (authorizeUrl)
const CREATE_URL = 'https://api.slack.com/apps?new_app=1&manifest_json=';
/** design 017: the page that holds "Generate Token" (step 1) and each app's install page (step 2) — the person's
 *  BROWSER opens both; the one request this server makes with the setup token goes to the Web API (slack.js). */
const CONFIG_PAGE = 'https://api.slack.com/apps';
const INSTALL_BASE = 'https://api.slack.com/apps/';
const CREATE_METHOD = 'apps.manifest.create';
const APP_ID_RE = /^A[A-Z0-9]{8,}$/;
/** The boxes of the connect card: step 1's (`config`) and step 3's (`user`); none = an older dialog (a user token). */
const BOXES = Object.freeze(['config', 'user']);
const APP_NAME_MAX = 35;
const OWNER_NAME_MAX = 20;
const LINK_MAX = 2048;
/** EVERY USER SCOPE SLACK ACCEPTS, ASKED FOR ONCE (owner 2026-10-03: 「你最好多申请一些权限防止以后有什么新功能需要新权限」 —
 *  a new feature must never need a re-install). The 51 scopes `apps.manifest.validate` accepted on 2026-10-03
 *  (design-desk q-017-probe.md "Wide scopes"; `remote_files:write` is the one Slack refuses for a user token, so it is
 *  absent) — S1 reads, sends as the person and reacts with a few of them; the rest are held for later features. */
const USER_SCOPES = Object.freeze([
  'channels:history', 'groups:history', 'im:history', 'mpim:history', 'channels:read', 'groups:read', 'im:read',
  'mpim:read', 'users:read', 'users:read.email', 'users.profile:read', 'usergroups:read', 'team:read', 'search:read',
  'reactions:read', 'reactions:write', 'files:read', 'files:write', 'pins:read', 'pins:write', 'bookmarks:read',
  'bookmarks:write', 'stars:read', 'stars:write', 'reminders:read', 'reminders:write', 'emoji:read', 'dnd:read',
  'links:read', 'remote_files:read', 'chat:write', 'im:write', 'mpim:write', 'channels:write', 'groups:write',
  'calls:read', 'calls:write', 'dnd:write', 'users:write', 'users.profile:write', 'usergroups:write',
  'canvases:read', 'canvases:write', 'lists:read', 'lists:write', 'remote_files:share', 'team.preferences:read',
  'channels:write.invites', 'groups:write.invites', 'channels:write.topic', 'groups:write.topic',
]);
/** The scopes without which the account cannot read at all (`auth.test`'s `x-oauth-scopes` must carry them). */
const READ_SCOPES = Object.freeze(['channels:history', 'channels:read', 'users:read']);
const SEND_SCOPES = Object.freeze(['chat:write']);

const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;
function cleanOwner(name) {
  const s = String(name == null ? '' : name).replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();
  return [...s].slice(0, OWNER_NAME_MAX).join('');
}
function appNameFor(ownerName) {
  const o = cleanOwner(ownerName);
  const name = o ? `VibeSpace (${o})` : 'VibeSpace';
  return [...name].slice(0, APP_NAME_MAX).join('');
}
function manifestFor({ ownerName = '', redirectUrls = [] } = {}) {
  const urls = (Array.isArray(redirectUrls) ? redirectUrls : []).filter((u) => typeof u === 'string' && HTTPS_URL_RE.test(u)).slice(0, 1000);
  return {
    display_information: { name: appNameFor(ownerName), description: 'Reads and sends your Slack messages through your own VibeSpace' },
    oauth_config: { ...(urls.length ? { redirect_urls: urls } : {}), scopes: { user: USER_SCOPES.slice() } },
    settings: { org_deploy_enabled: false, socket_mode_enabled: false, token_rotation_enabled: false },
  };
}
function createLink(manifest) {
  const link = CREATE_URL + encodeURIComponent(JSON.stringify(manifest));
  if (Buffer.byteLength(link, 'utf8') > LINK_MAX) throw new Error(`slack-manifest: the app link is ${Buffer.byteLength(link, 'utf8')} bytes (the bound is ${LINK_MAX})`);
  return link;
}
/** The pasted string's kind, by its prefix alone (`xoxp-` = a user token — the one S1 takes; `xoxe.` = an app
 *  configuration token, step 1's; `xoxe-` = the refresh token Slack prints beside it — the likely wrong copy). */
function tokenShapeOf(s) {
  if (typeof s !== 'string' || !s.trim()) return 'empty';
  const v = s.trim();
  if (v.length > 512 || /\s/.test(v)) return 'other';
  if (/^xoxe\.xox[a-z]-[A-Za-z0-9._+/=-]{10,500}$/.test(v)) return 'config';
  if (/^xoxe-[A-Za-z0-9._+/=-]{10,500}$/.test(v)) return 'refresh';
  if (/^xoxp-[A-Za-z0-9-]{10,500}$/.test(v)) return 'user';
  if (/^xoxb-[A-Za-z0-9-]{10,500}$/.test(v)) return 'bot';
  if (/^xapp-[A-Za-z0-9-]{10,500}$/.test(v)) return 'app';
  return 'other';
}
/** design 017: the ONE create request — the manifest travels as a JSON string inside a JSON body. */
function createRequest(manifest) {
  return { method: CREATE_METHOD, body: { manifest: JSON.stringify(manifest) } };
}
function installLink(appId) {
  return typeof appId === 'string' && APP_ID_RE.test(appId) ? `${INSTALL_BASE}${appId}/oauth` : null;
}
/** THE CLOSED STEP TABLE: what a paste into `box` does, by the pasted value's shape alone. */
function pasteAction(box, shape) {
  if (box === 'config') {
    if (shape === 'config') return { act: 'create' };
    if (shape === 'user') return { act: 'refuse', why: 'user-token-wrong-box' };
    if (shape === 'refresh') return { act: 'refuse', why: 'refresh-token-not-config' };
    return { act: 'refuse', why: 'not-a-config-token' };
  }
  if (shape === 'user') return { act: 'connect' };
  if (shape === 'config' || shape === 'refresh') return { act: 'refuse', why: 'config-token-wrong-box' };
  return { act: 'refuse', why: 'not-a-user-token' };
}
/** design 018: THE WORKSPACE APP'S CONSENT — Slack's authorize page, the code exchange, the instance's landing route. */
const AUTHORIZE_URL = 'https://slack.com/oauth/v2/authorize';
const EXCHANGE_METHOD = 'oauth.v2.access';
const CALLBACK_PATH = '/api/channels/oauth/cb/slack';
const STATE_MAX = 1024;
const STATE_REFUSALS = Object.freeze(['bad-shape', 'bad-hmac', 'wrong-flow', 'expired']);
/** A bare `http(s)://host[:port]` origin, canonical (exactly what `new URL(o).origin` answers), or null. */
function originOf(o) {
  if (typeof o !== 'string' || !o || o.length > 300) return null;
  let u;
  try { u = new URL(o); } catch { return null; }
  if ((u.protocol !== 'http:' && u.protocol !== 'https:') || u.username || u.password || u.origin !== o) return null;
  return u.origin;
}
function authorizeUrl({ clientId, redirectUri = null, state, scopes = USER_SCOPES } = {}) {
  if (typeof clientId !== 'string' || !/^\d{3,20}\.\d{3,20}$/.test(clientId)) throw new Error('slack-manifest: a Slack client id is <digits>.<digits>');
  const q = new URLSearchParams();
  q.set('client_id', clientId);
  q.set('user_scope', scopes.join(','));
  if (redirectUri) q.set('redirect_uri', redirectUri);
  q.set('state', String(state || ''));
  const url = `${AUTHORIZE_URL}?${q.toString()}`;
  if (Buffer.byteLength(url, 'utf8') > LINK_MAX) throw new Error(`slack-manifest: the consent URL is ${Buffer.byteLength(url, 'utf8')} bytes (the bound is ${LINK_MAX})`);
  return url;
}
const HTTPS_URL_RE = /^https:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:\d{1,5})?(\/[^\s?#]*)?$/i;
/** Where Slack sends the member back: the relay page when one is set (it must be https), else this instance's own
 *  https origin, else nowhere (`none` — the member pastes the code the app's registered page shows). */
function redirectFor({ relayUrl = '', origin = null } = {}) {
  const r = typeof relayUrl === 'string' ? relayUrl.trim() : '';
  if (r) return HTTPS_URL_RE.test(r) && r.length <= 300 ? { uri: r, via: 'relay' } : { uri: null, via: 'bad-relay' };
  const o = originOf(origin);
  return o && o.startsWith('https://') ? { uri: o + CALLBACK_PATH, via: 'self' } : { uri: null, via: 'none' };
}
const b64u = (s) => Buffer.from(String(s), 'utf8').toString('base64url');
function stateOf({ origin = null, flowId, issuedAt }, sign) {
  if (typeof sign !== 'function') throw new Error('slack-manifest: stateOf needs the instance\'s signer');
  const clear = `v1.${b64u(JSON.stringify({ u: originOf(origin) || '', f: String(flowId), t: Math.floor(Number(issuedAt) / 1000) }))}`;
  return `${clear}.${sign(clear)}`;
}
/** The state's parts, or null for any other shape. The clear part is PEER-WRITTEN once it has left: bounded, parsed,
 *  every key checked; the origin must be canonical. */
function stateParts(s) {
  if (typeof s !== 'string' || s.length > STATE_MAX) return null;
  const m = /^v1\.([A-Za-z0-9_-]{8,800})\.([A-Za-z0-9_-]{16,128})$/.exec(s);
  if (!m) return null;
  let j;
  try { j = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8')); } catch { return null; }
  if (!j || typeof j !== 'object' || Array.isArray(j) || typeof j.u !== 'string' || typeof j.f !== 'string' || !/^[a-f0-9]{8,64}$/.test(j.f) || !Number.isInteger(j.t) || j.t <= 0) return null;
  if (j.u && originOf(j.u) !== j.u) return null;
  return { clear: `v1.${m[1]}`, sig: m[2], origin: j.u || null, flowId: j.f, issuedAt: j.t * 1000 };
}
/** Equal text, compared over the whole length (no early exit on the first differing character). */
function sameText(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function stateVerdict(s, { sign, flowId = null, now = Date.now(), ttlMs = 30 * 60 * 1000 } = {}) {
  const p = stateParts(s);
  if (!p) return { ok: false, why: 'bad-shape', parts: null };
  if (typeof sign !== 'function' || !sameText(String(sign(p.clear)), p.sig)) return { ok: false, why: 'bad-hmac', parts: null };
  if (flowId != null && flowId !== p.flowId) return { ok: false, why: 'wrong-flow', parts: null };
  if (!(now - p.issuedAt <= ttlMs) || p.issuedAt - now > 60 * 1000) return { ok: false, why: 'expired', parts: null };
  return { ok: true, why: null, parts: p };
}
/** THE RELAY RULE: a private-network instance (loopback, 10/8, 172.16/12, 192.168/16, fc00::/7, ::1, localhost,
 *  *.local / *.lan / *.home) or an https host under an `allow` suffix (a fleet's own domain, label-bounded) is sent
 *  back to; anything else gets the code shown — the relay is never an open redirector to the internet. */
const PRIVATE_SUFFIXES = Object.freeze(['.local', '.lan', '.home', '.localhost']);
function privateHost(host) {
  const h = String(host || '').toLowerCase();
  if (h === 'localhost') return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (v4) {
    const o = v4.slice(1).map(Number);
    if (o.some((x) => x > 255)) return false;
    return o[0] === 127 || o[0] === 10 || (o[0] === 172 && o[1] >= 16 && o[1] <= 31) || (o[0] === 192 && o[1] === 168);
  }
  if (h.startsWith('[') && h.endsWith(']')) { const a = h.slice(1, -1); return a === '::1' || /^f[cd][0-9a-f]{0,2}:/.test(a); }
  return PRIVATE_SUFFIXES.some((x) => h.length > x.length && h.endsWith(x));
}
function relayTargetVerdict(origin, { allow = [] } = {}) {
  const o = originOf(origin);
  if (!o) return 'show-code';
  const host = new URL(o).hostname.toLowerCase();
  if (privateHost(host)) return 'redirect';
  if (!o.startsWith('https://')) return 'show-code';
  for (const a of Array.isArray(allow) ? allow : []) {
    const x = String(a || '').toLowerCase().replace(/^\.+/, '');
    if (x && /^[a-z0-9.-]{3,253}$/.test(x) && x.includes('.') && (host === x || host.endsWith(`.${x}`))) return 'redirect';
  }
  return 'show-code';
}
/** The scopes a token holds, from the `x-oauth-scopes` header of any call (a comma list), bounded. */
function scopesOfHeader(h) {
  const s = typeof h === 'string' ? h.slice(0, 4096) : '';
  return [...new Set(s.split(',').map((x) => x.trim()).filter((x) => /^[a-z][a-z0-9_.:-]{1,63}$/.test(x)))].slice(0, 100);
}

module.exports = { EGRESS, CREATE_URL, CONFIG_PAGE, INSTALL_BASE, CREATE_METHOD, APP_ID_RE, BOXES, USER_SCOPES, READ_SCOPES, SEND_SCOPES, APP_NAME_MAX, OWNER_NAME_MAX, LINK_MAX, manifestFor, createLink, appNameFor, tokenShapeOf, createRequest, installLink, pasteAction, scopesOfHeader,
  AUTHORIZE_URL, EXCHANGE_METHOD, CALLBACK_PATH, STATE_MAX, STATE_REFUSALS, PRIVATE_SUFFIXES, originOf, authorizeUrl, redirectFor, stateOf, stateParts, stateVerdict, relayTargetVerdict };
