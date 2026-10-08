'use strict';
/**
 * THE ADAPTER REGISTRY AND ITS CONTRACT
 * (docs/design-communication-panel.zh.md §4, §2's first placement rule).
 *
 * ORCH tier. An adapter owns exactly three things — vendor auth, vendor
 * paging, and the vendor's message shape. IT NEVER TOUCHES the store, the
 * ACL, the policy or the spend guard, and **a capability it did not declare is
 * a capability the product does not offer for it**. That is the same
 * discipline `src/backend-caps.js` enforces for harnesses: GATE ON THE
 * CAPABILITY ROW, NEVER ON AN ADAPTER ID — with a grep census (in
 * scripts/test-channel-adapter-contract.mjs) asserting no call site outside
 * this directory branches on `kind`.
 *
 * THE CONTRACT THIS MODULE ENFORCES AT REGISTRATION AND AT CALL TIME:
 *
 *  · A DECLARED capability must be implemented, and an UNDECLARED one must
 *    THROW rather than half-work. "Degrading gracefully" is how this
 *    repository has hidden its own bugs over and over.
 *  · Every failure is a TYPED `{ code, retryable }` from a CLOSED set. A bare
 *    `throw` out of an adapter is a contract violation, so `wrap()` converts
 *    one into a typed `vendor-error` AND records it, rather than letting a
 *    stack trace become the product's error handling.
 *  · `history()` never returns records the caller did not ask for, reports
 *    `reachedAnchor` honestly, and ADVANCES NOTHING — the cursor belongs to
 *    the store (design §5 invariant 4).
 *  · `convCaps()` IS NEVER WIDER THAN `caps`. The direction is load-bearing:
 *    the static declaration is an UPPER BOUND and the per-conversation
 *    resolution may only narrow, so "we have never verified sending on this
 *    platform" can never be undone by one optimistic per-conversation answer.
 *  · ON A `sendAs: []` ADAPTER, `send()` IS NOT A FAILURE — IT DOES NOT EXIST.
 *    It answers the typed `send-not-available` with the reason `caps` itself
 *    gives, and the outbox creates NO proposal, because a proposal that can
 *    never be sent asks a user to approve something guaranteed to fail.
 */

/** The CLOSED failure set. A code outside it is itself a contract violation. */
// the reply PLACEMENT vocabulary (2026-09-28) — ONE spelling, the PURE outbox policy's (the verdict lives there)
const { PLACEMENTS, ROOT_REPLIES, isThreadPlacement, placementsOf, POLICY_MODES } = require('../channel-policy.js');
const IntegrationRegistry = require('../integration-registry.js');   // lane dc-channels-manifest: a vendor's `integration` must name a row
const ChannelSettings = require('../channel-settings.js');   // B-df40 part 3: the declared per-vendor rows a caps settingKey must name

const CHANNEL_ERROR_CODES = Object.freeze([
  'auth-expired',
  'rate-limited',
  'not-found',
  'forbidden',
  'transport',
  'vendor-error',
  'too-large',
  'send-not-available',   // §4: not a failure — a capability that does not exist here
  'not-supported',        // an UNDECLARED capability was called
]);

class ChannelError extends Error {
  constructor(code, message, { retryable = false, detail = null } = {}) {
    super(message || code);
    this.name = 'ChannelError';
    this.code = CHANNEL_ERROR_CODES.includes(code) ? code : 'vendor-error';
    this.retryable = !!retryable;
    this.detail = detail;
    if (this.code !== code) this.detail = { ...(detail || {}), undeclaredCode: code };
  }
  toJSON() { return { ok: false, code: this.code, retryable: this.retryable, detail: this.detail }; }
}

/**
 * WHAT WE SENT NEVER COMES BACK IN OUR WORDS (client-from-mount verify r4,
 * credential class). An adapter words a vendor refusal from the vendor's own
 * body (`typedFailure`), and that sentence travels far: the account's
 * `lastAuthError` / `lastPass` (written to adapters.json in the clear and
 * BROADCAST to every client in the digest), the For-you item's "Vendor said:",
 * the log. A vendor — or a gateway in front of it — that echoes the request
 * in its error ("the secret … was rejected") therefore published the client
 * secret the request carried; for an account that borrowed a storage mount's
 * client, the mount's. Google and Lark do not echo today; nothing here may
 * depend on that. So the adapters' ONE round-trip function scrubs the
 * vendor's body (and a transport error's text) of the EXACT VALUES the
 * request carried in its secret-bearing fields, BEFORE the typed error is
 * built (its message, its detail and its stack are born clean). By value,
 * never by pattern: the vendor's own words are left as they are.
 *   sentSecrets({fields, headers}) → [{name, value}] — `fields` = the form /
 *     JSON body the request sends; the Bearer of `headers.Authorization`.
 *   withoutSent(value, sent) → a scrubbed COPY of a string / JSON value.
 * verify r5: a value is withheld in EVERY spelling it left in — plain, as
 * `encodeURIComponent` spells it AND as the form body actually carried it
 * (`URLSearchParams` percent-encodes `!'()~` and writes a space as `+`, where
 * encodeURIComponent leaves them; a gateway echoing the raw body echoes that
 * form) — and the Bearer is read WITHOUT a regex: V8 keeps the subject of the
 * last regex match in the legacy `RegExp.input` / `lastMatch` statics (the
 * heap's regexp_last_match_info) until the next match anywhere, so a regex
 * over the Authorization header parked the live bearer there after every call.
 */
const SENT_SECRET_FIELDS = Object.freeze(['client_secret', 'app_secret', 'refresh_token']);
const SENT_SECRET_MIN = 6;   // a shorter value would rewrite ordinary words
function sentSecrets({ fields = null, headers = null } = {}) {
  const out = [];
  const f = fields && typeof fields === 'object' ? fields : {};
  for (const k of SENT_SECRET_FIELDS) { const v = f[k]; if (typeof v === 'string' && v.length >= SENT_SECRET_MIN) out.push({ name: k, value: v }); }
  const a = headers && typeof headers === 'object' ? (headers.Authorization || headers.authorization) : null;
  const bearer = bearerOf(a);   // verify r5: no regex — a regex would park the header in RegExp.input until the next match
  if (bearer && bearer.length >= SENT_SECRET_MIN) out.push({ name: 'access_token', value: bearer });
  return out;
}
/** The token of a `Bearer <token>` header (the scheme case-insensitive, the token a single run of non-blank
 *  characters), read by slicing: never a regex over a string that holds a live credential. null = not a Bearer. */
function bearerOf(a) {
  if (typeof a !== 'string' || a.length < 8 || a.slice(0, 7).toLowerCase() !== 'bearer ') return null;
  const v = a.slice(7).trim();
  if (!v) return null;
  for (let i = 0; i < v.length; i++) { const c = v.charCodeAt(i); if (c === 32 || c === 9 || c === 10 || c === 13 || c === 11 || c === 12) return null; }
  return v;
}
/** Every spelling a sent value can come back in: plain, encodeURIComponent's, and the form body's own (URLSearchParams). */
const spellingsOf = (value) => new Set([value, encodeURIComponent(value), new URLSearchParams([['v', value]]).toString().slice(2)]);
function withoutSent(value, sent) {
  if (!Array.isArray(sent) || !sent.length) return value;
  const scrub = (str) => {
    let o = str;
    for (const x of sent) {
      for (const v of spellingsOf(x.value)) if (o.includes(v)) o = o.split(v).join(`[${x.name} withheld]`);
    }
    return o;
  };
  const walk = (v, depth) => {
    if (typeof v === 'string') return scrub(v);
    if (!v || typeof v !== 'object' || depth > 6) return v;
    if (Array.isArray(v)) return v.map((x) => walk(x, depth + 1));
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, depth + 1)]));
  };
  return walk(value, 0);
}

const Feed = require('../channel-feed.js');   // PURE (lane lark-search-poll): the change feed's hit shape + its bounds
// PURE: THE ONE door for a NAME (verify r2 — `peerName` moved to channel-record, where every name of every shape takes it;
// a described single chat's name, which has no constructor of its own, takes it here — verify r1 #2)
const { peerName, FACT_KIND_NAMES, validateFacts } = require('../channel-record.js');   // + lane message-facts: the closed fact kinds, the one validator
const SR = require('../channel-search.js');   // design 010: the search row's enums + THE snippet bound (PURE)
const RECEIVE_MODES = Object.freeze(['push', 'poll', 'scan']);
const SCAN_SOURCES = Object.freeze(['store', 'ui']);
const HISTORY_MODES = Object.freeze(['page', 'since', 'none']);
const SEND_IDENTITIES = Object.freeze(['user', 'bot']);
const IDENTITY_MARKING = Object.freeze(['none', 'marked', 'unknown']);
const TOS_RISK = Object.freeze(['none', 'stated', 'prohibited']);
/** 2026-09-26: how an adapter pages BACK past the local log (`older()`), and
 *  the unit its per-account budget is counted in (`caps.budget.unit`). */
const OLDER_HISTORY = Object.freeze(['page', 'none']);
const BUDGET_UNITS = Object.freeze(['request', 'quota-unit']);
/** design 012 (Slack S1): what happens to the LOCAL copy when the account is removed — `keep` (the default: the logs
 *  stay on disk, archive-never-destroy) or `purge-on-remove` (the vendor's terms ask the copy to go with the app —
 *  Slack's Developer Policy). The engine's `removeRecord` reads it; the remove dialog says it. */
const RETENTION_MODES = Object.freeze(['keep', 'purge-on-remove']);
/** design 012 D20: the audience kinds `convCaps` may say (a DM, a private conversation, the whole workspace, a
 *  conversation shared with another organization). CLOSED. */
const AUDIENCE_KINDS = Object.freeze(['dm', 'private', 'public', 'external']);
/** Lane R5: the drain actions a `caps.pace.cost` may price (drain rule 18). */
const PACE_COSTS = Object.freeze(['fetch', 'discover', 'scanHost', 'feed']);
/**
 * THE CHANGE FEED (lane lark-search-poll, B-5aab, 2026-09-28 — design §27): a SECOND declaration on the arrival axis,
 * beside (never instead of) `receive` — ONE account-wide "what changed" read that names the conversations holding new
 * messages (Lark's empty-query message search). Declared per ADAPTER; nothing downstream names the vendor:
 *   changeFeed { via: 'search' | 'history' (FEED_VIA; 'history' = authority 'authoritative' — lane channel-feed-authority), scope: the HELD scope that turns it on (null = none needed),
 *                option: the account option that switches it off (null = none), pageSize, pagesPerPass, perMin (pages
 *                per sliding minute), maxWindowSec, catchUp: {chatType, pagesMax} | null, describes: bool,
 *                timeUnit: 'ms' | 's' | 'iso' (THE ONE declared form a hit's instant is read in — never guessed),
 *                reader?: the hit reader's revision (lane lark-p2p — a bump restarts a feed row the old reader wrote) }
 * `changes(opts)` answers ONE page: `{hits, more, pageToken, total, malformed, malformedFields}` — a hit is a MARK
 * (`malformedFields` = ≤ 3 lists of the field NAMES the adapter could not read — never a value; the card says them)
 * (`Feed.HIT_FIELDS`), never words: this wrapper refuses a page larger than `pageSize` and STRIPS every field outside
 * the closed list (a snippet reaching the engine is a contract violation it names: `stripped`). `describe(convId,
 * {peerIds})` names a conversation the feed found (a title, a kind) — declared by `describes: true`.
 */
// lane lark-threads (A4): `messageById(convId, {messageId})` — a feed hit the chat read did not find, read by its id (a
// thread reply the chat listing never shows) — declared by a change feed on an adapter whose thread replies are listed
// separately (the two facts that make such a hit exist); → {kind (closed set), record|null, rootPatch|null, threadKey|null}
const FEED_METHODS = Object.freeze(['changes', 'describe', 'messageById']);
/**
 * THE VENDOR'S OWN SEARCH (design 010, B-c9be, lane channels-full-search): a third row on the reading axis, beside the
 * change feed (which asks the same endpoint with no words). Declared per ADAPTER; the engine never names the vendor:
 *   search { via: 'query' (SR.SEARCH_VIA), pageSize, pagesPerPress, perMin (pages per sliding minute, the endpoint's
 *            share beside the feed's), cost (budget units a page costs), snippet: bool (a hit carries the vendor's
 *            snippet), context: 'around' | 'thread' | null (how a hit is read in context), match: 'substring' |
 *            'tokens' | 'unknown' (VS3 — only a measured `substring` lets the words say "found"), scope?: the HELD
 *            scope that turns it on }
 * `search({query, pageToken, storedAt, shows})` → ONE page `{hits: [{convId, vendorId, at, fromId, threadKey, snippet}],
 * next}` (`storedAt(convId, vendorId)` / `shows(convId)` = the engine's HINTS for an adapter that reads a hit's details
 * one request at a time — lane channels-followups, Gmail: a held or unshown hit costs no read) — this wrapper bounds it (≤ pageSize hits, the closed field list, every id bounded, the snippet through the name door);
 * `around(convId, {vendorId, at})` → `{records}` (≤ SR.AROUND_MAX, of that conversation only) — declared by
 * `context: 'around' | 'thread'`. An adapter without the row is local-only: both methods answer `not-supported`.
 */
