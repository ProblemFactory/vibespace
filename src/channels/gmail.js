'use strict';
/**
 * THE GMAIL READ ADAPTER (docs/design-communication-panel.zh.md §6.3, §12.2,
 * §13, §14.2 — the DELEGATING row; P1's first half). ORCH tier, the §4
 * contract.
 *
 * It owns exactly three things: vendor auth (a USER token minted by the
 * dual-mode loopback flow's EPHEMERAL mode — Google accepts any loopback port,
 * RFC 8252 §7.3, so this is src/gmail-sync.js's flow through the shared
 * machine), vendor paging (`threads.list` under the INCLUDE QUERY for
 * discovery; `history.list?startHistoryId=…&historyTypes=messageAdded` once
 * per pass — a cheap request when nothing changed — with a 404 meaning
 * RESEED and a per-thread 404 meaning SKIP THAT THREAD, never freeze the pass;
 * the thread itself through `threads.get`), and the vendor's message shape
 * (a MIME tree whose `text/plain` part is the record's text; an HTML-only
 * message is flattened; attachments are METADATA only).
 *
 * THE OAUTH CLIENT IS ASKED OF THE ONE RESOLVER, NEVER OF process.env:
 * `deps.resolveIntegration('gmail')` — the `gmail` row DELEGATES to the
 * existing `VIBESPACE_GDRIVE_CLIENTS` presets (decision 5: a cluster adds a
 * `channels` preset key rather than widening the mounts' client), so on a
 * cluster-only instance the answer is `source:'cluster'` with the preset's
 * client id / secret and NOTHING here reads an env name. `auth.state()` takes
 * that answer as an INPUT: a withdrawn client is `needs-credentials` however
 * fresh the token looks — every refresh needs the client secret.
 *
 * A CONVERSATION IS A THREAD (`threadId` = `convId`) and only threads matching
 * the include query become conversations (default `label:INBOX`, a per-record
 * OPTION the panel edits) — otherwise a mailbox is forty thousand rows.
 *
 * THE MAILBOX CURSOR IS IN MEMORY ON PURPOSE. `history.list` is mailbox-wide,
 * so its cursor may only advance once every thread it named has been walked
 * — and untracked threads are never walked, so a persisted cursor could never
 * be proven safe to advance. The first pass after a restart therefore does
 * ONE full `threads.get` per tracked thread (the dedup absorbs the re-read),
 * and every later pass costs one `history.list` plus one `threads.get` per
 * thread that actually changed.
 *
 * THE PUSH LANE IS THE `live` HALF (src/channels/live/gmail.js — `users.watch`
 * + a Pub/Sub PULL subscription, decision 20): `caps.receive` is `push` with
 * `pushOptIn: true`, so the switch is OFF until the user turns it on (the
 * adapter record's `push.enabled === true`); `laneState()` treats an opt-in
 * lane that was never enabled as the poll lane. A pulled note carries no
 * mail — it is a cursor kick — and enabling push adds the `pubsub` scope to
 * the NEXT consent (`scopesFor()`), which the lane refuses by name until it
 * is held.
 *
 * SENDING (P4, §9.4 / §12.2): `caps.sendAs` = `['user']`, narrowed by
 * `convCaps` to `[]` with `send-scope-not-granted` until the held token
 * carries `gmail.send` (the consent asks for it — one re-consent for a token
 * minted before P4). `idempotency: 'two-phase'`: Gmail has no idempotency
 * key on send, so `send()` first CREATES A DRAFT in the thread (a durable
 * handle, reported to the engine through `onHandle` BEFORE the send so a
 * crash between the two phases leaves something `reconcile()` can ask about)
 * and then SENDS THAT DRAFT; a transport failure after phase 2 left is
 * `detail.lost`. Threading = `threadId` + `In-Reply-To`/`References` taken
 * from the anchor message's own `Message-ID` (the replied-to record, else the
 * thread's newest), `To` = its Reply-To/From (its To when it is ours),
 * `Subject` = `Re:` + its subject. `reconcile()` asks whether the draft still
 * exists (⇒ never sent; the draft is discarded and `landed:false`), and when
 * it is gone whether the thread now holds our SENT message (⇒ `landed:true`),
 * else honestly `unknown`. `identityMarking` is the MEASURED `marked` at
 * `raw-headers` (a `Received:` header naming gmailapi.google.com — invisible
 * in mail clients, visible in "Show original").
 *
 * EVERY OUTBOUND HOST IS DECLARED in `EGRESS` (design §3.1); the scope URL's
 * host is declared too — it is a literal in a file that makes requests, and
 * the census reads code.
 */
const { makeRecord, makeConversation } = require('../channel-record.js');
const { ChannelError } = require('./index.js');
const { createGmailLive, PUBSUB_SCOPE } = require('./live/gmail.js');

const KIND = 'gmail';
const LABEL = 'Gmail';
const INTEGRATION = 'gmail';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
/** THE SEND SCOPE (P4, decision 5): requested at consent beside the read one;
 *  a token minted without it narrows `convCaps` to read-only until re-consent. */
const SCOPE_SEND = 'https://www.googleapis.com/auth/gmail.send';
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
/** THE DECLARED EGRESS (§3.1). `www.googleapis.com` is the SCOPE identifier,
 *  not a request target — declared because it is a host literal in a file
 *  that constructs requests, and the census reads code, not intent. */
const EGRESS = Object.freeze(['oauth2.googleapis.com', 'accounts.google.com', 'gmail.googleapis.com', 'www.googleapis.com']);

