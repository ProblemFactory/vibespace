'use strict';
// USAGE + POOL ENGINE (decomposition #5 — the largest single extraction).
// Everything that DECIDES about quota and pooled billing on this instance:
// the model-fallback belt, pool auto-switch (pool-level + plan-C per-session),
// get_usage probe plumbing, the anchors sweep, offline-bias defenses, sealed
// orders push, rate-limit capture wiring, usage identity groups and the
// estimator instance. Extracted VERBATIM; late-created deps (accounts, hosts,
// usageHistory, recordUsageAttribution) arrive as lazy getters/lambdas —
// every use is at RUNTIME, after boot completes. ORCH tier.
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { mk } = require('./lazy.js');

function create({ app, rootDir, USAGE_CACHE_DIR, activeSessions, wss, WS_OPEN, getAutoResume = () => null, getQuotaProbe = () => null,
  broadcastToSession, serverNotice, serverSetting, harnessSetting: injectedHarnessSetting = null, harnessDeclares: injectedHarnessDeclares = null, getAccounts, getHosts,
  getUsageHistory, recordUsageAttribution, adapterRegistry, readUserState = () => ({}),
  // THE SPEND CEILING (design §4.4c / P9) is CONSTRUCTED here (`spendGuard`,
  // below) — the engine's own unattended spender, the codex reset credit, asks
  // that object directly. It deliberately takes NO authorizeSpend/noteSpend
  // deps: r2 found that server.js never passed them, so the gate on the reset
  // credit was dead code in production while a harness that DID pass them made
  // the suite green. A gate whose call site depends on a dep the one real
  // caller does not hand over is a gate nobody has.
  // the session-meta store (src/server/session-stdout.js), LAZY because it is
  // constructed after this engine in boot order. Its ONE use is persisting the
  // classifier-reroute stamp so a restored conversation still knows the CLI is
  // answering with a model we did not ask for (r3 §7).
  getSessionMetaStore = () => null,
  getUserTodos = () => null,
  // lane reset-path: how long a written reset-credit verb waits for its "sent" (src/reset-credit.js
  // RESET_CREDIT_ACK_MS, 90 s) — a SUITE shortens it to drive the never-sent settle without a sleep
  resetCreditAckMs = null,
  // lane reset-path: the helper's codex command — default the one src/codex-thread-read.js is configured
  // with (server.js / cli-env, re-resolved with the CLI); a SUITE hands a stub app-server here
  resetCreditHelper = null}) {
  // late-bound singletons: created after this module in boot order, used only
  // at runtime — the Proxy re-resolves per property access, never caches
  const accounts = mk(getAccounts);
  // conversation label for pool notices = the sidebar's name (custom rename in
  // user-state.json customNames), NOT the first-message name on the live
  // session object. readUserState() is cached in persistence, read per notice.
  const convName = (s2, sid) => { let cn = {}; try { cn = (readUserState() || {}).customNames || {}; } catch {} return conversationDisplayName(s2, cn, sid); };
  const hosts = mk(getHosts);
  const sessionMetaStore = mk(getSessionMetaStore); // PROPERTY-ACCESSED only (a mk() Proxy is truthy but never callable)
  const usageHistory = mk(getUsageHistory);
// ── Stop-on-model-fallback belt (2.228.0, claude.disableModelFallback) ──
// The PRIMARY mechanism is the CLI's native switchModelsOnFlag=false
// (spawn --settings + mid-session apply_flag_settings) — with it armed no
// fallback ever happens and this never fires. The belt covers sessions whose
// CLI predates the toggle (spawned before it was enabled, or restored from
// before a server restart): the moment a fallback signal appears on the
// stream, interrupt the turn (same recipe as the ws 'interrupt' case) and
// tell the user why. Once per turn (_fallbackStopFired, cleared on result).
// ── Pooled pseudo-account auto-switch (B-6217 v2) ───────────────────────────
// Runs at each claude turn end for sessions billed to a pool with auto=on.
// Decisions read ONLY the passive usage cache (§ban-safety — never an API
// call); see src/account-pool-auto.js for the semantics. hot=on → just
// re-point (the running CLI re-reads the credential file on its next request);
// hot=off → also ask ONE connected client to cold-restart the affected
// conversations (headless instances degrade to hot behavior until a client
// appears — the switch itself never waits on a browser).
const { decidePoolSwitch, decidePinnedPlacement, soonestUsableMember, rankPoolMembers, poolBlockedNotice, poolCreditsNotice, conversationDisplayName, bucketRemaining, warmCache, conversationInTurn, projectCacheAhead, projectionCrossing, PROJECTION_LEAD_SEC, SWITCH_THRESHOLD_PCT: POOL_HARD_PCT } = require('../account-pool-auto.js');
const arSignal = require('../auto-resume-signal.js'); // PURE: the limit LANE a snapshot is about + the fresh-window edge
const resetCredit = require('../reset-credit.js'); // PURE: is a stored reset credit worth spending at THIS wall, at THIS rung (design-reset-credits §4)
const codexResetHelper = require('../codex-reset-helper.js'); // lane reset-path: ONE bounded app-server child carries a PERSON's press when no conversation can
const { wrapperCaps } = require('./wrapper-files.js'); // the running wrapper's own advert (resetCreditKey: it sends the key AND reports the send)
const { agentEnv: sanitizedSpawnEnv } = require('../agent-env.js'); // the helper child gets the agent env, never raw process.env
const { feedPeerCard } = require('../normalizers'); // the rebuild-gated chat-card writer (the wall card that names the credits)
// THE ONE READER of `cache.overage` (design §1.4: it was written by
// rate-limit-capture and read by nobody). PURE; the spend authorizer and
// the two panels ask the same function.
const { overageState } = require('../spend-authorizer.js');
const { captureRateLimitEvent, resolveModelCapLane, lanesSnapshot } = require('../rate-limit-capture.js'); // was a FREE IDENTIFIER since extraction #5 — passive rate_limit_event capture silently dead for 3 days (5th lost binding; the try/catch swallowed the ReferenceError into a log line). The PARSE now reaches the engine through the claude harness's quota.signalFromStream (S4) — one classifier per harness.
// ── THE harness registry (S4, docs/design-harness-plugins.md §2.4): each
// harness declares its QuotaSignalSource = normalize / signalFromStream /
// probe rung / classifyAuthFailure. The engine asks the registry, never a
// backend id (the codex-shaped ternaries this replaced spawned `claude -p
// /usage` for codex identities and classified auth failures in Anthropic
// wording only).
const harnesses = require('../harnesses');
// THE TYPED HARNESS-SETTING READS (design-harness-settings §5): server.js
// injects its harness-config-sync instance; a caller that does not (a suite
// building the engine over a `serverSetting` stub) gets the SAME factory over
// the registry — one implementation, never a null that silently closes the
// reset-credit / fallback-stop paths.
const { harnessSetting, harnessDeclares } = (injectedHarnessSetting && injectedHarnessDeclares)
  ? { harnessSetting: injectedHarnessSetting, harnessDeclares: injectedHarnessDeclares }
  : require('./harness-config-sync').accessorsFor({ serverSetting, harnesses });
const _poolAutoLast = new Map(); // poolId → ts of last DECISION (eval gate)
const _poolSwitchAt = new Map(); // poolId → ts of last actual SWITCH (dwell belt)
// A 'spare-lane' move (B-8a65 S5) is pure convenience — the member it leaves can serve — so it waits
// an HOUR after the conversation's last move, not the belt's 3 min (design desk 2026-10-02, verify r1
// L3: the only spent member's 5h wobbling on its settle line bounced an idle conversation 15× in 2 h).
const SPARE_DWELL_MS = 60 * 60 * 1000;
// ── member auth-health (2.335.0, owner report: a banned/expired/out-of-credit
// account never triggered a switch — quota was the engine's ONLY signal, and a
// dead-auth account often still SHOWS rich quota). memberId → {at, reason}.
// Self-healing exit: TTL 10min, and a creds file NEWER than the mark (=
// somebody re-logged-in) clears immediately.
const _memberAuthFail = new Map();
const _authNoteAt = new Map(); // member:sid → last evict attempt (throttle)
const _authNoticeAt = new Map(); // memberId → last user notice (anti-spam)
const AUTH_FAIL_TTL_MS = 10 * 60e3;
// ── WALL = GROUND TRUTH (B-2c9b, owner-approved plan A+B 2026-09-05) ─────────
// Three production occurrences in one day: a walled turn's verdict read the
// POOL scope ("usable via <linked member>" off the linked member's healthy
// cache) while the banner had landed on the org the CLI was ACTUALLY on (193
// readings re-attributed away from the link); the pool moved 1.5-3 min later
// when a reading arrived, and in-flight subagents died in the gap. Now: a
// wall is ground truth for the account it lands on (readings only confirm).
// (The second half of that sentence — "the engine evaluates a session on the
// member it is OBSERVED to bill" — was REFUTED on 2026-09-07; see the block
// directly below, which is what governs every blocking decision now.)
// ── ATTRIBUTION BY LINK, OBSERVATION AS CORROBORATION (2026-09-07, owner
// decision ut-1c6c15a2db ①/④ after the 130-fire loop) ───────────────────────
// B-2c9b made the OTel-observed org OVERRIDE the link for blocking decisions.
// The owner's post-mortem corrected the premise: an `api_request` record's
// organization.id comes from the identity the CLI cached in its config dir at
// SPAWN, not from the token that authorized the request — so after a hot
// re-point the process reads the NEW credential file (that is what the
// mtime-bump exists for) while its telemetry keeps naming the OLD org.
// Consequence, reproduced in scripts/test-auto-resume-loop.mjs: every
// rejection landed on the observed org, the LINKED member's cache stayed
// "healthy" forever, the verdict kept answering "usable via <link>", the
// per-session pass "switched" to the member it was already on, and fireNow()
// continued a session that was rejected again half a second later — 130 times.
// So: a REJECTION is a fact about the credential SLOT the CLI reads (the
// link, validated), the observation is corroboration in the journal and in
// telemetry. Quota VALUES (utilization readings) keep the B-b3cd
// observed-org routing — a value describes whatever token produced it; only
// the identity of a WALL moved.
// ── THE OTel ORG IS A MACHINE-WIDE LABEL (lane-hot-switch, 2026-09-30) ───────
// Measured (scripts/fixtures/claude-cred-read-2.1.281.json): `organization.id`
// is ~/.claude.json's oauthAccount.organizationUuid, read at process start —
// the SAME value for every token a process holds, and rewritten machine-wide
// by whichever claude process last fetched its own profile (every 24 h). On
// this instance it named one member for ~99 % of every conversation's requests
// for four days while 47 of 47 fingerprinted rejections were answered by the
// member each link named. So the label is not read here at ALL any more: not
// as corroboration of a reading (the `corroborated` stamp and its journal
// line), not as a veto on whom the ⟳ asks or which readings may witness a
// window, not as a rung that lets a wall demote a member, not as the
// "observed on X while linked to Y" line. (The 2026-09-07 essays below keep
// their record of the refuted premise; their "corroboration" survivor is
// retired by this block.)
const WALL_RING_MS = 120e3;              // the ≥2-walls corroboration window for a wall we cannot tie to a slot
const WALL_RING_MAX = 16;
const SESSION_WALL_MS = 10 * 60e3;       // "this member rejected THIS session" — dead for its verdicts + switch targets
const _wallRing = new Map();             // account key → [{at, sid}] walled-turn timestamps (one entry per turn per key)
const _sessionWalls = new Map();         // webuiId → Map(memberId → ts): the members that walled THIS session
const _noTargetLogAt = new Map();        // webuiId → last "nowhere to go" per-session log (10min floor)
const _warmHoldLogAt = new Map();        // poolId:webuiId (per-session, with a ':soft' twin for the soft-exhaustion defer) | poolId:default (the pool default — its proactive warm-cache hold only; no soft twin since the default dropped its soft hold, design-reset-credits §8 ③) → last "warm cache, move deferred" log (10min floor); a per-session RE-POINT deletes that conversation's two keys (a new deferral episode speaks again — verifier LOW-3)
// ── get_usage control channel + chat-mode limit banner (B-7edc/B-292b) ──────
// The get_usage control request makes the CLI (first-party client) fetch usage
// itself — strictly better ToS posture than our bare /api/oauth/usage call.
// HUMAN-TRIGGERED ONLY (the ⟳ button): auto-firing was REJECTED (2026-08-09,
// user decision) — a machine-initiated quota check is the automated-access
// pattern that got a real account banned. The passive chat-mode signal is the
// LIMIT BANNER instead (markLimitBanner below): zero calls.
const { ClaudeCodeAdapter } = require('../adapters/claude-code.js');
// ── usage ANCHOR recorder (dead-reckoning data foundation, 2.261.0) ─────────
// Sweeps local usage-cache snapshots for NEW ground-truth readings (any
// source: statusline / ⟳ / get_usage / limit banner) and appends them, with
// the ledger cost consumed since the previous anchor, to
// data/usage-anchors/anchors-<identity>.ndjson. Identity key = orgUuid >
// email > account id, so a sub's history SURVIVES remove + re-add (user
// requirement — a re-add mints a fresh sub-<hex> id). Zero API calls.
const { UsageAnchors, identityKeyFor, costBetweenMulti } = require('../usage-anchors.js');
// ── THE SLOT-TRANSITION LEDGER (2026-09-07) ────────────────────────────────
// A symlink has no history, so anything that arrives LATE (a reading whose
// fetchedAt is minutes old, a ledger bake, a migration) could not ask "which
// member was this conversation on THEN" and fell back to the spawn-time org.
// Every re-point now appends {sessionId, from, to, at, why} here, so the past
// is a lookup. Bounded + archive-never-destroy: src/slot-transitions.js.
const { SlotTransitions } = require('../slot-transitions.js');
// THE credential-state readers, BOTH of them (src/login-state.js documents the
// split): `loginState` answers for a credential SLOT — the file a re-pointed
// symlink hands a running CLI — and `accountLoginState` answers for an ACCOUNT,
// which is the same file OR a long-lived token (B-211a) delivered as spawn env.
// They are two questions, so the two callers differ: slot validation asks the
// first, anything reasoning about whether an ACCOUNT can serve a request asks
// the second.
const { loginState, accountLoginState } = require('../login-state.js');
const { capsOf } = require('../backend-caps.js'); // per-backend switching capabilities (P4 slice) — replaces backend-id special cases
// Which QuotaSignalSource speaks for a backend. A FALSY backend is the
// legacy-record case (accounts._acctBackend / boot-restore's `m.backend ||
// 'claude'` — records written before the field existed ARE claude; same rule
// as capsOf); an UNKNOWN id is a loud failure that degrades to the NULL
// source (no reading, no signal, no probe — never parsed as claude, the
// gemini-as-claude class the harness design bans).
const _unknownHarnessWarned = new Set();
function quotaSourceFor(backend) {
  const id = backend || 'claude';
  try { return harnesses.get(id).quota; } catch (e) {
    if (!_unknownHarnessWarned.has(id)) { _unknownHarnessWarned.add(id); console.warn('[quota] ' + e.message); global.__vsEvent?.('quota-harness-unknown', id); }
    return harnesses.NULL_QUOTA;
  }
}
// THE MACHINE LOGIN'S USAGE KEY per harness (rv-harnesses H2, lane dc-pool-quota): the harness declaring
// creds.legacyGlobalKey keeps it ('__global__'); any other harness with credential mechanics is
// '__global_<id>__' (codex: '__global_codex__'); one without creds (shell, ACP) has no login of its own → '__global__'.
function credsOf(backend) { try { return harnesses.get(backend || 'claude').creds || null; } catch { return null; } }
function globalUsageKey(backend) {
  const c = backend && harnesses.has(backend) ? credsOf(backend) : null;
  return !c ? '__global__' : (c.legacyGlobalKey || '__global_' + backend + '__');
}
function globalKeyOwner(key) {
  const m = /^__global_([a-z][a-z0-9-]*)__$/.exec(String(key || ''));
  return m && harnesses.has(m[1]) && globalUsageKey(m[1]) === key ? m[1] : null;
}
// the `-p /usage` / control-channel get_usage rung is gated on the DECLARED probe (caps.quotaProbe), never an id
function cliUsageRung(backend) { return !!backend && harnesses.has(backend) && capsOf(backend).quotaProbe === 'cli-usage'; }
// The backend a usage-cache KEY belongs to: named accounts carry it;
// '__global_<id>__' is that harness's CLI login (globalKeyOwner); the asking session's own backend
// decides for identity-less keys ('__global__', host-*); else claude.
function quotaBackendFor(key, session) {
  const own = globalKeyOwner(key); if (own) return own;
  try { const a = key && accounts.get(key); if (a) return a.backend || 'claude'; } catch { }
  if (session?.backend) return session.backend;
  return 'claude';
}
const { quotaVerdict, THRESH: VERDICT_THRESH } = require('../account-pool-auto.js'); // THE account-usability verdict (2.369.0, owner-designed)
const { loginUsable, loginBucketLabel, loginAgeText, loginWallPhrase } = require('../login-expiry.js'); // PURE: is this member's LOGIN SESSION still alive (2026-09-07)
const { UsageEstimator, overlayCache: estOverlayCache, predictCalib, sweepAnchorGroup, CLAUDE_MAX_PRIOR_FULL_USD } = require('../usage-estimator.js');
const usageAnchors = new UsageAnchors({ dataDir: path.join(rootDir, 'data') });
// READ-ONLY view of the transition ledger. The single WRITER is accounts.js
// (every re-point goes through ensureSessionPoolLink / setPoolTarget — spawn,
// engine, manual route, signed-out self-heal, account removal), so no caller
// here can create a hole by forgetting to record one.
const slotTransitions = new SlotTransitions({ dataDir: path.join(rootDir, 'data') });
app.locals.slotTransitions = slotTransitions;
// ── WHOSE NUMBERS ARE THESE (inc-mts8a8mr-ulmm, 2026-09-08) ────────────────
// The slot rule of 2.369.68 is right and stays; what it could not know is that
// the link moves while requests are IN FLIGHT. The response itself names the
// WINDOW its numbers are counted in, and a weekly reset phase is an account
// fingerprint (measured: one stable phase per identity across this instance's
// whole 30-day corpus, all seven distinct). So the reading is asked which
// credentials produced it, and that answer outranks our bookkeeping.
// PURE rule + the statusline's verbatim mirror: src/reading-lag.js.
const readingLag = require('../reading-lag.js');
// THE ONE WRITE PATH (src/usage-cache-write.js): every usage-cache write in
// this file goes through it, so a reading merges into the file's typed
// `limits` PER limitId instead of replacing whatever the last producer left.
const usageWrite = require('../usage-cache-write.js');
const quotaModel = require('../quota-model.js');
const { familyOfScopedBucket } = require('../model-family.js');
const READING_ARCHIVE = path.join(rootDir, 'data', 'archive', 'readings-window-mismatch.ndjson');
// Which caches map to which identity (org-merge aware) — shared by the sweep
// and the estimator's per-account resolution. Reads roster + cache files only.
function usageIdentityGroups() {
  const groups = new Map(); // identityKey → {accountIds:[], cache, accountId}
  let files = [];
  try { files = fs.readdirSync(USAGE_CACHE_DIR).filter((f) => f.endsWith('.json') && !f.startsWith('__models__') && !f.startsWith('host-') && f !== 'rates.json'); } catch { return groups; }
  const roster = accounts.list().accounts || [];
  for (const fn of files) {
    try {
      // '__global_codex__' is a PSEUDO id like '__global__' (the machine's
      // ChatGPT login) — roster-less by design, never a "deleted account".
      const gOwner = globalKeyOwner(fn.slice(0, -5)); // a harness's own machine login ('__global_<id>__')
      const accountId = (fn === '__global__.json' || gOwner) ? null : fn.slice(0, -5);
      const cache = JSON.parse(fs.readFileSync(path.join(USAGE_CACHE_DIR, fn), 'utf-8'));
      if (!cache?.fetchedAt) continue;
      const acctRec = accountId ? roster.find((x) => x.id === accountId) : null;
      // A DELETED account's cache file is a zombie (nothing removes the file
      // with the record) and it kept poisoning org→account resolution: it
      // stays in the identity group, OTel's resolveOrg picked the dead id
      // (first named member) and booked LIVE spend to an account that no
      // longer exists (atype 'unknown', outside every quota view) — the
      // 2026-08-24 estimator investigation traced the org-29c4 implied-full
      // crash to exactly this (sub-a453 deleted, cache file from 07-16 still
      // resolving). A file with no roster record contributes NOTHING true.
      if (accountId && !acctRec) continue;
      if (accountId && acctRec && acctRec.type === 'pooled') continue; // pools have no quota of their own
      // codex identities join the groups since P1 (design-backend-parity.md §1)
      // — persisted cxs-*/__global_codex__ snapshots feed the SAME anchors →
      // estimator stack (their ledger cost is already backend-tagged). Every
      // codex key carries a 'codex:' prefix: identityKeyFor falls back to
      // EMAIL, and one person's ChatGPT + Anthropic logins sharing an email
      // must never merge into one identity (different quotas entirely).
      const ownBe = gOwner || (acctRec?.backend && globalUsageKey(acctRec.backend) !== '__global__' ? acctRec.backend : null);
      const key = gOwner ? gOwner + ':__global__'
        : (ownBe ? ownBe + ':' : '') + identityKeyFor({ accountId, cache, email: acctRec?.email });
      const g = groups.get(key) || { accountIds: [], cache: null, accountId: null, backend: ownBe || 'claude' };
      g.accountIds.push(gOwner ? fn.slice(0, -5) : (accountId || '__global__'));
      // freshest cache is the identity's anchor source (the same real login can
      // surface as BOTH __global__ and a named sub — one quota, two files)
      if (!g.cache || cache.fetchedAt > g.cache.fetchedAt) { g.cache = cache; g.accountId = accountId; }
      groups.set(key, g);
    } catch { }
  }
  return groups;
}
// Dead-reckoning estimator (B-fcff v2): learned per-identity per-bucket rates
// over the anchor pairs, seeded with the measured Max-20x priors. Feeds the
// pool auto-switch an ESTIMATED bucket view and /api/usage an `estimates`
// field. Zero API calls; ledger + anchor files only.
const _identGroupsMemo = { at: 0, groups: null };
function usageIdentityGroupsCached() {
  if (!_identGroupsMemo.groups || Date.now() - _identGroupsMemo.at > 30000) {
    _identGroupsMemo.groups = usageIdentityGroups(); _identGroupsMemo.at = Date.now();
  }
  return _identGroupsMemo.groups;
}
const usageEstimator = new UsageEstimator({
  anchorsDir: path.join(rootDir, 'data', 'usage-anchors'),
  usageHistory: () => usageHistory, // declared far below — lazy ref (TDZ)
  resolveIdentity: (accountId) => {
    const want = accountId || '__global__';
    for (const [identityKey, g] of usageIdentityGroupsCached()) {
      if (g.accountIds.includes(want)) return { identityKey };
    }
    return null;
  },
  // codex identities learn WITHOUT priors (the built-in default is the
  // measured claude Max-20x quota sizes — meaningless for ChatGPT plans);
  // the no-prior fallback needs ≥$1 cost + ≥0.5% observed movement before
  // it emits a rate, which is the honest cold-start for an unmeasured plan.
  priorsFor: (identityKey) => String(identityKey || '').startsWith('codex:') ? null : CLAUDE_MAX_PRIOR_FULL_USD,
});
app.locals.usageEstimator = usageEstimator;
// ── OFFLINE-BIAS defense (2.297.0, design §Cross-device aggregation) ──
// A source is ACTIVE-DARK when the ledger holds RECENT events from it but its
// link is down: its spend keeps accruing invisibly, which biases estimates in
// the DANGEROUS direction (under → late pool switches). 30s memo — this runs
// inside pool decisions and the anchor sweep.
let _darkMemo = { at: 0, list: [] };
function darkSources() {
  if (Date.now() - _darkMemo.at < 30000) return _darkMemo.list;
  const list = [];
  try {
    const wm = usageHistory.sourceWatermarks();
    const now = Date.now();
    for (const [src, ts] of Object.entries(wm)) {
      if (src === 'local') continue;
      if (now - ts > 48 * 3600 * 1000) continue; // idle for 2 days — not dangerous
      if (hosts.linkState(src) === 'offline') list.push({ host: src, lastEventTs: ts });
    }
  } catch { }
  _darkMemo = { at: Date.now(), list };
  return list;
}
// Which accounts a dark source taints: those with ledger events from that
// host in the last 7 days (per-account precision so an all-local pool never
// pays the pessimism tax for an unrelated machine's outage).
function darkTaintedAccounts() {
  const dark = darkSources();
  if (!dark.length) return {};
  const taint = {};
  try {
    const since = Date.now() - 7 * 24 * 3600 * 1000;
    const darkSet = new Set(dark.map((d) => d.host));
    for (const ev of usageHistory._events(since, Date.now())) {
      if (ev.host && darkSet.has(ev.host) && ev.acct && ev.atype !== 'host') taint[ev.acct] = DARK_PESSIMISM_PCT;
    }
  } catch { }
  return taint;
}
const DARK_PESSIMISM_PCT = 8; // dock: ~1 long turn of 5h headroom / real weekly $

// Disarm a pool's device-side reflex (pool deleted / auto turned off) —
// without this the daemon kept executing a stale snapshot forever, and could
// even recreate a deleted pool's symlink during a server-down window.
async function clearSealedOrders(poolId) {
  try {
    _sealedOrdersSent.delete(poolId);
    const dm = await hosts.device(null);
    await dm.poolOrders({ clearPool: poolId });
  } catch { }
}
const _sealedOrdersSent = new Map(); // poolId → last pushed JSON (skip no-ops)
let _poolOrdersWarned = false; // warn once per boot, never per tick
async function pushSealedOrders(poolId) {
  const a = accounts.get(poolId);
  if (!a || a.type !== 'pooled') return;
  const members = accounts.poolMembers(poolId);
  const ranked = rankPoolMembers({
    members,
    readCache: (id) => { try { return JSON.parse(fs.readFileSync(path.join(USAGE_CACHE_DIR, id + '.json'), 'utf-8')); } catch { return null; } },
    nowSec: Date.now() / 1000,
    // A sealed order is executed by the DEVICE, possibly hours after we push
    // it and while this server is unreachable — a login that dies in the
    // meantime would be an unreachable fallback. Members near/past their
    // login deadline never enter the snapshot.
    readLogin: poolReadLogin(),
    creditsIds: creditsMemberIds(members), // usage-credits members walk LAST (B-ad05)
    priority: poolPriorityOf(a), // the owner's manual order walks first (2026-09-28)
  }).map((m) => ({ id: m.id, dir: accounts.subDir(m.id), creds: accounts.subCredsPath(m.id) }));
  const orders = { poolId, linkPath: accounts.subDir(poolId), ranked, currentId: accounts.poolCurrent(poolId) || null,
    // Plan C: per-session links are additional MATCH+ACT targets — the daemon
    // re-points exactly the link the banner session spawned against. Old
    // daemons ignore this field and keep matching only the default link:
    // reduced coverage on skew, never a wrong re-point.
    linkPaths: (() => { try { return accounts.sessionPoolLinks(poolId).map((l) => l.path); } catch { return []; } })() };
  const j = JSON.stringify(orders);
  if (_sealedOrdersSent.get(poolId) === j) return;
  const dm = await hosts.device(null); // device #0 — pools are local-only
  // (the memo below is per-pool AND the daemon now stores per-pool slots, so a
  // second pool's push can no longer evict the first — review finding)
  await dm.poolOrders(orders, (events) => {
    // fallback switches executed while this server was down: surface them AND
    // RECORD THEM (2026-09-07 r2). The by-time attribution is only as honest
    // as the transition ledger, and a device-executed re-point that leaves no
    // row makes `slotAt()` answer with the last ORCHESTRATOR row — a
    // confident wrong answer about the exact window (server down) where late
    // attribution has nothing else to go on. accounts.js stays the single
    // writer; the event already carries every field it needs.
    for (const ev of events) {
      serverNotice('sealed-orders-' + ev.ts, `账号池 ${accounts.get(ev.poolId)?.name || ev.poolId} 在服务器离线期间因触限自动切换到 ${accounts.get(ev.to)?.name || ev.to}（sealed-orders 应急反射）`, { level: 'warn' });
      try { console.log('[sealed-orders] device-executed fallback switch:', JSON.stringify(ev)); } catch { }
      try { accounts.noteDeviceRepoint({ link: ev.link, poolId: ev.poolId, from: ev.from, to: ev.to, at: ev.ts, why: 'sealed-orders' }); } catch { }
    }
    try { dm.ackPoolOrdersLog(); } catch { }
  });
  _sealedOrdersSent.set(poolId, j);
}

function sweepUsageAnchors() {
  // GROUPED BY IDENTITY (2.263.0): recording per cache-file double-anchored
  // org-merged logins (__global__ + named sub interleaved in one identity
  // file, each record's costSince missing the sibling account's spend — real
  // data bug caught in the Member Q analysis). One identity = one
  // anchor stream; cost sums across ALL its account ids.
  // ONE STEP PER GROUP = usage-estimator's `sweepAnchorGroup` (B-a5c0): no new
  // reading ⇒ no ledger walk, no calibration, no metric; a new anchor ⇒ the
  // calib metric once per moved bucket, attributed {account, bucket}.
  for (const [identityKey, g] of usageIdentityGroups()) {
    try {
      sweepAnchorGroup({
        identityKey, group: g, anchors: usageAnchors, estimator: usageEstimator,
        costBetween: (ids, from, to) => costBetweenMulti(usageHistory, ids, from, to),
        darkHosts: (allIds) => { const t = darkTaintedAccounts(); return allIds.some((a) => t[a]) ? darkSources().map((d) => d.host) : []; },
        metric: (name, value, detail) => global.__vsMetric?.(name, value, detail),
      });
    } catch { }
  }
}
// boot-time sealed-orders push: a restarted server re-arms every pool's
// device-side fallback snapshot AND collects executions from its own down
// window (the report rides the pool-orders reply)
setTimeout(() => {
  // Only AUTO pools (review finding): the runtime refresh is gated on a.auto,
  // so arming a manual pool at boot let the device switch a pool the user
  // explicitly set to manual — with a snapshot frozen at boot forever.
  try {
    for (const a of (accounts.list().accounts || [])) {
      const full = accounts.get(a.id);
      if (full?.type === 'pooled' && full.auto) pushSealedOrders(a.id).catch(() => { });
    }
  } catch { }
}, 15000);
setInterval(() => { try { sweepUsageAnchors(); } catch {} }, 60000);
setTimeout(() => { try { sweepUsageAnchors(); } catch {} }, 20000);

// ── Plan C (B-a612, 2.315.0): per-session pool placement ────────────────────
// One pool, many links: each session bills the member its OWN symlink points
// at. The chooser and the per-session switch pass both read quota through the
// SAME estimator-overlaid readCache the pool engine uses, PROJECTED to the
// session's model family (src/model-family.js): scoped caps of models this
// session is not running stop vetoing its placement; 5h/7d always count
// (nested buckets); an unknown family means NO projection — today's
// conservative semantics, never a relaxation on ignorance.
const { familyOfModel, projectCacheForFamily } = require('../model-family.js');
function poolReadCache(poolId) {
  // the engine's readCache, extracted for reuse (identity-group freshest file
  // + estimator overlay); kept here so chooser/switch/engine cannot drift
  const now = Date.now();
  return (id) => {
    let raw = null;
    try { raw = JSON.parse(fs.readFileSync(path.join(USAGE_CACHE_DIR, id + '.json'), 'utf-8')); } catch { }
    try {
      for (const [, g] of usageIdentityGroupsCached()) {
        if (g.accountIds.includes(id) && g.cache && (g.cache.fetchedAt || 0) > (raw?.fetchedAt || 0)) { raw = g.cache; break; }
      }
    } catch { }
    try { return estOverlayCache(raw, usageEstimator.estimateFor(id, raw, now)); } catch { return raw; }
  };
}
// THE engine's login reader (2026-09-07). ONE memoized read per tick per
// member: loginStateOf hits the credential file, and a single pool decision
// asks about the same member several times. §ban-safety: file reads only —
// this whole feature never touches the network.
//
// IT ANSWERS FOR *BOTH* READERS (integration r2, reproduced). Two modules ask
// "is this login dead" from different angles and each sees a state the other
// misses:
//   · src/login-expiry.js (accounts.loginStateOf) — the refresh-token
//     DEADLINE. It calls a member with a live access token but a past
//     refreshTokenExpiresAt 'expired'; it says 'unknown' (= no claim) about a
//     file with no deadline at all.
//   · src/login-state.js (memberLoginState) — can a request be made RIGHT
//     NOW. It is the only one that catches "access token expired AND no
//     refresh token", which parseAuth still reports as loggedIn:true.
// The integration's first shape pre-FILTERED the second reader's verdict out
// of the candidate list before decidePoolSwitch ever saw it. That silently
// deleted the attribution master ships: `loginBlocked` (and therefore
// 'all-logins-expired' + "Re-login those accounts in Manage Agents") is built
// from the members the decision was SHOWN, so a member removed beforehand can
// never be named and the refusal degraded to a spent-quota sentence with the
// "wait for a window to reset" remedy — the exact defect 2.369.67 fixed.
// So the second verdict is FOLDED IN HERE, at the reader every gate already
// consults: identical exclusions (decidePoolSwitch's own login gate drops the
// member), restored naming (it drops it into loginBlocked on the way out).
// The hard pre-filter stays only where the list is ACTED on (healthyPoolMembers).
function poolReadLogin() {
  const memo = new Map();
  return (id) => {
    if (!memo.has(id)) {
      let st = null;
      try { st = accounts.loginStateOf(id); } catch { st = null; }
      // EITHER reader saying "unusable" is enough. Only ever a DOWNGRADE: a
      // file verdict never resurrects a login the deadline reader buried.
      try {
        const f = memberLoginState(id);
        if (f && !f.usable && loginUsable(st)) {
          const now = Date.now();
          st = {
            state: f.state === 'expired' ? 'expired' : 'logged-out',
            refreshExpiresAt: f.refreshExpiresAt ?? null,
            accessExpiresAt: f.expiresAt ?? null,
            // the file reader's `since` IS the instant it stopped working, so
            // msLeft stays a coherent (negative) number instead of the
            // deadline reader's stale "30 days left" under an 'expired' state
            msLeft: typeof f.since === 'number' ? f.since - now : (typeof f.refreshExpiresAt === 'number' ? f.refreshExpiresAt - now : null),
          };
        }
      } catch { }
      memo.set(id, st);
    }
    return memo.get(id);
  };
}
// ── THE SPEND CEILING, CONSTRUCTED (design-account-hardening §4.4c / P9) ────
// It lives here because every input it needs is already resolved in this
// module — the identity (`fireIdentityFor`, this file's own answer to "which
// credential slot would a turn started right now bill"), the RAW usage cache
// (overage), and the credential state the pool already reads. A second
// construction site would mean a second set of answers, which is exactly the
// failure §2 of the design catalogues. server.js re-exports it to the three
// consumers outside this module (auto-resume, the delivery ladder, the Stop
// nudge); the inbox is resolved lazily because it is created later in boot.
const spendGuard = require('./spend-guard.js').create({
  dataDir: path.join(rootDir, 'data'),
  serverSetting,
  identityOf: (session) => fireIdentityFor(session),
  readCacheFor: (key) => readRawUsageCache(key),
  // the ACCOUNT reader, not the slot one — an oat-only subscription serves
  // turns with no credential file at all (see accountCredentialState)
  credentialStateOf: (key) => accountCredentialState(key),
  getUserTodos,
  log: (...a) => console.log(...a),
});

// ── THE TWO VOLUNTARY-MOVE BARS (design-account-hardening D2 + D3c) ─────────
// Both are SETTINGS resolved per decision and handed to the PURE decision as
// inputs; neither changes what an ESCAPE from a hard-dead member may do.
//   reserveFloorPct  — EDF drains the soonest-deadline member, and the measured
//                      result was 60% → 95% of a weekly window in 12.4 hours.
//                      Below the floor a member is not a voluntary target.
//   avoidOverageMembers — while `cache.overage.inUse` is true the account bills
//                      pay-per-use, so `utilization` stays under 1 while every
//                      token costs money and EDF actively PREFERS it. Default
//                      OFF (D3 recommends one week of data first); the SPEND
//                      side of the same fact is always on (the authorizer).
function reserveFloorPct() {
  const n = Number(serverSetting('pool.reserveFloorPct'));
  return Number.isFinite(n) && n >= 0 ? Math.min(100, n) : 15;
}
/** The RAW usage cache for one key — no estimator overlay. The overage record
 *  is a fact a producer STATED; an estimate may not authorize an irreversible
 *  act (P7), and it may not bar one either. */
function readRawUsageCache(id) {
  try { return JSON.parse(fs.readFileSync(path.join(USAGE_CACHE_DIR, String(id).replace(/[^\w.-]/g, '_') + '.json'), 'utf-8')); }
  catch { return null; }
}
function overageMemberIds(members) {
  try {
    if (serverSetting('pool.avoidOverageMembers') !== true) return null;
    const out = new Set();
    for (const m of members || []) if (overageState(readRawUsageCache(m.id)).inUse === 'yes') out.add(m.id);
    return out.size ? out : null;
  } catch { return null; }
}
// USAGE CREDITS (B-ad05, ALWAYS on — it is a ranking, not a bar): members
// whose org has extra usage ENABLED and not in use (`overageState().mode ===
// 'allowed'`). Past 100 % such a member keeps serving on pay-per-use billing
// and nothing in the stream says so — this instance idled every conversation
// on one for 14 h while its 5h/Fable read 100 %, and the owner learned from
// the bill. The PURE decision ranks them below every member with quota left
// and uses one only as the last resort; the parking notice below says when.
function creditsMemberIds(members) {
  try {
    const out = new Set();
    for (const m of members || []) if (overageState(readRawUsageCache(m.id)).mode === 'allowed') out.add(m.id);
    return out.size ? out : null;
  } catch { return null; }
}
// ONE notice per (pool, member) per 6 h while a pool runs on usage credits —
// the same key discipline as every other pool notice (`_sentNotices` is a
// per-boot Set, so the key carries the 6 h bucket or a recurrence is never
// reported again).
function noteCreditsParking(poolId, memberId, sentence, now) {
  serverNotice(`pool-credits-${poolId}-${memberId}-${Math.floor(now / (6 * 3600e3))}`, sentence, { level: 'warn' });
}
function poolChooserForModel(poolId, { model, pin = null, hinted = false } = {}) {
  try {
    const a = accounts.get(poolId);
    if (!a || a.type !== 'pooled') return null;
    const fam = familyOfModel(model);
    const cur = accounts.poolCurrent(poolId);
    const base = poolReadCache(poolId);
    const readCache = (id) => projectCacheForFamily(base(id), fam); // (a null family projects nothing — every bucket counts)
    // THE CONVERSATION'S PIN (2026-09-28): a resumed pinned conversation starts on its pin when
    // the pin can serve (the owner's choice, explicit — no warm or settle bar at a spawn); a pin
    // that cannot serve starts it where the automatic rules would (the pin kept on the session)
    if (pin) {
      const pm = healthyPoolMembers(poolId);
      const dp = decidePinnedPlacement({ explicit: true, pin, currentId: cur, members: pm, readCache, nowSec: Date.now() / 1000, hot: true, readLogin: poolReadLogin(), membership: poolMembershipOf(poolId), priority: poolPriorityOf(a), reserveFloorPct: reserveFloorPct(), overageIds: overageMemberIds(pm), creditsIds: creditsMemberIds(pm) });
      if (dp && dp.reason === 'pin') return pin;
      if (dp && dp.to) return dp.to;
      return cur;
    }
    // (a default that names a member the pool NO LONGER LISTS — a boot before the first stale-link
    // sweep, a narrowing made while nobody else was signed in — is no place to START a conversation:
    // the membership fact reaches this verdict too, verify r1)
    const membership = poolMembershipOf(poolId);
    const staleDefault = !!cur && Array.isArray(membership) && membership.length > 0 && !membership.includes(cur);
    if (!fam && !staleDefault) return cur; // no identity → the pool's default target
    // decidePoolSwitch FROM the default target under the projected view: if
    // the default serves this family, stay (fewest distinct billing dirs);
    // if it doesn't, the switch verdict IS the placement. `placing` (B-8a65):
    // a member that can settle with LESS spare lane (a cap this model does not
    // draw) takes a new conversation off the default — a spawn is free. Never on a GUESSED family (`hinted`, verify
    // r1): a claude resume commands no model, the instance default stands in, and the CLI resumes on its own record —
    // a Fable conversation hinted as Opus would be placed on the member whose Fable is spent.
    const { decidePoolSwitch } = require('../account-pool-auto.js');
    const mem = healthyPoolMembers(poolId);
    const d = decidePoolSwitch({ currentId: cur, members: mem, readCache, nowSec: Date.now() / 1000, hot: true, placing: !hinted, readLogin: poolReadLogin(), membership, priority: poolPriorityOf(a), reserveFloorPct: reserveFloorPct(), overageIds: overageMemberIds(mem), creditsIds: creditsMemberIds(mem) });
    // (nobody can serve a conversation started here AND the default names a removed member — a boot before the
    // first sweep: the engine's fallback, a member the pool lists, verify r2)
    // …and 全B: the verdict's own parking member when nobody can serve (`holdTo`) — a new conversation meets that
    // member's wall; with nobody signed in at all the store refuses the placement by name
    return (d && d.to) || (staleDefault ? ((d && d.holdTo) || fallbackDefaultTarget(poolId, cur) || null) : cur);
  } catch (e) { console.warn('[pool] chooser failed (falling back to default target):', e.message); return null; }
}
// ── THE SESSION'S MODEL FACTS, one implementation for both stdout feeds ─────
// `noteServedModel` / `noteModelFallback` are granular consumer functions in
// the sense the session-brain contract means it (like markLimitBanner and
// recordRateLimitEvent): the PARSE (src/server/stdout/claude-stream-json.js)
// and the DEVICE feed (claudeSideEffects) both call them, so the fallback rule
// below cannot exist in one feed and not the other.

// THE REROUTE STAMP SURVIVES A RESTART (2026-09-13 r3, the round-2 verifier,
// reproduced on the real engine). The stamp was `persisted: null` on the
// argument that boot-restore's ladder falls back to picked/spawn = the REQUEST
// model — true of the LADDER, false of everything else. A restored conversation
// whose reroute was announced BEFORE the restart gets ONE main-thread opus
// record after boot; that record is newer than the pick and nothing on the
// session refutes it, so `servedDefinesModel` says yes, `sessionModelFor`
// answers opus, `projectionFamilyFor` answers 'opus', the pool moves the
// conversation onto a member whose Fable cap is 100 % spent and
// `quotaVerdictFor` calls that member usable — the incident verbatim, one
// restart later. The reroute is announced ONCE and `scope:"session"`, so it can
// never be re-learned from the stream; only the file can carry it.
//
// It is written through the two granular consumers — the ONE implementation the
// parse and the device feed share — never at their call sites, which is the
// twin the §1b census bans. `readSessionMeta`/`writeSessionMeta` arrive as a
// LAZY store (session-stdout is constructed after this engine in boot order),
// exactly like this file's other late singletons, and the write follows the
// ws-handler set-model idiom: spread what is on disk, re-list only what changed.
//
// A STALE RESTORED STAMP CANNOT SPEND MONEY — AND THAT IS NOT THE SAME AS
// FREE (r3-r2, the round-3 verifier, measured on the real engine + real pool).
// It can only make `projectionFamilyFor` answer null (= no projection, every
// bucket counts) and `servedDefinesModel` answer false (= the REQUEST model
// wins), so it can never authorise a move ONTO a spent cap. What it CAN do is
// refuse a move OFF one: with every bucket counting, a candidate is disqualified
// by a cap OUTSIDE this session's family too, so a current member that is 100 %
// through its 5-hour window kept its conversation while a free member sat beside
// it, blocked on an Opus cap the session was not using. That is the conservative
// direction, r2 strands on the identical fixture (persisting the stamp only makes
// the state survive a restart instead of being cleared by one), and the first
// main-thread record served by anything else retires it, on disk too.
function persistFallbackStamp(session) {
  try {
    if (!session || !session.sockName) return;
    const prev = sessionMetaStore.readSessionMeta?.(session.sockName);
    if (prev === undefined) return; // the store is not wired (or not up yet) — memory only
    sessionMetaStore.writeSessionMeta?.(session.sockName, { ...(prev || {}), servedViaFallback: session._servedViaFallback || null });
  } catch (e) { console.warn('[model] fallback stamp not persisted:', e.message); }
}

/** A main-thread assistant record named the model that ANSWERED. */
function noteServedModel(session, model) {
  if (!session || !model) return;
  session._servedModel = model;
  session._servedModelAt = Date.now();
  // THE FALLBACK IS OVER THE MOMENT SOMETHING ELSE ANSWERS. The stamp is a
  // claim about a reroute that is still in force; a main-thread record served
  // by any other model refutes it, and leaving it standing would suppress a
  // served model that really is the session's (an in-CLI `/model` away from
  // the fallback target, a recovered turn).
  const fb = session._servedViaFallback;
  if (fb && fb.to && !modelsMatch(model, fb.to)) { session._servedViaFallback = null; persistFallbackStamp(session); }
}

/** A `fallback` content block / a `model_refusal_fallback` system record said
 *  the CLI asked for `from` and was answered by `to`. MAIN THREAD ONLY — a
 *  sidechain's reroute says nothing about what the main thread is requesting. */
function noteModelFallback(session, from, to) {
  if (!session || !to) return;
  // ONE WRITE PER REROUTE, not one per record: the incident announced the same
  // reroute twice (a `fallback` content block, then a `model_refusal_fallback`
  // system record), and a meta write is not free (it re-runs the ledger's
  // account-by-time attribution). Restating a reroute that already stands also
  // leaves `at` alone on purpose — it dates when THIS reroute began, and a
  // reroute that has been retired starts a fresh stamp because `prev` is null.
  const prev = session._servedViaFallback;
  if (prev && prev.to === to) return;
  session._servedViaFallback = { from: from || null, to, at: Date.now() };
  persistFallbackStamp(session);
}

/** THE REROUTE **THIS RECORD** ANNOUNCES — asked BEFORE anything reads the
 *  served model (2026-09-13 r4, the round-3 verifier, reproduced on the real
 *  pipeline before anything changed).
 *
 *  The incident's FIRST announcement is a `fallback` CONTENT BLOCK riding the
 *  assistant message whose own `message.model` IS the substitute — ONE record
 *  carrying both facts, and the `system/model_refusal_fallback` twin arrives
 *  51 s later (frozen transcript: 04:42:45.234Z vs 04:43:36.398Z). Both stdout
 *  consumers read the served model at the TOP of their assistant branch while
 *  the content-block loop that stamps the reroute sits ~50 lines BELOW it, so
 *  every reader of `_servedViaFallback` in between was asking a question whose
 *  answer had not been written yet: `servedDefinesModel` said yes, the
 *  target-less lock latch adopted `claude-opus-4-8` and WROTE IT TO
 *  SESSION-META, where it is permanent — and once the reroute later retires
 *  (any record served by something else), §12's belt has nothing left to refuse
 *  and the lock rung answers the substitute for the life of the conversation:
 *  `laneByEvidence` then asks for the OPUS cap, finds none, and files a Fable
 *  rejection against the PLAN week (the incident's §2 harm, measured end to
 *  end). The fix is the ORDER — place the fact, then let the readers read it.
 *
 *  MAIN THREAD ONLY, inside this function rather than at its two call sites:
 *  a sidechain's reroute says nothing about what the main thread is requesting,
 *  and one implementation cannot be got wrong at one of two places.
 *
 *  Restating a reroute that already stands is a NO-OP by construction
 *  (`noteModelFallback` returns early on `prev.to === to` and deliberately
 *  leaves `at` alone — it dates when THIS reroute began), which is why the
 *  later content-block stamp and the `model_refusal_fallback` stamp stay
 *  exactly where they are: they are the belts for the shapes this rung cannot
 *  see (a `<synthetic>`-model record, a system record with no assistant record
 *  at all), and they cost nothing when this rung has already spoken. */
function rerouteAnnouncedBy(msg) {
  if (!msg || msg.type !== 'assistant' || msg.parent_tool_use_id || msg.isSidechain) return null;
  const content = msg.message?.content;
  if (!Array.isArray(content)) return null;
  for (const b of content) {
    if (b?.type === 'fallback' && b.to?.model) return { from: b.from?.model || null, to: b.to.model };
  }
  return null;
}

// PLACEMENT FOLLOWS THE REQUEST MODEL, NEVER A FALLBACK-SERVED ONE (the
// 2026-09-13 pool storm). The session's model identity is the LAST set-model
// pick vs the model that actually answered — newest wins — else the spawn
// model; but a served model the CLI's safety classifier substituted for ours
// is not this session's model at all. In the incident the classifier rerouted
// `claude-fable-5-1 → claude-opus-4-8` once, announced it once
// (`scope:"session"`), and then answered 18 more records as opus with no
// marker whatsoever — while the CLI kept REQUESTING Fable (the next rejection
// it earned was "You've reached your Fable limit"). Reading the served model
// made `familyOfModel` say 'opus', `projectCacheForFamily` dropped the Fable
// bucket that was the binding constraint, and the pool proactively moved the
// owner's main conversation onto a member whose Fable cap was 100 % spent —
// and then onto two more.
//
// So the ladder is: picked (newest) > spawn > served-IF-NOT-A-FALLBACK.
//
// UNKNOWN STAYS null, AND null IS THE CONSERVATIVE ANSWER: it means NO
// projection, so every bucket of every member counts — a member whose Fable
// cap is spent is dead for an unknown session too. Guessing a family here
// would hide exactly the bucket that refuses the turn.
function servedDefinesModel(s) {
  if (!s || !s._servedModel) return false;
  const fb = s._servedViaFallback;
  if (!fb || !fb.to) return true;
  return !modelsMatch(s._servedModel, fb.to);
}
function sessionModelFor(s) {
  // THE LOCK IS THE REQUEST MODEL (2026-09-13 r3, the owner's correction —
  // reproduced on the real engine before anything changed). The incident's own
  // conversation was LOCKED: its frozen meta reads `modelLocked: true,
  // lockedModel: "fable[1m]"`, and `maybeRepinLockedModel` re-sends `/model` at
  // every turn end where the served model drifted — i.e. the server KNEW the
  // request model the whole time and was actively re-asserting it. Yet "newest
  // wins" let a fallback-served `claude-opus-4-8` record outrank both the lock
  // and the pick: one such record after a restart (where the reroute stamp used
  // to be lost — see `persistFallbackStamp`) answered 'opus', the projection
  // dropped the Fable cap, and the pool moved the conversation onto a member
  // whose Fable was 100 % spent while `quotaVerdictFor` called it usable. A
  // lock is never outranked by a served model, however new.
  //
  // It sits ABOVE the pick because the two cannot disagree on the path that
  // exists: picking a model while locked RE-TARGETS the lock on both sides
  // (chat-status-bar sends `lockModel` with the pick; ws-handler's set-model
  // rewrites `_lockedModel`), and the lock is the only one of the two the
  // server keeps re-asserting to the CLI. And because the lock IS persisted and
  // restored (boot-restore, meta `modelLocked`/`lockedModel`), a locked
  // conversation is right immediately after a restart — before any stamp, pick
  // or served model has been re-learned. That is the incident's shape.
  //
  // …AND A LOCK TARGET THAT *IS* THE STANDING REROUTE IS NOT A REQUEST (r3-r2,
  // the round-3 verifier). Two writers can put the classifier's substitute in
  // `_lockedModel`: the parse's target-less latch (now gated on
  // `servedDefinesModel` — this rung is its belt, because a rung that decides
  // money may not depend on every writer of a field being careful) and
  // ws-handler's `set-model {lock:true}` with no `lockModel`, which adopts
  // `_servedModel` because the UI row it serves says "Lock to this model" about
  // the model on screen. Whatever wrote it, a target that is the model we are
  // being rerouted TO cannot be the model we are asking FOR.
  //
  // Falling through costs nothing and invents nothing: `servedDefinesModel`
  // refuses that same served model one line below, so the answer is the pick,
  // else the spawn model — the REQUEST — which is byte-for-byte what r2
  // answered for this shape (measured, both writers). And whatever the ladder
  // returns, `projectionFamilyFor` still sees the standing reroute and answers
  // null for a cross-family one, so every bucket keeps counting.
  if (s && s._modelLocked && s._lockedModel
    && !(s._servedViaFallback?.to && modelsMatch(s._lockedModel, s._servedViaFallback.to))) return s._lockedModel;
  const served = servedDefinesModel(s) ? { m: s._servedModel, at: s._servedModelAt || 0 } : null;
  const picked = s._pickedModel ? { m: s._pickedModel, at: s._pickedModelAt || 0 } : null;
  const newest = served && picked ? (picked.at >= served.at ? picked : served) : (picked || served);
  return (newest && newest.m) || s._spawnModel || null;
}
// THE MODEL WHOSE PROMPT CACHE A CONVERSATION RUNS ON (2026-09-22, the warm-cache
// hold). `sessionModelFor` is the answer, with ONE correction: the '[1m]' variant
// is a REQUEST-side fact and a served model never carries it (an assistant
// record's `message.model` is the API's base id, `claude-fable-5-1`), so once an
// unlocked conversation has been answered its model reads variant-less and the
// 1-hour cache would read as 5 minutes. The request model that names the SAME
// model (pick, else spawn — the ladder's order) supplies the variant.
// …EXCEPT A LOCK SPELLED BY SOMEBODY (the verifier's LOW-A, reproduced on the real
// engine): a lock is the REQUEST model as it was spelled — `/model fable` asks
// for the 5-minute cache, and the server re-asserts exactly that spelling at
// every repin — so a variant-less lock is read as written and never borrows a
// '[1m]' off the spawn model. Only a lock COPIED off the served model (the
// target-less latch, `set-model {lock:true}` adopting `_servedModel`) is spelled
// by the API, which cannot carry the variant: it is recognisable as exactly that
// string, and only it (like the served rung) takes the read-back. Exact equality,
// not `modelsMatch`: modelsMatch answers true for an unknown served model and
// for 'fable' against 'claude-fable-5-1', i.e. in exactly the repro's shapes.
function cacheModelFor(s) {
  const m = sessionModelFor(s);
  if (!m || /\[1m\]\s*$/i.test(m)) return m;
  if (s._modelLocked && s._lockedModel && m === s._lockedModel && m !== s._servedModel) return m;
  const req = [s._pickedModel, s._spawnModel].find((x) => x && modelsMatch(x, m));
  return req && /\[1m\]\s*$/i.test(req) ? req : m;
}

// WHICH MODEL-SCOPED CAP CAN REFUSE THIS SESSION'S NEXT TURN — the PROJECTION
// question, and it is NOT the question `sessionModelFor` answers (2026-09-13
// r2, the round-1 verifier, reproduced end to end).
//
// `projectCacheForFamily(cache, fam)` DROPS every model-scoped cap of another
// known family, so the family handed to it decides which walls the pool and
// the verdict are allowed to see. Round 1 fixed `sessionModelFor` to state the
// REQUEST model and then handed THAT to the projection — which trades the
// incident's blind spot for its mirror: while a classifier reroute is
// STANDING, the model that is actually ANSWERING (and being billed — this
// instance's own anchor for the incident reads `costSince.byFamily
// {opus: 21.3957, fable: 0}` over 24 requests) has its cap thrown away.
// Measured on the real engine + real pool: a fable-requesting session rerouted
// to opus was proactively moved ONTO a member whose Opus cap read 100 % spent
// (`fam=fable, from 80%`, notice "its fable quota was at 80%"), and
// `quotaVerdictFor` answered `usable: true` about a member master correctly
// called `Opus 0% < 5%` — i.e. round 1 authorised the billed continue this
// whole essay exists to stop.
//
// A STANDING REROUTE MAKES THE FAMILY AMBIGUOUS: both the model we ask for and
// the model we are given can refuse the turn (the incident proves the first —
// its rejection was "You've reached your Fable limit" — and the ledger proves
// the second is what gets billed). So the answer is the doctrine round 1 wrote
// three lines above its own code and did not apply here: UNKNOWN STAYS null,
// and null means NO projection, so EVERY bucket counts. A reroute to the same
// family (fable-5 → fable-4) is not ambiguous and keeps its projection; a
// reroute to a family we cannot name is ambiguous like any other (fail
// closed). A stamp left standing by an idle session therefore costs
// CONSERVATISM, never money — the same answer an unknown-model session gets.
//
// `sessionModelFor` deliberately keeps answering the REQUEST model everywhere
// else: the notice text, `_wallScope`, `fireIdentityFor`, the model lock, and
// `laneByEvidence` — which asks which cap a rejection was ABOUT, and the CLI
// rejects the REQUEST (measured: the incident's banner named Fable while opus
// was answering).
//
// r3: A LOCK WHOSE SERVED MODEL DISAGREES IS THE SAME AMBIGUITY, evidenced by
// a different fact. `sessionModelFor` now answers the lock, so without this
// rung a locked conversation whose stamp we never saw (a meta written by an
// older build, a reroute announced on a feed that was down, a stamp cleared by
// hand) would project the LOCK's family alone and drop the cap of the model
// that is answering and being billed — r2's own mirror defect, one rung lower.
// Under a lock the server is actively re-pinning, so a served model in another
// family means the drift is CURRENT, not one turn stale: both caps can refuse
// the next turn. Deliberately NOT extended to a plain pick — a `set-model`
// writes `/model` on the same tick, so a served model older than a pick is
// stale BY CONSTRUCTION and treating that as ambiguity would suppress the
// projection for one turn after every ordinary model switch.
function projectionFamilyFor(session, model) {
  const fam = familyOfModel(model);
  if (!fam) return null;
  if (!session) return fam;
  const fb = session._servedViaFallback;
  if (fb && fb.to && familyOfModel(fb.to) !== fam) return null;
  if (session._modelLocked && session._lockedModel && session._servedModel
    && familyOfModel(session._servedModel) !== fam) return null;
  return fam;
}

const _vsuPending = new Map(); // request_id → {resolve, timer, raw} (the consumer fills `raw` with the verbatim reply before resolving)
// THE RAW PROBE LOG (2.369.109): the control rung's verbatim reply rides beside
// its parse so probeUsageForAccountKey can record what it wrote and why.
const probeLog = require('./usage-probe-log.js');
const _vsuRawOf = new WeakMap(); // parsed object → the raw control_response payload it came from
function logControlProbe(session, key, parsed, raw, outcome, extra) {
  try {
    probeLog.appendProbeLog(path.join(rootDir, 'data'), {
      rung: 'control', key, name: nameOf(key), sessionId: session ? session._webuiId || null : null,
      sessionKey: session ? (resolveUsageKey(session) || null) : null, raw: raw == null ? null : raw, parsed: parsed == null ? null : parsed, outcome, ...(extra || {}),
    });
  } catch { }
}
function resolveUsageKey(session) {
  let acct = session._accountId || null;
  try {
    if (acct && accounts.get(acct)?.type === 'pooled') {
      // THE CREDENTIAL SLOT, for VALUES too (2026-09-07 — the second half of
      // the same correction that moved rejections off the observation).
      // A utilization number does describe whatever token produced it; the
      // refuted step was believing OTel's organization.id NAMES that token.
      // It names the identity the CLI cached at SPAWN, while the credential
      // file it re-reads (mtime-gated, 2.1.257 rpe()) is the link's — so
      // "follow the observation" filed every hot-switched session's readings
      // under the account it started on. The link, slot-validated, is the
      // only identity we can actually prove is being read.
      acct = sessionBillingMember(session, acct).id || acct;
    }
  } catch {}
  // The two CLIs' machine logins are DIFFERENT identities and always were —
  // the ledger has keyed them apart since P1 (`ev.be === 'codex' ?
  // '__global_codex__' : '__global__'`). A bare '__global__' here sent an
  // account-less codex session's readings into the CLAUDE global identity;
  // it only stayed invisible because the codex producers carried their own
  // key resolver. Now that ONE reading resolver serves both, it must know.
  return acct || globalUsageKey(session?.backend);
}
function writeUsageCacheForKey(key, parsed) {
  try {
    const f = path.join(USAGE_CACHE_DIR, key.replace(/[^\w.-]/g, '_') + '.json');
    let prev = {}; try { prev = JSON.parse(fs.readFileSync(f, 'utf-8')) || {}; } catch {}
    const merged = { ...prev, ...parsed };
    // PROVENANCE IS NOT PRESERVED (2026-09-07 r2, reproduced): `corroborated`
    // is a verdict about ONE write — did the OTel observation agree with the
    // credential slot THAT reading was filed on. A preserve-merge inherits
    // whatever the previous producer decided, so a probe/panel result written
    // over a diverged rate_limit_event rendered as "via own /usage panel · not
    // corroborated": an old verdict attached to a reading it does not
    // describe (and, for a session-less producer, one there is nothing to
    // corroborate WITH). captureRateLimitEvent and markLimitBanner already
    // delete-or-set it per write; every preserve-merge writer must too.
    if (parsed.corroborated === undefined) delete merged.corroborated; else merged.corroborated = !!parsed.corroborated;
    // preserve-merge like the statusline hook: never clobber known scoped/org
    // data with an empty answer
    if ((!parsed.scopedWeekly || !parsed.scopedWeekly.length) && Array.isArray(prev.scopedWeekly) && prev.scopedWeekly.length) {
      merged.scopedWeekly = prev.scopedWeekly; merged.scopedFetchedAt = prev.scopedFetchedAt;
    }
    for (const k of ['orgUuid', 'orgName', 'orgEmail', 'email', 'name']) if (prev[k] !== undefined && merged[k] === undefined) merged[k] = prev[k];
    delete merged.limits; // the canonical half is the write path's to compute, never inherited whole from `prev`
    // AUTHORITATIVE OVER THE MODEL SET only when THIS answer both ENUMERATED
    // and NAMED a model cap (r5 + r6 + B-9f4b: a codename bucket is kept, never
    // named) — the preserve-merge above carries `prev`'s
    // forward when it did not, and a carried-forward list states nothing about
    // what the vendor still reports. `parsed` is the control payload's own
    // parse (`parseGetUsageResponse`), which is the only object that can know
    // whether it dropped a bucket; `merged` could not answer it.
    return usageWrite.writeCacheObject({ cacheDir: USAGE_CACHE_DIR, key, obj: merged, source: parsed.source || null, familyOf: familyOfScopedBucket, backend: 'claude',
      authoritativeScopes: quotaModel.authoritativeScopesOf(parsed) }).ok;
  } catch { return false; }
}
// Ask a LIVE LOCAL claude chat session's CLI for usage over its control
// channel. Returns parsed cache shape or null. Caller is the human-gated ⟳.
function probeUsageViaSession(session, timeoutMs = 8000) {
  return new Promise((resolve) => {
    try {
      if (!session?.pty || !cliUsageRung(session.backend) || session.mode !== 'chat' || session.host) return resolve(null);
      const req = ClaudeCodeAdapter.buildGetUsage();
      const pend = { resolve: null, timer: null, raw: null };
      pend.timer = setTimeout(() => { _vsuPending.delete(req.request_id); logControlProbe(session, resolveUsageKey(session), null, null, 'timeout', { timeoutMs }); resolve(null); }, timeoutMs);
      // the parse is what callers get; its verbatim reply is reachable through
      // _vsuRawOf so the ONE log line per probe can carry both (2.369.109)
      pend.resolve = (parsed) => { if (parsed && typeof parsed === 'object') _vsuRawOf.set(parsed, pend.raw); else logControlProbe(session, resolveUsageKey(session), null, pend.raw, 'unparsed'); resolve(parsed); };
      _vsuPending.set(req.request_id, pend);
      session.pty.write(JSON.stringify(req) + '\n');
    } catch { resolve(null); }
  });
}
// Every account key in `key`'s IDENTITY group (org-merged logins span
// '__global__' + named subs — one real account, several keys). Falls back to
// just [key] when the identity is unknown.
function usageIdentityAccountIds(key) {
  try {
    for (const [, g] of usageIdentityGroupsCached()) {
      if (g.accountIds.includes(key)) return g.accountIds;
    }
  } catch { }
  return [key];
}
// ⟳-route hook: find any live local claude chat session billed to `key` — or
// to ANY key in its identity group (2.266.1, real report: ⟳ on the pool's
// ACTIVE target said "no valid token" while the asking session itself was
// billing that very account — the popup had remapped the linked account to
// '__global__', which no session matches when pool sessions bill the DIR key;
// the shared quota makes any same-identity session's answer authoritative).
// A SESSION WHOSE CREDENTIALS WE CANNOT VOUCH FOR IS NOT ASKED (B-855a ③,
// 2026-09-17): under a pool switch the CLI may still hold the PREVIOUS
// member's token (the same sessions log "observed on X while linked to Y"),
// so its `get_usage` is the wrong account's panel. Two witnesses veto the
// rung and the ⟳ falls to the isolated panel probe — since 2026-09-30 ONE: a
// re-point inside the lag shadow that no reading has yet ended (`inLagShadow`).
// (The other, the OTel label disagreeing with the slot, was retired: the label
// is machine-wide and disagreed for sessions billing exactly their link.) Neither decides
// where a number LANDS (guard ② still does) — they decide whom we ASK.
// `opts.detailed` answers `{parsed, sessionId, target, identityVerified, why,
// skipped}` for the route; the bare call keeps its parsed|null shape.
function probeUsageForAccountKey(key, opts = {}) {
  const ids = new Set(usageIdentityAccountIds(key));
  const skipped = [];
  const detail = (parsed, extra) => (opts && opts.detailed) ? { parsed: parsed || null, rung: 'control', skipped, ...(extra || {}) } : (parsed || null);
  for (const [, s] of activeSessions) {
    if (!cliUsageRung(s.backend) || s.mode !== 'chat' || s.host || !s.pty) continue;
    if (!ids.has(resolveUsageKey(s))) continue;
    const sh = inLagShadow(s);
    if (sh) { skipped.push({ sessionId: s._webuiId || null, why: `re-pointed ${nameOf(sh.from)} → ${nameOf(sh.to)} ${Math.round(sh.ageMs / 1000)}s ago and no reading has ended the lag shadow yet` }); continue; }
    return probeUsageViaSession(s).then((parsed) => {
      // the ANSWER comes from a live session's CLI, so it is the credentials
      // that session holds that produced it — the ⟳ target is only who we
      // ASKED about (guard ② decides who it is written for)
      if (parsed) {
        const win = readingLag.windowOf(parsed);
        const target = guardReadingTarget(key, win, { session: s, what: 'control:get_usage', entry: parsed });
        if (target) writeUsageCacheForKey(target, parsed);
        logControlProbe(s, key, parsed, _vsuRawOf.get(parsed) || null, target ? 'written' : 'refused-by-window-guard', { target: target || null, window: win });
        // verified = the answer's weekly window agrees with the account's own
        // established window; 'unknown' is honest, never spelled as yes
        const own = establishedWindows()[key] || null;
        const cmp = own ? readingLag.compareWindows(win, own) : 'unknown';
        const identityVerified = target === key && cmp === 'agree';
        const why = target !== key ? (target ? `window says these numbers are ${nameOf(target)}'s — written there` : 'window matches no known account — archived')
          : cmp === 'agree' ? `answered by session ${s._webuiId || '?'}; weekly window matches ${nameOf(key)}'s established window`
          : `answered by session ${s._webuiId || '?'}; no established window to compare against`;
        return detail(parsed, { sessionId: s._webuiId || null, target: target || null, identityVerified, why });
      }
      return detail(null, { sessionId: s._webuiId || null, target: null, identityVerified: false, why: 'the session did not answer' });
    });
  }
  return Promise.resolve(detail(null, { sessionId: null, target: null, identityVerified: false, why: skipped.length ? 'every live session was skipped' : 'no live session bills this account' }));
}
app.locals.usageIdentityAccountIds = usageIdentityAccountIds;

// ── THE ESTABLISHED WINDOW of every account we could file a reading on ──────
// It is STAMPED AT THE WRITE by the ONE producer whose key and whose credential
// dir are the SAME decision — refreshViaCliPanel's `claude -p /usage`
// (usage-routes.js says so in its own header). It is deliberately NOT inferred
// from whatever the last write left in `sevenDay.resetsAt`: that field is
// exactly what a mis-filed reading overwrites, so reading the window back out
// of it would let one bad write redefine the account and immunise every later
// one. A member with no established window simply has none, and the guard
// stays inert for it — no evidence, no refusal.
//
// IT LIVES IN A SIDECAR, NOT IN THE SNAPSHOT (r2, reproduced end to end). It
// was a field of the usage-cache object, which EVERY reading producer rewrites
// wholesale — and the highest-frequency one of all, the shipped statusline hook
// (once per 8 s per account), rebuilds that object from a literal that
// preserves scopedWeekly / the org identity / spend one field at a time. The
// window was never added to that list, so ONE legitimate statusline render
// deleted every established window on the instance, `windows` went empty, the
// guard degraded to "no established window to contradict", and the incident
// replayed with its second false pool switch. Two more writers (the bare-token
// ⟳ and the codex snapshot) clobber the same way. A hand-written preserve list
// is what failed — five times on this one file — so the fact a reading producer
// may not state no longer lives where a reading producer writes.
// Keyed off the CACHE FILES, so a sidecar left behind by a removed account is
// invisible and can never become a re-file target.
// Memoised for one tick of the producers (a turn writes ~20 readings and each
// would otherwise re-read every sidecar).
const OWN_WINDOW_TTL_MS = 5000;
let _ownWinAt = 0, _ownWin = null;
function establishedWindows() {
  const now = Date.now();
  if (_ownWin && now - _ownWinAt < OWN_WINDOW_TTL_MS) return _ownWin;
  const out = {};
  let files = [];
  try { files = fs.readdirSync(USAGE_CACHE_DIR).filter((f) => f.endsWith('.json') && !f.startsWith('__models__')); } catch { }
  for (const fn of files) {
    const key = fn.slice(0, -5);
    try {
      const w = JSON.parse(fs.readFileSync(path.join(USAGE_CACHE_DIR, readingLag.windowSidecarName(key)), 'utf-8'));
      if (w && (w.sevenDay || w.fiveHour || (w.scoped && Object.keys(w.scoped).length))) out[key] = w;
    } catch { }
  }
  _ownWin = out; _ownWinAt = now;
  return out;
}
// ── THE API-DERIVED WINDOW of an account (B-855a, 2026-09-17) ───────────────
// The established window above is what the account's /usage PANEL last said —
// and B-855a is precisely the panel answering for ANOTHER account (the CLI took
// its org context from the machine-wide ~/.claude.json, which every session's
// CLI rewrites). A panel therefore cannot be its own identity proof: the panel
// probe now runs under an isolated CLAUDE_CONFIG_DIR (usage-routes.js) AND is
// checked against a witness the panel never wrote — the weekly window the
// account's OWN API responses state. A `rate_limit_event` that arrived on a
// slot-VALIDATED link (`slotOk`: the link resolved to this member's creds dir
// at the moment of the reading) and that names a weekly reset is that witness.
// Written here, read by `refreshViaCliPanel` before it may write (via the
// `apiDerivedWindow` dep), nothing else. Sidecar `.apiwin-<key>` beside the
// cache, no `.json` (every scanner ignores it, like `.window-`/`.slot-`).
// Merged per bucket: a seven_day event updates `sevenDay`, a scoped one its
// name under `scoped`, and the roll (exactly one week) is a phase no-op.
// A PHASE IS THE ACCOUNT'S ONLY AFTER K READINGS AGREE (final verifier,
// 2026-09-17). ONE slot-verified reading is not a witness: a response in flight
// across a re-point is `slotOk` by construction (the lag shadow exists for
// exactly that reading), and when the shadow has no window evidence to judge
// it by — a FRESH member has none — it lands on the new member carrying the
// OLD member's weekly window. Written into `.apiwin-<new>` on the spot, that
// one reading then refused every reading the new member itself produced, its
// own panel with them, and the standing repair counted the poisoned witness as
// evidence: B-855a ② re-created through a different producer, on the account
// the owner had just paid for. So the sidecar keeps a small RING of candidate
// readings, and the witness (`sevenDay` / `scoped`) is (re)written only when
// the newest API_WITNESS_K entries agree on one phase — each candidate having
// passed `apiWitnessEligibility` first (slot validated, not shadowed, no
// re-point of this conversation inside the shadow horizon, the turn pin not
// older than the last re-point, OTel not disagreeing). The SAME run rule moves
// an established window that genuinely changed (a plan change): K consecutive
// readings the guard archived or re-filed in ONE new phase re-anchor
// `.apiwin-` AND `.window-` there, the old sidecar archived with a reason —
// the self-heal the panel (which may only write once verified) cannot provide.
const API_WITNESS_K = 3;      // consecutive agreeing candidates before a phase is the account's
const API_WITNESS_RING = 8;   // candidates the sidecar remembers (≥ K + a few foreign ones to break a run)
function readApiWitnessFile(key) {
  try {
    const w = JSON.parse(fs.readFileSync(path.join(USAGE_CACHE_DIR, readingLag.apiWindowSidecarName(key)), 'utf-8'));
    return w && typeof w === 'object' ? w : null;
  } catch { return null; }
}
/** The account's API-derived window (the ESTABLISHED witness) or null.
 *  `{witness:true}` answers `{window, ring, k}` — the ring of candidates too,
 *  for a caller that wants to say "the window may have moved" before the run
 *  is complete (the ⟳ answer). */
function apiDerivedWindow(key, { witness = false } = {}) {
  const w = readApiWitnessFile(key);
  const ring = Array.isArray(w && w.ring) ? w.ring.filter((e) => e && Number(e.resetsAt) > 0) : [];
  let out = null;
  if (w) {
    const v = { sevenDay: Number(w.sevenDay) > 0 ? Number(w.sevenDay) : null, fiveHour: null, scoped: {}, at: w.at || null, sessionId: w.sessionId || null, source: w.source || null };
    for (const [n, r] of Object.entries(w.scoped || {})) if (Number(r) > 0) v.scoped[String(n).toLowerCase()] = Number(r);
    if (v.sevenDay || Object.keys(v.scoped).length) out = v;
  }
  return witness ? { window: out, ring, k: API_WITNESS_K } : out;
}
/** Feed ONE eligible weekly candidate into the account's witness ring.
 *  `outcome` = what the guard did with the reading (write / archived /
 *  refiled). Returns `{run, k, established, moved}`, or null when the reading
 *  is not weekly or the sidecar could not be written. */
function noteApiDerivedWindow(key, ev, session, { outcome = 'write' } = {}) {
  try {
    if (!key || !ev || !(Number(ev.resetsAt) > 0)) return null;
    if (ev.kind !== 'sevenDay' && !(ev.kind === 'scoped' && ev.scopedName)) return null; // a 5h window names a TIME, never an account (reading-lag r2)
    // the UN-NAMED model cap names no account window either: since r2 the
    // placeholder rides the event as its own key so the wall machine can spell
    // it, and a witness run would otherwise stamp a 'model cap' family into the
    // sidecar that the naming ladder then reads back as a NAMED cap
    if (ev.kind === 'scoped' && String(ev.scopedName).toLowerCase() === String(quotaModel.MODEL_CAP_PLACEHOLDER.name).toLowerCase()) return null;
    const raw = readApiWitnessFile(key) || {};
    const ring = (Array.isArray(raw.ring) ? raw.ring.filter((e) => e && Number(e.resetsAt) > 0) : []).slice(-(API_WITNESS_RING - 1));
    const entry = { resetsAt: Number(ev.resetsAt), kind: ev.kind, name: ev.kind === 'scoped' ? String(ev.scopedName).toLowerCase() : null, at: Date.now(), sid: session?._webuiId || null, outcome };
    ring.push(entry);
    let run = 0;
    for (let i = ring.length - 1; i >= 0 && readingLag.weeklyNear(ring[i].resetsAt, entry.resetsAt) === true; i--) run++;
    const next = { sevenDay: Number(raw.sevenDay) > 0 ? Number(raw.sevenDay) : null, scoped: { ...(raw.scoped || {}) }, at: raw.at || null, sessionId: raw.sessionId || null, source: raw.source || null, n: raw.n, ring, ringAt: entry.at };
    const res = { run, k: API_WITNESS_K, established: false, moved: false };
    if (run >= API_WITNESS_K) {
      const agreeing = ring.slice(ring.length - run);
      // the anchor this run is judged against: the guard's `.window-` first, else the witness itself
      let anchor = null;
      try { anchor = establishedWindows()[key] || null; } catch { }
      const phaseRefOf = (w) => (w ? (Number(w.sevenDay) > 0 ? Number(w.sevenDay) : (Number(Object.values(w.scoped || {})[0]) || null)) : null);
      const ref = phaseRefOf(anchor) || phaseRefOf(next);
      const moved = ref ? readingLag.weeklyNear(ref, entry.resetsAt) === false : false;
      const w = moved ? { sevenDay: null, scoped: {} } : { sevenDay: next.sevenDay, scoped: { ...next.scoped } };
      for (const e of agreeing) { if (e.kind === 'sevenDay') w.sevenDay = e.resetsAt; else if (e.name) w.scoped[e.name] = e.resetsAt; }
      next.sevenDay = w.sevenDay; next.scoped = w.scoped; next.at = entry.at; next.sessionId = entry.sid; next.source = 'rate-limit-events'; next.n = run;
      res.established = true; res.moved = moved;
      // …AND THE GUARD'S ANCHOR: stamped when ABSENT, re-stamped when the run
      // CONTRADICTS it (the window moved) — never touched by a run that agrees
      if (!anchor || moved) {
        const stamp = { sevenDay: w.sevenDay, fiveHour: null, scoped: { ...w.scoped }, at: entry.at, source: 'api', verifiedAt: entry.at, verifiedBy: 'rate-limit-events', n: run, sessionId: entry.sid };
        if (moved) {
          const was = readingLag.windowFingerprint(anchor || { sevenDay: Number(raw.sevenDay) || null, fiveHour: null, scoped: raw.scoped || {} });
          const isNow = readingLag.windowFingerprint(stamp);
          console.log(`[usage] window moved: ${nameOf(key)}'s weekly window is now ${isNow} (was ${was}) — ${run} consecutive slot-verified readings the guard had ${agreeing.map((e) => e.outcome).join('/')}; sidecars re-anchored, the old one archived`);
          global.__vsEvent?.('usage-window-moved', `${key}:${readingLag.weeklyPhase(ref)}→${readingLag.weeklyPhase(entry.resetsAt)}`);
          try {
            const f = path.join(rootDir, 'data', 'archive', 'readings-foreign-usage-cache.ndjson');
            fs.mkdirSync(path.dirname(f), { recursive: true });
            fs.appendFileSync(f, JSON.stringify({ migration: 'window-moved', at: entry.at, store: 'window-sidecar', key, action: 'moved', reason: `${nameOf(key)}'s weekly window moved from ${was} to ${isNow}: ${run} consecutive slot-verified rate-limit readings agreed on the new phase (guard outcomes ${agreeing.map((e) => e.outcome).join('/')})`, entry: anchor || null, apiwin: { sevenDay: Number(raw.sevenDay) || null, scoped: raw.scoped || {} } }) + '\n');
          } catch { }
        }
        usageWrite.writeSidecar(USAGE_CACHE_DIR, readingLag.windowSidecarName(key), stamp);
        _ownWin = null; _ownWinAt = 0;
      }
    }
    const ok = usageWrite.writeSidecar(USAGE_CACHE_DIR, readingLag.apiWindowSidecarName(key), next);
    return ok ? res : null;
  } catch { return null; }
}
/** May THIS reading be a candidate for the slot's witness ring? Every leg is
 *  a way a slot-verified reading was, or could be, somebody else's. */
function apiWitnessEligibility(session, slot, key) {
  try {
    if (!slot || !slot.slotOk) return { ok: false, why: 'slot not validated' };
    if (slot.shadowed) return { ok: false, why: 'inside a re-point lag shadow' };
    const now = Date.now();
    const row = recentRepointRow(session, now);
    if (row) return { ok: false, why: `re-pointed ${nameOf(row.from)} → ${nameOf(row.to)} ${Math.round((now - row.at) / 1000)}s ago` };
    const pin = session && session._turnReadingSlot;
    if (pin && pin.at && lastRepointRow(session, { at: now, minAt: pin.at })) return { ok: false, why: 'the turn pin predates a re-point' };
    // THE OTel LEG IS RETIRED (lane-hot-switch, 2026-09-30). inc-mu6djxxt-8166
    // already found it wrong for a hot-switched session and kept it for a
    // never-switched one ("its OTel IS its identity"); the measurement says the
    // label is machine-wide for EVERY session, so a never-switched session on
    // any member but the label's was vetoed from its own member's ring.
    return { ok: true, why: 'slot-verified' };
  } catch (e) { return { ok: false, why: 'eligibility check failed: ' + (e && e.message) }; }
}
// (`switchedSinceSpawn` — the OTel leg's only question — retired with it.)
// ── THE STANDING IDENTITY REPAIR (B-855a c2, 2026-09-17) ────────────────────
// Runs at boot (after the one-shot migrations, server.js) and on the human-
// triggered POST /api/usage/repair-identity: every roster account's API phase
// is derived from its slot-verified rate-limit readings and the sidecars /
// cache snapshots are made to agree with it (src/reading-repair.js
// repairSidecarsByApiPhase). Idempotent, archive-never-destroy, one journal
// line with the counts, and the established-window memo is dropped so the
// guard reads the repaired sidecars at once.
function repairIdentityAnchors(why = 'boot') {
  try {
    const { repairSidecarsByApiPhase } = require('../reading-repair.js');
    const list = (accounts.list && accounts.list().accounts) || [];
    const rep = repairSidecarsByApiPhase({ dataDir: path.join(rootDir, 'data'), accounts: list, id: 'identity-repair:' + why });
    _ownWin = null; _ownWinAt = 0;
    const c = rep.counts || {};
    const changed = !!(c.restamped || c.replaced || c.emptied || c.stripped || c.readmitted || c.stamped);
    // the STANDING run (hourly, final verifier: a moved window must not wait
    // for the next boot) speaks only when it changed something — a journal
    // line per hour saying "nothing" is the log
    if (why !== 'hourly' || changed) console.log(`[usage] identity repair (${why}): ${JSON.stringify(c)} in ${rep.ms} ms`);
    if (changed) global.__vsEvent?.('usage-identity-repaired', `${why}:${c.restamped}/${c.replaced}/${c.readmitted}`);
    rep.changed = changed;
    return rep;
  } catch (e) { console.warn('[usage] identity repair failed:', e.message); return { error: e.message, counts: null, identities: [] }; }
}
/** The identity GROUP a cache key belongs to, as ONE representative — an
 *  org-merged login spans '__global__' + the named sub and must never read as
 *  two different accounts matching one window. */
function windowGroupOf(id) { try { return usageIdentityAccountIds(id).slice().sort()[0] || id; } catch { return id; } }

/** ② THE WINDOW IDENTITY GUARD, the ONE place every value producer asks
 *  "may this reading be written for this member". Returns the key to write on,
 *  or null when the reading is archived instead.
 *
 *  DELIBERATELY NOT ON THE WALL / BANNER MARKS: those carry no window of their
 *  own (the banner is a BOOLEAN by owner ruling — never parse text for times —
 *  and the wall's `resetsAt` is often a bounded GUESS, `nowSec + 24h`). A guess
 *  compared against a real window is 'differ' every time, so guarding them
 *  would archive every exhaustion mark on the instance. Their identity has its
 *  own protection: the turn-pinned rejection slot plus `slotOk`. */
function guardReadingTarget(key, readingWindow, { session = null, what = 'reading', entry = null } = {}) {
  let d;
  try {
    d = readingLag.decideReadingTarget({ key, readingWindow, windows: establishedWindows(), groupOf: windowGroupOf });
  } catch (e) { console.warn('[usage] window guard failed (writing as asked):', e.message); return key; }
  if (d.action === 'write') return key;
  const sid = session?._webuiId || session?.claudeSessionId || '-';
  if (d.action === 'refile') {
    noteWindowVerdict(sid, key, d.key, () => console.log(`[usage] ${what}: window says these numbers are ${nameOf(d.key)}'s, not ${nameOf(key)}'s — re-filed (${d.reason})`));
    global.__vsEvent?.('usage-reading-window-refiled', `${key}→${d.key}:${what}`);
    return d.key;
  }
  noteWindowVerdict(sid, key, 'archive', () => console.log(`[usage] ${what}: refusing to write ${nameOf(key)} a reading from another window — archived (${d.reason})`));
  global.__vsEvent?.('usage-reading-window-archived', `${key}:${what}`);
  try {
    fs.mkdirSync(path.dirname(READING_ARCHIVE), { recursive: true });
    // BOUNDED, and the roll is APPENDED under a per-DAY name: an account whose
    // weekly window genuinely moved keeps producing mismatches until its next
    // panel refresh re-establishes it, ~20 readings a turn. A Date.now()-named
    // shard would let two rolls inside one millisecond overwrite each other —
    // the slot-transition ledger's own lesson (an archive that loses what it
    // exists to preserve is worse than no archive).
    try {
      if (fs.statSync(READING_ARCHIVE).size > 5 * 1024 * 1024) {
        const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        fs.appendFileSync(READING_ARCHIVE.replace(/\.ndjson$/, `-${day}.ndjson`), fs.readFileSync(READING_ARCHIVE));
        fs.writeFileSync(READING_ARCHIVE, '');
      }
    } catch { }
    // the TARGET'S established window rides along with its own age: a reading
    // archived because the account's window genuinely moved (a plan change) is
    // told apart from a mis-filed one by how stale `ownWindow.at` is, and that
    // is the whole diagnosis a human needs from the archive line
    fs.appendFileSync(READING_ARCHIVE, JSON.stringify({ at: Date.now(), store: 'usage-cache', key, sid, what, reason: d.reason, matched: d.matched, ownWindow: establishedWindows()[key] || null, entry }) + '\n');
  } catch { }
  return null;
}
// one line per session per (target → verdict) transition: a switching pool
// re-decides every few seconds and a per-record line would be the log
const _windowVerdictAt = new Map();
function noteWindowVerdict(sid, from, to, say) {
  const k = `${sid}:${from}:${to}`;
  if (_windowVerdictAt.get(sid) === k) return;
  _windowVerdictAt.set(sid, k);
  if (_windowVerdictAt.size > 512) _windowVerdictAt.delete(_windowVerdictAt.keys().next().value);
  try { say(); } catch { }
}

// Chat-mode PASSIVE exhaustion signal (zero API calls): the CLI's own
// "You've reached your … limit" banner marks the bucket dead in the cache and
// immediately re-evaluates the pool — this is what makes auto-switch work for
// chat-only accounts (the statusline never runs there).
// Which usage-cache identity does a session's quota belong to? Account-billed
// sessions (local, host-held, linked, pool→target) → the account key (quota
// is a per-account GLOBAL fact — readings merge across machines by identity,
// three-tier design). A REMOTE session on the host's own CLI login has no
// account id → the host bucket (usage-cache/host-<id>.json, the popup's
// machine rows) — resolveUsageKey alone mapped those to '__global__' and
// misattributed the HOST's quota to the LOCAL machine login. (That sentence
// was written when only claude existed here; it is made exact below.)
// THE HOST BUCKET IS THE CLAUDE MACHINE LOGIN'S PER-HOST FORM (2026-09-07 r2,
// reproduced): `host-<id>.json` has exactly ONE meaning everywhere it is read
// or written — that host's own CLAUDE login (usage-routes seeds `_hostUsage`
// from it, the remote statusline harvest writes the host's `__global__` into
// it, the on-demand ⟳ overwrites it with an OAuth panel, the Agents machine
// rows render it). Codex's machine identity is NOT host-scoped: its own
// resolver (`liveQuotaKeyFor`, still the twin `noteWallSignal` uses) has
// always answered '__global_codex__' for an account-less session, and the
// codex panel only seeds files matching /^(cxs-…|__global_codex__)\.json$/.
// The pre-r2 rule keyed on "remote AND no account", so the moment readings and
// rejections began sharing ONE resolver it became the route by which a REMOTE
// codex session's rate_limits_updated snapshot overwrote the host's claude
// numbers — and disappeared from codex's own panel.
// Written as a TRANSFORM OF THE ANSWER rather than a backend test: whatever
// machine identity resolveUsageKey names, only `__global__` (the claude
// machine login) has a per-host form. An account-billed session never resolves
// to it, so "no account" is implied; every other machine identity — codex's
// today, a future harness's tomorrow — passes through untouched.
function usageCacheKeyFor(session) {
  const key = resolveUsageKey(session);
  return (session?.host && key === '__global__') ? 'host-' + session.host : key;
}
// Passive quota capture from the CLI's own rate_limit_event records (B-e5c9,
// 2.289.0) — ONE shared implementation (src/rate-limit-capture.js) for local
// AND remote chat sessions; the caller resolves key/identity as parameters.
// ── THE OBSERVATION IS CORROBORATION, NEVER THE KEY (2026-09-07) ───────────
// REFUTED AND REMOVED: `orgVerifiedKey(session, key, what)`. B-b3cd's premise
// was "a hot-switched pool session keeps its old token for ≥25min, so its
// quota signals describe the OLD org's buckets" — and its fix re-attributed
// every reading to the OTel-observed org. The owner's post-mortem killed the
// premise for BLOCKING on 2026-09-07 (2.369.66) and for VALUES with the same
// evidence: `organization.id` is the identity the CLI cached in its config
// dir at SPAWN, and the credential file IS re-read on an mtime bump, which is
// precisely what the pool's re-point does. So the rule filed a session's
// readings under the account it was SPAWNED on for the rest of its life. On
// this instance that meant a member whose login had been WIPED on 09-02 kept
// receiving limit-banners and Fable-bucket readings until 09-07, and — the
// silent half — a Fish-billed session spawned under Member B filed Fish's
// numbers under Member B, poisoning both panels, both anchor streams and the
// learned rates.
// What replaces it: readingSlotFor() (the validated credential slot, pinned
// for the turn). What survives: this — the divergence is LOGGED and
// telemetered, so a disagreement is still visible and still investigable; it
// simply never decides where a number lands.
// RETIRED (lane-hot-switch, 2026-09-30): `corroborateReading`, `observedMemberFor`
// and `noteDivergence` compared the OTel label with the slot. The label is the
// machine-wide ~/.claude.json org (see the block at the top of this file), so
// the comparison said "not corroborated" of nearly every reading, vetoed the
// witness ring and the ⟳ control rung for sessions that were billing exactly
// the member their link named, and filled the journal with "observed on X
// while linked to Y" lines that read as proof of the opposite of the truth.
const nameOf = (id) => { try { return (id && accounts.get(id)?.name) || id || '?'; } catch { return id || '?'; } };
// REFUTED AND REMOVED (2026-09-07): `sessionReadingMember` — "the observed
// member when the OTel truth names one, else its link". There is no longer a
// reading member DIFFERENT from the billing member: both questions have the
// same answer, the validated credential slot, because that is the only
// identity we can prove the process is reading. Keeping two functions was the
// bug's home — one of them had to be wrong, and the one that was wrong owned
// every VALUE on the instance. `sessionBillingMember` is now THE resolver
// (its `observedMemberFor` corroboration was retired 2026-09-30: a label).
/** TOKEN-SLOT VALIDATION: is the credential slot this session's CLI reads
 *  really `linkedId`'s? The slot is the per-session symlink (or the pool's
 *  default link for a session that has none) — `poolCurrentFor` resolves the
 *  symlink itself, so a non-null answer already means "the link points at a
 *  known account". These legs add the two things that make it AUTHORITY for a
 *  wall: the target is a member of THIS pool, and it holds credentials. When
 *  a leg fails we say WHICH — an unvalidated slot degrades to the old
 *  ≥2-walls corroboration instead of silently demoting the wrong account. */
function validateBillingSlot(poolId, linkedId) {
  if (!linkedId) return { ok: false, reason: 'no-slot' };            // no link, or it resolves to no known account (poolCurrentFor readlinks it)
  try {
    // poolMembers() filters by `loggedIn`, which is a BOOLEAN over four
    // different credential states — 2.369.66 read that as "a separate
    // credentials leg is unsatisfiable". It is not: `loggedIn` is TRUE for a
    // login whose access token AND refresh token have both expired
    // (parseClaudeAuth only nulls the accessToken field), so that member stays
    // a candidate and a slot pointing at it validates. That is a satisfiable
    // gap and it is the one that lets dead-account readings look authorised —
    // hence the explicit state leg below, ONE implementation shared with the
    // panels and the migration (src/login-state.js).
    if (!accounts.isPoolMember(poolId, linkedId)) return { ok: false, reason: 'slot-not-a-member' }; // ONE login read, not every member's (prod-stall-202) — the same predicate as poolMembers(poolId).some(id)
    const st = memberLoginState(linkedId);
    if (st && !st.usable) return { ok: false, reason: 'slot-' + st.state }; // slot-wiped / slot-expired / slot-missing / slot-unreadable
  } catch { return { ok: false, reason: 'slot-unreadable' }; }
  return { ok: true, reason: null };
}
/** THE SLOT OF A PROCESS THAT HOLDS ITS MEMBER (r4, reproduced): the held
 *  member IS the credential this process speaks as — its app-server loaded the
 *  login at spawn and keeps it in memory — whether or not the pool still lists
 *  it (the user narrowed the members) and whether or not its file still holds a
 *  login (wiped / expired on disk: the process keeps the tokens it read). Asking
 *  `validateBillingSlot`'s membership leg about it answered `slot-not-a-member`,
 *  so the process's own wall was HELD (never written on the account that
 *  refused it) and the verdict read the empty member set as "no data". The
 *  stamp is authority for a wall exactly like a validated link: it names a
 *  known subscription of the pool's harness, and the rest is its own. */
function validateHeldSlot(poolId, heldId) {
  try {
    const m = heldId && accounts.get(heldId);
    if (!m || m.type === 'pooled') return { ok: false, reason: 'held-unknown-account' };
    const p = accounts.get(poolId);
    if (p && (m.backend || 'claude') !== (p.backend || 'claude')) return { ok: false, reason: 'held-other-harness' };
  } catch { return { ok: false, reason: 'slot-unreadable' }; }
  return { ok: true, reason: null };
}
/** The credential state of one CLAUDE account key (src/login-state.js — the
 *  shared reader; also what the panels and the migration read, one
 *  implementation).
 *  DELIBERATELY THE FILE, NOT THE ACCOUNT (2026-09-07 r2): the panels and the
 *  repair ask `accountLoginState`, which also counts a long-lived token — but
 *  this function answers "does the credential SLOT hold credentials", and a
 *  pooled session's CLI reads whatever the SYMLINK points at. An oat lives in
 *  accounts.json and is delivered as spawn ENV; re-pointing a link can never
 *  hand it to a running CLI, so for a slot the file is the whole answer.
 *  Making this one oat-aware would make a wiped member a valid switch target.
 *  null = "no opinion": a pseudo key ('__global__', 'host-…'),
 *  a codex account (its slot machinery does not exist — capsOf('codex')
 *  .hotSwitch is 'impossible', so there is no re-point to be wrong about), or
 *  an unreadable roster.
 *  MEMOIZED ON THE FILE, NOT ON A CLOCK: per-record producers must not re-read
 *  and re-parse on every reading, but a TIME box would keep answering "signed
 *  out" for N seconds after a re-login — and this answer gates switch targets
 *  and the panel's warning. The stat is the cheap half; keying on mtime+size
 *  makes a credential change visible on the very next call. */
const _loginStateMemo = new Map();
function memberLoginState(id) {
  if (!id || typeof id !== 'string' || !/^sub-/.test(id)) return null;
  let fp = null;
  try {
    if (!credsOf(accounts.get(id)?.backend)?.loginState) return null; // a harness whose login file states its lifetime
    fp = accounts.subCredsPath(id);
  } catch { return null; }
  let sig = 'none';
  try { const st = fs.statSync(fp); sig = `${st.mtimeMs}:${st.size}`; } catch { }
  const hit = _loginStateMemo.get(id);
  if (hit && hit.sig === sig) return hit.st;
  let st = null;
  try { st = loginState(fp, { backend: 'claude' }); } catch { st = null; }
  _loginStateMemo.set(id, { sig, st });
  if (_loginStateMemo.size > 256) _loginStateMemo.delete(_loginStateMemo.keys().next().value);
  return st;
}
/** THE credential state of one claude ACCOUNT — the file OR a valid long-lived
 *  token (B-211a). This is the reader for "can this identity serve a request
 *  right now", which is what the SPEND CEILING asks about a session that is
 *  already running.
 *
 *  NOT `memberLoginState` (r2, reproduced): that one answers for a credential
 *  SLOT, and it is deliberately oat-blind because re-pointing a symlink can
 *  never hand a token to a running CLI. Asking it about an ACCOUNT gives the
 *  wrong answer for an `oatOnly` subscription — a supported, spawnable
 *  configuration with NO credential file on disk (`resolveForSpawn` returns
 *  `{oatOnly:true, localEnv:{CLAUDE_CODE_OAUTH_TOKEN}}`) — which the file
 *  reader calls 'missing'/unusable. Every unattended producer was then refused
 *  on it FOREVER, with a reason ("cannot authorize a request right now") that
 *  is factually false about an account serving turns normally, and unlike the
 *  hour/day caps that refusal never expires.
 *  null = no opinion (a pseudo key, a codex account, an unreadable roster) —
 *  P6: ignorance is not a claim, and the authorizer treats null as 'unknown'. */
function accountCredentialState(id) {
  if (!id || typeof id !== 'string' || !/^sub-/.test(id)) return null;
  let fp = null, minted = null;
  try {
    const a = accounts.get(id);
    if (!a || !credsOf(a.backend)?.loginState) return null;
    fp = accounts.subCredsPath(id);
    minted = Number(a.oatMintedAt) || null;
  } catch { return null; }
  try { return accountLoginState(fp, { oatMintedAt: minted, backend: 'claude' }); } catch { return null; }
}
/** THE MEMBER A NON-HOT POOL SESSION'S PROCESS HOLDS (design-reset-credits
 *  r2, 2026-09-22 — reproduced on the real engine before it was fixed). A
 *  backend whose `capsOf(backend).hotSwitch` is not 'verified' reads its
 *  credentials ONCE, at spawn (codex: the app-server canonicalizes CODEX_HOME at
 *  startup and keeps the tokens in process memory — the 2026-08-24 experiment),
 *  so after a pool re-point the RUNNING process still speaks as the member it
 *  was spawned with until the cold restart lands (and on a headless instance
 *  that restart never comes). Resolving "the member this session bills" to the
 *  pool's CURRENT member in that window charged a stored reset credit spent on
 *  member A to member B (A's per-identity ceiling dodged, the last-credit floor
 *  unreachable), demoted the healthy member for the old one's wall and offered
 *  a button whose carrier could no longer be found. ws-create stamps the member
 *  at spawn (`_heldPoolMember`, persisted as session-meta `heldPoolMember`);
 *  a process spawned BEFORE the stamp existed is answered from the
 *  slot-transition ledger (the pool default at its `createdAt`, r3), else it is
 *  'unknown' (the auto rung refuses it by name). null = not held (a hot-capable
 *  pool, a non-pool session, a remote one, an unknown holder) and the caller
 *  keeps the link. The rule itself is accounts.poolMemberOfSession — gated on
 *  the caps row, never a harness id. */
function heldPoolMemberFor(session, poolId = null) {
  const r = poolMemberOfSessionFor(session, poolId);
  return r && r.held ? r.id : null;
}
/** The whole answer (accounts.poolMemberOfSession — ONE rule shared with the
 *  ledger's attribution and the billing badge in server.js): {id, held,
 *  origin: stamp|ledger|unknown|link}, or null when this is not the session's
 *  pool. A LEDGER answer (a process spawned before the stamp existed, r3) is
 *  memoized onto the session as its stamp AND PERSISTED into its session-meta
 *  (r4: a restart must read the same answer, never re-derive it), journaled
 *  once. An UNKNOWN answer is NOT memoized (r4, reproduced): one transiently
 *  unreadable ledger read at first resolution used to pin the process unknown
 *  for its whole life; the ledger is re-asked (a stat, cached rows) and the
 *  journal speaks once (`_heldPoolOrigin` 'unknown' is only that marker). */
function poolMemberOfSessionFor(session, poolId = null) {
  try {
    if (!session) return null;
    const pid = poolId || session._accountId;
    if (!pid || pid !== session._accountId) return null;
    const r = accounts.poolMemberOfSession(pid, session);
    if (r && r.origin === 'unknown' && !session._heldPoolOrigin) { session._heldPoolOrigin = 'unknown'; console.log(`[pool] ${session._webuiId}: no spawn stamp and no slot-transition row that names its start — which login this process holds is unknown; no credit is spent through it until it restarts`); }
    if (r && r.origin === 'ledger' && session._heldPoolMember !== r.id) {
      session._heldPoolMember = r.id; session._heldPoolOrigin = 'ledger';
      console.log(`[pool] ${session._webuiId}: no spawn stamp — the slot-transition ledger says this process started on ${nameOf(r.id)} (the pool default at ${new Date(Number(session.createdAt) || 0).toISOString()}); it holds that login until it restarts`);
      persistHeldStamp(session);
    }
    return r || null;
  } catch { return null; }
}
/** The ledger-derived held member, written into the session's meta the way ws-create
 *  writes the spawn stamp (`heldPoolMember`, + `heldPoolOrigin: 'ledger'`): the
 *  ledger answer is final for the process, and a restart restores it instead of
 *  asking a ledger that may have been trimmed, rotated or unreadable by then. */
function persistHeldStamp(session) {
  try {
    if (!session || !session.sockName) return;
    const prev = sessionMetaStore.readSessionMeta?.(session.sockName);
    if (!prev || typeof prev !== 'object' || !Object.keys(prev).length) return; // the store is not wired, or this session has no meta (never create one here) — memory only
    if (prev.heldPoolMember === session._heldPoolMember) return;
    sessionMetaStore.writeSessionMeta?.(session.sockName, { ...prev, heldPoolMember: session._heldPoolMember, heldPoolOrigin: session._heldPoolOrigin || null });
  } catch (e) { console.warn('[pool] held stamp not persisted:', e.message); }
}
/** A non-hot pool session whose held member NOTHING can name (no stamp, no
 *  ledger row before it started — r3): money never moves on its behalf. */
function heldPoolUnknown(session) {
  const r = poolMemberOfSessionFor(session);
  return !!(r && r.origin === 'unknown');
}
/** THE member a pooled session's requests are BILLED to: its link, validated
 *  against the credential slot. Every blocking decision uses this — the wall's
 *  demotion target, the verdict order, the per-session switch's `currentId`,
 *  both probe targets and the identity the loop breaker keys fires on.
 *  (Its `observedId`/`divergent` corroboration fields were retired 2026-09-30:
 *  the OTel org is a machine-wide label, never a member — lane-hot-switch.) */
function sessionBillingMember(session, poolId) {
  // A NON-HOT POOL'S PROCESS BILLS THE MEMBER IT WAS SPAWNED WITH, whatever the
  // link says now (reset credits r2, reproduced): see heldPoolMemberFor.
  const held = heldPoolMemberFor(session, poolId);
  if (held) {
    const hs = validateHeldSlot(poolId, held);
    return { id: held, linkedId: held, slotOk: hs.ok, slotReason: hs.reason, held: true };
  }
  let linkedId = null;
  try { linkedId = accounts.poolCurrentFor(poolId, session?._webuiId || null) || null; } catch { }
  const slot = validateBillingSlot(poolId, linkedId);
  return { id: linkedId, linkedId, slotOk: slot.ok, slotReason: slot.reason };
}
/** THE identity a REJECTION belongs to, resolved NOW: the credential slot this
 *  session's CLI reads, and whether that slot VALIDATED. Pooled ⇒ the validated
 *  link member; otherwise the session's own account/host key (fixed at spawn,
 *  so trivially its own slot). Deliberately NOT orgVerifiedKey — see the header
 *  note. `slotOk` travels ON THE SIGNAL because it is only true AT THE MOMENT
 *  THE REJECTION ARRIVES: by the time the turn ends the pool has usually
 *  re-pointed the link off the account that just refused us.
 *  A rejection RECORD does not call this directly — it calls rejectionSlotFor
 *  (turn-pinned) below; this stays the fresh reading for "where would a fire
 *  land right now" (fireIdentityFor) and for the demotion's fallback. */
function wallSlotFor(session) {
  try {
    const poolId = session?._accountId || null;
    const a = poolId && accounts.get(poolId);
    if (a && a.type === 'pooled') {
      const b = sessionBillingMember(session, poolId);
      return { key: b.id || poolId, slotOk: !!b.slotOk && !!b.id, slotReason: b.slotReason };
    }
  } catch { }
  const key = usageCacheKeyFor(session);
  return { key, slotOk: !!key, slotReason: null }; // no pool = one fixed creds dir for the whole session
}
function wallKeyFor(session) { return wallSlotFor(session).key; }
/** THE identity a rejection RECORD is attributed to — `wallSlotFor` PINNED FOR
 *  THE TURN (2026-09-07 r3; reproduced on the real engine before it was
 *  fixed).
 *  ONE rejection reaches us as SEVERAL records: the CLI's `rate_limit_event`,
 *  the assistant limit banner, and a banner inside a task_notification (three
 *  independent producers — src/server/stdout/claude-stream-json.js :323/:328/
 *  :563 — and noteWallSignal's own comment already says a banner + its rejected
 *  event are ONE wall). The FIRST of them re-points the link BY ITSELF: every
 *  producer calls maybePoolAutoSwitch the moment it marks the cache. Resolving
 *  the slot per RECORD therefore keyed the second one to the member the pool
 *  had just moved TO — and the wall machine then demoted that healthy member
 *  with `credential slot` authority and recorded it as having rejected this
 *  conversation: the exact misattribution this whole change exists to remove
 *  (measured, both producer orders: after a fresh reading showing the moved-to
 *  member 95% healthy the session waited ~2h instead of continuing in ~60s).
 *  The pin is THE TURN, not a time window, because that is what defines it: a
 *  pool re-point does not reach a RUNNING CLI (2.361.0 — a process kept billing
 *  its original org for 35 minutes across four switches), so every rejection
 *  inside one turn came from the credentials the slot named when that turn's
 *  first rejection arrived. `_turnWallSigs` is cleared by noteTurnEnd, so the
 *  pin is exactly one turn wide; a turn whose end record never arrives degrades
 *  exactly the way the wall machine already does (the next turn's real work
 *  classifies it NORMAL and clears the signals).
 *  `slotOk` rides the pin for the same reason it rides the signal: it is only
 *  true AT THE MOMENT THE REJECTION ARRIVED. */
function rejectionSlotFor(session) {
  try {
    const first = ((session && session._turnWallSigs) || []).find((s) => s && s.key);
    if (first) return { key: first.key, slotOk: !!first.slot, slotReason: 'turn-pinned' };
  } catch { }
  return wallSlotFor(session);
}
/** THE identity a quota READING is attributed to — ONE function for every
 *  value producer (rate_limit_event readings, limit-banner marks, the codex
 *  rate_limits_updated snapshot, and any future one). It is `wallSlotFor`'s
 *  twin and deliberately shares its body: a reading and a rejection are facts
 *  about the SAME thing, the credential slot the CLI is reading, and the
 *  entire 2026-09-07 incident is what happens when the two are resolved
 *  differently (the rejection landed on the slot while the numbers landed on
 *  the spawn-time org, so the account that was actually being burned looked
 *  healthy forever and a member wiped five days earlier kept "reporting").
 *
 *  PINNED FOR THE TURN, refreshed at the turn boundary, for the same reason
 *  rejectionSlotFor is: every producer calls maybePoolAutoSwitch the moment it
 *  writes, so one turn's ~20 readings would otherwise be split across the
 *  members our own re-points moved to WHILE they were arriving — numbers
 *  credited to an account that had not served a single request of that turn.
 *  A re-point reaches the running CLI on its NEXT request (mtime-gated
 *  re-read), never the reading already in flight; noteTurnEnd clears the pin,
 *  so a switch is honoured exactly one turn later, which is when it is true.
 *
 *  `slotOk` rides along (same meaning as on a rejection: the link resolved to
 *  a validated, credential-holding member of this pool AT THIS MOMENT). It is
 *  never a veto here — a reading with an unvalidated slot is still filed on
 *  the slot, because the alternative is filing it somewhere we can prove is
 *  wrong; it is carried so the panels can say how sure we are.
 *
 *  SHARED DEPENDENCY, stated so nobody has to rediscover it: both pins live
 *  exactly as long as `noteTurnEnd` says a turn does (claude `result` /
 *  codex task_complete|task_failed / the ACP turn end — one call site per
 *  stdout consumer). A turn whose end record never arrives holds its pin, and
 *  a reading pin held that way keeps filing on a member the pool may have
 *  left. That is the SAME degradation the rejection pin already accepts, and
 *  it is deliberately not bounded differently: giving the twins different
 *  lifetimes would re-create the two-answers-one-question shape this change
 *  exists to remove, and a time box would be a cliff (2.369.63's lesson). If
 *  this ever needs a belt, it belongs on noteTurnEnd — one bound, both pins. */
function readingSlotFor(session, at = Date.now(), opts = {}) {
  try {
    const pin = session && session._turnReadingSlot;
    if (pin && pin.key) return { key: pin.key, slotOk: !!pin.slotOk, slotReason: 'turn-pinned', at: pin.at };
  } catch { }
  const fresh = wallSlotFor(session);
  let key = fresh.key, slotOk = !!fresh.slotOk, slotReason = fresh.slotReason, shadow = null;
  // ① THE LAG SHADOW composes with the pin, and it is applied BEFORE the pin is
  // set, so a pin created by a shadowed reading pins the PREVIOUS slot — the
  // whole turn then bills where its requests actually went.
  if (opts.window && key) {
    shadow = lagShadowFor(session, key, opts.window, opts.fingerprint || null, at);
    if (shadow && shadow.shadowed) {
      key = shadow.key;
      slotReason = 'lag-shadow:' + shadow.why;
      try { slotOk = !!validateBillingSlot(session?._accountId || null, key).ok; } catch { slotOk = false; }
    }
  }
  const out = { key, slotOk, slotReason, at, ...(shadow && shadow.shadowed ? { shadowed: true } : {}) };
  try { if (session && out.key) session._turnReadingSlot = { key: out.key, slotOk: out.slotOk, at }; } catch { }
  return out;
}
/** The evidence `decideLagShadow` needs, gathered from the two stores that
 *  hold it: the transition ledger (which slot did this conversation LEAVE, and
 *  how long ago) and the established windows. `_lastReadingFp` is the server's
 *  twin of the statusline's `.slot-<id>` sidecar — the last window fingerprint
 *  we saw under a given key, which is the only evidence left when two members
 *  share a weekly phase or neither window is known. */
/** The re-point that could still explain a reading of this conversation at
 *  `at` — the ledger row inside the shadow horizon that decides for THIS
 *  session, or null. Shared by the lag shadow (which then reads the windows)
 *  and by the ⟳ route's eligibility test (which only needs to know a shadow is
 *  open). */
function recentRepointRow(session, at = Date.now()) { return lastRepointRow(session, { at, minAt: at - readingLag.SHADOW_MS }); }
/** The newest re-point of THIS conversation at or before `at` and not older
 *  than `minAt`, or null. The witness eligibility test asks it with `minAt` =
 *  the turn pin's birth (a pin older than a re-point files a turn's readings
 *  on the member the CLI has already left — correct for the cache, never a
 *  witness). */
function lastRepointRow(session, { at = Date.now(), minAt = at - readingLag.SHADOW_MS } = {}) {
  try {
    const poolId = session?._accountId || null;
    if (!poolId || accounts.get(poolId)?.type !== 'pooled') return null;
    const sid = session?._webuiId || null;
    // WHICH ROWS DECIDE FOR THIS CONVERSATION — the ledger's own contract: a
    // session that has its own link is decided by its OWN rows and the pool
    // default is irrelevant to it; one without a link is decided by the
    // default. Deciding on "whichever row is newest" would let another
    // session's pool-wide move explain a reading it had nothing to do with.
    const hasOwnLink = (() => { try { fs.lstatSync(accounts.sessionPoolLinkPath(poolId, sid)); return true; } catch { return false; } })();
    // BOUNDED SCAN: rows are ascending, so walking back and stopping at the
    // horizon (the shadow's 10 minutes, or the turn pin's age) is O(that
    // span), not O(the whole 20k ledger) on every reading — and a row older
    // than the horizon could not shadow anyway.
    const rows = slotTransitions.all();
    let row = null;
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i];
      if (r.at > at) continue;
      if (r.at < minAt) break;
      if (poolId && r.poolId && r.poolId !== poolId) continue;
      if (hasOwnLink ? (sid && r.sessionId === sid) : !r.sessionId) { row = r; break; }
    }
    if (!row || !row.from || row.from === row.to) return null;
    return row;
  } catch { return null; }
}
/** Is this session still inside a re-point's lag shadow — a link move within
 *  the horizon that no reading has yet ended? `{from, to, at, ageMs}` or null.
 *  A positive answer means the CLI may still be answering with the PREVIOUS
 *  member's token, so it is not asked for a panel (B-855a ③). */
function inLagShadow(session, at = Date.now()) {
  const row = recentRepointRow(session, at);
  if (!row) return null;
  if (session && session._readingShadowEndedAt === row.at) return null;
  return { from: row.from, to: row.to, at: row.at, ageMs: at - row.at };
}
function lagShadowFor(session, freshKey, readingWindow, readingFingerprint, at) {
  try {
    const sid = session?._webuiId || null;
    const row = recentRepointRow(session, at);
    if (!row) return null;
    const windows = establishedWindows();
    const last = session._lastReadingFp && session._lastReadingFp.key === row.from ? session._lastReadingFp.fp : null;
    const d = readingLag.decideLagShadow({
      prevKey: row.from, prevWindow: windows[row.from] || null,
      newKey: freshKey, newWindow: windows[freshKey] || null,
      readingWindow, readingFingerprint, prevFingerprint: last,
      repointAgeMs: at - row.at,
    });
    // THE FIRST READING WHOSE FINGERPRINT DIFFERS ENDS THE SHADOW, and it stays
    // ended: once the new credentials have demonstrably answered once, a later
    // in-flight straggler is not evidence that they have not.
    if (session._readingShadowEndedAt === row.at) return { key: freshKey, shadowed: false, why: 'shadow-ended' };
    if (!d.shadowed) session._readingShadowEndedAt = row.at;
    // A SHADOW MOVES MONEY, SO IT SAYS SO. One line per session per (target →
    // verdict) transition, the same floor the guard uses: the incident's whole
    // diagnosis was "which account did this number go to, and why", and the
    // journal had nothing to say about the write that caused it.
    if (d.shadowed) {
      noteWindowVerdict(sid || '-', freshKey, 'shadow:' + row.from, () => console.log(
        `[usage] reading arrived ${Math.round((at - row.at) / 1000)}s after the link moved to ${nameOf(freshKey)}, carrying ${nameOf(row.from)}'s window — filed on ${nameOf(row.from)} (${d.why})`));
      global.__vsEvent?.('usage-reading-lag-shadow', `${freshKey}→${row.from}:${d.why}`);
    }
    return d;
  } catch (e) { console.warn('[usage] lag-shadow check failed (keeping the slot):', e.message); return null; }
}
/** The identity + label a CONTINUE fired into this session would land on —
 *  auto-resume's `fireIdentity` dep. Deliberately wallKeyFor: the breaker's
 *  "the fire onto X failed" and the wall machine's "X rejected this session"
 *  must name the same X, or the breaker quarantines an account nothing ever
 *  rejects. */
function fireIdentityFor(session) {
  try {
    const key = wallKeyFor(session);
    if (!key) return null;
    return { key, name: nameOf(key) };
  } catch { return null; }
}
/** "This member rejected THIS session at T" — written where a wall resolves to
 *  a member, read by the verdict (it cannot answer `usable` through such a
 *  member) and by the per-session switch (it cannot pick one). Session-scoped
 *  and self-expiring: a pool-wide fact would be the 2.368.34 misattribution
 *  class again. */
function noteSessionWall(sid, memberId, now = Date.now()) {
  if (!sid || !memberId) return;
  let m = _sessionWalls.get(sid);
  if (!m) { m = new Map(); _sessionWalls.set(sid, m); }
  m.set(memberId, now);
  for (const [k, t] of m) if (now - t > SESSION_WALL_MS) m.delete(k);
  if (_sessionWalls.size > 512) { const k = _sessionWalls.keys().next().value; _sessionWalls.delete(k); }
}
function sessionWalledMembers(sid, now = Date.now()) {
  const out = new Set();
  const m = sid && _sessionWalls.get(sid);
  if (m) for (const [k, t] of m) if (now - t < SESSION_WALL_MS) out.add(k);
  // the loop breaker's own memory (a continue we fired that came back
  // rejected) is the same fact seen from the other side — one union, so a
  // restart-surviving failure record still steers the next target choice
  try { for (const k of getAutoResume()?.recentFireFailures?.(sid) || []) out.add(k); } catch { }
  return out;
}

/** Walled turns seen on an account (any session) inside WALL_RING_MS, counted
 *  across its identity group. */
function wallCount(key, now = Date.now()) {
  let n = 0;
  const ids = new Set([key]);
  try { for (const id of usageIdentityAccountIds(key)) ids.add(id); } catch { }
  for (const id of ids) for (const e of _wallRing.get(id) || []) if (now - e.at < WALL_RING_MS) n++;
  return n;
}
// ── TURN-GRANULAR WALL MACHINE (2.369.0, owner-designed replacement for the
// .27-.34 patch pile) ─────────────────────────────────────────────────────
// Design (docs/design-wall-machine.md): wall SIGNALS (rejected events, the
// banner as a BOOLEAN — never a data source) accumulate on the current turn;
// the RESULT record classifies the turn (walled = signals with no real work
// after the last one; a turn the pool rescued mid-way classifies NORMAL); a
// normally-completed turn is sufficient proof the session is not blocked.
// Times come from ONE place: the account system's quotaVerdict (model-
// projected, estimator-overlaid, 5h<10%/weekly<5%). A missing blockedUntil
// is filled by PROBING the owner-approved /usage panel channel — never by
// parsing text, never by guessing.

// The account system's usability answer for a scope (pool id OR cache key),
// model-projected. Pool = any member usable / min over members' blockedUntil.
function quotaVerdictFor(scope, { model, session = null } = {}) {
  const nowSec = Math.floor(Date.now() / 1000);
  // THE PROJECTION FAMILY, not the stated model (2026-09-13 r2): with no
  // session this is exactly `familyOfModel(model)` — byte-identical for every
  // session-less caller — and with one it drops the projection while a
  // classifier reroute is standing, because then two caps can refuse the turn.
  // This site is the one that authorises money: `onWalledTurn` arms from it,
  // and `beforeAutoResumeFire` spends on it.
  const fam = projectionFamilyFor(session, model);
  const read = poolReadCache(null); // generic estimator-overlaid identity reader
  const proj = (c) => { try { return fam ? projectCacheForFamily(c, fam) : c; } catch { return c; } };
  const a = accounts.get(scope);
  if (a && a.type === 'pooled') {
    // A PROCESS THAT HOLDS ITS MEMBER CAN ONLY BE CONTINUED BY THAT MEMBER
    // (reset credits r3, reproduced on the real engine + the real auto-resume):
    // a non-hot pool's process keeps the login it was spawned with until its
    // cold restart lands, so "another member is usable" is not a way out for a
    // CONTINUE into it — the 45 s near-arm said "switched to a usable account
    // (B)", the pre-fire gate agreed, and the billed continue went into the
    // process still holding walled A, re-fired every quarantine window. Every
    // caller of this verdict decides a fire (the wall's arm, the probe ladder,
    // the pre-fire gate), so for such a session the verdict IS the held
    // member's; the other members help through the cold restart
    // (requestHeldRestart), never through a continue.
    // THE HELD MEMBER IS JUDGED DIRECTLY (r4, reproduced): never through
    // `poolMembers`, which lists only the pool's CURRENT logged-in members — a
    // held member the user removed from the pool, or whose login file was wiped
    // (the process keeps its in-memory tokens), left an EMPTY set, the verdict
    // said `usable: null` ("pool has no members") and the pre-fire gate let null
    // through: a billed continue into the process still holding walled A, its
    // own spent probe ignored. Its cache and its login state are read below like
    // any member's; a held member nothing can read is `usable: false`.
    // …AND A HELD MEMBER THE POOL NO LONGER LISTS IS NEVER CONTINUED (r5): the
    // login reader is VACUOUS for codex (its descriptor declares no
    // creds.loginState and memberLoginState reads claude creds only — codex
    // answers 'unknown', which never refuses), so a member the user narrowed out
    // of the pool or whose login file was wiped read healthy again at its reset
    // and got ONE automatic continue into the process still holding it. Not
    // listed (poolMembers = the pool's logged-in members) ⇒ usable:false with no
    // blockedUntil (no timer heals it — its cold restart onto a listed member,
    // or the user re-adding it, does), exactly like a dead login.
    const heldId = session ? heldPoolMemberFor(session, scope) : null;
    const heldRec = heldId ? (() => { try { return accounts.get(heldId) || null; } catch { return null; } })() : null;
    const members = heldId ? (heldRec ? [{ id: heldId, name: heldRec.name || heldId }] : []) : (accounts.poolMembers(scope) || []);
    // The member whose credentials the CLI reads is judged FIRST, so `via`
    // names the account the session is actually billing whenever that one is
    // usable; the verdict carries on/linked/slotOk for the
    // journal + tests. (Was "observed over linked" under B-2c9b plan B until
    // 2026-09-07 — the observation names the SPAWN-time identity, so judging
    // it first is how the loop kept finding a "usable" member to re-fire at.)
    const cm = session ? sessionBillingMember(session, scope) : null;
    const ordered = cm?.id ? [...members.filter((m) => m.id === cm.id), ...members.filter((m) => m.id !== cm.id)] : members;
    // A member that answered THIS session's turn with a limit rejection is
    // dead-until-reset for this session's verdicts, whatever its cache says
    // (2026-09-07: the loop's every cycle re-read a "healthy" member that had
    // just rejected us). Its own blockedUntil still counts toward the wait.
    // A member whose LOGIN SESSION is over cannot serve a turn however much
    // quota its cache shows — and unlike a quota wall this one does NOT heal
    // on a timer, so it contributes NO blockedUntil: only the user's re-login
    // unblocks it (2026-09-07 login expiry). Judged before the wall override
    // because it is the more fundamental refusal AND the actionable one.
    let heldListed = true;
    if (heldId) { try { heldListed = (accounts.poolMembers(scope) || []).some((m) => m.id === heldId); } catch { heldListed = false; } }
    const readLogin = poolReadLogin();
    const walled = session ? sessionWalledMembers(session._webuiId) : new Set();
    const verdicts = ordered.map((m) => {
      const v = quotaVerdict(proj(read(m.id)), nowSec);
      const li = readLogin(m.id);
      if (!loginUsable(li)) return { id: m.id, name: m.name || m.id, v: { ...v, usable: false, blockedUntil: 0, reason: `${loginBucketLabel(li)} — re-login needed` } };
      if (walled.has(m.id) && v.usable !== false) {
        return { id: m.id, name: m.name || m.id, v: { ...v, usable: false, reason: `rejected this conversation (${v.reason})` } };
      }
      if (heldId && m.id === heldId && !heldListed) return { id: m.id, name: m.name || m.id, v: { ...v, usable: false, blockedUntil: 0, reason: `no longer a logged-in member of this pool (narrowed out, or its login file is gone) — it waits for its cold restart` } };
      return { id: m.id, name: m.name || m.id, v };
    });
    const ctx = cm ? { on: cm.id, linked: cm.linkedId, slotOk: cm.slotOk, ...(heldId ? { held: heldId } : {}) } : {};
    const note = heldId ? ` — this process holds ${nameOf(heldId)}'s login until it restarts` : '';
    // a HELD verdict fails CLOSED: its process can be continued by nothing else
    if (!verdicts.length) return heldId
      ? { usable: false, known: false, blockedUntil: 0, reason: `${nameOf(heldId)} (the login this process holds) cannot be read${note}`, ...ctx }
      : { usable: null, known: false, blockedUntil: 0, reason: 'pool has no members', ...ctx };
    const ok = verdicts.find((x) => x.v.usable === true);
    if (ok) return { usable: true, known: true, blockedUntil: 0, via: ok.name, viaId: ok.id, reason: `${ok.name} usable (${ok.v.reason})${note}`, ...ctx };
    const untils = verdicts.map((x) => x.v.blockedUntil).filter(Boolean);
    const blockedUntil = untils.length ? Math.min(...untils) : 0; // soonest-usable member; 0 = some member unknowable → probe
    // B-73fe (2026-09-17, owner "7am 重置却提示 12pm"): the blocked verdict NAMES
    // its wait — `soonest` = the member whose blockedUntil IS the min and the
    // bucket that set it (Member L / Fable @ 12pm), `rejector` = the member that
    // rejected this session with every dead bucket it holds (PandyMax: 5h @
    // 7am AND Fable 2 % < 5 % @ 9/20 — the reason its own 7am is not the
    // target). Reporting only: no decision reads these; the arm card and the
    // status-bar chip say them. Milliseconds, like blockedUntil.
    const soon = blockedUntil ? verdicts.find((x) => x.v.blockedUntil === blockedUntil) : null;
    const rej = verdicts.find((x) => walled.has(x.id)) || null;
    return {
      usable: false, known: true,
      blockedUntil,
      soonest: soon ? { id: soon.id, name: soon.name, bucket: soon.v.until ? { label: soon.v.until.label, resetsAt: soon.v.until.resetsAt * 1000 } : null } : null,
      rejector: rej ? { id: rej.id, name: rej.name, deadBuckets: (rej.v.deadBuckets || []).map((b) => ({ ...b, resetsAt: b.resetsAt ? b.resetsAt * 1000 : 0 })) } : null,
      reason: verdicts.map((x) => `${x.name}: ${x.v.reason}`).join(' | ') + note,
      ...ctx,
    };
  }
  return quotaVerdict(proj(read(scope)), nowSec);
}

/** PURE (B-73fe). THE CAUSE an arm carries so its card can say what the
 *  instant it names IS, and why the rejecting member's own earlier reset is
 *  not the target. From a BLOCKED verdict: a pool verdict yields
 *  {scope:'pool', floorRule, soonest:{id,name,bucket:{label,resetsAt ms}},
 *  rejector:{id,name, ownWall:{label,resetsAt ms} = the bucket the rejection
 *  named (the demotion's buckets, else the signals' bucket + reset), floor:[…]
 *  = the rejector's OTHER dead buckets — the ones that keep it dead past its
 *  own wall}}; an unpooled verdict yields {scope:'account', floorRule, until}.
 *  null when the verdict has no target to name (the arm then inherits or
 *  stays cause-less and the card keeps its old sentence). Words live in
 *  auto-resume.js armNoticeFor; this is structure only. */
function armCauseFor(v, demoted, armWall, evResetMs) {
  if (!v || v.usable !== false) return null;
  const floorRule = { fiveHour: VERDICT_THRESH.fiveHour.hot, weekly: VERDICT_THRESH.weekly.hot };
  if (v.soonest === undefined) {
    return { scope: 'account', floorRule, until: v.until ? { label: v.until.label, resetsAt: Number(v.until.resetsAt) * 1000 } : null };
  }
  if (!v.soonest) return null;
  let rejector = null;
  if (v.rejector) {
    const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();
    const dead = Array.isArray(v.rejector.deadBuckets) ? v.rejector.deadBuckets : [];
    const own = (demoted && Array.isArray(demoted.buckets) ? demoted.buckets : []).filter((b) => b && b.label).sort((a, b) => (b.until || 0) - (a.until || 0))[0] || null;
    let ownWall = own ? { label: own.label, resetsAt: Number(own.until) || 0 }
      : armWall && armWall.bucket ? { label: armWall.bucket === 'scoped' ? (armWall.scopedName || 'model cap') : (BUCKET_LABEL[armWall.bucket] || armWall.bucket), resetsAt: Number(evResetMs) || 0 } : null;
    if (ownWall) {
      const m = dead.find((b) => same(b.label, ownWall.label));
      if (m) ownWall = { label: m.label, resetsAt: ownWall.resetsAt || m.resetsAt || 0 };
    }
    rejector = { id: v.rejector.id, name: v.rejector.name, ownWall, floor: dead.filter((b) => !(ownWall && same(b.label, ownWall.label))) };
  }
  return { scope: 'pool', floorRule, soonest: v.soonest, rejector };
}

/** The identity whose quota is BLOCKING this session (the verdict's scope):
 *  the pool, or — for an unpooled session — its own credential slot. Not
 *  orgVerifiedKey: routing the VERDICT to the spawn-time org means asking a
 *  different account whether this session may spend (the pooled half of that
 *  mistake is what produced the 2026-09-07 fire loop). */
function _wallScope(session) {
  const a = session._accountId && accounts.get(session._accountId);
  if (a && a.type === 'pooled') return session._accountId;
  return wallKeyFor(session);
}

/** A wall SIGNAL landed on the session's current turn (rejected event /
 *  banner boolean / codex typed exhaustion). No transition yet — the turn's
 *  RESULT decides. */
function noteWallOnAccount(key, sid, now = Date.now()) {
  const ring = (_wallRing.get(key) || []).filter((e) => now - e.at < WALL_RING_MS);
  ring.push({ at: now, sid: sid || null });
  _wallRing.set(key, ring.slice(-WALL_RING_MAX));
}
function noteWallSignal(session, sig = {}) {
  const key = sig.key ? String(sig.key) : null; // the cache key the signal's mark landed on (org-verified at signal time)
  const sigs = (session._turnWallSigs = session._turnWallSigs || []);
  // the per-account ring counts WALLED TURNS, not records: one turn's banner
  // + its rejected event are ONE wall (a single turn must not satisfy the
  // ≥2-walls guard by itself)
  // …but never a wall this turn's own record REFUTED for that key (lane-hot-
  // switch): the ring is the ≥2-walls corroboration OTHER conversations lean
  // on, and a wall whose window proved it is not this account's is none of its.
  const refutedKey = !!(key && session._turnWallRefuted && session._turnWallRefuted.from === key);
  if (key && !refutedKey && !sigs.some((s) => s.key === key)) noteWallOnAccount(key, session._webuiId);
  // THE LIMIT LANE (2026-09-08): which of the harness's windows this wall is
  // about — the harness's own `snapshot.limitId`, null when it has one lane
  // (claude). The armed wait carries it so the fresh-window edge can tell a
  // reading about THIS wall from a reading about a sibling lane: a codex login
  // reports `codex` and `codex_bengalfox` minute by minute on the same account,
  // and the spark lane read 0 % for the whole 32 h the plan lane was spent.
  // `provisional` (2026-09-13) = this signal names the UNSCOPED weekly lane only
  // because that is the only lane claude's `rate_limit_event` vocabulary has for a
  // model cap — the lane is decided later, by the banner or by the evidence rule
  // (see resolveTurnLane below), and the entry is REWRITTEN in place.
  sigs.push({ at: Date.now(), resetsAtMs: Number(sig.resetsAtMs) || 0, bucket: sig.bucket || null, scopedName: sig.scopedName || null, key, slot: !!sig.slot, lane: sig.lane || null, provisional: !!sig.provisional });
  session._turnWorkAfterSig = 0;
}
// ── A LATE RECORD IS NOT A LIVE FACT (lane-hot-switch, 2026-09-30) ───────────
// THE INCIDENT (src/record-lateness.js has the whole story): a bridge dead for
// three hours released its backlog in three seconds after a local re-attach,
// and every wall, reading and turn end in it was taken as NOW — a 12:15 Fable
// rejection of one member was charged to the member the link held at 15:05,
// the pool moved ten conversations onto a spent member, and every message
// answered "session limit".
// THE RULE: every record of BOTH feeds (the parse and the device stream) is
// shown to `noteStreamRecord` first; the three live-fact consumers — the
// `rate_limit_event` capture, the limit banner, the turn end — and the live
// odometer ask `gateLiveFact` / `recordIsLate`. A record the CLI stamped more
// than the bound ago (or an unstamped one inheriting a late stamp) is COUNTED
// and journalled once per backlog, never acted on: a reading describes a
// window as it was, a wall a link that has since moved, a turn end work that
// ended hours ago. An unstamped record with no stamped neighbour behind it asks
// the stamped record AHEAD of it in the same chunk (`session._peekStamp`, set
// by the parse: a rejected turn emits its `rate_limit_event` a few ms before
// its stamped error record), and runs as live when there is none — exactly the
// behaviour before this rule, so a harness that stamps nothing is unchanged.
const recordLateness = require('../record-lateness.js');
function noteStreamRecord(session, msg) {
  if (!session || !msg || typeof msg !== 'object') return;
  const now = Date.now();
  const remote = !!session.host;
  const o = recordLateness.observe(session._recordClock, msg, now, { remote });
  if (!o.stamped) return;
  session._recordClock = o.clock;
  // A SYSTEMATIC OFFSET IS A CLOCK, NOT A BACKLOG (lane reset-path verify r6, reproduced): a CLI whose machine's clock
  // runs behind this server's stamped every record late by the same amount, and every reading / wall / ⟳ of that
  // session was refused for good as "a backlog record". The PURE rule declares the offset from the run's SHAPE
  // (record-lateness.js: ≥ 3 late records over ≥ 60 s of arrivals, their delays within 10 s) and judges against it
  // from then on; said once, and once more when the clock is corrected
  if (o.skew && o.skew.corrected) console.log(`[stream] ${session._webuiId || '?'}: the CLI's clock offset ended (records now ${o.skew.skewMs ? recordLateness.lateWords(o.skew.skewMs) + ' behind' : 'in step with this clock'}) — judged against it from here`);
  else if (o.skew) {
    console.log(`[stream] ${session._webuiId || '?'}: records stamped ${recordLateness.lateWords(o.skew.skewMs)} behind this clock for ${Math.round(o.skew.spanMs / 1000)} s (${o.skew.n} records, steady) — a clock offset on the CLI's machine, not a backlog; its readings and walls are judged against that offset from here`);
    global.__vsEvent?.('stream-clock-skew', `${Math.round(o.skew.skewMs / 60e3)}m`);
    replayHeldLate(session); // the first minute's facts, each through its own gate against the offset (verify r7 ④)
    session._recordClock = o.clock; // a replayed codex record re-enters noteStreamRecord; the declaring record's clock stands
  }
  // a live record ENDS the burst only when it ended the run (verify r8 ⑤: a record just under the bound at the run's
  // level extends the run — the held facts of that level stay held for its declaration) — and never from INSIDE a replay
  // (verify r8 ⑥, reproduced: a replayed codex record re-enters here live by the offset and closed the burst as "backlog
  // over" halfway through the replay — the declaration's own close, with every replay's count, is the one that ends it)
  if (recordLateness.verdictOfClock(o.clock, { remote }).verdict === 'live' && !(o.clock && o.clock.run) && !REPLAYING_HELD.has(session)) endLateBurst(session, o.skew && !o.skew.corrected ? 'declaration' : 'live');
}
const REPLAYING_HELD = new WeakSet(); // the sessions whose held ring is being replayed right now (a re-entrant record never closes the burst)
function liveFactVerdict(session, msg) {
  const now = Date.now();
  const remote = !!(session && session.host);
  const v = recordLateness.judge(session && session._recordClock, msg, now, { remote });
  if (v.verdict !== 'unknown') return v;
  // look AHEAD in the parse's buffer for the next stamped record (never a timer)
  let ahead = null;
  try { ahead = typeof session._peekStamp === 'function' ? session._peekStamp() : null; } catch { ahead = null; }
  if (ahead != null && Number.isFinite(ahead)) {
    const w = recordLateness.verdictOfClock({ stampAt: ahead, arrivedAt: now, delayMs: now - ahead, skewMs: (session && session._recordClock && session._recordClock.skewMs) || 0 }, { remote }); // the stream's declared offset holds for the look-ahead too
    return { ...w, by: 'next-stamp' };
  }
  return { verdict: 'live', lateMs: null, by: 'no-stamp' };
}
/** Is this record a backlog record? (the odometer's question; never throws) */
function recordIsLate(session, msg) {
  try { return !!msg && liveFactVerdict(session, msg).verdict === 'late'; } catch { return false; }
}
/** Run `run` only when `msg` is a live fact; a late one is counted instead. */
function gateLiveFact(session, msg, what, run) {
  if (!session || !msg) return run();
  let v = null;
  try { v = liveFactVerdict(session, msg); } catch { v = null; }
  if (!v || v.verdict !== 'late') return run();
  noteLateFact(session, what, v, () => gateLiveFact(session, msg, what, run)); // held while the stream has no declared offset: re-judged at the declaration (verify r7 ④)
  return undefined;
}
// THE FIRST MINUTE OF AN OFFSET STREAM IS HELD, NOT DROPPED (lane reset-path verify r7 ④, reproduced on the real engine):
// a skewed codex stream whose FIRST record was the wall dropped it for good — no arm, no switch, said only as "a stalled
// bridge's backlog" — and the declaration a minute later (readings, ⟳ presses) replayed nothing; only the NEXT wall armed.
// A late fact gated while the stream has NO declared offset is held with its own replay (bounded: HELD_LATE_MAX newest),
// re-judged at the declaration (`replayHeldLate`: taken when its delay minus the offset is within the bound, counted as
// a backlog on the offset stream otherwise) and discarded when a LIVE record ends the burst (it WAS a backlog). NOT
// held: the turn end and the live odometer (a backlog's spend is the ledger scan's to book, by time; the next turn end comes).
const HELD_LATE_MAX = 32;
// THE RING KEEPS WALLS (lane reset-path verify r8 ④, reproduced on the real engine): a skewed stream whose first record
// was the wall, followed by more than HELD_LATE_MAX readings inside the first minute, pushed the wall out of the ring and
// the declaration replayed readings only — r7 ④'s outcome by a fuller ring. When the ring is full the oldest READING
// goes first; a wall is dropped only when the ring is all walls. Every drop is counted on the burst and SAID at its close.
const HELD_WALL_KINDS = Object.freeze(['codex wall', 'limit banner']);
const kindsText = (m) => Object.entries(m).map(([k, n]) => `${n} ${k}`).join(', ');
// THE OWNER MUST KNOW A STOP HAPPENED (lane reset-path verify r8 ⑥): a late WALL is counted, never acted on — if the
// conversation stays stopped at it, auto-resume will not continue it from that record and nothing else says so (a burst
// that ends in a wall with no live record after it never closes: no timer). ONE For-you item per burst, filed at its
// first late wall (origin pool — this file's producer), resolved when the conversation proves alive (a live record ends
// the burst) or the wall is replayed at the declaration and taken. The journal lines stay English-only by design (an
// operator's log); the item carries its i18n keys.
function fileLateWallItem(session, b, what, v) {
  if (b.todoId !== undefined) return;
  b.todoId = null;
  try {
    const todos = getUserTodos();
    if (!todos || typeof todos.add !== 'function') return;
    const name = session.name || session._webuiId || '?', late = recordLateness.lateWords(v.lateMs);
    // verify r9 ⑩ (reproduced, LOW): filed under the CONVERSATION's own key (the auto rung's spelling) so the reply route and the
    // client's jump resolve it — "Open it to continue" opens it, Reply reaches it (a `webui:late-wall:<id>` key matched no session:
    // Reply refused no_live_session on a live conversation); dedupe is by text, one item per burst by `b.todoId`
    const bsid = session.backendSessionId || session.claudeSessionId;
    const r = todos.add(bsid ? `${session.backend || 'codex'}:${bsid}` : `webui:${session._webuiId || '?'}`, {
      origin: 'pool', kind: 'notice', urgency: 'normal', sessionName: session.name || null,
      text: `A usage limit was hit on ${name} while its records were arriving ${late} late — if the conversation stays stopped, auto-resume will not continue it from that record. Open it to continue, or wait for the limit's reset.`,
      detail: `The record (${what}) is ${late} older than its arrival: a stalled connection's backlog, or the first minute of a clock offset on the CLI's machine (the next records decide). A late limit is counted and never acted on, so no wait was armed for it. If the conversation produces a live record, or the offset is recognised and the limit replayed, this item resolves itself.`,
      i18n: { text: { key: i18nKey('A usage limit was hit on {session} while its records were arriving {late} late — if the conversation stays stopped, auto-resume will not continue it from that record. Open it to continue, or wait for the limit’s reset.'), params: { session: name, late } } },
      expiresAt: Date.now() + 24 * 3600e3,
    });
    b.todoId = (r && r.id) || null;
  } catch (e) { console.warn('[stream] could not file the late-wall notice:', e.message); }
}
function resolveLateWallItem(b, why) {
  if (!b || !b.todoId) return;
  const id = b.todoId; b.todoId = null;
  try { const todos = getUserTodos(); const it = todos && typeof todos.get === 'function' ? todos.get(id) : null; if (it && it.status === 'open' && typeof todos.setStatus === 'function') todos.setStatus(id, 'done', why); } catch { }
}
function noteLateFact(session, what, v, replay = null) {
  const b = session._lateBurst || (session._lateBurst = { n: 0, maxLateMs: 0, kinds: {}, at: Date.now(), dropped: 0, droppedKinds: {} });
  if (!b.n) {
    console.log(`[stream] ${session._webuiId || '?'}: records arriving ${recordLateness.lateWords(v.lateMs)} late — a stalled bridge's backlog (or the first minute of a clock offset — the next records decide); no wall, reading or turn end in it is taken as live (first: ${what})`);
    global.__vsEvent?.('stream-backlog', `${what}:${Math.round((Number(v.lateMs) || 0) / 60e3)}m`);
  }
  b.n++;
  if ((Number(v.lateMs) || 0) > b.maxLateMs) b.maxLateMs = Number(v.lateMs) || 0;
  b.kinds[what] = (b.kinds[what] || 0) + 1;
  if (HELD_WALL_KINDS.includes(what)) fileLateWallItem(session, b, what, v);
  if (typeof replay === 'function' && !((session._recordClock && session._recordClock.skewMs) || 0)) {
    const h = session._heldLate || (session._heldLate = []);
    let key = null; try { key = usageCacheKeyFor(session) || null; } catch { key = null; } // the account this fact is about (the replay belt compares against ITS newest reading)
    h.push({ what, lateMs: Number(v.lateMs) || 0, at: Date.now(), key, replay });
    if (h.length > HELD_LATE_MAX) {
      let i = h.findIndex((x) => !HELD_WALL_KINDS.includes(x.what)); if (i < 0) i = 0; // the oldest reading first; a wall only among walls
      const d = h.splice(i, 1)[0];
      b.dropped = (b.dropped || 0) + 1; b.droppedKinds = b.droppedKinds || {}; b.droppedKinds[d.what] = (b.droppedKinds[d.what] || 0) + 1; // counted already; it cannot be replayed — said at the close
    }
  }
}
/** The offset was just declared: every held fact of the undeclared minute is re-judged through its own gate — unless a
 *  NEWER reading of its account exists already (verify r8 ②, reproduced on the real engine: the replay of a held wall and
 *  reading wrote the held numbers OVER a reading another conversation had taken since, and armed auto-resume for a wall
 *  that reading had answered). The newest reading per account is read ONCE before any replay (a replayed reading must not
 *  make the next held fact "superseded"); a fact older than it is not replayed, counted, said. A codex replay carries the
 *  fact's own instant (`asOf` = its arrival on the skewed stream ≈ its emission + the offset), so the cache and the settle
 *  rules see it at its true time. Replayed at most once: the ring is taken whole before the first replay. */
function replayHeldLate(session) {
  const held = session._heldLate; session._heldLate = null;
  if (!held || !held.length) return;
  const b = session._lateBurst;
  const newestAt = {};
  for (const e of held) { if (e.key && newestAt[e.key] === undefined) { let at = 0; try { const c = readRawUsageCache(e.key); at = Number(c && c.fetchedAt) || 0; } catch { at = 0; } newestAt[e.key] = at; } }
  let taken = 0, superseded = 0; const kinds = {}, supKinds = {}; let wallTaken = false;
  REPLAYING_HELD.add(session);
  try { for (const e of held) {
    if (e.key && newestAt[e.key] > Number(e.at)) { superseded++; supKinds[e.what] = (supKinds[e.what] || 0) + 1; continue; } // a newer reading of the account stands; this fact is history (still counted on the burst)
    if (b) { b.n = Math.max(0, b.n - 1); if (b.kinds[e.what] > 0) b.kinds[e.what]--; if (!b.kinds[e.what]) delete b.kinds[e.what]; } // un-count: the replay re-counts itself if still late
    const n0 = session._lateBurst ? session._lateBurst.n : 0;
    try { e.replay(Number(e.at) || Date.now()); } catch { }
    const n1 = session._lateBurst ? session._lateBurst.n : 0;
    if (n1 === n0) { taken++; kinds[e.what] = (kinds[e.what] || 0) + 1; if (HELD_WALL_KINDS.includes(e.what)) wallTaken = true; }
  } } finally { REPLAYING_HELD.delete(session); }
  if (taken) console.log(`[stream] ${session._webuiId || '?'}: ${taken} fact(s) held from the offset stream's first minute re-judged live by the offset and taken (${kindsText(kinds)})`);
  if (superseded) console.log(`[stream] ${session._webuiId || '?'}: ${superseded} held fact(s) not replayed — a newer reading of the account exists already (${kindsText(supKinds)})`);
  if (wallTaken) resolveLateWallItem(session._lateBurst, 'wall-replayed');
}
function endLateBurst(session, how = 'live') {
  const b = session._lateBurst;
  if (!b) return;
  session._lateBurst = null;
  session._heldLate = null; // a live record ended the burst: what was held WAS a backlog
  resolveLateWallItem(b, how === 'live' ? 'stream-alive' : 'offset-declared'); // the conversation produced a live record, or declared its offset by producing records: it is not stopped at that wall
  if (!b.n) return;
  const kinds = kindsText(b.kinds);
  const dropped = b.dropped ? `; ${b.dropped} dropped from the held ring of ${HELD_LATE_MAX} (${kindsText(b.droppedKinds || {})})` : '';
  if (how === 'declaration') console.log(`[stream] ${session._webuiId || '?'}: the offset stream's first minute over — ${b.n} fact(s) not replayed (${kinds}; a turn end is never replayed, the next one comes${dropped})`);
  else console.log(`[stream] ${session._webuiId || '?'}: backlog over — ${b.n} late fact(s) not taken as live (${kinds}; up to ${recordLateness.lateWords(b.maxLateMs)} late${dropped})`);
}
// ── A MODEL-CAP REJECTION MARKS THE MODEL'S CAP, NEVER THE PLAN LANE ────────
// (the 2026-09-13 pool storm; the second half of it.)
//
// MEASURED VOCABULARY. claude 2.1.267's `rate_limit_event.rateLimitType` is
// exactly {five_hour, seven_day, seven_day_overage_included, seven_day_sonnet,
// seven_day_opus, seven_day_oauth_apps}. There is NO `seven_day_fable`, so a
// FABLE model-cap rejection is emitted on the UNSCOPED `seven_day` lane and the
// only thing that names the model is the banner text
// ("You've reached your Fable limit."). We wrote both: the event marked the
// PLAN week 100 % spent and the banner marked the Fable cap — one rejection,
// two demotions, and the plan mark is the false one. Three members' plan lanes
// were pinned exhausted for 12-60 h and every OPUS conversation linked to them
// was bounced along with the fable one.
//
// THE RULE. A REJECTED, UNSCOPED weekly event on a claude session is
// PROVISIONAL: nothing is written until the lane is decided.
//   · the same turn's banner names a MODEL (parseLimitBanner kind 'scoped')
//     ⇒ the event WAS that model's cap. Its `resetsAt` — which the banner
//     deliberately never states (owner: never parse text for times) — rides
//     along onto the scoped bucket, and ONLY that cap is marked.
//   · the banner says "weekly usage limit" (kind 'sevenDay') ⇒ the plan lane,
//     confirmed.
//   · NO banner by turn end ⇒ decide by EVIDENCE: if the slot's own cache
//     shows the plan week clearly alive AND a scoped cap for the session's
//     REQUEST-model family at ≥ 99 % used, it is the cap; otherwise the plan
//     (today's behaviour). Journal which rule decided.
// A 5-hour banner decides nothing about WHICH WEEKLY lane, so it leaves the
// deferral pending — the evidence rule gets it at turn end.
//
// IT DOES NOT DEPEND ON THE MODEL NAME. A future `seven_day_fable` type parses
// to kind 'scoped' through rate-limit-capture's existing regex and is never
// deferred at all.
//
// `seven_day_overage_included` IS NOT AN UNSCOPED WEEKLY REJECTION AT ALL
// (inc-mubu23bd-5vxi, 2026-09-21; it was B-ccaa's excused type before that).
// The 2.1.274 binary describes that window as the "overage-included weekly
// (per-model bucket; present only for accounts whose responses carry that
// window)", and every live buffer on this instance reads it about twice the
// plan week (0.43/0.87 on the owner's account, whose verified /usage panel
// said plan 43 % · Fable 86 %). So rate-limit-capture parses it as a SCOPED
// lane — the account's model cap — and names the model through quota-model's
// `nameModelCapLane` (the sidecar's scoped window with this reset, an existing
// model limit with this reset, the request family as a tie-breaker, else the
// `model:cap` placeholder that folds into the named cap on the next panel or
// banner). A rejection on it therefore marks the CAP on arrival and never the
// plan lane; the same turn's Fable banner marks the same lane (or the lane the
// placeholder folds into), so B-ccaa's "one wall, two lanes" cannot recur
// through this type and there is nothing left to defer. Only `seven_day` /
// `weekly` — the types that genuinely name no lane a model cap could hide in
// — stay provisional.
//
// THE COST, STATED. A rejection that states no reset on an account whose caps
// nothing names lands on the placeholder with no reset: it counts for the
// account-level min (the conservative direction), names no wall the demotion
// pass can act on (a scoped signal without a name is skipped), and is retired
// by the next panel that enumerates the account's caps.
// (the unscoped weekly rawTypes are the session harness's: quota.unscopedWeeklyTypes — claude-quota.js)
// REACHABILITY, STATED HONESTLY (r3). A turn's rejections share ONE key by
// construction — `rejectionSlotFor` pins the credential slot at the first keyed
// signal and `noteTurnEnd` clears it — so the only way this cap binds is
// `wallRecordTarget` RE-FILING a rejection onto another account mid-turn (the
// window-attribution rule). That path exists and is asserted by the suite, but
// a turn with five distinct re-filed keys has NOT been measured end to end. The
// cap is therefore kept (a turn that walls five members is pathological) and
// its drop is made AUDIBLE rather than removed: a bound we cannot prove is
// unreachable must not silently discard a wall.
const LANE_DEFER_MAX = 4;
/** Is this rejection one whose LANE we cannot yet name? */
function laneIsProvisional(session, ev) {
  if (!ev || ev.status !== 'rejected' || ev.kind !== 'sevenDay') return false;
  const unscoped = quotaSourceFor(session?.backend).unscopedWeeklyTypes;
  if (!unscoped) return false;
  return unscoped.has(String(ev.rawType || ''));
}
/** Stash one provisional rejection for the rest of this turn. */
function deferTurnLane(session, { key, resetsAt, rawType }) {
  const list = (session._turnLaneDefer = session._turnLaneDefer || []);
  if (list.some((d) => d.key === key)) return;    // the same member's wall, restated
  // THE CAP DROPS A WALL, SO IT SAYS SO (r3). Past LANE_DEFER_MAX distinct
  // members in one turn this rejection gets no bucket mark at all — the same
  // harm the teardown settle fixes, one rung up. A silent bound is a wall
  // nobody can count: the pool then spends on a member the CLI just refused and
  // no telemetry says why.
  if (list.length >= LANE_DEFER_MAX) {
    console.warn(`[wall] ${session._webuiId}: lane deferral dropped for ${nameOf(key)} — more than ${LANE_DEFER_MAX} members walled in one turn (its bucket mark is lost)`);
    global.__vsEvent?.('rate-limit-lane-dropped', `${key}:${rawType || 'sevenDay'}`);
    return;
  }
  list.push({ key, resetsAt: Number(resetsAt) || null, rawType: rawType || null, at: Date.now() });
}
function pendingLaneDeferrals(session) {
  return (session && Array.isArray(session._turnLaneDefer)) ? session._turnLaneDefer : [];
}
/** THE LANE IS DECIDED. Rewrite this turn's provisional signals, write the
 *  bucket each deferral was waiting to name, and say which rule decided. */
function resolveTurnLane(session, verdict, why) {
  const list = pendingLaneDeferrals(session);
  if (!list.length) return;
  session._turnLaneDefer = [];
  const scoped = verdict && verdict.kind === 'scoped' && verdict.name;
  const scopedName = scoped ? String(verdict.name).toLowerCase() : null;
  // the SIGNALS first: demoteWalledAccount folds them at turn end, and a
  // provisional entry left saying 'sevenDay' is the false demotion itself
  for (const sig of (session._turnWallSigs || [])) {
    if (!sig || !sig.provisional) continue;
    sig.provisional = false;
    if (scoped) { sig.bucket = 'scoped'; sig.scopedName = scopedName; }
  }
  for (const d of list) {
    const ev = {
      kind: scoped ? 'scoped' : 'sevenDay', scopedName,
      status: 'rejected', utilization: null,
      resetsAt: d.resetsAt || null, overage: {},
    };
    try {
      const r = captureRateLimitEvent({ cacheDir: USAGE_CACHE_DIR, key: d.key, identityIds: usageIdentityAccountIds(d.key), ev });
      if (!r.ok) console.warn(`[wall] lane write failed for ${nameOf(d.key)}: ${r.error || 'unknown'}`);
    } catch (e) { console.warn('[wall] lane write failed:', e.message); }
    console.log(`[wall] ${session._webuiId}: unscoped weekly rejection on ${nameOf(d.key)} → ${scoped ? 'the ' + verdict.name + ' model cap' : 'the plan weekly lane'} (${why})`);
    global.__vsEvent?.('rate-limit-lane', `${d.key}:${scoped ? 'scoped:' + scopedName : 'sevenDay'}`);
  }
  maybePoolAutoSwitch(session); // the mark just landed — act on it in this tick
}
/** The banner of this same turn names the lane. Called from markLimitBanner. */
function laneFromBanner(session, hit) {
  if (!pendingLaneDeferrals(session).length || !hit) return;
  if (hit.kind === 'scoped') resolveTurnLane(session, { kind: 'scoped', name: hit.name }, `the banner names the ${hit.name} cap`);
  else if (hit.kind === 'sevenDay') resolveTurnLane(session, { kind: 'sevenDay' }, 'the banner says weekly usage limit');
  // kind 'fiveHour' states nothing about WHICH weekly lane — stay pending
}
/** No banner named the lane. Decide on what the slot's own cache already says
 *  about the two candidate buckets, for the family this session REQUESTS. */
function laneByEvidence(session, d) {
  const fam = familyOfModel(sessionModelFor(session));
  if (!fam) return { verdict: { kind: 'sevenDay' }, why: 'no banner, and this session states no model — the plan lane is the safe default' };
  const c = readRawUsageCache(d.key);
  if (!c) return { verdict: { kind: 'sevenDay' }, why: `no banner and no cached reading for ${nameOf(d.key)}` };
  const nowSec = Math.floor(Date.now() / 1000);
  const planLeft = bucketRemaining(c.sevenDay, nowSec);
  const cap = (Array.isArray(c.scopedWeekly) ? c.scopedWeekly : []).find((b) => familyOfScopedBucket(b?.name) === fam);
  const capLeft = bucketRemaining(cap, nowSec);
  const pct = (left) => (left == null ? 'unknown' : Math.round(100 - left) + '%');
  if (planLeft != null && planLeft > 10 && capLeft != null && capLeft <= 1) {
    return { verdict: { kind: 'scoped', name: cap.name || fam }, why: `no banner: the plan week reads ${pct(planLeft)} used while this session's ${cap.name || fam} cap reads ${pct(capLeft)}` };
  }
  return { verdict: { kind: 'sevenDay' }, why: `no banner: the plan week reads ${pct(planLeft)} used, this session's ${fam} cap ${pct(capLeft)} — not a model cap by evidence` };
}
/** The turn is over: any deferral still pending is decided by evidence.
 *
 *  TWO CALLERS, AND THE SECOND IS THE ONE THIS DEFERRAL OWES ITS EXISTENCE TO
 *  (r3 §8, the round-2 verifier). `noteTurnEnd` runs on claude's `result`
 *  record — but a turn can end without one: the wrapper dies, the pty exits,
 *  and the rejection that arrived seconds earlier gets NO bucket mark at all,
 *  where master (the immediate write) left one. A dropped wall makes the member
 *  look healthy to every OTHER conversation, which is the money direction. The
 *  stdout consumer binds this on the session (`_settleTurnLane`) and
 *  session-stdout's teardown calls it, exactly as `_retireCompaction` does for
 *  the compaction claim: a turn-lifecycle exit this consumer never sees a
 *  record for still closes the claim through the claim's OWN named function.
 *  Idempotent by construction — `resolveTurnLane` empties the list first. */
function settleTurnLane(session) {
  const list = pendingLaneDeferrals(session);
  if (!list.length) return;
  // THE BANNER OF THIS TURN OUTRANKS THE EVIDENCE, WHATEVER ORDER THE RECORDS
  // CAME IN (B-ccaa): `laneFromBanner` fires when the banner arrives, but a
  // banner that arrived BEFORE the rejection found nothing pending — its lane
  // is remembered on the session (`_turnBannerLane`) and consulted here first.
  if (session._turnBannerLane) { laneFromBanner(session, session._turnBannerLane); if (!pendingLaneDeferrals(session).length) return; }
  const { verdict, why } = laneByEvidence(session, list[0]); // one turn, one requested model ⇒ one verdict
  resolveTurnLane(session, verdict, why);
}

/** Main-thread assistant output — work evidence for turn classification. */
function noteSessionProduced(session, rec = null) {
  if (recordIsLate(session, rec)) return; // a backlog's work proves nothing about the turn running NOW
  if (session._turnWallSigs && session._turnWallSigs.length) session._turnWorkAfterSig = (session._turnWorkAfterSig || 0) + 1;
}
/** The turn ended (claude `result` record / codex task_complete|task_failed).
 *  ALL wall-state transitions happen here and only here. */
function noteTurnEnd(session, rec = null) {
  // A BACKLOG'S TURN END (lane-hot-switch) settles nothing: its walls and
  // readings were not taken (gateLiveFact), and "a turn completed normally"
  // hours ago proves nothing about now — no pool evaluation, no disarm, no
  // loop-breaker credit. The per-turn state is still cleared, so a turn that
  // began live before the stall cannot carry its pins into the next live turn.
  if (recordIsLate(session, rec)) {
    noteLateFact(session, 'turn end', liveFactVerdict(session, rec));
    session._turnWallSigs = []; session._turnWorkAfterSig = 0;
    session._turnLaneDefer = null; session._turnBannerLane = null;
    session._turnReadingSlot = null; session._turnWallRefile = null; session._turnWallRefuted = null;
    return;
  }
  const sigs = session._turnWallSigs || [];
  const workAfter = session._turnWorkAfterSig || 0;
  // THE LANE DECISION CLOSES WITH THE TURN (2026-09-13). It runs BEFORE the
  // signal list is swapped out, because resolving rewrites the provisional
  // entries IN `sigs` — the very array `demoteWalledAccount` folds below — and
  // a provisional entry left saying 'sevenDay' IS the false plan demotion.
  // Every turn settles it, walled or not: today's immediate write lands on any
  // turn that sees a rejection, and this must not silently lose a mark.
  try { settleTurnLane(session); } catch (e) { console.warn('[wall] lane settle failed:', e.message); }
  session._turnWallSigs = []; session._turnWorkAfterSig = 0;
  session._turnLaneDefer = null; session._turnBannerLane = null;
  // the READING pin dies with the turn for exactly the reason the rejection
  // pin does: a re-point reaches the running CLI on its next request, so the
  // next turn is the first one it can be true for (readingSlotFor)
  session._turnReadingSlot = null;
  // …and so does the proven re-file this turn's rejection records established —
  // but only AFTER the demotion below, which is its LAST READER: the turn-end
  // pass asks the same proof for every signal that carries no window of its
  // own, so clearing it here (where the other two pins die) silently put the
  // banner's mark back on the member this turn had just proved innocent.
  const clearRefile = () => { session._turnWallRefile = null; session._turnWallRefuted = null; };
  if (sigs.length && workAfter <= 1) {
    // BLOCKED entry owns this turn's pool evaluation (B-2c9b): it runs AFTER
    // the demotion + the arm, so the link moves in the same tick and a hot
    // switch's fireNow() finds the session armed
    try { onWalledTurn(session, sigs); } catch (e) { console.warn('[wall] blocked-entry failed:', e.message); }
    clearRefile();
    return;
  }
  clearRefile();
  maybePoolAutoSwitch(session, { stop: true }); // the per-turn pool evaluation this boundary always ran — and the FIRST STOP a soft-deferred move waits for
  // a normally-completed turn is sufficient proof the session is not blocked —
  // and it is WORK (the default classification), so it is one of the only two
  // signals allowed to clear the loop breaker (round 4); a continue that
  // actually landed reaches this same line as its own turn's result
  try { getAutoResume()?.noteRecovered?.(session._webuiId, 'turn completed normally'); } catch { }
}

/** A QUOTA READING ARRIVED FOR THIS SESSION — the harness-neutral half of the
 *  2026-09-08 incident. Two facts, and which one applies depends only on
 *  whether the session is WAITING:
 *   · not waiting → the pre-existing disarm (`worked:false`: a passive reading
 *     says a bucket has room and NOTHING about whether this conversation
 *     produced anything, so it may drop a timed wait but never clear the loop
 *     breaker — round 4 of the 130-fire incident). Unarmed this is a no-op,
 *     which is what it always was.
 *   · waiting → THE FRESH-WINDOW EDGE. The old code disarmed here too, and for
 *     claude that was invisible: claude only emits readings while a turn is
 *     running, so an armed session never saw one. codex's app-server pushes
 *     `rate_limits_updated` to an IDLE thread — that is exactly the 21:55Z
 *     record that should have woken the incident's conversation — so the same
 *     line meant "silently break the promise and leave the session dead".
 *     Now the reading is asked whether the wall is GONE (PURE windowOpened,
 *     lane-aware) and, if so, the promise is KEPT through the normal fire path
 *     (breaker + hourly cap + quarantine + pre-fire gate all still apply).
 *  ONE implementation for every harness: the caller hands over its own
 *  normalized snapshot, nothing here branches on a backend id. */
const _readingEdgeSaid = new Map(); // webuiId → {why, at} — the last verdict this session's wait was journalled with
const READING_EDGE_LOG_MS = 10 * 60e3;
function noteQuotaReadingForResume(session, snapshot, why) {
  const id = session && session._webuiId;
  if (!id) return;
  try {
    const ar = getAutoResume();
    if (!ar) return;
    const st = ar.statusFor?.(id);
    if (!st || !st.armed) { _readingEdgeSaid.delete(id); ar.noteRecovered?.(id, why, { worked: false }); return; }
    const v = ar.noteQuotaReading?.(id, snapshot, why);
    if (!v || v.open || v.why === 'not-armed') { if (v && v.open) _readingEdgeSaid.delete(id); return; }
    // ONE LINE PER VERDICT, NOT ONE PER READING. A waiting codex session is
    // pushed a `rate_limits_updated` every few seconds — measured on the
    // incident thread's own buffer: 454 pushes in under two hours, 403 of them
    // on the SIBLING lane — and a watch can stand for days, so journalling each
    // refusal would bury the lines that mean something (the S9 round-6 rule: a
    // degrade path that speaks once per fetch says nothing). The verdict is
    // said when it CHANGES, and re-said at most every 10 min so a long wait
    // still shows it is being judged rather than ignored.
    const prev = _readingEdgeSaid.get(id);
    const now = Date.now();
    if (prev && prev.why === v.why && now - prev.at < READING_EDGE_LOG_MS) return;
    _readingEdgeSaid.set(id, { why: v.why, at: now });
    // TWO VERDICTS CARRY `wallOpen: true` AND EACH NEEDS ITS OWN SENTENCE —
    // the generic line says the wall is still up, and for these two that is a
    // false fact printed into the one channel this incident was diagnosed from.
    //   already-refuted  the window really does read open; we decline to spend
    //                    again because the CLI answered our last reading-driven
    //                    continue with another limit rejection (r2)
    //   gate-held        the window reads open, the PRE-FIRE GATE disagreed,
    //                    and we are pacing the re-ask rather than re-running it
    //                    on the producer's traffic (r3). The wait is intact and
    //                    it will be asked again — say that, not "still limited".
    console.log(v.why === 'already-refuted'
      ? `[auto-resume] ${id}: the window reads open but a continue onto this wall was already refused — waiting for the reset`
      : v.why === 'gate-held'
        ? `[auto-resume] ${id}: the window reads open but the pre-fire gate still says blocked — re-asking on a timer, the wait stands`
        : `[auto-resume] ${id}: reading did not reopen the wait (${v.why})`);
  } catch (e) { console.warn('[auto-resume] reading edge failed:', e.message); }
}

const BUCKET_LABEL = { fiveHour: '5h', sevenDay: '7d' };
/** (B-2c9b plan A, re-based 2026-09-07) WALL = GROUND TRUTH for the account
 *  whose credentials the CLI actually read. A walled turn's signals name the
 *  key their mark landed on — for a rejection that key is now the session's
 *  TOKEN SLOT (wallKeyFor: the validated link), not the OTel-observed org,
 *  because the observation names the identity the CLI cached at spawn (see
 *  the header note). Mark the affected bucket exhausted NOW — utilization 1,
 *  resetsAt = the signal's, else the bucket's cached future reset, else the
 *  bounded 5h/24h guess — through the SAME write path readings use
 *  (captureRateLimitEvent, source 'wall'), so anchors/estimator/verdicts all
 *  see it in this tick.
 *  VERIFICATION LADDER (the 2.368.34 misattribution class still applies to
 *  every account that is NOT the session's slot): the session's own validated
 *  slot is authority by itself — we know what the symlink points at, which is
 *  strictly better evidence than a telemetry attribute. Anything else needs
 *  the old corroboration: ≥2 walled turns inside WALL_RING_MS (any session)
 *  OR the account IS the session's OTel-observed org. Every outcome returns a
 *  named reason. */
/** WHOSE WALL IS THIS? (inc-mttbrtc0-6049, 2026-09-08 23:47Z.)
 *
 *  THE INCIDENT. The pool re-pointed one session's credential link twice
 *  inside a single turn (23:44:48 → 23:46:00 → 23:46:36; all three rows are in
 *  data/slot-transitions.jsonl, per session, with timestamps). The CLI re-read
 *  the credentials — 2.1.257's `rpe()` re-reads on mtime, which is exactly what
 *  a re-point bumps — and its NEXT request, made with the member we had just
 *  moved TO, came back rejected with that member's own 5h window ('resets
 *  8:30pm'). `rejectionSlotFor` answers with the TURN PIN, so the wall landed
 *  on the member the turn had STARTED on: its panel read "resets 8:30pm" until
 *  the owner refreshed by hand, and it was demoted for three hours on somebody
 *  else's wall. The pin's justification — "a re-point cannot reach a running
 *  CLI" — is refuted by the readings-by-slot essay itself, and the 2.369.73
 *  rule that a WINDOW outranks our bookkeeping was only ever applied to VALUE
 *  readings. A rejection is a reading too.
 *
 *  THE PIN IS NOT WRONG, IT IS INCOMPLETE, and it stays the default. It exists
 *  because ONE wall reaches us through up to three producers (the
 *  `rate_limit_event`, the assistant banner and the task_notification banner)
 *  and each producer's write re-runs `maybePoolAutoSwitch` — so resolving per
 *  RECORD split one wall across the members our own re-points were moving to.
 *  That is still true. This only asks a further question when there is
 *  something to ask it with.
 *
 *  TWO WITNESSES, AND ONLY THEIR AGREEMENT MOVES A BYTE:
 *    · the LEDGER identifies — `slotAt(webuiId, <when the rejection arrived>)`,
 *      our own first-class record of which member held that link at that
 *      instant. This is the evidence the turn pin throws away.
 *    · the WINDOW refutes — a RUNNING window cannot change its reset before it
 *      ends, so a stated reset that contradicts the pin's own still-future
 *      window proves the wall is not the pin's. It proves nothing about WHOSE
 *      it is (2.369.73 r2 measured a 5h reset names a time, not an account),
 *      which is why identification is left to the ledger.
 *  Either witness silent ⇒ the pin stands. They disagree ⇒ we write NOTHING and
 *  say why; refusing can never write a foreign window onto a member, which is
 *  the harm.
 *
 *  ONLY A VENDOR-STATED RESET COUNTS. `parseLimitBanner` returns `{kind}` and
 *  no time, so the banner path carries `resetsAtMs: 0` and is untouched here —
 *  which is the load-bearing half of `guardReadingTarget`'s own reason for
 *  exempting walls ("the wall's resetsAt is often a bounded GUESS"). A guess
 *  compared against a real window differs every time; reading one as evidence
 *  would archive every exhaustion mark on the instance.
 *
 *  ASKED AT EVERY MOMENT A REJECTION IS WRITTEN, NOT ONLY AT THE AGGREGATE (r2,
 *  the round-1 verifier's first finding, reproduced). A rejected
 *  `rate_limit_event` is written TWICE: once per RECORD, the instant it arrives
 *  (`recordRateLimitEvent` → `captureRateLimitEvent`, which is what makes the
 *  pool act in the same tick), and once more when the turn ends and
 *  `demoteWalledAccount` folds the turn's signals together. Round 1 put the
 *  rule on the second one only, so the incident's own damage still landed: the
 *  foreign 5h window was written onto the pinned member at the FIRST write and
 *  the turn-end pass — which correctly filed the wall on the true owner —
 *  never went back to repair it. It was invisible in the suite because the
 *  fixture sent both rejections on the SAME bucket, so the pin's own turn-end
 *  write happened to overwrite the foreign value; on two different buckets the
 *  victim keeps a stranger's reset (measured: `accountRemaining` 0, ~3 h of
 *  exclusion, i.e. the incident). So `wallAttributionFor` is the rule over
 *  KEYS, and both writers ask it. Attributing at the write is also what makes
 *  the repair unnecessary: nothing foreign is ever stored to be repaired.
 *
 *  The rule is `wallAttributionFor` (over KEYS); its two callers are
 *  `wallRecordTarget` (per record) and `wallTargetFor` (the turn's aggregate),
 *  both directly below. */
/** THE RULE, OVER KEYS — the shared half of the two callers. Gathers the two
 *  witnesses (the slot LEDGER, and each candidate's own established window) and
 *  hands them to the PURE `quotaModel.wallAttribution`. */
function wallAttributionFor(session, poolId, b, pinnedKey) {
  const atMs = Number(b.atMs) || 0;
  const statedSec = b.resetsAtMs > 0 ? Math.floor(b.resetsAtMs / 1000) : null;
  if (!statedSec || !atMs) {
    // NO WINDOW OF ITS OWN — the banner paths, which state no time at all. If a
    // rejection RECORD of this same turn PROVED where this wall belongs, follow
    // that proof rather than the pin it refuted: it is the same wall, and one
    // rejection may not mark two members. Without evidence the pin stands,
    // exactly as before.
    const rf = session && session._turnWallRefile;
    if (rf && rf.from === pinnedKey && rf.to) {
      return { action: 'refile', key: rf.to, reason: `a rejection record of this turn proved this wall is ${rf.to}'s, and this signal states no window of its own` };
    }
    // …and a REFUTATION is proof too (lane-hot-switch, 2026-09-30): the record
    // of this same wall stated a reset that contradicts the pin's own window,
    // so the pin did not refuse this turn. Falling back to it here is exactly
    // how the incident's Fable banner marked a member with quota: the record
    // was archived ("contradicts the member's own unexpired window"), and the
    // window-less banner of the same rejection then demoted that member anyway.
    const rq = session && session._turnWallRefuted;
    if (rq && rq.from === pinnedKey) {
      return { action: 'archive', key: null, reason: `a rejection record of this turn proved this wall is not ${pinnedKey}'s (${rq.reason}), and this signal states no window of its own` };
    }
    return { action: 'write', key: pinnedKey, reason: 'no reset stated' };
  }
  const atSec = Math.floor(atMs / 1000);
  const kindKey = b.kind === 'scoped' ? null : b.kind === 'fiveHour' ? 'fiveHour' : 'sevenDay';
  const ownOf = (key) => {
    try {
      const w = establishedWindows()[key];
      if (!w) return null;
      if (b.kind === 'scoped') return (w.scoped && w.scoped[String(b.scopedName || '').toLowerCase()]) || null;
      return w[kindKey] || null;
    } catch { return null; }
  };
  let led = null;
  try { led = slotTransitions.slotAt(session._webuiId, atMs, { poolId }); } catch { }
  const ledId = led && led.id && !led.ownLinkUnknown && led.scope === 'session' ? led.id : null;
  return quotaModel.wallAttribution({
    kind: b.kind,
    statedResetsAt: statedSec,
    pinnedKey,
    ledgerKey: ledId,
    ledgerIsSessionScoped: !!ledId,
    pinnedOwnResetsAt: ownOf(pinnedKey),
    ledgerOwnResetsAt: ledId ? ownOf(ledId) : null,
    atSec,
  });
}

/** THE PER-RECORD half: where does THIS rejected `rate_limit_event` go, right
 *  now? Returns the key to write on, or null when the record is archived
 *  instead. A session with no pool has no ledger and no re-point, so the rule
 *  degrades to "the pin" by construction and this costs one sidecar read. */
function wallRecordTarget(session, key, ev) {
  const poolId = session && session._accountId;
  try {
    const a = poolId && accounts.get(poolId);
    if (!a || a.type !== 'pooled') return key;   // no pool ⇒ no ledger and no re-point: the rule has nothing to add
  } catch { return key; }
  const b = {
    kind: ev.kind,
    scopedName: ev.kind === 'scoped' ? String(ev.scopedName || '').toLowerCase() : null,
    resetsAtMs: (Number(ev.resetsAt) || 0) * 1000,
    atMs: Date.now(),
  };
  const d = wallAttributionFor(session, poolId, b, key);
  if (d.action === 'write') {
    // A five-hour disagreement that nothing corroborates is not a verdict, but
    // it IS the shape the incident wore — say it once so a later reader of the
    // journal can find it, and never silently.
    if (d.disagrees) console.log(`[wall] ${session._webuiId}: ${BUCKET_LABEL[ev.kind] || ev.kind} rejection disagrees with ${nameOf(key)}'s own window — writing it there anyway (${d.reason})`);
    return key;
  }
  const label = ev.kind === 'scoped' ? b.scopedName : BUCKET_LABEL[ev.kind] || ev.kind;
  if (d.action === 'refile') {
    const to = (accounts.poolMembers(poolId) || []).find((m) => m.id === d.key);
    if (!to) { archiveWall(session, { id: key }, b, d, `${d.reason}; the ledger's member is no longer in this pool`, 'rejection'); return null; }
    console.log(`[wall] ${session._webuiId}: ${label} rejection states ${nameOf(d.key)}'s window, not ${nameOf(key)}'s — filed there instead (the link moved mid-turn)`);
    global.__vsEvent?.('wall-record-refiled', `${key}→${d.key}:${label}`);
    // ONE WALL REACHES US THROUGH UP TO THREE PRODUCERS, and only this one
    // carries a window. The assistant banner and the task_notification banner
    // describe the SAME rejection but state no time at all (`parseLimitBanner`
    // returns `{kind}` — owner ruling: never parse text for times), so they
    // have no evidence of their own and fall back to the turn pin — the member
    // we have just PROVED this wall is not. Record the proof for the rest of
    // the turn so the whole rejection moves together instead of marking two
    // members; it dies with the turn exactly like the two pins, because a
    // re-point only reaches the CLI on its next request.
    try { session._turnWallRefile = { from: key, to: d.key, at: Date.now() }; } catch { }
    return d.key;
  }
  archiveWall(session, { id: key }, b, d, d.reason, 'rejection');
  // THE REFUTATION IS KEPT FOR THE TURN (lane-hot-switch): the banner that
  // follows this record states no time of its own and would otherwise fall
  // back to the very member this record just proved innocent. Dies with the
  // turn, exactly like the re-file proof.
  try { session._turnWallRefuted = { from: key, reason: String(d.reason || 'refuted').slice(0, 200), at: Date.now() }; } catch { }
  return null;
}

/** THE TURN-END half: the aggregate's per-signal target, as a pool MEMBER.
 *  Returns `{member, why}`; `member: null` = archived with a reason. */
function wallTargetFor(session, poolId, b, pinned) {
  const d = wallAttributionFor(session, poolId, b, pinned.id);
  if (d.action === 'write') return { member: pinned, why: null };
  const label = b.kind === 'scoped' ? b.scopedName : BUCKET_LABEL[b.kind] || b.kind;
  if (d.action === 'refile') {
    const to = (accounts.poolMembers(poolId) || []).find((m) => m.id === d.key);
    // The ledger may name a member this pool no longer holds (it was removed
    // between the rejection and now). We can prove the pin is wrong but have
    // nowhere sound to put it, so we do the smaller thing.
    if (!to) return archiveWall(session, pinned, b, d, `${d.reason}; the ledger's member is no longer in this pool`);
    console.log(`[wall] ${session._webuiId}: ${label} wall states ${nameOf(d.key)}'s window, not ${nameOf(pinned.id)}'s — re-filed (the link moved mid-turn)`);
    global.__vsEvent?.('wall-refiled', `${pinned.id}→${d.key}:${label}`);
    return { member: to, why: 'ledger+window' };
  }
  return archiveWall(session, pinned, b, d, d.reason);
}

/** A wall we refuse to write is ARCHIVED, never dropped: the same
 *  archive-never-destroy store the window guard uses, so one grep answers
 *  "what did we refuse and why" for readings and rejections alike. `moment`
 *  distinguishes the two writes of one rejection ('rejection' = the record as
 *  it arrived, 'wall' = the turn's folded signals), because refusing both is
 *  two facts, not one line written twice. */
function archiveWall(session, pinned, b, d, reason, moment = 'wall') {
  const label = b.kind === 'scoped' ? b.scopedName : BUCKET_LABEL[b.kind] || b.kind;
  console.log(`[wall] ${session._webuiId}: refusing to mark ${nameOf(pinned.id)} ${label} — ${reason}`);
  global.__vsEvent?.('wall-archived', `${pinned.id}:${label}`);
  try {
    fs.mkdirSync(path.dirname(READING_ARCHIVE), { recursive: true });
    fs.appendFileSync(READING_ARCHIVE, JSON.stringify({
      at: Date.now(), store: 'usage-cache', key: pinned.id, sid: session._webuiId || '-',
      what: moment + ':' + label, reason, matched: d.key || null,
      ownWindow: (() => { try { return establishedWindows()[pinned.id] || null; } catch { return null; } })(),
      entry: { kind: b.kind, scopedName: b.scopedName, resetsAtMs: b.resetsAtMs, atMs: b.atMs },
    }) + '\n');
  } catch { }
  return { member: null, why: null };
}

function demoteWalledAccount(session, sigs) {
  const poolId = session._accountId;
  const a = poolId && accounts.get(poolId);
  if (!a || a.type !== 'pooled') return { demoted: false, reason: 'not-pooled' };
  const last = sigs.length ? sigs[sigs.length - 1] : null;
  const wallKey = (last && last.key) || wallKeyFor(session);
  const ids = new Set([wallKey]);
  try { for (const id of usageIdentityAccountIds(wallKey)) ids.add(id); } catch { }
  const slot = sessionBillingMember(session, poolId);
  const member = (accounts.poolMembers(poolId) || []).find((m) => ids.has(m.id)) || (slot.id && ids.has(slot.id) ? { id: slot.id, name: nameOf(slot.id) } : null);
  // "was this key the session's credential slot when the rejection arrived" —
  // asked of the SIGNAL, because the link may have moved since (the signal
  // carries the turn-pinned answer; see rejectionSlotFor)
  const slotSignal = sigs.some((x) => x && x.slot && (!x.key || ids.has(x.key)));
  if (!member) return { demoted: false, reason: 'not-a-member', key: wallKey };
  const now = Date.now();
  if (!(last && last.key)) noteWallOnAccount(wallKey, session._webuiId, now); // a key-less signal joins the ring at resolution time — this turn IS a wall on that account
  const walls = wallCount(wallKey, now);
  const slotMatch = slotSignal || (!!slot.slotOk && !!slot.id && ids.has(slot.id));
  // this member said no to THIS session — true whether or not we demote it,
  // and the fact the verdict + the next target choice read. …UNLESS NO SIGNAL
  // OF THIS TURN LANDS ON IT (lane-hot-switch, 2026-09-30): when every signal
  // is refuted by its own window (or re-filed to the member it proved), the
  // pin did not refuse this conversation, and excluding it sent the incident's
  // conversation to "nowhere to go — 2 member(s) already rejected" while the
  // member it was linked to had quota. Asked without a side effect (the fold
  // below journals each archive/re-file once).
  const onPin = sigs.filter((x) => x && (!x.key || ids.has(x.key))).map((x) => {
    const kind = x.bucket || 'fiveHour';
    try {
      return wallAttributionFor(session, poolId, { kind, scopedName: kind === 'scoped' ? String(x.scopedName || '').toLowerCase() : null, resetsAtMs: Number(x.resetsAtMs) || 0, atMs: Number(x.at) || 0 }, member.id).action;
    } catch { return 'write'; }
  });
  if (onPin.length && !onPin.includes('write')) {
    if (onPin.every((a) => a === 'archive')) {
      console.log(`[wall] ${session._webuiId}: ${member.name} did not refuse this turn — every signal of it was refuted by its own window; no demotion, not excluded`);
      global.__vsEvent?.('wall-refuted', member.id);
      return { demoted: false, reason: 'refuted', key: member.id, walls };
    }
  } else {
    noteSessionWall(session._webuiId, member.id, now);
  }
  if (!slotMatch && walls < 2) {
    const held = (slot.id && ids.has(slot.id)) ? `this session's slot, but unvalidated: ${slot.slotReason || 'unknown'}` : "not this session's credential slot";
    console.log(`[wall] ${session._webuiId}: single wall on ${member.name} (${held}) — holding the demotion`);
    global.__vsEvent?.('wall-demote-held', `${member.id}:${walls}`);
    return { demoted: false, reason: 'unverified', key: member.id, walls };
  }
  // the buckets this turn's signals named for the account (a bucket-less
  // signal = fiveHour, the banner's shortest-self-heal rule); the signal's
  // resetsAt wins when it is in the future
  //
  // ATTRIBUTE FIRST, THEN AGGREGATE (inc-mttbrtc0-6049). Merging by kind and
  // keeping `Math.max(resetsAtMs)` IS the incident's mechanism: two rejections
  // arriving in one turn from two DIFFERENT members — because the pool moved
  // the link between them — collapsed into one bucket that then carried the
  // later member's window and was written onto the earlier one. Measured on
  // this instance, that is exactly the pair (a legitimate 00:20 wall at 23:46
  // and a foreign 03:30 one at 23:48, one bucket, one write). So each SIGNAL is
  // attributed on its own evidence and only then folded together; two members'
  // walls now stay two walls.
  const buckets = new Map();
  for (const s of sigs) {
    if (s.key && !ids.has(s.key)) continue;
    const kind = s.bucket || 'fiveHour';
    if (kind === 'scoped' && !s.scopedName) continue;
    const one = {
      kind, scopedName: kind === 'scoped' ? String(s.scopedName).toLowerCase() : null,
      resetsAtMs: Number(s.resetsAtMs) || 0, atMs: Number(s.at) || 0,
    };
    const tgt = wallTargetFor(session, poolId, one, member);
    if (!tgt.member) continue;                       // archived, with a reason, inside
    const k = (tgt.member.id === member.id ? '' : tgt.member.id + '|')
      + (kind === 'scoped' ? 'scoped:' + one.scopedName : kind);
    const b = buckets.get(k) || { ...one, resetsAtMs: 0, atMs: 0, dest: tgt.member, why: tgt.why };
    b.resetsAtMs = Math.max(b.resetsAtMs, one.resetsAtMs);
    b.atMs = Math.max(b.atMs, one.atMs);
    buckets.set(k, b);
  }
  const done = [];
  for (const b of buckets.values()) {
    const dest = b.dest;
    const ev = { kind: b.kind, scopedName: b.scopedName, status: 'rejected', utilization: null, resetsAt: b.resetsAtMs > now ? Math.floor(b.resetsAtMs / 1000) : null, overage: {} };
    const r = captureRateLimitEvent({ cacheDir: USAGE_CACHE_DIR, key: dest.id, identityIds: usageIdentityAccountIds(dest.id), ev, now, source: 'wall' });
    if (!r.ok) { console.warn(`[wall] demotion write failed for ${dest.name}: ${r.error || 'unknown'}`); continue; }
    // THE DEMOTION FOLLOWS THE WRITE. The incident's money half was this: the
    // pinned member was held out of the pool for three hours on somebody
    // else's wall, so re-filing the numbers while leaving the demotion behind
    // would fix the panel and keep the cost.
    if (dest.id !== member.id) noteSessionWall(session._webuiId, dest.id, now);
    const label = b.kind === 'scoped' ? b.scopedName : BUCKET_LABEL[b.kind] || b.kind;
    let until = 0;
    try {
      const c = JSON.parse(fs.readFileSync(path.join(USAGE_CACHE_DIR, String(dest.id).replace(/[^\w.-]/g, '_') + '.json'), 'utf-8'));
      const bk = b.kind === 'scoped' ? (c.scopedWeekly || []).find((x) => String(x?.name || '').toLowerCase() === b.scopedName) : c[b.kind];
      until = (Number(bk?.resetsAt) || 0) * 1000;
    } catch { }
    const why = b.why || (slotMatch ? 'credential slot' : walls + '-walls');
    console.log(`[wall] demoted ${dest.name} ${label} until ${until ? new Date(until).toISOString() : 'unknown'} (${walls} walls / ${why})`);
    global.__vsEvent?.('wall-demote', `${dest.id}:${label}:${why}`);
    done.push({ label, until });
  }
  // (the write's fresh fetchedAt busts the estimator memo by itself — estimateFor re-anchors on a newer rawCache)
  return { demoted: done.length > 0, reason: done.length ? 'demoted' : 'no-bucket', key: member.id, walls, slotMatch, buckets: done };
}

/** PURE. The near-arm's INVARIANT ASSERTION — deliberately NOT its protection
 *  (r3, the round-2 verifier's finding). What keeps a near-arm off the identity
 *  that just rejected us is two mechanisms that run BEFORE it:
 *  demoteWalledAccount calls noteSessionWall(member) on every path that
 *  resolves a member (held demotions included), and quotaVerdictFor forces
 *  `usable:false` for every member in that set — so the verdict's `viaId`
 *  cannot BE the rejector. Round 2 wrote the guard as `viaId === demoted.key`,
 *  which is unreachable for a second reason (the only `demoted.key` that skips
 *  noteSessionWall is `not-a-member`, and by construction no member id matches
 *  it) and read like the defence while never executing — the repo's 恒假守卫
 *  lesson. This one re-reads the SAME store the verdict read: if the two ever
 *  disagree, one of them is broken, so the caller says so LOUDLY and refuses
 *  the spend instead of re-firing at an identity that just refused us.
 *  Returns the violation's text, or null when there is nothing to say. */
function nearArmVeto(viaId, walledIds) {
  if (!viaId || !walledIds) return null;
  const has = typeof walledIds.has === 'function' ? walledIds.has(viaId)
    : Array.isArray(walledIds) ? walledIds.includes(viaId) : false;
  return has ? 'the verdict named a member that rejected this conversation as the way out' : null;
}

function onWalledTurn(session, sigs) {
  const id = session._webuiId;
  const model = sessionModelFor(session);
  const scope = _wallScope(session);
  // FIRST: if this walled turn is the answer to a continue WE fired, that
  // fire FAILED. The breaker has to learn it before anything below re-arms
  // or re-switches — that ordering is the loop's off-switch (2026-09-07).
  try { getAutoResume()?.noteFireOutcome?.(id, false, 'limit rejection'); } catch { }
  // (A) the wall is ground truth for the account it landed on — write it
  // BEFORE the verdict reads the cache (readings only confirm)
  let demoted = null;
  try { demoted = demoteWalledAccount(session, sigs); } catch (e) { console.warn('[wall] demotion failed:', e.message); }
  try {
    const ar = getAutoResume();
    if (!ar?.armIfEnabled) return;
    const v = quotaVerdictFor(scope, { model, session });
    console.log(`[wall] ${id}: walled turn (scope ${scope}${demoted?.demoted ? `, demoted ${demoted.key}` : ''}) → ${v.usable === true ? 'usable via ' + (v.via || '?') : v.usable === false ? 'blocked until ' + (v.blockedUntil ? new Date(v.blockedUntil).toISOString() : 'unknown') : 'no data'}`);
    // WHICH WALL this arm is about (2026-09-08), for the fresh-window edge: the
    // LANE the signals named (a codex login reports several — the sibling lane
    // read 0 % through the whole 32 h stall) and the BUCKET with the FURTHEST
    // reset, because an identity unblocks only when the LAST of its dead
    // windows has reset (the c1206711 rule). Both null for a harness that
    // states neither, which is the honest answer rather than a guess — and an
    // arm with no bucket simply waits out its own timer.
    const wallSig = (sigs || []).filter((s2) => s2 && s2.bucket).sort((x, y) => (y.resetsAtMs || 0) - (x.resetsAtMs || 0))[0] || null;
    const armWall = { lane: (sigs || []).map((s2) => s2 && s2.lane).find(Boolean) || null, bucket: wallSig ? wallSig.bucket : null, scopedName: wallSig ? (wallSig.scopedName || null) : null };
    if (v.usable === true) {
      // a member is free: the session is idle-walled and nothing else will
      // move it — a NEAR fire re-enters work through the normal machinery
      // (pre-fire gate re-verifies; the delayed announcement outlives this,
      // so a quick success stays silent). The pool eval in `finally` runs
      // with the session ARMED, so a hot switch's fireNow() continues it now.
      // ASSERTION, NOT PROTECTION (r3 — see nearArmVeto). The near-arm is kept
      // off the rejector by noteSessionWall + the verdict's walled override,
      // both of which have already run; this re-reads that same store so a
      // disagreement between them is LOUD instead of silently spending a turn.
      // It cannot fire today, and that is the point of saying so here rather
      // than dressing it up as the defence (round 2 compared `viaId` to
      // `demoted.key`, which is unreachable for an unrelated reason).
      const veto = nearArmVeto(v.viaId, sessionWalledMembers(id));
      if (veto) {
        console.warn(`[wall] ${id}: INVARIANT VIOLATED — ${veto} (${nameOf(v.viaId)}) — not re-firing`);
        global.__vsEvent?.('wall-usable-is-rejector', String(v.viaId));
      } else {
        ar.armIfEnabled(id, session, Date.now() + 45000, `switched to a usable account (${v.via || '?'})`, armWall);
        return;
      }
    }
    const evReset = Math.max(0, ...sigs.map((s2) => s2.resetsAtMs || 0));
    const target = v.blockedUntil || evReset;
    if (target > Date.now()) {
      ar.armIfEnabled(id, session, target, v.reason || 'usage limit', { ...armWall, cause: armCauseFor(v, demoted, armWall, evReset) });
      // VERIFY the cache's word (inc-mtdsoj5f, userW: an ALIVE account read
      // dead-with-a-far-reset — "blocked until Aug-31" off stale data — until a
      // MANUAL refresh fixed it; a confident cache can lie exactly like an
      // absent one). One throttled probe re-verdicts: usable ⇒ the near-fire
      // path takes over in seconds, still blocked ⇒ the arm stands corrected.
      if (Date.now() - (_wallVerifyAt.get(scope) || 0) > 10 * 60e3) {
        _wallVerifyAt.set(scope, Date.now());
        scheduleWallProbe(session, scope, model, 0);
      }
      return;
    }
    // no reset time ANYWHERE (a rolled-over window's next reset only exists
    // after a fresh reading) → probe the data gap, never guess
    scheduleWallProbe(session, scope, model, 0);
  } finally {
    // the per-turn pool evaluation, AFTER the demotion and the arm: the link
    // moves in this same tick (the demoted member reads dead; the decision is
    // taken FROM the member whose credentials the CLI reads) and a hot
    // switch's fireNow() continues the armed session — through the breaker,
    // which refuses a second continue onto an identity that just rejected it
    maybePoolAutoSwitch(session);
    // a HELD process whose pool has moved on is left out of the continue path
    // (quotaVerdictFor above): its way out is the cold restart the switch asked
    // a client for — ask again if that one never landed (r3)
    requestHeldRestart(session);
  }
}
/** THE COLD RESTART A HELD PROCESS IS OWED (reset credits r3). A non-hot pool
 *  process whose pool moved to another member keeps the old login until it is
 *  restarted, and the continue path no longer fires into it (quotaVerdictFor
 *  judges only the held member). The switch that moved the pool asked ONE
 *  client to restart its followers; when that did not land (no client was
 *  connected, the restart had no conversation id, a lost broadcast) and the
 *  held process walls again, ask again — at most once per 10 min per session,
 *  and never within 10 min of any restart request that named it (a second
 *  request while the first is in flight would resume the conversation twice).
 *  No client ⇒ journal it: the conversation waits for its own member's reset
 *  (the arm above) or for somebody to open VibeSpace. */
const HELD_RESTART_GAP_MS = 10 * 60e3;
function requestHeldRestart(session, now = Date.now()) {
  try {
    const poolId = session && session._accountId;
    const held = heldPoolMemberFor(session, poolId);
    if (!held) return false;
    const cur = accounts.poolCurrent(poolId);
    if (!cur || cur === held) return false;
    if (now - (Number(session._heldRestartAskedAt) || 0) < HELD_RESTART_GAP_MS) return false;
    const bsid = session.claudeSessionId || session.backendSessionId || null;
    if (!bsid) { console.log(`[pool] ${session._webuiId}: holds ${nameOf(held)}'s login while the pool is on ${nameOf(cur)}, and has no conversation id to restart by — it waits for ${nameOf(held)}'s reset`); session._heldRestartAskedAt = now; return false; }
    if (sendColdRestart(poolId, [{ serverId: session._webuiId, backend: session.backend || 'claude', backendSessionId: bsid, cwd: session.cwd || null, name: session.name || null, host: session.host || null }], now).sent) {
      console.log(`[pool] ${session._webuiId}: holds ${nameOf(held)}'s login while the pool is on ${nameOf(cur)} — asked a client to restart it there (no continue into the held login)`);
      global.__vsEvent?.('pool-held-restart', String(poolId));
      return true;
    }
    console.log(`[pool] ${session._webuiId}: holds ${nameOf(held)}'s login while the pool is on ${nameOf(cur)} — no client connected to restart it; it waits for ${nameOf(held)}'s reset`);
    return false;
  } catch { return false; }
}
/** THE ONE SENDER of a cold-restart request (`pool-auto-switched`, r4 — the
 *  "never doubled" rule lived only inside requestHeldRestart, so the default
 *  switch, the auth-failure evict and the per-session switch still re-named a
 *  conversation whose restart was in flight, and a second request resumes the
 *  conversation twice). A conversation asked inside HELD_RESTART_GAP_MS is left
 *  out; the rest go to ONE client (every client acting would race duplicate
 *  restarts) and are stamped only when the request went out. → {sent, affected} */
function restartInFlight(s, now = Date.now()) { return !!s && now - (Number(s._heldRestartAskedAt) || 0) < HELD_RESTART_GAP_MS; }
function sendColdRestart(poolId, affected, now = Date.now()) {
  const all = Array.isArray(affected) ? affected : [];
  const fresh = all.filter((t) => !restartInFlight(activeSessions.get(t.serverId), now));
  if (fresh.length < all.length) console.log(`[pool] ${all.length - fresh.length} conversation(s) on ${nameOf(poolId)} already have a restart request in flight — not asked again`);
  if (!fresh.length) return { sent: false, affected: fresh };
  const payload = JSON.stringify({ type: 'pool-auto-switched', poolId, affected: fresh });
  for (const c of wss.clients) {
    if (c.readyState !== WS_OPEN) continue;
    try { c.send(payload); } catch { continue; }
    for (const t of fresh) { const s3 = activeSessions.get(t.serverId); if (s3) s3._heldRestartAskedAt = now; } // the stamp: a request that went out is never doubled
    return { sent: true, affected: fresh };
  }
  return { sent: false, affected: fresh };
}
/** The MANUAL routes (pool target / member narrowing) answer `affected` to the
 *  client that asked, which restarts them itself: the same rule — a conversation
 *  already being restarted is left out — and the ones handed over are stamped. */
function claimColdRestarts(affected, now = Date.now()) {
  const fresh = (Array.isArray(affected) ? affected : []).filter((t) => !restartInFlight(activeSessions.get(t.serverId), now));
  for (const t of fresh) { const s3 = activeSessions.get(t.serverId); if (s3) s3._heldRestartAskedAt = now; }
  return fresh;
}

// ── CAPS-ROUTED QUOTA PROBE (S4): ONE dispatcher for every "refresh this
// identity's quota now" need (wall verification, the wall probe ladder, the
// auto-resume pre-fire gate). The identity's HARNESS names the rung:
//   'cli-usage'       claude — `claude -p /usage` (usage-routes
//                     refreshViaCliPanel, the owner-approved auto-cli channel)
//   'rpc-rate-limits' codex — account/rateLimits/read on a LIVE local codex
//                     chat session's own app-server (wrapper verb
//                     codex-read-limits; the reply lands as rate_limits_updated
//                     and recordCodexQuotaSignal settles the waiter AFTER the
//                     cache write, so a verdict taken next already sees it)
//   null              nothing to run (shell / unknown) — the verdict stands
// Before this every probe spawned `claude -p /usage` whatever the backend: a
// codex identity burned a pointless claude process and never got a fresh
// reading (design-harness-plugins.md §1 P2). §ban-safety unchanged — both
// rungs make the OFFICIAL client do the fetch; nothing here touches a vendor.
function liveQuotaKeyFor(session) {
  let key = session._accountId || globalUsageKey(session.backend);
  // a pool wrapper never owns quota — the reading belongs to the member its
  // app-server HOLDS (stamped at spawn: it cannot hot-switch, see
  // heldPoolMemberFor), else the pool's CURRENT member (no stamp)
  try { const a = accounts.get(key); if (a && a.type === 'pooled') key = heldPoolMemberFor(session, key) || accounts.poolCurrentFor(key, session._webuiId) || accounts.poolCurrent(key) || key; } catch { }
  return key;
}
function pickLiveProbeSession(target, session) {
  const live = (s) => !!(s && s.pty && liveReadSource(s.backend) && s.mode === 'chat' && !s.host);
  // the asking session itself first: it sits idle-walled on exactly this
  // identity and its app-server is already up
  if (live(session)) return session;
  const ids = new Set(usageIdentityAccountIds(target));
  for (const [, s] of activeSessions) if (live(s) && ids.has(liveQuotaKeyFor(s))) return s;
  return null;
}
// the live read + its waiters are the HARNESS's (quota.readLive / quota.settleLive — codex: src/harnesses/codex-quota.js)
function liveReadSource(backend) { if (!harnesses.has(backend || 'claude')) return null; const q = quotaSourceFor(backend); return typeof q.readLive === 'function' ? q : null; }
function liveRead(session, timeoutMs, opts) { return liveReadSource(session.backend).readLive(session, timeoutMs, opts); }
function settleLive(session, result) { const q = session && liveReadSource(session.backend); if (q && typeof q.settleLive === 'function') q.settleLive(session, result); }
async function probeQuotaForKey(target, { session = null, timeoutMs = 20000, fresh = false } = {}) {
  const backend = quotaBackendFor(target, session);
  const rung = quotaSourceFor(backend).probe;
  global.__vsEvent?.('quota-probe', `${backend}:${rung || 'none'}`);
  if (rung === 'cli-usage') {
    const probe = getQuotaProbe?.();
    if (!probe) return { ok: false, rung, backend, reason: 'cli-usage probe not wired' };
    const ok = await Promise.resolve(probe(target)).catch(() => false);
    return { ok: !!ok, rung, backend, reason: ok ? null : 'cli panel did not answer' };
  }
  if (liveReadSource(backend)) {
    const s = pickLiveProbeSession(target, session);
    if (!s) return { ok: false, rung, backend, reason: `no live local ${backend} chat session on this identity` };
    const r = await liveRead(s, timeoutMs, { fresh });
    return { ok: !!r.ok, rung, backend, reason: r.reason || null };
  }
  return { ok: false, rung: null, backend, reason: `backend '${backend}' declares no quota probe` };
}

/** THE USAGE MENU'S CODEX ⟳, ANSWERED (lane reset-path R4, the owner: the press refreshed the cache at
 *  10:48:38 and nothing said so — a fixed 2.5 s timer repainted maybe, the only toast was the refusal). The
 *  read rides a live LOCAL codex chat session ON the identity the popup shows (its own app-server — the
 *  existing caps-routed rung, no new vendor surface), and the press waits for ITS round trip: the reading it
 *  wrote (whose, which windows, the stored credits), the wrapper's refusal, or the timeout — by name.
 *  `key` = the identity the popup displays; without one, the client's live session. */
async function refreshCodexForPerson({ key = null, sessionId = null, timeoutMs = 20000 } = {}) {
  const live = (x) => !!(x && x.pty && x.mode === 'chat' && !x.host && capsOf(x.backend).quotaProbe === 'rpc-rate-limits');
  // A POOL IS NOT A QUOTA HOLDER (verify r1, reproduced): the popup's `auto` selection sends the DEFAULT codex
  // account, which may be a pool — its sessions carry MEMBER keys, so the pool id matched none and the press was
  // refused "no running session on CxPool" while a member's session was live. The pool resolves to its current
  // member (the same rule a pool-billed reading lands by); the answer names the member
  if (key) { try { const a = accounts.get(String(key)); if (a && a.type === 'pooled') key = accounts.poolCurrentFor(String(key), null) || accounts.poolCurrent(String(key)) || key; } catch { } }
  let s = null;
  if (key) { try { s = pickLiveProbeSession(String(key), null); } catch { s = null; } }
  else { const c = sessionId ? activeSessions.get(String(sessionId)) : null; if (live(c)) s = c; }
  if (!s) return { ok: false, code: 'no_live_session', key: key || null, name: key ? nameOf(key) : null, error: key ? `no running Codex chat session holds ${nameOf(key)}'s login (the read rides that session's own app-server)` : 'no running Codex chat session (the read rides its own app-server)' };
  const r = await liveRead(s, timeoutMs);
  const k = (r && r.key) || liveQuotaKeyFor(s);
  if (!r || !r.ok) {
    const reason = String((r && r.reason) || 'unknown');
    return { ok: false, code: /within \d+ms/.test(reason) ? 'timeout' : (r && r.archived) ? 'archived' : 'refused', key: k, name: nameOf(k), sessionId: s._webuiId, timeoutMs, error: reason };
  }
  let c = null; try { c = readRawUsageCache(k); } catch { c = null; }
  // a window that has not STARTED (quota-model: its "reset" slides with the clock) names no deadline — B-8b12;
  // the toast then says "starts on first use", never a reset instant that is not one
  const win = (b) => (b && typeof b === 'object' ? { usedPercent: Number.isFinite(Number(b.usedPercent)) ? Number(b.usedPercent) : (Number.isFinite(Number(b.utilization)) ? Math.round(Number(b.utilization) * 1000) / 10 : null), resetsAt: quotaModel.bucketCounts(b) && Number(b.resetsAt) > 0 ? Number(b.resetsAt) : null, notStarted: b.state === 'empty', windowMinutes: Number(b.windowMinutes) > 0 ? Number(b.windowMinutes) : null } : null);
  const n = c && c.resetCredits && Number.isFinite(Number(c.resetCredits.availableCount)) ? Number(c.resetCredits.availableCount) : null;
  return { ok: true, key: k, name: nameOf(k), sessionId: s._webuiId, reading: { fiveHour: win(c && c.fiveHour), sevenDay: win(c && c.sevenDay), fetchedAt: (c && Number(c.fetchedAt)) || null, source: (c && c.source) || null }, resetCredits: n };
}

// Probe ladder (owner-set): immediate, then 30min → 1h → 2h, then give up
// loudly. Each attempt refreshes the blocking account through the caps-routed
// dispatcher above (official client makes the fetch — §ban-safety intact).
const _wallVerifyAt = new Map(); // scope → last blocked-entry verification probe (10min floor)
const WALL_PROBE_BACKOFF = [0, 1800000, 3600000, 7200000];
function scheduleWallProbe(session, scope, model, attempt) {
  const id = session._webuiId;
  if (attempt >= WALL_PROBE_BACKOFF.length) { console.log(`[wall] ${id}: no reset time after ${attempt} probes — giving up (manual resume needed)`); return; }
  try { clearTimeout(session._wallProbeTimer); } catch { }
  session._wallProbeTimer = setTimeout(async () => {
    session._wallProbeTimer = null;
    try {
      if (!activeSessions.has(id)) return;
      if (!getAutoResume()?.enabledFor?.(session)) return;
      const a = accounts.get(scope);
      const target = a && a.type === 'pooled' ? sessionBillingMember(session, scope).id : scope; // the member whose credentials the CLI reads (2026-09-07: the link, slot-validated)
      if (target) await probeQuotaForKey(target, { session }).catch(() => { }); // caps-routed: never a claude spawn for a codex identity
      const v = quotaVerdictFor(scope, { model, session });
      const ar = getAutoResume();
      if (v.usable === true) { ar?.armIfEnabled?.(id, session, Date.now() + 45000, 'account usable again'); return; }
      if (v.blockedUntil > Date.now()) { ar?.armIfEnabled?.(id, session, v.blockedUntil, v.reason, { cause: armCauseFor(v, null, null, 0) }); return; }
      scheduleWallProbe(session, scope, model, attempt + 1);
    } catch (e) { console.warn('[wall] probe failed:', e.message); }
  }, WALL_PROBE_BACKOFF[attempt]);
  if (session._wallProbeTimer.unref) session._wallProbeTimer.unref();
}

/** The pre-fire gate (auto-resume beforeFire): probe fresh quota, re-check
 *  the verdict — false vetoes the spend and re-arms to the new blockedUntil. */
const _preFireProbeAt = new Map(); // probe target → last pre-fire probe (60s floor)
async function beforeAutoResumeFire(id, session) {
  try {
    const model = sessionModelFor(session);
    const scope = _wallScope(session);
    const a = accounts.get(scope);
    const target = a && a.type === 'pooled' ? sessionBillingMember(session, scope).id : scope; // the member whose credentials the CLI reads (2026-09-07: the link, slot-validated)
    // The immediate (pool-switch) path runs this gate too since 2026-09-07,
    // so the probe needs a floor: the wall demotion wrote this target's cache
    // microseconds ago, and a `claude -p /usage` spawn per hot switch would be
    // a new cost on a path that fires in bursts. The RE-VERDICT below always
    // runs — only the spawn is throttled.
    const probedAt = target ? _preFireProbeAt.get(target) || 0 : 0;
    if (target && Date.now() - probedAt > 60e3) {
      _preFireProbeAt.set(target, Date.now());
      try { await probeQuotaForKey(target, { session }); } catch { } // caps-routed (S4): the identity's harness picks the rung
    }
    maybePoolAutoSwitch(session);
    const v = quotaVerdictFor(scope, { model, session });
    // a HELD process (r4) is continued only on a POSITIVE answer about the login
    // it holds: its verdict is that one member's, and "cannot tell" is not a go
    if (v.usable === false || (v.held && v.usable !== true)) {
      if (v.blockedUntil > Date.now()) getAutoResume()?.armIfEnabled?.(id, session, v.blockedUntil, 're-armed at fire: ' + v.reason, { cause: armCauseFor(v, null, null, 0) });
      else scheduleWallProbe(session, scope, model, 1);
      return false;
    }
    return true;
  } catch (e) {
    // FAIL CLOSED (P8). This is the gate auto-resume asks before it spends a
    // turn: it probes fresh quota, re-runs the pool decision and re-reads the
    // verdict. An exception means NONE of that happened, and `return true`
    // turned every failure of the money gate into a green light — the same
    // shape as the wiring's own `catch { return true; }` in server.js, so a
    // throw was answered with a billed turn at BOTH layers. A refusal here
    // costs one tick (30s) and says why.
    console.warn(`[auto-resume] pre-fire gate failed for ${id} — refusing the continue (fail closed): ${e && e.message}`);
    try { global.__vsEvent?.('spend-gate-error', 'beforeAutoResumeFire'); } catch { }
    return false;
  }
}
/** A `rate_limit_event` from either feed — taken only when it is a LIVE fact
 *  (gateLiveFact: a backlog's reading describes a window as it WAS). */
function recordRateLimitEvent(session, msg) {
  return gateLiveFact(session, msg, 'rate_limit_event', () => recordRateLimitEventNow(session, msg));
}
function recordRateLimitEventNow(session, msg) {
  try {
    // the session's harness classifies the record (S4 QuotaSignalSource) —
    // the parse itself is rate-limit-capture's, reached through the registry
    const sig = quotaSourceFor(session.backend).signalFromStream(msg);
    let ev = sig && sig.source === 'rate_limit_event' ? sig.ev : null;
    if (!ev) return;
    // THE MODEL-CAP LANE IS NAMED BEFORE ANYTHING READS THE EVENT'S KIND
    // (inc-mubu23bd-5vxi). `seven_day_overage_included` names the account's
    // per-model weekly bucket by its ACCOUNTING, not by model, so the record
    // arrives as a scoped lane with no name; the ladder (quota-model's
    // `nameModelCapLane`, run by rate-limit-capture against the account's
    // sidecar + limits) names it, and every signal, window and write below
    // carries that name. The key here is the best PRE-attribution answer (the
    // turn pin, else the session's slot) — `readingSlotFor` is NOT asked yet,
    // because asking it without the window would pin the turn before the lag
    // shadow had its say; the write re-asks the ladder on the key it lands on.
    const capHint = (() => { try { return familyOfModel(sessionModelFor(session)); } catch { return null; } })();
    const nameCap = (k) => resolveModelCapLane({ cacheDir: USAGE_CACHE_DIR, key: k, ev: { ...ev, modelCapLane: null, modelCapName: null, modelCapDisplay: null }, hint: capHint });
    const preKey = (session._turnReadingSlot && session._turnReadingSlot.key) || usageCacheKeyFor(session);
    if (ev.modelCap || (ev.windows && ev.windows.modelCap)) ev = nameCap(preKey);
    // Session-scoped actions below (pool switch, auto-resume) stay on THIS
    // session regardless of re-attribution: it is genuinely blocked no
    // matter whose bucket filled.
    // BOTH halves are facts about the credential SLOT the CLI reads (the
    // validated link): a REJECTION through rejectionSlotFor, a READING through
    // readingSlotFor — turn-pinned twins, because a rejection's other records
    // and a turn's other readings both arrive after the first one has already
    // moved the link. The observation only corroborates (it names the identity
    // cached at SPAWN, so keying on it filed a hot-switched session's numbers
    // under the account it started on — the 2026-09-07 root cause).
    // THE RECORD ITSELF NAMES ITS WINDOW (inc-mts8a8mr-ulmm). A reading event
    // carries the reset of the bucket it reports, and a weekly reset phase is
    // an account fingerprint — so the response can be asked which credentials
    // produced it, which is strictly better evidence than any bookkeeping of
    // ours about what the process is reading. A REJECTION deliberately keeps
    // the turn-pinned rejection slot untouched (its resetsAt is frequently
    // absent or a bounded guess, and its identity has its own r3 pin).
    // A 2.1.274 record states EVERY window, so the evidence handed to the
    // guard is every NAMED lane it states (the un-named placeholder carries no
    // identity); an older record is judged on its one bucket exactly as before.
    const win = ev.status === 'rejected' ? null : readingLag.windowOf(ev.windows ? lanesSnapshot(ev, { named: true }) : ev);
    // THE WITNESS RING TAKES ONE CANDIDATE PER RESPONSE, and the plan weekly
    // reset is the strongest fingerprint the response states — so it is the
    // candidate whenever `unifiedWindows.seven_day` is present, else the
    // representative bucket as before. (`noteApiDerivedWindow`'s own rules —
    // weekly only, K agreeing, the anchor stamp — are untouched.)
    const witnessEv = (ev.windows && ev.windows.sevenDay && ev.windows.sevenDay.resetsAt) ? { kind: 'sevenDay', scopedName: null, resetsAt: ev.windows.sevenDay.resetsAt } : ev;
    // THE FINGERPRINT IS "THE NUMBERS", not "the window" (caught by the shared-
    // phase leg of test-readings-attribution §14). The r3 clause says *the link
    // moved but the numbers did not*, and a window alone almost never moves —
    // fingerprinting only the window would shadow nearly every reading that
    // follows a re-point between two members sharing a weekly phase. The
    // statusline's `rlFingerprint` has always carried used_percentage for both
    // buckets; this is the same fact in this producer's own shape.
    const fp = win ? `${readingLag.windowFingerprint(win)}|k:${ev.kind}|u:${ev.utilization ?? '-'}` : null;
    const slot = ev.status === 'rejected' ? rejectionSlotFor(session) : readingSlotFor(session, Date.now(), { window: win, fingerprint: fp });
    let key = (slot && slot.key) || usageCacheKeyFor(session);
    let refiled = false; // the guard moved this reading off the slot's key — then the slot is not the witness for it
    // THE WITNESS ELIGIBILITY of this reading is judged BEFORE the guard, on
    // the slot it arrived on, with the corroboration the write below reuses:
    // a reading the guard archives or re-files still feeds the SLOT's ring
    // (that is how a genuinely moved window re-anchors itself), and one that
    // fails a leg feeds nothing (final verifier: one lagging reading on a
    // fresh member poisoned its witness for good)
    const slotKey = key;
    const witness = win ? apiWitnessEligibility(session, slot, key) : null;
    if (win) {
      const target = guardReadingTarget(key, win, { session, what: 'rate-limit-event:' + ev.kind, entry: { ev, slot, witness } });
      if (!target) {                             // archived with a reason — never written where it provably does not belong
        if (witness && witness.ok) noteApiDerivedWindow(slotKey, witnessEv, session, { outcome: 'archived' });
        return;
      }
      if (target !== key) {
        key = target; refiled = true;
        if (witness && witness.ok) noteApiDerivedWindow(slotKey, witnessEv, session, { outcome: 'refiled' });
        // the window is better evidence than the pin that produced the wrong
        // answer, so the REST of the turn follows it too (the 06:10:46Z shape:
        // a pin held from before three re-points filed one member's fresh
        // numbers on another for the whole turn)
        try { session._turnReadingSlot = { key, slotOk: !!validateBillingSlot(session?._accountId || null, key).ok, at: Date.now() }; } catch { }
      }
      try { session._lastReadingFp = { key, fp }; } catch { }
    }
    // A REJECTION IS WRITTEN THE INSTANT IT ARRIVES, so the attribution rule
    // has to run HERE too — not only when the turn ends (r2, the round-1
    // verifier's first finding). This write is what makes the pool act in the
    // same tick, and it was the one that put the incident's foreign 5h window
    // onto the pinned member: `guardReadingTarget` above is structurally
    // unreachable for a rejection (`win` is deliberately null) and the turn-end
    // pass, which files the wall on the true owner, has no reason to go back
    // and repair a bucket it never touched. `wallRecordTarget` asks exactly the
    // rule `wallTargetFor` asks, over the same two witnesses, so the two writes
    // of one rejection can never disagree about where it belongs.
    let writeKey = key;
    if (ev.status === 'rejected') {
      writeKey = wallRecordTarget(session, key, ev);
      if (!writeKey) {
        // archived with a reason, inside. The SESSION is still blocked whoever
        // owns the bucket, so the session-scoped half below still runs — we
        // refused to write a number, not to notice a wall.
        maybePoolAutoSwitch(session);
        try { noteWallSignal(session, { resetsAtMs: (Number(ev.resetsAt) || 0) * 1000, bucket: ev.kind, scopedName: ev.scopedName, key, slot: !!slot?.slotOk }); } catch { }
        return;
      }
    }
    // A REJECTION WHOSE LANE WE CANNOT YET NAME IS NOT WRITTEN YET
    // (2026-09-13). claude has no `seven_day_<model>` type for a model cap, so
    // an unscoped weekly rejection is BOTH shapes until this turn's banner or
    // the turn-end evidence rule says which. The SIGNAL is raised now — the
    // session is blocked whoever owns the bucket, the turn still classifies as
    // walled, and the pool still moves in this tick — but the BUCKET mark waits
    // for the lane. See resolveTurnLane.
    if (laneIsProvisional(session, ev)) {
      deferTurnLane(session, { key: writeKey, resetsAt: ev.resetsAt, rawType: ev.rawType });
      global.__vsEvent?.('rate-limit-lane-deferred', `${writeKey}:${ev.rawType}`);
      maybePoolAutoSwitch(session);
      try { noteWallSignal(session, { resetsAtMs: (Number(ev.resetsAt) || 0) * 1000, bucket: ev.kind, scopedName: ev.scopedName, key, slot: !!slot?.slotOk, provisional: true }); } catch { }
      // the banner of this turn may already have named the lane (B-ccaa) —
      // AFTER the provisional signal is on the list, so the resolve rewrites it
      if (session._turnBannerLane) { try { laneFromBanner(session, session._turnBannerLane); } catch (e) { console.warn('[wall] lane-from-banner failed:', e.message); } }
      return;
    }
    // the lane is named on the key it LANDS on (the guard may have moved it)
    if (writeKey !== preKey && (ev.modelCap || (ev.windows && ev.windows.modelCap))) ev = nameCap(writeKey);
    const r = captureRateLimitEvent({ cacheDir: USAGE_CACHE_DIR, key: writeKey, identityIds: usageIdentityAccountIds(writeKey), ev, hint: capHint });
    if (r.unknownType) { global.__vsEvent?.('rate-limit-event-unknown-type', r.unknownType); return; }
    // THE LANE DECISION IS SAID, like resolveTurnLane says its own: a model-cap
    // rejection names the cap it marked (or the placeholder) and which rung
    // decided, so the journal can be read back against the pool's next move.
    if (ev.modelCap && ev.status === 'rejected') {
      const lane = ev.modelCapLane || {};
      console.log(`[wall] ${session._webuiId}: model-cap rejection on ${nameOf(writeKey)} → ${lane.named ? 'the ' + lane.name + ' model cap' : 'the un-named model cap (placeholder)'} (${lane.why || 'no rule spoke'})`);
      global.__vsEvent?.('rate-limit-lane', `${writeKey}:scoped:${ev.modelCapName || 'cap'}`);
    }
    global.__vsEvent?.('rate-limit-event', `${writeKey}:${ev.kind}:${ev.status}${r.wroteReading ? ':reading' : ''}`);
    // THE API-DERIVED WINDOW (B-855a): a reading the account's OWN API stated,
    // filed on a slot-VALIDATED link, not re-filed by the guard and eligible
    // as a witness, is ONE candidate for the ring the panel probe is checked
    // against — K agreeing candidates make it the witness.
    if (r.wroteReading && ev.status !== 'rejected' && win && !refiled && witness && witness.ok) noteApiDerivedWindow(writeKey, witnessEv, session, { outcome: 'write' });
    // a reading busts the estimator memo via fetchedAt and becomes an anchor
    // at the next sweep; exhaustion acts NOW (banner parity)
    if (r.dead) {
      maybePoolAutoSwitch(session);                    // another account = seconds, not hours: always preferred
      // wall-machine SIGNAL (2.369.0): no arming here — the turn's RESULT
      // classifies (a turn the switch rescues completes normally and never
      // enters BLOCKED; a genuinely walled turn arms off quotaVerdict).
      try { noteWallSignal(session, { resetsAtMs: (Number(ev.resetsAt) || 0) * 1000, bucket: ev.kind, scopedName: ev.scopedName, key, slot: !!slot?.slotOk }); } catch { }
    } else if (r.wroteReading) {
      // ONE reading edge for every harness (noteQuotaReadingForResume): drops
      // an un-armed session's timed wait exactly as before, and asks an ARMED
      // one whether this reading says the wall is gone. A `rate_limit_event`
      // names ONE bucket, so the snapshot handed over is that bucket in the
      // shared shape — claude states no limit lane, so the lane matches by
      // construction and every claude reading is judged on its numbers alone.
      // A 2.1.274 record states every window, so the snapshot handed over is
      // every lane it states (the edge's own rule — "no OTHER stated bucket of
      // that lane is spent" — then judges them all); an older record still
      // names its one bucket.
      if (ev.status && ev.status !== 'rejected') {
        const snap = ev.windows ? lanesSnapshot(ev)
          : ev.kind === 'scoped'
            ? { scopedWeekly: [{ name: ev.scopedName || '', utilization: ev.utilization, resetsAt: ev.resetsAt }] }
            : { [ev.kind]: { utilization: ev.utilization, resetsAt: ev.resetsAt } };
        noteQuotaReadingForResume(session, snap, 'fresh non-rejected reading');
      }
      kickPoolEval();
    }
  } catch (e) { console.warn('[usage] rate_limit_event capture failed:', e.message); }
}
// ── THE RESET-CREDIT RUNG (docs/design-reset-credits.zh.md §2-§4, owner rulings
// 2026-09-22) ─────────────────────────────────────────────────────────────────
// A stored reset credit is spent at a WALL only, and only when the PURE verdict
// (src/reset-credit.js) says it is worth it at this rung. The ladder FORKS BY
// WARMTH: a credit keeps the SAME account, so the prompt cache stays warm, while
// a pool switch cold-starts the whole context — a WARM conversation (in a turn,
// or its cache not yet cold) tries the credit BEFORE the switch; a COLD one
// switches first, and the credit is its rung only when no pool member can take
// it (`poolAlternative === false`). ONE call site shape, before the switch rung:
// the verdict answers `cold-switch-first` for a cold conversation with somewhere
// to go, so the fork is the verdict's, never a second branch here.
// Three MODES (`limitResetCredit`, read through the session's own harness, never
// an id): off (default, NEVER auto) — the wall card names the credits and nothing
// is spent; ask — ONE For-you decision per limit event, then the switch/wait
// rungs run as usual; auto — consumed through the spend ceiling (fail closed).
const i18nKey = (s) => s; // the extraction marker (scripts/i18n-extract.mjs): the client words the item with t(key, params)
// THE FLOOR (10 min) AND THE ACK WINDOW (90 s) are the PURE rule's (src/reset-credit.js
// attemptBlock — lane reset-path): the floor arms only on a consume that WENT OUT
const RESET_CREDIT_FLOOR_MS = resetCredit.RESET_CREDIT_FLOOR_MS; // one try per limit event (the 2.368.21 floor, now the verdict's `cooldownUntilSec`)
const RESET_CREDIT_ACK_MS = Number(resetCreditAckMs) > 0 ? Number(resetCreditAckMs) : resetCredit.RESET_CREDIT_ACK_MS;
// THE ONE-TRY FLOOR IS PER IDENTITY, NOT PER SESSION (r2, reproduced on the real
// engine): one account wall seen by two warm conversations billing it spent TWO
// credits — the floor lived on each session — and the second one's
// `alreadyRedeemed` then demoted the account the first had just re-opened and
// moved the whole pool off it. An attempt is recorded HERE, keyed by the
// credit's identity (the member the carrying process holds — creditIdentityFor),
// and read by the rung's `cooldownUntilSec` AND the manual preview. While an
// attempt is IN FLIGHT (written, no answer yet, inside the floor) a sibling
// conversation walled on the same identity FOLLOWS it instead of walking the
// switch/wait ladder: the leader's answer settles every follower (a reset
// re-opens the window for all of them; a failure walks each one's ladder; no
// answer within the floor counts as a failure).
// THE FLOOR ARMS ONLY ON A CONSUME THAT WENT OUT (lane reset-path, 2026-10-01, the owner's
// report: a refused attempt said "already tried in the last 10 minutes — try again after 10:40").
// The record was stamped when the verb was WRITTEN, so a wrapper older than the idempotency key
// (codex refused the keyless consume locally), a wrapper that never answered and a vendor
// `nothingToReset` all armed the floor as if a credit had been spent. Now an attempt is OPEN
// (written) until the wrapper / the helper reports it SENT the request with its key
// (`reset_credit_sent`, or a keyed answer that counts its attempts): only then is the spend
// charged and the floor armed, and only `reset` and an UNANSWERED sent consume keep it
// (src/reset-credit.js creditAnswerOf / attemptBlock). An open attempt nobody reports sent within
// RESET_CREDIT_ACK_MS is settled `not-sent`: its spend hold released, nothing armed, a person told.
/** The vendor's non-reset outcomes in words (codex-cli 0.159.3's own enum
 *  descriptions); an unknown outcome is quoted as the vendor said it. */
const RESET_CREDIT_OUTCOME_WORDS = {
  nothingToReset: 'no current limit window is eligible for a reset (nothing was spent)',
  noCredit: 'the account has no reset credits available',
};
const _resetCreditTries = new Map(); // credit identity → { key, at, sentAt, sid, via, origin, resetsAtSec, lane, eventKey, idempotencyKey, hold, identity, charged, followers: Map(sid → {resetsAtSec, lane}), outcome, outcomeAt, timer, ackTimer, creditsAt, reportsSent, window, settled, prior }
// THE ATTEMPTS SURVIVE A RESTART (verify r1, the money class — reproduced: a press that went out, the server
// restarted for an update, the floor gone with the process, the next press minted a second key). Every state
// change writes data/reset-credit-tries.json (atomic); at boot the newest attempt per identity (+ its unsettled
// priors) comes back — one the process DIED WITH (no outcome) is `unknown`: it may have gone out, so it is
// unsettled until a reading of the account proves it (settleResetCreditByReading), never free by the restart.
const RESET_CREDIT_TRIES_FILE = path.join(rootDir, 'data', 'reset-credit-tries.json');
const RESET_CREDIT_TRIES_KEEP_MS = 24 * 3600e3; // a settled attempt older than this blocks nothing — not carried
function resetCreditTryRecord(t) {
  if (!t) return null;
  const { key, at, sentAt, sid, via, origin, resetsAtSec, lane, eventKey, idempotencyKey, identity, charged, outcome, outcomeAt, creditsAt, reportsSent, window, settled, supersededAt, readFirst, revivedAt, reopenedAt, pressedAt, sentGuessed } = t;
  return { key, at, sentAt, sid, via, origin, resetsAtSec, lane, eventKey, idempotencyKey, identity: identity && typeof identity === 'object' ? { key: identity.key, name: identity.name } : null, charged: !!charged, outcome, outcomeAt, creditsAt, reportsSent, window, settled, ...(supersededAt ? { supersededAt } : {}), ...(readFirst ? { readFirst: true } : {}), ...(revivedAt ? { revivedAt } : {}), ...(reopenedAt ? { reopenedAt } : {}), ...(pressedAt ? { pressedAt } : {}), ...(sentGuessed ? { sentGuessed: true } : {}), prior: resetCreditTryRecord(t.prior) };
}
function persistResetCreditTries() {
  try {
    const now = Date.now();
    const tries = [];
    for (const t of _resetCreditTries.values()) {
      if (!t) continue;
      const open = !t.outcome || resetCredit.isUnsettled(t, clockOpts(now)) || !!resetCredit.unsettledInChain(t.prior, clockOpts(now));
      if (!open && now - (Number(t.outcomeAt) || Number(t.at) || 0) > RESET_CREDIT_TRIES_KEEP_MS) continue;
      tries.push(resetCreditTryRecord(t));
    }
    const tmp = RESET_CREDIT_TRIES_FILE + '.tmp';
    fs.mkdirSync(path.dirname(RESET_CREDIT_TRIES_FILE), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify({ v: 1, at: now, tries }));
    fs.renameSync(tmp, RESET_CREDIT_TRIES_FILE);
  } catch (e) { console.warn('[reset-credit] attempts not persisted:', e.message); }
}
// verify r2 (reproduced): an unreadable attempts file was SILENTLY ignored at boot — no line, the bytes left in place
// to be overwritten by the next write, and the next press minted a key as if no request had ever gone out. The
// attempts cannot be recovered (there is nothing to read), so the honest thing is to say it: the file is set aside
// with its bytes (`.corrupt-<ts>`), the journal names it, and ONE For-you item tells the person to ⟳ a codex account
// before using a reset credit on it (an earlier request may have gone out). The inbox is created after this engine
// (server.js), so the item is filed lazily — at the first preview, the first sweep
let _resetCreditTriesLost = null; // { file, asideAs, at, why, filed }
function fileResetCreditTriesLost() {
  const L = _resetCreditTriesLost;
  if (!L || L.filed) return false;
  let todos = null;
  try { todos = getUserTodos(); } catch { todos = null; }
  if (!todos || typeof todos.add !== 'function') return false;
  try {
    const item = todos.add('webui:reset-credit', {
      origin: 'pool',
      text: 'The reset-credit attempt records could not be read at start — before using a codex reset credit, refresh the account (⟳) first',
      detail: `${path.basename(L.file)} was unreadable (${L.why}); it was set aside as ${path.basename(L.asideAs)} with its bytes. Any reset-credit request that was open before the restart is unknown now: a refresh of the account shows its stored credit count before you spend one.`,
      urgency: 'normal', kind: 'notice',
      i18n: { text: { key: i18nKey('The reset-credit attempt records could not be read at start — before using a codex reset credit, refresh the account (⟳) first'), params: {} } },
    });
    L.filed = !!(item && item.id);
  } catch (e) { console.warn('[reset-credit] could not file the For-you notice about the unreadable attempts file:', e.message); }
  return L.filed;
}
function loadResetCreditTries() {
  let doc = null, raw = null;
  try { raw = fs.readFileSync(RESET_CREDIT_TRIES_FILE, 'utf8'); } catch { return 0; } // no file = no attempts (the common first boot)
  let why = null;
  try { doc = JSON.parse(raw); } catch (e) { why = 'not JSON: ' + String(e.message).slice(0, 80); }
  if (!why && (!doc || doc.v !== 1 || !Array.isArray(doc.tries))) why = 'not the attempts shape (v 1, tries[])';
  if (why) {
    const asideAs = `${RESET_CREDIT_TRIES_FILE}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    try { fs.renameSync(RESET_CREDIT_TRIES_FILE, asideAs); } catch (e) { console.warn('[reset-credit] could not set the unreadable attempts file aside:', e.message); }
    console.warn(`[reset-credit] data/reset-credit-tries.json is unreadable (${why}) — set aside as ${path.basename(asideAs)}; every reset-credit request open before this start is UNKNOWN now (a press on a codex account should refresh it first)`);
    _resetCreditTriesLost = { file: RESET_CREDIT_TRIES_FILE, asideAs, at: Date.now(), why, filed: false };
    fileResetCreditTriesLost();
    return 0;
  }
  const revive = (r) => {
    if (!r || typeof r !== 'object' || typeof r.key !== 'string' || !Number(r.at)) return null;
    const t = { ...r, hold: null, followers: new Map(), timer: null, ackTimer: null, prior: revive(r.prior) };
    // verify r2: a record written before the null guard above carries the fabricated 0 — a REAL count of 0 at a
    // press is impossible (the preview refuses `no_credits`, the verdict `no-credits` first), so 0 means unknown
    if (t.creditsAt === 0) t.creditsAt = null;
    if (!t.outcome) { // the process died with it open: it may have gone out
      // verify r10 ② (reproduced, money — latent until the buffer-file catch-up below re-fed old pushes): WHICH half is the
      // guess. A record the old engine saw SENT (`reset_credit_sent`: sentAt persisted > 0) is revived unknown with its send a
      // FACT — nothing a wrapper says later re-opens it (its answer or a reading settles it); only a record with NO send on
      // file has its send GUESSED here (`sentGuessed`), and that one the wrapper's own later word (its read pushed, its
      // `skipped`) may overturn. r9 keyed the predicate on `revivedAt` alone, so a replayed `beforeReset` push re-opened a
      // SENT record: a go to nobody, the ack window ended it not-sent ("nothing spent"), a second press minted a second key
      t.sentGuessed = !(Number(t.sentAt) > 0);
      t.sentAt = Number(t.sentAt) || Number(t.at); t.outcome = 'unknown'; t.outcomeAt = Date.now(); t.settled = null;
      t.revivedAt = Date.now(); // verify r9 ② (reproduced): the boot's GUESS, marked — a reads-first wrapper's own later word for this key (its read pushed, its `skipped`) overturns it (verify r10: only while the SEND is guessed too — `sentGuessed`)
      console.log(`[reset-credit] ${t.sid || 'helper'}: the reset-credit request on ${nameOf(t.key)} was open when the server last stopped — it may have gone out: unsettled until a reading of the account settles it`);
      // verify r2 (reproduced, D6 never under-count): the live path charges an unknown consume (onResetCreditUnknown);
      // the restart's one was revived unknown and NEVER charged — its spend hold died with the process, so the ledger
      // showed nothing spent. Charged here, by the identity the record carries; the file is re-written below so a
      // second restart cannot charge it twice
      if (!t.charged) {
        t.charged = true; charged++;
        try { spendGuard.note({ reason: 'codex-reset-credit', session: null, identity: t.identity && t.identity.key ? t.identity : { key: t.key, name: nameOf(t.key) || t.key }, hold: null }); } catch (e) { console.warn('[codex] spend accounting failed (restart):', e.message); }
      }
    }
    // verify r3: a record that went out supersedes its priors from its send (a lapsed one is dropped — nothing can settle it)
    if (Number(t.sentAt) > 0) t.prior = resetCredit.supersede(t.prior, Number(t.sentAt), clockOpts(Number(t.sentAt)));
    return t;
  };
  let n = 0, charged = 0;
  for (const r of doc.tries) { const t = revive(r); if (t) { _resetCreditTries.set(t.key, t); n++; } }
  if (n) console.log(`[reset-credit] ${n} attempt record${n === 1 ? '' : 's'} restored from the last run${charged ? ` (${charged} open at the stop, charged now)` : ''}`);
  if (charged) persistResetCreditTries();
  return n;
}
loadResetCreditTries();
/** The newest attempt on this identity (its identity GROUP — one login under
 *  two account records is one credit store). */
function resetCreditTryFor(key) {
  if (!key) return null;
  const ids = new Set([key]);
  try { for (const id of usageIdentityAccountIds(key) || []) ids.add(id); } catch { }
  let best = null;
  for (const id of ids) { const t = _resetCreditTries.get(id); if (t && (!best || t.at > best.at)) best = t; }
  return best;
}
/** What the identity's newest attempt blocks now — `in_flight` (written, not yet sent) or
 *  `cooldown` (THE floor: a consume that went out) — the PURE rule (lane reset-path). */
function resetCreditBlock(key, now = Date.now()) { return resetCredit.attemptBlock(resetCreditTryFor(key), { now, floorMs: RESET_CREDIT_FLOOR_MS, ackMs: RESET_CREDIT_ACK_MS }); }
/** The PURE rule's clock facts (verify r3): every `isUnsettled` / `unsettledInChain` / `settleByReading` / `isLapsed`
 *  here is judged by the clock with THIS engine's floor and ack window — the timers only make the verdict durable. */
function clockOpts(now = Date.now()) { return { now, floorMs: RESET_CREDIT_FLOOR_MS, ackMs: RESET_CREDIT_ACK_MS }; }
/** OPEN = no answer yet: written and waiting for its "sent" (≤ the ack window), or sent and
 *  waiting for its answer (≤ the floor). A sibling walled on the same identity follows it. */
function resetCreditInFlight(t, now = Date.now()) { return !!(t && !t.outcome && (t.sentAt ? now - t.sentAt < RESET_CREDIT_FLOOR_MS : now - t.at < RESET_CREDIT_ACK_MS)); }
/** The attempt an answer belongs to: by the press's idempotency key when the answer echoes one
 *  (the current wrapper, the 2.369.199 one, the helper), else this session's own open record. */
function resetCreditTryByAnswer(payload, session, tKey) {
  const k = payload && typeof payload.idempotencyKey === 'string' && payload.idempotencyKey ? payload.idempotencyKey : null;
  if (k) {
    for (const t of _resetCreditTries.values()) for (let x = t; x; x = x.prior) if (x && x.idempotencyKey === k) return x; // …or the UNSETTLED attempt a newer press kept as `prior` (verify r1)
    // verify r4 (reproduced, the attribution class): a KEYED answer belongs to its key and to nothing else — press 1's
    // consume landed LATE (its record settled not-landed by the read before press 2 and dropped from the chain at press
    // 2's send) and its keyed `reset` fell through to the session's CURRENT record: a hung press 2 was marked landed, the
    // person's origin consumed (their press's own failure then went unsaid) and a person's press walked the ladder
    return null;
  }
  const t0 = tKey ? _resetCreditTries.get(tKey) : null;
  return t0 && session && t0.sid === session._webuiId ? t0 : null;
}
/** A WALL RECORD RESTATING THE EVENT A CREDIT JUST RE-OPENED (r5, reproduced on
 *  the real engine): a third conversation whose turn was in flight at the vendor
 *  when the credit landed comes back rejected with the SAME stated reset. It is
 *  the old event, not a new wall — writing it re-marked the re-opened account
 *  spent (newer than its open post-reset reading), released the reset hold, and
 *  the next evaluation moved the pool off the account the credit had just paid
 *  to re-open (every follower cold-restarted). The try with outcome `reset`
 *  inside the one-try floor whose stated reset EQUALS this record's (0 = "stated
 *  none" on both sides counts as equal; a record that states a DIFFERENT reset,
 *  or states one the try did not, is a new wall) → the try, else null. */
function restatedResetWallTry(key, resetsAtSec, now = Date.now()) {
  const t = resetCreditTryFor(key);
  if (!t || t.outcome !== 'reset' || !(now - t.outcomeAt < RESET_CREDIT_FLOOR_MS)) return null;
  return (Number(resetsAtSec) || 0) === (Number(t.resetsAtSec) || 0) ? t : null;
}
/** The switch/wait rungs after a credit that did not land — ONE spelling for
 *  the attempt's own conversation and every follower. */
function walkLadderAfterCredit(s, { resetsAtSec = 0, lane = null, key = null } = {}) {
  maybePoolAutoSwitch(s);
  try { noteWallSignal(s, { resetsAtMs: (Number(resetsAtSec) || 0) * 1000, bucket: 'sevenDay', key: key || liveQuotaKeyFor(s), lane: lane || null }); noteTurnEnd(s); } catch { }
}
/** Settle an attempt: the followers get the leader's answer. `failed` walks
 *  their ladder; `superseded` (the limit is open after all) walks nothing. */
function settleResetCreditTry(t, outcome, { failed = false, superseded = false } = {}) {
  if (!t || t.outcome) return;
  t.outcome = outcome; t.outcomeAt = Date.now();
  try { clearTimeout(t.timer); } catch { }
  try { clearTimeout(t.ackTimer); } catch { }
  persistResetCreditTries();
  for (const [sid, f] of t.followers) {
    const s = activeSessions.get(sid);
    if (!s) continue;
    if (!failed) { try { getAutoResume()?.noteRecovered?.(sid, 'codex reset credit consumed (by another conversation on this account)', { worked: false }); } catch { } continue; }
    if (superseded) continue;
    console.log(`[reset-credit] ${sid}: the credit it waited on did not land (${outcome}) — walking its switch/wait ladder`);
    walkLadderAfterCredit(s, { resetsAtSec: f.resetsAtSec, lane: f.lane, key: t.key });
  }
  t.followers.clear();
}
// ── THE RE-OPENED WINDOW WAITS FOR ITS OWN READING (reset credits r3,
// reproduced in the wrapper's REAL event order). A consumed credit's answer
// `reset` says the limit re-opened, but the account's cache still carries the
// wall's own spent mark until a post-reset reading lands — and a 0.x wrapper
// emits `reset_credit_result` FIRST and re-reads (a second rpc round trip, up
// to 20 s) after. An eval taken in that gap read the spent mark and moved the
// pool off the account the credit had just re-opened ("auto-switched to Cx Beta
// — restarting its conversations" seconds after "continuing on the same
// account"): the credit spent AND every follower cold-restarted. So a `reset`
// with no reading newer than the attempt HOLDS every pool decision away from
// that identity until its next reading lands (the release re-decides at once)
// or RESET_PENDING_MS passes. The current wrapper also emits its re-read
// BEFORE the result, which makes the hold the fallback for the ones still
// running (a restart leaves a live wrapper on its old code).
const RESET_PENDING_MS = 30e3;        // the first wait: the wrapper's re-read (one rpc round trip, ≤ 20 s)
const RESET_HOLD_MAX_MS = 10 * 60e3;  // the ceiling: the credit's own 10-min floor (RESET_CREDIT_FLOOR_MS)
const _resetCreditPending = new Map(); // identity key → { at, sid, until, timer, probes }
/** [key, pending] for identity `key` (or one of its identity group), or null. */
function resetHoldEntry(key, now = Date.now()) {
  if (!key) return null;
  const ids = new Set([key]);
  try { for (const id of usageIdentityAccountIds(key) || []) ids.add(id); } catch { }
  for (const id of ids) { const p = _resetCreditPending.get(id); if (p && now < p.until) return [id, p]; }
  return null;
}
function resetCreditPendingFor(key, now = Date.now()) { const e = resetHoldEntry(key, now); return e ? e[1] : null; }
/** THE VENDOR'S `reset` IS THE FACT UNTIL A READING SAYS OTHERWISE (r4,
 *  reproduced): the r3 hold lifted after 30 s with no reading and FORCED a
 *  re-decide on the wall's own pre-reset mark — the pool left the account the
 *  credit had just re-opened and cold-restarted every follower (the r2 incident,
 *  30 s later), while nothing had even asked the account for its state. Now the
 *  hold ASKS (the identity's own app-server, the `superseded` branch's rung —
 *  §ban-safety: the official client does the fetch) at once and again at 30 s,
 *  and lasts until a reading ENDS it (resetReadingEndsHold) or a new wall on the
 *  account does; at its 10-min ceiling it lifts WITHOUT a forced decision. */
function holdForResetReading(key, sid, now = Date.now()) {
  const prev = _resetCreditPending.get(key);
  try { clearTimeout(prev && prev.timer); } catch { }
  const p = { at: now, sid, until: now + RESET_HOLD_MAX_MS, timer: null, probes: 0 };
  _resetCreditPending.set(key, p);
  console.log(`[reset-credit] ${sid}: ${nameOf(key)}'s limit was reset — pool decisions about it wait for its post-reset reading (asking its app-server now; the pool keeps it meanwhile)`);
  probeDuringResetHold(key, p);
  armResetHoldTimer(key, p, RESET_PENDING_MS);
}
function armResetHoldTimer(key, p, ms) {
  try { clearTimeout(p.timer); } catch { }
  p.timer = setTimeout(() => onResetHoldTimer(key, p), ms);
  if (p.timer && p.timer.unref) p.timer.unref();
}
function probeDuringResetHold(key, p) {
  p.probes++;
  try {
    const s = activeSessions.get(p.sid) || null;
    Promise.resolve(probeQuotaForKey(key, { session: s, fresh: true })).catch(() => { }); // a re-ask after silence is written even while an older read waits
  } catch { }
}
function onResetHoldTimer(key, p) {
  if (_resetCreditPending.get(key) !== p) return; // released (or replaced) meanwhile
  const now = Date.now();
  if (now >= p.until) { releaseResetHold(key, `no post-reset reading within ${RESET_HOLD_MAX_MS / 60e3} min — the next evaluation decides on the cache as it stands`, { force: false }); return; }
  console.log(`[reset-credit] ${nameOf(key)}: no post-reset reading within ${RESET_PENDING_MS / 1000} s — asked its app-server again; the pool keeps it on the vendor's word (≤ ${Math.round((p.until - now) / 60e3)} min more)`);
  probeDuringResetHold(key, p);
  armResetHoldTimer(key, p, p.until - now);
}
/** Does THIS reading end the hold (r4, low)? Only a reading that is evidence
 *  about the account AFTER the reset: newer than the attempt AND either the
 *  leader's own (the conversation whose credit it was — its app-server answered
 *  after the consume, whatever it says) or one the verdict calls usable. A
 *  sibling's stale spent push in the gap is neither, and lifting the hold on it
 *  moved the pool off the re-opened account. → [key, p] | null */
function resetReadingEndsHold(identityKey, session, snap) {
  const e = resetHoldEntry(identityKey);
  if (!e) return null;
  const [, p] = e;
  if ((Number(snap && snap.fetchedAt) || Date.now()) < p.at) return null;
  if (session && session._webuiId === p.sid) return e;
  try { if (quotaVerdict(snap, Math.floor(Date.now() / 1000)).usable === true) return e; } catch { }
  console.log(`[reset-credit] ${nameOf(identityKey)}: a reading from ${session ? session._webuiId : '?'} still shows the wall — not the post-reset reading; the hold stands`);
  return null;
}
/** Lift the hold. `force` (a post-reset READING landed) re-decides every auto
 *  pool NOW on that reading (the per-record kick gate would otherwise swallow
 *  it: the reset's own kick closed that gate a moment ago); the ceiling and a
 *  new wall lift it without forcing anything. */
function releaseResetHold(key, why, { force = true } = {}) {
  const p = _resetCreditPending.get(key);
  if (!p) return false;
  try { clearTimeout(p.timer); } catch { }
  _resetCreditPending.delete(key);
  console.log(`[reset-credit] ${nameOf(key)}: pool decisions resume (${why})`);
  if (!force) return true;
  try {
    for (const a of accounts.list().accounts || []) {
      if (a.type !== 'pooled' || !a.auto) continue;
      if ((accounts.poolMembers(a.id) || []).some((m) => m.id === key)) { try { maybePoolAutoSwitchForPool(a.id, { force: true }); } catch { } }
    }
  } catch { }
  return true;
}
// ── AN ASK ITEM OUTLIVES ITS CARRIER (reset credits r3). The ask-mode For-you
// item's button spends the credit through a RUNNING session holding that
// account's login; once none does (the conversation restarted onto another
// member, or ended) the item could only ever answer no_live_session. The sweep
// dismisses it, by name in the journal — run on every pool evaluation kick
// (every codex reading) and whenever a preview finds no carrier. The item also
// carries `expiresAt` = the wall's own reset: after it the question is moot.
const _resetCreditAsks = new Map(); // For-you item id → { key, sid }
let _resetCreditAsksSeeded = false;
function sweepResetCreditAsks() {
  let todos = null;
  try { todos = getUserTodos(); } catch { todos = null; }
  // RE-SEEDED FROM THE INBOX once per process (r4): the map is memory, and an
  // item filed before a server restart was never dismissed by the new engine
  // (its button then answered no_live_session forever). The item itself carries
  // what the sweep needs (its action: accountKey + sessionId).
  if (!_resetCreditAsksSeeded && todos && typeof todos.snapshot === 'function') {
    _resetCreditAsksSeeded = true;
    try {
      for (const it of todos.snapshot().open || []) {
        const act = it && it.action;
        if (act && act.type === 'reset-credit' && act.accountKey && !_resetCreditAsks.has(it.id)) _resetCreditAsks.set(it.id, { key: String(act.accountKey), sid: act.sessionId || '?' });
      }
    } catch { }
  }
  if (!_resetCreditAsks.size) return 0;
  let n = 0;
  for (const [id, a] of [..._resetCreditAsks]) {
    let open = true;
    try { if (todos && typeof todos.snapshot === 'function') open = (todos.snapshot().open || []).some((x) => x.id === id); } catch { }
    if (!open) { _resetCreditAsks.delete(id); continue; }
    // lane reset-path: the question stays while ANY door can answer it — a conversation holding the login,
    // or the helper process on this machine's copy of it
    if (resetCreditCarriers(a.key).length || resetCreditHelperFor(a.key).ok) continue;
    _resetCreditAsks.delete(id);
    try { todos && todos.setStatus && todos.setStatus(id, 'dismissed', 'vibespace'); n++; } catch { }
    console.log(`[reset-credit] dismissed the For-you question about ${nameOf(a.key)}'s reset credit — no running conversation holds that login any more (${a.sid} restarted onto another member or ended)`);
  }
  return n;
}
/** WHOSE credit a session can spend: the member its process HOLDS (a non-hot
 *  pool's spawn member — heldPoolMemberFor), else the slot it bills. `moved` =
 *  the pool's current member is no longer the one this process holds (a cold
 *  restart is pending): the auto rung refuses by name there. `unknown` (r3) = a
 *  non-hot pool process with no stamp and no ledger row before it started:
 *  whose login it speaks as cannot be named, so the auto rung refuses it too. */
function creditIdentityFor(session) {
  let key = null;
  try { key = wallKeyFor(session); } catch { }
  key = key || liveQuotaKeyFor(session);
  let current = key, moved = false, unknown = false;
  try {
    const a = session._accountId && accounts.get(session._accountId);
    if (a && a.type === 'pooled') { current = accounts.poolCurrent(session._accountId) || key; moved = !!heldPoolMemberFor(session) && current !== key; unknown = heldPoolUnknown(session); }
  } catch { }
  return { key, current, moved, unknown };
}
/** The pool's current member for a pooled session (null otherwise) — what the
 *  exhaustion sites compare around the switch rung. */
function poolDefaultOf(session) {
  try { const a = session && session._accountId && accounts.get(session._accountId); return a && a.type === 'pooled' ? (accounts.poolCurrent(session._accountId) || null) : null; } catch { return null; }
}
/** The session harness's reset-credit mode, or null when it has no credit to spend. */
function resetCreditMode(session) {
  try {
    if (!session || capsOf(session.backend).resetCredit !== true) return null;
    if (!harnessDeclares(session.backend, 'limitResetCredit')) return null;
    return harnessSetting(session.backend, 'limitResetCredit') || 'off';
  } catch { return null; }
}
/** Stored credits for this identity: the account cache (the on-demand read's
 *  `resetCredits`), else the last count this session's own wrapper reported.
 *  null = unknown — never zero (the vendor answers "nothing to reset" to a
 *  consume with none, harmlessly). */
function resetCreditsLeft(session, key) {
  const n = (v) => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);
  // the session's own last read — only for the identity it was read FOR (p2: a
  // pool session switched to another member must not offer the old one's count)
  const seen0 = session && session._resetCreditsSeen;
  const seen = seen0 && !(seen0.key && key && seen0.key !== key) && n(seen0.count) !== null ? seen0 : null;
  let cached = null, cachedAt = 0;
  try { const c = key ? readRawUsageCache(key) : null; cached = n(c && c.resetCredits && c.resetCredits.availableCount); cachedAt = Number(c && c.resetCredits && c.resetCredits.at) || 0; } catch { }
  // the FRESHER statement wins (r2): the file carries a count across passive
  // pushes, so a later read this session heard (a write that lost a tie or was
  // archived) must not be shadowed by an older carried count
  if (cached !== null && seen && (Number(seen.at) || 0) > cachedAt) return n(seen.count);
  if (cached !== null) return cached;
  return seen ? n(seen.count) : null;
}
/** Warm = the conversation is in a turn OR its prompt cache has not gone cold
 *  (the SAME two facts the pool's warm-cache hold reads). */
function conversationWarmth(session, now = Date.now()) {
  const w = warmCache({ lastActivityMs: session._lastPtyDataAt, nowMs: now, model: cacheModelFor(session) });
  return { ...w, inTurn: conversationInTurn({ isStreaming: session._isStreaming, turnState: session._turnState }) };
}
/** Can the pool move this conversation onto another member RIGHT NOW? The same
 *  decision the switch rung makes (exhaustion tier, this conversation's own
 *  rejections excluded). A member that would only serve on USAGE CREDITS
 *  (pay-per-use, B-ad05) is NOT an alternative to a credit already paid for.
 *  Not a pool / auto off ⇒ false; a failure ⇒ null (unknown ⇒ switch first). */
function poolAlternativeFor(session, now = Date.now()) {
  try {
    const poolId = session && session._accountId;
    const a = poolId && accounts.get(poolId);
    if (!a || a.type !== 'pooled' || !a.auto || session.host) return false;
    const sid = session._webuiId;
    let currentId = null;
    try { currentId = accounts.poolCurrentFor(poolId, sid); } catch { }
    currentId = currentId || accounts.poolCurrent(poolId);
    if (!currentId) return false;
    const members = switchCandidates(poolId);
    const hot = !!a.hot && capsOf(a.backend).hotSwitch === 'verified';
    // AT A WALL THE CURRENT MEMBER CANNOT SERVE — asked as such, never read back
    // from the cache: the wall's own write may lose a same-instant tie with the
    // last reading (writeSnap keeps the newer file) or be archived by the window
    // guard, and a cache that still says "healthy" would answer "no alternative"
    // and spend a credit the switch rung did not need.
    const rc = poolReadCache(poolId);
    const readCache = (id) => (id === currentId ? { fetchedAt: now, sevenDay: { utilization: 1, resetsAt: 0 } } : rc(id));
    const d = decidePoolSwitch({ currentId, members, readCache, nowSec: now / 1000, proactive: false, hot, pessimism: darkTaintedAccounts(), exclude: [...sessionWalledMembers(sid, now)], readLogin: poolReadLogin(), priority: poolPriorityOf(a), reserveFloorPct: reserveFloorPct(), overageIds: overageMemberIds(members), creditsIds: creditsMemberIds(members), explain: true });
    return !!(d && d.to && !d.toCredits);
  } catch { return null; }
}
/** The tripped window's facts off a normalized snapshot: the bucket whose reset
 *  is the wall's (else the most-spent one) → {periodSec, remainingPct}. */
function trippedWindowFacts(snap, resetsAtSec) {
  const bs = [snap && snap.fiveHour, snap && snap.sevenDay].filter((b) => b && typeof b === 'object');
  const R = Number(resetsAtSec) || 0;
  const b = (R && bs.find((x) => Number(x.resetsAt) === R)) || bs.slice().sort((x, y) => (Number(y.utilization) || 0) - (Number(x.utilization) || 0))[0] || null;
  if (!b) return { periodSec: null, remainingPct: null };
  const u = Number.isFinite(Number(b.utilization)) ? Number(b.utilization) : (Number.isFinite(Number(b.usedPercent)) ? Number(b.usedPercent) / 100 : null);
  return { periodSec: Number(b.windowMinutes) > 0 ? Number(b.windowMinutes) * 60 : null, remainingPct: u === null ? null : Math.max(0, Math.min(100, (1 - u) * 100)) };
}
/** What a chat card at the wall / the auto-resume arm card carries so the
 *  client can offer the button (p2): `{available, mode}` — only when the
 *  session's harness can spend a credit AND this identity holds one. */
function resetCreditOffer(session) {
  try {
    const mode = resetCreditMode(session);
    if (!mode) return null;
    const key = creditIdentityFor(session).key; // the member this process HOLDS (r2)
    const n = resetCreditsLeft(session, key);
    // accountKey (p2): the card's button opens the dialog on THIS identity
    return n !== null && n > 0 ? { available: n, mode, accountKey: key } : null;
  } catch { return null; }
}
/**
 * THE ONE WRITER OF THE VERB (the auto rung AND the manual button, p2): the
 * spend ceiling first, then the one-try floor's stamp, the stdin verb on the
 * session's own wrapper, and the charge. A stored reset credit is money the
 * owner already paid for; the auto rung spends it while nobody is present —
 * the same consent class as an auto-resume continue — and design §4 routes
 * EVERY consumption through the same ceiling ("消费一律经 spend authorizer"), so
 * the manual button is counted too. Fail closed: an authorizer that throws does
 * not get to green-light it. THE MODULE'S OWN GUARD, not an injected dep (r2):
 * `spendGuard` is constructed above in this very file; the dep version of this
 * gate shipped DEAD — server.js never passed it.
 * `origin` 'auto' | 'user' rides the session so the RESULT handler knows whose
 * attempt it is answering: a failed USER attempt is reported, never walked
 * down the ladder a second time (the wall already ran it, or there is no wall).
 * `key` = THE CREDIT'S IDENTITY (r2): the member the carrying process holds,
 * handed to the ceiling as its identity so the spend is charged to, capped on
 * and named as the account whose credit it is — never re-resolved to the
 * pool's current member (which, after a switch the codex wrapper cannot follow,
 * is somebody else).
 * → {ok:true, identity} | {ok:false, why, detail} (why = the ceiling's refusal CODE, detail its sentence — which names the identity and the count; why null when it threw)
 */
function writeResetCredit(session, { resetsAtSec = 0, lane = null, origin = 'auto', now = Date.now(), key = null, readFirst = false } = {}) {
  key = key || creditIdentityFor(session).key;
  // THE READ BEFORE A PERSON'S PRESS (verify r8 T0, the owner's yes): the verb asks the wrapper for ONE
  // `account/rateLimits/read` before its consume; the wrapper's push (`rate_limits_updated {beforeReset, idempotencyKey}`)
  // is judged here by the same table as the helper's read-first (answerReadBeforePress → `codex-reset-credit-go`). Only a
  // person's press, only a wrapper that advertises the verb; the auto rung reads nothing extra
  const rf = readFirst === true && origin === 'user' && readBeforePress() && wrapperReadsFirst(session);
  let av = null;
  try { av = spendGuard.authorize({ reason: 'codex-reset-credit', session, sessionId: session._webuiId, sessionName: session.name || null, identity: key ? { key, name: nameOf(key) || key } : null }); }
  catch (e) { console.warn('[codex] spend authorizer threw — not spending a reset credit:', e.message); return { ok: false, why: null }; }
  if (av && av.ok === false) { console.log(`[codex] reset credit refused for ${session._webuiId} (spend budget: ${av.why})`); return { ok: false, why: av.why || 'refused', detail: av.detail || null }; }
  session._codexResetTriedAt = now;
  session._codexLastResetsAt = Number(resetsAtSec) || 0;
  // …and WHICH LANE it was: if the credit fails we arm from these two, and an
  // arm with no lane can never be reopened by a reading.
  session._codexLastLane = lane || null;
  session._resetCreditOrigin = origin === 'user' ? 'user' : 'auto';
  session._resetCreditKey = key || null;
  // THE PRESS'S IDEMPOTENCY KEY (lane-codex-0159): codex-cli >= 0.159 REFUSES a
  // consume without one ("Invalid request: missing field `idempotencyKey`" — the
  // 0.153 request had no params) and dedupes by it: "reuse the same value when
  // retrying that attempt" (the binary's own schema). ONE key per press, minted
  // HERE (the one writer of the verb) and handed to the wrapper in the verb, so a
  // retry of this press (the wrapper's one retry after a timed-out consume) can
  // never spend a second credit, while the next press mints a new key. A wrapper
  // older than the key ignores the field — its consume then fails on 0.159 and
  // the answer handler names the remedy (Terminate + Resume), never the raw text.
  const idemKey = crypto.randomUUID();
  // the IDENTITY's attempt (r2): the floor every session and the preview read — OPEN until the
  // wrapper reports the request went out (lane reset-path: the floor and the charge wait for it)
  if (key) openResetCreditTry({ key, sid: session._webuiId, via: 'session', origin: session._resetCreditOrigin, resetsAtSec, lane, now, idemKey, av, creditsAt: resetCreditsLeft(session, key), reportsSent: wrapperKeyState(session) === 'keyed', window: spentWindowOf(readRawUsageCache(key)), readFirst: rf });
  session.pty.write(JSON.stringify({ type: 'codex-reset-credit', idempotencyKey: idemKey, ...(rf ? { readFirst: true } : {}) }) + '\n');
  return { ok: true, identity: av && av.identity, idempotencyKey: idemKey, readFirst: rf };
}
/** Open the identity's attempt record (one writer: the session verb and the helper both open it
 *  here). The spend HOLD the authorizer took rides it: converted into the charge when the request
 *  goes out (noteResetCreditSent), given back when it never does (onResetCreditNotSent). */
function openResetCreditTry({ key, sid = null, via = 'session', origin = 'auto', resetsAtSec = 0, lane = null, now = Date.now(), idemKey, av = null, creditsAt = null, reportsSent = true, window = null, readFirst = false }) {
  const prev = _resetCreditTries.get(key);
  try { clearTimeout(prev && prev.timer); } catch { }
  try { clearTimeout(prev && prev.ackTimer); } catch { }
  const R = Number(resetsAtSec) || 0;
  // verify r1 (the unknown consume): `creditsAt` = the stored count at the attempt and `window` = the wall's
  // bucket {resetsAtSec, periodSec} — the two witnesses a later reading settles an unanswered consume by;
  // `reportsSent` = the carrier SAYS when the request leaves (the helper, a wrapper advertising resetCreditKey) —
  // one that cannot is never settled "not sent" by silence; an UNSETTLED previous attempt rides as `prior`
  // (a press reads first and settles it; its late answer still finds it)
  const t = { key, at: now, sentAt: 0, sid, via, origin: origin === 'user' ? 'user' : 'auto', resetsAtSec: R, lane: lane || null, eventKey: `${key}|${R || '?'}`, idempotencyKey: idemKey, hold: (av && av.hold) || null, identity: (av && av.identity) || null, charged: false, followers: new Map(), outcome: null, outcomeAt: 0, timer: null, ackTimer: null,
    // verify r2 (reproduced, money): `Number(null)` is 0 — an attempt on an account whose stored count was UNKNOWN
    // was recorded as `creditsAt: 0`, so the first reading ("count still 1 ≥ 0") settled it NOT LANDED and the next
    // press minted a second key over a consume that may have landed. No count = null, never a fabricated 0
    // verify r3 (reproduced, money): the prior is the newest UNSETTLED attempt in the chain, wherever it sits — a free
    // record in front of it (a helper that never started) used to hide it, and the next press consumed with no read
    creditsAt: creditsAt != null && creditsAt !== '' && Number.isFinite(Number(creditsAt)) ? Number(creditsAt) : null, reportsSent: reportsSent !== false, window: window && Number(window.resetsAtSec) > 0 ? { resetsAtSec: Number(window.resetsAtSec), periodSec: Number(window.periodSec) || null } : null, settled: null, readFirst: via === 'helper' || readFirst === true, prior: resetCredit.priorForPress(prev, clockOpts(now)) };
  // NOBODY SAID IT WENT OUT within the ack window ⇒ it did not (a wrapper that never took the
  // verb, a dead process): nothing armed, the hold given back, a person told, the followers walk
  t.ackTimer = setTimeout(() => onResetCreditNotSent(t), RESET_CREDIT_ACK_MS);
  if (t.ackTimer.unref) t.ackTimer.unref();
  _resetCreditTries.set(key, t);
  if (_resetCreditTries.size > 256) _resetCreditTries.delete(_resetCreditTries.keys().next().value);
  persistResetCreditTries();
  return t;
}
/** THE REQUEST WENT OUT (the wrapper's `reset_credit_sent`, the helper's onSent, or an answer that
 *  proves it): from here the floor is armed, the spend is charged — CHARGE WHAT YOU AUTHORIZED
 *  (r4): the slot the verdict resolved, handed back — and an answer is owed within the floor. */
function noteResetCreditSent(t, now = Date.now(), { proof = 'record' } = {}) {
  if (!t) return;
  // verify r10 (the buffer-file catch-up): a REAL send over a boot's GUESSED one — the record was revived unknown with
  // `sentAt` = its press instant. The wrapper's own `reset_credit_sent` RECORD (read back from its buffer file at ITS
  // instant, or live within ms of the send) carries the send instant: the floor runs from it, the guess is gone. An
  // ANSWER that proves a send (`proof: 'answer'`) carries no instant — the guess ends (nothing re-opens a sent record)
  // but the earliest-known instant stays (the parity walk with a short floor caught a re-stamp to the answer's arrival)
  if (t.sentGuessed) { t.sentGuessed = false; if (proof === 'record') t.sentAt = 0; }
  if (t.sentAt) return;
  t.sentAt = now;
  try { clearTimeout(t.ackTimer); } catch { }
  // verify r3: from this send on, no reading can judge the priors (the count it carries moves for THIS consume); a lapsed
  // prior can never be settled now and is dropped
  t.prior = resetCredit.supersede(t.prior, now, clockOpts(now));
  if (!t.charged) {
    t.charged = true;
    try { spendGuard.note({ reason: 'codex-reset-credit', session: t.sid ? activeSessions.get(t.sid) || null : null, identity: t.identity, hold: t.hold }); } catch (e) { console.warn('[codex] spend accounting failed:', e.message); }
  }
  // THE CHARGE IS ON DISK WITH THE SEND (verify r10, reproduced on the real engine — money): the record used to be persisted
  // BEFORE `charged` was set and never after, so the file said charged:false for every sent-and-unanswered press, and a
  // restart inside that window (the consume's round trip, up to the floor) charged the SAME consume a second time at the
  // boot — two ledger lines, the per-identity hour cap eaten twice. One persist, after the charge
  persistResetCreditTries();
  if (t.outcome) return; // a late "sent" after the attempt ended: charged, nothing left to wait for
  // NO ANSWER WITHIN THE FLOOR = a failure for the followers (and for the
  // auto leader): a dead wrapper must not leave them waiting on nothing
  t.timer = setTimeout(() => {
    if (t.outcome) return;
    console.log(`[reset-credit] ${t.sid || 'helper'}: no answer to the reset credit on ${nameOf(t.key)} within ${RESET_CREDIT_FLOOR_MS / 60e3} min — treating it as not landed`);
    settleResetCreditTry(t, 'no-answer', { failed: true });
    const leader = t.sid ? activeSessions.get(t.sid) : null;
    if (leader && t.origin === 'auto') walkLadderAfterCredit(leader, { resetsAtSec: t.resetsAtSec, lane: t.lane, key: t.key });
  }, RESET_CREDIT_FLOOR_MS);
  if (t.timer.unref) t.timer.unref();
}
/** The ack window passed and nothing said the request went out: it did not. */
function onResetCreditNotSent(t) {
  if (!t || t.outcome || t.sentAt) return;
  if (!t.reportsSent) return onResetCreditUnknown(t); // silence from a carrier that cannot say is not "not sent" (verify r1)
  try { if (t.hold && !t.charged) spendGuard.release({ hold: t.hold }); } catch { }
  console.log(`[reset-credit] ${t.sid || 'helper'}: the reset-credit request on ${nameOf(t.key)} was never sent (no word from ${t.via === 'helper' ? 'the helper' : 'the conversation\'s codex wrapper'} within ${RESET_CREDIT_ACK_MS / 1000} s) — nothing spent, the ten-minute wait not started`);
  settleResetCreditTry(t, 'not-sent', { failed: true });
  const leader = t.sid ? activeSessions.get(t.sid) : null;
  if (t.origin === 'user') {
    // (verify r5: every codex-reset-* notice carries its i18n key — the owner reads zh)
    serverNotice(`codex-reset-fail-${t.sid || 'helper'}-${Date.now()}`, `Reset credit not used on ${nameOf(t.key)} — ${t.via === 'helper' ? 'the codex helper process' : 'the conversation\'s codex wrapper'} never sent the request (nothing was spent). Use it again from the Agents list.`, { i18n: { key: t.via === 'helper' ? i18nKey('Reset credit not used on {account} — the codex helper process never sent the request (nothing was spent). Use it again from the Agents list.') : i18nKey('Reset credit not used on {account} — the conversation’s codex wrapper never sent the request (nothing was spent). Use it again from the Agents list.'), params: { account: nameOf(t.key) } } });
    if (leader) leader._resetCreditOrigin = null;
  } else if (leader) walkLadderAfterCredit(leader, { resetsAtSec: t.resetsAtSec, lane: t.lane, key: t.key });
}
/** THE UNKNOWN CONSUME (verify r1, the money class): the ack window passed with no word from a carrier that
 *  CANNOT report its send (a wrapper older than `resetCreditKey` under the auto rung, a process that died with
 *  the verb). The request may have gone out — so it is treated as sent at the write: charged, the floor armed,
 *  the followers walk, and after the floor the attempt stays UNSETTLED (every press and the rung blocked on
 *  this identity) until a reading of the account settles it (settleResetCreditByReading). Never "nothing spent". */
function onResetCreditUnknown(t) {
  if (!t || t.outcome || t.sentAt) return;
  t.sentAt = t.at;
  try { clearTimeout(t.ackTimer); } catch { }
  t.prior = resetCredit.supersede(t.prior, t.at, clockOpts()); // verify r3: it may have gone out at the write — the priors are superseded from then
  if (!t.charged) {
    t.charged = true;
    try { spendGuard.note({ reason: 'codex-reset-credit', session: t.sid ? activeSessions.get(t.sid) || null : null, identity: t.identity, hold: t.hold }); } catch (e) { console.warn('[codex] spend accounting failed:', e.message); }
  }
  console.log(`[reset-credit] ${t.sid || 'helper'}: no word about the reset-credit request on ${nameOf(t.key)} within ${RESET_CREDIT_ACK_MS / 1000} s from a wrapper that cannot report a send (it predates resetCreditKey) — the request MAY have gone out: charged, the ten-minute wait armed, and the account's next reading settles it`);
  settleResetCreditTry(t, 'unknown', { failed: true });
  const leader = t.sid ? activeSessions.get(t.sid) : null;
  if (t.origin === 'user') {
    serverNotice(`codex-reset-unknown-${t.sid || 'helper'}-${Date.now()}`, `Reset credit on ${nameOf(t.key)} — no answer came back within ${RESET_CREDIT_ACK_MS / 1000} s and the conversation's codex wrapper cannot say whether it sent the request; it may have been spent. The next reading of this account settles it (⟳ in the usage menu, or the account's next turn) — no second credit is minted before that.`, { i18n: { key: i18nKey('Reset credit on {account} — no answer came back within {secs} s and the conversation’s codex wrapper cannot say whether it sent the request; it may have been spent. The next reading of this account settles it (⟳ in the usage menu, or the account’s next turn) — no second credit is minted before that.'), params: { account: nameOf(t.key), secs: RESET_CREDIT_ACK_MS / 1000 } } });
    if (leader) leader._resetCreditOrigin = null;
  } else if (leader) walkLadderAfterCredit(leader, { resetsAtSec: t.resetsAtSec, lane: t.lane, key: t.key });
}
/** The wall's window as a READING states it (verify r1): the bucket with the attempt's period, else null. */
function readingWindowFor(snap, window) {
  if (!snap || !window || !Number(window.periodSec)) return null;
  for (const b of [snap.fiveHour, snap.sevenDay]) {
    if (!b || typeof b !== 'object') continue;
    if (Number(b.windowMinutes) * 60 === Number(window.periodSec)) return Number(b.resetsAt) > 0 ? Number(b.resetsAt) : null;
  }
  return null;
}
/** The START of the reading's longest window (s) — verify r2: an attempt that knew no window is settled `expired`
 *  once every window of the account began after its send. null when no bucket states both numbers. */
function readingWindowStart(snap) {
  let start = null;
  for (const b of [snap && snap.fiveHour, snap && snap.sevenDay]) {
    if (!b || typeof b !== 'object' || !(Number(b.resetsAt) > 0) || !(Number(b.windowMinutes) > 0)) continue;
    const s = Number(b.resetsAt) - Number(b.windowMinutes) * 60;
    if (start === null || s < start) start = s;
  }
  return start;
}
/** A READING OF THE IDENTITY SETTLES ITS UNANSWERED ATTEMPTS (verify r1): the newest attempt and the unsettled
 *  ones it kept as `prior`. Landed ⇒ the attempt becomes `reset` (the credit WAS used — every card offering it
 *  says so, the person is told); not landed / expired ⇒ the block ends; untold (verify r2: no count was known at
 *  the send) ⇒ the block ends and the person is told the count the reading carries. → the last verdict, or null */
function settleResetCreditByReading(key, snap) {
  if (!key || !snap) return null;
  let out = null;
  const co = clockOpts();
  // verify r5 (reproduced on the real engine, money): the cache FILE carries a stored count across pushes that state none
  // (usage-cache-write's `resetCredits` carry), so a reading whose `fetchedAt` is after the send may hold a count STAMPED
  // BEFORE it (`resetCredits.at`) — a passive push after the send + a vendor word no table lists settled an attempt NOT
  // LANDED on a count 11 minutes older than the send, and the next press consumed with no read. A count is a witness only
  // when its own stamp is after the send; the window the push states is fresh and still judges
  const rc = snap.resetCredits && typeof snap.resetCredits === 'object' ? snap.resetCredits : null;
  const count = rc && Number.isFinite(Number(rc.availableCount)) ? Number(rc.availableCount) : null;
  const countAt = Number(rc && rc.at) || Number(snap.fetchedAt) || 0;
  for (let x = resetCreditTryFor(key); x; x = x.prior) {
    if (!resetCredit.isUnsettled(x, co)) continue;
    const win = readingWindowFor(snap, x.window);
    const sentAt0 = Number(x.sentAt) || Number(x.at) || 0;
    const r = resetCredit.settleByReading(x, { fetchedAt: Number(snap.fetchedAt) || 0, creditsLeft: count !== null && countAt > sentAt0 ? count : null, resetsAtSec: win, periodSec: x.window && x.window.periodSec ? Number(x.window.periodSec) : null, windowStartSec: readingWindowStart(snap) }, co);
    if (!r) continue;
    x.settled = { how: r.how, why: r.why, at: Number(snap.fetchedAt) || Date.now() };
    persistResetCreditTries();
    const sentAt = x.sentAt || x.at;
    if (r.how === 'landed') {
      // verify r3: an attempt unsettled BY THE CLOCK (no outcome yet — its timer has not run) is settled like an answer:
      // its timers cleared, its followers told, the outcome on disk; one stamped by a timer only changes its word
      if (!x.outcome) settleResetCreditTry(x, 'reset'); else { x.outcome = 'reset'; x.outcomeAt = Date.now(); }
      console.log(`[reset-credit] ${x.sid || 'helper'}: the reset-credit request on ${nameOf(x.key)} sent ${new Date(sentAt).toISOString()} DID land — ${r.why}`);
      serverNotice(`codex-reset-settled-${x.sid || 'helper'}-${Date.now()}`, `Reset credit on ${nameOf(x.key)} — the request sent at ${new Date(sentAt).toISOString().slice(0, 16).replace('T', ' ')} UTC did land (${r.why}); the limit was reset then.`, { i18n: { key: i18nKey('Reset credit on {account} — the request sent at {time} did land ({why}); the limit was reset then.'), params: { account: nameOf(x.key), time: new Date(sentAt).toISOString().slice(0, 16).replace('T', ' ') + ' UTC', why: r.why } } });
      // the cards resolve at the READING's instant (as the answer path does): every card drawn before it offered this credit
      try { resolveResetCreditCards(x.key, { kind: 'used', at: x.settled.at, untilSec: win || null }); } catch { }
    } else if (r.how === 'untold') {
      // verify r2: the attempt knew no count and no window — nothing can ever say whether it landed; the block ends
      // and the person is told what the account holds NOW (the next press shows that count)
      console.log(`[reset-credit] ${x.sid || 'helper'}: the reset-credit request on ${nameOf(x.key)} sent ${new Date(sentAt).toISOString()} cannot be judged — ${r.why}; the block ends`);
      // verify r6 (reproduced): the AUTO rung's attempt ending untold was journal-only — "a credit may have been spent and
      // nobody can say" is the owner's fact whoever pressed; said for every origin (once per attempt)
      serverNotice(`codex-reset-untold-${x.sid || 'helper'}-${Date.now()}`, `Reset credit on ${nameOf(x.key)} — the request sent at ${new Date(sentAt).toISOString().slice(0, 16).replace('T', ' ')} UTC cannot be judged (${r.why}); it may have been spent. A new press spends a credit on the count shown now.`, { i18n: { key: i18nKey('Reset credit on {account} — the request sent at {time} cannot be judged ({why}); it may have been spent. A new press spends a credit on the count shown now.'), params: { account: nameOf(x.key), time: new Date(sentAt).toISOString().slice(0, 16).replace('T', ' ') + ' UTC', why: r.why } } });
    } else console.log(`[reset-credit] ${x.sid || 'helper'}: the reset-credit request on ${nameOf(x.key)} sent ${new Date(sentAt).toISOString()} is settled ${r.how} — ${r.why}; nothing holds the account any more`);
    out = r;
  }
  return out;
}
/** THE SESSION PATH'S READ BEFORE A PRESS (verify r1): the route awaits it when the preview says `unsettled` and a
 *  conversation carries the login — ONE `codex-read-limits` on that session's own app-server (the existing rung);
 *  its push lands through recordCodexQuotaSignal, which settles the attempt. → {ok, settled, reason} */
async function settleResetCreditByRead(key, { preferSessionId = null, timeoutMs = 20000 } = {}) {
  const pref = preferSessionId ? activeSessions.get(preferSessionId) : null;
  const s = pickLiveProbeSession(key, pref);
  if (!s) return { ok: false, settled: false, how: null, reason: 'no live local codex chat session on this identity' };
  const t0 = Date.now();
  const r = await liveRead(s, timeoutMs);
  // THE VERDICT this read produced (the route proceeds on IT, never on the cache — a reading that lost a
  // same-millisecond tie at the cache writer still settled the attempt): the newest settle on the chain
  let how = null, why = null, unsettled = false;
  for (let x = resetCreditTryFor(key); x; x = x.prior) { if (resetCredit.isUnsettled(x, clockOpts())) unsettled = true; else if (x.settled && Number(x.settled.at) >= t0 && !how) { how = x.settled.how; why = x.settled.why || null; } }
  return { ok: !!(r && r.ok), settled: !unsettled, how, why, reason: (r && r.reason) || null };
}
// ── THE MANUAL USE (p2, design-reset-credits §5): POST /api/accounts/:id/reset-credit
// (src/routes/reset-credit.js) — the roster's "Use…", the wall/arm card's
// button and the ask-mode For-you item all land here through ONE dialog. The
// verb needs a RUNNING wrapper on that identity (the vendor call is the
// session's own app-server — §ban-safety: nothing here touches a vendor).
/** The live chat sessions that can carry the verb for usage identity `key`:
 *  the harness can spend a credit (caps row, never an id) and the session bills
 *  that identity (a pool session: its CURRENT member). */
function resetCreditCarriers(key) {
  const ids = new Set(usageIdentityAccountIds(key)); ids.add(key);
  const out = [];
  for (const [, s] of activeSessions) {
    // (a process whose held login nobody can name carries nobody's credit — r3)
    try { if (s && s.pty && s.mode === 'chat' && capsOf(s.backend).resetCredit === true && ids.has(liveQuotaKeyFor(s)) && !heldPoolUnknown(s)) out.push(s); } catch { }
  }
  return out;
}
/** Can THIS conversation's wrapper carry a person's press (lane reset-path)? 'keyed' = its own sidecar
 *  advertises `resetCreditKey` (it sends the press's idempotency key AND reports the send — the only
 *  wrapper whose attempt can arm the floor honestly); 'stale' = it already had a consume refused for the
 *  missing key; 'unknown' = no advert (older than this fix, or a REMOTE wrapper whose advert lives on its
 *  own machine). A person's press rides only a 'keyed' one — everything else goes to the helper. */
function wrapperKeyState(s) {
  if (!s) return 'unknown';
  if (s._resetCreditStale) return 'stale';
  if (s.host) return 'unknown';
  try { const wc = wrapperCaps(path.join(rootDir, 'data', 'session-buffers'), s._webuiId, s.socketPath); if (wc && wc.caps && wc.caps.resetCreditKey === true) return 'keyed'; } catch { }
  return 'unknown';
}
/** THE HELPER PATH's preconditions for identity `key` (lane reset-path): a harness that can spend a
 *  credit (caps row), a codex command on this machine, and a LOCAL login for the key — the account's
 *  own isolated home, or the machine's own login — that is signed in. → {ok, home, envVar, cmd, extraArgs, why} */
function resetCreditHelperFor(key) {
  try {
    const backend = quotaBackendFor(key);
    if (capsOf(backend).resetCredit !== true) return { ok: false, why: 'this agent has no reset-credit interface' };
    let cmd = null, extraArgs = null;
    if (resetCreditHelper && resetCreditHelper.codexCmd) { cmd = resetCreditHelper.codexCmd; extraArgs = resetCreditHelper.extraArgs || []; }
    else { try { const c = require('../codex-thread-read.js').configure({}); cmd = c.codexCmd || null; extraArgs = c.extraArgs || []; } catch { cmd = null; } }
    if (!cmd) return { ok: false, why: 'the codex CLI is not installed on this machine' };
    const creds = harnesses.get(backend).creds;
    let home = null, loggedIn = false;
    if (/^__global/.test(key)) { home = creds.sharedHome(); try { loggedIn = !!creds.parseAuth(home).loggedIn; } catch { loggedIn = false; } }
    else {
      const a = accounts.get(key);
      if (!a || a.type === 'pooled') return { ok: false, why: 'not a single account' };
      home = accounts._acctDir(backend, key);
      try { loggedIn = !!accounts._readAuthFor(backend, key).loggedIn; } catch { loggedIn = false; }
    }
    if (!loggedIn) return { ok: false, why: `${nameOf(key)} is not signed in on this machine` };
    return { ok: true, home, envVar: creds.spawnEnvVar, cmd, extraArgs };
  } catch (e) { return { ok: false, why: e.message }; }
}
/** The window a manual use would replace: the account's MOST-spent bucket
 *  (that is the one a wall is on) → {resetsAtSec, periodSec, remainingPct}. */
function spentWindowOf(snap) {
  const bs = [snap && snap.fiveHour, snap && snap.sevenDay].filter((b) => b && typeof b === 'object');
  const used = (b) => (Number.isFinite(Number(b.utilization)) ? Number(b.utilization) : (Number.isFinite(Number(b.usedPercent)) ? Number(b.usedPercent) / 100 : null));
  const b = bs.slice().sort((x, y) => (used(y) ?? -1) - (used(x) ?? -1))[0] || null;
  if (!b) return { resetsAtSec: null, periodSec: null, remainingPct: null };
  const u = used(b);
  return { resetsAtSec: Number(b.resetsAt) > 0 ? Number(b.resetsAt) : null, periodSec: Number(b.windowMinutes) > 0 ? Number(b.windowMinutes) * 60 : null, remainingPct: u === null ? null : Math.max(0, Math.min(100, Math.round((1 - u) * 1000) / 10)) };
}
/**
 * What the confirm dialog shows AND what the POST would answer (the refusal is
 * named here once, in precedence order): not_supported → no_live_session →
 * no_credits → cooldown. `preferSessionId` = the session the entry point sat in
 * (the wall card's window, the item's session) — used as the carrier when it is one.
 */
function resetCreditPreview(key, { preferSessionId = null, now = Date.now() } = {}) {
  try { fileResetCreditTriesLost(); } catch { } // verify r2: the boot's unreadable-file notice, filed once the inbox exists
  key = String(key || '');
  try { const a = accounts.get(key); if (a && a.type === 'pooled') key = accounts.poolCurrent(key) || key; } catch { }
  const backend = quotaBackendFor(key);
  const vendor = quotaSourceFor(backend).resetCreditVendor || null;
  let recName = null; try { recName = accounts.get(key)?.name || null; } catch { }
  // name null = the machine's own login (the client says so in its own words)
  const base = { key, name: recName, backend, vendor, creditsLeft: null, resetsAtSec: null, periodSec: null, remainingPct: null, sessionId: null, cooldownUntilSec: null };
  if (capsOf(backend).resetCredit !== true) return { ...base, code: 'not_supported', error: 'this agent has no reset-credit interface (Claude Code offers only the interactive /limit-reset)' };
  // ONLY A WRAPPER THAT SENDS THE KEY carries a person's press (lane reset-path): an older one would
  // be refused by codex (the key is required on every measured CLI), so the press goes to the HELPER
  // (one bounded codex app-server child on this account's own login) — never a greyed button
  const live = resetCreditCarriers(key);
  const carriers = live.filter((s) => wrapperKeyState(s) === 'keyed');
  // a carrier that is LEAVING this account (r4): a held process whose pool moved
  // on, or one whose cold restart is in flight — kept only when no other carrier
  // exists. THE STATE IS NAMED (r5): `inFlight` = a restart request WENT OUT
  // (restartInFlight) — the verb would ride a process a client is killing, so
  // the use is REFUSED by name (`restart_pending`); `pending` = the pool moved
  // but no request went out yet (no client connected) — allowed, and the dialog
  // says the process keeps this login until a client restarts it
  const leavingTo = (s) => { try { if (restartInFlight(s, now)) return { to: accounts.poolCurrent(s._accountId) || null, inFlight: true }; const h = heldPoolMemberFor(s); const cur = h ? accounts.poolCurrent(s._accountId) : null; return h && cur && cur !== h ? { to: cur, inFlight: false } : null; } catch { return null; } };
  const pick = (list) => list.find((s) => s._webuiId === preferSessionId) || list.find((s) => !s.host) || list[0] || null;
  const staying = carriers.filter((s) => !leavingTo(s));
  const notKilled = carriers.filter((s) => !(leavingTo(s) || {}).inFlight);
  const carrier = pick(staying) || pick(notKilled) || pick(carriers);
  const leaving = carrier ? leavingTo(carrier) : null;
  const restartPending = leaving ? { id: leaving.to || null, name: leaving.to ? (accounts.get(leaving.to)?.name || leaving.to) : null, ...(leaving.inFlight ? { inFlight: true } : { pending: true }) } : null;
  const win = spentWindowOf(readRawUsageCache(key));
  const creditsLeft = resetCreditsLeft(carrier, key);
  // the IDENTITY's floor (r2) — an attempt through ANY session on this account. ARMED ONLY BY A
  // CONSUME THAT WENT OUT (lane reset-path): a refused / never-sent / nothing-to-reset attempt
  // blocks nothing; one written and not yet sent is `in_flight` (≤ the ack window), not the floor
  const block = resetCreditBlock(key, now);
  const coolMs = block.code === 'cooldown' ? block.until : 0;
  const helper = carrier ? null : resetCreditHelperFor(key);
  const via = carrier ? 'session' : (helper && helper.ok ? 'helper' : null);
  // verify r1: an earlier request went out and was never answered — the press READS first (the dialog says it)
  const unsettled = block.code === 'unsettled' ? { sinceSec: Math.floor((block.sinceMs || now) / 1000) } : null;
  // verify r2: an unsettled attempt whose wall is gone by itself LAPSED — the press is free and the dialog says the
  // count shown may be one high (the record stays unsettled for a late reading to settle it on the ledger)
  const lapsed = block.lapsed ? { sinceSec: Math.floor((block.lapsed.sinceMs || now) / 1000), atSec: Math.floor(block.lapsed.atMs / 1000) } : null;
  // verify r8 T0: does THIS press read the account before it consumes? The helper always (the owner's yes); a conversation
  // only through a wrapper that advertises the verb — said on the dialog, never claimed for an older wrapper
  const readsFirst = via === 'helper' ? readBeforePress() : (via === 'session' && carrier ? (readBeforePress() && wrapperReadsFirst(carrier)) : false);
  const out = { ...base, ...win, creditsLeft, sessionId: carrier ? carrier._webuiId : null, via, readsFirst, ...(via === 'helper' ? { helperWhy: live.length ? 'wrapper-predates' : 'no-session' } : {}), cooldownUntilSec: coolMs > now ? Math.ceil(coolMs / 1000) : null, ...(unsettled ? { unsettled } : {}), ...(lapsed ? { lapsed } : {}), ...(restartPending ? { restartPending } : {}) };
  if (!carrier && !via) { try { sweepResetCreditAsks(); } catch { } return { ...out, code: 'no_live_session', error: `no running chat session holds this account's login, and no helper process can use it here (${(helper && helper.why) || 'unknown'})` }; }
  if (creditsLeft !== null && creditsLeft <= 0) return { ...out, code: 'no_credits', error: 'no stored reset credits on this account' };
  if (block.code === 'in_flight') return { ...out, code: 'in_flight', error: 'a reset-credit request on this account was handed to codex and has not been sent yet — its answer arrives as a notice' };
  if (coolMs > now) return { ...out, code: 'cooldown', error: 'a reset-credit request went out on this account in the last 10 minutes (it may still land)' };
  if (restartPending && restartPending.inFlight) return { ...out, code: 'restart_pending', error: `the only running conversation holding this login is being restarted${restartPending.name ? ' onto ' + restartPending.name : ''} — the verb would ride a process that is being replaced` };
  return out;
}
/** THE MANUAL USE: one verb through the same writer as the auto rung. →
 *  {ok:true, sessionId, preview} | {ok:false, code, error, preview} */
function consumeResetCreditFor(key, { preferSessionId = null, now = Date.now(), expect = null, afterRead = false } = {}) {
  const p = resetCreditPreview(key, { preferSessionId, now });
  if (p.code) return { ok: false, code: p.code, error: p.error, preview: p };
  // verify-r6 R1 ("what you approve is what runs"): the dialog showed THIS window — its reset instant, what the credit
  // discards, the wait it saves. A window that reset (or moved) while the dialog stayed open would spend the credit on
  // a FRESH window ("0% discarded" shown; the whole fresh window discarded in fact): refused by name, nothing spent. A
  // caller that names no window (an older client) keeps the pre-r6 behaviour
  if (expect && typeof expect === 'object' && expect.resetsAtSec != null) {
    const shown = Number(expect.resetsAtSec);
    if (!Number.isFinite(shown) || Number(p.resetsAtSec) !== shown || now >= shown * 1000) return { ok: false, code: 'preview_changed', error: 'the limit window this dialog showed has reset (or moved) since it opened — nothing was spent; open it again to see the account now', preview: p };
  }
  // THE HELPER PATH (lane reset-path): no conversation can carry it — ONE bounded app-server child does
  if (p.via === 'helper') {
    const hw = writeResetCreditViaHelper(p.key, { resetsAtSec: p.resetsAtSec || 0, now });
    if (!hw.ok) return { ok: false, code: hw.code || 'spend_refused', error: hw.why ? `${hw.why}${hw.detail ? ': ' + hw.detail : ''}` : (hw.detail || 'the spend authorizer failed'), preview: p };
    global.__vsEvent?.('codex-reset-credit-user', 'helper');
    return { ok: true, sessionId: null, via: 'helper', preview: p };
  }
  const session = activeSessions.get(p.sessionId);
  if (!session) return { ok: false, code: 'no_live_session', error: 'the session ended', preview: p };
  // verify r1: an earlier request on this identity is UNSETTLED — the route reads the account through this
  // conversation first (settleResetCreditByRead) and asks again; a read that could not tell is the refusal
  if (p.unsettled) return { ok: false, code: 'unsettled', needsRead: true, error: 'an earlier reset-credit request on this account got no answer — the account must be read before a credit is spent (nothing spent)', preview: p };
  // verify r8 T0: a person's press READS FIRST through the conversation's own wrapper (`readFirst` on the verb) — unless the
  // route just read the account for an unsettled prior (`afterRead`: one read per press, never two)
  const wr = writeResetCredit(session, { resetsAtSec: p.resetsAtSec || 0, lane: null, origin: 'user', now, key: p.key, readFirst: !afterRead });
  if (!wr.ok) return { ok: false, code: 'spend_refused', error: wr.why ? `${wr.why}${wr.detail ? ': ' + wr.detail : ''}` : 'the spend authorizer failed', preview: p };
  console.log(`[reset-credit] ${session._webuiId}: a person asked for a reset credit on ${nameOf(p.key)} (credits=${p.creditsLeft ?? '?'}${wr.readFirst ? ', the wrapper reads the account first' : ''})`);
  global.__vsEvent?.('codex-reset-credit-user', session._accountId || 'global');
  return { ok: true, sessionId: session._webuiId, via: 'session', preview: p };
}
/**
 * THE HELPER PATH'S ONE WRITER (lane reset-path) — a VENDOR ACT FROM A HUMAN CLICK, allowlisted in
 * scripts/test-vendor-whitelist.mjs §8 with its gates: its ONE caller is consumeResetCreditFor (the
 * human-only POST), after the preview's refusals (the floor, in_flight, no_credits); the spend ceiling
 * first (the same reason, the same identity), the attempt record (the floor arms on the helper's
 * `onSent`), then ONE bounded `codex app-server` child on the account's own login. Never a timer, never
 * the auto rung (which writes only to a conversation's own wrapper). → {ok, idempotencyKey} | {ok:false, why, detail, code}
 */
/** THE READ-FIRST SEAM (verify r5, pinned; FLIPPED verify r8 T0): does a human press read the account before its consume
 *  even with NO unsettled prior? The owner answered ut-cdaa01aff0 on 2026-10-02 ("好的没问题" = yes): one more vendor
 *  read per press, on BOTH carriers (the helper's own read; a conversation wrapper's `readFirst` verb), only on a
 *  person's click — the AUTO rung reads nothing extra (its belts stay the ceiling + the ten-minute floor). It closes the
 *  r3 LOW: a credit granted between the cached reading and the press is never counted as unused. ONE line. */
function readBeforePress() { return true; }
/** Does this conversation's wrapper read the account before a consume when asked (`codex-reset-credit {readFirst:true}`)?
 *  Its own sidecar advertises `caps.resetCreditReadFirst` (the 2.369.202 wrapper); an older keyed wrapper ignores the
 *  flag and consumes at once — the preview says so (`readsFirst: false`), never a lie on the dialog. Local only. */
function wrapperReadsFirst(s) {
  if (!s || s.host) return false;
  try { const wc = wrapperCaps(path.join(rootDir, 'data', 'session-buffers'), s._webuiId, s.socketPath); return !!(wc && wc.caps && wc.caps.resetCreditReadFirst === true); } catch { return false; }
}
function writeResetCreditViaHelper(key, { resetsAtSec = 0, now = Date.now() } = {}) {
  const h = resetCreditHelperFor(key);
  if (!h.ok) return { ok: false, code: 'no_live_session', why: null, detail: h.why };
  let av = null;
  try { av = spendGuard.authorize({ reason: 'codex-reset-credit', session: null, sessionId: null, sessionName: null, identity: { key, name: nameOf(key) || key } }); }
  catch (e) { console.warn('[codex] spend authorizer threw — not spending a reset credit:', e.message); return { ok: false, why: null }; }
  if (av && av.ok === false) { console.log(`[codex] reset credit refused for the helper on ${nameOf(key)} (spend budget: ${av.why})`); return { ok: false, why: av.why || 'refused', detail: av.detail || null }; }
  const idemKey = crypto.randomUUID();
  const t = openResetCreditTry({ key, sid: null, via: 'helper', origin: 'user', resetsAtSec, lane: null, now, idemKey, av, creditsAt: resetCreditsLeft(null, key), reportsSent: true, window: spentWindowOf(readRawUsageCache(key)) });
  const env = { ...sanitizedSpawnEnv(process.env), [h.envVar]: h.home };
  // verify r1: an UNSETTLED earlier attempt rides as `prior` — the helper reads first and consumes only if no
  // unsettled attempt remains on this identity (landed ⇒ the credit was used then; a reading that cannot tell
  // ⇒ nothing spent either — never a second key on a guess)
  // verify r5 (the pinned seam, ut-cdaa01aff0): `readBeforePress()` = a read before EVERY helper press — the owner's call
  const readFirst = (t.prior || readBeforePress()) ? async (rl) => {
    // THE READ ITSELF FAILED (verify r8 T0): nothing to write; the ONE table decides — an unsettled prior still refuses (a
    // consume over it needs a reading), else the consume goes out on the count the dialog showed, and it is SAID
    if (rl && rl.readError) return judgeReadFirst(t, resetCredit.preConsumeVerdict(t, { readOk: false, ...clockOpts() }), { readError: String(rl.readError) });
    let fresh = null;
    try {
      const sig = quotaSourceFor(quotaBackendFor(key)).signalFromStream({ type: 'event_msg', payload: { type: 'rate_limits_updated', rateLimits: rl.rateLimits, resetCredits: rl.resetCredits || null, onDemand: true } });
      const w = writeCodexReading(sig && sig.snapshot, 'codex-reset-helper', { key });
      if (w && w.key) { settleResetCreditByReading(w.key, w.snap); fresh = w.snap; }
      // the count AT THE SEND is the one this read just took (verify r5: the press carried the cached count — a credit granted
      // between that reading and the press was the r3 LOW); the PURE table's `reading` row does the same for an open helper head
      if (fresh && fresh.resetCredits && Number.isFinite(Number(fresh.resetCredits.availableCount)) && !t.sentAt && !t.outcome) t.creditsAt = Number(fresh.resetCredits.availableCount);
    } catch (e) { console.warn('[reset-credit] helper read-first not written:', e.message); }
    // WHAT YOU APPROVE IS WHAT RUNS (verify r5, reproduced — money) + the priors + a zero count: ONE table for both carriers
    // (src/reset-credit.js preConsumeVerdict — the conversation wrapper's read-first is judged by the same rows)
    return judgeReadFirst(t, resetCredit.preConsumeVerdict(t, { readOk: !!fresh, freshWindow: fresh && Number(t.resetsAtSec) > 0 ? readingWindowFor(fresh, t.window) : null, freshCount: fresh && fresh.resetCredits ? fresh.resetCredits.availableCount : null, ...clockOpts() }), {});
  } : null;
  console.log(`[reset-credit] helper: a person asked for a reset credit on ${nameOf(key)} with no conversation to carry it — one codex app-server child (≤ ${codexResetHelper.HELPER_WALL_MS / 1000} s)`);
  Promise.resolve(codexResetHelper.consumeResetCreditViaAppServer({ idempotencyKey: idemKey, env, cwd: h.home, codexCmd: h.cmd, extraArgs: h.extraArgs, wallMs: (resetCreditHelper && Number(resetCreditHelper.wallMs)) || undefined, onSent: () => noteResetCreditSent(t), readFirst, pressedBy: t.origin === 'user' ? 'person' : 'auto' }))
    .then((r) => onResetCreditHelperDone(t, r), (e) => onResetCreditHelperDone(t, { sent: false, answered: false, error: String((e && e.message) || e) }))
    .catch((e) => console.warn('[reset-credit] helper answer failed:', e.message));
  return { ok: true, identity: av && av.identity, idempotencyKey: idemKey };
}
/** THE VERDICT OF A READ BEFORE A PRESS, APPLIED (verify r8 T0; both carriers): `v` = preConsumeVerdict's row. A refusal
 *  marks the attempt (`skipWhy`, `skipWindow`) and answers false; a failed read lets the consume through and SAYS so (journal
 *  + a notice to the person — a failed read never blocks a human's press); else true. → boolean (go) */
function judgeReadFirst(t, v, { readError = null } = {}) {
  if (!v || typeof v !== 'object') return false;
  if (v.go && v.why === 'read-failed') {
    t.readFailed = readError || 'the read before the consume failed';
    console.log(`[reset-credit] ${t.sid || 'helper'}: the read before the consume on ${nameOf(t.key)} failed (${String(t.readFailed).slice(0, 120)}) — the consume goes out on the count the dialog showed (a failed read never blocks a person's press; ut-cdaa01aff0)`);
    if (t.origin === 'user') serverNotice(`codex-reset-readfail-${t.sid || 'helper'}-${Date.now()}`, `Reset credit on ${nameOf(t.key)} — the account could not be read before the request (${String(t.readFailed).slice(0, 120)}); it was sent on the count the dialog showed.`, { i18n: { key: i18nKey('Reset credit on {account} — the account could not be read before the request ({error}); it was sent on the count the dialog showed.'), params: { account: nameOf(t.key), error: String(t.readFailed).slice(0, 120) } } });
    return true;
  }
  if (!v.go) { t.skipWhy = v.why || 'skipped'; t.skipWindow = v.window || null; return false; }
  return true;
}
/** THE WORDS of a press that read first and did not consume (verify r8 T0: ONE spelling for the helper's `skipped` and the
 *  wrapper's) — by what the read proved: a prior LANDED (the window moved because of it) · the wall EXPIRED by itself · a
 *  prior UNTOLD (its own `why` names a moved window when that is the reason) · the window MOVED with no prior to explain it
 *  (the web used a credit, a plan change) · NO CREDITS counted by the read · no verdict reached the wrapper in time · else.
 *  → {text, i18n} */
function resetCreditSkipNotice(t) {
  const landed = (() => { for (let x = t.prior; x; x = x.prior) if (x.settled && x.settled.how === 'landed') return x; return null; })();
  const expired = (() => { for (let x = t.prior; x; x = x.prior) if (x.settled && x.settled.how === 'expired') return x; return null; })();
  const untold = (() => { for (let x = t.prior; x; x = x.prior) if (x.settled && x.settled.how === 'untold') return x; return null; })();
  const utc = (x) => new Date(x.sentAt || x.at).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  const acct = nameOf(t.key);
  // verify r5: the read just taken shows a window other than the one the dialog showed — nothing was spent (said first:
  // whatever the priors say, the person approved THAT window)
  const moved = t.skipWhy === 'window-moved';
  const movedAt = moved && Number(t.skipWindow) > 0 ? new Date(Number(t.skipWindow) * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : null;
  if (moved && !landed && !expired && !untold) return { text: `Reset credit not used on ${acct} — the limit this dialog showed has moved since it opened (the account's window resets at ${movedAt || '?'} now); nothing was spent. Open it again to see the account now.`, i18n: { key: i18nKey('Reset credit not used on {account} — the limit this dialog showed has moved since it opened (the account’s window resets at {time} now); nothing was spent. Open it again to see the account now.'), params: { account: acct, time: movedAt || '?' } } };
  if (landed) return { text: `Reset credit not used again on ${acct} — the request sent at ${utc(landed)} had already landed (${landed.settled.why}); this press spent nothing.`, i18n: { key: i18nKey('Reset credit not used again on {account} — the request sent at {time} had already landed ({why}); this press spent nothing.'), params: { account: acct, time: utc(landed), why: landed.settled.why } } };
  if (expired) return { text: `Reset credit not used on ${acct} — the limit this dialog showed has reset by itself since the earlier request; nothing was spent. Open it again to see the account now.`, i18n: { key: i18nKey('Reset credit not used on {account} — the limit this dialog showed has reset by itself since the earlier request; nothing was spent. Open it again to see the account now.'), params: { account: acct } } };
  if (untold) return { text: `Reset credit not used yet on ${acct} — the request sent at ${utc(untold)} cannot be judged (${untold.settled.why}); nothing was spent this time. Open it again: the count shown is the account's now, and a new press spends one.`, i18n: { key: i18nKey('Reset credit not used yet on {account} — the request sent at {time} cannot be judged ({why}); nothing was spent this time. Open it again: the count shown is the account’s now, and a new press spends one.'), params: { account: acct, time: utc(untold), why: untold.settled.why } } };
  if (moved) return { text: `Reset credit not used on ${acct} — the limit this dialog showed has moved since it opened (the account's window resets at ${movedAt || '?'} now); nothing was spent. Open it again to see the account now.`, i18n: { key: i18nKey('Reset credit not used on {account} — the limit this dialog showed has moved since it opened (the account’s window resets at {time} now); nothing was spent. Open it again to see the account now.'), params: { account: acct, time: movedAt || '?' } } };
  if (t.skipWhy === 'no-credits') return { text: `Reset credit not used on ${acct} — the account has no reset credits available.`, i18n: { key: i18nKey('Reset credit not used on {account} — the account has no reset credits available.'), params: { account: acct } } };
  if (t.skipWhy === 'no-verdict') return { text: `Reset credit not used on ${acct} — the conversation's codex wrapper read the account but got no verdict in time; nothing was spent. Use it again from the Agents list.`, i18n: { key: i18nKey('Reset credit not used on {account} — the conversation’s codex wrapper read the account but got no verdict in time; nothing was spent. Use it again from the Agents list.'), params: { account: acct } } };
  return { text: `Reset credit not used on ${acct} — the account's reading could not tell whether the earlier request landed, so nothing was spent. Try again after the account's next turn or ⟳.`, i18n: { key: i18nKey('Reset credit not used on {account} — the account’s reading could not tell whether the earlier request landed, so nothing was spent. Try again after the account’s next turn or ⟳.'), params: { account: acct } } };
}
/** A PRESS THAT STRADDLED A RESTART, STILL WAITING (verify r9 ②, reproduced on the real engine): the boot revived its record
 *  `unknown` (it MAY have gone out — a failed read consumes at once) and charged it; a reads-first wrapper's own later word for
 *  THAT key — its read pushed (`beforeReset`), or its `skipped` — proves nothing went out (the consume follows the verdict).
 *  → is `t` such a record? (the wrapper's word beats the boot's guess; an older wrapper never speaks either) */
function revivedReadFirstWaiting(t) { return !!(t && t.outcome === 'unknown' && t.revivedAt && t.sentGuessed === true && t.readFirst === true); } // verify r10 ②: a SENT record (its send on file before the restart) is never such a record
/** …its read pushed: RE-OPEN the record so this reading settles its priors and the ONE table judges it like any press. The
 *  press instant moves to NOW (the `in_flight` window and the ack timer must cover the go's flight — a restart longer than
 *  the ack window would else admit a second press over a consume about to go out: reproduced), the boot's charge stands (the
 *  ledger never under-counts; a later send charges nothing twice), the outcome comes from the wrapper (sent / skipped) within
 *  the ack window re-armed here. Only the attempt's own conversation (the key's wrapper) re-opens it. → t | null */
function reopenRevivedReadFirst(session, idemKey) {
  const t = resetCreditTryByAnswer({ idempotencyKey: idemKey }, null, null);
  if (!revivedReadFirstWaiting(t)) return null;
  const sid = (session && session._webuiId) || '?';
  if (t.sid && session && t.sid !== session._webuiId) { console.log(`[reset-credit] ${sid}: a read before the consume for the press revived unknown at the restart came from another conversation (${t.sid}) — not re-opened`); return null; }
  const now = Date.now();
  t.pressedAt = t.pressedAt || t.at; t.at = now; t.reopenedAt = now;
  t.outcome = null; t.outcomeAt = 0; t.sentAt = 0; t.settled = null;
  try { clearTimeout(t.ackTimer); } catch { }
  t.ackTimer = setTimeout(() => onResetCreditNotSent(t), RESET_CREDIT_ACK_MS);
  if (t.ackTimer.unref) t.ackTimer.unref();
  persistResetCreditTries();
  // (verify r10 ③: the floor is armed from the SEND — `at` = now governs only the ack window; the press's own instant is
  // kept as `pressedAt` and NAMED here, the one reader of it)
  console.log(`[reset-credit] ${sid}: the wrapper pushed its read before the consume for the press revived unknown at the restart (key ${String(idemKey).slice(0, 8)}…, pressed ${Math.round((now - Number(t.pressedAt)) / 1000)} s ago) — nothing went out (the consume follows the verdict): re-opened and judged now; the restart's charge on the ledger stays`);
  return t;
}
/** THE WORD A RESTART LOSES — READ BACK FROM THE WRAPPER'S OWN FILE (verify r10, reproduced on the REAL wrapper file against
 *  the stub app-server). r9 ② takes the wrapper's push / `skipped` when it REACHES the new engine, which needs the restart
 *  to be shorter than the wrapper's wait (its push ≤ 20 s after the press, its go-wait 25 s). A longer restart — most real
 *  ones — the wrapper wrote them to stdout while NO server was attached (dtach replays nothing; the repaint goes to clients
 *  and skips chat) and to its own buffer file (every record it emits, a 1-s debounce). So at the ATTACH (the stdout
 *  consumer, before its first live byte) the file's tail is read ONCE for the keyed records of THIS session's attempts
 *  that are still open or revived unknown, and each is fed through the ONE entry (recordCodexQuotaSignal) at ITS OWN
 *  instant (`asOf`: a reading is stamped when it was taken, never at the attach — a pre-consume read stamped NOW would
 *  "settle" the consume that followed it). Rules: a `beforeReset` push that a send / a result of its key FOLLOWS in the
 *  file is dropped (answered before the restart — re-fed, it would re-open the guessed record and write a go to nobody);
 *  a READING older than LATE_MS is dropped (a late record is not a live fact); a keyed `reset_credit_sent` /
 *  `reset_credit_result` is always taken (a fact about a request WE sent). Bounded: the last RESET_CATCHUP_TAIL_BYTES of a
 *  LOCAL file (a remote wrapper's file is on its machine), nothing at all when no attempt of this session is open. The
 *  window that remains: a record emitted inside the file's 1-s debounce right before the attach is in neither the file
 *  nor the live stream — the orphan path (the floor, then a reading settles it) covers it. A re-attach (a bridge heal)
 *  reads the file again: every keyed record is idempotent on its record (a repeated `skipped` / `reset` / `sent` changes
 *  nothing; a repeated push writes a go the wrapper's one waiter ignores by name). → {fed, dropped} | null */
const RESET_CATCHUP_TAIL_BYTES = 512 * 1024;
const RESET_CATCHUP_TYPES = new Set(['rate_limits_updated', 'reset_credit_sent', 'reset_credit_result']);
function catchUpResetCreditFromBuffer(session, id) {
  if (!session || !id || session.host) return null;
  const open = new Set();
  for (const t of _resetCreditTries.values()) for (let x = t; x; x = x.prior) if (x && x.sid === id && typeof x.idempotencyKey === 'string' && x.idempotencyKey && (!x.outcome || x.outcome === 'unknown') && !x.settled) open.add(x.idempotencyKey);
  if (!open.size) return null;
  const f = path.join(rootDir, 'data', 'session-buffers', id + '.buf');
  let text = '';
  try {
    const st = fs.statSync(f); const take = Math.min(st.size, RESET_CATCHUP_TAIL_BYTES); if (!take) return null;
    const fd = fs.openSync(f, 'r'); try { const b = Buffer.alloc(take); fs.readSync(fd, b, 0, take, st.size - take); text = b.toString('utf8'); } finally { fs.closeSync(fd); }
  } catch { return null; }
  const recs = [];
  for (const line of text.split('\n')) {
    const l = line.trim(); if (!l || l[0] !== '{') continue;
    let m; try { m = JSON.parse(l); } catch { continue; }
    const p = m && m.type === 'event_msg' && m.payload && typeof m.payload === 'object' ? m.payload : null;
    if (!p || !RESET_CATCHUP_TYPES.has(p.type) || typeof p.idempotencyKey !== 'string' || !open.has(p.idempotencyKey)) continue;
    recs.push(m);
  }
  if (!recs.length) return null;
  const answered = new Set(recs.filter((m) => m.payload.type !== 'rate_limits_updated').map((m) => m.payload.idempotencyKey));
  const fed = [], dropped = [];
  const spell = (p) => p.type + (p.beforeReset ? ':beforeReset' : p.afterReset ? ':afterReset' : '') + (p.skipped ? ':skipped' : p.outcome ? ':' + p.outcome : '');
  for (const m of recs) {
    const p = m.payload;
    const ts = Date.parse(m.timestamp); const at = Number.isFinite(ts) && ts > 0 ? ts : null; // the wrapper stamps every record it writes
    if (p.type === 'rate_limits_updated' && p.beforeReset === true && answered.has(p.idempotencyKey)) { dropped.push(spell(p) + ' (answered before the restart)'); continue; }
    if (p.type === 'rate_limits_updated' && (at === null || Date.now() - at > recordLateness.LATE_MS)) { dropped.push(spell(p) + ' (' + (at === null ? 'unstamped' : recordLateness.lateWords(Date.now() - at) + ' old') + ')'); continue; }
    try { recordCodexQuotaSignal(session, p, null, { asOf: at }); } catch (e) { console.warn(`[reset-credit] ${id}: a record from the wrapper's buffer file was not taken:`, e.message); }
    fed.push(spell(p));
  }
  console.log(`[reset-credit] ${id}: ${fed.length} record(s) the wrapper wrote while no server was attached read back from its buffer file at the attach${fed.length ? ' (' + fed.join(', ') + ')' : ''}${dropped.length ? `; not re-fed: ${dropped.join(', ')}` : ''}`);
  return { fed, dropped };
}
/** THE CONVERSATION WRAPPER'S READ BEFORE ITS CONSUME, ANSWERED (verify r8 T0): the wrapper took ONE `account/rateLimits/read`
 *  for the press `idemKey` and pushed it (`rate_limits_updated {beforeReset, idempotencyKey}`, written to the cache and
 *  through the settle like every reading) — or pushed its failure (`snap` null, `readError`). The open attempt is judged by
 *  the ONE table (preConsumeVerdict → judgeReadFirst) and the wrapper is answered `codex-reset-credit-go {go}`: true ⇒ it
 *  consumes; false ⇒ it never does (the attempt ends `skipped` here: the hold given back, the person told). A failed read
 *  is only SAID — the wrapper already goes on to its consume, as the helper does (a failed read never blocks a press). */
function answerReadBeforePress(session, idemKey, snap, readError = null) {
  const t = resetCreditTryByAnswer({ idempotencyKey: idemKey }, null, null);
  const sid = (session && session._webuiId) || '?';
  if (!t || t.sentAt || t.outcome) { console.log(`[reset-credit] ${sid}: a read before the consume for an attempt that is ${!t ? 'not tracked' : t.sentAt ? 'sent already' : 'already ' + t.outcome} (key ${String(idemKey).slice(0, 8)}…) — no verdict written`); return; }
  if (snap && snap.resetCredits && Number.isFinite(Number(snap.resetCredits.availableCount))) t.creditsAt = Number(snap.resetCredits.availableCount); // the count AT THE SEND = the read's count
  const v = resetCredit.preConsumeVerdict(t, { readOk: !!snap, freshWindow: snap && Number(t.resetsAtSec) > 0 ? readingWindowFor(snap, t.window) : null, freshCount: snap && snap.resetCredits ? snap.resetCredits.availableCount : null, ...clockOpts() });
  const go = judgeReadFirst(t, v, { readError: snap ? null : (readError || 'the read before the consume failed') });
  if (!go) {
    try { if (t.hold && !t.charged) spendGuard.release({ hold: t.hold }); } catch { }
    t.hold = null;
    settleResetCreditTry(t, 'skipped', { failed: true });
    const nt = resetCreditSkipNotice(t);
    console.log(`[reset-credit] ${sid}: the read before the consume on ${nameOf(t.key)} says no (${t.skipWhy}) — nothing spent, the wrapper told not to consume`);
    if (t.origin === 'user') serverNotice(`codex-reset-skip-${sid}-${Date.now()}`, nt.text, { i18n: nt.i18n });
    if (session) session._resetCreditOrigin = null;
  }
  if (!snap) return; // a failed read: the wrapper does not wait for a verdict (it goes on to its consume) — said above
  try { if (session && session.pty) session.pty.write(JSON.stringify({ type: 'codex-reset-credit-go', idempotencyKey: idemKey, go, ...(go ? {} : { why: t.skipWhy || v.why || 'skipped' }) }) + '\n'); }
  catch (e) { console.warn(`[reset-credit] ${sid}: could not answer the wrapper's read before the consume:`, e.message); }
}
/** The helper's answer, through the SAME doors as a wrapper's: its post-consume reading first (the one
 *  cache writer — the pool decides on that cache, reset credits r3), then the answer (handleResetCreditResult). */
function onResetCreditHelperDone(t, r) {
  const res = r && typeof r === 'object' ? r : {};
  // verify r1: the run read first and did NOT consume — the earlier request had landed (the reading settled it,
  // said by settleResetCreditByReading) or the reading could not tell: this press spent nothing, nothing armed
  if (res.skipped) {
    try { if (t.hold && !t.charged) spendGuard.release({ hold: t.hold }); } catch { }
    t.hold = null;
    settleResetCreditTry(t, 'skipped', { failed: true });
    const n = resetCreditSkipNotice(t);
    if (t.skipWhy === 'window-moved') console.log(`[reset-credit] helper: the read before the consume on ${nameOf(t.key)} shows the window at ${t.skipWindow}, not the ${t.resetsAtSec} this dialog showed — nothing spent (what you approve is what runs)`);
    else console.log(`[reset-credit] helper: the read before the consume on ${nameOf(t.key)} says no (${t.skipWhy || 'could not tell'}) — nothing spent`);
    serverNotice(`codex-reset-skip-helper-${Date.now()}`, n.text, { i18n: n.i18n });
    return;
  }
  if (res.rateLimits && !res.skipped) {
    try {
      const sig = quotaSourceFor(quotaBackendFor(t.key)).signalFromStream({ type: 'event_msg', payload: { type: 'rate_limits_updated', rateLimits: res.rateLimits, resetCredits: res.resetCredits || null, onDemand: true } });
      // verify r4: this reading was taken AFTER the consume was answered — it is after the send by construction, so it is
      // stamped strictly after it (a stub app-server answers both inside one millisecond; the PURE rule refuses a reading
      // at or before the send, which a real vendor round trip can never tie)
      if (sig && sig.snapshot && Number(t.sentAt) > 0 && !(Number(sig.snapshot.fetchedAt) > Number(t.sentAt))) sig.snapshot.fetchedAt = Number(t.sentAt) + 1;
      const w = writeCodexReading(sig && sig.snapshot, 'codex-reset-helper', { key: t.key });
      if (w && w.key) { t.postConsume = w.snap; settleResetCreditByReading(w.key, w.snap); const e = resetReadingEndsHold(w.key, null, w.snap); if (e) releaseResetHold(e[0], 'its post-reset reading landed'); } // verify r5: the helper's own post-consume read is the attempt's witness
    } catch (e) { console.warn('[reset-credit] helper reading not written:', e.message); }
  } else if (res.readError) console.log(`[reset-credit] helper: the post-consume read on ${nameOf(t.key)} failed (${String(res.readError).slice(0, 120)})`);
  // `answered` rides the payload (verify r2): an app-server that exited after taking the consume said nothing — unanswered
  handleResetCreditResult(null, { type: 'reset_credit_result', outcome: res.outcome || null, result: res.result || null, error: res.outcome ? null : (res.error || null), idempotencyKey: t.idempotencyKey, attempts: res.sent ? 1 : 0, sent: !!res.sent, answered: !!res.answered, via: 'helper' });
}
/**
 * THE RUNG. Returns
 *   'consumed'     a credit is IN FLIGHT for this wall — the verb this call wrote,
 *                  or a sibling conversation's on the same account (this one then
 *                  FOLLOWS it, r2), or the window a credit re-opened moments ago —
 *                  the outcome event continues the ladder; the caller returns
 *   'switch-first' the verdict's `cold-switch-first`: the caller runs the switch
 *                  rung and, when it moved nothing, asks again at
 *                  `ladderPosition: 'after-switch'` (the verdict's cold rung)
 *   'asked'        one For-you decision filed
 *   'skipped'      nothing to do here
 * The caller runs the switch rung and the wall machine after anything but
 * 'consumed'.
 */
function resetCreditRung(session, { resetsAtSec = null, lane = null, key = null, snap = null, ladderPosition = 'wall' } = {}) {
  try {
    const mode = resetCreditMode(session);
    if (!mode) return 'skipped';
    if (!session.pty || session.mode !== 'chat') return 'skipped'; // the verb (and p2's button) ride the live wrapper
    const now = Date.now(), nowSec = Math.floor(now / 1000);
    const vendor = quotaSourceFor(session.backend).resetCreditVendor || null;
    const R = Number(resetsAtSec) || 0;
    // THE CREDIT'S IDENTITY is the member this process HOLDS (r2), never the
    // pool's current member: `key` from the caller names where the READING was
    // filed and is only a fallback
    const ci = creditIdentityFor(session);
    key = ci.key || key;
    // ONE limit EVENT = (identity, stated reset): the ask item and the wall card
    // speak once per event, however many records restate it
    const eventKey = `${key}|${R || '?'}`;
    const firstOfEvent = session._resetCreditEvent !== eventKey;
    session._resetCreditEvent = eventKey;
    const speak = firstOfEvent || ladderPosition !== 'wall';
    // THE POOL ALREADY MOVED (r2): this process still holds the old member's
    // login until its cold restart lands. A credit spent here would be that
    // member's, spent for a conversation that is leaving it — refused by name;
    // the switch rung already answered this wall. (A PERSON may still spend it
    // on that account through the button: consumeResetCreditFor.)
    if (ci.moved) {
      if (speak) console.log(`[reset-credit] ${session._webuiId}: kept (pool-moved — this conversation still holds ${nameOf(key)}'s login, the pool moved to ${nameOf(ci.current)}; it restarts there) mode=${mode}`);
      return 'skipped';
    }
    // …or NOBODY CAN SAY which login this process holds (r3: spawned before
    // the stamp, no slot-transition row before it started). Spending on the
    // pool's current member through it was the pre-stamp misattribution — B's
    // credit charged, A's login asked. Refused by name (and such a process is
    // no carrier for a person's Use… either — resetCreditCarriers).
    if (ci.unknown) {
      if (speak) console.log(`[reset-credit] ${session._webuiId}: kept (held-unknown — this process started before the pool stamped its member and no slot-transition row names the pool default at its start; it is re-stamped at its next restart) mode=${mode}`);
      return 'skipped';
    }
    // A SIBLING'S CREDIT IS IN FLIGHT on this account (r2): follow it — its
    // answer settles this conversation too (settleResetCreditTry)
    const t = resetCreditTryFor(key);
    if (resetCreditInFlight(t, now) && t.sid !== session._webuiId) {
      t.followers.set(session._webuiId, { resetsAtSec: R, lane: lane || null });
      if (speak) console.log(`[reset-credit] ${session._webuiId}: following ${t.sid}'s reset credit in flight on ${nameOf(key)} (one credit per account wall) mode=${mode}`);
      return 'consumed';
    }
    // …or it LANDED moments ago and this record restates the wall it re-opened
    // (the same stated reset): the window is open — no switch, no wait. ONE
    // predicate with the task_failed branch's pre-write check (r5).
    if (restatedResetWallTry(key, R, now)) {
      if (speak) console.log(`[reset-credit] ${session._webuiId}: this wall on ${nameOf(key)} was re-opened by a reset credit ${Math.round((now - t.outcomeAt) / 1000)}s ago — not switching`);
      return 'consumed';
    }
    const { periodSec, remainingPct } = trippedWindowFacts(snap, R);
    const creditsLeft = resetCreditsLeft(session, key);
    const warmth = conversationWarmth(session, now);
    const poolAlternative = poolAlternativeFor(session, now);
    // the IDENTITY's floor (r2), across every session on it — armed only by a consume that WENT
    // OUT (lane reset-path) — and ONE TRY PER LIMIT EVENT: an attempt on this very event that
    // ended (a `nothingToReset`, a refusal) is not retried before the event's own reset
    const blockUntil = resetCredit.rungBlockUntil(t, { now, eventKey, resetsAtSec: R || null, floorMs: RESET_CREDIT_FLOOR_MS, ackMs: RESET_CREDIT_ACK_MS });
    const v = resetCredit.resetCreditVerdict({
      vendor, wallHit: true, remainingPct, resetsAtSec: R || null, nowSec, periodSec, creditsLeft,
      cooldownUntilSec: blockUntil ? Math.floor(blockUntil / 1000) : null,
      inTurn: warmth.inTurn, warm: warmth.warm, poolAlternative, ladderPosition: ladderPosition === 'after-switch' ? 'after-switch' : 'wall',
    });
    if (speak) console.log(`[reset-credit] ${session._webuiId}: ${v.use ? 'worth it' : 'kept'} (${v.reason} — ${resetCredit.reasonText(v.reason)}) mode=${mode} ${warmth.inTurn ? 'in-turn' : warmth.warm ? 'warm' : 'cold'} poolAlternative=${poolAlternative}${ladderPosition !== 'wall' ? ' ' + ladderPosition : ''} credits=${creditsLeft ?? '?'} on ${nameOf(key)}`);
    const desc = resetCredit.describeUse(vendor, v, { nowSec, resetsAtSec: R || null, periodSec, creditsLeft });
    const wallCard = (refusedBy = null) => {
      // OFF / ASK / a refused verdict: the wall card NAMES the credits (§3) and
      // carries the offer for the button; only when the count is KNOWN and > 0
      if (!firstOfEvent || !(creditsLeft > 0)) return;
      const n = creditsLeft;
      const why = refusedBy ? ` Not used automatically: ${refusedBy}.` : v.use || mode === 'off' ? '' : ` Not used automatically: ${resetCredit.reasonText(v.reason)}.`;
      try { feedPeerCard(session, { fromName: 'VibeSpace', kind: 'notification', text: `Usage limit hit on ${nameOf(key)} — ${n} stored reset credit${n === 1 ? '' : 's'} available. ${desc.text}${why}`, resetCredit: { available: n, mode, accountKey: key, ...(R ? { resetsAtSec: R } : {}) } }); } catch { }
    };
    if (!v.use || mode === 'off') { wallCard(); return v.reason === 'cold-switch-first' ? 'switch-first' : 'skipped'; }
    if (mode === 'ask') {
      wallCard();
      // ONE decision per limit event — asked at the wall, or (a cold
      // conversation) after a switch that moved nothing
      if (session._resetCreditAsked === eventKey) return 'skipped';
      session._resetCreditAsked = eventKey;
      let todos = null;
      try { todos = getUserTodos(); } catch { todos = null; }
      if (!todos) return 'skipped';
      const bsid = session.backendSessionId || session.claudeSessionId;
      const sessionKey = bsid ? `${session.backend || 'claude'}:${bsid}` : `webui:${session._webuiId}`;
      const who = nameOf(key);
      try {
        const item = todos.add(sessionKey, {
          origin: 'pool', // B-328d: the pool engine's reset-credit decision
          text: `Use a stored reset credit on ${who}? (limit resets ${R ? new Date(R * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : 'at an unknown time'})`,
          detail: desc.text, urgency: 'normal', kind: 'action', sessionName: session.name || null,
          i18n: { text: { key: i18nKey('Use a stored reset credit on {account}?'), params: { account: who } }, detail: desc.lines },
          action: { type: 'reset-credit', sessionId: session._webuiId, accountKey: key, resetsAtSec: R || null, creditsLeft, reason: v.reason },
          // the question is moot once the limit resets by itself (r3)
          expiresAt: R && R * 1000 > now ? R * 1000 : null,
        });
        if (item && item.id) { _resetCreditAsks.set(item.id, { key, sid: session._webuiId }); if (_resetCreditAsks.size > 256) _resetCreditAsks.delete(_resetCreditAsks.keys().next().value); }
      } catch (e) { console.warn('[reset-credit] could not file the For-you decision:', e.message); }
      return 'asked';
    }
    // A WRAPPER OLDER THAN THE KEY (lane reset-path): this conversation's wrapper already had a
    // consume refused by codex for the missing key — nothing it writes can be sent. Refused by
    // name, the switch/wait rungs run (a person can still use the credit: the dialog sends it
    // through the helper process — never the auto rung, which is no human click)
    if (session._resetCreditStale) {
      if (speak) console.log(`[reset-credit] ${session._webuiId}: kept (wrapper-predates-key — this conversation's codex wrapper predates the reset-credit fix; Terminate + Resume updates it) mode=${mode}`);
      wallCard('this conversation\'s codex wrapper predates the reset-credit fix (Terminate + Resume it, or use the button)');
      return 'skipped';
    }
    // AUTO — through the ONE writer the manual button uses too (writeResetCredit).
    const wr = writeResetCredit(session, { resetsAtSec: R, lane, origin: 'auto', now, key });
    // the card NAMES the account the ceiling refused (r3 — the code alone said
    // "hour-cap" and only the journal said whose hour it was)
    if (!wr.ok) { if (wr.why) wallCard(`the unattended-spend ceiling refused it (${wr.why}) for ${nameOf(key)}${wr.detail ? ` — ${String(wr.detail).replace(/\.$/, '')}` : ''}`); return 'skipped'; }
    const saved = v.waitSavedSec ? ` — saves a wait of ${resetCredit.fmtWait(v.waitSavedSec)}` : '';
    const leftTxt = creditsLeft > 0 ? `; ${creditsLeft - 1} left after this one` : '';
    serverNotice(`codex-reset-${session._webuiId}-${now}`, `Usage limit hit on ${nameOf(key)} — using a stored reset credit${saved}${leftTxt} (${warmth.inTurn || warmth.warm ? 'warm conversation: before switching accounts' : 'no pool member can take it'}).`, { i18n: { key: warmth.inTurn || warmth.warm ? i18nKey('Usage limit hit on {account} — using a stored reset credit (warm conversation: before switching accounts).') : i18nKey('Usage limit hit on {account} — using a stored reset credit (no pool member can take it).'), params: { account: nameOf(key) }, ...(v.waitSavedSec ? { then: { key: i18nKey('Saves a wait of {wait}.'), params: { wait: resetCredit.fmtWait(v.waitSavedSec) } } } : creditsLeft > 0 ? { then: creditsLeft - 1 === 1 ? { key: i18nKey('1 reset credit left after this one.'), params: {} } : { key: i18nKey('{n} reset credits left after this one.'), params: { n: creditsLeft - 1 } } } : {}) } });
    global.__vsEvent?.('codex-reset-credit-try', session._accountId || 'global');
    return 'consumed';
  } catch (e) { console.warn('[reset-credit] rung failed:', e.message); return 'skipped'; }
}
// ── Codex quota signals (P2, design-backend-parity.md §2) ──────────────────
// The wrapper relays account/rateLimits/updated as `rate_limits_updated` and
// forwards the typed codex_error_info on task_failed. Readings write the SAME
// per-account cache the pool decisions and the estimator read; exhaustion
// (rate_limit_reached_type / usage_limit_reached family) acts like a claude
// rejected rate_limit_event: pool switch first, auto-resume as the fallback.
// The typed exhaustion enum + the snapshot normalizer live in the codex
// harness (src/harnesses/codex-quota.js, S4): the harness classifies the
// record into a signal, the engine runs the ladder on the signal.
/** THE CARD THE CREDIT OUTLIVED (lane reset-path R3): a later fact about identity `key` resolves every open
 *  wall / arm card offering a credit on it, in EVERY conversation's normalizer (the card lives where it was
 *  drawn; the fact is the account's). ev = {kind:'used', at, untilSec} | {kind:'reading', at, usable}. */
function resolveResetCreditCards(key, ev) {
  if (!key || !ev) return 0;
  const keys = new Set([key]);
  try { for (const id of usageIdentityAccountIds(key) || []) keys.add(id); } catch { }
  let n = 0;
  for (const [, s] of activeSessions) {
    try { if (s && s._normalizer && typeof s._normalizer.resolveResetCreditOffers === 'function') n += s._normalizer.resolveResetCreditOffers([...keys], ev) || 0; } catch { }
  }
  if (n) console.log(`[reset-credit] ${nameOf(key)}: ${n} card${n === 1 ? '' : 's'} offering a reset credit resolved (${ev.kind === 'used' ? 'the credit was used' : 'a later reading answered the wall'})`);
  return n;
}
/** `reset_credit_sent` (lane reset-path): the wrapper wrote the consume, with this press's key, to
 *  its app-server — the request went out. A "sent" that arrives after the ack window settled the
 *  attempt `not-sent` (a wrapper busy for 90 s) re-opens it: the request did go out after all. */
function onResetCreditSentRecord(session, payload, now = Date.now()) { // `now` = the record's own instant when read back from the wrapper's buffer file (verify r10), else its arrival
  try {
    const tKey = session._resetCreditKey || liveQuotaKeyFor(session);
    const t = resetCreditTryByAnswer(payload, session, tKey);
    if (!t) return;
    if (t.outcome === 'not-sent') { console.log(`[reset-credit] ${session._webuiId}: the request on ${nameOf(t.key)} went out after all (${Math.round((Date.now() - t.at) / 1000)} s after it was written) — the ten-minute wait starts now`); t.outcome = null; t.outcomeAt = 0; persistResetCreditTries(); }
    noteResetCreditSent(t, now);
  } catch (e) { console.warn('[reset-credit] sent record failed:', e.message); }
}
/**
 * THE ANSWER TO A RESET-CREDIT ATTEMPT — a conversation wrapper's `reset_credit_result`, or the
 * helper's (lane reset-path: `session` null, the attempt found by its idempotency key). The answer
 * is CLASSIFIED by the PURE rule (src/reset-credit.js creditAnswerOf): a vendor outcome went out;
 * a keyless refusal naming the key = a wrapper older than the key (refused locally, never sent —
 * the session is marked so the auto rung skips it and a person's press goes to the helper);
 * "timed out" = sent and unanswered (the floor stays armed: it may still land); any other answered
 * error = nothing spent. Only `reset` and an unanswered sent consume keep the ten-minute floor.
 */
function handleResetCreditResult(session, payload) {
  const ans = resetCredit.creditAnswerOf(payload);
  const out0 = payload.outcome || payload.result?.outcome || null;
  // codex-cli >= 0.159 (its own schema): `alreadyRedeemed` = "the same idempotency key already
  // completed a reset successfully" — with a key the answer is THIS press's own earlier success
  // (the wrapper's retry of a timed-out consume), i.e. a reset; keyless (a wrapper older than the
  // key, the 0.153 meaning) it stays the superseded path below. creditAnswerOf spells both.
  const out = ans.outcome;
  // A WRAPPER OLDER THAN THE KEY on a codex-cli that requires it: the consume never reached the
  // vendor (refused locally, nothing spent) — the remedy is the conversation's wrapper (or the
  // helper path from the Agents list), never the raw "missing field" text
  const staleWrapper = out === 'refused-stale';
  // THE IDENTITY'S ATTEMPT this answer belongs to (r2) — its followers are settled with it; an
  // attempt already settled by the no-answer / not-sent timer has walked its ladder once and must
  // not walk it twice
  const tKey0 = session ? (session._resetCreditKey || liveQuotaKeyFor(session)) : null;
  const tryRec = resetCreditTryByAnswer(payload, session, tKey0);
  const tKey = (tryRec && tryRec.key) || tKey0;
  const sid = (session && session._webuiId) || (tryRec && tryRec.sid) || 'helper';
  // verify r4: a LATE answer for an attempt the chain no longer tracks (settled and dropped at a later press) — it is
  // charged already (at its send); a `reset` says a credit of this account DID land late: the person is told, every card
  // that offered it says used, and the pool waits for the post-reset reading. Nothing else moves: not the current
  // attempt, not the session's origin, not the ladder
  const keyedLate = !!(payload && typeof payload.idempotencyKey === 'string' && payload.idempotencyKey && !tryRec);
  if (keyedLate) {
    console.log(`[reset-credit] ${sid}: a late answer (${out || String(payload.error || '').slice(0, 60) || 'no word'}) for an earlier request on ${nameOf(tKey)} that is no longer tracked (key ${String(payload.idempotencyKey).slice(0, 8)}…) — ${out === 'reset' ? 'it LANDED late: the limit was reset (charged at its send)' : 'nothing changes'}`);
    if (out === 'reset' && tKey) {
      serverNotice(`codex-reset-late-${sid}-${Date.now()}`, `Reset credit on ${nameOf(tKey)} — an earlier request landed late: the limit was reset. The count shown next reflects it.`, { i18n: { key: i18nKey('Reset credit on {account} — an earlier request landed late: the limit was reset. The count shown next reflects it.'), params: { account: nameOf(tKey) } } });
      try { resolveResetCreditCards(tKey, { kind: 'used', at: Date.now(), untilSec: null }); } catch { }
      holdForResetReading(tKey, session ? session._webuiId : null);
    }
    return;
  }
  // verify r5 (LOW): the same keyed `reset` delivered twice (a replayed stdout line) is ONE landing — nothing is said,
  // resolved or held a second time; the record already says so
  if (tryRec && tryRec.outcome === 'reset' && out === 'reset' && payload && typeof payload.idempotencyKey === 'string' && payload.idempotencyKey === tryRec.idempotencyKey) {
    console.log(`[reset-credit] ${sid}: a repeated reset answer for ${nameOf(tKey)} (key ${String(payload.idempotencyKey).slice(0, 8)}…) — it had landed already; nothing changes`);
    return;
  }
  // (verify r10: a revived press is a PERSON's by its RECORD — the session object is new after a restart, its origin slot
  // empty — on every branch below, not only the r9 skip: its failure / late answer is reported to the person who pressed)
  const userAttempt = session ? (session._resetCreditOrigin === 'user' || !!(tryRec && tryRec.revivedAt && tryRec.origin === 'user')) : !!(tryRec && tryRec.origin === 'user');
  if (session) session._resetCreditOrigin = null; // one answer per attempt
  // verify r8 T0: the conversation's wrapper READ FIRST and did not consume — on this engine's own verdict (the attempt is
  // `skipped` already, said at the verdict) or because no verdict reached it in time (settled here, said once)
  if (out === 'skipped') {
    // verify r9 ② (reproduced): the attempt the boot revived `unknown` (it MAY have gone out) — the wrapper's own keyed word says
    // nothing did (`skipped`, sent:false): its word beats the boot's guess. Re-opened here so the settle below takes it (the floor
    // the guess armed ends with the outcome, the dialog is free, the person told); the restart's charge stands (never under-counted)
    let revivedPress = false;
    if (tryRec && ans.sent === false && revivedReadFirstWaiting(tryRec)) { revivedPress = true; tryRec.outcome = null; tryRec.outcomeAt = 0; tryRec.sentAt = 0; tryRec.settled = null; console.log(`[reset-credit] ${sid}: the wrapper says the press revived unknown at the restart was never consumed (${ans.why || 'skipped'}) — its word stands over the boot's guess; the restart's charge on the ledger stays (never under-counted)`); }
    if (!tryRec || tryRec.outcome || tryRec.sentAt) { console.log(`[reset-credit] ${sid}: the wrapper's read before the consume ended with no consume on ${nameOf(tKey)} (${ans.why || 'skipped'})${tryRec ? ' — the attempt is ' + (tryRec.outcome ? tryRec.outcome + ' already' : 'SENT already (a skipped after a send is not the wrapper\'s: ignored)') : ''}`); return; }
    try { if (tryRec.hold && !tryRec.charged) spendGuard.release({ hold: tryRec.hold }); } catch { }
    tryRec.hold = null; tryRec.skipWhy = ans.why || 'no-verdict';
    settleResetCreditTry(tryRec, 'skipped', { failed: true });
    console.log(`[reset-credit] ${sid}: the wrapper read the account before the consume on ${nameOf(tKey)} and did not consume (${tryRec.skipWhy}) — nothing spent`);
    // a revived press is a PERSON's by its record (the session object is new after a restart: its origin slot is empty)
    if (userAttempt || (revivedPress && tryRec.origin === 'user')) { const nt = resetCreditSkipNotice(tryRec); serverNotice(`codex-reset-skip-${sid}-${Date.now()}`, nt.text, { i18n: nt.i18n }); }
    return;
  }
  const alreadyWalked = !!(tryRec && (tryRec.outcome === 'no-answer' || tryRec.outcome === 'not-sent'));
  // WENT OUT, OR NEVER DID (lane reset-path): an answer proves the send (the 2.369.199 wrapper
  // reports it only here) — the charge and the floor; a refusal before the send gives the spend
  // hold back and arms nothing
  if (tryRec && ans.sent) noteResetCreditSent(tryRec, Date.now(), { proof: 'answer' });
  if (tryRec && !ans.sent && !tryRec.charged && tryRec.hold) { try { spendGuard.release({ hold: tryRec.hold }); } catch { } tryRec.hold = null; }
  if (staleWrapper && session) session._resetCreditStale = true;
  // verify r8 T0: judged against the SEND — the read taken BEFORE the consume is newer than the attempt's open and says
  // nothing about the consume (it read "usable" / "spent" before anything went out); only a reading after the send can
  // show the limit open because of it, or be the post-reset reading the pool waits for
  const triedAtOf = () => (tryRec && (tryRec.sentAt || tryRec.at)) || Number(session && session._codexResetTriedAt) || 0;
  if (out === 'reset') {
    serverNotice(`codex-reset-ok-${sid}-${Date.now()}`, session ? `Codex reset credit consumed — the limit was reset, continuing on the same account.` : `Codex reset credit used on ${nameOf(tKey)} — the limit was reset.`, { i18n: session ? { key: i18nKey('Codex reset credit consumed — the limit was reset, continuing on the same account.'), params: {} } : { key: i18nKey('Codex reset credit used on {account} — the limit was reset.'), params: { account: nameOf(tKey) } } });
    // worked:false — codex says the LIMIT was reset on this identity; the
    // conversation itself has produced nothing yet. Nothing on this path
    // fires a continue either (this very call disarms first, so the
    // kickPoolEval below finds an unarmed session), so the classification
    // only decides whether a still-live failed fire keeps its quarantine —
    // and a redeemed credit is not a reason to re-open the hour's budget:
    // that quarantine self-expires in 10min, the same floor
    // the credit rung itself paces on (RESET_CREDIT_FLOOR_MS).
    if (session) { try { getAutoResume()?.noteRecovered?.(session._webuiId, 'codex reset credit consumed', { worked: false }); } catch { } }
    if (tryRec && tryRec.outcome) { tryRec.outcome = 'reset'; tryRec.outcomeAt = Date.now(); tryRec.settled = null; persistResetCreditTries(); } // a late answer still re-opened the window
    settleResetCreditTry(tryRec, 'reset');
    // THE POOL WAITS FOR THE POST-RESET READING (r3, see holdForResetReading):
    // unless one already landed (the current wrapper re-reads BEFORE it
    // answers), the cache still says spent — deciding on it now moves the
    // pool off the account this credit just re-opened
    let reRead = false;
    try {
      const c = tKey ? readRawUsageCache(tKey) : null;
      const triedAt = triedAtOf();
      reRead = !!(c && triedAt && (Number(c.fetchedAt) || 0) > triedAt && (c.source === 'codex-rate-limits' || c.source === 'codex-reset-helper'));
    } catch { }
    if (tKey && !reRead) holdForResetReading(tKey, session ? session._webuiId : null);
    else kickPoolEval();
    // R3: every card that offered this credit says it was used (the new window's end, when the post-reset reading said it)
    try {
      let untilSec = null;
      if (reRead) { const c = readRawUsageCache(tKey); const b = (c && (c.sevenDay || c.fiveHour)) || null; untilSec = b && Number(b.resetsAt) > 0 ? Number(b.resetsAt) : null; }
      resolveResetCreditCards(tKey, { kind: 'used', at: Date.now(), untilSec });
    } catch { }
    return;
  }
  // credit didn't land (nothingToReset / alreadyRedeemed / cooldown /
  // error) — fall through to the normal ladder: switch, else wait.
  global.__vsEvent?.('codex-reset-credit-failed', staleWrapper ? 'stale-wrapper (no idempotencyKey)' : String(out0 || out || payload.error || 'unknown').slice(0, 60));
  // SUPERSEDED (r2, reproduced): `alreadyRedeemed` means somebody's credit
  // already re-opened this limit, and a reading of this account NEWER than
  // the attempt that shows it usable says the same — neither is a wall.
  // Demoting/arming from the attempt's stale stated reset moved the whole
  // pool off the account a sibling's credit had just re-opened. Re-read
  // instead (the existing caps-routed rung — the account's own app-server;
  // nothing here touches a vendor) and let THAT reading run the ladder.
  let superseded = null;
  if (out === 'alreadyRedeemed') superseded = 'the vendor says this limit was already redeemed';
  else {
    try {
      const c = tKey ? readRawUsageCache(tKey) : null;
      const triedAt = triedAtOf();
      if (c && triedAt && (Number(c.fetchedAt) || 0) > triedAt && quotaVerdict(c, Math.floor(Date.now() / 1000)).usable === true) superseded = 'a reading newer than the attempt shows the limit open';
    } catch { }
  }
  if (superseded) {
    console.log(`[reset-credit] ${sid}: credit answer ${out || 'unknown'} on ${nameOf(tKey)} — ${superseded}; not a wall (re-reading instead of demoting)`);
    settleResetCreditTry(tryRec, String(out || 'superseded'), { failed: true, superseded: true });
    if (userAttempt) serverNotice(`codex-reset-fail-${sid}-${Date.now()}`, `Reset credit not used on ${nameOf(tKey)} — ${superseded}.`, { i18n: { key: out === 'alreadyRedeemed' ? i18nKey('Reset credit not used on {account} — the vendor says this limit was already redeemed.') : i18nKey('Reset credit not used on {account} — a reading newer than the attempt shows the limit open.'), params: { account: nameOf(tKey) } } });
    try { Promise.resolve(probeQuotaForKey(tKey, { session })).then(() => kickPoolEval(), () => kickPoolEval()); } catch { }
    return;
  }
  // a LATE answer (the not-sent / no-answer timer settled it first) still states the true outcome:
  // the floor reads it (an unanswered consume arms, a nothingToReset does not)
  if (tryRec && tryRec.outcome && tryRec.outcome !== out) { tryRec.outcome = String(out || 'failed'); tryRec.outcomeAt = Date.now(); persistResetCreditTries(); }
  // the attempt's followers walk THEIR ladder whoever asked for it
  settleResetCreditTry(tryRec, String(out || 'failed'), { failed: true });
  // A PERSON'S attempt (p2) is REPORTED, never walked down the ladder: the
  // wall that card sat on already ran it, and a roster click may have no
  // wall at all (arming a wait from it would invent one).
  const said = staleWrapper
    ? 'this conversation\'s codex wrapper predates the reset-credit fix and codex refused the request (nothing was sent) — Terminate + Resume the conversation, or use the credit from the Agents list (it goes through a short-lived helper process there)'
    : out === 'unanswered' ? `no answer came back (${String(payload.error || 'timed out').slice(0, 120)}) — it may still land, so the next try waits ten minutes`
      : out === 'not-sent' ? `the request was never sent (${String(payload.error || 'no word from codex').slice(0, 120)}) — nothing was spent`
        // verify r3 (money): a word outside the measured enum (or none) is a consume we cannot read — never "nothing spent"
        : out === 'unknown-outcome' ? `codex answered «${String(ans.word || out0 || 'no outcome word').slice(0, 60)}», a word VibeSpace does not know (the measured CLI says ${resetCredit.VENDOR_OUTCOMES.join(' / ')}) — it may have spent a credit, so the next try waits ten minutes and the account's next reading settles it`
          : (RESET_CREDIT_OUTCOME_WORDS[out0] || `the vendor answered ${String(out0 || payload.error || 'unknown').slice(0, 120)}`);
  // THE WORDS' i18n (verify r5): one key per shape of `said`, the vendor's own text / word as a parameter
  const acct = nameOf(tKey);
  const saidI18n = staleWrapper ? { key: i18nKey('Reset credit not used on {account} — this conversation’s codex wrapper predates the reset-credit fix and codex refused the request (nothing was sent) — Terminate + Resume the conversation, or use the credit from the Agents list (it goes through a short-lived helper process there).'), params: { account: acct } }
    : out === 'unanswered' ? { key: i18nKey('Reset credit not used on {account} — no answer came back ({error}) — it may still land, so the next try waits ten minutes.'), params: { account: acct, error: String(payload.error || 'timed out').slice(0, 120) } }
      : out === 'not-sent' ? { key: i18nKey('Reset credit not used on {account} — the request was never sent ({error}) — nothing was spent.'), params: { account: acct, error: String(payload.error || 'no word from codex').slice(0, 120) } }
        : out === 'unknown-outcome' ? { key: i18nKey('Reset credit not used on {account} — codex answered «{word}», a word VibeSpace does not know (the measured CLI says {known}) — it may have spent a credit, so the next try waits ten minutes and the account’s next reading settles it.'), params: { account: acct, word: String(ans.word || out0 || 'no outcome word').slice(0, 60), known: resetCredit.VENDOR_OUTCOMES.join(' / ') } }
          : out0 === 'nothingToReset' ? { key: i18nKey('Reset credit not used on {account} — no current limit window is eligible for a reset (nothing was spent).'), params: { account: acct } }
            : out0 === 'noCredit' ? { key: i18nKey('Reset credit not used on {account} — the account has no reset credits available.'), params: { account: acct } }
              : { key: i18nKey('Reset credit not used on {account} — the vendor answered {text}.'), params: { account: acct, text: String(out0 || payload.error || 'unknown').slice(0, 120) } };
  if (out === 'unknown-outcome') {
    console.log(`[reset-credit] ${sid}: the consume on ${nameOf(tKey)} was answered «${String(ans.word || out0 || 'no outcome word').slice(0, 60)}» — not a word of the measured enum (${resetCredit.VENDOR_OUTCOMES.join('/')}): treated as a consume of unknown effect (charged, the floor, unsettled until a reading)`);
    // THE ONE For-you ITEM FOR A WORD WE DO NOT KNOW (verify r5, T2 ⑤): a server notice is a toast — gone with the tab; a
    // consume the engine could not read is a fact the owner should see once, with the vendor's word, until the reading
    // settles it (it expires with the wall it was for). This file is the `pool` producer (the For-you census binds the
    // origin to the producing FILE; the spend ceiling's own notices are spend-guard's)
    try {
      const todos = getUserTodos();
      const word = String(ans.word || out0 || 'no outcome word').slice(0, 60);
      const R = tryRec && Number(tryRec.resetsAtSec) > 0 ? Number(tryRec.resetsAtSec) * 1000 : 0;
      if (todos && typeof todos.add === 'function') todos.add('webui:reset-credit', {
        origin: 'pool',
        text: `Codex answered a reset-credit request on ${acct} with a word VibeSpace does not know («${word}») — it may have spent a credit; refresh the account (⟳) to settle it`,
        detail: `The measured codex CLI answers a consume with ${resetCredit.VENDOR_OUTCOMES.join(' / ')}; this one answered «${word}». The attempt is charged and the ten-minute wait is armed; the account's next reading (⟳ in the usage menu, or its next turn) says whether the count fell. If a new codex version added this word, scripts/measure-codex-protocol.mjs re-measures the outcome table.`,
        urgency: 'normal', kind: 'notice', sessionName: (session && session.name) || null,
        i18n: { text: { key: i18nKey('Codex answered a reset-credit request on {account} with a word VibeSpace does not know ({word}) — it may have spent a credit; refresh the account (⟳) to settle it'), params: { account: acct, word } } },
        expiresAt: R && R > Date.now() ? R : Date.now() + 24 * 3600e3,
      });
    } catch (e) { console.warn('[reset-credit] could not file the For-you notice about the unknown vendor word:', e.message); }
    // verify r4 (reproduced): the vendor ANSWERED, so the consume is complete — and its post-consume reading (the helper's,
    // the wrapper's: both read BEFORE they answer) was taken while the attempt was still inside the floor with no outcome,
    // so it settled nothing then. Consulted now: a count that did not fall settles it NOT LANDED at once (the floor still
    // holds its ten minutes); a fall settles it landed. An UNANSWERED consume keeps the fresh read of the next press
    // instead (it may still land after any earlier reading)
    // verify r5 (reproduced, money): r4 consulted the cache FILE — a merge whose `fetchedAt` is the newest push's while its
    // count and its buckets are CARRIED from older readings (usage-cache-write) — and a passive push after the send settled
    // the attempt NOT LANDED on a count stamped 11 min before the send ("the window is unchanged": a bucket stamped before
    // it); the next press consumed with no read. Only the carrier's OWN post-consume reading, kept on the attempt
    // (`postConsume`: the helper's read, or a wrapper push marked `afterReset` with this key), may judge it; a carrier that
    // marks none (an older wrapper) leaves it unsettled for the next press's read — the honest extra read, never a guess
    try { if (tryRec && tryRec.postConsume) settleResetCreditByReading(tKey, tryRec.postConsume); } catch { }
  }
  if (staleWrapper) console.log(`[reset-credit] ${sid}: the conversation's wrapper predates the consume's idempotencyKey (codex-cli refused it locally, nothing sent) — the ten-minute wait not started; Terminate + Resume updates it, a person's press goes through the helper`);
  if (userAttempt) {
    serverNotice(`codex-reset-fail-${sid}-${Date.now()}`, `Reset credit not used on ${nameOf(tKey)} — ${said}.`, { i18n: saidI18n });
    return;
  }
  if (alreadyWalked || !session) return; // the no-answer / not-sent timer already walked it
  walkLadderAfterCredit(session, { resetsAtSec: Number(session._codexLastResetsAt) || 0, lane: session._codexLastLane || null, key: tKey });
}
/** THE ONE codex snapshot writer (the wrapper's pushes, a wall's synthesized mark, the reset-credit helper's
 *  post-consume read): attributed through the turn-pinned slot (or the helper's own key), the window guard,
 *  the producer stamped, the one cache writer. */
function writeCodexReading(snap, source, { session = null, key: forKey = null } = {}) {
  if (!snap) return null;
  // ONE attribution function for readings (2026-09-07): the codex snapshot
  // is a VALUE like every other, so it goes through the same turn-pinned
  // validated slot instead of re-deriving "the pool's current member" per
  // record. liveQuotaKeyFor is the un-pinned twin (probe matching).
  // …and through the same window guard: `capsOf('codex').hotSwitch` is
  // 'impossible', so codex has no re-point to lag behind — but the guard is
  // about WHOSE numbers these are, and a key that is wrong for any other
  // reason is wrong the same way. The synthesized spent-bucket snapshot on
  // `task_failed` states no reset it did not receive, so it is inert there.
  // the helper's reading names its identity (lane reset-path: no session — the key IS the login it ran on)
  const _k0 = forKey || readingSlotFor(session).key || liveQuotaKeyFor(session);
  const key = guardReadingTarget(_k0, readingLag.windowOf(snap), { session, what: 'codex:' + source, entry: snap });
  // an ARCHIVED reading is not an unparseable one — the waiter must be told
  // which of the two happened (a probe that says "unparseable" about a
  // perfectly good payload sends the next reader hunting the wrong bug)
  if (!key) return { key: null, snap, archived: true };
  // STAMP THE PRODUCER AT THE WRITE (2026-09-07 r3, reproduced): the
  // provenance line reads `snap.source`, and `normalizeCodexRateLimit` is
  // a PURE payload mapper that cannot know which channel carried it — so
  // every codex panel rendered "via unknown · No producer recorded this
  // reading" about the one codex producer that exists.
  snap.source = source;
  // WHEN the stored reset-credit count was STATED (r2): the cache writer now
  // carries the count across pushes that do not state it, so the file's
  // `fetchedAt` no longer dates the count — resetCreditsLeft compares this
  // stamp with the session's own last read and trusts the fresher one
  if (snap.resetCredits && typeof snap.resetCredits === 'object' && !snap.resetCredits.at) snap.resetCredits = { ...snap.resetCredits, at: Number(snap.fetchedAt) || Date.now() };
  try {
    const cur = usageWrite.readCacheObject(USAGE_CACHE_DIR, key);
    if (!cur || (Number(cur.fetchedAt) || 0) < (Number(snap.fetchedAt) || 0)) {
      // codex has no OTel channel, so there is nothing to corroborate WITH:
      // the label is deliberately absent rather than a fabricated `true`.
      // ONE limit per push (B-9213): this snapshot names its own limitId
      // and the write path merges it under that id, so a Spark push can no
      // longer erase the plan limit this account is actually spending.
      usageWrite.writeCacheObject({
        cacheDir: USAGE_CACHE_DIR, key, obj: snap,
        set: quotaSourceFor(session ? session.backend : quotaBackendFor(key)).limitSetFromSnapshot?.(snap, { identity: key, source }) || null,
        source, backend: 'codex',
      });
    }
  } catch { }
  return { key, snap };
}
function recordCodexQuotaSignal(session, payload, rec = null, { asOf = null } = {}) {
  try {
    // verify r8 ②: a held fact replayed at the declaration is stamped at ITS instant (`asOf` = its arrival on the skewed
    // stream), never at the replay's — the cache writer and the settle rules then see it in its true order
    const now = Number(asOf) > 0 ? Number(asOf) : Date.now();
    // A LATE RECORD IS NOT A LIVE FACT — on THIS feed too (verify r5, reproduced on the real consumer: the lane-hot-switch
    // rule was wired into the claude parse only, while the codex wrapper stamps EVERY record it writes). A dead bridge's
    // backlog delivered a 3-h-old `rate_limits_updated` as NOW: the cache filed 3-h-old numbers as current, an unsettled
    // reset-credit attempt sent minutes earlier was settled NOT LANDED by them (the next press consumed with no read), and a
    // 3-h-old wall armed auto-resume. The consumer hands the whole record (`rec`); a reading or a wall it stamped more than
    // the bound ago is counted, never acted on. A keyed `reset_credit_sent` / `reset_credit_result` is a fact about a request
    // WE sent (late or not: the vendor's own answer to our key) and is always taken.
    if (rec && typeof rec === 'object' && payload && (payload.type === 'rate_limits_updated' || payload.type === 'task_failed')) {
      try { noteStreamRecord(session, rec); } catch { }
      // verify r8 T0: a reading the wrapper took IN REPLY to this engine's own verb (`beforeReset` + the press's key),
      // arriving within the bound of that verb's write, is a live fact whatever its stamp says — on a skewed stream the
      // stamp is about the clock, not the record. The gate below is for records nobody asked for
      const ownReply = payload.type === 'rate_limits_updated' && payload.beforeReset === true && typeof payload.idempotencyKey === 'string' && (() => { try { const t = resetCreditTryByAnswer({ idempotencyKey: payload.idempotencyKey }, null, null); return !!(t && ((!t.sentAt && !t.outcome) || revivedReadFirstWaiting(t)) && Date.now() - Number(t.at) <= recordLateness.LATE_MS); } catch { return false; } })();
      let v = null;
      try { v = ownReply ? null : liveFactVerdict(session, rec); } catch { v = null; }
      if (v && v.verdict === 'late') {
        noteLateFact(session, payload.type === 'task_failed' ? 'codex wall' : 'codex reading', v, (at) => recordCodexQuotaSignal(session, payload, rec, { asOf: at })); // held while no offset is declared (verify r7 ④); replayed at its own instant (verify r8 ②)
        if (payload.type === 'rate_limits_updated') settleLive(session, { ok: false, reason: `the reading is a backlog record (${recordLateness.lateWords(v.lateMs)} late) — not taken as live` });
        return;
      }
    }
    const sig = quotaSourceFor(session.backend).signalFromStream({ type: 'event_msg', payload }, now);
    // `source` is a PARAMETER, not an assumption: this helper serves two
    // channels and one of them does not always carry a reading (see the
    // task_failed call site, which synthesizes a spent-bucket snapshot).
    const writeSnap = (snap, source) => writeCodexReading(snap, source, { session });
    // Escape ladder on codex exhaustion: the RESET-CREDIT RUNG (resetCreditRung,
    // above — the verdict forks it by warmth) → ② pool switch → ③ auto-resume wait.
    // the request WENT OUT (lane reset-path): the floor + the charge start here, never at the write
    if (payload.type === 'reset_credit_sent') { onResetCreditSentRecord(session, payload, now); return; }
    if (payload.type === 'reset_credit_result') { handleResetCreditResult(session, payload); return; }
    if (payload.type === 'rate_limits_updated' && payload.rateLimits) {
      // the harness normalized the snapshot (window-by-length, exhaustion
      // markers, the on-demand resetCredits count) — sig.snapshot is it
      const snap0 = sig?.snapshot || null;
      // the live app-server push — the codex twin of claude's 'rate-limit-event'
      const w = writeSnap(snap0, 'codex-rate-limits');
      // THE CARRIER'S OWN POST-CONSUME READ rides ON THE ATTEMPT (verify r5): the 2.369.200 wrapper marks the read it takes
      // after the consume answered (`afterReset` + the press's key); an answer the engine cannot read (an unmeasured word)
      // is judged by THIS reading and by nothing else — the cache FILE is a merge (a carried count, a carried bucket, a
      // passive push taken while the consume was still in flight), never a witness of the consume's completion
      if (w && w.snap && payload.afterReset === true && typeof payload.idempotencyKey === 'string' && payload.idempotencyKey) {
        try { const t = resetCreditTryByAnswer({ idempotencyKey: payload.idempotencyKey }, null, null); if (t) t.postConsume = w.snap; } catch { }
      }
      // an rpc-rate-limits probe waiting on this session settles AFTER the
      // cache write — its next quotaVerdictFor already reads the fresh file
      settleLive(session, w && w.key ? { ok: true, key: w.key } // R4: the press is answered with WHOSE reading it wrote
        : { ok: false, archived: !!(w && w.archived), reason: w && w.archived ? 'the reading\'s window is not this account\'s (archived)' : 'unparseable rateLimits' });
      // the stored reset-credit count rides ONLY the on-demand read — remember it on
      // the session so the rung knows it even when a later passive push drops it
      // (p2: WITH the identity it was read for — after a pool switch the session
      // bills another member, and that member's count is not this one)
      if (snap0 && snap0.resetCredits && Number.isFinite(Number(snap0.resetCredits.availableCount))) session._resetCreditsSeen = { count: Number(snap0.resetCredits.availableCount), at: Date.now(), key: (w && w.key) || null };
      if (!w || !w.key) return;
      // verify r1: an UNANSWERED attempt on this identity is settled by this reading first (landed ⇒ `reset`, the
      // cards say used; else the block ends) — before the R3 re-judge below reads the cards
      // verify r9 ② (reproduced): the read pushed for a press that straddled a RESTART re-opens the record the boot revived
      // `unknown` BEFORE this reading settles it (the wrapper is waiting for a verdict — nothing went out)
      if (payload.beforeReset === true && typeof payload.idempotencyKey === 'string' && payload.idempotencyKey) { try { reopenRevivedReadFirst(session, payload.idempotencyKey); } catch (e) { console.warn('[reset-credit] the revived attempt could not be re-opened:', e.message); } }
      try { settleResetCreditByReading(w.key, w.snap); } catch { }
      // THE READ BEFORE A CONVERSATION'S CONSUME (verify r8 T0): the wrapper waits for this engine's verdict on it
      if (payload.beforeReset === true && typeof payload.idempotencyKey === 'string' && payload.idempotencyKey) { try { answerReadBeforePress(session, payload.idempotencyKey, w.snap); } catch (e) { console.warn('[reset-credit] the read before the consume could not be judged:', e.message); } }
      // R3 (lane reset-path): a reading past a card's stated reset, or one that shows the account usable,
      // answers the wall a card offered a credit for
      // — never while a credit on it is IN FLIGHT: the current wrapper re-reads BEFORE it answers, so that
      // reading is the credit's own post-reset reading, and the answer resolves the card as USED
      try { if (!resetCreditInFlight(resetCreditTryFor(w.key))) resolveResetCreditCards(w.key, { kind: 'reading', at: Number(w.snap.fetchedAt) || Date.now(), usable: quotaVerdict(w.snap, Math.floor(Date.now() / 1000)).usable === true }); } catch { }
      // the post-reset reading a `reset` answer was waiting on (r3): the pool
      // re-decides on it now — whatever it says
      { const e = resetReadingEndsHold(w.key, session, w.snap); if (e) releaseResetHold(e[0], 'its post-reset reading landed'); }
      global.__vsEvent?.('codex-rate-limits', `${w.key}${w.snap.rateLimitReachedType ? ':reached-' + w.snap.rateLimitReachedType : ''}`);
      if (sig.kind === 'exhausted') {
        const tripped = sig.tripped; // the window rate_limit_reached_type named
        const rcArgs = { resetsAtSec: tripped?.resetsAt, lane: arSignal.laneOf(w.snap), key: w.key, snap: w.snap };
        const rung = resetCreditRung(session, rcArgs);
        if (rung === 'consumed') return; // outcome event continues the ladder (this conversation's credit, or a sibling's on the same account)
        const poolBefore = poolDefaultOf(session);
        maybePoolAutoSwitch(session); // another ChatGPT account = seconds, not hours
        if (rung === 'switch-first' && poolDefaultOf(session) === poolBefore && resetCreditRung(session, { ...rcArgs, ladderPosition: 'after-switch' }) === 'consumed') return; // the switch moved nothing (gated / nowhere after all): the cold conversation's credit rung
        try { noteWallSignal(session, { resetsAtMs: (Number(tripped?.resetsAt) || 0) * 1000, bucket: tripped && tripped === w.snap.fiveHour ? 'fiveHour' : 'sevenDay', key: w.key, lane: arSignal.laneOf(w.snap) }); } catch { }
      } else {
        // the codex twin of the passive claude reading above — and the ONE
        // channel that can reach an IDLE conversation, which is why the
        // fresh-window edge exists (the 2026-09-08 incident's 21:55Z push)
        noteQuotaReadingForResume(session, w.snap, 'fresh non-limited codex reading');
        kickPoolEval();
      }
      return;
    }
    if (payload.type === 'rate_limits_updated') {
      // an on-demand rateLimits/read that FAILED ({error, onDemand}) — settle
      // any rpc-rate-limits probe waiting on this session, honestly
      settleLive(session, { ok: false, reason: String(payload.error || 'no rateLimits in reply') });
      // verify r8 T0: the read BEFORE a consume failed — the wrapper goes on to its consume on the count shown; SAID here
      if (payload.beforeReset === true && typeof payload.idempotencyKey === 'string' && payload.idempotencyKey) { try { answerReadBeforePress(session, payload.idempotencyKey, null, String(payload.error || 'no rateLimits in the read before the consume')); } catch { } }
      // …and a hold waiting on THIS session's post-reset re-read hears that it
      // FAILED (r4) — not merely that it is late: the pool keeps the account on
      // the vendor's `reset` and the hold's own timer asks again
      try { const e = resetHoldEntry(liveQuotaKeyFor(session)); if (e && e[1].sid === session._webuiId) console.log(`[reset-credit] ${session._webuiId}: the post-reset re-read of ${nameOf(e[0])} failed (${String(payload.error || 'no rateLimits').slice(0, 120)}) — the pool keeps it on the vendor's word; asking again shortly`); } catch { }
      return;
    }
    if (payload.type === 'task_failed') {
      if (!sig) return; // no typed codex_error_info, or one that is neither exhaustion nor auth
      const info = sig.errorInfo;
      if (sig.kind === 'exhausted') {
        // exhaustion may arrive WITHOUT a fresh snapshot — mark the current
        // member's cache dead with the error's resets_at (or a bounded guess)
        const nowSec = Math.floor(now / 1000);
        const resets = sig.resetsAtSec;
        // THE SYNTHESIZED SNAPSHOT'S LANE IS A DEFAULT, and it is the best
        // evidence this record carries: the measured exhaustion record has
        // `rateLimits: null`, so the plan lane `'codex'` is what we already
        // write into this account's cache as its state, and the fresh-window
        // edge is armed on it. If the true wall were a MODEL lane
        // (`codex_bengalfox`) the consequence is bounded and self-correcting —
        // a healthy `codex` reading fires ONCE and the edge is spent for this
        // wall AT THE DELIVERY (auto-resume `edgeSpent`, cleared only by proof
        // of work — deliberately not by our rejection report, which this
        // module would have to be trusted to send); the timed path still
        // delivers at the stated reset.
        // THAT BOUND IS THE `edgeSpent` RULE AND NOTHING ELSE (r2): this
        // comment used to credit the loop breaker's quarantine, which is TEN
        // MINUTES, so the real ceiling was the hourly cap — 3 billed continues
        // per rolling hour, every hour, for the life of the watch (measured:
        // [3,3,3,3] over 4 simulated hours against the real modules). Do not
        // restore that claim without re-measuring it.
        // Inventing a lane we cannot read would be worse in the other
        // direction (a wait no reading can ever open).
        // A RESTATED WALL (r5) is decided BEFORE anything is written: the
        // event it restates was re-opened by a reset credit moments ago, so it
        // neither re-marks the account nor ends the reset hold (only a reading
        // or a wall with a different stated reset may) nor walks the ladder
        const restated = restatedResetWallTry(creditIdentityFor(session).key, resets, Date.now());
        if (restated) {
          console.log(`[reset-credit] ${session._webuiId}: restated wall of the re-opened event on ${nameOf(restated.key)} (stated reset ${resets || 'none'}, re-opened by ${restated.sid}'s credit ${Math.round((Date.now() - restated.outcomeAt) / 1000)}s ago) — not re-marking it, not switching`);
          return;
        }
        const snap = sig.snapshot || {
          limitId: 'codex', sevenDay: { utilization: 1, usedPercent: 100, windowMinutes: 10080, resetsAt: resets > nowSec ? resets : nowSec + 24 * 3600, status: 'limited' },
          fiveHour: null, rateLimitReachedType: 'unknown', fetchedAt: now,
        };
        // A REFUSAL, not a push: this is codex's 'limit-banner' — the claude
        // vocabulary already names it ("own session (limit hit)"), and the
        // `sig.snapshot ||` fallback above SYNTHESIZES a spent bucket, which is
        // not a reading at all. Calling either one 'codex-rate-limits' would
        // claim a producer that did not produce it.
        const w2 = writeSnap(snap, 'limit-banner');
        // a WALL on an account whose reset credit is pending says the reset did
        // not hold (r4): the hold ends here, and the ladder below decides on it
        try { const e = w2 && w2.key ? resetHoldEntry(w2.key) : null; if (e) releaseResetHold(e[0], 'a new wall on it after the reset', { force: false }); } catch { }
        global.__vsEvent?.('codex-usage-limit', info);
        const rcArgs = { resetsAtSec: resets, lane: arSignal.laneOf(w2?.snap || snap), key: w2?.key || null, snap: w2?.snap || snap };
        const rung = resetCreditRung(session, rcArgs);
        if (rung === 'consumed') return; // the credit rung (warm: before the switch; cold: only with nowhere to switch)
        const poolBefore = poolDefaultOf(session);
        maybePoolAutoSwitch(session);
        if (rung === 'switch-first' && poolDefaultOf(session) === poolBefore && resetCreditRung(session, { ...rcArgs, ladderPosition: 'after-switch' }) === 'consumed') return; // the switch moved nothing: the cold conversation's credit rung
        try { noteWallSignal(session, { resetsAtMs: resets > nowSec ? resets * 1000 : 0, bucket: 'sevenDay', key: w2?.key || liveQuotaKeyFor(session), lane: arSignal.laneOf(w2?.snap || snap) }); noteTurnEnd(session); } catch { }
      } else if (sig.kind === 'auth-failure') {
        global.__vsEvent?.('codex-auth-failure', session._accountId || 'global'); // v1: surfaced, not auto-evicted (claude's evict is creds-path-specific)
      }
      return;
    }
  } catch (e) { console.warn('[codex-quota] signal failed:', e.message); }
}
/** A limit banner (`rec` = the record that carried it, when the caller has
 *  one) — taken only when that record is a LIVE fact (gateLiveFact). */
function markLimitBanner(session, text, rec = null) {
  return gateLiveFact(session, rec, 'limit banner', () => markLimitBannerNow(session, text));
}
function markLimitBannerNow(session, text) {
  try {
    const hit = ClaudeCodeAdapter.parseLimitBanner(text);
    if (!hit) return;
    // …and it is REMEMBERED for the rest of the turn (B-ccaa): a rejection
    // that arrives AFTER this banner must still be decided by it, not by the
    // evidence rule. A 5-hour banner names no weekly lane and is not kept.
    if (hit.kind === 'scoped' || hit.kind === 'sevenDay') { try { session._turnBannerLane = { kind: hit.kind, name: hit.name || null, at: Date.now() }; } catch { } }
    // THE BANNER NAMES THE LANE (2026-09-13). It runs FIRST so the deferred
    // write lands with the EVENT's own `resetsAt` — the banner deliberately
    // states no time, and `bump` below keeps a known FUTURE reset, so the
    // precise one survives instead of being replaced by the 24 h guess.
    try { laneFromBanner(session, hit); } catch (e) { console.warn('[wall] lane-from-banner failed:', e.message); }

    // host-aware (2.289.0) — a remote host-login banner belongs to the host
    // bucket, not __global__. The banner is a REJECTION (the CLI refused the
    // turn), so since 2026-09-07 it marks the session's credential SLOT, the
    // same identity the wall machine demotes — not the OTel-observed org
    // (that names the identity cached at spawn; see the header note).
    // TURN-PINNED (r3): the banner is usually the SECOND record of a rejection
    // whose first record already re-pointed the link, so asking for the slot
    // fresh here marked the member the pool had just moved TO.
    const slot = rejectionSlotFor(session);
    const pinKey = slot.key || readingSlotFor(session).key || usageCacheKeyFor(session);
    // …but the WRITE follows a re-file this turn PROVED (wallRecordTarget). The
    // banner states no time, so it has no window of its own to be judged by —
    // and it is the same wall, so leaving it on the refuted member marks two
    // members for one rejection. `pinKey` is kept for the SIGNAL below: that
    // key is what demoteWalledAccount resolves `member` and `ids` from, and
    // moving it would silently drop every earlier signal keyed to the pin —
    // the member's OWN legitimate wall among them. The turn-end pass reaches
    // the same destination by asking the same proof (wallAttributionFor).
    let key = pinKey;
    const refile = session._turnWallRefile;
    if (refile && refile.from === key && refile.to) {
      console.log(`[wall] ${session._webuiId}: the banner follows this turn's proven re-file — marking ${nameOf(refile.to)}, not ${nameOf(key)} (the banner states no time of its own)`);
      key = refile.to;
    }
    // A REFUTED PIN IS NEVER MARKED BY THE BANNER OF THE SAME WALL (lane-hot-
    // switch, 2026-09-30 — the incident's last hop): the rejection record of
    // this turn stated a reset that contradicts the pin's own window, so the
    // banner's "limit" is not the pin's either. The mark is archived with that
    // reason; the SIGNAL still rides (the session IS refused, whoever's wall it
    // is) and the turn-end fold asks the same proof (wallAttributionFor).
    const refuted = session._turnWallRefuted;
    if (!(refile && refile.from === pinKey && refile.to) && refuted && refuted.from === pinKey) {
      const label = hit.kind === 'scoped' ? String(hit.name || '').toLowerCase() : BUCKET_LABEL[hit.kind] || hit.kind;
      archiveWall(session, { id: pinKey }, { kind: hit.kind, scopedName: hit.kind === 'scoped' ? label : null, resetsAtMs: 0, atMs: Date.now() },
        { action: 'archive', key: null }, `the banner is the same wall this turn's rejection record proved is not ${nameOf(pinKey)}'s (${refuted.reason})`, 'banner');
      maybePoolAutoSwitch(session);
      try { noteWallSignal(session, { bucket: hit.kind, scopedName: hit.kind === 'scoped' ? hit.name : null, key: pinKey, slot: !!slot.slotOk }); } catch { }
      return;
    }
    const nowSec = Math.floor(Date.now() / 1000);
    const bump = (b, fallbackResetSec) => ({
      ...(b || {}),
      // THE WINDOW STATE IS A VERDICT ABOUT A READING (r3, same rule as
      // rate-limit-capture's `restated`): this mark RE-STATES the utilization,
      // so the verdict the projection computed for the numbers it replaces does
      // not travel with it. Unconditional here because `bump` always restates.
      // Leaving it on turned a bucket stamped 'empty' or 'unknown' into a wall
      // the pool could not see — `bucketCounts` drops both, so the member the
      // CLI had just rejected read back as healthy.
      state: undefined,
      utilization: 1, status: 'limited',
      // keep a known FUTURE reset; else a bounded guess so the marker self-
      // expires (reset-passed ⇒ full) instead of pinning the account dead
      resetsAt: (Number(b?.resetsAt) || 0) > nowSec ? b.resetsAt : nowSec + fallbackResetSec,
    });
    const applyHit = (cache) => {
      if (hit.kind === 'fiveHour') cache.fiveHour = bump(cache.fiveHour, 5 * 3600);
      else if (hit.kind === 'sevenDay') cache.sevenDay = bump(cache.sevenDay, 24 * 3600);
      else if (hit.kind === 'scoped') {
        const list = Array.isArray(cache.scopedWeekly) ? cache.scopedWeekly : [];
        const i = list.findIndex((x) => String(x?.name || '').toLowerCase() === hit.name.toLowerCase());
        if (i >= 0) list[i] = bump(list[i], 24 * 3600);
        else list.push({ name: hit.name, ...bump(null, 24 * 3600) });
        cache.scopedWeekly = list;
      }
      return cache;
    };
    const fileFor = (id) => usageWrite.cacheFileFor(USAGE_CACHE_DIR, id);
    // IDENTITY-GROUP write (2.267.0, anchor-poison root cause): an org-merged
    // login keeps several cache files, and stamping fetchedAt=now onto ONE of
    // them used to PROMOTE that file — week-stale sibling buckets and all —
    // to "freshest" for the anchor sweep (real incident: banner on the idle
    // __global__ file flapped the identity's anchors 51→19→51 and the bounce
    // pair taught a poison rate). Base the promoted write on the identity's
    // FRESHEST file, and mark the same bucket dead in every sibling WITHOUT
    // touching its fetchedAt (a stale file must never gain freshness here).
    const ids = usageIdentityAccountIds(key);
    let base = null, baseAt = -1;
    for (const id of ids) {
      try { const c = JSON.parse(fs.readFileSync(fileFor(id), 'utf-8')) || {}; if ((Number(c.fetchedAt) || 0) > baseAt) { baseAt = Number(c.fetchedAt) || 0; base = c; } } catch {}
    }
    const cache = applyHit(base ? { ...base } : {});
    // NOTE (r2): this write used to have to rescue `ownWindow` by hand — the
    // freshest-sibling base is chosen for its READINGS, so writing it through
    // would have carried another file's window here. The established window now
    // lives in a sidecar (readingLag.windowSidecarName) that no reading producer
    // writes, so there is nothing here to preserve and nothing to forget.
    cache.fetchedAt = Date.now(); cache.source = 'limit-banner';
    delete cache.corroborated; // the OTel label corroborates nothing (lane-hot-switch) — no stamp, and none carried over
    delete cache.limits; // the freshest SIBLING's limits describe another file's windows — never carry them here
    usageWrite.writeCacheObject({ cacheDir: USAGE_CACHE_DIR, key, obj: cache, measuredAt: cache.fetchedAt, source: 'limit-banner', familyOf: familyOfScopedBucket, backend: 'claude' });
    for (const id of ids) {
      if (id === key) continue;
      try {
        let c2; try { c2 = JSON.parse(fs.readFileSync(fileFor(id), 'utf-8')) || null; } catch { c2 = null; }
        if (!c2) continue; // never CREATE a sibling file here
        applyHit(c2); // fetchedAt deliberately untouched
        delete c2.limits;
        usageWrite.writeCacheObject({ cacheDir: USAGE_CACHE_DIR, key: id, obj: c2, measuredAt: cache.fetchedAt, familyOf: familyOfScopedBucket, backend: 'claude' });
      } catch {}
    }
    global.__vsEvent?.('usage-limit-banner-marked', `${key}:${hit.kind}`);
    maybePoolAutoSwitch(session); // freshest possible exhaustion signal — act now
    // wall-machine: the banner is a BOOLEAN signal only (owner: never parse
    // text for TIMES) — no resetsAtMs here; the bucket name is the same one
    // parseLimitBanner gave the cache mark, and `key` is where that mark
    // landed (the wall's account, B-2c9b). Times come from quotaVerdict/probe.
    try { noteWallSignal(session, { bucket: hit.kind, scopedName: hit.kind === 'scoped' ? hit.name : null, key: pinKey, slot: !!slot.slotOk }); } catch { }
  } catch (e) { console.warn('[usage] banner mark failed:', e.message); }
}

function maybePoolAutoSwitch(session, { stop = false } = {}) {
  try {
    if (!session._accountId) return;
    // THE FIRST STOP (2026-09-22, warm-soft-defer): a conversation whose SOFT
    // move waits because it is mid-turn with a warm cache is owed that move the
    // moment it stops — in THIS call, never a later tick. The 10 s eval gate
    // throttles per-record kicks, and a stop is not a kick (a default switch a
    // few seconds earlier closes that gate). EVERY signalled stop of a
    // conversation no longer in a turn forces the re-decide, owed or not
    // (verifier LOW-2): a turn the gate never let the pool evaluate while it ran
    // has recorded nothing, yet owes the same move — the evaluation is cheap,
    // and the 180 s dwell belt is NOT forced, exactly as for the new-member wake.
    const force = stop
      && !conversationInTurn({ isStreaming: session._isStreaming, turnState: session._turnState });
    maybePoolAutoSwitchForPool(session._accountId, force ? { force: true } : undefined);
  } catch { }
}
/** The conversation's turn state went IDLE (claude `system/session_state_changed`,
 *  the harness's own authoritative turn-over signal — strictly LATER than the
 *  `result` record the turn-end boundary runs on, so a session under that
 *  authority is still 'running' at the boundary and is decided in-turn there).
 *  This record is that conversation's STOP: it re-decides every time, owed or
 *  not (verifier LOW-2 — a `result` boundary that landed inside the 10 s eval
 *  gate evaluated nothing and recorded nothing to owe). */
function noteTurnStopped(session) {
  try {
    if (!session || !session._accountId) return;
    maybePoolAutoSwitch(session, { stop: true });
  } catch { }
}

// ── A MEMBER BECAME USABLE, AND NOBODY NOTICED (2026-09-08, from the
// production journal) ──────────────────────────────────────────────────────
// Every member of pool "全部" was spent ("no member can serve it", 02:00:02).
// The owner added a subscription; at 02:18:33 the pool moved EIGHT fable
// conversations onto it ("from 0%") while it had NO reading at all, and four
// seconds later auto-resume RE-ARMED them for the far reset 10:20Z with the
// reason "<new member>: no usage data". The auto-cli panel read of that member
// FAILED at 02:18:40 (which doubled its backoff: the next read was 02:31:43),
// the owner refreshed by hand in between — and that route wrote a reading and
// told the pool NOTHING. The conversations sat armed for a reset eight hours
// away and were released at 02:25:01 only because the owner typed a prompt.
// (The opus conversations woke at 02:22:10 for an unrelated reason: one of
// their turns ended, and a turn end is the one event that already
// re-evaluates.)
//
// So the gap was never "the pool decided wrong" — THE POOL NEVER GOT TO
// DECIDE. It re-evaluates on turn ends and on streamed usage records, and a
// conversation that is ARMED produces neither. Two things make a member's
// first usable reading exist, and neither re-drove anything:
//   · a LOGIN succeeding (the finalize routes)
//   · a HUMAN ⟳ refresh (/api/usage/refresh)
// ONE function serves both, so a third producer cannot forget it.
//
// IT DOES NOT SPEND BY ITSELF. Releasing an armed conversation goes through
// auto-resume's own fireNow → attemptFire, i.e. the 2026-09-07 loop breaker
// (same-identity quarantine, 3/hour cap, backoff) AND the pre-fire gate that
// re-verdicts the target and vetoes the turn if it is still blocked. There is
// no bypass here, by construction: this module only says "look again".
const MEMBER_WAKE_FLOOR_MS = 20e3;         // two refreshes landing together are ONE wake
const MEMBER_READING_FRESH_MS = 10 * 60e3; // a wake acts on a reading taken NOW, never on a stale file
const LOGIN_READ_FLOOR_MS = 5 * 60e3;      // one usage read per login EDGE — a re-polled finalize must not spawn a second CLI
const _memberWakeAt = new Map();           // memberId → last wake that ACTED
const _loginReadAt = new Map();            // memberId → last login-edge usage read (shared with the auto-cli loop's attempt clock)

/** The pools this member can serve, as the pool machinery itself sees them
 *  (`poolMembers` is the same resolver the roster and the chooser use, so a
 *  pool with `members:null` — "every subscription" — is included by the one
 *  rule instead of a second interpretation of that null). */
function memberPoolsOf(memberId) {
  const out = [];
  try {
    for (const a of accounts.list().accounts || []) {
      if (a.type !== 'pooled') continue;
      let ms = [];
      try { ms = accounts.poolMembers(a.id) || []; } catch { }
      if (ms.some((m) => (m && m.id ? m.id : m) === memberId)) out.push(a);
    }
  } catch { }
  return out;
}

/** IS THIS STORED READING ACTUALLY THIS MEMBER'S? Composition with the
 *  window-fingerprint work (inc-mts8a8mr-ulmm, landed 2.369.73) — NOT a second
 *  copy of it.
 *
 *  That work ships TWO rules and this asks the SECOND one on purpose. ① the
 *  LAG SHADOW (`decideLagShadow`) is about a reading ARRIVING on a session
 *  after that session's link moved; it needs a session, a re-point and an age,
 *  and the producers already applied it before this snapshot reached the disk.
 *  ② the WINDOW IDENTITY GUARD (`decideReadingTarget`) is the question a wake
 *  actually has: a reading whose weekly window contradicts this member's own
 *  established window was produced on somebody else's credentials, so it may
 *  not drive a decision here either. Reached through the same
 *  `establishedWindows()` + `windowGroupOf` the write-time guard uses, so there
 *  is ONE predicate ("two functions answering one question" is the exact
 *  family of bug this area keeps producing) — and deliberately NOT called
 *  "shadowed", because that word already names rule ①.
 *
 *  READ-ONLY: `guardReadingTarget` is the WRITE path and it ARCHIVES. A wake
 *  must never move or delete anybody's data; it may only decline to act.
 *  Returns null when the reading is this member's — or when there is no
 *  evidence either way, which is the honest default AND the incident's own
 *  case: a brand-new member has no established window of its own for anything
 *  to contradict. */
function readingForeignForWake(memberId, snap) {
  try {
    const d = readingLag.decideReadingTarget({
      key: memberId,
      readingWindow: readingLag.windowOf(snap),
      windows: establishedWindows(),
      groupOf: windowGroupOf,
    });
    if (!d || d.action === 'write') return null;
    return d.action === 'refile' ? `these numbers are ${nameOf(d.key)}'s — ${d.reason}` : d.reason;
  } catch (e) {
    // A guard that cannot decide must not block — the same rule
    // guardReadingTarget states at its own catch ("writing as asked").
    console.warn('[usage] wake window check failed (acting anyway):', e.message);
    return null;
  }
}

/** THE ONE EDGE. Whatever produced a fresh reading for `memberId` calls this,
 *  and the two halves live HERE so a third producer cannot forget either:
 *
 *   ① RE-DECIDE the pools this member belongs to. `force` drops that pool's
 *      10 s event-KICK gate for this one call — the gate throttles per-record
 *      kicks, and a member's first reading is not a kick, it is the fact the
 *      whole decision was missing. The 180 s dwell belt is untouched, so this
 *      can no more oscillate than any other evaluation. DO NOT DELETE THIS AS
 *      REDUNDANT because half ② appears to cover it: it only looks that way
 *      when something is ARMED, since the pre-fire gate runs
 *      maybePoolAutoSwitch itself. With NOBODY armed — a live conversation on
 *      a spent member that has not hit the wall yet — half ① is the only
 *      thing that moves it (mutation-tested; test-new-member-wake §1c).
 *   ② RE-EXAMINE the conversations that are WAITING. Half ② is the incident's
 *      own shape: the conversations had ALREADY been parked on the newcomer
 *      since 02:18:33, so nothing switches — the per-session pass `continue`s
 *      long before it reaches its own fireNow — and a switch-driven nudge is
 *      therefore structurally unreachable. It fires only when the reading says
 *      the member can actually serve; "the pool moved somebody else" is half
 *      ①'s business and that path already nudges.
 *
 *      HALF ② SERVES ONLY THE CONVERSATIONS NOTHING COULD MOVE (r2). It fires
 *      a session only when a continue would land ON `memberId` and would have
 *      landed there BEFORE half ① ran too — i.e. exactly the shape the
 *      paragraph above describes. Round 1 filtered on pool MEMBERSHIP and
 *      fired anyway, which spent a real turn in three measured shapes:
 *        · a MANUAL pool (`auto:false`) — half ① returns at the top of
 *          maybePoolAutoSwitchForPool, so the link never moves; the continue
 *          bills the spent member and the card called that member "recovered".
 *        · a REMOTE session (`s.host`) — the per-session pass skips it BY
 *          DESIGN, same outcome.
 *        · a COLD pool (`hot:false`) — the pool RESTARTS such a conversation
 *          through the client (`pool-auto-switched`) precisely because its CLI
 *          cannot re-read credentials, and master's only other fireNow call
 *          site guards that same spend with `if (a.hot)`.
 *      The pre-fire gate cannot catch any of them: `quotaVerdictFor` answers a
 *      POOLED scope with "any member usable", which is true and beside the
 *      point. The fact half ② needs is the one this module already names —
 *      `fireIdentityFor`, "where would a continue land right now" — asked
 *      twice, because "the wake moved it there" and "it was already there" are
 *      different worlds and only the second is half ②'s. When half ① DOES move
 *      a conversation, that path fires it itself for a hot pool (:2417) and
 *      restarts it through the client for a cold one.
 *      WHAT THE COLD RULE COSTS, deliberately: a cold pool's conversation is
 *      released by the TIMED path at its armed reset rather than early. That is
 *      latency; firing anyway is money, spent on whichever member the CLI still
 *      holds — the restart is a CLIENT action, so with no browser connected
 *      nothing restarts and the link says one thing while the CLI bills
 *      another. Nothing in this process knows whether a client obeyed a restart
 *      broadcast, and guessing is worse than waiting.
 *
 *  "No reading" is a REFUSAL TO ACT, never a verdict of 0%. */
function onMemberReadingFresh(memberId, why = 'reading', { at = Date.now() } = {}) {
  const out = { member: memberId || null, why, acted: false, reason: null, detail: null, pools: [], fired: [], skipped: [] };
  try {
    if (!memberId || typeof memberId !== 'string') { out.reason = 'no-member'; return out; }
    let snap = null;
    try { snap = JSON.parse(fs.readFileSync(path.join(USAGE_CACHE_DIR, memberId.replace(/[^\w.-]/g, '_') + '.json'), 'utf-8')); } catch { }
    if (!snap) { out.reason = 'no-reading'; return out; }
    const age = at - (Number(snap.fetchedAt) || 0);
    if (!(age >= 0) || age > MEMBER_READING_FRESH_MS) { out.reason = 'stale-reading'; return out; }
    const foreign = readingForeignForWake(memberId, snap);
    if (foreign) { out.reason = 'foreign-reading'; out.detail = foreign; return out; }
    // THE FLOOR IS STAMPED ONLY WHEN WE ACT. A declined wake costs one file
    // read; stamping it would let a producer that called a millisecond before
    // its own cache write eat the wake the real one needed.
    const last = _memberWakeAt.get(memberId) || 0;
    if (at - last < MEMBER_WAKE_FLOOR_MS) { out.reason = 'wake-floor'; return out; }
    _memberWakeAt.set(memberId, at);
    if (_memberWakeAt.size > 512) _memberWakeAt.delete(_memberWakeAt.keys().next().value);
    out.acted = true;

    const pools = memberPoolsOf(memberId);
    const ar = getAutoResume();
    // WHERE A CONTINUE WOULD LAND, PER WAITING CONVERSATION, *BEFORE* HALF ①
    // IS ALLOWED TO MOVE ANYTHING (r2). Half ② serves only the conversations
    // nothing could move, and that is a fact about the world before the
    // re-decide — read after it, "the wake moved this session onto the new
    // member" is indistinguishable from "it was already parked there", and the
    // first of those is a spend half ① has already accounted for (it fires a
    // hot pool itself and restarts a cold one through the client).
    // MEASURED HONESTLY: deleting this snapshot changes no outcome TODAY —
    // auto-resume refuses the second fire on its own (`session._arFiring` is
    // raised for the whole gate, and a delivered continue deletes the arm), so
    // the mutant delivers the same one continue with the same card. It stays
    // because half ②'s money-safety must not be OWED to another module's
    // private in-flight flag, and because the skip is what makes half ②'s
    // contract ("only what nothing could move") testable rather than a
    // sentence in a comment. test-new-member-wake §8f drives the interlock
    // itself, so this claim is not decorative.
    const landedBefore = new Map();
    if (ar && ar.armedIds && ar.fireNow) {
      let ids0 = [];
      try { ids0 = ar.armedIds() || []; } catch { }
      for (const id of ids0) {
        const s0 = activeSessions.get(id);
        if (!s0) continue;
        try { landedBefore.set(id, fireIdentityFor(s0)?.key || null); } catch { landedBefore.set(id, null); }
      }
    }
    for (const p of pools) {
      out.pools.push(p.id);
      try { maybePoolAutoSwitchForPool(p.id, { force: true }); } catch (e) { console.warn(`[pool] wake re-decide ${p.id} failed:`, e.message); }
    }

    let usable = null;
    try { usable = quotaVerdict(poolReadCache()(memberId), at / 1000, { tier: 'hot' }).usable; } catch { }
    if (usable !== true) { out.reason = 'member-not-usable'; return out; }
    if (!ar || !ar.fireNow || !ar.armedIds) { out.reason = 'no-auto-resume'; return out; }
    const poolIds = new Set(pools.map((p) => p.id));
    let ids = [];
    try { ids = ar.armedIds() || []; } catch { }
    for (const id of ids) {
      const s = activeSessions.get(id);
      if (!s) continue;
      const acct = s._accountId || null;
      if (acct !== memberId && !poolIds.has(acct)) continue;
      // THE CONTINUE MUST LAND ON THE MEMBER THAT BECAME USABLE, AND MUST
      // ALREADY HAVE BEEN GOING TO (r2 — see the header). `fireIdentityFor` is
      // this module's ONE answer to "where would a continue land right now"
      // (it is auto-resume's own `fireIdentity` dep, so attemptFire re-resolves
      // the very same fact); asking pool MEMBERSHIP instead billed a spent
      // member and then called it recovered. A session armed DURING this wake
      // is absent from the snapshot and is therefore skipped — whatever armed
      // it did so having already seen this reading.
      let landsOn = null;
      try { landsOn = fireIdentityFor(s)?.key || null; } catch { }
      const before = landedBefore.has(id) ? landedBefore.get(id) : null;
      // A COLD pool RESTARTS the conversation through the client instead of
      // trusting the CLI to re-read its credentials — master's only other
      // fireNow call site guards its spend with exactly this (:2417), and the
      // restart is a CLIENT action: with no client connected nothing restarts,
      // the link says one member and the running CLI still holds another's
      // credentials. "The link points at the member that recovered" is
      // therefore not enough to know where a continue would BILL.
      // HOTNESS IS THE CAPS-GATED VERDICT, NEVER THE RAW FLAG (r3, reproduced):
      // `a.hot` is a WISH the user's checkbox persists; whether the pool can
      // act on it is `capsOf(backend).hotSwitch === 'verified'`, and the
      // pool-level path computes exactly that before its own `if (hot)` spend
      // (:2391/:2417). `capsOf('codex').hotSwitch` is 'impossible' (the 2026-
      // 08-24 experiment: CODEX_HOME is canonicalized at startup and the
      // tokens live in process memory), so a codex pool ALWAYS cold-restarts —
      // and a codex pool carrying `hot:true` is persisted state, not a
      // hypothesis: manage-agents offered that row un-gated until 2026-09-05
      // and PATCH /api/accounts/pool/:id still writes the flag with no caps
      // gate, so the setting is inert everywhere else and nobody had a reason
      // to unset it. Reading the raw flag here let the capability gate deliver
      // the very spend the pool-level path refuses.
      const pa = poolIds.has(acct) ? accounts.get(acct) : null;
      const cold = !!(pa && pa.type === 'pooled' && !(pa.hot && capsOf(pa.backend).hotSwitch === 'verified'));
      const why2 = landsOn !== memberId ? 'lands-elsewhere' : before !== memberId ? 'the wake moved it' : cold ? 'cold pool — it restarts instead' : null;
      if (why2) { out.skipped.push({ id, landsOn, before, why: why2 }); continue; }
      try {
        if (ar.fireNow(id, `${nameOf(memberId)} 已恢复可用`, { cause: 'member-usable' })) out.fired.push(id);
      } catch (e) { console.warn('[auto-resume] wake fire failed:', e.message); }
    }
    for (const k of out.skipped) {
      console.log(`[pool] member wake ${nameOf(memberId)}: left ${k.id} alone (${k.why}) — a continue there would have landed on ${nameOf(k.landsOn) || 'nobody'}`);
    }
    if (out.pools.length || out.fired.length) {
      console.log(`[pool] member wake ${nameOf(memberId)} (${why}): re-decided ${out.pools.length} pool(s), continued ${out.fired.length} waiting conversation(s)`);
    }
    global.__vsEvent?.('member-wake', `${memberId}:${why}:${out.fired.length}`);
    return out;
  } catch (e) {
    console.warn('[pool] member wake failed:', e.message);
    out.reason = 'error';
    return out;
  }
}

/** THE LOGIN HALF. A login succeeding is also a QUOTA EVENT: the member that
 *  just logged in has no reading, and "no usage data" is exactly what the pool
 *  and auto-resume saw for the subscription the owner added mid-exhaustion.
 *
 *  §ban-safety: ONE read through the EXISTING caps-routed rung
 *  (probeQuotaForKey → claude's `refreshViaCliPanel`, i.e. `claude -p /usage`
 *  with the official binary making the fetch; codex's app-server twin). No new
 *  vendor surface, and it is the HUMAN'S OWN LOGIN ACTION that triggers it —
 *  the same class as the ⟳ button, not a timer. Bounded twice over: the
 *  finalize routes gate on the credential FINGERPRINT of the answer they
 *  already hold (a polled route may not carry an unbounded side effect), and
 *  this floor is the belt.
 *
 *  THE RE-CHECK (owner 2026-09-29, "账号登录成功后，池会立刻重新决策一次并读一次用量";
 *  wired from server.js the same day — the routes had asked for it since
 *  2026-09-08 and server.js never passed it, so it was dead in production) =
 *  exactly ONE usage read + exactly ONE re-decision of every pool the member
 *  belongs to, journalled as `member wake <name> (login)`:
 *   - a member OUTSIDE EVERY POOL triggers nothing (no read, no decision) —
 *     there is no pool for the reading to inform;
 *   - the read answered ⇒ the wake re-decides on it (half ①) and continues
 *     only what nothing could move (half ②), exactly as for any fresh reading;
 *   - the read did NOT answer (no reading / a stale one) ⇒ the pools are still
 *     re-decided ONCE, forced like the wake's own half ① (a login landing is
 *     itself new information about the roster, and it costs local file reads)
 *     — and half ② sends no continue: "no reading" is never a verdict;
 *   - a reading whose window is another member's ⇒ nothing is decided on it
 *     (a wake may only decline on foreign numbers; the pool's own timer runs);
 *   - another producer woke this member a moment ago (`wake-floor`) ⇒ its
 *     re-decision was this one;
 *   - a second login inside LOGIN_READ_FLOOR_MS ⇒ nothing (no second read).
 *  A login that fails never reaches here: the routes wake only on a captured
 *  login. */
async function onMemberLoginSuccess(memberId, why = 'login success') {
  if (!memberId || typeof memberId !== 'string') return { ok: false, reason: 'no-member', wake: null };
  if (!memberPoolsOf(memberId).length) return { ok: false, reason: 'not-in-pool', wake: null };
  const now = Date.now();
  if (now - (_loginReadAt.get(memberId) || 0) < LOGIN_READ_FLOOR_MS) return { ok: false, reason: 'login-read-floor', wake: null };
  _loginReadAt.set(memberId, now);
  if (_loginReadAt.size > 512) _loginReadAt.delete(_loginReadAt.keys().next().value);
  let probe = null;
  try { probe = await probeQuotaForKey(memberId); } catch (e) { probe = { ok: false, reason: e.message }; }
  if (!probe || !probe.ok) console.log(`[pool] ${nameOf(memberId)}: login succeeded (${why}) but the usage read did not answer (${probe?.reason || 'unknown'}) — re-deciding the pool anyway`);
  const wake = onMemberReadingFresh(memberId, 'login', {});
  if (wake && !wake.acted && (wake.reason === 'no-reading' || wake.reason === 'stale-reading')) {
    for (const p of memberPoolsOf(memberId)) {
      wake.pools.push(p.id);
      try { maybePoolAutoSwitchForPool(p.id, { force: true }); } catch (e) { console.warn(`[pool] login re-decide ${p.id} failed:`, e.message); }
    }
    wake.redecided = true;
    console.log(`[pool] member wake ${nameOf(memberId)} (login): re-decided ${wake.pools.length} pool(s) without a reading (${wake.reason}) — no continue is sent on its behalf`);
  }
  return { ok: !!(probe && probe.ok), probe, wake, why };
}

/** THE SHARED ATTEMPT CLOCK. The auto-cli loop and the login edge spawn the
 *  SAME `claude -p /usage` through the SAME rung, so two attempt clocks race:
 *  the loop would spawn a second panel seconds after the login edge already
 *  did. The loop folds this into its own `lastAttemptAt`. */
function lastMemberReadAt(id) { return _loginReadAt.get(id) || 0; }

/** NOT READY IS NOT FAILED. The auto-cli loop skipped on the roster's
 *  `loggedIn`, which is `parseAuth`'s boolean: TRUE the moment an accessToken
 *  string exists in the file, whatever its expiry — so a credential file whose
 *  access AND refresh tokens have both expired reads as "logged in", the panel
 *  spawn cannot possibly answer, and every failure doubles a backoff that never
 *  had a chance. That is the satisfiable gap `src/login-state.js` exists to
 *  close, asked here through the same credential-FILE reader the pool's slot
 *  validation already uses.
 *
 *  THE FILE READER IS THE RIGHT ONE (not `accountLoginState`): this rung is
 *  `refreshViaCliPanel`, which DELETES CLAUDE_CODE_OAUTH_TOKEN from the child's
 *  env and points CLAUDE_SECURESTORAGE_CONFIG_DIR at the account's own dir, so
 *  a long-lived token cannot serve it — the credential file is literally the
 *  only thing that can.
 *
 *  MEASURED BOUNDARY: the "member has no credentials at all" half was ALREADY
 *  covered (parseAuth answers loggedIn:false when the file is absent, and the
 *  journal shows no auto-cli attempt for the new member before its login
 *  landed), and the incident's 02:18:40 failure happened with `loggedIn` TRUE —
 *  the loop's own gate let it through — so this guard is NOT claimed to be what
 *  would have prevented that particular failure count. It closes the adjacent,
 *  reachable hole. */
function autoCliReady(id) {
  const st = memberLoginState(id);
  return !st || st.usable !== false; // null = not a claude sub / unreadable roster ⇒ never block
}
// EVENT-DRIVEN pool evaluation (user-designed after exhaustion #2, 2026-08-09):
// every streamed usage record kicks a (5s-throttled) re-evaluation instead of
// waiting for the timer — combined with the estimator's live odometer, burst
// burns are seen the moment the CLI streams them, not when the ledger scan
// catches up. Zero network; decision reads memory + local files only.
let _poolEvalKickAt = 0;
function kickPoolEval() {
  const now = Date.now();
  if (now - _poolEvalKickAt < 5000) return;
  _poolEvalKickAt = now;
  setImmediate(() => {
    try {
      for (const a of accounts.list().accounts || []) {
        if (a.type === 'pooled' && a.auto) { try { maybePoolAutoSwitchForPool(a.id); } catch { } }
      }
    } catch { }
    try { sweepResetCreditAsks(); } catch { } // an ask item whose carrier is gone (r3)
  });
}
// WORKFLOW usage tailer (2.266.0, user question "不能拦截workflow agents吗"):
// workflow agents are IN-PROCESS API calls writing FILE-ONLY transcripts —
// there is no process to wrap — but tailing the run dir is the same thing at
// the file level: every agent-*.jsonl growth streams its usage records into
// the live odometer within ~1-2s (vs the 30s timer+scan). Armed when the
// launch ack ("Run ID: wf_…") crosses the session's stdout; belt-polled 5s
// (fs.watch can coalesce/miss); torn down after 30min without growth or when
// the session dies. rid-dedup in noteLive makes offset loss/re-reads harmless.
const _wfWatchers = new Map(); // runId → tailer handle
function armWorkflowUsageWatcher(session, sessionId, runId) {
  try {
    if (_wfWatchers.has(runId) || _wfWatchers.size >= 6) return;
    if (session.host) return; // remote runs have no local files; timer+harvest cover them
    const sid = session.claudeSessionId || session.backendSessionId;
    if (!sid || !session.cwd) return;
    const { cwdToProjectDir } = require('../session-store.js');
    const dir = path.join(os.homedir(), '.claude', 'projects', cwdToProjectDir(session.cwd), sid, 'subagents', 'workflows', runId);
    // The tailer RETRIES until the dir exists — the ack beats the harness's
    // mkdir by ~17ms, so the old one-shot existsSync never armed (2.270.0,
    // see src/workflow-usage-tailer.js for the forensics).
    const { createWorkflowTailer } = require('../workflow-usage-tailer.js');
    const tailer = createWorkflowTailer({
      dir,
      isAlive: () => activeSessions.has(sessionId),
      onRecord: (r) => {
        const u = r.message?.usage;
        const rid = r.requestId || r.message?.id; if (!rid) return;
        const cc = u.cache_creation || {};
        const acctKey = resolveUsageKey(session);
        const acct = acctKey === '__global__' ? null : acctKey;
        const model = r.message?.model;
        const whole = (u.input_tokens || 0) + (cc.ephemeral_5m_input_tokens || 0) + (cc.ephemeral_1h_input_tokens || 0) + (u.cache_read_input_tokens || 0); // parts of ONE request: the long-context rule is the request's
        const cost = (o) => usageHistory._cost({ acct, model, i: 0, o: 0, cw5: 0, cw1: 0, cr: 0, ...o }, whole);
        const usd = cost({ i: u.input_tokens || 0, o: u.output_tokens || 0, cw5: cc.ephemeral_5m_input_tokens || 0, cw1: cc.ephemeral_1h_input_tokens || 0, cr: u.cache_read_input_tokens || 0 });
        const cwUsd = cost({ cw5: cc.ephemeral_5m_input_tokens || 0, cw1: cc.ephemeral_1h_input_tokens || 0 });
        const crUsd = cost({ cr: u.cache_read_input_tokens || 0 });
        usageEstimator.noteLive({ rid, accountId: acctKey, model, usd, cwUsd, crUsd });
      },
      onDrain: (n) => {
        // Observability: this feature died silently for four releases because
        // nothing ever reported it running. Both signals are cheap + local.
        global.__vsMetric?.('wf-usage-noted', n);
        if (!_wfWatchers.get(runId)?._announced) {
          const h = _wfWatchers.get(runId); if (h) h._announced = true;
          global.__vsEvent?.('wf-usage-tailer-armed', runId);
        }
        kickPoolEval();
      },
    });
    _wfWatchers.set(runId, tailer);
    // Reap the handle when the tailer gives up (dead session / idle / no dir).
    const reap = setInterval(() => {
      if (_wfWatchers.get(runId) !== tailer) { clearInterval(reap); return; }
      if (tailer._state.stopped) { _wfWatchers.delete(runId); clearInterval(reap); }
    }, 30000);
    if (reap.unref) reap.unref();
  } catch { }
}
// TIMER-driven evaluation (2.263.0, real incident): the event triggers (turn
// `result` records + limit banner) both sit at TURN EDGES — an 8-minute
// review workflow burned an entire 5h window mid-turn with ZERO evaluation
// points and the pool only switched after exhaustion had failed 9 agents.
// Every auto pool now re-evaluates on a 60s timer (per-pool 60s throttle
// unchanged). §ban-safety: local reads only — the ledger scan mines the CLI's
// own transcripts (self-throttled), the decision reads cache files; no
// network anywhere.
setInterval(async () => {
  // THE STALE-LINK SWEEP first, for EVERY pool (2026-09-28): a member the pool no
  // longer lists stops serving on this tick whatever the placement mode
  try { sweepNonMemberLinks(); } catch { }
  try {
    const pools = (accounts.list().accounts || []).filter((a) => a.type === 'pooled' && a.auto);
    if (!pools.length) return;
    // freshen the odometer first (incremental, 15s-throttled) — and read it
    // only once the walk has SETTLED: the scan yields every MiB (perf ⑥), and
    // an odometer read mid-walk would decide on a ledger missing its newest
    // bytes (or re-decide on the one a scan in flight is about to commit)
    try { usageHistory.scan(); await usageHistory.scanSettled(); } catch { }
    for (const a of pools) { try { maybePoolAutoSwitchForPool(a.id); } catch { } }
  } catch { }
  // 30s (was 60s): the 2026-08-09 #2 exhaustion burned HALF the Fable bucket
  // between two ticks (12 concurrent maxed-context agents ≈ $100+/min) — a
  // tighter cadence can't fully close that gap (ledger visibility lags the
  // burn) but halves the blind window; anti-flap now lives in MIN_GAIN_PCT +
  // the proactive margin, not the cadence.
}, 30000);
function credsTokenSig(id) {
  // TOKEN MATERIAL signature, not mtime (review finding: repointPoolSymlink
  // utimes-bumps the target's creds on EVERY re-point, so an mtime-based
  // "somebody re-logged in" check is cleared by the pool's own plumbing).
  try { return String(JSON.parse(fs.readFileSync(accounts.subCredsPath(id), 'utf-8'))?.claudeAiOauth?.accessToken || ''); } catch { return ''; }
}
function memberAuthFailed(id) {
  const m = _memberAuthFail.get(id);
  if (!m) return false;
  if (Date.now() - m.at > AUTH_FAIL_TTL_MS) { _memberAuthFail.delete(id); return false; }
  if (credsTokenSig(id) !== m.tok) { _memberAuthFail.delete(id); return false; } // token CHANGED = re-login/refresh — give it another chance
  return true;
}
/** Switch CANDIDATES. Two filters with deliberately different escape hatches:
 *  · CREDENTIAL STATE is a HARD exclusion (2026-09-07) — `poolMembers()` keeps
 *    a member whose access AND refresh tokens have both expired, because
 *    `parseAuth` reports loggedIn:true for it (it only nulls the accessToken),
 *    and `ensureSessionPoolLink` would happily point a conversation at it.
 *    Moving a session onto credentials that cannot authorize a request is not
 *    "routing around a dead account", it IS the dead account — so there is no
 *    fallback here: an all-unusable pool returns EMPTY and decidePoolSwitch's
 *    `no-members` says so loudly, which is the state only the user can fix.
 *  · an auth-FAILURE mark is a live inference (10min TTL, cleared by a token
 *    change), so it keeps its 2.335.0 escape: every member marked means the
 *    marks are wrong more likely than the pool is dead — let quota speak. */
function healthyPoolMembers(poolId) {
  const usable = (accounts.poolMembers(poolId) || []).filter((m) => { const st = memberLoginState(m.id); return !st || st.usable; });
  const ok = usable.filter((m) => !memberAuthFailed(m.id));
  return ok.length ? ok : usable;
}
/** Candidates for a DECISION, as opposed to an ACT (integration r2). Same
 *  auth-failure escape as healthyPoolMembers and NO login pre-filter — the
 *  login verdict is decidePoolSwitch's own gate (poolReadLogin now folds both
 *  readers, so the exclusion is identical) and it can only NAME the members it
 *  was shown. Pre-filtering them out turned "Re-login those accounts in
 *  Manage Agents" back into "wait until a window resets": the wall the user
 *  can clear in 30 seconds, reported as a spent quota bucket.
 *  Use this wherever the list feeds decidePoolSwitch; use healthyPoolMembers
 *  wherever the list is a set of re-point targets to act on. */
function switchCandidates(poolId) {
  const all = accounts.poolMembers(poolId) || [];
  const ok = all.filter((m) => !memberAuthFailed(m.id));
  return ok.length ? ok : all; // the 2.335.0 auth-fail escape, unchanged
}

// A running session's CLI reported an AUTH-class API failure (401×2+/403/ban/
// credit message). Quota decisions can't see this — the failed account often
// still shows plenty of remaining — so route around it NOW: mark the member,
// re-point this session's link (and the pool default if it sits on the failed
// member), and say what happened. Runs regardless of `auto`: this is routing
// around a dead account (the 2.330.2 heal's live-session sibling), not quota
// optimization.
function notePoolAuthFailure(session, sid, info = {}) {
  try {
    const poolId = session?._accountId;
    const a = poolId && accounts.get(poolId);
    if (!a || a.type !== 'pooled' || session.host) return;
    if (!quotaSourceFor(session.backend).classifyAuthFailure(info)) return; // the session's harness knows its vendor's wording (S4)
    const memberId = accounts.poolCurrentFor(poolId, sid);
    if (!memberId) return;
    const now = Date.now();
    // throttle PER (member, session) — the member-keyed version left every
    // OTHER conversation pinned to the banned account for 60s each (review
    // finding: 3 sessions on A, A banned, only the first escaped)
    const tkey = memberId + ':' + sid;
    if (now - (_authNoteAt.get(tkey) || 0) < 60000) return;
    _authNoteAt.set(tkey, now);
    // WHY it failed, in the words that name the user's actual fix. When the
    // member's refresh token expired we KNOW the cause (the file says so) and
    // the CLI's own message ("OAuth session expired and could not be
    // refreshed") is about an unrecoverable login, not a transient API error —
    // saying "failing authentication" there sends the user to check the
    // network. Any other shape keeps today's wording verbatim.
    const li = (() => { try { return accounts.loginStateOf(memberId); } catch { return null; } })();
    const loginDead = li && !loginUsable(li);
    // STATE-branched (round-3 verifier's last low): a wiped ('logged-out') file
    // whose deadline is still ahead must not be narrated as an expiry in the
    // past — the deadline is quoted only once it has really passed.
    const why = loginDead
      ? `${loginWallPhrase(li)}${(typeof li.msLeft === 'number' && li.msLeft <= 0 && li.refreshExpiresAt) ? ` (login session ended ${new Date(li.refreshExpiresAt).toISOString()})` : ''} — re-login needed`
      : info.message ? String(info.message).slice(0, 120) : `HTTP ${info.status}`;
    if (!memberAuthFailed(memberId)) {
      _memberAuthFail.set(memberId, { at: now, reason: why, tok: credsTokenSig(memberId) });
      try { global.__vsEvent?.('pool-member-auth-failed', { detail: `${memberId}: ${why}` }); } catch { }
    }
    const memberName = accounts.get(memberId)?.name || memberId;
    // same rule as healthyPoolMembers: an evicted session may not be moved onto
    // credentials that cannot authorize a request (2026-09-07)
    const alive = healthyPoolMembers(poolId).filter((m) => m.id !== memberId);
    if (!alive.length) {
      serverNotice(`pool-authfail-stuck-${memberId}-${Math.floor(now / 3600000)}`,
        `Pool "${a.name}": account ${memberName} ${loginDead ? why : `is failing authentication (${why})`} and no other member can take over — re-login or replace it in Manage Agents.`, { level: 'warn' });
      return;
    }
    const ranked = rankPoolMembers({ members: alive, readCache: poolReadCache(poolId), nowSec: now / 1000, readLogin: poolReadLogin(), creditsIds: creditsMemberIds(alive), priority: poolPriorityOf(a) });
    const to = (ranked[0] && ranked[0].id) || alive[0].id;
    const toName = accounts.get(to)?.name || to;
    const hasOwnLink = (() => { try { fs.lstatSync(accounts.sessionPoolLinkPath(poolId, sid)); return true; } catch { return false; } })();
    if (hasOwnLink) accounts.ensureSessionPoolLink(poolId, sid, to, { why: 'auth-failure' });
    const defaultMoved = accounts.poolCurrent(poolId) === memberId;
    if (defaultMoved) accounts.setPoolTarget(poolId, to, { why: 'auth-failure' });
    _poolSwitchAt.set(poolId + ':' + sid, now); // keep the quota pass's dwell belt consistent with this move
    try { recordUsageAttribution({ claudeSessionId: session.claudeSessionId || session.backendSessionId, accountId: poolId }); } catch { }
    if (now - (_authNoticeAt.get(memberId) || 0) > 60000) {
      _authNoticeAt.set(memberId, now);
      serverNotice(`pool-authfail-${memberId}-${now}`,
        `Pool "${a.name}": account ${memberName} ${loginDead ? why : `is failing authentication (${why})`} — switched to ${toName}.${a.hot ? '' : ' Restarting the conversation to apply it.'}`, { level: 'warn' });
    }
    console.log(`[pool] auth-failure evict ${poolId}/${sid}: ${memberId} → ${to} (${why})`);
    if (!a.hot) {
      // a DEFAULT-link move affects every session billing through the default
      // (no own link), not just the reporter — collect them all (review)
      const affected = [];
      const pack = (theSid, s3) => ({ serverId: theSid, backend: s3.backend || 'claude', backendSessionId: s3.claudeSessionId || s3.backendSessionId || null, cwd: s3.cwd || null, name: s3.name || null, host: s3.host || null });
      affected.push(pack(sid, session));
      if (defaultMoved) {
        for (const [sid2, s2] of activeSessions) {
          if (sid2 === sid || s2._accountId !== poolId || s2.host) continue;
          const own = (() => { try { fs.lstatSync(accounts.sessionPoolLinkPath(poolId, sid2)); return true; } catch { return false; } })();
          if (!own) affected.push(pack(sid2, s2));
        }
      }
      sendColdRestart(poolId, affected, now);
    }
  } catch (e) { console.warn('[pool] auth-failure evict failed:', e.message); }
}

// Does this conversation carry its OWN pool link (plan C)? The pool DEFAULT
// moves exactly the ones that do not — the warm-cache hold and the default
// switch's `affected` list ask the SAME question through this one predicate.
function hasOwnPoolLink(poolId, sid) {
  try { fs.lstatSync(accounts.sessionPoolLinkPath(poolId, sid)); return true; } catch { return false; }
}

// ── A MEMBER REMOVED FROM THE POOL STOPS SERVING AT ONCE (2026-09-28, owner:
// "如果用到一半把账号从池里排除，不会第一时间触发切走，比如现在我把martinmax排除池子了你却还在用").
// Production, read-only: the owner removed Martin Max from the pool's members at
// 16:56 and six conversations kept billing it — their per-session links still
// pointed there and nothing moved them. Two causes, one fact: the STORE
// (updatePool) re-pointed only the pool DEFAULT, to `list[0]` (not a decision),
// never a per-session link; and the VERDICT judged the current member by its
// cache alone — membership was never a fact, `exclude` only removes candidates —
// so a removed member with quota left read "healthy" and served until spent.
// MEMBERSHIP IS A PLACEMENT FACT JUDGED BY THE VERDICT (decidePoolSwitch
// `membership` ⇒ 'not-a-member', a HARD wall: moves now, warm or mid-turn),
// never a candidate filter. ONE entry point acts on it, `memberRemoved`, called
// by the members route (the Members… dialog AND the member's own "Exclude from
// pool" action both PATCH it) and by the stale-link sweep every pool tick runs
// first (a removal made while the server was down, an old link): the default
// by DECISION, each linked conversation re-pointed through the ONE link writer
// (`ensureSessionPoolLink`, attributed to the slot like every re-point), a cold
// pool — or a process that HOLDS its member (codex) — restarted through the ONE
// restart sender. It starts no turn: nothing here fires or sends input.
const REMOVED_KEY = i18nKey('Pool "{pool}": {member} was removed from the pool — conversation "{title}" moved to {target}.');
const REMOVED_KEY_COLD = i18nKey('Pool "{pool}": {member} was removed from the pool — conversation "{title}" moved to {target}. Restarting the conversation to apply it.');
const _removedSaidAt = new Map(); // `${poolId}:${sid}:${member}` → last journal line for a conversation that could not move yet (one per 10 min)
function poolMembershipOf(poolId) { try { const m = accounts.poolMembership(poolId); return Array.isArray(m) ? m : null; } catch { return null; } }
/** THE POOL'S MANUAL PRIORITY (2026-09-28): the owner's ordered member list, or
 *  null = automatic. Every decision site hands it to the verdict (the per-session
 *  pass, the default, the spawn chooser, the removal and the credit's alternative)
 *  and the sealed-orders snapshot is ranked by it — ONE reader, no second order. */
function poolPriorityOf(a) { return a && Array.isArray(a.priority) && a.priority.length ? a.priority : null; }
/** THE words a conversation moved off a removed member is told (the per-session
 *  pass says the same when IT is the one that sees the removal first). */
function removedMemberNotice(poolId, sid, s, fromId, toId, cold) {
  const params = { pool: accounts.get(poolId)?.name || poolId, member: nameOf(fromId), title: convName(s, sid), target: nameOf(toId) };
  const text = `Pool "${params.pool}": ${params.member} was removed from the pool — conversation "${params.title}" moved to ${params.target}.${cold ? ' Restarting the conversation to apply it.' : ''}`;
  serverNotice(`pool-removed-${poolId}-${sid}-${fromId}`, text, { level: 1, i18n: { key: cold ? REMOVED_KEY_COLD : REMOVED_KEY, params } });
}
const PRIORITY_RETURN_KEY = i18nKey('Pool "{pool}": conversation "{title}" is back on {target} (priority #{rank}).');
const PRIORITY_RETURN_KEY_COLD = i18nKey('Pool "{pool}": conversation "{title}" is back on {target} (priority #{rank}). Restarting the conversation to apply it.');
/** THE words a conversation returned to a higher-priority member is told. */
function priorityReturnNotice(poolId, sid, s, d, cold) {
  const params = { pool: accounts.get(poolId)?.name || poolId, title: convName(s, sid), target: d.toName || nameOf(d.to), rank: d.priorityRank ?? '?' };
  const text = `Pool "${params.pool}": conversation "${params.title}" is back on ${params.target} (priority #${params.rank}).${cold ? ' Restarting the conversation to apply it.' : ''}`;
  serverNotice(`pool-prio-${poolId}-${sid}-${Date.now()}`, text, { level: 1, i18n: { key: cold ? PRIORITY_RETURN_KEY_COLD : PRIORITY_RETURN_KEY, params } });
}
// THE SPARE LANE (B-8a65 S5, owner 2026-10-03): a HOT pool moved an idle conversation off a member
// rich in a model cap it does not use (decidePoolSwitch 'spare-lane') — one sentence, naming the cap kept.
const SPARE_LANE_KEY = i18nKey('Pool "{pool}": conversation "{title}" moved to {target} — it does not use {lane}, so the {lane} quota on {source} is kept for the conversations that do.');
function spareLaneNotice(poolId, sid, s, d, fromId) {
  const params = { pool: accounts.get(poolId)?.name || poolId, title: convName(s, sid), target: d.toName || nameOf(d.to), lane: (d.spareLane && d.spareLane.label) || 'model', source: nameOf(fromId) };
  const text = `Pool "${params.pool}": conversation "${params.title}" moved to ${params.target} — it does not use ${params.lane}, so the ${params.lane} quota on ${params.source} is kept for the conversations that do.`;
  serverNotice(`pool-spare-${poolId}-${sid}-${Date.now()}`, text, { level: 1, i18n: { key: SPARE_LANE_KEY, params } });
}
// ── THE CONVERSATION'S PIN (2026-09-28, owner: "你可以加一个手动overwrite这个会话的池对象选择功能，
// 变成池的子菜单，直接选池本身就是自动切换，如果在子菜单里选"自动"也是自动切换，但如果选择某个具体账号，那在这个
// 账号耗尽之前就pin在这个账号下，刷新后也优先切到这个账号"). PRECEDENCE — conversation pin > pool
// priority order > automatic. The rule is PURE (account-pool-auto decidePinnedPlacement); here:
// the ONE writer (`setConversationPin`, behind POST /api/accounts/:poolId/pin), the reader the
// per-session pass and the spawn chooser ask (`poolPinOf`) and the words. A pin never starts a
// turn: setting one re-points at most a link; the per-session pass returns a conversation to its
// pin at its first stop through the same act block as every per-session move.
const PIN_KEYS = {
  pinned: i18nKey('Pool "{pool}": conversation "{title}" pinned to {member}.'),
  'pinned-later': i18nKey('Pool "{pool}": conversation "{title}" pinned to {member} — it moves there at its next restart.'),
  'pinned-waiting': i18nKey('Pool "{pool}": conversation "{title}" pinned to {member} — {member} cannot serve right now; it moves there when it can.'),
  unpinned: i18nKey('Pool "{pool}": conversation "{title}" is placed automatically again.'),
  back: i18nKey('Pool "{pool}": conversation "{title}" is back on {member} (pinned).'),
  'pin-exhausted': i18nKey('Pool "{pool}": conversation "{title}" — {member} is out of quota — running on {target} until it resets (pin kept).'),
  'pin-recovering': i18nKey('Pool "{pool}": conversation "{title}" — {member} has not got enough quota back yet — running on {target} for now (pin kept).'), // verify r2: over its hard bar, not yet settled — never "out of quota"
  'pin-login-dead': i18nKey('Pool "{pool}": conversation "{title}" — {member} cannot sign in — running on {target} until it is signed in again (pin kept).'),
  'pin-member-unknown': i18nKey('Pool "{pool}": conversation "{title}" — {member} is not usable in the pool right now — running on {target} (pin kept).'),
  'pin-member-excluded': i18nKey('Pool "{pool}": conversation "{title}" — {member} just refused this conversation — running on {target} for now (pin kept).'),
};
const PIN_RESTART_KEY = i18nKey('Restarting the conversation to apply it.');
function poolPinOf(session, poolId = null) {
  const p = session && session._poolPin;
  if (!p || typeof p !== 'object' || typeof p.memberId !== 'string' || !p.memberId) return null;
  if (poolId && session._accountId !== poolId) return null;
  return p;
}
function pinNotice(poolId, sid, s, kind, { member = null, target = null } = {}, cold = false) {
  const key = PIN_KEYS[kind] || PIN_KEYS['pin-member-unknown'];
  const params = { pool: accounts.get(poolId)?.name || poolId, title: convName(s, sid), member: nameOf(member), target: nameOf(target) };
  const fill = (tpl) => tpl.replace(/\{(\w+)\}/g, (m, x) => (params[x] !== undefined ? String(params[x]) : m));
  const restart = cold && (kind === 'back' || String(kind).startsWith('pin-'));
  serverNotice(`pool-pin-${poolId}-${sid}-${kind}-${Date.now()}`, fill(key) + (restart ? ' Restarting the conversation to apply it.' : ''),
    { level: 1, i18n: { key, params, ...(restart ? { then: { key: PIN_RESTART_KEY } } : {}) } });
}
/** Persist the pin into the session's meta (a restart restores it at the three boot-restore
 *  sites). Spread what is on disk, re-list only what changed (the persistFallbackStamp idiom). */
function persistPoolPin(session) {
  try {
    if (!session || !session.sockName) return;
    const prev = sessionMetaStore.readSessionMeta?.(session.sockName);
    if (prev === undefined || prev === null || typeof prev !== 'object') return; // not wired / no meta — memory only (never create one here)
    sessionMetaStore.writeSessionMeta?.(session.sockName, { ...prev, poolPin: session._poolPin || null });
  } catch (e) { console.warn('[pool] pin not persisted:', e.message); }
}
/** THE ONE WRITER of a conversation's pin. `memberId` = a member of the conversation's pool, or
 *  null = automatic ("自动", or the pool row itself). Returns {ok, pinned, placed, reason, code?,
 *  current} | {ok:false, code, status, error}. A pool that can re-point a running conversation
 *  (hot + verified + its own link) places it NOW (mid-turn included — a manual choice is never
 *  held) unless the pinned member cannot serve (then it waits, the pin kept); any other pool
 *  records it and it applies at the next restart/resume (never a restart by itself). Clearing
 *  moves nothing: automatic placement resumes from wherever the conversation is. */
function setConversationPin(sid, memberId, { by = 'user', now = Date.now() } = {}) {
  const s = sid ? activeSessions.get(sid) : null;
  if (!s) return { ok: false, status: 404, code: 'no_session', error: 'no live session with that id' };
  const poolId = s._accountId || null;
  const a = poolId ? accounts.get(poolId) : null;
  if (!a || a.type !== 'pooled') return { ok: false, status: 400, code: 'not_pooled', error: 'this conversation does not bill a pooled account' };
  if (s.host) return { ok: false, status: 400, code: 'remote_session', error: 'pooled accounts are local-only — a remote conversation cannot be pinned' };
  const membership = poolMembershipOf(poolId) || [];
  if (memberId != null && (typeof memberId !== 'string' || !membership.includes(memberId))) return { ok: false, status: 400, code: 'not_member', error: 'not a member of this pool: ' + String(memberId) };
  s._poolPin = memberId ? { memberId, at: now, by } : null;
  persistPoolPin(s);
  const caps = capsOf(a.backend);
  const own = hasOwnPoolLink(poolId, sid);
  let current = null; try { current = own ? accounts.poolCurrentFor(poolId, sid) : (heldPoolMemberFor(s, poolId) || accounts.poolCurrent(poolId)); } catch { }
  const out = { ok: true, pinned: s._poolPin, placed: false, reason: null, code: null, current };
  if (!memberId) {
    out.reason = 'automatic';
    console.log(`[pool] pin ${poolId}/${sid}: cleared — placed automatically again (from ${current || '?'})`);
    pinNotice(poolId, sid, s, 'unpinned');
    return out;
  }
  const hotNow = !!a.hot && caps.hotSwitch === 'verified' && !!caps.planC && own;
  if (!hotNow) {
    out.reason = 'applies-at-restart';
    out.code = caps.hotSwitch !== 'verified' ? 'codex_cold' : !a.hot ? 'cold_pool' : 'no_own_link'; // no_own_link = a legacy follower of the pool default (its CLI reads the pool's own link)
    out.placed = current === memberId;
    console.log(`[pool] pin ${poolId}/${sid}: → ${memberId} (${out.placed ? 'already there' : 'applies at the next restart'} — ${out.code})`);
    pinNotice(poolId, sid, s, out.placed ? 'pinned' : 'pinned-later', { member: memberId });
    return out;
  }
  const members = switchCandidates(poolId);
  const base = poolReadCache(poolId);
  const fam = projectionFamilyFor(s, sessionModelFor(s));
  const readCache = (id) => projectCacheForFamily(base(id), fam);
  const d = decidePinnedPlacement({ explicit: true, pin: memberId, currentId: current, members, readCache, nowSec: now / 1000, proactive: false, hot: true, pessimism: darkTaintedAccounts(), exclude: [...sessionWalledMembers(sid, now)], readLogin: poolReadLogin(), membership, priority: poolPriorityOf(a), reserveFloorPct: reserveFloorPct(), overageIds: overageMemberIds(members), creditsIds: creditsMemberIds(members) });
  if (d && d.reason === 'pin' && d.to) {
    try {
      accounts.ensureSessionPoolLink(poolId, sid, d.to, { why: 'pin' });
      _poolSwitchAt.set(poolId + ':' + sid, now);
      for (const k of [poolId + ':' + sid, poolId + ':' + sid + ':soft', poolId + ':' + sid + ':prio', poolId + ':' + sid + ':pin']) _warmHoldLogAt.delete(k);
      try { recordUsageAttribution({ claudeSessionId: s.claudeSessionId || s.backendSessionId, accountId: poolId }); } catch { }
      out.placed = true; out.reason = 'pin'; out.current = d.to;
    } catch (e) { out.reason = 'repoint-failed'; console.warn(`[pool] pin ${poolId}/${sid}: re-point failed:`, e.message); }
  } else if (d && d.reason === 'pin') { out.placed = true; out.reason = 'pin'; }
  else { out.reason = (d && d.pinWhy) || 'pin-exhausted'; }
  console.log(`[pool] pin ${poolId}/${sid}: → ${memberId} (${out.placed ? `placed${current !== out.current ? `, from ${current || '?'}` : ', already there'}` : `waits — ${out.reason}`})`);
  pinNotice(poolId, sid, s, out.placed ? 'pinned' : 'pinned-waiting', { member: memberId });
  return out;
}
/** Can `memberId` serve THIS conversation (or, `session` null, the pool as a whole) right now —
 *  the pin's own explicit verdict: a member of the pool, a login that can serve a turn, no bucket
 *  of the conversation's family view under its hard bar, not a member that just refused it.
 *  ONE judging site (gatherPlan and the held branch of memberRemoved both ask it). Facts only.
 *  → {ok, why} — `why` = the pin verdict's own name for the refusal. */
function memberVerdictFor(poolId, memberId, session = null, sid = null, now = Date.now()) {
  try {
    const base = poolReadCache(poolId);
    const fam = session ? projectionFamilyFor(session, sessionModelFor(session)) : null;
    const d = decidePinnedPlacement({ explicit: true, pin: memberId, currentId: memberId, members: switchCandidates(poolId), readCache: (id) => projectCacheForFamily(base(id), fam), nowSec: now / 1000, proactive: false, hot: true, pessimism: darkTaintedAccounts(), exclude: sid ? [...sessionWalledMembers(sid, now)] : null, readLogin: poolReadLogin(), membership: poolMembershipOf(poolId) });
    return d && d.reason === 'pin' ? { ok: true, why: null } : { ok: false, why: (d && d.pinWhy) || 'pin-member-unknown' };
  } catch { return { ok: false, why: 'pin-member-unknown' }; }
}
function memberCanServe(poolId, memberId, session = null, sid = null, now = Date.now()) { return memberVerdictFor(poolId, memberId, session, sid, now).ok; }
/** "MOVE EVERY CONVERSATION HERE NOW", JUDGED BEFORE IT MOVES ANYTHING (verify r1, money). The
 *  act's row is never greyed (addendum 4), so it is reachable on a member that is out of quota:
 *  the route moved every conversation onto it — mid-turn included — and the next pool pass moved
 *  them all back (two cold starts each, a wall for every request in between). ONE judgement, the
 *  pin's own (`decidePinnedPlacement`, explicit — the owner chose the member): `ok` = the member can
 *  take the pool as a whole (the DEFAULT may move there); per live conversation, under ITS family
 *  view (a spent Fable cap stops a Fable conversation, never an Opus one) and its own recent walls,
 *  `move` or `skip` with the reason by name ('pinned' = the conversation has its own pin).
 *  → {ok, why, until, move:[sid], skip:[{sid, name, why}]} — PURE facts, it moves nothing. */
function gatherPlan(poolId, memberId, now = Date.now()) {
  const out = { ok: false, why: 'pin-member-unknown', until: null, move: [], skip: [] };
  try {
    const a = accounts.get(poolId);
    if (!a || a.type !== 'pooled') return out;
    const whole = memberVerdictFor(poolId, memberId, null, null, now);
    out.ok = whole.ok;
    out.why = whole.why;
    if (!out.ok) { try { const v = quotaVerdict(poolReadCache(poolId)(memberId), now / 1000, { tier: 'hard' }); if (v && v.usable === false && v.until && v.until.resetsAt) out.until = v.until.resetsAt * 1000; } catch { } }
    for (const [sid, s] of activeSessions) {
      if (s._accountId !== poolId || s.host) continue;
      if (poolPinOf(s, poolId)) { out.skip.push({ sid, name: convName(s, sid), why: 'pinned' }); continue; }
      const v = memberVerdictFor(poolId, memberId, s, sid, now);
      if (v.ok) out.move.push(sid);
      else out.skip.push({ sid, name: convName(s, sid), why: v.why });
    }
  } catch (e) { console.warn('[pool] gather plan failed:', e.message); }
  return out;
}
// ── THE OWNER'S DECISION (2026-09-28, "全B"): A REMOVED MEMBER WITH NOBODY TO TAKE OVER STOPS AND WAITS ──
// A conversation on a member the pool no longer lists, with no member able to take it over, is NOT kept running on
// that member (whatever kind it is — a subscription or a pay-per-use credits member): it finishes its CURRENT turn
// (never cut) and then its link is parked on the verdict's `holdTo` — the listed member usable soonest — so the
// removed member serves nothing after that turn; its next request meets that member's own wall. A conversation that
// was RUNNING when the removal found it is ARMED at its stop (the ONE continue a member wake delivers, through
// auto-resume's breaker + the pre-fire gate + the spend ceiling — exactly a quota wall). One that was idle is parked
// and not armed: nothing was running, so nothing is continued (its next message meets the wall and arms like any
// quota wall). A process that HOLDS its member (codex) is restarted onto the pool default, parked on `holdTo`
// first. It starts no turn by itself.
const HOLD_KEYS = {
  armed: i18nKey('Pool "{pool}": {member} was removed from the pool and no other member can take over — conversation "{title}" stopped after its turn and continues automatically when a member can serve it.'),
  idle: i18nKey('Pool "{pool}": {member} was removed from the pool and no other member can take over — conversation "{title}" waits: its next turn goes out when a member can serve it.'),
  nowhere: i18nKey('Pool "{pool}": {member} was removed from the pool and no member of the pool is signed in — conversation "{title}" cannot be parked anywhere; sign a member in.'),
};
const HOLD_TODO_KEY = i18nKey('{member} was removed from pool "{pool}" and no other member can take over — its conversations stop after their current turn and wait until a member can serve them.');
const _removedHoldOwed = new Set(); // `${poolId}:${sid}` — was RUNNING when the removal found it ⇒ armed at its stop
const _removedHoldTodo = new Map(); // `${poolId}:${member}` → For-you item id (said ONCE per removal episode)
function holdNotice(poolId, sid, s, fromId, kind, toId = null, restart = false) {
  const params = { pool: accounts.get(poolId)?.name || poolId, member: nameOf(fromId), title: convName(s, sid), target: nameOf(toId) };
  const fill = (tpl) => tpl.replace(/\{(\w+)\}/g, (m, x) => (params[x] !== undefined ? String(params[x]) : m));
  const key = HOLD_KEYS[kind] || HOLD_KEYS.idle;
  serverNotice(`pool-removed-hold-${poolId}-${sid}-${fromId}-${kind}`, fill(key) + (restart ? ' Restarting the conversation to apply it.' : ''), { level: 'warn', i18n: { key, params, ...(restart ? { then: { key: PIN_RESTART_KEY } } : {}) } });
}
function holdTodo(poolId, s, fromId, now) {
  const k = `${poolId}:${fromId}`;
  if (_removedHoldTodo.has(k)) return;
  let todos = null;
  try { todos = getUserTodos(); } catch { todos = null; }
  _removedHoldTodo.set(k, null);
  if (!todos) return;
  const params = { pool: accounts.get(poolId)?.name || poolId, member: nameOf(fromId) };
  const bsid = s.backendSessionId || s.claudeSessionId;
  try {
    const item = todos.add(bsid ? `${s.backend || 'claude'}:${bsid}` : `webui:${s._webuiId}`, {
      origin: 'pool', kind: 'notice', urgency: 'normal', sessionName: s.name || null,
      text: HOLD_TODO_KEY.replace(/\{(\w+)\}/g, (m, x) => (params[x] !== undefined ? String(params[x]) : m)),
      i18n: { text: { key: HOLD_TODO_KEY, params } },
    });
    _removedHoldTodo.set(k, item && item.id ? item.id : null);
  } catch (e) { console.warn('[pool] removed-member hold: could not file the For-you item:', e.message); }
}
/** THE ONE ACT of the hold: `d` = the verdict that said `removed-hold` (to null, `holdTo` the parking member).
 *  → {held, deferred, armed, restarted, to} */
function holdRemoved(poolId, sid, s, fromId, d, now = Date.now()) {
  const key = poolId + ':' + sid;
  const out = { held: false, deferred: false, armed: false, restarted: false, to: null };
  try {
    if (conversationInTurn({ isStreaming: s._isStreaming, turnState: s._turnState })) {
      // never cut mid-turn: it finishes this turn on the removed member, then stops (its stop re-decides)
      _removedHoldOwed.add(key);
      out.deferred = true;
      const k = key + ':defer:' + fromId;
      if (now - (_removedSaidAt.get(k) || 0) > 10 * 60e3) { _removedSaidAt.set(k, now); console.log(`[pool] removed-member hold ${poolId}/${sid}: ${fromId} — mid-turn, stops at its turn end (never cut)`); }
      return out;
    }
    const owed = _removedHoldOwed.delete(key);
    const to = d && d.holdTo ? d.holdTo : null;
    out.to = to;
    if (!to) {
      const k = key + ':nowhere:' + fromId;
      if (now - (_removedSaidAt.get(k) || 0) > 60 * 60e3) { _removedSaidAt.set(k, now); console.log(`[pool] removed-member hold ${poolId}/${sid}: ${fromId} — no member of the pool is signed in; nowhere to park it`); holdNotice(poolId, sid, s, fromId, 'nowhere'); }
      return out;
    }
    const held = heldPoolMemberFor(s, poolId);
    if (held) {
      // a process that HOLDS its member (a pool that cannot hot-switch): the only way off is a restart onto the
      // pool DEFAULT — parked on the hold target first; the restart is a resume, never a turn
      try { if (accounts.poolCurrent(poolId) !== to) accounts.setPoolTarget(poolId, to, { why: 'removed-from-pool' }); } catch (e) { console.warn('[pool] removed-member hold: default park failed:', e.message); return out; }
      if (!restartInFlight(s, now)) {
        sendColdRestart(poolId, [{ serverId: sid, backend: s.backend || 'claude', backendSessionId: s.claudeSessionId || s.backendSessionId || null, cwd: s.cwd || null, name: s.name || null, host: s.host || null }], now);
        out.restarted = true;
        holdNotice(poolId, sid, s, fromId, 'idle', to, true);
        holdTodo(poolId, s, fromId, now);
        console.log(`[pool] removed-member hold ${poolId}/${sid}: ${fromId} held by the process — restarting it onto ${to} (parked; no continue)`);
      }
      out.held = true;
      return out;
    }
    accounts.ensureSessionPoolLink(poolId, sid, to, { why: 'removed-from-pool' });
    _poolSwitchAt.set(key, now);
    try { recordUsageAttribution({ claudeSessionId: s.claudeSessionId || s.backendSessionId, accountId: poolId }); } catch { }
    out.held = true;
    if (owed) {
      // it was RUNNING when the removal found it: the ONE continue a member wake delivers (auto-resume's own arm —
      // its breaker, its pre-fire gate and the spend ceiling stand between it and a billed turn)
      const ar = getAutoResume();
      if (ar && typeof ar.armIfEnabled === 'function') {
        let resets = 0;
        try { resets = Number(quotaVerdictFor(_wallScope(s), { model: sessionModelFor(s), session: s }).blockedUntil) || 0; } catch { resets = 0; }
        if (!(resets > now)) { let maxWait = 24 * 3600e3; try { maxWait = require('./auto-resume.js').MAX_WAIT_MS || maxWait; } catch { } resets = now + maxWait + 60e3; } // no stated reset: a WATCH (the wake still continues it)
        try { out.armed = !!ar.armIfEnabled(sid, s, resets, `removed from the pool (${nameOf(fromId)})`, { cause: { kind: 'removed-member', member: { id: fromId, name: nameOf(fromId) }, holdTo: { id: to, name: nameOf(to) } } }); } catch (e) { console.warn('[pool] removed-member hold: arm failed:', e.message); }
      }
    }
    holdNotice(poolId, sid, s, fromId, out.armed ? 'armed' : 'idle', to);
    holdTodo(poolId, s, fromId, now);
    console.log(`[pool] removed-member hold ${poolId}/${sid}: ${fromId} → ${to} (parked on the member usable soonest; ${out.armed ? 'armed — continues when a member can serve it' : owed ? 'auto-resume is off — waits' : 'was idle — not armed'})`);
    return out;
  } catch (e) { console.warn('[pool] removed-member hold failed:', e.message); return out; }
}
/** The pool verdict for a conversation (or the DEFAULT, `session` null) sitting
 *  on `fromId`, judged WITH the membership fact — the one decision the removal
 *  paths share (the store's default re-point asks it through updatePool's
 *  chooser, memberRemoved for every linked conversation). */
function removalVerdict(poolId, fromId, session = null, sid = null, now = Date.now()) {
  const a = accounts.get(poolId);
  // `hot` sets the bars the verdict NAMES; never `proactive` — a removed member is a
  // hard wall, so the move is the exhausted branch's and no voluntary tier runs here
  const hot = !!a?.hot && capsOf(a?.backend).hotSwitch === 'verified';
  const members = switchCandidates(poolId);
  const base = poolReadCache(poolId);
  const fam = session ? projectionFamilyFor(session, sessionModelFor(session)) : null;
  const readCache = (id) => projectCacheForFamily(base(id), fam);
  // a PINNED conversation leaving a removed member goes to its pin when the pin can serve
  // (explicit: nothing to settle — it is leaving anyway), else where the automatic rules put it
  const pinRec = session ? poolPinOf(session, poolId) : null;
  if (pinRec) {
    const dp = decidePinnedPlacement({ explicit: true, pin: pinRec.memberId, currentId: fromId, members, readCache, nowSec: now / 1000, proactive: false, hot, pessimism: darkTaintedAccounts(), exclude: sid ? [...sessionWalledMembers(sid, now)] : null, readLogin: poolReadLogin(), priority: poolPriorityOf(a), reserveFloorPct: reserveFloorPct(), overageIds: overageMemberIds(members), creditsIds: creditsMemberIds(members), membership: poolMembershipOf(poolId) });
    if (dp && dp.reason === 'pin' && dp.to) return dp;
    if (dp && dp.reason === 'pin-exhausted') return { ...dp, reason: dp.autoReason };
  }
  return decidePoolSwitch({ currentId: fromId, members, readCache, nowSec: now / 1000, proactive: false, hot, pessimism: darkTaintedAccounts(), exclude: sid ? [...sessionWalledMembers(sid, now)] : null, readLogin: poolReadLogin(), priority: poolPriorityOf(a), reserveFloorPct: reserveFloorPct(), overageIds: overageMemberIds(members), creditsIds: creditsMemberIds(members), membership: poolMembershipOf(poolId), explain: true });
}
/** Where the pool DEFAULT goes when the member it sits on left the pool — a
 *  DECISION (never the first member in the list). null = nobody can take it. */
function decideDefaultTarget(poolId, fromId) {
  try { const d = removalVerdict(poolId, fromId); return d && d.to ? d.to : null; } catch (e) { console.warn('[pool] default re-decide failed:', e.message); return null; }
}
/** Where ONE conversation's link goes when the member it points at leaves (a deleted account — accounts.remove's
 *  `chooseLink`, verify r2): the removal verdict for THAT conversation (its family view, its pin, its own recent
 *  walls). null = nobody can take it — the store then falls back to the pool default. */
function removalTargetFor(poolId, fromId, sid) {
  try { const s = sid ? activeSessions.get(sid) : null; const d = removalVerdict(poolId, fromId, s || null, s ? sid : null); return d && d.to ? d.to : null; } catch (e) { console.warn('[pool] link re-decide failed:', e.message); return null; }
}
/** …and when NOBODY can take it over (decideDefaultTarget answered null): the default still has to name a
 *  member the pool LISTS — it is where a NEW conversation starts, and a new conversation never starts on a
 *  removed member — so the ENGINE picks it (PURE soonestUsableMember: usable soonest by the pool's hard
 *  bars, then the owner's priority order, credits members last), never the store's list[0] and never
 *  "stays on the removed member" (verify r2: the members route landed on list[0], the stale-link sweep left
 *  the default on the removed member and new conversations started there). The conversations running on the
 *  removed member are NOT moved by this (nobody can serve them; the owner's decision, pending) and a cold
 *  pool's followers are not restarted onto it. null = no logged-in member the pool lists. */
function fallbackDefaultTarget(poolId, fromId = null) {
  try {
    const a = accounts.get(poolId);
    if (!a || a.type !== 'pooled') return null;
    const membership = poolMembershipOf(poolId) || [];
    const members = switchCandidates(poolId).filter((m) => m && m.id !== fromId && membership.includes(m.id));
    return soonestUsableMember({ members, readCache: poolReadCache(poolId), nowSec: Date.now() / 1000, priority: poolPriorityOf(a), creditsIds: creditsMemberIds(members) });
  } catch (e) { console.warn('[pool] default fallback failed:', e.message); return null; }
}
/** THE ONE ENTRY POINT: members `removedIds` no longer belong to `poolId` — move
 *  everything they still serve NOW. Returns what it did (the route answers it,
 *  the suites read it). */
function memberRemoved(poolId, removedIds, { why = 'removed-from-pool' } = {}) {
  const out = { pool: poolId, removed: [], moved: [], restarted: [], stayed: [], held: [], defaultMoved: null };
  try {
    const a = accounts.get(poolId);
    if (!a || a.type !== 'pooled') return out;
    const membership = poolMembershipOf(poolId);
    if (!membership) return out;
    // a member the pool STILL lists is never evicted, whatever the caller said
    const removed = new Set((Array.isArray(removedIds) ? removedIds : []).filter((x) => typeof x === 'string' && x && !membership.includes(x)));
    if (!removed.size) return out;
    out.removed = [...removed];
    const now = Date.now();
    const hot = !!a.hot && capsOf(a.backend).hotSwitch === 'verified';
    // ① the DEFAULT — where new conversations start and every legacy follower bills
    const def = accounts.poolCurrent(poolId);
    if (def && removed.has(def)) {
      const to = decideDefaultTarget(poolId, def);
      if (to) {
        try { accounts.setPoolTarget(poolId, to, { why }); out.defaultMoved = { from: def, to }; console.log(`[pool] removed-member evict ${poolId}/default: ${def} → ${to}`); } catch (e) { console.warn('[pool] removed-member default re-point failed:', e.message); }
      } else {
        // nobody can take it over: new conversations still never start on the removed member (verify r2)
        const fb = fallbackDefaultTarget(poolId, def);
        if (fb) {
          try { accounts.setPoolTarget(poolId, fb, { why }); out.defaultMoved = { from: def, to: fb, fallback: true }; console.log(`[pool] removed-member evict ${poolId}/default: ${def} → ${fb} — no member can take over; new conversations start on the one usable soonest`); } catch (e) { console.warn('[pool] removed-member default re-point failed:', e.message); }
        } else console.log(`[pool] removed-member evict ${poolId}/default: ${def} stays — no member the pool lists is signed in`);
      }
    }
    // ② every LIVE conversation still billed to a removed member
    const restart = [];
    const pack = (sid, s) => ({ serverId: sid, backend: s.backend || 'claude', backendSessionId: s.claudeSessionId || s.backendSessionId || null, cwd: s.cwd || null, name: s.name || null, host: s.host || null });
    const stay = (sid, s, on, d) => {
      out.stayed.push({ sid, on });
      const k = `${poolId}:${sid}:${on}`;
      if (now - (_removedSaidAt.get(k) || 0) < 10 * 60e3) return;
      _removedSaidAt.set(k, now);
      console.log(`[pool] removed-member evict ${poolId}/${sid}: ${on} stays — ${d ? `no member can take over (${d.reason})` : 'nothing to move it to yet'}`);
      if (d) serverNotice(`pool-removed-stuck-${poolId}-${on}-${Math.floor(now / 3600e3)}`, poolBlockedNotice(d, { poolName: a.name, currentName: nameOf(on) }), { level: 'warn' });
    };
    for (const [sid, s] of activeSessions) {
      if (s._accountId !== poolId || s.host) continue;
      const held = heldPoolMemberFor(s, poolId);
      const own = !held && hasOwnPoolLink(poolId, sid);
      let linkCur = null;
      if (own) { try { linkCur = accounts.poolCurrentFor(poolId, sid); } catch { } }
      const on = held || linkCur;
      if (!on) {
        // a FOLLOWER of the pool default moved with ① — a hot CLI re-reads the
        // default link by itself, a cold one restarts onto it
        if (out.defaultMoved && !out.defaultMoved.fallback && !hot) restart.push(pack(sid, s)); // never restarted onto a fallback nobody can serve from
        continue;
      }
      if (!removed.has(on)) continue;
      let to = null;
      if (held) {
        // the process HOLDS the removed member's login for its life (a pool that
        // cannot hot-switch): only a restart onto the (moved) default leaves it
        to = accounts.poolCurrent(poolId);
        if (!to || removed.has(to)) { stay(sid, s, on, null); continue; }
        // …and only a default that CAN SERVE it (verify r1): when nobody can take over, the default
        // sits on the store's first member — restarting the conversation onto that cut it off from
        // a member that serves, for one that cannot (a linked conversation in the same state stays)
        const dv = removalVerdict(poolId, on, s, sid, now);
        if (dv && dv.reason === 'removed-hold') { const h = holdRemoved(poolId, sid, s, on, dv, now); if (h.held || h.deferred) out.held.push({ sid, on, to: h.to, deferred: h.deferred }); else out.stayed.push({ sid, on }); continue; } // 全B: stop and wait (a mid-turn one at its stop)
        if (!dv || !dv.to) { stay(sid, s, on, dv); continue; }
        if (dv.to !== to && !memberCanServe(poolId, to, s, sid, now)) { stay(sid, s, on, null); continue; }
        if (restartInFlight(s, now)) continue; // its restart is already on the way
        restart.push(pack(sid, s));
      } else {
        const d = removalVerdict(poolId, on, s, sid, now);
        if (d && d.reason === 'removed-hold') { const h = holdRemoved(poolId, sid, s, on, d, now); if (h.held || h.deferred) out.held.push({ sid, on, to: h.to, deferred: h.deferred }); else out.stayed.push({ sid, on }); continue; } // 全B: stop and wait (a mid-turn one at its stop)
        if (!d || !d.to) { stay(sid, s, on, d); continue; }
        to = d.to;
        try { accounts.ensureSessionPoolLink(poolId, sid, to, { why }); } catch (e) { console.warn(`[pool] removed-member evict ${poolId}/${sid} failed:`, e.message); stay(sid, s, on, null); continue; }
        _poolSwitchAt.set(poolId + ':' + sid, now); // the dwell belt sees this move like any other
        for (const k of [poolId + ':' + sid, poolId + ':' + sid + ':soft']) _warmHoldLogAt.delete(k); // a re-point ends a deferral episode (LOW-3)
        // the link moved and the CLI re-reads it: the ledger follows from now (the
        // slot ledger row was written by ensureSessionPoolLink)
        try { recordUsageAttribution({ claudeSessionId: s.claudeSessionId || s.backendSessionId, accountId: poolId }); } catch { }
        if (!hot) restart.push(pack(sid, s));
      }
      out.moved.push({ sid, from: on, to });
      console.log(`[pool] removed-member evict ${poolId}/${sid}: ${on} → ${to}${held ? ' (holds its login — restarting it onto the pool default)' : ''}`);
      removedMemberNotice(poolId, sid, s, on, to, !!held || !hot);
    }
    if (restart.length) {
      const r = sendColdRestart(poolId, restart, now);
      out.restarted = r.sent ? r.affected.map((t) => t.serverId) : [];
      if (!r.sent && r.affected.length) console.log(`[pool] removed-member evict ${poolId}: no client connected to restart ${r.affected.length} conversation(s) — asked again on the next pool tick`);
    }
    global.__vsEvent?.('pool-member-removed', `${poolId}:${out.removed.length}:${out.moved.length}`);
    return out;
  } catch (e) { console.warn('[pool] removed-member evict failed:', e.message); return out; }
}
/** THE STALE-LINK SWEEP (the removed-member wall's boot half): a pool default, a
 *  per-session link or a held member that names an account the pool no longer
 *  lists — a removal made while the server was down, a link older than the
 *  removal — goes through memberRemoved. Every pool tick runs it first (auto or
 *  not: a removed member stops serving whatever the pool's placement mode). */
function sweepNonMemberLinks({ why = 'removed-from-pool' } = {}) { // ONE spelling of the act in the slot ledger, whoever sees the removal first (verify r1)
  const out = [];
  try {
    for (const a of accounts.list().accounts || []) {
      if (a.type !== 'pooled') continue;
      const membership = poolMembershipOf(a.id);
      if (!membership || !membership.length) continue; // a pool that lists nobody has nowhere to move anything
      const stale = new Set();
      const def = accounts.poolCurrent(a.id);
      if (def && !membership.includes(def)) stale.add(def);
      for (const [sid, s] of activeSessions) {
        if (s._accountId !== a.id || s.host) continue;
        let on = heldPoolMemberFor(s, a.id);
        if (!on && hasOwnPoolLink(a.id, sid)) { try { on = accounts.poolCurrentFor(a.id, sid); } catch { } }
        if (on && !membership.includes(on)) stale.add(on);
      }
      if (stale.size) out.push(memberRemoved(a.id, [...stale], { why }));
    }
  } catch (e) { console.warn('[pool] stale-link sweep failed:', e.message); }
  return out;
}
// A PROACTIVE move held because the conversation's prompt cache is warm
// (decidePoolSwitch's 'warm-cache'): once per (pool, conversation) per 10 min —
// the decision re-runs every cycle and a per-cycle line would be spam. The POOL
// DEFAULT's hold is ONE deferral whichever follower is warmest this cycle, so its
// key is the pool's (`poolId:default`, the verifier's LOW-B: keyed on the warmest
// sid, N rotating followers spoke N times per 10 min); the line still names the
// conversation holding it.
// The SOFT-exhaustion defer (decidePoolSwitch's 'warm-soft-defer') speaks through
// the same throttle under its own `:soft` key, in its own words: it is a move
// OWED at the conversation's first stop, not a proactive jump waiting for a cold
// cache. No user notice — the move itself posts the normal switch notice. Both
// lines name the target by its NAME (`wouldToName`, verifier INFO-a), the id
// only when the verdict carries none. A per-session RE-POINT clears that
// conversation's two keys (verifier LOW-3): the next deferral is a new episode
// and speaks at once, not after the old episode's 10-min floor.
function noteWarmHold(poolId, sid, d, now, scope = '', key = poolId + ':' + sid) {
  if (now - (_warmHoldLogAt.get(key) || 0) < 10 * 60e3) return;
  _warmHoldLogAt.set(key, now);
  if (d.reason === 'pin-hold') {
    console.log(`[pool] pin ${sid}: ${d.wouldToName || d.wouldTo} (pinned) can serve again — returns at its next stop (mid-turn now)${scope}`);
    return;
  }
  if (d.reason === 'priority-hold') {
    console.log(`[pool] priority ${sid}: ${d.wouldToName || d.wouldTo} (priority #${d.priorityRank ?? '?'}) can serve again — returns at its next stop (mid-turn now)${scope}`);
    return;
  }
  if (d.reason === 'warm-soft-defer') {
    const b = d.softBucket || {};
    console.log(`[pool] defer ${sid}: soft-exhausted (${b.label || '?'} ${b.remaining ?? '?'}% < hot ${b.hot ?? '?'}%) but mid-turn with a warm cache — moves at its first stop (to ${d.wouldToName || d.wouldTo})${scope}`);
    return;
  }
  console.log(`[pool] hold ${sid}: warm cache (last output ${d.agoSec}s ago < ttl ${d.ttlSec}s) — proactive move to ${d.wouldToName || d.wouldTo} deferred${scope}`);
}
/** ONE burn read per member per evaluation (the estimator's `burnFor`: learned
 *  rate × the trailing window's ledger + live cost). */
function projectionBurnMemo(now) {
  const memo = new Map();
  return (id) => {
    if (!memo.has(id)) { let b = {}; try { b = usageEstimator.burnFor(id, now) || {}; } catch { b = {}; } memo.set(id, b); }
    return memo.get(id);
  };
}
/** THE PROJECTION'S READ HALF (B-f69c ③): when does this member's burn carry a
 *  bucket of a LIVE local claude conversation's family across its switch line?
 *  The families are the conversations billed on the member RIGHT NOW (a pooled
 *  one through its validated credential slot, a direct one through its own
 *  account); the line is the hot bar when the member serves a hot auto pool,
 *  else the hard bar. `{inMs, label, line, pctPerMin, band, fam, burnPtPerMin}`
 *  (+ `resetsAt`, the crossing bucket's window — the auto-cli memory's key, quota r2)
 *  or null (no live conversation on it, no burn, nothing crosses). The auto-cli
 *  loop hands it to decideCliRefresh, whose PROJECTION rule asks the SAME fast
 *  rung (`refreshViaCliPanel`, the owner-approved exception) for a reading
 *  before the crossing — never a new vendor path, never a cadence; the pool then
 *  re-decides on that reading through the new-member wake. */
/** WHO BILLS WHERE, in ONE pass over the live conversations (prod-stall-202,
 *  2026-10-03): memberId → the local claude sessions billed on it RIGHT NOW, in
 *  activeSessions order. `projectionRereadFor` used to resolve every session's
 *  billing member inside its own loop, and the auto-cli tick asks it once per
 *  account — accounts × sessions slot resolutions a tick, each reading login
 *  files synchronously (6–15 s stalls on production). The tick builds this ONCE
 *  and hands it to every projectionRereadFor call of that tick; it is never kept
 *  past the tick, so no decision reads a stale slot. null = the pass threw (the
 *  per-member loop threw on every member then too ⇒ every projection is null). */
function projectionBillingIndex() {
  try {
    const out = new Map();
    for (const [, s] of activeSessions) {
      if (!cliUsageRung(s.backend || 'claude') || s.host || !s._accountId) continue;
      const a = accounts.get(s._accountId);
      const on = a && a.type === 'pooled' ? sessionBillingMember(s, a.id).id : s._accountId;
      if (!on) continue; // no member answers it — never equal to a member id
      if (!out.has(on)) out.set(on, []);
      out.get(on).push(s);
    }
    return out;
  } catch { return null; }
}
function projectionRereadFor(memberId, nowMs = Date.now(), billing = null) {
  try {
    if (!memberId) return null;
    const index = billing || projectionBillingIndex();
    if (!index) return null;
    const fams = new Set();
    for (const s of index.get(memberId) || []) fams.add(projectionFamilyFor(s, sessionModelFor(s)) || null);
    if (!fams.size) return null;
    const hot = accounts.poolsWithMember(memberId).some((p) => p.auto && p.hot && capsOf(p.backend).hotSwitch === 'verified'); // memberPoolsOf's answer read live with ONE login per pool — memberPoolsOf re-listed every login per account (prod-stall-202)
    const view = poolReadCache()(memberId);
    const burn = usageEstimator.burnFor(memberId, nowMs) || {};
    let best = null;
    for (const fam of fams) {
      const c = projectionCrossing(projectCacheForFamily(view, fam), burn, nowMs / 1000, { hot });
      if (c && (!best || c.inSec < best.inSec)) best = { ...c, fam };
    }
    if (!best) return null;
    const burnPtPerMin = Math.max(0, ...Object.values(burn).map((v) => (Number(v) || 0) * 100));
    return { inMs: best.inSec * 1000, label: best.label, line: best.line, pctPerMin: best.pctPerMin, band: best.band, fam: best.fam, resetsAt: best.resetsAt || 0, burnPtPerMin: Math.round(burnPtPerMin * 100) / 100 };
  } catch { return null; }
}
function maybePoolAutoSwitchForPool(poolId, { force = false } = {}) {
  try {
    if (!poolId) return;
    const a = accounts.get(poolId);
    if (!a || a.type !== 'pooled' || !a.auto) return;
    const now = Date.now();
    // `force` is the new-member wake (onMemberReadingFresh, and its login half
    // when the login's read did not answer) and NOTHING else:
    // this gate throttles per-RECORD kicks, and a member's first reading is not
    // a kick — it is the fact the whole decision was missing. The 180s dwell
    // belt below is deliberately NOT forced, so an evaluation forced here can
    // no more oscillate than any other one.
    if (!force && (now - (_poolAutoLast.get(poolId) || 0)) < 10000) return; // event-driven kicks need a tight gate; anti-flap = MIN_GAIN, not cadence
    const currentId = accounts.poolCurrent(poolId);
    if (!currentId) return;
    // a reset credit just re-opened this member and its post-reset reading is
    // still on the way (r3): the cache's spent mark is the WALL's, not a fact
    // about now — no decision off it until the reading (or 30 s) arrives
    if (resetCreditPendingFor(currentId, now)) return;
    // Capability-gated (P4 slice, src/backend-caps.js): hot only where a
    // live re-read is VERIFIED (codex: experimentally refuted, 2026-08-24 —
    // CODEX_HOME canonicalized at startup + tokens held in process memory);
    // sealed orders + plan-C per-session links only where those material
    // paths exist. The pool-level decide + cold-restart machinery below is
    // backend-agnostic.
    const poolCaps = capsOf(a.backend);
    const hot = !!a.hot && poolCaps.hotSwitch === 'verified';
    // ESTIMATED bucket view (B-fcff v2): the raw cache goes stale the moment
    // its session pauses — overlay dead-reckoned utilizations (anchor + rate ×
    // ledger cost since) so the decision sees NOW, not the last reading. The
    // estimator abstains per bucket when it has nothing better; those keep raw.
    const readCache = (id) => {
      let raw = null;
      try { raw = JSON.parse(fs.readFileSync(path.join(USAGE_CACHE_DIR, id + '.json'), 'utf-8')); } catch { }
      // ORG-MERGED identities keep TWO cache files (__global__ + the named
      // sub) and ground truth lands in whichever one the refresh targeted —
      // during the 2026-08-09 #2 exhaustion the ⟳ readings (Fable 34%→51%)
      // went to __global__.json while this decision read the sub's file
      // frozen at 01:23. Read through the IDENTITY GROUP: freshest file wins.
      try {
        for (const [, g] of usageIdentityGroupsCached()) {
          if (g.accountIds.includes(id) && g.cache && (g.cache.fetchedAt || 0) > (raw?.fetchedAt || 0)) { raw = g.cache; break; }
        }
      } catch { }
      try { return estOverlayCache(raw, usageEstimator.estimateFor(id, raw, now)); } catch { return raw; }
    };
    // proactive EDF tier only for HOT pools (re-point is free — no restart);
    // cold pools switch on exhaustion only (each switch restarts conversations).
    // Hot pools also treat est<10% as exhaustion (提前切 — switch BEFORE the
    // limit interrupts a long-running workflow; cold keeps 5%).
    // SEALED ORDERS push (design §Pool management, 2.300.0): after every
    // evaluation the holding device (device #0 — pools are local-only) gets
    // the pool's ranked member snapshot. It executes a LOCAL fallback switch
    // ONLY when it both sees a hard limit banner AND cannot reach this
    // server; executions are reported on reconnect and re-attributed below.
    // OBSERVE the rejection: hosts.device(null) throws while the local daemon
    // is down/upgrading, and an unobserved rejection is a process-level
    // unhandledRejection on every eval tick (the deviceBounded ② rule)
    if (poolCaps.sealedOrders) pushSealedOrders(poolId).catch((e) => { if (!_poolOrdersWarned) { _poolOrdersWarned = true; console.warn('[pool] sealed-orders push unavailable:', e.message); } });
    // ── Per-SESSION pass (plan C): sessions with their OWN link decide on a
    // FAMILY-PROJECTED view and re-point only their link — an opus session's
    // spent cap never evicts a fable session, and vice versa. Sessions whose
    // family is unknown project nothing (full view = legacy semantics).
    // DECISION list, not an act list (integration r2): auth-failed members are
    // not candidates (2.335.0), but a login-dead member must still REACH
    // decidePoolSwitch so its refusal can name it and prescribe the re-login.
    const members = switchCandidates(poolId);
    const readLogin = poolReadLogin(); // ONE login read per member for this whole tick (per-session pass + pool decision)
    const creditsIds = creditsMemberIds(members); // ONE raw-cache read per member for this whole tick (B-ad05)
    const burnOf = projectionBurnMemo(now); // ONE burn read per member for this whole tick (B-f69c ③)
    const membership = poolMembershipOf(poolId); // the removed-member wall (2026-09-28): a member the pool no longer LISTS is a hard wall for every decision below
    const priority = poolPriorityOf(a); // MANUAL PRIORITY (2026-09-28): the owner's order — null = automatic (EDF + the warm hold)
    for (const [sid, s2] of activeSessions) {
      if (!poolCaps.planC) break; // plan-C per-session links need the backend's material path
      if (capsOf(s2.backend || 'claude').hotSwitch === 'impossible') continue; // it holds its member for life — no per-session link
      if (s2._accountId !== poolId || s2.host) continue;
      let linkCur = null;
      try { linkCur = accounts.poolCurrentFor(poolId, sid); } catch { }
      const hasOwnLink = hasOwnPoolLink(poolId, sid);
      if (!hasOwnLink || !linkCur) continue;
      // Decide FROM the member whose credentials this session's CLI reads —
      // its token slot (2026-09-07, reversing B-2c9b plan B for DECISIONS):
      // deciding from the OTel-observed org made every cycle of the fire loop
      // "switch" to the member the link was already on ("re-point, same
      // target", 740 of them in the incident journal) and then fire again.
      // The observation still rides along in the log line as corroboration.
      const cm = sessionBillingMember(s2, poolId);
      const curFor = cm.id || linkCur;
      // ONE RULE FOR THE PROJECTION QUESTION (2026-09-13 r2) — while a
      // classifier reroute is standing this is null, so every bucket of every
      // member counts and the pool cannot move the conversation onto a member
      // whose cap for the model that is ANSWERING it is spent.
      const fam = projectionFamilyFor(s2, sessionModelFor(s2));
      const projected = (id) => projectCacheForFamily(readCache(id), fam);
      // THE WARM CACHE (2026-09-22, owner): a proactive move of a conversation
      // whose prompt cache is still warm cold-starts it — the next request
      // re-bills the whole context. `_lastPtyDataAt` is the last instant its CLI
      // produced output (at or after its last API request); a FORCED move is
      // never held (decidePoolSwitch applies this to 'edf' only).
      // …and `inTurn` (2026-09-22, the owner's first-stop rule): a SOFT-band move
      // of a conversation that is mid-turn with a warm cache waits for its first
      // stop (warm-soft-defer); the turn boundary re-decides it.
      const warm = { ...warmCache({ lastActivityMs: s2._lastPtyDataAt, nowMs: now, model: cacheModelFor(s2) }), inTurn: conversationInTurn({ isStreaming: s2._isStreaming, turnState: s2._turnState }) };
      // THE PROJECTION (B-f69c ③): a COLD conversation decides on the view its
      // members' own burn reaches PROJECTION_LEAD_SEC from now — the stretch no
      // fresh reading can cover — so it leaves a member BEFORE the line instead
      // of meeting it. A WARM one never does: a projection alone never moves a
      // warm conversation (the owner's warm-cache + first-stop rules judge only
      // real readings; the projection's other half, the auto-cli fast rung,
      // fetches the reading they judge — projectionRereadFor).
      const lead = warm.warm ? 0 : PROJECTION_LEAD_SEC;
      const viewFor = lead ? (id) => projectCacheAhead(projected(id), burnOf(id), now / 1000, lead) : projected;
      const pc = lead ? projectionCrossing(projected(curFor), burnOf(curFor), now / 1000, { hot }) : null;
      const early = pc && pc.inSec <= lead ? `projected: ${pc.label} reaches its ${pc.line}% line in ~${Math.max(1, Math.round(pc.inSec / 60))} min at ${pc.pctPerMin}%/min` : null;
      // THE CONVERSATION'S PIN (2026-09-28) — PRECEDENCE: pin > pool priority order > automatic.
      // A pinned conversation is decided by decidePinnedPlacement BEFORE (instead of) the pool
      // verdict: on its usable pin it STAYS (nothing automatic moves it); a pin that cannot serve
      // hands the move to today's automatic rules (the pin kept — `autoReason` is acted on exactly
      // like an unpinned verdict); a pin that can serve again takes it back at its first stop. The
      // pin is judged on the family view of NOW (`projected`), the automatic fallback on `viewFor`.
      // never pick a member that just answered THIS session with a limit
      // rejection (verdict-level twin of the same fact)
      const rejected = [...sessionWalledMembers(sid, now)];
      const pinRec = poolPinOf(s2, poolId);
      const dp = pinRec ? decidePinnedPlacement({ pin: pinRec.memberId, currentId: curFor, members, readCache: projected, autoReadCache: viewFor, nowSec: now / 1000, proactive: hot, hot, pessimism: darkTaintedAccounts(), exclude: rejected, readLogin, membership, priority, reserveFloorPct: reserveFloorPct(), overageIds: overageMemberIds(members), creditsIds, warm }) : null;
      const ds = dp ? (dp.reason === 'pin-exhausted' ? { ...dp, reason: dp.autoReason, pinExhausted: true } : dp) : decidePoolSwitch({ currentId: curFor, members, readCache: viewFor, nowSec: now / 1000, proactive: hot, hot, pessimism: darkTaintedAccounts(), exclude: rejected, readLogin, membership, priority, reserveFloorPct: reserveFloorPct(), overageIds: overageMemberIds(members), creditsIds, warm, explain: true });
      if (!ds || !ds.to) {
        // 全B (2026-09-28): the member it runs on left the pool and nobody can take it over ⇒ it stops after this turn
        // and waits (parked on the member usable soonest; armed if it was running) — the ONE act, holdRemoved
        if (ds && ds.reason === 'removed-hold') { holdRemoved(poolId, sid, s2, curFor, ds, now); continue; }
        if (ds && ds.reason === 'warm-cache') { noteWarmHold(poolId, sid, ds, now); continue; }
        if (ds && ds.reason === 'warm-soft-defer') { noteWarmHold(poolId, sid, ds, now, '', poolId + ':' + sid + ':soft'); continue; }
        // MANUAL PRIORITY: a higher-priority member is usable again but this one is
        // mid-turn — owed at its next stop (the stop re-decides, forced), never held longer
        if (ds && ds.reason === 'priority-hold') { noteWarmHold(poolId, sid, ds, now, '', poolId + ':' + sid + ':prio'); continue; }
        // THE PIN: on its usable pin the conversation stays (nothing to say); a return owed at
        // the first stop is journaled once per episode
        if (ds && ds.reason === 'pin') continue;
        if (ds && ds.reason === 'pin-hold') { noteWarmHold(poolId, sid, ds, now, '', poolId + ':' + sid + ':pin'); continue; }
        // PARKED ON CREDITS (B-ad05): this conversation's member serves past
        // its quota on pay-per-use billing — say so once per 6 h per (pool,
        // member); it is deliberately NOT in `noWay` (the member serves).
        if (ds && ds.reason === 'on-credits') noteCreditsParking(poolId, curFor, poolCreditsNotice(ds, { poolName: a.name, memberName: nameOf(curFor) }), now);
        // "there is nowhere for this conversation to go" is the state only the
        // USER can fix. The FACT is handed to auto-resume every time (it is
        // the ONLY source for the breaker's "no usable member left" clause —
        // a refusal reason does not imply it, and round 1 said it anyway);
        // the operator's line below stays throttled to once per 10min.
        // 'no-better' is DELIBERATELY ABSENT (2026-09-13): it means the
        // proactive scan found no candidate while the member this conversation
        // is already on is healthy. Feeding that to the breaker's "no usable
        // member left" clause is the false claim the storm made.
        const noWay = ds && (ds.reason === 'all-rejected' || ds.reason === 'no-members' || ds.reason === 'stuck' || ds.reason === 'all-logins-expired');
        if (noWay) try { getAutoResume()?.noteNoPoolTarget?.(sid, rejected.length, ds.reason); } catch { }
        if (ds && ds.reason === 'all-rejected' && now - (_noTargetLogAt.get(sid) || 0) > 10 * 60e3) {
          _noTargetLogAt.set(sid, now);
          console.log(`[pool] per-session ${poolId}/${sid}: nowhere to go — ${rejected.length} member(s) already rejected this conversation`);
          global.__vsEvent?.('pool-sess-all-rejected', `${sid}:${rejected.length}`);
        }
        continue;
      }
      // a pool that cannot re-point a running conversation (hot off) never RESTARTS one to return
      // it to its pin — the pin applies at its next restart/resume (the spawn chooser honours it)
      // (an ESCAPE off a member that cannot serve is no return of convenience — it moves and restarts
      // like every wall, verify r1)
      if (ds.reason === 'pin-return' && !a.hot && !ds.escape) continue;
      const dwellKey = poolId + ':' + sid;
      const lastS = _poolSwitchAt.get(dwellKey) || 0;
      // A DEAD LOGIN is hard death, so it is exempt from the dwell belt exactly
      // like a hard-exhausted target: every turn on that member fails, and the
      // belt exists to stop voluntary oscillation, not to delay an escape.
      // (Its `fromRemaining` is often null — quota says nothing about a login.)
      // …and a RETURN to the conversation's pin is a voluntary move like any other (verify r1): it was
      // exempt, and so was the move off a hard-dead pin — a pin whose reading wobbled across its bars
      // re-pointed the conversation on EVERY evaluation (12 of 12; automatic and priority: 1 of 12)
      if (ds.reason === 'spare-lane' && now - lastS < SPARE_DWELL_MS) continue; // a move of convenience: an hour after the last move (SPARE_DWELL_MS)
      if (now - lastS < 180000 && !ds.escape && ds.reason !== 'not-a-member' && ds.reason !== 'login-expired' && !(ds.fromRemaining != null && ds.fromRemaining < POOL_HARD_PCT)) continue; // a removed member is hard death too (2026-09-28); `escape` = a pinned conversation leaving a wall
      _poolSwitchAt.set(dwellKey, now);
      try {
        // (a move off a member the pool no longer lists is THE SAME ACT as memberRemoved's — one `why` in the slot ledger, verify r1)
        if (ds.reason === 'not-a-member' || ds.escape === 'not-a-member') accounts.ensureSessionPoolLink(poolId, sid, ds.to, { why: 'removed-from-pool' });
        else accounts.ensureSessionPoolLink(poolId, sid, ds.to, { why: 'per-session-switch' });
        _warmHoldLogAt.delete(poolId + ':' + sid); _warmHoldLogAt.delete(poolId + ':' + sid + ':soft'); // a re-point ends this conversation's deferral episode (LOW-3)
        _warmHoldLogAt.delete(poolId + ':' + sid + ':prio'); // …and its priority-return episode
        _warmHoldLogAt.delete(poolId + ':' + sid + ':pin'); // …and its pin-return episode
        try { recordUsageAttribution({ claudeSessionId: s2.claudeSessionId || s2.backendSessionId, accountId: poolId }); } catch { }
        const toName = accounts.get(ds.to)?.name || ds.to;
        // a same-target re-point (observed ≠ linked, the link was already on
        // the chosen member) is not a user-visible switch: journal + the
        // creds-mtime bump that makes the CLI re-read the link, no notice
        // SCRAPS (round-2 verifier): this conversation had nowhere else to go
        // and landed on a member whose OWN login dies in minutes. The move is
        // right (zero minutes was the alternative) but silence about it would
        // read as "it recovered", and it dies again shortly after.
        const sScraps = ds.toLoginNear
          ? ` — but ${toName}'s own login ${typeof ds.toLoginNear.msLeft === 'number' && ds.toLoginNear.msLeft > 0 ? `expires in ${loginAgeText(ds.toLoginNear.msLeft)}` : 'expires imminently'}; re-login it in Manage Agents now`
          : ds.toCredits
          ? ` — the last resort: ${toName} bills pay-per-use past its quota (usage credits)`
          : '';
        if (ds.toCredits) noteCreditsParking(poolId, ds.to, poolCreditsNotice({ toCredits: ds.toCredits, toRemaining: ds.toRemaining }, { poolName: a.name, memberName: toName }), now);
        if (ds.reason === 'not-a-member' && !ds.pinExhausted) removedMemberNotice(poolId, sid, s2, curFor, ds.to, !a.hot); // the removed-member words, whoever sees the removal first
        else if (ds.reason === 'pin-return') pinNotice(poolId, sid, s2, 'back', { member: ds.to }, !a.hot); // back on the pinned member at its stop
        else if (ds.pinExhausted && ds.to === ds.pinned) pinNotice(poolId, sid, s2, 'back', { member: ds.to }, !a.hot); // the automatic rules landed it ON its pin (the most headroom when nobody settles): it is back on it — never "X is out of quota — running on X" (verify r2)
        else if (ds.pinExhausted) pinNotice(poolId, sid, s2, ds.pinWhy, { member: ds.pinned, target: ds.to }, !a.hot); // the pin cannot serve: running on the automatic pick, the pin kept
        else if (ds.reason === 'priority-return') priorityReturnNotice(poolId, sid, s2, ds, !a.hot); // manual priority: back on the higher-ranked member at its stop
        else if (ds.reason === 'spare-lane' && ds.to !== linkCur) spareLaneNotice(poolId, sid, s2, ds, curFor); // B-8a65 S5: an idle conversation moved off a member rich in a cap it does not use
        else if (ds.to !== linkCur) serverNotice(`pool-sess-${sid}-${now}`, `Pool "${a.name}": conversation "${convName(s2, sid)}" moved to ${toName}${ds.priorityRank ? ` (priority #${ds.priorityRank})` : ''}${fam ? ` (its ${fam} quota${ds.fromRemaining != null ? ` ${early ? 'will be' : 'was'} at ${Math.round(ds.fromRemaining)}%${early ? ` within ${Math.round(lead / 60)} min` : ''}` : ''})` : ''}${early ? ` — moved early, ${early}` : ''}${a.hot ? '' : ' — restarting it'}${sScraps}`);
        console.log(`[pool] per-session switch ${poolId}/${sid}: ${curFor} → ${ds.to}${ds.to === linkCur ? ' (re-point, same target)' : ''} (fam=${fam || '?'}, from ${ds.fromRemaining}%${early ? `; ${early}` : ''})${ds.placedBy === 'priority' ? ` — ${ds.reason === 'priority-return' ? 'priority return' : 'priority'} #${ds.priorityRank ?? '-'}` : ''}${ds.reason === 'pin-return' ? ' — pin return (pinned)' : ds.pinExhausted && ds.to === ds.pinned ? ' — onto its pin (pinned)' : ds.pinExhausted ? ` — pin kept (${nameOf(ds.pinned)}: ${ds.pinWhy})` : ''}`);
        // a hot re-point does not move an idle limit-blocked session by itself
        // (c1206711: the pool switched back and the session stayed dead) —
        // an ARMED session gets its continue NOW. Hot only: a cold switch
        // restarts the conversation through the client instead.
        // …never for a REMOVED member's eviction (2026-09-28): a removal starts no turn, on
        // this path exactly as through memberRemoved — the arm's own timer re-decides it
        if (a.hot && ds.reason !== 'not-a-member') { try { getAutoResume()?.fireNow?.(sid, `账号池已切换到 ${toName}`); } catch { } }
        if (!a.hot) {
          sendColdRestart(poolId, [{ serverId: sid, backend: s2.backend || 'claude', backendSessionId: s2.claudeSessionId || s2.backendSessionId || null, cwd: s2.cwd || null, name: s2.name || null, host: s2.host || null }], now);
        }
      } catch (e) { console.warn('[pool] per-session re-point failed:', e.message); }
    }
    // THE WARM CACHE, pool-default form: the default moves EVERY conversation
    // without its own link at once (the `affected` set below), so its proactive
    // move waits while ANY of them is warm — the warmest one (largest ttl − ago
    // margin) holds it and names it in the journal.
    // NO SOFT HOLD AT THE DEFAULT (owner ruling 2026-09-22, design-reset-credits
    // §8 ③ — reversing 2.369.153's "first stop, pool-default form"): a follower
    // of the pool default (a conversation with NO link of its own) is LEGACY and
    // gets no compatibility. The default's SOFT-band move is made at once, like a
    // cold conversation's — a mid-turn follower is re-pointed mid-turn (its CLI
    // reads the pool's own link, so nothing per-session could keep it). Every
    // local claude session spawned since plan C carries its own link and keeps
    // the first-stop rule in the per-session pass above. What STAYS is 2.369.149's
    // PROACTIVE hold: an 'edf' jump still waits while any follower's cache is
    // warm (the warmest names it) — only the soft-band defer is gone, so `inTurn`
    // is deliberately not computed here.
    let defaultWarm = null, defaultWarmSid = null;
    for (const [sid, s] of activeSessions) {
      if (s._accountId !== poolId || hasOwnPoolLink(poolId, sid)) continue;
      const w = warmCache({ lastActivityMs: s._lastPtyDataAt, nowMs: now, model: cacheModelFor(s) });
      if (!w.warm) continue;
      if (!defaultWarm || w.ttlSec - w.agoSec > defaultWarm.ttlSec - defaultWarm.agoSec) { defaultWarm = w; defaultWarmSid = sid; }
    }
    // THE PROJECTION at the default (B-f69c ③): only while NO follower is warm —
    // the default moves every follower at once, so one warm follower keeps the
    // decision on the estimate of NOW (a projection alone never moves a warm
    // conversation).
    const defaultView = defaultWarm ? readCache : (id) => projectCacheAhead(readCache(id), burnOf(id), now / 1000, PROJECTION_LEAD_SEC);
    const d = decidePoolSwitch({ currentId, members, readCache: defaultView, nowSec: now / 1000, proactive: hot, hot, pessimism: darkTaintedAccounts(), readLogin, membership, priority, reserveFloorPct: reserveFloorPct(), overageIds: overageMemberIds(members), creditsIds, warm: defaultWarm, explain: true });
    if (!d) return;
    if (!d.to) {
      if (d.reason === 'removed-hold') {
        // 全B: the DEFAULT never keeps a removed member either — parked on the member usable soonest (its followers,
        // legacy, re-read it; nobody is armed or restarted by this)
        if (d.holdTo && d.holdTo !== currentId) { try { accounts.setPoolTarget(poolId, d.holdTo, { why: 'removed-from-pool' }); console.log(`[pool] removed-member hold ${poolId}/default: ${currentId} → ${d.holdTo} (nobody can take it over — parked)`); } catch (e) { console.warn('[pool] removed-member default park failed:', e.message); } }
        return;
      }
      if (d.reason === 'warm-cache') { noteWarmHold(poolId, defaultWarmSid, d, now, ' (pool default)', poolId + ':default'); return; }
      // PARKED ON CREDITS (B-ad05): not "stuck" — the current member serves,
      // billed pay-per-use past its quota. ONE notice per (pool, member) per 6 h.
      if (d.reason === 'on-credits') { noteCreditsParking(poolId, currentId, poolCreditsNotice(d, { poolName: a.name, memberName: nameOf(currentId) }), now); return; }
      // A pool sitting on a DEAD account with nowhere to go used to be
      // completely silent — the user found out by hitting a limit mid-turn
      // (real incident 2026-08-11). Say it, once per hour per pool: this is
      // the state where only the user can act (add a member, wait for a
      // reset, switch that conversation off the pool).
      // EVERY non-actionable outcome must speak, not just 'stuck' (2.313.0):
      // when the candidate gate drops every member the code returns through
      // 'no-members' instead, which was silent — the same "pool sits on a dead
      // account while the user finds out by hitting a limit" incident down a
      // different branch. `_sentNotices` is a per-BOOT permanent Set, so the
      // key must carry an hour bucket or a recurrence is never reported again.
      // …and 'no-better' says nothing here either: the current member is
      // healthy, so there is no state only the user can fix (2026-09-13).
      if (d.reason === 'stuck' || d.reason === 'no-members' || d.reason === 'no-settleable' || d.reason === 'all-logins-expired') {
        // The sentence itself is PURE (poolBlockedNotice in account-pool-auto):
        // it names WHICH buckets are dead ("every member is out of quota" is
        // wrong under the nested model and points at pay/wait-a-week when the
        // truth is "one model's weekly cap is spent while the 7-day budget
        // still has 40% left"), keeps each login-blocked member stating its
        // OWN fact, and — round-3 verifier — gives the CURRENT member's dead
        // login its own clause + the re-login remedy instead of rendering it
        // as a spent quota bucket with "wait for a window to reset".
        // It lives there, not here, so the suite can assert the STRING.
        serverNotice(`pool-blocked-${poolId}-${d.reason}-${Math.floor(now / 3600000)}`,
          poolBlockedNotice(d, { poolName: a.name, currentName: nameOf(currentId) }), { level: 'warn' });
      }
      return;
    }
    // DWELL belt (2.266.1, real oscillation report): every switch cold-starts
    // the running sessions' prompt caches on BOTH accounts — expensive. After
    // any switch, further switches wait 3min unless the current target is
    // HARD-dead (<5%, genuinely unusable — escaping immediately is cheaper
    // than idling on a dead account). The settle-bar in decidePoolSwitch is
    // the primary anti-oscillation; this is the belt.
    // MANUAL PRIORITY at the DEFAULT of a pool that cannot hot-switch: returning
    // the default RESTARTS every follower, so the return waits for them to stop
    // (never mid-turn — the owner's 17:22 rule); a follower's stop re-decides it
    if (d.reason === 'priority-return' && !hot) {
      let busy = null;
      for (const [sid, s] of activeSessions) {
        if (s._accountId !== poolId || s.host || hasOwnPoolLink(poolId, sid)) continue;
        if (conversationInTurn({ isStreaming: s._isStreaming, turnState: s._turnState })) { busy = sid; break; }
      }
      if (busy) { noteWarmHold(poolId, busy, { ...d, reason: 'priority-hold', wouldTo: d.to, wouldToName: d.toName }, now, ' (pool default)', poolId + ':default:prio'); return; }
    }
    const lastSwitch = _poolSwitchAt.get(poolId) || 0;
    if (now - lastSwitch < 180000 && d.reason !== 'not-a-member' && d.reason !== 'login-expired' && !(d.fromRemaining != null && d.fromRemaining < POOL_HARD_PCT)) return; // dead login = hard death, same exemption (and a removed member, 2026-09-28)
    _poolSwitchAt.set(poolId, now);
    _poolAutoLast.set(poolId, now);
    accounts.setPoolTarget(poolId, d.to, { why: d.reason === 'not-a-member' ? 'removed-from-pool' : 'pool-switch' });
    // Re-attribute every live session on this pool from this moment — the
    // ledger's by-time attribution resolves pool → current target at record
    // time, so a fresh record moves subsequent requests to the new account.
    const affected = [];
    for (const [sid, s] of activeSessions) {
      if (s._accountId !== poolId) continue;
      // plan C: a session with its own link didn't move with the default —
      // restarting it for the pool-level switch would be the old collateral
      if (hasOwnPoolLink(poolId, sid)) continue;
      // a HELD follower (a non-hot process — r3) keeps billing the member it
      // holds until the cold restart below lands; its ledger row must not move
      // to the new member ahead of the process (the restart's spawn records it)
      if (!heldPoolMemberFor(s, poolId)) { try { recordUsageAttribution({ claudeSessionId: s.claudeSessionId || s.backendSessionId, accountId: poolId }); } catch {} }
      affected.push({ serverId: sid, backend: s.backend || 'claude', backendSessionId: s.claudeSessionId || s.backendSessionId || null, cwd: s.cwd || null, name: s.name || null, host: s.host || null });
    }
    const fromPct = d.fromRemaining != null ? Math.round(d.fromRemaining) : null;
    // an EARLY move (B-f69c ③) says so: its `fromRemaining` is the PROJECTED number
    const dpc = defaultWarm ? null : projectionCrossing(readCache(currentId), burnOf(currentId), now / 1000, { hot });
    const dEarly = dpc && dpc.inSec <= PROJECTION_LEAD_SEC ? `projected: ${dpc.label} reaches its ${dpc.line}% line in ~${Math.max(1, Math.round(dpc.inSec / 60))} min at ${dpc.pctPerMin}%/min` : null;
    // SCRAPS (round-2 verifier): the only member left was itself minutes from
    // its login deadline. Moving beats staying on a dead member, but the user
    // has to hear that the reprieve is short — otherwise the pool "recovers"
    // and dies again with no explanation.
    const scraps = d.toLoginNear
      ? ` — but ${d.toName}'s own login ${typeof d.toLoginNear.msLeft === 'number' && d.toLoginNear.msLeft > 0 ? `expires in ${loginAgeText(d.toLoginNear.msLeft)}` : 'expires imminently'}; re-login it in Manage Agents now`
      : d.toCredits
      ? ` — the last resort: ${d.toName} bills pay-per-use past its quota (usage credits)`
      : '';
    if (d.toCredits) noteCreditsParking(poolId, d.to, poolCreditsNotice({ toCredits: d.toCredits, toRemaining: d.toRemaining }, { poolName: a.name, memberName: d.toName || d.to }), now);
    serverNotice(`pool-auto-${poolId}-${now}`, d.reason === 'edf'
      ? `Pool "${a.name}" switched to ${d.toName} — draining the member whose weekly quota resets soonest (use-it-or-lose-it)`
      : d.reason === 'priority-return'
      ? `Pool "${a.name}" is back on ${d.toName} (priority #${d.priorityRank ?? '?'}) — new conversations start there${hot ? '' : ' (restarting its conversations)'}`
      : d.reason === 'not-a-member'
      ? `Pool "${a.name}" switched to ${d.toName} — ${nameOf(currentId)} was removed from the pool${hot ? '' : ' (restarting its conversations)'}${scraps}`
      : d.reason === 'login-expired'
      ? `Pool "${a.name}" switched to ${d.toName} — ${nameOf(currentId)}'s ${(() => { try { const l = accounts.loginStateOf(currentId); return l ? loginWallPhrase(l) : 'login session expired'; } catch { return 'login session expired'; } })()}; re-login it in Manage Agents${hot ? '' : ' (restarting its conversations)'}${scraps}`
      : `Pool "${a.name}" auto-switched to ${d.toName}${d.priorityRank ? ` (priority #${d.priorityRank})` : ''} (previous account ${dEarly ? `will be down to ${fromPct}% within ${Math.round(PROJECTION_LEAD_SEC / 60)} min — moved early, ${dEarly}` : `down to ${fromPct}% remaining`})${hot ? '' : ' — restarting its conversations'}${scraps}`);
    console.log(`[pool] auto-switch ${poolId}: ${currentId} → ${d.to} (${d.reason}, from ${fromPct}% left${dEarly ? `; ${dEarly}` : ''}, hot=${hot}, affected=${affected.length})`);
    if (!hot && affected.length) {
      // ONE client only — every client acting would race duplicate restarts.
      sendColdRestart(poolId, affected, now);
    }
    // default-link sessions on a HOT switch: same c1206711 rule as the
    // per-session pass — an ARMED (limit-blocked, idle) session must be
    // nudged, a re-point alone never moves it.
    if (hot) for (const t of affected) { try { getAutoResume()?.fireNow?.(t.serverId, `账号池已切换到 ${d.toName || d.to}`); } catch { } }
  } catch (e) { console.warn('[pool] auto-switch check failed:', e.message); }
}
// Alias-tolerant model compare (server twin of the client's _modelMismatch):
// 'fable' vs 'claude-fable-5' is NOT a mismatch; [1m] suffixes ignored.
function modelsMatch(a, b) {
  if (!a || !b) return true;
  const core = (m) => String(m).toLowerCase().replace(/^claude-/, '').replace(/\s*\[1m\]$/, '').trim();
  const x = core(a), y = core(b);
  return x === y || x.startsWith(y) || y.startsWith(x);
}
// Per-conversation MODEL LOCK v2 (#6, semantics per the user's correction):
// fallback stays ALLOWED (the flagged turn completes on the fallback model),
// but at each turn end a locked session whose SERVED model drifted away is
// re-pinned via set_model — so every subsequent turn re-attempts the original
// model instead of staying degraded forever (switchModelsOnFlag switches the
// session's model persistently on a safety reroute; this undoes it per turn).
// The set_model echo ("Set model to …") lands in the chat as the visible trace.
function maybeRepinLockedModel(session) {
  try {
    if (!session._modelLocked || !session._lockedModel || !session.pty || session.mode !== 'chat') return;
    if (modelsMatch(session._servedModel, session._lockedModel)) return;
    const adapter = adapterRegistry.get(session.backend);
    if (!adapter?.formatSetModel) return;
    session.pty.write(adapter.formatSetModel(session._lockedModel) + '\n');
    global.__vsEvent?.('model-lock-repin', `${session._servedModel || '?'}->${session._lockedModel}`);
  } catch (e) { console.warn('[model-lock] repin failed:', e.message); }
}

function maybeStopOnFallback(session, id, from, to) {
  try {
    if (!harnessDeclares(session.backend, 'disableModelFallback') || harnessSetting(session.backend, 'disableModelFallback') !== true) return; // the session's harness declares the row, or there is nothing to stop on
    if (session._fallbackStopFired || session.mode !== 'chat' || !session.pty) return;
    const adapter = adapterRegistry.get(session.backend);
    if (!adapter?.formatInterrupt) return;
    session._fallbackStopFired = true;
    session.pty.write(adapter.formatInterrupt() + '\n');
    adapter.postInterrupt(session, id);
    // Belt-and-braces: also disarm fallback in this CLI for the rest of the
    // session, so the next turn stops at the refusal instead of re-routing.
    try { if (adapter.formatSetFallbackPolicy) session.pty.write(adapter.formatSetFallbackPolicy(true) + '\n'); } catch {}
    global.__vsEvent?.('fallback-auto-stop', `${from || '?'}->${to || '?'}`);
    broadcastToSession(session, id, {
      type: 'server-notice', key: `fallback-stop:${id}:${Date.now()}`, level: 2,
      text: `Model fallback detected (${from || '?'} → ${to || '?'}) — turn stopped because "Disable model fallback" is on. Send a new message to continue on your model.`,
    });
  } catch (e) { console.warn('[fallback-stop] failed:', e.message); }
}

// SyncStore imported from ./src/sync-store.js

  return {
    _vsuPending, usageAnchors, usageEstimator,
    armWorkflowUsageWatcher, darkSources, darkTaintedAccounts, kickPoolEval,
    markLimitBanner, maybePoolAutoSwitch, maybePoolAutoSwitchForPool, notePoolAuthFailure, noteTurnStopped,
    setConversationPin, poolPinOf, // THE CONVERSATION'S PIN (2026-09-28): the ONE writer (behind POST /api/accounts/:poolId/pin) and the reader
    gatherPlan, // "Move every conversation here now", judged per conversation before anything moves (verify r1)
    memberRemoved, decideDefaultTarget, fallbackDefaultTarget, removalTargetFor, sweepNonMemberLinks, holdRemoved, _removedHoldOwed, // THE REMOVED-MEMBER WALL (2026-09-28): the one entry point, the default's decision (updatePool's chooser), the stale-link sweep every pool tick runs first
    onMemberReadingFresh, onMemberLoginSuccess, readingForeignForWake, memberPoolsOf, autoCliReady, lastMemberReadAt, projectionRereadFor, projectionBillingIndex, // THE NEW-MEMBER WAKE (2026-09-08): the one edge every producer of a fresh reading takes, its login half, and the two facts the auto-cli loop asks before it spends a spawn
    _memberWakeAt, _loginReadAt, MEMBER_WAKE_FLOOR_MS, MEMBER_READING_FRESH_MS, LOGIN_READ_FLOOR_MS, // the wake's floors are WALL-CLOCK: a suite winds them back instead of sleeping through them (same seam as _poolAutoLast)
    maybeRepinLockedModel, maybeStopOnFallback, modelsMatch, noteServedModel, noteModelFallback, servedDefinesModel, projectionFamilyFor, rerouteAnnouncedBy, // the two stdout-fed model facts + the fallback predicate + the PROJECTION family + THE REROUTE THIS RECORD ANNOUNCES (2026-09-13: one implementation for the parse AND the device feed; r2: one rule for "which cap can refuse this turn"; r4: the fact is placed BEFORE its readers, at both feeds)
    poolChooserForModel, poolReadCache, probeUsageForAccountKey,
    noteSessionProduced, noteTurnEnd, noteWallSignal, beforeAutoResumeFire,
    noteStreamRecord, recordIsLate, liveFactVerdict, // a LATE record is not a live fact (lane-hot-switch): both feeds show every record to noteStreamRecord first
    laneIsProvisional, laneFromBanner, laneByEvidence, settleTurnLane, pendingLaneDeferrals, deferTurnLane, // the per-turn LANE decision (2026-09-13): a model-cap rejection arrives on the unscoped weekly lane (r3 exports `deferTurnLane` so its CAP — which drops a wall — can be driven; see the reachability note at LANE_DEFER_MAX)
 quotaVerdictFor, probeUsageViaSession, recordRateLimitEvent, recordCodexQuotaSignal, resolveUsageKey,
    refreshCodexForPerson, // lane reset-path R4: the usage menu's codex ⟳, answered at its round trip
    settleResetCreditByRead, settleResetCreditByReading, // verify r1: the unknown consume — a reading settles an unanswered attempt; the session path's read before a press
    resetCreditRung, resetCreditOffer, poolAlternativeFor, conversationWarmth, resetCreditPreview, consumeResetCreditFor, creditIdentityFor, heldPoolMemberFor, heldPoolUnknown, requestHeldRestart, sendColdRestart, claimColdRestarts, sweepResetCreditAsks, _resetCreditAsks, _resetCreditPending, _resetCreditTries, catchUpResetCreditFromBuffer, // verify r10: the stdout consumer's attach reads the wrapper's buffer file back for this session's open attempts // r2: the credit's identity (the member the process HOLDS), the per-identity attempt record (WALL-CLOCK floor — a suite winds `.at` back instead of sleeping, the _poolAutoLast seam); p2: the manual use (src/routes/reset-credit.js) — the preview the dialog shows and the one writer the auto rung shares; THE RESET-CREDIT RUNG (design-reset-credits §4): the verdict's consumer, the offer the wall/arm cards carry, and its two inputs
    probeQuotaForKey, quotaSourceFor, quotaBackendFor, // S4 caps-routed quota probe + the per-harness QuotaSignalSource lookup (functional seams for test-quota-source)
    overageState, readRawUsageCache, reserveFloorPct, overageMemberIds, creditsMemberIds, spendGuard, // the ONE overage reader, the two voluntary-move bars (D2/D3) and THE SPEND CEILING (§4.4c)
    apiDerivedWindow, noteApiDerivedWindow, apiWitnessEligibility, API_WITNESS_K, establishedWindows, inLagShadow, recentRepointRow, lastRepointRow, // B-855a: the two identity witnesses the panel probe is checked against (the API one a ring of K eligible readings) + the ⟳ control-rung eligibility test
    repairIdentityAnchors, // B-855a c2: the STANDING identity repair (boot + POST /api/usage/repair-identity)
    sessionBillingMember, wallKeyFor, rejectionSlotFor, readingSlotFor, memberLoginState, accountCredentialState, healthyPoolMembers, switchCandidates, poolReadLogin, slotTransitions, nearArmVeto, armCauseFor, fireIdentityFor, demoteWalledAccount, wallCount, sessionWalledMembers,
    _wallRing, _sessionWalls, WALL_RING_MS, SESSION_WALL_MS, // wall-ground-truth + token-slot + session-wall seams (test-auto-resume §11, test-auto-resume-loop)
    _poolAutoLast, _poolSwitchAt, // the eval gate (10s) + dwell belt (180s) are WALL-CLOCK: a suite winds them back instead of sleeping through them
    sessionModelFor, sweepUsageAnchors, usageCacheKeyFor,
    usageIdentityAccountIds, usageIdentityGroups, usageIdentityGroupsCached,
    writeUsageCacheForKey, clearSealedOrders, pushSealedOrders,
    estOverlayCache, predictCalib,
  };
}
module.exports = { create };