const SEARCH_METHODS = Object.freeze(['search', 'around']);
const searchRowOf = (c) => (c && c.search && typeof c.search === 'object' ? c.search : null);
const SEARCH_HIT_FIELDS = Object.freeze(['convId', 'vendorId', 'at', 'fromId', 'threadKey', 'snippet']);
const PAGE_TOKEN_MAX = 2048;
const TITLE_MAX = 200;
/** §25 (2026-09-27): how a record is DRAWN — `text` (the default: the window's
 *  generic rung over `text`) or `blocks` (the adapter writes the typed render
 *  tree at ingest AND the module exports `blocksOf(record)`, the rung for a
 *  record stored before that); and what a conversation's TITLE is — a `name`
 *  (a chat) or a mail `subject` (shown through `cleanSubject`). */
const RENDER_MODES = Object.freeze(['text', 'blocks']);
const TITLE_FORMS = Object.freeze(['name', 'subject']);
/** lane dc-channels-blocks (C7): the library glyph a touch row of this adapter wears — closed; absent = `chat`. */
const GLYPHS = Object.freeze(['chat', 'mail', 'robot']);
/**
 * THREADS + REACTIONS (lane channel-threads, 2026-09-28): two UPPER-BOUND rows
 * a module may declare (absent = none — a flat, reaction-less channel):
 *   threads   {read: vendor|chain|none, replyInto: bool, listing: separate|inline|none,
 *              placements?: [chat|quote|thread|thread+chat], rootReply?: quote|thread}
 *             placements (2026-09-28, the owner's "the boolean is Lark-shaped")
 *             = where a reply may LAND: `chat` a plain message, `quote` an answer
 *             shown in the main list, `thread` inside the answered message's
 *             thread, `thread+chat` in the thread AND echoed to the channel
 *             (Slack's reply_broadcast); `rootReply` = the vendor's norm for a
 *             reply to a message outside any thread (Lark quote, Slack thread,
 *             Telegram quote). `send(convId, {text, replyTo, placement, …})`
 *             only ever receives a placement the row declares (the wrapped send
 *             refuses any other `not-supported`); a thread placement also
 *             carries `inThread: true`, the alias older modules read. A row with
 *             no `placements` reads as the pre-enum contract (chat, quote, and
 *             thread where `replyInto`) — every shipped adapter declares it
 *             (scripts/test-channel-placement.mjs's census).
 *             vendor = the vendor has a THREAD object + a way to list its
 *             replies (Lark thread listing, Slack conversations.replies);
 *             chain = only reply links, folded locally (Telegram);
 *             separate = replies are NOT in the conversation listing and need a
 *             per-thread call (`threadHistory(convId, key, {anchor, limit,
 *             initialMax?, stopAt?})` — `stopAt` = the engine's persisted stop of
 *             a walk that was cut mid-way: a FRESH walk stops there, the
 *             adapter's own continuation of a walk wins); inline = they ride it.
 *   reactions {read: list|inline|events|none, add: bool, remove: own|none,
 *              vocabulary: names|unicode|both, custom: image|none,
 *              perMessageMax: number|null}
 *             list = a per-message vendor call (`reactions`); inline = they ride
 *             the message listing; events = only live updates from now on.
 * A control exists only where the row says so — the window, the routes and the
 * agent verbs ask `offers()` (src/channel-caps.js), never an adapter id.
 */
const THREAD_READ = Object.freeze(['vendor', 'chain', 'none']);
const THREAD_LISTING = Object.freeze(['separate', 'inline', 'none']);
const REACTION_READ = Object.freeze(['list', 'inline', 'events', 'none']);
const REACTION_REMOVE = Object.freeze(['own', 'none']);
const REACTION_VOCABULARY = Object.freeze(['names', 'unicode', 'both']);
const REACTION_CUSTOM = Object.freeze(['image', 'none']);
/** A missing row reads as the flat, reaction-less declaration (fail closed: an unknown row is none). */
const NO_THREADS = Object.freeze({ read: 'none', replyInto: false, listing: 'none' });
const NO_REACTIONS = Object.freeze({ read: 'none', add: false, remove: 'none', vocabulary: 'names', custom: 'none', perMessageMax: null });
const threadsOf = (c) => (c && c.threads && typeof c.threads === 'object' ? c.threads : NO_THREADS);
const reactionsOf = (c) => (c && c.reactions && typeof c.reactions === 'object' ? c.reactions : NO_REACTIONS);
/** The six methods the two rows declare (spec §2.1) — checked when an adapter is INSTANTIATED (its methods live
 *  on the instance): a declared one missing, or one present without its declaration, is refused by name. */
// lane lark-threads (A2): + `recentRoots(convId, {limit})` — the chat's newest page with NO anchor stop (the recent-roots
// recheck: a stored root re-listed WITH its new thread id) — declared by `threads.listing: 'separate'`, like the walk
const THREAD_REACTION_METHODS = Object.freeze(['threadHistory', 'recentRoots', 'reactions', 'react', 'unreact', 'emojiImage', 'reactionSet']);
/** lane lark-threads (A4): the closed set of a by-id read's answers. */
const BY_ID_KINDS = Object.freeze(['absent', 'foreign', 'deleted', 'reply', 'root', 'plain']);

/**
 * THE VENDOR'S OWN RETRY HINT (lane R5): seconds from a response's
 * `Retry-After` (delta-seconds or an HTTP-date) or Lark's
 * `x-ogw-ratelimit-reset` (seconds), else null. Read by an adapter's
 * `callJson` when a call is refused, carried as `detail.retryAfterSec` —
 * the engine's short rate back-off honours it. `headers` = a fetch Headers
 * (or anything with `get`); a fixture without headers answers null.
 */
function retryAfterSeconds(headers, nowMs = Date.now()) {
  if (!headers || typeof headers.get !== 'function') return null;
  const read = (k) => { try { const v = headers.get(k); return v == null ? null : String(v).trim(); } catch { return null; } };
  const ra = read('retry-after');
  if (ra) {
    if (/^\d+(\.\d+)?$/.test(ra)) return Math.max(0, Number(ra));
    const at = Date.parse(ra);
    if (Number.isFinite(at)) return Math.max(0, Math.ceil((at - nowMs) / 1000));
  }
  const reset = read('x-ogw-ratelimit-reset');
  if (reset && /^\d+(\.\d+)?$/.test(reset)) return Math.max(0, Number(reset));
  return null;
}

/** Which capability each optional method is DECLARED by. A method present
 *  without its declaration is refused at registration; a method CALLED without
 *  its declaration throws `not-supported`. */
const METHOD_GATES = Object.freeze({
  live: (c) => c.receive === 'push',
  scanHost: (c) => c.receive === 'scan',
  fetchAttachment: (c) => c.attachments === 'fetch',
  // lane channel-avatars (B-5fe1): a PERSON's picture — declared by `caps.avatars: 'fetch'` (null + `avatarsWhy` = none)
  avatarImage: (c) => c.avatars === 'fetch',
  // 2026-09-26: history ON DEMAND past the local log's start (the window's
  // scroll-up) — declared by `caps.olderHistory: 'page'`
  older: (c) => c.olderHistory === 'page',
  reconcile: (c) => (c.sendAs || []).length > 0,
  send: (c) => (c.sendAs || []).length > 0,
  // R4 (B-6acc): a NEW conversation — `caps.compose === true` declares both
  // the send (`compose`) and the ACCOUNT-level identity check (`composeCaps`)
  compose: (c) => c.compose === true && (c.sendAs || []).length > 0,
  composeCaps: (c) => c.compose === true && (c.sendAs || []).length > 0,
  // r6 verify F3 (2026-09-28): a reply whose RECIPIENTS follow from the message
  // it answers (Gmail: To = the anchor's Reply-To / From) — `caps.replyEnvelope
  // === true` declares `replyEnvelope(convId, {anchorId})`, which the engine
  // asks when the reply is PROPOSED (stored, shown on the card, handed back
  // verbatim to `send` as `envelope`) — never decided at send time
  replyEnvelope: (c) => c.replyEnvelope === true && (c.sendAs || []).length > 0,
  // design 012 (Slack S1): what a proposal's text WILL DO, decided when it is proposed — `caps.prepareSend === true`
  // declares `prepareSend(convId, {text})` → {text, notifies, unresolved, plain, mentions, tooLong}: each `@Name`
  // resolved to the vendor's id ONCE (stored on the proposal, shown on the card, handed back verbatim to `send` as
  // `prepared`), the names it will notify, the ones two people answer (the proposal is refused by name)
  prepareSend: (c) => c.prepareSend === true && (c.sendAs || []).length > 0,
  // lane message-facts (B-f066): the FACTS of a thread stored before its records carried them — `caps.factsOf === true`
  // declares `factsOf(convId)` → {facts: {[vendorId]: [...]}}, asked only on a person's Details click (engine `messageFacts`)
  factsOf: (c) => c.factsOf === true && Array.isArray(c.facts) && c.facts.length > 0,
  listConversations: (c) => c.listConversations !== false,
  // lane channel-threads (2026-09-28): the thread walk, the per-message reaction list, the two acts, the custom
  // emoji picture and the picker's vocabulary — each declared by its capability row
  threadHistory: (c) => threadsOf(c).listing === 'separate',
  recentRoots: (c) => threadsOf(c).listing === 'separate',
  reactions: (c) => reactionsOf(c).read === 'list',
  react: (c) => reactionsOf(c).add === true,
  unreact: (c) => reactionsOf(c).remove === 'own',
  emojiImage: (c) => reactionsOf(c).custom === 'image',
  reactionSet: (c) => reactionsOf(c).add === true,
  // lane lark-search-poll: the change feed's page, and the name of a conversation it found
  changes: (c) => !!(c.changeFeed && typeof c.changeFeed === 'object'),
  describe: (c) => !!(c.changeFeed && typeof c.changeFeed === 'object' && c.changeFeed.describes === true),
  messageById: (c) => !!(c.changeFeed && typeof c.changeFeed === 'object') && threadsOf(c).listing === 'separate',
  // design 010: the vendor's own search (a person's press) and a hit read in context — declared by `caps.search`
  search: (c) => !!searchRowOf(c),
  around: (c) => !!searchRowOf(c) && !!searchRowOf(c).context,
});

/**
 * Validate a static `caps` declaration. THROWS with the exact rule broken —
 * a registration bug must fail at module load, where every gate sees it.
 */
/** B-df40 part 3: a setting an adapter READS must be a row its vendor's table DECLARES (src/channel-settings.js) —
 *  that row is what the Settings window shows and what the engine bounds, so an undeclared key would be a knob
 *  nobody can turn, read through the registry's sanity range. Refused at registration, by name. `tables` is the
 *  shipped CHANNEL_SETTINGS unless a SUITE's registry declared its own (createChannelRegistry below). */
function undeclaredKey(kind, role, key, bad, tables = ChannelSettings.CHANNEL_SETTINGS) {
  if (key === undefined || key === null) return;
  const want = ChannelSettings.declaredKey(kind, role, tables);
  if (!want) bad(`caps.${role}.settingKey ${JSON.stringify(key)} is not declared — the ${JSON.stringify(kind)} adapter has no ${role} row in src/channel-settings.js (declare it there and spread ${role}Of(CHANNEL_SETTINGS.${kind}) into caps.${role})`);
  if (key !== want) bad(`caps.${role}.settingKey ${JSON.stringify(key)} is not the ${role} row src/channel-settings.js declares for ${JSON.stringify(kind)} (${want})`);
}