/** Per-record OPTIONS the engine stores and the panel edits (§6.3). */
/** A declared `label` / `help` is a KEY the client renders with `t()` (a3
 *  i18n): scripts/i18n-extract.mjs collects i18nKey(…) literals, the
 *  dictionaries carry zh + ja. The marker is the identity. */
const i18nKey = (s) => s;
const OPTIONS = Object.freeze([
  { key: 'query', label: i18nKey('Include query'), default: 'label:INBOX', placeholder: 'label:INBOX', maxLength: 500,
    help: i18nKey('A Gmail search query; only threads matching it become conversations. Everything else never appears here.') },
  // THE PUSH LANE'S TWO RESOURCE NAMES (decision 20). `relive:true`: a change
  // restarts the LANE (single-use), never the adapter — the mailbox cursor is
  // untouched.
  { key: 'pushTopic', label: i18nKey('Pub/Sub topic (push)'), default: '', placeholder: 'projects/<project>/topics/<topic>', maxLength: 300, relive: true,
    help: i18nKey('The Cloud Pub/Sub topic Gmail publishes mailbox changes to (users.watch). Grant gmail-api-push@system.gserviceaccount.com the Publisher role on it. Only read when push is enabled.') },
  { key: 'pushSubscription', label: i18nKey('Pub/Sub subscription (push)'), default: '', placeholder: 'projects/<project>/subscriptions/<name>', maxLength: 300, relive: true,
    help: i18nKey('THIS instance\'s own pull subscription of that topic — one per instance is what makes push exclusive here. Only read when push is enabled.') },
]);

const REQUEST_TIMEOUT_MS = 20000;
const REFRESH_MARGIN_MS = 60 * 1000;
/** The mailbox sync is memoised for one pass's worth of history() calls. */
const MAILBOX_MEMO_MS = 20 * 1000;
/** A fetched thread is held for the rest of its walk (several history()
 *  calls of ONE pass page through it). */
const THREAD_MEMO_MS = 60 * 1000;
/** Thread titles (Subject/From) are looked up at most this many per
 *  listConversations call — a discovery pass costs ≤ 1 + this requests. */
const META_PER_LIST = 10;
const META_TTL_MS = 6 * 60 * 60 * 1000;
/** Past this many changed threads the memory says "everything changed". */
const CHANGED_CAP = 5000;

const caps = Object.freeze({
  receive: 'push',
  pushTransport: 'pubsub-pull',
  pushAckBudgetMs: 10000,          // Pub/Sub's default ack deadline — we ack after the engine answered (fence 11)
  pushOptIn: true,                 // DEFAULT OFF (decision 20): `push.enabled === true` on the record turns it on
  pollInterval: { hot: 60, cold: 300, floor: 30 },
  scanSources: null,
  scanLatency: null,
  history: 'page',
  historyBySource: null,
  listConversations: true,
  sendAs: ['user'],                // P4: as the USER; convCaps narrows until gmail.send is held
  identityMarking: 'marked',
  identityMarkingWhere: 'raw-headers',
  identityMarkingText: 'Mail sent through the Gmail API carries a Received: header naming gmailapi.google.com — invisible in mail clients, visible in "Show original".',
  tosRisk: 'none',
  idempotency: 'two-phase',        // a draft (the durable handle) is created, then sent (§9.4)
  threading: 'reply-to',
  editSent: false,
  readReceipts: false,
  attachments: 'metadata',
});

