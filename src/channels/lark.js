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
const { makeRecord, makeConversation, peerName } = require('../channel-record.js');   // peerName: THE name door (the .197 integration — the D3 app names pass it, lark-search-poll ④g)
const { ChannelError, retryAfterSeconds, sentSecrets, withoutSent } = require('./index.js');
const { namelessSentence } = require('../channel-identity.js');   // verify r6: a consent must name its account
const { createLarkLive, NAMES_WAIT_MS } = require('./live/lark.js');
// §25 (2026-09-27): THE RENDER RUNGS — a vendor item → the typed block tree
// the window draws (a post's rich text kept, mentions as chips, a picture as
// the picture); `text` stays the agent-facing string.
const Blocks = require('../channel-blocks.js');
// lane lark-search-poll (B-5aab): the change feed's PURE arithmetic — the hit shape, the declared unit, the ISO window
const Feed = require('../channel-feed.js');

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
  // lane channel-threads (2026-09-28): READING reactions needs `im:message.reactions:read` (L8). OWNER RULING
  // (2026-09-28): ON BY DEFAULT — the default consent asks for it beside the five base scopes (an app that has every
  // permission enabled needs one Re-authorize, never an option found first). Lark refuses a WHOLE consent that
  // names a scope the app has not enabled (20027, on its own page — never redirected), so the scope is OPTIONAL
  // (`OPTIONAL_SCOPES`): the sign-in dialog offers ONE retry without it and the account then says, by name, that
  // Lark refused it (never a silent narrower consent). Adding / removing one's OWN reaction needs `im:message`,
  // which the consent already asks for.
  { key: 'reactions', label: i18nKey('Reactions'), default: 'read', choices: Object.freeze(['off', 'read']), rebuild: false,
    choiceLabels: Object.freeze({ off: i18nKey('Add and remove only'), read: i18nKey('Also read who reacted') }),
    help: i18nKey('Reading who reacted needs the im:message.reactions:read permission; the sign-in asks for it. If Lark refuses because the app has not enabled it, the sign-in dialog offers one retry without it and the account says what is missing.') },
  // lane lark-search-poll (B-5aab, 2026-09-28 — the owner: "从 lark pull 消息可以通过搜索空格+时间范围来搜索最近所有新消息吧，这样也顺便能解决私聊问题"):
  // ONE search per account per tick finds every new message — groups, single chats (which `im/v1/chats` never lists),
  // thread replies. ON BY DEFAULT; `off` drops both scopes from the consent and turns the feed off.
  { key: 'search', label: i18nKey('New-message search'), default: 'on', choices: Object.freeze(['off', 'on']), rebuild: false,
    choiceLabels: Object.freeze({ off: i18nKey('Check each chat on its own'), on: i18nKey('One search finds new messages (also single chats)') }),
    help: i18nKey('Needs search:message (and im:message.p2p_msg:get_as_user to read single chats); the sign-in asks for them. If Lark refuses because the app has not enabled them, the sign-in offers a retry without them and the account says what is missing.') },
]);
/** An option's value on a record: the stored one, else the declared default (a record written before an option
 *  existed — or before its default changed — reads the declaration). */
function optionOf(record, key) {
  const d = OPTIONS.find((o) => o.key === key);
  const o = (record && record.options) || {};
  const v = o[key];
  return v === undefined || v === null || v === '' ? (d ? d.default : undefined) : v;
}
/** The scope that unlocks READING reactions (L8) and the one ADD / REMOVE ride (L7 — already asked for). */
const REACTIONS_READ_SCOPES = Object.freeze(['im:message.reactions:read', 'im:message:readonly']);
/** lane lark-search-poll: THE CHANGE FEED's scopes — the search itself, and the user-token read of a SINGLE chat's
 *  history (the Feishu CN page names it for user-token single-chat reads — V6; whether a token without it already
 *  reads them is unverified, so it is asked for and a refused single-chat read names it). */
const SEARCH_SCOPE = 'search:message';
const P2P_READ_SCOPE = 'im:message.p2p_msg:get_as_user';
/** The scopes the consent asks for but can do without, as ORDERED GROUPS, least valuable first (owner decision 5,
 *  2026-09-28: "one scope dropped per retry, each a click naming the scope"): reactions only colour chips; without the
 *  single-chat read the feed still serves groups and threads; without search there is no feed. Lark refuses a WHOLE
 *  consent naming a scope the app has not enabled (20027, on its own page), so each retry drops the NEXT group. */
const OPTIONAL_SCOPE_GROUPS = Object.freeze([Object.freeze([REACTIONS_READ_SCOPES[0]]), Object.freeze([P2P_READ_SCOPE]), Object.freeze([SEARCH_SCOPE])]);
/** …flat (every optional scope — what a narrowed consent may have dropped). */
const OPTIONAL_SCOPES = Object.freeze(OPTIONAL_SCOPE_GROUPS.flat());
const REACTIONS_WRITE_SCOPES = Object.freeze(['im:message', 'im:message.reactions:write_only']);
/** Pages of a message's reaction list read at most (50 each — 150 reactions; more ⇒ `truncated`). */
const REACTION_PAGES_MAX = 3;
/** A group that refused a reply INTO a thread (230071) is remembered this long (spec §3.1). */
const TOPIC_FORBIDDEN_TTL_MS = 6 * 3600e3;

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
/** lane lark-search-poll: the message search's field NAMES are said once per process (U1's check against reality). */
let feedFieldsSaid = false;
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
/**
 * EVERY OUTBOUND CALL THIS ADAPTER MAKES OUTSIDE `api()` — THE GATE (lane R5
 * verify r4). The census in test-channels-lark-shape reads the markers off the
 * code: `// gated-inline: <id>` = a raw send with its own `await pace(1);
 * meter(1)` right above it (the token refresh, the two send forms, the
 * resource bytes); `// ungated: <id>` = a call that stands outside the pace
 * for a reason an agent or a loop cannot multiply, named HERE. A new outbound
 * call with no marker, a gated-inline site without its pace, or an ungated id
 * with no row, is red.
 */
const UNGATED = Object.freeze([
  { id: 'consent-exchange', why: 'the fixed-mode loopback consent flow: once per human consent, taken by the flow\'s one-time state' },
  { id: 'consent-user-info', why: 'ONE user_info read inside that same consent (who signed in); once' },
  { id: 'integration-test', why: 'the integrations panel\'s Test button (a human POST): one tenant token per brand, no user token, nothing listed or sent' },
]);

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
  // §25 (2026-09-27): every record carries its render tree (`blocks`), and a
  // record stored before that is served through `blocksOf` at read time
  render: 'blocks',
  // 2026-09-26 (the aggregated IM): images and files are fetched ON DEMAND
  // through `messages/:message_id/resources/:key`, history pages back with
  // `end_time`, and every request is metered against the account's budget —
  // 1000/min per API per app per TENANT is the vendor's pool (a cluster app
  // shares it), so the default is 60 (6 %), the setting names it
  attachments: 'fetch',
  olderHistory: 'page',
  budget: { unit: 'request', default: 60, settingKey: 'channels.budgetLarkPerMin', metered: true },
  // lane R5 (2026-09-26): PACED PER SECOND as well (drain rule 18). The
  // vendor's frequency tiers are per API, per app, per TENANT — the chat /
  // message / member / resource reads are tier 4, "1000/min, 50/s" — and a
  // cluster app shares that pool with every instance and user, so the
  // default is 5 requests/s (10 % of the per-second tier); the engine also
  // spreads the minute's budget (60 ⇒ about one a second).
  pace: { unitsPerSec: 5, settingKey: 'channels.larkRequestsPerSec', cost: { fetch: 1, discover: 1, scanHost: 1, feed: 1 } },
  vendorName: i18nKey('Lark'),
  // lane channel-threads (2026-09-28; vendor facts L3, L6–L12): a VENDOR thread object (`omt_…`) whose replies are
  // NOT in the chat listing (`threadHistory` walks `container_id_type=thread`), a reply INTO it (`reply_in_thread`);
  // reactions are a PER-MESSAGE list call (never in a message answer — L4), added / removed as the user (own only —
  // 231007), named by `emoji_type` (L9), no custom pictures
  // 2026-09-28 (reply PLACEMENTS): a plain message, a QUOTE (the reply endpoint — shown in the chat), a reply IN the
  // thread (`reply_in_thread`); no broadcast into the chat. The norm for a message outside a thread is a quote
  // (threads are opt-in on Lark); a message already in one is answered in it (PL3 — Lark files it there anyway, L6)
  threads: Object.freeze({ read: 'vendor', replyInto: true, listing: 'separate', placements: Object.freeze(['chat', 'quote', 'thread']), rootReply: 'quote' }),
  reactions: Object.freeze({ read: 'list', add: true, remove: 'own', vocabulary: 'names', custom: 'none', perMessageMax: null }),
  // lane lark-search-poll (B-5aab, design §1.3): THE CHANGE FEED — `im/v1/messages/search` with an EMPTY query and a
  // `time_range` (V1): one page of ≤ 30 hits names every conversation with a new message the user can see (groups,
  // single chats, thread replies). 10 pages per sliding minute = 10 % of the vendor's 100/min TENANT tier (V3); the
  // window never reaches further back than an hour (a long stop's older span is a single-chat catch-up); a hit's
  // `create_time` is read in MILLISECONDS (the `im/v1` unit — ONE declared unit, never guessed: U5)
  changeFeed: Object.freeze({ via: 'search', scope: SEARCH_SCOPE, option: 'search', pageSize: 30, pagesPerPass: 5, perMin: 10, maxWindowSec: 3600, catchUp: Object.freeze({ chatType: 'p2p', pagesMax: 20 }), describes: true, timeUnit: 'ms' }),
});
/**
 * THE REACTION VOCABULARY (lane channel-threads, 2026-09-28; vendor fact L9):
 * Lark's `emoji_type` is a NAME — mixed case (`THUMBSUP`, `ThumbsDown`,
 * `LGTM`, `OnIt`, `2022`) — never a unicode character. Case sensitivity is
 * NOT confirmed by the vendor, so a key's case is never changed. The names are
 * the vendor page's own list, in page order (scripts/fixtures/lark-emoji-
 * types.json, pinned by test-channel-reactions: same count, same names, every
 * key in the reaction-key alphabet, every glyph one emoji cluster). The glyph
 * is OURS — the nearest unicode picture drawn as TEXT (Lark's own art is its
 * sticker set; a reaction is content, drawn as the reader's emoji) — and the
 * label the English words the picker searches.
 */
