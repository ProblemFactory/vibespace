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
const { AsyncLocalStorage } = require('async_hooks');
const { createChannelStore } = require('../channel-store.js');
const { createChannelRegistry, ChannelError } = require('../channels/index.js');
const { identityOf, identityMismatch, heldIdentity, mismatchSentence, namelessSentence, cancelledSentence } = require('../channel-identity.js');   // verify r5: whose account a consent may land on; r6: the held identity read off the token it holds, a nameless consent; r7: a cancelled consent
const caps = require('../channel-caps.js');
const fake = require('../channels/fake.js');
const { secretBox } = require('../secret-box.js');
const { OWN_KEY, CLUSTER_PREFIX } = require('./integration-store.js');   // the two credential-key forms, spelled ONCE (the store's)
const R = require('../integration-registry.js');   // PURE: the rows' `bindsPerAccount` + `clientFieldsOf` (the custom client's two fields)
const { createOAuthLoopback, OPTIONAL_SCOPES_MAX } = require('../oauth-loopback.js');
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
const Budget = require('../channel-budget.js');   // lane gmail-quota-share: the per-account vendor budget is LEARNED from the vendor's refusals (AIMD, PURE)
const ChannelSettings = require('../channel-settings.js');   // B-df40 part 3: the vendor budget / pace rows SETTING_BOUNDS derives
// R3 (2026-09-26, "lark图像不能预览吗？"): THE ONE ORDER an attachment request is
// judged in — cache first, a remembered refusal, ours only, fetchable, enabled,
// joined, the back-off, the budget, then the fetch (PURE; the vendor-whitelist
// census §7 pins that `fetchAttachment` is reached only through its `fetch`).
const Att = require('../channel-attachments.js');
const Av = require('../channel-avatars.js');   // lane channel-avatars (B-5fe1): a person's picture — memo facts, sniff, bounds
// design 008 (B-3cf8, userW's first Channels open: 77.5 MB, 1.49 s): THE FIRST SCREEN'S PREDICATE + the page rules,
// shared with the panel (PURE) — the first read views only the rows `candidateOf` names and `statusTag` decides.
const FO = require('../channel-focus.js');
// verify r1 (S): the characters a name door drops (peerName / the ladder's oneLine) — the search's raw side drops them too
const { HIDDEN_RE } = require('../hidden-chars.js');
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
// lane message-facts (B-f066, design 007): a message's FACTS — the fold of the record's own list and its `fx` side lines,
// the agent's line (PURE; the schema + bounds are channel-record's)
const Facts = require('../channel-facts.js');
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
// lane message-facts (B-f066): a message's FACTS in an AGENT's copy — the envelope is a PEER's (display names, addresses, a
// list id, a subject): every name through the name door, every address as a line piece, every line through the belt; a
// count keeps its number only (the reactions rule — counts, never who). The CLI prints `Facts.agentFactLines` of THIS.
const agentFacts = (list) => Facts.mapFactStrings(list, { name: (v) => peerName(v, 200) || '', id: (v) => agentText(v, { kind: 'line', max: 320 }), line: (v) => agentText(v, { kind: 'line', max: 200 }) });
const { threadsOf: threadsRow, reactionsOf: reactionsRow, METHOD_GATES } = require('../channels/index.js');   // + lane message-facts: `factsOf` is declared by its gate
const { searchRowOf } = require('../channels/index.js');   // design 010: the vendor's own search row (never a vendor name here)
const SR = require('../channel-search.js');   // design 010 (PURE): the merge, the refusal table, the snippet bound
// lane dc-channels-seams (rv-channels-core C11): the three families `create()` composes over ONE context object (the composition root)
const ChannelsAccess = require('./channels-access.js');
const ChannelsOutbound = require('./channels-outbound.js');
const ChannelsAuth = require('./channels-auth.js');
// lane lark-search-poll (B-5aab, 2026-09-28 — design §27): THE CHANGE FEED's PURE arithmetic (the window, the page's
// trust verdict, the fold into owed marks / births, the measurement); the scheduling is drain rule 21, the one lane
// answer channel-caps `feedState` — this engine only DRIVES it (`feedPage`)
const Feed = require('../channel-feed.js');
const Census = require('../channel-census.js');   // lane scheduler-census-index (B-7978, PURE): the card's clock census as kept judgements

/** THE REAL ADAPTERS (P1). Each module names its integration row
 *  (`integration`), its Test runner (`integrationTest`), its per-record
 *  options (`OPTIONS`) and its label — the engine reads THOSE, never the
 *  kind: the contract suite's census forbids a branch on an adapter id
 *  anywhere outside src/channels/. A kind with no module here (the fakes) is
 *  seeded by the dev seam and never CONNECTED.
 *  lane dc-channels-manifest: DERIVED from THE vendor list (src/channels/registry-list.js, PURE — one line per vendor,
 *  the same list the browser's settings / registry rows derive from): each manifest names its adapter module by repo
 *  path. The module IS the registered thing (register() validates every field read here — F2); `registry.vendor(kind)`
 *  answers where a by-kind map used to. */
