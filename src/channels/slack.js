'use strict';
/**
 * THE SLACK ADAPTER (design 012, lane S1 slack-core — B-ff09: Slack as the fourth Channels adapter). ORCH tier, the
 * §4 contract (src/channels/index.js), the same shape as lark.js and gmail.js.
 *
 * ONE PERSON, ONE INTERNAL APP, ONE PASTED TOKEN (F1, F2, D1, D2). Each person creates their own internal Slack app
 * from the link VibeSpace builds (src/channels/slack-manifest.js), installs it, and pastes the User OAuth Token
 * (`xoxp-…`) back: oauth-loopback's `paste` mode carries the flow — `auth.begin()` answers `{mode:'paste',
 * consentUrl: <the manifest link>}`, `auth.finish(flowId, pasted)` judges the paste's SHAPE (a bot / app token is
 * refused by name, the flow stays open for the right one) and the exchange is ONE `auth.test` with it: who it is
 * (`T…/U…` — the identity key `userId`, design D11), the workspace, and the scopes from the `x-oauth-scopes` header.
 * The token never expires (rotation off in the manifest); it is written only through the engine's sealed token store,
 * never logged, echoed or carried in an error (`withoutSent` scrubs the Bearer by value from every vendor answer).
 *
 * POLL ONLY (S1). `users.conversations` lists every conversation the person is in (channels, private channels, group
 * DMs, DMs — an app's DM flagged `app`, never a "Direct" tag); `conversations.history` pages newest-first to the
 * stored anchor (`oldest`); `conversations.replies` walks a thread; reactions are a per-message list
 * (`reactions.get` — `read:'list'`, design F4: an `inline` declaration would drop them all) answered from the last
 * page's own `reactions[]` when it is fresh. Every request goes token → THE PER-METHOD BUCKET (slack-limits.js, D3:
 * Slack meters each method × workspace × app on its own) → the engine's pace → the meter → the request; a spent
 * method is the typed `rate-limited` with `retryAfterSec`, a 429 honours `Retry-After` for that method alone.
 *
 * SENDING AS THE PERSON, ONLY THROUGH THE OUTBOX (D8, D20, D21): `caps.policyModes: ['review']` — "send directly" is
 * never offered (src/channel-policy.js clamps a stored `direct` to review, fail closed); `caps.prepareSend` — when a
 * proposal is made, `prepareSend(convId, {text})` resolves each `@Name` against the conversation's members ONCE
 * (two people answering one name = `unresolved`, the proposal refused by name; no one = words that notify nobody)
 * and says who will be notified; that decision is stored on the proposal, shown on the card and handed back verbatim
 * to `send` (a member renamed meanwhile changes nothing). `convCaps.audience` says who will SEE it (a DM, a private
 * channel, the whole workspace, people of another organization). `idempotency: 'none'`: Slack has no idempotency
 * key, so a lost answer stays `unknown` and the card says to check Slack — never resent.
 *
 * WHAT THE FIRST REAL INSTALL ANSWERS (the lane cannot call Slack): the adapter writes each probe into the account's
 * setup report BY NAME (`state.setup.probes`) the first time it can see it — `lastRead` (does `conversations.info`
 * carry `last_read`), `sendMarker` (does a sent message carry an app marker), `userOnlyManifest` (the user-scope-only
 * manifest was accepted — a pasted token proves it), `scopes` (the header), `planLimited` (`is_limited`),
 * `historyTier` (a page asked for 50+ that answers more than 15 — the internal-app tier is real).
 *
 * EVERY OUTBOUND HOST IS DECLARED in `EGRESS`: the Web API on slack.com and the files on files.slack.com — a file URL
 * on any other host is refused BEFORE the token could be sent there.
 */
const { makeRecord, makeConversation, peerName, validateFacts } = require('../channel-record.js');
const { ChannelError, retryAfterSeconds, sentSecrets, withoutSent } = require('./index.js');
const { CHANNEL_SETTINGS, budgetOf, paceOf } = require('../channel-settings.js');
const Text = require('./slack-text.js');
const Limits = require('./slack-limits.js');
const Manifest = require('./slack-manifest.js');
const Words = require('./slack-words.js');

const KIND = 'slack';
const LABEL = 'Slack';
/** The integration row this adapter consumes — a `signin:'paste'` row: no client, nothing to resolve (each person's
 *  own app). The adapter never asks `resolveIntegration('slack')` for a credential — there is none. */
const INTEGRATION = 'slack';
const API = 'https://slack.com/api/';
const FILES_ORIGIN = 'https://files.slack.com/';
const EGRESS = Object.freeze(['slack.com', 'files.slack.com']);
const i18nKey = (s) => s;
/** Per-record OPTIONS: archived channels are skipped by default (`exclude_archived`); the owner may list them. */
const OPTIONS = Object.freeze([
  { key: 'archived', label: i18nKey('Archived channels'), default: 'skip', choices: Object.freeze(['skip', 'list']), rebuild: false,
    choiceLabels: Object.freeze({ skip: i18nKey('Skip archived channels'), list: i18nKey('Also list archived channels (read once, never polled)') }),
    help: i18nKey('Archived channels can be read but not written to. Skipping them keeps the first read short.') },
]);
function optionOf(record, key) {
  const d = OPTIONS.find((o) => o.key === key);
  const o = (record && record.options) || {};
  const v = o[key];
  return v === undefined || v === null || v === '' ? (d ? d.default : undefined) : v;
}
const REQUEST_TIMEOUT_MS = 20000;
const FIRST_INGEST_MAX = 200;
const WALK_TTL_MS = 5 * 60 * 1000;
const PAGE_MAX = 200;                     // a history / replies page asked of Slack (Tier 3 allows up to 999)
const PEOPLE_TTL_MS = 6 * 3600e3;
const PEOPLE_MAX = 5000;
const PEOPLE_LOOKUPS_PER_CALL = 10;       // users.info asked per page for authors the cache does not hold (Tier 4)
const PEOPLE_LIST_PAGES = 5;              // users.list pages read per 6 h (Tier 2; 200 people a page)
const MEMBERS_TTL_MS = 30 * 60 * 1000;
const MEMBERS_MAX = 1000;
const TEAMS_MAX = 50;
const RX_CACHE_TTL_MS = 60 * 1000;
const RX_CACHE_MAX = 2000;
const ATTACH_MAX_BYTES = 100 * 1024 * 1024;
const SEND_GAP_WAIT_MS = 1100;   // one wait for Slack's per-conversation second, then the bucket decides
const TS_RE = /^\d{9,11}\.\d{1,6}$/;
const ID_RE = /^[A-Z0-9][A-Z0-9_]{1,40}$/;
const tsMs = (ts) => (TS_RE.test(String(ts || '')) ? Math.round(Number(ts) * 1000) : 0);
const msTs = (ms) => (Number(ms) > 0 ? (Number(ms) / 1000).toFixed(6) : null);

