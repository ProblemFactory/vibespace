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
 * told; content rides only while `laneState().carryContent` holds and the
 * conversation is tracked — otherwise the event is a cursor KICK (one
 * kick-origin pass per KICK_MIN_INTERVAL_MS, the sleep woken, not just a
 * fetch). THE EXCLUSIVITY MEASUREMENT: while push carries content, a record a
 * TIMER pass sees first is a miss and a record a KICK pass sees first is push
 * doing its job; only records stamped after `push.contentSince` on an
 * already-anchored conversation are judged (a first walk is a backlog);
 * `pushDemotionVerdict` over the ROLLING window demotes the lane, which is
 * SAID on the row and in the log and cleared by NOTHING but a re-declaration
 * (`setPush`), which zeroes the counters and retries the lane once.
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
const caps = require('../channel-caps.js');
const fake = require('../channels/fake.js');
const lark = require('../channels/lark.js');
const gmail = require('../channels/gmail.js');
const { secretBox } = require('../secret-box.js');
const { OWN_KEY, CLUSTER_PREFIX } = require('./integration-store.js');   // the two credential-key forms, spelled ONCE (the store's)
const { createOAuthLoopback } = require('../oauth-loopback.js');
// P2: the PURE filter / assignment / renderer (design §7). Everything after
// `store.append` is PURE except the two ORCH calls at the end of `wake()`.
const F = require('../channel-filter.js');
// P3: the outbox POLICY (state machine + direct/review + the receipt), the
// AgentReach ACL and the built-in Agents adapter (design §8, §9, §12.3).
const P = require('../channel-policy.js');
const ACL = require('../channel-acl.js');
const agents = require('../channels/agents.js');

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

/** §6.2's per-adapter request budget. A SETTING in the design; a named
 *  constant here because P0a ships no settings category and a setting with no
 *  rendered section is unreachable (test-architecture §44). It becomes
 *  `channels.requestBudget` with the first real adapter in P1. */
const REQUESTS_PER_MINUTE = 20;
/** Poll cadences (seconds) — the floor is the VENDOR's, so it comes from caps. */
const RECONCILE_SECONDS = 15 * 60;
/** Exponential backoff after a typed `rate-limited` / `transport` failure. */
const BACKOFF_MS = [0, 30e3, 2 * 60e3, 5 * 60e3, 15 * 60e3];
/** Consecutive failures before the adapter row goes amber and says so. */
const FAILURES_BEFORE_LOUD = 3;
/** Records per history page. */
const PAGE = 50;
/** Pages one pass may walk before it gives up and reports `complete:false` —
 *  fence 9 says keep paging to the anchor, and this bounds "keep". */
const MAX_PAGES = 20;
/** Discovery pages (of ≤100 conversations) one pass walks through the
 *  adapter's cursor. */