function validateCaps(kind, caps, { channelSettings } = {}) {
  const c = caps || {};
  const bad = (m) => { throw new Error(`channel adapter '${kind}': ${m}`); };

  if (!RECEIVE_MODES.includes(c.receive)) bad(`caps.receive must be one of ${RECEIVE_MODES.join('|')} (got ${JSON.stringify(c.receive)})`);
  if (!Array.isArray(c.sendAs)) bad('caps.sendAs must be an array (an empty one declares a READ-ONLY adapter)');
  for (const s of c.sendAs) if (!SEND_IDENTITIES.includes(s)) bad(`caps.sendAs holds ${JSON.stringify(s)} — only ${SEND_IDENTITIES.join('|')}`);
  if (!IDENTITY_MARKING.includes(c.identityMarking)) bad(`caps.identityMarking must be one of ${IDENTITY_MARKING.join('|')}`);
  if (!TOS_RISK.includes(c.tosRisk || 'none')) bad(`caps.tosRisk must be one of ${TOS_RISK.join('|')}`);

  if (c.avatars !== undefined && c.avatars !== null && c.avatars !== 'fetch') bad(`caps.avatars must be 'fetch' or null (got ${JSON.stringify(c.avatars)})`);
  if (c.avatars === null && !(typeof c.avatarsWhy === 'string' && c.avatarsWhy.trim())) bad('caps.avatars is null without caps.avatarsWhy (the reason a person shows initials is said, never a silent blank)');
  // lane channels-list-polish: WHICH pictures ('person' | 'chat' | 'bot'); a kind left out is said by `avatarKindsWhy`
  if (c.avatarKinds !== undefined && !(Array.isArray(c.avatarKinds) && c.avatarKinds.length && c.avatarKinds.every((k) => ['person', 'chat', 'bot'].includes(k)))) bad(`caps.avatarKinds must list 'person' / 'chat' / 'bot' (got ${JSON.stringify(c.avatarKinds)})`);
  if (Array.isArray(c.avatarKinds) && c.avatarKinds.length < 3 && !(typeof c.avatarKindsWhy === 'string' && c.avatarKindsWhy.trim())) bad('caps.avatarKinds leaves a kind out without caps.avatarKindsWhy (why a bot / a group shows its glyph is said by name)');
  if (c.olderHistory !== undefined && !OLDER_HISTORY.includes(c.olderHistory)) bad(`caps.olderHistory must be one of ${OLDER_HISTORY.join('|')}`);
  if (c.compose !== undefined && typeof c.compose !== 'boolean') bad('caps.compose must be a boolean (true = the adapter can start a NEW conversation)');
  if (c.replyEnvelope !== undefined && typeof c.replyEnvelope !== 'boolean') bad('caps.replyEnvelope must be a boolean (true = a reply\'s recipients follow from the message it answers, resolved when it is proposed)');
  if (c.replyEnvelope === true && !(Array.isArray(c.sendAs) && c.sendAs.length)) bad('caps.replyEnvelope on a read-only adapter (caps.sendAs is empty)');
  // lane message-facts (B-f066): the fact kinds the adapter EMITS — each one of channel-record's closed FACT_KIND_NAMES,
  // no repeat (the contract suite fails an emit outside the list and a declared kind no shape fixture exercises)
  if (c.facts !== undefined) {
    if (!Array.isArray(c.facts)) bad('caps.facts must be an array of fact kinds (src/channel-facts.js)');
    for (const k of c.facts) if (!FACT_KIND_NAMES.includes(k)) bad(`caps.facts holds ${JSON.stringify(k)} — not a declared fact kind (${FACT_KIND_NAMES.join('|')})`);
    if (new Set(c.facts).size !== c.facts.length) bad('caps.facts names a kind twice');
  }
  if (c.factsOf !== undefined && typeof c.factsOf !== 'boolean') bad('caps.factsOf must be a boolean (true = factsOf(convId) reads a stored thread\'s facts)');
  // design 012 (Slack S1): THE POLICY MODES the vendor allows (absent = every one of channel-policy's POLICY_MODES) — a
  // non-empty subset, each once, `review` always among them (fail closed: an account must always be able to ask);
  // channel-policy's `policyMode(policy, caps)` clamps a declared mode outside it to review and the picker hides it
  if (c.policyModes !== undefined) {
    if (!Array.isArray(c.policyModes) || !c.policyModes.length) bad(`caps.policyModes must be a non-empty array of ${POLICY_MODES.join('|')}`);
    for (const m of c.policyModes) if (!POLICY_MODES.includes(m)) bad(`caps.policyModes holds ${JSON.stringify(m)} — only ${POLICY_MODES.join('|')}`);
    if (new Set(c.policyModes).size !== c.policyModes.length) bad('caps.policyModes names a mode twice');
    if (!c.policyModes.includes('review')) bad("caps.policyModes without 'review' — every account must be able to ask before it sends");
  }
  if (c.prepareSend !== undefined && typeof c.prepareSend !== 'boolean') bad('caps.prepareSend must be a boolean (true = prepareSend(convId, {text}) decides the mentions when a proposal is made)');
  if (c.prepareSend === true && !(Array.isArray(c.sendAs) && c.sendAs.length)) bad('caps.prepareSend on a read-only adapter (caps.sendAs is empty)');
  if (c.retention !== undefined && !RETENTION_MODES.includes(c.retention)) bad(`caps.retention must be one of ${RETENTION_MODES.join('|')}`);
  if (c.factsOf === true && !(Array.isArray(c.facts) && c.facts.length)) bad('caps.factsOf without caps.facts (which kinds would it read?)');
  if (c.budget !== undefined) {
    const b = c.budget;
    if (!b || typeof b !== 'object') bad('caps.budget must be an object {unit, default, settingKey?, metered?}');
    if (!BUDGET_UNITS.includes(b.unit)) bad(`caps.budget.unit must be one of ${BUDGET_UNITS.join('|')}`);
    if (!(Number(b.default) > 0)) bad('caps.budget.default must be a positive number (per minute)');
    if (b.settingKey !== undefined && b.settingKey !== null && !/^channels\.[A-Za-z0-9]+$/.test(String(b.settingKey))) bad('caps.budget.settingKey must be a channels.* setting key');
    undeclaredKey(kind, 'budget', b.settingKey, bad, channelSettings);
  }
  // lane R5: the PER-SECOND pace (drain rule 18) — in the budget's unit, so a
  // pace without a budget has no unit and is refused
  if (c.pace !== undefined) {
    const p = c.pace;
    if (!p || typeof p !== 'object') bad('caps.pace must be an object {unitsPerSec, settingKey?, cost?}');
    if (c.budget === undefined) bad('caps.pace needs caps.budget (the pace is counted in the budget\'s unit)');
    if (!(Number(p.unitsPerSec) > 0)) bad('caps.pace.unitsPerSec must be a positive number (per second)');
    if (p.settingKey !== undefined && p.settingKey !== null && !/^channels\.[A-Za-z0-9]+$/.test(String(p.settingKey))) bad('caps.pace.settingKey must be a channels.* setting key');
    undeclaredKey(kind, 'pace', p.settingKey, bad, channelSettings);
    if (p.cost !== undefined) {
      if (!p.cost || typeof p.cost !== 'object') bad('caps.pace.cost must be an object {fetch?, discover?, scanHost?}');
      for (const [k, v] of Object.entries(p.cost)) {
        if (!PACE_COSTS.includes(k)) bad(`caps.pace.cost.${k} is not an action the drain paces (${PACE_COSTS.join('|')})`);
        if (!(Number(v) >= 0)) bad(`caps.pace.cost.${k} must be a number ≥ 0`);
      }
    }
  }
  if (c.render !== undefined && !RENDER_MODES.includes(c.render)) bad(`caps.render must be one of ${RENDER_MODES.join('|')}`);
  if (c.titleForm !== undefined && !TITLE_FORMS.includes(c.titleForm)) bad(`caps.titleForm must be one of ${TITLE_FORMS.join('|')}`);
  if (c.glyph !== undefined && !GLYPHS.includes(c.glyph)) bad(`caps.glyph must be one of ${GLYPHS.join('|')}`);
  if (c.vendorName !== undefined && !(typeof c.vendorName === 'string' && c.vendorName.trim() && c.vendorName.length <= 40)) bad('caps.vendorName must be a non-empty string of at most 40 characters (the vendor as the card names it)');
  // design 005 §2.B (B-fd1f): WHAT AN AGENT MAY ATTACH — absent / null ⇒ nothing (`attachments-not-offered`, with
  // `sendAttachmentsWhy` as the reason); ONE row `{maxCount, maxTotalBytes, withText}` (text and files in one message) or
  // TWO `{images?, files?}` each `{maxCount, maxBytes, withText}` (a vendor that sends pictures and files differently)
  if (c.sendAttachments !== undefined && c.sendAttachments !== null) {
    const a = c.sendAttachments;
    const posInt = (v) => Number.isInteger(v) && v > 0;
    if (typeof a !== 'object') bad('caps.sendAttachments must be an object, or null (none)');
    if (!(c.sendAs || []).length) bad('caps.sendAttachments on a read-only adapter (caps.sendAs is empty) — an attachment rides a sent message');
    if (a.images !== undefined || a.files !== undefined) {
      for (const k of ['images', 'files']) {
        const g = a[k];
        if (g === undefined || g === null) continue;
        if (typeof g !== 'object' || !posInt(g.maxCount) || !(Number(g.maxBytes) > 0) || typeof g.withText !== 'boolean') bad(`caps.sendAttachments.${k} must be {maxCount: a positive integer, maxBytes > 0, withText: boolean}`);
      }
    } else if (!posInt(a.maxCount) || !(Number(a.maxTotalBytes) > 0) || typeof a.withText !== 'boolean') bad('caps.sendAttachments must be {maxCount: a positive integer, maxTotalBytes > 0, withText: boolean}, or {images?, files?}');
  }
  if (c.sendAttachmentsWhy !== undefined && c.sendAttachmentsWhy !== null && !(typeof c.sendAttachmentsWhy === 'string' && c.sendAttachmentsWhy.trim() && c.sendAttachmentsWhy.length <= 300)) bad('caps.sendAttachmentsWhy must be a non-empty string of at most 300 characters (why this adapter takes no attachments)');
  // lane channel-threads (spec §2.1): the two rows, each an UPPER BOUND with its refusals named
  if (c.threads !== undefined) {
    const t = c.threads;
    if (!t || typeof t !== 'object') bad('caps.threads must be an object {read, replyInto, listing}');
    if (!THREAD_READ.includes(t.read)) bad(`caps.threads.read must be one of ${THREAD_READ.join('|')}`);
    if (typeof t.replyInto !== 'boolean') bad('caps.threads.replyInto must be a boolean');
    if (!THREAD_LISTING.includes(t.listing)) bad(`caps.threads.listing must be one of ${THREAD_LISTING.join('|')}`);
    if (t.replyInto && !(c.sendAs || []).length) bad('caps.threads.replyInto on a read-only adapter (caps.sendAs is empty) — replying into a thread is a send');
    if (t.read === 'none' && (t.replyInto || t.listing !== 'none')) bad("caps.threads.read 'none' cannot reply into or list a thread");
    // 2026-09-28: THE PLACEMENTS — a closed set, each once, coherent with the rest of the row (a read-only adapter
    // places nothing; `thread` ⇔ `replyInto`; `thread+chat` needs `thread`) and the vendor's norm for a root among them
    if (t.placements !== undefined) {
      if (!Array.isArray(t.placements)) bad(`caps.threads.placements must be an array of ${PLACEMENTS.join('|')}`);
      for (const x of t.placements) if (!PLACEMENTS.includes(x)) bad(`caps.threads.placements holds ${JSON.stringify(x)} — only ${PLACEMENTS.join('|')}`);
      if (new Set(t.placements).size !== t.placements.length) bad('caps.threads.placements names a placement twice');
      if (t.placements.length && !(c.sendAs || []).length) bad('caps.threads.placements on a read-only adapter (caps.sendAs is empty) — a placement is where a SENT message lands');
      if (t.placements.includes('thread') !== (t.replyInto === true)) bad("caps.threads.replyInto and placements disagree — replyInto:true ⇔ 'thread' is declared");
      if (t.placements.includes('thread+chat') && !t.placements.includes('thread')) bad("caps.threads.placements 'thread+chat' without 'thread'");
      const roots = t.placements.filter((x) => ROOT_REPLIES.includes(x));
      if (roots.length ? !roots.includes(t.rootReply) : (t.rootReply !== undefined && t.rootReply !== null)) bad(`caps.threads.rootReply must be one of the declared ${roots.length ? roots.join('|') : '(none — nothing answers a message)'} (the vendor's norm for a reply to a message outside any thread)`);
    } else if (t.rootReply !== undefined) bad('caps.threads.rootReply without caps.threads.placements');
  }
  if (c.reactions !== undefined) {
    const r = c.reactions;
    if (!r || typeof r !== 'object') bad('caps.reactions must be an object {read, add, remove, vocabulary, custom, perMessageMax}');
    if (!REACTION_READ.includes(r.read)) bad(`caps.reactions.read must be one of ${REACTION_READ.join('|')}`);
    if (typeof r.add !== 'boolean') bad('caps.reactions.add must be a boolean');
    if (!REACTION_REMOVE.includes(r.remove)) bad(`caps.reactions.remove must be one of ${REACTION_REMOVE.join('|')}`);
    if (!REACTION_VOCABULARY.includes(r.vocabulary)) bad(`caps.reactions.vocabulary must be one of ${REACTION_VOCABULARY.join('|')}`);
    if (!REACTION_CUSTOM.includes(r.custom)) bad(`caps.reactions.custom must be one of ${REACTION_CUSTOM.join('|')}`);
    if (r.perMessageMax !== undefined && r.perMessageMax !== null && !(Number.isInteger(r.perMessageMax) && r.perMessageMax > 0)) bad('caps.reactions.perMessageMax must be a positive integer or null');
    if (r.add && r.read === 'none') bad("caps.reactions.add with read 'none' — a control whose result can never be shown");
    if (r.remove === 'own' && !r.add) bad("caps.reactions.remove 'own' without add");
  }
  // lane lark-search-poll: the change feed row, every number bounded and every refusal named
  if (c.changeFeed !== undefined) {
    const f = c.changeFeed;
    if (!f || typeof f !== 'object') bad('caps.changeFeed must be an object {via, scope, option, pageSize, pagesPerPass, perMin, maxWindowSec, catchUp, describes, timeUnit}');
    if (!Feed.FEED_VIA.includes(f.via)) bad(`caps.changeFeed.via must be one of ${Feed.FEED_VIA.join('|')}`);
    if (f.scope !== null && f.scope !== undefined && !(typeof f.scope === 'string' && f.scope && f.scope.length <= 100)) bad('caps.changeFeed.scope must be a scope name or null');
    if (f.option !== null && f.option !== undefined && !(typeof f.option === 'string' && /^[a-z][A-Za-z0-9]{0,31}$/.test(f.option))) bad('caps.changeFeed.option must be an option key or null');
    // lane channel-feed-authority: the AUTHORITY is declared, never inferred — `history` (the vendor's own change log) is
    // authoritative and only it; a search is measured. An authoritative row has no window / page size / hit reader.
    if (f.authority !== undefined && !Feed.FEED_AUTHORITY.includes(f.authority)) bad(`caps.changeFeed.authority must be one of ${Feed.FEED_AUTHORITY.join('|')}`);
    const authoritative = f.authority === 'authoritative';
    if ((f.via === 'history') !== authoritative) bad("caps.changeFeed: via 'history' is the AUTHORITATIVE change log (authority 'authoritative'), and only it — a search is measured, never trusted whole");
    for (const k of authoritative ? ['pagesPerPass', 'perMin'] : ['pageSize', 'pagesPerPass', 'perMin', 'maxWindowSec']) if (!(Number.isInteger(f[k]) && f[k] > 0)) bad(`caps.changeFeed.${k} must be a positive integer`);
    if (!authoritative && f.catchUp !== null && f.catchUp !== undefined) {
      if (!f.catchUp || typeof f.catchUp !== 'object' || typeof f.catchUp.chatType !== 'string' || !(Number.isInteger(f.catchUp.pagesMax) && f.catchUp.pagesMax > 0)) bad('caps.changeFeed.catchUp must be {chatType, pagesMax (a positive integer)} or null');
    }
    if (!authoritative && typeof f.describes !== 'boolean') bad('caps.changeFeed.describes must be a boolean');
    if (!authoritative && !Feed.TIME_UNITS.includes(f.timeUnit)) bad(`caps.changeFeed.timeUnit must be one of ${Feed.TIME_UNITS.join('|')} — ONE declared unit, never guessed from a value's size`);
    // lane lark-p2p: the adapter's HIT-READER revision (optional, default 1) — a reader fix that makes hits readable which
    // the previous reader refused bumps it, and a feed row the old reader wrote starts over (the engine's `feedReaderHeal`)
    if (f.reader !== undefined && !(Number.isInteger(f.reader) && f.reader > 0 && f.reader <= 1000)) bad('caps.changeFeed.reader must be a positive integer (the hit reader\'s revision) or absent');
    if (c.listConversations === false) bad('caps.changeFeed on an adapter that cannot list its conversations — a group the feed finds is born by discovery');
  }
  if (c.search !== undefined) {
    const q = c.search;
    if (!q || typeof q !== 'object') bad('caps.search must be an object {via, pageSize, pagesPerPress, perMin, cost, snippet, context, match, adds, scope?}');
    if (!SR.SEARCH_VIA.includes(q.via)) bad(`caps.search.via must be one of ${SR.SEARCH_VIA.join('|')}`);
    for (const k of ['pageSize', 'pagesPerPress', 'perMin', 'cost']) if (!(Number.isInteger(q[k]) && q[k] > 0)) bad(`caps.search.${k} must be a positive integer`);
    if (q.pagesPerPress > q.perMin) bad('caps.search.pagesPerPress may not exceed caps.search.perMin (one press could never be answered)');
    if (typeof q.snippet !== 'boolean') bad('caps.search.snippet must be a boolean');
    if (q.context !== null && !SR.SEARCH_CONTEXT.includes(q.context)) bad(`caps.search.context must be one of ${SR.SEARCH_CONTEXT.join('|')} or null`);
    if (!SR.SEARCH_MATCH.includes(q.match)) bad(`caps.search.match must be one of ${SR.SEARCH_MATCH.join('|')} (VS3 — 'unknown' until measured)`);
    if (!SR.SEARCH_ADDS.includes(q.adds)) bad(`caps.search.adds must be one of ${SR.SEARCH_ADDS.join('|')} — what a hit adds to the saved copy (the words read it, never the adapter id)`);
    if (q.scope !== null && q.scope !== undefined && !(typeof q.scope === 'string' && q.scope && q.scope.length <= 100)) bad('caps.search.scope must be a scope name or null');
  }
  if (c.receive === 'push') {
    if (!c.pushTransport) bad("caps.receive 'push' must declare pushTransport");
    if (!Number.isFinite(Number(c.pushAckBudgetMs))) bad("caps.receive 'push' must declare pushAckBudgetMs (the vendor's own deadline — fence 11 acks AFTER durability)");
  }

  if (c.receive === 'scan') {
    // r4: a scan adapter reports neither "a complete pass" nor `reachedAnchor`
    // if it cannot page at all, and design §5 invariant 4 requires both before
    // an anchor may advance.
    if (c.history === 'none') bad("caps.receive 'scan' may not declare history:'none' — an adapter that cannot page can never report a COMPLETE pass, so its anchor could never advance");
    // r5: `scanSources` is a PER-PLATFORM upper bound, because ONE adapter
    // reads a store on one OS and scrapes a screen on another.
    if (!c.scanSources || typeof c.scanSources !== 'object') bad("caps.receive 'scan' must declare scanSources (a per-platform table)");
    const platforms = Object.keys(c.scanSources);
    if (!platforms.length) bad('caps.scanSources is empty — declare the platforms this adapter can read');
    for (const p of platforms) if (!SCAN_SOURCES.includes(c.scanSources[p])) bad(`caps.scanSources.${p} must be one of ${SCAN_SOURCES.join('|')}`);
    if (!c.scanLatency || typeof c.scanLatency !== 'object') bad("caps.receive 'scan' must declare scanLatency per SOURCE (it is the declared cadence AND the fs.watch debounce ceiling)");
    // r6: `history` is a per-SOURCE fact for exactly the reason `scanSources`
    // is one — a DOM scrape cannot honour since-anchor semantics, while
    // declaring 'page' would delete the real anchor that is WHY 'store' is
    // preferred. Every named source needs its row and none may be 'none'.
    if (!c.historyBySource || typeof c.historyBySource !== 'object') bad("caps.receive 'scan' must declare historyBySource (per SOURCE), not the `history` scalar");
    for (const p of platforms) {
      const src = c.scanSources[p];
      const h = c.historyBySource[src];
      if (!h) bad(`caps.historyBySource is missing '${src}', which caps.scanSources.${p} names`);
      if (h === 'none') bad(`caps.historyBySource.${src} may not be 'none' (see the receive:'scan' rule above)`);
      if (!HISTORY_MODES.includes(h)) bad(`caps.historyBySource.${src} must be one of ${HISTORY_MODES.join('|')}`);
      if (!Number.isFinite(Number(c.scanLatency[src]))) bad(`caps.scanLatency is missing a number for '${src}'`);
    }
  } else if (!HISTORY_MODES.includes(c.history)) {
    bad(`caps.history must be one of ${HISTORY_MODES.join('|')}`);
  }
  return true;
}

