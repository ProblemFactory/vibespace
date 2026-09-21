'use strict';
/**
 * THE LARK / 飞书 READ ADAPTER (docs/design-communication-panel.zh.md §6.3,
 * §12.1, §13, §14.3; P1's first half). ORCH tier, the §4 contract.
 *
 * It owns exactly three things: vendor auth (a USER token minted by the
 * dual-mode loopback flow's FIXED mode — Lark redirects only to a URL
 * registered ahead of time, byte for byte, so the port and the URL are the
 * `lark` row's `setup.callbackUrl`, imported by src/oauth-loopback.js and
 * never spelled here), vendor paging (`im/v1/chats` for discovery,
 * `im/v1/messages` per tracked chat newest-first, PAGING TO THE STORED
 * ANCHOR — reading only the first page is a documented way to lose messages
 * silently, and the ops notes record a 300+-message day), and the vendor's
 * message shape (`body.content` is a JSON string per `msg_type`; `mentions`
 * carry `@_user_N` placeholders that are PER-MESSAGE ORDINALS, which
 * src/channel-record.js resolves against the record's own `mentions`).
 *
 * THE APP CREDENTIAL IS ASKED OF THE ONE RESOLVER, NEVER OF process.env:
 * `deps.resolveIntegration('lark')` (§14.3). `auth.state()` takes that answer
 * as an INPUT: a withdrawn app credential (an admin removed the cluster env,
 * the user cleared their keys) is `needs-credentials` however fresh the token
 * record looks, because a tenant token is minted from app id + secret on
 * every call and a user token is refreshed with them.
 *
 * SENDING (P4, §9.4 / §9.5 / §12.1): `caps.sendAs` is `['user']` — the
 * platform CAN send as the user — and `convCaps` NARROWS it to `[]` with
 * `why:'send-scope-not-granted'` until the HELD token carries both send
 * scopes (`im:message` + `im:message.send_as_user`, a DOT: the console
 * reports the colon spelling only as "no such permission"), which is one
 * re-consent after the app's version publish. `send()` posts ONE text message
 * (or ONE reply) with the vendor's `uuid` = the proposal id (≤ 50 chars —
 * hashed past that), which the vendor dedups for ONE HOUR to at most one
 * successful send; a transport failure AFTER the request left is reported
 * `detail.lost` (the vendor may have processed it) — never a refusal. The
 * response's `sender.sender_type` is returned as `observed` — THE IDENTITY
 * PROOF the design's §21 item 3 asks for — while `identityMarking` stays
 * `unknown` in this declaration until a real send has been read (then it is
 * flipped here, with the text). `reconcile()` (a lost outcome only) scans the
 * chat newest-first back to the send instant for our own text, re-issues the
 * SAME uuid inside the hour (safe by construction), and answers
 * `landed:false` only when a COMPLETE scan past the hour holds nothing.
 *
 * THE PUSH LANE IS THE `live` HALF (src/channels/live/lark.js — the official
 * SDK's long connection over the APP credential): `caps.receive` is `push`,
 * but WHICH lane carries a conversation, and whether push may carry CONTENT
 * or only kick the cursor, is `laneState()`'s answer alone (DEMOTED > LIVE >
 * CLAIM; the claim lives on the adapter record's `push.claimedExclusive`).
 * The lane normalizes through the SAME `toRecord()` the poll uses, so a
 * message that arrives both ways is one record (invariant 2).
 *
 * EVERY OUTBOUND HOST IS DECLARED in `EGRESS` (design §3.1): the egress census
 * (scripts/test-channels-egress.mjs) requires every `https://` literal in
 * this file to be one of them, and every declared one to be used.
 *
 * No `process.platform`, no `scanSources` — this is not a scan adapter.
 */
const crypto = require('crypto');
const { makeRecord, makeConversation } = require('../channel-record.js');
const { ChannelError } = require('./index.js');
const { createLarkLive, NAMES_WAIT_MS } = require('./live/lark.js');

const KIND = 'lark';
const LABEL = 'Lark / 飞书';
/** The integration row this adapter consumes (§14.2's `consumers`). */
const INTEGRATION = 'lark';

/** The two brands of the same platform: Feishu (China) and Lark (international). */
const HOSTS = Object.freeze({
  feishu: { open: 'https://open.feishu.cn', accounts: 'https://accounts.feishu.cn', docs: 'https://open.feishu.cn' },
  lark: { open: 'https://open.larksuite.com', accounts: 'https://accounts.larksuite.com', docs: 'https://open.larksuite.com' },
});
const BRANDS = Object.freeze(Object.keys(HOSTS));
/** THE DECLARED EGRESS (§3.1): every host this file may construct a request to. */
const EGRESS = Object.freeze(['open.feishu.cn', 'accounts.feishu.cn', 'open.larksuite.com', 'accounts.larksuite.com']);

/** Per-record OPTIONS the engine stores and the panel edits: which console
 *  the app was created in decides every host this adapter talks to, so a
 *  change REBUILDS the adapter (`rebuild:true` — the engine drops the live
 *  instance; a walk restart is safe, the store owns every cursor). */