// ── the vendor's message shape → ONE plain-text record ──────────────────
function b64url(data) {
  if (!data) return '';
  try { return Buffer.from(String(data).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8'); } catch { return ''; }
}
function header(headers, name) {
  const n = String(name).toLowerCase();
  for (const h of headers || []) if (h && String(h.name || '').toLowerCase() === n) return String(h.value || '');
  return '';
}
/** `Name <addr>` / `addr` / `"Name" <addr>` → {id: addr, name}. */
function parseAddress(s) {
  const raw = String(s || '').trim();
  const m = /^(.*?)\s*<([^>]+)>\s*$/.exec(raw);
  if (m) return { id: m[2].trim().toLowerCase(), name: m[1].replace(/^"|"$/g, '').trim() || m[2].trim() };
  return { id: raw.toLowerCase(), name: raw };
}
function stripHtml(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
/** Walk the MIME tree ONCE: the first text/plain body, the first text/html
 *  body, and every part that carries a filename (an attachment). */
function walkParts(payload) {
  const out = { plain: null, html: null, attachments: [] };
  const visit = (p) => {
    if (!p || typeof p !== 'object') return;
    const mime = String(p.mimeType || '').toLowerCase();
    const body = p.body || {};
    if (p.filename) {
      out.attachments.push({ id: String(body.attachmentId || p.partId || p.filename), name: String(p.filename), bytes: Number.isFinite(Number(body.size)) ? Number(body.size) : null, mime: mime || null });
    } else if (mime === 'text/plain' && out.plain === null && body.data) out.plain = b64url(body.data);
    else if (mime === 'text/html' && out.html === null && body.data) out.html = b64url(body.data);
    for (const c of p.parts || []) visit(c);
  };
  visit(payload);
  return out;
}
/** ONE vendor message → ONE ChannelRecord. `selfEmail` is the authorizing
 *  user's address (from `users.getProfile`). */
function toRecord(adapterId, convId, m, { selfEmail = null } = {}) {
  const headers = (m.payload && m.payload.headers) || [];
  const from = parseAddress(header(headers, 'From'));
  const parts = walkParts(m.payload);
  const text = (parts.plain && parts.plain.trim()) ? parts.plain.trim() : (parts.html ? stripHtml(parts.html) : String(m.snippet || ''));
  return makeRecord({
    adapterId, convId,
    vendorId: String(m.id || ''),
    at: Number(m.internalDate) || 0,
    author: { id: from.id, name: from.name, isSelf: !!selfEmail && from.id === String(selfEmail).toLowerCase(), isBot: false },
    text,
    mentions: [],
    attachments: parts.attachments,
    replyTo: null,          // In-Reply-To names a Message-ID header, not a vendor id; the thread is the link
    threadKey: String(m.threadId || convId),
    raw: { subject: header(headers, 'Subject') || null, labelIds: Array.isArray(m.labelIds) ? m.labelIds.slice(0, 20) : [], messageId: header(headers, 'Message-ID') || null, to: header(headers, 'To') || null },
  });
}

// ── the outbound message (P4): RFC 5322 text, threading headers ─────────
/** A header value: ASCII as-is, else RFC 2047 encoded-word (UTF-8, base64). */
function encodeHeader(s) {
  const v = String(s == null ? '' : s).replace(/[\r\n]+/g, ' ');
  return /^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, 'utf-8').toString('base64')}?=`;
}
/**
 * THE MIME the draft carries: text/plain, base64, CRLF; From/To/Cc/Subject and
 * the two threading headers when the anchor has a Message-ID. PURE.
 */
function buildMime({ from = null, to, cc = null, subject = '', inReplyTo = null, references = null, text = '' } = {}) {
  const lines = [];
  if (from) lines.push(`From: ${encodeHeader(from)}`);
  lines.push(`To: ${encodeHeader(to)}`);
  if (cc) lines.push(`Cc: ${encodeHeader(cc)}`);
  lines.push(`Subject: ${encodeHeader(subject)}`);
  if (inReplyTo) lines.push(`In-Reply-To: ${String(inReplyTo).replace(/[\r\n]+/g, ' ')}`);
  if (references) lines.push(`References: ${String(references).replace(/[\r\n]+/g, ' ')}`);
  lines.push('MIME-Version: 1.0', 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '');
  lines.push(Buffer.from(String(text == null ? '' : text), 'utf-8').toString('base64').replace(/(.{76})/g, '$1\r\n'));
  return lines.join('\r\n');
}
/**
 * WHO A REPLY GOES TO, from the anchor message's headers (PURE). Ours (From
 * is the authorizing user) ⇒ reply to its To; anybody else's ⇒ its Reply-To,
 * else its From. Subject gets ONE `Re:`; In-Reply-To/References chain on the
 * anchor's Message-ID (absent ⇒ the thread id alone links, and both stay
 * null rather than invented).
 */
function replyHeaders(anchor, selfEmail = null) {
  const h = (anchor && anchor.payload && anchor.payload.headers) || [];
  const from = parseAddress(header(h, 'From'));
  const ours = !!selfEmail && from.id === String(selfEmail).toLowerCase();
  const to = ours ? header(h, 'To') : (header(h, 'Reply-To') || header(h, 'From'));
  const subject0 = header(h, 'Subject') || '';
  const subject = /^\s*re:/i.test(subject0) ? subject0.trim() : `Re: ${subject0}`.trim();
  const mid = header(h, 'Message-ID') || null;
  const refs = header(h, 'References') || '';
  return { to: to || null, cc: null, subject, inReplyTo: mid, references: [refs, mid].filter(Boolean).join(' ') || null, ours };
}

// ── typed failures ─────────────────────────────────────────────────────
function typedFailure(status, body, what) {
  const err = body && body.error;
  const msg = (err && (err.message || err.status)) || (body && (body.error_description || body.error)) || `HTTP ${status}`;
  const reason = err && Array.isArray(err.errors) && err.errors[0] && err.errors[0].reason;
  if (status === 401 || body && body.error === 'invalid_grant') return new ChannelError('auth-expired', `${what}: ${msg} (${status})`, { retryable: false, detail: { status, reason: reason || (body && body.error) || null } });
  if (status === 429 || reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded') return new ChannelError('rate-limited', `${what}: ${msg} (${status})`, { retryable: true, detail: { status, reason } });
  if (status === 403) return new ChannelError('forbidden', `${what}: ${msg} (${status})`, { retryable: false, detail: { status, reason } });
  if (status === 404) return new ChannelError('not-found', `${what}: ${msg} (${status})`, { retryable: false, detail: { status, reason } });
  if (status >= 500) return new ChannelError('transport', `${what}: ${msg} (${status})`, { retryable: true, detail: { status } });
  return new ChannelError('vendor-error', `${what}: ${msg} (${status})`, { retryable: false, detail: { status, reason } });
}
async function callJson(fetchFn, url, { method = 'GET', headers = {}, form = null, json = null, what = 'gmail', signal = null } = {}) {
  let r;
  try {
    r = await fetchFn(url, {
      method, headers: { Accept: 'application/json', ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : json != null ? { 'Content-Type': 'application/json; charset=utf-8' } : {}), ...headers },
      body: form ? new URLSearchParams(form).toString() : json != null ? JSON.stringify(json) : undefined,
      signal: signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (e) {
    throw new ChannelError('transport', `${what}: ${(e && e.message) || e}`, { retryable: true });
  }
  let parsed = null;
  try { parsed = await r.json(); } catch { parsed = null; }
  if (!r.ok) throw typedFailure(r.status, parsed, what);
  return parsed || {};
}

// ── the adapter ───────────────────────────────────────────────────────
function create(record = {}, deps = {}) {
  const adapterId = record.id || KIND;
  const now = typeof deps.now === 'function' ? deps.now : () => Date.now();
  const fetchFn = typeof deps.fetch === 'function' ? deps.fetch : (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null);
  const resolveIntegration = typeof deps.resolveIntegration === 'function' ? deps.resolveIntegration : null;
  const tokens = deps.tokens || null;
  const oauth = deps.oauth || null;
  const log = deps.log || console;

  /** The include query is read from the LIVE record at call time — the
   *  engine mutates that object in place when the panel edits it. */
  const query = () => String((record.options && record.options.query) || OPTIONS[0].default).trim() || OPTIONS[0].default;
  /** The push switch and its two resource names, read LIVE from the record. */
  const pushEnabled = () => !!(record.push && record.push.enabled === true);
  const pushOptions = () => ({ topic: String((record.options && record.options.pushTopic) || '').trim(), subscription: String((record.options && record.options.pushSubscription) || '').trim() });
  /** The consent's scopes: the read scope always; the pubsub scope when the
   *  push switch is on at consent time (an existing token is untouched —
   *  scopes bind at consent, so enabling push asks for ONE re-authorize). */
  const scopesFor = () => (pushEnabled() ? [SCOPE, SCOPE_SEND, PUBSUB_SCOPE] : [SCOPE, SCOPE_SEND]);
  /** Does the HELD token carry the send scope (P4)? */
  const hasSendScope = () => (((readToken().token || {}).scopes) || []).includes(SCOPE_SEND);

  // `walked` = the threads this PROCESS has fully read at least once since
  // the last (re)seed: a thread not in it is fetched whatever history.list
  // says (the first pass after a restart, or after a reseed), one in it is
  // fetched only when history.list names it.
  const mailbox = { historyId: null, at: 0, changed: new Set(), walked: new Set(), self: null };
  const threads = new Map();   // convId -> { thread, at }
  const meta = new Map();      // convId -> { title, participants, lastAt, at }

  /** THIS ACCOUNT's credential binding (2026-09-22): `cluster:<k>` / `own`,
   *  handed down by the engine (`deps.credentialKey`) and read LIVE off the
   *  record as a fallback (the legacy stamp lands after construction); null
   *  = the row's own pick. EVERY resolveIntegration below carries it, so
   *  the consent, the refresh, the status and the Test all name ONE client. */
  const credentialKeyOf = () => (typeof deps.credentialKey === 'string' && deps.credentialKey) || (record && typeof record.credentialKey === 'string' && record.credentialKey) || null;
  function credential() {
    const credentialKey = credentialKeyOf();
    if (!resolveIntegration) return { values: null, why: 'no integration resolver was handed to this adapter', missing: [], credentialKey };
    let r;
    try { r = resolveIntegration('gmail', { credentialKey }); } catch (e) { return { values: null, why: `integration lookup failed: ${(e && e.message) || e}`, missing: [], credentialKey }; }
    if (!r || r.source === 'none' || (Array.isArray(r.missing) && r.missing.length)) {
      return { values: null, why: (r && r.why) || 'no Google OAuth client is configured', whyCode: (r && r.whyCode) || null, whyParams: (r && r.whyParams) || null, missing: (r && r.missing) || [], source: r ? r.source : 'none', credentialKey };
    }
    return { values: r.values, why: null, missing: [], source: r.source, clusterLabel: r.clusterLabel || null, clusterKey: r.clusterKey || null, credentialKey };
  }
  function readToken() {
    if (!tokens) return { token: null, why: 'no token store was handed to this adapter' };
    const t = tokens.read();
    if (!t || !t.token) return { token: null, why: (t && t.why) || 'never-authenticated' };
    return { token: t.token, why: null };
  }
  /** A live access token, refreshed with the CLIENT the resolver answers. */
  async function accessToken() {
    const cred = credential();
    if (!cred.values) throw new ChannelError('auth-expired', `Google OAuth client missing: ${cred.why}`, { retryable: false, detail: { needsCredentials: true } });
    const { token, why } = readToken();
    if (!token) throw new ChannelError('auth-expired', `Gmail is not connected (${why})`, { retryable: false });
    if (token.invalidGrantAt) throw new ChannelError('auth-expired', 'Gmail refresh token was refused — re-authorize', { retryable: false });
    if (token.access_token && Number(token.expiresAt) > now() + REFRESH_MARGIN_MS) return token.access_token;
    if (!token.refresh_token) throw new ChannelError('auth-expired', 'Gmail access token expired and no refresh token is held — re-authorize', { retryable: false });
    let d;
    try {
      d = await callJson(fetchFn, TOKEN_URL, { method: 'POST', what: 'gmail token refresh', form: { grant_type: 'refresh_token', client_id: cred.values.clientId, client_secret: cred.values.clientSecret, refresh_token: token.refresh_token } });
    } catch (e) {
      // `invalid_grant` = the refresh token is dead (revoked, or a Testing
      // client's 7-day lifetime): stamped on the record so `auth.state()`
      // says `needs-reauth` instead of retrying a dead grant every pass.
      if (e instanceof ChannelError && e.code === 'auth-expired' && tokens) await tokens.write({ ...token, invalidGrantAt: now() }, { expiresAt: null, scopes: token.scopes || [], user: token.email || null });
      throw e;
    }
    const next = { ...token, access_token: String(d.access_token || ''), expiresAt: now() + Number(d.expires_in || 3600) * 1000, refresh_token: String(d.refresh_token || token.refresh_token) };
    await tokens.write(next, { expiresAt: null, scopes: next.scopes || [], user: next.email || null });
    return next.access_token;
  }
  const api = async (pathq, opts = {}) => {
    const at = await accessToken();
    return callJson(fetchFn, `${API}${pathq}`, { ...opts, headers: { Authorization: `Bearer ${at}`, ...(opts.headers || {}) } });
  };
  const selfEmail = () => { const t = readToken().token; return (t && t.email) || mailbox.self || null; };

  /** ONE `history.list` per pass (memoised): which threads gained messages
   *  since the cursor. A 404 is RESEED (the cursor is too old); no cursor is
   *  RESEED too (a fresh process). "Reseed" = walk every tracked thread. */
  async function syncMailbox() {
    if (now() - mailbox.at < MAILBOX_MEMO_MS) return mailbox;
    mailbox.at = now();
    if (!mailbox.historyId) {
      const p = await api('/profile', { what: 'gmail profile' });
      mailbox.historyId = String(p.historyId || '');
      mailbox.self = p.emailAddress ? String(p.emailAddress).toLowerCase() : mailbox.self;
      mailbox.walked.clear();
      return mailbox;
    }
    let pageToken = null, pages = 0, newest = mailbox.historyId;
    try {
      do {
        const q = new URLSearchParams({ startHistoryId: mailbox.historyId, historyTypes: 'messageAdded', maxResults: '500' });
        if (pageToken) q.set('pageToken', pageToken);
        const h = await api(`/history?${q}`, { what: 'gmail history' });
        for (const ev of h.history || []) for (const a of ev.messagesAdded || []) if (a && a.message && a.message.threadId) mailbox.changed.add(String(a.message.threadId));
        if (h.historyId) newest = String(h.historyId);
        pageToken = h.nextPageToken ? String(h.nextPageToken) : null;
      } while (pageToken && ++pages < 20);
      mailbox.historyId = newest;
      if (mailbox.changed.size > CHANGED_CAP) { mailbox.changed.clear(); mailbox.walked.clear(); }
    } catch (e) {
      if (e instanceof ChannelError && e.code === 'not-found') {
        // The stored historyId is too old for the vendor: reseed from the
        // profile and walk everything once (gmail-sync's own rule).
        log.warn && log.warn(`[channels] gmail: history cursor ${mailbox.historyId} expired — reseeding, every tracked thread is walked once`);
        const p = await api('/profile', { what: 'gmail profile' });
        mailbox.historyId = String(p.historyId || '');
        mailbox.changed.clear();
        mailbox.walked.clear();
        return mailbox;
      }
      throw e;
    }
    return mailbox;
  }
  async function threadFull(convId) {
    const c = threads.get(convId);
    if (c && now() - c.at < THREAD_MEMO_MS) return c.thread;
    const t = await api(`/threads/${encodeURIComponent(convId)}?format=full`, { what: 'gmail thread' });
    threads.set(convId, { thread: t, at: now() });
    return t;
  }
  /** Title + participants for a thread, from ONE metadata read, cached. */
  async function metaFor(convId) {
    const c = meta.get(convId);
    if (c && now() - c.at < META_TTL_MS) return c;
    const t = await api(`/threads/${encodeURIComponent(convId)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`, { what: 'gmail thread metadata' });
    const msgs = Array.isArray(t.messages) ? t.messages : [];
    const first = msgs[0] || {};
    const subject = header(first.payload && first.payload.headers, 'Subject') || '(no subject)';
    const names = [...new Set(msgs.map((m) => parseAddress(header(m.payload && m.payload.headers, 'From')).name).filter(Boolean))];
    const lastAt = msgs.reduce((a, m) => Math.max(a, Number(m.internalDate) || 0), 0) || null;
    const out = { title: subject, participants: names.join(', '), lastAt, at: now() };
    meta.set(convId, out);
    return out;
  }

  // THE PUSH LANE (decision 20, default off): the watch + pull loop over this
  // adapter's own authorized call, token and LIVE options.
  const live = createGmailLive({
    adapterId, api, accessToken, fetch: fetchFn, now, log,
    tokenScopes: () => ((readToken().token || {}).scopes || []),
    options: pushOptions,
    reconnectMinMs: deps.reconnectMinMs, reconnectMaxMs: deps.reconnectMaxMs,
    pullTimeoutMs: deps.pullTimeoutMs, watchRenewMs: deps.watchRenewMs,
  });

  return {
    live,
    auth: {
      async state() {
        const cred = credential();
        const credentialKey = cred.credentialKey || null;   // the view NAMES the account's credential
        if (!cred.values) return { state: 'needs-credentials', expiresAt: null, scopes: [], why: cred.why, whyCode: cred.whyCode || null, whyParams: cred.whyParams || null, missing: cred.missing.slice(), credentialSource: cred.source || 'none', credentialKey };
        const { token, why } = readToken();
        if (!token) return { state: 'unknown', expiresAt: null, scopes: [], why, credentialSource: cred.source, credentialKey };
        if (token.invalidGrantAt) return { state: 'needs-reauth', expiresAt: null, scopes: token.scopes || [], why: 'refresh-refused', credentialSource: cred.source, credentialKey };
        if (!token.refresh_token) return { state: 'needs-reauth', expiresAt: Number(token.expiresAt) || null, scopes: token.scopes || [], why: 'no-refresh-token', credentialSource: cred.source, credentialKey };
        // A Google refresh token carries no stated lifetime (a Testing
        // client's 7-day one is a policy, not a field), so the countdown is
        // null and the honest signal is the vendor's `invalid_grant`.
        return { state: 'connected', expiresAt: null, scopes: token.scopes || [], why: null, credentialSource: cred.source, clusterKey: cred.clusterKey || null, credentialKey, user: token.email || null };
      },
      /** The EPHEMERAL-mode loopback flow (§12.4): gmail-sync's own consent
       *  parameters, the CLIENT from the resolver, the exchange requiring a
       *  refresh_token (gmail-sync's own check), then ONE profile read so
       *  `isSelf` and the row's "who" can be answered. */
      async begin() {
        if (!oauth) throw new ChannelError('not-supported', 'gmail.auth.begin: no OAuth loopback was handed to this adapter', { retryable: false });
        const cred = credential();
        if (!cred.values) throw new ChannelError('auth-expired', `cannot start a Gmail consent flow: ${cred.why}`, { retryable: false, detail: { needsCredentials: true, missing: cred.missing } });
        const { clientId, clientSecret } = cred.values;
        return oauth.begin({
          id: adapterId, mode: 'ephemeral', label: 'Gmail',
          successText: 'VibeSpace: Gmail connected — you can close this tab.',
          buildConsentUrl: ({ redirectUri, state }) => AUTH_URL + '?' + new URLSearchParams({
            client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: scopesFor().join(' '),
            access_type: 'offline', prompt: 'consent', state,
          }),
          exchange: async ({ code, redirectUri }) => {
            const d = await callJson(fetchFn, TOKEN_URL, { method: 'POST', what: 'gmail token exchange', form: { code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' } });
            if (!d.refresh_token) throw new ChannelError('vendor-error', 'no refresh_token returned — remove the app from myaccount.google.com/permissions and retry', { retryable: false });
            const tok = { access_token: String(d.access_token || ''), expiresAt: now() + Number(d.expires_in || 3600) * 1000, refresh_token: String(d.refresh_token), scopes: String(d.scope || SCOPE).split(/\s+/).filter(Boolean), email: null, clusterKey: cred.clusterKey || null };
            try {
              const me = await callJson(fetchFn, `${API}/profile`, { what: 'gmail profile', headers: { Authorization: `Bearer ${tok.access_token}` } });
              tok.email = me.emailAddress ? String(me.emailAddress).toLowerCase() : null;
              mailbox.self = tok.email;
            } catch (e) { log.warn && log.warn('[channels] gmail: profile unavailable after consent:', (e && e.message) || e); }
            if (tokens) await tokens.write(tok, { expiresAt: null, scopes: tok.scopes, user: tok.email });
            return { ok: true, user: tok.email, scopes: tok.scopes };
          },
          onDone: deps.onAuthDone ? (r) => deps.onAuthDone(adapterId, r) : null,
        });
      },
      async finish(flowId, url) {
        if (!oauth) throw new ChannelError('not-supported', 'gmail.auth.finish: no OAuth loopback was handed to this adapter', { retryable: false });
        const r = await oauth.forwardCallback(flowId, url);
        return { ok: r.ok, error: r.error || null, record: r.result || null };
      },
    },

    /** Threads under the include query. Titles come from ONE bounded batch
     *  of metadata reads per call; an untitled thread shows its snippet
     *  until its turn comes. */
    async listConversations({ cursor = null, limit = 100 } = {}) {
      const p = new URLSearchParams({ q: query(), maxResults: String(Math.min(100, Math.max(1, Number(limit) || 100))) });
      if (cursor) p.set('pageToken', String(cursor));
      const d = await api(`/threads?${p}`, { what: 'gmail threads' });
      const items = (d.threads || []).filter((t) => t && t.id);
      let budget = META_PER_LIST;
      const conversations = [];
      for (const t of items) {
        const id = String(t.id);
        let m = meta.get(id);
        if ((!m || now() - m.at >= META_TTL_MS) && budget > 0) {
          budget--;
          try { m = await metaFor(id); } catch (e) { if (e instanceof ChannelError && e.code === 'auth-expired') throw e; m = null; }
        }
        conversations.push(makeConversation({
          id, vendorId: id,
          title: (m && m.title) || String(t.snippet || id).slice(0, 120) || id,
          kind: 'thread',
          participants: (m && m.participants) || '',
          lastAt: (m && m.lastAt) || null,
        }));
      }
      const next = d.nextPageToken ? String(d.nextPageToken) : null;
      return { conversations, cursor: next, complete: !next };
    },

    /** Membership = the thread is readable by this account (one metadata
     *  read); a 404 is `read:'no'` with the reason. Never wider than caps:
     *  sending is offered ONLY while the held token carries `gmail.send`
     *  (P4), else `[]` with `send-scope-not-granted`. */
    async convCaps(convId) {
      try {
        await metaFor(convId);
        const send = hasSendScope();
        return { read: 'yes', sendAs: send ? ['user'] : [], why: send ? null : 'send-scope-not-granted', at: now() };
      } catch (e) {
        if (e instanceof ChannelError && (e.code === 'not-found' || e.code === 'forbidden')) return { read: 'no', sendAs: [], why: 'not-a-member', at: now() };
        throw e;
      }
    },

    /**
     * THE TWO-PHASE SEND (P4, §9.4). Phase 0: the anchor message's headers
     * (ONE metadata read of the thread) decide To / Subject / threading.
     * Phase 1: `drafts.create` in the thread — the DURABLE HANDLE, handed to
     * `onHandle` and awaited BEFORE phase 2 so the engine persists it. Phase
     * 2: `drafts.send`. A transport failure in phase 1 is a refusal (nothing
     * was sent; at worst a stray draft, said in `detail`); in phase 2 it is
     * `detail.lost` with the handle (the draft may have gone out).
     */
    async send(convId, { text, replyTo = null, idemKey, as = 'user', onHandle = null } = {}) {
      if (as !== 'user') throw new ChannelError('send-not-available', `gmail: sending as '${as}' is not declared (caps.sendAs: user)`, { retryable: false, detail: { sendAs: caps.sendAs } });
      if (!hasSendScope()) throw new ChannelError('forbidden', 'gmail: the held token has no gmail.send scope — reconnect to request it', { retryable: false, detail: { why: 'send-scope-not-granted' } });
      const t = await api(`/threads/${encodeURIComponent(convId)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Reply-To&metadataHeaders=Message-ID&metadataHeaders=References`, { what: 'gmail thread (reply anchor)' });
      const msgs = (Array.isArray(t.messages) ? t.messages : []).filter((m) => m && m.id)
        .sort((a, b) => (Number(a.internalDate) || 0) - (Number(b.internalDate) || 0) || String(a.id).localeCompare(String(b.id)));
      if (!msgs.length) throw new ChannelError('not-found', `gmail: thread ${convId} holds no message to reply to`, { retryable: false });
      const anchor = (replyTo && msgs.find((m) => String(m.id) === String(replyTo))) || msgs[msgs.length - 1];
      const self = selfEmail();
      const h = replyHeaders(anchor, self);
      if (!h.to) throw new ChannelError('vendor-error', `gmail: the anchor message ${anchor.id} names no recipient to reply to`, { retryable: false, detail: { anchorId: String(anchor.id) } });
      const raw = Buffer.from(buildMime({ from: self, to: h.to, cc: h.cc, subject: h.subject, inReplyTo: h.inReplyTo, references: h.references, text }), 'utf-8').toString('base64url');
      let d;
      try { d = await api('/drafts', { method: 'POST', what: 'gmail draft create', json: { message: { threadId: convId, raw } } }); }
      catch (e) {
        if (e instanceof ChannelError && e.code === 'transport') throw new ChannelError('transport', `${e.message} — nothing was sent (a stray draft may exist)`, { retryable: true, detail: { ...(e.detail || {}), phase: 'draft', draftMayExist: true } });
        throw e;
      }
      const handle = { draftId: String((d && d.id) || ''), messageId: d && d.message && d.message.id ? String(d.message.id) : null, threadId: convId, at: now() };
      if (!handle.draftId) throw new ChannelError('vendor-error', 'gmail: drafts.create answered without a draft id', { retryable: false, detail: { phase: 'draft' } });
      if (typeof onHandle === 'function') await onHandle(handle);
      let s2;
      try { s2 = await api('/drafts/send', { method: 'POST', what: 'gmail draft send', json: { id: handle.draftId } }); }
      catch (e) {
        if (e instanceof ChannelError && e.code === 'transport') throw new ChannelError('transport', `${e.message} — the send request left and the answer was lost`, { retryable: true, detail: { ...(e.detail || {}), lost: true, phase: 'send', handle } });
        throw e;
      }
      return { ok: true, vendorMessageId: String((s2 && s2.id) || handle.messageId || ''), at: now(), sentAs: 'user', handle, threadId: (s2 && s2.threadId) || convId, anchorId: String(anchor.id) };
    },

    /**
     * A LOST OUTCOME ONLY (§9.4). With the persisted handle: `drafts.get` —
     * still there ⇒ never sent ⇒ discarded (it would otherwise sit in the
     * user's Drafts as a stale duplicate) ⇒ `landed:false`; gone ⇒ the thread
     * must hold our SENT message (by the draft's message id, else any SENT
     * message from us since the send) ⇒ `landed:true`; neither ⇒ `unknown`.
     * Without a handle (the crash came before phase 1's handle was persisted)
     * the drafts list is searched for one in this thread first.
     */
    async reconcile(convId, { idemKey, sentAt = null, handle = null, text = null } = {}) {
      const since = (Number(sentAt) || now()) - 60e3;
      let draftId = handle && handle.draftId ? String(handle.draftId) : null;
      if (!draftId) {
        try {
          const l = await api('/drafts?maxResults=100', { what: 'gmail drafts list' });
          const mine = (l.drafts || []).find((x) => x && x.message && String(x.message.threadId) === String(convId));
          if (mine) draftId = String(mine.id);
        } catch (e) { return { unknown: true, reason: `the drafts could not be listed: ${(e && e.message) || e}`, detail: { how: 'list-failed' } }; }
      }
      if (draftId) {
        let exists = null;
        try { await api(`/drafts/${encodeURIComponent(draftId)}?format=minimal`, { what: 'gmail draft get' }); exists = true; }
        catch (e) {
          if (e instanceof ChannelError && e.code === 'not-found') exists = false;
          else return { unknown: true, reason: `the draft could not be read: ${(e && e.message) || e}`, detail: { how: 'draft-get-failed', draftId } };
        }
        if (exists) {
          let discarded = false;
          try { await api(`/drafts/${encodeURIComponent(draftId)}`, { method: 'DELETE', what: 'gmail draft delete' }); discarded = true; } catch {}
          return { landed: false, reason: `the draft was never sent${discarded ? ' — it has been discarded' : ' (it could not be discarded; delete it by hand)'}`, detail: { how: 'draft-still-exists', draftId, discarded } };
        }
      }
      try {
        const t = await api(`/threads/${encodeURIComponent(convId)}?format=metadata&metadataHeaders=From&metadataHeaders=Message-ID`, { what: 'gmail thread (reconcile)' });
        const self = selfEmail();
        const msgs = (Array.isArray(t.messages) ? t.messages : []).filter((m) => m && m.id);
        const byId = handle && handle.messageId ? msgs.find((m) => String(m.id) === String(handle.messageId)) : null;
        const cand = byId || msgs
          .filter((m) => (Array.isArray(m.labelIds) ? m.labelIds : []).includes('SENT') && (Number(m.internalDate) || 0) >= since && (!self || parseAddress(header(m.payload && m.payload.headers, 'From')).id === self))
          .sort((a, b) => (Number(b.internalDate) || 0) - (Number(a.internalDate) || 0))[0];
        if (cand) return { landed: true, vendorMessageId: String(cand.id), at: Number(cand.internalDate) || null, detail: { how: byId ? 'draft-message-id' : 'sent-in-thread', draftId } };
        return { unknown: true, reason: draftId ? 'the draft is gone but no sent message of yours is in the thread since the send' : 'no draft and no sent message of yours in the thread since the send', detail: { how: 'no-evidence', draftId } };
      } catch (e) { return { unknown: true, reason: `the thread could not be read: ${(e && e.message) || e}`, detail: { how: 'thread-failed', draftId } }; }
    },

    /**
     * ONE thread's messages newer than the anchor, oldest-first, at most
     * `limit` per call; the SAME pass continues with the anchor it returned.
     * `history.list` decides whether the thread is fetched at all: with an
     * anchor and a mailbox cursor that names no change for this thread the
     * answer is an EMPTY COMPLETE page and no vendor request beyond the one
     * shared sync. A thread the vendor no longer serves is SKIPPED (empty,
     * complete, said once) — a dead id never freezes the pass (§6.3).
     */
    async history(convId, { anchor = null, limit = 50 } = {}) {
      const size = Math.min(100, Math.max(1, Number(limit) || 50));
      const mb = await syncMailbox();
      if (anchor && mb.walked.has(convId) && !mb.changed.has(convId) && !threads.has(convId)) {
        return { records: [], anchor, reachedAnchor: true, complete: true };
      }
      let t;
      try { t = await threadFull(convId); }
      catch (e) {
        if (e instanceof ChannelError && e.code === 'not-found') {
          log.warn && log.warn(`[channels] gmail: thread ${convId} is no longer served — skipped (the pass continues)`);
          mailbox.changed.delete(convId);
          return { records: [], anchor, reachedAnchor: true, complete: true };
        }
        throw e;
      }
      const msgs = (Array.isArray(t.messages) ? t.messages : []).filter((m) => m && m.id)
        .sort((a, b) => (Number(a.internalDate) || 0) - (Number(b.internalDate) || 0) || String(a.id).localeCompare(String(b.id)));
      let idx = -1;
      if (anchor) {
        idx = msgs.findIndex((m) => String(m.id) === String(anchor));
        if (idx < 0) log.warn && log.warn(`[channels] gmail: the stored anchor ${anchor} of ${convId} is no longer in the thread — re-reading it (the dedup absorbs the re-read)`);
      }
      const pending = msgs.slice(idx + 1);
      const page = pending.slice(0, size);
      const drained = page.length === pending.length;
      if (drained) { mailbox.changed.delete(convId); mailbox.walked.add(convId); threads.delete(convId); }
      const self = selfEmail();
      return {
        records: page.map((m) => toRecord(adapterId, convId, m, { selfEmail: self })),
        anchor: page.length ? String(page[page.length - 1].id) : (anchor || (msgs.length ? String(msgs[msgs.length - 1].id) : null)),
        reachedAnchor: drained,
        complete: drained,
      };
    },
  };
}

/**
 * THE INTEGRATION TEST RUNNER (§14.2 `shape-only`, ZERO network): a Google
 * OAuth client cannot be exchanged for anything on its own (no
 * client-credentials grant), so the verdict is the client's SHAPE and the
 * authorization URL it would build. The row's caveat says the rest.
 */
async function integrationTest({ resolved } = {}) {
  const r = resolved || {};
  if (r.source === 'none' || !r.values) return { ok: false, error: `no OAuth client resolved for Gmail: ${r.why || (Array.isArray(r.missing) && r.missing.length ? `missing ${r.missing.join(', ')}` : 'nothing configured')}` };
  const id = String(r.values.clientId || ''), secret = String(r.values.clientSecret || '');
  if (!/\.apps\.googleusercontent\.com$/.test(id)) return { ok: false, error: `the resolved client id does not look like a Google OAuth client id (…apps.googleusercontent.com)${r.source === 'cluster' ? ` — check the cluster preset${r.clusterKey ? ` '${r.clusterKey}'` : ''}` : ''}` };
  if (secret.length < 8) return { ok: false, error: 'the resolved client secret is shorter than 8 characters' };
  const url = AUTH_URL + '?' + new URLSearchParams({ client_id: id, redirect_uri: 'http://127.0.0.1:0', response_type: 'code', scope: SCOPE, access_type: 'offline', prompt: 'consent', state: 'shape-only' });
  return { ok: true, detail: { source: r.source, clusterKey: r.clusterKey || null, clientId: id, authHost: new URL(url).host, scope: SCOPE } };
}

const adapter = { kind: KIND, caps, create };
module.exports = {
  kind: KIND, caps, create, adapter, label: LABEL, integration: INTEGRATION, integrationTest, OPTIONS,
  EGRESS, SCOPE, SCOPE_SEND, PUBSUB_SCOPE, TOKEN_URL, AUTH_URL, API, MAILBOX_MEMO_MS, THREAD_MEMO_MS, META_PER_LIST,
  toRecord, walkParts, parseAddress, stripHtml, typedFailure, buildMime, replyHeaders, encodeHeader,
};
