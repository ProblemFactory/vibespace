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
 * carries a scope that covers DRAFTS + SENDING — `gmail.compose` (what the
 * consent asks for since the R4 verify, 2026-09-27; `gmail.modify` or
 * `https://mail.google.com/` cover it too). Google's own method table:
 * `drafts.create` / `drafts.send` / `drafts.delete` accept mail.google.com,
 * gmail.modify, gmail.compose — NOT `gmail.send` ("Send email on your behalf"
 * covers `messages.send` alone), so the P4 consent (readonly + gmail.send)
 * minted tokens whose every REPLY would have been refused 403 at the draft.
 * One re-consent for such a token; until then `convCaps` says
 * `send-scope-not-granted` and `send()` refuses BY NAME before any request.
 * A token holding only `gmail.send` still COMPOSES (`messages.send`, R4):
 * `sendVerbsOf(scopes)` is the ONE table of what the held scopes allow.
 * `idempotency: 'two-phase'`: Gmail has no idempotency
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
const { ChannelError, retryAfterSeconds } = require('./index.js');
const { namelessSentence, looksLikeEmail } = require('../channel-identity.js');   // verify r6: a consent must name its account; r7: an address by the ONE rule
const { createGmailLive, PUBSUB_SCOPE } = require('./live/gmail.js');

const KIND = 'gmail';
const LABEL = 'Gmail';
const INTEGRATION = 'gmail';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
/** THE SEND SCOPE the consent asks for (P4 decision 5, corrected by the R4
 *  verify 2026-09-27): `gmail.compose` = "Manage drafts and send emails" —
 *  the ONLY scope short of modify / mail.google.com that covers the reply's
 *  `drafts.create` + `drafts.send` (+ reconcile's `drafts.delete`) AND
 *  `messages.send`. `gmail.send` ("Send email on your behalf") covers
 *  `messages.send` alone: it is RECOGNISED on a held token (compose only) and
 *  never asked for again — two overlapping rows on the consent screen would
 *  read as two permissions for one thing. Both readonly and compose are
 *  Google's RESTRICTED class, so the app's verification class is unchanged. */
const SCOPE_COMPOSE = 'https://www.googleapis.com/auth/gmail.compose';
const SCOPE_SEND = 'https://www.googleapis.com/auth/gmail.send';
const SCOPE_MODIFY = 'https://www.googleapis.com/auth/gmail.modify';
const SCOPE_MAIL = 'https://mail.google.com/';
/** THE SCOPE TABLE (PURE): what the HELD scopes allow. `reply` = the
 *  two-phase draft send (compose | modify | mail.google.com); `compose` = one
 *  `messages.send` (any of those, or the legacy `gmail.send`). */
function sendVerbsOf(scopes) {
  const s = new Set(Array.isArray(scopes) ? scopes.map(String) : []);
  const drafts = s.has(SCOPE_COMPOSE) || s.has(SCOPE_MODIFY) || s.has(SCOPE_MAIL);
  return { reply: drafts, compose: drafts || s.has(SCOPE_SEND), drafts };
}
/** The header a composed message carries so a lost answer can be matched to
 *  its PROPOSAL without trusting Gmail to keep our Message-ID (R4 verify). */
const PROPOSAL_HEADER = 'X-VibeSpace-Proposal';
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
/** THE DECLARED EGRESS (§3.1). `www.googleapis.com` and `mail.google.com`
 *  are SCOPE identifiers, not request targets — declared because they are
 *  host literals in a file that constructs requests, and the census reads
 *  code, not intent. */
const EGRESS = Object.freeze(['oauth2.googleapis.com', 'accounts.google.com', 'gmail.googleapis.com', 'www.googleapis.com', 'mail.google.com']);

/** Per-record OPTIONS the engine stores and the panel edits (§6.3). */
/** A declared `label` / `help` is a KEY the client renders with `t()` (a3
 *  i18n): scripts/i18n-extract.mjs collects i18nKey(…) literals, the
 *  dictionaries carry zh + ja. The marker is the identity. */
const i18nKey = (s) => s;
const OPTIONS = Object.freeze([
  // THE MAILBOX SCOPE (2026-09-26, the aggregated IM): INBOX by default; all
  // mail, chosen labels or a free search query per account. `query` stays
  // the advanced form (and what a pre-scope record carries).
  { key: 'scope', label: i18nKey('Mailbox'), default: 'inbox', choices: ['inbox', 'all', 'labels', 'query'],
    choiceLabels: { inbox: i18nKey('Inbox'), all: i18nKey('All mail (not spam or trash)'), labels: i18nKey('These labels'), query: i18nKey('A search query') },
    help: i18nKey('Which threads become conversations. Inbox is the default; "These labels" reads the label list below, "A search query" the query below.') },
  { key: 'labels', label: i18nKey('Labels'), default: '', placeholder: 'Work, Receipts', maxLength: 500, usedWhen: { scope: ['labels'] },
    help: i18nKey('Comma-separated Gmail label names — used when the mailbox is "These labels".') },
  { key: 'query', label: i18nKey('Include query'), default: 'label:INBOX', placeholder: 'label:INBOX', maxLength: 500, usedWhen: { scope: ['query'] },
    help: i18nKey('A Gmail search query; only threads matching it become conversations. Used when the mailbox is "A search query".') },
  // THE PUSH LANE'S TWO RESOURCE NAMES (decision 20). `relive:true`: a change
  // restarts the LANE (single-use), never the adapter — the mailbox cursor is
  // untouched.
  { key: 'pushTopic', label: i18nKey('Pub/Sub topic (push)'), default: '', placeholder: 'projects/<project>/topics/<topic>', maxLength: 300, relive: true,
    help: i18nKey('The Cloud Pub/Sub topic Gmail publishes mailbox changes to (users.watch). Grant gmail-api-push@system.gserviceaccount.com the Publisher role on it. Only read when push is enabled.') },
  { key: 'pushSubscription', label: i18nKey('Pub/Sub subscription (push)'), default: '', placeholder: 'projects/<project>/subscriptions/<name>', maxLength: 300, relive: true,
    help: i18nKey('THIS instance\'s own pull subscription of that topic — one per instance is what makes push exclusive here. Only read when push is enabled.') },
]);

