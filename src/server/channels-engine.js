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
});
/** Consecutive failures before the adapter row goes amber and says so. */
const FAILURES_BEFORE_LOUD = 3;
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
  } = deps;
  if (!dataDir) throw new Error('channels-engine: dataDir is required');

  const store = createChannelStore({ dir: path.join(dataDir, 'channels'), now, log });
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
            rec.auth = { ...(rec.auth || {}), tokenEnc: enc, expiresAt: meta.expiresAt == null ? null : Number(meta.expiresAt), scopes: Array.isArray(meta.scopes) ? meta.scopes.slice() : [], user: meta.user || token.name || token.email || token.openId || (rec.auth && rec.auth.user) || null, updatedAt: now() };
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
        await store.adapters.update(() => { rec.auth = { tokenEnc: null, expiresAt: null, scopes: [], user: null, updatedAt: now() }; });
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
    };
  }
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
    return { perSec, unitsPerSec: Math.min(perSec, limit / 60), burst: Math.min(perSec, limit / 2), settingKey: p.settingKey || null, cost: { fetch: c('fetch'), discover: c('discover'), scanHost: c('scanHost') } };
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
    return { unit: b.unit, limit: b.limit, spent: Math.round(w.spent), spentBy: { timer: Math.round(by.timer || 0), agent: Math.round(by.agent || 0), owner: Math.round(by.owner || 0) }, exhausted, waiting: exhausted ? (e.waiting || 0) : 0, resetInSeconds: exhausted ? Math.max(0, Math.ceil((w.at + 60e3 - t) / 1000)) : 0, settingKey: b.settingKey, perSec: pd ? Math.round(pd.unitsPerSec * 100) / 100 : null };
  }

  // ── WHICH CONVERSATIONS ARE OPEN IN A WINDOW RIGHT NOW (hot, §6.2) ───────
  const watching = new Map();   // key -> expiry epoch ms (the window's heartbeat)
  const isWatched = (key, t = now()) => (watching.get(key) || 0) > t;

  // ── the lane, asked never assumed ───────────────────────────────────────
  function laneFor(rec, entry) { return caps.laneState(registry.capsOf(rec.kind), rec, entry, now()); }
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
      if (all || named) { out.push({ key: en.key, id: en.id, dueAt: named ? -1 : 0 }); continue; }
      const cad = cadenceOf(rec, en, t, T);
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
      await store.index.update((ix) => {
        for (const c of page.conversations || []) {
          const isNew = !ix.conversations[`${rec.id}/${c.id}`];
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
      await store.index.update((ix) => {
        for (const en of Object.values(ix.conversations)) {
          if (en && en.adapterId === rec.id && en.listedAt && en.listedAt < started && !en.unlistedAt) en.unlistedAt = now();
        }
      });
    }
    return { pages, complete };
  }
  /** The account's link instant (unread counts start there), stamped once. */
  async function ensureLinked(rec) {
    if (Number(rec.linkedAt) > 0) return;
    await store.adapters.update(() => { if (!(Number(rec.linkedAt) > 0)) rec.linkedAt = now(); });
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
        const hint = rate && err && err.detail ? Number(err.detail.retryAfterSec) : NaN;
        if (rate) {
          e.rateStrikes++;
          const own = RATE_BACKOFF_MS[Math.min(e.rateStrikes - 1, RATE_BACKOFF_MS.length - 1)];
          e.nextAt = now() + (Number.isFinite(hint) && hint > 0 ? Math.min(RATE_RETRY_AFTER_MAX_MS, Math.max(1e3, Math.ceil(hint * 1000))) : own);
          e.retryAfterSec = Number.isFinite(hint) && hint > 0 ? hint : null;
          if (paceDecl(rec)) e.paceTok = { tokens: 0, at: paceClock() };
        } else {
          e.failures++;
          e.nextAt = now() + BACKOFF_MS[Math.min(e.failures, BACKOFF_MS.length - 1)];
          e.retryAfterSec = null;
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
        return { now: now(), stopped, dropped: live.get(rec.id) !== e, connected, backoff: { epoch: e.backoffEpoch, pressEpoch: e.ownerPressEpoch }, budget: { remainingUnits }, agentShare: { remaining: share }, floors, floorMs: agentRefreshFloorSec() * 1000, pace: paceOf(rec, e) };
      };
      /** ONE conversation, the round the model named. */
      const fetchOne = async (act) => {
        const key = act.key;
        e.dueNow.delete(key);
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
            e.dq = Drain.turn(e.dq, { due: dueList(rec, e, now(), { all: e.dq.pass.force }), discoveryDue: discoveryDue(rec, e) });
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
      if (Array.isArray(w.freshAt)) freshAt.push(...w.freshAt);
      if (Array.isArray(w.fresh) && w.fresh.length) freshRecs.push(...w.fresh);
      if (w.lastAt && (!lastAt || w.lastAt > lastAt)) lastAt = w.lastAt;
      if (w.lastAt && w.lastAt >= lastTextAt && typeof w.lastText === 'string') { lastTextAt = w.lastAt; lastText = w.lastText; }
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
    const news = firstWalk ? freshRecs.filter((r) => Number(r.at) > (Number(rec.linkedAt) || 0)) : freshRecs;
    if (news.length) track(onFresh(rec, convId, news, { lane, origin }));
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
    const add = (a) => { if (!a) return; const id = String(a.id || ''); const name = String(a.name || ''); const k = id || name; if (!k || seen.has(k)) return; seen.add(k); out.push({ id, name }); };
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
    // reads them off each broadcast).
    let unreadTotal = 0;
    for (const en of Object.values(liveIx)) if (en && byId.has(en.adapterId) && !en.unlistedAt) unreadTotal += Number(en.unread) || 0;
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
  function rowView(rec, en, ctx = viewCtx()) {
    const t = ctx.t;
    const c = registry.capsOf(rec.kind);
    const lane = laneOrScan(rec, en);
    const cadence = caps.cadenceFor(c, lane, en, t, { tiers: ctx.T, watched: isWatched(en.key, t) });
    const eff = effectiveFor(en);
    const ob = ctx.outbox.get(en.key) || { awaiting: 0, unknown: 0 };
    const lw = en.stats && Array.isArray(en.stats.wakes) && en.stats.wakes.length ? en.stats.wakes[en.stats.wakes.length - 1] : null;
    return {
      key: en.key, id: en.id, adapterId: en.adapterId, adapterLabel: rec.label || rec.id, title: en.title, kind: en.kind,
      participants: en.participants, lastAt: en.lastAt, lastText: en.lastText || '', unread: en.unread || 0,
      unlisted: !!en.unlistedAt,
      refresh: en.refresh && typeof en.refresh === 'object' ? { every: en.refresh.every, by: en.refresh.by || null } : null,
      cadence: { seconds: cadence.seconds, tier: cadence.tier, source: cadence.source, paused: !!cadence.paused },
      freshness: caps.freshnessClaim(c, lane, en, t, { enabled: rec.enabled !== false, cadence }),
      offers: {
        sendAsUser: caps.offers(c, en.convCaps, 'send-as-user', t),
        sendAsBot: caps.offers(c, en.convCaps, 'send-as-bot', t),
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
      convCaps: caps.convCapsState(en.convCaps, t),
      offers: {
        read: caps.offers(c, en.convCaps, 'read', t),
        sendAsUser: caps.offers(c, en.convCaps, 'send-as-user', t),
        sendAsBot: caps.offers(c, en.convCaps, 'send-as-bot', t),
        fetchAttachment: caps.offers(c, en.convCaps, 'fetch-attachment', t),
      },
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

  /** The account's scheduler census (the card's "N conversations · M
   *  unread" line and the tiers' counts): computed from the live index. */
  function schedulerView(rec, t = now()) {
    const out = { conversations: 0, unread: 0, hot: 0, warm: 0, cold: 0, paused: 0, overridden: 0, unlisted: 0, due: 0, lastDiscoveryAt: null, discovering: false, firstIngest: null };
    let walked = 0, reading = 0;   // lane R5: the first-read census — conversations being read (not paused, not refused by the vendor) and those walked once
    const e = live.get(rec.id) || null;
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

  /** ONE broadcast per pass, carrying the recomputed RESULT — never one per
   *  message, and never a bare "something changed" (the cache-invalidation
   *  law: one dirty signal, one computation). */
  function notify(changed = [], { full = null } = {}) {
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
      broadcast({ type: 'channels-updated', changed: uniq.map((k) => liveIx[k] ? liveIx[k].id : k.slice(k.indexOf('/') + 1)), changedKeys: uniq, partial, digest: d });
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
    const convId = ev.convId != null ? String(ev.convId) : null;
    if (ev.kind === 'record' && ev.record && convId) {
      if (lane.carryContent) {
        if (!store.index.live()[`${rec.id}/${convId}`]) {
          // born by push: the row exists before the record's index half lands
          await store.index.update(() => { const en = store.index.entry(rec.id, convId); if (!(Number(en.readAt) > 0)) en.readAt = Number(rec.linkedAt) || 0; if (!en.title) en.title = convId; });
        }
        const w = store.appendRecords(rec.id, convId, [ev.record]);   // DURABLE — the ack is this function's return
        if (w.appended) { p.samples = caps.pushSamplesAdd(p.samples, { at: t, n: w.appended, p: 0 }); p.missRate = caps.pushMissRate(p.samples, t).rate; }
        afterPush(rec, e, convId, w);
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
      await store.index.update(() => { const en = store.index.entry(rec.id, convId); if (!(Number(en.readAt) > 0)) en.readAt = Number(rec.linkedAt) || 0; if (!en.title) en.title = convId; });
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
    if (w.lastAt && w.lastAt >= b.lastTextAt && typeof w.lastText === 'string') { b.lastTextAt = w.lastAt; b.lastText = w.lastText; }
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
    return !!store.index.snapshot().conversations[`${adapterId}/${convId}`];
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
    if (r && r.ok) return { ok: true, appended: r.appended || 0, pending: !!r.pending, polledAt: r.polledAt || null, conversation: { key: en.key, adapterId, id: convId, title: en.title || convId } };
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
      const cc = caps.convCapsState(en.convCaps, t);
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
   */
  async function loadOlder(adapterId, convId, { before = null, beforeId = null, limit = null } = {}) {
    const rec = adapterRecords().adapters.find((r) => r.id === adapterId);
    if (!rec || !known(adapterId, convId)) return { ok: false, code: 'not-found', error: 'No such conversation' };
    const n = Math.min(200, Math.max(1, Number(limit) || historyPageSize()));
    const local = store.readTail(adapterId, convId, { before, beforeId, limit: n });
    if (local.length >= n) return { ok: true, records: local, source: 'local', fetched: 0, exhausted: false };
    const c = registry.capsOf(rec.kind);
    if (c.olderHistory !== 'page' || rec.enabled === false) return { ok: true, records: local, source: 'local', fetched: 0, exhausted: true, vendorHasNoOlder: c.olderHistory !== 'page' };
    const e = adapterFor(rec);
    if (!affordable(rec, e)) return { ...budgetRefusal(rec, e), ok: true, refused: 'vendor-budget', records: local, source: 'local', fetched: 0, exhausted: false };
    const oldest = local.length ? local[0] : (before !== null && before !== undefined ? { at: Number(before), vendorId: beforeId || null } : store.oldestRecord(adapterId, convId));
    let r;
    try { r = await vendor(rec, e, () => e.adapter.older(convId, { before: oldest ? { at: Number(oldest.at), vendorId: oldest.vendorId || null } : null, limit: n - local.length })); }
    catch (err) { return { ok: false, code: err instanceof ChannelError ? err.code : 'vendor-error', error: String((err && err.message) || err), records: local }; }
    if (outlived(rec, e)) return { ok: false, code: 'account-changed', error: 'the account changed while the page was fetched — nothing was kept', records: local };
    const w = store.prependRecords(adapterId, convId, r.records || []);
    const again = store.readTail(adapterId, convId, { before, beforeId, limit: n });
    const cutoff = now() - 90 * 86400e3;
    return { ok: true, records: again, source: 'vendor', fetched: (r.records || []).length, appended: w.appended, exhausted: !!r.exhausted, truncated: (r.records || []).some((x) => Number(x.at) < cutoff) };
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
      const put = await store.attachmentPut(adapterId, convId, attId, { data, name: att.name || (r && r.name) || null, mime: (r && r.mime) || att.mime || null }, { budgetBytes: attachmentBudgetBytes() });
      if (put.evicted.length) log.log(`[channels] ${adapterId}: attachment cache over ${Math.round(attachmentBudgetBytes() / 1048576)} MB — evicted ${put.evicted.length} least-recently-used file(s)`);
      return { ok: true, file: put.file, meta: put.meta, cached: false, evicted: put.evicted.length };
    })();
    attInflight.set(k, run);
    try { return await run; } finally { attInflight.delete(k); }
  }

  /** SEARCH one account's local logs (design §6.5) — async, byte-capped. */
  async function search(adapterId, q, { limit = 100 } = {}) {
    const rec = adapterRecords().adapters.find((r) => r.id === adapterId);
    if (!rec) return { ok: false, code: 'not-found', error: `no such account '${adapterId}'` };
    const query = String(q || '').trim();
    if (query.length < 2) return { ok: false, code: 'bad-request', error: 'a search needs at least 2 characters' };
    const r = await store.search(adapterId, query, { limit: Math.min(200, Math.max(1, Number(limit) || 100)) });
    const liveIx = store.index.live();
    const results = r.results.map((x) => ({ key: `${adapterId}/${x.convId}`, convId: x.convId, title: (liveIx[`${adapterId}/${x.convId}`] || {}).title || x.convId, record: x }));
    return { ok: true, results, truncated: r.truncated, scannedBytes: r.scannedBytes, files: r.files };
  }

  async function refreshConvCaps(adapterId, convId) {
    const rec = adapterRecords().adapters.find((r) => r.id === adapterId);
    if (!rec) return null;
    const e = adapterFor(rec);
    const cc = await e.adapter.convCaps(convId);
    // `create:false`: a conversation the vendor no longer lists may have been
    // removed from the index between the ask and the answer, and a cache entry
    // is not a reason to resurrect the row it describes.
    await store.index.update(() => { const en = store.index.entry(adapterId, convId, { create: false }); if (en) en.convCaps = cc; });
    return cc;
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
    if (changed) notify([convId]);
    return true;
  }

  /** `beforeId` is the OTHER half of the page boundary — see the store's
   *  `(at, vendorId)` total order. Dropping it here would put the loss back. */
  function messages(adapterId, convId, { before = null, beforeId = null, limit = 50 } = {}) {
    return store.readTail(adapterId, convId, { before, beforeId, limit });
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
        p.tokenMeta = { expiresAt: meta.expiresAt == null ? null : Number(meta.expiresAt), scopes: Array.isArray(meta.scopes) ? meta.scopes.slice() : [], user: meta.user || token.name || token.email || token.openId || null };
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
      rec.auth = { ...(rec.auth || {}), tokenEnc: p.tokenEnc, expiresAt: p.tokenMeta.expiresAt, scopes: p.tokenMeta.scopes, user: p.tokenMeta.user || (rec.auth && rec.auth.user) || null, updatedAt: now() };
      if (p.identity && Object.keys(p.identity).length) rec.identity = { ...(rec.identity || {}), ...p.identity };
      rec.lastAuthError = null; rec.lastAuthAt = now();
    });
    dropLive(rec.id, 'client switched');
    log.log(`[channels] ${rec.id}: re-authorized under ${rec.credentialKey}${rec.auth.user ? ` as ${rec.auth.user}` : ''}`);
    const e = adapterFor(rec);
    await refreshAuth(e);
    e.failures = 0; e.nextAt = 0; e.rateStrikes = 0; e.backoffKind = null;
    await retractFailure(rec);
    if (!stopped) notify([]);
    if (!stopped) pass(rec.id, { force: true }).catch((err) => log.warn('[channels] pass after re-authorize failed:', err && err.message));
    if (!stopped && timer) syncPushLanes().catch(() => {});
  }
  /** START a consent for an account that does not exist yet:
   *  `{kind, clientPreset | credentialKey | clientId + clientSecret |
   *  credential, options?}` → `{flowId, url, flow}`. */
  async function startOAuth(input = {}) {
    const mod = connectableFor(String(input.kind || input.backend || ''));
    const choice = clientChoice(mod, input);
    const r = await beginPending(mod, choice, { options: input.options });
    return { ...r, url: r.flow && r.flow.consentUrl };
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
      error: p.error || (cancelled && !p.done ? `the sign-in was ${cancelled === 'timeout' ? 'not finished in time' : cancelled}` : null),
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
    notify([]);
    return { adapter: adapterView(rec), flow: safeFlow(flow) };
  }
  async function connectFromFlow(mod, b) {
    sweepPending();
    const p = pendingFlows.get(String(b.flowId));
    if (!p || p.targetId) throw httpErr(404, 'no-flow', 'no finished sign-in with that id — sign in again from the account dialog');
    if (p.kind !== mod.kind) throw httpErr(400, 'flow-kind-mismatch', `that sign-in was for ${p.kind}, not ${mod.kind}`);
    if (!p.done) throw httpErr(409, 'flow-not-done', 'the sign-in has not finished yet — approve access on the sign-in page (or paste the redirect URL back) first');
    if (!p.ok) throw httpErr(409, 'flow-failed', `the sign-in failed: ${p.error || 'unknown'} — sign in again`);
    const named = clientChoice(mod, b, { allowDefault: false });
    if (named && (named.credentialKey !== p.choice.credentialKey || (named.credentialKey === CUSTOM_KEY && (String(named.credential.appId) !== String(p.choice.credential.appId) || box.dec(named.credential.appSecretEnc) !== box.dec(p.choice.credential.appSecretEnc))))) {
      throw httpErr(400, 'flow-client-mismatch', `that sign-in ran under ${p.choice.credentialKey}; the dialog now names ${named.credentialKey} — a token is bound to the client it was issued under, so sign in again under the new client`);
    }
    pendingFlows.delete(p.flowId);   // taken ONCE
    const recs = adapterRecords();
    const rec = newRecord(mod, { id: mintAdapterId(mod.kind, recs), credentialKey: p.choice.credentialKey });
    if (p.choice.credential) rec.credential = p.choice.credential;
    rec.options = normalizeOptions(mod, b.options, p.rec.options);
    if (b.name) rec.label = cleanLabel(b.name) || rec.label;
    rec.auth = { tokenEnc: p.tokenEnc, expiresAt: p.tokenMeta.expiresAt, scopes: p.tokenMeta.scopes, user: p.tokenMeta.user || null, updatedAt: now() };
    if (p.identity && Object.keys(p.identity).length) rec.identity = { ...p.identity };   // verify r5: whose account this record is, from its first consent
    rec.lastAuthAt = now();
    await store.adapters.update((a) => { a.adapters.push(rec); });
    const e = adapterFor(rec);
    await refreshAuth(e);
    log.log(`[channels] ${rec.id}: connected${rec.auth.user ? ` as ${rec.auth.user}` : ''} (${rec.credentialKey})`);
    notify([]);
    if (!stopped) pass(rec.id, { force: true }).catch((err) => log.warn('[channels] pass after connect failed:', err && err.message));
    if (!stopped && timer) syncPushLanes().catch(() => {});
    return { adapter: adapterView(rec), flow: null };
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
      await store.adapters.update(() => { rec.lastAuthError = null; });
      notify([]);
      return { adapter: adapterView(rec), flow: r.flow, rebind: true, credentialKey: choice.credentialKey };
    }
    if (choice && choice.credentialKey === CUSTOM_KEY) await store.adapters.update(() => { rec.credential = choice.credential; });   // same id, the secret replaced in place
    if (rec.credentialKey === OWN_KEY) await inlineLegacyClient(rec);
    const e = adapterFor(rec);
    assertResolvable(mod, rec);
    const flow = await e.adapter.auth.begin();
    await store.adapters.update(() => { rec.lastAuthError = null; });
    notify([]);
    return { adapter: adapterView(rec), flow: safeFlow(flow) };
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
    return { flowId: st.flowId, mode: st.mode, running: !!st.running, done: !!st.done, ok: st.ok, error: st.error || null, cancelled: st.cancelled || null, consentUrl: st.consentUrl, redirectUri: st.redirectUri, port: st.port, listening: !!st.listening, refusal: st.refusal || null, pasteBack: true, startedAt: st.startedAt, expiresAt: st.expiresAt };
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
    for (const en of Object.values(store.index.snapshot().conversations)) {
      if (!en) continue;
      if (en.adapterId === adapterId) {
        for (const r of convGrainOf(en).access) refs.push({ kind: 'access', key: en.key, convId: en.id, title: en.title || en.id, scope: 'conversation', principal: { kind: r.principal.kind, id: r.principal.id, name: r.principal.name || null } });
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
    const u = caps.offers(c, en && en.convCaps, 'send-as-user', t);
    const b = caps.offers(c, en && en.convCaps, 'send-as-bot', t);
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
    const ix = store.index.snapshot();
    const f = ix.filters && ix.filters[filterId];
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
  function convGrainOf(en) { return F.grainOf({ access: en && en.access, watchers: en && en.watchers }, legacyConvAssignment(en)); }
  /** The facts a pattern matches over (PURE input). */
  function convFacts(en) { return { title: (en && en.title) || '', participants: (en && en.participants) || '', kind: (en && en.kind) || '', authors: (en && Array.isArray(en.authors)) ? en.authors : [] }; }
  /** WHO HAS ACCESS AND WHO WATCHES — the ONE answer for a conversation. */
  function effectiveFor(en) {
    if (!en) return null;
    return F.effectiveGrants({ conversation: convGrainOf(en), patterns: patternsOf(en.adapterId), account: accountGrainOf(en.adapterId) }, convFacts(en));
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
    let holder = null;
    if (item.source === 'conversation') holder = en2 ? liftGrainInPlace(ix, en2, 'conversation') : null;
    else if (item.source === 'account') holder = liftGrainInPlace(ix, (ix.accountAssignments || {})[rec.id] || null, 'account');
    else holder = liftGrainInPlace(ix, (ix.patternAssignments || {})[item.patternId] || null, 'pattern');
    const w = holder && Array.isArray(holder.watchers) ? holder.watchers.find((x) => pkOf(x.principal) === pk) : null;
    if (w && (!w.stats || typeof w.stats !== 'object')) w.stats = { wakes: [], hits: [] };
    return w;
  }
  /** One watcher's ledger view (the card's "N wakes / 24 h"). */
  function ledgerView(s0, t) {
    const s = s0 || {};
    const okWakes = (Array.isArray(s.wakes) ? s.wakes : []).filter((w) => w && w.ok !== false);
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
    };
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
  async function onFresh(rec, convId, fresh, { lane, origin } = {}) {
    if (stopped || !Array.isArray(fresh) || !fresh.length) return;
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
    const eff = effectiveFor(en);
    if (!eff || !eff.watchers.length) return;
    // a named AGENT first, then groups: a group's round-robin skips a session
    // this batch already reached (one batch never bills one agent twice)
    const order = eff.watchers.slice().sort((a, b) => (a.watcher.principal.kind === 'agent' ? 0 : 1) - (b.watcher.principal.kind === 'agent' ? 0 : 1));
    const per = [];
    const union = new Set();
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
        for (const r of fresh) {
          try {
            if (w.mode === 'all') { hits.push({ record: r, why: [] }); continue; }
            const m = F.matchRecord(filter, r, {});
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
  function othersFor(eff, pk) {
    if (!eff) return [];
    const out = new Map();
    for (const a of eff.access) { const k = pkOf(a.row.principal); if (k !== pk) out.set(k, { name: a.row.principal.name || a.row.principal.id, authority: a.row.authority, notify: null }); }
    for (const w of eff.watchers) { const k = pkOf(w.watcher.principal); if (k !== pk && out.has(k)) out.get(k).notify = w.watcher.notify; }
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
      const w = holder ? F.grainOf(holder).watchers.find((x) => pkOf(x.principal) === pk) : null;
      if (!w) return { ok: false, why: 'not-watching' };
      const groups = [];
      const held = [];   // [{id, key, carried}]
      let others = null;
      for (const en of Object.values(store.index.live())) {
        if (!en || en.adapterId !== rec.id || !Array.isArray(en.pending) || !en.pending.length) continue;
        const eff = effectiveFor(en);
        const item = eff ? eff.watchers.find((x) => itemIs(x, pk)) : null;
        if (!item || item.source !== source || (source === 'pattern' && item.patternId !== patternId)) continue;
        const pend = pendingOf(en, pk, eff);
        if (!pend.hits.length && !pend.elided) continue;
        if (!others) others = othersFor(eff, pk);
        groups.push({ title: en.title || en.id, convId: en.id, hits: pend.hits, elided: pend.elided });
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
      const wNow = ok ? w : F.grainOf(source === 'account' ? accountGrainOf(rec.id) : patternById(patternId)).watchers.find((x) => pkOf(x.principal) === pk);
      const still = ok ? IN_EFFECT : { watched: !!wNow, targetGone: !!wNow && target.via === 'group' && !groupStillHas(w, target.cid) };
      const stillWatched = ok || still.watched;
      const targetGone = !ok && still.watched && still.targetGone;   // r3: the member died — the hits stay pending for the group's next digest
      if (!ok && !stillWatched) log.log(`[channels] scope digest ${sKey}: ${pk} lost its notification while the digest was in flight — the refused block is not stashed`);
      if (targetGone) log.log(`[channels] scope digest ${sKey}: ${target.cid} left group ${pk} while the digest was in flight — ${n} hit(s) held for the group's next digest`);
      if (!ok && stillWatched && !targetGone && deliver && typeof deliver.stashFor === 'function') { try { deliver.stashFor(target.cid, { source: 'channel', kind: 'notification', fromName, text }); stashed = true; } catch (err) { log.warn(`[channels] stash failed: ${(err && err.message) || err}`); } }
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
      const eff0 = effectiveFor(en0);
      if (!en0 || !eff0) return { ok: false, why: 'nothing-pending' };
      const pks = pk ? [pk] : eff0.watchers.map((x) => pkOf(x.watcher.principal));
      for (const p of pks) {
        const en = store.index.peek(`${rec.id}/${convId}`);
        const eff = effectiveFor(en);
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
    const all = live.filter((x) => x && Array.isArray(x.groups) && x.groups.includes(w.principal.id)).map((x) => x.cid);
    const got = batch && batch.got ? batch.got : null;
    const fresh = got ? all.filter((c) => !got.has(c)) : all;
    const members = fresh.length ? fresh : all;
    const rot = store.index.snapshot().rotations || {};
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
  const scopeFor = (rec, convId, pk) => { const eff = effectiveFor(store.index.peek(`${rec.id}/${convId}`)); const item = eff ? eff.watchers.find((x) => itemIs(x, pk)) : null; return item ? scopeKeyOf(item, rec) : null; };
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
    const eff = effectiveFor(store.index.peek(`${rec.id}/${convId}`));
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
    const eff = effectiveFor(en);
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
    const title = en.title || convId;
    const whys = [...new Set(hits.flatMap((h) => h.why || []))];
    const inherited = item.source === 'conversation' ? null : { kind: item.source, label: item.source === 'pattern' ? F.patternSummary((patternById(item.patternId) || {}).pattern || { rules: [] }) : null };
    const others = othersFor(eff, pk);
    const text = digest
      ? F.renderDigestBlock({ adapterLabel: label, title, convId, hits, elided: allElided, windowMinutes: windowMinutes || w.digestMinutes })
      : F.renderWakeBlock({ adapterLabel: label, title, convId, hits, elided: allElided, coalesced, inherited, others });
    const fromName = `Channels · ${label}`;
    const n = hits.length + allElided;
    const cardText = `${title}: ${n} message${n === 1 ? '' : 's'} — ${F.whyText(whys)}${coalesced && coalesced.n > 1 ? ` (${coalesced.n} in ${Math.round(coalesced.seconds)} s, one wake)` : ''}`;
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
      try { r = await deliver.deliverToConversation(target.cid, text, { kind: 'notification', spendReason: 'channel-message', fromName, cardText }); }
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
      try { deliver.stashFor(target.cid, { source: 'channel', kind: 'notification', fromName, text }); stashed = true; } catch (err) { log.warn(`[channels] stash failed: ${(err && err.message) || err}`); }
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
    const u = caps.offers(c, en && en.convCaps, 'send-as-user', t);
    if (u.offered) return { as: 'user', why: null, userWhy: null };
    const b = caps.offers(c, en && en.convCaps, 'send-as-bot', t);
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
    const en = store.index.snapshot().conversations[`${adapterId}/${convId}`] || null;
    const rec = en ? adapterRecords().adapters.find((r) => r.id === adapterId) || null : null;
    return { en, rec };
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
    const honestyLine = pending ? P.honestyLine({ draftedBy: p.draftedBy, enabled: honestyLineFor(rec) }) : (p.result && p.result.honestyLine ? P.honestyLine({ draftedBy: p.draftedBy, enabled: true }) : null);
    const can = p.state === 'unknown' ? (c ? P.canReconcile(c) : { ok: false, code: 'no-adapter', why: 'the adapter no longer exists' }) : null;
    return {
      ...p, adapterLabel: rec ? (rec.label || rec.id) : p.adapterId, identityWarning: c ? caps.identityWarning(c) : null, ttlAt, canDecide: p.state === 'awaiting-approval',
      // r3: how many agents approving this WAKES (a billed turn each) — the
      // card says it and echoes it with the Approve (`expectWakes`)
      wakes: sendStartsTurn(rec) ? 1 : 0,
      honestyLine, canReconcile: !!(can && can.ok), reconcileWhy: can && !can.ok ? can.why : null, reconcileWhyCode: can && !can.ok ? (can.code || null) : null,
      // THE OUTCOME AS STRUCTURE (a3 i18n): `p.reason` stays the English
      // contract string agents read; the card words `outcome` in its language.
      outcome: P.outcomeOf(p),
    };
  }
  function outboxView({ key = null, limit = OUTBOX_LIST_CAP } = {}) {
    const list = proposalsFor(key).slice(0, Math.max(1, limit)).map(proposalView);
    const all = proposalsFor();
    return {
      proposals: list,
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
  async function transition(id, to, by, patch = null) {
    let verdict = { ok: false, why: 'no such proposal' };
    await store.outbox.update((ob) => {
      const p = ob.proposals[id];
      if (!p) return;
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
    if (!v.ok) return { ok: false, code: 'bad-proposal', error: v.error };
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
    const decision = own
      ? { mode: 'direct', reasons: [], detail: { ownMessage: true } }
      : P.decideOutbound({ channelPolicy: policyFor(rec, en), guards: guardsFromSettings(), proposal: { ...v.proposal, authority }, now: t });
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
          id, adapterId, convId, key: en.key, title: en.title || convId,
          text: v.proposal.text, originalText: v.proposal.text, replyTo: v.proposal.replyTo, why: v.proposal.why, attachments: v.proposal.attachments,
          draftedBy: drafter, authority, at: t, updatedAt: t, state: 'proposed',
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
    return { ok: true, proposal: proposalView(fresh), decision };
  }

  /** The ACCOUNT grain alone, as `effectiveGrants` answers it (a NEW
   *  conversation has no facts for a rule to match, so only the account's
   *  own rows apply to a composed message). */
  function effectiveForAccount(adapterId) { return F.effectiveGrants({ account: accountGrainOf(adapterId) }, {}); }
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
    let created = null;
    await store.outbox.update((ob) => {
      const id = store.outbox.nextId();
      const cp = v.proposal.compose;
      created = ob.proposals[id] = {
        id, adapterId, convId: null, key: `${adapterId}/~compose/${id}`, title: cp.subject,
        compose: { to: cp.to.slice(), cc: cp.cc.slice(), subject: cp.subject },
        text: v.proposal.text, originalText: v.proposal.text, replyTo: null, why: v.proposal.why, attachments: v.proposal.attachments,
        draftedBy: drafter, authority, at: t, updatedAt: t, state: 'proposed',
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
    return { ok: true, proposal: proposalView(fresh), decision };
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
      for (const en of Object.values(store.index.live())) if (en && en.adapterId === rec.id && ACL.canSee(reachFor(ctx, rec, en).level)) visible.set(en.id, en.title || en.id);
      if (!visible.size) continue;
      // only the VISIBLE conversations' logs are read at all
      const r = await store.search(rec.id, query, { limit: 200, convIds: [...visible.keys()] });
      truncated = truncated || !!r.truncated;
      for (const x of r.results) {
        if (!visible.has(x.convId)) continue;
        results.push({ key: `${rec.id}/${x.convId}`, adapterId: rec.id, adapter: rec.label || rec.id, convId: x.convId, title: visible.get(x.convId), at: x.at || null, author: x.author || null, text: String(x.text || '').slice(0, 400), vendorId: x.vendorId || null });
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
  async function approve(id, { text = null, by = 'user', consent = null, mayWake = null } = {}) {
    const p0 = store.outbox.snapshot().proposals[id];
    if (!p0) return { ok: false, code: 'not-found', error: 'no such proposal' };
    if (p0.state !== 'awaiting-approval') return { ok: false, code: 'bad-state', error: `proposal is ${p0.state}, not awaiting approval` };
    // r3: approving a send that starts a turn is a wake — the echo first
    // (nothing moves on a refusal: the proposal still awaits)
    const wakeN = sendStartsTurn(adapterRecords().adapters.find((r) => r.id === p0.adapterId) || null) ? 1 : 0;
    const echo = wakeGate(p0.convId, wakeN, { consent });
    if (!echo.ok) return { ...echo, proposal: proposalView(p0) };
    const edited = typeof text === 'string' && text.trim() && text !== p0.text;
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
    if (rec) { try { cc = composing ? await adapterFor(rec).adapter.composeCaps() : await refreshConvCaps(p0.adapterId, p0.convId); } catch (err) { ccErr = (err && err.message) || String(err); } }
    const c = rec ? registry.capsOf(rec.kind) : null;
    const stillOffered = composing
      ? !!(rec && cc && Array.isArray(cc.sendAs) && cc.sendAs.includes(p0.sendAs))
      : !!(rec && en && cc && c && caps.offers(c, cc, p0.sendAs === 'bot' ? 'send-as-bot' : 'send-as-user', t).offered);
    if (!stillOffered) {
      const why = !rec ? 'adapter no longer exists' : ccErr ? `convCaps could not be resolved (${ccErr})` : (cc && cc.why) || 'not-offered';
      await transition(id, 'failed', 'recheck', (p) => {
        p.approvedBy = by; if (edited) { p.text = text; p.edited = true; }
        p.reason = `send-not-available: ${why}`; p.failure = { code: 'send-not-available', why, at: now() };
      });
      const p1 = store.outbox.snapshot().proposals[id];
      auditOutbox(p1, 'refused-at-approval', { code: 'send-not-available', why });
      await receipt(id);
      await pointerSync(p1.key);
      notifyOutbox([id]); notify(p1.convId ? [p1.convId] : []);
      log.log(`[channels] outbox ${id}: approval refused — ${why}`);
      return { ok: false, code: 'send-not-available', error: `cannot send now: ${why}`, proposal: proposalView(store.outbox.snapshot().proposals[id]) };
    }
    // …then the pace, only once the send is still offered (a refusal above
    // spends no slot); a floored approve leaves the proposal AWAITING
    const gate = wakeGate(p0.convId, wakeN, { mayWake });
    if (!gate.ok) return { ...gate, proposal: proposalView(store.outbox.snapshot().proposals[id]) };
    // r4: a THROW after the grant (the transition's or the send's store
    // write refused) gives the slot back unless the request may have left
    try {
      const tr = await transition(id, 'sending', by, (p) => { p.approvedBy = by; if (edited) { p.text = text; p.edited = true; } });
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

  async function reject(id, { reason = null, by = 'user' } = {}) {
    const tr = await transition(id, 'rejected', by, (p) => { p.reason = reason ? String(reason).slice(0, 500) : P.REJECTED_DEFAULT_REASON; p.approvedBy = null; });
    if (!tr.ok) return { ok: false, code: 'bad-state', error: tr.why };
    const p = store.outbox.snapshot().proposals[id];
    auditOutbox(p, 'reject', { reason: p.reason });
    await receipt(id);
    await pointerSync(p.key);
    notifyOutbox([id]); notify(p.convId ? [p.convId] : []);
    return { ok: true, proposal: proposalView(store.outbox.snapshot().proposals[id]) };
  }

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
      sendLeft.add(id);
      // B-6acc: a COMPOSED message starts a NEW conversation through the
      // adapter's declared `compose` (the same idempotency key, the same
      // handle / lost-answer rules as a reply)
      try { r = p.compose ? await e.adapter.compose({ to: p.compose.to, cc: p.compose.cc, subject: p.compose.subject, text: wire, idemKey: p.id, as: p.sendAs, onHandle }) : await e.adapter.send(p.convId, { text: wire, replyTo: p.replyTo, idemKey: p.id, as: p.sendAs, onHandle }); }
      catch (err) {
        r = err && typeof err.toJSON === 'function' ? err.toJSON() : { ok: false, code: (err && err.code) || 'vendor-error', retryable: false, detail: { threw: true, message: (err && err.message) || String(err) } };
        if (err && err.message && !r.message) r.message = err.message;
        threw = !!(r.detail && r.detail.threw);
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
    if (to === 'sent' && rec && r.observed) { try { await noteIdentityObserved(rec, p1.result.sentAs, r.observed, p1.result.vendorMessageId); } catch (err) { log.warn(`[channels] identity observation not recorded: ${(err && err.message) || err}`); } }
    if (to === 'unknown') await speakUnknown(p1);
    else await receipt(id);
    await pointerSync(p1.key);
    notifyOutbox([id]); notify(p1.convId ? [p1.convId] : []);
    log.log(`[channels] outbox ${id} → ${p1.adapterId}/${p1.convId || (p1.compose ? `(new: ${(p1.compose.to || []).join(', ')})` : '')}: ${to}${p1.reason ? ` — ${p1.reason}` : ''}`);
    sendLeft.delete(id);
    return { ok: to === 'sent', state: to };
  }
  /** An unknown outcome owes the USER a look (§9.4), not the agent a verdict. */
  async function speakUnknown(p) {
    if (!userTodos || typeof userTodos.add !== 'function') return;
    try {
      const title = String(p.title || p.convId).slice(0, 120);
      const item = userTodos.add(INBOX_KEY, {
        origin: 'channels', // B-328d
        text: `Outbox: a send to ${title} has an UNKNOWN outcome`,
        detail: `Proposal ${p.id} (${p.adapterId}): the adapter did not answer whether the message landed. It is NOT retried automatically — a duplicate in somebody else's room is worse than asking. Check the conversation on the platform; the Outbox window shows the proposal.\n\n${p.reason || ''}`,
        urgency: 'high', by: 'agent', sessionName: 'Channels',
        i18n: {
          text: { key: i18nKey('Outbox: a send to {title} has an UNKNOWN outcome'), params: { title } },
          detail: [
            { key: i18nKey('Proposal {id} ({adapter}): the adapter did not answer whether the message landed. It is NOT retried automatically — a duplicate in somebody else\'s room is worse than asking.'), params: { id: p.id, adapter: p.adapterId } },
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
      answer = await e.adapter.reconcile(p.convId, { idemKey: p.id, sentAt: p.attemptAt || p.updatedAt || p.at, text: (p.wire && p.wire.text) || p.text, replyTo: p.replyTo, as: p.sendAs, handle: p.sendHandle || null, ...(p.compose ? { compose: p.compose } : {}) });
    } catch (err) {
      answer = { unknown: true, reason: `reconcile threw: ${(err && err.message) || err}`, detail: { threw: true, code: (err && err.code) || null } };
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
   * THE RECEIPT (§9.3). Built by the PURE module, stored on the proposal,
   * and handed to the drafting AGENT through the ladder with `noWake` (it
   * rides the next turn) unless the assignment opted in to a wake (decision
   * 8). A refusal is stashed through the ladder's own durable stash.
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
    const en = cf.en;
    const rec = cf.rec || adapterRecords().adapters.find((r) => r.id === p.adapterId) || null;
    // R4: the drafter's OWN watcher in effect here opted in — the drafter
    // itself or a group it belongs to (the drafter's groups are the live
    // session's; the pre-R4 path passed none, so a group's opt-in never fired)
    const drafterCtx = { kind: 'agent', id: cid, groups: groupsOfSession(cid) };
    const optInOf = (eff) => (eff ? eff.watchers.find((x) => x.watcher.receiptWake === true && F.rowNames(x.watcher, drafterCtx)) || null : null);
    // R4 verify r2 (2026-09-27, money): A RECEIPT WAKE IS A BILLED TURN AND
    // COUNTS AGAINST THE WATCHER'S DAILY CAP LIKE ANY OTHER. An agent that
    // drafted five proposals (free) and had them rejected / expired got five
    // billed receipt wakes under a cap of 2, none on its ledger, and the next
    // fresh record made a sixth. Over the cap the receipt still reaches the
    // drafter — with `noWake` (it rides the next turn), refused by name on the
    // watcher's ledger — and a delivered receipt wake is written to the ledger.
    // R4 verify r3 (money): THE RECEIPT QUEUES ON THE WATCHER'S OWN CHAINS
    // (the conversation's, then its scope's — the order every wake takes), and
    // reads the ledger INSIDE that section. Read before the ladder's await and
    // written after it, five CONCURRENT rejects (five HTTP requests, the
    // owner clearing an outbox) each passed the same stale ledger: five billed
    // receipt wakes under a cap of 2, and a wake in flight beside a receipt
    // made two billed turns under a cap of 1 — the class r2 closed for wakes.
    // R4 verify r4: the opt-in that names the chain is READ INSIDE the
    // conversation's section (a watcher opting in between an outside read and
    // the section ran the receipt's cap read outside every chain); a receipt
    // nobody opted in to runs inside the conversation's section alone.
    const key = p.convId ? `${p.adapterId}/${p.convId}` : null;
    const scopeOf = () => { const en2 = key ? store.index.peek(key) : null; const eff2 = en2 ? effectiveFor(en2) : (p.compose && rec ? effectiveForAccount(rec.id) : null); const o = optInOf(eff2); return o && rec ? scopeKeyOf(o, rec) : null; };
    return billedWake({ conv: key, scopeOf }, () => receiptNow(id, p, rc, cid, rec, key, optInOf));
  }
  /** The receipt's delivery — paced by the opted-in watcher's ledger read
   *  HERE (inside its serial section), the ledger written after the ladder. */
  async function receiptNow(id, p, rc, cid, rec, key, optInOf) {
    const en = key ? store.index.peek(key) : null;
    const effR = en ? effectiveFor(en) : (p.compose && rec ? effectiveForAccount(rec.id) : null);
    const optIn = optInOf(effR);
    const tR = now();
    const pace = optIn ? F.paceVerdict((optIn.watcher.stats && optIn.watcher.stats.wakes) || [], tR, F.digestCap(optIn.watcher)) : { ok: true };
    let wake = !!optIn && pace.ok && !stopped;
    // THE ROW BEFORE THE BILL (see reserveWake): a receipt wake whose row cannot be written rides the next turn instead
    const wk0 = wake ? { at: tR, n: 1, cid, ok: true, lane: 'reserved', why: null, refused: null, whys: [], digest: false, grain: optIn.source, p: pkOf(optIn.watcher.principal), receipt: id } : null;
    const resId = wake ? await reserveWake(rec, en ? p.convId : null, optIn, wk0) : null;
    if (wake && !resId) { wake = false; log.log(`[channels] receipt ${id} → ${cid}: the ledger could not take the wake's row — delivered without a wake`); }
    if (optIn && !pace.ok) {
      await store.index.update((ix) => { const own = watcherRef(ix, rec, en ? store.index.entry(p.adapterId, p.convId, { create: false }) : null, optIn); if (own) own.stats.lastRefusal = { at: tR, why: `receipt: ${String(pace.why || '').slice(0, 180)}` }; });
      log.log(`[channels] receipt ${id} → ${cid}: the watcher's cap holds — ${pace.why}; delivered without a wake`);
    }
    const text = P.renderReceiptBlock(rc, { adapterLabel: rec ? (rec.label || rec.id) : p.adapterId, title: p.title, text: p.text });
    const fromName = 'Channels · Outbox';
    const cardText = `Receipt: proposal ${p.id} ${rc.status}${rc.reason ? ` — ${String(rc.reason).slice(0, 160)}` : ''}`;
    let r = null, stashed = false;
    if (!deliver || typeof deliver.deliverToConversation !== 'function') r = { ok: false, reason: 'no delivery ladder wired', refused: 'unwired' };
    else {
      try { r = await deliver.deliverToConversation(cid, text, { kind: 'notification', noWake: !wake, spendReason: 'channel-receipt', fromName, cardText }); }
      catch (err) { r = { ok: false, reason: `ladder threw: ${(err && err.message) || err}`, refused: 'error' }; }
      if (!(r && r.ok) && typeof deliver.stashFor === 'function') {
        try { deliver.stashFor(cid, { source: 'channel-receipt', kind: 'notification', fromName, text }); stashed = true; } catch (err) { log.warn(`[channels] receipt stash failed: ${(err && err.message) || err}`); }
      }
    }
    const delivery = { at: now(), ok: !!(r && r.ok), lane: r && r.ok ? (r.lane || 'message') : (stashed ? 'stash' : 'none'), stashed, refused: (r && r.refused) || null, woke: wake, why: r && r.ok ? null : String((r && r.reason) || 'refused').slice(0, 200) };
    await store.outbox.update((ob) => { if (ob.proposals[id]) ob.proposals[id].receiptDelivery = delivery; });
    if (wake) {
      // the receipt WOKE the drafter (or was refused): the reserved row on the opted-in watcher's ledger becomes the outcome (and the conversation's history takes it when it woke), like every wake
      const wk = { ...wk0, ok: !!delivery.ok, lane: delivery.lane, why: delivery.why, refused: delivery.refused };
      try { await store.index.update((ix) => {
        const e2 = en ? store.index.entry(p.adapterId, p.convId, { create: false }) : null;
        if (e2 && delivery.ok) { healP2(e2); e2.stats.wakes = F.pruneLedger([...e2.stats.wakes, { ...wk, id: resId }], tR); }
        const own = watcherRef(ix, rec, e2, optIn);
        if (own) finalizeRow(own, resId, wk, tR);
      }); } catch (err) { log.warn(`[channels] receipt ${id}: the ledger could not take the wake's outcome — the reservation stays counted: ${(err && err.message) || err}`); }
      if (en) notify([p.convId]);
    }
    log.log(`[channels] receipt ${id} → ${cid}: ${delivery.ok ? `delivered via ${delivery.lane}` : (stashed ? 'stashed for the next turn' : 'not delivered')}${delivery.why ? ` (${delivery.why})` : ''}`);
    return rc;
  }

  /** The TTL sweep (§9.1): a proposal left in `awaiting-approval` past its
   *  TTL expires, with a receipt. Cheap; runs from the tick once a minute. */
  async function expireSweep() {
    const t = now();
    const due = proposalsFor().filter((p) => P.expiryVerdict(p, t).expired);
    for (const p of due) {
      const tr = await transition(p.id, 'expired', 'ttl', (q) => { q.reason = 'expired: not approved within 24 h'; });
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
    const en = store.index.snapshot().conversations[key];
    if (!en) return;
    const awaiting = proposalsFor(key).filter((p) => p.state === 'awaiting-approval');
    const rec = adapterRecords().adapters.find((r) => r.id === en.adapterId) || null;
    if (awaiting.length) {
      if (!userTodos || typeof userTodos.add !== 'function') return;
      const title = String(en.title || en.id).slice(0, 120);
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
        const item = userTodos.add(INBOX_KEY, { origin: 'channels', text, detail, urgency: 'normal', by: 'agent', sessionName: 'Channels', i18n });
        if (item && item.id) await store.index.update(() => { const e2 = store.index.entry(en.adapterId, en.id, { create: false }); if (e2) e2.pendingTodoId = item.id; });
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
      return { ok: true, reach: reachView(store.index.snapshot().conversations[key]) };
    }
    const v = ACL.validateGrant({ principal, scope, level, origin: 'user', at: t, by });
    if (!v.ok) return { ok: false, code: 'bad-grant', error: v.error };
    await store.index.update(() => { const e2 = store.index.entry(adapterId, convId, { create: false }); if (!e2) return; healP2(e2); e2.reachEntries = ACL.applyGrant(e2.reachEntries, v.grant); });
    try { store.audit({ kind: 'acl', op: 'grant', principal: v.grant.principal, scope, level, origin: 'user', at: t, by }); } catch {}
    notify([convId]);
    return { ok: true, reach: reachView(store.index.snapshot().conversations[key]) };
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
    if (ACL.canSee(reach.level)) return { ok: true, already: true, level: reach.level };
    if (!ACL.canRequest(reach.level)) return ACL.notFound();
    const t = now();
    const reason = String(why || '').trim().slice(0, 500);
    if (!reason) return { ok: false, code: 'bad-request', error: 'a reason is required — the user reads it' };
    const open = (en.reachRequests || []).find((r) => r.status === 'open' && r.principal && r.principal.kind === 'agent' && r.principal.id === ctx.id);
    if (open) return { ok: true, request: { ...open }, already: true };
    const req = { id: `rq-${t.toString(36)}-${Math.random().toString(36).slice(2, 8)}`, principal: { kind: 'agent', id: ctx.id, name: ctx.name || null }, scope: { kind: 'conversation', id: en.key }, why: reason, at: t, status: 'open', todoId: null, decidedAt: null };
    if (userTodos && typeof userTodos.add === 'function') {
      try {
        const title = String(en.title || en.id).slice(0, 120);
        const item = userTodos.add(INBOX_KEY, {
          origin: 'channels', // B-328d
          text: `${ctx.name || ctx.id} requests access to ${title}`,
          detail: `Agent session ${ctx.name || ''} (${ctx.id}) asks to see ${rec.label || rec.id} · ${en.title || en.id}.\nReason: ${reason}\n\nApprove or deny from the conversation's Reach dialog (rail → Channels → row menu → Reach…). Approving grants that ONE session visibility on that ONE conversation; group defaults are untouched.`,
          urgency: 'normal', by: 'agent', sessionName: 'Channels',
          i18n: {
            text: { key: i18nKey('{agent} requests access to {title}'), params: { agent: ctx.name || ctx.id, title } },
            detail: [
              { key: i18nKey('Agent session {name} ({id}) asks to see {adapter} · {title}.'), params: { name: ctx.name || '', id: ctx.id, adapter: rec.label || rec.id, title: en.title || en.id } },
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
    const snap = store.index.snapshot();
    const en = Object.values(snap.conversations).find((x) => (x.reachRequests || []).some((r) => r.id === requestId));
    if (!en) return { ok: false, code: 'not-found', error: 'No such request' };
    const req = en.reachRequests.find((r) => r.id === requestId);
    if (req.status !== 'open') return { ok: false, code: 'bad-state', error: `request already ${req.status}` };
    const t = now();
    let grant = null;
    await store.index.update(() => {
      const e2 = store.index.entry(en.adapterId, en.id, { create: false });
      if (!e2) return;
      healP2(e2);
      const r2 = e2.reachRequests.find((r) => r.id === requestId);
      if (!r2) return;
      r2.status = approve ? 'approved' : 'denied'; r2.decidedAt = t; r2.decidedBy = by;
      if (approve) { const out = ACL.approveRequest(e2.reachEntries, { principal: r2.principal, scope: r2.scope, at: t, by }); e2.reachEntries = out.grants; grant = out.grant; }
    });
    try { store.audit({ kind: 'acl', op: approve ? 'grant' : 'deny', principal: req.principal, scope: req.scope, level: approve ? 'visible' : null, origin: 'request', requestId, at: t, by }); } catch {}
    if (req.todoId && userTodos && typeof userTodos.get === 'function') {
      try { const it = userTodos.get(req.todoId); if (it && it.status === 'open' && it.sessionKey === INBOX_KEY) userTodos.setStatus(req.todoId, 'done', RESOLVED_BY); } catch {}
    }
    notify([en.id]);
    return { ok: true, request: { ...req, status: approve ? 'approved' : 'denied' }, grant };
  }

  // ── the agent-facing reads (§11) — reach FIRST, uniform not-found ────────
  /** Every conversation this principal may SEE or REQUEST — hidden ones are
   *  simply absent (no oracle). Never a message body. */
  function listFor(ctx) {
    const t = now();
    const recs = adapterRecords().adapters;
    const byId = new Map(recs.map((r) => [r.id, r]));
    const out = [];
    for (const en of Object.values(store.index.snapshot().conversations)) {
      const rec = byId.get(en.adapterId);
      if (!rec || rec.enabled === false) continue;
      const reach = reachFor(ctx, rec, en);
      if (reach.level === 'hidden') continue;
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
        key: en.key, adapterId: en.adapterId, adapter: rec.label || rec.id, id: en.id, title: en.title || en.id, kind: en.kind,
        level: reach.level, unread: en.unread || 0, lastAt: en.lastAt || null, polledAt: (en.lane && en.lane.lastPollAt) || null,
        canSend: !!who.as, sendWhy: who.why, sendAs: who.as, identityMarking: c.identityMarking,
        policy: policyFor(rec, en).mode,
        access: acc.length ? { authority, via: acc[0].source, as: acc[0].row.principal.kind } : null,
        watched: wat.length ? { notify: wat[0].watcher.notify, mode: wat[0].watcher.mode, via: wat[0].source, as: wat[0].watcher.principal.kind } : null,
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
    return { ok: true, conversation: { key: en.key, adapterId, id: convId, title: en.title || convId, polledAt: (en.lane && en.lane.lastPollAt) || null }, records };
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
  /** Own proposals only — somebody else's id is the same uniform not-found. */
  function statusFor(ctx, proposalId = null) {
    const mine = proposalsFor().filter((p) => p.draftedBy && p.draftedBy.kind === 'agent' && ctx && p.draftedBy.id === ctx.id);
    if (proposalId) {
      const p = mine.find((x) => x.id === proposalId);
      if (!p) return { ok: false, code: 'not-found', error: 'no such proposal (not found, or not yours)' };
      return { ok: true, proposal: proposalView(p) };
    }
    return { ok: true, proposals: mine.slice(0, 50).map(proposalView) };
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
      const vw = F.validateWatchers(minted, access);
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
      // access removed ⇒ its watcher goes too (notification needs access)
      watchers = cur.watchers.filter((w) => granted.has(pkOf(w.principal)));
    }
    const beforeA = new Set(cur.access.map((r) => pkOf(r.principal)));
    const beforeW = new Set(cur.watchers.map((w) => pkOf(w.principal)));
    const removedA = cur.access.filter((r) => !granted.has(pkOf(r.principal)));
    const addedA = access.filter((r) => !beforeA.has(pkOf(r.principal)));
    const changedW = new Set([...beforeW].filter((pk) => { const nw = watchers.find((w) => pkOf(w.principal) === pk); const ow = prevW.get(pk); return !nw || JSON.stringify({ ...nw, stats: null, updatedAt: null }) !== JSON.stringify({ ...ow, stats: null, updatedAt: null }); }));
    const oldFilterIds = cur.watchers.map((w) => w.filterId).filter(Boolean);
    const empty = !access.length && !watchers.length;
    await store.index.update((ix) => {
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
      const eff = effectiveFor(en);
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
  function setAccess(adapterId, grain, list, opts) { return setGrain(adapterId, grain, { access: list }, opts); }
  /** NOTIFY — the second operation: a grain's whole WATCHERS list; every
   *  principal must already hold access there. */
  function setWatchers(adapterId, grain, list, opts) { return setGrain(adapterId, grain, { watchers: list }, opts); }
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
      for (const en of Object.values(store.index.live())) if (en && en.adapterId === rec.id) { const g = convGrainOf(en); if (g.access.length) push('conversation', g, { key: en.key, title: en.title || en.id }); }
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
    const en = store.index.snapshot().conversations[key];
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
    const snap = store.index.snapshot();
    for (const en of Object.values(snap.conversations)) {
      if (!Array.isArray(en.pending) || (!en.pending.length && !elidedTotal(en))) continue;
      const eff = effectiveFor(en);
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
      const due = discoveryDue(rec, e, t) || e.dueNow.size > 0 || dueList(rec, e, t).length > 0;
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
        if (!w || !w.stats || !Array.isArray(w.stats.wakes)) continue;
        const before = w.stats.wakes.length;
        w.stats.wakes = w.stats.wakes.filter((r) => !(r && r.reserved === true && r.bootId !== BOOT_ID));
        released += before - w.stats.wakes.length;
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
  function start() {
    if (timer || stopped) return;
    timer = setInterval(tick, 5000);
    if (timer.unref) timer.unref();
    healSelfAt().catch((err) => log.warn(`[channels] selfAt heal failed: ${(err && err.message) || err}`));
    try { const orphans = orphanWatchers(); if (orphans.length) log.warn(`[channels] ${orphans.length} notification row(s) without access at their grain — inert until access is granted there: ${orphans.map((o) => `${o.principal} on ${o.grain} ${o.id}`).join(', ').slice(0, 600)}`); } catch (err) { log.warn(`[channels] boot notification census failed: ${(err && err.message) || err}`); }
    try { const z = capZeroDigests(); if (z.length) log.warn(`[channels] ${z.length} digest notification(s) stored with a daily cap of 0 — read as cap 1 (a digest is a paced wake and cap 0 never delivers); the store is not rewritten, edit each to set a real cap: ${z.map((o) => `${o.principal} on ${o.grain} ${o.id}`).join(', ').slice(0, 600)}`); } catch (err) { log.warn(`[channels] boot digest-cap census failed: ${(err && err.message) || err}`); }
    try { track(releaseStaleReservations()); } catch (err) { log.warn(`[channels] boot reservation release failed: ${(err && err.message) || err}`); }
    try { scheduleBootPending(); } catch (err) { log.warn(`[channels] boot pending scan failed: ${(err && err.message) || err}`); }
    // P4: a proposal the previous process died on mid-send is `unknown`, not
    // "not sent" — and never re-sent.
    sweepSending().catch((err) => log.warn(`[channels] boot outbox sweep failed: ${(err && err.message) || err}`));
  }
  function stop() {
    stopped = true;
    if (offIntegrations) { try { offIntegrations(); } catch {} offIntegrations = null; }
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
      for (const w of holder ? F.grainOf(holder).watchers : []) results.push(await flushScope(rec, source, patternId || null, pkOf(w.principal), {}));
      const first = results.find((x) => x && x.ok) || results[0] || { ok: false, why: 'not-watching' };
      return { ...first, results };
    },
    adapterRecords, laneOrScan, start, stop,
    connect, reauthorize, finishAuth, cancelAuth, disconnect, setEnabled, setOptions, adapterView,
    // r4 (design-integrations-per-account): the account's own client, the
    // transient consent, duplicate / remove with its reference check, the
    // owner-only config (D3), the in-place edits and the legacy own → custom copy
    clientFor, startOAuth, oauthStatus, oauthCallback, duplicate, referencesOf, remove, setLabel, setCustomSecret, adapterConfig,
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
    propose, approve, reject, outboxView, expireSweep, pointerSync, receipt,
    // P4: reconcile / the boot sweep / the per-channel honesty switch
    reconcile, sweepSending, setSenderHonesty, honestyLineFor,
    setPolicy, policyFor, setReach, reachView, reachFor, request, decideRequest,
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
  };
}

module.exports = { create, SETTING_BOUNDS, DUPLICATE_FIELDS, DUPLICATE_NEVER, CUSTOM_KEY, PENDING_FLOW_TTL_MS, REQUESTS_PER_MINUTE, DEFAULT_BUDGET_PER_MIN, WATCH_TTL_MS, DISCOVERY_MAX_PAGES, REFRESH_QUEUE_CAP, REFRESH_OWNER_RESERVE, REFRESH_WAIT_MS, ATTACHMENT_MAX_BYTES, RECONCILE_SECONDS, BACKOFF_MS, PAGE, MAX_PAGES, FAILURES_BEFORE_LOUD, REAL_ADAPTERS, KEY_FILE, INBOX_KEY, KICK_MIN_INTERVAL_MS, PUSH_NOTIFY_DEBOUNCE_MS, PUSH_EVENT_DEDUP_MAX, PENDING_CAP, ESTIMATE_CAP, COALESCE_DEFAULT_SECONDS, COALESCE_MAX_SECONDS, BOOT_PENDING_DELAY_MS };