/** THE RAW-API ROW (B-2198, docs/design-channel-raw-api.md "The api row") — the ONE schema an integration declares its raw
 *  API in, next to its `apiBearer`: the vendor facts live in the vendor's own file, the fence (src/channel-api.js) and the
 *  orchestrator (src/server/channel-api.js) read the declared row and name no vendor. A storage mount's lent credential
 *  (src/mounts.js `OAUTH_API`) is the same row plus `refresh`, its token endpoint.
 *   · label       — the vendor's name as `api docs` and the API access dialog say it
 *   · hosts       — bare lowercase hostnames; `hosts[0]` is the default, a call may name another (`--host`), never one outside
 *   · docs        — the vendor's own API reference, https URLs (VibeSpace keeps no API map of its own)
 *   · readByPost  — the vendor's read-by-POST paths (a POST that reads): RegExp, or a string anchored with `^`
 *   · sensitive   — the paths that ALWAYS ask (never auto, never "always allow"): RegExp, or a string anchored with `^`
 *   · refresh     — (optional) the https token endpoint VibeSpace refreshes the credential at itself */
const API_ROW_KEYS = Object.freeze(['label', 'hosts', 'docs', 'readByPost', 'sensitive', 'refresh']);
const API_HOST = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
const httpsUrl = (u) => { try { const x = new URL(String(u)); return typeof u === 'string' && x.protocol === 'https:' && API_HOST.test(x.hostname); } catch { return false; } };
const apiPattern = (p) => p instanceof RegExp || (typeof p === 'string' && p.length > 1 && p.startsWith('^'));
function validateApi(kind, api) {
  const bad = (msg) => { throw new Error(`channel adapter '${kind}': api.${msg}`); };
  if (!api || typeof api !== 'object' || Array.isArray(api)) throw new Error(`channel adapter '${kind}': api must be the raw-API row {${API_ROW_KEYS.join(', ')}}`);
  for (const k of Object.keys(api)) if (!API_ROW_KEYS.includes(k)) bad(`${k} is not a key of the raw-API row (${API_ROW_KEYS.join(', ')})`);
  if (typeof api.label !== 'string' || !api.label.trim() || api.label.length > 60) bad('label must be the vendor\'s name (1-60 characters)');
  if (!Array.isArray(api.hosts) || !api.hosts.length || !api.hosts.every((h) => typeof h === 'string' && API_HOST.test(h))) bad('hosts must be bare lowercase hostnames (at least one; no scheme, port or path)');
  if (new Set(api.hosts).size !== api.hosts.length) bad('hosts holds a duplicate');
  if (!Array.isArray(api.docs) || !api.docs.length || !api.docs.every(httpsUrl)) bad('docs must be the vendor\'s own API reference as https URLs (at least one)');
  for (const k of ['readByPost', 'sensitive']) if (!Array.isArray(api[k]) || !api[k].every(apiPattern)) bad(`${k} must be a list of RegExp or strings anchored with "^"`);
  if (api.refresh !== undefined && !httpsUrl(api.refresh)) bad('refresh must be an https URL (the token endpoint)');
  return true;
}