/** THE CAPABILITY ROW (design §4 Lane S1). */
const caps = Object.freeze({
  receive: 'poll',
  pollInterval: { hot: 30, cold: 300, floor: 10 },   // D5: no Slack-only cadence — the tiers, the floor and the budget ladder bound it
  scanSources: null,
  scanLatency: null,
  history: 'page',
  historyBySource: null,
  listConversations: true,
  sendAs: ['user'],                 // AS THE PERSON (the user token) — convCaps narrows per conversation
  sendAttachments: null,
  sendAttachmentsWhy: 'Sending files to Slack comes in a later step (Slack takes a file in three requests); for now an agent sends text',
  identityMarking: 'unknown',       // the probe `sendMarker`: whether a message sent with the person's token carries an app marker
  identityMarkingWhere: null,
  identityMarkingText: null,
  tosRisk: 'none',
  idempotency: 'none',              // D8: Slack has no idempotency key — a lost answer stays unknown, never resent
  threading: 'thread-id',
  editSent: false,
  readReceipts: false,
  render: 'blocks',
  attachments: 'fetch',
  olderHistory: 'page',
  budget: { unit: 'request', metered: true, ...budgetOf(CHANNEL_SETTINGS.slack) },
  pace: { ...paceOf(CHANNEL_SETTINGS.slack), cost: { fetch: 1, discover: 1 } },
  vendorName: i18nKey('Slack'),
  facts: Object.freeze(['via', 'edited']),
  // F3: Slack's thread object (`thread_ts`), replies listed separately (`conversations.replies`), a reply in the
  // thread or in the thread AND the channel (`reply_broadcast`); the norm for answering a message is its thread
  threads: Object.freeze({ read: 'vendor', replyInto: true, listing: 'separate', placements: Object.freeze(['chat', 'thread', 'thread+chat']), rootReply: 'thread' }),
  // F4 / D7: a per-message list; added / removed as the person (own only); named emoji; custom emoji pictures are a
  // later step (their host is not in this adapter's egress yet) — drawn as `:name:`
  reactions: Object.freeze({ read: 'list', add: true, remove: 'own', vocabulary: 'names', custom: 'none', perMessageMax: null }),
  policyModes: Object.freeze(['review']),
  prepareSend: true,
  retention: 'purge-on-remove',
});

const READ_SCOPES = Manifest.READ_SCOPES;
const SEND_SCOPES = Manifest.SEND_SCOPES;
const has = (scopes, s) => Array.isArray(scopes) && scopes.includes(s);
/** The send verdict from the HELD scopes alone (PURE — the engine re-judges every conversation on a credential change). */
function sendCapsOf(scopes) {
  const send = SEND_SCOPES.every((s) => has(scopes, s));
  return { sendAs: send ? ['user'] : [], why: send ? null : 'send-scope-not-granted' };
}
function capsOfScopes(scopes) {
  const sc = Array.isArray(scopes) ? scopes : [];
  const read = has(sc, 'reactions:read'), add = has(sc, 'reactions:write');
  return { ...sendCapsOf(sc), reactions: { read, add, why: read && add ? null : 'reactions-scope-not-granted' } };
}
function vendorNameOf() { return i18nKey('Slack'); }

/** ONE Web API round trip: POST form → `{body, scopes}`. Typed failures (slack-words.js); the Bearer scrubbed by value
 *  from every refusal's words; a 429's `Retry-After` rides `detail.retryAfterSec`. */