/** A declared `label` / `help` is a KEY the client renders with `t()` (a3
 *  i18n): scripts/i18n-extract.mjs collects i18nKey(…) literals, the
 *  dictionaries carry zh + ja. The marker is the identity. */
const i18nKey = (s) => s;
const OPTIONS = Object.freeze([
  { key: 'brand', label: i18nKey('Brand'), default: 'feishu', choices: BRANDS, rebuild: true,
    help: i18nKey('feishu = 飞书 (open.feishu.cn), lark = Lark international (open.larksuite.com) — the console the app was created in.') },
]);

/** THE SEND SCOPE PAIR (§12.1, decision 2): `im:message` AND
 *  `im:message.send_as_user` — a DOT, not a colon. Both must be HELD by the
 *  token for `convCaps` to offer sending; the consent asks for them (P4). */
const SEND_SCOPES = Object.freeze(['im:message', 'im:message.send_as_user']);
/** The scope set the consent requests: read + send (P4). */
const SCOPES = Object.freeze(['im:message', 'im:message.send_as_user', 'im:chat:readonly', 'contact:user.base:readonly', 'offline_access']);
/** Lark dedups `uuid` for ONE HOUR (§9.4): inside it a re-issue with the same
 *  uuid succeeds at most once — the reconcile's safe rung. */
const UUID_WINDOW_MS = 60 * 60 * 1000;
/** The vendor's cap on `uuid` (≤ 50 chars); a longer key is hashed. */
const UUID_MAX = 50;
/** reconcile's scan: newest-first back to `sentAt` minus this slack, at most
 *  RECONCILE_SCAN_MAX records — a complete scan that holds nothing is the
 *  ONLY evidence for `landed:false`. */
const RECONCILE_SLACK_MS = 5 * 60 * 1000;
const RECONCILE_SCAN_MAX = 200;

const REQUEST_TIMEOUT_MS = 20000;
/** A fresh conversation has no anchor: its first ingest walks newest-first
 *  this far and then reports a COMPLETE pass with the newest id as the
 *  anchor. Older history is the vendor's (a "load older" is P5). Without
 *  this bound a 10 000-message chat could never complete a pass, so its
 *  anchor could never advance. */
const FIRST_INGEST_MAX = 200;
/** How long a newest-first walk (paging toward the anchor across several
 *  history() calls of ONE pass) stays continuable. */
const WALK_TTL_MS = 5 * 60 * 1000;
/** Chat member names are looked up ONCE per conversation per this window. */
const MEMBERS_TTL_MS = 6 * 60 * 60 * 1000;
/** Refresh the access token when it is inside this margin of expiring. */
const REFRESH_MARGIN_MS = 60 * 1000;

const caps = Object.freeze({
  receive: 'push',
  pushTransport: 'ws-long-conn',
  pushAckBudgetMs: 3000,           // the vendor's: HTTP 200 within 3 s — we ack after DURABILITY (fence 11)
  pollInterval: { hot: 30, cold: 300, floor: 10 },
  scanSources: null,
  scanLatency: null,
  history: 'page',
  historyBySource: null,
  listConversations: true,
  sendAs: ['user'],                // P4: as the USER (decision 2); convCaps narrows until the send scopes are held
  identityMarking: 'unknown',      // UNVERIFIED until one real send's `sender.sender_type` is read (§21 item 3) — treated as `marked`
  identityMarkingWhere: null,
  identityMarkingText: null,
  tosRisk: 'none',
  idempotency: 'key',              // the vendor's `uuid`, one hour
  threading: 'reply-to',
  editSent: false,
  readReceipts: false,
  attachments: 'metadata',
});

/** The vendor's `uuid` for an idempotency key: the key itself up to the cap,
 *  else a stable digest of it (the SAME key always maps to the SAME uuid). */
function uuidFor(idemKey) {
  const k = String(idemKey == null ? '' : idemKey);
  if (k && k.length <= UUID_MAX) return k;
  return crypto.createHash('sha1').update(k).digest('hex').slice(0, UUID_MAX);
}
/** Does a token record hold BOTH send scopes? */
function hasSendScopes(token) {
  const sc = Array.isArray(token && token.scopes) ? token.scopes : [];
  return SEND_SCOPES.every((s) => sc.includes(s));
}

// ── the vendor's message shape → ONE plain-text record ──────────────────
/** `body.content` is a JSON string whose shape depends on `msg_type`. */
function parseContent(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(String(raw)); } catch { return null; }
}
/** A `post` (rich text) body: `content` is an array of lines, each an array
 *  of `{tag, text|user_name|href|image_key…}` elements. Flattened to text;
 *  an `at` element becomes `@<name>` (it is not an ordinal placeholder). */
function postText(c) {
  const lines = Array.isArray(c && c.content) ? c.content : [];
  const out = [];
  if (c && c.title) out.push(String(c.title));
  for (const line of lines) {
    if (!Array.isArray(line)) continue;
    out.push(line.map((el) => {
      if (!el || typeof el !== 'object') return '';
      switch (el.tag) {
        case 'text': return String(el.text || '');
        case 'a': return `${el.text || ''}${el.href ? ` (${el.href})` : ''}`;
        case 'at': return `@${el.user_name || el.user_id || ''}`;
        case 'img': return '[image]';
        case 'media': return '[video]';
        case 'emotion': return `[${el.emoji_type || 'emoji'}]`;
        case 'code_block': return String(el.text || '');
        case 'hr': return '—';
        default: return String(el.text || '');
      }
    }).join(''));
  }
  return out.join('\n');
}
/** Plain text for every `msg_type` this adapter recognises; an unknown type
 *  is named rather than dropped (a message that was sent is a message). */