/** Which optional methods a module must and must not implement. */
function validateMethods(kind, caps, mod) {
  for (const [name, declared] of Object.entries(METHOD_GATES)) {
    const has = typeof mod[name] === 'function' || (name === 'live' && mod.live && typeof mod.live.start === 'function');
    if (declared(caps) && !has) throw new Error(`channel adapter '${kind}': caps declare ${name} but the module does not implement it`);
    // lane channel-threads: a thread / reaction method present that its row does not declare is refused too
    if (name === 'avatarImage' && !declared(caps) && has) throw new Error(`channel adapter '${kind}': avatarImage is implemented but caps.avatars does not declare 'fetch'`);
    if (THREAD_REACTION_METHODS.includes(name) && !declared(caps) && has) throw new Error(`channel adapter '${kind}': ${name} is implemented but its capability row does not declare it`);
    // lane lark-search-poll: a feed method present that `caps.changeFeed` does not declare is refused too
    if (FEED_METHODS.includes(name) && !declared(caps) && has) throw new Error(`channel adapter '${kind}': ${name} is implemented but caps.changeFeed does not declare it`);
    // lane message-facts: `factsOf` declared ⇔ implemented
    if (name === 'factsOf' && !declared(caps) && has) throw new Error(`channel adapter '${kind}': factsOf is implemented but caps.factsOf / caps.facts do not declare it`);
    // design 010: a search method present that `caps.search` does not declare is refused too
    if (SEARCH_METHODS.includes(name) && !declared(caps) && has) throw new Error(`channel adapter '${kind}': ${name} is implemented but caps.search does not declare it`);
  }
  for (const req of ['auth', 'history', 'convCaps']) {
    if (typeof mod[req] !== 'function' && !(req === 'auth' && mod.auth && typeof mod.auth.state === 'function')) {
      throw new Error(`channel adapter '${kind}': ${req} is required by every adapter`);
    }
  }
  return true;
}

/**
 * ONE registry. `register()` is LOUD on a duplicate or a malformed record;
 * `get()` is LOUD on an unknown kind — the core never falls through to a
 * default adapter, exactly as `src/harnesses/index.js` never falls through to
 * claude.
 *
 * `channelSettings` (B-df40 part 3) is a SUITE's seam: the per-vendor tables a caps settingKey is checked against —
 * the shipped CHANNEL_SETTINGS when absent. A suite's scripted module that reads a budget key of its own declares
 * it in a table for its kind (the S6 shape); NO production caller passes it (test-channel-adapter-contract ⑦'s census).
 */
/** lane dc-channels-manifest (rv F2): the fields the engine reads off a VENDOR module, checked at register — `label`
 *  (≤ 40), `integration` (an existing integration-registry row) with its `integrationTest` (a function, or absent),
 *  `OPTIONS` (a declared table: key / label / default, the default among its `choices`), `optionOf` / `effectiveOptions`
 *  / `vendorNameOf` (functions), `builtin` (boolean), `policyDefault` (a word), `manifest` (its own kind). */
function validateVendor(kind, mod) {
  const bad = (why) => { throw new Error(`channel vendor '${kind}': ${why}`); };
  if (typeof mod.label !== 'string' || !mod.label.trim() || mod.label.length > 40) bad('label must be a non-empty string of at most 40 characters');
  if (mod.integration !== undefined && !(typeof mod.integration === 'string' && IntegrationRegistry.rowById(mod.integration))) bad(`integration ${JSON.stringify(mod.integration)} is not an integration-registry row (declare it in the vendor's manifest)`);
  if (mod.integrationTest !== undefined && (typeof mod.integrationTest !== 'function' || mod.integration === undefined)) bad('integrationTest must be a function, on a module that names its integration row');
  for (const f of ['optionOf', 'effectiveOptions', 'vendorNameOf']) if (mod[f] !== undefined && typeof mod[f] !== 'function') bad(`${f} must be a function`);
  if (mod.builtin !== undefined && typeof mod.builtin !== 'boolean') bad('builtin must be a boolean');
  if (mod.policyDefault !== undefined && !(typeof mod.policyDefault === 'string' && /^[a-z][a-z-]{0,31}$/.test(mod.policyDefault))) bad('policyDefault must be a policy word');
  if (mod.OPTIONS !== undefined) {
    if (!Array.isArray(mod.OPTIONS)) bad('OPTIONS must be an array of {key, label, default}');
    const keys = new Set();
    for (const o of mod.OPTIONS) {
      const at = `OPTIONS ${JSON.stringify(o && o.key)}`;
      if (!o || typeof o !== 'object' || typeof o.key !== 'string' || !/^[a-z][A-Za-z0-9]{0,31}$/.test(o.key)) bad(`${at}: key must be an option key`);
      if (keys.has(o.key)) bad(`${at}: duplicate key`);
      keys.add(o.key);
      if (typeof o.label !== 'string' || !o.label.trim()) bad(`${at}: label must be a non-empty string`);
      if (o.default === undefined) bad(`${at}: default is required`);
      if (o.choices !== undefined && !(Array.isArray(o.choices) && o.choices.length && o.choices.includes(o.default))) bad(`${at}: choices must be a non-empty list holding the default`);
    }
  }
  if (mod.manifest !== undefined && !(mod.manifest && typeof mod.manifest === 'object' && mod.manifest.kind === kind)) bad('manifest must be its own vendor manifest (manifest.kind === kind)');
}