const LARK_EMOJI = Object.freeze([
  ['OK', '👌', 'ok'], ['THUMBSUP', '👍', 'thumbs up'], ['THANKS', '🙏', 'thanks'], ['MUSCLE', '💪', 'muscle'], ['FINGERHEART', '🫰', 'finger heart'],
  ['APPLAUSE', '👏', 'applause'], ['FISTBUMP', '👊', 'fist bump'], ['JIAYI', '➕', 'plus one'], ['DONE', '✅', 'done'], ['SMILE', '🙂', 'smile'],
  ['BLUSH', '😊', 'blush'], ['LAUGH', '😄', 'laugh'], ['SMIRK', '😏', 'smirk'], ['LOL', '😂', 'lol'], ['FACEPALM', '🤦', 'facepalm'],
  ['LOVE', '😍', 'love'], ['WINK', '😉', 'wink'], ['PROUD', '😎', 'proud'], ['WITTY', '🤓', 'witty'], ['SMART', '🧐', 'smart'],
  ['SCOWL', '😒', 'scowl'], ['THINKING', '🤔', 'thinking'], ['SOB', '😭', 'sob'], ['CRY', '😢', 'cry'], ['ERROR', '😵', 'error'],
  ['NOSEPICK', '😑', 'nose pick'], ['HAUGHTY', '😤', 'haughty'], ['SLAP', '🤚', 'slap'], ['SPITBLOOD', '🤕', 'spit blood'], ['TOASTED', '🥵', 'toasted'],
  ['GLANCE', '👀', 'glance'], ['DULL', '😐', 'dull'], ['INNOCENTSMILE', '😇', 'innocent smile'], ['JOYFUL', '😆', 'joyful'], ['WOW', '😮', 'wow'],
  ['TRICK', '😜', 'trick'], ['YEAH', '✌️', 'yeah'], ['ENOUGH', '🙅', 'enough'], ['TEARS', '🥲', 'tears'], ['EMBARRASSED', '😅', 'embarrassed'],
  ['KISS', '😗', 'kiss'], ['SMOOCH', '😘', 'smooch'], ['DROOL', '🤤', 'drool'], ['OBSESSED', '🥰', 'obsessed'], ['MONEY', '🤑', 'money'],
  ['TEASE', '😝', 'tease'], ['SHOWOFF', '🤩', 'show off'], ['COMFORT', '🫂', 'comfort'], ['CLAP', '🙌', 'clap'], ['PRAISE', '🌟', 'praise'],
  ['STRIVE', '✊', 'strive'], ['XBLUSH', '😳', 'flushed'], ['SILENT', '🤐', 'silent'], ['WAVE', '👋', 'wave'], ['WHAT', '❓', 'what'],
  ['FROWN', '☹️', 'frown'], ['SHY', '🙈', 'shy'], ['DIZZY', '😵\u200d💫', 'dizzy'], ['LOOKDOWN', '🙄', 'look down'], ['CHUCKLE', '🤭', 'chuckle'],
  ['WAIL', '😫', 'wail'], ['CRAZY', '🤪', 'crazy'], ['WHIMPER', '🥺', 'whimper'], ['HUG', '🤗', 'hug'], ['BLUBBER', '😿', 'blubber'],
  ['WRONGED', '😣', 'wronged'], ['HUSKY', '🐕', 'husky'], ['SHHH', '🤫', 'shhh'], ['SMUG', '😼', 'smug'], ['ANGRY', '😡', 'angry'],
  ['HAMMER', '🔨', 'hammer'], ['SHOCKED', '😱', 'shocked'], ['TERROR', '😨', 'terror'], ['PETRIFIED', '😰', 'petrified'], ['SKULL', '💀', 'skull'],
  ['SWEAT', '😓', 'sweat'], ['SPEECHLESS', '😶', 'speechless'], ['SLEEP', '😴', 'sleep'], ['DROWSY', '😪', 'drowsy'], ['YAWN', '🥱', 'yawn'],
  ['SICK', '😷', 'sick'], ['PUKE', '🤮', 'puke'], ['BETRAYED', '😞', 'betrayed'], ['HEADSET', '🎧', 'headset'], ['EatingFood', '🍜', 'eating'],
  ['MeMeMe', '🙋', 'me me me'], ['Sigh', '😮\u200d💨', 'sigh'], ['Typing', '⌨️', 'typing'], ['Lemon', '🍋', 'lemon'], ['Get', '📥', 'got it'],
  ['LGTM', '🆗', 'looks good to me'], ['OnIt', '🏃', 'on it'], ['OneSecond', '⏳', 'one second'], ['VRHeadset', '🥽', 'vr headset'], ['YouAreTheBest', '🏅', 'you are the best'],
  ['SALUTE', '🫡', 'salute'], ['SHAKE', '🤝', 'handshake'], ['HIGHFIVE', '✋', 'high five'], ['UPPERLEFT', '↖️', 'upper left'], ['ThumbsDown', '👎', 'thumbs down'],
  ['SLIGHT', '🙃', 'slight'], ['TONGUE', '😛', 'tongue'], ['EYESCLOSED', '😌', 'eyes closed'], ['RoarForYou', '🦁', 'roar for you'], ['CALF', '🐮', 'calf'],
  ['BEAR', '🐻', 'bear'], ['BULL', '🐂', 'bull'], ['RAINBOWPUKE', '🌈', 'rainbow puke'], ['ROSE', '🌹', 'rose'], ['HEART', '❤️', 'heart'],
  ['PARTY', '🎉', 'party'], ['LIPS', '💋', 'lips'], ['BEER', '🍺', 'beer'], ['CAKE', '🎂', 'cake'], ['GIFT', '🎁', 'gift'],
  ['CUCUMBER', '🥒', 'cucumber'], ['Drumstick', '🍗', 'drumstick'], ['Pepper', '🌶️', 'pepper'], ['CANDIEDHAWS', '🍢', 'candied haws'], ['BubbleTea', '🧋', 'bubble tea'],
  ['Coffee', '☕', 'coffee'], ['Yes', '🙆', 'yes'], ['No', '🚫', 'no'], ['OKR', '🎯', 'okr'], ['CheckMark', '✔️', 'check mark'],
  ['CrossMark', '❌', 'cross mark'], ['MinusOne', '➖', 'minus one'], ['Hundred', '💯', 'hundred'], ['AWESOMEN', '🤘', 'awesome'], ['Pin', '📌', 'pin'],
  ['Alarm', '⏰', 'alarm'], ['Loudspeaker', '📢', 'loudspeaker'], ['Trophy', '🏆', 'trophy'], ['Fire', '🔥', 'fire'], ['BOMB', '💣', 'bomb'],
  ['Music', '🎵', 'music'], ['XmasTree', '🎄', 'christmas tree'], ['Snowman', '⛄', 'snowman'], ['XmasHat', '🎅', 'santa hat'], ['FIREWORKS', '🎆', 'fireworks'],
  ['2022', '🐯', '2022'], ['REDPACKET', '🧧', 'red packet'], ['FORTUNE', '💰', 'fortune'], ['LUCK', '🍀', 'luck'], ['FIRECRACKER', '🧨', 'firecracker'],
  ['StickyRiceBalls', '🍡', 'sticky rice balls'], ['HEARTBROKEN', '💔', 'heartbroken'], ['POOP', '💩', 'poop'], ['StatusFlashOfInspiration', '💡', 'flash of inspiration'], ['18X', '🔞', '18+'],
  ['CLEAVER', '🔪', 'cleaver'], ['Soccer', '⚽', 'soccer'], ['Basketball', '🏀', 'basketball'], ['GeneralDoNotDisturb', '⛔', 'do not disturb'], ['Status_PrivateMessage', '💬', 'private message'],
  ['GeneralInMeetingBusy', '📅', 'in a meeting'], ['StatusReading', '📖', 'reading'], ['StatusInFlight', '✈️', 'in flight'], ['GeneralBusinessTrip', '🧳', 'business trip'], ['GeneralWorkFromHome', '🏠', 'working from home'],
  ['StatusEnjoyLife', '🏖️', 'enjoying life'], ['GeneralTravellingCar', '🚗', 'travelling by car'], ['StatusBus', '🚌', 'bus'], ['GeneralSun', '☀️', 'sun'], ['GeneralMoonRest', '🌙', 'resting'],
  ['MoonRabbit', '🐇', 'moon rabbit'], ['Mooncake', '🥮', 'mooncake'], ['JubilantRabbit', '🐰', 'jubilant rabbit'], ['TV', '📺', 'tv'], ['Movie', '🎬', 'movie'],
  ['Pumpkin', '🎃', 'pumpkin'], ['BeamingFace', '😁', 'beaming face'], ['Delighted', '😃', 'delighted'], ['ColdSweat', '😥', 'cold sweat'], ['FullMoonFace', '🌝', 'full moon face'],
  ['Partying', '🥳', 'partying'], ['GoGoGo', '🏁', 'go go go'], ['ThanksFace', '🥹', 'thanks face'], ['SaluteFace', '🫡', 'salute face'], ['Shrug', '🤷', 'shrug'],
  ['ClownFace', '🤡', 'clown face'], ['HappyDragon', '🐉', 'happy dragon'],
].map(([key, glyph, label]) => Object.freeze({ key, glyph, label })));
/** The picker's quick row (≤ 24): the everyday answers in a work chat. */
const LARK_QUICK = Object.freeze(['THUMBSUP', 'OK', 'DONE', 'THANKS', 'Get', 'OnIt', 'LGTM', 'JIAYI', 'MUSCLE', 'APPLAUSE', 'HEART', 'PARTY',
  'Fire', 'Hundred', 'CheckMark', 'CrossMark', 'SMILE', 'LAUGH', 'LOVE', 'THINKING', 'WOW', 'FACEPALM', 'SOB', 'ThumbsDown']);

/** The vendor's name for ONE record (lane R5): the brand it was created in —
 *  Feishu (open.feishu.cn, the default) or Lark international. A declared
 *  label the client words with t(), never derived from the kind. */
function vendorNameOf(record) {
  const r = record || {};
  const b = BRANDS.includes(r.brand) ? r.brand : (r.options && BRANDS.includes(r.options.brand) ? r.options.brand : 'feishu');
  return b === 'lark' ? i18nKey('Lark') : i18nKey('Feishu');
}
/** The refresh token is valid for 7 days and RE-ISSUED at every automatic
 *  refresh (`tokenFromExchange` slides `refreshExpiresAt`), so a running
 *  instance never needs a re-authorization — only one off for longer. */
const RENEW_WINDOW_MS = 7 * 24 * 3600e3;

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
/** The send verdict from the HELD scopes alone (inc-muk9jj0j-rel3): PURE — the
 *  engine re-judges every chat of the account when its credential changes;
 *  `convCaps` uses the SAME rule (its chat lookup is the READ half). */
function sendCapsOf(scopes) {
  const send = hasSendScopes({ scopes: Array.isArray(scopes) ? scopes : [] });
  return { sendAs: send ? ['user'] : [], why: send ? null : 'send-scope-not-granted' };
}
/** THE SCOPE VERDICT, grown a reactions half (lane channel-threads, spec §2.5): PURE — the engine re-judges every
 *  chat of the account when its credential changes, so reading / adding reactions narrows exactly like sending.
 *  `add` rides `im:message` (already asked for); `read` needs `im:message.reactions:read` (or `:readonly`). */