async function callSlack(fetchFn, method, params, { token, signal = null } = {}) {
  const what = `slack ${method}`;
  const headers = { Authorization: `Bearer ${token}` };
  const sent = sentSecrets({ headers });
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) if (v !== undefined && v !== null && v !== '') form.set(k, String(v));
  let r;
  try {
    r = await fetchFn(API + method, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8', ...headers },
      body: form.toString(),
      signal: signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (e) {
    throw new ChannelError('transport', withoutSent(`${what}: ${(e && e.message) || e}`, sent), { retryable: true, detail: { method, lost: method === 'chat.postMessage' } });
  }
  const hdr = (k) => { try { return r.headers && typeof r.headers.get === 'function' ? r.headers.get(k) : null; } catch { return null; } };
  const sc = hdr('x-oauth-scopes');
  if (r.status === 429) {
    const ra = retryAfterSeconds(r.headers);
    throw new ChannelError('rate-limited', `${what}: Slack answered 429 (rate limited)${ra ? ` — Retry-After ${ra} s` : ''}`, { retryable: true, detail: { method, error: 'ratelimited', why: 'rate-limited', status: 429, ...(Number.isFinite(ra) && ra > 0 ? { retryAfterSec: ra } : {}) } });
  }
  let body = null;
  try { body = await r.json(); } catch { body = null; }
  if (!body || typeof body !== 'object') {
    const f = Words.failureOf(null, { status: r.status || 500 });
    throw new ChannelError(f.code, `${what}: HTTP ${r.status} without a JSON answer`, { retryable: f.retryable, detail: { method, status: r.status, why: f.why } });
  }
  if (body.ok !== true) {
    const clean = withoutSent(body, sent);
    const f = Words.failureOf(clean.error, { status: r.status });
    const needed = f.error === 'missing_scope' ? Words.neededScopes(clean) : [];
    throw new ChannelError(f.code, `${what}: ${f.error || 'refused'}${needed.length ? ` (needs ${needed.join(', ')})` : ''}`, { retryable: f.retryable, detail: { method, error: f.error, why: f.why, status: r.status, ...(needed.length ? { requiredScopes: needed } : {}) } });
  }
  return { body, scopes: sc ? Manifest.scopesOfHeader(sc) : null };
}

/** The bounded name of a Slack person object. */
function personOf(u) {
  const p = (u && u.profile) || {};
  const display = peerName(p.display_name, 200) || '';
  const real = peerName(p.real_name || u.real_name, 200) || '';
  const handle = peerName(u && u.name, 200) || '';
  return { name: display || real || handle, display, real, handle, isBot: !!(u && (u.is_bot || u.id === 'USLACKBOT')), deleted: !!(u && u.deleted), team: u && typeof u.team_id === 'string' ? u.team_id.slice(0, 40) : null };
}

/** The facts a message carries that S1 can read (D25): the app it came through, an edit. */
function factsOfMessage(m, appName) {
  const out = [];
  const via = m.bot_id || m.app_id;
  if (via) out.push({ k: 'via', v: { id: String(via).slice(0, 64), name: String(appName || '') } });
  const ed = m.edited && tsMs(m.edited.ts);
  if (ed) out.push({ k: 'edited', v: ed });
  const v = validateFacts(out);
  return v.ok ? v.facts : [];
}

/** ONE Slack message → ONE ChannelRecord. `ctx` = {users: Map id→name, channels: Map id→name, selfId, selfTeam,
 *  botName(id)}. The id is the conversation + `ts` (D25: `ts` repeats across channels, never inside one). */
function toRecord(adapterId, convId, m, ctx = {}) {
  const parts = Text.messageParts(m, { users: ctx.users || new Map(), channels: ctx.channels || new Map() });
  const isBot = !!(m.bot_id && (!m.user || m.subtype === 'bot_message'));
  const botName = isBot ? (peerName((m.bot_profile && m.bot_profile.name) || (typeof ctx.botName === 'function' ? ctx.botName(m.bot_id) : ''), 200) || '') : '';
  const uid = typeof m.user === 'string' ? m.user : '';
  const uname = uid && ctx.users ? (ctx.users.get(uid) || '') : '';
  const external = !!(!isBot && ctx.selfTeam && typeof m.user_team === 'string' && m.user_team && m.user_team !== ctx.selfTeam);
  const threadTs = TS_RE.test(String(m.thread_ts || '')) ? String(m.thread_ts) : null;
  const isReply = !!(threadTs && threadTs !== m.ts);
  const facts = factsOfMessage(m, botName || (m.bot_profile && m.bot_profile.name) || '');
  return makeRecord({
    adapterId, convId,
    vendorId: String(m.ts || ''),
    at: tsMs(m.ts),
    author: isBot
      ? { id: String(m.bot_id), name: botName, isSelf: false, isBot: true }
      : { id: uid, name: uname, isSelf: !!ctx.selfId && uid === ctx.selfId, isBot: !!(ctx.botUsers && ctx.botUsers.has(uid)), ...(external ? { external: true } : {}) },
    text: parts.text,
    mentions: parts.mentions,
    attachments: parts.attachments,
    blocks: parts.blocks,
    // THE PLACE: a reply (and a `thread_broadcast` — ONE record, D25) answers its thread's root; a root that has
    // replies carries its own thread key
    replyTo: isReply ? threadTs : null,
    threadKey: threadTs || (Number(m.reply_count) > 0 ? String(m.ts) : null),
    root: isReply ? threadTs : null,
    raw: {
      subtype: typeof m.subtype === 'string' ? m.subtype.slice(0, 40) : null, channel: String(convId).slice(0, 40),
      ...(isBot && typeof m.username === 'string' && m.username ? { username: peerName(m.username, 80) || '' } : {}),
      ...(m.bot_id ? { bot_id: String(m.bot_id).slice(0, 40) } : {}),
      ...(Number(m.reply_count) > 0 ? { reply_count: Math.min(1e6, Number(m.reply_count)) } : {}),
      ...(isReply ? { thread_ts: threadTs } : {}),
      ...(typeof m.user_team === 'string' ? { user_team: m.user_team.slice(0, 40) } : {}),
    },
    ...(facts.length ? { facts } : {}),
  });
}
/** THE READ-TIME VIEW: a bot is shown as "<name> · app" — the per-message `username` a bot may set (any name, design
 *  F4) beside the app's own; the STORED name (what a filter matches) stays the app's registered one. */
function recordView(record) {
  const r = record;
  if (!r || typeof r !== 'object' || !r.author || !r.author.isBot) return r;
  const reg = r.author.name || '';
  const over = r.raw && typeof r.raw.username === 'string' ? r.raw.username : '';
  const base = over && over !== reg ? (reg ? `${over} (${reg})` : over) : reg;
  const name = peerName(`${base || 'Bot'} · app`, 200) || 'app';
  return name === r.author.name ? r : { ...r, author: { ...r.author, name } };
}

function create(record = {}, deps = {}) {
  const adapterId = record.id || KIND;
  const now = typeof deps.now === 'function' ? deps.now : () => Date.now();
  const fetchFn = typeof deps.fetch === 'function' ? deps.fetch : (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null);
  const tokens = deps.tokens || null;
  const oauth = deps.oauth || null;
  const state = deps.state || null;
  const log = deps.log || console;
  const meter = typeof deps.meter === 'function' ? deps.meter : () => {};
  const pace = typeof deps.pace === 'function' ? deps.pace : async () => {};
  const buckets = deps.slackBuckets || Limits.createBuckets();
  const sleep = typeof deps.sleep === 'function' ? deps.sleep : (ms) => new Promise((r) => { const t = setTimeout(r, ms); if (t.unref) t.unref(); });
  const walks = new Map();       // convId (or convId#threadTs) -> {stopAt, cursor, newest, at, count, max}
  const people = new Map();      // user id -> {name, display, real, handle, isBot, deleted, team, at}
  const bots = new Map();        // bot id -> {name, at}
  const chanNames = new Map();   // conversation id -> name (for `<#C…>`)
  const members = new Map();     // convId -> {ids, at}
  const teams = new Map();       // team id -> {name, at}
  const rxCache = new Map();     // `${convId}|${ts}` -> {list, at}
  let peopleListedAt = 0;

  // ── the token ──
  function readToken() {
    if (!tokens) return { token: null, why: 'no token store was handed to this adapter' };
    const t = tokens.read();
    if (!t || !t.token) return { token: null, why: (t && t.why) || 'never-authenticated' };
    return { token: t.token, why: null };
  }
  function bearer() {
    const { token, why } = readToken();
    if (!token || !token.access_token) throw new ChannelError('auth-expired', `Slack is not connected (${why || 'no token'})`, { retryable: false });
    if (token.revokedAt) throw new ChannelError('auth-expired', 'Slack refused this token (revoked or the app was removed) — paste a new one with Re-authorize', { retryable: false, detail: { why: 'token-revoked' } });
    return token.access_token;
  }
  const selfId = () => { const t = readToken().token || {}; return typeof t.user === 'string' ? t.user : null; };
  const selfTeam = () => { const t = readToken().token || {}; return typeof t.team === 'string' && t.team.length <= 64 ? t.team : null; };
  const scopesHeld = () => ((readToken().token || {}).scopes || []).map(String);

  // ── the setup report (the first real install's probe list, by name) ──
  const probes = () => { const s = state ? state.read() : {}; return (s && s.setup && s.setup.probes && typeof s.setup.probes === 'object') ? s.setup.probes : {}; };
  function probe(name, value) {
    if (!state) return;
    const cur = probes();
    if (cur[name] !== undefined && cur[name] !== null && JSON.stringify(cur[name]) === JSON.stringify(value)) return;
    if (cur[name] !== undefined && cur[name] !== null && name !== 'scopes' && name !== 'planLimited') return;   // a probe is answered once (scopes / plan follow the token)
    Promise.resolve(state.write({ setup: { probes: { ...cur, [name]: value }, at: now() } })).catch(() => {});
  }

  // ── THE GATE: token → the method's bucket → the pace → the meter → the request ──
  async function api(method, params = {}, { convId = null } = {}) {
    bearer();
    let v = buckets.take(method, now(), { convId });
    // Slack's one-message-a-second per conversation: a gap under a second is WAITED once (two approvals in one
    // channel a moment apart both go), never turned into a failed send
    if (!v.go && v.why === 'send-gap') { await sleep(SEND_GAP_WAIT_MS); v = buckets.take(method, now(), { convId }); }
    if (!v.go && v.why === 'unknown-method') throw new ChannelError('vendor-error', `slack ${method}: a method with no row in the per-method table (src/channels/slack-limits.js) — never sent unmetered`, { retryable: false, detail: { method, why: 'unknown-method' } });
    if (!v.go) {
      const why = v.why === 'send-gap' ? 'one message a second per conversation' : v.why === 'vendor-hold' ? "Slack's own Retry-After is still running" : v.why === 'unknown-method' ? 'a method this adapter does not meter' : `this method's ${Limits.perMinOf(method)} a minute are spent`;
      throw new ChannelError('rate-limited', `slack ${method}: ${why} — again in ${v.retryAfterSec || 60} s`, { retryable: true, detail: { method, why: v.why, retryAfterSec: v.retryAfterSec || 60, bucket: true } });
    }
    await pace(1);
    meter(1);
    const tok = bearer();   // re-read after the pace (a disconnect while waiting sends nothing)
    try {
      const r = await callSlack(fetchFn, method, params, { token: tok });
      if (r.scopes && r.scopes.length) probe('scopes', r.scopes);
      return r.body;
    } catch (e) {
      if (e instanceof ChannelError && e.code === 'rate-limited' && e.detail && Number(e.detail.retryAfterSec) > 0) buckets.hold(method, e.detail.retryAfterSec, now());
      if (e instanceof ChannelError && e.code === 'auth-expired' && e.detail && (e.detail.error === 'token_revoked' || e.detail.error === 'account_inactive' || e.detail.error === 'invalid_auth')) {
        const t = readToken().token;
        if (t && t.access_token === tok && tokens) { try { await tokens.write({ ...t, revokedAt: now(), revokedWhy: e.detail.error }, { expiresAt: null, scopes: t.scopes || [], user: t.label || null }); } catch { /* the next call says it again */ } }
      }
      throw e;
    }
  }

  // ── people, bots, channels (names; best effort except a RATE refusal, which goes to the ladder) ──
  const rateOrNull = (e) => { if (e instanceof ChannelError && (e.code === 'rate-limited' || e.code === 'auth-expired')) throw e; return null; };
  function rememberPerson(u, at) {
    if (!u || typeof u.id !== 'string' || !ID_RE.test(u.id)) return;
    if (!people.has(u.id) && people.size >= PEOPLE_MAX) people.delete(people.keys().next().value);
    people.set(u.id, { ...personOf(u), at });
  }
  async function listPeople() {
    if (now() - peopleListedAt < PEOPLE_TTL_MS) return;
    peopleListedAt = now();
    let cursor = null;
    for (let i = 0; i < PEOPLE_LIST_PAGES; i++) {
      let d;
      try { d = await api('users.list', { limit: 200, ...(cursor ? { cursor } : {}) }); } catch (e) { rateOrNull(e); return; }
      for (const u of Array.isArray(d.members) ? d.members.slice(0, 1000) : []) rememberPerson(u, now());
      cursor = d.response_metadata && d.response_metadata.next_cursor ? String(d.response_metadata.next_cursor).slice(0, 2048) : null;
      if (!cursor) break;
    }
  }
  async function namePeople(ids) {
    let asked = 0;
    for (const id of ids) {
      if (!ID_RE.test(id)) continue;
      const p = people.get(id);
      if (p && now() - p.at < PEOPLE_TTL_MS) continue;
      if (asked >= PEOPLE_LOOKUPS_PER_CALL) break;
      asked++;
      try { const d = await api('users.info', { user: id }); rememberPerson(d.user, now()); } catch (e) { rateOrNull(e); }
    }
  }
  async function nameBots(ids) {
    let asked = 0;
    for (const id of ids) {
      if (!ID_RE.test(id) || bots.has(id) || asked >= 3) continue;
      asked++;
      try { const d = await api('bots.info', { bot: id }); bots.set(id, { name: peerName(d.bot && d.bot.name, 200) || '', at: now() }); } catch (e) { rateOrNull(e); bots.set(id, { name: '', at: now() }); }
    }
  }
  const nameMap = () => { const m = new Map(); for (const [id, p] of people) if (p.name) m.set(id, p.name); return m; };
  const botUsers = () => { const s = new Set(); for (const [id, p] of people) if (p.isBot) s.add(id); return s; };
  async function ctxFor(msgs) {
    const ids = new Set(), botIds = new Set();
    for (const m of msgs) {
      if (m && typeof m.user === 'string') ids.add(m.user);
      if (m && m.bot_id && !(m.bot_profile && m.bot_profile.name)) botIds.add(String(m.bot_id));
      const t = typeof (m && m.text) === 'string' ? m.text.slice(0, Text.TEXT_MAX) : '';
      for (const x of t.matchAll(/<@([A-Z0-9]{2,40})(?:\|[^>]{0,200})?>/g)) { ids.add(x[1]); if (ids.size > 200) break; }
    }
    await namePeople([...ids]);
    if (botIds.size) await nameBots([...botIds]);
    for (const m of msgs) if (m && m.bot_id && m.bot_profile && m.bot_profile.name && !bots.has(String(m.bot_id))) bots.set(String(m.bot_id), { name: peerName(m.bot_profile.name, 200) || '', at: now() });
    return { users: nameMap(), channels: chanNames, selfId: selfId(), selfTeam: selfTeam(), botUsers: botUsers(), botName: (id) => (bots.get(id) || {}).name || '' };
  }
  function keepReactions(convId, msgs) {
    for (const m of msgs) {
      if (!m || !TS_RE.test(String(m.ts || ''))) continue;
      const k = `${convId}|${m.ts}`;
      if (!rxCache.has(k) && rxCache.size >= RX_CACHE_MAX) rxCache.delete(rxCache.keys().next().value);
      rxCache.set(k, { list: Array.isArray(m.reactions) ? m.reactions.slice(0, 64) : [], at: now() });
    }
  }
  const rxList = (list) => (Array.isArray(list) ? list : []).slice(0, 64).filter((x) => x && typeof x.name === 'string' && x.name.length <= 64).map((x) => {
    const by = (Array.isArray(x.users) ? x.users : []).filter((u) => typeof u === 'string' && ID_RE.test(u)).slice(0, 20);
    return { key: x.name, count: Math.max(by.length, Math.min(1e6, Number(x.count) || 0)), by, rids: by.map(() => x.name) };
  });

  // ── the histories ──
  async function page(method, convId, params) {
    const d = await api(method, { channel: convId, ...params }, { convId });
    const msgs = (Array.isArray(d.messages) ? d.messages : []).filter((m) => m && TS_RE.test(String(m.ts || ''))).slice(0, PAGE_MAX);
    if (method === 'conversations.history') {
      if (typeof d.is_limited === 'boolean') probe('planLimited', d.is_limited);
      const asked = Number(params.limit) || 0;
      if (asked > 15 && msgs.length > 15) probe('historyTier', 'internal');
      else if (asked > 15 && msgs.length === 15 && d.has_more === true) probe('historyTier', 'limited-15');
    }
    keepReactions(convId, msgs);
    const next = d.has_more === true && d.response_metadata && d.response_metadata.next_cursor ? String(d.response_metadata.next_cursor).slice(0, 2048) : null;
    return { msgs, next };
  }
  async function walk(key, method, convId, { anchor = null, limit = 50, initialMax = null, stopAt = null, extra = {} } = {}) {
    const size = Math.min(PAGE_MAX, Math.max(1, Number(limit) || 50));
    const firstMax = Number(initialMax) > 0 ? Math.min(FIRST_INGEST_MAX, Number(initialMax)) : FIRST_INGEST_MAX;
    let w = walks.get(key);
    const continuing = !!(w && w.newest && anchor === w.newest && now() - w.at < WALK_TTL_MS);
    if (!continuing) { w = { stopAt: (stopAt ? String(stopAt) : null) || anchor || null, cursor: null, newest: null, at: now(), count: 0, max: 0 }; w.max = w.stopAt ? FIRST_INGEST_MAX : firstMax; walks.set(key, w); }
    const params = { limit: size, ...extra };
    if (w.stopAt && TS_RE.test(w.stopAt) && method === 'conversations.history') params.oldest = w.stopAt;
    if (w.cursor) params.cursor = w.cursor;
    const { msgs, next } = await page(method, convId, params);
    w.at = now();
    // conversations.replies answers OLDEST first with the root first; conversations.history newest first — read both
    // newest first, the root of a replies page excluded (it is a message of the channel listing)
    const list = method === 'conversations.replies' ? msgs.filter((m) => String(m.ts) !== String(extra.ts)).sort((a, b) => tsMs(b.ts) - tsMs(a.ts)) : msgs;
    const fresh = [];
    let reached = false;
    for (const m of list) {
      if (w.stopAt && (String(m.ts) === w.stopAt || tsMs(m.ts) <= tsMs(w.stopAt))) { reached = true; break; }
      fresh.push(m);
    }
    if (!w.newest && fresh.length) w.newest = String(fresh[0].ts);
    w.count += fresh.length;
    const max = Number(w.max) > 0 ? w.max : firstMax;
    const done = reached || !next || w.count >= max;
    const bounded = !reached && !!next && w.count >= max;
    if (done) walks.delete(key); else w.cursor = next;
    const ctx = await ctxFor(fresh);
    const records = fresh.slice(0, size).reverse().map((m) => toRecord(adapterId, convId, m, ctx));
    return { records, anchor: w.newest || w.stopAt || null, reachedAnchor: done, complete: done, ...(bounded ? { bounded: true } : {}) };
  }

  // ── prepareSend: who an @Name is, decided ONCE (D21) ──
  async function membersOf(convId) {
    const c = members.get(convId);
    if (c && now() - c.at < MEMBERS_TTL_MS) return c.ids;
    const ids = [];
    let cursor = null;
    for (let i = 0; i < 2 && ids.length < MEMBERS_MAX; i++) {
      const d = await api('conversations.members', { channel: convId, limit: 500, ...(cursor ? { cursor } : {}) }, { convId });
      for (const id of Array.isArray(d.members) ? d.members : []) if (typeof id === 'string' && ID_RE.test(id) && ids.length < MEMBERS_MAX) ids.push(id);
      cursor = d.response_metadata && d.response_metadata.next_cursor ? String(d.response_metadata.next_cursor).slice(0, 2048) : null;
      if (!cursor) break;
    }
    members.set(convId, { ids, at: now() });
    return ids;
  }
  const fold = (s) => String(s || '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');
  /** THE NAME TIERS an `@Name` is matched in, most specific first: the handle, the display name, the full name (spaces
   *  dropped: `@AliceChen`), a first name. The FIRST tier with any match decides: one person = resolved, two or more =
   *  ambiguous (refused) — so `@alice.c` reaches one Alice while `@Alice` with two "Alice"s asks for the full name. */
  const firstOf = (s) => fold(String(s || '').trim().split(/\s+/)[0]);
  const NAME_TIERS = [(p) => [fold(p.handle)], (p) => [fold(p.display)], (p) => [fold(p.real)], (p) => [firstOf(p.display), firstOf(p.real)]];
  async function prepareSendImpl(convId, { text = '' } = {}) {
    const t = String(text == null ? '' : text);
    const tooLong = [...t].length > Text.SEND_MAX;
    const names = Text.atNames(t).filter((n) => !Text.BROADCAST_WORDS.includes(n.toLowerCase()));
    const out = { notifies: [], unresolved: [], plain: [], mentions: [], tooLong, sendMax: Text.SEND_MAX, at: now() };
    if (names.length) {
      const ids = await membersOf(convId);
      await namePeople(ids.filter((id) => !people.has(id)).slice(0, 20));
      const candidates = ids.map((id) => [id, people.get(id)]).filter(([, p]) => p && !p.deleted);
      for (const n of names) {
        const want = fold(n);
        let distinct = [];
        for (const tier of NAME_TIERS) {
          distinct = [...new Set(candidates.filter(([, p]) => tier(p).filter(Boolean).includes(want)).map(([id]) => id))];
          if (distinct.length) break;
        }
        if (distinct.length === 1) { const p = people.get(distinct[0]); out.mentions.push({ name: n, id: distinct[0] }); out.notifies.push(p.name || n); }
        else if (distinct.length > 1) out.unresolved.push(n);
        else out.plain.push(n);
      }
    }
    out.text = Text.toMrkdwn(t, out.mentions);
    return out;
  }

  // ── send (as the person) ──
  async function sendImpl(convId, { text, replyTo = null, as = 'user', placement = null, prepared = null, replyAnchor = null } = {}) {
    if (as !== 'user') throw new ChannelError('send-not-available', `slack: sending as '${as}' is not declared (caps.sendAs: user)`, { retryable: false, detail: { sendAs: caps.sendAs } });
    if (!SEND_SCOPES.every((s) => has(scopesHeld(), s))) throw new ChannelError('forbidden', 'slack: the pasted token has no chat:write scope — add it to the app and paste the new token (Re-authorize)', { retryable: false, detail: { why: 'send-scope-not-granted' } });
    const body = String(text == null ? '' : text);
    if ([...body].length > Text.SEND_MAX + 400) throw new ChannelError('too-large', `slack: a message of ${[...body].length} characters is over the ${Text.SEND_MAX}-character bound — nothing was sent`, { retryable: false, detail: { why: 'too-long' } });
    const mentions = prepared && Array.isArray(prepared.mentions) ? prepared.mentions : [];
    const params = { channel: convId, text: Text.toMrkdwn(body, mentions) };
    if (replyTo) {
      // a reply lands in the thread its anchor belongs to (the anchor's own stored thread, else the anchor itself is the root)
      const a = replyAnchor && typeof replyAnchor === 'object' ? replyAnchor : null;
      const raw = a && a.raw && typeof a.raw === 'object' ? a.raw : {};
      if (raw.channel && String(raw.channel) !== String(convId)) throw new ChannelError('not-found', 'slack: the message this reply answers belongs to another conversation — nothing was sent', { retryable: false, detail: { why: 'reply-anchor-elsewhere' } });
      const root = TS_RE.test(String(raw.thread_ts || '')) ? String(raw.thread_ts) : String(replyTo);
      if (!TS_RE.test(root)) throw new ChannelError('not-found', 'slack: the message this reply answers has no Slack timestamp — nothing was sent', { retryable: false, detail: { why: 'reply-anchor' } });
      params.thread_ts = root;
      if (placement === 'thread+chat') params.reply_broadcast = 'true';
    }
    let d;
    try { d = await api('chat.postMessage', params, { convId }); }
    catch (e) {
      if (e instanceof ChannelError && e.code === 'transport') throw new ChannelError('transport', `${e.message} — the request left and Slack's answer was lost; check Slack before sending again`, { retryable: false, detail: { ...(e.detail || {}), lost: true } });
      throw e;
    }
    const m = (d && d.message) || {};
    const marked = !!(m.app_id || m.bot_id || m.bot_profile);
    probe('sendMarker', marked ? 'marked' : 'none');
    return { ok: true, vendorMessageId: String(d.ts || m.ts || ''), at: tsMs(d.ts || m.ts) || now(), sentAs: 'user', observed: { senderType: marked ? 'app-marked' : 'user', senderId: typeof m.user === 'string' ? m.user : null, ...(params.thread_ts ? { threadKey: params.thread_ts } : {}) } };
  }

  return {
    auth: {
      async state() {
        const { token, why } = readToken();
        if (!token) return { state: 'unknown', expiresAt: null, scopes: [], why, credentialSource: 'paste', credentialKey: null };
        if (token.revokedAt) return { state: 'needs-reauth', expiresAt: null, scopes: token.scopes || [], why: 'token-revoked', credentialSource: 'paste', credentialKey: null };
        probe('userOnlyManifest', 'accepted');   // a held user token proves Slack accepted the user-scope-only manifest (the consent's own write ran on a record that did not exist yet)
        const missing = READ_SCOPES.filter((s) => !has(token.scopes, s));
        return { state: 'connected', expiresAt: null, scopes: token.scopes || [], why: missing.length ? `scopes-missing:${missing.join(',')}` : null, credentialSource: 'paste', credentialKey: null, user: token.label || null };
      },
      /** THE PASTE FLOW (oauth-loopback `paste`): the consent URL is the manifest link; nothing listens. */
      async begin() {
        if (!oauth) throw new ChannelError('not-supported', 'slack.auth.begin: no sign-in machine was handed to this adapter', { retryable: false });
        const label = record && typeof record.label === 'string' && record.label !== LABEL ? record.label : '';
        return oauth.begin({
          id: adapterId, mode: 'paste', label: 'Slack', timeoutMs: 30 * 60 * 1000,   // making the app takes a few minutes
          buildConsentUrl: () => Manifest.createLink(Manifest.manifestFor({ ownerName: label })),
          exchange: async ({ code, cancelled = null }) => {
            const pasted = String(code == null ? '' : code).trim();
            if (Manifest.tokenShapeOf(pasted) !== 'user') throw new ChannelError('forbidden', 'that is not a Slack user token (it starts xoxp-)', { retryable: false, detail: { why: 'not-a-user-token' } });
            let r;
            try { r = await callSlack(fetchFn, 'auth.test', {}, { token: pasted }); }   // ungated: consent-auth-test (once per human paste)
            catch (e) { throw new ChannelError(e instanceof ChannelError ? e.code : 'vendor-error', `Slack refused the pasted token: ${e instanceof ChannelError && e.detail && e.detail.error ? e.detail.error : 'no answer'}`, { retryable: false, detail: { why: e instanceof ChannelError && e.detail ? e.detail.why : 'vendor' } }); }   // rate-ok: consent-auth-test
            const a = r.body || {};
            const team = typeof a.team_id === 'string' && ID_RE.test(a.team_id) ? a.team_id : null;
            const user = typeof a.user_id === 'string' && ID_RE.test(a.user_id) ? a.user_id : null;
            if (!team || !user) throw new ChannelError('vendor-error', 'Slack answered the pasted token without naming a workspace and a person — nothing was connected', { retryable: false, detail: { nameless: true } });
            const ent = typeof a.enterprise_id === 'string' && ID_RE.test(a.enterprise_id) ? a.enterprise_id : null;
            const scopes = r.scopes || [];
            const teamName = peerName(a.team, 100) || team;
            const handle = peerName(a.user, 100) || user;
            const tok = { access_token: pasted, user, team, ...(ent ? { enterprise: ent } : {}), userId: `${ent ? `${ent}/` : ''}${team}/${user}`, teamName, name: handle, label: `${teamName} · @${handle}`, scopes, url: typeof a.url === 'string' && /^https:\/\/[a-z0-9.-]+\.slack\.com\/$/i.test(a.url) ? a.url : null };
            if (tokens) await tokens.write(tok, { expiresAt: null, scopes, user: tok.label, consent: { cancelled } });
            probe('userOnlyManifest', 'accepted');
            probe('scopes', scopes);
            return { ok: true, user: tok.label, scopes };
          },
          onDone: deps.onAuthDone ? (r) => deps.onAuthDone(adapterId, r) : null,
        });
      },
      /** The paste lands here: its SHAPE is judged first (the flow stays open for a wrong one), then the exchange. */
      async finish(flowId, pasted) {
        if (!oauth) throw new ChannelError('not-supported', 'slack.auth.finish: no sign-in machine was handed to this adapter', { retryable: false });
        const shape = Manifest.tokenShapeOf(typeof pasted === 'string' ? pasted : '');
        if (shape !== 'user') {
          const what = shape === 'bot' ? 'a bot token (xoxb-)' : shape === 'app' ? 'an app-level token (xapp-)' : shape === 'empty' ? 'nothing' : 'not a Slack token';
          throw new ChannelError('forbidden', `that is ${what} — paste the User OAuth Token from the app's "OAuth & Permissions" page; it starts xoxp-`, { retryable: false, detail: { why: 'not-a-user-token', shape } });
        }
        const r = await oauth.forwardCallback(flowId, pasted.trim());
        return { ok: r.ok, error: r.error || null, record: r.result || null };
      },
    },

    async listConversations({ cursor = null, limit = 100 } = {}) {
      if (!cursor) await listPeople();
      const d = await api('users.conversations', { types: 'public_channel,private_channel,mpim,im', exclude_archived: optionOf(record, 'archived') === 'list' ? 'false' : 'true', limit: Math.min(200, Math.max(1, Number(limit) || 100)), ...(cursor ? { cursor } : {}) });
      const items = (Array.isArray(d.channels) ? d.channels : []).filter((c) => c && typeof c.id === 'string' && ID_RE.test(c.id)).slice(0, 1000);
      const ims = items.filter((c) => c.is_im && typeof c.user === 'string').map((c) => c.user);
      if (ims.length) await namePeople(ims);
      const conversations = items.map((c) => {
        if (c.name && !c.is_im) { if (chanNames.size >= 20000) chanNames.delete(chanNames.keys().next().value); chanNames.set(c.id, String(c.name).slice(0, 200)); }
        if (c.is_im) {
          const p = people.get(c.user) || null;
          const app = !!(p && p.isBot) || c.user === 'USLACKBOT';
          return makeConversation({ id: c.id, vendorId: c.id, title: app ? `${(p && p.name) || 'Slackbot'} · app` : ((p && p.name) || c.user), kind: 'dm', app, participants: '', lastAt: null });
        }
        if (c.is_mpim) {
          const t = typeof c.purpose === 'object' && c.purpose && c.purpose.value ? c.purpose.value : String(c.name || '').replace(/^mpdm-/, '').replace(/-\d+$/, '').split('--').join(', ');
          return makeConversation({ id: c.id, vendorId: c.id, title: t, kind: 'group', participants: '', lastAt: null });
        }
        return makeConversation({ id: c.id, vendorId: c.id, title: `#${c.name || c.id}`, kind: 'group', participants: c.topic && typeof c.topic.value === 'string' ? c.topic.value : '', lastAt: null });
      });
      const next = d.response_metadata && d.response_metadata.next_cursor ? String(d.response_metadata.next_cursor).slice(0, 2048) : null;
      return { conversations, cursor: next, complete: !next };
    },

    /** ONE `conversations.info`: membership, archived / read-only / thread-only / frozen narrowing, and WHO WILL SEE a
     *  message sent here (`audience`). Never wider than `caps`. */
    async convCaps(convId) {
      let c;
      try { c = (await api('conversations.info', { channel: convId, include_num_members: 'true' }, { convId })).channel || {}; }
      catch (e) {
        if (e instanceof ChannelError && (e.code === 'forbidden' || e.code === 'not-found')) {
          const why = (e.detail && e.detail.why) || 'not-a-member';
          return { read: 'no', sendAs: [], why: why === 'not-found' ? 'not-a-member' : why, at: now(), threads: { replyInto: false, mode: null, why }, reactions: { read: false, add: false, why } };
        }
        throw e;
      }
      probe('lastRead', Object.prototype.hasOwnProperty.call(c, 'last_read') ? 'yes' : 'no');
      const verdict = capsOfScopes(scopesHeld());
      const member = !!(c.is_member || c.is_im || c.is_mpim);
      const archived = !!c.is_archived, frozen = !!c.is_frozen, readOnly = !!c.is_read_only, threadOnly = !!c.is_thread_only;
      const narrow = archived ? 'archived' : frozen ? 'frozen' : readOnly ? 'read-only-channel' : !member ? 'not-a-member' : null;
      const sendAs = narrow ? [] : verdict.sendAs;
      const why = narrow || verdict.why;
      const orgs = [];
      const own = (readToken().token || {}).teamName;
      if (own) orgs.push(own);
      const ext = !!(c.is_ext_shared || c.is_pending_ext_shared);
      if (ext) {
        const others = [...new Set([...(Array.isArray(c.connected_team_ids) ? c.connected_team_ids : []), ...(Array.isArray(c.shared_team_ids) ? c.shared_team_ids : [])])].filter((t) => typeof t === 'string' && ID_RE.test(t) && t !== selfTeam()).slice(0, 4);
        for (const t of others) {
          let n = teams.get(t);
          if (!n || now() - n.at > PEOPLE_TTL_MS) {
            try { const d = await api('team.info', { team: t }); n = { name: peerName(d.team && d.team.name, 100) || t, at: now() }; } catch (e) { rateOrNull(e); n = { name: t, at: now() }; }
            if (teams.size >= TEAMS_MAX) teams.delete(teams.keys().next().value);
            teams.set(t, n);
          }
          orgs.push(n.name);
        }
      }
      const kind = c.is_im ? 'dm' : ext ? 'external' : (c.is_private || c.is_mpim || c.is_group) ? 'private' : 'public';
      const membersN = Number.isFinite(Number(c.num_members)) ? Number(c.num_members) : null;
      return {
        read: member ? 'yes' : 'no', sendAs, why, at: now(),
        threads: { replyInto: sendAs.length > 0, mode: threadOnly ? 'thread' : 'chat', why: sendAs.length ? null : why },
        reactions: { read: verdict.reactions.read && member, add: verdict.reactions.add && !narrow, why: narrow || verdict.reactions.why },
        audience: { kind, orgs, members: membersN, title: c.is_im ? null : (c.name ? `${c.is_private || c.is_mpim ? '' : '#'}${String(c.name).slice(0, 80)}` : null) },
      };
    },

    async history(convId, { anchor = null, limit = 50, initialMax = null } = {}) {
      return walk(convId, 'conversations.history', convId, { anchor, limit, initialMax });
    },
    /** ONE page strictly OLDER than `before` (`latest` = its ts, exclusive). */
    async older(convId, { before = null, limit = 50 } = {}) {
      const size = Math.min(PAGE_MAX, Math.max(1, Number(limit) || 50));
      const latest = before && TS_RE.test(String(before.vendorId || '')) ? String(before.vendorId) : (before && Number(before.at) > 0 ? msTs(before.at) : null);
      const { msgs, next } = await page('conversations.history', convId, { limit: size, ...(latest ? { latest, inclusive: 'false' } : {}) });
      const ctx = await ctxFor(msgs);
      const records = msgs.slice(0, size).reverse().map((m) => toRecord(adapterId, convId, m, ctx));
      return { records, exhausted: !next };
    },
    async threadHistory(convId, threadKey, { anchor = null, limit = 50, initialMax = null, stopAt = null } = {}) {
      const ts = String(threadKey || '');
      if (!TS_RE.test(ts)) throw new ChannelError('not-found', 'slack: a thread is named by its root timestamp', { retryable: false });
      // replies come oldest first: the walk asks the newest window by paging to the end, bounded by FIRST_INGEST_MAX
      return walk(`${convId}#${ts}`, 'conversations.replies', convId, { anchor, limit, initialMax, stopAt, extra: { ts } });
    },
    /** The recent-roots recheck's page: the channel's newest messages, no anchor stop (a stored root re-listed with
     *  `thread_ts` / `reply_count` now heads a thread). */
    async recentRoots(convId, { limit = 50 } = {}) {
      const size = Math.min(PAGE_MAX, Math.max(1, Number(limit) || 50));
      const { msgs } = await page('conversations.history', convId, { limit: size });
      const ctx = await ctxFor(msgs);
      return { records: msgs.slice(0, size).reverse().map((m) => toRecord(adapterId, convId, m, ctx)) };
    },
    /** ONE message's reactions: the last page's own `reactions[]` while fresh (no request), else `reactions.get`. */
    async reactions(convId, { messageId } = {}) {
      const ts = String(messageId || '');
      if (!TS_RE.test(ts)) throw new ChannelError('not-found', 'slack: a reaction list needs the message timestamp', { retryable: false });
      const c = rxCache.get(`${convId}|${ts}`);
      if (c && now() - c.at < RX_CACHE_TTL_MS) return { list: rxList(c.list), truncated: false, at: c.at, pages: 0 };
      const d = await api('reactions.get', { channel: convId, timestamp: ts, full: 'true' }, { convId });
      const m = (d && d.message) || {};
      return { list: rxList(m.reactions), truncated: false, at: now(), pages: 1 };
    },
    /** ADD a reaction as the person: Slack has no reaction id — the NAME is what removes it (`reactionId` = the name). */
    async react(convId, { messageId, key } = {}) {
      const ts = String(messageId || '');
      if (!TS_RE.test(ts) || !key) throw new ChannelError('not-found', 'slack: a reaction needs its message and its emoji', { retryable: false });
      await api('reactions.add', { channel: convId, timestamp: ts, name: String(key) }, { convId });
      rxCache.delete(`${convId}|${ts}`);
      return { ok: true, reactionId: String(key), at: now(), actor: selfId() };
    },
    async unreact(convId, { messageId, key = null, reactionId = null } = {}) {
      const ts = String(messageId || '');
      const name = String(reactionId || key || '');
      if (!TS_RE.test(ts) || !name) throw new ChannelError('not-found', 'slack: removing a reaction needs its emoji', { retryable: false, detail: { why: 'reaction-not-mine' } });
      await api('reactions.remove', { channel: convId, timestamp: ts, name }, { convId });
      rxCache.delete(`${convId}|${ts}`);
      return { ok: true, at: now() };
    },
    async reactionSet() { return { keys: Text.SLACK_EMOJI.map((e) => ({ key: e.key, glyph: e.glyph, label: e.label, custom: false })), quick: Text.SLACK_QUICK.slice() }; },

    send: sendImpl,
    prepareSend: prepareSendImpl,
    /** `idempotency: 'none'` — the engine never asks (canReconcile refuses); present because a sendable adapter declares it. */
    async reconcile() { throw new ChannelError('not-supported', 'slack: a lost send cannot be looked up by the machine (no idempotency key) — check Slack', { retryable: false, detail: { why: 'no-idempotency' } }); },

    /** A file's bytes: `files.info` first (a Slack Connect file says `check_file_info`), then the private download URL —
     *  ONLY on files.slack.com (the token never goes anywhere else), bounded at 100 MB while it reads. */
    async fetchAttachment(convId, { attachmentId } = {}) {
      const id = String(attachmentId || '');
      if (!ID_RE.test(id)) throw new ChannelError('not-found', 'slack: a file is named by its id', { retryable: false });
      const d = await api('files.info', { file: id }, { convId });
      const f = (d && d.file) || {};
      const url = String(f.url_private_download || f.url_private || '');
      if (!url.startsWith(FILES_ORIGIN)) throw new ChannelError('forbidden', 'slack: the file is not served from files.slack.com — not fetched (the token goes to Slack only)', { retryable: false, detail: { why: 'file-host' } });
      if (Number(f.size) > ATTACH_MAX_BYTES) throw new ChannelError('too-large', `slack: the file is ${Number(f.size)} bytes, over the 100 MB bound`, { retryable: false });
      const v = buckets.take('files.download', now(), { convId });
      if (!v.go) throw new ChannelError('rate-limited', `slack files.download: again in ${v.retryAfterSec || 60} s`, { retryable: true, detail: { method: 'files.download', retryAfterSec: v.retryAfterSec || 60, bucket: true } });
      await pace(1);
      meter(1);
      const tok = bearer();
      const sent = sentSecrets({ headers: { Authorization: `Bearer ${tok}` } });
      let r;
      try { r = await fetchFn(url, { headers: { Authorization: `Bearer ${tok}` }, redirect: 'error', signal: AbortSignal.timeout(60000) }); }
      catch (e) { throw new ChannelError('transport', withoutSent(`slack file: ${(e && e.message) || e}`, sent), { retryable: true }); }
      if (!r.ok) throw new ChannelError(r.status === 404 ? 'not-found' : r.status === 403 ? 'forbidden' : r.status === 429 ? 'rate-limited' : 'transport', `slack file: HTTP ${r.status}`, { retryable: r.status >= 500 || r.status === 429, detail: { status: r.status } });
      const ct = String((r.headers && r.headers.get && r.headers.get('content-type')) || '');
      if (/text\/html/.test(ct)) throw new ChannelError('auth-expired', 'slack file: Slack answered a sign-in page instead of the file (the token cannot read it)', { retryable: false, detail: { why: 'file-auth' } });
      let data;
      if (r.body && typeof r.body.getReader === 'function') {
        const rd = r.body.getReader(), parts = [];
        let n = 0;
        for (;;) {
          const { done, value } = await rd.read();
          if (done) break;
          n += value.length;
          if (n > ATTACH_MAX_BYTES) { try { await rd.cancel(); } catch { } throw new ChannelError('too-large', 'slack file: the answer ran past the 100 MB bound — cancelled, nothing kept', { retryable: false }); }
          parts.push(Buffer.from(value));
        }
        data = Buffer.concat(parts);
      } else data = Buffer.from(await r.arrayBuffer());
      return { data, mime: (ct.split(';')[0].trim() || (typeof f.mimetype === 'string' ? f.mimetype : null)), name: peerName(f.name, 256) || null };
    },

    selfId() { return selfId(); },
    selfTenant() { return selfTeam(); },
    /** The buckets' view (a suite, the card): per method {used, perMin, heldFor}. */
    bucketView() { return buckets.view(now()); },
  };
}

const SEND_GRANT = Object.freeze({ scopes: SEND_SCOPES, console: true });
const REACTIONS_GRANT = Object.freeze({ scopes: Object.freeze(['reactions:read']), console: true });
const adapter = { kind: KIND, caps, create, vendorNameOf, blocksOf: Text.slackStoredBlocks, recordView, sendGrant: SEND_GRANT, sendCapsOf, capsOfScopes, reactionsGrant: REACTIONS_GRANT };
module.exports = {
  kind: KIND, caps, create, adapter, label: LABEL, integration: INTEGRATION, OPTIONS, optionOf,
  EGRESS, API, FILES_ORIGIN, FIRST_INGEST_MAX, WALK_TTL_MS, PAGE_MAX, PEOPLE_TTL_MS, PEOPLE_LOOKUPS_PER_CALL, RX_CACHE_TTL_MS, ATTACH_MAX_BYTES,
  toRecord, recordView, factsOfMessage, personOf, callSlack, sendCapsOf, capsOfScopes, vendorNameOf, tsMs, msTs,
  SEND_GRANT, REACTIONS_GRANT, READ_SCOPES, SEND_SCOPES, blocksOf: Text.slackStoredBlocks,
};