/**
 * EVERY OUTBOUND CALL THIS ADAPTER MAKES OUTSIDE `api()` — THE GATE (lane R5
 * verify r4). Four rounds of the pace each found one more path around it, so
 * the set is CLOSED here: the census in test-channels-gmail-shape reads the
 * `// ungated: <id>` markers off the code (this file + src/channels/live/
 * gmail.js) and this list must name exactly those ids, each with the reason it
 * may stand outside the pace — and it must be a reason an agent or a loop
 * cannot multiply. A new outbound call with no marker, or a marker with no
 * row, is red.
 */
const UNGATED = Object.freeze([
  { id: 'token-refresh', why: 'oauth2.googleapis.com is not Gmail quota; ONE refresh in flight per adapter (`refreshing`), so N callers at one expiry are one POST' },
  { id: 'consent-exchange', why: 'the loopback consent flow: once per human consent, taken by the flow\'s one-time state' },
  { id: 'consent-profile', why: 'ONE profile read inside that same consent (who signed in); 1 unit, once' },
  { id: 'pubsub', why: 'src/channels/live/gmail.js: the push lane\'s Pub/Sub pull + acknowledge — a different API and quota; one pull in flight per lane, PULL_BACKOFF_MS on failure, the lane parked on a permanent refusal' },
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
  compose: true,                   // R4 (B-6acc): a NEW message — `messages.send` under the same gmail.send scope
  identityMarking: 'marked',
  identityMarkingWhere: 'raw-headers',
  identityMarkingText: 'Mail sent through the Gmail API carries a Received: header naming gmailapi.google.com — invisible in mail clients, visible in "Show original".',
  tosRisk: 'none',
  idempotency: 'two-phase',        // a draft (the durable handle) is created, then sent (§9.4)
  threading: 'reply-to',
  editSent: false,
  readReceipts: false,
  // 2026-09-26 (the aggregated IM): attachments FETCHED on demand
  // (`messages.get` → the part → `attachments.get`), no "older" paging (a
  // thread's first walk is the whole thread), and every request METERED in
  // Gmail's quota units against the account's budget (6000 units/min per
  // user is the vendor's cap; the default 3000 leaves the other half)
  attachments: 'fetch',
  olderHistory: 'none',
  budget: { unit: 'quota-unit', default: 3000, settingKey: 'channels.budgetGmailPerMin', metered: true },
  // lane R5 (2026-09-26, the owner: "gmail一直被限速 你可能要控制下gmail默认的读
  // 取速度"): the vendor refused whole passes that stayed under the minute's
  // budget but spent ~2 000–2 800 units in ~20 s (100–200 units/s) — it meters
  // finer than a minute. PACED PER SECOND (drain rule 18): 40 units/s = one
  // thread read a second (Google's per-user cap is 6 000/min = 100/s), every
  // request awaited on the account's bucket before it is sent. `cost` = what
  // the drain expects one action to charge: a thread read (threads.get 40), a
  // discovery page (threads.list 10 + up to META_PER_LIST metadata reads).
  pace: { unitsPerSec: 40, settingKey: 'channels.gmailUnitsPerSec', cost: { fetch: 40, discover: 10 + 40 * 10, scanHost: 1 } },
  vendorName: i18nKey('Google'),
});

/** THE QUOTA COST of one Gmail API call (units, the vendor's published table
 *  as read 2026-09-26: getProfile 1, history.list 2, threads.list 10,
 *  threads.get 40, messages.get 20, messages.list 5, attachments.get 20,
 *  drafts.create 10, drafts.send 100, messages.send 100 (R4 compose), drafts.get 20, drafts.list 5,
 *  drafts.delete 10, watch 100, labels.list 1). PURE. */