function textOf(item) {
  const c = parseContent(item.body && item.body.content);
  if (item.deleted === true) return '[deleted]';
  switch (item.msg_type) {
    case 'text': return String((c && c.text) || '');
    case 'post': return postText(c);
    case 'image': return '[image]';
    case 'file': return `[file: ${(c && c.file_name) || 'file'}]`;
    case 'audio': return '[audio]';
    case 'media': return `[video${c && c.file_name ? `: ${c.file_name}` : ''}]`;
    case 'sticker': return '[sticker]';
    case 'share_chat': return '[shared a chat]';
    case 'share_user': return '[shared a contact]';
    case 'merge_forward': return '[forwarded messages]';
    case 'interactive': return c && (c.title || (c.header && c.header.title && c.header.title.content)) ? `[card] ${c.title || c.header.title.content}` : '[card]';
    case 'system': return String((c && (c.text || c.template)) || '[system]');
    case 'location': return `[location${c && c.name ? `: ${c.name}` : ''}]`;
    case 'folder': return `[folder: ${(c && c.file_name) || 'folder'}]`;
    default: return `[${item.msg_type || 'message'}]`;
  }
}
/** Attachment METADATA only (caps.attachments === 'metadata'): images and
 *  files are a second authorized fetch against a per-message resource
 *  endpoint, which v1 does not make. */
function attachmentsOf(item) {
  const c = parseContent(item.body && item.body.content) || {};
  if (item.msg_type === 'image' && c.image_key) return [{ id: c.image_key, name: 'image', bytes: null, mime: 'image/*' }];
  if ((item.msg_type === 'file' || item.msg_type === 'media' || item.msg_type === 'audio' || item.msg_type === 'folder') && c.file_key) return [{ id: c.file_key, name: c.file_name || item.msg_type, bytes: null, mime: null }];
  return [];
}
/** `mentions[]` in ORDINAL order: `@_user_1` is mentions[0] (design §4). */
function mentionsOf(item) {
  const ms = Array.isArray(item.mentions) ? item.mentions.slice() : [];
  const ord = (m) => { const mm = /^@_user_(\d+)$/.exec(String((m && m.key) || '')); return mm ? Number(mm[1]) : Number.MAX_SAFE_INTEGER; };
  ms.sort((a, b) => ord(a) - ord(b));
  return ms.map((m) => ({ id: String((m && m.id) || ''), name: String((m && m.name) || '') }));
}

/** ONE vendor item → ONE ChannelRecord. `names` maps open_id → display name
 *  (chat members, cached); `selfId` is the authorizing user's open_id. */
function toRecord(adapterId, convId, item, { names = new Map(), selfId = null } = {}) {
  const sender = item.sender || {};
  const sid = String(sender.id || '');
  return makeRecord({
    adapterId, convId,
    vendorId: String(item.message_id || ''),
    at: Number(item.create_time) || 0,
    author: { id: sid, name: names.get(sid) || (sender.sender_type === 'app' ? 'app' : ''), isSelf: !!selfId && sid === selfId, isBot: sender.sender_type === 'app' },
    text: textOf(item),
    mentions: mentionsOf(item),
    attachments: attachmentsOf(item),
    replyTo: item.parent_id ? String(item.parent_id) : null,
    threadKey: item.thread_id ? String(item.thread_id) : (item.root_id ? String(item.root_id) : null),
    raw: { msg_type: item.msg_type || null, chat_id: item.chat_id || null, sender_type: sender.sender_type || null, updated: item.updated || null },
  });
}

/** The vendor's page continuation. The documented field is `page_token`
 *  (beside `has_more`); the ops notes this design was written from call it
 *  `next_page_token`, so both spellings are read — a page that names either
 *  is a page that continues. */
const nextToken = (d) => (d && d.has_more !== false && (d.next_page_token || d.page_token)) ? String(d.next_page_token || d.page_token) : null;