function createChannelRegistry({ channelSettings } = {}) {
  const mods = new Map();
  const vendorKinds = new Set();

  /** `vendor` (lane dc-channels-manifest, rv F2): the module is a channel VENDOR (an entry of the vendor list — the
   *  engine registers each REAL_ADAPTERS module whole; a module declaring its `manifest` is one by default): every field
   *  the engine reads off it is checked HERE, so a missing or malformed declaration refuses to register, by name. */
  function register(mod, { vendor = !!(mod && typeof mod === 'object' && mod.manifest !== undefined) } = {}) {
    if (!mod || typeof mod !== 'object') throw new Error('registerChannelAdapter: a module object is required');
    const kind = mod.kind;
    if (typeof kind !== 'string' || !kind) throw new Error('registerChannelAdapter: `kind` (non-empty string) is required');
    if (mods.has(kind)) throw new Error(`registerChannelAdapter: duplicate kind '${kind}'`);
    validateCaps(kind, mod.caps, { channelSettings });
    // B-2198: the raw-API row, DECLARED by the adapter (its `apiBearer` pairs with it at create — the bearer lives per record)
    if (mod.api !== undefined) validateApi(kind, mod.api);
    if (typeof mod.create !== 'function') throw new Error(`channel adapter '${kind}': create(record, deps) is required`);
    // §25: `render: 'blocks'` is DECLARED ⇒ the stored-record rung must exist;
    // a rung nobody declared is refused (it would half-work on read only)
    const blocksDeclared = mod.caps.render === 'blocks';
    if (blocksDeclared && typeof mod.blocksOf !== 'function') throw new Error(`channel adapter '${kind}': caps.render 'blocks' needs blocksOf(record) — the rung for a record stored before its tree existed`);
    if (!blocksDeclared && mod.blocksOf !== undefined) throw new Error(`channel adapter '${kind}': blocksOf is exported but caps.render is not 'blocks'`);
    // inc-muk9jj0j-rel3: the PURE send verdict from held scopes (the engine re-judges every conversation on a credential change)
    if (mod.sendCapsOf !== undefined && (typeof mod.sendCapsOf !== 'function' || !(mod.caps.sendAs || []).length)) throw new Error(`channel adapter '${kind}': sendCapsOf must be a function of the held scopes, on a sendable adapter`);
    // lane gmail-reply-known: a listed conversation's send row answered from held facts — a boolean or absent
    if (mod.convCapsFromListing !== undefined && typeof mod.convCapsFromListing !== 'boolean') throw new Error(`channel adapter '${kind}': convCapsFromListing must be a boolean`);
    // lane channel-rich: the READ-TIME VIEW of a stored record (a bot's name, markup read) — a function or absent
    if (mod.recordView !== undefined && typeof mod.recordView !== 'function') throw new Error(`channel adapter '${kind}': recordView must be a function(record) → record`);
    // lane dc-channels-blocks (C5/C6): a stored record's VENDOR FACTS by name — `rawFacts(record)` → {tenant?, type?,
    // subject?} (the engine never reads a vendor's raw field) — and the live lane's words for the codes it parks with
    if (mod.rawFacts !== undefined && typeof mod.rawFacts !== 'function') throw new Error(`channel adapter '${kind}': rawFacts must be a function(record) → {tenant, type, subject}`);
    if (mod.unavailableWords !== undefined) {
      const w = mod.unavailableWords;
      if (!w || typeof w !== 'object' || !Object.keys(w).length || !Object.entries(w).every(([k, v]) => /^[a-z][a-z0-9-]{0,63}$/.test(k) && typeof v === 'string' && v)) throw new Error(`channel adapter '${kind}': unavailableWords must be {code: words} (non-empty strings)`);
      if (mod.caps.receive !== 'push') throw new Error(`channel adapter '${kind}': unavailableWords on an adapter with no push lane`);
    }
    // what unlocks SENDING (the window's read-only line): {scopes: [...], console: boolean}
    if (mod.sendGrant !== undefined) {
      const g = mod.sendGrant;
      if (!g || !Array.isArray(g.scopes) || !g.scopes.length || !g.scopes.every((x) => typeof x === 'string' && x) || typeof g.console !== 'boolean') throw new Error(`channel adapter '${kind}': sendGrant must be {scopes: [non-empty strings], console: boolean}`);
      if (!(mod.caps.sendAs || []).length) throw new Error(`channel adapter '${kind}': sendGrant on a read-only adapter (caps.sendAs is empty)`);
    }
    // lane channel-threads: the scope verdict grows a reactions half (`capsOfScopes(scopes)` → {sendAs, why,
    // reactions:{read, add, why}}) and what unlocks READING reactions (the window's line): {scopes, console}
    if (mod.capsOfScopes !== undefined && typeof mod.capsOfScopes !== 'function') throw new Error(`channel adapter '${kind}': capsOfScopes must be a function of the held scopes`);
    if (mod.reactionsGrant !== undefined) {
      const g = mod.reactionsGrant;
      if (!g || !Array.isArray(g.scopes) || !g.scopes.length || !g.scopes.every((x) => typeof x === 'string' && x) || typeof g.console !== 'boolean') throw new Error(`channel adapter '${kind}': reactionsGrant must be {scopes: [non-empty strings], console: boolean}`);
      if (reactionsOf(mod.caps).read === 'none') throw new Error(`channel adapter '${kind}': reactionsGrant on an adapter that reads no reactions`);
      // owner ruling (2026-09-28): `option` (optional) names the account option that WANTS reading — the grant's line is
      // silent while that option is `off` (the module's OPTIONS declare it; test-channels-lark-shape pins the pairing)
      if (g.option !== undefined && !(typeof g.option === 'string' && /^[a-z][A-Za-z0-9]{0,31}$/.test(g.option))) throw new Error(`channel adapter '${kind}': reactionsGrant.option must be an option key`);
    }
    // lane lark-search-poll: what unlocks the CHANGE FEED (the card's one-Re-authorize line) — {scopes, console, option?}
    if (mod.feedGrant !== undefined) {
      const g = mod.feedGrant;
      if (!g || !Array.isArray(g.scopes) || !g.scopes.length || !g.scopes.every((x) => typeof x === 'string' && x) || typeof g.console !== 'boolean') throw new Error(`channel adapter '${kind}': feedGrant must be {scopes: [non-empty strings], console: boolean}`);
      if (!mod.caps.changeFeed) throw new Error(`channel adapter '${kind}': feedGrant on an adapter that declares no change feed`);
      if (g.option !== undefined && !(typeof g.option === 'string' && /^[a-z][A-Za-z0-9]{0,31}$/.test(g.option))) throw new Error(`channel adapter '${kind}': feedGrant.option must be an option key`);
    }
    // lane lark-threads (B1/B5): what unlocks READING PEOPLE'S PROFILES (the card's one-Re-authorize line) — {scopes, console}
    if (mod.peopleGrant !== undefined) {
      const g = mod.peopleGrant;
      if (!g || !Array.isArray(g.scopes) || !g.scopes.length || !g.scopes.every((x) => typeof x === 'string' && x) || typeof g.console !== 'boolean') throw new Error(`channel adapter '${kind}': peopleGrant must be {scopes: [non-empty strings], console: boolean}`);
    }
    if (vendor) validateVendor(kind, mod);
    mods.set(kind, mod);
    if (vendor) vendorKinds.add(kind);
    return mod;
  }

  function get(kind) {
    const m = mods.get(kind);
    if (!m) throw new Error(`channel adapter '${kind}' is not registered (registered: ${[...mods.keys()].join(', ') || 'none'})`);
    return m;
  }
  const has = (kind) => mods.has(kind);
  /** The registered VENDOR module of `kind` (a REAL_ADAPTERS entry), or null — a fake / built-in kind is none. */
  const vendor = (kind) => (vendorKinds.has(kind) ? mods.get(kind) : null);
  /** Every registered vendor module, in registration order (= the vendor list's). */
  const vendors = () => [...vendorKinds].map((k) => mods.get(k));
  const list = () => [...mods.values()].map((m) => ({ kind: m.kind, caps: m.caps }));
  const capsOf = (kind) => get(kind).caps;

  /**
   * Instantiate ONE adapter for ONE record and wrap it in the contract:
   * undeclared methods throw `not-supported`, bare throws become typed,
   * `convCaps` is narrowed to `caps`, and `history()` is checked for the two
   * promises it makes (no unasked-for records; `reachedAnchor` present).
   */
  function create(kind, record, deps = {}) {
    const mod = get(kind);
    const caps = mod.caps;
    const impl = mod.create(record, deps) || {};
    // B-2198: `apiBearer` ⇔ the declared `api` row — a bearer with no row (or a row with no bearer) is LOUD, like an
    // undeclared capability: the raw API's fence knows a vendor ONLY by the row its adapter declares
    if (typeof impl.apiBearer === 'function' && !mod.api) throw new Error(`channel adapter '${kind}': apiBearer without an api row — declare the raw-API row (label, hosts, docs, readByPost, sensitive) on the module`);
    if (mod.api && typeof impl.apiBearer !== 'function') throw new Error(`channel adapter '${kind}': an api row without apiBearer — the instance hands the raw API its bearer`);
    // lane channel-threads (spec §2.1): the six thread / reaction methods live on the INSTANCE (created per
    // record), so "declared ⇒ implemented" is judged there: `validateMethods(kind, caps, instance)` — the contract
    // suite runs it over every registered adapter (a declared row without its method is red), and a declared
    // method a scripted module left out answers the typed `not-supported` when called (the `gated` rule below),
    // never a half-working control; an UNDECLARED method is never exposed at all.

    const wrap = (name, fn) => async (...args) => {
      try { return await fn(...args); } catch (e) {
        if (e instanceof ChannelError) throw e;
        throw new ChannelError('vendor-error', `${kind}.${name}: ${e && e.message ? e.message : String(e)}`, { retryable: false, detail: { threw: true } });
      }
    };
    const gated = (name, fn) => {
      const gate = METHOD_GATES[name];
      if (gate && !gate(caps)) {
        return async () => {
          // `send` is the ONE carved-out case (§4): on a read-only adapter it
          // is not a failure, it does not exist — and it says so with the
          // reason `caps` gives, so the outbox never builds a proposal.
          if (name === 'send') throw new ChannelError('send-not-available', `${kind}: this adapter is read-only (caps.sendAs is empty)`, { retryable: false, detail: { sendAs: caps.sendAs } });
          throw new ChannelError('not-supported', `${kind}.${name} is not declared by this adapter's caps`, { retryable: false });
        };
      }
      if (typeof fn !== 'function') return async () => { throw new ChannelError('not-supported', `${kind}.${name} is declared but not implemented`, { retryable: false }); };
      return wrap(name, fn);
    };

    const auth = {
      state: wrap('auth.state', (impl.auth && impl.auth.state ? impl.auth.state.bind(impl.auth) : async () => ({ state: 'unknown', why: 'adapter declares no auth state' }))),
      begin: impl.auth && impl.auth.begin ? wrap('auth.begin', impl.auth.begin.bind(impl.auth)) : async () => { throw new ChannelError('not-supported', `${kind}.auth.begin is not implemented`); },
      finish: impl.auth && impl.auth.finish ? wrap('auth.finish', impl.auth.finish.bind(impl.auth)) : async () => { throw new ChannelError('not-supported', `${kind}.auth.finish is not implemented`); },
    };

    const rawConvCaps = gated('convCaps', impl.convCaps && impl.convCaps.bind(impl));
    const rawHistory = gated('history', impl.history && impl.history.bind(impl));
    const rawOlder = gated('older', impl.older && impl.older.bind(impl));

    return {
      kind, caps, record,
      auth,
      // B-2198 (lane channel-api-chrome — the raw API never reached a REAL adapter: this object dropped it): the account's
      // bearer for the raw API's ONE fetch site (src/server/channel-api.js via the engine's apiCredential), never a route
      ...(mod.api ? { api: mod.api, apiBearer: wrap('apiBearer', impl.apiBearer.bind(impl)) } : {}),
      listConversations: gated('listConversations', impl.listConversations && impl.listConversations.bind(impl)),
      /** NARROWED to `caps` — the resolution may only shrink the declaration. */
      async convCaps(convId, opts = {}) {
        // lane gmail-reply-known: `listed` = the account's own listing returned this conversation (an adapter that
        // declares `convCapsFromListing` answers it from held facts; the others ignore it)
        const r = (await rawConvCaps(convId, { listed: !!(opts && opts.listed === true) })) || {};
        const declared = Array.isArray(caps.sendAs) ? caps.sendAs : [];
        const asked = Array.isArray(r.sendAs) ? r.sendAs : [];
        const wider = asked.filter((s) => !declared.includes(s));
        if (wider.length) {
          throw new ChannelError('vendor-error', `${kind}.convCaps returned sendAs wider than caps.sendAs (${wider.join(',')}) — a per-conversation resolution may only NARROW`, { retryable: false, detail: { declared, asked } });
        }
        const out = { read: r.read || 'unknown', sendAs: asked, why: r.why || null, at: Number.isFinite(r.at) ? r.at : Date.now() };
        if (r.source === 'listing') out.source = 'listing';   // lane gmail-reply-known: answered from the listing, not asked
        // lane channel-threads (spec §2.5): the two narrowing rows, clamped like `sendAs` — a `true` the static
        // declaration does not allow is the same contract violation ("wider than caps"), never a widened control
        const ct = threadsOf(caps), cr = reactionsOf(caps);
        if (r.threads && typeof r.threads === 'object') {
          if (r.threads.replyInto === true && !ct.replyInto) throw new ChannelError('vendor-error', `${kind}.convCaps returned threads.replyInto wider than caps.threads.replyInto — a per-conversation resolution may only NARROW`, { retryable: false, detail: { declared: ct, asked: r.threads } });
          out.threads = { replyInto: r.threads.replyInto === true, mode: ['topic', 'thread', 'chat'].includes(r.threads.mode) ? r.threads.mode : null, why: r.threads.why || null };
        }
        if (r.reactions && typeof r.reactions === 'object') {
          if ((r.reactions.read === true && cr.read === 'none') || (r.reactions.add === true && !cr.add)) throw new ChannelError('vendor-error', `${kind}.convCaps returned reactions wider than caps.reactions — a per-conversation resolution may only NARROW`, { retryable: false, detail: { declared: cr, asked: r.reactions } });
          out.reactions = { read: r.reactions.read === true, add: r.reactions.add === true, why: r.reactions.why || null };
        }
        // lane lark-upload-preflight (userW inc-muxsy69b-mjg1): CAN A FILE RIDE THE SEND — only an adapter that declared
        // `sendAttachments` may say yes (a yes from one without the row is wider ⇒ refused); the scopes it names are bounded
        if (r.files && typeof r.files === 'object') {
          if (r.files.send === true && !caps.sendAttachments) throw new ChannelError('vendor-error', `${kind}.convCaps returned files.send without caps.sendAttachments — a per-conversation resolution may only NARROW`, { retryable: false, detail: { asked: r.files } });
          out.files = { send: r.files.send === true, why: r.files.why ? String(r.files.why).slice(0, 60) : null, requiredScopes: (Array.isArray(r.files.requiredScopes) ? r.files.requiredScopes : []).filter((x) => typeof x === 'string' && x.length <= 64).slice(0, 8) };
        }
        // design 012 D20: WHO WILL SEE a message sent here — a closed kind, the organizations by NAME (through the name
        // door: peer-written), a member count; anything else is dropped
        if (r.audience && typeof r.audience === 'object' && AUDIENCE_KINDS.includes(r.audience.kind)) {
          const orgs = (Array.isArray(r.audience.orgs) ? r.audience.orgs : []).map((x) => peerName(x, 100)).filter(Boolean).slice(0, 5);
          const n = Number(r.audience.members);
          out.audience = { kind: r.audience.kind, orgs, members: Number.isInteger(n) && n >= 0 && n <= 1e7 ? n : null, title: peerName(r.audience.title, 100) || null };
        }
        return out;
      },
      /** Checks history's own two promises before the caller ever sees it. */
      async history(convId, opts = {}) {
        // ON A SCAN ADAPTER THE SOURCE IS HANDED DOWN, NEVER RE-DERIVED (r3).
        // `scanState()` in src/channel-caps.js is the ONE resolver of which
        // source is carrying a conversation, and an adapter that reads
        // `caps.scanSources[process.platform]` for itself is a SECOND one —
        // the shipped fake did exactly that, two lines under its own comment
        // saying it never would, which is how records were ingested through a
        // lane the resolver had just declared unavailable. So the contract
        // REQUIRES the resolved source as an argument (`opts.source`, one the
        // adapter's own `historyBySource` names) and refuses to page without
        // it, rather than letting an adapter guess and the chip disagree.
        if (caps.receive === 'scan') {
          const src = opts.source;
          if (!SCAN_SOURCES.includes(src) || !(caps.historyBySource && caps.historyBySource[src])) {
            throw new ChannelError('not-supported', `${kind}.history on a scan adapter needs the RESOLVED source handed down (scanState().source — one of ${Object.keys(caps.historyBySource || {}).join('|')}); got ${JSON.stringify(src === undefined ? null : src)}`, { retryable: false, detail: { needs: 'source' } });
          }
        }
        const r = (await rawHistory(convId, opts)) || {};
        const records = Array.isArray(r.records) ? r.records : [];
        const limit = Number(opts.limit);
        if (Number.isFinite(limit) && records.length > limit) {
          throw new ChannelError('vendor-error', `${kind}.history returned ${records.length} records for limit ${limit} — an adapter never returns records the caller did not ask for`, { retryable: false });
        }
        if (typeof r.reachedAnchor !== 'boolean') {
          throw new ChannelError('vendor-error', `${kind}.history must report reachedAnchor as a boolean (the store decides whether the cursor may advance)`, { retryable: false });
        }
        // `changed` (2026-09-26): OTHER conversations the vendor says gained
        // messages (Gmail's history.list names threads) — a HINT the engine
        // turns into "due now", bounded, never records
        const changed = Array.isArray(r.changed) ? r.changed.filter((x) => typeof x === 'string' && x).slice(0, 2000) : undefined;
        return { records, anchor: r.anchor === undefined ? null : r.anchor, reachedAnchor: r.reachedAnchor, complete: r.complete !== false, ...(changed ? { changed } : {}) };
      },
      /** HISTORY ON DEMAND (2026-09-26): at most `limit` records strictly
       *  OLDER than `before` ({at, vendorId}; null = the newest page), plus
       *  whether the vendor holds nothing older (`exhausted`). Advances
       *  nothing — the caller prepends them to the log. */
      async older(convId, opts = {}) {
        const r = (await rawOlder(convId, opts)) || {};
        const records = Array.isArray(r.records) ? r.records : [];
        const limit = Number(opts.limit);
        if (Number.isFinite(limit) && records.length > limit) {
          throw new ChannelError('vendor-error', `${kind}.older returned ${records.length} records for limit ${limit} — an adapter never returns records the caller did not ask for`, { retryable: false });
        }
        return { records, exhausted: r.exhausted === true };
      },
      /** THE SEND — gated like every method, and (2026-09-28) handed only a PLACEMENT the row declares: `placement`
       *  absent ⇒ the pre-enum reading (`inThread` ⇒ thread, a `replyTo` ⇒ quote, else chat); an undeclared one, a
       *  reply placement without the message it answers or `chat` with one is `not-supported` before the module
       *  runs. A thread placement also carries `inThread: true` (the alias older modules read). */
      send: (() => {
        const raw = gated('send', impl.send && impl.send.bind(impl));
        if (!METHOD_GATES.send(caps)) return raw;   // read-only: `send-not-available`, said by the gate
        return async (convId, opts = {}) => {
          const o = opts && typeof opts === 'object' ? opts : {};
          if (Array.isArray(o.attachments) && o.attachments.length && !caps.sendAttachments) throw new ChannelError('not-supported', `${kind}.send: attachments are not declared by caps.sendAttachments`, { retryable: false, detail: { why: 'attachments-not-offered' } });
          const placement = o.placement === undefined || o.placement === null ? (o.inThread === true ? 'thread' : o.replyTo ? 'quote' : 'chat') : o.placement;
          const offered = placementsOf(caps);
          if (!offered.includes(placement)) throw new ChannelError('not-supported', `${kind}.send: placement ${JSON.stringify(placement)} is not declared by caps.threads.placements (${offered.join('|') || 'none'})`, { retryable: false, detail: { placement, offered } });
          if ((placement === 'chat') === !!o.replyTo) throw new ChannelError('not-supported', `${kind}.send: placement '${placement}' ${placement === 'chat' ? 'answers no message (replyTo given)' : 'names the message it answers (replyTo missing)'}`, { retryable: false, detail: { placement } });
          const { inThread: _alias, ...rest } = o;
          return raw(convId, { ...rest, placement, ...(isThreadPlacement(placement) ? { inThread: true } : {}) });
        };
      })(),
      compose: (() => {
        const raw = gated('compose', impl.compose && impl.compose.bind(impl));
        // design 005 §2.B: a new message with attachments needs the row too
        return async (o = {}) => {
          if (o && Array.isArray(o.attachments) && o.attachments.length && !caps.sendAttachments) throw new ChannelError('not-supported', `${kind}.compose: attachments are not declared by caps.sendAttachments`, { retryable: false, detail: { why: 'attachments-not-offered' } });
          return raw(o);
        };
      })(),
      /** THE ACCOUNT's send identity for a NEW conversation, NARROWED to
       *  `caps.sendAs` exactly like `convCaps` (a resolution may only shrink
       *  the declaration). */
      async composeCaps() {
        const r = (await gated('composeCaps', impl.composeCaps && impl.composeCaps.bind(impl))()) || {};
        const declared = Array.isArray(caps.sendAs) ? caps.sendAs : [];
        const asked = Array.isArray(r.sendAs) ? r.sendAs : [];
        const wider = asked.filter((x) => !declared.includes(x));
        if (wider.length) throw new ChannelError('vendor-error', `${kind}.composeCaps returned sendAs wider than caps.sendAs (${wider.join(',')})`, { retryable: false, detail: { declared, asked } });
        return { sendAs: asked, why: r.why || null, at: Number.isFinite(r.at) ? r.at : Date.now() };
      },
      reconcile: gated('reconcile', impl.reconcile && impl.reconcile.bind(impl)),
      replyEnvelope: gated('replyEnvelope', impl.replyEnvelope && impl.replyEnvelope.bind(impl)),
      /** design 012: a proposal's mentions and notify line, decided ONCE — bounded here: the names through the name door
       *  (≤ 50 each list), every mention's id in the id alphabet, the wire text a string (the send re-derives it). */
      async prepareSend(convId, opts = {}) {
        const r = (await gated('prepareSend', impl.prepareSend && impl.prepareSend.bind(impl))(convId, opts)) || {};
        const names = (v) => (Array.isArray(v) ? v : []).map((x) => peerName(x, 100)).filter(Boolean).slice(0, 50);
        const mentions = (Array.isArray(r.mentions) ? r.mentions : []).filter((x) => x && typeof x.id === 'string' && /^[A-Z0-9][A-Z0-9_]{1,40}$/.test(x.id) && peerName(x.name, 100)).slice(0, 50).map((x) => ({ name: peerName(x.name, 100), id: x.id }));
        return { text: typeof r.text === 'string' ? r.text : '', notifies: names(r.notifies), unresolved: names(r.unresolved), plain: names(r.plain), mentions, tooLong: r.tooLong === true, sendMax: Number.isInteger(r.sendMax) && r.sendMax > 0 ? r.sendMax : null, at: Number.isFinite(r.at) ? r.at : Date.now() };
      },
      /** lane message-facts (B-f066): a stored thread's facts — `{facts: {[vendorId]: [...]}}`, each list through the ONE
       *  validator and held to `caps.facts` (an undeclared kind is dropped by name), ≤ 500 messages, ids bounded. */
      async factsOf(convId) {
        const r = (await gated('factsOf', impl.factsOf && impl.factsOf.bind(impl))(convId)) || {};
        const declared = new Set(Array.isArray(caps.facts) ? caps.facts : []);
        const out = {};
        const src = r.facts && typeof r.facts === 'object' && !Array.isArray(r.facts) ? r.facts : {};
        for (const [vid, list] of Object.entries(src).slice(0, 500)) {
          if (!vid || vid.length > 512 || /[\u0000-\u001f\u007f]/.test(vid)) continue;
          const v = validateFacts(Array.isArray(list) ? list.filter((f) => f && declared.has(f.k)) : []);
          out[vid] = v.ok ? v.facts : [];
        }
        return { facts: out };
      },
      fetchAttachment: gated('fetchAttachment', impl.fetchAttachment && impl.fetchAttachment.bind(impl)),
      /** lane channel-rich (D2): a message BODY the adapter read while normalizing (a mail's text/html part),
       *  handed to the engine ONCE (`{data: Buffer, mime}` | null) — synchronous, no vendor call, never throws. */
      heldAttachment: typeof impl.heldAttachment === 'function' ? (messageId, attachmentId) => {
        try { const h = impl.heldAttachment(messageId, attachmentId); return h && Buffer.isBuffer(h.data) ? { data: h.data, mime: typeof h.mime === 'string' ? h.mime : null, name: typeof h.name === 'string' ? h.name : null } : null; } catch { return null; }
      } : null,
      scanHost: gated('scanHost', impl.scanHost && impl.scanHost.bind(impl)),
      // lane channel-threads: every one gated on its capability row; an undeclared one throws `not-supported`
      /** ONE thread's replies, newest-first to its anchor (`{records, anchor, reachedAnchor, complete}` like
       *  history's promises: never more than asked, reachedAnchor honest, advances nothing). */
      async threadHistory(convId, threadKey, opts = {}) {
        const r = (await gated('threadHistory', impl.threadHistory && impl.threadHistory.bind(impl))(convId, threadKey, opts)) || {};
        const records = Array.isArray(r.records) ? r.records : [];
        const limit = Number(opts.limit);
        if (Number.isFinite(limit) && records.length > limit) throw new ChannelError('vendor-error', `${kind}.threadHistory returned ${records.length} records for limit ${limit} — an adapter never returns records the caller did not ask for`, { retryable: false });
        if (typeof r.reachedAnchor !== 'boolean') throw new ChannelError('vendor-error', `${kind}.threadHistory must report reachedAnchor as a boolean`, { retryable: false });
        // `foreign` (verify r1): how many of the vendor's items named ANOTHER conversation and were dropped by the adapter
        // `bounded` (verify r3): the walk stopped at the adapter's own count bound while the vendor held more
        return { records, anchor: r.anchor === undefined ? null : r.anchor, reachedAnchor: r.reachedAnchor, complete: r.complete !== false, foreign: Math.max(0, Math.floor(Number(r.foreign) || 0)), ...(r.bounded === true ? { bounded: true } : {}) };
      },
      /** lane lark-threads (A2): the chat's newest page, no anchor stop (`{records}`, never more than asked, every record
       *  of THIS conversation — one stamped with another is dropped and counted `foreign`). */
      async recentRoots(convId, opts = {}) {
        const r = (await gated('recentRoots', impl.recentRoots && impl.recentRoots.bind(impl))(convId, opts)) || {};
        const all = Array.isArray(r.records) ? r.records : [];
        const limit = Number(opts.limit) || 50;
        if (all.length > limit) throw new ChannelError('vendor-error', `${kind}.recentRoots returned ${all.length} records for limit ${limit} — an adapter never returns records the caller did not ask for`, { retryable: false });
        const records = all.filter((x) => x && (x.convId === undefined || x.convId === null || String(x.convId) === String(convId)));
        return { records, foreign: all.length - records.length };
      },
      /** lane lark-threads (A4): one message by its id — the kind from the CLOSED set, a record only for a thread reply of
       *  THIS conversation, the root's patch only with a bounded id. */
      async messageById(convId, opts = {}) {
        const r = (await gated('messageById', impl.messageById && impl.messageById.bind(impl))(convId, opts)) || {};
        const k = BY_ID_KINDS.includes(r.kind) ? r.kind : 'absent';
        const idOk = (v) => typeof v === 'string' && v.length > 0 && v.length <= 512 && !/[\u0000-\u001f\u007f]/.test(v);
        const record = k === 'reply' && r.record && typeof r.record === 'object' && String(r.record.convId) === String(convId) && String(r.record.vendorId || '') === String(opts.messageId || '') ? r.record : null;
        const rp = r.rootPatch && typeof r.rootPatch === 'object' && idOk(r.rootPatch.vendorId) && idOk(r.rootPatch.threadKey) ? { vendorId: r.rootPatch.vendorId, threadKey: r.rootPatch.threadKey } : null;
        return { kind: k === 'reply' && !record ? 'foreign' : k, record, rootPatch: (k === 'reply' || k === 'root') ? rp : null, threadKey: idOk(r.threadKey) ? r.threadKey : null };
      },
      reactions: gated('reactions', impl.reactions && impl.reactions.bind(impl)),
      react: gated('react', impl.react && impl.react.bind(impl)),
      unreact: gated('unreact', impl.unreact && impl.unreact.bind(impl)),
      emojiImage: gated('emojiImage', impl.emojiImage && impl.emojiImage.bind(impl)),
      avatarImage: gated('avatarImage', impl.avatarImage && impl.avatarImage.bind(impl)),
      reactionSet: gated('reactionSet', impl.reactionSet && impl.reactionSet.bind(impl)),
      /**
       * THE CHANGE FEED'S PAGE (lane lark-search-poll): ONE vendor page of `{from, to, pageToken, chatType, pageSize}`.
       * Bound before use: more hits than the declared page size ⇒ a typed `vendor-error` (the page contract); every hit
       * through the CLOSED field list (a snippet / any extra field is stripped and counted — `stripped`), every id
       * bounded; the continuation token bounded; `more` only with a token to continue by.
       */
      async changes(opts = {}) {
        const r = (await gated('changes', impl.changes && impl.changes.bind(impl))(opts)) || {};
        // lane channel-feed-authority: an AUTHORITATIVE feed's answer is `{changed: [conv id], conversations: [listed
        // conversation to birth], mustWalk}` — bounded the same way: ids are strings, the lists capped, nothing else kept
        if (caps.changeFeed && caps.changeFeed.authority === 'authoritative') {
          const ids = (Array.isArray(r.changed) ? r.changed : []).filter((x) => (typeof x === 'string' || typeof x === 'number') && String(x).length > 0 && String(x).length <= 256).map(String);
          if (ids.length > 5000) throw new ChannelError('vendor-error', `${kind}.changes named ${ids.length} conversations — more than 5000 is a reseed (mustWalk), never a list`, { retryable: false, detail: { contract: 'page-size' } });
          const convs = (Array.isArray(r.conversations) ? r.conversations : []).filter((c) => c && typeof c === 'object' && typeof c.id === 'string' && c.id).slice(0, 100);
          // lane gmail-feed-gap: `pages` = the history pages this walk read (a gap's catch-up names its count) — bounded
          const pages = Number.isInteger(r.pages) && r.pages > 0 ? Math.min(r.pages, 1000) : 1;
          return { changed: ids, conversations: convs, mustWalk: r.mustWalk === true, pages };
        }
        const size = Number(caps.changeFeed && caps.changeFeed.pageSize) || 30;
        const raw = Array.isArray(r.hits) ? r.hits : [];
        if (raw.length > size) throw new ChannelError('vendor-error', `${kind}.changes returned ${raw.length} hits for a page size of ${size} — an adapter never returns more than a page`, { retryable: false, detail: { contract: 'page-size' } });
        const t = typeof deps.now === 'function' ? deps.now() : Date.now();
        let malformed = Math.max(0, Math.floor(Number(r.malformed) || 0)), stripped = 0;
        const hits = [];
        for (const h of raw) {
          const c = Feed.cleanHit(h, { now: t });
          if (!c) { malformed++; continue; }
          if (h && typeof h === 'object' && Object.keys(h).some((k) => !Feed.HIT_FIELDS.includes(k))) stripped++;
          hits.push(c);
        }
        const tok = typeof r.pageToken === 'string' && r.pageToken && r.pageToken.length <= PAGE_TOKEN_MAX && !/[\u0000-\u001f]/.test(r.pageToken) ? r.pageToken : null;
        const total = Number.isFinite(Number(r.total)) && r.total !== null && r.total !== '' ? Math.max(0, Number(r.total)) : null;
        const fieldNames = Array.isArray(r.fieldNames) ? r.fieldNames.filter((x) => typeof x === 'string' && /^[A-Za-z0-9_.]{1,64}$/.test(x)).slice(0, 40) : undefined;
        // lane lark-p2p: WHAT was unreadable — field NAMES only, bounded (≤ 3 lists × ≤ 6 names in the field alphabet)
        const malformedFields = Feed.mergeFieldLists([], Array.isArray(r.malformedFields) ? r.malformedFields.slice(0, 16) : []);
        return { hits, more: r.more === true && tok !== null, pageToken: tok, total, malformed, malformedFields, stripped, requests: Math.max(1, Math.floor(Number(r.requests) || 1)), ...(fieldNames ? { fieldNames } : {}) };
      },
      /**
       * THE VENDOR'S OWN SEARCH, ONE PAGE (design 010): bounded before the engine sees it — more hits than the row's
       * page size ⇒ the typed page-contract refusal; every hit through the CLOSED field list (anything else stripped and
       * counted), ids bounded, the instant a number, the snippet through the name door again (≤ SR.SNIPPET_MAX — an
       * adapter's reader is not trusted alone); the continuation token bounded; `facts` = the adapter's shape-only
       * measurement (names, counts, booleans — never a value), passed through bounded.
       */
      async search(opts = {}) {
        const r = (await gated('search', impl.search && impl.search.bind(impl))(opts)) || {};
        const row = searchRowOf(caps) || {};
        const size = Number(row.pageSize) || 30;
        const raw = Array.isArray(r.hits) ? r.hits : [];
        if (raw.length > size) throw new ChannelError('vendor-error', `${kind}.search returned ${raw.length} hits for a page size of ${size} — an adapter never returns more than a page`, { retryable: false, detail: { contract: 'page-size' } });
        const idOk = (v) => (typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v))) && String(v).length > 0 && String(v).length <= 512 && !/[\u0000-\u001f\u007f]/.test(String(v));
        let stripped = 0, malformed = 0;
        const hits = [];
        for (const h of raw) {
          if (!h || typeof h !== 'object' || !idOk(h.convId) || !idOk(h.vendorId) || !(Number(h.at) > 0)) { malformed++; continue; }
          if (Object.keys(h).some((k) => !SEARCH_HIT_FIELDS.includes(k))) stripped++;
          hits.push({ convId: String(h.convId), vendorId: String(h.vendorId), at: Number(h.at), fromId: idOk(h.fromId) ? String(h.fromId) : null, threadKey: idOk(h.threadKey) ? String(h.threadKey) : null, snippet: typeof h.snippet === 'string' ? peerName(h.snippet, SR.SNIPPET_MAX) : null });
        }
        const next = typeof r.next === 'string' && r.next && r.next.length <= PAGE_TOKEN_MAX && !/[\u0000-\u001f]/.test(r.next) ? r.next : null;
        const f = r.facts && typeof r.facts === 'object' ? r.facts : null;
        const facts = f ? { shape: f.shape && typeof f.shape === 'object' ? { form: String(f.shape.form || 'absent').slice(0, 16), keys: Array.isArray(f.shape.keys) ? f.shape.keys.filter((k) => typeof k === 'string' && /^[A-Za-z0-9_.]{1,64}$/.test(k)).slice(0, 12) : [], length: Math.max(0, Math.floor(Number(f.shape.length) || 0)), markup: f.shape.markup === true, entities: f.shape.entities === true } : null, holding: Math.max(0, Math.floor(Number(f.holding) || 0)), of: Math.max(0, Math.floor(Number(f.of) || 0)) } : null;
        return { hits, next, stripped, malformed: malformed + Math.max(0, Math.floor(Number(r.malformed) || 0)), ...(facts ? { facts } : {}) };
      },
      /** A HIT IN CONTEXT (design 010): ≤ SR.AROUND_MAX records of THAT conversation, never stored by the caller. */
      async around(convId, opts = {}) {
        const r = (await gated('around', impl.around && impl.around.bind(impl))(convId, opts)) || {};
        const records = (Array.isArray(r.records) ? r.records : []).filter((x) => x && typeof x === 'object' && String(x.convId) === String(convId));
        if (records.length > SR.AROUND_MAX) throw new ChannelError('vendor-error', `${kind}.around returned ${records.length} records — the bound is ${SR.AROUND_MAX}`, { retryable: false, detail: { contract: 'around-size' } });
        const f = r.facts && typeof r.facts === 'object' ? r.facts : null;
        return { records, requests: Math.max(1, Math.floor(Number(r.requests) || 1)), ...(f ? { facts: { before: Math.max(0, Math.floor(Number(f.before) || 0)), after: Math.max(0, Math.floor(Number(f.after) || 0)), target: f.target === true } } : {}) };
      },
      /** A conversation the feed found, NAMED (`{title|null, kind|null, peers:[{id, name}]}`, every string bounded). */
      async describe(convId, opts = {}) {
        const r = (await gated('describe', impl.describe && impl.describe.bind(impl))(convId, opts)) || {};
        // verify r1: every NAME through `peerName` — bounded, bidi / invisible characters removed, frame-inert (the
        // peerText door); a name with nothing visible left is no name (the client words "Single chat")
        const title = peerName(r.title, TITLE_MAX);
        const kind = r.kind === 'dm' || r.kind === 'group' ? r.kind : null;
        const peers = (Array.isArray(r.peers) ? r.peers : []).filter((x) => x && Feed.idOf(x.id)).slice(0, 4).map((x) => ({ id: String(x.id), name: peerName(x.name, TITLE_MAX) || '' }));
        return { title, kind, peers, requests: Math.max(0, Math.floor(Number(r.requests) || 0)) };
      },
      live: caps.receive === 'push' && impl.live ? impl.live : null,
      /** The ACCOUNT's own user id as its credential records it (a reaction's `mine` is judged against it at fold
       *  time — never stored); null when the adapter cannot say. Never throws. */
      selfId: () => { try { return typeof impl.selfId === 'function' ? (impl.selfId() || null) : null; } catch { return null; } },
      /** lane lark-threads (B4): the ACCOUNT's own organization (a tenant key) — an author of another one is EXTERNAL;
       *  null when the adapter cannot say. Never throws, never a vendor call. */
      /** lane channels-list-polish: the account's own id as a RESOLVED fact — one paced vendor read when the sign-in never
       *  named it (Lark's user_info on the user token), remembered; null when it could not be told. */
      resolveSelf: typeof impl.resolveSelf === 'function' ? async () => { const v = await impl.resolveSelf(); return typeof v === 'string' && v && v.length <= 128 ? v : null; } : null,
      /** …and the people warm-up: the ids a conversation's authors carry, looked up within the adapter's own bounds. */
      warmPeople: typeof impl.warmPeople === 'function' ? (ids) => impl.warmPeople((Array.isArray(ids) ? ids : []).slice(0, 200).map(String)) : null,
      selfTenant: () => { try { const v = typeof impl.selfTenant === 'function' ? impl.selfTenant() : null; return typeof v === 'string' && v && v.length <= 64 ? v : null; } catch { return null; } },
    };
  }

  return { register, vendor, vendors, get, has, list, capsOf, create, validateCaps, validateMethods, validateApi };
}