function unitsFor(pathq, method = 'GET') {
  const m = String(method || 'GET').toUpperCase();
  const pth = String(pathq || '').split('?')[0];
  if (pth === '/profile') return 1;
  if (pth === '/history') return 2;
  if (pth === '/threads') return 10;
  if (pth.startsWith('/threads/')) return 40;
  if (pth === '/messages/send') return 100;   // R4 (B-6acc): a composed NEW message (messages.send)
  if (/^\/messages\/[^/]+\/attachments\//.test(pth)) return 20;
  if (pth.startsWith('/messages/')) return 20;
  if (pth === '/messages') return 5;
  if (pth === '/drafts/send') return 100;
  if (pth === '/drafts') return m === 'POST' ? 10 : 5;
  if (pth.startsWith('/drafts/')) return m === 'DELETE' ? 10 : 20;
  if (pth === '/watch') return 100;
  if (pth === '/stop') return 50;
  if (pth.startsWith('/labels')) return 1;
  return 10;
}
/** The scope a record is REALLY read with: a custom query on a record whose
 *  scope is unset or the default (a pre-scope record, an API write) is the
 *  query scope — the panel and the Edit dialog read THIS, so the health line
 *  never says "Inbox" over a mailbox read by a query. */
function scopeOf(options) {
  const o = options || {};
  const q = String(o.query || '').trim();
  const custom = !!q && q !== 'label:INBOX';
  return !o.scope || o.scope === 'inbox' ? (custom ? 'query' : 'inbox') : o.scope;
}
/** The options as they are APPLIED (the engine's view calls this when an
 *  adapter declares it) — declared keys only, the scope made explicit. */
function effectiveOptions(options) {
  return { ...(options || {}), scope: scopeOf(options) };
}
/** The include query a record's options DESCRIBE (PURE): the mailbox scope
 *  first — `all` / `labels` / `query` as chosen; the DEFAULT scope (`inbox`,
 *  which every record carries once created) yields to a custom query, so a
 *  record from before the scope option (or an API caller that sets only
 *  `query`) keeps its own query. The dialog restores the query's default
 *  when the owner picks Inbox. */
function queryOf(options) {
  const o = options || {};
  const q = String(o.query || '').trim();
  const scope = scopeOf(o);
  if (scope === 'all') return 'in:anywhere -in:spam -in:trash';
  if (scope === 'labels') {
    const ls = String(o.labels || '').split(',').map((x) => x.trim()).filter(Boolean).map((x) => x.replace(/\s+/g, '-').replace(/["()]/g, ''));
    return ls.length ? (ls.length === 1 ? `label:${ls[0]}` : `{${ls.map((x) => `label:${x}`).join(' ')}}`) : 'label:INBOX';
  }
  if (scope === 'query') return q || 'label:INBOX';
  return 'label:INBOX';
}

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
    // 2026-09-26: an attachment's id is `part:<partId>` — short and stable
    // (a Gmail attachmentId runs past the record's 256-char bound, and it
    // is re-minted per fetch); `fetchAttachment` finds the part again. An
    // INLINE image with no filename (a `cid:` picture) is an attachment too.
    if (p.filename) {
      out.attachments.push({ id: p.partId != null && p.partId !== '' ? `part:${p.partId}` : String(body.attachmentId || p.filename), name: String(p.filename), bytes: Number.isFinite(Number(body.size)) ? Number(body.size) : null, mime: mime || null });
    } else if (mime.startsWith('image/') && (body.attachmentId || body.data) && p.partId != null && p.partId !== '') {
      out.attachments.push({ id: `part:${p.partId}`, name: 'image', bytes: Number.isFinite(Number(body.size)) ? Number(body.size) : null, mime });
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
function buildMime({ from = null, to, cc = null, subject = '', inReplyTo = null, references = null, messageId = null, text = '', extraHeaders = null } = {}) {
  const lines = [];
  if (from) lines.push(`From: ${encodeHeader(from)}`);
  lines.push(`To: ${encodeHeader(to)}`);
  if (cc) lines.push(`Cc: ${encodeHeader(cc)}`);
  lines.push(`Subject: ${encodeHeader(subject)}`);
  if (messageId) lines.push(`Message-ID: ${String(messageId).replace(/[\r\n]+/g, '')}`);
  // extra headers (R4 verify: `X-VibeSpace-Proposal`) — names and values
  // stripped of CR/LF so nothing can inject a second header
  for (const [k, v] of Object.entries(extraHeaders && typeof extraHeaders === 'object' ? extraHeaders : {})) if (/^X-[A-Za-z0-9-]+$/.test(k) && v != null) lines.push(`${k}: ${String(v).replace(/[\r\n]+/g, ' ').slice(0, 200)}`);
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
/** Google's RATE words (lane R5): a 403 whose reason is a rate/usage limit, or
 *  whose message names a quota metric ("Quota exceeded for quota metric 'Total
 *  Query Cost' and limit 'Units per minute per user'", the production refusal)
 *  is a RATE refusal, never `forbidden` — the engine's short back-off, not the
 *  failure ladder. `dailyLimitExceeded` stays rate-limited too (a retry every
 *  ≤ 60 s costs nothing and heals at the day's turn). */
const RATE_REASONS = Object.freeze(['rateLimitExceeded', 'userRateLimitExceeded', 'quotaExceeded', 'dailyLimitExceeded']);
const RATE_WORDS = /quota exceeded|rate limit|quota metric|too many requests/i;
function typedFailure(status, body, what, retryAfterSec = null) {
  const err = body && body.error;
  const msg = (err && (err.message || err.status)) || (body && (body.error_description || body.error)) || `HTTP ${status}`;
  const reason = err && Array.isArray(err.errors) && err.errors[0] && err.errors[0].reason;
  const domain = err && Array.isArray(err.errors) && err.errors[0] && err.errors[0].domain;
  if (status === 401 || body && body.error === 'invalid_grant') return new ChannelError('auth-expired', `${what}: ${msg} (${status})`, { retryable: false, detail: { status, reason: reason || (body && body.error) || null } });
  if (status === 429 || RATE_REASONS.includes(reason) || (status === 403 && (domain === 'usageLimits' || RATE_WORDS.test(String(msg))))) return new ChannelError('rate-limited', `${what}: ${msg} (${status})`, { retryable: true, detail: { status, reason: reason || null, retryAfterSec: Number.isFinite(retryAfterSec) ? retryAfterSec : null } });
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
  if (!r.ok) throw typedFailure(r.status, parsed, what, retryAfterSeconds(r.headers));   // lane R5: the vendor's own wait, when it says one
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
  const query = () => queryOf(record.options);
  const meter = typeof deps.meter === 'function' ? deps.meter : () => {};   // 2026-09-26: quota units per request SENT
  const pace = typeof deps.pace === 'function' ? deps.pace : async () => {};   // lane R5: awaited BEFORE every request (drain rule 18's bucket)
  /** The push switch and its two resource names, read LIVE from the record. */
  const pushEnabled = () => !!(record.push && record.push.enabled === true);
  const pushOptions = () => ({ topic: String((record.options && record.options.pushTopic) || '').trim(), subscription: String((record.options && record.options.pushSubscription) || '').trim() });
  /** The consent's scopes: the read scope always; the pubsub scope when the
   *  push switch is on at consent time (an existing token is untouched —
   *  scopes bind at consent, so enabling push asks for ONE re-authorize). */
  const scopesFor = () => (pushEnabled() ? [SCOPE, SCOPE_COMPOSE, PUBSUB_SCOPE] : [SCOPE, SCOPE_COMPOSE]);
  /** What the HELD token's scopes allow (P4 / R4 — the ONE table). */
  const heldVerbs = () => sendVerbsOf(((readToken().token || {}).scopes) || []);
  /** May a REPLY (drafts.create + drafts.send) be built with the held token? */
  const hasReplyScope = () => heldVerbs().reply;
  /** May a NEW message (messages.send) be built with the held token? */
  const hasComposeScope = () => heldVerbs().compose;

  // `walked` = the threads this PROCESS has fully read at least once since
  // the last (re)seed: a thread not in it is fetched whatever history.list
  // says (the first pass after a restart, or after a reseed), one in it is
  // fetched only when history.list names it.
  const mailbox = { historyId: null, at: 0, changed: new Set(), walked: new Set(), self: null, mustWalk: true };
  // THE CURSOR SURVIVES A RESTART (2026-09-26): the mailbox's `historyId` and
  // the threads it named but nobody fetched yet are persisted in the
  // account's `state` (plain JSON, the engine's serialized door). A restored
  // cursor means a thread with an anchor is NOT re-walked unless history.list
  // names it — the old in-memory cursor re-read every thread (40 units each)
  // on every restart. A reseed (no cursor, or a 404) walks everything once.
  const stateStore = deps.state && typeof deps.state.read === 'function' ? deps.state : null;
  try {
    const st0 = stateStore ? stateStore.read() : {};
    if (st0 && st0.gmailHistoryId) { mailbox.historyId = String(st0.gmailHistoryId); mailbox.mustWalk = false; for (const id of Array.isArray(st0.gmailChanged) ? st0.gmailChanged : []) mailbox.changed.add(String(id)); }
  } catch { /* an unreadable state is a fresh seed */ }
  let persistTimer = null, persisted = '';
  function persistCursor(soon = true) {
    if (!stateStore) return;
    const doIt = () => {
      persistTimer = null;
      const next = JSON.stringify([mailbox.historyId, [...mailbox.changed].slice(0, 2000)]);
      if (next === persisted) return;
      persisted = next;
      Promise.resolve(stateStore.write({ gmailHistoryId: mailbox.historyId, gmailChanged: [...mailbox.changed].slice(0, 2000) })).catch((e) => log.warn && log.warn(`[channels] gmail: the mailbox cursor could not be persisted: ${(e && e.message) || e}`));
    };
    if (!soon) { if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; } doIt(); return; }
    if (persistTimer) return;
    persistTimer = setTimeout(doIt, 5000);
    if (persistTimer.unref) persistTimer.unref();
  }
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
  let unsaved = null;   // verify r5: {token, supersedes} — a refreshed token the store could not persist, held until the store's next chance
  function readToken() {
    if (!tokens) return { token: null, why: 'no token store was handed to this adapter' };
    const t = tokens.read();
    if (!t || !t.token) { unsaved = null; return { token: null, why: (t && t.why) || 'never-authenticated' }; }
    // verify r5: a refreshed token the store could not persist stands in for the one it superseded (the vendor's
    // answer is the truth, the store a cache that lagged) — until the store holds anything else (cleared, re-authorized)
    if (unsaved) { if (String(t.token.refresh_token || '') === unsaved.supersedes) return { token: unsaved.token, why: null }; unsaved = null; }
    return { token: t.token, why: null };
  }
  /** A live access token, refreshed with the CLIENT the resolver answers.
   *  ONE REFRESH IN FLIGHT PER ADAPTER (lane R5 verify r4): N callers that find
   *  the token expired in the same instant share one POST and re-read the
   *  store after it — 20 concurrent thumbnails were 20 refresh POSTs, and
   *  under a vendor that ROTATES the refresh token every one after the first
   *  is `invalid_grant`, whose stamp then overwrote the sibling's fresh token
   *  with the stale one (the account logged itself out). */
  let refreshing = null;
  async function accessToken() {
    const cred = credential();
    if (!cred.values) throw new ChannelError('auth-expired', `Google OAuth client missing: ${cred.why}`, { retryable: false, detail: { needsCredentials: true } });
    const { token, why } = readToken();
    if (!token) throw new ChannelError('auth-expired', `Gmail is not connected (${why})`, { retryable: false });
    if (token.invalidGrantAt) throw new ChannelError('auth-expired', 'Gmail refresh token was refused — re-authorize', { retryable: false });
    if (unsaved && unsaved.token === token) await persistToken(token, unsaved.supersedes);   // verify r5: the store's next chance at a token it could not persist
    if (token.access_token && Number(token.expiresAt) > now() + REFRESH_MARGIN_MS) return token.access_token;
    if (!token.refresh_token) throw new ChannelError('auth-expired', 'Gmail access token expired and no refresh token is held — re-authorize', { retryable: false });
    if (refreshing) { await refreshing; return accessToken(); }   // a sibling's refresh: wait for it, then read what it wrote
    refreshing = refreshAccessToken(cred, token).finally(() => { refreshing = null; });
    const got = await refreshing;
    return got || accessToken();   // verify r5: a refresh SUPERSEDED while in flight (a re-authorize landed, a sibling entry's rotation won) wrote nothing — the store's token is the one to use
  }
  /** Persist a token the vendor answered (verify r5). A write the store refuses (a full disk) used to lose it — and
   *  under a ROTATING refresh token the old one is already retired at the vendor, so the next refresh was
   *  `invalid_grant` and the account logged itself out (measured on Lark: ONE failed write ⇒ needs-reauth). The
   *  token is kept in memory as the truth and written again at the next request; a restart before it lands loses it. */
  let persisting = null;   // {token, p}: ONE write in flight PER TOKEN — the waiters of a refresh each re-enter accessToken() and share it; a write of ANOTHER token queues behind it (verify r6: it used to be handed the earlier token's promise and DROPPED — under a rotating vendor the store then kept a retired token)
  /** `supersedes` = the refresh token this write replaces (what the refresh tried / what the unsaved token stood in for):
   *  the store lands the write only while it holds that token at apply time (the door's compare-and-swap, verify r6)
   *  and answers `{superseded:true}` otherwise — nothing of ours is then in memory either. */
  function persistToken(next, supersedes) {
    if (persisting && persisting.token === next) return persisting.p;
    const prev = persisting ? persisting.p.catch(() => {}) : Promise.resolve();
    const p = prev.then(async () => {
      const raw = tokens.read(); const storeRt = raw && raw.token ? String(raw.token.refresh_token || '') : '';
      const over = supersedes === undefined ? storeRt : String(supersedes || '');
      try {
        const w = await tokens.write(next, { expiresAt: null, scopes: next.scopes || [], user: next.email || null, supersedes: over });
        if (w && w.superseded) { if (unsaved && unsaved.token === next) unsaved = null; return { written: false, superseded: true }; }
        unsaved = null; return { written: true };
      } catch (e) {
        unsaved = { token: next, supersedes: over };
        log.warn && log.warn(`[channels] gmail: the refreshed token could not be persisted (${(e && e.message) || e}) — held in memory and written again at the next request`);
        return { written: false, failed: true };
      }
    }).finally(() => { if (persisting && persisting.p === p) persisting = null; });
    persisting = { token: next, p };
    return p;
  }
  async function refreshAccessToken(cred, token) {
    let d;
    try {
      d = await callJson(fetchFn, TOKEN_URL, { method: 'POST', what: 'gmail token refresh', form: { grant_type: 'refresh_token', client_id: cred.values.clientId, client_secret: cred.values.clientSecret, refresh_token: token.refresh_token } });   // ungated: token-refresh
    } catch (e) {
      // `invalid_grant` = the refresh token is dead (revoked, or a Testing
      // client's 7-day lifetime): stamped on the record so `auth.state()`
      // says `needs-reauth` instead of retrying a dead grant every pass —
      // ONLY while the stored token is still the one this refresh tried (a
      // newer one, written meanwhile, is never overwritten with a stale copy).
      if (e instanceof ChannelError && e.code === 'auth-expired' && tokens) {
        const cur = readToken().token;
        // verify r5: a refusal for a token the store has since REPLACED (a re-authorize, a sibling entry's rotation
        // that landed first) is superseded, not a fact about the account — the caller re-reads the store
        if (cur && !cur.invalidGrantAt && String(cur.refresh_token || '') !== String(token.refresh_token || '')) return null;
        if (cur && String(cur.refresh_token || '') === String(token.refresh_token || '')) await tokens.write({ ...cur, invalidGrantAt: now() }, { expiresAt: null, scopes: cur.scopes || [], user: cur.email || null, supersedes: String(cur.refresh_token || '') });
      }
      throw e;
    }
    const next = { ...token, access_token: String(d.access_token || ''), expiresAt: now() + Number(d.expires_in || 3600) * 1000, refresh_token: String(d.refresh_token || token.refresh_token) };
    // verify r5: the store is written ONLY while it still holds the token this refresh tried. A disconnect (cleared)
    // or a re-authorize (a different token) that landed while the POST was in flight is never overwritten by this
    // late write — measured before: 25 of 50 trials reverted a re-authorize to the old refresh token, a disconnected
    // account reconnected itself, a client-switch rebind ended with the OLD client's token on the record (⇒ the next
    // refresh `invalid_grant`, the owner's fresh consent undone). Superseded ⇒ the caller re-reads the store.
    const cur = readToken().token;
    if (!cur) throw new ChannelError('auth-expired', 'Gmail was disconnected while its token was refreshed — the refreshed token was discarded, the request was not sent', { retryable: false, detail: { tokenDropped: true } });
    if (String(cur.refresh_token || '') !== String(token.refresh_token || '')) return null;
    const w = await persistToken(next, String(token.refresh_token || ''));   // verify r6: the door's compare-and-swap — superseded at apply time ⇒ nothing written, the caller re-reads
    if (w && w.superseded) return null;
    return next.access_token;
  }
  /** THE BEARER AS IT IS NOW (lane R5 verify r4): the store, re-read
   *  synchronously AFTER the pace wait. A disconnect that landed meanwhile
   *  refuses the request by name (it was captured before the wait and would
   *  have gone out with a token the owner had dropped); a re-authorize's or a
   *  sibling's refresh's newer token is the one sent, never the captured one. */
  function bearerNow(at) {
    const t = readToken().token;
    if (!t || !t.access_token) throw new ChannelError('auth-expired', 'Gmail was disconnected while the request waited for its pace — the request was not sent', { retryable: false, detail: { tokenDropped: true } });
    return t.access_token !== at && Number(t.expiresAt) > now() ? t.access_token : at;
  }
  /** Is the token the store holds NOW past its expiry (verify r5)? A queue longer than the token's remaining life
   *  (34 of 50 thumbnails at 5 units/s went out expired, 401) is refreshed ONCE (single-flight) before the send. */
  const bearerExpired = () => { const t = readToken().token; return !!(t && t.access_token) && !(Number(t.expiresAt) > now()); };
  // THE GATE: every Gmail request goes token → pace → meter → send, with the
  // bearer re-read after the wait. The census in test-channels-gmail-shape
  // reads this file: an outbound call outside it carries `// ungated: <id>`
  // and `UNGATED` names the id with its reason, or the suite is red.
  const api = async (pathq, opts = {}) => {
    let at = await accessToken();
    const units = unitsFor(pathq, opts.method);
    await pace(units);   // lane R5: the per-SECOND shape — the bucket holds this request's cost (or is full) before it goes
    meter(units);        // …charged the moment it is sent, no await in between
    if (bearerExpired()) at = await accessToken();   // verify r5: the bearer EXPIRED while the request waited — one refresh before the send, never an expired bearer on the wire
    return callJson(fetchFn, `${API}${pathq}`, { ...opts, headers: { Authorization: `Bearer ${bearerNow(at)}`, ...(opts.headers || {}) } });
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
      mailbox.mustWalk = true;
      persistCursor(false);
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
      if (mailbox.changed.size > CHANGED_CAP) { mailbox.changed.clear(); mailbox.walked.clear(); mailbox.mustWalk = true; }
      persistCursor(false);
    } catch (e) {
      if (e instanceof ChannelError && e.code === 'not-found') {
        // The stored historyId is too old for the vendor: reseed from the
        // profile and walk everything once (gmail-sync's own rule).
        log.warn && log.warn(`[channels] gmail: history cursor ${mailbox.historyId} expired — reseeding, every tracked thread is walked once`);
        const p = await api('/profile', { what: 'gmail profile' });
        mailbox.historyId = String(p.historyId || '');
        mailbox.changed.clear();
        mailbox.walked.clear();
        mailbox.mustWalk = true;
        persistCursor(false);
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
    // the FULL thread already names its subject and senders — the title cache
    // is filled for free (a metadata read is 40 more units)
    try {
      const msgs = Array.isArray(t.messages) ? t.messages : [];
      if (msgs.length) {
        const first = msgs[0] || {};
        const names = [...new Set(msgs.map((m) => parseAddress(header(m.payload && m.payload.headers, 'From')).name).filter(Boolean))];
        meta.set(convId, { title: header(first.payload && first.payload.headers, 'Subject') || '(no subject)', participants: names.join(', '), lastAt: msgs.reduce((a, m) => Math.max(a, Number(m.internalDate) || 0), 0) || null, at: now() });
      }
    } catch { /* a title is a nicety */ }
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
          exchange: async ({ code, redirectUri, cancelled = null }) => {
            const d = await callJson(fetchFn, TOKEN_URL, { method: 'POST', what: 'gmail token exchange', form: { code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' } });   // ungated: consent-exchange
            if (!d.refresh_token) throw new ChannelError('vendor-error', 'no refresh_token returned — remove the app from myaccount.google.com/permissions and retry', { retryable: false });
            const tok = { access_token: String(d.access_token || ''), expiresAt: now() + Number(d.expires_in || 3600) * 1000, refresh_token: String(d.refresh_token), scopes: String(d.scope || SCOPE).split(/\s+/).filter(Boolean), email: null, clusterKey: cred.clusterKey || null };
            // verify r6: A CONSENT MUST NAME ITS ACCOUNT — a token the profile read could not name bound nothing (the
            // record then took anyone's next consent) and, on a bound record, landed unjudged; refused, nothing stored
            try {
              const me = await callJson(fetchFn, `${API}/profile`, { what: 'gmail profile', headers: { Authorization: `Bearer ${tok.access_token}` } });   // ungated: consent-profile
              tok.email = looksLikeEmail(me.emailAddress) ? String(me.emailAddress).trim().toLowerCase() : null;   // verify r7: whitespace / a bare word is NOBODY
              mailbox.self = tok.email;
            } catch (e) { throw new ChannelError('vendor-error', namelessSentence('Google', `profile: ${(e && e.message) || e}`), { retryable: false, detail: { nameless: true } }); }
            if (!tok.email) throw new ChannelError('vendor-error', namelessSentence('Google', 'the profile carried no email address'), { retryable: false, detail: { nameless: true } });
            // verify r7: `consent.cancelled` — the door refuses, INSIDE its serialized write, a consent whose flow was
            // cancelled meanwhile (a disconnect / cancel / newer sign-in used to be undone by this write landing late)
            if (tokens) await tokens.write(tok, { expiresAt: null, scopes: tok.scopes, user: tok.email, consent: { cancelled } });
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
     *  sending is offered ONLY while the held token carries a scope that
     *  covers drafts + sending (`gmail.compose`; P4 / R4 verify), else `[]`
     *  with `send-scope-not-granted` — a `gmail.send`-only token cannot
     *  create the draft a reply rides. */
    async convCaps(convId) {
      try {
        await metaFor(convId);
        const send = hasReplyScope();
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
      if (!hasReplyScope()) throw new ChannelError('forbidden', 'gmail: the held token carries no scope covering drafts + sending (gmail.compose) — reconnect to request it', { retryable: false, detail: { why: 'send-scope-not-granted', held: heldVerbs() } });
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

    /** THE ACCOUNT's send identity for a NEW message (R4, B-6acc): the held
     *  token carries a scope covering `messages.send` (gmail.compose, or the
     *  legacy gmail.send) or it does not — no vendor call. */
    async composeCaps() {
      const send = hasComposeScope();
      return { sendAs: send ? ['user'] : [], why: send ? null : 'send-scope-not-granted', at: now() };
    },
    /**
     * COMPOSE A NEW MESSAGE (R4, B-6acc — the owner: "给我一个agent使用我的
     * gmail 的能力，让它能读取和发送邮件"). ONE request: `messages.send`
     * with a fresh RFC-822 message (no threadId — Gmail starts a thread),
     * under `gmail.compose` (the consent's scope) or a legacy `gmail.send`.
     * The message carries its own `Message-ID` built from the idempotency
     * key AND an `X-VibeSpace-Proposal: <idemKey>` header — the durable
     * handle handed to `onHandle` BEFORE the request. When the answer is
     * lost, `reconcile` looks for the Message-ID in the SENT mail
     * (`rfc822msgid:`) and, should Gmail have rewritten it, for the proposal
     * header among the SENT messages to the first recipient since the
     * attempt (R4 verify: the idempotency never depends on the Message-ID
     * surviving). A transport failure after the request left is `detail.lost`.
     */
    async compose({ to = [], cc = [], subject = '', text, idemKey, as = 'user', onHandle = null } = {}) {
      if (as !== 'user') throw new ChannelError('send-not-available', `gmail: sending as '${as}' is not declared (caps.sendAs: user)`, { retryable: false, detail: { sendAs: caps.sendAs } });
      if (!hasComposeScope()) throw new ChannelError('forbidden', 'gmail: the held token carries no scope covering sending (gmail.compose) — reconnect to request it', { retryable: false, detail: { why: 'send-scope-not-granted', held: heldVerbs() } });
      const self = selfEmail();
      const domain = (String(self || '').split('@')[1] || 'localhost').replace(/[^A-Za-z0-9.-]/g, '') || 'localhost';
      const messageId = `<${String(idemKey || '').replace(/[^A-Za-z0-9._-]/g, '') || 'msg'}.${Buffer.from(String(idemKey || '') + String(subject)).toString('hex').slice(0, 12)}@${domain}>`;
      const toList = (Array.isArray(to) ? to : [to]).filter(Boolean);
      const ccList = (Array.isArray(cc) ? cc : [cc]).filter(Boolean);
      if (!toList.length) throw new ChannelError('vendor-error', 'gmail: a new message needs at least one recipient', { retryable: false });
      const proposalHeader = String(idemKey || '').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 120) || null;
      const raw = Buffer.from(buildMime({ from: self, to: toList.join(', '), cc: ccList.length ? ccList.join(', ') : null, subject, messageId, text, extraHeaders: proposalHeader ? { [PROPOSAL_HEADER]: proposalHeader } : null }), 'utf-8').toString('base64url');
      const handle = { messageIdHeader: messageId, proposalHeader, to: toList[0], at: now(), compose: true };
      if (typeof onHandle === 'function') await onHandle(handle);
      let s2;
      try { s2 = await api('/messages/send', { method: 'POST', what: 'gmail send (new message)', json: { raw } }); }
      catch (e) {
        if (e instanceof ChannelError && e.code === 'transport') throw new ChannelError('transport', `${e.message} — the send request left and the answer was lost`, { retryable: true, detail: { ...(e.detail || {}), lost: true, phase: 'send', handle } });
        throw e;
      }
      return { ok: true, vendorMessageId: String((s2 && s2.id) || ''), threadId: (s2 && s2.threadId) ? String(s2.threadId) : null, at: now(), sentAs: 'user', handle };
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
    async reconcile(convId, { idemKey, sentAt = null, handle = null, text = null, compose = null } = {}) {
      const since = (Number(sentAt) || now()) - 60e3;
      // R4 (B-6acc): a COMPOSED message has no thread to look in — its own
      // Message-ID (the handle) is searched in the SENT mail; found ⇒ landed,
      // not found ⇒ honestly unknown (Gmail search lags; absence is no proof)
      if (compose) {
        const mid = handle && handle.messageIdHeader ? String(handle.messageIdHeader) : null;
        const ph = handle && handle.proposalHeader ? String(handle.proposalHeader) : (String(idemKey || '').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 120) || null);
        const firstTo = (handle && handle.to) || (compose && Array.isArray(compose.to) ? compose.to[0] : null) || null;
        if (!mid && !(ph && firstTo)) return { unknown: true, reason: 'the composed message has no recorded Message-ID or proposal header to look for', detail: { how: 'no-handle' } };
        try {
          // ① our Message-ID in the sent mail (Gmail kept it)
          if (mid) {
            const l = await api(`/messages?${new URLSearchParams({ q: `in:sent rfc822msgid:${mid.replace(/^<|>$/g, '')}`, maxResults: '5' })}`, { what: 'gmail sent search (reconcile)' });
            const m = (l.messages || [])[0];
            if (m && m.id) return { landed: true, vendorMessageId: String(m.id), at: null, detail: { how: 'message-id-in-sent', threadId: m.threadId ? String(m.threadId) : null } };
          }
          // ② the proposal header among the SENT messages to the first
          // recipient since the attempt (bounded: the 10 newest), read one
          // metadata header each — identity by witness, never by position
          if (ph && firstTo) {
            const after = Math.max(0, Math.floor(since / 1000));
            const l2 = await api(`/messages?${new URLSearchParams({ q: `in:sent to:${firstTo} after:${after}`, maxResults: '10' })}`, { what: 'gmail sent search (reconcile, by recipient)' });
            for (const m of (l2.messages || []).slice(0, 10)) {
              if (!m || !m.id) continue;
              const g = await api(`/messages/${encodeURIComponent(String(m.id))}?format=metadata&metadataHeaders=${PROPOSAL_HEADER}`, { what: 'gmail message headers (reconcile)' });
              if (header(g.payload && g.payload.headers, PROPOSAL_HEADER) === ph) return { landed: true, vendorMessageId: String(m.id), at: Number(g.internalDate) || null, detail: { how: 'proposal-header-in-sent', threadId: g.threadId ? String(g.threadId) : (m.threadId ? String(m.threadId) : null) } };
            }
          }
          return { unknown: true, reason: 'no sent message carries this Message-ID or proposal header yet (search can lag — check the Sent folder)', detail: { how: 'not-found-in-sent' } };
        } catch (e) { return { unknown: true, reason: `the sent mail could not be searched: ${(e && e.message) || e}`, detail: { how: 'search-failed' } }; }
      }
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
      // the OTHER threads the mailbox names (a HINT: the engine makes them due
      // now, so new mail in a cold thread does not wait for its own cadence)
      const hint = () => [...mb.changed].filter((id) => id !== convId).slice(0, 500);
      if (anchor && !mb.changed.has(convId) && !threads.has(convId) && (mb.walked.has(convId) || !mb.mustWalk)) {
        return { records: [], anchor, reachedAnchor: true, complete: true, changed: hint() };
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
      if (drained) { if (mailbox.changed.delete(convId)) persistCursor(); mailbox.walked.add(convId); threads.delete(convId); }
      const self = selfEmail();
      return {
        records: page.map((m) => toRecord(adapterId, convId, m, { selfEmail: self })),
        anchor: page.length ? String(page[page.length - 1].id) : (anchor || (msgs.length ? String(msgs[msgs.length - 1].id) : null)),
        reachedAnchor: drained,
        complete: drained,
        changed: hint(),
      };
    },

    /**
     * ONE ATTACHMENT's bytes (2026-09-26): the record names the part
     * (`part:<partId>`), so the message is read once (`messages.get`, 20
     * units) and the part's inline data used, or its `attachmentId` fetched
     * (`attachments.get`, 20 more). A legacy id that IS an attachmentId is
     * fetched directly. Bounded at 100 MB.
     */
    async fetchAttachment(convId, { messageId, attachmentId, mime = null, name = null } = {}) {
      if (!messageId || !attachmentId) throw new ChannelError('not-found', 'gmail: an attachment needs its message id and part', { retryable: false });
      const id = String(attachmentId);
      let data = null, partMime = mime, partName = name;
      const fetchById = async (aid) => {
        const d = await api(`/messages/${encodeURIComponent(String(messageId))}/attachments/${encodeURIComponent(aid)}`, { what: 'gmail attachment' });
        return d && d.data ? Buffer.from(String(d.data).replace(/-/g, '+').replace(/_/g, '/'), 'base64') : Buffer.alloc(0);
      };
      if (id.startsWith('part:')) {
        const partId = id.slice(5);
        const m = await api(`/messages/${encodeURIComponent(String(messageId))}?format=full`, { what: 'gmail message' });
        let part = null;
        const visit = (p) => { if (!p || part) return; if (String(p.partId) === partId) { part = p; return; } for (const c of p.parts || []) visit(c); };
        visit(m && m.payload);
        if (!part) throw new ChannelError('not-found', `gmail: message ${messageId} has no part ${partId}`, { retryable: false });
        partMime = String(part.mimeType || partMime || '') || null;
        partName = part.filename || partName;
        const body = part.body || {};
        if (body.data) data = Buffer.from(String(body.data).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
        else if (body.attachmentId) data = await fetchById(String(body.attachmentId));
        else data = Buffer.alloc(0);
      } else data = await fetchById(id);
      if (data.length > 100 * 1024 * 1024) throw new ChannelError('too-large', `gmail attachment: ${data.length} bytes is over the 100 MB bound`, { retryable: false });
      return { data, mime: partMime || null, name: partName || null };
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
  kind: KIND, caps, create, adapter, label: LABEL, integration: INTEGRATION, integrationTest, OPTIONS, UNGATED,
  EGRESS, SCOPE, SCOPE_SEND, SCOPE_COMPOSE, SCOPE_MODIFY, SCOPE_MAIL, sendVerbsOf, PROPOSAL_HEADER, PUBSUB_SCOPE, TOKEN_URL, AUTH_URL, API, MAILBOX_MEMO_MS, THREAD_MEMO_MS, META_PER_LIST, unitsFor, queryOf, scopeOf, effectiveOptions,
  toRecord, walkParts, parseAddress, stripHtml, typedFailure, buildMime, replyHeaders, encodeHeader,
};