const DISCOVERY_PAGES = 5;
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
    const reg = (id, fn) => { if (!(integrations.hasTestRunner && integrations.hasTestRunner(id))) integrations.registerTest(id, fn); };
    reg('fake', fake.integrationTest);
    for (const m of REAL_ADAPTERS) if (m.integration && typeof m.integrationTest === 'function') reg(m.integration, (args) => m.integrationTest(args, fetchFn));
  }
  const resolveIntegration = integrations && typeof integrations.resolveIntegration === 'function'
    ? (id, opts) => integrations.resolveIntegration(id, opts) : undefined;
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
    const boundKey = named && offeredCredentials(integrationId).some((c) => c.key === named && c.available !== false) ? named : null; // an unavailable `own` (listed since r3) never binds
    if (boundKey) return { key: boundKey, evidence: 'token', tokenKey: named, boundKey };
    const pick = defaultCredentialKey(integrationId);
    return { key: pick, evidence: pick ? 'row-pick' : 'nothing-resolves', tokenKey: named, tokenWhy: token ? null : (why || null), boundKey: null };
  }

  const live = new Map();     // adapterId -> { adapter, record, passing, failures, nextAt, budget }
  let timer = null;
  let stopped = false;

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
    return {
      read() {
        const a = rec.auth || {};
        if (!a.tokenEnc) return { token: null, why: 'never-authenticated' };
        try { return { token: JSON.parse(box.dec(a.tokenEnc)), why: null }; }
        catch (e) { return { token: null, why: `token-undecryptable: ${(e && e.message) || e}` }; }
      },
      async write(token, meta = {}) {
        const enc = box.enc(JSON.stringify(token));
        await store.adapters.update(() => {
          rec.auth = { ...(rec.auth || {}), tokenEnc: enc, expiresAt: meta.expiresAt == null ? null : Number(meta.expiresAt), scopes: Array.isArray(meta.scopes) ? meta.scopes.slice() : [], user: meta.user || token.name || token.email || token.openId || (rec.auth && rec.auth.user) || null, updatedAt: now() };
        });
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
      const adapterDeps = { fetch: fetchFn, log, tokens: tokensFor(rec), state: stateFor(rec), oauth: flows, onAuthDone: (adapterId, r) => onAuthDone(adapterId, r), deliver, liveSessions, credentialKey: rec.credentialKey || null };
      const adapter = registry.create(rec.kind, rec, { now, resolveIntegration, ...adapterDeps });
      e = { kind: rec.kind, adapter, record: rec, passing: null, failures: 0, nextAt: 0, spent: 0, windowAt: now(), authState: null,
        // P1b: the push lane's runtime — the handle, the arm token every
        // callback is keyed on, the event-id memory, the coalesced batch and
        // the kick timer.
        liveHandle: null, liveToken: null, seenEvents: new Map(), pushBatch: null, pushTimer: null, kickTimer: null, lastKickAt: 0, kickAfter: false };
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

  /** A request budget the pass spends; `false` = spend nothing more this tick. */
  function spend(e, n = 1) {
    const t = now();
    if (t - e.windowAt >= 60e3) { e.windowAt = t; e.spent = 0; }
    if (e.spent + n > REQUESTS_PER_MINUTE) return false;
    e.spent += n;
    return true;
  }

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

  // ── ONE pass over ONE adapter, single-flight ────────────────────────────
  async function pass(adapterId, { force = false, origin = 'timer' } = {}) {
    const recs = adapterRecords();
    const rec = recs.adapters.find((r) => r.id === adapterId);
    if (!rec || rec.enabled === false) return { ok: false, why: 'no-such-adapter' };
    const e = adapterFor(rec);
    if (e.passing) { if (origin === 'kick') e.kickAfter = true; return e.passing; }   // single flight, PER ADAPTER; a kick is not lost
    if (!force && now() < e.nextAt) return { ok: false, why: 'backoff' };
    e.passing = (async () => {
      const changed = [];
      try {
        if (!spend(e)) return { ok: false, why: 'budget' };
        const st = await refreshAuth(e);      // the row's auth is the adapter's answer, re-asked every pass
        // A record that was never authenticated (a Connect the user began and
        // abandoned, a disconnected adapter) has nothing to pass WITH: no
        // request is built, no failure is counted, the row says "not
        // connected". A DEAD token or a WITHDRAWN credential is different —
        // those passes run, fail with the vendor's typed refusal, and SPEAK
        // (fence 8), because the user has something to act on.
        if (st && st.state === 'unknown' && st.why === 'never-authenticated') return { ok: false, why: 'not-connected' };
        // Discovery PAGES through the adapter's cursor, bounded by
        // DISCOVERY_PAGES and by the request budget — a vendor that answers
        // 100 per page would otherwise hide every conversation past the first
        // page for ever (fence 9's shape one layer up).
        const listed = { conversations: [] };
        for (let cursor = null, pages = 0; ; pages++) {
          const page = await e.adapter.listConversations({ limit: 100, cursor });
          listed.conversations.push(...page.conversations);
          cursor = page.cursor || null;
          if (!cursor || page.complete !== false && !cursor || pages + 1 >= DISCOVERY_PAGES || !spend(e)) break;
        }
        // Discovery only ANNOUNCES conversations. Nothing is ingested until a
        // user marks one tracked (§5 invariant 6: `tracked` is opt-in — a
        // privacy decision, a cost decision, and what keeps this a panel
        // rather than a mail client).
        await store.index.update((ix) => {
          for (const c of listed.conversations) {
            const en = store.index.entry(rec.id, c.id);
            en.vendorId = c.vendorId; en.title = c.title; en.kind = c.kind;
            en.participants = c.participants;
            if (c.lastAt && (!en.lastAt || c.lastAt > en.lastAt)) en.lastAt = c.lastAt;
          }
        });

        // `scan.hostFacts` TRIGGER ③ (design §4 / §5 invariant 7, r6):
        // UNCONDITIONALLY before a scan pass that would advance the anchor —
        // the store analogue of "re-resolve at approval time". Of the three
        // named triggers this is the only one P0a has a producer for (① is
        // the connect wizard's, which is P1's; ② "the first panel render past
        // the TTL" is subsumed here, because a render has no side effects — the
        // r2 loop lesson — and every scan pass refreshes anyway). The facts
        // land on the LIVE row through the serialized door and the resolver
        // reads them back on the next line; a stale record is never read
        // around. It is asked of the RESOLVER, not of `caps.receive`.
        let mayIngest = true;
        if (laneOrScan(rec, {}).via === 'scan') {
          if (!spend(e)) mayIngest = false;            // a round trip is a request
          else {
            const hf = await e.adapter.scanHost((rec.scan && rec.scan.hostId) || null);
            await store.adapters.update(() => { if (!rec.scan) rec.scan = EMPTY_SCAN(); rec.scan.hostFacts = hf; });
          }
        }
        const snap = store.index.snapshot();
        const tracked = Object.values(snap.conversations).filter((x) => x.adapterId === rec.id && x.tracked);
        for (const t of tracked) {
          if (!mayIngest || !spend(e)) break;
          const got = await ingest(e, rec, t.id, origin);
          if (got.appended || got.anchorMoved) changed.push(t.id);
        }
        e.failures = 0;
        e.nextAt = 0;
        await store.adapters.update(() => { rec.lastPass = { at: now(), ok: true, code: null }; rec.consecutiveFailures = 0; });
        await retractFailure(rec);
        notify(changed);
        return { ok: true, changed };
      } catch (err) {
        const code = err instanceof ChannelError ? err.code : 'vendor-error';
        e.failures++;
        e.nextAt = now() + BACKOFF_MS[Math.min(e.failures, BACKOFF_MS.length - 1)];
        await store.adapters.update(() => { rec.lastPass = { at: now(), ok: false, code, error: String((err && err.message) || err).slice(0, 400) }; rec.consecutiveFailures = e.failures; });
        // A failing loop MUST reach the user (fence 8): the adapter row goes
        // amber, the log says it, and a "For you" item is FILED naming the
        // adapter and the vendor's own words — by the producer that will
        // RETRACT it on the first passing pass (`retractFailure`).
        if (e.failures === FAILURES_BEFORE_LOUD) {
          log.warn(`[channels] ${rec.id}: ${e.failures} consecutive failures (${code}): ${(err && err.message) || err}`);
          await speakFailure(rec, code, err);
        }
        notify([]);
        return { ok: false, why: code };
      } finally {
        e.passing = null;
        if (e.kickAfter) { e.kickAfter = false; kick(rec, e); }   // the kick that arrived mid-pass runs its own pass
      }
    })();
    return e.passing;
  }

  /**
   * Ingest ONE conversation. THE ORDER IS THE INVARIANT (design §5 invariant
   * 4): records land in the durable append-only log FIRST, the anchor moves in
   * the index SECOND, and the coalesced flush happens LAST — so a crash
   * anywhere costs at most a re-read, which the log's dedup absorbs. The
   * anchor moves ONLY on a pass the adapter called complete.
   */
  async function ingest(e, rec, convId, origin = 'timer') {
    const before = store.index.snapshot().conversations[`${rec.id}/${convId}`] || {};
    // THE LANE IS ASKED BEFORE A BYTE IS FETCHED (r3). A scan lane the
    // resolver gives no source for (facts stale, client absent, grant refused,
    // platform undeclared) ingests NOTHING and says why — `complete:false`
    // keeps the anchor where it is, exactly as an incomplete page does. This
    // is the same answer the chip draws, so the two cannot disagree.
    syncContentSince(rec);
    const lane = laneOrScan(rec, before);
    if (lane.via === 'scan' && !lane.source) return { appended: 0, duplicates: 0, anchorMoved: false, complete: false, why: lane.why };
    let anchor = before.anchor || null;
    let appended = 0, duplicates = 0, lastAt = before.lastAt || null, complete = true, pages = 0;
    // the newest APPENDED record's text + instant (the group list's last line, §22): tracked apart from
    // `lastAt`, which discovery may already have set from the vendor's listing to that very instant
    let lastText = null, lastTextAt = -Infinity;
    const freshAt = [];
    const freshRecs = [];   // P2: exactly what became durable on this pass — the filter's input

    for (;;) {
      const opts = { anchor, limit: PAGE };
      if (lane.via === 'scan') opts.source = lane.source;   // HANDED DOWN, never re-derived by the adapter
      const r = await e.adapter.history(convId, opts);
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
      if (!spend(e)) { complete = false; break; }
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
    let anchorMoved = false;
    await store.index.update((ix) => {
      const en = store.index.entry(rec.id, convId);
      if (complete && anchor && anchor !== en.anchor) { en.anchor = anchor; anchorMoved = true; }
      if (judged) { en.lane = en.lane || {}; en.lane.firstSeenTotal = (en.lane.firstSeenTotal || 0) + judged; en.lane.firstSeenByPoll = (en.lane.firstSeenByPoll || 0) + missed; }
      if (lastAt && (!en.lastAt || lastAt > en.lastAt)) en.lastAt = lastAt;
      // the group list's LAST LINE (§22): cached beside `lastAt`, re-derivable from the log
      if (typeof lastText === 'string' && lastTextAt >= (Number(en.lastAt) || 0)) en.lastText = lastTextOf(lastText);
      // DERIVED, never a stored fact (§5 invariant 7): cached for render speed
      // and always re-derivable from the log and the read mark.
      en.unread = store.countSince(rec.id, convId, en.readAt || 0);
      // The label is the RESOLVED lane — the one that just carried this
      // batch — never `caps.receive` (r3).
      en.lane = { ...en.lane, via: lane.via };
      // This pass FETCHED (a poll or a scan read), whatever lane the resolver
      // names for the row; `lastPushAt` is stamped by the push path alone.
      if (lane.via === 'scan') en.lane.lastScanAt = now(); else en.lane.lastPollAt = now();
    });
    if (judged) await checkDemotion(rec);
    // P2: THE FUNNEL (§6.1) — after the records are durable, the SAME
    // matcher, the SAME wake decision, whatever lane fetched them. A poll or
    // scan pass is already a batch, so its hits are one wake with no window.
    if (freshRecs.length) track(onFresh(rec, convId, freshRecs, { lane, origin }));
    // 3. the flush is COALESCED by the store (dirty + debounce + interval +
    //    SIGINT/SIGTERM), never once per change.
    // RETENTION runs where the growth happens — right after a pass that
    // actually appended, on the ONE conversation that grew. A store whose
    // retention policy has no caller is a policy nobody enforces, and a
    // sweep over every conversation on a timer would read logs nothing
    // touched. The bounds and the 7-day floor are the store's.
    if (appended) { try { store.trim(rec.id, convId); } catch (err) { console.warn('[channels] trim failed:', err && err.message); } }
    return { appended, duplicates, anchorMoved, complete, judged, missed };
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
  function digest() {
    const t = now();
    const recs = adapterRecords();
    const snap = store.index.snapshot();
    const adapters = recs.adapters.map((rec) => adapterView(rec, t));
    // The kinds a user may still CONNECT (one record per kind in v1), each
    // with the credential facts the wizard's three copy paths need.
    const have = new Set(recs.adapters.map((r) => r.kind));
    const available = REAL_ADAPTERS.filter((m) => !have.has(m.kind)).map((m) => ({ kind: m.kind, label: m.label || m.kind, integration: m.integration || null, credential: credentialFacts(m.integration), credentials: offeredCredentials(m.integration), credentialDefault: defaultCredentialKey(m.integration), receive: m.caps.receive, sendAs: m.caps.sendAs }));
    const byId = new Map(recs.adapters.map((r) => [r.id, r]));
    const conversations = Object.values(snap.conversations).map((en) => {
      const rec = byId.get(en.adapterId);
      if (!rec) return null;
      const c = registry.capsOf(rec.kind);
      const lane = laneOrScan(rec, en);
      const cc = caps.convCapsState(en.convCaps, t);
      return {
        key: en.key, id: en.id, adapterId: en.adapterId, adapterLabel: rec.label || rec.id, title: en.title, kind: en.kind,
        participants: en.participants, lastAt: en.lastAt, lastText: en.lastText || '', unread: en.unread || 0, tracked: !!en.tracked,
        convCaps: cc,
        offers: {
          read: caps.offers(c, en.convCaps, 'read', t),
          sendAsUser: caps.offers(c, en.convCaps, 'send-as-user', t),
          sendAsBot: caps.offers(c, en.convCaps, 'send-as-bot', t),
        },
        identityWarning: caps.identityWarning(c),
        // STRUCTURE — the client says the words. `enabled` and `en.tracked`
        // are the claim's inputs (r3): a row nothing will fetch says so.
        freshness: caps.freshnessClaim(c, lane, en, t, { enabled: rec.enabled !== false }),
        lane: { via: lane.via, why: lane.why, source: lane.source || null },
        // P2 (design §7): the assignment as it READS (authority clamped by
        // the two caps, with the reason), its filter, the after-the-fact
        // measurement beside the estimate, the two caps the editor gates
        // `authority:'send'` on, and the HONEST per-lane wake latency —
        // structure again; the editor says the words.
        assignment: assignmentView(rec, en, t),
        filter: (en.filterId && filterFor(en.filterId)) || null,
        stats: statsView(en, t),
        authorityCaps: authorityCapsFor(rec, en, t),
        wakeLatency: wakeLatencyFor(rec, en, lane, t),
        // P3 (design §8/§9): the sending policy as it READS (own > adapter
        // default > review), the reach rows WITH their origin, the open
        // access requests, and this conversation's outbox counts — structure.
        policy: policyFor(rec, en),
        reach: reachView(en),
        outbox: outboxCountsFor(en.key),
      };
    }).filter(Boolean);
    conversations.sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
    return {
      adapters, available, conversations,
      unreadTotal: conversations.reduce((n, c) => n + (c.tracked ? c.unread : 0), 0),
      awaitingTotal: conversations.reduce((n, c) => n + ((c.outbox && c.outbox.awaiting) || 0), 0),
      // r3: a store file set aside (or BLOCKED) at boot, on the FIRST SCREEN —
      // the For-you item alone left a real instance's vanished accounts
      // unexplained in the panel
      quarantined: (store.quarantined || []).map(({ file, to, why, at, blocked }) => ({ file, to: to || null, why, at, blocked: !!blocked })),
      at: t,
    };
  }
  /** This conversation's outbox counts (the digest half; the list is the
   *  outbox broadcast's). */
  function outboxCountsFor(key) {
    const list = proposalsFor(key);
    return { awaiting: list.filter((p) => p.state === 'awaiting-approval').length, unknown: list.filter((p) => p.state === 'unknown').length, latestAt: list.length ? list[0].updatedAt || list[0].at : null };
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
      auth: { ...auth, self: !!rec.builtin, user: rec.builtin ? null : ((st && st.user) || (rec.auth && rec.auth.user) || null), scopes: (rec.auth && rec.auth.scopes) || [], credentialSource: (st && st.credentialSource) || null, credentialKey: (st && st.credentialKey) || rec.credentialKey || null, tokenHeld: !!(rec.auth && rec.auth.tokenEnc) },
      lastPass: rec.lastPass || null, consecutiveFailures: rec.consecutiveFailures || 0,
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
      credential: mod ? credentialFacts(mod.integration, rec.credentialKey || null) : null,
      credentials: mod ? offeredCredentials(mod.integration) : [],
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
      // P4: the §21-item-3 proof (a real send's observed sender_type) and the
      // per-channel honesty switch as the panel draws them.
      identityObserved: rec.identityObserved ? { ...rec.identityObserved } : null,
      senderHonestyLine: c.sendAs.length ? { record: rec.senderHonestyLine === true ? true : rec.senderHonestyLine === false ? false : null, effective: honestyLineFor(rec) } : null,
      options: { ...(rec.options || {}) },
      optionsSchema: (mod && mod.OPTIONS ? mod.OPTIONS : []).map((o) => ({ key: o.key, label: o.label, help: o.help || '', default: o.default === undefined ? '' : o.default, placeholder: o.placeholder || '', choices: Array.isArray(o.choices) ? o.choices.slice() : null })),
    };
  }

  /** ONE broadcast per pass, carrying the recomputed RESULT — never one per
   *  message, and never a bare "something changed" (the cache-invalidation
   *  law: one dirty signal, one computation). */
  function notify(changedIds = []) {
    try { broadcast({ type: 'channels-updated', changed: changedIds, digest: digest() }); } catch (err) { console.warn('[channels] broadcast failed:', err && err.message); }
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
   * batch. Content rides only when the resolver says `carryContent` and the
   * conversation is TRACKED (§5 invariant 6) — otherwise the event is a
   * cursor KICK, which is what a demoted lane's events become.
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
      const en = store.index.snapshot().conversations[`${rec.id}/${convId}`];
      if (!en || !en.tracked) { p.droppedUntracked = (p.droppedUntracked || 0) + 1; return { ok: true, persisted: false, why: 'untracked' }; }
      if (lane.carryContent) {
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
    kick(rec, e);
    return { ok: true, persisted: false, kicked: true };
  }
  /** After the ack: the index (unread / lastAt / the push observation) and
   *  ONE broadcast per batch — never per message. */
  function afterPush(rec, e, convId, w) {
    if (!e.pushBatch) e.pushBatch = new Map();
    const b = e.pushBatch.get(convId) || { appended: 0, lastAt: null, lastText: null, lastTextAt: -Infinity };
    b.appended += w.appended;
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
        en.unread = store.countSince(rec.id, convId, en.readAt || 0);
        en.lane = { ...(en.lane || {}), via: 'push', lastPushAt: now(), firstSeenTotal: ((en.lane && en.lane.firstSeenTotal) || 0) + b.appended };
        changed.push(convId);
      }
    });
    for (const convId of changed) { try { store.trim(rec.id, convId); } catch (err) { console.warn('[channels] trim failed:', err && err.message); } }
    if (!stopped) notify(changed);
  }
  /** A cursor kick: wake the SLEEP, not just a fetch — one kick-origin pass
   *  at most every KICK_MIN_INTERVAL_MS per adapter (a burst is one pass),
   *  respecting the adapter's own backoff. */
  function kick(rec, e) {
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
      contentSince: p.contentSince || null, droppedUntracked: p.droppedUntracked || 0,
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

  async function setTracked(adapterId, convId, tracked) {
    if (!known(adapterId, convId)) return false;
    let found = false;
    await store.index.update(() => {
      const en = store.index.entry(adapterId, convId, { create: false });
      if (!en) return;
      en.tracked = !!tracked;
      found = true;
    });
    if (!found) return false;
    if (tracked) {
      // Refresh THIS conversation's capabilities: marking it tracked is one of
      // `convCaps`'s three named refresh triggers (§4/r4).
      try { await refreshConvCaps(adapterId, convId); } catch (err) { console.warn('[channels] convCaps refresh failed:', err && err.message); }
    }
    // THE PERSISTED CHANGE BROADCASTS NOW, ON BOTH BRANCHES (r3). The
    // tracked=true path used to leave its only notification to the pass it
    // kicked — and a pass the request budget could not afford returned before
    // `notify()`, so the flag was on disk, the route had answered `{ok:true}`
    // and NO client learned, including the one that clicked (the panel
    // repaints only on the broadcast). Measured: 26 of 30 tracks silent under
    // the 20/min budget. A broadcast may not depend on whether a pass was
    // affordable; the pass adds its own when it ingests something.
    notify([convId]);
    if (tracked) pass(adapterId, { force: true }).catch(() => {});
    return found;
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
    const card = mod && mod.integration ? `⚙ → Integrations → ${mod.integration}` : null;
    switch (code) {
      case 'auth-expired': return `Re-authorize ${rec.label || rec.id} from the Channels panel (rail → Channels → ${rec.label || rec.id} → Re-authorize).${card ? ` If the application credential was withdrawn, restore it at ${card} first.` : ''}`;
      case 'rate-limited': return 'The vendor is rate-limiting this instance; the loop backs off by itself (30s → 15min). Nothing to do unless it persists.';
      case 'forbidden': return 'The vendor refuses this account access to what is tracked. Check the app\'s granted scopes and the account\'s membership in the tracked conversations.';
      case 'transport': return 'The vendor could not be reached from this machine. Check egress / DNS; the loop retries with backoff.';
      default: return 'See the adapter row in the Channels panel; the loop retries with backoff.';
    }
  }
  async function speakFailure(rec, code, err) {
    if (!userTodos || typeof userTodos.add !== 'function') return;
    const text = `Channel ${rec.label || rec.id}: ${FAILURES_BEFORE_LOUD} consecutive failed passes (${code})`;
    const vendorWords = String((err && err.message) || err || '').slice(0, 600);
    try {
      const item = userTodos.add(INBOX_KEY, {
        text,
        detail: `Adapter: ${rec.label || rec.id} (${rec.kind})\nFailure: ${code}\nVendor said: ${vendorWords}\n\nWhat to do: ${remedyFor(rec, code)}\n\nThis item is retracted automatically by the channels engine when a pass succeeds again.`,
        urgency: code === 'auth-expired' ? 'high' : 'normal',
        by: 'agent', sessionName: 'Channels',
        // the headline as structure; the detail keeps the vendor's verbatim and the remedy
        i18n: { text: { key: i18nKey('Channel {label}: {n} consecutive failed passes ({code})'), params: { label: rec.label || rec.id, n: FAILURES_BEFORE_LOUD, code } }, source: INBOX_SOURCE },
      });
      if (item && item.id) await store.adapters.update(() => { rec.failureItem = { id: item.id, text, code, at: now() }; });
    } catch (e) { log.warn(`[channels] ${rec.id}: could not file the failure in the inbox: ${(e && e.message) || e}`); }
  }
  /** The retraction: ONLY the item this engine filed (same id, same text),
   *  only while it is still open — the user's own resolution stands. */
  async function retractFailure(rec) {
    if (!rec.failureItem) return;
    const fi = rec.failureItem;
    await store.adapters.update(() => { rec.failureItem = null; });
    if (!userTodos || typeof userTodos.get !== 'function') return;
    try {
      const it = userTodos.get(fi.id);
      if (it && it.status === 'open' && it.sessionKey === INBOX_KEY && it.text === fi.text) {
        userTodos.setStatus(fi.id, 'done', RESOLVED_BY);
        log.log(`[channels] ${rec.id}: recovered — retracted the inbox item (${fi.code})`);
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
  /** CONNECT (2026-09-22, the account model): mints a NEW account of a kind
   *  — always when `newAccount` is asked, and when no record of the kind
   *  exists yet — stamped with the wizard's `credentialKey` (validated
   *  against what the integration OFFERS right now, refused by name
   *  otherwise; omitted = the row's own pick), then begins its consent
   *  flow. Without `newAccount` on a kind that already has an account it is
   *  the P1a per-kind path: the FIRST account is re-authorized (its id is
   *  the kind). The adapter refuses with a typed `auth-expired
   *  {needsCredentials}` when THAT key resolves to none — the wizard opens
   *  the Integrations card first (§10.1). */
  async function connect(kind, { credentialKey = null, newAccount = false } = {}) {
    const mod = connectableFor(kind);
    const recs = adapterRecords();
    const existing = recs.adapters.filter((r) => r.kind === kind);
    if (!newAccount && existing.length) return reauthorize((existing.find((r) => r.id === kind) || existing[0]).id, { credentialKey });   // the key is judged THERE: a token-less first account re-binds, a bound one refuses by name
    // THE CREDENTIAL QUESTION IS ASKED BEFORE A RECORD EXISTS: a row nobody
    // can connect is never minted (the r2 ④ rule — "a route may not mint an
    // index row" — at this seam; measured on a fresh instance, a refused
    // connect used to leave a permanent adapter row behind, and the 404 the
    // PUT/disconnect routes promise answered 200 about it).
    let key = credentialKey == null || credentialKey === '' ? null : String(credentialKey);
    if (key) assertOffered(mod, key);
    else key = defaultCredentialKey(mod.integration);
    const cf = credentialFacts(mod.integration, key);
    if (cf.source === 'none' || (Array.isArray(cf.missing) && cf.missing.length)) {
      throw new ChannelError('auth-expired', `cannot start a ${mod.label || kind} consent flow: ${cf.why || 'no application credential is configured'}`, { retryable: false, detail: { needsCredentials: true, missing: cf.missing || [] } });
    }
    const rec = newRecord(mod, { id: mintAdapterId(kind, recs), credentialKey: key });
    const e = adapterFor(rec);
    let flow;
    try { flow = await e.adapter.auth.begin(); }
    catch (err) { live.delete(rec.id); throw err; }   // a refused begin on a fresh record leaves nothing behind
    await store.adapters.update((a) => { a.adapters.push(rec); });
    notify([]);
    return { adapter: adapterView(rec), flow: safeFlow(flow) };
  }
  /** RE-AUTHORIZE one ACCOUNT by its adapter id — never by kind (2026-09-22):
   *  re-enables a disabled record and begins its consent flow under ITS
   *  credential. A `credentialKey` (validated: `400 unknown-credential`)
   *  RE-BINDS a TOKEN-LESS record — never authenticated, or disconnected:
   *  nothing is minted under its key, so the stamp is only the pick the next
   *  consent mints under — and is REFUSED BY NAME (`400 credential-bound`)
   *  on a record that HOLDS a token bound to another credential (its stamp,
   *  else what the token itself names): dropping the key without a word was
   *  verifier r1's third finding, and a re-point of a held token is the
   *  silent swap the model forbids. A legacy record with no key is stamped
   *  by `credentialKeyEvidence` (the token's own client when offered, else
   *  the row's current pick). */
  async function reauthorize(adapterId, { credentialKey = null } = {}) {
    const rec = recordOrThrow(adapterId);
    const mod = connectableFor(rec.kind);
    const key = credentialKey == null || credentialKey === '' ? null : String(credentialKey);
    if (key) {
      assertOffered(mod, key);
      const held = !!(rec.auth && rec.auth.tokenEnc);
      const bound = held ? (rec.credentialKey || credentialKeyEvidence(rec, mod).boundKey) : null;
      if (bound && key !== bound) {
        const err = new Error(`${rec.label || rec.id} (${rec.id}) is bound to '${bound}' by the token it holds — '${key}' cannot replace it; disconnect the account first (the token is dropped, its conversations stay) or add another account under '${key}'`);
        err.status = 400; err.code = 'credential-bound'; err.detail = { key, bound };
        throw err;
      }
      if (key !== rec.credentialKey) {
        await store.adapters.update(() => { rec.credentialKey = key; });
        // the live adapter was BUILT on the old key (`adapterDeps.credentialKey`
        // is handed down at construction) — drop it so `adapterFor` rebuilds
        // it under the new one, exactly as an options change does (measured:
        // the re-stamp alone left the consent URL carrying the old client)
        const e = live.get(rec.id); if (e) { disarmPush(e, 'credential re-bound'); live.delete(rec.id); }
      }
    } else if (!rec.credentialKey) {
      const ev = credentialKeyEvidence(rec, mod);
      if (ev.key) await store.adapters.update(() => { rec.credentialKey = ev.key; });
    }
    if (rec.enabled === false) await store.adapters.update(() => { rec.enabled = true; });
    const e = adapterFor(rec);
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
   *  landed on; the adapter's own `auth.finish` runs the state check. */
  async function finishAuth(adapterId, url) {
    const rec = recordOrThrow(adapterId);
    const running = flows.runningFor(rec.id);
    if (!running) throw new ChannelError('not-supported', `no consent flow is running for ${rec.label || rec.id} — start one with Connect`, { retryable: false, detail: { code: 'no-flow' } });
    const e = adapterFor(rec);
    const r = await e.adapter.auth.finish(running.flowId, url);
    return { ok: !!r.ok, error: r.error || null };
  }
  async function cancelAuth(adapterId) {
    const rec = recordOrThrow(adapterId);
    const running = flows.runningFor(rec.id);
    const cancelled = running ? flows.cancel(running.flowId, 'cancelled') : false;
    notify([]);
    return { ok: true, cancelled };
  }
  /** The adapter reports the flow's end (the loopback's `onDone`, through
   *  the adapter): a success re-asks auth and kicks a pass; a failure is
   *  SAID on the record (`lastAuthError`) — never swallowed. */
  async function onAuthDone(adapterId, r) {
    const rec = adapterRecords().adapters.find((x) => x.id === adapterId);
    if (!rec) return;
    await store.adapters.update(() => { rec.lastAuthError = r && r.ok ? null : String((r && r.error) || 'the consent flow failed'); rec.lastAuthAt = now(); });
    const e = adapterFor(rec);
    await refreshAuth(e);
    if (r && r.ok) { e.failures = 0; e.nextAt = 0; }
    if (r && r.ok) log.log(`[channels] ${rec.id}: connected${rec.auth && rec.auth.user ? ` as ${rec.auth.user}` : ''}`);
    else log.warn(`[channels] ${rec.id}: consent flow failed: ${(r && r.error) || 'unknown'}`);
    if (!stopped) notify([]);
    if (r && r.ok && !stopped) pass(rec.id, { force: true }).catch((err) => log.warn('[channels] pass after connect failed:', err && err.message));
    if (r && r.ok && !stopped && timer) syncPushLanes().catch(() => {});   // a fresh consent may be what the lane was waiting for
  }
  /** Drop the token (the FIRST account's record and its conversations stay —
   *  a later Connect resumes them); any running flow is cancelled. A FURTHER
   *  account (`<kind>:<hex>`, 2026-09-22) is removed outright with its
   *  index rows — only its own; the first account and its conversations are
   *  untouched (its message logs stay on disk: archive-never-destroy). */
  async function disconnect(adapterId) {
    const rec = recordOrThrow(adapterId);
    const running = flows.runningFor(rec.id);
    if (running) flows.cancel(running.flowId, 'cancelled');
    { const e = live.get(rec.id); if (e) disarmPush(e, 'disconnected'); }   // a lane cannot outlive its credential
    await tokensFor(rec).clear();
    await store.adapters.update(() => { rec.lastAuthError = null; rec.state = {}; rec.lastPass = null; rec.consecutiveFailures = 0; });
    await retractFailure(rec);
    if (rec.id !== rec.kind && !rec.builtin) {
      await removeRecord(rec);
      notify([]);
      return { ok: true, removed: true };
    }
    const e = live.get(rec.id);
    if (e) { e.failures = 0; e.nextAt = 0; await refreshAuth(e); }
    notify([]);
    return { ok: true };
  }
  /** Remove ONE further account: its live entry, its pending wake windows,
   *  its index rows and its adapter record — through the two serialized
   *  doors, nothing else's. */
  async function removeRecord(rec) {
    { const e = live.get(rec.id); if (e) { disarmPush(e, 'removed'); live.delete(rec.id); } }
    for (const [key, w] of [...wakeTimers.entries()]) if (key.startsWith(rec.id + '/')) { clearTimeout(w.timer); wakeTimers.delete(key); }
    await store.index.update((ix) => { for (const k of Object.keys(ix.conversations)) if (ix.conversations[k] && ix.conversations[k].adapterId === rec.id) delete ix.conversations[k]; });
    await store.adapters.update((a) => { const i = a.adapters.indexOf(rec); if (i >= 0) a.adapters.splice(i, 1); });
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
    if (!enabled) { const e = live.get(rec.id); if (e) disarmPush(e, 'adapter disabled'); }
    else if (timer) syncPushLanes().catch(() => {});
    notify([]);
    return { ok: true, enabled: !!enabled };
  }
  /** THE PER-CHANNEL HONESTY SWITCH (§9.5, P4): true / false / null (= follow
   *  the instance setting). An audit line records the change; the outbox
   *  repaints because every pending card's "a sender line will be appended"
   *  note follows the switch. */
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
    if (rebuild) { const e = live.get(rec.id); if (e) { disarmPush(e, 'options changed'); live.delete(rec.id); } }
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
  /** The assignment AS IT READS: `authority` clamped by both caps, with the
   *  reason, the stored bytes untouched (§7.3 (a)). */
  function assignmentView(rec, en, t) {
    const a = en && en.assignment;
    if (!a) return null;
    const eff = F.effectiveAuthority(a, authorityCapsFor(rec, en, t));
    return { ...a, authority: eff.authority, authorityStored: a.authority, authorityClamped: eff.clamped, authorityWhy: eff.why, authorityWhyCap: eff.whyCap || null };
  }
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
      pending: (Array.isArray(en && en.pending) ? en.pending.length : 0) + (Number(en && en.pendingElided) || 0),
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
    if (lane.pollCadence === 'reconcile') return { lane: 'reconcile', seconds: RECONCILE_SECONDS, coalesceSeconds: 0, why: null };
    const pi = c.pollInterval || {};
    return { lane: 'poll', seconds: Number(pi.hot) || 30, coalesceSeconds: 0, kick: lane.via === 'push', why: null };
  }

  /** THE FUNNEL ENTRY. `fresh` are the records that just became durable. */
  async function onFresh(rec, convId, fresh, { lane, origin } = {}) {
    if (stopped || !Array.isArray(fresh) || !fresh.length) return;
    const t = now();
    const snap = store.index.snapshot();
    const en = snap.conversations[`${rec.id}/${convId}`];
    if (!en) return;
    // The two LEDGERS below are DERIVED counts (§5 invariant 7: cached for
    // the panel, always re-derivable) — a failed write costs one stale
    // number and is SAID; it must never cost the wake that follows, which is
    // the one thing on this path that cannot be re-derived.
    const ledger = async (what, fn) => { try { await store.index.update(fn); } catch (err) { log.warn(`[channels] ${rec.id}/${convId}: ${what} ledger failed: ${(err && err.message) || err}`); } };
    // msgs7d — the estimate's denominator measured after the fact (§7.2)
    await ledger('msgs', () => { const e2 = store.index.entry(rec.id, convId, { create: false }); if (!e2) return; healP2(e2); e2.stats.msgs.push({ at: t, n: fresh.length }); e2.stats.msgs = F.pruneLedger(e2.stats.msgs, t); e2.stats.msgs7d = F.countSince(e2.stats.msgs, t, 7); });
    const a = en.assignment;
    if (!a) return;
    const filter = a.mode === 'filtered' ? filterFor(a.filterId) : null;
    if (a.mode === 'filtered' && !filter) { log.warn(`[channels] ${rec.id}/${convId}: assignment names filter ${a.filterId} which does not exist — no wake (fail closed)`); return; }
    const hits = [];
    for (const r of fresh) {
      if (a.mode === 'all') { hits.push({ record: r, why: [] }); continue; }
      const m = F.matchRecord(filter, r, {});
      if (m.hit) hits.push({ record: r, why: m.why });
    }
    if (!hits.length) return;
    await ledger('hits', () => { const e2 = store.index.entry(rec.id, convId, { create: false }); if (!e2) return; healP2(e2); e2.stats.hits.push({ at: t, n: hits.length }); e2.stats.hits = F.pruneLedger(e2.stats.hits, t); e2.stats.hits7d = F.countSince(e2.stats.hits, t, 7); });
    if (a.notify === 'digest') return queueForWindow(rec, convId, hits, { kind: 'digest', ms: a.digestMinutes * 60e3 });
    // FENCE 12: the window opens ONLY while push carries content — a poll or
    // scan pass is already a batch (r4/r6), and a kick-mode push lane's
    // records arrive by poll. Gated on the RESOLVED lane, never `caps.receive`.
    const cs = coalesceSeconds();
    if (lane && lane.via === 'push' && lane.carryContent && cs > 0) return queueForWindow(rec, convId, hits, { kind: 'coalesce', ms: cs * 1000 });
    return wake(rec, convId, hits, { origin });
  }

  /** Persist hits as PENDING (bounded, elided counted) and arm ONE timer
   *  per conversation for the window; a second burst inside the window
   *  joins it. The hits are on disk before the timer exists. */
  async function queueForWindow(rec, convId, hits, { kind, ms }) {
    await keepPending(rec, convId, hits);
    const key = `${rec.id}/${convId}`;
    if (wakeTimers.has(key) || stopped) return;
    const startedAt = now();
    const timer = setTimeout(() => {
      wakeTimers.delete(key);
      track(flushPending(rec, convId, { kind, startedAt }));
    }, Math.max(0, ms));
    if (timer.unref) timer.unref();
    wakeTimers.set(key, { timer, kind, startedAt });
  }
  async function keepPending(rec, convId, hits, elided = 0) {
    await store.index.update(() => {
      const e2 = store.index.entry(rec.id, convId, { create: false });
      if (!e2) return;
      healP2(e2);
      for (const h of hits) e2.pending.push({ record: h.record, why: h.why || [], at: now() });
      e2.pendingElided += Number(elided) || 0;
      if (e2.pending.length > PENDING_CAP) { e2.pendingElided += e2.pending.length - PENDING_CAP; e2.pending.splice(0, e2.pending.length - PENDING_CAP); }
    });
  }
  /** Deliver everything pending on one conversation as ONE wake (a digest
   *  block for a digest window or a boot leftover; a wake block that says
   *  "N in this window" for a coalesced burst). */
  async function flushPending(rec, convId, { kind = 'coalesce', startedAt = null } = {}) {
    if (stopped) return { ok: false, why: 'stopped' };
    // the read of `pending` happens INSIDE the conversation's serial section
    // (see serialWake): a flush queued behind a direct wake sees what that
    // wake left, never what it was about to carry
    return serialWake(`${rec.id}/${convId}`, async () => {
      const en = store.index.snapshot().conversations[`${rec.id}/${convId}`];
      if (!en || !Array.isArray(en.pending) || !en.pending.length) return { ok: false, why: 'nothing-pending' };
      const hits = en.pending.map((p) => ({ record: p.record, why: p.why || [] }));
      const elided = Number(en.pendingElided) || 0;
      const n = hits.length + elided;
      const seconds = startedAt ? (now() - startedAt) / 1000 : 0;
      return wakeNow(rec, convId, hits, {
        elided, fromPending: true,
        digest: kind === 'digest' || kind === 'boot',
        windowMinutes: kind === 'digest' ? ((en.assignment && en.assignment.digestMinutes) || F.DEFAULT_DIGEST_MINUTES) : Math.max(1, Math.round(seconds / 60)),
        coalesced: kind === 'coalesce' && n > 1 ? { n, seconds } : null,
      });
    });
  }
  /** Who is woken: the agent named, or the group's next live member (§7.3
   *  round-robin, the cursor in the index). A group with no live member is
   *  "keep for the next turn", NEVER "wake them all". */
  function resolveTarget(a) {
    let live = [];
    try { live = liveSessions() || []; } catch (err) { log.warn(`[channels] liveSessions threw: ${(err && err.message) || err}`); }
    if (a.principal.kind === 'agent') {
      const s = live.find((x) => x && x.cid === a.principal.id);
      return { cid: a.principal.id, name: (s && s.name) || a.principal.name || a.principal.id, via: 'agent', live: !!s, cursor: null };
    }
    const members = live.filter((x) => x && Array.isArray(x.groups) && x.groups.includes(a.principal.id)).map((x) => x.cid);
    const rot = store.index.snapshot().rotations || {};
    const pick = F.pickRoundRobin(members, Number(rot[a.principal.id]) || 0);
    if (!pick.id) return { cid: null, name: null, via: 'group', live: false, cursor: null, why: `no live session in group ${a.principal.name || a.principal.id} — kept for its next turn` };
    const s = live.find((x) => x.cid === pick.id);
    return { cid: pick.id, name: (s && s.name) || pick.id, via: 'group', live: true, cursor: pick.cursor };
  }

  // WAKES ON ONE CONVERSATION RUN ONE AT A TIME (2026-09-16, the P4 verifier):
  // after a restart the boot flush (5 s) and the first tick's pass (5 s) both
  // read `pending` before either had cleared it, so the same held hits went
  // out twice — two billed turns. The second wake now reads the index only
  // after the first has removed what it carried.
  const wakeChains = new Map();   // `${adapterId}/${convId}` → the tail of the wakes queued on it
  function serialWake(key, fn) {
    const prev = wakeChains.get(key) || Promise.resolve();
    const run = prev.then(() => fn(), () => fn());
    const tail = run.then(() => {}, () => {}).then(() => { if (wakeChains.get(key) === tail) wakeChains.delete(key); });
    wakeChains.set(key, tail);
    return run;
  }
  function wake(rec, convId, freshHits, opts = {}) { return serialWake(`${rec.id}/${convId}`, () => wakeNow(rec, convId, freshHits, opts)); }

  /**
   * THE WAKE — one delivery for one batch of hits. Says why (the rule strings
   * ride the block and the log), is paced by the assignment's daily cap,
   * goes through the ladder with `spendReason:'channel-message'` (the
   * authorizer inside it charges the slot it authorized), and stashes what
   * the ladder refuses. Records the attempt on the row's ledger either way.
   * Reached ONLY through `wake()` / `flushPending()` (the serial section).
   */
  async function wakeNow(rec, convId, freshHits, { origin = null, coalesced = null, elided = 0, digest = false, windowMinutes = null, fromPending = false } = {}) {
    const t = now();
    const en = store.index.snapshot().conversations[`${rec.id}/${convId}`];
    if (!en || !en.assignment) return { ok: false, why: 'unassigned' };
    const a = en.assignment;
    // HELD HITS RIDE THE NEXT WAKE. A batch the pacing cap or an empty group
    // held is PENDING on the index; a later direct wake carries it along
    // (oldest first), so a hold is a delay and never a drop. Only the NEW
    // hits are re-held on a refusal — the carried ones are already there.
    const carried = fromPending ? [] : (Array.isArray(en.pending) ? en.pending.map((p) => ({ record: p.record, why: p.why || [] })) : []);
    const carriedElided = fromPending ? 0 : (Number(en.pendingElided) || 0);
    const hits = [...carried, ...freshHits];
    const newElided = elided;
    elided = elided + carriedElided;
    // what THIS wake takes out of `pending` — and nothing else (a hit that goes
    // pending during the delivery, through a window's keepPending, is not ours)
    const heldIds = new Set((fromPending ? freshHits : carried).map((h) => h.record && h.record.id).filter(Boolean));
    const heldElided = fromPending ? newElided : carriedElided;
    const target = resolveTarget(a);
    if (!target.cid) {
      if (!fromPending) await keepPending(rec, convId, freshHits, newElided);
      await noteRefusal(rec, convId, target.why, t);
      log.log(`[channels] ${rec.id}/${convId}: ${hits.length + elided} hit(s) held — ${target.why}`);
      return { ok: false, why: target.why, held: true };
    }
    // PACING (layer one, §7.4) — a refusal here is a HOLD, never a drop.
    const pace = F.paceVerdict(en.stats && en.stats.wakes, t, a.dailyWakeCap);
    if (!pace.ok) {
      if (!fromPending) await keepPending(rec, convId, freshHits, newElided);
      await noteRefusal(rec, convId, pace.why, t);
      log.log(`[channels] ${rec.id}/${convId}: ${hits.length + elided} hit(s) held — ${pace.why}`);
      return { ok: false, why: pace.why, held: true };
    }
    const label = rec.label || rec.id;
    const title = en.title || convId;
    const whys = [...new Set(hits.flatMap((h) => h.why || []))];
    const text = digest
      ? F.renderDigestBlock({ adapterLabel: label, title, convId, hits, elided, windowMinutes: windowMinutes || a.digestMinutes })
      : F.renderWakeBlock({ adapterLabel: label, title, convId, hits, elided, coalesced });
    const fromName = `Channels · ${label}`;
    const n = hits.length + elided;
    const cardText = `${title}: ${n} message${n === 1 ? '' : 's'} — ${F.whyText(whys)}${coalesced && coalesced.n > 1 ? ` (${coalesced.n} in ${Math.round(coalesced.seconds)} s, one wake)` : ''}`;
    // a direct wake that carries a window's held hits IS that window's
    // delivery — its timer would otherwise fire into an empty (or worse, a
    // refilled) pending and the panel would show a window that is over
    if (!fromPending && heldIds.size) clearWakeTimer(`${rec.id}/${convId}`);
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
    if (!ok && deliver && typeof deliver.stashFor === 'function') {
      // The ladder's own durable stash: drained into the agent's next
      // context injection (renderMsgStash), so a refusal loses nothing.
      try { deliver.stashFor(target.cid, { source: 'channel', fromName, text }); stashed = true; } catch (err) { log.warn(`[channels] stash failed: ${(err && err.message) || err}`); }
    }
    await store.index.update((ix) => {
      const e2 = store.index.entry(rec.id, convId, { create: false });
      if (!e2) return;
      healP2(e2);
      e2.stats.wakes.push({ at: t, n, cid: target.cid, ok, lane: ok ? (r.lane || 'message') : (stashed ? 'stash' : 'none'), why: ok ? null : String((r && r.reason) || 'refused').slice(0, 200), refused: (r && r.refused) || null, whys: whys.slice(0, 8), digest: !!digest });
      e2.stats.wakes = F.pruneLedger(e2.stats.wakes, t);
      e2.stats.lastRefusal = null;
      // the pending hits this wake CARRIED were delivered (or durably
      // stashed) — clear those and only those; with no ladder wired at all
      // they stay pending until one is
      if (ok || stashed) {
        e2.pending = e2.pending.filter((p) => !(p.record && heldIds.has(p.record.id)));
        e2.pendingElided = Math.max(0, (Number(e2.pendingElided) || 0) - heldElided);
      }
      else if (!fromPending) { for (const h of freshHits) e2.pending.push({ record: h.record, why: h.why || [], at: t }); e2.pendingElided += Number(newElided) || 0; if (e2.pending.length > PENDING_CAP) { e2.pendingElided += e2.pending.length - PENDING_CAP; e2.pending.splice(0, e2.pending.length - PENDING_CAP); } }
      if (target.via === 'group' && target.cursor !== null) rotationsOf(ix)[a.principal.id] = target.cursor;
    });
    log.log(`[channels] wake ${rec.id}/${convId} → ${target.name || target.cid}: ${n} hit(s) (${F.whyText(whys)})${coalesced && coalesced.n > 1 ? `, ${coalesced.n} coalesced in ${Math.round(coalesced.seconds)} s` : ''}${digest ? ', digest' : ''} — ${ok ? `delivered via ${r.lane || 'message'}` : `${stashed ? 'stashed for the next turn' : 'held'}: ${(r && r.reason) || 'refused'}`}`);
    notify([convId]);
    return { ok, stashed, cid: target.cid, n, why: ok ? null : ((r && r.reason) || 'refused'), refused: (r && r.refused) || null };
  }
  async function noteRefusal(rec, convId, why, t) {
    await store.index.update(() => { const e2 = store.index.entry(rec.id, convId, { create: false }); if (!e2) return; healP2(e2); e2.stats.lastRefusal = { at: t, why: String(why || '').slice(0, 200) }; });
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
    return ACL.effective(ctx, { key: en.key, adapterId: en.adapterId }, en.reachEntries || []);
  }
  /** Does this assignment name the principal (itself or one of its groups)? */
  function assignmentNames(a, ctx) {
    if (!a || !a.principal || !ctx || ctx.kind !== 'agent') return false;
    if (a.principal.kind === 'agent') return a.principal.id === ctx.id;
    return Array.isArray(ctx.groups) && ctx.groups.includes(a.principal.id);
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
    if (!who.as && (who.why === 'unknown' || who.why === 'stale')) {
      // A proposal is a better refresh trigger than a render (§4's second
      // trigger, applied where the answer decides a real message): resolve
      // ONCE, then re-ask. A conversation nobody tracked has no cached caps.
      let fresh = null;
      try { fresh = await refreshConvCaps(adapterId, convId); } catch (err) { log.warn(`[channels] convCaps refresh at propose failed: ${(err && err.message) || err}`); }
      if (fresh) who = sendIdentityFor(rec, { ...en, convCaps: fresh }, now());
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
    else if (assignmentNames(en.assignment, ctx)) authority = F.effectiveAuthority(en.assignment, authorityCapsFor(rec, en, t)).authority;
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
    const { en, rec } = convFor(p0.adapterId, p0.convId);
    const t = now();
    let cc = null, ccErr = null;
    if (rec) { try { cc = await refreshConvCaps(p0.adapterId, p0.convId); } catch (err) { ccErr = (err && err.message) || String(err); } }
    const c = rec ? registry.capsOf(rec.kind) : null;
    const stillOffered = !!(rec && en && cc && c && caps.offers(c, cc, p0.sendAs === 'bot' ? 'send-as-bot' : 'send-as-user', t).offered);
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
      notifyOutbox([id]); notify([p1.convId]);
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
    notifyOutbox([id]); notify([p.convId]);
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
      try { r = await e.adapter.send(p.convId, { text: wire, replyTo: p.replyTo, idemKey: p.id, as: p.sendAs, onHandle }); }
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
      patch = (q) => { q.result = { vendorMessageId: r.vendorMessageId || null, at: r.at || t, sentAs: r.sentAs || q.sendAs, lane: r.lane || null, honestyLine: !!line, observed: r.observed || null, handle: r.handle || q.sendHandle || null }; q.reason = null; };
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
    notifyOutbox([id]); notify([p1.convId]);
    log.log(`[channels] outbox ${id} → ${p1.adapterId}/${p1.convId}: ${to}${p1.reason ? ` — ${p1.reason}` : ''}`);
    sendLeft.delete(id);
    return { ok: to === 'sent', state: to };
  }
  /** An unknown outcome owes the USER a look (§9.4), not the agent a verdict. */
  async function speakUnknown(p) {
    if (!userTodos || typeof userTodos.add !== 'function') return;
    try {
      const title = String(p.title || p.convId).slice(0, 120);
      const item = userTodos.add(INBOX_KEY, {
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
      answer = await e.adapter.reconcile(p.convId, { idemKey: p.id, sentAt: p.attemptAt || p.updatedAt || p.at, text: (p.wire && p.wire.text) || p.text, replyTo: p.replyTo, as: p.sendAs, handle: p.sendHandle || null });
    } catch (err) {
      answer = { unknown: true, reason: `reconcile threw: ${(err && err.message) || err}`, detail: { threw: true, code: (err && err.code) || null } };
    }
    const v = P.reconcileVerdict(answer);
    const stamp = (q) => { q.reconcile = { n, lastAt: t, lastBy: by, lastAnswer: v.answer, lastWhy: v.reason || null, detail: v.detail || null, resolvedAt: v.to ? t : null }; };
    if (!v.to) {
      await store.outbox.update((ob) => { const q = ob.proposals[id]; if (q) stamp(q); });
      const p1 = store.outbox.snapshot().proposals[id];
      auditOutbox(p1, 'reconcile-outcome', { answer: 'unknown', why: v.reason || null, n });
      notifyOutbox([id]); notify([p1.convId]);
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
    notifyOutbox([id]); notify([p1.convId]);
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
      notifyOutbox([p.id]); notify([p1.convId]);
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
    const { en, rec } = convFor(p.adapterId, p.convId);
    const wake = !!(en && en.assignment && en.assignment.receiptWake === true && assignmentNames(en.assignment, { kind: 'agent', id: cid, groups: [] }));
    const text = P.renderReceiptBlock(rc, { adapterLabel: rec ? (rec.label || rec.id) : p.adapterId, title: p.title, text: p.text });
    const fromName = 'Channels · Outbox';
    const cardText = `Receipt: proposal ${p.id} ${rc.status}${rc.reason ? ` — ${String(rc.reason).slice(0, 160)}` : ''}`;
    let r = null, stashed = false;
    if (!deliver || typeof deliver.deliverToConversation !== 'function') r = { ok: false, reason: 'no delivery ladder wired', refused: 'unwired' };
    else {
      try { r = await deliver.deliverToConversation(cid, text, { kind: 'notification', noWake: !wake, spendReason: 'channel-receipt', fromName, cardText }); }
      catch (err) { r = { ok: false, reason: `ladder threw: ${(err && err.message) || err}`, refused: 'error' }; }
      if (!(r && r.ok) && typeof deliver.stashFor === 'function') {
        try { deliver.stashFor(cid, { source: 'channel-receipt', fromName, text }); stashed = true; } catch (err) { log.warn(`[channels] receipt stash failed: ${(err && err.message) || err}`); }
      }
    }
    const delivery = { at: now(), ok: !!(r && r.ok), lane: r && r.ok ? (r.lane || 'message') : (stashed ? 'stash' : 'none'), stashed, refused: (r && r.refused) || null, woke: wake, why: r && r.ok ? null : String((r && r.reason) || 'refused').slice(0, 200) };
    await store.outbox.update((ob) => { if (ob.proposals[id]) ob.proposals[id].receiptDelivery = delivery; });
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
      notifyOutbox([p.id]); notify([p.convId]);
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
        const item = userTodos.add(INBOX_KEY, { text, detail, urgency: 'normal', by: 'agent', sessionName: 'Channels', i18n });
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
    return { entries: ACL.grantsFor(target, en.reachEntries || []), requests: (en.reachRequests || []).map((r) => ({ ...r })) };
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
      const mine = assignmentNames(en.assignment, ctx);
      out.push({
        key: en.key, adapterId: en.adapterId, adapter: rec.label || rec.id, id: en.id, title: en.title || en.id, kind: en.kind,
        level: reach.level, tracked: !!en.tracked, unread: en.unread || 0, lastAt: en.lastAt || null,
        canSend: !!who.as, sendWhy: who.why, sendAs: who.as, identityMarking: c.identityMarking,
        policy: policyFor(rec, en).mode, assigned: mine, authority: mine ? F.effectiveAuthority(en.assignment, authorityCapsFor(rec, en, t)).authority : null,
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
    if (since !== null && Number.isFinite(Number(since))) records = records.filter((r) => Number(r.at) > Number(since));
    return { ok: true, conversation: { key: en.key, adapterId, id: convId, title: en.title || convId, tracked: !!en.tracked }, records };
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
  /** ASSIGN (or `null` to unassign). Assignment IMPLIES REACH as an explicit
   *  grant with `origin:'assignment'` (§7.3 / §8): unassigning removes ONLY
   *  that row, never a grant the user wrote by hand. */
  async function setAssignment(adapterId, convId, input) {
    if (!known(adapterId, convId)) return { ok: false, code: 'not-found', error: 'No such conversation' };
    const rec = adapterRecords().adapters.find((r) => r.id === adapterId);
    const t = now();
    const key = `${adapterId}/${convId}`;
    if (input === null) {
      let had = false;
      await store.index.update(() => {
        const e2 = store.index.entry(adapterId, convId, { create: false });
        if (!e2) return;
        healP2(e2);
        had = !!e2.assignment;
        e2.assignment = null;
        e2.reachEntries = e2.reachEntries.filter((g) => !(g && g.origin === 'assignment'));
        e2.pending = []; e2.pendingElided = 0;
      });
      clearWakeTimer(key);
      if (had) { try { store.audit({ kind: 'acl', op: 'revoke', scope: { kind: 'conversation', id: key }, origin: 'assignment', at: t, by: 'user', why: 'unassigned' }); } catch {} }
      notify([convId]);
      return { ok: true, assignment: null };
    }
    const en = store.index.snapshot().conversations[key];
    const v = F.validateAssignment(input, authorityCapsFor(rec, en, t));
    if (!v.ok) return { ok: false, code: v.code || 'bad-assignment', error: v.error };
    if (v.assignment.mode === 'filtered' && !filterFor(v.assignment.filterId)) return { ok: false, code: 'no-such-filter', error: `filter ${v.assignment.filterId} does not exist — save the filter first` };
    const est = input && input.estimateAtSet && typeof input.estimateAtSet === 'object' ? { matchedPerDay: Number(input.estimateAtSet.matchedPerDay) || 0, totalPerDay: Number(input.estimateAtSet.totalPerDay) || 0, windowDays: Number(input.estimateAtSet.windowDays) || 7, sampled: !!input.estimateAtSet.sampled, truncated: !!input.estimateAtSet.truncated, at: t } : null;
    let stored = null;
    await store.index.update(() => {
      const e2 = store.index.entry(adapterId, convId, { create: false });
      if (!e2) return;
      healP2(e2);
      const prev = e2.assignment;
      const samePrincipal = prev && prev.principal && prev.principal.kind === v.assignment.principal.kind && prev.principal.id === v.assignment.principal.id;
      stored = { ...v.assignment, createdAt: samePrincipal ? prev.createdAt : t, updatedAt: t, createdBy: 'user', estimateAtSet: est || (samePrincipal ? prev.estimateAtSet : null) || null };
      e2.assignment = stored;
      // THE GRANT — one row per (principal, scope) with this origin; a user's
      // own grant on the same pair is a DIFFERENT row and is never touched.
      e2.reachEntries = e2.reachEntries.filter((g) => !(g && g.origin === 'assignment'));
      e2.reachEntries.push({ principal: { kind: stored.principal.kind, id: stored.principal.id }, scope: { kind: 'conversation', id: key }, level: 'visible', origin: 'assignment', at: t, by: 'user' });
    });
    try { store.audit({ kind: 'acl', op: 'grant', principal: stored.principal, scope: { kind: 'conversation', id: key }, level: 'visible', origin: 'assignment', at: t, by: 'user' }); } catch {}
    clearWakeTimer(key);
    notify([convId]);
    const en2 = store.index.snapshot().conversations[key];
    return { ok: true, assignment: assignmentView(rec, en2, t) };
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
      if (en.assignment && en.assignment.mode === 'filtered' && en.assignment.filterId === en.filterId) return { ok: false, code: 'filter-in-use', error: 'this filter is what the assignment wakes on — switch the assignment to all messages or unassign first' };
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
   *  delivered as ONE digest per conversation shortly after start. */
  function scheduleBootPending() {
    const snap = store.index.snapshot();
    for (const en of Object.values(snap.conversations)) {
      if (!en.assignment || !Array.isArray(en.pending) || !en.pending.length) continue;
      const rec = adapterRecords().adapters.find((r) => r.id === en.adapterId);
      if (!rec) continue;
      const key = en.key;
      if (wakeTimers.has(key)) continue;
      const timer = setTimeout(() => { wakeTimers.delete(key); track(flushPending(rec, en.id, { kind: 'boot' })); }, BOOT_PENDING_DELAY_MS);
      if (timer.unref) timer.unref();
      wakeTimers.set(key, { timer, kind: 'boot', startedAt: now() });
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
    for (const rec of adapterRecords().adapters) {
      if (rec.enabled === false) continue;
      const e = adapterFor(rec);
      if (e.passing || now() < e.nextAt) continue;
      const lane = laneOrScan(rec, {});
      const c = registry.capsOf(rec.kind);
      // The cadence comes from the RESOLVED lane, never from the declaration:
      // a demoted or dead push lane gets the fast cadence back immediately,
      // with nothing else in the tree deciding that a second time.
      // P2: an adapter with a HOT conversation (assigned — §6.2) polls at the
      // hot cadence, which is also the latency the AssignFilter editor
      // claims for a poll lane; the claim and the tick read the same number.
      const hot = Object.values(store.index.snapshot().conversations).some((x) => x.adapterId === rec.id && x.tracked && x.assignment);
      const pi = c.pollInterval || {};
      const secs = lane.pollCadence === 'reconcile' ? RECONCILE_SECONDS : hot ? (pi.hot || 30) : (pi.cold || 300);
      const due = (e.lastTickAt || 0) + secs * 1000;
      if (now() < due) continue;
      e.lastTickAt = now();
      pass(rec.id).catch((err) => console.warn('[channels] pass failed:', err && err.message));
    }
  }

  function start() {
    if (timer || stopped) return;
    timer = setInterval(tick, 5000);
    if (timer.unref) timer.unref();
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
    }
    if (!oauth) { try { flows.stopAll(); } catch {} }   // ours to stop; an injected machine is its owner's
    store.close();
  }

  return {
    store, registry, digest, notify, pass, setTracked, refreshConvCaps, markRead, messages,
    adapterRecords, laneOrScan, start, stop,
    connect, reauthorize, finishAuth, cancelAuth, disconnect, setEnabled, setOptions, adapterView,
    // 2026-09-22 the account model: the offered credentials (key + label) and the legacy stamp
    offeredCredentials, defaultCredentialKey, stampCredentialKeys,
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
    pendingWindows: () => [...wakeTimers.entries()].map(([key, w]) => ({ key, kind: w.kind, startedAt: w.startedAt })),
    REQUESTS_PER_MINUTE, RECONCILE_SECONDS, PAGE, MAX_PAGES, KICK_MIN_INTERVAL_MS, PUSH_NOTIFY_DEBOUNCE_MS, PENDING_CAP, ESTIMATE_CAP,
  };
}

module.exports = { create, REQUESTS_PER_MINUTE, RECONCILE_SECONDS, BACKOFF_MS, PAGE, MAX_PAGES, FAILURES_BEFORE_LOUD, REAL_ADAPTERS, KEY_FILE, INBOX_KEY, KICK_MIN_INTERVAL_MS, PUSH_NOTIFY_DEBOUNCE_MS, PUSH_EVENT_DEDUP_MAX, PENDING_CAP, ESTIMATE_CAP, COALESCE_DEFAULT_SECONDS, COALESCE_MAX_SECONDS, BOOT_PENDING_DELAY_MS };