// ── typed failures ─────────────────────────────────────────────────────
/** Lark's own error codes that mean "this token is dead" / "slow down" / "no permission". */
const CODE_AUTH = new Set([99991661, 99991663, 99991664, 99991665, 99991667, 99991668, 99991669, 99991670, 99991671, 20001, 20003, 20005, 20007, 20008, 20026, 20027, 20050]);
const CODE_RATE = new Set([99991400, 99991401, 99991402, 99991403, 11232, 230020]);
const CODE_FORBIDDEN = new Set([99991672, 99991679, 230002, 230006, 230011, 230013, 230014]);
const CODE_NOT_FOUND = new Set([230001, 230003, 230026]);
function typedFailure(status, body, what) {
  const code = body && Number(body.code);
  const msg = (body && (body.msg || body.error_description || body.error)) || `HTTP ${status}`;
  if (status === 401 || CODE_AUTH.has(code)) return new ChannelError('auth-expired', `${what}: ${msg} (${code || status})`, { retryable: false, detail: { code, status } });
  if (status === 429 || CODE_RATE.has(code)) return new ChannelError('rate-limited', `${what}: ${msg} (${code || status})`, { retryable: true, detail: { code, status } });
  if (status === 403 || CODE_FORBIDDEN.has(code)) return new ChannelError('forbidden', `${what}: ${msg} (${code || status})`, { retryable: false, detail: { code, status } });
  if (status === 404 || CODE_NOT_FOUND.has(code)) return new ChannelError('not-found', `${what}: ${msg} (${code || status})`, { retryable: false, detail: { code, status } });
  if (status >= 500) return new ChannelError('transport', `${what}: ${msg} (${status})`, { retryable: true, detail: { code, status } });
  return new ChannelError('vendor-error', `${what}: ${msg} (${code || status})`, { retryable: false, detail: { code, status } });
}