function capsOfScopes(scopes) {
  const sc = Array.isArray(scopes) ? scopes : [];
  const send = sendCapsOf(sc);
  const read = REACTIONS_READ_SCOPES.some((s) => sc.includes(s));
  const add = REACTIONS_WRITE_SCOPES.some((s) => sc.includes(s));
  return { ...send, reactions: { read, add, why: read && add ? null : 'reactions-scope-not-granted' } };
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
/** The tokens `textOf` writes for a picture / a video (R3: also the
 *  attachment's `placeholder`, so the two can never spell it differently). */
const IMAGE_TOKEN = '[image]';
const VIDEO_TOKEN = '[video]';
/** A post's body: `{title, content}` at the top (the `im/v1` list answer) or
 *  under a locale key (`zh_cn` / `en_us` — the event and some older answers).
 *  ONE reader for the text AND the attachments (R3: the two used to disagree
 *  about the wrapper, so a wrapped post named "[image]" with no attachment). */
const postBody = Blocks.larkPostBody;   // §25: the ONE reader lives with the render rung (text, attachments AND blocks read it)
function postText(c0) {
  const c = postBody(c0);
  const lines = Array.isArray(c && c.content) ? c.content : [];
  const out = [];
  if (c && c.title) out.push(String(c.title));
  for (const line of lines) {
    if (!Array.isArray(line)) continue;
    out.push(line.map((el) => {
      if (!el || typeof el !== 'object') return '';
      switch (el.tag) {
        // lane channel-rich (D1): markup in an element is READ (never printed) — the same reader as the blocks
        case 'text': case 'md': return Blocks.larkPlainText(String(el.text || ''));
        case 'a': return `${Blocks.markupPlainLine(String(el.text || ''))}${el.href ? ` (${el.href})` : ''}`;
        case 'at': return `@${Blocks.markupPlainLine(String(el.user_name || '')) || el.user_id || ''}`;
        case 'img': return IMAGE_TOKEN;
        case 'media': return VIDEO_TOKEN;
        case 'emotion': return `[${el.emoji_type || 'emoji'}]`;
        case 'code_block': return String(el.text || '');
        case 'hr': return '—';
        default: return Blocks.larkPlainText(String(el.text || ''));
      }
    }).join(''));
  }
  return out.join('\n');
}
/** An interactive card's words for an agent (lane channel-rich, D1): "[card] <title>" then its elements' text. */
function cardText(c) {
  const title = Blocks.markupPlainLine(Blocks.cardTitleOf(c));
  const body = Blocks.blocksToPlain(Blocks.larkCardBlocks(c, [], {})).trim();
  return [title ? `[card] ${title}` : '[card]', body].filter(Boolean).join('\n');
}
/** Plain text for every `msg_type` this adapter recognises; an unknown type
 *  is named rather than dropped (a message that was sent is a message). */
function textOf(item) {
  // lane channel-rich (D1): NO tag-shaped `<…>` survives into `rec.text` — the markup reader for a body that
  // carries it, the wall (‹…›) for anything left. GUARDED (security verify, 2026-09-28): a body the reader
  // cannot read is its raw words behind the wall, never a throw — a throwing normalizer is a poison message
  // that fails every pass of its conversation
  try { return Blocks.quoteTags(textOfRaw(item)); } catch {
    const c = parseContent(item && item.body && item.body.content);
    return Blocks.quoteTags(String((c && (c.text || c.title)) || `[${(item && item.msg_type) || 'message'}]`).slice(0, 64 * 1024));
  }
}
function textOfRaw(item) {
  const c = parseContent(item.body && item.body.content);
  if (item.deleted === true) return '[deleted]';
  switch (item.msg_type) {
    case 'text': return Blocks.larkPlainText(String((c && c.text) || ''));
    case 'post': return postText(c);
    case 'image': return IMAGE_TOKEN;
    case 'file': return `[file: ${(c && c.file_name) || 'file'}]`;
    case 'audio': return '[audio]';
    case 'media': return `[video${c && c.file_name ? `: ${c.file_name}` : ''}]`;
    case 'sticker': return '[sticker]';
    case 'share_chat': return '[shared a chat]';
    case 'share_user': return '[shared a contact]';
    case 'merge_forward': return '[forwarded messages]';
    case 'interactive': return cardText(c);
    case 'system': return Blocks.larkPlainText(String((c && (c.text || c.template)) || '[system]'));
    case 'location': return `[location${c && c.name ? `: ${c.name}` : ''}]`;
    case 'folder': return `[folder: ${(c && c.file_name) || 'folder'}]`;
    default: return `[${item.msg_type || 'message'}]`;
  }
}
/** Attachments a message carries (2026-09-26: FETCHED on demand through
 *  `fetchAttachment`): an image's `image_key`, a file / media / audio's
 *  `file_key`, and every image and video INSIDE a rich-text `post`
 *  (`img.image_key`, `media.file_key`). `mime` 'image/*' is what
 *  `type=image` is asked with (the resource endpoint answers the concrete
 *  type, which the cache stores). R3 (2026-09-26, "lark图像不能预览吗？"): an
 *  image carries `placeholder: '[image]'` — the token `textOf` wrote for it —
 *  so the window can drop that line once the picture itself is drawn — and NO
 *  invented name (the vendor gives a picture none: the window says "image" in
 *  the device's language, the cache keeps the resource's own file name). */
function attachmentsOf(item) {
  const c = parseContent(item.body && item.body.content) || {};
  if (item.msg_type === 'image' && c.image_key) return [{ id: c.image_key, name: null, bytes: null, mime: 'image/*', placeholder: IMAGE_TOKEN }];
  if ((item.msg_type === 'file' || item.msg_type === 'media' || item.msg_type === 'audio' || item.msg_type === 'folder') && c.file_key) return [{ id: c.file_key, name: c.file_name || item.msg_type, bytes: null, mime: item.msg_type === 'media' ? 'video/*' : item.msg_type === 'audio' ? 'audio/*' : null }];
  if (item.msg_type === 'post') {
    const out = [];
    for (const line of postBody(c).content) for (const el of Array.isArray(line) ? line : []) {
      if (!el || typeof el !== 'object') continue;
      if (el.tag === 'img' && el.image_key) out.push({ id: String(el.image_key), name: null, bytes: null, mime: 'image/*', placeholder: IMAGE_TOKEN });
      else if (el.tag === 'media' && el.file_key) out.push({ id: String(el.file_key), name: el.file_name || 'video', bytes: null, mime: 'video/*', placeholder: VIDEO_TOKEN });
    }
    return out;
  }
  return [];
}
/** `mentions[]` in ORDINAL order: `@_user_1` is mentions[0] (design §4). */
function mentionsOf(item) {
  const ms = Array.isArray(item.mentions) ? item.mentions.slice() : [];
  const ord = (m) => { const mm = /^@_user_(\d+)$/.exec(String((m && m.key) || '')); return mm ? Number(mm[1]) : Number.MAX_SAFE_INTEGER; };
  ms.sort((a, b) => ord(a) - ord(b));
  return ms.map((m) => ({ id: String((m && m.id) || ''), name: String((m && m.name) || '') }));
}

// ── D3 (lane channel-rich, 2026-09-28): A BOT HAS A NAME ────────────────
// The owner: "lark 里还有标记为 app 的情况，其实是个 bot 应该是有名字的". A
// sender with `sender_type: 'app'` is an APPLICATION (its id an `app_id`,
// `cli_…`), and the chat-members endpoint never lists bots — so its name
// comes from the application API: `GET /open-apis/application/v6/
// applications/:app_id?lang=…` with a TENANT token (scope
// `admin:app.info:readonly`, or `application:application:self_manage` for
// our own app). ONE resolver: the names live here, per app id, beside the
// member names (the same 6 h TTL; a REFUSAL is remembered as long, so a
// missing scope is asked once, not per message, and said once in the log),
// and every surface reads `author.name`. A name a message's own mentions
// carry for that app id is taken for free. When nothing names it: "Bot" +
// the id's last four characters — NEVER the literal "app".
/** app_id → {name|null, at, why} — module-wide: an app id names one application whichever account reads it. */
const APP_NAMES = new Map();
const APP_NAMES_MAX = 2000;
/** The row's words when nothing names the bot. */
function botFallbackName(appId) {
  const id = String(appId || '').replace(/[^A-Za-z0-9]/g, '');
  return id ? `Bot ${id.slice(-4)}` : 'Bot';
}
/** The name this process knows for an app id (resolved, or a message's mention), else ''. */
function knownAppName(appId) {
  const h = APP_NAMES.get(String(appId || ''));
  return h && h.name ? h.name : '';
}
function rememberAppName(appId, name, { at = Date.now(), why = null, weak = false } = {}) {
  const id = String(appId || '');
  if (!id) return;
  const cur = APP_NAMES.get(id);
  if (weak && cur && cur.name) return;   // a mention's name never overwrites the API's
  APP_NAMES.set(id, { name: name ? (peerName(name, 200) || null) : null, at, why, weak: !!weak });
  if (APP_NAMES.size > APP_NAMES_MAX) APP_NAMES.delete(APP_NAMES.keys().next().value);
}
/** The name an app sender is shown with: the resolved one, else the fallback. */
function appNameOf(appId, names = null) {
  return (names && typeof names.get === 'function' && names.get(String(appId))) || knownAppName(appId) || botFallbackName(appId);
}
/** Free names: a message that @-mentions an application carries its name (`id_type: app_id`). */
function seedAppNamesFrom(item, at = Date.now()) {
  for (const m of Array.isArray(item && item.mentions) ? item.mentions : []) {
    if (m && m.id_type === 'app_id' && m.id && m.name) rememberAppName(String(m.id), Blocks.markupPlainLine(String(m.name)), { at, weak: true });
  }
}
/** THE READ-TIME VIEW of a stored record (the engine asks it for every read — the window, an agent's read,
 *  a search): a bot a record stored before D3 calls "app" gets its name (or the fallback), and a text a
 *  record stored before D1 carries markup in is read by the same markup reader. The store is never rewritten. */
function recordView(record) {
  const r = record;
  if (!r || typeof r !== 'object') return r;
  let out = r;
  const a = r.author || {};
  if (a.isBot && (!a.name || a.name === 'app' || /^Bot( [A-Za-z0-9]{1,4})?$/.test(a.name))) {
    const nm = appNameOf(a.id);
    if (nm !== a.name) out = { ...out, author: { ...a, name: nm } };
  }
  const type = String((r.raw && r.raw.msg_type) || '');
  if ((type === 'text' || type === 'post' || type === 'system' || type === 'interactive' || !type) && Blocks.carriesTag(r.text)) {
    out = { ...out, text: Blocks.quoteTags(Blocks.larkPlainText(r.text)) };
  }
  return out;
}

/** ONE vendor item → ONE ChannelRecord. `names` maps open_id → display name
 *  (chat members, cached) and app_id → application name (D3); `selfId` is
 *  the authorizing user's open_id. */
function toRecord(adapterId, convId, item, { names = new Map(), selfId = null } = {}) {
  const sender = item.sender || {};
  const sid = String(sender.id || '');
  const text = textOf(item);
  const mentions = mentionsOf(item);
  seedAppNamesFrom(item);
  const isApp = sender.sender_type === 'app';
  return makeRecord({
    adapterId, convId,
    vendorId: String(item.message_id || ''),
    at: Number(item.create_time) || 0,
    author: { id: sid, name: isApp ? appNameOf(sid, names) : (names.get(sid) || ''), isSelf: !!selfId && sid === selfId, isBot: isApp },
    text,
    mentions,
    attachments: attachmentsOf(item),
    // §25: the render tree from the VENDOR item (the post's links / mentions /
    // pictures survive here and nowhere else — `text` is flattened)
    blocks: Blocks.larkToBlocks(item, mentions, { names, text }),
    // THE RECORD'S PLACE (lane channel-threads, vendor facts L1–L3): `parent_id` is what it answers, the
    // THREAD is `thread_id` (an `omt_…` topic) else the reply chain's `root_id`, and the ROOT message is
    // `root_id` — kept as `root` (it used to be dropped whenever a thread id existed, so the root of an
    // `omt_` thread could only be guessed); makeRecord drops a self-reference and a root with no place
    replyTo: item.parent_id ? String(item.parent_id) : null,
    threadKey: item.thread_id ? String(item.thread_id) : (item.root_id ? String(item.root_id) : null),
    root: item.root_id ? String(item.root_id) : null,
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
function typedFailure(status, body, what, retryAfterSec = null) {
  const code = body && Number(body.code);
  const msg = (body && (body.msg || body.error_description || body.error)) || `HTTP ${status}`;
  if (status === 401 || CODE_AUTH.has(code)) return new ChannelError('auth-expired', `${what}: ${msg} (${code || status})`, { retryable: false, detail: { code, status } });
  // lane R5: the vendor's `x-ogw-ratelimit-reset` (seconds) rides the refusal — the engine waits exactly that, never a 15-minute park
  if (status === 429 || CODE_RATE.has(code)) return new ChannelError('rate-limited', `${what}: ${msg} (${code || status})`, { retryable: true, detail: { code, status, retryAfterSec: Number.isFinite(retryAfterSec) ? retryAfterSec : null } });
  if (status === 403 || CODE_FORBIDDEN.has(code)) {
    // lane lark-search-poll (§2.5): the vendor's own words name the scope it wants ("… one of these privileges …") —
    // read BOUNDED (the first 4 KiB, ≤ 8 names of ≤ 64 characters in the scope alphabet) into `requiredScopes`
    const requiredScopes = requiredScopesOf(msg);
    return new ChannelError('forbidden', `${what}: ${msg} (${code || status})`, { retryable: false, detail: { code, status, ...(requiredScopes.length ? { requiredScopes } : {}) } });
  }
  if (status === 404 || CODE_NOT_FOUND.has(code)) return new ChannelError('not-found', `${what}: ${msg} (${code || status})`, { retryable: false, detail: { code, status } });
  if (status >= 500) return new ChannelError('transport', `${what}: ${msg} (${status})`, { retryable: true, detail: { code, status } });
  return new ChannelError('vendor-error', `${what}: ${msg} (${code || status})`, { retryable: false, detail: { code, status } });
}

/** The scope names a refusal's words carry (Lark's "required one of these privileges: [a, b]"), bound before parse:
 *  the first 4 KiB only, a linear scan, ≤ 8 names, each ≤ 64 characters of the scope alphabet. */
const SCOPE_NAME_RE = /(?<![A-Za-z0-9_.:])[a-z][a-z0-9_]{0,31}(?::[a-z0-9_.]{1,40}){1,3}(?![A-Za-z0-9_.:])/g;   // whole tokens only — a truncated prefix of an over-long one is not a scope
function requiredScopesOf(msg) {
  const head = String(msg == null ? '' : msg).slice(0, 4096);
  const out = [];
  for (const m of head.matchAll(SCOPE_NAME_RE)) {
    const x = m[0];
    if (x.length <= 64 && !out.includes(x)) out.push(x);
    if (out.length >= 8) break;
  }
  return out;
}

/** A bounded JSON round trip; a network failure is `transport` (retryable). */
async function callJson(fetchFn, url, { method = 'GET', headers = {}, body = null, what = 'lark', signal = null } = {}) {
  // client-from-mount verify r4: what this request CARRIES in its secret fields (the app secret, a refresh
  // token, the Bearer) never comes back in a refusal's words — scrubbed by exact value before the error is built
  const sent = sentSecrets({ fields: body, headers });
  let r;
  try {
    r = await fetchFn(url, {
      method, headers: { Accept: 'application/json', ...(body != null ? { 'Content-Type': 'application/json; charset=utf-8' } : {}), ...headers },
      body: body == null ? undefined : JSON.stringify(body),
      signal: signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (e) {
    throw new ChannelError('transport', withoutSent(`${what}: ${(e && e.message) || e}`, sent), { retryable: true });
  }
  let parsed = null;
  try { parsed = await r.json(); } catch { parsed = null; }
  if (!r.ok || !parsed || (parsed.code !== undefined && Number(parsed.code) !== 0)) throw typedFailure(r.status, withoutSent(parsed, sent), what, retryAfterSeconds(r.headers));
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

  const meter = typeof deps.meter === 'function' ? deps.meter : () => {};   // 2026-09-26: one unit per request SENT
  const pace = typeof deps.pace === 'function' ? deps.pace : async () => {};   // lane R5: awaited BEFORE every request (drain rule 18's bucket)
  const walks = new Map();      // convId -> { stopAt, pageToken, newest, at, count }; a THREAD walk is keyed `${convId}#${threadKey}`
  const members = new Map();    // convId -> { names: Map, at }
  const topicForbidden = new Map();   // convId -> until (a 230071 "this group does not support replies in threads", remembered)
  // lane lark-search-poll: the SINGLE chats this adapter learned of (a feed hit's `is_p2p_chat`, a describe) — U7: the
  // chat lookup may refuse a p2p id under a user token, so for these the membership answer is the last good history
  // read (`p2pRead`) and an author is named through the contact lookup (`peerNames`, cached MEMBERS_TTL_MS)
  const p2pIds = new Set();
  const p2pRead = new Map();    // convId -> the last instant its history() answered
  const peerNames = new Map();  // open_id -> { name, at }
  /** The consent's scope list: the base set + the reactions READ scope unless the owner turned it off (OPTIONS —
   *  on by default); `without` = the optional scopes the one narrowing retry dropped. */
  // lane lark-search-poll: + the change feed's two scopes unless the owner turned the search off (on by default)
  const consentScopes = (without = []) => [...SCOPES, ...(optionOf(record, 'reactions') === 'read' ? [REACTIONS_READ_SCOPES[0]] : []), ...(optionOf(record, 'search') !== 'off' ? [P2P_READ_SCOPE, SEARCH_SCOPE] : [])].filter((x) => !(Array.isArray(without) && without.includes(x)));
  const sleep = (ms) => new Promise((r) => { const t = setTimeout(r, ms); if (t.unref) t.unref(); });

  /** THIS ACCOUNT's credential binding (2026-09-22): `cluster:<k>` / `own`,
   *  handed down by the engine (`deps.credentialKey`) and read LIVE off the
   *  record as a fallback (the legacy stamp lands after construction); null
   *  = the row's own pick. EVERY resolveIntegration below carries it, so
   *  the consent, the refresh, the status and the Test all name ONE tenant app. */
  const credentialKeyOf = () => (typeof deps.credentialKey === 'string' && deps.credentialKey) || (record && typeof record.credentialKey === 'string' && record.credentialKey) || null;
  /** The app credential, from THE resolver. `null` = none/missing, with why. */
  function credential() {
    const credentialKey = credentialKeyOf();
    if (!resolveIntegration) return { values: null, why: 'no integration resolver was handed to this adapter', missing: [], credentialKey };
    let r;
    try { r = resolveIntegration('lark', { credentialKey }); } catch (e) { return { values: null, why: `integration lookup failed: ${(e && e.message) || e}`, missing: [], credentialKey }; }
    if (!r || r.source === 'none' || (Array.isArray(r.missing) && r.missing.length)) {
      return { values: null, why: (r && r.why) || 'no Lark app credential is configured', whyCode: (r && r.whyCode) || null, whyParams: (r && r.whyParams) || null, missing: (r && r.missing) || [], source: r ? r.source : 'none', credentialKey };
    }
    return { values: r.values, why: null, missing: [], source: r.source, clusterLabel: r.clusterLabel || null, clusterKey: r.clusterKey || null, credentialKey };
  }

  let unsaved = null;   // verify r5: {token, supersedes} — a refreshed token the store could not persist, held until the store's next chance
  function readToken() {
    if (!tokens) return { token: null, why: 'no token store was handed to this adapter' };
    const t = tokens.read();
    if (!t || !t.token) { unsaved = null; return { token: null, why: (t && t.why) || 'never-authenticated' }; }
    // verify r5: a refreshed token the store could not persist stands in for the one it superseded (the vendor
    // ROTATED it — the old one is retired) until the store holds anything else (cleared, re-authorized)
    if (unsaved) { if (String(t.token.refresh_token || '') === unsaved.supersedes) return { token: unsaved.token, why: null }; unsaved = null; }
    return { token: t.token, why: null };
  }

  /** A live access token — refreshed through the app credential when inside
   *  the margin. `auth-expired` when the refresh token is dead.
   *  ONE REFRESH IN FLIGHT PER ADAPTER (lane R5 verify r4): the vendor ROTATES
   *  the refresh token (the v2 refresh answers a new one and retires the old),
   *  so 12 concurrent callers at one expiry were 12 paced refresh POSTs with
   *  the SAME old token — the first succeeded, the other eleven were
   *  `invalid_grant` and each stamped the STALE token back over the fresh one
   *  (`invalidGrantAt`): the account logged itself out and asked the owner to
   *  re-authorize. Now siblings wait for the one refresh and read what it wrote. */
  let refreshing = null;
  async function accessToken() {
    const cred = credential();
    if (!cred.values) throw new ChannelError('auth-expired', `Lark app credential missing: ${cred.why}`, { retryable: false, detail: { needsCredentials: true } });
    const { token, why } = readToken();
    if (!token) throw new ChannelError('auth-expired', `Lark is not connected (${why})`, { retryable: false });
    if (token.invalidGrantAt) throw new ChannelError('auth-expired', 'Lark refresh token was refused — re-authorize', { retryable: false });   // verify r5: a dead grant is not POSTed again per request (auth.state already said needs-reauth)
    if (unsaved && unsaved.token === token) await persistToken(token, unsaved.supersedes);   // verify r5: the store's next chance at a token it could not persist
    if (token.access_token && Number(token.expiresAt) > now() + REFRESH_MARGIN_MS) return token.access_token;
    if (!token.refresh_token) throw new ChannelError('auth-expired', 'Lark access token expired and no refresh token is held — re-authorize', { retryable: false });
    if (Number(token.refreshExpiresAt) && Number(token.refreshExpiresAt) <= now()) throw new ChannelError('auth-expired', 'Lark refresh token expired — re-authorize', { retryable: false });
    if (refreshing) { await refreshing; return accessToken(); }   // a sibling's refresh: wait for it, then read what it wrote
    refreshing = refreshAccessToken(cred, token).finally(() => { refreshing = null; });
    const got = await refreshing;
    return got || accessToken();   // verify r5: a refresh SUPERSEDED while in flight (a re-authorize landed, a sibling entry's rotation won) wrote nothing — the store's token is the one to use
  }
  /** Persist a token the vendor answered (verify r5). The v2 refresh ROTATES the refresh token — the old one is retired
   *  the moment the vendor answers — so a write the store refuses (a full disk) used to mean the next refresh POSTed a
   *  retired token: `invalid_grant`, stamped, the account logged itself out (measured: ONE failed write ⇒ needs-reauth).
   *  The token is kept in memory as the truth and written again at the next request; a restart before it lands loses it. */
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
        const w = await tokens.write(next, { expiresAt: next.refreshExpiresAt, scopes: next.scopes, supersedes: over });
        if (w && w.superseded) { if (unsaved && unsaved.token === next) unsaved = null; return { written: false, superseded: true }; }
        unsaved = null; return { written: true };
      } catch (e) {
        unsaved = { token: next, supersedes: over };
        log.warn && log.warn(`[channels] lark: the refreshed token could not be persisted (${(e && e.message) || e}) — held in memory and written again at the next request`);
        return { written: false, failed: true };
      }
    }).finally(() => { if (persisting && persisting.p === p) persisting = null; });
    persisting = { token: next, p };
    return p;
  }
  async function refreshAccessToken(cred, token) {
    let d;
    try {
      await pace(1);
      // verify r6: the token was captured BEFORE the pace wait — a disconnect / re-authorize that landed meanwhile would
      // send this POST with a dropped or superseded refresh token (one vendor call the owner had ended); re-read first
      const t2 = readToken().token;
      if (!t2) throw new ChannelError('auth-expired', 'Lark was disconnected while its refresh waited for its pace — the refresh was not sent', { retryable: false, detail: { tokenDropped: true } });
      if (String(t2.refresh_token || '') !== String(token.refresh_token || '')) return null;
      meter(1);
      d = await callJson(fetchFn, `${H.open}/open-apis/authen/v2/oauth/token`, {   // gated-inline: token-refresh
        method: 'POST', what: 'lark token refresh',
        body: { grant_type: 'refresh_token', client_id: cred.values.appId, client_secret: cred.values.appSecret, refresh_token: token.refresh_token },
      });
    } catch (e) {
      // A refresh the vendor REFUSES is a fact about the token record, so it
      // is stamped on it: `auth.state()` answers `needs-reauth` from now on
      // (the row's re-authorize control), instead of retrying a dead grant
      // on every pass — ONLY while the stored token is still the one this
      // refresh tried (a newer one, written meanwhile, is never overwritten
      // with a stale copy).
      if (e instanceof ChannelError && e.code === 'auth-expired' && tokens) {
        const cur = readToken().token;
        // verify r5: a refusal for a token the store has since REPLACED (a re-authorize, a sibling entry's rotation
        // that landed first — the straggler of a rotation) is superseded, not a fact about the account
        if (cur && !cur.invalidGrantAt && String(cur.refresh_token || '') !== String(token.refresh_token || '')) return null;
        if (cur && String(cur.refresh_token || '') === String(token.refresh_token || '')) await tokens.write({ ...cur, invalidGrantAt: now() }, { expiresAt: cur.refreshExpiresAt || null, scopes: cur.scopes || [], supersedes: String(cur.refresh_token || '') });
      }
      throw e;
    }
    const next = tokenFromExchange(d, token);
    // verify r5: written ONLY while the store still holds the token this refresh tried — a disconnect (cleared) or a
    // re-authorize (a different token) that landed while the POST was in flight is never overwritten by this late
    // write (25 of 50 trials reverted a re-authorize to the old family's rotated token). Superseded ⇒ re-read.
    const cur = readToken().token;
    if (!cur) throw new ChannelError('auth-expired', 'Lark was disconnected while its token was refreshed — the refreshed token was discarded, the request was not sent', { retryable: false, detail: { tokenDropped: true } });
    if (String(cur.refresh_token || '') !== String(token.refresh_token || '')) return null;
    const w = await persistToken(next, String(token.refresh_token || ''));   // verify r6: the door's compare-and-swap — superseded at apply time ⇒ nothing written, the caller re-reads
    if (w && w.superseded) return null;
    return next.access_token;
  }
  /** THE BEARER AS IT IS NOW (lane R5 verify r4): the store, re-read
   *  synchronously AFTER the pace wait — a disconnect that landed meanwhile
   *  refuses the request by name (never sent with a token the owner dropped);
   *  a re-authorize's or a sibling's refresh's newer token is the one sent. */
  function bearerNow(at) {
    const t = readToken().token;
    if (!t || !t.access_token) throw new ChannelError('auth-expired', 'Lark was disconnected while the request waited for its pace — the request was not sent', { retryable: false, detail: { tokenDropped: true } });
    return t.access_token !== at && Number(t.expiresAt) > now() ? t.access_token : at;
  }
  /** Is the token the store holds NOW past its expiry (verify r5)? A queue longer than the token's remaining life is
   *  refreshed ONCE (single-flight) before the send — never an expired bearer on the wire. */
  const bearerExpired = () => { const t = readToken().token; return !!(t && t.access_token) && !(Number(t.expiresAt) > now()); };

  function tokenFromExchange(d, prev = {}) {
    const t = now();
    return {
      access_token: String(d.access_token || ''),
      expiresAt: t + Number(d.expires_in || 7200) * 1000,
      refresh_token: String(d.refresh_token || prev.refresh_token || ''),
      refreshExpiresAt: d.refresh_token_expires_in ? t + Number(d.refresh_token_expires_in) * 1000 : (prev.refreshExpiresAt || null),
      scopes: String(d.scope || (prev.scopes || []).join(' ')).split(/\s+/).filter(Boolean),
      openId: prev.openId || null, name: prev.name || null, unionId: prev.unionId || null, userId: prev.userId || null, brand,
    };
  }

  // THE GATE: every Lark request goes token → pace → meter → send, with the
  // bearer re-read after the wait. The census in test-channels-lark-shape
  // reads this file: an outbound call outside it is `// gated-inline: <id>`
  // (its own pace + meter right above it) or `// ungated: <id>` with a row in
  // `UNGATED` naming the reason — or the suite is red.
  const api = async (pathq, opts = {}) => {
    let at = await accessToken();
    await pace(1);   // lane R5: the per-SECOND shape — then charged the moment it is sent
    meter(1);
    if (bearerExpired()) at = await accessToken();   // verify r5: the bearer EXPIRED while the request waited — one refresh before the send
    return callJson(fetchFn, `${H.open}/open-apis${pathq}`, { ...opts, headers: { Authorization: `Bearer ${bearerNow(at)}`, ...(opts.headers || {}) } });
  };

  /** Chat member names, ONCE per conversation per MEMBERS_TTL_MS — best
   *  effort: a refused lookup leaves the ids bare rather than failing the
   *  pass (a message with an unnamed author is still a message). */
  async function namesFor(convId) {
    const c = members.get(convId);
    if (c && now() - c.at < MEMBERS_TTL_MS) return c.names;
    const names = new Map();
    let refused = false;
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
      refused = true;
      if (!p2pIds.has(convId)) log.warn && log.warn(`[channels] lark: member names for ${convId} unavailable (${(e && e.message) || e}) — authors will show their ids`);
    }
    members.set(convId, { names, at: now(), refused });
    return names;
  }
  /** ONE person's name by open id (lane lark-search-poll, §3.3): `contact/v3/users/:id` under the user token (scope
   *  `contact:user.base:readonly`, already in SCOPES) — cached MEMBERS_TTL_MS, a refusal remembered as no name. */
  async function contactName(openId) {
    const id = String(openId || '');
    if (!Feed.idOf(id)) return null;
    const c = peerNames.get(id);
    if (c && now() - c.at < MEMBERS_TTL_MS) return c.name;
    let name = null;
    try {
      const d = await api(`/contact/v3/users/${encodeURIComponent(id)}?user_id_type=open_id`, { what: 'lark user' });
      const u = (d && d.data && d.data.user) || {};
      name = typeof u.name === 'string' && u.name.trim() ? u.name.trim().slice(0, 200) : null;
    } catch (e) {
      if (e instanceof ChannelError && e.code === 'auth-expired') throw e;
      name = null;
    }
    peerNames.set(id, { name, at: now() });
    if (peerNames.size > 2000) peerNames.delete(peerNames.keys().next().value);
    return name;
  }
  /** A SINGLE chat's authors, named (U7): the chat's `/members` refused a p2p id ⇒ at most two unknown sender ids are
   *  looked up by the contact API (a single chat has two people) — otherwise every author shows as a bare `ou_…`. */
  async function namesWithPeers(convId, items, names) {
    const m = members.get(convId);
    if (!p2pIds.has(convId) || !m || !m.refused) return names;
    const unknown = [...new Set(items.map((x) => String((x.sender && x.sender.id) || '')).filter((x) => x && !names.has(x)))].slice(0, 2);
    for (const id of unknown) { const n = await contactName(id); if (n) names.set(id, n); }
    return names;
  }

  /** D3: THE TENANT TOKEN (the application API accepts no user token) — the self-built app's
   *  `tenant_access_token/internal` exchange, cached for the vendor's `expire` less a margin. */
  let tenant = null;   // {token, until}
  let tenantInflight = null;
  async function tenantToken() {
    if (tenant && tenant.until > now() + REFRESH_MARGIN_MS) return tenant.token;
    if (tenantInflight) return tenantInflight;
    tenantInflight = (async () => {
      const cred = credential();
      if (!cred.values || !cred.values.appId || !cred.values.appSecret) throw new ChannelError('auth-expired', `Lark app credential missing: ${cred.why || 'no app id / secret'}`, { retryable: false, detail: { needsCredentials: true } });
      await pace(1);   // D3: a vendor request like any other — paced, then metered
      meter(1);
      const d = await callJson(fetchFn, `${H.open}/open-apis/auth/v3/tenant_access_token/internal`, { method: 'POST', what: 'lark tenant token', body: { app_id: cred.values.appId, app_secret: cred.values.appSecret } });   // gated-inline: tenant-token
      if (!d || !d.tenant_access_token) throw new ChannelError('vendor-error', 'lark tenant token: no tenant_access_token in the answer', { retryable: false });
      tenant = { token: String(d.tenant_access_token), until: now() + Math.max(60, Number(d.expire) || 7200) * 1000 };
      return tenant.token;
    })().finally(() => { tenantInflight = null; });
    return tenantInflight;
  }
  /** D3: the application names of these app ids — cached (hit or refusal) for MEMBERS_TTL_MS, at most
   *  APP_LOOKUPS_PER_CALL asked per call, best effort (a refusal is the fallback name, said ONCE). */
  const APP_LOOKUPS_PER_CALL = 5;
  const appInflight = new Map();
  const lang = brand === 'lark' ? 'en_us' : 'zh_cn';
  async function appNamesFor(appIds) {
    const want = [...new Set((appIds || []).map(String).filter(Boolean))].filter((id) => { const h = APP_NAMES.get(id); return !h || h.weak || now() - h.at >= MEMBERS_TTL_MS; }).slice(0, APP_LOOKUPS_PER_CALL);
    for (const id of want) {
      if (appInflight.has(id)) { try { await appInflight.get(id); } catch {} continue; }
      const run = (async () => {
        try {
          const tt = await tenantToken();
          await pace(1);   // D3: paced, then metered
          meter(1);
          const d = await callJson(fetchFn, `${H.open}/open-apis/application/v6/applications/${encodeURIComponent(id)}?lang=${lang}`, { what: 'lark app info', headers: { Authorization: `Bearer ${tt}` } });   // gated-inline: app-name
          const app = (d && d.data && d.data.app) || {};
          const i18n = Array.isArray(app.i18n) ? app.i18n.find((x) => x && x.i18n_key === lang && x.name) : null;
          const name = peerName(Blocks.markupPlainLine(String((i18n && i18n.name) || app.app_name || '')), 200) || '';
          rememberAppName(id, name || null, { at: now(), why: name ? null : 'unnamed' });
        } catch (e) {
          // a refusal (the scope `admin:app.info:readonly` not granted — 210508 / 403; no such app — 210504/210506)
          // or a failure: the fallback name, remembered as long as a hit so the next message does not ask again
          const why = (e && e.code) || 'vendor-error';
          const prev = APP_NAMES.get(id);
          // a TRANSIENT failure (a rate limit, the network) is asked again in 5 minutes, a refusal in MEMBERS_TTL_MS
          const transient = why === 'rate-limited' || why === 'transport';
          rememberAppName(id, prev && prev.name ? prev.name : null, { at: transient ? now() - MEMBERS_TTL_MS + 5 * 60e3 : now(), why });
          if (!prev || prev.why !== why) log.warn && log.warn(`[channels] lark: the application name of ${id} is not available (${(e && e.message) || e}) — shown as "${botFallbackName(id)}"; granting the app the scope admin:app.info:readonly names it`);
        }
      })();
      appInflight.set(id, run);
      try { await run; } finally { appInflight.delete(id); }
    }
  }
  const appSendersOf = (items) => (items || []).filter((m) => m && m.sender && m.sender.sender_type === 'app' && m.sender.id).map((m) => String(m.sender.id));
  /** ONE resolver for a page's names: chat members (open_id) + application names (app_id). */
  async function allNamesFor(convId, items) {
    const names = new Map(await namesFor(convId));
    for (const m of items || []) seedAppNamesFrom(m, now());
    const apps = appSendersOf(items);
    if (apps.length) { await appNamesFor(apps); for (const id of apps) { const nm = knownAppName(id); if (nm) names.set(id, nm); } }
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
      try { names = await Promise.race([allNamesFor(convId, [item]), sleep(NAMES_WAIT_MS).then(() => (members.get(convId) || { names: new Map() }).names)]); }
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
  async function sendImpl(convId, { text, replyTo = null, idemKey, as = 'user', replyAnchor = null, inThread = false, placement = null } = {}) {
    if (as !== 'user') throw new ChannelError('send-not-available', `lark: sending as '${as}' is not declared (caps.sendAs: user)`, { retryable: false, detail: { sendAs: caps.sendAs } });
    // r6 verify F1 (the belt under the engine's gate): the reply endpoint names only the MESSAGE, never the chat —
    // a message id of chat B posted into B whatever `convId` said. So a reply is sent only with the anchor's STORED
    // facts handed down by the engine (`replyAnchor` = the record it found in THIS conversation's log) and only when
    // they name this chat: the record's own `raw.chat_id` (the vendor's field, kept at ingest) must be `convId`.
    // Known without a vendor call; anything else is refused by name before any request.
    if (replyTo) {
      const a = replyAnchor && typeof replyAnchor === 'object' ? replyAnchor : null;
      const chatOf = a && a.raw && a.raw.chat_id ? String(a.raw.chat_id) : null;
      if (!a || String(a.vendorId || '') !== String(replyTo) || String(a.convId || '') !== String(convId) || (chatOf !== null && chatOf !== String(convId))) {
        throw new ChannelError('not-found', `lark: the message this reply answers (${String(replyTo).slice(0, 80)}) is not a stored message of chat ${String(convId).slice(0, 80)} — nothing was sent (reply_anchor_elsewhere)`, { retryable: false, detail: { why: 'reply-anchor-elsewhere', replyTo: String(replyTo).slice(0, 200), chatOfAnchor: chatOf } });
      }
    }
    if (!hasSendScopes(readToken().token)) throw new ChannelError('forbidden', 'lark: the held token has no send scopes (im:message + im:message.send_as_user) — reconnect to request them', { retryable: false, detail: { why: 'send-scope-not-granted' } });
    const uuid = uuidFor(idemKey);
    const body = { msg_type: 'text', content: JSON.stringify({ text: String(text == null ? '' : text) }), uuid };
    // lane channel-threads (L6): a reply INTO a thread says so — `reply_in_thread` is a PROMISE the composer made
    // (a reply to a message already in a thread lands there anyway; one to a plain message mints the thread)
    // (2026-09-28: the registry hands a declared PLACEMENT — `thread` sets the flag, `quote` is the plain reply endpoint)
    if (replyTo && (placement === 'thread' || (placement === null && inThread === true))) body.reply_in_thread = true;
    let at0 = await accessToken();
    let d;
    try {
      await pace(1);   // lane R5 verify r4: a send is a vendor request like any other — paced, then metered (it was neither)
      meter(1);
      if (bearerExpired()) at0 = await accessToken();   // verify r5: an expired bearer is refreshed before the send, never sent
      const at = bearerNow(at0);
      d = replyTo
        ? await callJson(fetchFn, `${H.open}/open-apis/im/v1/messages/${encodeURIComponent(String(replyTo))}/reply`, { method: 'POST', what: 'lark reply', headers: { Authorization: `Bearer ${at}` }, body })   // gated-inline: send-reply
        : await callJson(fetchFn, `${H.open}/open-apis/im/v1/messages?receive_id_type=chat_id`, { method: 'POST', what: 'lark send', headers: { Authorization: `Bearer ${at}` }, body: { receive_id: convId, ...body } });   // gated-inline: send
    } catch (e) {
      if (e instanceof ChannelError && e.code === 'transport') throw new ChannelError('transport', `${e.message} — the request left and the answer was lost`, { retryable: true, detail: { ...(e.detail || {}), lost: true, uuid } });
      // lane channel-threads (L6 errors): 230019 the thread is gone, 230071 this group does not support replies in
      // threads (REMEMBERED on the conversation — convCaps narrows `threads.replyInto` for 6 h), 230072 a merged message
      const vc = e instanceof ChannelError && e.detail ? Number(e.detail.code) : null;
      if (vc === 230071) { topicForbidden.set(convId, now() + TOPIC_FORBIDDEN_TTL_MS); throw new ChannelError('forbidden', `${e.message} — this group does not allow replies in threads`, { retryable: false, detail: { code: vc, why: 'topic-forbidden' } }); }
      if (vc === 230019) throw new ChannelError('not-found', `${e.message} — the thread no longer exists`, { retryable: false, detail: { code: vc, why: 'thread-not-found' } });
      if (vc === 230072) throw new ChannelError('forbidden', `${e.message} — a merged message cannot be replied to`, { retryable: false, detail: { code: vc, why: 'merged-message' } });
      throw e;
    }
    const m = (d && d.data) || {};
    const senderType = m.sender && m.sender.sender_type ? String(m.sender.sender_type) : null;
    return {
      ok: true, vendorMessageId: String(m.message_id || ''), at: Number(m.create_time) || now(), sentAs: 'user', uuid,
      observed: { senderType, senderId: m.sender && m.sender.id ? String(m.sender.id) : null, ...(m.thread_id ? { threadKey: String(m.thread_id) } : {}) },
    };
  }

  // ── lane channel-threads: the THREAD WALK and the REACTIONS (L3, L7, L8) ──
  /** ONE thread's replies, newest-first TO ITS ANCHOR — `history()`'s walk over `container_id_type=thread` (no time
   *  window on a thread listing — L3), keyed `${convId}#${threadKey}`, the same TTL and first-ingest bound. The
   *  records are messages of the CHAT (the same log, the same dedup); a root the answer repeats dedups there. */
  async function threadHistoryImpl(convId, threadKey, { anchor = null, limit = 50, initialMax = null, stopAt = null } = {}) {
    const size = Math.min(50, Math.max(1, Number(limit) || 50));
    const firstMax = Number(initialMax) > 0 ? Math.min(FIRST_INGEST_MAX, Number(initialMax)) : FIRST_INGEST_MAX;
    const wk = `${convId}#${threadKey}`;
    let w = walks.get(wk);
    const continuing = !!(w && w.newest && anchor === w.newest && now() - w.at < WALK_TTL_MS);
    // `stopAt` (verify r3): the engine's PERSISTED stop of a walk that was cut mid-way — this adapter's own continuation
    // wins while it lives (one call); a fresh walk (a restart, the TTL) stops there instead of at the log's newest reply
    if (!continuing) { w = { stopAt: (stopAt ? String(stopAt) : null) || anchor || null, pageToken: null, newest: null, at: now(), count: 0, max: 0 }; w.max = w.stopAt ? FIRST_INGEST_MAX : firstMax; walks.set(wk, w); }
    const p = new URLSearchParams({ container_id_type: 'thread', container_id: String(threadKey), sort_type: 'ByCreateTimeDesc', page_size: String(size) });
    if (w.pageToken) p.set('page_token', w.pageToken);
    const d = await api(`/im/v1/messages?${p}`, { what: 'lark thread messages' });
    w.at = now();
    // THE VENDOR'S OWN WORD ON WHERE A MESSAGE LIVES (verify r1, IDENTITY): a thread listing answers by
    // `container_id` whatever chat the caller named, and every item carries its `chat_id` — an item of ANOTHER
    // chat never becomes a record of this conversation (it is counted and dropped, never stamped with `convId`)
    const all = ((d.data && d.data.items) || []).filter((m) => m && m.message_id);
    const items = all.filter((m) => !m.chat_id || String(m.chat_id) === String(convId));
    const foreign = all.length - items.length;
    if (foreign && log.warn) log.warn(`[channels] lark: thread ${String(threadKey).slice(0, 64)} of ${convId}: ${foreign} message(s) of another chat in its listing — dropped`);
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
    // the walk's bound is the one it STARTED with (verify r3: a continuation call carries no `initialMax`, so a deep walk
    // — the pane's older page — used to run on to FIRST_INGEST_MAX whatever depth it asked for)
    const max = Number(w.max) > 0 ? w.max : (w.stopAt ? FIRST_INGEST_MAX : firstMax);
    const done = reached || !next || w.count >= max;
    // `bounded` (verify r3): the walk stopped at its count bound while the vendor held more — the pane says the older
    // replies are out of reach here, never a silent "start of the thread"
    const bounded = !reached && !!next && w.count >= max;
    if (done) walks.delete(wk); else w.pageToken = next;
    const records = fresh.reverse().map((m) => toRecord(adapterId, convId, m, { names, selfId }));
    return { records: records.slice(-size), anchor: w.newest || w.stopAt || null, reachedAnchor: done, complete: done, ...(foreign ? { foreign } : {}), ...(bounded ? { bounded: true } : {}) };
  }
  /** ONE message's reactions (L8): the vendor's list, paged to `has_more === false` but at most REACTION_PAGES_MAX
   *  pages (150); grouped by emoji_type with the reactors' open ids and their reaction ids aligned (the engine keeps
   *  OUR ids for an unreact and never serves them). `truncated` when the vendor held more. */
  async function reactionsImpl(convId, { messageId } = {}) {
    if (!messageId) throw new ChannelError('not-found', 'lark: a reaction list needs its message id', { retryable: false });
    const byKey = new Map();
    let pageToken = null, pages = 0, truncated = false;
    do {
      const p = new URLSearchParams({ page_size: '50', user_id_type: 'open_id' });
      if (pageToken) p.set('page_token', pageToken);
      const d = await api(`/im/v1/messages/${encodeURIComponent(String(messageId))}/reactions?${p}`, { what: 'lark reactions' });
      for (const it of (d.data && d.data.items) || []) {
        const key = it && it.reaction_type && String(it.reaction_type.emoji_type || '');
        if (!key) continue;
        const op = it.operator || {};
        const who = String(op.operator_id || '');
        let e = byKey.get(key);
        if (!e) { e = { key, count: 0, by: [], rids: [] }; byKey.set(key, e); }
        e.count++;
        if (who && e.by.length < 20) { e.by.push(who); e.rids.push(String(it.reaction_id || '')); }
      }
      pageToken = nextToken(d.data);
      pages++;
    } while (pageToken && pages < REACTION_PAGES_MAX);
    if (pageToken) truncated = true;
    // `pages` (verify r3): the requests this list SENT — the engine's reaction ceiling counts requests, not lists
    return { list: [...byKey.values()], truncated, at: now(), pages };
  }
  /** Typed refusals of the reaction calls (F9): the vendor's codes → the closed set + a named `why`. */
  function reactionFailure(e) {
    if (!(e instanceof ChannelError)) return e;
    const vc = e.detail ? Number(e.detail.code) : null;
    if (vc === 231001) return new ChannelError('vendor-error', `${e.message} — not an emoji this channel allows`, { retryable: false, detail: { code: vc, why: 'bad-emoji' } });
    if (vc === 231003) return new ChannelError('not-found', `${e.message} — the message was recalled or cannot take a reaction`, { retryable: false, detail: { code: vc, why: 'not-reactable' } });
    if (vc === 231007) return new ChannelError('forbidden', `${e.message} — only a reaction you added can be removed`, { retryable: false, detail: { code: vc, why: 'reaction-not-mine' } });
    if (vc === 231002 || vc === 231008) return new ChannelError('forbidden', e.message, { retryable: false, detail: { code: vc, why: 'forbidden' } });
    return e;
  }
  /** ADD a reaction AS THE USER (L7): ONE paced + metered request; the answer's `reaction_id` + `action_time` are
   *  what the engine writes (a refused add writes nothing). Never retried — two adds are not idempotent. */
  async function reactImpl(convId, { messageId, key } = {}) {
    if (!messageId || !key) throw new ChannelError('not-found', 'lark: a reaction needs its message and its emoji', { retryable: false });
    let d;
    try { d = await api(`/im/v1/messages/${encodeURIComponent(String(messageId))}/reactions`, { method: 'POST', what: 'lark add reaction', body: { reaction_type: { emoji_type: String(key) } } }); }
    catch (e) { throw reactionFailure(e); }
    const m = (d && d.data) || {};
    const op = m.operator || {};
    return { ok: true, reactionId: m.reaction_id ? String(m.reaction_id) : null, at: Number(m.action_time) || now(), actor: op.operator_id ? String(op.operator_id) : ((readToken().token || {}).openId || null) };
  }
  /** REMOVE OUR reaction (L8): needs the vendor's `reaction_id` (the engine knows ours, or lists first). */
  async function unreactImpl(convId, { messageId, reactionId } = {}) {
    if (!messageId || !reactionId) throw new ChannelError('not-found', 'lark: removing a reaction needs its reaction id', { retryable: false, detail: { why: 'reaction-not-mine' } });
    try { await api(`/im/v1/messages/${encodeURIComponent(String(messageId))}/reactions/${encodeURIComponent(String(reactionId))}`, { method: 'DELETE', what: 'lark remove reaction' }); }
    catch (e) { throw reactionFailure(e); }
    return { ok: true, at: now() };
  }

  return {
    live,
    auth: {
      /** Four-valued and honest (§13): the credential question FIRST. */
      async state() {
        const cred = credential();
        const credentialKey = cred.credentialKey || null;   // the view NAMES the account's credential
        if (!cred.values) return { state: 'needs-credentials', expiresAt: null, scopes: [], why: cred.why, whyCode: cred.whyCode || null, whyParams: cred.whyParams || null, missing: cred.missing.slice(), credentialSource: cred.source || 'none', credentialKey };
        const { token, why } = readToken();
        if (!token) return { state: 'unknown', expiresAt: null, scopes: [], why, credentialSource: cred.source, credentialKey };
        const refreshExpiresAt = Number(token.refreshExpiresAt) || null;
        if (refreshExpiresAt && refreshExpiresAt <= now()) return { state: 'needs-reauth', expiresAt: refreshExpiresAt, scopes: token.scopes || [], why: 'refresh-token-expired', credentialSource: cred.source, credentialKey };
        if (token.invalidGrantAt) return { state: 'needs-reauth', expiresAt: refreshExpiresAt, scopes: token.scopes || [], why: 'refresh-refused', credentialSource: cred.source, credentialKey };
        return { state: 'connected', expiresAt: refreshExpiresAt, scopes: token.scopes || [], why: null, credentialSource: cred.source, clusterKey: cred.clusterKey || null, credentialKey, user: token.name || token.openId || null, brand, renews: true, renewWindowMs: RENEW_WINDOW_MS };
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
          buildConsentUrl: ({ redirectUri, state, without = [] }) => `${H.accounts}/open-apis/authen/v1/authorize?` + new URLSearchParams({ client_id: appId, redirect_uri: redirectUri, scope: consentScopes(without).join(' '), state }),
          // the ORDERED groups this consent actually names (a group whose scopes the owner's options leave out is not offered)
          optionalScopes: OPTIONAL_SCOPE_GROUPS.map((g) => g.filter((x) => consentScopes().includes(x))).filter((g) => g.length),
          exchange: async ({ code, redirectUri, cancelled = null, narrowed = [] }) => {
            const d = await callJson(fetchFn, `${H.open}/open-apis/authen/v2/oauth/token`, {   // ungated: consent-exchange
              method: 'POST', what: 'lark token exchange',
              body: { grant_type: 'authorization_code', client_id: appId, client_secret: appSecret, code, redirect_uri: redirectUri },
            });
            const tok = tokenFromExchange(d);
            // verify r6: A CONSENT MUST NAME ITS ACCOUNT — a token user_info could not name bound nothing (the record
            // then took anyone's next consent) and, on a bound record, landed unjudged; refused, nothing stored
            try {
              const me = await callJson(fetchFn, `${H.open}/open-apis/authen/v1/user_info`, { what: 'lark user info', headers: { Authorization: `Bearer ${tok.access_token}` } });   // ungated: consent-user-info
              const idOf = (v) => (v == null ? null : String(v).trim() || null);   // verify r7: a whitespace id is NOBODY
              tok.openId = idOf(me.data && me.data.open_id);
              tok.name = (me.data && me.data.name) || null;
              tok.unionId = idOf(me.data && me.data.union_id);   // verify r5: the identity the record is bound to — open_id is per app, union_id per developer, user_id per tenant
              tok.userId = idOf(me.data && me.data.user_id);
            } catch (e) { throw new ChannelError('vendor-error', namelessSentence('Lark', `user_info: ${(e && e.message) || e}`), { retryable: false, detail: { nameless: true } }); }
            if (!tok.openId) throw new ChannelError('vendor-error', namelessSentence('Lark', 'user_info carried no open_id'), { retryable: false, detail: { nameless: true } });
            // verify r7: `consent.cancelled` — the door refuses, INSIDE its serialized write, a consent whose flow was
            // cancelled meanwhile (a disconnect / cancel / newer sign-in used to be undone by this write landing late)
            // owner ruling (2026-09-28): a consent the person narrowed (Lark refused an optional scope on its page) carries
            // WHAT it dropped — the account says it by name, never a silent narrower consent
            const refusedScopes = (Array.isArray(narrowed) ? narrowed : []).filter((x) => OPTIONAL_SCOPES.includes(x) && !(tok.scopes || []).includes(x));
            if (tokens) await tokens.write(tok, { expiresAt: tok.refreshExpiresAt, scopes: tok.scopes, consent: { cancelled }, refusedScopes });
            return { ok: true, user: tok.name || tok.openId || null, scopes: tok.scopes, refusedScopes };
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
        const d = await api(`/im/v1/chats/${encodeURIComponent(convId)}`, { what: 'lark chat' });
        const chat = (d && d.data) || {};
        const verdict = capsOfScopes(((readToken().token || {}).scopes) || []);
        // lane channel-threads (L11): 话题群 = chat_mode 'topic' (every message opens a thread), 话题形式群 =
        // group_message_type 'thread'; a 230071 answer is remembered (the group refuses replies in threads)
        const mode = chat.chat_mode === 'topic' ? 'topic' : chat.group_message_type === 'thread' ? 'thread' : 'chat';
        const forbiddenUntil = Number(topicForbidden.get(convId)) || 0;
        const forbidden = forbiddenUntil > now();
        if (!forbidden && forbiddenUntil) topicForbidden.delete(convId);
        const { reactions: rx, ...send } = verdict;
        // reading needs the read scope — held only once the owner chose "Also read" and re-authorized (OPTIONS)
        return {
          read: 'yes', ...send, at: now(),
          threads: { replyInto: send.sendAs.length > 0 && !forbidden, mode, why: forbidden ? 'topic-forbidden' : (send.sendAs.length ? null : send.why) },
          reactions: { read: rx.read, add: rx.add, why: rx.why },
        };
      } catch (e) {
        // lane lark-search-poll (U7): a SINGLE chat the chat lookup refuses under a user token is still readable when its
        // history answered — the membership answer is that read (narrowing only: the send half is the held scopes')
        if (e instanceof ChannelError && (e.code === 'forbidden' || e.code === 'not-found') && p2pIds.has(convId) && Number(p2pRead.get(convId)) > 0) {
          const { reactions: rx, ...send } = capsOfScopes(((readToken().token || {}).scopes) || []);
          return { read: 'yes', ...send, at: now(), threads: { replyInto: send.sendAs.length > 0, mode: 'chat', why: send.sendAs.length ? null : send.why }, reactions: { read: rx.read, add: rx.add, why: rx.why } };
        }
        if (e instanceof ChannelError && (e.code === 'forbidden' || e.code === 'not-found')) return { read: 'no', sendAs: [], why: 'not-a-member', at: now(), threads: { replyInto: false, mode: null, why: 'not-a-member' }, reactions: { read: false, add: false, why: 'not-a-member' } };
        throw e;
      }
    },

    /**
     * THE CHANGE FEED'S PAGE (lane lark-search-poll, design §2 / §4): `POST /im/v1/messages/search` with an EMPTY query
     * and the window as `time_range` (ISO 8601, whole seconds) — the pagination rides the query string like every Lark
     * list (`page_size` ≤ 30, `page_token`; U9 — a refused shape parks the feed by name), `chat_type` only for the
     * single-chat catch-up. Each item's `meta_data` becomes ONE hit through the PURE `normalizeHit` in the DECLARED unit
     * (ms); `display_info` — the snippet, unbounded peer text, possibly markup — is never read, kept or logged here. The
     * field NAMES (never values) of the first page this process reads are logged once (the fixture's check against
     * reality — U1: which field carries the message id).
     */
    async changes({ from, to, pageToken = null, chatType = null, pageSize = 30 } = {}) {
      const size = Math.min(caps.changeFeed.pageSize, Math.max(1, Number(pageSize) || caps.changeFeed.pageSize));
      const q = new URLSearchParams({ user_id_type: 'open_id', page_size: String(size) });
      if (pageToken) q.set('page_token', String(pageToken));
      const body = { query: '', time_range: { start_time: Feed.isoSec(from), end_time: Feed.isoSec(to) } };
      if (chatType === 'p2p' || chatType === 'group') body.chat_type = chatType;
      const d = await api(`/im/v1/messages/search?${q}`, { method: 'POST', what: 'lark message search', body });
      const data = (d && d.data) || {};
      const items = Array.isArray(data.items) ? data.items : [];
      // verify r1: a page LARGER than asked is the vendor ignoring `page_size` — refused as the page contract (the feed parks
      // by name, design §2.6 (a)); it used to be cut to the first 30 with the rest counted "malformed" and silently lost
      if (items.length > size) throw new ChannelError('vendor-error', `lark message search: ${items.length} items for a page size of ${size} — the vendor ignored page_size`, { retryable: false, detail: { contract: 'page-size' } });
      if (!feedFieldsSaid && items.length) {
        feedFieldsSaid = true;
        // names only, each bounded to the field alphabet (a vendor key is never logged whole)
        const nameOk = (k) => /^[A-Za-z0-9_.]{1,64}$/.test(k);
        const top = [...new Set(items.flatMap((it) => (it && typeof it === 'object' ? Object.keys(it).filter(nameOk) : [])))].slice(0, 20);
        const meta = [...new Set(items.flatMap((it) => (it && it.meta_data && typeof it.meta_data === 'object' ? Object.keys(it.meta_data).filter(nameOk) : [])))].slice(0, 30);
        log.log && log.log(`[channels] lark: the message search's first page carries fields ${top.join(', ')}; meta_data: ${meta.join(', ')} (names only — the fixture's check against reality)`);
      }
      const t = now();
      const hits = [];
      let malformed = 0;
      for (const it of items) {
        const m = it && typeof it.meta_data === 'object' && it.meta_data ? it.meta_data : null;
        if (!m) { malformed++; continue; }
        // U1: the message id — the doc sample's `meta_data.message_id`, else the item's own id
        const v = Feed.normalizeHit({ convId: m.chat_id, vendorId: m.message_id != null ? m.message_id : (it.message_id != null ? it.message_id : it.id), createTime: m.create_time, updateTime: m.update_time, threadKey: m.thread_id || null, isP2p: m.is_p2p_chat === true || m.is_p2p_chat === 'true', fromId: m.from_id || null }, { unit: caps.changeFeed.timeUnit, now: t });
        if (!v.ok) { malformed++; continue; }
        if (v.hit.isP2p) { p2pIds.add(v.hit.convId); if (p2pIds.size > 5000) p2pIds.delete(p2pIds.values().next().value); }
        hits.push(v.hit);
      }
      const next = nextToken(data);
      const total = Number.isFinite(Number(data.total)) ? Number(data.total) : null;
      return { hits, more: data.has_more === true && !!next, pageToken: next, total, malformed };
    },

    /**
     * NAME A CONVERSATION THE FEED FOUND (§3.3): ① the chat lookup's `name` (U7 — it may refuse a p2p id under a user
     * token); ② else the PEER — a hit author who is not this account — through the contact lookup; ③ else no title (the
     * client words "Single chat"). Never the raw chat id. A failure never fails anything but a dead token.
     */
    async describe(convId, { peerIds = [] } = {}) {
      let requests = 0;
      try {
        requests++;
        const d = await api(`/im/v1/chats/${encodeURIComponent(convId)}`, { what: 'lark chat' });
        const chat = (d && d.data) || {};
        const kind = chat.chat_mode === 'p2p' ? 'dm' : (chat.chat_mode ? 'group' : (p2pIds.has(convId) ? 'dm' : null));
        if (kind === 'dm') p2pIds.add(convId);
        if (typeof chat.name === 'string' && chat.name.trim()) return { title: chat.name.trim(), kind, peers: [], requests };
      } catch (e) {
        if (e instanceof ChannelError && e.code === 'auth-expired') throw e;
      }
      const self = (readToken().token || {}).openId || null;
      const peers = [];
      for (const id of (Array.isArray(peerIds) ? peerIds : []).map(String).filter((x) => x && x !== self).slice(0, 2)) {
        const c = peerNames.get(id);
        if (!(c && now() - c.at < MEMBERS_TTL_MS)) requests++;
        const name = await contactName(id);
        if (name) peers.push({ id, name });
      }
      if (peers.length) return { title: peers.map((x) => x.name).join(', '), kind: 'dm', peers, requests };
      return { title: null, kind: p2pIds.has(convId) ? 'dm' : null, peers: [], requests };
    },

    /** The account's own open id (a reaction's `mine`). */
    selfId() { return (readToken().token || {}).openId || null; },
    threadHistory: threadHistoryImpl,
    reactions: reactionsImpl,
    react: reactImpl,
    unreact: unreactImpl,
    /** The picker's vocabulary (L9) — a declaration, no vendor call. */
    async reactionSet() { return { keys: LARK_EMOJI.map((e) => ({ key: e.key, glyph: e.glyph, label: e.label, custom: false })), quick: LARK_QUICK.slice(), custom: false, at: now() }; },

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
    async reconcile(convId, { idemKey, sentAt = null, text = null, replyTo = null, replyAnchor = null, inThread = false, threadKey = null } = {}) {
      const selfId = (readToken().token || {}).openId || null;
      const wanted = String(text == null ? '' : text);
      const sent = Number(sentAt) || now();
      const since = sent - RECONCILE_SLACK_MS;
      let pageToken = null, scanned = 0, reachedSince = false, scanErr = null;
      // lane channel-threads (L3): a reply INTO a thread is not in the chat listing — its thread's container is
      // scanned when the thread is known (a thread id); matched by `thread_id` as well as by parent
      const inThreadScan = inThread === true && typeof threadKey === 'string' && /^omt_/.test(threadKey);
      try {
        do {
          const p = new URLSearchParams(inThreadScan ? { container_id_type: 'thread', container_id: threadKey, sort_type: 'ByCreateTimeDesc', page_size: '50' } : { container_id_type: 'chat', container_id: convId, sort_type: 'ByCreateTimeDesc', page_size: '50' });
          if (pageToken) p.set('page_token', pageToken);
          const d = await api(`/im/v1/messages?${p}`, { what: 'lark reconcile scan' });
          const items = (d.data && d.data.items) || [];
          for (const m of items) {
            scanned++;
            if (Number(m.create_time) < since) { reachedSince = true; break; }
            const mine = selfId ? String((m.sender && m.sender.id) || '') === selfId : (m.sender && m.sender.sender_type) !== 'app';
            if (!mine || m.msg_type !== 'text' || m.deleted === true) continue;
            const c = parseContent(m.body && m.body.content);
            if (c && String(c.text || '') === wanted && (!replyTo || String(m.parent_id || '') === String(replyTo) || (inThreadScan && String(m.thread_id || '') === threadKey))) {
              return { landed: true, vendorMessageId: String(m.message_id), at: Number(m.create_time) || null, detail: { how: 'found-in-chat', scanned } };
            }
          }
          pageToken = reachedSince ? null : nextToken(d.data);
          if (!pageToken) reachedSince = true;   // the vendor's last page: everything since `since` was seen
        } while (pageToken && scanned < RECONCILE_SCAN_MAX);
      } catch (e) { scanErr = e; }
      if (now() - sent < UUID_WINDOW_MS) {
        try {
          const r = await sendImpl(convId, { text: wanted, replyTo, idemKey, as: 'user', replyAnchor, inThread });
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
    async history(convId, { anchor = null, limit = 50, initialMax = null } = {}) {
      const size = Math.min(50, Math.max(1, Number(limit) || 50));
      // a FIRST ingest takes `initialMax` (one page — 2026-09-26: older
      // history is fetched on demand by `older()`), never more than the bound
      const firstMax = Number(initialMax) > 0 ? Math.min(FIRST_INGEST_MAX, Number(initialMax)) : FIRST_INGEST_MAX;
      let w = walks.get(convId);
      const continuing = !!(w && w.newest && anchor === w.newest && now() - w.at < WALK_TTL_MS);
      if (!continuing) { w = { stopAt: anchor || null, pageToken: null, newest: null, at: now(), count: 0 }; walks.set(convId, w); }
      const p = new URLSearchParams({ container_id_type: 'chat', container_id: convId, sort_type: 'ByCreateTimeDesc', page_size: String(size) });
      if (w.pageToken) p.set('page_token', w.pageToken);
      const d = await api(`/im/v1/messages?${p}`, { what: 'lark messages' });
      w.at = now();
      if (p2pIds.has(convId)) p2pRead.set(convId, now());   // lane lark-search-poll: a single chat we can read (U7's membership evidence)
      const items = ((d.data && d.data.items) || []).filter((m) => m && m.message_id);
      const names = items.length ? await namesWithPeers(convId, items, await allNamesFor(convId, items)) : new Map();
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
      const exhausted = !next || w.count >= (w.stopAt ? FIRST_INGEST_MAX : firstMax);
      const done = reached || exhausted;
      if (done) walks.delete(convId); else w.pageToken = next;
      if (done && w.stopAt && !reached) log.warn && log.warn(`[channels] lark: the stored anchor ${w.stopAt} of ${convId} is no longer served — walked ${w.count} records to ${!next ? "the vendor's last page" : `the ${FIRST_INGEST_MAX}-record bound`} and re-anchored on ${w.newest || w.stopAt}`);
      // Oldest-first within the batch (the store orders by (at, vendorId) anyway).
      const records = fresh.reverse().map((m) => toRecord(adapterId, convId, m, { names, selfId }));
      return { records, anchor: w.newest || w.stopAt || null, reachedAnchor: done, complete: done };
    },

    /**
     * HISTORY ON DEMAND (2026-09-26): ONE page of messages strictly OLDER
     * than `before` — `end_time` is the boundary in SECONDS (inclusive), so
     * the boundary second's records come back too and are dropped here by
     * `(at, vendorId)`; the store's dedup absorbs the rest. `exhausted` =
     * the vendor's last page.
     */
    async older(convId, { before = null, limit = 50 } = {}) {
      const size = Math.min(50, Math.max(1, Number(limit) || 50));
      const p = new URLSearchParams({ container_id_type: 'chat', container_id: convId, sort_type: 'ByCreateTimeDesc', page_size: String(size) });
      if (before && Number(before.at) > 0) p.set('end_time', String(Math.floor(Number(before.at) / 1000)));
      const d = await api(`/im/v1/messages?${p}`, { what: 'lark older messages' });
      const items = ((d.data && d.data.items) || []).filter((m) => m && m.message_id);
      const b = before && Number(before.at) > 0 ? before : null;
      const olderOnes = b ? items.filter((m) => { const at = Number(m.create_time) || 0; return at < Number(b.at) || (at === Number(b.at) && b.vendorId && String(m.message_id) < String(b.vendorId)); }) : items;
      const names = olderOnes.length ? await allNamesFor(convId, olderOnes) : new Map();
      const selfId = (readToken().token || {}).openId || null;
      const records = olderOnes.reverse().map((m) => toRecord(adapterId, convId, m, { names, selfId }));
      return { records: records.slice(-size), exhausted: !nextToken(d.data) && items.length < size };
    },

    /**
     * ONE ATTACHMENT's bytes (2026-09-26): `GET messages/:message_id/
     * resources/:key?type=image|file` with the user token — an image
     * (including one inside a rich text) is `type=image`, every file / audio
     * / video `type=file`. A JSON answer is the vendor's refusal, typed.
     * Bounded at 100 MB (the vendor's own no-Range ceiling).
     */
    async fetchAttachment(convId, { messageId, attachmentId, mime = null } = {}) {
      if (!messageId || !attachmentId) throw new ChannelError('not-found', 'lark: an attachment needs its message id and key', { retryable: false });
      let at = await accessToken();
      const type = /^image\//.test(String(mime || '')) ? 'image' : 'file';
      await pace(1);
      meter(1);
      if (bearerExpired()) at = await accessToken();   // verify r5: an expired bearer is refreshed before the send
      let r;
      try {
        r = await fetchFn(`${H.open}/open-apis/im/v1/messages/${encodeURIComponent(String(messageId))}/resources/${encodeURIComponent(String(attachmentId))}?type=${type}`, { headers: { Authorization: `Bearer ${bearerNow(at)}` }, signal: AbortSignal.timeout(60000) });   // gated-inline: resource
      } catch (e) { throw new ChannelError('transport', `lark resource: ${(e && e.message) || e}`, { retryable: true }); }
      const ct = String((r.headers && r.headers.get && r.headers.get('content-type')) || '');
      if (!r.ok || /application\/json/.test(ct)) {
        let body = null; try { body = await r.json(); } catch { body = null; }
        throw typedFailure(r.status || 500, body, 'lark resource', retryAfterSeconds(r.headers));
      }
      const len = Number((r.headers && r.headers.get && r.headers.get('content-length')) || 0);
      if (len > 100 * 1024 * 1024) throw new ChannelError('too-large', `lark resource: ${len} bytes is over the 100 MB bound`, { retryable: false });
      const data = Buffer.from(await r.arrayBuffer());
      const cd = String((r.headers && r.headers.get && r.headers.get('content-disposition')) || '');
      const nm = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
      return { data, mime: ct.split(';')[0].trim() || null, name: nm ? decodeURIComponent(nm[1]) : null };
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
      const d = await callJson(f, `${HOSTS[b].open}/open-apis/auth/v3/tenant_access_token/internal`, { method: 'POST', what: `lark tenant token (${b})`, body: { app_id: r.values.appId, app_secret: r.values.appSecret }, signal: signal || null });   // ungated: integration-test
      if (d && d.tenant_access_token) return { ok: true, detail: { brand: b, source: r.source, expire: d.expire || null } };
      errors.push(`${b}: no tenant_access_token in the answer`);
    } catch (e) { errors.push(`${b}: ${(e && e.message) || e}`); }
  }
  return { ok: false, error: errors.join('; ') };
}

/** §25: WHAT UNLOCKS SENDING, for the window's read-only line — the send
 *  scopes the token must HOLD, and `console: true` = they must first be
 *  enabled in the app's developer console and a version published (a
 *  re-consent alone cannot add a scope the app does not have). */
const SEND_GRANT = Object.freeze({ scopes: SEND_SCOPES, console: true });
/** lane channel-threads: WHAT UNLOCKS READING REACTIONS — the read scope (enabled in the app's console first, a
 *  version published), then the account's "Also read" option + a re-authorization (see OPTIONS). */
// `option`: the account option that WANTS reading (owner ruling 2026-09-28 — on by default; `off` silences the account's
// "can be read after one Re-authorize" line)
const REACTIONS_GRANT = Object.freeze({ scopes: Object.freeze([REACTIONS_READ_SCOPES[0]]), console: true, option: 'reactions' });
/** lane lark-search-poll (§5.3): WHAT UNLOCKS THE CHANGE FEED — the search + the single-chat read (enabled in the app
 *  console, a version published), then ONE Re-authorize; silent while the account's `search` option is off. */
const FEED_GRANT = Object.freeze({ scopes: Object.freeze([SEARCH_SCOPE, P2P_READ_SCOPE]), console: true, option: 'search' });
const adapter = { kind: KIND, caps, create, vendorNameOf, blocksOf: Blocks.larkStoredBlocks, recordView, sendGrant: SEND_GRANT, sendCapsOf, capsOfScopes, reactionsGrant: REACTIONS_GRANT, feedGrant: FEED_GRANT };
module.exports = {
  kind: KIND, caps, create, adapter, label: LABEL, integration: INTEGRATION, integrationTest, OPTIONS, UNGATED,
  EGRESS, HOSTS, BRANDS, SCOPES, SEND_SCOPES, FIRST_INGEST_MAX, WALK_TTL_MS, UUID_WINDOW_MS, UUID_MAX, RECONCILE_SLACK_MS, RECONCILE_SCAN_MAX, RENEW_WINDOW_MS,
  toRecord, textOf, mentionsOf, attachmentsOf, typedFailure, nextToken, uuidFor, hasSendScopes, vendorNameOf,
  SEND_GRANT, blocksOf: Blocks.larkStoredBlocks, sendCapsOf,
  // D3 (lane channel-rich): the ONE bot-name resolver's module half + the read-time view
  recordView, botFallbackName, appNameOf, knownAppName, rememberAppName, APP_NAMES,
  // lane channel-threads: the reaction vocabulary (L9), the scope verdict, what unlocks reading
  LARK_EMOJI, LARK_QUICK, capsOfScopes, REACTIONS_GRANT, REACTIONS_READ_SCOPES, REACTIONS_WRITE_SCOPES, REACTION_PAGES_MAX, TOPIC_FORBIDDEN_TTL_MS, OPTIONAL_SCOPES, optionOf,
  // lane lark-search-poll: the change feed's scopes, the ordered optional groups, what unlocks it, the refusal's scope reader
  SEARCH_SCOPE, P2P_READ_SCOPE, OPTIONAL_SCOPE_GROUPS, FEED_GRANT, requiredScopesOf,
};