const VendorList = require('../channels/registry-list.js');
const VENDOR_ROOT = path.join(path.dirname(require.resolve('../channels/registry-list.js')), '..', '..');   // the manifests' `adapter` paths are repo-relative
const adapterOf = (m) => require(path.join(VENDOR_ROOT, m.adapter));
const REAL_ADAPTERS = Object.freeze(VendorList.MANIFESTS.map(adapterOf));
// the name-form setting a kind with no `nameField` row of its own reads (the first vendor that declares one)
const NAME_FIELD_KEY = Object.keys(ChannelSettings.CHANNEL_SETTINGS).map((k) => ChannelSettings.declaredKey(k, 'nameField')).find(Boolean) || null;
// lane dc-channels-consent: every adapter DECLARES how its consent comes back (`consent` row, src/channels/index.js
// validateConsent) — a bad row refuses to load here, by name, never at the first sign-in
const { validateConsent } = require('../channels/index.js');
for (const m of REAL_ADAPTERS) validateConsent(m.kind, m.consent);
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
  Object.freeze({ key: 'filters', paths: Object.freeze(['options']), why: 'the account\'s declared filters (the option rows its adapter declares)' }),
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
 *  metered}` — the setting it names (a row of its vendor's table in
 *  src/channel-settings.js) is read live, so this engine never names an
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
// B-f32b r2 (the coordinator's ruling, 2026-10-03): an account's CLOCK census (hot / warm / cold / due — every row's
// cadence at the instant) is recomputed at most this often; a broadcast inside the window reads the last one and arms
// ONE trailing recompute + broadcast at the window's end, so the card always settles on the exact numbers
const CENSUS_EVERY_MS = 5 * 1000;
// lane scheduler-census-index (B-7978): what the census index bought, measured by scripts/measure-channels-pass.mjs —
// 90 298 rows (4 authoritative-feed accounts + 2 tier accounts), 50 rounds × 6 account passes, the clock +5 s a round
const CENSUS_INDEX_PROOF = Object.freeze({ date: '2026-10-07', version: '2.369.232', box: 'dev (32 cores)', rows: 90298, before: { roundMs: 278.1, maxPassMs: 355.3, censusShare: 0.97 }, after: { roundMs: 1.7, maxPassMs: 3.4, censusShare: 0.12, rowsReadPerRound: 29 } });
// lane channel-drain-scale (2026-10-06 — a 89 000-row mailbox: `digest` / `adapterView` / `schedulerView` /
// `clockCensus` rebuilt the account views at EVERY answered fetch of a pass): THE VIEWS ARE PACED — a pass broadcasts
// its early keys at most once per VIEW_PACE_MS (physical time); a key answered inside the window waits with its answer
// for the window's broadcast (≤ VIEW_PACE_MS, or the pass's end), which still goes out FIRST (r8: the window repaints
// with the toast). The `early` set keeps its rule: a key said early is not said again at the end.
const VIEW_PACE_MS = 250;
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
/** HOTFIX 2.369.226: the longest synchronous run of drain steps before the pass yields the event loop once. */
const STEP_SLICE_MS = 25;
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
 *  typed for "at most 900" ran as 900 with no sentence anywhere). The
 *  ENGINE's own rows are below; every vendor's budget / pace row is DERIVED
 *  from its table in src/channel-settings.js (B-df40 part 3) — the default,
 *  min and max the schema row shows and the adapter's caps spread. */
const ENGINE_BOUNDS = {
  'channels.pollHotSec': { dflt: 30, min: 10, max: 300 },
  'channels.pollWarmSec': { dflt: 300, min: 30, max: 900 },
  'channels.pollColdSec': { dflt: 900, min: 60, max: 900 },      // = channel-caps COLD_MAX_SEC, the owner's 15-min maximum
  'channels.hotRecentMinutes': { dflt: 60, min: 5, max: 1440 },
  'channels.warmRecentHours': { dflt: 24, min: 1, max: 168 },
  'channels.agentRefreshFloorSec': { dflt: 20, min: 5, max: 900 },
  'channels.agentBudgetSharePct': { dflt: 25, min: 5, max: 100 },
  'channels.historyPageSize': { dflt: 50, min: 10, max: 200 },
  'channels.attachmentBudgetMB': { dflt: 5120, min: 64, max: 102400 },
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
};
const SETTING_BOUNDS = Object.freeze({ ...ENGINE_BOUNDS, ...ChannelSettings.boundsOf(ChannelSettings.CHANNEL_SETTINGS) });
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
/** lane channel-feed-authority: the listing's re-walk under an authoritative carrying feed (the unlisted net only). */
const FEED_ONLY_REWALK_MS = 24 * 3600e3;
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
  // design 018 → lane dc-channels-consent: THE ONE CONSENT MACHINE — a per-boot HMAC key signs each redirect consent's
  // state (a restart ends every flow anyway). The state's SHAPE, the landing page and the relay setting are the
  // adapter's declared `consent` row; this machine only signs, reads the row's setting and dispatches on the row.
  const consentKey = crypto.randomBytes(32);
  const signState = (clear) => crypto.createHmac('sha256', consentKey).update(String(clear)).digest('base64url');
  const consentRowOf = (kind) => { const m = registry.vendor(kind); return (m && m.consent) || null; };
  function relayUrlOf(row) {
    const s = row && row.relayUrlSetting;
    if (!s) return '';
    let v;
    try { v = serverSetting(`channels.${s.key}`); } catch { v = undefined; }
    return v === undefined || v === null ? s.fallback : String(v).trim();
  }
  /** The consent facts an adapter whose row declares a LANDING is handed (`deps.consent`): `sign` = the per-boot state
   *  HMAC, `relayUrl()` = its row's relay setting; every other adapter gets none. */
  const consentDepsOf = (kind) => { const row = consentRowOf(kind); return row && row.landing ? Object.freeze({ sign: signState, relayUrl: () => relayUrlOf(row) }) : null; };

  // Built-ins. The three fakes exercise BOTH axes; the real adapters register
  // the same way and nothing downstream learns their names.
  for (const mod of [fake.fakePoll, fake.fakePush, fake.fakeScan, agents, ...REAL_ADAPTERS]) {
    if (!registry.has(mod.kind)) registry.register(mod, { vendor: REAL_ADAPTERS.includes(mod) });
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
    for (const m of [fake, ...REAL_ADAPTERS]) if (m.integration && typeof m.integrationTest === 'function') reg(m.integration, (args) => m.integrationTest(args, fetchFn));
  }
  const resolveIntegration = integrations && typeof integrations.resolveIntegration === 'function'
    ? (id, opts) => integrations.resolveIntegration(id, opts) : undefined;
  const rowOf = (mod) => (mod && mod.integration ? R.rowById(mod.integration) : null);

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
  /** The scopes a consent dropped (bounded strings; never a secret). lane slack-scopes-lark-reauth verify r1: bounded by the
   *  consent machine's OWN optional bound (one constant) — at 16, a Lark consent narrowed through every group (17 scopes with
   *  the wide one) lost the feed's search scope from the record, and the card named only half of what Lark refused. */
  const refusedScopesOf = (xs) => [...new Set((Array.isArray(xs) ? xs : []).filter((x) => typeof x === 'string' && x && x.length <= 200))].slice(0, OPTIONAL_SCOPES_MAX);
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
      const adapterDeps = { fetch: fetchFn, log, tokens: tokensFor(rec), state: stateFor(rec), people: { read: () => store.peopleRead(rec.id), write: (m) => store.peopleWrite(rec.id, m) }, oauth: flows, consent: consentDepsOf(rec.kind), onAuthDone: (adapterId, r) => onAuthDone(adapterId, r), deliver, liveSessions, credentialKey: rec.credentialKey || null, meter: (units) => { const x = live.get(rec.id) || paceCarry.get(rec.id); if (x) charge(x, units); }, pace: (units) => paceWait(rec.id, units, rec), named: (convId) => { const en = store.index.entry(rec.id, String(convId), { create: false }); return !!(en && en.named === true); } };
      // r4: the resolver is PER RECORD (`resolverFor`) — an account's own
      // (`custom`) client lives on its record, a preset in the store.
      const adapter = registry.create(rec.kind, rec, { now, resolveIntegration: resolverFor(rec), ...adapterDeps });
      if (rec.credentialKey === OWN_KEY) scheduleInline(rec);   // the reader-side legacy copy (r4 §2.6)
      e = { kind: rec.kind, adapter, record: rec, passing: null, failures: 0, nextAt: 0, win: null, exhaustedAt: 0, waiting: 0, authState: null, chargeBy: null,
        // 2026-09-26: the conversations made due NOW (a kick naming them, an
        // adapter's `changed` hint, a refresh), the discovery walk's resumable
        // cursor (lane discovery-cursor-persist: read back from the record — a restart resumes it), and the last time an
        // unconnected account was re-asked
        dueNow: new Set(), disc: discFromRecord(rec), discoverSoon: false, lastIdleAt: 0,
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
  // A key the table does not name gets the registry's sanity range — never an
  // adapter's key since B-df40 part 3 (registration refuses an undeclared one).
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
    const cap = b.settingKey ? setting(b.settingKey, dflt) : dflt;
    // lane gmail-quota-share: the minute's limit is the LEARNED ceiling (src/channel-budget.js), the setting its CAP
    const learned = learnedOf(rec, cap);
    return { unit: b.unit === 'quota-unit' ? 'quota-unit' : 'request', limit: learned.ceiling, setting: cap, learned, metered: b.metered === true, settingKey: b.settingKey || null };
  }
  /** The facts the learned budget is stepped over: the live setting, one read's price, the clock. */
  function budgetFacts(rec, cap) {
    const p = registry.capsOf(rec.kind).pace;
    const fetchCost = p && p.cost && Number(p.cost.fetch) > 0 ? Number(p.cost.fetch) : 1;
    return { setting: cap, minUnit: fetchCost, now: now() };
  }
  /** The account's learned budget as of now (the persisted state on the record, restored by the 'boot' row). */
  function learnedOf(rec, cap) { return Budget.budgetStep(rec.budgetLearned || null, 'boot', budgetFacts(rec, cap)).state; }
  /** ONE STEP of the learned budget (the engine only drives the table): persisted beside the account when it moved. */
  function stepBudget(rec, event, extra = {}) {
    const b = registry.capsOf(rec.kind).budget || {};
    const dflt = Number(b.default) > 0 ? Number(b.default) : DEFAULT_BUDGET_PER_MIN;
    const cap = b.settingKey ? setting(b.settingKey, dflt) : dflt;
    return Budget.budgetStep(rec.budgetLearned || null, event, { ...budgetFacts(rec, cap), ...extra });
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
    const bd = budgetDecl(rec);
    const perSec = (p.settingKey ? setting(p.settingKey, dflt) : dflt) * Budget.ratioOf(bd.learned);   // lane gmail-quota-share: in proportion to the learned ceiling
    const limit = bd.limit;
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
    const sp = spender.getStore();   // verify r1 (channel-attach-read): a call that names its spender wins over the pass's
    const by = (sp && sp.by) || e.chargeBy || 'owner';
    w.by[by] = (w.by[by] || 0) + x;
    paceCharge(e, x);   // lane R5: the same units drain the per-second bucket (rule 18)
  }
  /** AN AGENT'S SHARE OF THE MINUTE (2026-09-26, lane R2 verify): the
   *  refresh floor is per conversation, so a loop over cold rows could spend
   *  the account's whole per-minute budget and halve the owner's own polling.
   *  Agent refreshes together may spend at most `channels.agentBudgetSharePct`
   *  of it (100 = no separate limit); past it the refusal names the share and
   *  the wait. `null` = within the share. */
  /** verify r1 (lane channel-attach-read): THE SPENDER OF ONE CALL OUTSIDE A PASS (an agent's attachment fetch) rides
   *  the call's own async context — `e.chargeBy` is the account's, so across the fetch's awaits a pass (Lark meters
   *  after `await pace()`) or the owner's window wrote over it: the agent's units landed on the timer / the owner and the
   *  owner's on the agents' share. `spendAs(null, fn)` = fn as it was. */
  const spender = new AsyncLocalStorage();
  const spendAs = (by, fn) => (by ? spender.run({ by }, fn) : fn());
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
    return { ok: false, code: 'vendor-budget', error: `agents' refreshes and fetches may use at most ${pct} % of this account's vendor budget per minute (${share} of ${b.limit} ${unit}) and have used it — read what is there now, or try again in ${s} s`, retryAfterSec: s, share: { pct, limit: share, spent: Math.round(spent), of: b.limit, unit: b.unit } };
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
    return { unit: b.unit, limit: b.limit, spent: Math.round(w.spent), spentBy: { timer: Math.round(by.timer || 0), agent: Math.round(by.agent || 0), owner: Math.round(by.owner || 0) }, exhausted, waiting: exhausted ? (e.waiting || 0) : 0, resetInSeconds: exhausted ? Math.max(0, Math.ceil((w.at + 60e3 - t) / 1000)) : 0, setting: b.setting, learned: learnedView(rec, b, t), settingKey: b.settingKey, perSec: pd ? Math.round(pd.unitsPerSec * 100) / 100 : null, burst: pd ? Math.round(pd.burst * 100) / 100 : null };
  }
  /** lane gmail-quota-share: the learned ceiling as the card words it (null = polling at the setting). */
  function learnedView(rec, b, t = now()) {
    const l = b.learned;
    if (!l || !(l.ceiling < b.setting)) return null;
    return { ceiling: l.ceiling, setting: b.setting, refusedAt: l.refusedAt || null, fullAt: Budget.fullAtOf(l, { ...budgetFacts(rec, b.setting), now: t }), halvesToday: l.halvesToday || 0 };
  }

  // ── WHICH CONVERSATIONS ARE OPEN IN A WINDOW RIGHT NOW (hot, §6.2) ───────
  const watching = new Map();   // key -> expiry epoch ms (the window's heartbeat)
  const isWatched = (key, t = now()) => (watching.get(key) || 0) > t;

  // ── the lane, asked never assumed ───────────────────────────────────────
  function laneFor(rec, entry) { return caps.laneState(registry.capsOf(rec.kind), rec, entry, now(), { feed: feedOpts() }); }
  /** THE POLL STAMPS' ONE READ (design 011 lane 2): a row's lane with lastPollAt / lastScanAt / walkStartedAt from the
   *  store's side file over it — the row no longer carries them (a quiet poll writes nothing). Every reader here asks
   *  this; every writer goes through `store.stamps.set`; channel-caps is handed this view. */
  const laneOf = (en) => store.stamps.lane(en);
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
   *  conversation the vendor no longer lists (`unlistedAt`) is not polled.
   *  lane channel-feed-authority: read from THE DUE INDEX (below) — the named rows, the owed-mark rows and the index's
   *  head ≤ t, each judged by `dueRow` (the one rule); only the forced pass (`all`) walks every row. */
  function dueList(rec, e, t = now(), { all = false } = {}) {
    const T = tiers();
    const out = [];
    if (all) {
      for (const en of Object.values(store.index.live())) if (en && en.adapterId === rec.id) dueRow(rec, e, en, t, T, out, true);
    } else {
      const ix = dueIndex(rec, t, T);
      const cand = new Set(e.dueNow);
      for (const k of ix.marks) cand.add(k);
      const late = [];
      for (let i = 0; i < ix.keys.length && ix.keys[i].at <= t; i++) { cand.add(ix.keys[i].key); late.push(ix.keys[i].key); }
      for (const k of cand) { const en = store.index.peek(k); if (en && en.adapterId === rec.id) dueRow(rec, e, en, t, T, out, false); }
      // a head the clock did not make due after all (its tier relaxed since it was keyed — the key is a LOWER bound) moves
      // to its true instant: each row is re-keyed once per tier step, never re-judged every pass
      const due = new Set(out.map((d) => d.key));
      for (const k of late) if (!due.has(k)) dueRekey(rec, ix, k, t, T);
    }
    out.sort((x, y) => x.dueAt - y.dueAt || (x.key < y.key ? -1 : 1));
    return out;
  }
  /** THE ONE DUE RULE for one row (the scan's and the index's): pushes its due rows (owed thread marks, then the row). */
  function dueRow(rec, e, en, t, T, out, all) {
    const named = e.dueNow.has(en.key);
    if (en.unlistedAt && !named) return;
    // lane lark-search-poll: THE FEED'S OWED MARKS — durable, named rows at the owed instant (a restart, a cut or a
    // refused fetch never loses one); never for a PAUSED row (the owner's pause wins over the timer — the mark waits)
    const cad = cadenceOf(rec, en, t, T);
    const owedAt = Number(en.feedOwedAt) || 0;
    if (!cad.paused && en.threadOwed && typeof en.threadOwed === 'object') for (const [tk, at] of Object.entries(en.threadOwed)) out.push({ key: Feed.threadDueKey(en.key, tk), id: en.id, dueAt: Number(at) || 0 });
    if (all || named) { out.push({ key: en.key, id: en.id, dueAt: named ? -1 : 0 }); return; }
    if (owedAt && !cad.paused) { out.push({ key: en.key, id: en.id, dueAt: owedAt }); return; }
    if (cad.paused || !cad.seconds) return;
    const last = Number(laneOf(en).lastPollAt) || 0;
    const dueAt = last + cad.seconds * 1000;
    if (dueAt <= t) out.push({ key: en.key, id: en.id, dueAt });
  }

  // ── THE DUE INDEX (lane channel-feed-authority, 2026-10-06: `dueList` walked all 88 915 rows of a mailbox every pass) ──
  // Per account: `keys` sorted by (at, key) — each row's TIMER due instant under the cadence it had when keyed, a LOWER
  // bound (a tier only relaxes as time passes; a watch start re-keys) — and `marks` = the rows holding owed marks. A row
  // is re-keyed at the writes that move it: every index write (`store.index.onTouch`: a message's lastAt, an override, a
  // pause, an owed mark, unlisted), its poll stamp (`store.stamps.set`), a watch start. Built in ONE O(rows) pass at
  // boot and whenever the account's shared inputs change (the tier settings; the lane: push, the feed carrying or not).
  const dueIx = new Map();   // adapterId -> { sig, keys: [{key, at}], at: Map<key, at>, marks: Set<key>, dirty: Set<key>, stale }
  const dueStats = { builds: 0, rekeys: 0, lastBuildMs: 0 };
  // lane scheduler-census-index: the scheduler card's CENSUS INDEX (`clockIndexed`, beside `schedulerScan`) is re-judged
  // at the same writes as the due index
  const censusIx = new Map();   // adapterId -> { sig, t, kept, rows: Map<key, judgement>, order: [judgement], dirty: Set<key>, stale }
  function markDue(key) {
    if (key === null || key === undefined) { for (const ix of dueIx.values()) ix.stale = true; for (const cx of censusIx.values()) cx.stale = true; return; }
    const k = String(key), i = k.indexOf('/');
    const ix = i > 0 ? dueIx.get(k.slice(0, i)) : null;
    if (ix) ix.dirty.add(k);
    const cx = i > 0 ? censusIx.get(k.slice(0, i)) : null;
    if (cx) cx.dirty.add(k);
  }
  store.index.onTouch(markDue);
  { const set0 = store.stamps.set; store.stamps.set = (key, patch) => { const r = set0(key, patch); markDue(key); return r; }; }
  /** One row's timer instant (Infinity = never by the clock) and whether it holds owed marks. */
  function dueKeyOf(rec, lane, en, t, T) {
    if (en.unlistedAt) return { at: Infinity, owed: false };
    const cad = caps.cadenceFor(registry.capsOf(rec.kind), lane, en, t, { tiers: T, watched: isWatched(en.key, t) });
    const owed = !cad.paused && ((Number(en.feedOwedAt) || 0) > 0 || !!(en.threadOwed && typeof en.threadOwed === 'object' && Object.keys(en.threadOwed).length));
    if (cad.paused || !cad.seconds) return { at: Infinity, owed };
    return { at: (Number(laneOf(en).lastPollAt) || 0) + cad.seconds * 1000, owed };
  }
  const dueCmp = (a, at, key) => (a.at - at) || (a.key < key ? -1 : a.key > key ? 1 : 0);
  function dueSeek(keys, at, key) { let lo = 0, hi = keys.length; while (lo < hi) { const m = (lo + hi) >> 1; if (dueCmp(keys[m], at, key) < 0) lo = m + 1; else hi = m; } return lo; }
  function dueDrop(ix, key) {
    const at = ix.at.get(key);
    ix.marks.delete(key);
    if (at === undefined) return;
    ix.at.delete(key);
    const i = dueSeek(ix.keys, at, key);
    if (ix.keys[i] && ix.keys[i].key === key) ix.keys.splice(i, 1);
  }
  function duePut(ix, key, d) {
    if (d.owed) ix.marks.add(key);
    if (d.at === Infinity) return;
    ix.at.set(key, d.at);
    ix.keys.splice(dueSeek(ix.keys, d.at, key), 0, { key, at: d.at });
  }
  function dueRekey(rec, ix, key, t, T) {
    dueDrop(ix, key);
    const en = store.index.peek(key);
    if (en && en.adapterId === rec.id) duePut(ix, key, dueKeyOf(rec, ix.lane, en, t, T));
    dueStats.rekeys++;
  }
  /** The account's due index, current: built (one O(rows) pass) when absent / stale / its shared inputs changed; else
   *  the rows written since are re-keyed (O(written · log rows)). */
  function dueIndex(rec, t, T) {
    const lane = laneOrScan(rec, {});
    const sig = JSON.stringify([T, lane.via, lane.pollCadence, lane.why || null, lane.feedSeconds || null]);
    let ix = dueIx.get(rec.id);
    // a mass write (a boot's stamps, a big discovery page run) is one O(rows) build, never thousands of O(rows) splices
    if (!ix || ix.stale || ix.sig !== sig || ix.dirty.size > (ix.at.size >> 3) + 256) {
      const t0 = Date.now();
      ix = { sig, lane, keys: [], at: new Map(), marks: new Set(), dirty: new Set(), stale: false };
      for (const en of Object.values(store.index.live())) {
        if (!en || en.adapterId !== rec.id) continue;
        const d = dueKeyOf(rec, lane, en, t, T);
        if (d.owed) ix.marks.add(en.key);
        if (d.at !== Infinity) { ix.at.set(en.key, d.at); ix.keys.push({ key: en.key, at: d.at }); }
      }
      ix.keys.sort((a, b) => dueCmp(a, b.at, b.key));
      dueIx.set(rec.id, ix);
      dueStats.builds++; dueStats.lastBuildMs = Date.now() - t0;
      return ix;
    }
    ix.lane = lane;
    if (ix.dirty.size) { const ks = [...ix.dirty]; ix.dirty.clear(); for (const k of ks) dueRekey(rec, ix, k, t, T); }
    return ix;
  }
  /** lane discovery-cursor-persist (B-6638): the walk's state as the record keeps it (`rec.discovery`) — the PURE drain's
   *  `listingVerdict` decides: resume the kept cursor, nothing owed (listed whole before), or a walk from the first page. */
  function discFromRecord(rec) {
    const p = Drain.discoveryOf(rec.discovery);
    const v = Drain.listingVerdict({ persisted: p, complete: !!(p && p.complete) });
    return { cursor: v === 'resume' ? p.cursor : null, startedAt: v === 'resume' ? p.startedAt : null, lastCompleteAt: v === 'rewalk' ? 0 : (p.completeAt || 0), lastAt: v === 'rewalk' ? 0 : (p.at || 0) };
  }
  function discoveryDue(rec, e, t = now()) {
    if (e.disc.cursor || e.discoverSoon || !e.disc.lastCompleteAt) return true;
    // lane channel-feed-authority: under an AUTHORITATIVE carrying feed a new conversation is born by the feed (its head
    // listing) and a reseed asks the walk itself (`discoverSoon`) — the periodic re-walk is only the net for a conversation
    // that LEFT the listing (a label removed), once a day; never every cold cycle (88 915 threads = 890 pages each 15 min)
    const every = laneOrScan(rec, {}).pollCadence === 'feed-only' ? FEED_ONLY_REWALK_MS : tiers().coldSec * 1000;
    return t - e.disc.lastCompleteAt >= every;
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
    let pages = 0, complete = false, refused = false;
    await ensureLinked(rec);
    // lane discovery-cursor-persist: every walk's end (complete, cut by the budget, or thrown) is written to the record
    try { for (;;) {
      if (!affordable(rec, e)) break;
      const held = d.cursor;
      // the vendor refusing the KEPT cursor (its own word — `Drain.cursorRefused`) is the listing's, not a failed call
      const page = await vendor(rec, e, () => e.adapter.listConversations({ limit: 100, cursor: held }).catch((err) => { if (held && !refused && Drain.cursorRefused(err)) return { refusedCursor: err }; throw err; }));
      if (outlived(rec, e)) return { pages, complete: false };   // verify r4: a listing that outlived its entry mints no row
      if (page && page.refusedCursor) {
        refused = true;
        if (Drain.listingVerdict({ persisted: Drain.discoveryOf(rec.discovery), refused }) === 'rewalk') { d.cursor = null; d.startedAt = now(); }
        log.log(`[channels] ${rec.id}: the vendor refused the kept listing cursor (${page.refusedCursor.code}: ${String(page.refusedCursor.message || '').slice(0, 160)}) — the listing is walked again from its first page`);
        continue;
      }
      const listedAt = now();
      await store.index.update(() => {
        for (const c of page.conversations || []) admitListed(rec, c, listedAt);
      });
      d.cursor = page.cursor || null;
      pages++;
      if (!d.cursor) { complete = true; break; }
      if (pages >= DISCOVERY_MAX_PAGES) break;
    } } catch (err) { if (!outlived(rec, e)) { d.lastAt = now(); await keepDisc(rec, d).catch(() => {}); } throw err; }
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
    await keepDisc(rec, d);
    return { pages, complete };
  }
  /** lane discovery-cursor-persist: the walk's state reaches the record only AFTER the rows it listed are on disk (the
   *  index flush FIRST — the feed's owed-before-cursor order): a crash between the two re-lists, it never skips a row. */
  async function keepDisc(rec, d) {
    try { store.index.flush(); } catch (err) { log.warn(`[channels] ${rec.id}: the listed conversations were not flushed (${(err && err.message) || err}) — the listing's cursor on disk stays where it was`); return; }
    rec.discovery = Drain.discoveryRecord(d);
    await saveAdapters();
  }
  /** ONE listed conversation into the index — discovery's page and the authoritative feed's births share it (inside an
   *  index update; lane channel-feed-authority moved it out of `discover` verbatim). */
  function admitListed(rec, c, listedAt) {
    const isNew = !store.index.has(`${rec.id}/${c.id}`);   // B-f32b: a lookup — `ix.conversations` here made every page's index write a whole one
    const en = store.index.entry(rec.id, c.id);
    en.vendorId = c.vendorId; en.kind = c.kind;
    // lane gmail-quota-share: a STAND-IN title (the adapter skipped the naming read: the row is named) keeps the stored name
    const keepName = c.standIn === true && en.named === true;
    if (!keepName) en.title = c.title;
    if (!keepName) en.participants = c.participants;
    if (c.standIn === false) en.named = true;
    if (c.app === true) en.app = true; else if (en.app) delete en.app;   // design 012: the other side is an app
    if (c.lastAt && (!en.lastAt || c.lastAt > en.lastAt)) en.lastAt = c.lastAt;
    if (isNew) en.readAt = Number(rec.linkedAt) || listedAt;
    en.listedAt = listedAt;
    if (en.unlistedAt) delete en.unlistedAt;
    if ('tracked' in en) delete en.tracked;   // a pre-2026-09-26 row: the field gates nothing any more
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
    if (decl.authority === 'authoritative') return historyFeed(rec, e);
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
      // lane gmail-feed-gap: a long stop's older span is DECLARED a gap — no window of the feed searched it, so the coverage
      // net never judges a record there a miss (silence is not evidence the feed misses messages)
      if (w.gap) f.gaps = Feed.addGap(f.gaps, w.gap);
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
  /**
   * lane channel-feed-authority (OWNER'S LAW 2026-10-06: "获取更新" — fetch the updates, never ask each conversation):
   * THE AUTHORITATIVE FEED's page — ONE `changes()` (Gmail: one history.list, the pass's; the reads after it reuse its
   * memo) names the conversations that changed: they are the pass's due rows (under `feed-only` the clock makes none
   * due). A changed conversation the index lacks is born from the adapter's own listing (`admitListed`); a reseeded
   * cursor asks discovery's listing walk, never a per-row poll. A refusal is the feed's own (`feedRefusal`: a refused
   * feed's rows fall back to their tiers — positive evidence only).
   * lane gmail-feed-gap (B-5134): A GAP IS ONE WALK FROM THE CURSOR. The feed's cursor survives a silence (asleep, a
   * restart, an outage, a rate-limit park); `Feed.gapVerdict` judges it before the call: `catch-up` = this page is the
   * paged walk from the cursor (the adapter pages it, each page paced and metered through the gate), the tiers stay
   * parked meanwhile (channel-caps `feedState`: a cursor-holding feed carries through the gap — `feed.carrying`, persisted
   * with its `since`); a 404 is the adapter's `mustWalk` (the listing re-walk, as built); a rate refusal parks by name
   * and resumes from the same cursor. ONE journal line per gap. → `{due, pages?, catchUp?}` | `{skip}` | `{noCall}`.
   */
  async function historyFeed(rec, e) {
    const t = now();
    const f = feedRow(rec);
    if (f.refused) { if (feedStateOf(rec, t).state === 'refused') return { noCall: true }; f.refused = null; f.strikes = 0; f.strikeWhy = null; }
    if (Number(f.backoffUntil) > t) return { noCall: true };
    const fo = feedOpts();
    const cursorHeld = !!(f.carrying && Number(f.carrying.since) > 0);
    const gap = Feed.gapVerdict({ cursor: cursorHeld, lastPageAt: f.lastOkAt, now: t, coldTierSec: tiers().coldSec, freshBoundMs: Feed.freshMs(fo.everySec, fo.overlapSec) });
    f.lastRunAt = t;
    e.feedCalls = Feed.minuteAt(e.feedCalls, t).calls.concat([t]);
    let page;
    try { page = await vendor(rec, e, () => e.adapter.changes({})); }
    catch (err) {
      if (outlived(rec, e)) throw err;
      const r = await feedRefusal(rec, e, f, 'steady', err, false);
      if (f.refused) f.carrying = null;   // a refusal refutes the cursor: the rows fall back to their tiers (positive evidence only)
      else if (cursorHeld && f.backoffWhy === 'rate-limited' && f.strikes === 1) log.log(`[channels] ${rec.id}: the change feed's catch-up was limited by the vendor — parked by name until ${new Date(Number(f.backoffUntil)).toISOString()}; it resumes from its cursor, no conversation is read on its own`);
      return r;
    }
    if (outlived(rec, e)) return { skip: 'account-changed' };
    const changed = Array.isArray(page && page.changed) ? page.changed.map(String) : [];
    const births = (Array.isArray(page && page.conversations) ? page.conversations : []).filter((c) => c && c.id && !store.index.has(`${rec.id}/${c.id}`));
    if (births.length) { await ensureLinked(rec); await store.index.update(() => { for (const c of births) admitListed(rec, c, t); }); }
    if (page && page.mustWalk && !e.disc.cursor) e.discoverSoon = true;
    f.lastOkAt = now(); f.lastHits = changed.length; f.strikes = 0; f.strikeWhy = null; f.backoffUntil = null; f.backoffWhy = null;
    if (!cursorHeld) f.carrying = { since: f.lastOkAt };
    const pages = Math.max(1, Math.floor(Number(page && page.pages) || 1));
    const caughtUp = gap.verdict === 'catch-up' && !(page && page.mustWalk);
    if (caughtUp) {
      f.gaps = Feed.addGap(f.gaps, { from: gap.from, to: t });
      f.lastCatchUp = { at: t, gapMs: gap.gapMs, pages, touched: changed.length };
      const mins = Math.max(1, Math.round((Number(gap.gapMs) || 0) / 60e3));
      log.log(`[channels] ${rec.id}: the change feed resumed after ${mins} min — ${pages} history page${pages === 1 ? '' : 's'}, ${changed.length} conversation${changed.length === 1 ? '' : 's'} touched, 0 per-row reads`);
    }
    await store.adapters.update(() => {});
    const due = [];
    for (const id of changed) {
      const en = store.index.peek(`${rec.id}/${id}`);
      if (en && !(en.refresh && en.refresh.every === 'paused')) due.push({ key: en.key, dueAt: t });   // the owner's pause wins
    }
    if (births.length) notify(births.map((c) => `${rec.id}/${c.id}`), { full: false });
    return caughtUp ? { due, pages, catchUp: true } : { due };
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
      if (!(Number(laneOf(en).walkStartedAt) >= h.observedAt)) continue;   // its chat read has not run since — it waits
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
        countFresh(rec, convId, en, fresh);   // lane channel-self-unread: the owner's own message is read by construction
        en.authors = mergeAuthors(en.authors, fresh);
        en.authors = Av.stampSelf(en.authors, selfIdOf(rec));   // lane channels-list-polish: the account's id, at index time
        const newest = fresh.reduce((m, x) => (Number(x.at) > m && !FO.systemRead(x) ? Number(x.at) : m), 0);   // lane lark-system-records: a notice never moves the row
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
    const sm = Feed.coverageOf(records.map((r) => ({ vendorId: r && r.vendorId, at: r && r.at, msgType: rawFactsOf(rec, r).type })), { coveredTo, memStart: e.feedMemStart, seen: e.feedSeen, pending: e.feedPending, gaps: f.gaps });
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
      // lane gmail-feed-gap: the cursor feed's gap — "catching up since <t>" (the last good page), the carrying fact's `since`
      gapSince: fs.gapSince || null, since: fs.since || null, lastCatchUp: f.lastCatchUp || null,
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
    const decls = ((registry.vendor(rec.kind) || mod).OPTIONS) || [];
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
  /** lane lark-upload-preflight: what unlocks SENDING FILES (the module's `filesGrant`, `any` = one scope is enough). */
  function filesGrantView(rec) {
    let mod = null;
    try { mod = registry.get(rec.kind); } catch { mod = null; }
    const g = mod && mod.filesGrant;
    if (!g) return null;
    const held = new Set(((rec.auth && rec.auth.scopes) || []).map(String));
    const refusedBy = new Set(((rec.auth && rec.auth.refusedScopes) || []).map(String));
    // lane lark-upload-scope-split: `asked` = the scopes a consent can add (Lark: im:resource — never the deprecated V2);
    // `missing` / `refused` / `dropped` only ever name those. `dropped` = what the last consent's narrowing lost while
    // another held scope still carries files (a legacy token holding only V2) — the card says files still send
    const asked = Array.isArray(g.asked) && g.asked.length ? g.asked : g.scopes;
    const missing = g.any && g.scopes.some((x) => held.has(x)) ? [] : asked.filter((x) => !held.has(x));
    const dropped = missing.length ? [] : asked.filter((x) => !held.has(x) && refusedBy.has(x));
    return { scopes: g.scopes.slice(), missing, refused: missing.filter((x) => refusedBy.has(x)), dropped, console: !!g.console, wanted: true };
  }
  /** THE ONE GRANT LIST (§5.3): every declared grant the sign-in does not hold — the card says ONE line, ONE Re-authorize. */
  function grantsView(rec) {
    const out = [];
    const rx = reactionsGrantView(rec); if (rx) out.push({ what: 'reactions', ...rx });
    const fd = feedGrantView(rec); if (fd) out.push({ what: 'feed', ...fd });
    // lane lark-threads (B1/B5, MEASURED): reading people's profiles — the card says "One Re-authorize adds: reading
    // people's profiles" while the sign-in lacks it (never a silent refusal per person)
    const pp = peopleGrantView(rec); if (pp) out.push({ what: 'people', ...pp });
    // lane lark-upload-preflight (userW inc-muxsy69b-mjg1): SENDING FILES — "One Re-authorize adds: sending files" while
    // the sign-in holds none of the module's `filesGrant` scopes (ANY one carries files), never a silent drop at the send
    const fl = filesGrantView(rec); if (fl) out.push({ what: 'files', ...fl });
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
      const held = { keys: [], answers: [], timer: null, at: -Infinity };   // THE VIEWS ARE PACED: the window's early keys + their answers
      const flushEarly = () => {
        if (held.timer) { clearTimeout(held.timer); held.timer = null; }
        if (!held.keys.length) return;
        const keys = held.keys, answers = held.answers;
        held.keys = []; held.answers = []; held.at = performance.now();
        notify(keys, { full: false });
        for (const [list, outcome] of answers) deliver(list, outcome);
      };
      const sayEarly = (key) => {
        early.add(key); held.keys.push(key);
        const wait = held.at + VIEW_PACE_MS - performance.now();
        if (wait <= 0) flushEarly();
        else if (!held.timer) { held.timer = setTimeout(flushEarly, wait); if (held.timer.unref) held.timer.unref(); }
      };
      const answerAfterSaid = (key, list, outcome) => { if (held.keys.includes(key)) held.answers.push([list, outcome]); else deliver(list, outcome); };
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
        // lane gmail-quota-share: THE BUDGET LEARNS FROM THE REFUSAL — a burst's first strike halves the account's ceiling
        // (the pace follows), the later strikes only restart its quiet clock; persisted in the record's own write
        const learnt = rate ? stepBudget(rec, 'refused', { burstStart: e.rateStrikes === 1 }) : null;
        await store.adapters.update(() => { rec.lastPass = { at: now(), ok: false, code, error: String((err && err.message) || err).slice(0, 400) }; rec.consecutiveFailures = e.failures; if (learnt && learnt.changed) rec.budgetLearned = learnt.state; });
        if (learnt && learnt.halved) log.warn(`[channels] ${rec.id}: the vendor refused the rate — polling slowed to ${learnt.state.ceiling} of ${learnt.state.setting} a minute`);
        if (learnt && learnt.loud) await speakSlowed(rec, learnt.state);
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
          if (act.waiters.length) sayEarly(key);   // the broadcast naming the key goes out BEFORE the answer: the window repaints with the toast, not a pass later (paced: VIEW_PACE_MS)
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
        answerAfterSaid(key, act.waiters, { ok: true, appended: got.appended || 0, polledAt: lastPollOf(key) });
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
        // HOTFIX 2.369.226 (a fleet pod, 2026-10-06 22:37Z): on a 89 000-row mailbox the synchronous steps below
        // (`turn` → `next` → `apply`, every refuse / answer settled inline) ran 18 s back to back inside every 20 s
        // heartbeat round — the ws heartbeat, the liveness probes and every other tenant of the loop starved. The pass
        // now steps in TIME-BOUNDED SLICES: after STEP_SLICE_MS of synchronous stepping it yields one macrotask. The
        // drain's decisions are untouched (the slice boundary is not a `wait`; rule 18 stays the vendor pace).
        let sliceAt = now();
        for (;;) {
          if (now() - sliceAt >= STEP_SLICE_MS) { await new Promise((r) => setImmediate(r)); sliceAt = now(); }
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
        flushEarly();   // the held window's keys before the pass's own sentences
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
        const quiet = rec.budgetLearned ? stepBudget(rec, 'quiet-minute') : null;   // lane gmail-quota-share: the creep back to the setting
        await store.adapters.update(() => { rec.lastPass = { at: now(), ok: true, code: null }; rec.lastOkAt = rec.lastPass.at; rec.consecutiveFailures = 0; if (quiet && quiet.changed) rec.budgetLearned = quiet.state; });
        if (quiet && quiet.full) await retractSlowed(rec);
        await retractFailure(rec);
        retractUnsaved(rec);   // verify r6: that write landed the whole file — the sign-in is on disk
        retryHotConvCaps(rec);   // lane gmail-reply-known: an open window's refused send row asks again now
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
        flushEarly();   // every exit: the held window's broadcast and answers before the safety net below
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
  function lastPollOf(key) { const l = laneOf(store.index.peek(key) || {}); return Number(l.lastPollAt || l.lastScanAt) || null; }
  /** ONE conversation the vendor refused (it left the chat, the thread is
   *  gone): said on the row, polled again at its own cadence — never the
   *  whole account's failure. */
  async function noteConvRefusal(rec, convId, code, err) {
    await store.index.update(() => {
      const en = store.index.entry(rec.id, convId, { create: false });
      if (!en) return;
      en.lane = { ...(en.lane || {}), lastError: { code, at: now(), why: String((err && err.message) || err).slice(0, 200) } };   // the refusal is a real change of the row…
      store.stamps.set(en.key, { lastPollAt: now() });   // …its poll instant is a stamp (design 011 lane 2)
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
      // lane channel-self-unread: the owner's OWN message adds 0 and moves `readAt` to its instant (FO.readAdvance)
      if (freshRecs.length) countFresh(rec, convId, en, freshRecs);
      if (freshRecs.length) en.authors = mergeAuthors(en.authors, freshRecs);
      if (freshRecs.length) en.authors = Av.stampSelf(en.authors, selfIdOf(rec));   // lane channels-list-polish: the account's id, at index time
      // R3 (§23): the newest message the OWNER wrote here (`author.isSelf` — a reply from the vendor's own app
      // counts as much as one from our composer): one of the facts the first screen's attention list reads
      if (freshRecs.length) { const sa = selfAtOf(freshRecs); if (sa > (Number(en.selfAt) || 0)) en.selfAt = sa; }
      // The label is the RESOLVED lane — the one that just carried this
      // batch — never `caps.receive` (r3).
      en.lane = { ...en.lane, via: lane.via };
      // This pass FETCHED (a poll or a scan read), whatever lane the resolver
      // names for the row; `lastPushAt` is stamped by the push path alone.
      // design 011 lane 2: the instants are STAMPS (the store's side file) — a pass that brought nothing leaves the row's
      // bytes as they were, and the index is not written
      store.stamps.set(en.key, { [lane.via === 'scan' ? 'lastScanAt' : 'lastPollAt']: now(), ...(complete ? { walkStartedAt } : {}) });
      if (en.lane.lastError) delete en.lane.lastError;
      // lane lark-search-poll: a COMPLETE walk that started after the feed saw the message clears its owed mark (in the
      // SAME index update that stamps the walk); an incomplete one, a refusal or a cut leaves it owed
      if (complete) { if (en.feedOwedAt && Feed.owedSatisfied(en.feedOwedAt, walkStartedAt, { skewMs: 0 })) delete en.feedOwedAt; }
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
    // lane channels-list-polish: the account's own id resolved once (a sign-in that never named it), and this
    // conversation's authors handed to the people warm-up (the adapter's bounds; never awaited by the pass)
    if (typeof e.adapter.resolveSelf === 'function' && !selfIdOf(rec)) await e.adapter.resolveSelf().catch((err) => { if (err && err.code === 'rate-limited') throw err; });
    if (typeof e.adapter.warmPeople === 'function') {
      const en0 = store.index.live()[`${rec.id}/${convId}`];
      const ids = (en0 && Array.isArray(en0.authors) ? en0.authors : []).filter((a) => a && a.id && !a.isSelf && !a.isBot).map((a) => String(a.id));
      if (ids.length) e.adapter.warmPeople(ids).then((r) => namesFact(rec, r)).catch((err) => { if (!e.peopleWarmSaid) { e.peopleWarmSaid = true; log.warn(`[channels] ${rec.id}: the people warm-up stopped (${(err && err.message) || err})`); } });
    }
    return { appended, duplicates, anchorMoved, complete, judged, missed, readAt };
  }
  /** The newest instant among records the OWNER wrote (`author.isSelf` / the resolved `selfId` — FO.selfRead), 0 when none (R3 §23). */
  function selfAtOf(recs, selfId = null) {
    let t = 0;
    for (const r of recs || []) if (r && FO.selfRead(r, selfId) && Number(r.at) > t) t = Number(r.at);
    return t;
  }
  /** lane channel-self-unread: the log's records past `sinceAt` that are UNREAD — the re-derivation (invariant 7)
   *  without the owner's own (FO.selfRead: read by construction). */
  function unreadSince(adapterId, convId, sinceAt) {
    const self = selfIdOf({ id: adapterId });
    return store.countSince(adapterId, convId, sinceAt, (r) => !FO.selfRead(r, self) && !FO.systemRead(r));   // lane lark-system-records: a notice is read by construction
  }
  /** int229 (channel-self-unread × notify-rules-r2): "is this stored record the account's OWN message" as the watch asks it
   *  (FO.selfRead over the resolved id) — for the families: the Notify… preview never offers a match that never wakes. */
  function ownRecordOf(rec) { const self = selfIdOf(rec); return (r) => FO.selfRead(r, self); }
  /** lane channel-self-unread (userW inc-muxekkry-clfb): a batch into the row's count, at EVERY append site —
   *  FO.readAdvance: the owner's newest message moves `readAt` to its instant and the row is re-derived past it
   *  (older unread before it are read now); otherwise the batch's OTHER records past `readAt` add. */
  /** lane lark-system-records: a record that names NO author and is not a system notice is a vendor bug — the window and the hand-over
   *  print "(no sender)" (never "unknown"); logged once per conversation per hour (bounded, never per record). */
  const noSenderAt = new Map();
  function noteNoSender(rec, convId, fresh) {
    const n = (fresh || []).filter((r) => r && !FO.systemRead(r) && !(r.author && (r.author.id || r.author.name))).length;
    if (!n) return;
    const key = `${rec.id}/${convId}`, t = now();
    if (t - (noSenderAt.get(key) || 0) < 3600e3) return;
    noSenderAt.delete(key); noSenderAt.set(key, t);
    while (noSenderAt.size > 512) noSenderAt.delete(noSenderAt.keys().next().value);
    log.warn(`[channels] ${key}: ${n} record(s) name no sender and are not a system notice — shown as (no sender)`);
  }
  function countFresh(rec, convId, en, fresh) {
    noteNoSender(rec, convId, fresh);   // lane lark-system-records
    const ra = FO.readAdvance(en.readAt, fresh, selfIdOf(rec));
    if (ra.moved) { en.readAt = ra.readAt; en.unread = unreadSince(rec.id, convId, ra.readAt); }
    else en.unread = (Number(en.unread) || 0) + ra.unread;
  }
  /** The distinct authors seen in a conversation, newest first, bounded —
   *  the facts a pattern's `participant` / `from-address` rules match. */
  // lane channels-list-polish: an author keeps `isSelf` / `isBot` (a direct chat's peer is told by them), an EMPTY name
  // is filled by another sighting of the same id, and the account's own id (`self`, resolved) is stamped at index time
  function mergeAuthors(prev, recs, self = null) {
    const out = [];
    const seen = new Map();
    const add = (a) => {
      if (!a) return;
      const id = String(a.id || ''); const name = peerName(String(a.name || ''), 200) || ''; const k = id || name;
      if (!k) return;
      const had = seen.get(k);
      if (had) { if (!had.name && name) had.name = name; return; }
      const x = { id, name, ...(a.isSelf ? { isSelf: true } : {}), ...(a.isBot ? { isBot: true } : {}) };
      seen.set(k, x); out.push(x);
    };
    for (const r of [...recs].sort((x, y) => (Number(y.at) || 0) - (Number(x.at) || 0))) add(r.author);
    for (const a of Array.isArray(prev) ? prev : []) add(a);
    return Av.stampSelf(out.slice(0, AUTHORS_MAX), self);
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
  /**
   * DESIGN 008 (B-3cf8, userW 2026-10-02: 「第一次打开channel还是会卡几秒」 — measured on the pod: 77 538 430 bytes,
   * 1.49 s to first byte, ≈ 50 000 conversations). Without `keys` the digest is a SCOPE, never every row:
   *   'first'    (the route's default AND every non-partial broadcast) — the adapters, the counts, the totals and
   *              `conversations` = the ATTENTION rows (at most FO.ATTENTION_MAX, newest first; `attention:
   *              {total, cut}`) + each account's newest FO.HEAD_ROWS listed rows (`heads: {[adapterId]: [keys]}`,
   *              each row once) — built by `firstRead`: one pass, a rowView only for a candidate or a head;
   *   'accounts' everything but the rows (the window's Re-authorize reads);
   *   'totals'   `{unreadTotal, awaitingTotal, at}` (the rail badge).
   * `keys` = the partial broadcast's changed rows, unchanged. Every other row is read by key from `rows()`
   * (GET /api/channels/rows).
   */
  function digest({ keys = null, scope = 'first' } = {}) {
    const t = now();
    if (!keys && scope === 'totals') return { ...totalsNow(t), scope: 'totals', at: t };
    const recs = adapterRecords();
    const liveIx = store.index.live();
    const adapters = recs.adapters.map((rec) => adapterView(rec, t));
    // The kinds a user may still CONNECT (one record per kind in v1), each
    // with the credential facts the wizard's three copy paths need.
    const have = new Set(recs.adapters.map((r) => r.kind));
    const available = REAL_ADAPTERS.filter((m) => !have.has(m.kind)).map((m) => ({ kind: m.kind, label: m.label || m.kind, integration: m.integration || null, credential: credentialFacts(m.integration), credentials: offeredCredentials(m.integration), credentialDefault: defaultCredentialKey(m.integration), receive: m.caps.receive, sendAs: m.caps.sendAs }));
    const byId = new Map(recs.adapters.map((r) => [r.id, r]));
    const ctx = viewCtx(t);
    let conversations = null, first = null;
    if (keys) {
      conversations = keys.map((k) => liveIx[k]).filter(Boolean).map((en) => { const rec = byId.get(en.adapterId); return rec ? rowView(rec, en, ctx) : null; }).filter(Boolean);
      conversations.sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
    } else if (scope !== 'accounts') { first = firstRead(byId, liveIx, ctx); conversations = first.conversations; }
    // THE TOTALS are over EVERY conversation, partial or not (the rail badge
    // reads them off each broadcast) — KEPT, not re-summed (B-f32b): a partial
    // broadcast re-reads the rows touched since the last one; the kept facts re-sum on a whole-map touch or a minute
    // without one (design 008: a first read no longer forces a re-sum — it is no longer a walk of every row)
    const unreadTotal = unreadTotalOf(liveIx, byId, false);
    let awaitingTotal = 0;
    for (const n of ctx.outbox.values()) awaitingTotal += n.awaiting;
    // r4: EVERY connectable type (N accounts per type) with what the
    // type-first account dialog needs — `available` above keeps its P1a shape
    // for the pre-r4 panel.
    const kinds = REAL_ADAPTERS.map((m) => kindView(m));
    return {
      adapters, available, kinds,
      ...(conversations ? { conversations } : {}),
      ...(first ? { heads: first.heads, attention: first.attention } : {}),
      scope: keys ? 'partial' : scope === 'accounts' ? 'accounts' : 'first',
      partial: !!keys,
      unreadTotal, awaitingTotal,
      // design 008: the header's numbers from the KEPT facts (F7) — every listed row of an account that exists
      // (`all` leaves the built-in watcher out, as the first screen does), on every broadcast, never a walk
      counts: countsOf(recs.adapters),
      // r3: a store file set aside (or BLOCKED) at boot, on the FIRST SCREEN —
      // the For-you item alone left a real instance's vanished accounts
      // unexplained in the panel
      quarantined: (store.quarantined || []).map(({ file, to, why, at, blocked }) => ({ file, to: to || null, why, at, blocked: !!blocked })),
      at: t,
    };
  }
  /** design 008: the first screen's numbers — `all` = the listed rows of every account the first screen lists (not
   *  the built-in watcher), `byAdapter` = each account's listed rows: the kept facts, the old loops' numbers (V4). */
  function countsOf(adapters) {
    const by = rowFactsNow();
    const out = { all: 0, byAdapter: {} };
    for (const rec of adapters) { const n = (by.get(rec.id) || {}).conversations || 0; out.byAdapter[rec.id] = n; if (!rec.builtin) out.all += n; }
    return out;
  }
  /** The rail badge's two numbers, nothing else (`?scope=totals`). */
  function totalsNow(t = now()) {
    const recs = adapterRecords();
    const byId = new Map(recs.adapters.map((r) => [r.id, r]));
    let awaitingTotal = 0;
    for (const p of Object.values(store.outbox.live().proposals || {})) if (p && p.key && p.state === 'awaiting-approval') awaitingTotal++;
    return { unreadTotal: unreadTotalOf(store.index.live(), byId, false), awaitingTotal, at: t };
  }
  /** The rowViews the reads built (the scale suite's bound on a first read: ≤ ATTENTION_MAX + HEAD_ROWS per account). */
  const viewStats = { rowViews: 0, firstReads: 0, pages: 0 };
  /**
   * THE FIRST READ (design 008 §2): ONE pass over the live index — each account's listed rows gathered for its
   * newest FO.HEAD_ROWS, and the cheap `FO.candidateOf` test (the raw facts a tag is made of; it may over-include,
   * never miss). Only candidates and heads get a `rowView`; then the REAL predicate (`FO.statusTag`, the panel's own)
   * decides. The attention list is what the first screen lists — a listed row of an account that is not the built-in
   * watcher — at most FO.ATTENTION_MAX, drawn newest first; past it the LEAST urgent (FO.TAG_ORDER), then the oldest,
   * are cut (`attention.cut`, counted).
   */
  function firstRead(byId, liveIx, ctx) {
    const t = ctx.t;
    viewStats.firstReads++;
    const listed = new Map();   // adapterId → its listed entries (the heads are chosen per account)
    const cands = [];
    for (const k in liveIx) {
      const en = liveIx[k];
      const rec = en && byId.get(en.adapterId);
      if (!rec || en.unlistedAt) continue;
      let l = listed.get(en.adapterId);
      if (!l) { l = []; listed.set(en.adapterId, l); }
      l.push(en);
      if (!rec.builtin && FO.candidateOf(en, ctx.outbox.get(en.key), t)) cands.push(en);
    }
    const views = new Map();
    const viewOf = (en) => { let v = views.get(en.key); if (!v) { v = rowView(byId.get(en.adapterId), en, ctx); views.set(en.key, v); } return v; };
    const tagged = [];
    for (const en of cands) { const v = viewOf(en); const tag = FO.statusTag(v, t); if (tag) tagged.push({ v, rank: FO.TAG_ORDER.indexOf(tag.code) }); }
    // verify r1 (C): 300 newer "replied" rows used to push an old draft awaiting approval off the first screen — the cut
    // keeps statusTag's own order of urgency first, then the newest
    tagged.sort((a, b) => (a.rank - b.rank) || FO.pageOrder(a.v, b.v));
    const out = new Map();
    for (const { v } of tagged.slice(0, FO.ATTENTION_MAX)) out.set(v.key, v);
    const heads = {};
    // EVERY account has a head — an empty one too (a complete list the broadcast's new rows join)
    for (const id of byId.keys()) heads[id] = FO.selectPage(listed.get(id) || [], { limit: FO.HEAD_ROWS }).items.map((en) => { const v = viewOf(en); out.set(v.key, v); return v.key; });
    // verify r1 (C): `cut` = the tagged rows this answer does NOT carry — a tagged row past the cut that rides as an
    // account's head is on the client's first screen already (the panel draws `held + cut`; it was counted twice)
    let carried = 0;
    for (const x of tagged) if (out.has(x.v.key)) carried++;
    return { conversations: [...out.values()].sort(FO.pageOrder), heads, attention: { total: tagged.length, cut: tagged.length - carried } };
  }
  /**
   * EVERY OTHER ROW, BY KEY (design 008 §2, GET /api/channels/rows): one pass selecting the next `limit` rows after
   * the cursor `before = {lastAt, key}` in FO.pageOrder (no full sort). `view` 'all' = every listed row the first
   * screen lists, 'focus' = the attention rows past the first read's cut; `adapter` narrows to one account (its
   * card — the built-in watcher's too); `q` = the filter box's rule server-side (FO.textMatches over the title a
   * person reads, the account label, the last line; ≤ FO.QUERY_MAX characters); `keys` (≤ FO.PAGE_MAX) reads named
   * rows; `conv` reads a conversation id across accounts (a chat card's link). `limit` 1…FO.PAGE_MAX, default
   * FO.PAGE_ROWS. Answers `{ok, rows, next, total}` or a refusal by name.
   */
  function rows({ view = 'all', adapter = null, q = '', before = null, limit = FO.PAGE_ROWS, keys = null, conv = null } = {}) {
    const bad = (error) => ({ ok: false, code: 'bad-request', error });
    const t = now();
    const recs = adapterRecords();
    const byId = new Map(recs.adapters.map((r) => [r.id, r]));
    const liveIx = store.index.live();
    const ctx = viewCtx(t);
    const views = new Map();
    const viewOf = (en) => { let v = views.get(en.key); if (!v) { v = rowView(byId.get(en.adapterId), en, ctx); views.set(en.key, v); } return v; };
    viewStats.pages++;
    if (keys != null) {
      if (!Array.isArray(keys) || keys.length > FO.PAGE_MAX || keys.some((k) => typeof k !== 'string' || !k || k.length > 400)) return bad(`keys must be 1–${FO.PAGE_MAX} conversation keys`);
      const out = [...new Set(keys)].map((k) => liveIx[k]).filter((en) => en && byId.has(en.adapterId)).map(viewOf).sort(FO.pageOrder);
      return { ok: true, rows: out, next: null, total: out.length };
    }
    if (conv != null) {
      if (typeof conv !== 'string' || !conv || conv.length > 400) return bad('conv must be a conversation id (1–400 characters)');
      const out = [];
      for (const k in liveIx) { const en = liveIx[k]; if (en && en.id === conv && byId.has(en.adapterId)) out.push(en); }
      const page = FO.selectPage(out, { limit: FO.PAGE_MAX });
      return { ok: true, rows: page.items.map(viewOf), next: null, total: page.total };
    }
    if (view !== 'all' && view !== 'focus') return bad('view must be all or focus');
    const n = limit == null || limit === '' ? FO.PAGE_ROWS : Number(limit);
    if (!Number.isInteger(n) || n < 1 || n > FO.PAGE_MAX) return bad(`limit must be a whole number 1–${FO.PAGE_MAX}`);
    const s = FO.queryOf(q);
    if (s === null) return bad(`q is at most ${FO.QUERY_MAX} characters`);
    if (adapter != null && adapter !== '' && !byId.has(String(adapter))) return { ok: false, code: 'not-found', error: 'no such account' };
    const only = adapter != null && adapter !== '' ? String(adapter) : null;
    if (before != null && (typeof before !== 'object' || !Number.isFinite(Number(before.lastAt)) || typeof before.key !== 'string')) return bad('before must be a cursor {lastAt, key}');
    // THE QUERY'S CHEAP HALF: the name a person reads is the ladder's (it only ever drops or re-joins pieces of the raw
    // title, participants and author names) OR a person's profile name that N2 draws in place of the vendor's (lane
    // channel-names-readable: "Mira (Marketing)" for a vendor name "Dorn" — the nickname / English name / job title /
    // department, channel-authors ALT_KEYS, on the stored author or in the account's people memo by id). So every
    // letter/digit run of a query a name holds is in one of those raw strings. A row none of whose raw strings hold every
    // run cannot match by a name; only the rest pay for the ladder.
    const runs = s ? (s.match(/[\p{L}\p{N}]+/gu) || []) : [];
    const low = (x) => (x ? String(x).toLowerCase() : '');
    const bare = (x) => (x ? String(x).replace(HIDDEN_RE, '').toLowerCase() : '');
    const labelHit = new Map();
    const nameCould = (en) => {
      // verify r1 (S): a row WITHOUT a name of its own is named by its participants / authors, and the ladder's doors
      // (peerName, oneLine) DROP a hidden character inside a word there (a zero-width space in "Bo b" reads "Bob") — so
      // for those rows the raw side drops them too (over-including is safe, missing is not); a named row's title is
      // shown as stored (cleanSubject keeps every letter) and pays nothing more
      const named = typeof en.title === 'string' && en.title.length > 0 && en.title !== en.id && en.title !== en.vendorId;
      const side = named ? low : bare;
      const src = [low(en.title), side(en.participants), low(en.id)];
      if (Array.isArray(en.authors)) for (const a of en.authors) if (a && a.name) src.push(side(a.name));
      src.push(...altNamesOf(en));
      return runs.every((r) => src.some((x) => x.includes(r)));
    };
    // the names a person reads off a profile: the authors' `alt` values (the stored author's, else the people memo's by
    // id — personView's rule), the account's own id never (a query by the owner's own nickname is no conversation's
    // name); the memo and the own id read ONCE per account per call
    const peopleOf = new Map();
    const altNamesOf = (en) => {
      if (!Array.isArray(en.authors) || !en.authors.length) return [];
      let pm = peopleOf.get(en.adapterId);
      if (!pm) {
        const rec = byId.get(en.adapterId);
        let people = {};
        try { people = (rec && store.peopleRead(rec.id).people) || {}; } catch { people = {}; }
        pm = { self: rec ? selfIdOf(rec) : null, people };
        peopleOf.set(en.adapterId, pm);
      }
      const out = [];
      for (const a of en.authors) {
        if (!a || !a.id || a.isSelf || (pm.self && String(a.id) === pm.self)) continue;
        const p = pm.people[String(a.id)];
        const alt = a.alt && typeof a.alt === 'object' ? a.alt : p && p.alt && typeof p.alt === 'object' ? p.alt : null;
        if (alt) for (const k of Authors.ALT_KEYS) if (typeof alt[k] === 'string' && alt[k]) out.push(alt[k].toLowerCase());
      }
      return out;
    };
    const matches = (rec, en) => {
      if (!labelHit.has(rec.id)) labelHit.set(rec.id, FO.textMatches([rec.label || rec.id], s));
      if (labelHit.get(rec.id) || low(en.lastText).includes(s)) return true;
      return (!runs.length || nameCould(en)) && FO.textMatches([humanNameOf(rec, en) || en.id, ...altNamesOf(en)], s);
    };
    const keep = (en) => {
      const rec = byId.get(en.adapterId);
      if (!rec || en.unlistedAt || (only ? en.adapterId !== only : rec.builtin)) return false;
      if (s && !matches(rec, en)) return false;
      return view !== 'focus' || (FO.candidateOf(en, ctx.outbox.get(en.key), t) && !!FO.statusTag(viewOf(en), t));
    };
    const page = FO.selectPage(Object.values(liveIx), { before, limit: n, keep });
    return { ok: true, rows: page.items.map(viewOf), next: page.next, total: page.total };
  }
  /** THE KEPT ROW FACTS (B-f32b, lane channel-index-copy): every partial broadcast (a window's watch, its mark-read)
   *  summed `unread` over all 50 274 rows of userW's index, and each account's census walked them all again. A row's
   *  facts that the clock does not move — listed / unlisted, unread, paused, overridden, being read, walked — are kept
   *  per account: the store says which rows an update touched (`index.onTouch`: a key, or null = the whole map) and
   *  only those are re-read. A whole-map touch re-sums every row — the same numbers as the old loops
   *  (test-channels-index-scale ⑥, test-channels-census-pace). lane scheduler-census-index (B-7978): the minute's
   *  re-sum is gone — 100 ms of every minute's pass at 90 298 rows; the door's touch is the one signal, as for the due
   *  and census indexes (test-channel-census holds the kept facts to the walk after every step). */
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
    if (resum || !rowKept.stale) {
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
        if (v.files) out.files = { send: !!v.files.send, why: v.files.why || null, requiredScopes: Array.isArray(v.files.requiredScopes) ? v.files.requiredScopes.slice() : [] };   // lane lark-upload-preflight
        else if (cc.files) out.files = cc.files;
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
  /** A STORED RECORD'S VENDOR FACTS (lane dc-channels-blocks, C5): the module's declared `rawFacts(record)` →
   *  {tenant, type, subject} — the engine asks by NAME and never reads a vendor's raw field. {} when the adapter
   *  declares none or its hook throws. */
  function rawFactsOf(rec, r) {
    let mod = null;
    try { mod = rec ? registry.get(rec.kind) : null; } catch { mod = null; }
    if (!r || !mod || typeof mod.rawFacts !== 'function') return {};
    try { const f = mod.rawFacts(r); return f && typeof f === 'object' ? f : {}; } catch { return {}; }
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
   * organization's nickname, else the name, then `(department)` / `(job title)` per the vendor's declared `nameField` row) › the id;
   * the vendor `name` kept (the title, the search key, what a filter matches); `external` when the sender's organization
   * is not the account's; a bot never "app" (the module's own view ran first; a nameless bot is "Bot <last 4>").
   */
  function withAuthor(rec, r) {
    if (!r || !r.author || typeof r.author !== 'object' || !rec) return r;
    { const pa = personView(rec, r.author); if (pa !== r.author) r = { ...r, author: pa }; }   // lane channels-list-polish: self + the people memo
    let a = r.author;
    if (a.isBot && (!a.name || a.name === 'app')) a = { ...a, name: `Bot ${String(a.id || '').replace(/[^A-Za-z0-9]/g, '').slice(-4)}`.trim() };
    const alias = aliasOf(rec.id, a.id);
    let tenantSelf = null;
    try { const e = live.get(rec.id); tenantSelf = e && e.adapter && typeof e.adapter.selfTenant === 'function' ? e.adapter.selfTenant() : null; } catch { tenantSelf = null; }
    const v = Authors.authorView(a, { alias, field: nameFieldOf(rec.kind), selfTenant: tenantSelf, tenant: rawFactsOf(rec, r).tenant });
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
  /** B5: how a person of `kind` is named — the setting its vendor's table DECLARES for the `nameField` role (lane
   *  dc-channels-manifest, rv C4 / F8: never a vendor's key here): none | department | jobTitle (default department);
   *  a kind declaring no such row (a fake) reads the one row the vendors declare — today's single setting. */
  function nameFieldOf(kind) {
    const key = ChannelSettings.declaredKey(kind, 'nameField') || NAME_FIELD_KEY;
    if (!key) return 'department';
    let v = null;
    try { v = serverSetting(key); } catch { v = null; }
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
    if (Array.isArray(x.facts)) out.facts = agentFacts(x.facts);   // lane message-facts: the record's own facts through the door (withView folds the side ones in)
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
  /** lane channels-list-polish: THE ACCOUNT'S OWN ID — a resolved fact (the live adapter's, else the one the account's
   *  people memo kept from an earlier resolution); null = not known, never a guess. */
  function selfIdOf(rec) {
    let s = null;
    try { const x = rec && live.get(rec.id); s = x && x.adapter && typeof x.adapter.selfId === 'function' ? x.adapter.selfId() : null; } catch { s = null; }
    if (typeof s === 'string' && s) return s;
    try { s = rec ? store.peopleRead(rec.id).self : null; } catch { s = null; }
    return typeof s === 'string' && s ? s : null;
  }
  /** ONE author as the account's people memo names it (read time; the store is never rewritten): the own id wears
   *  `isSelf`; a person's EMPTY name goes down the ladder (member list › a message's sender name › the profile — the id
   *  stays the caller's last rung) and the profile's alternatives (`alt`: the nickname…) ride along. */
  function personView(rec, a, self = selfIdOf(rec)) {
    if (!a || typeof a !== 'object' || !a.id) return a;
    const id = String(a.id);
    if (self && id === self) return a.isSelf ? a : { ...a, isSelf: true };
    if (a.isSelf || a.isBot) return a;
    let p = null;
    try { p = store.peopleRead(rec.id).people[id] || null; } catch { p = null; }
    if (!p || typeof p !== 'object') return a;
    const name = a.name ? a.name : Av.nameLadder({ member: p.member, sender: p.sender, profile: p.name }).name;
    const alt = !a.alt && p.alt && typeof p.alt === 'object' ? p.alt : null;
    return name === a.name && !alt ? a : { ...a, name: name || a.name || '', ...(alt ? { alt } : {}) };
  }
  /** A conversation's authors as every surface reads them — an index written before the identity was known HEALS here. */
  function authorsView(rec, en) {
    const self = selfIdOf(rec);
    return (Array.isArray(en && en.authors) ? en.authors : []).map((a) => personView(rec, a, self));
  }
  function dmTitleOf(rec, en) {
    if (!en || en.kind !== 'dm') return null;
    const self = selfIdOf(rec);
    if (!self) return null;   // lane channels-list-polish: the OTHER member cannot be told without the account's own id
    const a = authorsView(rec, en).find((x) => x && x.name && !x.isSelf && x.id !== self);
    return a ? peerName(String(a.name), 200) : null;
  }
  /** B-c127 THE NAME LADDER (src/channel-ref.js) — what a HUMAN reads for a conversation: ① its own name (a chat's
   *  title, a mail's cleaned subject) → ② a single chat's other party, the description / participants the vendor
   *  listed, the authors seen in it → null, the caller's ③ (the id, only when nothing else is known). */
  function humanNameOf(rec, en) {
    if (!rec || !en) return null;
    const self = selfIdOf(rec);
    en = { ...en, authors: authorsView(rec, en) };   // lane channels-list-polish: the healed authors (self stamped, names from the memo)
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
    viewStats.rowViews++;
    const t = ctx.t;
    const c = registry.capsOf(rec.kind);
    const lane = laneOrScan(rec, en);
    const cadence = caps.cadenceFor(c, lane, en, t, { tiers: ctx.T, watched: isWatched(en.key, t) });
    const eff = effectiveFor(en);
    const ob = ctx.outbox.get(en.key) || { awaiting: 0, unknown: 0 };
    const lw = en.stats && Array.isArray(en.stats.wakes) && en.stats.wakes.length ? en.stats.wakes[en.stats.wakes.length - 1] : null;
    return {
      key: en.key, id: en.id, adapterId: en.adapterId, adapterLabel: rec.label || rec.id, title: humanNameOf(rec, en), kind: en.kind, ...(en.app ? { app: true } : {}), ...picOf(rec, en, c),   // B-c127: THE NAME LADDER (null = nothing known; the client's ③)
      participants: en.participants, lastAt: en.lastAt, lastText: en.lastText || '', ...lastWhoOf(rec, en), unread: en.unread || 0,
      unlisted: !!en.unlistedAt,
      refresh: en.refresh && typeof en.refresh === 'object' ? { every: en.refresh.every, by: en.refresh.by || null } : null,
      cadence: { seconds: cadence.seconds, tier: cadence.tier, source: cadence.source, paused: !!cadence.paused },
      freshness: caps.freshnessClaim(c, lane, { ...en, lane: laneOf(en) }, t, { enabled: rec.enabled !== false, cadence }),
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
      convCapsChecking: convCapsFlights.has(`${adapterId}/${convId}`),   // lane gmail-reply-known: the foot says "Checking…"
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
    const mod = registry.vendor(rec.kind) || null;
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
      // design 012 (Slack S1): the policy modes the vendor allows (the picker hides the rest), what removing the account
      // does to its local copy, and the first real install's probe list (`setup`, written by the adapter by name)
      policyModes: P.policyModesOf(c), retention: c.retention || 'keep', setup: setupView(rec),
      // B-a085: a reply here may go to EVERYONE on the message it answers (mail — the composer's "Reply all")
      replyAll: c.replyEnvelope === true,
      sendGrant: sendGrantView(rec),
      // lane channel-threads: what unlocks READING reactions (the scope, the console step) + the trickle's minute
      reactionsGrant: reactionsGrantView(rec),
      // lane lark-search-poll: the change feed (its state, mode, measurement, catch-up) + THE ONE GRANT LIST (§5.3)
      feed: feedView(rec, t),
      grants: grantsView(rec),
      // lane channel-names-readable: whether this sign-in may read people's profiles (the kept fact) + the caps row word
      namesReadable: caps.namesView(rec.namesReadable),
      names: caps.namesRow(rec.namesReadable),
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
      rawApi: !!(mod && mod.api),   // lane channel-vendor-one-file: the account menu's "API access…" row reads this, never a kind
      options: viewOptions(mod, rec),
      optionsSchema: (mod && mod.OPTIONS ? mod.OPTIONS : []).map((o) => ({ key: o.key, label: o.label, help: o.help || '', default: o.default === undefined ? '' : o.default, placeholder: o.placeholder || '', choices: Array.isArray(o.choices) ? o.choices.slice() : null, choiceLabels: o.choiceLabels && typeof o.choiceLabels === 'object' ? { ...o.choiceLabels } : null, usedWhen: o.usedWhen && typeof o.usedWhen === 'object' ? JSON.parse(JSON.stringify(o.usedWhen)) : null })),
    };
  }

  /** The account's scheduler census computed from EVERY row at instant `t` (the card's "N conversations · M unread"
   *  line and the tiers' counts) — THE DEFINITION the kept census below is held to; reached only by `schedulerExact`
   *  (the gates), never by a pass (lane scheduler-census-index). */
  function schedulerScan(rec, t = now()) {
    const out = { conversations: 0, unread: 0, hot: 0, warm: 0, cold: 0, paused: 0, overridden: 0, unlisted: 0, due: 0, lastDiscoveryAt: null, discovering: false, firstIngest: null };
    let walked = 0, reading = 0;   // lane R5: the first-read census — conversations being read (not paused, not refused by the vendor) and those walked once
    const T = tiers();
    const c = registry.capsOf(rec.kind);
    const lane = laneOrScan(rec, {});
    for (const en of Object.values(store.index.live())) {
      censusIxStats.rowsRead++;
      if (!en || en.adapterId !== rec.id) continue;
      if (en.unlistedAt) { out.unlisted++; continue; }
      out.conversations++;
      out.unread += Number(en.unread) || 0;
      const cad = caps.cadenceFor(c, lane, en, t, { tiers: T, watched: isWatched(en.key, t) });
      if (cad.paused) out.paused++; else if (cad.tier === 'hot') out.hot++; else if (cad.tier === 'warm') out.warm++; else out.cold++;
      if (cad.source === 'override') out.overridden++;
      const last = Number(laneOf(en).lastPollAt) || 0;
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
    const s = clockIndexed(rec, t);
    c = { at: t, hot: s.hot, warm: s.warm, cold: s.cold, due: s.due, timer: null };
    censusTimed.set(rec.id, c);
    censusCount.set(rec.id, (censusCount.get(rec.id) || 0) + 1);
    return c;
  }
  /** THE CENSUS INDEX (lane scheduler-census-index, B-7978 — 2026-10-07: the card's clock counts walked every row of
   *  the index for every account, ≈ 270 ms a pass at 90 298 rows, the pass's last O(rows) term). Per account: each
   *  row's JUDGEMENT (src/channel-census.js `rowClock`: its class, due, and the instant until which both hold) and the
   *  counters they sum to. A census re-judges the rows a write touched (`markDue`: an index write, a poll stamp, a
   *  watch start) and the rows whose instant the clock passed (`order`, soonest first) — O(touched + crossed), never
   *  O(rows). Built in ONE O(rows) pass when absent / stale (a whole-map write) / its shared inputs changed (the tier
   *  settings; the lane — the due index's signature) / the clock went back / a mass write (as the due index). */
  // `rowsRead` = every row a census looked at, either path (the walk below counts too — the gates' work meter)
  const censusIxStats = { builds: 0, rejudged: 0, rowsRead: 0, lastBuildMs: 0 };
  function censusJudge(rec, lane, en, t, T) {
    if (!en || en.adapterId !== rec.id || en.unlistedAt) return null;
    const cad = caps.cadenceFor(registry.capsOf(rec.kind), lane, en, t, { tiers: T, watched: isWatched(en.key, t) });
    const j = Census.rowClock({ paused: cad.paused, tier: cad.tier, seconds: cad.seconds, lastPollAt: Number(laneOf(en).lastPollAt) || 0, tierUntil: caps.tierUntil(en, t, { tiers: T }), watchUntil: watching.get(en.key) || 0 }, t);
    j.key = en.key;
    return j;
  }
  function censusPut(cx, j) {
    cx.rows.set(j.key, j);
    if (j.at === Infinity) return;
    let lo = 0, hi = cx.order.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (Census.untilCmp(cx.order[m], j) < 0) lo = m + 1; else hi = m; }
    cx.order.splice(lo, 0, j);
  }
  function censusDrop(cx, key) {
    const j = cx.rows.get(key);
    if (!j) return null;
    cx.rows.delete(key);
    if (j.at !== Infinity) {
      let lo = 0, hi = cx.order.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (Census.untilCmp(cx.order[m], j) < 0) lo = m + 1; else hi = m; }
      if (cx.order[lo] === j) cx.order.splice(lo, 1);
    }
    return j;
  }
  function censusRejudge(rec, cx, key, t, T) {
    const was = censusDrop(cx, key);
    const j = censusJudge(rec, cx.lane, store.index.peek(key), t, T);
    Census.censusStep(cx.kept, was, j);
    if (j) censusPut(cx, j);
    censusIxStats.rejudged++; censusIxStats.rowsRead++;
  }
  /** The account's clock counters at `t` ({hot, warm, cold, due} — what `schedulerScan` counts), from the index. */
  function clockIndexed(rec, t) {
    const T = tiers();
    const lane = laneOrScan(rec, {});
    const sig = JSON.stringify([T, lane.via, lane.pollCadence, lane.why || null, lane.feedSeconds || null]);
    let cx = censusIx.get(rec.id);
    if (!cx || cx.stale || cx.sig !== sig || t < cx.t || cx.dirty.size > (cx.rows.size >> 3) + 256) {
      const t0 = Date.now();
      cx = { sig, t, lane, kept: Census.emptyCounts(), rows: new Map(), order: [], dirty: new Set(), stale: false };
      for (const en of Object.values(store.index.live())) {
        censusIxStats.rowsRead++;
        if (!en || en.adapterId !== rec.id) continue;
        const j = censusJudge(rec, lane, en, t, T);
        if (!j) continue;
        Census.censusStep(cx.kept, null, j);
        cx.rows.set(j.key, j);
        if (j.at !== Infinity) cx.order.push(j);
      }
      cx.order.sort(Census.untilCmp);
      censusIx.set(rec.id, cx);
      censusIxStats.builds++; censusIxStats.lastBuildMs = Date.now() - t0;
      return { ...cx.kept };
    }
    cx.lane = lane;
    if (cx.dirty.size) { const ks = [...cx.dirty]; cx.dirty.clear(); for (const k of ks) censusRejudge(rec, cx, k, t, T); }
    // the rows whose judgement the clock passed: taken off the head once, re-judged at `t` (each re-keys past `t`)
    let n = 0;
    while (n < cx.order.length && Census.expired(cx.order[n], t)) n++;
    if (n) {
      const crossed = cx.order.splice(0, n);
      for (const j of crossed) { if (cx.rows.get(j.key) === j) cx.rows.delete(j.key); else continue; const now2 = censusJudge(rec, lane, store.index.peek(j.key), t, T); Census.censusStep(cx.kept, j, now2); if (now2) censusPut(cx, now2); censusIxStats.rejudged++; censusIxStats.rowsRead++; }
    }
    cx.t = t;
    return { ...cx.kept };
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
    const c = clockCensus(rec, t);
    return schedulerOf(rec, c);
  }
  /** The card's census from the kept row facts + clock counters `c`. */
  function schedulerOf(rec, c) {
    const f = rowFactsNow().get(rec.id) || {};
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
      // design 008: a non-partial broadcast is the FIRST READ's shape (bounded) — "what you show may be stale"; the
      // client re-reads the list on screen (src/lib/channel-rows.js `applyBroadcast`), never every row
      const d = digest(partial ? { keys: uniq } : { scope: 'first' });
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
    if (Array.isArray(w.fresh)) { const sa = selfAtOf(w.fresh, selfIdOf(rec)); if (sa > (b.selfAt || 0)) b.selfAt = sa; }
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
        if (b.selfAt > (Number(en.readAt) || 0)) en.readAt = b.selfAt;   // lane channel-self-unread: sending = read up to it
        en.unread = unreadSince(rec.id, convId, en.readAt || 0);
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
  function unavailableWordsOf(rec) {
    let mod = null;
    try { mod = registry.get(rec.kind); } catch { mod = null; }
    return mod && mod.unavailableWords && typeof mod.unavailableWords === 'object' ? { ...mod.unavailableWords } : null;
  }
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
      // lane dc-channels-blocks (C6): the live lane's OWN words for its parked codes, while it is parked
      unavailableWords: p.state === 'unavailable' ? unavailableWordsOf(rec) : null,
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
    // lane search-card-open (.233): the vendor-search memo outlives a rebuild (options, client, disabled) but not the
    // account — a disconnect or a removal forgets it, file and all (a later sign-in may be someone else)
    if (why === 'disconnected' || why === 'removed') forgetSearchMemo(id);
    const e = live.get(id);
    if (!e) return;
    disarmPush(e, why);
    live.delete(id);
    // lane discovery-cursor-persist: every lifecycle verb (a client switch, re-connect, options, disable) re-lists the
    // account from its first page, as before the cursor was kept — the record's walk state goes with the entry
    if (e.record) e.record.discovery = null;
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
    if (!was) markDue(key);   // lane channel-feed-authority: the due index re-keys a row whose cadence just shortened
    for (const [k, exp] of watching) if (exp <= t) watching.delete(k);
    const en = store.index.peek(key) || {};
    const last = Number(laneOf(en).lastPollAt) || 0;
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
      const waits = cc.retryAt && cc.retryAt > t;   // lane gmail-reply-known: a refused row is asked again by its own timer
      if (rec.enabled !== false && !waits && (cc.why === 'stale' || cc.why === 'unknown' || cc.read === 'unknown')) refreshConvCaps(adapterId, convId, { polite: true }).then(() => notify([key]), (err) => log.warn(`[channels] ${key}: send row lookup on open failed: ${(err && err.message) || err}`));
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
  // verify r1 (lane channel-attach-read): the key names the MESSAGE too — a Gmail part id (`part:1`) repeats in every mail
  // of a thread, so one mail's formatted body and the next mail's PDF shared one cache file, one flight and one refusal
  const attInflight = new Map();   // `${adapterId}/${convId}/${msg}/${attId}` -> Promise of the answer
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
          if (store.attachmentGet(rec.id, convId, a.id, r.vendorId)) continue;
          await store.attachmentPut(rec.id, convId, a.id, { msg: r.vendorId, data: h.data, name: peerName(a.name, 256) || null, mime: h.mime || a.mime || 'text/html' }, { budgetBytes: attachmentBudgetBytes() });
        } catch (err) { log.warn(`[channels] ${rec.id}: keeping the formatted body of ${r.vendorId} failed (${(err && err.message) || err}) — the window fetches it on demand`); }
      }
    }
  }
  /** lane channel-attach-read (B-d6b9, design 005 §2.A): WHAT AN AGENT IS TOLD beside the bytes — who sent the message
   *  that carries it and in which conversation (the head `read` prints: the read-time view + the agent's copy), and the
   *  type the vendor said; each a line piece through the belt (a peer's name, a title and a mail part's Content-Type are
   *  the peer's words). REACH IS ASKED AGAIN here: the fetch / the join awaited, and the owner's revoke may have landed
   *  inside it (the read route's rule — `stillSees`); a refusal passes through as it is. */
  function agentAttachmentAnswer(ctx, adapterId, convId, attId, msg, r) {
    if (!stillSees(ctx, adapterId, convId)) return ACL.notFound();
    if (!r || !r.ok) return r;
    const { en, rec } = convFor(adapterId, convId);
    const carrier = msg && typeof store.findRecord === 'function' ? store.findRecord(adapterId, convId, String(msg)) : null;
    const carries = !!(carrier && Array.isArray(carrier.attachments) && carrier.attachments.some((a) => a && String(a.id) === String(attId)));
    const seen = carries ? viewsOf(rec, [carrier]).map(agentCopy)[0] : null;
    const who = seen && seen.author ? seen.author.name || seen.author.id : null;
    const meta = r.meta || {};
    return {
      ok: true, file: r.file, cached: !!r.cached,
      mime: meta.mime ? agentText(meta.mime, { kind: 'line', max: 128 }) : null, from: who ? agentText(who, { kind: 'line', max: 200 }) : null, conversation: { key: agentId(en.key), adapterId, id: agentId(convId), title: agentTitle(en, convId) },
    };
  }
  async function attachment(adapterId, convId, attId, { msg = null, retry = false, by = 'owner', principal: ctx = null } = {}) {
    // lane channel-attach-read (B-d6b9): AN AGENT'S FETCH is the read route's reach FIRST — a conversation it may not
    // read (hidden, requestable, a disabled account, none at all) is the uniform not-found, before the cache is asked
    const agent = by === 'agent';
    if (agent && !(ctx && ctx.kind === 'agent' && stillSees(ctx, adapterId, convId))) return ACL.notFound();
    const answer = (x) => (agent ? agentAttachmentAnswer(ctx, adapterId, convId, attId, msg, x) : x);
    const rec = adapterRecords().adapters.find((r) => r.id === adapterId);
    if (!rec || !known(adapterId, convId)) return { ok: false, code: 'not-found', error: 'No such conversation' };
    // …and it names the MESSAGE that carries it (read prints both): a part of that record — never the formatted BODY (a
    // `role: 'body'` part: §25, an agent reads `text`, the window draws the body; its id is guessable, `part:1`), and never a
    // cached file of this conversation by an id no message it names carries — both the same not-found as no attachment
    if (agent) {
      const carrier = msg && typeof store.findRecord === 'function' ? store.findRecord(adapterId, convId, String(msg)) : null;
      const part = carrier && Array.isArray(carrier.attachments) ? carrier.attachments.find((a) => a && String(a.id) === String(attId)) : null;
      if (!part || part.role === 'body') return { ok: false, code: 'not-found', error: 'no message in this conversation carries that attachment' };
    }
    const scope = msg ? String(msg) : null;
    const k = `${adapterId}/${convId}/${scope || ''}/${attId}`;
    // a file cached under the bare id before the key named the message is the owner's window's still (it opens what it
    // drew); an agent is never handed one — it cannot tell which mail of the thread wrote it. verify r2: and the window only
    // while ONE message of the conversation carries that id — a Gmail `part:N` repeats in every mail of a thread, so a bare
    // file of a repeated id is whichever mail was drawn first (mail g0's body opened as g1's body, as g2's PDF): re-fetched
    const legacy = () => {
      const o = store.attachmentGet(adapterId, convId, attId);
      if (!o || (o.meta && o.meta.msg)) return null;
      const carriers = store.readTail(adapterId, convId, { limit: 5000 }).filter((r) => r && Array.isArray(r.attachments) && r.attachments.some((a) => a && String(a.id) === String(attId)));
      return carriers.length === 1 && String(carriers[0].vendorId) === scope ? o : null;
    };
    const hit = store.attachmentGet(adapterId, convId, attId, scope) || (scope && !agent ? legacy() : null);
    const t = now();
    const remembered = rememberedRefusal(k, t);
    let v = Att.fetchVerdict({ cached: !!hit, remembered, retry: !!retry });
    if (v.act === 'serve') return answer({ ok: true, file: hit.file, meta: hit.meta, cached: true });
    if (v.act === 'refuse') return { ok: false, code: v.code, error: remembered.error, retryAfterSec: remembered.retryAfterSec ? Math.max(1, Math.ceil((remembered.until - t) / 1000)) : undefined, remembered: true };
    if (retry) attRefused.delete(k);
    const owner = ownerRecordOf(adapterId, convId, attId, msg);
    const e = adapterFor(rec);
    const c = registry.capsOf(rec.kind);
    // lane channel-rich: a body the adapter still HOLDS from its ingest (zero vendor units) — written, then served
    const held = owner && e && e.adapter && typeof e.adapter.heldAttachment === 'function' ? e.adapter.heldAttachment(owner.vendorId, attId) : null;
    if (held && held.data) {
      const hatt = owner.attachments.find((a) => String(a.id) === String(attId)) || {};
      const put = await store.attachmentPut(adapterId, convId, attId, { msg: scope, data: held.data, name: peerName(hatt.name, 256) || null, mime: held.mime || hatt.mime || null }, { budgetBytes: attachmentBudgetBytes() });
      return answer({ ok: true, file: put.file, meta: put.meta, cached: false, held: true });
    }
    v = Att.fetchVerdict({
      cached: false, remembered: null, owner: !!owner, fetchable: c.attachments === 'fetch', enabled: rec.enabled !== false,
      inflight: attInflight.has(k), backoff: inBackoff(e) || (Number(e.attBackoffUntil) || 0) > t, affordable: affordable(rec, e),
    });
    if (agent && v.act === 'join') return answer(await attInflight.get(k));   // a fetch already in flight: joined, no second charge
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
    // THE AGENTS' SHARE (B-d6b9): an agent's fetch is an agent refresh's door — past `channels.agentBudgetSharePct` of
    // the account's minute it is refused by name with the wait, and what it spends is charged to the agents' share
    if (agent) { const sh = agentShareRefusal(rec, e); if (sh) return sh; }
    const att = owner.attachments.find((a) => String(a.id) === String(attId));
    const run = (async () => {
      let r;
      // verify r2: the OWNER's fetch names its spender too — `e.chargeBy` is the pass's, and an agent's own refresh in flight
      // (`chargeTo: 'agent'`) put the owner's opened picture on the agents' share
      try { r = await spendAs(agent ? 'agent' : 'owner', () => vendor(rec, e, () => e.adapter.fetchAttachment(convId, { messageId: owner.vendorId, attachmentId: attId, mime: att.mime || null, name: att.name || null }))); }
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
      const put = await store.attachmentPut(adapterId, convId, attId, { msg: scope, data, name: peerName(att.name, 256) || peerName(r && r.name, 256) || null, mime: (r && r.mime) || att.mime || null }, { budgetBytes: attachmentBudgetBytes() });
      if (put.evicted.length) log.log(`[channels] ${adapterId}: attachment cache over ${Math.round(attachmentBudgetBytes() / 1048576)} MB — evicted ${put.evicted.length} least-recently-used file(s)`);
      return { ok: true, file: put.file, meta: put.meta, cached: false, evicted: put.evicted.length };
    })();
    attInflight.set(k, run);
    try { return answer(await run); } finally { attInflight.delete(k); }
  }

  // ══ lane message-facts (B-f066, design 007 S5): THE FACTS OF A MESSAGE STORED BEFORE THEM ═══════════════
  // The owner opens Details on a message whose record carries no facts (stored before the lane): ONE `factsOf` of the
  // whole thread — single-flight per thread, through the account's budget and back-off, refusals by name (the attachment
  // route's discipline) — writes an `fx` side line for EVERY message of this conversation's log it names; every later ask
  // (any message of that thread) is a side hit, served free. Only the owner's route asks: ingest never backfills, an
  // agent's read prints what is stored.
  const factsFlights = new Map();   // `${adapterId}/${convId}` → the ONE thread read in flight
  function storedOf(adapterId, convId, vid) {
    const hit = typeof store.findRecord === 'function' ? store.findRecord(adapterId, convId, vid) : null;
    if (hit) return hit;
    return store.readTail(adapterId, convId, { limit: 5000 }).find((r) => String(r.vendorId) === vid) || null;
  }
  async function messageFacts(adapterId, convId, msg) {
    const rec = adapterRecords().adapters.find((r) => r.id === adapterId);
    if (!rec || !known(adapterId, convId)) return { ok: false, code: 'not-found', error: 'No such conversation' };
    const vid = typeof msg === 'string' ? msg : '';
    if (!vid || vid.length > 512 || /[\u0000-\u001f\u007f]/.test(vid)) return { ok: false, code: 'bad-request', error: 'msg is required (a message id of this conversation, at most 512 characters)' };
    const c = registry.capsOf(rec.kind);
    if (!(Array.isArray(c.facts) && c.facts.length)) return { ok: false, code: 'not-supported', error: `${rec.label || rec.id} declares no message facts` };
    const owner = storedOf(adapterId, convId, vid);
    if (!owner) return { ok: false, code: 'not-found', error: 'no message of this conversation has that id' };
    const fxOf = () => store.readSide(adapterId, convId, { msgs: new Set([vid]) }).filter((x) => x && x.k === 'fx');
    const fx0 = fxOf();
    if (Array.isArray(owner.facts) || fx0.length) return { ok: true, msg: vid, facts: Facts.foldFacts(owner.facts, fx0), cached: true };
    if (!METHOD_GATES.factsOf(c)) return { ok: false, code: 'not-supported', error: `${rec.label || rec.id} cannot read the facts of a message stored before them` };
    if (rec.enabled === false) return { ok: false, code: 'disabled', error: `${rec.label || rec.id} is disabled` };
    const k = `${adapterId}/${convId}`;
    const e = adapterFor(rec);
    if (!factsFlights.has(k)) {
      if (inBackoff(e)) return backoffRefusal(rec, e);
      if (!affordable(rec, e)) return budgetRefusal(rec, e);
      const run = (async () => {
        let r;
        try { r = await vendor(rec, e, () => e.adapter.factsOf(convId)); }
        catch (err) {
          const retryAfterSec = Number(err && err.detail && err.detail.retryAfterSec) || null;
          return { ok: false, code: err instanceof ChannelError ? err.code : 'vendor-error', error: String((err && err.message) || err), ...(retryAfterSec ? { retryAfterSec } : {}) };
        }
        if (outlived(rec, e)) return { ok: false, code: 'account-changed', error: 'the account changed while the facts were read — nothing was kept' };
        // ONE fx line per message of THIS conversation's log the answer names (an empty list = "asked, none"); an id the
        // log does not hold is never written — another conversation's message cannot ride this side log
        const got0 = r && r.facts && typeof r.facts === 'object' ? r.facts : {};
        const tail = store.readTail(adapterId, convId, { limit: 5000 });
        const held = new Set(tail.map((x) => String(x.vendorId)));
        // verify r1 F3: a stored message the answer does NOT name (re-threaded or deleted at the vendor) is "asked, none"
        // too — before, its every Details click (and every reload's) was one more metered read of the whole thread
        const got = { ...got0 };
        for (const x of tail) if (!Array.isArray(x.facts) && !Object.prototype.hasOwnProperty.call(got, String(x.vendorId))) got[String(x.vendorId)] = [];
        const t = now();
        const ids = Object.keys(got).filter((id) => held.has(id));
        // written straight to the log (each line judged by `validateSide`), no side broadcast: the asking window has the
        // answer (`all`), another window's ask is a side hit
        const ok = [];
        for (const id of ids) { const v = validateSide({ k: 'fx', msg: id, at: t, src: 'list', facts: got[id] }); if (v.ok) ok.push(v.side); else log.warn(`[channels] ${k}: a facts side line was refused ${v.code}`); }
        const w = ok.length ? store.appendSide(adapterId, convId, ok) : { appended: 0 };
        return { ok: true, appended: w.appended || 0, all: Object.fromEntries(ids.map((id) => [id, got[id]])) };
      })();
      factsFlights.set(k, run);
      run.finally(() => factsFlights.delete(k));
    }
    const res = await factsFlights.get(k);
    if (!res.ok) return res;
    return { ok: true, msg: vid, facts: Facts.foldFacts(owner.facts, fxOf()), cached: false, all: res.all };
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
    // lane message-facts (B-f066): an adapter that declares facts folds its `fx` side lines in (`sidesFx`); one that can read a
    // stored thread's facts (`factsOf`) marks a record stored before them (`factsAsk` — the window's Details asks, ONCE per thread)
    const factsOn = Array.isArray(c.facts) && c.facts.length > 0;
    const canAsk = !agent && METHOD_GATES.factsOf(c);
    const sidesFx = new Map();
    try { if (th.read !== 'none') ix = threadIxOf(rec.id, cid, base); } catch (err) { log.warn(`[channels] ${rec.id}/${cid}: thread index failed: ${(err && err.message) || err}`); }
    try {
      // ONE side read per page (verify r1): the reactions and the thread stats come off the same lines
      const sides = (rxr.read !== 'none' || th.read !== 'none' || factsOn) ? store.readSide(rec.id, cid, { msgs: new Set(base.map((r) => r && String(r.vendorId))) }) : [];
      if (factsOn) for (const x of sides) if (x.k === 'fx') { const k = String(x.msg); if (!sidesFx.has(k)) sidesFx.set(k, []); sidesFx.get(k).push(x); }
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
      if (factsOn) {
        const fx = sidesFx.get(String(r.vendorId)) || [];
        const folded = fx.length ? Facts.foldFacts(r.facts, fx) : (Array.isArray(r.facts) ? r.facts : []);
        if (folded.length) out.facts = agent ? agentFacts(folded) : folded; else delete out.facts;
        if (agent && out.facts) { const w = Facts.agentFactLines(out.facts); if (w) out.factsText = w; }
        if (canAsk && !Array.isArray(r.facts) && !fx.length) out.factsAsk = true;
      }
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
        countFresh(rec, convId, en, landed.fresh);   // lane channel-self-unread
        en.authors = mergeAuthors(en.authors, landed.fresh);
        en.authors = Av.stampSelf(en.authors, selfIdOf(rec));   // lane channels-list-polish: the account's id, at index time
        const newest = landed.fresh.reduce((m, r) => (Number(r.at) > m && !FO.systemRead(r) ? Number(r.at) : m), 0);   // lane lark-system-records
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
  /** lane channel-avatars (B-5fe1): `GET /api/channels/avatar?account=&author=` — A PERSON'S PICTURE through OUR
   *  route, in THE ONE PICTURE ORDER an attachment follows (PURE `Att.fetchVerdict`, fed by PURE `Av.memoFacts`): the
   *  account's on-disk memo first (a picture < 30 days old is served whatever the budget says) · a REMEMBERED refusal
   *  ("no picture", a refused scope — no vendor call inside its TTL) · OURS ONLY (an author a record of this account
   *  names — the route is not a directory lookup) · the row says `fetch` · an enabled account · one flight per person ·
   *  the back-off · the budget · then ONE paced + metered `avatarImage` (two vendor requests: the profile, the bytes).
   *  The bytes are bounded (≤ 256 KiB) and their type is SNIFFED; a stale picture is served when the refresh is refused. */
  const avatarFlights = new Map();
  /** A direct chat's other person (the panel row's picture): `{peer: id}` or nothing. */
  // lane channels-list-polish (the owner: "这个是我的头像，却展示在 Bob 私聊里"): a direct chat's peer is the author that
  // is NOT the account's identity — and the identity is a resolved fact (Av.peerOf: unknown ⇒ no peer, initials, never
  // the owner's face); a group chat's own picture is `chat~<id>`, a bot's `bot~<id>` — only the kinds the row fetches
  function picOf(rec, en, c) {
    const row = Av.avatarRow(c);
    if (!row.fetch) return {};
    if (en.kind === 'group' && row.kinds.includes('chat') && Av.authorOk(Av.memoKey('chat', en.id))) return { peer: Av.memoKey('chat', en.id) };
    if (en.kind !== 'dm') return {};
    const authors = authorsView(rec, en);
    const id = Av.peerOf(authors, selfIdOf(rec));
    const a = id ? authors.find((x) => x && String(x.id) === id) : null;
    const kind = a && a.isBot ? 'bot' : 'person';
    return id && row.kinds.includes(kind) ? { peer: Av.memoKey(kind, id) } : {};
  }
  /** The list row's LAST LINE head: who wrote the newest message (the authors are newest first) — `self` for the owner. */
  function lastWhoOf(rec, en) {
    const a = authorsView(rec, en)[0];
    if (!a || !en.lastText) return {};
    if (a.isSelf) return { lastWho: { self: true } };
    const alt = a.alt && typeof a.alt === 'object' ? a.alt : null;
    const name = String((alt && alt.nickname) || a.name || '').slice(0, 80);
    return name ? { lastWho: { name } } : {};
  }
  function authorIsOurs(adapterId, key, convId) {
    const all = store.index.live();
    // lane channels-list-polish: a picture key names (kind, id) — a group chat's own is ours when the account lists the chat
    const pk = Av.keyOf(key), author = pk.id;
    if (pk.kind === 'chat') return !!all[`${adapterId}/${author}`];
    const named = (en) => !!en && Array.isArray(en.authors) && en.authors.some((a) => a && String(a.id || '') === author);
    if (convId && named(all[`${adapterId}/${convId}`])) return true;
    for (const [k, en] of Object.entries(all)) if (k.startsWith(adapterId + '/') && named(en)) return true;
    if (!convId || !all[`${adapterId}/${convId}`]) return false;
    return store.readTail(adapterId, convId, { limit: 500 }).some((r) => r && r.author && String(r.author.id || '') === author);
  }
  async function avatarImage(adapterId, author, { convId = null } = {}) {
    const rec = adapterRecords().adapters.find((r) => r.id === adapterId);
    if (!rec) return { ok: false, code: 'not-found', error: 'no such account' };
    const a = String(author || '');
    if (!Av.authorOk(a)) return { ok: false, code: 'not-found', error: 'no such person' };
    const row = Av.avatarRow(registry.capsOf(rec.kind));
    if (!row.fetch) return { ok: false, code: 'not-supported', error: row.why };
    // lane channels-list-polish: the key is (kind, id) — a group chat's own picture, a bot's, a person's
    const pk = Av.keyOf(a);
    if (!row.kinds.includes(pk.kind)) return { ok: false, code: 'not-supported', error: row.kindsWhy || `no ${pk.kind} pictures` };
    const fk = `${adapterId}/${a}`;
    const t = now();
    const memo = store.avatarGet(adapterId, a);
    const f = Av.memoFacts(memo, t);
    let v = Att.fetchVerdict({ cached: f.cached, remembered: f.remembered });
    if (v.act === 'serve') return { ok: true, file: memo.file, meta: memo.meta, cached: true };
    if (v.act === 'refuse') return { ok: false, code: v.code, error: f.remembered.error, remembered: true };
    const stale = f.stale ? { ok: true, file: memo.file, meta: memo.meta, cached: true, stale: true } : null;
    const e = adapterFor(rec);
    v = Att.fetchVerdict({ cached: false, remembered: null, owner: authorIsOurs(adapterId, a, convId ? String(convId) : null), fetchable: true, enabled: rec.enabled !== false, inflight: avatarFlights.has(fk), backoff: inBackoff(e) || (Number(e.attBackoffUntil) || 0) > t, affordable: affordable(rec, e) });
    switch (v.act) {
      case 'join': return avatarFlights.get(fk);
      case 'fetch': break;
      default:
        if (stale) return stale;
        if (v.code === 'not-found') return { ok: false, code: 'not-found', error: 'no message of this account names this person' };
        if (v.code === 'disabled') return { ok: false, code: 'disabled', error: `${rec.label || rec.id} is disabled` };
        if (v.code === 'backoff') return inBackoff(e) ? backoffRefusal(rec, e) : { ok: false, code: 'backoff', error: 'the vendor rate-limited this account\'s last picture fetch', retryAfterSec: Math.max(1, Math.ceil(((Number(e.attBackoffUntil) || 0) - t) / 1000)) };
        return budgetRefusal(rec, e);
    }
    const run = (async () => {
      let r;
      try { r = await vendor(rec, e, () => e.adapter.avatarImage(a)); }
      catch (err) {
        const code = err instanceof ChannelError ? err.code : 'vendor-error';
        const why = err && err.detail ? err.detail.why : null;
        const retryAfterSec = Number(err && err.detail && err.detail.retryAfterSec) || null;
        const ttl = Av.refusalTtlMs(code, why, Att.negativeTtlMs, { retryAfterSec });
        const error = String((err && err.message) || err);
        const ended = outlived(rec, e);
        if (ttl && !ended) store.avatarRefuse(adapterId, a, { code: why === 'no-picture' ? 'no-picture' : code, error, until: now() + ttl });
        if (code === 'rate-limited' && !ended) e.attBackoffUntil = now() + (ttl || Att.NEGATIVE_TTL.transient);
        if (stale) return stale;
        return { ok: false, code: why === 'no-picture' ? 'no-picture' : code, error, ...(why === 'scope' && err.detail.scope ? { scope: String(err.detail.scope) } : {}) };
      }
      if (outlived(rec, e)) return { ok: false, code: 'account-changed', error: 'the account changed while the picture was fetched — nothing was kept' };
      const data = r && Buffer.isBuffer(r.data) ? r.data : Buffer.from((r && r.data) || '');
      const mime = Av.sniffImage(data);
      if (data.length > Av.AVATAR_MAX_BYTES || !mime) {
        const code = mime ? 'too-large' : 'not-supported';
        store.avatarRefuse(adapterId, a, { code, error: mime ? 'a profile picture is larger than 256 KiB' : 'the profile picture is not a png / jpeg / gif / webp', until: now() + Att.negativeTtlMs(code) });
        return { ok: false, code, error: mime ? 'a profile picture is larger than 256 KiB' : 'the profile picture is not a raster image' };
      }
      const put = await store.avatarPut(adapterId, a, { data, mime });
      return { ok: true, file: put.file, meta: put.meta, cached: false };
    })();
    avatarFlights.set(fk, run);
    try { return await run; } finally { avatarFlights.delete(fk); }
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
    const decls = ((registry.vendor(rec.kind) || mod).OPTIONS) || [];   // the module declares the options (the registered adapter object carries none)
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
  async function search(adapterId, q, { limit = 100, convId = null } = {}) {
    const rec = adapterRecords().adapters.find((r) => r.id === adapterId);
    if (!rec) return { ok: false, code: 'not-found', error: `no such account '${adapterId}'` };
    const query = String(q || '').trim();
    if (query.length < 2) return { ok: false, code: 'bad-request', error: 'a search needs at least 2 characters' };
    const r = await store.search(adapterId, query, { limit: Math.min(200, Math.max(1, Number(limit) || 100)), ...(convId ? { convIds: [convId] } : {}) });   // .212: scoped to ONE conversation (the agent's search row)
    const liveIx = store.index.live();
    const sc = registry.capsOf(rec.kind);
    const results = r.results.map((x) => ({ key: `${adapterId}/${x.convId}`, convId: x.convId, title: titleOf(sc, (liveIx[`${adapterId}/${x.convId}`] || {}).title) || null, record: withoutBody(viewOf(rec, x)) }));   // lane lark-search-poll: an untitled row is worded by the client, never its raw id
    // design 010: what the scan COVERED (conversations read / eligible, the byte cap, the oldest instant) + whether the
    // account's vendor offers its own search (the dialog's second section asks it on the same press)
    const sd = searchRowOf(sc);
    return { ok: true, results, truncated: r.truncated, scannedBytes: r.scannedBytes, files: r.files, coverage: SR.coverageOf(r.coverage), vendorSearch: sd ? { match: sd.match, adds: sd.adds, context: sd.context || null } : null };
  }

  // ── DESIGN 010 (B-c9be, lane channels-full-search): THE VENDOR'S OWN SEARCH, ON A PERSON'S PRESS ─────────────────
  // The owner's Search press (or Enter) is the person's intent — the standing of a scroll-up in a window: for an account
  // whose adapter declares `caps.search`, the engine asks the vendor's own search for the WORDS over its whole history.
  // Doors: the owner's GET /api/channels/search/full (a press: ≤ pagesPerPress pages; a scroll: one page by its token)
  // and an agent's explicit `--full` (one page, its share, its floor, reach after the answer). Never a timer, an ingest,
  // a keystroke or a reconnect (test-vendor-whitelist's census). A hit the local copy holds is dropped (it is in section
  // one); nothing a vendor search or an `around` read answers is ever stored (F8: a log is contiguous from its oldest).
  /** Is a vendor hit already in the local copy? An unknown conversation or an instant older than the conversation's
   *  oldest stored record ⇒ no, with no read past that record (counted: VS1); else the log is asked by id. */
  function storedHit(adapterId, convId, vendorId, at, memo) {
    if (!store.index.has(`${adapterId}/${convId}`)) { memo.unknown++; return false; }
    let o = memo.oldest.get(convId);
    if (o === undefined) { const r0 = store.oldestRecord(adapterId, convId); o = r0 ? Number(r0.at) || 0 : 0; memo.oldest.set(convId, o); }
    // verify r1 F1: a search hit's instant is WHOLE SECONDS (Lark's ISO 8601 form), a stored record's milliseconds — the
    // conversation's oldest stored message must never read as older than the stored history (it is in section one)
    if (!o || Math.floor(Number(at) / 1000) < Math.floor(o / 1000)) { memo.older++; return false; }
    return !!store.findRecord(adapterId, convId, vendorId);
  }
  /** THE MEASUREMENT (VS1–VS4, shape only — counts, names, booleans, never a word): on the change feed's existing
   *  record (`rec.feed.counters.fullSearch` — the account that has the feed is the account whose search facts are
   *  open), said once per process per account in the journal. */
  const fullSearchSaid = new Set();
  function measureFullSearch(rec, m) {
    if (!feedDecl(rec)) return;
    const fresh = () => ({ presses: 0, pages: 0, hits: 0, olderThanStored: 0, unknownConv: 0, shape: null, cjk: { queries: 0, of: 0, holding: 0 }, other: { queries: 0, of: 0, holding: 0 }, around: { reads: 0, withTarget: 0, before: 0, after: 0 }, firstAt: null, lastAt: null });
    Promise.resolve(store.adapters.update(() => {
      const c = feedRow(rec).counters;
      const x = c.fullSearch && typeof c.fullSearch === 'object' && c.fullSearch.cjk ? c.fullSearch : (c.fullSearch = fresh());
      const t = now();
      if (m.around) {
        x.around.reads++;
        if (m.around.target) x.around.withTarget++;
        x.around.before = Math.max(x.around.before, m.around.before || 0); x.around.after = Math.max(x.around.after, m.around.after || 0);
      } else {
        x.presses++; x.pages += m.pages; x.hits += m.hits; x.olderThanStored += m.older; x.unknownConv += m.unknown;
        const sh = m.shape && m.shape.form !== 'absent' ? m.shape : null;
        if (sh) x.shape = { form: sh.form, keys: sh.keys.slice(0, 12), length: Math.max(Number(x.shape && x.shape.length) || 0, sh.length), markup: !!((x.shape && x.shape.markup) || sh.markup), entities: !!((x.shape && x.shape.entities) || sh.entities) };
        const b = m.cjk ? x.cjk : x.other;
        b.queries++; b.of += m.of; b.holding += m.holding;
      }
      x.firstAt = x.firstAt || t; x.lastAt = t;
    })).catch((err) => log.warn(`[channels] ${rec.id}: the full search's measurement was not written: ${(err && err.message) || err}`));
    const k = `${rec.id}\0${m.around ? 'around' : 'search'}`;
    if (fullSearchSaid.has(k)) return;
    fullSearchSaid.add(k);
    if (m.around) log.log(`[channels] ${rec.id}: the first "around" read answered ${m.around.before} before / ${m.around.after} after the instant, the hit ${m.around.target ? 'among them' : 'NOT among them'} (counts only — VS4)`);
    else log.log(`[channels] ${rec.id}: the first full search answered ${m.hits} hits on ${m.pages} page(s): ${m.older} older than the stored history, ${m.unknown} in conversations not stored (VS1); the snippet is ${m.shape ? `${m.shape.form}${m.shape.keys.length ? ` {${m.shape.keys.join(', ')}}` : ''}, ${m.shape.length} characters, markup ${m.shape.markup ? 'seen' : 'not seen'}` : 'absent'} (VS2); ${m.holding} of ${m.of} snippets hold the ${m.cjk ? 'CJK' : 'non-CJK'} words as written (VS3) — names and counts only`);
  }
  /**
   * ONE VENDOR SEARCH (the core of both doors): the refusal table (`SR.fullSearchVerdict` — scope, the endpoint's
   * shared back-off, the floor, an agent's share, the endpoint's minute, the account's budget), then ≤ `pages` pages
   * paced + metered through `vendor()` and charged to `by`, then the merge (a stored hit dropped). A RATE refusal
   * backs the ENDPOINT off for the account — the change feed shares it and waits with it (its card says so as today).
   * THE MEMO (lane vendor-search-memo, .230 — `SR.searchMemo`; lane search-card-open, .233: PER ACCOUNT, PERSISTED in
   * `<account>/search-memo.json` (`memoOf` / `memoKeep`), no TTL, dropped with the account — dropLive's disconnect /
   * removal — or when the file names another identity): an answer is remembered per (scope, normalized query, page)
   * and FANNED per conversation (+ 'all' when an agent's scope `covers` the account); a press, a reopen (`peek`) or an
   * agent's repeat (it reads the owner's 'all' first, then its own conversation set's) is answered from it — 0 vendor
   * calls, no floor stamped, `memo: {askedAt, ageMs, by}` said. The OWNER reads `memoScopes` (the card's exact agent
   * scope, then 'all', then the dialog's conversation); an answer from any scope but his own 'all' carries no page
   * token (it belongs to the searcher who asked). `again` (the owner's "Search again", a press) forgets every scope it
   * would read, then asks under today's table. `peek` with nothing remembered asks nothing (`unasked`). A refusal, a
   * failure or a partial answer is never remembered.
   * → { ok: true, sd, hits, next, stored, repeated, pages, memo? , unasked? } | a typed refusal `{ ok: false, code, error, retryAfterSec }`
   */
  const searchMemos = new Map();   // adapterId → the memo state (SR.searchMemo's), read from its file at first use
  function memoOf(rec) {
    if (searchMemos.has(rec.id)) return searchMemos.get(rec.id);
    const disk = store.searchMemoRead(rec.id);
    let held = {};
    try { held = heldIdentity(rec, tokensFor(rec).read().token); } catch { held = {}; }
    let st = SR.memoFromDisk(disk);
    if (disk && identityMismatch(disk.identity || {}, held)) { st = SR.memoFromDisk(null); store.searchMemoDrop(rec.id); log.log(`[channels] ${rec.id}: the remembered vendor searches named another identity — forgotten`); }
    searchMemos.set(rec.id, st);
    return st;
  }
  /** The memo after a step: kept in memory; `write` (a put / a clear) writes the account's file whole. */
  function memoKeep(rec, st, write = false) {
    searchMemos.set(rec.id, st);
    if (!write) return;
    let held = {};
    try { held = heldIdentity(rec, tokensFor(rec).read().token); } catch { held = {}; }
    try { store.searchMemoWrite(rec.id, SR.memoToDisk(st, Object.keys(held).length ? held : null)); }
    catch (err) { log.warn(`[channels] ${rec.id}: the vendor-search memo could not be written: ${(err && err.message) || err}`); }
  }
  function forgetSearchMemo(id) { searchMemos.delete(id); store.searchMemoDrop(id); }
  async function vendorSearch(rec, query, { pageToken = null, by = 'owner', ctx = null, shows = null, scope = SR.MEMO_ALL, again = false, peek = false, memoScopes = null, covers = false } = {}) {
    const sd = searchRowOf(registry.capsOf(rec.kind));
    const e = sd && rec.enabled !== false ? adapterFor(rec) : null;
    const t = now();
    const agentKey = ctx && ctx.id ? String(ctx.id) : '';
    if (e && !e.searchAgentAt) e.searchAgentAt = new Map();
    if (e && !e.searchFlights) e.searchFlights = new Set();
    const fkey = by === 'agent' ? `a:${agentKey}` : 'owner';
    const minute = e ? Feed.minuteAt(e.searchCalls, t) : { n: 0, calls: [] };
    const b = budgetDecl(rec);
    const w = e ? win(e) : null;
    const share = e && by === 'agent' ? agentShareRefusal(rec, e) : null;
    const held = Array.isArray(rec.auth && rec.auth.scopes) ? rec.auth.scopes.map(String) : [];
    const feedWait = rec.feed && rec.feed.backoffWhy === 'rate-limited' ? Number(rec.feed.backoffUntil) || 0 : 0;
    // verify r1 F3: agents together never take the owner's press — one press's pages of the endpoint's minute stay the owner's
    const agentReserve = sd && by === 'agent' ? sd.pagesPerPress : 0;
    const reads = by === 'agent' ? (scope === SR.MEMO_ALL ? [SR.MEMO_ALL] : [SR.MEMO_ALL, scope]) : Array.isArray(memoScopes) && memoScopes.length ? memoScopes : [scope];
    if (e && again && !pageToken) memoKeep(rec, SR.searchMemo(memoOf(rec), { op: 'clear', scopes: reads, query }).state, true);
    const mq = e && !(again && !pageToken) ? SR.searchMemo(memoOf(rec), { op: 'get', scopes: reads, query, page: pageToken, now: t }) : null;
    if (mq) memoKeep(rec, mq.state);
    const kept = mq && mq.answer;
    const v = SR.fullSearchVerdict({
      declared: !!(sd && e), scopeHeld: !sd || !sd.scope || held.includes(sd.scope), now: t,
      memo: !!kept, peek: !!peek && !pageToken,
      backoffUntil: Math.max(e ? Number(e.searchBackoffUntil) || 0 : 0, feedWait),
      inflight: !!(e && e.searchFlights.has(fkey)), floorMs: by === 'agent' ? SR.AGENT_FLOOR_MS : SR.OWNER_FLOOR_MS,
      // verify r1 F4: the 2 s floor is a PRESS's (a held Enter key = one ask); the scroll's next page (a token, one request)
      // is bounded by the one flight, the endpoint's minute and the budget — floored, a scroll inside 2 s was refused
      lastAt: e ? (by === 'agent' ? e.searchAgentAt.get(agentKey) || 0 : pageToken ? 0 : e.searchOwnerAt || 0) : 0,
      shareRefused: !!share, shareRetrySec: share ? share.retryAfterSec : 0,
      minuteLeft: sd ? sd.perMin - minute.n - agentReserve : 0, minuteResetAt: minute.calls.length ? minute.calls[0] + 60e3 : t + 60e3,
      budgetLeft: w ? Math.floor((b.limit - w.spent) / ((sd && sd.cost) || 1)) : 0, budgetResetAt: w ? w.at + 60e3 : t + 60e3,
      pages: pageToken || by === 'agent' ? 1 : sd ? sd.pagesPerPress : 1,
    });
    if (v.act === 'memo') {
      // a snapshot: a hit the local copy has since stored is dropped (it is in section one), nothing else re-asked
      const om = { oldest: new Map(), older: 0, unknown: 0 };
      const mg = SR.mergeVendorHits(kept.hits, { stored: (cid, vid, at) => storedHit(rec.id, cid, vid, at, om) });
      const own = kept.scope === scope && !kept.derived;   // a page token belongs to the searcher who asked
      return { ok: true, sd, hits: mg.hits, next: own ? kept.next : null, stored: mg.stored, repeated: mg.repeated, pages: 0, memo: { askedAt: kept.askedAt, ageMs: kept.ageMs, by: kept.by } };
    }
    if (v.act === 'unasked') return { ok: true, sd, hits: [], next: null, stored: 0, repeated: 0, pages: 0, unasked: true };
    if (v.act !== 'ask') {
      const sec = Math.max(1, Math.ceil(v.retryAfterMs / 1000));
      const words = {
        'not-supported': `this channel offers no search of its own (${rec.label || rec.id}) — the saved copy is all there is`,
        'needs-scope': `this account's sign-in does not hold ${(sd && sd.scope) || 'the search scope'} — Re-authorize it to search the vendor's history`,
        backoff: `the vendor is limiting its search for this account — try again in ${sec} s`,
        'search-floor': `this account's own search was asked a moment ago — try again in ${sec} s`,
        'search-minute': `this account's full searches used this minute's ${sd ? sd.perMin - agentReserve : 0} pages${agentReserve ? ' (one press is kept for the user)' : ''} — try again in ${sec} s`,
        'vendor-budget': share ? share.error : `this account's vendor budget for this minute (${b.limit}) is spent — try again in ${sec} s`,
      };
      return { ok: false, code: v.code, error: words[v.code] || v.code, ...(v.retryAfterMs ? { retryAfterSec: sec } : {}) };
    }
    if (by === 'agent') { e.searchAgentAt.set(agentKey, t); if (e.searchAgentAt.size > 500) e.searchAgentAt.delete(e.searchAgentAt.keys().next().value); }
    else e.searchOwnerAt = t;
    e.searchFlights.add(fkey);
    const prevBy = e.chargeBy; e.chargeBy = by === 'agent' ? 'agent' : 'owner';
    const hits = [], facts = [];
    let next = pageToken, pages = 0, failure = null;
    // design 010 S6 (lane channels-followups): two HINTS for an adapter that reads each hit's details one request at a
    // time (Gmail's metadata read): what the local copy already holds (its stored instant — section one shows it, no
    // read) and, for an agent, which conversations it may be shown (`shows` — none ⇒ no read: neither its units nor its
    // count spent). An adapter answering a page in one request ignores both; the merge and the reach judge decide anyway.
    const storedAt = (cid, vid) => { if (!store.index.has(`${rec.id}/${cid}`)) return 0; const r0 = store.findRecord(rec.id, String(cid), String(vid)); return r0 ? Number(r0.at) || 0 : 0; };
    try {
      do {
        if (pages > 0 && (!affordable(rec, e) || Feed.pagesLeft(e.searchCalls, now(), sd.perMin) <= 0)) break;
        e.searchCalls = Feed.minuteAt(e.searchCalls, now()).calls.concat([now()]);
        const page = await vendor(rec, e, () => e.adapter.search({ query, pageToken: next, storedAt, shows }));
        pages++;
        if (outlived(rec, e)) throw new ChannelError('account-changed', 'the account changed while the vendor searched — nothing was kept', { retryable: true });
        hits.push(...page.hits);
        if (page.facts) facts.push(page.facts);
        next = page.next;
      } while (next && pages < v.pages);
    } catch (err) {
      const code = err instanceof ChannelError ? err.code : 'vendor-error';
      if (code === 'rate-limited') {
        const until = now() + Math.max(5, Number(err.detail && err.detail.retryAfterSec) || 60) * 1000;
        e.searchBackoffUntil = Math.max(Number(e.searchBackoffUntil) || 0, until);
        if (feedDecl(rec)) await store.adapters.update(() => { const f = feedRow(rec); if (!(Number(f.backoffUntil) >= until)) { f.backoffUntil = until; f.backoffWhy = 'rate-limited'; } }).catch(() => {});
        failure = { ok: false, code: 'backoff', error: `the vendor is limiting its search for this account — try again in ${Math.ceil((until - now()) / 1000)} s`, retryAfterSec: Math.max(1, Math.ceil((until - now()) / 1000)) };
      } else if (code === 'forbidden') failure = { ok: false, code: 'needs-scope', error: `the vendor refused this account's search (${String((err && err.message) || err).slice(0, 200)}) — Re-authorize it` };
      else failure = { ok: false, code: code === 'account-changed' ? 'account-changed' : 'vendor-failed', error: `the vendor's search did not answer: ${String((err && err.message) || err).slice(0, 200)}` };
    } finally { e.chargeBy = prevBy; e.searchFlights.delete(fkey); }
    if (failure && !pages) return failure;
    const memo = { oldest: new Map(), older: 0, unknown: 0 };
    const mg = SR.mergeVendorHits(hits, { stored: (cid, vid, at) => storedHit(rec.id, cid, vid, at, memo) });
    const sum = (k) => facts.reduce((a, f) => a + (Number(f[k]) || 0), 0);
    measureFullSearch(rec, { pages, hits: hits.length, older: memo.older, unknown: memo.unknown, shape: (facts.find((f) => f.shape && f.shape.form !== 'absent') || {}).shape || null, cjk: SR.isCjk(query), of: sum('of'), holding: sum('holding') });
    if (!failure && !outlived(rec, e)) memoKeep(rec, SR.searchMemo(memoOf(rec), { op: 'put', scope, query, page: pageToken, now: t, hits: mg.hits, next: next || null, by, covers: !!covers }).state, true);
    return { ok: true, sd, hits: mg.hits, next: failure ? null : next || null, stored: mg.stored, repeated: mg.repeated, pages, ...(failure ? { partial: failure.code } : {}) };
  }
  /** THE OWNER'S FULL SEARCH (GET /api/channels/search/full): a press (no token: ≤ pagesPerPress pages) or the scroll's
   *  next page (its token: one). Each hit: the conversation's NAME from the index (an unknown one: `known:false`, no
   *  name — the client words it), the author's name only where the owner named them (never an id), the instant, the
   *  vendor's snippet (THE reader's), the chip's fact (never stored). */
  async function searchVendor(adapterId, q, { pageToken = null, again = false, peek = false, memo = null, convId = null } = {}) {
    const rec = adapterRecords().adapters.find((r) => r.id === adapterId);
    if (!rec) return { ok: false, code: 'not-found', error: `no such account '${adapterId}'` };
    const query = String(q || '').trim();
    if (query.length < 2) return { ok: false, code: 'bad-request', error: 'a search needs at least 2 characters' };
    if (query.length > SR.QUERY_MAX) return { ok: false, code: 'bad-request', error: `a search is at most ${SR.QUERY_MAX} characters` };
    const tok = pageToken === null || pageToken === undefined || pageToken === '' ? null : String(pageToken);
    if (tok && (tok.length > 2048 || /[\u0000-\u001f]/.test(tok))) return { ok: false, code: 'bad-request', error: 'a malformed page token' };
    // lane search-card-open (.233): the dialog opened from an agent's search row names that search's scope (`memo` — read
    // first, exact) and its conversation (`convId` — what any searcher found for it); the owner's own 'all' between
    const cid = convId === null || convId === undefined || convId === '' ? null : String(convId).slice(0, 512);
    const memoScopes = [...new Set([...(SR.isMemoScope(memo) ? [memo] : []), SR.MEMO_ALL, ...(cid ? [SR.memoConv(cid)] : [])])];
    const r = await vendorSearch(rec, query, { pageToken: tok, by: 'owner', again: !!again && !tok, peek: !!peek && !again && !tok, memoScopes });
    if (!r.ok) return r;
    const liveIx = store.index.live();
    const sc = registry.capsOf(rec.kind);
    const hits = r.hits.map((h) => {
      const key = `${rec.id}/${h.convId}`;
      const en = liveIx[key];
      const alias = h.fromId ? peerName(aliasOf(rec.id, h.fromId), 80) : null;
      return { key, convId: h.convId, vendorId: h.vendorId, at: h.at, known: !!en, title: en ? titleOf(sc, en.title) || null : null, author: alias ? { name: alias } : null, snippet: h.snippet, threadKey: h.threadKey };
    });
    return { ok: true, hits, next: r.next, stored: r.stored, pages: r.pages, match: r.sd.match, adds: r.sd.adds, context: r.sd.context || null, ...(r.partial ? { partial: r.partial } : {}), ...(r.memo ? { memo: r.memo } : {}), ...(r.unasked ? { unasked: true } : {}) };
  }
  /** A HIT IN CONTEXT for the owner (GET /api/channels/:adapterId/:convId/around): ONE `around` read (the adapter's
   *  two requests), charged to the owner under the minute budget, one flight per hit; the records drawn by the window's
   *  view — and NOTHING stored, appended, counted unread, broadcast or stamped (F8; V5 / V8). */
  const aroundFlights = new Map();
  async function aroundFor(adapterId, convId, { vendorId = null, at = null, by = 'owner' } = {}) {
    const rec = adapterRecords().adapters.find((r) => r.id === adapterId);
    if (!rec || rec.enabled === false) return { ok: false, code: 'not-found', error: 'No such account' };
    const sd = searchRowOf(registry.capsOf(rec.kind));
    if (!sd || !sd.context) return { ok: false, code: 'not-supported', error: 'this channel cannot read a found message in context' };
    const cid = String(convId || ''), vid = vendorId === null || vendorId === undefined ? '' : String(vendorId);
    const ok = (x) => x && x.length <= 512 && !/[\u0000-\u001f\u007f]/.test(x);
    if (!ok(cid) || !ok(vid) || !(Number(at) > 0)) return { ok: false, code: 'bad-request', error: 'a found message is named by its conversation, its id and its instant' };
    const e = adapterFor(rec);
    const fk = `${rec.id}/${cid}/${vid}`;
    let flight = aroundFlights.get(fk);
    if (!flight) {
      if (!affordable(rec, e)) return budgetRefusal(rec, e);
      flight = (async () => {
        const prevBy = e.chargeBy; e.chargeBy = by === 'agent' ? 'agent' : 'owner';
        try { return await vendor(rec, e, () => e.adapter.around(cid, { vendorId: vid, at: Number(at) })); }
        finally { e.chargeBy = prevBy; }
      })();
      aroundFlights.set(fk, flight);
    }
    let r;
    try { r = await flight; }
    catch (err) { return { ok: false, code: err instanceof ChannelError ? err.code : 'vendor-error', error: String((err && err.message) || err).slice(0, 300) }; }
    finally { if (aroundFlights.get(fk) === flight) aroundFlights.delete(fk); }
    if (r.facts) measureFullSearch(rec, { around: r.facts });
    const en = store.index.live()[`${rec.id}/${cid}`];
    return { ok: true, rec, records: r.records, known: !!en, title: en ? titleOf(registry.capsOf(rec.kind), en.title) || null : null, vendorId: vid };
  }
  async function aroundOwner(adapterId, convId, opts = {}) {
    const r = await aroundFor(adapterId, convId, { ...opts, by: 'owner' });
    if (!r.ok) return r;
    return { ok: true, records: withView(r.rec, r.records, { convId: String(convId) }), known: r.known, title: r.title, vendorId: r.vendorId, stored: false };
  }

  /** ONE convCaps LOOKUP PER CONVERSATION IN FLIGHT (verify r3, MONEY — r1's held LOW): every caller that found the
   *  cached verdict unknown or stale (a window's reaction trickle, react / unreact, a draft, a watch on open) asked the
   *  vendor itself — 20 concurrent reaction refreshes on a stale conversation = 20 chat lookups (measured, r1b-money).
   *  A caller now JOINS the lookup in flight for that conversation. `join:false` (approve's unconditional re-resolution:
   *  a proposal is decided on an answer asked AFTER the decision) starts its own — which the next callers join. */
  const convCapsFlights = new Map();   // `${adapterId}/${convId}` → the lookup in flight
  function refreshConvCaps(adapterId, convId, { join = true, owner = false, polite = false } = {}) {
    const k = `${adapterId}/${convId}`;
    const f = join ? convCapsFlights.get(k) : null;
    if (f) return f;
    const run = (async () => {
      const rec = adapterRecords().adapters.find((r) => r.id === adapterId);
      if (!rec) return null;
      const e = adapterFor(rec);
      // lane gmail-reply-known: the account's OWN listing returned this row ⇒ `listed` (an adapter declaring
      // `convCapsFromListing` answers from held facts, no vendor call — so no back-off applies to it); a POLITE
      // caller's lookup (the window's open, the engine's own re-ask, an agent's propose) inside the account's vendor
      // back-off is refused by name, the OWNER's Retry exempt (as their refresh press is); the reaction / thread
      // offers keep their own back-off refusals; a refused lookup is WRITTEN into the row (named, retried) — never swallowed
      const en0 = store.index.peek(k);
      const listed = !!(en0 && en0.adapterId === adapterId && en0.listedAt && !en0.unlistedAt);
      if (polite && !owner && inBackoff(e) && !(listed && heldByListing(rec))) return convCapsFailed(rec, e, adapterId, convId, null, 'backoff');
      let cc;
      try { cc = await e.adapter.convCaps(convId, { listed }); } catch (err) { return convCapsFailed(rec, e, adapterId, convId, err); }
      // `create:false`: a conversation the vendor no longer lists may have been
      // removed from the index between the ask and the answer, and a cache entry
      // is not a reason to resurrect the row it describes.
      await store.index.update(() => { const en = store.index.entry(adapterId, convId, { create: false }); if (en) en.convCaps = cc; });
      clearConvCapsRetry(k);
      return cc;
    })();
    convCapsFlights.set(k, run);
    const done = () => { if (convCapsFlights.get(k) === run) convCapsFlights.delete(k); };
    run.then(done, done);
    return run;
  }

  /** A REFUSED SEND-ROW LOOKUP IS SAID AND RETRIED (lane gmail-reply-known, 2026-10-05 — a fleet user's old listed Gmail
   *  thread had no reply box: the lookup's 429 was swallowed and the foot kept "not known yet" for ever). The row
   *  gets `{read:'unknown', sendAs:[], why, detail, at, retryAt}` (why ∈ caps.CONV_CAPS_FAIL_WHYS) unless it holds a
   *  fresh RESOLVED verdict (a refusal at approve never erases a working reply box); the journal says it once per
   *  (conversation, why) per 5 min; at `retryAt` the engine asks again BY ITSELF — for an OPEN window only (the
   *  heartbeat's hot set, never a sweep over the index). Returns the failed row, so every caller reads a named why. */
  const convCapsRetry = new Map();   // key → the hot window's own re-ask timer (never the drain's)
  const convCapsSaid = new Map();    // `${key} ${why}` → when the journal last said it
  const CONV_CAPS_SAY_MS = 5 * 60e3;
  function heldByListing(rec) { try { return registry.get(rec.kind).convCapsFromListing === true; } catch { return false; } }
  function clearConvCapsRetry(k) { const tm = convCapsRetry.get(k); if (tm) { clearTimeout(tm); convCapsRetry.delete(k); } }
  async function convCapsFailed(rec, e, adapterId, convId, err, whyIn = null) {
    const k = `${adapterId}/${convId}`;
    const t = now();
    const code = whyIn || (err instanceof ChannelError ? err.code : 'vendor-error');
    const hint = err && err.detail ? Number(err.detail.retryAfterSec) : NaN;
    const hintMs = Number.isFinite(hint) && hint > 0 ? Math.min(RATE_RETRY_AFTER_MAX_MS, Math.max(1e3, Math.ceil(hint * 1000))) : 0;
    const why = code === 'backoff' ? 'backoff' : code === 'rate-limited' ? 'rate-limited'
      : code === 'auth-expired' ? (caps.authState(rec, t).state === 'unknown' ? 'not-connected' : 'auth-expired') : 'vendor-error';
    const retryAt = why === 'backoff' ? e.nextAt
      : why === 'rate-limited' ? t + (hintMs || (inBackoff(e) ? e.nextAt - t : RATE_BACKOFF_MS[RATE_BACKOFF_MS.length - 1] / 2))
        : why === 'vendor-error' ? t + (hintMs || 60e3) : null;   // a sign-in needs the owner — no timer
    const row = { read: 'unknown', sendAs: [], why, detail: code, at: t, retryAt };
    await store.index.update(() => {
      const en = store.index.entry(adapterId, convId, { create: false });
      if (en && caps.convCapsState(effectiveConvCaps(rec, en), t).read === 'unknown') en.convCaps = row;
    });
    const sk = `${k} ${why}`;
    if (t - (convCapsSaid.get(sk) || 0) >= CONV_CAPS_SAY_MS) {
      convCapsSaid.set(sk, t);
      if (convCapsSaid.size > 500) convCapsSaid.delete(convCapsSaid.keys().next().value);
      log.warn(`[channels] ${k}: send row not resolved (${why}${retryAt ? `, retry ${new Date(retryAt).toISOString().slice(11, 16)}Z` : ''})`);
    }
    clearConvCapsRetry(k);
    if (retryAt && !stopped) {
      const tm = setTimeout(() => {
        convCapsRetry.delete(k);
        if (stopped || !isWatched(k)) return;   // the window closed: its next open asks
        refreshConvCaps(adapterId, convId, { polite: true }).then(() => notify([k]), (er) => log.warn(`[channels] ${k}: send row re-ask failed: ${(er && er.message) || er}`));
      }, Math.max(250, retryAt - t));
      if (tm.unref) tm.unref();
      convCapsRetry.set(k, tm);
    }
    return row;
  }
  /** THE OWNER'S Retry on the foot: exempt from the account's back-off (as their refresh press is), one flight per
   *  conversation (joins one in flight). */
  async function retryConvCaps(adapterId, convId) {
    const rec = adapterRecords().adapters.find((r) => r.id === adapterId);
    if (!rec || !known(adapterId, convId)) return { ok: false, code: 'not-found', error: 'No such conversation' };
    const k = `${adapterId}/${convId}`;
    if (rec.enabled !== false) await refreshConvCaps(adapterId, convId, { owner: true, polite: true });
    notify([k]);
    return { ok: true, convCaps: caps.convCapsState(effectiveConvCaps(rec, store.index.peek(k)), now()) };
  }
  /** The account answered again (a pass went through): the OPEN windows whose send row was refused ask again now. */
  function retryHotConvCaps(rec) {
    const t = now();
    for (const [k, exp] of watching) {
      if (exp <= t || !k.startsWith(`${rec.id}/`)) continue;
      const cc = (store.index.peek(k) || {}).convCaps;
      if (!cc || cc.read !== 'unknown' || !caps.CONV_CAPS_FAIL_WHYS.includes(cc.why)) continue;
      refreshConvCaps(rec.id, k.slice(rec.id.length + 1), { polite: true }).then(() => notify([k]), (er) => log.warn(`[channels] ${k}: send row re-ask failed: ${(er && er.message) || er}`));
    }
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
      const unread = unreadSince(adapterId, convId, stamp);
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
    const mod = registry.vendor(rec.kind);
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
  /** lane gmail-quota-share: the vendor refused this account's quota TWICE today, so its polling slowed itself
   *  (src/channel-budget.js) — ONE "For you" item per (account, day), retracted when the ceiling is back at the setting. */
  async function speakSlowed(rec, st) {
    if (!userTodos || typeof userTodos.add !== 'function') return;
    if (rec.budgetItem && rec.budgetItem.day === st.day) return;
    if (rec.budgetItem) await retractSlowed(rec, 'superseded');
    const vendor = String((registry.capsOf(rec.kind) || {}).vendorName || 'the vendor');
    const label = rec.label || rec.id;
    const text = `Channel ${label}: ${vendor} refused its quota twice today — polling slowed to ${st.ceiling} of ${st.setting} a minute`;
    try {
      const item = userTodos.add(INBOX_KEY, {
        origin: 'channels',
        text,
        detail: `Adapter: ${label} (${rec.kind})\nPolling now spends at most ${st.ceiling} of the ${st.setting} a minute its setting allows; every minute without a refusal raises it by a tenth of the setting.\n\nThe vendor meters this account's quota across EVERY app that polls it: if this account is also connected on another VibeSpace instance (or another app reads it), the two share one quota. Disconnecting it there, or lowering its budget setting on one of them, keeps both under the limit.\n\nThis item is retracted automatically by the channels engine when polling is back at the setting.`,
        urgency: 'normal',
        by: 'agent', sessionName: 'Channels',
        i18n: { text: { key: i18nKey('Channel {label}: {vendor} refused its quota twice today — polling slowed to {n} of {m} a minute'), params: { label, vendor, n: st.ceiling, m: st.setting } }, source: INBOX_SOURCE },
      });
      if (item && item.id) await store.adapters.update(() => { rec.budgetItem = { id: item.id, text, day: st.day, at: now() }; });
    } catch (e) { log.warn(`[channels] ${rec.id}: could not file the slowed-polling item: ${(e && e.message) || e}`); }
  }
  async function retractSlowed(rec, why = 'back at the setting') {
    if (!rec.budgetItem) return;
    const bi = rec.budgetItem;
    await store.adapters.update(() => { rec.budgetItem = null; });
    if (!userTodos || typeof userTodos.get !== 'function') return;
    try {
      const it = userTodos.get(bi.id);
      if (it && it.status === 'open' && it.sessionKey === INBOX_KEY && it.text === bi.text) { userTodos.setStatus(bi.id, 'done', RESOLVED_BY); log.log(`[channels] ${rec.id}: ${why} — retracted the slowed-polling item`); }
    } catch (e) { log.warn(`[channels] ${rec.id}: could not retract the slowed-polling item: ${(e && e.message) || e}`); }
  }
  /** lane channel-names-readable (userW, 2026-10-08: "Channels cannot find my conversation with" a colleague — the sign-in held
   *  no contact permission and only the boot log said so): THE NAMES FACT. The adapter's people warm-up answers whether
   *  this sign-in may read people's profiles (`unreadable: {why, missing}`) or read one (`ok`); the account KEEPS it
   *  (caps.namesVerdict, PURE — a write only when it changes) and it is said where the owner looks: the card's note line,
   *  ONE For-you item per sign-in (speakNames), the search's empty state, the agent's list / search line. */
  async function namesFact(rec, r) {
    try {
      const next = caps.namesVerdict(rec.namesReadable || null, r, now());
      if (next !== undefined) {
        await store.adapters.update(() => { if (next) rec.namesReadable = next; else delete rec.namesReadable; });
        notify([]);
      }
      if (rec.namesReadable && rec.namesReadable.ok === false) await speakNames(rec);
      else if (rec.namesItem) await retractNames(rec);
    } catch (err) { log.warn(`[channels] ${rec.id}: the names fact could not be kept: ${(err && err.message) || err}`); }
  }
  /** ONE "For you" item per (account, sign-in) — keyed by the instant the sign-in's scopes last changed
   *  (caps.credentialChangedAt): a pass never files again, a dismissal stands for that sign-in, a re-authorize that
   *  still lacks the permission files ONE new item, one that fixes it resolves the item (namesFact). */
  async function speakNames(rec) {
    if (!userTodos || typeof userTodos.add !== 'function') return;
    const signin = caps.credentialChangedAt(rec);
    if (rec.namesItem && rec.namesItem.signin === signin) return;
    if (rec.namesItem) await retractNames(rec, 'superseded');
    const label = rec.label || rec.id;
    const text = `Channel ${label}: people's names and pictures cannot be read — re-authorize to add the contact permission`;
    const missing = (rec.namesReadable && rec.namesReadable.missing) || [];
    try {
      const item = userTodos.add(INBOX_KEY, {
        origin: 'channels', kind: 'action',
        text,
        detail: `Adapter: ${label} (${rec.kind})\nThis sign-in holds none of the permissions that read people's profiles${missing.length ? ` (${missing.join(' / ')})` : ''}, so a conversation shows the vendor's name only and a search by a person's nickname or other name finds nothing.\n\nRe-authorize the account: its consent asks for the contact permission. This item is resolved automatically when a profile is read.`,
        urgency: 'normal', by: 'agent', sessionName: 'Channels',
        action: { type: 'channel-reauth', adapterId: rec.id },
        i18n: { text: { key: i18nKey("Channel {label}: people's names and pictures cannot be read — re-authorize to add the contact permission"), params: { label } }, source: INBOX_SOURCE },
      });
      if (item && item.id) await store.adapters.update(() => { rec.namesItem = { id: item.id, text, signin, at: now() }; });
    } catch (e) { log.warn(`[channels] ${rec.id}: could not file the names item: ${(e && e.message) || e}`); }
  }
  async function retractNames(rec, why = 'a profile was read') {
    if (!rec.namesItem) return;
    const ni = rec.namesItem;
    await store.adapters.update(() => { delete rec.namesItem; });
    if (!userTodos || typeof userTodos.get !== 'function') return;
    try {
      const it = userTodos.get(ni.id);
      if (it && it.status === 'open' && it.sessionKey === INBOX_KEY && it.text === ni.text) { userTodos.setStatus(ni.id, 'done', RESOLVED_BY); log.log(`[channels] ${rec.id}: ${why} — resolved the names item`); }
    } catch (e) { log.warn(`[channels] ${rec.id}: could not resolve the names item: ${(e && e.message) || e}`); }
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

  /** THE FUNNEL ENTRY. `fresh` are the records that just became durable.
   *  R4: EVERY WATCHER in effect matches with ITS OWN filter and is delivered
   *  on its own (a wake, a digest window, a scope digest), each against its
   *  own pace ledger; ACCESS alone is never on this path. */
  async function onFresh(rec, convId, fresh0, { lane, origin } = {}) {
    if (stopped || !Array.isArray(fresh0) || !fresh0.length) return;
    // lane lark-threads (B2–B5): the batch through the ONE view door — a wake / a For-you item names an author as the owner
    // reads them (`author.display`: the owner's name › the vendor's way); the vendor `name` (what a rule matches) unchanged
    const fresh = fresh0.map((r) => viewOf(rec, r));
    // lane slack-file-send-key (B-2840): a self-authored share re-keys a file send BEFORE this batch is judged (the share
    // precedes its replies by ts, so a reply in this very batch already names a known message); never costs the wake
    try { await learnSentFiles(rec, convId, fresh0); } catch (err) { log.warn(`[channels] ${rec.id}/${convId}: a file send's message could not be learned (a reply under it will not count): ${(err && err.message) || err}`); }
    const t = now();
    const selfId = selfIdOf(rec);
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
    const subjectOf = (r) => rawFactsOf(rec, r).subject;   // lane dc-channels-blocks: the `subject` rule asks the adapter
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
        // lane reply-to-sent: what each drafter SENT here, from the outbox's sent proposals (the last 30 days, ≤ 500 per
        // drafter) — {at, words, subject} per vendor id; `reply-to-sent` reads only these
        const sentOut = new Map();   // cid → Map(vid → {at, words, subject})
        const since = t - F.SENT_WINDOW_MS;
        const props = Object.values((store.outbox.snapshot() || {}).proposals || {}).filter((p) => p && p.state === 'sent' && p.adapterId === rec.id && p.convId === convId && p.kind !== 'reaction' && p.draftedBy && p.draftedBy.kind === 'agent' && p.result && p.result.vendorMessageId && Number(p.result.at || p.at) >= since);
        props.sort((a, b) => Number(a.result.at || a.at) - Number(b.result.at || b.at));
        for (const p of props) {
          const m = sentOut.get(String(p.draftedBy.id)) || new Map();
          for (const v of P.sentIdsOf(p.result)) m.set(v, { at: Number(p.result.at || p.at), words: String(p.text || '').replace(/\s+/g, ' ').trim().slice(0, 80), subject: String((p.compose && p.compose.subject) || p.title || '').slice(0, 120) });
          if (m.size > F.SENT_MAX) m.delete(m.keys().next().value);
          sentOut.set(String(p.draftedBy.id), m);
        }
        placeBase = { owner, threadOf, kindOf, sentBy: en.sentBy && typeof en.sentBy === 'object' ? en.sentBy : {}, sentOut, convKind: en.kind || null, threadOnly: F.threadOnlyCaps(registry.capsOf(rec.kind)) };   // lane channel-reply-real: Slack-style thread_ts roots
      }
      const cids = !principal ? [] : principal.kind === 'agent' ? [String(principal.id)] : F.fanTargetOf(principal) ? [F.fanTargetOf(principal)] : principal.kind === 'everyone' ? [] : Object.keys(placeBase.sentBy).filter((k) => k.startsWith('agent:')).map((k) => k.slice(6)).filter((cid) => groupsOfSession(cid).includes(String(principal.id)));
      // lane reply-to-sent: `ctx.mine` split — the OWNER's (`ownerMine`) and THIS principal's sends (`sentByMe` from the
      // outbox; `sentIds` = the index ledger); `reply-to-mine` reads all three, `reply-to-sent` only `sentByMe`
      const sentIds = new Set();
      const sentByMe = new Map();
      for (const cid of cids) { for (const v of placeBase.sentBy[`agent:${cid}`] || []) sentIds.add(String(v)); for (const [v, s] of placeBase.sentOut.get(cid) || []) sentByMe.set(v, s); }
      return { ownerMine: placeBase.owner, sentIds, sentByMe, convKind: placeBase.convKind, threadOnly: placeBase.threadOnly, threadOf: placeBase.threadOf, kindOf: placeBase.kindOf };
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
        const filter0 = w.mode === 'filtered' ? filterFor(w.filterId) : null;
        if (w.mode === 'filtered' && !filter0) { log.warn(`[channels] ${rec.id}/${convId}: ${pkOf(w.principal)}'s notification names filter ${w.filterId} which does not exist — not woken (fail closed)`); continue; }
        // lane reply-to-sent: a group row carrying the rule is judged PER MEMBER (F.fanOutWatchers' `split`): a member's item
        // reads only the sent half, for that member's sends; the group's own item the rest of the rules
        const filter = item.split ? F.splitFilter(filter0, item.split) : filter0;
        if (item.split && !filter) continue;
        const hits = [];
        const mctx = { ...(filter && Array.isArray(filter.rules) && filter.rules.some((x) => x && F.PLACE_RULE_KINDS.includes(x.kind)) ? placeCtx(w.principal) : {}), subjectOf };
        for (const r of fresh) {
          try {
            // lane channel-self-unread (B-c91b: 'inc-' matched the owner's OWN Outbox replies to userW): the owner's
            // own message is never a hit — no keyword / regex / place rule, no @ in it, no 'all' watcher (FO.selfRead)
            if (FO.selfRead(r, selfId)) continue;
            if (FO.systemRead(r)) continue;   // lane lark-system-records: a vendor notice (a recall, a join) is nobody's message — not even an 'all' watcher's
            if (w.mode === 'all') { hits.push({ record: r, why: [] }); continue; }
            const m = F.matchRecord(filter, r, mctx);
            if (m.hit) hits.push({ record: r, why: m.why, ...(m.sent ? { sent: m.sent } : {}) });
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
      for (const h of hits) e2.pending.push({ record: h.record, why: h.why || [], ...(h.sent ? { sent: h.sent } : {}), at: now(), ...(pk ? { for: pk } : {}) });
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
    // lane reply-to-sent: a group MEMBER's item (the per-member fan-out) names its one member — never the round-robin
    const mt = F.fanTargetOf(w.principal);
    if (mt) { const s = live.find((x) => x && x.cid === mt); return { cid: mt, name: (s && s.name) || w.principal.member || mt, via: 'group', live: !!s, cursor: null }; }
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
  // THE COMPOSITION ROOT (lane dc-channels-seams, rv-channels-core C11). Three families left this closure verbatim —
  // channels-access.js (policy / reach / requests / directory / grants / the agent's reads), channels-outbound.js (the
  // outbox: propose / compose / decide / approve / send / receipts / reconcile / sweeps) and channels-auth.js (credential
  // resolution, the consent flows, reauthorize, the identity door, the account verbs). Each is `create(engineCtx)` over THIS
  // one object: the engine names every field a family may read; a family's answer is merged back in, so a family
  // created later reads an earlier one's doors here and an earlier one reads a later one's at call time.
  // ══════════════════════════════════════════════════════════════════════════
  const engineCtx = {
    agentTitle, agentId, agentEnvelope, KEY_FILE, CUSTOM_KEY, PENDING_FLOW_TTL_MS, DUPLICATE_FIELDS, INBOX_KEY, i18nKey, INBOX_SOURCE, RESOLVED_BY,
    RECONCILE_SECONDS, ESTIMATE_CAP, registry, liveSessions, log, now, userTodos, serverSetting, broadcast, deliver, integrations, mountClients,
    fetchFn, store, box, flows, signState, consentRowOf, consentDepsOf, agentsWanted, resolveIntegration, rowOf, live, paceCarry, BOOT_ID,
    adapterRecords, saveAdapters, refusedScopesOf, tokensFor, adapterFor, refreshAuth, tiers, agentShareRefusal, affordable, vendor, isWatched,
    laneOf, EMPTY_SCAN, pass, effectiveConvCaps, rejudgeConvCaps, rawFactsOf, ownRecordOf, viewOf, agentCopy, humanNameOf, accountsBrief, conversationName,
    presetsOf, clientFieldDecls, customClientView, vendorNameOf, adapterView, notify, disarmPush, syncPushLanes, kick, known, budgetRefusal,
    dropLive, outlived, reactionsPerMin, threadIxOf, vocabularyOf, reactionsFor, withView, offerNow, NOT_A_THREAD, threadRead, threadRefresh,
    rxBackedOff, rxBackoffRefusal, notePages, noteRxRateLimit, appendSides, react, unreact, vendorSearch, aroundFor, refreshConvCaps, retractUnsaved,
    retractFailure, track, wakeTimers, clearWakeTimer, coalesceSeconds, billedWake,
    get stopped() { return stopped; },
    get timer() { return timer; },
  };
  const {
    policyFor, authorityCapsFor, healP2, rotationsOf, filterFor, assignmentView, pendingOf, clearCarried, elidedTotal, statsView, wakeLatencyFor,
    accountGrainOf, patternsOf, patternById, pkOf, legacyConvAssignment, convGrainOf, convFacts, effectiveFor, fanTargets, wakeEffOf,
    storedWatcherFor, itemIs, scopeKeyOf, watcherRef, accessRowView, watcherView, eligibleAboveView, grainView, reachFor, groupsOfSession, convFor,
    stillSees, effectiveForAccount, searchFor, readAroundFor, setPolicy, setReach, reachView, request, decideRequest, directoryLists,
    setAgentDirectory, agentWatch, agentUnwatch, agentWatchesFor, listFor, readFor, readThreadFor, statusFor, setGrain, setAccess, setWatchers, removePattern,
    setAssignment, setScopeAssignment, accessFor, estimateScope, migrateAggregated, migrateGrants, setFilter, estimateFilter,
    previewRule, membersNow,
  } = Object.assign(engineCtx, ChannelsAccess.create(engineCtx));
  const {
    honestyLineFor, proposalsFor, stashAbout, stashGate, outboxView, sendStartsTurn, outboxAttachment, filesSweep, propose, proposeReaction, compose,
    approve, reject, onProposal, withdrawProposal, replaceProposal, noteReceiptStash, reconcileReceiptFates, reconcile, sweepSending, sweepReplaces,
    receipt, expireSweep, pointerSync, learnSentFiles,
  } = Object.assign(engineCtx, ChannelsOutbound.create(engineCtx));
  const {
    clientFor, resolverFor, credentialFactsFor, credentialFacts, offeredCredentials, defaultCredentialKey, credentialLabelFor, connectableFor,
    newRecord, mountClientsFor, viewOptions, startOAuth, oauthStatus, consentLandingOf, oauthLanding, oauthCallback, connect, reauthorize,
    recordOrThrow, safeFlow, finishAuth, narrowAuth, oauthNarrow, cancelAuth, onAuthDone, disconnect, referencesOf, remove, setupView, duplicate,
    setLabel, setCustomSecret, adapterConfig, inlineLegacyClient, scheduleInline, inlineLegacyClients, stampIdentities, stampCredentialKeys,
    setEnabled, setAccountPolicy, setSenderHonesty, setOptions,
  } = Object.assign(engineCtx, ChannelsAuth.create(engineCtx));

  const EXPIRY_SWEEP_MS = 60e3;
  let lastExpirySweep = 0;
  let offStash = deliver && typeof deliver.onStash === 'function'
    ? deliver.onStash((ev, cid, entries, extra) => { noteReceiptStash(ev, cid, entries, extra).catch((err) => log.warn(`[channels] receipt fate update failed: ${(err && err.message) || err}`)); })
    : null;
  // verify r3 (IDENTITY): the stash gate — what this engine filed for an agent's next turn is re-judged at every read
  let offStashGate = deliver && typeof deliver.registerStashGate === 'function' ? deliver.registerStashGate(stashGate) : null;

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
    if (now() - lastExpirySweep >= EXPIRY_SWEEP_MS) { lastExpirySweep = now(); track(expireSweep()); track(filesSweep().catch((err) => log.warn(`[channels] the attachments sweep failed: ${(err && err.message) || err}`))); }
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
    for (const k of [...convCapsRetry.keys()]) clearConvCapsRetry(k);   // lane gmail-reply-known
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
  // ── THE RAW API'S ENGINE SIDE (B-2198, docs/design-channel-raw-api.md; the orchestrator is src/server/channel-api.js) ──
  // The tier rows live in their OWN index table (`apiGrants` — channel-acl's row shape, origin `api`, level `hidden`), so
  // an API grant never widens reach and never shows as an access row; the credential's token stays inside the adapter
  // (`apiBearer`) and is handed to the orchestrator's ONE fetch site only; the account's minute meters every call.
  function apiGrants() { return (store.index.table('apiGrants') || []).filter(Boolean); }
  /** The tier rows of ONE credential, replaced whole — the owner's (an agent's `by` is refused before anything is written). */
  async function setApiGrants(cred, rows, { by = 'user' } = {}) {
    if (/^agent:/.test(String(by))) return { ok: false, code: 'not-yours', error: 'API access is the user\'s to grant' };
    const id = String(cred || '');
    if (!id) return { ok: false, code: 'bad-request', error: 'cred is required' };
    await store.index.update((ix) => { ix.apiGrants = [...(Array.isArray(ix.apiGrants) ? ix.apiGrants : []).filter((g) => !(g && g.scope && g.scope.id === id)), ...rows]; });
    try { store.audit({ kind: 'api-acl', cred: id, rows: rows.map((g) => ({ principal: g.principal, api: g.api })), at: now(), by }); } catch {}
    return { ok: true, rows: apiGrants().filter((g) => g.scope && g.scope.id === id) };
  }
  /** The tier of a principal on a credential — asked BEFORE and AGAIN after every await of a call (a revoke lands at once). */
  function apiTierFor(ctx, cred) { return ACL.effectiveApi(ctx, String(cred || ''), apiGrants()); }
  /** A Channels account as a raw-API credential: its kind, its adapter's DECLARED raw-API row (`api`), its label, its
   *  bearer, the account's meter. `null` = no such account. */
  function apiCredential(adapterId) {
    const rec = adapterRecords().adapters.find((r) => r.id === adapterId) || null;
    if (!rec || rec.enabled === false) return null;
    const e = adapterFor(rec);
    const bearer = e && e.adapter && typeof e.adapter.apiBearer === 'function' ? () => e.adapter.apiBearer() : null;
    return {
      id: rec.id, kind: rec.kind, api: (e && e.adapter && e.adapter.api) || null, label: rec.label || rec.id, source: 'channels', bearer,
      // the account's vendor meter, shared with the channel's own reads: back-off, the minute's budget, the agents' share
      gate: () => (inBackoff(e) ? backoffRefusal(rec, e) : !affordable(rec, e) ? budgetRefusal(rec, e) : agentShareRefusal(rec, e)),
      charge: () => spendAs('agent', () => charge(e, budgetDecl(rec).unit === 'quota-unit' ? 5 : 1)),
      // a vendor 429 enters the account's rate ladder (its back-off), never a retry loop
      rateLimited: (sec) => { e.nextAt = Math.max(e.nextAt || 0, now() + Math.min(600, Math.max(1, Number(sec) || 30)) * 1000); },
    };
  }
  // the accounts whose adapter DECLARES a raw-API row (src/channels/index.js validateApi) — never a list of kinds
  const declaresApi = (kind) => { try { return registry.has(kind) && !!registry.get(kind).api; } catch { return false; } };
  function apiAccounts() { return adapterRecords().adapters.filter((r) => r && r.enabled !== false && declaresApi(r.kind)).map((r) => ({ id: r.id, kind: r.kind, label: r.label || r.id })); }
  return {
    store, registry, digest, notify, pass, refreshConvCaps, markRead, messages,
    retryConvCaps,   // lane gmail-reply-known: the owner's Retry on a refused send row
    // 2026-09-26: the aggregated IM — the reader surface, the scheduler's
    // override, the agent refresh, the three assignment grains, the migration
    conversationView, setRefresh, refresh, agentRefresh, watch, loadOlder, attachment, search,
    // design 010: the vendor's own search (the owner's press / scroll), a hit in context, the agent's `--around`
    searchVendor, aroundOwner, readAroundFor, forgetSearchMemo,
    conversationName,   // B-c127: THE NAME LADDER by key (the touches store names a touch by it)
    accountsBrief,   // B-5fe1: the account list a badge's hue is computed from
    healSelfAt,   // R3 (§23): the one-shot derivation of the owner's newest message for rows that predate the field
    setScopeAssignment, estimateScope, effectiveFor: (adapterId, convId) => effectiveFor(store.index.peek(`${adapterId}/${convId}`)), migrateAggregated,
    // R4 (2026-09-27): access and notification — two operations, access first; the compose verb; the agent's search
    setGrain, setAccess, setWatchers, removePattern, accessFor, migrateGrants, compose, searchFor, setAccountPolicy, effectiveForAccount,
    // lane channel-feed-authority: the scheduler's due rows of one account (the census legs) and the due index's counters
    dueListOf: (adapterId, { all = false } = {}) => { const rec = adapterRecords().adapters.find((r) => r.id === adapterId); const e = rec && live.get(rec.id); return rec ? dueList(rec, e || { dueNow: new Set() }, now(), { all }) : null; },
    dueIndexStats: () => ({ ...dueStats }),
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
    // lane scheduler-census-index: the census index's work — O(rows) builds, rows re-judged, rows read in all
    censusIndexStats: () => ({ ...censusIxStats }), CENSUS_INDEX_PROOF,
    schedulerIndexed: (adapterId, t = now()) => { const rec = adapterRecords().adapters.find((r) => r.id === adapterId); return rec ? schedulerOf(rec, clockIndexed(rec, t)) : null; },
    // design 008: the paged read + the first read's view counter (the scale suite's bound)
    rows, digestStats: () => ({ ...viewStats }),
    // verify r3: a READ-ONLY count of the per-account memories on the table above (the census leg + a diagnostic)
    liveMemSizes: (adapterId) => { const e = live.get(adapterId); if (!e) return null; const out = {}; for (const [name, spec] of Object.entries(LIVE_MEMS)) { const top = e[name]; let n = 0; if (top) { if (spec.nested) { for (const m of top.values()) n += m.size; } else n = top.size; } out[name] = n; } for (const k of ['feedSeen', 'feedGroups', 'feedUnlisted']) if (e[k] && typeof e[k].size === 'number') out[k] = e[k].size; return out; },   // verify r2: + the change feed's bounded memories
    LIVE_MEM_KEEP_MS,
    connect, reauthorize, finishAuth, cancelAuth, narrowAuth, oauthNarrow, disconnect, setEnabled, setOptions, adapterView,
    // lane lark-threads (B3): the owner's names for authors
    setAlias, aliasesOf,
    // r4 (design-integrations-per-account): the account's own client, the
    // transient consent, duplicate / remove with its reference check, the
    // owner-only config (D3), the in-place edits and the legacy own → custom copy
    clientFor, startOAuth, oauthStatus, oauthCallback, oauthLanding, consentLandingOf, duplicate, referencesOf, remove, setLabel, setCustomSecret, adapterConfig, mountClientsFor,
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
    previewRule,   // lane notify-rules-r2: the Notify… dialog's local preview of ONE keyword / regex rule
    // B-2198: the raw API's engine side (src/server/channel-api.js is its orchestrator)
    apiGrants, setApiGrants, apiTierFor, apiCredential, apiAccounts,
    // P3: outbox / policy / reach + the agent-facing reads (§9, §8, §11)
    propose, approve: (id, o) => onProposal(id, () => approve(id, o)), reject: (id, o) => onProposal(id, () => reject(id, o)), outboxView, expireSweep, pointerSync, receipt,
    filesSweep, outboxAttachment,   // design 005 §2.B (B-fd1f): attachments retention + the owner's file
    // 2026-09-27: the agent withdraws / replaces its OWN proposal (a decision of the user waits for a replace in flight)
    withdrawProposal, replaceProposal, reconcileReceiptFates,
    // P4: reconcile / the boot sweep / the per-channel honesty switch
    reconcile: (id, o) => onProposal(id, () => reconcile(id, o)), sweepSending, sweepReplaces, setSenderHonesty, honestyLineFor, deprecatedReceiptWakes,   // verify r2: two Check-outcome presses ask the adapter ONCE
    setPolicy, policyFor, setReach, reachView, reachFor, request, decideRequest,
    agentWatch, agentUnwatch, agentWatchesFor, setAgentDirectory, directoryLists,   // lane channel-agent-watch
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
    messageFacts,   // lane message-facts (B-f066): the owner's Details on a message stored before its facts
    threadRead, threadRefresh, threadOlder, reactionsRead, reactionsRefresh, react, unreact, emojiSet, emojiImage, avatarImage, migrateThreads, setReactionPolicy, proposeReaction, readThreadFor, agentThreadRefresh,
    withView: (adapterId, convId, records, o = {}) => withView(adapterRecords().adapters.find((r) => r.id === adapterId) || null, records, { ...o, convId }),
    reactionsFor: (adapterId, convId, ids) => { const rec = adapterRecords().adapters.find((r) => r.id === adapterId); return rec ? reactionsFor(rec, convId, ids) : new Map(); },
    rxStateOf: (adapterId) => { const e = live.get(adapterId); return e ? { reserved: Drain.rxMinuteAt(e.rxMinute, now()).n, calls: (e.rxCalls || []).filter((x) => now() - x < 60e3).length } : null; },
    appendSides: (adapterId, convId, sides) => { const rec = adapterRecords().adapters.find((r) => r.id === adapterId); return rec ? appendSides(rec, convId, sides) : { appended: 0 }; },
  };
}

module.exports = { create, previewText, SETTING_BOUNDS, DUPLICATE_FIELDS, DUPLICATE_NEVER, CUSTOM_KEY, PENDING_FLOW_TTL_MS, REQUESTS_PER_MINUTE, DEFAULT_BUDGET_PER_MIN, WATCH_TTL_MS, DISCOVERY_MAX_PAGES, REFRESH_QUEUE_CAP, REFRESH_OWNER_RESERVE, REFRESH_WAIT_MS, ATTACHMENT_MAX_BYTES, RECONCILE_SECONDS, BACKOFF_MS, PAGE, MAX_PAGES, FAILURES_BEFORE_LOUD, REAL_ADAPTERS, KEY_FILE, INBOX_KEY, KICK_MIN_INTERVAL_MS, PUSH_NOTIFY_DEBOUNCE_MS, PUSH_EVENT_DEDUP_MAX, PENDING_CAP, ESTIMATE_CAP, COALESCE_DEFAULT_SECONDS, COALESCE_MAX_SECONDS, BOOT_PENDING_DELAY_MS };