/** lane dc-channels-consent: THE CONSENT ROW — how a vendor's sign-in comes back, declared by its adapter MODULE
 *  (`consent`, beside `API_ROW`). The engine keeps ONE consent machine (the per-boot state signer, the relay setting's
 *  reader, the landing route's dispatch on `:kind`'s row) and names no vendor:
 *   · mode            — the oauth-loopback mode its sign-ins use: one of CONSENT_MODES, or a list of them
 *   · landing         — null, or {stateVerdict(state, {sign, now, ttlMs}) → {ok, why, parts: {flowId}}, landingHtml(r)}:
 *                       the vendor sends the browser to `GET /api/channels/oauth/cb/<kind>` (needs mode 'public')
 *   · relayUrlSetting — (optional, with a landing) {key, fallback}: the server setting `channels.<key>` naming its relay
 *                       page (the settings schema's row), and its default
 *   · callbackUrl     — (mode 'fixed') the registered http://127.0.0.1:<port>/… callback the loopback binds */
const CONSENT_MODES = Object.freeze(['ephemeral', 'fixed', 'paste', 'public']);
const CONSENT_ROW_KEYS = Object.freeze(['mode', 'landing', 'relayUrlSetting', 'callbackUrl']);
function validateConsent(kind, row) {
  const bad = (msg) => { throw new Error(`channel adapter '${kind}': consent.${msg}`); };
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`channel adapter '${kind}': consent must be the consent row {${CONSENT_ROW_KEYS.join(', ')}}`);
  for (const k of Object.keys(row)) if (!CONSENT_ROW_KEYS.includes(k)) bad(`${k} is not a key of the consent row (${CONSENT_ROW_KEYS.join(', ')})`);
  const modes = [].concat(row.mode);
  if (!modes.length || !modes.every((m) => CONSENT_MODES.includes(m)) || new Set(modes).size !== modes.length) bad(`mode must be one of ${CONSENT_MODES.join('|')} or a list of them (got ${JSON.stringify(row.mode)})`);
  if (row.landing !== null && row.landing !== undefined) {
    if (typeof row.landing !== 'object' || typeof row.landing.stateVerdict !== 'function' || typeof row.landing.landingHtml !== 'function') bad('landing must be null or {stateVerdict(state, {sign, now, ttlMs}), landingHtml(r)}');
    if (!modes.includes('public')) bad('landing needs mode \'public\' (a browser lands on the instance only after a public consent)');
  }
  if (row.relayUrlSetting !== undefined) {
    const s = row.relayUrlSetting;
    if (!row.landing) bad('relayUrlSetting needs a landing (the relay page sends the browser to it)');
    if (!s || typeof s.key !== 'string' || !/^[a-zA-Z][a-zA-Z0-9]{0,63}$/.test(s.key) || typeof s.fallback !== 'string' || !httpsUrl(s.fallback)) bad('relayUrlSetting must be {key: the name under channels.*, fallback: an https URL}');
  }
  if (modes.includes('fixed')) {
    let u = null;
    try { u = new URL(String(row.callbackUrl)); } catch { u = null; }
    if (!u || u.protocol !== 'http:' || u.hostname !== '127.0.0.1' || !(Number(u.port) > 0)) bad('callbackUrl must be the registered http://127.0.0.1:<port>/… callback of a fixed consent');
  } else if (row.callbackUrl !== undefined) bad('callbackUrl belongs to mode \'fixed\' only');
  return row;
}