/** A bounded JSON round trip; a network failure is `transport` (retryable). */
async function callJson(fetchFn, url, { method = 'GET', headers = {}, body = null, what = 'lark', signal = null } = {}) {
  let r;
  try {
    r = await fetchFn(url, {
      method, headers: { Accept: 'application/json', ...(body != null ? { 'Content-Type': 'application/json; charset=utf-8' } : {}), ...headers },
      body: body == null ? undefined : JSON.stringify(body),
      signal: signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (e) {
    throw new ChannelError('transport', `${what}: ${(e && e.message) || e}`, { retryable: true });
  }
  let parsed = null;
  try { parsed = await r.json(); } catch { parsed = null; }
  if (!r.ok || !parsed || (parsed.code !== undefined && Number(parsed.code) !== 0)) throw typedFailure(r.status, parsed, what);
  return parsed;
}

// ── the adapter ───────────────────────────────────────────────────────
function create(record = {}, deps = {}) {
  const adapterId = record.id || KIND;
  const now = typeof deps.now === 'function' ? deps.now : () => Date.now();
  const fetchFn = typeof deps.fetch === 'function' ? deps.fetch : (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null);
  const resolveIntegration = typeof deps.resolveIntegration === 'function' ? deps.resolveIntegration : null;
  const tokens = deps.tokens || null;        // { read(): {token, why}, write(token, {expiresAt, scopes}), clear() } — the ENGINE's encrypted store
  const oauth = deps.oauth || null;          // src/oauth-loopback.js instance — the ENGINE's
  const log = deps.log || console;
  const brand = BRANDS.includes(record.brand) ? record.brand : (record.options && BRANDS.includes(record.options.brand) ? record.options.brand : 'feishu');
  const H = HOSTS[brand];

  const walks = new Map();      // convId -> { stopAt, pageToken, newest, at, count }
  const members = new Map();    // convId -> { names: Map, at }
  const sleep = (ms) => new Promise((r) => { const t = setTimeout(r, ms); if (t.unref) t.unref(); });

  /** The app credential, from THE resolver. `null` = none/missing, with why. */
  function credential() {
    if (!resolveIntegration) return { values: null, why: 'no integration resolver was handed to this adapter', missing: [] };
    let r;
    try { r = resolveIntegration('lark'); } catch (e) { return { values: null, why: `integration lookup failed: ${(e && e.message) || e}`, missing: [] }; }
    if (!r || r.source === 'none' || (Array.isArray(r.missing) && r.missing.length)) {
      return { values: null, why: (r && r.why) || 'no Lark app credential is configured', missing: (r && r.missing) || [], source: r ? r.source : 'none' };
    }
    return { values: r.values, why: null, missing: [], source: r.source, clusterLabel: r.clusterLabel || null };
  }

  function readToken() {
    if (!tokens) return { token: null, why: 'no token store was handed to this adapter' };
    const t = tokens.read();
    if (!t || !t.token) return { token: null, why: (t && t.why) || 'never-authenticated' };
    return { token: t.token, why: null };
  }

  /** A live access token — refreshed through the app credential when inside
   *  the margin. `auth-expired` when the refresh token is dead. */
  async function accessToken() {
    const cred = credential();
    if (!cred.values) throw new ChannelError('auth-expired', `Lark app credential missing: ${cred.why}`, { retryable: false, detail: { needsCredentials: true } });
    const { token, why } = readToken();
    if (!token) throw new ChannelError('auth-expired', `Lark is not connected (${why})`, { retryable: false });
    if (token.access_token && Number(token.expiresAt) > now() + REFRESH_MARGIN_MS) return token.access_token;
    if (!token.refresh_token) throw new ChannelError('auth-expired', 'Lark access token expired and no refresh token is held — re-authorize', { retryable: false });
    if (Number(token.refreshExpiresAt) && Number(token.refreshExpiresAt) <= now()) throw new ChannelError('auth-expired', 'Lark refresh token expired — re-authorize', { retryable: false });
    let d;
    try {
      d = await callJson(fetchFn, `${H.open}/open-apis/authen/v2/oauth/token`, {
        method: 'POST', what: 'lark token refresh',
        body: { grant_type: 'refresh_token', client_id: cred.values.appId, client_secret: cred.values.appSecret, refresh_token: token.refresh_token },
      });
    } catch (e) {
      // A refresh the vendor REFUSES is a fact about the token record, so it
      // is stamped on it: `auth.state()` answers `needs-reauth` from now on
      // (the row's re-authorize control), instead of retrying a dead grant
      // on every pass.
      if (e instanceof ChannelError && e.code === 'auth-expired' && tokens) await tokens.write({ ...token, invalidGrantAt: now() }, { expiresAt: token.refreshExpiresAt || null, scopes: token.scopes || [] });
      throw e;
    }
    const next = tokenFromExchange(d, token);
    await tokens.write(next, { expiresAt: next.refreshExpiresAt, scopes: next.scopes });
    return next.access_token;
  }

  function tokenFromExchange(d, prev = {}) {
    const t = now();
    return {
      access_token: String(d.access_token || ''),
      expiresAt: t + Number(d.expires_in || 7200) * 1000,
      refresh_token: String(d.refresh_token || prev.refresh_token || ''),
      refreshExpiresAt: d.refresh_token_expires_in ? t + Number(d.refresh_token_expires_in) * 1000 : (prev.refreshExpiresAt || null),
      scopes: String(d.scope || (prev.scopes || []).join(' ')).split(/\s+/).filter(Boolean),
      openId: prev.openId || null, name: prev.name || null, brand,
    };
  }

  const api = async (pathq, opts = {}) => {
    const at = await accessToken();
    return callJson(fetchFn, `${H.open}/open-apis${pathq}`, { ...opts, headers: { Authorization: `Bearer ${at}`, ...(opts.headers || {}) } });
  };

  /** Chat member names, ONCE per conversation per MEMBERS_TTL_MS — best
   *  effort: a refused lookup leaves the ids bare rather than failing the
   *  pass (a message with an unnamed author is still a message). */
  async function namesFor(convId) {
    const c = members.get(convId);
    if (c && now() - c.at < MEMBERS_TTL_MS) return c.names;
    const names = new Map();
    try {
      let pageToken = null, pages = 0;
      do {
        const p = new URLSearchParams({ member_id_type: 'open_id', page_size: '100' });
        if (pageToken) p.set('page_token', pageToken);
        const d = await api(`/im/v1/chats/${encodeURIComponent(convId)}/members?${p}`, { what: 'lark chat members' });
        for (const m of (d.data && d.data.items) || []) if (m && m.member_id) names.set(String(m.member_id), String(m.name || ''));
        pageToken = nextToken(d.data);
      } while (pageToken && ++pages < 10);
    } catch (e) {
      if (e instanceof ChannelError && e.code === 'auth-expired') throw e;   // a dead token is the pass's failure, not a missing name
      log.warn && log.warn(`[channels] lark: member names for ${convId} unavailable (${(e && e.message) || e}) — authors will show their ids`);
    }
    members.set(convId, { names, at: now() });
    return names;
  }

  // THE PUSH LANE, over the SAME credential resolver and the SAME normalizer
  // the poll uses. Member names are awaited for at most NAMES_WAIT_MS on the
  // push path: the record must be durable inside the vendor's 3 s ack budget,
  // and an author shown by id is still a message (the poll re-reads names
  // into its own cache; the dedup keeps the pushed record).
  const live = createLarkLive({
    adapterId, brand, credential, now, log, sdk: deps.larkSdk || null,
    reconnectMinMs: deps.reconnectMinMs, reconnectMaxMs: deps.reconnectMaxMs,
    toRecord: async (convId, item) => {
      let names = new Map();
      try { names = await Promise.race([namesFor(convId), sleep(NAMES_WAIT_MS).then(() => (members.get(convId) || { names: new Map() }).names)]); }
      catch (e) { log.warn && log.warn(`[channels] lark: member names for ${convId} unavailable on the push path (${(e && e.message) || e})`); }
      const selfId = (readToken().token || {}).openId || null;
      return toRecord(adapterId, convId, item, { names, selfId });
    },
  });

  /**
   * THE SEND (P4, §9.4): ONE text message into the chat (`receive_id_type=
   * chat_id`) or ONE reply under `replyTo`, with the vendor's `uuid` = the
   * idempotency key. The token is resolved BEFORE the request, so a
   * credential failure is a plain refusal; a transport failure AFTER the
   * request left is `detail.lost` — the outcome is unknown, not refused.
   * The vendor's own `sender.sender_type` rides back as `observed`.
   */
  async function sendImpl(convId, { text, replyTo = null, idemKey, as = 'user' } = {}) {
    if (as !== 'user') throw new ChannelError('send-not-available', `lark: sending as '${as}' is not declared (caps.sendAs: user)`, { retryable: false, detail: { sendAs: caps.sendAs } });
    if (!hasSendScopes(readToken().token)) throw new ChannelError('forbidden', 'lark: the held token has no send scopes (im:message + im:message.send_as_user) — reconnect to request them', { retryable: false, detail: { why: 'send-scope-not-granted' } });
    const uuid = uuidFor(idemKey);
    const body = { msg_type: 'text', content: JSON.stringify({ text: String(text == null ? '' : text) }), uuid };
    const at0 = await accessToken();
    let d;
    try {
      d = replyTo
        ? await callJson(fetchFn, `${H.open}/open-apis/im/v1/messages/${encodeURIComponent(String(replyTo))}/reply`, { method: 'POST', what: 'lark reply', headers: { Authorization: `Bearer ${at0}` }, body })
        : await callJson(fetchFn, `${H.open}/open-apis/im/v1/messages?receive_id_type=chat_id`, { method: 'POST', what: 'lark send', headers: { Authorization: `Bearer ${at0}` }, body: { receive_id: convId, ...body } });
    } catch (e) {
      if (e instanceof ChannelError && e.code === 'transport') throw new ChannelError('transport', `${e.message} — the request left and the answer was lost`, { retryable: true, detail: { ...(e.detail || {}), lost: true, uuid } });
      throw e;
    }
    const m = (d && d.data) || {};
    const senderType = m.sender && m.sender.sender_type ? String(m.sender.sender_type) : null;
    return {
      ok: true, vendorMessageId: String(m.message_id || ''), at: Number(m.create_time) || now(), sentAs: 'user', uuid,
      observed: { senderType, senderId: m.sender && m.sender.id ? String(m.sender.id) : null },
    };
  }

  return {
    live,
    auth: {
      /** Four-valued and honest (§13): the credential question FIRST. */
      async state() {
        const cred = credential();
        if (!cred.values) return { state: 'needs-credentials', expiresAt: null, scopes: [], why: cred.why, missing: cred.missing.slice(), credentialSource: cred.source || 'none' };
        const { token, why } = readToken();
        if (!token) return { state: 'unknown', expiresAt: null, scopes: [], why, credentialSource: cred.source };
        const refreshExpiresAt = Number(token.refreshExpiresAt) || null;
        if (refreshExpiresAt && refreshExpiresAt <= now()) return { state: 'needs-reauth', expiresAt: refreshExpiresAt, scopes: token.scopes || [], why: 'refresh-token-expired', credentialSource: cred.source };
        if (token.invalidGrantAt) return { state: 'needs-reauth', expiresAt: refreshExpiresAt, scopes: token.scopes || [], why: 'refresh-refused', credentialSource: cred.source };
        return { state: 'connected', expiresAt: refreshExpiresAt, scopes: token.scopes || [], why: null, credentialSource: cred.source, user: token.name || token.openId || null, brand };
      },
      /** The FIXED-mode loopback flow (§12.4): the vendor consent URL is built
       *  with the REGISTERED redirect_uri; the exchange mints the user token
       *  and looks the user up once so `isSelf` can be answered. */
      async begin() {
        if (!oauth) throw new ChannelError('not-supported', 'lark.auth.begin: no OAuth loopback was handed to this adapter', { retryable: false });
        const cred = credential();
        if (!cred.values) throw new ChannelError('auth-expired', `cannot start a Lark consent flow: ${cred.why}`, { retryable: false, detail: { needsCredentials: true, missing: cred.missing } });
        const { appId, appSecret } = cred.values;
        return oauth.begin({
          id: adapterId, mode: 'fixed', label: 'Lark',
          successText: 'VibeSpace: Lark connected — you can close this tab.',
          buildConsentUrl: ({ redirectUri, state }) => `${H.accounts}/open-apis/authen/v1/authorize?` + new URLSearchParams({ client_id: appId, redirect_uri: redirectUri, scope: SCOPES.join(' '), state }),
          exchange: async ({ code, redirectUri }) => {
            const d = await callJson(fetchFn, `${H.open}/open-apis/authen/v2/oauth/token`, {
              method: 'POST', what: 'lark token exchange',
              body: { grant_type: 'authorization_code', client_id: appId, client_secret: appSecret, code, redirect_uri: redirectUri },
            });
            const tok = tokenFromExchange(d);
            try {
              const me = await callJson(fetchFn, `${H.open}/open-apis/authen/v1/user_info`, { what: 'lark user info', headers: { Authorization: `Bearer ${tok.access_token}` } });
              tok.openId = (me.data && me.data.open_id) || null;
              tok.name = (me.data && me.data.name) || null;
            } catch (e) { log.warn && log.warn('[channels] lark: user_info unavailable after consent:', (e && e.message) || e); }
            if (tokens) await tokens.write(tok, { expiresAt: tok.refreshExpiresAt, scopes: tok.scopes });
            return { ok: true, user: tok.name || tok.openId || null, scopes: tok.scopes };
          },
          onDone: deps.onAuthDone ? (r) => deps.onAuthDone(adapterId, r) : null,
        });
      },
      /** Paste-back: the user pastes the redirect URL their browser landed on. */
      async finish(flowId, url) {
        if (!oauth) throw new ChannelError('not-supported', 'lark.auth.finish: no OAuth loopback was handed to this adapter', { retryable: false });
        const r = await oauth.forwardCallback(flowId, url);
        return { ok: r.ok, error: r.error || null, record: r.result || null };
      },
    },

    async listConversations({ cursor = null, limit = 100 } = {}) {
      const p = new URLSearchParams({ page_size: String(Math.min(100, Math.max(1, Number(limit) || 100))), user_id_type: 'open_id' });
      if (cursor) p.set('page_token', String(cursor));
      const d = await api(`/im/v1/chats?${p}`, { what: 'lark chats' });
      const items = (d.data && d.data.items) || [];
      const conversations = items.filter((c) => c && c.chat_id).map((c) => makeConversation({
        id: String(c.chat_id), vendorId: String(c.chat_id),
        title: String(c.name || c.chat_id), kind: c.chat_mode === 'p2p' ? 'dm' : 'group',
        participants: String(c.description || ''), lastAt: null,
      }));
      const next = nextToken(d.data);
      return { conversations, cursor: next, complete: !next };
    },

    /** Membership is verified with ONE chat lookup: a chat the vendor answers
     *  403/404 for is `read:'no'` with the reason. Never wider than `caps`:
     *  sending is offered ONLY while the held token carries both send scopes
     *  (P4) — otherwise `[]` with `send-scope-not-granted`, the reason the UI
     *  turns into "reconnect to request it". */
    async convCaps(convId) {
      try {
        await api(`/im/v1/chats/${encodeURIComponent(convId)}`, { what: 'lark chat' });
        const send = hasSendScopes(readToken().token);
        return { read: 'yes', sendAs: send ? ['user'] : [], why: send ? null : 'send-scope-not-granted', at: now() };
      } catch (e) {
        if (e instanceof ChannelError && (e.code === 'forbidden' || e.code === 'not-found')) return { read: 'no', sendAs: [], why: 'not-a-member', at: now() };
        throw e;
      }
    },

    send: sendImpl,

    /**
     * A LOST OUTCOME ONLY (§9.4). ① the chat itself: newest-first back to the
     * send instant (minus slack), bounded — our own text message (same parent
     * for a reply) found there IS the answer. ② inside the uuid window a
     * re-issue with the SAME uuid is safe BY CONSTRUCTION (at most one send
     * per uuid per hour) and its answer is the truth — and it is the right
     * thing to do for an approved message that did not land. ③ past the
     * window, a COMPLETE scan (reached the instant, or the vendor's last page)
     * that holds nothing is `landed:false`; anything short of that is
     * `unknown` with the reason.
     */
    async reconcile(convId, { idemKey, sentAt = null, text = null, replyTo = null } = {}) {
      const selfId = (readToken().token || {}).openId || null;
      const wanted = String(text == null ? '' : text);
      const sent = Number(sentAt) || now();
      const since = sent - RECONCILE_SLACK_MS;
      let pageToken = null, scanned = 0, reachedSince = false, scanErr = null;
      try {
        do {
          const p = new URLSearchParams({ container_id_type: 'chat', container_id: convId, sort_type: 'ByCreateTimeDesc', page_size: '50' });
          if (pageToken) p.set('page_token', pageToken);
          const d = await api(`/im/v1/messages?${p}`, { what: 'lark reconcile scan' });
          const items = (d.data && d.data.items) || [];
          for (const m of items) {
            scanned++;
            if (Number(m.create_time) < since) { reachedSince = true; break; }
            const mine = selfId ? String((m.sender && m.sender.id) || '') === selfId : (m.sender && m.sender.sender_type) !== 'app';
            if (!mine || m.msg_type !== 'text' || m.deleted === true) continue;
            const c = parseContent(m.body && m.body.content);
            if (c && String(c.text || '') === wanted && (!replyTo || String(m.parent_id || '') === String(replyTo))) {
              return { landed: true, vendorMessageId: String(m.message_id), at: Number(m.create_time) || null, detail: { how: 'found-in-chat', scanned } };
            }
          }
          pageToken = reachedSince ? null : nextToken(d.data);
          if (!pageToken) reachedSince = true;   // the vendor's last page: everything since `since` was seen
        } while (pageToken && scanned < RECONCILE_SCAN_MAX);
      } catch (e) { scanErr = e; }
      if (now() - sent < UUID_WINDOW_MS) {
        try {
          const r = await sendImpl(convId, { text: wanted, replyTo, idemKey, as: 'user' });
          return { landed: true, vendorMessageId: r.vendorMessageId, at: r.at, detail: { how: 'reissued-same-uuid', scanned, observed: r.observed || null } };
        } catch (e) {
          return { unknown: true, reason: `the re-issue with the same uuid did not settle it: ${(e && e.message) || e}`, detail: { how: 'reissue-refused', code: (e && e.code) || null, scanned } };
        }
      }
      if (!scanErr && reachedSince) return { landed: false, reason: `no message of yours with that text in the chat since the send (${scanned} scanned, past the vendor's one-hour dedup window)`, detail: { how: 'scan-complete', scanned } };
      return { unknown: true, reason: scanErr ? `the chat could not be scanned: ${(scanErr && scanErr.message) || scanErr}` : `the scan hit its bound (${scanned}) before reaching the send instant`, detail: { how: scanErr ? 'scan-failed' : 'scan-bounded', scanned } };
    },

    /**
     * Newest-first paging TO THE ANCHOR (§6.3). One history() call fetches
     * ONE vendor page (≤ `limit`) and returns the records newer than the
     * stored anchor it found on it; while the anchor has not been met the
     * answer is `reachedAnchor:false, complete:false` and the walk continues
     * on the next call of the SAME pass (the engine hands back the `anchor`
     * this call returned, which is how a continuation is recognised). The
     * returned `anchor` is always the NEWEST id seen, so once the walk is
     * complete the store's cursor is where the next pass stops.
     */
    async history(convId, { anchor = null, limit = 50 } = {}) {
      const size = Math.min(50, Math.max(1, Number(limit) || 50));
      let w = walks.get(convId);
      const continuing = !!(w && w.newest && anchor === w.newest && now() - w.at < WALK_TTL_MS);
      if (!continuing) { w = { stopAt: anchor || null, pageToken: null, newest: null, at: now(), count: 0 }; walks.set(convId, w); }
      const p = new URLSearchParams({ container_id_type: 'chat', container_id: convId, sort_type: 'ByCreateTimeDesc', page_size: String(size) });
      if (w.pageToken) p.set('page_token', w.pageToken);
      const d = await api(`/im/v1/messages?${p}`, { what: 'lark messages' });
      w.at = now();
      const items = ((d.data && d.data.items) || []).filter((m) => m && m.message_id);
      const names = items.length ? await namesFor(convId) : new Map();
      const selfId = (readToken().token || {}).openId || null;
      const fresh = [];
      let reached = false;
      for (const m of items) {
        if (w.stopAt && String(m.message_id) === w.stopAt) { reached = true; break; }
        fresh.push(m);
      }
      if (!w.newest && fresh.length) w.newest = String(fresh[0].message_id);
      w.count += fresh.length;
      const next = nextToken(d.data);
      // THE WALK ENDS at the anchor, at the vendor's last page, or at the
      // FIRST_INGEST_MAX bound — and every end is a COMPLETE pass with the
      // NEWEST id as the cursor. A fresh conversation (no anchor) takes the
      // bound (older history is the vendor's; a "load older" is P5). A stored
      // anchor the vendor no longer serves (a deleted message, or one older
      // than the API still lists) is read PAST — everything the vendor serves
      // has been offered to the log, so nothing was skipped and the dedup
      // absorbs the re-read; calling it incomplete would re-walk the whole
      // chat on every pass for ever. It is SAID, once per walk.
      const exhausted = !next || w.count >= FIRST_INGEST_MAX;
      const done = reached || exhausted;
      if (done) walks.delete(convId); else w.pageToken = next;
      if (done && w.stopAt && !reached) log.warn && log.warn(`[channels] lark: the stored anchor ${w.stopAt} of ${convId} is no longer served — walked ${w.count} records to ${!next ? "the vendor's last page" : `the ${FIRST_INGEST_MAX}-record bound`} and re-anchored on ${w.newest || w.stopAt}`);
      // Oldest-first within the batch (the store orders by (at, vendorId) anyway).
      const records = fresh.reverse().map((m) => toRecord(adapterId, convId, m, { names, selfId }));
      return { records, anchor: w.newest || w.stopAt || null, reachedAnchor: done, complete: done };
    },
  };
}

/**
 * THE INTEGRATION TEST RUNNER (§14.2 `credential-exchange`): exchange the
 * app id / secret pair for ONE tenant token — the self-built-app endpoint,
 * which needs only the pair. Lists no conversation, sends no message. Both
 * brands are tried (an app lives on exactly one); the verdict names which
 * one answered. The row's `test.caveat` is rendered beside it: this proves
 * the pair, not the three console prerequisites.
 */
async function integrationTest({ resolved, signal } = {}, fetchFn = null) {
  const r = resolved || {};
  if (r.source === 'none' || !r.values || !r.values.appId || !r.values.appSecret) return { ok: false, error: `no credential resolved for Lark: ${r.why || (Array.isArray(r.missing) && r.missing.length ? `missing ${r.missing.join(', ')}` : 'nothing configured')}` };
  const f = fetchFn || (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null);
  if (!f) return { ok: false, error: 'no fetch available in this runtime' };
  const errors = [];
  for (const b of BRANDS) {
    try {
      const d = await callJson(f, `${HOSTS[b].open}/open-apis/auth/v3/tenant_access_token/internal`, { method: 'POST', what: `lark tenant token (${b})`, body: { app_id: r.values.appId, app_secret: r.values.appSecret }, signal: signal || null });
      if (d && d.tenant_access_token) return { ok: true, detail: { brand: b, source: r.source, expire: d.expire || null } };
      errors.push(`${b}: no tenant_access_token in the answer`);
    } catch (e) { errors.push(`${b}: ${(e && e.message) || e}`); }
  }
  return { ok: false, error: errors.join('; ') };
}

const adapter = { kind: KIND, caps, create };
module.exports = {
  kind: KIND, caps, create, adapter, label: LABEL, integration: INTEGRATION, integrationTest, OPTIONS,
  EGRESS, HOSTS, BRANDS, SCOPES, SEND_SCOPES, FIRST_INGEST_MAX, WALK_TTL_MS, UUID_WINDOW_MS, UUID_MAX, RECONCILE_SLACK_MS, RECONCILE_SCAN_MAX,
  toRecord, textOf, mentionsOf, attachmentsOf, typedFailure, nextToken, uuidFor, hasSendScopes,
};
