'use strict';
/**
 * THE CHANNELS INGEST ENGINE — scheduler, single-flight, broadcast, and THE
 * SERIALIZED INDEX OWNER (docs/design-communication-panel.zh.md §5.1, §6.1,
 * §6.2). ORCH tier, one `create(deps)` factory, wired once from server.js.
 *
 * WHAT P0a IS: the skeleton with its load-bearing parts REAL from the first
 * commit — the per-adapter loop with its single flight, the pass that appends
 * to the durable log BEFORE it advances an anchor, the ONE broadcast per pass,
 * and the index owner that makes two overlapping passes queue instead of
 * clobber each other. Filtering, assignment, the wake decision and the outbox
 * are LATER PHASES and are deliberately absent rather than stubbed: a
 * declared-but-inert slot is the failure this design argues against.
 *
 * THE ENGINE IS THE INDEX'S ONLY WRITER (§5.1). `src/channel-store.js` gives
 * it persistent primitives and deliberately offers NOBODY a "write the whole
 * index back" call, because two adapter passes are overlapping BY DESIGN
 * (single-flight is PER ADAPTER, not a global mutex) and a read-modify-write
 * around one atomic write loses whichever landed first. A clobbered ANCHOR
 * makes the next pass SKIP messages.
 *
 * AND `adapters.json` IS THE SAME FILE-WITH-TWO-WRITERS PROBLEM (r2), which
 * this engine used to have in its textbook form: `adapterRecords()` re-parsed
 * the file on every call and `pass()` wrote its own private array back from
 * OUTSIDE any serialized door. Five failing passes of an auth-expired adapter
 * persisted `consecutiveFailures: 5` alone and `0` with a healthy neighbour
 * passing beside it — so the amber "{n} failed passes ({code})" row, the ONE
 * honesty signal that compensates for a static freshness chip, is exactly what
 * got clobbered. `store.adapters` is now the same single owner as the index:
 * `live()` hands back THE object and `update(fn)` is the only way bytes land.
 *
 * THE LANE IS ASKED, NEVER READ OFF `caps` (§4/r4). The tick's cadence is
 * `laneState(...).pollCadence` and the content/kick decision is
 * `laneState(...).carryContent`; on a scan adapter the source is
 * `scanState(...)`. No scheduler code reads `caps.receive` or
 * `caps.scanSources` — that is the whole reason those two resolvers exist.
 *
 * AND THE INGEST IS GATED ON THAT ANSWER (r3). The r2 engine asked
 * `scanState()` for the CHIP and then called `adapter.history()` regardless,
 * while `scan.hostFacts` had NO producer anywhere in the product (`scanHost`
 * had zero callers; the seed wrote `hostFacts: null` and nothing replaced it),
 * so the resolver could only ever answer `host-facts-stale` — and the fake
 * adapter re-derived its own source from `caps.scanSources[process.platform]`
 * two lines under a comment saying it never would. Measured on the shipped
 * seam: 11 records ingested, anchor advanced, unread badged, chip "not
 * scanning". Now `pass()` PRODUCES the facts (trigger ③ below), `ingest()`
 * refuses a scan lane the resolver gives no source, and the source the
 * resolver chose is HANDED to `history()` — the registry refuses a scan page
 * that carries none. The chip and the log agree in both directions.
 *
 * THE PUSH LANES (P1b, design §6.4 / fence 11 / decision 18). The engine ARMS
 * a push adapter's `live` half when the resolver says a lane is wanted
 * (`pushWanted`: enabled, its switch on — an opt-in lane needs an explicit
 * `true` — and a credential to connect with) and STOPS it when the answer
 * flips; the lane is single-use, so a re-declaration or an option change
 * arms a fresh one. A pushed event lands in the durable log FIRST and the
 * handler RETURNS (= the vendor's ack) before the index moves or a client is
 * told; content rides only while `laneState().carryContent` holds (since
 * 2026-09-26 for ANY conversation of the account) — otherwise the event is a cursor KICK (one
 * kick-origin pass per KICK_MIN_INTERVAL_MS, the sleep woken, not just a
 * fetch). THE EXCLUSIVITY MEASUREMENT: while push carries content, a record a
 * TIMER pass sees first is a miss and a record a KICK pass sees first is push
 * doing its job; only records stamped after `push.contentSince` on an
 * already-anchored conversation are judged (a first walk is a backlog);
 * `pushDemotionVerdict` over the ROLLING window demotes the lane, which is
 * SAID on the row and in the log and cleared by NOTHING but a re-declaration
 * (`setPush`), which zeroes the counters and retries the lane once.
 *
 * THE AGGREGATED IM (owner ruling 2026-09-26, design §5 invariant 6 / §6.2 /
 * §6.5 / §7.3). A linked account is an IM the owner reads WHOLE: there is no
 * `tracked` gate anywhere in this file any more — discovery walks the
 * account's cursor to the end, every conversation it lists is ingested, a
 * pushed event for a conversation nobody discovered yet is still written.
 * What the gate used to buy moved: COST to the scheduler (a due time PER
 * CONVERSATION — the owner's override, else the activity tier hot / warm /
 * cold from `caps.cadenceFor`, the push safety net folded in — processed
 * most-overdue first, spending a per-account budget in the VENDOR's own unit
 * that each adapter meters as it sends: `deps.meter(units)`), PRIVACY to the
 * agent side (reach: nothing is visible to an agent until the owner assigns
 * it at one of three grains — account / pattern / conversation — or grants
 * it). The reader surface lives here too: history on demand (`loadOlder`,
 * prepended to the log, never a wake), attachments fetched through the
 * adapter into a 0600 LRU cache per account (`attachment`), search over the
 * local logs off the event loop (`search`), the owner's per-conversation
 * refresh override (`setRefresh`), a window's `watch` heartbeat (hot while
 * open) and the agent's own refresh behind a per-conversation floor
 * (`agentRefresh`). Every time and capacity number is a SETTING read live
 * through `serverSetting` with the schema's default beside it.
 *
 * THE FAKE ADAPTER IS REGISTERED ALWAYS AND INSTANTIATED NEVER, unless
 * `VIBESPACE_CHANNELS_FAKE=1`. Registering it keeps the contract suite driving
 * real code; creating a record for it would put invented conversations in a
 * user's panel.
 */
const path = require('path');
const crypto = require('crypto');
const { createChannelStore } = require('../channel-store.js');
const { createChannelRegistry, ChannelError } = require('../channels/index.js');
const { identityOf, identityMismatch, heldIdentity, mismatchSentence, namelessSentence, cancelledSentence } = require('../channel-identity.js');   // verify r5: whose account a consent may land on; r6: the held identity read off the token it holds, a nameless consent; r7: a cancelled consent
const caps = require('../channel-caps.js');
const fake = require('../channels/fake.js');
const lark = require('../channels/lark.js');
const gmail = require('../channels/gmail.js');
const { secretBox } = require('../secret-box.js');
const { OWN_KEY, CLUSTER_PREFIX } = require('./integration-store.js');   // the two credential-key forms, spelled ONCE (the store's)
const R = require('../integration-registry.js');   // PURE: the rows' `bindsPerAccount` + `clientFieldsOf` (the custom client's two fields)
const { createOAuthLoopback } = require('../oauth-loopback.js');
// P2: the PURE filter / assignment / renderer (design §7). Everything after
// `store.append` is PURE except the two ORCH calls at the end of `wake()`.
const F = require('../channel-filter.js');
const CR = require('../channel-ref.js');   // B-c127 PURE: THE NAME LADDER every human-visible conversation name takes (① name → ② description → ③ the id) + the card's ref
// P3: the outbox POLICY (state machine + direct/review + the receipt), the
// AgentReach ACL and the built-in Agents adapter (design §8, §9, §12.3).
const P = require('../channel-policy.js');
const ACL = require('../channel-acl.js');
const agents = require('../channels/agents.js');
// lane R2 verify r9: THE DRAIN'S SCHEDULING DECISION is PURE — every "what next, who is answered, when does the pass end" (src/channel-drain.js); this engine only drives it
const Drain = require('../channel-drain.js');
// R3 (2026-09-26, "lark图像不能预览吗？"): THE ONE ORDER an attachment request is
// judged in — cache first, a remembered refusal, ours only, fetchable, enabled,
// joined, the back-off, the budget, then the fetch (PURE; the vendor-whitelist
// census §7 pins that `fetchAttachment` is reached only through its `fetch`).
const Att = require('../channel-attachments.js');
// §25 (2026-09-27, the render layer): a record's typed render tree — served for
// a record stored BEFORE its adapter wrote one (the module's `blocksOf`, read
// time, the store never rewritten) — and a mail thread's title for the eye.
const Blocks = require('../channel-blocks.js');
// lane channel-threads (2026-09-28): a message's PLACE (what it answers, which thread) and its REACTIONS — PURE
// folds over the log and the side log, read at every page; the schema + bounds are channel-record's
const Thr = require('../channel-thread.js');
// lane lark-threads (B): WHO IS THIS — the owner's names for authors, the vendor's way of naming people (PURE)
const Authors = require('../channel-authors.js');
const Rx = require('../channel-reactions.js');
const { validateSide, inertFrames, inertFrameLine, peerName } = require('../channel-record.js');   // verify r2: peerName = THE ONE door for a NAME
const { toAgentText: agentText } = require('../peer-text.js');   // lane peer-census: THE belt on every record's text as it leaves the store toward an agent (read / thread / search)
// verify r1 F2: a conversation TITLE the index holds (written by discovery through peerName — before the line rule for a
// title stored earlier) is answered to an agent by read / thread read / list / search and the CLI prints it before the
// next line: judged on its way out as one inline piece, like every name.
const agentTitle = (en, fallback) => agentText((en && en.title) || fallback, { kind: 'line', max: 300 });
// verify r3 F6 (lane peer-census): AN ID IS A LINE PIECE TOO. Every id the agent's answers carry is the vendor's (or a hostile
// adapter's) — makeRecord bounds them by LENGTH only (`str` / `peerText`), never the line rule — so a vendor id (`(id …)` on
// the record's line), an UNNAMED author's id (`<id>: > yes` on one line), a mention / replyTo / threadKey id and the
// conversation KEY (`<key> — <title>` on the read head and every list row) were printed raw before the next line's `> …`
// (reproduced over the real engine). The belt is a no-op on a real id (no frame, no hidden character), so `--to <id>`
// round-trips; a hostile id is neutered in the agent's COPY only — the store keeps what a fetch needs (r2 F6's rule).
const agentId = (v, max = 512) => (v == null ? v : agentText(v, { kind: 'line', max }));
// B-a085: a mail reply's envelope in an AGENT's view — To / Cc / Subject come from the answered message's headers (a
// PEER's display names and words), each a line piece; the Message-IDs and the anchor are ids; `added` is the agent's own
const agentEnvelope = (e) => (e && typeof e === 'object' ? { ...e, anchorId: agentId(e.anchorId), to: agentText(e.to == null ? '' : e.to, { kind: 'line', max: 8000 }), cc: e.cc == null ? e.cc : agentText(e.cc, { kind: 'line', max: 8000 }), subject: e.subject == null ? e.subject : agentText(e.subject, { kind: 'line', max: 1000 }), inReplyTo: agentId(e.inReplyTo), references: agentId(e.references, 8000) } : e);
const { threadsOf: threadsRow, reactionsOf: reactionsRow } = require('../channels/index.js');
// lane lark-search-poll (B-5aab, 2026-09-28 — design §27): THE CHANGE FEED's PURE arithmetic (the window, the page's
// trust verdict, the fold into owed marks / births, the measurement); the scheduling is drain rule 21, the one lane
// answer channel-caps `feedState` — this engine only DRIVES it (`feedPage`)
const Feed = require('../channel-feed.js');

/** THE REAL ADAPTERS (P1). Each module names its integration row
 *  (`integration`), its Test runner (`integrationTest`), its per-record
 *  options (`OPTIONS`) and its label — the engine reads THOSE, never the
 *  kind: the contract suite's census forbids a branch on an adapter id
 *  anywhere outside src/channels/. A kind with no module here (the fakes) is
 *  seeded by the dev seam and never CONNECTED. */
const REAL_ADAPTERS = Object.freeze([lark, gmail]);
const realByKind = new Map(REAL_ADAPTERS.map((m) => [m.kind, m]));
/** The at-rest key for the adapters' OWN tokens (design §13: a second store
 *  from the integrations layer's — a user's consent, not an admin's
 *  credential — with its own key file). */
const KEY_FILE = '.channels-key';
/** An ACCOUNT's own OAuth client (2.369.165, design-integrations-per-
 *  account r4 §2.3): `credentialKey:'custom'` + `credential {appId,
 *  appSecretEnc}` on the adapter RECORD, the secret sealed under THIS
 *  engine's `.channels-key` — the mounts' `clientId` + `clientSecretEnc`
 *  shape. `cluster:<k>` (an env preset by key) is unchanged; `own` (the
 *  retired card's values) is copied onto the record once, reader-side. */
const CUSTOM_KEY = 'custom';
/** A consent flow started BEFORE its account exists (the account dialog's
 *  sign-in block): the token it mints waits, sealed, in memory until
 *  `connect({flowId})` creates the record — or until this long has passed. */
const PENDING_FLOW_TTL_MS = 30 * 60 * 1000;
/** DUPLICATE (r4 §8.1 #2, D4): the DECLARED set of fields a copy of an
 *  account carries — the suite derives its assertions from this table and
 *  every key has exactly one implementation in `duplicate()`. `paths` are
 *  the record paths each entry writes; nothing else on the copy differs
 *  from a fresh record of its kind. */
const DUPLICATE_FIELDS = Object.freeze([
  Object.freeze({ key: 'kind', paths: Object.freeze(['kind']), why: 'the copy is an account of the same type' }),
  Object.freeze({ key: 'client', paths: Object.freeze(['credentialKey', 'credential']), why: 'the OAuth client choice: the preset key, or the custom id + secret RE-SEALED (two accounts of one app are the common case)' }),
  Object.freeze({ key: 'filters', paths: Object.freeze(['options']), why: 'the account\'s declared filters (Gmail include query and push topic; Lark brand)' }),
  Object.freeze({ key: 'pushClaim', paths: Object.freeze(['push.claimedExclusive']), why: 'the push exclusivity DECLARATION (the switch itself starts at its default)' }),
  Object.freeze({ key: 'senderLine', paths: Object.freeze(['senderHonestyLine']), why: 'the per-channel sender honesty switch' }),
]);
/** …and what a copy NEVER carries, each for a reason (r4 §8.1 #2). */
const DUPLICATE_NEVER = Object.freeze([
  Object.freeze({ key: 'token', why: 'a login is one person\'s consent — the copy signs in on its own' }),
  Object.freeze({ key: 'refresh', why: 'a per-conversation refresh override is the original account\'s choice about its own conversations' }),
  Object.freeze({ key: 'access', why: 'access grants and notifications address the original account\'s conversations' }),
  Object.freeze({ key: 'reach', why: 'a grant names the original account\'s id' }),
  Object.freeze({ key: 'log', why: 'the message log and its cursors belong to the original account\'s conversations' }),
]);
/** The "For you" inbox key a failing adapter files under (fence 8). One key
 *  for the layer, like login-expiry-watch's `accounts`. */
const INBOX_KEY = 'channels';
/** A DECLARED human-visible string this engine files into the "For you"
 *  inbox as STRUCTURE (`i18n: {text, detail[], source}` = `{key, params}`),
 *  which the CLIENT words with its own t() — the server sends structure, the
 *  client says the words (a3 i18n). The marker is the identity; the i18n
 *  extractor censuses `i18nKey(…)` like `t(…)`, so every key has zh+ja rows.
 *  The English `text`/`detail` beside it stay: the store's dedupe key and the
 *  agent CLI's contract (test-channel-outbox / -acl pin their words). */
const i18nKey = (s) => s;
const INBOX_SOURCE = { key: i18nKey('Channels') };
const RESOLVED_BY = 'system';

/** §6.2's per-ACCOUNT budget (2026-09-26): the adapter DECLARES it in
 *  `caps.budget` = `{unit:'request'|'quota-unit', settingKey, default,
 *  metered}` — the setting it names (`channels.budgetLarkPerMin`,
 *  `channels.budgetGmailPerMin`) is read live, so this engine never names an
 *  adapter id. An undeclared adapter (the built-in Agents row, a suite's
 *  module) gets this many calls a minute, charged one per call. */
const DEFAULT_BUDGET_PER_MIN = 600;
/** The legacy export name (a suite still reads it). */
const REQUESTS_PER_MINUTE = DEFAULT_BUDGET_PER_MIN;
/** How long a window's `watch` heartbeat keeps a conversation HOT. */
const WATCH_TTL_MS = 90e3;
/** Retention runs at most this often per conversation (it rewrites the log). */
const TRIM_EVERY_MS = 6 * 3600e3;
/** Distinct authors remembered per conversation (the pattern rules' facts). */
const AUTHORS_MAX = 30;
/** A broadcast names at most this many conversations before it sends the whole digest. */
const PARTIAL_MAX = 200;
// B-f32b: the kept row facts (the digest's unread total, each account's row counts) are re-summed from every row at
// least this often (a row written past the store's door heals here)
const ROW_RESUM_MS = 60 * 1000;
// B-f32b r2 (the coordinator's ruling, 2026-10-03): an account's CLOCK census (hot / warm / cold / due — every row's
// cadence at the instant) is recomputed at most this often; a broadcast inside the window reads the last one and arms
// ONE trailing recompute + broadcast at the window's end, so the card always settles on the exact numbers
const CENSUS_EVERY_MS = 5 * 1000;
/** An attachment larger than this is refused by name (Lark serves ≤ 100 MB without Range). */
const ATTACHMENT_MAX_BYTES = 100 * 1024 * 1024;
/** Hints a history() page may hand back (Gmail's `changed` threads) — bounded. */
const DUE_HINTS_MAX = 2000;
/** Poll cadences (seconds) — the floor is the VENDOR's, so it comes from caps. */
const RECONCILE_SECONDS = 15 * 60;
/** Exponential backoff after a typed ACCOUNT failure — `transport`, `auth-expired`,
 *  `vendor-error`, … (never `rate-limited` since lane R5: see RATE_BACKOFF_MS). */
const BACKOFF_MS = [0, 30e3, 2 * 60e3, 5 * 60e3, 15 * 60e3];
/** A vendor RATE refusal is a SHORT wait (lane R5, 2026-09-26 — the owner:
 *  "gmail一直被限速 你可能要控制下gmail默认的读取速度"; three Gmail refusals of
 *  "Units per minute per user" had climbed the ladder above to its 15-minute
 *  maximum while the per-minute budget was never exceeded — the vendor meters
 *  finer than a minute). The vendor's own hint first (`Retry-After` /
 *  `x-ogw-ratelimit-reset`, carried as `err.detail.retryAfterSec`, honoured up
 *  to RATE_RETRY_AFTER_MAX_MS), else 5 s doubling to 60 s. A rate strike never
 *  advances the failure ladder (`consecutiveFailures`, the 3-strike "For you"
 *  item); a refusal that PERSISTS through RATE_STRIKES_LOUD strikes in a row
 *  (≈ 7 min of refusals despite the pace) is said once in "For you". */
const RATE_BACKOFF_MS = [5e3, 10e3, 20e3, 40e3, 60e3];
/** lane R5 verify r3: a pace reservation older than this was never metered (a contract violation) — the phantom is dropped. */
const PACE_RESERVE_TTL_MS = 2000;
/** A PACED pass is long (the owner's 873-conversation first read at one
 *  thread a second is ~15 min): it says its progress — the conversations it
 *  read so far and the account's first-read count — at most this often, never
 *  per fetch (the broadcast law: one recomputed result per change, bounded). */
const PROGRESS_EVERY_MS = 5000;
const RATE_RETRY_AFTER_MAX_MS = 15 * 60e3;
const RATE_STRIKES_LOUD = 10;
/** THE REFRESH REQUEST SET (lane R2 verify r5): a refresh is a REQUEST into
 *  the account's coalescing set, drained by the pass loop alone. At most
 *  REFRESH_QUEUE_CAP untaken waiters per account (past it:
 *  `refresh-queue-full`, by name) — an agent at CAP − REFRESH_OWNER_RESERVE,
 *  so the owner's press and a window's open are never refused by an agent's
 *  storm (r6). The numbers are the PURE drain's (src/channel-drain.js rule 1,
 *  r9); a waiter the loop has not answered within REFRESH_WAIT_MS hears
 *  `{ok, pending}` and leaves the set. */
const { REFRESH_QUEUE_CAP, REFRESH_OWNER_RESERVE } = Drain;
const REFRESH_WAIT_MS = 30e3;
/** THE CHANNELS SETTINGS THE ENGINE READS — default, min, max — the SAME
 *  numbers as their rows in src/lib/settings-schema.js (the aggregate suite
 *  pins every channels.* number row against this table: one set of bounds,
 *  two spellings, never drifting). A stored value outside them is used
 *  clamped AND SAID once per key/value (lane R2 verify, 2026-09-26: 1800
 *  typed for "at most 900" ran as 900 with no sentence anywhere). `dflt:
 *  null` = the default is the adapter module's (`caps.budget.default`). */
const SETTING_BOUNDS = Object.freeze({
  'channels.pollHotSec': { dflt: 30, min: 10, max: 300 },
  'channels.pollWarmSec': { dflt: 300, min: 30, max: 900 },
  'channels.pollColdSec': { dflt: 900, min: 60, max: 900 },      // = channel-caps COLD_MAX_SEC, the owner's 15-min maximum
  'channels.hotRecentMinutes': { dflt: 60, min: 5, max: 1440 },
  'channels.warmRecentHours': { dflt: 24, min: 1, max: 168 },
  'channels.agentRefreshFloorSec': { dflt: 20, min: 5, max: 900 },
  'channels.agentBudgetSharePct': { dflt: 25, min: 5, max: 100 },
  'channels.historyPageSize': { dflt: 50, min: 10, max: 200 },
  'channels.attachmentBudgetMB': { dflt: 5120, min: 64, max: 102400 },
  'channels.budgetLarkPerMin': { dflt: null, min: 5, max: 1000 },
  'channels.budgetGmailPerMin': { dflt: null, min: 100, max: 6000 },
  // lane R5: the PER-SECOND pace (drain rule 18), default = the module's `caps.pace.unitsPerSec`
  'channels.gmailUnitsPerSec': { dflt: null, min: 5, max: 100 },
  'channels.larkRequestsPerSec': { dflt: null, min: 1, max: 50 },
  // lane channel-threads (spec §3.7, drain rule 20): the reaction list calls a reader may cause per account per
  // minute (0 = never list — events only), how long a fetched list is fresh, the per-thread walk floor
  'channels.reactionsPerMin': { dflt: 20, min: 0, max: 600 },
  'channels.reactionsTtlMin': { dflt: 10, min: 1, max: 1440 },
  'channels.threadFloorSec': { dflt: 60, min: 10, max: 3600 },
  // lane lark-search-poll (design §8's settings + owner decision 4): the change feed's tick, its overlap (the index lag),
  // the single-chat catch-up's reach, and the relaxed per-conversation net once the feed is proven complete (5 min)
  'channels.feedEverySec': { dflt: 30, min: 10, max: 300 },
  'channels.feedOverlapSec': { dflt: 60, min: 30, max: 600 },
  'channels.feedBackfillDays': { dflt: 7, min: 0, max: 30 },
  'channels.relaxedPollSec': { dflt: 300, min: 60, max: 900 },
  // lane lark-threads (A2): the recent-roots recheck's cadence per active conversation (drain rule 22a)
  'channels.threadRecheckSec': { dflt: 3600, min: 300, max: 86400 },
});
/** Consecutive failures before the adapter row goes amber and says so. */
const FAILURES_BEFORE_LOUD = 3;
/** lane lark-threads (A2): the recent-roots recheck's page (the chat's newest messages, newest first). */
const RECHECK_PAGE = 50;
/** lane lark-threads (A4): feed hits the chat read did not find, read BY ID — at most this many per feed tick per
 *  account; an answer that is not a thread reply (and a refusal) is remembered this long per message id, never re-asked
 *  per tick; the hits waiting for their conversation's read, bounded (the oldest dropped). */
const BYID_PER_TICK = 5;
const BYID_MEMORY_MS = 6 * 3600e3;
const FEED_MISSING_MAX = 500;
/** lane lark-search-poll verify r1: chats the change feed saw that a COMPLETE listing did not — remembered (for one cold
 *  cycle) so their hits never re-arm a discovery walk per feed page. */
const FEED_UNLISTED_MAX = 500;
/** Records per history page. */
const PAGE = 50;
/** Pages one pass may walk before it gives up and reports `complete:false` —
 *  fence 9 says keep paging to the anchor, and this bounds "keep". */
const MAX_PAGES = 20;
/** Discovery pages (of ≤100 conversations) one pass may walk (a sanity bound
 *  of 20 000 conversations): the cursor is WALKED TO THE END — a walk the
 *  budget or this bound cuts short keeps its cursor for the next pass. The
 *  old bound of 5 pages meant conversation 501 was never discovered. */
const DISCOVERY_MAX_PAGES = 200;
/** P1b — the push lanes. A kick-origin pass is coalesced to at most one per
 *  this interval per adapter (a burst of kicks is one pass); the index
 *  update + broadcast after pushed records is debounced by this much (ONE
 *  broadcast per batch, never per message); vendor event ids are remembered
 *  this many deep for at-least-once replays (fence 11). */
const KICK_MIN_INTERVAL_MS = 3000;
const PUSH_NOTIFY_DEBOUNCE_MS = 250;
const PUSH_EVENT_DEDUP_MAX = 5000;
/** P2 — assign / filter / wake (design §7). Matched hits that are waiting
 *  (a digest window, a push coalescing window, a group with no live member,
 *  a pacing refusal) live on the index entry — PERSISTED, bounded to this
 *  many with an `elided` count — so a restart delivers them instead of
 *  forgetting them; the in-memory half is only the timer. */
const PENDING_CAP = 30;
/** Records the estimate reads from a conversation's log before it says
 *  `sampled` (the reader's cap is the estimator's honesty input, §7.1). */
const ESTIMATE_CAP = 5000;
/** How long after boot leftover pending hits are delivered as one digest. */
const BOOT_PENDING_DELAY_MS = 5000;
/** The coalescing window's default and ceiling (fence 12; the setting
 *  `channels.pushCoalesceSeconds` overrides within [0, max]). */
const COALESCE_DEFAULT_SECONDS = 60;
/** The group list's LAST LINE (design §22, 2.369.159): one line, bounded —
 *  a cache on the index entry beside `lastAt`, re-derivable from the log. */
const LAST_TEXT_MAX = 160;
const lastTextOf = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, LAST_TEXT_MAX);
/** §25: a row's one-line preview is the MESSAGE — a ticket banner, the quoted
 *  history and a signature are not. Read off the newest appended record's
 *  render tree (the store returns what it wrote); a record with no tree keeps
 *  the store's own text. */
/** A scope set's identity (order-free) — "did the credential's scopes change". */
const scopeKey = (list) => (Array.isArray(list) ? list.map(String).sort().join(' ') : '');
function previewText(w) {
  const newest = Array.isArray(w && w.fresh) ? w.fresh.find((r) => r && Number(r.at) === Number(w.lastAt) && Array.isArray(r.blocks)) : null;
  return (newest && Blocks.previewOf(newest.blocks, LAST_TEXT_MAX)) || w.lastText;
}
const COALESCE_MAX_SECONDS = 600;

function create(deps = {}) {
  const {
    dataDir,
    broadcast = () => {},
    now = () => Date.now(),
    env = process.env,
    registry = createChannelRegistry(),
    // The §14 integration store (src/server/integration-store.js): adapters are
    // handed its `resolveIntegration` and NEVER read process.env; its
    // `onChange` re-asks every live adapter's `auth.state()` so a withdrawn
    // credential flips the Adapters row, not only the Integrations card.
    // Optional: the contract and engine suites run without one.
    integrations = null,
    // The "For you" inbox (UserTodoManager) a failing adapter SPEAKS in and
    // the SAME producer retracts from (fence 8). Optional: without it the
    // failure reaches the adapter row and the log only.
    userTodos = null,
    // The consent-flow machine (src/oauth-loopback.js). A suite hands one
    // built on a FREE port; production builds the default (the registry's
    // fixed Lark callback).
    oauth = null,
    // Adapters' HTTP. Injected by the suites (a recorded vendor); production
    // uses the runtime's fetch — in-process, bounded, never a child process
    // per item (fence 3).
    fetch: fetchFn = undefined,
    log = console,
    // P2 (design §7.4 / fence 2): THE delivery ladder (src/server/
    // conversation-deliver.js) — the ONLY thing that may open an unattended
    // turn, already behind the spend authorizer. The engine forwards to
    // `deliverToConversation` with its own declared reason and adds NOTHING
    // beside it; a refusal is stashed through the ladder's own durable stash
    // and rides the agent's next turn. Without a ladder, hits stay PENDING
    // on the index (bounded) until one is wired.
    deliver = null,
    // The setting reader (`channels.pushCoalesceSeconds`, fence 12).
    serverSetting = () => undefined,
    // The LIVE agent sessions an assignment can address: `() => [{cid, name,
    // groups[]}]` — cid is the conversation id the ladder addresses; groups
    // are the task-group ids the session belongs to (round-robin, §7.3).
    liveSessions = () => [],
    // lane R5 (drain rule 18): the PER-SECOND bucket runs on a PHYSICAL clock —
    // the vendor meters requests in real time, whatever the engine's logical
    // `now` says (a suite freezes `now`; the bucket must still refill). Default:
    // the monotonic `performance.now()`. `sleep(ms)` = how a pace wait passes;
    // default a real, stop-wakeable timer. A suite may inject both (a private
    // pace clock its `sleep` advances) so pacing is exact and instantaneous.
    paceClock = () => performance.now(),
    sleep: sleepImpl = null,
    // 2.369.195: THE STORAGE MOUNTS' OWN OAUTH CLIENTS an account may borrow
    // (`{ list(vendor), of(mountId) }` over src/mounts.js's
    // `oauthClientsFor` / `oauthClientOf`). `of` hands back the DECRYPTED
    // client; the engine re-seals the secret under `.channels-key` at once
    // (`sealCustom`) and never answers it on a route. Optional: without it a
    // `fromMount` choice is refused by name (`no-mounts`).
    mountClients = null,
    // B-f32b r2: the clock census's pace (ms) and its trailing timer `(fn, ms) => {cancel()}` — a suite injects both
    censusEveryMs = CENSUS_EVERY_MS,
    censusTimer = (fn, ms) => { const h = setTimeout(fn, Math.max(0, ms)); if (h.unref) h.unref(); return { cancel: () => clearTimeout(h) }; },
  } = deps;
  if (!dataDir) throw new Error('channels-engine: dataDir is required');

  // lane channel-threads: ONE write hook — every log writer (a pass, the push lane, a backfill, a trim, the side
  // log) keeps the derived caches (the thread index, the message → conversation map) honest; never a call-site list
  const store = createChannelStore({ dir: path.join(dataDir, 'channels'), now, log, onWrite: (a, c, w) => onStoreWrite(a, c, w) });
  // A store file that could not be read at boot was SET ASIDE (r2 — never
  // silently read as empty and overwritten): ONE "For you" item per file,
  // naming where its bytes are. The store already logged the named line.
  for (const q of store.quarantined || []) {
    if (!userTodos || typeof userTodos.add !== 'function') break;
    try {
      // r3: a BLOCKED file (the rename failed) was NOT set aside — its
      // headline says so, never "set aside as <its own name>"
      const head = q.blocked
        ? { text: `Channels: ${q.file} could not be read and could NOT be set aside — writes to it are refused until it is fixed or moved`, key: i18nKey('Channels: {file} could not be read and could NOT be set aside — writes to it are refused until it is fixed or moved'), params: { file: q.file } }
        : { text: `Channels: ${q.file} could not be read and was set aside as ${q.to}`, key: i18nKey('Channels: {file} could not be read and was set aside as {where}'), params: { file: q.file, where: q.to } };
      userTodos.add(INBOX_KEY, {
        origin: 'channels', // B-328d
        text: head.text,
        detail: `${q.file} was ${q.why}.\n${q.to ? `Its bytes are kept as data/channels/${q.to} — nothing was deleted; the store started empty.` : 'It could NOT be renamed, so writes to it are refused until the file is fixed or moved.'}\n\nRestore it by fixing the JSON and moving it back while the server is stopped, or keep the new store and delete the copy once you no longer need it.`,
        urgency: 'high', by: 'agent', sessionName: 'Channels',
        i18n: {
          text: { key: head.key, params: head.params },
          detail: [{ key: i18nKey('Nothing was deleted. Fix the JSON and move it back while the server is stopped, or keep the new store and delete the copy once you no longer need it.') }],
          source: INBOX_SOURCE,
        },
      });
    } catch (e) { log.warn(`[channels] could not file the set-aside notice for ${q.file}: ${(e && e.message) || e}`); }
  }
  const box = secretBox(path.join(dataDir, KEY_FILE));
  const flows = oauth || createOAuthLoopback({ now, log });

  // Built-ins. The three fakes exercise BOTH axes; the real adapters register
  // the same way and nothing downstream learns their names.
  for (const mod of [fake.fakePoll, fake.fakePush, fake.fakeScan, agents, ...REAL_ADAPTERS.map((m) => m.adapter)]) {
    if (!registry.has(mod.kind)) registry.register(mod);
  }
  // The built-in Agents adapter (§12.3) exists where the server NAMES its
  // agent sessions: seeded whenever `liveSessions` was handed in (the wiring
  // always does; a bare suite engine has no sessions to address, so it gets
  // no row — the P0 exit "three fake rows" stays byte-true there).
  const agentsWanted = Object.prototype.hasOwnProperty.call(deps, 'liveSessions');
  // Each row's Test runner belongs to its CONSUMER (src/channels/<kind>.js);
  // the store only dispatches (§14.3 constraint 1: the store constructs no
  // vendor request — and the fake has no vendor to request from).
  if (integrations && typeof integrations.registerTest === 'function') {
    // D7 (r4): an account-bound row (`bindsPerAccount`) has NO Test verb — it
    // is not a card, and the store refuses `test()` on it by name; its runner
    // is never registered (the adapter modules keep `integrationTest` for
    // their own shape suites).
    const reg = (id, fn) => { if (R.bindsPerAccount(id)) return; if (!(integrations.hasTestRunner && integrations.hasTestRunner(id))) integrations.registerTest(id, fn); };
    reg('fake', fake.integrationTest);
    for (const m of REAL_ADAPTERS) if (m.integration && typeof m.integrationTest === 'function') reg(m.integration, (args) => m.integrationTest(args, fetchFn));
  }
  const resolveIntegration = integrations && typeof integrations.resolveIntegration === 'function'
    ? (id, opts) => integrations.resolveIntegration(id, opts) : undefined;
  const rowOf = (mod) => (mod && mod.integration ? R.rowById(mod.integration) : null);
  /** THIS ACCOUNT'S CLIENT, as the resolver shape every adapter already
   *  reads (`{source, values, missing, why, whyCode, credentialKey, …}`):
   *  `custom` ⇒ the record's own `credential` (decrypted here, handed to the
   *  adapter only); `own` ⇒ the legacy card's values until the reader-side
   *  copy lands (then the record's own); `cluster:<k>` / null ⇒ the store,
   *  unchanged. A preset the env stopped offering answers `preset-gone`
   *  naming its key — never another client (the store's rule). */
  function clientFor(rec) {
    const mod = realByKind.get(rec && rec.kind) || null;
    const row = rowOf(mod) || (rec && R.rowById(rec.kind)) || null;
    const key = (rec && typeof rec.credentialKey === 'string' && rec.credentialKey) || null;
    if (row && row.bindsPerAccount && key === CUSTOM_KEY) return customClientOf(rec, row, CUSTOM_KEY);
    if (row && row.bindsPerAccount && key === OWN_KEY) return legacyClientOf(rec, row);
    if (!resolveIntegration) return { id: row ? row.id : null, source: 'none', values: {}, missing: [], why: 'no integration store', whyCode: 'no-store', whyParams: null, credentialKey: key, clusterKey: null, clusterLabel: null };
    return resolveIntegration(row ? row.id : (mod && mod.integration), { credentialKey: key });
  }
  function customClientOf(rec, row, asKey) {
    const cf = R.clientFieldsOf(row);
    const c = rec && rec.credential && typeof rec.credential === 'object' ? rec.credential : null;
    const base = { id: row.id, label: row.label, credentialKey: asKey, clusterKey: null, clusterLabel: null, savedClusterKey: null, fromEnv: false, testedAt: null, lastOk: null, lastError: null };
    const none = (why, whyCode, whyParams = null, missing = R.missingFields(row, {})) => ({ ...base, source: 'none', values: {}, missing, why, whyCode, whyParams });
    if (!c || !c.appSecretEnc) return none(`${(rec && (rec.label || rec.id)) || row.label} has no client of its own saved`, 'custom-missing', { fields: [cf.secretKey] });
    let secret;
    try { secret = box.dec(c.appSecretEnc); }
    catch (e) { return none(`${(rec && (rec.label || rec.id)) || row.label}'s own client secret cannot be decrypted with ${KEY_FILE} (${(e && e.code) || 'bad-ciphertext'})`, 'custom-undecryptable'); }
    const values = {};
    if (c.appId) values[cf.idKey] = String(c.appId);
    values[cf.secretKey] = secret;
    const missing = R.missingFields(row, values);
    if (missing.length) return none(`${(rec && (rec.label || rec.id)) || row.label}'s own client lacks ${missing.join(', ')}`, 'custom-missing', { fields: missing }, missing);
    return { ...base, source: 'custom', values, missing: [], why: null, whyCode: null, whyParams: null };
  }
  /** A legacy `own` account (r4 §2.6): served from the record once the copy
   *  wrote it, else from the retired card's values through the store's ONE
   *  legacy reader — and the copy is scheduled (reader-side, idempotent). */
  function legacyClientOf(rec, row) {
    if (rec.credential && rec.credential.appSecretEnc) { scheduleInline(rec); return customClientOf(rec, row, OWN_KEY); }
    scheduleInline(rec);
    const lv = integrations && typeof integrations.legacyOwnValues === 'function' ? integrations.legacyOwnValues(row.id) : { ok: false, code: 'no-store', why: 'no integration store to read the legacy values from' };
    if (!lv.ok) return { id: row.id, label: row.label, credentialKey: OWN_KEY, source: 'none', values: {}, missing: lv.missing || R.missingFields(row, {}), why: `the saved ${row.label} client could not be moved onto ${rec.label || rec.id}: ${lv.why}`, whyCode: 'legacy-copy-failed', whyParams: { why: lv.code }, clusterKey: null, clusterLabel: null };
    return { id: row.id, label: row.label, credentialKey: OWN_KEY, source: 'user', values: { ...lv.values }, missing: [], why: null, whyCode: null, whyParams: null, clusterKey: null, clusterLabel: null };
  }
  /** The resolver handed to ONE record's adapter: its own client for its
   *  own row, the store for anything else. `undefined` without a store on a
   *  record that names no client of its own (the contract suites' bare
   *  engines keep their "no resolver" answers). */
  function resolverFor(rec) {
    const key = rec && rec.credentialKey;
    if (!resolveIntegration && key !== CUSTOM_KEY && key !== OWN_KEY) return undefined;
    return (id, opts = {}) => {
      const row = R.rowById(id);
      const k = opts && typeof opts.credentialKey === 'string' ? opts.credentialKey : null;
      // the LIVE record, never a copy: the reader-side legacy copy is scheduled on it
      if (row && row.bindsPerAccount && k === CUSTOM_KEY) return customClientOf(rec, row, CUSTOM_KEY);
      if (row && row.bindsPerAccount && k === OWN_KEY) return legacyClientOf(rec, row);
      if (!resolveIntegration) return { id, source: 'none', values: {}, missing: [], why: 'no integration store', whyCode: 'no-store', whyParams: null, credentialKey: k };
      return resolveIntegration(id, opts);
    };
  }
  const factsOf = (r, fallbackKey = null) => ({ source: r.source, why: r.why || null, whyCode: r.whyCode || null, whyParams: r.whyParams || null, missing: Array.isArray(r.missing) ? r.missing.slice() : [], clusterLabel: r.clusterLabel || null, credentialKey: r.credentialKey || fallbackKey || null });
  /** The credential FACTS of ONE account (never the values). */
  function credentialFactsFor(rec) {
    try { return factsOf(clientFor(rec), rec.credentialKey || null); }
    catch (e) { return { source: 'unknown', why: `integration lookup failed: ${(e && e.message) || e}`, whyCode: 'lookup-failed', whyParams: null, missing: [], clusterLabel: null, credentialKey: rec.credentialKey || null }; }
  }
  /** The credential FACTS the panel's connect wizard needs (§10.1's three
   *  copy paths: none / cluster / user) — never the values. */
  function credentialFacts(integrationId, credentialKey = null) {
    // `why` is the store's English contract sentence; `whyCode` + `whyParams`
    // are the same fact as STRUCTURE — the client words them (a3 i18n).
    // `credentialKey` (2026-09-22) = an ACCOUNT's own binding (`cluster:<k>` /
    // `own`); null asks the row's pick — what a NEW account would be bound to.
    if (!integrationId || !resolveIntegration) return { source: 'unknown', why: 'no integration store', whyCode: 'no-store', whyParams: null, missing: [], clusterLabel: null, credentialKey: credentialKey || null };
    try {
      const r = resolveIntegration(integrationId, { credentialKey: credentialKey || null });
      return { source: r.source, why: r.why || null, whyCode: r.whyCode || null, whyParams: r.whyParams || null, missing: Array.isArray(r.missing) ? r.missing.slice() : [], clusterLabel: r.clusterLabel || null, credentialKey: r.credentialKey || null };
    } catch (e) { return { source: 'unknown', why: `integration lookup failed: ${(e && e.message) || e}`, whyCode: 'lookup-failed', whyParams: null, missing: [], clusterLabel: null, credentialKey: credentialKey || null }; }
  }
  /** Every credential a NEW account of this integration may bind to right
   *  now (the store's `offeredCredentials`: key + label only); `[]` without
   *  a store — the wizard then shows no credential step. */
  function offeredCredentials(integrationId) {
    if (!integrationId || !integrations || typeof integrations.offeredCredentials !== 'function') return [];
    try { return integrations.offeredCredentials(integrationId); } catch { return []; }
  }
  /** The key the integration row's OWN pick resolves to — a new account's
   *  default and the honest stamp for a legacy record (the client it minted
   *  its token under is the one the row pointed at). null = nothing resolves. */
  function defaultCredentialKey(integrationId) {
    if (!integrationId || !resolveIntegration) return null;
    try { return resolveIntegration(integrationId).credentialKey || null; } catch { return null; }
  }
  const credentialLabelFor = (integrationId, key) => { const o = key ? offeredCredentials(integrationId).find((c) => c.key === key) : null; return o ? (o.label || null) : null; };
  /** A key the caller names must be one the integration OFFERS right now —
   *  refused `400 unknown-credential` BY NAME with the offered list. */
  function assertOffered(mod, key) {
    if (key === OWN_KEY && rowOf(mod) && rowOf(mod).bindsPerAccount) {
      const err = new Error(`'own' is retired for ${mod.label || mod.kind}: an account carries its own client — choose a preset or 'custom' with the client id and secret`);
      err.status = 400; err.code = 'own-retired'; err.detail = { key };
      throw err;
    }
    const offered = offeredCredentials(mod.integration);
    const hit = offered.find((c) => c.key === key);
    if (hit && hit.available === false) {
      // offered but not fillable yet (the user's own client with fields missing): the wizard
      // opens the Integrations card on this code — never a silent fallback to a preset
      const err = new Error(`'${key}' needs ${(hit.missing || []).join(', ') || 'its fields'} on the Integrations card before an account can use it`);
      err.status = 409; err.code = 'needs-credentials'; err.detail = { key, needsCredentials: true, missing: hit.missing || [] };
      throw err;
    }
    if (hit) return;
    const err = new Error(`'${key}' is not a credential this instance offers for ${mod.label || mod.kind} (offered: ${offered.map((c) => c.key).join(', ') || 'none'})`);
    err.status = 400; err.code = 'unknown-credential'; err.detail = { key, offered: offered.map((c) => c.key) };
    throw err;
  }
  /** THE HONEST STAMP for a record with no `credentialKey` (the
   *  `2026-09-channel-credential-key` migration, a legacy record's
   *  re-authorize): what MINTED its token wins whenever the token says so
   *  and this instance still offers it — a Gmail token records the preset
   *  key it was exchanged under (`clusterKey`; null = the user's own values),
   *  a Lark token records nothing — else the row's own pick (what refreshed
   *  it until now), and the answer NAMES its evidence either way. `boundKey`
   *  = the credential a HELD token provably binds the record to (null when
   *  the token names nothing this instance offers). Verifier r1 (2026-09-22):
   *  stamping the row's pick alone re-bound an org1-minted token to the
   *  channels client the moment the pick had flipped before the upgrade —
   *  the exact case the model exists for. */
  function credentialKeyEvidence(rec, mod) {
    const integrationId = mod && mod.integration;
    const { token, why } = tokensFor(rec).read();
    const named = token && Object.prototype.hasOwnProperty.call(token, 'clusterKey')
      ? (typeof token.clusterKey === 'string' && token.clusterKey ? CLUSTER_PREFIX + token.clusterKey : OWN_KEY) : null;
    // r4: `own` is no longer OFFERED to a new account, but a token minted under
    // the retired card's values is still bound to them — the stamp names
    // `own` while those values are complete, and the reader-side copy moves
    // them onto the record (never a preset the token was not issued under)
    const legacyOwn = named === OWN_KEY && integrations && typeof integrations.legacyOwnValues === 'function' && (() => { try { return integrations.legacyOwnValues(integrationId).ok === true; } catch { return false; } })();
    const boundKey = named && (legacyOwn || offeredCredentials(integrationId).some((c) => c.key === named && c.available !== false)) ? named : null; // an unavailable `own` (listed since r3) never binds
    if (boundKey) return { key: boundKey, evidence: 'token', tokenKey: named, boundKey };
    const pick = defaultCredentialKey(integrationId);
    return { key: pick, evidence: pick ? 'row-pick' : 'nothing-resolves', tokenKey: named, tokenWhy: token ? null : (why || null), boundKey: null };
  }

  const live = new Map();     // adapterId -> { adapter, record, passing, failures, nextAt, budget }
  const paceCarry = new Map();   // adapter id -> the ghost of a dropped entry (its minute window + per-second bucket) until the id is rebuilt
  let timer = null;
  let stopped = false;
  // R4 verify r5 (money): a per-PROCESS id stamped on every wake reservation
  // (reserveWake). A reservation that outlived a CRASH — the process died
  // between the reservation (before the ladder) and the finalize (after) —
  // stays COUNTED against the cap for 24 h with no finalized row and no live
  // process: fail-closed is right, but a boot that finds a reservation from a
  // PREVIOUS boot (a different BOOT_ID — a new process is a new boot by
  // construction) with no outcome can RELEASE it by evidence
  // (`releaseStaleReservations`). A reservation from THIS boot is an in-flight
  // wake and is never touched.
  const BOOT_ID = `${process.pid}.${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 8)}`;

  // ── adapter records: THE LIVE OBJECT, never a fresh parse (r2) ───────────
  // Every caller shares one object, so a mutation made by a failing pass is
  // still there when a healthy neighbour's pass writes. `adapterRecords()`
  // stays synchronous because it is on the render path (`digest()`); the WRITE
  // goes through the serialized door below.
  let seeded = false;
  let agentsSeeded = false;
  function adapterRecords() {
    const a = store.adapters.live();
    if (!seeded && !a.adapters.length && env.VIBESPACE_CHANNELS_FAKE === '1') {
      // The NAMED dev/test seam. Records are written once so a restart shows
      // the same rows and `tracked` survives it.
      // Seeded from each adapter's own CAPABILITY ROW, never from its name —
      // the same discipline every other site here obeys, and the reason the
      // contract suite's grep census finds no branch on `kind` anywhere.
      a.adapters = fake.FAKE_KINDS.map((kind) => {
        const c = registry.capsOf(kind);
        return {
          id: kind, kind, label: kind, enabled: true,
          auth: { tokenEnc: null, expiresAt: null, scopes: [] },
          lastPass: null, consecutiveFailures: 0,
          push: { enabled: c.receive === 'push' && !c.pushOptIn, claimedExclusive: 'unknown', state: null, lastEventAt: null, missRate: 0, demotedAt: null, demotedWhy: null, samples: [] },
          scan: c.receive === 'scan' ? { hostId: null, chosenSource: null, grantAskedAt: null, hostFacts: null } : null,
        };
      });
      seeded = true;
      saveAdapters().catch((err) => console.warn('[channels] adapters write failed:', err && err.message));
    }
    // The built-in Agents row: NOT removable, no consent flow, seeded from
    // the module's own capability row by its id (never a branch on kind).
    if (agentsWanted && !agentsSeeded && !a.adapters.some((r) => r.id === agents.kind)) {
      const c = registry.capsOf(agents.kind);
      a.adapters.push({
        id: agents.kind, kind: agents.kind, label: agents.label || agents.kind, enabled: true, builtin: true,
        auth: { tokenEnc: null, expiresAt: null, scopes: ['local'], user: 'you' },
        lastPass: null, consecutiveFailures: 0,
        push: { enabled: false, claimedExclusive: 'unknown', state: null, lastEventAt: null, missRate: 0, demotedAt: null, demotedWhy: null, samples: [] },
        scan: c.receive === 'scan' ? { hostId: null, chosenSource: null, grantAskedAt: null, hostFacts: null } : null,
      });
      agentsSeeded = true;
      saveAdapters().catch((err) => console.warn('[channels] adapters write failed:', err && err.message));
    }
    return a;
  }

  /** THE ONE write of adapters.json. Serialized by the store; the records it
   *  writes are the LIVE ones every caller has been mutating. */
  function saveAdapters() { return store.adapters.update(() => {}); }

  // ── THE ADAPTER'S OWN TOKEN, encrypted at rest (design §13) ──────────────
  // A user's consent lives on the adapter RECORD as `auth.tokenEnc` (secret-box,
  // `data/.channels-key`), beside the two facts `authState` resolves from —
  // the stamped expiry and the scopes. Written through the store's serialized
  // door like every other byte of adapters.json; decrypted only for the
  // adapter that owns it. `publicView` never carries it (see `digest`).
  /** The scopes a consent dropped (bounded strings; never a secret). */
  const refusedScopesOf = (xs) => [...new Set((Array.isArray(xs) ? xs : []).filter((x) => typeof x === 'string' && x && x.length <= 200))].slice(0, 16);
  function tokensFor(rec) {
    const read = () => {
      const a = rec.auth || {};
      if (!a.tokenEnc) return { token: null, why: 'never-authenticated' };
      try { return { token: JSON.parse(box.dec(a.tokenEnc)), why: null }; }
      catch (e) { return { token: null, why: `token-undecryptable: ${(e && e.message) || e}` }; }
    };
    return {
      read,
      /** `meta.consent` = a human consent (the adapter's exchange); `meta.supersedes` = the refresh token the writer READ
       *  (a refresh's persist, an invalid_grant stamp): the write lands ONLY while the store holds that token at APPLY
       *  time (verify r6: a compare-and-swap inside the serialized door — the r5 re-read-then-enqueue relied on there
       *  being no await between the two, a fact one edit reopens; a patched copy with an await between them reverted a
       *  re-authorize again). Answers `{written}` or `{written:false, superseded:true, held}`. */
      async write(token, meta = {}) {
        // verify r5 (credential): a token that NAMES another identity than the account's is REFUSED, never stored —
        // a re-authorize as another Google / Lark user (the wrong account in the vendor's chooser) used to land with
        // ok:true and retarget every assignment and grant on this record onto a stranger's mailbox. The identity is
        // stamped by the first consent that names one, survives a disconnect, and only remove() forgets it.
        // verify r6: the held identity is read off the token the record HOLDS when it carries no stamp (a legacy
        // Lark record's auth.user is a display name — a stranger's consent used to bind it).
        // verify r7: EVERY judgement runs INSIDE the serialized callback, at apply time (the identity check used to sit
        // before the store's await — two consents of one tick on an unbound record were both judged against nothing
        // and the record ended bound to whichever was enqueued last); a CONSENT names an account or is refused
        // whatever the record holds; a consent whose flow was CANCELLED meanwhile (`meta.consent.cancelled()` — a
        // disconnect, a cancel, a newer sign-in, the timeout) is refused: the human act that cancelled it is the later
        // one and used to be undone by this write landing after it; a CAS write never lands on a CLEARED store.
        const offered = identityOf(token);
        const consent = meta.consent || null;
        const enc = box.enc(JSON.stringify(token));
        const supersedes = meta.supersedes === undefined ? undefined : String(meta.supersedes || '');
        let verdict = { written: true };
        try {
          await store.adapters.update(() => {
            if (consent) {
              // verify r8: the engine's own stop is a cancel too (an injected loopback is its owner's to stop), and the
              // refusal says what the record HOLDS (a refused sign-in on a connected record no longer reads "nothing was connected")
              const c = (typeof consent.cancelled === 'function' ? consent.cancelled() : null) || (stopped ? 'shutdown' : null);
              if (c) { verdict = { written: false, cancelled: String(c), held: !!read().token }; return; }
              if (!Object.keys(offered).length) { verdict = { written: false, nameless: true }; return; }
            }
            const held = heldIdentity(rec, read().token);
            const mm = identityMismatch(held, offered);
            if (mm) { verdict = { written: false, mismatch: mm }; return; }
            if (supersedes !== undefined) {
              const cur = read().token; const curRt = cur ? String(cur.refresh_token || '') : '';
              if (!cur || curRt !== supersedes) { verdict = { written: false, superseded: true, held: cur ? curRt : null }; return; }
            }
            const nextScopes = Array.isArray(meta.scopes) ? meta.scopes.slice() : [];
            const scopesChanged = scopeKey(rec.auth && rec.auth.scopes) !== scopeKey(nextScopes);
            rec.auth = { ...(rec.auth || {}), tokenEnc: enc, expiresAt: meta.expiresAt == null ? null : Number(meta.expiresAt), scopes: nextScopes, user: meta.user || token.name || token.email || token.openId || (rec.auth && rec.auth.user) || null, updatedAt: now() };
            // inc-muk9jj0j-rel3: WHEN THE CREDENTIAL'S SCOPES CHANGED — every conversation judged before it is re-judged
            // (a refresh re-writing the same scopes is not a change: `updatedAt` moves on every refresh, this does not)
            if (scopesChanged || consent) rec.auth.scopesAt = now();
            // owner ruling (2026-09-28): a CONSENT carries what it dropped (the sign-in's one narrowing retry — the vendor
            // refused an optional scope on its page); a refresh keeps the evidence of the consent it renews
            if (consent) rec.auth.refusedScopes = refusedScopesOf(meta.refusedScopes);
            if (Object.keys(offered).length) rec.identity = { ...(rec.identity || {}), ...offered };
          });
        } catch (err) { speakUnsaved(rec, err); throw err; }
        if (verdict.mismatch) throw new ChannelError('forbidden', mismatchSentence(rec.label || rec.id, verdict.mismatch), { retryable: false, detail: { identityMismatch: verdict.mismatch } });
        if (verdict.nameless) throw new ChannelError('forbidden', namelessSentence(rec.label || rec.id, 'the sign-in named no account'), { retryable: false, detail: { nameless: true } });
        if (verdict.cancelled) throw new ChannelError('auth-expired', cancelledSentence(rec.label || rec.id, verdict.cancelled, verdict.held), { retryable: false, detail: { cancelled: verdict.cancelled } });
        if (verdict.written) retractUnsaved(rec);
        return verdict;
      },
      async clear() {
        await store.adapters.update(() => { rec.auth = { tokenEnc: null, expiresAt: null, scopes: [], user: null, updatedAt: now(), scopesAt: now() }; });
      },
    };
  }
  /** Per-record scratch an adapter may keep (a mailbox cursor); plain JSON,
   *  never a secret — the token store above is for those. */
  function stateFor(rec) {
    return {
      read: () => ({ ...((rec.state && typeof rec.state === 'object') ? rec.state : {}) }),
      write: (patch) => store.adapters.update(() => { rec.state = { ...((rec.state && typeof rec.state === 'object') ? rec.state : {}), ...(patch || {}) }; }),
    };
  }

  function adapterFor(rec) {
    let e = live.get(rec.id);
    if (!e || e.kind !== rec.kind) {
      // The resolver goes in FIRST and by name (the registry suite's
      // card-only control patches exactly this call); the P1 deps — the
      // record's token store, its scratch state, the consent machine, the
      // engine's finish hook and the injected fetch — ride on `adapterDeps`.
      // P3: the built-in Agents adapter sends through THE ladder and lists
      // the sessions the server names — both handed down, never reached for.
      // `credentialKey` = THIS account's binding (2026-09-22): every
      // resolveIntegration the adapter makes carries it, so two accounts of
      // one kind refresh with their OWN clients whatever the row's pick says.
      // `meter` (2026-09-26): the adapter charges every request it ACTUALLY
      // sends, in its declared unit, to THIS account's budget window.
      // `pace` (lane R5): the adapter AWAITS it before every request it sends
      // (drain rule 18's bucket, the SAME one the pass's `wait` reads) and
      // then meters it — the per-second shape is enforced call by call.
      const adapterDeps = { fetch: fetchFn, log, tokens: tokensFor(rec), state: stateFor(rec), oauth: flows, onAuthDone: (adapterId, r) => onAuthDone(adapterId, r), deliver, liveSessions, credentialKey: rec.credentialKey || null, meter: (units) => { const x = live.get(rec.id) || paceCarry.get(rec.id); if (x) charge(x, units); }, pace: (units) => paceWait(rec.id, units, rec) };
      // r4: the resolver is PER RECORD (`resolverFor`) — an account's own
      // (`custom`) client lives on its record, a preset in the store.
      const adapter = registry.create(rec.kind, rec, { now, resolveIntegration: resolverFor(rec), ...adapterDeps });
      if (rec.credentialKey === OWN_KEY) scheduleInline(rec);   // the reader-side legacy copy (r4 §2.6)
      e = { kind: rec.kind, adapter, record: rec, passing: null, failures: 0, nextAt: 0, win: null, exhaustedAt: 0, waiting: 0, authState: null, chargeBy: null,
        // 2026-09-26: the conversations made due NOW (a kick naming them, an
        // adapter's `changed` hint, a refresh), the discovery walk's resumable
        // cursor, and the last time an unconnected account was re-asked
        dueNow: new Set(), disc: { cursor: null, startedAt: null, lastCompleteAt: 0, lastAt: 0 }, discoverSoon: false, lastIdleAt: 0,
        // P1b: the push lane's runtime — the handle, the arm token every
        // callback is keyed on, the event-id memory, the coalesced batch and
        // the kick timer.
        liveHandle: null, liveToken: null, seenEvents: new Map(), pushBatch: null, pushTimer: null, kickTimer: null, lastKickAt: 0, kickAfter: false,
        // r5: THE REFRESH REQUEST SET, its one pending drain, the drain a running
        // pass owes, and the back-off WINDOW the owner's one honoured press is
        // keyed on (a new window per failure). r9: the set is the PURE drain's
        // state (`dq`: the waiters in filing order + the pass — src/channel-drain.js);
        // `waiters` maps each id to its settle-able promise (the delivery side)
        dq: Drain.empty(), waiters: new Map(), drainTimer: null, drainAfter: false, backoffEpoch: 0, ownerPressEpoch: -1, after: null,
        // lane R5: the PER-SECOND bucket (`paceTok` = {tokens, at}; null = full,
        // never used), the last second's charges (the card's number), the
        // sleeps a stop / a drop must wake, and the RATE ladder beside the
        // failure one (`rateStrikes`, the back-off's kind, the vendor's hint)
        paceTok: null, paceRecent: [], sleepers: new Set(), rateStrikes: 0, backoffKind: null, retryAfterSec: null,
        // lane R5 verify r2: the units `paceWait` let through that their meter has not charged yet (an ATOMIC reservation)
        paceInflight: 0, paceInflightAt: 0, paceLeakWarnAt: 0,
        // lane lark-search-poll: THE CHANGE FEED's memory — the message ids it saw (dedup across the overlap, the
        // measurement's "found"; FEED_SEEN_MAX / 2 h), the groups it found that discovery has not listed yet (≤ 200,
        // cleared by a complete discovery walk), the page tokens (the engine's — never the drain's), the start of this
        // process's first window (the measurement never judges before it), the sliding minute's page instants, the
        // records waiting for a complete window to cover them, the describe budget
        feedSeen: new Map(), feedGroups: new Map(), feedUnlisted: new Map(), feedTokens: { steady: null, catchUp: null }, feedMemStart: null, feedCalls: [], feedPending: [], feedDescribe: { at: 0, n: 0 }, feedPrevSig: null,
        // lane lark-threads (A4): the feed hits behind an owed chat read (≤ FEED_MISSING_MAX: vendorId → {convId, at,
        // observedAt}) — one the read did not find is read BY ID; the by-id answers remembered (≤ FEED_MISSING_MAX,
        // BYID_MEMORY_MS: vendorId → {at, kind}) and the tick's by-id count
        feedMissing: new Map(), byIdMem: new Map(), byIdTick: { at: 0, n: 0 },
        // r5 verify: the tick found the account busy while its rows were due — the
        // next pass, whatever its origin, does the timer's work (no starvation
        // of the due list by a storm of requests)
        timerDue: false };
      // verify r4: an exit never refills — a rebuilt entry (disconnect + re-authorize, an options rebuild, a client
      // switch, disable + enable) inherits the dropped one's minute window and per-second bucket (`paceCarry`)
      const ghost = paceCarry.get(rec.id);
      if (ghost) { e.win = ghost.win; e.exhaustedAt = ghost.exhaustedAt; e.paceTok = ghost.paceTok; e.paceRecent = ghost.paceRecent; e.paceLeakWarnAt = ghost.paceLeakWarnAt; paceCarry.delete(rec.id); }
      live.set(rec.id, e);
    } else { e.record = rec; e.adapter.record = rec; }
    return e;
  }

  /** The adapter's OWN answer to "can you authenticate right now", cached on
   *  the live entry so the synchronous digest can read it. Asked at the start
   *  of every pass and again whenever an integration changes (§14.3: a
   *  withdrawn application credential must answer `needs-credentials`, not
   *  `connected`, and it must do so on the Adapters row). */
  async function refreshAuth(e) {
    try { e.authState = await e.adapter.auth.state(); }
    catch (err) { e.authState = { state: 'unknown', why: `auth.state threw: ${(err && err.message) || err}` }; }
    return e.authState;
  }
  let offIntegrations = null;
  if (integrations && typeof integrations.onChange === 'function') {
    offIntegrations = integrations.onChange(() => {
      Promise.all([...live.values()].map(refreshAuth)).then(() => { if (!stopped) notify([]); }).catch(() => {});
    });
  }

  // ── SETTINGS, read LIVE (2026-09-26: every time and capacity number) ─────
  // `serverSetting` answers the sparse stored value (undefined = unset), so
  // each reader carries the schema's own default beside its bounds.
  // The bounds of a key the table does not name (a scripted adapter's own
  // budget key) are the registry's sanity range.
  const clampSaid = new Set();   // `${key}=${stored}` already said
  function setting(key, dflt = null) {
    const b = SETTING_BOUNDS[key] || { dflt: null, min: 1, max: 1e6 };
    const d = dflt !== null && dflt !== undefined ? dflt : b.dflt;
    let v; try { v = Number(serverSetting(key)); } catch { v = NaN; }
    if (!Number.isFinite(v)) return d;
    const c = Math.min(b.max, Math.max(b.min, v));
    if (c !== v && !clampSaid.has(`${key}=${v}`)) {
      clampSaid.add(`${key}=${v}`);
      log.warn(`[channels] setting ${key} = ${v} is ${v > b.max ? `above its maximum ${b.max} — using ${b.max}` : `below its minimum ${b.min} — using ${b.min}`} (change it in Settings → Channels)`);
    }
    return c;
  }
  /** The activity tiers (§6.2) — `caps.cadenceFor` clamps to COLD_MAX_SEC. */
  function tiers() {
    return {
      hotSec: setting('channels.pollHotSec'),
      warmSec: setting('channels.pollWarmSec'),
      coldSec: Math.min(caps.COLD_MAX_SEC, setting('channels.pollColdSec')),
      hotRecentMinutes: setting('channels.hotRecentMinutes'),
      warmRecentHours: setting('channels.warmRecentHours'),
      relaxedSec: setting('channels.relaxedPollSec'),   // lane lark-search-poll: the net under a CARRYING feed
    };
  }
  /** lane lark-search-poll: the change feed's settings, read LIVE. */
  const feedOpts = () => ({ everySec: setting('channels.feedEverySec'), overlapSec: setting('channels.feedOverlapSec') });
  const historyPageSize = () => Math.round(setting('channels.historyPageSize'));
  const agentRefreshFloorSec = () => setting('channels.agentRefreshFloorSec');
  const agentBudgetSharePct = () => setting('channels.agentBudgetSharePct');
  const attachmentBudgetBytes = () => Math.round(setting('channels.attachmentBudgetMB') * 1024 * 1024);

  // ── THE VENDOR BUDGET: per account, per minute, in the vendor's unit ────
  /** The adapter's DECLARATION (`caps.budget`), its limit read through the
   *  setting it names. */
  function budgetDecl(rec) {
    const b = (registry.capsOf(rec.kind).budget) || {};
    const dflt = Number(b.default) > 0 ? Number(b.default) : DEFAULT_BUDGET_PER_MIN;
    const limit = b.settingKey ? setting(b.settingKey, dflt) : dflt;
    return { unit: b.unit === 'quota-unit' ? 'quota-unit' : 'request', limit, metered: b.metered === true, settingKey: b.settingKey || null };
  }
  /** THE PER-SECOND PACE (lane R5, drain rule 18): the adapter DECLARES it in
   *  `caps.pace` = `{unitsPerSec, settingKey, cost: {fetch, discover,
   *  scanHost}}` (Gmail 40 quota units/s — one thread read a second; Lark 5
   *  requests/s) and the setting it names is read LIVE. The bucket it drives
   *  is COUPLED to the minute's budget: `unitsPerSec` = min(the setting,
   *  budget/60) and `burst` = min(the setting, budget/2) — so the pace never
   *  spends the minute faster than the minute allows, and any 60 s holds at
   *  most the budget plus one burst (rule 9's cut stays the outer cap). `null`
   *  = the adapter declares no pace (the built-in Agents row, the fakes). */
  function paceDecl(rec) {
    const p = registry.capsOf(rec.kind).pace;
    if (!p || typeof p !== 'object') return null;
    const dflt = Number(p.unitsPerSec) > 0 ? Number(p.unitsPerSec) : 1;
    const perSec = p.settingKey ? setting(p.settingKey, dflt) : dflt;
    const limit = budgetDecl(rec).limit;
    const cost = p.cost && typeof p.cost === 'object' ? p.cost : {};
    const c = (k) => (Number(cost[k]) >= 0 ? Number(cost[k]) : 1);
    return { perSec, unitsPerSec: Math.min(perSec, limit / 60), burst: Math.min(perSec, limit / 2), settingKey: p.settingKey || null, cost: { fetch: c('fetch'), discover: c('discover'), scanHost: c('scanHost'), feed: c('feed') } };
  }
  /** The account's bucket on the PACE clock (`paceTok` = {tokens, at}; unused = full) — the RAW level, what the meters charged. */
  function bucketOf(d, e) {
    const tok = e.paceTok || { tokens: d.burst, at: paceClock() };
    return Drain.paceFresh(d.unitsPerSec, d.burst, tok.at, tok.tokens);
  }
  /** The bucket as a JUDGEMENT reads it: the raw level minus the units already
   *  let through and not yet metered (`paceInflight`) — so two callers judged
   *  in one instant never both see the same tokens (lane R5 verify r2). */
  function bucketSeen(d, e) {
    // verify r3: the raw level is CAPPED at burst first, the reservation comes off after — subtracting before the cap
    // projected an idle bucket as over-full (tokens + dt·rate − reserved, capped at burst) and let every reservation
    // read as spent-and-refilled; the pinned behaviour held only because a caller's charge lands (a microtask) before
    // the next queued judgement runs
    const t = paceClock();
    return Drain.paceFresh(d.unitsPerSec, d.burst, t, Drain.paceLevel(bucketOf(d, e), t) - (Number(e.paceInflight) || 0));
  }
  /** ONE judgement at a time per account, in arrival order (a FIFO of promises keyed by the account id, outliving a rebuilt entry). */
  const paceQueues = new Map();
  /** The bucket as the DRAIN reads it (`null` = no pace): its level evaluated
   *  NOW on the pace clock and handed over as of the logical `now()` — the
   *  model's arithmetic then starts from this instant, whatever clock drove it. */
  function paceOf(rec, e) {
    const d = paceDecl(rec);
    if (!d) return null;
    return { unitsPerSec: d.unitsPerSec, burst: d.burst, tokens: Drain.paceLevel(bucketSeen(d, e), paceClock()), lastRefillAt: now(), cost: d.cost };
  }
  /** Charge the bucket what a call SENT (refilled first; the level may go negative — a debt). */
  function paceCharge(e, n) {
    const rec = e.record;
    const d = rec ? paceDecl(rec) : null;
    if (!d) return;
    const t = paceClock();
    const next = Drain.paceCharge(bucketOf(d, e), t, n);
    e.paceTok = { tokens: next.tokens, at: t };
    e.paceInflight = Math.max(0, (Number(e.paceInflight) || 0) - (Math.max(0, Number(n)) || 0));   // the reservation `paceWait` took for this call is now charged
    e.paceRecent.push({ at: t, n });
    while (e.paceRecent.length && (t - e.paceRecent[0].at > 1000 || e.paceRecent.length > 500)) e.paceRecent.shift();
  }
  /** Sleep `ms` on the account's behalf — WOKEN at once by a stop or a drop
   *  (`wakeSleepers`), so neither waits for a pace. The timer is referenced
   *  (like the drain's): a process whose only work is an awaited refresh does
   *  not exit mid-wait. */
  function sleepFor(e, ms) {
    if (sleepImpl) return Promise.resolve(sleepImpl(Math.max(1, Number(ms) || 1)));   // an injected clock (a suite) — the caller re-checks stop / drop after it
    return new Promise((resolve) => {
      const s = { timer: null, wake: null };
      s.wake = () => { if (s.timer) { clearTimeout(s.timer); s.timer = null; } e.sleepers.delete(s); resolve(); };
      s.timer = setTimeout(s.wake, Math.max(1, Number(ms) || 1));
      e.sleepers.add(s);
    });
  }
  function wakeSleepers(e) { for (const s of [...e.sleepers]) s.wake(); }
  /** THE ADAPTER'S PACE (`deps.pace(units)`): wait until the bucket holds
   *  what this request needs (drain rule 18's arithmetic), then return — the
   *  adapter meters it right after, with no await in between. A stop or a
   *  drop while it waits THROWS a typed abort the pass does not count as a
   *  failure. */
  async function paceWait(adapterId, units, rec = null) {
    const r0 = rec || (live.get(adapterId) || {}).record || null;
    if (!r0 || !paceDecl(r0)) return;   // no pace declared: never waits, never throws
    // verify r3: a PACED adapter with no live entry — or one whose entry is replaced while it queues — is an account that
    // was removed / rebuilt under the call (`dropLive`): the call is ABORTED, typed, never let through. Returning here
    // let every caller queued behind a removed account leave in one instant, unpaced (17 × 20 units in 1 ms after a
    // remove()), each a vendor call the account's owner had just ended.
    const gone = () => new ChannelError('transport', 'the account changed (removed or rebuilt) while a request waited for its pace — the request was not sent', { retryable: true, detail: { paceAborted: true, accountChanged: true } });
    const e0 = live.get(adapterId);
    if (!e0) throw gone();
    // ONE JUDGEMENT AT A TIME, IN ARRIVAL ORDER, WITH AN ATOMIC RESERVATION (lane R5
    // verify r2): N callers outside the pass — a window's N attachment thumbnails,
    // a page-back beside the pass's fetch — each read the bucket before any of them
    // had metered (the meter runs a microtask after this returns), so 20 fetches
    // of 20 units left in ONE instant: 400 units in a second, the burst the vendor
    // refuses, and a page-back starved behind the pass for the whole ingest. Now a
    // caller waits for the callers before it (FIFO), judges, and the units it is
    // let through with are RESERVED (`paceInflight`, released by its meter) so the
    // next judgement sees them spent. A stop / a drop still wakes every sleeper.
    const need = Math.max(0, Number(units) || 0);
    const prev = paceQueues.get(adapterId) || Promise.resolve();
    let release = null;
    const mine = new Promise((r) => { release = r; });
    paceQueues.set(adapterId, prev.then(() => mine, () => mine));
    await prev;
    try {
      for (;;) {
        const e = live.get(adapterId);
        if (e !== e0) throw gone();   // THE ENTRY THIS CALL QUEUED AGAINST IS GONE OR REPLACED
        const d = e.record ? paceDecl(e.record) : null;
        if (!d) return;
        if (stopped) throw new ChannelError('transport', 'the channels engine stopped while a request waited for its pace', { retryable: true, detail: { paceAborted: true } });
        const t = paceClock();
        const ms = Drain.paceWaitMs(bucketSeen(d, e), t, need);
        if (!(ms > 0)) { e.paceInflight = (Number(e.paceInflight) || 0) + need; e.paceInflightAt = t; return; }   // THE RESERVATION — the same synchronous step as the judgement
        // a reservation lives between this return and the caller's meter — the same macrotask; one older than the
        // longest legal wait was never metered (an adapter that paced a call it did not meter): a phantom that would
        // hold the account's bucket down for good — dropped, said by name (once a minute per account)
        if ((Number(e.paceInflight) || 0) > 0 && t - (Number(e.paceInflightAt) || 0) > PACE_RESERVE_TTL_MS) {
          if (t - (Number(e.paceLeakWarnAt) || 0) > 60e3) { e.paceLeakWarnAt = t; log.warn(`[channels] ${adapterId}: ${Math.round(e.paceInflight)} paced units were never metered (pace() without meter() — an adapter contract violation); the phantom reservation is dropped`); }
          e.paceInflight = 0;
          continue;
        }
        await sleepFor(e, ms);
        if (stopped || live.get(adapterId) !== e) throw new ChannelError('transport', 'the channels engine stopped (or the account changed) while a request waited for its pace', { retryable: true, detail: { paceAborted: true } });
      }
    } finally { release(); }
  }
  /** The pace as the account card reads it. */
  function paceView(rec, e) {
    const d = paceDecl(rec);
    if (!d) return null;
    const pt = paceClock();
    const recent = e ? e.paceRecent.filter((x) => pt - x.at <= 1000) : [];
    return { unitsPerSec: Math.round(d.unitsPerSec * 100) / 100, perSec: d.perSec, burst: Math.round(d.burst * 100) / 100, unit: budgetDecl(rec).unit, settingKey: d.settingKey, spentLastSec: Math.round(recent.reduce((a, x) => a + x.n, 0)), fetchUnits: d.cost.fetch };
  }
  /** The current minute window (reset once 60 s have passed). */
  function win(e) { const t = now(); if (!e.win || t - e.win.at >= 60e3) e.win = { at: t, spent: 0, by: { timer: 0, agent: 0, owner: 0 } }; return e.win; }
  /** Charge the minute, attributed to WHO is spending it (2026-09-26, lane
   *  R2 verify): the pass in flight names its spender (`e.chargeBy` — a
   *  timer / kick / push pass is the timer's, an agent's refresh the agent's,
   *  a window's open or the owner's Refresh the owner's); a call outside a
   *  pass (a scroll-up page, an attachment) is the owner's. */
  function charge(e, n) {
    const w = win(e);
    const x = Math.max(0, Number(n) || 0);
    w.spent += x;
    const by = e.chargeBy || 'owner';
    w.by[by] = (w.by[by] || 0) + x;
    paceCharge(e, x);   // lane R5: the same units drain the per-second bucket (rule 18)
  }
  /** AN AGENT'S SHARE OF THE MINUTE (2026-09-26, lane R2 verify): the
   *  refresh floor is per conversation, so a loop over cold rows could spend
   *  the account's whole per-minute budget and halve the owner's own polling.
   *  Agent refreshes together may spend at most `channels.agentBudgetSharePct`
   *  of it (100 = no separate limit); past it the refusal names the share and
   *  the wait. `null` = within the share. */
  function agentShareRefusal(rec, e) {
    const pct = agentBudgetSharePct();
    if (pct >= 100) return null;
    const b = budgetDecl(rec);
    const w = win(e);
    const share = Math.max(1, Math.floor((b.limit * pct) / 100));
    const spent = Number(w.by && w.by.agent) || 0;
    if (spent < share) return null;
    const s = Math.max(1, Math.ceil((w.at + 60e3 - now()) / 1000));
    const unit = b.unit === 'quota-unit' ? 'quota units' : 'requests';
    return { ok: false, code: 'vendor-budget', error: `agent refreshes may use at most ${pct} % of this account's vendor budget per minute (${share} of ${b.limit} ${unit}) and have used it — read what is there now, or try again in ${s} s`, retryAfterSec: s, share: { pct, limit: share, spent: Math.round(spent), of: b.limit, unit: b.unit } };
  }
  /** May the pass send one more request? `false` stamps the exhaustion the
   *  account card says out loud. */
  function affordable(rec, e) {
    const w = win(e);
    if (w.spent < budgetDecl(rec).limit) return true;
    e.exhaustedAt = now();
    return false;
  }
  /** Run ONE adapter call: a METERED adapter charged what it sent; any other
   *  one is charged a single unit for the call. */
  async function vendor(rec, e, fn) {
    const b = budgetDecl(rec);
    const before = win(e).spent;
    const r = await fn();
    if (!b.metered && win(e).spent === before) charge(e, 1);
    return r;
  }
  /** The budget as the account card reads it (§6.2's sentence is composed by
   *  the client from this structure). */
  function budgetView(rec, e, t = now()) {
    const b = budgetDecl(rec);
    const w = e && e.win && t - e.win.at < 60e3 ? e.win : { at: t, spent: 0 };
    const exhausted = !!(e && e.exhaustedAt && t - e.exhaustedAt < 70e3 && w.spent >= b.limit);
    const by = w.by || {};
    const pd = paceDecl(rec);   // lane R5: the per-second figure the budget sentence names beside the minute's
    // verify r3 (T2 ②): the minute's meter is a FIXED window; the per-second bucket (`burst` at once, then `perSec`) is what
    // bounds a SLIDING minute — at most limit + burst (the day walk measured 64 under 60 + 5): the card names the burst
    return { unit: b.unit, limit: b.limit, spent: Math.round(w.spent), spentBy: { timer: Math.round(by.timer || 0), agent: Math.round(by.agent || 0), owner: Math.round(by.owner || 0) }, exhausted, waiting: exhausted ? (e.waiting || 0) : 0, resetInSeconds: exhausted ? Math.max(0, Math.ceil((w.at + 60e3 - t) / 1000)) : 0, settingKey: b.settingKey, perSec: pd ? Math.round(pd.unitsPerSec * 100) / 100 : null, burst: pd ? Math.round(pd.burst * 100) / 100 : null };
  }

  // ── WHICH CONVERSATIONS ARE OPEN IN A WINDOW RIGHT NOW (hot, §6.2) ───────
  const watching = new Map();   // key -> expiry epoch ms (the window's heartbeat)
  const isWatched = (key, t = now()) => (watching.get(key) || 0) > t;

  // ── the lane, asked never assumed ───────────────────────────────────────
  function laneFor(rec, entry) { return caps.laneState(registry.capsOf(rec.kind), rec, entry, now(), { feed: feedOpts() }); }
  function scanFor(rec) { return caps.scanState(registry.capsOf(rec.kind), rec, rec.scan && rec.scan.hostFacts, now()); }

  /** The resolved lane for a row: `laneState` answers for EVERY adapter and
   *  says `via:'scan'` on a scan one, at which point `scanState` — the ONE
   *  scan-source resolver — is the answer. NOTHING here reads `caps.receive`
   *  (r3: this function and the ingest's lane label both did, which is how a
   *  lane the resolver had declared unavailable was labelled and used). */
  function laneOrScan(rec, entry) {
    const l = laneFor(rec, entry);
    return l.via === 'scan' ? scanFor(rec) : l;
  }

  /** The empty `scan` half of an adapter row, for a record seeded before it
   *  existed. Never written for a non-scan adapter (the caller asked the
   *  resolver first). */
  const EMPTY_SCAN = () => ({ hostId: null, chosenSource: null, grantAskedAt: null, hostFacts: null });

  // ── WHAT IS DUE (2026-09-26: a due time PER CONVERSATION, §6.2) ─────────
  /** The resolved cadence of ONE entry — the scheduler's due time and the
   *  freshness chip read this same answer. */
  function cadenceOf(rec, en, t = now(), T = tiers()) {
    return caps.cadenceFor(registry.capsOf(rec.kind), laneOrScan(rec, {}), en, t, { tiers: T, watched: isWatched(en.key, t) });
  }
  /** Every DUE conversation of one account, most-overdue first. `all` makes
   *  every listed one due (a forced pass); `dueNow` holds the ones a kick, a
   *  hint or a refresh named. A PAUSED override is never due by the timer; a
   *  conversation the vendor no longer lists (`unlistedAt`) is not polled. */
  function dueList(rec, e, t = now(), { all = false } = {}) {
    const T = tiers();
    const out = [];
    for (const en of Object.values(store.index.live())) {
      if (!en || en.adapterId !== rec.id) continue;
      const named = e.dueNow.has(en.key);
      if (en.unlistedAt && !named) continue;
      // lane lark-search-poll: THE FEED'S OWED MARKS — durable, named rows at the owed instant (a restart, a cut or a
      // refused fetch never loses one); never for a PAUSED row (the owner's pause wins over the timer — the mark waits)
      const cad = cadenceOf(rec, en, t, T);
      const owedAt = Number(en.feedOwedAt) || 0;
      if (!cad.paused && en.threadOwed && typeof en.threadOwed === 'object') for (const [tk, at] of Object.entries(en.threadOwed)) out.push({ key: Feed.threadDueKey(en.key, tk), id: en.id, dueAt: Number(at) || 0 });
      if (all || named) { out.push({ key: en.key, id: en.id, dueAt: named ? -1 : 0 }); continue; }
      if (owedAt && !cad.paused) { out.push({ key: en.key, id: en.id, dueAt: owedAt }); continue; }
      if (cad.paused || !cad.seconds) continue;
      const last = Number(en.lane && en.lane.lastPollAt) || 0;
      const dueAt = last + cad.seconds * 1000;
      if (dueAt <= t) out.push({ key: en.key, id: en.id, dueAt });
    }
    out.sort((x, y) => x.dueAt - y.dueAt || (x.key < y.key ? -1 : 1));
    return out;
  }
  function discoveryDue(rec, e, t = now()) {
    if (e.disc.cursor || e.discoverSoon || !e.disc.lastCompleteAt) return true;
    return t - e.disc.lastCompleteAt >= tiers().coldSec * 1000;
  }

  /**
   * DISCOVERY walks the adapter's cursor TO THE END (§6.2): a walk the budget
   * cuts short keeps its cursor and the next pass resumes it. A conversation
   * is born here (or by a pushed event); a NEW one starts with its backlog
   * READ (`readAt` = the account's `linkedAt`), so only what arrives after the
   * account was linked counts as unread. After a COMPLETE walk, a
   * conversation the vendor listed before and no longer lists (a Gmail scope
   * change, a chat the user left) is marked `unlistedAt`: kept readable,
   * never polled again unless it comes back.
   */
  async function discover(rec, e) {
    const d = e.disc;
    if (!d.cursor) d.startedAt = now();
    let pages = 0, complete = false;
    await ensureLinked(rec);
    for (;;) {
      if (!affordable(rec, e)) break;
      const page = await vendor(rec, e, () => e.adapter.listConversations({ limit: 100, cursor: d.cursor }));
      if (outlived(rec, e)) return { pages, complete: false };   // verify r4: a listing that outlived its entry mints no row
      const listedAt = now();
      await store.index.update(() => {
        for (const c of page.conversations || []) {
          const isNew = !store.index.has(`${rec.id}/${c.id}`);   // B-f32b: a lookup — `ix.conversations` here made every page's index write a whole one
          const en = store.index.entry(rec.id, c.id);
          en.vendorId = c.vendorId; en.title = c.title; en.kind = c.kind;
          en.participants = c.participants;
          if (c.lastAt && (!en.lastAt || c.lastAt > en.lastAt)) en.lastAt = c.lastAt;
          if (isNew) en.readAt = Number(rec.linkedAt) || listedAt;
          en.listedAt = listedAt;
          if (en.unlistedAt) delete en.unlistedAt;
          if ('tracked' in en) delete en.tracked;   // a pre-2026-09-26 row: the field gates nothing any more
        }
      });
      d.cursor = page.cursor || null;
      pages++;
      if (!d.cursor) { complete = true; break; }
      if (pages >= DISCOVERY_MAX_PAGES) break;
    }
    d.lastAt = now();
    if (complete) {
      d.lastCompleteAt = now();
      e.discoverSoon = false;
      const started = d.startedAt || 0;
      // lane lark-search-poll (§3.1): the GROUPS the change feed found before discovery listed them — each now listed
      // gets its owed mark (durable, like every other); one still unlisted after a complete walk is dropped and counted
      const found = e.feedGroups && e.feedGroups.size ? [...e.feedGroups] : [];
      if (e.feedGroups) e.feedGroups.clear();
      let unlistedHits = 0;
      await store.index.update(() => {
        // B-f32b: a read-only scan that marks the rows it unlists — reaching `ix.conversations` here made every
        // complete discovery's index write a whole one (0.5 s at 50 274 rows)
        const rows = store.index.rows();
        for (const k of Object.keys(rows)) {
          const en = rows[k];
          if (en && en.adapterId === rec.id && en.listedAt && en.listedAt < started && !en.unlistedAt) { en.unlistedAt = now(); store.index.touch(k); }
        }
        for (const [cid, g] of found) {
          const en = store.index.entry(rec.id, cid, { create: false });
          // verify r1: a chat the search sees and a COMPLETE listing does not — remembered, so its next hits do not re-arm a
          // discovery walk every feed page (FEED_UNLISTED_MAX, for one cold cycle; the regular discovery lists it if it comes)
          if (!en || en.unlistedAt) { unlistedHits++; if (e.feedUnlisted) { e.feedUnlisted.delete(cid); e.feedUnlisted.set(cid, now()); while (e.feedUnlisted.size > FEED_UNLISTED_MAX) e.feedUnlisted.delete(e.feedUnlisted.keys().next().value); } continue; }
          en.feedOwedAt = Math.max(Number(en.feedOwedAt) || 0, Number(g.observedAt) || 0);
          if (g.threads && g.threads.size) { const prevOwed = en.threadOwed; en.threadOwed = Feed.mergeThreadOwed(en.threadOwed, new Map([...g.threads].map(([k]) => [k, g.observedAt]))).marks; en.threadReach = Feed.mergeThreadReach(en.threadReach, prevOwed, [...g.threads.keys()], g.from, en.threadOwed); }
        }
      });
      if (unlistedHits && rec.feed) { feedRow(rec).counters.unlistedHits += unlistedHits; }
    }
    return { pages, complete };
  }
  /** The account's link instant (unread counts start there), stamped once. */
  async function ensureLinked(rec) {
    if (Number(rec.linkedAt) > 0) return;
    await store.adapters.update(() => { if (!(Number(rec.linkedAt) > 0)) rec.linkedAt = now(); });
  }

  // ── THE CHANGE FEED (lane lark-search-poll, B-5aab, 2026-09-28 — design §27) ─────────────
  // ONE account-wide "what changed" page per drain action (rule 21): Lark's empty-query message search names every
  // conversation holding a new message — groups, single chats (which the chat listing never names), thread replies.
  // A hit is a MARK, never words: it becomes a DURABLE owed mark on the index FIRST (flushed), the feed's cursor moves
  // SECOND (a crash between the two costs a re-read, never a hit — design §5 invariant 4's order); the words arrive
  // through the existing readers (`history()`, the thread walk). Per-conversation polling is untouched until the feed
  // has PROVED it sees everything (the measurement below); then `laneState` answers `pollCadence:'feed'` and the rows
  // relax to the 5-minute net (owner decision 4), an open window staying hot.
  /** The adapter's declared change feed, or null. */
  function feedDecl(rec) { return caps.changeFeedRow(registry.capsOf(rec.kind)); }
  /** The adapter record's `feed` half, healed (born lazily — no migration). */
  function feedRow(rec) {
    const born = !rec.feed || typeof rec.feed !== 'object';
    if (born) rec.feed = {};
    const f = rec.feed;
    // lane lark-p2p: a row born now is written by THIS reader (no restart); an older row is healed first
    if (born) { const d = feedDecl(rec); f.readerRev = (d && d.reader) || 1; }
    else feedReaderHeal(rec);
    for (const k of ['firstRunAt', 'backlogUntil', 'cursorAt', 'window', 'catchUp', 'promotedAt', 'demotedAt', 'refused', 'backoffUntil', 'backoffWhy', 'lastOkAt', 'lastRunAt', 'lastFlip', 'strikeWhy', 'shapeRun']) if (!(k in f)) f[k] = null;
    if (!caps.FEED_MODES.includes(f.mode)) f.mode = 'measuring';
    if (!Array.isArray(f.samples)) f.samples = [];
    if (!(Number(f.strikes) >= 0)) f.strikes = 0;
    if (!f.counters || typeof f.counters !== 'object') f.counters = {};
    for (const k of ['malformed', 'stripped', 'unlistedHits', 'births', 'describeFailed', 'threadOwedDropped', 'pages']) if (!(Number(f.counters[k]) >= 0)) f.counters[k] = 0;
    // lane lark-threads (A5 — THE MEASUREMENT, zero new calls): search hits that carried a thread id; feed hits the chat
    // read did not find, read by id (A4) — a thread reply ingested, a refusal, any other answer; the recent-roots rechecks
    for (const k of ['threadHits', 'missingFetched', 'missingRefused', 'missingOther', 'rechecks', 'recheckWidened']) if (!(Number(f.counters[k]) >= 0)) f.counters[k] = 0;
    if (!f.counters.missedTypes || typeof f.counters.missedTypes !== 'object') f.counters.missedTypes = {};
    if (!Array.isArray(f.counters.malformedFields)) f.counters.malformedFields = [];
    if (!Array.isArray(f.counters.unreadableRecent)) f.counters.unreadableRecent = [];   // verify r2: the last hour's ring
    return f;
  }
  /**
   * A FEED ROW THE OLD HIT READER WROTE STARTS OVER (lane lark-p2p, 2026-09-30). The adapter declares its reader's
   * revision (`caps.changeFeed.reader`); a row written by an older one carries that reader's cursor, its window in
   * flight, its catch-up, its measurement and its back-off — all of them what a reader that could not read the hits
   * decided (production: a window from the previous afternoon still in flight after 8 043 pages, a catch-up that never
   * ran, strikes 7). It restarts as a FIRST RUN: a fresh window, the 7-day single-chat catch-up (born READ — never news,
   * never a wake: the first run of a reader that works is now), the measurement from zero. A scope refusal (`forbidden`)
   * is the sign-in's, kept; conversations already born keep their rows. In memory — the next adapters write persists it
   * (`start()` writes it at boot). → true when the row was restarted.
   */
  function feedReaderHeal(rec) {
    const d = feedDecl(rec);
    const f = rec && rec.feed;
    if (!d || !f || typeof f !== 'object') return false;
    const want = Number(d.reader) || 1;
    const had = Number(f.readerRev) || 1;
    if (had >= want) { if (f.readerRev !== had) f.readerRev = had; return false; }
    const hadAny = !!(f.cursorAt || f.window || f.catchUp || (f.counters && Number(f.counters.pages) > 0));
    for (const k of ['firstRunAt', 'backlogUntil', 'cursorAt', 'window', 'catchUp', 'promotedAt', 'demotedAt', 'backoffUntil', 'backoffWhy', 'lastOkAt', 'lastRunAt', 'lastFlip', 'strikeWhy', 'shapeRun']) f[k] = null;
    if (f.refused && f.refused.code !== 'forbidden') f.refused = null;
    f.mode = 'measuring'; f.samples = []; f.strikes = 0;
    const c = f.counters && typeof f.counters === 'object' ? f.counters : {};
    f.counters = { ...c, malformed: 0, malformedFields: [], missedTypes: {}, unreadableRecent: [] };
    f.readerRev = want;
    const e = live.get(rec.id);
    if (e) { e.feedTokens = { steady: null, catchUp: null }; e.feedPrevSig = null; e.feedPending = []; e.feedMemStart = null; }
    if (hadAny) log.log(`[channels] ${rec.id}: the change feed's hit reader changed (revision ${had} → ${want}) — the feed starts over: a fresh window and the single-chat catch-up of the last ${setting('channels.feedBackfillDays')} days`);
    return true;
  }
  /** THE ONE ANSWER (channel-caps `feedState`) with this instance's settings. */
  function feedStateOf(rec, t = now()) { return caps.feedState(registry.capsOf(rec.kind), rec, t, feedOpts()); }
  /** Is a feed page due NOW (the timer's turn)? On, not backing off, and a window in flight / a catch-up pending / a
   *  tick's worth of time since the last steady window began. */
  function feedDue(rec, e, t = now()) {
    const decl = feedDecl(rec);
    if (!decl) return false;
    feedReaderHeal(rec);   // lane lark-p2p: an old reader's back-off / park never holds the new reader off
    const fs = feedStateOf(rec, t);
    if (!fs.on) return false;
    const f = rec.feed || {};
    if (Number(f.backoffUntil) > t) return false;
    // its own sliding minute spent ⇒ not due (a window in flight never makes the tick run an empty pass every 5 s)
    if (e && Feed.pagesLeft(e.feedCalls, t, decl.perMin) <= 0) return false;
    if (f.window || (f.catchUp && !f.catchUp.done)) return true;
    const last = Number(f.lastRunAt) || 0;
    return !last || t - last >= feedOpts().everySec * 1000;
  }
  /** A feed-LOCAL refusal of a page (§2.5): the SEARCH's own tier / scope / shape — the feed parks or waits, the
   *  account's back-off, failure count and pace bucket are NOT touched (the per-conversation polling carries on). An
   *  ACCOUNT failure (a dead token, the network) is thrown — rule 3. → the drain's `{skip}`. */
  async function feedRefusal(rec, e, f, kind, err, hadToken) {
    const code = err instanceof ChannelError ? err.code : 'vendor-error';
    // verify r1 (lane lark-search-poll): only a DEAD TOKEN is the account's (every call would fail with it) — and a pace
    // sleep a stop / a drop woke is the pass's abort. A SEARCH that does not answer (a 5xx, a timeout — typed
    // `transport`) is the FEED's own failure: it used to be thrown as the ACCOUNT's (rule 3), and since the feed runs
    // FIRST in every timer pass, a search outage failed every pass before its first fetch — no conversation was polled
    // for as long as the search was down (measured: 20 minutes, zero history reads, the account backed off with a "For
    // you" item). The network truly down is still rule 3: the pass goes on and its first fetch fails the account.
    if (code === 'auth-expired' || (err && err.detail && err.detail.paceAborted)) throw err;
    const t = now();
    const d = (err && err.detail) || {};
    let skip = code;
    // lane lark-p2p: a strike counts IN A ROW of its own kind (`strikeWhy`) — the card's "did not answer 3× in a row" is
    // true only while every strike is the same failure; an answered page ends a transport / rate / unparseable run
    const strike = (kind) => { f.strikes = (f.strikeWhy === kind ? Number(f.strikes) || 0 : 0) + 1; f.strikeWhy = kind; };
    if (code === 'rate-limited') {
      strike('rate-limited');
      const hint = Number(d.retryAfterSec);
      f.backoffUntil = t + (Number.isFinite(hint) && hint > 0 ? Math.min(RATE_RETRY_AFTER_MAX_MS, Math.max(1e3, Math.ceil(hint * 1000))) : RATE_BACKOFF_MS[Math.min(f.strikes - 1, RATE_BACKOFF_MS.length - 1)]);
      f.backoffWhy = 'rate-limited';
      if (f.strikes === RATE_STRIKES_LOUD) log.warn(`[channels] ${rec.id}: the vendor limited the change feed ${f.strikes} times in a row — per-conversation polling carries on; the search resumes by itself`);
    } else if (code === 'transport') {
      // the search's own failure ladder (30 s → 15 min), inside the feed only — the per-conversation polling carries on
      strike('transport');
      f.backoffUntil = t + BACKOFF_MS[Math.min(f.strikes, BACKOFF_MS.length - 1)];
      f.backoffWhy = 'failed';
      if (f.strikes === FAILURES_BEFORE_LOUD) log.warn(`[channels] ${rec.id}: the change feed's search did not answer ${f.strikes} times in a row (${String((err && err.message) || err).slice(0, 200)}) — each conversation is polled on its own; the search is retried by itself`);
    } else if (code === 'forbidden') {
      const req = Array.isArray(d.requiredScopes) && d.requiredScopes.length ? d.requiredScopes.slice(0, 8) : [feedDecl(rec).scope].filter(Boolean);
      f.refused = { at: t, code: 'forbidden', requiredScopes: req, retryAt: null };
      f.window = null; e.feedTokens.steady = null; e.feedTokens.catchUp = null;
      log.warn(`[channels] ${rec.id}: the change feed was refused (${req.join(' + ') || 'a permission'}) — parked until the account is re-authorized; each conversation is polled on its own`);
    } else if (hadToken && (code === 'not-found' || code === 'vendor-error')) {
      // U8: a page token the vendor no longer honours — the SAME window restarts from page 1 (the dedup absorbs it)
      e.feedTokens[kind === 'catchUp' ? 'catchUp' : 'steady'] = null;
      if (f.window && kind !== 'catchUp') f.window = { ...f.window, pages: 0 };
      strike('token');
      if (f.strikes >= 3) { f.backoffUntil = t + BACKOFF_MS[Math.min(f.strikes - 2, BACKOFF_MS.length - 1)]; f.backoffWhy = 'failed'; }
      // verify r3: said ONCE in the journal (at the outage line's count) with the vendor's own reason — a continuation
      // answering something that is not a search page included; this ladder never wrote a line
      if (f.strikes === FAILURES_BEFORE_LOUD) log.warn(`[channels] ${rec.id}: the change feed's continuation page was refused ${f.strikes} times in a row (${String((err && err.message) || err).slice(0, 200)}) — the window restarts from its first page each time; each conversation is polled on its own; the search is retried by itself`);
      skip = 'token';
    } else if (code === 'vendor-error' && d.contract) {
      f.refused = { at: t, code: 'contract', requiredScopes: [], retryAt: t + 24 * 3600e3 };
      f.window = null;
      log.warn(`[channels] ${rec.id}: the change feed answered outside its contract (${d.contract}) — parked for 24 h; each conversation is polled on its own`);
    } else if (code === 'vendor-error') {
      // an unparseable page climbs the account's failure numbers (30 s → 15 min) INSIDE the feed only.
      // verify r3: a 200 that is NOT A SEARCH PAGE (r2's `detail.envelope` — a changed API, a proxy page, a captive portal)
      // is a strike KIND of its own: the card says "answered N× in a row with something that is not a search page" (never
      // "is not answering" — it answers) and the journal names the missing field ONCE at the loud count. A vendor answering
      // that for ever used to climb this ladder as "failed N× in a row" with not one journal line (measured: 15 searches in
      // 3 h, the words "not a search page" nowhere — the r2 judge's own reason discarded here).
      const envelope = typeof d.envelope === 'string' && /^[A-Za-z0-9_.]{1,64}$/.test(d.envelope) ? d.envelope : null;
      strike(envelope ? 'envelope' : 'vendor-error');
      f.backoffUntil = t + BACKOFF_MS[Math.min(f.strikes, BACKOFF_MS.length - 1)];
      f.backoffWhy = 'failed';
      if (f.strikes === FAILURES_BEFORE_LOUD) log.warn(`[channels] ${rec.id}: the change feed's search answered ${f.strikes} times in a row with ${envelope ? `something that is not a search page (no ${envelope})` : 'a page this version cannot read'} (${String((err && err.message) || err).slice(0, 200)}) — each conversation is polled on its own; the search is retried by itself`);
    } else {
      f.refused = { at: t, code: 'vendor-error', requiredScopes: [], retryAt: t + 24 * 3600e3 };
      f.window = null;
      log.warn(`[channels] ${rec.id}: the change feed failed (${code}) — parked for 24 h`);
    }
    await store.adapters.update(() => {});
    notify([]);
    return { skip };
  }
  /**
   * ONE CHANGE-FEED PAGE (the drain's `feed` action). Which page: the steady window in flight, else a NEW steady window
   * once a tick's worth of time passed, else the single-chat catch-up (the first run's backfill / a long stop's gap).
   * THE ORDER IS THE INVARIANT: the page is judged (`pageVerdict` — an ignored time range parks after ONE page), folded
   * (owed marks / births / group hints / repeats), the OWED MARKS and the births are written to the index and FLUSHED,
   * and only then does the cursor move (a window completes only when its last page is durable). → `{due, more}` for the
   * drain (the rows ahead of the plain ones) | `{skip}` (a feed-local refusal) | `{noCall}`.
   */
  async function feedPage(rec, e) {
    const decl = feedDecl(rec);
    if (!decl) return { noCall: true };
    const t = now();
    const f = feedRow(rec);
    const opts = feedOpts();
    if (f.refused) { if (feedStateOf(rec, t).state === 'refused') return { noCall: true }; f.refused = null; f.strikes = 0; f.strikeWhy = null; f.shapeRun = null; }   // lifted: a Re-authorize, or its own retry instant
    if (Number(f.backoffUntil) > t) return { noCall: true };
    let kind = null, win = null, token = null;
    if (f.window) {
      const w = Feed.window(f, t, decl, { overlapSec: opts.overlapSec, tokenAt: e.feedTokens.steady ? e.feedTokens.steady.at : null });
      kind = 'steady'; win = { from: w.from, to: w.to };
      token = w.act === 'continue' ? e.feedTokens.steady.token : null;
      if (w.act === 'restart') { e.feedTokens.steady = null; f.window = { ...f.window, pages: 0 }; }
    } else if (!f.lastRunAt || t - Number(f.lastRunAt) >= opts.everySec * 1000) {
      const w = Feed.window(f, t, decl, { overlapSec: opts.overlapSec });
      f.lastRunAt = t;
      if (w.act === 'none') { log.warn(`[channels] ${rec.id}: the clock is behind the change feed's cursor — no page this tick`); await store.adapters.update(() => {}); return { noCall: true }; }
      kind = 'steady'; win = { from: w.from, to: w.to };
      f.window = { from: w.from, to: w.to, pages: 0 };
      if (e.feedMemStart === null) e.feedMemStart = w.from;
      const days = setting('channels.feedBackfillDays');
      if (w.first) {
        // THE FIRST RUN (§2.7): the news begins now; the last `feedBackfillDays` of SINGLE chats are a bounded backfill
        // (born READ, never a wake, never on the first screen) — an existing account takes this path once too
        if (!f.firstRunAt) f.firstRunAt = t;
        if (!f.backlogUntil) f.backlogUntil = t;
        if (decl.catchUp && days > 0 && !f.catchUp) f.catchUp = { from: t - days * 86400e3, to: w.from, pages: 0, found: 0, done: false, bounded: false, days, gap: false };
      } else if (w.gap && decl.catchUp && !(f.catchUp && !f.catchUp.done)) {
        // a stop longer than the window's reach: its older span is the SAME single-chat catch-up (groups are covered by
        // their own polls; a gap's thread replies load when the thread is opened)
        f.catchUp = { from: w.gap.from, to: w.gap.to, pages: 0, found: 0, done: false, bounded: false, days: Math.max(1, Math.round((w.gap.to - w.gap.from) / 86400e3)), gap: true };
      } else if (w.gap && decl.catchUp && f.catchUp && !f.catchUp.done && Number(w.gap.to) > Number(f.catchUp.to)) {
        // lane lark-p2p: a gap while a catch-up is still PENDING (a park lifted after a day, a back-off that outlived the
        // window's reach) WIDENS it — the gap's single chats were silently dropped (neither the steady window nor the
        // pending span holds them; they would appear only with their next message). The widened span starts from page 1.
        const cu = f.catchUp;
        f.catchUp = { ...cu, from: Math.min(Number(cu.from), Number(w.gap.from)), to: Number(w.gap.to), pages: 0, bounded: false, days: Math.max(1, Math.round((Number(w.gap.to) - Math.min(Number(cu.from), Number(w.gap.from))) / 86400e3)), gap: true };
        e.feedTokens.catchUp = null;
      }
    } else if (f.catchUp && !f.catchUp.done) {
      kind = 'catchUp'; win = { from: f.catchUp.from, to: f.catchUp.to };
      const tk = e.feedTokens.catchUp;
      token = tk && t - tk.at < Feed.PAGE_TOKEN_TTL_MS ? tk.token : null;
    } else return { noCall: true };
    // the page is charged to the feed's OWN sliding minute when it is SENT (the account's minute + pace through the gate)
    e.feedCalls = Feed.minuteAt(e.feedCalls, t).calls.concat([t]);
    let page;
    try {
      page = await vendor(rec, e, () => e.adapter.changes({ from: win.from, to: win.to, pageToken: token, chatType: kind === 'catchUp' ? decl.catchUp.chatType : null, pageSize: decl.pageSize }));
    } catch (err) {
      if (outlived(rec, e)) throw err;
      return feedRefusal(rec, e, f, kind, err, !!token);
    }
    if (outlived(rec, e)) return { skip: 'account-changed' };
    f.counters.pages++;
    // lane lark-p2p (the 504 path): the search ANSWERED — a run of "did not answer" / "limited" / "unparseable" strikes is
    // over (it used to end only when a whole window completed: a window paging for hours kept every 504 of the day on one
    // count, strikes 7, and each new 504 waited the ladder's top 15 min). A refused page TOKEN is judged per window (its
    // belt against a vendor that refuses every continuation: page 1 answers each time) — kept until the window completes.
    if (f.strikeWhy !== 'token' && (Number(f.strikes) > 0 || f.strikeWhy)) { f.strikes = 0; f.strikeWhy = null; }
    // verify r1 (U9): a continuation page is judged against the token we SENT and the previous page of THIS window — a
    // vendor that ignores the token answers the same page for ever (the window never completes)
    const wkey = `${kind}:${win.from}:${win.to}`;
    // lane lark-p2p verify r1: the pages THIS window already read — the count's own ceiling (a vendor answering
    // `has_more` for ever with fresh ids and no `total` paged one window at the feed's whole minute for ever)
    const pagesBefore = kind === 'steady' ? Number(f.window.pages) || 0 : Number(f.catchUp.pages) || 0;
    // verify r3: a continuation is judged against EVERY page of this window since its page 1 (a bounded list of signatures,
    // restarted with every page 1 — a restart re-reads the same pages legitimately): a vendor looping with a period of two
    // (A → B → A …, fresh tokens) repeated nothing the PREVIOUS page held and paged 161 times in 77 minutes before the
    // count's ceiling parked it as "ignored its time window" — parked `contract` at its third page now
    const sigList = token && e.feedPrevSig && e.feedPrevSig.key === wkey && Array.isArray(e.feedPrevSig.sigs) ? e.feedPrevSig.sigs : null;
    const verdict = Feed.pageVerdict(page, win, { pageSize: decl.pageSize, now: t, sent: token, prevSig: sigList, pages: pagesBefore });
    if (verdict.ok) e.feedPrevSig = { key: wkey, sigs: (sigList || []).concat([verdict.sig || '']).slice(-Feed.PAGE_SIGS_MAX) };
    if (!verdict.ok) {
      // BOUND BEFORE TRUST (§2.6): an ignored time range would turn "since the cursor" into "the whole history" — PARKED
      // by name after ONE page, retried in 24 h (a vendor fix); every conversation is polled on its own meanwhile
      f.refused = { at: t, code: verdict.park, requiredScopes: [], retryAt: t + 24 * 3600e3 };
      f.window = null; e.feedTokens.steady = null; e.feedTokens.catchUp = null;
      if (f.catchUp && !f.catchUp.done) f.catchUp = { ...f.catchUp, done: true, parked: true };
      log.warn(`[channels] ${rec.id}: the change feed is parked — ${verdict.why}; each conversation is polled on its own (retried in 24 h)`);
      await store.adapters.update(() => {});
      notify([]);
      return { skip: verdict.park };
    }
    f.counters.malformed += verdict.malformed;
    // verify r2: the card's unreadable line is about NOW — the ring of pages of the last hour that held an unreadable hit
    // (PURE `recentUnreadable`); the cumulative counter stays for diagnostics. Two stray items in one minute used to put
    // "4 search hits could not be read" on the card for ever (a day and 2 884 clean pages later, still there).
    if (verdict.malformed > 0) f.counters.unreadableRecent = Feed.recentUnreadable(f.counters.unreadableRecent, t, verdict.malformed);
    // lane lark-p2p: WHAT was unreadable (field names, the first three lists since this reader) — the card says them
    if (Array.isArray(page.malformedFields) && page.malformedFields.length) f.counters.malformedFields = Feed.mergeFieldLists(f.counters.malformedFields, page.malformedFields);
    // THE SHAPE VERDICT (lane lark-p2p, 2026-09-30): a run of pages this reader cannot read (≥ 90 % of their items) proves
    // nothing — not the time window, not the page token (every guard above judges readable hits) — and paging it on pages
    // the vendor's whole history (production: 241 260 unreadable hits, 8 043 pages, ten hours, the card silent). PARKED by
    // name with the fields it could not read; the catch-up stays pending (it runs once a reader that reads them arrives —
    // `feedReaderHeal` — or the 24-h retry reads a readable page); every conversation is polled on its own meanwhile.
    // lane lark-p2p verify r1: the run is judged PER WINDOW — it restarts with every window that starts from page 1 (a new
    // window, a restart, the catch-up's start). A run that outlived windows counted the same stray unreadable item on every
    // overlapping tick (a 60 s overlap on a 30 s tick reads a message ~3 times): TWO odd items in a quiet minute reached
    // the 5-item park and turned the single-chat feed off for 24 h. A page of 30 unreadable still parks on page 1.
    if (f.shapeRun && (f.shapeRun.key !== wkey || pagesBefore === 0)) f.shapeRun = null;
    const sv = Feed.shapeVerdict(f.shapeRun, { items: verdict.hits.length + verdict.malformed, malformed: verdict.malformed, fields: page.malformedFields });
    f.shapeRun = sv.run ? { ...sv.run, key: wkey } : null;
    if (sv.park) {
      f.refused = { at: t, code: 'shape', requiredScopes: [], retryAt: t + 24 * 3600e3, fields: sv.fields };
      f.window = null; e.feedTokens.steady = null; e.feedTokens.catchUp = null; f.shapeRun = null;
      log.warn(`[channels] ${rec.id}: the change feed is parked — ${sv.run.malformed} of ${sv.run.items} search items have a shape this version does not read (missing or unreadable: ${sv.fields.map((l) => l.join(' + ')).join(' | ')}); each conversation is polled on its own (retried in 24 h)`);
      await store.adapters.update(() => {});
      notify([]);
      return { skip: 'shape' };
    }
    if (page.stripped) { f.counters.stripped += page.stripped; log.warn(`[channels] ${rec.id}: the change feed's adapter handed ${page.stripped} hit(s) with fields outside the closed list — stripped (a contract violation)`); }
    const separate = threadsRow(registry.capsOf(rec.kind)).listing === 'separate';
    const liveIx = store.index.live();
    const stateOf = (cid) => { const en = liveIx[`${rec.id}/${cid}`]; if (!en) return null; if (en.unlistedAt) return 'unlisted'; if (en.refresh && en.refresh.every === 'paused') return 'paused'; return 'live'; };
    const fold = Feed.foldHits(verdict.hits, { seen: e.feedSeen, stateOf, hasRecord: (cid, vid) => msgConv.get(`${rec.id}\u0000${vid}`) === cid, separateThreads: separate });
    // lane lark-threads (A5): the measurement — how many of this page's new hits carry a thread id at all
    f.counters.threadHits += fold.threadHits;
    // A4: the hits behind an owed chat read (no thread id) wait for that read; one it does not find is read by id —
    // only where a by-id read is declared (a feed on an adapter whose replies are listed separately), never one remembered
    if (kind === 'steady' && separate && fold.owedHits.length) {
      for (const h of fold.owedHits) {
        if (stateOf(h.convId) !== 'live' || e.byIdMem.has(h.vendorId)) continue;
        e.feedMissing.delete(h.vendorId); e.feedMissing.set(h.vendorId, { convId: h.convId, at: h.at, observedAt: t });
      }
      while (e.feedMissing.size > FEED_MISSING_MAX) e.feedMissing.delete(e.feedMissing.keys().next().value);
    }
    // the owed instant is WHEN THE FEED SAW IT (our clock): a walk that starts after that holds the message whatever
    // the two clocks disagree by (the vendor's create_time is only the read line of a birth)
    const observed = t;
    const born = [];
    let threadDropped = 0;
    // verify r1 (LOW): a page with nothing to write (the quiet account's every tick) neither touches the index nor forces
    // its flush — it used to rewrite the whole index.json synchronously every 30 s (≈ 1 MB at 873 conversations)
    const writes = (kind === 'steady' && (fold.owed.size > 0 || fold.threadOwed.size > 0)) || fold.births.size > 0;
    if (writes) await store.index.update(() => {
      if (kind === 'steady') {
        for (const [cid] of fold.owed) {
          const en = store.index.entry(rec.id, cid, { create: false });
          if (en) en.feedOwedAt = Math.max(Number(en.feedOwedAt) || 0, observed);
        }
        for (const [cid, m] of fold.threadOwed) {
          const en = store.index.entry(rec.id, cid, { create: false });
          if (!en) continue;
          const prevOwed = en.threadOwed;
          const mt = Feed.mergeThreadOwed(en.threadOwed, new Map([...m].map(([k]) => [k, observed])));
          en.threadOwed = mt.marks; threadDropped += mt.dropped;
          en.threadReach = Feed.mergeThreadReach(en.threadReach, prevOwed, [...m.keys()], win.from, mt.marks);   // verify r2: the window's own reach
        }
      }
      for (const [cid, b] of fold.births) {
        if (store.index.has(`${rec.id}/${cid}`)) continue;   // born meanwhile (a push event, a discovery); B-f32b: a lookup, not `live()` (a whole-map touch)
        const en = store.index.entry(rec.id, cid);
        const bf = Feed.birthFacts({ at: b.at }, { linkedAt: rec.linkedAt, backlogUntil: f.backlogUntil, catchUp: kind === 'catchUp', windowFrom: win.from });   // verify r1: every message of the window is news, not only the newest
        en.kind = 'dm'; en.title = null; en.bornBy = 'feed'; en.bornAt = t;
        en.readAt = bf.readAt; en.newsSince = bf.newsSince;
        en.feedOwedAt = observed;
        en.peerIds = b.fromIds.slice(0, 4);
        // verify r2 (MONEY): the row's activity instant is the newest message CREATED, never an edit's instant — an edit of a
        // year-old message in an unknown single chat used to be born "active now": the hot tier (every 30 s for an hour, every
        // 5 min for a day, ≈ 400 reads) for a conversation nothing new was said in, and the top of All
        if (b.created && (!en.lastAt || b.created > en.lastAt)) en.lastAt = b.created;
        if (kind === 'steady' && separate && b.threads.size) { en.threadOwed = Feed.mergeThreadOwed(null, new Map([...b.threads].map(([k]) => [k, observed]))).marks; en.threadReach = Feed.mergeThreadReach(null, null, [...b.threads.keys()], win.from, en.threadOwed); }
        born.push(cid);
      }
    });
    let durable = true;
    if (writes) try { store.index.flush(); } catch (err) { durable = false; log.warn(`[channels] ${rec.id}: the change feed's owed marks were not flushed (${(err && err.message) || err}) — its cursor stays; the window is read again`); }
    for (const [vid] of fold.seenAdd) e.feedSeen.set(vid, t);
    Feed.trimSeen(e.feedSeen, t);
    if (fold.groups.size) {
      // the chat listing is the authority on group membership — discovery lists it, its mark is written then. Verify r1: a
      // chat a COMPLETE walk did not list within the last cold cycle re-arms nothing (it used to set discoverSoon on every
      // page it had a hit on: a listing walk per feed page — 20 walks in 12 minutes, 9 pages each at the owner's scale)
      const coldMs = tiers().coldSec * 1000;
      let hinted = 0;
      for (const [cid, g] of fold.groups) {
        const u = e.feedUnlisted.get(cid);
        if (u !== undefined && t - u < coldMs) { f.counters.unlistedHits++; continue; }
        if (u !== undefined) e.feedUnlisted.delete(cid);
        const prev = e.feedGroups.get(cid); e.feedGroups.set(cid, { observedAt: observed, from: prev && Number(prev.from) > 0 ? Math.min(Number(prev.from), win.from) : win.from, threads: new Map([...(prev ? prev.threads : new Map()), ...g.threads]) });
        hinted++;
      }
      if (hinted) e.discoverSoon = true;
      while (e.feedGroups.size > 200) { e.feedGroups.delete(e.feedGroups.keys().next().value); f.counters.unlistedHits++; }
    }
    // THE CURSOR SECOND — only once this page's marks are durable
    let more = false;
    if (kind === 'steady') {
      f.window = { ...f.window, pages: (Number(f.window.pages) || 0) + 1 };
      if (!durable) e.feedTokens.steady = null;
      else if (page.more) { e.feedTokens.steady = { token: page.pageToken, at: t }; more = true; }
      else {
        f.cursorAt = f.window.to; f.window = null; e.feedTokens.steady = null; f.lastOkAt = t; f.strikes = 0; f.strikeWhy = null; f.backoffUntil = null;
        // a window that completed an OLD span (a restart re-read it, a pass cut it) is followed by a fresh one in the same
        // pass when a tick's worth of time has passed — the feed catches up inside the rule-21 bound, never a pass late
        if (t - (Number(f.lastRunAt) || 0) >= opts.everySec * 1000) more = true;
      }
      if (!more && f.catchUp && !f.catchUp.done) more = true;   // news first, then the backfill — inside the same bound and ceiling
    } else {
      const cu = f.catchUp;
      cu.pages++; cu.found += born.length;
      if (durable && page.more && cu.pages < decl.catchUp.pagesMax) { e.feedTokens.catchUp = { token: page.pageToken, at: t }; more = true; }
      else if (durable) { cu.done = true; cu.bounded = !!page.more; cu.doneAt = t; e.feedTokens.catchUp = null; log.log(`[channels] ${rec.id}: the single-chat catch-up found ${cu.found} single chat(s) in ${cu.pages} page(s)${cu.bounded ? ' — bounded; quieter ones appear with their next message' : ''}`); }
    }
    // the cursor moved: records fetched before a complete window covered them are judged now (the measurement's pending)
    if (kind === 'steady' && !f.window && e.feedPending.length) { try { feedSample(rec, e, []); } catch (err) { log.warn(`[channels] ${rec.id}: the change feed's measurement failed: ${(err && err.message) || err}`); } }
    f.lastHits = verdict.hits.length;
    f.counters.births += born.length;
    f.counters.unlistedHits += fold.unlisted;
    f.counters.threadOwedDropped += threadDropped;
    await store.adapters.update(() => {});
    // NAME what was born (≤ DESCRIBE_MAX per feed tick, best effort, paced + metered through the gate) — never the raw id
    await describeFeedBorn(rec, e, born);
    // lane lark-threads (A4): the hits a chat read did not find, read by id (≤ BYID_PER_TICK per feed tick)
    if (separate) await fetchMissing(rec, e);
    const due = [];
    for (const cid of born) due.push({ key: `${rec.id}/${cid}`, dueAt: observed });
    if (kind === 'steady') {
      for (const [cid] of fold.owed) if (stateOf(cid) === 'live') due.push({ key: `${rec.id}/${cid}`, dueAt: observed });
      for (const [cid, m] of fold.threadOwed) if (stateOf(cid) === 'live') for (const [tk2] of m) due.push({ key: Feed.threadDueKey(`${rec.id}/${cid}`, tk2), dueAt: observed });
    }
    if (born.length) notify(born.map((cid) => `${rec.id}/${cid}`), { full: false });
    return { due, more };
  }
  /** Ask the adapter to NAME conversations the feed found (§3.3): the births of this page first, then an untitled
   *  feed-born row not described for 6 h — at most DESCRIBE_MAX per feed tick, only while the minute's budget holds;
   *  a failure names nothing and fails nothing (the client words an untitled single chat "Single chat"). */
  async function describeFeedBorn(rec, e, born) {
    const decl = feedDecl(rec);
    if (!decl || !decl.describes) return;
    const t = now();
    const ev = feedOpts().everySec * 1000;
    if (t - (Number(e.feedDescribe.at) || 0) >= ev) e.feedDescribe = { at: t, n: 0 };
    const wanted = born.slice();
    for (const en of Object.values(store.index.live())) {
      if (wanted.length >= Feed.DESCRIBE_MAX) break;
      if (en && en.adapterId === rec.id && en.bornBy === 'feed' && !en.title && t - (Number(en.describedAt) || 0) >= 6 * 3600e3 && !wanted.includes(en.id)) wanted.push(en.id);
    }
    for (const cid of wanted) {
      // the bound counts REQUESTS (a describe may ask the chat and then up to two people): ≤ DESCRIBE_MAX (+ one describe's
      // overshoot) per feed tick — a 30-chat catch-up is named over a few ticks, never a third of the minute at once
      if (e.feedDescribe.n >= Feed.DESCRIBE_MAX || !affordable(rec, e) || outlived(rec, e)) break;
      const en0 = store.index.peek(`${rec.id}/${cid}`) || {};
      let d = null;
      try { d = await vendor(rec, e, () => e.adapter.describe(cid, { peerIds: Array.isArray(en0.peerIds) ? en0.peerIds : [] })); }
      catch (err) {
        if (err instanceof ChannelError && (err.code === 'auth-expired' || err.code === 'rate-limited')) throw err;   // verify r2 F1: a 429 on a describe is the account's (the pass's ladder), never a counter
        feedRow(rec).counters.describeFailed++;
      }
      e.feedDescribe.n += Math.max(1, Number(d && d.requests) || 1);
      if (outlived(rec, e)) return;
      await store.index.update(() => {
        const en = store.index.entry(rec.id, cid, { create: false });
        if (!en) return;
        en.describedAt = now();
        if (d && d.title && !en.title) en.title = d.title;
        if (d && d.kind && en.bornBy === 'feed') en.kind = d.kind;
      });
    }
  }
  /** A thread the change feed NAMED (§1.6 fetchOne): ONE walk, charged to the timer, the vendor's own key. The result in
   *  the drain's fetch terms: ok | a conversation-level refusal (the walk's floor / a terminal refusal) | an account
   *  failure thrown (rule 3). A terminal refusal clears the thread's owed mark (no pass per tick for it). */
  async function threadFeedFetch(rec, e, act, tk) {
    const i = tk.convKey.indexOf('/');
    const convId = tk.convKey.slice(i + 1);
    const r = await threadRefresh(rec.id, convId, tk.threadKey, { by: 'timer', vendorNamed: true });
    if (r && r.ok) return { ok: true, appended: r.appended || 0, hints: [...e.dueNow] };
    const code = (r && r.code) || 'vendor-error';
    if (['auth-expired', 'transport', 'rate-limited'].includes(code)) throw new ChannelError(code, (r && r.error) || code, { retryable: code !== 'auth-expired' });
    if (!['thread-floor', 'backoff', 'vendor-budget', 'refresh-floor'].includes(code)) {
      await store.index.update(() => {
        const en = store.index.entry(rec.id, convId, { create: false });
        if (en && en.threadOwed && en.threadOwed[tk.threadKey] !== undefined) { const m = { ...en.threadOwed }; delete m[tk.threadKey]; if (Object.keys(m).length) en.threadOwed = m; else delete en.threadOwed; }
        if (en && en.threadReach && en.threadReach[tk.threadKey] !== undefined) { const r = { ...en.threadReach }; delete r[tk.threadKey]; if (Object.keys(r).length) en.threadReach = r; else delete en.threadReach; }
      });
    }
    return { refused: code, hints: [...e.dueNow] };
  }
  /**
   * A FEED HIT THE CHAT READ DID NOT FIND (lane lark-threads A4, 2026-10-01). The vendor's doc: a chat listing returns a
   * topic's ROOT only ("对于普通对话群中的话题消息，通过 chat 容器类型仅能获取到话题的根消息") — a REPLY made in a topic
   * on an OLD root (one the recent-roots page no longer covers) is in the search (IF the search indexes replies — A5
   * measures it) and in no listing we read. Once the conversation's chat read has run since the feed saw the hit and the
   * log still lacks it, the message is read BY ID (`messageById`, ONE call): a thread reply is ingested as a record of its
   * chat (the same log, the same dedup, the same news rule), its root is offered to the place door, its thread is owed.
   * Bounds: ≤ BYID_PER_TICK per feed tick per account, the minute's budget, the pace (through the gate); every answer
   * that is not a reply (and every refusal) remembered BYID_MEMORY_MS per message id, never asked again per tick; a
   * transport failure / a rate refusal leaves the hit waiting (never remembered); a dead token is the account's.
   */
  async function fetchMissing(rec, e) {
    if (!e.feedMissing.size) return;
    const t = now();
    if (t - e.byIdTick.at >= feedOpts().everySec * 1000) e.byIdTick = { at: t, n: 0 };
    for (const [vid, m] of e.byIdMem) { if (t - m.at < BYID_MEMORY_MS && m.at <= t) break; e.byIdMem.delete(vid); }
    const f = feedRow(rec);
    for (const [vid, h] of [...e.feedMissing]) {
      if (e.byIdTick.n >= BYID_PER_TICK || !affordable(rec, e) || outlived(rec, e)) break;
      const en = store.index.peek(`${rec.id}/${h.convId}`);
      if (!en || en.unlistedAt || e.byIdMem.has(vid)) { e.feedMissing.delete(vid); continue; }   // gone, or remembered
      // verify r1 F2: the cheap gate FIRST — `msgHeld` is a whole-log scan for a message the log lacks (`findRecord` reads the
      // file backwards to its first byte, synchronously), and every waiting hit used to pay it on the page's own pass, before
      // any read could have landed it (60 hits × the log, per feed page); a hit is asked of the log only once its read ran
      if (!(Number(en.lane && en.lane.walkStartedAt) >= h.observedAt)) continue;   // its chat read has not run since — it waits
      if (msgHeld(rec.id, h.convId, vid)) { e.feedMissing.delete(vid); continue; }   // the read found it
      e.feedMissing.delete(vid);
      e.byIdTick.n++;
      let r;
      try { r = await vendor(rec, e, () => e.adapter.messageById(h.convId, { messageId: vid })); }
      catch (err) {
        const code = err instanceof ChannelError ? err.code : 'vendor-error';
        if (code === 'auth-expired') throw err;
        if (code === 'transport' || code === 'rate-limited') {
          e.feedMissing.set(vid, h);   // the hit waits (never remembered as an answer)
          // verify r1 F1: a RATE refusal is the ACCOUNT's — the pass's failure path (the rate ladder, the bucket emptied),
          // never a by-id read that goes on calling inside the vendor's hint while the card shows no back-off
          if (code === 'rate-limited') throw err;
          break;
        }
        rememberById(e, vid, 'refused'); f.counters.missingRefused++;
        continue;
      }
      if (outlived(rec, e)) return;
      if (r && r.kind === 'reply' && r.record) { await landById(rec, e, h.convId, r); f.counters.missingFetched++; }
      else if (r && r.kind === 'root' && r.rootPatch) { store.widenPlaces(rec.id, h.convId, [r.rootPatch], { src: 'byid' }); f.counters.missingFetched++; }
      else f.counters.missingOther++;
      rememberById(e, vid, (r && r.kind) || 'absent');
    }
    if (e.byIdMem.size > FEED_MISSING_MAX) for (const k of [...e.byIdMem.keys()].slice(0, e.byIdMem.size - FEED_MISSING_MAX)) e.byIdMem.delete(k);
  }
  function rememberById(e, vid, kind) { e.byIdMem.delete(vid); e.byIdMem.set(vid, { at: now(), kind }); }
  /** A thread reply read by id becomes a record of its chat: the log (dedup), the root's place, its thread owed, the
   *  index's derived half, the news funnel (the conversation's own news line), one broadcast. */
  async function landById(rec, e, convId, r) {
    const key = `${rec.id}/${convId}`;
    const w = store.appendRecords(rec.id, convId, [r.record]);
    if (r.rootPatch) store.widenPlaces(rec.id, convId, [r.rootPatch], { src: 'byid' });
    const separate = threadsRow(registry.capsOf(rec.kind)).listing === 'separate';
    const fresh = Array.isArray(w.fresh) ? w.fresh : [];
    const en0 = store.index.peek(key) || {};
    await store.index.update(() => {
      const en = store.index.entry(rec.id, convId, { create: false });
      if (!en) return;
      if (separate && r.threadKey) { const prev = en.threadOwed; const mt = Feed.mergeThreadOwed(en.threadOwed, new Map([[r.threadKey, now()]])); en.threadOwed = mt.marks; en.threadReach = Feed.mergeThreadReach(en.threadReach, prev, [r.threadKey], Number(r.record.at) || now(), mt.marks); }
      if (fresh.length) {
        en.unread = (Number(en.unread) || 0) + fresh.filter((x) => Number(x.at) > (Number(en.readAt) || 0)).length;
        en.authors = mergeAuthors(en.authors, fresh);
        const newest = fresh.reduce((m, x) => (Number(x.at) > m ? Number(x.at) : m), 0);
        if (newest && (!en.lastAt || newest > en.lastAt)) en.lastAt = newest;
      }
    });
    if (fresh.length) {
      olderChanged(e, convId);
      const newsLine = Math.max(Number(rec.linkedAt) || 0, Number(en0.newsSince) || 0);
      const news = fresh.filter((x) => Number(x.at) > newsLine);
      if (news.length) track(onFresh(rec, convId, news, { lane: laneFor(rec, {}), origin: 'feed-by-id' }));
      notify([key], { full: false });
    }
  }
  /**
   * RULE 22a's ROWS (lane lark-threads A2): the account's conversations as the PURE `Drain.recheckDue` reads them — live
   * (never paused, never unlisted), the adapter's replies listed separately (the CAPABILITY row), the conversation's mode
   * (a topic group is never rechecked), walked once, its newest message, its last recheck. Nothing when the row says the
   * replies ride the listing.
   */
  function recheckDueFor(rec, t = now()) {
    if (threadsRow(registry.capsOf(rec.kind)).listing !== 'separate') return [];
    const rows = [];
    for (const en of Object.values(store.index.live())) {
      if (!en || en.adapterId !== rec.id) continue;
      const paused = !!(en.refresh && en.refresh.every === 'paused');
      // verify r1 F4: a conversation the vendor REFUSED the owner (its last read 403d, or gone) is not re-listed — its own
      // cadence keeps probing it and a read that succeeds clears `lane.lastError` (ingest), which lets the recheck back in
      const refused = !!(en.lane && en.lane.lastError && (en.lane.lastError.code === 'forbidden' || en.lane.lastError.code === 'not-found'));
      rows.push({ key: en.key, live: !en.unlistedAt && !paused && !refused, separate: true, mode: ((effectiveConvCaps(rec, en) || {}).threads || {}).mode || null, walked: !!(en.anchor || en.walkedAt), lastRecheckAt: Number(en.threadRecheckAt) || 0, lastAt: Number(en.lastAt) || 0 });
    }
    return Drain.recheckDue(rows, { now: t, everyMs: setting('channels.threadRecheckSec') * 1000 });
  }
  /**
   * THE RECENT-ROOTS RECHECK (lane lark-threads A2 — the owner's post, a thread born after its root was stored): ONE
   * vendor page of the conversation's newest messages, NO anchor stop, offered to the store's place door ONLY — a stored
   * root that now names a topic WIDENS (the write hook then owes its walk and repaints its row); a message the log does
   * not hold is left to the conversation's own read (`dueNow` when it is newer than what the log holds). Charged to the
   * caller (`by`: the timer's rule 22a, or the owner's press, 22b), through the gate (the budget, the pace). The stamp
   * `threadRecheckAt` is the rule's clock. A conversation-level refusal is `{skip}`; an account failure is thrown (rule 3).
   */
  async function recheckOne(rec, e, convId, { by = 'timer' } = {}) {
    if (threadsRow(registry.capsOf(rec.kind)).listing !== 'separate') return { skip: 'not-supported' };
    const key = `${rec.id}/${convId}`;
    const prevBy = e.chargeBy; e.chargeBy = by === 'owner' ? 'owner' : 'timer';
    let r;
    try { r = await vendor(rec, e, () => e.adapter.recentRoots(convId, { limit: RECHECK_PAGE })); }
    catch (err) {
      const code = err instanceof ChannelError ? err.code : null;
      if (code === 'not-found' || code === 'forbidden' || code === 'not-supported') { await stampRecheck(rec, convId, by); return { skip: code }; }
      throw err;
    } finally { e.chargeBy = prevBy; }
    if (outlived(rec, e)) return { skip: 'account-changed' };
    const records = (r.records || []).filter((x) => x && x.vendorId);
    const offered = records.map((x) => ({ vendorId: String(x.vendorId), threadKey: x.threadKey || null, root: x.root || null }));
    const w = store.widenPlaces(rec.id, convId, offered.filter((x) => x.threadKey || x.root), { src: 'recheck' });
    // a message the log does not hold, newer than its newest: the conversation's own read takes it (one ingest path)
    const en0 = store.index.peek(key) || {};
    const newest = Number(en0.lastAt) || 0;
    if (records.some((x) => Number(x.at) > newest && !msgHeld(rec.id, convId, String(x.vendorId)))) e.dueNow.add(key);
    await stampRecheck(rec, convId, by);
    const f = rec.feed && feedDecl(rec) ? feedRow(rec) : null;
    if (f) { f.counters.rechecks = (Number(f.counters.rechecks) || 0) + 1; f.counters.recheckWidened = (Number(f.counters.recheckWidened) || 0) + w.widened.length; }
    if (w.widened.length) log.log(`[channels] ${key}: the recent-roots recheck found ${w.widened.length} message(s) that now head a thread — their threads are loaded next`);
    return { widened: w.widened.length };
  }
  /** Is this message in the conversation's log? (the message → conversation cache first, else the store's own lookup) */
  function msgHeld(adapterId, convId, vid) {
    if (msgConv.get(`${adapterId}\u0000${vid}`) === convId) return true;
    try { return !!store.findRecord(adapterId, convId, vid); } catch { return false; }
  }
  /** Rule 22's clocks: `threadRecheckAt` (any recheck — the timer's cadence reads it) and `threadRecheckPressAt` (the
   *  owner's press — its own 60 s floor reads it). */
  async function stampRecheck(rec, convId, by = 'timer') {
    await store.index.update(() => { const en = store.index.entry(rec.id, convId, { create: false }); if (!en) return; en.threadRecheckAt = now(); if (by === 'owner') en.threadRecheckPressAt = now(); });
  }
  /** THE MEASUREMENT (§2.8): records a FETCH appended (an ingest, a thread walk — never a pushed one) judged against
   *  what the feed saw, once a complete window covers them; the mode moves by the push lane's rule, word for word, and
   *  every flip is said (the log + the card) with its numbers. */
  function feedSample(rec, e, records) {
    if (!feedDecl(rec) || !Array.isArray(records) || (!records.length && !(e.feedPending && e.feedPending.length))) return;
    const fs = feedStateOf(rec);
    if (!fs.on) return;
    const f = feedRow(rec);
    const coveredTo = Number(f.cursorAt) > 0 ? Number(f.cursorAt) - feedOpts().overlapSec * 1000 : null;
    const sm = Feed.sample(records.map((r) => ({ vendorId: r && r.vendorId, at: r && r.at, msgType: r && r.raw && r.raw.msg_type })), { coveredTo, memStart: e.feedMemStart, seen: e.feedSeen, pending: e.feedPending });
    e.feedPending = sm.pending;
    if (!sm.n) return;
    const t = now();
    f.samples = caps.pushSamplesAdd(f.samples, { at: t, n: sm.n, p: sm.p });
    for (const [ty, n] of Object.entries(sm.missedTypes)) if (Object.keys(f.counters.missedTypes).length < 20 || f.counters.missedTypes[ty]) f.counters.missedTypes[ty] = (Number(f.counters.missedTypes[ty]) || 0) + n;
    const m = caps.pushMissRate(f.samples, t);
    // verify r1: a promotion waits for ONE FULL COLD CYCLE of measurement (+ the overlap + two ticks: the cold reading
    // lands in a pass, its misses are judged there — never a promotion by that pass's earlier ingests) — only then has
    // every conversation, including one whose messages the search misses entirely, had its own independent reading judged
    const fo = feedOpts();
    const v = Feed.modeVerdict(f.mode, m, { spanMs: e.feedMemStart !== null ? t - e.feedMemStart : 0, minSpanMs: (tiers().coldSec + fo.overlapSec + 2 * fo.everySec) * 1000 });
    if (v.flipped) {
      f.mode = v.mode;
      if (v.mode === 'carrying') f.promotedAt = t; else f.demotedAt = t;
      f.lastFlip = { at: t, from: v.from, to: v.mode, total: m.total, missed: m.missed, rate: m.rate };
      log.log(`[channels] ${rec.id}: the change feed ${v.mode === 'carrying' ? 'CARRIES the account' : 'was DEMOTED'} — ${m.missed} of ${m.total} fetched messages (${(Math.round(m.rate * 1000) / 10)} %) were not found by it; ${v.mode === 'carrying' ? `each conversation now also polls every ${Math.round(setting('channels.relaxedPollSec') / 60)} min (an open window every ${setting('channels.pollHotSec')} s)` : 'each conversation polls at its own cadence again'}`);
      notify([]);
    }
  }
  /** The feed as the account card reads it (structure — `feedText` / `feedCatchUpText` word it on the client). */
  function feedView(rec, t = now()) {
    const decl = feedDecl(rec);
    if (!decl) return null;
    const fs = feedStateOf(rec, t);
    const f = rec.feed || {};
    const m = caps.pushMissRate(Array.isArray(f.samples) ? f.samples : [], t);
    const o = feedOpts();
    const cu = f.catchUp && typeof f.catchUp === 'object' ? { done: !!f.catchUp.done, found: Number(f.catchUp.found) || 0, days: f.catchUp.days || null, bounded: !!f.catchUp.bounded, gap: !!f.catchUp.gap } : null;
    return {
      state: fs.state, why: fs.why || null, mode: fs.mode || f.mode || null, on: !!fs.on, carrying: !!fs.carrying, scope: decl.scope || null,
      requiredScopes: fs.requiredScopes || [], until: fs.until || null, retryAt: fs.retryAt || null,
      // lane lark-p2p: the back-off's count and kind ("did not answer 3× in a row … until 03:28"), a shape park's fields
      strikes: Number(f.strikes) || 0, strikeWhy: f.strikeWhy || null, fields: fs.fields || [],
      everySec: o.everySec, overlapSec: o.overlapSec, relaxedSec: setting('channels.relaxedPollSec'), promoteMin: Feed.PROMOTE_MIN,
      measured: { total: m.total, missed: m.missed, rate: m.rate }, lastOkAt: f.lastOkAt || null, cursorAt: f.cursorAt || null,
      catchUp: cu, lastFlip: f.lastFlip || null,
      // verify r2: `malformedRecent` / `malformedAt` = the last hour's unreadable hits (the card's line reads these, never the
      // cumulative `malformed`, which is diagnostics)
      counters: f.counters ? { malformed: f.counters.malformed || 0, malformedFields: Feed.mergeFieldLists(f.counters.malformedFields, []), ...(() => { const r = Feed.recentUnreadableCount(f.counters.unreadableRecent, t); return { malformedRecent: r.n, malformedAt: r.at }; })(), births: f.counters.births || 0, unlistedHits: f.counters.unlistedHits || 0, pages: f.counters.pages || 0, missedTypes: { ...(f.counters.missedTypes || {}) },
        // lane lark-threads (A5): the measurement the card words — "does the search carry thread ids / index thread replies"
        threadHits: f.counters.threadHits || 0, missingFetched: f.counters.missingFetched || 0, missingRefused: f.counters.missingRefused || 0, missingOther: f.counters.missingOther || 0, rechecks: f.counters.rechecks || 0, recheckWidened: f.counters.recheckWidened || 0,
        // verify r2 ②: the hits still WAITING for a by-id read (≤ BYID_PER_TICK a tick, behind their chat's read) — said, never a silent queue
        missingWaiting: (() => { const x = live.get(rec.id); return x && x.feedMissing ? x.feedMissing.size : 0; })() } : null,
    };
  }
  /** What unlocks the CHANGE FEED on this account — the module's `feedGrant` against the held scopes (like reactions). */
  function feedGrantView(rec) {
    let mod = null;
    try { mod = registry.get(rec.kind); } catch { mod = null; }
    const g = mod && mod.feedGrant;
    if (!g) return null;
    const held = new Set(((rec.auth && rec.auth.scopes) || []).map(String));
    const refusedBy = new Set(((rec.auth && rec.auth.refusedScopes) || []).map(String));
    const missing = g.scopes.filter((x) => !held.has(x));
    const decls = ((realByKind.get(rec.kind) || mod).OPTIONS) || [];
    const opt = g.option ? (decls.find((o) => o.key === g.option) || null) : null;
    const v = opt ? ((rec.options && rec.options[g.option]) || opt.default) : null;
    return { scopes: g.scopes.slice(), missing, refused: missing.filter((x) => refusedBy.has(x)), console: !!g.console, wanted: !opt || v !== 'off' };
  }
  /** lane lark-threads: what unlocks reading PEOPLE (the module's `peopleGrant`) against the held scopes. */
  function peopleGrantView(rec) {
    let mod = null;
    try { mod = registry.get(rec.kind); } catch { mod = null; }
    const g = mod && mod.peopleGrant;
    if (!g) return null;
    const held = new Set(((rec.auth && rec.auth.scopes) || []).map(String));
    const refusedBy = new Set(((rec.auth && rec.auth.refusedScopes) || []).map(String));
    const missing = g.scopes.filter((x) => !held.has(x));
    return { scopes: g.scopes.slice(), missing, refused: missing.filter((x) => refusedBy.has(x)), console: !!g.console, wanted: true };
  }
  /** THE ONE GRANT LIST (§5.3): every declared grant the sign-in does not hold — the card says ONE line, ONE Re-authorize. */
  function grantsView(rec) {
    const out = [];
    const rx = reactionsGrantView(rec); if (rx) out.push({ what: 'reactions', ...rx });
    const fd = feedGrantView(rec); if (fd) out.push({ what: 'feed', ...fd });
    // lane lark-threads (B1/B5, MEASURED): reading people's profiles — the card says "One Re-authorize adds: reading
    // people's profiles" while the sign-in lacks it (never a silent refusal per person)
    const pp = peopleGrantView(rec); if (pp) out.push({ what: 'people', ...pp });
    return out;
  }

  // ── ONE pass over ONE adapter, single-flight — THE DRIVER OF THE PURE DRAIN ─
  /**
   * `force` = bypass the backoff, discover now and make EVERY conversation
   * due (a suite's and a connect's "ingest now"); `origin` = timer | kick |
   * request (a drain poked by `requestRefresh`). A conversation the vendor
   * refuses (not-found / forbidden) is noted on its row and the pass goes on;
   * a failure of the ACCOUNT (auth, rate limit, transport) fails the pass with
   * its code.
   *
   * THE DRAIN IS PURE (lane R2 verify r9 — the second structural closure).
   * WHICH conversation is fetched next, who is answered and with what, when a
   * refusal is judged, when the timer's turn and discovery run, when the pass
   * ends — every one of those decisions is `Drain.next` (src/channel-drain.js)
   * over a snapshot of the account's request set (`e.dq`), the pass and the
   * live facts. This loop only DRIVES it: requests are admitted through
   * `Drain.admit` (`requestRefresh`), each step performs the ONE action the
   * model names — the vendor call (the only await between two steps), the
   * store append inside `ingest`, the notify, the ledger charge through
   * `e.chargeBy` — and delivers exactly the answers the action names. Seven
   * rounds of an imperative scheduler whose decisions were spread across
   * `await`s each grew an ordering bug (r2 a foreign pass's answer, r3 the
   * back-off door, r4 a pass per waiter, r6 the storm that denied the owner
   * and refusals at the pass's end, r7 forced passes run thrice, r8 LIFO
   * across boundaries); the rules are now ONE numbered list pinned by a seeded
   * invariant walk (scripts/test-channel-drain.mjs), and this loop has no
   * ordering of its own to get wrong.
   */
  async function pass(adapterId, { force = false, origin = 'timer' } = {}) {
    const recs = adapterRecords();
    const rec = recs.adapters.find((r) => r.id === adapterId);
    if (!rec || rec.enabled === false) return { ok: false, why: 'no-such-adapter' };
    const e = adapterFor(rec);
    if (e.passing) {   // single flight, PER ADAPTER; a kick / a request is not lost
      if (origin === 'kick') { e.kickAfter = true; return e.passing; }
      if (origin === 'request') { e.drainAfter = true; return e.passing; }
      // a TIMER or FORCED ask while a pass runs is queued ONCE per account and a later ask JOINS it, `force` sticky (Drain rule 17 — r6 verify: never coalesced into a request pass that does no timer work; r7 verify: three Re-authorize presses behind a busy account ran three forced ingests)
      const q = Drain.queueAsk(e.after && e.after.ask, { force, origin });
      if (q.joined) { e.after.ask = q.queued; return e.after.p; }
      const queued = { ask: q.queued, p: null };
      const after = () => { e.after = null; return stopped ? { ok: false, why: 'stopped' } : pass(adapterId, queued.ask); };
      queued.p = e.passing.then(after, after);
      e.after = queued;
      return queued.p;
    }
    const wasInBackoff = inBackoff(e);
    const backoff = !force && wasInBackoff;
    if (backoff && !Drain.hasRequests(e.dq)) return { ok: false, why: 'backoff' };   // the timer waits; requests are judged (refused by name, or the owner's one press)
    e.passing = (async () => {
      // YIELD FIRST (2026-09-26): a pass that returned before its first
      // `await` ran its `finally` (e.passing = null) BEFORE this assignment
      // completed, so the settled promise stayed in `e.passing` and every
      // later pass of the account answered that stale result — a budget
      // refusal wedged the account for good (measured: the next minute's
      // pass returned the previous minute's 'budget').
      await null;
      const changed = [];
      const results = {};
      const early = new Set();   // keys broadcast at their fetch — a waiter was answered with their news (r8 medium: the toast said "N new" a whole pass before the window repainted)
      let failure = null;        // the pass's typed failure — what a taken waiter hears (Drain rule 3)
      let progressAt = now();    // lane R5: the bounded progress broadcast of a long (paced) pass
      let ended = null;          // the model's `end`
      const idOf = (key) => key.slice(key.indexOf('/') + 1);
      // THE DELIVERY: exactly the waiters an action names, the moment it names them — a refusal at its judgement (r6), an `ok` at ITS fetch (r7), a settlement in one step (Drain rules 2–4). A waiter that already left (its bound's `pending`, a stop, a drop) is not in `e.waiters`: nothing to deliver
      const deliver = (list, outcome) => { for (const id of list) { const w = e.waiters.get(id); if (w && w.outcome === undefined) { w.outcome = outcome; w.resolve(outcome); } } };
      /** An ACCOUNT-level failure of a vendor call: the back-off, its window, the card, the log and the "For you" item — the model then answers every taken waiter with it (Drain rule 3). */
      const failPass = async (err) => {
        // verify r5: a failure that lands AFTER the entry ended (a disconnect / remove / rebuild under the vendor call) is not
        // a fact about the account — no stamp on the record, no ladder step, no "For you" item; the pass ends as the abort it is
        if (outlived(rec, e)) return { ok: false, code: stopped ? 'stopped' : 'account-changed', error: 'the refresh was cut short (the engine stopped or the account changed) — refresh again', polledAt: null };
        const code = err instanceof ChannelError ? err.code : 'vendor-error';
        // lane R5: a RATE refusal is its own short ladder (the vendor's hint, else
        // 5 s doubling to 60 s) that never climbs the failure ladder; the bucket
        // is EMPTIED so the pass that resumes starts paced, never with a burst
        const rate = code === 'rate-limited';
        // verify r3: a 5xx's Retry-After (typed `transport` with the hint in its detail) is honoured by the FAILURE ladder
        // too — it waits at least the vendor's hint, never less; the rate ladder is unchanged
        const hint = (rate || code === 'transport') && err && err.detail ? Number(err.detail.retryAfterSec) : NaN;
        if (rate) {
          e.rateStrikes++;
          const own = RATE_BACKOFF_MS[Math.min(e.rateStrikes - 1, RATE_BACKOFF_MS.length - 1)];
          e.nextAt = now() + (Number.isFinite(hint) && hint > 0 ? Math.min(RATE_RETRY_AFTER_MAX_MS, Math.max(1e3, Math.ceil(hint * 1000))) : own);
          e.retryAfterSec = Number.isFinite(hint) && hint > 0 ? hint : null;
          if (paceDecl(rec)) e.paceTok = { tokens: 0, at: paceClock() };
        } else {
          e.failures++;
          const ladder = BACKOFF_MS[Math.min(e.failures, BACKOFF_MS.length - 1)];
          e.nextAt = now() + (Number.isFinite(hint) && hint > 0 ? Math.max(ladder, Math.min(RATE_RETRY_AFTER_MAX_MS, Math.ceil(hint * 1000))) : ladder);
          e.retryAfterSec = Number.isFinite(hint) && hint > 0 ? hint : null;
        }
        e.backoffKind = rate ? 'rate' : 'failure';
        // THE WINDOW: a back-off that BEGINS here (the account was not in one)
        // opens a new window with one owner press to honour; a failure INSIDE a
        // window (the honoured press itself, a forced pass) extends it and keeps
        // the press consumed — the owner's door climbs the ladder at most one
        // step per window, the timer's own retries climb the rest (r5 ruling)
        if (!wasInBackoff) e.backoffEpoch++;
        await store.adapters.update(() => { rec.lastPass = { at: now(), ok: false, code, error: String((err && err.message) || err).slice(0, 400) }; rec.consecutiveFailures = e.failures; });
        // A failing loop MUST reach the user (fence 8): the adapter row goes
        // amber, the log says it, and a "For you" item is FILED naming the
        // adapter and the vendor's own words — by the producer that will
        // RETRACT it on the first passing pass (`retractFailure`). A RATE
        // refusal is said on the card from the first strike ("Google is
        // limiting the rate · resuming in N s") and filed only when it PERSISTS.
        if (!rate && e.failures === FAILURES_BEFORE_LOUD) {
          log.warn(`[channels] ${rec.id}: ${e.failures} consecutive failures (${code}): ${(err && err.message) || err}`);
          await speakFailure(rec, code, err);
        }
        if (rate && e.rateStrikes === RATE_STRIKES_LOUD) {
          log.warn(`[channels] ${rec.id}: ${e.rateStrikes} rate refusals in a row despite the pace: ${(err && err.message) || err}`);
          await speakFailure(rec, code, err, e.rateStrikes);
        }
        // r4: a press that failed INTO a back-off hears the retry instant (the toast words it; Retry-After rides the route) — a bare "failed" invited the next press
        return { ok: false, code, error: `the refresh failed (${code})`, polledAt: null, retryAfterSec: Math.max(1, Math.ceil((e.nextAt - now()) / 1000)), backoffUntil: e.nextAt };
      };
      /** A pace sleep a stop / a drop woke (`paceWait`'s typed abort): not a failure of the account. */
      const aborted = (err) => !!(err && err.detail && err.detail.paceAborted) && (stopped || live.get(rec.id) !== e);
      /** The FACTS the model reads, fresh at every step (never written by it). */
      const facts = (connected) => {
        const b = budgetDecl(rec);
        const w = win(e);
        const remainingUnits = b.limit - w.spent;
        if (!(remainingUnits > 0)) e.exhaustedAt = now();   // the card's "exhausted" stamp, exactly as `affordable` stamps it
        const pct = agentBudgetSharePct();
        const share = pct >= 100 ? Infinity : Math.max(1, Math.floor((b.limit * pct) / 100)) - (Number(w.by && w.by.agent) || 0);
        const floors = {};
        for (const r of e.dq.requests) if (!(r.key in floors)) floors[r.key] = lastPollOf(r.key) || 0;
        // lane lark-search-poll (rule 21): the change feed's pages left in its OWN sliding minute
        const fd = feedDecl(rec);
        return { now: now(), stopped, dropped: live.get(rec.id) !== e, connected, backoff: { epoch: e.backoffEpoch, pressEpoch: e.ownerPressEpoch }, budget: { remainingUnits }, agentShare: { remaining: share }, floors, floorMs: agentRefreshFloorSec() * 1000, pace: paceOf(rec, e), ...(fd ? { feedPages: { remaining: Feed.pagesLeft(e.feedCalls, now(), fd.perMin) } } : {}) };
      };
      /** ONE conversation, the round the model named. */
      const fetchOne = async (act) => {
        const key = act.key;
        e.dueNow.delete(key);
        // lane lark-search-poll: a THREAD the change feed named since its last walk (`<conv key>#<thread key>`) — ONE walk,
        // charged to the timer, the vendor's own key (its search named it in this conversation); its floor unchanged
        const tk = Feed.splitThreadDueKey(key, (k) => !!store.index.peek(k));
        if (tk) return threadFeedFetch(rec, e, act, tk);
        e.chargeBy = act.chargeTo;   // the spender of THIS fetch: the timer's due row (a rider's too), the agent's request, the owner's press / a window's open
        if (act.pressed) e.ownerPressEpoch = e.backoffEpoch;   // the press is consumed by the attempt, not by the judgement
        let got;
        try { got = await ingest(e, rec, idOf(key), origin); }
        catch (err) {
          const code = err instanceof ChannelError ? err.code : null;
          if (code !== 'not-found' && code !== 'forbidden') throw err;
          await noteConvRefusal(rec, idOf(key), code, err);
          results[key] = { ok: false, code };
          deliver(act.waiters, { ok: false, code, error: `the vendor refused this conversation (${code})`, polledAt: lastPollOf(key) });
          return { refused: code, hints: [...e.dueNow] };
        }
        results[key] = { ok: true, appended: got.appended, complete: got.complete };
        if (got.appended || got.anchorMoved) {
          changed.push(key);
          if (act.waiters.length) { notify([key], { full: false }); early.add(key); }   // the broadcast naming the key goes out BEFORE the answer: the window repaints with the toast, not a pass later
        }
        // lane lark-threads (rule 22b): THE OWNER'S PRESS re-lists the conversation's newest page at once (a stored root that
        // grew a thread widens before the answer) — never a window's open, never an agent's refresh, never twice inside
        // RECHECK_FLOOR_MS, only while the minute holds (the floor is the OWNER's previous press — `threadRecheckPressAt` —
        // never the timer's recheck: a topic born a minute after the timer re-listed the chat is exactly what the owner
        // presses for). verify r1 F1: a RATE refusal (and a dead token) is the ACCOUNT's, whoever asked — it takes the
        // pass's failure path (the rate ladder, the bucket emptied) exactly as the timer's recheck and every other call do,
        // and the owner hears it with the retry instant; the records this fetch landed were broadcast ABOVE, before the
        // answer, so nothing is lost. Any other failure of the recheck never fails the owner's refresh (said in the log).
        if (act.recheck && threadsRow(registry.capsOf(rec.kind)).listing === 'separate' && Drain.recheckOnPress((store.index.peek(key) || {}).threadRecheckPressAt, now()) && affordable(rec, e) && !outlived(rec, e)) {
          try { await recheckOne(rec, e, idOf(key), { by: 'owner' }); }
          catch (err) { if (err instanceof ChannelError && (err.code === 'auth-expired' || err.code === 'rate-limited')) throw err; log.warn(`[channels] ${key}: the recheck on the owner's Refresh failed (${(err && err.message) || err}) — the next timer recheck tries again`); }
        }
        // THE ANSWER: this key's own fetch, completed now — after every one of its waiters began
        deliver(act.waiters, { ok: true, appended: got.appended || 0, polledAt: lastPollOf(key) });
        return { ok: true, appended: got.appended || 0, hints: [...e.dueNow] };
      };
      e.chargeBy = 'timer';
      try {
        const st = await refreshAuth(e);      // the row's auth is the adapter's answer, re-asked every pass
        // A record that was never authenticated (a Connect the user began and
        // abandoned, a disconnected adapter) has nothing to pass WITH: no
        // request is built, no failure is counted, the row says "not
        // connected". A DEAD token or a WITHDRAWN credential is different —
        // those passes run, fail with the vendor's typed refusal, and SPEAK
        // (fence 8), because the user has something to act on.
        const connected = !(st && st.state === 'unknown' && st.why === 'never-authenticated');
        // `scan.hostFacts` TRIGGER ③ (design §4 / §5 invariant 7, r6): a scan-lane pass asks the host's facts of the RESOLVER, once, before its first fetch (Drain rule 14)
        const scanLane = laneOrScan(rec, {}).via === 'scan';
        e.dq = Drain.open(e.dq, { origin, force, backoff, timerDue: e.timerDue, hostScan: scanLane });
        if (e.dq.pass.timerWork) e.timerDue = false;
        for (;;) {
          // THE TIMER'S TURN (Drain rule 13): the pass's opening one, or a tick that found this pass busy while the account was due (`e.timerDue`, r5 verify) — the due rows by the clock NOW
          if (Drain.wantsTurn(e.dq, e.timerDue)) {
            e.timerDue = false;
            const fd = feedDecl(rec);
            e.dq = Drain.turn(e.dq, { due: dueList(rec, e, now(), { all: e.dq.pass.force }), discoveryDue: discoveryDue(rec, e), feedDue: feedDue(rec, e, now()), feedPerPass: fd ? fd.pagesPerPass : undefined, recheckDue: recheckDueFor(rec) });   // lane lark-threads: rule 22a's rows
          }
          const act = Drain.next({ ...e.dq, ...facts(connected) });
          e.dq = Drain.apply(e.dq, act);   // the step is taken (an async action BEGINS)
          if (act.type === 'end') { ended = act; break; }
          if (act.type === 'refuse') { deliver(act.waiters, refusalFor(rec, e, act)); continue; }
          if (act.type === 'answer') { for (const id of act.waiters) { const w = e.waiters.get(id); if (w) deliver([id], settlementFor(act, failure, w.key)); } continue; }
          if (act.type === 'wait') { await sleepFor(e, act.ms); continue; }   // Drain rule 18: the bucket refills; the next step judges and picks again (a stop / a drop wakes it)
          let result;
          try {
            if (act.type === 'fetch') result = await fetchOne(act);
            else if (act.type === 'discover') { e.chargeBy = 'timer'; await discover(rec, e); result = { due: dueList(rec, e, now(), { all: e.dq.pass.force }) }; }
            else if (act.type === 'feed') { e.chargeBy = 'timer'; result = await feedPage(rec, e); }   // lane lark-search-poll: ONE change-feed page (rule 21)
            else if (act.type === 'recheck') { e.chargeBy = 'timer'; result = await recheckOne(rec, e, idOf(act.key), { by: 'timer' }); }   // lane lark-threads: ONE recent-roots page (rule 22a)
            else if (act.type === 'scanHost') {
              e.chargeBy = 'timer';
              const hf = await vendor(rec, e, () => e.adapter.scanHost((rec.scan && rec.scan.hostId) || null));
              await store.adapters.update(() => { if (!rec.scan) rec.scan = EMPTY_SCAN(); rec.scan.hostFacts = hf; });
              result = {};
            } else throw new Error(`channels: the drain named an unknown action ${act.type}`);
          } catch (err) {
            if (aborted(err)) result = { error: 'stopped' };   // a stop / a drop woke a pace sleep — the next step settles every waiter by name (rule 2)
            else { failure = await failPass(err); result = { error: failure.code }; }
          }
          e.dq = Drain.apply(e.dq, act, result);   // … and completes
          // lane R5: a long pass says its progress at most every PROGRESS_EVERY_MS — the rows it read since (a key said here is
          // not said again at the end: `early`) and, with them, the account's first-read count on the card
          if (act.type === 'fetch' && now() - progressAt >= PROGRESS_EVERY_MS) {
            const fresh = changed.filter((k) => !early.has(k));
            notify(fresh, { full: false });
            for (const k of fresh) early.add(k);
            progressAt = now();
          }
        }
        if (ended.why === 'stopped' || ended.why === 'dropped') return { ok: false, why: ended.why === 'dropped' ? 'account-changed' : 'stopped', changed, results };
        if (ended.why === 'not-connected') return { ok: false, why: 'not-connected' };
        if (failure) { notify(changed.filter((k) => !early.has(k)), { full: false }); return { ok: false, why: failure.code, changed, results }; }
        if (ended.why === 'budget') { e.waiting = dueList(rec, e).length; return { ok: false, why: 'budget' }; }
        // a drain that fetched nothing inside a back-off (every request refused) changes NOTHING about the back-off
        if (ended.why === 'backoff') return { ok: false, why: 'backoff', results };
        if (ended.cut) e.waiting = ended.waiting;
        else if (ended.timerWork) e.waiting = 0;
        e.failures = 0;
        e.nextAt = 0;
        e.rateStrikes = 0; e.backoffKind = null; e.retryAfterSec = null;
        await store.adapters.update(() => { rec.lastPass = { at: now(), ok: true, code: null }; rec.lastOkAt = rec.lastPass.at; rec.consecutiveFailures = 0; });
        await retractFailure(rec);
        retractUnsaved(rec);   // verify r6: that write landed the whole file — the sign-in is on disk
        notify(changed.filter((k) => !early.has(k)), { full: false });
        return { ok: true, changed, results };
      } catch (err) {
        // something OUTSIDE a vendor call threw (the store, a bug): the pass fails like any failure, and every taken waiter hears it
        if (!failure && aborted(err)) failure = { ok: false, code: stopped ? 'stopped' : 'account-changed', error: 'the refresh was cut short (the engine stopped or the account changed) — refresh again', polledAt: null };
        if (!failure) { try { failure = await failPass(err); } catch { failure = { ok: false, code: 'vendor-error', error: 'the refresh failed (vendor-error)', polledAt: null }; } }
        for (const r of Drain.takenRequests(e.dq)) deliver([r.id], { ...failure, polledAt: lastPollOf(r.key) });
        notify(changed.filter((k) => !early.has(k)), { full: false });
        return { ok: false, why: failure.code, changed, results };
      } finally {
        e.passing = null;
        e.chargeBy = null;
        if (e.dq.pass) e.dq = Drain.close(e.dq);
        // THE SAFETY NET: an outcome this pass recorded is settled by the pass's end at the latest, and a pass that ended without the model's `end` leaves no taken waiter unanswered (a delivered outcome is final — a Promise cannot be re-resolved)
        for (const w of [...e.waiters.values()]) {
          if (w.outcome !== undefined) w.resolve(w.outcome);
          else if (!ended && Drain.takenRequests(e.dq).some((r) => r.id === w.id)) w.resolve(failure ? { ...failure, polledAt: lastPollOf(w.key) } : { ok: false, code: 'failed', error: 'the refresh failed (failed)', polledAt: lastPollOf(w.key) });
        }
        if (e.kickAfter) { e.kickAfter = false; kick(rec, e); }   // the kick that arrived mid-pass runs its own pass
        if (e.drainAfter || Drain.hasRequests(e.dq)) { e.drainAfter = false; pokeDrain(rec, e); }   // requests filed mid-pass, and a group the bound carried (Drain rule 15), are judged by the next drain — never by their caller
      }
    })();
    return e.passing;
  }
  /** The words of a refusal the drain named — its RULE picks the engine's sentence builder (each names its number and the wait). */
  function refusalFor(rec, e, act) {
    switch (act.rule) {
      case 'backoff': return backoffRefusal(rec, e);   // THE BACK-OFF GATE
      case 'share': return agentShareRefusal(rec, e) || budgetRefusal(rec, e);   // THE AGENT SHARE
      case 'floor': return floorRefusal(act.key) || { ok: false, code: 'refresh-floor', error: 'this conversation was refreshed moments ago — read it now, or refresh again in a moment', retryAfterSec: 1, polledAt: lastPollOf(act.key) };   // THE PER-CONVERSATION FLOOR
      case 'cut': return budgetRefusal(rec, e);   // THE CUT: every accepted waiter, by name — never `0 new`
      case 'budget': return budgetRefusal(rec, e);   // THE VENDOR BUDGET
      default: return { ok: false, code: String(act.code || 'failed'), error: `the refresh was refused (${act.code || 'failed'})` };
    }
  }
  /** A settlement the drain named for every waiter at once (Drain rules 2–4). */
  function settlementFor(act, failure, key) {
    if (act.outcome === 'stopped') return { ok: false, code: 'stopped', error: 'the channels engine is stopping — refresh again after the restart' };
    if (act.outcome === 'account-changed') return { ok: false, code: 'account-changed', error: 'the account changed while the refresh waited — refresh again' };
    if (act.outcome === 'not-connected') return { ok: false, code: 'not-connected', error: 'the refresh failed (not-connected)', polledAt: null };
    return failure ? { ...failure, polledAt: lastPollOf(key) } : { ok: false, code: String(act.code || 'failed'), error: `the refresh failed (${act.code || 'failed'})`, polledAt: lastPollOf(key) };
  }
  /** The instant a conversation was last FETCHED (a poll or a scan read). */
  function lastPollOf(key) { const en = store.index.peek(key) || {}; return Number(en.lane && (en.lane.lastPollAt || en.lane.lastScanAt)) || null; }
  /** ONE conversation the vendor refused (it left the chat, the thread is
   *  gone): said on the row, polled again at its own cadence — never the
   *  whole account's failure. */
  async function noteConvRefusal(rec, convId, code, err) {
    await store.index.update(() => {
      const en = store.index.entry(rec.id, convId, { create: false });
      if (!en) return;
      en.lane = { ...(en.lane || {}), lastPollAt: now(), lastError: { code, at: now(), why: String((err && err.message) || err).slice(0, 200) } };
      // lane lark-search-poll: the vendor REFUSED this conversation — its owed marks go (the feed would otherwise make the
      // account due on every tick for a conversation it cannot read); its own cadence polls it again
      if (en.feedOwedAt) delete en.feedOwedAt;
      if (en.threadOwed) delete en.threadOwed;
      if (en.threadReach) delete en.threadReach;
    });
  }

  /**
   * Ingest ONE conversation. THE ORDER IS THE INVARIANT (design §5 invariant
   * 4): records land in the durable append-only log FIRST, the anchor moves in
   * the index SECOND, and the coalesced flush happens LAST — so a crash
   * anywhere costs at most a re-read, which the log's dedup absorbs. The
   * anchor moves ONLY on a pass the adapter called complete. A FIRST ingest
   * (no anchor yet) asks for ONE page (`initialMax` = the history page size):
   * older history comes on demand (`loadOlder`).
   */
  async function ingest(e, rec, convId, origin = 'timer') {
    const key = `${rec.id}/${convId}`;
    const before = store.index.peek(key) || {};
    // THE LANE IS ASKED BEFORE A BYTE IS FETCHED (r3). A scan lane the
    // resolver gives no source for (facts stale, client absent, grant refused,
    // platform undeclared) ingests NOTHING and says why — `complete:false`
    // keeps the anchor where it is, exactly as an incomplete page does. This
    // is the same answer the chip draws, so the two cannot disagree.
    syncContentSince(rec);
    const lane = laneOrScan(rec, before);
    if (lane.via === 'scan' && !lane.source) return { appended: 0, duplicates: 0, anchorMoved: false, complete: false, why: lane.why };
    const pageSize = historyPageSize();
    // THE FIRST WALK of a conversation (never anchored, never completed a walk
    // before): what it finds is the vendor's BACKLOG — read, and never a wake
    // unless stamped after the account was linked. Every later walk's records
    // are news, even on a conversation whose first walk found nothing.
    const firstWalk = !before.anchor && !before.walkedAt;
    // lane lark-search-poll: the instant BEFORE the first page — an owed mark older than it is satisfied by a COMPLETE walk
    const walkStartedAt = now();
    let anchor = before.anchor || null;
    let appended = 0, duplicates = 0, lastAt = before.lastAt || null, complete = true, pages = 0;
    // the newest APPENDED record's text + instant (the group list's last line, §22): tracked apart from
    // `lastAt`, which discovery may already have set from the vendor's listing to that very instant
    let lastText = null, lastTextAt = -Infinity;
    const freshAt = [];
    const freshRecs = [];   // P2: exactly what became durable on this pass — the filter's input
    const hints = new Set();

    for (;;) {
      const opts = { anchor, limit: pageSize };
      if (firstWalk) opts.initialMax = pageSize;
      if (lane.via === 'scan') opts.source = lane.source;   // HANDED DOWN, never re-derived by the adapter
      const r = await vendor(rec, e, () => e.adapter.history(convId, opts));
      // verify r4: the entry ended under this fetch (a remove / disable / disconnect / rebuild, or the engine stopped) —
      // the page is DROPPED, never written: a remove() mid-fetch used to resurrect the removed account's index row + log
      if (outlived(rec, e)) return { appended, duplicates, anchorMoved: false, complete: false, why: 'account-changed' };
      if (Array.isArray(r.changed)) for (const id of r.changed.slice(0, DUE_HINTS_MAX)) if (id && String(id) !== String(convId)) hints.add(String(id));
      // 1. the LOG first — durable before anything claims progress
      const w = store.appendRecords(rec.id, convId, r.records);
      appended += w.appended; duplicates += w.duplicates;
      if (w.appended > 0) olderChanged(e, convId);   // rule 19: a record arrived — the "nothing older" memory is forgotten
      if (Array.isArray(w.freshAt)) freshAt.push(...w.freshAt);
      if (Array.isArray(w.fresh) && w.fresh.length) freshRecs.push(...w.fresh);
      if (Array.isArray(w.fresh) && w.fresh.length) track(persistHeldBodies(rec, e, convId, w.fresh));   // lane channel-rich: a mail's formatted body, bytes already in hand
      if (w.lastAt && (!lastAt || w.lastAt > lastAt)) lastAt = w.lastAt;
      if (w.lastAt && w.lastAt >= lastTextAt && typeof w.lastText === 'string') { lastTextAt = w.lastAt; lastText = previewText(w); }
      anchor = r.anchor || anchor;
      if (r.reachedAnchor && r.complete) break;
      if (++pages >= MAX_PAGES || !r.records.length) { complete = false; break; }
      if (!affordable(rec, e)) { complete = false; break; }
    }
    // The adapter's HINTS: conversations the vendor says changed become due
    // now; one we have never discovered asks for a discovery soon.
    if (hints.size) {
      const liveIx = store.index.live();
      for (const id of hints) { const k = `${rec.id}/${id}`; if (liveIx[k]) e.dueNow.add(k); else e.discoverSoon = true; }
    }

    // THE EXCLUSIVITY MEASUREMENT (§6.4, decision 18) — only while push
    // CARRIES CONTENT, only on a conversation that was already anchored (a
    // first walk is a backlog, not a miss), only for records stamped after the
    // lane began carrying content. A TIMER pass finding a new record is a
    // record push missed; a KICK pass finding one is push doing its job. In
    // kick mode NOTHING is sampled, so the ratio cannot poison itself (r4).
    let judged = 0, missed = 0;
    if (lane.via === 'push' && lane.carryContent && before.anchor && freshAt.length) {
      const since = Number((rec.push && rec.push.contentSince) || 0);
      judged = freshAt.filter((at) => at >= since).length;
      missed = origin === 'kick' ? 0 : judged;
      if (judged) { const p = pushRow(rec); p.samples = caps.pushSamplesAdd(p.samples, { at: now(), n: judged, p: missed }); p.missRate = caps.pushMissRate(p.samples, now()).rate; }
    }

    // 2. the index SECOND, inside ONE serialized update that describes this
    //    batch — and the cursor advances only when the pass was complete.
    let anchorMoved = false, trimNow = false, readAt = 0;
    await store.index.update((ix) => {
      const en = store.index.entry(rec.id, convId);
      if (firstWalk && !(Number(en.readAt) > 0)) en.readAt = Number(rec.linkedAt) || 0;   // a first walk: the backlog before the link is read
      if (complete && anchor && anchor !== en.anchor) { en.anchor = anchor; anchorMoved = true; }
      if (complete && !en.walkedAt) en.walkedAt = now();
      if (judged) { en.lane = en.lane || {}; en.lane.firstSeenTotal = (en.lane.firstSeenTotal || 0) + judged; en.lane.firstSeenByPoll = (en.lane.firstSeenByPoll || 0) + missed; }
      if (lastAt && (!en.lastAt || lastAt > en.lastAt)) en.lastAt = lastAt;
      // the group list's LAST LINE (§22): cached beside `lastAt`, re-derivable from the log
      if (typeof lastText === 'string' && lastTextAt >= (Number(en.lastAt) || 0)) en.lastText = lastTextOf(lastText);
      // DERIVED, never a stored fact (§5 invariant 7): cached for render speed
      // and re-derived from the log on every mark-read. Maintained on APPEND
      // (2026-09-26): re-reading up to 8 000 records per ingest was a pass's
      // largest synchronous cost at 873 conversations.
      if (freshRecs.length) en.unread = (Number(en.unread) || 0) + freshRecs.filter((r) => Number(r.at) > (Number(en.readAt) || 0)).length;
      if (freshRecs.length) en.authors = mergeAuthors(en.authors, freshRecs);
      // R3 (§23): the newest message the OWNER wrote here (`author.isSelf` — a reply from the vendor's own app
      // counts as much as one from our composer): one of the facts the first screen's attention list reads
      if (freshRecs.length) { const sa = selfAtOf(freshRecs); if (sa > (Number(en.selfAt) || 0)) en.selfAt = sa; }
      // The label is the RESOLVED lane — the one that just carried this
      // batch — never `caps.receive` (r3).
      en.lane = { ...en.lane, via: lane.via };
      // This pass FETCHED (a poll or a scan read), whatever lane the resolver
      // names for the row; `lastPushAt` is stamped by the push path alone.
      if (lane.via === 'scan') en.lane.lastScanAt = now(); else en.lane.lastPollAt = now();
      if (en.lane.lastError) delete en.lane.lastError;
      // lane lark-search-poll: a COMPLETE walk that started after the feed saw the message clears its owed mark (in the
      // SAME index update that stamps the walk); an incomplete one, a refusal or a cut leaves it owed
      if (complete) { en.lane.walkStartedAt = walkStartedAt; if (en.feedOwedAt && Feed.owedSatisfied(en.feedOwedAt, walkStartedAt, { skewMs: 0 })) delete en.feedOwedAt; }
      if (appended && (!en.trimmedAt || now() - en.trimmedAt >= TRIM_EVERY_MS)) { en.trimmedAt = now(); trimNow = true; }
      if ('tracked' in en) delete en.tracked;
      readAt = Number(en.readAt) || 0;
    });
    if (judged) await checkDemotion(rec);
    // P2: THE FUNNEL (§6.1) — after the records are durable, the SAME
    // matcher, the SAME wake decision, whatever lane fetched them. A poll or
    // scan pass is already a batch, so its hits are one wake with no window.
    // A FIRST ingest's backlog (records from before the account was linked)
    // is NOT news: it never wakes anybody.
    // lane lark-search-poll (§3.4): a FEED-BORN conversation's first walk reads its news line (`newsSince` — the causing
    // message is news, the older page read; a catch-up birth's backlog wakes nobody); every other row as before
    const newsLine = Math.max(Number(rec.linkedAt) || 0, Number(before.newsSince) || 0);
    const news = firstWalk ? freshRecs.filter((r) => Number(r.at) > newsLine) : freshRecs;
    if (news.length) track(onFresh(rec, convId, news, { lane, origin }));
    // the change feed's COVERAGE MEASUREMENT: what this fetch appended, judged against what the feed saw (§2.8)
    if (freshRecs.length) { try { feedSample(rec, e, freshRecs); } catch (err) { log.warn(`[channels] ${rec.id}: the change feed's measurement failed: ${(err && err.message) || err}`); } }
    // 3. the flush is COALESCED by the store (dirty + debounce + interval +
    //    SIGINT/SIGTERM), never once per change.
    // RETENTION runs where the growth happens — after a pass that actually
    // appended, on the ONE conversation that grew, at most every
    // TRIM_EVERY_MS (it rewrites the log). The bounds and the 7-day floor are
    // the store's.
    if (trimNow) { try { store.trim(rec.id, convId); } catch (err) { console.warn('[channels] trim failed:', err && err.message); } }
    return { appended, duplicates, anchorMoved, complete, judged, missed, readAt };
  }
  /** The newest instant among records the OWNER wrote (`author.isSelf`), 0 when none (R3 §23). */
  function selfAtOf(recs) {
    let t = 0;
    for (const r of recs || []) if (r && r.author && r.author.isSelf && Number(r.at) > t) t = Number(r.at);
    return t;
  }
  /** The distinct authors seen in a conversation, newest first, bounded —
   *  the facts a pattern's `participant` / `from-address` rules match. */
  function mergeAuthors(prev, recs) {
    const out = [];
    const seen = new Set();
    const add = (a) => { if (!a) return; const id = String(a.id || ''); const name = peerName(String(a.name || ''), 200) || ''; const k = id || name; if (!k || seen.has(k)) return; seen.add(k); out.push({ id, name }); };
    for (const r of [...recs].sort((x, y) => (Number(y.at) || 0) - (Number(x.at) || 0))) add(r.author);
    for (const a of Array.isArray(prev) ? prev : []) add(a);
    return out.slice(0, AUTHORS_MAX);
  }

  // ── the panel's digest + the ONE broadcast ───────────────────────────────
  /**
   * What `GET /api/channels` serves and what every `channels-updated` carries:
   * adapters, conversations, their RESOLVED convCaps and their freshness
   * claim. NEVER message bodies (§10.2).
   *
   * AND NEVER A HUMAN SENTENCE (r2). `freshnessClaim` / `identityWarning`
   * return STRUCTURE and the client composes the words, because this payload
   * is broadcast to every client at once while the language is per DEVICE —
   * so a sentence built here is English for everybody by construction.
   */
  function digest({ keys = null } = {}) {
    const t = now();
    const recs = adapterRecords();
    const liveIx = store.index.live();
    const adapters = recs.adapters.map((rec) => adapterView(rec, t));
    // The kinds a user may still CONNECT (one record per kind in v1), each
    // with the credential facts the wizard's three copy paths need.
    const have = new Set(recs.adapters.map((r) => r.kind));
    const available = REAL_ADAPTERS.filter((m) => !have.has(m.kind)).map((m) => ({ kind: m.kind, label: m.label || m.kind, integration: m.integration || null, credential: credentialFacts(m.integration), credentials: offeredCredentials(m.integration), credentialDefault: defaultCredentialKey(m.integration), receive: m.caps.receive, sendAs: m.caps.sendAs }));
    const byId = new Map(recs.adapters.map((r) => [r.id, r]));
    const ctx = viewCtx(t);
    const list = keys ? keys.map((k) => liveIx[k]).filter(Boolean) : Object.values(liveIx);
    const conversations = list.map((en) => { const rec = byId.get(en.adapterId); return rec ? rowView(rec, en, ctx) : null; }).filter(Boolean);
    conversations.sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
    // THE TOTALS are over EVERY conversation, partial or not (the rail badge
    // reads them off each broadcast) — KEPT, not re-summed (B-f32b): a partial
    // broadcast re-reads the rows touched since the last one, a full one re-sums
    const unreadTotal = unreadTotalOf(liveIx, byId, !keys);
    let awaitingTotal = 0;
    for (const n of ctx.outbox.values()) awaitingTotal += n.awaiting;
    // r4: EVERY connectable type (N accounts per type) with what the
    // type-first account dialog needs — `available` above keeps its P1a shape
    // for the pre-r4 panel.
    const kinds = REAL_ADAPTERS.map((m) => kindView(m));
    return {
      adapters, available, kinds, conversations,
      partial: !!keys,
      unreadTotal, awaitingTotal,
      // r3: a store file set aside (or BLOCKED) at boot, on the FIRST SCREEN —
      // the For-you item alone left a real instance's vanished accounts
      // unexplained in the panel
      quarantined: (store.quarantined || []).map(({ file, to, why, at, blocked }) => ({ file, to: to || null, why, at, blocked: !!blocked })),
      at: t,
    };
  }
  /** THE KEPT ROW FACTS (B-f32b, lane channel-index-copy): every partial broadcast (a window's watch, its mark-read)
   *  summed `unread` over all 50 274 rows of userW's index, and each account's census walked them all again. A row's
   *  facts that the clock does not move — listed / unlisted, unread, paused, overridden, being read, walked — are kept
   *  per account: the store says which rows an update touched (`index.onTouch`: a key, or null = the whole map) and
   *  only those are re-read. A whole-map touch, a full digest or a minute without one re-sums every row — the same
   *  numbers as the old loops (test-channels-index-scale ⑥, test-channels-census-pace). */
  const FACTS = ['conversations', 'unread', 'unlisted', 'paused', 'overridden', 'reading', 'walked'];
  const rowKept = { stale: null, rows: new Map(), by: new Map(), at: 0 };   // stale null = re-sum
  store.index.onTouch((k) => { if (k === null) rowKept.stale = null; else if (rowKept.stale) rowKept.stale.add(k); });
  function rowFacts(en) {
    if (!en) return null;
    if (en.unlistedAt) return { a: en.adapterId, unlisted: 1 };
    // the census's own reading of the cadence's override (caps.cadenceFor: 'paused' / a valid refresh = source override)
    const ov = en.refresh && typeof en.refresh === 'object' ? en.refresh.every : null;
    const paused = ov === 'paused';
    const reading = !paused && !(en.lane && en.lane.lastError);
    return { a: en.adapterId, conversations: 1, unread: Number(en.unread) || 0, paused: paused ? 1 : 0, overridden: paused || caps.validRefresh(ov) ? 1 : 0, reading: reading ? 1 : 0, walked: reading && en.walkedAt ? 1 : 0 };
  }
  function addFacts(f, sign) {
    if (!f) return;
    let tot = rowKept.by.get(f.a);
    if (!tot) { tot = Object.fromEntries(FACTS.map((k) => [k, 0])); rowKept.by.set(f.a, tot); }
    for (const k of FACTS) if (f[k]) tot[k] += sign * f[k];
  }
  /** Each account's kept facts (`Map<adapterId, {conversations, unread, …}>`), brought up to date. */
  function rowFactsNow(resum = false) {
    const liveIx = store.index.live(), t = now();
    if (resum || !rowKept.stale || !(t - rowKept.at < ROW_RESUM_MS)) {
      rowKept.rows = new Map(); rowKept.by = new Map(); rowKept.at = t;
      for (const k of Object.keys(liveIx)) { const f = rowFacts(liveIx[k]); if (f) { rowKept.rows.set(k, f); addFacts(f, 1); } }
    } else {
      for (const k of rowKept.stale) {
        const was = rowKept.rows.get(k), f = rowFacts(liveIx[k]);
        if (was) addFacts(was, -1);
        if (f) { rowKept.rows.set(k, f); addFacts(f, 1); } else rowKept.rows.delete(k);
      }
    }
    rowKept.stale = new Set();
    return rowKept.by;
  }
  /** THE TOTALS' unread: the kept facts of every listed row of an account that exists (the old loop's rule). */
  function unreadTotalOf(liveIx, byId, resum = false) {
    const by = rowFactsNow(resum);
    let total = 0;
    for (const id of byId.keys()) { const f = by.get(id); if (f) total += f.unread; }
    return total;
  }
  /** Per-digest precomputation: the outbox counts by conversation (ONE walk
   *  over the proposals, never a clone per row) and the tiers. */
  function viewCtx(t = now()) {
    const outbox = new Map();
    for (const p of Object.values(store.outbox.live().proposals || {})) {
      if (!p || !p.key) continue;
      const c = outbox.get(p.key) || { awaiting: 0, unknown: 0, latestAt: null, ownSentAt: 0 };
      if (p.state === 'awaiting-approval') c.awaiting++;
      if (p.state === 'unknown') c.unknown++;
      // R3 (§23): the owner's OWN message that went out from here (a reply the vendor has not echoed back yet)
      if (p.state === 'sent' && p.draftedBy && p.draftedBy.kind === 'user') { const sa = Number((p.result && p.result.at) || p.updatedAt || p.at) || 0; if (sa > c.ownSentAt) c.ownSentAt = sa; }
      const at = p.updatedAt || p.at || null;
      if (at && (!c.latestAt || at > c.latestAt)) c.latestAt = at;
      outbox.set(p.key, c);
    }
    return { t, T: tiers(), outbox };
  }
  /**
   * THE LIST ROW (2026-09-26, slimmed): what the panel's list, the first
   * screen and the row menu read — never message bodies, never the reach
   * rows or the filter (the dialogs fetch the FULL view:
   * `GET /api/channels/:a/:c`). At 873 conversations the old row (~1.2 KB)
   * made every broadcast ~1 MB.
   */
  /** THE TITLE A PERSON READS (§25): a mail thread's subject without the
   *  ticket banner, the `======` rules or a `Re: RE: Fwd:` chain — gated on the
   *  adapter's DECLARED `titleForm`, never its id; the index keeps the vendor's
   *  own string (a filter matches that). */
  /**
   * A CAPABILITY DERIVED FROM A CREDENTIAL IS RE-JUDGED WHEN THE CREDENTIAL
   * CHANGES (inc-muk9jj0j-rel3, 2026-09-27 — the owner: "已经重新授权过 但还是有个
   * 邮件提示没有发送权限"). `convCaps` is cached PER CONVERSATION with its `at`,
   * and a re-authorization used to invalidate none of them: only the threads
   * the next pass happened to visit got a fresh verdict, every other thread of
   * the account kept "sending needs the send permission" indefinitely.
   * `credentialChangedAt(rec)` = the last instant the account's SCOPES changed
   * (`auth.scopesAt`, stamped by the token door) or a consent landed
   * (`lastAuthAt`) — never `auth.updatedAt`, which every hourly refresh moves.
   */
  function credentialChangedAt(rec) { return caps.credentialChangedAt(rec); }   // ONE spelling (channel-caps) — feedState reads it too
  /** A conversation's convCaps AS OF THE ACCOUNT'S CURRENT CREDENTIAL: a verdict
   *  judged after the last change is itself; an older one is RE-JUDGED — its send
   *  half recomputed from the held scopes when the adapter declares the PURE rule
   *  (`sendCapsOf`, no vendor request) and its read half was verified, else marked
   *  STALE (`at: 0` ⇒ `convCapsState` says `stale`, the window's open re-asks the
   *  vendor, the next pass recomputes). Every reader of `en.convCaps` goes through
   *  here (the views AND the send decisions), so a verdict cannot be fresh on one
   *  surface and stale on another. */
  function effectiveConvCaps(rec, en) {
    const cc = en && en.convCaps;
    if (!cc || !rec) return cc || null;
    const changed = credentialChangedAt(rec);
    if (!changed || (Number(cc.at) || 0) >= changed) return cc;
    let mod = null;
    try { mod = registry.get(rec.kind); } catch { mod = null; }
    const judge = mod && (typeof mod.capsOfScopes === 'function' ? mod.capsOfScopes : typeof mod.sendCapsOf === 'function' ? mod.sendCapsOf : null);
    if (judge && cc.read === 'yes') {
      let v = null;
      try { v = judge(((rec.auth && rec.auth.scopes) || []).map(String)); } catch { v = null; }
      if (v && Array.isArray(v.sendAs)) {
        const out = { read: 'yes', sendAs: v.sendAs.slice(), why: v.why || null, at: changed, rejudged: 'scopes' };
        // lane channel-threads (spec §2.5): replying into a thread follows sending — except what the CONVERSATION
        // refused (a group without topic replies, not a member) — and reactions follow the held scopes
        if (cc.threads) {
          const kept = cc.threads.why === 'topic-forbidden' || cc.threads.why === 'not-a-member';
          out.threads = { replyInto: !kept && v.sendAs.length > 0, mode: cc.threads.mode || null, why: kept ? cc.threads.why : (v.sendAs.length ? null : v.why || null) };
        }
        if (v.reactions) out.reactions = { read: !!v.reactions.read, add: !!v.reactions.add, why: v.reactions.why || null };
        else if (cc.reactions) out.reactions = cc.reactions;
        return out;
      }
    }
    return { ...cc, at: 0, rejudged: 'stale' };
  }
  /** THE WRITE-TIME HALF: every conversation of the account whose verdict predates
   *  the credential change is re-judged and PERSISTED in one index write (the
   *  caller then broadcasts ONE whole digest). Answers how many were touched. */
  async function rejudgeConvCaps(rec, why = 'credential changed') {
    if (!rec) return 0;
    let n = 0;
    try {
      await store.index.update(() => {
        for (const en of Object.values(store.index.live())) {
          if (!en || en.adapterId !== rec.id || !en.convCaps) continue;
          const next = effectiveConvCaps(rec, en);
          if (next !== en.convCaps) { en.convCaps = next; n++; }
        }
      });
    } catch (err) { log.warn(`[channels] ${rec.id}: re-judging the conversations after "${why}" failed: ${(err && err.message) || err} — each is re-judged as it is read`); return 0; }
    if (n) log.log(`[channels] ${rec.id}: ${why} — ${n} conversation(s) re-judged against the new credential`);
    return n;
  }
  /** §25: the agent-facing record — `text` is the agent's string; the render tree never reaches an agent.
   *  Lane channel-rich: nor does a message's formatted BODY (a mail's text/html part, `role: 'body'`) —
   *  agents never receive HTML. */
  function withoutBlocks(r) {
    if (!r) return r;
    let out = r;
    if (out.blocks) { const { blocks, ...rest } = out; out = rest; }
    if (Array.isArray(out.attachments) && out.attachments.some((a) => a && a.role === 'body')) out = { ...out, attachments: out.attachments.filter((a) => !(a && a.role === 'body')) };
    return out;
  }
  /** THE READ-TIME VIEW (lane channel-rich, D1 + D3): the module's declared `recordView(record)` — a bot a
   *  record stored before D3 calls "app" gets its name, a text stored before D1 with markup in it is read by
   *  the markup reader. ONE hook every read passes (the window's page, an agent's read, both searches); the
   *  store is never rewritten. A view that throws leaves the record as stored. */
  function viewOf(rec, r) {
    let mod = null;
    try { mod = rec ? registry.get(rec.kind) : null; } catch { mod = null; }
    const fn = mod && typeof mod.recordView === 'function' ? mod.recordView : null;
    if (!r) return r;
    let out = r;
    if (fn) { try { out = fn(r) || r; } catch { out = r; } }
    return withAuthor(rec, out);
  }
  /**
   * WHO IS THIS, at the ONE view door (lane lark-threads B2–B5, 2026-10-01): the author as the owner reads it —
   * `display` = the owner's own name for the author (the VibeSpace 备注, `aliases.json`) › the vendor's way (the
   * organization's nickname, else the name, then `(department)` / `(job title)` per `channels.larkNameField`) › the id;
   * the vendor `name` kept (the title, the search key, what a filter matches); `external` when the sender's organization
   * is not the account's; a bot never "app" (the module's own view ran first; a nameless bot is "Bot <last 4>").
   */
  function withAuthor(rec, r) {
    if (!r || !r.author || typeof r.author !== 'object' || !rec) return r;
    let a = r.author;
    if (a.isBot && (!a.name || a.name === 'app')) a = { ...a, name: `Bot ${String(a.id || '').replace(/[^A-Za-z0-9]/g, '').slice(-4)}`.trim() };
    const alias = aliasOf(rec.id, a.id);
    let tenantSelf = null;
    try { const e = live.get(rec.id); tenantSelf = e && e.adapter && typeof e.adapter.selfTenant === 'function' ? e.adapter.selfTenant() : null; } catch { tenantSelf = null; }
    const v = Authors.authorView(a, { alias, field: larkNameField(), selfTenant: tenantSelf, tenant: r.raw && r.raw.tenant_key });
    return { ...r, author: v };
  }
  /**
   * THE OWNER'S NAME FOR AN AUTHOR (lane lark-threads B3 — the VibeSpace 备注: Lark's own per-viewer remark is readable by
   * no API, so the owner writes it here once). Owner-only (the route refuses an agent bearer); `alias` through the name
   * door (`Authors.cleanAlias`), '' clears it; ≤ ALIASES_MAX per account (the oldest dropped). ONE `channels-updated` with
   * the result (`authors`) — every window re-spells that author's heads in place, every other client too.
   */
  const ALIASES_MAX = 5000;
  async function setAlias(adapterId, authorId, alias, { by = 'user' } = {}) {
    const rec = adapterRecords().adapters.find((r) => r.id === adapterId);
    if (!rec) return { ok: false, code: 'not-found', error: 'No such account' };
    const id = String(authorId == null ? '' : authorId);
    if (!id || id.length > 256 || /[\u0000-\u001f\u007f]/.test(id)) return { ok: false, code: 'bad-request', error: 'an author id is required (≤ 256 characters)' };
    if (alias !== null && alias !== undefined && typeof alias !== 'string') return { ok: false, code: 'bad-request', error: 'alias is a string (empty clears it)' };
    const clean = Authors.cleanAlias(alias);
    await store.aliases.update((t) => {
      if (!t.aliases || typeof t.aliases !== 'object') t.aliases = {};
      const m = t.aliases[adapterId] && typeof t.aliases[adapterId] === 'object' ? t.aliases[adapterId] : (t.aliases[adapterId] = {});
      if (clean) { delete m[id]; m[id] = { alias: clean, at: now() }; } else delete m[id];
      const ks = Object.keys(m);
      if (ks.length > ALIASES_MAX) for (const k of ks.sort((a, b) => (Number(m[a].at) || 0) - (Number(m[b].at) || 0)).slice(0, ks.length - ALIASES_MAX)) delete m[k];
    });
    // the thread index holds viewed records (a quote's author, a pane's participants) — re-derived on the next read
    for (const k of [...thIx.keys()]) if (k.startsWith(`${adapterId}/`)) thIx.delete(k);
    audit({ at: now(), kind: 'author-alias', adapterId, author: id.slice(0, 256), set: !!clean, by });
    notify([], { full: false, extra: { authors: { [adapterId]: { [id]: { alias: clean || null } } } } });
    return { ok: true, adapterId, authorId: id, alias: clean || null };
  }
  /** The owner's names for one account's authors (`{[authorId]: alias}`) — the panel / window prefill. */
  function aliasesOf(adapterId) {
    let t = null;
    try { t = store.aliases.live().aliases; } catch { t = null; }
    const m = t && t[adapterId] && typeof t[adapterId] === 'object' ? t[adapterId] : {};
    return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v && v.alias ? String(v.alias) : '']).filter(([, v]) => v));
  }
  /** The owner's name for an author (B3) — '' when none. */
  function aliasOf(adapterId, authorId) {
    if (!authorId) return '';
    let t = null;
    try { t = store.aliases.live().aliases; } catch { t = null; }
    const row = t && t[adapterId] && t[adapterId][String(authorId)];
    return row && typeof row.alias === 'string' ? row.alias : '';
  }
  /** `channels.larkNameField` (B5): none | department | jobTitle (default department). */
  function larkNameField() {
    let v = null;
    try { v = serverSetting('channels.larkNameField'); } catch { v = null; }
    return Authors.NAME_FIELDS.includes(v) ? v : 'department';
  }
  const viewsOf = (rec, records) => (Array.isArray(records) ? records.map((r) => viewOf(rec, r)) : records);
  /** A search hit's record keeps its tree but never its formatted body (the owner's search lists words). */
  const withoutBody = (r) => (r && Array.isArray(r.attachments) && r.attachments.some((a) => a && a.role === 'body') ? { ...r, attachments: r.attachments.filter((a) => !(a && a.role === 'body')) } : r);
  // verify r3 (lane lark-search-poll): THE AGENT'S COPY IS JUDGED ON THE WAY OUT — the frame check learned to look through
  // invisible / bidi / control characters, and a record the append-only log stored before that keeps a split tag as it was
  // written; the agent's read, thread read and search re-run the ONE rule over what they hand over (idempotent on a record
  // stored after it): the text through `inertFrames`, every name through the name door
  function agentCopy(r) {
    const x = withoutBlocks(r);
    if (!x || typeof x !== 'object') return x;
    const out = { ...x, text: agentText(x.text, { kind: 'block' }) };   // lane peer-census: bound → folded → the frame rule per line (a legacy record re-judged on its way out)
    for (const k of ['id', 'vendorId', 'convId', 'replyTo', 'threadKey', 'root']) if (typeof x[k] === 'string') out[k] = agentId(x[k]);   // verify r3 F6: every id as a line piece
    if (x.author && typeof x.author === 'object') out.author = { ...x.author, id: agentId(x.author.id, 256), name: peerName(x.author.name, 200) || '' };
    // lane lark-threads (B3/B5): the agent reads an author by the head the owner sees — `name` = the read-time `display`
    // (the owner's own name › Lark's way), the vendor's own name kept as `vendorName`; every name-shaped field through the
    // name door (the CLI prints `name`, unchanged — no new print)
    if (out.author) {
      for (const k of ['display', 'vendorDisplay', 'alias']) if (typeof x.author[k] === 'string') out.author[k] = peerName(x.author[k], 200) || '';
      if (x.author.alt && typeof x.author.alt === 'object') out.author.alt = Object.fromEntries(Object.entries(x.author.alt).filter(([, v]) => typeof v === 'string').map(([k, v]) => [k, peerName(v, 200) || '']));
      // an unnamed author keeps its id print (the display there IS the id, and the id's door is agentId's line rule)
      if (out.author.display && out.author.display !== out.author.name && (out.author.name || out.author.alias)) { out.author.vendorName = out.author.name; out.author.name = out.author.display; }
    }
    if (Array.isArray(x.mentions)) out.mentions = x.mentions.map((m) => (m && typeof m === 'object' ? { ...m, id: agentId(m.id, 256), name: peerName(m.name, 200) || '' } : m));
    // verify r2 F6 (lane peer-census): an attachment's MIME and ID are the sender's too (a mail part's Content-Type /
    // Content-ID) and the CLI prints them on the name's line (`attachment: <name|id> (<mime>), N bytes`) before the next
    // record's `> …`; the store keeps them under the complete-tag rule (an id must fetch), the agent's copy takes the line rule
    if (Array.isArray(x.attachments)) out.attachments = x.attachments.map((a) => (a && typeof a === 'object' ? { ...a, name: peerName(a.name, 256) || '', id: agentText(a.id, { kind: 'line', max: 256 }), mime: agentText(a.mime, { kind: 'line', max: 128 }) } : a));
    return out;
  }
  function titleOf(c, title) {
    if (!c || c.titleForm !== 'subject') return title;
    return Blocks.cleanSubject(title) || title;
  }
  /** A record as the window reads it (§25): its own render tree, else — for a
   *  record stored before its adapter wrote one — the module's `blocksOf` rung
   *  (declared by `caps.render: 'blocks'`); an adapter that declares nothing is
   *  drawn by the client's generic rung from `text`. A rung that throws or
   *  answers an invalid tree leaves the record as it is.
   *
   *  A STORED TREE IS JUDGED AT READ TIME TOO (verify round, 2026-09-27): the
   *  log is append-only and its writer is not always `makeRecord` — a tree that
   *  fails the schema (an unknown kind, a live frame, a `javascript:` href) used
   *  to be served to every client as stored, the renderer the only wall. Now
   *  the read validates it and a refused tree is DROPPED (the record keeps its
   *  `text`, the generic rung draws it); a valid one is served CLEANED. */
  function withBlocks(rec, records) {
    let mod = null;
    try { mod = rec ? registry.get(rec.kind) : null; } catch { mod = null; }
    const rung = mod && mod.caps && mod.caps.render === 'blocks' && typeof mod.blocksOf === 'function' ? mod.blocksOf : null;
    return viewsOf(rec, records).map((r) => {
      if (!r) return r;
      let b = null;
      if (r.blocks !== undefined) {
        try { const v = Blocks.validateBlocks(r.blocks); b = v.ok && v.blocks.length ? v.blocks : null; } catch { b = null; }
        if (!b) { const { blocks, ...rest } = r; return rest; }
        return { ...r, blocks: b };
      }
      if (!rung) return r;
      try { const v = Blocks.validateBlocks(rung(r)); b = v.ok && v.blocks.length ? v.blocks : null; } catch { b = null; }
      return b ? { ...r, blocks: b } : r;
    });
  }
  /** What unlocks SENDING on this account (§25, the window's read-only line):
   *  the module's declared `sendGrant` against the scopes the account HOLDS. */
  function sendGrantView(rec) {
    let mod = null;
    try { mod = registry.get(rec.kind); } catch { mod = null; }
    const g = mod && mod.sendGrant;
    if (!g) return null;
    const held = new Set(((rec.auth && rec.auth.scopes) || []).map(String));
    return { scopes: g.scopes.slice(), missing: g.scopes.filter((x) => !held.has(x)), console: !!g.console };
  }
  /** lane lark-search-poll (§3.3 ③): a single chat with no title yet is named by its OTHER author (no vendor call) —
   *  else null, which the client words "Single chat" (never the raw id). */
  function dmTitleOf(rec, en) {
    if (!en || en.kind !== 'dm') return null;
    let self = null;
    try { const x = live.get(rec.id); self = x && x.adapter && typeof x.adapter.selfId === 'function' ? x.adapter.selfId() : null; } catch { self = null; }
    const a = (Array.isArray(en.authors) ? en.authors : []).find((x) => x && x.name && (!self || x.id !== self));
    return a ? peerName(String(a.name), 200) : null;
  }
  /** B-c127 THE NAME LADDER (src/channel-ref.js) — what a HUMAN reads for a conversation: ① its own name (a chat's
   *  title, a mail's cleaned subject) → ② a single chat's other party, the description / participants the vendor
   *  listed, the authors seen in it → null, the caller's ③ (the id, only when nothing else is known). */
  function humanNameOf(rec, en) {
    if (!rec || !en) return null;
    let self = null;
    try { const x = live.get(rec.id); self = x && x.adapter && typeof x.adapter.selfId === 'function' ? x.adapter.selfId() : null; } catch { self = null; }
    // verify r1 (F1/F5): a title that IS the conversation's id (an adapter's own fallback — lark `name || chat_id`, gmail
    // `… || id`) or shows nothing (only invisible characters the name door keeps) names nothing — the next rung goes on
    const said = (s) => (s && s !== en.id && s !== en.vendorId && CR.nameOf([s], '') ? s : null);
    return said(titleOf(registry.capsOf(rec.kind), en.title)) || said(dmTitleOf(rec, en)) || CR.describeOf(en, { selfId: self }) || null;
  }
  /** B-5fe1: the ACCOUNTS as an account badge reads them (id, kind, label, builtin) — every surface that draws a badge
   *  gets the WHOLE list, because a badge's hue is a function of it (two accounts of one vendor never share a hue). */
  function accountsBrief() {
    return adapterRecords().adapters.map((r) => ({ id: r.id, kind: r.kind, label: r.label || r.id, builtin: !!r.builtin }));
  }
  /** The same by key, for a caller holding ids only (the touches store, a proposal's view) — null when unknown. */
  function conversationName(adapterId, convId) {
    if (!adapterId || !convId) return null;
    const rec = adapterRecords().adapters.find((r) => r.id === adapterId) || null;
    const en = store.index.live()[`${adapterId}/${convId}`];   // verify r1 F3: the LIVE map, read-only — a whole-index clone per call was ~15 ms at 1 119 rows, twice per proposal per Outbox broadcast
    return rec && en ? humanNameOf(rec, en) : null;
  }
  function rowView(rec, en, ctx = viewCtx()) {
    const t = ctx.t;
    const c = registry.capsOf(rec.kind);
    const lane = laneOrScan(rec, en);
    const cadence = caps.cadenceFor(c, lane, en, t, { tiers: ctx.T, watched: isWatched(en.key, t) });
    const eff = effectiveFor(en);
    const ob = ctx.outbox.get(en.key) || { awaiting: 0, unknown: 0 };
    const lw = en.stats && Array.isArray(en.stats.wakes) && en.stats.wakes.length ? en.stats.wakes[en.stats.wakes.length - 1] : null;
    return {
      key: en.key, id: en.id, adapterId: en.adapterId, adapterLabel: rec.label || rec.id, title: humanNameOf(rec, en), kind: en.kind,   // B-c127: THE NAME LADDER (null = nothing known; the client's ③)
      participants: en.participants, lastAt: en.lastAt, lastText: en.lastText || '', unread: en.unread || 0,
      unlisted: !!en.unlistedAt,
      refresh: en.refresh && typeof en.refresh === 'object' ? { every: en.refresh.every, by: en.refresh.by || null } : null,
      cadence: { seconds: cadence.seconds, tier: cadence.tier, source: cadence.source, paused: !!cadence.paused },
      freshness: caps.freshnessClaim(c, lane, en, t, { enabled: rec.enabled !== false, cadence }),
      offers: {
        sendAsUser: caps.offers(c, effectiveConvCaps(rec, en), 'send-as-user', t),
        sendAsBot: caps.offers(c, effectiveConvCaps(rec, en), 'send-as-bot', t),
      },
      assignment: eff ? effectiveView(rec, en, eff, t) : null,
      // R4: WHO HAS ACCESS and WHO IS WOKEN, each principal once (its finest grain)
      access: eff ? eff.access.map((x) => ({ principal: { kind: x.row.principal.kind, id: x.row.principal.id, name: x.row.principal.name || null }, authority: F.effectiveAuthority(x.row, authorityCapsFor(rec, en, t)).authority, source: x.source })) : [],
      watchers: eff ? eff.watchers.map((x) => ({ principal: { kind: x.watcher.principal.kind, id: x.watcher.principal.id, name: x.watcher.principal.name || null }, notify: x.watcher.notify, mode: x.watcher.mode, digestMinutes: x.watcher.digestMinutes, source: x.source })) : [],
      held: !!(lw && lw.ok === false),
      outbox: { awaiting: ob.awaiting, unknown: ob.unknown },
      // R3 (§23, the owner 2026-09-26: "开头不要把所有消息都放进来 … 只放重要消息/conversation"): the FACTS the
      // first screen's attention list is decided from (PURE src/lib/channel-focus.js) — present only on a row
      // something touched, so the 800 untouched rows of an aggregated account stay the slim row
      touch: touchView(en, lw, ob),
      lane: { via: lane.via, why: lane.why || null, source: lane.source || null },
      lastError: en.lane && en.lane.lastError ? { code: en.lane.lastError.code, at: en.lane.lastError.at } : null,
    };
  }
  /** WHAT TOUCHED THIS CONVERSATION (R3 §23) — structure, never words: the
   *  newest AGENT read (`agentReads`, stamped by the agent route's `readFor`),
   *  the last wake (whom, how, delivered or held), the pending hits, the last
   *  refusal, the owner's own newest message (a record `isSelf` or a sent
   *  proposal of the owner's). `null` when nothing did.
   *
   *  THE R3 × R4 SEAM (2.369.191): R4 tags every pending hit with the watcher
   *  it waits for (`for`, `pendingElidedBy`), and a DIGEST watcher's hits wait
   *  here by design until its window closes. `pendingFor` = `[{p, n, oldest}]`
   *  per principal key (`p: null` = a legacy untagged hit) — PURE
   *  src/lib/channel-focus.js `heldPending` reads it with the row's `watchers`
   *  so an open digest window is never drawn as "held". `pending` stays the
   *  total (every tagged elision counted). */
  function touchView(en, lw, ob) {
    const reads = Array.isArray(en.agentReads) ? en.agentReads : [];
    let read = null;
    for (const r of reads) if (r && Number(r.at) > 0 && (!read || Number(r.at) > read.at)) read = { id: r.id || null, name: r.name || null, at: Number(r.at), upTo: Number(r.upTo) || 0 };
    const wake = lw ? { at: Number(lw.at) || 0, ok: lw.ok !== false, lane: lw.lane || null, n: Number(lw.n) || 0, name: lw.name || null } : null;
    const list = Array.isArray(en.pending) ? en.pending : [];
    const per = new Map();
    const slot = (p) => { let x = per.get(p); if (!x) { x = { p, n: 0, oldest: 0 }; per.set(p, x); } return x; };
    for (const h of list) { if (!h) continue; const x = slot(h.for || null); x.n += 1; const a = Number(h.at) || 0; if (a > 0 && (!x.oldest || a < x.oldest)) x.oldest = a; }
    for (const [p, v] of Object.entries(en.pendingElidedBy && typeof en.pendingElidedBy === 'object' ? en.pendingElidedBy : {})) if (Number(v) > 0) slot(p).n += Number(v);
    if (Number(en.pendingElided) > 0) slot(null).n += Number(en.pendingElided);
    const pendingFor = [...per.values()];
    const pending = pendingFor.reduce((n, x) => n + x.n, 0);
    const refusalAt = en.stats && en.stats.lastRefusal ? (Number(en.stats.lastRefusal.at) || 0) : 0;
    const selfAt = Math.max(Number(en.selfAt) || 0, Number(ob && ob.ownSentAt) || 0);
    if (!read && !wake && !pending && !refusalAt && !selfAt) return null;
    return { read, wake, pending, pendingFor, refusalAt, selfAt };
  }
  /** THE COMPATIBILITY SUMMARY a row reads (`assignment`): the first
   *  WATCHER in effect (else the first access row) — which grain it came from
   *  (`source`), the pattern's summary, the authority of THAT principal's
   *  access row clamped by THIS conversation's two caps (§7.3). The whole
   *  answer is `access` + `watchers` beside it. */
  function effectiveView(rec, en, eff, t = now()) {
    const lead = eff.watchers[0] || null;
    const leadPk = lead ? pkOf(lead.watcher.principal) : null;
    const acc = (leadPk ? eff.access.find((x) => pkOf(x.row.principal) === leadPk) : null) || eff.access[0] || null;
    const p = lead ? lead.watcher.principal : acc.row.principal;
    const cl = F.effectiveAuthority(acc ? acc.row : null, authorityCapsFor(rec, en, t));
    const src = lead || acc;
    const w = lead ? lead.watcher : null;
    return {
      principal: { kind: p.kind, id: p.id, name: p.name || null },
      mode: w ? w.mode : null, notify: w ? w.notify : null, digestMinutes: w ? w.digestMinutes : null, dailyWakeCap: w ? w.dailyWakeCap : null,
      authority: cl.authority, authorityStored: acc ? acc.row.authority : 'draft', authorityClamped: cl.clamped, authorityWhy: cl.why || null, authorityWhyCap: cl.whyCap || null,
      source: src.source, patternId: src.patternId || null,
      patternLabel: src.source === 'pattern' ? F.patternSummary((patternById(src.patternId) || {}).pattern || { rules: [] }) : null,
      hits7d: w ? F.countSince((w.stats || {}).hits, t, 7) : 0,
    };
  }
  /** THE FULL VIEW of ONE conversation (the window's bar, the editors, the
   *  reach dialog): the row + everything the old digest row carried. */
  function conversationView(adapterId, convId) {
    const t = now();
    const rec = adapterRecords().adapters.find((r) => r.id === adapterId);
    const en = store.index.peek(`${adapterId}/${convId}`);
    if (!rec || !en) return null;
    const c = registry.capsOf(rec.kind);
    const lane = laneOrScan(rec, en);
    const ctx = viewCtx(t);
    const row = rowView(rec, en, ctx);
    const acct = accountGrainOf(adapterId);
    const pats = patternsOf(adapterId).filter((pa) => F.matchConversation(pa.pattern, convFacts(en)).hit);
    const capsNow = authorityCapsFor(rec, en, t);
    const own = convGrainOf(en);
    return {
      ...row,
      // inc-muk9jj0j-rel3: STALE-ON-READ — a verdict older than the account's credential is re-judged on the way out
      convCaps: caps.convCapsState(effectiveConvCaps(rec, en), t),
      offers: {
        read: caps.offers(c, effectiveConvCaps(rec, en), 'read', t),
        sendAsUser: caps.offers(c, effectiveConvCaps(rec, en), 'send-as-user', t),
        sendAsBot: caps.offers(c, effectiveConvCaps(rec, en), 'send-as-bot', t),
        fetchAttachment: caps.offers(c, effectiveConvCaps(rec, en), 'fetch-attachment', t),
        // lane channel-threads (spec §9): the four thread / reaction controls — each exists only where offered
        threadReply: caps.offers(c, effectiveConvCaps(rec, en), 'thread-reply', t),
        react: caps.offers(c, effectiveConvCaps(rec, en), 'react', t),
        unreact: caps.offers(c, effectiveConvCaps(rec, en), 'unreact', t),
        readReactions: caps.offers(c, effectiveConvCaps(rec, en), 'read-reactions', t),
      },
      // the conversation's thread shape (a topic group opens a thread per message) + the adapter's rows as the window draws them
      // + the PLACEMENTS the channel declares (PURE `placementsOf` — the engine's own verdict reads the same list): the
      //   window's message bar offers Quote / Reply in thread only where they are declared (lane reaction-hover)
      threads: { mode: ((effectiveConvCaps(rec, en) || {}).threads || {}).mode || null, read: threadsRow(c).read, listing: threadsRow(c).listing, placements: P.placementsOf(c) },
      reactionCaps: { read: reactionsRow(c).read, add: reactionsRow(c).add, remove: reactionsRow(c).remove, custom: reactionsRow(c).custom, perMessageMax: reactionsRow(c).perMessageMax },
      attachments: c.attachments || 'metadata',
      olderHistory: c.olderHistory || 'none',
      identityWarning: caps.identityWarning(c),
      lane: { via: lane.via, why: lane.why, source: lane.source || null },
      // P2 (design §7): the CONVERSATION grain as stored (the editor edits
      // it), the grains it would otherwise inherit, its filter, the
      // after-the-fact measurement, the two caps `authority:'send'` is gated
      // on and the honest per-lane wake latency — structure, the editor words.
      ownAssignment: assignmentView(rec, en, t),
      // R4: the conversation's OWN two lists (the Grant access / Notify
      // dialogs edit them) and what it inherits from the account and the
      // rules it matches (each grain's own lists)
      own: { access: own.access.map((r) => accessRowView(r, capsNow)), watchers: own.watchers.map((w) => watcherView(w, t)) },
      eligibleAbove: eligibleAboveView(en),   // lane channel-agent-watch W3: Notify… may name these without a per-chat access row
      inherits: { account: acct ? grainView(rec, acct, t) : null, patterns: pats.map((pa) => grainView(rec, pa, t)) },
      filter: (en.filterId && filterFor(en.filterId)) || null,
      stats: statsView(en, t),
      authorityCaps: authorityCapsFor(rec, en, t),
      wakeLatency: wakeLatencyFor(rec, en, lane, t),
      // P3 (design §8/§9): the sending policy as it READS, the reach rows
      // from all three homes WITH their origin, the open access requests.
      policy: policyFor(rec, en),
      reach: reachView(en),
      authors: Array.isArray(en.authors) ? en.authors.slice(0, 10) : [],
      readAt: en.readAt || 0,
      hot: isWatched(en.key, t),
    };
  }
  /** The presets an account of this type may pick RIGHT NOW (`{key,label}`,
   *  the store's one reader); `[]` without a store. */
  function presetsOf(mod) {
    if (!mod || !mod.integration || !integrations || typeof integrations.presetsFor !== 'function') return [];
    try { return integrations.presetsFor(mod.integration); } catch { return []; }
  }
  /** The custom client's two inputs, declared by the registry row (labels
   *  are English KEYS — the client words them). */
  function clientFieldDecls(mod) {
    const row = rowOf(mod);
    if (!row || !row.bindsPerAccount) return null;
    const cf = R.clientFieldsOf(row);
    return { id: cf.id, secret: cf.secret };
  }
  /** An account's own client for the WIRE: the id and a MASKED secret. */
  function customClientView(rec) {
    if (!rec || !rec.credential || typeof rec.credential !== 'object') return null;
    let masked = null, undecryptable = false;
    if (rec.credential.appSecretEnc) { try { masked = R.maskValue(box.dec(rec.credential.appSecretEnc)); } catch { undecryptable = true; } }
    return { appId: String(rec.credential.appId || ''), secretSet: !!rec.credential.appSecretEnc, secretMasked: masked, undecryptable };
  }
  function kindView(m) {
    const row = rowOf(m);
    return {
      kind: m.kind, label: m.label || m.kind, integration: m.integration || null,
      bindsPerAccount: !!(row && row.bindsPerAccount),
      presets: presetsOf(m), clientHint: row ? (row.clientHint || null) : null, clientFields: clientFieldDecls(m),
      // the custom branch's console setup (Lark: the registered redirect URL + its three prerequisites) — the registry's declaration
      setup: row && row.setup ? { callbackUrl: row.setup.callbackUrl || null, callbackNote: row.setup.callbackNote || null, prerequisites: (row.setup.prerequisites || []).slice() } : null,
      optionsSchema: (m.OPTIONS || []).map((o) => ({ key: o.key, label: o.label, help: o.help || '', default: o.default === undefined ? '' : o.default, placeholder: o.placeholder || '', choices: Array.isArray(o.choices) ? o.choices.slice() : null, choiceLabels: o.choiceLabels && typeof o.choiceLabels === 'object' ? { ...o.choiceLabels } : null, usedWhen: o.usedWhen && typeof o.usedWhen === 'object' ? JSON.parse(JSON.stringify(o.usedWhen)) : null })),
      receive: m.caps.receive, sendAs: m.caps.sendAs, pushOptIn: !!m.caps.pushOptIn,
    };
  }
  /** This conversation's outbox counts (the digest half; the list is the
   *  outbox broadcast's). */
  function outboxCountsFor(key) {
    const list = proposalsFor(key);
    return { awaiting: list.filter((p) => p.state === 'awaiting-approval').length, unknown: list.filter((p) => p.state === 'unknown').length, latestAt: list.length ? list[0].updatedAt || list[0].at : null };
  }

  /** The vendor's DECLARED name for a record (lane R5): the module's
   *  `vendorNameOf(record)` (a per-record brand), else `caps.vendorName`, else
   *  null (the card then says "the vendor"). Never derived from the kind. */
  function vendorNameOf(rec) {
    let mod = null; try { mod = registry.get(rec.kind); } catch { mod = null; }
    let v = null;
    if (mod && typeof mod.vendorNameOf === 'function') { try { v = mod.vendorNameOf(rec); } catch { v = null; } }
    if (!v && mod && mod.caps) v = mod.caps.vendorName || null;
    return typeof v === 'string' && v.trim() ? v.trim() : null;
  }
  /** ONE adapter row of the digest. It is the record's PUBLIC VIEW: the token
   *  (`auth.tokenEnc`) and the flow's `state` never leave this function. */
  function adapterView(rec, t = now()) {
    const c = registry.capsOf(rec.kind);
    const lane = laneOrScan(rec, {});
    const mod = realByKind.get(rec.kind) || null;
    const st = live.has(rec.id) ? live.get(rec.id).authState : null;
    // The adapter's OWN last answer outranks the record's stamps: a
    // withdrawn application credential is `needs-credentials` whatever
    // the token record says (§14.3).
    const auth = caps.authState(rec, t, { adapterState: st });
    return {
      id: rec.id, kind: rec.kind, label: rec.label, enabled: rec.enabled !== false, builtin: !!rec.builtin,
      // r3: a send here starts a BILLED TURN (the module's declaration) — the
      // composer says so and echoes the count with its Send (`expectWakes`)
      sendStartsTurn: sendStartsTurn(rec),
      // The built-in row's login IS this instance (`self`), never a named
      // user — the seed's `user: 'you'` was an English word on the wire (a3 i18n).
      // `tokenHeld` (verifier r1): does the record HOLD a token — a token-less
      // account (never authenticated / disconnected) may be re-bound by the
      // wizard's credential step; a held one is bound to its credential
      // `renews` (2026-09-26): the adapter says its refresh token is RE-ISSUED
      // on every automatic refresh (Lark: 7 days, sliding) — the card then
      // says nothing until renewals have actually stopped
      auth: { ...auth, self: !!rec.builtin, user: rec.builtin ? null : ((st && st.user) || (rec.auth && rec.auth.user) || null), scopes: (rec.auth && rec.auth.scopes) || [], credentialSource: (st && st.credentialSource) || null, credentialKey: (st && st.credentialKey) || rec.credentialKey || null, tokenHeld: !!(rec.auth && rec.auth.tokenEnc), renews: !!(st && st.renews), renewWindowMs: (st && Number(st.renewWindowMs)) || null },
      lastPass: rec.lastPass || null, consecutiveFailures: rec.consecutiveFailures || 0,
      // 2026-09-26 (lane R2 verify): "last sync" is the last GOOD pass — a
      // failed one stamps `lastPass` too, and the card used to print it as a
      // sync — and the retry instant of a back-off (in memory only) rides the
      // view, so a vendor 429 is said from the FIRST failure
      lastOkAt: Number(rec.lastOkAt) || (rec.lastPass && rec.lastPass.ok ? Number(rec.lastPass.at) || null : null),
      backoffUntil: (() => { const x = live.get(rec.id); return x && x.nextAt > t && rec.lastPass && rec.lastPass.ok === false ? x.nextAt : null; })(),
      // lane R5: WHICH back-off — a vendor RATE refusal (the short ladder, said
      // "Google is limiting the rate · resuming in N s") or a failure — and the
      // strikes / the vendor's own hint; null while no back-off runs
      backoff: (() => { const x = live.get(rec.id); return x && x.nextAt > t && rec.lastPass && rec.lastPass.ok === false ? { kind: x.backoffKind || 'failure', until: x.nextAt, strikes: x.backoffKind === 'rate' ? x.rateStrikes : x.failures, retryAfterSec: x.retryAfterSec } : null; })(),
      // the VENDOR's name as the card says it (a declared label — `caps.vendorName`,
      // or the module's `vendorNameOf(record)` for a per-record brand) — never the kind id
      vendor: vendorNameOf(rec),
      // the per-second pace (drain rule 18): its numbers and the last second's spend
      pace: paceView(rec, live.get(rec.id) || paceCarry.get(rec.id) || null),   // verify r5: a toggled account not yet rebuilt reads its ghost, not zero
      lane: { via: lane.via, why: lane.why, live: !!lane.live, carryContent: !!lane.carryContent },
      sendAs: c.sendAs, receive: c.receive, identityMarking: c.identityMarking,
      // §25: how a send READS in the composer's one line — `draft` = a
      // two-phase adapter drafts in the thread and sends that draft (mail),
      // `direct` = one request; and what would unlock sending here
      sendForm: c.idempotency === 'two-phase' ? 'draft' : 'direct',
      // B-a085: a reply here may go to EVERYONE on the message it answers (mail — the composer's "Reply all")
      replyAll: c.replyEnvelope === true,
      sendGrant: sendGrantView(rec),
      // lane channel-threads: what unlocks READING reactions (the scope, the console step) + the trickle's minute
      reactionsGrant: reactionsGrantView(rec),
      // lane lark-search-poll: the change feed (its state, mode, measurement, catch-up) + THE ONE GRANT LIST (§5.3)
      feed: feedView(rec, t),
      grants: grantsView(rec),
      reactionPolicy: P.reactionPolicyOf(rec.reactionPolicy),
      agentDirectory: ACL.directoryOf(rec),   // lane channel-agent-watch W2: may agents see the list of conversations (groups / single chats)
      reactions: (() => { const x = live.get(rec.id); const m = x ? Drain.rxMinuteAt(x.rxMinute, t) : { n: 0 }; return { read: reactionsRow(registry.capsOf(rec.kind)).read, add: !!reactionsRow(registry.capsOf(rec.kind)).add, perMinute: reactionsPerMin(), listedThisMinute: m.n, calls60s: x ? (x.rxCalls || []).filter((y) => t - y < 60e3).length : 0 }; })(),
      // P1: what the panel's connect / re-authorize / options controls read.
      connectable: !!mod,
      integration: mod ? mod.integration || null : null,
      // THE ACCOUNT MODEL (2026-09-22): which credential THIS account is bound
      // to (`cluster:<k>` / `own` / null = legacy, follows the row's pick),
      // its label (a preset's env label; `own` is worded by the client), the
      // facts resolved FOR THAT KEY, and every credential a further account
      // of this kind may bind to (the wizard's credential step, shown only
      // when more than one is offered).
      credentialKey: rec.credentialKey || null,
      credentialLabel: mod ? credentialLabelFor(mod.integration, rec.credentialKey || null) : null,
      credential: mod ? credentialFactsFor(rec) : null,
      credentials: mod ? offeredCredentials(mod.integration) : [],
      // r4 (design-integrations-per-account §2.2–§2.5): the account dialog's
      // `OAuth client` field — the presets `{key,label}` the one env reader
      // offers, the row's hint line and the custom client's two field
      // declarations; `customClient` = THIS account's own client as the card
      // may show it (the id, the secret MASKED — the Edit dialog's prefilled
      // secret comes from the owner-only config route, D3, never from here).
      bindsPerAccount: !!(mod && rowOf(mod) && rowOf(mod).bindsPerAccount),
      presets: mod ? presetsOf(mod) : [],
      clientHint: mod && rowOf(mod) ? (rowOf(mod).clientHint || null) : null,
      clientFields: mod ? clientFieldDecls(mod) : null,
      customClient: customClientView(rec),
      // the row's CURRENT pick = what a further account of this kind is bound
      // to unless the wizard says otherwise (c2: the credential step's
      // pre-picked radio) — never this account's own key
      credentialDefault: mod ? defaultCredentialKey(mod.integration) : null,
      flow: safeFlow(flows.runningFor(rec.id)),
      lastAuthError: rec.lastAuthError || null, lastAuthAt: rec.lastAuthAt || null,
      failureItem: rec.failureItem ? { id: rec.failureItem.id, code: rec.failureItem.code, at: rec.failureItem.at } : null,
      // P1b: the push lane's public half (null = no push lane); the panel
      // composes the sentence with `pushLaneText` in the device's language.
      push: pushView(rec, t),
      // 2026-09-26 (the aggregated IM): the vendor budget, the scheduler's
      // census, the attachment cache and the account / pattern grains — all
      // STRUCTURE the card words
      budget: budgetView(rec, live.get(rec.id) || paceCarry.get(rec.id) || null, t),
      scheduler: schedulerView(rec, t),
      attachments: { ...store.attachmentUsage(rec.id), budgetBytes: attachmentBudgetBytes(), fetch: registry.capsOf(rec.kind).attachments === 'fetch' },
      linkedAt: rec.linkedAt || null,
      // R4: the ACCOUNT grain's two lists (`accountGrain`; `assignment` = the
      // same view, the pre-split name a legacy reader asks for) and every
      // rule with its own two lists
      accountGrain: accountGrainOf(rec.id) && (F.grainOf(accountGrainOf(rec.id)).access.length || F.grainOf(accountGrainOf(rec.id)).watchers.length) ? grainView(rec, accountGrainOf(rec.id), t) : null,
      assignment: accountGrainOf(rec.id) && (F.grainOf(accountGrainOf(rec.id)).access.length || F.grainOf(accountGrainOf(rec.id)).watchers.length) ? grainView(rec, accountGrainOf(rec.id), t) : null,
      patterns: patternsOf(rec.id).map((pa) => grainView(rec, pa, t)),
      // R4 (B-6acc): the ACCOUNT's sending policy (what a composed message reads, the Grant access dialog's `send` cap)
      policy: policyFor(rec, null),
      // P4: the §21-item-3 proof (a real send's observed sender_type) and the
      // per-channel honesty switch as the panel draws them.
      identityObserved: rec.identityObserved ? { ...rec.identityObserved } : null,
      senderHonestyLine: c.sendAs.length ? { record: rec.senderHonestyLine === true ? true : rec.senderHonestyLine === false ? false : null, effective: honestyLineFor(rec) } : null,
      options: viewOptions(mod, rec),
      optionsSchema: (mod && mod.OPTIONS ? mod.OPTIONS : []).map((o) => ({ key: o.key, label: o.label, help: o.help || '', default: o.default === undefined ? '' : o.default, placeholder: o.placeholder || '', choices: Array.isArray(o.choices) ? o.choices.slice() : null, choiceLabels: o.choiceLabels && typeof o.choiceLabels === 'object' ? { ...o.choiceLabels } : null, usedWhen: o.usedWhen && typeof o.usedWhen === 'object' ? JSON.parse(JSON.stringify(o.usedWhen)) : null })),
    };
  }

  /** The account's scheduler census computed from EVERY row at instant `t` (the card's "N conversations · M unread"
   *  line and the tiers' counts) — the definition the paced census below is held to (`schedulerExact`, the gates). */
  function schedulerScan(rec, t = now()) {
    const out = { conversations: 0, unread: 0, hot: 0, warm: 0, cold: 0, paused: 0, overridden: 0, unlisted: 0, due: 0, lastDiscoveryAt: null, discovering: false, firstIngest: null };
    let walked = 0, reading = 0;   // lane R5: the first-read census — conversations being read (not paused, not refused by the vendor) and those walked once
    const T = tiers();
    const c = registry.capsOf(rec.kind);
    const lane = laneOrScan(rec, {});
    for (const en of Object.values(store.index.live())) {
      if (!en || en.adapterId !== rec.id) continue;
      if (en.unlistedAt) { out.unlisted++; continue; }
      out.conversations++;
      out.unread += Number(en.unread) || 0;
      const cad = caps.cadenceFor(c, lane, en, t, { tiers: T, watched: isWatched(en.key, t) });
      if (cad.paused) out.paused++; else if (cad.tier === 'hot') out.hot++; else if (cad.tier === 'warm') out.warm++; else out.cold++;
      if (cad.source === 'override') out.overridden++;
      const last = Number(en.lane && en.lane.lastPollAt) || 0;
      if (!cad.paused && cad.seconds && last + cad.seconds * 1000 <= t) out.due++;
      if (!cad.paused && !(en.lane && en.lane.lastError)) { reading++; if (en.walkedAt) walked++; }
    }
    return finishCensus(rec, out, walked, reading);
  }
  function finishCensus(rec, out, walked, reading) {
    const e = live.get(rec.id) || null;
    if (e) { out.lastDiscoveryAt = e.disc.lastCompleteAt || null; out.discovering = !!e.disc.cursor; }
    // lane R5: THE FIRST READ — every listed conversation's first complete walk
    // (`walkedAt`), and at the pace how long the rest takes; null once done
    if (reading && walked < reading) {
      const pv = paceView(rec, e);
      const left = reading - walked;
      out.firstIngest = { done: walked, total: reading, etaSec: pv && pv.unitsPerSec > 0 ? Math.ceil((left * pv.fetchUnits) / pv.unitsPerSec) : null };
    }
    return out;
  }
  /** THE PACED CENSUS (B-f32b r2 — the coordinator's ruling, 2026-10-03): every broadcast walked every row of every
   *  account to count its tiers by the clock — ~90 ms per broadcast at 50 274 rows, 95 % of a window open once the
   *  index copies were gone. What a user's action moves stays EXACT on every broadcast (the kept row facts: listed,
   *  unread, unlisted, paused, overridden, the first read); the CLOCK counts (hot / warm / cold / due) are walked at
   *  most once per `censusEveryMs` per account. A broadcast inside the window reads the last walk and arms ONE trailing
   *  walk + broadcast at the window's end (never from a trailing broadcast itself), so the card settles exact. */
  const censusTimed = new Map();   // adapterId → { at, hot, warm, cold, due, timer }
  const censusCount = new Map();   // adapterId → clock walks (the gates)
  let censusTrailing = false;
  function clockCensus(rec, t) {
    let c = censusTimed.get(rec.id);
    if (c && t >= c.at && t - c.at < censusEveryMs) {
      if (!c.timer && !censusTrailing && !stopped) c.timer = censusTimer(() => censusTrail(rec.id), c.at + censusEveryMs - t);
      return c;
    }
    if (c && c.timer) { try { c.timer.cancel(); } catch { } }
    const s = schedulerScan(rec, t);
    c = { at: t, hot: s.hot, warm: s.warm, cold: s.cold, due: s.due, timer: null };
    censusTimed.set(rec.id, c);
    censusCount.set(rec.id, (censusCount.get(rec.id) || 0) + 1);
    return c;
  }
  function censusTrail(id) {
    const c = censusTimed.get(id);
    if (!c) return;
    c.timer = null;
    if (stopped) return;
    censusTimed.delete(id);   // the trailing walk happens even when a timer fires a hair early
    censusTrailing = true;
    try { notify([], { full: false }); } finally { censusTrailing = false; }
  }
  function schedulerView(rec, t = now()) {
    const f = rowFactsNow().get(rec.id) || {};
    const c = clockCensus(rec, t);
    const out = { conversations: f.conversations || 0, unread: f.unread || 0, hot: c.hot, warm: c.warm, cold: c.cold, paused: f.paused || 0, overridden: f.overridden || 0, unlisted: f.unlisted || 0, due: c.due, lastDiscoveryAt: null, discovering: false, firstIngest: null };
    return finishCensus(rec, out, f.walked || 0, f.reading || 0);
  }

  /** ONE broadcast per pass, carrying the recomputed RESULT — never one per
   *  message, and never a bare "something changed" (the cache-invalidation
   *  law: one dirty signal, one computation). */
  function notify(changed = [], { full = null, extra = null } = {}) {
    try {
      // 2026-09-26: a broadcast carries the CHANGED conversations only
      // (`partial`), the adapters and the totals always; the whole digest
      // only for a structural change (`full`) or too many rows to name. A
      // bare convId (a caller that predates account ids in keys) names every
      // account's conversation of that id.
      const liveIx = store.index.live();
      const keys = [];
      for (const c of Array.isArray(changed) ? changed : []) {
        const k = String(c || '');
        if (!k) continue;
        if (liveIx[k]) { keys.push(k); continue; }
        for (const kk of Object.keys(liveIx)) if (kk.endsWith('/' + k) && liveIx[kk].id === k) keys.push(kk);
      }
      const uniq = [...new Set(keys)];
      // `full` unset: naming nothing is an ACCOUNT-level change (auth, push,
      // enable, options, assignment grains) the rows may reflect ⇒ the whole
      // digest; a pass that changed nothing says `{full:false}` explicitly
      const partial = !(full === null ? uniq.length === 0 : full) && uniq.length <= PARTIAL_MAX;
      const d = digest(partial ? { keys: uniq } : {});
      // lane channel-threads: a SIDE change (reactions) / a thread's stats ride the SAME message as the RESULT —
      // `patches: {[convKey]: {[vendorId]: {reactions}}}`, `threads: {[convKey]: {[threadKey]: {count, lastAt}}}`,
      // `rereadReactions: [convKey]` past the patch bound — the window applies them IN PLACE (no new message type)
      const more = extra && typeof extra === 'object' ? extra : {};
      broadcast({ type: 'channels-updated', changed: uniq.map((k) => liveIx[k] ? liveIx[k].id : k.slice(k.indexOf('/') + 1)), changedKeys: uniq, partial, digest: d, ...(more.patches ? { patches: more.patches } : {}), ...(more.threads ? { threads: more.threads } : {}), ...(more.rereadReactions && more.rereadReactions.length ? { rereadReactions: more.rereadReactions } : {}), ...(more.authors ? { authors: more.authors } : {}) });
    } catch (err) { console.warn('[channels] broadcast failed:', err && err.message); }
  }

  // ── P1b: THE PUSH LANES — armed by the engine, judged by the resolver ────
  /** The record's `push` half, healed to the P1b shape (records seeded
   *  before it existed carry no `samples`). */
  function pushRow(rec) {
    if (!rec.push || typeof rec.push !== 'object') rec.push = { enabled: true, claimedExclusive: 'unknown', state: null, lastEventAt: null, missRate: 0, demotedAt: null, demotedWhy: null };
    if (!Array.isArray(rec.push.samples)) rec.push.samples = [];
    if (!caps.PUSH_CLAIMS.includes(rec.push.claimedExclusive)) rec.push.claimedExclusive = 'unknown';
    return rec.push;
  }
  /** Is a lane WANTED for this record right now: a push adapter with a live
   *  half, enabled, its switch on (an opt-in lane needs an explicit `true`),
   *  and a credential it can connect WITH. */
  function pushWanted(rec, e) {
    const c = registry.capsOf(rec.kind);
    if (c.receive !== 'push' || !e.adapter.live || typeof e.adapter.live.start !== 'function') return false;
    if (rec.enabled === false) return false;
    const p = pushRow(rec);
    if (p.enabled === false || (c.pushOptIn && p.enabled !== true)) return false;
    return !!(e.authState && e.authState.state === 'connected');
  }
  function armPush(rec, e) {
    const p = pushRow(rec);
    const token = {};
    e.liveToken = token;
    let handle;
    try {
      handle = e.adapter.live.start({
        onState: (st) => { if (e.liveToken !== token) return; onPushState(rec, e, st || {}); },
        onEvent: (ev) => { if (e.liveToken !== token) return { ok: false, why: 'stopped' }; return onPushEvent(rec, e, ev || {}); },
      });
    } catch (err) {
      e.liveToken = null;
      p.state = 'unavailable'; p.lastStateWhy = `live.start threw: ${(err && err.message) || err}`; p.lastStateAt = now();
      log.warn(`[channels] ${rec.id}: push lane could not start: ${p.lastStateWhy}`);
      return;
    }
    e.liveHandle = handle;
    log.log(`[channels] ${rec.id}: push lane armed (${registry.capsOf(rec.kind).pushTransport}, declared ${p.claimedExclusive})`);
  }
  function disarmPush(e, why = 'stopped') {
    const h = e.liveHandle;
    e.liveHandle = null; e.liveToken = null;
    if (e.kickTimer) { clearTimeout(e.kickTimer); e.kickTimer = null; }
    if (h) { try { h.stop(why); } catch (err) { log.warn(`[channels] ${e.record && e.record.id}: push lane stop threw: ${(err && err.message) || err}`); } }
  }
  /** Arm every lane that is wanted and stop every one that is not — called
   *  by the tick and by the mutations that change the answer. */
  async function syncPushLanes() {
    if (stopped) return;
    for (const rec of adapterRecords().adapters) {
      if (registry.capsOf(rec.kind).receive !== 'push') continue;
      const e = adapterFor(rec);
      if (rec.enabled !== false && !e.authState) await refreshAuth(e);
      if (stopped) return;
      const want = pushWanted(rec, e);
      if (want && !e.liveHandle) armPush(rec, e);
      else if (!want && e.liveHandle) disarmPush(e, rec.enabled === false ? 'adapter disabled' : 'push switched off');
    }
  }
  /** `push.contentSince`: the instant the lane began CARRYING CONTENT, kept in
   *  step with the resolver's answer — the measurement judges only records
   *  stamped after it. Returns the resolver's lane. */
  function syncContentSince(rec) {
    if (registry.capsOf(rec.kind).receive !== 'push') return null;
    const p = pushRow(rec);
    const l = laneFor(rec, {});
    if (l.carryContent && !p.contentSince) p.contentSince = now();
    if (!l.carryContent && p.contentSince) p.contentSince = null;
    return l;
  }
  /** The lane's state, on the LIVE record: a heartbeat only refreshes
   *  `lastEventAt` in memory; a TRANSITION persists and broadcasts. */
  function onPushState(rec, e, st) {
    const p = pushRow(rec);
    const prev = p.state;
    p.state = st.state || null;
    if (st.heard) p.lastEventAt = Number(st.at) || now();
    p.lastStateAt = Number(st.at) || now();
    if (st.why !== undefined) p.lastStateWhy = st.why || null;
    else if (st.state === 'live') p.lastStateWhy = null;
    // the lane's permanent CODE (`sdk-not-installed`, `push-not-configured`, …):
    // the card words the remedy by it (2026-09-26), the `why` stays the log's
    if (st.code !== undefined) p.lastStateCode = st.code || null;
    else if (st.state === 'live') p.lastStateCode = null;
    syncContentSince(rec);
    if (prev !== p.state) {
      log.log(`[channels] ${rec.id}: push lane ${p.state}${p.lastStateWhy ? ` (${p.lastStateWhy})` : ''}`);
      if (!stopped) {
        store.adapters.update(() => {}).catch((err) => log.warn('[channels] adapters write failed:', err && err.message));
        notify([]);
      }
    }
  }
  /**
   * ONE pushed event. THE ORDER IS FENCE 11: the record lands in the durable
   * log FIRST and this function RETURNS (= the ack) before the index moves or
   * anyone is told; the index update + broadcast run after, coalesced per
   * batch. Content rides when the resolver says `carryContent` — for EVERY
   * conversation of the account (2026-09-26: there is no `tracked` gate; a
   * conversation nobody discovered yet is born here and discovery fills in
   * its title) — otherwise the event is a cursor KICK that makes the named
   * conversation due NOW (Gmail's note names none: the account's newest
   * conversation is the probe whose history call syncs the mailbox).
   */
  async function onPushEvent(rec, e, ev) {
    const p = pushRow(rec);
    const t = now();
    p.lastEventAt = t;                                   // any frame is positive evidence
    const id = ev.eventId != null && ev.eventId !== '' ? String(ev.eventId) : null;
    if (id) {
      if (e.seenEvents.has(id)) return { ok: true, duplicate: true, persisted: false };   // the vendor's replay (fence 11)
      e.seenEvents.set(id, t);
      if (e.seenEvents.size > PUSH_EVENT_DEDUP_MAX) { const it = e.seenEvents.keys(); for (let i = e.seenEvents.size - PUSH_EVENT_DEDUP_MAX; i > 0; i--) e.seenEvents.delete(it.next().value); }
    }
    const lane = syncContentSince(rec) || laneFor(rec, {});
    // lane channel-threads (spec §3.3 source 1): a REACTION event — ONE side record, judged by `validateSide` BEFORE
    // anything reads it (attack 2: a 64 KiB emoji name is refused by its length, logged by its length, never
    // verbatim), placed on the message's conversation (Lark's event names none — L10), DURABLE before this function
    // returns (fence 11), whatever the push claim says (a reaction is not a message; the claim is about messages).
    // A reaction NEVER reaches the wake funnel (test-architecture §64).
    if (ev.kind === 'side' && ev.side) {
      const v = validateSide(ev.side);
      if (!v.ok) { log.warn(`[channels] ${rec.id}: a pushed side record was refused ${v.code} (key length ${String((ev.side && ev.side.key) || '').length})`); return { ok: true, persisted: false, refused: v.code }; }
      const located = ev.convId != null && ev.convId !== '' ? { convId: String(ev.convId), why: null } : await convOfMessage(rec, v.side.msg);
      // a conversation the event NAMES still holds only messages it stored: an unknown message's side line would be
      // a line about nothing (folded onto nothing, compacted onto nothing — a storm of them is unbounded growth)
      if (located.convId && ev.convId != null && msgConv.get(`${rec.id}\u0000${v.side.msg}`) !== located.convId) {
        if (store.findRecord(rec.id, located.convId, v.side.msg)) noteMsgConv(rec.id, located.convId, v.side.msg);
        else located.convId = null, located.why = 'not-in-conversation';
      }
      const sideConv = located.convId;
      if (!sideConv) { if (located.why !== 'remembered') log.log(`[channels] ${rec.id}: a reaction on a message this account never stored — dropped (it is folded onto nothing${located.why === 'locate-budget' ? '; the store search budget of this minute is spent' : ''})`); return { ok: true, persisted: false, dropped: 'message-unknown', why: located.why }; }
      if (!store.index.live()[`${rec.id}/${sideConv}`]) {
        await store.index.update(() => { const en = store.index.entry(rec.id, sideConv); if (!(Number(en.readAt) > 0)) en.readAt = Number(rec.linkedAt) || 0; if (en.title === undefined) en.title = null; });   // lane lark-search-poll: never the raw id — the client words an untitled row
        kick(rec, e, sideConv);
      }
      const w = store.appendSide(rec.id, sideConv, [v.side]);   // DURABLE — the ack is this function's return
      if (w.appended) notifySide(rec.id, sideConv, w.msgs);
      return { ok: true, persisted: w.appended > 0, duplicate: w.duplicates > 0 };
    }
    const convId = ev.convId != null ? String(ev.convId) : null;
    if (ev.kind === 'record' && ev.record && convId) {
      if (lane.carryContent) {
        if (!store.index.live()[`${rec.id}/${convId}`]) {
          // born by push: the row exists before the record's index half lands
          await store.index.update(() => { const en = store.index.entry(rec.id, convId); if (!(Number(en.readAt) > 0)) en.readAt = Number(rec.linkedAt) || 0; if (en.title === undefined) en.title = null; });   // lane lark-search-poll: never the raw id — the client words an untitled row
        }
        const batch = [ev.record]; batch.placeSrc = 'event';   // verify r1 F6: a push-delivered copy that widens a stored place names its source
        const w = store.appendRecords(rec.id, convId, batch);   // DURABLE — the ack is this function's return
        if (w.appended) olderChanged(e, convId);   // rule 19 (verify r7): a record the PUSH lane appended forgets the "nothing older" memory, like the poll's
        if (w.appended) { p.samples = caps.pushSamplesAdd(p.samples, { at: t, n: w.appended, p: 0 }); p.missRate = caps.pushMissRate(p.samples, t).rate; }
        afterPush(rec, e, convId, w);
        if (Array.isArray(w.fresh) && w.fresh.length) track(persistHeldBodies(rec, e, convId, w.fresh));   // lane channel-rich
        // P2: the SAME funnel as a poll pass (fence 12) — and because this
        // lane carries content one message at a time, `onFresh` opens the
        // coalescing window before the wake decision. Never awaited here:
        // the ack is this function's return and it must not wait on a turn.
        if (Array.isArray(w.fresh) && w.fresh.length) track(onFresh(rec, convId, w.fresh, { lane, origin: 'push' }));
        return { ok: true, persisted: true, appended: w.appended, duplicates: w.duplicates };
      }
      // kick mode: the record is NOT taken from the event — the poll carries it
    }
    if (convId && !store.index.live()[`${rec.id}/${convId}`]) {
      // a conversation discovery cannot list (Lark never lists p2p chats) is
      // still a conversation: born here, so the kick has a row to make due
      await store.index.update(() => { const en = store.index.entry(rec.id, convId); if (!(Number(en.readAt) > 0)) en.readAt = Number(rec.linkedAt) || 0; if (en.title === undefined) en.title = null; });   // lane lark-search-poll: never the raw id — the client words an untitled row
    }
    kick(rec, e, convId);
    return { ok: true, persisted: false, kicked: true };
  }
  /** After the ack: the index (unread / lastAt / the push observation) and
   *  ONE broadcast per batch — never per message. */
  function afterPush(rec, e, convId, w) {
    if (!e.pushBatch) e.pushBatch = new Map();
    const b = e.pushBatch.get(convId) || { appended: 0, lastAt: null, lastText: null, lastTextAt: -Infinity, selfAt: 0 };
    b.appended += w.appended;
    if (Array.isArray(w.fresh)) { const sa = selfAtOf(w.fresh); if (sa > (b.selfAt || 0)) b.selfAt = sa; }
    if (w.lastAt && (!b.lastAt || w.lastAt > b.lastAt)) b.lastAt = w.lastAt;
    if (w.lastAt && w.lastAt >= b.lastTextAt && typeof w.lastText === 'string') { b.lastTextAt = w.lastAt; b.lastText = previewText(w); }
    e.pushBatch.set(convId, b);
    if (e.pushTimer) return;
    e.pushTimer = setTimeout(() => { e.pushTimer = null; flushPushBatch(rec, e).catch((err) => log.warn(`[channels] ${rec.id}: push batch failed: ${(err && err.message) || err}`)); }, PUSH_NOTIFY_DEBOUNCE_MS);
    if (e.pushTimer.unref) e.pushTimer.unref();
  }
  async function flushPushBatch(rec, e) {
    const batch = e.pushBatch; e.pushBatch = null;
    if (!batch || !batch.size) return;
    const changed = [];
    await store.index.update(() => {
      for (const [convId, b] of batch) {
        const en = store.index.entry(rec.id, convId, { create: false });
        if (!en) continue;
        if (b.lastAt && (!en.lastAt || b.lastAt > en.lastAt)) en.lastAt = b.lastAt;
        if (typeof b.lastText === 'string' && b.lastTextAt >= (Number(en.lastAt) || 0)) en.lastText = lastTextOf(b.lastText);
        if (b.selfAt > (Number(en.selfAt) || 0)) en.selfAt = b.selfAt;
        en.unread = store.countSince(rec.id, convId, en.readAt || 0);
        en.lane = { ...(en.lane || {}), via: 'push', lastPushAt: now(), firstSeenTotal: ((en.lane && en.lane.firstSeenTotal) || 0) + b.appended };
        changed.push(`${rec.id}/${convId}`);
      }
    });
    for (const k of changed) { try { store.trim(rec.id, k.slice(rec.id.length + 1)); } catch (err) { console.warn('[channels] trim failed:', err && err.message); } }
    if (!stopped) notify(changed);
  }
  /** A cursor kick: wake the SLEEP, not just a fetch — one kick-origin pass
   *  at most every KICK_MIN_INTERVAL_MS per adapter (a burst is one pass),
   *  respecting the adapter's own backoff. A kick that NAMES a conversation
   *  makes exactly that one due now (2026-09-26); a kick that names none
   *  (Gmail's mailbox note) makes the account's newest conversation the
   *  probe — its history call syncs the mailbox, and the threads the mailbox
   *  names come back as hints and become due in the same pass. */
  function kick(rec, e, convId = null) {
    if (convId) e.dueNow.add(`${rec.id}/${convId}`);
    else {
      let best = null;
      for (const en of Object.values(store.index.live())) if (en && en.adapterId === rec.id && !en.unlistedAt && (!best || (Number(en.lastAt) || 0) > (Number(best.lastAt) || 0))) best = en;
      if (best) e.dueNow.add(best.key); else e.discoverSoon = true;
    }
    if (stopped || e.kickTimer) return;
    const wait = Math.max(0, (e.lastKickAt || 0) + KICK_MIN_INTERVAL_MS - now());
    e.kickTimer = setTimeout(() => {
      e.kickTimer = null;
      if (stopped) return;
      e.lastKickAt = now();
      pass(rec.id, { origin: 'kick' }).catch((err) => log.warn(`[channels] ${rec.id}: kick pass failed: ${(err && err.message) || err}`));
    }, wait);
    if (e.kickTimer.unref) e.kickTimer.unref();
  }
  /** THE DEMOTION (§6.4): the product withdrawing its own claim, SAID on the
   *  row and in the log, and cleared by NOTHING but a re-declaration. */
  async function checkDemotion(rec) {
    const p = pushRow(rec);
    const v = caps.pushDemotionVerdict(p, now());
    p.missRate = v.rate;
    if (!v.demote) return false;
    p.demotedAt = now(); p.demotedWhy = 'miss-rate';
    p.demoted = { rate: v.rate, total: v.total, missed: v.missed, threshold: v.threshold, at: p.demotedAt, claim: p.claimedExclusive };
    syncContentSince(rec);
    await store.adapters.update(() => {});
    log.warn(`[channels] ${rec.id}: push is not exclusive here — ${v.missed} of ${v.total} records (${(v.rate * 100).toFixed(1)}%) were first seen by the reconciliation poll; fell back to cursor kicks, polling returned to the fast cadence. Re-declare exclusivity from the Channels panel (Push…) to retry.`);
    if (!stopped) notify([]);
    return true;
  }
  /** The push switch and the exclusivity CLAIM (`PUT /api/channels/adapters/:id`
   *  `{push:{enabled?, claimedExclusive?}}`). A re-declaration is THE ONE
   *  thing that clears a demotion: counters zeroed, the lane retried ONCE
   *  with a fresh arm (single-use). */
  async function setPush(adapterId, patch) {
    const rec = recordOrThrow(adapterId);
    const c = registry.capsOf(rec.kind);
    const bad = (m, code = 'bad-request') => { const err = new Error(m); err.status = 400; err.code = code; throw err; };
    if (c.receive !== 'push') bad(`${rec.label || rec.id} has no push lane (receive: ${c.receive})`, 'no-push-lane');
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) bad('push must be an object');
    if (patch.claimedExclusive !== undefined && !caps.PUSH_CLAIMS.includes(patch.claimedExclusive)) bad(`push.claimedExclusive must be one of ${caps.PUSH_CLAIMS.join(', ')}`);
    if (patch.enabled !== undefined && typeof patch.enabled !== 'boolean') bad('push.enabled must be a boolean');
    const p = pushRow(rec);
    let redeclared = false;
    await store.adapters.update(() => {
      if (typeof patch.enabled === 'boolean') p.enabled = patch.enabled;
      if (patch.claimedExclusive !== undefined) {
        p.claimedExclusive = patch.claimedExclusive;
        redeclared = true;
        p.demotedAt = null; p.demotedWhy = null; p.demoted = null;
        p.samples = []; p.missRate = 0; p.contentSince = null; p.redeclaredAt = now();
      }
    });
    const e = adapterFor(rec);
    if (redeclared || patch.enabled === false) disarmPush(e, redeclared ? 're-declared' : 'push switched off');
    if (redeclared) log.log(`[channels] ${rec.id}: push exclusivity re-declared as '${p.claimedExclusive}' — counters cleared, the lane is retried once`);
    await syncPushLanes();
    notify([]);
    return { ok: true, push: pushView(rec) };
  }
  /** The push half of an adapter row — public, no secrets. `null` for an
   *  adapter with no push lane (the panel gates its Push… control on it). */
  function pushView(rec, t = now()) {
    const c = registry.capsOf(rec.kind);
    if (c.receive !== 'push') return null;
    const p = pushRow(rec);
    const m = caps.pushMissRate(p.samples, t);
    return {
      enabled: c.pushOptIn ? p.enabled === true : p.enabled !== false, optIn: !!c.pushOptIn, transport: c.pushTransport || null,
      claimedExclusive: p.claimedExclusive || 'unknown', state: p.state || null, lastStateWhy: p.lastStateWhy || null, lastStateAt: p.lastStateAt || null, lastEventAt: p.lastEventAt || null,
      demotedAt: p.demotedAt || null, demotedWhy: p.demotedWhy || null, demoted: p.demoted || null, redeclaredAt: p.redeclaredAt || null,
      missRate: { rate: m.rate, total: m.total, missed: m.missed, enough: m.enough, threshold: caps.PUSH_MISS_THRESHOLD },
      contentSince: p.contentSince || null, lastStateCode: p.lastStateCode || null,
    };
  }

  // ── mutations the routes reach for ──────────────────────────────────────
  /**
   * DOES THIS PAIR EXIST — asked BEFORE anything is mutated (r2).
   *
   * `store.index.entry()` creates on first touch, which is right for the
   * ingest pass and wrong for a route: `POST /track` and `POST /read` on any
   * id whatsoever used to mint a permanent, invisible row in `index.json` —
   * a file read on every render and deep-cloned by `digest()` on every
   * broadcast — while the track route's own `404 No such conversation` was
   * unreachable dead code, because `setTracked` always answered true.
   */
  function known(adapterId, convId) {
    if (!adapterRecords().adapters.some((r) => r.id === adapterId)) return false;
    // B-f32b (lane channel-index-copy): a lookup, never `snapshot()` — that deep copy of the WHOLE index (0.5 s at
    // 50 274 conversations) ran up to five times per Channel window opened (watch, refresh, messages, markRead, the
    // broadcast's re-read); 19 opens queued ~40 s of server thread (userW inc-muro2wt1-e8lu)
    return store.index.has(`${adapterId}/${convId}`);
  }

  // ── THE READER SURFACE (2026-09-26, design §6.5) ────────────────────────
  /** THE OWNER'S REFRESH OVERRIDE ("Refresh every ▸"): 30 | 60 | 300 | 900 |
   *  'paused', or null = back to the activity tier. Persisted on the entry,
   *  broadcast; the scheduler and the chip read it through `cadenceFor`. */
  async function setRefresh(adapterId, convId, every, by = 'user') {
    if (!known(adapterId, convId)) return { ok: false, code: 'not-found', error: 'No such conversation' };
    if (every !== null && !caps.validRefresh(every)) return { ok: false, code: 'bad-request', error: `every must be one of ${caps.REFRESH_CHOICES.join(', ')} (seconds), or null for automatic` };
    const t = now();
    await store.index.update(() => {
      const en = store.index.entry(adapterId, convId, { create: false });
      if (!en) return;
      if (every === null) delete en.refresh; else en.refresh = { every, by: by === 'migration' ? 'migration' : 'user', at: t };
    });
    notify([`${adapterId}/${convId}`]);
    const en = store.index.peek(`${adapterId}/${convId}`);
    const rec = adapterRecords().adapters.find((r) => r.id === adapterId);
    return { ok: true, refresh: en.refresh || null, cadence: rec ? cadenceOf(rec, en) : null };
  }

  /** REFRESH ONE conversation now (a window's open, the owner's "Refresh",
   *  the agent's verb): a REQUEST into the account's coalescing set — the
   *  pass loop alone judges it and answers (`requestRefresh`, lane R2 verify
   *  r5). `{ok, appended, polledAt}` | `{ok, pending}` | a NAMED refusal. */
  async function refresh(adapterId, convId, { origin = 'refresh' } = {}) {
    const rec = adapterRecords().adapters.find((r) => r.id === adapterId);
    if (!rec || !known(adapterId, convId)) return { ok: false, code: 'not-found', error: 'No such conversation' };
    if (rec.enabled === false) return { ok: false, code: 'disabled', error: `${rec.label || rec.id} is disabled` };
    olderChanged(adapterFor(rec), convId);   // rule 19: the owner's Refresh forgets the "nothing older" memory
    return requestRefresh(rec, adapterFor(rec), `${adapterId}/${convId}`, { origin });
  }
  /** Is the account inside the back-off a failed pass set (`e.nextAt`)? */
  const inBackoff = (e) => e.nextAt > now();
  /** The back-off refusal: the last pass's code, the retry instant, the wait —
   *  no vendor call was made (lane R2 verify r3). */
  function backoffRefusal(rec, e) {
    const s = Math.max(1, Math.ceil((e.nextAt - now()) / 1000));
    const code = (rec.lastPass && rec.lastPass.ok === false && rec.lastPass.code) || 'vendor-error';
    return { ok: false, code: 'backoff', error: `the vendor refused this account's last fetch (${code}) — it is retried in ${s} s; read what is there now`, retryAfterSec: s, backoffUntil: e.nextAt, lastCode: code };
  }
  /** The budget refusal, named with its number and the wait. */
  function budgetRefusal(rec, e) {
    const b = budgetView(rec, e);
    const w = win(e);
    const s = Math.max(1, Math.ceil((w.at + 60e3 - now()) / 1000));
    const unit = b.unit === 'quota-unit' ? 'quota units' : 'requests';
    return { ok: false, code: 'vendor-budget', error: `this account's vendor budget for this minute (${b.limit} ${unit}/min) is spent — try again in ${s} s`, retryAfterSec: s, budget: { unit: b.unit, limit: b.limit } };
  }
  /** THE PER-CONVERSATION FLOOR of the agent's refresh (`channels.
   *  agentRefreshFloorSec`, measured from the conversation's last fetch by
   *  ANYONE — so an agent cannot turn itself into a poll loop): the refusal
   *  with its number and the wait, or `null` past the floor. Judged by the
   *  drain, once per key per pass (r5). */
  function floorRefusal(key) {
    const t = now();
    const floor = agentRefreshFloorSec();
    const last = lastPollOf(key) || 0;
    if (!last || t - last >= floor * 1000) return null;
    const ago = Math.max(0, Math.round((t - last) / 1000));
    const wait = Math.max(1, Math.ceil((last + floor * 1000 - t) / 1000));
    return { ok: false, code: 'refresh-floor', error: `this conversation was refreshed ${ago} s ago (floor ${floor} s) — read it now, or refresh again in ${wait} s`, retryAfterSec: wait, polledAt: last, floorSec: floor };
  }

  // ── THE REFRESH REQUEST SET (lane R2 verify r5; r9: the PURE drain's) ───
  /**
   * A refresh is a REQUEST — `{id, key, origin, principal, at}` admitted into
   * the account's set by THE PURE DRAIN (`Drain.admit`, src/channel-drain.js
   * rule 1) — and a poke of the pass loop; NOTHING is judged here. The loop
   * (`pass`) asks `Drain.next` for every step: every gate once, per key, at
   * the first step that sees it; one fetch per key per round; every waiter
   * answered by the step that names it. Three rounds patched the caller's side
   * of this seam (r2: an answer from a foreign pass; r3: the back-off door;
   * r4: a pass per waiter) — the caller no longer has a side.
   *
   * Bounds, every one typed: at most REFRESH_QUEUE_CAP untaken waiters per
   * account (`refresh-queue-full`, the wait) — of which an agent may fill at
   * most CAP − REFRESH_OWNER_RESERVE, so the owner's press and a window's
   * open are never refused by an agent's storm (r6); a waiter the loop has
   * not answered within REFRESH_WAIT_MS hears `{ok, pending}` and leaves the
   * set (the fetch, if nobody else waits for it, is not made — nobody is
   * listening); an account rebuilt or removed while it waited hears
   * `account-changed`; an engine stopping hears `stopped`. Requests live in
   * MEMORY: a restart drops them (their HTTP calls fail with the connection) —
   * boot re-files none, so a restart never turns them into a burst of fetches.
   */
  /** The engine's `origin` words → the drain's (the owner's Refresh press is `owner`). */
  const DRAIN_ORIGIN = { refresh: 'owner', open: 'open', agent: 'agent' };
  let waiterSeq = 0;
  function requestRefresh(rec, e, key, { origin = 'refresh', principal = null } = {}) {
    if (stopped) return Promise.resolve({ ok: false, code: 'stopped', error: 'the channels engine is stopping — refresh again after the restart' });
    const id = ++waiterSeq;
    const who = principal && principal.id ? { kind: principal.kind || 'agent', id: principal.id } : null;
    const a = Drain.admit(e.dq, { id, key, origin: DRAIN_ORIGIN[origin] || 'agent', principal: who, at: now() });
    // THE CAP, with the owner's reserve (Drain rule 1; r6 verify): an agent's request is refused once the set holds CAP − RESERVE untaken waiters of ANY origin, the owner's press / a window's open only at CAP
    if (!a.ok) return Promise.resolve({ ok: false, code: 'refresh-queue-full', error: `${a.queued} refreshes of ${rec.label || rec.id} are already waiting — read what is there now, or try again in a moment`, retryAfterSec: 1, queued: a.queued, cap: a.cap });
    e.dq = a.snap;
    return new Promise((resolve) => {
      const w = { id, key, origin, principal: who, at: now(), settled: false, timer: null, outcome: undefined, resolve: null };
      w.resolve = (outcome) => {
        if (w.settled) return;
        w.settled = true;
        if (w.timer) { clearTimeout(w.timer); w.timer = null; }
        e.waiters.delete(id);
        e.dq = Drain.withdraw(e.dq, id);   // answered, or left by itself — gone from the drain either way
        resolve(outcome);
      };
      // the bound's timer is REFERENCED (r5 verify): a waiter held by a hung adapter must hear `pending` at the bound even in a process with nothing else to do — it is cleared the moment the waiter settles (its answer, a stop, a drop)
      w.timer = setTimeout(() => w.resolve({ ok: true, pending: true, polledAt: lastPollOf(key) }), REFRESH_WAIT_MS);
      e.waiters.set(id, w);
      pokeDrain(rec, e);
    });
  }
  /** Wake the loop for the requests: ONE pending drain pass per account (a
   *  burst of requests in one tick is one pass); a pass in flight takes them
   *  at its next step (`drainAfter` for its `finally`); an engine that stopped
   *  drains nothing (the requests were settled by `stop`). */
  function pokeDrain(rec, e) {
    if (stopped) return;
    // lane R5 verify: a pass ASLEEP on a pace wait (drain rule 18) is woken so the
    // model judges the new request at its next step NOW — a refusal (the floor, the
    // share, the back-off) or the owner's press never waits out the sleep (≤ 1 s);
    // the wait resumes for what is left of the bucket's shortfall
    if (e.passing) { e.drainAfter = true; wakeSleepers(e); return; }
    if (e.drainTimer) return;
    // the drain HOLDS the event loop (never unref'd): a process whose only pending work is an awaited refresh must not exit before the drain answers it
    e.drainTimer = setImmediate(() => {
      e.drainTimer = null;
      if (stopped || !Drain.hasRequests(e.dq)) return;
      pass(rec.id, { origin: 'request' }).catch((err) => log.warn(`[channels] ${rec.id}: refresh drain failed: ${(err && err.message) || err}`));
    });
  }
  /** Settle EVERY waiter of an entry — in the set AND held by a pass in
   *  flight — with one typed outcome (the account is gone / rebuilt / the
   *  engine stops) and drop its pending drain. */
  function settleRequests(e, outcome) {
    if (e.drainTimer) { clearImmediate(e.drainTimer); e.drainTimer = null; }
    for (const w of [...e.waiters.values()]) w.resolve(outcome);   // the set's AND the ones a running (or hung) pass holds — the pass's later answer is a no-op, its next step ends it (Drain rule 2)
  }
  /** THE ONE EXIT (lane R5 verify r4): every lifecycle end of an account's
   *  right to call the vendor — remove, disable, disconnect, an options
   *  rebuild, a client switch, a refused connect — retires the live entry
   *  HERE: its push lane disarmed, its waiters answered `account-changed` by
   *  name (never left hanging on an entry the next pass can no longer see),
   *  every pace sleeper woken so a queued call aborts by name (`paceWait`
   *  re-checks the entry after every await), the pass in flight ending at
   *  its next step and WRITING NOTHING more (`outlived`), the entry dropped.
   *  The account's BUCKETS outlive it in `paceCarry`: a call that passed the
   *  gate before the drop still meters into them, and the rebuilt entry
   *  inherits them — an exit never refills a bucket. The census in
   *  test-channels-aggregate ③g reads this file: `live.delete(` has this ONE
   *  site and every lifecycle verb takes it. */
  function dropLive(id, why) {
    const e = live.get(id);
    if (!e) return;
    disarmPush(e, why);
    live.delete(id);
    paceCarry.set(id, { record: e.record, win: e.win, exhaustedAt: e.exhaustedAt, paceTok: e.paceTok, paceRecent: e.paceRecent, paceInflight: 0, paceInflightAt: 0, paceLeakWarnAt: e.paceLeakWarnAt, chargeBy: null });
    settleRequests(e, { ok: false, code: 'account-changed', error: `the account changed while the refresh waited (${why}) — refresh again` });
    wakeSleepers(e);   // lane R5: a pace sleep of the dropped entry ends now (its pass settles on the next step)
  }
  /** Did the account's live entry end under this call (verify r4)? A fetch
   *  that outlives its entry — or the engine — WRITES NOTHING: no index row,
   *  no log page, no cache file for an account the owner just ended. */
  const outlived = (rec, e) => stopped || live.get(rec.id) !== e;
  /** r7: wait until an account has no pass in flight, none queued behind it,
   *  no drain pending and no request waiting (a suite's settle — an `ok` is
   *  delivered at its fetch now, so "every answer landed" ≠ "the pass ended"). */
  async function idle(adapterId) {
    const e = live.get(adapterId);
    if (!e) return;
    for (;;) {
      if (stopped) return;
      if (e.passing) { await e.passing.catch(() => {}); continue; }
      if (e.after) { await e.after.p.catch(() => {}); continue; }
      if (e.drainTimer || Drain.hasRequests(e.dq)) { await new Promise((r) => setImmediate(r)); continue; }
      return;
    }
  }
  /** The request set as a suite / a diagnostic reads it: the UNTAKEN waiters
   *  (what the cap counts), their keys, and how many a pass has taken (`held`). */
  function refreshQueueOf(adapterId) {
    const e = live.get(adapterId);
    if (!e) return { waiters: 0, keys: [] };
    const c = Drain.census(e.dq);
    return { waiters: c.waiters, agents: c.agents, keys: c.keys, held: c.held, draining: !!e.drainTimer, passing: !!e.passing };
  }

  /**
   * THE AGENT'S OWN REFRESH (`vibespace-channels refresh <conv>` / `read
   * --fresh`, design §6.5): reach FIRST (invisible = the uniform
   * not-found), then a REQUEST like every other refresh — the loop judges
   * the back-off, the agent share, the budget and the per-conversation floor
   * at drain time (r5; each refusal names its number and the wait). A drain
   * still running after 15 s answers `pending` (the request stays filed).
   */
  async function agentRefresh(ctx, adapterId, convId) {
    const { en, rec } = convFor(adapterId, convId);
    if (!en || !rec || rec.enabled === false) return ACL.notFound();
    if (!ACL.canSee(reachFor(ctx, rec, en).level)) return ACL.notFound();
    const e = adapterFor(rec);
    const r = await Promise.race([requestRefresh(rec, e, en.key, { origin: 'agent', principal: ctx }), new Promise((res) => { const tm = setTimeout(() => res({ ok: true, pending: true }), 15000); if (tm.unref) tm.unref(); })]);
    if (!stillSees(ctx, adapterId, convId)) return ACL.notFound();   // verify r2: the revoke may have landed while the refresh ran
    if (r && r.ok) return { ok: true, appended: r.appended || 0, pending: !!r.pending, polledAt: r.polledAt || null, conversation: { key: agentId(en.key), adapterId, id: agentId(convId), title: agentTitle(en, convId) } };   // verify r3 F6: the key + id as line pieces; verify r2 F4: the refresh answer's title through the belt (an agent-facing answer, whether or not the CLI prints it today)
    return r;
  }

  /** A window is OPEN on this conversation (its heartbeat, every ~60 s): it
   *  is HOT while the heartbeat lasts; a stale one is fetched at once, and a
   *  stale capability cache is re-asked (convCaps trigger ①). */
  async function watch(adapterId, convId) {
    const rec = adapterRecords().adapters.find((r) => r.id === adapterId);
    if (!rec || !known(adapterId, convId)) return { ok: false, code: 'not-found', error: 'No such conversation' };
    const key = `${adapterId}/${convId}`;
    const t = now();
    const was = isWatched(key, t);
    watching.set(key, t + WATCH_TTL_MS);
    for (const [k, exp] of watching) if (exp <= t) watching.delete(k);
    const en = store.index.peek(key) || {};
    const last = Number(en.lane && en.lane.lastPollAt) || 0;
    let fetched = false;
    // a window opened during a vendor back-off is hot (it is watched) but does
    // not poke the vendor — the timer resumes at `nextAt` (r3). `fetched` says
    // whether a REQUEST was filed; the drain alone judges whether it is fetched (r5)
    if (rec.enabled !== false && !inBackoff(adapterFor(rec)) && (!last || t - last > tiers().hotSec * 1000)) {
      fetched = true;
      refresh(adapterId, convId, { origin: 'open' }).catch((err) => log.warn(`[channels] ${key}: refresh on open failed: ${(err && err.message) || err}`));
    }
    if (!was) {
      const cc = caps.convCapsState(effectiveConvCaps(rec, en), t);
      if (rec.enabled !== false && (cc.why === 'stale' || cc.why === 'unknown' || cc.read === 'unknown')) refreshConvCaps(adapterId, convId).then(() => notify([key])).catch(() => {});
      notify([key]);   // the chip says hot now
    }
    return { ok: true, hotUntil: t + WATCH_TTL_MS, fetched };
  }

  /**
   * HISTORY ON DEMAND (the window scrolled past the local log's start): the
   * local page first; what it lacks is asked of the adapter's `older` (only
   * where `caps.olderHistory === 'page'`), PREPENDED to the log (one rewrite,
   * order kept, dedup as always) and NEVER sent through the wake funnel —
   * backfill is not news. Honest: `exhausted` = the vendor has nothing older;
   * `vendorHasNoOlder` = this adapter cannot page back (Gmail: a thread's
   * first walk is the whole thread).
   *
   * THE SERVER BELT (lane channel-render verify r6, 2026-09-27 — drain rule
   * 19): whatever a client does, per conversation the vendor is asked ONCE at
   * a time (a second ask JOINS the flight and reads the log it filled), at
   * most once per OLDER_FLOOR_MS (`refused: 'older-floor'` with the wait,
   * the local page still answered), and never again for what it answered
   * `exhausted` (remembered on the live entry until a record is appended — by
   * the poll ingest OR the push lane, the two writers of one log (verify r7:
   * r6 wired the poll's append alone; test-channels-engine ⑭ ⑧ + its control) —
   * the owner's Refresh, a re-authorization — `olderChanged` — or the memory's
   * TTL). Reproduced before it: 20 concurrent /older = 20 vendor calls for
   * one page; 16 wasted calls in 2 s after `exhausted`; the minute budget the
   * only bound. Judged BEFORE the budget — a joined or remembered answer
   * costs no unit; rule 9 (the minute) and rule 18 (the adapter's pace) stay
   * the outer caps.
   */
  /** Rule 19's memory for one conversation, on the account's live entry (dies with it). */
  function olderMemOf(e, convId) {
    if (!e.older) e.older = new Map();
    let m = e.older.get(convId);
    if (!m) { m = Drain.olderEmpty(); e.older.set(convId, m); }
    return m;
  }
  const olderFlights = new Map();   // `${adapterId}/${convId}` → the vendor ask in flight (the promise a joiner awaits)
  /** The conversation CHANGED (a record appended, a refresh, a re-authorization): its `exhausted` memory is forgotten. */
  function olderChanged(e, convId) {
    if (!e || !e.older || !e.older.has(convId)) return;
    e.older.set(convId, Drain.olderApply(e.older.get(convId), 'changed', now()));
  }
  async function loadOlder(adapterId, convId, { before = null, beforeId = null, limit = null } = {}) {
    const rec = adapterRecords().adapters.find((r) => r.id === adapterId);
    if (!rec || !known(adapterId, convId)) return { ok: false, code: 'not-found', error: 'No such conversation' };
    const n = Math.min(200, Math.max(1, Number(limit) || historyPageSize()));
    const key = `${adapterId}/${convId}`;
    let joined = false;
    for (;;) {
      const local = store.readTail(adapterId, convId, { before, beforeId, limit: n });
      if (local.length >= n) return { ok: true, records: withView(rec, local, { convId }), source: joined ? 'joined' : 'local', fetched: 0, exhausted: false };
      const c = registry.capsOf(rec.kind);
      if (c.olderHistory !== 'page' || rec.enabled === false) return { ok: true, records: withView(rec, local, { convId }), source: 'local', fetched: 0, exhausted: true, vendorHasNoOlder: c.olderHistory !== 'page' };
      const e = adapterFor(rec);
      let v = Drain.olderVerdict(olderMemOf(e, convId), now());
      if (v.act === 'join') {
        // ONE FLIGHT PER CONVERSATION: wait for it, then read the log it filled (never wait twice — an ask that
        // started after our join is refused by the floor like any second ask)
        if (!joined) { joined = true; const f = olderFlights.get(key); if (f) { try { await f; } catch {} } continue; }
        v = { act: 'floor', retryAfterMs: Drain.OLDER_FLOOR_MS };
      }
      if (v.act === 'exhausted') return { ok: true, records: withView(rec, local, { convId }), source: 'memory', fetched: 0, exhausted: true, vendorHasNoOlder: false };
      if (v.act === 'floor') {
        const s = Math.max(1, Math.ceil(v.retryAfterMs / 1000));
        return { ok: true, refused: 'older-floor', code: 'older-floor', error: `older history of this conversation was asked from the vendor less than ${Math.ceil(Drain.OLDER_FLOOR_MS / 1000)} s ago — try again in ${s} s`, retryAfterMs: v.retryAfterMs, retryAfterSec: s, records: withView(rec, local, { convId }), source: 'local', fetched: 0, exhausted: false };
      }
      if (!affordable(rec, e)) return { ...budgetRefusal(rec, e), ok: true, refused: 'vendor-budget', records: withView(rec, local, { convId }), source: 'local', fetched: 0, exhausted: false };
      const oldest = local.length ? local[0] : (before !== null && before !== undefined ? { at: Number(before), vendorId: beforeId || null } : store.oldestRecord(adapterId, convId));
      // THE FLIGHT: the memory says `ask` in the same synchronous step the promise is filed — a second caller in
      // this instant sees `inflight` and joins
      e.older.set(convId, Drain.olderApply(olderMemOf(e, convId), 'ask', now()));
      const flight = (async () => {
        try {
          const r = await vendor(rec, e, () => e.adapter.older(convId, { before: oldest ? { at: Number(oldest.at), vendorId: oldest.vendorId || null } : null, limit: n - local.length }));
          if (outlived(rec, e)) throw new ChannelError('account-changed', 'the account changed while the page was fetched — nothing was kept', { retryable: true });
          const w = store.prependRecords(adapterId, convId, r.records || []);
          e.older.set(convId, Drain.olderApply(olderMemOf(e, convId), { type: 'landed', exhausted: !!r.exhausted }, now()));
          return { r, w };
        } catch (err) { e.older.set(convId, Drain.olderApply(olderMemOf(e, convId), 'failed', now())); throw err; }   // the flight ended without an answer: nothing remembered, the floor's clock kept
      })();
      olderFlights.set(key, flight);
      let landed;
      try { landed = await flight; }
      catch (err) { return { ok: false, code: err instanceof ChannelError ? err.code : 'vendor-error', error: String((err && err.message) || err), records: local }; }
      finally { if (olderFlights.get(key) === flight) olderFlights.delete(key); }
      const { r, w } = landed;
      const again = store.readTail(adapterId, convId, { before, beforeId, limit: n });
      const cutoff = now() - 90 * 86400e3;
      return { ok: true, records: withView(rec, again, { convId }), source: 'vendor', fetched: (r.records || []).length, appended: w.appended, exhausted: !!r.exhausted, truncated: (r.records || []).some((x) => Number(x.at) < cutoff) };
    }
  }

  /**
   * ONE ATTACHMENT, fetched on demand (design §6.5; R3 §23): the steps are
   * PURE `Att.fetchVerdict`'s, asked as the facts are learned —
   *   1. CACHE FIRST — a cached file is served whatever the budget says;
   *   2. a REMEMBERED refusal (a vendor answer, `Att.negativeTtlMs`) answers
   *      with no second vendor call — a window of gone images re-opened is
   *      not a request per image per open; `retry` (the person's Retry) skips it;
   *   3. the record that carries it is FOUND in this conversation's log — by
   *      its message (`msg` = the vendorId, a direct look-up however old)
   *      first, else in the newest 5000 records; an id no record of ours names
   *      is refused (the route is not a proxy for arbitrary vendor keys);
   *   4–8. fetchable (`caps.attachments`), the account enabled, a fetch in
   *      flight JOINED (single-flight: one vendor call, one charge), never in
   *      the vendor's back-off (a pass's, or an attachment's own rate limit),
   *      never past the minute's budget;
   *   9. the adapter fetches it (charged to the budget) and the store writes
   *      it 0600 into the account's LRU cache, evicting down to
   *      `channels.attachmentBudgetMB`.
   * Serving it — nosniff, sandbox CSP, `attachment` unless a raster image — is
   * the route's. Every refusal is typed (`code`, `retryAfterSec` where a wait
   * fixes it) — the window's thumbnail says it, never a silent chip.
   */
  const attInflight = new Map();   // `${adapterId}/${convId}/${attId}` -> Promise of the answer
  const attRefused = new Map();    // same key -> {code, error, retryAfterSec, until} (a VENDOR's refusal, remembered)
  function rememberedRefusal(k, t = now()) {
    const r = attRefused.get(k);
    if (!r) return null;
    if (r.until <= t) { attRefused.delete(k); return null; }
    return r;
  }
  function ownerRecordOf(adapterId, convId, attId, msg) {
    const has = (r) => r && Array.isArray(r.attachments) && r.attachments.some((a) => a && String(a.id) === String(attId));
    if (msg) {
      const byMsg = typeof store.findRecord === 'function' ? store.findRecord(adapterId, convId, String(msg)) : null;
      if (byMsg && has(byMsg)) return byMsg;
    }
    const recs = store.readTail(adapterId, convId, { limit: 5000 });
    return recs.find((r) => (!msg || String(r.vendorId) === String(msg)) && has(r)) || null;
  }
  /**
   * A MESSAGE'S FORMATTED BODY, KEPT AT INGEST (lane channel-rich, D2): an
   * adapter that READ a part's bytes while normalizing (Gmail's text/html —
   * the thread read `format=full` carries it) holds them for a moment
   * (`heldAttachment(messageId, attId)` — taken once); the engine writes them
   * into the attachment cache the moment the record is durable, so the
   * window's formatted view costs ZERO vendor units and survives a restart.
   * Only `role: 'body'` attachments — never a picture (pictures stay on
   * demand, test-vendor-whitelist §7). Best effort: a failed write leaves the
   * route's on-demand fetch.
   */
  async function persistHeldBodies(rec, e, convId, fresh) {
    const take = e && e.adapter && typeof e.adapter.heldAttachment === 'function' ? e.adapter.heldAttachment : null;
    if (!take) return;
    for (const r of fresh) {
      for (const a of Array.isArray(r && r.attachments) ? r.attachments : []) {
        if (!a || a.role !== 'body') continue;
        const h = take(r.vendorId, a.id);
        if (!h || !h.data) continue;
        try {
          if (store.attachmentGet(rec.id, convId, a.id)) continue;
          await store.attachmentPut(rec.id, convId, a.id, { data: h.data, name: peerName(a.name, 256) || null, mime: h.mime || a.mime || 'text/html' }, { budgetBytes: attachmentBudgetBytes() });
        } catch (err) { log.warn(`[channels] ${rec.id}: keeping the formatted body of ${r.vendorId} failed (${(err && err.message) || err}) — the window fetches it on demand`); }
      }
    }
  }
  async function attachment(adapterId, convId, attId, { msg = null, retry = false } = {}) {
    const rec = adapterRecords().adapters.find((r) => r.id === adapterId);
    if (!rec || !known(adapterId, convId)) return { ok: false, code: 'not-found', error: 'No such conversation' };
    const k = `${adapterId}/${convId}/${attId}`;
    const hit = store.attachmentGet(adapterId, convId, attId);
    const t = now();
    const remembered = rememberedRefusal(k, t);
    let v = Att.fetchVerdict({ cached: !!hit, remembered, retry: !!retry });
    if (v.act === 'serve') return { ok: true, file: hit.file, meta: hit.meta, cached: true };
    if (v.act === 'refuse') return { ok: false, code: v.code, error: remembered.error, retryAfterSec: remembered.retryAfterSec ? Math.max(1, Math.ceil((remembered.until - t) / 1000)) : undefined, remembered: true };
    if (retry) attRefused.delete(k);
    const owner = ownerRecordOf(adapterId, convId, attId, msg);
    const e = adapterFor(rec);
    const c = registry.capsOf(rec.kind);
    // lane channel-rich: a body the adapter still HOLDS from its ingest (zero vendor units) — written, then served
    const held = owner && e && e.adapter && typeof e.adapter.heldAttachment === 'function' ? e.adapter.heldAttachment(owner.vendorId, attId) : null;
    if (held && held.data) {
      const hatt = owner.attachments.find((a) => String(a.id) === String(attId)) || {};
      const put = await store.attachmentPut(adapterId, convId, attId, { data: held.data, name: peerName(hatt.name, 256) || null, mime: held.mime || hatt.mime || null }, { budgetBytes: attachmentBudgetBytes() });
      return { ok: true, file: put.file, meta: put.meta, cached: false, held: true };
    }
    v = Att.fetchVerdict({
      cached: false, remembered: null, owner: !!owner, fetchable: c.attachments === 'fetch', enabled: rec.enabled !== false,
      inflight: attInflight.has(k), backoff: inBackoff(e) || (Number(e.attBackoffUntil) || 0) > t, affordable: affordable(rec, e),
    });
    switch (v.act) {
      case 'join': return attInflight.get(k);
      case 'fetch': break;
      default:
        if (v.code === 'not-found') return { ok: false, code: 'not-found', error: 'no message in this conversation carries that attachment' };
        if (v.code === 'not-supported') return { ok: false, code: 'not-supported', error: `${rec.label || rec.id} can list attachments but not fetch them` };
        if (v.code === 'disabled') return { ok: false, code: 'disabled', error: `${rec.label || rec.id} is disabled` };
        if (v.code === 'backoff') {
          if (inBackoff(e)) return backoffRefusal(rec, e);
          const s = Math.max(1, Math.ceil(((Number(e.attBackoffUntil) || 0) - t) / 1000));
          return { ok: false, code: 'backoff', error: `the vendor rate-limited this account's last attachment fetch — it is tried again in ${s} s`, retryAfterSec: s, lastCode: 'rate-limited' };
        }
        return budgetRefusal(rec, e);
    }
    const att = owner.attachments.find((a) => String(a.id) === String(attId));
    const run = (async () => {
      let r;
      try { r = await vendor(rec, e, () => e.adapter.fetchAttachment(convId, { messageId: owner.vendorId, attachmentId: attId, mime: att.mime || null, name: att.name || null })); }
      catch (err) {
        const code = err instanceof ChannelError ? err.code : 'vendor-error';
        const retryAfterSec = Number(err && err.detail && err.detail.retryAfterSec) || null;
        const ttl = Att.negativeTtlMs(code, { retryAfterSec });
        const error = String((err && err.message) || err);
        // integration 2.369.192 (R3 × R5): a call the account's END aborted (R5's dropLive — a disable, a disconnect, a new
        // sign-in: "the account changed") is NOT the vendor's refusal — an answer that outlived its entry keeps nothing, the
        // negative cache included (else the next ask read a remembered `transport` before the account's own `disabled`)
        const ended = outlived(rec, e);
        if (ttl && !ended) attRefused.set(k, { code, error, retryAfterSec: Att.TRANSIENT.includes(code) || code === 'vendor-error' ? Math.ceil(ttl / 1000) : null, until: now() + ttl });
        // a rate limit is the ACCOUNT's, not this picture's: the other thumbnails of the render wait it out too
        if (code === 'rate-limited' && !ended) e.attBackoffUntil = now() + (ttl || Att.NEGATIVE_TTL.transient);
        return { ok: false, code, error, ...(Att.TRANSIENT.includes(code) || code === 'vendor-error' ? { retryAfterSec: Math.max(1, Math.ceil((ttl || Att.NEGATIVE_TTL.transient) / 1000)) } : {}) };
      }
      if (outlived(rec, e)) return { ok: false, code: 'account-changed', error: 'the account changed while the attachment was fetched — nothing was kept' }; // R5 verify: an answer that outlived its entry keeps nothing
      const data = r && Buffer.isBuffer(r.data) ? r.data : Buffer.from((r && r.data) || '');
      if (data.length > ATTACHMENT_MAX_BYTES) {
        attRefused.set(k, { code: 'too-large', error: 'too large', retryAfterSec: null, until: now() + Att.negativeTtlMs('too-large') });
        return { ok: false, code: 'too-large', error: `the attachment is ${Math.round(data.length / 1048576)} MB — larger than ${ATTACHMENT_MAX_BYTES / 1048576} MB` };
      }
      const put = await store.attachmentPut(adapterId, convId, attId, { data, name: peerName(att.name, 256) || peerName(r && r.name, 256) || null, mime: (r && r.mime) || att.mime || null }, { budgetBytes: attachmentBudgetBytes() });
      if (put.evicted.length) log.log(`[channels] ${adapterId}: attachment cache over ${Math.round(attachmentBudgetBytes() / 1048576)} MB — evicted ${put.evicted.length} least-recently-used file(s)`);
      return { ok: true, file: put.file, meta: put.meta, cached: false, evicted: put.evicted.length };
    })();
    attInflight.set(k, run);
    try { return await run; } finally { attInflight.delete(k); }
  }

  // ══ lane channel-threads (2026-09-28): THREADS + REACTIONS ═══════════════════════════════════════════
  // The owner: "我发现你似乎不支持 lark 的内嵌回复 (thread) 功能, 以及 reaction (附加在消息上的表情)". A message's
  // PLACE is derived from the log (PURE src/channel-thread.js), its REACTIONS folded from the side log (PURE
  // src/channel-reactions.js, invariant 8 of the store) — both at READ time, never stored on the message line.
  // Every metered read is drain rule 20 (PURE src/channel-drain.js): the reaction trickle for the OPEN window's
  // visible rows only, the thread walk on the pane's open; a REACTION NEVER OPENS A TURN (test-architecture §64).
  const THREAD_IX_RECORDS = 5000;
  const THREAD_IX_LRU = 32;
  const MSG_CONV_MAX = 200000;
  /** verify r1 (MONEY / the event loop): a reaction event that names a message this account never stored used to
   *  search the WHOLE account store — every message log read into memory and scanned — once per event, and a miss
   *  was never remembered (measured: 14.3 MiB read per event on a 12-conversation account, 717 MiB for 50 events on
   *  ONE unknown id). Lark delivers a reaction event for every message of every chat the bot is in, listed here or
   *  not, and a member can toggle one in a loop. A MISS is remembered (bounded, with a TTL — a message stored later
   *  is placed by the write hook's positive memo first) and the store search itself has a per-account budget per
   *  minute; past it an unplaceable event is dropped `message-unknown` (acked) with `why: 'locate-budget'` — the
   *  next list snapshot of that message is the truth for its counts anyway. */
  const MSG_MISS_MAX = 20000;
  const MSG_MISS_TTL_MS = 10 * 60e3;
  const LOCATE_PER_MIN = 30;
  const SIDE_PATCH_MAX = 50;
  const SIDE_NOTIFY_DEBOUNCE_MS = 250;
  const EMOJI_SET_TTL_MS = 6 * 3600e3;
  const THREAD_WALKS_KEPT = 200;
  const reactionsPerMin = () => Math.round(setting('channels.reactionsPerMin'));
  const reactionsTtlMs = () => setting('channels.reactionsTtlMin') * 60e3;
  const threadFloorMs = () => setting('channels.threadFloorSec') * 1000;
  /** `${adapterId}/${convId}` → { recs: Map<vendorId, record>, ix|null } — the newest THREAD_IX_RECORDS of a
   *  conversation and the index over them, LRU-bounded; kept current by the store's write hook. */
  const thIx = new Map();
  /** `${adapterId}\0${vendorId}` → convId — which conversation holds a message (a Lark reaction event names none). */
  const msgConv = new Map();
  const msgMiss = new Map();   // `${adapterId}\0${vendorId}` → the instant the store search found nothing (verify r1)
  const locateMinute = new Map();   // adapterId → [instants of store searches in the last 60 s]
  const noteMsgConv = (adapterId, convId, vendorId) => {
    const k = `${adapterId}\u0000${vendorId}`;
    if (msgConv.has(k)) msgConv.delete(k);
    msgConv.set(k, convId);
    if (msgMiss.size && msgMiss.has(k)) msgMiss.delete(k);
    if (msgConv.size > MSG_CONV_MAX) { const it = msgConv.keys(); for (let i = msgConv.size - MSG_CONV_MAX; i > 0; i--) msgConv.delete(it.next().value); }
  };
  /** THE STORE'S WRITE HOOK: an append feeds the caches its fresh records; a prepend / trim drops the thread index. */
  function onStoreWrite(adapterId, convId, what) {
    const k = `${adapterId}/${convId}`;
    const w = what || {};
    if (w.kind === 'append' || w.kind === 'prepend') for (const r of w.fresh || []) if (r && r.vendorId) noteMsgConv(adapterId, convId, String(r.vendorId));
    if (w.kind === 'append') {
      const c = thIx.get(k);
      if (c) { for (const r of w.fresh || []) if (r && r.vendorId) c.recs.set(String(r.vendorId), r); c.ix = null; }
    } else if (w.kind === 'prepend' || w.kind === 'trim') thIx.delete(k);
    else if (w.kind === 'place') {
      // lane lark-threads (A1): a stored record's place WIDENED (the store's one door) — the thread index re-derives from
      // the patched copies at once, and the widened topics are owed a walk + said to every window (`markPlaces`)
      const c = thIx.get(k);
      if (c) { for (const p of w.patched || []) { const r0 = c.recs.get(String(p.vendorId)); if (r0) c.recs.set(String(p.vendorId), Thr.applyPlace(r0, p)); } c.ix = null; }
      track(markPlaces(adapterId, convId, w.patched || []));
    }
  }
  /**
   * A WIDENED PLACE IS A THREAD OWED (lane lark-threads A1, 2026-10-01): every topic key the place door wrote is owed a
   * walk exactly as a feed-named key is (drain rule 20 via the timer — `threadOwed`, its reach = one recheck cadence
   * back: a reply older than that was never news), where replies are listed separately; and the roots' rows grow their
   * chip in every open window (`notifyThreads` — the result rides the broadcast, no reload). Capability-gated on the
   * threads row, never an adapter id.
   */
  async function markPlaces(adapterId, convId, patched) {
    const keys = [...new Set((patched || []).map((p) => p && p.threadKey).filter(Boolean).map(String))];
    if (!keys.length || stopped) return;
    const rec = adapterRecords().adapters.find((r) => r.id === adapterId);
    if (!rec) return;
    const separate = threadsRow(registry.capsOf(rec.kind)).listing === 'separate';
    if (separate) {
      const t = now();
      await store.index.update(() => {
        const en = store.index.entry(adapterId, convId, { create: false });
        if (!en || en.unlistedAt) return;
        const prevOwed = en.threadOwed;
        const mt = Feed.mergeThreadOwed(en.threadOwed, new Map(keys.map((x) => [x, t])));
        en.threadOwed = mt.marks;
        en.threadReach = Feed.mergeThreadReach(en.threadReach, prevOwed, keys, t - setting('channels.threadRecheckSec') * 1000, mt.marks);
      });
    }
    notifyThreads(adapterId, convId, keys);
  }
  /** The conversation's thread index (built from the newest THREAD_IX_RECORDS on first use), with `extra` records
   *  (an older page the window paged to) folded in so their places resolve too. */
  function threadIxOf(adapterId, convId, extra = null) {
    const k = `${adapterId}/${convId}`;
    let c = thIx.get(k);
    if (!c) {
      c = { recs: new Map(), ix: null };
      // the .197 integration (lane-redact's clear census): the log of a conversation this engine KNOWS (an index row) —
      // never another's; an unknown one's index is built from the records the caller hands (`extra`) alone
      // lane lark-threads (B2/B3): the records through the ONE view door — a quote's author, a pane's participants read the
      // owner's name / the vendor's way, never "app"
      const vrec = adapterRecords().adapters.find((x) => x.id === adapterId) || null;
      if (store.index.live()[k]) for (const r0 of store.readTail(adapterId, convId, { limit: THREAD_IX_RECORDS })) { const r = vrec ? viewOf(vrec, r0) : r0; if (r && r.vendorId) { c.recs.set(String(r.vendorId), r); noteMsgConv(adapterId, convId, String(r.vendorId)); } }
      thIx.set(k, c);
      if (thIx.size > THREAD_IX_LRU) thIx.delete(thIx.keys().next().value);
    } else { thIx.delete(k); thIx.set(k, c); }
    let added = false;
    for (const r of extra || []) if (r && r.vendorId && !c.recs.has(String(r.vendorId))) { c.recs.set(String(r.vendorId), r); added = true; }
    if (!c.ix || added) c.ix = Thr.threadIndex([...c.recs.values()], { convId });
    return c.ix;
  }
  /** The account's reaction vocabulary (the adapter's `reactionSet`, cached 6 h; a declaration for Lark and the
   *  fake — no vendor call). Asked in the background; a fold before it lands draws keys as `:key:`. */
  function vocabularyOf(rec, e) {
    if (!reactionsRow(registry.capsOf(rec.kind)).add) return null;
    const v = e.rxSet;
    if ((!v || now() - v.at > EMOJI_SET_TTL_MS) && !e.rxSetFlight) {
      e.rxSetFlight = e.adapter.reactionSet().then((set) => { e.rxSet = { set: set || null, at: now() }; }, (err) => { e.rxSet = { set: null, at: now(), error: (err && err.code) || 'vendor-error' }; }).finally(() => { e.rxSetFlight = null; });
    }
    return v && v.set ? v.set : null;
  }
  /** The members' names a snapshot's ids resolve against (the conversation's authors, a delta's own actor name). */
  function namesOf(adapterId, convId) {
    const en = store.index.live()[`${adapterId}/${convId}`];
    const m = new Map();
    for (const a of (en && Array.isArray(en.authors)) ? en.authors : []) if (a && a.id) m.set(String(a.id), peerName(String(a.name || ''), 200) || '');
    return m;
  }
  /** Fold the side log for these messages → Map<vendorId, the read-shape list>. */
  function reactionsFor(rec, convId, vids, { e = null, sides: given = null } = {}) {
    const out = new Map();
    const list = [...new Set((vids || []).map(String))].filter(Boolean);
    if (!rec || !list.length || reactionsRow(registry.capsOf(rec.kind)).read === 'none') return out;
    const ee = e || adapterFor(rec);
    const sides = given || store.readSide(rec.id, convId, { msgs: new Set(list) });   // ONE read per page (verify r1)
    if (!sides.length) return out;
    const by = new Map();
    for (const x of sides) { const k = String(x.msg); if (!by.has(k)) by.set(k, []); by.get(k).push(x); }
    const opts = { selfId: ee.adapter.selfId(), names: namesOf(rec.id, convId), vocabulary: vocabularyOf(rec, ee) };
    for (const [vid, xs] of by) { const f = Rx.foldReactions(xs.filter((x) => x.k === 'rx'), opts); if (f.length) out.set(vid, f); }
    return out;
  }
  /** A thread's walked stamp (the chip's "open to load" until a walk ran) — on the index entry, bounded. */
  const walkedAt = (en, key) => Number((en && en.threadWalks && en.threadWalks[key]) || 0) || null;
  /** THE CUT WALK'S STOP (verify r3): `threadCuts[key] = {stopAt, at}` beside `threadWalks`, bounded like it (the newest
   *  THREAD_WALKS_KEPT), FLUSHED at once — it must be on disk before the page that moves the derived anchor is appended
   *  (the index's own write is debounced; a crash inside the debounce would leave the hole this closes). */
  async function writeThreadCut(adapterId, convId, key, stopAt) {
    await store.index.update(() => {
      const en = store.index.entry(adapterId, convId, { create: false });
      if (!en) return;
      const tc = { ...(en.threadCuts && typeof en.threadCuts === 'object' ? en.threadCuts : {}), [key]: { stopAt: String(stopAt).slice(0, 512), at: now() } };
      const ks = Object.keys(tc).sort((a, b) => (Number(tc[b] && tc[b].at) || 0) - (Number(tc[a] && tc[a].at) || 0));
      en.threadCuts = Object.fromEntries(ks.slice(0, THREAD_WALKS_KEPT).map((x) => [x, tc[x]]));
    });
    try { store.index.flush(); } catch (err) { log.warn(`[channels] ${adapterId}/${convId}: the thread walk's stop was not flushed (it rides the next write): ${(err && err.message) || err}`); }
  }
  /**
   * THE READ SHAPE (spec §3.5): a page of records as the window reads it — `withBlocks` + each record's `place`
   * ({quote, thread}) + its `reactions` (the fold). `agent` = the agent's copy: no render tree, reactions WITHOUT
   * `by` (§6.4 — counts and "the account owner", never who), the place as words (`placeText`).
   */
  function withView(rec, records, { convId = null, agent = false } = {}) {
    // the agent's copy passes the same read-time view as the window's page (lane channel-rich: a bot's name, markup read)
    // — then agentCopy (lark-search-poll verify r3: withoutBlocks — no tree, no formatted body — and the frame rule +
    // the name door re-run on the way out); the window's page = withBlocks (which runs viewsOf itself)
    const base = agent ? viewsOf(rec, records).map(agentCopy) : withBlocks(rec, records);
    if (!rec || !base.length) return base;
    const cid = convId || (base[0] && base[0].convId);
    const c = registry.capsOf(rec.kind);
    const th = threadsRow(c), rxr = reactionsRow(c);
    let ix = null, rx = new Map(), sidesTh = new Map();
    try { if (th.read !== 'none') ix = threadIxOf(rec.id, cid, base); } catch (err) { log.warn(`[channels] ${rec.id}/${cid}: thread index failed: ${(err && err.message) || err}`); }
    try {
      // ONE side read per page (verify r1): the reactions and the thread stats come off the same lines
      const sides = (rxr.read !== 'none' || th.read !== 'none') ? store.readSide(rec.id, cid, { msgs: new Set(base.map((r) => r && String(r.vendorId))) }) : [];
      if (rxr.read !== 'none') rx = reactionsFor(rec, cid, base.map((r) => r && r.vendorId), { sides });
      if (th.read !== 'none') for (const x of sides) if (x.k === 'th') sidesTh.set(String(x.msg), x);
    } catch (err) { log.warn(`[channels] ${rec.id}/${cid}: the side log could not be read: ${(err && err.message) || err}`); }
    const en = store.index.live()[`${rec.id}/${cid}`];
    const separate = th.listing === 'separate';
    const t = now();
    return base.map((r) => {
      if (!r || !r.vendorId) return r;
      const out = { ...r };
      if (ix) {
        const place = Thr.placeOf(r, ix);
        if (place.thread) {
          const vs = place.thread.isRoot ? sidesTh.get(String(r.vendorId)) : null;
          if (vs) { const m = Thr.mergeThreadStats({ count: place.thread.count, lastAt: place.thread.lastAt, participants: [] }, vs); place.thread.count = m.count; place.thread.lastAt = m.lastAt; }
          if (separate) { const w = walkedAt(en, place.thread.key); place.thread.walked = !!w; place.thread.walkedAt = w; }
          place.thread.separate = separate;
        }
        if (place.quote || place.thread) out.place = place;
        if (agent && (place.quote || place.thread)) { const w = Thr.agentPlaceLine(place, { now: t }); out.placeText = w; }
      }
      const list = rx.get(String(r.vendorId));
      if (list && list.length) out.reactions = agent ? Rx.forAgent(list) : list;
      if (agent && list && list.length) out.reactionsText = Rx.agentReactionsLine(list);
      return out;
    });
  }

  // ── the SIDE broadcast: ONE per batch, the RESULT pushed (the cache-invalidation law) ──
  const sideBatch = new Map();   // `${adapterId}/${convId}` → Set<vendorId>
  let sideTimer = null;
  /** A side change on these messages: batched (a burst of reaction events is ONE broadcast), then each changed
   *  message's FOLDED list rides the broadcast (`patches`, ≤ SIDE_PATCH_MAX per conversation — past it the
   *  window re-reads the page, `rereadReactions`). */
  function notifySide(adapterId, convId, msgs) {
    const k = `${adapterId}/${convId}`;
    if (!sideBatch.has(k)) sideBatch.set(k, new Set());
    for (const m of msgs || []) sideBatch.get(k).add(String(m));
    if (sideTimer || stopped) return;
    sideTimer = setTimeout(flushSide, SIDE_NOTIFY_DEBOUNCE_MS);
    if (sideTimer.unref) sideTimer.unref();
  }
  function flushSide() {
    sideTimer = null;
    const batch = [...sideBatch]; sideBatch.clear();
    if (!batch.length || stopped) return;
    const patches = {}, reread = [];
    for (const [k, set] of batch) {
      const i = k.indexOf('/');
      const adapterId = k.slice(0, i), convId = k.slice(i + 1);
      const rec = adapterRecords().adapters.find((r) => r.id === adapterId);
      if (!rec || !store.index.live()[k]) continue;
      const ids = [...set];
      if (ids.length > SIDE_PATCH_MAX) { reread.push(k); continue; }
      let folded = new Map();
      try { folded = reactionsFor(rec, convId, ids); } catch (err) { log.warn(`[channels] ${k}: reactions fold failed: ${(err && err.message) || err}`); continue; }
      patches[k] = {};
      for (const id of ids) patches[k][id] = { reactions: folded.get(id) || [] };
      try { reactionDigest(rec, convId, ids, folded); } catch (err) { log.warn(`[channels] ${k}: the reaction digest failed: ${(err && err.message) || err}`); }
    }
    const keys = [...Object.keys(patches), ...reread];
    if (keys.length) notify(keys, { full: false, extra: { patches, rereadReactions: reread } });
  }
  /**
   * THE REACTION DIGEST (spec §5.4): reactions on a message an AGENT SENT from here become ONE line in that agent's
   * NEXT-TURN STASH (the free lane — `stashFor`, never the ladder, never a wake: a reaction never opens a turn,
   * test-architecture §64) — `👍 ×3 · 🎉 ×1 on your reply in <conversation>`. At most one line per message per hour
   * (and only when the fold changed), at most RX_DIGEST_CONV_MAX of this conversation's lines held at once, and
   * DROPPED — never held, never evicting another entry — when the agent's stash is at its cap.
   */
  const RX_DIGEST_MSG_MS = 3600e3;
  const RX_DIGEST_CONV_MAX = 5;
  const RX_DIGEST_STASH_CAP = 30;
  const RX_DIGEST_FROM = require('../stash-summary.js').REACTION_DIGEST_FROM;   // spelled ONCE (the strip + the injection read it)
  const rxDigested = new Map();   // `${adapterId}/${convId}#${vendorId}` → {at, sig}
  function reactionDigest(rec, convId, ids, folded) {
    if (!deliver || typeof deliver.stashFor !== 'function') return;
    const en = store.index.live()[`${rec.id}/${convId}`];
    const sentBy = en && en.sentBy && typeof en.sentBy === 'object' ? en.sentBy : null;
    if (!sentBy) return;
    const whose = new Map();
    for (const [pk, list] of Object.entries(sentBy)) if (pk.startsWith('agent:')) for (const v of Array.isArray(list) ? list : []) whose.set(String(v), pk.slice(6));
    if (!whose.size) return;
    const t = now();
    const tag = inertFrames(`(${rec.id}/${convId})`);
    const title = agentText(en.title || convId, { kind: 'line', max: 120 });   // lane peer-census: a vendor title as one inline piece
    // verify r1 (continued, IDENTITY): REACH FIRST, like every agent-facing path — the digest is new information
    // FROM the conversation (who else reacts to the agent's old message, how many, the title), so an agent whose
    // access the owner removed after it sent hears nothing more from here (it used to keep receiving counts)
    const reach = new Map();
    const mayHear = (cid) => {
      if (!reach.has(cid)) {
        let ok = false;
        try { ok = ACL.canSee(reachFor({ kind: 'agent', id: cid, name: null, groups: groupsOfSession(cid), msgLevelFor: () => 'none' }, rec, en).level); } catch { ok = false; }
        reach.set(cid, ok);
      }
      return reach.get(cid);
    };
    for (const vid of ids) {
      const cid = whose.get(String(vid));
      if (!cid) continue;
      if (!mayHear(cid)) continue;
      const list = folded.get(vid) || [];
      const sig = list.map((x) => `${x.key}:${x.count}`).join(',');
      const mk = `${rec.id}/${convId}#${vid}`;
      const prev = rxDigested.get(mk);
      if (!sig || (prev && (prev.sig === sig || t - prev.at < RX_DIGEST_MSG_MS))) continue;
      let held = [];
      try { held = typeof deliver.stashPeek === 'function' ? deliver.stashPeek(cid) || [] : []; } catch { held = []; }
      if (held.length >= RX_DIGEST_STASH_CAP) { log.log(`[channels] ${rec.id}/${convId}: a reaction digest for ${cid} was dropped — its next-turn queue is full`); continue; }
      if (held.filter((x) => x && x.fromName === RX_DIGEST_FROM && String(x.text || '').endsWith(tag)).length >= RX_DIGEST_CONV_MAX) continue;
      const line = Rx.reactionDigestLine(list, { title });
      if (!line) continue;
      rxDigested.set(mk, { at: t, sig });
      if (rxDigested.size > 5000) rxDigested.delete(rxDigested.keys().next().value);
      try { deliver.stashFor(cid, { source: 'channel', kind: 'notification', fromName: RX_DIGEST_FROM, text: `${line} — message ${inertFrames(String(vid).slice(0, 200))} ${tag}`, about: stashAbout({ keys: [`${rec.id}/${convId}`], cid }) }); }
      catch (err) { log.warn(`[channels] ${rec.id}/${convId}: a reaction digest could not be stored for ${cid}: ${(err && err.message) || err}`); }
    }
  }
  /** A thread changed (a reply appended into it, a walk landed): the roots' chips are re-spelled in place. */
  function notifyThreads(adapterId, convId, keys) {
    const k = `${adapterId}/${convId}`;
    if (!keys || !keys.length || stopped) return;
    let ix = null;
    try { ix = threadIxOf(adapterId, convId); } catch { return; }
    const threads = { [k]: {} };
    // lane lark-threads: + whether the thread was ever walked and whether its replies are listed separately — a root that
    // just became a topic (the place door) grows "in thread · open to load" until its walk lands, never "0 replies"
    const en = store.index.live()[k];
    const rec = adapterRecords().adapters.find((r) => r.id === adapterId);
    const separate = !!rec && threadsRow(registry.capsOf(rec.kind)).listing === 'separate';
    for (const tk of keys) { const e2 = ix.threads.get(tk); if (e2) threads[k][tk] = { count: e2.count, lastAt: e2.lastAt, root: e2.root, walked: !separate || !!walkedAt(en, tk), separate }; }
    notify([k], { full: false, extra: { threads } });
  }

  /** A thread / reaction control's offer — the cached verdict unknown or stale (never resolved, or older than
   *  its TTL) is resolved ONCE first (one chat lookup, the pattern a proposal follows), then asked again. */
  async function offerNow(rec, adapterId, convId, what) {
    const c = registry.capsOf(rec.kind);
    const en0 = store.index.live()[`${adapterId}/${convId}`];
    let o = caps.offers(c, effectiveConvCaps(rec, en0), what, now());
    if (!o.offered && (o.why === 'unknown' || o.why === 'stale') && rec.enabled !== false) {
      try { await refreshConvCaps(adapterId, convId); } catch (err) { log.warn(`[channels] ${adapterId}/${convId}: convCaps refresh for ${what} failed: ${(err && err.message) || err}`); }
      o = caps.offers(c, effectiveConvCaps(rec, store.index.live()[`${adapterId}/${convId}`]), what, now());
    }
    return o;
  }
  /** Is this conversation ours and its account alive? → {rec, e, c} | a typed refusal. */
  function convOr404(adapterId, convId) {
    const rec = adapterRecords().adapters.find((r) => r.id === adapterId);
    if (!rec || !known(adapterId, convId)) return { refusal: { ok: false, code: 'not-found', error: 'No such conversation' } };
    return { rec, e: adapterFor(rec), c: registry.capsOf(rec.kind) };
  }
  const thMemOf = (e, key) => { if (!e.th) e.th = new Map(); return e.th.get(key) || Drain.rxEmpty(); };
  /** quote-vs-topic (owner 2026-09-28): the TOPIC a message — or a topic's own key — names, through THE classifier
   *  (`Thr.placeKindOf`, the one the window's chip / tag read): `{key}`; `{key: null, quote: true}` = a message the
   *  index holds in a reply CHAIN (a quoted reply, or the message quotes answer) — it has no thread to read or load;
   *  `{key: null}` = a message this conversation's log does not hold. */
  function topicKeyOf(ix, id) {
    const c = Thr.placeKindOf(id, ix);
    if (c.topic) return { key: c.topic };
    const e = ix.threads.get(id);
    if (e && e.kind === 'vendor') return { key: id };
    return { key: null, quote: !!(e || ix.byRecord.has(id)) };
  }
  const NOT_A_THREAD = 'that message is not in a thread — a quoted reply and the message it quotes are both shown in the conversation itself (read the conversation)';
  const thFlights = new Map();   // `${adapterId}/${convId}#${threadKey}` → the walk in flight

  /**
   * ONE THREAD (spec §9 `GET …/thread/:msg`): the root + its replies from the LOCAL log (never a vendor call).
   * `msg` names the root — or any reply (its thread answers). A message the log does not hold is
   * `thread-not-loaded` (records [], walked:false — the pane says "opening it loads it" and asks refresh).
   */
  function threadRead(adapterId, convId, msg, { limit = 50, before = null, beforeId = null, agent = false } = {}) {
    const g = convOr404(adapterId, convId);
    if (g.refusal) return g.refusal;
    const { rec, c } = g;
    if (threadsRow(c).read === 'none') return { ok: false, code: 'not-supported', error: `${rec.label || rec.id} has no threads` };
    const ix = threadIxOf(adapterId, convId);
    const id = String(msg || '');
    const tk = topicKeyOf(ix, id);
    const key = tk.key;
    const en = store.index.live()[`${adapterId}/${convId}`];
    const separate = threadsRow(c).listing === 'separate';
    if (!key) return { ok: true, code: tk.quote ? 'not-a-thread' : 'thread-not-loaded', thread: { key: null, kind: null, root: id, count: 0, lastAt: null, participants: [], walked: false, walkedAt: null, separate }, records: [], exhausted: true };
    const recs = [];
    const cc = thIx.get(`${adapterId}/${convId}`);
    if (cc) recs.push(...cc.recs.values());
    const v = Thr.threadView(recs, key, { limit: Math.min(200, Math.max(1, Number(limit) || 50)), before: before !== null && before !== undefined ? { at: Number(before), vendorId: beforeId || '' } : null, convId });
    const th = v.thread || ix.threads.get(key);
    const w = walkedAt(en, key);
    return {
      ok: true,
      thread: { key, kind: th.kind, root: th.root, count: th.count, lastAt: th.lastAt, participants: th.participants, walked: !separate || !!w, walkedAt: w, separate },
      records: withView(rec, v.records, { convId, agent }), exhausted: v.exhausted,
    };
  }
  /**
   * THE THREAD WALK (spec §3.1 / drain rule 20a, `POST …/thread/:msg/refresh`): the vendor's replies of ONE thread,
   * paged to the thread's own anchor (the newest reply the log holds), appended to the CONVERSATION's log. Only
   * where replies are NOT in the listing (`threads.listing === 'separate'`); one flight per thread, a per-thread
   * floor, the vendor back-off and the minute's budget first. Charged to the owner's window (origin `open`).
   */
  async function threadRefresh(adapterId, convId, msg, { older = false, depth = null, by = 'owner', vendorNamed = false } = {}) {
    const g = convOr404(adapterId, convId);
    if (g.refusal) return g.refusal;
    const { rec, e, c } = g;
    if (threadsRow(c).listing !== 'separate') return { ok: false, code: 'not-supported', error: `${rec.label || rec.id} lists thread replies with the conversation — there is nothing to walk` };
    if (rec.enabled === false) return { ok: false, code: 'disabled', error: `${rec.label || rec.id} is disabled` };
    const ix = threadIxOf(adapterId, convId);
    const id = String(msg || '');
    // THE KEY IS THIS CONVERSATION'S (verify r1, IDENTITY): a thread is walked only under a key the conversation's
    // own index names — a record's thread, or a thread key its members declare (a root not loaded is still named
    // by its replies). A raw id the log never saw is NEVER handed to the vendor: Lark answers a thread listing by
    // `container_id` whatever chat the caller named, so `refresh X --thread <omt_ of chat Y>` walked Y's replies
    // into X's log, where a principal with reach on X alone read them. Refused by name, no vendor call.
    // `vendorNamed` = the TWO internal callers whose key is the vendor's own answer: a reply sent INTO this conversation
    // (a `reply_in_thread` on a plain message mints a thread the log cannot know yet) and a thread the change feed's
    // search NAMED in this conversation (lane lark-search-poll, rule 21) — never a route's
    const tk = topicKeyOf(ix, id);
    // quote-vs-topic (2026-09-28): a QUOTE (a reply chain) has no thread to load — refused by name, no vendor call
    if (!tk.key && tk.quote && vendorNamed !== true) return { ok: false, code: 'not-a-thread', error: NOT_A_THREAD, walked: false };
    const key = tk.key || (vendorNamed === true ? id : null);
    if (!key) return { ok: false, code: 'thread-not-loaded', error: 'this conversation holds no message of that thread — nothing to walk here', walked: false };
    const fk = `${adapterId}/${convId}#${key}`;
    const v = Drain.threadVerdict(thMemOf(e, fk), now(), threadFloorMs());
    if (v.act === 'join') { const f = thFlights.get(fk); if (f) { try { await f; } catch { } } return { ok: true, joined: true, appended: 0, walked: true }; }
    if (v.act === 'floor') { const s = Math.max(1, Math.ceil(v.retryAfterMs / 1000)); return { ok: false, code: 'thread-floor', error: `this thread was loaded from the vendor less than ${Math.round(threadFloorMs() / 1000)} s ago — try again in ${s} s`, retryAfterSec: s }; }
    if (inBackoff(e)) return backoffRefusal(rec, e);
    if (!affordable(rec, e)) return budgetRefusal(rec, e);
    // the anchor: the newest reply the log holds in this thread (a walk stops there); `older` = walk past it
    const th = ix.threads.get(key);
    const anchor = older || !th || !th.replies.length ? null : th.replies[th.replies.length - 1];
    // THE CUT WALK'S STOP (verify r3, MONEY/completeness — the r2 held LOW): the anchor above is DERIVED from the log,
    // and a walk appends page by page, so a walk cut mid-way (a transport error, the budget, MAX_PAGES) moved it past a
    // range it never read; the continuation lived only in the adapter's memory (Lark `walks`, 5 min), and after a
    // restart that range was never walked (measured: 200 of the 250 replies, for good). The walk's own stop is now
    // PERSISTED before the first page that moves the derived anchor (`threadCuts[key]`, beside `threadWalks`; the
    // conversation walk's log-before-anchor order) and cleared only by a COMPLETE walk; while it stands every walk hands
    // it to the adapter as `stopAt` — the adapter's own in-memory continuation still wins (one call), and a fresh adapter
    // (a restart) walks from the newest back to it (bounded by the adapter's first-ingest bound, like an uncut walk).
    const en0 = store.index.peek(`${adapterId}/${convId}`) || {};
    const cut0 = !older && en0.threadCuts && typeof en0.threadCuts === 'object' && en0.threadCuts[key] && typeof en0.threadCuts[key].stopAt === 'string' ? en0.threadCuts[key].stopAt : null;
    e.th.set(fk, Drain.threadApply(thMemOf(e, fk), 'ask', now()));
    // lane lark-search-poll: a walk the change feed named runs on the TIMER's charge (rule 20a's exception)
    const prevBy = e.chargeBy; e.chargeBy = by === 'agent' ? 'agent' : by === 'timer' ? 'timer' : 'owner';
    const walkStartedAt = now();   // the as-of instant — the walked stamp and the owed mark read it
    const flight = (async () => {
      let appended = 0, pages = 0, walkAnchor = anchor, foreign = 0, complete = false, cutWritten = !!cut0, bounded = false;
      const fresh = [];
      const stopAt = cut0 || anchor;
      try {
        for (;;) {
          // `older` (verify r3): a walk from the newest PAST the replies the log holds — `depth` = what it holds + one page
          // (the adapter clamps it to its own bound); a first walk takes one page
          const firstMax = older && Number(depth) > 0 ? Math.floor(Number(depth)) : historyPageSize();
          const r = await vendor(rec, e, () => e.adapter.threadHistory(convId, key, { anchor: walkAnchor, limit: historyPageSize(), ...(walkAnchor ? {} : { initialMax: firstMax }), ...(cut0 ? { stopAt: cut0 } : {}) }));
          if (outlived(rec, e)) throw new ChannelError('transport', 'the account changed while the thread was fetched — nothing was kept', { retryable: true, detail: { accountChanged: true } });
          // THE BELT (verify r1): a walk record is a message of THIS conversation by the adapter's own word — one
          // stamped with another conversation (the vendor named another chat) is dropped, counted, never appended
          const ours = (r.records || []).filter((x) => x && (x.convId === undefined || x.convId === null || String(x.convId) === String(convId)));
          foreign += (r.records || []).length - ours.length + (Number(r.foreign) || 0);
          const last = !!(r.reachedAnchor && r.complete);
          // the stop is durable BEFORE a page that is not the walk's last moves the derived anchor (a crash after it
          // leaves the stop; a crash before it appended nothing)
          if (!last && !cutWritten && stopAt && ours.length) { await writeThreadCut(adapterId, convId, key, stopAt); cutWritten = true; }
          ours.placeSrc = 'walk';   // verify r1 F6: a side line this walk's repeated root writes names its source (it said `history`)
          const w = store.appendRecords(adapterId, convId, ours);
          appended += w.appended;
          if (Array.isArray(w.fresh)) fresh.push(...w.fresh);
          walkAnchor = r.anchor || walkAnchor;
          if (last) { complete = true; bounded = r.bounded === true; break; }
          if (++pages >= MAX_PAGES || !(r.records || []).length || !affordable(rec, e)) break;
        }
        e.th.set(fk, Drain.threadApply(thMemOf(e, fk), 'landed', now()));
      } catch (err) { e.th.set(fk, Drain.threadApply(thMemOf(e, fk), 'failed', now())); throw err; }
      finally { e.chargeBy = prevBy; }
      if (foreign) log.warn(`[channels] ${adapterId}/${convId}: the thread walk of ${key} answered ${foreign} message(s) of another conversation — dropped`);
      return { appended, fresh, foreign, complete: complete && !older, bounded, reachedStart: older && complete && !bounded };
    })();
    thFlights.set(fk, flight);
    let landed;
    try { landed = await flight; }
    catch (err) { return { ok: false, code: err instanceof ChannelError ? err.code : 'vendor-error', error: String((err && err.message) || err) }; }
    finally { if (thFlights.get(fk) === flight) thFlights.delete(fk); boundLiveMem(e); }
    // the walked stamp (bounded) + the index's derived half for what landed; ONE broadcast
    await store.index.update(() => {
      const en = store.index.entry(adapterId, convId, { create: false });
      if (!en) return;
      // lane lark-search-poll: the walked stamp is the walk's START (its as-of instant); a COMPLETE walk that started after
      // the feed saw the reply clears the thread's owed mark
      const tw = { ...(en.threadWalks && typeof en.threadWalks === 'object' ? en.threadWalks : {}), [key]: walkStartedAt };
      if (landed.complete && en.threadOwed && typeof en.threadOwed === 'object' && en.threadOwed[key] !== undefined && Feed.owedSatisfied(en.threadOwed[key], walkStartedAt, { skewMs: 0 })) { const m = { ...en.threadOwed }; delete m[key]; if (Object.keys(m).length) en.threadOwed = m; else delete en.threadOwed; if (en.threadReach && en.threadReach[key] !== undefined) { const r = { ...en.threadReach }; delete r[key]; if (Object.keys(r).length) en.threadReach = r; else delete en.threadReach; } }
      const ks = Object.keys(tw).sort((a, b) => tw[b] - tw[a]);
      en.threadWalks = Object.fromEntries(ks.slice(0, THREAD_WALKS_KEPT).map((x) => [x, tw[x]]));
      // a COMPLETE walk clears its cut stop (verify r3) — an incomplete one keeps it for the next walk
      if (landed.complete && en.threadCuts && typeof en.threadCuts === 'object' && en.threadCuts[key]) { const tc = { ...en.threadCuts }; delete tc[key]; if (Object.keys(tc).length) en.threadCuts = tc; else delete en.threadCuts; }
      if (landed.fresh.length) {
        en.unread = (Number(en.unread) || 0) + landed.fresh.filter((r) => Number(r.at) > (Number(en.readAt) || 0)).length;
        en.authors = mergeAuthors(en.authors, landed.fresh);
        const newest = landed.fresh.reduce((m, r) => (Number(r.at) > m ? Number(r.at) : m), 0);
        if (newest && (!en.lastAt || newest > en.lastAt)) en.lastAt = newest;
      }
    });
    if (landed.appended) olderChanged(e, convId);
    if (landed.fresh.length) { try { feedSample(rec, e, landed.fresh); } catch (err) { log.warn(`[channels] ${rec.id}: the change feed's measurement failed: ${(err && err.message) || err}`); } }
    // A THREAD REPLY IS A MESSAGE: what the walk found goes through the SAME funnel as a pass (onFresh — the
    // watcher rules, the ONE billed-wake door). A reply first seen by a walk while push claims content is a MISS.
    const lane = laneFor(rec, {});
    if (landed.fresh.length && lane.via === 'push' && lane.carryContent) {
      const since = Number((rec.push && rec.push.contentSince) || 0);
      const judged = landed.fresh.filter((r) => Number(r.at) >= since).length;
      if (judged) { const p = pushRow(rec); p.samples = caps.pushSamplesAdd(p.samples, { at: now(), n: judged, p: judged }); p.missRate = caps.pushMissRate(p.samples, now()).rate; await checkDemotion(rec); }
    }
    // verify r1 (lane lark-search-poll): THE BACKLOG OF A THREAD IS NEVER NEWS. A walk the change feed NAMED (by the timer)
    // on a thread the log never walked reads its newest page — weeks of replies after `linkedAt`; every one of them used to
    // be news: one new reply in an old thread ⇒ 41 "new" replies, and a two-week-old reply matching a watcher's filter
    // woke the agent (a billed turn no new message caused). Such a first walk's news line is the feed's reach: the owed
    // mark's instant − the widest window (`maxWindowSec`) − the range slack — a reply the feed could have named is news,
    // an older one is backlog. A feed-born conversation's own line (`newsSince`, a catch-up birth's backlog) holds too.
    const owedAt0 = en0.threadOwed && typeof en0.threadOwed === 'object' ? Number(en0.threadOwed[key]) || 0 : 0;
    const fdecl0 = feedDecl(rec);
    // verify r2: … or the start of the window that named it, when that is earlier (a window re-read long after it began — a
    // restart after an hour down, a search outage that kept it in flight — named a NEW reply the reach line called backlog)
    const reach0 = en0.threadReach && typeof en0.threadReach === 'object' ? Number(en0.threadReach[key]) || 0 : 0;
    const feedLine = by === 'timer' && !anchor && !cut0 && owedAt0 > 0 && fdecl0 ? Math.min(owedAt0 - (Number(fdecl0.maxWindowSec) || 3600) * 1000, reach0 > 0 ? reach0 : Infinity) - Feed.RANGE_SLACK_MS : 0;
    const newsLine = Math.max(Number(rec.linkedAt) || 0, Number(en0.newsSince) || 0, feedLine);
    const news = landed.fresh.filter((r) => Number(r.at) > newsLine);
    if (news.length) track(onFresh(rec, convId, news, { lane, origin: 'thread-walk' }));
    notify([`${adapterId}/${convId}`]);
    notifyThreads(adapterId, convId, [key]);
    return { ok: true, appended: landed.appended, walked: true, key, ...(landed.foreign ? { foreign: landed.foreign } : {}), ...(landed.bounded ? { bounded: true } : {}), ...(landed.reachedStart ? { reachedStart: true } : {}) };
  }
  /** THE AGENT'S THREAD WALK (spec §5.1, `refresh <conv> --thread <msg>`): reach first (the uniform not-found), the
   *  agents' SHARE of the minute's budget, then the SAME walk the pane asks (its per-thread floor, the back-off, the
   *  budget), charged to the agents' share. The ONLY door by which an agent causes a thread walk — never `read`. */
  async function agentThreadRefresh(ctx, adapterId, convId, msg) {
    const { en, rec } = convFor(adapterId, convId);
    if (!en || !rec || rec.enabled === false) return ACL.notFound();
    if (!ACL.canSee(reachFor(ctx, rec, en).level)) return ACL.notFound();
    const e = adapterFor(rec);
    const sh = agentShareRefusal(rec, e);
    if (sh) return sh;
    const r = await threadRefresh(adapterId, convId, msg, { by: 'agent' });
    // verify r2 (IDENTITY): REACH RE-ASKED after the walk's await — a revoke that landed while the vendor answered
    // leaves the agent the uniform not-found, never the walk's count and the conversation's title
    if (!stillSees(ctx, adapterId, convId)) return ACL.notFound();
    // a thread this conversation never named is the SAME uniform not-found as a conversation it may not see (no
    // existence oracle for another chat's thread ids — verify r1)
    if (r && !r.ok && r.code === 'thread-not-loaded') return ACL.notFound();
    return r && r.ok ? { ...r, conversation: { key: agentId(en.key), adapterId, id: agentId(convId), title: agentTitle(en, convId) } } : r;   // verify r1 F2: the title through the belt; r3 F6: the key + id
  }
  /** `POST …/thread/:msg/older`: the thread's local page before the boundary; past its start (and where replies
   *  are walked separately) ONE walk from the newest back (the rule-19 belt: the per-thread floor), then the page.
   *
   *  verify r3 (MONEY/completeness — r2's held LOW): that walk had NO depth — it asked the vendor's newest page (a
   *  thread listing has no time window, L3) and found nothing it did not hold, so on Lark a thread's replies older than
   *  its newest page were unreachable from the pane, for one wasted call per press. The walk now goes from the newest
   *  PAST what the log holds (`depth` = the replies held + one page; the adapter clamps it to its own first-ingest
   *  bound — Lark 200, and a continuation keeps it), and a walk that finds nothing older is REMEMBERED on the thread's
   *  memory (`olderNone`, keyed by the replies held, for the rule-19 memory's six hours) — the next press answers
   *  `vendorHasNoOlder` with no call. When the walk stopped at the adapter's bound while the vendor held more
   *  (`bounded`) the answer says so (`olderBeyondReach`) and the pane words it: the replies before the newest N are
   *  out of reach here, never a silent "start of the thread". */
  async function threadOlder(adapterId, convId, msg, { before = null, beforeId = null, limit = null } = {}) {
    const n = Math.min(200, Math.max(1, Number(limit) || historyPageSize()));
    const local = threadRead(adapterId, convId, msg, { limit: n, before, beforeId });
    if (!local.ok || local.code === 'thread-not-loaded' || local.code === 'not-a-thread' || local.records.length >= n || !local.exhausted) return local;
    const g = convOr404(adapterId, convId);
    if (g.refusal || threadsRow(g.c).listing !== 'separate') return { ...local, vendorHasNoOlder: true };
    const held = Number(local.thread && local.thread.count) || 0;
    const fk = `${adapterId}/${convId}#${local.thread.key}`;
    const mem = thMemOf(g.e, fk);
    const none = mem.olderNone;
    if (none && none.count === held && now() - none.at < Drain.OLDER_MEMORY_MS) return { ...local, fetched: 0, vendorHasNoOlder: true, source: 'memory', ...(none.bounded ? { olderBeyondReach: true } : {}) };
    const w = await threadRefresh(adapterId, convId, msg, { older: true, depth: held + n });
    if (!w.ok) return { ...local, refused: w.code, code: w.code === 'thread-floor' ? 'older-floor' : w.code, retryAfterSec: w.retryAfterSec || null, ok: true };
    const after = threadRead(adapterId, convId, msg, { limit: n, before, beforeId });
    // remembered: nothing older came (at the bound, or at the vendor's last page), or the walk reached the vendor's last
    // page — the log then holds every reply the vendor lists, and the next press past it needs no call
    const heldAfter = Number(after.thread && after.thread.count) || held;
    if (!w.appended || w.reachedStart) g.e.th.set(fk, { ...thMemOf(g.e, fk), olderNone: { count: heldAfter, at: now(), bounded: !w.appended && !!w.bounded } });
    if (!w.appended) return { ...after, fetched: 0, vendorHasNoOlder: true, ...(w.bounded ? { olderBeyondReach: true } : {}) };
    return { ...after, fetched: w.appended };
  }

  /** verify r2 (MONEY): a 429 answered to a reaction LIST call is the account's reaction lists' back-off
   *  (`e.rxBackoffUntil`, the vendor's Retry-After else the picture path's transient wait) — every list call inside it
   *  (the trickle, an unreact's list-first, a reaction reconcile) is REFUSED `backoff` by name, never sent; the account's
   *  own back-off (a failed pass) refuses them the same way. Judged BEFORE the rule-20 verdict, so a refused batch
   *  reserves no slot of the minute's ceiling and floors no row. Before: a 429 on one list call stopped only its own
   *  batch — the next viewport settle sent the next batch straight into the vendor's Retry-After. */
  const rxBackedOff = (e) => inBackoff(e) || (Number(e.rxBackoffUntil) || 0) > now();
  function rxBackoffRefusal(rec, e) {
    if (inBackoff(e)) return backoffRefusal(rec, e);
    const s2 = Math.max(1, Math.ceil(((Number(e.rxBackoffUntil) || 0) - now()) / 1000));
    return { ok: false, code: 'backoff', error: `the vendor rate-limited this account's reaction lists — they are asked again in ${s2} s; the stored reactions are shown meanwhile`, retryAfterSec: s2, lastCode: 'rate-limited' };
  }
  /** THE CEILING COUNTS REQUESTS (verify r3): a list that sent more than one request (`pages`, the adapter's own count —
   *  absent = one) charges its extra pages to the account's reaction minute, like its first. Bounded per list. */
  const RX_PAGES_MAX = 10;
  const notePages = (e, r) => { const pages = Math.min(RX_PAGES_MAX, Math.max(1, Math.floor(Number(r && r.pages) || 1))); for (let k = 1; k < pages; k++) e.rxMinute = Drain.rxReserve(e.rxMinute, now()); };
  const noteRxRateLimit = (e, err) => { const sec = Number(err && err.detail && err.detail.retryAfterSec); e.rxBackoffUntil = now() + (Number.isFinite(sec) && sec > 0 ? Math.min(600, sec) * 1000 : Att.NEGATIVE_TTL.transient); };
  /** The reaction memory of one conversation (rule 20b), on the account's live entry — dies with it. */
  const rxMapOf = (e, key) => { if (!e.rx) e.rx = new Map(); if (!e.rx.has(key)) e.rx.set(key, new Map()); return e.rx.get(key); };
  /** …a READ of it creates nothing (a window's `GET …/reactions` used to mint an empty map per conversation read). */
  const NO_MEM = new Map();
  const rxMemPeek = (e, key) => (e.rx && e.rx.get(key)) || NO_MEM;
  /** OUR reaction ids per message per key (an unreact needs the vendor's id) — never served (§6.4). verify r3: an
   *  entry is `{at, keys: {key: rid}}` (the bound below needs WHEN it was written), an empty one is not kept. */
  const ridsOf = (e, ck, id) => { const m = e.myRids && e.myRids.get(ck); const v = m && m.get(id); return v && v.keys ? { ...v.keys } : {}; };
  function ridsPut(e, ck, id, keys) {
    const clean = Object.fromEntries(Object.entries(keys || {}).filter(([, r]) => r));
    let m = e.myRids && e.myRids.get(ck);
    if (!Object.keys(clean).length) { if (m) { m.delete(id); if (!m.size) e.myRids.delete(ck); } return; }
    if (!e.myRids) e.myRids = new Map();
    if (!m) { m = new Map(); e.myRids.set(ck, m); }
    m.set(id, { at: now(), keys: clean });
  }
  /**
   * THE PER-ACCOUNT MEMORIES ARE BOUNDED (verify r3, MONEY/memory — r2's held LOW): the reaction memory (`e.rx`, one
   * row per message a window ever listed), our reaction ids (`e.myRids`, one per message listed — even an empty one)
   * and the thread memory (`e.th`, one per thread ever walked) grew for as long as the account's live entry lived — a
   * busy room open for a month is ~20 list calls a minute of new rows, each kept for good. Each is on this closed table
   * with a COUNT cap per account and a 30-day trim: a row whose newest stamp is older than LIVE_MEM_KEEP_MS goes at the
   * hourly sweep; past the cap the least recently stamped go (down to 90 %, so a trim is rare); a row IN FLIGHT is never
   * dropped. Forgetting costs at most one list / walk later (the floor's clock, an `asOf`, our reaction id — an unreact
   * lists first), never a wrong answer: the floors are minutes and the cap is thousands of rows. test-channels-engine ㉑
   * is the census (every per-account Map / Set this engine hangs on a live entry is on its table with its bound).
   */
  const LIVE_MEM_KEEP_MS = 30 * 86400e3;
  const LIVE_MEM_SWEEP_MS = 3600e3;
  const LIVE_MEMS = Object.freeze({
    rx: Object.freeze({ max: 20000, nested: true, stamp: (v) => Math.max(Number(v && v.askedAt) || 0, Number(v && v.fetchedAt) || 0), live: (v) => !!(v && v.inflight) }),
    myRids: Object.freeze({ max: 20000, nested: true, stamp: (v) => Number(v && v.at) || 0, live: () => false }),
    th: Object.freeze({ max: 5000, nested: false, stamp: (v) => Math.max(Number(v && v.askedAt) || 0, Number(v && v.fetchedAt) || 0, Number(v && v.olderNone && v.olderNone.at) || 0), live: (v) => !!(v && v.inflight) }),
  });
  function boundLiveMem(e, t = now()) {
    if (!e) return;
    const sweep = !(Number(e.memSweptAt) > 0) || t - e.memSweptAt >= LIVE_MEM_SWEEP_MS;
    for (const [name, spec] of Object.entries(LIVE_MEMS)) {
      const top = e[name];
      if (!top || !top.size) continue;
      const maps = spec.nested ? [...top.entries()] : [[null, top]];
      let n = 0;
      for (const [, m] of maps) n += m.size;
      if (!sweep && n <= spec.max) continue;
      const rows = [];
      for (const [, m] of maps) for (const [id, v] of m) { if (spec.live(v)) continue; const st = spec.stamp(v); if (t - st >= LIVE_MEM_KEEP_MS) { m.delete(id); n--; } else rows.push([m, id, st]); }
      if (n > spec.max) {
        rows.sort((a, b) => a[2] - b[2]);
        const keep = Math.floor(spec.max * 0.9);
        for (let i = 0; i < rows.length && n > keep; i++) if (rows[i][0].delete(rows[i][1])) n--;
      }
      if (spec.nested) for (const [ck, m] of maps) if (!m.size) top.delete(ck);
    }
    if (sweep) e.memSweptAt = t;
  }
  /** Append side records (each judged by `validateSide` first — bound before parse), then the ONE broadcast. */
  function appendSides(rec, convId, sides) {
    const ok = [];
    for (const s of sides) {
      const v = validateSide(s);
      if (!v.ok) { log.warn(`[channels] ${rec.id}/${convId}: a side record was refused ${v.code} (key length ${String((s && s.key) || '').length})`); continue; }
      ok.push(v.side);
    }
    if (!ok.length) return { appended: 0, duplicates: 0, msgs: [] };
    const w = store.appendSide(rec.id, convId, ok);
    if (w.appended) notifySide(rec.id, convId, w.msgs);
    return w;
  }
  /** `GET …/reactions?ids=` — the LOCAL fold (never a vendor call) + when each message's list was last fetched. */
  function reactionsRead(adapterId, convId, ids) {
    const g = convOr404(adapterId, convId);
    if (g.refusal) return g.refusal;
    const list = (Array.isArray(ids) ? ids : []).map(String).filter(Boolean);
    if (list.length > 50) return { ok: false, code: 'bad-request', error: 'at most 50 ids per read' };
    const folded = reactionsFor(g.rec, convId, list, { e: g.e });
    const mem = rxMemPeek(g.e, `${adapterId}/${convId}`);
    const out = {}, asOf = {};
    for (const id of list) { out[id] = folded.get(id) || []; const m = mem.get(id); asOf[id] = m && m.fetchedAt ? m.fetchedAt : null; }
    return { ok: true, reactions: out, asOf };
  }
  /**
   * THE REACTION TRICKLE (spec §3.3, drain rule 20b, `POST …/reactions/refresh {ids ≤ 20}`): the OPEN window's
   * visible rows only. The PURE verdict first (one flight per message, the per-message floor, the account's
   * per-minute CEILING — judged before the budget), then per message, ONE AT A TIME: the vendor back-off and the
   * minute's budget (rule 9 — a cut refuses the rest by name), the adapter's paced + metered list call (rule 18),
   * ONE snapshot side record, the broadcast. Charged to the owner's window. `inline` / `events` lists are never
   * fetched (they arrive with the history / as events).
   */
  async function reactionsRefresh(adapterId, convId, ids) {
    const g = convOr404(adapterId, convId);
    if (g.refusal) return g.refusal;
    const { rec, e, c } = g;
    const list = (Array.isArray(ids) ? ids : []).map(String).filter(Boolean);
    if (list.length > Drain.REACTIONS_BATCH_MAX) return { ok: false, code: 'bad-request', error: `at most ${Drain.REACTIONS_BATCH_MAX} ids per refresh` };
    const r0 = reactionsRow(c);
    if (r0.read === 'none') return { ok: false, code: 'not-supported', error: `${rec.label || rec.id} has no reactions` };
    if (r0.read !== 'list') return { ok: true, asked: [], refused: [], floorMs: Drain.REACTIONS_FLOOR_MS, via: r0.read };
    if (rec.enabled === false) return { ok: false, code: 'disabled', error: `${rec.label || rec.id} is disabled` };
    const offer = await offerNow(rec, adapterId, convId, 'read-reactions');
    if (!offer.offered && offer.why === 'reactions-scope-not-granted') return { ok: false, code: 'reactions-scope-not-granted', error: 'reading reactions needs a re-authorization with the reactions read permission', why: offer.why, scopes: reactionsGrantView(rec) ? reactionsGrantView(rec).scopes : [] };
    if (!offer.offered) return { ok: false, code: 'react-not-available', error: `reactions cannot be read here (${offer.why})`, why: offer.why };
    const key = `${adapterId}/${convId}`;
    const mem = rxMapOf(e, key);
    // verify r2: a back-off (the account's, or a 429 on a reaction list) refuses the whole batch BEFORE the verdict
    if (rxBackedOff(e)) { const b = rxBackoffRefusal(rec, e); return { ok: true, asked: [], joined: [], refused: [...new Set(list)].map((id) => ({ id, code: 'backoff', rule: 'backoff', retryAfterMs: (b.retryAfterSec || 1) * 1000 })), floorMs: Drain.REACTIONS_FLOOR_MS, ttlMs: reactionsTtlMs(), perMinute: reactionsPerMin(), backoff: b }; }
    const tv = now();
    const v = Drain.reactionsVerdict({ ids: list, mem: (id) => mem.get(id), now: tv, floorMs: Drain.REACTIONS_FLOOR_MS, perMinute: reactionsPerMin(), minute: e.rxMinute });
    e.rxMinute = v.minute;
    const refused = v.refused.slice();
    const asked = [];
    const before = new Map(v.ask.map((id) => [id, mem.get(id)]));   // what a row's memory was before its `ask` (a cut restores it)
    for (const id of v.ask) mem.set(id, Drain.rxApply(mem.get(id), 'ask', tv));
    const prevBy = e.chargeBy;
    // a row cut BEFORE its call was never asked: its memory is what it was (no floor), its slot is given back — exact,
    // those requests did not happen (verify r3)
    const cutRows = (rows, why) => {
      for (const x of rows) { const b0 = before.get(x); if (b0) mem.set(x, b0); else mem.delete(x); refused.push({ id: x, code: why === 'backoff' ? 'backoff' : 'vendor-budget', rule: why === 'backoff' ? 'backoff' : why === 'ceiling' ? 'ceiling' : 'budget', retryAfterMs: why === 'ceiling' ? Math.max(1, Drain.rxMinuteAt(e.rxMinute, now()).at + 60e3 - now()) : null }); }
      if (rows.length) e.rxMinute = Drain.rxRelease(e.rxMinute, rows.length, tv, now());
    };
    let end = v.ask.length;
    for (let i = 0; i < end; i++) {
      const id = v.ask[i];
      // the OUTER caps before each call: the vendor back-off, the minute's budget (rule 9 — THE CUT, by name)
      const hard = rxBackedOff(e) ? 'backoff' : !affordable(rec, e) ? 'vendor-budget' : null;
      if (hard) { cutRows(v.ask.slice(i, end), hard); end = i; break; }
      // (verify r3) THE CEILING IN REQUESTS: a list is paged (Lark ≤ 3 requests, 150 reactions) and every extra page is
      // charged to the minute's ceiling as it lands (`notePages`); what that overshoots is taken from the END of the
      // batch (those rows' slots given back), so the minute never holds more than the ceiling + one list's extra pages.
      // Before: the ceiling counted LISTS — one batch of 20 three-page lists spent 60 requests = Lark's whole minute,
      // and the timer's message pass right after was refused (measured).
      const over = Drain.rxMinuteAt(e.rxMinute, now()).n - reactionsPerMin();
      if (over > 0) { const from = Math.max(i, end - over); cutRows(v.ask.slice(from, end), 'ceiling'); end = from; if (i >= end) break; }
      e.chargeBy = 'owner';
      try {
        const r = await vendor(rec, e, () => e.adapter.reactions(convId, { messageId: id }));
        if (outlived(rec, e)) { mem.set(id, Drain.rxApply(mem.get(id), 'failed', now())); refused.push({ id, code: 'account-changed', rule: 'account', retryAfterMs: null }); continue; }
        notePages(e, r);
        const snap = { k: 'rx', msg: id, at: Number(r && r.at) || now(), form: 'snapshot', src: 'list', list: (r && r.list) || [], ...(r && r.truncated ? { truncated: true } : {}) };
        appendSides(rec, convId, [snap]);
        const mine = Rx.myRidsOf(validateSide(snap).side || snap, e.adapter.selfId());
        ridsPut(e, key, id, { ...ridsOf(e, key, id), ...mine });
        mem.set(id, Drain.rxApply(mem.get(id), 'landed', now()));
        asked.push(id);
      } catch (err) {
        mem.set(id, Drain.rxApply(mem.get(id), 'failed', now()));
        const code = err instanceof ChannelError ? err.code : 'vendor-error';
        refused.push({ id, code, rule: 'vendor', retryAfterMs: null });
        if (code === 'rate-limited' && !outlived(rec, e)) noteRxRateLimit(e, err);
        if (code === 'rate-limited' || code === 'auth-expired') { for (const rest of v.ask.slice(i + 1, end)) { mem.set(rest, Drain.rxApply(mem.get(rest), 'failed', now())); refused.push({ id: rest, code, rule: 'vendor', retryAfterMs: null }); } break; }
      } finally { e.chargeBy = prevBy; }
    }
    e.rxCalls = (e.rxCalls || []).filter((x) => now() - x < 60e3).concat(asked.map(() => now()));
    boundLiveMem(e);
    return { ok: true, asked, joined: v.join, refused, floorMs: Drain.REACTIONS_FLOOR_MS, ttlMs: reactionsTtlMs(), perMinute: reactionsPerMin() };
  }
  /** A reaction refusal (the adapter's `detail.why`) → the route's closed code. */
  function reactionRefusal(err) {
    const why = err && err.detail && err.detail.why;
    const map = { 'bad-emoji': 'bad-emoji', 'already-reacted': 'already-reacted', 'reaction-cap': 'reaction-cap', 'not-reactable': 'not-reactable', 'reaction-not-mine': 'reaction-not-mine' };
    if (map[why]) return { ok: false, code: map[why], error: String((err && err.message) || err) };
    const code = err instanceof ChannelError ? err.code : 'vendor-error';
    // LOST (attack 6): the adapter threw mid-flight or the transport failed after the request may have left — the
    // chip does not flip and nothing is retried; an approved proposal reads `unknown` (one list read decides it)
    const d = (err && err.detail) || {};
    const lost = !!(d.threw || d.lost) || code === 'transport';
    return { ok: false, code: code === 'transport' ? 'transport' : code, error: String((err && err.message) || err), retryAfterSec: Number(d.retryAfterSec) || undefined, ...(lost ? { lost: true } : {}) };
  }
  /** Is this key one the adapter's set lists? (the picker never offers another; an agent's pick is judged here) */
  async function keyAllowed(rec, e, key) {
    if (!Rx.reactionKeyOf(key) || Rx.reactionKeyOf(key) !== key) return false;
    let set = vocabularyOf(rec, e);
    if (!set && e.rxSetFlight) { try { await e.rxSetFlight; } catch { } set = e.rxSet && e.rxSet.set; }
    if (!set) return false;
    return (set.keys || []).some((k) => k && k.key === key);
  }
  /**
   * ADD A REACTION AS THE USER (spec §3.4 F7, `POST …/messages/:msg/reactions {key}`): `react` offered here, a key
   * the set lists, a message the log holds; ONE paced + metered vendor call, NEVER retried (two adds are not
   * idempotent — attack 6); the `self` delta is written only AFTER the vendor answered (a refused add writes
   * nothing — the chip never flips on a guess); the route answers the FOLDED list. `by:'agent'` = an approved
   * proposal (§5.3) — the same act, `src:'agent'`.
   */
  async function react(adapterId, convId, msg, key, { by = 'user' } = {}) {
    const g = convOr404(adapterId, convId);
    if (g.refusal) return g.refusal;
    const { rec, e, c } = g;
    const offer = await offerNow(rec, adapterId, convId, 'react');
    if (!offer.offered) return { ok: false, code: 'react-not-available', error: `reactions cannot be added here (${offer.why})`, why: offer.why };
    if (!(await keyAllowed(rec, e, String(key || '')))) return { ok: false, code: 'bad-emoji', error: 'that emoji is not one this channel allows' };
    const id = String(msg || '');
    if (!id || !store.findRecord(adapterId, convId, id)) return { ok: false, code: 'not-found', error: 'no such message in this conversation' };
    if (inBackoff(e)) return backoffRefusal(rec, e);
    if (!affordable(rec, e)) return budgetRefusal(rec, e);
    let r;
    const prevBy = e.chargeBy; e.chargeBy = 'owner';
    try { r = await vendor(rec, e, () => e.adapter.react(convId, { messageId: id, key })); }
    catch (err) { return reactionRefusal(err); }
    finally { e.chargeBy = prevBy; }
    if (outlived(rec, e)) return { ok: false, code: 'account-changed', error: 'the account changed while the reaction was added' };
    const self = e.adapter.selfId() || (r && r.actor) || 'self';
    appendSides(rec, convId, [{ k: 'rx', msg: id, at: Number(r && r.at) || now(), form: 'delta', op: 'add', key, actor: { id: String(self), name: '' }, src: by === 'agent' ? 'agent' : 'self', ...(r && r.reactionId ? { rid: r.reactionId } : {}) }]);
    if (r && r.reactionId) { const ck0 = `${adapterId}/${convId}`; ridsPut(e, ck0, id, { ...ridsOf(e, ck0, id), [key]: String(r.reactionId) }); boundLiveMem(e); }
    audit({ kind: 'reaction', op: 'add', adapterId, convId, msg: id, key, by });
    return { ok: true, reactions: reactionsFor(rec, convId, [id], { e }).get(id) || [] };
  }
  /**
   * REMOVE OUR REACTION (F8, `DELETE …/messages/:msg/reactions/:key`): needs the vendor's id of OUR reaction —
   * known from our own add or a snapshot, else ONE list call first (paced, metered, counted against the minute's
   * ceiling); none of ours ⇒ `reaction-not-mine`.
   */
  async function unreact(adapterId, convId, msg, key, { by = 'user' } = {}) {
    const g = convOr404(adapterId, convId);
    if (g.refusal) return g.refusal;
    const { rec, e, c } = g;
    const offer = await offerNow(rec, adapterId, convId, 'unreact');
    if (!offer.offered) return { ok: false, code: 'react-not-available', error: `reactions cannot be removed here (${offer.why})`, why: offer.why };
    if (!Rx.reactionKeyOf(String(key || ''))) return { ok: false, code: 'bad-emoji', error: 'that is not a reaction' };
    const id = String(msg || '');
    if (!id || !store.findRecord(adapterId, convId, id)) return { ok: false, code: 'not-found', error: 'no such message in this conversation' };
    if (inBackoff(e)) return backoffRefusal(rec, e);
    if (!affordable(rec, e)) return budgetRefusal(rec, e);
    const ck = `${adapterId}/${convId}`;
    let rid = ridsOf(e, ck, id)[key] || null;
    const prevBy = e.chargeBy; e.chargeBy = 'owner';
    try {
      if (!rid && reactionsRow(c).read === 'list') {
        if (rxBackedOff(e)) return rxBackoffRefusal(rec, e);   // verify r2: the list-first call waits out a reaction 429
        const m0 = rxMapOf(e, ck);
        const minute = Drain.rxMinuteAt(e.rxMinute, now());
        if (minute.n >= reactionsPerMin()) return { ok: false, code: 'vendor-budget', error: 'the reaction list budget of this minute is spent — try again in a moment', retryAfterSec: Math.max(1, Math.ceil((minute.at + 60e3 - now()) / 1000)) };
        e.rxMinute = Drain.rxReserve(minute, now());
        let r0;
        try { r0 = await vendor(rec, e, () => e.adapter.reactions(convId, { messageId: id })); }
        catch (err) { if (err instanceof ChannelError && err.code === 'rate-limited' && !outlived(rec, e)) noteRxRateLimit(e, err); throw err; }
        notePages(e, r0);
        const snap = { k: 'rx', msg: id, at: Number(r0 && r0.at) || now(), form: 'snapshot', src: 'list', list: (r0 && r0.list) || [], ...(r0 && r0.truncated ? { truncated: true } : {}) };
        appendSides(rec, convId, [snap]);
        m0.set(id, Drain.rxApply(Drain.rxApply(m0.get(id), 'ask', now()), 'landed', now()));
        const mine = Rx.myRidsOf(validateSide(snap).side || snap, e.adapter.selfId());
        ridsPut(e, ck, id, { ...ridsOf(e, ck, id), ...mine });
        rid = mine[key] || null;
      }
      if (!rid) return { ok: false, code: 'reaction-not-mine', error: 'only a reaction you added can be removed' };
      await vendor(rec, e, () => e.adapter.unreact(convId, { messageId: id, key, reactionId: rid }));
    } catch (err) { return reactionRefusal(err); }
    finally { e.chargeBy = prevBy; }
    if (outlived(rec, e)) return { ok: false, code: 'account-changed', error: 'the account changed while the reaction was removed' };
    const self = e.adapter.selfId() || 'self';
    appendSides(rec, convId, [{ k: 'rx', msg: id, at: now(), form: 'delta', op: 'remove', key, actor: { id: String(self), name: '' }, src: by === 'agent' ? 'agent' : 'self', rid: `${rid}:removed` }]);
    const cur = ridsOf(e, ck, id); delete cur[key]; ridsPut(e, ck, id, cur);
    boundLiveMem(e);
    audit({ kind: 'reaction', op: 'remove', adapterId, convId, msg: id, key, by });
    return { ok: true, reactions: reactionsFor(rec, convId, [id], { e }).get(id) || [] };
  }
  /** One audit line per reaction act (the owner's record of what went out in their name). */
  function audit(line) { try { store.audit(line); } catch (err) { log.warn(`[channels] reaction audit failed: ${(err && err.message) || err}`); } }
  /** `GET /api/channels/:adapterId/emoji-set` — the picker's vocabulary (cached 6 h). */
  async function emojiSet(adapterId) {
    const rec = adapterRecords().adapters.find((r) => r.id === adapterId);
    if (!rec) return { ok: false, code: 'not-found', error: 'no such account' };
    const c = registry.capsOf(rec.kind);
    if (!reactionsRow(c).add) return { ok: false, code: 'not-supported', error: `${rec.label || rec.id} has no reactions` };
    const e = adapterFor(rec);
    vocabularyOf(rec, e);
    if (e.rxSetFlight) { try { await e.rxSetFlight; } catch { } }
    const s = e.rxSet && e.rxSet.set;
    if (!s) return { ok: false, code: (e.rxSet && e.rxSet.error) || 'vendor-error', error: 'the reaction set could not be loaded' };
    const keys = (s.keys || []).filter((k) => k && Rx.reactionKeyOf(k.key) === k.key).map((k) => ({ key: k.key, glyph: k.glyph || null, label: peerName(String(k.label || k.key), 40) || k.key, custom: k.custom === true }));
    return { ok: true, keys, quick: Rx.quickSet(s), custom: !!s.custom, at: e.rxSet.at, replaces: reactionsRow(c).perMessageMax === 1 };
  }
  /** `GET /api/channels/:adapterId/emoji/:key` — a CUSTOM emoji's picture through OUR route: the key judged by
   *  its alphabet BEFORE any path is built (attack 22), a key the set lists as custom only, then THE ONE PICTURE ORDER
   *  an attachment follows (PURE `Att.fetchVerdict`: the account's LRU cache first · a REMEMBERED refusal · one flight ·
   *  the back-off — the account's and a picture rate limit — · the budget · ONE paced + metered fetch). verify r2
   *  (MONEY): the route had its own order with no memory — a picture the vendor refused (a deleted custom emoji, one
   *  past 1 MB) was fetched again on EVERY draw of its chip, and a 429 answered to one was asked again at once inside
   *  the vendor's Retry-After (the account's other pictures too): measured 10 asks = 10 vendor calls, 5 = 5. */
  const emojiFlights = new Map();
  const emojiRefused = new Map();   // `${adapterId}/${key}` → {code, error, retryAfterSec, until} (a VENDOR's refusal, remembered)
  async function emojiImage(adapterId, key) {
    const rec = adapterRecords().adapters.find((r) => r.id === adapterId);
    if (!rec) return { ok: false, code: 'not-found', error: 'no such account' };
    const k = String(key || '');
    if (Rx.reactionKeyOf(k) !== k || /\.\.|\//.test(k)) return { ok: false, code: 'not-found', error: 'no such emoji' };
    if (reactionsRow(registry.capsOf(rec.kind)).custom !== 'image') return { ok: false, code: 'not-supported', error: `${rec.label || rec.id} has no custom emoji` };
    const e = adapterFor(rec);
    const set = vocabularyOf(rec, e) || (e.rxSetFlight ? (await e.rxSetFlight.catch(() => {}), e.rxSet && e.rxSet.set) : null);
    if (!set || !(set.keys || []).some((x) => x && x.key === k && x.custom === true)) return { ok: false, code: 'not-found', error: 'no such emoji' };
    const fk = `${adapterId}/${k}`;
    const hit = store.attachmentGet(adapterId, '~emoji', k);
    const t = now();
    let remembered = emojiRefused.get(fk) || null;
    if (remembered && remembered.until <= t) { emojiRefused.delete(fk); remembered = null; }
    let v = Att.fetchVerdict({ cached: !!hit, remembered });
    if (v.act === 'serve') return { ok: true, file: hit.file, meta: hit.meta, cached: true };
    if (v.act === 'refuse') return { ok: false, code: v.code, error: remembered.error, retryAfterSec: remembered.retryAfterSec ? Math.max(1, Math.ceil((remembered.until - t) / 1000)) : undefined, remembered: true };
    v = Att.fetchVerdict({ cached: false, remembered: null, owner: true, fetchable: true, enabled: rec.enabled !== false, inflight: emojiFlights.has(fk), backoff: inBackoff(e) || (Number(e.attBackoffUntil) || 0) > t, affordable: affordable(rec, e) });
    switch (v.act) {
      case 'join': return emojiFlights.get(fk);
      case 'fetch': break;
      default:
        if (v.code === 'disabled') return { ok: false, code: 'disabled', error: `${rec.label || rec.id} is disabled` };
        if (v.code === 'backoff') {
          if (inBackoff(e)) return backoffRefusal(rec, e);
          const s2 = Math.max(1, Math.ceil(((Number(e.attBackoffUntil) || 0) - t) / 1000));
          return { ok: false, code: 'backoff', error: `the vendor rate-limited this account's last picture fetch — it is tried again in ${s2} s`, retryAfterSec: s2, lastCode: 'rate-limited' };
        }
        return budgetRefusal(rec, e);
    }
    const run = (async () => {
      let r;
      try { r = await vendor(rec, e, () => e.adapter.emojiImage(k)); }
      catch (err) {
        const code = err instanceof ChannelError ? err.code : 'vendor-error';
        const retryAfterSec = Number(err && err.detail && err.detail.retryAfterSec) || null;
        const ttl = Att.negativeTtlMs(code, { retryAfterSec });
        const error = String((err && err.message) || err);
        const ended = outlived(rec, e);   // an answer that outlived its entry keeps nothing (R5), the memory included
        if (ttl && !ended) emojiRefused.set(fk, { code, error, retryAfterSec: Att.TRANSIENT.includes(code) || code === 'vendor-error' ? Math.ceil(ttl / 1000) : null, until: now() + ttl });
        // a rate limit is the ACCOUNT's, not this picture's: every picture (emoji and attachment) waits it out
        if (code === 'rate-limited' && !ended) e.attBackoffUntil = now() + (ttl || Att.NEGATIVE_TTL.transient);
        return { ok: false, code, error, ...(Att.TRANSIENT.includes(code) || code === 'vendor-error' ? { retryAfterSec: Math.max(1, Math.ceil((ttl || Att.NEGATIVE_TTL.transient) / 1000)) } : {}) };
      }
      if (outlived(rec, e)) return { ok: false, code: 'account-changed', error: 'the account changed while the picture was fetched — nothing was kept' };
      const data = r && Buffer.isBuffer(r.data) ? r.data : Buffer.from((r && r.data) || '');
      if (data.length > 1024 * 1024) {
        emojiRefused.set(fk, { code: 'too-large', error: 'a custom emoji is larger than 1 MB', retryAfterSec: null, until: now() + Att.negativeTtlMs('too-large') });
        return { ok: false, code: 'too-large', error: 'a custom emoji is larger than 1 MB' };
      }
      const put = await store.attachmentPut(adapterId, '~emoji', k, { data, name: `${k}.png`, mime: (r && r.mime) || 'image/png' }, { budgetBytes: attachmentBudgetBytes() });
      return { ok: true, file: put.file, meta: put.meta, cached: false };
    })();
    emojiFlights.set(fk, run);
    try { return await run; } finally { emojiFlights.delete(fk); }
  }
  /** What unlocks READING reactions on this account (the window's line): the module's `reactionsGrant` against
   *  the scopes it HOLDS — like `sendGrantView`. */
  function reactionsGrantView(rec) {
    let mod = null;
    try { mod = registry.get(rec.kind); } catch { mod = null; }
    const g = mod && mod.reactionsGrant;
    if (!g) return null;
    const held = new Set(((rec.auth && rec.auth.scopes) || []).map(String));
    const refusedBy = new Set(((rec.auth && rec.auth.refusedScopes) || []).map(String));
    const missing = g.scopes.filter((x) => !held.has(x));
    // owner ruling (2026-09-28): WANTED while the account's declared option is not `off` (the option's own default
    // when the record never set it); REFUSED = what the last consent dropped because the vendor refused it
    const decls = ((realByKind.get(rec.kind) || mod).OPTIONS) || [];   // the module declares the options (the registered adapter object carries none)
    const opt = g.option ? (decls.find((o) => o.key === g.option) || null) : null;
    const v = opt ? ((rec.options && rec.options[g.option]) || opt.default) : null;
    return { scopes: g.scopes.slice(), missing, refused: missing.filter((x) => refusedBy.has(x)), console: !!g.console, wanted: !opt || v !== 'off' };
  }
  /** WHICH CONVERSATION a side event names (Lark's reaction event carries none — L10): the event's own, else the
   *  message → conversation map, else the store's bounded search of the account's logs. */
  async function convOfMessage(rec, messageId) {
    const k = `${rec.id}\u0000${messageId}`;
    const hit = msgConv.get(k);
    if (hit) return { convId: hit, why: null };
    const t = now();
    const missAt = msgMiss.get(k);
    if (missAt && t - missAt < MSG_MISS_TTL_MS) return { convId: null, why: 'remembered' };
    const calls = (locateMinute.get(rec.id) || []).filter((x) => t - x < 60e3);
    if (calls.length >= LOCATE_PER_MIN) { locateMinute.set(rec.id, calls); return { convId: null, why: 'locate-budget' }; }
    calls.push(t); locateMinute.set(rec.id, calls);
    let c = null;
    try { c = await store.locateMessage(rec.id, messageId); } catch { c = null; }
    if (c) { noteMsgConv(rec.id, c, messageId); msgMiss.delete(k); return { convId: c, why: null }; }
    if (msgMiss.has(k)) msgMiss.delete(k);
    msgMiss.set(k, t);
    if (msgMiss.size > MSG_MISS_MAX) { const it = msgMiss.keys(); for (let i = msgMiss.size - MSG_MISS_MAX; i > 0; i--) msgMiss.delete(it.next().value); }
    return { convId: null, why: 'missed' };
  }

  /**
   * THE MIGRATION (spec §3.6, `2026-09-channel-threads-derive`): NO message line is rewritten — a record's place
   * is DERIVED (the fold recovers an `omt_` thread's root as its earliest record with no parent). Through the
   * engine's two serialized doors: every conversation whose adapter declares a thread / reaction row and whose
   * cached verdict predates the rows is re-resolved on its next open (`convCaps.at = 0`), and every account is
   * stamped `reactionPolicy: 'propose'` (an absent row reads `propose` anyway — the stamp makes the census
   * explicit). The plan is computed NOW (these counts ARE the rows it changes); `write` resolves when both landed.
   */
  function migrateThreads() {
    const recs = adapterRecords().adapters;
    const stamp = recs.filter((r) => !P.REACTION_POLICIES.includes(r.reactionPolicy)).map((r) => r.id);
    const byId = new Map(recs.map((r) => [r.id, r]));
    const resets = [];
    for (const en of Object.values(store.index.live())) {
      const rec = en && byId.get(en.adapterId);
      if (!rec || !en.convCaps) continue;
      const c = registry.capsOf(rec.kind);
      if ((threadsRow(c).read !== 'none' && !en.convCaps.threads) || (reactionsRow(c).read !== 'none' && !en.convCaps.reactions)) resets.push(en.key);
    }
    const write = Promise.all([
      stamp.length ? store.adapters.update(() => { for (const r of adapterRecords().adapters) if (!P.REACTION_POLICIES.includes(r.reactionPolicy)) r.reactionPolicy = 'propose'; }) : Promise.resolve(),
      resets.length ? store.index.update(() => { for (const k of resets) { const en = store.index.live()[k]; if (en && en.convCaps) en.convCaps = { ...en.convCaps, at: 0 }; } }) : Promise.resolve(),
    ]);
    return { write, stamped: stamp, reset: resets.length };
  }
  /** The account's reaction policy (§2.6) — the Edit dialog's `PUT {reactionPolicy}`. */
  async function setReactionPolicy(adapterId, value) {
    const rec = adapterRecords().adapters.find((r) => r.id === adapterId);
    if (!rec) return { ok: false, code: 'not-found', error: 'no such account' };
    if (!P.REACTION_POLICIES.includes(value)) return { ok: false, code: 'bad-request', error: 'reactionPolicy must be propose, direct or off' };
    await store.adapters.update(() => { rec.reactionPolicy = value; });
    notify([]);
    return { ok: true, reactionPolicy: value };
  }

  /** SEARCH one account's local logs (design §6.5) — async, byte-capped. */
  async function search(adapterId, q, { limit = 100 } = {}) {
    const rec = adapterRecords().adapters.find((r) => r.id === adapterId);
    if (!rec) return { ok: false, code: 'not-found', error: `no such account '${adapterId}'` };
    const query = String(q || '').trim();
    if (query.length < 2) return { ok: false, code: 'bad-request', error: 'a search needs at least 2 characters' };
    const r = await store.search(adapterId, query, { limit: Math.min(200, Math.max(1, Number(limit) || 100)) });
    const liveIx = store.index.live();
    const sc = registry.capsOf(rec.kind);
    const results = r.results.map((x) => ({ key: `${adapterId}/${x.convId}`, convId: x.convId, title: titleOf(sc, (liveIx[`${adapterId}/${x.convId}`] || {}).title) || null, record: withoutBody(viewOf(rec, x)) }));   // lane lark-search-poll: an untitled row is worded by the client, never its raw id
    return { ok: true, results, truncated: r.truncated, scannedBytes: r.scannedBytes, files: r.files };
  }

  /** ONE convCaps LOOKUP PER CONVERSATION IN FLIGHT (verify r3, MONEY — r1's held LOW): every caller that found the
   *  cached verdict unknown or stale (a window's reaction trickle, react / unreact, a draft, a watch on open) asked the
   *  vendor itself — 20 concurrent reaction refreshes on a stale conversation = 20 chat lookups (measured, r1b-money).
   *  A caller now JOINS the lookup in flight for that conversation. `join:false` (approve's unconditional re-resolution:
   *  a proposal is decided on an answer asked AFTER the decision) starts its own — which the next callers join. */
  const convCapsFlights = new Map();   // `${adapterId}/${convId}` → the lookup in flight
  function refreshConvCaps(adapterId, convId, { join = true } = {}) {
    const k = `${adapterId}/${convId}`;
    const f = join ? convCapsFlights.get(k) : null;
    if (f) return f;
    const run = (async () => {
      const rec = adapterRecords().adapters.find((r) => r.id === adapterId);
      if (!rec) return null;
      const e = adapterFor(rec);
      const cc = await e.adapter.convCaps(convId);
      // `create:false`: a conversation the vendor no longer lists may have been
      // removed from the index between the ask and the answer, and a cache entry
      // is not a reason to resurrect the row it describes.
      await store.index.update(() => { const en = store.index.entry(adapterId, convId, { create: false }); if (en) en.convCaps = cc; });
      return cc;
    })();
    convCapsFlights.set(k, run);
    const done = () => { if (convCapsFlights.get(k) === run) convCapsFlights.delete(k); };
    run.then(done, done);
    return run;
  }

  /**
   * MARK READ. Two things here are load-bearing (r2), and together they are
   * what breaks a self-feeding loop between this engine and an open window:
   *
   * 1. THE DEFAULT INSTANT IS THE NEWEST RECORD'S, NOT `now()`. "Read" means
   *    "I have seen everything this conversation holds", and a vendor is free
   *    to stamp a record ahead of our clock (the fake adapter spreads a day
   *    over the whole current UTC day, so future-dated records are ALWAYS
   *    present; a real vendor's clock skew does the same thing). With `now()`
   *    those records stay unread for ever, so `unread` never reaches 0 and
   *    nothing that watches `unread` can ever settle. Taking the newest record
   *    is also strictly MORE honest than `now()` in the other direction: a
   *    record that arrives between the newest one and this instant stays
   *    unread instead of being silently marked read.
   *
   *    AND IT REALLY IS THE NEWEST RECORD'S (r3). The r2 spelling was
   *    `Math.max(now(), newest.at)` — right for the fake adapter, whose
   *    records are always future-dated, and `now()` for every adapter whose
   *    records are stamped in the PAST, i.e. every real one. There a message
   *    stamped before the mark but fetched after it (the routine shape: the
   *    poll interval is 30-300 s) was SILENTLY MARKED READ and never badged,
   *    and `changed` was true on every call, so rule 2 below was structurally
   *    inert. The suite could not tell the two rules apart because its fixture
   *    ASSERTED it was future-dated. With no record at all the mark is left
   *    where it was — there is nothing to have seen.
   *
   * 2. A NO-OP DOES NOT BROADCAST. Every broadcast recomputes the digest
   *    (which deep-clones the index), re-renders every panel and re-reads
   *    every open window's tail. Notifying when nothing moved turned one open
   *    window into ~500 requests a second, for ever, with the user touching
   *    nothing — and each cycle rewrote `readAt`, destroying the mark it was
   *    supposed to set. The cache-invalidation law is one DIRTY signal, one
   *    computation; an unchanged value is not a dirty signal.
   */
  async function markRead(adapterId, convId, at = null) {
    if (!known(adapterId, convId)) return false;
    let changed = false, found = false;
    await store.index.update(() => {
      const en = store.index.entry(adapterId, convId, { create: false });
      if (!en) return;
      found = true;
      const newest = store.readTail(adapterId, convId, { limit: 1 })[0];
      const stamp = Number.isFinite(at) ? at : (newest ? (Number(newest.at) || 0) : (en.readAt || 0));
      const unread = store.countSince(adapterId, convId, stamp);
      changed = en.readAt !== stamp || en.unread !== unread;
      en.readAt = stamp;
      en.unread = unread;
    });
    if (!found) return false;
    // B-f32b: the KEY — a bare id makes notify scan every key of the index (50 274 at userW's)
    if (changed) notify([`${adapterId}/${convId}`]);
    return true;
  }

  /** `beforeId` is the OTHER half of the page boundary — see the store's
   *  `(at, vendorId)` total order. Dropping it here would put the loss back.
   *  ONLY a conversation this engine KNOWS (an adapter record + the index row —
   *  the gate `loadOlder` / `readFor` / `attachment` already have): null for
   *  anything else, never a raw read of a store log by path. Verify r1 of
   *  "Clear content…": the agent-group log (`groups/<gid>`) is the store's too,
   *  and this reader served its ORIGINAL lines to `GET /api/channels/groups/
   *  <gid>/messages` after a clear — the groups engine's own read folds the
   *  clears, this one knew nothing of them. */
  function messages(adapterId, convId, { before = null, beforeId = null, limit = 50 } = {}) {
    if (!known(adapterId, convId)) return null;
    const rec = adapterRecords().adapters.find((r) => r.id === adapterId) || null;
    // lane channel-threads: the READ SHAPE — each record's place + reactions (§3.5)
    return withView(rec, store.readTail(adapterId, convId, { before, beforeId, limit }), { convId });
  }

  // ── failures SPOKEN and RETRACTED by the same producer (fence 8) ─────────
  /** What the user can DO about a code — the item's detail must say. */
  function remedyFor(rec, code) {
    const mod = realByKind.get(rec.kind);
    // r4: an account's OAuth client lives ON the account (never an Integrations card)
    const perAccount = !!(mod && rowOf(mod) && rowOf(mod).bindsPerAccount);
    switch (code) {
      case 'auth-expired': return `Re-authorize ${rec.label || rec.id} from the Channels panel (rail → Channels → ${rec.label || rec.id} → Re-authorize).${perAccount ? ' If its OAuth client was withdrawn, pick another one in the same dialog — switching the client is a re-authorization.' : ''}`;
      case 'rate-limited': return `The vendor is limiting how fast this account may read. VibeSpace paces its calls per second and per minute (Settings → Channels) and retries after a short wait — the vendor's own Retry-After when it sends one, else 5 s doubling to 60 s — never a 15-minute park. If this persists, lower the per-second setting, or check other clients reading the same account.`;
      case 'forbidden': return 'The vendor refuses this account access to these conversations. Check the app\'s granted scopes and the account\'s membership in them.';
      case 'transport': return 'The vendor could not be reached from this machine. Check egress / DNS; the loop retries with backoff.';
      default: return 'See the adapter row in the Channels panel; the loop retries with backoff.';
    }
  }
  /** verify r6: THE OWNER IS TOLD when a sign-in the vendor answered could not reach the disk. The store's write mutates
   *  the live record BEFORE the file write (the process keeps using the vendor's token; the disk lags until the next
   *  successful adapters write), so the ONE thing nothing on disk can know is what a restart before that means — under
   *  Lark's rotation the disk holds a RETIRED token and the next boot's refresh is `invalid_grant`. ONE open item per
   *  account, in memory (the store is what failed), retracted by the next write that lands (a token write, a passing pass). */
  const unsavedItems = new Map();   // rec.id -> {id, text}
  function speakUnsaved(rec, err) {
    const why = String((err && err.message) || err || 'write refused').slice(0, 200);
    log.error(`[channels] ${rec.id}: the sign-in could not be saved to disk (${why}) — the process keeps using it; a restart before the disk is writable again needs a re-authorize`);
    if (!userTodos || typeof userTodos.add !== 'function' || unsavedItems.has(rec.id)) return;
    const label = rec.label || rec.id;
    const text = `Channel ${label}: its refreshed sign-in could not be saved to disk (${why})`;
    try {
      const item = userTodos.add(INBOX_KEY, {
        origin: 'channels', // B-328d
        text,
        detail: `Adapter: ${label} (${rec.kind})\nThe vendor answered a refreshed sign-in and VibeSpace keeps using it, but data/channels/adapters.json could not be written: ${why}\n\nIt is written again with the next change. If VibeSpace restarts before a write succeeds, the disk still holds the previous sign-in — re-authorize ${label} then.\n\nThis item is retracted automatically once a write lands.`,
        urgency: 'high', by: 'agent', sessionName: 'Channels',
        i18n: { text: { key: i18nKey('Channel {label}: its refreshed sign-in could not be saved to disk ({error})'), params: { label, error: why } }, source: INBOX_SOURCE },
      });
      if (item && item.id) unsavedItems.set(rec.id, { id: item.id, text });
    } catch (e) { log.warn(`[channels] ${rec.id}: could not file the unsaved sign-in in the inbox: ${(e && e.message) || e}`); }
  }
  function retractUnsaved(rec) {
    const it0 = unsavedItems.get(rec.id);
    if (!it0) return;
    unsavedItems.delete(rec.id);
    if (!userTodos || typeof userTodos.get !== 'function') return;
    try {
      const it = userTodos.get(it0.id);
      if (it && it.status === 'open' && it.sessionKey === INBOX_KEY && it.text === it0.text) { userTodos.setStatus(it0.id, 'done', RESOLVED_BY); log.log(`[channels] ${rec.id}: the sign-in reached the disk — retracted the inbox item`); }
    } catch (e) { log.warn(`[channels] ${rec.id}: could not retract the unsaved-sign-in item: ${(e && e.message) || e}`); }
  }
  async function speakFailure(rec, code, err, n = FAILURES_BEFORE_LOUD) {
    if (!userTodos || typeof userTodos.add !== 'function') return;
    // ONE OPEN ITEM PER ACCOUNT (lane R5 verify r2): the two ladders — the rate
    // one (loud at RATE_STRIKES_LOUD) and the failure one (loud at
    // FAILURES_BEFORE_LOUD) — are independent, so a transport failure after a
    // rate item (or the reverse) filed a SECOND item while `rec.failureItem`
    // could remember only one: the first outlived the recovery, open forever,
    // its own detail promising a retraction. The standing item is retracted as
    // SUPERSEDED before this one is filed; the first good pass retracts this one.
    if (rec.failureItem) await retractFailure(rec, 'superseded');
    const text = `Channel ${rec.label || rec.id}: ${n} consecutive failed passes (${code})`;
    const vendorWords = String((err && err.message) || err || '').slice(0, 600);
    try {
      const item = userTodos.add(INBOX_KEY, {
        origin: 'channels', // B-328d
        text,
        detail: `Adapter: ${rec.label || rec.id} (${rec.kind})\nFailure: ${code}\nVendor said: ${vendorWords}\n\nWhat to do: ${remedyFor(rec, code)}\n\nThis item is retracted automatically by the channels engine when a pass succeeds again.`,
        urgency: code === 'auth-expired' ? 'high' : 'normal',
        by: 'agent', sessionName: 'Channels',
        // the headline as structure; the detail keeps the vendor's verbatim and the remedy
        i18n: { text: { key: i18nKey('Channel {label}: {n} consecutive failed passes ({code})'), params: { label: rec.label || rec.id, n, code } }, source: INBOX_SOURCE },
      });
      if (item && item.id) await store.adapters.update(() => { rec.failureItem = { id: item.id, text, code, at: now() }; });
    } catch (e) { log.warn(`[channels] ${rec.id}: could not file the failure in the inbox: ${(e && e.message) || e}`); }
  }
  /** The retraction: ONLY the item this engine filed (same id, same text),
   *  only while it is still open — the user's own resolution stands. */
  async function retractFailure(rec, why = 'recovered') {
    if (!rec.failureItem) return;
    const fi = rec.failureItem;
    await store.adapters.update(() => { rec.failureItem = null; });
    if (!userTodos || typeof userTodos.get !== 'function') return;
    try {
      const it = userTodos.get(fi.id);
      if (it && it.status === 'open' && it.sessionKey === INBOX_KEY && it.text === fi.text) {
        userTodos.setStatus(fi.id, 'done', RESOLVED_BY);
        log.log(`[channels] ${rec.id}: ${why} — retracted the inbox item (${fi.code})`);
      }
    } catch (e) { log.warn(`[channels] ${rec.id}: could not retract the inbox item: ${(e && e.message) || e}`); }
  }

  // ── connect / re-authorize / disconnect: the user's consent flow ─────────
  /** A CONNECTABLE kind is one with a real module (an integration row, a
   *  consent flow). N ACCOUNTS per kind since 2026-09-22 (the owner's mounts
   *  model): the FIRST record's id IS the kind (every existing record,
   *  conversation, reach entry and filter stays valid untouched); every
   *  further one is `<kind>:<8 hex>` with its own label and credential. */
  function connectableFor(kind) {
    const mod = realByKind.get(kind);
    if (!mod) throw new ChannelError('not-supported', `'${kind}' cannot be connected — it is not a channel adapter with a consent flow (connectable: ${[...realByKind.keys()].join(', ')})`, { retryable: false });
    return mod;
  }
  /** The id of the NEXT account of a kind: the kind itself while no record
   *  carries it, else `<kind>:<8 hex>` — never one already taken. */
  function mintAdapterId(kind, recs) {
    const taken = new Set(recs.adapters.map((r) => r.id));
    if (!taken.has(kind)) return kind;
    for (let i = 0; i < 16; i++) { const id = `${kind}:${crypto.randomBytes(4).toString('hex')}`; if (!taken.has(id)) return id; }
    throw new Error(`could not mint a free adapter id for ${kind}`);
  }
  function newRecord(mod, { id = mod.kind, credentialKey = null } = {}) {
    const c = mod.caps;
    const options = {};
    for (const o of mod.OPTIONS || []) if (o.default !== undefined) options[o.key] = o.default;
    return {
      id, kind: mod.kind, label: mod.label || mod.kind, enabled: true,
      // THE ACCOUNT'S CREDENTIAL BINDING, stamped at connect from the
      // wizard's choice and never re-picked by the row's default afterwards.
      credentialKey: credentialKey || null,
      auth: { tokenEnc: null, expiresAt: null, scopes: [], user: null },
      options, state: {},
      lastPass: null, consecutiveFailures: 0, failureItem: null, lastAuthError: null, lastAuthAt: null,
      // An OPT-IN push lane (decision 20) starts OFF; every other push lane on.
      push: { enabled: c.receive === 'push' && !c.pushOptIn, claimedExclusive: 'unknown', state: null, lastEventAt: null, missRate: 0, demotedAt: null, demotedWhy: null, samples: [] },
      scan: c.receive === 'scan' ? EMPTY_SCAN() : null,
    };
  }
  // ── THE ACCOUNT'S CLIENT CHOICE (r4 §2.2–§2.4) ───────────────────────────
  const httpErr = (status, code, message, detail = null) => { const err = new Error(message); err.status = status; err.code = code; if (detail) err.detail = detail; return err; };
  /** A custom client, validated against the row's two declared fields and
   *  SEALED under `.channels-key` at once — the plaintext never outlives the
   *  request. A complaint names the FIELD and the rule, never the value. */
  function sealCustom(mod, cred) {
    const row = rowOf(mod);
    if (!row || !row.bindsPerAccount) throw httpErr(400, 'invalid-client', `${mod.label || mod.kind} has no per-account client`);
    const cf = R.clientFieldsOf(row);
    const c = cred && typeof cred === 'object' ? cred : {};
    const appId = c.appId != null ? c.appId : c[cf.idKey];
    const appSecret = c.appSecret != null ? c.appSecret : c[cf.secretKey];
    const v = R.validateValues(row, { [cf.idKey]: appId == null ? '' : String(appId), [cf.secretKey]: appSecret == null ? '' : String(appSecret) });
    if (!v.ok) throw httpErr(400, 'invalid-client', `the custom ${row.label} client is invalid — ${Object.entries(v.errors).map(([k, why]) => `${k}: ${why}`).join('; ')}`, { errors: v.errors });
    const missing = R.missingFields(row, v.values);
    if (missing.length) throw httpErr(400, 'invalid-client', `the custom ${row.label} client needs ${missing.join(', ')}`, { missing });
    return { appId: v.values[cf.idKey] || '', appSecretEnc: box.enc(v.values[cf.secretKey]) };
  }
  /** THE CLIENT CHOICE a request names, normalized: `{credentialKey,
   *  credential}` — `cluster:<k>` (also spelled `clientPreset:'<k>'`, the
   *  storage dialog's field), `custom` + `credential {appId, appSecret}`
   *  (also `clientId` + `clientSecret`), validated against what the row
   *  offers RIGHT NOW (`400 unknown-credential` / `invalid-client` / `own-
   *  retired` by name). `null` when the request names none and
   *  `allowDefault` is off (re-authorize keeps the account's own). */
  function clientChoice(mod, input = {}, { allowDefault = true } = {}) {
    const b = input && typeof input === 'object' ? input : {};
    // 2.369.195: `fromMount` = a storage mount's own client, copied server-side.
    // ONE client per request: beside a preset / custom id / credential it is
    // refused by name (the dialog never sends both — a stale hidden custom
    // input must not decide which client an account signs in under).
    if (namesMount(b)) return clientFromMount(mod, b.fromMount);
    let key = typeof b.credentialKey === 'string' && b.credentialKey ? b.credentialKey : null;
    let cred = b.credential && typeof b.credential === 'object' ? b.credential : null;
    if (!key && typeof b.clientPreset === 'string' && b.clientPreset) key = b.clientPreset === CUSTOM_KEY ? CUSTOM_KEY : CLUSTER_PREFIX + b.clientPreset;
    if ((!key || key === CUSTOM_KEY) && !cred && (b.clientId != null || b.clientSecret != null)) { key = CUSTOM_KEY; cred = { appId: b.clientId, appSecret: b.clientSecret }; }
    if (!key && cred) key = CUSTOM_KEY;
    if (key === CUSTOM_KEY) return { credentialKey: CUSTOM_KEY, credential: sealCustom(mod, cred) };
    if (key) { assertOffered(mod, key); return { credentialKey: key, credential: null }; }
    if (!allowDefault) return null;
    return { credentialKey: defaultCredentialKey(mod.integration), credential: null };
  }
  // ── A STORAGE MOUNT'S CLIENT, BORROWED (2.369.195: "use the OAuth client
  // of a storage mount") ───────────────────────────────────────────────────
  // The mount → channel door the per-account design lacked (the account's
  // client is chosen in the storage dialog's grammar; a custom client typed
  // once for Drive / Gmail-as-a-folder is the SAME Google client). The secret
  // travels ONLY server-side: `mountClients.of` decrypts it with `.mounts-key`
  // (the mounts module owns its key), `sealCustom` validates it against the
  // row's two fields and SEALS it under `.channels-key` in the same call — the
  // account then holds an ordinary `custom` credential {appId, appSecretEnc}.
  // Nothing about it reaches a response body, a frame or a log line; the
  // copy is an audit line naming the mount (never a value).
  /** The mount's client as a `custom` choice — refused BY NAME: the row
   *  borrows no storage client (Lark) / no mounts here / the mount is gone /
   *  holds no custom client / holds another vendor's / cannot be decrypted. */
  /** ONE client per request (verify r1: asked by EVERY verb that reads a
   *  `fromMount` — start / connect / re-authorize AND Connect's own body):
   *  a storage mount named beside a preset / custom id / credential is
   *  refused by name BEFORE anything is read — the dialog never sends both;
   *  a stale hidden custom input must not decide which client an account
   *  signs in under. Returns whether the body names a mount at all. */
  function namesMount(b) {
    if (!(typeof b.fromMount === 'string' && b.fromMount)) return false;
    if (b.credentialKey || b.clientPreset || b.credential || b.clientId != null || b.clientSecret != null) throw httpErr(400, 'ambiguous-client', 'the request names a storage mount\'s client AND another client — name one');
    return true;
  }
  const mountRefusal = (e) => { const code = (e && e.code) || 'mount-no-client'; return httpErr(code === 'mount-gone' ? 404 : code === 'no-mounts' ? 503 : code === 'mount-client-vendor' ? 400 : 409, code, String((e && e.message) || e)); };
  /** THE KEY-LESS HALF of a borrow (verify r2): the row's vendor, the mounts
   *  door, the mount's ID and every refusal that needs no key — gone / no
   *  client / another vendor's (`mountClients.head`, nothing decrypted) —
   *  and the registry's ID RULE (a storage record never validated its id;
   *  an id the row refuses is refused HERE, before the secret is opened).
   *  Returns `{mountId, name, vendor, clientId}`. */
  function mountHead(mod, mountId) {
    const vendor = R.oauthClientVendorOf(rowOf(mod));
    if (!vendor) throw httpErr(400, 'mount-client-unsupported', `${mod.label || mod.kind} signs in with its own app's client — no storage mount holds one`);
    if (!mountClients || typeof mountClients.of !== 'function' || typeof mountClients.head !== 'function') throw httpErr(503, 'no-mounts', 'storage mounts are not available on this instance');
    let h;
    // the vendor rides DOWN (verify r1): the mounts module refuses another vendor's mount BEFORE it
    // opens the secret — nothing is decrypted for a body that is refused, and the refusal names the
    // vendor (an undecryptable OneDrive mount in a Gmail body used to answer `mount-secret-undecryptable`)
    try { h = mountClients.head(String(mountId), { vendor }); }
    catch (e) { throw mountRefusal(e); }
    if (!h || h.vendor !== vendor) throw httpErr(400, 'mount-client-vendor', `the storage mount "${(h && h.name) || mountId}" holds a ${(h && h.vendor) || 'different'} client — ${mod.label || mod.kind} signs in with a ${vendor} one`);
    const row = rowOf(mod);
    const cf = R.clientFieldsOf(row);
    const v = R.validateValues(row, { [cf.idKey]: String(h.clientId || '') });
    if (!v.ok) throw httpErr(400, 'invalid-client', `the storage mount "${h.name}"'s client is not one ${row.label} can use — ${Object.entries(v.errors).map(([k, why]) => `${k}: ${why}`).join('; ')}`, { errors: v.errors });
    return { mountId: h.mountId, name: cleanLabel(h.name), vendor: h.vendor, clientId: String(h.clientId) };
  }
  function clientFromMount(mod, mountId) {
    const h = mountHead(mod, mountId);   // every key-free refusal, before the key is used
    let c;
    try { c = mountClients.of(String(mountId), { vendor: h.vendor }); }
    catch (e) { throw mountRefusal(e); }
    const credential = sealCustom(mod, { appId: c.clientId, appSecret: c.clientSecret });   // the secret's own rule (needs the secret) + the seal
    return { credentialKey: CUSTOM_KEY, credential, fromMount: { mountId: h.mountId, name: h.name } };
  }
  /** The dialog's list (`GET /api/channels/oauth/mount-clients?kind=`): the
   *  mounts whose own client this TYPE can borrow — re-whitelisted here, so
   *  nothing but the five named fields can ever ride the answer. */
  function mountClientsFor(kind) {
    const mod = connectableFor(String(kind || ''));
    const vendor = R.oauthClientVendorOf(rowOf(mod));
    if (!vendor || !mountClients || typeof mountClients.list !== 'function') return { kind: mod.kind, vendor: vendor || null, clients: [] };
    // verify r2: the name and the mailbox are BOUNDED here too (the store caps add()/update() at 60; a hand-edited record is not the dialog's problem)
    const clients = (mountClients.list(vendor) || []).map((x) => ({ mountId: String(x.mountId), name: cleanLabel(x.name), type: x.type ? String(x.type) : null, email: x.email ? cleanLabel(x.email) : null, clientIdPrefix: String(x.clientIdPrefix || '').slice(0, 12) }));
    return { kind: mod.kind, vendor, clients };
  }
  /** verify r3: WHAT WAS COPIED, said back — the answer of every verb that
   *  borrowed a mount's client names the mount and the id's prefix actually
   *  copied (bounded, never a secret). The list's prefix is a hint at list
   *  time; the choice is BY MOUNT and the copy is the mount's client at the
   *  sign-in's START — a mount edited between the list and the pick signs in
   *  under its CURRENT client, and this field (with the audit line) is where
   *  that is told; Connect naming the same mount lands THIS copy (never re-read). */
  function mountNamed(choice) {
    if (!choice || !choice.fromMount) return null;
    return { mountId: String(choice.fromMount.mountId), name: cleanLabel(choice.fromMount.name), clientIdPrefix: String((choice.credential && choice.credential.appId) || '').slice(0, 12) };
  }
  const withMount = (answer, choice) => { const m = mountNamed(choice); return m ? { ...answer, fromMount: m } : answer; };
  /** ONE audit line per copy a verb BEGINS a consent with (start / connect /
   *  re-authorize — Connect's re-check of the same client is not a copy). */
  function auditMountCopy(choice, mod, adapterId = null) {
    if (!choice || !choice.fromMount) return;
    try { store.audit({ kind: 'auth', op: 'client-from-mount', mountId: choice.fromMount.mountId, adapterKind: mod.kind, adapterId, clientIdPrefix: String(choice.credential.appId || '').slice(0, 12), at: now(), by: 'user' }); } catch {}
    log.log(`[channels] ${adapterId || mod.kind}: the OAuth client of storage mount "${cleanLabel(choice.fromMount.name)}" (${choice.fromMount.mountId}) copied onto the ${mod.label || mod.kind} sign-in`);   // verify r2: one line, the name bounded (a newline in a name forged a journal line)
  }
  /** Does the account already hold THIS client? (a same-id custom client
   *  with a new secret is the same client — its secret is replaced in place) */
  function sameClient(rec, choice) {
    if ((rec.credentialKey || null) !== choice.credentialKey) return false;
    if (choice.credentialKey !== CUSTOM_KEY) return true;
    return !!(rec.credential && String(rec.credential.appId || '') === String(choice.credential.appId || ''));
  }
  /** Refuse, BEFORE anything begins, a choice that resolves to no usable
   *  client (the adapter's typed `auth-expired {needsCredentials}` shape the
   *  route maps to 409). */
  function assertResolvable(mod, rec) {
    const f = credentialFactsFor(rec);
    if (f.source === 'none' || f.source === 'unknown' || (Array.isArray(f.missing) && f.missing.length)) {
      throw new ChannelError('auth-expired', `cannot start a ${mod.label || mod.kind} consent flow: ${f.why || 'no application credential is configured'}`, { retryable: false, detail: { needsCredentials: true, missing: f.missing || [], code: f.whyCode || undefined } });
    }
  }
  /** The options AS APPLIED: an adapter that derives one option from
   *  another (Gmail: a custom query on an unset scope IS the query scope)
   *  exports `effectiveOptions`, so the panel's health line and the Edit
   *  dialog say what the adapter really reads, never a stored default. */
  function viewOptions(mod, rec) {
    const o = { ...(rec.options || {}) };
    if (mod && typeof mod.effectiveOptions === 'function') { try { return { ...mod.effectiveOptions(o) }; } catch { return o; } }
    return o;
  }
  /** A request's per-type fields (the adapter's declared OPTIONS), checked
   *  exactly as `setOptions` checks them. */
  function normalizeOptions(mod, patch, base = {}) {
    const decls = (mod && mod.OPTIONS) || [];
    if (patch == null) return { ...base };
    if (typeof patch !== 'object' || Array.isArray(patch)) throw httpErr(400, 'bad-request', 'options must be an object');
    const next = { ...base };
    for (const [k, raw] of Object.entries(patch)) {
      const d = decls.find((o) => o.key === k);
      if (!d) throw httpErr(400, 'unknown-option', `'${k}' is not an option of ${mod.label || mod.kind} (declared: ${decls.map((o) => o.key).join(', ') || 'none'})`);
      if (raw === null || raw === undefined) continue;
      if (typeof raw !== 'string') throw httpErr(400, 'bad-request', `'${k}' must be a string`);
      const v = raw.trim();
      if (v.length > (d.maxLength || 500)) throw httpErr(400, 'bad-request', `'${k}' is longer than ${d.maxLength || 500} characters`);
      const val = v || (d.default !== undefined ? d.default : '');
      if (Array.isArray(d.choices) && d.choices.length && !d.choices.includes(val)) throw httpErr(400, 'bad-request', `'${k}' must be one of ${d.choices.join(', ')} (got '${val}')`);
      next[k] = val;
    }
    return next;
  }
  const cleanLabel = (name) => String(name == null ? '' : name).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);

  // ── THE TRANSIENT CONSENT FLOW: signed in BEFORE the account exists ──────
  // The storage dialog's shape (`/api/mounts/gdrive-auth/{start,status,
  // callback}`): the dialog's sign-in block starts a flow for a CHOICE of
  // client, the adapter's OWN begin/exchange runs against a record that
  // exists only in memory (id `pending:<hex>`, its token sealed in memory),
  // and `connect({flowId})` creates the record at that moment — a dialog
  // closed half-way leaves nothing behind. The same machine carries a
  // RE-AUTHORIZE THAT SWITCHES THE CLIENT (`target`): the account keeps its
  // old client and token until the consent under the new client lands, then
  // both are replaced in ONE write — never a record bound to a client its
  // token was not issued under.
  const pendingFlows = new Map();   // flowId -> pending
  function sweepPending() {
    const t = now();
    for (const [id, p] of pendingFlows) if (t - p.startedAt > PENDING_FLOW_TTL_MS) { try { flows.cancel(id, 'expired'); } catch {} pendingFlows.delete(id); }
  }
  const latestPending = () => { let best = null; for (const p of pendingFlows.values()) if (!p.targetId && (!best || p.startedAt >= best.startedAt)) best = p; return best; };
  /** verify r8: does the pending flow's TARGET hold a sign-in right now (the refusal's tail says so). */
  const targetHolds = (p) => { const t = p.targetId ? adapterRecords().adapters.find((x) => x.id === p.targetId) : null; return !!(t && t.auth && t.auth.tokenEnc); };
  async function beginPending(mod, choice, { target = null, options = null } = {}) {
    sweepPending();
    const id = target ? target.id : `pending:${crypto.randomBytes(6).toString('hex')}`;
    const rec = newRecord(mod, { id, credentialKey: choice.credentialKey });
    if (choice.credential) rec.credential = choice.credential;
    rec.options = normalizeOptions(mod, options, target ? { ...(target.options || {}) } : rec.options);
    if (target) rec.label = target.label;
    assertResolvable(mod, rec);
    const p = { flowId: null, kind: mod.kind, choice, rec, targetId: target ? target.id : null, tokenEnc: null, tokenMeta: null, done: false, ok: null, error: null, user: null, startedAt: now(), adapter: null };
    const memTokens = {
      read() {
        if (!p.tokenEnc) return { token: null, why: 'never-authenticated' };
        try { return { token: JSON.parse(box.dec(p.tokenEnc)), why: null }; } catch (e) { return { token: null, why: `token-undecryptable: ${(e && e.message) || e}` }; }
      },
      async write(token, meta = {}) {
        // verify r7: a consent cancelled meanwhile writes nothing; a consent naming nobody is refused here too
        // (verify r8: the engine's stop is a cancel too; the sentence says whether the TARGET keeps a sign-in)
        const c = (meta.consent && typeof meta.consent.cancelled === 'function' ? meta.consent.cancelled() : null) || (stopped ? 'shutdown' : null);
        if (c) throw new ChannelError('auth-expired', cancelledSentence(rec.label || rec.id, String(c), targetHolds(p)), { retryable: false, detail: { cancelled: String(c) } });
        const offered = identityOf(token);
        if (meta.consent && !Object.keys(offered).length) throw new ChannelError('forbidden', namelessSentence(rec.label || rec.id, 'the sign-in named no account'), { retryable: false, detail: { nameless: true } });
        p.tokenEnc = box.enc(JSON.stringify(token));
        p.identity = offered;   // verify r5: judged against the target's held identity when the rebind lands
        p.tokenMeta = { expiresAt: meta.expiresAt == null ? null : Number(meta.expiresAt), scopes: Array.isArray(meta.scopes) ? meta.scopes.slice() : [], user: meta.user || token.name || token.email || token.openId || null, refusedScopes: refusedScopesOf(meta.refusedScopes) };
      },
      async clear() { p.tokenEnc = null; p.tokenMeta = null; },
    };
    const memState = { read: () => ({}), write: async () => {} };
    p.adapter = registry.create(mod.kind, rec, { now, resolveIntegration: resolverFor(rec), fetch: fetchFn, log, tokens: memTokens, state: memState, oauth: flows, onAuthDone: (_id, r) => onPendingDone(p, r), deliver, liveSessions, credentialKey: rec.credentialKey || null });
    const flow = await p.adapter.auth.begin();
    p.flowId = flow.flowId;
    pendingFlows.set(p.flowId, p);
    return { flowId: p.flowId, kind: mod.kind, credentialKey: choice.credentialKey, flow: safeFlow(flow) };
  }
  async function onPendingDone(p, r) {
    // verify r8: NOTHING is written after stop — the pending's durable write (applyRebind / Connect) is dropped
    if (stopped) { pendingFlows.delete(p.flowId); log.log(`[channels] ${p.targetId || p.kind}: a sign-in completed after the engine stopped — nothing is written after stop (${r && r.ok ? 'its consent is not applied' : (r && r.error) || 'the consent flow failed'}); sign in again after the restart`); return; }
    p.done = true;
    p.cancelled = (r && r.cancelled) || null;
    // verify r7: a flow cancelled mid-exchange is not a consent. verify r8: HERE the durable write is still ahead
    // (applyRebind / Connect), so a cancel the loopback carried beside ok:true — it arrived after the MEMORY write —
    // still wins; the record's own door is the opposite case (its write is the fact, `onAuthDone` reads ok as landed)
    p.ok = !!(r && r.ok) && !!p.tokenEnc && !p.cancelled;
    p.error = p.ok ? null : (p.cancelled && !(r && r.error) ? cancelledSentence(p.rec.label || p.targetId || p.kind, p.cancelled, targetHolds(p)) : String((r && r.error) || 'the consent flow failed'));
    p.user = (p.tokenMeta && p.tokenMeta.user) || (r && r.result && r.result.user) || null;
    if (p.targetId && r && r.cancelled === 'superseded') { pendingFlows.delete(p.flowId); log.log(`[channels] ${p.targetId}: an older re-authorize completed after a newer one and was refused — the newer sign-in stands`); return; }   // verify r7
    if (p.targetId) return applyRebind(p);
    if (p.ok) log.log(`[channels] ${p.kind}: signed in${p.user ? ` as ${p.user}` : ''} (${p.choice.credentialKey}) — waiting for Connect`);
    else log.warn(`[channels] ${p.kind}: consent flow failed: ${p.error}`);
  }
  /** The switched-client re-authorize LANDS: client + token in ONE write. */
  async function applyRebind(p) {
    pendingFlows.delete(p.flowId);
    const rec = adapterRecords().adapters.find((x) => x.id === p.targetId);
    if (!rec) { log.warn(`[channels] ${p.targetId}: re-authorize finished for an account that is gone`); return; }
    if (!p.ok) {
      await store.adapters.update(() => { rec.lastAuthError = p.error; rec.lastAuthAt = now(); });
      log.warn(`[channels] ${rec.id}: re-authorize under ${p.choice.credentialKey} failed: ${p.error} — the account keeps its client and token`);
      if (!stopped) notify([]);
      return;
    }
    // verify r5 (credential): a rebind whose consent names ANOTHER identity than the account's keeps client and token
    // (r6: the held identity read off the token the record holds; a consent naming nobody onto a held identity refused)
    const held = heldIdentity(rec, tokensFor(rec).read().token);
    const offered = p.identity || {};
    const mm = identityMismatch(held, offered) || (Object.keys(held).length && !Object.keys(offered).length ? { nameless: true } : null);
    if (mm) {
      const s = mm.nameless ? namelessSentence(rec.label || rec.id, 'the sign-in named no account') : mismatchSentence(rec.label || rec.id, mm);
      await store.adapters.update(() => { rec.lastAuthError = s; rec.lastAuthAt = now(); });
      log.warn(`[channels] ${rec.id}: re-authorize under ${p.choice.credentialKey} refused: ${s} — the account keeps its client and token`);
      if (!stopped) notify([]);
      return;
    }
    await store.adapters.update(() => {
      rec.credentialKey = p.choice.credentialKey;
      if (p.choice.credential) rec.credential = p.choice.credential; else delete rec.credential;
      rec.auth = { ...(rec.auth || {}), tokenEnc: p.tokenEnc, expiresAt: p.tokenMeta.expiresAt, scopes: p.tokenMeta.scopes, user: p.tokenMeta.user || (rec.auth && rec.auth.user) || null, updatedAt: now(), scopesAt: now(), refusedScopes: p.tokenMeta.refusedScopes || [] };
      if (p.identity && Object.keys(p.identity).length) rec.identity = { ...(rec.identity || {}), ...p.identity };
      rec.lastAuthError = null; rec.lastAuthAt = now();
    });
    dropLive(rec.id, 'client switched');
    log.log(`[channels] ${rec.id}: re-authorized under ${rec.credentialKey}${rec.auth.user ? ` as ${rec.auth.user}` : ''}`);
    const e = adapterFor(rec);
    await refreshAuth(e);
    e.failures = 0; e.nextAt = 0; e.rateStrikes = 0; e.backoffKind = null;
    await retractFailure(rec);
    await rejudgeConvCaps(rec, 're-authorized');   // inc-muk9jj0j-rel3: every conversation, BEFORE the one whole digest
    if (!stopped) notify([]);
    if (!stopped) pass(rec.id, { force: true }).catch((err) => log.warn('[channels] pass after re-authorize failed:', err && err.message));
    if (!stopped && timer) syncPushLanes().catch(() => {});
  }
  /** START a consent for an account that does not exist yet:
   *  `{kind, clientPreset | credentialKey | clientId + clientSecret |
   *  credential, options?}` → `{flowId, url, flow}`. */
  async function startOAuth(input = {}) {
    const mod = connectableFor(String(input.kind || input.backend || ''));
    normalizeOptions(mod, input.options, {});   // verify r2: a body refused on its options never opens a mount's secret (judged again, on the record, in beginPending)
    const choice = clientChoice(mod, input);
    const r = await beginPending(mod, choice, { options: input.options });
    auditMountCopy(choice, mod);
    return withMount({ ...r, url: r.flow && r.flow.consentUrl }, choice);   // verify r3: the answer names the client copied
  }
  function pendingOrThrow(flowId) {
    sweepPending();
    const p = flowId ? pendingFlows.get(String(flowId)) : latestPending();
    if (!p || p.targetId) throw httpErr(404, 'no-flow', 'no sign-in in progress — start one with the account dialog\'s sign-in button');
    return p;
  }
  /** STATUS: `token` is the FLOW ID once the sign-in succeeded — the handle
   *  the shared consent block writes into its field and the dialog submits
   *  with Connect (the storage block's contract); never a credential. */
  function oauthStatus(flowId = null) {
    const p = pendingOrThrow(flowId);
    const st = flows.status(p.flowId);
    const cancelled = st && st.cancelled ? st.cancelled : null;
    return {
      flowId: p.flowId, kind: p.kind, credentialKey: p.choice.credentialKey,
      running: !p.done && !!(st && st.running), done: p.done, ok: p.done ? p.ok : null,
      // verify r4: an end that is the consent machine's own act (the timeout, the cap) carries ITS sentence on the flow;
      // a flow the machine no longer knows (retired under this record) is SAID too, never a wordless stop
      error: p.error || (cancelled && !p.done ? ((st && st.error) || `the sign-in was ${cancelled === 'timeout' ? 'not finished in time' : cancelled}`) : (!p.done && !st ? 'the sign-in is no longer running — sign in again' : null)),
      user: p.user, flow: safeFlow(st), token: p.done && p.ok ? p.flowId : null,
    };
  }
  /** PASTE-BACK for a pending flow: the redirect URL the browser landed on. */
  async function oauthCallback({ url, flowId = null } = {}) {
    const p = pendingOrThrow(flowId);
    if (!url || typeof url !== 'string') throw httpErr(400, 'bad-request', 'url is required (the redirect URL your browser landed on)');
    let r;
    try { r = await p.adapter.auth.finish(p.flowId, url); }
    catch (e) { if (e && e.status) throw e; throw httpErr(400, (e && e.code) || 'bad-callback', String((e && e.message) || e)); }
    const ok = !!(r && r.ok) && p.ok !== false;
    return { ok, error: ok ? null : ((r && r.error) || p.error || 'the consent flow failed'), flowId: p.flowId, user: p.user, token: ok ? p.flowId : null };
  }

  /** CONNECT (r4): with `flowId` — THE account dialog's Connect — the record
   *  is CREATED here from a finished sign-in: its client is the flow's (a
   *  body naming another is `400 flow-client-mismatch`), its token the one
   *  that flow minted, `{name, options}` from the dialog; the flow is taken
   *  ONCE. Without `flowId` — the pre-r4 wizard path — a record is minted
   *  (always with `newAccount`, or when the type has none yet) under the
   *  choice (`cluster:<k>` / `custom` + credential; omitted = the row's
   *  pick) and its consent begins; without `newAccount` on a type that has
   *  an account, the FIRST account is re-authorized. */
  async function connect(kind, input = {}) {
    const b = input && typeof input === 'object' ? input : {};
    const mod = connectableFor(kind);
    if (b.flowId) return connectFromFlow(mod, b);
    const recs = adapterRecords();
    const existing = recs.adapters.filter((r) => r.kind === kind);
    if (!b.newAccount && existing.length) return reauthorize((existing.find((r) => r.id === kind) || existing[0]).id, b);
    // THE CREDENTIAL QUESTION IS ASKED BEFORE A RECORD EXISTS (the r2 ④
    // rule): a record nobody can connect is never minted.
    normalizeOptions(mod, b.options, {});   // verify r2: the options first — a body refused on them never opens a mount's secret
    const choice = clientChoice(mod, b);
    const rec = newRecord(mod, { id: mintAdapterId(kind, recs), credentialKey: choice.credentialKey });
    if (choice.credential) rec.credential = choice.credential;
    rec.options = normalizeOptions(mod, b.options, rec.options);
    if (b.name) rec.label = cleanLabel(b.name) || rec.label;
    assertResolvable(mod, rec);
    const e = adapterFor(rec);
    let flow;
    try { flow = await e.adapter.auth.begin(); }
    catch (err) { dropLive(rec.id, 'connect refused'); paceCarry.delete(rec.id); throw err; }   // a refused begin on a fresh record leaves nothing behind (not even its ghost bucket)
    await store.adapters.update((a) => { a.adapters.push(rec); });
    auditMountCopy(choice, mod, rec.id);
    notify([]);
    return withMount({ adapter: adapterView(rec), flow: safeFlow(flow) }, choice);
  }
  async function connectFromFlow(mod, b) {
    sweepPending();
    const p = pendingFlows.get(String(b.flowId));
    if (!p || p.targetId) throw httpErr(404, 'no-flow', 'no finished sign-in with that id — sign in again from the account dialog');
    if (p.kind !== mod.kind) throw httpErr(400, 'flow-kind-mismatch', `that sign-in was for ${p.kind}, not ${mod.kind}`);
    // verify r4: a sign-in that is neither finished nor running any more (ended under this record, or retired by the
    // machine) is refused as ENDED, by its own sentence — not as "not finished yet"
    const live = flows.status(p.flowId);
    if (!p.done && !(live && live.running)) throw httpErr(409, 'flow-failed', `the sign-in ended before it finished: ${(live && (live.error || live.cancelled)) || 'it is no longer running'} — sign in again`);
    if (!p.done) throw httpErr(409, 'flow-not-done', 'the sign-in has not finished yet — approve access on the sign-in page (or paste the redirect URL back) first');
    if (!p.ok) throw httpErr(409, 'flow-failed', `the sign-in failed: ${p.error || 'unknown'} — sign in again`);
    // verify r2: EVERY refusal that needs neither a key nor the flow comes first — the options are
    // judged before the flow is taken (a Connect refused for a bad option used to CONSUME the finished
    // sign-in: the next Connect answered no-flow and the consent had to be run again)
    const options = normalizeOptions(mod, b.options, p.rec.options);
    // 2.369.195: Connect naming the SAME storage mount the sign-in began with IS the flow's client
    // (the copy the consent ran under) — never re-read, so a mount edited or removed meanwhile cannot
    // turn a finished sign-in into a refusal; another mount is resolved and compared like any client
    // (verify r1: the ONE-client rule is asked here too — a stale preset / custom field beside the mount is refused, never ignored)
    const sameMount = namesMount(b) && !!p.choice.fromMount && p.choice.fromMount.mountId === b.fromMount;
    const mismatch = (now_) => httpErr(400, 'flow-client-mismatch', `that sign-in ran under ${p.choice.fromMount ? `the client of storage mount "${p.choice.fromMount.name}"` : p.choice.credentialKey}; the dialog now names ${now_} — a token is bound to the client it was issued under, so sign in again under the new client`);
    let named = null;
    if (!sameMount && namesMount(b)) {
      // verify r2: ANOTHER mount is compared BY ID first (the key-less read) — a mount whose id is not the
      // flow's client is refused with nothing decrypted, and the refusal names the mismatch, never the
      // other mount's key state (an undecryptable other mount used to answer `mount-secret-undecryptable`)
      const h = mountHead(mod, b.fromMount);
      if (p.choice.credentialKey !== CUSTOM_KEY || String(h.clientId) !== String(p.choice.credential.appId)) throw mismatch(`the client of storage mount "${h.name}"`);
      named = clientFromMount(mod, b.fromMount);   // the same id: the secrets are compared (needs the key)
    } else if (!sameMount) named = clientChoice(mod, b, { allowDefault: false });
    if (named && (named.credentialKey !== p.choice.credentialKey || (named.credentialKey === CUSTOM_KEY && (String(named.credential.appId) !== String(p.choice.credential.appId) || box.dec(named.credential.appSecretEnc) !== box.dec(p.choice.credential.appSecretEnc))))) {
      throw mismatch(named.fromMount ? `the client of storage mount "${named.fromMount.name}"` : named.credentialKey);
    }
    pendingFlows.delete(p.flowId);   // taken ONCE — after every refusal above
    const recs = adapterRecords();
    const rec = newRecord(mod, { id: mintAdapterId(mod.kind, recs), credentialKey: p.choice.credentialKey });
    if (p.choice.credential) rec.credential = p.choice.credential;
    rec.options = options;
    if (b.name) rec.label = cleanLabel(b.name) || rec.label;
    rec.auth = { tokenEnc: p.tokenEnc, expiresAt: p.tokenMeta.expiresAt, scopes: p.tokenMeta.scopes, user: p.tokenMeta.user || null, updatedAt: now(), refusedScopes: p.tokenMeta.refusedScopes || [] };
    if (p.identity && Object.keys(p.identity).length) rec.identity = { ...p.identity };   // verify r5: whose account this record is, from its first consent
    rec.lastAuthAt = now();
    await store.adapters.update((a) => { a.adapters.push(rec); });
    const e = adapterFor(rec);
    await refreshAuth(e);
    log.log(`[channels] ${rec.id}: connected${rec.auth.user ? ` as ${rec.auth.user}` : ''} (${rec.credentialKey})`);
    notify([]);
    if (!stopped) pass(rec.id, { force: true }).catch((err) => log.warn('[channels] pass after connect failed:', err && err.message));
    if (!stopped && timer) syncPushLanes().catch(() => {});
    return withMount({ adapter: adapterView(rec), flow: null }, p.choice);   // verify r3: which mount's client this account was minted under
  }
  /** RE-AUTHORIZE one ACCOUNT by its adapter id (the mount semantics, r4
   *  §2.4): the SAME client ⇒ its consent begins under it (a custom client
   *  with the same id and a new secret replaces the secret first); a
   *  DIFFERENT client IS a re-authorization under it — the consent runs as a
   *  pending flow and the account's client AND token are replaced together
   *  when it lands (`rebind:true`). The pre-r4 `credential-bound` refusal is
   *  gone: switching the client is exactly what this verb is for. A legacy
   *  record with no key is stamped by `credentialKeyEvidence` first. */
  async function reauthorize(adapterId, input = {}) {
    const rec = recordOrThrow(adapterId);
    const mod = connectableFor(rec.kind);
    const choice = clientChoice(mod, input, { allowDefault: false });
    if (!choice && !rec.credentialKey) {
      const ev = credentialKeyEvidence(rec, mod);
      if (ev.key) await store.adapters.update(() => { rec.credentialKey = ev.key; });
    }
    if (rec.enabled === false) await store.adapters.update(() => { rec.enabled = true; });
    if (choice && !sameClient(rec, choice)) {
      const r = await beginPending(mod, choice, { target: rec });
      auditMountCopy(choice, mod, rec.id);
      await store.adapters.update(() => { rec.lastAuthError = null; });
      notify([]);
      return withMount({ adapter: adapterView(rec), flow: r.flow, rebind: true, credentialKey: choice.credentialKey }, choice);
    }
    if (choice && choice.credentialKey === CUSTOM_KEY) await store.adapters.update(() => { rec.credential = choice.credential; });   // same id, the secret replaced in place
    auditMountCopy(choice, mod, rec.id);
    if (rec.credentialKey === OWN_KEY) await inlineLegacyClient(rec);
    const e = adapterFor(rec);
    assertResolvable(mod, rec);
    const flow = await e.adapter.auth.begin();
    await store.adapters.update(() => { rec.lastAuthError = null; });
    notify([]);
    return withMount({ adapter: adapterView(rec), flow: safeFlow(flow) }, choice);
  }
  function recordOrThrow(adapterId) {
    const rec = adapterRecords().adapters.find((r) => r.id === adapterId);
    if (!rec) { const err = new Error(`no such adapter '${adapterId}'`); err.status = 404; err.code = 'no-such-adapter'; throw err; }
    return rec;
  }
  /** What the wire may carry about a running flow: never the `state`
   *  secret, never the exchange result. */
  function safeFlow(st) {
    if (!st) return null;
    return { flowId: st.flowId, mode: st.mode, running: !!st.running, done: !!st.done, ok: st.ok, error: st.error || null, cancelled: st.cancelled || null, consentUrl: st.consentUrl, redirectUri: st.redirectUri, port: st.port, listening: !!st.listening, refusal: st.refusal || null, pasteBack: true, startedAt: st.startedAt, expiresAt: st.expiresAt, optional: Array.isArray(st.optional) ? st.optional.slice() : [], narrowed: Array.isArray(st.narrowed) ? st.narrowed.slice() : null, groups: Array.isArray(st.groups) ? st.groups.map((g) => (Array.isArray(g) ? g.slice() : [])) : [], nextNarrow: Array.isArray(st.nextNarrow) ? st.nextNarrow.slice() : null };
  }
  /** Paste-back (§12.4): the user pastes the redirect URL their browser
   *  landed on; the adapter's own `auth.finish` runs the state check. A
   *  switched-client re-authorize runs through the SAME route (its pending
   *  flow is filed under the account's id). */
  async function finishAuth(adapterId, url) {
    const rec = recordOrThrow(adapterId);
    const running = flows.runningFor(rec.id);
    if (!running) throw new ChannelError('not-supported', `no consent flow is running for ${rec.label || rec.id} — start one with Connect`, { retryable: false, detail: { code: 'no-flow' } });
    const p = pendingFlows.get(running.flowId);
    const a = p ? p.adapter : adapterFor(rec).adapter;
    const r = await a.auth.finish(running.flowId, url);
    return { ok: !!r.ok, error: r.error || null };
  }
  /** THE ONE NARROWING RETRY (owner ruling 2026-09-28) of an account's running sign-in: the vendor refused the
   *  consent on its own page because the app has not enabled an optional scope — the same flow gets a consent URL
   *  without it, once (`already-narrowed` after). → `{flow}` (the new consent URL). */
  function narrowAuth(adapterId) {
    const rec = recordOrThrow(adapterId);
    const running = flows.runningFor(rec.id);
    if (!running) throw httpErr(404, 'no-flow', `no sign-in is running for ${rec.label || rec.id} — start one with Re-authorize`);
    return { flow: safeFlow(narrowFlow(running.flowId)) };
  }
  /** …the same for a sign-in that runs BEFORE its account exists (the account dialog's Connect). */
  function oauthNarrow(flowId = null) {
    const p = pendingOrThrow(flowId);
    return { flowId: p.flowId, flow: safeFlow(narrowFlow(p.flowId)) };
  }
  function narrowFlow(flowId) {
    if (typeof flows.narrow !== 'function') throw httpErr(501, 'not-supported', 'this consent machine cannot retry a sign-in without its optional scopes');
    try { return flows.narrow(flowId); }
    catch (e) { throw httpErr(e && e.code === 'no-flow' ? 404 : 409, (e && e.code) || 'bad-request', String((e && e.message) || e)); }
  }
  async function cancelAuth(adapterId) {
    const rec = recordOrThrow(adapterId);
    const running = flows.runningFor(rec.id);
    const cancelled = running ? flows.cancel(running.flowId, 'cancelled') : false;
    if (running) pendingFlows.delete(running.flowId);
    notify([]);
    return { ok: true, cancelled };
  }
  /** The adapter reports the flow's end (the loopback's `onDone`, through
   *  the adapter): a success re-asks auth and kicks a pass; a failure is
   *  SAID on the record (`lastAuthError`) — never swallowed. */
  async function onAuthDone(adapterId, r) {
    const rec = adapterRecords().adapters.find((x) => x.id === adapterId);
    if (!rec) return;
    // verify r8: NOTHING is written after stop — the door refused the late exchange by name (`shutdown`) or its
    // consent had already landed; either way the record is left as it is and the next boot reads it
    if (stopped) { log.log(`[channels] ${rec.id}: a sign-in completed after the engine stopped — nothing is written after stop (${r && r.ok ? 'its consent had landed and stands' : (r && r.error) || 'the consent flow failed'})`); return; }
    // verify r7: a flow a NEWER sign-in superseded and REFUSED reports its end AFTER the newer one landed — its refusal
    // is not the record's last sign-in line (the connected record used to wear "replaced by a newer sign-in" as an
    // error). verify r8: one whose consent LANDED before the newer began is a landed consent — the write is the fact
    if (r && !r.ok && r.cancelled === 'superseded') { log.log(`[channels] ${rec.id}: an older sign-in completed after a newer one and was refused (${r.error || 'superseded'}) — the newer sign-in stands`); return; }
    await store.adapters.update(() => { rec.lastAuthError = r && r.ok ? null : String((r && r.error) || 'the consent flow failed'); rec.lastAuthAt = now(); });
    const e = adapterFor(rec);
    await refreshAuth(e);
    // verify r8: THE WRITE IS THE FACT, and so is what came after it — a consent that landed and was DISCONNECTED
    // before this report (the clear() behind it in the store's chain) is not "connected": no pass, no connected line
    if (r && r.ok && !(rec.auth && rec.auth.tokenEnc)) { log.log(`[channels] ${rec.id}: the sign-in landed and the account was disconnected since — the disconnect stands`); if (!stopped) notify([]); return; }
    if (r && r.ok) { e.failures = 0; e.nextAt = 0; e.rateStrikes = 0; e.backoffKind = null; }
    if (r && r.ok) log.log(`[channels] ${rec.id}: connected${rec.auth && rec.auth.user ? ` as ${rec.auth.user}` : ''}`);
    else log.warn(`[channels] ${rec.id}: consent flow failed: ${(r && r.error) || 'unknown'}`);
    // inc-muk9jj0j-rel3: A CONSENT CHANGES WHAT EVERY CONVERSATION MAY DO — re-judged HERE, at the write, for the whole
    // account (the pass below visits only what is due), then ONE whole digest carries the fresh verdicts
    if (r && r.ok) await rejudgeConvCaps(rec, 'connected');
    if (!stopped) notify([]);
    if (r && r.ok && !stopped) pass(rec.id, { force: true }).catch((err) => log.warn('[channels] pass after connect failed:', err && err.message));
    if (r && r.ok && !stopped && timer) syncPushLanes().catch(() => {});   // a fresh consent may be what the lane was waiting for
  }
  /** DISCONNECT = drop the token, for EVERY account (r4 §4: the pre-r4
   *  "a further account's disconnect removes it" special case is gone —
   *  REMOVE is its own verb with its own reference check). The record, its
   *  client, its conversations, assignments and grants stay; a later
   *  Re-authorize resumes them. Any running flow is cancelled. */
  async function disconnect(adapterId) {
    const rec = recordOrThrow(adapterId);
    const running = flows.runningFor(rec.id);
    if (running) { flows.cancel(running.flowId, 'cancelled'); pendingFlows.delete(running.flowId); }
    // verify r4: THE exit, BEFORE the token goes — every queued paced call is aborted by name (18 × 20 units used to leave
    // with the Bearer captured before the wait), the pass in flight ends at its next step, the lane cannot outlive its credential
    dropLive(rec.id, 'disconnected');
    await tokensFor(rec).clear();
    await store.adapters.update(() => { rec.lastAuthError = null; rec.state = {}; rec.lastPass = null; delete rec.lastOkAt; rec.consecutiveFailures = 0; });
    await retractFailure(rec);
    const e = adapterFor(rec);   // rebuilt at once (its buckets carried) so the card answers the adapter's own `unknown`
    e.failures = 0; e.nextAt = 0; e.rateStrikes = 0; e.backoffKind = null; await refreshAuth(e);
    await rejudgeConvCaps(rec, 'disconnected');   // inc-muk9jj0j-rel3: no credential ⇒ nothing sends, said everywhere at once
    notify([]);
    return { ok: true };
  }
  /** WHAT STILL POINTS AT AN ACCOUNT (r4 §8.1 #5, D5): the ACCESS rows of
   *  its three grains (R4 — a watcher always has one, so a notification is
   *  named through its access), the reach grants scoped to the whole account
   *  (`scope.kind === 'adapter'`), and its UNSETTLED outbox proposals (any
   *  state that is not terminal — `unknown` included: a lost outcome still
   *  needs its adapter to be reconciled). Agent groups are NOT counted — a
   *  group references agent sessions, never a channel account. */
  function referencesOf(adapterId) {
    const refs = [];
    const seenGrant = new Set();
    for (const en of Object.values(store.index.live())) {   // B-f32b: a read-only scan of the live rows (was a whole-index copy)
      if (!en) continue;
      if (en.adapterId === adapterId) {
        for (const r of convGrainOf(en).access) refs.push({ kind: 'access', key: en.key, convId: en.id, title: conversationName(en.adapterId, en.id) || en.id, scope: 'conversation', principal: { kind: r.principal.kind, id: r.principal.id, name: r.principal.name || null } });
      }
      for (const g of en.reachEntries || []) {
        if (!g || !g.scope || g.scope.kind !== 'adapter' || g.scope.id !== adapterId) continue;
        const gid = ACL.grantId(g);
        if (seenGrant.has(gid)) continue;
        seenGrant.add(gid);
        refs.push({ kind: 'reach', grantId: gid, principal: { kind: g.principal.kind, id: g.principal.id, name: g.principal.name || null }, level: g.level, origin: g.origin });
      }
    }
    // 2026-09-26: the ACCOUNT and PATTERN grains, and the account-scope grants
    const acct = accountGrainOf(adapterId);
    for (const r of acct ? F.grainOf(acct).access : []) refs.push({ kind: 'access', key: adapterId, scope: 'account', principal: { kind: r.principal.kind, id: r.principal.id, name: r.principal.name || null } });
    for (const pa of patternsOf(adapterId)) for (const r of F.grainOf(pa).access) refs.push({ kind: 'access', key: pa.id, scope: 'pattern', title: F.patternSummary(pa.pattern), principal: { kind: r.principal.kind, id: r.principal.id, name: r.principal.name || null } });
    for (const g of store.index.table('accountGrants') || []) {
      if (!g || !g.scope || g.scope.kind !== 'adapter' || g.scope.id !== adapterId) continue;
      const gid = ACL.grantId(g);
      if (seenGrant.has(gid)) continue;
      seenGrant.add(gid);
      refs.push({ kind: 'reach', grantId: gid, principal: { kind: g.principal.kind, id: g.principal.id, name: g.principal.name || null }, level: g.level, origin: g.origin });
    }
    for (const p of Object.values(store.outbox.snapshot().proposals)) {
      if (p && p.adapterId === adapterId && !P.isTerminal(p.state)) refs.push({ kind: 'outbox', id: p.id, key: p.key, state: p.state });
    }
    return refs;
  }
  /** REMOVE an account (r4 §8.1 #5): refused `409 account-referenced` BY
   *  NAME while anything still points at it (`refs`, each named — the mounts'
   *  "a credential with submounts cannot be removed"); otherwise its live
   *  entry, pending windows, running flow, index rows and record go —
   *  through the two serialized doors (its message logs stay on disk:
   *  archive-never-destroy). The built-in Agents row is not removable. */
  async function remove(adapterId) {
    const rec = recordOrThrow(adapterId);
    if (rec.builtin) throw httpErr(400, 'builtin', `${rec.label || rec.id} is built in and cannot be removed`);
    const refs = referencesOf(rec.id);
    if (refs.length) {
      const n = (k) => refs.filter((r) => r.kind === k).length;
      throw httpErr(409, 'account-referenced', `cannot remove ${rec.label || rec.id} — it is still referenced (${[['access', 'access grant'], ['reach', 'reach grant'], ['outbox', 'outbox proposal']].filter(([k]) => n(k)).map(([k, w]) => `${n(k)} ${w}${n(k) > 1 ? 's' : ''}`).join(', ')}); release them first — Disconnect only drops the token and keeps them`, { refs });
    }
    const running = flows.runningFor(rec.id);
    if (running) { flows.cancel(running.flowId, 'cancelled'); pendingFlows.delete(running.flowId); }
    await retractFailure(rec);
    await removeRecord(rec);
    log.log(`[channels] ${rec.id}: removed`);
    notify([]);
    return { ok: true, removed: true, id: rec.id };
  }
  /** Remove ONE account: its live entry, its pending wake windows, its index
   *  rows and its adapter record — through the two serialized doors, nothing
   *  else's. */
  async function removeRecord(rec) {
    dropLive(rec.id, 'removed');
    paceCarry.delete(rec.id);   // R5: nothing left to charge
    retractUnsaved(rec);   // R5 verify r6: the unsaved-sign-in item goes with the record (the disk holds no record to lag behind)
    // every wake window of the account: its conversations', and (R4, lane R2
    // verify A9b) its account / rule scope digests — a surviving scope timer
    // would fire into a grain that is gone
    const patIds = new Set(patternsOf(rec.id).map((pa) => pa.id));
    for (const [key, w] of [...wakeTimers.entries()]) if (key.startsWith(rec.id + '/') || key.startsWith(`scope:acct:${rec.id}|`) || (key.startsWith('scope:pat:') && patIds.has(key.slice(10, key.lastIndexOf('|'))))) { clearTimeout(w.timer); wakeTimers.delete(key); }
    await store.index.update((ix) => {
      for (const k of Object.keys(ix.conversations)) if (ix.conversations[k] && ix.conversations[k].adapterId === rec.id) delete ix.conversations[k];
      if (ix.accountAssignments) delete ix.accountAssignments[rec.id];
      if (ix.patternAssignments) for (const [id, pa] of Object.entries(ix.patternAssignments)) if (pa && pa.adapterId === rec.id) delete ix.patternAssignments[id];
      if (Array.isArray(ix.accountGrants)) ix.accountGrants = ix.accountGrants.filter((g) => !(g && g.scope && g.scope.id === rec.id));
    });
    await store.adapters.update((a) => { const i = a.adapters.indexOf(rec); if (i >= 0) a.adapters.splice(i, 1); });
  }
  /** DUPLICATE an account (r4 §8.1 #2, D4): a NEW record of the same type
   *  carrying EXACTLY `DUPLICATE_FIELDS` (the custom secret re-sealed), named
   *  `name` or '<label> (copy)', UNAUTHORIZED — it gets its own consent
   *  (Re-authorize). Never the token, the tracked list, assignments, reach
   *  grants, the log or its cursors (`DUPLICATE_NEVER`). */
  async function duplicate(adapterId, { name = null } = {}) {
    const src = recordOrThrow(adapterId);
    if (src.builtin) throw httpErr(400, 'builtin', `${src.label || src.id} is built in and cannot be duplicated`);
    const mod = connectableFor(src.kind);
    if (src.credentialKey === OWN_KEY) {
      const r = await inlineLegacyClient(src);
      if (!r.ok) throw httpErr(409, 'legacy-copy-failed', `${src.label || src.id}'s client could not be moved onto the account first: ${r.why}`);
    }
    const recs = adapterRecords();
    const dup = newRecord(mod, { id: mintAdapterId(mod.kind, recs), credentialKey: null });
    dup.label = cleanLabel(name) || `${src.label || src.id} (copy)`;
    for (const f of DUPLICATE_FIELDS) {
      switch (f.key) {
        case 'kind': dup.kind = src.kind; break;
        case 'client':
          dup.credentialKey = src.credentialKey || null;
          if (src.credential && src.credential.appSecretEnc) {
            let plain;
            try { plain = box.dec(src.credential.appSecretEnc); }
            catch { throw httpErr(409, 'custom-undecryptable', `${src.label || src.id}'s own client secret cannot be decrypted with ${KEY_FILE} — edit the account and enter it again before duplicating`); }
            dup.credential = { appId: String(src.credential.appId || ''), appSecretEnc: box.enc(plain) };   // RE-SEALED: a fresh nonce, never the original ciphertext
          }
          break;
        case 'filters': dup.options = { ...(src.options || {}) }; break;
        case 'pushClaim': if (dup.push && src.push && caps.PUSH_CLAIMS.includes(src.push.claimedExclusive)) dup.push.claimedExclusive = src.push.claimedExclusive; break;
        case 'senderLine': if (src.senderHonestyLine === true || src.senderHonestyLine === false) dup.senderHonestyLine = src.senderHonestyLine; break;
        default: throw new Error(`duplicate: DUPLICATE_FIELDS declares '${f.key}' with no implementation`);
      }
    }
    await store.adapters.update((a) => { a.adapters.push(dup); });
    log.log(`[channels] ${src.id}: duplicated as ${dup.id} (unauthorized — its own sign-in follows)`);
    notify([]);
    return { adapter: adapterView(dup) };
  }
  /** RENAME / THE CUSTOM SECRET (the Edit dialog's in-place saves): `label`;
   *  `credential {appId, appSecret}` replaces a custom client's SECRET in
   *  place when the id is the account's own — a different id (or a preset)
   *  is a client SWITCH, which is a re-authorization: `409
   *  client-change-needs-reauth` names the verb. */
  async function setLabel(adapterId, label) {
    const rec = recordOrThrow(adapterId);
    const v = cleanLabel(label);
    if (!v) throw httpErr(400, 'bad-request', 'a name is required');
    await store.adapters.update(() => { rec.label = v; });
    notify([]);
    return { ok: true, label: v };
  }
  async function setCustomSecret(adapterId, credential) {
    const rec = recordOrThrow(adapterId);
    const mod = connectableFor(rec.kind);
    const choice = { credentialKey: CUSTOM_KEY, credential: sealCustom(mod, credential) };
    if (!sameClient(rec, choice)) throw httpErr(409, 'client-change-needs-reauth', `switching ${rec.label || rec.id} to another client is a re-authorization — use Re-authorize with the new client (a token is bound to the client it was issued under)`);
    await store.adapters.update(() => { rec.credential = choice.credential; });
    notify([]);
    return { ok: true, customClient: customClientView(rec) };
  }
  /** THE OWNER-ONLY CONFIG (D3, the mounts' `GET /api/mounts/:id/config`
   *  rule — the Edit dialog prefills every parameter, the custom secret
   *  included): served to the owner's UI only, never broadcast, never
   *  logged, never an agent route. */
  function adapterConfig(adapterId) {
    const rec = recordOrThrow(adapterId);
    const mod = connectableFor(rec.kind);
    let client = null;
    if (rec.credential && typeof rec.credential === 'object') {
      let appSecret = null, undecryptable = false;
      if (rec.credential.appSecretEnc) { try { appSecret = box.dec(rec.credential.appSecretEnc); } catch { undecryptable = true; } }
      client = { appId: String(rec.credential.appId || ''), appSecret, undecryptable };
    }
    return {
      id: rec.id, kind: rec.kind, label: rec.label, credentialKey: rec.credentialKey || null,
      client, presets: presetsOf(mod), clientFields: clientFieldDecls(mod),
      options: viewOptions(mod, rec),
      push: rec.push ? { enabled: !!rec.push.enabled, claimedExclusive: rec.push.claimedExclusive || 'unknown' } : null,
      senderHonestyLine: rec.senderHonestyLine === true ? true : rec.senderHonestyLine === false ? false : null,
    };
  }

  // ── THE LEGACY `own` CLIENT, COPIED ONTO ITS ACCOUNT (r4 §2.6) ───────────
  // Reader-side and idempotent: a record still naming `own` (the retired
  // card's values) gets those values decrypted through the store's ONE
  // legacy reader (`.integrations-key`) and RE-SEALED under `.channels-key`
  // onto the record — and is stamped `custom` only AFTER that write landed
  // (a crash between the two leaves `own` + the copied client, which this
  // path serves and finishes). Run when a record is read (`adapterFor` /
  // `clientFor`) and by the `2026-09-channel-custom-client-inline`
  // migration. A failure is NAMED (logged once per cause) and the record
  // keeps `own`: it is retried, never silently re-pointed at a preset.
  const inlining = new Map();       // rec.id -> in-flight copy
  const inlineSaid = new Map();     // rec.id -> last failure logged
  function legacyCopyPlan(rec) {
    const mod = realByKind.get(rec.kind);
    const row = rowOf(mod);
    if (!row || !row.bindsPerAccount) return { ok: false, code: 'no-integration', why: `${rec.kind} has no account-bound integration row` };
    if (!integrations || typeof integrations.legacyOwnValues !== 'function') return { ok: false, code: 'no-store', why: 'no integration store to read the legacy values from' };
    const lv = integrations.legacyOwnValues(row.id);
    if (!lv.ok) return { ok: false, code: lv.code, why: lv.why };
    const cf = R.clientFieldsOf(row);
    return { ok: true, credential: { appId: String(lv.values[cf.idKey] || ''), appSecretEnc: box.enc(lv.values[cf.secretKey]) } };
  }
  function inlineLegacyClient(rec) {
    if (rec.credentialKey !== OWN_KEY) return Promise.resolve({ ok: true, already: true });
    if (inlining.has(rec.id)) return inlining.get(rec.id);
    const p = (async () => {
      if (!(rec.credential && rec.credential.appSecretEnc)) {
        const plan = legacyCopyPlan(rec);
        if (!plan.ok) {
          const line = `[channels] ${rec.id}: the saved client could not be moved onto the account (${plan.code}): ${plan.why} — the account keeps 'own' and it is retried`;
          if (inlineSaid.get(rec.id) !== line) { inlineSaid.set(rec.id, line); log.error(line); }
          return { ok: false, code: plan.code, why: plan.why };
        }
        await store.adapters.update(() => { rec.credential = plan.credential; });   // the client lands FIRST (atomic write)…
      }
      await store.adapters.update(() => { rec.credentialKey = CUSTOM_KEY; });     // …and only then the stamp
      inlineSaid.delete(rec.id);
      dropLive(rec.id, 'client moved onto the account');   // rebuilt under 'custom'
      log.log(`[channels] ${rec.id}: the saved client was moved onto the account (own → custom)`);
      if (!stopped) notify([]);
      return { ok: true, copied: true };
    })().finally(() => inlining.delete(rec.id));
    inlining.set(rec.id, p);
    return p;
  }
  function scheduleInline(rec) { if (rec && rec.credentialKey === OWN_KEY && !inlining.has(rec.id)) inlineLegacyClient(rec).catch((e) => log.error(`[channels] ${rec.id}: legacy client copy failed: ${(e && e.message) || e}`)); }
  /** The migration's entry (the shared runner is synchronous): every `own`
   *  record is PLANNED now (a failure is returned BY NAME so the run fails
   *  and is retried next boot), the copies run through the serialized door,
   *  and `write` settles when every one has landed. */
  function inlineLegacyClients() {
    const report = { copied: [], failed: [], skipped: 0 };
    const writes = [];
    for (const rec of adapterRecords().adapters) {
      if (rec.credentialKey !== OWN_KEY) { report.skipped++; continue; }
      const plan = rec.credential && rec.credential.appSecretEnc ? { ok: true } : legacyCopyPlan(rec);
      if (!plan.ok) { report.failed.push({ id: rec.id, code: plan.code, why: plan.why }); continue; }
      report.copied.push(rec.id);
      writes.push(inlineLegacyClient(rec));
    }
    return { ...report, write: Promise.all(writes) };
  }
  /** THE ONE-SHOT STAMP for records that predate the account model (the
   *  `2026-09-channel-credential-key` migration calls it): every real
   *  adapter record lacking `credentialKey` is stamped by
   *  `credentialKeyEvidence` — the client its own TOKEN names when this
   *  instance still offers it (`evidence:'token'`), else the integration's
   *  CURRENT pick (`evidence:'row-pick'`, what refreshed it until now) — on
   *  the LIVE records (visible to every adapter built from now on), written
   *  through the store's serialized door; every stamped row carries its
   *  evidence and the key the token named. A record whose token names
   *  nothing offered and whose integration resolves to nothing is left
   *  unstamped (it keeps following the row's pick, as before). Idempotent: a
   *  stamped record is `already`. */
  /** verify r6: a LEGACY record (pre-r5, no `identity`) is stamped ONCE from the evidence it holds — the token
   *  (Gmail's email, Lark's open_id) else its `auth.user` when that is an email — at boot, so a disconnect after the
   *  upgrade (which wipes auth.user) and a stranger's consent find the record bound to its holder, never nameless. */
  function stampIdentities() {
    const report = { stamped: [], skipped: [] };
    for (const rec of adapterRecords().adapters) {
      if (rec.identity && typeof rec.identity === 'object' && Object.keys(identityOf(rec.identity)).length) { report.skipped.push({ id: rec.id, why: 'already' }); continue; }
      const held = heldIdentity(rec, tokensFor(rec).read().token);
      if (!Object.keys(held).length) { report.skipped.push({ id: rec.id, why: 'no-evidence' }); continue; }
      rec.identity = { ...held };
      report.stamped.push({ id: rec.id, identity: held });
    }
    const write = report.stamped.length ? saveAdapters() : Promise.resolve();
    write.catch((err) => log.error(`[channels] identity stamp write failed (the live records carry it; the next adapters write persists it): ${(err && err.message) || err}`));
    // verify r7: what the stamp did is SAID — a record it cannot stamp is named, never stamped with a guess (it holds
    // no token and its auth.user is not an address; it takes its next consent, the recorded r6 residual)
    const unstamped = report.skipped.filter((s) => s.why === 'no-evidence').map((s) => s.id);
    if (report.stamped.length || unstamped.length) log.log(`[channels] identity stamp: ${report.stamped.length} legacy record(s) stamped from the token they hold (${report.stamped.map((s) => s.id).join(', ') || 'none'}); ${unstamped.length} left unstamped — no token and no address in auth.user (${unstamped.join(', ') || 'none'}); an unstamped record is bound by its next consent`);
    return { ...report, write };
  }
  function stampCredentialKeys() {
    const report = { stamped: [], skipped: [] };
    for (const rec of adapterRecords().adapters) {
      if (typeof rec.credentialKey === 'string' && rec.credentialKey) { report.skipped.push({ id: rec.id, why: 'already' }); continue; }
      const mod = realByKind.get(rec.kind);
      if (!mod || !mod.integration) { report.skipped.push({ id: rec.id, why: 'no-integration' }); continue; }
      const ev = credentialKeyEvidence(rec, mod);
      if (!ev.key) { report.skipped.push({ id: rec.id, why: 'nothing-resolves', tokenKey: ev.tokenKey }); continue; }
      rec.credentialKey = ev.key;
      report.stamped.push({ id: rec.id, key: ev.key, evidence: ev.evidence, tokenKey: ev.tokenKey });
    }
    const write = report.stamped.length ? saveAdapters() : Promise.resolve();
    write.catch((err) => log.error(`[channels] credential-key stamp write failed (the live records carry it; the next adapters write persists it): ${(err && err.message) || err}`));
    return { ...report, write };
  }
  async function setEnabled(adapterId, enabled) {
    const rec = recordOrThrow(adapterId);
    await store.adapters.update(() => { rec.enabled = !!enabled; });
    // verify r4: a disabled account takes THE exit — its queued paced calls are aborted by name (18 × 20 units used to
    // finish, paced, after the owner disabled it), the pass in flight ends at its next step, the lane is disarmed with it
    if (!enabled) dropLive(rec.id, 'disabled');
    else if (timer) syncPushLanes().catch(() => {});
    notify([]);
    return { ok: true, enabled: !!enabled };
  }
  /** THE PER-CHANNEL HONESTY SWITCH (§9.5, P4): true / false / null (= follow
   *  the instance setting). An audit line records the change; the outbox
   *  repaints because every pending card's "a sender line will be appended"
   *  note follows the switch. */
  /** The ACCOUNT's sending policy (R4, B-6acc): `direct` | `review` | null
   *  (= the adapter's declared default). A conversation's own policy still
   *  wins for that conversation; a composed NEW message reads this one. */
  async function setAccountPolicy(adapterId, mode, by = 'user') {
    const rec = recordOrThrow(adapterId);
    if (mode !== null && !P.POLICY_MODES.includes(mode)) return { ok: false, code: 'bad-policy', error: `mode must be ${P.POLICY_MODES.join('|')} (or null to use the adapter's default)` };
    const t = now();
    await store.adapters.update(() => { rec.policy = mode === null ? null : { mode, by, at: t }; });
    try { store.audit({ kind: 'policy', op: 'set', scope: { kind: 'adapter', id: adapterId }, mode, at: t, by }); } catch {}
    notify([], { full: true });
    return { ok: true, policy: policyFor(rec, null) };
  }
  async function setSenderHonesty(adapterId, value) {
    const rec = recordOrThrow(adapterId);
    const v = value === null || value === undefined ? null : !!value;
    await store.adapters.update(() => { rec.senderHonestyLine = v; });
    try { store.audit({ kind: 'policy', op: 'sender-honesty-line', adapterId, value: v, at: now(), by: 'user' }); } catch {}
    notify([]);
    notifyOutbox([]);
    return { ok: true, senderHonestyLine: { record: v, effective: honestyLineFor(rec) } };
  }
  /** Per-record options the adapter DECLARES (`OPTIONS`): a key it did not
   *  declare is refused by name; `''` restores the declared default. A
   *  change re-runs discovery (the include query decides what a
   *  conversation is). */
  async function setOptions(adapterId, patch) {
    const rec = recordOrThrow(adapterId);
    const mod = realByKind.get(rec.kind);
    const decls = (mod && mod.OPTIONS) || [];
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) { const err = new Error('options must be an object'); err.status = 400; err.code = 'bad-request'; throw err; }
    const next = { ...(rec.options || {}) };
    for (const [k, raw] of Object.entries(patch)) {
      const d = decls.find((o) => o.key === k);
      if (!d) { const err = new Error(`'${k}' is not an option of ${rec.label || rec.id} (declared: ${decls.map((o) => o.key).join(', ') || 'none'})`); err.status = 400; err.code = 'unknown-option'; throw err; }
      if (raw === null || raw === undefined) continue;
      if (typeof raw !== 'string') { const err = new Error(`'${k}' must be a string`); err.status = 400; err.code = 'bad-request'; throw err; }
      const v = raw.trim();
      if (v.length > (d.maxLength || 500)) { const err = new Error(`'${k}' is longer than ${d.maxLength || 500} characters`); err.status = 400; err.code = 'bad-request'; throw err; }
      const val = v || (d.default !== undefined ? d.default : '');
      if (Array.isArray(d.choices) && d.choices.length && !d.choices.includes(val)) { const err = new Error(`'${k}' must be one of ${d.choices.join(', ')} (got '${val}')`); err.status = 400; err.code = 'bad-request'; throw err; }
      next[k] = val;
    }
    const changedKeys = Object.keys(patch).filter((k) => next[k] !== (rec.options || {})[k]);
    const rebuild = changedKeys.some((k) => { const d = decls.find((o) => o.key === k); return d && d.rebuild; });
    // `relive`: an option the PUSH LANE reads (Gmail's topic / subscription)
    // restarts the lane alone — single-use, a fresh arm — never the adapter.
    const relive = !rebuild && changedKeys.some((k) => { const d = decls.find((o) => o.key === k); return d && d.relive; });
    await store.adapters.update(() => { rec.options = next; });
    // An option the adapter reads at CONSTRUCTION (Lark's brand = every host)
    // rebuilds the live instance; one that is read live (Gmail's query) keeps
    // it — the store owns every cursor, so a rebuild loses nothing durable.
    if (rebuild) dropLive(rec.id, 'options changed');
    else if (relive) { const e = live.get(rec.id); if (e) disarmPush(e, 'push options changed'); }
    notify([]);
    if (rec.enabled !== false) pass(rec.id, { force: true }).catch(() => {});
    if (timer) syncPushLanes().catch(() => {});
    return { ok: true, options: { ...next } };
  }

  // ── the scheduler: ONE loop per adapter, never one per conversation ──────
  // ── P2: ASSIGN, FILTER, WAKE (design §7; fences 2 + 12) ──────────────────
  // THE FUNNEL: every lane calls `onFresh` with exactly the records that
  // became durable. After that nothing knows which lane they came from — the
  // same matcher, the same pacing cap, the same ladder, the same authorizer.
  // The ONE lane-dependent step is fence 12's coalescing window, opened only
  // while `laneState().carryContent` holds (a poll or scan pass is already a
  // batch), so "turn on real-time push" cannot multiply a bill by a burst.
  //
  // THREE LAYERS, THREE JOBS (§7.4): the per-assignment daily wake cap here
  // is PACING; the ladder's per-conversation floor is FLOOD CONTROL; the
  // spend authorizer INSIDE the ladder is THE MONEY BOUND — the engine passes
  // `spendReason:'channel-message'` and adds nothing beside it (fence 2).
  //
  // A REFUSAL LOSES NOTHING: the record is in the store; hits the engine
  // cannot wake for yet (a window, a group with no live member, the pacing
  // cap) are PENDING on the index — persisted, bounded — and a wake the
  // ladder refuses (spend, unreachable) is stashed through the ladder's own
  // durable stash and rides the agent's next turn.
  const inflight = new Set();
  /** Track a fire-and-forget wake chain so `stop()` and a suite can settle it. */
  function track(p) {
    const q = Promise.resolve(p).catch((err) => log.warn(`[channels] wake path failed: ${(err && err.message) || err}`));
    inflight.add(q);
    q.finally(() => inflight.delete(q));
    return q;
  }
  const settleWakes = async () => { while (inflight.size) await Promise.all([...inflight]); };

  const wakeTimers = new Map();   // `${adapterId}/${convId}` → { timer, kind:'coalesce'|'digest', startedAt }
  function clearWakeTimer(key) { const w = wakeTimers.get(key); if (w) { clearTimeout(w.timer); wakeTimers.delete(key); } }

  /** The coalescing window in SECONDS (fence 12) — the setting, bounded;
   *  fractional values are honoured so a suite can shrink it, and 0 means
   *  "wake per message" (the setting's own words). */
  function coalesceSeconds() {
    const v = Number(serverSetting('channels.pushCoalesceSeconds'));
    if (!Number.isFinite(v) || v < 0) return COALESCE_DEFAULT_SECONDS;
    return Math.min(COALESCE_MAX_SECONDS, v);
  }
  /** Decision 9: external = review, internal = direct. The conversation's
   *  own policy (P3, `PUT …/policy`) wins; without one the adapter MODULE's
   *  declared default applies (the built-in Agents adapter declares
   *  `direct`); anything unreadable is review — fail closed (§9.1). */
  function policyFor(rec, en) {
    const own = en && en.policy && typeof en.policy === 'object' ? en.policy : null;
    if (own && own.mode) return { mode: P.policyMode(own).mode, source: 'conversation', declared: own.mode };
    // R4 (B-6acc): the ACCOUNT's own policy (`PUT /api/channels/adapters/:id
    // {policy}`) — what a NEW message composed on the account reads, and the
    // default of every conversation that sets none
    const acct = rec && rec.policy && typeof rec.policy === 'object' ? rec.policy : null;
    if (acct && acct.mode) return { mode: P.policyMode(acct).mode, source: 'account', declared: acct.mode };
    let dflt = null;
    try { dflt = registry.get(rec.kind).policyDefault || null; } catch {}
    const pm = P.policyMode(dflt || 'review');
    return { mode: pm.mode, source: dflt ? 'adapter-default' : 'default', declared: dflt || null };
  }
  function policyRequiresReview(rec, en) { return policyFor(rec, en).mode === 'review'; }
  /** The two READ-TIME facts `authority:'send'` is capped by (§7.3). */
  function authorityCapsFor(rec, en, t) {
    const c = registry.capsOf(rec.kind);
    const u = caps.offers(c, effectiveConvCaps(rec, en), 'send-as-user', t);
    const b = caps.offers(c, effectiveConvCaps(rec, en), 'send-as-bot', t);
    const offersSend = !!(u.offered || b.offered);
    return { offersSend, sendWhy: offersSend ? null : (u.why || b.why || 'unknown'), policyRequiresReview: policyRequiresReview(rec, en) };
  }
  /** Heal an entry to the P2 shape (rows seeded before P2 carry none of it). */
  function healP2(en) {
    if (!en.stats || typeof en.stats !== 'object') en.stats = { hits7d: 0, msgs7d: 0 };
    if (!Array.isArray(en.stats.hits)) en.stats.hits = [];
    if (!Array.isArray(en.stats.wakes)) en.stats.wakes = [];
    if (!Array.isArray(en.stats.msgs)) en.stats.msgs = [];
    if (!Array.isArray(en.pending)) en.pending = [];
    if (!Number.isFinite(en.pendingElided)) en.pendingElided = 0;
    if (!en.pendingElidedBy || typeof en.pendingElidedBy !== 'object') en.pendingElidedBy = {};   // R4: per watcher (`kind:id`)
    if (!Array.isArray(en.reachEntries)) en.reachEntries = [];
    if (!Array.isArray(en.reachRequests)) en.reachRequests = [];   // P3 (§8): open/decided access requests
    return en;
  }
  function filtersOf(ix) { if (!ix.filters || typeof ix.filters !== 'object') ix.filters = {}; return ix.filters; }
  function rotationsOf(ix) { if (!ix.rotations || typeof ix.rotations !== 'object') ix.rotations = {}; return ix.rotations; }
  function filterFor(filterId) {
    if (!filterId) return null;
    const filters = store.index.table('filters');   // B-f32b: the one filter copied, never the index
    const f = filters && filters[filterId];
    return f ? JSON.parse(JSON.stringify(f)) : null;
  }
  /** A conversation's OWN grain as the compatibility reader expects it (the
   *  pre-split `assignment` shape: its first watcher, the authority of that
   *  principal's access row clamped by both caps, §7.3 (a)) — null when the
   *  conversation holds no row of its own. */
  function assignmentView(rec, en, t) {
    const g = convGrainOf(en);
    if (!g.access.length && !g.watchers.length) return null;
    const v = grainView(rec, g, t, { capsNow: authorityCapsFor(rec, en, t) });
    const lead = v.watchers[0] ? v.access.find((r) => pkOf(r.principal) === pkOf(v.watchers[0].principal)) : v.access[0];
    return { ...v, scope: { kind: 'conversation', id: en.key }, authority: lead ? lead.authority : 'draft', authorityStored: lead ? lead.authorityStored : 'draft', authorityClamped: !!(lead && lead.authorityClamped), authorityWhy: lead ? lead.authorityWhy : null, authorityWhyCap: lead ? lead.authorityWhyCap : null };
  }
  /** Pending hits by WATCHER (R4): every entry names the principal it waits
   *  for (`for`); an entry from before the split (no `for`) and the untagged
   *  elided count belong to the FIRST watcher in effect — the one that was
   *  the only assignment when it was held. */
  function pendingOf(en, pk, eff) {
    const firstPk = eff && eff.watchers[0] ? pkOf(eff.watchers[0].watcher.principal) : null;
    const mine = (p) => p && (p.for ? p.for === pk : pk === firstPk);
    const list = (Array.isArray(en && en.pending) ? en.pending : []).filter(mine);
    const elidedTagged = Number(en && en.pendingElidedBy && en.pendingElidedBy[pk]) || 0;
    const elidedUntagged = pk === firstPk ? (Number(en && en.pendingElided) || 0) : 0;
    return { hits: list.map((p) => ({ record: p.record, why: p.why || [] })), ids: new Set(list.map((p) => p.record && p.record.id).filter(Boolean)), elidedTagged, elidedUntagged, elided: elidedTagged + elidedUntagged };
  }
  /** Drop what one delivery CARRIED (and nothing else) from `pending`. */
  function clearCarried(e2, pk, eff, carried) {
    const firstPk = eff && eff.watchers[0] ? pkOf(eff.watchers[0].watcher.principal) : null;
    const mine = (p) => p && (p.for ? p.for === pk : pk === firstPk);
    e2.pending = e2.pending.filter((p) => !(mine(p) && p.record && carried.ids.has(p.record.id)));
    if (carried.elidedTagged) { if (!e2.pendingElidedBy || typeof e2.pendingElidedBy !== 'object') e2.pendingElidedBy = {}; e2.pendingElidedBy[pk] = Math.max(0, (Number(e2.pendingElidedBy[pk]) || 0) - carried.elidedTagged); if (!e2.pendingElidedBy[pk]) delete e2.pendingElidedBy[pk]; }
    if (carried.elidedUntagged) e2.pendingElided = Math.max(0, (Number(e2.pendingElided) || 0) - carried.elidedUntagged);
  }
  const elidedTotal = (en) => (Number(en && en.pendingElided) || 0) + Object.values((en && en.pendingElidedBy) || {}).reduce((n, v) => n + (Number(v) || 0), 0);
  function statsView(en, t) {
    const s = (en && en.stats) || {};
    const wakes = Array.isArray(s.wakes) ? s.wakes : [];
    const okWakes = wakes.filter((w) => w && w.ok !== false);
    const last = wakes.length ? wakes[wakes.length - 1] : null;
    return {
      hits7d: F.countSince(s.hits, t, 7),
      msgs7d: F.countSince(s.msgs, t, 7),
      wakes24h: okWakes.filter((w) => Number(w.at) > t - 86400e3).length,
      wakes7d: okWakes.filter((w) => Number(w.at) > t - 7 * 86400e3).length,
      lastWake: last ? { at: last.at, n: last.n, ok: last.ok !== false, lane: last.lane || null, why: last.why || null, cid: last.cid || null, refused: last.refused || null } : null,
      pending: (Array.isArray(en && en.pending) ? en.pending.length : 0) + elidedTotal(en),
      lastRefusal: s.lastRefusal || null,
    };
  }
  /** THE HONEST LATENCY CLAIM per lane (§19 P2): what "a wake arrives
   *  within …" truthfully means for THIS row right now. Structure; the
   *  editor words it. The poll number is the tick's own (hot, because an
   *  assigned conversation is hot). */
  function wakeLatencyFor(rec, en, lane, t) {
    const c = registry.capsOf(rec.kind);
    if (lane.via === 'scan') {
      const secs = lane.source && c.scanLatency ? Number(c.scanLatency[lane.source]) : null;
      return { lane: 'scan', source: lane.source || null, seconds: Number.isFinite(secs) ? secs : null, coalesceSeconds: 0, why: lane.source ? null : (lane.why || 'no-source') };
    }
    if (lane.via === 'push' && lane.carryContent) {
      const cs = coalesceSeconds();
      return { lane: 'push', seconds: Math.ceil(cs + (Number(c.pushAckBudgetMs) || 3000) / 1000), coalesceSeconds: cs, why: null };
    }
    const cad = caps.cadenceFor(c, lane, en, t, { tiers: tiers(), watched: isWatched(en && en.key, t) });
    if (cad.paused) return { lane: 'paused', seconds: null, coalesceSeconds: 0, why: 'paused' };
    if (lane.pollCadence === 'reconcile') return { lane: 'reconcile', seconds: cad.seconds || RECONCILE_SECONDS, coalesceSeconds: 0, why: null };
    // lane lark-search-poll: a CARRYING change feed — a message is found within one tick plus the overlap (an open window's 30 s is shorter)
    if (lane.pollCadence === 'feed') return { lane: 'feed', seconds: Math.min(Number(lane.feedSeconds) || cad.seconds || 90, cad.seconds || Infinity), coalesceSeconds: 0, why: null };
    return { lane: 'poll', seconds: cad.seconds || 30, tier: cad.tier, coalesceSeconds: 0, kick: lane.via === 'push', why: null };
  }

  // ── THE THREE GRAINS, TWO LISTS EACH (R4, 2026-09-27, design §7.3) ────
  // Every grain — the conversation (on its entry), a PATTERN (the conversations
  // a rule matches), the ACCOUNT — holds an ACCESS list (who may see and act,
  // with an authority) and a WATCHERS list (who is woken, and on what). Access
  // is the PREREQUISITE of notification (a watcher's principal must hold
  // access at the same grain; removing the access removes the watcher). Per
  // principal the finest grain that names it decides — PURE
  // (`F.effectiveGrants`). The account and pattern records live in index
  // tables; every WATCHER carries its OWN pace ledger (`stats.wakes`), so a
  // cap is per (principal, scope): one 40/day ledger per conversation of an
  // 800-thread account would be 32 000 wakes a day, and one ledger shared by
  // two watchers would let one starve the other.
  function accountGrainOf(adapterId) { const tb = store.index.table('accountAssignments'); return (tb && tb[adapterId]) || null; }
  function patternsOf(adapterId) { const tb = store.index.table('patternAssignments') || {}; return Object.values(tb).filter((p) => p && p.adapterId === adapterId); }
  function patternById(id) { const tb = store.index.table('patternAssignments') || {}; return tb[id] || null; }
  const pkOf = (p) => F.principalKey(p);
  /** A conversation's pre-split single assignment, with the pace ledger it
   *  used (`en.stats.wakes` minus the inherited grains' mirrors) — what the
   *  reader-side lift and the migration turn into one access + one watcher. */
  function legacyConvAssignment(en) {
    const a = en && en.assignment;
    if (!a || !a.principal) return null;
    const s = (en.stats && typeof en.stats === 'object') ? en.stats : {};
    return { ...a, stats: { wakes: (Array.isArray(s.wakes) ? s.wakes : []).filter((w) => w && (!w.grain || w.grain === 'conversation')), hits: Array.isArray(s.hits) ? s.hits.slice() : [], lastRefusal: s.lastRefusal || null } };
  }
  /** A conversation's OWN grain `{access, watchers}` (a pre-split entry read
   *  the same way — merged, never a fallback). */
  function convGrainOf(en) { return F.grainOf({ access: en && en.access, watchers: en && en.watchers }, legacyConvAssignment(en), { inherited: en ? convInheritedOf(en) : [] }); }
  /** lane channel-agent-watch W3 — ACCESS IS MAX OVER THE GRAIN AND ITS ANCESTORS: the principal keys a VISIBLE grant
   *  names (`grants`; `skipOwn` = leave out the conversation's own access-origin rows, which a write is replacing). */
  function visibleKeysOf(grants, { skipOwnScope = null } = {}) {
    const out = [];
    for (const g of Array.isArray(grants) ? grants : []) {
      if (!g || !g.principal || g.level !== 'visible') continue;
      if (skipOwnScope && g.scope && g.scope.kind === skipOwnScope.kind && g.scope.id === skipOwnScope.id && (g.origin === 'access' || g.origin === 'assignment')) continue;
      const k = pkOf(g.principal.kind === 'everyone' ? { kind: 'everyone', id: '*' } : g.principal);
      if (k) out.push(k);
    }
    return out;
  }
  /** The account-scope grants of one account, as keys (`skipAccess` = leave out the account grain's own access rows). */
  function accountGrantKeys(adapterId, { skipAccess = false } = {}) {
    const acct = (store.index.table('accountGrants') || []).filter((g) => g && g.scope && g.scope.kind === 'adapter' && g.scope.id === adapterId && (!skipAccess || (g.origin !== 'access' && g.origin !== 'assignment')));
    return visibleKeysOf(acct);
  }
  /** Who holds access ABOVE one conversation: the account grain's rows + its grants, every matching rule's rows, and
   *  every visible grant that reaches it (an approved request, a hand-written grant) — `skipOwn` leaves out the
   *  conversation's own access rows (a write replacing them judges by the NEW list). */
  function convInheritedOf(en, { skipOwn = false } = {}) {
    const acc = F.grainOf(accountGrainOf(en.adapterId), undefined, { inherited: accountGrantKeys(en.adapterId) }).access;
    const pats = [];
    for (const pa of patternsOf(en.adapterId)) if (pa && pa.pattern && F.matchConversation(pa.pattern, convFacts(en)).hit) pats.push(...F.grainOf(pa).access);
    const grants = visibleKeysOf(grantsOfConversation(en), skipOwn ? { skipOwnScope: { kind: 'conversation', id: en.key } } : {});
    return [...acc, ...pats, ...grants];
  }
  /** Who holds access above a grain being WRITTEN (setGrain's watcher check): a conversation's ancestors, an account's
   *  own non-access grants, a rule's account. */
  function siteInheritedOf(site) {
    if (site.kind === 'conversation') return site.holder ? convInheritedOf(site.holder, { skipOwn: true }) : [];
    const aid = site.rec && site.rec.id;
    if (site.kind === 'account') return accountGrantKeys(aid, { skipAccess: true });
    return [...F.grainOf(accountGrainOf(aid)).access, ...accountGrantKeys(aid)];
  }
  /** The facts a pattern matches over (PURE input). */
  function convFacts(en) { return { title: (en && en.title) || '', participants: (en && en.participants) || '', kind: (en && en.kind) || '', authors: (en && Array.isArray(en.authors)) ? en.authors : [] }; }
  /** WHO HAS ACCESS AND WHO WATCHES — the ONE answer for a conversation. */
  function effectiveFor(en) {
    if (!en) return null;
    return F.effectiveGrants({ conversation: convGrainOf(en), patterns: patternsOf(en.adapterId), account: accountGrainOf(en.adapterId) }, convFacts(en), { grantKeys: visibleKeysOf(grantsOfConversation(en)), accountKeys: accountGrantKeys(en.adapterId) });
  }
  /** The running agent conversations an ALL-AGENTS watcher fans out to (`[{cid, name}]`, the live roster now). */
  function fanTargets() {
    let live = [];
    try { live = liveSessions() || []; } catch (err) { log.warn(`[channels] liveSessions threw: ${(err && err.message) || err}`); }
    return live.filter((x) => x && x.cid).map((x) => ({ cid: String(x.cid), name: x.name || null }));
  }
  /** THE ANSWER EVERY WAKE PATH READS (lane everyone-principal): `effectiveFor` with every ALL-AGENTS watcher fanned
   *  out to one item per RUNNING conversation (F.fanOutWatchers — each its own key, pending, timers, scope chain and
   *  pace LEDGER: a cap of N is N wakes per conversation, never N shared and never uncapped). `base` = the answer as
   *  the views read it (one All row). Every view path keeps `effectiveFor`. */
  function wakeEffOf(en) {
    const e = effectiveFor(en);
    if (!e) return e;
    const x = F.fanOutWatchers(e, fanTargets());
    return x === e ? e : { ...x, base: e };
  }
  /** A grain's stored watcher for key `pk` — a fan-out key (`everyone:*><cid>`) answers the stored All row as that
   *  conversation's watcher while the conversation runs (null when it stopped: nobody waits for its hits). */
  function storedWatcherFor(holder, pk) {
    const list = holder ? F.grainOf(holder).watchers : [];
    const fan = F.fanOfKey(pk);
    if (!fan) return list.find((x) => pkOf(x.principal) === pk) || null;
    const root = list.find((x) => pkOf(x.principal) === fan.root);
    if (!root) return null;
    const tg = fanTargets().find((x) => x.cid === fan.cid);
    return tg ? F.fanWatcher(root, tg.cid, tg.name) : null;
  }
  /** Is THIS item the watcher of principal `pk`? */
  const itemIs = (item, pk) => !!item && pkOf((item.watcher || item.row).principal) === pk;
  /** A WATCHER's scope chain / scope timer key — per (grain, principal): the
   *  conversation grain has none (its conversation chain covers its ledger). */
  const scopeKeyOf = (item, rec) => (item.source === 'account' ? `acct:${rec.id}|${pkOf(item.watcher.principal)}` : item.source === 'pattern' ? `pat:${item.patternId}|${pkOf(item.watcher.principal)}` : null);
  /**
   * LIFT a stored grain to the two lists IN PLACE (inside `update()` only):
   * a record written before the split becomes one access row + one watcher
   * row; the account's origin-`assignment` grant is renamed `access`. The
   * migration does this to every row at boot; a write reaching a record the
   * migration has not seen yet (the engine starts before the runner) lifts
   * exactly that record first, so a ledger is never written to a copy.
   */
  function liftGrainInPlace(ix, holder, kind) {
    if (!holder) return holder;
    if (kind === 'conversation') {
      const legacy = legacyConvAssignment(holder);
      if (legacy || !Array.isArray(holder.access) || !Array.isArray(holder.watchers)) {
        const g = F.grainOf({ access: holder.access, watchers: holder.watchers }, legacy);
        holder.access = g.access; holder.watchers = g.watchers;
        if (legacy) {
          const pk = pkOf(legacy.principal);
          for (const p of Array.isArray(holder.pending) ? holder.pending : []) if (p && !p.for) p.for = pk;
          if (Number(holder.pendingElided) > 0) { if (!holder.pendingElidedBy || typeof holder.pendingElidedBy !== 'object') holder.pendingElidedBy = {}; holder.pendingElidedBy[pk] = (Number(holder.pendingElidedBy[pk]) || 0) + Number(holder.pendingElided); holder.pendingElided = 0; }
        }
        if ('assignment' in holder) delete holder.assignment;
        if (Array.isArray(holder.reachEntries)) for (const g2 of holder.reachEntries) if (g2 && g2.origin === 'assignment') g2.origin = 'access';
      }
      return holder;
    }
    const lifted = F.liftGrainRecord(holder);
    if (lifted.changed) {
      for (const k of Object.keys(holder)) delete holder[k];
      Object.assign(holder, lifted.rec);
      if (kind === 'account' && Array.isArray(ix.accountGrants)) for (const g2 of ix.accountGrants) if (g2 && g2.origin === 'assignment' && g2.scope && g2.scope.kind === 'adapter' && g2.scope.id === holder.adapterId) g2.origin = 'access';
    }
    if (!Array.isArray(holder.access)) holder.access = [];
    if (!Array.isArray(holder.watchers)) holder.watchers = [];
    return holder;
  }
  /** The LIVE watcher row an effective item names, inside `update()` — the
   *  one its pace ledger is written to (lifting a pre-split record first). */
  function watcherRef(ix, rec, en2, item) {
    const pk = pkOf(item.watcher.principal);
    // ALL AGENTS (lane everyone-principal): a fan-out target's ledger is ITS OWN — `stats.fan[<cid>]` of the stored
    // All row, returned as `{stats}` so every writer below (reserve / finalize / refusal / hits) lands there
    const fan = F.fanOfKey(pk);
    let holder = null;
    if (item.source === 'conversation') holder = en2 ? liftGrainInPlace(ix, en2, 'conversation') : null;
    else if (item.source === 'account') holder = liftGrainInPlace(ix, (ix.accountAssignments || {})[rec.id] || null, 'account');
    else holder = liftGrainInPlace(ix, (ix.patternAssignments || {})[item.patternId] || null, 'pattern');
    const w = holder && Array.isArray(holder.watchers) ? holder.watchers.find((x) => pkOf(x.principal) === (fan ? fan.root : pk)) : null;
    if (w && (!w.stats || typeof w.stats !== 'object')) w.stats = { wakes: [], hits: [] };
    if (!w || !fan) return w;
    if (!w.stats.fan || typeof w.stats.fan !== 'object') w.stats.fan = {};
    F.pruneFan(w.stats, now());
    const sub = w.stats.fan[fan.cid] && typeof w.stats.fan[fan.cid] === 'object' ? w.stats.fan[fan.cid] : (w.stats.fan[fan.cid] = { wakes: [], hits: [] });
    if (!Array.isArray(sub.wakes)) sub.wakes = [];
    if (!Array.isArray(sub.hits)) sub.hits = [];
    return { stats: sub, fanOf: w };
  }
  /** One watcher's ledger view (the card's "N wakes / 24 h"). */
  function ledgerView(s0, t) {
    const s = s0 || {};
    const okWakes = F.ledgerRowsOf(s).filter((w) => w && w.ok !== false);   // an All row: every conversation's ledger
    return { hits7d: F.countSince(s.hits, t, 7), wakes24h: okWakes.filter((w) => Number(w.at) > t - 86400e3).length, wakes7d: okWakes.filter((w) => Number(w.at) > t - 7 * 86400e3).length, lastRefusal: s.lastRefusal || null };
  }
  function accessRowView(row, capsNow = null) {
    const base = { principal: { kind: row.principal.kind, id: row.principal.id, name: row.principal.name || null }, authority: row.authority, createdAt: row.createdAt || null, updatedAt: row.updatedAt || null };
    if (!capsNow) return base;
    const cl = F.effectiveAuthority(row, capsNow);
    return { ...base, authority: cl.authority, authorityStored: row.authority, authorityClamped: cl.clamped, authorityWhy: cl.why || null, authorityWhyCap: cl.whyCap || null };
  }
  function watcherView(w, t) {
    return {
      principal: { kind: w.principal.kind, id: w.principal.id, name: w.principal.name || null },
      notify: w.notify, mode: w.mode, filterId: w.filterId || null, filter: w.filterId ? filterFor(w.filterId) : null, digestMinutes: w.digestMinutes, dailyWakeCap: w.dailyWakeCap, receiptWake: !!w.receiptWake,
      createdAt: w.createdAt || null, updatedAt: w.updatedAt || null, estimateAtSet: w.estimateAtSet || null, stats: ledgerView(w.stats, t),
      // lane channel-agent-watch: the row's delivery + who wrote it ride the view — a dialog's whole-list save sends
      // them back unchanged (a view without them would turn an agent's next-turn row into the owner's wake row)
      ...(w.delivery ? { delivery: F.deliveryModeOf(w) } : {}), ...(w.origin === 'agent' ? { origin: 'agent' } : {}),
    };
  }
  /** lane channel-agent-watch W3: who may be notified on this conversation WITHOUT an access row of its own — access
   *  above it (the account, a matching rule) or a visible grant here (an approved request); one row per principal. */
  function eligibleAboveView(en) {
    const out = new Map();
    const add = (p, via) => { const k = p && pkOf(p.kind === 'everyone' ? { kind: 'everyone', id: '*' } : p); if (k && !out.has(k)) out.set(k, { principal: { kind: p.kind, id: p.kind === 'everyone' ? '*' : p.id, name: p.name || null }, via }); };
    for (const r of F.grainOf(accountGrainOf(en.adapterId), undefined, { inherited: accountGrantKeys(en.adapterId) }).access) add(r.principal, 'account');
    for (const pa of patternsOf(en.adapterId)) if (pa && pa.pattern && F.matchConversation(pa.pattern, convFacts(en)).hit) for (const r of F.grainOf(pa).access) add(r.principal, 'pattern');
    for (const g of grantsOfConversation(en)) if (g && g.level === 'visible' && g.principal && !(g.scope && g.scope.kind === 'conversation' && (g.origin === 'access' || g.origin === 'assignment'))) add(g.principal, g.scope && g.scope.kind === 'adapter' ? 'account' : 'grant');
    return [...out.values()];
  }
  /** A grain's two lists as the card and the dialogs read them, + the FIRST
   *  watcher's (else the first access row's) fields flat beside them — the
   *  pre-split single-assignment shape a legacy reader expects. */
  function grainView(rec, holder, t = now(), { capsNow = null } = {}) {
    const g = F.grainOf(holder);
    const access = g.access.map((r) => accessRowView(r, capsNow));
    const watchers = g.watchers.map((w) => watcherView(w, t));
    const lead = watchers[0] || null;
    const leadAccess = lead ? access.find((r) => pkOf(r.principal) === pkOf(lead.principal)) : access[0] || null;
    const flat = lead ? { ...lead, authority: leadAccess ? leadAccess.authority : 'draft' } : (leadAccess ? { principal: leadAccess.principal, authority: leadAccess.authority, notify: null, mode: null, stats: ledgerView(null, t) } : {});
    return {
      ...flat,
      id: holder && holder.id ? holder.id : null, scope: (holder && holder.scope) || null,
      pattern: (holder && holder.pattern) || null, patternLabel: holder && holder.pattern ? F.patternSummary(holder.pattern) : null,
      createdAt: (holder && holder.createdAt) || null, updatedAt: (holder && holder.updatedAt) || null,
      access, watchers,
    };
  }

  /** THE FUNNEL ENTRY. `fresh` are the records that just became durable.
   *  R4: EVERY WATCHER in effect matches with ITS OWN filter and is delivered
   *  on its own (a wake, a digest window, a scope digest), each against its
   *  own pace ledger; ACCESS alone is never on this path. */
  async function onFresh(rec, convId, fresh0, { lane, origin } = {}) {
    if (stopped || !Array.isArray(fresh0) || !fresh0.length) return;
    // lane lark-threads (B2–B5): the batch through the ONE view door — a wake / a For-you item names an author as the owner
    // reads them (`author.display`: the owner's name › the vendor's way); the vendor `name` (what a rule matches) unchanged
    const fresh = fresh0.map((r) => viewOf(rec, r));
    const t = now();
    const en = store.index.peek(`${rec.id}/${convId}`);
    if (!en) return;
    // The two LEDGERS below are DERIVED counts (§5 invariant 7: cached for
    // the panel, always re-derivable) — a failed write costs one stale
    // number and is SAID; it must never cost the wake that follows, which is
    // the one thing on this path that cannot be re-derived.
    const ledger = async (what, fn) => { try { await store.index.update(fn); } catch (err) { log.warn(`[channels] ${rec.id}/${convId}: ${what} ledger failed: ${(err && err.message) || err}`); } };
    // msgs7d — the estimate's denominator measured after the fact (§7.2)
    await ledger('msgs', () => { const e2 = store.index.entry(rec.id, convId, { create: false }); if (!e2) return; healP2(e2); e2.stats.msgs.push({ at: t, n: fresh.length }); e2.stats.msgs = F.pruneLedger(e2.stats.msgs, t); e2.stats.msgs7d = F.countSince(e2.stats.msgs, t, 7); });
    const eff = wakeEffOf(en);   // ALL AGENTS fanned out: one item per running conversation
    if (!eff || !eff.watchers.length) return;
    // a named AGENT first, then groups (and the All-agents fan-out): a group's round-robin skips a session
    // this batch already reached (one batch never bills one agent twice)
    const order = eff.watchers.slice().sort((a, b) => (a.watcher.principal.kind === 'agent' ? 0 : 1) - (b.watcher.principal.kind === 'agent' ? 0 : 1));
    const per = [];
    const union = new Set();
    // lane channel-threads (spec §5.4): the two PLACE rules read WHOSE a message is — the owner's (author.isSelf in the
    // log) and what THIS principal sent from here (the outbox's `sentBy`; a group = its live members') — and the
    // record's thread (the index over the log + this batch). Built once per batch, only when a filter asks.
    let placeBase = null;
    const placeCtx = (principal) => {
      if (!placeBase) {
        let ix = null;
        try { ix = threadIxOf(rec.id, convId, fresh); } catch (err) { log.warn(`[channels] ${rec.id}/${convId}: the thread index for the place rules failed: ${(err && err.message) || err}`); }
        const owner = new Set();
        if (ix) for (const r of ix.byId.values()) if (r && r.author && r.author.isSelf && r.vendorId) owner.add(String(r.vendorId));
        const threadOf = (r) => {
          if (!ix || !r || !r.vendorId) return [];
          const k = ix.byRecord.get(String(r.vendorId));
          const th = k ? ix.threads.get(k) : null;
          // owner decision A (2026-09-28): a TOPIC only — a reply chain is quotes, never "a thread I am in"; a mail
          // thread IS the conversation ("in a thread with me" would be every message)
          if (!th || th.kind !== 'vendor') return [];
          return [th.root, ...(th.all || th.replies)].filter(Boolean);   // every reply (verify r2: `replies` = the newest 500)
        };
        // THE classifier (the one the window's tag and the placement read) — the place rules ask it first
        const kindOf = (r) => (ix ? Thr.placeKindOf(r, ix) : { kind: 'plain', topic: null, quotes: null });
        placeBase = { owner, threadOf, kindOf, sentBy: en.sentBy && typeof en.sentBy === 'object' ? en.sentBy : {} };
      }
      const mine = new Set(placeBase.owner);
      const cids = !principal ? [] : principal.kind === 'agent' ? [String(principal.id)] : F.fanTargetOf(principal) ? [F.fanTargetOf(principal)] : principal.kind === 'everyone' ? [] : Object.keys(placeBase.sentBy).filter((k) => k.startsWith('agent:')).map((k) => k.slice(6)).filter((cid) => groupsOfSession(cid).includes(String(principal.id)));
      for (const cid of cids) for (const v of placeBase.sentBy[`agent:${cid}`] || []) mine.add(String(v));
      return { mine, threadOf: placeBase.threadOf, kindOf: placeBase.kindOf };
    };
    // R4 verify r5: ONE BAD RECORD (or a throw preparing one watcher) MUST NOT
    // DROP THE REST OF THIS CONVERSATION'S BATCH. onFresh is tracked per
    // conversation, so a throw here never ends the pass or reaches another
    // conversation (the r4 note's "remaining conversations" was already bounded
    // by `track`) — but before this guard a single record the matcher could
    // not handle rejected the whole call, and this conversation's news (every
    // watcher, the good records beside the bad one) was lost silently. Each
    // record is matched, and each watcher prepared, on its own: a failure is
    // logged BY NAME and skipped, never dropped for the batch.
    for (const item of order) {
      try {
        const w = item.watcher;
        const filter = w.mode === 'filtered' ? filterFor(w.filterId) : null;
        if (w.mode === 'filtered' && !filter) { log.warn(`[channels] ${rec.id}/${convId}: ${pkOf(w.principal)}'s notification names filter ${w.filterId} which does not exist — not woken (fail closed)`); continue; }
        const hits = [];
        const mctx = filter && Array.isArray(filter.rules) && filter.rules.some((x) => x && F.PLACE_RULE_KINDS.includes(x.kind)) ? placeCtx(w.principal) : {};
        for (const r of fresh) {
          try {
            if (w.mode === 'all') { hits.push({ record: r, why: [] }); continue; }
            const m = F.matchRecord(filter, r, mctx);
            if (m.hit) hits.push({ record: r, why: m.why });
          } catch (err) { log.warn(`[channels] ${rec.id}/${convId}: a record could not be matched for ${pkOf(w.principal)} — skipped: ${(err && err.message) || err}`); }
        }
        if (!hits.length) continue;
        for (const h of hits) union.add((h.record && h.record.id) || h);
        per.push({ item, hits });
      } catch (err) { log.warn(`[channels] ${rec.id}/${convId}: the notification for ${pkOf(item.watcher && item.watcher.principal)} could not be prepared — skipped: ${(err && err.message) || err}`); }
    }
    if (!per.length) return;
    await ledger('hits', (ix) => {
      const e2 = store.index.entry(rec.id, convId, { create: false }); if (!e2) return; healP2(e2); e2.stats.hits.push({ at: t, n: union.size }); e2.stats.hits = F.pruneLedger(e2.stats.hits, t); e2.stats.hits7d = F.countSince(e2.stats.hits, t, 7);
      // each watcher measures its OWN rate too (the editor's "since" line)
      for (const { item, hits } of per) { const own = watcherRef(ix, rec, e2, item); if (own) own.stats.hits = F.pruneLedger([...(Array.isArray(own.stats.hits) ? own.stats.hits : []), { at: t, n: hits.length }], t); }
    });
    const batch = { got: new Map() };
    const cs = coalesceSeconds();
    const runs = [];
    for (const { item, hits } of per) {
      const w = item.watcher;
      const pk = pkOf(w.principal);
      // lane channel-agent-watch W5: a NEXT-TURN watcher is never woken — its hits ride its next turn (the ladder's
      // durable stash, drained at the next injection): no billed turn, no cap spent, no ledger row (F.deliveryModeOf
      // is the ONE reader; a row written before the choice existed reads `wake`, as it always behaved)
      if (F.deliveryModeOf(w) === 'next-turn') { runs.push(stashHits(rec, convId, hits, { item, pk, batch })); continue; }
      if (w.notify === 'digest') {
        // an INHERITED digest delivers ONCE per window for its whole scope (§7.3)
        runs.push(item.source !== 'conversation' ? queueScopeWindow(rec, convId, hits, item, { ms: w.digestMinutes * 60e3 }) : queueForWindow(rec, convId, hits, { kind: 'digest', ms: w.digestMinutes * 60e3, pk }));
        continue;
      }
      // FENCE 12: the window opens ONLY while push carries content — a poll or
      // scan pass is already a batch (r4/r6), and a kick-mode push lane's
      // records arrive by poll. Gated on the RESOLVED lane, never `caps.receive`.
      if (lane && lane.via === 'push' && lane.carryContent && cs > 0) { runs.push(queueForWindow(rec, convId, hits, { kind: 'coalesce', ms: cs * 1000, pk })); continue; }
      runs.push(wake(rec, convId, hits, { origin, pk, batch }));
    }
    // R4 verify r5: allSettled — one watcher's door throwing does not cancel
    // the siblings already dispatched (each door catches the ladder itself, so
    // a rejection here is a bug, not a refusal; it is logged, never swallowed).
    for (const s of await Promise.allSettled(runs)) if (s.status === 'rejected') log.warn(`[channels] ${rec.id}/${convId}: a notification failed unexpectedly: ${(s.reason && s.reason.message) || s.reason}`);
  }

  /**
   * lane channel-agent-watch W5: A NEXT-TURN WATCHER'S HITS — the same block a wake carries, handed to the ladder's
   * durable stash for the watcher's conversation (drained into its next turn's context); never the ladder itself, so
   * never a billed turn. A group picks its member like a wake does; nobody live ⇒ the hits wait as pending (the next
   * wake or turn of that watcher carries them). One batch never hands one session the same hit twice.
   */
  async function stashHits(rec, convId, hits, { item, pk, batch = null } = {}) {
    const en = store.index.peek(`${rec.id}/${convId}`);
    if (!en || stopped) return { ok: false, why: stopped ? 'stopped' : 'gone' };
    const w = item.watcher;
    // THE GATE (§65): the watcher is still in effect for this principal NOW — its access (here or above) may have gone
    // since the batch was matched; a watcher no longer in effect hands nothing
    const still = stillInEffect(rec, convId, pk);
    if (!still || !still.watched) { log.log(`[channels] ${rec.id}/${convId}: ${pk} no longer watches — the next-turn notification is dropped`); return { ok: false, why: 'not-watching' }; }
    const target = resolveTarget(w, batch);
    if (!target.cid || !deliver || typeof deliver.stashFor !== 'function') { await keepPending(rec, convId, hits, 0, pk); return { ok: false, held: true, why: target.why || 'no stash wired' }; }
    const seen = batch && batch.got ? batch.got.get(target.cid) : null;
    const fresh = seen ? hits.filter((h) => !(h.record && seen.has(h.record.id))) : hits;
    if (!fresh.length) return { ok: true, deduped: true, cid: target.cid, n: 0 };
    const label = rec.label || rec.id;
    const title = humanNameOf(rec, en) || convId;   // B-c127 THE NAME LADDER (lane channel-agent-watch's next-turn wake, composed at the 2.369.202 integration)
    const inherited = item.source === 'conversation' ? null : { kind: item.source, label: item.source === 'pattern' ? F.patternSummary((patternById(item.patternId) || {}).pattern || { rules: [] }) : null };
    const text = F.renderWakeBlock({ adapterLabel: label, title, convId, hits: fresh, elided: 0, inherited, others: othersFor(wakeEffOf(en), pk) });
    let st = null;
    const fromName = `Channels · ${label}`;
    try { st = deliver.stashFor(target.cid, { source: 'channel', kind: 'notification', fromName, text, about: stashAbout({ keys: [`${rec.id}/${convId}`], cid: target.cid }) }); }
    catch (err) { log.warn(`[channels] ${rec.id}/${convId}: the next-turn notification for ${pk} could not be stashed: ${(err && err.message) || err}`); await keepPending(rec, convId, fresh, 0, pk); return { ok: false, held: true, why: 'stash-failed' }; }
    if (batch && batch.got) { const g0 = batch.got.get(target.cid) || new Set(); for (const h of fresh) if (h.record && h.record.id) g0.add(h.record.id); batch.got.set(target.cid, g0); }
    log.log(`[channels] ${rec.id}/${convId}: ${fresh.length} hit(s) for ${pk} ride its next turn (next-turn notification, no wake)`);
    return { ok: true, stashed: true, next: true, cid: target.cid, n: fresh.length, stored: st && st.stored };
  }
  /** Persist hits as PENDING (bounded, elided counted, tagged with the
   *  watcher they wait for) and arm ONE timer per (conversation, watcher)
   *  for the window; a second burst inside the window joins it. The hits are
   *  on disk before the timer exists. */
  async function queueForWindow(rec, convId, hits, { kind, ms, pk }) {
    await keepPending(rec, convId, hits, 0, pk);
    const key = `${rec.id}/${convId}|${pk}`;
    if (wakeTimers.has(key) || stopped) return;
    const startedAt = now();
    const timer = setTimeout(() => {
      wakeTimers.delete(key);
      track(flushPending(rec, convId, { kind, startedAt, pk }));
    }, Math.max(0, ms));
    if (timer.unref) timer.unref();
    wakeTimers.set(key, { timer, kind, startedAt });
  }
  async function keepPending(rec, convId, hits, elided = 0, pk = null) {
    await store.index.update(() => {
      const e2 = store.index.entry(rec.id, convId, { create: false });
      if (!e2) return;
      healP2(e2);
      for (const h of hits) e2.pending.push({ record: h.record, why: h.why || [], at: now(), ...(pk ? { for: pk } : {}) });
      if (!pk) { e2.pendingElided += Number(elided) || 0; return; }
      if (Number(elided) > 0) e2.pendingElidedBy[pk] = (Number(e2.pendingElidedBy[pk]) || 0) + Number(elided);
      // PENDING_CAP per (conversation, watcher): the oldest of THIS watcher's go
      const idx = [];
      e2.pending.forEach((p, i) => { if (p && p.for === pk) idx.push(i); });
      if (idx.length > PENDING_CAP) {
        const drop = new Set(idx.slice(0, idx.length - PENDING_CAP));
        e2.pendingElidedBy[pk] = (Number(e2.pendingElidedBy[pk]) || 0) + drop.size;
        e2.pending = e2.pending.filter((_, i) => !drop.has(i));
      }
    });
  }
  /** AN INHERITED DIGEST (account / pattern grain, §7.3): the hits wait on
   *  their own conversation (persisted, bounded — the same `pending`, tagged
   *  with the watcher), and ONE timer per (SCOPE, watcher) delivers every
   *  conversation's hits of that window as ONE block — never a digest per
   *  conversation of an 800-thread account. */
  async function queueScopeWindow(rec, convId, hits, item, { ms }) {
    const pk = pkOf(item.watcher.principal);
    await keepPending(rec, convId, hits, 0, pk);
    const key = `scope:${scopeKeyOf(item, rec)}`;
    if (wakeTimers.has(key) || stopped) return;
    const startedAt = now();
    const timer = setTimeout(() => { wakeTimers.delete(key); track(flushScope(rec, item.source, item.patternId, pk, { startedAt })); }, Math.max(0, ms));
    if (timer.unref) timer.unref();
    wakeTimers.set(key, { timer, kind: 'scope-digest', startedAt });
  }
  /** Everyone else on a conversation, for a block's "also on this
   *  conversation" line: `[{name, notify?, authority}]` (R4 — two woken
   *  agents are told about each other). */
  function othersFor(eff0, pk) {
    const eff = eff0 && eff0.base ? eff0.base : eff0;   // the answer as stored (one All row, never its fan-out)
    if (!eff) return [];
    const fan = F.fanOfKey(pk);
    const self = (k) => k === pk || (fan && k === fan.root);
    const out = new Map();
    for (const a of eff.access) { const k = pkOf(a.row.principal); if (!self(k)) out.set(k, { name: a.row.principal.kind === 'everyone' ? 'all agents' : (a.row.principal.name || a.row.principal.id), authority: a.row.authority, notify: null }); }
    for (const w of eff.watchers) { const k = pkOf(w.watcher.principal); if (!self(k) && out.has(k)) out.get(k).notify = w.watcher.notify; }
    return [...out.values()];
  }
  /** Deliver ONE scope digest for ONE watcher: every conversation of the
   *  account whose EFFECTIVE watcher for this principal is this grain and
   *  that holds its pending hits. Paced by THIS watcher's own ledger; a
   *  refusal keeps every hit pending. */
  async function flushScope(rec, source, patternId = null, pk = null, opts = {}) {
    if (stopped) return { ok: false, why: 'stopped' };
    const sKey = `${source === 'account' ? `acct:${rec.id}` : `pat:${patternId}`}|${pk}`;
    return billedWake({ scopeOf: () => sKey }, () => flushScopeNow(rec, source, patternId, pk, sKey, opts));
  }
  /** The scope digest's SECTION BODY — reached only through `billedWake` (see `flushScope`). */
  async function flushScopeNow(rec, source, patternId, pk, sKey, { startedAt = null } = {}) {
    {
      if (stopped) return { ok: false, why: 'stopped', held: true };   // the hits are pending already; the next boot delivers them
      const t = now();
      const holder = source === 'account' ? accountGrainOf(rec.id) : patternById(patternId);
      const w = storedWatcherFor(holder, pk);   // an All-agents fan-out key ⇒ that running conversation's own watcher
      if (!w) return { ok: false, why: 'not-watching' };
      const groups = [];
      const held = [];   // [{id, key, carried}]
      let others = null;
      for (const en of Object.values(store.index.live())) {
        if (!en || en.adapterId !== rec.id || !Array.isArray(en.pending) || !en.pending.length) continue;
        const eff = wakeEffOf(en);
        const item = eff ? eff.watchers.find((x) => itemIs(x, pk)) : null;
        if (!item || item.source !== source || (source === 'pattern' && item.patternId !== patternId)) continue;
        const pend = pendingOf(en, pk, eff);
        if (!pend.hits.length && !pend.elided) continue;
        if (!others) others = othersFor(eff, pk);
        groups.push({ title: humanNameOf(rec, en) || en.id, convId: en.id, hits: pend.hits, elided: pend.elided });   // B-c127: the ladder
        held.push({ key: en.key, id: en.id, eff, carried: pend });
      }
      if (!groups.length) return { ok: false, why: 'nothing-pending' };
      const item0 = { watcher: w, source, patternId };
      const target = resolveTarget(w);
      const why = !target.cid ? target.why : null;
      const pace = target.cid ? F.paceVerdict((w.stats && w.stats.wakes) || [], t, F.digestCap(w)) : { ok: true };
      if (!target.cid || !pace.ok) {
        const wy = why || pace.why;
        await store.index.update((ix) => { const own = watcherRef(ix, rec, null, item0); if (own) own.stats.lastRefusal = { at: t, why: String(wy || '').slice(0, 200) }; });
        log.log(`[channels] scope digest ${sKey}: ${groups.length} conversation(s) held — ${wy}`);
        return { ok: false, why: wy, held: true };
      }
      const label = rec.label || rec.id;
      const scopeLabel = source === 'account' ? 'the whole account' : `the conversations matching a rule (${F.patternSummary(holder.pattern)})`;
      const text = F.renderScopeDigestBlock({ adapterLabel: label, scopeLabel, groups, windowMinutes: startedAt ? Math.max(1, Math.round((t - startedAt) / 60e3)) : w.digestMinutes, others });
      const n = groups.reduce((x, g) => x + g.hits.length + (g.elided || 0), 0);
      const fromName = `Channels · ${label}`;
      const cardText = `${groups.length} conversation${groups.length === 1 ? '' : 's'}: ${n} message${n === 1 ? '' : 's'} — digest`;
      const wk0 = { at: t, n, cid: target.cid, ok: true, lane: 'reserved', why: null, refused: null, digest: true, grain: source, conversations: groups.length, p: pk };
      const resId = await reserveWake(rec, null, item0, wk0);
      if (!resId) { log.log(`[channels] scope digest ${sKey}: ${groups.length} conversation(s) held — the ledger could not take the row`); return { ok: false, why: 'ledger-unwritable', held: true }; }
      let r = null;
      if (!deliver || typeof deliver.deliverToConversation !== 'function') r = { ok: false, reason: 'no delivery ladder wired', refused: 'unwired' };
      else {
        try { r = await deliver.deliverToConversation(target.cid, text, { kind: 'notification', spendReason: 'channel-message', fromName, cardText }); }
        catch (err) { r = { ok: false, reason: `ladder threw: ${(err && err.message) || err}`, refused: 'error' }; }
      }
      const ok = !!(r && r.ok);
      let stashed = false;
      // R4 verify r2: re-ask after the ladder's await (see wakeNow) — a scope
      // digest refused after its watcher lost access is dropped, never stashed
      const wNow = ok ? w : storedWatcherFor(source === 'account' ? accountGrainOf(rec.id) : patternById(patternId), pk);
      const still = ok ? IN_EFFECT : { watched: !!wNow, targetGone: !!wNow && target.via === 'group' && !groupStillHas(w, target.cid) };
      const stillWatched = ok || still.watched;
      const targetGone = !ok && still.watched && still.targetGone;   // r3: the member died — the hits stay pending for the group's next digest
      if (!ok && !stillWatched) log.log(`[channels] scope digest ${sKey}: ${pk} lost its notification while the digest was in flight — the refused block is not stashed`);
      if (targetGone) log.log(`[channels] scope digest ${sKey}: ${target.cid} left group ${pk} while the digest was in flight — ${n} hit(s) held for the group's next digest`);
      if (!ok && stillWatched && !targetGone && deliver && typeof deliver.stashFor === 'function') { try { const st = deliver.stashFor(target.cid, { source: 'channel', kind: 'notification', fromName, text, about: stashAbout({ keys: held.map((h) => h.key), cid: target.cid }) }); stashed = true; if (st && st.stored === false) log.warn(`[channels] ${target.cid}: ${st.why}`); } catch (err) { log.warn(`[channels] stash failed: ${(err && err.message) || err}`); } }
      const words = ok ? { why: null, refused: null } : refusalWords(still, r, 'digest');
      const wk = { ...wk0, ok, lane: ok ? (r.lane || 'message') : (stashed ? 'stash' : 'none'), why: words.why, refused: words.refused };
      try { await store.index.update((ix) => {
        const own = watcherRef(ix, rec, null, item0);
        if (own) finalizeRow(own, resId, wk, t);
        if (target.via === 'group' && target.cursor !== null) rotationsOf(ix)[w.principal.id] = target.cursor;
        if (!(ok || stashed)) return;
        for (const h of held) {
          const e2 = store.index.entry(rec.id, h.id, { create: false });
          if (!e2) continue;
          healP2(e2);
          clearCarried(e2, pk, h.eff, h.carried);
          e2.stats.wakes.push({ ...wk, n: h.carried.ids.size + h.carried.elided });
          e2.stats.wakes = F.pruneLedger(e2.stats.wakes, t);
        }
      }); } catch (err) { log.warn(`[channels] scope digest ${sKey}: the ledger could not take the outcome — the reservation stays counted: ${(err && err.message) || err}`); }
      log.log(`[channels] scope digest ${sKey} → ${target.name || target.cid}: ${groups.length} conversation(s), ${n} hit(s) — ${ok ? `delivered via ${r.lane || 'message'}` : `${stashed ? 'stashed for the next turn' : 'held'}: ${(r && r.reason) || 'refused'}`}`);
      notify(held.map((h) => h.key));
      return { ok, stashed, cid: target.cid, n, conversations: groups.length };
    }
  }
  /** Deliver everything pending on one conversation for ONE watcher (`pk`)
   *  — or, without `pk`, for every watcher holding pending hits — as ONE
   *  wake each (a digest block for a digest window or a boot leftover; a
   *  wake block that says "N in this window" for a coalesced burst). */
  async function flushPending(rec, convId, { kind = 'coalesce', startedAt = null, pk = null } = {}) {
    if (stopped) return { ok: false, why: 'stopped' };
    // the read of `pending` happens INSIDE the conversation's serial section
    // (see serialWake): a flush queued behind a direct wake sees what that
    // wake left, never what it was about to carry
    return billedWake({ conv: `${rec.id}/${convId}` }, async () => {
      const results = [];
      const en0 = store.index.peek(`${rec.id}/${convId}`);
      const eff0 = wakeEffOf(en0);
      if (!en0 || !eff0) return { ok: false, why: 'nothing-pending' };
      const pks = pk ? [pk] : eff0.watchers.map((x) => pkOf(x.watcher.principal));
      for (const p of pks) {
        const en = store.index.peek(`${rec.id}/${convId}`);
        const eff = wakeEffOf(en);
        const item = eff ? eff.watchers.find((x) => itemIs(x, p)) : null;
        if (!en || !item) continue;
        const pend = pendingOf(en, p, eff);
        if (!pend.hits.length && !pend.elided) continue;
        const n = pend.hits.length + pend.elided;
        const seconds = startedAt ? (now() - startedAt) / 1000 : 0;
        results.push(await billedWake({ scopeOf: () => scopeFor(rec, convId, p) }, () => wakeNow(rec, convId, pend.hits, {
          elided: pend.elided, fromPending: pend, pk: p,
          digest: kind === 'digest' || kind === 'boot',
          windowMinutes: kind === 'digest' ? (item.watcher.digestMinutes || F.DEFAULT_DIGEST_MINUTES) : Math.max(1, Math.round(seconds / 60)),
          coalesced: kind === 'coalesce' && n > 1 ? { n, seconds } : null,
        })));
      }
      if (!results.length) return { ok: false, why: 'nothing-pending' };
      return { ...results[0], results };
    });
  }
  /** Who is woken: the agent named, or the group's next live member (§7.3
   *  round-robin, the cursor in the index). A group with no live member is
   *  "keep for the next turn", NEVER "wake them all". `batch` (R4) = the
   *  sessions THIS batch already reached (`got`: cid → record ids): a group
   *  prefers a member the batch has not reached yet. */
  function resolveTarget(w, batch = null) {
    let live = [];
    try { live = liveSessions() || []; } catch (err) { log.warn(`[channels] liveSessions threw: ${(err && err.message) || err}`); }
    if (w.principal.kind === 'agent') {
      const s = live.find((x) => x && x.cid === w.principal.id);
      return { cid: w.principal.id, name: (s && s.name) || w.principal.name || w.principal.id, via: 'agent', live: !!s, cursor: null };
    }
    // ALL AGENTS (lane everyone-principal): a fan-out item names its ONE running conversation; the stored All row
    // itself is never a target (the wake paths read the fan-out — this answer is the fail-closed one)
    if (w.principal.kind === 'everyone') {
      const cid = F.fanTargetOf(w.principal);
      const s = cid ? live.find((x) => x && x.cid === cid) : null;
      if (!cid) return { cid: null, name: null, via: 'everyone', live: false, cursor: null, why: 'all agents — no running conversation named (kept for the next pass)' };
      return { cid, name: (s && s.name) || w.principal.name || cid, via: 'everyone', live: !!s, cursor: null };
    }
    const all = live.filter((x) => x && Array.isArray(x.groups) && x.groups.includes(w.principal.id)).map((x) => x.cid);
    const got = batch && batch.got ? batch.got : null;
    const fresh = got ? all.filter((c) => !got.has(c)) : all;
    const members = fresh.length ? fresh : all;
    const rot = store.index.table('rotations') || {};   // B-f32b: a read of one cursor
    const pick = F.pickRoundRobin(members, Number(rot[w.principal.id]) || 0);
    if (!pick.id) return { cid: null, name: null, via: 'group', live: false, cursor: null, why: `no live session in group ${w.principal.name || w.principal.id} — kept for its next turn` };
    const s = live.find((x) => x.cid === pick.id);
    return { cid: pick.id, name: (s && s.name) || pick.id, via: 'group', live: true, cursor: pick.cursor };
  }

  // WAKES ON ONE CONVERSATION RUN ONE AT A TIME (2026-09-16, the P4 verifier):
  // after a restart the boot flush (5 s) and the first tick's pass (5 s) both
  // read `pending` before either had cleared it, so the same held hits went
  // out twice — two billed turns. The second wake now reads the index only
  // after the first has removed what it carried. R4: every watcher of one
  // conversation queues on this ONE chain, in the order onFresh enqueued them.
  const wakeChains = new Map();   // `${adapterId}/${convId}` | `scope:<grain>|<pk>` → the tail of the wakes queued on it
  // PRIVATE to `billedWake` (R4 verify r4): no other site may take a chain by hand.
  function serialWake(key, fn) {
    const prev = wakeChains.get(key) || Promise.resolve();
    const run = prev.then(() => fn(), () => fn());
    const tail = run.then(() => {}, () => {}).then(() => { if (wakeChains.get(key) === tail) wakeChains.delete(key); });
    wakeChains.set(key, tail);
    return run;
  }
  // AN INHERITED GRAIN'S WAKES RUN ONE AT A TIME TOO (2026-09-26, lane R2
  // verify, critical): an account / pattern watcher has ONE pace ledger for
  // many conversations, and `wakeNow` reads it (paceVerdict) BEFORE the
  // ladder's await and writes it AFTER — so the wakes of a burst, serialized
  // only per CONVERSATION, all passed the check on the same stale ledger: one
  // pass bringing news to 100 conversations under a cap of 5 started 100
  // billed turns whenever the ladder took more than ~2 ms (the real one
  // always does). A grain's wake also queues on its SCOPE's chain — the same
  // key `flushScope` holds, R4: per (scope, PRINCIPAL), because each watcher
  // has its own ledger (two watchers of one account never wait on each
  // other, and neither can pass the other's cap) — so the check and the
  // write of one wake can never straddle another's. Order: conversation,
  // then scope (flushScope takes the scope alone), so no two chains wait on
  // each other.
  //
  // THE ONE DOOR TO A BILLED CHANNEL TURN (R4 verify r4, 2026-09-27 — the
  // fourth strike of "check-then-write across an await" in this campaign:
  // R2's wake cap, S2's credit count, R5's token bucket, R4's receipt —
  // every round a NEW billed-wake writer sat outside the serialized section).
  // `billedWake(keys, fn)` is the ONLY way a section body (`wakeNow`,
  // `flushScopeNow`, `receiptNow`) is entered: it takes the conversation's
  // chain, then — resolved INSIDE that section, never before it — the
  // watcher's scope chain, and runs `fn` there. The cap READ, the ledger
  // RESERVATION (before the ladder) and its FINALIZE (after) all happen
  // inside `fn`. A scope that MOVED while the wake waited for it (the owner
  // re-grained the watcher) is re-taken under the new key, a few times, so
  // the section always holds the chain of the ledger it reads.
  // test-channels-engine ⑫ is the census: every ladder call with a channel
  // reason and every ledger write is lexically inside a section body, and
  // every section body is called only as `billedWake`'s `fn`.
  const SCOPE_MOVED = Symbol('scope-moved');
  const SCOPE_BOUNCE_MAX = 4;
  function billedWake({ conv = null, scopeOf = null }, fn) {
    const inner = async () => {
      for (let bounce = 0; ; bounce++) {
        const sk = typeof scopeOf === 'function' ? scopeOf() : null;
        if (!sk) return fn({ conv, scope: null });
        const r = await serialWake(`scope:${sk}`, () => (bounce < SCOPE_BOUNCE_MAX && scopeOf() !== sk ? SCOPE_MOVED : fn({ conv, scope: sk })));
        if (r !== SCOPE_MOVED) return r;
      }
    };
    return conv ? serialWake(conv, inner) : inner();
  }
  /** The scope chain of watcher `pk` on this conversation, read NOW (null = the conversation grain, whose chain is its conversation's). */
  const scopeFor = (rec, convId, pk) => { const eff = wakeEffOf(store.index.peek(`${rec.id}/${convId}`)); const item = eff ? eff.watchers.find((x) => itemIs(x, pk)) : null; return item ? scopeKeyOf(item, rec) : null; };
  function wake(rec, convId, freshHits, opts = {}) { return billedWake({ conv: `${rec.id}/${convId}`, scopeOf: () => scopeFor(rec, convId, opts.pk) }, () => wakeNow(rec, convId, freshHits, opts)); }
  let wakeSeq = 0;
  /** RESERVE THE LEDGER ROW BEFORE THE BILL (R4 verify r4, money): the
   *  watcher's ledger takes the row (`reserved`) inside the section BEFORE
   *  the ladder is asked; the ladder's answer then FINALIZES that same row
   *  (`finalizeRow`, by id). A reservation that cannot be written is a HOLD
   *  — no row, no bill (a store that could not take the row used to be billed
   *  without bound: the write came after the ladder, so a failing write left
   *  the cap at zero forever); a finalize that fails leaves the reservation
   *  COUNTED (fail closed: one slot burnt, never one turn uncounted). */
  async function reserveWake(rec, convId, item, row) {
    const id = `${row.at}-${++wakeSeq}`;
    try {
      await store.index.update((ix) => {
        const e2 = convId ? store.index.entry(rec.id, convId, { create: false }) : null;
        const own = watcherRef(ix, rec, e2, item);
        if (!own) throw new Error('the watcher is gone');
        // R4 verify r5: {bootId, pid} rides the reservation so a crash's ghost
        // (a reserved row never finalized, from a previous boot) is releasable.
        own.stats.wakes = F.pruneLedger([...(Array.isArray(own.stats.wakes) ? own.stats.wakes : []), { ...row, id, reserved: true, bootId: BOOT_ID, pid: process.pid }], row.at);
      });
      return id;
    } catch (err) { log.warn(`[channels] ${rec.id}${convId ? '/' + convId : ''}: the ledger could not take the wake's row — held, not billed: ${(err && err.message) || err}`); return null; }
  }
  /** The reserved row becomes the final one (found by id; appended if the ledger was pruned under it). */
  function finalizeRow(own, id, row, t) {
    const list = Array.isArray(own.stats.wakes) ? own.stats.wakes : [];
    const i = list.findIndex((x) => x && x.id === id);
    if (i >= 0) list[i] = { ...row, id }; else list.push({ ...row, id });
    own.stats.wakes = F.pruneLedger(list, t);
    own.stats.lastRefusal = null;
  }
  /** Is a group's target session STILL one of its live members? (a session that
   *  left the group while its wake was in flight is not stashed for) */
  function groupStillHas(w, cid) {
    if (!w || w.principal.kind !== 'group') return true;
    let live = []; try { live = liveSessions() || []; } catch { return false; }
    return live.some((x) => x && x.cid === cid && Array.isArray(x.groups) && x.groups.includes(w.principal.id));
  }
  /** R4 verify r2: is the watcher `pk` of this conversation STILL in effect
   *  (its access + notification rows, read fresh) and its target still
   *  addressable? Asked AFTER the ladder's await, before a refused block is
   *  filed into the principal's durable stash. R4 verify r3: TWO answers,
   *  not one — `watched` (the rows are in effect) and `targetGone` (the group
   *  MEMBER this wake was sent to is no longer a live member of the group).
   *  A dead member is not a removed notification: the group still stands
   *  and its hits are HELD for the next wake, which the round-robin routes
   *  to another member. Read as one boolean, a member dying mid-wake dropped
   *  the batch as "access removed" with four live members watching. */
  const IN_EFFECT = Object.freeze({ watched: true, targetGone: false });
  function stillInEffect(rec, convId, pk, target) {
    const eff = wakeEffOf(store.index.peek(`${rec.id}/${convId}`));   // a fan-out target that stopped running is no longer watched
    const item = eff ? eff.watchers.find((x) => itemIs(x, pk)) : null;
    if (!item) return { watched: false, targetGone: false };
    return { watched: true, targetGone: !!(target && target.via === 'group' && !groupStillHas(item.watcher, target.cid)) };
  }
  /** The refused row's two words for the ledger: why + the closed `refused` code. */
  const refusalWords = (still, r, unit) => (!still.watched
    ? { why: `notification removed while the ${unit} was in flight`, refused: 'access-removed' }
    : still.targetGone ? { why: `the group member woken left the group while the ${unit} was in flight — held for the next ${unit}`, refused: 'member-gone' }
      : { why: String((r && r.reason) || 'refused').slice(0, 200), refused: (r && r.refused) || null });

  /**
   * THE WAKE — one delivery for one batch of hits, for ONE watcher (`pk`).
   * Says why (the rule strings ride the block and the log), is paced by THAT
   * watcher's daily cap, goes through the ladder with
   * `spendReason:'channel-message'` (the authorizer inside it charges the
   * slot it authorized), and stashes what the ladder refuses. Records the
   * attempt on the conversation's history and the watcher's ledger either
   * way. Reached ONLY through `wake()` / `flushPending()` (the serial
   * section — the conversation's, and for an inherited grain its scope's).
   */
  async function wakeNow(rec, convId, freshHits, { origin = null, coalesced = null, elided = 0, digest = false, windowMinutes = null, fromPending = null, pk = null, batch = null } = {}) {
    const t = now();
    const en = store.index.peek(`${rec.id}/${convId}`);
    const eff = wakeEffOf(en);
    const item = eff ? eff.watchers.find((x) => itemIs(x, pk)) : null;
    if (!en || !item) return { ok: false, why: 'not-watching' };
    // R4 verify r4: a wake queued behind one in flight when the engine STOPPED
    // is not started — its fresh hits are held for the next boot (two billed
    // turns used to start after stop(), into a process on its way out)
    if (stopped) { if (!fromPending) await keepPending(rec, convId, freshHits, elided, pk); return { ok: false, why: 'stopped', held: true }; }
    const w = item.watcher;
    // the pace ledger of THIS WATCHER (per principal, per grain — never one
    // per conversation of a scope, never one shared by two watchers)
    const paceWakes = (w.stats && w.stats.wakes) || [];
    // HELD HITS RIDE THE NEXT WAKE. A batch the pacing cap or an empty group
    // held is PENDING on the index; a later direct wake carries it along
    // (oldest first), so a hold is a delay and never a drop. Only the NEW
    // hits are re-held on a refusal — the carried ones are already there.
    const carried = fromPending || pendingOf(en, pk, eff);
    const hits = fromPending ? [...freshHits] : [...carried.hits, ...freshHits];
    const newElided = fromPending ? 0 : elided;
    const allElided = fromPending ? carried.elided : elided + carried.elided;
    const target = resolveTarget(w, batch);
    // ONE BATCH NEVER BILLS ONE SESSION TWICE (R4): a session this batch
    // already reached through another watcher (a named agent, a group's
    // round-robin) is sent only the hits it has not seen — none left ⇒ no
    // wake at all, the carried hits counted as delivered.
    const already = batch && batch.got && target.cid ? batch.got.get(target.cid) : null;
    if (already) {
      const unseen = hits.filter((h) => !(h.record && already.has(h.record.id)));
      if (!unseen.length && !allElided) {
        await store.index.update(() => { const e2 = store.index.entry(rec.id, convId, { create: false }); if (!e2) return; healP2(e2); clearCarried(e2, pk, eff, carried); });
        log.log(`[channels] ${rec.id}/${convId}: ${pk} — this batch already reached ${target.cid} through another notification; not woken twice`);
        return { ok: true, deduped: true, cid: target.cid, n: 0 };
      }
      hits.splice(0, hits.length, ...unseen);
    }
    if (!target.cid) {
      if (!fromPending) await keepPending(rec, convId, freshHits, newElided, pk);
      await noteRefusal(rec, convId, target.why, t, item);
      log.log(`[channels] ${rec.id}/${convId}: ${hits.length + allElided} hit(s) held for ${pk} — ${target.why}`);
      return { ok: false, why: target.why, held: true };
    }
    // PACING (layer one, §7.4) — a refusal here is a HOLD, never a drop.
    const pace = F.paceVerdict(paceWakes, t, F.digestCap(w));
    if (!pace.ok) {
      if (!fromPending) await keepPending(rec, convId, freshHits, newElided, pk);
      await noteRefusal(rec, convId, pace.why, t, item);
      log.log(`[channels] ${rec.id}/${convId}: ${hits.length + allElided} hit(s) held for ${pk} — ${pace.why}`);
      return { ok: false, why: pace.why, held: true };
    }
    const label = rec.label || rec.id;
    const title = humanNameOf(rec, en) || convId;   // B-c127 THE NAME LADDER: the id only when nothing else is known (the reply hint keeps it for the CLI)
    const whys = [...new Set(hits.flatMap((h) => h.why || []))];
    const inherited = item.source === 'conversation' ? null : { kind: item.source, label: item.source === 'pattern' ? F.patternSummary((patternById(item.patternId) || {}).pattern || { rules: [] }) : null };
    const others = othersFor(eff, pk);
    const text = digest
      ? F.renderDigestBlock({ adapterLabel: label, title, convId, hits, elided: allElided, windowMinutes: windowMinutes || w.digestMinutes })
      : F.renderWakeBlock({ adapterLabel: label, title, convId, hits, elided: allElided, coalesced, inherited, others });
    const fromName = `Channels · ${label}`;
    const n = hits.length + allElided;
    // B-c127: the card opens with the conversation's NAME (its ref makes it the link) and says who wrote — a mail's sender
    const senders = [...new Set(hits.map((h) => (h.record && h.record.author && peerName(String(h.record.author.name || ''), 60)) || '').filter(Boolean))];
    const fromWords = senders.length ? ` from ${senders.slice(0, 3).join(', ')}${senders.length > 3 ? ` +${senders.length - 3}` : ''}` : '';
    const cardText = `${CR.nameOf([title], convId)}: ${n} message${n === 1 ? '' : 's'}${fromWords} — ${F.whyText(whys)}${coalesced && coalesced.n > 1 ? ` (${coalesced.n} in ${Math.round(coalesced.seconds)} s, one wake)` : ''}`;
    const channel = CR.refOf({ adapterId: rec.id, convId, name: title, account: label, vendor: rec.kind });
    // a direct wake that carries a window's held hits IS that window's
    // delivery — its timer would otherwise fire into an empty (or worse, a
    // refilled) pending and the panel would show a window that is over
    if (!fromPending && (carried.ids.size || carried.elided)) clearWakeTimer(`${rec.id}/${convId}|${pk}`);
    // THE ROW BEFORE THE BILL (see reserveWake): no row ⇒ no ladder call ⇒ the hits are held; R3 (§23): it NAMES whom it reached (the first screen's tag "→ <name>"), bounded
    const wk0 = { at: t, n, cid: target.cid, name: target.name ? String(target.name).slice(0, 80) : null, ok: true, lane: 'reserved', why: null, refused: null, whys: whys.slice(0, 8), digest: !!digest, grain: item.source, p: pk };
    const resId = await reserveWake(rec, convId, item, wk0);
    if (!resId) {
      if (!fromPending) await keepPending(rec, convId, freshHits, newElided, pk).catch(() => {});
      await noteRefusal(rec, convId, 'the ledger could not take the wake\'s row — held', t, item).catch(() => {});
      return { ok: false, why: 'ledger-unwritable', held: true };
    }
    let r = null;
    if (!deliver || typeof deliver.deliverToConversation !== 'function') {
      r = { ok: false, reason: 'no delivery ladder wired', refused: 'unwired' };
    } else {
      // THE ONE UNATTENDED-TURN DOOR (fence 2). The ladder asks the spend
      // authorizer with THIS reason, charges the identity it authorized and
      // releases its hold in its own finally; nothing is added beside it.
      try { r = await deliver.deliverToConversation(target.cid, text, { kind: 'notification', spendReason: 'channel-message', fromName, cardText, channel }); }
      catch (err) { r = { ok: false, reason: `ladder threw: ${(err && err.message) || err}`, refused: 'error' }; }
    }
    const ok = !!(r && r.ok);
    let stashed = false;
    // R4 verify r2 (2026-09-27): THE LADDER IS AN AWAIT — re-ask whether this
    // watcher is STILL in effect before its refused block is stashed for the
    // principal's next turn. The owner removing A's access while A's wake sat
    // inside the ladder (a spend hold, a remote peer-post) used to file the
    // record's text into A's durable stash, drained hours later into a session
    // that no longer held access. A refused wake for a principal that lost its
    // notification at the last await is DROPPED by name, never stashed.
    const still = ok ? IN_EFFECT : stillInEffect(rec, convId, pk, target);
    const stillWatched = ok || still.watched;
    // R4 verify r3: the member a GROUP wake was sent to died / left the group
    // while the wake sat in the ladder — the group is still watching, so the
    // hits are HELD (pending) for its next wake, never stashed for a session
    // that is gone and never dropped as "access removed".
    const targetGone = !ok && still.watched && still.targetGone;
    if (!ok && !stillWatched) log.log(`[channels] ${rec.id}/${convId}: ${pk} lost its notification while the wake was in flight — the refused block is not stashed`);
    if (targetGone) log.log(`[channels] ${rec.id}/${convId}: ${target.cid} left group ${pk} while its wake was in flight — ${hits.length + allElided} hit(s) held for the group's next wake`);
    if (!ok && stillWatched && !targetGone && deliver && typeof deliver.stashFor === 'function') {
      // The ladder's own durable stash: drained into the agent's next
      // context injection (renderMsgStash), so a refusal loses nothing.
      try { const st = deliver.stashFor(target.cid, { source: 'channel', kind: 'notification', fromName, text, about: stashAbout({ keys: [`${rec.id}/${convId}`], cid: target.cid }) }); stashed = true; if (st && st.stored === false) log.warn(`[channels] ${target.cid}: ${st.why}`); } catch (err) { log.warn(`[channels] stash failed: ${(err && err.message) || err}`); }
    }
    if ((ok || stashed) && batch && batch.got) { const g0 = batch.got.get(target.cid) || new Set(); for (const h of hits) if (h.record && h.record.id) g0.add(h.record.id); batch.got.set(target.cid, g0); }
    const words = ok ? { why: null, refused: null } : refusalWords(still, r, 'wake');
    const wk = { ...wk0, ok, lane: ok ? (r.lane || 'message') : (stashed ? 'stash' : 'none'), why: words.why, refused: words.refused };
    try { await store.index.update((ix) => {
      const e2 = store.index.entry(rec.id, convId, { create: false });
      if (!e2) return;
      healP2(e2);
      e2.stats.wakes.push({ ...wk, id: resId });
      e2.stats.wakes = F.pruneLedger(e2.stats.wakes, t);
      e2.stats.lastRefusal = null;
      const own = watcherRef(ix, rec, e2, item);
      if (own) finalizeRow(own, resId, wk, t);
      // the pending hits this wake CARRIED were delivered (or durably
      // stashed) — clear those and only those; with no ladder wired at all
      // they stay pending until one is
      if (ok || stashed) clearCarried(e2, pk, eff, carried);
      else if (!stillWatched) clearCarried(e2, pk, eff, carried);   // nobody waits for them any more (prunePending would drop them next)
      else if (!fromPending) {
        for (const h of freshHits) e2.pending.push({ record: h.record, why: h.why || [], at: t, for: pk });
        if (Number(newElided) > 0) e2.pendingElidedBy[pk] = (Number(e2.pendingElidedBy[pk]) || 0) + Number(newElided);
      }
      if (target.via === 'group' && target.cursor !== null) rotationsOf(ix)[w.principal.id] = target.cursor;
    }); } catch (err) { log.warn(`[channels] ${rec.id}/${convId}: the ledger could not take the wake's outcome — the reservation stays counted: ${(err && err.message) || err}`); }
    log.log(`[channels] wake ${rec.id}/${convId} → ${target.name || target.cid}: ${n} hit(s) (${F.whyText(whys)})${coalesced && coalesced.n > 1 ? `, ${coalesced.n} coalesced in ${Math.round(coalesced.seconds)} s` : ''}${digest ? ', digest' : ''} — ${ok ? `delivered via ${r.lane || 'message'}` : `${stashed ? 'stashed for the next turn' : 'held'}: ${(r && r.reason) || 'refused'}`}`);
    notify([convId]);
    return { ok, stashed, cid: target.cid, n, why: ok ? null : ((r && r.reason) || 'refused'), refused: ok ? null : refusalWords(still, r, 'wake').refused, held: targetGone || undefined };
  }
  async function noteRefusal(rec, convId, why, t, item = null) {
    await store.index.update((ix) => {
      const e2 = store.index.entry(rec.id, convId, { create: false });
      if (!e2) return;
      healP2(e2);
      e2.stats.lastRefusal = { at: t, why: String(why || '').slice(0, 200) };
      if (item) { const own = watcherRef(ix, rec, e2, item); if (own) own.stats.lastRefusal = { at: t, why: String(why || '').slice(0, 200) }; }
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // P3: OUTBOX · POLICY · AGENT REACH (design §8, §9, §11, §12.3)
  //
  // ONE STORE, TWO SURFACES (§9.2): the inline card in a conversation window
  // and the Outbox window both render `outboxView()`, so they cannot disagree.
  // The "For you" pointer is PER CONVERSATION, without a count in its text
  // (the inbox dedupes by text — that is the idempotence we want), its id
  // persisted on the conversation row (`pendingTodoId`) and retracted by THIS
  // producer the moment the last proposal leaves `awaiting-approval`.
  //
  // MONEY: an approved send to the built-in Agents adapter rides the ladder
  // inside the adapter (peer-message); the RECEIPT rides the ladder from here
  // with `noWake` unless the assignment opted in (decision 8). The audit line
  // carries draftedBy / approvedBy / sentAs / identityMarking and NEVER leaves
  // this instance — the message body carries none of it (§9.5).
  //
  // P4 (§9.4 / §9.5, 2026-09-16) — REAL EXTERNAL SEND, EXACTLY ONCE OR
  // HONESTLY UNKNOWN: `sendNow` stamps `attemptAt` + the WIRE text on the
  // proposal BEFORE the request, hands a two-phase adapter's durable handle
  // (`onHandle`) to the store the moment it exists, and reads a transport
  // failure AFTER the request left (`detail.lost`) as `unknown` — never as
  // `failed`. `reconcile()` is the ONLY way out of `unknown`, asked by a
  // PERSON, gated on the adapter's declared idempotency (`none` cannot be
  // asked). `sweepSending()` turns a `sending` proposal the previous process
  // died on into `unknown` at boot (actor `boot`). THE SENDER HONESTY LINE
  // is OFF by default (`channels.senderHonestyLine`, overridable per adapter
  // record) and appended at send time ONLY for an agent-drafted proposal —
  // the card says so before the approval. A send's `observed` identity
  // (the vendor's own sender_type) is recorded on the adapter row as the
  // §21-item-3 proof, and logged when the declaration is still `unknown`.
  // ══════════════════════════════════════════════════════════════════════════
  const OUTBOX_LIST_CAP = 200;
  const EXPIRY_SWEEP_MS = 60e3;
  let lastExpirySweep = 0;

  /** The guard config from settings — unparseable ⇒ the PURE decision fails closed. */
  function guardsFromSettings() {
    const read = (k) => { try { return serverSetting(k); } catch { return undefined; } };
    const tz = read('channels.offHoursTz');
    return {
      linksReview: read('channels.guardLinksReview') !== false,
      attachmentsReview: read('channels.guardAttachmentsReview') !== false,
      offHours: { enabled: true, tz: typeof tz === 'string' ? tz.trim() : '', start: read('channels.offHoursStart') || '09:00', end: read('channels.offHoursEnd') || '18:00' },
    };
  }
  /** THE SENDER HONESTY LINE SWITCH (§9.5, decision 17 as overruled): OFF by
   *  default. The instance setting `channels.senderHonestyLine` is the
   *  default and the adapter record's own `senderHonestyLine` (true / false /
   *  null = follow the instance) overrides it — a per-channel option. */
  function honestyLineFor(rec) {
    if (rec && rec.senderHonestyLine === true) return true;
    if (rec && rec.senderHonestyLine === false) return false;
    let v; try { v = serverSetting('channels.senderHonestyLine'); } catch { v = undefined; }
    return v === true;
  }
  /** THE IDENTITY PROOF (§21 item 3): a real send's `observed` identity —
   *  the vendor's own sender_type — is recorded on the adapter row (the
   *  panel shows it) and, while the declaration is still `unknown`, LOGGED
   *  with the flip it licenses. The declaration itself stays code. */
  async function noteIdentityObserved(rec, as, observed, vendorMessageId = null) {
    if (!rec || !observed || !observed.senderType) return null;
    const c = registry.capsOf(rec.kind);
    const entry = { as: as || null, senderType: String(observed.senderType), at: now(), vendorMessageId: vendorMessageId || null, declared: c.identityMarking };
    await store.adapters.update(() => { rec.identityObserved = entry; });
    if (c.identityMarking === 'unknown') log.log(`[channels] ${rec.id}: IDENTITY PROOF — a real send as '${entry.as}' came back with sender_type='${entry.senderType}' while caps.identityMarking is 'unknown': flip the declaration in src/channels/${rec.kind}.js to ${entry.senderType === 'user' ? "'none'" : "'marked' (recipient-ui)"} with its identityMarkingText`);
    return entry;
  }
  /** What the recipient will see, as STRUCTURE (§9.5) — the card says the words. */
  function identityFor(rec, sendAs) {
    const c = registry.capsOf(rec.kind);
    return { sentAs: sendAs, marking: c.identityMarking, where: c.identityMarkingWhere || null, text: c.identityMarkingText || null };
  }
  /** Which identity a proposal would send as RIGHT NOW: user first, bot as
   *  the fallback (decision 2), or null with the reason when neither is
   *  offered — and then NO proposal is created. */
  function sendIdentityFor(rec, en, t) {
    const c = registry.capsOf(rec.kind);
    const u = caps.offers(c, effectiveConvCaps(rec, en), 'send-as-user', t);
    if (u.offered) return { as: 'user', why: null, userWhy: null };
    const b = caps.offers(c, effectiveConvCaps(rec, en), 'send-as-bot', t);
    if (b.offered) return { as: 'bot', why: null, userWhy: u.why || 'unknown' };
    return { as: null, why: u.why || b.why || 'unknown', userWhy: u.why || 'unknown' };
  }
  /** The principal's reach on ONE conversation. The built-in Agents adapter
   *  answers with msg-acl through the ONE crosswalk (§12.3); every other
   *  adapter with channel-acl over the row's grants. */
  function reachFor(ctx, rec, en) {
    if (!ctx || ctx.kind === 'user') return { level: 'visible', via: 'user', grantId: null };
    let mod = null;
    try { mod = registry.get(rec.kind); } catch {}
    if (mod && mod.builtin) {
      const lv = typeof ctx.msgLevelFor === 'function' ? ctx.msgLevelFor(en.id) : 'none';
      return { level: ACL.fromMsgLevel(lv), via: 'msg-acl', grantId: null };
    }
    const target = { key: en.key, adapterId: en.adapterId };
    return ACL.effective(ctx, target, grantsOfConversation(en, target));
  }
  /** EVERY grant that applies to ONE conversation (2026-09-26, §8): its own
   *  rows, the ACCOUNT-scope rows, and the rows a matching PATTERN's ACCESS
   *  list implies (R4: one per access row) — derived here at read time,
   *  never stored. A conversation's own access rows before the migration
   *  reached it (a legacy `assignment` with no reach row) grant too. */
  function grantsOfConversation(en, target = { key: en.key, adapterId: en.adapterId }) {
    const acct = (store.index.table('accountGrants') || []).filter((g) => g && g.scope && g.scope.kind === 'adapter' && g.scope.id === en.adapterId);
    const derived = [];
    for (const pa of patternsOf(en.adapterId)) {
      if (!F.matchConversation(pa.pattern, convFacts(en)).hit) continue;
      for (const r of F.grainOf(pa).access) {
        try { derived.push(ACL.patternGrant({ principal: { kind: r.principal.kind, id: r.principal.id, name: r.principal.name || null }, key: en.key, patternId: pa.id })); } catch { /* a malformed principal grants nothing */ }
      }
    }
    return ACL.grantsForConversation(target, { entries: en.reachEntries || [], accountGrants: acct, patternGrants: derived });
  }
  /** The groups a live session belongs to (a drafter's, for its receipt). */
  function groupsOfSession(cid) {
    try { const s = (liveSessions() || []).find((x) => x && x.cid === cid); return s && Array.isArray(s.groups) ? s.groups.slice() : []; } catch { return []; }
  }
  function convFor(adapterId, convId) {
    const en = store.index.peek(`${adapterId}/${convId}`);   // B-f32b: a copy of THAT row, never of the index
    const rec = en ? adapterRecords().adapters.find((r) => r.id === adapterId) || null : null;
    return { en, rec };
  }
  /**
   * REACH RE-ASKED AFTER AN AWAIT (lane channel-threads verify r2, IDENTITY): every agent verb asks reach FIRST, and
   * one that awaited since (a vendor call — the thread walk, the refresh; a convCaps lookup before a draft; the store's
   * search) asks AGAIN before it answers or creates anything. The owner's revoke can land inside the await: the walk's
   * answer used to carry its count and the title, a reaction / reply draft was CREATED for an agent that no longer had
   * access (its answer quoting the target), and a search returned the revoked conversation's messages. `true` for the
   * user (the owner sees everything); a composed message's scope is the ACCOUNT (`convId` null).
   */
  function stillSees(ctx, adapterId, convId) {
    if (!ctx || ctx.kind !== 'agent') return true;
    try {
      if (convId === null || convId === undefined) return ACL.canSee(ACL.effective(ctx, { key: '', adapterId }, accountScopeGrants(adapterId)).level);
      // the LIVE entry, read-only (verify r3, the event loop): `convFor` deep-clones the whole index (`snapshot()`), and
      // the stash gate asks this per waiting entry per read — a digest flood over 64 agents' full stashes spent 14 ms
      // per reaction event cloning an index whose sentBy ledger was 12 800 ids (80 ms → 57 s for 4 000 events)
      const en = store.index.live()[`${adapterId}/${convId}`] || null;
      const rec = en ? adapterRecords().adapters.find((r) => r.id === adapterId) || null : null;
      return !!(en && rec && rec.enabled !== false && ACL.canSee(reachFor(ctx, rec, en).level));
    } catch { return false; }
  }
  function proposalsFor(key = null) {
    const all = Object.values(store.outbox.snapshot().proposals);
    return (key ? all.filter((p) => p.key === key) : all).sort((a, b) => (b.at || 0) - (a.at || 0));
  }
  /** A proposal as the two surfaces read it — plus the identity warning
   *  STRUCTURE for its adapter and its expiry instant. */
  function proposalView(p) {
    const rec = adapterRecords().adapters.find((r) => r.id === p.adapterId) || null;
    const c = rec ? registry.capsOf(rec.kind) : null;
    const { ttlAt } = P.expiryVerdict(p, now());
    // P4: the honesty line the card must show BEFORE the approval (live off
    // the switch while the proposal is pending; the recorded fact after), and
    // whether a lost outcome can be reconciled by the machine at all.
    const pending = p.state === 'proposed' || p.state === 'awaiting-approval' || p.state === 'sending';
    const reactionKind = p.kind === 'reaction';
    // a reaction carries no text, so no sender line; its lost outcome is checked by ONE list call where reactions are listed
    const honestyLine = reactionKind ? null : pending ? P.honestyLine({ draftedBy: p.draftedBy, enabled: honestyLineFor(rec) }) : (p.result && p.result.honestyLine ? P.honestyLine({ draftedBy: p.draftedBy, enabled: true }) : null);
    const can = p.state === 'unknown' ? (!c ? { ok: false, code: 'no-adapter', why: 'the adapter no longer exists' } : reactionKind ? (reactionsRow(c).read === 'list' ? { ok: true } : { ok: false, code: 'no-idempotency', why: 'this channel does not list reactions — only a person can check the platform' }) : P.canReconcile(c)) : null;
    return {
      ...p, ...(p.convId && conversationName(p.adapterId, p.convId) ? { title: conversationName(p.adapterId, p.convId) } : {}),   // B-c127: the conversation's name NOW (a proposal froze its title — or the raw id — when it was drafted)
      adapterLabel: rec ? (rec.label || rec.id) : p.adapterId, identityWarning: c ? caps.identityWarning(c) : null, ttlAt, canDecide: p.state === 'awaiting-approval',
      convKind: (p.key && store.index.live()[p.key] && store.index.live()[p.key].kind) || null,   // B-f467: the Outbox row draws the conversation's own avatar (a mail thread = the mail glyph)
      // r3: how many agents approving this WAKES (a billed turn each) — the
      // card says it and echoes it with the Approve (`expectWakes`)
      wakes: !reactionKind && sendStartsTurn(rec) ? 1 : 0,
      honestyLine, canReconcile: !!(can && can.ok), reconcileWhy: can && !can.ok ? can.why : null, reconcileWhyCode: can && !can.ok ? (can.code || null) : null,
      // THE OUTCOME AS STRUCTURE (a3 i18n): `p.reason` stays the English
      // contract string agents read; the card words `outcome` in its language.
      outcome: P.outcomeOf(p),
      // 2026-09-28: WHERE A REPLY LANDS — the placement read through its alias (a proposal stored before the enum
      // carries `inThread` / `replyTo` only), and its words for the agent's CLI (the card words it in its language)
      ...(P.placementOf(p) ? { placement: P.placementOf(p), placementText: P.placementWords(P.placementOf(p)) } : {}),
    };
  }
  /**
   * THE DRAFTER'S VIEW OF ITS OWN PROPOSAL (lane channel-threads verify r2, IDENTITY). While the agent still sees the
   * proposal's conversation (the ACCOUNT, for a composed message) = `proposalView`; once the owner removed its access =
   * the FATE only — id, kind, state, when, the ids it named itself — and nothing the conversation produced: no title,
   * no quote, no vendor message / thread id minted after the revoke, no reason's words, no receipt facts. `status`,
   * `withdraw` / `--replaces` and the draft verbs answer through it; the receipt's ladder block says the same
   * (`P.withheldReceiptLine`). A user caller sees everything.
   */
  const scopeConvOf = (p) => (p && !p.compose && p.convId ? p.convId : null);
  function agentProposalView(ctx, p) {
    if (!p) return p;
    const v = agentProposalViewRaw(ctx, p);
    return ctx && ctx.kind === 'agent' ? agentIdsOf(v) : v;   // verify r3 F6: an AGENT's view carries its ids as line pieces (the user's window keeps them as they are)
  }
  /** the drafter's view (whole while it still sees, else the fate) — its two lines are test-channels-engine's control pins, kept verbatim */
  function agentProposalViewRaw(ctx, p) {
    if (!ctx || ctx.kind !== 'agent' || stillSees(ctx, p.adapterId, scopeConvOf(p))) return proposalView(p);
    return withheldProposal(p);
  }
  /** verify r3 F6: the ids a proposal's AGENT view carries — the target conversation, its thread, the answered message, the
   *  sent message's vendor id (the receipt), a reaction's message + its quote's author (a name, else an id) — as line pieces */
  function agentIdsOf(v) {
    if (!v || typeof v !== 'object') return v;
    const out = { ...v, convId: agentId(v.convId), threadKey: agentId(v.threadKey), replyTo: agentId(v.replyTo) };
    if (v.replyEnvelope && typeof v.replyEnvelope === 'object') out.replyEnvelope = agentEnvelope(v.replyEnvelope);   // B-a085: the recipients the agent's CLI prints
    if (v.receipt && typeof v.receipt === 'object') out.receipt = { ...v.receipt, vendorMessageId: agentId(v.receipt.vendorMessageId) };
    if (v.reaction && typeof v.reaction === 'object') out.reaction = { ...v.reaction, msg: agentId(v.reaction.msg), ...(v.reaction.quote && typeof v.reaction.quote === 'object' ? { quote: { ...v.reaction.quote, author: agentText(v.reaction.quote.author, { kind: 'line', max: 200 }) } } : {}) };
    return out;
  }
  function withheldProposal(p) {
    return {
      id: p.id, kind: p.kind || 'message', state: p.state, at: p.at || null, updatedAt: p.updatedAt || null,
      adapterId: p.adapterId, convId: p.convId || null, title: null, draftedBy: p.draftedBy || null,
      accessRemoved: true, note: P.ACCESS_REMOVED_NOTE,
      receipt: p.receipt ? { proposalId: p.id, status: p.receipt.status, ...(p.kind === 'reaction' ? { kind: 'reaction' } : {}), withheld: true } : null,
      ...(p.kind === 'reaction' && p.reaction ? { reaction: { msg: p.reaction.msg, key: p.reaction.key, op: p.reaction.op, glyph: p.reaction.glyph || null } } : {}),
    };
  }
  /** The drafter's Task Groups AT DRAFT TIME (`drafterGroups`, beside `draftedBy` — whose shape the audit and the
   *  withdraw verdicts read): what a receipt judges reach by when the drafter's session is not live at the decision. */
  const drafterGroupsOf = (ctx) => (ctx && ctx.kind === 'agent' && Array.isArray(ctx.groups) && ctx.groups.length ? { drafterGroups: ctx.groups.map(String).slice(0, 50) } : {});
  /** Does the DRAFTER of `p` still see where it drafted? — the receipt's question (no route principal at hand: the
   *  agent's own grants + its groups' — the LIVE session's, else the ones recorded at draft time: a group-granted
   *  drafter whose session ended before the decision still sees, and hears its receipt whole). A built-in Agents
   *  conversation's reach is msg-acl, which only the agent route can judge (`msgLevelFor`) — not withheld here. */
  function drafterSees(p) {
    const d = p && p.draftedBy;
    if (!d || d.kind !== 'agent' || !d.id) return true;
    const rec = adapterRecords().adapters.find((r) => r.id === p.adapterId) || null;
    try { if (rec && registry.get(rec.kind).builtin) return true; } catch { }
    let live = null;
    try { live = (liveSessions() || []).find((x) => x && x.cid === String(d.id)) || null; } catch { live = null; }
    const groups = live ? (Array.isArray(live.groups) ? live.groups.slice() : []) : (Array.isArray(p.drafterGroups) ? p.drafterGroups.slice() : []);
    return stillSees({ kind: 'agent', id: String(d.id), name: d.name || null, groups, msgLevelFor: () => 'none' }, p.adapterId, scopeConvOf(p));
  }
  /**
   * WHAT WAITS IN AN AGENT'S NEXT-TURN STASH IS RE-JUDGED WHEN IT IS READ (lane channel-threads verify r3, IDENTITY —
   * reproduced over this engine, the real stash (conversation-deliver) and the real injection (agent-routes
   * drainStashUnderCap)): a watcher's held wake — the message text —, a proposal's receipt — the title, the vendor id —
   * and a reaction digest were filed for the agent's next turn while it had access; the owner removed its access; `read`
   * answered the uniform not-found and the agent's next prompt drained all three WHOLE. Every entry this engine files
   * carries `about` = {keys: [the conversations its words came from], account: <adapterId> for a composed message's
   * receipt, groups: [the recipient's Task Groups when it was filed]}, and the ladder asks THIS gate at every read of the
   * queue (`registerStashGate`): the recipient still sees every key (its own grants + its groups' — the LIVE session's,
   * else the recorded ones, the `drafterSees` rule; a built-in Agents conversation is msg-acl's, judged at the route) ⇒
   * kept; otherwise a receipt keeps its FATE (`P.withheldReceiptLine` — its card still tracks it by `ref`) and anything
   * else is withheld whole (dropped, never delivered, said in the log). An unreadable `about` withholds (fail closed).
   */
  const STASH_ABOUT_KEYS_MAX = 64;
  const builtinAccount = (adapterId) => { const rec = adapterRecords().adapters.find((r) => r.id === adapterId) || null; try { return !!(rec && registry.get(rec.kind).builtin); } catch { return false; } };
  const stashAbout = ({ keys = [], account = null, cid = null, groups = null } = {}) => {
    let g = groups;
    if (!Array.isArray(g)) g = cid ? groupsOfSession(String(cid)) : [];
    return { keys: [...new Set((keys || []).filter(Boolean).map(String))].slice(0, STASH_ABOUT_KEYS_MAX), ...(account ? { account: String(account) } : {}), groups: g.map(String).slice(0, 50) };
  };
  // `memo` = ONE read of one queue (the ladder hands a fresh Map per pass): the live session is looked up once, and a
  // (groups, key) verdict is asked once — a 30-entry stash read is one roster lookup + one reach per distinct key
  function stashGate(cid, entry, memo = null) {
    if (!entry || (entry.source !== 'channel' && entry.source !== 'channel-receipt')) return null;
    const a = entry.about;
    if (!a || typeof a !== 'object') return null;
    const M = memo instanceof Map ? memo : new Map();
    let sees = !a.oversize && ((Array.isArray(a.keys) && a.keys.length > 0) || !!a.account) && !(Array.isArray(a.keys) && a.keys.length > STASH_ABOUT_KEYS_MAX);
    if (sees) {
      if (!M.has('live')) { let live = null; try { live = (liveSessions() || []).find((x) => x && x.cid === String(cid)) || null; } catch { live = null; } M.set('live', live); }
      const live = M.get('live');
      const groups = live ? (Array.isArray(live.groups) ? live.groups.slice() : []) : (Array.isArray(a.groups) ? a.groups.map(String) : []);
      const ctx = { kind: 'agent', id: String(cid), name: null, groups, msgLevelFor: () => 'none' };
      const gk = groups.join('\u0000');
      const seesKey = (adapterId, convId) => {
        const mk = `${gk}\u0001${adapterId}\u0001${convId === null ? '' : convId}`;
        if (!M.has(mk)) M.set(mk, builtinAccount(adapterId) || stillSees(ctx, adapterId, convId));
        return M.get(mk);
      };
      for (const k of Array.isArray(a.keys) ? a.keys.map(String) : []) {
        const i = k.indexOf('/');
        if (i <= 0) { sees = false; break; }
        if (!seesKey(k.slice(0, i), k.slice(i + 1))) { sees = false; break; }
      }
      if (sees && a.account && !seesKey(String(a.account), null)) sees = false;
    }
    if (sees) return null;
    if (entry.source === 'channel-receipt' && entry.ref) {
      const p = store.outbox.snapshot().proposals[String(entry.ref)] || null;
      const rc = p && p.receipt ? { ...p.receipt, proposalId: p.id } : { proposalId: String(entry.ref).slice(0, 80), status: (p && p.state) || 'decided', ...(p && p.kind === 'reaction' ? { kind: 'reaction' } : {}) };
      return { text: P.withheldReceiptLine(rc), fromName: 'Channels · Outbox' };
    }
    return { drop: true };
  }
  function outboxView({ key = null, limit = OUTBOX_LIST_CAP } = {}) {
    const list = proposalsFor(key).slice(0, Math.max(1, limit)).map(proposalView);
    const all = proposalsFor();
    return {
      proposals: list,
      accounts: accountsBrief(),   // B-f467: the rows' account badges (a hue is a function of the whole list — B-5fe1)
      awaitingTotal: all.filter((p) => p.state === 'awaiting-approval').length,
      unknownTotal: all.filter((p) => p.state === 'unknown').length,
      at: now(),
    };
  }
  function notifyOutbox(changed = []) {
    try { broadcast({ type: 'channel-outbox-updated', changed, outbox: outboxView() }); } catch (err) { console.warn('[channels] outbox broadcast failed:', err && err.message); }
  }
  /** ONE state change, through the PURE table. Mutates the LIVE proposal
   *  inside the outbox's serialized door; refuses (never throws) with the
   *  table's own reason. */
  /** `unless(p)` (2026-09-27 verify): a guard asked INSIDE the store's
   *  serialized write, at apply time — the TTL sweep's "is a replace holding
   *  this id" question. Asked before the write it raced the hold: the sweep
   *  took its due list, a replace of one of them passed its own check and
   *  made the new draft while the sweep was busy with an earlier proposal,
   *  and the sweep's write then landed BETWEEN the replace's check and its
   *  withdrawal — an "EXPIRED unapproved" receipt for a draft the agent had
   *  just replaced. The hold is set synchronously when the replace is called,
   *  so at apply time it is either visible (skip) or the replace's check will
   *  read this write (refused before anything is made). */
  async function transition(id, to, by, patch = null, { unless = null } = {}) {
    let verdict = { ok: false, why: 'no such proposal' };
    await store.outbox.update((ob) => {
      const p = ob.proposals[id];
      if (!p) return;
      if (typeof unless === 'function' && unless(p)) { verdict = { ok: false, why: 'held: a replace of this proposal is in flight', held: true }; return; }
      verdict = P.canTransition(p.state, to, by);
      if (!verdict.ok) return;
      const t = now();
      p.state = to; p.updatedAt = t;
      if (to === 'awaiting-approval') p.awaitingSince = t;
      if (!Array.isArray(p.history)) p.history = [];
      p.history.push({ state: to, at: t, by });
      if (patch) patch(p, t);
    });
    return verdict;
  }
  function auditOutbox(p, op, extra = {}) {
    try {
      store.audit({
        kind: 'outbox', op, proposalId: p.id, adapterId: p.adapterId, convId: p.convId, state: p.state,
        draftedBy: p.draftedBy, approvedBy: p.approvedBy || null, sentAs: (p.result && p.result.sentAs) || p.sendAs || null,
        identityMarking: p.identity ? p.identity.marking : null, edited: !!p.edited, ...extra,
      });
    } catch (err) { log.warn(`[channels] outbox audit failed: ${(err && err.message) || err}`); }
  }

  /**
   * PROPOSE (§9.1). `ctx` is the caller's principal — an agent's
   * `{kind:'agent', id, name, groups, msgLevelFor}` resolved by the route
   * BEFORE this is asked, or `{kind:'user'}` from the composer. On a
   * conversation where no identity is offered the answer is the typed
   * `send-not-available` and NOTHING is created (§4).
   *
   * THE OWNER'S OWN MESSAGE (design §22, 2.369.159 — "an IM, not a feed"):
   * `input.direct === true` from the USER (the composer's Send, `POST …/send`)
   * skips the policy and its guards — the owner's own words go out at once,
   * AS THE OWNER, the way a message typed into the platform's own client
   * would. It still rides the whole outbox machinery (the record, the audit
   * attempt/outcome, the lost-answer `unknown` that is never re-sent); only
   * `sendAs:'user'` qualifies (a bot identity is not the owner speaking — that
   * conversation answers `send-not-available` with the send-as-user reason,
   * and the composer offers the proposal path instead). An AGENT's `direct`
   * is ignored: agent drafts are what the policy exists for.
   */
  /** Does a send on this record START A BILLED TURN? The adapter MODULE
   *  declares it (`sendStartsTurn` — the built-in Agents adapter's send is a
   *  wake through the delivery ladder), never its id (r3). */
  function sendStartsTurn(rec) { try { return !!(rec && registry.get(rec.kind).sendStartsTurn); } catch { return false; } }
  /**
   * THE WAKE GATE of a send that starts a turn (r3 — the side doors r2 left
   * beside the group routes). `n` = the wakes the act causes NOW (0 or 1).
   * `consent(n)` first (the owner's echo: a caller that never saw the
   * preview cannot wake — `wake-count-mismatch`, with `wakes`), then
   * `mayWake(convId)` (THE groups engine's pacer — one ledger for every owner
   * route, handed in only when auth is off; an agent route hands its own):
   * a floored send is `rate-floor` and NOTHING moves. `{ok:true, granted}`
   * — a granted slot is refunded when the send did not go out.
   */
  function wakeGate(convId, n, { consent = null, mayWake = null } = {}) {
    if (!n) return { ok: true, granted: false };
    if (typeof consent === 'function') {
      const v = consent(n);
      if (!(v === true || (v && v.ok === true))) return { ok: false, code: (v && v.code) || 'wake-count-mismatch', error: (v && v.error) || 'the wake was not confirmed', wakes: n };
    }
    if (typeof mayWake !== 'function') return { ok: true, granted: false };
    const pace = mayWake(convId);
    if (pace !== true) {
      const reason = String((pace && pace.reason) || 'rate floor').replace(/ — it reaches them on their next turn instead$/, '');
      return { ok: false, code: 'rate-floor', error: `${reason} — nothing was sent (send again once the floor passes, or post in a group: that reaches them on their next turn, free)`, why: (pace && pace.why) || null, wakes: n };
    }
    return { ok: true, granted: true };
  }
  /** The proposals whose adapter send was CALLED (r4): set right before
   *  `adapter.send`, cleared when sendNow returns — an entry that survives
   *  is a sendNow that THREW after the request may have left. */
  const sendLeft = new Set();
  /**
   * Give a granted wake slot back when the send did not go out. `threw`
   * (r4): the act threw between the grant and its outcome (a blocked store's
   * 503, an EACCES/ENOSPC write) — a proposal that never reached its adapter
   * returns the PAIR and the sender's minute (nothing reached the
   * authorizer, so it was not an attempt: the retry is sent, never a 429
   * blaming a wake that never happened); one whose request may have LEFT
   * keeps the whole slot. Without a throw: `sent`/`unknown` keep the slot,
   * anything else (a refusal) returns the pair and keeps the attempt.
   */
  function wakeRefundIfUnsent(gate, guards, convId, id, { threw = false } = {}) {
    const left = id ? sendLeft.has(id) : false;
    if (threw && id) sendLeft.delete(id);
    if (!gate || !gate.granted || !guards || typeof guards.mayWake !== 'function' || typeof guards.mayWake.refund !== 'function') return;
    const p = id ? store.outbox.snapshot().proposals[id] : null;
    // `unknown` keeps the slot: the request LEFT, the turn may be running
    if (p && (p.state === 'sent' || p.state === 'unknown')) return;
    if (threw && left && !(p && p.state === 'failed')) return;
    const attempted = !threw || left;
    try { guards.mayWake.refund(convId, { attempted }); } catch { }
  }

  // ── WHAT A REPLY ANSWERS AND WHO RECEIVES IT (r6 verify F1 / F3, 2026-09-28) ──────────────────────────
  // A Lark reply is POSTed to `/messages/<replyTo>/reply` — the request names the MESSAGE, never the chat — so an
  // agent proposing in conversation A with a message id of chat B posted into B while the card showed A (and on a
  // direct-policy A it went out with no card at all, past B's own policy and reach). A reply answers ONLY a
  // message this engine STORED for that very conversation (`store.findRecord` in A's own log), judged at propose
  // and again at approval / send. An adapter whose reply's RECIPIENTS follow from the message it answers
  // (`caps.replyEnvelope` — Gmail) resolves them NOW, for the anchor the engine picked (the one named, else the
  // conversation's newest STORED message) — never at send time from whatever the thread's newest message is then.
  function storedRecord(adapterId, convId, vendorId) {
    if (!store.index.live()[`${adapterId}/${convId}`]) return null;   // the .197 integration: a KNOWN conversation's log only (the clear census)
    if (vendorId === null || vendorId === undefined || vendorId === '') return null;
    try { return typeof store.findRecord === 'function' ? store.findRecord(adapterId, convId, String(vendorId)) : null; } catch { return null; }
  }
  function newestStored(adapterId, convId) {
    if (!store.index.live()[`${adapterId}/${convId}`]) return null;   // the .197 integration: a KNOWN conversation's log only (the clear census)
    try { const tail = store.readTail(adapterId, convId, { limit: 1 }); return tail.length ? tail[tail.length - 1] : null; } catch { return null; }
  }
  /** `{ok:true, anchor, envelope}` (both null for a plain message) or `{ok:false, answer}` — the refusal as propose returns it. */
  async function replyTargetFor(rec, adapterId, convId, replyTo, { all = false, cc = null } = {}) {
    const c = registry.capsOf(rec.kind);
    const wantsEnvelope = c.replyEnvelope === true;
    // B-a085: reply-all / an added Cc exist only where a reply's recipients follow from the message it answers (mail)
    const addCc = Array.isArray(cc) && cc.length ? cc : null;
    if ((all === true || addCc) && !wantsEnvelope) return { ok: false, answer: { ok: false, code: 'bad-proposal', why: all === true ? 'replyAll' : 'cc', error: `${all === true ? 'reply-all' : 'an added Cc'} is offered only on mail (a channel whose reply goes to the people on the message it answers) — nothing was created` } };
    let record = null;
    if (replyTo !== null && replyTo !== undefined) {
      record = storedRecord(adapterId, convId, replyTo);
      const av = P.replyAnchorVerdict({ replyTo, convId, record });
      if (!av.ok) return { ok: false, answer: { ok: false, code: 'bad-proposal', why: av.code, error: av.why } };
    } else if (wantsEnvelope) {
      record = newestStored(adapterId, convId);
      if (!record) return { ok: false, answer: { ok: false, code: 'bad-proposal', why: 'reply-anchor', error: 'this conversation holds no stored message to reply to yet — refresh it, then propose again' } };
    }
    if (!record) return { ok: true, anchor: null, envelope: null };
    const anchor = P.anchorView(record);
    if (!wantsEnvelope) return { ok: true, anchor, envelope: null };
    let env = null;
    try { env = await adapterFor(rec).adapter.replyEnvelope(convId, { anchorId: String(record.vendorId), ...(all === true ? { all: true } : {}) }); }
    catch (err) {
      const why = (err && err.detail && err.detail.why) || (err && err.code) || 'unknown';
      if (why === 'reply-anchor-elsewhere' || why === 'reply-anchor-draft') return { ok: false, answer: { ok: false, code: 'bad-proposal', why: 'reply-anchor', error: why === 'reply-anchor-draft' ? `the message this reply answers is an unsent draft — nothing was created (${(err && err.message) || why})` : `the message this reply answers is not in this conversation on the platform (${(err && err.message) || why})` } };
      return { ok: false, answer: { ok: false, code: 'send-not-available', why: 'reply-envelope', error: `who this reply would go to could not be resolved (${(err && err.message) || why}) — nothing was created; propose it again` } };
    }
    let ev = P.envelopeVerdict(env, String(record.vendorId), { all: all === true });
    // the drafter's added Cc joins the envelope the card shows (and the header bound is judged again over it)
    if (ev.ok && addCc) ev = P.envelopeVerdict(P.withAddedCc(ev.envelope, addCc), String(record.vendorId), { all: all === true });
    if (!ev.ok) return { ok: false, answer: { ok: false, code: 'send-not-available', why: 'reply-envelope', error: `${ev.why} — nothing was created` } };
    return { ok: true, anchor, envelope: ev.envelope };
  }
  /** The approval / send re-judge of a reply's target: null = still what the card showed, else the refusal's why. */
  function replyRecheck(p, rec) {
    if (!p || p.compose || !p.convId) return null;
    const c = rec ? registry.capsOf(rec.kind) : {};
    if (c.replyEnvelope === true && !(p.replyEnvelope && p.replyEnvelope.anchorId && p.replyEnvelope.to)) return 'reply-envelope-missing';
    const anchorId = p.replyTo || (p.replyEnvelope && p.replyEnvelope.anchorId) || null;
    if (!anchorId) return null;
    const record = storedRecord(p.adapterId, p.convId, anchorId);
    return P.replyAnchorVerdict({ replyTo: anchorId, convId: p.convId, record }).ok ? null : 'reply-anchor-gone';
  }
  /** What the adapter is handed about the message a reply answers: the STORED record's facts (its own `raw`). */
  function anchorFactsOf(p) {
    const anchorId = p && (p.replyTo || (p.replyEnvelope && p.replyEnvelope.anchorId));
    if (!anchorId || !p.convId) return null;
    const r = storedRecord(p.adapterId, p.convId, anchorId);
    return r ? { vendorId: String(r.vendorId), convId: String(r.convId || p.convId), raw: r.raw || null } : null;
  }

  async function propose(ctx, adapterId, convId, input, guards = {}) {
    const { en, rec } = convFor(adapterId, convId);
    if (!en || !rec) return ACL.notFound();
    const t = now();
    if (ctx && ctx.kind === 'agent' && !ACL.canSee(reachFor(ctx, rec, en).level)) return ACL.notFound();
    if (rec.enabled === false) return { ok: false, code: 'send-not-available', error: `${rec.label || rec.id} is disabled` };
    let who = sendIdentityFor(rec, en, t);
    // the entry AS THIS PROPOSAL KNOWS IT: with the caps it resolved below
    // (R4 verify — the authority clamp read the snapshot taken BEFORE the
    // refresh, so the first direct send on a never-resolved conversation was
    // downgraded to review with reason `authority`, the second went direct)
    let enNow = en;
    if (!who.as && (who.why === 'unknown' || who.why === 'stale')) {
      // A proposal is a better refresh trigger than a render (§4's second
      // trigger, applied where the answer decides a real message): resolve
      // ONCE, then re-ask. A conversation whose caps were never resolved has none cached.
      let fresh = null;
      try { fresh = await refreshConvCaps(adapterId, convId); } catch (err) { log.warn(`[channels] convCaps refresh at propose failed: ${(err && err.message) || err}`); }
      if (fresh) { enNow = { ...en, convCaps: fresh }; who = sendIdentityFor(rec, enNow, now()); }
    }
    if (!who.as) return { ok: false, code: 'send-not-available', error: `sending is not available on this conversation (${who.why})`, why: who.why };
    const own = !!(input && input.direct === true) && (!ctx || ctx.kind === 'user');
    if (own && who.as !== 'user') return { ok: false, code: 'send-not-available', error: `sending as you is not available on this conversation (${who.userWhy || 'unknown'})`, why: who.userWhy || 'unknown' };
    const v = P.validateProposal(input);
    if (!v.ok) return { ok: false, code: 'bad-proposal', error: v.error, ...(v.why ? { why: v.why } : {}) };
    // r6 verify F1 + F3 (2026-09-28, "what you approve is what runs"): WHAT THIS REPLY ANSWERS and WHO RECEIVES
    // it are decided HERE, from this engine's own store, before anything is created or any wake is granted —
    // stored on the proposal, shown on the card, re-judged at approval and handed to the adapter verbatim
    // verify r1 (B-a085): an agent's ADDED Cc puts people the thread never had on the owner's mail — compose's power,
    // so compose's gates: reach over the WHOLE account (a conversation grant reached anybody: direct, no card), and
    // below, direct only when compose's own verdict (the account's policy + its rows' authority) would be direct too
    const ccByAgent = !!(v.proposal.cc && ctx && ctx.kind === 'agent');
    if (ccByAgent && !ACL.canSee(ACL.effective(ctx, { key: '', adapterId: rec.id }, accountScopeGrants(rec.id)).level)) return { ok: false, code: 'bad-proposal', why: 'cc', error: 'adding people to a mail (--cc) is composing to them — it needs access to the whole account, like compose; yours covers this conversation — nothing was created (reply without --cc, or ask the user)' };
    const ra = await replyTargetFor(rec, adapterId, convId, v.proposal.replyTo, { all: v.proposal.replyAll === true, cc: v.proposal.cc || null });
    if (!ra.ok) return ra.answer;
    // THE PLACEMENT (2026-09-28, the owner: "the boolean is Lark-shaped") — decided HERE, before anything exists:
    // the PURE verdict over the adapter's DECLARED placements (its `threads` cap row) and ONE fact about the message
    // answered — does it sit in a VENDOR thread (the thread index, local, no vendor call) — so `--to` alone follows the
    // vendor's norm (in a thread ⇒ thread; outside one ⇒ the row's `rootReply`) and an undeclared placement is
    // `placement-not-offered`, worded, with nothing created. A reply INTO a thread (`thread` / `thread+chat`) then
    // needs `thread-reply` offered on THIS conversation (spec §5.2): the group refused it (230071 remembered) ⇒
    // `topic-forbidden`. The thread it lands in is recorded; `inThread` rides beside `placement` as the READ ALIAS.
    const c0 = registry.capsOf(rec.kind);
    let parentKey = null, parentFacts = null;
    if (v.proposal.replyTo) {
      try {
        const ix = threadIxOf(adapterId, convId);
        // quote-vs-topic (2026-09-28): "is the parent inside a thread" is THE classifier's answer (a reply chain — a
        // quote — is not a thread) — the window's tag reads the same one, so the card's placement and the list's tag
        // can never disagree; a thread reply to a message outside any topic records no key (the vendor mints it)
        parentKey = Thr.placeKindOf(String(v.proposal.replyTo), ix).topic;
        parentFacts = { inThread: parentKey !== null };
      } catch { parentKey = null; parentFacts = null; }
    }
    const pv = P.placementVerdict({ requested: v.proposal.placement || null, replyTo: v.proposal.replyTo, caps: c0, parent: parentFacts, alias: !!v.proposal.placementAlias });
    if (!pv.ok) return { ok: false, code: pv.code, why: pv.why, error: pv.error, ...(pv.placement !== undefined ? { placement: pv.placement } : {}), ...(pv.offered ? { offered: pv.offered } : {}) };
    const placement = pv.placement;
    const intoThread = P.isThreadPlacement(placement);
    let threadKey = null;
    if (intoThread) {
      const th = caps.offers(c0, effectiveConvCaps(rec, enNow), 'thread-reply', now());
      if (!th.offered) return th.why === 'topic-forbidden' ? { ok: false, code: 'topic-forbidden', why: 'topic-forbidden', error: 'this group does not allow replies in threads' } : { ok: false, code: 'send-not-available', why: th.why, error: `replying in a thread is not available here (${th.why})` };
      threadKey = parentKey;
    }
    // the card's "Reply in thread — under {author}: "{quote}"" / "Quoted reply — to {author}: …" (spec §5.2): the
    // answered message's own text, one line, ≤ 120 (`threadQuote` kept beside it for a thread reply — the alias)
    let replyQuote = null;
    if (placement !== 'chat') { try { const par = store.findRecord(adapterId, convId, String(v.proposal.replyTo)); replyQuote = par ? P.reactionQuote(par) : null; } catch { replyQuote = null; } }
    // The authority the drafter holds HERE: the user's own is `send`; an
    // agent's is its assignment's EFFECTIVE authority (clamped), else draft.
    let authority = 'draft';
    if (!ctx || ctx.kind === 'user') authority = 'send';
    else {
      // R4: the authority of the caller's OWN access rows in effect here (the
      // agent's, or a group of its) — the widest one, clamped by both caps
      const effA = effectiveFor(en);
      const capsA = authorityCapsFor(rec, enNow, t);
      if (effA && effA.access.some((x) => F.rowNames(x.row, ctx) && F.effectiveAuthority(x.row, capsA).authority === 'send')) authority = 'send';
    }
    let decision = own
      ? { mode: 'direct', reasons: [], detail: { ownMessage: true } }
      : P.decideOutbound({ channelPolicy: policyFor(rec, en), guards: guardsFromSettings(), proposal: { ...v.proposal, authority }, now: t });
    if (ccByAgent && decision.mode === 'direct') {
      const effC = effectiveForAccount(rec.id);
      const capsC = { offersSend: true, sendWhy: null, policyRequiresReview: policyRequiresReview(rec, null) };
      const authC = effC && effC.access.some((x) => F.rowNames(x.row, ctx) && F.effectiveAuthority(x.row, capsC).authority === 'send') ? 'send' : 'draft';
      const dC = P.decideOutbound({ channelPolicy: policyFor(rec, null), guards: guardsFromSettings(), proposal: { ...v.proposal, authority: authC }, now: t });
      if (dC.mode !== 'direct') decision = dC;
    }
    // verify r2 (IDENTITY): the convCaps lookup above was an await — an agent whose access was removed meanwhile
    // drafts NOTHING (the uniform not-found, before any wake slot is taken)
    if (!stillSees(ctx, adapterId, convId)) return ACL.notFound();
    // r3: a direct send on a channel whose send starts a turn IS a wake —
    // consented and paced BEFORE anything is written
    const gate = wakeGate(convId, decision.mode === 'direct' && sendStartsTurn(rec) ? 1 : 0, guards || {});
    if (!gate.ok) return gate;
    const drafter = !ctx || ctx.kind === 'user' ? { kind: 'user', id: null, name: null } : { kind: 'agent', id: ctx.id, name: ctx.name || null };
    let created = null;
    // r4: a THROW after the grant (a blocked / full store) gives the slot back
    try {
      await store.outbox.update((ob) => {
        const id = store.outbox.nextId();
        created = ob.proposals[id] = {
          id, adapterId, convId, key: en.key, title: agentTitle(en, convId),   // verify r1 F2: the proposal's title is printed by `vibespace-channels status`
          text: v.proposal.text, originalText: v.proposal.text, replyTo: v.proposal.replyTo, why: v.proposal.why, attachments: v.proposal.attachments,
          replyAnchor: ra.anchor, replyEnvelope: ra.envelope,
          placement, ...(placement !== 'chat' ? { replyQuote } : {}), ...(pv.defaulted && placement !== 'chat' ? { placementDefaulted: pv.rule } : {}),
          ...(intoThread ? { inThread: true, threadKey, threadQuote: replyQuote } : {}),
          draftedBy: drafter, ...drafterGroupsOf(ctx), authority, at: t, updatedAt: t, state: 'proposed',
          policy: { mode: decision.mode, reasons: decision.reasons, detail: decision.detail },
          sendAs: who.as, identity: identityFor(rec, who.as),
          ttlMs: P.PROPOSAL_TTL_MS, awaitingSince: null, edited: false, approvedBy: null, reason: null, result: null, receipt: null, receiptDelivery: null,
          history: [{ state: 'proposed', at: t, by: drafter.kind }],
        };
      });
      auditOutbox(created, 'propose', { mode: decision.mode, reasons: decision.reasons });
      if (decision.mode === 'direct') {
        await transition(created.id, 'sending', 'policy', (p) => { p.approvedBy = 'policy'; });
        await sendNow(created.id);
        wakeRefundIfUnsent(gate, guards, convId, created.id);
      }
    } catch (err) {
      wakeRefundIfUnsent(gate, guards, convId, created && created.id, { threw: true });
      throw err;
    }
    if (decision.mode !== 'direct') {
      await transition(created.id, 'awaiting-approval', 'policy');
      await pointerSync(en.key);
      notifyOutbox([created.id]);
      notify([convId]);
    }
    const fresh = store.outbox.snapshot().proposals[created.id];
    return { ok: true, proposal: agentProposalView(ctx, fresh), decision };
  }

  /**
   * AN AGENT'S REACTION = A PROPOSAL OF KIND `reaction` (lane channel-threads, spec §5.3). Reach first (a hidden
   * conversation is the uniform not-found); the ACCOUNT's reaction row (`off` ⇒ `react-not-available` why
   * `policy-off`, NO proposal row); the control offered here (`react` / `unreact` — the conversation's resolved
   * row, one lookup when unknown); a message the log holds; a key the adapter's set lists (`bad-emoji`); the local
   * fold (an add already there ⇒ `already-reacted`, a removal of a reaction that is not the account's ⇒
   * `reaction-not-mine`); then `decideReaction` — the row over the channel's verdict (review by default; `direct`
   * only where the channel itself would send directly). No text, no edit, no wake: its receipt is one line in the
   * next turn. The same (message, key, op) already awaiting answers that proposal (`already: true`).
   */
  async function proposeReaction(ctx, adapterId, convId, input = {}) {
    const { en, rec } = convFor(adapterId, convId);
    if (!en || !rec) return ACL.notFound();
    const agent = !!(ctx && ctx.kind === 'agent');
    if (agent && !ACL.canSee(reachFor(ctx, rec, en).level)) return ACL.notFound();
    if (rec.enabled === false) return { ok: false, code: 'react-not-available', why: 'disabled', error: `${rec.label || rec.id} is disabled` };
    const row = P.reactionPolicyOf(rec.reactionPolicy);
    if (agent && row === 'off') return { ok: false, code: 'react-not-available', why: 'policy-off', error: 'reactions are not offered here (policy-off): the user turned agent reactions off for this account' };
    const op = input && input.op === 'remove' ? 'remove' : 'add';
    const c = registry.capsOf(rec.kind);
    const rr = reactionsRow(c);
    if (op === 'add' ? !rr.add : rr.remove !== 'own') return { ok: false, code: 'react-not-available', why: (c.sendAs || []).length ? 'react-not-declared' : 'read-only-adapter', error: `reactions are not offered here (${(c.sendAs || []).length ? 'react-not-declared' : 'read-only-adapter'})` };
    const offer = await offerNow(rec, adapterId, convId, op === 'add' ? 'react' : 'unreact');
    if (!offer.offered) return { ok: false, code: 'react-not-available', why: offer.why, error: `reactions are not offered here (${offer.why})` };
    const e = adapterFor(rec);
    let set = vocabularyOf(rec, e);
    if (!set && e.rxSetFlight) { try { await e.rxSetFlight; } catch { } set = e.rxSet && e.rxSet.set; }
    const v = P.validateReaction({ ...input, op }, set || { keys: [] });
    if (!v.ok) return { ok: false, code: v.code, why: v.why, error: v.error };
    const target = store.findRecord(adapterId, convId, v.proposal.msg);
    if (!target) return { ok: false, code: 'not-found', error: 'no such message in this conversation (read it first — the id is the one `read` prints)' };
    const now0 = (reactionsFor(rec, convId, [v.proposal.msg], { e }).get(v.proposal.msg) || []).find((x) => x.key === v.proposal.key);
    if (op === 'add' && now0 && now0.mine) return { ok: false, code: 'already-reacted', error: 'the account owner already reacted with that' };
    if (op === 'remove' && !(now0 && now0.mine)) return { ok: false, code: 'reaction-not-mine', error: 'only a reaction the account owner added can be removed' };
    const pending = proposalsFor(en.key).find((q) => q.kind === 'reaction' && q.reaction && (q.state === 'awaiting-approval' || q.state === 'proposed' || q.state === 'sending') && q.reaction.msg === v.proposal.msg && q.reaction.key === v.proposal.key && q.reaction.op === op && (!agent || (q.draftedBy && q.draftedBy.id === ctx.id)));
    if (pending) return { ok: true, already: true, proposal: agentProposalView(ctx, pending), decision: pending.policy || null };
    const t = now();
    let authority = 'draft';
    if (!agent) authority = 'send';
    else {
      const effA = effectiveFor(en);
      const capsA = authorityCapsFor(rec, en, t);
      if (effA && effA.access.some((x) => F.rowNames(x.row, ctx) && F.effectiveAuthority(x.row, capsA).authority === 'send')) authority = 'send';
    }
    const decision = agent ? P.decideReaction({ reactionPolicy: row, channelPolicy: policyFor(rec, en), authority, now: t }) : { mode: 'direct', reasons: [], detail: { ownMessage: true } };
    if (decision.refused) return { ok: false, code: decision.code, why: decision.why, error: `reactions are not offered here (${decision.why})` };
    const drafter = agent ? { kind: 'agent', id: ctx.id, name: ctx.name || null } : { kind: 'user', id: null, name: null };
    // verify r2 (IDENTITY): offerNow / the vocabulary were awaits — a revoke that landed meanwhile creates NOTHING
    if (!stillSees(ctx, adapterId, convId)) return ACL.notFound();
    let created = null;
    await store.outbox.update((ob) => {
      const id = store.outbox.nextId();
      created = ob.proposals[id] = {
        id, kind: 'reaction', adapterId, convId, key: en.key, title: agentTitle(en, convId),   // verify r1 F2: the same for a reaction proposal
        reaction: { msg: v.proposal.msg, key: v.proposal.key, op, glyph: v.proposal.glyph, label: v.proposal.label, quote: P.reactionQuote(target) },
        text: '', originalText: '', replyTo: v.proposal.msg, why: v.proposal.why, attachments: [],
        draftedBy: drafter, ...drafterGroupsOf(ctx), authority, at: t, updatedAt: t, state: 'proposed',
        policy: { mode: decision.mode, reasons: decision.reasons, detail: decision.detail },
        sendAs: 'user', identity: identityFor(rec, 'user'),
        ttlMs: P.PROPOSAL_TTL_MS, awaitingSince: null, edited: false, approvedBy: null, reason: null, result: null, receipt: null, receiptDelivery: null,
        history: [{ state: 'proposed', at: t, by: drafter.kind }],
      };
    });
    auditOutbox(created, 'propose', { mode: decision.mode, reasons: decision.reasons, reaction: { op, key: v.proposal.key, msg: v.proposal.msg } });
    if (decision.mode === 'direct') {
      await transition(created.id, 'sending', 'policy', (q) => { q.approvedBy = 'policy'; });
      await sendNow(created.id);
    } else {
      await transition(created.id, 'awaiting-approval', 'policy');
      await pointerSync(en.key);
      notifyOutbox([created.id]);
      notify([convId]);
    }
    const fresh = store.outbox.snapshot().proposals[created.id];
    return { ok: true, proposal: agentProposalView(ctx, fresh), decision };
  }

  /** The ACCOUNT grain alone, as `effectiveGrants` answers it (a NEW
   *  conversation has no facts for a rule to match, so only the account's
   *  own rows apply to a composed message). */
  function effectiveForAccount(adapterId) { return F.effectiveGrants({ account: accountGrainOf(adapterId) }, {}, { accountKeys: accountGrantKeys(adapterId) }); }
  /** The account-scope grants (reach to the WHOLE account). */
  function accountScopeGrants(adapterId) { return (store.index.table('accountGrants') || []).filter((g) => g && g.scope && g.scope.kind === 'adapter' && g.scope.id === adapterId); }
  const COMPOSE_NOT_FOUND = 'no such account (not found, or you have no access to the whole account) — `vibespace-channels status` shows your access';
  /**
   * COMPOSE A NEW MESSAGE (B-6acc, the owner 2026-09-26: "给我一个agent使用
   * 我的 gmail 的能力，让它能读取和发送邮件"). A NEW conversation, where
   * `reply` only answers inside one. Everything a reply rides applies:
   * REACH FIRST — an agent needs access to the WHOLE account (an account
   * access row, or a hand-written account-scope grant), else the uniform
   * not-found; the adapter must DECLARE `caps.compose` (Lark does not —
   * `compose-not-available`, by name); the account's send identity is asked
   * NOW (`composeCaps` — Gmail without a sending scope answers
   * `send-scope-not-granted` and NOTHING is created); the SAME outbox policy
   * (the account's, else the adapter's default — review; direct only when it
   * says so AND the caller's account access holds `send` AND no guard fires:
   * links, attachments, off-hours), the same honesty line, the same audit,
   * the same receipt. The proposal is keyed `<account>/~compose/<id>` until
   * the vendor answers with the new thread's id.
   */
  async function compose(ctx, adapterId, input, guards = {}) {
    const rec = adapterRecords().adapters.find((r) => r.id === adapterId) || null;
    const agent = !!(ctx && ctx.kind === 'agent');
    if (!rec) return agent ? { ok: false, code: 'not-found', error: COMPOSE_NOT_FOUND } : { ok: false, code: 'not-found', error: `no such account '${adapterId}'` };
    if (agent && !ACL.canSee(ACL.effective(ctx, { key: '', adapterId: rec.id }, accountScopeGrants(rec.id)).level)) return { ok: false, code: 'not-found', error: COMPOSE_NOT_FOUND };
    if (rec.enabled === false) return { ok: false, code: 'send-not-available', error: `${rec.label || rec.id} is disabled`, why: 'disabled' };
    const c = registry.capsOf(rec.kind);
    if (!(c.compose === true && (c.sendAs || []).length)) return { ok: false, code: 'compose-not-available', error: `${rec.label || rec.id} cannot start a new conversation from here — its adapter declares no compose; reply inside an existing conversation instead` };
    const v = P.validateCompose(input);
    if (!v.ok) return { ok: false, code: 'bad-proposal', error: v.error, ...(v.why ? { why: v.why } : {}) };
    let who = null;
    try {
      const cc = await adapterFor(rec).adapter.composeCaps();
      const as = Array.isArray(cc.sendAs) ? cc.sendAs : [];
      who = as.includes('user') ? { as: 'user', why: null } : as.includes('bot') ? { as: 'bot', why: null } : { as: null, why: cc.why || 'unknown' };
    } catch (err) { who = { as: null, why: (err && err.detail && err.detail.why) || (err && err.code) || 'unknown' }; }
    if (!who.as) return { ok: false, code: 'send-not-available', error: `sending is not available on this account (${who.why})`, why: who.why };
    const t = now();
    // the authority the drafter holds ON THE ACCOUNT: the user's own is
    // `send`; an agent's is its account access rows' (itself or a group of
    // its), clamped by the account's two caps — else draft
    let authority = 'draft';
    if (!agent) authority = 'send';
    else {
      const effA = effectiveForAccount(rec.id);
      const capsA = { offersSend: true, sendWhy: null, policyRequiresReview: policyRequiresReview(rec, null) };
      if (effA && effA.access.some((x) => F.rowNames(x.row, ctx) && F.effectiveAuthority(x.row, capsA).authority === 'send')) authority = 'send';
    }
    const decision = P.decideOutbound({ channelPolicy: policyFor(rec, null), guards: guardsFromSettings(), proposal: { ...v.proposal, authority }, now: t });
    const drafter = agent ? { kind: 'agent', id: ctx.id, name: ctx.name || null } : { kind: 'user', id: null, name: null };
    // verify r2 (IDENTITY): composeCaps above was an await — access to the account removed meanwhile ⇒ nothing drafted
    if (agent && !stillSees(ctx, adapterId, null)) return { ok: false, code: 'not-found', error: COMPOSE_NOT_FOUND };
    let created = null;
    await store.outbox.update((ob) => {
      const id = store.outbox.nextId();
      const cp = v.proposal.compose;
      created = ob.proposals[id] = {
        id, adapterId, convId: null, key: `${adapterId}/~compose/${id}`, title: cp.subject,
        compose: { to: cp.to.slice(), cc: cp.cc.slice(), subject: cp.subject },
        text: v.proposal.text, originalText: v.proposal.text, replyTo: null, why: v.proposal.why, attachments: v.proposal.attachments,
        draftedBy: drafter, ...drafterGroupsOf(ctx), authority, at: t, updatedAt: t, state: 'proposed',
        policy: { mode: decision.mode, reasons: decision.reasons, detail: decision.detail },
        sendAs: who.as, identity: identityFor(rec, who.as),
        ttlMs: P.PROPOSAL_TTL_MS, awaitingSince: null, edited: false, approvedBy: null, reason: null, result: null, receipt: null, receiptDelivery: null,
        history: [{ state: 'proposed', at: t, by: drafter.kind }],
      };
    });
    auditOutbox(created, 'propose', { mode: decision.mode, reasons: decision.reasons, compose: true });
    if (decision.mode === 'direct') {
      await transition(created.id, 'sending', 'policy', (p) => { p.approvedBy = 'policy'; });
      await sendNow(created.id);
    } else {
      await transition(created.id, 'awaiting-approval', 'policy');
      await composePointerSync(adapterId);
      notifyOutbox([created.id]);
    }
    const fresh = store.outbox.snapshot().proposals[created.id];
    return { ok: true, proposal: agentProposalView(ctx, fresh), decision };
  }
  /** The For-you pointer for COMPOSED messages awaiting approval — one per
   *  account (a composed message has no conversation to hang one on), its
   *  id on the account record, retracted by this producer when the last one
   *  leaves `awaiting-approval`. */
  async function composePointerSync(adapterId) {
    const rec = adapterRecords().adapters.find((r) => r.id === adapterId);
    if (!rec) return;
    const awaiting = proposalsFor().filter((p) => p.adapterId === adapterId && p.compose && p.state === 'awaiting-approval');
    const label = rec.label || rec.id;
    if (awaiting.length) {
      if (rec.composeTodoId || !userTodos || typeof userTodos.add !== 'function') return;
      const latest = awaiting[0];
      const who = latest.draftedBy && latest.draftedBy.kind === 'agent' ? (latest.draftedBy.name || latest.draftedBy.id) : null;
      const subject = String((latest.compose && latest.compose.subject) || '').slice(0, 160);
      const to = ((latest.compose && latest.compose.to) || []).join(', ').slice(0, 200);
      try {
        const item = userTodos.add(INBOX_KEY, {
          origin: 'channels', urgency: 'normal', by: 'agent', sessionName: 'Channels',
          text: `New messages awaiting approval on ${label}`,
          detail: `${awaiting.length} new message(s) awaiting your approval on ${label}.\nLatest${who ? ` (${who})` : ''}: to ${to} — "${subject}"\n\nOpen the Outbox (rail → Channels → Outbox) to approve, edit or reject.`,
          i18n: {
            text: { key: i18nKey('New messages awaiting approval on {account}'), params: { account: label } },
            detail: [
              { key: i18nKey('{n} new message(s) awaiting your approval on {account}.'), params: { n: awaiting.length, account: label } },
              { key: i18nKey('Latest: to {to} — "{subject}"'), params: { to, subject } },
              { key: i18nKey('Open the Outbox (rail → Channels → Outbox) to approve, edit or reject.') },
            ],
            source: INBOX_SOURCE,
          },
        });
        if (item && item.id) await store.adapters.update(() => { rec.composeTodoId = item.id; });
      } catch (e) { log.warn(`[channels] ${adapterId}: could not file the compose approval pointer (${(e && e.message) || e}) — the Outbox badge still shows it`); }
      return;
    }
    if (!rec.composeTodoId) return;
    const id = rec.composeTodoId;
    await store.adapters.update(() => { rec.composeTodoId = null; });
    if (!userTodos || typeof userTodos.get !== 'function') return;
    try { const it = userTodos.get(id); if (it && it.status === 'open' && it.sessionKey === INBOX_KEY) userTodos.setStatus(id, 'done', RESOLVED_BY); } catch {}
  }
  /**
   * THE AGENT'S SEARCH (R4): the owner's search (`search`, off the event
   * loop, byte-capped) over every account the caller can see anything of —
   * each result filtered by REACH, so a hit in a conversation the agent
   * cannot see is simply absent (no oracle). Never a vendor call.
   */
  async function searchFor(ctx, q, { adapterId = null, limit = 50 } = {}) {
    const query = String(q || '').trim();
    if (query.length < 2) return { ok: false, code: 'bad-request', error: 'a search needs at least 2 characters' };
    const n = Math.min(200, Math.max(1, Number(limit) || 50));
    const results = [];
    let truncated = false;
    for (const rec of adapterRecords().adapters) {
      if (rec.enabled === false || (adapterId && rec.id !== adapterId)) continue;
      const visible = new Map();
      for (const en of Object.values(store.index.live())) if (en && en.adapterId === rec.id && ACL.canSee(reachFor(ctx, rec, en).level)) visible.set(en.id, agentTitle(en, en.id));   // verify r1 F2: the title through the belt
      if (!visible.size) continue;
      // only the VISIBLE conversations' logs are read at all
      const r = await store.search(rec.id, query, { limit: 200, convIds: [...visible.keys()] });
      truncated = truncated || !!r.truncated;
      // verify r2 (IDENTITY): the search was an await — a conversation whose reach was removed meanwhile gives nothing
      for (const cid of [...visible.keys()]) if (!stillSees(ctx, rec.id, cid)) visible.delete(cid);
      for (const x0 of r.results) {
        if (!visible.has(x0.convId)) continue;
        const x = viewOf(rec, x0);   // lane channel-rich: the same read-time view (a bot's name, markup read)
        const ax = agentCopy(x);   // verify r3: judged on the way out; the 400-character cut leaves no dangling opener
        results.push({ key: agentId(`${rec.id}/${x.convId}`), adapterId: rec.id, adapter: rec.label || rec.id, convId: agentId(x.convId), title: visible.get(x.convId), at: x.at || null, author: ax.author || null, text: agentText(ax.text, { kind: 'block', max: 400 }), vendorId: agentId(x.vendorId || null) });   // verify r3 F6: the key, the conversation id and the message id as line pieces
        if (results.length >= n) break;
      }
      if (results.length >= n) { truncated = true; break; }
    }
    results.sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0));
    return { ok: true, results, truncated };
  }

  /**
   * APPROVE (maybe edited). THE UNCONDITIONAL RE-RESOLUTION (§9.2 r4): a
   * proposal may have waited 24 h; the conversation may have kicked the user
   * out, turned read-only or been dissolved. `convCaps` is refreshed here,
   * before the send, every time — and a "cannot send" answer stops with the
   * typed `send-not-available` plus the adapter's own reason, the proposal
   * lands in `failed`, and the receipt carries that reason verbatim.
   */
  async function approve(id, { text = null, by = 'user', consent = null, mayWake = null, deliver = null, shown = null } = {}) {
    const p0 = store.outbox.snapshot().proposals[id];
    if (!p0) return { ok: false, code: 'not-found', error: 'no such proposal' };
    if (p0.state !== 'awaiting-approval') return { ok: false, code: 'bad-state', error: `proposal is ${p0.state}, not awaiting approval`, state: p0.state };
    // r6 verify F6: the approval names WHAT THE CARD SHOWED (`shown` = the PURE digest of the record it was drawn
    // from); a proposal that no longer is that record — the text, the conversation, the answered message, the
    // recipients, the identity, the sender line — is refused by name, nothing moves and nothing is sent
    if (shown !== null && shown !== undefined) {
      const now0 = P.shownDigest(proposalView(p0));
      if (String(shown) !== now0) return { ok: false, code: 'changed-since-shown', error: 'this proposal is not what the card you approved showed — nothing was sent; read the card again, then decide', proposal: proposalView(p0) };
    }
    // r3: approving a send that starts a turn is a wake — the echo first
    // (nothing moves on a refusal: the proposal still awaits). 2026-09-27: a
    // receipt the decider chose to deliver NOW is a wake too — in the same echo
    const reactionKind = p0.kind === 'reaction';
    // lane channel-threads: a reaction has no text to edit and never starts a turn (spec §5.3)
    if (reactionKind && typeof text === 'string' && text.trim()) return { ok: false, code: 'bad-proposal', error: 'a reaction has no text to edit — approve or reject it', why: 'reaction' };
    const wakeN = !reactionKind && sendStartsTurn(adapterRecords().adapters.find((r) => r.id === p0.adapterId) || null) ? 1 : 0;
    const rch = receiptChoiceFor(p0, deliver);
    const echo = wakeGate(p0.convId, wakeN + rch.n, { consent });
    if (!echo.ok) return { ...echo, proposal: proposalView(p0) };
    const receiptChoice = receiptPaceFor(p0, rch, mayWake);
    const edited = !reactionKind && typeof text === 'string' && text.trim() && text !== p0.text;
    if (edited) {
      const v = P.validateProposal({ ...p0, text });
      if (!v.ok) return { ok: false, code: 'bad-proposal', error: v.error };
    }
    const composing = !!p0.compose && !p0.result;
    const cf0 = composing ? { en: null, rec: adapterRecords().adapters.find((r) => r.id === p0.adapterId) || null } : convFor(p0.adapterId, p0.convId);
    const { en, rec } = cf0;
    const t = now();
    let cc = null, ccErr = null;
    // a COMPOSED message re-asks the ACCOUNT (`composeCaps`), a reply its conversation
    if (rec) { try { cc = composing ? await adapterFor(rec).adapter.composeCaps() : await refreshConvCaps(p0.adapterId, p0.convId, { join: false }); } catch (err) { ccErr = (err && err.message) || String(err); } }
    const c = rec ? registry.capsOf(rec.kind) : null;
    const stillOffered = composing
      ? !!(rec && cc && Array.isArray(cc.sendAs) && cc.sendAs.includes(p0.sendAs))
      : reactionKind
        ? !!(rec && en && cc && c && caps.offers(c, cc, p0.reaction && p0.reaction.op === 'remove' ? 'unreact' : 'react', t).offered)
        : !!(rec && en && cc && c && caps.offers(c, cc, p0.sendAs === 'bot' ? 'send-as-bot' : 'send-as-user', t).offered);
    // r6 verify F1 / F3: the reply's target re-judged — the answered message must still be a STORED message of this
    // conversation, and an envelope adapter's recipients must be the ones resolved (and shown) at propose
    const targetWhy = stillOffered && !composing ? replyRecheck(p0, rec) : null;
    if (!stillOffered || targetWhy) {
      const why = targetWhy || (!rec ? 'adapter no longer exists' : ccErr ? `convCaps could not be resolved (${ccErr})` : (cc && cc.why) || 'not-offered');
      await transition(id, 'failed', 'recheck', (p) => {
        p.approvedBy = by; if (edited) { p.text = text; p.edited = true; }
        stampReceiptChoice(p, receiptChoice);
        p.reason = `send-not-available: ${why}`; p.failure = { code: 'send-not-available', why, at: now() };
      });
      const p1 = store.outbox.snapshot().proposals[id];
      auditOutbox(p1, 'refused-at-approval', { code: 'send-not-available', why });
      await receipt(id);
      await pointerSync(p1.key);
      notifyOutbox([id]); notify(p1.convId ? [p1.convId] : []);
      log.log(`[channels] outbox ${id}: approval refused — ${why}`);
      return { ok: false, code: 'send-not-available', why, error: `cannot send now: ${why}`, proposal: proposalView(store.outbox.snapshot().proposals[id]) };
    }
    // …then the pace, only once the send is still offered (a refusal above
    // spends no slot); a floored approve leaves the proposal AWAITING
    const gate = wakeGate(p0.convId, wakeN, { mayWake });
    if (!gate.ok) return { ...gate, proposal: proposalView(store.outbox.snapshot().proposals[id]) };
    // r4: a THROW after the grant (the transition's or the send's store
    // write refused) gives the slot back unless the request may have left
    try {
      const tr = await transition(id, 'sending', by, (p) => { p.approvedBy = by; if (edited) { p.text = text; p.edited = true; } stampReceiptChoice(p, receiptChoice); });
      if (!tr.ok) { wakeRefundIfUnsent(gate, { mayWake }, p0.convId, id); return { ok: false, code: 'bad-state', error: tr.why }; }
      auditOutbox(store.outbox.snapshot().proposals[id], 'approve');
      await sendNow(id);
    } catch (err) {
      wakeRefundIfUnsent(gate, { mayWake }, p0.convId, id, { threw: true });
      throw err;
    }
    wakeRefundIfUnsent(gate, { mayWake }, p0.convId, id);
    const fresh = store.outbox.snapshot().proposals[id];
    return { ok: fresh.state === 'sent', code: fresh.state === 'sent' ? null : fresh.state, error: fresh.state === 'sent' ? null : (fresh.reason || fresh.state), proposal: proposalView(fresh) };
  }

  // ── HOW THE DRAFTER HEARS OF A DECISION IS CHOSEN AT THE DECISION (2026-09-27, owner ruling) ──
  /** The decider's delivery choice, normalized (`next-turn` unless `wake-now`
   *  was asked), and how many wakes it would cause (0 | 1 — only an agent's
   *  draft has somebody to wake). */
  function receiptChoiceFor(p0, deliver) {
    // a reaction never earns a billed turn (spec §5.3): its receipt rides the next one, whatever was asked
    if (p0 && p0.kind === 'reaction') return { choice: 'next-turn', n: 0 };
    const choice = deliver === 'wake-now' ? 'wake-now' : 'next-turn';
    return { choice, n: choice === 'wake-now' && p0 && p0.draftedBy && p0.draftedBy.kind === 'agent' && p0.draftedBy.id ? 1 : 0 };
  }
  /** With sign-in OFF the owner's routes are paced like an agent (`mayWake`,
   *  the groups engine's persisted ledger, keyed by the drafter): a floored
   *  wake-now is DOWNGRADED to the next message and says so — the decision
   *  itself is never refused for it. `{choice, paced}`. */
  function receiptPaceFor(p0, rch, mayWake) {
    if (!rch.n || typeof mayWake !== 'function') return { choice: rch.choice, paced: null };
    let pace = null;
    try { pace = mayWake(p0.draftedBy.id); } catch (err) { pace = { reason: `the wake pace failed (${(err && err.message) || err})` }; }
    if (pace === true) return { choice: rch.choice, paced: null };
    return { choice: 'next-turn', paced: String((pace && pace.reason) || 'rate floor').slice(0, 200) };
  }
  function stampReceiptChoice(p, rc) {
    p.receiptChoice = rc.choice;
    if (rc.paced) p.receiptChoicePaced = rc.paced;
  }

  async function reject(id, { reason = null, by = 'user', deliver = null, consent = null, mayWake = null } = {}) {
    const p00 = store.outbox.snapshot().proposals[id];
    const rch = receiptChoiceFor(p00, deliver);
    // a rejection the decider wants the agent to hear NOW is a wake — its echo first (nothing moves on a refusal)
    if (p00 && p00.state === 'awaiting-approval') {
      const echo = wakeGate(p00.convId, rch.n, { consent });
      if (!echo.ok) return { ...echo, proposal: proposalView(p00) };
    }
    const receiptChoice = p00 && p00.state === 'awaiting-approval' ? receiptPaceFor(p00, rch, mayWake) : { choice: rch.choice, paced: null };
    const tr = await transition(id, 'rejected', by, (p) => { p.reason = reason ? String(reason).slice(0, 500) : P.REJECTED_DEFAULT_REASON; p.approvedBy = null; stampReceiptChoice(p, receiptChoice); });
    if (!tr.ok) return { ok: false, code: 'bad-state', error: tr.why, state: (store.outbox.snapshot().proposals[id] || {}).state || null };
    const p = store.outbox.snapshot().proposals[id];
    auditOutbox(p, 'reject', { reason: p.reason });
    await receipt(id);
    await pointerSync(p.key);
    notifyOutbox([id]); notify(p.convId ? [p.convId] : []);
    return { ok: true, proposal: proposalView(store.outbox.snapshot().proposals[id]) };
  }

  // ── THE AGENT TAKES ITS OWN PROPOSAL BACK (2026-09-27, the owner: "agent
  // 似乎没有撤回之前制作的 draft 的能力，必须要我手动 reject 是吗？") ──────────
  // `withdrawn` is a terminal state the PURE table lets ONLY `agent` enter,
  // ONLY from `proposed` / `awaiting-approval` (never from `sending`, never
  // from a lost outcome). The drafter is the proposal's own conversation id —
  // a Task-Group sibling is `not-yours`, never a silent no-op. Withdrawing
  // retracts the conversation's For-you pointer through the SAME producer
  // (`pointerSync`) the moment no proposal awaits there, audits one line and
  // broadcasts ONCE. The receipt is recorded (`status` shows it) and never
  // handed back to the agent that did it.
  //
  // REPLACE = withdraw + a new proposal, ATOMIC: the old one is checked
  // (yours, still withdrawable) BEFORE anything is created; the new one is
  // proposed; the old one is withdrawn ONLY if the policy accepted the new one
  // (created — awaiting approval or sent). A refusal of the new one leaves the
  // old one standing. While a replace runs, the old id is HELD: an approve /
  // reject of it waits for the replace to settle (and then finds it withdrawn),
  // the TTL sweep skips it — no decision can land between the check and the
  // withdrawal.
  const proposalHolds = new Map();   // proposal id → the tail of the work queued on it
  function onProposal(id, fn) {
    const prev = proposalHolds.get(id) || Promise.resolve();
    const run = prev.then(() => fn(), () => fn());
    const tail = run.then(() => {}, () => {}).then(() => { if (proposalHolds.get(id) === tail) proposalHolds.delete(id); });
    proposalHolds.set(id, tail);
    return run;
  }
  /** Who is asking, and may they see this proposal at all? A caller that
   *  cannot see its conversation (or its account, for a composed one) and
   *  shares no Task Group with its drafter gets the uniform not-found (no
   *  existence oracle); one that can is told `not-yours`. */
  function withdrawRefusal(p, by, verdict) {
    if (verdict.code !== 'not-yours') return { ok: false, code: verdict.code, error: verdict.why, state: p.state };
    const ctx = by || {};
    const d = p.draftedBy || {};
    let visible = false;
    try {
      if (p.convId) { const { en, rec } = convFor(p.adapterId, p.convId); visible = !!(en && rec && ACL.canSee(reachFor(ctx, rec, en).level)); }
      else visible = ACL.canSee(ACL.effective(ctx, { key: '', adapterId: p.adapterId }, accountScopeGrants(p.adapterId)).level);
    } catch { visible = false; }
    const mine = Array.isArray(ctx.groups) ? ctx.groups : [];
    const sibling = d.kind === 'agent' && d.id ? groupsOfSession(d.id).some((g) => mine.includes(g)) : false;
    if (!visible && !sibling) return { ok: false, code: 'not-found', error: 'no such proposal (not found, or not yours)' };
    return { ok: false, code: 'not-yours', error: verdict.why, state: p.state };
  }
  async function withdrawNow(id, by, why, { replacedBy = null, notifyNow = true } = {}) {
    const p0 = store.outbox.snapshot().proposals[id];
    if (!p0) return { ok: false, code: 'not-found', error: 'no such proposal (not found, or not yours)' };
    const v = P.withdrawVerdict(p0, by);
    if (!v.ok) return withdrawRefusal(p0, by, v);
    const w = P.withdrawWhy(why);
    const tr = await transition(id, 'withdrawn', 'agent', (p, t) => {
      p.reason = P.withdrawReason(w);
      p.withdrawal = { by: { kind: 'agent', id: by.id, name: by.name || (p.draftedBy && p.draftedBy.name) || null }, why: w, at: t };
      if (replacedBy) p.replacedBy = replacedBy;
      p.approvedBy = null;
    });
    if (!tr.ok) {
      // the table refused between the read and the write (a decision landed first)
      const p1 = store.outbox.snapshot().proposals[id] || p0;
      return { ok: false, code: 'not-withdrawable', error: `proposal ${id} cannot be withdrawn: ${tr.why}`, state: p1.state };
    }
    const p = store.outbox.snapshot().proposals[id];
    auditOutbox(p, 'withdraw', { why: w, by: by.id, ...(replacedBy ? { replacedBy } : {}) });
    // the receipt is RECORDED (`status` shows it) — never handed back to the agent that did it
    const rc = P.receiptFor(p);
    if (rc) await store.outbox.update((ob) => { if (ob.proposals[id]) ob.proposals[id].receipt = rc; });
    await pointerSync(p.key);
    if (notifyNow) { notifyOutbox([id]); notify(p.convId ? [p.convId] : []); }
    log.log(`[channels] outbox ${id}: withdrawn by its drafter ${by.id}${replacedBy ? ` (replaced by ${replacedBy})` : ''}`);
    return { ok: true, proposal: agentProposalView(by, store.outbox.snapshot().proposals[id]) };
  }
  /** WITHDRAW (the agent's own verb). `by` = the caller's principal as the
   *  route resolved it (`{kind:'agent', id, name, groups}`). */
  function withdrawProposal({ proposalId, why = null, by = null } = {}) {
    const id = String(proposalId || '');
    if (!id) return Promise.resolve({ ok: false, code: 'bad-request', error: 'a proposal id is required' });
    if (!by || by.kind !== 'agent' || !by.id) return Promise.resolve({ ok: false, code: 'not-yours', error: 'only the agent that proposed it can withdraw a proposal (the user rejects it)' });
    return onProposal(id, () => withdrawNow(id, by, why));
  }
  /**
   * REPLACE: `make()` proposes the new one (the route's own `propose` /
   * `compose` call, with its guards); the old one is withdrawn only if that
   * was accepted. `{ok, proposal, decision, replaced}` — the NEW proposal's
   * answer, plus the old one's withdrawn view; a refusal of either names it
   * and leaves the old one as it was.
   */
  function replaceProposal({ replaces, why = null, by = null, make } = {}) {
    const oldId = String(replaces || '');
    if (!oldId) return Promise.resolve({ ok: false, code: 'bad-request', error: 'replaces needs a proposal id' });
    if (typeof make !== 'function') return Promise.resolve({ ok: false, code: 'bad-request', error: 'nothing to replace it with' });
    if (!by || by.kind !== 'agent' || !by.id) return Promise.resolve({ ok: false, code: 'not-yours', error: 'only the agent that proposed it can replace a proposal' });
    return onProposal(oldId, async () => {
      const p0 = store.outbox.snapshot().proposals[oldId];
      // verify r3: the SAME sentence `withdrawRefusal` gives a stranger for an existing draft — a different one told an outsider whether the id exists
      if (!p0) return { ok: false, code: 'not-found', error: 'no such proposal (not found, or not yours)', replaces: oldId };
      const v = P.withdrawVerdict(p0, by);
      if (!v.ok) return { ...withdrawRefusal(p0, by, v), replaces: oldId };
      const r = await make();
      if (!r || !r.ok || !r.proposal) return { ...(r || { ok: false, code: 'error', error: 'the new proposal was not created' }), replaces: oldId, replaced: null, note: `proposal ${oldId} was left as it was` };
      const newId = r.proposal.id;
      await store.outbox.update((ob) => { if (ob.proposals[newId]) ob.proposals[newId].replaces = oldId; });
      const w = await withdrawNow(oldId, by, why || `replaced by ${newId}`, { replacedBy: newId, notifyNow: false });
      notifyOutbox([newId, oldId]);
      notify([...new Set([p0.convId, r.proposal.convId].filter(Boolean))]);
      const fresh = store.outbox.snapshot().proposals[newId];
      return { ...r, proposal: agentProposalView(by, fresh), replaces: oldId, replaced: w.ok ? w.proposal : null, ...(w.ok ? {} : { replaceError: w.error, replaceCode: w.code }) };
    });
  }

  // THE RECEIPT'S FATE (2026-09-27, the owner: "我在界面里完全看不到有消息在
  // queue"): a receipt the ladder STASHED rides the drafting agent's next
  // message; the ladder tells us when that stash drains (or hands an entry
  // back), and the card says "Handed to <agent> at …" instead of "Waiting".
  // Verify r2 (2026-09-27): THREE events, the latest wins — `drained` (read
  // with the next message: `receiptDrainedAt`, `receiptDrainedHow:'drained'` —
  // a real drain after a boot reconcile's guess records its time), `stashed`
  // (held again: both cleared), `evicted` (the cap dropped it UNREAD:
  // `receiptEvictedAt` + `receiptEvictedHeld`; the card says "not delivered —
  // the queue was full", never "waiting", never "handed").
  async function noteReceiptStash(ev, cid, entries, extra = {}) {
    const ids = (entries || []).filter((e) => e && e.source === 'channel-receipt' && e.ref).map((e) => String(e.ref));
    if (!ids.length || stopped) return;
    const t = now();
    const changed = [];
    await store.outbox.update((ob) => {
      for (const id of ids) {
        const q = ob.proposals[id];
        if (!q || !q.draftedBy || String(q.draftedBy.id) !== String(cid)) continue;
        if (ev === 'drained') { q.receiptDrainedAt = t; q.receiptDrainedHow = 'drained'; q.receiptEvictedAt = null; q.receiptEvictedHeld = null; changed.push(id); }
        else if (ev === 'stashed' && (q.receiptDrainedAt || q.receiptEvictedAt)) { q.receiptDrainedAt = null; q.receiptDrainedHow = null; q.receiptEvictedAt = null; q.receiptEvictedHeld = null; changed.push(id); }
        else if (ev === 'evicted') { q.receiptEvictedAt = t; q.receiptEvictedHeld = Number(extra && extra.held) || null; q.receiptDrainedAt = null; q.receiptDrainedHow = null; changed.push(id); }
      }
    });
    if (changed.length) notifyOutbox(changed);
    if (ev === 'evicted' && changed.length) log.warn(`[channels] receipt(s) for ${changed.join(', ').slice(0, 300)} fell off ${cid}'s stash cap UNREAD (${Number(extra && extra.held) || '?'} held) — the card says so; the receipt stays on the proposal`);
  }
  /**
   * A STASHED RECEIPT WHOSE ENTRY IS GONE WAS HANDED (2026-09-27 verify, the
   * owner's three receipts of that day): a receipt stashed BEFORE the stash
   * carried a `ref` (or drained while nobody listened) has no `drained`
   * event to flip its fate — its card said "Waiting for <agent>'s next
   * message" for good, though the agent read it with its next prompt. At
   * boot, every stashed-and-not-drained receipt is looked for in its
   * drafter's stash (by `ref`, or — a legacy entry — by the proposal id its
   * text names); one that is no longer there was drained by an earlier
   * message, at a time nobody recorded (`receiptDrainedHow: 'reconciled'`,
   * the card says "with an earlier message"). Read-only on the stash; the
   * ladder's `stashPeek` is optional (a ladder without it: nothing changes).
   */
  async function reconcileReceiptFates() {
    if (!deliver || typeof deliver.stashPeek !== 'function' || stopped) return [];
    const ob = store.outbox.snapshot();
    const gone = [];
    for (const q of Object.values(ob.proposals || {})) {
      const d = q.receiptDelivery;
      if (!d || !d.stashed || q.receiptDrainedAt || q.receiptEvictedAt || !q.draftedBy || q.draftedBy.kind !== 'agent' || !q.draftedBy.id) continue;   // an eviction was recorded when it happened: never "handed"
      let held = null;
      try { held = deliver.stashPeek(q.draftedBy.id) || []; } catch { continue; }   // an unreadable stash decides nothing
      const still = held.some((e) => e && (String(e.ref || '') === String(q.id) || (!e.ref && e.source === 'channel-receipt' && String(e.text || '').includes(`proposal ${q.id}:`))));
      if (!still) gone.push(q.id);
    }
    if (!gone.length) return [];
    const t = now();
    await store.outbox.update((ob2) => { for (const id of gone) { const q = ob2.proposals[id]; if (q && !q.receiptDrainedAt) { q.receiptDrainedAt = t; q.receiptDrainedHow = 'reconciled'; } } });
    notifyOutbox(gone);
    log.log(`[channels] ${gone.length} stashed receipt(s) no longer in their drafter's stash — read as handed with an earlier message: ${gone.join(', ').slice(0, 400)}`);
    return gone;
  }
  let offStash = deliver && typeof deliver.onStash === 'function'
    ? deliver.onStash((ev, cid, entries, extra) => { noteReceiptStash(ev, cid, entries, extra).catch((err) => log.warn(`[channels] receipt fate update failed: ${(err && err.message) || err}`)); })
    : null;
  // verify r3 (IDENTITY): the stash gate — what this engine filed for an agent's next turn is re-judged at every read
  let offStashGate = deliver && typeof deliver.registerStashGate === 'function' ? deliver.registerStashGate(stashGate) : null;

  /**
   * THE SEND (§9.4). An attempt line goes to the audit log BEFORE the request,
   * an outcome line after — a crash between the two leaves exactly the record
   * `reconcile()` exists for, and the one that must never be read as "not
   * sent". A typed refusal is `failed`; a LOST result (the adapter threw
   * mid-flight — the registry marks it `detail.threw`) is `unknown`, which
   * this engine NEVER retries by itself.
   */
  async function sendNow(id) {
    const p = store.outbox.snapshot().proposals[id];
    if (!p || p.state !== 'sending') return { ok: false, why: p ? `state ${p.state}` : 'no such proposal' };
    if (p.kind === 'reaction') return sendReactionNow(id, p);
    const rec = adapterRecords().adapters.find((r) => r.id === p.adapterId) || null;
    // THE WIRE TEXT (§9.5): the approved text — plus the sender honesty line
    // ONLY when the channel's switch is on AND the drafter is an agent. The
    // proposal's own `text` stays what the user approved; the wire form and
    // the attempt instant are stamped BEFORE the request so a lost outcome
    // can be reconciled against exactly what went out (§9.4).
    const line = P.honestyLine({ draftedBy: p.draftedBy, enabled: honestyLineFor(rec) });
    const wire = P.withHonestyLine(p.text, line);
    const t0 = now();
    await store.outbox.update((ob) => { const q = ob.proposals[id]; if (q) { q.attemptAt = t0; q.wire = { text: wire, honestyLine: !!line, at: t0 }; } });
    auditOutbox(store.outbox.snapshot().proposals[id], 'attempt', { idemKey: p.id, honestyLine: !!line });
    let r = null, threw = false;
    if (!rec) r = { ok: false, code: 'not-found', retryable: false, detail: { reason: 'adapter no longer exists' } };
    else {
      const e = adapterFor(rec);
      // A TWO-PHASE adapter hands back its durable handle BEFORE its send;
      // it is persisted the moment it exists, so a crash between the phases
      // leaves `reconcile()` something to ask about (§9.4).
      const onHandle = async (h) => { await store.outbox.update((ob) => { const q = ob.proposals[id]; if (q) q.sendHandle = h; }); };
      // r6 verify F1 (the belt at the send itself): a reply whose answered message is not a stored message of
      // this conversation any more is refused here too, before the adapter is called
      const targetWhy = p.compose ? null : replyRecheck(p, rec);
      const anchor = p.compose ? null : anchorFactsOf(p);
      // B-6acc: a COMPOSED message starts a NEW conversation through the
      // adapter's declared `compose` (the same idempotency key, the same
      // handle / lost-answer rules as a reply)
      if (targetWhy) r = { ok: false, code: 'not-found', retryable: false, detail: { reason: `the reply's target is not what was approved (${targetWhy}) — nothing was sent` } };
      else {
        sendLeft.add(id);   // only a request that is really handed to the adapter may have LEFT (r4's refund rule)
        try { r = p.compose ? await e.adapter.compose({ to: p.compose.to, cc: p.compose.cc, subject: p.compose.subject, text: wire, idemKey: p.id, as: p.sendAs, onHandle }) : await e.adapter.send(p.convId, { text: wire, replyTo: p.replyTo, idemKey: p.id, as: p.sendAs, onHandle, placement: P.placementOf(p), ...(anchor ? { replyAnchor: anchor } : {}), ...(p.replyEnvelope ? { envelope: p.replyEnvelope } : {}) }); }
        catch (err) {
          r = err && typeof err.toJSON === 'function' ? err.toJSON() : { ok: false, code: (err && err.code) || 'vendor-error', retryable: false, detail: { threw: true, message: (err && err.message) || String(err) } };
          if (err && err.message && !r.message) r.message = err.message;
          threw = !!(r.detail && r.detail.threw);
        }
      }
    }
    const t = now();
    // LOST = the adapter THREW mid-flight (the registry marks it) OR reported
    // a transport failure AFTER the request left (`detail.lost`): the vendor
    // may have processed it, so it is `unknown`, never `failed` (§9.4).
    const lost = threw || !!(r && !r.ok && r.detail && r.detail.lost);
    let to, patch;
    if (r && r.ok) {
      to = 'sent';
      patch = (q) => {
        q.result = { vendorMessageId: r.vendorMessageId || null, at: r.at || t, sentAs: r.sentAs || q.sendAs, lane: r.lane || null, honestyLine: !!line, observed: r.observed || null, handle: r.handle || q.sendHandle || null, ...(q.compose ? { threadId: r.threadId || null } : {}) };
        // lane channel-threads: the thread the reply LANDED in (the vendor's word, e.g. Lark's `thread_id`) — the receipt names it
        if (q.inThread && r.observed && r.observed.threadKey) q.threadKey = String(r.observed.threadKey);
        q.reason = null;
        // the NEW conversation's id (the thread the vendor answered with) —
        // the card's link, the receipt; the index row arrives with the next pass
        if (q.compose && r.threadId && !q.convId) q.convId = String(r.threadId);
      };
    } else if (lost) {
      to = 'unknown';
      patch = (q) => { q.reason = `outcome unknown: ${threw ? 'the adapter threw mid-send' : 'the request left and the answer was lost'} (${(r.detail && r.detail.message) || r.message || r.code}); NOT retried automatically — check the conversation on the platform, or press Check outcome`; q.failure = { code: r.code || 'vendor-error', detail: r.detail || null, at: t }; };
    } else {
      to = 'failed';
      const why = (r && r.detail && (r.detail.reason || r.detail.message)) || (r && r.message) || (r && r.code) || 'refused';
      patch = (q) => { q.reason = `${(r && r.code) || 'failed'}: ${why}`; q.failure = { code: (r && r.code) || 'failed', retryable: !!(r && r.retryable), detail: r && r.detail ? r.detail : null, at: t }; };
    }
    await transition(id, to, 'adapter', patch);
    const p1 = store.outbox.snapshot().proposals[id];
    auditOutbox(p1, 'outcome', { code: r && r.ok ? null : (r && r.code) || null, vendorMessageId: (p1.result && p1.result.vendorMessageId) || null, lost: to === 'unknown' });
    // lane channel-threads: a group that refused a reply INTO a thread narrows `threads.replyInto` on the
    // conversation's cached verdict at once (the composer flips to the read-only line on the next broadcast — attack 19)
    if (to === 'failed' && p1.inThread && r && r.detail && r.detail.why === 'topic-forbidden') {
      try { await store.index.update(() => { const en = store.index.entry(p1.adapterId, p1.convId, { create: false }); if (en && en.convCaps) en.convCaps = { ...en.convCaps, threads: { ...(en.convCaps.threads || {}), replyInto: false, why: 'topic-forbidden' } }; }); } catch (err) { log.warn(`[channels] ${p1.key}: could not narrow the thread reply: ${(err && err.message) || err}`); }
    }
    // a reply sent INTO a thread whose replies are not in the listing: ONE walk of that thread (its floor applies) so the
    // reply shows up in the pane the way the vendor holds it; a listing that carries replies brings it with the next page
    if (to === 'sent' && p1.inThread && p1.threadKey && rec && threadsRow(registry.capsOf(rec.kind)).listing === 'separate') track(threadRefresh(p1.adapterId, p1.convId, p1.threadKey, { vendorNamed: true }).catch(() => {}));
    // lane reaction-hover: a QUOTED reply (the window's Quote) is a reply the listing carries too — the same one kick, so
    // it shows under what it quotes as promptly as a thread reply does (a plain message still waits for its pass)
    else if (to === 'sent' && (p1.inThread || P.placementOf(p1) === 'quote') && rec) { const e2 = live.get(rec.id); if (e2) kick(rec, e2, p1.convId); }
    if (to === 'sent' && rec && r.observed) { try { await noteIdentityObserved(rec, p1.result.sentAs, r.observed, p1.result.vendorMessageId); } catch (err) { log.warn(`[channels] identity observation not recorded: ${(err && err.message) || err}`); } }
    if (to === 'sent') await noteSentBy(p1);
    if (to === 'unknown') await speakUnknown(p1);
    else await receipt(id);
    await pointerSync(p1.key);
    notifyOutbox([id]); notify(p1.convId ? [p1.convId] : []);
    log.log(`[channels] outbox ${id} → ${p1.adapterId}/${p1.convId || (p1.compose ? `(new: ${(p1.compose.to || []).join(', ')})` : '')}: ${to}${p1.reason ? ` — ${p1.reason}` : ''}`);
    sendLeft.delete(id);
    return { ok: to === 'sent', state: to };
  }
  /**
   * AN APPROVED (or direct) REACTION PROPOSAL GOES OUT (spec §5.3 / §3.4): the SAME act the window's click is —
   * `react` / `unreact` as the user, `by:'agent'` (the side record's `src:'agent'`), ONE vendor call, never retried.
   * The attempt / outcome audit lines as a send's; a refusal is `failed` with its code; a LOST answer (the request
   * left, the answer did not come back) is `unknown` — reconciled by ONE list call, never a second POST (attack 6).
   */
  async function sendReactionNow(id, p) {
    const x = p.reaction || {};
    const t0 = now();
    await store.outbox.update((ob) => { const q = ob.proposals[id]; if (q) q.attemptAt = t0; });
    auditOutbox(store.outbox.snapshot().proposals[id], 'attempt', { idemKey: p.id, reaction: { op: x.op, key: x.key, msg: x.msg } });
    let r;
    try { r = x.op === 'remove' ? await unreact(p.adapterId, p.convId, x.msg, x.key, { by: 'agent' }) : await react(p.adapterId, p.convId, x.msg, x.key, { by: 'agent' }); }
    catch (err) { r = { ok: false, code: 'vendor-error', error: String((err && err.message) || err), lost: true }; }
    const t = now();
    let to, patch;
    if (r && r.ok) {
      to = 'sent';
      patch = (q) => { q.result = { vendorMessageId: null, at: t, sentAs: 'user', lane: null, honestyLine: false, observed: null, handle: null, reaction: { op: x.op, key: x.key, msg: x.msg } }; q.reason = null; };
    } else if (r && r.lost) {
      to = 'unknown';
      patch = (q) => { q.reason = `outcome unknown: the reaction request left and the answer was lost (${r.error || r.code}); NOT retried automatically — press Check outcome (one reaction list read)`; q.failure = { code: r.code || 'vendor-error', detail: { lost: true, message: r.error || null }, at: t }; };
    } else {
      to = 'failed';
      patch = (q) => { q.reason = `${(r && r.code) || 'failed'}: ${(r && r.error) || 'refused'}`; q.failure = { code: (r && r.code) || 'failed', retryable: false, detail: { reason: (r && r.error) || null, why: (r && r.why) || null }, at: t }; };
    }
    await transition(id, to, 'adapter', patch);
    const p1 = store.outbox.snapshot().proposals[id];
    auditOutbox(p1, 'outcome', { code: r && r.ok ? null : (r && r.code) || null, lost: to === 'unknown', reaction: true });
    if (to === 'unknown') await speakUnknown(p1);
    else await receipt(id);
    await pointerSync(p1.key);
    notifyOutbox([id]); notify(p1.convId ? [p1.convId] : []);
    log.log(`[channels] outbox ${id} → ${p1.adapterId}/${p1.convId}: reaction ${x.op} ${x.key} on ${x.msg}: ${to}${p1.reason ? ` — ${p1.reason}` : ''}`);
    return { ok: to === 'sent', state: to };
  }
  /** WHAT AN AGENT SENT FROM HERE (spec §5.4): the conversation's bounded per-drafter set of vendor ids — the
   *  `reply-to-mine` / `in-thread-with-me` rules and the reaction digest read it. A failed write costs one rule
   *  hit, is SAID, and never the send. */
  const SENT_BY_MAX = 200;
  async function noteSentBy(p) {
    const d = p && p.draftedBy;
    const vid = p && p.result && p.result.vendorMessageId;
    if (!d || d.kind !== 'agent' || !d.id || !vid || !p.convId || p.kind === 'reaction') return;
    const pk = `agent:${d.id}`;
    try {
      await store.index.update(() => {
        const en = store.index.entry(p.adapterId, p.convId, { create: false });
        if (!en) return;
        const sb = en.sentBy && typeof en.sentBy === 'object' ? { ...en.sentBy } : {};
        const list = (Array.isArray(sb[pk]) ? sb[pk] : []).filter((x) => x !== String(vid));
        list.push(String(vid));
        sb[pk] = list.slice(-SENT_BY_MAX);
        const keys = Object.keys(sb);
        if (keys.length > 64) for (const k of keys.slice(0, keys.length - 64)) delete sb[k];
        en.sentBy = sb;
      });
    } catch (err) { log.warn(`[channels] ${p.adapterId}/${p.convId}: what ${d.id} sent could not be recorded (the reply-to-mine rule will miss it): ${(err && err.message) || err}`); }
  }
  /** An unknown outcome owes the USER a look (§9.4), not the agent a verdict. */
  async function speakUnknown(p) {
    if (!userTodos || typeof userTodos.add !== 'function') return;
    try {
      const recU = adapterRecords().adapters.find((r) => r.id === p.adapterId) || null;
      const adapterLabel = recU ? (recU.label || recU.id) : p.adapterId;
      const title = String(conversationName(p.adapterId, p.convId) || p.title || p.convId || '').slice(0, 120);   // B-c127: the ladder (a compose: its subject)
      const item = userTodos.add(INBOX_KEY, {
        origin: 'channels', // B-328d
        text: `Outbox: a send to ${title} has an UNKNOWN outcome`,
        ...(p.convId ? { action: { type: 'open-channel', adapterId: p.adapterId, convId: p.convId, key: `${p.adapterId}/${p.convId}` } } : {}),   // B-c127: a click opens the conversation
        detail: `A send in ${adapterLabel} · ${title}: the adapter did not answer whether the message landed. It is NOT retried automatically — a duplicate in somebody else's room is worse than asking. Check the conversation on the platform; the Outbox window shows the proposal.\n\n${p.reason || ''}`,
        urgency: 'high', by: 'agent', sessionName: 'Channels',
        i18n: {
          text: { key: i18nKey('Outbox: a send to {title} has an UNKNOWN outcome'), params: { title } },
          detail: [
            { key: i18nKey('A send in {adapter} · {title}: the adapter did not answer whether the message landed. It is NOT retried automatically — a duplicate in somebody else\'s room is worse than asking.'), params: { adapter: adapterLabel, title } },
            { key: i18nKey('Check the conversation on the platform; the Outbox window shows the proposal.') },
          ],
          source: INBOX_SOURCE,
        },
      });
      if (item && item.id) await store.outbox.update((ob) => { if (ob.proposals[p.id]) ob.proposals[p.id].unknownTodoId = item.id; });
    } catch (e) { log.warn(`[channels] outbox ${p.id}: could not file the unknown-outcome item: ${(e && e.message) || e}`); }
  }

  /** The unknown-outcome item is retracted by THIS producer, only its own
   *  still-open id, the moment reconcile settles the proposal. */
  async function retractUnknownItem(p) {
    if (!p || !p.unknownTodoId) return;
    const todoId = p.unknownTodoId;
    await store.outbox.update((ob) => { if (ob.proposals[p.id]) ob.proposals[p.id].unknownTodoId = null; });
    if (!userTodos || typeof userTodos.get !== 'function') return;
    try {
      const it = userTodos.get(todoId);
      if (it && it.status === 'open' && it.sessionKey === INBOX_KEY) userTodos.setStatus(todoId, 'done', RESOLVED_BY);
    } catch (e) { log.warn(`[channels] outbox ${p.id}: could not retract the unknown-outcome item: ${(e && e.message) || e}`); }
  }

  /**
   * RECONCILE (§9.4): THE ONLY WAY OUT OF `unknown`, asked by a PERSON (the
   * card's button / the route) — never by a timer. The adapter is asked
   * whether the lost send landed: `{landed:true}` ⇒ sent (with the vendor
   * id), `{landed:false}` ⇒ failed, anything else ⇒ still unknown, the count
   * of asks stamped. An adapter declaring `idempotency:'none'` cannot be
   * asked at all — the answer is a person's look at the platform — and the
   * refusal says so. Nothing here ever re-sends; a Lark reconcile may
   * re-issue its OWN uuid inside the vendor's dedup hour, which is the
   * adapter's exactly-once guarantee, not a retry.
   */
  async function reconcile(id, { by = 'user' } = {}) {
    const p = store.outbox.snapshot().proposals[id];
    if (!p) return { ok: false, code: 'not-found', error: 'no such proposal' };
    if (p.state !== 'unknown') return { ok: false, code: 'bad-state', error: `proposal is ${p.state}, not unknown — only a lost outcome can be reconciled` };
    const rec = adapterRecords().adapters.find((r) => r.id === p.adapterId) || null;
    if (!rec) return { ok: false, code: 'reconcile-not-available', error: 'the adapter no longer exists — the outcome cannot be checked from here', proposal: proposalView(p) };
    const c = registry.capsOf(rec.kind);
    if (p.kind === 'reaction') return reconcileReaction(id, p, rec, c, by);
    const can = P.canReconcile(c);
    const t = now();
    if (!can.ok) {
      await store.outbox.update((ob) => { const q = ob.proposals[id]; if (q) q.reconcile = { n: (q.reconcile && q.reconcile.n) || 0, lastAt: t, lastBy: by, lastAnswer: 'not-available', lastWhy: can.why, detail: null, resolvedAt: null }; });
      const p0 = store.outbox.snapshot().proposals[id];
      auditOutbox(p0, 'reconcile-refused', { why: can.why });
      notifyOutbox([id]);
      return { ok: false, code: 'reconcile-not-available', error: can.why, proposal: proposalView(p0) };
    }
    const n = ((p.reconcile && p.reconcile.n) || 0) + 1;
    auditOutbox(p, 'reconcile-attempt', { by, n });
    let answer;
    try {
      const e = adapterFor(rec);
      const anchorR = p.compose ? null : anchorFactsOf(p);
      answer = await e.adapter.reconcile(p.convId, { idemKey: p.id, sentAt: p.attemptAt || p.updatedAt || p.at, text: (p.wire && p.wire.text) || p.text, replyTo: p.replyTo, as: p.sendAs, handle: p.sendHandle || null, ...(p.compose ? { compose: p.compose } : {}), ...(anchorR ? { replyAnchor: anchorR } : {}), ...(p.replyEnvelope ? { envelope: p.replyEnvelope } : {}), ...(p.inThread ? { inThread: true, threadKey: p.threadKey || null } : {}) });
    } catch (err) {
      // verify r3: a RATE refusal inside the reconcile is thrown by the adapter now (never an `unknown` that invited the next
      // press into the vendor's stop) — the answer names the wait the vendor gave, so the owner's next look can say it
      answer = { unknown: true, reason: `reconcile threw: ${(err && err.message) || err}`, detail: { threw: true, code: (err && err.code) || null, ...(err && err.detail && Number(err.detail.retryAfterSec) > 0 ? { retryAfterSec: Number(err.detail.retryAfterSec) } : {}) } };
    }
    const v = P.reconcileVerdict(answer);
    const stamp = (q) => { q.reconcile = { n, lastAt: t, lastBy: by, lastAnswer: v.answer, lastWhy: v.reason || null, detail: v.detail || null, resolvedAt: v.to ? t : null }; };
    if (!v.to) {
      await store.outbox.update((ob) => { const q = ob.proposals[id]; if (q) stamp(q); });
      const p1 = store.outbox.snapshot().proposals[id];
      auditOutbox(p1, 'reconcile-outcome', { answer: 'unknown', why: v.reason || null, n });
      notifyOutbox([id]); notify(p1.convId ? [p1.convId] : []);
      log.log(`[channels] outbox ${id}: reconcile #${n} — still unknown${v.reason ? ` (${v.reason})` : ''}`);
      return { ok: true, resolved: false, state: 'unknown', answer: 'unknown', reason: v.reason || null, proposal: proposalView(p1) };
    }
    const tr = await transition(id, v.to, 'reconcile', (q) => {
      stamp(q);
      if (v.to === 'sent') { q.result = { vendorMessageId: v.vendorMessageId, at: v.at || t, sentAs: q.sendAs, lane: null, honestyLine: !!(q.wire && q.wire.honestyLine), observed: (v.detail && v.detail.observed) || null, handle: q.sendHandle || null, reconciled: true }; q.reason = null; q.failure = null; }
      else { q.reason = v.reason; q.failure = { code: 'not-landed', detail: v.detail || null, at: t }; }
    });
    if (!tr.ok) return { ok: false, code: 'bad-state', error: tr.why };
    const p1 = store.outbox.snapshot().proposals[id];
    auditOutbox(p1, 'reconcile-outcome', { answer: v.answer, vendorMessageId: v.vendorMessageId || null, n });
    if (v.to === 'sent' && v.detail && v.detail.observed) { try { await noteIdentityObserved(rec, p1.result.sentAs, v.detail.observed, v.vendorMessageId); } catch {} }
    await retractUnknownItem(p1);
    await receipt(id);
    await pointerSync(p1.key);
    notifyOutbox([id]); notify(p1.convId ? [p1.convId] : []);
    log.log(`[channels] outbox ${id}: reconcile #${n} → ${v.to}${v.reason ? ` — ${v.reason}` : ''}`);
    return { ok: true, resolved: true, state: v.to, answer: v.answer, proposal: proposalView(p1) };
  }

  /** A LOST REACTION'S OUTCOME (spec §5.3): ONE reaction list read (paced, metered, inside the minute's ceiling),
   *  matched on (key, the account's user): present ⇒ an add landed / a removal did not; absent ⇒ the reverse. */
  async function reconcileReaction(id, p, rec, c, by) {
    const x = p.reaction || {};
    const t = now();
    const n = ((p.reconcile && p.reconcile.n) || 0) + 1;
    const stampR = (q, answer, why, resolved) => { q.reconcile = { n, lastAt: t, lastBy: by, lastAnswer: answer, lastWhy: why || null, detail: null, resolvedAt: resolved ? t : null }; };
    if (reactionsRow(c).read !== 'list') {
      await store.outbox.update((ob) => { const q = ob.proposals[id]; if (q) stampR(q, 'not-available', 'this channel does not list reactions — only a person can check the platform', false); });
      notifyOutbox([id]);
      return { ok: false, code: 'reconcile-not-available', error: 'this channel does not list reactions — only a person can check the platform', proposal: proposalView(store.outbox.snapshot().proposals[id]) };
    }
    const e = adapterFor(rec);
    const minute = Drain.rxMinuteAt(e.rxMinute, now());
    if (minute.n >= reactionsPerMin()) return { ok: false, code: 'vendor-budget', error: 'the reaction list budget of this minute is spent — try again in a moment', retryAfterSec: Math.max(1, Math.ceil((minute.at + 60e3 - now()) / 1000)), proposal: proposalView(p) };
    if (rxBackedOff(e)) return { ...rxBackoffRefusal(rec, e), proposal: proposalView(p) };
    if (!affordable(rec, e)) return { ...budgetRefusal(rec, e), proposal: proposalView(p) };
    e.rxMinute = Drain.rxReserve(minute, now());
    auditOutbox(p, 'reconcile-attempt', { by, n, reaction: true });
    let list = null, why = null;
    const prevBy = e.chargeBy; e.chargeBy = 'owner';
    try {
      const r0 = await vendor(rec, e, () => e.adapter.reactions(p.convId, { messageId: x.msg })).catch((err) => { if (err instanceof ChannelError && err.code === 'rate-limited' && !outlived(rec, e)) noteRxRateLimit(e, err); throw err; });
      notePages(e, r0);
      const snap = { k: 'rx', msg: x.msg, at: Number(r0 && r0.at) || now(), form: 'snapshot', src: 'list', list: (r0 && r0.list) || [], ...(r0 && r0.truncated ? { truncated: true } : {}) };
      appendSides(rec, p.convId, [snap]);
      list = reactionsFor(rec, p.convId, [x.msg], { e }).get(x.msg) || [];
    } catch (err) { why = `the reaction list could not be read: ${(err && err.message) || err}`; }
    finally { e.chargeBy = prevBy; }
    if (!list) {
      await store.outbox.update((ob) => { const q = ob.proposals[id]; if (q) stampR(q, 'unknown', why, false); });
      notifyOutbox([id]);
      return { ok: true, resolved: false, state: 'unknown', answer: 'unknown', reason: why, proposal: proposalView(store.outbox.snapshot().proposals[id]) };
    }
    const mine = list.some((y) => y.key === x.key && y.mine);
    const landed = x.op === 'remove' ? !mine : mine;
    const to = landed ? 'sent' : 'failed';
    const tr = await transition(id, to, 'reconcile', (q) => {
      stampR(q, landed ? 'landed' : 'not-landed', null, true);
      if (landed) { q.result = { vendorMessageId: null, at: t, sentAs: 'user', lane: null, honestyLine: false, observed: null, handle: null, reconciled: true, reaction: { op: x.op, key: x.key, msg: x.msg } }; q.reason = null; q.failure = null; }
      else { q.reason = 'reconcile: the reaction list does not show it — it never landed'; q.failure = { code: 'not-landed', detail: null, at: t }; }
    });
    if (!tr.ok) return { ok: false, code: 'bad-state', error: tr.why };
    const p1 = store.outbox.snapshot().proposals[id];
    auditOutbox(p1, 'reconcile-outcome', { answer: landed ? 'landed' : 'not-landed', n, reaction: true });
    await retractUnknownItem(p1);
    await receipt(id);
    await pointerSync(p1.key);
    notifyOutbox([id]); notify(p1.convId ? [p1.convId] : []);
    return { ok: true, resolved: true, state: to, answer: landed ? 'landed' : 'not-landed', proposal: proposalView(p1) };
  }

  /**
   * THE BOOT SWEEP (§9.4): a proposal still in `sending` was cut off between
   * the audit ATTEMPT line and the OUTCOME line by the previous process —
   * the one state that must never read as "not sent". It becomes `unknown`
   * (actor `boot`), the user is asked to look, and reconcile is the only way
   * on. Never a re-send.
   */
  async function sweepSending() {
    const stuck = proposalsFor().filter((p) => p.state === 'sending');
    for (const p of stuck) {
      const tr = await transition(p.id, 'unknown', 'boot', (q) => { q.reason = 'outcome unknown: the server stopped between the attempt and the outcome; NOT retried automatically — check the conversation on the platform, or press Check outcome'; q.failure = { code: 'lost-at-boot', detail: null, at: now() }; });
      if (!tr.ok) continue;
      const p1 = store.outbox.snapshot().proposals[p.id];
      auditOutbox(p1, 'outcome', { code: 'lost-at-boot', vendorMessageId: null, lost: true });
      await speakUnknown(p1);
      await pointerSync(p1.key);
      notifyOutbox([p.id]); notify(p1.convId ? [p1.convId] : []);
      log.warn(`[channels] outbox ${p.id}: was 'sending' when the previous process stopped — now unknown (Check outcome settles it)`);
    }
    return stuck.length;
  }

  /**
   * THE BOOT SWEEP OF A REPLACE CUT IN HALF (verify r2, 2026-09-27): a
   * replace stamps `replaces` on the NEW draft and then withdraws the old one
   * in a second write — a process that dies between the two leaves TWO
   * approvable copies of one message (the design's named worst case: a
   * duplicate in somebody else's room). At boot, every draft whose `replaces`
   * names a proposal its own drafter may still withdraw is finished: the old
   * one goes `withdrawn` (`replacedBy` the new), its pointer retracted, the
   * agent's receipt recorded and never handed back. A decision that landed
   * on the old one meanwhile (the table refuses) leaves it as it is.
   */
  async function sweepReplaces() {
    const ob = store.outbox.snapshot();
    // verify r3: EVERY hold is taken SYNCHRONOUSLY, before the first await — a half replace whose old draft is
    // also due (24 h old at the boot) was expired by the TTL sweep while this loop awaited an earlier one, and
    // the agent got an "EXPIRED unapproved" receipt for a draft it had replaced (2 of 4 in the construction)
    const runs = [];
    for (const q of Object.values(ob.proposals || {})) {
      if (!q || !q.replaces || !q.draftedBy || q.draftedBy.kind !== 'agent' || !q.draftedBy.id) continue;
      const old = ob.proposals[q.replaces];
      if (!old || old.state === 'withdrawn') continue;
      const by = { kind: 'agent', id: q.draftedBy.id, name: q.draftedBy.name || null };
      if (!P.withdrawVerdict(old, by).ok) continue;
      runs.push(onProposal(old.id, () => withdrawNow(old.id, by, `replaced by ${q.id}`, { replacedBy: q.id })).then((w) => {
        if (w && w.ok) { log.warn(`[channels] outbox ${old.id}: a replace by ${q.id} was cut in half by the previous process — finished at boot (withdrawn)`); return 1; }
        return 0;
      }, (err) => { log.warn(`[channels] outbox ${old.id}: the boot replace sweep could not finish it: ${(err && err.message) || err}`); return 0; }));
    }
    let n = 0;
    for (const r of await Promise.all(runs)) n += r;
    return n;
  }

  /**
   * THE RECEIPT (§9.3). Built by the PURE module, stored on the proposal,
   * and handed to the drafting AGENT through the ladder. A refusal is stashed
   * through the ladder's own durable stash (with the proposal id as its
   * `ref`, so the card learns when the agent's next message drained it).
   *
   * HOW IT IS DELIVERED IS THE DECIDER'S CHOICE, AT THE ACTION (2026-09-27,
   * the owner: "收件箱里的 approve 动作需要在账号-level 的通知配置里控制行为有点
   * 反直觉"): the Approve / Reject split button records `receiptChoice` on the
   * proposal — `next-turn` (free: it rides the agent's next message, the
   * default) or `wake-now` (a billed turn through THE ONE DOOR, spendReason
   * `channel-receipt`, the spend ceiling inside the ladder). PURE
   * `receiptDeliveryVerdict` decides: ONE wake per proposal (the row lives on
   * the proposal, reserved atomically before the ladder), never for a session
   * that is not live (the stash keeps it — "gone"), never for a proposal the
   * agent withdrew itself. The per-watcher `receiptWake` opt-in (decision 8)
   * is DEPRECATED: the engine no longer reads it (a stored `true` is ignored;
   * `start()` logs how many watchers still carry it).
   */
  async function receipt(id) {
    const p = store.outbox.snapshot().proposals[id];
    if (!p) return null;
    const rc = P.receiptFor(p);
    if (!rc) return null;
    await store.outbox.update((ob) => { if (ob.proposals[id]) ob.proposals[id].receipt = rc; });
    if (!p.draftedBy || p.draftedBy.kind !== 'agent' || !p.draftedBy.id) return rc;
    const cid = p.draftedBy.id;
    const cf = p.convId ? convFor(p.adapterId, p.convId) : { en: null, rec: null };
    const rec = cf.rec || adapterRecords().adapters.find((r) => r.id === p.adapterId) || null;
    // the conversation's chain (a composed message has none yet: its own)
    const key = p.convId ? `${p.adapterId}/${p.convId}` : null;
    return billedWake({ conv: key || `proposal:${id}`, scopeOf: null }, () => receiptNow(id, p, rc, cid, rec, key));
  }
  /** The receipt's delivery, inside its serial section: the verdict, the ONE
   *  wake row reserved on the proposal before the ladder, the outcome after. */
  async function receiptNow(id, p, rc, cid, rec, key) {
    const en = key ? store.index.peek(key) : null;
    const tR = now();
    let live = null;
    if (agentsWanted) { try { live = (liveSessions() || []).some((x) => x && x.cid === cid); } catch { live = null; } }
    const cur = store.outbox.snapshot().proposals[id] || p;
    let verdict = P.receiptDeliveryVerdict(cur.receiptChoice, cur, { live });
    let wake = verdict.deliver === 'wake-now' && !stopped;
    // THE ROW BEFORE THE BILL: the proposal takes its ONE wake row inside the
    // outbox's serialized door — a second receipt of it finds the row and rides
    // the next turn; a row that cannot be written is no wake
    if (wake) {
      // verify r3: `got` is the WRITE's answer, not the callback's — the callback ran on the live store and then
      // the file write threw (ENOSPC), and the wake went out under a log line saying "delivered without a wake"
      let took = false, got = false;
      try { await store.outbox.update((ob) => { const q = ob.proposals[id]; if (q && !q.receiptWake) { q.receiptWake = { at: tR, reserved: true, bootId: BOOT_ID, pid: process.pid }; took = true; } }); got = took; } catch (err) { log.warn(`[channels] receipt ${id}: the proposal could not take its wake row (${took ? 'the write failed after the row was taken in memory' : 'the store refused'}) — delivered without a wake: ${(err && err.message) || err}`); }
      if (!got) { wake = false; verdict = { deliver: 'next-turn', why: took ? 'row-unwritten' : 'already-woken' }; }
    }
    // verify r2 (IDENTITY): a drafter whose access to the conversation was removed hears the FATE only
    const withheld = !drafterSees(cur);
    // B-c127: the receipt names the conversation by the ladder (never `proposal p-…`), and its card opens it
    const rTitle = conversationName(p.adapterId, p.convId) || p.title || p.convId || '';
    const text = P.renderReceiptBlock(rc, { adapterLabel: rec ? (rec.label || rec.id) : p.adapterId, title: rTitle, text: p.text, proposed: p.originalText, withheld });
    const fromName = 'Channels · Outbox';
    const cardText = withheld ? `Receipt: your proposal — ${rc.status} (access removed)` : `${CR.nameOf([rTitle], p.convId || p.id)}: receipt — ${rc.status}${rc.reason ? ` — ${String(rc.reason).slice(0, 160)}` : ''}`;
    const channel = !withheld && p.convId ? CR.refOf({ adapterId: p.adapterId, convId: p.convId, name: rTitle, account: rec ? (rec.label || rec.id) : null, vendor: rec ? rec.kind : null }) : null;
    let r = null, stashed = false, stashErr = null;
    if (!deliver || typeof deliver.deliverToConversation !== 'function') r = { ok: false, reason: 'no delivery ladder wired', refused: 'unwired' };
    else {
      try { r = await deliver.deliverToConversation(cid, text, { kind: 'notification', noWake: !wake, spendReason: 'channel-receipt', fromName, cardText, ...(channel ? { channel } : {}) }); }
      catch (err) { r = { ok: false, reason: `ladder threw: ${(err && err.message) || err}`, refused: 'error' }; }
      if (!(r && r.ok) && typeof deliver.stashFor === 'function') {
        // verify r4: a stash whose disk write failed THROWS (the entry is not stored) — the card says that, never "waiting"
        try { deliver.stashFor(cid, { source: 'channel-receipt', kind: 'notification', fromName, text, ref: id, about: stashAbout({ keys: key ? [key] : [], account: key ? null : p.adapterId, cid, groups: live ? null : (Array.isArray(cur.drafterGroups) ? cur.drafterGroups : []) }) }); stashed = true; } catch (err) { stashErr = String((err && err.message) || err).slice(0, 200); log.warn(`[channels] receipt ${id} stash failed — the receipt stays on the proposal, not stored for the next turn: ${stashErr}`); }
      }
    }
    // a stashed receipt for a drafter whose session is not live is KEPT for when it comes back — the card says so
    const gone = stashed && live === false;
    const delivery = {
      at: now(), ok: !!(r && r.ok), lane: r && r.ok ? (r.lane || 'message') : (stashed ? 'stash' : 'none'), stashed, refused: stashErr ? 'stash-failed' : (r && r.refused) || null, woke: wake, why: r && r.ok ? null : String(stashErr ? `the receipt could not be stored: ${stashErr}` : (r && r.reason) || 'refused').slice(0, 200),
      choice: cur.receiptChoice || 'next-turn', verdict: verdict.why || null, ...(gone ? { gone: true } : {}),
    };
    await store.outbox.update((ob) => {
      const q = ob.proposals[id];
      if (!q) return;
      q.receiptDelivery = delivery;
      if (wake && q.receiptWake) q.receiptWake = { ...q.receiptWake, reserved: false, ok: delivery.ok, lane: delivery.lane, refused: delivery.refused, why: delivery.why };
    });
    if (wake && delivery.ok && en) {
      // the conversation's wake history takes the receipt wake (the panel's count), like every wake
      try { await store.index.update(() => { const e2 = store.index.entry(p.adapterId, p.convId, { create: false }); if (e2) { healP2(e2); e2.stats.wakes = F.pruneLedger([...e2.stats.wakes, { at: tR, n: 1, cid, ok: true, lane: delivery.lane, why: null, refused: null, whys: [], digest: false, grain: 'receipt', receipt: id, id: `${tR}-receipt-${id}` }], tR); } }); } catch (err) { log.warn(`[channels] receipt ${id}: the conversation's wake history could not take the row: ${(err && err.message) || err}`); }
      notify([p.convId]);
    }
    log.log(`[channels] receipt ${id} → ${cid}: ${delivery.ok ? `delivered via ${delivery.lane}${wake ? ' (woke it, the decider\'s choice)' : ''}` : (stashed ? `stashed for the next turn${gone ? ' (its session is not live)' : ''}` : 'not delivered')}${delivery.why ? ` (${delivery.why})` : ''}`);
    return rc;
  }

  /** The TTL sweep (§9.1): a proposal left in `awaiting-approval` past its
   *  TTL expires, with a receipt. Cheap; runs from the tick once a minute. */
  async function expireSweep() {
    const t = now();
    const due = proposalsFor().filter((p) => P.expiryVerdict(p, t).expired && !proposalHolds.has(p.id));   // a proposal a replace holds is judged next minute
    for (const p of due) {
      // …and asked AGAIN at apply time (verify: a hold taken after this list was made)
      const tr = await transition(p.id, 'expired', 'ttl', (q) => { q.reason = 'expired: not approved within 24 h'; }, { unless: () => proposalHolds.has(p.id) });
      if (!tr.ok) continue;
      auditOutbox(store.outbox.snapshot().proposals[p.id], 'expire');
      await receipt(p.id);
      await pointerSync(p.key);
      notifyOutbox([p.id]); notify(p.convId ? [p.convId] : []);
    }
    return due.length;
  }

  /**
   * THE PER-CONVERSATION "FOR YOU" POINTER (§9.2). One item per conversation,
   * text WITHOUT a count (dedupe-by-text is the idempotence we want), count +
   * latest body in `detail` (updated in place on re-file), the id persisted on
   * the conversation row, retracted by THIS producer — only its own id, only
   * while open — when the last proposal leaves awaiting-approval. A throw from
   * the open-item cap is caught, logged and DEGRADES to the rail badge and
   * the Outbox window; it never takes the proposal down with it.
   */
  async function pointerSync(key) {
    if (typeof key === 'string' && key.includes('/~compose/')) return composePointerSync(key.slice(0, key.indexOf('/~compose/')));
    const en = store.index.peek(key);
    if (!en) return;
    const awaiting = proposalsFor(key).filter((p) => p.state === 'awaiting-approval');
    const rec = adapterRecords().adapters.find((r) => r.id === en.adapterId) || null;
    if (awaiting.length) {
      if (!userTodos || typeof userTodos.add !== 'function') return;
      const title = String((rec && humanNameOf(rec, en)) || en.id).slice(0, 120);   // B-c127: the ladder
      const text = `Proposals awaiting approval in ${title}`;
      const latest = awaiting[0];
      const agentName = latest.draftedBy && latest.draftedBy.kind === 'agent' ? (latest.draftedBy.name || latest.draftedBy.id) : null;
      const who = agentName || 'you';
      const adapterLabel = rec ? (rec.label || rec.id) : en.adapterId;
      const latestText = String(latest.text).slice(0, 300);
      const detail = `${awaiting.length} proposal${awaiting.length === 1 ? '' : 's'} awaiting your approval in ${adapterLabel} · ${title}.\nLatest (${who}): "${latestText}"\n\nOpen the Outbox (rail → Channels → Outbox) or the conversation window to approve, edit or reject. This item is retracted by the channels engine when the last proposal leaves awaiting-approval.`;
      // the same sentences as STRUCTURE — the client words them (a3 i18n)
      const i18n = {
        text: { key: i18nKey('Proposals awaiting approval in {title}'), params: { title } },
        detail: [
          { key: i18nKey('{n} proposal(s) awaiting your approval in {adapter} · {title}.'), params: { n: awaiting.length, adapter: adapterLabel, title } },
          agentName ? { key: i18nKey('Latest ({who}): "{text}"'), params: { who: agentName, text: latestText } } : { key: i18nKey('Latest (your own draft): "{text}"'), params: { text: latestText } },
          { key: i18nKey('Open the Outbox (rail → Channels → Outbox) or the conversation window to approve, edit or reject. This item is retracted by the channels engine when the last proposal leaves awaiting-approval.') },
        ],
        source: INBOX_SOURCE,
      };
      try {
        const prevId = en.pendingTodoId || null;
        const item = userTodos.add(INBOX_KEY, { origin: 'channels', text, detail, urgency: 'normal', by: 'agent', sessionName: 'Channels', i18n, action: { type: 'open-channel', adapterId: en.adapterId, convId: en.id, key: en.key } });   // B-c127: a click opens the conversation; verify r1 F2: `key` = the item's identity
        if (item && item.id) await store.index.update(() => { const e2 = store.index.entry(en.adapterId, en.id, { create: false }); if (e2) e2.pendingTodoId = item.id; });
        // B-c127: a pointer filed before it carried its action (or under an older name) is a DIFFERENT item now — retract it, never orphan it
        if (item && item.id && prevId && prevId !== item.id && typeof userTodos.get === 'function') { try { const it = userTodos.get(prevId); if (it && it.status === 'open' && it.sessionKey === INBOX_KEY) userTodos.setStatus(prevId, 'done', RESOLVED_BY); } catch { /* the new pointer stands */ } }
      } catch (e) {
        // DEGRADE, never fail the proposal: the rail badge and the Outbox
        // window are the recorded surfaces; the pointer is a convenience.
        log.warn(`[channels] ${key}: could not file the approval pointer (${(e && e.message) || e}) — the Outbox badge still shows it`);
      }
      return;
    }
    if (!en.pendingTodoId) return;
    const id = en.pendingTodoId;
    await store.index.update(() => { const e2 = store.index.entry(en.adapterId, en.id, { create: false }); if (e2) e2.pendingTodoId = null; });
    if (!userTodos || typeof userTodos.get !== 'function') return;
    try {
      const it = userTodos.get(id);
      if (it && it.status === 'open' && it.sessionKey === INBOX_KEY) userTodos.setStatus(id, 'done', RESOLVED_BY);
    } catch (e) { log.warn(`[channels] ${key}: could not retract the approval pointer: ${(e && e.message) || e}`); }
  }

  // ── policy + reach (§8) ───────────────────────────────────────────────────
  async function setPolicy(adapterId, convId, mode, by = 'user') {
    if (!known(adapterId, convId)) return { ok: false, code: 'not-found', error: 'No such conversation' };
    if (mode !== null && !P.POLICY_MODES.includes(mode)) return { ok: false, code: 'bad-policy', error: `mode must be ${P.POLICY_MODES.join('|')} (or null to use the adapter's default)` };
    const t = now();
    await store.index.update(() => { const e2 = store.index.entry(adapterId, convId, { create: false }); if (e2) e2.policy = mode === null ? null : { mode, by, at: t }; });
    try { store.audit({ kind: 'policy', op: 'set', scope: { kind: 'conversation', id: `${adapterId}/${convId}` }, mode, at: t, by }); } catch {}
    notify([convId]);
    const { en, rec } = convFor(adapterId, convId);
    return { ok: true, policy: policyFor(rec, en) };
  }
  /** A USER-written grant (origin `user`), or `level:null` to remove the
   *  user's own row; the assignment's and a request's rows are other rows. */
  async function setReach(adapterId, convId, { principal, level }, by = 'user') {
    if (!known(adapterId, convId)) return { ok: false, code: 'not-found', error: 'No such conversation' };
    const key = `${adapterId}/${convId}`;
    const t = now();
    const scope = { kind: 'conversation', id: key };
    if (level === null || level === undefined) {
      const v = ACL.validateGrant({ principal, scope, level: 'hidden', origin: 'user' });
      if (!v.ok) return { ok: false, code: 'bad-grant', error: v.error };
      await store.index.update(() => { const e2 = store.index.entry(adapterId, convId, { create: false }); if (!e2) return; healP2(e2); e2.reachEntries = ACL.removeGrant(e2.reachEntries, { principal: v.grant.principal, scope, origin: 'user' }); });
      try { store.audit({ kind: 'acl', op: 'revoke', principal: v.grant.principal, scope, origin: 'user', at: t, by }); } catch {}
      notify([convId]);
      return { ok: true, reach: reachView(store.index.peek(key)) };
    }
    const v = ACL.validateGrant({ principal, scope, level, origin: 'user', at: t, by });
    if (!v.ok) return { ok: false, code: 'bad-grant', error: v.error };
    await store.index.update(() => { const e2 = store.index.entry(adapterId, convId, { create: false }); if (!e2) return; healP2(e2); e2.reachEntries = ACL.applyGrant(e2.reachEntries, v.grant); });
    try { store.audit({ kind: 'acl', op: 'grant', principal: v.grant.principal, scope, level, origin: 'user', at: t, by }); } catch {}
    notify([convId]);
    return { ok: true, reach: reachView(store.index.peek(key)) };
  }
  function reachView(en) {
    if (!en) return null;
    const target = { key: en.key, adapterId: en.adapterId };
    // every row from all three homes, WITH its origin (and a derived row's pattern)
    return { entries: grantsOfConversation(en, target).map((g) => ({ ...g, id: ACL.grantId(g) })), requests: (en.reachRequests || []).map((r) => ({ ...r })) };
  }
  /** An agent's REQUEST for access to a `requestable` conversation (§8): one
   *  "For you" item with the stated reason; approving writes EXACTLY ONE
   *  `visible` grant for that (principal, scope). Hidden = uniform not-found. */
  async function request(ctx, adapterId, convId, why) {
    const { en, rec } = convFor(adapterId, convId);
    if (!en || !rec || !ctx || ctx.kind !== 'agent') return ACL.notFound();
    const reach = reachFor(ctx, rec, en);
    // already allowed — no card (lane everyone-principal: an All-agents grant answers every agent's request here)
    if (ACL.canSee(reach.level)) return { ok: true, already: true, level: reach.level, via: reach.via || null };
    // lane channel-agent-watch W2: a conversation the account's directory lists to agents is requestable by its title
    if (!ACL.canRequest(reach.level) && !directoryLists(rec, en)) return ACL.notFound();
    const t = now();
    const reason = String(why || '').trim().slice(0, 500);
    if (!reason) return { ok: false, code: 'bad-request', error: 'a reason is required — the user reads it' };
    const open = (en.reachRequests || []).find((r) => r.status === 'open' && r.principal && r.principal.kind === 'agent' && r.principal.id === ctx.id);
    if (open) return { ok: true, request: { ...open }, already: true };
    const req = { id: `rq-${t.toString(36)}-${Math.random().toString(36).slice(2, 8)}`, principal: { kind: 'agent', id: ctx.id, name: ctx.name || null }, scope: { kind: 'conversation', id: en.key }, why: reason, at: t, status: 'open', todoId: null, decidedAt: null };
    if (userTodos && typeof userTodos.add === 'function') {
      try {
        const title = String(humanNameOf(rec, en) || en.id).slice(0, 120);   // B-c127: the ladder
        const item = userTodos.add(INBOX_KEY, {
          origin: 'channels', // B-328d
          text: `${ctx.name || ctx.id} requests access to ${title}`,
          action: { type: 'open-channel', adapterId: en.adapterId, convId: en.id, key: en.key },   // B-c127: a click opens the conversation (its Reach dialog is there)
          detail: `Agent session ${ctx.name || ''} (${ctx.id}) asks to see ${rec.label || rec.id} · ${title}.\nReason: ${reason}\n\nApprove or deny from the conversation's Reach dialog (rail → Channels → row menu → Reach…). Approving grants that ONE session visibility on that ONE conversation; group defaults are untouched.`,
          urgency: 'normal', by: 'agent', sessionName: 'Channels',
          i18n: {
            text: { key: i18nKey('{agent} requests access to {title}'), params: { agent: ctx.name || ctx.id, title } },
            detail: [
              { key: i18nKey('Agent session {name} ({id}) asks to see {adapter} · {title}.'), params: { name: ctx.name || '', id: ctx.id, adapter: rec.label || rec.id, title } },
              { key: i18nKey('Reason: {reason}'), params: { reason: String(reason) } },
              { key: i18nKey('Approve or deny from the conversation\'s Reach dialog (rail → Channels → row menu → Reach…). Approving grants that ONE session visibility on that ONE conversation; group defaults are untouched.') },
            ],
            source: INBOX_SOURCE,
          },
        });
        if (item && item.id) req.todoId = item.id;
      } catch (e) { log.warn(`[channels] ${en.key}: could not file the reach request: ${(e && e.message) || e}`); }
    }
    await store.index.update(() => { const e2 = store.index.entry(adapterId, convId, { create: false }); if (!e2) return; healP2(e2); e2.reachRequests.push(req); if (e2.reachRequests.length > 50) e2.reachRequests.splice(0, e2.reachRequests.length - 50); });
    try { store.audit({ kind: 'acl', op: 'request', principal: req.principal, scope: req.scope, why: reason, at: t, by: 'agent' }); } catch {}
    notify([convId]);
    return { ok: true, request: { ...req } };
  }
  async function decideRequest(requestId, approve, by = 'user') {
    // B-f32b: the scan reads the live rows; only the row holding the request is copied
    const live = store.index.live();
    let hit = null;
    for (const k in live) { const x = live[k]; if (x && (x.reachRequests || []).some((r) => r.id === requestId)) { hit = k; break; } }
    const en = hit ? store.index.peek(hit) : null;
    if (!en && (store.index.table('watchRequests') || []).some((r) => r && r.id === requestId)) return decideWatchRequest(requestId, approve, by);
    if (!en) return { ok: false, code: 'not-found', error: 'No such request' };
    const req = en.reachRequests.find((r) => r.id === requestId);
    if (req.status !== 'open') return { ok: false, code: 'bad-state', error: `request already ${req.status}` };
    const t = now();
    let grant = null, applied = false;
    await store.index.update(() => {
      const e2 = store.index.entry(en.adapterId, en.id, { create: false });
      if (!e2) return;
      healP2(e2);
      const r2 = e2.reachRequests.find((r) => r.id === requestId);
      // verify-r6 Q1: the status is asked AGAIN inside the write — two decisions in flight (Approve here, Deny in another
      // window) both passed the check above the await, and the later one overwrote the earlier: a card read "denied"
      // while the grant stood (a guard asked before an await is re-asked after it)
      if (!r2 || r2.status !== 'open') return;
      applied = true;
      r2.status = approve ? 'approved' : 'denied'; r2.decidedAt = t; r2.decidedBy = by;
      if (approve) { const out = ACL.approveRequest(e2.reachEntries, { principal: r2.principal, scope: r2.scope, at: t, by }); e2.reachEntries = out.grants; grant = out.grant; }
    });
    if (!applied) return { ok: false, code: 'bad-state', error: 'request already decided (in another window, a moment ago)' };
    try { store.audit({ kind: 'acl', op: approve ? 'grant' : 'deny', principal: req.principal, scope: req.scope, level: approve ? 'visible' : null, origin: 'request', requestId, at: t, by }); } catch {}
    if (req.todoId && userTodos && typeof userTodos.get === 'function') {
      try { const it = userTodos.get(req.todoId); if (it && it.status === 'open' && it.sessionKey === INBOX_KEY) userTodos.setStatus(req.todoId, 'done', RESOLVED_BY); } catch {}
    }
    notify([en.id]);
    return { ok: true, request: { ...req, status: approve ? 'approved' : 'denied' }, grant };
  }

  // ── lane channel-agent-watch (the owner, 2026-10-01): an agent's OWN watch + the directory ──────────────────
  /** W2: does this account's directory list THIS conversation to agents (its title, kind, age, member count — never a
   *  message, never a name)? PURE `ACL.directoryOf(rec)`: groups ON, single chats OFF unless the owner flipped them. */
  function directoryLists(rec, en) {
    if (!rec || !en || rec.enabled === false) return false;
    let mod = null; try { mod = registry.get(rec.kind); } catch {}
    if (mod && mod.builtin) return false;   // the built-in Agents adapter answers reach with msg-acl (§12.3)
    return ACL.directoryListable(ACL.directoryOf(rec), en.kind);
  }
  /** The account's directory switches — the Edit dialog's `PUT {agentDirectory:{groups, singles}}`. */
  async function setAgentDirectory(adapterId, value) {
    const rec = adapterRecords().adapters.find((r) => r.id === adapterId);
    if (!rec) return { ok: false, code: 'not-found', error: 'no such account' };
    const v = ACL.validateDirectory(value);
    if (!v.ok) return { ok: false, code: 'bad-request', error: v.error };
    await store.adapters.update(() => { rec.agentDirectory = v.directory; });
    try { store.audit({ kind: 'acl', op: 'directory', adapterId, directory: v.directory, at: now(), by: 'user' }); } catch {}
    notify([]);
    return { ok: true, agentDirectory: v.directory };
  }
  /** W1: what `watch <conv|account>` names, judged for THIS agent — reach FIRST (a hidden conversation is the uniform
   *  not-found; one it may only REQUEST is refused by name, pointing at `request`: a watch never grants reading). */
  function watchTargetOf(ctx, ref) {
    const r0 = String(ref || '').trim();
    if (!r0) return { ok: false, code: 'bad-request', error: 'name a conversation (<adapter>/<conversation id>, as `list` prints it) or an account (<adapter>)' };
    const i = r0.indexOf('/');
    if (i > 0) {
      const { en, rec } = convFor(r0.slice(0, i), r0.slice(i + 1));
      if (!en || !rec || rec.enabled === false) return ACL.notFound();
      const reach = reachFor(ctx, rec, en);
      if (!ACL.canSee(reach.level)) {
        if (ACL.canRequest(reach.level) || directoryLists(rec, en)) return { ok: false, code: 'no-access', error: `you cannot read ${r0} yet, so you cannot watch it — \`vibespace-channels request ${r0} "why"\` asks the user for access first (a watch never grants reading)` };
        return ACL.notFound();
      }
      return { ok: true, adapterId: rec.id, rec, en, key: en.key, title: humanNameOf(rec, en) || en.id, grain: { kind: 'conversation', convId: en.id }, grainNow: () => convGrainOf(store.index.peek(en.key)), raw: () => { const e2 = store.index.peek(en.key) || {}; return { access: e2.access || [], watchers: e2.watchers || [] }; } };
    }
    const rec = adapterRecords().adapters.find((x) => x.id === r0);
    let mod = null; try { mod = rec ? registry.get(rec.kind) : null; } catch {}
    if (!rec || rec.enabled === false || (mod && mod.builtin)) return ACL.notFound();
    const acctReach = ACL.effective(ctx, { key: '\u0000', adapterId: rec.id }, (store.index.table('accountGrants') || []).filter((g) => g && g.scope && g.scope.kind === 'adapter' && g.scope.id === rec.id));
    const named = (effectiveForAccount(rec.id) || { access: [] }).access.some((x) => F.rowNames(x.row, ctx));
    if (!ACL.canSee(acctReach.level) && !named) {
      // the account is named in nothing this agent sees ⇒ the uniform not-found; else it is told what it lacks
      const seesSome = Object.values(store.index.live()).some((en) => en && en.adapterId === rec.id && ACL.canSee(reachFor(ctx, rec, en).level));   // B-f32b: a scan reads live(), never a copy of the index (composed at the 2.369.202 integration)
      return seesSome ? { ok: false, code: 'no-access', error: `you do not have access to the whole account ${rec.id} — watch one conversation you can read (<adapter>/<conversation id>), or ask the user for the account` } : ACL.notFound();
    }
    return { ok: true, adapterId: rec.id, rec, en: null, key: null, title: rec.label || rec.id, grain: { kind: 'account' }, grainNow: () => F.grainOf(accountGrainOf(rec.id), undefined, { inherited: accountGrantKeys(rec.id) }), raw: () => { const g = accountGrainOf(rec.id) || {}; return { access: g.access || [], watchers: g.watchers || [] }; } };
  }
  /** The keywords → the watch's inline filter (any of them); none = every new message. */
  function watchFilterOf(keywords) {
    const kws = (Array.isArray(keywords) ? keywords : []).map((x) => String(x || '').trim()).filter(Boolean).slice(0, 10);
    if (!kws.length) return { ok: true, filter: null };
    const fv = F.validateFilter({ match: 'any', rules: kws.map((value) => ({ kind: 'keyword', value })) });
    return fv.ok ? { ok: true, filter: fv.filter, keywords: kws } : { ok: false, code: 'bad-filter', error: fv.error };
  }
  /**
   * W1 — `vibespace-channels watch <conv|account> [--mode next-turn|wake] [--keyword …]`: the agent's OWN notification on
   * a grain it can read. `next-turn` (free) is written at once — ONE row per (agent, grain) with `origin:'agent'`, never
   * over a row the user set for it (widen-only: the user's row stays, said); `wake` (a billed turn) is NOT the agent's
   * to grant — it files ONE request the user approves with one click (For you; the same decide route as an access
   * request), naming exactly what Approve writes (grain, mode, keywords, the daily cap it asks for).
   */
  async function agentWatch(ctx, ref, { delivery = 'next-turn', keywords = [], dailyWakeCap = null, why = '' } = {}) {
    if (!ctx || ctx.kind !== 'agent' || !ctx.id) return ACL.notFound();
    const d = delivery === undefined || delivery === null || delivery === '' ? 'next-turn' : delivery;
    if (!F.DELIVERY_MODES.includes(d)) return { ok: false, code: 'bad-request', error: '--mode must be next-turn (free: the news rides your next turn) or wake (a billed turn now — the user approves it)' };
    const tg = watchTargetOf(ctx, ref);
    if (!tg.ok) return tg;
    const fl = watchFilterOf(keywords);
    if (!fl.ok) return fl;
    const principal = { kind: 'agent', id: ctx.id, name: ctx.name || null };
    const pk = pkOf(principal);
    const cur = tg.grainNow();
    const mine = cur.watchers.find((w) => pkOf(w.principal) === pk);
    if (mine && F.watchOriginOf(mine) === 'user') {
      return { ok: true, already: true, setBy: 'user', delivery: F.deliveryModeOf(mine), notify: mine.notify, target: tg.key || tg.adapterId,
        note: `the user already notifies you here (${F.deliveryModeOf(mine) === 'next-turn' ? 'on your next turn' : mine.notify === 'digest' ? 'a digest' : 'a wake'}) — that row is theirs; nothing was changed` };
    }
    // verify r1 F1: the USER removed this agent's own row here (Notify…'s whole-list save) — the removal STICKS: a direct
    // re-registration is refused by name; a `wake` ask may still be filed (the user decides; their Approve lifts the mark)
    const scopeW = tg.key ? { kind: 'conversation', id: tg.key } : { kind: 'adapter', id: tg.adapterId };
    const blk = agentWatchBlockOf(scopeW, pk);
    if (blk && d !== 'wake') return { ok: false, code: 'removed-by-user', error: `the user removed your notification on ${tg.key ? agentId(tg.key) : tg.adapterId} (${new Date(blk.at).toISOString().slice(0, 16).replace('T', ' ')} UTC) — it is theirs to restore: ask them (vibespace-ask), or file a wake ask (--mode wake) they approve; re-registering it yourself is refused` };
    // verify r1 F2: a bound on the rows one agent may hold of its OWN across every grain, said with the count
    if (!(mine && F.watchOriginOf(mine) === 'agent') && agentWatchCount(pk) >= F.MAX_AGENT_WATCHES) return { ok: false, code: 'watch-limit', error: `you already hold ${F.MAX_AGENT_WATCHES} notifications of your own (the limit) — \`vibespace-channels unwatch <conv>\` frees one; the user can set more for you in Notify…` };
    const cap = dailyWakeCap === null || dailyWakeCap === undefined || dailyWakeCap === '' ? F.DEFAULT_DAILY_WAKE_CAP : Number(dailyWakeCap);
    const row = { principal, origin: 'agent', delivery: d, notify: 'wake', mode: fl.filter ? 'filtered' : 'all', ...(fl.filter ? { filter: fl.filter } : {}), dailyWakeCap: Number.isFinite(cap) ? Math.max(1, Math.min(F.MAX_DAILY_WAKE_CAP, Math.round(cap))) : F.DEFAULT_DAILY_WAKE_CAP };
    if (d === 'wake') return fileWatchRequest(ctx, tg, row, why);
    // the grain AS READ (the legacy lift + the access rule applied) minus this agent's row, plus the new one
    const r = await setGrain(tg.adapterId, tg.grain, { watchers: [...cur.watchers.filter((w) => w && pkOf(w.principal) !== pk), row] }, { by: `agent:${ctx.id}` });
    if (!r || !r.ok) return r;
    try { store.audit({ kind: 'acl', op: 'agent-watch', principal, scope: tg.key ? { kind: 'conversation', id: tg.key } : { kind: 'adapter', id: tg.adapterId }, delivery: d, keywords: fl.keywords || [], at: now(), by: 'agent' }); } catch {}
    return { ok: true, set: true, delivery: d, target: tg.key ? agentId(tg.key) : tg.adapterId, title: tg.key ? agentTitle(tg.en, tg.en.id) : tg.title, keywords: fl.keywords || [], replaced: !!mine };
  }
  /** W1: `unwatch` removes ONLY the agent's own row (`origin:'agent'`) at that grain — the user's rows are theirs. */
  async function agentUnwatch(ctx, ref) {
    if (!ctx || ctx.kind !== 'agent' || !ctx.id) return ACL.notFound();
    const tg = watchTargetOf(ctx, ref);
    if (!tg.ok && tg.code !== 'no-access') return tg;
    const r0 = String(ref || '').trim();
    const i = r0.indexOf('/');
    const en0 = tg.ok ? tg.en : (i > 0 ? convFor(r0.slice(0, i), r0.slice(i + 1)).en : null);
    const raw = tg.ok ? tg.raw() : { access: (en0 && en0.access) || [], watchers: (en0 && en0.watchers) || [] };
    const cur = tg.ok ? tg.grainNow() : convGrainOf(en0);
    const pk = pkOf({ kind: 'agent', id: ctx.id });
    const own = raw.watchers.find((w) => w && pkOf(w.principal) === pk && F.watchOriginOf(w) === 'agent');
    if (!own) return { ok: false, code: 'not-watching', error: 'nothing of yours to remove here — `vibespace-channels status` lists what notifies you (a notification the user set is theirs to remove)' };
    const adapterId = tg.ok ? tg.adapterId : r0.slice(0, i);
    const grain = tg.ok ? tg.grain : { kind: 'conversation', convId: r0.slice(i + 1) };
    const r = await setGrain(adapterId, grain, { watchers: cur.watchers.filter((w) => !(w && pkOf(w.principal) === pk && F.watchOriginOf(w) === 'agent')) }, { by: `agent:${ctx.id}` });
    if (!r || !r.ok) return r;
    try { store.audit({ kind: 'acl', op: 'agent-unwatch', principal: { kind: 'agent', id: ctx.id }, scope: grain.kind === 'conversation' ? { kind: 'conversation', id: `${adapterId}/${grain.convId}` } : { kind: 'adapter', id: adapterId }, at: now(), by: 'agent' }); } catch {}
    return { ok: true, removed: true };
  }
  /** verify r1 F1: the mark the USER's removal of an agent's own watch leaves — `agentWatchBlocks[scope|principal] = {at, by}`;
   *  written by setGrain on a user's whole-list save that drops an origin-agent row, lifted by a row the user writes or
   *  approves for that agent at that grain. */
  const blockKey = (scope, pk) => `${scope.kind}:${scope.id}|${pk}`;
  function agentWatchBlockOf(scope, pk) { const b = store.index.table('agentWatchBlocks');   // B-f32b: the live table, read-only (no copy)
    const k = blockKey(scope, pk); return b && typeof b === 'object' && b[k] ? b[k] : null; }
  /** verify r1 F2: how many rows of its OWN (origin agent) one agent holds across every grain. */
  function agentWatchCount(pk) {
    let n = 0;   // B-f32b: the live rows and tables, read-only — no copy of the index (composed at the 2.369.202 integration)
    const count = (ws) => { for (const w of Array.isArray(ws) ? ws : []) if (w && pkOf(w.principal) === pk && F.watchOriginOf(w) === 'agent') n++; };
    for (const en of Object.values(store.index.live())) count(en && en.watchers);
    for (const tb of ['accountAssignments', 'patternAssignments']) for (const g of Object.values(store.index.table(tb) || {})) count(g && g.watchers);
    return n;
  }
  function openWatchRequestsOf(pk) { return (store.index.table('watchRequests') || []).filter((r) => r && r.status === 'open' && r.principal && pkOf(r.principal) === pk); }
  /** W1: a WAKE watch is the user's money — ONE request with the frozen row, a For-you item whose Approve (the existing
   *  reach-request decide route) writes exactly it; a second ask while one is open is the same request. */
  async function fileWatchRequest(ctx, tg, row, why) {
    const t = now();
    const scope = tg.key ? { kind: 'conversation', id: tg.key } : { kind: 'adapter', id: tg.adapterId };
    const open = (store.index.table('watchRequests') || []).find((r) => r && r.status === 'open' && r.principal && r.principal.id === ctx.id && r.scope && r.scope.kind === scope.kind && r.scope.id === scope.id);
    if (open) return { ok: true, proposed: true, already: true, request: { id: open.id, status: open.status } };
    // verify r1 F2: a bound on the wake asks one agent may have waiting, said with the count; the owner reads the totals
    const pkR = pkOf(row.principal);
    const waiting = openWatchRequestsOf(pkR);
    if (waiting.length >= F.MAX_OPEN_WATCH_REQUESTS) return { ok: false, code: 'watch-request-limit', error: `${waiting.length} wake asks of yours are already waiting for the user — no more until they decide; --mode next-turn (free) needs no approval` };
    const own = agentWatchCount(pkR);
    const reason = String(why || '').trim().slice(0, 500);
    const kws = row.filter ? row.filter.rules.map((x) => x.value) : [];
    const req = { id: `wr-${t.toString(36)}-${crypto.randomBytes(3).toString('hex')}`, kind: 'watch', principal: row.principal, scope, adapterId: tg.adapterId, grain: tg.grain, watch: row, why: reason, at: t, status: 'open', todoId: null, decidedAt: null };
    if (userTodos && typeof userTodos.add === 'function') {
      try {
        const title = String(tg.title || tg.key || tg.adapterId).slice(0, 120);
        const where = tg.key ? title : `the whole account ${tg.rec.label || tg.adapterId}`;
        const what = kws.length ? `on messages with: ${kws.join(', ')}` : 'on every new message';
        const item = userTodos.add(INBOX_KEY, {
          origin: 'channels',
          text: `${ctx.name || ctx.id} asks to be woken by ${where}`,
          detail: `Approve writes: wake ${ctx.name || ctx.id} now (a billed turn) ${what} in ${where}, at most ${row.dailyWakeCap} wakes a day.${reason ? `\nReason: ${reason}` : ''}\nIt already has ${own} notifications of its own and ${waiting.length} wake asks waiting.\nDeny changes nothing. Without it, the agent can still ask for the news on its next turn (free).`,
          urgency: 'normal', by: 'agent', sessionName: 'Channels', action: { type: 'channel-watch-request', id: req.id },
          i18n: {
            text: { key: i18nKey('{agent} asks to be woken by {where}'), params: { agent: ctx.name || ctx.id, where } },
            detail: [
              { key: kws.length ? i18nKey('Approve writes: wake {agent} now (a billed turn) on messages with: {words} — in {where}, at most {cap} wakes a day.') : i18nKey('Approve writes: wake {agent} now (a billed turn) on every new message in {where}, at most {cap} wakes a day.'), params: { agent: ctx.name || ctx.id, words: kws.join(', '), where, cap: row.dailyWakeCap } },
              ...(reason ? [{ key: i18nKey('Reason: {reason}'), params: { reason } }] : []),
              { key: i18nKey('It already has {n} notifications of its own and {m} wake asks waiting.'), params: { n: own, m: waiting.length } },
              { key: i18nKey('Deny changes nothing. Without it, the agent can still ask for the news on its next turn (free).') },
            ],
            source: INBOX_SOURCE,
          },
        });
        if (item && item.id) req.todoId = item.id;
      } catch (e) {
        // verify r1 F2: the tray's own cap (20 open Channels items) refused the item — nothing is filed (it shipped: the
        // request was stored open with no item the user could ever decide, and the agent was told the tray showed it)
        log.warn(`[channels] ${scope.id}: could not file the watch request: ${(e && e.message) || e}`);
        return { ok: false, code: 'tray-full', error: `the user's For-you tray cannot take another Channels item right now (${String((e && e.message) || e).slice(0, 90)}) — nothing was filed; ask again later, or use --mode next-turn (free, no approval)` };
      }
    }
    // the table keeps at most 100 requests: DECIDED ones go first, an open one is never dropped (verify r1 F2)
    await store.index.update((ix) => { const list = Array.isArray(ix.watchRequests) ? ix.watchRequests : (ix.watchRequests = []); list.push(req); while (list.length > 100) { const i = list.findIndex((r) => !(r && r.status === 'open')); if (i < 0) break; list.splice(i, 1); } });
    try { store.audit({ kind: 'acl', op: 'watch-request', principal: req.principal, scope, delivery: 'wake', at: t, by: 'agent' }); } catch {}
    notify([]);
    return { ok: true, proposed: true, request: { id: req.id, status: 'open' }, dailyWakeCap: row.dailyWakeCap };
  }
  /** Approve = EXACTLY the frozen row, written through `setGrain` (the access rule re-judged now); deny = nothing. */
  async function decideWatchRequest(requestId, approve, by = 'user') {
    const req0 = (store.index.table('watchRequests') || []).find((r) => r && r.id === requestId);
    if (!req0) return { ok: false, code: 'not-found', error: 'No such request' };
    if (req0.status !== 'open') return { ok: false, code: 'bad-state', error: `request already ${req0.status}` };
    const t = now();
    if (approve) {
      const pk = pkOf(req0.principal);
      const en1 = req0.grain && req0.grain.kind === 'conversation' ? store.index.peek(`${req0.adapterId}/${req0.grain.convId}`) : null;
      if (req0.grain && req0.grain.kind === 'conversation' && !en1) return { ok: false, code: 'not-found', error: 'that conversation is gone' };
      const g = en1 ? convGrainOf(en1) : F.grainOf(accountGrainOf(req0.adapterId), undefined, { inherited: accountGrantKeys(req0.adapterId) });
      const others = g.watchers.filter((w) => w && pkOf(w.principal) !== pk);
      const w = await setGrain(req0.adapterId, req0.grain, { watchers: [...others, { ...req0.watch }] }, { by });
      if (!w || !w.ok) return w || { ok: false, code: 'error', error: 'the notification could not be written' };
    }
    let applied = false;
    await store.index.update((ix) => { const r2 = (Array.isArray(ix.watchRequests) ? ix.watchRequests : []).find((r) => r && r.id === requestId); if (!r2 || r2.status !== 'open') return; applied = true; r2.status = approve ? 'approved' : 'denied'; r2.decidedAt = t; r2.decidedBy = by; });
    if (!applied) return { ok: false, code: 'bad-state', error: 'request already decided (in another window, a moment ago)' };
    try { store.audit({ kind: 'acl', op: approve ? 'watch-approve' : 'watch-deny', principal: req0.principal, scope: req0.scope, requestId, at: t, by }); } catch {}
    if (req0.todoId && userTodos && typeof userTodos.get === 'function') {
      try { const it = userTodos.get(req0.todoId); if (it && it.status === 'open' && it.sessionKey === INBOX_KEY) userTodos.setStatus(req0.todoId, 'done', RESOLVED_BY); } catch {}
    }
    notify([]);
    return { ok: true, request: { ...req0, status: approve ? 'approved' : 'denied' } };
  }

  // ── the agent-facing reads (§11) — reach FIRST, uniform not-found ────────
  /** Every conversation this principal may SEE or REQUEST — hidden ones are
   *  simply absent (no oracle). Never a message body. */
  function listFor(ctx, { all = false } = {}) {
    const t = now();
    const recs = adapterRecords().adapters;
    const byId = new Map(recs.map((r) => [r.id, r]));
    const out = [];
    for (const en of Object.values(store.index.live())) {   // B-f32b: read-only — the rows are read, never kept or changed
      const rec = byId.get(en.adapterId);
      if (!rec || rec.enabled === false) continue;
      const reach = reachFor(ctx, rec, en);
      if (reach.level === 'hidden') {
        // lane channel-agent-watch W2: `list --all` — the account's directory names a conversation the agent may not
        // read: its TITLE (through the belt), kind, last activity and member COUNT, marked requestable; never a message,
        // never a participant's name
        if (all && directoryLists(rec, en)) {
          const members = String(en.participants || '').split(',').map((x) => x.trim()).filter(Boolean).length;
          out.push({ key: agentId(en.key), adapterId: en.adapterId, adapter: rec.label || rec.id, id: agentId(en.id), title: agentTitle(en, en.id), kind: en.kind, level: 'requestable', directory: true, lastAt: en.lastAt || null, members: members || null });
        }
        continue;
      }
      const c = registry.capsOf(rec.kind);
      const who = sendIdentityFor(rec, en, t);
      // R4: THE TWO FACTS SEPARATELY — the caller's access in effect here
      // (the finest grain naming it or its group; its authority clamped) and
      // whether a watcher of its wakes it
      const effL = effectiveFor(en);
      const acc = effL ? effL.access.filter((x) => F.rowNames(x.row, ctx)) : [];
      const wat = effL ? effL.watchers.filter((x) => F.rowNames(x.watcher, ctx)) : [];
      const capsL = acc.length ? authorityCapsFor(rec, en, t) : null;
      const authority = acc.length ? (acc.some((x) => F.effectiveAuthority(x.row, capsL).authority === 'send') ? 'send' : 'draft') : null;
      out.push({
        key: agentId(en.key), adapterId: en.adapterId, adapter: rec.label || rec.id, id: agentId(en.id), title: agentTitle(en, en.id), kind: en.kind,   // verify r1 F2: the title through the belt; r3 F6: the key + id
        level: reach.level, unread: en.unread || 0, lastAt: en.lastAt || null, polledAt: (en.lane && en.lane.lastPollAt) || null,
        canSend: !!who.as, sendWhy: who.why, sendAs: who.as, identityMarking: c.identityMarking,
        policy: policyFor(rec, en).mode,
        access: acc.length ? { authority, via: acc[0].source, as: acc[0].row.principal.kind } : null,
        watched: wat.length ? { notify: wat[0].watcher.notify, mode: wat[0].watcher.mode, via: wat[0].source, as: wat[0].watcher.principal.kind, delivery: F.deliveryModeOf(wat[0].watcher), setBy: F.watchOriginOf(wat[0].watcher) } : null,
        // the pre-R4 names (a CLI older than this server reads them)
        assigned: acc.length > 0, assignedVia: acc.length ? acc[0].source : null, authority,
        awaiting: proposalsFor(en.key).filter((p) => p.state === 'awaiting-approval' && p.draftedBy && p.draftedBy.id === ctx.id).length,
      });
    }
    out.sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
    return { ok: true, conversations: out };
  }
  function readFor(ctx, adapterId, convId, { limit = 50, since = null } = {}) {
    const { en, rec } = convFor(adapterId, convId);
    if (!en || !rec || rec.enabled === false) return ACL.notFound();
    if (!ACL.canSee(reachFor(ctx, rec, en).level)) return ACL.notFound();
    const n = Math.min(200, Math.max(1, Number(limit) || 50));
    let records = store.readTail(adapterId, convId, { limit: n });
    // the read is of the TAIL: whatever `since` filters out, the agent has now seen up to the newest record
    const upTo = records.length ? Number(records[records.length - 1].at) || 0 : 0;
    if (since !== null && Number.isFinite(Number(since))) records = records.filter((r) => Number(r.at) > Number(since));
    // R3 (§23): the first screen lists a conversation an agent just read — stamped AFTER the reach check
    // (a hidden read never stamps: the same uniform not-found, no trace), off the answer's path
    stampAgentRead(en.key, ctx, upTo);
    // §25: an agent reads `text` — the render tree is for the eye only (never a second copy of the body in its context)
    // lane channel-threads (§5.1 / §6.4): the agent's copy — no tree, the place as words, reactions WITHOUT `by`
    return { ok: true, conversation: { key: agentId(en.key), adapterId, id: agentId(convId), title: agentTitle(en, convId), polledAt: (en.lane && en.lane.lastPollAt) || null }, records: withView(rec, records, { convId, agent: true }) };   // verify r1 F2: the title through the belt; r3 F6: the key + id
  }
  /**
   * STAMP AN AGENT'S READ (R3 §23 — the owner: "某个agent刚刚读取了的"): `en.
   * agentReads` = one row per principal `{id, kind, name, at, upTo}` (the
   * newest AGENT_READS_MAX principals), persisted through the index's ONE
   * door (the debounced flush) and said in a PARTIAL broadcast of this one
   * row. A re-read of the same tail by the same principal inside
   * AGENT_READ_RESTAMP_MS is not news: no write, no broadcast (an agent's
   * read loop is not a broadcast loop). Fire-and-forget: the answer never
   * waits for it, a failed write is logged.
   */
  const AGENT_READS_MAX = 5;
  const AGENT_READ_RESTAMP_MS = 60e3;
  function stampAgentRead(key, ctx, upTo) {
    if (!ctx || !ctx.id) return;
    const t = now();
    const cur = store.index.peek(key);
    const mine = cur && Array.isArray(cur.agentReads) ? cur.agentReads.find((r) => r && r.id === ctx.id) : null;
    if (mine && Number(mine.upTo) === Number(upTo) && t - (Number(mine.at) || 0) < AGENT_READ_RESTAMP_MS) return;
    let wrote = false;
    Promise.resolve(store.index.update(() => {
      const i = key.indexOf('/');
      const en = store.index.entry(key.slice(0, i), key.slice(i + 1), { create: false });
      if (!en) return;
      const rows = (Array.isArray(en.agentReads) ? en.agentReads : []).filter((r) => r && r.id !== ctx.id);
      rows.unshift({ id: String(ctx.id), kind: ctx.kind || 'agent', name: ctx.name ? String(ctx.name).slice(0, 80) : null, at: t, upTo: Number(upTo) || 0 });
      rows.sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0));
      en.agentReads = rows.slice(0, AGENT_READS_MAX);
      wrote = true;
    })).then(() => { if (wrote && !stopped) notify([key]); }).catch((err) => log.warn(`[channels] ${key}: the agent read was not stamped: ${(err && err.message) || err}`));
  }
  /**
   * THE AGENT'S THREAD READ (spec §5.1, `GET /api/agent/channels/read?conv=&thread=<msg>`): reach first (the uniform
   * not-found), then the LOCAL fold of that thread — an agent NEVER triggers a thread walk (a vendor call) from a
   * read: a `separate` listing never walked answers `walked:false` and says so; `refresh --thread` is the only door
   * (its floor + the agent's share + the budget). The agent's copy: no tree, the place as words, no `by`.
   */
  function readThreadFor(ctx, adapterId, convId, msg, { limit = 50 } = {}) {
    const { en, rec } = convFor(adapterId, convId);
    if (!en || !rec || rec.enabled === false) return ACL.notFound();
    if (!ACL.canSee(reachFor(ctx, rec, en).level)) return ACL.notFound();
    const r = threadRead(adapterId, convId, msg, { limit, agent: true });
    if (!r || !r.ok) return r && r.code === 'not-supported' ? r : ACL.notFound();
    const th = r.thread || {};
    const recs = r.records || [];
    return {
      ok: true,
      conversation: { key: agentId(en.key), adapterId, id: agentId(convId), title: agentTitle(en, convId), polledAt: (en.lane && en.lane.lastPollAt) || null },   // verify r2 F4: the thread READ's title (printed by `read --thread`) through the belt — r1 F2 took the thread REFRESH's; r3 F6: the key + id
      thread: { key: agentId(th.key || null), count: Number(th.count) || 0, lastAt: th.lastAt || null, walked: !!th.walked },   // verify r3 F6: the thread key (printed on the head line) as a line piece
      records: recs,
      ...(r.code === 'not-a-thread' ? { note: `(${NOT_A_THREAD})` } : th.walked ? {} : { note: '(thread not loaded here — the user\'s window loads it; ask again after)' }),
    };
  }
  /** Own proposals only — somebody else's id is the same uniform not-found. */
  function statusFor(ctx, proposalId = null) {
    const mine = proposalsFor().filter((p) => p.draftedBy && p.draftedBy.kind === 'agent' && ctx && p.draftedBy.id === ctx.id);
    if (proposalId) {
      const p = mine.find((x) => x.id === proposalId);
      if (!p) return { ok: false, code: 'not-found', error: 'no such proposal (not found, or not yours)' };
      return { ok: true, proposal: agentProposalView(ctx, p) };
    }
    return { ok: true, proposals: mine.slice(0, 50).map((p) => agentProposalView(ctx, p)) };
  }

  // ── the verbs ─────────────────────────────────────────────────────────────
  // R4 (2026-09-27): TWO OPERATIONS PER GRAIN, ACCESS FIRST. `setAccess`
  // writes a grain's ACCESS list (who may see and act, with an authority),
  // `setWatchers` its WATCHERS list (who is woken, and on what). A watcher's
  // principal must hold access at the same grain — refused by name
  // otherwise (`watcher-needs-access`); removing a principal's access removes
  // its watcher in the same write. `setGrain` writes both (and a rule's
  // pattern) in ONE index update. The pre-split single-assignment verbs
  // (`setAssignment` / `setScopeAssignment`) are the COMPATIBILITY WRITE:
  // one principal ⇒ one access row + one watcher row, replacing both lists.
  // Reach follows access: one visible grant per access row (origin
  // `access`) — a conversation's on its entry, the account's in
  // `accountGrants`, a rule's derived at read time — and a removed row takes
  // exactly its own grant with it, never a hand-written one.
  /** Where a grain lives + the two caps `authority:'send'` is checked
   *  against there. `grain` = `{kind:'conversation', convId}` |
   *  `{kind:'account'}` | `{kind:'pattern', id?}` (no id = a NEW rule). */
  function grainSite(adapterId, grain, t = now()) {
    const rec = adapterRecords().adapters.find((r) => r.id === adapterId);
    const kind = grain && grain.kind;
    if (kind === 'conversation') {
      if (!rec || !known(adapterId, grain.convId)) return { ok: false, code: 'not-found', error: 'No such conversation' };
      const key = `${adapterId}/${grain.convId}`;
      const en = store.index.peek(key);
      return { ok: true, rec, kind, key, id: key, convId: grain.convId, caps: authorityCapsFor(rec, en, t), holder: en, scope: { kind: 'conversation', id: key } };
    }
    if (!rec) return { ok: false, code: 'not-found', error: `no such account '${adapterId}'` };
    const c = registry.capsOf(rec.kind);
    const scopeCaps = { offersSend: (c.sendAs || []).length > 0, sendWhy: (c.sendAs || []).length ? null : 'read-only-adapter', policyRequiresReview: policyRequiresReview(rec, null) };
    if (kind === 'account') return { ok: true, rec, kind, id: adapterId, caps: scopeCaps, holder: accountGrainOf(adapterId), scope: { kind: 'adapter', id: adapterId } };
    if (kind === 'pattern') {
      if (grain.id) {
        const pa = patternById(grain.id);
        if (!pa || pa.adapterId !== adapterId) return { ok: false, code: 'not-found', error: 'no such rule' };
        return { ok: true, rec, kind, id: pa.id, caps: scopeCaps, holder: pa, scope: { kind: 'pattern', id: pa.id } };
      }
      const id = `pa-${t.toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
      return { ok: true, rec, kind, id, caps: scopeCaps, holder: null, isNew: true, scope: { kind: 'pattern', id } };
    }
    return { ok: false, code: 'bad-request', error: 'grain.kind must be conversation|account|pattern' };
  }
  /** The id a watcher's INLINE filter is stored under — minted BEFORE the
   *  validator runs (the 2026-09-26 hotfix: a filtered row carrying its
   *  filter was refused for the very id this request supplies). One per
   *  (grain, principal); a watcher kept by the same principal keeps its id. */
  function inlineFilterIdFor(site, pk, prevWatcher) {
    if (prevWatcher && prevWatcher.filterId && /^f-/.test(prevWatcher.filterId)) return prevWatcher.filterId;
    return site.kind === 'conversation' ? `f-${site.key}|${pk}` : `f-${site.kind}-${site.id}|${pk}`;
  }
  const estimateOf = (e, t) => (e && typeof e === 'object' ? { matchedPerDay: Number(e.matchedPerDay) || 0, totalPerDay: Number(e.totalPerDay) || 0, windowDays: Number(e.windowDays) || 7, sampled: !!e.sampled, truncated: !!e.truncated, conversations: Number(e.conversations) || 0, at: t } : null);
  /**
   * WRITE ONE GRAIN — `patch` = `{access?, watchers?, pattern?}` (an absent
   * key keeps the stored list). Validates the ACCESS list, then every
   * watcher against the resulting access (a watcher whose principal lost its
   * access goes with it), mints inline filter ids first, applies the diff by
   * principal in ONE index update (a kept row keeps its createdAt, its
   * estimate and — a watcher — its pace ledger), writes / removes exactly the
   * reach rows the access diff names, audits every change, clears the wake
   * windows of the watchers that changed, prunes pending hits nobody waits
   * for any more, broadcasts.
   */
  async function setGrain(adapterId, grain, patch = {}, { by = 'user' } = {}) {
    const t = now();
    const site = grainSite(adapterId, grain, t);
    if (!site.ok) return site;
    const { rec, kind } = site;
    const cur = site.kind === 'conversation' ? convGrainOf(site.holder) : F.grainOf(site.holder);
    const p = patch && typeof patch === 'object' ? patch : {};
    // mirror-193: a dialog's whole-list write carries the STAMP of the lists it drew (`base`); a grain that moved
    // since — a route write its copy had not heard of, another window, an approval — is refused BY NAME and
    // nothing is written (never a newer grant silently replaced). No base = unconditional (agents, scripts).
    const bv = F.grainBaseVerdict(cur, p.base);
    if (!bv.ok) return bv;
    // the rule itself (a NEW rule needs one; an edit may change it)
    let pattern = site.holder && site.holder.pattern ? site.holder.pattern : null;
    if (kind === 'pattern' && (p.pattern !== undefined || site.isNew)) {
      const pv = F.validatePattern(p.pattern);
      if (!pv.ok) return { ok: false, code: 'bad-pattern', error: pv.error, why: pv.code, rule: pv.kind || null };
      pattern = pv.pattern;
    }
    // ① ACCESS
    let access = cur.access;
    if (p.access !== undefined) {
      const va = F.validateAccess(p.access === null ? [] : p.access, site.caps);
      if (!va.ok) return { ok: false, code: va.code, error: va.error, ...(va.why ? { why: va.why } : {}), ...(va.principal ? { principal: va.principal } : {}), ...(va.index !== undefined ? { index: va.index } : {}) };
      const prevA = new Map(cur.access.map((r) => [pkOf(r.principal), r]));
      access = va.access.map((r) => { const pr = prevA.get(pkOf(r.principal)); const same = pr && pr.authority === r.authority; return { ...r, createdAt: pr ? (pr.createdAt || t) : t, updatedAt: same ? (pr.updatedAt || pr.createdAt || t) : t, createdBy: pr ? (pr.createdBy || by) : by }; });
    }
    if (kind === 'pattern' && site.isNew && !access.length) return { ok: false, code: 'bad-access', error: 'a new rule needs at least one agent or group with access', why: 'principal' };
    const granted = new Set(access.map((r) => pkOf(r.principal)));
    // ② WATCHERS — against THIS grain's resulting access
    const prevW = new Map(cur.watchers.map((w) => [pkOf(w.principal), w]));
    let watchers;
    const filterWrites = [];   // [{id, filter, est}]
    if (p.watchers !== undefined) {
      const inList = Array.isArray(p.watchers) ? p.watchers : (p.watchers === null ? [] : p.watchers);
      if (!Array.isArray(inList)) return { ok: false, code: 'bad-watcher', error: 'watchers must be a list', why: 'not-an-object' };
      // mint each inline filter's id first, then validate (hotfix order)
      const minted = inList.map((w0) => {
        const w = w0 && typeof w0 === 'object' ? w0 : w0;
        if (!w || typeof w !== 'object') return w;
        const pk = pkOf(w.principal);
        if (w.filter && w.mode === 'filtered' && pk) return { ...w, filterId: inlineFilterIdFor(site, pk, prevW.get(pk)) };
        return w;
      });
      const vw = F.validateWatchers(minted, access, { inherited: siteInheritedOf(site) });   // lane channel-agent-watch W3: access here OR above
      if (!vw.ok) return { ok: false, code: vw.code, error: vw.error, ...(vw.why ? { why: vw.why } : {}), ...(vw.principal ? { principal: vw.principal } : {}), ...(vw.index !== undefined ? { index: vw.index } : {}) };
      watchers = [];
      for (let i = 0; i < vw.watchers.length; i++) {
        const w = vw.watchers[i];
        const src = minted[i] || {};
        const pk = pkOf(w.principal);
        if (w.mode === 'filtered') {
          if (src.filter) {
            const fv = F.validateFilter(src.filter);
            if (!fv.ok) return { ok: false, code: 'bad-filter', error: fv.error, why: fv.code, rule: fv.kind || null, principal: w.principal };
            filterWrites.push({ id: w.filterId, filter: fv.filter, est: estimateOf(src.estimateAtSet, t) });
          } else if (!filterFor(w.filterId)) return { ok: false, code: 'no-such-filter', error: `filter ${w.filterId} does not exist — save the filter first (or send it inline as \`filter\`)`, principal: w.principal };
        }
        const pw = prevW.get(pk);
        watchers.push({ ...w, createdAt: pw ? (pw.createdAt || t) : t, updatedAt: t, createdBy: pw ? (pw.createdBy || by) : by, estimateAtSet: estimateOf(src.estimateAtSet, t) || (pw ? pw.estimateAtSet || null : null), stats: pw && pw.stats ? pw.stats : { wakes: [], hits: [] } });
      }
    } else {
      // access removed ⇒ its watcher goes too (notification needs access) — unless access ABOVE this grain still holds it (W3)
      const keep = F.eligibleKeys({ access, inherited: siteInheritedOf(site) });
      watchers = cur.watchers.filter((w) => F.eligibleFor(keep, w.principal));
    }
    const beforeA = new Set(cur.access.map((r) => pkOf(r.principal)));
    const beforeW = new Set(cur.watchers.map((w) => pkOf(w.principal)));
    const removedA = cur.access.filter((r) => !granted.has(pkOf(r.principal)));
    const addedA = access.filter((r) => !beforeA.has(pkOf(r.principal)));
    const changedW = new Set([...beforeW].filter((pk) => { const nw = watchers.find((w) => pkOf(w.principal) === pk); const ow = prevW.get(pk); return !nw || JSON.stringify({ ...nw, stats: null, updatedAt: null }) !== JSON.stringify({ ...ow, stats: null, updatedAt: null }); }));
    const oldFilterIds = cur.watchers.map((w) => w.filterId).filter(Boolean);
    const empty = !access.length && !watchers.length;
    // verify r1 F1: a user's whole-list write that DROPS an agent's own row leaves a mark that agent cannot write over
    // (its `watch` there is refused by name); a row the user writes or approves for that agent here lifts it
    const byUser = !/^agent:/.test(String(by));
    const droppedAgent = byUser && p.watchers !== undefined ? cur.watchers.filter((w) => F.watchOriginOf(w) === 'agent' && !watchers.some((nw) => pkOf(nw.principal) === pkOf(w.principal))) : [];
    const liftBlocks = byUser ? watchers.map((w) => pkOf(w.principal)) : [];
    await store.index.update((ix) => {
      if (droppedAgent.length || liftBlocks.length) { const b = ix.agentWatchBlocks && typeof ix.agentWatchBlocks === 'object' ? ix.agentWatchBlocks : (ix.agentWatchBlocks = {}); for (const w of droppedAgent) b[blockKey(site.scope, pkOf(w.principal))] = { at: t, by }; for (const pk of liftBlocks) delete b[blockKey(site.scope, pk)]; }
      let holder;
      if (kind === 'conversation') {
        holder = store.index.entry(adapterId, site.convId, { create: false });
        if (!holder) return;
        healP2(holder);
        liftGrainInPlace(ix, holder, 'conversation');
        holder.access = access; holder.watchers = watchers;
        // THE GRANTS — one row per access principal with origin `access`; a
        // user's own grant on the same pair is a DIFFERENT row, never touched
        for (const r of removedA) { holder.reachEntries = ACL.removeGrant(holder.reachEntries, { principal: r.principal, scope: site.scope, origin: 'access' }); holder.reachEntries = ACL.removeGrant(holder.reachEntries, { principal: r.principal, scope: site.scope, origin: 'assignment' }); }
        for (const r of access) holder.reachEntries = ACL.applyGrant(holder.reachEntries, { principal: { kind: r.principal.kind, id: r.principal.id }, scope: site.scope, level: 'visible', origin: 'access', at: r.createdAt || t, by });
      } else {
        const tbName = kind === 'account' ? 'accountAssignments' : 'patternAssignments';
        const tb = ix[tbName] || (ix[tbName] = {});
        if (empty && kind === 'account') { delete tb[site.id]; holder = null; }
        else {
          holder = tb[site.id] ? liftGrainInPlace(ix, tb[site.id], kind) : (tb[site.id] = { adapterId, scope: { kind, id: site.id }, createdAt: t, createdBy: by });
          holder.adapterId = adapterId; holder.scope = { kind, id: site.id }; holder.updatedAt = t;
          if (kind === 'pattern') { holder.id = site.id; holder.pattern = pattern; }
          holder.access = access; holder.watchers = watchers;
        }
        if (kind === 'account') {
          let g = Array.isArray(ix.accountGrants) ? ix.accountGrants : [];
          for (const r of removedA) { g = ACL.removeGrant(g, { principal: r.principal, scope: site.scope, origin: 'access' }); g = ACL.removeGrant(g, { principal: r.principal, scope: site.scope, origin: 'assignment' }); }
          for (const r of access) g = ACL.applyGrant(g, ACL.accountGrant({ principal: { kind: r.principal.kind, id: r.principal.id, name: r.principal.name || null }, adapterId, at: r.createdAt || t, by }));
          ix.accountGrants = g;
        }
      }
      for (const fw of filterWrites) { const fp = filtersOf(ix)[fw.id] || null; filtersOf(ix)[fw.id] = { id: fw.id, ...fw.filter, createdAt: fp ? fp.createdAt : t, updatedAt: t, estimateAtSet: fw.est || (fp ? fp.estimateAtSet : null) || null }; }
      // a filter this grain minted and nothing references any more goes
      for (const fid of oldFilterIds) if (/\|/.test(fid) || /^f-(account|pattern)-/.test(fid)) { if (!filterReferenced(ix, fid)) delete filtersOf(ix)[fid]; }
    });
    // every changed watcher's wake windows (its held hits stay pending — the
    // new shape delivers them, or the prune below drops the orphans)
    for (const pk of changedW) { clearWakeTimer(kind === 'conversation' ? `${site.key}|${pk}` : `scope:${kind === 'account' ? 'acct' : 'pat'}:${site.id}|${pk}`); }
    await prunePending(adapterId, kind === 'conversation' ? site.key : null);
    for (const r of removedA) auditGrant('revoke', r.principal, site, t, by);
    for (const r of addedA) auditGrant('grant', r.principal, site, t, by);
    for (const pk of changedW) { const nw = watchers.find((w) => pkOf(w.principal) === pk); try { store.audit({ kind: 'watch', op: nw ? 'set' : 'unset', principal: (nw || prevW.get(pk)).principal, scope: site.scope, notify: nw ? nw.notify : null, at: t, by }); } catch {} }
    for (const w of watchers) if (!beforeW.has(pkOf(w.principal))) { try { store.audit({ kind: 'watch', op: 'set', principal: w.principal, scope: site.scope, notify: w.notify, at: t, by }); } catch {} }
    if (kind === 'conversation') notify([site.convId]); else notify([], { full: true });
    return { ok: true, ...grainAnswer(rec, site, t) };
  }
  function auditGrant(op, principal, site, t, by) {
    try { store.audit({ kind: 'acl', op, principal, scope: site.scope, level: op === 'grant' ? 'visible' : null, origin: 'access', at: t, by }); } catch {}
  }
  /** Does any watcher, conversation filter or rule still name `fid`? */
  function filterReferenced(ix, fid) {
    for (const en of Object.values(ix.conversations || {})) {
      if (!en) continue;
      if (en.filterId === fid) return true;
      if ((Array.isArray(en.watchers) ? en.watchers : []).some((w) => w && w.filterId === fid)) return true;
      if (en.assignment && en.assignment.filterId === fid) return true;
    }
    for (const tbName of ['accountAssignments', 'patternAssignments']) for (const g of Object.values(ix[tbName] || {})) if (g && ((g.filterId === fid) || (Array.isArray(g.watchers) && g.watchers.some((w) => w && w.filterId === fid)))) return true;
    return false;
  }
  /** Pending hits wait for a WATCHER; one no watcher in effect names any more
   *  (it was removed, or its principal lost access) would sit in the count
   *  for ever — dropped here, after a grain changed. `onlyKey` narrows the
   *  scan to one conversation (the conversation grain). */
  async function prunePending(adapterId, onlyKey = null) {
    const drop = [];
    for (const en of Object.values(store.index.live())) {
      if (!en || en.adapterId !== adapterId || (onlyKey && en.key !== onlyKey)) continue;
      const hasTagged = Array.isArray(en.pending) && en.pending.some((x) => x && x.for);
      const hasElided = en.pendingElidedBy && Object.keys(en.pendingElidedBy).length;
      const hasUntagged = (Array.isArray(en.pending) && en.pending.some((x) => x && !x.for)) || Number(en.pendingElided) > 0;
      if (!hasTagged && !hasElided && !hasUntagged) continue;
      const eff = wakeEffOf(en);   // a fan-out target's hits wait only while its conversation runs
      const live = new Set(eff ? eff.watchers.map((x) => pkOf(x.watcher.principal)) : []);
      const gone = new Set([...(en.pending || []).map((x) => x && x.for).filter(Boolean), ...Object.keys(en.pendingElidedBy || {})].filter((pk) => !live.has(pk)));
      if (gone.size || (hasUntagged && !live.size)) drop.push({ key: en.key, gone, untagged: hasUntagged && !live.size });
    }
    if (!drop.length) return;
    await store.index.update((ix) => {
      for (const d of drop) {
        const e2 = ix.conversations[d.key];
        if (!e2) continue;
        healP2(e2);
        e2.pending = e2.pending.filter((x) => !(x && ((x.for && d.gone.has(x.for)) || (!x.for && d.untagged))));
        for (const pk of d.gone) delete e2.pendingElidedBy[pk];
        if (d.untagged) e2.pendingElided = 0;
      }
    });
  }
  /** What every grain verb answers: the grain's two lists as the dialogs read
   *  them (+ `assignment`, the pre-split summary a legacy caller reads). */
  function grainAnswer(rec, site, t) {
    if (site.kind === 'conversation') {
      const en = store.index.peek(site.key);
      const g = convGrainOf(en);
      const capsNow = authorityCapsFor(rec, en, t);
      return { grain: { kind: 'conversation', id: site.key }, access: g.access.map((r) => accessRowView(r, capsNow)), watchers: g.watchers.map((w) => watcherView(w, t)), assignment: assignmentView(rec, en, t) };
    }
    const holder = site.kind === 'account' ? accountGrainOf(rec.id) : patternById(site.id);
    const v = holder ? grainView(rec, holder, t) : null;
    return { grain: { kind: site.kind, id: site.id }, access: v ? v.access : [], watchers: v ? v.watchers : [], assignment: v };
  }
  /** GRANT ACCESS — the first operation: a grain's whole ACCESS list. */
  function setAccess(adapterId, grain, list, opts = {}) { return setGrain(adapterId, grain, { access: list, ...(opts && opts.base !== undefined ? { base: opts.base } : {}) }, opts); }
  /** NOTIFY — the second operation: a grain's whole WATCHERS list; every
   *  principal must already hold access there. */
  function setWatchers(adapterId, grain, list, opts = {}) { return setGrain(adapterId, grain, { watchers: list, ...(opts && opts.base !== undefined ? { base: opts.base } : {}) }, opts); }
  /** REMOVE a rule (its access rows, its watchers, its derived reach). */
  async function removePattern(adapterId, id, { by = 'user' } = {}) {
    const pa = patternById(id);
    if (!pa || pa.adapterId !== adapterId) return { ok: false, code: 'not-found', error: 'no such rule' };
    const t = now();
    const g = F.grainOf(pa);
    await store.index.update((ix) => { const tb = ix.patternAssignments || {}; const fids = g.watchers.map((w) => w.filterId).filter(Boolean); delete tb[id]; for (const fid of fids) if (/^f-pattern-/.test(fid) && !filterReferenced(ix, fid)) delete filtersOf(ix)[fid]; });
    for (const w of g.watchers) clearWakeTimer(`scope:pat:${id}|${pkOf(w.principal)}`);
    await prunePending(adapterId);
    for (const r of g.access) auditGrant('revoke', r.principal, { scope: { kind: 'pattern', id } }, t, by);
    notify([], { full: true });
    return { ok: true, removed: true, id };
  }

  /** THE COMPATIBILITY WRITE (conversation grain): `{…assignment}` ⇒ ONE
   *  access row + ONE watcher row for its principal, replacing both lists;
   *  `null` clears both. Validated by the pre-split validator (its defaults
   *  and refusals are unchanged). */
  async function setAssignment(adapterId, convId, input) {
    if (!known(adapterId, convId)) return { ok: false, code: 'not-found', error: 'No such conversation' };
    if (input === null) return setGrain(adapterId, { kind: 'conversation', convId }, { access: [], watchers: [] });
    const rec = adapterRecords().adapters.find((r) => r.id === adapterId);
    const t = now();
    const key = `${adapterId}/${convId}`;
    const en = store.index.peek(key);
    const b = input && typeof input === 'object' ? input : {};
    const cur = convGrainOf(en);
    const prevW = cur.watchers.find((w) => b.principal && pkOf(w.principal) === pkOf(b.principal));
    const inlineFilterId = b.filter && b.mode === 'filtered' && pkOf(b.principal) ? inlineFilterIdFor({ kind: 'conversation', key }, pkOf(b.principal), prevW) : null;
    const v = F.validateAssignment({ ...b, ...(inlineFilterId ? { filterId: inlineFilterId } : {}) }, authorityCapsFor(rec, en, t));
    if (!v.ok) return { ok: false, code: v.code || 'bad-assignment', error: v.error, ...(v.code ? {} : { why: v.why || null }) };
    if (v.assignment.mode === 'filtered' && !inlineFilterId && !filterFor(v.assignment.filterId)) return { ok: false, code: 'no-such-filter', error: `filter ${v.assignment.filterId} does not exist — save the filter first` };
    const sp = F.splitAssignment(v.assignment);
    return setGrain(adapterId, { kind: 'conversation', convId }, { access: [sp.access], watchers: [{ ...sp.watcher, ...(inlineFilterId ? { filter: b.filter } : {}), estimateAtSet: b.estimateAtSet || null }] });
  }

  /** THE COMPATIBILITY WRITE (account / rule grains): the pre-split single
   *  assignment ⇒ one access row + one watcher row (the rule's `pattern`
   *  rides along); `null` clears the account's lists / removes the rule.
   *  The inline filter's id is minted before the validator (the 2026-09-26
   *  hotfix), and a refusal carries the validator's closed code. */
  async function setScopeAssignment(adapterId, scope, input) {
    const rec = adapterRecords().adapters.find((r) => r.id === adapterId);
    if (!rec) return { ok: false, code: 'not-found', error: `no such account '${adapterId}'` };
    const kind = scope && scope.kind;
    if (kind !== 'account' && kind !== 'pattern') return { ok: false, code: 'bad-assignment', error: 'scope.kind must be account|pattern (a conversation is assigned on its own route)' };
    if (input === null) return kind === 'account' ? setGrain(adapterId, { kind: 'account' }, { access: [], watchers: [] }) : (scope.id ? removePattern(adapterId, scope.id) : { ok: false, code: 'not-found', error: 'no such rule' });
    const b = input && typeof input === 'object' ? input : {};
    const t = now();
    const site = grainSite(adapterId, kind === 'account' ? { kind } : { kind, id: scope.id || null }, t);
    if (!site.ok) return site;
    const cur = F.grainOf(site.holder);
    const prevW = cur.watchers.find((w) => b.principal && pkOf(w.principal) === pkOf(b.principal));
    const inlineFilterId = b.filter && b.mode === 'filtered' && pkOf(b.principal) ? inlineFilterIdFor(site, pkOf(b.principal), prevW) : null;
    const v = F.validateAssignment({ ...b, ...(inlineFilterId ? { filterId: inlineFilterId } : {}), scope: { kind, id: site.id } }, site.caps);
    if (!v.ok) return { ok: false, code: v.code || 'bad-assignment', error: v.error, ...(v.code ? {} : { why: v.why || null }) };
    if (v.assignment.mode === 'filtered' && !inlineFilterId && !filterFor(v.assignment.filterId)) return { ok: false, code: 'no-such-filter', error: 'a filtered assignment needs its filter (send `filter` with the assignment)' };
    const sp = F.splitAssignment(v.assignment);
    const r = await setGrain(adapterId, kind === 'account' ? { kind } : { kind, id: site.isNew ? null : site.id }, { access: [sp.access], watchers: [{ ...sp.watcher, ...(inlineFilterId ? { filter: b.filter } : {}), estimateAtSet: b.estimateAtSet || null }], ...(kind === 'pattern' ? { pattern: b.pattern } : {}) });
    if (r && r.ok && r.assignment && kind === 'pattern') r.assignment = { ...r.assignment, scope: { kind: 'pattern', id: r.grain.id } };
    return r;
  }

  /** Every grain naming this agent (itself or one of its groups) on every
   *  account — what `vibespace-channels status` prints: the grain, the
   *  access authority, and the watcher (or none — access only). */
  function accessFor(ctx) {
    const out = [];
    const t = now();
    for (const rec of adapterRecords().adapters) {
      if (rec.enabled === false) continue;
      const label = rec.label || rec.id;
      const push = (grain, g, extra = {}) => {
        for (const r of g.access) {
          if (!F.rowNames(r, ctx)) continue;
          const w = g.watchers.find((x) => pkOf(x.principal) === pkOf(r.principal)) || null;
          out.push({ adapterId: rec.id, adapter: label, grain, ...extra, via: r.principal.kind, as: { kind: r.principal.kind, id: r.principal.id, name: r.principal.name || null }, authority: r.authority, watched: w ? { notify: w.notify, mode: w.mode, digestMinutes: w.digestMinutes, dailyWakeCap: w.dailyWakeCap, receiptWake: !!w.receiptWake, wakes24h: ledgerView(w.stats, t).wakes24h } : null });
        }
      };
      const acct = accountGrainOf(rec.id);
      if (acct) push('account', F.grainOf(acct));
      for (const pa of patternsOf(rec.id)) push('pattern', F.grainOf(pa), { patternId: pa.id, rule: F.patternSummary(pa.pattern) });
      for (const en of Object.values(store.index.live())) if (en && en.adapterId === rec.id) { const g = convGrainOf(en); if (g.access.length) push('conversation', g, { key: agentId(en.key), title: agentTitle(en, en.id) }); }   // verify r3 F6: the key as a line piece; verify r2 F4: the seventh title answer (`vibespace-channels status` prints it before the next row) through the belt
    }
    return { ok: true, access: out };
  }

  /**
   * THE HONEST ESTIMATE OVER A SCOPE (§7.3, before saving): the conversations
   * a watcher of this grain would be woken by — for a rule, the ones it
   * matches; with `principal` (R4), minus the ones where that principal is
   * watched at a FINER grain (its own watcher on the conversation, or — for
   * the account — on a rule that matches it) — their logs read with a bound
   * per conversation and in total — `sampled` whenever a bound was hit or
   * not every conversation was covered — then folded through notify and the
   * daily cap.
   */
  function estimateScope(adapterId, scope, { filter = null, pattern = null, notify: how = 'wake', digestMinutes = F.DEFAULT_DIGEST_MINUTES, dailyWakeCap = F.DEFAULT_DAILY_WAKE_CAP, principal = null } = {}) {
    const rec = adapterRecords().adapters.find((r) => r.id === adapterId);
    if (!rec) return { ok: false, code: 'not-found', error: `no such account '${adapterId}'` };
    let f = null;
    if (filter !== null && filter !== undefined) { const v = F.validateFilter(filter); if (!v.ok) return { ok: false, code: 'bad-filter', error: v.error, why: v.code, rule: v.kind || null }; f = v.filter; }
    let pat = null;
    if (scope && scope.kind === 'pattern') { const pv = F.validatePattern(pattern); if (!pv.ok) return { ok: false, code: 'bad-pattern', error: pv.error, why: pv.code, rule: pv.kind || null }; pat = pv.pattern; }
    const pk = principal ? pkOf(principal) : null;
    const finer = (en) => {
      if (!pk) return false;
      if (convGrainOf(en).watchers.some((w) => pkOf(w.principal) === pk)) return true;
      if (scope && scope.kind === 'account') return patternsOf(adapterId).some((pa) => F.grainOf(pa).watchers.some((w) => pkOf(w.principal) === pk) && F.matchConversation(pa.pattern, convFacts(en)).hit);
      return false;
    };
    const convs = Object.values(store.index.live()).filter((en) => en && en.adapterId === adapterId && !en.unlistedAt && !finer(en) && (!pat || F.matchConversation(pat, convFacts(en)).hit))
      .sort((a, b) => (Number(b.lastAt) || 0) - (Number(a.lastAt) || 0));
    const PER_CONV = 400, MAX_CONVS = 200, TOTAL = 20000;
    const recs = [];
    let covered = 0, capHit = false;
    for (const en of convs.slice(0, MAX_CONVS)) {
      if (recs.length >= TOTAL) { capHit = true; break; }
      const r = store.readTail(adapterId, en.id, { limit: PER_CONV });
      if (r.length >= PER_CONV) capHit = true;
      recs.push(...r);
      covered++;
    }
    const est = F.estimate(f, recs, { now: now(), capHit });
    return { ok: true, estimate: { ...est, conversations: convs.length, covered, sampled: !!(est.sampled || covered < convs.length) }, expectedWakesPerDay: F.expectedWakesPerDay({ notify: how, digestMinutes, matchedPerDay: est.matchedPerDay, dailyWakeCap }) };
  }

  /**
   * THE MIGRATION (`2026-09-channels-aggregated-im`, run through
   * src/server/migrations.js): a conversation the owner TRACKED keeps being
   * polled fast — `refresh.every = 30` (by 'migration', visible and editable
   * in its "Refresh every ▸"); a conversation never ingested gets its backlog
   * READ (`readAt` = now) so the upgrade does not open on thousands of
   * unread; the `tracked` field is removed everywhere; every account gets
   * `linkedAt` (unread counts start there). Assignments are untouched.
   * Idempotent: a second run finds nothing tracked and stamps nothing.
   */
  function migrateAggregated() {
    const t = now();
    // A BLOCKED store refuses every write: the migration FAILS by name (the
    // shared runner then retries it next boot) instead of recording a success
    // whose every edit was refused (lane R2 verify, 2026-09-26).
    const blocked = store.index.blocked() || store.adapters.blocked();
    if (blocked) throw new Error(`the channels store refuses writes (${blocked}) — retried next boot`);
    // THE PLAN IS COMPUTED NOW, from the live index (read-only), because the
    // runner is synchronous and the door below runs its function a microtask
    // later: a report filled inside it was logged as zeros on every instance.
    // The door then applies exactly this plan (re-checked per row).
    const plan = [];
    for (const en of Object.values(store.index.live())) {
      if (!en) continue;
      const hot = en.tracked === true && !en.refresh;
      const read = !en.anchor && !(Number(en.readAt) > 0);
      const clear = 'tracked' in en;
      if (hot || read || clear) plan.push({ key: en.key, hot, read, clear });
    }
    const linkPlan = adapterRecords().adapters.filter((rec) => !(Number(rec.linkedAt) > 0)).map((rec) => rec.id);
    const report = { hot: plan.filter((p) => p.hot).map((p) => p.key), readStamped: plan.filter((p) => p.read).length, cleared: plan.filter((p) => p.clear).length, linked: linkPlan.slice() };
    const idx = plan.length ? store.index.update((ix) => {
      for (const p of plan) {
        const en = ix.conversations[p.key];
        if (!en) continue;
        if (p.hot && !en.refresh) en.refresh = { every: 30, by: 'migration', at: t };
        if (p.read && !(Number(en.readAt) > 0)) en.readAt = t;
        if (p.clear) delete en.tracked;
      }
    }) : Promise.resolve();
    const ad = linkPlan.length ? store.adapters.update(() => {
      for (const rec of adapterRecords().adapters) if (linkPlan.includes(rec.id) && !(Number(rec.linkedAt) > 0)) rec.linkedAt = t;
    }) : Promise.resolve();
    return { ...report, write: Promise.all([idx, ad]) };
  }

  /**
   * THE MIGRATION (`2026-09-channels-access-watchers`, run through
   * src/server/migrations.js — R4, 2026-09-27): every pre-split single
   * assignment becomes ONE access row + ONE watcher row for its principal —
   * a conversation's `assignment` (its pace ledger = the conversation's own
   * wakes, the inherited grains' mirrors excluded), an account / rule
   * record's top-level `principal` (its `stats` ride on the watcher); every
   * grant with origin `assignment` becomes origin `access`; pending hits held
   * before the split (no `for`) are tagged with the watcher they were held
   * for (the first in effect — the only assignment there was). The engine
   * STARTS before the runner: every reader lifts a pre-split record the same
   * way (`F.grainOf`, merged), and a write reaching one lifts it in place
   * first — so the order only decides WHEN the bytes change, never what a
   * reader sees. Idempotent: a second run finds nothing to lift.
   */
  function migrateGrants() {
    const blocked = store.index.blocked();
    if (blocked) throw new Error(`the channels store refuses writes (${blocked}) — retried next boot`);
    // THE PLAN IS COMPUTED NOW from the live index (the runner is synchronous;
    // the door below runs a microtask later) — these counts ARE the rows it changes
    const convs = [];
    for (const en of Object.values(store.index.live())) {
      if (!en) continue;
      const legacy = !!(en.assignment && en.assignment.principal);
      const assignmentKey = 'assignment' in en;
      const grants = (Array.isArray(en.reachEntries) ? en.reachEntries : []).filter((g) => g && g.origin === 'assignment').length;
      const untagged = (Array.isArray(en.pending) ? en.pending : []).filter((p) => p && !p.for).length + (Number(en.pendingElided) > 0 ? 1 : 0);
      let tagPk = null;
      if (untagged && !legacy) { const eff = effectiveFor(en); tagPk = eff && eff.watchers[0] ? pkOf(eff.watchers[0].watcher.principal) : null; }
      if (legacy || assignmentKey || grants || (untagged && tagPk)) convs.push({ key: en.key, legacy, grants, untagged: untagged && (legacy || tagPk) ? untagged : 0, tagPk });
    }
    const accts = Object.entries(store.index.table('accountAssignments') || {}).filter(([, g]) => g && g.principal).map(([id]) => id);
    const pats = Object.entries(store.index.table('patternAssignments') || {}).filter(([, g]) => g && g.principal).map(([id]) => id);
    const acctGrants = (store.index.table('accountGrants') || []).filter((g) => g && g.origin === 'assignment').length;
    const report = { conversations: convs.filter((c) => c.legacy).length, accounts: accts.length, patterns: pats.length, grantsRenamed: convs.reduce((n, c) => n + c.grants, 0) + acctGrants, pendingTagged: convs.reduce((n, c) => n + c.untagged, 0) };
    const any = convs.length || accts.length || pats.length || acctGrants;
    const write = any ? store.index.update((ix) => {
      for (const c of convs) {
        const e2 = ix.conversations[c.key];
        if (!e2) continue;
        liftGrainInPlace(ix, e2, 'conversation');
        if (c.tagPk) {
          for (const p of Array.isArray(e2.pending) ? e2.pending : []) if (p && !p.for) p.for = c.tagPk;
          if (Number(e2.pendingElided) > 0) { if (!e2.pendingElidedBy || typeof e2.pendingElidedBy !== 'object') e2.pendingElidedBy = {}; e2.pendingElidedBy[c.tagPk] = (Number(e2.pendingElidedBy[c.tagPk]) || 0) + Number(e2.pendingElided); e2.pendingElided = 0; }
        }
        if (Array.isArray(e2.reachEntries)) for (const g of e2.reachEntries) if (g && g.origin === 'assignment') g.origin = 'access';
      }
      for (const id of accts) { const g = (ix.accountAssignments || {})[id]; if (g) liftGrainInPlace(ix, g, 'account'); }
      for (const id of pats) { const g = (ix.patternAssignments || {})[id]; if (g) liftGrainInPlace(ix, g, 'pattern'); }
      for (const g of Array.isArray(ix.accountGrants) ? ix.accountGrants : []) if (g && g.origin === 'assignment') g.origin = 'access';
    }) : Promise.resolve();
    return { ...report, write };
  }

  /** SAVE this conversation's filter (`null` clears it — refused by name while
   *  a filtered assignment still points at it). One filter per conversation
   *  in v1, keyed so a later phase may share one across rows. */
  async function setFilter(adapterId, convId, input, { estimate: est = null } = {}) {
    if (!known(adapterId, convId)) return { ok: false, code: 'not-found', error: 'No such conversation' };
    const key = `${adapterId}/${convId}`;
    const t = now();
    const en = store.index.peek(key);
    if (input === null) {
      if (en.filterId && convGrainOf(en).watchers.some((w) => w.mode === 'filtered' && w.filterId === en.filterId)) return { ok: false, code: 'filter-in-use', error: 'this filter is what a notification wakes on — switch that notification to all messages or remove it first' };
      await store.index.update((ix) => { const e2 = store.index.entry(adapterId, convId, { create: false }); if (!e2) return; const fid = e2.filterId; e2.filterId = null; if (fid && !Object.values(ix.conversations).some((x) => x.filterId === fid)) delete filtersOf(ix)[fid]; });
      notify([convId]);
      return { ok: true, filter: null };
    }
    const v = F.validateFilter(input);
    if (!v.ok) return { ok: false, code: 'bad-filter', error: v.error };
    const id = en.filterId || `f-${key}`;
    let saved = null;
    await store.index.update((ix) => {
      const e2 = store.index.entry(adapterId, convId, { create: false });
      if (!e2) return;
      const prev = filtersOf(ix)[id] || null;
      saved = { id, ...v.filter, createdAt: prev ? prev.createdAt : t, updatedAt: t, estimateAtSet: est && typeof est === 'object' ? { matchedPerDay: Number(est.matchedPerDay) || 0, totalPerDay: Number(est.totalPerDay) || 0, windowDays: Number(est.windowDays) || 7, sampled: !!est.sampled, truncated: !!est.truncated, at: t } : (prev ? prev.estimateAtSet : null) || null };
      filtersOf(ix)[id] = saved;
      e2.filterId = id;
    });
    notify([convId]);
    return { ok: true, filter: saved };
  }

  /** ESTIMATE a filter over THIS conversation's stored history (§7.1 / §10.2):
   *  runs SERVER-SIDE; the client never receives the corpus. `null` estimates
   *  "all messages". Honest about the reader's cap. */
  function estimateFilter(adapterId, convId, input) {
    if (!known(adapterId, convId)) return { ok: false, code: 'not-found', error: 'No such conversation' };
    let filter = null;
    if (input !== null && input !== undefined) {
      const v = F.validateFilter(input);
      if (!v.ok) return { ok: false, code: 'bad-filter', error: v.error };
      filter = v.filter;
    }
    const recs = store.readTail(adapterId, convId, { limit: ESTIMATE_CAP });
    const e = F.estimate(filter, recs, { now: now(), capHit: recs.length >= ESTIMATE_CAP });
    return { ok: true, estimate: e };
  }

  /** Boot: hits left pending by a restart (a window that never fired) are
   *  delivered as ONE digest per (conversation, watcher) shortly after start
   *  — an inherited digest's leftovers as ONE scope digest per (scope,
   *  watcher). Hits nobody waits for any more are left to `prunePending`. */
  function scheduleBootPending() {
    const live = store.index.live();
    for (const k of Object.keys(live)) {
      const en0 = live[k];
      if (!en0 || !Array.isArray(en0.pending) || (!en0.pending.length && !elidedTotal(en0))) continue;
      const en = store.index.peek(k);   // B-f32b: the rows holding hits are copied, never the index
      const eff = wakeEffOf(en);
      if (!eff || !eff.watchers.length) continue;
      const rec = adapterRecords().adapters.find((r) => r.id === en.adapterId);
      if (!rec) continue;
      for (const item of eff.watchers) {
        const pk = pkOf(item.watcher.principal);
        const pend = pendingOf(en, pk, eff);
        if (!pend.hits.length && !pend.elided) continue;
        if (item.source !== 'conversation' && item.watcher.notify === 'digest') {
          // an inherited digest's leftovers go out as ONE scope digest
          const sk = `scope:${scopeKeyOf(item, rec)}`;
          if (wakeTimers.has(sk)) continue;
          const timer = setTimeout(() => { wakeTimers.delete(sk); track(flushScope(rec, item.source, item.patternId, pk, {})); }, BOOT_PENDING_DELAY_MS);
          if (timer.unref) timer.unref();
          wakeTimers.set(sk, { timer, kind: 'boot', startedAt: now() });
          continue;
        }
        const key = `${en.key}|${pk}`;
        if (wakeTimers.has(key)) continue;
        const timer = setTimeout(() => { wakeTimers.delete(key); track(flushPending(rec, en.id, { kind: 'boot', pk })); }, BOOT_PENDING_DELAY_MS);
        if (timer.unref) timer.unref();
        wakeTimers.set(key, { timer, kind: 'boot', startedAt: now() });
      }
    }
  }

  function tick() {
    if (stopped) return;
    // The push lanes follow the resolver's answer on every tick: armed when
    // wanted, stopped when not (an option, a switch, a credential changed).
    syncPushLanes().catch((err) => console.warn('[channels] push lanes sync failed:', err && err.message));
    // P3: the outbox TTL sweep, once a minute (a proposal nobody decided on
    // expires with a receipt — §9.1).
    if (now() - lastExpirySweep >= EXPIRY_SWEEP_MS) { lastExpirySweep = now(); track(expireSweep()); }
    const t = now();
    for (const rec of adapterRecords().adapters) {
      if (rec.enabled === false) continue;
      const e = adapterFor(rec);
      if (Drain.hasRequests(e.dq) && !e.passing && !e.drainTimer) pokeDrain(rec, e);   // r5 safety net: a waiter is never stranded past one tick
      if (t < e.nextAt) continue;
      // An account that is not connected is re-asked once a minute, never
      // every tick (a pass for it costs no request, but nothing is due).
      const st = e.authState;
      if (st && st.state !== 'connected') { if (e.passing || t - e.lastIdleAt < 60e3) continue; e.lastIdleAt = t; pass(rec.id).catch((err) => console.warn('[channels] pass failed:', err && err.message)); continue; }
      // 2026-09-26: DUE PER CONVERSATION — the cadence each row resolves
      // (`caps.cadenceFor`: the owner's override, else hot / warm / cold by
      // activity, the push safety net folded in) is the SAME number its chip
      // claims. The budget is the account's, in the vendor's unit: an
      // exhausted window waits for the next minute and the card says so.
      // lane lark-search-poll: a quiet account whose change feed is due runs a pass too (else the feed never runs)
      const due = discoveryDue(rec, e, t) || e.dueNow.size > 0 || feedDue(rec, e, t) || dueList(rec, e, t).length > 0;
      if (!due) continue;
      if (e.passing) { e.timerDue = true; continue; }   // r5 verify: busy while due — the pass in flight (or the next drain) does the timer's work, a request storm cannot starve the due list
      if (!affordable(rec, e)) { e.waiting = dueList(rec, e, t).length; continue; }
      pass(rec.id).catch((err) => console.warn('[channels] pass failed:', err && err.message));
    }
  }

  /**
   * THE OWNER'S OWN NEWEST MESSAGE, for rows that predate the field (R3 §23):
   * `selfAt` is stamped as records arrive; a conversation active in the last
   * two days that has never been stamped gets it derived ONCE from its log
   * tail (the owner's reply of this morning must reach the attention list on
   * the day of the update). One conversation per turn of the event loop,
   * after boot, never blocking it; a row stamped 0 is never re-read; the rows
   * that turned out to hold one are said in one partial broadcast.
   */
  async function healSelfAt({ windowMs = 48 * 3600e3, tail = 200 } = {}) {
    const t = now();
    const plan = Object.values(store.index.live()).filter((en) => en && !('selfAt' in en) && Number(en.lastAt) > t - windowMs).map((en) => en.key);
    const found = [];
    for (const key of plan) {
      if (stopped) break;
      await new Promise((r) => setImmediate(r));
      const i = key.indexOf('/');
      const sa = selfAtOf(store.readTail(key.slice(0, i), key.slice(i + 1), { limit: tail }));
      try {
        await store.index.update(() => { const en = store.index.entry(key.slice(0, i), key.slice(i + 1), { create: false }); if (en && !('selfAt' in en)) en.selfAt = sa; });
      } catch (err) { log.warn(`[channels] selfAt heal stopped: ${(err && err.message) || err}`); break; }
      if (sa) found.push(key);
    }
    if (found.length && !stopped) notify(found);
    return { planned: plan.length, found: found.length };
  }
  /** R4 verify r2: NOTIFICATION ROWS WITHOUT ACCESS AT THEIR GRAIN — the
   *  store invariant every write keeps, re-counted at boot (a hand edit, a
   *  copy of a store from another version). The PURE reader (`F.grainOf`)
   *  already leaves such a row INERT; this names them once so nobody wonders
   *  why a listed notification never fires. Returns `[{grain, id, principal}]`. */
  function orphanWatchers() {
    const out = [];
    const check = (grain, id, raw, legacy) => {
      const rawW = Array.isArray(raw && raw.watchers) ? raw.watchers.filter((w) => w && pkOf(w.principal)) : [];
      const kept = new Set(F.grainOf({ access: raw && raw.access, watchers: raw && raw.watchers }, legacy).watchers.map((w) => pkOf(w.principal)));
      for (const w of rawW) if (!kept.has(pkOf(w.principal))) out.push({ grain, id, principal: pkOf(w.principal) });
    };
    for (const [id, g] of Object.entries(store.index.table('accountAssignments') || {})) check('account', id, g);
    for (const [id, g] of Object.entries(store.index.table('patternAssignments') || {})) check('pattern', id, g);
    for (const en of Object.values(store.index.live())) if (en) check('conversation', en.key, en, legacyConvAssignment(en));
    return out;
  }
  /** R4 verify r5 (money): RELEASE THE RESERVATIONS OF A DEAD BOOT. A wake
   *  reservation (reserveWake, written before the ladder) whose `bootId` is
   *  NOT this process's and which was never finalized (`reserved === true`
   *  still) belonged to a process that has since died between the reservation
   *  and the finalize — its cap slot is held forever (24 h) with no live
   *  process to finalize it. At boot such rows are dropped, so the cap they
   *  held is freed; a reservation from THIS boot (an in-flight wake) is never
   *  touched. A legacy reservation with no `bootId` at all can only predate
   *  this fix (this boot stamps one) — it is a previous boot's and released. */
  function releaseStaleReservations() {
    let released = 0;
    const sweep = (ws) => {
      if (!Array.isArray(ws)) return;
      for (const w of ws) {
        if (!w || !w.stats) continue;
        // an All row's fan-out ledgers (one per conversation) hold reservations too
        const ledgers = [w.stats, ...(w.stats.fan && typeof w.stats.fan === 'object' ? Object.values(w.stats.fan) : [])];
        for (const l of ledgers) {
          if (!l || !Array.isArray(l.wakes)) continue;
          const before = l.wakes.length;
          l.wakes = l.wakes.filter((r) => !(r && r.reserved === true && r.bootId !== BOOT_ID));
          released += before - l.wakes.length;
        }
      }
    };
    return store.index.update((ix) => {
      for (const en of Object.values(ix.conversations || {})) if (en) sweep(en.watchers);
      for (const g of Object.values(ix.accountAssignments || {})) if (g) sweep(g.watchers);
      for (const g of Object.values(ix.patternAssignments || {})) if (g) sweep(g.watchers);
      return released;
    }).then((n) => { if (n) log.warn(`[channels] released ${n} wake reservation(s) from a previous boot (never finalized, the process is gone) — the cap they held is freed`); return n; }, (err) => { log.warn(`[channels] boot reservation release failed: ${(err && err.message) || err}`); return 0; });
  }
  /** R4 verify r5: NAME A STORED cap-0 DIGEST WATCHER ONCE. `dailyWakeCap: 0`
   *  on a `notify:'digest'` watcher is now refused at write (validateWatcher /
   *  validateAssignment); a row stored before that refusal existed would never
   *  deliver (a digest IS a paced wake). `F.digestCap` reads such a row as
   *  cap 1 so it delivers once per window — the store is NOT rewritten (the
   *  owner edits the notification to set a real cap; a silent on-disk migration
   *  would hide the choice). This names them once. */
  function capZeroDigests() {
    const out = [];
    const check = (grain, id, holder, legacy) => {
      for (const w of F.grainOf({ access: holder && holder.access, watchers: holder && holder.watchers }, legacy).watchers) if (w && w.notify === 'digest' && Number(w.dailyWakeCap) === 0) out.push({ grain, id, principal: pkOf(w.principal) });
    };
    for (const [id, g] of Object.entries(store.index.table('accountAssignments') || {})) check('account', id, g);
    for (const [id, g] of Object.entries(store.index.table('patternAssignments') || {})) check('pattern', id, g);
    for (const en of Object.values(store.index.live())) if (en) check('conversation', en.key, en, legacyConvAssignment(en));
    return out;
  }
  /** 2026-09-27: the per-watcher `receiptWake` opt-in is DEPRECATED (the
   *  delivery of a receipt is chosen at the Approve / Reject action) — the
   *  watchers still carrying `true`, counted for the ONE boot line. */
  function deprecatedReceiptWakes() {
    const out = [];
    const check = (grain, id, holder, legacy) => {
      for (const w of F.grainOf({ access: holder && holder.access, watchers: holder && holder.watchers }, legacy).watchers) if (w && w.receiptWake === true) out.push({ grain, id, principal: pkOf(w.principal) });
    };
    for (const [id, g] of Object.entries(store.index.table('accountAssignments') || {})) check('account', id, g);
    for (const [id, g] of Object.entries(store.index.table('patternAssignments') || {})) check('pattern', id, g);
    for (const en of Object.values(store.index.live())) if (en) check('conversation', en.key, en, legacyConvAssignment(en));
    return out;
  }
  function start() {
    if (timer || stopped) return;
    timer = setInterval(tick, 5000);
    if (timer.unref) timer.unref();
    healSelfAt().catch((err) => log.warn(`[channels] selfAt heal failed: ${(err && err.message) || err}`));
    try { const d = deprecatedReceiptWakes(); if (d.length) log.log(`[channels] ${d.length} watcher(s) still carry receiptWake:true — IGNORED since 2026-09-27 (a receipt's delivery is chosen at the Approve / Reject action: "tell it with its next message" or "wake it now"): ${d.map((o) => `${o.principal} on ${o.grain} ${o.id}`).join(', ').slice(0, 600)}`); } catch (err) { log.warn(`[channels] boot receiptWake census failed: ${(err && err.message) || err}`); }
    try { const orphans = orphanWatchers(); if (orphans.length) log.warn(`[channels] ${orphans.length} notification row(s) without access at their grain — inert until access is granted there: ${orphans.map((o) => `${o.principal} on ${o.grain} ${o.id}`).join(', ').slice(0, 600)}`); } catch (err) { log.warn(`[channels] boot notification census failed: ${(err && err.message) || err}`); }
    try { const z = capZeroDigests(); if (z.length) log.warn(`[channels] ${z.length} digest notification(s) stored with a daily cap of 0 — read as cap 1 (a digest is a paced wake and cap 0 never delivers); the store is not rewritten, edit each to set a real cap: ${z.map((o) => `${o.principal} on ${o.grain} ${o.id}`).join(', ').slice(0, 600)}`); } catch (err) { log.warn(`[channels] boot digest-cap census failed: ${(err && err.message) || err}`); }
    try { track(releaseStaleReservations()); } catch (err) { log.warn(`[channels] boot reservation release failed: ${(err && err.message) || err}`); }
    reconcileReceiptFates().catch((err) => log.warn(`[channels] boot receipt-fate reconcile failed: ${(err && err.message) || err}`));
    try { scheduleBootPending(); } catch (err) { log.warn(`[channels] boot pending scan failed: ${(err && err.message) || err}`); }
    // inc-muk9jj0j-rel3: a verdict judged before the account's LAST credential change (a re-authorization that landed
    // before this code) is re-judged once at boot — the read path re-judges on the way out anyway; this persists it
    for (const rec of adapterRecords().adapters) rejudgeConvCaps(rec, 'boot').catch(() => {});
    // lane lark-p2p: a change-feed row an older hit reader wrote starts over NOW (never waits out that reader's back-off
    // or park) — written at once so the card says "searching for the first time", not the old reader's state
    try {
      let healed = 0;
      for (const rec of adapterRecords().adapters) if (feedReaderHeal(rec)) healed++;
      if (healed) store.adapters.update(() => {}).then(() => notify([])).catch((err) => log.warn(`[channels] boot feed-reader heal write failed: ${(err && err.message) || err}`));
    } catch (err) { log.warn(`[channels] boot feed-reader heal failed: ${(err && err.message) || err}`); }
    // P4: a proposal the previous process died on mid-send is `unknown`, not
    // "not sent" — and never re-sent.
    sweepSending().catch((err) => log.warn(`[channels] boot outbox sweep failed: ${(err && err.message) || err}`));
    sweepReplaces().catch((err) => log.warn(`[channels] boot replace sweep failed: ${(err && err.message) || err}`));   // verify r2: a replace the previous process died inside
  }
  function stop() {
    stopped = true;
    for (const c of censusTimed.values()) if (c.timer) { try { c.timer.cancel(); } catch { } c.timer = null; }   // B-f32b r2
    if (offIntegrations) { try { offIntegrations(); } catch {} offIntegrations = null; }
    if (offStash) { try { offStash(); } catch {} offStash = null; }   // 2026-09-27: the receipt-fate listener
    if (offStashGate) { try { offStashGate(); } catch {} offStashGate = null; }   // verify r3: the stash gate
    if (timer) { clearInterval(timer); timer = null; }
    // P2: a window that never fired keeps its hits PENDING on the index (they
    // were persisted before the timer existed), so the next boot delivers them.
    for (const key of [...wakeTimers.keys()]) clearWakeTimer(key);
    for (const e of live.values()) {
      disarmPush(e, 'engine stopped');
      if (e.pushTimer) { clearTimeout(e.pushTimer); e.pushTimer = null; }
      settleRequests(e, { ok: false, code: 'stopped', error: 'the channels engine is stopping — refresh again after the restart' });   // r5: no waiter outlives the engine
      wakeSleepers(e);   // lane R5: no pace sleep outlives it either
    }
    if (!oauth) { try { flows.stopAll(); } catch {} }   // ours to stop; an injected machine is its owner's
    store.close();
  }

  try { stampIdentities(); } catch (err) { log.warn(`[channels] identity stamp failed: ${(err && err.message) || err}`); }   // verify r6: legacy records bound to their holder at boot
  return {
    store, registry, digest, notify, pass, refreshConvCaps, markRead, messages,
    // 2026-09-26: the aggregated IM — the reader surface, the scheduler's
    // override, the agent refresh, the three assignment grains, the migration
    conversationView, setRefresh, refresh, agentRefresh, watch, loadOlder, attachment, search,
    conversationName,   // B-c127: THE NAME LADDER by key (the touches store names a touch by it)
    accountsBrief,   // B-5fe1: the account list a badge's hue is computed from
    healSelfAt,   // R3 (§23): the one-shot derivation of the owner's newest message for rows that predate the field
    setScopeAssignment, estimateScope, effectiveFor: (adapterId, convId) => effectiveFor(store.index.peek(`${adapterId}/${convId}`)), migrateAggregated,
    // R4 (2026-09-27): access and notification — two operations, access first; the compose verb; the agent's search
    setGrain, setAccess, setWatchers, removePattern, accessFor, migrateGrants, compose, searchFor, setAccountPolicy, effectiveForAccount,
    cadenceOf: (adapterId, convId) => { const rec = adapterRecords().adapters.find((r) => r.id === adapterId); const en = store.index.peek(`${adapterId}/${convId}`); return rec && en ? cadenceOf(rec, en) : null; },
    budgetOf: (adapterId) => { const rec = adapterRecords().adapters.find((r) => r.id === adapterId); return rec ? budgetView(rec, live.get(rec.id) || paceCarry.get(rec.id) || null) : null; },
    // R4: one scope digest per WATCHER — `pk` (`kind:id`) names it; without one, every watcher of that grain is flushed
    flushScope: async (adapterId, source, patternId, pk = null) => {
      const rec = adapterRecords().adapters.find((r) => r.id === adapterId);
      if (!rec) return { ok: false, why: 'no-such-adapter' };
      if (pk) return flushScope(rec, source, patternId || null, pk, {});
      const holder = source === 'account' ? accountGrainOf(rec.id) : patternById(patternId);
      const results = [];
      // an ALL-AGENTS watcher is flushed per running conversation (its fan-out keys — each its own window and ledger)
      for (const w of holder ? F.grainOf(holder).watchers : []) {
        const pks = w.principal.kind === 'everyone' ? fanTargets().map((x) => pkOf(F.fanWatcher(w, x.cid).principal)) : [pkOf(w.principal)];
        for (const k of pks) results.push(await flushScope(rec, source, patternId || null, k, {}));
      }
      const first = results.find((x) => x && x.ok) || results[0] || { ok: false, why: 'not-watching' };
      return { ...first, results };
    },
    adapterRecords, laneOrScan, start, stop,
    // B-f32b r2: the census's definition (every row at `t`) and the paced census's clock walks, for the gates
    schedulerExact: (adapterId, t = now()) => { const rec = adapterRecords().adapters.find((r) => r.id === adapterId); return rec ? schedulerScan(rec, t) : null; },
    censusStats: () => Object.fromEntries(censusCount),
    // verify r3: a READ-ONLY count of the per-account memories on the table above (the census leg + a diagnostic)
    liveMemSizes: (adapterId) => { const e = live.get(adapterId); if (!e) return null; const out = {}; for (const [name, spec] of Object.entries(LIVE_MEMS)) { const top = e[name]; let n = 0; if (top) { if (spec.nested) { for (const m of top.values()) n += m.size; } else n = top.size; } out[name] = n; } for (const k of ['feedSeen', 'feedGroups', 'feedUnlisted']) if (e[k] && typeof e[k].size === 'number') out[k] = e[k].size; return out; },   // verify r2: + the change feed's bounded memories
    LIVE_MEM_KEEP_MS,
    connect, reauthorize, finishAuth, cancelAuth, narrowAuth, oauthNarrow, disconnect, setEnabled, setOptions, adapterView,
    // lane lark-threads (B3): the owner's names for authors
    setAlias, aliasesOf,
    // r4 (design-integrations-per-account): the account's own client, the
    // transient consent, duplicate / remove with its reference check, the
    // owner-only config (D3), the in-place edits and the legacy own → custom copy
    clientFor, startOAuth, oauthStatus, oauthCallback, duplicate, referencesOf, remove, setLabel, setCustomSecret, adapterConfig, mountClientsFor,
    inlineLegacyClient, inlineLegacyClients, DUPLICATE_FIELDS, DUPLICATE_NEVER,
    // a fresh record of a connectable type, never stored — the suites' baseline for "a copy differs only where DUPLICATE_FIELDS says"
    blankRecord: (kind) => newRecord(connectableFor(kind), { id: kind }),
    // 2026-09-22 the account model: the offered credentials (key + label) and the legacy stamp
    offeredCredentials, defaultCredentialKey, stampCredentialKeys, stampIdentities,
    // P1b: the push lanes
    setPush, syncPushLanes, pushView, kick: (adapterId) => { const rec = adapterRecords().adapters.find((r) => r.id === adapterId); if (rec) kick(rec, adapterFor(rec)); },
    oauth: flows,
    // P2: assign / filter / wake
    setAssignment, setFilter, estimateFilter, settleWakes, coalesceSeconds,
    // P3: outbox / policy / reach + the agent-facing reads (§9, §8, §11)
    propose, approve: (id, o) => onProposal(id, () => approve(id, o)), reject: (id, o) => onProposal(id, () => reject(id, o)), outboxView, expireSweep, pointerSync, receipt,
    // 2026-09-27: the agent withdraws / replaces its OWN proposal (a decision of the user waits for a replace in flight)
    withdrawProposal, replaceProposal, reconcileReceiptFates,
    // P4: reconcile / the boot sweep / the per-channel honesty switch
    reconcile: (id, o) => onProposal(id, () => reconcile(id, o)), sweepSending, sweepReplaces, setSenderHonesty, honestyLineFor, deprecatedReceiptWakes,   // verify r2: two Check-outcome presses ask the adapter ONCE
    setPolicy, policyFor, setReach, reachView, reachFor, request, decideRequest,
    agentWatch, agentUnwatch, setAgentDirectory, directoryLists,   // lane channel-agent-watch
    onFresh,   // lane channel-agent-watch: the hit dispatch, driven by test-channel-agent-watch ⑤ with records the store already holds
    listFor, readFor, statusFor,
    flushPending: (adapterId, convId, opts) => { const rec = adapterRecords().adapters.find((r) => r.id === adapterId); return rec ? flushPending(rec, convId, opts || {}) : Promise.resolve({ ok: false, why: 'no-such-adapter' }); },
    // R4: a window is per (conversation | scope, WATCHER) — `key` names the conversation (or `scope:acct:<id>` / `scope:pat:<id>`), `principal` the watcher
    orphanWatchers,
    // R4 verify r5: the boot GC of a dead boot's stuck wake reservations (a
    // suite drives it by hand — it also runs in `start()`)
    releaseStaleReservations, capZeroDigests,
    pendingWindows: () => [...wakeTimers.entries()].map(([k, w]) => { const i = k.lastIndexOf('|'); return { key: i > 0 ? k.slice(0, i) : k, principal: i > 0 ? k.slice(i + 1) : null, kind: w.kind, startedAt: w.startedAt }; }),
    REQUESTS_PER_MINUTE, RECONCILE_SECONDS, PAGE, MAX_PAGES, KICK_MIN_INTERVAL_MS, PUSH_NOTIFY_DEBOUNCE_MS, PENDING_CAP, ESTIMATE_CAP,
    DEFAULT_BUDGET_PER_MIN, WATCH_TTL_MS, DISCOVERY_MAX_PAGES, REFRESH_QUEUE_CAP, REFRESH_OWNER_RESERVE, REFRESH_WAIT_MS,
    // r5: the refresh request set as a suite / a diagnostic reads it; `tick` = the scheduler's one step (the suites drive it by hand)
    refreshQueueOf, idle, tick,
    // lane channel-threads (2026-09-28): threads + reactions — the owner's routes, the read shape, the side log
    threadRead, threadRefresh, threadOlder, reactionsRead, reactionsRefresh, react, unreact, emojiSet, emojiImage, migrateThreads, setReactionPolicy, proposeReaction, readThreadFor, agentThreadRefresh,
    withView: (adapterId, convId, records, o = {}) => withView(adapterRecords().adapters.find((r) => r.id === adapterId) || null, records, { ...o, convId }),
    reactionsFor: (adapterId, convId, ids) => { const rec = adapterRecords().adapters.find((r) => r.id === adapterId); return rec ? reactionsFor(rec, convId, ids) : new Map(); },
    rxStateOf: (adapterId) => { const e = live.get(adapterId); return e ? { reserved: Drain.rxMinuteAt(e.rxMinute, now()).n, calls: (e.rxCalls || []).filter((x) => now() - x < 60e3).length } : null; },
    appendSides: (adapterId, convId, sides) => { const rec = adapterRecords().adapters.find((r) => r.id === adapterId); return rec ? appendSides(rec, convId, sides) : { appended: 0 }; },
  };
}

module.exports = { create, previewText, SETTING_BOUNDS, DUPLICATE_FIELDS, DUPLICATE_NEVER, CUSTOM_KEY, PENDING_FLOW_TTL_MS, REQUESTS_PER_MINUTE, DEFAULT_BUDGET_PER_MIN, WATCH_TTL_MS, DISCOVERY_MAX_PAGES, REFRESH_QUEUE_CAP, REFRESH_OWNER_RESERVE, REFRESH_WAIT_MS, ATTACHMENT_MAX_BYTES, RECONCILE_SECONDS, BACKOFF_MS, PAGE, MAX_PAGES, FAILURES_BEFORE_LOUD, REAL_ADAPTERS, KEY_FILE, INBOX_KEY, KICK_MIN_INTERVAL_MS, PUSH_NOTIFY_DEBOUNCE_MS, PUSH_EVENT_DEDUP_MAX, PENDING_CAP, ESTIMATE_CAP, COALESCE_DEFAULT_SECONDS, COALESCE_MAX_SECONDS, BOOT_PENDING_DELAY_MS };