module.exports = {
  createChannelRegistry, ChannelError, validateCaps, validateMethods, validateApi, API_ROW_KEYS,
  CHANNEL_ERROR_CODES, RETENTION_MODES, AUDIENCE_KINDS, RECEIVE_MODES, SCAN_SOURCES, HISTORY_MODES, SEND_IDENTITIES, IDENTITY_MARKING, TOS_RISK, METHOD_GATES, OLDER_HISTORY, BUDGET_UNITS, PACE_COSTS, RENDER_MODES, GLYPHS, TITLE_FORMS, FEED_METHODS, BY_ID_KINDS,
  SEARCH_METHODS, SEARCH_HIT_FIELDS, searchRowOf,
  peerName,
  THREAD_READ, THREAD_LISTING, REACTION_READ, REACTION_REMOVE, REACTION_VOCABULARY, REACTION_CUSTOM, NO_THREADS, NO_REACTIONS, THREAD_REACTION_METHODS, threadsOf, reactionsOf,
  retryAfterSeconds, sentSecrets, withoutSent, bearerOf, SENT_SECRET_FIELDS,
  // lane dc-channels-consent: the consent row's ONE schema
  validateConsent, CONSENT_MODES, CONSENT_ROW_KEYS,
  validateVendor,   // lane dc-channels-manifest
};
